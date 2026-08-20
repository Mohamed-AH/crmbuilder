/*
 * server.js — CRM Builder backend.
 *
 * Serves the static PWA and provides:
 *   - Google OAuth sign-in (JWT httpOnly cookie sessions)
 *   - Per-record data sync (modules/records/settings) in MongoDB
 *   - Admin APIs: account management + business analytics
 *
 * Storage: MongoDB when MONGODB_URI is set (Atlas free tier works);
 * otherwise a JSON file store (./data/store.json) so local development
 * needs zero setup. The client works fully offline either way.
 *
 * Sync model: every module and record is stored as its own row carrying an
 * `updatedAt` (the client's edit clock, which decides last-write-wins) and a
 * `serverAt` (this server's monotonic clock, which the delta cursor walks).
 * Deletes are tombstones, never removals — a hard delete is invisible to a
 * device that was offline when it happened, so the row would come straight
 * back on that device's next push. See /api/sync.
 */
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 8321;
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const IS_PROD = process.env.NODE_ENV === 'production';
// Dev login (email-only, no password) for local development / demos.
// Never enabled in production unless explicitly requested.
const DEV_LOGIN = process.env.ALLOW_DEV_LOGIN === '1' || (!IS_PROD && !GOOGLE_CLIENT_ID);

const COOKIE = 'crmb_session';
const DAY_MS = 86400000;

function dayKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

function uid() {
  return crypto.randomUUID();
}

/*
 * A monotonic server clock for sync cursors.
 *
 * The delta protocol asks "everything changed since cursor N". If two rows
 * written in sequence could share a millisecond — they routinely do — a cursor
 * landing between them would skip the second one forever. Ticking forward on a
 * collision makes every stamp distinct and strictly increasing within a
 * process, and Date.now() reclaims the lead after a restart.
 *
 * Deliberately separate from `updatedAt`: that one is the client's clock and
 * decides who wins a conflict, and a device with a skewed clock must not be
 * able to push cursors past changes other devices have not seen yet.
 */
let lastStamp = 0;
function serverStamp() {
  const now = Date.now();
  lastStamp = now > lastStamp ? now : lastStamp + 1;
  return lastStamp;
}

// The two synced item kinds. Both share one envelope shape:
//   { userId, orgId, id, updatedAt, serverAt, deletedAt, deletedOn, doc }
const SYNC_KINDS = ['modules', 'records'];
const TOMBSTONE_DAYS = Number(process.env.TOMBSTONE_RETENTION_DAYS || 180);

// --------------------------------------------------------------- storage
// Both stores implement the same interface so the rest of the app
// doesn't care which one is active.

class FileStore {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      this.s = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      this.s = { users: [], orgs: [], data: {}, events: [], items: { modules: {}, records: {} } };
    }
    this.s.items = this.s.items || { modules: {}, records: {} };
  }
  save() {
    fs.writeFileSync(this.file, JSON.stringify(this.s));
  }
  async init() { this.pruneTombstones(); }
  kind() { return 'file'; }
  async countUsers() { return this.s.users.length; }
  async getUserByEmail(email) { return this.s.users.find((u) => u.email === email) || null; }
  async getUserById(id) { return this.s.users.find((u) => u.id === id) || null; }
  async createUser(u) { this.s.users.push(u); this.save(); return u; }
  async updateUser(id, patch) {
    const u = await this.getUserById(id);
    if (u) { Object.assign(u, patch); this.save(); }
    return u;
  }
  async deleteUser(id) {
    this.s.users = this.s.users.filter((u) => u.id !== id);
    delete this.s.data[id];
    for (const kind of SYNC_KINDS) delete (this.s.items[kind] || {})[id];
    this.save();
  }
  // An orgId argument of null means "across every org" and is only ever
  // passed by a platform admin. Org-scoped callers always pass a real id.
  async listUsers(orgId = null) {
    return this.s.users.filter((u) => !orgId || u.orgId === orgId);
  }
  async getData(userId) { return this.s.data[userId] || null; }
  async putData(userId, doc) { this.s.data[userId] = { ...(this.s.data[userId] || {}), ...doc }; this.save(); }
  async stripSnapshot(userId) {
    const doc = this.s.data[userId];
    if (!doc) return;
    delete doc.modules;
    delete doc.records;
    this.save();
  }

  // --- per-record items
  bucket(kind, userId) {
    this.s.items[kind] = this.s.items[kind] || {};
    this.s.items[kind][userId] = this.s.items[kind][userId] || {};
    return this.s.items[kind][userId];
  }
  async getItemsByIds(kind, userId, ids) {
    const b = this.bucket(kind, userId);
    return ids.map((id) => b[id]).filter(Boolean);
  }
  async listItems(kind, userId, { since = 0, includeDeleted = true } = {}) {
    return Object.values(this.bucket(kind, userId))
      .filter((e) => e.serverAt > since && (includeDeleted || !e.deletedAt))
      .sort((a, b) => a.serverAt - b.serverAt);
  }
  async putItems(kind, envelopes) {
    for (const e of envelopes) this.bucket(kind, e.userId)[e.id] = e;
    this.save();
  }
  async countItems(kind, userId) {
    return Object.values(this.bucket(kind, userId)).filter((e) => !e.deletedAt).length;
  }
  pruneTombstones() {
    const cutoff = Date.now() - TOMBSTONE_DAYS * DAY_MS;
    let removed = 0;
    for (const kind of SYNC_KINDS) {
      for (const [userId, bucket] of Object.entries(this.s.items[kind] || {})) {
        for (const [id, e] of Object.entries(bucket)) {
          if (e.deletedAt && e.deletedAt < cutoff) { delete this.s.items[kind][userId][id]; removed += 1; }
        }
      }
    }
    if (removed) this.save();
    return removed;
  }
  async addEvent(type, userId, orgId = null) {
    this.s.events.push({ type, userId, orgId, day: dayKey(), at: Date.now() });
    if (this.s.events.length > 50000) this.s.events = this.s.events.slice(-40000);
    this.save();
  }
  async eventsSince(days, orgId = null) {
    const cutoff = Date.now() - days * DAY_MS;
    return this.s.events.filter((e) => e.at >= cutoff && (!orgId || e.orgId === orgId));
  }
  async dataStats(orgId = null) {
    const docs = Object.values(this.s.data).filter((d) => !orgId || d.orgId === orgId);
    return {
      workspaces: docs.length,
      records: docs.reduce((a, d) => a + (d.recordCount || 0), 0),
      modules: docs.reduce((a, d) => a + (d.moduleCount || 0), 0),
    };
  }

  // --- organisations
  async createOrg(org) {
    this.s.orgs = this.s.orgs || [];
    this.s.orgs.push(org);
    this.save();
    return org;
  }
  async getOrg(id) { return (this.s.orgs || []).find((o) => o.id === id) || null; }
  async listOrgs() { return [...(this.s.orgs || [])]; }
  async countOrgs() { return (this.s.orgs || []).length; }
}

