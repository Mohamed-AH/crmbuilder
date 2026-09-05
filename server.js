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
/*
 * Google's endpoints, overridable so the callback can be tested.
 *
 * The OAuth callback is the highest-risk flow in the application and had no
 * test at all, because it cannot be driven without Google on the other end.
 * These two overrides let a test stand up a fake Google and exercise the real
 * handler — the state check, the gate, the upsert and the session — rather
 * than a unit-tested imitation of it. Same trick the feedback-webhook test
 * already uses.
 *
 * Overriding them requires environment access, which means already owning the
 * deployment; that is the same bar as GOOGLE_CLIENT_SECRET itself.
 */
const GOOGLE_TOKEN_URL = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = process.env.GOOGLE_USERINFO_URL || 'https://www.googleapis.com/oauth2/v2/userinfo';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const IS_PROD = process.env.NODE_ENV === 'production';
// Dev login (email-only, no password) for local development / demos.
// Never enabled in production unless explicitly requested.
const DEV_LOGIN = process.env.ALLOW_DEV_LOGIN === '1' || (!IS_PROD && !GOOGLE_CLIENT_ID);

const COOKIE = 'crmb_session';
const BETA_COOKIE = 'crmb_beta';
// The team invite has to survive the Google round trip too, for the same
// reason the beta code does: the callback is where we learn whether this is a
// signup at all, and the gate needs to know an invite is in hand.
const INVITE_COOKIE = 'crmb_invite';
const DAY_MS = 86400000;

/*
 * Who may create an account.
 *
 *   code    a beta code is required to SIGN UP (the default while in beta)
 *   open    anyone who can authenticate gets an account
 *   closed  no new accounts at all; existing ones still work
 *
 * In every mode this gates signup only. Signing back in never asks again —
 * an account that exists is an account that exists, and a returning tester
 * being challenged for a code they used weeks ago is the friction this whole
 * flow is meant to avoid.
 */
const SIGNUP_MODES = ['code', 'open', 'closed'];
/*
 * The env var is the DEFAULT, not the answer.
 *
 * It used to be read once at boot, which meant opening or pausing signups
 * needed an environment change and a redeploy — minutes of downtime on a free
 * tier to flip one word, at exactly the moments you least want it: the beta
 * filling up, or something going wrong. So the live value lives in the
 * database and the operator changes it from the admin panel.
 *
 * Precedence, and it matters: once a mode has been set from the panel, that is
 * the mode. SIGNUP_MODE only decides for a deployment that has never set one.
 * A redeploy therefore does NOT quietly undo a decision made in the panel,
 * which is the whole point — but it also means the env var stops being the
 * place to look, so /health and the panel both report the live value.
 */
const SIGNUP_MODE_DEFAULT = SIGNUP_MODES.includes(process.env.SIGNUP_MODE)
  ? process.env.SIGNUP_MODE
  : 'code';

// Read on every signup and every boot of every client, so it is cached. The
// invalidate-on-write keeps a single instance exact; the TTL is what makes a
// multi-instance deployment converge rather than stay wrong.
let signupModeCache = { value: null, at: 0 };
const SIGNUP_MODE_TTL_MS = 30000;

async function signupMode() {
  const now = Date.now();
  if (signupModeCache.value && now - signupModeCache.at < SIGNUP_MODE_TTL_MS) return signupModeCache.value;
  let stored = null;
  try {
    stored = (await store.getPlatformSettings()).signupMode;
  } catch (err) {
    // A settings read must never be what stops people signing in.
    console.warn('Could not read the signup mode, using the deployment default:', err.message);
  }
  const value = SIGNUP_MODES.includes(stored) ? stored : SIGNUP_MODE_DEFAULT;
  signupModeCache = { value, at: now };
  return value;
}

/*
 * Creating a tenant is a separate act from creating an account.
 *
 * They looked like one switch because every signup mints an org — which meant
 * pausing signups also locked out every *invited teammate* of every existing
 * customer, since a colleague must have an account before /api/org/join can
 * move them. That is the wrong blast radius for "we are full".
 *
 * So this gate refuses a signup that would add a NEW organisation, while a
 * signup carrying a valid team invite still goes through. The invite is only
 * checked here, never consumed: redeemPendingInvite does the actual join a
 * moment later, and burning it twice would leave the joiner stranded in an org
 * of their own.
 */
const ORG_CREATION_MODES = ['open', 'closed'];
let orgCreationCache = { value: null, at: 0 };

async function orgCreation() {
  const now = Date.now();
  if (orgCreationCache.value && now - orgCreationCache.at < SIGNUP_MODE_TTL_MS) return orgCreationCache.value;
  let stored = null;
  try {
    stored = (await store.getPlatformSettings()).orgCreation;
  } catch (err) {
    console.warn('Could not read the org creation gate, allowing:', err.message);
  }
  const value = ORG_CREATION_MODES.includes(stored) ? stored : 'open';
  orgCreationCache = { value, at: now };
  return value;
}

async function setOrgCreation(mode, userId) {
  await store.updatePlatformSettings({
    orgCreation: mode,
    orgCreationSetAt: Date.now(),
    orgCreationSetBy: userId,
  });
  orgCreationCache = { value: mode, at: Date.now() };
  return mode;
}

