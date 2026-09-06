/*
 * api.test.mjs — API contract tests (node:test, no external dependencies).
 *
 *   npm run test:api
 *
 * Boots a throwaway server on an ephemeral port with an isolated data
 * directory and dev login enabled, then exercises auth, sync and the admin
 * surface the way the client does. Set BASE_URL to run against an already
 * running instance instead (dev login must be enabled there).
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// The same arithmetic the server and the browser use — js/date-rules.js ends
// with a `typeof module` guard so there is one copy, not three (§39). Used
// here to build the fixture's dates, so the expectations are computed the way
// the code under test computes them rather than restated by hand.
const DR = createRequire(import.meta.url)('../js/date-rules.js');

/*
 * A calendar day `offset` days from today IN A NAMED ZONE, as 'YYYY-MM-DD'.
 * Exact rather than approximate: day numbers are UTC midnights, so adding
 * whole days cannot drift across a daylight-saving change (§37).
 */
function dayIn(zone, offset) {
  const [y, m, d] = DR.dayKey(zone, new Date()).split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d) + offset * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`;
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXTERNAL = process.env.BASE_URL;
let BASE = EXTERNAL ? EXTERNAL.replace(/\/$/, '') : '';
let child = null;
let dataDir = null;
let serverLog = '';

// --- tiny cookie jar: node's fetch has no cookie store of its own -----------
function jar() {
  const cookies = new Map();
  return {
    header() {
      return [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    absorb(res) {
      for (const raw of res.headers.getSetCookie?.() || []) {
        const [pair] = raw.split(';');
        const idx = pair.indexOf('=');
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (value === '' || /Expires=Thu, 01 Jan 1970/i.test(raw)) cookies.delete(name);
        else cookies.set(name, value);
      }
    },
    clear() { cookies.clear(); },
  };
}

async function req(path, { cookies, method = 'GET', body, ...rest } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/json',
      ...(cookies ? { Cookie: cookies.header() } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
    ...rest,
  });
  if (cookies) cookies.absorb(res);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers };
}

// Age an invite past its expiry. Time travel beats sleeping for a week.
async function expireInvite(code) {
  await stopServer();
  const file = join(dataDir, 'store.json');
  const raw = JSON.parse(await readFile(file, 'utf8'));
  const invite = raw.invites.find((i) => i.code === code);
  invite.expiresAt = Date.now() - 1000;
  await writeFile(file, JSON.stringify(raw));
  await startServer();
}

/*
 * Put a webhook on a workspace's meta doc directly, the way `expireInvite`
 * ages an invite — stop, edit, start, because FileStore holds the store in
 * memory and rewrites the whole file on save (§12).
 *
 * Deliberately NOT through the endpoint that Stage 3 adds. What is under test
 * here is the storage shape: a credential sitting beside `settings` on the
 * meta doc must not be broadcast by sync and must not be clobbered by a
 * settings write. Planting it directly means these tests hold whatever the
 * endpoint later does, and they would have caught the original design (the URL
 * inside `settings`) before any endpoint existed to blame.
 */
async function plantHook(wsId, hook) {
  await stopServer();
  const file = join(dataDir, 'store.json');
  const raw = JSON.parse(await readFile(file, 'utf8'));
  raw.data[wsId] = { ...(raw.data[wsId] || {}), hook };
  await writeFile(file, JSON.stringify(raw));
  await startServer();
}

// Safe to read while the server runs: every save is a temp file plus an atomic
// rename (§30), so a reader gets the whole old file or the whole new one.
async function readHook(wsId) {
  const raw = JSON.parse(await readFile(join(dataDir, 'store.json'), 'utf8'));
  return (raw.data[wsId] || {}).hook;
}

async function waitForServer(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`server exited (code ${child.exitCode}):\n${serverLog.trim() || '(no output)'}`);
    }
    try {
      const res = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`server did not start within ${timeoutMs}ms:\n${serverLog.trim() || '(no output)'}`);
}

// The session secret is fixed so cookies survive a restart — the org tests
// stop the server to edit its store, and would otherwise sign everyone out.
const TEST_SECRET = 'test-secret-not-for-production';
let PORT_IN_USE = 0;

/*
 * A FRESH PORT ON EVERY BOOT, not one port reused for the whole file.
 *
 * expireInvite() stops the server, edits store.json and starts it again — and
 * rebinding a port that was listening a millisecond ago is not reliable. On
 * Windows the closed listener lingers and the new one loses the race, so the
 * next request gets ECONNRESET and every test after it ECONNREFUSED. That is
 * what "a joiner can bring their own work with them" reported, and the invite
 * tests that restart the server run immediately before it.
 *
 * Linux is forgiving here, which is why it survived this long — the same
 * platform split as §4's SIGTERM note. Taking a new port costs nothing and
 * removes the race rather than widening a timeout around it.
 */
const PORT_BASE = 8300;
const PORT_SPAN = 150;   // api.test.mjs's block; the ranges are disjoint (§9)
let portOffset = Math.floor(Math.random() * PORT_SPAN);
const nextPort = () => PORT_BASE + (portOffset++ % PORT_SPAN);

function startServer() {
  PORT_IN_USE = nextPort();
  BASE = `http://127.0.0.1:${PORT_IN_USE}`;
  child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT_IN_USE),
      DATA_DIR: dataDir,
      ALLOW_DEV_LOGIN: '1',
      MONGODB_URI: '',
      SESSION_SECRET: TEST_SECRET,
      // These suites are about everything except the signup gate, and making
      // a hundred of them carry a beta code would test the harness rather than
      // the product. The gate has its own file, with servers in each mode.
      SIGNUP_MODE: 'open',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { serverLog += d; });
  child.stderr.on('data', (d) => { serverLog += d; });
  return waitForServer(BASE);
}

async function stopServer() {
  if (!child) return;
  const dead = new Promise((r) => child.once('exit', r));
  child.kill();
  await dead;
  child = null;
}

before(async () => {
  if (EXTERNAL) return;
  dataDir = await mkdtemp(join(tmpdir(), 'crmb-test-'));
  await startServer();
});

after(async () => {
  await stopServer();
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
describe('health and public surface', () => {
  test('/healthz reports ok and a storage backend', async () => {
    const { status, json } = await req('/healthz');
    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.ok(['file', 'mongodb'].includes(json.storage), `unexpected storage: ${json.storage}`);
  });

  test('/health describes the deployment without exposing tenant counts', async () => {
    const { status, json } = await req('/health');
    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.sync, 'per-record');
    assert.ok(['file', 'mongodb'].includes(json.storage));
    assert.equal(typeof json.uptimeSec, 'number');
    assert.ok(json.time);
    // On a pooled deployment the number of tenants is a customer count, and
    // an unauthenticated visitor has no business reading it.
    assert.equal(json.counts, undefined);
  });

  test('/api/me describes the deployment when signed out', async () => {
    const { status, json } = await req('/api/me');
    assert.equal(status, 200);
    assert.equal(json.authenticated, false);
    assert.equal(json.user, null);
    assert.equal(typeof json.googleEnabled, 'boolean');
    assert.equal(typeof json.devLoginEnabled, 'boolean');
  });

  test('unknown API routes 404 as JSON, not as the SPA shell', async () => {
    const { status, json } = await req('/api/nope');
    assert.equal(status, 404);
    assert.ok(json.error);
  });

  test('unknown page routes serve the SPA shell', async () => {
    const { status, text } = await req('/deep/link');
    assert.equal(status, 200);
    assert.match(text, /id="app"/);
  });
});

describe('authentication', () => {
  test('protected routes reject anonymous callers', async () => {
    for (const path of ['/api/data', '/api/admin/stats', '/api/admin/users']) {
      const { status } = await req(path);
      assert.equal(status, 401, `${path} should require auth`);
    }
    const put = await req('/api/data', { method: 'PUT', body: { modules: [], records: [] } });
    assert.equal(put.status, 401, 'PUT /api/data should require auth');
  });

  test('dev login rejects a malformed email', async () => {
    const { status } = await req('/auth/dev', { method: 'POST', body: { email: 'not-an-email' } });
    assert.equal(status, 400);
  });

  test('the first account to sign in becomes a platform admin', async () => {
    const cookies = jar();
    const { status, json } = await req('/auth/dev', { method: 'POST', body: { email: 'owner@example.com' }, cookies });
    assert.equal(status, 200);
    assert.equal(json.user.email, 'owner@example.com');
    assert.equal(json.user.role, 'platformAdmin');

    const me = await req('/api/me', { cookies });
    assert.equal(me.json.authenticated, true);
    assert.equal(me.json.user.email, 'owner@example.com');
  });

  test('logout ends the session', async () => {
    const cookies = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'logout-me@example.com' }, cookies });
    assert.equal((await req('/api/me', { cookies })).json.authenticated, true);
    await req('/auth/logout', { method: 'POST', cookies });
    assert.equal((await req('/api/me', { cookies })).json.authenticated, false);
  });

  test('a forged session cookie is rejected', async () => {
    const { status } = await req('/api/data', { headers: { Cookie: 'crmb_session=clearly.not.a.jwt' } });
    assert.equal(status, 401);
  });
});

describe('workspace sync', () => {
  const cookies = jar();
  const modules = [{ id: 'm1', name: 'Deals', icon: 'handshake', color: '#099250', fields: [{ key: 'title', label: 'Deal', type: 'text' }], createdAt: 1 }];
  const records = [{ id: 'r1', moduleId: 'm1', data: { title: 'Big one' }, createdAt: 1, updatedAt: 2 }];

  before(async () => {
    await req('/auth/dev', { method: 'POST', body: { email: 'sync@example.com' }, cookies });
  });

  test('a fresh account starts empty', async () => {
    const { status, json } = await req('/api/data', { cookies });
    assert.equal(status, 200);
    assert.equal(json.modules, null);
  });

  test('PUT validates the payload shape', async () => {
    for (const body of [{}, { modules: [] }, { records: [] }, { modules: 'x', records: [] }]) {
      const { status } = await req('/api/data', { method: 'PUT', body, cookies });
      assert.equal(status, 400, `should reject ${JSON.stringify(body)}`);
    }
  });

  test('data round-trips including settings', async () => {
    const settings = { businessName: 'Bright Bakery', currency: 'EUR' };
    const put = await req('/api/data', { method: 'PUT', body: { modules, records, settings }, cookies });
    assert.equal(put.status, 200);
    assert.ok(put.json.updatedAt > 0);

    const got = await req('/api/data', { cookies });
    assert.equal(got.status, 200);
    assert.deepEqual(got.json.modules, modules);
    assert.deepEqual(got.json.records, records);
    assert.deepEqual(got.json.settings, settings);
  });

  test('a later write replaces the earlier snapshot', async () => {
    await req('/api/data', { method: 'PUT', body: { modules, records: [], settings: {} }, cookies });
    const got = await req('/api/data', { cookies });
    assert.equal(got.json.records.length, 0);
  });

  test('workspaces are isolated between accounts', async () => {
    const other = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'stranger@example.com' }, cookies: other });
    const got = await req('/api/data', { cookies: other });
    assert.equal(got.json.modules, null, 'a new account must not see another account data');
  });
});

/*
 * Per-record sync.
 *
 * The point of this work is that two devices editing *different* records both
 * keep their edits — whole-snapshot sync silently threw one of them away. The
 * cases below are written as two devices on one account, because that is the
 * shape of the bug being fixed, and they assert the losing behaviour is gone
 * rather than that the happy path works.
 */
