/*
 * payments.test.mjs — the inbound payment webhook, driven over HTTP.
 *
 * Ports 9960–9990 (§9), one app server. A fresh port per boot per §4:
 * rebinding one that was listening a moment ago races, and on Windows it
 * loses several tests away from the restart that caused it.
 *
 * WHY THIS IS DRIVEN THROUGH THE REAL ENDPOINT rather than by calling the
 * handler: the two things most likely to be wrong here are not in the handler
 * at all. One is the BODY PARSER MOUNT ORDER — a raw parser that loses to the
 * global express.json() turns every delivery into a `parsedbody` refusal, and
 * no unit test can see that. The other is that `billing` must be a sibling of
 * `settings` rather than a field inside it, which is only observable by
 * writing settings through the real sync path and looking at what survives.
 *
 * tests/webhook-verify.test.mjs covers the signature algorithm itself, with a
 * signer that shares no code with the verifier. This file covers the route.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { signWebhook, TEST_SECRET } from './sign-webhook.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 9960 + Math.floor(Math.random() * 25);
const BASE = `http://127.0.0.1:${PORT}`;
const HOOK = '/api/payments/dodo';

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

describe('the payment webhook', () => {
  let child;
  let dataDir;
  let serverLog = '';
  let wsId;
  const owner = jar();
  const viewer = jar();

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

  /*
   * Deliver an event the way the provider would: raw bytes, signed, with the
   * three headers. Never through `req` — that sets a JSON body, and the whole
   * question on this route is what reaches the verifier unparsed.
   */
  async function deliver(payload, opts = {}) {
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    const signed = signWebhook({ body, ...opts });
    const res = await fetch(`${BASE}${HOOK}`, {
      method: 'POST',
      headers: opts.headers || signed.headers,
      body: signed.body,
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text };
  }

  /*
   * `type` and `at` are TOP-LEVEL on the envelope; everything else overrides a
   * field inside `data`. Worth being explicit about, because the first version
   * of this helper spread `type` into `data` — so every event was delivered as
   * `subscription.active` whatever the test asked for, and four tests failed
   * pointing at the ordering code, which was correct the whole time.
   */
  function subscriptionEvent(overrides = {}) {
    const { at, metadata, type, ...rest } = overrides;
    return {
      business_id: 'bus_test_crmbuilder',
      type: type || 'subscription.active',
      timestamp: at || '2026-10-13T09:00:00Z',
      data: {
        payload_type: 'Subscription',
        subscription_id: 'sub_live_0001',
        status: 'active',
        next_billing_date: '2026-11-13T09:00:00Z',
        metadata: metadata === null ? undefined : { wsId, ...(metadata || {}) },
        ...rest,
      },
    };
  }

  async function billingNow() {
    return (await req('/api/org/billing', { cookies: owner })).json;
  }

  before(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'crmb-payments-'));
    child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        DATA_DIR: dataDir,
        ALLOW_DEV_LOGIN: '1',
        MONGODB_URI: '',
        SESSION_SECRET: 'payments-route-secret',
        SIGNUP_MODE: 'open',
        NODE_ENV: 'test',
        DODO_WEBHOOK_SECRET: TEST_SECRET,
        // For the export assertion at the foot of this describe. Bearer only,
        // never a query string — §17.
        BACKUP_TOKEN: 'export-token-for-payments-test',
        // The checkout link. A product id with a character that MUST be
        // encoded, so the test can tell an encoded id from an interpolated
        // one — a plain `pdt_123` would pass either way.
        DODO_PRODUCT_ID: 'pdt test/1',
        APP_URL: 'https://checkout-test.example',
        // The customer portal. One whole URL, pasted from the dashboard's
        // Share Invite dialog rather than composed from a business id — the
        // test-mode host, which is what a test-mode deployment would hold.
        DODO_PORTAL_URL: 'https://test.customer.dodopayments.com/login/bus_test_crmbuilder',
        /*
         * PAID, because `billingMode`'s default is `free` and free mode sends
         * no checkout link at all — so without this every link assertion in
         * this file tests the free-mode gate instead of the thing it names.
         * Measured rather than predicted: adding that gate failed exactly
         * seven tests here, all of them checkout-link ones.
         *
         * This is the env default, not a stored decision, so a test that
         * flips the stored mode still wins over it (§16's precedence) — which
         * is what the free-mode tests below rely on, and why they restore it.
         */
        BILLING_MODE: 'paid',
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

    const o = await req('/auth/dev', { method: 'POST', body: { email: 'pay-owner@team.test' }, cookies: owner });
    wsId = o.json.user.orgId;

    const v = await req('/auth/dev', { method: 'POST', body: { email: 'pay-look@team.test' }, cookies: viewer });
    const code = (await req('/api/org/invites', { method: 'POST', body: {}, cookies: owner })).json.invite.code;
    await req('/api/org/join', { method: 'POST', body: { code }, cookies: viewer });
    await req(`/api/org/members/${v.json.user.id}`, { method: 'PATCH', body: { role: 'viewer' }, cookies: owner });
  });

  after(async () => {
    if (child) child.kill();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  /* ------------------------------------------------------------------ *
   * Authentication — the only gate this route has
   * ------------------------------------------------------------------ */

  test('an unsigned delivery is refused, and writes nothing', async () => {
    const res = await fetch(`${BASE}${HOOK}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscriptionEvent()),
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(res.status, 401);
    assert.equal((await billingNow()).billing, null);
  });

  test('a delivery signed with the wrong secret is refused', async () => {
    const other = 'whsec_c29tZWJvZHkgZWxzZXMgc2VjcmV0';
    const out = await deliver(subscriptionEvent(), { secret: other });
    assert.equal(out.status, 401);
    assert.equal((await billingNow()).billing, null);
  });

  test('a body altered after signing is refused', async () => {
    const payload = subscriptionEvent();
    const signed = signWebhook({ body: Buffer.from(JSON.stringify(payload), 'utf8') });
    const tampered = JSON.stringify({ ...payload, type: 'subscription.cancelled' });
    const res = await fetch(`${BASE}${HOOK}`, {
      method: 'POST', headers: signed.headers, body: tampered, signal: AbortSignal.timeout(20000),
    });
    assert.equal(res.status, 401);
    assert.equal((await billingNow()).billing, null);
  });

  test('the refusal says nothing about which check failed', async () => {
    /*
     * The code and the detail belong in the log. Handing an unauthenticated
     * prober "the timestamp is 400s from now" tells them the endpoint is real,
     * that the secret is configured, and how to get past the cheap checks.
     */
    const out = await deliver(subscriptionEvent(), { timestampMs: Date.now() - 20 * 60 * 1000 });
    assert.equal(out.status, 401);
    assert.deepEqual(out.json, { error: 'Invalid signature' });
    assert.doesNotMatch(out.text, /timestamp|skew|window|secret/i);
  });

  /* ------------------------------------------------------------------ *
   * The mount order, which no unit test can see
   * ------------------------------------------------------------------ */

  test('a signed subscription event is recorded against its workspace', async () => {
    /*
     * This is the body-parser mount-order test as much as the happy path. If
     * the global express.json() won, the verifier would be handed an object,
     * answer `parsedbody`, and this would be a 401 — so a green here is what
     * proves the raw parser is mounted first (§38's ordering dependency).
     */
    const out = await deliver(subscriptionEvent());
    assert.equal(out.status, 200, out.text);
    assert.deepEqual(out.json, { received: true, applied: true });

    const { enabled, billing } = await billingNow();
    assert.equal(enabled, true);
    assert.equal(billing.provider, 'dodo');
    assert.equal(billing.subscriptionId, 'sub_live_0001');
    assert.equal(billing.status, 'active');
    assert.equal(billing.subscriptionEvent, 'subscription.active');
    assert.equal(typeof billing.nextBillingAt, 'number');
  });

  /* ------------------------------------------------------------------ *
   * Ordering — the correctness mechanism
   * ------------------------------------------------------------------ */

  test('a cancellation sticks, and a retried older event cannot undo it', async () => {
    /*
     * THE test on this route. The provider states its events are "neither
     * terminal nor strictly ordered", so a retried `subscription.active` can
     * legitimately arrive after `subscription.cancelled` — and without the
     * clock comparison it would bring a cancelled subscription back to life,
     * handing a customer access they stopped paying for. Silent, and visible
     * only as a billing discrepancy weeks later.
     */
    const cancelled = await deliver(subscriptionEvent({
      type: 'subscription.cancelled', status: 'cancelled', at: '2026-10-13T12:00:00Z',
    }));
    assert.equal(cancelled.json.applied, true);
    assert.equal((await billingNow()).billing.status, 'cancelled');

    const late = await deliver(subscriptionEvent({ at: '2026-10-13T11:00:00Z' }));
    assert.equal(late.status, 200);
    assert.deepEqual(late.json, { received: true, applied: false, reason: 'stale' });

    const { billing } = await billingNow();
    assert.equal(billing.status, 'cancelled', 'an hour-old retry resurrected a cancelled subscription');
    assert.equal(billing.subscriptionEvent, 'subscription.cancelled');
  });

  test('a newer event is applied over an older one', async () => {
    // The other direction, or the test above passes on a route that ignores
    // everything after the first event it ever sees.
    const out = await deliver(subscriptionEvent({
      type: 'subscription.renewed', status: 'active', at: '2026-10-13T13:00:00Z',
    }));
    assert.equal(out.json.applied, true);
    assert.equal((await billingNow()).billing.subscriptionEvent, 'subscription.renewed');
  });

  test('a redelivery of the same event changes nothing', async () => {
    /*
     * Retries are what makes this routine rather than exotic: up to eight
     * attempts per event. Re-applying is only safe because the payload is a
     * state snapshot and not an increment — the moment anything here counts
     * rather than sets, this needs a webhook-id store (§69).
     */
    const event = subscriptionEvent({ type: 'subscription.past_due', status: 'past_due', at: '2026-10-13T14:00:00Z', past_due_ends_at: '2026-10-20T14:00:00Z' });
    const first = await deliver(event);
    const before = await billingNow();
    const second = await deliver(event);
    const after = await billingNow();

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(before.billing.status, 'past_due');
    assert.equal(before.billing.pastDueEndsAt, after.billing.pastDueEndsAt);
    assert.equal(before.billing.subscriptionEvent, after.billing.subscriptionEvent);
  });

  test('a payment event does not blank the subscription beside it', async () => {
    /*
     * The two-clock split, which exists so these cannot compete. putData
     * merges top-level keys only, so `{ billing }` replaces the whole object —
     * a handler that rebuilt it from the payment fields alone would wipe the
     * subscription state and nothing would say so.
     */
    const before = await billingNow();
    assert.equal(before.billing.subscriptionId, 'sub_live_0001');

    const out = await deliver({
      business_id: 'bus_test_crmbuilder',
      type: 'payment.succeeded',
      timestamp: '2026-10-13T15:00:00Z',
      data: { payload_type: 'Payment', payment_id: 'pay_0001', status: 'succeeded', metadata: { wsId } },
    });
    assert.equal(out.json.applied, true);

    const { billing } = await billingNow();
    assert.equal(billing.paymentEvent, 'payment.succeeded');
    assert.equal(billing.paymentStatus, 'succeeded');
    assert.equal(billing.subscriptionId, 'sub_live_0001', 'a payment event erased the subscription');
    assert.equal(billing.subscriptionEvent, 'subscription.past_due');
  });

  test('the two clocks are independent, not one shared clock', async () => {
    /*
     * The subscription clock stands at 14:00 and a payment has just been
     * recorded at 15:00. A subscription event stamped 14:30 is therefore NEWER
     * than the subscription state and OLDER than the payment — so one shared
     * clock would discard it as stale and leave the workspace on a past-due
     * subscription that has in fact been reinstated.
     *
     * This is why the split exists rather than being tidier. It is §26's
     * field-level reasoning without §26's machinery.
     */
    const out = await deliver(subscriptionEvent({
      type: 'subscription.unpaused', status: 'active', at: '2026-10-13T14:30:00Z',
    }));
    assert.equal(out.status, 200);
    assert.deepEqual(out.json, { received: true, applied: true }, 'a shared clock rejected a newer subscription event');

    const { billing } = await billingNow();
    assert.equal(billing.subscriptionEvent, 'subscription.unpaused');
    assert.equal(billing.status, 'active');
    // And the payment beside it is untouched by a subscription write.
    assert.equal(billing.paymentEvent, 'payment.succeeded');
  });

  test('two events sharing a timestamp are applied in arrival order', async () => {
    /*
     * Their timestamps are second-precision, so two distinct events in one
     * second are possible — and the comparison is deliberately "apply unless
     * strictly older" so the second is not silently dropped. The cost of that
     * choice is written down in §69: a redelivery of the first, arriving after
     * the second, would regress. Narrow, self-correcting on the next event,
     * and closing it needs a webhook-id store.
     *
     * The opposite choice reads as the safer one, which is why this pins it.
     */
    const when = '2026-10-13T16:30:00Z';
    await deliver(subscriptionEvent({ type: 'subscription.paused', status: 'paused', at: when }));
    const second = await deliver(subscriptionEvent({ type: 'subscription.cancelled', status: 'cancelled', at: when }));

    assert.deepEqual(second.json, { received: true, applied: true }, 'a same-second event was dropped as stale');
    assert.equal((await billingNow()).billing.status, 'cancelled');
  });

  /* ------------------------------------------------------------------ *
   * Every handled event, derived from the server's own list
   * ------------------------------------------------------------------ */

  test('every subscription event the server claims to handle is recorded', async () => {
    /*
     * Three of the eleven had never been driven by any test AND cannot be
     * produced in test mode: `plan_changed` needs a second product,
     * `on_hold` needs a dunning sequence to exhaust, and `expired` needs a
     * billing period to end. So production would have been the first sighting
     * of any kind for them — and two of the three are the ones that take
     * access AWAY, which is the direction that generates a support ticket.
     *
     * THE LIST IS DERIVED FROM server.js, NOT TYPED HERE. §73 records the
     * §7 runbook naming seven of these eleven and costing a real event for
     * the four it missed; typing them again one file over would repeat that
     * exact mistake, and the failure mode is the quiet one — a twelfth event
     * added later would simply never be covered and nothing would say so.
     */
    const source = await readFile(join(ROOT, 'server.js'), 'utf8');
    const block = source.match(/const BILLING_SUBSCRIPTION_EVENTS = new Set\(\[([^\]]*)\]/);
    assert.ok(block, 'could not find BILLING_SUBSCRIPTION_EVENTS in server.js');
    /*
     * `[a-z_.]+`, and the underscore is the whole point: `[a-z.]+` — which is
     * what §73 and §7 step 5 both documented — matches NOTHING for
     * `plan_changed`, `past_due` and `on_hold`, because the class stops at the
     * underscore and there is no closing quote to find. It derived eight of
     * eleven and looked authoritative, silently dropping two of the four
     * events §73 records the runbook having missed in the first place. A
     * derivation that is wrong in the same direction as the typed list it
     * replaced is the worst of both.
     */
    const events = [...block[1].matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]);

    /*
     * A regex that silently matched nothing would make every assertion below
     * vacuous — §34's shape, a test passing against its own broken fixture.
     * The floor is what the server carried when this was written.
     */
    assert.ok(events.length >= 12, `derived only ${events.length} events: ${events}`);
    assert.ok(events.includes('subscription.on_hold'), 'the derivation missed a known event');

    /*
     * Each needs a clock strictly newer than the last, or the staleness guard
     * correctly drops it and the test reads as a handling failure.
     */
    let minute = 0;
    for (const type of events) {
      const at = new Date(Date.UTC(2026, 10, 1, 0, minute++)).toISOString();
      const status = type.slice('subscription.'.length);
      const res = await deliver(subscriptionEvent({ type, status, at }));

      assert.deepEqual(res.json, { received: true, applied: true }, `${type} was not applied`);

      const { billing } = await billingNow();
      assert.equal(billing.subscriptionEvent, type, `${type} was not recorded`);
      assert.equal(billing.status, status, `${type} did not carry its status through`);
    }
  });

  test('a failed payment is recorded as its own event, beside the subscription', async () => {
    /*
     * `payment.failed` is the one payment event the suite never drove, and it
     * is the state §73's fifth card branch exists for — a workspace holding a
     * payment and no subscription. Driven here against the OTHER clock, so a
     * failure cannot be mistaken for a subscription write.
     */
    const before = (await billingNow()).billing.subscriptionEvent;

    const res = await deliver({
      business_id: 'bus_test_crmbuilder',
      type: 'payment.failed',
      timestamp: '2026-11-02T00:00:00Z',
      data: {
        payload_type: 'Payment',
        payment_id: 'pay_declined_0001',
        status: 'failed',
        metadata: { wsId },
      },
    });
    assert.deepEqual(res.json, { received: true, applied: true });

    const { billing } = await billingNow();
    assert.equal(billing.paymentEvent, 'payment.failed');
    assert.equal(billing.paymentStatus, 'failed');
    /*
     * NOT asserted: `paymentId`. It is stored, and `publicBilling` does not
     * return it — while it does return `subscriptionId`. That asymmetry is
     * undocumented and may be deliberate; it is left alone here because
     * changing a response shape is a §46 decision rather than a test fix.
     */
    // The subscription half must be exactly where it was — two clocks, §70.
    assert.equal(billing.subscriptionEvent, before);
  });

  test('a payment in flight is recorded as its own event, not as a recorded payment', async () => {
    /*
     * `payment.processing` was ticked on the endpoint and ignored by the route,
     * so a debit in flight was indistinguishable from one that had settled —
     * and on a FIRST payment the card read "a payment was recorded", which
     * overstates what happened. An India-issued card on an RBI mandate can sit
     * here for real time (§73), so this is not a millisecond edge.
     */
    const before = (await billingNow()).billing.subscriptionEvent;

    const res = await deliver({
      business_id: 'bus_test_crmbuilder',
      type: 'payment.processing',
      timestamp: '2026-11-03T00:00:00Z',
      data: {
        payload_type: 'Payment',
        payment_id: 'pay_inflight_0001',
        status: 'processing',
        metadata: { wsId },
      },
    });
    assert.deepEqual(res.json, { received: true, applied: true });

    const { billing } = await billingNow();
    assert.equal(billing.paymentEvent, 'payment.processing');
    assert.equal(billing.paymentStatus, 'processing');
    // Two clocks (§70): an in-flight payment says nothing about the
    // subscription, so the subscription half must be exactly where it was.
    assert.equal(billing.subscriptionEvent, before);
  });

  /*
   * ONE monotonic counter for every test from here down, and it is not
   * housekeeping.
   *
   * December, so every clock it hands out is strictly newer than the
   * hand-picked November dates above. §74's first version of the gate section
   * picked its own December date beside another hand-picked one and failed
   * `applied: false, reason: 'stale'` — staleness is the mechanism this whole
   * file tests, so hand-picking a timestamp next to another hand-picked one is
   * the one thing not to do in it.
   */
  let laterMinute = 0;
  function laterClock() {
    return new Date(Date.UTC(2026, 11, 1, 0, laterMinute++)).toISOString();
  }

  test('a request for a new payment method is recorded, and a later event clears it', async () => {
    /*
     * THE SECOND HALF IS THE TEST. There is no stored flag and no clearing
     * logic — the card derives the notice from `subscriptionEvent`, so what
     * retires it is the ordinary newest-wins write that every other
     * subscription event already does.
     *
     * A flag would need clearing, and the only honest clearer is a payment
     * succeeding — which is on the other clock, so clearing across the two
     * would reintroduce the competition §70's split exists to prevent. This
     * asserts that the cheaper mechanism actually works: without the second
     * delivery, an implementation that stored the request and never let go of
     * it would pass just as happily.
     */
    const asked = await deliver(subscriptionEvent({
      type: 'subscription.update_payment_method',
      status: 'active',
      at: laterClock(),
    }));
    assert.deepEqual(asked.json, { received: true, applied: true });

    let { billing } = await billingNow();
    assert.equal(billing.subscriptionEvent, 'subscription.update_payment_method');
    // Still live, which is the point of handling it: this is the warning
    // BEFORE a failure, not a report of one.
    assert.equal(billing.status, 'active');

    const renewed = await deliver(subscriptionEvent({
      type: 'subscription.renewed',
      status: 'active',
      at: laterClock(),
    }));
    assert.deepEqual(renewed.json, { received: true, applied: true });

    ({ billing } = await billingNow());
    assert.equal(billing.subscriptionEvent, 'subscription.renewed',
      'a later subscription event did not replace the request, so the notice would never clear');
  });

  /* ------------------------------------------------------------------ *
   * Acknowledged and ignored — every one of these must be a 2xx
   * ------------------------------------------------------------------ */

  test('an event we do not subscribe to is acknowledged, not retried', async () => {
    /*
     * A non-2xx is a delivery failure to this provider, so refusing an event
     * we deliberately ignore means eight retries over twenty-eight hours and
     * then a failure in their dashboard — which trains an operator to ignore
     * the one screen that reports real ones.
     *
     * It matters more than it looks: their docs state that DESELECTING every
     * event subscribes you to all of them, so an endpoint receiving the whole
     * catalogue is one misconfigured checkbox away.
     */
    const out = await deliver({
      business_id: 'bus_test_crmbuilder',
      type: 'dispute.opened',
      timestamp: '2026-10-13T16:00:00Z',
      data: { payload_type: 'Dispute', metadata: { wsId } },
    });
    assert.equal(out.status, 200);
    assert.equal(out.json.ignored, 'unsubscribed event');
  });

  test('an event with no workspace in its metadata is acknowledged and dropped', async () => {
    const before = await billingNow();
    const out = await deliver(subscriptionEvent({ at: '2026-10-13T17:00:00Z', metadata: null }));
    assert.equal(out.status, 200);
    assert.equal(out.json.ignored, 'no workspace');
    assert.deepEqual(await billingNow(), before, 'an unattributable event changed something');
  });

  test('an event naming a workspace that does not exist is acknowledged and dropped', async () => {
    const before = await billingNow();
    const out = await deliver(subscriptionEvent({ at: '2026-10-13T17:00:00Z', metadata: { wsId: 'no-such-workspace' } }));
    assert.equal(out.status, 200);
    assert.equal(out.json.ignored, 'unknown workspace');
    assert.deepEqual(await billingNow(), before);
  });

  test('an event with an unusable timestamp is dropped rather than stamped with now', async () => {
    /*
     * `Number(x) || now` on a clock is §10's trap, and here it would be worse
     * than a wrong number: an event stamped "now" always wins the staleness
     * test, so one malformed timestamp could overwrite good state for ever.
     */
    const before = await billingNow();
    const out = await deliver(subscriptionEvent({ at: 'last Tuesday' }));
    assert.equal(out.status, 200);
    assert.equal(out.json.ignored, 'no timestamp');
    assert.deepEqual(await billingNow(), before);
  });

  /* ------------------------------------------------------------------ *
   * What the record holds, and who can see it
   * ------------------------------------------------------------------ */

  test('no customer identity is stored, even when the payload carries it', async () => {
    /*
     * `workspaces[].meta` IS the data collection (§17), so everything on the
     * meta doc is in every nightly backup artifact — downloadable by anyone
     * with read access to the private repo. The provider is the system of
     * record for the customer; we need ids and statuses.
     *
     * THIS TEST WAS VACUOUS TWICE OVER, and both halves were found by running
     * the mutation rather than by reading it (§9).
     *
     * 1. It delivered a hand-picked OCTOBER date, and §73's derived-events loop
     *    had already landed November ones — so the delivery was dropped as
     *    stale and the record was never written at all. `applied` is asserted
     *    first now, so a reordering that makes it stale again fails HERE.
     * 2. It then searched `GET /api/org/billing`, which is `publicBilling()` —
     *    a WHITELIST. A leaked field cannot appear in that response by
     *    construction, so the assertion could never have failed however much
     *    identity the server stored. With `customerEmail` and `customerName`
     *    added to `billingFieldsFor` it passed on both counts.
     *
     * The guarantee is about what is STORED, because `workspaces[].meta` IS the
     * data collection (§17) and that is what the nightly artifact dumps — so
     * the admin export is the instrument, being literally the artifact in
     * question rather than a projection of it.
     */
    const stored = await deliver(subscriptionEvent({
      at: laterClock(),
      customer: { email: 'payer@example.com', name: 'A Real Person' },
      billing: { street: '1 Example Road', city: 'Leeds', country: 'GB' },
    }));
    assert.deepEqual(stored.json, { received: true, applied: true },
      'the identity payload was never applied, so this test cannot see what it stores');

    const res = await fetch(`${BASE}/api/admin/export`, {
      headers: { Authorization: 'Bearer export-token-for-payments-test' },
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const ws = body.workspaces.find((w) => w.wsId === wsId);
    assert.ok(ws && ws.meta && ws.meta.billing, 'no billing record reached the export to inspect');

    // The WHOLE stored record, not named fields — §38's rule: a field-by-field
    // check only covers the fields somebody thought of.
    const dump = JSON.stringify(ws.meta.billing);
    for (const leaked of ['payer@example.com', 'A Real Person', 'Example Road', 'Leeds']) {
      assert.equal(dump.includes(leaked), false, `the stored billing record carried ${leaked}`);
    }
  });

  test('billing never travels to a colleague through sync', async () => {
    /*
     * Searched across the WHOLE response rather than a named field (§38's
     * rule) — a field-by-field check only covers the fields somebody thought
     * of. A viewer is the strongest case: pullChanges sends meta.settings
     * whole to every role, so anything that leaked into settings would land in
     * their IndexedDB permanently.
     */
    const pull = await req('/api/sync?since=0', { cookies: viewer });
    assert.equal(pull.status, 200);
    assert.equal(pull.text.includes('sub_live_0001'), false);
    assert.equal(pull.text.includes('"billing"'), false);
  });

  /* ------------------------------------------------------------------ *
   * The checkout link, and the gate in front of it
   * ------------------------------------------------------------------ */

  /*
   * Every test that reads the checkout link now has a PRECONDITION, because
   * the gate makes it null while a non-terminal subscription exists. Driving
   * a cancellation first states which side of the gate the test is on,
   * rather than inheriting whichever event the derived loop above happened to
   * end on — reordering that Set would otherwise turn these into a null
   * dereference several tests away from the change (§9).
   *
   * Every clock here comes from `laterClock()`, declared further up now that
   * two sections share it.
   */
  async function cancelNow() {
    const res = await deliver(subscriptionEvent({
      type: 'subscription.cancelled', status: 'cancelled', at: laterClock(),
    }));
    assert.deepEqual(res.json, { received: true, applied: true });
  }

  test('a workspace already holding a live subscription is offered no checkout link', async () => {
    /*
     * The duplicate gate. Six subscriptions existed on the test account
     * across two workspaces because nothing stopped an owner pressing
     * Subscribe again, and the provider has no guard of its own — their
     * blocklist docs say why the obvious one cannot work: "Checkout can
     * create a new customer record for a returning email."
     *
     * Asserted on the SERVER's answer, not on the card: a client-side hide is
     * a client-side hide, and the link is a plain URL anybody can keep.
     */
    await deliver(subscriptionEvent({
      type: 'subscription.active', status: 'active', at: laterClock(),
    }));
    const live = await billingNow();
    assert.equal(live.billing.status, 'active');
    assert.equal(live.checkout, null, 'a live subscriber was offered a second subscription');
    // And the portal is what replaces it, or the gate is a dead end.
    assert.ok(live.portal, 'a live subscriber was left with no way to manage anything');

    /*
     * A TERMINAL subscription gets the link back, and that half is not
     * decoration: resubscribing after cancelling is a thing somebody is
     * entitled to do, and a gate written as "has a subscription record" would
     * refuse it for ever.
     */
    await deliver(subscriptionEvent({
      type: 'subscription.cancelled', status: 'cancelled', at: laterClock(),
    }));
    const done = await billingNow();
    assert.equal(done.billing.status, 'cancelled');
    assert.ok(done.checkout, 'a cancelled subscriber could not resubscribe');
    // Both, deliberately — the alternative is a dead end for a receipt.
    assert.ok(done.portal);
  });

  test('a declined first payment is not mistaken for a live subscription', async () => {
    /*
     * The one state this gate must not reach. A record holding only
     * `payment.failed` with no subscription behind it (§73) is somebody whose
     * card was refused, and blocking them would leave them unable to try
     * again — on the one screen where that is the entire point.
     *
     * Checked by construction rather than by driving it: the stored record
     * here already carries a subscription, so a fresh workspace is what makes
     * the assertion mean anything.
     */
    const solo = jar();
    const who = await req('/auth/dev', { method: 'POST', body: { email: 'pay-declined@team.test' }, cookies: solo });
    const ws = who.json.user.orgId;

    await deliver({
      business_id: 'bus_test_crmbuilder',
      type: 'payment.failed',
      timestamp: laterClock(),
      data: { payload_type: 'Payment', payment_id: 'pay_gate_decline', status: 'failed', metadata: { wsId: ws } },
    });

    const out = (await req('/api/org/billing', { cookies: solo })).json;
    assert.equal(out.billing.paymentEvent, 'payment.failed');
    assert.equal(out.billing.status, null);
    assert.ok(out.checkout, 'a refused card was blocked from trying again');
  });

  test('the checkout link carries this workspace, and nothing else', async () => {
    await cancelNow();
    const { checkout } = await billingNow();
    const u = new URL(checkout);
    const q = u.searchParams;

    assert.equal(u.origin, 'https://checkout.dodopayments.com');
    // Encoded, not interpolated. The id holds a space and a slash, so an
    // unencoded one would change the PATH rather than merely look wrong.
    assert.equal(u.pathname, '/buy/pdt%20test%2F1');

    assert.equal(q.get('metadata_wsId'), wsId);

    /*
     * No hash on the return URL, and this is the assertion that matters most
     * (§70): the provider appends its query to whatever it is given, so a
     * redirect_url carrying a fragment produces a URL whose query sits inside
     * the hash — where location.search is empty and the client cannot read or
     * strip it. Measured before it was written, not assumed.
     */
    const back = new URL(q.get('redirect_url'));
    assert.equal(back.hash, '', 'redirect_url carries a hash, so the return is unreadable');
    assert.equal(back.href, 'https://checkout-test.example/app');

    /*
     * The email is prefilled AND LOCKED, which is the duplicate fix: the
     * address is how the provider identifies a customer, so letting it vary
     * between attempts is what produced six subscriptions from two
     * workspaces.
     *
     * BOTH, or the lock silently does nothing — their docs: "A disable flag
     * takes effect only when it's true and the matching field has a value."
     * So an assertion on `disableEmail` alone would pass against a link that
     * leaves the field fully editable.
     */
    assert.equal(q.get('email'), 'pay-owner@team.test');
    assert.equal(q.get('disableEmail'), 'true');

    /*
     * No ADDRESS prefill, and that half of §45's reasoning stands: a billing
     * address is genuinely not a sign-in address, and this is the screen where
     * guessing wrong costs money. The name goes too — we hold one, and it is
     * the account holder's rather than the cardholder's. Asserted so
     * "helpfully" adding one is a decision somebody takes again rather than a
     * line that slips in.
     */
    for (const guessed of ['fullName', 'firstName', 'lastName', 'country', 'addressLine', 'city', 'state', 'zipCode']) {
      assert.equal(q.get(guessed), null, `the checkout link guessed ${guessed}`);
    }
  });

  test('the prefilled email is the session, never a parameter', async () => {
    /*
     * §5 at the second place on this route where it decides something that
     * costs money: the workspace decides who is credited, and the email
     * decides who the provider bills and whose portal shows the invoice.
     *
     * The viewer is in the same org, so a handler reading a query parameter
     * would not be caught by a cross-org test — this one catches it by trying
     * to say otherwise outright.
     */
    await cancelNow();
    const out = await req('/api/org/billing?email=attacker@example.test', { cookies: owner });
    assert.equal(out.status, 200);
    assert.equal(new URL(out.json.checkout).searchParams.get('email'), 'pay-owner@team.test');
  });

  test('the workspace on the link is the session, never a parameter', async () => {
    /*
     * §5's rule at the one place it decides who a payment is credited to. The
     * viewer is in the SAME org, so a handler reading a query parameter would
     * be caught by a cross-org test — this one catches it by asking as a
     * different person in the same workspace and by trying to say otherwise.
     */
    await cancelNow();
    const out = await req(`/api/org/billing?wsId=somebody-elses&orgId=somebody-elses`, { cookies: owner });
    assert.equal(out.status, 200);
    assert.equal(new URL(out.json.checkout).searchParams.get('metadata_wsId'), wsId);
  });

  test('the portal is offered only once there is something to manage', async () => {
    /*
     * A workspace that has never paid has no customer record at the provider,
     * so the static link leads to a sign-in page that will never email them
     * anything — a control that looks like it works and cannot, which is the
     * shape this card has already been caught in twice (§73).
     *
     * A fresh workspace is the only way to assert the absence: the owner's
     * has held a billing record since the second test in this file.
     */
    const fresh = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'pay-never@team.test' }, cookies: fresh });
    const out = (await req('/api/org/billing', { cookies: fresh })).json;
    assert.equal(out.billing, null);
    assert.equal(out.portal, null, 'a workspace that has never paid was sent to a portal');
    // And the checkout link is there, which is what says the absence above is
    // about the portal rather than about the deployment.
    assert.ok(out.checkout);

    // The owner, who has one, gets the whole URL as the operator pasted it —
    // not a business id this code assembled a host around (§73's derivation
    // trap).
    const mine = await billingNow();
    assert.equal(mine.portal, 'https://test.customer.dodopayments.com/login/bus_test_crmbuilder');
  });

  /*
   * FREE MODE. Three tests, and they share one hazard: the mode is STORED, so
   * leaving it flipped leaks into every test after them — §16 records exactly
   * that for the E2E test that changes the signup mode, which restores it in a
   * `finally`. Each of these does the same.
   *
   * The owner here is the FIRST account on this deployment and is therefore a
   * platformAdmin (§21, §39), which is what lets it reach the admin route at
   * all. Worth stating: a reader seeing a team owner flip a platform lever
   * would reasonably think the route's guard was wrong.
   */
  async function withFreeMode(fn) {
    const set = await req('/api/admin/billing-mode', { method: 'PUT', body: { mode: 'free' }, cookies: owner });
    assert.equal(set.status, 200, `could not flip the mode: ${JSON.stringify(set.json)}`);
    try {
      await fn();
    } finally {
      await req('/api/admin/billing-mode', { method: 'PUT', body: { mode: 'paid' }, cookies: owner });
    }
  }

  test('free mode sends no checkout link, and the gate is on the server', async () => {
    /*
     * The entitlement half, and it is the one that matters. In free mode
     * nothing is on sale, so a workspace holding yesterday's link must not be
     * able to buy through it — a charge taken in the one mode whose whole
     * promise is that nobody is charged without being asked.
     *
     * A fresh workspace, because the owner's has held a live subscription
     * since early in this file and `live` would mask the mode as the reason
     * the link is absent. That conflation is the thing `mode` and `live`
     * exist to tell apart, so a test that cannot distinguish them proves
     * nothing about either.
     */
    const fresh = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'pay-free@team.test' }, cookies: fresh });

    const paid = (await req('/api/org/billing', { cookies: fresh })).json;
    assert.ok(paid.checkout, 'the baseline is wrong: paid mode sent no link, so the next assertion is vacuous');
    assert.equal(paid.mode, 'paid');

    await withFreeMode(async () => {
      const out = (await req('/api/org/billing', { cookies: fresh })).json;
      assert.equal(out.mode, 'free');
      assert.equal(out.checkout, null, 'free mode offered a checkout link');
      assert.equal(out.live, false);
    });

    // And it comes back, so the flip is a mode rather than a one-way door.
    assert.ok((await req('/api/org/billing', { cookies: fresh })).json.checkout);
  });

  test('free mode still reaches the portal of somebody already subscribed', async () => {
    /*
     * The asymmetry, and it would cost real money to get wrong. Flipping back
     * to free does not stop the PROVIDER charging a live subscription — only
     * cancelling does, and the portal is the only control that can. So
     * withholding it here would strand a paying customer with a recurring
     * debit and no way to stop it, which is a dispute that is entirely ours
     * (PAYMENTS.md §3).
     *
     * The owner has to be re-subscribed here rather than inherited. The first
     * version of this test assumed a live subscription from earlier in the
     * file and failed on its own precondition — the tests above it drive
     * `cancelNow()` so they can read a checkout link past §74's gate, so by
     * this point the owner is cancelled. That guard is the only reason the
     * wrong assumption was visible rather than passing: a cancelled owner
     * gets `portal` too, so every assertion below would have been satisfied
     * for the wrong reason (§9).
     */
    await deliver(subscriptionEvent({ status: 'active', at: laterClock() }));
    await withFreeMode(async () => {
      const out = await billingNow();
      assert.equal(out.mode, 'free');
      assert.equal(out.live, true, 'the owner is not subscribed, so this test is not testing what it says');
      assert.equal(out.checkout, null, 'a live subscriber was offered a second checkout');
      assert.equal(
        out.portal,
        'https://test.customer.dodopayments.com/login/bus_test_crmbuilder',
        'free mode took away the only control a live subscriber has',
      );
    });
  });

  test('a stored free decision beats the paid env var', async () => {
    /*
     * §16's precedence, on the third lever. The env var here is `paid`, so a
     * stored `free` winning is the whole assertion — and it is not a
     * restatement of §78's own precedence test, which drives the admin panel.
     * This one drives the CUSTOMER-facing route, which is where getting it
     * backwards would charge somebody an operator had decided not to charge.
     */
    await withFreeMode(async () => {
      assert.equal((await billingNow()).mode, 'free');
    });
    assert.equal((await billingNow()).mode, 'paid');
  });

  test('a viewer cannot read the billing status', async () => {
    const out = await req('/api/org/billing', { cookies: viewer });
    assert.equal(out.status, 403);
    // The refusal names the right rule, rather than borrowing the one about
    // workspace notifications (§53).
    assert.match(out.json.error, /billing/i);
  });

  test('changing the workspace currency does not erase the billing record', async () => {
    /*
     * The structural reason `billing` is a SIBLING of settings rather than a
     * field inside it, driven through the real sync path. §38's identical test
     * for the webhook fails destructively on the inside-settings design, and
     * this one would too: a settings push carrying no billing key would take
     * the whole object with it.
     */
    const before = await billingNow();
    const push = await req('/api/sync', {
      method: 'POST',
      cookies: owner,
      body: { since: 0, settings: { business: 'Paid Up Ltd', currency: 'GBP' }, settingsUpdatedAt: Date.now() },
    });
    assert.equal(push.status, 200);
    assert.deepEqual(await billingNow(), before, 'a settings write erased the billing record');
  });

  test('the admin export carries billing, unlike the mail key beside it', async () => {
    /*
     * The opposite call from the two credentials on the same document, and
     * deliberately: redacting this would make a restore silently un-subscribe
     * every paying customer — §38's webhook finding with money attached.
     *
     * A MAIL KEY IS CONFIGURED FIRST, and that is the whole reason this test
     * means anything. `redactMeta` returns early when a workspace has no hook
     * and no mail key, so without one the redaction branch is never entered —
     * the first version of this test passed just as happily against a build
     * that redacted `billing`, because the code that would have done it never
     * ran. Found by the mutation, not by reading (§9).
     *
     * Mail rather than a webhook because `PUT /api/org/mail` makes no outbound
     * call (§52), so this needs no capture server and no guard relaxation.
     */
    const mail = await req('/api/org/mail', {
      method: 'PUT',
      cookies: owner,
      body: { key: 're_A1b2C3d4E5f6G7h8', from: 'billing@paidup.test' },
    });
    assert.equal(mail.status, 200, mail.text);

    const res = await fetch(`${BASE}/api/admin/export`, {
      headers: { Authorization: 'Bearer export-token-for-payments-test' },
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const ws = body.workspaces.find((w) => w.wsId === wsId);

    // The contrast is the assertion: one of these must go, the other must not.
    assert.deepEqual(ws.meta.mail, { redacted: true }, 'the mail key was exported');
    assert.equal(ws.meta.billing.subscriptionId, 'sub_live_0001', 'billing was redacted out of the export');
    // Deliberately NOT asserting the status here: which event happens to have
    // been applied last is an artifact of the order of the tests above, and
    // pinning it would make this fail for a reason that has nothing to do with
    // the export. The subscription id is what the restore has to bring back.
  });
});

/* ---------------------------------------------------------------------- *
 * A deployment with no secret configured
 * ---------------------------------------------------------------------- */

describe('a deployment with no DODO_WEBHOOK_SECRET', () => {
  let child;
  let dataDir;
  let serverLog = '';
  const PORT2 = 9986 + Math.floor(Math.random() * 4);
  const BASE2 = `http://127.0.0.1:${PORT2}`;

  before(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'crmb-payments-off-'));
    child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT2),
        DATA_DIR: dataDir,
        MONGODB_URI: '',
        SESSION_SECRET: 'payments-off-secret',
        NODE_ENV: 'test',
        DODO_WEBHOOK_SECRET: '',
        // Nothing to sell and nothing able to confirm a sale — the two
        // absences the card must not collapse into one another.
        DODO_PRODUCT_ID: '',
        // And a portal URL with no scheme, which is the misconfiguration this
        // deployment is already playing the part of. It must be refused at
        // boot and said out loud, not rendered as a button that goes nowhere.
        DODO_PORTAL_URL: 'customer.dodopayments.com/login/bus_1',
        ALLOW_DEV_LOGIN: '1',
        SIGNUP_MODE: 'open',
        // Paid, for the reason the first server's env gives: this describe's
        // subject is "nothing to sell" and "cannot confirm a sale", and in
        // free mode BOTH would be masked by a third absence.
        BILLING_MODE: 'paid',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => { serverLog += d; });
    child.stderr.on('data', (d) => { serverLog += d; });

    const deadline = Date.now() + 20000;
    for (;;) {
      if (Date.now() > deadline) throw new Error(`server did not start:\n${serverLog}`);
      try { if ((await fetch(`${BASE2}/healthz`, { signal: AbortSignal.timeout(1500) })).ok) break; } catch { /* not up */ }
      await new Promise((r) => setTimeout(r, 120));
    }
  });

  after(async () => {
    if (child) child.kill();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  test('an unconfigured deployment answers 503, never a 2xx', async () => {
    /*
     * The status is the whole test. A 2xx would make the provider mark the
     * event delivered and move on — a customer pays, nothing records it, and
     * nothing anywhere contradicts you. A 503 makes it retry and shows the
     * endpoint as failing in the dashboard, which is the signal the operator
     * needs. Deliberately not the 404 that /api/admin/export uses when its
     * token is unset (§17): that one hides whether backups exist at all.
     */
    const signed = signWebhook();
    const res = await fetch(`${BASE2}/api/payments/dodo`, {
      method: 'POST', headers: signed.headers, body: signed.body, signal: AbortSignal.timeout(20000),
    });
    assert.equal(res.status, 503);
    assert.ok(serverLog.includes('DODO_WEBHOOK_SECRET'), 'the operator problem was not logged');
  });

  test('with nothing to sell there is no checkout link, and that is not the same as not configured', async () => {
    /*
     * Two absences that read identically if either is dropped, which is why
     * the route reports them separately (§70, §39's digest card):
     *
     *   enabled: false   nothing could RECORD a payment — an operator fault,
     *                    and the one state where subscribing would take money
     *                    and leave no trace
     *   checkout: null   nothing to SELL yet — correct, and where this
     *                    deployment actually is until a price is decided
     *   portal: null     no DODO_PORTAL_URL, so no self-service either
     *
     *   mode: 'paid'     what this deployment WOULD do, which is a fourth
     *                    fact and not an absence — in `free` mode the card
     *                    says something else entirely and offers no checkout
     *   live: false      nothing is subscribed. The one fact the card cannot
     *                    derive, because the TERMINAL set lives on the server
     *                    (§74) and the client would need a second copy of it
     *
     * The deepEqual is the assertion: it is what catches a key added to this
     * response without a decision, which §46 records as the drift no route
     * count can see. It did exactly that for `mode` and `live` — this is the
     * only test in the file that failed on them, and it failed by naming both.
     */
    const cookies = jar();
    const res = await fetch(`${BASE2}/auth/dev`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'pay-off-owner@team.test' }),
      signal: AbortSignal.timeout(20000),
    });
    cookies.absorb(res);

    const out = await fetch(`${BASE2}/api/org/billing`, {
      headers: { Cookie: cookies.header() },
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(out.status, 200);
    const body = await out.json();
    assert.deepEqual(body, {
      mode: 'paid', live: false, enabled: false, checkout: null, portal: null, billing: null,
    });
  });

  test('a portal URL that is not https is refused at boot, and says so', async () => {
    /*
     * A property of the URL rather than of the moment, so it can never work
     * and belongs in the log at boot rather than in front of a customer —
     * §38's refuse/warn split. The alternative renders as a button that goes
     * nowhere, which a subscriber cannot tell from the provider being down.
     *
     * Asserted on the server's own OUTPUT, because the response is `null`
     * either way: a deployment with no portal and one with a broken portal
     * both answer `portal: null`, and only the log distinguishes them. §40's
     * refused-413 finding, in a new place.
     */
    assert.match(serverLog, /DODO_PORTAL_URL is not an https URL/);
  });
});