class MongoStore {
  constructor(uri) { this.uri = uri; }
  kind() { return 'mongodb'; }
  async init() {
    const { MongoClient } = require('mongodb');
    this.client = new MongoClient(this.uri);
    await this.client.connect();
    const db = this.client.db(process.env.MONGODB_DB || 'crmbuilder');
    this.users = db.collection('users');
    this.data = db.collection('data');
    this.events = db.collection('events');
    this.orgs = db.collection('orgs');
    this.cols = { modules: db.collection('modules'), records: db.collection('records') };

    // Email stays GLOBALLY unique, deliberately. Sign-in resolves an account
    // by email alone, so the same address in two orgs would make login
    // ambiguous — { orgId, email } unique would be the wrong constraint here.
    await this.users.createIndex({ email: 1 }, { unique: true });
    await this.data.createIndex({ userId: 1 }, { unique: true });
    await this.orgs.createIndex({ id: 1 }, { unique: true });

    // orgId leads every scoped index: a query filtered on orgId alone cannot
    // use an index where orgId sits in a trailing position.
    await this.users.createIndex({ orgId: 1, createdAt: -1 });
    await this.data.createIndex({ orgId: 1 });
    await this.events.createIndex({ orgId: 1, at: 1 });

    for (const kind of SYNC_KINDS) {
      const col = this.cols[kind];
      // One row per item per workspace. The unique key is what makes a push
      // idempotent: replaying it upserts the same row instead of duplicating.
      await col.createIndex({ userId: 1, id: 1 }, { unique: true });
      // The delta query is exactly this: one workspace, everything past a
      // cursor, in cursor order.
      await col.createIndex({ userId: 1, serverAt: 1 });
      await col.createIndex({ orgId: 1 });
      await this.ensureTombstoneTTL(kind);
    }

    await this.ensureEventTTL();
  }

  /*
   * Expire tombstones once every device has had a fair chance to see them.
   *
   * Same single-field rule as the events TTL — expireAfterSeconds on a
   * compound key is accepted and then ignored. It keys on `deletedOn`, a real
   * Date that only tombstones carry: MongoDB's TTL monitor skips documents
   * where the indexed field is not a Date, so live rows (deletedOn: null) are
   * never touched by it.
   */
  async ensureTombstoneTTL(kind) {
    const expireAfterSeconds = TOMBSTONE_DAYS * 86400;
    const col = this.cols[kind];
    try {
      await col.createIndex({ deletedOn: 1 }, { expireAfterSeconds });
    } catch (err) {
      if (err.code === 85 || err.code === 86) {
        try {
          await col.dropIndex('deletedOn_1');
          await col.createIndex({ deletedOn: 1 }, { expireAfterSeconds });
        } catch (retryErr) {
          console.warn(`Could not apply the ${kind} tombstone TTL:`, retryErr.message);
        }
      } else {
        console.warn(`Could not apply the ${kind} tombstone TTL:`, err.message);
      }
    }
  }