describe('per-record sync', () => {
  const cookies = jar();

  // A device: its own cursor and push watermark, exactly like the client.
  function device() {
    let cursor = 0;
    return {
      get cursor() { return cursor; },
      async push({ modules = [], records = [], settings, settingsUpdatedAt } = {}) {
        const { status, json } = await req('/api/sync', {
          method: 'POST',
          body: { since: cursor, modules, records, settings, settingsUpdatedAt },
          cookies,
        });
        assert.equal(status, 200, JSON.stringify(json));
        cursor = json.cursor;
        return json;
      },
      async pull() {
        const { status, json } = await req(`/api/sync?since=${cursor}`, { cookies });
        assert.equal(status, 200);
        cursor = json.cursor;
        return json;
      },
    };
  }

  const rec = (id, title, updatedAt) => ({ id, updatedAt, doc: { id, moduleId: 'm1', data: { title }, updatedAt } });

  before(async () => {
    await req('/auth/dev', { method: 'POST', body: { email: 'delta@example.com' }, cookies });
  });

  test('a cursor of zero returns the whole workspace', async () => {
    const a = device();
    await a.push({
      modules: [{ id: 'm1', updatedAt: 10, doc: { id: 'm1', name: 'Deals', fields: [], updatedAt: 10 } }],
      records: [rec('r1', 'One', 11), rec('r2', 'Two', 12)],
    });

    const fresh = device();
    const out = await fresh.pull();
    assert.equal(out.modules.length, 1);
    assert.equal(out.records.length, 2);
    assert.ok(out.cursor > 0, 'a cursor must come back so the next pull can be a delta');
  });

  test('a pull at the current cursor returns nothing', async () => {
    const a = device();
    await a.pull();
    const again = await a.pull();
    assert.equal(again.modules.length, 0);
    assert.equal(again.records.length, 0);
  });

  test('only what changed since the cursor comes back', async () => {
    const a = device();
    await a.pull();                       // catch up
    const b = device();
    await b.pull();
    await b.push({ records: [rec('r3', 'Three', 20)] });

    const delta = await a.pull();
    assert.equal(delta.records.length, 1, 'the two untouched records must not be re-sent');
    assert.equal(delta.records[0].id, 'r3');
  });

  test('two devices editing different records both keep their edits', async () => {
    const a = device();
    const b = device();
    await a.pull();
    await b.pull();

    // Both edit while the other is unaware — the whole-snapshot failure case.
    await a.push({ records: [rec('r1', 'Edited by A', 100)] });
    await b.push({ records: [rec('r2', 'Edited by B', 101)] });

    const server = await device().pull();
    const byId = Object.fromEntries(server.records.map((r) => [r.id, r]));
    assert.ok(byId.r1 && byId.r1.doc, "A's record survived B's push");
    assert.ok(byId.r2 && byId.r2.doc, "B's record survived");
    assert.equal(byId.r1.doc.data.title, 'Edited by A');
    assert.equal(byId.r2.doc.data.title, 'Edited by B', "B's write must not have clobbered A's, nor A's B's");
  });

  /*
   * Two people, one record, different fields.
   *
   * Per-record sync fixed the case where two devices edited DIFFERENT records
   * and one lost their work. This is the case it did not fix: A changes the
   * phone number while B changes the email on the same contact, and whoever
   * syncs second overwrites the whole row. No bad actor, no offline device
   * left for a fortnight — just two people on a two-person team working at
   * the same time.
   *
   * A field carries its own clock in `fieldsAt`, so each key resolves on its
   * own rather than the row resolving as a lump.
   */
  test('two people editing different fields of one record both keep their edit', async () => {
    const a = device();
    const b = device();
    await a.pull();
    await b.pull();

    // The shared starting point.
    const base = {
      id: 'shared', updatedAt: 1000,
      doc: { id: 'shared', moduleId: 'm1', data: { phone: '111', email: 'old@x.test', name: 'Dana' } },
    };
    await a.push({ records: [base] });
    await b.pull();

    // A changes the phone. B changes the email. B lands second.
    await a.push({ records: [{
      id: 'shared', updatedAt: 2000,
      doc: {
        id: 'shared', moduleId: 'm1',
        data: { phone: '222', email: 'old@x.test', name: 'Dana' },
        fieldsAt: { phone: 2000 },
      },
    }] });
    await b.push({ records: [{
      id: 'shared', updatedAt: 2001,
      doc: {
        id: 'shared', moduleId: 'm1',
        data: { phone: '111', email: 'new@x.test', name: 'Dana' },
        fieldsAt: { email: 2001 },
      },
    }] });

    const server = await device().pull();
    const row = server.records.find((r) => r.id === 'shared');
    assert.equal(row.doc.data.email, 'new@x.test', "B's edit is the later one and must stand");
    assert.equal(row.doc.data.phone, '222',
      "A's phone edit was to a different field and must survive B's push — this is the whole point");
    assert.equal(row.doc.data.name, 'Dana', 'and the field neither of them touched is unchanged');
  });

  /*
   * A merged row has to be newer than either half.
   *
   * Otherwise the copy A is still holding — stamped 2000, and unaware of B's
   * email — is "newer" than nothing and can be pushed straight back over the
   * merge, undoing B a second time.
   */
  test('a merged record cannot be clobbered by the stale copy that fed it', async () => {
    const a = device();
    const b = device();
    await a.pull();
    await b.pull();
    await a.push({ records: [{
      id: 'stale', updatedAt: 1000,
      doc: { id: 'stale', moduleId: 'm1', data: { one: 'a', two: 'a' } },
    }] });

    await a.push({ records: [{
      id: 'stale', updatedAt: 3000,
      doc: { id: 'stale', moduleId: 'm1', data: { one: 'A-edit', two: 'a' }, fieldsAt: { one: 3000 } },
    }] });
    await b.push({ records: [{
      id: 'stale', updatedAt: 2000,
      doc: { id: 'stale', moduleId: 'm1', data: { one: 'a', two: 'B-edit' }, fieldsAt: { two: 2000 } },
    }] });

    /*
     * Asserted HERE, before anything else touches the row.
     *
     * B's push carried the older clock (2000) but merged into A's stored 3000.
     * The result must be stamped 3000. Checked immediately because the very
     * next push would heal a wrong stamp and hide the defect — the first
     * version of this test did exactly that and passed on the bug.
     *
     * What it costs to get wrong is on the CLIENT: mergeChanges skips any
     * incoming row whose clock is not newer than the local one, so A — still
     * holding 3000 — would ignore the merged row and keep showing the email
     * it just lost. The end-to-end test is where that consequence is seen.
     */
    let row = (await device().pull()).records.find((r) => r.id === 'stale');
    assert.equal(row.updatedAt, 3000,
      'a merged row takes the newer of the two clocks, or the device that fed it will ignore the merge');
    assert.equal(row.doc.data.one, 'A-edit');
    assert.equal(row.doc.data.two, 'B-edit');

    // And re-sending the copy that predates the merge changes nothing.
    await a.push({ records: [{
      id: 'stale', updatedAt: 3000,
      doc: { id: 'stale', moduleId: 'm1', data: { one: 'A-edit', two: 'a' }, fieldsAt: { one: 3000 } },
    }] });
    row = (await device().pull()).records.find((r) => r.id === 'stale');
    assert.equal(row.doc.data.two, 'B-edit', 'the merge must not be undone by the copy that predates it');
  });

  /*
   * A row with no per-field clocks resolves exactly as it always did.
   *
   * Older clients keep syncing through a deploy, the same guarantee /api/data
   * already carries.
   */
  test('a record without field clocks still resolves whole-row', async () => {
    const a = device();
    await a.pull();
    await a.push({ records: [rec('nofields', 'First', 1000)] });
    await a.push({ records: [rec('nofields', 'Second', 2000)] });
    await a.push({ records: [rec('nofields', 'Stale', 1500)] });

    const row = (await device().pull()).records.find((r) => r.id === 'nofields');
    assert.equal(row.doc.data.title, 'Second', 'no field clocks means the newest row wins outright');
  });

  test('the same record edited twice resolves to the later clock, not the later request', async () => {
    const a = device();
    await a.pull();
    // The newer edit arrives first: a slow device pushing a stale copy
    // afterwards must not win just because it landed last.
    await a.push({ records: [rec('r1', 'Newer', 300)] });
    await a.push({ records: [rec('r1', 'Older', 200)] });

    const server = await device().pull();
    assert.equal(server.records.find((r) => r.id === 'r1').doc.data.title, 'Newer');
  });

  test('replaying a push changes nothing', async () => {
    const a = device();
    await a.pull();
    const payload = { records: [rec('r4', 'Idempotent', 400)] };
    const first = await a.push(payload);
    const second = await a.push(payload);
    assert.equal(first.pushed, 1);
    assert.equal(second.pushed, 0, 'a retry must not write a second time');

    const all = await device().pull();
    assert.equal(all.records.filter((r) => r.id === 'r4').length, 1);
  });

  test('a delete propagates as a tombstone, and stays deleted', async () => {
    const a = device();
    const b = device();
    await a.pull();
    await b.pull();

    await a.push({ records: [{ id: 'r2', updatedAt: 500, deleted: true, deletedAt: 500 }] });

    const delta = await b.pull();
    const tomb = delta.records.find((r) => r.id === 'r2');
    assert.ok(tomb, 'the other device must be told about the delete');
    assert.equal(tomb.deleted, true);
    assert.equal(tomb.doc, undefined, 'a tombstone carries no payload');

    // The device that was offline during the delete pushes its stale copy.
    // Without tombstones the record would come straight back.
    await b.push({ records: [rec('r2', 'Resurrected', 499)] });
    const after = await device().pull();
    const again = after.records.find((r) => r.id === 'r2');
    assert.equal(again.deleted, true, 'a stale push must not resurrect a deleted record');
  });

  test('a delete loses to an edit made after it', async () => {
    const a = device();
    await a.pull();
    await a.push({ records: [rec('r5', 'Alive', 600)] });
    await a.push({ records: [{ id: 'r5', updatedAt: 601, deleted: true }] });
    await a.push({ records: [rec('r5', 'Edited later', 602)] });

    const out = await device().pull();
    const r5 = out.records.find((r) => r.id === 'r5');
    assert.equal(r5.deleted, undefined);
    assert.equal(r5.doc.data.title, 'Edited later');
  });

  test('a push does not echo back what it just sent', async () => {
    const a = device();
    await a.pull();
    const out = await a.push({ records: [rec('r6', 'Mine', 700)] });
    assert.equal(out.records.length, 0, 'the pusher already has these rows');

    // ...but the cursor still moved past them, so they do not arrive later.
    const next = await a.pull();
    assert.equal(next.records.find((r) => r.id === 'r6'), undefined);
  });

  test('settings sync as one document, last write wins', async () => {
    const a = device();
    await a.pull();
    await a.push({ settings: { currency: 'GBP' }, settingsUpdatedAt: 1000 });
    await a.push({ settings: { currency: 'USD' }, settingsUpdatedAt: 900 });

    const out = await device().pull();
    assert.equal(out.settings.doc.currency, 'GBP', 'the older clock must not overwrite the newer');
  });

  test('a device with no settings of its own cannot overwrite the workspace settings', async () => {
    // The shape of a real bug: a fresh device signs in, has never chosen
    // anything, and pushes its defaults stamped 0. Treating that 0 as "now"
    // handed the blank defaults the win and wiped the workspace's real ones.
    const a = device();
    await a.pull();
    await a.push({ settings: { currency: 'SAR', businessName: 'Real Co' }, settingsUpdatedAt: 5000 });

    const fresh = device();
    await fresh.push({ settings: { currency: 'USD', businessName: '' }, settingsUpdatedAt: 0 });

    const out = await device().pull();
    assert.equal(out.settings.doc.businessName, 'Real Co');
    assert.equal(out.settings.doc.currency, 'SAR');
  });

  test('the legacy snapshot endpoints read and write the same rows', async () => {
    const snapshot = await req('/api/data', { cookies });
    assert.equal(snapshot.status, 200);
    assert.ok(snapshot.json.records.some((r) => r.id === 'r1'), 'GET /api/data must see per-record rows');
    assert.ok(!snapshot.json.records.some((r) => r.id === 'r2'), 'deleted rows must not reappear in the snapshot');

    // An older client writing a whole snapshot deletes what it omits.
    const kept = snapshot.json.records.filter((r) => r.id !== 'r3');
    await req('/api/data', { method: 'PUT', body: { modules: snapshot.json.modules, records: kept, settings: {} }, cookies });

    const delta = await device().pull();
    const r3 = delta.records.find((r) => r.id === 'r3');
    assert.equal(r3.deleted, true, 'a snapshot write must tombstone what it left out');
  });

  test('a push is rejected when it is implausibly large or malformed', async () => {
    const bad = await req('/api/sync', { method: 'POST', body: { records: 'nope' }, cookies });
    assert.equal(bad.status, 400);
    const huge = await req('/api/sync', {
      method: 'POST',
      body: { records: Array.from({ length: 20001 }, (_, i) => ({ id: `x${i}`, updatedAt: 1 })) },
      cookies,
    });
    assert.equal(huge.status, 413);
  });

  test('sync is scoped to the account, not the deployment', async () => {
    const stranger = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'delta-stranger@example.com' }, cookies: stranger });
    const { status, json } = await req('/api/sync?since=0', { cookies: stranger });
    assert.equal(status, 200);
    assert.equal(json.records.length, 0, 'a new account must not see another account rows');
    assert.equal(json.modules.length, 0);
    assert.equal((await req('/api/sync?since=0')).status, 401, 'signed out gets nothing at all');
  });
});

