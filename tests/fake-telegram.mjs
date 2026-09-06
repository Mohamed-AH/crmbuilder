/*
 * fake-telegram.mjs — a stand-in for api.telegram.org's getUpdates.
 *
 * The chat lookup dials a FIXED host, which is what keeps it from being a new
 * SSRF sink (CLAUDE.md §38) and is also what makes it untestable without a
 * seam. `TELEGRAM_API_BASE` is that seam — the same shape as GOOGLE_TOKEN_URL,
 * added for the same reason: §30 found the OAuth callback had gone years with
 * no test because it could not be driven without Google on the other end.
 *
 * ONE FILE, TWO SUITES, and that is deliberate. tests/api.test.mjs imports
 * `createFakeTelegram` for the failure mappings; playwright.config.js runs this
 * file directly as a second webServer for the picker journey. A second copy of
 * the fixture is a second source that goes stale (§29) — and it would go stale
 * in the direction that matters, with the E2E quietly testing a shape the
 * server no longer produces.
 *
 * The behaviour is selected by the TOKEN in the path, so one server covers
 * every case without a server each.
 */
import http from 'node:http';

/*
 * Two updates naming the SAME chat, plus a group that arrives ONLY as a
 * my_chat_member — the two things de-duplication and the group case turn on.
 *
 * The group deliberately has no `message` update. Group privacy mode is on by
 * default, so a bot in a group never sees ordinary messages; being added to it
 * is a my_chat_member update, and that type is not in getUpdates' default set.
 * A fixture where the group also sent a message would let a request that never
 * asked for my_chat_member pass.
 */
export const TELEGRAM_UPDATES = [
  { update_id: 1, message: { chat: { id: 111, type: 'private', first_name: 'Maya', username: 'maya' } } },
  { update_id: 2, message: { chat: { id: 111, type: 'private', first_name: 'Maya', username: 'maya' } } },
  { update_id: 3, my_chat_member: { chat: { id: -900, type: 'group', title: 'Sales team' } } },
];

/*
 * `seen` records what was actually sent, which is how "no offset is ever
 * acknowledged" is asserted against the REQUEST rather than against the code
 * that builds it.
 */
export function createFakeTelegram() {
  const seen = [];

  const server = http.createServer((req, res) => {
    /*
     * Playwright waits on a URL rather than on a process, so the standalone
     * mode below needs a probe path. Handled here rather than by wrapping the
     * listener afterwards, and unconditionally rather than behind an option:
     * no test dials /healthz on a Telegram base, so there is nothing for it to
     * shadow, and one code path is one thing to keep true.
     */
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end('{"ok":true}');
    }

    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      let body = null;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* not json */ }
      const token = decodeURIComponent((/^\/bot([^/]+)\//.exec(req.url) || [])[1] || '');
      seen.push({ url: req.url, token, body });

      const send = (status, payload) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      };

      if (token === 'bad-token') return send(401, { ok: false, description: 'Unauthorized' });
      if (token === 'busy-token') return send(409, { ok: false, description: 'terminated by other getUpdates request' });
      if (token === 'empty-token') return send(200, { ok: true, result: [] });
      if (token === 'huge-token') {
        /*
         * Over the 64 KB the lookup asks for, written in PIECES — a single
         * large write still emits 'end' after the destroy, so a one-shot
         * version of this passes against the hang the cap change fixed (§38).
         */
        res.writeHead(200, { 'Content-Type': 'application/json' });
        let i = 0;
        const tick = setInterval(() => {
          if (i++ >= 80) { clearInterval(tick); return res.end(); }
          res.write(JSON.stringify({ filler: 'q'.repeat(1000) }));
        }, 2);
        return tick.unref();
      }
      if (token === 'weird-token') return send(200, { ok: true, result: 'not an array' });
      return send(200, { ok: true, result: TELEGRAM_UPDATES });
    });
  });

  return {
    server,
    seen,
    clear() { seen.length = 0; },
    listen: (port) => new Promise((r) => server.listen(port, '127.0.0.1', r)),
    close: () => new Promise((r) => server.close(r)),
  };
}

/*
 * Run directly — playwright.config.js starts this as a second webServer, since
 * the lookup happens on the SERVER and no amount of browser-side stubbing can
 * stand in for it.
 */
if (process.argv[1] && process.argv[1].endsWith('fake-telegram.mjs')) {
  const port = Number(process.env.PORT || 8299);
  await createFakeTelegram().listen(port);
  process.stdout.write(`fake telegram on http://127.0.0.1:${port}\n`);
}
