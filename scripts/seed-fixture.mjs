/*
 * seed-fixture.mjs — stand up a workspace that exercises the current
 * architecture: a team with every role, tombstones of varied age, a second
 * tenant, an empty placeholder org, and meta counters that match.
 *
 *   node scripts/seed-fixture.mjs --yes                 # into ./data
 *   DATA_DIR=./data/demo node scripts/seed-fixture.mjs --yes
 *   node scripts/seed-fixture.mjs --clean --yes         # remove it again
 *   node scripts/seed-fixture.mjs --dry                 # print, write nothing
 *
 * FILE STORE ONLY, AND THAT IS THE DESIGN. This writes <DATA_DIR>/store.json
 * and has no MongoDB code path at all — not behind a flag, not behind an
 * environment variable. A script that creates users and organisations is one
 * mistyped argument away from writing into a real tenant's database, and the
 * cheapest way to make that impossible is to not implement it. inspect.mjs may
 * read Atlas because reading cannot destroy anything; this may not write to it.
 *
 * NOT the shipped demo data. `js/demo-data.js` is what a user loads from
 * inside the app, on their own device, in their own scope. This is a developer
 * and operator tool: it writes the SERVER's collections — users, orgs, and
 * tombstones with `doc: null` — none of which the client can express (§11: the
 * demo rides inside `doc` and the server needs no change for it).
 *
 * Record CONTENT is borrowed from js/demo-data.js rather than invented twice,
 * so a workspace seeded here looks like one a real evaluation produces, and
 * improvements to the dataset arrive here for free.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.DATA_DIR || './data';
const FILE = path.resolve(DATA_DIR, 'store.json');

const arg = (name) => process.argv.includes(`--${name}`);
const DRY = arg('dry');
const CLEAN = arg('clean');
const FORCE = arg('force');
const YES = arg('yes');

// Every fixture account lives here. `.invalid` is reserved by RFC 2606 and can
// never resolve, so nothing seeded can reach a real inbox — and one substring
// identifies everything this script owns, which is what makes --clean exact.
const DOMAIN = '@fixture.invalid';
const isFixture = (u) => String(u.email || '').endsWith(DOMAIN);

const DAY = 86400000;
const uid = () => crypto.randomUUID();
const now = Date.now();
let stamp = now - 1000; // server clock, ticks forward per row
const nextStamp = () => (stamp += 1);

/* ------------------------------------------------------- the cast, by role
 * One of each rung on the ladder (§14), because the point of the fixture is
 * that role boundaries can be driven without hand-building four accounts.
 */
const TEAM = [
  { key: 'maya', name: 'Maya Ferreira', role: 'owner' },
  { key: 'daniel', name: 'Daniel Adeyemi', role: 'member' },
  { key: 'priya', name: 'Priya Nair', role: 'contributor' },
  { key: 'sam', name: 'Sam Whitfield', role: 'viewer' },
];

/* ------------------------------------------------ content from the demo set */
function loadDemo() {
  const read = (f) => readFileSync(path.join(ROOT, 'js', f), 'utf8');
  // eslint-disable-next-line no-new-func
  return new Function(`${read('templates.js')}\n${read('demo-data.js')}\nreturn { TEMPLATES, DEMO_DATA };`)();
}

/*
 * Build modules and records the way js/app.js's loadDemoData does — templates
 * first, then the demo's own modules, resolving `__ref` in one forward pass.
 *
 * Deliberately a re-implementation rather than a shared helper: that loader
 * runs in a browser against IndexedDB and this runs in Node against a JSON
 * file, and the two have no runtime in common. What keeps them honest is
 * tests/fixture.test.mjs booting a real server against the output.
 */
function buildWorkspace({ TEMPLATES, DEMO_DATA }) {
  const defs = [...TEMPLATES, ...(DEMO_DATA.modules || [])];
  const modules = [];
  const records = [];
  const handles = new Map();

  const resolveDates = (v) => {
    if (Array.isArray(v)) return v.map(resolveDates);
    if (v && typeof v === 'object') {
      if (typeof v.__rel === 'number') {
        const d = new Date(now);
        d.setDate(d.getDate() + v.__rel);
        return d.toISOString().slice(0, 10);
      }
      if (typeof v.__ref === 'string') return v;
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveDates(x)]));
    }
    return v;
  };

  for (const def of defs) {
    const rows = DEMO_DATA.records[def.key];
    if (!rows || !rows.length) continue;
    const mod = {
      id: uid(),
      name: def.name,
      icon: def.icon,
      color: def.color,
      defaultView: def.defaultView || 'table',
      fields: def.fields.map((f) => ({ ...f, options: f.options ? [...f.options] : undefined })),
      createdAt: now,
      updatedAt: now,
    };
    for (const f of mod.fields) {
      if (f.type !== 'relation' || !f.relatedModuleName) continue;
      const target = modules.find((m) => m.name.toLowerCase() === f.relatedModuleName.toLowerCase());
      if (target) f.relatedModule = target.id;
    }
    modules.push(mod);

    const nameKey = (mod.fields[0] || {}).key;
    rows.forEach((raw, i) => {
      const data = {};
      for (const [k, v] of Object.entries(resolveDates(raw))) {
        data[k] = v && typeof v === 'object' && typeof v.__ref === 'string' ? (handles.get(v.__ref) || '') : v;
      }
      const id = uid();
      if (nameKey && data[nameKey]) handles.set(`${def.key}:${data[nameKey]}`, id);
      records.push({ id, moduleId: mod.id, data, createdAt: now - i * 60000, updatedAt: now - i * 60000 });
    });
  }
  return { modules, records };
}

