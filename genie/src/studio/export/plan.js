// 场景 → DXF 平面图（SPEC §3.4–3.9）。
//   planDoc(scene, 'full')            AutoCAD：所有楼层并排（第 k 层往 +X 挪 k·(楼宽 + 间距)），墙 / 门窗 / 楼梯 / 房间 / 柜子家具图块 / 尺寸 / 图名
//   planDoc(scene, 'kujiale', floorId) 酷家乐「导入 CAD 户型」：一层一个、原点不挪，只有墙、矮墙、门、趟门、窗、房间名（GBK 文字）
// 墙 = 所有实心墙段矩形的并集（干净的闭合环，门窗洞自然断开）；门 / 窗 / 趟门是图块（只转不镜像）。

import { Dxf, textBox } from './dxf.js';
import { unionLoops, area2, textWidth } from './geom2d.js';
import { footprint } from './massing.js';
import { bi, both, SAIL_LINE } from './names.js';
import { CAT_INFO, catLabel, matTag } from './catalog.js';
import { isOutdoorEdge } from './scene.js';
import { BRAND } from '../../shared/config.js';
import { EXT_T } from '../plan/model.js';

/** 酷家乐文件的文字：'gbk'（中文版 AutoCAD 存 DXF 的写法）；酷家乐里房间名是乱码的话改成 'u'（SPEC §7.6） */
export const KUJIALE_TEXT = 'gbk';

/** 图层：名字 · ACI 颜色 · 线宽（1/100 mm）· 线型 · 中文说明 · 酷家乐文件里有没有 */
export const LAYERS = [
  ['A-WALL', 7, 50, 'Continuous', '墙', true],
  ['A-WALL-PATT', 8, 0, 'Continuous', '墙填充', false],
  ['A-WALL-LOW', 7, 25, 'Continuous', '矮墙 / 栏杆', true],
  ['A-DOOR', 4, 25, 'Continuous', '门', true],
  ['A-DOOR-SLID', 4, 25, 'Continuous', '趟门', true],
  ['A-GLAZ', 4, 18, 'Continuous', '窗', true], // 青色（天正 WINDOW 层的颜色）：AutoCAD 黑底上看得清（ACI 5 纯蓝几乎看不见）
  ['A-OPEN', 8, 13, 'HIDDEN', '打通', false],
  ['A-FLOR-STRS', 3, 18, 'Continuous', '楼梯', false],
  ['A-FLOR-HRAL', 3, 18, 'Continuous', '楼梯口 / 挑空栏杆', false],
  ['A-AREA-IDEN', 2, 18, 'Continuous', '房间名', true],
  ['A-AREA', 2, 13, 'Continuous', '面积', false],
  ['A-CASE', 6, 25, 'Continuous', '定制柜（我们做）', false],
  ['A-FURN', 30, 18, 'Continuous', '家具示意（不是我们做）', false],
  ['A-FURN-SOFT', 9, 13, 'Continuous', '软装灯具窗帘', false],
  ['A-EQPM', 140, 18, 'Continuous', '洁具电器', false],
  ['A-DIMS', 1, 13, 'Continuous', '尺寸', false],
  ['A-ANNO-TTLB', 7, 25, 'Continuous', '图名', false],
];
export const KUJIALE_LAYERS = new Set(LAYERS.filter((l) => l[5]).map((l) => l[0]));

/** DIMSTYLE WISH-100（模型单位 mm，按 1:100 出图；SPEC §3.6） */
const DIMVARS = [[40, 1], [41, 100], [42, 100], [43, 400], [44, 100], [46, 100], [140, 250], [141, 0], [142, 100], [147, 60], [73, 0], [74, 0], [77, 1], [78, 8], [172, 1], [271, 0], [277, 2], [278, 46], [279, 2], [289, 3]];

function setup(D) {
  D.ltype('DASHED', 'Dashed __ __ __', [300, -150]);
  D.ltype('HIDDEN', 'Hidden _ _ _', [150, -75]);
  for (const [n, c, lw, lt] of LAYERS) D.layer(n, { color: c, lw, ltype: lt });
  D.style('WISH-ZH', { font: 'msyh.ttc', family: 'Microsoft YaHei' });
  D.style('WISH-EN', { font: 'arial.ttf', family: 'Arial' });
  D.style('WISH-SHX', { font: 'txt', big: 'gbcbig.shx' });
  D.dimstyle('WISH-100', DIMVARS, 'WISH-EN');
}

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const r1 = (v) => Math.round(v * 10) / 10;

