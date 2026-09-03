// 项目存本机 IndexedDB（图 + 比例 + 所有测量），刷新/关掉浏览器都还在。
// 和 repo 其他 app 一样：不上传服务器，图纸永远在自己手上。

const DB_NAME = 'ukur-measure';
const STORE = 'projects';
const MAX_PROJECTS = 30;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
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
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.onerror = () => reject(tx.error);
        tx.oncomplete = () => resolve(req ? req.result : undefined);
      })
  );
}

export async function listProjects() {
  try {
    const all = (await run('readonly', (s) => s.getAll())) || [];
    return all
      .map(({ plan, ...rest }) => ({ ...rest, thumb: plan?.dataUrl || null, planName: plan?.name || '' }))
      .sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

export async function getProject(id) {
  try {
    return (await run('readonly', (s) => s.get(id))) || null;
  } catch {
    return null;
  }
}

export async function saveProject(project) {
  try {
    await run('readwrite', (s) => s.put({ ...project, ts: Date.now() }));
    const all = (await run('readonly', (s) => s.getAll())) || [];
    if (all.length > MAX_PROJECTS) {
      const old = all.sort((a, b) => b.ts - a.ts).slice(MAX_PROJECTS);
      for (const p of old) await run('readwrite', (s) => s.delete(p.id));
    }
    return true;
  } catch (e) {
    console.warn('保存失败', e);
    return false;
  }
}

export async function deleteProject(id) {
  try {
    await run('readwrite', (s) => s.delete(id));
    return true;
  } catch {
    return false;
  }
}
