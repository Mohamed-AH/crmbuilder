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
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Default imports off the CommonJS modules rather than named ones: named
// exports from CJS depend on cjs-module-lexer recognising the shape, and this
// works on every Node the package supports.
import mailer from '../lib/mail-send.js';
import guard from '../lib/safe-fetch.js';

const { detectProvider, providerName, sendMail, redactKey } = mailer;
const { emptyBlockList } = guard;

const RESEND_KEY = 're_A1b2C3d4E5f6G7h8';
const POSTMARK_KEY = '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d';
const ROOT = fileURLToPath(new URL('..', import.meta.url));

// The same cookie jar and request helper the other server-driven suites use.
// Kept local rather than shared: a helper imported across files is exactly
// the blast radius §9 names, and this one is four lines.
function jar() {
  const cookies = new Map();
  return {
    header() { return [...cookies].map(([k, v]) => `${k}=${v}`).join('; '); },
    absorb(res) {
      for (const raw of res.headers.getSetCookie?.() || []) {
        const [pair] = raw.split(';');
        const i = pair.indexOf('=');
        cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
    },
  };
}

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
  // 9800-9850 (§9), split three ways within the block: this capture server,
  // the send route's own capture server, and the app it boots. A fresh port
  // per boot, per §4 — rebinding one that was listening a moment ago races,
  // and on Windows it loses.
  const PORT = 9800 + Math.floor(Math.random() * 30);

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

/*
 * POST /api/org/mail/send — the route, driven against a real server with a
 * fake provider behind it.
 *
 * What this is really about is the RECIPIENT. Taking `to` from the body would
 * make an authenticated member of any workspace with a key into a relay that
 * can send arbitrary text, from a verified business domain, to any address on
 * the internet. The server resolves it off its own copy of the record instead,
 * which bounds a send to the addresses the workspace already holds — and
 * refuses loudly when the two copies disagree, because that is exactly the
 * state in which a demand for money must not go out.
 *
 * Ports 9830-9849 (§9).
 */
describe('sending a chaser', () => {
  const CAPTURE = 9830 + Math.floor(Math.random() * 10);
  const PORT = 9840 + Math.floor(Math.random() * 10);
  const BASE = `http://127.0.0.1:${PORT}`;
  const KEY = 're_ROUTETESTKEY9Z4Q';
  const FROM = 'Accounts <accounts@team.test>';

  let child = null;
  let dataDir = null;
  let serverLog = '';
  let capture = null;
  let captured = [];
  let reply = null;

  const owner = jar();
  const hand = jar();
  const looker = jar();
  let invoiceId = '';
  let contactId = '';
  let selfId = '';
  let orphanId = '';

  async function req(path, { cookies, method = 'GET', body } = {}) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', ...(cookies ? { Cookie: cookies.header() } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    if (cookies) cookies.absorb(res);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text };
  }

  before(async () => {
    capture = http.createServer((rq, rs) => {
      const chunks = [];
      rq.on('data', (c) => chunks.push(c));
      rq.on('end', () => {
        captured.push({ url: rq.url, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') });
        const answer = reply || { status: 200, body: { id: 'msg_ok' } };
        rs.writeHead(answer.status, { 'Content-Type': 'application/json' });
        rs.end(JSON.stringify(answer.body));
      });
    });
    await new Promise((r) => capture.listen(CAPTURE, '127.0.0.1', r));

    dataDir = await mkdtemp(join(tmpdir(), 'crmb-mailroute-'));
    child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        DATA_DIR: dataDir,
        ALLOW_DEV_LOGIN: '1',
        MONGODB_URI: '',
        SESSION_SECRET: 'mail-route-secret',
        SIGNUP_MODE: 'open',
        NODE_ENV: 'test',
        /*
         * ONE seam, and the guard relaxation hangs off this same variable
         * rather than a flag of its own — §38's rule, because two independent
         * switches is how the wrong one ends up set in production. Without it
         * this route is only testable against Resend itself, which is how §30
         * found the OAuth callback had gone years with no test at all.
         */
        MAIL_API_BASE: `http://127.0.0.1:${CAPTURE}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => { serverLog += d; });
    child.stderr.on('data', (d) => { serverLog += d; });

    const deadline = Date.now() + 20000;
    for (;;) {
      if (Date.now() > deadline) throw new Error(`server did not start:\n${serverLog}`);
      try { if ((await fetch(`${BASE}/healthz`, { signal: AbortSignal.timeout(1500) })).ok) break; } catch { /* not up */ }
      await new Promise((r) => setTimeout(r, 120));
    }

    const o = await req('/auth/dev', { method: 'POST', body: { email: 'send-owner@team.test' }, cookies: owner });
    const wsId = o.json.user.orgId;
    await req('/auth/dev', { method: 'POST', body: { email: 'send-hand@team.test' }, cookies: hand });
    const look = await req('/auth/dev', { method: 'POST', body: { email: 'send-look@team.test' }, cookies: looker });
    for (const [who, id] of [[hand, null], [looker, look.json.user.id]]) {
      const code = (await req('/api/org/invites', { method: 'POST', body: {}, cookies: owner })).json.invite.code;
      await req('/api/org/join', { method: 'POST', body: { code }, cookies: who });
      if (id) await req(`/api/org/members/${id}`, { method: 'PATCH', body: { role: 'viewer' }, cookies: owner });
    }

    /*
     * Two modules, because the relation walk is half the recipient rule: an
     * invoice does not usually carry an email, the customer does. The third
     * record carries its own address, which is the other branch.
     */
    invoiceId = `${wsId}-inv`;
    contactId = `${wsId}-con`;
    selfId = `${wsId}-self`;
    orphanId = `${wsId}-orphan`;
    const now = Date.now();
    await req('/api/sync', {
      method: 'POST',
      cookies: owner,
      body: {
        since: 0,
        modules: [
          {
            id: `${wsId}-mc`,
            updatedAt: now,
            doc: { id: `${wsId}-mc`, name: 'Contacts', icon: 'users', color: '#1570ef', fields: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'email', label: 'Email', type: 'email' }] },
          },
          {
            // No email field and no relation, so nothing on it can be
            // resolved to an address. That state has to be BUILT: every other
            // module here can reach one, so "no recipient" would otherwise be
            // untested and the branch would be the one nobody drove.
            id: `${wsId}-mn`,
            updatedAt: now,
            doc: { id: `${wsId}-mn`, name: 'Assets', icon: 'package', color: '#7a5af8', fields: [{ key: 'name', label: 'Asset', type: 'text' }, { key: 'due', label: 'Service due', type: 'date', showInList: true }] },
          },
          {
            id: `${wsId}-mi`,
            updatedAt: now,
            doc: {
              id: `${wsId}-mi`,
              name: 'Invoices',
              icon: 'receipt',
              color: '#d92d20',
              fields: [
                { key: 'name', label: 'Reference', type: 'text' },
                { key: 'due', label: 'Due', type: 'date', showInList: true },
                { key: 'client', label: 'Client', type: 'relation', relatedModule: `${wsId}-mc` },
              ],
            },
          },
        ],
        records: [
          { id: contactId, updatedAt: now, doc: { id: contactId, moduleId: `${wsId}-mc`, data: { name: 'Priya Raman', email: 'priya@client.test' } } },
          { id: invoiceId, updatedAt: now, doc: { id: invoiceId, moduleId: `${wsId}-mi`, data: { name: 'INV-41', due: '2020-01-01', client: contactId } } },
          { id: selfId, updatedAt: now, doc: { id: selfId, moduleId: `${wsId}-mc`, data: { name: 'Direct Dan', email: 'dan@client.test' } } },
          { id: orphanId, updatedAt: now, doc: { id: orphanId, moduleId: `${wsId}-mn`, data: { name: 'Forklift', due: '2020-01-01' } } },
        ],
      },
    });
  });

  after(async () => {
    if (child) { const dead = new Promise((r) => child.once('exit', r)); child.kill(); await dead; }
    if (capture) await new Promise((r) => capture.close(r));
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  const send = (body, cookies = owner) => req('/api/org/mail/send', { method: 'POST', body, cookies });
  const chase = { recordId: '', to: 'priya@client.test', subject: 'INV-41 is overdue', text: 'Hello,\r\n\r\nPlease pay.' };

  /*
   * Ordered first, because every test below needs a key configured — and
   * because a workspace WITHOUT one has to be told the difference between
   * "nothing set up" and "set up but not connected", which is only observable
   * before one exists.
   */
  test('a workspace with no provider is told so, rather than failing obscurely', async () => {
    const { status, json } = await send({ ...chase, recordId: invoiceId });
    assert.equal(status, 502);
    assert.equal(json.code, 'not_configured');
    assert.match(json.error, /No email provider/);
  });

  test('once a key is saved, the provider gets the message', async () => {
    const saved = await req('/api/org/mail', { method: 'PUT', body: { key: KEY, from: FROM }, cookies: owner });
    assert.equal(saved.status, 200);

    captured = []; reply = { status: 200, body: { id: 'msg_41' } };
    const { status, json } = await send({ ...chase, recordId: invoiceId });
    assert.equal(status, 200, json && json.error);
    assert.equal(json.to, 'priya@client.test', 'resolved through the relation on the invoice');
    assert.equal(captured.length, 1);
    assert.equal(captured[0].body.from, FROM);
    assert.deepEqual(captured[0].body.to, ['priya@client.test']);
    assert.equal(captured[0].body.subject, 'INV-41 is overdue');
    assert.match(captured[0].body.text, /Please pay/);
  });

  test('a real send is what marks the key verified', async () => {
    // Nothing before this point could set it: the save makes no outbound call
    // at all, deliberately (§52), so `verified` is the one thing on that card
    // which only a send can produce.
    const { json } = await req('/api/org/mail', { cookies: owner });
    assert.equal(json.mail.verified, true);
    assert.equal(json.mail.lastError, '');
  });

  test('an address on the record itself is used without a relation', async () => {
    captured = []; reply = { status: 200, body: { id: 'msg_dan' } };
    const { status, json } = await send({ recordId: selfId, to: 'dan@client.test', subject: 'Hi', text: 'Hello.' });
    assert.equal(status, 200, json && json.error);
    assert.deepEqual(captured[0].body.to, ['dan@client.test']);
  });

  /*
   * THE ASSERTION THIS ROUTE EXISTS FOR. If `to` were taken from the body, a
   * member of any workspace holding a key could mail arbitrary text from a
   * verified business domain to any address in the world.
   */
  test('the recipient comes from the record, never from the body', async () => {
    captured = []; reply = { status: 200, body: { id: 'msg_x' } };
    const { status, json } = await send({ ...chase, recordId: invoiceId, to: 'attacker@elsewhere.test' });
    assert.equal(status, 409, 'a claimed address that is not on the record must be refused');
    assert.match(json.error, /has changed since the draft/);
    assert.equal(json.resolved, 'priya@client.test');
    assert.equal(captured.length, 0, 'nothing may be sent while the two copies disagree');
  });

  test('a record the caller has no business with is not found', async () => {
    const outsider = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'send-outsider@other.test' }, cookies: outsider });
    captured = [];
    const { status } = await send({ ...chase, recordId: invoiceId }, outsider);
    // 404 rather than 403: the workspace is never a parameter, so this is not
    // a permission answer — the row genuinely is not in the caller's own
    // workspace, and a different code would confirm it exists somewhere (§5).
    assert.equal(status, 404);
    assert.equal(captured.length, 0);
  });

  test('a record with nowhere to send to is refused before the provider is dialled', async () => {
    captured = [];
    const { status, json } = await send({ ...chase, recordId: orphanId, to: '' });
    assert.equal(status, 422);
    assert.match(json.error, /no email address/);
    assert.equal(captured.length, 0, 'the provider must not be dialled for a message with no recipient');
  });

  test('a contributor cannot send, and a viewer cannot either', async () => {
    captured = [];
    for (const [role, cookies] of [['viewer', looker]]) {
      const { status } = await send({ ...chase, recordId: invoiceId }, cookies);
      assert.equal(status, 403, `${role} was allowed to send`);
    }
    assert.equal(captured.length, 0);
  });

  test('a member may send — this is one rung above editing records', async () => {
    captured = []; reply = { status: 200, body: { id: 'msg_member' } };
    const { status } = await send({ ...chase, recordId: invoiceId }, hand);
    assert.equal(status, 200);
    assert.equal(captured.length, 1);
  });

  /*
   * §18's rule, all the way through the route: the provider answered, and it
   * refused. Reporting that as sent leaves an unpaid invoice unchased with the
   * screen saying otherwise.
   */
  test("a provider's refusal reaches the caller in the provider's own words", async () => {
    reply = { status: 403, body: { message: 'the domain team.test is not verified' } };
    const { status, json } = await send({ ...chase, recordId: invoiceId });
    assert.equal(status, 502);
    assert.match(json.error, /not verified/);
    assert.match(json.error, /Resend/);
  });

  test('and it is recorded where the settings card shows it', async () => {
    const { json } = await req('/api/org/mail', { cookies: owner });
    assert.match(json.mail.lastError, /not verified/);
    assert.ok(json.mail.lastErrorAt > 0);
  });

  test('the key never appears in any answer this route gives', async () => {
    reply = { status: 200, body: { id: 'msg_leak' } };
    const sent = await send({ ...chase, recordId: invoiceId });
    const conf = await req('/api/org/mail', { cookies: owner });
    // The whole body, not a named field: a field-by-field check only covers
    // the fields somebody thought of (§38).
    assert.ok(!sent.text.includes(KEY));
    assert.ok(!conf.text.includes(KEY));
    assert.ok(!serverLog.includes(KEY), 'the key reached the server log');
  });

  /*
   * The log is written by the SERVER for a provider send, and only for one it
   * watched succeed. The draft half is written by the client, because nothing
   * here ever sees a mailto: open — so the two claims stay apart: `sent` is a
   * fact the server established, `drafted` is what a browser reported.
   */
  test('a successful send is logged on the record, by the server', async () => {
    reply = { status: 200, body: { id: 'msg_logged' } };
    const before = Date.now();
    const { status } = await send({ ...chase, recordId: invoiceId });
    assert.equal(status, 200);

    const pulled = await req('/api/sync?since=0', { cookies: owner });
    const row = pulled.json.records.find((r) => r.id === invoiceId);
    const entries = row.doc.chases || [];
    assert.ok(entries.length >= 1, 'the send left no trace on the record');
    const last = entries[0];
    assert.equal(last.via, 'sent');
    assert.equal(last.to, 'priya@client.test');
    // The DISPLAY name, which is what a colleague reads — /auth/dev derives
    // one from the address, the same way a Google sign-in carries one.
    assert.equal(last.byName, 'send-owner');
    assert.ok(last.at >= before);
    /*
     * `updatedAt` has to move, and this is the assertion that says so. The
     * client's mergeChanges skips any incoming row whose clock is not newer
     * than its local one, so a row that moved only its serverAt would reach
     * every device and be ignored by all of them — §26's stamp trap, arrived
     * at from the server's side.
     */
    assert.ok(row.updatedAt >= before, 'a colleague would never see this land');
  });

  test('a REFUSED send logs nothing', async () => {
    const pulled0 = await req('/api/sync?since=0', { cookies: owner });
    const wasCount = (pulled0.json.records.find((r) => r.id === invoiceId).doc.chases || []).length;

    reply = { status: 403, body: { message: 'the domain team.test is not verified' } };
    assert.equal((await send({ ...chase, recordId: invoiceId })).status, 502);

    const pulled = await req('/api/sync?since=0', { cookies: owner });
    const now = (pulled.json.records.find((r) => r.id === invoiceId).doc.chases || []).length;
    // Otherwise the log says a reminder went out when the provider refused it,
    // and the next person leaves an unpaid invoice alone on the strength of it.
    assert.equal(now, wasCount, 'a refusal was recorded as a send');
  });

  test('a member sending is logged under the member, not the owner', async () => {
    reply = { status: 200, body: { id: 'msg_member_log' } };
    assert.equal((await send({ ...chase, recordId: invoiceId }, hand)).status, 200);

    const pulled = await req('/api/sync?since=0', { cookies: owner });
    const entries = pulled.json.records.find((r) => r.id === invoiceId).doc.chases;
    assert.equal(entries[0].byName, 'send-hand',
      'the whole point is telling a colleague who already chased this');
  });

  test('an empty message is refused, and a huge one is too', async () => {
    assert.equal((await send({ recordId: invoiceId, subject: '', text: 'x' })).status, 400);
    assert.equal((await send({ recordId: invoiceId, subject: 'x', text: 'y'.repeat(4001) })).status, 413);
  });
});
