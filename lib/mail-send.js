'use strict';

/*
 * Bring-your-own-key transactional email — the send half of the overdue chaser
 * (§51 shipped the `mailto:` half; docs/CHASER-AND-TRACKERS.md decision 3).
 *
 * The tenant supplies their own Resend or Postmark key, which moves the
 * sending domain, the deliverability reputation, the billing and — the one
 * that actually makes a payment reminder work — the from-address off this
 * deployment entirely. A chaser from accounts@theirbusiness.co.uk gets paid;
 * one from noreply@ours does not.
 *
 * NOT A NEW SSRF SINK, which is what makes it affordable. The host is fixed
 * and ours to choose, exactly as with Telegram (§38): only the key varies, and
 * it varies in a header. Everything still goes out through sendGuarded, so the
 * block list, the DNS pin and refuse-redirects all still apply.
 *
 * Server-side, CommonJS, and deliberately NOT under js/ — same reason as
 * lib/safe-fetch.js: that directory is served (§28), and while serving a file
 * and requiring it are unrelated concerns, this one has no browser half at all.
 */

const { sendGuarded } = require('./safe-fetch');

/*
 * A provider error body is small, but it is a body we READ rather than a
 * receipt we ignore — and §38 records what the 2 KB notification default cost
 * when that distinction was missed: an oversized reply came back as
 * `ok: true, json: null`, indistinguishable from a provider that does not
 * answer JSON, and a refusal was filed as a successful delivery. A caller that
 * means to read the answer says how much of it it expects.
 */
const MAIL_MAX_BYTES = 16384;

/*
 * Detected from the key, never chosen from a dropdown.
 *
 * §18's precedent: one payload builder, two provider shapes, and no setting for
 * an owner to get wrong. The two key formats do not overlap — Resend prefixes
 * `re_`, Postmark uses a bare UUID — so the paste itself carries the answer,
 * and an owner who has to be told which service their own key came from was
 * asked a question they had already answered.
 */
const RESEND_KEY = /^re_[A-Za-z0-9_-]{8,}$/;
const POSTMARK_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROVIDERS = {
  resend: {
    name: 'Resend',
    origin: 'https://api.resend.com',
    path: '/emails',
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    body: ({ from, to, subject, text }) => ({ from, to: [to], subject, text }),
    /*
     * A 2xx carries { id }. Anything else carries { message } (sometimes
     * { name }), and the message is written for a person — an unverified
     * sending domain says so in plain words — so it is passed through rather
     * than pattern-matched into our own vocabulary.
     */
    read: (status, json) => {
      if (status >= 200 && status < 300 && json && json.id) return { ok: true, id: String(json.id) };
      const message = json && (json.message || json.error || json.name);
      return { ok: false, message: message ? String(message) : '' };
    },
  },
  postmark: {
    name: 'Postmark',
    origin: 'https://api.postmarkapp.com',
    path: '/email',
    headers: (key) => ({ 'X-Postmark-Server-Token': key, Accept: 'application/json' }),
    body: ({ from, to, subject, text }) => ({
      From: from,
      To: to,
      Subject: subject,
      TextBody: text,
      /*
       * Pinned, not left to the account default. Postmark separates
       * transactional from broadcast streams and is strict about not letting
       * marketing leak into the transactional one — which is precisely the
       * line an invoice chaser must not cross. An owner whose default stream
       * has been changed would otherwise send a payment reminder down a
       * broadcast stream and collect an unsubscribe footer with it.
       */
      MessageStream: 'outbound',
    }),
    /*
     * ErrorCode, not the status code, and that ordering is the §18 rule
     * arriving at a third provider: Postmark answers 200 with
     * `{ ErrorCode: 0 }` on success and can answer 200 with a NON-zero one, so
     * a resolved request is not delivery. It also uses 406 and 422 for
     * ordinary refusals, which a status-only reading would report as a
     * transport fault.
     */
    read: (status, json) => {
      if (json && Number(json.ErrorCode) === 0 && json.MessageID) {
        return { ok: true, id: String(json.MessageID) };
      }
      const message = json && json.Message;
      return { ok: false, message: message ? String(message) : '' };
    },
  },
};

function detectProvider(key) {
  const clean = String(key || '').trim();
  if (RESEND_KEY.test(clean)) return 'resend';
  if (POSTMARK_KEY.test(clean)) return 'postmark';
  return null;
}

function providerName(provider) {
  return (PROVIDERS[provider] && PROVIDERS[provider].name) || String(provider || '');
}

/*
 * A provider's own words, with our key taken back out of them.
 *
 * Neither service echoes a key into an error today, so this removes nothing in
 * practice — and that is the reason to have it. The guarantee that a stored
 * `lastError` and a rendered settings card cannot carry a credential should be
 * LOCAL and testable rather than emergent from two vendors' current habits
 * (§30's argument for the prototype-pollution guard, in a new place). The
 * message goes on a screen and into the meta doc, which is in every nightly
 * artifact.
 */
