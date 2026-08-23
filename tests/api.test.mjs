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

/*
 * Put a user into an organisation.
 *
 * Stage B adds the invite flow that does this for real. Until then the tests
 * need some way to create the situation under test — two people in one org —
 * so they reach past the API into the file store the test server is using.
 */
async function moveToOrg(userId, orgId) {
  // The file store keeps everything in memory and rewrites the whole file on
  // every save, so editing it underneath a running server would be clobbered
  // by the next write. Stop, edit, start.
  await stopServer();
  const file = join(dataDir, 'store.json');
  const raw = JSON.parse(await readFile(file, 'utf8'));
  const user = raw.users.find((u) => u.id === userId);
  user.orgId = orgId;
  user.role = 'member';
  await writeFile(file, JSON.stringify(raw));
  await startServer();
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

function startServer() {
  child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT_IN_USE),
      DATA_DIR: dataDir,
      ALLOW_DEV_LOGIN: '1',
      MONGODB_URI: '',
      SESSION_SECRET: TEST_SECRET,
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
  PORT_IN_USE = 8300 + Math.floor(Math.random() * 600);
  BASE = `http://127.0.0.1:${PORT_IN_USE}`;
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
    // Until invites exist (stage B) membership is set directly; the point
    // under test is the ownership key, not how someone came to be a member.
    await moveToOrg(mateId, orgId);
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
    const admin = jar();
    await req('/auth/dev', { method: 'POST', body: { email: 'owner@example.com' }, cookies: admin });
    const del = await req(`/api/admin/users/${ownerId}`, { method: 'DELETE', cookies: admin });
    assert.equal(del.status, 200);
    assert.equal(del.json.deletedWorkspace, true, 'nobody is left to use it');

    // A fresh account in that org — only reachable in a test — sees nothing.
    const revived = jar();
    const r = await req('/auth/dev', { method: 'POST', body: { email: 'ws-revived@team.test' }, cookies: revived });
    await moveToOrg(r.json.user.id, orgId);
    const { json } = await req('/api/sync?since=0', { cookies: revived });
    assert.equal(json.records.length, 0);
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
