// 生成历史 —— 存在本机 IndexedDB，最多保留 MAX_RECORDS 条（自动淘汰最旧的非收藏记录）。

const DB_NAME = 'sail-render';
const STORE = 'renders';
const MAX_RECORDS = 60;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const out = fn(store);
    t.oncomplete = () => resolve(out?.result !== undefined ? out.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export async function listHistory() {
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

export async function saveRecord(record) {
  try {
    const db = await openDb();
    await tx(db, 'readwrite', (store) => store.put(record));
    // 超量清理：删最旧的非收藏
    const all = await listHistory();
    const extra = all.filter((r) => !r.fav).slice(Math.max(0, MAX_RECORDS - all.filter((r) => r.fav).length));
    if (all.length > MAX_RECORDS && extra.length) {
      const toDelete = extra.slice(-(all.length - MAX_RECORDS));
      await tx(db, 'readwrite', (store) => {
        toDelete.forEach((r) => store.delete(r.id));
      });
    }
  } catch {
    /* 历史保存失败不影响主流程 */
  }
}

export async function updateRecord(id, patch) {
  try {
    const db = await openDb();
    const rec = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (rec) await tx(db, 'readwrite', (store) => store.put({ ...rec, ...patch }));
  } catch {
    /* ignore */
  }
}

export async function deleteRecord(id) {
  try {
    const db = await openDb();
    await tx(db, 'readwrite', (store) => store.delete(id));
  } catch {
    /* ignore */
  }
}
