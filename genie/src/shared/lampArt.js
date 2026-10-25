// WISH 神灯 · Genie Lamp —— 原创矢量画（纯字符串，不依赖 React）。和潘吉（Direction C「Premium plush」）是一套：
// 同样柔光立体的抛光金；灯顶是和潘吉头巾胸针同一颗琥珀椭圆宝石（金色包边）；灯嘴冒出的一缕暖白烟，
// 背光面带溪水青，最后卷成和潘吉雾尾一样的螺旋 —— 一看就知道他是从这盏灯里出来的。
// 颜色：VI 色全部来自 palette.js；只有抛光金属的明暗阶写在下面的 METAL 里，其余（宝石、珐琅、烟、发光、阴影）
// 都由 PALETTE 和 METAL 用 mix() 调出来。
//
// viewBox 0 0 240 140（和旧 <Lamp/> 同一个框、差不多的占位，直接换）
//
//   lampInner({ smoke, detail, idPrefix, size, shadow }) → <svg> 里面的全部内容（<defs> + 各层），不含外层 <svg>
//       只和 (idPrefix, detail, smoke, shadow) 有关，同一组参数只生成一次（有缓存）—— 组件 useMemo 一次，
//       用 dangerouslySetInnerHTML 塞进根 <svg>，之后就不再动它。
//       smoke     false | true | 'glow'   'glow' = 整缕烟跟着 --glow 淡入（擦灯时慢慢冒出来）
//       detail    'low' | 'mid' | 'high' | 'auto'（auto = detailFor(size)；没给 size 当 mid）
//       idPrefix  每个实例唯一；非 [A-Za-z0-9_-] 的字符会被去掉（useId() 的冒号等）
//       shadow    纸面上脚下的一小片接触阴影（默认不画）
//   发光 glow 0–1 不在这里：组件在根 <svg> 上设 style="--glow: 0.6"（不设 = 0）。
//       只有覆盖层用 opacity: var(--glow)：光晕（两层，外层是 glow²，看起来会「长大」）、贴着轮廓的光、壶里透出的光、
//       盖缝漏光、宝石光、壶嘴光、星光、烟里的暖光。擦灯（LampRub 每次 pointermove 都改 glow）时只改这一个样式，
//       DOM 不重建，烟的动画也不会重来。整份标记里没有 calc()，只用 var()。
//       静态部分（含 <defs>）都包在 style="--glow:0" 的「挡板」组里：根上的 --glow 一变，样式重算到挡板就停，
//       只有十几个覆盖层节点重算（不挡的话每次要把 ~300 个节点全算一遍）。
//       嵌进别的 SVG（插画、海报）：把 lampInner() 放进 <g transform="…" style="--glow:.6"> 就行（不设 = 不发光）。
//   lampSVG({ glow, smoke, detail, idPrefix, size, shadow, title }) → 完整 <svg>（带 --glow；预览 / 静态图用）
//   iconSVG({ size, idPrefix }) → 满版方形 App 图标（暮色底、无圆角，iOS 自己切角；发光直接烤进去，不依赖 CSS 变量）
//   detailFor(px) → 'low'（< 72 px）| 'mid'（< 200 px）| 'high'
//       low  = 轮廓 + 抛光渐变 + 加粗的青瓷珐琅带 + 灯顶宝石（30 / 52 px）
//       mid  = + 顺着形体走的反光、拇指卷、珐琅带的金边和三颗小宝石、壶嘴刻线、星光（86 / 156 px）
//       high = + 叶蔓雕花框、盖沿和底座的金珠、莲瓣脚、珐琅带上的金点（280 px 擦灯）
//
// 动画只挂全局 class（关键帧在 base.css）：.lamp-smoke（烟轻轻摆）、.lamp-puff（小烟团升起）、.lamp-spark（星光闪）。
// 每个动画元素都写行内 transform-origin（viewBox 坐标，同 .pg-blink 的写法）；SVG 里没有 <style>，也不用 transform-box。

import { PALETTE } from './palette.js';

const PG = PALETTE.pangie;

// 灯自己的材质色：抛光金从镜面高光到最暗反射的明暗阶。属于这盏灯本身，不随 VI 换。
// （宝石、珐琅、烟、发光、阴影都从 PALETTE 调出来。）
const METAL = {
  spec: '#FFF7DE', // 镜面高光
  hi: '#FBE5A4',
  bright: '#F0C670',
  light: '#DDA54C',
  mid: '#C3862F',
  warm: '#B07628',
  deep: '#9C6420',
  dark: '#6A3F0E',
  night: '#57350B',
  shade: '#4A2D0A',
  line: '#5F3F15', // 轮廓线
  outline: '#3A250B',
  white: '#FFFFFF',
};

// ── helpers ─────────────────────────────────────────────────────────
const RAD = Math.PI / 180;
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const pt = (p) => `${r1(p[0])} ${r1(p[1])}`;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const cleanId = (s) => String(s ?? '').replace(/[^A-Za-z0-9_-]/g, '');
const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
/** a → b by t (hex colours) */
const mix = (a, b, t) => {
  const A = hexRGB(a);
  const B = hexRGB(b);
  return toHex(A.map((x, k) => lerp(x, B[k], t)));
};

