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
const records = workspaces.reduce((n, w) => n + (w.records || []).length, 0);
const modules = workspaces.reduce((n, w) => n + (w.modules || []).length, 0);

console.log(`Backup taken ${backup.exportedAt}`);
console.log(`  ${orgs.length} organisation(s), ${users.length} account(s)`);
console.log(`  ${workspaces.length} workspace(s), ${modules} module(s), ${records} record(s)`);

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

  for (const name of ['users', 'orgs', 'data', 'modules', 'records']) {
    await db.collection(name).deleteMany({});
  }
  if (users.length) await db.collection('users').insertMany(users.map((u) => ({ ...u })));
  if (orgs.length) await db.collection('orgs').insertMany(orgs.map((o) => ({ ...o })));

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
  const out = { users, orgs, invites: [], betaCodes: [], data: {}, events: [], items: { modules: {}, records: {} } };
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
  });
  console.log(`\nStart the server with DATA_DIR=${dir} to look at it.`);
}

console.log('\nNow sign in as one of the restored accounts and check the record count matches.');
