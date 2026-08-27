/*
 * inspect.mjs — read what is actually in the database, and say what disagrees.
 *
 *   MONGODB_URI="mongodb+srv://…" node scripts/inspect.mjs
 *
 * Or against the JSON file store, by leaving MONGODB_URI unset:
 *
 *   DATA_DIR=./data node scripts/inspect.mjs
 *
 * STRICTLY READ-ONLY. It opens no write path, and it prints structure rather
 * than contents: counts, keys and timestamps, never a record's fields. Email
 * addresses are redacted unless you pass --emails, because the usual reason to
 * run this is to paste the output to somebody else.
 *
 * Why it exists: the admin dashboard has two different record counts, and when
 * they disagree there is no way to tell which one is lying without looking.
 * `countItems` filters by `wsId`; `usageByOrg` groups by `orgId`. If a row
 * carries one and not the other, the two numbers diverge and both look
 * plausible. See CLAUDE.md §5 for why wsId and orgId are separate fields.
 */
const SYNC_KINDS = ['modules', 'records'];
const SHOW_EMAILS = process.argv.includes('--emails');

function redact(email) {
  if (SHOW_EMAILS) return email;
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at < 1) return '(hidden)';
  return `${s[0]}…@${s.slice(at + 1)}`;
}

const bold = (s) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s);
const dim = (s) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s);
const red = (s) => (process.stdout.isTTY ? `\x1b[31m${s}\x1b[0m` : s);
const green = (s) => (process.stdout.isTTY ? `\x1b[32m${s}\x1b[0m` : s);

function when(ts) {
  if (!ts) return '—';
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return String(ts);
  return new Date(n).toISOString().slice(0, 16).replace('T', ' ');
}

/* ------------------------------------------------------------------ load */
async function loadMongo(uri) {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const out = {
    backend: 'mongodb',
    users: await db.collection('users').find({}, { projection: { _id: 0 } }).toArray(),
    orgs: await db.collection('orgs').find({}, { projection: { _id: 0 } }).toArray(),
    data: await db.collection('data').find({}, { projection: { _id: 0 } }).toArray(),
    rows: {},
  };
  for (const kind of SYNC_KINDS) {
    // Only the keys. Never doc contents.
    out.rows[kind] = await db.collection(kind)
      .find({}, { projection: { _id: 0, id: 1, wsId: 1, orgId: 1, userId: 1, deletedAt: 1, updatedAt: 1 } })
      .toArray();
  }
  await client.close();
  return out;
}

async function loadFile(dir) {
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const raw = JSON.parse(await readFile(path.join(dir, 'store.json'), 'utf8'));
  const out = {
    backend: 'file',
    users: raw.users || [],
    orgs: raw.orgs || [],
    data: Object.values(raw.data || {}),
    rows: {},
  };
  for (const kind of SYNC_KINDS) {
    /*
     * The file store nests as store.items[kind][wsId][id], NOT store[kind].
     * Reading the wrong level returns an empty object rather than throwing,
     * so the first version of this script reported every workspace as having
     * zero rows — which reads as catastrophic data loss and is nothing of the
     * sort. A diagnostic that invents a disaster is worse than none.
     */
    const bucket = (raw.items || {})[kind] || {};
    out.rows[kind] = Object.entries(bucket).flatMap(([wsId, byId]) => Object.values(byId || {})
      .map((e) => ({ ...e, wsId: e.wsId || wsId, doc: undefined })));
  }
  return out;
}

const uri = process.env.MONGODB_URI;
const store = uri
  ? await loadMongo(uri)
  : await loadFile(process.env.DATA_DIR || './data');

/* --------------------------------------------------------------- report */
console.log(`\n${bold('CRM Builder — database inspection')}`);
console.log(dim(`backend: ${store.backend}${SHOW_EMAILS ? '' : ' · emails redacted (pass --emails to show)'}\n`));

console.log(bold('Accounts and organisations'));
console.log(`  users: ${store.users.length}   orgs: ${store.orgs.length}   workspace meta docs: ${store.data.length}`);

const usersByOrg = new Map();
for (const u of store.users) {
  const k = u.orgId || '(none)';
  if (!usersByOrg.has(k)) usersByOrg.set(k, []);
  usersByOrg.get(k).push(u);
}

/* Rows, tallied by both keys — this is the whole point of the script. */
const tally = {};
for (const kind of SYNC_KINDS) {
  const byWs = new Map();
  const byOrg = new Map();
  let noWs = 0;
  let noOrg = 0;
  for (const r of store.rows[kind]) {
    const live = !r.deletedAt;
    if (r.wsId) {
      const t = byWs.get(r.wsId) || { live: 0, dead: 0 };
      t[live ? 'live' : 'dead'] += 1;
      byWs.set(r.wsId, t);
    } else noWs += 1;
    if (r.orgId) {
      const t = byOrg.get(r.orgId) || { live: 0, dead: 0 };
      t[live ? 'live' : 'dead'] += 1;
      byOrg.set(r.orgId, t);
    } else noOrg += 1;
  }
  tally[kind] = { byWs, byOrg, noWs, noOrg, total: store.rows[kind].length };
}

console.log(`\n${bold('Rows, counted both ways')}`);
for (const kind of SYNC_KINDS) {
  const t = tally[kind];
  const live = store.rows[kind].filter((r) => !r.deletedAt).length;
  console.log(`  ${kind}: ${t.total} total · ${live} live · ${t.total - live} tombstoned`);
  if (t.noWs) console.log(red(`         ${t.noWs} row(s) have NO wsId — countItems() cannot see these`));
  if (t.noOrg) console.log(red(`         ${t.noOrg} row(s) have NO orgId — usageByOrg() cannot see these`));
}

