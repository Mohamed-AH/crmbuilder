/*
 * webhook-verify.test.mjs — the inbound signature check.
 *
 * Pure: no servers, no sockets, no network. So this file claims no port block
 * from §9's table, and cannot collide with one.
 *
 * The thing this suite is really for is stated in tests/sign-webhook.mjs: the
 * provider's two CLI tools cannot test verification — `wh trigger` sends
 * unsigned payloads and can only produce a false pass, `wh listen` re-
 * serialises the body and can only produce a false failure. A verifier that is
 * wrong and a fixture that is wrong in the same way would agree, so the frozen
 * vector below is computed OUTSIDE this repository (with openssl) and the
 * fixture shares no code with the verifier.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import verifier from '../lib/webhook-verify.js';
import { signWebhook, samplePayload, TEST_SECRET } from './sign-webhook.mjs';

const { verifyWebhook, signingKey, expectedSignature } = verifier;

// The decoded TEST_SECRET, for the raw-construction tests below.
const TEST_KEY = Buffer.from(TEST_SECRET.slice('whsec_'.length), 'base64');

/*
 * Computed with:
 *   printf '%s' 'whk_frozen.1760000000.{"type":"payment.succeeded"}' \
 *     | openssl dgst -sha256 -hmac 'crmbuilder-test-webhook-signing-key' \
 *       -binary | base64
 *
 * openssl, deliberately — a value produced by Node would be produced by the
 * same runtime as the code under test, and the point of freezing it is to have
 * one number in this file that neither the verifier nor the fixture authored.
 */
const FROZEN = {
  id: 'whk_frozen',
  timestamp: 1760000000,
  body: '{"type":"payment.succeeded"}',
  signature: 'sPOQm3nfGeqW2rpojNYr8L/kFTM4xetKuoTenVFj/3A=',
};

describe('the Standard Webhooks construction', () => {
  test('the signature matches a vector computed outside this repository', () => {
    const mine = expectedSignature(
      TEST_KEY,
      FROZEN.id,
      FROZEN.timestamp,
      Buffer.from(FROZEN.body, 'utf8'),
    );
    assert.equal(mine, FROZEN.signature);
  });

  test('the fixture and the verifier agree, without sharing any code', () => {
    const signed = signWebhook();
    const out = verifyWebhook(signed.body, signed.headers, TEST_SECRET);
    assert.equal(out.ok, true, out.detail);
  });

  test('a body that is not valid UTF-8 is signed over its bytes, not a re-encoding', () => {
    /*
     * 0x80 is a continuation byte with nothing to continue, so Buffer#toString
     * replaces it with U+FFFD (3 bytes). Interpolating the body into a
     * template string therefore signs different bytes than arrived — which is
     * the provider's own CLI relay bug, reached from inside our code.
     */
    const body = Buffer.concat([Buffer.from('{"x":"', 'utf8'), Buffer.from([0x80]), Buffer.from('"}', 'utf8')]);
    const signed = signWebhook({ body });

    const out = verifyWebhook(signed.body, signed.headers, TEST_SECRET);
    assert.equal(out.ok, true, out.detail);

    // And the naive construction really does differ, so the test above is not
    // passing because the two happen to agree on this input.
    const naive = crypto
      .createHmac('sha256', TEST_KEY)
      .update(`${signed.headers['webhook-id']}.${signed.headers['webhook-timestamp']}.${body}`)
      .digest('base64');
    assert.notEqual(naive, signed.signature);
  });

  test('all three parts are covered: tampering with the id or the timestamp fails', () => {
    const signed = signWebhook();

    const wrongId = verifyWebhook(
      signed.body,
      { ...signed.headers, 'webhook-id': 'whk_somebody_elses' },
      TEST_SECRET,
    );
    assert.equal(wrongId.ok, false);
    assert.equal(wrongId.code, 'mismatch');

    // Moved by one second: still inside the replay window, so this can only
    // fail on the HMAC.
    const moved = String(Number(signed.headers['webhook-timestamp']) - 1);
    const wrongTime = verifyWebhook(
      signed.body,
      { ...signed.headers, 'webhook-timestamp': moved },
      TEST_SECRET,
    );
    assert.equal(wrongTime.ok, false);
    assert.equal(wrongTime.code, 'mismatch');
  });
});

