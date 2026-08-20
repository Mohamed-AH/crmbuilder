/*
 * server.js — CRM Builder backend.
 *
 * Serves the static PWA and provides:
 *   - Google OAuth sign-in (JWT httpOnly cookie sessions)
 *   - Per-user data sync (modules/records/settings) in MongoDB
 *   - Admin APIs: account management + business analytics
 *
 * Storage: MongoDB when MONGODB_URI is set (Atlas free tier works);
 * otherwise a JSON file store (./data/store.json) so local development
 * needs zero setup. The client works fully offline either way.
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
      this.s = { users: [], orgs: [], data: {}, events: [] };
    }
  }
  save() {
    fs.writeFileSync(this.file, JSON.stringify(this.s));
  }
  async init() {}
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
    this.save();
  }
  // An orgId argument of null means "across every org" and is only ever
  // passed by a platform admin. Org-scoped callers always pass a real id.
  async listUsers(orgId = null) {
    return this.s.users.filter((u) => !orgId || u.orgId === orgId);
  }
  async getData(userId) { return this.s.data[userId] || null; }
  async putData(userId, doc) { this.s.data[userId] = doc; this.save(); }
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

    await this.ensureEventTTL();
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
  }
  async listUsers(orgId = null) {
    return this.users.find(orgId ? { orgId } : {}, { projection: { _id: 0 } }).toArray();
  }
  async getData(userId) { return this.data.findOne({ userId }, { projection: { _id: 0 } }); }
  async putData(userId, doc) { await this.data.updateOne({ userId }, { $set: doc }, { upsert: true }); }
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

// ------------------------------------------------------------------- app
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render terminates TLS at the proxy
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());

app.get('/healthz', (req, res) => res.json({ ok: true, storage: store.kind() }));

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

// ---- data sync
app.get('/api/data', requireAuth, async (req, res) => {
  const doc = await store.getData(req.user.id);
  res.json(doc ? { modules: doc.modules, records: doc.records, settings: doc.settings || {}, updatedAt: doc.updatedAt } : { modules: null, records: null, settings: null, updatedAt: 0 });
});

app.put('/api/data', requireAuth, async (req, res) => {
  const { modules, records, settings } = req.body;
  if (!Array.isArray(modules) || !Array.isArray(records)) {
    return res.status(400).json({ error: 'modules and records arrays required' });
  }
  const doc = {
    userId: req.user.id,
    orgId: req.user.orgId || null,
    modules,
    records,
    settings: settings || {},
    moduleCount: modules.length,
    recordCount: records.length,
    updatedAt: Date.now(),
  };
  await store.putData(req.user.id, doc);
  store.addEvent('sync', req.user.id, req.user.orgId).catch(() => {});
  res.json({ ok: true, updatedAt: doc.updatedAt });
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
    // Idempotent: a no-op once every account has an org.
    await migrateToOrgs();
  } catch (err) {
    console.error('Storage init failed:', err.message);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`CRM Builder running on ${APP_URL} (port ${PORT})`);
    console.log(`Google OAuth: ${GOOGLE_CLIENT_ID ? 'enabled' : 'disabled'} · Dev login: ${DEV_LOGIN ? 'enabled' : 'disabled'}`);
  });
})();
