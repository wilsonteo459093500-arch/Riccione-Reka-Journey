// 我的材质库 —— 上传 / AI 生成的材质样片存本机 IndexedDB，跨项目、跨画板复用。
//   items：{ id, dataUrl, name, cat, ts }

const DB_NAME = 'blueprint-library';
const STORE = 'items';

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
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
    const t = db.transaction(STORE, mode);
    let result;
    const req = fn(t.objectStore(STORE));
    if (req) req.onsuccess = () => (result = req.result);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('IndexedDB 事务中止'));
  });
}

export async function listLibrary() {
  try {
    const all = (await tx('readonly', (s) => s.getAll())) || [];
    return all.sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

/** 返回是否保存成功 */
export async function putLibraryItem(item) {
  try {
    await tx('readwrite', (s) => s.put(item));
    return true;
  } catch {
    return false;
  }
}

export async function removeLibraryItem(id) {
  try {
    await tx('readwrite', (s) => s.delete(id));
  } catch {
    /* ignore */
  }
}