/* ----------------------------------------------------------- the envelopes */
// Exactly docShell()'s shape in server.js. A tombstone drops the body and
// carries deletedOn, which is what the retention TTL keys on (§26).
function envelope({ kind, wsId, orgId, doc, id, createdBy, updatedBy, updatedAt, deletedAt = null }) {
  return {
    wsId,
    orgId,
    id: id || doc.id,
    createdBy,
    updatedBy: updatedBy || createdBy,
    updatedAt,
    serverAt: nextStamp(),
    deletedAt,
    deletedOn: deletedAt ? new Date(deletedAt).toISOString() : null,
    doc: deletedAt ? null : doc,
  };
}

/*
 * Tombstone ages are the point of seeding any.
 *
 * All-recent tombstones cannot show what the retention window does, and the
 * Organisations panel's "first expiry" would be one date for the whole set.
 * Spread across the 180 days: some new, some middle-aged, and some within days
 * of expiring — which is the state an operator most needs to be able to read.
 */
const TOMBSTONE_AGES_DAYS = [2, 9, 26, 48, 71, 95, 118, 140, 163, 176];

function seed() {
  const { TEMPLATES, DEMO_DATA } = loadDemo();
  const users = [];
  const orgs = [];
  const items = { modules: {}, records: {} };
  const data = {};
  const events = [];

  const addOrg = (name, createdBy) => {
    const org = { id: uid(), name, createdAt: now - 30 * DAY, createdBy };
    orgs.push(org);
    return org;
  };
  const addUser = (key, name, role, orgId, extra = {}) => {
    const u = {
      id: uid(),
      email: `${key}${DOMAIN}`,
      name,
      picture: '',
      provider: 'fixture',
      role,
      orgId,
      disabled: false,
      createdAt: now - 30 * DAY,
      lastActiveAt: now - Math.floor(Math.random() * 3) * DAY,
      ...extra,
    };
    users.push(u);
    events.push({ type: 'signup', userId: u.id, orgId, day: new Date(u.createdAt).toISOString().slice(0, 10), at: u.createdAt });
    return u;
  };

  /* --- 1. the platform admin, in an org of their own ---------------------
   * A platformAdmin has an org like anyone else (§5), and putting them in the
   * team would make every "can an owner reach a platform admin" check
   * meaningless — that answer must be 404 across an org boundary (§21).
   */
  const opsOrg = addOrg('Fixture Operations', 'seed');
  const ops = addUser('ops', 'Ops (platform admin)', 'platformAdmin', opsOrg.id);
  opsOrg.createdBy = ops.id;

  /* --- 2. Lumen Studio: four people, one workspace, every role ----------- */
  const lumen = addOrg('Lumen Studio', 'seed');
  const team = TEAM.map((m) => addUser(m.key, m.name, m.role, lumen.id));
  lumen.createdBy = team[0].id;
  const wsId = lumen.id; // wsId IS the org id today — kept as a separate name (§5)

  const { modules, records } = buildWorkspace({ TEMPLATES, DEMO_DATA });
  items.modules[wsId] = {};
  items.records[wsId] = {};

  // createdBy spread across the team, so the workspace reads as shared work
  // rather than one person's. `createdBy` is set once and carried forward, so
  // this is what an admin export and every record's authorship will show.
  const author = (i) => team[i % team.length].id;
  modules.forEach((doc, i) => {
    items.modules[wsId][doc.id] = envelope({
      kind: 'modules', wsId, orgId: lumen.id, doc, createdBy: author(i), updatedAt: doc.updatedAt,
    });
  });
  records.forEach((doc, i) => {
    items.records[wsId][doc.id] = envelope({
      kind: 'records', wsId, orgId: lumen.id, doc, createdBy: author(i), updatedAt: doc.updatedAt,
    });
  });

  /* --- 3. tombstones, aged across the retention window ------------------- */
  let tombstones = 0;
  TOMBSTONE_AGES_DAYS.forEach((days, i) => {
    const deletedAt = now - days * DAY;
    // Three record tombstones per age band, and one module tombstone at two of
    // them — a module delete cascades to its records (§14), so a workspace
    // that has ever removed a module has both kinds.
    for (let n = 0; n < 3; n += 1) {
      const id = uid();
      items.records[wsId][id] = envelope({
        kind: 'records', wsId, orgId: lumen.id, id, doc: null, createdBy: author(i + n), updatedAt: deletedAt, deletedAt,
      });
      tombstones += 1;
    }
    if (i === 2 || i === 7) {
      const id = uid();
      items.modules[wsId][id] = envelope({
        kind: 'modules', wsId, orgId: lumen.id, id, doc: null, createdBy: author(i), updatedAt: deletedAt, deletedAt,
      });
      tombstones += 1;
    }
  });

  // Meta doc, exactly as refreshCounts() writes it — and the counts are the
  // LIVE rows, which is the whole reason a tombstone must not be counted.
  data[wsId] = {
    wsId,
    orgId: lumen.id,
    settings: { businessName: DEMO_DATA.businessName, currency: DEMO_DATA.currency },
    settingsUpdatedAt: now - 30 * DAY,
    settingsServerAt: nextStamp(),
    moduleCount: modules.length,
    recordCount: records.length,
    perRecord: true,
    orgOwned: true,
    updatedAt: now,
  };

  /* --- 4. a second tenant, so no org holds 100% of the database ---------- */
  const northwind = addOrg('Northwind Consulting', 'seed');
  const nadia = addUser('nadia', 'Nadia Rahman', 'owner', northwind.id);
  northwind.createdBy = nadia.id;
  const nwWs = northwind.id;
  items.modules[nwWs] = {};
  items.records[nwWs] = {};
  const nwMod = {
    id: uid(), name: 'Clients', icon: 'users', color: '#1570ef', defaultView: 'table',
    fields: [
      { key: 'name', label: 'Client', type: 'text', required: true, showInList: true },
      { key: 'email', label: 'Email', type: 'email', showInList: true },
      { key: 'retainer', label: 'Retainer', type: 'currency', showInList: true },
    ],
    createdAt: now, updatedAt: now,
  };
  items.modules[nwWs][nwMod.id] = envelope({ kind: 'modules', wsId: nwWs, orgId: northwind.id, doc: nwMod, createdBy: nadia.id, updatedAt: now });
  const nwRecords = ['Halden Group', 'Pike & Rowe', 'Cormorant Media', 'Ashfield Ltd', 'Verity Health', 'Two Rivers Co-op'];
  nwRecords.forEach((name, i) => {
    const doc = {
      id: uid(), moduleId: nwMod.id,
      data: { name, email: `hello@${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.example`, retainer: String((i + 2) * 750) },
      createdAt: now - i * 60000, updatedAt: now - i * 60000,
    };
    items.records[nwWs][doc.id] = envelope({ kind: 'records', wsId: nwWs, orgId: northwind.id, doc, createdBy: nadia.id, updatedAt: doc.updatedAt });
  });
  data[nwWs] = {
    wsId: nwWs, orgId: northwind.id,
    settings: { businessName: 'Northwind Consulting', currency: 'GBP' },
    settingsUpdatedAt: now - 20 * DAY, settingsServerAt: nextStamp(),
    moduleCount: 1, recordCount: nwRecords.length, perRecord: true, orgOwned: true, updatedAt: now,
  };

  /*
   * --- 5. an org with nobody in it and nothing in it --------------------
   * The case tidyVacatedOrg deliberately leaves alone is the OPPOSITE one (an
   * org that still holds work). This is the placeholder an operator sees as
   * 0 people / 0 records, and it is here so that row can be recognised on the
   * panel rather than mistaken for a bug.
   */
  addOrg('Meridian Partners (vacated)', 'seed');

  return {
    users, orgs, items, data, events,
    invites: [], betaCodes: [], feedback: [], accessRequests: [], platform: {},
    _summary: {
      orgs: orgs.length,
      users: users.length,
      liveModules: modules.length + 1,
      liveRecords: records.length + nwRecords.length,
      tombstones,
      oldestTombstoneDays: Math.max(...TOMBSTONE_AGES_DAYS),
    },
  };
}

