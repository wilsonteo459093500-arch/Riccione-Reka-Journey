// ============================================================
// 积木柜 → 旧报价工具的标准明细（PR #6 computeItem 能算的 cabinet / panel item）
// 钱一律由旧工具的 computeItem / computeQuote 算，这里只负责「换算数量」。
//
// 价格规则（用户确认）：
//   封门格  = 门板 + 柜体（总高 <1m 按延米；≥1m 按平米 L×max(H,D)）
//   抽屉格  = 门板 + 柜体 + Blum 抽屉 N 套（全展 / 半展）
//   玻璃门  = 门板 × 系数（默认拼框玻璃门 1.5，只乘门板）+ 柜体
//   开放格  = 开放柜投影价 宽×高（系列默认跟门板）
//   踢脚 / 柜脚 / 底层架空 = 按总高算（并入最下面那格）
//   整列空位（电器位）= 不计价
//   两边露出 = 见光板 深×高 × 墙板价（系列跟门板）
//
// 换算（每一竖条 s 宽）：hp = 这条里所有非空格的高度（含并入的底座）
//   延米柜（frame 价高 <1m）：门板/柜体延米 += s × 格高 / hp（叠在一起的格只算一次宽度）
//   平米柜：门板/柜体平米 += s × 格高
//   开放格：平米 += s × 格高（旧工具开放柜本来就按 长×高）
// ============================================================
import { computeQuote, computeItem, isLinear, CARCASS_SERIES, OPEN_SERIES, DOOR_SERIES } from '../constants/pricing.js';
import { layoutLeaves, bodyHeight, mmToM, DEFAULT_GLASS_COEF } from './model.js';

const STRIP_KINDS = new Set(['plinth', 'legs', 'raised']);
const EPS = 1e-9;

// 一个柜体的计价数量（mm / mm²）
export function frameQuantities(frame) {
  const W = Math.max(0, frame.W || 0);
  const Hb = bodyHeight(frame);
  const strip = STRIP_KINDS.has(frame.base?.kind) ? Math.max(0, frame.base.h || 0) : 0;
  const leaves = layoutLeaves(frame.body, 0, 0, W, Hb)
    .map((l) => ({ ...l, x0: Math.max(0, l.x), x1: Math.min(W, l.x + l.w), y0: Math.max(0, l.y), y1: Math.min(Hb, l.y + l.h) }))
    .filter((l) => l.x1 - l.x0 > EPS && l.y1 - l.y0 > EPS);

  const xs = [...new Set([0, W, ...leaves.flatMap((l) => [l.x0, l.x1])])].sort((a, b) => a - b);
  const slices = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const xa = xs[i], xb = xs[i + 1], s = xb - xa;
    if (s <= EPS) continue;
    const segs = leaves
      .filter((l) => l.x0 <= xa + EPS && l.x1 >= xb - EPS)
      .map((l) => ({ y0: l.y0, y1: l.y1, type: l.node.type || 'closed' }))
      .sort((a, b) => a.y0 - b.y0);
    if (!segs.length) segs.push({ y0: 0, y1: Hb, type: 'closed' }); // 没切到的地方当封门
    const nonvoid = segs.filter((g) => g.type !== 'void');
    if (!nonvoid.length) { slices.push({ s, hp: 0, parts: [] }); continue; } // 整列空位：不计价（连底座）
    const lowest = segs[0];
    const parts = nonvoid.map((g) => ({ type: g.type, h: (g.y1 - g.y0) + (g === lowest && g.y0 <= EPS ? strip : 0) }));
    slices.push({ s, hp: parts.reduce((a, p) => a + p.h, 0), parts });
  }

  // L / U 转角：第二面墙的柜子实物从转角后开始，但价钱「每面墙各量到墙角」→ 转角那段宽度照算（整高封门）
  const cornerW = Math.max(0, Number(frame.cornerW) || 0);
  if (cornerW > 0 && Hb > 0) slices.push({ s: cornerW, hp: Hb + strip, parts: [{ type: 'closed', h: Hb + strip }], corner: true });

  const pricedH = slices.reduce((m, sl) => Math.max(m, sl.hp), 0);
  const linear = isLinear(pricedH / 1000);
  const q = { closed: 0, glass: 0, open: 0 }; // 延米柜：closed/glass 单位 mm；平米：mm²；open 一律 mm²
  slices.forEach(({ s, hp, parts }) => {
    parts.forEach(({ type, h }) => {
      const t = type === 'drawer' ? 'closed' : type;
      if (t === 'open') q.open += s * h;
      else if (linear) q[t] += hp > 0 ? (s * h) / hp : 0;
      else q[t] += s * h;
    });
  });

  let drawers = 0, drawersHalf = 0;
  layoutLeaves(frame.body, 0, 0, W, Hb).forEach(({ node }) => {
    if (node.type !== 'drawer') return;
    const n = Math.max(0, Math.round(Number(node.drawers) || 0));
    if (node.drawerKind === 'full') drawers += n; else drawersHalf += n;
  });

  return { linear, pricedH, q, drawers, drawersHalf, slices };
}