/** 字高收小到放得进 maxW 宽（毫米）：窄房间的名字、面积不压到隔壁 */
const fitH = (s, h, maxW, min = 60) => Math.max(min, Math.min(h, Math.floor(maxW / Math.max(1e-6, textWidth(s, 1)))));

/** 门 / 窗 / 趟门图块（只建一次）。本地：铰链 / 起点在原点，洞口沿 +X，墙面在 Y = ±t/2 */
function openingBlock(D, kind, len, T) {
  const name = kind === 'win' ? `WISH_WIN_${len}x${T}` : kind === 'sld' ? `WISH_SLD_${len}x${T}` : kind === 'door2' ? `WISH_DOOR2_${len}x${T}` : `WISH_DOOR_${len}x${T}_${kind === 'doorL' ? 'L' : 'R'}`;
  if (D.hasBlock(name)) return name;
  const b = D.block(name);
  const h = T / 2;
  if (kind === 'doorL') {
    D.line(b, '0', [0, h], [0, h + len]);
    D.arc(b, '0', [0, h], len, 0, 90);
  } else if (kind === 'doorR') {
    D.line(b, '0', [0, h], [0, h + len]);
    D.arc(b, '0', [0, h], len, 90, 180);
  } else if (kind === 'door2') {
    const l2 = len / 2;
    D.line(b, '0', [0, h], [0, h + l2]);
    D.arc(b, '0', [0, h], l2, 0, 90);
    D.line(b, '0', [len, h], [len, h + l2]);
    D.arc(b, '0', [len, h], l2, 90, 180);
  } else if (kind === 'win') {
    for (const k of [-h, -T / 6, T / 6, h]) D.line(b, '0', [0, r1(k)], [len, r1(k)]);
  } else {
    for (const k of [-h, h]) D.line(b, '0', [0, k], [len, k]);
    const n = Math.max(2, Math.round(len / 1200));
    const pw = len / n + 50;
    for (let i = 0; i < n; i++) {
      const s0 = Math.max(0, (len / n) * i - (i ? 25 : 0));
      const s1 = Math.min(len, s0 + pw);
      const k = i % 2 ? 20 : -20;
      D.poly(b, '0', [[r1(s0), k - 15], [r1(s1), k - 15], [r1(s1), k + 15], [r1(s0), k + 15]], true);
    }
  }
  return name;
}

const ATT_TAGS = ['NAME', 'NAME_EN', 'SIZE', 'CATEGORY', 'MATERIAL', 'MATERIALS', 'ROOM', 'ITEM_ID'];
/** 名字和尺寸看得见的只有定制柜（我们做的）；洁具电器、家具的尺寸在属性和清单里（SPEC §3.5.6） */
const showsName = (cat) => cat === 'case';

/** 圆角矩形（水槽）：每个角 3 段 */
function roundRect(cx, cy, w, h, r) {
  const pts = [];
  const corners = [[cx + w / 2 - r, cy - h / 2 + r, -90], [cx + w / 2 - r, cy + h / 2 - r, 0], [cx - w / 2 + r, cy + h / 2 - r, 90], [cx - w / 2 + r, cy - h / 2 + r, 180]];
  for (const [x, y, a0] of corners)
    for (let k = 0; k <= 3; k++) {
      const a = ((a0 + k * 30) * Math.PI) / 180;
      pts.push([r1(x + Math.cos(a) * r), r1(y + Math.sin(a) * r)]);
    }
  return pts;
}

