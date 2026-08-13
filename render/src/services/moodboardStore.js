// Mood board 持久化 v2 —— 支持多块画板（每个项目一块），存本机 IndexedDB。
// 旧版单画板数据（kv/current）首次加载时自动迁移成第一块画板。

const DB_NAME = 'sail-moodboard';
const KV = 'kv';
const BOARDS = 'boards';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
      if (!db.objectStoreNames.contains(BOARDS)) db.createObjectStore(BOARDS, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function kvGet(db, key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(KV, 'readonly').objectStore(KV).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function kvSet(db, key, value) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(KV, 'readwrite');
    t.objectStore(KV).put(value, key);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}

/** 列出全部画板（新→旧），并完成旧版数据迁移 */
export async function listBoards() {
  try {
    const db = await openDb();
    let all = await new Promise((resolve, reject) => {
      const req = db.transaction(BOARDS, 'readonly').objectStore(BOARDS).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    // 旧版单画板迁移
    if (!all.length) {
      const legacy = await kvGet(db, 'current');
      if (legacy?.board || legacy?.items?.length) {
        const rec = {
          id: `b-${Date.now().toString(36)}`,
          name: '画板 1',
          board: legacy.board || {},
          items: legacy.items || [],
          ts: Date.now(),
        };
        await putBoard(rec);
        await kvSet(db, 'activeId', rec.id);
        all = [rec];
      }
    }
    return all.sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

export async function putBoard(rec) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const t = db.transaction(BOARDS, 'readwrite');
      t.objectStore(BOARDS).put(rec);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  } catch {
    /* 保存失败不阻断使用 */
  }
}

export async function removeBoard(id) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const t = db.transaction(BOARDS, 'readwrite');
      t.objectStore(BOARDS).delete(id);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  } catch {
    /* ignore */
  }
}

export async function getActiveBoardId() {
  try {
    const db = await openDb();
    return (await kvGet(db, 'activeId')) || null;
  } catch {
    return null;
  }
}

export async function setActiveBoardId(id) {
  try {
    const db = await openDb();
    await kvSet(db, 'activeId', id);
  } catch {
    /* ignore */
  }
}
