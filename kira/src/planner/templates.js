// ============================================================
// 模板：业务只填「总宽 / 高 / 深 / 底座 / 每格单元」，这里生成柜体 frames。
// 规则：先定总宽 → 每扇门最宽 600 自动算门数（可 +/−）→ 平分。
// 只在业务编辑时重算 frames；载入旧报价不重算（避免以后改模板时悄悄改价）。
// ============================================================
import { leaf, vsplit, hsplit, splitEven, autoDoors, uid, ceilingOr, DEFAULT_GLASS_COEF, mmToM, normBase } from './model.js';
import { kitchenDefaults, kitchenNormalize, kitchenBuild, kitchenWalls, kitchenSummary, kitchenFrameName } from './kitchen.js';
import { tvDefaults, tvNormalize, tvBuild, tvSummary, tvFrameName, shoeDefaults, shoeNormalize, shoeBuild, shoeSummary, shoeFrameName } from './tvshoe.js';
import { pickL, joinL, bi, FRAME_KIND_NAME } from './lang.js';
import { pickLang } from '../constants/pricing.js';
import { fitBody } from './blocks.js';
import { SHELF_KINDS, shelfKind, DEFAULT_SHELF_KIND } from '../constants/shelves.js';

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
export { normBase };

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

// ---------------- 空白柜子（第二版）：从一个大框开始画 ----------------
// spec = { kind:'tall'|'base'|'wall', W, H, D, y, base }；build 保留现有的框框，按新尺寸等比例缩放（没有「模板原样」可以还原）
const BLANK_NAME = { en: 'Blank cabinet', zh: '空白柜子' };
export const BLANK_KIND_DEFAULTS = {
  tall: ({ ceilingH } = {}) => ({ kind: 'tall', W: 1200, H: ceilingOr(ceilingH), D: 600, y: 0, base: { kind: 'plinth', h: 100 } }),
  base: () => ({ kind: 'base', W: 1200, H: 850, D: 600, y: 0, base: { kind: 'plinth', h: 100 } }),
  wall: () => ({ kind: 'wall', W: 1200, H: 750, D: 350, y: 1500, base: { kind: 'wallhung', h: 0 } }),
};
const blank = {
  id: 'blank', ...BLANK_NAME,
  defaults: ({ ceilingH } = {}) => BLANK_KIND_DEFAULTS.tall({ ceilingH }),
  normalize(spec) {
    const s = { ...spec };
    s.kind = ['tall', 'base', 'wall'].includes(s.kind) ? s.kind : 'tall';
    s.W = clamp(int(s.W, 1200), 300, 12000);
    s.H = clamp(s.kind === 'tall' ? ceilingOr(s.H) : int(s.H, s.kind === 'base' ? 850 : 750), 300, 4000);
    s.D = clamp(int(s.D, s.kind === 'wall' ? 350 : 600), 200, 1200);
    s.y = s.kind === 'wall' ? clamp(int(s.y, 1500), 0, 3500) : 0;
    s.base = normBase(s.base);
    if (s.H - s.base.h < 200) s.base = { ...s.base, h: Math.max(0, s.H - 200) };
    return s;
  },
  walls: (spec) => [{ ox: 0, oz: 0, angle: 0, len: spec.W }],
  summary: (spec, lang) => joinL([`${mmToM(spec.W)} × ${mmToM(spec.H)} × ${mmToM(spec.D)} m`, FRAME_KIND_NAME[spec.kind] || FRAME_KIND_NAME.tall], lang),
  frameName: (frame) => [FRAME_KIND_NAME[frame?.kind] || FRAME_KIND_NAME.tall],
  build(spec, cab) {
    // 第一个不是用户自己加的柜体（追加 2：用户可以加柜体 / 移动柜体）；位置沿用（吊柜的离地由 spec.y 管）
    const old = (cab.frames || []).find((f) => !f.user);
    const f = {
      id: old?.id || `${cab.id}-f0`, kind: spec.kind, label: bi(FRAME_KIND_NAME[spec.kind] || FRAME_KIND_NAME.tall), wall: 0,
      // 种类没变才沿用移动过的离地高度（吊柜一律看 spec.y）；换种类 → 用新种类的离地（地柜 / 高柜 = 0）
      x: Math.max(0, int(old?.x, 0)), y: spec.kind === 'wall' || old?.kind !== spec.kind ? spec.y : Math.max(0, int(old?.y, 0)),
      W: spec.W, H: spec.H, D: spec.D, base: { ...spec.base }, ends: { left: true, right: true },
      body: old?.body || leaf('closed', { interior: 'shelves' }),
    };
    return [fitBody(f, spec.W, spec.H - spec.base.h, 'scale')];
  },
};