describe('verifyWebhook — what it accepts', () => {
  test('a correctly signed request verifies and hands back the id and timestamp', () => {
    const signed = signWebhook({ id: 'whk_abc', timestampMs: 1760000000000 });
    const out = verifyWebhook(signed.body, signed.headers, TEST_SECRET, { now: 1760000000000 });
    assert.deepEqual(out, { ok: true, id: 'whk_abc', timestamp: 1760000000 });
  });

  test('a Buffer body and the identical string body give the same answer', () => {
    const signed = signWebhook();
    const asBuffer = verifyWebhook(signed.body, signed.headers, TEST_SECRET);
    const asString = verifyWebhook(signed.body.toString('utf8'), signed.headers, TEST_SECRET);
    assert.equal(asBuffer.ok, true);
    assert.deepEqual(asString, asBuffer);
  });

  test('the whsec_ prefix is optional', () => {
    const signed = signWebhook();
    const bare = TEST_SECRET.slice('whsec_'.length);
    assert.equal(verifyWebhook(signed.body, signed.headers, bare).ok, true);
  });

  test('several signatures verify when any one of them is ours', () => {
    // What a secret rotation looks like on the wire: the provider keeps the
    // old secret valid for 24 hours, so a delivery can legitimately carry two.
    const signed = signWebhook({
      extraSignatures: ['v1,bm90IHRoZSByaWdodCBzaWduYXR1cmUgYXQgYWxsAAA='],
    });
    assert.equal(verifyWebhook(signed.body, signed.headers, TEST_SECRET).ok, true);

    const reordered = {
      ...signed.headers,
      'webhook-signature': signed.headers['webhook-signature'].split(' ').reverse().join(' '),
    };
    assert.equal(verifyWebhook(signed.body, reordered, TEST_SECRET).ok, true);
  });

  test('header lookup does not depend on case', () => {
    const signed = signWebhook();
    const shouty = {
      'Webhook-Id': signed.headers['webhook-id'],
      'Webhook-Timestamp': signed.headers['webhook-timestamp'],
      'Webhook-Signature': signed.headers['webhook-signature'],
    };
    assert.equal(verifyWebhook(signed.body, shouty, TEST_SECRET).ok, true);
  });
});

