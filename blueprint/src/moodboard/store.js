// Material Board 持久化 —— 本机 IndexedDB（与项目库分开）：
//   boards：{ id, projectId, name, board, items, createdAt, ts }   按项目分组（索引 projectId）
//   shots ：{ id, boardId, projectId, dataUrl, ts }                AI 实拍排版历史（索引 boardId，大图不跟画板一起反复写）
//   kv    ：'active:<projectId>' → 当前画板 id
// 写入失败（如存储空间不足）返回 false，由界面提示；读取失败返回空，不阻断使用。

const DB_NAME = 'blueprint-moodboard';
const DB_VERSION = 1;
const KV = 'kv';
const BOARDS = 'boards';
const SHOTS = 'shots';

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
        if (!db.objectStoreNames.contains(BOARDS)) {
          db.createObjectStore(BOARDS, { keyPath: 'id' }).createIndex('projectId', 'projectId', { unique: false });
        }
        if (!db.objectStoreNames.contains(SHOTS)) {
          db.createObjectStore(SHOTS, { keyPath: 'id' }).createIndex('boardId', 'boardId', { unique: false });
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

/** 一个事务：fn(store) 可返回 request，resolve 它的 result */
async function tx(storeName, mode, fn) {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    let result;
    const req = fn(t.objectStore(storeName));
    if (req) req.onsuccess = () => (result = req.result);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('IndexedDB 事务中止'));
  });
}

const byIndex = (storeName, index, key) => tx(storeName, 'readonly', (s) => s.index(index).getAll(IDBKeyRange.only(key)));

// ---------------- 画板 ----------------

/** 某项目的全部画板（按创建先后，第一块 = 方案封面画板） */
export async function listBoards(projectId) {
  try {
    const all = (await byIndex(BOARDS, 'projectId', projectId)) || [];
    return all.sort((a, b) => (a.createdAt || a.ts || 0) - (b.createdAt || b.ts || 0));
  } catch {
    return [];
  }
}

export async function putBoard(rec) {
  try {
    await tx(BOARDS, 'readwrite', (s) => s.put(rec));
    return true;
  } catch {
    return false;
  }
}

export async function removeBoard(id) {
  try {
    await tx(BOARDS, 'readwrite', (s) => s.delete(id));
    const shots = (await byIndex(SHOTS, 'boardId', id)) || [];
    if (shots.length) await tx(SHOTS, 'readwrite', (s) => shots.forEach((r) => s.delete(r.id)));
  } catch {
    /* ignore */
  }
}

/** 删除项目时一并清理（壳层可选调用） */
export async function removeBoardsOf(projectId) {
  for (const b of await listBoards(projectId)) await removeBoard(b.id);
  try {
    await tx(KV, 'readwrite', (s) => s.delete(`active:${projectId}`));
  } catch {
    /* ignore */
  }
}

export async function getActiveBoardId(projectId) {
  try {
    return (await tx(KV, 'readonly', (s) => s.get(`active:${projectId}`))) || null;
  } catch {
    return null;
  }
}

export async function setActiveBoardId(projectId, id) {
  try {
    await tx(KV, 'readwrite', (s) => s.put(id, `active:${projectId}`));
  } catch {
    /* ignore */
  }
}

// ---------------- 实拍排版历史 ----------------

/** 某画板的实拍排版（新→旧） */
export async function listShots(boardId) {
  try {
    const all = (await byIndex(SHOTS, 'boardId', boardId)) || [];
    return all.sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

/** 存一张，并只保留最新 keep 张；返回是否成功 */
export async function putShot(rec, keep = 8) {
  try {
    await tx(SHOTS, 'readwrite', (s) => s.put(rec));
    const all = await listShots(rec.boardId);
    const old = all.slice(keep);
    if (old.length) await tx(SHOTS, 'readwrite', (s) => old.forEach((r) => s.delete(r.id)));
    return true;
  } catch {
    return false;
  }
}

export async function removeShot(id) {
  try {
    await tx(SHOTS, 'readwrite', (s) => s.delete(id));
  } catch {
    /* ignore */
  }
}

// ---------------- 项目备份 / 复制项目 ----------------

/** 某项目的全部画板（含 AI 实拍历史）+ 当前画板 —— 项目备份 / 复制项目时一起带走 */
export async function exportBoardsOf(projectId) {
  const boards = [];
  for (const b of await listBoards(projectId)) boards.push({ ...b, shots: await listShots(b.id) });
  return { boards, active: await getActiveBoardId(projectId) };
}

/**
 * 把画板接到（新）项目上：画板、实拍图都换新 id。写不进去（存储空间不足）就抛错，由调用方清理。
 * @param {{ boards?:object[], active?:string }} data  exportBoardsOf 的结果
 * @param {(prefix:string)=>string} makeId
 * @returns {Promise<number>} 接上的画板数
 */
export async function importBoardsTo(projectId, data, makeId) {
  const idMap = new Map();
  for (const b of data?.boards || []) {
    if (!b || !b.id) continue;
    const { shots = [], ...rec } = b;
    const id = makeId('b');
    idMap.set(b.id, id);
    if (!(await putBoard({ ...rec, id, projectId }))) throw new Error('画板没能保存（浏览器存储空间可能不足）');
    for (const s of [...shots].reverse()) {
      if (!s?.dataUrl) continue;
      if (!(await putShot({ ...s, id: makeId('shot'), boardId: id, projectId }))) throw new Error('实拍图没能保存（浏览器存储空间可能不足）');
    }
  }
  if (data?.active && idMap.has(data.active)) await setActiveBoardId(projectId, idMap.get(data.active));
  return idMap.size;
}
