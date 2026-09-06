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
// A webhook URL is a credential (§18: a Telegram URL contains the bot token)
// and a backup artifact is downloadable by anyone with read access to the
// private repo the nightly job runs in. Distinctive enough that searching the
// whole export body for it is a meaningful assertion.
const HOOK_TOKEN = 'CANARY-WEBHOOK-TOKEN-J8P2';
const HOOK_URL = `https://hooks.drill.invalid/services/T9/B9/${HOOK_TOKEN}`;
let hookWsId = null;
let restoreOutput = '';

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
  /*
   * Shaped like a REAL deployment's platform document, which is not what the
   * first version of this fixture held. `setSignupMode()` and `setOrgCreation()`
   * each write three keys — the value plus SetAt/SetBy — and seeding only the
   * two bare values let a restore that dropped the provenance pass, because the
   * fixture and the allow-list shared one wrong assumption. Found by restoring
   * a real artifact from the live deployment.
   *
   * If a lever is ever added, seed all three of its keys here.
   */
  const DECIDED_AT = 1756000000000;
  store.platform = {
    // Operator decisions, with the provenance the server really writes.
    // A restore must bring back all six.
    signupMode: 'closed',
    signupModeSetAt: DECIDED_AT,
    signupModeSetBy: 'ops-user-id',
    orgCreation: 'closed',
    orgCreationSetAt: DECIDED_AT,
    orgCreationSetBy: 'ops-user-id',
    // Runtime state — a restore must NOT, because it belongs to the dead
    // deployment: seeding a fresh one with this carries spent alert steps and
    // another instance's traffic across (§17, §25).
    egressBytes: 4242,
    egressMonth: '1999-01',
    alerts: { storage: { lastLevel: 85, lastFiredAt: DECIDED_AT } },
  };
  /*
   * A live webhook on one tenant, planted before boot for the same reason as
   * everything above: FileStore rewrites the whole file on save, so an edit
   * under a running server is clobbered (§12).
   */
  const mayaUser = (store.users || []).find((u) => u.email === 'maya@fixture.invalid');
  assert.ok(mayaUser, 'the fixture no longer seeds maya@fixture.invalid');
  hookWsId = mayaUser.orgId;
  store.data[hookWsId] = {
    ...(store.data[hookWsId] || {}),
    hook: { url: HOOK_URL, addedAt: DECIDED_AT, addedBy: 'maya@fixture.invalid', lastOkAt: DECIDED_AT },
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
  for (const key of ['signupMode', 'signupModeSetAt', 'signupModeSetBy', 'orgCreation', 'orgCreationSetAt', 'orgCreationSetBy']) {
    assert.notEqual(sourceStore.platform?.[key], undefined, `the source lost platform.${key} — the tests below would be hollow`);
  }
  assert.equal(sourceStore.platform?.egressBytes !== undefined, true, 'the source lost its runtime counters');
  assert.equal(sourceStore.platform?.alerts !== undefined, true, 'the source lost its alert state');
  // The hook has to have SURVIVED the source deployment's own writes, or
  // "the export does not carry it" is true for the wrong reason. refreshCounts
  // rewrites the meta doc on every sync, so this doubles as proof that a
  // counts write merges rather than replaces.
  assert.equal(sourceStore.data?.[hookWsId]?.hook?.url, HOOK_URL,
    'the source lost the webhook before the export — the redaction tests would be hollow');

  const restored = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'restore.mjs')], {
    cwd: ROOT,
    env: { ...process.env, BACKUP_FILE: backupFile, DATA_DIR: dstDir, MONGODB_URI: '' },
    encoding: 'utf8',
  });
  assert.equal(restored.status, 0, `restore failed:\n${restored.stdout}\n${restored.stderr}`);
  restoreOutput = restored.stdout;

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
 * `platform` is exported whole and restored in PART, so these three read as one
 * set: two things that must cross, one that must not. They were written as the
 * Red half before the export carried anything (§9), and inverted when it did —
 * which is why they are assertions about behaviour rather than about a shape
 * somebody hoped for.
 */