function redactKey(message, key) {
  const out = String(message || '');
  if (!key) return out;
  return out.split(String(key)).join('[key]');
}

/*
 * Send one message. Never throws, and never returns the key.
 *
 * `{ ok, code, error, id }`. The codes that are ours rather than the
 * transport's:
 *
 *   no_provider   the key matches neither shape — refusable without a network
 *                 call, which is why the save path can catch it
 *   auth          the provider refused the key itself
 *   rate          the provider is throttling this account
 *   provider      the provider refused the message, with its own reason
 *   unconfirmed   it answered 2xx and we could not read the answer
 *
 * `unconfirmed` is not a failure and must not be reported as one. §38's hang
 * was found underneath exactly this state, and the lesson there was that a 2xx
 * with an unreadable body is neither delivery nor refusal — the mail may well
 * have gone. Collapsing it into either one is a lie in a direction that costs
 * something: "sent" leaves an unpaid invoice unchased, "failed" invites a
 * second copy to a customer who already has the first.
 */
async function sendMail({ key, from, to, subject, text }, options = {}) {
  const clean = String(key || '').trim();
  const provider = detectProvider(clean);
  if (!provider) {
    return {
      ok: false,
      code: 'no_provider',
      error: 'That does not look like a Resend or a Postmark key. A Resend key starts with re_; a Postmark server token looks like 1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d.',
    };
  }

  const spec = PROVIDERS[provider];
  /*
   * ONE seam for both providers, not one each. The paths already differ
   * (/emails against /email), so a single capture server can serve both and
   * tell them apart — and §38's rule holds: two independent switches is how
   * the wrong one ends up set in production. server.js reads it from a single
   * environment variable, and the guard relaxation hangs off that same
   * variable rather than a flag of its own.
   */
  const url = `${options.base || spec.origin}${spec.path}`;

  const out = await sendGuarded(url, spec.body({ from, to, subject, text }), {
    headers: spec.headers(clean),
    maxBytes: MAIL_MAX_BYTES,
    timeoutMs: options.timeoutMs || 10000,
    allowHttp: options.allowHttp || false,
    blockList: options.blockList,
  });

  /*
   * 401 ONLY, and the 403 that used to sit beside it was a misdiagnosis.
   *
   * Resend answers 401 for a key it does not recognise and 403 for a key that
   * is fine but is not allowed to send from that domain — the unverified
   * sending domain, which is the single most common way a first send fails.
   * Collapsing the two told an owner to go and replace a perfectly good key
   * while the real problem was a DNS record at their provider, and they would
   * have replaced it, seen the same 403, and concluded the feature was broken.
   *
   * So 403 falls through to `provider` below and carries the service's own
   * words, which name the domain. Found by a test asserting on the wording
   * rather than on the code — the status was right on the broken version.
   */
  if (out.status === 401) {
    return {
      ok: false,
      code: 'auth',
      error: `${spec.name} refused that key. Check it is a server key for the account you meant, and that it has not been revoked.`,
    };
  }
  if (out.status === 429) {
    return { ok: false, code: 'rate', error: `${spec.name} is rate-limiting this account. Try again in a few minutes.` };
  }

  // A transport failure — blocked, unresolvable, refused, timed out. Its
  // message is already scrubbed of the URL by safe-fetch, and the URL is a
  // constant here anyway.
  if (!out.status) return { ok: false, code: out.code || 'network', error: out.error || `${spec.name} could not be reached just now.` };

  const read = spec.read(out.status, out.json);
  if (read.ok) return { ok: true, code: 'sent', error: '', id: read.id, provider };

  /*
   * TWO ways to arrive here, and both are the same state.
   *
   * `too_large` is not ok — safe-fetch tears the socket down and says so — but
   * it still carries the 2xx the provider sent before the body ran away, so
   * treating it as a refusal claims something nobody established. The other is
   * a 2xx whose body simply did not parse. Reading only the second is how §38
   * filed a truncated Telegram refusal as a successful delivery.
   */
  if ((out.ok || out.code === 'too_large') && !out.json && out.status >= 200 && out.status < 300) {
    return {
      ok: false,
      code: 'unconfirmed',
      error: `${spec.name} accepted the request but sent back an answer we could not read. The message may have gone — check your ${spec.name} dashboard before sending it again.`,
    };
  }

  return {
    ok: false,
    code: 'provider',
    error: read.message
      ? `${spec.name}: ${redactKey(read.message, clean)}`
      : `${spec.name} refused the message (HTTP ${out.status}).`,
  };
}

module.exports = { detectProvider, providerName, sendMail, redactKey, PROVIDERS };