console.log(`\n${bold('Per organisation')}`);
for (const org of store.orgs) {
  const members = usersByOrg.get(org.id) || [];
  const meta = store.data.filter((d) => d.orgId === org.id || d.wsId === org.id);
  console.log(`\n  ${bold(org.name || '(unnamed)')}  ${dim(org.id)}`);
  console.log(`    members: ${members.length}${members.length ? `  (${members.map((u) => `${redact(u.email)} ${dim(u.role)}`).join(', ')})` : ''}`);
  if (org.suspendedAt) console.log(`    ${red('suspended')} ${when(org.suspendedAt)}`);

  for (const kind of SYNC_KINDS) {
    const byOrg = tally[kind].byOrg.get(org.id) || { live: 0, dead: 0 };
    const byWs = tally[kind].byWs.get(org.id) || { live: 0, dead: 0 };
    const same = byOrg.live === byWs.live && byOrg.dead === byWs.dead;
    const line = `    ${kind}: orgId→ ${byOrg.live} live / ${byOrg.dead} dead    wsId→ ${byWs.live} live / ${byWs.dead} dead`;
    console.log(same ? line : red(`${line}   ← DISAGREE`));
  }

  for (const d of meta) {
    const actualLive = (tally.records.byWs.get(d.wsId) || { live: 0 }).live;
    const actualMods = (tally.modules.byWs.get(d.wsId) || { live: 0 }).live;
    const ok = d.recordCount === actualLive && d.moduleCount === actualMods;
    const line = `    meta(wsId=${dim(d.wsId)}): recordCount=${d.recordCount} moduleCount=${d.moduleCount}`
      + `  actual live: ${actualLive} / ${actualMods}   updated ${when(d.updatedAt)}`;
    console.log(ok ? green(line) : red(`${line}   ← STALE or MISKEYED`));
  }
  if (!meta.length) console.log(dim('    meta: none'));
}

/* Rows whose wsId belongs to no org — the shape that makes the two counts
 * disagree, and the one a legacy key leaves behind. */
const orgIds = new Set(store.orgs.map((o) => o.id));
const userIds = new Set(store.users.map((u) => u.id));
console.log(`\n${bold('Keys that belong to no organisation')}`);
let stray = false;
for (const kind of SYNC_KINDS) {
  for (const [wsId, t] of tally[kind].byWs) {
    if (orgIds.has(wsId)) continue;
    stray = true;
    const looksLikeUser = userIds.has(wsId);
    console.log(red(`  ${kind}: wsId=${wsId} → ${t.live} live / ${t.dead} dead`)
      + (looksLikeUser ? dim('   (this is a USER id — a pre-orgs key that never migrated)') : ''));
  }
}
if (!stray) console.log(green('  none — every wsId maps to an organisation'));

/* ------------------------------------------------------------ diagnosis */
console.log(`\n${bold('Diagnosis')}`);
const problems = [];
for (const kind of SYNC_KINDS) {
  if (tally[kind].noWs) problems.push(`${tally[kind].noWs} ${kind} row(s) carry no wsId, so the workspace counts miss them.`);
}

/*
 * The headline case, and the reason this script exists.
 *
 * A row keyed under a wsId that is not an organisation id is invisible to
 * countItems() — which is what feeds the meta doc, and therefore the admin
 * dashboard's "Records stored" — while still being counted by usageByOrg(),
 * which groups by orgId. That is exactly how the two numbers disagree while
 * both look plausible, and it is what a refused migrateToOrgWorkspaces()
 * leaves behind (it refuses when any org already has more than one member).
 */
for (const kind of SYNC_KINDS) {
  for (const [wsId, t] of tally[kind].byWs) {
    if (orgIds.has(wsId) || !(t.live + t.dead)) continue;
    problems.push(
      `${t.live} live ${kind} are keyed wsId=${wsId}, which is not an organisation`
      + `${userIds.has(wsId) ? ' (it is a USER id — pre-orgs data that never migrated)' : ''}.`
      + ' The app can still read them, but every server-side workspace count misses them.'
    );
  }
}
for (const org of store.orgs) {
  for (const kind of SYNC_KINDS) {
    const a = tally[kind].byOrg.get(org.id) || { live: 0 };
    const b = tally[kind].byWs.get(org.id) || { live: 0 };
    if (a.live !== b.live) {
      problems.push(
        `org "${org.name}": ${a.live} live ${kind} carry its orgId but only ${b.live} carry its wsId`
        + ' — the Organisations table and "Records stored" are reading different rows.'
      );
    }
  }
}
for (const d of store.data) {
  const actualLive = (tally.records.byWs.get(d.wsId) || { live: 0 }).live;
  if (d.recordCount !== actualLive) {
    problems.push(`meta doc for wsId=${d.wsId} says recordCount=${d.recordCount} but ${actualLive} live records carry that wsId.`);
  }
}
for (const org of store.orgs) {
  const members = (usersByOrg.get(org.id) || []).length;
  const rows = SYNC_KINDS.reduce((n, k) => n + ((tally[k].byOrg.get(org.id) || { live: 0 }).live), 0);
  if (!members && !rows) problems.push(`org "${org.name}" (${org.id}) has no members and no data — an orphan row in the Organisations table.`);
}
if (!problems.length) console.log(green('  Nothing inconsistent found.'));
else problems.forEach((p) => console.log(red(`  • ${p}`)));
console.log('');
