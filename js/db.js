/*
 * db.js — thin promise wrapper over IndexedDB.
 * Stores:
 *   modules  — module definitions (keyPath: id)
 *   records  — records belonging to modules (keyPath: id, index: moduleId)
 *
 * Deletes are soft. A row is kept with `deletedAt` set and filtered out of
 * every read, because per-record sync has no other way to tell a device that
 * something was deleted: a row that simply vanishes here is indistinguishable
 * from one this device has never seen, so the next pull would hand it back.
 * Anything that reads rows for sync uses getAllRaw(), which keeps the
 * tombstones; anything the UI touches uses getAll(), which does not.
 *
 * Which database is opened comes from Scope (scope.js): the anonymous scope
 * keeps the original `crmbuilder` name, and each account gets its own
 * `crmbuilder-u-<id>`. Isolation by construction rather than by a filter every
 * read has to remember — one visitor's rows are not merely skipped when
 * another signs in, they are in a database nothing has open.
 */
/* global Scope */
const DB = (() => {
  const VERSION = 1;
  let dbPromise = null;
  let openName = null;   // the database dbPromise is for

  // Opening must always settle. A hung open() stalls every await behind it,
  // and the app is built to boot from local data — so a database that never
  // answers would leave the user staring at an unrendered shell.
  const OPEN_TIMEOUT = 8000;

  function open() {
    const wanted = Scope.dbName();
    // A scope switch between calls must not be served the previous database.
    if (dbPromise && openName === wanted) return dbPromise;
    if (dbPromise && openName !== wanted) closeCurrent();
    openName = wanted;
    dbPromise = openNamed(wanted);
    // A failed open must not be cached, or one bad moment disables storage
    // for the whole session.
    dbPromise.catch(() => { dbPromise = null; openName = null; });
    return dbPromise;
  }

  // Release the handle we hold so the previous scope's database is not kept
  // open for the rest of the session. Deliberately fire-and-forget: a pending
  // open that has not settled yet is closed when it does.
  function closeCurrent() {
    const pending = dbPromise;
    dbPromise = null;
    openName = null;
    if (pending) pending.then((db) => db.close()).catch(() => { /* never opened */ });
  }

  // Open a database by name without touching the cached handle. Used by the
  // one-time legacy adoption, which has to hold two databases briefly.
  function openNamed(name) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
      const timer = setTimeout(
        () => finish(reject, new Error(`IndexedDB did not open within ${OPEN_TIMEOUT}ms`)),
        OPEN_TIMEOUT
      );
      let req;
      try {
        req = indexedDB.open(name, VERSION);
      } catch (err) {
        finish(reject, err);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('modules')) {
          db.createObjectStore('modules', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('records')) {
          const s = db.createObjectStore('records', { keyPath: 'id' });
          s.createIndex('moduleId', 'moduleId', { unique: false });
        }
      };
      req.onsuccess = () => finish(resolve, req.result);
      req.onerror = () => finish(reject, req.error);
      req.onblocked = () => finish(reject, new Error('IndexedDB is blocked by another tab'));
    });
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function store(name, mode) {
    const db = await open();
    return db.transaction(name, mode).objectStore(name);
  }

  const live = (rows) => rows.filter((r) => r && !r.deletedAt);

  // A tombstone that every device has already pulled is dead weight. Local
  // pruning is bounded by the same window the server uses, so a device that
  // was off for less than that still learns about the delete.
  const TOMBSTONE_MS = 180 * 86400000;

  /*
   * A row written with a clock OLDER than the push watermark is stranded.
   *
   * The client selects what to push with `rowClock(r) >= pushedThrough`, and
   * that watermark only ever moves FORWARD (js/cloud.js). So a row saved with
   * an updatedAt earlier than the last successful push is invisible to every
   * push that follows — permanently — while the sync itself still succeeds and
   * the chip reads "Synced". Silent, and indistinguishable from working.
   *
   * Demo data walks straight into it: it backdates records so "recent
   * activity" has a believable order. The localStorage snapshot recovery in
   * app.js does too, restoring rows with their original clocks — on the one
   * path whose whole job is recovering from data loss.
   *
   * Lowering the watermark to the row's own clock lets it out on the next
   * push. Re-sending the rows above that point costs nothing: the server's
   * tie-break skips anything it already has, which is the same reason client
   * selection uses `>=` rather than `>` (CLAUDE.md §10).
   *
   * This lives in DB.put because that is the one place every write passes
   * through. Putting it at the call sites means the next path that backdates a
   * row re-opens the bug, and there have already been two.
   */
  function releaseBackdated(value) {
    if (!value || typeof Scope === 'undefined') return;
    const clock = Math.max(Number(value.updatedAt) || 0, Number(value.deletedAt) || 0);
    if (!clock) return;
    const pushed = Number(Scope.get('pushedThrough')) || 0;
    if (pushed && clock < pushed) {
      Scope.set('pushedThrough', String(clock));
      Scope.set('dirty', '1');
    }
  }

  const api = {
    // Point at another scope's database. The next call opens it; anything
    // already in flight against the old one is closed behind us.
    useScope(scope) {
      if (openName === Scope.dbName(scope)) return false;
      closeCurrent();
      return true;
    },
    close: closeCurrent,
    get openName() { return openName; },

    /*
     * Delete a scope's database outright.
     *
     * Only ever used on the anonymous scope after its contents have been
     * claimed and the claim has synced. Anonymous rows have no sync obligation
     * — they never reached a server — so tombstones would be pointless, and
     * leaving them would show the next visitor the last one's workspace.
     *
     * Best-effort: another tab holding the database open blocks the delete, in
     * which case the caller's pending flag survives and it is retried.
     */
    wipeScope(scope) {
      const name = Scope.dbName(scope);
      if (openName === name) closeCurrent();
      return new Promise((resolve) => {
        let req;
        try {
          req = indexedDB.deleteDatabase(name);
        } catch {
          resolve(false);
          return;
        }
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
        req.onblocked = () => resolve(false);
        setTimeout(() => resolve(false), OPEN_TIMEOUT);
      });
    },

    /*
     * Adopt the pre-scope database into a scope, once.
     *
     * A signed-in install's rows are in the legacy `crmbuilder` database, which
     * is now the ANONYMOUS one — leaving them there would offer that user's own
     * workspace to the next person as claimable anonymous data. Copy them into
     * the account's database instead.
     *
     * The legacy database is not emptied here. It is the only other copy until
     * a sync lands, and the same "verify before delete" reasoning applies as in
     * the pooled-to-dedicated runbook. Callers clear it once they are satisfied.
     */
    async adoptLegacy(scope) {
      const from = Scope.dbName(Scope.ANON);
      const to = Scope.dbName(scope);
      if (scope === Scope.ANON || from === to) return { adopted: 0 };

      // Two databases open at once invites a blocked upgrade on either, so
      // read the legacy one out completely and close it before writing.
      closeCurrent();
      const rows = {};
      const legacy = await openNamed(from);
      try {
        for (const name of ['modules', 'records']) {
          rows[name] = await reqToPromise(legacy.transaction(name, 'readonly').objectStore(name).getAll());
        }
      } finally {
        legacy.close();
      }
      if (!rows.modules.length && !rows.records.length) return { adopted: 0 };

      const target = await openNamed(to);
      let written = 0;
      try {
        for (const name of ['modules', 'records']) {
          if (!rows[name].length) continue;
          const s = target.transaction(name, 'readwrite').objectStore(name);
          await Promise.all(rows[name].map((r) => reqToPromise(s.put(r))));
          written += rows[name].length;
        }
        // Count before reporting success. The caller writes a marker that stops
        // this ever running again, so it must not be written over a half-copy.
        for (const name of ['modules', 'records']) {
          const got = await reqToPromise(target.transaction(name, 'readonly').objectStore(name).getAll());
          if (got.length < rows[name].length) {
            throw new Error(`adoptLegacy: ${name} copied ${got.length} of ${rows[name].length}`);
          }
        }
      } finally {
        target.close();
      }
      return { adopted: written };
    },

    async getAll(name) {
      return live(await reqToPromise((await store(name, 'readonly')).getAll()));
    },
    // Tombstones included — for sync, never for the UI.
    async getAllRaw(name) {
      return reqToPromise((await store(name, 'readonly')).getAll());
    },
    async get(name, key) {
      const row = await reqToPromise((await store(name, 'readonly')).get(key));
      return row && row.deletedAt ? undefined : row;
    },
    async getRaw(name, key) {
      return reqToPromise((await store(name, 'readonly')).get(key));
    },
    async put(name, value) {
      releaseBackdated(value);
      return reqToPromise((await store(name, 'readwrite')).put(value));
    },
    // Soft delete. Keeps the id and the sync clocks, drops the payload —
    // there is no reason to carry a deleted record's contents around, and it
    // is one less copy of data the user asked to be rid of.
    async delete(name, key, at = Date.now()) {
      const s = await store(name, 'readwrite');
      const row = await reqToPromise(s.get(key));
      if (!row) return undefined;
      return reqToPromise(s.put({ id: row.id, moduleId: row.moduleId, deletedAt: at, updatedAt: at }));
    },
    // Hard removal, no tombstone. Only for adopting a full remote snapshot,
    // where the server's row set is the answer and local state is discarded.
    async purge(name, key) {
      return reqToPromise((await store(name, 'readwrite')).delete(key));
    },
    async clear(name) {
      return reqToPromise((await store(name, 'readwrite')).clear());
    },
    async recordsByModule(moduleId) {
      const s = await store('records', 'readonly');
      return live(await reqToPromise(s.index('moduleId').getAll(moduleId)));
    },
    async deleteRecordsByModule(moduleId, at = Date.now()) {
      const s = await store('records', 'readwrite');
      const rows = live(await reqToPromise(s.index('moduleId').getAll(moduleId)));
      // Issued in one tick, deliberately: an IndexedDB transaction commits as
      // soon as the microtask queue drains with nothing outstanding, so
      // awaiting between writes can find the transaction already closed.
      await Promise.all(rows.map((r) => reqToPromise(s.put({ id: r.id, moduleId: r.moduleId, deletedAt: at, updatedAt: at }))));
      return rows.length;
    },
    // Tombstone everything: a workspace reset that other devices must see.
    async softClearAll(at = Date.now()) {
      let count = 0;
      for (const name of ['records', 'modules']) {
        const s = await store(name, 'readwrite');
        const rows = live(await reqToPromise(s.getAll()));
        await Promise.all(rows.map((r) => reqToPromise(s.put({ id: r.id, moduleId: r.moduleId, deletedAt: at, updatedAt: at }))));
        count += rows.length;
      }
      return count;
    },
    async pruneTombstones(before = Date.now() - TOMBSTONE_MS) {
      let removed = 0;
      for (const name of ['records', 'modules']) {
        const s = await store(name, 'readwrite');
        const rows = (await reqToPromise(s.getAll())).filter((r) => r && r.deletedAt && r.deletedAt < before);
        await Promise.all(rows.map((r) => reqToPromise(s.delete(r.id))));
        removed += rows.length;
      }
      return removed;
    },
  };
  return api;
})();
