// 走进去 · 刷颜色：手指点到的那一面是哪个「表面」（slot），换的就是它（SPEC §2）。
//
// 只看被点到的那个三角形的材质：合并过的墙是一个网格、好几种材质（墙面、厨卫砖、外墙、墨色切口），
// 网格上的 userData.slot 永远是 'walls' —— Engine.slotAt 退回去读它，以前走进去才会「点哪里都只换墙面」。
// 所以这里从不退回 object.userData.slot。固定材质（外墙、切口、玻璃、电视…）不能换，返回 null。

import { ROOM_TYPES } from '../plan/model.js';
import { SLOT_BY_ID } from '../../shared/materials.js';

/**
 * 这次点中的材质：多材质网格按这个面的 materialIndex 取。
 * 也收 Engine.hitAt 的结果（{ object, point, material }：没有 face，材质已经按面取好了）；多材质网格又没有面 → null（不猜）
 */
export function hitMaterial(hit) {
  const m = hit?.object?.material;
  if (!m) return null;
  if (!Array.isArray(m)) return m;
  if (hit.face) return m[hit.face.materialIndex ?? 0] || null;
  return hit.material && m.includes(hit.material) ? hit.material : null;
}

/** 玻璃、窗外的天光卡：点穿过去，不算表面（和 Engine.hitAt 同一条规则） */
export const isGlass = (m) => !!m && (m.userData?.fixed === 'glass' || m.userData?.fixed === 'pane' || (!!m.transparent && m.opacity < 0.3));

/** three.js 的一次相交 { object, face } → 可以换材质的表面 id；不能换 → null */
export function slotOfHit(hit) {
  const m = hitMaterial(hit);
  if (!m || m.userData?.fixed || isGlass(m)) return null;
  const s = m.userData?.slot;
  return s && SLOT_BY_ID[s] ? s : null;
}

/** 脚下这个房间的地面是哪个表面：厨房、浴室、阳台…（铺砖的）→ 'tile'，其余 → 'floor'（和 house.js 铺地板的规则一样） */
export function floorSlotOf(roomType) {
  const type = typeof roomType === 'string' ? roomType : roomType?.type;
  return ROOM_TYPES[type]?.floor === 'tile' ? 'tile' : 'floor';
}