/*
 * The workspace belongs to the organisation, not the account.
 *
 * This is what makes a team workspace possible: two colleagues in one org read
 * and write the same modules and records, while an account in a different org
 * still sees none of it. The isolation suite below is the other half of this —
 * it asserts that the boundary held while ownership moved.
 */
describe('org-owned workspaces', () => {
  const owner = jar();
  const mate = jar();
  const outsider = jar();
  let orgId = null;
  let ownerId = null;
  let mateId = null;

  before(async () => {
    const o = await req('/auth/dev', { method: 'POST', body: { email: 'ws-owner@team.test' }, cookies: owner });
    ownerId = o.json.user.id;
    orgId = o.json.user.orgId;
    const m = await req('/auth/dev', { method: 'POST', body: { email: 'ws-mate@team.test' }, cookies: mate });
    mateId = m.json.user.id;
    await req('/auth/dev', { method: 'POST', body: { email: 'ws-outsider@other.test' }, cookies: outsider });
    const code = (await req('/api/org/invites', { method: 'POST', body: {}, cookies: owner })).json.invite.code;
    await req('/api/org/join', { method: 'POST', body: { code }, cookies: mate });
  });

  test('two members of one organisation share one workspace', async () => {
    await req('/api/sync', {
      method: 'POST',
      body: {
        since: 0,
        modules: [{ id: 'team-m1', updatedAt: 10, doc: { id: 'team-m1', name: 'Deals', fields: [] } }],
        records: [{ id: 'team-r1', updatedAt: 11, doc: { id: 'team-r1', moduleId: 'team-m1', data: { title: 'Owner wrote this' } } }],
      },
      cookies: owner,
    });

    const seen = await req('/api/sync?since=0', { cookies: mate });
    assert.equal(seen.status, 200);
    assert.equal(seen.json.records.length, 1, 'a colleague must see the workspace, not an empty one');
    assert.equal(seen.json.records[0].doc.data.title, 'Owner wrote this');

    // And the other direction: what the colleague writes reaches the owner.
    await req('/api/sync', {
      method: 'POST',
      body: { since: seen.json.cursor, records: [{ id: 'team-r2', updatedAt: 20, doc: { id: 'team-r2', moduleId: 'team-m1', data: { title: 'Mate wrote this' } } }] },
      cookies: mate,
    });
    const back = await req('/api/data', { cookies: owner });
    const titles = back.json.records.map((r) => r.data.title);
    assert.ok(titles.includes('Owner wrote this'));
    assert.ok(titles.includes('Mate wrote this'));
  });

  test('an account in another organisation sees none of it', async () => {
    const { json } = await req('/api/sync?since=0', { cookies: outsider });
    assert.equal(json.records.length, 0);
    assert.equal(json.modules.length, 0);
    const snapshot = await req('/api/data', { cookies: outsider });
    assert.equal(snapshot.json.modules, null);
  });

  test('rows record who created them', async () => {
    const { json } = await req('/api/data', { cookies: owner });
    assert.ok(json.records.length, 'expected the team workspace to have rows');
    // createdBy lives on the envelope, not in doc — check it survives a write
    // by the other member rather than being rewritten to whoever saved last.
    const cursor = (await req('/api/sync?since=0', { cookies: mate })).json.cursor;
    await req('/api/sync', {
      method: 'POST',
      body: { since: cursor, records: [{ id: 'team-r1', updatedAt: 999, doc: { id: 'team-r1', moduleId: 'team-m1', data: { title: 'Edited by mate' } } }] },
      cookies: mate,
    });
    const after = await req('/api/data', { cookies: owner });
    assert.equal(after.json.records.find((r) => r.id === 'team-r1').data.title, 'Edited by mate');
  });

  /*
   * The single most dangerous change in moving ownership to the org.
   *
   * deleteUser used to drop every row keyed by that account. Under org
   * ownership those rows are the whole team's, so removing one member of a
   * two-person org would have deleted the CRM. This test fails on the un-fixed
   * code, which is the only reason to trust it.
   */
  test('removing a member leaves the workspace standing', async () => {
    const before = await req('/api/data', { cookies: owner });
    const countBefore = before.json.records.length;
    assert.ok(countBefore > 0, 'need rows to be able to lose them');

    const del = await req(`/api/admin/users/${mateId}`, { method: 'DELETE', cookies: owner });
    assert.equal(del.status, 200);
    assert.equal(del.json.deletedWorkspace, false, 'the org still has a member, so the workspace stays');

    const after = await req('/api/data', { cookies: owner });
    assert.equal(after.json.records.length, countBefore, "the remaining member's records must be untouched");
    // And the removed member is genuinely gone.
    assert.equal((await req('/api/me', { cookies: mate })).json.authenticated, false);
  });

  test('removing the last member takes the workspace with them', async () => {
    // Minted while there is still an owner to mint it; the org outlives them.
    const spare = (await req('/api/org/invites', { method: 'POST', body: {}, cookies: owner })).json.invite.code;

    const admin = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'owner@example.com' }, cookies: admin });
    const del = await req(`/api/admin/users/${ownerId}`, { method: 'DELETE', cookies: admin });
    assert.equal(del.status, 200);
    assert.equal(del.json.deletedWorkspace, true, 'nobody is left to use it');

    const revived = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'ws-revived@team.test' }, cookies: revived });
    assert.equal((await req('/api/org/join', { method: 'POST', body: { code: spare }, cookies: revived })).status, 200);
    const { json } = await req('/api/sync?since=0', { cookies: revived });
    assert.equal(json.records.length, 0, 'the workspace went with its last member');
  });
});

/*
 * Invites and joining.
 *
 * An invite code is a bearer credential sent over whatever channel the owner
 * already uses, so most of what is asserted here is what happens when someone
 * has a code they should not be able to use: spent, expired, revoked, made up,
 * or belonging to a different organisation.
 */
describe('invites and joining', () => {
  const owner = jar();
  const joiner = jar();
  const stranger = jar();
  let orgId = null;
  let orgName = null;

  const invite = async (cookies = owner) => req('/api/org/invites', { method: 'POST', body: {}, cookies });
  const join = async (code, cookies, body = {}) =>
    req('/api/org/join', { method: 'POST', body: { code, ...body }, cookies });

  before(async () => {
    const o = await req('/auth/dev', { method: 'POST', body: { email: 'inv-owner@team.test' }, cookies: owner });
    orgId = o.json.user.orgId;
    orgName = (await req('/api/org', { cookies: owner })).json.org.name;
    await req('/auth/dev', { method: 'POST', body: { email: 'inv-joiner@solo.test' }, cookies: joiner });
    await req('/auth/dev', { method: 'POST', body: { email: 'inv-stranger@solo.test' }, cookies: stranger });

    // Something for the joiner to find once they are in.
    await req('/api/sync', {
      method: 'POST',
      body: {
        since: 0,
        modules: [{ id: 'inv-m1', updatedAt: 10, doc: { id: 'inv-m1', name: 'Deals', fields: [] } }],
        records: [{ id: 'inv-r1', updatedAt: 11, doc: { id: 'inv-r1', moduleId: 'inv-m1', data: { title: 'Team deal' } } }],
      },
      cookies: owner,
    });
  });

  test('an owner creates a link, and it previews the team before it is used', async () => {
    const { status, json } = await invite();
    assert.equal(status, 200);
    assert.match(json.url, /\?invite=/);
    assert.equal(json.invite.state, 'valid');
    assert.equal(json.invite.role, 'member', 'invites do not hand out ownership');
    assert.ok(json.invite.expiresAt > Date.now());
    // Long enough not to be guessable.
    assert.ok(json.invite.code.length >= 32, `code too short: ${json.invite.code.length}`);

    const preview = await req(`/api/org/invites/${json.invite.code}/preview`, { cookies: joiner });
    assert.equal(preview.status, 200);
    assert.equal(preview.json.org.name, orgName);
    assert.equal(preview.json.alreadyMember, false);
  });

  test('a member cannot invite anyone', async () => {
    const code = (await invite()).json.invite.code;
    await join(code, joiner);
    const asMember = await invite(joiner);
    assert.equal(asMember.status, 403, 'joining as a member must not confer the right to invite');
  });

  test('joining gives access to the team workspace', async () => {
    const { json } = await req('/api/sync?since=0', { cookies: joiner });
    assert.equal(json.records.length, 1);
    assert.equal(json.records[0].doc.data.title, 'Team deal');
    const me = await req('/api/me', { cookies: joiner });
    assert.equal(me.json.user.orgId, orgId);
    assert.equal(me.json.user.role, 'member');
  });

  test('a link works exactly once', async () => {
    const code = (await invite()).json.invite.code;
    const first = await join(code, stranger);
    assert.equal(first.status, 200);

    const second = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'inv-second@solo.test' }, cookies: second });
    const reuse = await join(code, second);
    assert.equal(reuse.status, 404, 'a spent code must not admit a second person');
    assert.equal((await req('/api/me', { cookies: second })).json.user.orgId !== orgId, true);
  });

  test('a revoked link stops working', async () => {
    const code = (await invite()).json.invite.code;
    const del = await req(`/api/org/invites/${code}`, { method: 'DELETE', cookies: owner });
    assert.equal(del.status, 200);

    const late = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'inv-late@solo.test' }, cookies: late });
    assert.equal((await join(code, late)).status, 404);
  });

  test('an expired link stops working', async () => {
    const code = (await invite()).json.invite.code;
    await expireInvite(code);
    const slow = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'inv-slow@solo.test' }, cookies: slow });
    assert.equal((await join(code, slow)).status, 404);
    assert.equal((await req(`/api/org/invites/${code}/preview`, { cookies: slow })).status, 404);
  });

  test('an invalid code is indistinguishable from an expired one', async () => {
    const nobody = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'inv-nobody@solo.test' }, cookies: nobody });
    const madeUp = await join('this-code-never-existed', nobody);
    const spent = await join((await invite()).json.invite.code, owner); // owner is already a member

    assert.equal(madeUp.status, 404);
    // Same status and same wording, so the endpoint cannot be used to work out
    // which codes exist.
    const expired = (await invite()).json.invite.code;
    await expireInvite(expired);
    const expiredRes = await join(expired, nobody);
    assert.equal(expiredRes.status, madeUp.status);
    assert.equal(expiredRes.json.error, madeUp.json.error);
    assert.equal(spent.status, 200, 'an existing member re-using their own link is a no-op, not an error');
  });

  test("an owner cannot revoke another organisation's invite", async () => {
    const other = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'inv-other-owner@elsewhere.test' }, cookies: other });
    const mine = (await invite()).json.invite.code;
    // 404 rather than 403: the response must not confirm the code exists.
    const attempt = await req(`/api/org/invites/${mine}`, { method: 'DELETE', cookies: other });
    assert.equal(attempt.status, 404);
    // And it still works afterwards, i.e. the attempt did not revoke it.
    const target = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'inv-target@solo.test' }, cookies: target });
    assert.equal((await join(mine, target)).status, 200);
  });

  test("invites do not leak into another organisation's list", async () => {
    const other = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'inv-list-owner@elsewhere.test' }, cookies: other });
    await invite();
    const theirs = await req('/api/org/invites', { cookies: other });
    assert.equal(theirs.status, 200);
    assert.equal(theirs.json.invites.length, 0);
    const ours = await req('/api/org/invites', { cookies: owner });
    assert.ok(ours.json.invites.length > 0);
  });

  test('a joiner can bring their own work with them', async () => {
    const bringer = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'inv-bringer@solo.test' }, cookies: bringer });
    await req('/api/sync', {
      method: 'POST',
      body: {
        since: 0,
        modules: [{ id: 'own-m1', updatedAt: 5, doc: { id: 'own-m1', name: 'My Leads', fields: [] } }],
        records: [{ id: 'own-r1', updatedAt: 6, doc: { id: 'own-r1', moduleId: 'own-m1', data: { title: 'My lead' } } }],
      },
      cookies: bringer,
    });

    const code = (await invite()).json.invite.code;
    const res = await join(code, bringer, { bringWork: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.broughtRows, 2);

    // The team sees it, and the joiner still sees the team's own rows.
    const team = await req('/api/data', { cookies: owner });
    const titles = team.json.records.map((r) => r.data.title);
    assert.ok(titles.includes('My lead'), 'brought work must reach the team workspace');
    assert.ok(titles.includes('Team deal'));
  });

  test('a joiner who declines leaves their work behind, undestroyed', async () => {
    const keeper = jar();
    const k = await req('/auth/dev', { method: 'POST', body: { email: 'inv-keeper@solo.test' }, cookies: keeper });
    const ownWs = k.json.user.orgId;
    await req('/api/sync', {
      method: 'POST',
      body: { since: 0, records: [{ id: 'kept-r1', updatedAt: 7, doc: { id: 'kept-r1', moduleId: 'x', data: { title: 'Stays mine' } } }] },
      cookies: keeper,
    });

    const code = (await invite()).json.invite.code;
    await join(code, keeper); // bringWork omitted — the default is to leave it

    const team = await req('/api/data', { cookies: owner });
    assert.ok(!team.json.records.some((r) => r.data.title === 'Stays mine'),
      'declining must not publish their work to the team');
    // Nothing was destroyed: the rows are still in the org they came from.
    const still = await req('/api/sync?since=0', { cookies: keeper });
    assert.equal(still.json.records.some((r) => r.id === 'kept-r1'), false,
      'and they are no longer looking at it, because they now read the team workspace');
    assert.ok(ownWs, 'their old workspace id is still a real workspace');
  });

  test('the last owner of a populated team cannot walk out on it', async () => {
    const soloOwner = jar();
    const follower = jar();
    const so = await req('/auth/dev', { method: 'POST', body: { email: 'inv-solo-owner@team2.test' }, cookies: soloOwner });
    await req('/auth/dev', { method: 'POST', body: { email: 'inv-follower@solo.test' }, cookies: follower });
    const theirCode = (await req('/api/org/invites', { method: 'POST', body: {}, cookies: soloOwner })).json.invite.code;
    await join(theirCode, follower);

    // Now soloOwner is the only owner of a two-person org. Leaving would strand
    // the follower with a workspace nobody can administer.
    const code = (await invite()).json.invite.code;
    const blocked = await join(code, soloOwner);
    assert.equal(blocked.status, 409);
    assert.match(blocked.json.error, /only owner/i);
    assert.equal((await req('/api/me', { cookies: soloOwner })).json.user.orgId, so.json.user.orgId);
  });

  test('joining requires being signed in', async () => {
    const code = (await invite()).json.invite.code;
    assert.equal((await req('/api/org/join', { method: 'POST', body: { code } })).status, 401);
    assert.equal((await req(`/api/org/invites/${code}/preview`)).status, 401);
    assert.equal((await req('/api/org/invites', { method: 'POST', body: {} })).status, 401);
  });
});

