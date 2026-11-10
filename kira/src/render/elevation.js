// ============================================================
// 线稿立面图 Front elevation —— 编辑器预览 + 报价单里每个柜子旁边的小缩略图。
// 纯数据：cabinet → { viewBox, shapes }（单位 mm，SVG 坐标 y 向下），由 SvgShapes.jsx 画出来。
// 不用 React / DOM，不用随机数 → 同样输入永远同样输出，可在 Node 里测试。
//
//   elevationScene(cab, { style:'drawing'|'blocks', dims:true, lang:'en'|'zh'|'both', walls })
//   第二版「画框框」（只在 blocks 样式）：
//     每个色块 rect 带 hit:'frameId|path'，底座条带 hit:'frameId|base'；scene 多回传 frames:[{id,X0,yb,W,Hb}] 给拖拉换算坐标
//     selected:'frameId|path' → 那格画金色粗框；sizes:true → 格子里多写「600×900」
//
// 坐标：模型 y 向上（地面 y=0），SVG y = −模型 y（只翻转一次）。
// 多面墙：按墙序号从左到右展开排，墙与墙之间留 ~400mm；frame.x = 在这面墙上的位置。
// 线宽 / 字号都跟着整张图的大小走（U = max(总宽, 总高) / 400），600 宽的单柜和 6m 的厨房缩略图都清楚。
// 每个图形多带一个 role 字段（door / drawer / dim …），SvgShapes 不用它，测试和以后的交互用。
// ============================================================
import { layoutLeaves, MAX_DOOR } from '../planner/model.js';
import { cabinetWalls } from '../planner/templates.js';
import {
  INK, INK_SOFT, GLASS, WORKTOP, BLOCK_COLORS, BLOCK_SELECTED, LINE,
  finishOf, DEFAULT_DOOR_FINISH, DEFAULT_CARCASS_FINISH,
} from './palette.js';

// ---------- 尺寸常数（mm） ----------
const GAP = 3;            // 门缝
const PANEL = 18;         // 板厚
const WT_T = 30;          // 台面厚
const WT_OVH = 20;        // 台面前沿出挑（立面里画成两头各宽一点）
const WALL_GAP = 400;     // 展开时墙与墙的间距
const SHELF_PITCH = 350;  // 层板间距
const ROD_DROP = 120;     // 挂衣杆离格顶
const STILE = 50;         // 玻璃门边框
const LEG = 40;           // 柜脚宽
const TAP_H = 300;        // 龙头高出台面
const HOB_H = 40;         // 炉头高出台面
const OVEN_GLASS = '#3A3B3A';  // 烤箱门（同 axo.js）
const OVEN_WINDOW = '#4C4E4D';
const STEEL_DARK = '#A9AFAE';

// ---------- 文案 ----------
const TXT = {
  appliance: { en: 'Appliance', zh: '电器位' },
  hood: { en: 'Hood', zh: '烟机位' },
  fridge: { en: 'Fridge', zh: '冰箱位' },
  note: { en: 'Illustrative', zh: '仅示意' },
  raised: { en: 'Raised', zh: '底层架空' },
  blocks: {
    closed: { en: 'Closed', zh: '封闭区' },
    open: { en: 'Open', zh: '开放区' },
    glass: { en: 'Glass', zh: '玻璃柜体区' },
    drawer: { en: 'Drawers', zh: '抽屉区' },
    void: { en: 'Gap', zh: '空位' },
  },
};
const wallText = (i) => {
  const ch = String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : '');
  return { en: `Wall ${ch}`, zh: `墙${ch}` };
};
const pick = (t, lang) => (lang === 'en' ? t.en : lang === 'zh' ? t.zh : `${t.en} ${t.zh}`);
// 两行版（both：英文一行、中文一行）
const pickLines = (t, lang) => (lang === 'en' ? [t.en] : lang === 'zh' ? [t.zh] : [t.en, t.zh]);

// ---------- 小工具 ----------
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rnd = (v) => { const n = Math.round(num(v) * 10) / 10; return n === 0 ? 0 : n; };

