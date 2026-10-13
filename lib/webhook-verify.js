/*
 * webhook-verify.js — proving an INBOUND request came from the payment
 * provider.
 *
 * CommonJS, and .js rather than .mjs, for the reason lib/safe-fetch.js states
 * at length: server.js is CommonJS, package.json allows Node >= 18, and
 * require() of ESM only works from 22.12 — so an .mjs here runs locally and
 * throws ERR_REQUIRE_ESM at REQUIRE time on a deployment pinned to 18 or 20,
 * which means the whole server fails to boot rather than one feature failing.
 *
 * WHY THIS FILE IS NOT IN js/
 * Same as its two neighbours. `js/` is an allow-listed served directory (§28),
 * and this is server-side code. `tests/smoke.mjs` asserts /lib/webhook-verify.js
 * is a 404 — the allow-list check run backwards, and the only thing that would
 * catch somebody adding 'lib' to ASSET_DIRS to make an import work.
 *
 * WHY IT IS A DIFFERENT PROBLEM FROM safe-fetch.js
 * That file guards requests going OUT, where we choose the destination and the
 * threat is a customer pointing us somewhere we should not dial. This guards a
 * request coming IN, and it does nothing whatever for the outbound case — the
 * two share no machinery. The asymmetry that matters: an inbound caller
 * carries NO SESSION. There is no cookie to check, no `req.user`, no
 * workspaceIdFor(). The signature IS the authentication, so this function is
 * the entire gate in front of anything a webhook is allowed to change.
 *
 * Which also means: source-IP allowlisting is not an alternative. The provider
 * publishes that its delivery addresses rotate and says explicitly not to rely
 * on them. A network check cannot prove a request was signed with our secret;
 * only this can.
 *
 * WHY NOT THE PROVIDER'S SDK
 * Their Node SDK requires Node 20 or later and package.json here is ">=18",
 * so taking it would raise the floor — the exact class of failure the header
 * above describes, arrived at from the dependency side. It would also be a
 * fifth production dependency against the four §30 calls an asset on a shared
 * free tier, to replace the thirty lines below. The algorithm is the Standard
 * Webhooks construction and is fully specified; `jsonwebtoken` is already a
 * dependency, so HMAC verification is not new ground in this codebase.
 *
 * THE ALGORITHM, as the provider documents it
 *   1. signed content is `{webhook-id}.{webhook-timestamp}.{raw body}`
 *   2. the secret may carry a `whsec_` prefix; strip it, base64-decode the
 *      rest, and that is the HMAC key
 *   3. HMAC-SHA256 the signed content with that key, base64-encode it
 *   4. the `webhook-signature` header holds one or more space-separated
 *      entries, each `v1,<base64>`; valid if ANY v1 entry matches
 *   5. refuse a `webhook-timestamp` too far from now, to stop a replay
 *
 * IT NEVER THROWS, AND IT NEVER RETURNS THE SECRET
 * Every refusal is `{ ok: false, code, detail }`, following sendGuarded and
 * telegramChats (§38) and resolveZone (§39): a throw from here would land in
 * the one place that has no session to report to, and an uncaught one in an
 * async route was §55's whole finding. The `code` is what lets the route tell
 * an operator problem (nosecret, badsecret, skew) from a refusal that is
 * either an attack or a wrong secret (mismatch) — §38's refuse/warn split.
 *
 * `detail` is built from our own words and from header values only. The secret
 * must never reach it, a log line or a stored field (§61's rule, and §52's
 * redactKey), and neither must the body — a webhook payload carries a
 * customer's name, email and billing address.
 */

const crypto = require('crypto');

/*
 * Five minutes, which is what the Standard Webhooks reference libraries allow.
 * Applied in BOTH directions: a timestamp far in the future is as wrong as one
 * far in the past, and the usual cause of either is a drifting server clock
 * rather than an attack — which is why the detail below carries the skew.
 */
const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000;

const SECRET_PREFIX = 'whsec_';

/*
 * Digits only, and the bound matters. `Number('')` is 0 and `parseInt('12abc')`
 * is 12 — either would turn a junk header into a plausible epoch, which is
 * §10's `Number(x) || now` trap (a legitimate zero restamped as "now") wearing
 * a different hat. A header that is not a run of digits is refused by name.
 */
