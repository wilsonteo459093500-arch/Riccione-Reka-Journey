// ============================================================
// 补填 / 改了房间楼高 → 提醒「哪些柜子还是旧高度」，按一下才全部做到顶（纯函数，Node 测试 test/ceiling.test.mjs）
//
// 用户 2026-11-20 选的做法：价钱不在没人看的时候自己变。
//   AI 识图常常先开新房间（还没有楼高）→ 柜子按 2.70 m；业务后来填 3.00 m，柜子不会自己长高。
//   房间上出现提醒：列出柜号、现在多高、做到顶总价多多少 →「全部做到顶」或「不用」。
// 哪些算「还是旧高度」：跟楼高走的那些高度（fitCeiling）停在 2.70 m（默认），或停在上一次填的楼高（zone.ceilingPrev）。
//   只算真的会变的柜子（柜体尺寸会变）；例如电视柜没开两侧高柜，就不算。
// 「不用」= zone.ceilingAck 记下当时的楼高；楼高再改才会再提醒。
// ============================================================
import { fitCeiling } from './templates.js';
import { cabinetTotal } from './bridge.js';
import { DEFAULT_CEILING } from './model.js';

const pos = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : 0; };
const sameFrames = (a, b) => JSON.stringify(a?.frames || []) === JSON.stringify(b?.frames || []);

// 改楼高时要记下的东西：updateZone(id, ceilingPatch(zone, newH))
export function ceilingChange(zone, ceilingH) {
  const h = pos(ceilingH) || null;
  const old = pos(zone?.ceilingH) || null;
  if (h === old) return { ceilingH: h };
  return { ceilingH: h, ceilingPrev: old }; // 换了新的楼高：之前按过「不用」的作废（ceilingAck 只对当时那个楼高）
}

// → { items:[{ cab, next, fromH }], delta }；items 空 = 不用提醒
//   fromH：这个柜子现在按多高做的（mm），给画面写「还是 2.70 m」
export function staleCeiling(zone, defaults = {}) {
  const h = pos(zone?.ceilingH);
  if (!h || pos(zone?.ceilingAck) === h) return { items: [], delta: 0 };
  const froms = [...new Set([DEFAULT_CEILING, pos(zone?.ceilingPrev)])].filter((v) => v > 0 && v !== h);
  const items = [];
  (zone?.cabinets || []).forEach((cab) => {
    let next = cab, fromH = 0;
    froms.forEach((f) => {
      const n = fitCeiling(next, h, { from: f });
      if (n !== next && !sameFrames(n, next)) fromH = fromH || f;
      next = n;
    });
    if (fromH) items.push({ cab, next, fromH });
  });
  const delta = Math.round(items.reduce((a, x) => a + cabinetTotal(x.next, defaults) - cabinetTotal(x.cab, defaults), 0));
  return { items, delta };
}

// 「全部做到顶」→ 新的 zone（只换提醒里列出的柜子）
export function fitZoneToCeiling(zone, defaults = {}) {
  const { items } = staleCeiling(zone, defaults);
  if (!items.length) return zone;
  const byId = new Map(items.map((x) => [x.cab.id, x.next]));
  return { ...zone, cabinets: (zone.cabinets || []).map((c) => byId.get(c.id) || c) };
}

// 「不用」：这个楼高不再提醒
export const keepCeiling = (zone) => ({ ceilingAck: pos(zone?.ceilingH) || null });
