// ============================================================
// STORAGE SERVICE
// IndexedDB-backed key/value store. Chosen over localStorage so
// base64-encoded attachments (up to a few MB each) don't blow the
// ~5MB localStorage ceiling. Exposes a tiny async interface:
//   get(key) -> string | null
//   set(key, value) -> void
//   del(key) -> void
//
// If the host page already provides `window.storage` (e.g. the
// original AI Studio shared-storage runtime), we defer to it so the
// "全员同步 (shared storage)" semantics are preserved.
// ============================================================

const DB_NAME = 'sail-os';
const STORE = 'kv';

let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDel(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Adapter for a host-provided shared storage runtime, if present.
const host = typeof window !== 'undefined' ? window.storage : null;

export const storage = host
  ? {
      async get(key) {
        const r = await host.get(key, true);
        return r?.value ?? null;
      },
      set: (key, value) => host.set(key, value, true),
      del: (key) => host.delete(key, true),
    }
  : {
      get: idbGet,
      set: idbSet,
      del: idbDel,
    };
