/*
 * restore.mjs — put a backup back.
 *
 *   BACKUP_FILE=crmbuilder-backup-2026-01-01.json \
 *   MONGODB_URI="mongodb+srv://…/scratch" node scripts/restore.mjs
 *
 * Or against the JSON file store, by leaving MONGODB_URI unset:
 *
 *   BACKUP_FILE=… DATA_DIR=./data/scratch node scripts/restore.mjs
 *
 * An untested backup is a rumour, so this exists to be run — into a scratch
 * database, before a beta opens, and again whenever the export changes shape.
 *
 * It refuses to write into a database that already has accounts unless
 * RESTORE_OVERWRITE=1 is set. Restoring over live data is a thing you should
 * have to say twice.
 */
import { readFile } from 'node:fs/promises';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const file = process.env.BACKUP_FILE;
if (!file) {
  console.error('Set BACKUP_FILE to the backup you want to restore.');
  process.exit(1);
}

const backup = JSON.parse(await readFile(file, 'utf8'));
if (backup.app !== 'crmbuilder' || backup.kind !== 'backup') {
  console.error(`${file} is not a CRM Builder backup.`);
  process.exit(1);
}

const workspaces = backup.workspaces || [];
const users = backup.users || [];
const orgs = backup.orgs || [];

/*
 * Both default, because a version 1 backup carries neither and must still
 * restore cleanly — the file on disk is older than the code reading it more
 * often than the other way round.
 */
const accessRequests = backup.accessRequests || [];

/*
 * `platform` is exported whole and restored in PART, and the split is the
 * point rather than an optimisation.
 *
 * Operator decisions describe how the deployment should behave and must
 * survive — §16's guarantee is that a panel decision beats the env var, and a
 * restore that dropped them silently reopens signups the operator had shut.
 *
 * Runtime state describes what the DEAD deployment did. `egressBytes` is
 * another instance's traffic against this month's allowance, and `alerts`
 * holds the escalate-only step each rule last announced (§25) — carrying that
 * across means a threshold already crossed stays quiet on the new deployment,
 * which is exactly when it is wanted. Neither is a decision, so neither comes.
 *
 * An allow-list, not a delete-list: a key added to `platform` later is runtime
 * state until somebody decides otherwise, and defaulting the other way would
 * carry it silently.
 */
const RESTORED_PLATFORM_KEYS = ['signupMode', 'orgCreation'];
const platform = Object.fromEntries(
  RESTORED_PLATFORM_KEYS
    .filter((k) => (backup.platform || {})[k] !== undefined)
    .map((k) => [k, backup.platform[k]]),
);
const records = workspaces.reduce((n, w) => n + (w.records || []).length, 0);
const modules = workspaces.reduce((n, w) => n + (w.modules || []).length, 0);

console.log(`Backup taken ${backup.exportedAt}`);
console.log(`  ${orgs.length} organisation(s), ${users.length} account(s)`);
console.log(`  ${workspaces.length} workspace(s), ${modules} module(s), ${records} record(s)`);
console.log(`  ${accessRequests.length} access request(s)`);
// Say which levers are coming back. An operator restoring in an incident needs
// to know the deployment will come up with signups shut before they find out
// from a tester who cannot get in.
console.log(Object.keys(platform).length
  ? `  operator settings restored: ${Object.entries(platform).map(([k, v]) => `${k}=${v}`).join(', ')}`
  : '  no stored operator settings in this backup — the env vars will decide');

/*
 * What the store must be able to say afterwards.
 *
 * The Mongo branch has always counted its rows back. The file store wrote
 * store.json, printed "go and look", and verified nothing — so a drill against
 * the file store could not fail, and the file store is the only kind of drill
 * that is safe to run regularly. That asymmetry meant the cheap, repeatable
 * half of the exercise was the half that proved least.
 *
 * Both branches now ask the store what it holds *now*: Mongo counts documents,
 * the file store re-reads the file it just wrote. Counting the object we were
 * about to write would restate our intent rather than check the outcome.
 */
const expected = {
  accounts: users.length,
  organisations: orgs.length,
  workspaces: workspaces.filter((w) => w.meta).length,
  modules,
  records,
  // Counted for the same reason as the rest: a collection this script claims
  // to restore and never counts back is the gap the file-store branch was.
  requests: accessRequests.length,
};

