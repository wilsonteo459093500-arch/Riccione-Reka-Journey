// ============================================================
// 电视柜 / 展示柜 + 鞋柜 / 玄关柜 模板
// 电视柜默认（用户定）：低柜 高 400 深 400，悬空离地 250
// 鞋柜默认（用户定）：深 350，底层架空 150；上下柜 + 中空 = 下柜 900 · 中空 350 · 上柜到顶
// ============================================================
import { leaf, vsplit, hsplit, splitEven, autoDoors, mmToM, ceilingOr } from './model.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const int = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };
const resize = (arr = [], n, layout) => { const out = (arr || []).slice(0, n).map((u) => ({ ...u })); while (out.length < n) out.push({ layout }); return out; };

// ---------------- 电视柜 / 展示柜 ----------------
export const TV_LOW_UNITS = [
  { id: 'doors', zh: '门', en: 'Doors' },
  { id: 'drawers', zh: '抽屉', en: 'Drawers' },
  { id: 'open', zh: '开放格', en: 'Open' },
  { id: 'glass', zh: '玻璃门', en: 'Glass' },
];
export const TV_SIDE_KINDS = [
  { id: 'closed', zh: '封门高柜', en: 'Closed tall' },
  { id: 'openTop', zh: '下门上开放', en: 'Doors + open top' },
  { id: 'glassTop', zh: '下门上玻璃', en: 'Doors + glass top' },
  { id: 'open', zh: '全开放展示', en: 'Open display' },
  { id: 'glass', zh: '全玻璃展示', en: 'Glass display' },
];
export const TV_UPPER_UNITS = [
  { id: 'doors', zh: '门', en: 'Doors' },
  { id: 'open', zh: '开放格', en: 'Open' },
  { id: 'glass', zh: '玻璃门', en: 'Glass' },
];

export function tvDefaults({ ceilingH } = {}) {
  return {
    W: 3000, lowKind: 'floating', lowH: 400, lowD: 400, lowY: 250, lowUnits: [],
    sides: { on: false, which: 'both', W: 600, H: ceilingOr(ceilingH), D: 350, kind: 'openTop' },
    upper: { on: false, H: 400, D: 350, y: 2000 }, upperUnits: [],
  };
}

export function tvRun(spec) {
  const sideW = spec.sides.on ? spec.sides.W : 0;
  const left = spec.sides.on && spec.sides.which !== 'right';
  const right = spec.sides.on && spec.sides.which !== 'left';
  const x0 = left ? sideW : 0;
  const x1 = spec.W - (right ? sideW : 0);
  return { x0, x1, runW: Math.max(0, x1 - x0), left, right, sideW };
}

export function tvNormalize(spec) {
  const s = { ...tvDefaults(), ...spec };
  s.W = clamp(int(s.W, 3000), 600, 12000);
  s.lowKind = s.lowKind === 'floor' ? 'floor' : 'floating';
  s.lowH = clamp(int(s.lowH, 400), 200, 1000);
  s.lowD = clamp(int(s.lowD, 400), 250, 650);
  s.lowY = clamp(int(s.lowY, 250), 100, 900);
  s.sides = { ...tvDefaults().sides, ...(s.sides || {}) };
  s.sides.W = clamp(int(s.sides.W, 600), 300, 1500);
  s.sides.H = clamp(ceilingOr(s.sides.H), 1200, 4000);
  s.sides.D = clamp(int(s.sides.D, 350), 250, 650);
  s.sides.which = ['both', 'left', 'right'].includes(s.sides.which) ? s.sides.which : 'both';
  s.sides.kind = TV_SIDE_KINDS.some((k) => k.id === s.sides.kind) ? s.sides.kind : 'openTop';
  s.upper = { ...tvDefaults().upper, ...(s.upper || {}) };
  s.upper.H = clamp(int(s.upper.H, 400), 250, 1000);
  s.upper.D = clamp(int(s.upper.D, 350), 250, 600);
  s.upper.y = clamp(int(s.upper.y, 2000), 1200, 3000);
  const run = tvRun(s);
  const n = autoDoors(run.runW);
  s.lowUnits = resize(s.lowUnits, n, 'doors');
  s.upperUnits = resize(s.upperUnits, n, 'doors');
  return s;
}

