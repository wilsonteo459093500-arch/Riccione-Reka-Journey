// ============================================================
// 模板：业务只填「总宽 / 高 / 深 / 底座 / 每格单元」，这里生成柜体 frames。
// 规则：先定总宽 → 每扇门最宽 600 自动算门数（可 +/−）→ 平分。
// 只在业务编辑时重算 frames；载入旧报价不重算（避免以后改模板时悄悄改价）。
// ============================================================
import { leaf, vsplit, hsplit, splitEven, autoDoors, uid, ceilingOr, DEFAULT_GLASS_COEF, mmToM } from './model.js';
import { kitchenDefaults, kitchenNormalize, kitchenBuild, kitchenWalls, kitchenSummary, kitchenFrameName } from './kitchen.js';
import { tvDefaults, tvNormalize, tvBuild, tvSummary, tvFrameName, shoeDefaults, shoeNormalize, shoeBuild, shoeSummary, shoeFrameName } from './tvshoe.js';
import { pickL, joinL, bi, FRAME_KIND_NAME } from './lang.js';
import { pickLang } from '../constants/pricing.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const int = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };

// 每格单元的格子（下→上）；h = 这一格可用高度（不含顶柜）
function stack(cells) {
  const sizes = cells.map((c) => c.h);
  return hsplit(sizes, cells.map((c) => c.node));
}

// ---------------- 衣柜 ----------------
export const WARDROBE_UNITS = [
  { id: 'hang', zh: '长挂衣', en: 'Long hanging' },
  { id: 'shortFold', zh: '短挂 + 叠衣', en: 'Short hang + shelves' },
  { id: 'drawersHang', zh: '下抽屉 + 上挂衣', en: 'Drawers + hanging' },
  { id: 'open', zh: '开放格', en: 'Open shelves' },
  { id: 'glass', zh: '玻璃门展示', en: 'Glass display' },
];

const wardrobeColumn = (unit, mainH, topH) => {
  const cells = [];
  const kind = unit?.layout || 'hang';
  if (kind === 'drawersHang') {
    const n = clamp(int(unit.drawers, 3), 1, 6);
    const dH = clamp(n * 200, 200, Math.max(200, mainH - 400));
    cells.push({ h: dH, node: leaf('drawer', { drawers: n, drawerKind: unit.drawerKind === 'full' ? 'full' : 'half', interior: 'drawers' }) });
    cells.push({ h: mainH - dH, node: leaf('closed', { interior: 'rod' }) });
  } else if (kind === 'shortFold') cells.push({ h: mainH, node: leaf('closed', { interior: 'rodShelves' }) });
  else if (kind === 'open') cells.push({ h: mainH, node: leaf('open', { interior: 'shelves' }) });
  else if (kind === 'glass') cells.push({ h: mainH, node: leaf('glass', { interior: 'shelves' }) });
  else cells.push({ h: mainH, node: leaf('closed', { interior: 'rod' }) });
  if (topH > 0) cells.push({ h: topH, node: leaf('closed', { interior: 'top' }) });
  return stack(cells);
};

const WARDROBE_NAME = { en: 'Wardrobe', zh: '衣柜' };
const wardrobe = {
  id: 'wardrobe', ...WARDROBE_NAME, units: WARDROBE_UNITS, defaultUnit: 'hang',
  defaults: ({ ceilingH } = {}) => ({
    W: 2400, H: ceilingOr(ceilingH), D: 600, base: { kind: 'plinth', h: 100 },
    top: true, topH: 500, doorsAuto: true, doors: autoDoors(2400),
    units: Array.from({ length: autoDoors(2400) }, () => ({ layout: 'hang' })),
  }),
  normalize(spec) {
    const s = { ...spec };
    s.W = clamp(int(s.W, 2400), 300, 12000);
    s.H = clamp(ceilingOr(s.H), 600, 4000);
    s.D = clamp(int(s.D, 600), 200, 1200);
    s.base = normBase(s.base);
    s.topH = clamp(int(s.topH, 500), 200, 900);
    s.doors = s.doorsAuto !== false ? autoDoors(s.W) : clamp(int(s.doors, autoDoors(s.W)), 1, 30);
    s.units = resizeUnits(s.units, s.doors, 'hang');
    return s;
  },
  // 墙的摆放（3D 用）：一面墙，从世界原点沿 +x 排，柜门朝 +z（朝观众）
  walls: (spec) => [{ ox: 0, oz: 0, angle: 0, len: spec.W }],
  summary: (spec, lang) => joinL([
    `${mmToM(spec.W)} × ${mmToM(spec.H)} × ${mmToM(spec.D)} m`,
    { en: `${spec.doors} door${spec.doors === 1 ? '' : 's'}`, zh: `${spec.doors} 扇门` },
  ], lang),
  frameName: () => [WARDROBE_NAME],
  build(spec, cab) {
    const Hb = spec.H - spec.base.h;
    const topH = spec.top ? Math.min(spec.topH, Math.max(0, Hb - 800)) : 0;
    const mainH = Hb - topH;
    const widths = splitEven(spec.W, spec.doors);
    return [{
      id: `${cab.id}-f0`, kind: 'tall', label: bi(WARDROBE_NAME), wall: 0, x: 0, y: 0,
      W: spec.W, H: spec.H, D: spec.D, base: { ...spec.base }, ends: { left: true, right: true },
      body: vsplit(widths, widths.map((_, i) => wardrobeColumn(spec.units[i], mainH, topH))),
    }];
  },
};