async function setSignupMode(mode, userId) {
  await store.updatePlatformSettings({
    signupMode: mode,
    signupModeSetAt: Date.now(),
    signupModeSetBy: userId,
  });
  signupModeCache = { value: mode, at: Date.now() };
  return mode;
}
// Every refusal says the same thing, for the same reason invites do: a
// different answer for "wrong" and "spent" is a way to find out which codes
// exist.
const SIGNUP_REJECTION = 'That beta code is not valid. Ask for a fresh one.';

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
//   { wsId, orgId, id, createdBy, updatedAt, serverAt, deletedAt, deletedOn, doc }
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
      this.s = { users: [], orgs: [], invites: [], betaCodes: [], feedback: [], accessRequests: [], platform: {}, data: {}, events: [], items: { modules: {}, records: {} } };
    }
    this.s.items = this.s.items || { modules: {}, records: {} };
    this.s.invites = this.s.invites || [];
    this.s.betaCodes = this.s.betaCodes || [];
    this.s.feedback = this.s.feedback || [];
    this.s.accessRequests = this.s.accessRequests || [];
    this.s.platform = this.s.platform || {};
  }
  /*
   * Write to a temp file, then rename over the real one.
   *
   * `writeFileSync` truncates the target and then fills it, which leaves two
   * windows. A reader during the write sees a torn file — that is what made
   * the migration tests fail one run in three, on a JSON.parse of a truncated
   * store. Worse, a crash during the write leaves it truncated **permanently**,
   * and this is the store a deployment falls back to when MONGODB_URI is
   * unset, so that is every customer's data.
   *
   * rename(2) is atomic within a filesystem, so a reader gets either the whole
   * old file or the whole new one, and an interrupted save leaves the previous
   * copy intact. The temp file must sit beside the target for that to hold —
   * a rename across filesystems is a copy, and copies are not atomic.
   */
  save() {
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.s));
    fs.renameSync(tmp, this.file);
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
    this.save();
  }
  // Separate from deleteUser on purpose — see deleteAccount() below.
  async deleteWorkspace(wsId) {
    delete this.s.data[wsId];
    for (const kind of SYNC_KINDS) delete (this.s.items[kind] || {})[wsId];
    this.save();
  }
  // An orgId argument of null means "across every org" and is only ever
  // passed by a platform admin. Org-scoped callers always pass a real id.
  async listUsers(orgId = null) {
    return this.s.users.filter((u) => !orgId || u.orgId === orgId);
  }
  async getData(wsId) { return this.s.data[wsId] || null; }
  async putData(wsId, doc) { this.s.data[wsId] = { ...(this.s.data[wsId] || {}), ...doc }; this.save(); }
  async stripSnapshot(wsId) {
    const doc = this.s.data[wsId];
    if (!doc) return;
    delete doc.modules;
    delete doc.records;
    this.save();
  }
  async listWorkspaceIds() { return Object.keys(this.s.data); }
  // The file store knows exactly how big it is, because it is one file.
  async storageStats() {
    let bytes = 0;
    try { bytes = fs.statSync(this.file).size; } catch { /* not written yet */ }
    return { bytes, measured: true, limitBytes: null };
  }

  // Move a workspace from one ownership key to another. Used once, to hand
  // account-keyed rows over to the organisation that owns them.
  async rekeyWorkspace(fromId, toId) {
    if (fromId === toId) return 0;
    let moved = 0;
    for (const kind of SYNC_KINDS) {
      const from = (this.s.items[kind] || {})[fromId];
      if (!from) continue;
      const to = this.bucket(kind, toId);
      for (const [id, e] of Object.entries(from)) {
        to[id] = { ...e, wsId: toId };
        delete to[id].userId;
        moved += 1;
      }
      delete this.s.items[kind][fromId];
    }
    const meta = this.s.data[fromId];
    if (meta) {
      const { userId, ...rest } = meta;
      this.s.data[toId] = { ...(this.s.data[toId] || {}), ...rest, wsId: toId };
      delete this.s.data[fromId];
    }
    this.save();
    return moved;
  }

  // Rows still carrying the old account key, by that key.
  async legacyWorkspaceKeys() {
    const keys = new Set();
    for (const kind of SYNC_KINDS) {
      for (const [key, bucket] of Object.entries(this.s.items[kind] || {})) {
        if (Object.values(bucket).some((e) => !e.wsId)) keys.add(key);
      }
    }
    for (const [key, doc] of Object.entries(this.s.data)) {
      if (!doc.wsId) keys.add(key);
    }
    return [...keys];
  }

  // --- per-record items
  bucket(kind, wsId) {
    this.s.items[kind] = this.s.items[kind] || {};
    this.s.items[kind][wsId] = this.s.items[kind][wsId] || {};
    return this.s.items[kind][wsId];
  }
  async getItemsByIds(kind, wsId, ids) {
    const b = this.bucket(kind, wsId);
    return ids.map((id) => b[id]).filter(Boolean);
  }
  async listItems(kind, wsId, { since = 0, includeDeleted = true } = {}) {
    return Object.values(this.bucket(kind, wsId))
      .filter((e) => e.serverAt > since && (includeDeleted || !e.deletedAt))
      .sort((a, b) => a.serverAt - b.serverAt);
  }
  async putItems(kind, envelopes) {
    for (const e of envelopes) this.bucket(kind, e.wsId)[e.id] = e;
    this.save();
  }
  async countItems(kind, wsId) {
    return Object.values(this.bucket(kind, wsId)).filter((e) => !e.deletedAt).length;
  }
  pruneTombstones() {
    const cutoff = Date.now() - TOMBSTONE_DAYS * DAY_MS;
    let removed = 0;
    for (const kind of SYNC_KINDS) {
      for (const [wsId, bucket] of Object.entries(this.s.items[kind] || {})) {
        for (const [id, e] of Object.entries(bucket)) {
          if (e.deletedAt && e.deletedAt < cutoff) { delete this.s.items[kind][wsId][id]; removed += 1; }
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

  /*
   * Bytes per organisation, measured rather than estimated.
   *
   * records × a constant reads fine right up until the tier fills, because
   * indexes and tombstones are real storage — the same trap the whole-database
   * figure already avoids (§17). Here that means summing what the rows
   * actually serialise to.
   */
  async usageByOrg() {
    const totals = new Map();
    const add = (orgId, bytes, kind, deletedAt) => {
      const key = orgId || '(none)';
      const t = totals.get(key) || { orgId: key, bytes: 0, deadBytes: 0, records: 0, modules: 0, oldestDeletedAt: null };
      t.bytes += bytes;
      if (deletedAt) {
        // What of `bytes` is gravestone, and how long until the oldest of it
        // expires. Measured per row for the reason the Mongo half records.
        t.deadBytes += bytes;
        const at = Number(deletedAt);
        if (Number.isFinite(at) && at > 0) t.oldestDeletedAt = t.oldestDeletedAt ? Math.min(t.oldestDeletedAt, at) : at;
      } else t[kind] += 1;
      totals.set(key, t);
    };
    for (const kind of SYNC_KINDS) {
      for (const bucket of Object.values(this.s.items[kind] || {})) {
        for (const row of Object.values(bucket)) {
          add(row.orgId, Buffer.byteLength(JSON.stringify(row), 'utf8'), kind, row.deletedAt);
        }
      }
    }
    return [...totals.values()];
  }

  // --- organisations
  async createOrg(org) {
    this.s.orgs = this.s.orgs || [];
    this.s.orgs.push(org);
    this.save();
    return org;
  }
  async getOrg(id) { return (this.s.orgs || []).find((o) => o.id === id) || null; }
  async updateOrg(id, patch) {
    const o = await this.getOrg(id);
    if (o) { Object.assign(o, patch); this.save(); }
    return o;
  }
  async deleteOrg(id) {
    this.s.orgs = (this.s.orgs || []).filter((o) => o.id !== id);
    this.save();
  }
  async listOrgs() { return [...(this.s.orgs || [])]; }
  async countOrgs() { return (this.s.orgs || []).length; }

  // --- invites
  async createInvite(invite) {
    this.s.invites = this.s.invites || [];
    this.s.invites.push(invite);
    this.save();
    return invite;
  }
  async getInvite(code) { return (this.s.invites || []).find((i) => i.code === code) || null; }
  async listInvites(orgId) { return (this.s.invites || []).filter((i) => i.orgId === orgId); }
  async updateInvite(code, patch) {
    const i = await this.getInvite(code);
    if (i) { Object.assign(i, patch); this.save(); }
    return i;
  }

  // --- problem reports
  async createFeedback(entry) {
    this.s.feedback = this.s.feedback || [];
    this.s.feedback.push(entry);
    // The file store has no TTL, so it keeps a bounded tail instead.
    if (this.s.feedback.length > 500) this.s.feedback = this.s.feedback.slice(-400);
    this.save();
    return entry;
  }
  async listFeedback(limit = 100) {
    return [...(this.s.feedback || [])].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }
  async updateFeedback(id, patch) {
    const f = (this.s.feedback || []).find((x) => x.id === id);
    if (f) { Object.assign(f, patch); this.save(); }
    return f;
  }
  async countFeedbackSince(userId, since) {
    return (this.s.feedback || []).filter((f) => f.userId === userId && f.createdAt >= since).length;
  }

  // --- beta signup codes
  async createBetaCode(entry) {
    this.s.betaCodes = this.s.betaCodes || [];
    this.s.betaCodes.push(entry);
    this.save();
    return entry;
  }
  async getBetaCode(code) { return (this.s.betaCodes || []).find((c) => c.code === code) || null; }
  async listBetaCodes() { return [...(this.s.betaCodes || [])]; }
  async updateBetaCode(code, patch) {
    const c = await this.getBetaCode(code);
    if (c) { Object.assign(c, patch); this.save(); }
    return c;
  }
  // Atomic in the only sense this store has one: nothing else runs between the
  // read and the write. Mongo does it with a conditional update.
  async consumeBetaCode(code) {
    const c = await this.getBetaCode(code);
    if (!c || c.useCount >= c.maxUses) return null;
    c.useCount += 1;
    this.save();
    return c;
  }

  // --- platform settings (one small document, deployment-wide)
  async getPlatformSettings() { return { ...(this.s.platform || {}) }; }
  async updatePlatformSettings(patch) {
    this.s.platform = { ...(this.s.platform || {}), ...patch };
    this.save();
    return { ...this.s.platform };
  }

  // --- access requests
  async getAccessRequest(email) {
    return (this.s.accessRequests || []).find((r) => r.email === email) || null;
  }
  // One row per address however many times they ask, so the queue cannot be
  // inflated by repeating the request.
  async upsertAccessRequest(entry) {
    const existing = await this.getAccessRequest(entry.email);
    if (existing) { Object.assign(existing, entry); this.save(); return existing; }
    this.s.accessRequests.push(entry);
    this.save();
    return entry;
  }
  async listAccessRequests(status) {
    const all = [...(this.s.accessRequests || [])];
    const rows = status ? all.filter((r) => r.status === status) : all;
    return rows.sort((a, b) => b.requestedAt - a.requestedAt);
  }
  async countAccessRequests(status) {
    return (this.s.accessRequests || []).filter((r) => !status || r.status === status).length;
  }
  async updateAccessRequest(email, patch) {
    const r = await this.getAccessRequest(email);
    if (r) { Object.assign(r, patch); this.save(); }
    return r;
  }
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
    this.invites = db.collection('invites');
    this.betaCodes = db.collection('betaCodes');
    this.feedback = db.collection('feedback');
    this.accessRequests = db.collection('accessRequests');
    this.platform = db.collection('platform');
    this.cols = { modules: db.collection('modules'), records: db.collection('records') };

    // Email stays GLOBALLY unique, deliberately. Sign-in resolves an account
    // by email alone, so the same address in two orgs would make login
    // ambiguous — { orgId, email } unique would be the wrong constraint here.
    await this.users.createIndex({ email: 1 }, { unique: true });
    // One workspace document per workspace — keyed by wsId, not by the account
    // that happens to be reading it.
    await this.data.createIndex({ wsId: 1 }, { unique: true });
    await this.orgs.createIndex({ id: 1 }, { unique: true });
    await this.invites.createIndex({ code: 1 }, { unique: true });
    await this.invites.createIndex({ orgId: 1, createdAt: -1 });
    await this.betaCodes.createIndex({ code: 1 }, { unique: true });
    await this.feedback.createIndex({ createdAt: -1 });
    await this.feedback.createIndex({ userId: 1, createdAt: -1 });
    await this.ensureFeedbackTTL();

    // One row per address, so asking twice updates rather than queues twice.
    await this.accessRequests.createIndex({ email: 1 }, { unique: true });
    await this.accessRequests.createIndex({ status: 1, requestedAt: -1 });
    await this.ensureAccessRequestTTL();

    // orgId leads every scoped index: a query filtered on orgId alone cannot
    // use an index where orgId sits in a trailing position.
    await this.users.createIndex({ orgId: 1, createdAt: -1 });
    await this.data.createIndex({ orgId: 1 });
    await this.events.createIndex({ orgId: 1, at: 1 });

    for (const kind of SYNC_KINDS) {
      const col = this.cols[kind];
      // One row per item per workspace. The unique key is what makes a push
      // idempotent: replaying it upserts the same row instead of duplicating.
      await col.createIndex({ wsId: 1, id: 1 }, { unique: true });
      // The delta query is exactly this: one workspace, everything past a
      // cursor, in cursor order.
      await col.createIndex({ wsId: 1, serverAt: 1 });
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
  /*
   * Problem reports expire, because they live in the same 512 MB the customers
   * do. Single-field on a real Date, the same rule as the events TTL and the
   * tombstone TTL — expireAfterSeconds on a compound key is accepted and then
   * silently ignored.
   */
  async ensureFeedbackTTL() {
    const expireAfterSeconds = Number(process.env.FEEDBACK_RETENTION_DAYS || 90) * 86400;
    try {
      await this.feedback.createIndex({ reportedOn: 1 }, { expireAfterSeconds });
    } catch (err) {
      if (err.code === 85 || err.code === 86) {
        try {
          await this.feedback.dropIndex('reportedOn_1');
          await this.feedback.createIndex({ reportedOn: 1 }, { expireAfterSeconds });
        } catch (retryErr) {
          console.warn('Could not apply the feedback TTL index:', retryErr.message);
        }
      } else {
        console.warn('Could not apply the feedback TTL index:', err.message);
      }
    }
  }
  /*
   * Access requests age out, but only the ones that should.
   *
   * expiresOn is a real Date carried ONLY by rows we want gone — declined
   * ones, and approvals nobody used. A pending request has no such field, and
   * the TTL monitor skips non-Date values, so the queue itself is untouched.
   * Exactly the tombstone trick: the alternative, a TTL on requestedAt, would
   * quietly delete the approvals that ARE the allowlist.
   */
  async ensureAccessRequestTTL() {
    try {
      await this.accessRequests.createIndex({ expiresOn: 1 }, { expireAfterSeconds: 0 });
    } catch (err) {
      if (err.code === 85 || err.code === 86) {
        try {
          await this.accessRequests.dropIndex('expiresOn_1');
          await this.accessRequests.createIndex({ expiresOn: 1 }, { expireAfterSeconds: 0 });
        } catch (retryErr) {
          console.warn('Could not apply the access request TTL index:', retryErr.message);
        }
      } else {
        console.warn('Could not apply the access request TTL index:', err.message);
      }
    }
  }
  // One singleton document, addressed by a fixed id so it cannot fork.
  async getPlatformSettings() {
    return (await this.platform.findOne({ id: 'platform' }, { projection: { _id: 0, id: 0 } })) || {};
  }
  async updatePlatformSettings(patch) {
    await this.platform.updateOne({ id: 'platform' }, { $set: patch }, { upsert: true });
    return this.getPlatformSettings();
  }
  async getAccessRequest(email) {
    return this.accessRequests.findOne({ email }, { projection: { _id: 0 } });
  }
  async upsertAccessRequest(entry) {
    await this.accessRequests.updateOne({ email: entry.email }, { $set: entry }, { upsert: true });
    return entry;
  }
  async listAccessRequests(status) {
    return this.accessRequests
      .find(status ? { status } : {}, { projection: { _id: 0 } })
      .sort({ requestedAt: -1 })
      .toArray();
  }
  async countAccessRequests(status) {
    return this.accessRequests.countDocuments(status ? { status } : {});
  }
  async updateAccessRequest(email, patch) {
    await this.accessRequests.updateOne({ email }, { $set: patch });
    return this.getAccessRequest(email);
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
  }
  // Separate from deleteUser on purpose — see deleteAccount() below.
  async deleteWorkspace(wsId) {
    await this.data.deleteOne({ wsId });
    for (const kind of SYNC_KINDS) await this.cols[kind].deleteMany({ wsId });
  }
  async listUsers(orgId = null) {
    return this.users.find(orgId ? { orgId } : {}, { projection: { _id: 0 } }).toArray();
  }
  async getData(wsId) { return this.data.findOne({ wsId }, { projection: { _id: 0 } }); }
  async putData(wsId, doc) { await this.data.updateOne({ wsId }, { $set: doc }, { upsert: true }); }
  async stripSnapshot(wsId) {
    await this.data.updateOne({ wsId }, { $unset: { modules: '', records: '' } });
  }
  async listWorkspaceIds() {
    return (await this.data.find({}, { projection: { _id: 0, wsId: 1 } }).toArray()).map((d) => d.wsId);
  }
  /*
   * How much of the database is actually used.
   *
   * Asked of MongoDB rather than estimated from a bytes-per-record figure:
   * indexes, tombstones and the meta documents are all real storage, and an
   * estimate that ignores them is the kind of number that reads fine right up
   * until the tier fills. Falls back to reporting nothing rather than
   * guessing if the command is not permitted.
   */
  async storageStats() {
    try {
      const stats = await this.client.db(process.env.MONGODB_DB || 'crmbuilder').command({ dbStats: 1 });
      return {
        bytes: (stats.dataSize || 0) + (stats.indexSize || 0),
        dataBytes: stats.dataSize || 0,
        indexBytes: stats.indexSize || 0,
        measured: true,
        limitBytes: Number(process.env.STORAGE_LIMIT_BYTES || 512 * 1024 * 1024),
      };
    } catch (err) {
      return { bytes: null, measured: false, error: err.message, limitBytes: null };
    }
  }
  async rekeyWorkspace(fromId, toId) {
    if (fromId === toId) return 0;
    let moved = 0;
    for (const kind of SYNC_KINDS) {
      const res = await this.cols[kind].updateMany(
        { userId: fromId },
        { $set: { wsId: toId }, $unset: { userId: '' } }
      );
      moved += res.modifiedCount || 0;
    }
    await this.data.updateOne(
      { userId: fromId },
      { $set: { wsId: toId }, $unset: { userId: '' } }
    );
    return moved;
  }
  async legacyWorkspaceKeys() {
    const keys = new Set();
    for (const kind of SYNC_KINDS) {
      const rows = await this.cols[kind]
        .find({ wsId: { $exists: false } }, { projection: { _id: 0, userId: 1 } })
        .toArray();
      rows.forEach((r) => r.userId && keys.add(r.userId));
    }
    const metas = await this.data
      .find({ wsId: { $exists: false } }, { projection: { _id: 0, userId: 1 } })
      .toArray();
    metas.forEach((d) => d.userId && keys.add(d.userId));
    return [...keys];
  }

  // --- per-record items
  async getItemsByIds(kind, wsId, ids) {
    const out = [];
    // $in with tens of thousands of ids builds a query document that can pass
    // the 16 MB BSON limit; chunk it.
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      const rows = await this.cols[kind].find({ wsId, id: { $in: chunk } }, { projection: { _id: 0 } }).toArray();
      out.push(...rows);
    }
    return out;
  }
  async listItems(kind, wsId, { since = 0, includeDeleted = true } = {}) {
    const query = { wsId, serverAt: { $gt: since } };
    if (!includeDeleted) query.deletedAt = null;
    return this.cols[kind].find(query, { projection: { _id: 0 } }).sort({ serverAt: 1 }).toArray();
  }
  async putItems(kind, envelopes) {
    if (!envelopes.length) return;
    await this.cols[kind].bulkWrite(envelopes.map((e) => ({
      updateOne: { filter: { wsId: e.wsId, id: e.id }, update: { $set: e }, upsert: true },
    })), { ordered: false });
  }
  async countItems(kind, wsId) {
    return this.cols[kind].countDocuments({ wsId, deletedAt: null });
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

  /*
   * Bytes per organisation, measured with $bsonSize rather than estimated.
   *
   * records × a constant reads fine right up until the tier fills, because
   * indexes and tombstones are real storage — the same trap the whole-database
   * figure already avoids (§17). $bsonSize gives what the document actually
   * occupies, which is the number worth acting on.
   *
   * This scans both collections, so the caller caches it. At beta scale that
   * is cheap; it would not stay cheap.
   */
  async usageByOrg() {
    const totals = new Map();
    for (const kind of SYNC_KINDS) {
      const rows = await this.cols[kind].aggregate([
        {
          $group: {
            _id: '$orgId',
            /*
             * Bytes count EVERYTHING, rows count only the live ones — and the
             * asymmetry is deliberate.
             *
             * A tombstone occupies real storage, so leaving it out of `bytes`
             * would under-report exactly the thing the meter exists to catch
             * (§17). But an operator reading "226 records" for a workspace the
             * customer sees as 214 is being told something false, and after a
             * mass delete the column would stay high while the customer's
             * screen showed nothing. Do not "fix" the bytes to match.
             */
            bytes: { $sum: { $bsonSize: '$$ROOT' } },
            n: { $sum: { $cond: [{ $in: [{ $type: '$deletedAt' }, ['missing', 'null']] }, 1, 0] } },
            /*
             * And how much of `bytes` is gravestones.
             *
             * Measured, not derived from the counts: a tombstone is ~346 bytes
             * and a live record several times that, so tombstones × an average
             * is the same estimate §17 warns about, wearing a different hat.
             * $min on deletedAt dates the oldest, which is what says WHEN the
             * space comes back rather than merely that it will.
             */
            deadBytes: {
              $sum: {
                $cond: [{ $in: [{ $type: '$deletedAt' }, ['missing', 'null']] }, 0, { $bsonSize: '$$ROOT' }],
              },
            },
            oldestDeletedAt: { $min: '$deletedAt' },
          },
        },
      ]).toArray();
      for (const r of rows) {
        const key = r._id || '(none)';
        const t = totals.get(key) || { orgId: key, bytes: 0, deadBytes: 0, records: 0, modules: 0, oldestDeletedAt: null };
        t.bytes += r.bytes || 0;
        t.deadBytes += r.deadBytes || 0;
        t[kind] += r.n || 0;
        const oldest = Number(r.oldestDeletedAt);
        if (Number.isFinite(oldest) && oldest > 0) {
          t.oldestDeletedAt = t.oldestDeletedAt ? Math.min(t.oldestDeletedAt, oldest) : oldest;
        }
        totals.set(key, t);
      }
    }
    return [...totals.values()];
  }

  // --- organisations
  async createOrg(org) { await this.orgs.insertOne({ ...org }); return org; }
  async updateOrg(id, patch) {
    await this.orgs.updateOne({ id }, { $set: patch });
    return this.orgs.findOne({ id }, { projection: { _id: 0 } });
  }
  async deleteOrg(id) { await this.orgs.deleteOne({ id }); }
  async getOrg(id) { return this.orgs.findOne({ id }, { projection: { _id: 0 } }); }
  async listOrgs() { return this.orgs.find({}, { projection: { _id: 0 } }).toArray(); }
  async countOrgs() { return this.orgs.countDocuments(); }

  // --- invites
  async createInvite(invite) { await this.invites.insertOne({ ...invite }); return invite; }
  async getInvite(code) { return this.invites.findOne({ code }, { projection: { _id: 0 } }); }
  async listInvites(orgId) { return this.invites.find({ orgId }, { projection: { _id: 0 } }).toArray(); }
  async updateInvite(code, patch) {
    await this.invites.updateOne({ code }, { $set: patch });
    return this.getInvite(code);
  }

  // --- problem reports
  async createFeedback(entry) { await this.feedback.insertOne({ ...entry }); return entry; }
  async listFeedback(limit = 100) {
    return this.feedback.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(limit).toArray();
  }
  async updateFeedback(id, patch) {
    await this.feedback.updateOne({ id }, { $set: patch });
    return this.feedback.findOne({ id }, { projection: { _id: 0 } });
  }
  async countFeedbackSince(userId, since) {
    return this.feedback.countDocuments({ userId, createdAt: { $gte: since } });
  }

  // --- beta signup codes
  async createBetaCode(entry) { await this.betaCodes.insertOne({ ...entry }); return entry; }
  async getBetaCode(code) { return this.betaCodes.findOne({ code }, { projection: { _id: 0 } }); }
  async listBetaCodes() { return this.betaCodes.find({}, { projection: { _id: 0 } }).toArray(); }
  async updateBetaCode(code, patch) {
    await this.betaCodes.updateOne({ code }, { $set: patch });
    return this.getBetaCode(code);
  }
  /*
   * Take one use, or nothing.
   *
   * The cap has to hold when two people redeem the last use at the same
   * moment, so the check lives in the update's filter rather than in a read
   * before it — read-then-write would let both through.
   */
  async consumeBetaCode(code) {
    const res = await this.betaCodes.findOneAndUpdate(
      { code, $expr: { $lt: ['$useCount', '$maxUses'] } },
      { $inc: { useCount: 1 } },
      { returnDocument: 'after', projection: { _id: 0 } }
    );
    return res && (res.value || res);
  }
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
    betaAcceptedAt: u.betaAcceptedAt || 0,
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
/*
 * A ladder, not a set of independent switches.
 *
 * Each step can do everything the one below it can, plus one more thing, so
 * there is a single ordering to reason about rather than a matrix.
 *
 *   viewer       read
 *   contributor  + create and edit records
 *   member       + delete records
 *   owner        + the schema, the invites and the team
 *   platformAdmin  + the deployment
 */
const ROLES = ['platformAdmin', 'owner', 'member', 'contributor', 'viewer'];
// Roles an org owner may hand out. platformAdmin is deliberately absent — an
// org-level role must not be able to grant a deployment-level one (§5).
const TEAM_ROLES = ['owner', 'member', 'contributor', 'viewer'];

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
    /*
     * The bootstrap, narrowed.
     *
     * "The first account ever becomes platformAdmin" existed so a fresh
     * deployment is not bricked: minting a beta code needs a platform admin,
     * and becoming one needs a signup. But unconditionally, it also means that
     * whoever reaches a newly deployed URL first owns the instance — and a URL
     * is live the moment the service is, which is before its owner has
     * necessarily signed in.
     *
     * So it now applies only where it is actually needed: a deployment that
     * named its operators has already answered the question, and a stranger
     * arriving first gets an ordinary account. A deployment with no
     * ADMIN_EMAILS still hands the instance to its first visitor, because the
     * alternative there is nobody being able to administer it at all — that
     * trade is stated in DEPLOYMENT.md rather than hidden here.
     */
    const isFirst = (await store.countUsers()) === 0;
    const bootstrapAdmin = isFirst && ADMIN_EMAILS.length === 0;
    user = {
      id: uid(),
      email,
      name: name || email.split('@')[0],
      picture: picture || '',
      provider,
      role: bootstrapAdmin || ADMIN_EMAILS.includes(email) ? 'platformAdmin' : 'owner',
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

/*
 * Which workspace this caller reads and writes.
 *
 * The organisation owns the workspace, not the account — that is what lets
 * colleagues share one. Resolved from the SESSION only, never from a
 * parameter, query or body: the same rule req.scopeOrgId follows, and for the
 * same reason.
 *
 * An account with no org (only possible mid-migration) falls back to its own
 * id, so it reads its own rows rather than somebody else's.
 */
function workspaceIdFor(user) {
  return user.orgId || user.id;
}

/*
 * Who may change the shape of a workspace.
 *
 * Renaming or deleting a field changes what every record in the team means, so
 * it belongs to whoever is accountable for the workspace. Members create, edit
 * and delete records freely — that is the day-to-day work.
 */
function canEditSchema(user) {
  return user.role === 'owner' || user.role === 'platformAdmin';
}

/*
 * The workspace's name and currency are owner-only, for the same reason the
 * schema is.
 *
 * This was ungated entirely: `applyPush` checked roles for records and modules
 * and wrote settings from anybody. A view-only account could rename the team's
 * workspace and switch its currency, and the owner would see both. Proved
 * against the seeded fixture, not inferred — "RENAMED BY A VIEWER", USD to JPY,
 * nothing rejected.
 *
 * Currency is the half that matters. §23: changing it RELABELS every stored
 * amount rather than converting, across the whole team — so an external auditor
 * with read-only access could turn every dollar figure into yen for everybody.
 * That makes it a structural setting, not a preference, and it belongs beside
 * the schema rather than beside a display option.
 *
 * A separate function from canEditSchema() on purpose: the two happen to be the
 * same rule today, and naming them separately is what lets one move later
 * without silently dragging the other with it.
 */
function canEditSettings(user) {
  return user.role === 'owner' || user.role === 'platformAdmin';
}

// A viewer may read and nothing else.
function canEditRecords(user) {
  return user.role !== 'viewer';
}

/*
 * Deleting is the step a contributor does not have.
 *
 * The audit's concern was that any member can wipe the customer database one
 * record at a time, and a tombstone discards the body (§26) — so this is a
 * prevention, because there is no undo to fall back on.
 */
function canDeleteRecords(user) {
  return user.role !== 'viewer' && user.role !== 'contributor';
}

function requirePlatformAdmin(req, res, next) {
  if (req.user.role !== 'platformAdmin') return res.status(403).json({ error: 'Platform admin only' });
  next();
}

/*
 * Delete an account, and its workspace only if nobody is left to use it.
 *
 * This is the one place in the org-owned model that can destroy a whole team's
 * data. `store.deleteUser` deliberately no longer touches the workspace, so
 * removing one member of a five-person org takes the member and leaves the CRM
 * standing. The workspace goes only when its last member does, which is what
 * deleting a solo account has always meant.
 *
 * Kept as a named function rather than two calls at the call site: the two
 * calls in the wrong order, or one of them forgotten, is exactly the bug.
 */
async function deleteAccount(user) {
  // Refuses rather than deletes, and lives in here rather than at the one call
  // site, for the same reason the rest of this function does: the next caller
  // — a self-serve "delete my account" in Settings is the obvious one —
  // inherits the invariant instead of having to remember it.
  if (await wouldStrandDeployment(user)) {
    return { ok: false, reason: 'lastPlatformAdmin' };
  }
  const wsId = workspaceIdFor(user);
  await store.deleteUser(user.id);
  const remaining = user.orgId ? await store.listUsers(user.orgId) : [];
  if (!remaining.length) {
    await store.deleteWorkspace(wsId);
    /*
     * And the organisation row itself, or it lingers in the Organisations
     * table as 0 people / 0 records / 0 B — inflating the tenant count the
     * panel exists to make trustworthy. §25 built tidyVacatedOrg for exactly
     * this on the JOIN path; deleting the last member reaches the same state
     * by a different door and was missed.
     *
     * Reused rather than calling deleteOrg here, because that helper carries
     * the guard: it refuses while anybody is still a member or any work
     * remains. deleteAccount is the one function that can destroy a team's
     * data (§5), and it should not grow a second, unguarded deletion path.
     */
    await tidyVacatedOrg(user.orgId, wsId);
    return { ok: true, deletedWorkspace: true };
  }
  return { ok: true, deletedWorkspace: false, remaining: remaining.length };
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
  /*
   * An org owner may not act on a platform admin.
   *
   * Scoping by org is not enough on its own: a platform admin has an org like
   * everyone else, and its owner could demote, disable or delete them — which
   * is an org-level role reaching a deployment-level one. 404 rather than 403,
   * the same rule as every other cross-boundary answer here: the response must
   * not confirm that the account exists.
   */
  if (!req.isPlatformAdmin && target.role === 'platformAdmin') {
    res.status(404).json({ error: 'User not found' });
    return null;
  }
  return target;
}

/*
 * Nobody may remove the deployment's last platform admin.
 *
 * Not a permission question — this applies to platform admins too. There is no
 * route back: administering the instance needs a platform admin and making one
 * needs a platform admin, and the bootstrap in upsertUser only fires on an
 * empty deployment, so it cannot rescue this.
 *
 * **No current path reaches a `true` here, and that is stated rather than
 * tested.** Two guards already make stranding impossible: this route refuses
 * any action on your own account, and an org owner now 404s on a platform
 * admin — so the actor is always a *different* platform admin, which means
 * there are at least two. This is the backstop for the next route that is
 * added, not a live check, and it is written down that way so nobody deletes
 * it as dead code or writes a test that appears to cover it.
 */
async function wouldStrandDeployment(target) {
  if (target.role !== 'platformAdmin') return false;
  const admins = (await store.listUsers()).filter((u) => u.role === 'platformAdmin');
  return admins.length <= 1;
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
/*
 * Field-level merge.
 *
 * `fieldsAt` is a clock per key, carried inside `doc` so the stored shape does
 * not change. A key's clock is the moment its value last actually moved — set
 * on save for the keys that changed, and left alone for the rest.
 *
 * **A missing key means zero, not the row's clock.** That is the whole design,
 * and getting it wrong is subtle: falling back to `updatedAt` would mean a row
 * that never touched a field still claims to have set it at the moment it was
 * last saved, so an untouched stale value beats somebody's real edit. Zero
 * says "as far as this copy knows, nobody has ever edited this", which is what
 * a missing entry actually means — and it makes a partial map safe, so a
 * client that only sends clocks for what it changed is correct too.
 *
 * Ties go to the stored copy, the same rule the row-level path uses (§10), so
 * a replayed push still changes nothing.
 */
function hasFieldClocks(doc) {
  return !!(doc && doc.fieldsAt && typeof doc.fieldsAt === 'object');
}

/*
 * Field keys that must never be written onto an object.
 *
 * This is the ONE place in the codebase that does `obj[key] = value` with a
 * key the client chose, so it is the one place the guard has to be. It is
 * defence in depth rather than a fix: a probe pushing `__proto__` payloads
 * through both the create and the merge path polluted nothing, because three
 * unrelated facts happen to hold — there is no `for...in` anywhere, so an
 * inherited property is never enumerated; every other merge uses spread, which
 * *defines* rather than *assigns* and so never fires the `__proto__` setter;
 * and JSON serialisation drops the payload before it reaches storage.
 *
 * Safety that emerges from three unrelated properties is safety that a future
 * refactor removes by accident. A recursive merge here — the obvious way
 * somebody would extend this for nested field values — makes it live. Naming
 * the keys makes the guarantee local and testable instead.
 *
 * The UI cannot produce these anyway: `slug()` turns `__proto__` into `proto`.
 * Only a hand-written API call or a hand-edited backup can carry one.
 */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function mergeFields(prior, item, incomingAt) {
  const pDoc = prior.doc || {};
  const iDoc = item.doc || {};
  const pAtMap = hasFieldClocks(pDoc) ? pDoc.fieldsAt : {};
  const iAtMap = hasFieldClocks(iDoc) ? iDoc.fieldsAt : {};
  const pData = pDoc.data || {};
  const iData = iDoc.data || {};

  const keys = new Set([
    ...Object.keys(pData), ...Object.keys(iData),
    ...Object.keys(pAtMap), ...Object.keys(iAtMap),
  ]);

  const data = {};
  const fieldsAt = {};
  let tookAnything = false;
  for (const key of keys) {
    if (UNSAFE_KEYS.has(key)) continue;
    const pAt = Number(pAtMap[key]) || 0;
    const iAt = Number(iAtMap[key]) || 0;
    const takeIncoming = iAt > pAt;
    if (takeIncoming) tookAnything = true;
    const src = takeIncoming ? iData : pData;
    // A key absent from the winning side was REMOVED there — §22's purge
    // clocks its removals, so a stale copy cannot quietly put the value back.
    if (key in src) data[key] = src[key];
    const at = takeIncoming ? iAt : pAt;
    if (at) fieldsAt[key] = at;
  }

  // Nothing the incoming row carried was newer than what is stored. Skipping
  // keeps a replayed push free, and keeps `serverAt` from ticking for nothing.
  if (!tookAnything && incomingAt <= prior.updatedAt) return null;

  return {
    ...item,
    /*
     * The merged row must be at least as new as either half.
     *
     * Otherwise the copy the pusher is still holding — which predates the
     * merge and knows nothing of the other person's field — is newer than the
     * result and can be pushed straight back over it, undoing them a second
     * time.
     */
    updatedAt: Math.max(prior.updatedAt || 0, incomingAt),
    doc: { ...docShell(pDoc, iDoc), data, ...(Object.keys(fieldsAt).length ? { fieldsAt } : {}) },
  };
}

// Everything on the doc that is NOT merged per key — id, moduleId, and any
// other scalar the record carries. The incoming row wins these; they are
// identity rather than content, and a record does not change module in a way
// two people race over.
function docShell(pDoc, iDoc) {
  const { data: _id, fieldsAt: _if, ...incoming } = iDoc;
  const { data: _pd, fieldsAt: _pf, ...stored } = pDoc;
  return { ...stored, ...incoming };
}

function envelope(kind, user, item, now, prior = null) {
  const deleted = !!item.deleted;
  const updatedAt = Number(item.updatedAt) || now;
  const deletedAt = deleted ? (Number(item.deletedAt) || updatedAt) : null;
  return {
    wsId: workspaceIdFor(user),
    orgId: user.orgId || null,
    id: String(item.id),
    // Who first put this row here. Set once and carried forward, so editing
    // someone else's record does not rewrite its authorship.
    createdBy: (prior && prior.createdBy) || user.id,
    updatedBy: user.id,
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
    : { id: e.id, updatedAt: e.updatedAt, doc: e.doc, createdBy: e.createdBy || null, updatedBy: e.updatedBy || null };
}

async function applyPush(user, body) {
  const wsId = workspaceIdFor(user);
  const now = Date.now();
  const won = { modules: new Set(), records: new Set() };
  const rejected = { modules: [], records: [] };
  const mayEditSchema = canEditSchema(user);
  const mayEditRecords = canEditRecords(user);
  const mayDeleteRecords = canDeleteRecords(user);
  let touched = 0;

  // Modules first, so a module deletion that gets refused is known about
  // before this workspace's record tombstones are considered — see below.
  const refusedModuleIds = new Set();   // deletions we refused
  const absentModuleIds = new Set();    // creations we refused

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
      (await store.getItemsByIds(kind, wsId, [...byId.keys()])).map((e) => [e.id, e])
    );
    const writes = [];
    for (const [id, item] of byId) {
      const prior = existing.get(id);
      const updatedAt = Number(item.updatedAt) || now;

      /*
       * Three outcomes, not two.
       *
       * Whole-row last-write-wins is right for a tombstone and for any row
       * that carries no per-field clocks — an older client's, or one nobody
       * has edited since it was created. It is wrong for two people editing
       * different fields of the same record, which is the ordinary case it
       * used to lose: whoever pushed second overwrote the whole row.
       *
       * So when either side has a `fieldsAt` map, the row is merged key by
       * key instead of one side being skipped outright. Note this runs even
       * when the incoming row is NEWER: a newer row can still be carrying a
       * stale value for a field somebody else changed, and skipping the merge
       * on that branch is exactly how the edit would be lost.
       */
      const canMerge = kind === 'records' && prior && !prior.deletedAt && !item.deleted
        && prior.doc && item.doc && (hasFieldClocks(prior.doc) || hasFieldClocks(item.doc));

      if (!canMerge && prior && prior.updatedAt >= updatedAt) continue; // the server's copy wins

      /*
       * A member may not change the shape of the workspace.
       *
       * Refused rather than errored: the response carries the server's own
       * copy back, the client overwrites its local one with it, and the edit
       * simply un-happens. That is kinder than a failed sync that leaves the
       * two sides disagreeing, and it is the only behaviour that works for the
       * case this really exists for — someone who was an owner when they made
       * the edit offline and was demoted before reconnecting.
       */
      if (kind === 'modules' && !mayEditSchema) {
        if (prior) {
          rejected.modules.push(wireItem(prior));
          if (item.deleted) refusedModuleIds.add(id);
        } else {
          // A module they created locally that never reached the server. There
          // is nothing to restore, so the honest answer is that it does not
          // exist — and its records have nowhere to live either.
          rejected.modules.push({ id, updatedAt: now, deleted: true, deletedAt: now, absent: true });
          absentModuleIds.add(id);
        }
        continue;
      }

      /*
       * A viewer may not write, and a contributor may not delete.
       *
       * The same shape as the module refusal above and for the same reason:
       * the response carries the server's own copy back, the client overwrites
       * its local one, and the edit un-happens. The case this exists for is
       * not a poked-at hidden button — it is somebody who was a member when
       * they made the edit offline and was demoted before reconnecting.
       *
       * A refused CREATION has nothing to restore, so it is answered as absent
       * and the client purges it. Tombstoning instead would push a gravestone
       * that gets refused and reverted on every subsequent sync, forever —
       * the trap §14 already records for modules.
       */
      if (kind === 'records' && ((item.deleted && !mayDeleteRecords) || (!item.deleted && !mayEditRecords))) {
        /*
         * The refusal carries WHY.
         *
         * The client cannot work it out: this fires precisely when its idea of
         * its own role is stale — that is the whole scenario — so asking it to
         * guess produces a confident, wrong explanation. The server knows, and
         * it is the server's decision, so it says.
         */
        const reason = mayEditRecords ? 'nodelete' : 'readonly';
        if (prior) rejected.records.push({ ...wireItem(prior), reason });
        else rejected.records.push({ id, updatedAt: now, deleted: true, deletedAt: now, absent: true, reason });
        continue;
      }

      // Records belonging to a module the server just refused to create. They
      // would otherwise land pointing at a module that does not exist. Only
      // covers rows in this same push, which is the case that actually
      // happens: a module and its records go dirty together.
      if (kind === 'records' && !mayEditSchema && !item.deleted
          && item.doc && absentModuleIds.has(String(item.doc.moduleId))) {
        rejected.records.push({ id, updatedAt: now, deleted: true, deletedAt: now, absent: true });
        continue;
      }

      /*
       * ...and a record tombstone that only exists because of a module
       * deletion we just refused has to go with it. Otherwise deleting a
       * module as a member would restore the module and destroy every record
       * in it, which is worse than either outcome on its own.
       */
      if (kind === 'records' && item.deleted && prior && !prior.deletedAt
          && prior.doc && refusedModuleIds.has(String(prior.doc.moduleId))) {
        rejected.records.push(wireItem(prior));
        continue;
      }

      if (canMerge) {
        const merged = mergeFields(prior, item, updatedAt);
        if (!merged) continue; // nothing the incoming row had was newer
        writes.push(envelope(kind, user, merged, now, prior));
        /*
         * Deliberately NOT added to `won`.
         *
         * `won` is what a push must not have echoed back at it, because a row
         * is already on the device that sent it. A merged row is not what
         * they sent — it carries somebody else's field — so the pusher has to
         * receive it or their screen keeps showing the value they just lost.
         */
        continue;
      }

      writes.push(envelope(kind, user, item, now, prior));
      won[kind].add(id);
    }
    if (writes.length) await store.putItems(kind, writes);
    touched += writes.length;
  }

  // Settings stay a single small document. Last-write-wins is honest at that
  // granularity — there is no partial edit worth merging in a currency choice.
  let settingsWritten = false;
  if (body.settings && typeof body.settings === 'object') {
    const meta = (await store.getData(wsId)) || {};
    /*
     * Refused, and handed back the workspace's real settings.
     *
     * Returning the server's copy is not a courtesy — it is what stops the
     * refusal repeating forever. The pull only sends settings when
     * settingsServerAt has moved, and refusing does not move it, so a device
     * whose local settingsUpdatedAt is newer would keep winning locally and
     * re-pushing on every sync. That is §14's rule in the settings path: a
     * rejection cannot be resolved by last-write-wins, so the client is given
     * the server's value AND the server's clock to overwrite with.
     */
    if (!canEditSettings(user)) {
      rejected.settings = {
        doc: meta.settings || {},
        updatedAt: meta.settingsUpdatedAt || 0,
        reason: 'settings',
      };
    } else {
      // Exactly zero, not falsy-zero. A device that has never had settings
      // sends 0, and `Number(x) || now` would restamp that as this instant —
      // which is how a fresh device signing in used to overwrite the
      // workspace's real settings with its own defaults.
      const raw = Number(body.settingsUpdatedAt);
      const incomingAt = Number.isFinite(raw) ? raw : now;
      if (incomingAt > (meta.settingsUpdatedAt || 0)) {
        await store.putData(wsId, {
          wsId,
          orgId: user.orgId || null,
          settings: body.settings,
          settingsUpdatedAt: incomingAt,
          settingsServerAt: serverStamp(),
        });
        settingsWritten = true;
      }
    }
  }

  return { won, touched, settingsWritten, rejected };
}

/*
 * Everything past `cursor`, minus anything the caller just pushed and won:
 * echoing those back would be correct but would double the traffic of every
 * sync. Their `serverAt` still counts toward the returned cursor, which is
 * what stops them coming back on the next pull.
 */
async function pullChanges(user, cursor, won = null) {
  const wsId = workspaceIdFor(user);
  const out = { modules: [], records: [] };
  let next = cursor;

  for (const kind of SYNC_KINDS) {
    for (const e of await store.listItems(kind, wsId, { since: cursor })) {
      if (e.serverAt > next) next = e.serverAt;
      if (won && won[kind].has(e.id)) continue;
      out[kind].push(wireItem(e));
    }
  }

  const meta = (await store.getData(wsId)) || {};
  let settings = null;
  if (meta.settings && (meta.settingsServerAt || 0) > cursor) {
    settings = { doc: meta.settings, updatedAt: meta.settingsUpdatedAt || 0 };
  }
  if ((meta.settingsServerAt || 0) > next) next = meta.settingsServerAt;

  return { ...out, settings, cursor: next };
}

// Keep the counts the admin dashboard reads in step with the item rows.
async function refreshCounts(user) {
  const wsId = workspaceIdFor(user);
  const [moduleCount, recordCount] = await Promise.all([
    store.countItems('modules', wsId),
    store.countItems('records', wsId),
  ]);
  await store.putData(wsId, {
    wsId,
    orgId: user.orgId || null,
    moduleCount,
    recordCount,
    perRecord: true,
    orgOwned: true,
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
  const wsId = workspaceIdFor(user);
  const now = Date.now();
  const incoming = { modules, records };

  for (const kind of SYNC_KINDS) {
    const rows = incoming[kind];
    const stored = await store.listItems(kind, wsId, { since: 0 });
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
      writes.push(envelope(kind, user, { id, updatedAt, doc }, now, prior));
    }
    for (const e of stored) {
      if (seen.has(e.id) || e.deletedAt) continue;
      writes.push(envelope(kind, user, { id: e.id, updatedAt: Math.max(now, e.updatedAt + 1), deleted: true }, now, e));
    }
    if (writes.length) await store.putItems(kind, writes);
  }

  if (settings && typeof settings === 'object') {
    await store.putData(wsId, {
      wsId,
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
    // The legacy snapshot is keyed by the account, which is where it was
    // written; the rows that come out of it are keyed by the workspace.
    const meta = await store.getData(user.id);
    if (!meta || meta.perRecord) continue;

    const modules = Array.isArray(meta.modules) ? meta.modules : [];
    const records = Array.isArray(meta.records) ? meta.records : [];
    const now = Number(meta.updatedAt) || Date.now();
    const owner = { id: user.id, orgId: meta.orgId || user.orgId || null };
    const wsId = workspaceIdFor(owner);

    for (const [kind, rows] of [['modules', modules], ['records', records]]) {
      const writes = rows
        .filter((doc) => doc && doc.id)
        .map((doc) => envelope(kind, owner, { id: doc.id, updatedAt: Number(doc.updatedAt) || now, doc }, now));
      if (writes.length) await store.putItems(kind, writes);
    }

    await store.putData(wsId, {
      wsId,
      orgId: owner.orgId,
      settings: meta.settings || {},
      settingsUpdatedAt: now,
      settingsServerAt: serverStamp(),
      moduleCount: modules.length,
      recordCount: records.length,
      perRecord: true,
      orgOwned: true,
      updatedAt: now,
    });
    // Only once the rows are safely written — the arrays are the sole copy
    // until that point.
    await store.stripSnapshot(user.id);
    if (wsId !== user.id) await store.deleteWorkspace(user.id);
    migrated += 1;
  }

  if (migrated) console.log(`Split ${migrated} workspace(s) into per-record rows`);
}

/*
 * Hand account-keyed workspaces over to the organisation that owns them.
 *
 * This is what makes a workspace shareable: `modules` and `records` were keyed
 * by userId, so two colleagues in one org had two separate workspaces however
 * much the org grouped them. Idempotent, and a no-op on a deployment that has
 * nothing left keyed the old way.
 *
 * Safe to do as a straight rename because org↔user is 1:1 today — a user's
 * orgId is set once at signup and nothing can change it. If that ever stops
 * being true before this has run, two workspaces would silently merge into one,
 * so it refuses rather than guesses.
 */
async function migrateToOrgWorkspaces() {
  const legacyKeys = await store.legacyWorkspaceKeys();
  if (!legacyKeys.length) return;

  const users = await store.listUsers();
  const byId = new Map(users.map((u) => [u.id, u]));

  const orgCounts = new Map();
  users.forEach((u) => u.orgId && orgCounts.set(u.orgId, (orgCounts.get(u.orgId) || 0) + 1));
  const shared = [...orgCounts].filter(([, n]) => n > 1).map(([orgId]) => orgId);
  if (shared.length) {
    console.error(
      `Refusing to move workspaces to organisations: ${shared.length} organisation(s) already have more than one member, `
      + 'so this would merge separate workspaces together. Resolve by hand before upgrading.'
    );
    return;
  }

  let moved = 0;
  let rows = 0;
  for (const key of legacyKeys) {
    const user = byId.get(key);
    if (!user) {
      // Rows for an account that no longer exists. Leaving them keyed the old
      // way is harmless — nothing reads them — and deleting data during a
      // migration is not a decision to make automatically.
      console.warn(`Skipping workspace ${key}: no such account.`);
      continue;
    }
    if (!user.orgId) {
      console.warn(`Skipping workspace ${key}: account has no organisation.`);
      continue;
    }
    const before = await Promise.all(SYNC_KINDS.map((k) => store.countItems(k, key)));
    rows += await store.rekeyWorkspace(key, user.orgId);
    // Count the rows back out the other side before calling it done, the same
    // verify-before-trust order used everywhere else data moves in this app.
    const after = await Promise.all(SYNC_KINDS.map((k) => store.countItems(k, user.orgId)));
    for (let i = 0; i < SYNC_KINDS.length; i += 1) {
      if (after[i] < before[i]) {
        throw new Error(`Workspace ${key}: ${SYNC_KINDS[i]} moved ${after[i]} of ${before[i]} rows`);
      }
    }
    await store.putData(user.orgId, { orgOwned: true });
    moved += 1;
  }

  if (moved) console.log(`Moved ${moved} workspace(s) (${rows} rows) to their organisation`);
}

// ------------------------------------------------------------------- app
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render terminates TLS at the proxy

/*
 * Count what goes out, without paying for the counting.
 *
 * Free-tier egress is a monthly allowance and nothing here could see it until
 * now. The count is application body bytes — TLS framing and headers are not
 * in it, so it is a lower bound and is labelled as one.
 *
 * It must NEVER write to the database per response. A counter that persisted
 * on every request would generate more storage traffic than the thing it is
 * measuring, on the same 512 MB the customers use. So it accumulates in memory
 * and flushes on an interval; a crash costs at most one interval's bytes,
 * which is the right trade.
 */
const EGRESS_LIMIT_BYTES = Number(process.env.EGRESS_LIMIT_BYTES || 5 * 1024 * 1024 * 1024);
const EGRESS_FLUSH_MS = Number(process.env.EGRESS_FLUSH_MS || 60000);
// A burst is written out before the interval is up, so a single large download
// is not sitting only in memory when the process goes away.
const EGRESS_FLUSH_BYTES = Number(process.env.EGRESS_FLUSH_BYTES || 256 * 1024);
let egressPending = 0;      // bytes counted but not yet written
let egressFlushAt = 0;      // when we last wrote

const monthKey = (at = Date.now()) => new Date(at).toISOString().slice(0, 7);

async function flushEgress(force = false) {
  const now = Date.now();
  if (!egressPending) return;
  if (!force && egressPending < EGRESS_FLUSH_BYTES && now - egressFlushAt < EGRESS_FLUSH_MS) return;
  const bytes = egressPending;
  egressPending = 0;
  egressFlushAt = now;
  try {
    const p = await store.getPlatformSettings();
    const month = monthKey(now);
    // A new month starts from this flush, not from zero-plus-history.
    const base = p.egressMonth === month ? (p.egressBytes || 0) : 0;
    await store.updatePlatformSettings({ egressMonth: month, egressBytes: base + bytes });
  } catch (err) {
    // Put them back rather than losing the count to a transient write failure.
    egressPending += bytes;
    console.warn('Could not record egress:', err.message);
  }
}

app.use((req, res, next) => {
  const write = res.write.bind(res);
  const end = res.end.bind(res);
  const size = (chunk) => (chunk ? Buffer.byteLength(chunk, typeof chunk === 'string' ? 'utf8' : undefined) : 0);
  res.write = (chunk, ...rest) => { egressPending += size(chunk); return write(chunk, ...rest); };
  res.end = (chunk, ...rest) => {
    if (typeof chunk !== 'function') egressPending += size(chunk);
    // Fire-and-forget, after the response has been handed over.
    flushEgress().catch(() => {});
    return end(chunk, ...rest);
  };
  next();
});

/*
 * Write the tail out before the process goes.
 *
 * Render's free tier spins down after ~15 minutes idle and sends SIGTERM to do
 * it, so without this every sleep would lose whatever had been counted since
 * the last flush — which on a quiet service is most of it, and the monthly
 * figure would read far too low to be worth having.
 */
let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    // Bounded: a slow database must not stop the process exiting.
    await Promise.race([
      flushEgress(true).catch(() => {}),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
    process.exit(0);
  });
}

/*
 * Security headers.
 *
 * Hand-rolled rather than `helmet`, for the reason the whole audit keeps
 * returning to: four production dependencies is an asset on a shared free tier,
 * and this is a dozen lines that do not need a supply chain behind them.
 *
 * CSP is the one with teeth. `script-src 'self'` is only possible because
 * Phase 4 removed the two inline `onclick` handlers and moved index.html's
 * inline <script> into js/boot-icons.js — with either still present, every
 * page would break the moment this shipped.
 *
 * `style-src` keeps 'unsafe-inline' and that is a deliberate compromise, not
 * an oversight: 14 inline `style=` attributes carry genuinely dynamic values
 * (a module's colour, a meter's width). Inline *style* cannot execute script,
 * so the trade buys most of the protection for none of the churn. Moving them
 * to CSS custom properties would close it, and is not worth doing today.
 *
 * The legal pages get the same headers — they are the ones a stranger reaches
 * first, and they load no app JS at all (§19).
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  // Nothing here is meant to be framed, and this is the modern half of the
  // X-Frame-Options pair below.
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  // The app only ever talks to its own origin: Google is contacted
  // server-to-server, never from the page.
  "connect-src 'self'",
  "form-action 'self'",
].join('; ');

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Redundant with frame-ancestors for modern browsers, and the only thing
  // older ones understand.
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Deny the powerful features outright — none are used, and a stolen script
  // should not be able to reach for them.
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // Only meaningful over TLS, and only true once the deployment is HTTPS-only.
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});

/*
 * Body limits, per route rather than one global maximum.
 *
 * A sync push legitimately carries a whole workspace, so it needs room. Every
 * other endpoint takes a short JSON object, and letting all of them accept 8 MB
 * hands an unauthenticated caller a cheap way to make the process allocate.
 * The small limit is the default; the two sync routes opt into the large one.
 */
const SYNC_BODY_LIMIT = process.env.SYNC_BODY_LIMIT || '8mb';
const bigJson = express.json({ limit: SYNC_BODY_LIMIT });
app.use('/api/sync', bigJson);
app.use('/api/data', bigJson);
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());

/*
 * Rate limiting, in memory and deliberately narrow.
 *
 * In memory means per instance. On a single free-tier service that is the
 * whole deployment, so it is honest; on a multi-instance one the effective
 * limit multiplies by the instance count. Say that rather than implying a
 * global guarantee — a shared counter needs a round trip to Mongo on every
 * request, which costs more than the attack it prevents at this size.
 *
 * WHERE IT IS NOT APPLIED MATTERS MORE THAN WHERE IT IS. /api/sync is left
 * alone on purpose: a client with a large workspace, or one coming back from
 * a week offline, legitimately pushes hard, and a limiter there turns a slow
 * sync into lost work. The endpoints below are the ones an anonymous or
 * barely-authenticated caller can hammer for free.
 */
const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 60000);
const rateBuckets = new Map();

setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  for (const [key, hits] of rateBuckets) {
    const live = hits.filter((t) => t > cutoff);
    if (live.length) rateBuckets.set(key, live);
    else rateBuckets.delete(key);
  }
}, RATE_WINDOW_MS).unref();

function rateLimit(name, max) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${name}:${req.ip || 'unknown'}`;
    const hits = (rateBuckets.get(key) || []).filter((t) => t > now - RATE_WINDOW_MS);
    if (hits.length >= max) {
      authFailure('rate_limited', { reason: name }, req);
      res.setHeader('Retry-After', Math.ceil(RATE_WINDOW_MS / 1000));
      return res.status(429).json({ error: 'Too many requests. Give it a minute.' });
    }
    hits.push(now);
    rateBuckets.set(key, hits);
    return next();
  };
}

/*
 * Where this is applied, and — more importantly — where it is NOT.
 *
 * `/api/access-request` is the one that earns it: anyone who has just been
 * refused can post one, and without a per-caller bound the queue an operator
 * works by hand is trivially floodable. The 500-row ceiling is a backstop, not
 * a rate.
 *
 * `/auth/google/callback` gets a generous bound, and for one specific reason:
 * every call makes the server perform a token exchange with Google. That is
 * outbound work an anonymous caller can trigger, so it is worth capping — but
 * it is NOT brute-force protection, because there is nothing to guess. A
 * caller without a valid Google `code` and a matching state cookie fails at
 * the first check, for free.
 *
 * NOT applied to `/auth/dev`. It 404s in production, so limiting it protects
 * nothing real and throttles the seam every test drives — the tests hammer it
 * far harder than any human, and a limit tuned to let them through would be
 * too loose to matter anyway.
 *
 * NOT applied to sign-in generally, because THERE IS NO PASSWORD HERE. Google
 * owns authentication. The beta and invite codes are the only guessable
 * secrets, and trying one costs a full OAuth round trip (§20) — the flow is
 * its own rate limiter.
 *
 * NOT applied to `/api/sync`: a client with a large workspace, or one back
 * from a week offline, legitimately pushes hard, and throttling that turns a
 * slow sync into lost work.
 */
app.use('/auth/google/callback', rateLimit('auth', Number(process.env.RATE_AUTH_MAX || 60)));
app.use('/api/access-request', rateLimit('ask', Number(process.env.RATE_ASK_MAX || 5)));

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

/*
 * How full the database is, and how worried to be.
 *
 * Measured, not enforced. A hard cap that fires during a bug hunt looks like
 * the bug the tester was chasing, and you end up debugging your own limiter
 * rather than the product. The job of these numbers is to be looked at before
 * that becomes a decision.
 */
/*
 * The three limits this deployment can actually hit, and what each meter is
 * worth. Levels are shared so the panel and the alerts agree by construction.
 */
const RAM_LIMIT_BYTES = Number(process.env.RAM_LIMIT_BYTES || 512 * 1024 * 1024);
let rssHighWater = 0;

function meter(bytes, limit, warn, critical) {
  const pct = limit && bytes != null ? Math.round((bytes / limit) * 1000) / 10 : null;
  return {
    bytes,
    limitBytes: limit,
    percent: pct,
    level: pct == null ? 'unknown' : pct >= critical ? 'critical' : pct >= warn ? 'warn' : 'ok',
  };
}

/*
 * RSS is a point sample, taken whenever this is called — which in practice is
 * the /health ping, every 14 minutes.
 *
 * So it catches a LEAK, not a burst: slow growth over hours trips it, and the
 * sudden allocation that actually OOM-kills the container happens between
 * pings and is never seen. The high-water mark is kept so the panel can show
 * the worst observed rather than the last glance, but it does not change what
 * this can promise. Do not present it as protection against an OOM kill.
 */
function ramReport() {
  const rss = process.memoryUsage().rss;
  if (rss > rssHighWater) rssHighWater = rss;
  return { ...meter(rss, RAM_LIMIT_BYTES, 70, 85), peakBytes: rssHighWater, sampledAt: Date.now() };
}

async function egressReport() {
  const p = await store.getPlatformSettings().catch(() => ({}));
  const month = monthKey();
  // Anything counted since the last flush belongs to the figure on screen,
  // otherwise the panel reads a minute behind for no reason.
  const stored = p.egressMonth === month ? (p.egressBytes || 0) : 0;
  return {
    ...meter(stored + egressPending, EGRESS_LIMIT_BYTES, 60, 85),
    month,
    // Application body bytes only — TLS framing and headers are not counted,
    // so the real figure Render bills is higher than this.
    measures: 'response bodies',
  };
}

async function usageReport() {
  const stats = await store.storageStats().catch(() => ({ bytes: null, measured: false }));
  const totals = await store.dataStats(null);
  const limit = stats.limitBytes || null;
  const pct = limit && stats.bytes != null ? Math.round((stats.bytes / limit) * 1000) / 10 : null;
  return {
    ...stats,
    workspaces: totals.workspaces,
    records: totals.records,
    modules: totals.modules,
    percentOfLimit: pct,
    // 60 is "start thinking", 85 is "do something this week". Neither stops
    // anybody from using the product.
    level: pct == null ? 'unknown' : pct >= 85 ? 'critical' : pct >= 60 ? 'warn' : 'ok',
  };
}

/*
 * Alerts — tell the operator before they think to look.
 *
 * There is no scheduler in this process and none is needed: UptimeRobot hits
 * /health every 14 minutes to keep the free tier awake (§17), so the rules are
 * evaluated off the back of that. **After the response, never blocking it**,
 * and the response body is not changed at all — an anonymous ping gets exactly
 * what it got before.
 *
 * Note this runs for ANY caller, not only a platform admin. The detail check
 * on /health is about what the body *discloses*; evaluating is not disclosing,
 * and gating it behind an authenticated caller would mean the keep-warm ping —
 * the only regular caller there is — never triggered anything.
 *
 * ESCALATE-ONLY. Each rule remembers the level it last fired at, so crossing
 * 60% notifies once and then stays quiet until 85%. Dropping back below
 * re-arms it. A rule that fired every fourteen minutes would train the
 * operator to ignore the channel, and an ignored alert is worse than none.
 */
const SIGNUP_SPIKE_PER_HOUR = Number(process.env.SIGNUP_SPIKE_PER_HOUR || 10);
const TENANT_SHARE_LIMIT = Number(process.env.TENANT_SHARE_LIMIT || 25);
const ALERT_MIN_GAP_MS = Number(process.env.ALERT_MIN_GAP_MS || 5 * 60 * 1000);
let lastAlertRun = 0;

// The highest crossed step, or null. Steps are ascending.
function crossedStep(percent, steps) {
  if (percent == null) return null;
  let hit = null;
  for (const step of steps) if (percent >= step) hit = step;
  return hit;
}

async function collectAlerts() {
  const out = [];
  const [usage, ram, egress] = await Promise.all([usageReport(), ramReport(), egressReport()]);

  out.push({
    rule: 'storage',
    step: crossedStep(usage.percentOfLimit, [60, 85, 95]),
    say: (step) => `Database at ${usage.percentOfLimit}% of ${fmtSize(usage.limitBytes)} (crossed ${step}%). ${usage.records} records across ${usage.workspaces} workspaces.`,
  });
  out.push({
    rule: 'ram',
    step: crossedStep(ram.percent, [70, 85]),
    say: (step) => `Memory at ${ram.percent}% of ${fmtSize(ram.limitBytes)} (crossed ${step}%). Sampled on a health ping, so this is slow growth rather than a spike.`,
  });
  out.push({
    rule: 'egress',
    step: crossedStep(egress.percent, [60, 85]),
    say: (step) => `Bandwidth at ${egress.percent}% of ${fmtSize(egress.limitBytes)} for ${egress.month} (crossed ${step}%). Counts response bodies only, so the billed figure is higher.`,
  });

  // Signups in the last hour. Cheap: the events collection is already indexed
  // by time and the window is one day.
  try {
    const since = Date.now() - 3600000;
    const recent = (await store.eventsSince(1)).filter((e) => e.type === 'signup' && e.at >= since);
    out.push({
      rule: 'signups',
      step: recent.length >= SIGNUP_SPIKE_PER_HOUR ? SIGNUP_SPIKE_PER_HOUR : null,
      say: () => `${recent.length} signups in the last hour (threshold ${SIGNUP_SPIKE_PER_HOUR}). Worth a look at Admin → Accounts before it becomes storage.`,
    });
  } catch { /* an alert that cannot be computed is not an alert */ }

  // One tenant dominating the shared database.
  try {
    const byOrg = await store.usageByOrg();
    const total = byOrg.reduce((a, o) => a + o.bytes, 0);
    const top = byOrg.sort((a, b) => b.bytes - a.bytes)[0];
    const share = total && top ? Math.round((top.bytes / total) * 1000) / 10 : 0;
    out.push({
      rule: 'tenant',
      step: share >= TENANT_SHARE_LIMIT ? TENANT_SHARE_LIMIT : null,
      say: () => `One organisation holds ${share}% of the database (${fmtSize(top.bytes)}). Pausing it is reversible; deleting is not.`,
    });
  } catch { /* same */ }

  return out;
}

function fmtSize(n) {
  if (n == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = Number(n);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

async function evaluateAlerts({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastAlertRun < ALERT_MIN_GAP_MS) return [];
  lastAlertRun = now;

  const settings = await store.getPlatformSettings();
  const state = { ...(settings.alerts || {}) };
  const rules = await collectAlerts();
  const fired = [];
  let changed = false;

  for (const { rule, step, say } of rules) {
    const was = state[rule] ? state[rule].step : null;
    if (step && step > (was || 0)) {
      // Crossed a step it has not announced. Escalations get through; a
      // repeat of the same level does not.
      fired.push({ rule, step, text: say(step) });
      state[rule] = { step, at: now };
      changed = true;
    } else if (!step && was) {
      // Back under the lowest threshold — re-arm so it can speak again.
      state[rule] = { step: null, at: now };
      changed = true;
    }
  }

  if (changed) await store.updatePlatformSettings({ alerts: state }).catch(() => {});
  if (fired.length) notifyAlerts(fired);
  return fired;
}

function notifyAlerts(fired) {
  if (!FEEDBACK_WEBHOOK_URL) return;
  const head = fired.length === 1 ? 'CRM Builder alert' : `CRM Builder — ${fired.length} alerts`;
  const lines = fired.map((f) => `• ${f.text}`);
  const req = webhookRequest(FEEDBACK_WEBHOOK_URL, {
    rich: [`**${head}**`, ...lines].join('\n'),
    plain: [head, ...lines].join('\n'),
  });
  if (req.error) {
    console.warn(`Alert not sent: ${req.error}`);
    return;
  }
  fetch(req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body),
    signal: AbortSignal.timeout(8000),
  }).then((r) => {
    if (!r.ok) console.warn(`Alert webhook rejected the notification: HTTP ${r.status}`);
  }).catch((err) => console.warn('Alert webhook failed:', err.message));
}

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
      body.usage = await usageReport();
      body.signupMode = await signupMode();
    } catch (err) {
      // A health check that fails because a count failed is worse than one
      // that reports the outage it was asked about.
      body.ok = false;
      body.error = err.message;
    }
  }

  res.status(body.ok ? 200 : 503).json(body);

  /*
   * After the response, and for every caller.
   *
   * The detail check above is about what the body DISCLOSES; evaluating is not
   * disclosing. Gating this on an authenticated caller would mean the
   * keep-warm ping — the only regular caller there is — never triggered
   * anything, which is the entire mechanism.
   *
   * Rate-limited in evaluateAlerts, so a burst of pings costs one pass.
   */
  evaluateAlerts().catch((err) => console.warn('Alert evaluation failed:', err.message));
});

/*
 * Prove the wiring without waiting for a threshold.
 *
 * `force` skips the rate limit and reports what each rule currently sees, so
 * the operator can tell "nothing is wrong" apart from "the webhook has been
 * broken since I rotated the URL" — which are otherwise the same silence.
 */
app.post('/api/admin/alerts/test', requireAuth, requirePlatformAdmin, async (req, res) => {
  const rules = await collectAlerts();
  const settings = await store.getPlatformSettings();
  notifyAlerts([{ rule: 'test', step: 0, text: `Test alert from ${APP_URL}. If you can read this, alerts will reach you.` }]);
  res.json({
    ok: true,
    webhookConfigured: !!FEEDBACK_WEBHOOK_URL,
    rules: rules.map((r) => ({ rule: r.rule, crossed: r.step, saying: r.step ? r.text || r.say(r.step) : null })),
    armed: settings.alerts || {},
  });
});

/*
 * One line per authentication failure, on stdout where the host collects it.
 *
 * There was no record of any of this: a refused signup, a state mismatch and a
 * disabled account all redirected silently, so a burst of them was invisible
 * unless somebody happened to be watching the panel. Alerting on a spike (§25)
 * needs the spike to leave a trace first.
 *
 * What is deliberately NOT logged: the beta code, the invite code, the OAuth
 * state and the session token — all bearer credentials (§13, §16), and a log
 * line is the wrong place for any of them. The email is included because it is
 * the only thing that makes a burst diagnosable, and it is already stored on
 * the account.
 */
function authFailure(kind, detail, req) {
  const parts = [`[auth] ${kind}`];
  if (detail && detail.email) parts.push(`email=${detail.email}`);
  if (detail && detail.reason) parts.push(`reason=${detail.reason}`);
  // `trust proxy` is 1, so this is the real client address rather than Render's
  // edge. A coarse signal for "many failures from one place", not an identity.
  parts.push(`ip=${(req && req.ip) || 'unknown'}`);
  console.warn(parts.join(' '));
}

// ---- OAuth (Google)
app.get('/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(404).send('Google OAuth is not configured');
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('crmb_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: 600000 });
  /*
   * Carry the beta code across the round trip to Google in an httpOnly cookie,
   * beside the state nonce and for the same reason: it has to come back to us
   * unmodified, and it must not be readable by script. It is NOT validated
   * here — validation happens in the callback, against the email Google
   * actually returns, because only then do we know whether this is a signup at
   * all.
   */
  const beta = String(req.query.beta || '').slice(0, 128);
  if (beta) {
    res.cookie(BETA_COOKIE, beta, { httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: 600000 });
  } else {
    res.clearCookie(BETA_COOKIE);
  }
  const invite = String(req.query.invite || '').slice(0, 128);
  if (invite) {
    res.cookie(INVITE_COOKIE, invite, { httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: 600000 });
  } else {
    res.clearCookie(INVITE_COOKIE);
  }
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
      authFailure('oauth_state', { reason: !state ? 'missing' : 'mismatch' }, req);
      return res.redirect('/?auth_error=state');
    }
    res.clearCookie('crmb_oauth_state');
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
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
    const infoRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const info = await infoRes.json();
    if (!info.email) throw new Error('no email from Google');

    /*
     * An unverified address must not reach upsertUser.
     *
     * Accounts are matched by email and nothing else, so an address the holder
     * has not proved they control is an account-takeover vector: sign in with
     * somebody else's address, get handed their workspace. Google normally
     * only ever reports verified addresses, which is exactly why this was easy
     * to leave out.
     *
     * Rejects a stated false; does NOT reject absence. Those are different
     * facts, and the failure modes are asymmetric — a stated false is the
     * attack, while absence means Google renamed a field, and failing closed
     * on that would lock every user out of a working CRM for a reason nobody
     * could diagnose from the outside. Absence is logged loudly instead.
     */
    if (info.verified_email === false || info.email_verified === false) {
      authFailure('oauth_unverified_email', { email: info.email }, req);
      return res.redirect('/?auth_error=unverified');
    }
    if (info.verified_email === undefined && info.email_verified === undefined) {
      console.warn(
        '[auth] Google userinfo carried no verified_email field — cannot confirm '
        + 'the address was verified. If this is not a one-off, the userinfo '
        + 'contract has changed and this check needs revisiting.'
      );
    }

    // Authenticated by Google, but not yet allowed to exist here.
    const gate = await checkSignup(info.email, req.cookies[BETA_COOKIE], req.cookies[INVITE_COOKIE]);
    res.clearCookie(BETA_COOKIE);
    res.clearCookie(INVITE_COOKIE);
    if (!gate.ok) {
      authFailure('signup_refused', { email: info.email, reason: gate.reason }, req);
      offerToAsk(res, info.email, info.name);
      return res.redirect(`/?auth_error=${gate.reason}`);
    }
    clearAskCookie(res);

    const user = await upsertUser({ email: info.email, name: info.name, picture: info.picture, provider: 'google' });
    if (user.disabled) {
      authFailure('disabled_account', { email: info.email }, req);
      return res.redirect('/?auth_error=disabled');
    }
    // Only now, with an account that actually exists. A use burnt on a failed
    // token exchange is a tester who cannot get in and a code that says it was
    // redeemed.
    if (gate.consume) await gate.consume();
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

  // The same gate as the Google path. Correct in its own right, and the reason
  // any of this is testable: the OAuth callback cannot be driven from a test,
  // and this is the seam that can.
  /*
   * Coerce before these reach a store lookup.
   *
   * checkSignup passes them to getBetaCode / getInvite, which build filters as
   * { code } shorthand — so an object like {"$ne": null} arriving in the body
   * would be handed to MongoDB as an operator and could match a code the
   * caller never had. Route params and cookies are strings already; a JSON
   * body is the one place a non-string can get in.
   *
   * Dev-only route, so this is defence in depth rather than a live hole. It is
   * also the seam every signup test drives, which is the other reason it has
   * to behave exactly like the Google path.
   */
  const beta = typeof req.body.beta === 'string' ? req.body.beta : '';
  const invite = typeof req.body.invite === 'string' ? req.body.invite : '';
  // Not a filter, so not injection — but it is stored as the account's name
  // and rendered on the admin screen, and an object there becomes the string
  // "[object Object]" for a person nobody can then identify.
  const name = String(req.body.name || '').slice(0, 200);
  const gate = await checkSignup(email, beta, invite);
  if (!gate.ok) {
    authFailure('signup_refused', { email, reason: gate.reason }, req);
    // Same seam as the Google path: the refusal is what hands over the right
    // to ask. Without this the request flow would only be reachable through
    // OAuth, which no test can drive.
    offerToAsk(res, email, name);
    return res.status(403).json({
      error: gate.reason === 'closed' ? 'Signups are closed right now.' : SIGNUP_REJECTION,
      reason: gate.reason,
    });
  }
  clearAskCookie(res);

  const user = await upsertUser({ email, name, provider: 'dev' });
  if (user.disabled) {
    authFailure('disabled_account', { email }, req);
    return res.status(403).json({ error: 'Account disabled' });
  }
  if (gate.consume) await gate.consume();
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
    org = {
      id: user.orgId,
      name: record ? record.name : '',
      memberCount: members.length,
      // Enough to put a name next to a record's author. Only ever the caller's
      // own org, and only the fields a teammate would see on the Team screen.
      members: members.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role })),
    };
  }
  res.json({
    authenticated: !!user,
    user: user ? publicUser(user) : null,
    org,
    googleEnabled: !!GOOGLE_CLIENT_ID,
    devLoginEnabled: DEV_LOGIN,
    signupMode: await signupMode(),
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

  /*
   * A suspended organisation is read-only, not cut off.
   *
   * The pull still runs, so everyone keeps the data they already had and picks
   * up anything a colleague synced before the pause. Only the push is refused,
   * and it is refused with a reason the client can put on screen — a sync that
   * silently stopped working would be indistinguishable from the bug the
   * tester was about to report.
   *
   * Nothing is deleted here, ever. deleteAccount stays the only thing that can
   * remove a workspace (§5), and suspension has to be one undo away.
   */
  const org = req.user.orgId ? await store.getOrg(req.user.orgId) : null;
  if (org && org.suspendedAt) {
    const out = await pullChanges(req.user, since, { modules: new Set(), records: new Set() });
    return res.json({
      ...out,
      readOnly: true,
      readOnlyReason: org.suspendedReason || 'This workspace is paused. Nothing has been deleted.',
    });
  }

  const { won, touched, settingsWritten, rejected } = await applyPush(req.user, body);
  const out = await pullChanges(req.user, since, won);
  if (touched || settingsWritten) {
    await refreshCounts(req.user);
    store.addEvent('sync', req.user.id, req.user.orgId).catch(() => {});
  }
  // Settings counts too. Counting only the two arrays dropped a settings-only
  // refusal on the floor: the write was correctly blocked, and the client was
  // told nothing — so it kept its newer local copy and re-pushed for ever.
  const refused = rejected.modules.length + rejected.records.length + (rejected.settings ? 1 : 0);
  res.json({
    ...out,
    pushed: touched,
    // Present only when something was actually refused, so the client can treat
    // its absence as "nothing to explain" rather than having to count.
    ...(refused ? { rejected: { ...rejected, reason: 'owner-only' } } : {}),
    serverTime: Date.now(),
  });
});

// ---- whole-snapshot sync (legacy)
// Still served so a client running cached older JS keeps working through a
// deploy. Both paths read and write the same per-record rows.
app.get('/api/data', requireAuth, async (req, res) => {
  const wsId = workspaceIdFor(req.user);
  const meta = await store.getData(wsId);
  const [modules, records] = await Promise.all([
    store.listItems('modules', wsId, { since: 0, includeDeleted: false }),
    store.listItems('records', wsId, { since: 0, includeDeleted: false }),
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
  const meta = await store.getData(workspaceIdFor(req.user));
  res.json({ ok: true, updatedAt: meta.updatedAt, ...counts });
});

// ---- the caller's own organisation
/*
 * "I understand this is a beta."
 *
 * Recorded against the account rather than in localStorage, so it survives a
 * new device and is answerable later. The notice itself is the honest part —
 * free beta, backups are daily, export anything you care about — and storing
 * the acknowledgement is what makes it more than a claim that we showed it.
 */
app.post('/api/me/beta-accepted', requireAuth, async (req, res) => {
  const user = await store.updateUser(req.user.id, { betaAcceptedAt: Date.now() });
  res.json({ ok: true, betaAcceptedAt: user.betaAcceptedAt });
});

app.get('/api/org', requireAuth, async (req, res) => {
  if (!req.user.orgId) return res.json({ org: null });
  const org = await store.getOrg(req.user.orgId);
  if (!org) return res.json({ org: null });
  const members = await store.listUsers(org.id);
  res.json({
    org: { id: org.id, name: org.name, createdAt: org.createdAt },
    role: req.user.role,
    memberCount: members.length,
    members: members.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, disabled: !!u.disabled })),
    canInvite: req.user.role === 'owner' || req.user.role === 'platformAdmin',
  });
});

/*
 * Beta signup codes.
 *
 * A platform-level code that lets a stranger create an account, as distinct
 * from an org invite, which adds someone to a team that already exists. Kept
 * in its own collection rather than folded into `invites` because they are
 * different things that happen to look alike — the same reason `wsId` is not
 * `orgId` and `deleteUser` is not `deleteWorkspace`.
 *
 * Multi-use with a cap, so one code covers one batch of testers.
 */
function betaCodeState(entry, now = Date.now()) {
  if (!entry) return 'invalid';
  if (entry.revokedAt) return 'revoked';
  if (entry.expiresAt && entry.expiresAt < now) return 'expired';
  if (entry.useCount >= entry.maxUses) return 'spent';
  return 'valid';
}

function publicBetaCode(entry) {
  return {
    code: entry.code,
    label: entry.label || '',
    maxUses: entry.maxUses,
    useCount: entry.useCount,
    remaining: Math.max(0, entry.maxUses - entry.useCount),
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
    revokedAt: entry.revokedAt || null,
    state: betaCodeState(entry),
  };
}

/*
 * May this email create an account right now, and at what cost?
 *
 * Returns { ok } or { ok: false, reason }. `consume` is a function the caller
 * runs ONLY once an account has actually been created — a failed token
 * exchange or an already-existing user must not burn a use.
 */
async function checkSignup(email, code, inviteCode) {
  const existing = await store.getUserByEmail(String(email).toLowerCase());
  // An account that exists is never gated. This is the whole point.
  if (existing) return { ok: true, existing };
  // The operator can always get in, whatever the mode — locking yourself out
  // of your own deployment is not a security feature.
  if (ADMIN_EMAILS.includes(String(email).toLowerCase())) return { ok: true };

  /*
   * The first account on an empty deployment is always allowed.
   *
   * Otherwise a fresh install in code mode is bricked: minting a code needs a
   * platform admin, and the only way to become one is to sign up. ADMIN_EMAILS
   * is the intended escape hatch, but a deployment where nobody set it would
   * have no way in at all. This is the same bootstrap upsertUser already
   * applies when it makes that first account a platformAdmin.
   */
  // Narrowed for the same reason as upsertUser's: with ADMIN_EMAILS set, the
  // bypass above already lets the operator create the first account, so this
  // one is not needed — and leaving it open let whoever found a newly deployed
  // URL first sign up past a `code` gate. Without ADMIN_EMAILS it is still the
  // only way in, so it stays.
  if ((await store.countUsers()) === 0 && ADMIN_EMAILS.length === 0) return { ok: true };

  /*
   * Somebody asked, and the operator said yes.
   *
   * Ordered after the three bypasses above and before the mode test, because
   * an approval is a decision about this person specifically and outranks the
   * deployment's default posture — including `closed`, which is about not
   * taking new strangers, not about reneging on an answer already given.
   *
   * The request is marked used rather than consumed: unlike a beta code there
   * is nothing to spend, and once the account exists the first bypass covers
   * them forever.
   */
  const asked = await store.getAccessRequest(String(email).toLowerCase());
  if (asked && asked.status === 'approved') {
    return { ok: true, consume: () => store.updateAccessRequest(asked.email, { usedAt: Date.now() }) };
  }

  /*
   * The org gate, ahead of the signup mode because it is a different axis:
   * `open` signups plus closed org creation has to mean "invited colleagues
   * only", and an early return on `open` would skip this entirely.
   *
   * After the approved-request bypass, though — an approval is a deliberate
   * decision about one person and outranks the deployment's default posture,
   * exactly as it does for the mode.
   */
  if ((await orgCreation()) === 'closed') {
    const invite = inviteCode ? await store.getInvite(String(inviteCode)) : null;
    // Checked, never consumed. /api/org/join spends it a moment later.
    if (inviteState(invite) !== 'valid') return { ok: false, reason: 'orgclosed' };
  }

  // Before the pending check, not after: a request left over from when this
  // deployment was gated must not keep someone out once signups are open.
  const mode = await signupMode();
  if (mode === 'open') return { ok: true };

  /*
   * A deliberate exception to "every refusal answers identically".
   *
   * That rule exists so nobody can probe which codes are real (§13, §16). It
   * does not apply here: the only way to see this answer is to have just
   * proved control of the address to Google, so it tells the caller nothing
   * they did not already know. Without it, someone who asked last week is told
   * again that the beta is invite-only, reads it as being ignored, and asks
   * again — which is worse for them and worse for the queue.
   *
   * Ahead of the `closed` check because it is the more specific truth: they
   * are on a list somebody can still act on, which "signups are paused" denies.
   */
  if (asked && asked.status === 'pending') return { ok: false, reason: 'pending' };

  if (mode === 'closed') {
    return { ok: false, reason: 'closed' };
  }

  const entry = code ? await store.getBetaCode(String(code)) : null;
  if (betaCodeState(entry) !== 'valid') return { ok: false, reason: 'beta' };
  // Deferred on purpose: the caller runs this only once the account exists, so
  // a failure between here and the write cannot burn a tester's only way in.
  // No test reaches that path — it needs a database fault mid-callback — so
  // this is a deliberate, unguarded ordering rather than a proven one.
  return { ok: true, consume: () => store.consumeBetaCode(entry.code) };
}

/*
 * Invites.
 *
 * There is no email sending in this product, so an invite is a link the owner
 * copies and sends however they already talk to their colleague. That makes
 * the code a bearer credential, and it is treated like one: high entropy,
 * single use, short-lived, revocable, and never written to a log.
 *
 * Every failure — unknown, expired, spent, revoked — answers identically, so
 * the endpoint cannot be used to find out which codes exist.
 */
const INVITE_TTL_DAYS = Number(process.env.INVITE_TTL_DAYS || 7);
const INVITE_REJECTION = 'That invite link is not valid. Ask for a fresh one.';

function inviteState(invite, now = Date.now()) {
  if (!invite) return 'invalid';
  if (invite.revokedAt) return 'revoked';
  if (invite.usedAt) return 'used';
  if (invite.expiresAt && invite.expiresAt < now) return 'expired';
  return 'valid';
}

function publicInvite(invite, state = inviteState(invite)) {
  return {
    code: invite.code,
    role: invite.role,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
    createdBy: invite.createdBy,
    usedBy: invite.usedBy || null,
    usedAt: invite.usedAt || null,
    revokedAt: invite.revokedAt || null,
    state,
  };
}

// Only an owner of the org may hand out access to it. requireOrgAdmin already
// pins req.scopeOrgId to the caller's own org; a platform admin acting without
// one has no org to invite into, and says so rather than guessing.
function invitingOrg(req, res) {
  const orgId = req.user.orgId;
  if (!orgId) {
    res.status(400).json({ error: 'You are not in an organisation' });
    return null;
  }
  return orgId;
}

app.post('/api/org/invites', requireAuth, requireOrgAdmin, async (req, res) => {
  const orgId = invitingOrg(req, res);
  if (!orgId) return undefined;
  // Members join as members. Handing out ownership is a separate, deliberate
  // act an owner performs on someone who is already on the team.
  const invite = {
    code: crypto.randomBytes(24).toString('base64url'),
    orgId,
    role: 'member',
    createdBy: req.user.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + INVITE_TTL_DAYS * DAY_MS,
    usedBy: null,
    usedAt: null,
    revokedAt: null,
  };
  await store.createInvite(invite);
  res.json({
    invite: publicInvite(invite, 'valid'),
    // Built from APP_URL, not from a request header: a Host header is
    // attacker-controlled, and this link is about to be emailed to someone.
    url: `${APP_URL}/?invite=${invite.code}`,
  });
});

app.get('/api/org/invites', requireAuth, requireOrgAdmin, async (req, res) => {
  const orgId = invitingOrg(req, res);
  if (!orgId) return undefined;
  const invites = (await store.listInvites(orgId)).map((i) => publicInvite(i));
  invites.sort((a, b) => b.createdAt - a.createdAt);
  res.json({ invites });
});

app.delete('/api/org/invites/:code', requireAuth, requireOrgAdmin, async (req, res) => {
  const orgId = invitingOrg(req, res);
  if (!orgId) return undefined;
  const invite = await store.getInvite(req.params.code);
  // Another org's invite is not found, rather than forbidden — the same
  // reasoning as resolveTarget: a response must not confirm it exists.
  if (!invite || invite.orgId !== orgId) return res.status(404).json({ error: 'Invite not found' });
  await store.updateInvite(invite.code, { revokedAt: Date.now() });
  res.json({ ok: true });
});

// What a link says before it is redeemed, so the joiner can be told whose team
// they are about to join and what happens to their own workspace.
app.get('/api/org/invites/:code/preview', requireAuth, async (req, res) => {
  const invite = await store.getInvite(req.params.code);
  if (inviteState(invite) !== 'valid') return res.status(404).json({ error: INVITE_REJECTION });
  const org = await store.getOrg(invite.orgId);
  if (!org) return res.status(404).json({ error: INVITE_REJECTION });
  const members = await store.listUsers(org.id);
  res.json({
    org: { id: org.id, name: org.name, memberCount: members.length },
    alreadyMember: req.user.orgId === org.id,
  });
});

/*
 * The empty org a joiner leaves behind.
 *
 * Every signup mints an organisation, so somebody who created an account only
 * to accept a team invite leaves a placeholder shell the moment they join. It
 * is never seen again, and it inflates the tenant count the operator panel is
 * there to make trustworthy.
 *
 * Removed only when it is provably a shell, and the guard is deliberately
 * stricter than "no records": **no members left, no records AND no modules.**
 * Modules are the user's work too — somebody who set up their own CRM and then
 * joined a team without bringing it has a workspace, not a placeholder, and
 * deleting it would be exactly the silent destruction §12 warns against. In
 * that case the org stays and shows in the table with nobody in it, which is
 * the honest outcome.
 *
 * Best-effort: a join that succeeded must not fail because the tidy-up did.
 */
async function tidyVacatedOrg(orgId, wsId) {
  if (!orgId) return false;
  try {
    if ((await store.listUsers(orgId)).length) return false;      // somebody is still there
    const { records, modules } = await store.dataStats(orgId);
    if (records || modules) return false;                          // real work, not a shell
    /*
     * An unused invite can still bring an empty org back to life.
     *
     * A link minted while there was an owner outlives them: somebody holding
     * it joins the empty org and revives it, which is deliberate and is what
     * "removing the last member takes the workspace with them" asserts. Delete
     * the org and that link 404s instead — a credential already sent to
     * somebody, silently broken.
     *
     * So the rule is not "empty", it is "empty and nothing outstanding can
     * bring it back". A spent, revoked or expired invite is not outstanding.
     */
    const live = (await store.listInvites(orgId)).filter((i) => inviteState(i) === 'valid');
    if (live.length) return false;
    await store.deleteWorkspace(wsId);
    await store.deleteOrg(orgId);
    platformCache = { at: 0, body: null };
    return true;
  } catch (err) {
    console.warn('Could not tidy up the vacated organisation:', err.message);
    return false;
  }
}

app.post('/api/org/join', requireAuth, async (req, res) => {
  const code = String((req.body && req.body.code) || '');
  const invite = await store.getInvite(code);
  if (inviteState(invite) !== 'valid') return res.status(404).json({ error: INVITE_REJECTION });

  const org = await store.getOrg(invite.orgId);
  if (!org) return res.status(404).json({ error: INVITE_REJECTION });
  if (req.user.orgId === org.id) return res.json({ ok: true, org: { id: org.id, name: org.name }, alreadyMember: true });

  /*
   * Joining means leaving. If the caller is the last owner of an org that
   * still has other people in it, walking away would strand them with a
   * workspace nobody can administer — so it is refused, with the fix named.
   */
  if (await wouldStrandTeam(req.user)) {
    return res.status(409).json({
      error: 'You are the only owner of your current team. Make someone else an owner before joining another.',
    });
  }

  const fromWs = workspaceIdFor(req.user);
  /*
   * Read the org they are LEAVING before anything moves them.
   *
   * FileStore.updateUser does Object.assign on the stored object, and
   * getUserById hands back that same reference — so req.user.orgId silently
   * becomes the new org the moment the update runs. MongoStore returns copies
   * and does not, which is worse: the two backends would disagree, and the
   * file store is what the tests run on.
   */
  const vacatedOrgId = req.user.orgId;
  const bringWork = req.body && req.body.bringWork === true;
  let broughtRows = 0;
  if (bringWork && fromWs !== org.id) {
    broughtRows = await copyWorkspace(fromWs, org.id, req.user, org.id);
  }

  await store.updateInvite(invite.code, { usedBy: req.user.id, usedAt: Date.now() });
  const updated = await store.updateUser(req.user.id, { orgId: org.id, role: invite.role });
  await store.addEvent('join', req.user.id, org.id).catch(() => {});
  if (broughtRows) await refreshCounts(updated);
  await tidyVacatedOrg(vacatedOrgId, fromWs);

  res.json({
    ok: true,
    org: { id: org.id, name: org.name },
    user: publicUser(updated),
    broughtRows,
  });
});

/*
 * Team membership: who is on it, what they may do, and how to get out.
 *
 * Removing someone from a team is NOT deleting their account — that lives on
 * the admin surface and is a different act with different consequences. Here
 * they keep their account and get a fresh workspace of their own; the team's
 * workspace is not touched, which is the whole point of stage A's split
 * between deleteUser and deleteWorkspace.
 */
function isOrgOwner(user) {
  return user.role === 'owner' || user.role === 'platformAdmin';
}

// The guard that stops a team being abandoned. Leaving, demoting yourself and
// being the last owner are the same problem wearing three hats.
async function wouldStrandTeam(user) {
  if (!user.orgId) return false;
  const members = await store.listUsers(user.orgId);
  if (members.length <= 1) return false;
  const owners = members.filter(isOrgOwner);
  return owners.length === 1 && owners[0].id === user.id;
}

// Give someone an organisation of their own: what leaving and being removed
// both amount to. They keep their account and start on an empty workspace.
async function moveToFreshOrg(user) {
  const org = await createOrgFor(user);
  return store.updateUser(user.id, { orgId: org.id, role: 'owner' });
}

// Resolve a teammate for an owner's action. Another org's member is "not
// found", never "forbidden" — the same rule resolveTarget follows.
async function resolveMember(req, res) {
  const target = await store.getUserById(req.params.id);
  if (!target || !req.user.orgId || target.orgId !== req.user.orgId) {
    res.status(404).json({ error: 'Not a member of your team' });
    return null;
  }
  return target;
}

function requireTeamOwner(req, res, next) {
  if (!isOrgOwner(req.user)) return res.status(403).json({ error: 'Only an owner can manage the team' });
  if (!req.user.orgId) return res.status(400).json({ error: 'You are not in an organisation' });
  next();
}

app.get('/api/org/members', requireAuth, async (req, res) => {
  if (!req.user.orgId) return res.json({ members: [] });
  const members = await store.listUsers(req.user.orgId);
  members.sort((a, b) => a.createdAt - b.createdAt);
  res.json({
    members: members.map((u) => ({
      id: u.id, name: u.name, email: u.email, role: u.role,
      disabled: !!u.disabled, lastActiveAt: u.lastActiveAt || 0,
      isYou: u.id === req.user.id,
    })),
    canManage: isOrgOwner(req.user),
  });
});

app.patch('/api/org/members/:id', requireAuth, requireTeamOwner, async (req, res) => {
  const target = await resolveMember(req, res);
  if (!target) return undefined;
  const role = req.body && req.body.role;
  // Any rung of the team ladder. platformAdmin crosses organisations and is
  // not an org owner's to hand out — the same rule the admin surface enforces.
  if (!TEAM_ROLES.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${TEAM_ROLES.join(', ')}` });
  }

  // Stepping DOWN from owner is what can strand a team, whichever rung you
  // step to — not just the one that used to be the only option.
  if (target.id === req.user.id && role !== 'owner' && await wouldStrandTeam(req.user)) {
    return res.status(409).json({ error: 'You are the only owner. Make someone else an owner first.' });
  }
  const updated = await store.updateUser(target.id, { role });
  res.json({ member: { id: updated.id, name: updated.name, email: updated.email, role: updated.role } });
});