/* ---------------------------------------------------------------- the file */
function readStore() {
  try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return null; }
}

// Temp file plus rename, the same reason FileStore.save() does it (§30): a
// crash mid-write must not leave a truncated store behind.
function writeStore(store) {
  mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 0));
  renameSync(tmp, FILE);
}

const blank = () => ({
  users: [], orgs: [], invites: [], betaCodes: [], feedback: [], accessRequests: [],
  platform: {}, data: {}, events: [], items: { modules: {}, records: {} },
});

function main() {
  if (process.env.MONGODB_URI) {
    // Not fatal — but a server with MONGODB_URI set never reads this file, so
    // seeding it and then wondering where the fixture went is the obvious trap.
    console.warn('! MONGODB_URI is set in this environment.');
    console.warn('  This script only ever writes the FILE store. A server started with that');
    console.warn('  variable will read MongoDB and will not see anything seeded here.\n');
  }

  const existing = readStore();
  const foreign = (existing?.users || []).filter((u) => !isFixture(u));

  if (CLEAN) {
    if (!existing) { console.log('Nothing to clean.'); return; }
    const candidates = new Set(existing.users.filter(isFixture).map((u) => u.orgId));
    const before = existing.users.length;
    existing.users = existing.users.filter((u) => !isFixture(u));

    /*
     * A SURVIVING MEMBER VETOES REMOVAL. The name is only a hint.
     *
     * The first version matched orgs by name against FIXTURE_ORG_NAMES, and
     * "Lumen Studio" is an entirely plausible thing for a real customer to
     * call their workspace. Driven with a real owner sitting in an org of that
     * name, --clean deleted the org and its workspace out from under them and
     * reported success. Their account survived, which made it worse: the
     * account was there, the decade of data was not.
     *
     * So the rule is anybody left standing. An org with a real member is never
     * touched, whatever it is called, and the placeholder org (which has no
     * members by design) is matched by name because nothing else identifies it.
     */
    const stillOccupied = new Set(existing.users.map((u) => u.orgId));
    const mine = new Set(existing.orgs
      .filter((o) => !stillOccupied.has(o.id))
      .filter((o) => candidates.has(o.id) || FIXTURE_ORG_NAMES.includes(o.name))
      .map((o) => o.id));
    existing.orgs = existing.orgs.filter((o) => !mine.has(o.id));
    for (const id of mine) {
      delete existing.data[id];
      for (const kind of ['modules', 'records']) delete (existing.items[kind] || {})[id];
    }
    existing.events = (existing.events || []).filter((e) => !mine.has(e.orgId));
    if (DRY) { console.log(`would remove ${before - existing.users.length} users and ${mine.size} orgs`); return; }
    if (!YES) { console.log('Refusing without --yes. This removes fixture accounts and their workspaces.'); process.exit(1); }
    writeStore(existing);
    console.log(`Removed ${before - existing.users.length} fixture users and ${mine.size} organisations from ${FILE}`);
    return;
  }

  const seeded = seed();
  const s = seeded._summary;
  delete seeded._summary;

  if (DRY) {
    console.log(`would seed into ${FILE}`);
    console.log(`  ${s.orgs} orgs · ${s.users} users · ${s.liveModules} modules · ${s.liveRecords} records`);
    console.log(`  ${s.tombstones} tombstones, oldest ${s.oldestTombstoneDays} days`);
    if (foreign.length) console.log(`  ! ${foreign.length} existing non-fixture accounts would be replaced`);
    return;
  }

  if (foreign.length && !FORCE) {
    console.error(`Refusing: ${FILE} holds ${foreign.length} account(s) this script did not create.`);
    console.error('That is somebody\'s real data. Point DATA_DIR somewhere else, or pass --force');
    console.error('if you are certain this store is disposable.');
    process.exit(1);
  }
  if (!YES) {
    console.error(`Refusing without --yes. This REPLACES ${FILE}.`);
    process.exit(1);
  }

  writeStore({ ...blank(), ...seeded });
  console.log(`Seeded ${FILE}`);
  console.log(`  ${s.orgs} organisations, ${s.users} accounts (${TEAM.map((t) => t.role).join(', ')}, platformAdmin)`);
  console.log(`  ${s.liveModules} modules · ${s.liveRecords} live records · ${s.tombstones} tombstones`);
  console.log(`  tombstones aged ${Math.min(...TOMBSTONE_AGES_DAYS)}–${s.oldestTombstoneDays} days, so retention is visible`);
  console.log(`\n  ALLOW_DEV_LOGIN=1 DATA_DIR=${DATA_DIR} node server.js`);
  console.log(`  then sign in as any of: ${['ops', ...TEAM.map((t) => t.key)].map((k) => k + DOMAIN).join(', ')}`);
}

const FIXTURE_ORG_NAMES = ['Fixture Operations', 'Lumen Studio', 'Northwind Consulting', 'Meridian Partners (vacated)'];

main();
