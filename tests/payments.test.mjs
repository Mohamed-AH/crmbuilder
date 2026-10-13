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
import { mkdtemp, rm } from 'node:fs/promises';
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
     */
    await deliver(subscriptionEvent({
      at: '2026-10-13T18:00:00Z',
      customer: { email: 'payer@example.com', name: 'A Real Person' },
      billing: { street: '1 Example Road', city: 'Leeds', country: 'GB' },
    }));

    const dump = JSON.stringify(await billingNow());
    for (const leaked of ['payer@example.com', 'A Real Person', 'Example Road', 'Leeds']) {
      assert.equal(dump.includes(leaked), false, `the billing record carried ${leaked}`);
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
});