// ---------------- 飘板 / 层架 Shelving（第二版）：墙上一排飘板，按块计价 ----------------
// spec = { W 板长, n 块数, gap 间距, D 深, low 最低一块离地（板面）, kind 种类 }
const SHELF_NAME = { en: 'Floating Shelves', zh: '飘板' };
const shelfTpl = {
  id: 'shelf', zh: '飘板 / 层架', en: 'Floating shelves',
  defaults: () => ({ W: 1200, n: 3, gap: 350, D: 250, low: 1000, kind: DEFAULT_SHELF_KIND }),
  normalize(spec) {
    const s = { ...spec };
    s.kind = SHELF_KINDS.some((k) => k.id === s.kind) ? s.kind : DEFAULT_SHELF_KIND;
    s.W = clamp(int(s.W, 1200), 300, 12000);
    s.n = clamp(int(s.n, 3), 1, 20);
    s.gap = clamp(int(s.gap, 350), 150, 1000);
    s.D = clamp(int(s.D, 250), 100, 600);
    s.low = clamp(int(s.low, 1000), s.gap, 3500);
    return s;
  },
  walls: (spec) => [{ ox: 0, oz: 0, angle: 0, len: spec.W }],
  summary: (spec, lang) => joinL([
    `${mmToM(spec.W)} m`,
    { en: `${spec.n} shelf${spec.n === 1 ? '' : 'ves'}`, zh: `${spec.n} 块` },
    shelfKind(spec.kind).short,
  ], lang),
  frameName: () => [SHELF_NAME],
  build(spec, cab) {
    // 每块板在自己那一段的顶上：最低一块板面 = low → 整块区域从 low − gap 开始，高 n × gap
    return [{
      id: `${cab.id}-f0`, kind: 'wall', label: bi(SHELF_NAME), wall: 0, x: 0, y: spec.low - spec.gap,
      W: spec.W, H: spec.n * spec.gap, D: spec.D, base: { kind: 'wallhung', h: 0 }, ends: { left: false, right: false },
      body: leaf('shelf', { shelves: spec.n, shelfKind: spec.kind }),
    }];
  },
};

export const TEMPLATES = { wardrobe, kitchen, tv, shoe, shelf: shelfTpl, blank };
export const TEMPLATE_LIST = [wardrobe, kitchen, tv, shoe, shelfTpl, blank];
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
  if (frame?.user) return frame.name ? pickL(frame.name, lang) : pickL(FRAME_KIND_NAME[frame.kind] || FRAME_KIND_NAME.tall, lang);
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

// ---------------- 第二版：改模板设定时保留手画的框框（三方合并） ----------------
// o = 现在画面上的（含手画），t = 旧设定的模板原样，n = 新设定的模板原样
//   o 跟 t 一样（没画过）→ 用 n；t 跟 n 一样（模板没改这里）→ 留 o；
//   三个都是同方向、同格数的切分 → 一格一格往下合并（线没拖过的用新尺寸）；
//   其他（两边都改了这里，例如门数变了）→ 用 n，记一笔「照模板重做」。最后把尺寸修整到新的宽 / 柜身高。
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function mergeNode(o, t, n, hit) {
  if (same(o, t)) return n;
  if (same(t, n)) return o;
  const split = (x) => x && !x.leaf && Array.isArray(x.children);
  if (split(o) && split(t) && split(n) && o.split === t.split && t.split === n.split
    && o.children.length === t.children.length && t.children.length === n.children.length) {
    return {
      ...n,
      sizes: same(o.sizes, t.sizes) ? n.sizes.slice() : o.sizes.slice(),
      children: o.children.map((c, i) => mergeNode(c, t.children[i], n.children[i], hit)),
    };
  }
  hit.conflict = true;
  return n;
}

