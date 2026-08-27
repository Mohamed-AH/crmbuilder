/*
 * inspect.mjs — read what is actually in the database, and say what disagrees.
 *
 *   node scripts/inspect.mjs                 # reads MONGODB_URI from .env
 *   MONGODB_URI="mongodb+srv://…" node scripts/inspect.mjs
 *   ENV_FILE=/path/to/other.env node scripts/inspect.mjs
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
 *
 * It also reports STORAGE COMPOSITION — live bytes against tombstone bytes,
 * per organisation. The panel's size column cannot tell a heavy tenant from a
 * scarred one, and the storage alerts fire on the number that conflates them.
 * A workspace can be mostly gravestones: on the deployment this was written
 * for, 54% of one org's bytes were tombstones from four demo-data cycles.
 */
const SYNC_KINDS = ['modules', 'records'];
const SHOW_EMAILS = process.argv.includes('--emails');
// Matches server.js. A tombstone's TTL keys on `deletedOn`, so the oldest
// tombstone plus this window is when storage first starts coming back.
const TOMBSTONE_DAYS = Number(process.env.TOMBSTONE_RETENTION_DAYS || 180);

/*
 * Load .env if there is one, so `node scripts/inspect.mjs` just works.
 *
 * Hand-rolled rather than `dotenv`: four production dependencies is an asset
 * on a shared free tier (CLAUDE.md §30), and a diagnostic script is the last
 * place to spend a fifth. Real environment variables win over the file, which
 * is the precedence people expect — exporting a URI for one run must override
 * whatever .env says.
 *
 * The value is a credential and is never printed. Only the host is, and only
 * to confirm which database was read.
 */
async function loadDotEnv() {
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (const file of [process.env.ENV_FILE, path.join(root, '.env'), path.join(process.cwd(), '.env')]) {
    if (!file) continue;
    let text;
    try { text = await readFile(file, 'utf8'); } catch { continue; }
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let value = m[2].trim();
      // Strip one layer of matching quotes; leave the contents alone.
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
    return file;
  }
  return null;
}

const envFile = await loadDotEnv();

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

const day = (ts) => (ts ? new Date(Number(ts)).toISOString().slice(0, 10) : '—');

function fmtBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/*
 * One line of storage composition, live against dead.
 *
 * The reason this is worth printing: a tombstone keeps its ids and clocks and
 * throws the body away, so it is small — but there is one per deleted row and
 * they outlive the data by the retention window. A workspace can therefore be
 * mostly gravestones while its record count looks modest, and the storage
 * alerts fire on a number that cannot tell the two apart. See CLAUDE.md §26.
 */
function storageLine(b) {
  if (!b || !b.measured) return null;
  const total = b.live + b.dead;
  if (!total) return null;
  const share = Math.round((b.dead / total) * 100);
  const parts = [`${fmtBytes(total)} total`, `${fmtBytes(b.live)} live`, `${fmtBytes(b.dead)} tombstones`];
  let line = `stored: ${parts.join(' · ')}`;
  if (b.dead) line += ` (${share}% reclaimable)`;
  return { line, share, oldest: b.oldestDead };
}