function bez(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}
function bezD(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]),
    3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]),
  ];
}
function withArc(pts) {
  let acc = 0;
  pts[0].s = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    pts[i].s = acc;
  }
  pts.forEach((p) => (p.u = p.s / acc));
  return pts;
}
/** sample a chain of cubic segments → [{x, y, tx, ty, u}] (u = normalised arc length) */
function sample(segs, per = 10) {
  const pts = [];
  segs.forEach((s, si) => {
    for (let i = si ? 1 : 0; i <= per; i++) {
      const t = i / per;
      const [x, y] = bez(...s, t);
      const [dx, dy] = bezD(...s, t);
      const L = Math.hypot(dx, dy) || 1;
      pts.push({ x, y, tx: dx / L, ty: dy / L });
    }
  });
  return withArc(pts);
}
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
function smoothClosed(P) {
  const n = P.length;
  let d = `M${pt(mid(P[n - 1], P[0]))}`;
  for (let i = 0; i < n; i++) d += `Q${pt(P[i])} ${pt(mid(P[i], P[(i + 1) % n]))}`;
  return d + 'Z';
}
function smoothOpen(P) {
  let d = `M${pt(P[0])}`;
  for (let i = 1; i < P.length - 1; i++) d += `Q${pt(P[i])} ${pt(mid(P[i], P[i + 1]))}`;
  return d + `L${pt(P[P.length - 1])}`;
}
const poly = (P) => 'M' + P.map(pt).join('L') + 'Z';
const offP = (p, o) => [p.x - p.ty * o, p.y + p.tx * o];
/** closed ribbon between normal offsets a(u, p) and b(u, p); normal = (-ty, tx); optional round end cap */
function ribbon(pts, a, b, { capEnd = false } = {}) {
  const L = pts.map((p) => offP(p, a(p.u, p)));
  const R = pts.map((p) => offP(p, b(p.u, p)));
  const cap = [];
  if (capEnd) {
    const p = pts[pts.length - 1];
    const oa = a(1, p);
    const ob = b(1, p);
    const c = offP(p, (oa + ob) / 2);
    const rad = Math.abs(oa - ob) / 2;
    const sg = Math.sign(oa - ob) || 1;
    for (let k = 1; k < 5; k++) {
      const th = (k / 5) * Math.PI;
      const s = Math.cos(th) * sg;
      const fw = Math.sin(th);
      cap.push([c[0] - p.ty * rad * s + p.tx * rad * fw, c[1] + p.tx * rad * s + p.ty * rad * fw]);
    }
  }
  return smoothClosed([...L, ...cap, ...R.reverse()]);
}
/** smooth piecewise profile through [u, value] keys */
const prof = (keys) => (u) => {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const t = (u - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]);
      return lerp(keys[i - 1][1], keys[i][1], ease(t));
    }
  }
  return keys[keys.length - 1][1];
};
const along = (pts, u) => {
  for (let i = 1; i < pts.length; i++)
    if (pts[i].u >= u) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = (u - a.u) / (b.u - a.u || 1);
      return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
    }
  return pts[pts.length - 1];
};
const segPath = (segs) => `M${pt(segs[0][0])}` + segs.map((s) => `C${pt(s[1])} ${pt(s[2])} ${pt(s[3])}`).join('');
/** vertical cross-sections of a closed polygon: [{x, top, bot}] (denser at both ends) */
function columns(polyPts, x0, x1, n) {
  const cols = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const x = lerp(x0, x1, ease(f) * 0.35 + f * 0.65);
    let top = Infinity;
    let bot = -Infinity;
    for (let k = 0; k < polyPts.length; k++) {
      const a = polyPts[k];
      const b = polyPts[(k + 1) % polyPts.length];
      if ((a[0] <= x && b[0] > x) || (b[0] <= x && a[0] > x)) {
        const y = a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
        top = Math.min(top, y);
        bot = Math.max(bot, y);
      }
    }
    if (top < bot) cols.push({ x, top, bot });
  }
  return cols;
}
function ramp(stops, v) {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++)
    if (v <= stops[i][0]) return mix(stops[i - 1][1], stops[i][1], (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
  return stops[stops.length - 1][1];
}
/** four-point star (sparkle) */
function sparkle(x, y, r, fill, extra = '') {
  const k = r * 0.2;
  const a = k * 0.4;
  const P = (dx, dy) => `${r2(x + dx)} ${r2(y + dy)}`;
  return `<path d="M${P(0, -r)}C${P(a, -k)} ${P(k, -a)} ${P(r, 0)}C${P(k, a)} ${P(a, k)} ${P(0, r)}C${P(-a, k)} ${P(-k, a)} ${P(-r, 0)}C${P(-k, -a)} ${P(-a, -k)} ${P(0, -r)}Z" fill="${fill}"${extra}/>`;
}
const ellD = (cx, cy, rx, ry) =>
  `M${r2(cx - rx)} ${r2(cy)}A${r2(rx)} ${r2(ry)} 0 1 1 ${r2(cx + rx)} ${r2(cy)}A${r2(rx)} ${r2(ry)} 0 1 1 ${r2(cx - rx)} ${r2(cy)}Z`;

// ── master geometry (viewBox 0 0 240 140) ───────────────────────────
const AX = 107; // 盖子和底座共用的车床轴

// 壶身 + 壶嘴：一整颗水滴
const BODY_SEGS = [
  [[88, 62.6], [70, 62.2], [52.6, 70], [50.4, 85.6]],
  [[50.4, 85.6], [48.6, 99], [62, 111], [89, 112.2]],
  [[89, 112.2], [114, 113.2], [133, 107.6], [149, 98.8]],
  [[149, 98.8], [168, 88], [190, 66], [207.4, 52.4]],
  [[207.4, 52.4], [212.6, 48.4], [217.4, 46.2], [221.6, 45]],
  [[221.6, 45], [224.2, 44.3], [226.2, 43.3], [227.2, 41.8]],
  [[227.2, 41.8], [227.8, 40.6], [226.8, 39.6], [224.9, 39.7]],
  [[224.9, 39.7], [220, 40.2], [214.6, 42.4], [209, 45.8]],
  [[209, 45.8], [195, 54.4], [180, 63.4], [163, 67.4]],
  [[163, 67.4], [152, 69.8], [140, 67.2], [126, 62.8]],
  [[126, 62.8], [120, 60.6], [94, 60.6], [88, 62.6]],
];
const BODY = segPath(BODY_SEGS) + 'Z';
const BODY_COLS = columns(sample(BODY_SEGS, 24).map((p) => [p.x, p.y]), 48.7, 227.2, 34);

// 卷草把手：从肩上往后、往下，卷回壶身
const HANDLE = [
  [[74, 66], [63, 57], [47, 53.4], [35.4, 58]],
  [[35.4, 58], [22.6, 63], [19.6, 82], [30.4, 91.4]],
  [[30.4, 91.4], [36.6, 96.8], [46, 97.6], [49.8, 92.6]],
  [[49.8, 92.6], [52.2, 89.2], [48.4, 85.6], [45, 87.6]],
  [[45, 87.6], [42.8, 89], [43.6, 92], [45.8, 91.4]],
];
/** 拇指卷：从把手里升起，再顺时针卷向壶身 */
function thumbScroll() {
  const lead = sample([[[59.6, 59.2], [55.4, 56.6], [50.2, 54.3], [47.7, 51.5]]], 6).map(({ x, y, tx, ty }) => ({ x, y, tx, ty }));
  const c = [50.7, 48.4];
  const r0 = 4.35;
  const a0 = 135 * RAD;
  const span = 330 * RAD;
  const n = 16;
  const sp = [];
  for (let i = 1; i <= n; i++) {
    const f = i / n;
    const a = a0 + f * span;
    const r = r0 * (1 - 0.52 * f);
    const dr = (-0.52 * r0) / span;
    const dx = dr * Math.cos(a) - r * Math.sin(a);
    const dy = dr * Math.sin(a) + r * Math.cos(a);
    const L = Math.hypot(dx, dy);
    sp.push({ x: c[0] + r * Math.cos(a), y: c[1] + r * Math.sin(a), tx: dx / L, ty: dy / L });
  }
  return withArc([...lead, ...sp]);
}
// 青瓷珐琅带（比壶身长，靠 clip 切齐）
const BELT = [[[46, 86.2], [70, 96.6], [120, 100.2], [160, 94.6]]];

// 烟：从壶嘴升起、轻轻一摆，最后卷成潘吉雾尾的那个螺旋。螺旋部分照抄 pangieArt.js 的 MIST_SPIRAL：
// 逆时针转 330°，半径线性收到 r0·(1 − 0.74)，带宽按 w0 → w1（t^0.8）收细 —— 只是整体缩到 r0 = 11.2，
// 入口转到圆的最右边（烟是竖着升上来的；潘吉的尾巴是横着甩出去的）。
const SPIRAL = { r0: 15, turn: 330, decay: 0.74, w0: 15, w1: 2.4, lead: 18, curl: 46 }; // = MIST_SPIRAL（潘吉 200×250 坐标）
const SMOKE = { mouth: [225.3, 39.4], c: [208.4, 18.8], r0: 11.2 };
function smokeLine() {
  const { mouth, c, r0 } = SMOKE;
  const { turn, decay: k, curl: N } = SPIRAL;
  const s = r0 / SPIRAL.r0; // 潘吉尺寸 → 灯的尺寸
  const span = turn * RAD;
  // 潘吉雾尾在螺旋各处的带宽（t 是整条尾巴上的位置：引线占 lead/(lead+curl)）
  const tA = SPIRAL.lead / (SPIRAL.lead + SPIRAL.curl);
  const wTail = (f) => (SPIRAL.w0 - (SPIRAL.w0 - SPIRAL.w1) * Math.pow(tA + (1 - tA) * f, 0.8)) * s;
  // 螺旋起点在圆的最右边，往上走；引线的末端切线和它对齐（G1 连续）
  const entry = [c[0] + r0, c[1]];
  const t0 = [-k * r0, -r0 * span];
  const tl = Math.hypot(...t0);
  const P2 = [entry[0] - (t0[0] / tl) * 9.5, entry[1] - (t0[1] / tl) * 9.5];
  const nL = 14;
  const lead = sample([[mouth, [227.2, 33.4], P2, entry]], nL).map(({ x, y, tx, ty }, i) => ({ x, y, tx, ty, w: lerp(1.5, wTail(0), Math.pow(i / nL, 1.35)), curl: 0 }));
  const sp = [];
  for (let i = 1; i <= N; i++) {
    const f = i / N;
    const a = -span * f;
    const r = r0 * (1 - k * f);
    const dx = -k * r0 * Math.cos(a) + r * Math.sin(a) * span;
    const dy = -k * r0 * Math.sin(a) - r * Math.cos(a) * span;
    const L = Math.hypot(dx, dy);
    sp.push({ x: c[0] + r * Math.cos(a), y: c[1] + r * Math.sin(a), tx: dx / L, ty: dy / L, w: wTail(f), curl: f });
  }
  return withArc([...lead, ...sp]);
}
const SMOKE_PTS = smokeLine();

// 盖子 / 底座 / 宝石的粗轮廓（贴着轮廓的光用）
const SIL_LID = `M${AX - 19.6} 63.4L${AX - 18.6} 59.6C${AX - 17} 53 ${AX - 12} 49 ${AX - 6.4} 47.4C${AX - 3.6} 46.5 ${AX - 2.4} 45 ${AX - 2} 42L${AX + 2} 42C${AX + 2.4} 45 ${AX + 3.6} 46.5 ${AX + 6.4} 47.4C${AX + 12} 49 ${AX + 17} 53 ${AX + 18.6} 59.6L${AX + 19.6} 63.4C${AX + 19.6} 65.2 ${AX + 10.6} 66.6 ${AX} 66.6C${AX - 10.6} 66.6 ${AX - 19.6} 65.2 ${AX - 19.6} 63.4Z`;
const SIL_FOOT = `M${AX - 4.6} 108.6L${AX + 4.6} 108.6L${AX + 8.4} 114.3C${AX + 12} 121 ${AX + 20} 122.6 ${AX + 26.4} 124.4L${AX + 26.6} 127.6C${AX + 26.6} 129.8 ${AX + 14.6} 131.2 ${AX} 131.2C${AX - 14.6} 131.2 ${AX - 26.6} 129.8 ${AX - 26.6} 127.6L${AX - 26.4} 124.4C${AX - 20} 122.6 ${AX - 12} 121 ${AX - 8.4} 114.3Z`;

// 灯顶宝石 = 潘吉头巾上的胸针（pangieArt.js：包边 7.4×9.2、内沿 5.9×7.7、宝石 5.1×6.8 下移 .2），按 0.75 缩小
const GEM = { cx: AX, cy: 34.2, s: 0.75 };
const SIL_GEM = ellD(GEM.cx, GEM.cy, 7.4 * GEM.s + 0.6, 9.2 * GEM.s + 0.6);

// 抛光金在壶身上的反射（0 = 上沿，1 = 下沿）：天光 → 地平线 → 地面反光
const M = METAL;
const BODY_RAMP = [
  [0.0, M.spec], [0.07, M.hi], [0.2, M.bright], [0.34, M.light], [0.44, M.mid],
  [0.5, M.deep], [0.545, M.dark], [0.62, M.night], [0.72, mix(M.dark, M.warm, 0.25)], [0.82, M.warm],
  [0.9, M.light], [0.955, mix(M.bright, M.light, 0.15)], [1, mix(M.warm, M.mid, 0.3)],
];
const BAND_EDGES = [-0.25, 0.05, 0.13, 0.22, 0.31, 0.4, 0.47, 0.515, 0.56, 0.62, 0.69, 0.77, 0.84, 0.9, 0.95, 1.25];
const BODY_BANDS = (() => {
  const out = [];
  for (let k = 0; k < BAND_EDGES.length - 1; k++) {
    const v0 = BAND_EDGES[k];
    const v1 = BAND_EDGES[k + 1] + (k < BAND_EDGES.length - 2 ? 0.012 : 0);
    const vm = clamp01((Math.max(BAND_EDGES[k], 0) + Math.min(BAND_EDGES[k + 1], 1)) / 2);
    const A = BODY_COLS.map((c) => [c.x, lerp(c.top, c.bot, v0)]);
    const B = BODY_COLS.map((c) => [c.x, lerp(c.top, c.bot, v1)]).reverse();
    out.push(`<path d="${poly([...A, ...B])}" fill="${ramp(BODY_RAMP, vm)}"/>`);
  }
  return out.join('');
})();

// ── build（静态标记，前缀先用占位符，按实例替换）─────────────────────
const TOKEN = '§';

function build({ smoke, detail, shadow, bake }) {
  const id = (s) => `${TOKEN}-${s}`;
  const url = (s) => `url(#${id(s)})`;
  const low = detail === 'low';
  const high = detail === 'high';
  const live = bake == null; // live = 覆盖层读 --glow；否则把发光烤成固定的不透明度（图标）
  const ow = low ? 2.2 : high ? 0.85 : 1.1; // 轮廓线宽（小图更粗）
  const OUT = url('edge');
  const CARD = PALETTE.card;
  const S = [];
  const D = [];

  /** 覆盖层（字符串）：不透明度 = glow ^ pow —— 嵌套的 var(--glow) 组相乘，不用 calc() */
  const ovs = (inner, pow = 1, attrs = '') => {
    if (!live) return bake > 0 ? `<g opacity="${r2(bake ** pow)}"${attrs}>${inner}</g>` : '';
    let s = inner;
    for (let i = 0; i < pow; i++) s = `<g${i === pow - 1 ? attrs : ''} style="opacity:var(--glow,0)">${s}</g>`;
    return s;
  };
  /** 覆盖层（列表项）：live 时打上标记 {o}，compose() 不会把它包进挡板 */
  const ov = (inner, pow = 1, attrs = '') => (live ? { o: ovs(inner, pow, attrs) } : ovs(inner, pow, attrs));
  /**
   * 拼起来：连续的静态片段包进一个 style="--glow:0" 的挡板组。擦灯时根上的 --glow 一变，样式重算走到挡板
   * 就停（挡板自己的值没变，下面整棵子树不用再算）；只有覆盖层那十几个节点会重算。
   */
  const compose = (list) => {
    let out = '';
    let run = '';
    const flush = () => {
      if (run) out += live ? `<g style="--glow:0">${run}</g>` : run;
      run = '';
    };
    for (const x of list) {
      if (!x) continue;
      if (typeof x === 'string') run += x;
      else {
        flush();
        out += x.o;
      }
    }
    flush();
    return out;
  };
  /** 动画 class + 行内 transform-origin（viewBox 坐标） */
  const anim = (cls, ox, oy, more = '') => (live ? ` class="${cls}" style="transform-origin:${r2(ox)}px ${r2(oy)}px${more}"` : '');
  const stops = (arr) => arr.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a == null ? '' : ` stop-opacity="${a}"`}/>`).join('');
  const lin = (name, y1, y2, arr) => `<linearGradient id="${id(name)}" gradientUnits="userSpaceOnUse" x1="0" y1="${y1}" x2="0" y2="${y2}">${stops(arr)}</linearGradient>`;
  const rad = (name, attrs, arr) => `<radialGradient id="${id(name)}"${attrs ? ' ' + attrs : ''}>${stops(arr)}</radialGradient>`;
  const ENG_D = M.shade;
  const ENG_L = mix(M.spec, M.hi, 0.35);
  const engr = (d, w = 0.55, o = 0.6) =>
    `<path d="${d}" fill="none" stroke="${ENG_D}" stroke-opacity="${o}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${ENG_L}" stroke-opacity="${r2(o * 0.85)}" stroke-width="${r2(w * 0.7)}" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 ${r2(w * 0.85)})"/>`;
  const HI = mix(M.spec, CARD, 0.5); // 最亮的高光
  const GEM_HI = mix(PALETTE.amber, CARD, 0.66);

  D.push(
    lin('edge', 24, 132, [[0, mix(M.deep, PALETTE.goldInk, 0.45)], [0.5, M.line], [1, M.outline]]),
    lin('flat', 58, 113, [[0, mix(M.spec, M.hi, 0.3)], [0.22, mix(M.hi, M.bright, 0.6)], [0.46, mix(M.mid, M.light, 0.3)], [0.56, mix(M.dark, M.deep, 0.4)], [0.72, mix(M.deep, M.dark, 0.35)], [0.9, mix(M.light, M.bright, 0.25)], [1, mix(M.warm, M.deep, 0.25)]]),
    lin('rod', 44, 99, [[0, mix(M.hi, M.bright, 0.45)], [0.5, mix(M.mid, M.light, 0.3)], [1, mix(M.deep, M.dark, 0.4)]]),
    lin('lid', 43, 62, [[0, M.spec], [0.26, mix(M.hi, M.bright, 0.5)], [0.5, mix(M.light, M.mid, 0.35)], [0.66, mix(M.dark, M.deep, 0.35)], [0.82, mix(M.deep, M.warm, 0.3)], [1, mix(M.light, M.bright, 0.3)]]),
    lin('collar', 59, 67, [[0, mix(M.hi, M.spec, 0.2)], [0.4, mix(M.mid, M.light, 0.3)], [0.75, mix(M.dark, M.deep, 0.3)], [1, M.warm]]),
    lin('ledge', 56.6, 62.6, [[0, M.deep], [1, mix(M.spec, M.hi, 0.5)]]),
    lin('foot', 114, 127, [[0, mix(M.night, M.shade, 0.6)], [0.3, mix(M.deep, M.dark, 0.2)], [0.6, mix(M.hi, M.bright, 0.5)], [0.78, mix(M.mid, M.light, 0.3)], [1, mix(M.dark, M.warm, 0.3)]]),
    lin('base', 126, 131.4, [[0, mix(M.hi, M.spec, 0.2)], [0.45, mix(M.mid, M.light, 0.25)], [1, M.dark]]),
    lin('knop', 111.8, 116.8, [[0, mix(M.hi, M.spec, 0.15)], [0.45, mix(M.mid, M.light, 0.4)], [0.8, mix(M.dark, M.deep, 0.3)], [1, M.warm]]),
    lin('baseTop', 121, 128, [[0, mix(M.deep, M.dark, 0.3)], [1, mix(M.hi, M.bright, 0.3)]]),
    // 琥珀宝石 + 金包边：和潘吉头巾胸针同一套渐变（全部由 VI 色调出）
    rad('gem', 'cx=".38" cy=".3" r=".78"', [[0, GEM_HI], [0.34, mix(PALETTE.amber, PALETTE.goldL, 0.28)], [0.8, PALETTE.amber], [1, mix(PALETTE.amber, PALETTE.ink, 0.42)]]),
    `<linearGradient id="${id('bezel')}" x1="0" y1="0" x2="1" y2="1">${stops([[0, mix(PALETTE.goldL, CARD, 0.6)], [0.38, mix(PALETTE.goldL, PALETTE.gold, 0.5)], [0.72, PALETTE.gold], [1, PALETTE.goldInk]])}</linearGradient>`,
    rad('gemM', 'cx=".36" cy=".36" r=".75"', [[0, mix(PALETTE.accent, CARD, 0.8)], [0.35, mix(PALETTE.accent, CARD, 0.32)], [0.75, PALETTE.accent], [1, mix(PALETTE.accent, PALETTE.ink, 0.55)]]),
    // 发光（覆盖层用）
    rad('haloA', '', [[0, HI, 0.9], [0.22, M.hi, 0.62], [0.5, M.bright, 0.24], [0.76, M.light, 0.07], [1, M.light, 0]]),
    rad('haloB', '', [[0, M.hi, 0.42], [0.3, M.bright, 0.28], [0.6, M.light, 0.1], [0.82, M.light, 0.03], [1, M.light, 0]]),
    `<filter id="${id('aura')}" x="0" y="0" width="240" height="140" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="${low ? 3 : 4.6}"/></filter>`,
    `<radialGradient id="${id('inner')}" gradientUnits="userSpaceOnUse" cx="100" cy="84" r="60" gradientTransform="translate(100 84) scale(1 .55) translate(-100 -84)">${stops([[0, mix(M.spec, M.hi, 0.4), 0.75], [1, M.hi, 0]])}</radialGradient>`,
    rad('spot', '', [[0, mix(M.spec, CARD, 0.3)], [0.35, mix(M.hi, M.bright, 0.5), 0.55], [1, mix(M.bright, M.light, 0.4), 0]]),
    `<path id="${id('B')}" d="${BODY}"/>`,
    `<clipPath id="${id('bclip')}"><use href="#${id('B')}"/></clipPath>`
  );
  const useB = (attrs) => `<use href="#${id('B')}" ${attrs}/>`;
  if (shadow)
    D.push(`<radialGradient id="${id('shadow')}" gradientUnits="userSpaceOnUse" cx="${AX}" cy="131" r="40" gradientTransform="translate(${AX} 131) scale(1 .13) translate(-${AX} -131)">${stops([[0, PALETTE.ink, 0.36], [0.55, PALETTE.ink, 0.13], [1, PALETTE.ink, 0]])}</radialGradient>`);
  if (!low) D.push(`<filter id="${id('soft')}" x="40" y="30" width="200" height="95" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="${high ? 0.9 : 0.75}"/></filter>`);

  // 把手的几何（光晕也要用）
  const hPts = sample(HANDLE, low ? 6 : 8);
  const hw = prof(low ? [[0, 5.6], [0.25, 4.9], [0.7, 4.4], [0.86, 3.4], [1, 2.4]] : [[0, 4.4], [0.24, 3.5], [0.66, 3.1], [0.85, 2.3], [1, 1.4]]);
  const handle = ribbon(hPts, (u) => hw(u), (u) => -hw(u), { capEnd: true });
  const ndl = (p) => p.ty * 0.55 - p.tx * 0.83; // 法线 · 光（光从左上来）
  D.push(`<path id="${id('H')}" d="${handle}"/>`, `<clipPath id="${id('hclip')}"><use href="#${id('H')}"/></clipPath>`);
  const useH = (attrs) => `<use href="#${id('H')}" ${attrs}/>`;

  // ── 身后的光：两层光晕（外层 = glow²，像在长大）+ 贴着轮廓的光
  S.push(ov(`<ellipse cx="120" cy="80" rx="84" ry="52" fill="${url('haloA')}"/>` + ovs(`<ellipse cx="120" cy="80" rx="114" ry="68" fill="${url('haloB')}"/>`)));
  const aura = useB('') + useH('') + [SIL_LID, SIL_FOOT, SIL_GEM].map((d) => `<path d="${d}"/>`).join('');
  S.push(ov(`<g filter="${url('aura')}" fill="${mix(M.hi, M.bright, 0.6)}" fill-opacity=".85">${aura}</g>`));
  if (shadow) S.push(`<ellipse cx="${AX}" cy="131.2" rx="40" ry="5.2" fill="${url('shadow')}"/>`);

  // ── 拇指卷（在把手后面，根部藏进把手里）
  if (!low) {
    const sc = thumbScroll();
    const tw = prof([[0, 2.5], [0.3, 2.05], [0.7, 1.45], [1, 0.95]]);
    const scroll = ribbon(sc, (u) => tw(u), (u) => -tw(u), { capEnd: true });
    D.push(`<path id="${id('T')}" d="${scroll}"/>`, `<clipPath id="${id('tclip')}"><use href="#${id('T')}"/></clipPath>`);
    S.push(
      `<use href="#${id('T')}" fill="${url('rod')}"/>`,
      `<g clip-path="${url('tclip')}"><path d="${ribbon(sc, (u, p) => tw(u) * (0.6 * ndl(p) + 0.3), (u, p) => tw(u) * (0.6 * ndl(p) - 0.1))}" fill="${HI}" opacity=".9"/>`,
      `<path d="${ribbon(sc, (u, p) => -tw(u) * (0.2 + 0.7 * ndl(p)), (u) => -tw(u) * 1.6)}" fill="${M.shade}" opacity=".4"/></g>`,
      `<use href="#${id('T')}" fill="none" stroke="${OUT}" stroke-width="${r2(ow * 0.9)}" stroke-linejoin="round"/>`
    );
  }

  // ── 把手：抛光的金属棒（里侧暗，受光侧一道利落的高光）
  S.push(useH(`fill="${url('rod')}"`), `<g clip-path="${url('hclip')}">`);
  (low ? [[0.25, 0.5]] : [[0.12, 0.38], [0.45, 0.36]]).forEach(([k, o]) =>
    S.push(`<path d="${ribbon(hPts, (u, p) => -hw(u) * (k + 0.7 * ndl(p)), (u) => -hw(u) * 1.6)}" fill="${M.shade}" opacity="${o}"/>`)
  );
  if (!low) S.push(`<path d="${ribbon(hPts, (u, p) => hw(u) * (0.6 * ndl(p) + 0.36), (u, p) => hw(u) * (0.6 * ndl(p) - 0.14))}" fill="${mix(M.hi, M.spec, 0.3)}" opacity=".55"/>`);
  S.push(
    `<path d="${ribbon(hPts, (u, p) => hw(u) * (0.6 * ndl(p) + 0.24), (u, p) => hw(u) * (0.6 * ndl(p) - 0.02))}" fill="${HI}" opacity=".95"/>`,
    `</g>`,
    useH(`fill="none" stroke="${OUT}" stroke-width="${ow}" stroke-linejoin="round"`)
  );

  // ── 底座：底板、莲瓣裙、圆节、颈
  const fx = AX;
  S.push(
    `<path d="M${fx - 26.4} 124.4C${fx - 26.4} 126.4 ${fx - 14.4} 127.8 ${fx} 127.8C${fx + 14.4} 127.8 ${fx + 26.4} 126.4 ${fx + 26.4} 124.4L${fx + 26.6} 127.6C${fx + 26.6} 129.8 ${fx + 14.6} 131.2 ${fx} 131.2C${fx - 14.6} 131.2 ${fx - 26.6} 129.8 ${fx - 26.6} 127.6Z" fill="${url('base')}" stroke="${OUT}" stroke-width="${ow}" stroke-linejoin="round"/>`,
    `<ellipse cx="${fx}" cy="124.4" rx="26.4" ry="3.4" fill="${url('baseTop')}" stroke="${OUT}" stroke-width="${ow}"/>`,
    `<path d="M${fx - 5.4} 116C${fx - 6} 119.4 ${fx - 12} 122.2 ${fx - 21.4} 123.6C${fx - 21.4} 125.2 ${fx - 11.6} 126.5 ${fx} 126.5C${fx + 11.6} 126.5 ${fx + 21.4} 125.2 ${fx + 21.4} 123.6C${fx + 12} 122.2 ${fx + 6} 119.4 ${fx + 5.4} 116Z" fill="${url('foot')}" stroke="${OUT}" stroke-width="${ow}" stroke-linejoin="round"/>`
  );
  if (!low)
    S.push(
      `<path d="M${fx - 9} 120.4C${fx - 12} 121.8 ${fx - 15.6} 122.6 ${fx - 18.6} 123.1" fill="none" stroke="${HI}" stroke-width=".8" opacity=".75" stroke-linecap="round"/>`,
      engr(`M${fx - 17.2} 123.6C${fx - 10} 125.4 ${fx + 10} 125.4 ${fx + 17.2} 123.6`, 0.5, 0.55)
    );
  const BEAD = mix(M.spec, M.hi, 0.35);
  if (high) {
    let petals = '';
    for (let i = -4; i <= 4; i++) {
      const t = i / 4.6;
      const x = fx + t * 15.6;
      const y = 123.6 + (1 - t * t) * 1.5;
      const w = 1.7 * (1 - Math.abs(t) * 0.35);
      petals += `M${r1(x - w)} ${r1(y)}C${r1(x - w)} ${r1(y - 2.2)} ${r1(x)} ${r1(y - 3)} ${r1(x)} ${r1(y - 3)}C${r1(x)} ${r1(y - 3)} ${r1(x + w)} ${r1(y - 2.2)} ${r1(x + w)} ${r1(y)}`;
    }
    S.push(engr(petals, 0.4, 0.5));
    let beads = '';
    for (let i = -7; i <= 7; i++) {
      const t = i / 7.6;
      beads += `<circle cx="${r1(fx + t * 25)}" cy="${r1(129.5 + (1 - t * t) * 1.3)}" r=".55" opacity="${r2(0.55 + 0.4 * (1 - Math.abs(t)))}"/>`;
    }
    S.push(`<g fill="${BEAD}">${beads}</g>`);
  }
  S.push(
    `<path d="M${fx - 4.6} 108.6C${fx - 4.2} 110.6 ${fx - 3.6} 111.8 ${fx - 3.4} 113L${fx + 3.4} 113C${fx + 3.6} 111.8 ${fx + 4.2} 110.6 ${fx + 4.6} 108.6Z" fill="${mix(M.dark, M.night, 0.5)}" stroke="${OUT}" stroke-width="${ow}" stroke-linejoin="round"/>`,
    `<ellipse cx="${fx}" cy="114.3" rx="8.4" ry="2.5" fill="${url('knop')}" stroke="${OUT}" stroke-width="${ow}"/>`
  );
  if (!low) S.push(`<path d="M${fx - 6.2} 113.3C${fx - 3} 112.5 ${fx + 1} 112.5 ${fx + 3.6} 112.9" fill="none" stroke="${HI}" stroke-width=".8" stroke-linecap="round" opacity=".85"/>`);

  // ── 壶身：顺着形体走的抛光反射（上下轮廓之间的一条条色带，轻微柔化）
  if (low) S.push(useB(`fill="${url('flat')}"`));
  else S.push(`<g clip-path="${url('bclip')}">${useB(`fill="${mix(M.warm, M.mid, 0.3)}"`)}<g filter="${url('soft')}">${BODY_BANDS}</g></g>`);
  S.push(
    `<g clip-path="${url('bclip')}">`,
    `<path d="M44 60C56 64 58 104 44 116Z" fill="${M.outline}" opacity=".22"/>`, // 背面转过去
    `<ellipse cx="96" cy="116" rx="40" ry="7" fill="${url('spot')}" opacity=".45"/>`, // 壶底的暖反光
    `</g>`,
    ov(`<ellipse cx="100" cy="84" rx="64" ry="34" fill="${url('inner')}" opacity=".55"/>`, 1, ` clip-path="${url('bclip')}"`), // 从里面透出来的光
    `<g clip-path="${url('bclip')}">`,
    `<path d="M55.4 82.6C56.6 73.8 65.8 67.6 80.6 66.2C69.8 69.8 62.4 75.2 59.2 84C58.4 86.2 55 85.4 55.4 82.6Z" fill="${mix(M.spec, CARD, 0.6)}" opacity=".96"/>`, // 月牙高光
    `<ellipse cx="70.4" cy="71.6" rx="5.6" ry="2.1" fill="${url('spot')}" transform="rotate(-24 70.4 71.6)"/>`,
    `<path d="M150 67.6C164 67.2 178 62.6 192 55.6C200 51.4 206 47.6 212 44.2" fill="none" stroke="${mix(M.spec, CARD, 0.3)}" stroke-width="${low ? 1.6 : 1.1}" stroke-linecap="round" opacity=".8"/>`, // 壶嘴上沿的光
    `</g>`
  );

  // ── 青瓷珐琅带（小图加粗，品牌色在 30–52 px 也看得见）+ 三颗金镶小宝石
  const beltPts = sample(BELT, 14);
  const bw = low ? 4 : high ? 2.2 : 2.7; // 半宽（旧版 2.3 / 1.6）
  const ENAMEL_L = mix(PG.ball[2], CARD, 0.25);
  const ENAMEL_D = mix(PG.ball[3], PALETTE.accent, 0.45);
  const rib = (a, b) => ribbon(beltPts, () => a, () => b);
  S.push(`<g clip-path="${url('bclip')}">`, `<path d="${rib(bw + (low ? 1.1 : 1.25), -bw - (low ? 1.1 : 1.25))}" fill="${mix(M.line, M.dark, 0.3)}" opacity="${low ? 0.45 : 0.35}"/>`);
  if (!low)
    S.push(
      `<path d="${smoothOpen(beltPts.map((p) => offP(p, bw + 0.7)))}" fill="none" stroke="${mix(M.hi, M.bright, 0.4)}" stroke-width=".9" opacity=".9"/>`,
      `<path d="${smoothOpen(beltPts.map((p) => offP(p, -bw - 0.7)))}" fill="none" stroke="${M.hi}" stroke-width=".9" opacity=".95"/>`
    );
  S.push(
    `<path d="${rib(bw, -bw)}" fill="${PALETTE.stream}"/>`,
    `<path d="${rib(-bw * 0.3, -bw)}" fill="${ENAMEL_L}" opacity=".85"/>`, // 上缘受光
    `<path d="${rib(bw, bw * 0.35)}" fill="${ENAMEL_D}" opacity=".7"/>` // 下缘背光
  );
  if (!low) S.push(`<path d="${smoothOpen(beltPts.map((p) => offP(p, -bw + 0.55)))}" fill="none" stroke="${mix(PG.ball[1], CARD, 0.4)}" stroke-width=".5" opacity=".8"/>`);
  if (high) {
    S.push(engr(smoothOpen(beltPts.map((p) => offP(p, bw + 2.1))), 0.4, 0.45), engr(smoothOpen(beltPts.map((p) => offP(p, -bw - 2.1))), 0.4, 0.45));
    // 珐琅上的一行金点（掐丝）
    let dots = '';
    for (let u = 0.06; u < 0.9; u += 0.045) {
      if ([0.27, 0.45, 0.63].some((g) => Math.abs(u - g) < 0.04)) continue;
      const q = along(beltPts, u);
      dots += `<circle cx="${r1(q.x)}" cy="${r1(q.y)}" r=".5"/>`;
    }
    S.push(`<g fill="${mix(M.hi, M.bright, 0.3)}" opacity=".9">${dots}</g>`);
  }
  S.push(`</g>`);
  if (!low)
    [[0.27, 'gemM', 1.75], [0.45, 'gem', 2.2], [0.63, 'gemM', 1.75]].forEach(([u, gid, r]) => {
      const q = along(beltPts, u);
      S.push(
        `<circle cx="${r1(q.x)}" cy="${r1(q.y)}" r="${r2(r + 0.8)}" fill="${url('bezel')}" stroke="${M.line}" stroke-width=".45"/>`,
        `<circle cx="${r1(q.x)}" cy="${r1(q.y)}" r="${r}" fill="${url(gid)}"/>`,
        `<circle cx="${r2(q.x - r * 0.32)}" cy="${r2(q.y - r * 0.36)}" r="${r2(r * 0.3)}" fill="${M.white}" opacity=".92"/>`
      );
    });

  // ── 叶蔓雕花框（只在大图）
  if (high) {
    const cx = 103;
    const cy = 80.6;
    const X = (dx) => r1(cx + dx);
    const Y = (dy) => r1(cy + dy);
    let f = `M${X(-19)} ${Y(0)}C${X(-12)} ${Y(-7.6)} ${X(12)} ${Y(-7.6)} ${X(19)} ${Y(0)}C${X(12)} ${Y(7.6)} ${X(-12)} ${Y(7.6)} ${X(-19)} ${Y(0)}Z`;
    f += `M${X(-16.4)} ${Y(0)}C${X(-10.4)} ${Y(-5.9)} ${X(10.4)} ${Y(-5.9)} ${X(16.4)} ${Y(0)}C${X(10.4)} ${Y(5.9)} ${X(-10.4)} ${Y(5.9)} ${X(-16.4)} ${Y(0)}Z`;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      f += `M${X(0)} ${Y(0)}Q${X(Math.cos(a - 0.5) * 3.2)} ${Y(Math.sin(a - 0.5) * 2.8)} ${X(Math.cos(a) * 2.6)} ${Y(Math.sin(a) * 2.2)}Q${X(Math.cos(a + 0.5) * 3.2)} ${Y(Math.sin(a + 0.5) * 2.8)} ${X(0)} ${Y(0)}`;
    }
    [-1, 1].forEach((s) => {
      const x = (d) => X(s * d);
      f += `M${x(3.6)} ${Y(0.4)}C${x(6.6)} ${Y(3.4)} ${x(10)} ${Y(-2.8)} ${x(13.2)} ${Y(-0.2)}C${x(14.4)} ${Y(0.8)} ${x(13.6)} ${Y(2.2)} ${x(12.4)} ${Y(1.6)}`;
      f += `M${x(7)} ${Y(0.6)}C${x(7.4)} ${Y(-2.4)} ${x(9.4)} ${Y(-3.6)} ${x(10.4)} ${Y(-3.8)}C${x(9.8)} ${Y(-2.4)} ${x(8.8)} ${Y(-0.6)} ${x(7)} ${Y(0.6)}Z`;
      f += `M${x(9.6)} ${Y(1.4)}C${x(10.8)} ${Y(3.4)} ${x(9.6)} ${Y(4.4)} ${x(8.6)} ${Y(4.6)}C${x(8.6)} ${Y(3.4)} ${x(9)} ${Y(2.2)} ${x(9.6)} ${Y(1.4)}Z`;
      f += `M${x(19)} ${Y(0)}C${x(24)} ${Y(-1.6)} ${x(28)} ${Y(-5.6)} ${x(33.6)} ${Y(-4.6)}C${x(37.2)} ${Y(-4)} ${x(37.4)} ${Y(-0.6)} ${x(35)} ${Y(-0.4)}C${x(33.4)} ${Y(-0.4)} ${x(33.2)} ${Y(-2.2)} ${x(34.4)} ${Y(-2.6)}`;
      f += `M${x(24.6)} ${Y(-2.4)}C${x(25.4)} ${Y(1.2)} ${x(28)} ${Y(2.6)} ${x(30.4)} ${Y(2.6)}C${x(29.4)} ${Y(0.4)} ${x(27.4)} ${Y(-1.6)} ${x(24.6)} ${Y(-2.4)}Z`;
      f += `M${x(28.8)} ${Y(-4.8)}C${x(28.4)} ${Y(-7.6)} ${x(30.4)} ${Y(-9.2)} ${x(32.4)} ${Y(-9.6)}C${x(32.2)} ${Y(-7.4)} ${x(31)} ${Y(-5.8)} ${x(28.8)} ${Y(-4.8)}Z`;
    });
    S.push(`<g clip-path="${url('bclip')}">${engr(f, 0.45, 0.62)}</g>`);
  }

  // 壶嘴口的两道刻线
  if (!low) {
    const ring = (x) => {
      const c = BODY_COLS.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
      return `M${r1(c.x - 0.3)} ${r1(c.top + 0.2)}C${r1(c.x + 1.3)} ${r1(lerp(c.top, c.bot, 0.35))} ${r1(c.x + 1.3)} ${r1(lerp(c.top, c.bot, 0.65))} ${r1(c.x + 0.5)} ${r1(c.bot - 0.2)}`;
    };
    S.push(`<g clip-path="${url('bclip')}">${engr(ring(204) + ring(207.6), 0.5, 0.6)}</g>`);
  }
  S.push(useB(`fill="none" stroke="${OUT}" stroke-width="${ow}" stroke-linejoin="round"`));

  // ── 盖子：金珠盖沿、洋葱顶
  const lx = AX;
  S.push(`<path d="M${lx - 18.6} 59.6C${lx - 18.6} 61.2 ${lx - 10} 62.4 ${lx} 62.4C${lx + 10} 62.4 ${lx + 18.6} 61.2 ${lx + 18.6} 59.6L${lx + 19.6} 63.4C${lx + 19.6} 65.2 ${lx + 10.6} 66.6 ${lx} 66.6C${lx - 10.6} 66.6 ${lx - 19.6} 65.2 ${lx - 19.6} 63.4Z" fill="${url('collar')}" stroke="${OUT}" stroke-width="${ow}" stroke-linejoin="round"/>`);
  if (!low) S.push(`<path d="M${lx - 17.4} 61.6C${lx - 13} 63.6 ${lx - 6} 64.2 ${lx - 1} 64.3" fill="none" stroke="${HI}" stroke-width=".7" opacity=".7" stroke-linecap="round"/>`);
  if (high) {
    let beads = '';
    for (let i = -6; i <= 6; i++) {
      const t = i / 6.6;
      beads += `<circle cx="${r1(lx + t * 18.4)}" cy="${r1(62.6 + (1 - t * t) * 2.4)}" r=".5" opacity="${r2(0.5 + 0.45 * (1 - Math.abs(t)))}"/>`;
    }
    S.push(`<g fill="${BEAD}">${beads}</g>`);
  }
  S.push(`<ellipse cx="${lx}" cy="59.6" rx="18.6" ry="2.8" fill="${url('ledge')}" stroke="${OUT}" stroke-width="${r2(ow * 0.8)}"/>`);
  S.push(ov(`<ellipse cx="${lx}" cy="60.2" rx="17" ry="2.2" fill="${mix(M.hi, M.spec, 0.25)}" opacity=".9"/>`)); // 盖缝漏出来的光
  S.push(`<path d="M${lx - 16.4} 59.6C${lx - 16.8} 53.4 ${lx - 12} 49.2 ${lx - 6.4} 47.4C${lx - 3.6} 46.5 ${lx - 2.4} 45.2 ${lx - 2} 43.8L${lx + 2} 43.8C${lx + 2.4} 45.2 ${lx + 3.6} 46.5 ${lx + 6.4} 47.4C${lx + 12} 49.2 ${lx + 16.8} 53.4 ${lx + 16.4} 59.6C${lx + 16.4} 61 ${lx + 9} 62.1 ${lx} 62.1C${lx - 9} 62.1 ${lx - 16.4} 61 ${lx - 16.4} 59.6Z" fill="${url('lid')}" stroke="${OUT}" stroke-width="${ow}" stroke-linejoin="round"/>`);
  if (!low) S.push(engr(`M${lx - 15.6} 56.6C${lx - 10} 58.6 ${lx + 10} 58.6 ${lx + 15.6} 56.6`, 0.5, 0.55));
  S.push(`<path d="M${lx - 12.8} 52.4C${lx - 10.6} 49.8 ${lx - 7.4} 48.4 ${lx - 4} 47.8C${lx - 7} 49.8 ${lx - 9} 51.8 ${lx - 10.4} 54.8C${lx - 11} 55.8 ${lx - 13.6} 53.8 ${lx - 12.8} 52.4Z" fill="${mix(M.spec, CARD, 0.6)}" opacity=".95"/>`);

  // ── 灯顶：小金颈 + 琥珀椭圆宝石（金包边）= 潘吉头巾上的胸针
  const { cx: gx, cy: gy } = GEM;
  D.push(`<linearGradient id="${id('neck')}" gradientUnits="userSpaceOnUse" x1="${gx - 4.4}" y1="0" x2="${gx + 4.4}" y2="0">${stops([[0, M.light], [0.3, mix(M.hi, M.spec, 0.4)], [0.62, M.mid], [1, M.dark]])}</linearGradient>`);
  S.push(
    `<path d="M${gx - 4.4} 44C${gx - 3.6} 42.6 ${gx - 2.6} 41.4 ${gx - 2.4} 39.6L${gx + 2.4} 39.6C${gx + 2.6} 41.4 ${gx + 3.6} 42.6 ${gx + 4.4} 44C${gx + 2.6} 44.9 ${gx - 2.6} 44.9 ${gx - 4.4} 44Z" fill="${url('neck')}" stroke="${OUT}" stroke-width="${r2(ow * 0.7)}" stroke-linejoin="round"/>`
  );
  S.push(ov(`<circle cx="${gx}" cy="${gy}" r="11" fill="${url('spot')}" opacity=".85"/>` + ovs(`<circle cx="${gx}" cy="${gy}" r="16" fill="${url('spot')}" opacity=".7"/>`))); // 宝石的光
  const k = GEM.s;
  const gemD = ellD(gx, gy + 0.2 * k, 5.1 * k, 6.8 * k);
  S.push(
    `<path d="${ellD(gx, gy, 7.4 * k, 9.2 * k)}" fill="${url('bezel')}" stroke="${OUT}" stroke-width="${r2(ow * 0.6)}"/>`,
    low ? '' : `<path d="${ellD(gx, gy, 5.9 * k, 7.7 * k)}" fill="none" stroke="${PALETTE.goldInk}" stroke-opacity=".55" stroke-width="${r2(0.7 * k)}"/>`,
    `<path d="${gemD}" fill="${url('gem')}"/>`,
    `<ellipse cx="${r2(gx - 1.8 * k)}" cy="${r2(gy - 3 * k)}" rx="${r2(1.9 * k)}" ry="${r2(2.7 * k)}" transform="rotate(-16 ${r2(gx - 1.8 * k)} ${r2(gy - 3 * k)})" fill="${M.white}" opacity=".85"/>`,
    low ? '' : `<ellipse cx="${r2(gx + 1.8 * k)}" cy="${r2(gy + 3.8 * k)}" rx="${r2(1.4 * k)}" ry="${r2(0.8 * k)}" fill="${GEM_HI}" opacity=".7"/>`
  );
  S.push(ov(`<path d="${gemD}" fill="${GEM_HI}" opacity=".4"/>`)); // 宝石被点亮

  // ── 魔法：壶嘴的光、那缕烟、星光
  S.push(ov(`<circle cx="225.4" cy="40.4" r="8.5" fill="${url('spot')}"/>` + ovs(`<circle cx="225.4" cy="40.4" r="12.5" fill="${url('spot')}" opacity=".85"/>`)));
  if (smoke) {
    const pts = SMOKE_PTS;
    const [mx, my] = SMOKE.mouth;
    const kW = low ? 1.3 : 1; // 小图加粗一点
    const s = SMOKE.r0 / SPIRAL.r0;
    const h = (p) => (p.w * kW) / 2;
    // 颜色 = 潘吉雾尾的那组（晨雾白 → 溪水青），灯口一段是暖白；背光面是溪水青
    const mist = [PG.smoke[0], mix(PG.smoke[0], PG.smoke[1], 0.6), mix(PG.smoke[1], PG.ball[2], 0.58), mix(PG.ball[2], PALETTE.stream, 0.5)];
    const at = `gradientUnits="userSpaceOnUse" cx="${mx}" cy="${r2(my + 1.5)}" r="40"`;
    D.push(
      rad('smk', at, [[0, mist[0], 0], [0.09, mist[0], 0.96], [0.38, mist[1], 0.97], [0.7, mist[2], 0.97], [1, mist[3], 0.97]]),
      rad('smkS', at, [[0, PALETTE.stream, 0], [0.1, PALETTE.stream, 0.9], [0.6, PALETTE.stream, 0.95], [1, mix(PALETTE.stream, PG.ball[3], 0.45), 0.97]]),
      rad('smkW', `gradientUnits="userSpaceOnUse" cx="${mx}" cy="${my + 2}" r="26"`, [[0, PG.halo, 0.95], [0.5, M.hi, 0.5], [1, M.hi, 0]]),
      `<path id="${id('S')}" d="${ribbon(pts, (u, p) => h(p), (u, p) => -h(p), { capEnd: true })}"/>`,
      `<clipPath id="${id('sclip')}"><use href="#${id('S')}"/></clipPath>`
    );
    // 背光面是轮廓里面的一道溪水青月牙（底色青，暖白身子往光那边挪一点再裁回轮廓里）—— 不出边，暮色里不会像描边
    const g = [`<use href="#${id('S')}" fill="${url('smkS')}"/>`];
    let body = `<g clip-path="${url('sclip')}"><use href="#${id('S')}" fill="${url('smk')}" transform="translate(-.8 -.9)"/>`;
    if (!low) {
      // 受光的芯（引线那段，顺着左上的光偏）
      const lit = withArc(pts.filter((p) => p.curl < 0.3 && p.u > 0.04).map((p) => ({ ...p })));
      body += `<path d="${ribbon(lit, (u, p) => h(p) * (0.3 + 0.5 * ndl(p)), (u, p) => h(p) * (-0.32 + 0.5 * ndl(p)))}" fill="${CARD}" opacity=".45"/>`;
    }
    g.push(body + `</g>`);
    if (!low) {
      // 卷尾内沿的白线：和潘吉雾尾同一个做法（入口前两点起、36 个点，离中线 4.2→0.6，按比例缩）
      const i0 = pts.findIndex((p) => p.curl > 0) - 3;
      const hl = pts.slice(i0, i0 + 36).map((p, i, a) => offP(p, -(4.2 * (1 - i / a.length) + 0.6) * s * kW));
      g.push(`<path d="${smoothOpen(hl)}" fill="none" stroke="${PG.smoke[0]}" stroke-opacity=".75" stroke-width="${r2(1.3 * s)}" stroke-linecap="round"/>`);
    }
    g.push(ov(`<use href="#${id('S')}" fill="${url('smkW')}"/>`)); // 被灯点亮的暖光
    // 两颗小烟团（同潘吉雾尾旁的小泡泡）
    const puff = (x, y, r, o, delay) =>
      `<g${anim('lamp-puff', x, y, delay ? `;animation-delay:${delay}s` : '')} opacity="${o}"><circle cx="${r2(x + 0.5)}" cy="${r2(y + 0.55)}" r="${r}" fill="${PALETTE.stream}" opacity=".55"/><circle cx="${x}" cy="${y}" r="${r}" fill="${PG.smoke[0]}"/></g>`;
    if (!low) g.push(puff(231.2, 27.4, 1.6, 0.85, 0) + puff(233.6, 20.4, 1.1, 0.7, -1.4));
    let smokeG = `<g${anim('lamp-smoke', mx, my + 1)}>${compose(g)}</g>`;
    if (smoke === 'glow') smokeG = ovs(smokeG);
    S.push(live ? { o: smokeG } : smokeG); // 里面有覆盖层：不能整个包进挡板
  }
  if (!low) {
    const sx = 232.4;
    const sy = 41.2;
    const sg =
      `<g${anim('lamp-spark', sx, sy)}>` +
      compose([
        `<circle cx="${sx}" cy="${sy}" r="1.7" fill="${M.hi}" opacity=".55"/>` + sparkle(sx, sy, 4.3, M.light) + sparkle(sx, sy, 3.6, HI),
        ov(`<circle cx="${sx}" cy="${sy}" r="3.5" fill="${M.hi}" opacity=".9"/>` + sparkle(sx, sy, 6.7, M.light) + sparkle(sx, sy, 6, HI)),
      ]) +
      `</g>`;
    S.push(live ? { o: sg } : sg);
  }
  // 只留有人引用的 defs（low 不用小宝石的渐变，mid / high 不用 low 的平涂渐变……）
  const body = compose(S);
  const refs = body + D.join('');
  const keep = D.filter((d) => {
    const m = /\sid="([^"]+)"/.exec(d);
    return !m || refs.includes(`#${m[1]})`) || refs.includes(`#${m[1]}"`);
  });
  return `<defs${live ? ' style="--glow:0"' : ''}>${keep.join('')}</defs>${body}`;
}

