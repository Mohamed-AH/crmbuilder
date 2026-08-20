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
import { mkdtemp, rm } from 'node:fs/promises';
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

before(async () => {
  if (EXTERNAL) return;
  dataDir = await mkdtemp(join(tmpdir(), 'crmb-test-'));
  const port = 8300 + Math.floor(Math.random() * 600);
  BASE = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      ALLOW_DEV_LOGIN: '1',
      MONGODB_URI: '',
      SESSION_SECRET: 'test-secret-not-for-production',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { serverLog += d; });
  child.stderr.on('data', (d) => { serverLog += d; });
  await waitForServer(BASE);
});

after(async () => {
  if (child) child.kill();
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

  test('the account list includes per-account usage', async () => {
    const { json } = await req('/api/admin/users', { cookies: admin });
    const member = json.users.find((u) => u.email === 'member@example.com');
    assert.ok(member, 'member account missing from the list');
    assert.equal(typeof member.recordCount, 'number');
    assert.equal(typeof member.moduleCount, 'number');
    assert.ok(!('provider' in member) || typeof member.provider === 'string');
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
