/*
 * scope.js — whose data is this?
 *
 * One browser profile is not one person. A shared PC, a demo taken before
 * signing up, a colleague borrowing a laptop: all of them used to land in the
 * same IndexedDB database and the same localStorage keys, and the sync engine
 * pushed whatever it found to whichever account happened to be signed in.
 *
 * A scope is the ownership boundary that was missing:
 *
 *   anon      nobody is signed in. Demo data and pre-sign-in work live here,
 *             and it NEVER syncs — there is no account to sync it to.
 *   u:<id>    one specific account. Its own database, its own keys.
 *
 * Two invariants the rest of the app depends on:
 *
 *   1. Owned data is never claimable. Only the anon scope can be adopted into
 *      an account, only after an explicit prompt, and only once. A u:<id>
 *      scope is never merged into a different account under any circumstance.
 *   2. Sync only ever runs in a u:<id> scope. That is what makes demo data
 *      unable to reach a server even if something forgets to flag it.
 *
 * Resolution has to be synchronous. init() in app.js paints before any network
 * call resolves (see the paint-first invariant), so the scope is read from the
 * last known identity in localStorage and corrected later if /api/me disagrees.
 */
const Scope = (() => {
  const ANON = 'anon';
  const DB_BASE = 'crmbuilder';

  // Device-level, never scoped: these describe the browser, not a workspace.
  const USER_KEY = 'crmb:user';
  const AUTH_KEY = 'crmb:auth';
  const PENDING_KEY = 'crmb:signinPending';
  const MIGRATION_KEY = 'crmb:scopeMigration';
  const CLAIM_KEY = 'crmb:anonClaim';

  // Everything that describes a workspace rather than the device. Each becomes
  // crmb:<scope>:<name>.
  const SCOPED = [
    'settings', 'settingsAt', 'snapshot', 'lastEdit',
    'lastSync', 'dirty', 'syncCursor', 'pushedThrough',
    // Which workspace the rows in this scope are a replica OF. A scope belongs
    // to a person; the workspace belongs to their organisation, and those can
    // part company — joining a team, leaving one, being removed from one.
    'workspace',
  ];
  // What they were called before scopes existed, for the one-time migration.
  const LEGACY = SCOPED.map((n) => [`crmb:${n}`, n]);

  let current = null;

  const read = (key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  };
  const write = (key, value) => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch { /* private mode, or quota */ }
  };

  function userIdFromStorage() {
    if (read(AUTH_KEY) !== '1') return null;
    try {
      const u = JSON.parse(read(USER_KEY));
      return u && u.id ? String(u.id) : null;
    } catch {
      return null;
    }
  }

  const forUser = (userId) => (userId ? `u:${userId}` : ANON);

  /*
   * The scope to boot into, before the server has said anything.
   *
   * When a sign-in is in flight the last known identity is the WRONG answer:
   * on a shared PC it is the previous person, and painting their workspace —
   * even for the moment before /api/me answers — shows one visitor another's
   * data. Paint the anonymous scope instead. Still immediate, just neutral.
   */
  function resolve() {
    if (current) return current;
    current = read(PENDING_KEY) === '1' ? ANON : forUser(userIdFromStorage());
    return current;
  }

  return {
    ANON,
    get current() { return resolve(); },
    get isAnon() { return resolve() === ANON; },
    get userId() {
      const s = resolve();
      return s === ANON ? null : s.slice(2);
    },

    forUser,

    // IndexedDB name for a scope. The anonymous scope keeps the original name
    // so an existing install opens the database it already has.
    dbName(scope = resolve()) {
      return scope === ANON ? DB_BASE : `${DB_BASE}-u-${scope.slice(2)}`;
    },

    // crmb:<scope>:<name> — the only way scoped state should ever be addressed.
    key(name, scope = resolve()) {
      return `crmb:${scope}:${name}`;
    },

    get(name, scope) { return read(Scope.key(name, scope)); },
    set(name, value, scope) { write(Scope.key(name, scope), value); },
    remove(name, scope) { write(Scope.key(name, scope), null); },

    // Point at a different scope. Callers are responsible for reopening the
    // database (DB.useScope) and re-reading whatever they cached.
    switchTo(scope) {
      const changed = current !== scope;
      current = scope;
      return changed;
    },

    // A sign-in is starting: the next boot must not assume the current
    // identity still applies. Cleared once the server has named the user.
    markSignInPending() { write(PENDING_KEY, '1'); },
    clearSignInPending() { write(PENDING_KEY, null); },

    // Forget every scoped key for one scope. Used when an anonymous workspace
    // has been claimed and confirmed, never on owned data.
    clearKeys(scope) {
      SCOPED.forEach((name) => write(Scope.key(name, scope), null));
    },

    /*
     * One-time move of pre-scope state into a scope.
     *
     * A signed-in install's unprefixed keys belong to that user; anything else
     * is anonymous and is already where it should be. Idempotent: the marker
     * records which scope was migrated, and a second run is a no-op.
     *
     * Only localStorage is handled here. The legacy IndexedDB database IS the
     * anonymous database, so an anonymous install needs no data move at all;
     * a signed-in one is adopted by DB.adoptLegacy(), which copies and verifies
     * before anything is marked done.
     */
    needsLegacyMigration() { return !read(MIGRATION_KEY); },

    migrateLegacyKeys() {
      const scope = forUser(userIdFromStorage());
      let moved = 0;
      for (const [legacyKey, name] of LEGACY) {
        const value = read(legacyKey);
        if (value === null) continue;
        // Never overwrite a scoped value that somehow already exists. That is
        // what makes a re-run after a failed adoption harmless.
        if (read(Scope.key(name, scope)) === null) {
          write(Scope.key(name, scope), value);
          moved += 1;
        }
      }
      return { scope, moved };
    },

    // Written only once the row copy has been verified too, so a failure part
    // way through leaves the migration to be retried rather than skipped.
    markMigrated(scope) { write(MIGRATION_KEY, `v1:${scope}`); },

    /*
     * Whether this scope's rows still belong to the workspace it is now
     * syncing with.
     *
     * A replica of the old organisation must never be pushed into the new one
     * — that is the shared-device bug in a different costume. An unset stamp
     * means a scope that predates this, and is adopted rather than wiped.
     */
    workspaceChanged(workspaceId) {
      const known = Scope.get('workspace');
      if (!known) {
        if (workspaceId) Scope.set('workspace', workspaceId);
        return false;
      }
      return !!workspaceId && known !== workspaceId;
    },
    markWorkspace(workspaceId) {
      if (workspaceId) Scope.set('workspace', workspaceId);
      else Scope.remove('workspace');
    },

    // Which account, if any, has already taken the anonymous workspace. An
    // anonymous scope is offered exactly once so a second sign-in on the same
    // device cannot duplicate it into another account.
    claimedBy() {
      try {
        const c = JSON.parse(read(CLAIM_KEY));
        return c && c.userId ? c : null;
      } catch {
        return null;
      }
    },
    markClaimed(userId) {
      write(CLAIM_KEY, JSON.stringify({ userId: String(userId), at: Date.now() }));
    },
    resetClaim() { write(CLAIM_KEY, null); },
  };
})();
