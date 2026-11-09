// ============================================================
// 轻量立体图（SVG 轴测，不用 WebGL / three.js）
// ------------------------------------------------------------
// 两步：
//   cabinetBoxes(cab)  柜子 → 世界坐标里的一堆长方体（mm）
//   axoScene(cab, {yaw}) 长方体 → 正交投影 → 只画朝向观众的面（背面剔除）
//                        → 按前后关系排序（画家算法）→ { viewBox, shapes }（交给 SvgShapes.jsx 画）
//
// 世界坐标：x 向右、y 向上、z 朝观众（俯视：后墙在 z = 0）。
// 摆放：walls = opts.walls || cabinetWalls(cab)；柜体 frame 在 frame.wall 那面墙上，
//   本地 (u 沿墙从 frame.x 起, v 离地, w 离墙朝外 0…D) → world = (ox,0,oz) + R(angle)·(u, v, w)
//   R(0): u→+x, w→+z；R(90): u→+z, w→−x；R(180): u→−x, w→−z；R(270): u→−z, w→+x（角度取最近的 90°）。
// 视角：yaw < 0 = 人站在左前方（看到左侧板、L 型右墙的柜门）；yaw > 0 = 站在右前方。限制 ±45°。
//       pitch 22° 往下看（看得到台面 / 柜顶）。
// 柜内（挂衣杆、层板、水槽、炉头）只是示意（仅示意），画得很淡。
// 纯 JS：不用 React / DOM；同样输入 → 同样输出。
// ============================================================
import { layoutLeaves } from '../planner/model.js';
import { cabinetWalls } from '../planner/templates.js';
import { finishOf, DEFAULT_DOOR_FINISH, DEFAULT_CARCASS_FINISH, INK, GLASS, WORKTOP, WALL, FLOOR, LINE } from './palette.js';

export const AXO_DEFAULT_YAW = -30;
export const AXO_YAW_LIMIT = 45;
export const AXO_PITCH = 22;

const T = 18;          // 板厚
const GAP = 3;         // 门缝（门与门之间、四周）
const BACK = 9;        // 背板厚
const RECESS = 50;     // 踢脚内缩
const WT_H = 30;       // 台面厚
const WT_OVER = 20;    // 台面前挑
const MAX_LEAF = 600;  // 每扇门最宽（同 model.MAX_DOOR）
const GLASS_OPACITY = 0.45;
const GHOST_OPACITY = 0.22; // 背对观众的柜子（只显示轮廓感）

const STEEL = '#C9CDCC';
const STEEL_DARK = '#A9AFAE';
const DRAIN = '#7E8584';
const HOB_GLASS = '#2B2C2B';
const BURNER = '#8D908C';
const OVEN_GLASS = '#3A3B3A';
const ROD = '#A3A8A7';

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r2 = (v) => { const n = Math.round(v * 100) / 100; return n === 0 ? 0 : n; }; // 不要 -0
const nz = (v) => (v === 0 ? 0 : v);