function verifyCounts(actual) {
  let bad = 0;
  for (const [label, want] of Object.entries(expected)) {
    const got = actual[label];
    if (got !== want) bad += 1;
    console.log(`  ${String(got).padStart(6)}  ${label}${got === want ? '' : `  <- expected ${want}`}`);
  }
  if (bad) {
    console.error('\nCounts do not match the backup. Do not trust this restore.');
    process.exit(1);
  }
}

const overwrite = process.env.RESTORE_OVERWRITE === '1';

if (process.env.MONGODB_URI) {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'crmbuilder');

  const existing = await db.collection('users').countDocuments();
  if (existing && !overwrite) {
    console.error(`\nRefusing: that database already has ${existing} account(s).`);
    console.error('Restore into a scratch database, or set RESTORE_OVERWRITE=1 if you mean it.');
    await client.close();
    process.exit(1);
  }

  for (const name of ['users', 'orgs', 'data', 'modules', 'records', 'accessRequests', 'platform']) {
    await db.collection(name).deleteMany({});
  }
  if (users.length) await db.collection('users').insertMany(users.map((u) => ({ ...u })));
  if (orgs.length) await db.collection('orgs').insertMany(orgs.map((o) => ({ ...o })));
  if (accessRequests.length) await db.collection('accessRequests').insertMany(accessRequests.map((r) => ({ ...r })));
  // MongoStore keys this document by `id: 'platform'` and projects that field
  // back out on read, so restoring the bare settings object would write a row
  // its own getter cannot find. Nothing throws; the settings are simply absent.
  if (Object.keys(platform).length) await db.collection('platform').insertOne({ id: 'platform', ...platform });

  for (const ws of workspaces) {
    if (ws.meta) await db.collection('data').insertOne({ ...ws.meta });
    // Envelopes go back exactly as they came out, tombstones included — a
    // restore that dropped them would resurrect every deleted record on every
    // device at its next sync.
    if (ws.modules?.length) await db.collection('modules').insertMany(ws.modules.map((m) => ({ ...m })));
    if (ws.records?.length) await db.collection('records').insertMany(ws.records.map((r) => ({ ...r })));
  }

  const back = {
    accounts: await db.collection('users').countDocuments(),
    organisations: await db.collection('orgs').countDocuments(),
    workspaces: await db.collection('data').countDocuments(),
    modules: await db.collection('modules').countDocuments(),
    records: await db.collection('records').countDocuments(),
    requests: await db.collection('accessRequests').countDocuments(),
  };
  // Close before verifying: verifyCounts exits on a mismatch, and an open
  // client would keep the process alive past it.
  await client.close();
  console.log('\nRestored. Counted back:');
  verifyCounts(back);
} else {
  // The file store: one JSON document, shaped the way FileStore expects.
  const dir = process.env.DATA_DIR || './data/restored';
  await mkdir(dir, { recursive: true });
  const out = {
    users, orgs, accessRequests, platform,
    invites: [], betaCodes: [], feedback: [], data: {}, events: [],
    items: { modules: {}, records: {} },
  };
  for (const ws of workspaces) {
    if (ws.meta) out.data[ws.wsId] = ws.meta;
    out.items.modules[ws.wsId] = Object.fromEntries((ws.modules || []).map((m) => [m.id, m]));
    out.items.records[ws.wsId] = Object.fromEntries((ws.records || []).map((r) => [r.id, r]));
  }
  const target = path.join(dir, 'store.json');
  await writeFile(target, JSON.stringify(out));

  const written = JSON.parse(await readFile(target, 'utf8'));
  const inBags = (bag) => Object.values(bag || {}).reduce((n, m) => n + Object.keys(m).length, 0);
  console.log(`\nRestored into ${target}. Counted back:`);
  verifyCounts({
    accounts: (written.users || []).length,
    organisations: (written.orgs || []).length,
    // Keyed by wsId, so two workspaces sharing one would silently merge here
    // and show up as a shortfall rather than as a wrong-looking success.
    workspaces: Object.keys(written.data || {}).length,
    modules: inBags(written.items?.modules),
    records: inBags(written.items?.records),
    requests: (written.accessRequests || []).length,
  });
  console.log(`\nStart the server with DATA_DIR=${dir} to look at it.`);
}

console.log('\nNow sign in as one of the restored accounts and check the record count matches.');
