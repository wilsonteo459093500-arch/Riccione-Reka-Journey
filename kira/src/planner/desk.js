// ============================================================
// 书桌 / 妆台 模板（同一套逻辑，variant 'desk' | 'vanity'）
// 用户定：
//   · 整张桌按地柜延米计价（放脚位也算）→ 桌子柜体 priceVoid（bridge.js frameQuantities 把空位当封门算）
//   · 抽屉柜：左 / 右 / 两边 / 无；上方：无 / 飘板 / 吊柜；侧边高柜（书柜或衣柜）：无 / 左 / 右，高柜内侧有见光板
//   · 默认：书桌 1.2 × 0.75 × 0.6 m；妆台 1.0 × 0.75 × 0.45 m
// W = 桌子本身的宽；侧边高柜另外加在旁边（左高柜：高柜在 x = 0，桌子从高柜右边开始）。
// 计价只用现有种类：地柜（桌子）/ 吊柜 / 高柜 / 见光板 / 飘板（现有的按块价）。
// ============================================================
import { leaf, vsplit, hsplit, splitEven, autoDoors, mmToM, ceilingOr } from './model.js';
import { joinL, bi, FRAME_KIND_NAME } from './lang.js';
import { DEFAULT_SHELF_KIND } from '../constants/shelves.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const int = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };

export const DESK_DRAWERS = [
  { id: 'left', zh: '左', en: 'Left' },
  { id: 'right', zh: '右', en: 'Right' },
  { id: 'both', zh: '两边', en: 'Both' },
  { id: 'none', zh: '无', en: 'None' },
];
export const DESK_ABOVE = [
  { id: 'none', zh: '无', en: 'None' },
  { id: 'shelf', zh: '飘板', en: 'Floating shelves' },
  { id: 'upper', zh: '吊柜', en: 'Top cabinet' },
];
export const DESK_TOWER_WHICH = [
  { id: 'none', zh: '无', en: 'None' },
  { id: 'left', zh: '左', en: 'Left' },
  { id: 'right', zh: '右', en: 'Right' },
];
export const DESK_TOWER_KINDS = [
  { id: 'book', zh: '书柜', en: 'Bookcase', D: 350 },
  { id: 'wardrobe', zh: '衣柜', en: 'Wardrobe', D: 600 },
];
export const towerDepth = (kind) => (DESK_TOWER_KINDS.find((k) => k.id === kind) || DESK_TOWER_KINDS[0]).D;

const VARIANT = {
  desk: { W: 1200, H: 750, D: 600, name: { en: 'Study Desk', zh: '书桌' } },
  vanity: { W: 1000, H: 750, D: 450, name: { en: 'Vanity', zh: '妆台' } },
};
const variantOf = (v) => (v === 'vanity' ? 'vanity' : 'desk');

export function deskDefaults(variant = 'desk', { ceilingH } = {}) {
  const v = VARIANT[variantOf(variant)];
  return {
    variant: variantOf(variant), W: v.W, H: v.H, D: v.D,
    drawers: 'right', drawerW: 400, drawerN: 3,
    above: 'none',
    upper: { H: 600, D: 350, y: 1500 },
    shelf: { n: 2, gap: 300, D: 250, low: 1200 },
    tower: { which: 'none', kind: 'book', W: 600, H: ceilingOr(ceilingH), D: towerDepth('book') },
  };
}