function rgb(hex) {
  let s = String(hex || '').replace('#', '').trim();
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16);
  if (!/^[0-9a-fA-F]{6}/.test(s) || !Number.isFinite(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// t = b 的占比
export function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return `#${A.map((v, i) => clamp(Math.round(v + (B[i] - v) * t), 0, 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

// 字宽估算（em）：用来排字和算 viewBox，不需要很准
export function textEm(s) {
  let e = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c >= 0x2e80) e += 1;
    else if (ch === ' ') e += 0.28;
    else if (ch >= '0' && ch <= '9') e += 0.6;
    else if (ch >= 'A' && ch <= 'Z') e += 0.68;
    else if (ch >= 'a' && ch <= 'z') e += 0.54;
    else if (ch === '↑') e += 0.7;
    else e += 0.42;
  }
  return e;
}

// 文字的大概外框（SVG 坐标）
function textBox(s) {
  const w = textEm(s.text) * s.size;
  let x0 = s.anchor === 'middle' ? s.x - w / 2 : s.anchor === 'end' ? s.x - w : s.x;
  let y0, y1;
  if (s.baseline === 'central' || s.baseline === 'middle') { y0 = s.y - s.size * 0.5; y1 = s.y + s.size * 0.5; }
  else if (s.baseline === 'hanging') { y0 = s.y; y1 = s.y + s.size; }
  else { y0 = s.y - s.size * 0.8; y1 = s.y + s.size * 0.22; }
  if (s.rotate === -90 || s.rotate === 90 || s.rotate === 270) {
    // 绕 (x,y) 转 90°：宽高互换
    const cx = s.x, cy = s.y;
    const pts = [[x0, y0], [x0 + w, y1]].map(([px, py]) => [cx + (py - cy), cy - (px - cx)]);
    return [Math.min(pts[0][0], pts[1][0]), Math.min(pts[0][1], pts[1][1]), Math.max(pts[0][0], pts[1][0]), Math.max(pts[0][1], pts[1][1])];
  }
  return [x0, y0, x0 + w, y1];
}

function shapeBox(s) {
  const h = (s.sw || 0) / 2;
  if (s.t === 'rect') return [s.x - h, s.y - h, s.x + s.w + h, s.y + s.h + h];
  if (s.t === 'line') return [Math.min(s.x1, s.x2) - h, Math.min(s.y1, s.y2) - h, Math.max(s.x1, s.x2) + h, Math.max(s.y1, s.y2) + h];
  if (s.t === 'circle') return [s.cx - s.r - h, s.cy - s.r - h, s.cx + s.r + h, s.cy + s.r + h];
  if (s.t === 'poly') {
    const xs = s.points.map((p) => p[0]), ys = s.points.map((p) => p[1]);
    return [Math.min(...xs) - h, Math.min(...ys) - h, Math.max(...xs) + h, Math.max(...ys) + h];
  }
  if (s.t === 'path') {
    const n = (s.d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
    if (!xs.length) return null;
    return [Math.min(...xs) - h, Math.min(...ys) - h, Math.max(...xs) + h, Math.max(...ys) + h];
  }
  if (s.t === 'text') return textBox(s);
  return null;
}

function unionBox(boxes) {
  let b = null;
  for (const x of boxes) {
    if (!x) continue;
    b = b ? [Math.min(b[0], x[0]), Math.min(b[1], x[1]), Math.max(b[2], x[2]), Math.max(b[3], x[3])] : [...x];
  }
  return b;
}
const hits = (a, b, pad = 0) => a[0] < b[2] + pad && b[0] < a[2] + pad && a[1] < b[3] + pad && b[1] < a[3] + pad;

// ---------- 图形清单 ----------
function makeOut() {
  const shapes = [];
  const opt = (o) => {
    const r = {};
    if (o.dash) r.dash = o.dash;
    if (o.rx) r.rx = o.rx;
    if (o.opacity != null) r.opacity = o.opacity;
    if (o.role) r.role = o.role;
    if (o.hit) r.hit = o.hit;
    return r;
  };
  return {
    shapes,
    rect(x, y, w, h, o = {}) {
      if (!(w > 0) || !(h > 0)) return;
      shapes.push({ t: 'rect', x, y, w, h, fill: o.fill ?? 'none', stroke: o.stroke ?? 'none', sw: o.sw ?? 0, ...opt(o) });
    },
    line(x1, y1, x2, y2, o = {}) {
      shapes.push({ t: 'line', x1, y1, x2, y2, stroke: o.stroke ?? INK, sw: o.sw ?? 1, ...opt(o) });
    },
    circle(cx, cy, r, o = {}) {
      shapes.push({ t: 'circle', cx, cy, r, fill: o.fill ?? 'none', stroke: o.stroke ?? 'none', sw: o.sw ?? 0, ...opt(o) });
    },
    path(d, o = {}) {
      shapes.push({ t: 'path', d, fill: o.fill ?? 'none', stroke: o.stroke ?? INK, sw: o.sw ?? 1, ...opt(o) });
    },
    poly(points, o = {}) {
      shapes.push({ t: 'poly', points, fill: o.fill ?? 'none', stroke: o.stroke ?? 'none', sw: o.sw ?? 0, ...opt(o) });
    },
    text(x, y, text, size, o = {}) {
      const s = { t: 'text', x, y, text: String(text), size, anchor: o.anchor || 'start', fill: o.fill || INK };
      if (o.weight) s.weight = o.weight;
      if (o.baseline) s.baseline = o.baseline;
      if (o.rotate) s.rotate = o.rotate;
      if (o.role) s.role = o.role;
      shapes.push(s);
    },
  };
}

// 所有数字取 0.1mm，保证有限（不出现 NaN / Infinity）
function sanitize(shapes) {
  return shapes.map((s) => {
    const o = {};
    for (const [k, v] of Object.entries(s)) {
      if (typeof v === 'number') o[k] = rnd(v);
      else if (k === 'points') o[k] = v.map((p) => [rnd(p[0]), rnd(p[1])]);
      else o[k] = v;
    }
    return o;
  });
}

// ---------- 柜体规范化（不改原对象） ----------
// 切分树先洗一遍再交给 layoutLeaves：缺 children / sizes 是字符串 / 坏节点都不会抛错或拼出字符串坐标
function cleanNode(n, depth = 0) {
  if (!n || typeof n !== 'object' || depth > 24) return null;
  const kids = Array.isArray(n.children) ? n.children : null;
  if (n.leaf || (!kids && n.type)) return n;
  if (!kids) return null;
  const sizes = Array.isArray(n.sizes) ? n.sizes : [];
  return {
    split: n.split === 'v' ? 'v' : 'h',
    sizes: kids.map((_, k) => Math.max(0, num(sizes[k]))),
    children: kids.map((c) => cleanNode(c, depth + 1)),
  };
}

// 见光板：同计价 bridge.js / axo.js —— frame.ends 标了且 cab.exposed 没关掉才画（'start' / 'end' = 整排起点 / 终点）
function endsOf(f, ex) {
  const on = (side) => {
    const flag = f?.ends?.[side];
    if (!flag) return false;
    const k = flag === 'start' ? 'left' : flag === 'end' ? 'right' : side;
    return ex?.[k] !== false;
  };
  return { left: on('left'), right: on('right') };
}

function normFrame(f, i, ex) {
  const H = Math.max(0, num(f.H));
  const bk = ['plinth', 'legs', 'raised', 'wallhung', 'none'].includes(f.base?.kind) ? f.base.kind : 'none';
  const bh = bk === 'wallhung' || bk === 'none' ? 0 : clamp(num(f.base?.h), 0, H);
  const W = Math.max(0, num(f.W));
  const n = {
    i, id: f.id == null ? `f${i}` : String(f.id), kind: f.kind || 'tall', wall: Math.max(0, Math.round(num(f.wall))),
    x: num(f.x), y: Math.max(0, num(f.y)), W, H, D: Math.max(0, num(f.D)),
    base: { kind: bk, h: bh },
    ends: endsOf(f, ex),
    worktop: !!f.worktop,
  };
  const body = cleanNode(f.body);
  n.body = body;
  n.Hb = Math.max(0, H - bh);
  n.leaves = body ? layoutLeaves(body, 0, 0, W, n.Hb).filter((l) => num(l.w) > 0 && num(l.h) > 0) : [];
  const v = body && !body.leaf && body.split === 'v' ? body.sizes : [];
  n.cols = v.length > 1 ? v : [];
  n.hasSink = n.leaves.some((l) => l.node?.interior === 'sink' && l.node?.type !== 'void');
  n.hasHob = n.leaves.some((l) => l.node?.interior === 'hob' && l.node?.type !== 'void');
  return n;
}

const safeWalls = (cab) => { try { return cabinetWalls(cab) || []; } catch { return []; } };

// ============================================================
export function elevationScene(cab, opts = {}) {
  const style = opts.style === 'blocks' ? 'blocks' : 'drawing';
  const showDims = opts.dims !== false;
  const lang = ['en', 'zh', 'both'].includes(opts.lang) ? opts.lang : 'both';
  const walls = Array.isArray(opts.walls) ? opts.walls : safeWalls(cab || {});
  // 宽 0 的柜体（厨房只剩转角计价的那段，实物画在相邻墙上）不画，也不参与排墙 / 台面出挑
  const frames = (Array.isArray(cab?.frames) ? cab.frames : []).filter((f) => f && typeof f === 'object').map((f, i) => normFrame(f, i, cab?.exposed)).filter((f) => f.W > 0);

  // 台面两头出挑：贴着别的柜体那一边不出挑
  for (const f of frames) {
    const touching = (side) => frames.some((g) => g !== f && g.wall === f.wall && g.y < f.y + f.H && g.y + g.H > f.y - 1
      && (side === 'L' ? Math.abs(g.x + g.W - f.x) < 5 : Math.abs(f.x + f.W - g.x) < 5));
    f.ovhL = f.worktop && !touching('L') ? WT_OVH : 0;
    f.ovhR = f.worktop && !touching('R') ? WT_OVH : 0;
    f.top = f.y + f.H + (f.worktop ? WT_T : 0);
    f.visTop = f.top + (style === 'drawing' ? (f.hasSink ? TAP_H : f.hasHob ? HOB_H : 0) : 0);
  }

  // ---------- 展开排墙 ----------
  const idx = [...new Set(frames.map((f) => f.wall))].sort((a, b) => a - b);
  if (!idx.length) idx.push(0);
  const ext = idx.map((w) => {
    const fs = frames.filter((f) => f.wall === w);
    let s = 0, e = Math.max(0, num(walls[w]?.len));
    for (const f of fs) { s = Math.min(s, f.x - f.ovhL); e = Math.max(e, f.x + f.W + f.ovhR); }
    if (e - s <= 0) e = s + 600;
    return { w, s, e, fs };
  });
  const roughW = ext.reduce((a, x) => a + (x.e - x.s), 0) + WALL_GAP * (ext.length - 1);
  const roughH = Math.max(600, ...frames.map((f) => f.visTop));
  const U = Math.max(roughW, roughH, 600) / 400;
  const wallGap = Math.max(WALL_GAP, showDims ? 42 * U : 0); // 有尺寸线时留够放「↑1500」和上一面墙的高度尺寸
  let cursor = 0;
  for (const x of ext) {
    x.ox = cursor - x.s;              // 这面墙起点（墙坐标 0）的 SVG x
    x.x0 = cursor; x.x1 = cursor + (x.e - x.s);
    for (const f of x.fs) f.X0 = x.ox + f.x;
    cursor = x.x1 + wallGap;
  }

  // ---------- 线宽 / 字号 ----------
  const S = {
    U,
    main: 1.35 * U, sw: 0.75 * U, thin: 0.55 * U, hair: 0.42 * U,
    dimTxt: 11 * U, lbl: 8.5 * U, wallTxt: 10 * U, code: 20 * U, note: 7.5 * U,
    dashHint: `${rnd(2.2 * U)} ${rnd(1.8 * U)}`,
    dashSwing: `${rnd(3 * U)} ${rnd(2.2 * U)}`,
    dashVoid: `${rnd(4 * U)} ${rnd(2.6 * U)}`,
  };

  const doorHex = finishOf(cab?.finish?.door ?? DEFAULT_DOOR_FINISH).hex;
  const carcHex = finishOf(cab?.finish?.carcass ?? DEFAULT_CARCASS_FINISH, 'white').hex;
  const C = {
    tint: mix(doorHex, '#FFFFFF', 0.65),
    carcass: carcHex,
    recess: mix(carcHex, INK, 0.13),
    plinth: mix(mix(doorHex, '#FFFFFF', 0.5), INK, 0.32),
    leg: mix(INK, '#000000', 0.1),
  };
  C.hint = mix(INK, C.tint, 0.58);          // 门后的内部示意（虚线）
  C.swing = mix(INK, C.tint, 0.5);          // 开门方向 V 线
  C.shadow = mix(INK, C.tint, 0.42);        // 隐藏拉手的阴影线
  C.dim = INK_SOFT;
  C.floor = mix(INK, '#FFFFFF', 0.15);

  const out = makeOut();
  const ctx = { out, S, C, style, lang, selected: style === 'blocks' && opts.selected ? String(opts.selected) : null, sizes: style === 'blocks' && !!opts.sizes, handle: ['hidden', 'bar', 'knob', 'push'].includes(cab?.handle) ? cab.handle : 'hidden' };

  // 地面线
  for (const x of ext) out.line(x.x0 - 120, 0, x.x1 + 120, 0, { stroke: C.floor, sw: 1.2 * U, role: 'floor' });

  for (const f of frames) drawFrame(ctx, f);

  if (showDims) placeDims(ctx, frames);

  // 墙名（多于一面墙才画）
  if (ext.length > 1) {
    const bb = unionBox(out.shapes.map(shapeBox)) || [0, 0, 0, 0];
    const y = bb[3] + 5 * U + 0.8 * S.wallTxt;
    for (const x of ext) {
      out.text((x.x0 + x.x1) / 2, y, pick(wallText(x.w), lang), S.wallTxt, { anchor: 'middle', fill: INK_SOFT, weight: 600, role: 'wall-label' });
    }
  }

  // 柜号（左上）+「仅示意」（右下）
  let bb = unionBox(out.shapes.map(shapeBox)) || [0, -600, 600, 0];
  const code = String(cab?.code ?? '').trim();
  if (code) out.text(bb[0], bb[1] - 4 * U, code, S.code, { weight: 700, fill: INK, role: 'code' });
  out.text(bb[2], bb[3] + 4 * U + 0.8 * S.note, pick(TXT.note, lang), S.note, { anchor: 'end', fill: INK_SOFT, role: 'note' });

  const shapes = sanitize(out.shapes);
  bb = unionBox(shapes.map(shapeBox)) || [0, -600, 600, 0];
  const m = 6 * U;
  const viewBox = [rnd(bb[0] - m), rnd(bb[1] - m), rnd(Math.max(1, bb[2] - bb[0] + 2 * m)), rnd(Math.max(1, bb[3] - bb[1] + 2 * m))];
  if (style === 'blocks') return { viewBox, shapes, frames: frames.map((f) => ({ id: f.id, X0: f.X0, yb: f.y + f.base.h, W: f.W, Hb: f.Hb })) };
  return { viewBox, shapes };
}

// ============================================================
// 一个柜体
// ============================================================
function drawFrame(ctx, f) {
  const { out, S, C, style } = ctx;
  const X0 = f.X0, W = f.W, yb = f.y + f.base.h, yt = f.y + f.H;
  // 模型坐标（x 相对柜体左边，y 离地向上）→ SVG
  const R = (x, y, w, h, o) => out.rect(X0 + x, -(y + h), w, h, o);
  const L = (x1, y1, x2, y2, o) => out.line(X0 + x1, -y1, X0 + x2, -y2, o);
  const P = (cmds, o) => out.path(cmds.map(([c, ...v]) => c + (v.length ? ' ' + v.map((n, k) => rnd(k % 2 ? -n : X0 + n)).join(' ') : '')).join(' '), o);
  const Ci = (cx, cy, r, o) => out.circle(X0 + cx, -cy, r, o);
  const G = { R, L, P, Ci, X0 };

  if (W <= 0 || f.H <= 0) return;

  drawBase(ctx, f, G);

  const Hb = f.Hb;
  for (const lf of f.leaves) {
    const node = lf.node || {};
    const type = ['closed', 'open', 'glass', 'drawer', 'void'].includes(node.type) ? node.type : 'closed';
    const e = { l: lf.x <= 0.5, r: lf.x + lf.w >= W - 0.5, b: lf.y <= 0.5, t: lf.y + lf.h >= Hb - 0.5 };
    const cell = { x: lf.x, y: yb + lf.y, w: lf.w, h: lf.h, e, node, type, hit: `${f.id}|${lf.path ?? ''}` };
    // 门板外框：外圈 3mm 缝，相邻两格之间各让 1.5mm
    const il = e.l ? GAP : GAP / 2, ir = e.r ? GAP : GAP / 2, ib = e.b ? GAP : GAP / 2, it = e.t ? GAP : GAP / 2;
    cell.fx = cell.x + il; cell.fy = cell.y + ib; cell.fw = Math.max(0, cell.w - il - ir); cell.fh = Math.max(0, cell.h - ib - it);

    if (style === 'blocks') { drawBlock(ctx, f, G, cell); continue; }
    if (type === 'void') { drawVoid(ctx, f, G, cell); continue; }
    R(cell.x, cell.y, cell.w, cell.h, { fill: C.carcass, role: 'carcass' });
    if (type === 'open') drawOpen(ctx, f, G, cell);
    else if (type === 'drawer') drawDrawers(ctx, f, G, cell);
    else if (type === 'closed' && node.interior === 'oven') drawOven(ctx, G, cell);
    else drawDoors(ctx, f, G, cell, type === 'glass');
  }

  // 柜身外轮廓
  R(0, yb, W, Hb, { stroke: INK, sw: S.main, role: 'outline' });

  // 画框框：选中的格子 / 底座条画金色粗框（画在外轮廓上面）
  if (style === 'blocks' && ctx.selected) {
    const sel = ctx.selected;
    if (sel === `${f.id}|base` && f.base.h > 0) R(0, f.y, W, f.base.h, { stroke: BLOCK_SELECTED, sw: S.main * 2.2, role: 'selected' });
    for (const lf of f.leaves) {
      if (sel === `${f.id}|${lf.path ?? ''}`) R(lf.x, yb + lf.y, lf.w, lf.h, { stroke: BLOCK_SELECTED, sw: S.main * 2.2, role: 'selected' });
    }
  }

  // 台面
  if (f.worktop) R(-f.ovhL, yt, W + f.ovhL + f.ovhR, WT_T, { fill: WORKTOP, stroke: INK, sw: S.sw, role: 'worktop' });

  // 水槽龙头 / 炉头（画在台面上）
  if (style === 'drawing') {
    const ytop = f.top;
    for (const lf of f.leaves) {
      const it = lf.node?.interior;
      if (lf.node?.type === 'void' || (it !== 'sink' && it !== 'hob')) continue;
      const cx = lf.x + lf.w / 2;
      if (it === 'sink') drawTap(ctx, G, cx, ytop);
      else drawHob(ctx, G, cx, ytop, lf.w);
    }
  }
}

// ---------- 底座 ----------
function drawBase(ctx, f, { R, L }) {
  const { S, C, style } = ctx;
  const { kind, h } = f.base;
  if (h <= 0) return;
  const W = f.W, y0 = f.y;
  if (style === 'blocks') drawBlockBase(ctx, f, { R, L });
  else drawBaseDrawing(ctx, f, { R, L });
}

// 色块样式的底座：画法同第一版，外加一条看不见的点击条（hit:'frameId|base'），柜脚之间也点得到
function drawBlockBase(ctx, f, G) {
  drawBaseDrawing(ctx, f, G);
  const { S } = ctx;
  G.R(0, f.y, f.W, f.base.h, { fill: INK, opacity: 0, role: 'base-hit', hit: `${f.id}|base` });
  if (ctx.sizes && f.base.h >= S.U * 8) {
    const t = `${Math.round(f.base.h)}`;
    ctx.out.text(f.X0 + f.W - 3 * S.U, -(f.y + f.base.h / 2), t, Math.min(S.lbl, f.base.h * 0.6), { anchor: 'end', baseline: 'central', fill: INK_SOFT, role: 'size' });
  }
}

function drawBaseDrawing(ctx, f, { R, L }) {
  const { S, C, style } = ctx;
  const { kind, h } = f.base;
  const W = f.W, y0 = f.y;
  if (kind === 'plinth') {
    const l = f.ends.left ? PANEL : 0, r = f.ends.right ? PANEL : 0;
    if (style === 'blocks') {
      R(0, y0, W, h, { fill: LINE, stroke: INK, sw: S.thin, role: 'base' });
      return;
    }
    if (l) R(0, y0, l, h, { fill: C.tint, stroke: INK, sw: S.thin, role: 'base' });
    if (r) R(W - r, y0, r, h, { fill: C.tint, stroke: INK, sw: S.thin, role: 'base' });
    R(l, y0, W - l - r, h, { fill: C.plinth, stroke: INK, sw: S.thin, role: 'base' });
    // 柜身压在退进去的踢脚上 → 顶部一条阴影
    const sh = Math.min(h * 0.22, 14);
    R(l, y0 + h - sh, W - l - r, sh, { fill: mix(C.plinth, INK, 0.45), role: 'base' });
  } else if (kind === 'legs') {
    const n = Math.max(2, Math.ceil(W / 1000) + 1);
    const lw = Math.min(LEG, W / (n * 2));
    const inset = Math.min(30, W * 0.05);
    const span = W - 2 * inset - lw;
    for (let k = 0; k < n; k++) {
      const x = inset + (span * k) / (n - 1);
      R(x, y0, lw, h, { fill: style === 'blocks' ? INK : C.leg, stroke: INK, sw: S.hair, role: 'base' });
    }
  } else if (kind === 'raised') {
    const T = Math.min(PANEL, W / 4);
    if (style === 'blocks') {
      R(0, y0, W, h, { fill: BLOCK_COLORS.raised, stroke: INK, sw: S.thin, role: 'base' });
      blockLabel(ctx, { R, X0: f.X0 }, 0, y0, W, h, TXT.raised, null);
      return;
    }
    const sideFill = (on) => (on ? C.tint : C.carcass);
    R(T, y0, W - 2 * T, h, { fill: C.recess, stroke: INK, sw: S.thin, role: 'base' });
    const sh = Math.min(h * 0.12, 18);
    R(T, y0 + h - sh, W - 2 * T, sh, { fill: mix(C.recess, INK, 0.18), role: 'base' });
    // 鞋子示意（很淡）
    const inner = W - 2 * T;
    const pairs = h >= 90 ? Math.min(10, Math.floor(inner / 320)) : 0;
    const shoeH = Math.min(h * 0.42, 90);
    const shoeFill = mix(C.recess, INK, 0.2);
    for (let k = 0; k < pairs; k++) {
      const cx = T + (inner * (k + 0.5)) / pairs;
      for (const dx of [-55, 8]) R(cx + dx, y0 + 2, 47, shoeH, { fill: shoeFill, rx: Math.min(18, shoeH / 2), role: 'base' });
    }
    R(0, y0, T, h, { fill: sideFill(f.ends.left), stroke: INK, sw: S.thin, role: 'base' });
    R(W - T, y0, T, h, { fill: sideFill(f.ends.right), stroke: INK, sw: S.thin, role: 'base' });
    L(0, y0, W, y0, { stroke: INK, sw: S.thin, role: 'base' });
  }
}

// ---------- 色块（第二版） ----------
function drawBlock(ctx, f, G, cell) {
  const { S } = ctx;
  const fill = BLOCK_COLORS[cell.type] || BLOCK_COLORS.closed;
  G.R(cell.x, cell.y, cell.w, cell.h, { fill, stroke: INK, sw: S.thin, role: 'block', hit: cell.hit });
  const n = cell.type === 'drawer' ? drawerCount(cell) : 0;
  const ser = cell.node?.series;
  const tag = ser && (ser.door || ser.carcass) ? [ser.door, ser.carcass].filter(Boolean).join('/') : null;
  const size = ctx.sizes ? `${Math.round(cell.w)}×${Math.round(cell.h)}` : null;
  blockLabel(ctx, G, cell.x, cell.y, cell.w, cell.h, TXT.blocks[cell.type], [n > 0 ? `×${n}` : null, tag].filter(Boolean).join(' ') || null, size);
}

function blockLabel(ctx, G, x, y, w, h, t, suffix, extra) {
  const { lang, S } = ctx;
  const lines = (lang === 'both' ? [t.zh, t.en] : [lang === 'en' ? t.en : t.zh]).map((s, i) => (i === 0 && suffix ? `${s} ${suffix}` : s));
  if (extra) lines.push(extra);
  cellLabel(ctx, G, x, y, w, h, lines, S.lbl, INK, 'label');
}

// 格子正中的小字，放不下就缩小，太小就不画
function cellLabel(ctx, { X0 }, x, y, w, h, lines, size0, fill, role) {
  const { out, S } = ctx;
  let ls = lines.filter(Boolean);
  const fit = (arr) => {
    const em = Math.max(...arr.map((s) => textEm(s)));
    return Math.min(size0, (w * 0.86) / em, (h * 0.8) / (arr.length * 1.25));
  };
  let size = fit(ls);
  if (size < S.U * 3 && ls.length > 1) { ls = [ls[0]]; size = fit(ls); }
  if (size < S.U * 3) return;
  const cx = X0 + x + w / 2, cy = -(y + h / 2);
  const lh = size * 1.25;
  ls.forEach((s, i) => {
    const sz = i === 0 ? size : size * 0.86;
    out.text(cx, cy + (i - (ls.length - 1) / 2) * lh, s, sz, { anchor: 'middle', baseline: 'central', fill, role });
  });
}

// ---------- 空位（电器位） ----------
function drawVoid(ctx, f, G, cell) {
  const { S, lang } = ctx;
  G.R(cell.fx, cell.fy, cell.fw, cell.fh, { stroke: INK_SOFT, sw: S.thin, dash: S.dashVoid, role: 'void' });
  const t = TXT[cell.node?.interior === 'hood' || cell.node?.interior === 'fridge' ? cell.node.interior : 'appliance'];
  const one = [pick(t, lang)];
  const em = textEm(one[0]);
  const lines = lang === 'both' && em * S.lbl > cell.fw * 0.86 ? pickLines(t, lang) : one;
  cellLabel(ctx, G, cell.fx, cell.fy, cell.fw, cell.fh, lines, S.lbl, INK_SOFT, 'label');
}

// ---------- 开放格 ----------
function drawOpen(ctx, f, { R, L, P }, cell) {
  const { S, C } = ctx;
  const { e } = cell;
  const x0 = cell.x + (e.l ? PANEL : PANEL / 2), x1 = cell.x + cell.w - (e.r ? PANEL : PANEL / 2);
  const y0 = cell.y + (e.b ? PANEL : PANEL / 2), y1 = cell.y + cell.h - (e.t ? PANEL : PANEL / 2);
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  R(x0, y0, w, h, { fill: C.recess, stroke: INK, sw: S.thin, role: 'open' });
  const sh = Math.min(h * 0.06, 36);
  R(x0, y1 - sh, w, sh, { fill: mix(C.recess, INK, 0.12), role: 'open' });
  const it = cell.node.interior;
  const shelf = (y) => {
    R(x0, y - PANEL / 2, w, PANEL, { fill: C.carcass, stroke: INK, sw: S.hair, role: 'shelf' });
    R(x0, y - PANEL / 2 - Math.min(12, h * 0.02), w, Math.min(12, h * 0.02), { fill: mix(C.recess, INK, 0.08), role: 'shelf' });
  };
  if (it === 'rod' || it === 'rodShelves') {
    const yB = it === 'rodShelves' ? y0 + h * 0.45 : y0;
    if (it === 'rodShelves') { shelf(yB); shelvesIn(y0, yB).forEach(shelf); }
    drawRod(ctx, { L, P }, x0, x1, Math.max(yB + 100, y1 - ROD_DROP), y1 - yB, INK_SOFT, false);
  } else if (it !== 'top' && it !== 'sink' && it !== 'hob') {
    shelvesIn(y0, y1).forEach(shelf);
  }
}

const shelvesIn = (a, b) => {
  const h = b - a;
  if (h < 260) return [];
  const n = Math.max(1, Math.round(h / SHELF_PITCH));
  return Array.from({ length: n - 1 }, (_, k) => a + (h * (k + 1)) / n);
};

// 挂衣杆 + 几个衣架
function drawRod(ctx, { L, P }, x0, x1, yr, room, color, dashed) {
  const { S } = ctx;
  const o = { stroke: color, sw: dashed ? S.hair : S.thin, role: 'interior', ...(dashed ? { dash: S.dashHint } : {}) };
  L(x0 + 15, yr, x1 - 15, yr, { ...o, sw: dashed ? S.thin : S.sw });
  const w = x1 - x0;
  if (room < 300 || w < 150) return;
  const n = clamp(Math.round(w / 170), 2, 7);
  const sp = w / n;
  const hw = Math.min(sp * 0.36, 190), th = Math.max(22, hw * 0.42), neck = 30;
  for (let k = 0; k < n; k++) {
    const cx = x0 + sp * (k + 0.5);
    P([['M', cx, yr - neck], ['L', cx, yr], ['Q', cx, yr + 22, cx + 14, yr + 16]], { ...o, fill: 'none' });
    P([['M', cx, yr - neck], ['L', cx - hw, yr - neck - th], ['L', cx + hw, yr - neck - th], ['Z']], { ...o, fill: 'none' });
  }
}

// ---------- 门（封闭 / 玻璃） ----------
function drawDoors(ctx, f, G, cell, glass) {
  const { S, C } = ctx;
  const { R, L } = G;
  const { fx, fy, fw, fh } = cell;
  if (fw <= 0 || fh <= 0) return;
  const n = cell.w > MAX_DOOR ? Math.ceil(cell.w / MAX_DOOR) : 1;
  const dw = (fw - (n - 1) * GAP) / n;
  const it = cell.node.interior;
  const shelfYs = glass ? glassShelves(cell, it) : [];
  for (let i = 0; i < n; i++) {
    const dx = fx + i * (dw + GAP);
    const hingeLeft = n > 1 && i < Math.floor(n / 2) ? true
      : n > 1 && i >= Math.ceil(n / 2) ? false
        : dx + dw / 2 <= f.W / 2;
    R(dx, fy, dw, fh, { fill: C.tint, stroke: INK, sw: S.sw, role: 'door' });
    let swingC = C.swing;
    if (glass) {
      const s = Math.min(STILE, dw * 0.14, fh * 0.14);
      const px = dx + s, py = fy + s, pw = dw - 2 * s, ph = fh - 2 * s;
      R(px, py, pw, ph, { fill: GLASS, stroke: INK, sw: S.thin, role: 'glass' });
      for (const y of shelfYs) if (y > py + 10 && y < py + ph - 10) L(px, y, px + pw, y, { stroke: mix(INK, GLASS, 0.55), sw: S.thin, role: 'shelf' });
      // 两道反光
      const l = Math.min(pw, ph) * 0.28, ax = px + pw * 0.12, ay = py + ph - ph * 0.08;
      L(ax, ay - l, ax + l, ay, { stroke: '#FFFFFF', sw: S.sw * 1.2, role: 'glass' });
      L(ax + pw * 0.12, ay - l * 0.7, ax + pw * 0.12 + l * 0.6, ay - l * 0.1, { stroke: '#FFFFFF', sw: S.sw * 1.2, role: 'glass' });
      swingC = mix(INK, GLASS, 0.45);
    }
    // 开门方向：V 字尖头指向铰链边
    const ix = Math.min(dw * 0.05, 25), iy = Math.min(fh * 0.04, 30);
    const xh = hingeLeft ? dx + ix : dx + dw - ix, xo = hingeLeft ? dx + dw - ix : dx + ix;
    const ym = fy + fh / 2;
    L(xo, fy + fh - iy, xh, ym, { stroke: swingC, sw: S.hair, dash: S.dashSwing, role: 'swing' });
    L(xo, fy + iy, xh, ym, { stroke: swingC, sw: S.hair, dash: S.dashSwing, role: 'swing' });
    doorHandle(ctx, G, dx, fy, dw, fh, hingeLeft);
  }
  if (!glass) closedHints(ctx, f, G, cell);
}

function glassShelves(cell, it) {
  if (it && it !== 'shelves') return [];
  return shelvesIn(cell.y, cell.y + cell.h);
}

// 门后内部示意（淡、虚线）
function closedHints(ctx, f, G, cell) {
  const { S, C } = ctx;
  const { R, L } = G;
  const it = cell.node.interior;
  const x0 = cell.x + PANEL, x1 = cell.x + cell.w - PANEL;
  const y0 = cell.y + PANEL, y1 = cell.y + cell.h - PANEL;
  const w = x1 - x0, h = y1 - y0;
  if (w <= 40 || h <= 40) return;
  const o = { stroke: C.hint, sw: S.hair, dash: S.dashHint, role: 'interior' };
  const shelf = (y) => L(x0, y, x1, y, o);
  if (it === 'rod') drawRod(ctx, G, x0, x1, y1 - ROD_DROP, h, C.hint, true);
  else if (it === 'rodShelves') {
    const yB = y0 + h * 0.45;
    shelf(yB);
    shelvesIn(y0, yB).forEach(shelf);
    drawRod(ctx, G, x0, x1, Math.max(yB + 100, y1 - ROD_DROP), y1 - yB, C.hint, true);
  } else if (it === 'shelves') shelvesIn(y0, y1).forEach(shelf);
  else if (it === 'drawers') {
    // 内抽（门后）
    const n = Math.min(3, Math.floor((h * 0.45) / 180)); // 放不下一个就不画（以前矮格会画出格外）
    for (let k = 0; k < n; k++) R(x0 + 20, y0 + 10 + k * 190, w - 40, 170, { ...o, fill: 'none' });
  } else if (it === 'sink') {
    const bw = Math.min(w * 0.78, 800), bh = Math.min(190, h * 0.4);
    const top = cell.y + cell.h - 6;
    R(cell.x + (cell.w - bw) / 2, top - bh, bw, bh, { ...o, fill: 'none', rx: Math.min(40, bh * 0.3) });
    const cx = cell.x + cell.w / 2;
    if (h > bh + 160) {
      L(cx, top - bh, cx, top - bh - 70, o);
      G.P([['M', cx, top - bh - 70], ['Q', cx, top - bh - 130, cx + 50, top - bh - 130], ['Q', cx + 100, top - bh - 130, cx + 100, top - bh - 70]], { ...o, fill: 'none' });
    }
  }
}

// ---------- 烤箱位（同 3D：深色玻璃门 + 横拉手，代替柜门） ----------
function drawOven(ctx, { R }, cell) {
  const { S } = ctx;
  const { fx, fy, fw, fh } = cell;
  if (fw <= 0 || fh <= 0) return;
  R(fx, fy, fw, fh, { fill: OVEN_GLASS, stroke: INK, sw: S.sw, role: 'fixture' });
  const ctl = Math.min(90, fh * 0.18);
  const m = Math.min(40, fw * 0.08, fh * 0.08);
  R(fx + m, fy + m, fw - 2 * m, fh - ctl - 30 - m, { fill: OVEN_WINDOW, stroke: STEEL_DARK, sw: S.hair, role: 'fixture' });
  const len = Math.max(Math.min(40, fw * 0.5), fw - 140);
  const bh = Math.max(12, 1.1 * S.U);
  R(fx + (fw - len) / 2, fy + fh - ctl - 18 - bh / 2, len, bh, { fill: STEEL_DARK, rx: bh / 2, role: 'fixture' });
}

// ---------- 抽屉 ----------
const drawerCount = (cell) => clamp(Math.round(num(cell.node.drawers, Math.max(1, Math.round(cell.h / 250)))), 1, 12);

function drawDrawers(ctx, f, G, cell) {
  const { S, C } = ctx;
  const { fx, fy, fw, fh } = cell;
  if (fw <= 0 || fh <= 0) return;
  const n = drawerCount(cell);
  const dh = (fh - (n - 1) * GAP) / n;
  if (dh <= 0) return;
  for (let k = 0; k < n; k++) {
    const y = fy + k * (dh + GAP);
    G.R(fx, y, fw, dh, { fill: C.tint, stroke: INK, sw: S.sw, role: 'drawer' });
    drawerHandle(ctx, G, fx, y, fw, dh);
  }
}

// ---------- 拉手 ----------
function doorHandle(ctx, { R, L, Ci }, dx, dy, dw, dh, hingeLeft) {
  const { handle, S, C } = ctx;
  if (handle === 'push') return;
  const top = dy + dh, bottom = dy;
  if (handle === 'hidden') {
    // 隐藏拉手：开口边一条细阴影（矮柜在上沿，吊柜 / 顶柜在下沿）
    const y = top <= 1300 || bottom < 1300 ? top - Math.min(14, dh * 0.04) : bottom + Math.min(14, dh * 0.04);
    L(dx + dw * 0.04, y, dx + dw * 0.96, y, { stroke: C.shadow, sw: S.thin, role: 'handle' });
    return;
  }
  const inset = Math.min(45, dw * 0.15);
  const hx = hingeLeft ? dx + dw - inset : dx + inset;
  const len = clamp(dh * 0.22, Math.min(90, dh * 0.5), 300);
  const margin = Math.min(60, dh * 0.12);
  let cy;
  if (top <= 1300) cy = top - margin - len / 2;
  else if (bottom >= 1300) cy = bottom + margin + len / 2;
  else cy = clamp(1050, bottom + margin + len / 2, top - margin - len / 2);
  if (handle === 'bar') {
    const bw = Math.max(12, 1.1 * S.U);
    R(hx - bw / 2, cy - len / 2, bw, len, { fill: INK, rx: bw / 2, role: 'handle' });
  } else {
    const r = Math.max(14, 1.3 * S.U);
    const kcy = top <= 1300 ? top - margin - r : bottom >= 1300 ? bottom + margin + r : cy;
    Ci(hx, kcy, r, { fill: INK, role: 'handle' });
  }
}

function drawerHandle(ctx, { R, L, Ci }, x, y, w, h) {
  const { handle, S, C } = ctx;
  if (handle === 'push') return;
  if (handle === 'hidden') {
    const yy = y + h - Math.min(14, h * 0.08);
    L(x + w * 0.04, yy, x + w * 0.96, yy, { stroke: C.shadow, sw: S.thin, role: 'handle' });
    return;
  }
  const cy = h <= 260 ? y + h / 2 : y + h - 70;
  if (handle === 'bar') {
    const bh = Math.max(12, 1.1 * S.U), len = clamp(w * 0.4, Math.min(90, w * 0.6), 400);
    R(x + (w - len) / 2, cy - bh / 2, len, bh, { fill: INK, rx: bh / 2, role: 'handle' });
  } else Ci(x + w / 2, cy, Math.max(14, 1.3 * S.U), { fill: INK, role: 'handle' });
}

// ---------- 台面上的龙头 / 炉头 ----------
function drawTap(ctx, { R, P }, cx, y) {
  const { S } = ctx;
  R(cx - 28, y, 56, 16, { fill: INK_SOFT, role: 'fixture' });
  P([['M', cx, y + 16], ['L', cx, y + 220], ['Q', cx, y + TAP_H, cx + 70, y + TAP_H], ['Q', cx + 140, y + TAP_H, cx + 140, y + 215], ['L', cx + 140, y + 195]],
    { stroke: INK_SOFT, sw: Math.max(1.5 * S.U, 18), fill: 'none', role: 'fixture' });
  P([['M', cx - 8, y + 150], ['L', cx - 60, y + 175]], { stroke: INK_SOFT, sw: Math.max(1.1 * S.U, 12), fill: 'none', role: 'fixture' });
}

function drawHob(ctx, { R, X0 }, cx, y, w) {
  const { out, S } = ctx;
  const pw = Math.min(w * 0.82, 620);
  R(cx - pw / 2, y, pw, 10, { fill: INK, stroke: INK, sw: S.hair, role: 'fixture' });
  for (const k of [-1, 1]) {
    const bx = cx + (k * pw) / 4, bw = Math.min(150, pw * 0.3);
    out.poly([[X0 + bx - bw / 2, -(y + 10)], [X0 + bx - bw * 0.32, -(y + HOB_H)], [X0 + bx + bw * 0.32, -(y + HOB_H)], [X0 + bx + bw / 2, -(y + 10)]],
      { fill: INK_SOFT, stroke: INK, sw: S.hair, role: 'fixture' });
  }
}

// ============================================================
// 尺寸线
// ============================================================
function placeDims(ctx, frames) {
  const { out, S } = ctx;
  const U = S.U;
  // 已占用的区域：{ b: 外框, geo: 是不是柜体 / 龙头炉头（不是尺寸线）, own: 属于哪个柜体 }
  const occ = [];
  const geoBox = (b, own) => occ.push({ b, geo: true, own });
  for (const f of frames) {
    if (f.W <= 0 || f.H <= 0) continue;
    geoBox([f.X0 - f.ovhL, -f.top, f.X0 + f.W + f.ovhR, -f.y], f);
    if (ctx.style !== 'drawing') continue;
    for (const lf of f.leaves) {
      const it = lf.node?.interior, cx = f.X0 + lf.x + lf.w / 2;
      if (lf.node?.type === 'void') continue;
      if (it === 'sink') geoBox([cx - 70, -(f.top + TAP_H), cx + 160, -f.top], f);
      else if (it === 'hob') geoBox([cx - lf.w * 0.42, -(f.top + HOB_H), cx + lf.w * 0.42, -f.top], f);
    }
  }
  const pad = 2.5 * U;
  const tk = 1.8 * U;
  const D = { stroke: ctx.C.dim, sw: S.hair * 1.2, role: 'dim' };
  const T = S.dimTxt;

  // 候选位置：boxes = 尺寸线 + 字的外框（不能压任何东西）；geo = 引出线经过的走廊（不能穿过别的柜体）
  const clearOf = (c, p) => c.boxes.every((b) => !occ.some((o) => hits(b, o.b, p)))
    && (c.geo || []).every((g) => !occ.some((o) => o.geo && o.own !== c.own && hits(g, o.b, 0)));
  // 选第一个不撞的；再退一步只要不实际重叠（不留间距）；都不行：fallback 时用第一个，否则不画（返回 false）
  const choose = (cands, fallback = true) => {
    const c = cands.find((x) => clearOf(x, pad)) || cands.find((x) => clearOf(x, 0)) || (fallback ? cands[0] : null);
    if (!c) return false;
    for (const b of c.boxes) occ.push({ b, geo: false, own: null });
    c.draw();
    return true;
  };

  // 横向尺寸链：xs = 分界点，yl = 尺寸线，edge = 被量物体那条边（引出线从这里出）
  const hChain = (xs, labels, yl, edge) => {
    const down = edge < yl; // 尺寸线在物体下方
    const sizes = labels.map((s, i) => Math.max(T * 0.55, Math.min(T, (xs[i + 1] - xs[i] - 1.5 * U) / textEm(s))));
    const tb = yl - 2.2 * U - 0.8 * Math.max(...sizes);
    // 横向两头收进来一点：同一高度上首尾相接的两条尺寸链不算相撞
    const box = [xs[0] + pad + U, Math.min(tb, yl - tk), xs[xs.length - 1] - pad - U, yl + tk];
    return {
      boxes: [box],
      draw: () => {
        out.line(xs[0] - 2 * U, yl, xs[xs.length - 1] + 2 * U, yl, D);
        for (const x of xs) {
          out.line(x, down ? edge + 2 * U : edge - 2 * U, x, down ? yl + 2 * U : yl - 2 * U, { ...D, sw: S.hair });
          out.line(x - tk, yl + tk, x + tk, yl - tk, { ...D, sw: S.sw });
        }
        labels.forEach((s, i) => out.text((xs[i] + xs[i + 1]) / 2, yl - 2.2 * U, s, sizes[i], { anchor: 'middle', fill: ctx.C.dim, role: 'dim' }));
      },
    };
  };

  // 竖向尺寸链：ys = 分界点（SVG y，上→下），side = 1 右 / −1 左；文字转 90° 放在外侧
  const vChain = (ys, labels, xl, edgeX, side, own) => {
    const sizes = labels.map((s, i) => Math.max(T * 0.55, Math.min(T, (ys[i + 1] - ys[i] - 1.5 * U) / textEm(s))));
    const y1 = ys[0], y2 = ys[ys.length - 1];
    const outer = xl + side * (2.2 * U + Math.max(...sizes));
    const box = side > 0 ? [xl - tk, y1 + pad + U, outer, y2 - pad - U] : [outer, y1 + pad + U, xl + tk, y2 - pad - U];
    const lane = side > 0 ? [edgeX + U, y1 + pad + U, xl, y2 - pad - U] : [xl, y1 + pad + U, edgeX - U, y2 - pad - U];
    return {
      boxes: [box],
      geo: [lane],
      own,
      draw: () => {
        out.line(xl, y1 - 2 * U, xl, y2 + 2 * U, D);
        for (const y of ys) {
          out.line(edgeX + side * 2 * U, y, xl + side * 2 * U, y, { ...D, sw: S.hair });
          out.line(xl - tk, y + tk, xl + tk, y - tk, { ...D, sw: S.sw });
        }
        labels.forEach((s, i) => out.text(xl + side * (2.2 * U + 0.5 * sizes[i]), (ys[i] + ys[i + 1]) / 2, s, sizes[i],
          { anchor: 'middle', baseline: 'central', rotate: -90, fill: ctx.C.dim, role: 'dim' }));
      },
    };
  };
  const vDim = (y1, y2, xl, edgeX, label, side, own) => vChain([y1, y2], [label], xl, edgeX, side, own);

  const below = (f) => frames.some((g) => g !== f && g.wall === f.wall && g.y + g.H <= f.y + 1
    && g.X0 - g.ovhL < f.X0 + f.W && g.X0 + g.W + g.ovhR > f.X0);
  const chainY = (edge, k) => edge + 7 * U + 0.8 * T + k * (T + 9 * U);
  const step = T + 9 * U;

  // 1) 每列宽（多于一列才标）
  for (const f of frames) {
    if (f.cols.length < 2 || f.W <= 0) continue;
    const xs = [f.X0];
    f.cols.forEach((s) => xs.push(xs[xs.length - 1] + s));
    const labels = f.cols.map((s) => String(Math.round(s)));
    const cands = [];
    const gap = () => cands.push(hChain(xs, labels, chainY(-f.y, 0), -f.y));
    const over = () => cands.push(hChain(xs, labels, -f.top - 7 * U, -f.top));
    // 吊柜下面有地柜：先放两柜之间，放不下就放吊柜上方；落地柜 / 下面空着：沿地面
    if (f.y > 0 && below(f)) { gap(); over(); }
    for (let k = 0; k < 3; k++) cands.push(hChain(xs, labels, chainY(0, k), 0));
    if (f.y > 0 && !below(f)) gap();
    choose(cands);
  }

  // 2) 总宽（柜顶上方；上面紧贴着吊柜的地柜 → 放到地面尺寸链下面一层）
  const capped = (f) => frames.some((g) => g !== f && g.wall === f.wall && g.y >= f.top - 1 && g.y - f.top < 1000
    && g.X0 < f.X0 + f.W && g.X0 + g.W > f.X0);
  for (const f of frames) {
    if (f.W <= 0) continue;
    const xs = [f.X0, f.X0 + f.W];
    const label = [String(Math.round(f.W))];
    const edge = -f.top;
    const above = [0, 1, 2].map((k) => hChain(xs, label, edge - 7 * U - k * step, edge));
    const floor = f.y > 0 && below(f) ? [] : [0, 1, 2, 3].map((k) => hChain(xs, label, chainY(0, k), 0));
    choose(capped(f) ? [...floor, ...above] : [...above, ...floor]);
  }

  // 3) 总高（右边；挡住就放左边）。两边都被别的柜体挡住（例如电视柜夹在两个高柜中间）→
  //    不压在别的柜子上画，改到这面墙最外侧的一条竖向尺寸链里（0 → 离地 → 柜高 …）
  const deferred = new Map();
  const wallEdge = (w, side) => {
    const fs = frames.filter((g) => g.wall === w && g.W > 0 && g.H > 0);
    return side > 0 ? Math.max(...fs.map((g) => g.X0 + g.W + g.ovhR)) : Math.min(...fs.map((g) => g.X0 - g.ovhL));
  };
  for (const f of frames) {
    if (f.H <= 0 || f.W <= 0) continue;
    const y1 = -(f.y + f.H), y2 = -f.y;
    const label = String(Math.round(f.H));
    const right = f.X0 + f.W + f.ovhR, left = f.X0 - f.ovhL;
    const cands = [];
    for (let k = 0; k < 3; k++) {
      cands.push(vDim(y1, y2, right + 7 * U + k * step, right, label, 1, f));
      cands.push(vDim(y1, y2, left - 7 * U - k * step, left, label, -1, f));
    }
    if (choose(cands, false)) continue;
    const mid = (wallEdge(f.wall, -1) + wallEdge(f.wall, 1)) / 2;
    const key = `${f.wall}:${f.X0 + f.W / 2 < mid ? -1 : 1}`;
    if (!deferred.has(key)) deferred.set(key, []);
    deferred.get(key).push(f);
  }
  const chained = new Set();
  for (const [key, fs] of deferred) {
    const [w, sd] = key.split(':').map(Number);
    const vals = [...new Set([0, ...fs.flatMap((f) => [f.y, f.y + f.H])].map((v) => rnd(v)))].sort((a, b) => b - a);
    if (vals.length < 2) continue;
    const ys = vals.map((v) => -v);
    const labels = ys.slice(1).map((y, i) => String(Math.round(y - ys[i])));
    const edgeX = wallEdge(w, sd);
    const cands = [0, 1, 2, 3, 4].map((k) => vChain(ys, labels, edgeX + sd * (7 * U + k * step), edgeX, sd, null));
    if (choose(cands, false)) fs.forEach((f) => chained.add(f));
  }

  // 4) 吊挂高度 ↑1500（离地）
  for (const f of frames) {
    if (!(f.y > 0) || f.W <= 0) continue;
    const label = `↑${Math.round(f.y)}`;
    const ty = f.y < T * 1.2 ? -f.y - 0.8 * T : -f.y / 2;
    const free = !below(f);
    const mount = (xl, side, ext) => {
      const txt = { text: label, size: T, x: xl + side * 2.2 * U, y: ty, anchor: side > 0 ? 'start' : 'end', baseline: 'central' };
      const edgeX = f.X0 - f.ovhL;
      return {
        boxes: [[xl - tk, -f.y + pad + U, xl + tk, -pad - U], textBox(txt)],
        geo: ext ? [[xl, -f.y - 0.5 * U, edgeX - U, -f.y + 0.5 * U]] : [],
        own: f,
        draw: () => {
          out.line(xl, 0, xl, -f.y - (ext ? 2 * U : 0), D);
          if (ext) out.line(edgeX - 2 * U, -f.y, xl - 2 * U, -f.y, { ...D, sw: S.hair });
          for (const y of [0, -f.y]) out.line(xl - tk, y + tk, xl + tk, y - tk, { ...D, sw: S.sw });
          out.text(txt.x, txt.y, label, T, { anchor: txt.anchor, baseline: 'central', fill: ctx.C.dim, role: 'dim' });
        },
      };
    };
    const cands = [];
    if (free) cands.push(mount(f.X0 + Math.min(10 * U, f.W * 0.1), 1, false));
    for (let k = 0; k < 2; k++) cands.push(mount(f.X0 - f.ovhL - 7 * U - k * step, -1, true));
    if (choose(cands, false) || chained.has(f)) continue; // 已经在竖向尺寸链里：不再另写
    // 都挡住：只写字，找柜体旁边一个空位（左下角外 / 正下方外…），都不行就不写（不压在别的东西上）
    const xL = f.X0 - f.ovhL - 2.5 * U, xR = f.X0 + f.W + f.ovhR + 2.5 * U;
    const spots = [[xL, -f.y, 'end'], [xL, -f.y + 0.75 * T, 'end'], [xR, -f.y, 'start'], [xR, -f.y + 0.75 * T, 'start']].map(([x, y, anchor]) => {
      const txt = { text: label, size: T, x, y, anchor, baseline: 'central' };
      return { boxes: [textBox(txt)], draw: () => out.text(x, y, label, T, { anchor, baseline: 'central', fill: ctx.C.dim, role: 'dim' }) };
    });
    choose(spots, false);
  }
}
