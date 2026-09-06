/*
 * ssrf.test.mjs — the guard on a webhook whose destination a CUSTOMER chose.
 *
 * THE SUITE IS SPLIT IN TWO ON PURPOSE, and it is the same lesson §30 recorded
 * about the feedback webhook's capture test pointing at 127.0.0.1:
 *
 *   - CLASSIFICATION is tested with no sockets at all. Every blocked range,
 *     one assertion per row, so a dropped CIDR names itself.
 *   - The TRANSPORT is tested against a local capture server with the block
 *     list deliberately stood down (emptyBlockList), because a local server is
 *     loopback and loopback is the first thing the guard refuses.
 *
 * Test them together and you must either weaken the guard so the capture
 * server is reachable, or never exercise redirects, timeouts and pinning at
 * all. Neither is acceptable, so they are two halves that never meet.
 *
 * Ports 9600-9650 — blocks are disjoint per file, see the table in §9.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
// A default import off the CommonJS module rather than named imports: named
// exports from CJS depend on cjs-module-lexer recognising the shape, and this
// works on every Node the package supports.
import guard from '../lib/safe-fetch.js';

const {
  defaultBlockList, emptyBlockList, normaliseAddress, isBlocked,
  pinnedLookup, resolveAndPin, sendGuarded, maskUrl, hostOf,
} = guard;

const BLOCK = defaultBlockList();

describe('the block list refuses everything a customer must not reach', () => {
  /*
   * One row per range, named, so a CIDR removed from BLOCKED_V4 fails a test
   * that says which one rather than a single opaque "blocked addresses" case.
   * The metadata endpoint gets its own line because it is the reason
   * link-local is on the list at all.
   */
  const blocked = [
    ['loopback', '127.0.0.1'],
    ['loopback, high in the range', '127.255.255.254'],
    ['"this network", which is localhost on Linux', '0.0.0.0'],
    ['RFC1918 10/8', '10.0.0.5'],
    ['RFC1918 172.16/12', '172.20.10.1'],
    ['RFC1918 192.168/16', '192.168.1.1'],
    ['the cloud metadata endpoint', '169.254.169.254'],
    ['link-local generally', '169.254.0.1'],
    ['CGNAT shared space', '100.64.0.1'],
    ['IETF protocol assignments', '192.0.0.1'],
    ['TEST-NET-1', '192.0.2.5'],
    ['benchmarking range', '198.18.0.1'],
    ['multicast', '224.0.0.1'],
    ['reserved', '240.0.0.1'],
    ['the broadcast address', '255.255.255.255'],
    ['IPv6 loopback', '::1'],
    ['the IPv6 unspecified address', '::'],
    ['IPv6 unique local', 'fd00::1'],
    ['IPv6 link-local', 'fe80::1'],
    ['IPv6 multicast', 'ff02::1'],
    ['NAT64, a v4 destination in v6 clothing', '64:ff9b::7f00:1'],
  ];

  for (const [name, addr] of blocked) {
    test(`blocks ${name} (${addr})`, () => {
      assert.equal(isBlocked(addr, BLOCK), true, `${addr} was allowed through`);
    });
  }

  /*
   * The assertion that stops this shipping as "block everything", which would
   * pass every test above and deliver no webhooks at all.
   */
  test('lets an ordinary public address through', () => {
    for (const addr of ['1.1.1.1', '93.184.216.34', '149.154.167.220', '2606:4700::1111']) {
      assert.equal(isBlocked(addr, BLOCK), false, `${addr} should be reachable`);
    }
  });

  test('anything it cannot parse as an address is blocked, not waved through', () => {
    for (const junk of ['', null, undefined, 'not-an-address', '999.1.1.1', {}]) {
      assert.equal(isBlocked(junk, BLOCK), true, `${JSON.stringify(junk)} should fail closed`);
    }
  });
});