export function deskNormalize(spec) {
  const variant = variantOf(spec?.variant);
  const d = deskDefaults(variant);
  const s = { ...d, ...spec, variant };
  s.W = clamp(int(s.W, d.W), 400, 6000);
  s.H = clamp(int(s.H, d.H), 500, 1000);
  s.D = clamp(int(s.D, d.D), 300, 900);
  s.drawers = DESK_DRAWERS.some((x) => x.id === s.drawers) ? s.drawers : 'right';
  s.drawerN = clamp(int(s.drawerN, 3), 1, 5);
  s.drawerW = clamp(int(s.drawerW, 400), 250, 900);
  s.above = DESK_ABOVE.some((x) => x.id === s.above) ? s.above : 'none';
  s.upper = { ...d.upper, ...(s.upper || {}) };
  s.upper.H = clamp(int(s.upper.H, 600), 250, 1200);
  s.upper.D = clamp(int(s.upper.D, 350), 200, 600);
  s.upper.y = clamp(int(s.upper.y, 1500), s.H + 200, 3000);
  s.shelf = { ...d.shelf, ...(s.shelf || {}) };
  s.shelf.n = clamp(int(s.shelf.n, 2), 1, 6);
  s.shelf.gap = clamp(int(s.shelf.gap, 300), 150, 1000);
  s.shelf.D = clamp(int(s.shelf.D, 250), 100, 600);
  s.shelf.low = clamp(int(s.shelf.low, 1200), s.H + s.shelf.gap, 3500);
  // 只改了种类没给深 → 用那种的常用深（书柜 350 / 衣柜 600）
  s.tower = { ...d.tower, D: towerDepth(s.tower?.kind), ...(s.tower || {}) };
  s.tower.which = DESK_TOWER_WHICH.some((x) => x.id === s.tower.which) ? s.tower.which : 'none';
  s.tower.kind = DESK_TOWER_KINDS.some((x) => x.id === s.tower.kind) ? s.tower.kind : 'book';
  s.tower.W = clamp(int(s.tower.W, 600), 300, 1500);
  s.tower.H = clamp(ceilingOr(s.tower.H), 1200, 4000);
  s.tower.D = clamp(int(s.tower.D, towerDepth(s.tower.kind)), 250, 800);
  return s;
}

// 抽屉柜宽：每个抽屉柜 drawerW，但放脚位最少留 400（桌子太窄就缩抽屉柜）
export function deskColumns(spec) {
  const k = spec.drawers === 'both' ? 2 : spec.drawers === 'none' ? 0 : 1;
  if (!k) return [{ type: 'leg', w: spec.W }];
  const dW = Math.max(100, Math.min(spec.drawerW, Math.floor((spec.W - 400) / k)));
  const leg = spec.W - k * dW;
  if (spec.drawers === 'left') return [{ type: 'drawer', w: dW }, { type: 'leg', w: leg }];
  if (spec.drawers === 'right') return [{ type: 'leg', w: leg }, { type: 'drawer', w: dW }];
  return [{ type: 'drawer', w: dW }, { type: 'leg', w: leg }, { type: 'drawer', w: dW }];
}

export function deskRun(spec) {
  const on = spec.tower.which !== 'none';
  const left = spec.tower.which === 'left';
  const right = spec.tower.which === 'right';
  const x0 = left ? spec.tower.W : 0;
  return { x0, x1: x0 + spec.W, left, right, on, total: spec.W + (on ? spec.tower.W : 0) };
}

const TOWER_NAME = { book: { en: 'Bookcase', zh: '书柜' }, wardrobe: { en: 'Wardrobe', zh: '衣柜' } };
const SHELF_NAME = { en: 'Floating Shelves', zh: '飘板' };
// 柜体名称：桌子 = 书桌 / 妆台；高柜 = 书柜 / 衣柜；吊柜；飘板
export const deskFrameName = (frame, spec) => {
  if (String(frame?.id || '').endsWith('-shelf')) return [SHELF_NAME];
  if (frame?.kind === 'base') return [VARIANT[variantOf(spec?.variant)].name];
  if (frame?.kind === 'tall') return [TOWER_NAME[spec?.tower?.kind] || TOWER_NAME.book];
  return [FRAME_KIND_NAME[frame?.kind] || FRAME_KIND_NAME.wall];
};

function towerBody(kind, W, Hb) {
  const n = autoDoors(W);
  const col = () => {
    if (kind === 'wardrobe') {
      const top = Hb > 2000 ? Math.min(500, Hb - 1600) : 0;
      return top > 0 ? hsplit([Hb - top, top], [leaf('closed', { interior: 'rod' }), leaf('closed', { interior: 'top' })]) : leaf('closed', { interior: 'rod' });
    }
    // 书柜：下面门（同桌高），上面开放书架
    const lower = Math.min(750, Math.round(Hb * 0.35));
    return hsplit([lower, Hb - lower], [leaf('closed', { interior: 'shelves' }), leaf('open', { interior: 'shelves' })]);
  };
  return n > 1 ? vsplit(splitEven(W, n), Array.from({ length: n }, col)) : col();
}

