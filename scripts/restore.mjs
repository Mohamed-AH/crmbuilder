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
    users: await db.collection('users').countDocuments(),
    records: await db.collection('records').countDocuments(),
  };
  await client.close();
  console.log(`\nRestored. Counted back: ${back.users} account(s), ${back.records} record row(s).`);
  if (back.users !== users.length || back.records !== records) {
    console.error('Counts do not match the backup. Do not trust this restore.');
    process.exit(1);
  }
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
  console.log(`\nRestored into ${target}. Start the server with DATA_DIR=${dir} to look at it.`);
}

console.log('\nNow sign in as one of the restored accounts and check the record count matches.');