describe('verifyWebhook — what it refuses, and by which name', () => {
  test('a body altered by one byte does not verify', () => {
    const signed = signWebhook({ body: samplePayload() });
    const tampered = Buffer.from(signed.body.toString('utf8').replace('sub_test_0001', 'sub_test_0002'));
    const out = verifyWebhook(tampered, signed.headers, TEST_SECRET);
    assert.equal(out.ok, false);
    assert.equal(out.code, 'mismatch');
  });

  test('an already-parsed body is refused, never re-serialised', () => {
    /*
     * The failure this prevents is subtle and would be blamed on the provider:
     * JSON.stringify of a parsed payload preserves key order but not
     * whitespace, so re-serialising makes verification pass or fail for a
     * reason unconnected to the signature. The honest answer is that the body
     * parser is mounted in the wrong order, and the code says so.
     */
    const signed = signWebhook();
    const out = verifyWebhook(JSON.parse(signed.body.toString('utf8')), signed.headers, TEST_SECRET);
    assert.equal(out.ok, false);
    assert.equal(out.code, 'parsedbody');
    assert.match(out.detail, /raw parser/);
  });

  test('an empty body is nobody, not a signature mismatch', () => {
    /*
     * express.raw() hands over a zero-length Buffer for a request with
     * Content-Length: 0, so this is the real shape rather than an edge case —
     * a health probe or a misconfigured endpoint pointed at this path. Nothing
     * empty could match a signature over a real payload, so calling it a
     * mismatch is not wrong, it is just useless: it sends whoever reads the
     * log after the secret.
     */
    const signed = signWebhook();
    assert.equal(verifyWebhook(Buffer.alloc(0), signed.headers, TEST_SECRET).code, 'nobody');
    assert.equal(verifyWebhook('', signed.headers, TEST_SECRET).code, 'nobody');
    assert.equal(verifyWebhook(undefined, signed.headers, TEST_SECRET).code, 'nobody');
  });

  test('a missing secret is an operator problem, not a refusal', () => {
    const signed = signWebhook();
    for (const secret of [undefined, '', null]) {
      const out = verifyWebhook(signed.body, signed.headers, secret);
      assert.equal(out.ok, false);
      assert.equal(out.code, 'nosecret');
    }
  });

  test('a secret that is not base64 is badsecret, distinct from mismatch', () => {
    /*
     * The distinction is the whole reason both codes exist: one means go and
     * fix the environment, the other means refuse the request and possibly
     * look at who sent it. Collapsing them is how somebody ends up hunting an
     * attacker who does not exist.
     */
    const signed = signWebhook();
    assert.equal(verifyWebhook(signed.body, signed.headers, 'whsec_not valid base64!').code, 'badsecret');
    assert.equal(verifyWebhook(signed.body, signed.headers, 'whsec_').code, 'badsecret');
    // Decodes to zero bytes rather than failing the charset test.
    assert.equal(verifyWebhook(signed.body, signed.headers, 'whsec_=').code, 'badsecret');
  });

  test('each missing header is named rather than lumped together', () => {
    const signed = signWebhook();
    const without = (name) => {
      const h = { ...signed.headers };
      delete h[name];
      return verifyWebhook(signed.body, h, TEST_SECRET);
    };
    assert.equal(without('webhook-id').code, 'noid');
    assert.equal(without('webhook-timestamp').code, 'notimestamp');
    assert.equal(without('webhook-signature').code, 'nosignature');
  });

  test('a timestamp that is not a run of digits is refused, never coerced', () => {
    /*
     * Number('') is 0 and parseInt('12abc') is 12 — either would turn a junk
     * header into a plausible epoch. §10's `Number(x) || now` trap, which cost
     * a workspace's settings once already.
     */
    const signed = signWebhook();
    for (const bad of ['12abc', 'abc', '-1', '1.5', ' 1760000000', '0x10']) {
      const out = verifyWebhook(
        signed.body,
        { ...signed.headers, 'webhook-timestamp': bad },
        TEST_SECRET,
      );
      assert.equal(out.ok, false, `accepted ${JSON.stringify(bad)}`);
      assert.equal(out.code, 'badtimestamp', `wrong code for ${JSON.stringify(bad)}`);
    }
  });

  test('the replay window is five minutes, in both directions', () => {
    const now = 1760000000000;
    const at = (offsetMs) => {
      const signed = signWebhook({ timestampMs: now + offsetMs });
      return verifyWebhook(signed.body, signed.headers, TEST_SECRET, { now });
    };

    assert.equal(at(0).ok, true);
    assert.equal(at(-4 * 60 * 1000).ok, true, 'four minutes old should be inside the window');
    assert.equal(at(4 * 60 * 1000).ok, true, 'four minutes ahead should be inside the window');

    const old = at(-6 * 60 * 1000);
    assert.equal(old.code, 'skew');
    assert.match(old.detail, /360s from now/);

    // A clock drifting the other way is as wrong, and is the likelier cause of
    // either — which is why the detail carries the skew rather than just
    // saying no.
    assert.equal(at(6 * 60 * 1000).code, 'skew');
  });

  test('a signature header with no v1 entry says so, rather than reporting a mismatch', () => {
    const signed = signWebhook();
    const only = (value) =>
      verifyWebhook(signed.body, { ...signed.headers, 'webhook-signature': value }, TEST_SECRET);

    assert.equal(only(`v2,${signed.signature}`).code, 'noversion');
    // `v1a` must NOT be read as v1: a startsWith test would accept a future
    // scheme as though we understood it, which is worse than no version check.
    assert.equal(only(`v1a,${signed.signature}`).code, 'noversion');
    assert.equal(only(signed.signature).code, 'noversion', 'an entry with no comma is not a signature');
    assert.equal(only(`v1,${signed.signature}`).ok, true, 'the v1 form still verifies');
  });

  test('a signature of the wrong length is refused, and does not throw', () => {
    /*
     * crypto.timingSafeEqual throws on a length mismatch, and the throw would
     * itself leak the length — the trap tokenMatches() already records for
     * BACKUP_TOKEN (§17). Hashing both sides first makes the comparison total.
     *
     * The failure mode without it is much worse than a wrong answer: this
     * function is the entire gate in front of a route with no session, so a
     * throw lands where there is nothing to report to, and an uncaught one in
     * an async handler was §55's whole finding. An attacker sends `v1,x`.
     */
    const signed = signWebhook();
    for (const bogus of ['v1,', 'v1,x', `v1,${signed.signature}AAAA`, 'v1,!!!!']) {
      let out;
      assert.doesNotThrow(() => {
        out = verifyWebhook(signed.body, { ...signed.headers, 'webhook-signature': bogus }, TEST_SECRET);
      }, `threw on ${JSON.stringify(bogus)}`);
      assert.equal(out.ok, false);
      assert.equal(out.code, 'mismatch', `wrong code for ${JSON.stringify(bogus)}`);
    }
  });

  test('a duplicated signature header is refused, not guessed at', () => {
    // Node hands a repeated header back as an array. Two different signatures
    // for one request is not something to pick a winner from.
    const signed = signWebhook();
    const out = verifyWebhook(
      signed.body,
      { ...signed.headers, 'webhook-signature': [signed.signature, 'v1,other'] },
      TEST_SECRET,
    );
    assert.equal(out.ok, false);
    assert.equal(out.code, 'nosignature');
  });
});