/** 柜子 / 家具图块：体块的俯视轮廓（高过 1.4m 的虚线）+ 每种的记号 + 属性定义 */
function itemBlock(D, it) {
  if (D.hasBlock(it.key)) return;
  const b = D.block(it.key);
  const seen = new Set();
  const P = ([x, z]) => [r1(x * 1000), r1(-z * 1000)];
  for (const p of it.parts) {
    if (p.plan === false) continue;
    const hidden = !!p.hi || p.y + (it.y || 0) >= 1.4;
    const o = hidden ? { ltype: 'HIDDEN' } : {};
    if (p.s === 'cyl') {
      const c = P([p.x, p.z]);
      const k = `c|${c}|${r1(p.r * 1000)}|${hidden}`;
      if (seen.has(k)) continue;
      seen.add(k);
      D.circle(b, '0', c, r1(p.r * 1000), o);
    } else {
      const pts = footprint(p).map(P);
      const k = `p|${pts.join(';')}|${hidden}`;
      if (seen.has(k)) continue;
      seen.add(k);
      D.poly(b, '0', pts, true, o);
    }
  }
  const W = it.W;
  const Dd = it.D;
  const fx0 = -W / 2;
  const fy0 = -Dd / 2;
  // 到顶的柜子打叉（柜体打叉）
  const tall = it.kind === 'wardrobe' || it.kind === 'tallUnit' || (it.kind === 'shoeCabinet' && it.n.H > 1.2);
  if (tall) {
    D.line(b, '0', [fx0, fy0], [-fx0, -fy0]);
    D.line(b, '0', [fx0, -fy0], [-fx0, fy0]);
  }
  if (it.kind === 'wardrobe') {
    const n = Math.max(2, Math.round(it.n.W / 0.5));
    for (let i = 1; i < n; i++) D.line(b, '0', [r1(fx0 + (i * W) / n), fy0], [r1(fx0 + (i * W) / n), fy0 + 60]);
  }
  if (it.kind === 'kitchenRun') {
    const sinkF = it.sinkAt !== undefined ? it.sinkAt : it.sink ?? 0.3;
    const hobF = it.hobAt !== undefined ? it.hobAt : it.hob ?? 0.72;
    if (sinkF != null) {
      const sx = fx0 + W * sinkF;
      D.poly(b, '0', roundRect(sx, -20, 540, 400, 40), true);
      D.circle(b, '0', [r1(sx), 230], 25);
    }
    if (hobF != null) {
      const hx = fx0 + W * hobF;
      D.poly(b, '0', [[r1(hx - 370), -240], [r1(hx + 370), -240], [r1(hx + 370), 240], [r1(hx - 370), 240]], true);
      D.circle(b, '0', [r1(hx - 180), 20], 60);
      D.circle(b, '0', [r1(hx + 180), 20], 45);
    }
  }
  if (it.kind === 'shower') {
    D.line(b, '0', [fx0, fy0], [-fx0, -fy0]);
    D.circle(b, '0', [0, 0], 40);
  }
  const vis = showsName(it.cat);
  D.attdef(b, 'NAME', [0, 0], 100, { invisible: !vis });
  D.attdef(b, 'SIZE', [0, -140], 100, { invisible: !vis });
  for (const tag of ATT_TAGS.slice(1)) if (tag !== 'SIZE') D.attdef(b, tag, [0, -280], 80, { invisible: true });
}

/** 文字角度收进 (−90°, 90°]：图块怎么转，字都不会倒过来 */
export function uprightDeg(rot) {
  let r = (((rot || 0) % 360) + 360) % 360;
  if (r > 90 && r <= 270) r -= 180;
  else if (r > 270) r -= 360;
  return r;
}

/** 一件家具的属性值 */
export function itemAttribs(it) {
  const cl = catLabel(it.cat);
  return {
    NAME: it.name.zh,
    NAME_EN: it.name.en,
    SIZE: `${it.W}x${it.D}x${it.H}`,
    CATEGORY: `${cl.zh} / ${cl.en}`,
    MATERIAL: it.main,
    MATERIALS: it.mats.map(matTag).join('; '),
    ROOM: it.room.zh,
    ITEM_ID: String(it.id),
  };
}

/** 北向图块：圆 r600 + 实心箭头 + N（图纸上方 = 北，旋转 −north） */
function northBlock(D) {
  if (D.hasBlock('WISH_NORTH')) return;
  const b = D.block('WISH_NORTH');
  D.circle(b, '0', [0, 0], 600);
  const arrow = [[0, 520], [180, -360], [0, -200], [-180, -360]];
  D.hatch(b, '0', [arrow]);
  D.poly(b, '0', arrow, true);
  D.text(b, '0', 'N', [0, 820], 300, { style: 'WISH-EN' });
}

const STAIR_H = 180;

/** 看得见的柜子名字 / 尺寸放在哪：名字在中心，尺寸在下面 140（跟着家具转，字不倒） */
function itemMarks(it, X, Y) {
  const P = [X(it.x), Y(it.z)];
  const ar = uprightDeg(it.rot);
  const a = (ar * Math.PI) / 180;
  return { P, ar, below: [Math.round(P[0] + 140 * Math.sin(a)), Math.round(P[1] - 140 * Math.cos(a))] };
}

/**
 * 楼梯的走向线（从这一层看：上去的从起步走，下去的倒过来）和「上 UP / 下 DN」的位置；没有走向 → null。
 * 字先放在起步前面 260；压到别的字（小走廊的房间名、柜子的名字）→ 放进第一跑里、走向线旁边（放得下的那一边），
 * 两边都放不下就压在走向线上。
 */
