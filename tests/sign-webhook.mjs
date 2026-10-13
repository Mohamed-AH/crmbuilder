/*
 * sign-webhook.mjs — produce a webhook request signed the way the payment
 * provider signs one.
 *
 * ONE FILE, SHARED, for the reason tests/fake-telegram.mjs already carries: a
 * second copy of a provider's wire format goes stale in the direction that
 * matters, leaving one suite quietly testing a shape the other no longer
 * produces (§29). This is the only place in the repository that signs.
 *
 * IT DOES NOT IMPORT lib/webhook-verify.js, AND THAT IS THE POINT.
 *
 * The signature construction below is written from the provider's published
 * steps, with its own crypto calls. If it called expectedSignature() instead,
 * then a bug in that function would be reproduced here identically and EVERY
 * test would pass — the verifier and the fixture would agree, wrongly, and the
 * suite would be measuring that they agree rather than that either is right.
 * §34 records the same shape as a test passing against its own broken fixture.
 *
 * WHY THIS EXISTS WHEN THE PROVIDER SHIPS TWO CLI TOOLS
 * Neither of them can test verification, and their own documentation says so:
 *
 *   `dodo wh trigger`  sends mock payloads that are NOT SIGNED AT ALL — no
 *                      webhook-id, no signature, no timestamp. It can only
 *                      produce a FALSE PASS.
 *   `dodo wh listen`   preserves the real headers, but the relay parses the
 *                      JSON and serialises it again before forwarding, so a
 *                      byte difference breaks verification with the headers
 *                      intact. It can produce a FALSE FAILURE.
 *
 * Of the two, the false pass is the dangerous one: it is how a verification
 * function ends up looking right and verifying nothing. A local signer with no
 * network in it is the only thing that settles it in CI. The dashboard's
 * Webhooks -> Testing -> Send example is the other half, against a deployment.
 */

import crypto from 'node:crypto';

/*
 * A fixed, obviously-fake secret. Deterministic so a signature can be frozen
 * as a literal in the tests; `whsec_` + base64 of a readable string, so it
 * cannot be mistaken for a real credential if it ever shows up in a log.
 */
export const TEST_SECRET = 'whsec_Y3JtYnVpbGRlci10ZXN0LXdlYmhvb2stc2lnbmluZy1rZXk=';

/*
 * A payload in the provider's documented envelope. Not a full event — the
 * shape is what matters here, and inventing fields the provider does not send
 * would be a fixture asserting its own guess.
 */
export function samplePayload(overrides = {}) {
  return JSON.stringify({
    business_id: 'bus_test_crmbuilder',
    type: 'subscription.active',
    timestamp: '2026-10-13T09:00:00Z',
    data: { payload_type: 'Subscription', subscription_id: 'sub_test_0001' },
    ...overrides,
  });
}

/**
 * Sign a body the way the provider does.
 *
 * Written from the published steps: the signed content is
 * `{id}.{timestamp}.{body}`, the key is the secret with any `whsec_` prefix
 * removed and the rest base64-decoded, and the header entry is
 * `v1,<base64 HMAC-SHA256>`.
 *
 * @param {object} [opts]
 * @param {Buffer|string} [opts.body]       defaults to samplePayload()
 * @param {string} [opts.secret]            defaults to TEST_SECRET
 * @param {string} [opts.id]                webhook-id
 * @param {number} [opts.timestampMs]       the instant to stamp; defaults to now
 * @param {string[]} [opts.extraSignatures] entries to put beside ours, verbatim
 * @returns {{ body: Buffer, headers: object, signature: string }}
 */
export function signWebhook(opts = {}) {
  const body = Buffer.isBuffer(opts.body)
    ? opts.body
    : Buffer.from(opts.body === undefined ? samplePayload() : opts.body, 'utf8');

  const secret = opts.secret === undefined ? TEST_SECRET : opts.secret;
  const id = opts.id === undefined ? 'whk_test_0001' : opts.id;
  const seconds = Math.floor(
    (Number.isFinite(opts.timestampMs) ? opts.timestampMs : Date.now()) / 1000,
  );

  const keyB64 = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const key = Buffer.from(keyB64, 'base64');

  // Buffer.concat, not a template string: interpolating a Buffer calls
  // toString() and replaces any non-UTF-8 byte with U+FFFD, so the fixture
  // would sign different bytes than it sends.
  const signed = Buffer.concat([Buffer.from(`${id}.${seconds}.`, 'utf8'), body]);
  const signature = crypto.createHmac('sha256', key).update(signed).digest('base64');

  const entries = [`v1,${signature}`, ...(opts.extraSignatures || [])];

  return {
    body,
    signature,
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': String(seconds),
      'webhook-signature': entries.join(' '),
    },
  };
}
