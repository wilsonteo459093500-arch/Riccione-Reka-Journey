// ============================================================
// 岛台模板
// 用户定：
//   · 前面一排地柜，两头一律见光板
//   · 背面：「见光板」（默认，宽 × 高 → frame.backPanel，bridge.js 出 part 'panelBack'）
//          或「两面都是柜」（背靠背第二排：第二面墙 angle 180，背板贴着前排背板）
//   · 台面只示意、不计价（同厨房台面）
// 默认：长 2.4 m、高 850、深 600、踢脚 100（同厨房地柜）
// ============================================================
import { leaf, vsplit, splitEven, autoDoors, mmToM, normBase } from './model.js';
import { joinL, bi } from './lang.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const int = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };
const resize = (arr = [], n, layout) => { const out = (arr || []).slice(0, n).map((u) => ({ ...u })); while (out.length < n) out.push({ layout }); return out; };

export const ISLAND_UNITS = [
  { id: 'doors', zh: '门', en: 'Doors' },
  { id: 'drawers', zh: '抽屉柜', en: 'Drawers' },
  { id: 'sink', zh: '水槽柜', en: 'Sink' },
  { id: 'hob', zh: '炉灶柜', en: 'Hob' },
  { id: 'open', zh: '开放格', en: 'Open' },
];
export const ISLAND_BACKS = [
  { id: 'panel', zh: '见光板', en: 'Finished panel' },
  { id: 'cabinets', zh: '两面都是柜', en: 'Cabinets both sides' },
];

export function islandDefaults() {
  return { W: 2400, H: 850, D: 600, base: { kind: 'plinth', h: 100 }, back: 'panel', worktop: true, units: [], backUnits: [] };
}

export function islandNormalize(spec) {
  const s = { ...islandDefaults(), ...spec };
  s.W = clamp(int(s.W, 2400), 600, 8000);
  s.H = clamp(int(s.H, 850), 500, 1200);
  s.D = clamp(int(s.D, 600), 300, 900);
  s.base = normBase(s.base);
  if (s.base.kind === 'wallhung' || s.base.kind === 'raised') s.base = normBase({ kind: 'plinth' });
  s.back = s.back === 'cabinets' ? 'cabinets' : 'panel';
  s.worktop = s.worktop !== false;
  const n = autoDoors(s.W);
  s.units = resize(s.units, n, 'doors');
  s.backUnits = resize(s.backUnits, n, 'doors');
  return s;
}

const unitLeaf = (u) => {
  const k = u?.layout || 'doors';
  if (k === 'drawers') return leaf('drawer', { drawers: clamp(int(u.drawers, 3), 1, 5), drawerKind: 'full', interior: 'drawers' });
  if (k === 'sink') return leaf('closed', { interior: 'sink' });
  if (k === 'hob') return leaf('closed', { interior: 'hob' });
  if (k === 'open') return leaf('open', { interior: 'shelves' });
  return leaf('closed');
};

const NAME = { front: { en: 'Island', zh: '岛台' }, back: { en: 'Island Back', zh: '岛台背面' } };
export const islandFrameName = (frame) => [(frame?.wall || 0) > 0 ? NAME.back : NAME.front];

export function islandBuild(spec, cab) {
  const row = (wall, units) => ({
    id: `${cab.id}-${wall ? 'back' : 'front'}`, kind: 'base', label: bi(wall ? NAME.back : NAME.front), wall, x: 0, y: 0,
    // 两头一律见光板。背面那排转了 180°：它的左端在整体右边 → 'end' / 'start'（同厨房：对应 cab.exposed.right / left）
    W: spec.W, H: spec.H, D: spec.D, base: { ...spec.base }, worktop: !!spec.worktop, ends: wall ? { left: 'end', right: 'start' } : { left: true, right: true },
    body: vsplit(splitEven(spec.W, units.length), units.map(unitLeaf)),
  });
  const front = row(0, spec.units);
  if (spec.back === 'cabinets') return [front, row(1, spec.backUnits)];
  // 背面一整块见光板：宽 × 高（mm²）
  return [{ ...front, backPanel: { area: spec.W * spec.H } }];
}

// 摆放：前排沿 +x、柜门朝观众；背靠背那排 angle 180（u → −x、w → −z），原点在前排右后角 → 两排背板都在 z = 0。
// free：岛台不靠墙（3D 不画后墙、地面不截在墙那里）
export function islandWalls(spec) {
  const front = { ox: 0, oz: 0, angle: 0, len: spec.W, free: true, name: { en: 'Front', zh: '正面' } };
  if (spec.back !== 'cabinets') return [front];
  return [front, { ox: spec.W, oz: 0, angle: 180, len: spec.W, free: true, name: { en: 'Back', zh: '背面' } }];
}

export const islandSummary = (spec, lang = 'both') => joinL([
  `${mmToM(spec.W)} × ${mmToM(spec.H)} × ${mmToM(spec.D)} m`,
  spec.back === 'cabinets' ? { en: 'Cabinets both sides', zh: '两面都是柜' } : { en: 'Back panel', zh: '背面见光板' },
], lang);