function stairMark(s, X, Y, blocked = []) {
  if (!s.path?.points?.length) return null;
  const p0 = s.path.points.map((p) => [X(p.x), Y(p.y)]);
  const pts = s.role === 'up' ? p0 : [...p0].reverse();
  const clean = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  if (clean.length < 2) return null;
  const [s0, s1] = clean;
  const a0 = Math.atan2(s1[1] - s0[1], s1[0] - s0[0]);
  const u = [Math.cos(a0), Math.sin(a0)];
  const n = [-u[1], u[0]];
  const word = s.role === 'up' ? bi('上') : bi('下');
  const text = `${word.zh} ${word.en.toUpperCase()}`;
  const side = (Math.abs(n[0]) * textWidth(text, STAIR_H)) / 2 + (Math.abs(n[1]) * STAIR_H) / 2 + 80;
  const at = (along, off) => [Math.round(s0[0] + along * u[0] + off * n[0]), Math.round(s0[1] + along * u[1] + off * n[1])];
  const box = (tp) => aabb(textBox(text, tp, STAIR_H, 'mc', 0));
  const free = (tp) => !blocked.some((b) => overlap(box(tp), b));
  // 第一跑（走向线进到楼梯里 450 的那一点在哪一跑里）：旁边的字要整个在这一跑里面（字宽多留 20%，真的字体比估计宽）
  const inPt = at(450, 0);
  const fl = (s.flights || []).map((f) => ({ x0: X(f.rect.x0), x1: X(f.rect.x1), y0: Y(f.rect.y1), y1: Y(f.rect.y0) })).find((r) => inPt[0] >= r.x0 && inPt[0] <= r.x1 && inPt[1] >= r.y0 && inPt[1] <= r.y1);
  const inside = (tp) => {
    if (!fl) return false;
    const b = box(tp);
    const pad = (b.x1 - b.x0) * 0.1;
    return b.x0 - pad >= fl.x0 && b.x1 + pad <= fl.x1 && b.y0 >= fl.y0 && b.y1 <= fl.y1;
  };
  const first = at(-260, 0);
  if (free(first)) return { clean, tp: first, text };
  const tp = [at(450, side), at(450, -side), inPt].find((q) => inside(q) && free(q)) || first;
  return { clean, tp, text };
}

/** 点列的外框 { x0, y0, x1, y1 } */
const aabb = (pts) => ({ x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) });
/** 外框按中心放大（f 倍） */
const widen = (b, f) => {
  const dx = ((b.x1 - b.x0) * (f - 1)) / 2;
  const dy = ((b.y1 - b.y0) * (f - 1)) / 2;
  return { x0: b.x0 - dx, x1: b.x1 + dx, y0: b.y0 - dy, y1: b.y1 + dy };
};
/** 两个外框重叠的面积（留 30mm 的空，贴着也算） */
const overlap = (a, b, pad = 30) => {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + pad;
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + pad;
  return w > 0 && h > 0 ? w * h : 0;
};

/** 面积那一行最小的字高（1:100 出图 0.8mm）：放不下就只写面积，再放不下就不写 */
const AREA_MIN_H = 80;

/**
 * 房间名的字能有多宽（毫米）：标签在房间（轴线）中间，两边的墙不一样厚时（外墙 / 内墙、一边打通）离近的那面墙要放得下，
 * 所以是「标签中心到近的那面墙内皮」的两倍 × 0.92。
 */
function labelRoom(r) {
  if (!r.inner) return Math.round((r.net ? r.net.w : r.rect.w) * 1000 * 0.92);
  const cx = r.label[0];
  return Math.round(2 * Math.min(cx - r.inner.x0, r.inner.x1 - cx) * 1000 * 0.92);
}

/** 房间名那一叠字：中文名、英文名、净尺寸 · 面积（dy = 相对标签中心的上下位置）。short：面积那一行只写面积 */
function roomLines(r, short = false) {
  const room = labelRoom(r);
  const k = clamp(Math.sqrt(r.rect.w * r.rect.d) / 3, 0.6, 1);
  const L = [{ layer: 'A-AREA-IDEN', s: r.name.zh, dy: Math.round(260 * k), h: fitH(r.name.zh, Math.round(300 * k), room, 100) }];
  if (r.name.en && r.name.en !== r.name.zh) L.push({ layer: 'A-AREA-IDEN', s: r.name.en, dy: -Math.round(40 * k), h: fitH(r.name.en, Math.round(170 * k), room), style: 'WISH-EN' });
  if (r.net) {
    const a = r.area;
    const area = `${a.toFixed(1)} m² / ${Math.round(a * 10.7639)} sf`;
    const long = `${Math.round(r.net.w * 1000)} × ${Math.round(r.net.d * 1000)}  ·  ${area}`;
    const h0 = Math.round(150 * k);
    // 窄房间（900 宽的玄关、走廊）：整行放不下 → 只写面积；还放不下 → 不写
    for (const s of short ? [area] : [long, area]) {
      const h = Math.min(h0, Math.floor(room / textWidth(s, 1)));
      if (h >= Math.min(h0, AREA_MIN_H)) {
        L.push({ layer: 'A-AREA', s, dy: -Math.round(300 * k), h, style: 'WISH-EN' });
        break;
      }
    }
  }
  return L;
}

