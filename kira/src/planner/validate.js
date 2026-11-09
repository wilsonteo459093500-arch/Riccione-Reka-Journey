// 尺寸「不寻常」提醒（只提醒，不阻挡出价）。数字来自 .claude/skills/interior-design-expert/SKILL.md
//   吊柜深 300–350 · 地柜深 560–600 · 衣柜深 550–600 · 长挂 ≥1400 · 台面高 850–900
import { layoutLeaves, bodyHeight } from './model.js';

const T = (en, zh) => ({ en, zh });

export function validateCabinet(cab, { ceilingH } = {}) {
  const out = [];
  const spec = cab?.spec || {};
  (cab?.frames || []).forEach((f) => {
    if (f.kind === 'wall' && (f.D < 300 || f.D > 400)) out.push({ level: 'warn', msg: T(`Wall cabinet depth ${f.D} mm is unusual (300–350)`, `吊柜深 ${f.D} 不常见（一般 300–350）`) });
    if (f.kind === 'base' && (f.D < 520 || f.D > 650)) out.push({ level: 'warn', msg: T(`Base cabinet depth ${f.D} mm is unusual (560–600)`, `地柜深 ${f.D} 不常见（一般 560–600）`) });
    if (cab.template === 'wardrobe' && (f.D < 500 || f.D > 650)) out.push({ level: 'warn', msg: T(`Wardrobe depth ${f.D} mm is unusual (550–600)`, `衣柜深 ${f.D} 不常见（一般 550–600）`) });
    if (ceilingH && f.y + f.H > ceilingH) out.push({ level: 'warn', msg: T(`Taller than the room (${f.y + f.H} > ceiling ${ceilingH})`, `比楼高还高（${f.y + f.H} > 楼高 ${ceilingH}）`) });
    layoutLeaves(f.body, 0, 0, f.W, bodyHeight(f)).forEach(({ w, h, node }) => {
      if (node.interior === 'rod' && h < 900) out.push({ level: 'warn', msg: T(`Hanging space only ${Math.round(h)} mm (short hang ≥900, long ≥1400)`, `挂衣高度只有 ${Math.round(h)}（短挂 ≥900，长挂 ≥1400）`) });
      if (node.type === 'drawer' && node.drawers > 0 && h / node.drawers < 100) out.push({ level: 'warn', msg: T('Drawers are too shallow (<100 mm each)', '抽屉太浅（每个 <100）') });
      if (w > 0 && w < 250 && node.type !== 'void') out.push({ level: 'info', msg: T(`A ${Math.round(w)} mm wide section is very narrow`, `有一格只有 ${Math.round(w)} 宽，很窄`) });
    });
  });
  if (spec.W > 0 && spec.doors && spec.W / spec.doors > 650) out.push({ level: 'warn', msg: T('Doors wider than 600 mm', '门宽超过 600') });
  // 去重
  const seen = new Set();
  return out.filter((m) => { const k = m.msg.zh; if (seen.has(k)) return false; seen.add(k); return true; });
}