  // Analytics only ever look 30 days back, but events accumulate forever and
  // compete with customer data for the same storage quota. Expire them.
  //
  // This must stay a SINGLE-FIELD index. MongoDB TTL indexes are single-field
  // only — expireAfterSeconds on a compound key like { orgId, at } is silently
  // ignored and nothing would ever expire. The compound index above serves
  // org-scoped queries; this one does the expiry.
  async ensureEventTTL() {
    const expireAfterSeconds = Number(process.env.EVENT_RETENTION_DAYS || 90) * 86400;
    try {
      await this.events.createIndex({ at: 1 }, { expireAfterSeconds });
    } catch (err) {
      // Deployments created before this existed have a plain { at: 1 } index.
      // Mongo refuses to redefine an index's options in place (code 85/86), so
      // replace it. Never fatal: analytics degrade, the app keeps working.
      if (err.code === 85 || err.code === 86) {
        try {
          await this.events.dropIndex('at_1');
          await this.events.createIndex({ at: 1 }, { expireAfterSeconds });
          console.log(`Replaced the events index with a ${expireAfterSeconds / 86400}-day TTL`);
        } catch (retryErr) {
          console.warn('Could not apply the events TTL index:', retryErr.message);
        }
      } else {
        console.warn('Could not apply the events TTL index:', err.message);
      }
    }
  }
  async countUsers() { return this.users.countDocuments(); }
  async getUserByEmail(email) { return this.users.findOne({ email }, { projection: { _id: 0 } }); }
  async getUserById(id) { return this.users.findOne({ id }, { projection: { _id: 0 } }); }
  async createUser(u) { await this.users.insertOne({ ...u }); return u; }
  async updateUser(id, patch) {
    await this.users.updateOne({ id }, { $set: patch });
    return this.getUserById(id);
  }
  async deleteUser(id) {
    await this.users.deleteOne({ id });
    await this.data.deleteOne({ userId: id });
    for (const kind of SYNC_KINDS) await this.cols[kind].deleteMany({ userId: id });
  }
  async listUsers(orgId = null) {
    return this.users.find(orgId ? { orgId } : {}, { projection: { _id: 0 } }).toArray();
  }
  async getData(userId) { return this.data.findOne({ userId }, { projection: { _id: 0 } }); }
  async putData(userId, doc) { await this.data.updateOne({ userId }, { $set: doc }, { upsert: true }); }
  async stripSnapshot(userId) {
    await this.data.updateOne({ userId }, { $unset: { modules: '', records: '' } });
  }

  // --- per-record items
  async getItemsByIds(kind, userId, ids) {
    const out = [];
    // $in with tens of thousands of ids builds a query document that can pass
    // the 16 MB BSON limit; chunk it.
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      const rows = await this.cols[kind].find({ userId, id: { $in: chunk } }, { projection: { _id: 0 } }).toArray();
      out.push(...rows);
    }
    return out;
  }
  async listItems(kind, userId, { since = 0, includeDeleted = true } = {}) {
    const query = { userId, serverAt: { $gt: since } };
    if (!includeDeleted) query.deletedAt = null;
    return this.cols[kind].find(query, { projection: { _id: 0 } }).sort({ serverAt: 1 }).toArray();
  }
  async putItems(kind, envelopes) {
    if (!envelopes.length) return;
    await this.cols[kind].bulkWrite(envelopes.map((e) => ({
      updateOne: { filter: { userId: e.userId, id: e.id }, update: { $set: e }, upsert: true },
    })), { ordered: false });
  }
  async countItems(kind, userId) {
    return this.cols[kind].countDocuments({ userId, deletedAt: null });
  }
  async addEvent(type, userId, orgId = null) {
    await this.events.insertOne({ type, userId, orgId, day: dayKey(), at: Date.now() });
  }
  async eventsSince(days, orgId = null) {
    const query = { at: { $gte: Date.now() - days * DAY_MS } };
    if (orgId) query.orgId = orgId;
    return this.events.find(query, { projection: { _id: 0 } }).toArray();
  }
  async dataStats(orgId = null) {
    const pipeline = [];
    if (orgId) pipeline.push({ $match: { orgId } });
    pipeline.push({ $group: { _id: null, workspaces: { $sum: 1 }, records: { $sum: '$recordCount' }, modules: { $sum: '$moduleCount' } } });
    const agg = await this.data.aggregate(pipeline).toArray();
    const s = agg[0] || {};
    return { workspaces: s.workspaces || 0, records: s.records || 0, modules: s.modules || 0 };
  }

  // --- organisations
  async createOrg(org) { await this.orgs.insertOne({ ...org }); return org; }
  async getOrg(id) { return this.orgs.findOne({ id }, { projection: { _id: 0 } }); }
  async listOrgs() { return this.orgs.find({}, { projection: { _id: 0 } }).toArray(); }
  async countOrgs() { return this.orgs.countDocuments(); }
}

const store = process.env.MONGODB_URI
  ? new MongoStore(process.env.MONGODB_URI)
  // DATA_DIR lets tests point the file store at a throwaway directory.
  : new FileStore(path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'store.json'));

// ------------------------------------------------------------------ auth
function publicUser(u) {
  return {
    id: u.id, email: u.email, name: u.name, picture: u.picture || '',
    role: u.role, orgId: u.orgId || null, createdAt: u.createdAt,
  };
}