// ---------------- 共用 ----------------
export function normBase(b) {
  const kind = ['plinth', 'legs', 'raised', 'wallhung', 'none'].includes(b?.kind) ? b.kind : 'plinth';
  const def = { plinth: 100, legs: 120, raised: 150, wallhung: 0, none: 0 }[kind];
  const h = kind === 'wallhung' || kind === 'none' ? 0 : clamp(int(b?.h, def), 20, 400);
  return { kind, h };
}

export function resizeUnits(units = [], n, layout) {
  const out = (units || []).slice(0, n).map((u) => ({ ...u }));
  while (out.length < n) out.push({ layout });
  return out;
}

const kitchen = {
  id: 'kitchen', zh: '厨房', en: 'Kitchen',
  defaults: () => kitchenDefaults(),
  normalize: kitchenNormalize,
  build: kitchenBuild,
  walls: kitchenWalls,
  summary: kitchenSummary,
  frameName: kitchenFrameName,
};

const tv = {
  id: 'tv', zh: '电视柜 / 展示柜', en: 'TV & display',
  defaults: tvDefaults, normalize: tvNormalize, build: tvBuild, summary: tvSummary, frameName: tvFrameName,
  walls: (spec) => [{ ox: 0, oz: 0, angle: 0, len: spec.W }],
};
const shoe = {
  id: 'shoe', zh: '鞋柜 / 玄关柜', en: 'Shoe & foyer',
  defaults: shoeDefaults, normalize: shoeNormalize, build: shoeBuild, summary: shoeSummary, frameName: shoeFrameName,
  walls: (spec) => [{ ox: 0, oz: 0, angle: 0, len: spec.W }],
};

export const TEMPLATES = { wardrobe, kitchen, tv, shoe };
export const TEMPLATE_LIST = [wardrobe, kitchen, tv, shoe];
export const templateOf = (id) => TEMPLATES[id] || wardrobe;

// 下一个柜号：整份报价里 K1、K2…
export function nextCode(zones = []) {
  const nums = zones.flatMap((z) => (z.cabinets || []).map((c) => parseInt(String(c.code || '').replace(/\D/g, ''), 10) || 0));
  return `K${Math.max(0, ...nums) + 1}`;
}

// ---- 按输出语言出字（报价单 / 长图 / Excel / WhatsApp）：lang 'en' | 'zh' | 'both'，从结构化数据生成，不拆「English 中文」字串 ----
// 一句话简介：「2.40 × 2.70 × 0.60 m · 4 doors」/「… · 4 扇门」/ both「… · 4 doors 4 扇门」
export const cabinetSummary = (cab, lang = 'both') => { const t = templateOf(cab.template); return t.summary ? t.summary(cab.spec, lang) : ''; };

// 柜子名称：业务自己取的名字原样；没有就用模板名
export const cabinetTitle = (cab, lang = 'both') => cab?.name || pickL(templateOf(cab?.template), lang);

// 柜体小标题（多柜体的柜子：地柜 / 吊柜 / 高柜 · 墙A …）：按模板 + frame.kind / frame.wall 生成，新旧记录一样；
// 不是模板做的（例如旧报价换算的柜子）才退回 frame.label
export function frameTitle(cab, frame, lang = 'both') {
  const t = TEMPLATES[cab?.template];
  if (t?.frameName) return joinL(t.frameName(frame, cab.spec || {}), lang);
  return frame?.label ? pickLang(frame.label, lang) : pickL(FRAME_KIND_NAME[frame?.kind] || FRAME_KIND_NAME.tall, lang);
}

// 每面墙在世界坐标（俯视：x 向右、z 朝观众）里的位置。
//   world = (ox, oz) + R(angle)·(u 沿墙, w 离墙朝外)；R(0): u→+x, w→+z；R(90): u→+z, w→−x；
//   R(180): u→−x, w→−z；R(270): u→−z, w→+x。柜体 frame.wall 指第几面墙，frame.x 是沿墙的位置。
export function cabinetWalls(cab) {
  const t = templateOf(cab.template);
  return t.walls ? t.walls(cab.spec) : [{ ox: 0, oz: 0, angle: 0, len: cab.spec?.W || 0 }];
}

export function buildFrames(cab) {
  const t = templateOf(cab.template);
  return t.build(cab.spec, cab);
}

export function newCabinet(templateId, { ceilingH, code } = {}) {
  const t = templateOf(templateId);
  const cab = {
    id: uid('cab'), code: code || 'K1', template: t.id, name: '',
    spec: t.normalize(t.defaults({ ceilingH })),
    series: null, exposed: { left: true, right: true }, glassCoef: DEFAULT_GLASS_COEF,
    finish: { door: null, carcass: null }, handle: 'hidden', view: { yaw: -30 },
    frames: [],
  };
  cab.frames = buildFrames(cab);
  return cab;
}

// 业务改了模板输入 → 规范化 + 重新生成柜体
export function updateSpec(cab, patch) {
  const t = templateOf(cab.template);
  const spec = t.normalize({ ...cab.spec, ...patch });
  const next = { ...cab, spec };
  next.frames = buildFrames(next);
  return next;
}

// 改其中一格的单元
export function setUnit(cab, index, patch) {
  const units = (cab.spec.units || []).map((u, i) => (i === index ? { ...u, ...patch } : u));
  return updateSpec(cab, { units });
}