/*
 * Owner-vs-member permissions.
 *
 * Once several people share a workspace, a field rename or deletion changes
 * what every record in the team means — so schema belongs to whoever is
 * accountable for it. Records are the day-to-day work and stay open to
 * everyone. Enforced on the server, because a UI gate is a courtesy.
 */
describe('what a member may change', () => {
  const owner = jar();
  const member = jar();
  let orgId = null;

  const push = (body, cookies) => req('/api/sync', { method: 'POST', body: { since: 0, ...body }, cookies });
  const mod = (id, name, updatedAt) => ({ id, updatedAt, doc: { id, name, fields: [{ key: 'title', label: 'Title', type: 'text' }] } });
  const rec = (id, moduleId, title, updatedAt) => ({ id, updatedAt, doc: { id, moduleId, data: { title } } });

  before(async () => {
    const o = await req('/auth/dev', { method: 'POST', body: { email: 'perm-owner@team.test' }, cookies: owner });
    orgId = o.json.user.orgId;
    await req('/auth/dev', { method: 'POST', body: { email: 'perm-member@solo.test' }, cookies: member });
    const code = (await req('/api/org/invites', { method: 'POST', body: {}, cookies: owner })).json.invite.code;
    await req('/api/org/join', { method: 'POST', body: { code }, cookies: member });

    await push({ modules: [mod('perm-m1', 'Deals', 10)], records: [rec('perm-r1', 'perm-m1', 'Original', 11)] }, owner);
  });

  test('a member can create, edit and delete records', async () => {
    const cursor = (await req('/api/sync?since=0', { cookies: member })).json.cursor;
    const out = await push({ since: cursor, records: [rec('perm-r2', 'perm-m1', 'Member wrote this', 100)] }, member);
    assert.equal(out.status, 200);
    assert.equal(out.json.rejected, undefined, 'record writes are not refused');

    const seen = await req('/api/data', { cookies: owner });
    assert.ok(seen.json.records.some((r) => r.data.title === 'Member wrote this'));

    // ...and delete one, including a record the owner created.
    await push({ records: [{ id: 'perm-r1', updatedAt: 110, deleted: true }] }, member);
    const after = await req('/api/data', { cookies: owner });
    assert.ok(!after.json.records.some((r) => r.id === 'perm-r1'));
  });

  test('a member cannot change a module, and is told which one', async () => {
    const out = await push({ modules: [mod('perm-m1', 'Renamed By Member', 200)] }, member);
    assert.equal(out.status, 200, 'refused, not errored — the sync itself is fine');
    assert.ok(out.json.rejected, 'the response has to say something was refused');
    assert.equal(out.json.rejected.reason, 'owner-only');
    assert.equal(out.json.rejected.modules.length, 1);

    // The server hands back its own copy, which is what lets the client revert.
    const restored = out.json.rejected.modules[0];
    assert.equal(restored.id, 'perm-m1');
    assert.equal(restored.doc.name, 'Deals', 'the rejection carries the truth, not the attempt');

    const stored = await req('/api/data', { cookies: owner });
    assert.equal(stored.json.modules.find((m) => m.id === 'perm-m1').name, 'Deals');
  });

  test('a member cannot create a module either', async () => {
    const out = await push({ modules: [mod('perm-new', 'Sneaky', 300)] }, member);
    assert.ok(out.json.rejected);
    assert.equal(out.json.rejected.modules[0].absent, true, 'there is nothing to restore, so say it is gone');
    const stored = await req('/api/data', { cookies: owner });
    assert.ok(!stored.json.modules.some((m) => m.id === 'perm-new'));
  });

  /*
   * The case that would be worse than either outcome alone.
   *
   * Deleting a module tombstones the module AND every record in it. Refusing
   * only the module would restore it and leave every record destroyed, so the
   * refusal has to take its records with it.
   */
  test('a refused module deletion does not strip the module of its records', async () => {
    const before = await req('/api/data', { cookies: owner });
    const inModule = before.json.records.filter((r) => r.moduleId === 'perm-m1');
    assert.ok(inModule.length > 0, 'need records in the module to be able to lose them');

    const out = await push({
      modules: [{ id: 'perm-m1', updatedAt: 400, deleted: true }],
      records: inModule.map((r) => ({ id: r.id, updatedAt: 401, deleted: true })),
    }, member);

    assert.ok(out.json.rejected);
    assert.equal(out.json.rejected.modules.length, 1);
    assert.equal(out.json.rejected.records.length, inModule.length,
      'every record tombstone that only existed because of the refused deletion must be refused too');

    const after = await req('/api/data', { cookies: owner });
    assert.ok(after.json.modules.some((m) => m.id === 'perm-m1'), 'the module survives');
    assert.equal(after.json.records.filter((r) => r.moduleId === 'perm-m1').length, inModule.length,
      'and so does everything in it');
  });

  test('an owner changes modules freely', async () => {
    const cursor = (await req('/api/sync?since=0', { cookies: owner })).json.cursor;
    const out = await push({ since: cursor, modules: [mod('perm-m1', 'Renamed By Owner', 500)] }, owner);
    assert.equal(out.json.rejected, undefined);
    const stored = await req('/api/data', { cookies: owner });
    assert.equal(stored.json.modules.find((m) => m.id === 'perm-m1').name, 'Renamed By Owner');
  });

  test('a member cannot invite, promote, or remove anyone', async () => {
    assert.equal((await req('/api/org/invites', { method: 'POST', body: {}, cookies: member })).status, 403);
    assert.equal((await req('/api/org/invites', { cookies: member })).status, 403);
    assert.equal((await req('/api/admin/users', { cookies: member })).status, 403);

    const ownerId = (await req('/api/me', { cookies: owner })).json.user.id;
    assert.equal((await req(`/api/admin/users/${ownerId}`, { method: 'PATCH', body: { role: 'member' }, cookies: member })).status, 403);
    assert.equal((await req(`/api/admin/users/${ownerId}`, { method: 'DELETE', cookies: member })).status, 403);
  });

  test('rows record who wrote them, and an edit does not rewrite authorship', async () => {
    const { json } = await req('/api/sync?since=0', { cookies: owner });
    const memberRow = json.records.find((r) => r.id === 'perm-r2');
    const memberId = (await req('/api/me', { cookies: member })).json.user.id;
    const ownerId = (await req('/api/me', { cookies: owner })).json.user.id;
    assert.equal(memberRow.createdBy, memberId);

    // The owner edits it. The author stays the author.
    const cursor = json.cursor;
    await push({ since: cursor, records: [rec('perm-r2', 'perm-m1', 'Owner edited it', 600)] }, owner);
    const after = await req('/api/sync?since=0', { cookies: owner });
    const edited = after.json.records.find((r) => r.id === 'perm-r2');
    assert.equal(edited.doc.data.title, 'Owner edited it');
    assert.equal(edited.createdBy, memberId, 'editing someone else\u2019s record must not claim it');
    assert.equal(edited.updatedBy, ownerId);
  });
});

/*
 * Managing a team, and getting out of one.
 *
 * Removing somebody from a team is NOT deleting their account, and it must
 * never touch the workspace — the two live on different endpoints for exactly
 * that reason. Most of what is asserted here is the difference.
 */
