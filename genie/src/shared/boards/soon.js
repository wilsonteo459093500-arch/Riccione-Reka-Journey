// 用到板材的那一刻才读板材（R11 f）：随网站的板材库（library.js 那一块）+ 这台设备导入的板材包（device.js，IndexedDB）。
// 两块一起开始下载（不是一个读完再读下一个），最多等 ms 毫秒（默认 400）—— 等不到也照常往下走，读好了 onBoards 会通知，界面再套一次。
// 很小，可以放在客人的测验 / 许愿模式 / 3D 工作室里静态 import：真正的代码都是用到时才下载（import()）。

import { MAT_BY_ID } from '../materials.js';

/** 这几个 id 里有没有这台设备还不认得的溪岸板材（'sail-…'） */
export const missingBoardIds = (ids) => (ids || []).some((id) => typeof id === 'string' && id.startsWith('sail-') && !MAT_BY_ID[id]?.board);

/** 读板材（随网站的 + 这台设备的），最多等 ms；→ Promise（不会 reject） */
export function boardsSoon(ms = 400) {
  const all = Promise.all([
    import('./bundled.js').then((m) => m.bundledBoards()),
    import('./device.js').then((m) => m.boardsReady()),
  ]).catch(() => null);
  return ms > 0 ? Promise.race([all, new Promise((r) => setTimeout(r, ms))]) : Promise.race([all, Promise.resolve()]);
}
