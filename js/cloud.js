/*
 * cloud.js — account + sync layer.
 *
 * When the app is served by server.js and the user signs in, their whole
 * workspace (modules, records, settings) syncs to the server (MongoDB).
 * Without a server or when signed out, everything stays local: IndexedDB
 * is the source of truth with a localStorage snapshot as a second copy.
 * Sync strategy is last-write-wins on the full snapshot, debounced.
 *
 * Nothing here is ever awaited before the UI paints — see init() in app.js.
 * Free-tier hosts (Render) spin down when idle and can take the better part
 * of a minute to answer the first request, so every call is bounded by a
 * timeout and a stalled server degrades to "offline", never to a hang.
 */
const Cloud = (() => {
  let me = { authenticated: false, user: null, googleEnabled: false, devLoginEnabled: false, serverAvailable: false };
  let status = 'local'; // local | connecting | syncing | synced | error | offline
  let pushTimer = null;
  let pushInFlight = false;
  let pushQueued = false;
  let getState = null; // async () => ({ modules, records, settings })
  let bootResolved = false;
  const statusListeners = [];

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

    // stateProvider: async () => ({ modules, records, settings })
    // Deliberately not awaited by the caller: everything up to the first await
    // runs synchronously so the first paint already has last visit's identity,
    // and the network result is folded in whenever it arrives.
    async init(stateProvider) {
      getState = stateProvider;
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
      localStorage.removeItem('crmb:lastSync');
      setStatus('local');
    },

    async pull() {
      return api('/api/data', {}, TIMEOUT.boot);
    },

    async pushNow() {
      if (!me.authenticated || !getState) return false;
      clearTimeout(pushTimer);
      // Overlapping PUTs of a whole snapshot can land out of order; serialize
      // them and coalesce anything requested while one is in flight.
      if (pushInFlight) {
        pushQueued = true;
        return false;
      }
      pushInFlight = true;
      setStatus('syncing');
      try {
        const state = await getState();
        await api('/api/data', { method: 'PUT', body: JSON.stringify(state) }, TIMEOUT.data);
        localStorage.setItem('crmb:lastSync', String(Date.now()));
        localStorage.removeItem('crmb:dirty');
        setStatus('synced');
        return true;
      } catch (err) {
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
        return false;
      } finally {
        pushInFlight = false;
        if (pushQueued) {
          pushQueued = false;
          setTimeout(() => Cloud.pushNow(), 250);
        }
      }
    },

    // Debounced push — call after every local mutation.
    schedulePush() {
      localStorage.setItem('crmb:dirty', '1');
      if (!me.authenticated) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => Cloud.pushNow(), 1500);
    },

    admin: {
      stats: () => api('/api/admin/stats', {}, TIMEOUT.admin),
      users: () => api('/api/admin/users', {}, TIMEOUT.admin),
      update: (id, patch) => api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }, TIMEOUT.admin),
      remove: (id) => api(`/api/admin/users/${id}`, { method: 'DELETE' }, TIMEOUT.admin),
    },
  };
})();

window.addEventListener('online', () => { if (localStorage.getItem('crmb:dirty')) Cloud.pushNow(); });
