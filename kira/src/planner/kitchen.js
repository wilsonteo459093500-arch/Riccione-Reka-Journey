// ============================================================
// 厨房模板：一字 I / L / U / 二字 galley + 电器高柜（冰箱 / 烤箱位）
// 业务填：形状、每面墙长度（量到墙角）、每面墙要不要吊柜、每格单元、高柜放哪一端。
// 默认（用户定）：地柜 高 850 深 600 · 吊柜 高 750 离地 1500 深 350 · 抽屉柜 3 层全展
// 价格规则：每面墙各量到墙角（转角两面都算）—— 实物从转角后开始，转角宽度用 cornerW 照算。
// ============================================================
import { leaf, vsplit, hsplit, splitEven, MAX_DOOR } from './model.js';
import { joinL, bi, FRAME_KIND_NAME, wallName } from './lang.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const int = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };

export const KITCHEN_SHAPES = [
  { id: 'I', zh: '一字型', en: 'Straight', walls: 1 },
  { id: 'L', zh: 'L 型', en: 'L-shape', walls: 2 },
  { id: 'U', zh: 'U 型', en: 'U-shape', walls: 3 },
  { id: 'galley', zh: '二字型', en: 'Galley', walls: 2 },
];
export const KITCHEN_BASE_UNITS = [
  { id: 'doors', zh: '门', en: 'Doors' },
  { id: 'drawers', zh: '抽屉柜', en: 'Drawers' },
  { id: 'sink', zh: '水槽柜', en: 'Sink' },
  { id: 'hob', zh: '炉灶柜', en: 'Hob' },
  { id: 'corner', zh: '转角柜', en: 'Corner' },
  { id: 'appliance', zh: '电器位（空位）', en: 'Appliance gap' },
];
export const KITCHEN_UPPER_UNITS = [
  { id: 'doors', zh: '门', en: 'Doors' },
  { id: 'open', zh: '开放格', en: 'Open' },
  { id: 'glass', zh: '玻璃门', en: 'Glass' },
  { id: 'gap', zh: '空位（烟机）', en: 'Gap (hood)' },
];
export const TALL_KINDS = [
  { id: 'oven', zh: '烤箱高柜', en: 'Oven tower' },
  { id: 'fridgeTop', zh: '冰箱位 + 上方小柜（计价）', en: 'Fridge gap + top cabinet' },
  { id: 'fridgeGap', zh: '整个冰箱空位（不计价）', en: 'Fridge gap only' },
];
const WALL_LETTER = ['A', 'B', 'C'];
const DEFAULT_BASE_PATTERN = ['drawers', 'doors', 'sink', 'doors', 'hob', 'doors'];

const wallsFor = (shape) => (KITCHEN_SHAPES.find((s) => s.id === shape) || KITCHEN_SHAPES[0]).walls;

function defaultWall(i, len) {
  return { len, upper: true, units: [], upperUnits: [] };
}

export function kitchenDefaults() {
  return {
    shape: 'I', walls: [defaultWall(0, 3000)], aisle: 1200,
    base: { kind: 'plinth', h: 100 }, baseH: 850, baseD: 600,
    upperH: 750, upperY: 1500, upperD: 350,
    tall: { on: false, end: 'end', W: 600, H: 2250, kind: 'oven', fridgeH: 1800 },
    worktop: true,
  };
}

