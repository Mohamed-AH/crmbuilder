/*
 * enforcement.test.mjs — the billing hold, driven over the real sync route.
 *
 * Ports 9000–9099 (§9), one app server, a fresh port per boot per §4. That
 * block is carved from the unclaimed 8961–9299 gap with margin on both sides,
 * because §9's own rule is that widening a block means checking the
 * neighbours and this one touches none.
 *
 * WHY THIS IS A SEPARATE FILE rather than more cases in payments.test.mjs:
 * that file boots with `BILLING_MODE: 'paid'` from the ENVIRONMENT, so its
 * `setAt` is 0 and `billingHoldApplies` deliberately enforces nothing there
 * (see the env-only test below). Flipping the stored mode inside it to get a
 * real `setAt` would leak into every test after it — §16's rule, which §80's
 * `withFreeMode` already has to work around for a much smaller change.
 *
 * WHY IT IS DRIVEN THROUGH `POST /api/sync` rather than by calling the
 * predicate: the thing most likely to be wrong is not the arithmetic, which
 * §78 already tests. It is whether the hold reaches the seam at all, whether
 * the PULL still runs while the push is refused, and whether the reason a
 * customer reads says what it is supposed to. None of that is visible from a
 * unit test of a boolean.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { signWebhook, TEST_SECRET } from './sign-webhook.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE_PORT = 9000;
const HOOK = '/api/payments/dodo';
const DAY = 86400000;

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

describe('the billing hold', () => {
  let child;
  let dataDir;
  let port;
  let base;
  let serverLog = '';
  let wsId;
  const owner = jar();

  async function req(path, { cookies, method = 'GET', body } = {}) {
    const res = await fetch(`${base}${path}`, {
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

  async function start() {
    // A fresh port per boot: rebinding one that was listening a millisecond
    // ago races, and on Windows it loses several tests away from the restart
    // that caused it (§4).
    port = BASE_PORT + Math.floor(Math.random() * 95);
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(port),
        DATA_DIR: dataDir,
        ALLOW_DEV_LOGIN: '1',
        MONGODB_URI: '',
        SESSION_SECRET: 'enforcement-secret',
        SIGNUP_MODE: 'open',
        NODE_ENV: 'test',
        DODO_WEBHOOK_SECRET: TEST_SECRET,
        /*
         * PAID from the environment, with no panel flip behind it. That is the
         * state the first test asserts holds nobody, and it is also what makes
         * the rest of this file have to flip the mode properly before any hold
         * can apply — which is the real sequence an operator goes through.
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
      try { if ((await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(1500) })).ok) break; } catch { /* not up */ }
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  /*
   * Write into the store directly, with the server stopped — §12: FileStore
   * keeps everything in memory and rewrites the whole file on save, so an
   * edit under a running server is clobbered by its next write. Copied in
   * shape from seats.test.mjs rather than shared, because a helper that boots
   * a server is coupled to that file's own env block.
   */
  async function editStore(fn) {
    child.kill();
    await new Promise((r) => { child.once('exit', r); setTimeout(r, 2000); });
    const file = join(dataDir, 'store.json');
    const raw = JSON.parse(await readFile(file, 'utf8'));
    fn(raw);
    await writeFile(file, JSON.stringify(raw));
    await start();
  }

  /* A push that carries one record, so "the push was refused" is observable
   * as more than a status: the row must not be on the server afterwards. */
  let recordSeq = 0;
  async function push(cookies = owner) {
    recordSeq += 1;
    const id = `rec-${recordSeq}`;
    const res = await req('/api/sync', {
      method: 'POST',
      cookies,
      body: {
        since: 0,
        records: [{ id, moduleId: 'mod-1', updatedAt: Date.now(), doc: { id, moduleId: 'mod-1', data: {} } }],
      },
    });
    return { ...res, id };
  }

  async function deliver(payload) {
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    const signed = signWebhook({ body });
    const res = await fetch(`${base}${HOOK}`, {
      method: 'POST',
      headers: signed.headers,
      body: signed.body,
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json };
  }

  /*
   * A monotonic clock, for §74's reason: staleness is the mechanism the
   * webhook route is built on, so two hand-picked timestamps next to each
   * other is the one thing not to do in a file that delivers more than one
   * event.
   */
  let clockSeq = 0;
  function laterClock() {
    clockSeq += 1;
    return new Date(Date.UTC(2026, 10, clockSeq, 9, 0, 0)).toISOString();
  }

  function subscriptionEvent(overrides = {}) {
    const { at, type, ...rest } = overrides;
    return {
      business_id: 'bus_test_crmbuilder',
      type: type || 'subscription.active',
      timestamp: at || laterClock(),
      data: {
        payload_type: 'Subscription',
        subscription_id: 'sub_enforce_0001',
        status: 'active',
        next_billing_date: '2026-12-13T09:00:00Z',
        metadata: { wsId },
        ...rest,
      },
    };
  }

  /* Flip the mode through the panel, which is what gives it a real `setAt`. */
  async function setMode(mode) {
    const res = await req('/api/admin/billing-mode', { method: 'PUT', cookies: owner, body: { mode } });
    assert.equal(res.status, 200, `could not set mode ${mode}: ${res.text}`);
    return res.json;
  }

  async function setWindows(grandfatherMonths, noticeDays) {
    const res = await req('/api/admin/billing-windows', {
      method: 'PUT', cookies: owner, body: { grandfatherMonths, noticeDays },
    });
    assert.equal(res.status, 200, `could not set windows: ${res.text}`);
  }

  before(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'crmb-enforce-'));
    await start();
    // The FIRST account on a deployment is the platform admin (§21), which is
    // what lets this same jar flip the lever and push records.
    const o = await req('/auth/dev', { method: 'POST', body: { email: 'enforce-owner@team.test' }, cookies: owner });
    wsId = o.json.user.orgId;
    assert.equal(o.json.user.role, 'platformAdmin', 'the first account must be the platform admin for this file to drive the levers');
  });

  after(async () => {
    if (child) child.kill();
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  });

  /* ------------------------------------------------------------------ *
   * The two states that must hold NOBODY
   * ------------------------------------------------------------------ */

  test('an environment-only paid mode holds nobody, because it can name no notice', async () => {
    /*
     * `BILLING_MODE: 'paid'` is set on this server and no operator has
     * flipped anything, so `billingMode()` reports paid with `setAt: 0`.
     *
     * Without the guard this is the worst reachable outcome in the feature:
     * `billingGraceUntil` needs that date to compute any window at all, so
     * every workspace falls to the no-window branch and is held the instant
     * the variable is set — no notice, nothing on screen beforehand, and the
     * free-mode card (§80) promising the opposite. An environment variable
     * must never be what takes somebody's sync away.
     */
    /*
     * THE WORKSPACE HAS TO BE OLD AND THE WINDOWS ZERO, or this test passes
     * whatever the guard does — which is what the first version did.
     *
     * With the guard removed, a seconds-old workspace falls to the no-window
     * branch and is saved by the notice floor counted from its own
     * `createdAt`: thirty days in the future, so not held, so green. The
     * assertion could not see its own mutation (§78's shape). Ageing it past
     * any floor is what leaves the guard as the only thing standing between
     * this push and a refusal.
     */
    await editStore((raw) => {
      const org = raw.orgs.find((o) => o.id === wsId);
      assert.ok(org, 'planting failed: the owner org is not in the store');
      org.createdAt = Date.now() - 730 * DAY;
    });
    await setWindows(0, 0);

    const mode = (await req('/api/admin/platform', { cookies: owner })).json.billing;
    assert.equal(mode.mode, 'paid');
    assert.equal(mode.setAt, 0, 'the env path must leave setAt at 0, or this test is not testing the env path');

    const res = await push();
    assert.equal(res.status, 200);
    assert.equal(res.json.readOnly, undefined, `held with no flip date: ${res.text}`);
    assert.equal(res.json.pushed, 1, 'the one record in the push must have landed');
  });

  test('free mode holds nobody, however old the workspace and however unpaid', async () => {
    /*
     * The stored decision beats the environment (§16), so this is `free` over
     * an env that says `paid` — and with the windows at zero, which is the
     * configuration every later test in this file uses to be past grace. So
     * the only thing standing between this workspace and a hold is the mode
     * itself, which is what makes this an assertion about the mode rather
     * than about the arithmetic.
     *
     * It inherits the two-year-old `createdAt` planted by the test above, so
     * every date here is comfortably past every window — the mode is the only
     * variable left.
     */
    await setMode('free');
    await setWindows(0, 0);
    const res = await push();
    assert.equal(res.status, 200);
    assert.equal(res.json.readOnly, undefined, `free mode held a workspace: ${res.text}`);
    assert.equal(res.json.pushed, 1, 'the one record in the push must have landed');
  });

  /* ------------------------------------------------------------------ *
   * The hold itself
   * ------------------------------------------------------------------ *
   *
   * Everything below depends on the mode being flipped THROUGH THE PANEL, so
   * `setAt` is real, and on the windows being zero so "past grace" is true a
   * moment later. Driving it with a zero window rather than a planted
   * year-old `createdAt` is deliberate: the date arithmetic is §78's tested
   * ground, and what these cover is the hold reaching the seam. Stated
   * because a reader who reorders this file gets a null `setAt` and tests
   * that pass for the wrong reason.
   */

  test('past grace with no subscription: the push is refused, the pull still runs, and the reason says what is still possible', async () => {
    await setMode('paid');
    await setWindows(0, 0);

    const res = await push();
    assert.equal(res.status, 200, 'a hold is a 200 carrying readOnly, never an error status');
    assert.equal(res.json.readOnly, true, `not held past grace with no subscription: ${res.text}`);
    assert.equal(res.json.pushed, undefined);

    /*
     * The PULL ran. §24 stage B's rule: a suspended workspace is read-only
     * rather than cut off, so everyone keeps what they had and picks up what
     * a colleague synced before the hold. `serverTime` is on both shapes;
     * `modules` and `records` being present is what says a pull happened.
     */
    assert.ok(Array.isArray(res.json.records), 'the pull must still run while the push is refused');
    assert.ok(Array.isArray(res.json.modules));

    /*
     * The wording IS the behaviour on this one — it is the only read-only
     * message that has to tell somebody what is still possible, and it is the
     * sentence they will quote back if it is wrong. All three clauses, because
     * a message naming only what stopped would be accurate and would read as
     * data loss.
     */
    assert.match(res.json.readOnlyReason, /sync is paused/i);
    assert.match(res.json.readOnlyReason, /nothing has been deleted/i);
    assert.match(res.json.readOnlyReason, /export/i);

    // And the refused row really is absent, rather than merely unacknowledged.
    const pulled = await req('/api/sync?since=0', { cookies: owner });
    assert.equal(pulled.json.records.filter((r) => r.id === res.id).length, 0, 'the refused record reached the server');
  });

  test('a live subscription is never held, even with the windows at zero', async () => {
    await setMode('paid');
    await setWindows(0, 0);
    const ev = await deliver(subscriptionEvent({ status: 'active' }));
    assert.equal(ev.status, 200);
    assert.equal(ev.json.applied, true, `the delivery was not applied: ${JSON.stringify(ev.json)}`);

    const res = await push();
    assert.equal(res.json.readOnly, undefined, `a paying workspace was held: ${res.text}`);
    assert.equal(res.json.pushed, 1, 'the one record in the push must have landed');
  });

  test('paying releases the hold on the very next push, with no scheduler in between', async () => {
    /*
     * The whole reason the hold is derived rather than stored (§40's dead
     * ping): a held workspace that pays must not wait for a pass that may
     * never run. Cancel, confirm the hold, pay, confirm it is gone — in three
     * consecutive requests with nothing scheduled anywhere.
     */
    await setMode('paid');
    await setWindows(0, 0);

    await deliver(subscriptionEvent({ type: 'subscription.cancelled', status: 'cancelled' }));
    const held = await push();
    assert.equal(held.json.readOnly, true, `cancelling did not produce a hold: ${held.text}`);

    await deliver(subscriptionEvent({ status: 'active' }));
    const freed = await push();
    assert.equal(freed.json.readOnly, undefined, `paying did not release the hold: ${freed.text}`);
    assert.equal(freed.json.pushed, 1, 'the one record in the push must have landed');
  });

  /* ------------------------------------------------------------------ *
   * The two precedence rules
   * ------------------------------------------------------------------ */

  test('the operator hold wins over a derived billing hold, and lifting it reveals the billing one', async () => {
    /*
     * §78 chose this precedence for a stored `billingSuspendedAt`; the hold is
     * DERIVED now, so the pairing is new and the reasoning is unchanged. A
     * billing hold has an action the customer can take and a storage pause
     * does not, so naming the billing cause while both are in force tells
     * somebody to pay and leaves them read-only afterwards — money taken,
     * nothing restored, and a dispute that is entirely ours (§3).
     */
    await setMode('paid');
    await setWindows(0, 0);
    await deliver(subscriptionEvent({ type: 'subscription.cancelled', status: 'cancelled' }));

    const billingOnly = await push();
    assert.match(billingOnly.json.readOnlyReason, /sync is paused/i, 'precondition: the billing hold must be in force');

    await req(`/api/admin/orgs/${wsId}/suspend`, {
      method: 'POST', cookies: owner, body: { suspend: true, reason: 'Storage review' },
    });
    const both = await push();
    assert.equal(both.json.readOnly, true);
    assert.match(both.json.readOnlyReason, /Storage review/, 'the operator reason must win while both hold');

    await req(`/api/admin/orgs/${wsId}/suspend`, { method: 'POST', cookies: owner, body: { suspend: false } });
    const revealed = await push();
    assert.equal(revealed.json.readOnly, true, 'lifting the operator hold must reveal the billing one, not free the workspace');
    assert.match(revealed.json.readOnlyReason, /sync is paused/i);
  });

  test('a per-org exemption holds the workspace writable past the window', async () => {
    await setMode('paid');
    await setWindows(0, 0);
    await deliver(subscriptionEvent({ type: 'subscription.cancelled', status: 'cancelled' }));
    assert.equal((await push()).json.readOnly, true, 'precondition: the workspace must be held before the exemption');

    const until = new Date(Date.now() + 400 * DAY).toISOString().slice(0, 10);
    const ex = await req(`/api/admin/orgs/${wsId}/billing-exempt`, {
      method: 'POST', cookies: owner, body: { until },
    });
    assert.equal(ex.status, 200, ex.text);

    const res = await push();
    assert.equal(res.json.readOnly, undefined, `an exempt workspace was held: ${res.text}`);

    // Cleared, so the tests after this one are not silently exempt.
    await req(`/api/admin/orgs/${wsId}/billing-exempt`, { method: 'POST', cookies: owner, body: { until: null } });
    assert.equal((await push()).json.readOnly, true, 'clearing the exemption must restore the hold');
  });

  /* ------------------------------------------------------------------ *
   * The branch with no grandfather window at all
   * ------------------------------------------------------------------ */

  test('a workspace created after the switch gets the notice floor from its own creation', async () => {
    /*
     * `billingGraceUntil` returns null for an org created AFTER the flip with
     * no override, and reading that as "no free period, hold now" would make a
     * fresh signup read-only before they had reached a checkout button —
     * nothing in this product gates signup on payment. So the floor is counted
     * from their own `createdAt` instead.
     *
     * Both halves are asserted, and the second is what makes the first mean
     * something: a floor of infinity would also pass "not held immediately".
     */
    await setMode('paid');
    await setWindows(0, 30);

    const latecomer = jar();
    const l = await req('/auth/dev', { method: 'POST', body: { email: 'enforce-late@team.test' }, cookies: latecomer });
    const lateOrg = l.json.user.orgId;
    assert.ok(lateOrg && lateOrg !== wsId, 'the latecomer must land in its own org');

    const fresh = await push(latecomer);
    assert.equal(fresh.json.readOnly, undefined, `a brand-new signup was held immediately: ${fresh.text}`);

    /*
     * Age it past the floor — and the FLIP DATE has to move with it, which is
     * the thing the first version of this test got wrong.
     *
     * `billingGraceUntil` branches on `createdAt < setAt`. Ageing `createdAt`
     * alone carries the workspace OUT of the null-window branch and into the
     * grandfathered one, where a zero-month window plus a thirty-day floor
     * puts its grace date a month in the FUTURE — so it was correctly not
     * held, by a code path this test does not name. Moving `setAt` further
     * back keeps `createdAt > setAt` true, which is what keeps this on the
     * branch under test.
     *
     * Thirty-one days, so the boundary is not the thing being tested either.
     */
    await editStore((raw) => {
      const org = raw.orgs.find((o) => o.id === lateOrg);
      assert.ok(org, 'planting failed: the latecomer org is not in the store');
      org.createdAt = Date.now() - 31 * DAY;
      raw.platform.billingModeSetAt = Date.now() - 60 * DAY;
      assert.ok(org.createdAt > raw.platform.billingModeSetAt,
        'the plant must leave this org on the no-window branch, or the test proves nothing');
    });

    const aged = await push(latecomer);
    assert.equal(aged.json.readOnly, true, `past the notice floor and still writable: ${aged.text}`);
    assert.match(aged.json.readOnlyReason, /sync is paused/i);
  });
});