app.delete('/api/org/members/:id', requireAuth, requireTeamOwner, async (req, res) => {
  const target = await resolveMember(req, res);
  if (!target) return undefined;
  if (target.id === req.user.id) {
    return res.status(400).json({ error: 'To leave the team yourself, use Leave team' });
  }
  await moveToFreshOrg(target);
  await store.addEvent('leave', target.id, req.user.orgId).catch(() => {});
  // Deliberately says what did NOT happen: their account still exists and the
  // team's records are untouched.
  res.json({ ok: true, removed: target.id, accountDeleted: false });
});

app.post('/api/org/leave', requireAuth, async (req, res) => {
  if (!req.user.orgId) return res.status(400).json({ error: 'You are not in an organisation' });
  const members = await store.listUsers(req.user.orgId);
  if (members.length <= 1) {
    // Nobody to leave. Handing them a second empty org would just orphan the
    // first one.
    return res.status(409).json({ error: 'You are the only person here — there is no team to leave.' });
  }
  if (await wouldStrandTeam(req.user)) {
    return res.status(409).json({
      error: 'You are the only owner of this team. Make someone else an owner before you leave.',
    });
  }
  const previous = req.user.orgId;
  const updated = await moveToFreshOrg(req.user);
  await store.addEvent('leave', req.user.id, previous).catch(() => {});
  res.json({ ok: true, user: publicUser(updated) });
});