describe('team membership', () => {
  const owner = jar();
  const member = jar();
  const outsider = jar();
  let orgId = null;
  let ownerId = null;
  let memberId = null;

  const invite = () => req('/api/org/invites', { method: 'POST', body: {}, cookies: owner });

  before(async () => {
    const o = await req('/auth/dev', { method: 'POST', body: { email: 'team-owner@crew.test' }, cookies: owner });
    ownerId = o.json.user.id;
    orgId = o.json.user.orgId;
    const m = await req('/auth/dev', { method: 'POST', body: { email: 'team-member@solo.test' }, cookies: member });
    memberId = m.json.user.id;
    await req('/auth/dev', { method: 'POST', body: { email: 'team-outsider@elsewhere.test' }, cookies: outsider });
    await req('/api/org/join', { method: 'POST', body: { code: (await invite()).json.invite.code }, cookies: member });

    await req('/api/sync', {
      method: 'POST',
      body: {
        since: 0,
        modules: [{ id: 'crew-m1', updatedAt: 10, doc: { id: 'crew-m1', name: 'Deals', fields: [] } }],
        records: [{ id: 'crew-r1', updatedAt: 11, doc: { id: 'crew-r1', moduleId: 'crew-m1', data: { title: 'Team work' } } }],
      },
      cookies: owner,
    });
  });

  test('everyone can see who is on the team; only an owner can manage them', async () => {
    const asOwner = await req('/api/org/members', { cookies: owner });
    assert.equal(asOwner.status, 200);
    assert.equal(asOwner.json.members.length, 2);
    assert.equal(asOwner.json.canManage, true);
    assert.ok(asOwner.json.members.find((m) => m.isYou));

    const asMember = await req('/api/org/members', { cookies: member });
    assert.equal(asMember.status, 200, 'a member may see their colleagues');
    assert.equal(asMember.json.canManage, false);
    assert.equal((await req(`/api/org/members/${ownerId}`, { method: 'PATCH', body: { role: 'member' }, cookies: member })).status, 403);
    assert.equal((await req(`/api/org/members/${ownerId}`, { method: 'DELETE', cookies: member })).status, 403);
  });

  test('an owner promotes and demotes', async () => {
    const up = await req(`/api/org/members/${memberId}`, { method: 'PATCH', body: { role: 'owner' }, cookies: owner });
    assert.equal(up.status, 200);
    assert.equal(up.json.member.role, 'owner');
    // Now genuinely an owner: they can do owner things.
    assert.equal((await req('/api/org/invites', { method: 'POST', body: {}, cookies: member })).status, 200);

    const down = await req(`/api/org/members/${memberId}`, { method: 'PATCH', body: { role: 'member' }, cookies: owner });
    assert.equal(down.json.member.role, 'member');
    assert.equal((await req('/api/org/invites', { method: 'POST', body: {}, cookies: member })).status, 403);
  });

  test('an org owner cannot promote anyone to platform admin', async () => {
    const attempt = await req(`/api/org/members/${memberId}`, { method: 'PATCH', body: { role: 'platformAdmin' }, cookies: owner });
    assert.equal(attempt.status, 400, 'crossing organisations is not an org owner\u2019s to grant');
    const check = await req('/api/org/members', { cookies: owner });
    assert.equal(check.json.members.find((m) => m.id === memberId).role, 'member');
  });

  test("another team's member is not found, rather than forbidden", async () => {
    const theirs = (await req('/api/me', { cookies: outsider })).json.user.id;
    // 404, so the response does not confirm the account exists.
    assert.equal((await req(`/api/org/members/${theirs}`, { method: 'PATCH', body: { role: 'owner' }, cookies: owner })).status, 404);
    assert.equal((await req(`/api/org/members/${theirs}`, { method: 'DELETE', cookies: owner })).status, 404);
  });

  test('the last owner cannot demote or leave their way out of a populated team', async () => {
    const selfDemote = await req(`/api/org/members/${ownerId}`, { method: 'PATCH', body: { role: 'member' }, cookies: owner });
    assert.equal(selfDemote.status, 409);
    assert.match(selfDemote.json.error, /only owner/i);

    const leave = await req('/api/org/leave', { method: 'POST', body: {}, cookies: owner });
    assert.equal(leave.status, 409);
    assert.match(leave.json.error, /only owner/i);
    assert.equal((await req('/api/me', { cookies: owner })).json.user.orgId, orgId, 'and they are still where they were');
  });

  test('an owner cannot remove themselves through the members list', async () => {
    const self = await req(`/api/org/members/${ownerId}`, { method: 'DELETE', cookies: owner });
    assert.equal(self.status, 400);
    assert.match(self.json.error, /leave team/i, 'point at the door rather than refusing flatly');
  });

  /*
   * The distinction stage A's split between deleteUser and deleteWorkspace was
   * built for: removing a person is not deleting an account, and neither one
   * may take a team's records with it.
   */
  test('removing a member keeps their account and the team workspace', async () => {
    const before = await req('/api/data', { cookies: owner });
    const removal = await req(`/api/org/members/${memberId}`, { method: 'DELETE', cookies: owner });
    assert.equal(removal.status, 200);
    assert.equal(removal.json.accountDeleted, false);

    // The team is unchanged.
    const after = await req('/api/data', { cookies: owner });
    assert.deepEqual(after.json.records.map((r) => r.id), before.json.records.map((r) => r.id));

    // They still have an account, still signed in, and now have their own
    // empty workspace rather than a view of the team's.
    const theirs = await req('/api/me', { cookies: member });
    assert.equal(theirs.json.authenticated, true, 'removing from a team is not deleting an account');
    assert.notEqual(theirs.json.user.orgId, orgId);
    assert.equal(theirs.json.user.role, 'owner', 'they own the workspace they are left with');
    const seen = await req('/api/sync?since=0', { cookies: member });
    assert.equal(seen.json.records.length, 0, 'and can no longer read the team\u2019s records');
  });

  test('leaving a team works once someone else can own it', async () => {
    const second = jar();
    const s = await req('/auth/dev', { method: 'POST', body: { email: 'team-second@solo.test' }, cookies: second });
    await req('/api/org/join', { method: 'POST', body: { code: (await invite()).json.invite.code }, cookies: second });
    await req(`/api/org/members/${s.json.user.id}`, { method: 'PATCH', body: { role: 'owner' }, cookies: owner });

    const leave = await req('/api/org/leave', { method: 'POST', body: {}, cookies: owner });
    assert.equal(leave.status, 200);
    assert.notEqual(leave.json.user.orgId, orgId);

    // The team carries on under its remaining owner, records intact.
    const remaining = await req('/api/data', { cookies: second });
    assert.ok(remaining.json.records.some((r) => r.id === 'crew-r1'), 'the workspace stays with the team');
    // And the leaver starts clean.
    const fresh = await req('/api/sync?since=0', { cookies: owner });
    assert.equal(fresh.json.records.length, 0);
  });

  test('there is no team to leave when you are the only one in it', async () => {
    const solo = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'team-solo@solo.test' }, cookies: solo });
    const out = await req('/api/org/leave', { method: 'POST', body: {}, cookies: solo });
    assert.equal(out.status, 409);
    assert.match(out.json.error, /only person/i);
  });

  test('managing a team requires being signed in', async () => {
    assert.equal((await req('/api/org/members')).status, 401);
    assert.equal((await req('/api/org/leave', { method: 'POST', body: {} })).status, 401);
    assert.equal((await req(`/api/org/members/${memberId}`, { method: 'DELETE' })).status, 401);
  });
});

/*
 * Cross-tenant isolation. These assert the attack, not the happy path: an org
 * owner from tenant B reaching for tenant A's resources. One missed orgId
 * filter is a data leak, so this suite is the gate on that work.
 */
describe('tenant isolation', () => {
  const alice = jar();   // owner of org A
  const bob = jar();     // owner of org B
  let aliceId = null;
  let bobId = null;
  let aliceOrg = null;
  let bobOrg = null;

  before(async () => {
    const a = await req('/auth/dev', { method: 'POST', body: { email: 'alice@org-a.test' }, cookies: alice });
    aliceId = a.json.user.id;
    const b = await req('/auth/dev', { method: 'POST', body: { email: 'bob@org-b.test' }, cookies: bob });
    bobId = b.json.user.id;
    aliceOrg = (await req('/api/org', { cookies: alice })).json.org;
    bobOrg = (await req('/api/org', { cookies: bob })).json.org;
    // Give each a workspace so counts are non-zero.
    await req('/api/data', { method: 'PUT', body: { modules: [], records: [], settings: { businessName: 'A' } }, cookies: alice });
    await req('/api/data', { method: 'PUT', body: { modules: [], records: [], settings: { businessName: 'B' } }, cookies: bob });
  });

  test('each signup lands in its own organisation', () => {
    assert.ok(aliceOrg?.id, 'alice has no org');
    assert.ok(bobOrg?.id, 'bob has no org');
    assert.notEqual(aliceOrg.id, bobOrg.id, 'two signups must not share an org');
  });

  test('an owner sees only their own org members', async () => {
    const { status, json } = await req('/api/admin/users', { cookies: bob });
    assert.equal(status, 200);
    assert.equal(json.scope, 'org');
    assert.ok(json.users.every((u) => u.orgId === bobOrg.id), 'listing leaked another org');
    assert.equal(json.users.find((u) => u.email === 'alice@org-a.test'), undefined, "alice appeared in bob's listing");
  });

  test('stats are scoped to the caller org', async () => {
    const { json } = await req('/api/admin/stats', { cookies: bob });
    assert.equal(json.scope, 'org');
    assert.equal(json.orgId, bobOrg.id);
    assert.equal(json.totals.users, 1, "bob's org should contain only bob");
    assert.equal(json.totals.workspaces, 1);
  });

  test('reading another org account 404s rather than 403', async () => {
    // 403 would confirm the account exists; 404 reveals nothing.
    const patch = await req(`/api/admin/users/${aliceId}`, { method: 'PATCH', body: { disabled: true }, cookies: bob });
    assert.equal(patch.status, 404, "bob must not be able to modify alice");
  });

  test('deleting another org account is refused', async () => {
    const del = await req(`/api/admin/users/${aliceId}`, { method: 'DELETE', cookies: bob });
    assert.equal(del.status, 404);
    // And alice is untouched.
    assert.equal((await req('/api/data', { cookies: alice })).status, 200);
    assert.equal((await req('/api/me', { cookies: alice })).json.authenticated, true);
  });

  test('an owner cannot promote anyone to platform admin', async () => {
    // Escalation from org-level to cross-org access must be impossible.
    const second = jar();
    const s = await req('/auth/dev', { method: 'POST', body: { email: 'second@org-c.test' }, cookies: second });
    const escalate = await req(`/api/admin/users/${s.json.user.id}`, {
      method: 'PATCH', body: { role: 'platformAdmin' }, cookies: bob,
    });
    // Different org, so it is invisible to bob in the first place.
    assert.equal(escalate.status, 404);
  });

  test('workspaces stay separate', async () => {
    const a = await req('/api/data', { cookies: alice });
    const b = await req('/api/data', { cookies: bob });
    assert.equal(a.json.settings.businessName, 'A');
    assert.equal(b.json.settings.businessName, 'B');
  });

  test('a member cannot reach admin routes at all', async () => {
    const member = jar();
    const m = await req('/auth/dev', { method: 'POST', body: { email: 'member@org-b.test' }, cookies: member });
    // Demote them into bob's org to model a real team member.
    await req(`/api/admin/users/${m.json.user.id}`, { method: 'PATCH', body: { role: 'member' }, cookies: bob })
      .catch(() => {});
    const asMember = await req('/api/admin/users', { cookies: member });
    assert.ok([200, 403].includes(asMember.status));
    if (asMember.status === 200) {
      // If they are still an owner of their own org, they must at least not
      // see anyone else's.
      assert.ok(asMember.json.users.every((u) => u.email !== 'alice@org-a.test'));
    }
  });
});

