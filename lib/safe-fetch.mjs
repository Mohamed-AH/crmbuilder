/*
 * safe-fetch.mjs — the outbound request a CUSTOMER chose the destination for.
 *
 * WHY THIS FILE IS NOT IN js/
 * `js/` is a served directory (server.js ASSET_DIRS, CLAUDE.md §28), so a file
 * there is publicly downloadable and wants an index.html entry, an sw.js
 * APP_SHELL entry and a CACHE_VERSION bump. This is server-side code and none
 * of that applies. `tests/smoke.mjs` asserts /lib/safe-fetch.mjs is a 404,
 * which is the allow-list check run backwards — the only thing that would
 * catch a well-meaning future edit to ASSET_DIRS.
 *
 * WHY IT EXISTS AT ALL
 * CLAUDE.md §30 recorded the audit's SSRF finding as FALSE, and the reason was
 * specific: FEEDBACK_WEBHOOK_URL comes from process.env and has no runtime
 * setter, so no user input ever reached an outbound request. A per-workspace
 * webhook IS that setter. This module is what keeps the finding false for
 * everything except a destination we have deliberately checked.
 *
 * TWO TRUST LEVELS, AND THEY DO NOT SHARE A TRANSPORT
 * An env-supplied URL is set by whoever holds the deployment's environment —
 * already the bar for GOOGLE_CLIENT_SECRET — and the feedback webhook test
 * points at 127.0.0.1 on purpose, so restricting it would need a bypass that
 * weakens it to nothing (§30). That path keeps `fetch` and is untouched by
 * this file. A workspace-supplied URL is typed by a customer and comes here.
 *
 * WHY node:https AND NOT fetch
 * DNS rebinding is a time-of-check/time-of-use bug. Validate with dns.lookup
 * and then call fetch(url), and fetch resolves the hostname A SECOND TIME — an
 * attacker serving a one-second TTL that answers public on the first query and
 * 169.254.169.254 on the second walks straight through a correct check.
 * Enumerating hostname encodings does not touch that; the second query is the
 * vulnerability.
 *
 * So we resolve once and PIN the result into the connection. node:https takes
 * a `lookup` option that flows to net.createConnection/tls.connect, so the
 * socket connects to the address we validated with SNI and Host still correct.
 * The undici equivalent needs undici's Agent, which is not reachable on any
 * `node:` specifier and would mean a fifth production dependency.
 *
 * Two things come free with node:https that are flags on fetch:
 *   - it NEVER follows redirects. A property of the API, not an option some
 *     future edit can drop, so a 30x to 169.254.169.254 cannot be followed.
 *   - the hostname encoding zoo (0177.0.0.1, 2130706433, 0x7f.1) needs no
 *     enumeration, because we never parse the hostname. We validate what the
 *     RESOLVER returned. A name that resolves to a blocked address is blocked
 *     however it was spelled.
 */
import net from 'node:net';
import https from 'node:https';
import http from 'node:http';
import dns from 'node:dns';

/*
 * Ranges that a customer's webhook must never reach.
 *
 * net.BlockList is built in (Node >= 15), so this stays a declarative table
 * rather than a pile of comparisons — which is what lets tests/ssrf.test.mjs
 * assert one row at a time and name the row that regressed.
 *
 * The list is deliberately wider than "private": link-local carries the cloud
 * metadata endpoint, CGNAT is somebody else's tenant on a shared NAT, and the
 * documentation/benchmark ranges are non-routable and so can only ever be a
 * mistake or a probe. Blocking them costs a customer nothing.
 */
const BLOCKED_V4 = [
  ['0.0.0.0', 8],          // "this network" — 0.0.0.0 is localhost on Linux
  ['10.0.0.0', 8],         // RFC1918
  ['100.64.0.0', 10],      // CGNAT — shared address space
  ['127.0.0.0', 8],        // loopback
  ['169.254.0.0', 16],     // link-local, and with it 169.254.169.254
  ['172.16.0.0', 12],      // RFC1918
  ['192.0.0.0', 24],       // IETF protocol assignments
  ['192.0.2.0', 24],       // TEST-NET-1
  ['192.168.0.0', 16],     // RFC1918
  ['198.18.0.0', 15],      // benchmarking
  ['198.51.100.0', 24],    // TEST-NET-2
  ['203.0.113.0', 24],     // TEST-NET-3
  ['224.0.0.0', 4],        // multicast
  ['240.0.0.0', 4],        // reserved, and 255.255.255.255 with it
];

const BLOCKED_V6 = [
  ['fc00::', 7],           // unique local
  ['fe80::', 10],          // link-local
  ['ff00::', 8],           // multicast
  ['2001:db8::', 32],      // documentation
  ['64:ff9b::', 96],       // NAT64 — a v4 destination wearing a v6 address
  /*
   * ::ffff:0:0/96 IS DELIBERATELY ABSENT, and adding it back breaks every
   * webhook in the product.
   *
   * It looks like a free backstop under normaliseAddress() — belt and braces
   * for the v4-mapped range. It is not. net.BlockList matches a v4-mapped v6
   * SUBNET against plain IPv4 checks, so this one line makes `check('1.1.1.1',
   * 'ipv4')` return true and nothing is ever deliverable. It was written in,
   * and the "lets an ordinary public address through" test is what caught it —
   * every one of the twenty-one blocked-range assertions passed while the
   * guard refused the entire internet.
   *
   * The unwrapping in normaliseAddress() is the control for mapped addresses,
   * and it has its own tests.
   */
];