// ── 缓存 ────────────────────────────────────────────────────────────
const TEMPLATES = new Map(); // 每种配置一份（所有实例共用）
const INSTANCES = new Map(); // 配置 + 前缀
const remember = (map, key, make, max) => {
  let v = map.get(key);
  if (v === undefined) {
    v = make();
    map.set(key, v);
    if (map.size > max) map.delete(map.keys().next().value);
  }
  return v;
};
const DETAILS = new Set(['low', 'mid', 'high']);

// ── public API ──────────────────────────────────────────────────────
export const LAMP_VIEWBOX = '0 0 240 140';

/** 按实际渲染尺寸（CSS px，灯的宽度）选细节：< 72 low，< 200 mid，其余 high；不知道尺寸就 mid */
export function detailFor(px) {
  const n = Number(px);
  if (!Number.isFinite(n) || n <= 0) return 'mid';
  return n < 72 ? 'low' : n < 200 ? 'mid' : 'high';
}

/** <svg viewBox="0 0 240 140"> 里面的静态标记（defs + 各层）。glow 由根 <svg> 上的 --glow 控制。 */
export function lampInner({ smoke = false, detail = 'auto', idPrefix = 'lp', size, shadow = false } = {}) {
  const d = DETAILS.has(detail) ? detail : detailFor(size);
  const sm = smoke === 'glow' ? 'glow' : smoke ? 'on' : '';
  const key = `${d}|${sm}|${shadow ? 1 : 0}`;
  const pre = cleanId(idPrefix) || 'lp';
  return remember(
    INSTANCES,
    `${key}|${pre}`,
    () => remember(TEMPLATES, key, () => build({ smoke: sm, detail: d, shadow: !!shadow }), 24).split(TOKEN).join(pre),
    256
  );
}

