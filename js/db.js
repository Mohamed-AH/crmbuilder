/*
 * db.js — thin promise wrapper over IndexedDB.
 * Stores:
 *   modules  — module definitions (keyPath: id)
 *   records  — records belonging to modules (keyPath: id, index: moduleId)
 */
const DB = (() => {
  const NAME = 'crmbuilder';
  const VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
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
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
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

  return {
    async getAll(name) {
      return reqToPromise((await store(name, 'readonly')).getAll());
    },
    async get(name, key) {
      return reqToPromise((await store(name, 'readonly')).get(key));
    },
    async put(name, value) {
      return reqToPromise((await store(name, 'readwrite')).put(value));
    },
    async delete(name, key) {
      return reqToPromise((await store(name, 'readwrite')).delete(key));
    },
    async clear(name) {
      return reqToPromise((await store(name, 'readwrite')).clear());
    },
    async recordsByModule(moduleId) {
      const s = await store('records', 'readonly');
      return reqToPromise(s.index('moduleId').getAll(moduleId));
    },
    async deleteRecordsByModule(moduleId) {
      const s = await store('records', 'readwrite');
      const keys = await reqToPromise(s.index('moduleId').getAllKeys(moduleId));
      await Promise.all(keys.map((k) => reqToPromise(s.delete(k))));
      return keys.length;
    },
  };
})();