const tvLowLeaf = (u) => {
  const k = u?.layout || 'doors';
  if (k === 'drawers') return leaf('drawer', { drawers: 1, drawerKind: 'half', interior: 'drawers' });
  if (k === 'open') return leaf('open', { interior: 'shelves' });
  if (k === 'glass') return leaf('glass', { interior: 'shelves' });
  return leaf('closed');
};
const tvUpperLeaf = (u) => (u?.layout === 'open' ? leaf('open', { interior: 'shelves' }) : u?.layout === 'glass' ? leaf('glass', { interior: 'shelves' }) : leaf('closed'));
function sideBody(kind, Hb) {
  const lower = Math.min(900, Math.round(Hb * 0.4));
  if (kind === 'open') return leaf('open', { interior: 'shelves' });
  if (kind === 'glass') return leaf('glass', { interior: 'shelves' });
  if (kind === 'openTop') return hsplit([lower, Hb - lower], [leaf('closed'), leaf('open', { interior: 'shelves' })]);
  if (kind === 'glassTop') return hsplit([lower, Hb - lower], [leaf('closed'), leaf('glass', { interior: 'shelves' })]);
  return leaf('closed', { interior: 'shelves' });
}

export function tvBuild(spec, cab) {
  const run = tvRun(spec);
  const frames = [];
  if (run.runW > 0) {
    const floating = spec.lowKind === 'floating';
    frames.push({
      id: `${cab.id}-low`, kind: 'base', label: 'TV Cabinet 电视柜', wall: 0, x: run.x0, y: floating ? spec.lowY : 0,
      W: run.runW, H: spec.lowH, D: spec.lowD, base: floating ? { kind: 'wallhung', h: 0 } : { kind: 'plinth', h: 80 },
      ends: { left: !run.left, right: !run.right },
      body: vsplit(splitEven(run.runW, spec.lowUnits.length), spec.lowUnits.map(tvLowLeaf)),
    });
    if (spec.upper.on) {
      frames.push({
        id: `${cab.id}-upper`, kind: 'wall', label: 'Top Cabinet 吊柜', wall: 0, x: run.x0, y: spec.upper.y,
        W: run.runW, H: spec.upper.H, D: spec.upper.D, base: { kind: 'wallhung', h: 0 },
        ends: { left: !run.left, right: !run.right },
        body: vsplit(splitEven(run.runW, spec.upperUnits.length), spec.upperUnits.map(tvUpperLeaf)),
      });
    }
  }
  const side = (id, x, ends) => {
    const base = { kind: 'plinth', h: 80 };
    const Hb = spec.sides.H - base.h;
    const n = autoDoors(spec.sides.W);
    const body = n > 1 ? vsplit(splitEven(spec.sides.W, n), Array.from({ length: n }, () => sideBody(spec.sides.kind, Hb))) : sideBody(spec.sides.kind, Hb);
    return { id: `${cab.id}-${id}`, kind: 'tall', label: 'Display Cabinet 展示高柜', wall: 0, x, y: 0, W: spec.sides.W, H: spec.sides.H, D: spec.sides.D, base, ends, body };
  };
  if (run.left) frames.unshift(side('sideL', 0, { left: true, right: false }));
  if (run.right) frames.push(side('sideR', spec.W - spec.sides.W, { left: false, right: true }));
  return frames;
}

export const tvSummary = (spec) => `${mmToM(spec.W)} m · ${spec.lowKind === 'floating' ? '悬空' : '落地'}低柜${spec.sides.on ? ' · 两侧高柜' : ''}${spec.upper.on ? ' · 上方吊柜' : ''}`;