const GEO = ['x', 'y', 'W', 'H', 'D'];
const pruneRemoved = (removed, newFrames) => (removed || []).filter((id) => newFrames.some((f) => f.id === id));
const withRemoved = (cab, list) => { const out = { ...cab }; if (list.length) out.removedFrames = list; else delete out.removedFrames; return out; };
const sameGeo = (a, b) => GEO.every((k) => Number(a?.[k]) === Number(b?.[k]));

export function mergeFrames(oldCab, newFrames) {
  const oldTpl = new Map(buildFrames({ ...oldCab, frames: oldCab.template === 'blank' ? oldCab.frames : [] }).map((f) => [f.id, f]));
  const cur = new Map((oldCab.frames || []).map((f) => [f.id, f]));
  const removed = new Set(oldCab.removedFrames || []);
  const rebuilt = [];
  let kept = false;
  const frames = newFrames.filter((nf) => !removed.has(nf.id)).map((nf) => {
    const of = cur.get(nf.id), ot = oldTpl.get(nf.id);
    if (!of || !ot) return nf;
    if (same(of.body, ot.body) && same(of.base, ot.base) && sameGeo(of, ot)) return nf;
    const hit = { conflict: false };
    const body = mergeNode(of.body, ot.body, nf.body, hit);
    const base = !same(of.base, ot.base) && same(nf.base, ot.base) ? { ...of.base } : nf.base;
    // 位置 / 尺寸（追加 2：柜体可以移动、改大小）：用户改过、模板没改的 → 留用户的
    const geo = {};
    GEO.forEach((k) => { geo[k] = Number(of[k]) !== Number(ot[k]) && Number(nf[k]) === Number(ot[k]) ? of[k] : nf[k]; });
    if (hit.conflict) rebuilt.push(nf.id);
    let g = { ...nf, ...geo, base, body };
    g = fitBody(g, g.W, Math.max(0, g.H - (g.base?.h || 0)), 'scale');
    if (!same(g.body, nf.body) || !same(g.base, nf.base) || !sameGeo(g, nf)) kept = true;
    return g;
  });
  (oldCab.frames || []).forEach((f) => { const ot = oldTpl.get(f.id); if (ot && !newFrames.some((x) => x.id === f.id) && !same(f.body, ot.body)) rebuilt.push(f.id); });
  // 用户自己加的柜体永远保留；删掉的模板柜体不长回来。
  // 新设定已经不生成的 id 从「删掉清单」拿掉（例：电视墙删了 → 关掉 → 再开，就会回来）
  const users = (oldCab.frames || []).filter((f) => f.user);
  const removedFrames = pruneRemoved(oldCab.removedFrames, newFrames);
  if (users.length || removedFrames.length) kept = true;
  return { frames: [...frames, ...users], rebuilt, kept, removedFrames };
}

// 改模板设定（同 updateSpec），但手画过的框框尽量保留 → { cab, rebuilt: [frame id…] }
export function updateSpecKeep(cab, patch) {
  const next = updateSpec(cab, patch);
  if (!cab.custom) return { cab: next, rebuilt: [] };
  if (cab.template === 'blank') { // 空白柜子：框框由 build 保留；这里只接回用户加的柜体、滤掉删掉的
    const removed = pruneRemoved(cab.removedFrames, next.frames);
    return { cab: withRemoved({ ...next, frames: [...next.frames.filter((f) => !removed.includes(f.id)), ...(cab.frames || []).filter((f) => f.user)] }, removed), rebuilt: [] };
  }
  const { frames, rebuilt, kept, removedFrames } = mergeFrames(cab, next.frames);
  const out = withRemoved({ ...next, frames }, removedFrames);
  if (kept) out.custom = true; else delete out.custom;
  return { cab: out, rebuilt };
}

