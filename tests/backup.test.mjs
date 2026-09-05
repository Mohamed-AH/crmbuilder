/*
 * backup.test.mjs — the backup drill, automated.
 *
 * `docs/BETA.md` § "Drilling the backup" is the same exercise by hand, and it
 * exists because an untested backup is a rumour. Doing it by hand catches drift
 * only when somebody remembers to look; this catches it on every push.
 *
 * Export from a real server, restore with the real script, boot a second server
 * over the result, and ask it what it has. Nothing here inspects `store.json`
 * except where the point IS the file — the same rule as fixture.test.mjs, and
 * for the same reason: a hand-read shape drifts from the server's without ever
 * throwing.
 *
 * TWO CANARIES, ONE PER TENANT, and that is the design rather than decoration.
 * Aggregate counts pass happily when rows land in the WRONG workspace, which is
 * the failure a restore actually has — §17 measured a wsId collision losing 174
 * of 180 records while every total still looked plausible. So each owner must
 * see their own canary and must NOT see the other's.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// 9500-9550. Blocks are disjoint per file — see the table in CLAUDE.md §9.
// Two servers, two sub-ranges: §4 requires a FRESH port per boot, because
// rebinding one that was listening a moment ago races.
const SRC_PORT = 9500 + Math.floor(Math.random() * 25);
const DST_PORT = 9525 + Math.floor(Math.random() * 25);
const SRC = `http://127.0.0.1:${SRC_PORT}`;
const DST = `http://127.0.0.1:${DST_PORT}`;

const TOKEN = 'backup-drill-token';
const MAYA_CANARY = 'CANARY-7Q4X';
const NADIA_CANARY = 'CANARY-N2M8';

let srcDir;
let dstDir;
let backupFile;
let srcChild;
let dstChild;
let backup;
let restoredStore;

async function req(base, pathname, { method = 'GET', body, cookies, headers } = {}) {
  const res = await fetch(`${base}${pathname}`, {
    method,
    redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(cookies ? { Cookie: cookies } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, setCookie: (res.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ') };
}

const signIn = async (base, email) =>
  (await req(base, '/auth/dev', { method: 'POST', body: { email, name: email } })).setCookie;

async function boot(port, dir) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dir,
      ALLOW_DEV_LOGIN: '1',
      MONGODB_URI: '',
      SESSION_SECRET: 'backup-test-secret',
      BACKUP_TOKEN: TOKEN,
      NODE_ENV: 'test',
      ADMIN_EMAILS: '',
    },
    stdio: 'pipe',
  });
  const deadline = Date.now() + 15000;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`server on ${port} did not start`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(1200) })).ok) break;
    } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 120));
  }
  return child;
}

const stop = async (child) => {
  if (!child) return;
  const dead = new Promise((r) => child.once('exit', r));
  child.kill();
  await dead;
};

before(async () => {
  srcDir = await mkdtemp(path.join(tmpdir(), 'crmb-backup-src-'));
  dstDir = await mkdtemp(path.join(tmpdir(), 'crmb-backup-dst-'));
  backupFile = path.join(srcDir, 'backup.json');

  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'seed-fixture.mjs'), '--yes'], {
    cwd: ROOT,
    env: { ...process.env, DATA_DIR: srcDir, MONGODB_URI: '' },
    stdio: 'pipe',
  });

  /*
   * Give the source deployment something in the two collections the export is
   * known to drop, BEFORE booting — FileStore holds the store in memory and
   * rewrites the whole file on save, so editing it under a running server is
   * clobbered by the next write (§12).
   *
   * Without this the "absent" assertions below would be trivially true and
   * would keep passing after the export is fixed, which is the shape of a test
   * that proves nothing.
   */
  const storeFile = path.join(srcDir, 'store.json');
  const store = JSON.parse(readFileSync(storeFile, 'utf8'));
  store.accessRequests = [{
    email: 'knocking@drill.invalid',
    name: 'Someone Knocking',
    note: '',
    status: 'approved',
    requestedAt: Date.now(),
    decidedAt: Date.now(),
    decidedBy: 'ops',
  }];
  store.platform = {
    // Operator decisions — a restore SHOULD bring these back (step 2).
    signupMode: 'closed',
    orgCreation: 'closed',
    // Runtime state — a restore should NOT, because it belongs to the dead
    // deployment: seeding a fresh one with this carries spent alert steps and
    // another instance's traffic across (§17, §25).
    egressBytes: 4242,
    alerts: { storage: { lastLevel: 85, lastFiredAt: Date.now() } },
  };
  writeFileSync(storeFile, JSON.stringify(store));

  srcChild = await boot(SRC_PORT, srcDir);

  // One canary per tenant. Each owner builds their own module so the test does
  // not depend on which fixture module happens to exist.
  const now = Date.now();
  const maya = await signIn(SRC, 'maya@fixture.invalid');
  await req(SRC, '/api/sync', {
    method: 'POST',
    cookies: maya,
    body: {
      since: 0,
      modules: [{ id: 'drill-m-maya', updatedAt: now, doc: { id: 'drill-m-maya', name: 'Equipment', fields: [{ key: 'serial', label: 'Serial', type: 'text' }] } }],
      records: [{ id: 'drill-r-maya', updatedAt: now, doc: { id: 'drill-r-maya', moduleId: 'drill-m-maya', data: { serial: MAYA_CANARY } } }],
    },
  });

  const nadia = await signIn(SRC, 'nadia@fixture.invalid');
  await req(SRC, '/api/sync', {
    method: 'POST',
    cookies: nadia,
    body: {
      since: 0,
      modules: [{ id: 'drill-m-nadia', updatedAt: now, doc: { id: 'drill-m-nadia', name: 'Assets', fields: [{ key: 'serial', label: 'Serial', type: 'text' }] } }],
      records: [{ id: 'drill-r-nadia', updatedAt: now, doc: { id: 'drill-r-nadia', moduleId: 'drill-m-nadia', data: { serial: NADIA_CANARY } } }],
    },
  });

  const exported = await req(SRC, '/api/admin/export', { headers: { Authorization: `Bearer ${TOKEN}` } });
  assert.equal(exported.status, 200, 'the export must succeed or nothing below means anything');
  writeFileSync(backupFile, exported.text);
  backup = exported.json;

  await stop(srcChild);
  srcChild = null;

  /*
   * Check the premise the "absent" tests below rest on.
   *
   * If the source deployment never actually held an approved request and the
   * two operator settings, then "the export does not carry them" is hollow and
   * would keep passing after step 2 ships. Read once the server has stopped,
   * so this is what it really had at export time rather than what was written
   * before it booted — FileStore rewrites the whole file on every save (§12).
   */
  const sourceStore = JSON.parse(readFileSync(storeFile, 'utf8'));
  assert.equal(sourceStore.accessRequests?.length, 1, 'the source lost the approved request — the gap tests would be hollow');
  assert.equal(sourceStore.platform?.signupMode, 'closed', 'the source lost signupMode — the gap tests would be hollow');
  assert.equal(sourceStore.platform?.orgCreation, 'closed', 'the source lost orgCreation — the gap tests would be hollow');
  assert.equal(sourceStore.platform?.egressBytes !== undefined, true, 'the source lost its runtime counters');

  const restored = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'restore.mjs')], {
    cwd: ROOT,
    env: { ...process.env, BACKUP_FILE: backupFile, DATA_DIR: dstDir, MONGODB_URI: '' },
    encoding: 'utf8',
  });
  assert.equal(restored.status, 0, `restore failed:\n${restored.stdout}\n${restored.stderr}`);

  /*
   * Snapshot the restored store BEFORE anything boots over it.
   *
   * A running server writes to this file — the egress counter lands in
   * `platform` within the first request — so reading it afterwards cannot tell
   * "the restore brought this back" from "the new deployment accumulated it".
   * Measuring after the boot is how the first version of the runtime-state
   * assertion below failed against correct code.
   */
  restoredStore = JSON.parse(readFileSync(path.join(dstDir, 'store.json'), 'utf8'));

  dstChild = await boot(DST_PORT, dstDir);
});