// 系列：柜子自己的 > 整份报价默认 > A；柜体只有 A/B/C；开放格默认跟门板
export function resolveSeries(cab, defaults = {}) {
  const s = cab?.series || {};
  const door = DOOR_SERIES.includes(s.door) ? s.door : (DOOR_SERIES.includes(defaults.door) ? defaults.door : 'A');
  const carcass = CARCASS_SERIES.includes(s.carcass) ? s.carcass : (CARCASS_SERIES.includes(defaults.carcass) ? defaults.carcass : 'A');
  const openPick = s.open && s.open !== 'door' ? s.open : (defaults.open && defaults.open !== 'door' ? defaults.open : door);
  const open = OPEN_SERIES.includes(openPick) ? openPick : door;
  return { door, carcass, open };
}

const FRAME_TYPE = { base: 'base', wall: 'wall', tall: 'tall' };

// 一个柜体 → 标准明细（最多：封门(含抽屉) / 玻璃 / 开放 / 左见光板 / 右见光板）
export function frameItems(cab, frame, defaults = {}) {
  const { linear, pricedH, q, drawers, drawersHalf } = frameQuantities(frame);
  if (pricedH <= 0) return [];
  const Hm = pricedH / 1000;
  const Dm = (frame.D || 0) / 1000;
  const ser = resolveSeries(cab, defaults);
  const toLen = (v) => (linear ? v / 1000 : v / 1e6 / Hm); // 平米柜：length × H = 面积（computeItem 再乘 max(H,D)/H）
  const allOpen = q.closed <= EPS && q.glass <= EPS && q.open > EPS;
  const common = {
    type: 'cabinet', cabType: allOpen ? 'open' : (FRAME_TYPE[frame.kind] || 'tall'), name: frame.label || '',
    h: Hm, d: Dm, doorSeries: ser.door, carcassSeries: ser.carcass, openSeries: ser.open,
    hasOpen: false, noDiscount: false,
  };
  const tag = (part) => ({ cabinetId: cab.id, frameId: frame.id, part });
  const items = [];
  if (q.closed > EPS || drawers || drawersHalf) {
    items.push({ ...common, id: `${cab.id}:${frame.id}:closed`, length: toLen(q.closed), hasDoor: q.closed > EPS, hasCarcass: q.closed > EPS,
      drawers: drawers || '', drawersHalf: drawersHalf || '', kira: tag('closed') });
  }
  if (q.glass > EPS) {
    items.push({ ...common, id: `${cab.id}:${frame.id}:glass`, length: toLen(q.glass), hasDoor: true, hasCarcass: true,
      coef: Number(cab.glassCoef) > 0 ? Number(cab.glassCoef) : DEFAULT_GLASS_COEF, coefTarget: 'door', kira: tag('glass') });
  }
  if (q.open > EPS) {
    items.push({ ...common, id: `${cab.id}:${frame.id}:open`, length: q.open / 1e6 / Hm, hasDoor: false, hasCarcass: false, hasOpen: true, kira: tag('open') });
  }
  // 见光板：柜子两端露出的侧面（深 × 总高），系列跟门板
  const ex = cab.exposed || { left: true, right: true };
  const sideH = (frame.H || 0) / 1000;
  [['left', 'L'], ['right', 'R']].forEach(([side, k]) => {
    // ends 值：true = 本侧；'start' / 'end' = 整排的起点 / 终点（厨房 L/U：对应 cab.exposed.left / right）
    const flag = frame.ends?.[side];
    const exKey = flag === 'start' ? 'left' : flag === 'end' ? 'right' : side;
    if (flag && ex[exKey] !== false && Dm > 0 && sideH > 0) {
      items.push({ id: `${cab.id}:${frame.id}:panel${k}`, type: 'panel', preset: 'custom', name: frame.label || '', length: Dm, h: sideH,
        panelSeries: ser.door, noDiscount: false, kira: tag(`panel${k}`) });
    }
  });
  return items;
}