describe('what a restore brings back, and what it deliberately does not', () => {
  test('the approval allowlist survives, so nobody has to ask twice', () => {
    assert.equal(backup.accessRequests?.length, 1, 'the export dropped accessRequests');
    assert.equal(
      restoredStore.accessRequests?.[0]?.email,
      'knocking@drill.invalid',
      'the approved request did not come back — approval IS the allowlist (§20)',
    );
    assert.equal(restoredStore.accessRequests[0].status, 'approved', 'the decision came back without its verdict');
  });

  /*
   * §16's guarantee is that a stored panel decision beats the env var and
   * survives a redeploy. Until step 2 that did not extend to a restore, so a
   * recovery quietly reopened a door the operator had shut.
   */
  test('the operator signup decisions survive the round trip', () => {
    assert.equal(backup.platform?.signupMode, 'closed', 'the export dropped platform');
    assert.equal(restoredStore.platform?.signupMode, 'closed', 'signupMode did not come back — a restore reopens signups');
    assert.equal(restoredStore.platform?.orgCreation, 'closed', 'orgCreation did not come back');
  });

  /*
   * The provenance, asserted separately because it is a different failure: the
   * lever comes back and the record of who pulled it does not. Losing that is
   * not data loss you would notice — it is an audit trail missing at exactly
   * the moment somebody asks why signups were open.
   *
   * The narrow ['signupMode', 'orgCreation'] allow-list passes every other test
   * in this file and fails only here.
   */
  test('who set an operator decision, and when, comes back with it', () => {
    for (const key of ['signupMode', 'orgCreation']) {
      assert.equal(
        restoredStore.platform?.[`${key}SetAt`],
        backup.platform?.[`${key}SetAt`],
        `${key}SetAt was dropped — the decision came back without when it was made`,
      );
      assert.equal(
        restoredStore.platform?.[`${key}SetBy`],
        backup.platform?.[`${key}SetBy`],
        `${key}SetBy was dropped — the decision came back without who made it`,
      );
    }
  });

  /*
   * The half that must NOT cross, and the reason the whole document could not
   * simply be copied. `egressBytes` is a dead instance's traffic against this
   * month's allowance; `alerts` holds the escalate-only step each rule last
   * announced (§25), so carrying it silences a threshold on the deployment that
   * now needs it.
   */
  test('runtime counters and spent alert steps are left behind', () => {
    /*
     * Not pinned to the seeded 4242: the egress counter is keyed by month and
     * rolls over, so a value seeded without a matching `egressMonth` is reset
     * to zero and re-accumulated by the running server. That is the counter
     * working. What matters is that the export carries whatever it holds and
     * the restore refuses it, so assert the shape rather than the number.
     */
    assert.equal(typeof backup.platform?.egressBytes, 'number', 'the export should carry the whole document');
    assert.ok(backup.platform?.alerts, 'the export should carry the whole document');

    assert.equal(restoredStore.platform?.egressBytes, undefined, 'a dead deployment\'s egress total was restored (§17)');
    assert.equal(restoredStore.platform?.egressMonth, undefined, 'a dead deployment\'s egress month was restored (§17)');
    assert.equal(restoredStore.platform?.alerts, undefined, 'spent alert steps were restored — thresholds will stay silent (§25)');
  });

  /*
   * A version 1 backup carries neither key. The file on disk is older than the
   * code reading it far more often than the other way round, so this is the
   * ordinary case rather than an edge one.
   */
  test('a backup from before this change still restores', () => {
    const legacy = JSON.parse(JSON.stringify(backup));
    delete legacy.accessRequests;
    delete legacy.platform;
    legacy.version = 1;

    const file = path.join(srcDir, 'legacy.json');
    const into = path.join(srcDir, 'legacy-out');
    writeFileSync(file, JSON.stringify(legacy));

    const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'restore.mjs')], {
      cwd: ROOT,
      env: { ...process.env, BACKUP_FILE: file, DATA_DIR: into, MONGODB_URI: '' },
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, `a version 1 backup must still restore:\n${run.stdout}\n${run.stderr}`);

    const store = JSON.parse(readFileSync(path.join(into, 'store.json'), 'utf8'));
    assert.deepEqual(store.accessRequests, [], 'a missing collection must restore as empty, not undefined');
    assert.deepEqual(store.platform, {}, 'a missing platform must restore as empty, not undefined');
    assert.equal(store.users.length, backup.users.length, 'the records still have to come back');
  });
});