const BLOCKED_V6_EXACT = ['::', '::1'];

export function defaultBlockList() {
  const list = new net.BlockList();
  for (const [addr, prefix] of BLOCKED_V4) list.addSubnet(addr, prefix, 'ipv4');
  for (const [addr, prefix] of BLOCKED_V6) list.addSubnet(addr, prefix, 'ipv6');
  for (const addr of BLOCKED_V6_EXACT) list.addAddress(addr, 'ipv6');
  return list;
}

const DEFAULT_BLOCKLIST = defaultBlockList();

// An empty one, for tests that need to drive the TRANSPORT against a local
// capture server. Splitting the suite this way is what makes both halves
// testable: classification is checked with no sockets at all, and redirects,
// timeouts and payload shaping are checked against 127.0.0.1 with the guard
// deliberately stood down. Testing them together forces you to either weaken
// the guard or never exercise the transport.
export function emptyBlockList() {
  return new net.BlockList();
}

const V4_IN_V6 = /^::ffff:(.+)$/i;
const V4_COMPAT = /^::(\d+\.\d+\.\d+\.\d+)$/;
const V6_HEX_PAIR = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;

/*
 * ::ffff:127.0.0.1 is loopback wearing a v6 hat, and a v6-only block list
 * waves it through. Both spellings have to be unwrapped: the dotted form the
 * resolver usually gives, and the hex form (::ffff:7f00:1) it sometimes does.
 *
 * Returns the address to actually check, plus the family to check it under.
 */
export function normaliseAddress(address) {
  const raw = String(address || '').trim();

  const compat = V4_COMPAT.exec(raw);
  if (compat && net.isIPv4(compat[1])) return { address: compat[1], family: 4 };

  const mapped = V4_IN_V6.exec(raw);
  if (mapped) {
    const tail = mapped[1];
    if (net.isIPv4(tail)) return { address: tail, family: 4 };
    const hex = V6_HEX_PAIR.exec(tail);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      const dotted = [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');
      if (net.isIPv4(dotted)) return { address: dotted, family: 4 };
    }
  }

  if (net.isIPv4(raw)) return { address: raw, family: 4 };
  if (net.isIPv6(raw)) return { address: raw, family: 6 };
  return { address: raw, family: 0 };
}

/*
 * True when this address is one a customer's webhook must not reach.
 *
 * Anything the normaliser could not classify as an IP at all is blocked: an
 * address we cannot parse is an address we cannot vouch for, and failing open
 * on the unparseable is how every list like this ends up bypassed.
 */
export function isBlocked(address, blockList = DEFAULT_BLOCKLIST) {
  const { address: addr, family } = normaliseAddress(address);
  if (family === 0) return true;
  return blockList.check(addr, family === 4 ? 'ipv4' : 'ipv6');
}

/*
 * Node calls a custom `lookup` with one of two shapes, and which one depends
 * on the agent rather than on us:
 *     (hostname, options, cb)  ->  cb(err, address, family)
 *     with options.all set     ->  cb(err, [{ address, family }])
 * Handling only one works locally and fails on the other path with an error
 * that names nothing useful, so both are handled from the start.
 */
export function pinnedLookup(records) {
  return function lookup(hostname, options, callback) {
    const cb = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'function' ? {} : (options || {});
    if (!records.length) {
      cb(Object.assign(new Error('no pinned address'), { code: 'ENOTFOUND' }));
      return;
    }
    if (opts.all) {
      cb(null, records.map((r) => ({ address: r.address, family: r.family })));
      return;
    }
    cb(null, records[0].address, records[0].family);
  };
}

/*
 * Resolve once, check EVERY answer, and hand back the records to pin.
 *
 * `{ all: true }` is the whole point of this function. A split-horizon host
 * returns several records and checking only the first is the entire attack —
 * one public answer to satisfy the check, one private answer for the socket.
 */
export async function resolveAndPin(hostname, {
  blockList = DEFAULT_BLOCKLIST,
  lookup = dns.promises.lookup,
} = {}) {
  let records;
  try {
    const out = await lookup(hostname, { all: true, verbatim: true });
    records = Array.isArray(out) ? out : [out];
  } catch (err) {
    return { error: `could not resolve the host (${err.code || err.message})` };
  }
  if (!records.length) return { error: 'the host resolved to no addresses' };

  for (const r of records) {
    if (isBlocked(r.address, blockList)) {
      // Naming the address is a courtesy to the owner debugging their own
      // webhook — it is the answer to a DNS query they could run themselves.
      // The URL is never named here; it is the credential.
      return { error: `the host resolves to a network address that is not reachable from here (${r.address})` };
    }
  }

  return {
    records: records.map((r) => {
      const n = normaliseAddress(r.address);
      // Pin what the resolver said, not the normalised form: the socket has to
      // dial the address that was actually returned. The normalisation exists
      // for the CHECK, where a mapped address must not hide behind its family.
      return { address: r.address, family: r.family || (n.family === 4 ? 4 : 6) };
    }),
  };
}

