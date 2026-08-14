// 项目存档 —— 存在本机 IndexedDB。
// 只存「脑子」（配方 / 剪辑方案 / 文案 / 素材元数据 + 缩略图），不存原始视频二进制：
// 一条手机原片动辄几百 MB，塞进 IndexedDB 只会把浏览器拖垮。
// 重新打开项目时，把原文件重新拖进来即可继续预览和导出。

const DB_NAME = 'riccione-studio';
const STORE = 'projects';
const VERSION = 1;
const MAX_RECORDS = 40;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.onerror = () => reject(t.error);
        t.oncomplete = () => resolve(req?.result);
      })
  );
}

/** 素材去掉 File 对象和 objectURL 再落盘 */
function slimAssets(assets = []) {
  return assets.map(({ file, url, frames, ...rest }) => rest);
}

export async function listProjects() {
  try {
    const all = await new Promise((resolve, reject) => {
      openDb().then((db) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      }, reject);
    });
    return all.sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

export async function saveProject(project) {
  try {
    const record = { ...project, ts: Date.now(), assets: slimAssets(project.assets) };
    await run('readwrite', (s) => s.put(record));
    const all = await listProjects();
    if (all.length > MAX_RECORDS) {
      const doomed = all.slice(MAX_RECORDS);
      await run('readwrite', (s) => doomed.forEach((r) => s.delete(r.id)));
    }
    return record;
  } catch {
    return null; // 存档失败不该打断创作
  }
}

export async function deleteProject(id) {
  try {
    await run('readwrite', (s) => s.delete(id));
  } catch {
    /* ignore */
  }
}