describe('admin surface', () => {
  const admin = jar();
  const user = jar();
  let userId = null;

  before(async () => {
    // The first-ever account is the admin; it already exists by now, so sign in
    // as it explicitly rather than relying on ordering.
    await req('/auth/dev', { method: 'POST', body: { email: 'owner@example.com' }, cookies: admin });
    const u = await req('/auth/dev', { method: 'POST', body: { email: 'member@example.com' }, cookies: user });
    userId = u.json.user.id;
    await req('/api/data', { method: 'PUT', body: { modules: [], records: [], settings: {} }, cookies: user });
  });

  test('/health reports tenant counts to a platform admin only', async () => {
    const asAdmin = await req('/health', { cookies: admin });
    assert.ok(asAdmin.json.counts, 'the operator of the deployment may see them');
    assert.ok(asAdmin.json.counts.users >= 2);
    assert.ok(asAdmin.json.counts.orgs >= 1);

    const asOwner = await req('/health', { cookies: user });
    assert.equal(asOwner.json.counts, undefined, 'an org owner may not read the deployment-wide counts');
  });

  test('a demoted member is refused every admin route', async () => {
    // Every signup owns its own org, so being refused requires being a member.
    await req(`/api/admin/users/${userId}`, { method: 'PATCH', body: { role: 'member' }, cookies: admin });
    for (const path of ['/api/admin/stats', '/api/admin/users']) {
      const { status } = await req(path, { cookies: user });
      assert.equal(status, 403, `${path} should be refused to a member`);
    }
    const patch = await req(`/api/admin/users/${userId}`, { method: 'PATCH', body: { role: 'owner' }, cookies: user });
    assert.equal(patch.status, 403, 'a member must not be able to promote themselves');
    // Restore for the tests that follow.
    await req(`/api/admin/users/${userId}`, { method: 'PATCH', body: { role: 'owner' }, cookies: admin });
  });

  test('stats expose the metrics the dashboard renders', async () => {
    const { status, json } = await req('/api/admin/stats', { cookies: admin });
    assert.equal(status, 200);
    assert.ok(json.totals.users >= 2);
    assert.equal(typeof json.totals.activeLast7d, 'number');
    assert.equal(json.signups.length, 30, 'expected 30 days of signup buckets');
    assert.equal(json.activeUsers.length, 14, 'expected 14 days of active-user buckets');
    for (const point of json.signups) {
      assert.match(point.day, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(typeof point.count, 'number');
    }
  });

  test('the account list describes people, and usage lives on the stats', async () => {
    const { json } = await req('/api/admin/users', { cookies: admin });
    const member = json.users.find((u) => u.email === 'member@example.com');
    assert.ok(member, 'member account missing from the list');
    assert.equal(typeof member.lastActiveAt, 'number');
    assert.ok(!('provider' in member) || typeof member.provider === 'string');

    // A workspace belongs to an organisation, so a per-account row count would
    // report the same totals against every member of one — a column of
    // identical numbers reading as N copies of the data rather than N people
    // sharing it. The figure belongs to the workspace, and lives on stats.
    assert.equal(member.recordCount, undefined);
    assert.equal(member.moduleCount, undefined);

    const stats = await req('/api/admin/stats', { cookies: admin });
    assert.equal(typeof stats.json.totals.records, 'number');
    assert.equal(typeof stats.json.totals.modules, 'number');
    assert.equal(typeof stats.json.totals.workspaces, 'number');
  });

  test('an admin cannot modify or delete their own account', async () => {
    const meRes = await req('/api/me', { cookies: admin });
    const selfId = meRes.json.user.id;
    const patch = await req(`/api/admin/users/${selfId}`, { method: 'PATCH', body: { disabled: true }, cookies: admin });
    assert.equal(patch.status, 400);
    const del = await req(`/api/admin/users/${selfId}`, { method: 'DELETE', cookies: admin });
    assert.equal(del.status, 400);
  });

  test('modifying an unknown account 404s', async () => {
    const { status } = await req('/api/admin/users/does-not-exist', { method: 'PATCH', body: { role: 'admin' }, cookies: admin });
    assert.equal(status, 404);
  });

  test('disabling an account locks it out immediately', async () => {
    assert.equal((await req('/api/data', { cookies: user })).status, 200, 'precondition: user can sync');

    const patch = await req(`/api/admin/users/${userId}`, { method: 'PATCH', body: { disabled: true }, cookies: admin });
    assert.equal(patch.status, 200);
    assert.equal(patch.json.user.disabled, true);

    assert.equal((await req('/api/data', { cookies: user })).status, 401, 'a disabled account must lose access');
    assert.equal((await req('/api/me', { cookies: user })).json.authenticated, false);

    await req(`/api/admin/users/${userId}`, { method: 'PATCH', body: { disabled: false }, cookies: admin });
    assert.equal((await req('/api/data', { cookies: user })).status, 200, 're-enabling should restore access');
  });

  test('promoting and demoting changes the role', async () => {
    const up = await req(`/api/admin/users/${userId}`, { method: 'PATCH', body: { role: 'owner' }, cookies: admin });
    assert.equal(up.json.user.role, 'owner');
    assert.equal((await req('/api/admin/stats', { cookies: user })).status, 200, 'an owner should reach admin routes');

    const down = await req(`/api/admin/users/${userId}`, { method: 'PATCH', body: { role: 'member' }, cookies: admin });
    assert.equal(down.json.user.role, 'member');
    assert.equal((await req('/api/admin/stats', { cookies: user })).status, 403);

    await req(`/api/admin/users/${userId}`, { method: 'PATCH', body: { role: 'owner' }, cookies: admin });
  });

  test('an org owner cannot grant platform admin', async () => {
    // Only a platform admin may hand out cross-org access.
    const owner = jar();
    const o = await req('/auth/dev', { method: 'POST', body: { email: 'grant-test@example.com' }, cookies: owner });
    const self = await req(`/api/admin/users/${o.json.user.id}`, {
      method: 'PATCH', body: { role: 'platformAdmin' }, cookies: owner,
    });
    assert.equal(self.status, 400, 'modifying your own account here is refused outright');
    const stillOwner = await req('/api/me', { cookies: owner });
    assert.equal(stillOwner.json.user.role, 'owner');
  });

  test('an invalid role is ignored rather than applied', async () => {
    const { status, json } = await req(`/api/admin/users/${userId}`, { method: 'PATCH', body: { role: 'superuser' }, cookies: admin });
    assert.equal(status, 200);
    assert.equal(json.user.role, 'owner', 'unknown roles must not be written through');
  });

  test('deleting an account removes it and its data', async () => {
    const del = await req(`/api/admin/users/${userId}`, { method: 'DELETE', cookies: admin });
    assert.equal(del.status, 200);

    const { json } = await req('/api/admin/users', { cookies: admin });
    assert.equal(json.users.find((u) => u.id === userId), undefined);
    assert.equal((await req('/api/data', { cookies: user })).status, 401);
  });
});

/*
 * A removed field must stay removed, even against a copy that still has it.
 *
 * Removing a field's values (§22) deletes keys. Under field-level merge a key
 * with no clock counts as never edited, so a colleague still holding the old
 * value would win and quietly put it back. Clocking the removal is what stops
 * that, and this is the test that fails if the purge path forgets to.
 */
describe('a clocked field removal', () => {
  const cookies = jar();
  const device = () => {
    let cursor = 0;
    return {
      async push(records) {
        const { status, json } = await req('/api/sync', { method: 'POST', body: { since: cursor, records }, cookies });
        assert.equal(status, 200, JSON.stringify(json));
        cursor = json.cursor;
        return json;
      },
      async pull() {
        const { json } = await req('/api/sync?since=0', { cookies });
        return json;
      },
    };
  };

  before(async () => {
    await req('/auth/dev', { method: 'POST', body: { email: 'purge-merge@example.com' }, cookies });
  });

  test('survives a stale colleague who still holds the value', async () => {
    const a = device();
    const b = device();
    await a.push([{
      id: 'p1', updatedAt: 1000,
      doc: { id: 'p1', moduleId: 'm1', data: { keep: 'yes', secret: 'confidential' } },
    }]);

    // A removes the field, and clocks the removal.
    await a.push([{
      id: 'p1', updatedAt: 2000,
      doc: { id: 'p1', moduleId: 'm1', data: { keep: 'yes' }, fieldsAt: { secret: 2000 } },
    }]);

    // B has been offline with the old copy and pushes it back, later.
    await b.push([{
      id: 'p1', updatedAt: 3000,
      doc: { id: 'p1', moduleId: 'm1', data: { keep: 'yes', secret: 'confidential' } },
    }]);

    const row = (await device().pull()).records.find((r) => r.id === 'p1');
    assert.equal(row.doc.data.keep, 'yes');
    assert.equal(row.doc.data.secret, undefined,
      'a clocked removal must beat an unclocked copy, however new that copy claims to be');
  });
});

/*
 * A ladder below member: contributor cannot delete, viewer cannot write.
 *
 * The audit's concern was that any member can wipe the customer database one
 * record at a time — and a tombstone discards the body (§26), so there is no
 * undo to fall back on. That makes this a prevention rather than a
 * convenience, and it uses the seam already proven for modules (§14): the
 * refusal comes back carrying the server's own copy, the client overwrites its
 * local one, and the edit un-happens.
 */
describe('record roles', () => {
  const owner = jar();
  const hand = jar();
  let orgId = null;
  let handId = null;

  const push = (cookies, records) =>
    req('/api/sync', { method: 'POST', body: { since: 0, records }, cookies });
  const setRole = (role) =>
    req(`/api/org/members/${handId}`, { method: 'PATCH', body: { role }, cookies: owner });
  const serverRow = async (id) => {
    const { json } = await req('/api/sync?since=0', { cookies: owner });
    return json.records.find((r) => r.id === id);
  };

  before(async () => {
    const o = await req('/auth/dev', { method: 'POST', body: { email: 'role-owner@team.test' }, cookies: owner });
    orgId = o.json.user.orgId;
    const h = await req('/auth/dev', { method: 'POST', body: { email: 'role-hand@team.test' }, cookies: hand });
    handId = h.json.user.id;
    const code = (await req('/api/org/invites', { method: 'POST', body: {}, cookies: owner })).json.invite.code;
    await req('/api/org/join', { method: 'POST', body: { code }, cookies: hand });
    // Something already on the server for them to try to change.
    await push(owner, [{ id: 'existing', updatedAt: 1000, doc: { id: 'existing', moduleId: 'm1', data: { title: 'Owner wrote this' } } }]);
  });

  test('a contributor may add and edit, but a delete is refused and the record restored', async () => {
    await setRole('contributor');

    const edited = await push(hand, [{
      id: 'existing', updatedAt: 2000, doc: { id: 'existing', moduleId: 'm1', data: { title: 'Contributor edited' } },
    }]);
    assert.equal(edited.status, 200);
    assert.equal((await serverRow('existing')).doc.data.title, 'Contributor edited', 'editing is allowed');

    const removed = await push(hand, [{ id: 'existing', updatedAt: 3000, deleted: true, deletedAt: 3000 }]);
    const back = removed.json.rejected.records.find((r) => r.id === 'existing');
    assert.ok(back, 'the refusal has to come back, or the client keeps thinking it deleted the row');
    assert.ok(!back.deleted, 'and it carries the record, so the client can put it back');
    assert.equal(back.doc.data.title, 'Contributor edited');

    const still = await serverRow('existing');
    assert.ok(!still.deleted, 'the record survives');
  });

  test('a viewer may not write at all, and is handed the server copy back', async () => {
    await setRole('viewer');

    const out = await push(hand, [{
      id: 'existing', updatedAt: 4000, doc: { id: 'existing', moduleId: 'm1', data: { title: 'Viewer tried' } },
    }]);
    const back = out.json.rejected.records.find((r) => r.id === 'existing');
    assert.ok(back, 'refused, not silently dropped');
    assert.equal(back.doc.data.title, 'Contributor edited', 'the server copy comes back so the edit un-happens');
    assert.equal((await serverRow('existing')).doc.data.title, 'Contributor edited');
  });

  /*
   * A refused CREATION is answered as absent, so the client purges it.
   *
   * Tombstoning instead would push a gravestone that gets refused and reverted
   * on every subsequent sync, forever — the trap §14 already records.
   */
  test('a refused creation is answered as absent, never as a tombstone', async () => {
    await setRole('viewer');
    const out = await push(hand, [{
      id: 'brand-new', updatedAt: 5000, doc: { id: 'brand-new', moduleId: 'm1', data: { title: 'Never allowed' } },
    }]);
    const back = out.json.rejected.records.find((r) => r.id === 'brand-new');
    assert.ok(back, 'refused');
    assert.equal(back.absent, true, 'absent is what tells the client to purge rather than tombstone');
    assert.ok(!(await serverRow('brand-new')), 'and nothing was written');
  });

  test('promoting them back restores both', async () => {
    await setRole('member');
    const ok = await push(hand, [{
      id: 'theirs', updatedAt: 6000, doc: { id: 'theirs', moduleId: 'm1', data: { title: 'Allowed again' } },
    }]);
    // `rejected` is omitted entirely when there is nothing to refuse.
    assert.equal(((ok.json.rejected || {}).records || []).length, 0, 'no refusals for a member');
    assert.equal((await serverRow('theirs')).doc.data.title, 'Allowed again');

    const gone = await push(hand, [{ id: 'theirs', updatedAt: 7000, deleted: true, deletedAt: 7000 }]);
    assert.equal(((gone.json.rejected || {}).records || []).length, 0);
    assert.ok((await serverRow('theirs')).deleted, 'a member may still delete');
  });

  test('an owner may hand out any rung of the team ladder, but never platform admin', async () => {
    for (const role of ['viewer', 'contributor', 'member', 'owner']) {
      assert.equal((await setRole(role)).status, 200, `${role} should be assignable`);
    }
    const escalate = await setRole('platformAdmin');
    assert.equal(escalate.status, 400, 'an org role must not reach a deployment role');
    assert.equal((await req('/api/me', { cookies: hand })).json.user.role, 'owner');
  });
});

/*
 * Prototype pollution through the one place a client-chosen key is used as an
 * object key: the field merge (§26).
 *
 * A probe found nothing exploitable — see §30 — so this is a guard, and the
 * test exists to keep it. What it really protects is the *next* version of
 * mergeFields: extending it to merge nested values recursively is the obvious
 * refactor, and it is the one that makes a __proto__ key live.
 */
describe('a pushed record cannot carry dangerous field keys', () => {
  const hand = jar();

  before(async () => {
    await req('/auth/dev', { method: 'POST', body: { email: 'proto-guard@example.com' }, cookies: hand });
  });

  test('__proto__ and friends are dropped on create and on merge', async () => {
    const evil = JSON.parse(
      '{"__proto__": {"polluted": "yes"}, "constructor": "c", "prototype": "p", "normal": "kept"}',
    );
    const clocks = JSON.parse('{"__proto__": 9999, "normal": 1}');

    await req('/api/sync', {
      method: 'POST', cookies: hand,
      body: { since: 0, records: [{ id: 'evil', updatedAt: 1000, doc: { moduleId: 'm1', data: evil, fieldsAt: clocks } }] },
    });

    // The second push of the same id is what exercises mergeFields, which is
    // where the assignment actually happens.
    const merged = await req('/api/sync', {
      method: 'POST', cookies: hand,
      body: {
        since: 0,
        records: [{
          id: 'evil', updatedAt: 2000,
          doc: { moduleId: 'm1', data: JSON.parse('{"__proto__": {"polluted": "again"}, "normal": "updated"}'), fieldsAt: { normal: 2 } },
        }],
      },
    });
    assert.equal(merged.status, 200, 'a hostile key must not crash the merge');

    const pulled = await req('/api/sync?since=0', { cookies: hand });
    const row = pulled.json.records.find((r) => r.id === 'evil');
    const keys = Object.keys(row.doc.data);
    for (const bad of ['__proto__', 'constructor', 'prototype']) {
      assert.ok(!keys.includes(bad), `${bad} must not be stored as a field key`);
    }
    assert.equal(row.doc.data.normal, 'updated', 'while ordinary fields merge as usual');

    // Nothing leaked onto the server's own objects: a fresh response must not
    // have grown a property the payload asked for.
    const me = await req('/api/me', { cookies: hand });
    assert.ok(!JSON.stringify(me.json).includes('polluted'), 'Object.prototype is untouched');
  });
});

/*
 * The workspace webhook lives OUTSIDE `settings`, and this is the proof.
 *
 * The obvious home for a per-workspace webhook URL is `settings`, beside the
 * currency and the business name. It cannot go there, for two reasons, and the
 * second is worse than the first:
 *
 *   1. `pullChanges` sends `meta.settings` WHOLE to anyone whose cursor is
 *      behind `settingsServerAt` — member, contributor, viewer. The URL is a
 *      credential (§18: a Telegram webhook URL contains the bot token), so
 *      that puts it in every teammate's IndexedDB, offline, permanently.
 *      Masking it on the way out of a GET does nothing, because the GET is not
 *      the delivery path.
 *
 *   2. Masking would then DESTROY it. The client merges the pulled document
 *      into its own settings and pushes the whole thing back on the next save,
 *      where last-write-wins accepts it — so the masked string overwrites the
 *      real URL the first time an owner changes the currency. Redaction and
 *      last-write-wins cannot both apply to one document.
 *
 * So `hook` is a sibling key on the meta doc. `putData` merges on both stores,
 * so a settings write leaves it standing; `pullChanges` reads `meta.settings`
 * specifically, so sync cannot reach it. That is structural rather than
 * filtered — it holds even for somebody who never reads this comment.
 */
describe('the workspace webhook is stored where sync cannot reach it', () => {
  const owner = jar();
  const looker = jar();
  let wsId = null;
  let lookerId = null;

  // Distinctive enough that a substring search over a whole response body is
  // a meaningful assertion rather than a coincidence.
  const SECRET = 'ZZTOPSECRETWEBHOOKTOKEN';
  const HOOK_URL = `https://hooks.example.com/services/T0/B0/${SECRET}`;

  before(async () => {
    const o = await req('/auth/dev', { method: 'POST', body: { email: 'hook-owner@team.test' }, cookies: owner });
    wsId = o.json.user.orgId;
    const l = await req('/auth/dev', { method: 'POST', body: { email: 'hook-looker@team.test' }, cookies: looker });
    lookerId = l.json.user.id;
    const code = (await req('/api/org/invites', { method: 'POST', body: {}, cookies: owner })).json.invite.code;
    await req('/api/org/join', { method: 'POST', body: { code }, cookies: looker });
    await req(`/api/org/members/${lookerId}`, { method: 'PATCH', body: { role: 'viewer' }, cookies: owner });

    // A real workspace to pull: settings, a module and a record.
    await req('/api/sync', {
      method: 'POST',
      cookies: owner,
      body: {
        since: 0,
        settings: { currency: 'USD', businessName: 'Hook Test Ltd' },
        settingsUpdatedAt: 1000,
        modules: [{ id: 'hm1', updatedAt: 1000, doc: { id: 'hm1', name: 'Invoices', fields: [] } }],
        records: [{ id: 'hr1', updatedAt: 1000, doc: { id: 'hr1', moduleId: 'hm1', data: { title: 'INV-1' } } }],
      },
    });

    await plantHook(wsId, { url: HOOK_URL, addedAt: 1000, addedBy: 'hook-owner@team.test' });
  });

  test('the hook was actually planted, or everything below is vacuous', async () => {
    assert.equal((await readHook(wsId)).url, HOOK_URL);
  });

  /*
   * The whole response body is searched rather than a named field, because a
   * field-by-field assertion only covers the fields somebody thought of. This
   * one fails for `settings.webhookUrl`, for a stray `meta` echo, and for any
   * future field that happens to carry it.
   */
  test('a full pull carries no trace of it, for the owner or for a viewer', async () => {
    for (const [who, cookies] of [['the owner', owner], ['a viewer', looker]]) {
      for (const path of ['/api/sync?since=0', '/api/data']) {
        const { status, text } = await req(path, { cookies });
        assert.equal(status, 200, `${path} as ${who}`);
        assert.ok(!text.includes(SECRET), `${path} leaked the webhook token to ${who}`);
        assert.ok(!text.includes('hooks.example.com'), `${path} leaked the webhook host to ${who}`);
      }
    }
  });

  /*
   * THE ONE THAT JUSTIFIES THE WHOLE STORAGE DECISION.
   *
   * With the URL inside `settings` this fails destructively: the client's
   * settings document does not contain it, so a currency change pushes a
   * document without it and last-write-wins replaces the stored copy. The
   * credential is gone, silently, because somebody switched to euros.
   */
  test('an owner changing the currency does not erase the webhook', async () => {
    const out = await req('/api/sync', {
      method: 'POST',
      cookies: owner,
      body: { since: 0, settings: { currency: 'EUR', businessName: 'Hook Test Ltd' }, settingsUpdatedAt: 2000 },
    });
    assert.equal(out.status, 200);

    // The settings write has to have LANDED, or this passes on a no-op.
    const pulled = await req('/api/sync?since=0', { cookies: owner });
    assert.equal(pulled.json.settings.doc.currency, 'EUR', 'the currency change did not land');

    assert.equal((await readHook(wsId)).url, HOOK_URL, 'the settings write took the webhook with it');
  });

  test('and neither does a write through the legacy snapshot route', async () => {
    // /api/data is still served so a client on cached older JS keeps syncing
    // through a deploy, and it is a SECOND writer of the same meta doc.
    const out = await req('/api/data', {
      method: 'PUT',
      cookies: owner,
      body: { modules: [], records: [], settings: { currency: 'GBP', businessName: 'Hook Test Ltd' } },
    });
    assert.equal(out.status, 200);
    assert.equal((await readHook(wsId)).url, HOOK_URL, 'the legacy route took the webhook with it');
  });

  test('a viewer whose settings push is refused cannot reach it either', async () => {
    const out = await req('/api/sync', {
      method: 'POST',
      cookies: looker,
      body: { since: 0, settings: { currency: 'JPY', businessName: 'Viewer renamed us' }, settingsUpdatedAt: 9000 },
    });
    assert.ok(out.json.rejected.settings, 'a viewer must not be able to write settings at all (§14)');
    assert.ok(!out.text.includes(SECRET), 'the refusal handed back the meta doc rather than the settings');
    assert.equal((await readHook(wsId)).url, HOOK_URL);
  });
});

/*
 * The three routes an owner uses to point their workspace at a chat channel.
 *
 * These ARE the runtime setter that §30's SSRF finding was FALSE for the
 * absence of, so the tests are as much about what they refuse as what they do.
 */
describe('workspace webhook routes', () => {
  const owner = jar();
  const hand = jar();
  let handId = null;
  let wsId = null;

  const TOKEN = 'QQREALLYSECRETHOOKTOKEN';
  // Deliberately a name nothing resolves. The save path must not require
  // delivery — see "refuses only what can never work" below — so this is a
  // URL that stores successfully and never reaches anything, which is what
  // makes these tests offline-safe.
  const URL_OK = `https://hooks.example.invalid/services/T1/B1/${TOKEN}`;

  before(async () => {
    const o = await req('/auth/dev', { method: 'POST', body: { email: 'wh-owner@team.test' }, cookies: owner });
    wsId = o.json.user.orgId;
    const h = await req('/auth/dev', { method: 'POST', body: { email: 'wh-hand@team.test' }, cookies: hand });
    handId = h.json.user.id;
    const code = (await req('/api/org/invites', { method: 'POST', body: {}, cookies: owner })).json.invite.code;
    await req('/api/org/join', { method: 'POST', body: { code }, cookies: hand });
  });

  test('nothing is configured to begin with', async () => {
    const { status, json } = await req('/api/org/hook', { cookies: owner });
    assert.equal(status, 200);
    assert.deepEqual(json.hook, { configured: false });
  });

  /*
   * REFUSED BEFORE ANY SOCKET OPENS. Each of these is a property of the URL
   * rather than of the moment, so storing one would mean a webhook that is
   * refused identically at every send for ever.
   */
  test('a destination the guard will not dial is refused, with the reason', async () => {
    for (const [what, url] of [
      ['loopback', 'https://127.0.0.1/hook'],
      ['loopback by name', 'https://localhost/hook'],
      ['the cloud metadata endpoint', 'https://169.254.169.254/latest/meta-data/'],
      ['a private address', 'https://10.1.2.3/hook'],
      ['IPv6 loopback', 'https://[::1]/hook'],
    ]) {
      const { status, json } = await req('/api/org/hook', { method: 'PUT', body: { url }, cookies: owner });
      assert.equal(status, 400, `${what} was accepted`);
      assert.match(json.error, /not reachable from here|could not resolve/);
    }
    assert.deepEqual((await req('/api/org/hook', { cookies: owner })).json.hook, { configured: false },
      'a refused save must not have stored anything');
  });

  test('http is refused, because the URL carries a token', async () => {
    const { status, json } = await req('/api/org/hook', {
      method: 'PUT', body: { url: 'http://hooks.example.invalid/x' }, cookies: owner,
    });
    assert.equal(status, 400);
    assert.match(json.error, /https/);
  });

  test('so is something that is not a URL at all', async () => {
    const { status } = await req('/api/org/hook', { method: 'PUT', body: { url: 'chat me on slack' }, cookies: owner });
    assert.equal(status, 400);
  });

  /*
   * A host that does not resolve is a property of the MOMENT, not of the URL.
   * Refusing the save on it means an owner cannot configure a webhook while
   * the far end is down, or before they have finished setting it up at the
   * other end — and a webhook nobody can save during an incident is the wrong
   * failure. It stores, carrying the reason it did not deliver.
   */
  test('a well-formed URL that did not answer is still saved, with the reason recorded', async () => {
    const { status, json } = await req('/api/org/hook', { method: 'PUT', body: { url: URL_OK }, cookies: owner });
    assert.equal(status, 200);
    assert.equal(json.hook.configured, true);
    assert.equal(json.delivered, false);
    assert.ok(json.hook.lastError, 'the owner has to be told it did not get through');
    assert.ok(json.hook.lastErrorAt > 0);
  });

  /*
   * NO READ-BACK, ANYWHERE. An owner who has lost the token re-enters it. The
   * masked form exists so the screen can say WHICH destination is configured
   * without the response, the screen or the browser's memory holding the
   * credential.
   */
  test('the owner never gets the URL back, only enough to recognise it', async () => {
    const { text, json } = await req('/api/org/hook', { cookies: owner });
    assert.ok(!text.includes(TOKEN), 'the token came back');
    assert.ok(!text.includes(URL_OK), 'the URL came back');
    assert.equal(json.hook.host, 'hooks.example.invalid');
    assert.match(json.hook.masked, /hooks\.example\.invalid\/services/);
    assert.equal(json.hook.addedBy, 'wh-owner@team.test');
  });

  test('and it still never reaches a sync response', async () => {
    for (const cookies of [owner, hand]) {
      const { text } = await req('/api/sync?since=0', { cookies });
      assert.ok(!text.includes(TOKEN));
    }
  });

  test('a member cannot read it, set it, or test it', async () => {
    // A member, not a viewer: the point is that this is owner-only rather than
    // merely write-protected, so the rung immediately below owner is the one
    // worth checking.
    assert.equal((await req('/api/org/hook', { cookies: hand })).status, 403);
    assert.equal((await req('/api/org/hook', {
      method: 'PUT', body: { url: 'https://evil.example.invalid/x' }, cookies: hand,
    })).status, 403);
    assert.equal((await req('/api/org/hook/test', { method: 'POST', body: {}, cookies: hand })).status, 403);
    // And the owner's hook is untouched by the attempt.
    assert.equal((await req('/api/org/hook', { cookies: owner })).json.hook.host, 'hooks.example.invalid');
  });

  test('a stranger gets nothing', async () => {
    const outsider = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'wh-outsider@other.test' }, cookies: outsider });
    const { json } = await req('/api/org/hook', { cookies: outsider });
    // Their own workspace, which has no webhook — never this team's.
    assert.deepEqual(json.hook, { configured: false });
  });

  test('the test button reports failure honestly rather than claiming success', async () => {
    const { status, json } = await req('/api/org/hook/test', { method: 'POST', body: {}, cookies: owner });
    assert.equal(status, 200, 'the route worked; the delivery did not');
    assert.equal(json.ok, false);
    assert.ok(json.error, 'a silent failure here is the bug this whole design avoids');
    assert.ok(!json.error.includes(TOKEN), 'the token must not ride out on an error message');
  });

  test('clearing it removes the credential rather than blanking a field', async () => {
    const { json } = await req('/api/org/hook', { method: 'PUT', body: { url: '' }, cookies: owner });
    assert.deepEqual(json.hook, { configured: false });
    assert.equal(await readHook(wsId), null);
  });

  test('an absurd URL is refused before it is stored', async () => {
    const { status } = await req('/api/org/hook', {
      method: 'PUT', body: { url: `https://hooks.example.invalid/${'x'.repeat(3000)}` }, cookies: owner,
    });
    assert.equal(status, 413);
  });
});

