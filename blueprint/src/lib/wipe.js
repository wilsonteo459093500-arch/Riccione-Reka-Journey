// 「清除本机全部资料」：这台电脑上 UKIR STUDIO 的东西全部删掉 —— 项目、图片、画板、材质库、备份记录、AI key、登录。
// 用在：电脑要交给别人 / 不再用这台电脑做提案。删之前界面会先请设计师「全部备份」。
// 别的 UKIR STUDIO 分页还开着时不删（它们手上的项目会马上又存回来）。

import { DB_NAMES as MAIN_DBS, closeDb as closeMain } from '../store/db.js';
import { DB_NAMES as LOCAL_DBS, closeDb as closeLocal } from '../store/local.js';
import { DB_NAMES as BOARD_DBS, closeDb as closeBoards } from '../moodboard/store.js';
import { DB_NAMES as LIBRARY_DBS, closeDb as closeLibrary } from '../moodboard/library.js';
import { LEGACY_DB_NAMES } from '../moodboard/migrate.js';
import { otherTabCount } from './locks.js';

/** 要删的库（旧版 UKIR STUDIO 的也删，不然下次打开又会被搬回来） */
export const ALL_DB_NAMES = [...MAIN_DBS, ...BOARD_DBS, ...LIBRARY_DBS, ...LOCAL_DBS, ...LEGACY_DB_NAMES];

function deleteDb(name, timeout = 8000) {
  return new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.deleteDatabase(name);
    } catch {
      resolve('failed');
      return;
    }
    const timer = setTimeout(() => resolve('blocked'), timeout);
    req.onsuccess = () => {
      clearTimeout(timer);
      resolve('ok');
    };
    req.onerror = () => {
      clearTimeout(timer);
      resolve('failed');
    };
    // blocked：还有连接没关；别的分页收到 versionchange 会自己关，等 onsuccess 或超时
  });
}

/**
 * 删光。别的分页开着 → 抛错（不删）
 * @returns {Promise<{ failed:string[] }>}
 */
export async function wipeLocalData() {
  const others = await otherTabCount();
  if (others) throw new Error(`还有 ${others} 个 UKIR STUDIO 分页开着 —— 先把它们关掉，再按一次。`);
  await Promise.all([closeMain(), closeLocal(), closeBoards(), closeLibrary()]);
  const failed = [];
  for (const name of ALL_DB_NAMES) {
    const r = await deleteDb(name);
    if (r !== 'ok') failed.push(name);
  }
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
  return { failed };
}