describe('an IPv4 address in a v6 wrapper is still that address', () => {
  /*
   * ::ffff:127.0.0.1 is loopback wearing a v6 hat. A block list checked only
   * under the v6 family waves it through, so the unwrapping has to happen
   * before the check rather than being left to net.BlockList.
   */
  test('the dotted form unwraps to v4', () => {
    assert.deepEqual(normaliseAddress('::ffff:127.0.0.1'), { address: '127.0.0.1', family: 4 });
  });

  test('the hex form unwraps too, which is the spelling that gets missed', () => {
    assert.deepEqual(normaliseAddress('::ffff:7f00:1'), { address: '127.0.0.1', family: 4 });
    assert.deepEqual(normaliseAddress('::ffff:a9fe:a9fe'), { address: '169.254.169.254', family: 4 });
  });

  test('the deprecated v4-compatible form unwraps', () => {
    assert.deepEqual(normaliseAddress('::10.0.0.5'), { address: '10.0.0.5', family: 4 });
  });

  test('and each of those is then blocked', () => {
    for (const addr of ['::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '::ffff:192.168.0.1', '::10.0.0.5']) {
      assert.equal(isBlocked(addr, BLOCK), true, `${addr} was allowed through`);
    }
  });

  test('a real public v6 address is untouched by the unwrapping', () => {
    assert.deepEqual(normaliseAddress('2606:4700::1111'), { address: '2606:4700::1111', family: 6 });
  });
});

describe('resolveAndPin checks every answer, not the first', () => {
  const fake = (records) => async () => records;

  test('a public host resolves and is pinned', async () => {
    const out = await resolveAndPin('hooks.example.com', {
      blockList: BLOCK,
      lookup: fake([{ address: '93.184.216.34', family: 4 }]),
    });
    assert.equal(out.error, undefined);
    assert.deepEqual(out.records, [{ address: '93.184.216.34', family: 4 }]);
  });

  /*
   * THE ATTACK. A split-horizon host answers with one public record to satisfy
   * a check and one private record for the socket to use. Checking records[0]
   * passes this happily, which is why { all: true } is not an optimisation.
   */
  test('a host answering with one public and one private address is refused', async () => {
    const out = await resolveAndPin('rebind.example.com', {
      blockList: BLOCK,
      lookup: fake([
        { address: '93.184.216.34', family: 4 },
        { address: '169.254.169.254', family: 4 },
      ]),
    });
    assert.match(out.error || '', /not reachable from here/);
    assert.match(out.error || '', /169\.254\.169\.254/);
    assert.equal(out.records, undefined);
  });

  test('a private address in the second position of a v6 answer is caught too', async () => {
    const out = await resolveAndPin('rebind6.example.com', {
      blockList: BLOCK,
      lookup: fake([
        { address: '2606:4700::1111', family: 6 },
        { address: '::ffff:127.0.0.1', family: 6 },
      ]),
    });
    assert.match(out.error || '', /not reachable from here/);
  });

  test('a host that does not resolve is an error, never an empty pass', async () => {
    const boom = async () => { throw Object.assign(new Error('nope'), { code: 'ENOTFOUND' }); };
    const out = await resolveAndPin('nowhere.invalid', { blockList: BLOCK, lookup: boom });
    assert.match(out.error || '', /could not resolve/);

    const empty = await resolveAndPin('nothing.invalid', { blockList: BLOCK, lookup: fake([]) });
    assert.match(empty.error || '', /no addresses/);
  });
});

describe('the pinned lookup answers both of the shapes Node uses', () => {
  /*
   * Node calls a custom lookup either as (host, opts, cb) -> cb(err, addr, fam)
   * or, with opts.all set, cb(err, [{address, family}]). Which one depends on
   * the agent, not on us. Handling one shape works locally and fails on the
   * other path with an error that names nothing useful.
   */
  const records = [{ address: '203.0.113.9', family: 4 }];

  test('the single-address shape', (t, done) => {
    pinnedLookup(records)('ignored.example', {}, (err, address, family) => {
      assert.equal(err, null);
      assert.equal(address, '203.0.113.9');
      assert.equal(family, 4);
      done();
    });
  });

  test('the all:true shape', (t, done) => {
    pinnedLookup(records)('ignored.example', { all: true }, (err, list) => {
      assert.equal(err, null);
      assert.deepEqual(list, [{ address: '203.0.113.9', family: 4 }]);
      done();
    });
  });

  test('the two-argument shape, where options is the callback', (t, done) => {
    pinnedLookup(records)('ignored.example', (err, address) => {
      assert.equal(err, null);
      assert.equal(address, '203.0.113.9');
      done();
    });
  });
});

describe('sendGuarded refuses before it opens a socket', () => {
  test('anything that is not a URL', async () => {
    const out = await sendGuarded('not a url', {});
    assert.equal(out.ok, false);
    assert.match(out.error, /not a valid URL/);
  });

  test('http, because the URL carries a token', async () => {
    const out = await sendGuarded('http://hooks.example.com/x', {});
    assert.equal(out.ok, false);
    assert.match(out.error, /https/);
  });

  test('a private destination, by name or by number', async () => {
    for (const url of [
      'https://127.0.0.1/hook',
      // Bracketed, which is how a URL spells an IPv6 literal. url.hostname
      // keeps the brackets, so without stripping them this resolves to nothing
      // and is classified "unresolvable" rather than "blocked" — which the
      // save path treats as a warning rather than a refusal.
      'https://[::1]/hook',
      'https://[fd00::1]/hook',
      'https://[::ffff:127.0.0.1]/hook',
      'https://169.254.169.254/latest/meta-data/',
      'https://10.0.0.5/hook',
      'https://localhost/hook',
    ]) {
      const out = await sendGuarded(url, {});
      assert.equal(out.ok, false, `${url} was not refused`);
      assert.match(out.error, /not reachable from here|could not resolve/);
    }
  });

  /*
   * The CODE matters, not only the refusal, and this is the assertion the
   * bracket-stripping exists for.
   *
   * The save path in server.js refuses `blocked` and merely warns about
   * `unresolved` — a URL that did not answer just now is a property of the
   * moment, not of the URL. Without stripping the brackets an IPv6 literal
   * resolves to nothing and is classified `unresolved`, so https://[fd00::1]/x
   * was stored as a webhook rather than rejected. Asserting only `ok === false`
   * passes on the unfixed code.
   */
  test('an IPv6 literal is classified blocked, not merely unresolvable', async () => {
    for (const url of ['https://[::1]/hook', 'https://[fd00::1]/hook', 'https://[::ffff:169.254.169.254]/hook']) {
      const out = await sendGuarded(url, {});
      assert.equal(out.code, 'blocked', `${url} was classified ${out.code}`);
    }
  });

  /*
   * The legacy spellings of 127.0.0.1. This is DOCUMENTATION rather than proof
   * of the mechanism: we never parse the hostname, so these are blocked by the
   * same code path as the dotted form — whatever getaddrinfo makes of them.
   *
   * Written to assert only refusal, not the reason, because the resolver's
   * treatment of these is a platform property: glibc, musl and Windows do not
   * have to agree, and a host that fails to resolve is refused for a different
   * (equally correct) reason. Asserting the reason would make this fail on
   * somebody's machine for something that is not a defect (§9).
   */
  test('the legacy encodings of loopback are refused however they resolve', async () => {
    for (const host of ['0177.0.0.1', '2130706433', '0x7f.0.0.1']) {
      const out = await sendGuarded(`https://${host}/hook`, {});
      assert.equal(out.ok, false, `${host} was not refused`);
    }
  });
});

/*
 * THE TRANSPORT HALF. Block list stood down; a real server on loopback.
 */
describe('the transport', () => {
  // 9600-9650 (§9). A fresh port per boot, per §4 — rebinding one that was
  // listening a moment ago races, and on Windows it loses.
  const PORT = 9600 + Math.floor(Math.random() * 40);
  const REDIRECT_TARGET_PORT = 9645 + Math.floor(Math.random() * 5);

  let server;
  let redirectTarget;
  let received = [];
  let redirectTargetHits = 0;

  const OPEN = { blockList: emptyBlockList(), allowHttp: true };

  before(async () => {
    redirectTarget = http.createServer((req, res) => {
      redirectTargetHits += 1;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"reached":true}');
    });
    await new Promise((r) => redirectTarget.listen(REDIRECT_TARGET_PORT, '127.0.0.1', r));

    server = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        received.push({ url: req.url, host: req.headers.host, body: raw });

        if (req.url === '/redirect') {
          res.writeHead(302, { Location: `http://127.0.0.1:${REDIRECT_TARGET_PORT}/landed` });
          return res.end();
        }
        if (req.url === '/slow') {
          return setTimeout(() => { res.writeHead(200); res.end('{}'); }, 3000).unref();
        }
        if (req.url === '/rejects') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end('{"error":"bad request"}');
        }
        if (req.url === '/telegram-not-delivered') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end('{"ok":false,"description":"chat not found"}');
        }
        /*
         * Oversized, and written in PIECES on purpose — that is the whole
         * point of this fixture. A big body handed to res.end() in one go
         * still emits 'end' after the destroy, so a single-chunk version of
         * this test passes against the hanging code and proves nothing.
         */
        if (req.url === '/big-chunked') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          let i = 0;
          const tick = setInterval(() => {
            if (i++ >= 20) { clearInterval(tick); return res.end(); }
            res.write(JSON.stringify({ filler: 'y'.repeat(1000) }));
          }, 5);
          return tick.unref();
        }
        // Comfortably over the 2 KB default and comfortably under 64 KB, so
        // the same URL answers both "refused by default" and "read when the
        // caller says how much it expects".
        if (req.url === '/big-json') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, filler: 'z'.repeat(8000) }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      });
    });
    await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  });

  after(async () => {
    await new Promise((r) => server.close(r));
    await new Promise((r) => redirectTarget.close(r));
  });

  test('posts the JSON body and reports the answer', async () => {
    received = [];
    const out = await sendGuarded(`http://127.0.0.1:${PORT}/hook`, { text: 'hello' }, OPEN);
    assert.equal(out.ok, true);
    assert.equal(out.status, 200);
    assert.equal(received.length, 1);
    assert.deepEqual(JSON.parse(received[0].body), { text: 'hello' });
  });

  /*
   * THE PIN, proven rather than asserted.
   *
   * `webhook.invalid` does not resolve — .invalid is reserved by RFC 2606 and
   * no resolver answers for it. So if the socket did its own lookup this fails
   * with ENOTFOUND. It succeeds only because the address we validated is the
   * address the socket dialled, which is the whole DNS-rebinding defence.
   *
   * The Host header proves the other half: the request still presents the
   * hostname, so SNI and virtual hosting keep working.
   */
  test('the socket connects to the address we pinned, not one it resolves itself', async () => {
    received = [];
    const out = await sendGuarded(`http://webhook.invalid:${PORT}/pinned`, { text: 'pinned' }, {
      ...OPEN,
      lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    });
    assert.equal(out.ok, true, `expected the pin to be used, got: ${out.error}`);
    assert.equal(received.length, 1);
    assert.equal(received[0].host, `webhook.invalid:${PORT}`, 'the Host header must still name the host');
  });

  test('without the pin the same request cannot resolve — which is what makes the test above mean something', async () => {
    const out = await sendGuarded(`http://webhook.invalid:${PORT}/unpinned`, {}, {
      ...OPEN,
      lookup: (host) => import('node:dns').then((m) => m.promises.lookup(host, { all: true })),
    });
    assert.equal(out.ok, false);
    assert.match(out.error, /could not resolve/);
  });

  /*
   * A redirect is refused, and the target is asserted UNTOUCHED. Checking only
   * that `ok` is false would pass on an implementation that followed the
   * redirect and then reported the final status — which is the exact bypass
   * this exists to prevent.
   */
  test('a redirect is refused and the second hop is never made', async () => {
    redirectTargetHits = 0;
    const out = await sendGuarded(`http://127.0.0.1:${PORT}/redirect`, {}, OPEN);
    assert.equal(out.ok, false);
    assert.equal(out.status, 302);
    assert.match(out.error, /redirect/);
    assert.equal(redirectTargetHits, 0, 'the redirect was followed');
  });

  test('a destination that hangs is abandoned, not waited on', async () => {
    const started = Date.now();
    const out = await sendGuarded(`http://127.0.0.1:${PORT}/slow`, {}, { ...OPEN, timeoutMs: 600 });
    assert.equal(out.ok, false);
    assert.match(out.error, /did not answer/);
    assert.ok(Date.now() - started < 2500, 'the timeout did not fire');
  });

  test('a non-2xx carries its status', async () => {
    const out = await sendGuarded(`http://127.0.0.1:${PORT}/rejects`, {}, OPEN);
    assert.equal(out.ok, false);
    assert.equal(out.status, 400);
    assert.match(out.error, /HTTP 400/);
  });

  /*
   * §18: Telegram answers 200 with {ok:false} for a bad chat_id or a bot the
   * recipient never started, so a 2xx is not delivery. The body is handed back
   * for the caller that knows the provider to inspect.
   */
  test('a 200 that is not a delivery still hands back the body that says so', async () => {
    const out = await sendGuarded(`http://127.0.0.1:${PORT}/telegram-not-delivered`, {}, OPEN);
    assert.equal(out.ok, true, 'the transport succeeded');
    assert.deepEqual(out.json, { ok: false, description: 'chat not found' });
  });

  test('nothing that comes back carries the URL', async () => {
    // A Telegram-shaped URL on a port nothing is listening on: the connection
    // error is the one most likely to quote what it was dialling.
    const secret = `http://127.0.0.1:${PORT + 300}/bot123456:AAHsuperSecretToken/sendMessage`;
    const out = await sendGuarded(secret, {}, OPEN);
    assert.equal(out.ok, false);
    assert.ok(!out.error.includes('AAHsuperSecretToken'), `the token leaked: ${out.error}`);
    assert.ok(!out.error.includes(secret), `the URL leaked: ${out.error}`);
  });

  /*
   * THE RESPONSE CAP. Three things, and the middle one was a live bug that had
   * never been reached because nothing here read a reply worth reading.
   */

  test('an oversized reply that arrives in pieces SETTLES rather than hanging for ever', async () => {
    /*
     * The regression test for the real defect. `res.destroy()` mid-stream
     * emits 'close' and nothing else — no 'end', no 'error' — and the old code
     * settled only in 'end', so the promise was never resolved and nothing
     * rescued it: a socket that has just been destroyed cannot fire its own
     * timeout. On the unfixed code this test does not fail, it HANGS, which is
     * why it races a deadline rather than simply awaiting.
     *
     * Downstream that hang is /api/org/hook/test never answering, and a
     * reminder pass stalling on one workspace whose destination is chatty.
     */
    const out = await Promise.race([
      sendGuarded(`http://127.0.0.1:${PORT}/big-chunked`, {}, OPEN),
      new Promise((r) => setTimeout(() => r({ hung: true }), 4000).unref()),
    ]);
    assert.ok(!out.hung, 'sendGuarded never settled on an oversized chunked reply');
    assert.equal(out.ok, false);
    assert.equal(out.code, 'too_large');
  });

  test('an oversized reply is named, not handed back as an unparseable success', async () => {
    /*
     * It used to return the bytes that had arrived, so JSON.parse failed and
     * the caller saw `ok: true, json: null` — indistinguishable from a
     * provider that does not answer JSON. deliverToHook decides "a 2xx is not
     * delivery" by reading `json.ok === false`, so a truncated Telegram
     * refusal was being recorded as a successful delivery.
     */
    const out = await sendGuarded(`http://127.0.0.1:${PORT}/big-json`, {}, OPEN);
    assert.equal(out.ok, false, 'an answer we could not read is not a success');
    assert.equal(out.code, 'too_large');
    assert.equal(out.json, null);
    assert.match(out.error, /2048/, 'the message says what the limit was');
  });

  test('a caller that means to read the answer can raise the cap, and the default is untouched', async () => {
    // Same URL, both ways round — so this cannot pass by the body having
    // shrunk. The default is what every notification path still gets.
    const refused = await sendGuarded(`http://127.0.0.1:${PORT}/big-json`, {}, OPEN);
    assert.equal(refused.code, 'too_large');

    const read = await sendGuarded(`http://127.0.0.1:${PORT}/big-json`, {}, { ...OPEN, maxBytes: 65536 });
    assert.equal(read.ok, true);
    assert.equal(read.json.ok, true);
    assert.equal(read.json.filler.length, 8000, 'the whole body was read, not a prefix of it');
  });

  test('a reply inside the cap is still parsed normally', async () => {
    // The boundary in the other direction: raising the ceiling for one caller
    // must not have changed what a small answer does.
    const out = await sendGuarded(`http://127.0.0.1:${PORT}/hook`, {}, OPEN);
    assert.equal(out.ok, true);
    assert.deepEqual(out.json, { ok: true });
  });
});

