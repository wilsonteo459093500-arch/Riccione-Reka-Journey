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
import { pickL, FRAME_KIND_NAME } from './lang.js';

const STRIP_KINDS = new Set(['plinth', 'legs', 'raised']);
const EPS = 1e-9;

// 一个柜体的计价数量（mm / mm²）
//   seriesOf(node)：第二版「每格系列」—— 给每一格它的实际系列（转角那段传 null = 柜子的系列）。
//   不传就不分组（qBy 只有一组 ''）。pricedH / linear 仍然整个柜体只算一次，分组不改延米 / 平米算法。
//   q / drawers / drawersHalf 是整个柜体的合计（累计顺序和第一版一样），qBy / drawersBy 按系列分组。
export function frameQuantities(frame, seriesOf = null) {
  const W = Math.max(0, frame.W || 0);
  const Hb = bodyHeight(frame);
  const strip = STRIP_KINDS.has(frame.base?.kind) ? Math.max(0, frame.base.h || 0) : 0;
  const keyOf = (node, type) => {
    if (!seriesOf) return '';
    const ser = seriesOf(node);
    return type === 'open' ? `o:${ser.open}` : `${ser.door}-${ser.carcass}`;
  };
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
      .map((l) => ({ y0: l.y0, y1: l.y1, type: l.node.type || 'closed', node: l.node }))
      .sort((a, b) => a.y0 - b.y0);
    if (!segs.length) segs.push({ y0: 0, y1: Hb, type: 'closed', node: null }); // 没切到的地方当封门
    const nonvoid = segs.filter((g) => g.type !== 'void');
    if (!nonvoid.length) { slices.push({ s, hp: 0, parts: [] }); continue; } // 整列空位：不计价（连底座）
    const lowest = segs[0];
    // 底座高度并入最下面那格 → 也跟着那格的系列
    const parts = nonvoid.map((g) => ({ type: g.type, h: (g.y1 - g.y0) + (g === lowest && g.y0 <= EPS ? strip : 0), key: keyOf(g.node, g.type === 'open' ? 'open' : 'closed') }));
    slices.push({ s, hp: parts.reduce((a, p) => a + p.h, 0), parts });
  }

  // L / U 转角：第二面墙的柜子实物从转角后开始，但价钱「每面墙各量到墙角」→ 转角那段宽度照算（整高封门，柜子的系列）
  const cornerW = Math.max(0, Number(frame.cornerW) || 0);
  if (cornerW > 0 && Hb > 0) slices.push({ s: cornerW, hp: Hb + strip, parts: [{ type: 'closed', h: Hb + strip, key: keyOf(null, 'closed') }], corner: true });

  const pricedH = slices.reduce((m, sl) => Math.max(m, sl.hp), 0);
  const linear = isLinear(pricedH / 1000);
  const q = { closed: 0, glass: 0, open: 0 }; // 延米柜：closed/glass 单位 mm；平米：mm²；open 一律 mm²
  const qBy = {};
  const add = (key, t, v) => { (qBy[key] ||= { closed: 0, glass: 0, open: 0 })[t] += v; };
  slices.forEach(({ s, hp, parts }) => {
    parts.forEach(({ type, h, key }) => {
      const t = type === 'drawer' ? 'closed' : type;
      let v;
      if (t === 'open') v = s * h;
      else if (linear) v = hp > 0 ? (s * h) / hp : 0;
      else v = s * h;
      q[t] += v;
      add(key, t, v);
    });
  });

  let drawers = 0, drawersHalf = 0;
  const drawersBy = {};
  layoutLeaves(frame.body, 0, 0, W, Hb).forEach(({ node }) => {
    if (node.type !== 'drawer') return;
    const n = Math.max(0, Math.round(Number(node.drawers) || 0));
    const d = (drawersBy[keyOf(node, 'closed')] ||= { full: 0, half: 0 });
    if (node.drawerKind === 'full') { drawers += n; d.full += n; } else { drawersHalf += n; d.half += n; }
  });

  return { linear, pricedH, q, qBy, drawers, drawersHalf, drawersBy, slices };
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

// 某一格的实际系列：格子自己的 leaf.series 叠在柜子的系列上（门板 A–K；柜体只有 A–C；开放格跟这格的门板）
export function resolveLeafSeries(cab, node, defaults = {}, base = resolveSeries(cab, defaults)) {
  const s = node?.series;
  if (!s) return base;
  const door = DOOR_SERIES.includes(s.door) ? s.door : base.door;
  const carcass = CARCASS_SERIES.includes(s.carcass) ? s.carcass : base.carcass;
  const open = DOOR_SERIES.includes(s.door) ? (OPEN_SERIES.includes(s.door) ? s.door : base.open) : base.open;
  return { door, carcass, open };
}

// 这个柜子有几格单独选了系列（一键比价不跟着换）
export function customSeriesCount(cab) {
  return (cab?.frames || []).reduce((a, f) => a + layoutLeaves(f.body).filter(({ node }) => node.series && (node.series.door || node.series.carcass)).length, 0);
}

const FRAME_TYPE = { base: 'base', wall: 'wall', tall: 'tall' };