// ---------------- 鞋柜 / 玄关柜 ----------------
export const SHOE_STYLES = [
  { id: 'niche', zh: '上下柜 + 中间开放台面', en: 'Upper + lower with niche' },
  { id: 'full', zh: '到顶鞋柜', en: 'Full height' },
  { id: 'low', zh: '低柜', en: 'Low cabinet' },
  { id: 'bench', zh: '换鞋凳', en: 'Bench' },
];
export const SHOE_UNITS = [
  { id: 'doors', zh: '门', en: 'Doors' },
  { id: 'open', zh: '开放格', en: 'Open' },
  { id: 'glass', zh: '玻璃门', en: 'Glass' },
];

export function shoeDefaults({ ceilingH } = {}) {
  return {
    W: 1200, style: 'niche', H: ceilingOr(ceilingH), D: 350, raised: true, raisedH: 150,
    lowerH: 900, nicheH: 350, lowH: 950, benchH: 450, units: [],
  };
}

const shoeHeight = (s) => (s.style === 'low' ? s.lowH : s.style === 'bench' ? s.benchH : s.H);

export function shoeNormalize(spec) {
  const s = { ...shoeDefaults(), ...spec };
  s.W = clamp(int(s.W, 1200), 300, 8000);
  s.style = SHOE_STYLES.some((x) => x.id === s.style) ? s.style : 'niche';
  s.H = clamp(ceilingOr(s.H), 1200, 4000);
  s.D = clamp(int(s.D, 350), 200, 650);
  s.raisedH = clamp(int(s.raisedH, 150), 50, 400);
  s.lowerH = clamp(int(s.lowerH, 900), 400, 1400);
  s.nicheH = clamp(int(s.nicheH, 350), 150, 800);
  s.lowH = clamp(int(s.lowH, 950), 500, 1300);
  s.benchH = clamp(int(s.benchH, 450), 350, 600);
  if (s.style === 'bench') s.raised = false;
  s.units = resize(s.units, autoDoors(s.W), 'doors');
  return s;
}

const shoeLeaf = (u) => (u?.layout === 'open' ? leaf('open', { interior: 'shelves' }) : u?.layout === 'glass' ? leaf('glass', { interior: 'shelves' }) : leaf('closed', { interior: 'shelves' }));

export function shoeBuild(spec, cab) {
  const H = shoeHeight(spec);
  const base = spec.raised ? { kind: 'raised', h: spec.raisedH } : { kind: 'plinth', h: 80 };
  const Hb = H - base.h;
  const widths = splitEven(spec.W, spec.units.length);
  let column;
  if (spec.style === 'niche') {
    // 下柜高度从地面量（含底层架空 / 踢脚）
    const lower = Math.max(200, Math.min(spec.lowerH - base.h, Hb - spec.nicheH - 300));
    const niche = Math.min(spec.nicheH, Hb - lower - 200);
    column = (u) => hsplit([lower, niche, Hb - lower - niche], [shoeLeaf(u), leaf('open', { interior: 'niche' }), shoeLeaf(u)]);
  } else if (spec.style === 'bench') {
    column = (u) => (u?.layout === 'doors' ? leaf('drawer', { drawers: 1, drawerKind: 'half', interior: 'drawers' }) : shoeLeaf(u));
  } else column = (u) => shoeLeaf(u);
  return [{
    id: `${cab.id}-f0`, kind: H < 1000 ? 'base' : 'tall', label: spec.style === 'bench' ? 'Bench 换鞋凳' : 'Shoe Cabinet 鞋柜', wall: 0, x: 0, y: 0,
    W: spec.W, H, D: spec.style === 'bench' ? Math.max(spec.D, 400) : spec.D, base, ends: { left: true, right: true },
    body: vsplit(widths, spec.units.map(column)),
  }];
}

export const shoeSummary = (spec) => `${(SHOE_STYLES.find((x) => x.id === spec.style) || SHOE_STYLES[0]).zh} · ${mmToM(spec.W)} × ${mmToM(shoeHeight(spec))} × ${mmToM(spec.D)} m`;