/** 完整 <svg>（预览、静态图）：把 glow 写成根上的 --glow */
export function lampSVG({ glow = 0, smoke = false, detail = 'auto', idPrefix, size, shadow = false, title } = {}) {
  const pre = cleanId(idPrefix) || `wl${Math.random().toString(36).slice(2, 8)}`;
  const inner = lampInner({ smoke, detail, idPrefix: pre, size, shadow });
  const wh = size ? ` width="${size}" height="${r2((size * 140) / 240)}"` : '';
  const a11y = title ? ` role="img" aria-label="${esc(title)}"` : ' aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LAMP_VIEWBOX}"${wh}${a11y} style="--glow:${r2(clamp01(+glow || 0))}">${inner}</svg>`;
}

/**
 * 满版方形 App 图标（不切圆角：iOS / Android 自己加遮罩）。暮色渐变底、灯后一团暖光、三颗小星、
 * 灯嘴的烟卷成潘吉的螺旋。发光直接烤成固定不透明度、没有动画 class —— 单独存成 .svg / 转 PNG 都一样。
 */
export function iconSVG({ size = 180, idPrefix = 'wi' } = {}) {
  const P = cleanId(idPrefix) || 'wi';
  const body = build({ smoke: 'on', detail: 'mid', shadow: false, bake: 0.55 }).split(TOKEN).join(`${P}l`);
  const bgTop = mix(PALETTE.dusk, PALETTE.accent, 0.25);
  const star = (x, y, r, o) => sparkle(x, y, r, PALETTE.firefly, ` opacity="${o}"`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="${size}" height="${size}" role="img" aria-label="WISH">` +
    `<defs>` +
    `<linearGradient id="${P}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bgTop}"/><stop offset="1" stop-color="${PALETTE.dusk}"/></linearGradient>` +
    `<radialGradient id="${P}-warm" gradientUnits="userSpaceOnUse" cx="88" cy="100" r="82" gradientTransform="translate(88 100) scale(1 .82) translate(-88 -100)"><stop offset="0" stop-color="${M.bright}" stop-opacity=".42"/><stop offset=".45" stop-color="${M.light}" stop-opacity=".15"/><stop offset="1" stop-color="${PALETTE.amber}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${P}-vig" cx=".5" cy=".46" r=".75"><stop offset=".6" stop-color="${PALETTE.ink}" stop-opacity="0"/><stop offset="1" stop-color="${PALETTE.ink}" stop-opacity=".38"/></radialGradient>` +
    `</defs>` +
    `<rect width="180" height="180" fill="url(#${P}-bg)"/><rect width="180" height="180" fill="url(#${P}-warm)"/><rect width="180" height="180" fill="url(#${P}-vig)"/>` +
    star(34, 46, 3.2, 0.85) + star(152, 134, 2.2, 0.55) + star(24, 116, 1.7, 0.45) +
    `<g transform="translate(90 93) scale(.72) translate(-128 -67)">${body}</g></svg>`
  );
}