/**
 * 房间名那一叠字放哪：先放房间中间；压到柜子的名字 / 尺寸或楼梯的「上 / 下」→ 试房间的上三分之一、再试下三分之一
 * （整叠字留在墙里面）；还压到就再往右、往左挪（宽房间）；都压到就放压得最少的地方（一样多就中间）。
 * 返回 { c: 标签中心（DXF 毫米）, h: 还压着的面积（0 = 没压到） }。
 */
function placeLabel(r, lines, avoid, X, Y) {
  const cx = X(r.label[0]);
  const mid = Y(r.label[1]);
  if (!avoid.length) return { c: [cx, mid], h: 0 };
  const top = Math.max(...lines.map((l) => l.dy + l.h / 2));
  const bot = Math.min(...lines.map((l) => l.dy - l.h / 2));
  // 面积那一行数字多（Arial 的数字比 0.6h 宽），躲的时候按宽 20% 算
  const box = (x, y, l) => widen(aabb(textBox(l.s, [x, y + l.dy], l.h, 'mc', 0)), 1.2);
  const hit = ([x, y]) => lines.reduce((n, l) => n + avoid.reduce((m, o) => m + overlap(box(x, y, l), o), 0), 0);
  const inner = r.inner || { x0: r.rect.x, x1: r.rect.x + r.rect.w, y0: r.rect.y, y1: r.rect.y + r.rect.d };
  const hi = Y(inner.y0) - 60 - top;
  const lo = Y(inner.y1) + 60 - bot;
  const ys = [mid];
  if (lo <= hi) for (const f of [1 / 6, 5 / 6]) ys.push(Math.round(clamp(Y(r.rect.y + r.rect.d * f), lo, hi)));
  // 横着挪：整叠字还在墙里面（离墙 60）能挪多远就挪多远，右边、左边
  const half = Math.max(...lines.map((l) => (textWidth(l.s, l.h) * 1.2) / 2));
  const sR = Math.floor(X(inner.x1) - 60 - half - cx);
  const sL = Math.floor(cx - half - (X(inner.x0) + 60));
  const xs = [cx, ...(sR > 50 ? [cx + sR] : []), ...(sL > 50 ? [cx - sL] : [])];
  const cands = [...ys.map((y) => [cx, y]), ...ys.flatMap((y) => xs.slice(1).map((x) => [x, y]))];
  let best = null;
  for (const c of cands) {
    const h = hit(c);
    if (!h) return { c, h };
    if (!best || h < best.h) best = { c, h };
  }
  return best;
}