/*
 * Everything an error message must not contain.
 *
 * §18: a Telegram webhook URL contains the bot token, so it is a credential in
 * the same class as BACKUP_TOKEN and nothing may interpolate it into a log
 * line or a stored field. Node's own network errors carry hostnames rather
 * than paths, so this is a backstop rather than the primary control — but
 * `lastError` is persisted and shown on a screen, which is a second place the
 * §18 rule could break.
 */
function scrub(message, rawUrl) {
  let out = String(message || 'failed');
  if (rawUrl) out = out.split(rawUrl).join('[webhook url]');
  return out.replace(/\/bot[^/\s]+\//g, '/bot[token]/');
}

const MAX_BODY_BYTES = 2048;

/*
 * POST a JSON body to a destination a customer chose.
 *
 * Never throws and never returns the URL. `ok` means the destination answered
 * 2xx — NOT that the message was delivered: Telegram answers 200 with
 * `{ok:false}` for a bad chat_id or a bot the recipient never started (§18),
 * so `json` is handed back for the caller that knows the provider to inspect.
 */
export async function sendGuarded(rawUrl, payload, {
  blockList = DEFAULT_BLOCKLIST,
  lookup = dns.promises.lookup,
  timeoutMs = 5000,
  allowHttp = false,
} = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, status: null, error: 'that is not a valid URL' };
  }

  /*
   * https only. The URL carries a token, and http: puts it on the wire in
   * clear — which makes "we protected your webhook" untrue for the one thing
   * about it worth protecting. allowHttp exists solely so the transport can be
   * driven against a local capture server in tests.
   */
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    return { ok: false, status: null, error: 'the URL must start with https://' };
  }

  const pin = await resolveAndPin(url.hostname, { blockList, lookup });
  if (pin.error) return { ok: false, status: null, error: pin.error };

  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    let settled = false;
    const done = (out) => { if (!settled) { settled = true; resolve(out); } };

    let req;
    try {
      req = transport.request(url, {
        method: 'POST',
        // The pin. Without it the socket resolves the hostname again and the
        // check above is decoration.
        lookup: pinnedLookup(pin.records),
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body.length,
          'User-Agent': 'crmbuilder-webhook/1',
        },
      });
    } catch (err) {
      return done({ ok: false, status: null, error: scrub(err.message, rawUrl) });
    }

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      done({ ok: false, status: null, error: `the destination did not answer within ${Math.round(timeoutMs / 1000)}s` });
    });

    req.on('error', (err) => done({ ok: false, status: null, error: scrub(err.message, rawUrl) }));

    req.on('response', (res) => {
      const status = res.statusCode;

      /*
       * A redirect is refused rather than followed, and this is not a
       * limitation being worked around — it is the point. Following one would
       * hand the destination a second, unvalidated hop, which is how a
       * perfectly public host walks a request to 169.254.169.254. node:https
       * does not follow redirects at all, so this branch only has to REPORT
       * it; there is no flag here for a later edit to drop.
       */
      if (status >= 300 && status < 400) {
        res.resume();
        return done({
          ok: false,
          status,
          error: `the destination answered with a redirect (HTTP ${status}), which is not followed`,
        });
      }

      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size <= MAX_BODY_BYTES) chunks.push(c);
        else res.destroy();
      });
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not every provider answers JSON */ }
        done({
          ok: status >= 200 && status < 300,
          status,
          error: status >= 200 && status < 300 ? null : `the destination answered HTTP ${status}`,
          json,
        });
      });
      res.on('error', (err) => done({ ok: false, status, error: scrub(err.message, rawUrl) }));
    });

    req.on('timeout', () => req.destroy());
    req.end(body);
  });
}

const TELEGRAM_PATH = /^\/bot[^/]+\/sendMessage$/;

/*
 * What an owner may see of their own webhook — and it is never the URL itself.
 *
 * There is no read-back anywhere in this feature: an owner who has lost the
 * token re-enters it. A masked form exists so the settings screen can show
 * WHICH destination is configured without the screen, the response, or the
 * browser's memory ever holding the credential.
 */
export function maskUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return '';
  }
  if (TELEGRAM_PATH.test(url.pathname)) return `${url.origin}/bot•••••/sendMessage`;

  const segments = url.pathname.split('/').filter(Boolean);
  // Keep the first segment — "services", "api", "webhooks" — because it is what
  // tells a Slack hook from a Discord one at a glance, and it is not a secret.
  const head = segments.length ? `/${segments[0]}` : '';
  const tail = segments.length > 1 ? '/•••••' : '';
  return `${url.origin}${head}${tail}${url.search ? '?•••••' : ''}`;
}

export function hostOf(rawUrl) {
  try { return new URL(rawUrl).host; } catch { return ''; }
}