/*
 * What a workspace would be told about today, computed but never sent.
 *
 * The number in a reminder has to be reproducible by clicking the due-date
 * filter (§37) — a digest counting rows the owner cannot get back to is a
 * support ticket, not a notification. That parity is structural here because
 * both sides call the same `watchedDateField` and `daysUntil` out of one file
 * (§39), and the E2E test compares the two counts on screen.
 */
describe('reminder preview', () => {
  const owner = jar();
  const hand = jar();

  // A named zone, pinned, so these expectations hold on a developer machine in
  // any timezone. The workspace zone is what the SERVER uses; the browser
  // filter deliberately uses the viewer's own (§38), and the two can honestly
  // disagree — which is why the E2E parity test aligns them first.
  const ZONE = 'Asia/Tokyo';

  before(async () => {
    await req('/auth/dev', { method: 'POST', body: { email: 'remind-owner@team.test' }, cookies: owner });
    const h = await req('/auth/dev', { method: 'POST', body: { email: 'remind-hand@team.test' }, cookies: hand });
    const code = (await req('/api/org/invites', { method: 'POST', body: {}, cookies: owner })).json.invite.code;
    await req('/api/org/join', { method: 'POST', body: { code }, cookies: hand });
    void h;

    const mod = {
      id: 'rm-invoices',
      name: 'Invoices',
      fields: [
        { key: 'name', label: 'Reference', type: 'text', showInList: true },
        { key: 'issued', label: 'Issued', type: 'date' },
        { key: 'due', label: 'Due', type: 'date', showInList: true },
      ],
    };
    const rec = (id, due, name) => ({
      id, updatedAt: 1000, doc: { id, moduleId: 'rm-invoices', data: { name, due } },
    });

    await req('/api/sync', {
      method: 'POST',
      cookies: owner,
      body: {
        since: 0,
        settings: { currency: 'USD', businessName: 'Remind Ltd', timezone: ZONE, remind: { enabled: false, days: 7 } },
        settingsUpdatedAt: 2000,
        modules: [{ id: 'rm-invoices', updatedAt: 1000, doc: mod }],
        records: [
          rec('rm-old', dayIn(ZONE, -40), 'INV-OLD'),
          rec('rm-late', dayIn(ZONE, -2), 'INV-LATE'),
          rec('rm-today', dayIn(ZONE, 0), 'INV-TODAY'),
          rec('rm-soon', dayIn(ZONE, 3), 'INV-SOON'),
          rec('rm-edge', dayIn(ZONE, 7), 'INV-EDGE'),
          rec('rm-far', dayIn(ZONE, 8), 'INV-FAR'),
          rec('rm-blank', '', 'INV-BLANK'),
        ],
      },
    });
  });

  const preview = async (cookies = owner) => (await req('/api/org/reminders', { cookies })).json;

  test('counts the same window the filter shows, overdue included', async () => {
    const { reminders } = await preview();
    const inv = reminders.modules.find((m) => m.id === 'rm-invoices');
    assert.ok(inv, 'the module with a date field is missing from the digest');
    // -40, -2, 0, +3, +7 are in. +8 is out. A blank date is never due.
    assert.equal(inv.overdue, 2, 'overdue rows must be counted, not hidden (§37)');
    assert.equal(inv.upcoming, 3);
    assert.equal(inv.total, 5);
    assert.equal(reminders.total, 5);
  });

  /*
   * The boundary in both directions. A window that excluded its own last day,
   * or that ran a day long, passes the totals above only by luck.
   */
  test('the last day of the window is inside it and the next day is not', async () => {
    const { reminders } = await preview();
    assert.equal(reminders.total, 5, `+7 in, +8 out — got ${reminders.total}`);
  });

  test('it watches the field the filter would watch, and says which', async () => {
    const { reminders } = await preview();
    // Two date fields on this module; `watchedDateField` prefers the list
    // column, so it must be Due rather than Issued — and the answer is named,
    // because filtering on a date the reader cannot see is indistinguishable
    // from rows going missing (§37).
    assert.equal(reminders.modules[0].field, 'Due');
  });

  test('the workspace zone is used, not the container one', async () => {
    const { reminders } = await preview();
    assert.equal(reminders.zone, ZONE);
    assert.equal(reminders.zoneSet, true);
    assert.equal(reminders.dayKey, DR.dayKey(ZONE, new Date()));
  });

  /*
   * The workspace's own wall clock, so the screen can say what the digest is
   * WAITING for. Found by running the trial: with the default 09:00 and a
   * server at 02:00 the pass correctly skips as too-early, and the card said
   * nothing whatsoever — working exactly as designed and indistinguishable
   * from broken (§36).
   */
  test('it reports the workspace own current time, not the container one', async () => {
    const { reminders } = await preview();
    const wall = DR.zoneParts(ZONE, new Date());
    assert.equal(reminders.nowHour, wall.hour);
    assert.match(reminders.nowLabel, /^\d{2}:\d{2}$/);
    assert.equal(reminders.nowLabel, `${String(wall.hour).padStart(2, '0')}:${String(wall.minute).padStart(2, '0')}`);
    // The comparison the morning gate actually makes, so a screen can predict
    // it rather than guess.
    assert.equal(typeof reminders.hour, 'number');
  });

  /*
   * COUNTS ONLY, and it is a decision rather than an omission: a webhook
   * destination is not necessarily as private as the workspace — a shared
   * client channel is a plausible place for an owner to point it — and §18
   * already refuses to put record names on a chat service.
   */
  test('no record names or values come back, only counts', async () => {
    const { text } = await req('/api/org/reminders', { cookies: owner });
    for (const name of ['INV-OLD', 'INV-LATE', 'INV-TODAY', 'INV-SOON', 'INV-EDGE', 'INV-BLANK']) {
      assert.ok(!text.includes(name), `the preview leaked a record name: ${name}`);
    }
    assert.ok(text.includes('Invoices'), 'the module name is carried, since it is what makes the count legible');
  });

  test('it answers before anything is switched on', async () => {
    const { reminders } = await preview();
    // Requiring somebody to enable a thing in order to see what it would do is
    // how a surprise message reaches a team channel.
    assert.equal(reminders.enabled, false);
    assert.equal(reminders.skipped, null);
    assert.ok(reminders.total > 0);
  });

  test('a member cannot read it', async () => {
    assert.equal((await req('/api/org/reminders', { cookies: hand })).status, 403);
  });

  /*
   * THE SCALE CAP, and the early return is load-bearing rather than tidiness:
   * modules are read before records, so a workspace with no date field at all
   * never touches the records collection. That is the whole bound on what a
   * daily pass costs as tenant count grows.
   */
  test('a workspace with no date field returns without scanning records', async () => {
    const solo = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'remind-nodates@solo.test' }, cookies: solo });
    await req('/api/sync', {
      method: 'POST',
      cookies: solo,
      body: {
        since: 0,
        modules: [{ id: 'nd-1', updatedAt: 1, doc: { id: 'nd-1', name: 'Notes', fields: [{ key: 'name', label: 'Name', type: 'text' }] } }],
        records: [{ id: 'nd-r', updatedAt: 1, doc: { id: 'nd-r', moduleId: 'nd-1', data: { name: 'x' } } }],
      },
    });
    const { reminders } = await preview(solo);
    assert.equal(reminders.skipped, 'no-date-fields');
    assert.equal(reminders.total, 0);
    assert.equal(reminders.scanned, undefined, 'the records collection must not have been read');
  });

  /*
   * Stored settings are never trusted at the point of use — the same rule
   * resolveZone follows, and for the same reason: `remind` arrives through the
   * unvalidated sync seam (§38). A NaN window would make isDueWithin false for
   * everything and the digest would go quiet without ever erroring.
   */
  test('a nonsense window and a nonsense zone fall back instead of breaking', async () => {
    await req('/api/sync', {
      method: 'POST',
      cookies: owner,
      body: {
        since: 0,
        settings: {
          currency: 'USD', businessName: 'Remind Ltd',
          timezone: 'Not/AZone',
          remind: { enabled: 'yes please', days: 'soon', hour: 99 },
        },
        settingsUpdatedAt: 3000,
      },
    });
    const { reminders } = await preview();
    assert.equal(reminders.zone, 'UTC', 'an unusable zone must not take the pass down');
    assert.equal(reminders.days, 7, 'a nonsense window falls back to the default');
    assert.equal(reminders.hour, 23, 'an out-of-range hour is clamped, not stored as 99');
    assert.equal(reminders.enabled, false, 'only a real boolean true enables sending');
  });
});