describe('what never leaves the function', () => {
  test('no result carries the secret, in any form', () => {
    const signed = signWebhook();
    const bare = TEST_SECRET.slice('whsec_'.length);
    const results = [
      verifyWebhook(signed.body, signed.headers, TEST_SECRET),
      verifyWebhook(signed.body, {}, TEST_SECRET),
      verifyWebhook(signed.body, signed.headers, 'whsec_!!!!'),
      verifyWebhook(signed.body, { ...signed.headers, 'webhook-signature': 'v1,nope' }, TEST_SECRET),
      verifyWebhook({ parsed: true }, signed.headers, TEST_SECRET),
      signingKey(TEST_SECRET),
    ];
    for (const out of results) {
      const text = JSON.stringify(out) || '';
      assert.equal(text.includes(bare), false, `leaked the secret: ${text}`);
      assert.equal(text.includes(TEST_SECRET), false, `leaked the secret: ${text}`);
      // The decoded key is the thing an attacker actually wants.
      assert.equal(text.includes('crmbuilder-test-webhook-signing-key'), false, `leaked the key: ${text}`);
    }
  });

  test('no result carries the request body', () => {
    /*
     * A webhook payload holds a customer's name, email and billing address.
     * `detail` is rendered into a log line, so §18's rule about the feedback
     * webhook applies here too: the diagnostic must not become the disclosure.
     */
    const body = samplePayload({ data: { payload_type: 'Payment', email: 'someone@example.com' } });
    const signed = signWebhook({ body });
    const results = [
      verifyWebhook(Buffer.from(body, 'utf8'), { ...signed.headers, 'webhook-signature': 'v1,nope' }, TEST_SECRET),
      verifyWebhook(Buffer.from(body, 'utf8'), {}, TEST_SECRET),
      verifyWebhook(JSON.parse(body), signed.headers, TEST_SECRET),
    ];
    for (const out of results) {
      const text = JSON.stringify(out) || '';
      assert.equal(text.includes('someone@example.com'), false, `leaked the body: ${text}`);
      assert.equal(text.includes('bus_test_crmbuilder'), false, `leaked the body: ${text}`);
    }
  });
});