// 每面墙：实物从哪里到哪里（扣转角 / 扣高柜），转角宽度，两端是不是露出的「起点 / 终点」
export function wallRuns(spec) {
  const n = spec.walls.length;
  const D = spec.baseD;
  const tallOn = !!spec.tall?.on;
  const tallW = tallOn ? spec.tall.W : 0;
  // 高柜所在：start / end → 哪面墙的哪一端（本地 u=0 左端 / u=len 右端）
  const tallAt = !tallOn ? null
    : spec.shape === 'L' ? (spec.tall.end === 'start' ? { wall: 0, side: 'left' } : { wall: 1, side: 'right' })
      : spec.shape === 'U' ? (spec.tall.end === 'start' ? { wall: 2, side: 'left' } : { wall: 1, side: 'right' })
        : (spec.tall.end === 'start' ? { wall: 0, side: 'left' } : { wall: 0, side: 'right' });
  return spec.walls.map((w, i) => {
    let x0 = 0, x1 = w.len;
    let cornerSide = null; // 这面墙哪一端靠转角（实物让给相邻墙）
    if ((spec.shape === 'L' || spec.shape === 'U') && i === 1) cornerSide = 'left';  // 右墙：从后墙转角开始
    if (spec.shape === 'U' && i === 2) cornerSide = 'right';                        // 左墙：原点在前端，转角在 u=len
    if (cornerSide === 'left') x0 += D;
    if (cornerSide === 'right') x1 -= D;
    // 后墙两端：L 的右端、U 的两端是转角（被侧墙占的那段仍归后墙，后墙满长）
    const corners = { left: cornerSide === 'left', right: cornerSide === 'right' };
    if (i === 0 && (spec.shape === 'L' || spec.shape === 'U')) corners.right = true;
    if (i === 0 && spec.shape === 'U') corners.left = true;
    let tall = null;
    if (tallAt && tallAt.wall === i) {
      if (tallAt.side === 'left') { tall = { x: x0, w: tallW }; x0 += tallW; } else { tall = { x: x1 - tallW, w: tallW }; x1 -= tallW; }
    }
    // 露出端：不是转角、也不挨着高柜的那一端；映射到整排的「起点 / 终点」（cab.exposed.left / right）
    const startEnd = spec.shape === 'U' ? { wall: 2, side: 'left' } : { wall: 0, side: 'left' };
    const endEnd = spec.shape === 'L' || spec.shape === 'U' ? { wall: 1, side: 'right' } : { wall: 0, side: 'right' };
    const endTag = (side) => {
      if (corners[side]) return false;
      if (spec.shape === 'galley') return side === 'left' ? 'start' : 'end'; // 二字型：两排各自两端
      if (startEnd.wall === i && startEnd.side === side) return 'start';
      if (endEnd.wall === i && endEnd.side === side) return 'end';
      return false;
    };
    // 价钱 = 墙长（量到墙角）− 高柜；实物 runW 是扣掉转角后的那段，转角 cornerW 照算。
    // 墙太短（高柜把整段占满 / 短的回头墙）时 runW = 0，但转角照样计价；高柜 + 转角比墙还宽 → 转角只算到高柜为止（价钱连续，不跳）
    const runW = Math.max(0, x1 - x0);
    const cornerW = cornerSide ? Math.min(D, Math.max(0, w.len - (tall ? tallW : 0)) - runW) : 0;
    const overflow = Math.max(0, x0 - x1); // 高柜 + 转角超出墙长多少（validate 提醒）
    return { i, len: w.len, x0, x1, runW, cornerW, cornerSide, tall, endTag, tallSide: tallAt?.wall === i ? tallAt.side : null, overflow };
  });
}

export function kitchenNormalize(spec) {
  const s = { ...kitchenDefaults(), ...spec };
  s.shape = KITCHEN_SHAPES.some((x) => x.id === s.shape) ? s.shape : 'I';
  const nWalls = wallsFor(s.shape);
  const walls = (s.walls || []).slice(0, nWalls).map((w) => ({ ...defaultWall(0, 2400), ...w }));
  while (walls.length < nWalls) walls.push(defaultWall(walls.length, walls.length === 1 && s.shape !== 'galley' ? 2400 : 2400));
  s.baseH = clamp(int(s.baseH, 850), 500, 1100);
  s.baseD = clamp(int(s.baseD, 600), 300, 900);
  s.upperH = clamp(int(s.upperH, 750), 300, 1500);
  s.upperY = clamp(int(s.upperY, 1500), 1000, 2600);
  s.upperD = clamp(int(s.upperD, 350), 200, 600);
  s.aisle = clamp(int(s.aisle, 1200), 600, 3000);
  s.base = { kind: ['plinth', 'legs', 'none'].includes(s.base?.kind) ? s.base.kind : 'plinth', h: s.base?.kind === 'none' ? 0 : clamp(int(s.base?.h, s.base?.kind === 'legs' ? 120 : 100), 20, 300) };
  s.tall = { ...kitchenDefaults().tall, ...(s.tall || {}) };
  s.tall.W = clamp(int(s.tall.W, 600), 400, 1200);
  s.tall.H = clamp(int(s.tall.H, 2250), 1500, 3200);
  s.tall.fridgeH = clamp(int(s.tall.fridgeH, 1800), 1200, s.tall.H - 200);
  s.tall.end = s.tall.end === 'start' ? 'start' : 'end';
  s.tall.kind = TALL_KINDS.some((k) => k.id === s.tall.kind) ? s.tall.kind : 'oven';
  s.walls = walls.map((w) => ({ ...w, len: clamp(int(w.len, 2400), 600, 12000), upper: w.upper !== false }));
  // 每面墙的单元数 = ceil(实物宽 / 600)
  const runs = wallRuns(s);
  s.walls = s.walls.map((w, i) => {
    const n = Math.max(1, Math.ceil(runs[i].runW / MAX_DOOR));
    const units = (w.units || []).slice(0, n).map((u) => ({ ...u }));
    while (units.length < n) units.push({ layout: i === 0 ? DEFAULT_BASE_PATTERN[units.length % DEFAULT_BASE_PATTERN.length] : 'doors' });
    const upperUnits = (w.upperUnits || []).slice(0, n).map((u) => ({ ...u }));
    while (upperUnits.length < n) upperUnits.push({ layout: 'doors' });
    return { ...w, units, upperUnits };
  });
  return s;
}

