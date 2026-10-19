// 工作室里的「参考案例」：案例库（src/shared/cases.js，DATA）按需载入 —— 只有从「带它回家」进来、选过案例的方案才用得到，
// 一般打开工作室不多读一个文件。案例库打不开（旧版、离线）→ 只显示链接里带的标题，不出错。

import { useEffect, useRef, useState } from 'react';

let mod = null;
/** 案例库模块（失败 → null，下次再试） */
export function casesLib() {
  if (!mod)
    mod = import('../../shared/cases.js').catch(() => {
      mod = null;
      return null;
    });
  return mod;
}

/** 一个案例（找不到 / 案例库打不开 → null） */
export async function loadCase(id) {
  if (!id) return null;
  const m = await casesLib();
  if (!m?.getCase) return null;
  try {
    return (await m.getCase(id)) || null;
  } catch {
    return null;
  }
}

/** 一个案例的全部照片（对照用：1600 大图 + 480 小图）→ { c, release } */
export async function caseWithImages(c) {
  const m = await casesLib();
  if (!m?.resolveImages || !c) return { c, release: () => {} };
  try {
    const rc = await m.resolveImages(c);
    return { c: rc, release: () => m.releaseImages?.(rc) };
  } catch {
    return { c, release: () => {} };
  }
}

/** 照片拍的是哪个房间（「客厅」「整个家（3D）」） */
export function roomName(m, id) {
  try {
    return m?.roomLabel?.(id) || '';
  } catch {
    return '';
  }
}

/**
 * 方案里选过的几个案例（refs = [{ id, rev, title }]）→ { ready, mod, cases: { id: Case|null }, cover: { id: 480 网址|null } }。
 * 只读封面（设备上的照片才会建 object URL，换了 / 卸载时释放）。
 */
export function useCaseLib(refs) {
  const key = (refs || []).map((r) => r?.id).filter(Boolean).join('|');
  const [lib, setLib] = useState({ ready: !key, mod: null, cases: {}, cover: {} });
  const held = useRef([]);
  useEffect(() => {
    let alive = true;
    if (!key) {
      setLib({ ready: true, mod: null, cases: {}, cover: {} });
      return undefined;
    }
    (async () => {
      const m = await casesLib();
      const cases = {};
      const cover = {};
      const mine = [];
      for (const id of key.split('|')) {
        try {
          const c = m ? await m.getCase(id) : null;
          cases[id] = c || null;
          if (c && m) {
            const rc = await m.resolveImages(c, { coverOnly: true });
            mine.push(rc);
            const im = m.coverOf(rc);
            cover[id] = im ? m.imageURL(rc, im, 480) || null : null;
          }
        } catch {
          cases[id] = null;
        }
      }
      if (!alive) {
        for (const rc of mine) m?.releaseImages?.(rc);
        return;
      }
      for (const rc of held.current) m?.releaseImages?.(rc);
      held.current = mine;
      setLib({ ready: true, mod: m, cases, cover });
    })();
    return () => {
      alive = false;
    };
  }, [key]);
  useEffect(
    () => () => {
      casesLib().then((m) => {
        for (const rc of held.current) m?.releaseImages?.(rc);
        held.current = [];
      });
    },
    [],
  );
  return lib;
}
