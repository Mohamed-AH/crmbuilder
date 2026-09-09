/*
 * mail.test.mjs — the bring-your-own-key email adapter (lib/mail-send.js).
 *
 * Two halves, and the split is ssrf.test.mjs's for the same reason: DETECTION
 * is pure and needs no sockets, while the PROVIDER SHAPES have to be driven
 * against a capture server with the block list stood down, because a local
 * server is loopback and loopback is the first thing the guard refuses.
 *
 * What is actually under test here is §18's rule arriving at two more
 * providers: a resolved request is not a delivery. Postmark answers 200 with
 * an ErrorCode, Resend answers 2xx with an id or nothing, and reading either
 * one by its status code alone files a refusal as a sent message.
 *
 * Ports 9800-9850 — blocks are disjoint per file, see the table in §9.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
// Default imports off the CommonJS modules rather than named ones: named
// exports from CJS depend on cjs-module-lexer recognising the shape, and this
// works on every Node the package supports.
import mailer from '../lib/mail-send.js';
import guard from '../lib/safe-fetch.js';

const { detectProvider, providerName, sendMail, redactKey } = mailer;
const { emptyBlockList } = guard;

const RESEND_KEY = 're_A1b2C3d4E5f6G7h8';
const POSTMARK_KEY = '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d';

describe('the provider is read off the key, never asked for', () => {
  /*
   * One row per shape, so a loosened regex names the case it broke rather than
   * failing an opaque "detection" test. The negatives matter more than the
   * positives here: a key that matches nothing must be REFUSED at the save,
   * because that is the one failure the storage route can catch without ever
   * opening a socket.
   */
  const cases = [
    ['a Resend key', RESEND_KEY, 'resend'],
    ['a Resend key with dashes and underscores in it', 're_aB-3_xY9zQ1w2', 'resend'],
    ['a Postmark server token', POSTMARK_KEY, 'postmark'],
    ['a Postmark token in upper case', POSTMARK_KEY.toUpperCase(), 'postmark'],
    ['surrounding whitespace from a paste', `  ${RESEND_KEY}  `, 'resend'],
    ['nothing at all', '', null],
    ['a word', 'hunter2', null],
    ['the prefix on its own', 're_', null],
    ['a UUID missing a section', '1a2b3c4d-5e6f-7a8b-1e2f3a4b5c6d', null],
    ['a sentence containing a key', `my key is ${RESEND_KEY}`, null],
    ['a Slack webhook URL pasted into the wrong field', 'https://hooks.slack.com/services/T/B/x', null],
  ];
  for (const [label, key, expected] of cases) {
    test(`${label} → ${expected || 'no provider'}`, () => {
      assert.equal(detectProvider(key), expected);
    });
  }

  test('an unrecognised key is refused before any network call', async () => {
    const out = await sendMail({ key: 'hunter2', from: 'a@b.co', to: 'c@d.co', subject: 's', text: 't' }, {
      // Deliberately unreachable. If detection did not short-circuit, this
      // would report a connection failure instead of naming the real problem.
      base: 'http://127.0.0.1:1',
    });
    assert.equal(out.ok, false);
    assert.equal(out.code, 'no_provider');
    assert.match(out.error, /Resend/);
    assert.match(out.error, /Postmark/);
  });
});

describe('a provider error can never carry the key back', () => {
  /*
   * Neither service echoes a key into an error today, so this removes nothing
   * in practice — which is exactly why it is worth having. The message is
   * persisted on the meta doc (in every nightly artifact) and rendered on a
   * settings card, so the guarantee should be local and testable rather than
   * emergent from two vendors' current habits (§30's prototype-pollution
   * argument, in a new place).
   */
  test('the key is taken out of whatever the provider said', () => {
    assert.equal(redactKey(`key ${RESEND_KEY} was refused`, RESEND_KEY), 'key [key] was refused');
  });

  test('a message that mentions no key is left alone', () => {
    assert.equal(redactKey('sender signature not confirmed', RESEND_KEY), 'sender signature not confirmed');
  });
});