after(async () => {
  await stop(srcChild);
  await stop(dstChild);
  if (srcDir) await rm(srcDir, { recursive: true, force: true }).catch(() => {});
  if (dstDir) await rm(dstDir, { recursive: true, force: true }).catch(() => {});
});

describe('a backup, restored and asked what it holds', () => {
  test('every owner finds their own canary, in their own workspace', async () => {
    const maya = await signIn(DST, 'maya@fixture.invalid');
    const mine = (await req(DST, '/api/sync?since=0', { cookies: maya })).json;
    const serials = mine.records.filter((r) => r.doc).map((r) => r.doc.data?.serial);
    assert.ok(serials.includes(MAYA_CANARY), `Lumen Studio lost ${MAYA_CANARY} across the restore`);

    const nadia = await signIn(DST, 'nadia@fixture.invalid');
    const hers = (await req(DST, '/api/sync?since=0', { cookies: nadia })).json;
    const herSerials = hers.records.filter((r) => r.doc).map((r) => r.doc.data?.serial);
    assert.ok(herSerials.includes(NADIA_CANARY), `Northwind lost ${NADIA_CANARY} across the restore`);
  });

  /*
   * The assertion counts cannot make. A restore that merged the two tenants
   * into one workspace returns the right number of rows to every total in the
   * script's own read-back, and only shows itself here.
   */
  test('one tenant does not receive another tenant rows', async () => {
    const maya = await signIn(DST, 'maya@fixture.invalid');
    const mine = (await req(DST, '/api/sync?since=0', { cookies: maya })).json;
    const serials = mine.records.filter((r) => r.doc).map((r) => r.doc.data?.serial);
    // Without this the test passes on an empty pull, which is the vacuous form
    // of "no foreign rows here" and would survive a restore that lost the lot.
    assert.ok(serials.includes(MAYA_CANARY), 'nothing to compare — Lumen Studio came back empty');
    assert.ok(
      !serials.includes(NADIA_CANARY),
      'Northwind\'s record reached Lumen Studio — the workspaces merged in the restore',
    );

    const modules = mine.modules.filter((m) => m.doc).map((m) => m.doc.name);
    assert.ok(!modules.includes('Assets'), 'Northwind\'s module reached Lumen Studio');
  });

  /*
   * The export comments say tombstones go back "exactly as they came out",
   * because a restore that dropped them resurrects every deleted record on
   * every device at its next sync (§10). The fixture ages them across the
   * retention window, so there are some to lose.
   */
  test('tombstones survive, so a restore does not resurrect deleted rows', async () => {
    const maya = await signIn(DST, 'maya@fixture.invalid');
    const pull = (await req(DST, '/api/sync?since=0', { cookies: maya })).json;
    const dead = pull.records.filter((r) => r.deleted).length;
    assert.ok(dead > 0, 'no tombstones came back — deleted records will return on every device');
  });

  test('the restored deployment holds what the backup claimed', async () => {
    const after = (await req(DST, '/api/admin/export', { headers: { Authorization: `Bearer ${TOKEN}` } })).json;
    const shape = (b) => ({
      users: b.users.length,
      orgs: b.orgs.length,
      workspaces: b.workspaces.length,
      modules: b.workspaces.reduce((n, w) => n + (w.modules || []).length, 0),
      records: b.workspaces.reduce((n, w) => n + (w.records || []).length, 0),
    });
    assert.deepEqual(shape(after), shape(backup), 're-exporting the restored store must give back the same shape');
  });

  /*
   * Checked against the broken state per §9, using a REAL failure rather than an
   * invented one: the file store keys workspaces by wsId, so two workspaces
   * sharing an id have the second Object.fromEntries replace the first's bag.
   * Before the read-back landed, restore.mjs printed "Restored into …" and
   * exited 0 on exactly this input while holding a fraction of the rows.
   */
  test('a restore that loses rows exits non-zero instead of reporting success', async () => {
    const collided = JSON.parse(JSON.stringify(backup));
    assert.ok(collided.workspaces.length > 1, 'this needs two workspaces to collide');
    collided.workspaces[1].wsId = collided.workspaces[0].wsId;

    const file = path.join(srcDir, 'collided.json');
    const into = path.join(srcDir, 'collided-out');
    writeFileSync(file, JSON.stringify(collided));

    const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'restore.mjs')], {
      cwd: ROOT,
      env: { ...process.env, BACKUP_FILE: file, DATA_DIR: into, MONGODB_URI: '' },
      encoding: 'utf8',
    });
    assert.notEqual(run.status, 0, 'a restore that lost rows must not report success');
    assert.match(run.stderr, /Do not trust this restore/);
  });
});