// 一个柜体 → 标准明细：每个「部位 + 系列」一条（封门(含抽屉) / 玻璃 / 开放），外加 左见光板 / 右见光板
//   和柜子系列相同的那一组沿用第一版的 id（…:closed）；单独选了系列的组 id 加后缀（…:closed@C-A），kira 标签多带 series
export function frameItems(cab, frame, defaults = {}) {
  const ser = resolveSeries(cab, defaults);
  const seriesOf = (node) => resolveLeafSeries(cab, node, defaults, ser);
  const { linear, pricedH, q, qBy, drawersBy } = frameQuantities(frame, seriesOf);
  if (pricedH <= 0) return [];
  const Hm = pricedH / 1000;
  const Dm = (frame.D || 0) / 1000;
  const toLen = (v) => (linear ? v / 1000 : v / 1e6 / Hm); // 平米柜：length × H = 面积（computeItem 再乘 max(H,D)/H）
  const allOpen = q.closed <= EPS && q.glass <= EPS && q.open > EPS;
  const common = {
    type: 'cabinet', cabType: allOpen ? 'open' : (FRAME_TYPE[frame.kind] || 'tall'), name: frame.label || '',
    h: Hm, d: Dm, doorSeries: ser.door, carcassSeries: ser.carcass, openSeries: ser.open,
    hasOpen: false, noDiscount: false,
  };
  const tag = (part, series) => ({ cabinetId: cab.id, frameId: frame.id, part, ...(series ? { series } : {}) });
  const mainKey = `${ser.door}-${ser.carcass}`, mainOpen = `o:${ser.open}`;
  // 主组在前，其他组按 key 排
  const groups = (main, keys) => [...new Set(keys)].sort((a, b) => (a === main ? -1 : b === main ? 1 : a < b ? -1 : a > b ? 1 : 0));
  const zero = { closed: 0, glass: 0, open: 0 };
  const items = [];
  const closedKeys = Object.keys(qBy).filter((k) => !k.startsWith('o:')).concat(Object.keys(drawersBy));
  groups(mainKey, closedKeys).forEach((key) => {
    const g = qBy[key] || zero;
    const d = drawersBy[key] || { full: 0, half: 0 };
    const main = key === mainKey;
    const [door, carcass] = key.split('-');
    const sx = main ? '' : `@${key}`;
    const its = { ...common, doorSeries: door, carcassSeries: carcass };
    if (g.closed > EPS || d.full || d.half) {
      items.push({ ...its, id: `${cab.id}:${frame.id}:closed${sx}`, length: toLen(g.closed), hasDoor: g.closed > EPS, hasCarcass: g.closed > EPS,
        drawers: d.full || '', drawersHalf: d.half || '', kira: tag('closed', main ? null : key) });
    }
  });
  groups(mainKey, Object.keys(qBy).filter((k) => !k.startsWith('o:'))).forEach((key) => {
    const g = qBy[key];
    const main = key === mainKey;
    const [door, carcass] = key.split('-');
    if (g.glass > EPS) {
      items.push({ ...common, doorSeries: door, carcassSeries: carcass, id: `${cab.id}:${frame.id}:glass${main ? '' : `@${key}`}`, length: toLen(g.glass), hasDoor: true, hasCarcass: true,
        coef: Number(cab.glassCoef) > 0 ? Number(cab.glassCoef) : DEFAULT_GLASS_COEF, coefTarget: 'door', kira: tag('glass', main ? null : key) });
    }
  });
  groups(mainOpen, Object.keys(qBy).filter((k) => k.startsWith('o:'))).forEach((key) => {
    const g = qBy[key];
    const main = key === mainOpen;
    const open = key.slice(2);
    if (g.open > EPS) {
      items.push({ ...common, openSeries: open, id: `${cab.id}:${frame.id}:open${main ? '' : `@${open}`}`, length: g.open / 1e6 / Hm, hasDoor: false, hasCarcass: false, hasOpen: true, kira: tag('open', main ? null : open) });
    }
  });
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
  // 高柜内侧（厨房：朝台面那一边露出来的部分）：见光板，面积由模板算好放在 frame.innerPanel.area（mm²）
  const ip = frame.innerPanel;
  if (ip && ex.tallInner !== false && Number(ip.area) > 0 && Dm > 0) {
    items.push({ id: `${cab.id}:${frame.id}:panelIn`, type: 'panel', preset: 'custom', name: frame.label || '', length: Dm, h: Number(ip.area) / 1e6 / Dm,
      panelSeries: ser.door, noDiscount: false, kira: tag('panelIn') });
  }
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

export const frameKindLabel = (kind, lang = 'both') => pickL(FRAME_KIND_NAME[kind] || FRAME_KIND_NAME.tall, lang);

// 「L 1.20m × H 2.10m × D 0.60m」（真实尺寸，不是换算后的数量）
// 厨房墙太短只剩转角（宽 0，转角照算）：写转角那段的长度，不写「L 0.00m」
export function frameDimsLabel(frame, lang = 'en') {
  const corner = !(frame.W > 0) && frame.cornerW > 0;
  const L = mmToM(corner ? frame.cornerW : frame.W), H = mmToM(frame.H), D = mmToM(frame.D);
  return lang === 'zh' ? `${corner ? '转角 ' : ''}长 ${L}m × 高 ${H}m × 深 ${D}m` : `${corner ? 'Corner ' : ''}L ${L}m × H ${H}m × D ${D}m`;
}