// ---------------- 追加 2：加 / 删整个柜体 ----------------
export const ADD_KINDS = [
  { id: 'base', ...FRAME_KIND_NAME.base },
  { id: 'wall', ...FRAME_KIND_NAME.wall },
  { id: 'tall', ...FRAME_KIND_NAME.tall },
  { id: 'shelf', ...SHELF_NAME },
];

// 加一个柜体：常用尺寸（同空白柜子），放在那面墙现有柜体的最右边 → { cab, id }
export function addFrame(cab, kind, { ceilingH, wall = 0 } = {}) {
  const frames = cab.frames || [];
  const used = new Set(frames.map((f) => f.id));
  let n = 1;
  while (used.has(`${cab.id}-u${n}`)) n += 1;
  const id = `${cab.id}-u${n}`;
  const onWall = frames.filter((f) => (f.wall || 0) === wall && f.kind !== 'backdrop' && f.W > 0);
  const x = onWall.length ? Math.max(...onWall.map((f) => (Number(f.x) || 0) + (Number(f.W) || 0))) : 0;
  let f;
  if (kind === 'shelf') {
    const s = shelfTpl.normalize(shelfTpl.defaults());
    f = { ...shelfTpl.build(s, { id: 'x' })[0], id, x, wall, name: SHELF_NAME, label: bi(SHELF_NAME), user: true };
  } else {
    const k = BLANK_KIND_DEFAULTS[kind] ? kind : 'base';
    const s = blank.normalize(BLANK_KIND_DEFAULTS[k]({ ceilingH }));
    f = {
      id, kind: k, label: bi(FRAME_KIND_NAME[k]), name: FRAME_KIND_NAME[k], wall, x, y: s.y, W: s.W, H: s.H, D: s.D,
      base: { ...s.base }, ends: { left: true, right: true }, user: true,
      body: fitBody({ W: s.W, H: s.H, base: s.base, body: leaf('closed', { interior: 'shelves' }) }, s.W, s.H - s.base.h).body,
    };
  }
  return { cab: { ...cab, frames: [...frames, f], custom: true }, id };
}

// 复制柜子：新 id；柜体 id 的前缀「旧 id-」换成「新 id-」（模板 id 对得上 → 改设定时手画框框照样保留），
// removedFrames 一样换；不是这个前缀的（例：旧报价换算来的）才改成「新 id-f序号」。不带图上位置（会重叠）。
export function copyCabinet(cab, { id = uid('cab'), code } = {}) {
  const src = JSON.parse(JSON.stringify(cab));
  const { place: _p, ...rest } = src;
  const pre = `${cab.id}-`;
  const used = new Set();
  const rename = (fid, i) => {
    let n = typeof fid === 'string' && fid.startsWith(pre) ? `${id}-${fid.slice(pre.length)}` : `${id}-f${i}`;
    while (used.has(n)) n = `${n}x`;
    used.add(n);
    return n;
  };
  const out = { ...rest, id, ...(code ? { code } : {}), frames: (rest.frames || []).map((f, i) => ({ ...f, id: rename(f.id, i) })) };
  if (Array.isArray(rest.removedFrames)) {
    out.removedFrames = rest.removedFrames.map((fid) => (typeof fid === 'string' && fid.startsWith(pre) ? `${id}-${fid.slice(pre.length)}` : fid));
  }
  return out;
}

// 删一个柜体：模板的柜体记进 removedFrames（改设定时不长回来）；用户加的直接拿掉
export function removeFrame(cab, id) {
  const f = (cab.frames || []).find((x) => x.id === id);
  if (!f) return cab;
  const out = { ...cab, frames: cab.frames.filter((x) => x.id !== id), custom: true };
  if (!f.user) out.removedFrames = [...new Set([...(cab.removedFrames || []), id])];
  return out;
}

// 改其中一格的单元
export function setUnit(cab, index, patch) {
  const units = (cab.spec.units || []).map((u, i) => (i === index ? { ...u, ...patch } : u));
  return updateSpec(cab, { units });
}