/* ------------------------------------------------------------------ load */
async function loadMongo(uri) {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect();
  } catch (err) {
    /*
     * A clear sentence beats a DNS stack trace. The message is printed but the
     * URI never is — driver errors can carry the connection string, so only
     * err.message is shown and it is scrubbed of anything before an @.
     */
    const safe = String(err.message || err).replace(/mongodb(\+srv)?:\/\/[^\s]*/g, 'mongodb://<uri>');
    console.error(`\nCould not connect to MongoDB: ${safe}`);
    console.error('Check the URI, and that this machine\'s IP is allowed in Atlas → Network Access.\n');
    process.exit(1);
  }
  const db = client.db();
  const out = {
    backend: 'mongodb',
    users: await db.collection('users').find({}, { projection: { _id: 0 } }).toArray(),
    orgs: await db.collection('orgs').find({}, { projection: { _id: 0 } }).toArray(),
    data: await db.collection('data').find({}, { projection: { _id: 0 } }).toArray(),
    rows: {},
    bytes: {},
    // BSON on the wire here; the file store measures JSON. Stated rather than
    // blurred, because the server's two backends differ the same way.
    byteUnit: 'BSON',
  };
  for (const kind of SYNC_KINDS) {
    // Only the keys. Never doc contents.
    out.rows[kind] = await db.collection(kind)
      .find({}, { projection: { _id: 0, id: 1, wsId: 1, orgId: 1, userId: 1, deletedAt: 1, updatedAt: 1 } })
      .toArray();
    /*
     * Bytes measured the same way the Organisations table measures them —
     * $bsonSize over the same grouping key — so the two are comparable rather
     * than merely similar. Sizes only: the aggregation returns no contents.
     *
     * Split live from dead here rather than deriving it, because a tombstone
     * and a live row are nothing like the same size and multiplying a count by
     * an average is the estimate CLAUDE.md §17 exists to warn about.
     *
     * Degrades rather than dies. $bsonSize needs MongoDB 4.4, and a missing
     * optional metric must not cost you the rest of a diagnostic run.
     */
    try {
      out.bytes[kind] = await db.collection(kind).aggregate([
        {
          $group: {
            _id: {
              orgId: '$orgId',
              dead: { $not: [{ $in: [{ $type: '$deletedAt' }, ['missing', 'null']] }] },
            },
            bytes: { $sum: { $bsonSize: '$$ROOT' } },
            n: { $sum: 1 },
            oldest: { $min: '$deletedAt' },
          },
        },
      ]).toArray();
    } catch (err) {
      out.bytesError = String(err.message || err);
    }
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
    bytes: {},
    byteUnit: 'JSON',
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
    const sized = new Map();
    out.rows[kind] = Object.entries(bucket).flatMap(([wsId, byId]) => Object.values(byId || {})
      .map((e) => {
        /*
         * Measure BEFORE dropping `doc`. The strip below is what keeps this
         * script from ever holding record contents, but it also removes almost
         * all of a live row's weight — measuring afterwards would report every
         * record as tombstone-sized and make the live/dead split meaningless.
         */
        const key = `${e.orgId || '(none)'} ${e.deletedAt ? 'dead' : 'live'}`;
        const t = sized.get(key) || { orgId: e.orgId || null, dead: !!e.deletedAt, bytes: 0, n: 0, oldest: null };
        t.bytes += Buffer.byteLength(JSON.stringify(e), 'utf8');
        t.n += 1;
        if (e.deletedAt) t.oldest = Math.min(t.oldest || Infinity, Number(e.deletedAt));
        sized.set(key, t);
        return { ...e, wsId: e.wsId || wsId, doc: undefined };
      }));
    out.bytes[kind] = [...sized.values()].map((t) => ({ _id: { orgId: t.orgId, dead: t.dead }, bytes: t.bytes, n: t.n, oldest: t.oldest }));
  }
  return out;
}

const uri = process.env.MONGODB_URI;
const dataDir = process.env.DATA_DIR || './data';
if (!uri) {
  console.log(`\n${dim(envFile ? `read ${envFile}` : 'no .env found')}`);
  console.log(`${red('No MONGODB_URI — falling back to the file store at')} ${dataDir}`);
  console.log(dim('If you meant to inspect the live database, put MONGODB_URI in .env or export it.\n'));
}
const store = uri
  ? await loadMongo(uri)
  : await loadFile(dataDir);

/* --------------------------------------------------------------- report */
console.log(`\n${bold('CRM Builder — database inspection')}`);
const source = uri
  ? `mongodb → ${String(uri).replace(/^.*@/, '').replace(/[/?].*$/, '')}${envFile ? ` ${dim('(from .env)')}` : ''}`
  : `file store → ${dataDir}`;
console.log(dim(`source: ${source}${SHOW_EMAILS ? '' : ' · emails redacted (pass --emails to show)'}\n`));

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

/*
 * Storage composition, folded per organisation and in total.
 *
 * `bytes` arrives grouped by { orgId, dead } from whichever backend loaded it,
 * so both shapes reduce identically here.
 */
const bytesByOrg = new Map();
const bytesAll = { live: 0, dead: 0, oldestDead: null, measured: !store.bytesError };
for (const kind of SYNC_KINDS) {
  for (const g of store.bytes[kind] || []) {
    const key = g._id.orgId || '(none)';
    const t = bytesByOrg.get(key) || { live: 0, dead: 0, oldestDead: null, measured: true };
    const side = g._id.dead ? 'dead' : 'live';
    t[side] += g.bytes;
    bytesAll[side] += g.bytes;
    if (g._id.dead && g.oldest) {
      const o = Number(g.oldest);
      if (Number.isFinite(o)) {
        t.oldestDead = Math.min(t.oldestDead || Infinity, o);
        bytesAll.oldestDead = Math.min(bytesAll.oldestDead || Infinity, o);
      }
    }
    bytesByOrg.set(key, t);
  }
}