describe('what an owner is allowed to see of their own webhook', () => {
  /*
   * There is no read-back anywhere in this feature. The masked form exists so
   * the settings screen can say WHICH destination is configured without the
   * response, the screen or the browser's memory ever holding the credential.
   */
  test('a Telegram bot token never appears', () => {
    const masked = maskUrl('https://api.telegram.org/bot123456:AAHsecret/sendMessage?chat_id=99');
    assert.ok(!masked.includes('AAHsecret'));
    assert.ok(!masked.includes('123456'));
    assert.match(masked, /api\.telegram\.org/);
    assert.match(masked, /sendMessage/);
  });

  test('a Slack or Discord path keeps only the part that is not a secret', () => {
    const slack = maskUrl('https://hooks.slack.com/services/T00000/B00000/XXXXXXXXXXXX');
    assert.ok(!slack.includes('XXXXXXXXXXXX'));
    assert.ok(!slack.includes('T00000'));
    assert.match(slack, /hooks\.slack\.com\/services/);

    const discord = maskUrl('https://discord.com/api/webhooks/12345/abcdefSECRET');
    assert.ok(!discord.includes('abcdefSECRET'));
    assert.match(discord, /discord\.com\/api/);
  });

  test('a query string is masked whole, since that is where chat_id and tokens live', () => {
    const masked = maskUrl('https://example.com/hook?token=SECRET&chat_id=9');
    assert.ok(!masked.includes('SECRET'));
    assert.ok(!masked.includes('chat_id'));
  });

  test('an unparseable URL masks to nothing rather than to itself', () => {
    assert.equal(maskUrl('nonsense'), '');
    assert.equal(hostOf('nonsense'), '');
    assert.equal(hostOf('https://hooks.slack.com/services/x'), 'hooks.slack.com');
  });
});