/*
 * The one thing in a workspace that must NOT survive the round trip.
 *
 * §17 already carries the rule this enforces: workspaces[].meta is the `data`
 * collection, so anything on the meta doc is in every nightly artifact, and a
 * GitHub build artifact is downloadable by anyone with repo read access. A
 * webhook URL is a live credential (§18: a Telegram URL contains the bot
 * token), so it is redacted on the way out.
 *
 * Replaced with a marker rather than deleted, and the third test is why: a
 * silently absent hook after a recovery is a notification channel that has
 * been dead since the incident, which is exactly when somebody is relying on
 * it. The marker is the only thing that can tell an operator to re-enter it.
 */
describe('a webhook URL does not travel in a backup', () => {
  test('the artifact carries the marker and not the credential', () => {
    const raw = readFileSync(backupFile, 'utf8');
    assert.ok(!raw.includes(HOOK_TOKEN), 'the backup file contains a live webhook token');
    assert.ok(!raw.includes('hooks.drill.invalid'), 'the backup file names the webhook host');

    // And it did not simply vanish: the marker proves the workspace HAD one,
    // which is what stops this passing on an export that lost the meta doc.
    const ws = backup.workspaces.find((w) => w.wsId === hookWsId);
    assert.ok(ws, 'the workspace with the webhook is missing from the backup entirely');
    assert.deepEqual(ws.meta.hook, { redacted: true });
    assert.equal(ws.meta.settings !== undefined, true, 'the rest of the meta doc still travels');
  });

  test('the restored deployment carries the re-entry marker and no URL', () => {
    /*
     * The marker USED to be stripped, and that is what made the loss silent.
     * What is stored now is a flag with nothing behind it: no url, so
     * deliverToHook and the digest gate both refuse it, and no host, because
     * the export does not carry one.
     */
    const hook = restoredStore.data?.[hookWsId]?.hook;
    assert.deepEqual(hook, { needsReentry: true });
    assert.equal(hook.url, undefined, 'a restored hook must never have a URL behind it');
  });

  test('and the restore says so, because the owner is not watching the terminal', () => {
    assert.match(restoreOutput, /1 workspace\(s\) had a notification webhook configured/);
    assert.match(restoreOutput, /re-enter/i);
  });

  /*
   * THIS TEST'S NAME WAS TRUE AND ITS ASSERTION WAS NOT.
   *
   * It read "the owner is told their notifications are off, rather than left
   * to find out", and asserted `{ configured: false }` — which is precisely
   * the state in which they are NOT told, because it is byte-identical to a
   * workspace that never set one up. The name described the intention; the
   * assertion pinned the opposite and passed.
   */
  test('the owner is told their notifications are off, rather than left to find out', async () => {
    const maya = await signIn(DST, 'maya@fixture.invalid');
    const { json } = await req(DST, '/api/org/hook', { cookies: maya });
    assert.equal(json.hook.configured, false, 'nothing can be sent — there is no URL');
    assert.equal(json.hook.needsReentry, true, 'and the owner is told why, rather than seeing a blank field');
  });

  test('a workspace that never had one is not told to re-enter anything', async () => {
    // The other half of the distinction. Without this, marking every empty
    // hook as needing re-entry would "pass" the test above while telling
    // people to restore something they never had.
    const nadia = await signIn(DST, 'nadia@fixture.invalid');
    const { json } = await req(DST, '/api/org/hook', { cookies: nadia });
    assert.deepEqual(json.hook, { configured: false });
  });

  test('re-entering one clears the notice', async () => {
    const maya = await signIn(DST, 'maya@fixture.invalid');
    // Unresolvable on purpose: the save stores it and reports the delivery
    // failure rather than refusing, because that is a property of the moment
    // rather than of the URL (§38).
    const saved = await req(DST, '/api/org/hook', {
      method: 'PUT', cookies: maya, body: { url: 'https://hooks.replaced.invalid/services/T1/B1/XYZ' },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.json.hook.configured, true);
    assert.equal(saved.json.hook.needsReentry, undefined, 'the notice must not outlive the fix');
  });
});
