/*
 * cloud.js — account + sync layer.
 *
 * When the app is served by server.js and the user signs in, their whole
 * workspace (modules, records, settings) syncs to the server (MongoDB).
 * Without a server or when signed out, everything stays local: IndexedDB
 * is the source of truth with a localStorage snapshot as a second copy.
 * Sync strategy is last-write-wins on the full snapshot, debounced.
 */
const Cloud = (() => {
  let me = { authenticated: false, user: null, googleEnabled: false, devLoginEnabled: false, serverAvailable: false };
  let status = 'local'; // local | syncing | synced | error | offline
  let pushTimer = null;
  let getState = null; // async () => ({ modules, records, settings })
  const statusListeners = [];

  function setStatus(s) {
    if (status === s) return;
    status = s;
    statusListeners.forEach((cb) => cb(s));
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...opts,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  return {
    get me() { return me; },
    get user() { return me.user; },
    get status() { return status; },
    get isAuthed() { return me.authenticated; },
    onStatus(cb) { statusListeners.push(cb); },

    // stateProvider: async () => ({ modules, records, settings })
    async init(stateProvider) {
      getState = stateProvider;
      try {
        me = { serverAvailable: true, ...(await api('/api/me')) };
        localStorage.setItem('crmb:auth', me.authenticated ? '1' : '');
        if (me.user) localStorage.setItem('crmb:user', JSON.stringify(me.user));
        else localStorage.removeItem('crmb:user');
      } catch {
        // Unreachable server: static hosting (no server at all) or we're
        // offline. If a session existed last time, assume the cookie is still
        // valid so edits keep queueing and sync resumes on reconnect.
        let cachedUser = null;
        try { cachedUser = JSON.parse(localStorage.getItem('crmb:user')); } catch { /* none */ }
        const wasAuthed = localStorage.getItem('crmb:auth') === '1' && !!cachedUser;
        me = { authenticated: wasAuthed, user: cachedUser, googleEnabled: false, devLoginEnabled: false, serverAvailable: wasAuthed };
      }
      setStatus(me.authenticated ? (navigator.onLine ? 'synced' : 'offline') : 'local');
      return me;
    },

    async devLogin(email, name) {
      const out = await api('/auth/dev', { method: 'POST', body: JSON.stringify({ email, name }) });
      me.authenticated = true;
      me.user = out.user;
      return out.user;
    },

    async logout() {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      me.authenticated = false;
      me.user = null;
      localStorage.removeItem('crmb:auth');
      localStorage.removeItem('crmb:user');
      localStorage.removeItem('crmb:lastSync');
      setStatus('local');
    },

    async pull() {
      return api('/api/data');
    },

    async pushNow() {
      if (!me.authenticated || !getState) return false;
      clearTimeout(pushTimer);
      setStatus('syncing');
      try {
        const state = await getState();
        await api('/api/data', { method: 'PUT', body: JSON.stringify(state) });
        localStorage.setItem('crmb:lastSync', String(Date.now()));
        localStorage.removeItem('crmb:dirty');
        setStatus('synced');
        return true;
      } catch (err) {
        setStatus(navigator.onLine ? 'error' : 'offline');
        return false;
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
      stats: () => api('/api/admin/stats'),
      users: () => api('/api/admin/users'),
      update: (id, patch) => api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
      remove: (id) => api(`/api/admin/users/${id}`, { method: 'DELETE' }),
    },
  };
})();

window.addEventListener('online', () => { if (localStorage.getItem('crmb:dirty')) Cloud.pushNow(); });
