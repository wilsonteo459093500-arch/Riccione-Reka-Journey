// 随网站发布的溪岸板材库（library.js）：单独一块，用到的时候才下载、登记（src: 'bundled'）。
//
// 为什么不在 materials.js 里直接 import：板材库跟着板材数量长（每块约 60–100 字节 gzip），
// 客人的手机做测验、入口页、许愿模式外壳都用不到它（测验配案例只看 case.materials —— 设板材时 near 已经写进去了，R11 a）。
// 要用的地方先 await bundledBoards()：3D 工作室开机（和本机板材包 boardsReady 一起，最多等 400 ms）、
// 案例库的板材页 / 板材选择、案例详情里有板材的案例。登记好以后 onBoards 会通知，界面自己再套一次。
//
// 这个文件只给页面用：swatch worker 之类的 worker 不 import 它（materials.js 也不），不会把板材库打进 worker。

import { registerBoards, boardsEpoch } from './library-api.js';

let mod = null; // import('./library.js') 的 Promise（下载失败就清掉，下次再试）
let doneAt = -1; // 在哪一次 resetBoards 之后登记过（测试里 reset 之后再调会重新登记）

/**
 * 随网站的板材登记好了 → { count }（第一次调用开始下载；之后很快；不会 reject —— 离线 / 下载失败 = { count: 0 }，下次再试）。
 * 登记是幂等的：同一份资料再登记一次什么都不变。
 */
export async function bundledBoards() {
  try {
    mod = mod || import('./library.js');
    const m = await mod;
    const list = Array.isArray(m.LIBRARY) ? m.LIBRARY : [];
    if (doneAt !== boardsEpoch()) {
      registerBoards(list, { src: 'bundled' });
      doneAt = boardsEpoch();
    }
    return { count: list.length };
  } catch {
    mod = null;
    return { count: 0 };
  }
}

/** 随网站的那份登记过了没有（同步；界面决定要不要先 await） */
export const bundledLoaded = () => doneAt === boardsEpoch();
