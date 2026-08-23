/*
 * migration.test.mjs — boot-time data migrations.
 *
 *   node --test tests/migration.test.mjs
 *
 * Migrations only run at startup, so each case here hand-builds a store in the
 * shape a real deployment would be in, boots a server against it, and asks the
 * API what came out. Written this way rather than by calling the functions
 * directly because the thing being tested is what a live upgrade does.
 */
import { test, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const dirs = [];
const running = [];

after(async () => {
  for (const c of running) c.kill();
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

/*
 * Boot a server against a given store, and return its base URL plus whatever
 * it logged — the migrations announce themselves there, and "it printed
 * nothing the second time" is how idempotence is observed from outside.
 */
async function bootWith(store, { reuseDir } = {}) {
  const dir = reuseDir || await mkdtemp(join(tmpdir(), 'crmb-mig-'));
  if (!reuseDir) dirs.push(dir);
  await mkdir(dir, { recursive: true });
  if (store) await writeFile(join(dir, 'store.json'), JSON.stringify(store));

  const port = 8700 + Math.floor(Math.random() * 250);
  const base = `http://127.0.0.1:${port}`;
  let log = '';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dir,
      ALLOW_DEV_LOGIN: '1',
      MONGODB_URI: '',
      SESSION_SECRET: 'migration-test-secret',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  running.push(child);
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited (${child.exitCode}):\n${log}`);
    try {
      const res = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 120));
  }

  const stop = async () => {
    const dead = new Promise((r) => child.once('exit', r));
    child.kill();
    await dead;
  };
  return { base, dir, stop, log: () => log, read: async () => JSON.parse(await readFile(join(dir, 'store.json'), 'utf8')) };
}

/*
 * Sign in and read the workspace back the way the client would.
 *
 * Both views are returned deliberately. `data` (from /api/data) reads ids out
 * of the stored document, which is NOT the id the sync protocol matches on —
 * a migration that minted fresh envelope ids would still look correct there.
 * `delta` (from /api/sync) returns the envelope id, which is the one that has
 * to match what the client already holds in IndexedDB.
 */
async function workspaceOf(base, email) {
  const login = await fetch(`${base}/auth/dev`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const cookie = (login.headers.getSetCookie?.() || [])
    .map((c) => c.split(';')[0]).join('; ');
  const data = await (await fetch(`${base}/api/data`, { headers: { Cookie: cookie } })).json();
  const delta = await (await fetch(`${base}/api/sync?since=0`, { headers: { Cookie: cookie } })).json();
  return { data, delta, cookie };
}

const user = (id, orgId, email, role = 'owner') => ({
  id, email, name: email.split('@')[0], provider: 'dev', role,
  disabled: false, createdAt: 1000, lastActiveAt: 1000, orgId,
});
const org = (id, name) => ({ id, name, createdAt: 1000, createdBy: 'seed' });

// A workspace in the shape the previous release wrote: per-record rows, but
// keyed by the account rather than by the organisation.
function accountKeyedStore() {
  const item = (id, extra) => ({
    userId: 'u1', orgId: 'o1', id, updatedAt: 2000, serverAt: 1700000000000,
    deletedAt: null, deletedOn: null, ...extra,
  });
  return {
    users: [user('u1', 'o1', 'legacy@example.com', 'platformAdmin')],
    orgs: [org('o1', 'Legacy Co')],
    data: {
      u1: {
        userId: 'u1', orgId: 'o1', settings: { currency: 'GBP', businessName: 'Legacy Co' },
        settingsUpdatedAt: 2000, settingsServerAt: 1700000000000,
        moduleCount: 1, recordCount: 2, perRecord: true, updatedAt: 2000,
      },
    },
    events: [],
    items: {
      modules: { u1: { 'm-keep': item('m-keep', { doc: { id: 'm-keep', name: 'Contacts', fields: [{ key: 'name', label: 'Name', type: 'text' }] } }) } },
      records: {
        u1: {
          'r-1': item('r-1', { doc: { id: 'r-1', moduleId: 'm-keep', data: { name: 'Ada' } } }),
          'r-2': item('r-2', { doc: { id: 'r-2', moduleId: 'm-keep', data: { name: 'Grace' } } }),
        },
      },
    },
  };
}

describe('moving workspaces to their organisation', () => {
  test('re-keys an account-keyed workspace, preserving ids exactly', async () => {
    const srv = await bootWith(accountKeyedStore());
    assert.match(srv.log(), /Moved 1 workspace/);

    const { data, delta } = await workspaceOf(srv.base, 'legacy@example.com');
    assert.equal(data.modules.length, 1);
    assert.equal(data.records.length, 2);
    // The SYNC ids, not the ids inside the documents. These are what the
    // client already holds in IndexedDB; minting new ones would duplicate
    // every row on the next sync instead of matching it.
    assert.equal(delta.modules[0].id, 'm-keep');
    assert.deepEqual(delta.records.map((r) => r.id).sort(), ['r-1', 'r-2']);
    assert.equal(data.settings.currency, 'GBP');

    const raw = await srv.read();
    assert.ok(raw.items.records.o1, 'rows should now be keyed by the organisation');
    assert.equal(raw.items.records.u1, undefined, 'and no longer by the account');
    assert.equal(raw.items.records.o1['r-1'].wsId, 'o1');
    assert.equal(raw.data.o1.wsId, 'o1');
    await srv.stop();
  });

  test('is a no-op on the second boot', async () => {
    const first = await bootWith(accountKeyedStore());
    assert.match(first.log(), /Moved 1 workspace/);
    await first.stop();

    const second = await bootWith(null, { reuseDir: first.dir });
    assert.doesNotMatch(second.log(), /Moved \d+ workspace/, 'nothing left to move');
    const { data } = await workspaceOf(second.base, 'legacy@example.com');
    assert.equal(data.records.length, 2, 'and the workspace is intact');
    await second.stop();
  });

  /*
   * The refusal that makes the rename safe to do automatically.
   *
   * Re-keying userId -> orgId is only lossless because org<->user is 1:1: a
   * user's orgId is set at signup and nothing can change it. If two accounts
   * ever did share an org before this ran, their separate workspaces would be
   * silently merged into one. A loud no-op is the only honest response.
   */
  test('refuses when two accounts already share an organisation', async () => {
    const store = accountKeyedStore();
    store.users.push(user('u2', 'o1', 'second@example.com', 'member'));
    store.data.u2 = {
      userId: 'u2', orgId: 'o1', settings: {}, moduleCount: 0, recordCount: 1,
      perRecord: true, updatedAt: 2000,
    };
    store.items.records.u2 = {
      'r-other': {
        userId: 'u2', orgId: 'o1', id: 'r-other', updatedAt: 2000,
        serverAt: 1700000000001, deletedAt: null, deletedOn: null,
        doc: { id: 'r-other', moduleId: 'm-keep', data: { name: 'Would be merged' } },
      },
    };

    const srv = await bootWith(store);
    assert.match(srv.log(), /Refusing to move workspaces/);
    assert.doesNotMatch(srv.log(), /Moved \d+ workspace/);

    // Nothing moved, and both workspaces are exactly as they were.
    const raw = await srv.read();
    assert.ok(raw.items.records.u1, 'first account untouched');
    assert.ok(raw.items.records.u2, 'second account untouched');
    assert.equal(raw.items.records.o1, undefined, 'and nothing was merged');
    await srv.stop();
  });

  test('a pre-per-record snapshot lands org-keyed in one boot', async () => {
    const srv = await bootWith({
      users: [user('u1', 'o1', 'snapshot@example.com', 'platformAdmin')],
      orgs: [org('o1', 'Snapshot Co')],
      data: {
        u1: {
          userId: 'u1', orgId: 'o1',
          modules: [{ id: 'm-a', name: 'Deals', fields: [], createdAt: 1 }],
          records: [{ id: 'r-a', moduleId: 'm-a', data: { title: 'One' }, createdAt: 1, updatedAt: 2 }],
          settings: { currency: 'EUR', businessName: 'Snapshot Co' },
          moduleCount: 1, recordCount: 1, updatedAt: 2000,
        },
      },
      events: [],
    });
    assert.match(srv.log(), /Split 1 workspace/);

    const { data, delta } = await workspaceOf(srv.base, 'snapshot@example.com');
    // Again the sync ids: splitting a snapshot has to hand each row the id the
    // client's copy already carries, or every record arrives back as a new one.
    assert.equal(delta.modules[0].id, 'm-a');
    assert.equal(delta.records[0].id, 'r-a');
    assert.equal(data.settings.currency, 'EUR');

    const raw = await srv.read();
    assert.ok(raw.items.records.o1, 'the split writes straight to the organisation key');
    assert.equal(raw.data.u1, undefined, 'and the account-keyed document is gone');
    await srv.stop();
  });

  test('an account with no organisation is left alone rather than guessed at', async () => {
    const store = accountKeyedStore();
    // migrateToOrgs gives every account an org, so reaching migrateToOrgWorkspaces
    // without one means something is wrong. Skipping loudly beats inventing an
    // owner for somebody's data.
    store.items.records.ghost = {
      'r-ghost': {
        userId: 'ghost', orgId: null, id: 'r-ghost', updatedAt: 2000,
        serverAt: 1700000000002, deletedAt: null, deletedOn: null,
        doc: { id: 'r-ghost', moduleId: 'm-keep', data: { name: 'Orphan' } },
      },
    };
    const srv = await bootWith(store);
    assert.match(srv.log(), /Skipping workspace ghost: no such account/);
    const raw = await srv.read();
    assert.ok(raw.items.records.ghost, 'orphaned rows are left where they are, not deleted');
    await srv.stop();
  });
});