/** 一层画进 D（dx = 这一层往右挪多少毫米） */
function drawFloor(D, scene, F, dx, full) {
  const X = (x) => scene.tx(x) + dx;
  const Y = (y) => scene.ty(y);
  const R = (x0, y0, x1, y1) => ({ x0: X(Math.min(x0, x1)), x1: X(Math.max(x0, x1)), y0: Y(Math.max(y0, y1)), y1: Y(Math.min(y0, y1)) });
  const rectPts = (r) => [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];

  // ── 墙：实心墙段（端头和 house.js 一样伸出半个墙厚，转角才合得上）→ 并集 ──
  const rects = [];
  for (const w of F.walls) {
    if (isOutdoorEdge(w)) continue;
    for (const p of w.pieces) {
      if (p.kind !== 'solid') continue;
      const a = p.a - (Math.abs(p.a - w.a) < 0.01 ? w.t / 2 : 0);
      const b = p.b + (Math.abs(p.b - w.b) < 0.01 ? w.t / 2 : 0);
      rects.push(w.axis === 'x' ? R(a, w.c - w.t / 2, b, w.c + w.t / 2) : R(w.c - w.t / 2, a, w.c + w.t / 2, b));
    }
  }
  const loops = unionLoops(rects);
  for (const lp of loops) D.poly(null, 'A-WALL', lp, true);
  if (full && loops.length) {
    const outer = loops.filter((l) => area2(l) > 0);
    const holes = loops.filter((l) => area2(l) < 0);
    D.hatch(null, 'A-WALL-PATT', [...outer, ...holes], [...outer.map(() => true), ...holes.map(() => false)]);
  }

  // ── 矮墙 / 栏杆（阳台、车廊两侧 100mm 双线）、车廊临街两根 320 门柱 ──
  const low = [];
  for (const e of F.lowEdges) {
    const w = e.wall;
    if (e.kind === 'porch-street') {
      for (const at of [w.a, w.b]) low.push(w.axis === 'x' ? R(at - 0.16, w.c - 0.16, at + 0.16, w.c + 0.16) : R(w.c - 0.16, at - 0.16, w.c + 0.16, at + 0.16));
    } else low.push(w.axis === 'x' ? R(w.a - w.t / 2, w.c - 0.05, w.b + w.t / 2, w.c + 0.05) : R(w.c - 0.05, w.a - w.t / 2, w.c + 0.05, w.b + w.t / 2));
  }
  for (const lp of unionLoops(low)) D.poly(null, 'A-WALL-LOW', lp, true);

  // ── 门窗 ──
  for (const o of F.openings) {
    const w = o.wall;
    const T = Math.round(w.t * 1000);
    const A = w.axis === 'x' ? [X(o.a), Y(w.c)] : [X(w.c), Y(o.a)];
    const Bp = w.axis === 'x' ? [X(o.b), Y(w.c)] : [X(w.c), Y(o.b)];
    const len = Math.round(Math.hypot(Bp[0] - A[0], Bp[1] - A[1]));
    if (len < 1) continue;
    const u = w.axis === 'x' ? [1, 0] : [0, -1];
    const angU = w.axis === 'x' ? 0 : 270;
    const nPos = w.axis === 'x' ? [0, -1] : [1, 0];
    const n = o.swing > 0 ? nPos : [-nPos[0], -nPos[1]];
    const left = n[0] === -u[1] && n[1] === u[0]; // n = u 逆时针转 90°
    if (o.kind === 'window') D.insert(null, 'A-GLAZ', openingBlock(D, 'win', len, T), A, { rot: angU });
    else if (o.kind === 'slider') D.insert(null, 'A-DOOR-SLID', openingBlock(D, 'sld', len, T), A, { rot: angU });
    else if (o.kind === 'open') {
      if (!full) continue;
      for (const k of [-T / 2, T / 2]) {
        const off = (P) => [P[0] + nPos[0] * k, P[1] + nPos[1] * k];
        D.line(null, 'A-OPEN', off(A), off(Bp));
      }
    } else if (len > 1300) {
      D.insert(null, 'A-DOOR', openingBlock(D, 'door2', len, T), left ? A : Bp, { rot: left ? angU : (angU + 180) % 360 });
    } else {
      D.insert(null, 'A-DOOR', openingBlock(D, left ? 'doorL' : 'doorR', len, T), A, { rot: left ? angU : (angU + 180) % 360 });
    }
  }

  // ── 看得见的字先算好位置：定制柜的名字 / 尺寸 → 楼梯的「上 / 下」（躲开柜子的字和放在中间的房间名）→ 房间名（躲开前两种）──
  const avoid = [];
  if (full) {
    for (const it of F.items) {
      if (!showsName(it.cat)) continue;
      const { P, ar, below } = itemMarks(it, X, Y);
      // 柜子的字是 WISH-ZH（微软雅黑）：数字和字母比 0.6h 的估计宽，躲的时候按宽 35% 算
      avoid.push(widen(aabb(textBox(it.name.zh, P, 100, 'mc', ar)), 1.35), widen(aabb(textBox(`${it.W}x${it.D}x${it.H}`, below, 100, 'mc', ar)), 1.35));
    }
  }
  const centred = full ? F.rooms.flatMap((r) => roomLines(r).map((l) => aabb(textBox(l.s, [X(r.label[0]), Y(r.label[1]) + l.dy], l.h, 'mc', 0)))) : [];
  const marks = full ? F.stairs.map((s) => stairMark(s, X, Y, [...avoid, ...centred])) : [];
  for (const m of marks) if (m) avoid.push(aabb(textBox(m.text, m.tp, STAIR_H, 'mc', 0)));

  // ── 房间名（+ 净尺寸、面积）──
  for (const r of F.rooms) {
    if (!full) {
      const c = [X(r.label[0]), Y(r.label[1])];
      if (!r.stair && !r.void) D.text(null, 'A-AREA-IDEN', r.name.zh, c, fitH(r.name.zh, 300, labelRoom(r), 100));
      continue;
    }
    let lines = roomLines(r);
    let at = placeLabel(r, lines, avoid, X, Y);
    // 哪里都会压到字：面积那一行改短（只写面积，不写净尺寸），窄了常常就放得下
    if (at.h && r.net) {
      const l2 = roomLines(r, true);
      const at2 = placeLabel(r, l2, avoid, X, Y);
      if (at2.h < at.h) [lines, at] = [l2, at2];
    }
    for (const l of lines) D.text(null, l.layer, l.s, [at.c[0], at.c[1] + l.dy], l.h, l.style ? { style: l.style } : {});
  }
  if (!full) return;

  // ── 柜子、家具 ──
  for (const it of F.items) {
    itemBlock(D, it);
    const { P, ar, below } = itemMarks(it, X, Y);
    const v = itemAttribs(it);
    const vis = showsName(it.cat);
    D.insert(null, CAT_INFO[it.cat].layer, it.key, P, {
      rot: ((it.rot % 360) + 360) % 360,
      attribs: ATT_TAGS.map((tag) => ({ tag, value: v[tag], p: tag === 'NAME' ? P : tag === 'SIZE' ? below : P, h: tag === 'NAME' || tag === 'SIZE' ? 100 : 80, rot: ar, invisible: !(vis && (tag === 'NAME' || tag === 'SIZE')) })),
    });
  }

  // ── 楼梯：每一跑的外框 + 踏步线、平台、走向线 + 箭头、上 / 下 ──
  F.stairs.forEach((s, si) => {
    for (const fl of s.flights) {
      const rr = R(fl.rect.x0, fl.rect.y0, fl.rect.x1, fl.rect.y1);
      D.poly(null, 'A-FLOR-STRS', rectPts(rr), true);
      const vertical = fl.dir === 'N' || fl.dir === 'S';
      for (let k = 1; k <= fl.risers - 2; k++) {
        if (vertical) {
          const y = fl.dir === 'N' ? fl.rect.y1 - k * fl.tread : fl.rect.y0 + k * fl.tread;
          D.line(null, 'A-FLOR-STRS', [rr.x0, Y(y)], [rr.x1, Y(y)]);
        } else {
          const x = fl.dir === 'E' ? fl.rect.x0 + k * fl.tread : fl.rect.x1 - k * fl.tread;
          D.line(null, 'A-FLOR-STRS', [X(x), rr.y0], [X(x), rr.y1]);
        }
      }
    }
    for (const l of s.landings) D.poly(null, 'A-FLOR-STRS', rectPts(R(l.rect.x0, l.rect.y0, l.rect.x1, l.rect.y1)), true);
    const m = marks[si];
    if (!m) return;
    const { clean } = m;
    D.poly(null, 'A-FLOR-STRS', clean, false);
    const e = clean[clean.length - 1];
    const q = clean[clean.length - 2];
    const ang = Math.atan2(e[1] - q[1], e[0] - q[0]);
    for (const da of [2.7, -2.7]) D.line(null, 'A-FLOR-STRS', e, [Math.round(e[0] + 250 * Math.cos(ang + da)), Math.round(e[1] + 250 * Math.sin(ang + da))]);
    D.text(null, 'A-FLOR-STRS', m.text, m.tp, STAIR_H);
  });
  // 楼梯口 / 挑空的栏杆（50mm 双线，在楼板这一边、离洞口 5cm）
  for (const e of F.rails) {
    const k = -(e.inward || 0) * 0.05;
    for (const dk of [-0.025, 0.025]) {
      const c = e.c + k + dk;
      if (e.axis === 'x') D.line(null, 'A-FLOR-HRAL', [X(e.a), Y(c)], [X(e.b), Y(c)]);
      else D.line(null, 'A-FLOR-HRAL', [X(c), Y(e.a)], [X(c), Y(e.b)]);
    }
  }

  // ── 尺寸：下面、左边各一道轴线链 + 总尺寸 ──
  const rs = F.rooms.map((r) => r.rect);
  if (rs.length) {
    const E = R(Math.min(...rs.map((r) => r.x)) - EXT_T / 2, Math.min(...rs.map((r) => r.y)) - EXT_T / 2, Math.max(...rs.map((r) => r.x + r.w)) + EXT_T / 2, Math.max(...rs.map((r) => r.y + r.d)) + EXT_T / 2);
    const merge = (vals) => {
      const s = [...vals].sort((a, b) => a - b);
      const out = [];
      for (const v of s) if (!out.length || v - out[out.length - 1] >= 50) out.push(v);
      return out;
    };
    const xs = merge(rs.flatMap((r) => [X(r.x), X(r.x + r.w)]));
    const ys = merge(rs.flatMap((r) => [Y(r.y), Y(r.y + r.d)]));
    for (let i = 0; i < xs.length - 1; i++) D.dim('A-DIMS', [xs[i], E.y0], [xs[i + 1], E.y0], [0, E.y0 - 800], 0, 'WISH-100', { txtAlong: chainShift(xs, i) });
    D.dim('A-DIMS', [E.x0, E.y0], [E.x1, E.y0], [0, E.y0 - 1400], 0, 'WISH-100');
    for (let i = 0; i < ys.length - 1; i++) D.dim('A-DIMS', [E.x0, ys[i]], [E.x0, ys[i + 1]], [E.x0 - 800, 0], 90, 'WISH-100', { txtAlong: chainShift(ys, i) });
    D.dim('A-DIMS', [E.x0, E.y0], [E.x0, E.y1], [E.x0 - 1400, 0], 90, 'WISH-100');

    // ── 图名、方案、免责、日期、北向 ──
    const T = 'A-ANNO-TTLB';
    D.text(null, T, `${F.name.zh}  ${F.name.en.toUpperCase()}`, [E.x0, E.y0 - 2400], 450, { align: 'bl' });
    D.text(null, T, projectLine(scene), [E.x0, E.y0 - 2850], 200, { align: 'bl' });
    D.text(null, T, both(bi('概念示意 · 尺寸以现场量尺为准'), '  '), [E.x0, E.y0 - 3200], 200, { align: 'bl' });
    D.text(null, T, `${scene.now.toISOString().slice(0, 10)} · 1:100`, [E.x0, E.y0 - 3550], 200, { align: 'bl' });
    northBlock(D);
    D.insert(null, T, 'WISH_NORTH', [E.x1 + 1200, E.y1 - 600], { rot: -(scene.north || 0) });
  }
}

