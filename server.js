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
const BETA_COOKIE = 'crmb_beta';
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
const SIGNUP_MODE = ['code', 'open', 'closed'].includes(process.env.SIGNUP_MODE)
  ? process.env.SIGNUP_MODE
  : 'code';
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
      this.s = { users: [], orgs: [], invites: [], betaCodes: [], feedback: [], data: {}, events: [], items: { modules: {}, records: {} } };
    }
    this.s.items = this.s.items || { modules: {}, records: {} };
    this.s.invites = this.s.invites || [];
    this.s.betaCodes = this.s.betaCodes || [];
    this.s.feedback = this.s.feedback || [];
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

  // --- organisations
  async createOrg(org) { await this.orgs.insertOne({ ...org }); return org; }
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
  const wsId = workspaceIdFor(user);
  await store.deleteUser(user.id);
  const remaining = user.orgId ? await store.listUsers(user.orgId) : [];
  if (!remaining.length) {
    await store.deleteWorkspace(wsId);
    return { deletedWorkspace: true };
  }
  return { deletedWorkspace: false, remaining: remaining.length };
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
      if (prior && prior.updatedAt >= updatedAt) continue; // the server's copy wins

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
    // Exactly zero, not falsy-zero. A device that has never had settings sends
    // 0, and `Number(x) || now` would restamp that as this instant — which is
    // how a fresh device signing in used to overwrite the workspace's real
    // settings with its own defaults.
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

/*
 * How full the database is, and how worried to be.
 *
 * Measured, not enforced. A hard cap that fires during a bug hunt looks like
 * the bug the tester was chasing, and you end up debugging your own limiter
 * rather than the product. The job of these numbers is to be looked at before
 * that becomes a decision.
 */
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
      body.signupMode = SIGNUP_MODE;
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

    // Authenticated by Google, but not yet allowed to exist here.
    const gate = await checkSignup(info.email, req.cookies[BETA_COOKIE]);
    res.clearCookie(BETA_COOKIE);
    if (!gate.ok) return res.redirect(`/?auth_error=${gate.reason}`);

    const user = await upsertUser({ email: info.email, name: info.name, picture: info.picture, provider: 'google' });
    if (user.disabled) return res.redirect('/?auth_error=disabled');
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
  const gate = await checkSignup(email, req.body.beta);
  if (!gate.ok) {
    return res.status(403).json({
      error: gate.reason === 'closed' ? 'Signups are closed right now.' : SIGNUP_REJECTION,
      reason: gate.reason,
    });
  }

  const user = await upsertUser({ email, name: req.body.name || '', provider: 'dev' });
  if (user.disabled) return res.status(403).json({ error: 'Account disabled' });
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
    signupMode: SIGNUP_MODE,
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

  const { won, touched, settingsWritten, rejected } = await applyPush(req.user, body);
  const out = await pullChanges(req.user, since, won);
  if (touched || settingsWritten) {
    await refreshCounts(req.user);
    store.addEvent('sync', req.user.id, req.user.orgId).catch(() => {});
  }
  const refused = rejected.modules.length + rejected.records.length;
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
async function checkSignup(email, code) {
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
  if ((await store.countUsers()) === 0) return { ok: true };

  if (SIGNUP_MODE === 'open') return { ok: true };
  if (SIGNUP_MODE === 'closed') {
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
  const bringWork = req.body && req.body.bringWork === true;
  let broughtRows = 0;
  if (bringWork && fromWs !== org.id) {
    broughtRows = await copyWorkspace(fromWs, org.id, req.user, org.id);
  }

  await store.updateInvite(invite.code, { usedBy: req.user.id, usedAt: Date.now() });
  const updated = await store.updateUser(req.user.id, { orgId: org.id, role: invite.role });
  await store.addEvent('join', req.user.id, org.id).catch(() => {});
  if (broughtRows) await refreshCounts(updated);

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
  // owner and member only. Platform admin crosses organisations and is not an
  // org owner's to hand out — the same rule the admin surface enforces.
  if (role !== 'owner' && role !== 'member') return res.status(400).json({ error: 'Role must be owner or member' });

  if (target.id === req.user.id && role === 'member' && await wouldStrandTeam(req.user)) {
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

  const body = {
    app: 'crmbuilder',
    kind: 'backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    storage: store.kind(),
    orgs: await store.listOrgs(),
    users: await store.listUsers(),
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
  res.json({ codes, signupMode: SIGNUP_MODE });
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
  const { deletedWorkspace } = await deleteAccount(target);
  res.json({ ok: true, deletedWorkspace });
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