function setSession(res, user) {
  const token = jwt.sign({ sub: user.id }, SESSION_SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: 30 * DAY_MS,
    path: '/',
  });
}

/*
 * Roles
 *   platformAdmin — operates the deployment; sees across every org
 *   owner         — administers their own org, and only their own org
 *   member        — ordinary user
 *
 * Every user belongs to exactly one org. A new signup gets a fresh org and
 * owns it; joining an existing org is a future invite flow.
 */
const ROLES = ['platformAdmin', 'owner', 'member'];

function orgNameFor(user) {
  const domain = user.email.split('@')[1] || '';
  const generic = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'proton.me', 'example.com'];
  if (domain && !generic.includes(domain)) {
    const base = domain.split('.')[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  }
  return `${user.name || user.email.split('@')[0]}'s workspace`;
}

async function createOrgFor(user) {
  const org = { id: uid(), name: orgNameFor(user), createdAt: Date.now(), createdBy: user.id };
  await store.createOrg(org);
  return org;
}

async function upsertUser({ email, name, picture, provider }) {
  email = String(email).toLowerCase();
  let user = await store.getUserByEmail(email);
  if (!user) {
    const isFirst = (await store.countUsers()) === 0;
    user = {
      id: uid(),
      email,
      name: name || email.split('@')[0],
      picture: picture || '',
      provider,
      role: isFirst || ADMIN_EMAILS.includes(email) ? 'platformAdmin' : 'owner',
      disabled: false,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    const org = await createOrgFor(user);
    user.orgId = org.id;
    await store.createUser(user);
    await store.addEvent('signup', user.id, user.orgId);
  } else {
    const patch = { lastActiveAt: Date.now() };
    if (name && user.name !== name) patch.name = name;
    if (picture && user.picture !== picture) patch.picture = picture;
    if (ADMIN_EMAILS.includes(email) && user.role !== 'platformAdmin') patch.role = 'platformAdmin';
    // An account predating orgs, or one whose org was removed.
    if (!user.orgId) patch.orgId = (await createOrgFor(user)).id;
    user = await store.updateUser(user.id, patch);
  }
  await store.addEvent('login', user.id, user.orgId);
  return user;
}

/*
 * One-time backfill for deployments that predate organisations. Idempotent:
 * users that already have an orgId are untouched, so it is safe on every boot.
 * Each existing account becomes its own org, which preserves exactly the
 * isolation those users have today.
 */
async function migrateToOrgs() {
  const users = await store.listUsers();
  const legacy = users.filter((u) => !u.orgId);
  if (!legacy.length) return;

  for (const user of legacy) {
    const org = await createOrgFor(user);
    const role = user.role === 'admin' ? 'platformAdmin' : (user.role === 'user' ? 'owner' : user.role);
    await store.updateUser(user.id, { orgId: org.id, role });
    // Tag the workspace too, so org-scoped stats see it.
    const data = await store.getData(user.id);
    if (data && !data.orgId) await store.putData(user.id, { ...data, orgId: org.id });
  }
  console.log(`Migrated ${legacy.length} account(s) to organisations`);
}

async function currentUser(req) {
  const token = req.cookies[COOKIE];
  if (!token) return null;
  try {
    const { sub } = jwt.verify(token, SESSION_SECRET);
    const user = await store.getUserById(sub);
    return user && !user.disabled ? user : null;
  } catch {
    return null;
  }
}

async function requireAuth(req, res, next) {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  req.user = user;
  // Throttled activity tracking (at most once/hour per user)
  if (Date.now() - (user.lastActiveAt || 0) > 3600000) {
    store.updateUser(user.id, { lastActiveAt: Date.now() }).catch(() => {});
  }
  next();
}

/*
 * Two admin layers, kept deliberately separate.
 *
 * requireOrgAdmin gates an org's own administration and always scopes to the
 * caller's org. requirePlatformAdmin is a distinct middleware for cross-org
 * access — never a branch inside the org check, because a conditional like
 * `role === 'platformAdmin' || sameOrg` gets copied into a handler where the
 * precedence is wrong, and that is how cross-tenant leaks happen.
 *
 * req.scopeOrgId is the only thing handlers may scope by, and it comes from
 * the session. It is never read from a parameter, query or body.
 */
function requireOrgAdmin(req, res, next) {
  if (req.user.role !== 'owner' && req.user.role !== 'platformAdmin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  if (!req.user.orgId && req.user.role !== 'platformAdmin') {
    return res.status(403).json({ error: 'No organisation' });
  }
  // Platform admins see across orgs; everyone else is pinned to their own.
  req.isPlatformAdmin = req.user.role === 'platformAdmin';
  req.scopeOrgId = req.isPlatformAdmin ? null : req.user.orgId;
  next();
}

function requirePlatformAdmin(req, res, next) {
  if (req.user.role !== 'platformAdmin') return res.status(403).json({ error: 'Platform admin only' });
  next();
}

// Resolve a target account for an admin action, refusing anything outside the
// caller's scope. Returns 404 rather than 403 for another org's account so the
// response does not confirm that the account exists.
async function resolveTarget(req, res) {
  const target = await store.getUserById(req.params.id);
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return null;
  }
  if (!req.isPlatformAdmin && target.orgId !== req.scopeOrgId) {
    res.status(404).json({ error: 'User not found' });
    return null;
  }
  return target;
}