const TIMESTAMP_PATTERN = /^\d{1,15}$/;

/*
 * Standard base64, plus the two base64url characters, because a provider that
 * hands out a url-safe secret should not read as misconfigured.
 */
const BASE64_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/;

/*
 * Incoming Node headers are already lower-cased, but this function is also
 * handed plain objects — by the tests, and by anything forwarding a webhook
 * from elsewhere. Normalising the lookup costs nothing and removes a class of
 * failure that would present as a missing header on a request that has it.
 */
function headerValue(headers, name) {
  if (!headers || typeof headers !== 'object') return '';
  const direct = headers[name];
  if (typeof direct === 'string') return direct;
  const wanted = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== wanted) continue;
    const value = headers[key];
    // An array is what a duplicated header looks like. Two different
    // signatures for one request is not something to pick a winner from.
    if (typeof value === 'string') return value;
    return '';
  }
  return '';
}

/*
 * The secret -> HMAC key.
 *
 * `badsecret` is deliberately a DIFFERENT answer from `mismatch`, because the
 * action differs completely: one is a deployment whose environment is wrong,
 * the other is a request to refuse. Reporting a malformed secret as a mismatch
 * is how an operator ends up hunting an attacker that does not exist.
 *
 * The honest limit, stated rather than implied: this catches a secret that
 * cannot be base64 at all — wrong characters, or empty once the prefix is
 * stripped. A secret that was truncated mid-paste usually stays in charset and
 * still decodes, so it is indistinguishable from a wrong one and comes back as
 * `mismatch`. Nothing here can tell those apart.
 */
function signingKey(secret) {
  if (typeof secret !== 'string' || secret === '') {
    return { ok: false, code: 'nosecret', detail: 'no webhook secret is configured' };
  }
  const raw = secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret;
  if (raw === '' || !BASE64_PATTERN.test(raw)) {
    return { ok: false, code: 'badsecret', detail: 'the webhook secret is not base64' };
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length === 0) {
    return { ok: false, code: 'badsecret', detail: 'the webhook secret decodes to nothing' };
  }
  return { ok: true, key };
}

/*
 * The signed content is assembled with Buffer.concat, NOT by interpolating the
 * body into a template string.
 *
 * Byte fidelity is the entire job of this function. `${id}.${ts}.${body}` on a
 * Buffer calls toString(), which replaces any byte sequence that is not valid
 * UTF-8 with U+FFFD — so the bytes we sign would differ from the bytes that
 * arrived, and verification would fail on a request that is perfectly good.
 * The provider's own CLI relay has a version of this bug (it re-serialises the
 * JSON before forwarding, which breaks verification with the headers intact),
 * so it is not hypothetical.
 */
function expectedSignature(key, id, timestamp, body) {
  const prefix = Buffer.from(`${id}.${timestamp}.`, 'utf8');
  return crypto
    .createHmac('sha256', key)
    .update(Buffer.concat([prefix, body]))
    .digest('base64');
}

/*
 * Constant-time compare, via a hash of each side.
 *
 * crypto.timingSafeEqual throws on a length mismatch and the throw would
 * itself leak the length — the trap tokenMatches() in server.js already
 * records for BACKUP_TOKEN (§17). Hashing first makes both sides 32 bytes
 * whatever arrived, so the comparison is total and cannot throw.
 */
function digestEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const hb = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

/*
 * The raw body, as bytes.
 *
 * An already-parsed body is REFUSED rather than re-serialised, and that is the
 * guard this function exists for as much as the HMAC is. JSON.stringify of a
 * parsed payload is not guaranteed to reproduce the bytes that were signed —
 * key order survives, but whitespace does not, and neither does number
 * formatting. Re-serialising would therefore make verification pass or fail
 * for a reason that has nothing to do with the signature, which is worse than
 * either outcome. A route that reaches here with an object has its body parser
 * mounted in the wrong order, and `parsedbody` says exactly that.
 */
