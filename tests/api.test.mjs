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

  test('the first account to sign in becomes an admin', async () => {
    const cookies = jar();
    const { status, json } = await req('/auth/dev', { method: 'POST', body: { email: 'owner@example.com' }, cookies });
    assert.equal(status, 200);
    assert.equal(json.user.email, 'owner@example.com');
    assert.equal(json.user.role, 'admin');

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

  test('non-admins are refused', async () => {
    for (const path of ['/api/admin/stats', '/api/admin/users']) {
      const { status } = await req(path, { cookies: user });
      assert.equal(status, 403, `${path} should be admin-only`);
    }
    const patch = await req(`/api/admin/users/${userId}`, { method: 'PATCH', body: { role: 'admin' }, cookies: user });
    assert.equal(patch.status, 403, 'a user must not be able to promote themselves');
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
    const up = await req(`/api/admin/users/${userId}`, { method: 'PATCH', body: { role: 'admin' }, cookies: admin });
    assert.equal(up.json.user.role, 'admin');
    assert.equal((await req('/api/admin/stats', { cookies: user })).status, 200, 'a promoted user should reach admin routes');

    const down = await req(`/api/admin/users/${userId}`, { method: 'PATCH', body: { role: 'user' }, cookies: admin });
    assert.equal(down.json.user.role, 'user');
    assert.equal((await req('/api/admin/stats', { cookies: user })).status, 403);
  });

  test('an invalid role is ignored rather than applied', async () => {
    const { status, json } = await req(`/api/admin/users/${userId}`, { method: 'PATCH', body: { role: 'superuser' }, cookies: admin });
    assert.equal(status, 200);
    assert.equal(json.user.role, 'user', 'unknown roles must not be written through');
  });

  test('deleting an account removes it and its data', async () => {
    const del = await req(`/api/admin/users/${userId}`, { method: 'DELETE', cookies: admin });
    assert.equal(del.status, 200);

    const { json } = await req('/api/admin/users', { cookies: admin });
    assert.equal(json.users.find((u) => u.id === userId), undefined);
    assert.equal((await req('/api/data', { cookies: user })).status, 401);
  });
});
