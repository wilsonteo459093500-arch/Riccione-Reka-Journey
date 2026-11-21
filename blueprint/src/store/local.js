// 这台电脑上的小设定（IndexedDB 'ukir-local'，不进项目备份）：
//   backupFolder → 「全部备份」选过的资料夹（FileSystemDirectoryHandle，只有 IndexedDB 存得住）

const DB_NAME = 'ukir-local';
const KV = 'kv';
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(KV)) req.result.createObjectStore(KV);
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const t = db.transaction(KV, mode);
    let result;
    const req = fn(t.objectStore(KV));
    if (req) req.onsuccess = () => (result = req.result);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('IndexedDB 事务中止'));
  });
}

export async function getLocal(key) {
  try {
    return await tx('readonly', (s) => s.get(key));
  } catch {
    return undefined;
  }
}

export async function setLocal(key, value) {
  try {
    await tx('readwrite', (s) => s.put(value, key));
    return true;
  } catch {
    return false;
  }
}

export async function closeDb() {
  const p = dbPromise;
  dbPromise = null;
  try {
    (await p)?.close();
  } catch {
    /* ignore */
  }
}

export const DB_NAMES = [DB_NAME];