function baseColumn(u, Hb) {
  const k = u?.layout || 'doors';
  if (k === 'drawers') return leaf('drawer', { drawers: clamp(int(u.drawers, 3), 1, 5), drawerKind: u.drawerKind === 'half' ? 'half' : 'full', interior: 'drawers' });
  if (k === 'sink') return leaf('closed', { interior: 'sink' });
  if (k === 'hob') return leaf('closed', { interior: 'hob' });
  if (k === 'corner') return leaf('closed', { interior: 'corner' });
  if (k === 'appliance') return leaf('void', { interior: 'appliance' });
  return leaf('closed');
}
function upperColumn(u) {
  const k = u?.layout || 'doors';
  if (k === 'open') return leaf('open', { interior: 'shelves' });
  if (k === 'glass') return leaf('glass', { interior: 'shelves' });
  if (k === 'gap') return leaf('void', { interior: 'hood' });
  return leaf('closed', { interior: 'shelves' });
}

export function kitchenBuild(spec, cab) {
  const runs = wallRuns(spec);
  const frames = [];
  const multi = spec.walls.length > 1;
  runs.forEach((r) => {
    const w = spec.walls[r.i];
    // label：存档用的双语字串（旧记录也是这个格式）；报价单 / Excel 按语言显示用 kitchenFrameName，不拆这个字串
    const tag = multi ? ` · 墙${WALL_LETTER[r.i]} Wall ${WALL_LETTER[r.i]}` : '';
    const n = w.units.length;
    const ends = (W) => (W > 0 ? { left: r.tallSide === 'left' ? false : r.endTag('left'), right: r.tallSide === 'right' ? false : r.endTag('right') } : { left: false, right: false });
    // 地柜：实物 runW = 0（只剩转角）也要建，转角照算；宽 0 的柜体没有侧面露出 → 不加见光板，也不算抽屉
    if (r.runW > 0 || r.cornerW > 0) {
      const Hb = spec.baseH - spec.base.h;
      frames.push({
        id: `${cab.id}-w${r.i}-base`, kind: 'base', label: `${bi(FRAME_KIND_NAME.base)}${tag}`, wall: r.i, x: r.x0, y: 0,
        W: r.runW, H: spec.baseH, D: spec.baseD, base: { ...spec.base }, worktop: !!spec.worktop,
        cornerW: r.cornerW, ends: ends(r.runW),
        body: r.runW > 0 ? vsplit(splitEven(r.runW, n), w.units.map((u) => baseColumn(u, Hb))) : leaf('closed'),
      });
    }
    if (w.upper) {
      // 吊柜也从转角后开始（实物让给相邻墙的吊柜深度）；价钱同地柜 = 墙长 − 高柜 → 转角段 = 价钱长 − 实物宽（最多吊柜深）
      const ux0 = r.cornerSide === 'left' ? r.x0 - spec.baseD + spec.upperD : r.x0;
      const ux1 = r.cornerSide === 'right' ? r.x1 + spec.baseD - spec.upperD : r.x1;
      const uW = Math.max(0, ux1 - ux0);
      const upperCorner = r.cornerSide ? Math.min(spec.upperD, Math.max(0, r.runW + r.cornerW - uW)) : 0;
      if (uW > 0 || upperCorner > 0) {
        frames.push({
          id: `${cab.id}-w${r.i}-upper`, kind: 'wall', label: `${bi(FRAME_KIND_NAME.wall)}${tag}`, wall: r.i, x: uW > 0 ? ux0 : Math.min(ux0, ux1), y: spec.upperY,
          W: uW, H: spec.upperH, D: spec.upperD, base: { kind: 'wallhung', h: 0 },
          cornerW: upperCorner, ends: ends(uW),
          body: uW > 0 ? vsplit(splitEven(uW, w.upperUnits.length), w.upperUnits.map(upperColumn)) : leaf('closed', { interior: 'shelves' }),
        });
      }
    }
    if (r.tall) {
      const t = spec.tall;
      const Hb = t.H - (t.kind === 'oven' ? spec.base.h : 0);
      let body;
      // 烤箱高柜：按整个高柜计价（同旧工具填 长×高）；烤箱位只是示意
      if (t.kind === 'oven') body = hsplit([Math.round(Hb * 0.35), 600, Hb - Math.round(Hb * 0.35) - 600], [leaf('drawer', { drawers: 2, drawerKind: 'full' }), leaf('closed', { interior: 'oven' }), leaf('closed')]);
      else if (t.kind === 'fridgeTop') body = hsplit([t.fridgeH, t.H - t.fridgeH], [leaf('void', { interior: 'fridge' }), leaf('closed')]);
      else body = leaf('void', { interior: 'fridge' });
      frames.push({
        id: `${cab.id}-w${r.i}-tall`, kind: 'tall', label: `${bi(FRAME_KIND_NAME.tall)}${tag}`, wall: r.i, x: r.tall.x, y: 0,
        W: r.tall.w, H: t.H, D: spec.baseD, base: t.kind === 'oven' ? { ...spec.base } : { kind: 'none', h: 0 },
        ends: { left: r.tallSide === 'left' ? r.endTag('left') : false, right: r.tallSide === 'right' ? r.endTag('right') : false },
        body,
      });
    }
  });
  return frames;
}