// ------------------------------------------------------------ sync engine
/*
 * Per-record sync.
 *
 * A client keeps a cursor — the highest `serverAt` it has seen. A round trip
 * is one POST: everything the client changed since its last successful push,
 * and in the response everything anyone changed since its cursor.
 *
 * Conflicts resolve per record by last-write-wins on `updatedAt`, so two
 * devices editing *different* records both keep their work. Whole-snapshot
 * sync could not do that: the later save simply overwrote the earlier one.
 *
 * Ties go to the row already stored (`existing.updatedAt >= incoming` skips).
 * A replayed push therefore changes nothing, which is what makes the retry on
 * a flaky connection safe.
 */
function envelope(kind, user, item, now) {
  const deleted = !!item.deleted;
  const updatedAt = Number(item.updatedAt) || now;
  const deletedAt = deleted ? (Number(item.deletedAt) || updatedAt) : null;
  return {
    userId: user.id,
    orgId: user.orgId || null,
    id: String(item.id),
    updatedAt,
    serverAt: serverStamp(),
    deletedAt,
    // A Date, and only on tombstones — this is what the TTL index keys on.
    deletedOn: deletedAt ? new Date(deletedAt) : null,
    doc: deleted ? null : (item.doc && typeof item.doc === 'object' ? item.doc : {}),
  };
}

function wireItem(e) {
  return e.deletedAt
    ? { id: e.id, updatedAt: e.updatedAt, deleted: true, deletedAt: e.deletedAt }
    : { id: e.id, updatedAt: e.updatedAt, doc: e.doc };
}

async function applyPush(user, body) {
  const now = Date.now();
  const won = { modules: new Set(), records: new Set() };
  let touched = 0;

  for (const kind of SYNC_KINDS) {
    const incoming = Array.isArray(body[kind]) ? body[kind] : [];
    if (!incoming.length) continue;

    // De-duplicate by id first (a client retrying mid-batch can send one twice)
    // and keep the newest, so the existing-row lookup below stays one query.
    const byId = new Map();
    for (const item of incoming) {
      if (!item || !item.id) continue;
      const id = String(item.id);
      const prev = byId.get(id);
      if (!prev || (Number(item.updatedAt) || 0) >= (Number(prev.updatedAt) || 0)) byId.set(id, item);
    }
    if (!byId.size) continue;

    const existing = new Map(
      (await store.getItemsByIds(kind, user.id, [...byId.keys()])).map((e) => [e.id, e])
    );
    const writes = [];
    for (const [id, item] of byId) {
      const prior = existing.get(id);
      const updatedAt = Number(item.updatedAt) || now;
      if (prior && prior.updatedAt >= updatedAt) continue; // the server's copy wins
      writes.push(envelope(kind, user, item, now));
      won[kind].add(id);
    }
    if (writes.length) await store.putItems(kind, writes);
    touched += writes.length;
  }

  // Settings stay a single small document. Last-write-wins is honest at that
  // granularity — there is no partial edit worth merging in a currency choice.
  let settingsWritten = false;
  if (body.settings && typeof body.settings === 'object') {
    const meta = (await store.getData(user.id)) || {};
    // Exactly zero, not falsy-zero. A device that has never had settings sends
    // 0, and `Number(x) || now` would restamp that as this instant — which is
    // how a fresh device signing in used to overwrite the workspace's real
    // settings with its own defaults.
    const raw = Number(body.settingsUpdatedAt);
    const incomingAt = Number.isFinite(raw) ? raw : now;
    if (incomingAt > (meta.settingsUpdatedAt || 0)) {
      await store.putData(user.id, {
        userId: user.id,
        orgId: user.orgId || null,
        settings: body.settings,
        settingsUpdatedAt: incomingAt,
        settingsServerAt: serverStamp(),
      });
      settingsWritten = true;
    }
  }

  return { won, touched, settingsWritten };
}

/*
 * Everything past `cursor`, minus anything the caller just pushed and won:
 * echoing those back would be correct but would double the traffic of every
 * sync. Their `serverAt` still counts toward the returned cursor, which is
 * what stops them coming back on the next pull.
 */
async function pullChanges(user, cursor, won = null) {
  const out = { modules: [], records: [] };
  let next = cursor;

  for (const kind of SYNC_KINDS) {
    for (const e of await store.listItems(kind, user.id, { since: cursor })) {
      if (e.serverAt > next) next = e.serverAt;
      if (won && won[kind].has(e.id)) continue;
      out[kind].push(wireItem(e));
    }
  }

  const meta = (await store.getData(user.id)) || {};
  let settings = null;
  if (meta.settings && (meta.settingsServerAt || 0) > cursor) {
    settings = { doc: meta.settings, updatedAt: meta.settingsUpdatedAt || 0 };
  }
  if ((meta.settingsServerAt || 0) > next) next = meta.settingsServerAt;

  return { ...out, settings, cursor: next };
}