/*
 * Copy one workspace's live rows into another.
 *
 * Used when someone brings their own work into a team they are joining. Ids
 * are preserved (they are UUIDs, so nothing can collide with the team's rows)
 * and `createdBy` keeps naming the person who wrote each row rather than
 * crediting the whole lot to whoever pressed join. Tombstones are skipped:
 * there is nothing in the destination for them to delete.
 */
async function copyWorkspace(fromWsId, toWsId, user, orgId = toWsId) {
  if (fromWsId === toWsId) return 0;
  const now = Date.now();
  let copied = 0;
  for (const kind of SYNC_KINDS) {
    const rows = await store.listItems(kind, fromWsId, { since: 0, includeDeleted: false });
    if (!rows.length) continue;
    await store.putItems(kind, rows.map((e) => ({
      ...e,
      wsId: toWsId,
      orgId,
      createdBy: e.createdBy || user.id,
      updatedBy: user.id,
      // Re-dated deliberately: bringing work into a team is an explicit act and
      // should win the first sync, the same rule an explicit backup restore
      // follows on the client.
      updatedAt: now,
      serverAt: serverStamp(),
    })));
    copied += rows.length;
  }
  return copied;
}

/*
 * Whole-deployment export, for the backup M0 does not give you.
 *
 * This is the highest-value route in the application: one request returns
 * every customer's data. It is therefore off unless BACKUP_TOKEN is set,
 * authenticated ONLY by that token, and never by a session — a stolen admin
 * cookie must not also be a database dump.
 *
 * The token travels in the Authorization header and nowhere else. A correct
 * token in a query string is refused outright rather than accepted with a
 * warning: Render's edge logs request URLs, so ?token= writes a credential
 * into plaintext logs, into browser history, and into the Referer of anything
 * the page later loads.
 */
