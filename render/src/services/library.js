// 我的材质库 —— 上传/AI 生成的材质样片存本机 IndexedDB，跨画板复用。

const DB_NAME = 'sail-library';
const STORE = 'items';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listLibrary() {
  try {
    const db = await openDb();
    const all = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return all.sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

export async function putLibraryItem(item) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(item);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  } catch {
    /* 保存失败不阻断 */
  }
}

export async function removeLibraryItem(id) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).delete(id);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  } catch {
    /* ignore */
  }
}