// Keep the counts the admin dashboard reads in step with the item rows.
async function refreshCounts(user) {
  const [moduleCount, recordCount] = await Promise.all([
    store.countItems('modules', user.id),
    store.countItems('records', user.id),
  ]);
  await store.putData(user.id, {
    userId: user.id,
    orgId: user.orgId || null,
    moduleCount,
    recordCount,
    perRecord: true,
    updatedAt: Date.now(),
  });
  return { moduleCount, recordCount };
}

/*
 * The legacy whole-snapshot write, kept so an older cached client still syncs.
 * It means what it always meant: this is the entire workspace, so anything
 * absent is deleted. Unchanged rows are left alone (a no-op push must not make
 * every other device re-download the workspace); changed ones are forced past
 * whatever is stored, because the caller has no per-record clock to arbitrate
 * with.
 */
async function applyFullSnapshot(user, { modules, records, settings }) {
  const now = Date.now();
  const incoming = { modules, records };

  for (const kind of SYNC_KINDS) {
    const rows = incoming[kind];
    const stored = await store.listItems(kind, user.id, { since: 0 });
    const byId = new Map(stored.map((e) => [e.id, e]));
    const seen = new Set();
    const writes = [];

    for (const doc of rows) {
      if (!doc || !doc.id) continue;
      const id = String(doc.id);
      seen.add(id);
      const prior = byId.get(id);
      if (prior && !prior.deletedAt && JSON.stringify(prior.doc) === JSON.stringify(doc)) continue;
      const updatedAt = Math.max(Number(doc.updatedAt) || now, prior ? prior.updatedAt + 1 : 0);
      writes.push(envelope(kind, user, { id, updatedAt, doc }, now));
    }
    for (const e of stored) {
      if (seen.has(e.id) || e.deletedAt) continue;
      writes.push(envelope(kind, user, { id: e.id, updatedAt: Math.max(now, e.updatedAt + 1), deleted: true }, now));
    }
    if (writes.length) await store.putItems(kind, writes);
  }

  if (settings && typeof settings === 'object') {
    await store.putData(user.id, {
      userId: user.id,
      orgId: user.orgId || null,
      settings,
      settingsUpdatedAt: now,
      settingsServerAt: serverStamp(),
    });
  }
}

/*
 * One-time split of whole-snapshot workspaces into per-record rows.
 *
 * Idempotent by the `perRecord` flag on the meta document, so it is safe on
 * every boot. Ids are preserved exactly — a record's id is what the client
 * already has in IndexedDB, and minting new ones would duplicate every row on
 * the next sync instead of matching it.
 */
async function migrateToPerRecord() {
  const users = await store.listUsers();
  let migrated = 0;

  for (const user of users) {
    const meta = await store.getData(user.id);
    if (!meta || meta.perRecord) continue;

    const modules = Array.isArray(meta.modules) ? meta.modules : [];
    const records = Array.isArray(meta.records) ? meta.records : [];
    const now = Number(meta.updatedAt) || Date.now();
    const owner = { id: user.id, orgId: meta.orgId || user.orgId || null };

    for (const [kind, rows] of [['modules', modules], ['records', records]]) {
      const writes = rows
        .filter((doc) => doc && doc.id)
        .map((doc) => envelope(kind, owner, { id: doc.id, updatedAt: Number(doc.updatedAt) || now, doc }, now));
      if (writes.length) await store.putItems(kind, writes);
    }

    await store.putData(user.id, {
      userId: user.id,
      orgId: owner.orgId,
      settings: meta.settings || {},
      settingsUpdatedAt: now,
      settingsServerAt: serverStamp(),
      moduleCount: modules.length,
      recordCount: records.length,
      perRecord: true,
      updatedAt: now,
    });
    // Only once the rows are safely written — the arrays are the sole copy
    // until that point.
    await store.stripSnapshot(user.id);
    migrated += 1;
  }

  if (migrated) console.log(`Split ${migrated} workspace(s) into per-record rows`);
}

// ------------------------------------------------------------------- app
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render terminates TLS at the proxy
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());

/*
 * Health.
 *
 * /healthz is the original liveness probe and stays byte-compatible — the
 * smoke test and older render.yaml deployments call it.
 *
 * /health adds what an operator actually asks during an incident: which
 * storage is live, which sync model is running, how long the process has been
 * up. Tenant counts are NOT public: on the pooled deployment they would tell
 * any visitor how many customers are on it. They appear for a signed-in
 * platform admin, or when HEALTH_DETAIL=1 is set — which is the sensible
 * setting on a single-tenant dedicated deployment, where the count is the
 * operator's own.
 */
const BOOT_AT = Date.now();
const HEALTH_DETAIL = process.env.HEALTH_DETAIL === '1';

app.get('/healthz', (req, res) => res.json({ ok: true, storage: store.kind() }));