/*
 * These two assert what the export does NOT carry today.
 *
 * They are the Red half of step 2, written first on purpose (§9: a test that
 * has only ever seen the fixed code proves nothing). The source deployment is
 * seeded with a real approved request and real operator settings above, so
 * "absent" here is a measurement rather than a tautology.
 *
 * WHEN STEP 2 SHIPS, these flip: the request should come back, and so should
 * signupMode and orgCreation — but NOT egressBytes or alerts, which belong to
 * the deployment that died. Invert the assertions rather than deleting them.
 */
describe('what a restore silently loses today', () => {
  test('the approval allowlist does not survive the round trip', () => {
    assert.equal(backup.accessRequests, undefined, 'the export has started carrying accessRequests — flip this test (step 2)');
    assert.deepEqual(
      restoredStore.accessRequests ?? [],
      [],
      'approved requests came back — flip this test, approval IS the allowlist (§20)',
    );
  });

  /*
   * The source deployment had signups and org creation CLOSED. The restored one
   * has no stored mode at all, so §16's precedence hands the decision to the env
   * var — which is how a restore quietly reopens a door the operator shut.
   */
  test('the operator signup decisions fall back to the environment', () => {
    assert.equal(backup.platform, undefined, 'the export has started carrying platform — flip this test (step 2)');

    const platform = restoredStore.platform || {};
    assert.equal(platform.signupMode, undefined, 'signupMode came back — flip this test (step 2)');
    assert.equal(platform.orgCreation, undefined, 'orgCreation came back — flip this test (step 2)');
  });

  /*
   * This one does NOT flip when step 2 ships — it is the half that must keep
   * passing. `platform` mixes operator decisions with runtime state, and
   * restoring the runtime half seeds a fresh deployment with a dead one's
   * traffic and its spent alert steps (§17, §25).
   */
  test('runtime counters are not carried into the restored deployment', () => {
    const platform = restoredStore.platform || {};
    assert.equal(platform.egressBytes, undefined, 'a dead deployment\'s egress total was restored (§17)');
    assert.equal(platform.alerts, undefined, 'spent alert steps were restored — thresholds will stay silent (§25)');
  });
});