function rawBytes(body) {
  /*
   * A zero-length body is `nobody`, not `mismatch`, and the distinction is
   * diagnostic rather than a security one — nothing with an empty body could
   * ever match a signature over a real payload. It matters because that is
   * what express.raw() hands over for a request with Content-Length: 0, and
   * the cause is a health probe or a misconfigured endpoint hitting the path.
   * Reporting it as a signature mismatch sends the operator after the secret.
   */
  if (Buffer.isBuffer(body)) {
    if (body.length === 0) return { ok: false, code: 'nobody', detail: 'the request had no body' };
    return { ok: true, body };
  }
  if (typeof body === 'string') {
    if (body === '') return { ok: false, code: 'nobody', detail: 'the request had no body' };
    return { ok: true, body: Buffer.from(body, 'utf8') };
  }
  if (body && typeof body === 'object') {
    return {
      ok: false,
      code: 'parsedbody',
      detail: 'the body was already parsed; mount a raw parser before express.json()',
    };
  }
  return { ok: false, code: 'nobody', detail: 'the request had no body' };
}

/**
 * Verify a Standard Webhooks signature.
 *
 * @param {Buffer|string} rawBody  the bytes exactly as received, never parsed
 * @param {object} headers         request headers (case-insensitive lookup)
 * @param {string} secret          the endpoint's signing secret, `whsec_…`
 * @param {object} [opts]          { now, toleranceMs }
 * @returns {{ok: true, id: string, timestamp: number}
 *          |{ok: false, code: string, detail: string}}
 */
function verifyWebhook(rawBody, headers, secret, opts = {}) {
  const key = signingKey(secret);
  if (!key.ok) return key;

  const bytes = rawBytes(rawBody);
  if (!bytes.ok) return bytes;

  const id = headerValue(headers, 'webhook-id');
  if (!id) return { ok: false, code: 'noid', detail: 'no webhook-id header' };

  const rawTimestamp = headerValue(headers, 'webhook-timestamp');
  if (!rawTimestamp) {
    return { ok: false, code: 'notimestamp', detail: 'no webhook-timestamp header' };
  }
  if (!TIMESTAMP_PATTERN.test(rawTimestamp)) {
    return { ok: false, code: 'badtimestamp', detail: 'webhook-timestamp is not a unix time' };
  }

  const header = headerValue(headers, 'webhook-signature');
  if (!header) return { ok: false, code: 'nosignature', detail: 'no webhook-signature header' };

  /*
   * Replay window, checked before the HMAC purely because it is cheaper. The
   * timestamp is inside the signed content, so a forged one fails the HMAC
   * anyway — this is what stops a genuine, correctly signed request from being
   * replayed later.
   */
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const tolerance = Number.isFinite(opts.toleranceMs) ? opts.toleranceMs : DEFAULT_TOLERANCE_MS;
  const sentAt = Number(rawTimestamp) * 1000;
  const skewMs = now - sentAt;
  if (Math.abs(skewMs) > tolerance) {
    const seconds = Math.round(skewMs / 1000);
    return {
      ok: false,
      code: 'skew',
      detail: `webhook-timestamp is ${seconds}s from now, outside the ${Math.round(tolerance / 1000)}s window`,
    };
  }

  /*
   * One or more space-separated entries. The scheme must be EXACTLY `v1`: a
   * startsWith('v1') test would accept a future `v1a` as if we understood it,
   * which is the one way a version check can be worse than no version check.
   */
  const mine = expectedSignature(key.key, id, rawTimestamp, bytes.body);
  let sawV1 = false;
  let matched = false;
  for (const entry of header.split(/\s+/)) {
    if (!entry) continue;
    const comma = entry.indexOf(',');
    if (comma < 0) continue;
    if (entry.slice(0, comma) !== 'v1') continue;
    sawV1 = true;
    // Not short-circuited: every candidate is compared, so the time taken
    // does not depend on which one matched.
    if (digestEqual(entry.slice(comma + 1), mine)) matched = true;
  }

  if (!sawV1) {
    return { ok: false, code: 'noversion', detail: 'webhook-signature carried no v1 signature' };
  }
  if (!matched) {
    return { ok: false, code: 'mismatch', detail: 'webhook-signature did not match' };
  }

  return { ok: true, id, timestamp: Number(rawTimestamp) };
}

module.exports = {
  verifyWebhook,
  signingKey,
  expectedSignature,
  DEFAULT_TOLERANCE_MS,
};
