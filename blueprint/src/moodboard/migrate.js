// 从旧版 UKIR STUDIO（render/，IndexedDB 'sail-library' / 'sail-moodboard'）搬数据过来。
// 只有新版部署在旧版同一个网址（同源）时才读得到；读不到 = 什么也不做。
// 幂等：按 id 跳过已经搬过的；旧库只读不删（万一要回退，旧版数据还在）。

import { listLibrary, putLibraryItem } from './library.js';
import { listBoards, putBoard, getActiveBoardId, setActiveBoardId } from './store.js';
import { DEFAULT_BOARD, STANDALONE_ID } from './constants.js';

const OLD_LIBRARY = 'sail-library';
const OLD_BOARDS = 'sail-moodboard';
const DONE_KEY = 'ukir.migrated.v1';

/** 打开已存在的库；不存在时不创建（升级回调里中止），返回 null */
function openExisting(name) {
  return new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(name);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      // 版本从 0 升上来 = 这台电脑上没有旧库：中止，别留下空库
      try {
        req.transaction.abort();
      } catch {
        /* ignore */
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function readAll(db, store) {
  return new Promise((resolve) => {
    if (!db.objectStoreNames.contains(store)) {
      resolve([]);
      return;
    }
    try {
      const req = db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function readKey(db, store, key) {
  return new Promise((resolve) => {
    if (!db.objectStoreNames.contains(store)) {
      resolve(undefined);
      return;
    }
    try {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

async function oldDbExists(name) {
  if (typeof indexedDB === 'undefined') return false;
  if (typeof indexedDB.databases === 'function') {
    try {
      const list = await indexedDB.databases();
      return list.some((d) => d.name === name);
    } catch {
      /* 继续用 open 探测 */
    }
  }
  return true; // 不支持 databases()：交给 openExisting 判断
}

/** 旧画板记录 → 新画板记录（独立画板，不属于任何提案） */
export function convertBoard(rec, now = Date.now()) {
  const items = (rec.items || [])
    .filter((it) => it && it.dataUrl)
    .map(({ busy, ...it }) => ({ rot: 0, label: '', ...it }));
  return {
    id: rec.id,
    projectId: STANDALONE_ID,
    name: rec.name || '画板',
    board: { ...DEFAULT_BOARD, ...(rec.board || {}) },
    items,
    createdAt: rec.createdAt || rec.ts || now,
    ts: rec.ts || now,
    fromUkir: true,
  };
}

/** 旧素材库条目 → 新条目（同一结构，补齐缺省字段） */
export function convertLibraryItem(item, now = Date.now()) {
  if (!item || !item.id || !item.dataUrl) return null;
  return { name: '', cat: 'other', ts: now, ...item };
}

/**
 * 把旧版 UKIR STUDIO 的材质库和画板搬进来（只搬一次；返回搬了多少）
 * @returns {Promise<{ library:number, boards:number }>}
 */
export async function migrateFromUkir({ force = false } = {}) {
  const result = { library: 0, boards: 0 };
  try {
    if (!force && localStorage.getItem(DONE_KEY)) return result;
  } catch {
    /* 读不了 localStorage 就照常尝试 */
  }

  // 材质库
  if (await oldDbExists(OLD_LIBRARY)) {
    const db = await openExisting(OLD_LIBRARY);
    if (db) {
      const old = await readAll(db, 'items');
      db.close();
      const have = new Set((await listLibrary()).map((x) => x.id));
      for (const raw of old) {
        const item = convertLibraryItem(raw);
        if (!item || have.has(item.id)) continue;
        if (await putLibraryItem(item)) result.library += 1;
      }
    }
  }

  // 画板（含更早的单画板格式 kv/current）
  if (await oldDbExists(OLD_BOARDS)) {
    const db = await openExisting(OLD_BOARDS);
    if (db) {
      let old = await readAll(db, 'boards');
      if (!old.length) {
        const legacy = await readKey(db, 'kv', 'current');
        if (legacy && (legacy.board || legacy.items?.length)) {
          old = [{ id: 'b-ukir-legacy', name: '画板 1', board: legacy.board || {}, items: legacy.items || [], ts: Date.now() }];
        }
      }
      const oldActive = await readKey(db, 'kv', 'activeId');
      db.close();
      const have = new Set((await listBoards(STANDALONE_ID)).map((b) => b.id));
      for (const raw of old) {
        if (!raw?.id || have.has(raw.id)) continue;
        if (await putBoard(convertBoard(raw))) result.boards += 1;
      }
      if (result.boards && oldActive && !(await getActiveBoardId(STANDALONE_ID))) {
        await setActiveBoardId(STANDALONE_ID, oldActive);
      }
    }
  }

  try {
    localStorage.setItem(DONE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  return result;
}
