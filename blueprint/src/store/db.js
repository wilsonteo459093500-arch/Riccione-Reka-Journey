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
      req.onsuccess = () => {
        const db = req.result;
        // 别的分页要删库（「清除本机全部资料」）/ 升级：先放手，下次用到再重新打开
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

/** 关掉连接（删库前用）；之后再读写会自动重新打开 */
export async function closeDb() {
  const p = dbPromise;
  dbPromise = null;
  try {
    (await p)?.close();
  } catch {
    /* 没打开过 / 打开失败 */
  }
}

export const DB_NAMES = [DB_NAME];

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
    const write = (rec) => {
      try {
        s.put(rec);
      } catch (err) {
        failure = err; // 例如存储空间不足：中止事务，交给 onabort 报错
        t.abort();
      }
    };
    if (expectedRev === undefined) {
      const g = s.get(project.id);
      g.onsuccess = () => {
        out = { ...project, rev: (g.result?.rev || 0) + 1, updatedAt: Date.now() };
        write(out);
      };
    } else {
      // get 和 put 同一刻排进事务：关标签页 / 刷新时这次保存也来得及写进去。
      // 请求按顺序执行，get 看到的是 put 之前的版本；版本不对 → abort，连同 put 一起回滚
      out = { ...project, rev: expectedRev + 1, updatedAt: Date.now() };
      const g = s.get(project.id);
      g.onsuccess = () => {
        const cur = g.result;
        conflict = !cur ? 'deleted' : (cur.rev || 0) !== expectedRev ? 'changed' : null;
        if (conflict) t.abort();
      };
      write(out);
    }
    t.oncomplete = () => resolve(out);
    t.onabort = () =>
      reject(conflict ? new ProjectConflictError(conflict) : failure || t.error || new Error('IndexedDB 事务中止（可能是浏览器存储空间不足）'));
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

/**
 * 全部图片的清单（不读图片内容）：[{ id, projectId, ts, size }] —— 清理没人用的图片时用
 * IndexedDB 取出来的 Blob 只是个把手，读 size 不会把整张图读进内存
 */
export async function listAssetInfo() {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const out = [];
    const t = db.transaction('assets', 'readonly');
    const req = t.objectStore('assets').openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      const v = cur.value || {};
      out.push({ id: v.id, projectId: v.projectId ?? null, ts: v.ts || 0, size: v.blob?.size || 0 });
      cur.continue();
    };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
  });
}

/** 一次删掉多张图片 */
export async function deleteAssetRecords(ids) {
  if (!ids?.length) return;
  await run('assets', 'readwrite', (s) => {
    for (const id of ids) s.delete(id);
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

/**
 * 长期保存（浏览器答应了，空间紧张时就不会自己清掉这个网站的资料）
 * @returns {Promise<'on'|'off'|'unsupported'>}
 */
export async function persistenceState() {
  try {
    if (!navigator.storage?.persisted) return 'unsupported';
    return (await navigator.storage.persisted()) ? 'on' : 'off';
  } catch {
    return 'unsupported';
  }
}

/** 申请长期保存（Chrome 按网站常不常用、有没有加书签自己决定；Firefox 会问用户）→ 现在的状态 */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return await persistenceState();
    if (await navigator.storage.persisted()) return 'on';
    return (await navigator.storage.persist()) ? 'on' : 'off';
  } catch {
    return await persistenceState();
  }
}