// ---------------- 颜色 ----------------
function hexRgb(hex) {
  let h = String(hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (!/^[0-9a-fA-F]{6}/.test(h) || !Number.isFinite(n)) return [136, 136, 136];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbHex = (c) => `#${c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
// f < 1 变暗；f > 1 往白色提亮
export function shade(hex, f) {
  const c = hexRgb(hex);
  if (f <= 1) return rgbHex(c.map((v) => v * Math.max(0, f)));
  const k = clamp((f - 1) * 1.6, 0, 1);
  return rgbHex(c.map((v) => v + (255 - v) * k));
}
const mix = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return rgbHex(x.map((v, i) => v + (y[i] - v) * t)); };
const luminance = (hex) => { const [r, g, b] = hexRgb(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };

function colorsOf(cab) {
  const door = finishOf(cab?.finish?.door ?? DEFAULT_DOOR_FINISH).hex;
  const carcass = finishOf(cab?.finish?.carcass ?? DEFAULT_CARCASS_FINISH, 'white').hex;
  return {
    door, carcass,
    side: shade(carcass, 0.94),            // 开放格侧板 / 顶底板（略暗）
    back: shade(carcass, 0.86),            // 开放格背板（更暗，像阴影）
    plinth: shade(mix(carcass, INK, 0.25), 0.9),
    leg: '#4A4B48',
    handle: luminance(door) < 0.42 ? '#D3D1CA' : '#3A3C3A',
  };
}

// ---------------- 墙 → 世界 ----------------
// R(angle)：u（沿墙）和 w（离墙朝外）在俯视平面 (x, z) 里的方向；角度取最近的 90°
const AXES = [
  { ux: 1, uz: 0, wx: 0, wz: 1 },   // 0
  { ux: 0, uz: 1, wx: -1, wz: 0 },  // 90
  { ux: -1, uz: 0, wx: 0, wz: -1 }, // 180
  { ux: 0, uz: -1, wx: 1, wz: 0 },  // 270
];
export function wallAxes(angle) {
  const q = (((Math.round(num(angle) / 90)) % 4) + 4) % 4;
  return AXES[q];
}
// 本地 (u, v, w) → 世界 [x, y, z]
export function wallToWorld(wall, u, v, w) {
  const a = wallAxes(wall?.angle);
  return [nz(num(wall?.ox) + a.ux * u + a.wx * w), nz(v), nz(num(wall?.oz) + a.uz * u + a.wz * w)];
}
// 本地长方体 [u0,u1]×[v0,v1]×[w0,w1] → 世界 { x, y, z, w, h, d }（转 90° 的倍数，仍然轴对齐）
export function localBoxToWorld(wall, u0, u1, v0, v1, w0, w1) {
  const p = wallToWorld(wall, u0, v0, w0), q = wallToWorld(wall, u1, v1, w1);
  return {
    x: nz(Math.min(p[0], q[0])), y: nz(Math.min(p[1], q[1])), z: nz(Math.min(p[2], q[2])),
    w: Math.abs(q[0] - p[0]), h: Math.abs(q[1] - p[1]), d: Math.abs(q[2] - p[2]),
  };
}
const localNormal = (wall, axis, sign) => {
  const a = wallAxes(wall?.angle);
  if (axis === 'v') return [0, sign, 0];
  if (axis === 'u') return [nz(a.ux * sign), 0, nz(a.uz * sign)];
  return [nz(a.wx * sign), 0, nz(a.wz * sign)];
};

function safeWalls(cab, opts) {
  let walls = opts?.walls;
  if (!Array.isArray(walls) || !walls.length) {
    try { walls = cabinetWalls(cab); } catch { walls = null; }
  }
  if (!Array.isArray(walls) || !walls.length) walls = [{ ox: 0, oz: 0, angle: 0, len: 0 }];
  return walls.map((w) => ({ ox: num(w?.ox), oz: num(w?.oz), angle: num(w?.angle), len: Math.max(0, num(w?.len)) }));
}
const wallOf = (walls, f) => {
  const i = Number.isInteger(f?.wall) && walls[f.wall] ? f.wall : 0;
  return { wall: walls[i], wallIndex: i };
};

// ---------------- 一个柜体 → 本地长方体 ----------------
// 门铰链（同立面图 elevation.js drawDoors）：一格多扇 → 左半边铰左、右半边铰右；
// 单扇 / 正中那扇 → 铰在远离柜体中心那一边（正中算左）。返回「开门那一边」（拉手在这边）。
function openSide(i, n, doorCenter, frameCenter) {
  const hingeLeft = n > 1 && i < Math.floor(n / 2) ? true
    : n > 1 && i >= Math.ceil(n / 2) ? false
      : doorCenter <= frameCenter + 0.5;
  return hingeLeft ? 'right' : 'left';
}
// 拉手高度：吊柜靠下、地柜靠上、高柜约 1050 离地（夹在门内）
function handleV(kind, v0, v1, hh) {
  const lo = v0 + 45 + hh / 2, hi = v1 - 45 - hh / 2;
  if (hi <= lo) return (v0 + v1) / 2;
  if (kind === 'wall') return lo;
  if (kind === 'base') return hi;
  return clamp(1050, lo, hi);
}

const circleUW = (cu, cw, r, v, n = 28) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2;
  return [cu + Math.cos(a) * r, v, cw + Math.sin(a) * r];
});
function roundRectUW(u0, u1, w0, w1, r, v, seg = 5) {
  const rr = Math.max(0, Math.min(r, (u1 - u0) / 2, (w1 - w0) / 2));
  const pts = [];
  const corner = (cu, cw, a0) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cu + Math.cos(a) * rr, v, cw + Math.sin(a) * rr]);
    }
  };
  corner(u1 - rr, w1 - rr, 0);
  corner(u0 + rr, w1 - rr, Math.PI / 2);
  corner(u0 + rr, w0 + rr, Math.PI);
  corner(u1 - rr, w0 + rr, Math.PI * 1.5);
  return pts;
}

// 柜身横向哪些段不是「整列空位」→ [[a, b], …]（柜身坐标，已合并）
function solidRuns(leaves, W) {
  if (!leaves.length) return [[0, W]];
  const xs = [...new Set([0, W, ...leaves.flatMap((l) => [l.x, l.x + l.w])])].filter((v) => v >= 0 && v <= W).sort((a, b) => a - b);
  const runs = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i + 1];
    if (b - a <= 1e-6) continue;
    const cover = leaves.filter((l) => l.x <= a + 1e-6 && l.x + l.w >= b - 1e-6 && l.h > 0);
    const allVoid = cover.length > 0 && cover.every((l) => l.node?.type === 'void');
    if (allVoid) continue;
    const last = runs[runs.length - 1];
    if (last && Math.abs(last[1] - a) < 1e-6) last[1] = b; else runs.push([a, b]);
  }
  return runs;
}

// 见光板：frame.ends 标了、且 cab.exposed 没关掉（同计价 bridge.js：'start' / 'end' = 整排起点 / 终点 → exposed.left / right）
function endsOf(f, ex) {
  const on = (side) => {
    const flag = f?.ends?.[side];
    if (!flag) return false;
    const k = flag === 'start' ? 'left' : flag === 'end' ? 'right' : side;
    return ex?.[k] !== false;
  };
  return { left: on('left'), right: on('right') };
}

// 切分树坏了（缺 children 等）→ 当整块封门，不让整张图炸掉
function safeLeaves(body, W, Hb) {
  if (!body) return null;
  try {
    return layoutLeaves(body, 0, 0, W, Hb).map((l) => ({ x: num(l.x), y: num(l.y), w: num(l.w), h: num(l.h), node: l.node }));
  } catch {
    return null;
  }
}

function frameParts(f, C, handleStyle, ends = endsOf(f, null)) {
  const parts = [];
  const W = Math.max(0, num(f?.W)), H = Math.max(0, num(f?.H)), D = Math.max(0, num(f?.D));
  if (!(W > 0 && H > 0 && D > 0)) return parts;
  const x0 = num(f.x), y0 = Math.max(0, num(f.y));
  const baseKind = f.base?.kind || 'none';
  const bh = clamp(num(f.base?.h), 0, H);
  const Hb = H - bh;
  const vb = y0 + bh, vt = vb + Hb;
  const kind = f.kind || 'tall';
  const tagF = { frame: f.id ?? null };

  const add = (part, color, u0, u1, v0, v1, w0, w1, extra) => {
    const b = {
      part, color,
      u0: Math.min(u0, u1), u1: Math.max(u0, u1), v0: Math.min(v0, v1), v1: Math.max(v0, v1), w0: Math.min(w0, w1), w1: Math.max(w0, w1),
      ...tagF, ...extra,
    };
    const ext = [b.u0, b.u1, b.v0, b.v1, b.w0, b.w1];
    if (!ext.every(Number.isFinite)) return null;
    if (!(b.u1 - b.u0 > 0.05 && b.v1 - b.v0 > 0.05 && b.w1 - b.w0 > 0.05)) return null;
    parts.push(b);
    return b;
  };

  // 见光板（两边露出）：门板色，满深 D；踢脚 / 底层架空时落地
  const eL = ends?.left ? Math.min(T, W / 4) : 0;
  const eR = ends?.right ? Math.min(T, W / 4) : 0;
  const toFloor = baseKind === 'plinth' || baseKind === 'raised';
  if (eL) add('end', C.door, x0, x0 + eL, toFloor ? y0 : vb, vt, 0, D);
  if (eR) add('end', C.door, x0 + W - eR, x0 + W, toFloor ? y0 : vb, vt, 0, D);
  const ia = x0 + eL, ib = x0 + W - eR;

  // 没切过的柜身当整块封门（同计价）
  const leaves = safeLeaves(f.body, W, Hb) || [{ x: 0, y: 0, w: W, h: Hb, node: { leaf: true, type: 'closed' } }];

  // 底座
  if (bh > 0) {
    if (baseKind === 'plinth') {
      // 整列空位（电器位）下面不做踢脚（同计价：整列空位连底座不算）
      solidRuns(leaves, W).forEach(([a, b]) => {
        const s = Math.max(ia, x0 + a), e = Math.min(ib, x0 + b);
        add('plinth', C.plinth, s, e, y0, vb, 0, Math.max(D * 0.5, D - RECESS));
      });
    } else if (baseKind === 'legs') {
      const span = ib - ia;
      const n = Math.max(2, Math.ceil(span / 1000) + 1);
      const rows = D - T - 80 > 140 ? [60, D - T - 60] : [D / 2];
      for (let i = 0; i < n; i++) {
        const c = ia + 30 + ((span - 60) * i) / (n - 1);
        rows.forEach((wc) => add('leg', C.leg, c - 20, c + 20, y0, vb, wc - 20, wc + 20));
      }
    } else if (baseKind === 'raised') {
      // 侧板落地，下面空（放鞋）
      if (!eL) add('panel', C.carcass, x0, x0 + Math.min(T, W / 4), y0, vb, 0, Math.max(T, D - T));
      if (!eR) add('panel', C.carcass, x0 + W - Math.min(T, W / 4), x0 + W, y0, vb, 0, Math.max(T, D - T));
    }
  }

  // 台面（只示意，叠在柜体上面）
  const worktop = f.worktop ? add('worktop', WORKTOP, x0, x0 + W, vt, vt + WT_H, 0, D + WT_OVER) : null;

  // 门 / 抽屉 / 开放格
  const frameCenter = x0 + W / 2;
  leaves.forEach((r, li) => {
    const nd = r.node || {};
    const type = nd.type || 'closed';
    if (type === 'void') return; // 空位：真的空着
    const tag = { leaf: li };
    let u0 = x0 + r.x, u1 = x0 + r.x + r.w;
    const v0 = vb + r.y, v1 = vb + r.y + r.h;
    if (eL && r.x <= 0.5) u0 += eL;
    if (eR && r.x + r.w >= W - 0.5) u1 -= eR;
    if (!(u1 - u0 > 2 && v1 - v0 > 2)) return;
    const n = Math.max(1, Math.ceil(r.w / MAX_LEAF));
    const interior = nd.interior;
    let topBox = null; // 这格顶面（水槽 / 炉头没有台面时放这里）

    if (type === 'open') {
      topBox = shell(u0, u1, v0, v1, D, interior, tag);
    } else if (type === 'glass') {
      topBox = shell(u0, u1, v0, v1, Math.max(T, D - T), interior, tag);
      doors(u0, u1, v0, v1, n, true, tag);
    } else if (type === 'drawer') {
      topBox = add('carcass', C.carcass, u0, u1, v0, v1, 0, Math.max(T, D - T), tag);
      drawers(u0, u1, v0, v1, clamp(Math.round(num(nd.drawers, 3)) || 3, 1, 12), tag);
    } else {
      topBox = add('carcass', C.carcass, u0, u1, v0, v1, 0, Math.max(T, D - T), tag);
      if (interior === 'oven') oven(u0, u1, v0, v1, tag);
      else doors(u0, u1, v0, v1, n, false, tag);
    }

    // 水槽 / 炉头：画在台面上（没有台面就画在这格顶上）
    const atTop = r.y + r.h >= Hb - 0.5;
    if ((interior === 'sink' || interior === 'hob') && atTop) {
      const surf = worktop || topBox;
      if (surf) {
        const top = surf.v1;
        const dEnd = surf.w1;
        const cu = (u0 + u1) / 2;
        if (interior === 'sink') sink(surf, cu, u1 - u0, top, dEnd, tag);
        else hob(cu, u1 - u0, top, dEnd, tag);
      }
    }
  });

  // 开放格 / 玻璃柜：侧板 + 顶底 + 背板 + 柜内示意。返回顶板。
  function shell(u0, u1, v0, v1, Do, interior, tag) {
    const t = Math.min(T, (u1 - u0) / 4, (v1 - v0) / 4);
    const wb = Math.min(BACK, Do / 4);
    add('panel', C.side, u0, u0 + t, v0, v1, 0, Do, tag);
    add('panel', C.side, u1 - t, u1, v0, v1, 0, Do, tag);
    add('panel', C.carcass, u0 + t, u1 - t, v0, v0 + t, 0, Do, tag);
    const top = add('panel', C.carcass, u0 + t, u1 - t, v1 - t, v1, 0, Do, tag);
    add('back', C.back, u0 + t, u1 - t, v0 + t, v1 - t, 0, wb, tag);
    const iu0 = u0 + t, iu1 = u1 - t, iv0 = v0 + t, iv1 = v1 - t;
    const wf = Math.max(wb + 1, Do - 20);
    const shelvesIn = (a, b) => {
      const ih = b - a;
      const k = Math.max(0, Math.round(ih / 350) - 1);
      for (let j = 1; j <= k; j++) {
        const c = a + (j * ih) / (k + 1);
        add('shelf', C.carcass, iu0, iu1, c - t / 2, c + t / 2, wb, wf, tag);
      }
    };
    const rod = (rv) => {
      const wc = Do / 2;
      add('rod', ROD, iu0, iu1, rv - 12, rv + 12, wc - 12, wc + 12, tag);
    };
    const ih = iv1 - iv0;
    if (interior === 'shelves') shelvesIn(iv0, iv1);
    else if (interior === 'rod') { if (ih > 300) rod(iv1 - 120); }
    else if (interior === 'rodShelves') {
      const sp = iv0 + ih * 0.45;
      add('shelf', C.carcass, iu0, iu1, sp - t / 2, sp + t / 2, wb, wf, tag);
      shelvesIn(iv0, sp - t / 2);
      if (iv1 - sp > 300) rod(iv1 - 120);
    }
    return top;
  }

  function handleFor(du0, du1, dv0, dv1, side, inset) {
    if (handleStyle === 'bar') {
      const hh = clamp((dv1 - dv0) * 0.3, 120, 320);
      const hw = 12;
      if (du1 - du0 < 2 * inset + hw || dv1 - dv0 < hh + 20) return;
      const cu = side === 'right' ? du1 - inset - hw / 2 : du0 + inset + hw / 2;
      const cv = handleV(kind, dv0, dv1, hh);
      add('handle', C.handle, cu - hw / 2, cu + hw / 2, cv - hh / 2, cv + hh / 2, D, D + 20);
    } else if (handleStyle === 'knob') {
      const s = 26;
      if (du1 - du0 < 2 * inset + s || dv1 - dv0 < s + 20) return;
      const cu = side === 'right' ? du1 - inset - s / 2 : du0 + inset + s / 2;
      const cv = handleV(kind, dv0, dv1, s);
      add('handle', C.handle, cu - s / 2, cu + s / 2, cv - s / 2, cv + s / 2, D, D + 22);
    }
  }

  function doors(u0, u1, v0, v1, n, glass, tag) {
    const step = (u1 - u0) / n;
    for (let i = 0; i < n; i++) {
      const du0 = u0 + i * step + GAP / 2, du1 = u0 + (i + 1) * step - GAP / 2;
      const dv0 = v0 + GAP / 2, dv1 = v1 - GAP / 2;
      if (!(du1 - du0 > 1 && dv1 - dv0 > 1)) continue;
      const side = openSide(i, n, (du0 + du1) / 2, frameCenter);
      if (glass) {
        const s = clamp(Math.min(du1 - du0, dv1 - dv0) * 0.12, 30, 60);
        add('front', C.door, du0, du0 + s, dv0, dv1, D - T, D, { ...tag, glassFrame: true });
        add('front', C.door, du1 - s, du1, dv0, dv1, D - T, D, { ...tag, glassFrame: true });
        add('front', C.door, du0 + s, du1 - s, dv0, dv0 + s, D - T, D, { ...tag, glassFrame: true });
        add('front', C.door, du0 + s, du1 - s, dv1 - s, dv1, D - T, D, { ...tag, glassFrame: true });
        add('glass', GLASS, du0 + s, du1 - s, dv0 + s, dv1 - s, D - 12, D - 6, { ...tag, opacity: GLASS_OPACITY });
        handleFor(du0, du1, dv0, dv1, side, s / 2 - 6);
      } else {
        const b = add('front', C.door, du0, du1, dv0, dv1, D - T, D, tag);
        // 同立面图：门整扇在 1300 以上（吊柜 / 衣柜顶柜）→ 槽在下沿，否则在上沿
        if (b && handleStyle === 'hidden') groove(b, du0, du1, dv0, dv1, dv1 <= 1300 || dv0 < 1300);
        handleFor(du0, du1, dv0, dv1, side, 34);
      }
    }
  }

  function drawers(u0, u1, v0, v1, nDr, tag) {
    const step = (v1 - v0) / nDr;
    for (let k = 0; k < nDr; k++) {
      const du0 = u0 + GAP / 2, du1 = u1 - GAP / 2;
      const dv0 = v0 + k * step + GAP / 2, dv1 = v0 + (k + 1) * step - GAP / 2;
      const b = add('drawer', C.door, du0, du1, dv0, dv1, D - T, D, tag);
      if (!b) continue;
      if (handleStyle === 'hidden') groove(b, du0, du1, dv0, dv1, true);
      const cu = (du0 + du1) / 2, cv = (dv0 + dv1) / 2;
      if (handleStyle === 'bar') {
        const len = Math.min(clamp((du1 - du0) * 0.4, 96, 320), du1 - du0 - 40);
        if (len > 20 && dv1 - dv0 > 30) add('handle', C.handle, cu - len / 2, cu + len / 2, cv - 6, cv + 6, D, D + 20);
      } else if (handleStyle === 'knob') {
        if (du1 - du0 > 60 && dv1 - dv0 > 46) add('handle', C.handle, cu - 13, cu + 13, cv - 13, cv + 13, D, D + 22);
      }
    }
  }

  // 隐藏拉手：开口边一道细阴影槽（atTop：门顶；否则门底，吊柜 / 顶柜）
  function groove(b, du0, du1, dv0, dv1, atTop) {
    const g = Math.min(8, (dv1 - dv0) / 6);
    const ga = atTop ? dv1 - g : dv0, gb = atTop ? dv1 : dv0 + g;
    b.decals = b.decals || [];
    b.decals.push({ axis: 'w', sign: 1, pts: [[du0, ga, D], [du1, ga, D], [du1, gb, D], [du0, gb, D]], fill: shade(C.door, 0.62), stroke: 'none' });
  }

  // 烤箱：深色玻璃门 + 横拉手（代替柜门）
  function oven(u0, u1, v0, v1, tag) {
    const du0 = u0 + GAP / 2, du1 = u1 - GAP / 2, dv0 = v0 + GAP / 2, dv1 = v1 - GAP / 2;
    const b = add('appliance', OVEN_GLASS, du0, du1, dv0, dv1, D - T, D, tag);
    if (!b) return;
    const ctl = Math.min(90, (dv1 - dv0) * 0.18);
    b.decals = [{ axis: 'w', sign: 1, pts: [[du0 + 40, dv0 + 40, D], [du1 - 40, dv0 + 40, D], [du1 - 40, dv1 - ctl - 30, D], [du0 + 40, dv1 - ctl - 30, D]], fill: '#4C4E4D', stroke: '#6B6E6C' }];
    const len = Math.max(40, (du1 - du0) - 140);
    add('handle', STEEL_DARK, (du0 + du1) / 2 - len / 2, (du0 + du1) / 2 + len / 2, dv1 - ctl - 18, dv1 - ctl - 6, D, D + 22);
  }

  function sink(surf, cu, lw, top, dEnd, tag) {
    const bw = clamp(lw - 140, 260, 780);
    const bd = clamp(dEnd * 0.62, 260, 460);
    const wc = dEnd * 0.56;
    const a0 = cu - bw / 2, a1 = cu + bw / 2, w0 = wc - bd / 2, w1 = wc + bd / 2;
    surf.decals = surf.decals || [];
    surf.decals.push({ axis: 'v', sign: 1, pts: roundRectUW(a0, a1, w0, w1, 40, top), fill: STEEL, stroke: STEEL_DARK });
    surf.decals.push({ axis: 'v', sign: 1, pts: roundRectUW(a0 + 28, a1 - 28, w0 + 28, w1 - 28, 34, top), fill: '#B5BBBA', stroke: STEEL_DARK });
    surf.decals.push({ axis: 'v', sign: 1, pts: circleUW(cu, wc + 10, 22, top, 18), fill: DRAIN, stroke: 'none' });
    // 龙头：柱 + 出水嘴
    const tw1 = w0 - 22, tw0 = tw1 - 34;
    if (tw0 > 4) {
      add('tap', STEEL_DARK, cu - 17, cu + 17, top, top + 230, tw0, tw1, tag);
      add('tap', STEEL_DARK, cu - 13, cu + 13, top + 204, top + 230, tw1, tw1 + 150, tag);
    }
  }

  function hob(cu, lw, top, dEnd, tag) {
    const hw = clamp(lw - 90, 280, 760);
    const hd = clamp(dEnd - 110, 280, 520);
    const wc = dEnd * 0.5;
    const b = add('hob', HOB_GLASS, cu - hw / 2, cu + hw / 2, top, top + 6, wc - hd / 2, wc + hd / 2, tag);
    if (!b) return;
    const v = top + 6;
    const nB = hw >= 680 ? 3 : 2;
    const R = Math.min(hd * 0.3, (hw / nB) * 0.36);
    b.decals = [];
    for (let i = 0; i < nB; i++) {
      const bu = cu - hw / 2 + (hw * (i + 0.5)) / nB;
      const bwc = nB === 3 && i === 1 ? wc - hd * 0.08 : wc + hd * 0.02;
      const rr = nB === 3 && i === 1 ? R * 0.8 : R;
      b.decals.push({ axis: 'v', sign: 1, pts: circleUW(bu, bwc, rr, v), fill: 'none', stroke: BURNER });
      b.decals.push({ axis: 'v', sign: 1, pts: circleUW(bu, bwc, rr * 0.48, v, 20), fill: 'none', stroke: BURNER });
    }
  }

  return parts;
}

// ---------------- 公开：世界长方体 ----------------
function buildWorld(cab, opts = {}) {
  const walls = safeWalls(cab, opts);
  const C = colorsOf(cab);
  const handleStyle = ['hidden', 'bar', 'knob', 'push'].includes(cab?.handle) ? cab.handle : 'hidden';
  const frames = Array.isArray(cab?.frames) ? cab.frames : [];
  const boxes = [];
  const footprints = [];
  const wallUse = walls.map(() => ({ used: false, end: 0, top: 0 }));
  frames.forEach((f, fi) => {
    if (!f) return;
    const { wall, wallIndex } = wallOf(walls, f);
    const parts = frameParts(f, C, handleStyle, endsOf(f, cab?.exposed));
    if (!parts.length) return;
    const use = wallUse[wallIndex];
    use.used = true;
    use.end = Math.max(use.end, num(f.x) + num(f.W));
    parts.forEach((p) => {
      const wb = localBoxToWorld(wall, p.u0, p.u1, p.v0, p.v1, p.w0, p.w1);
      const box = { ...wb, color: p.color, part: p.part, frame: p.frame, frameIndex: fi, wall: wallIndex };
      if (p.leaf != null) box.leaf = p.leaf;
      if (p.opacity != null) box.opacity = p.opacity;
      if (p.glassFrame) box.glassFrame = true;
      if (p.decals) {
        box.decals = p.decals.map((dc) => ({
          n: localNormal(wall, dc.axis, dc.sign),
          pts: dc.pts.map(([u, v, w]) => wallToWorld(wall, u, v, w)),
          fill: dc.fill, stroke: dc.stroke,
        }));
      }
      use.top = Math.max(use.top, wb.y + wb.h);
      boxes.push(box);
    });
    // 地面阴影（落地柜深、低悬挂浅）
    const y0 = Math.max(0, num(f.y));
    const op = y0 <= 1 ? 0.1 : y0 < 900 ? 0.05 : 0;
    if (op > 0) {
      const W = num(f.W), D = num(f.D), x0 = num(f.x);
      footprints.push({ wall: wallIndex, opacity: op, pts: [[x0, 0, 0], [x0 + W, 0, 0], [x0 + W, 0, D + 30], [x0, 0, D + 30]].map(([u, v, w]) => wallToWorld(wall, u, v, w)) });
    }
  });
  return { boxes: resolveCorners(boxes), walls, wallUse, footprints };
}

// L / U 转角：两面墙的台面会叠 20mm（前挑）→ 后来的那块让开；
// 藏在转角里的拉手顶到另一面墙的柜子 → 不画。（长方体互相穿插会让前后排序出错）
const AX = [['x', 'w'], ['y', 'h'], ['z', 'd']];
const overlapOn = (a, b, k) => Math.min(a[AX[k][0]] + a[AX[k][1]], b[AX[k][0]] + b[AX[k][1]]) - Math.max(a[AX[k][0]], b[AX[k][0]]);
const intersects = (a, b) => overlapOn(a, b, 0) > 0.01 && overlapOn(a, b, 1) > 0.01 && overlapOn(a, b, 2) > 0.01;
function resolveCorners(boxes) {
  const tops = boxes.filter((b) => b.part === 'worktop');
  for (let j = 0; j < tops.length; j++) {
    for (let i = 0; i < j; i++) {
      const a = tops[i], b = tops[j];
      if (a.frame === b.frame || !intersects(a, b) || b.dead) continue;
      const k = overlapOn(a, b, 0) <= overlapOn(a, b, 2) ? 0 : 2;
      const [p, s] = AX[k];
      const bMin = b[p], bMax = b[p] + b[s], aMin = a[p], aMax = a[p] + a[s];
      if (bMin + bMax < aMin + aMax) b[s] = Math.max(0, aMin - bMin);
      else { b[p] = aMax; b[s] = Math.max(0, bMax - aMax); }
      if (b[s] <= 0.05) b.dead = true;
    }
  }
  return boxes.filter((b) => {
    if (b.dead) return false;
    if (b.part !== 'handle') return true;
    return !boxes.some((o) => o !== b && !o.dead && o.frameIndex !== b.frameIndex && intersects(o, b));
  }).map((b) => { if ('dead' in b) delete b.dead; return b; });
}

export function cabinetBoxes(cab, opts = {}) {
  return buildWorld(cab, opts).boxes;
}

// ---------------- 投影 ----------------
export function clampYaw(yaw) {
  const y = Number(yaw);
  return Number.isFinite(y) ? clamp(y, -AXO_YAW_LIMIT, AXO_YAW_LIMIT) : AXO_DEFAULT_YAW;
}
// 绕竖轴转 yaw（yaw<0：人在左前方），再往下俯 pitch。返回 project(x,y,z) → [屏幕x, 屏幕y(向下), 深度(越大越近)]，
// 以及 V = 指向观众的单位向量（世界坐标），面法线 · V > 0 = 朝向观众。
export function axoProjector(yawDeg = AXO_DEFAULT_YAW, pitchDeg = AXO_PITCH) {
  const t = (clampYaw(yawDeg) * Math.PI) / 180;
  const p = (clamp(num(pitchDeg, AXO_PITCH), 5, 70) * Math.PI) / 180;
  const ct = Math.cos(t), st = Math.sin(t), cp = Math.cos(p), sp = Math.sin(p);
  const V = [st * cp, sp, ct * cp];
  const project = (x, y, z) => {
    const X = x * ct - z * st;
    const Z = x * st + z * ct;
    const Y = y * cp - Z * sp;
    const depth = y * sp + Z * cp;
    return [X, -Y, depth];
  };
  return { V, project };
}

// 世界光：左上前方。正面 = 原色；顶面提亮；左侧略暗；右侧 / 背面更暗。
const LIGHT = (() => { const l = [-0.3, 0.8, 0.52]; const m = Math.hypot(...l); return l.map((v) => v / m); })();
const lit = (n) => 0.78 + 0.3 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
const LIT_FRONT = lit([0, 0, 1]);
const lightFactor = (n) => lit(n) / LIT_FRONT;

const FACE_DEFS = [
  { n: [1, 0, 0], c: (a, b) => [[b[0], a[1], a[2]], [b[0], a[1], b[2]], [b[0], b[1], b[2]], [b[0], b[1], a[2]]] },
  { n: [-1, 0, 0], c: (a, b) => [[a[0], a[1], a[2]], [a[0], b[1], a[2]], [a[0], b[1], b[2]], [a[0], a[1], b[2]]] },
  { n: [0, 1, 0], c: (a, b) => [[a[0], b[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]] },
  { n: [0, -1, 0], c: (a, b) => [[a[0], a[1], a[2]], [a[0], a[1], b[2]], [b[0], a[1], b[2]], [b[0], a[1], a[2]]] },
  { n: [0, 0, 1], c: (a, b) => [[a[0], a[1], b[2]], [a[0], b[1], b[2]], [b[0], b[1], b[2]], [b[0], a[1], b[2]]] },
  { n: [0, 0, -1], c: (a, b) => [[a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], b[1], a[2]], [a[0], b[1], a[2]]] },
];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function convexHull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}
// 两个凸多边形（屏幕上）是否真的重叠（分离轴，tol 以内的贴边不算）
function hullsOverlap(A, B, tol) {
  for (const P of [A, B]) {
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      let nx = b[1] - a[1], ny = a[0] - b[0];
      const len = Math.hypot(nx, ny);
      if (len < 1e-12) continue;
      nx /= len; ny /= len;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const q of A) { const d = q[0] * nx + q[1] * ny; if (d < minA) minA = d; if (d > maxA) maxA = d; }
      for (const q of B) { const d = q[0] * nx + q[1] * ny; if (d < minB) minB = d; if (d > maxB) maxB = d; }
      if (maxA <= minB + tol || maxB <= minA + tol) return false;
    }
  }
  return true;
}
// 两个不相交的轴对齐长方体：找一条分离轴，看哪个离观众远。-1 = a 在后（先画），1 = b 在后，0 = 判断不了
function boxOrder(a, b, V, eps) {
  for (let k = 0; k < 3; k++) {
    const vk = V[k];
    if (Math.abs(vk) < 1e-9) continue;
    if (a.max[k] <= b.min[k] + eps) return vk > 0 ? -1 : 1;
    if (b.max[k] <= a.min[k] + eps) return vk > 0 ? 1 : -1;
  }
  return 0;
}

// 一个长方体的面被紧贴的不透明长方体整面盖住 → 不画（柜体之间的内部面）
function buildCoverIndex(items) {
  const idx = [new Map(), new Map(), new Map()]; // 每轴：min 平面 → 长方体
  const key = (v) => Math.round(v * 10);
  items.forEach((it) => {
    if (it.translucent) return;
    for (let k = 0; k < 3; k++) {
      const m = idx[k], kk = key(it.min[k]);
      if (!m.has(kk)) m.set(kk, []);
      m.get(kk).push(it);
    }
  });
  const idxMax = [new Map(), new Map(), new Map()];
  items.forEach((it) => {
    if (it.translucent) return;
    for (let k = 0; k < 3; k++) {
      const m = idxMax[k], kk = key(it.max[k]);
      if (!m.has(kk)) m.set(kk, []);
      m.get(kk).push(it);
    }
  });
  return (it, k, sign) => {
    const plane = sign > 0 ? it.max[k] : it.min[k];
    const cands = (sign > 0 ? idx[k] : idxMax[k]).get(key(plane)) || [];
    const o1 = (k + 1) % 3, o2 = (k + 2) % 3;
    return cands.some((c) => c !== it
      && c.min[o1] <= it.min[o1] + 0.05 && c.max[o1] >= it.max[o1] - 0.05
      && c.min[o2] <= it.min[o2] + 0.05 && c.max[o2] >= it.max[o2] - 0.05);
  };
}

// ---------------- 公开：轴测图 ----------------
export function axoScene(cab, opts = {}) {
  const yaw = clampYaw(opts.yaw ?? cab?.view?.yaw ?? AXO_DEFAULT_YAW);
  const pitch = clamp(num(opts.pitch, AXO_PITCH), 5, 70);
  const showFloor = opts.floor !== false;
  const showWall = opts.backWall !== false && showFloor;
  const { V, project } = axoProjector(yaw, pitch);
  const { boxes, walls, wallUse, footprints } = buildWorld(cab, opts);

  // 背对观众那面墙上的柜子（L 右墙在人站右边时、二字型近排）→ 半透明，不挡后面
  const wallFacing = walls.map((w) => { const a = wallAxes(w.angle); return a.wx * V[0] + a.wz * V[2]; });

  const items = boxes.map((b, i) => {
    const min = [b.x, b.y, b.z], max = [b.x + b.w, b.y + b.h, b.z + b.d];
    const ghost = wallFacing[b.wall] < -0.05;
    const opacity = b.opacity != null ? b.opacity * (ghost ? 0.45 : 1) : ghost ? GHOST_OPACITY : undefined;
    const corners = [];
    for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) corners.push(project(x, y, z));
    const pts2 = corners.map((c) => [c[0], c[1]]);
    const center = project((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    pts2.forEach(([x, y]) => { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); });
    return { i, b, min, max, opacity, translucent: opacity != null && opacity < 1, hull: convexHull(pts2), bbox: [bx0, by0, bx1, by1], depth: center[2] };
  });

  // 场景尺寸 → 线宽 / 字号单位
  let sx0 = Infinity, sy0 = Infinity, sx1 = -Infinity, sy1 = -Infinity;
  const grow = (x, y) => { sx0 = Math.min(sx0, x); sy0 = Math.min(sy0, y); sx1 = Math.max(sx1, x); sy1 = Math.max(sy1, y); };
  items.forEach((it) => { grow(it.bbox[0], it.bbox[1]); grow(it.bbox[2], it.bbox[3]); });

  // 地面 + 墙（只做背景）
  let wx0 = Infinity, wx1 = -Infinity, wz0 = Infinity, wz1 = -Infinity, top = 0;
  boxes.forEach((b) => { wx0 = Math.min(wx0, b.x); wx1 = Math.max(wx1, b.x + b.w); wz0 = Math.min(wz0, b.z); wz1 = Math.max(wz1, b.z + b.d); top = Math.max(top, b.y + b.h); });
  const bg = [];
  if (boxes.length && showFloor) {
    const size = Math.max(wx1 - wx0, wz1 - wz0, top);
    const m = clamp(size * 0.1, 120, 700);
    let fx0 = wx0 - m, fx1 = wx1 + m, fz0 = wz0 - m, fz1 = wz1 + m * 1.6;
    const usedWalls = walls.map((w, i) => ({ w, i })).filter(({ i }) => wallUse[i].used);
    // 地面不越过墙
    usedWalls.forEach(({ w }) => {
      const q = (((Math.round(w.angle / 90)) % 4) + 4) % 4;
      if (q === 0) fz0 = Math.max(fz0, w.oz);
      else if (q === 1) fx1 = Math.min(fx1, w.ox);
      else if (q === 2) fz1 = Math.min(fz1, w.oz);
      else fx0 = Math.max(fx0, w.ox);
    });
    if (fx1 > fx0 && fz1 > fz0) {
      bg.push({ part: 'floor', n: [0, 1, 0], pts: [[fx0, 0, fz0], [fx1, 0, fz0], [fx1, 0, fz1], [fx0, 0, fz1]], fill: FLOOR, stroke: LINE, opacity: 0.85 });
    }
    footprints.forEach((fp) => {
      if (wallFacing[fp.wall] < -0.05) return;
      bg.push({ part: 'shadow', n: [0, 1, 0], pts: fp.pts, fill: INK, stroke: 'none', opacity: fp.opacity });
    });
    if (showWall) {
      const wallH = Math.max(top, Math.min(top + 500, 2400));
      usedWalls.forEach(({ w, i }) => {
        const a = wallAxes(w.angle);
        if (wallFacing[i] <= 0.02) return; // 墙面背对观众：不画
        let t0 = -m, t1 = Math.max(w.len, wallUse[i].end) + m;
        // 被相邻（垂直）墙截断
        usedWalls.forEach(({ w: o, i: j }) => {
          if (j === i) return;
          const b2 = wallAxes(o.angle);
          const k = a.ux * b2.wx + a.uz * b2.wz; // u_i · w_j
          if (Math.abs(k) < 1e-9) return;
          const rhs = (o.ox - w.ox) * b2.wx + (o.oz - w.oz) * b2.wz;
          if (k > 0) t0 = Math.max(t0, rhs / k); else t1 = Math.min(t1, rhs / k);
        });
        if (!(t1 > t0)) return;
        const pts = [[t0, 0], [t1, 0], [t1, wallH], [t0, wallH]].map(([u, v]) => wallToWorld(w, u, v, 0));
        bg.push({ part: 'wall', n: [a.wx, 0, a.wz], pts, fill: WALL, stroke: LINE, opacity: 0.9 });
      });
    }
    bg.forEach((g) => g.pts.forEach((p) => { const s = project(p[0], p[1], p[2]); grow(s[0], s[1]); }));
  }

  const hasGeom = Number.isFinite(sx0) && sx1 > sx0 && sy1 > sy0;
  if (!hasGeom) { sx0 = 0; sy0 = 0; sx1 = 1000; sy1 = 600; }
  const size = Math.max(sx1 - sx0, sy1 - sy0);
  const unit = size / 400;
  const sw = r2(unit * 0.55);
  const tol = size * 1e-6;

  // 排序：屏幕上重叠的两个长方体按分离轴定前后 → 拓扑排序（同级先画远的）
  const n = items.length;
  const adj = Array.from({ length: n }, () => []);
  const indeg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const A = items[i];
    for (let j = i + 1; j < n; j++) {
      const B = items[j];
      if (A.bbox[2] <= B.bbox[0] + tol || B.bbox[2] <= A.bbox[0] + tol || A.bbox[3] <= B.bbox[1] + tol || B.bbox[3] <= A.bbox[1] + tol) continue;
      if (!hullsOverlap(A.hull, B.hull, tol)) continue;
      let o = boxOrder(A, B, V, 0.01);
      if (o === 0) o = A.depth < B.depth || (A.depth === B.depth && i < j) ? -1 : 1;
      if (o < 0) { adj[i].push(j); indeg[j] += 1; } else { adj[j].push(i); indeg[i] += 1; }
    }
  }
  const done = new Array(n).fill(false);
  const order = [];
  const better = (a, b) => (b < 0 || items[a].depth < items[b].depth - 1e-9 || (Math.abs(items[a].depth - items[b].depth) <= 1e-9 && a < b));
  for (let step = 0; step < n; step++) {
    let pick = -1;
    for (let k = 0; k < n; k++) if (!done[k] && indeg[k] <= 0 && better(k, pick)) pick = k;
    if (pick < 0) for (let k = 0; k < n; k++) if (!done[k] && better(k, pick)) pick = k; // 循环遮挡：拿最远的硬拆
    done[pick] = true;
    order.push(pick);
    adj[pick].forEach((k) => { indeg[k] -= 1; });
  }

  // 输出
  const shapes = [];
  const P2 = (p) => { const s = project(p[0], p[1], p[2]); return [r2(s[0]), r2(s[1])]; };
  bg.forEach((g) => {
    if (dot3(g.n, V) <= 1e-9) return;
    const s = { t: 'poly', points: g.pts.map(P2), fill: g.fill, stroke: g.stroke, sw: g.stroke === 'none' ? 0 : r2(unit * 0.5), part: g.part };
    if (g.opacity != null) s.opacity = g.opacity;
    shapes.push(s);
  });
  const covered = buildCoverIndex(items);
  order.forEach((k) => {
    const it = items[k];
    const b = it.b;
    FACE_DEFS.forEach((fd, fiIdx) => {
      if (dot3(fd.n, V) <= 1e-9) return;
      const axis = fiIdx >> 1, sign = fiIdx % 2 === 0 ? 1 : -1;
      if (!it.translucent && covered(it, axis, sign)) return;
      const fill = shade(b.color, lightFactor(fd.n));
      const s = { t: 'poly', points: fd.c(it.min, it.max).map(P2), fill, stroke: shade(fill, b.part === 'glass' ? 0.8 : 0.76), sw, part: b.part };
      if (b.frame != null) s.frame = b.frame;
      if (b.leaf != null) s.leaf = b.leaf;
      if (it.opacity != null) s.opacity = it.opacity;
      shapes.push(s);
    });
    (b.decals || []).forEach((dc) => {
      if (dot3(dc.n, V) <= 1e-9) return;
      const s = { t: 'poly', points: dc.pts.map(P2), fill: dc.fill || 'none', stroke: dc.stroke || 'none', sw: dc.stroke && dc.stroke !== 'none' ? r2(unit * 0.45) : 0, part: 'decal' };
      if (b.frame != null) s.frame = b.frame;
      if (it.opacity != null) s.opacity = it.opacity;
      shapes.push(s);
    });
  });

  // 视框 + 柜号
  const pad = size * 0.035;
  const textSize = r2(unit * 15);
  const head = cab?.code != null && String(cab.code) !== '' && opts.label !== false ? textSize * 1.5 : 0;
  const vx = sx0 - pad, vy = sy0 - pad - head;
  const vw = sx1 - sx0 + pad * 2, vh = sy1 - sy0 + pad * 2 + head;
  if (head) shapes.push({ t: 'text', x: r2(vx + pad), y: r2(vy + pad + textSize * 0.9), text: String(cab.code), size: textSize, fill: INK, weight: 700 });
  return { viewBox: [r2(vx), r2(vy), r2(vw), r2(vh)], shapes, yaw, pitch };
}
