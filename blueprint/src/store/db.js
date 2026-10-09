// 本机存储（IndexedDB）—— 项目 JSON + 图片素材（Blob）。全部留在设计师自己的浏览器里，不上传任何服务器。
//   projects：{ ...Project }                     keyPath id
//   assets  ：{ id, projectId, blob, mime, w, h, ts }  keyPath id，索引 projectId

const DB_NAME = 'dreamhouse-blueprint';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('assets')) {
          const s = db.createObjectStore('assets', { keyPath: 'id' });
          s.createIndex('projectId', 'projectId', { unique: false });
        }
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

function run(storeName, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const store = t.objectStore(storeName);
        let result;
        const req = fn(store);
        if (req) req.onsuccess = () => (result = req.result);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('IndexedDB 事务中止（可能是浏览器存储空间不足）'));
      })
  );
}

// ---------------- 项目 ----------------

export async function listProjects() {
  const all = (await run('projects', 'readonly', (s) => s.getAll())) || [];
  return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export const getProject = (id) => run('projects', 'readonly', (s) => s.get(id));

/** 保存冲突：库里的项目在别处（另一个标签页）改过，或已被删除 —— 不覆盖 */
export class ProjectConflictError extends Error {
  constructor(kind) {
    super(kind === 'deleted' ? '这个项目已经被删除了' : '这个项目在另一个窗口里改过');
    this.name = 'ProjectConflictError';
    this.conflict = kind;
  }
}

/**
 * 保存项目（版本号 rev 每次 +1）。
 * expectedRev（编辑器自动保存时传）：库里的版本不是它 / 项目已被删除 → 抛 ProjectConflictError，不覆盖别人的修改。
 * 不传 = 新建 / 导入 / 复制（直接写）。
 */
export async function saveProject(project, expectedRev) {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const t = db.transaction('projects', 'readwrite');
    const s = t.objectStore('projects');
    let out = null;
    let conflict = null;
    let failure = null;
    const g = s.get(project.id);
    g.onsuccess = () => {
      const cur = g.result;
      if (expectedRev !== undefined) {
        if (!cur) conflict = 'deleted';
        else if ((cur.rev || 0) !== expectedRev) conflict = 'changed';
      }
      if (conflict) return;
      out = { ...project, rev: (cur?.rev || 0) + 1, updatedAt: Date.now() };
      try {
        s.put(out);
      } catch (err) {
        failure = err; // 例如存储空间不足：中止事务，交给 onabort 报错
        t.abort();
      }
    };
    t.oncomplete = () => (conflict ? reject(new ProjectConflictError(conflict)) : resolve(out));
    t.onerror = () => reject(failure || t.error);
    t.onabort = () => reject(failure || t.error || new Error('IndexedDB 事务中止（可能是浏览器存储空间不足）'));
  });
}

export async function deleteProject(id) {
  await run('projects', 'readwrite', (s) => s.delete(id));
  await deleteAssetsOf(id);
}

// ---------------- 素材 ----------------

export async function putAssetRecord(rec) {
  await run('assets', 'readwrite', (s) => s.put(rec));
  return rec.id;
}

export const getAssetRecord = (id) => run('assets', 'readonly', (s) => s.get(id));

export async function deleteAssetRecord(id) {
  await run('assets', 'readwrite', (s) => s.delete(id));
}

export async function deleteAssetsOf(projectId) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const t = db.transaction('assets', 'readwrite');
    const idx = t.objectStore('assets').index('projectId');
    const req = idx.openKeyCursor(IDBKeyRange.only(projectId));
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) {
        t.objectStore('assets').delete(cur.primaryKey);
        cur.continue();
      }
    };
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}

/** 估算本机存储用量（浏览器支持时） */
export async function storageEstimate() {
  try {
    const est = await navigator.storage?.estimate?.();
    return est ? { usage: est.usage || 0, quota: est.quota || 0 } : null;
  } catch {
    return null;
  }
}

/** 申请持久化存储，避免浏览器在空间紧张时清掉项目 */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist?.();
  } catch {
    /* ignore */
  }
}
