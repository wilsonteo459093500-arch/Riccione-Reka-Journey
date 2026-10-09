// 本机存储（IndexedDB）：项目 / 报告 / 照片视频签名 / 设置
// 全部数据只存在这台手机的浏览器里；换手机请用「设置 → 备份」。

const DB_NAME = 'sail-site';
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('reports')) {
        const s = db.createObjectStore('reports', { keyPath: 'id' });
        s.createIndex('projectId', 'projectId');
        s.createIndex('templateId', 'templateId');
      }
      if (!db.objectStoreNames.contains('media')) {
        const s = db.createObjectStore('media', { keyPath: 'id' });
        s.createIndex('reportId', 'reportId');
      }
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // 连接被关闭（另一个标签页升级 / iOS 后台回收）→ 下次重新打开
      const reset = () => {
        try {
          db.close();
        } catch {
          /* ignore */
        }
        dbPromise = null;
      };
      db.onversionchange = reset;
      db.onclose = reset;
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('数据库被另一个标签页占用，请关闭其他标签页后重试'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function tx(store, mode, fn, retried = false) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        let t;
        try {
          t = db.transaction(store, mode);
        } catch (e) {
          // 连接已失效（iOS 从后台回来常见）：丢掉缓存的连接，重开一次再试
          dbPromise = null;
          if (!retried) tx(store, mode, fn, true).then(resolve, reject);
          else reject(e);
          return;
        }
        const s = t.objectStore(store);
        let result;
        Promise.resolve(fn(s)).then((r) => {
          result = r;
        });
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('事务中止（可能是手机存储空间不足）'));
      }),
  );
}

const wrap = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const db = {
  getAll: (store) => tx(store, 'readonly', (s) => wrap(s.getAll())),
  get: (store, id) => tx(store, 'readonly', (s) => wrap(s.get(id))),
  put: (store, value) => tx(store, 'readwrite', (s) => wrap(s.put(value))),
  del: (store, id) => tx(store, 'readwrite', (s) => wrap(s.delete(id))),
  byIndex: (store, index, value) =>
    tx(store, 'readonly', (s) => wrap(s.index(index).getAll(value))),
  delMany: (store, ids) =>
    tx(store, 'readwrite', (s) => Promise.all(ids.map((id) => wrap(s.delete(id))))),
  clear: (store) => tx(store, 'readwrite', (s) => wrap(s.clear())),
};

// ---- 设置（kv）----
export async function getSetting(key, fallback) {
  try {
    const row = await db.get('kv', key);
    return row ? row.value : fallback;
  } catch {
    return fallback;
  }
}
export const setSetting = (key, value) => db.put('kv', { key, value });

// ---- 媒体 ----
// Media = { id, reportId, kind: 'photo'|'video'|'signature', blob, thumb, w, h,
//           duration?, name?, caption?, createdAt }
export const putMedia = (m) => db.put('media', m);
export const getMedia = (id) => db.get('media', id);
export const deleteMedia = (ids) => (ids.length ? db.delMany('media', ids) : Promise.resolve());
export const mediaForReport = (reportId) => db.byIndex('media', 'reportId', reportId);

/** 渲染器用的媒体加载器（带缓存的 objectURL） */
export function createMediaLoader() {
  const cache = new Map();
  const urls = [];
  return {
    async get(id) {
      if (!id) return null;
      if (cache.has(id)) return cache.get(id);
      const m = await getMedia(id);
      cache.set(id, m || null);
      return m || null;
    },
    async url(id, which = 'blob') {
      const m = await this.get(id);
      // which: 'blob' 原图 | 'thumb' 缩略图 | 'poster' 视频封面
      // 视频不管要哪种都只给封面：视频的 blob 是视频文件本身，不能当图片；0 字节的 Blob 当作没有
      const ok = (x) => (x && x.size !== 0 ? x : null);
      const b =
        m &&
        (m.kind === 'video' || which === 'poster'
          ? ok(m.poster) || ok(m.thumb)
          : which === 'thumb'
            ? ok(m.thumb) || ok(m.blob)
            : ok(m.blob) || ok(m.thumb));
      if (!b) return null;
      const u = URL.createObjectURL(b);
      urls.push(u);
      return u;
    },
    dispose() {
      urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
      cache.clear();
    },
  };
}

/** 请求持久化存储（降低被系统清理的概率） */
export async function requestPersist() {
  try {
    if (navigator.storage?.persist) {
      const already = await navigator.storage.persisted?.();
      if (already) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function storageEstimate() {
  try {
    if (navigator.storage?.estimate) return await navigator.storage.estimate();
  } catch {
    /* ignore */
  }
  return null;
}