/**
 * 尺寸链里第 i 段的数字要不要挪：段比数字（字高 250）短 → 挪到段外。两头的段往链外挪；中间的段往长一点的邻段那边挪。
 * 返回沿尺寸线的位移（毫米，正 = 朝坐标变大的方向），不用挪 = 0。
 */
function chainShift(vals, i, txtH = 250) {
  const len = vals[i + 1] - vals[i];
  const tw = textWidth(String(Math.round(len)), txtH);
  if (len >= tw + 120) return 0;
  const away = len / 2 + tw / 2 + 80;
  const n = vals.length - 1;
  if (n === 1) return 0;
  if (i === 0) return -away;
  if (i === n - 1) return away;
  return vals[i + 2] - vals[i + 1] >= vals[i] - vals[i - 1] ? away : -away;
}

/** 图名下面那一行：方案名 · 品牌 */
const projectLine = (scene) => {
  const pn = both(scene.name, ' / ');
  return `${pn ? `${pn} · ` : ''}${BRAND.full} · ${SAIL_LINE}`;
};

/** 两层之间留多宽（毫米） */
export const floorGap = (W) => Math.max(4000, Math.round(0.25 * W));

/**
 * 平面图里相邻两层的间距（毫米）= 楼宽 + 间距；图名那几行比楼宽还长（方案名很长）时再放宽，
 * 免得这一层的字压到下一层左边的尺寸线（下一层的尺寸 + 文字往左伸约 1.7m）。
 */