const BACKUP_TOKEN = process.env.BACKUP_TOKEN || '';

function tokenMatches(given) {
  if (!BACKUP_TOKEN || !given) return false;
  // Hash both sides first: timingSafeEqual throws on a length mismatch, and
  // the throw would itself leak the length.
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(BACKUP_TOKEN).digest();
  return crypto.timingSafeEqual(a, b);
}

app.get('/api/admin/export', async (req, res) => {
  // Indistinguishable from a route that does not exist when it is switched
  // off. Nothing should be able to find out that a deployment has backups.
  if (!BACKUP_TOKEN) return res.status(404).json({ error: 'Not found' });

  if (req.query.token) {
    console.warn('Backup export refused: token supplied as a query parameter');
    return res.status(400).json({
      error: 'Send the token in the Authorization header, not the URL. URLs are logged.',
    });
  }

  const header = String(req.get('authorization') || '');
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!tokenMatches(given)) {
    console.warn(`Backup export refused: bad token from ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const wsIds = await store.listWorkspaceIds();
  const workspaces = [];
  for (const wsId of wsIds) {
    const meta = await store.getData(wsId);
    // Raw envelopes, tombstones included: a restore that drops them would
    // resurrect every deleted record on the next sync.
    const [modules, records] = await Promise.all([
      store.listItems('modules', wsId, { since: 0 }),
      store.listItems('records', wsId, { since: 0 }),
    ]);
    workspaces.push({ wsId, meta, modules, records });
  }

  /*
   * version 2 adds accessRequests and platform. Nothing reads this field —
   * restore.mjs tolerates their absence rather than branching on it — but a
   * human holding a backup file should be able to tell which shape it is.
   *
   * accessRequests is the approval allowlist, and losing it means everybody
   * approved has to ask again (§20). It carries the addresses of people who
   * were DECLINED as well, so the nightly artifact now holds personal data
   * about non-users: that is a deliberate trade for recoverability, and it is
   * the reason the artifact's retention and its download audience matter.
   *
   * platform is exported whole, and restored selectively — restore.mjs takes
   * only the operator decisions. See §17 for why the runtime half must not
   * cross into a new deployment.
   *
   * NEVER PUT A CREDENTIAL IN `platform`. It lands in every nightly artifact
   * from here on, and a GitHub build artifact is downloadable by anyone with
   * repo read access. §18 records that a Telegram webhook URL contains a bot
   * token; that class of value belongs in the environment, not in here.
   */
  const body = {
    app: 'crmbuilder',
    kind: 'backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    storage: store.kind(),
    orgs: await store.listOrgs(),
    users: await store.listUsers(),
    accessRequests: await store.listAccessRequests(),
    platform: await store.getPlatformSettings(),
    workspaces,
  };
  console.log(`Backup export: ${workspaces.length} workspace(s), ${body.users.length} account(s)`);
  res.setHeader('Cache-Control', 'no-store');
  res.json(body);
});

/*
 * Problem reports from inside the app.
 *
 * A beta tester who hits a bug should not have to work out how to describe it.
 * The report carries the diagnostic context automatically — version, route,
 * browser, sync status, counts, recent console errors — which is the
 * difference between one message and four rounds of "what browser were you
 * using?".
 *
 * Bounded, because this writes to the same 512 MB the customers use: a size
 * cap, a rate limit, and a TTL.
 */
const FEEDBACK_MAX_BYTES = 4096;
const FEEDBACK_PER_HOUR = 10;
const FEEDBACK_WEBHOOK_URL = process.env.FEEDBACK_WEBHOOK_URL || '';

/*
 * Tell whoever is on call, without telling them the customer's data.
 *
 * The summary carries who, when and what they wrote. The diagnostic context
 * stays in the database: console errors and route state can contain record
 * names, module names and email addresses, and posting those to a chat service
 * would make it a processor of beta users' CRM contents — a thing the privacy
 * policy would then have to disclose. Fire-and-forget, after the response.
 */
/*
 * Telegram's Bot API is not a webhook, so the payload has to be built for it.
 *
 * Identified by the path (`/bot<token>/sendMessage`) rather than the hostname,
 * because that is what actually describes the API shape: it also matches a
 * self-hosted Bot API server, and — the reason it is worth doing — it can be
 * driven by a local capture server in a test. A hostname check could only be
 * tested by talking to Telegram.
 *
 * The URL contains the bot token, so it is a credential in the same class as
 * BACKUP_TOKEN and must never reach a log line. Nothing here interpolates it.
 */
const TELEGRAM_PATH = /^\/bot[^/]+\/sendMessage$/;

function webhookRequest(rawUrl, { rich, plain }) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { error: 'FEEDBACK_WEBHOOK_URL is not a valid URL' };
  }
  if (!TELEGRAM_PATH.test(url.pathname)) {
    // Discord reads `content`, Slack reads `text`. Sending both means one
    // shape works for either without a provider setting to get wrong.
    return { url: url.toString(), body: { content: rich, text: rich } };
  }

  // chat_id is a parameter, not part of the path. Taken off the query string
  // and moved into the body rather than left for Telegram to merge with a JSON
  // body — that merge is not something the Bot API docs promise, and a silently
  // undelivered notification is the failure mode this whole design avoids.
  const chatId = url.searchParams.get('chat_id');
  if (!chatId) {
    return { error: 'FEEDBACK_WEBHOOK_URL looks like Telegram but has no ?chat_id=' };
  }
  url.search = '';
  return {
    url: url.toString(),
    // No parse_mode on purpose. Telegram would then reject the whole message
    // with a 400 over an unbalanced `_` or `[` in someone's bug report, and the
    // notification would vanish for a formatting reason — so the text carries
    // no markup for it to parse.
    body: { chat_id: chatId, text: plain, disable_web_page_preview: true },
  };
}

function notifyFeedback(entry, user) {
  if (!FEEDBACK_WEBHOOK_URL) return;
  const head = `Problem report from ${user.email}`;
  const foot = `${entry.id} · ${new Date(entry.createdAt).toISOString()}`;
  const message = entry.message.slice(0, 1500);
  const req = webhookRequest(FEEDBACK_WEBHOOK_URL, {
    rich: [`**${head}**`, message, `_${foot}_`].join('\n'),
    plain: [head, message, foot].join('\n'),
  });
  if (req.error) {
    console.warn(`Feedback webhook not sent: ${req.error}`);
    return;
  }
  fetch(req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body),
    signal: AbortSignal.timeout(8000),
  }).then((r) => {
    // Telegram answers 200 with {ok:false} for a bad chat_id or a bot that was
    // never started by the recipient, so a resolved fetch is not delivery.
    if (!r.ok) console.warn(`Feedback webhook rejected the notification: HTTP ${r.status}`);
  }).catch((err) => console.warn('Feedback webhook failed:', err.message));
}

app.post('/api/feedback', requireAuth, async (req, res) => {
  const message = String((req.body && req.body.message) || '').trim();
  if (!message) return res.status(400).json({ error: 'Say what went wrong' });
  if (Buffer.byteLength(message, 'utf8') > FEEDBACK_MAX_BYTES) {
    return res.status(413).json({ error: `Keep it under ${FEEDBACK_MAX_BYTES} characters, please` });
  }

  const recent = await store.countFeedbackSince(req.user.id, Date.now() - 3600000);
  if (recent >= FEEDBACK_PER_HOUR) {
    return res.status(429).json({ error: 'That is a lot of reports in an hour. Give it a moment.' });
  }

  const now = Date.now();
  const entry = {
    id: uid(),
    userId: req.user.id,
    orgId: req.user.orgId || null,
    createdAt: now,
    // A real Date, and the only field the TTL keys on.
    reportedOn: new Date(now),
    message,
    context: sanitiseContext(req.body && req.body.context),
    status: 'open',
  };
  await store.createFeedback(entry);
  res.json({ ok: true, id: entry.id });
  // After the response: a slow or dead webhook must not make reporting a bug
  // feel like another bug.
  notifyFeedback(entry, req.user);
});

// Only the fields that help, each bounded. Whatever else the client sends is
// dropped rather than stored — this document is not a place to accumulate.
function sanitiseContext(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const str = (v, n = 200) => (v == null ? '' : String(v).slice(0, n));
  return {
    version: str(raw.version, 40),
    route: str(raw.route, 200),
    userAgent: str(raw.userAgent, 300),
    syncStatus: str(raw.syncStatus, 40),
    online: raw.online === true,
    modules: Number(raw.modules) || 0,
    records: Number(raw.records) || 0,
    errors: Array.isArray(raw.errors) ? raw.errors.slice(0, 10).map((e) => str(e, 400)) : [],
  };
}

app.get('/api/admin/feedback', requireAuth, requirePlatformAdmin, async (req, res) => {
  const reports = await store.listFeedback(100);
  const byId = new Map((await store.listUsers()).map((u) => [u.id, u]));
  res.json({
    reports: reports.map((f) => ({
      ...f,
      from: byId.has(f.userId) ? byId.get(f.userId).email : '(deleted account)',
    })),
  });
});

app.patch('/api/admin/feedback/:id', requireAuth, requirePlatformAdmin, async (req, res) => {
  const status = req.body && req.body.status;
  if (status !== 'open' && status !== 'resolved') return res.status(400).json({ error: 'Status must be open or resolved' });
  const updated = await store.updateFeedback(req.params.id, { status });
  if (!updated) return res.status(404).json({ error: 'Report not found' });
  res.json({ ok: true });
});

// ---- beta codes (platform admin only)
// Handing out the right to create accounts on this deployment is a platform
// concern, not an org owner's — requirePlatformAdmin, deliberately, not
// requireOrgAdmin.
app.get('/api/admin/beta-codes', requireAuth, requirePlatformAdmin, async (req, res) => {
  const codes = (await store.listBetaCodes()).map(publicBetaCode);
  codes.sort((a, b) => b.createdAt - a.createdAt);
  res.json({ codes, signupMode: await signupMode() });
});

/*
 * Change who may create an account, without a redeploy.
 *
 * Platform admin only, and deliberately not requireOrgAdmin: this is the whole
 * deployment's front door, not one org's business. Nothing here can lock the
 * operator out — ADMIN_EMAILS and an account that already exists bypass the
 * mode entirely, so even `closed` leaves every current user and every admin
 * able to sign in.
 */
app.put('/api/admin/signup-mode', requireAuth, requirePlatformAdmin, async (req, res) => {
  const mode = req.body && req.body.mode;
  if (!SIGNUP_MODES.includes(mode)) {
    return res.status(400).json({ error: `Mode must be one of: ${SIGNUP_MODES.join(', ')}` });
  }
  await setSignupMode(mode, req.user.id);
  // Worth a log line: it is a security-relevant setting and the row records
  // only the latest change, not the history.
  console.log(`Signup mode set to "${mode}" by ${req.user.email}`);
  res.json({ ok: true, signupMode: mode });
});

app.put('/api/admin/org-creation', requireAuth, requirePlatformAdmin, async (req, res) => {
  const mode = req.body && req.body.mode;
  if (!ORG_CREATION_MODES.includes(mode)) {
    return res.status(400).json({ error: `Mode must be one of: ${ORG_CREATION_MODES.join(', ')}` });
  }
  await setOrgCreation(mode, req.user.id);
  console.log(`Org creation set to "${mode}" by ${req.user.email}`);
  res.json({ ok: true, orgCreation: mode });
});

/*
 * Pause an organisation, or let it go again.
 *
 * This is a reversible read-only state, and the wording everywhere has to say
 * so — it sits one word from account deletion and a decade of data apart, the
 * same care §15 needed for removing a member. Nothing here touches a workspace.
 */
app.post('/api/admin/orgs/:id/suspend', requireAuth, requirePlatformAdmin, async (req, res) => {
  const org = await store.getOrg(req.params.id);
  if (!org) return res.status(404).json({ error: 'Organisation not found' });
  const suspend = req.body && req.body.suspend === true;
  const reason = String((req.body && req.body.reason) || '').trim().slice(0, 200);
  await store.updateOrg(org.id, suspend
    ? { suspendedAt: Date.now(), suspendedBy: req.user.id, suspendedReason: reason || 'This workspace is paused while we look at storage. Nothing has been deleted.' }
    : { suspendedAt: null, suspendedBy: null, suspendedReason: null });
  platformCache = { at: 0, body: null }; // the table shows this, so do not serve a stale one
  console.log(`Organisation ${org.id} ${suspend ? 'paused' : 'resumed'} by ${req.user.email}`);
  res.json({ ok: true, suspended: suspend });
});

app.post('/api/admin/beta-codes', requireAuth, requirePlatformAdmin, async (req, res) => {
  const maxUses = Math.min(Math.max(Number(req.body && req.body.maxUses) || 10, 1), 1000);
  const days = Math.min(Math.max(Number(req.body && req.body.days) || 30, 1), 365);
  const entry = {
    code: crypto.randomBytes(9).toString('base64url'),
    label: String((req.body && req.body.label) || '').slice(0, 60),
    maxUses,
    useCount: 0,
    createdBy: req.user.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + days * DAY_MS,
    revokedAt: null,
  };
  await store.createBetaCode(entry);
  res.json({ code: publicBetaCode(entry), url: `${APP_URL}/?beta=${entry.code}` });
});

app.delete('/api/admin/beta-codes/:code', requireAuth, requirePlatformAdmin, async (req, res) => {
  const entry = await store.getBetaCode(req.params.code);
  if (!entry) return res.status(404).json({ error: 'Code not found' });
  await store.updateBetaCode(entry.code, { revokedAt: Date.now() });
  res.json({ ok: true });
});

/*
 * Access requests — the door for someone who arrived on their own.
 *
 * Until this existed, a stranger who signed in without an invite hit a screen
 * saying the beta was invite-only and offering nothing but "keep looking
 * around". This is the knock.
 *
 * The design turns on one fact: at the moment we refuse someone, we already
 * hold their Google-verified email. So the request hangs off the refusal
 * rather than off a form. A typed form would take an unverified string on an
 * unauthenticated endpoint — anyone could queue up as ceo@bigcorp.com, and it
 * would be a spam surface writing into the same 512 MB the customers use.
 * Refusing first costs an attacker a full OAuth round trip per row.
 *
 * The address therefore comes from the ASK_COOKIE and nothing else. Never
 * req.body. That is the same rule as req.scopeOrgId and workspaceIdFor():
 * identity comes from what the server established, never from what the caller
 * says about themselves.
 */
const ASK_COOKIE = 'crmb_pending';
const ASK_TTL_MS = 600000; // ten minutes: long enough to read the screen and decide
const ASK_NOTE_MAX = 500;
const ASK_PENDING_CEILING = Number(process.env.ACCESS_REQUEST_CEILING || 500);
const ASK_APPROVAL_DAYS = Number(process.env.ACCESS_APPROVAL_DAYS || 30);

// Handed out at the point of refusal, and only there.
function offerToAsk(res, email, name) {
  const payload = Buffer.from(JSON.stringify({ e: email, n: String(name || '').slice(0, 80) }))
    .toString('base64url');
  res.cookie(ASK_COOKIE, payload, {
    httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: ASK_TTL_MS,
  });
}

function clearAskCookie(res) {
  res.clearCookie(ASK_COOKIE);
}

function readAskCookie(req) {
  const raw = req.cookies[ASK_COOKIE];
  if (!raw) return null;
  try {
    const { e, n } = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
    if (!e || typeof e !== 'string') return null;
    return { email: e.toLowerCase(), name: typeof n === 'string' ? n : '' };
  } catch {
    return null;
  }
}

function publicAccessRequest(r) {
  return {
    email: r.email,
    name: r.name || '',
    note: r.note || '',
    status: r.status,
    requestedAt: r.requestedAt,
    decidedAt: r.decidedAt || null,
    usedAt: r.usedAt || null,
  };
}

/*
 * Tell whoever is on call that somebody asked.
 *
 * Unlike a problem report there is nothing to withhold here: the message IS
 * the record, and it is three fields the person deliberately submitted about
 * themselves. Same transport, same fire-after-the-response rule.
 */
function notifyAccessRequest(entry) {
  if (!FEEDBACK_WEBHOOK_URL) return;
  const head = `Access request from ${entry.email}`;
  const body = entry.note || '(no note)';
  const foot = `${entry.name || 'no name given'} · ${new Date(entry.requestedAt).toISOString()}`;
  const req = webhookRequest(FEEDBACK_WEBHOOK_URL, {
    rich: [`**${head}**`, body, `_${foot}_`].join('\n'),
    plain: [head, body, foot].join('\n'),
  });
  if (req.error) {
    console.warn(`Access request webhook not sent: ${req.error}`);
    return;
  }
  fetch(req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body),
    signal: AbortSignal.timeout(8000),
  }).then((r) => {
    if (!r.ok) console.warn(`Access request webhook rejected the notification: HTTP ${r.status}`);
  }).catch((err) => console.warn('Access request webhook failed:', err.message));
}

app.post('/api/access-request', async (req, res) => {
  const who = readAskCookie(req);
  // No cookie means they never reached a refusal, so there is nothing to
  // grant. 403 rather than 401: this is not a route you authenticate into.
  if (!who) return res.status(403).json({ error: 'Sign in first, and we will offer this if you need it.' });

  const note = String((req.body && req.body.note) || '').trim().slice(0, ASK_NOTE_MAX);
  const existing = await store.getAccessRequest(who.email);

  // Already decided: say what is true without letting them re-queue. A
  // declined person who could ask again would simply ask again.
  if (existing && existing.status !== 'pending') {
    clearAskCookie(res);
    return res.json({ ok: true, status: existing.status === 'approved' ? 'approved' : 'received' });
  }

  if (!existing && (await store.countAccessRequests('pending')) >= ASK_PENDING_CEILING) {
    // The queue is not allowed to grow into the customers' storage.
    return res.status(503).json({ error: 'The waiting list is full right now. Try again in a few days.' });
  }

  const entry = {
    email: who.email,
    name: who.name,
    note,
    status: 'pending',
    requestedAt: existing ? existing.requestedAt : Date.now(),
    updatedAt: Date.now(),
    decidedAt: null,
    decidedBy: null,
    usedAt: null,
  };
  await store.upsertAccessRequest(entry);
  clearAskCookie(res);
  res.json({ ok: true, status: 'received' });
  // After the response, like every other notification here.
  notifyAccessRequest(entry);
});

// ---- admin: access requests (platform admin only)
// Who may create an account on this deployment is a platform decision, not an
// org owner's — the same reasoning as the beta codes above.
app.get('/api/admin/access-requests', requireAuth, requirePlatformAdmin, async (req, res) => {
  const rows = await store.listAccessRequests();
  res.json({
    requests: rows.map(publicAccessRequest),
    pending: rows.filter((r) => r.status === 'pending').length,
    // Approving people into a full database should say so at the moment of the
    // decision, not on a dashboard nobody happens to be looking at.
    usage: await usageReport(),
  });
});

app.post('/api/admin/access-requests/:email/decide', requireAuth, requirePlatformAdmin, async (req, res) => {
  const decision = req.body && req.body.decision;
  if (decision !== 'approved' && decision !== 'declined') {
    return res.status(400).json({ error: 'Decision must be approved or declined' });
  }
  const email = String(req.params.email || '').toLowerCase();
  const entry = await store.getAccessRequest(email);
  if (!entry) return res.status(404).json({ error: 'Request not found' });

  /*
   * Approval allowlists the address. It does not mint a code.
   *
   * There is no email sending in this product, so a code-based approval ends
   * with the operator pasting a link into their own mail client and the tester
   * waiting on it — the manual step this whole flow exists to remove. An
   * allowlisted address means they come back, press the same button that
   * refused them, and are simply in.
   *
   * expiresOn is set on both outcomes and is a real Date, because it is the
   * single field the TTL keys on. A pending row never carries it, so the queue
   * itself is never swept — see ensureAccessRequestTTL.
   */
  const now = Date.now();
  await store.updateAccessRequest(email, {
    status: decision,
    decidedAt: now,
    decidedBy: req.user.id,
    expiresOn: new Date(now + ASK_APPROVAL_DAYS * DAY_MS),
  });
  res.json({
    ok: true,
    status: decision,
    // A convenience for operators who want to reply by hand, not the mechanism:
    // the approval already stands without anybody sending anything.
    message: decision === 'approved'
      ? `You're in — open ${APP_URL} and sign in with Google using ${email}.`
      : null,
  });
});