// 一句话简介（按输出语言）：「L-shape · 3.00 + 2.40 m · Tall Cabinet」/「L 型 · 3.00 + 2.40 m · 高柜」
export function kitchenSummary(spec, lang = 'both') {
  const sh = KITCHEN_SHAPES.find((x) => x.id === spec.shape) || KITCHEN_SHAPES[0];
  const lens = spec.walls.map((w) => (w.len / 1000).toFixed(2)).join(' + ');
  return joinL([sh, `${lens} m`, spec.tall?.on && FRAME_KIND_NAME.tall], lang);
}

// 柜体名称（报价单 / Excel 小标题）：种类 + 多面墙时第几面墙 → [{en,zh}…]，渲染时按语言取
export const kitchenFrameName = (frame, spec) => [
  FRAME_KIND_NAME[frame?.kind] || FRAME_KIND_NAME.tall,
  (spec?.walls?.length || 1) > 1 && wallName(frame?.wall),
];

// 3D 摆放：后墙 A 沿 +x；L/U 的右墙 B 从后墙右端往观众方向；U 的左墙 C 原点在前端；二字型对面那排朝后
export function kitchenWalls(spec) {
  const D = spec.baseD;
  const [a, b, c] = spec.walls.map((w) => w.len);
  if (spec.shape === 'L') return [{ ox: 0, oz: 0, angle: 0, len: a }, { ox: a, oz: 0, angle: 90, len: b }];
  if (spec.shape === 'U') return [{ ox: 0, oz: 0, angle: 0, len: a }, { ox: a, oz: 0, angle: 90, len: b }, { ox: 0, oz: c, angle: 270, len: c }];
  if (spec.shape === 'galley') return [{ ox: 0, oz: 0, angle: 0, len: a }, { ox: b, oz: D + spec.aisle + D, angle: 180, len: b }];
  return [{ ox: 0, oz: 0, angle: 0, len: a }];
}
