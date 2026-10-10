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

// 旧版的字体 id → 新版（旧版 'serif' 是 Fraunces、'sans' 是 DM Sans；新版同名 id 换成了思源宋体 / Outfit；
// 三款旧版字体的中文都落到思源黑体，新版同名的落到思源宋体）
const UKIR_FONTS = { serif: 'fraunces', sans: 'dmsans', elegant: 'elegant-ukir' };

/** 旧画板记录 → 新画板记录（独立画板，不属于任何提案） */
export function convertBoard(rec, now = Date.now()) {
  const items = (rec.items || [])
    .filter((it) => it && it.dataUrl)
    .map(({ busy, ...it }) => ({ rot: 0, label: '', ...it }));
  const old = rec.board || {};
  return {
    id: rec.id,
    projectId: STANDALONE_ID,
    name: rec.name || '画板',
    board: {
      ...DEFAULT_BOARD,
      ...old,
      titleFont: UKIR_FONTS[old.titleFont] || old.titleFont || 'fraunces',
      // 旧版下载的 PNG 默认带编号图例
      showLegend: old.showLegend ?? items.some((it) => (it.label || '').trim()),
    },
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

let running = null;
/** 同一页里只跑一次；独立画板页要等它搬完再读画板（否则会先建一块空画板） */
export function migrateOnce() {
  if (!running) running = migrateFromUkir().catch(() => ({ library: 0, boards: 0, failed: 0 }));
  return running;
}

/**
 * 把旧版 UKIR STUDIO 的材质库和画板搬进来（只搬一次；返回搬了多少）
 * @returns {Promise<{ library:number, boards:number }>}
 */
export async function migrateFromUkir({ force = false } = {}) {
  const result = { library: 0, boards: 0, failed: 0 };
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
        else result.failed += 1;
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
        else result.failed += 1;
      }
      if (result.boards && oldActive && !(await getActiveBoardId(STANDALONE_ID))) {
        await setActiveBoardId(STANDALONE_ID, oldActive);
      }
    }
  }

  // 全部写进去了才记「已搬完」；有写失败的（如存储空间不足）下次打开再补（按 id 跳过已搬的）
  if (!result.failed) {
    try {
      localStorage.setItem(DONE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }
  return result;
}
