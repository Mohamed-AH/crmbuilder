/*
 * cloud.js — account + sync layer.
 *
 * When the app is served by server.js and the user signs in, their workspace
 * (modules, records, settings) syncs to the server (MongoDB). Without a server
 * or when signed out, everything stays local: IndexedDB is the source of truth
 * with a localStorage snapshot as a second copy.
 *
 * Sync is per record. Each trip sends only what changed here since the last
 * successful push and receives only what changed there since our cursor, and
 * conflicts resolve one record at a time by last-write-wins — so two devices
 * editing different records both keep their edits. If the server does not
 * understand /api/sync (an older deployment mid-rollout), this falls back to
 * the whole-snapshot PUT it used to do.
 *
 * Nothing here is ever awaited before the UI paints — see init() in app.js.
 * Free-tier hosts (Render) spin down when idle and can take the better part
 * of a minute to answer the first request, so every call is bounded by a
 * timeout and a stalled server degrades to "offline", never to a hang.
 */
/* global Scope */
const Cloud = (() => {
  let me = { authenticated: false, user: null, googleEnabled: false, devLoginEnabled: false, serverAvailable: false };
  let status = 'local'; // local | connecting | syncing | synced | error | offline
  let pushTimer = null;
  let pushInFlight = false;
  let pushQueued = false;
  let getState = null;    // async () => ({ modules, records, settings })
  let getChanges = null;  // async (since) => ({ modules, records, settings, settingsUpdatedAt, highWater })
  let applyChanges = null; // async ({ modules, records, settings }) => changedCount
  let deltaSupported = true;
  let bootResolved = false;
  const statusListeners = [];

  // Sync state is per scope, not per device. Two accounts sharing a browser
  // profile each keep their own cursor and watermark, so one signing in cannot
  // inherit — or push — the other's pending work.
  const CURSOR = 'syncCursor';   // highest server change stamp we have seen
  const PUSHED = 'pushedThrough'; // our own clock at the last accepted push

  const num = (name) => Number(Scope.get(name)) || 0;

  // Generous enough to survive a free-tier cold start, short enough that a
  // genuinely dead server doesn't leave the UI claiming "connecting" forever.
  const TIMEOUT = { boot: 75000, data: 45000, auth: 30000, admin: 30000 };

  function setStatus(s) {
    if (status === s) return;
    status = s;
    statusListeners.forEach((cb) => cb(s));
  }

  async function api(path, opts = {}, timeoutMs = TIMEOUT.data) {
    const { timeout, ...fetchOpts } = opts;
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      signal: AbortSignal.timeout(timeout || timeoutMs),
      ...fetchOpts,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  function rememberSession() {
    localStorage.setItem('crmb:auth', me.authenticated ? '1' : '');
    if (me.user) localStorage.setItem('crmb:user', JSON.stringify(me.user));
    else localStorage.removeItem('crmb:user');
  }

  // What we assume about the session when the server can't be reached: if one
  // existed last time, keep acting signed-in so edits queue and sync resumes.
  function offlineIdentity() {
    let cachedUser = null;
    try { cachedUser = JSON.parse(localStorage.getItem('crmb:user')); } catch { /* none */ }
    const wasAuthed = localStorage.getItem('crmb:auth') === '1' && !!cachedUser;
    return { authenticated: wasAuthed, user: cachedUser, googleEnabled: false, devLoginEnabled: false, serverAvailable: wasAuthed };
  }

  return {
    get me() { return me; },
    get user() { return me.user; },
    get status() { return status; },
    get isAuthed() { return me.authenticated; },
    // False until /api/me has answered (or timed out) — the first paint happens
    // before that, so the UI needs to distinguish "no server" from "not yet".
    get ready() { return bootResolved; },
    onStatus(cb) { statusListeners.push(cb); },

    // providers: { getState, getChanges, applyChanges } — or, for the simple
    // case, just the getState function.
    // Deliberately not awaited by the caller: everything up to the first await
    // runs synchronously so the first paint already has last visit's identity,
    // and the network result is folded in whenever it arrives.
    async init(providers) {
      const p = typeof providers === 'function' ? { getState: providers } : (providers || {});
      getState = p.getState || null;
      getChanges = p.getChanges || null;
      applyChanges = p.applyChanges || null;
      me = offlineIdentity();
      setStatus(me.authenticated ? 'connecting' : 'local');
      try {
        me = { serverAvailable: true, ...(await api('/api/me', {}, TIMEOUT.boot)) };
        rememberSession();
      } catch {
        // Static hosting (no server at all), offline, or a server that never
        // woke up in time. Either way: stay usable, keep queueing.
        me = offlineIdentity();
      }
      bootResolved = true;
      setStatus(me.authenticated ? (navigator.onLine && me.serverAvailable ? 'synced' : 'offline') : 'local');
      return me;
    },

    async devLogin(email, name) {
      const out = await api('/auth/dev', { method: 'POST', body: JSON.stringify({ email, name }) }, TIMEOUT.auth);
      me.authenticated = true;
      me.user = out.user;
      me.serverAvailable = true;
      rememberSession();
      return out.user;
    },

    async logout() {
      await api('/auth/logout', { method: 'POST' }, TIMEOUT.auth).catch(() => {});
      me.authenticated = false;
      me.user = null;
      localStorage.removeItem('crmb:auth');
      localStorage.removeItem('crmb:user');
      // The workspace itself is NOT touched. Signing out returns the screen to
      // the anonymous scope; the account's database and its cursor stay exactly
      // as they were and come back on the next sign-in. That is what makes a
      // shared PC safe without ever destroying anyone's pending work.
      Scope.clearSignInPending();
      setStatus('local');
    },

    // Where the server's change stream stands as far as this scope knows.
    get cursor() { return num(CURSOR); },
    resetCursor() {
      Scope.remove(CURSOR);
      Scope.remove(PUSHED);
    },

    async pull() {
      return api('/api/data', {}, TIMEOUT.boot);
    },

    /*
     * One sync round trip: push what changed here, apply what changed there.
     *
     * Returns { ok, changed } — `changed` is how many local rows the response
     * actually altered, which is what tells the caller whether to repaint.
     */
    async sync() {
      if (!me.authenticated || !getChanges) return { ok: false, changed: 0 };
      // The anonymous scope has no account behind it. This is the single check
      // that makes demo data — and one visitor's work on a shared PC — unable
      // to reach anyone's server-side workspace.
      if (Scope.isAnon) return { ok: false, changed: 0 };
      clearTimeout(pushTimer);
      // Serialize. Two overlapping trips would both read the same pending set
      // and the second would advance the watermark past changes the first was
      // still sending.
      if (pushInFlight) {
        pushQueued = true;
        return { ok: false, changed: 0 };
      }
      pushInFlight = true;
      setStatus('syncing');
      try {
        if (!deltaSupported) return await Cloud.pushFull();

        const since = num(PUSHED);
        const cursor = num(CURSOR);
        const local = await getChanges(since);
        // Captured before the request, not after: an edit made while the
        // request is in flight must stay pending, not be marked as sent.
        const highWater = local.highWater || Date.now();

        const out = await api('/api/sync', {
          method: 'POST',
          body: JSON.stringify({
            since: cursor,
            modules: local.modules || [],
            records: local.records || [],
            settings: local.settings,
            settingsUpdatedAt: local.settingsUpdatedAt || 0,
          }),
        }, TIMEOUT.data);

        const changed = applyChanges ? await applyChanges(out) : 0;
        Scope.set(CURSOR, String(out.cursor || cursor));
        Scope.set(PUSHED, String(highWater));
        Scope.set('lastSync', String(Date.now()));
        Scope.remove('dirty');
        setStatus('synced');
        return { ok: true, changed };
      } catch (err) {
        if (err.status === 404) {
          // An older server that has never heard of /api/sync. Fall back for
          // the rest of the session rather than failing every trip.
          deltaSupported = false;
          console.warn('Server does not support per-record sync; using whole-snapshot sync.');
          return await Cloud.pushFull();
        }
        // 401 means the session died server-side (expired, or the account was
        // disabled); drop to local so the UI stops promising a sync.
        if (err.status === 401 || err.status === 403) {
          me.authenticated = false;
          me.user = null;
          rememberSession();
          setStatus('local');
        } else {
          setStatus(navigator.onLine ? 'error' : 'offline');
        }
        return { ok: false, changed: 0 };
      } finally {
        pushInFlight = false;
        if (pushQueued) {
          pushQueued = false;
          setTimeout(() => Cloud.sync(), 250);
        }
      }
    },

    // Whole-snapshot write. The fallback path, and what a manual "Sync now"
    // falls back to; it clobbers by design, so nothing calls it routinely.
    async pushFull() {
      if (!me.authenticated || !getState) return { ok: false, changed: 0 };
      if (Scope.isAnon) return { ok: false, changed: 0 };
      try {
        const state = await getState();
        await api('/api/data', { method: 'PUT', body: JSON.stringify(state) }, TIMEOUT.data);
        Scope.set('lastSync', String(Date.now()));
        Scope.remove('dirty');
        setStatus('synced');
        return { ok: true, changed: 0 };
      } catch (err) {
        if (err.status === 401 || err.status === 403) {
          me.authenticated = false;
          me.user = null;
          rememberSession();
          setStatus('local');
        } else {
          setStatus(navigator.onLine ? 'error' : 'offline');
        }
        return { ok: false, changed: 0 };
      }
    },

    // Kept for callers that only care whether the workspace reached the server.
    async pushNow() {
      return (await Cloud.sync()).ok;
    },

    // Debounced sync — call after every local mutation.
    schedulePush() {
      Scope.set('dirty', '1');
      if (!me.authenticated) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => Cloud.sync(), 1500);
    },

    admin: {
      stats: () => api('/api/admin/stats', {}, TIMEOUT.admin),
      users: () => api('/api/admin/users', {}, TIMEOUT.admin),
      update: (id, patch) => api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }, TIMEOUT.admin),
      remove: (id) => api(`/api/admin/users/${id}`, { method: 'DELETE' }, TIMEOUT.admin),
    },
  };
})();

window.addEventListener('online', () => { if (Scope.get('dirty')) Cloud.sync(); });