describe('the provider shapes, against a capture server', () => {
  // 9800-9850 (§9). A fresh port per boot, per §4 — rebinding one that was
  // listening a moment ago races, and on Windows it loses.
  const PORT = 9800 + Math.floor(Math.random() * 40);

  let server;
  let received = [];
  let reply = null;

  /*
   * ONE base for both providers, which is what the single MAIL_API_BASE seam
   * buys: their paths differ (/emails against /email), so this server can tell
   * them apart without a second switch to get wrong in production (§38).
   */
  const at = () => `http://127.0.0.1:${PORT}`;
  const OPEN = { base: at(), allowHttp: true, blockList: emptyBlockList() };

  const send = (key, over = {}) => sendMail(
    { key, from: 'Accounts <accounts@example.co.uk>', to: 'customer@example.com', subject: 'Invoice 41 is overdue', text: 'Please pay.' },
    { ...OPEN, ...over },
  );

  before(async () => {
    server = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        received.push({ url: req.url, headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') });
        const answer = reply || { status: 200, body: { id: 'msg_1', ErrorCode: 0, MessageID: 'pm_1' } };
        res.writeHead(answer.status, { 'Content-Type': 'application/json' });
        if (answer.chunked) {
          // Written in PIECES on purpose: §38 records that a big body handed
          // to res.end() in one go still emits 'end' after the destroy, so a
          // single-write version of an oversized-reply test proves nothing.
          let i = 0;
          const tick = setInterval(() => {
            if (i++ >= 40) { clearInterval(tick); return res.end(); }
            res.write(JSON.stringify({ filler: 'y'.repeat(1000) }));
          }, 2);
          return tick.unref();
        }
        return res.end(typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body));
      });
    });
    await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  });

  after(async () => { await new Promise((r) => server.close(r)); });

  test('Resend gets a bearer token, its own path, and its own body shape', async () => {
    received = []; reply = { status: 200, body: { id: 'msg_9' } };
    const out = await send(RESEND_KEY);
    assert.equal(out.ok, true, out.error);
    assert.equal(out.id, 'msg_9');
    assert.equal(received[0].url, '/emails');
    assert.equal(received[0].headers.authorization, `Bearer ${RESEND_KEY}`);
    assert.equal(received[0].headers['x-postmark-server-token'], undefined);
    assert.deepEqual(received[0].body, {
      from: 'Accounts <accounts@example.co.uk>',
      to: ['customer@example.com'],
      subject: 'Invoice 41 is overdue',
      text: 'Please pay.',
    });
  });

  test('Postmark gets its own header, its own path, and its own body shape', async () => {
    received = []; reply = { status: 200, body: { ErrorCode: 0, MessageID: 'pm_9' } };
    const out = await send(POSTMARK_KEY);
    assert.equal(out.ok, true, out.error);
    assert.equal(out.id, 'pm_9');
    assert.equal(received[0].url, '/email');
    assert.equal(received[0].headers['x-postmark-server-token'], POSTMARK_KEY);
    assert.equal(received[0].headers.authorization, undefined);
    assert.equal(received[0].body.From, 'Accounts <accounts@example.co.uk>');
    assert.equal(received[0].body.To, 'customer@example.com');
    assert.equal(received[0].body.TextBody, 'Please pay.');
  });

  /*
   * Pinned rather than left to the account default, and it is not decoration:
   * Postmark is strict about not letting marketing leak into the transactional
   * stream, which is precisely the line an invoice chaser must not cross. An
   * owner whose default stream has been changed would otherwise send a payment
   * reminder down a broadcast stream and collect an unsubscribe footer with it.
   */
  test('a chaser goes down the transactional stream, whatever the account default is', async () => {
    received = []; reply = { status: 200, body: { ErrorCode: 0, MessageID: 'pm_9' } };
    await send(POSTMARK_KEY);
    assert.equal(received[0].body.MessageStream, 'outbound');
  });

  /*
   * §18's rule, at a third provider. Postmark answers 200 with a non-zero
   * ErrorCode for a refusal, so reading the status alone files it as sent —
   * and an unpaid invoice then goes unchased with the screen saying it was
   * chased.
   */
  test('a 200 carrying a Postmark ErrorCode is a refusal, not a delivery', async () => {
    reply = { status: 200, body: { ErrorCode: 406, Message: 'You tried to send to a recipient that has been marked as inactive.' } };
    const out = await send(POSTMARK_KEY);
    assert.equal(out.ok, false);
    assert.equal(out.code, 'provider');
    assert.match(out.error, /marked as inactive/);
    assert.match(out.error, /^Postmark: /, 'the provider is named, so the owner knows where to go and look');
  });

  test('a 2xx from Resend with no id is a refusal too', async () => {
    reply = { status: 202, body: { message: 'domain is not verified' } };
    const out = await send(RESEND_KEY);
    assert.equal(out.ok, false);
    assert.equal(out.code, 'provider');
    assert.match(out.error, /domain is not verified/);
  });

  test('a refused key is named as a key problem, not a transport one', async () => {
    reply = { status: 401, body: { message: 'API key is invalid' } };
    const out = await send(RESEND_KEY);
    assert.equal(out.ok, false);
    assert.equal(out.code, 'auth');
    assert.match(out.error, /Resend refused that key/);
  });

  test('throttling says to wait rather than that something is broken', async () => {
    reply = { status: 429, body: { message: 'too many requests' } };
    const out = await send(POSTMARK_KEY);
    assert.equal(out.ok, false);
    assert.equal(out.code, 'rate');
    assert.match(out.error, /rate-limiting/);
  });

  /*
   * NEITHER a success nor a failure, and collapsing it into either one is a
   * lie in a direction that costs something: "sent" leaves an unpaid invoice
   * unchased, "failed" invites a second copy to a customer who already has the
   * first. §38 found the hang underneath exactly this state.
   */
  test('a 2xx whose answer we could not read says so, and says the mail may have gone', async () => {
    reply = { status: 200, chunked: true };
    const out = await send(RESEND_KEY);
    assert.equal(out.ok, false, 'an unreadable answer must not be reported as sent');
    assert.equal(out.code, 'unconfirmed');
    assert.match(out.error, /may have gone/);
    assert.match(out.error, /dashboard/);
  });

  test('a provider that says nothing useful still gets its status reported', async () => {
    reply = { status: 500, body: 'upstream on fire' };
    const out = await send(POSTMARK_KEY);
    assert.equal(out.ok, false);
    assert.equal(out.code, 'provider');
    assert.match(out.error, /HTTP 500/);
  });

  test('a key echoed back by the provider is removed before it can be stored', async () => {
    reply = { status: 422, body: { message: `the key ${RESEND_KEY} has no permission to send` } };
    const out = await send(RESEND_KEY);
    assert.equal(out.ok, false);
    assert.ok(!out.error.includes(RESEND_KEY), `the key survived into: ${out.error}`);
    assert.match(out.error, /\[key\]/);
  });

  test('providerName is what an owner is shown', () => {
    assert.equal(providerName('resend'), 'Resend');
    assert.equal(providerName('postmark'), 'Postmark');
  });
});
