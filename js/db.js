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
 */
const DB = (() => {
  const NAME = 'crmbuilder';
  const VERSION = 1;
  let dbPromise = null;

  // Opening must always settle. A hung open() stalls every await behind it,
  // and the app is built to boot from local data — so a database that never
  // answers would leave the user staring at an unrendered shell.
  const OPEN_TIMEOUT = 8000;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
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
        // Private-browsing modes and hardened privacy settings can refuse
        // outright, sometimes by throwing rather than firing onerror.
        req = indexedDB.open(NAME, VERSION);
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
          const store = db.createObjectStore('records', { keyPath: 'id' });
          store.createIndex('moduleId', 'moduleId', { unique: false });
        }
      };
      req.onsuccess = () => finish(resolve, req.result);
      req.onerror = () => finish(reject, req.error);
      // Another tab holding an older version open blocks this one indefinitely.
      req.onblocked = () => finish(reject, new Error('IndexedDB is blocked by another tab'));
    });
    // A failed open must not be cached, or one bad moment disables storage
    // for the whole session.
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
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

  const api = {
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