export function cabinetItemsFor(cab, defaults = {}) {
  return (cab?.frames || []).flatMap((f) => frameItems(cab, f, defaults));
}

// 某个房间里的积木柜 → 标准明细
export function cabinetItems(zone, defaults = {}) {
  return (zone?.cabinets || []).flatMap((c) => cabinetItemsFor(c, defaults));
}

// 报价用的房间列表：积木柜明细在前，手动明细在后
export function deriveZones(zones = [], defaults = {}) {
  return zones.map((z) => {
    const derived = cabinetItems(z, defaults);
    return derived.length ? { ...z, items: [...derived, ...(z.items || [])] } : z;
  });
}

export function computeRecordQuote(r) {
  return computeQuote(deriveZones(r.zones || [], r.defaults || {}), r.adjustPct, r.discountMode, r.discountAmt);
}

// 一个柜子的金额（未四舍五入；报价单按房间四舍五入）
export function cabinetTotal(cab, defaults = {}) {
  return cabinetItemsFor(cab, defaults).reduce((a, it) => a + computeItem(it).total, 0);
}

// 显示用：同一柜体里「同分类 + 同单价 + 同单位」的行合并（例：封门和玻璃各有一行柜体价）
export function mergeLines(lines) {
  const out = [];
  lines.forEach((ln) => {
    const hit = out.find((o) => o.bucket === ln.bucket && o.unitMyr === ln.unitMyr && o.uomEn === ln.uomEn && o.descEn === ln.descEn);
    if (hit) { hit.qty += ln.qty; hit.total += ln.total; } else out.push({ ...ln });
  });
  return out;
}

const KIND_LABEL = {
  base: { en: 'Base Cabinet', zh: '地柜' }, wall: { en: 'Top Cabinet', zh: '吊柜' }, tall: { en: 'Tall Cabinet', zh: '高柜' },
};
export const frameKindLabel = (kind, lang = 'both') => {
  const l = KIND_LABEL[kind] || KIND_LABEL.tall;
  return lang === 'en' ? l.en : lang === 'zh' ? l.zh : `${l.en} ${l.zh}`;
};

// 「L 1.20m × H 2.10m × D 0.60m」（真实尺寸，不是换算后的数量）
// 厨房墙太短只剩转角（宽 0，转角照算）：写转角那段的长度，不写「L 0.00m」
export function frameDimsLabel(frame, lang = 'en') {
  const corner = !(frame.W > 0) && frame.cornerW > 0;
  const L = mmToM(corner ? frame.cornerW : frame.W), H = mmToM(frame.H), D = mmToM(frame.D);
  return lang === 'zh' ? `${corner ? '转角 ' : ''}长 ${L}m × 高 ${H}m × 深 ${D}m` : `${corner ? 'Corner ' : ''}L ${L}m × H ${H}m × D ${D}m`;
}
