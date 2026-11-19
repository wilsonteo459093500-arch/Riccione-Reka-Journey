// 走进去 · 量尺：两点之间的距离、一面墙的长和高（SPEC §2）。毫米取到 10，后面跟着客人看得懂的尺（units.mmFt）。

import { t } from '../../shared/i18n.js';
import { mmFt } from '../../shared/units.js';

/** 米 → 毫米，取到 10 */
const mm10 = (m) => Math.round((Number(m) || 0) * 100) * 10;

/** 两个世界坐标点 {x, y, z}（米）→ { mm, text }：「2,100 mm · 约 7 尺 / ft」 */
export function measureText(a, b) {
  const d = Math.hypot((b?.x || 0) - (a?.x || 0), (b?.y || 0) - (a?.y || 0), (b?.z || 0) - (a?.z || 0));
  const mm = mm10(d);
  return { mm, text: mmFt(mm) };
}

/** 一段墙（model.buildWalls 的形状：a → b 是中线上的长度）+ 这一层的天花高（米）→ { lengthMm, heightMm, text } */
export function wallDims(wall, ceil) {
  const lengthMm = mm10(Math.abs((Number(wall?.b) || 0) - (Number(wall?.a) || 0)));
  const heightMm = mm10(ceil);
  return { lengthMm, heightMm, text: t('{0} 长 · {1} 高', [mmFt(lengthMm), mmFt(heightMm)]) };
}