app.get('/health', async (req, res) => {
  const body = {
    ok: true,
    storage: store.kind(),
    sync: 'per-record',
    deployment: process.env.DEPLOYMENT_MODE || (IS_PROD ? 'pooled' : 'development'),
    tenant: process.env.TENANT_NAME || null,
    uptimeSec: Math.round((Date.now() - BOOT_AT) / 1000),
    googleEnabled: !!GOOGLE_CLIENT_ID,
    devLoginEnabled: DEV_LOGIN,
    time: new Date().toISOString(),
  };

  const user = await currentUser(req).catch(() => null);
  if (HEALTH_DETAIL || (user && user.role === 'platformAdmin')) {
    try {
      body.counts = { orgs: await store.countOrgs(), users: await store.countUsers() };
    } catch (err) {
      // A health check that fails because a count failed is worse than one
      // that reports the outage it was asked about.
      body.ok = false;
      body.error = err.message;
    }
  }

  res.status(body.ok ? 200 : 503).json(body);
});

// ---- OAuth (Google)
app.get('/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(404).send('Google OAuth is not configured');
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('crmb_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: 600000 });
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${APP_URL}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state || state !== req.cookies.crmb_oauth_state) {
      return res.redirect('/?auth_error=state');
    }
    res.clearCookie('crmb_oauth_state');
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `${APP_URL}/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error('token exchange failed');
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const info = await infoRes.json();
    if (!info.email) throw new Error('no email from Google');
    const user = await upsertUser({ email: info.email, name: info.name, picture: info.picture, provider: 'google' });
    if (user.disabled) return res.redirect('/?auth_error=disabled');
    setSession(res, user);
    res.redirect('/');
  } catch (err) {
    console.error('OAuth callback error:', err.message);
    res.redirect('/?auth_error=oauth');
  }
});

// ---- Dev login (local development only)
app.post('/auth/dev', async (req, res) => {
  if (!DEV_LOGIN) return res.status(404).json({ error: 'Not available' });
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Valid email required' });
  const user = await upsertUser({ email, name: req.body.name || '', provider: 'dev' });
  if (user.disabled) return res.status(403).json({ error: 'Account disabled' });
  setSession(res, user);
  res.json({ user: publicUser(user) });
});

app.post('/auth/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/me', async (req, res) => {
  const user = await currentUser(req);
  // Every signup owns an org, so "is an owner" alone would show an admin
  // panel to solo users listing only themselves. The client uses the member
  // count to decide whether that panel is worth showing.
  let org = null;
  if (user && user.orgId) {
    const record = await store.getOrg(user.orgId);
    const members = await store.listUsers(user.orgId);
    org = { id: user.orgId, name: record ? record.name : '', memberCount: members.length };
  }
  res.json({
    authenticated: !!user,
    user: user ? publicUser(user) : null,
    org,
    googleEnabled: !!GOOGLE_CLIENT_ID,
    devLoginEnabled: DEV_LOGIN,
    storage: store.kind(),
  });
});

// ---- per-record sync
//
// GET  /api/sync?since=N   changes only
// POST /api/sync           push changes, get back everything else in one trip
const MAX_SYNC_ITEMS = 20000;

app.get('/api/sync', requireAuth, async (req, res) => {
  const since = Number(req.query.since) || 0;
  const out = await pullChanges(req.user, since);
  res.json({ ...out, serverTime: Date.now() });
});

app.post('/api/sync', requireAuth, async (req, res) => {
  const body = req.body || {};
  const since = Number(body.since) || 0;
  for (const kind of SYNC_KINDS) {
    if (body[kind] !== undefined && !Array.isArray(body[kind])) {
      return res.status(400).json({ error: `${kind} must be an array` });
    }
    if (Array.isArray(body[kind]) && body[kind].length > MAX_SYNC_ITEMS) {
      return res.status(413).json({ error: `Too many ${kind} in one push (max ${MAX_SYNC_ITEMS})` });
    }
  }

  const { won, touched, settingsWritten } = await applyPush(req.user, body);
  const out = await pullChanges(req.user, since, won);
  if (touched || settingsWritten) {
    await refreshCounts(req.user);
    store.addEvent('sync', req.user.id, req.user.orgId).catch(() => {});
  }
  res.json({ ...out, pushed: touched, serverTime: Date.now() });
});

// ---- whole-snapshot sync (legacy)
// Still served so a client running cached older JS keeps working through a
// deploy. Both paths read and write the same per-record rows.
app.get('/api/data', requireAuth, async (req, res) => {
  const meta = await store.getData(req.user.id);
  const [modules, records] = await Promise.all([
    store.listItems('modules', req.user.id, { since: 0, includeDeleted: false }),
    store.listItems('records', req.user.id, { since: 0, includeDeleted: false }),
  ]);
  if (!meta && !modules.length && !records.length) {
    return res.json({ modules: null, records: null, settings: null, updatedAt: 0 });
  }
  res.json({
    modules: modules.map((e) => e.doc),
    records: records.map((e) => e.doc),
    settings: (meta && meta.settings) || {},
    updatedAt: (meta && meta.updatedAt) || 0,
  });
});

app.put('/api/data', requireAuth, async (req, res) => {
  const { modules, records, settings } = req.body;
  if (!Array.isArray(modules) || !Array.isArray(records)) {
    return res.status(400).json({ error: 'modules and records arrays required' });
  }
  await applyFullSnapshot(req.user, { modules, records, settings });
  const counts = await refreshCounts(req.user);
  store.addEvent('sync', req.user.id, req.user.orgId).catch(() => {});
  const meta = await store.getData(req.user.id);
  res.json({ ok: true, updatedAt: meta.updatedAt, ...counts });
});

// ---- the caller's own organisation
app.get('/api/org', requireAuth, async (req, res) => {
  if (!req.user.orgId) return res.json({ org: null });
  const org = await store.getOrg(req.user.orgId);
  if (!org) return res.json({ org: null });
  const members = await store.listUsers(org.id);
  res.json({
    org: { id: org.id, name: org.name, createdAt: org.createdAt },
    role: req.user.role,
    memberCount: members.length,
  });
});

// ---- admin: accounts + analytics
app.get('/api/admin/stats', requireAuth, requireOrgAdmin, async (req, res) => {
  // req.scopeOrgId is null only for a platform admin; everyone else is pinned
  // to their own org by the middleware.
  const users = await store.listUsers(req.scopeOrgId);
  const events = await store.eventsSince(30, req.scopeOrgId);
  const now = Date.now();
  const active7d = users.filter((u) => now - (u.lastActiveAt || 0) < 7 * DAY_MS).length;

  const signupsByDay = {};
  const activeByDay = {};
  for (let i = 29; i >= 0; i--) {
    signupsByDay[dayKey(now - i * DAY_MS)] = 0;
  }
  for (let i = 13; i >= 0; i--) {
    activeByDay[dayKey(now - i * DAY_MS)] = new Set();
  }
  events.forEach((e) => {
    if (e.type === 'signup' && e.day in signupsByDay) signupsByDay[e.day] += 1;
    if (e.day in activeByDay) activeByDay[e.day].add(e.userId);
  });
  const data = await store.dataStats(req.scopeOrgId);
  res.json({
    scope: req.isPlatformAdmin ? 'platform' : 'org',
    orgId: req.scopeOrgId,
    totals: {
      users: users.length,
      admins: users.filter((u) => u.role === 'owner' || u.role === 'platformAdmin').length,
      disabled: users.filter((u) => u.disabled).length,
      activeLast7d: active7d,
      workspaces: data.workspaces,
      records: data.records,
      modules: data.modules,
    },
    signups: Object.entries(signupsByDay).map(([day, count]) => ({ day, count })),
    activeUsers: Object.entries(activeByDay).map(([day, set]) => ({ day, count: set.size })),
    storage: store.kind(),
  });
});

app.get('/api/admin/users', requireAuth, requireOrgAdmin, async (req, res) => {
  const users = await store.listUsers(req.scopeOrgId);
  const withCounts = await Promise.all(users.map(async (u) => {
    const d = await store.getData(u.id);
    return {
      ...publicUser(u),
      disabled: !!u.disabled,
      provider: u.provider,
      lastActiveAt: u.lastActiveAt || 0,
      moduleCount: d ? d.moduleCount || 0 : 0,
      recordCount: d ? d.recordCount || 0 : 0,
    };
  }));
  withCounts.sort((a, b) => b.createdAt - a.createdAt);
  res.json({ users: withCounts, scope: req.isPlatformAdmin ? 'platform' : 'org' });
});

app.patch('/api/admin/users/:id', requireAuth, requireOrgAdmin, async (req, res) => {
  const { id } = req.params;
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot modify your own account here' });
  const target = await resolveTarget(req, res);
  if (!target) return undefined;
  const patch = {};
  // Only a platform admin may grant platform admin — an org owner promoting
  // someone must not be able to hand out cross-org access.
  if (req.body.role === 'owner' || req.body.role === 'member') patch.role = req.body.role;
  if (req.body.role === 'platformAdmin' && req.isPlatformAdmin) patch.role = 'platformAdmin';
  if (typeof req.body.disabled === 'boolean') patch.disabled = req.body.disabled;
  const user = await store.updateUser(id, patch);
  res.json({ user: { ...publicUser(user), disabled: !!user.disabled } });
});

app.delete('/api/admin/users/:id', requireAuth, requireOrgAdmin, async (req, res) => {
  const { id } = req.params;
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  const target = await resolveTarget(req, res);
  if (!target) return undefined;
  await store.deleteUser(id);
  res.json({ ok: true });
});

// ---- static PWA
app.use(express.static(__dirname, {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
    if (filePath.endsWith('.woff2')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ------------------------------------------------------------------ boot
(async () => {
  try {
    await store.init();
    console.log(`Storage: ${store.kind()}${store.kind() === 'file' ? ' (set MONGODB_URI for MongoDB)' : ''}`);
    // Both idempotent: no-ops once every account has an org and every
    // workspace has been split into rows.
    await migrateToOrgs();
    await migrateToPerRecord();
  } catch (err) {
    console.error('Storage init failed:', err.message);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`CRM Builder running on ${APP_URL} (port ${PORT})`);
    console.log(`Google OAuth: ${GOOGLE_CLIENT_ID ? 'enabled' : 'disabled'} · Dev login: ${DEV_LOGIN ? 'enabled' : 'disabled'}`);
  });
})();