export function floorStep(scene) {
  const titleW = Math.max(textWidth(projectLine(scene), 200), ...scene.floors.map((F) => textWidth(`${F.name.zh}  ${F.name.en.toUpperCase()}`, 450)), textWidth(both(bi('概念示意 · 尺寸以现场量尺为准'), '  '), 200));
  return scene.W + Math.max(floorGap(scene.W), Math.ceil(titleW - scene.W + 2000));
}

/**
 * @param {object} scene buildScene() 的结果
 * @param {'full'|'kujiale'} mode
 * @param {string} [floorId] 酷家乐：哪一层
 * @returns {Dxf}
 */
export function planDoc(scene, mode = 'full', floorId) {
  const D = planBegin(mode);
  if (mode === 'full') scene.floors.forEach((F) => planFloor(D, scene, F, mode));
  else planFloor(D, scene, scene.floors.find((f) => f.id === floorId) || scene.floors[0], mode);
  return D;
}

/** 分步画（导出面板一层一层报进度）：planBegin → 每层 planFloor → D.bytes() */
export function planBegin(mode = 'full') {
  const D = new Dxf({ text: mode === 'full' ? 'u' : KUJIALE_TEXT });
  setup(D);
  return D;
}
export function planFloor(D, scene, F, mode = 'full') {
  const full = mode === 'full';
  drawFloor(D, scene, F, full ? F.level * floorStep(scene) : 0, full);
}

/** 字节（AutoCAD 文件纯 ASCII；酷家乐文件 GBK） */
export const planDxf = (scene, mode = 'full', floorId) => planDoc(scene, mode, floorId).bytes();