console.log(`\n${bold('Rows, counted both ways')}`);
for (const kind of SYNC_KINDS) {
  const t = tally[kind];
  const live = store.rows[kind].filter((r) => !r.deletedAt).length;
  console.log(`  ${kind}: ${t.total} total · ${live} live · ${t.total - live} tombstoned`);
  if (t.noWs) console.log(red(`         ${t.noWs} row(s) have NO wsId — countItems() cannot see these`));
  if (t.noOrg) console.log(red(`         ${t.noOrg} row(s) have NO orgId — usageByOrg() cannot see these`));
}
if (store.bytesError) {
  console.log(dim(`  storage not measured: ${store.bytesError}`));
} else {
  const s = storageLine(bytesAll);
  if (s) {
    console.log(`  ${s.line} ${dim(`[${store.byteUnit}, documents only — no index bytes]`)}`);
    if (s.oldest) {
      const first = new Date(s.oldest + TOMBSTONE_DAYS * 86400000);
      console.log(dim(`         oldest tombstone ${day(s.oldest)} — nothing expires before ${day(first.getTime())}`
        + ` (${TOMBSTONE_DAYS}-day window)`));
    }
  }
}

console.log(`\n${bold('Per organisation')}`);
for (const org of store.orgs) {
  const members = usersByOrg.get(org.id) || [];
  const meta = store.data.filter((d) => d.orgId === org.id || d.wsId === org.id);
  console.log(`\n  ${bold(org.name || '(unnamed)')}  ${dim(org.id)}`);
  // created is what dates an empty org against the fix that should have tidied
  // it — an orphan predating tidyVacatedOrg (§25) is history, not a live bug.
  console.log(`    created ${when(org.createdAt)}   members: ${members.length}`
    + `${members.length ? `  (${members.map((u) => `${redact(u.email)} ${dim(u.role)}`).join(', ')})` : ''}`);
  if (org.suspendedAt) console.log(`    ${red('suspended')} ${when(org.suspendedAt)}`);

  for (const kind of SYNC_KINDS) {
    const byOrg = tally[kind].byOrg.get(org.id) || { live: 0, dead: 0 };
    const byWs = tally[kind].byWs.get(org.id) || { live: 0, dead: 0 };
    const same = byOrg.live === byWs.live && byOrg.dead === byWs.dead;
    const line = `    ${kind}: orgId→ ${byOrg.live} live / ${byOrg.dead} dead    wsId→ ${byWs.live} live / ${byWs.dead} dead`;
    console.log(same ? line : red(`${line}   ← DISAGREE`));
  }

  const s = storageLine(bytesByOrg.get(org.id));
  if (s) {
    console.log(`    ${s.share >= 50 ? red(s.line) : s.line}`);
    if (s.oldest) {
      const first = new Date(s.oldest + TOMBSTONE_DAYS * 86400000);
      console.log(dim(`            oldest tombstone ${day(s.oldest)} — first expiry ${day(first.getTime())}`));
    }
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
  if (!members && !rows) {
    problems.push(`org "${org.name}" (${org.id}) has no members and no data — an orphan row in the Organisations table.`
      + ` Created ${when(org.createdAt)}.`);
  }
}

/*
 * Mostly-gravestones is a finding, not an error.
 *
 * Reported because the storage meter and its alerts cannot distinguish a heavy
 * tenant from a scarred one, and the two want opposite responses. Deliberately
 * not called a problem: nothing is wrong, the rows are doing the job tombstones
 * exist to do (CLAUDE.md §26). It is worth knowing before reading a bytes
 * figure, which is why it prints even when everything else is clean.
 */
const notes = [];
for (const org of store.orgs) {
  const b = bytesByOrg.get(org.id);
  if (!b || !b.dead) continue;
  const share = Math.round((b.dead / (b.live + b.dead)) * 100);
  if (share < 50) continue;
  notes.push(`org "${org.name}": ${share}% of its ${fmtBytes(b.live + b.dead)} is tombstones`
    + `${b.oldestDead ? `, none expiring before ${day(b.oldestDead + TOMBSTONE_DAYS * 86400000)}` : ''}`
    + '. Deleted rows are not recoverable; this is retention, not waste.');
}
if (!problems.length) console.log(green('  Nothing inconsistent found.'));
else problems.forEach((p) => console.log(red(`  • ${p}`)));
notes.forEach((n) => console.log(dim(`  · ${n}`)));
console.log('');
