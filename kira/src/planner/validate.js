// 尺寸「不寻常」提醒（只提醒，不阻挡出价）。数字来自 .claude/skills/interior-design-expert/SKILL.md
//   吊柜深 300–350 · 地柜深 560–600 · 衣柜深 550–600 · 长挂 ≥1400 · 台面高 850–900
import { layoutLeaves, bodyHeight } from './model.js';
import { wallRuns } from './kitchen.js';
import { shelfKind } from '../constants/shelves.js';

const T = (en, zh) => ({ en, zh });

export function validateCabinet(cab, { ceilingH } = {}) {
  const out = [];
  const spec = cab?.spec || {};
  (cab?.frames || []).forEach((f) => {
    if (f.kind === 'backdrop') { // 电视墙只看高度
      if (ceilingH && f.y + f.H > ceilingH) out.push({ level: 'warn', msg: T(`Feature wall taller than the room (${f.y + f.H} > ceiling ${ceilingH})`, `电视墙比楼高还高（${f.y + f.H} > 楼高 ${ceilingH}）`) });
      return;
    }
    if (f.kind === 'wall' && (f.D < 300 || f.D > 400)) out.push({ level: 'warn', msg: T(`Wall cabinet depth ${f.D} mm is unusual (300–350)`, `吊柜深 ${f.D} 不常见（一般 300–350）`) });
    if (f.kind === 'base' && (f.D < 520 || f.D > 650)) out.push({ level: 'warn', msg: T(`Base cabinet depth ${f.D} mm is unusual (560–600)`, `地柜深 ${f.D} 不常见（一般 560–600）`) });
    if (cab.template === 'wardrobe' && (f.D < 500 || f.D > 650)) out.push({ level: 'warn', msg: T(`Wardrobe depth ${f.D} mm is unusual (550–600)`, `衣柜深 ${f.D} 不常见（一般 550–600）`) });
    if (ceilingH && f.y + f.H > ceilingH) out.push({ level: 'warn', msg: T(`Taller than the room (${f.y + f.H} > ceiling ${ceilingH})`, `比楼高还高（${f.y + f.H} > 楼高 ${ceilingH}）`) });
    layoutLeaves(f.body, 0, 0, f.W, bodyHeight(f)).forEach(({ w, h, node }) => {
      if (node.interior === 'rod' && h < 900) out.push({ level: 'warn', msg: T(`Hanging space only ${Math.round(h)} mm (short hang ≥900, long ≥1400)`, `挂衣高度只有 ${Math.round(h)}（短挂 ≥900，长挂 ≥1400）`) });
      if (node.type === 'drawer' && node.drawers > 0 && h / node.drawers < 100) out.push({ level: 'warn', msg: T('Drawers are too shallow (<100 mm each)', '抽屉太浅（每个 <100）') });
      if (node.type === 'shelf') {
        const k = shelfKind(node.shelfKind);
        if (w > k.maxW) out.push({ level: 'info', msg: T(`Shelf ${Math.round(w)} mm is longer than ${k.maxW} mm — priced as ${Math.ceil(w / k.maxW)} boards`, `飘板 ${Math.round(w)} 超过最长 ${k.maxW}，按 ${Math.ceil(w / k.maxW)} 块计价`) });
        if (f.D < k.minD || f.D > k.maxD) out.push({ level: 'warn', msg: T(`Shelf depth ${f.D} mm is outside ${k.minD}–${k.maxD} for this kind`, `飘板深 ${f.D} 不在这种的范围 ${k.minD}–${k.maxD}`) });
        if (w > 0 && w < k.minW) out.push({ level: 'info', msg: T(`Shelf ${Math.round(w)} mm is shorter than ${k.minW} — priced at the smallest size`, `飘板 ${Math.round(w)} 短过 ${k.minW}，按最小档计价`) });
      }
      if (w > 0 && w < 250 && node.type !== 'void' && node.type !== 'shelf') out.push({ level: 'info', msg: T(`A ${Math.round(w)} mm wide section is very narrow`, `有一格只有 ${Math.round(w)} 宽，很窄`) });
    });
  });
  // 厨房：高柜 + 转角比墙还长 → 放不下（价钱照「墙长 − 高柜」算，但要提醒业务去量清楚）
  if (cab?.template === 'kitchen' && Array.isArray(spec.walls) && spec.walls.length) {
    let runs = [];
    try { runs = wallRuns(spec); } catch { runs = []; }
    const multi = spec.walls.length > 1;
    runs.forEach((r) => {
      if (!(r.overflow > 0)) return;
      const L = multi ? ['A', 'B', 'C'][r.i] || '' : '';
      const need = r.len + r.overflow;
      const parts = [r.tall && T(`tall unit ${r.tall.w}`, `高柜 ${r.tall.w}`), r.cornerSide && T(`corner ${spec.baseD}`, `转角 ${spec.baseD}`)].filter(Boolean);
      const en = parts.map((p) => p.en).join(' + '), zh = parts.map((p) => p.zh).join(' + ');
      out.push({ level: 'warn', msg: T(`${L ? `Wall ${L}: ` : ''}${en} = ${need} mm doesn't fit on the wall (${r.len} mm)`, `${L ? `墙${L}：` : ''}${zh} = ${need}，比墙长 ${r.len} 还长，放不下`) });
    });
  }
  if (spec.W > 0 && spec.doors && spec.W / spec.doors > 650) out.push({ level: 'warn', msg: T('Doors wider than 600 mm', '门宽超过 600') });
  // 去重
  const seen = new Set();
  return out.filter((m) => { const k = m.msg.zh; if (seen.has(k)) return false; seen.add(k); return true; });
}