/*
 * What the deployment is carrying, per tenant and in total.
 *
 * Platform admin only: an org owner has no business knowing how full the
 * shared database is, or who else is on it.
 *
 * Cached, because usageByOrg() scans every module and record. Thirty seconds
 * is long enough that a reload or a nervous refresh costs one scan, and short
 * enough that the number is still the one you are acting on.
 */
const PLATFORM_CACHE_MS = Number(process.env.PLATFORM_CACHE_MS || 30000);
let platformCache = { at: 0, body: null };

app.get('/api/admin/platform', requireAuth, requirePlatformAdmin, async (req, res) => {
  const now = Date.now();
  if (platformCache.body && now - platformCache.at < PLATFORM_CACHE_MS && !req.query.fresh) {
    return res.json({ ...platformCache.body, cached: true });
  }

  const [orgs, users, usage, byOrg, egress] = await Promise.all([
    store.listOrgs(),
    store.listUsers(),
    usageReport(),
    store.usageByOrg().catch((err) => {
      console.warn('Could not measure per-organisation usage:', err.message);
      return [];
    }),
    egressReport(),
  ]);

  const bytesFor = new Map(byOrg.map((o) => [o.orgId, o]));
  const totalBytes = byOrg.reduce((a, o) => a + o.bytes, 0);
  const rows = orgs.map((o) => {
    const members = users.filter((u) => u.orgId === o.id);
    const measured = bytesFor.get(o.id) || { bytes: 0, deadBytes: 0, records: 0, modules: 0, oldestDeletedAt: null };
    return {
      id: o.id,
      name: o.name,
      createdAt: o.createdAt,
      suspendedAt: o.suspendedAt || null,
      members: members.length,
      lastActiveAt: members.reduce((a, u) => Math.max(a, u.lastActiveAt || 0), 0),
      records: measured.records,
      modules: measured.modules,
      bytes: measured.bytes,
      /*
       * How much of `bytes` is tombstones, and when the oldest expires.
       *
       * The size column alone cannot tell a heavy tenant from a scarred one —
       * a workspace that has loaded and cleared the demo data a few times can
       * be half gravestones — and the storage alerts (§25) fire on the number
       * that conflates them. The two want opposite responses from an operator,
       * so the split has to be visible beside the total rather than derivable
       * from it. See §33.
       */
      deadBytes: measured.deadBytes || 0,
      oldestDeletedAt: measured.oldestDeletedAt || null,
      // Share of what is actually stored, so one tenant dominating is visible
      // without doing arithmetic.
      shareOfData: totalBytes ? Math.round((measured.bytes / totalBytes) * 1000) / 10 : 0,
    };
  });
  // Heaviest first: the ones worth looking at are the ones you see.
  rows.sort((a, b) => b.bytes - a.bytes);

  const body = {
    counts: {
      users: users.length,
      orgs: orgs.length,
      disabled: users.filter((u) => u.disabled).length,
      suspendedOrgs: orgs.filter((o) => o.suspendedAt).length,
      workspaces: usage.workspaces,
      records: usage.records,
      modules: usage.modules,
      // Deployment-wide, from the same measurement as the rows: what share of
      // the tenant data is waiting on the retention window rather than in use.
      tenantBytes: totalBytes,
      reclaimableBytes: byOrg.reduce((a, o) => a + (o.deadBytes || 0), 0),
    },
    meters: {
      storage: { ...meter(usage.bytes, usage.limitBytes, 60, 85), measured: usage.measured },
      ram: ramReport(),
      egress,
    },
    orgs: rows,
    orgCreation: await orgCreation(),
    // A deployment constant, so it is sent once rather than on every row. The
    // panel needs it to say when reclaimable bytes actually come back.
    tombstoneDays: TOMBSTONE_DAYS,
    measuredAt: now,
  };
  platformCache = { at: now, body };
  res.json({ ...body, cached: false });
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
  // What the deployment is actually using. Platform admins only — an org owner
  // has no business knowing how full the shared database is, and could infer
  // how many other customers are on it.
  let usage = null;
  if (req.isPlatformAdmin) usage = await usageReport();
  res.json({
    scope: req.isPlatformAdmin ? 'platform' : 'org',
    ...(usage ? { usage } : {}),
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
  // Deliberately no per-user module/record counts. The workspace belongs to
  // the organisation, so every member of one would report the same totals —
  // a column of identical numbers reads as five copies of the data rather
  // than five people sharing one. The figure lives on /api/admin/stats, once
  // per workspace, where it means something.
  const users = await store.listUsers(req.scopeOrgId);
  const rows = users.map((u) => ({
    ...publicUser(u),
    disabled: !!u.disabled,
    provider: u.provider,
    lastActiveAt: u.lastActiveAt || 0,
  }));
  rows.sort((a, b) => b.createdAt - a.createdAt);
  res.json({ users: rows, scope: req.isPlatformAdmin ? 'platform' : 'org' });
});

app.patch('/api/admin/users/:id', requireAuth, requireOrgAdmin, async (req, res) => {
  const { id } = req.params;
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot modify your own account here' });
  const target = await resolveTarget(req, res);
  if (!target) return undefined;
  const patch = {};
  // Only a platform admin may grant platform admin — an org owner promoting
  // someone must not be able to hand out cross-org access.
  if (TEAM_ROLES.includes(req.body.role)) patch.role = req.body.role;
  if (req.body.role === 'platformAdmin' && req.isPlatformAdmin) patch.role = 'platformAdmin';
  if (typeof req.body.disabled === 'boolean') patch.disabled = req.body.disabled;

  // Demoting or disabling the last platform admin strands the deployment just
  // as thoroughly as deleting them, so both go through the same check.
  const losesTheRole = (patch.role && patch.role !== 'platformAdmin') || patch.disabled === true;
  if (losesTheRole && await wouldStrandDeployment(target)) {
    return res.status(409).json({
      error: 'This is the only platform administrator. Promote someone else first.',
    });
  }
  const user = await store.updateUser(id, patch);
  res.json({ user: { ...publicUser(user), disabled: !!user.disabled } });
});

app.delete('/api/admin/users/:id', requireAuth, requireOrgAdmin, async (req, res) => {
  const { id } = req.params;
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  const target = await resolveTarget(req, res);
  if (!target) return undefined;
  const out = await deleteAccount(target);
  if (!out.ok) {
    return res.status(409).json({
      error: 'This is the only platform administrator. Promote someone else first.',
    });
  }
  res.json({ ok: true, deletedWorkspace: out.deletedWorkspace });
});

// ---- static PWA
//
// An explicit allow-list, NOT express.static(__dirname). Serving the repository
// root served the whole repository: /CLAUDE.md and /docs/BETA.md returned
// internal notes, /package.json the dependency list, /.git/config the remote —
// and a deployment that ever lost MONGODB_URI falls back to the file store,
// which would have published every customer's records at /data/store.json.
//
// It hid well, which is why it lasted. Linux is case-sensitive, so the obvious
// probe (/claude.md) missed the file and fell through to the SPA catch-all,
// which answered 200 with the app shell. Nothing 404s, so "no such file" and
// "found the app" looked identical from outside.
//
// Adding a file to the app means adding it here, to sw.js's APP_SHELL, and to
// the smoke test's ASSETS — or it 404s in production while working locally
// from cache.

const ASSET_DIRS = ['css', 'js', 'fonts', 'icons'];

// Root files that are part of the app. The extensionless aliases replace
// express.static's `extensions: ['html']`, which went with the wildcard —
// /privacy and /terms are the URLs Google's consent screen points at.
const PUBLIC_ROOT_FILES = [
  'index.html', 'privacy.html', 'terms.html',
  'legal.css', 'manifest.webmanifest', 'sw.js',
];

// These two are deliberately public and their URLs may already be in somebody's
// inbox, so the paths are frozen. Everything else under docs/ stays unserved.
const PUBLIC_DOCS = ['manual.html', 'product-tour.html'];

function cacheHeaders(res, filePath) {
  if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
  if (filePath.endsWith('.woff2')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
}

function sendPublicFile(rel) {
  return (req, res) => {
    cacheHeaders(res, rel);
    res.sendFile(path.join(__dirname, rel));
  };
}

for (const dir of ASSET_DIRS) {
  app.use(`/${dir}`, express.static(path.join(__dirname, dir), { setHeaders: cacheHeaders }));
}
for (const name of PUBLIC_ROOT_FILES) {
  app.get(`/${name}`, sendPublicFile(name));
  if (name.endsWith('.html')) app.get(`/${name.slice(0, -5)}`, sendPublicFile(name));
}
for (const name of PUBLIC_DOCS) {
  app.get(`/docs/${name}`, sendPublicFile(path.join('docs', name)));
}

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  /*
   * A request that names a file is not a client route. Routing here is
   * hash-based (#/m/<id>), so the server never needs to answer an extensioned
   * path with the shell — and answering 200 + 40 KB of HTML is what made the
   * exposure above invisible to probing.
   *
   * extname() alone is not enough: it returns '' for /.git/config and /.env,
   * because their basenames carry no extension. The dot-segment test is what
   * covers those, and dropping it re-opens exactly the paths this is for.
   */
  const namesAFile = path.extname(req.path) !== ''
    || req.path.split('/').some((seg) => seg.length > 1 && seg.startsWith('.'));
  if (namesAFile) return res.status(404).type('txt').send('Not found');

  res.sendFile(path.join(__dirname, 'index.html'));
});

/*
 * The last word on any unhandled throw.
 *
 * Without this, Express's default handler answers — and it puts the stack
 * trace in the response body whenever NODE_ENV is not exactly "production".
 * That is one environment variable away from publishing absolute file paths
 * and internal structure to anybody who can provoke a 500, and the deployment
 * that most needs the guard is the one that got its env wrong.
 *
 * The client is told nothing but the status. The detail goes to the log, where
 * the operator can already read it.
 */
app.use((err, req, res, _next) => {
  console.error(`Unhandled error on ${req.method} ${req.path}:`, err && err.stack ? err.stack : err);
  if (res.headersSent) return;
  // A body that overran the limit is the caller's problem, not a server fault,
  // and saying so is more useful than a blanket 500.
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ error: 'That request was too large.' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'That request body was not valid JSON.' });
  }
  res.status(500).json({ error: 'Something went wrong.' });
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
    await migrateToOrgWorkspaces();
  } catch (err) {
    console.error('Storage init failed:', err.message);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`CRM Builder running on ${APP_URL} (port ${PORT})`);
    console.log(`Google OAuth: ${GOOGLE_CLIENT_ID ? 'enabled' : 'disabled'} · Dev login: ${DEV_LOGIN ? 'enabled' : 'disabled'}`);
  });
})();