const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export function deskBuild(spec, cab) {
  const run = deskRun(spec);
  const name = VARIANT[variantOf(spec.variant)].name;
  const frames = [];
  const cols = deskColumns(spec);
  // 桌子：柜体落地（抽屉柜到地），桌面用「台面」画法（门板色）；放脚位 = 空位，但 priceVoid → 照地柜延米算
  frames.push({
    id: `${cab.id}-desk`, kind: 'base', label: bi(name), wall: 0, x: run.x0, y: 0,
    W: spec.W, H: spec.H, D: spec.D, base: { kind: 'none', h: 0 }, ends: { left: !run.left, right: !run.right },
    priceVoid: true, worktop: 'door',
    body: cols.length > 1
      ? vsplit(cols.map((c) => c.w), cols.map((c) => (c.type === 'drawer'
        ? leaf('drawer', { drawers: spec.drawerN, drawerKind: 'half', interior: 'drawers' })
        : leaf('void', { interior: 'legroom' }))))
      : leaf('void', { interior: 'legroom' }),
  });
  if (spec.above === 'upper') {
    const n = autoDoors(spec.W);
    frames.push({
      id: `${cab.id}-upper`, kind: 'wall', label: bi(FRAME_KIND_NAME.wall), wall: 0, x: run.x0, y: spec.upper.y,
      W: spec.W, H: spec.upper.H, D: spec.upper.D, base: { kind: 'wallhung', h: 0 }, ends: { left: !run.left, right: !run.right },
      body: n > 1 ? vsplit(splitEven(spec.W, n), Array.from({ length: n }, () => leaf('closed', { interior: 'shelves' }))) : leaf('closed', { interior: 'shelves' }),
    });
  } else if (spec.above === 'shelf') {
    // 同飘板模板：最低一块板面 = low → 区域从 low − gap 开始，高 n × gap
    frames.push({
      id: `${cab.id}-shelf`, kind: 'wall', label: bi(SHELF_NAME), wall: 0, x: run.x0, y: spec.shelf.low - spec.shelf.gap,
      W: spec.W, H: spec.shelf.n * spec.shelf.gap, D: spec.shelf.D, base: { kind: 'wallhung', h: 0 }, ends: { left: false, right: false },
      body: leaf('shelf', { shelves: spec.shelf.n, shelfKind: DEFAULT_SHELF_KIND }),
    });
  }
  if (run.on) {
    // 高柜内侧（朝桌子那一边）：桌子 / 吊柜挡住以外露出来的侧面 → 见光板（同电视柜 tvshoe.js innerPanel；飘板不挡）
    const { D, H, W } = spec.tower;
    let area = D * H - Math.min(D, spec.D) * overlap(0, H, 0, spec.H);
    if (spec.above === 'upper') area -= Math.min(D, spec.upper.D) * overlap(0, H, spec.upper.y, spec.upper.y + spec.upper.H);
    area = Math.max(0, Math.round(area));
    const base = { kind: 'plinth', h: 80 };
    const x = run.left ? 0 : run.x1;
    const tw = {
      id: `${cab.id}-tower`, kind: 'tall', label: bi(TOWER_NAME[spec.tower.kind]), wall: 0, x, y: 0, W, H, D, base,
      ends: { left: run.left, right: run.right },
      ...(area > 0 ? { innerPanel: { side: run.left ? 'right' : 'left', area } } : {}),
      body: towerBody(spec.tower.kind, W, H - base.h),
    };
    if (run.left) frames.unshift(tw); else frames.push(tw);
  }
  return frames;
}

const DRAWER_TXT = { left: { en: 'Drawers left', zh: '左抽屉柜' }, right: { en: 'Drawers right', zh: '右抽屉柜' }, both: { en: 'Drawers both sides', zh: '两边抽屉柜' } };
export const deskSummary = (spec, lang = 'both') => joinL([
  `${mmToM(spec.W)} × ${mmToM(spec.H)} × ${mmToM(spec.D)} m`,
  DRAWER_TXT[spec.drawers],
  spec.above === 'shelf' && SHELF_NAME,
  spec.above === 'upper' && FRAME_KIND_NAME.wall,
  spec.tower?.which !== 'none' && {
    en: `${spec.tower.which === 'left' ? 'Left' : 'Right'} ${TOWER_NAME[spec.tower.kind].en.toLowerCase()}`,
    zh: `${spec.tower.which === 'left' ? '左' : '右'}${TOWER_NAME[spec.tower.kind].zh}`,
  },
], lang);

// 3D / 户型图：一面墙，长 = 桌子 + 高柜
export const deskWalls = (spec) => [{ ox: 0, oz: 0, angle: 0, len: deskRun(spec).total }];
