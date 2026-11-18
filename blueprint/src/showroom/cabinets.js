// 展厅播放 ·「毛坯 → 柜子一件件出现」：滑进效果图时，白纸 → 线稿 → 墙地顶上色（毛坯）→ 柜子一组一组从下往上长出来 → 原图。
//
// 柜子在哪里、后面的墙长什么样，只有两种来源（都不让 AI 画任何东西）：
//   A「毛坯图」：设计师在 SketchUp / D5 用同一个场景（同一个机位）关掉柜子再出一张。程序比对两张图，
//      不一样的地方就是柜子（连成一块 = 一组），柜子后面的墙也是真的。零 AI 费用。
//   B「框柜子」：没有毛坯图时，设计师在效果图上框出柜子（四个角可以拖成透视的样子）；可以让 AI 先框一遍
//      （只给框，不画图），设计师核对过（打勾）才播。框里先是铅笔线稿，再一件件上色。
//
// 准确性：显露的永远是原图（和毛坯图）本身的像素；进度走完 = 原图逐像素相同（测试锁住），停点上播放器换回原图 <img>。
// 纯函数（不碰 DOM），Node 可测；浏览器里在 Web Worker 里跑 analyseCabinets（sketch.worker.js）。

import { analyseSketch, PAPER, INK } from './sketch.js';

/** 一张效果图最多分几组出现（再多就太碎、太慢；多出来的小块并进最后一组「其余」） */
export const MAX_PIECES = 8;
/** B：一张图最多几个框 */
export const MAX_BOXES = 12;
/** A：两张图差多少算「不一样」（模糊后 RGB 平均差，0–255） */
export const DIFF_T = 20;
/** A：不一样的地方超过这个比例 = 机位 / 尺寸 / 曝光不一样（不是同一个场景关掉柜子） */
export const MAX_CHANGED = 0.6;
/** A：一组柜子至少占多少（更小的是噪点、阴影的碎块） */
export const MIN_PIECE = 0.003;

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};

// ---------------------------------------------------------------------------
// 存在效果图页上的数据（slide.cabinets）
//   { v:1, on:boolean, forImage:'asset:…'（这份毛坯 / 框是给哪张效果图做的；换图 = 失效）,
//     shell:'asset:…'|null（A 毛坯图）, boxes:[{ id, q:[x0,y0,x1,y1,x2,y2,x3,y3], by:'ai'|'hand' }]（B，整张原图的 0–1 坐标，
//     左上、右上、右下、左下）, checked:boolean（B 设计师核对过）, detect:{ at, notes }|null }
// ---------------------------------------------------------------------------

/** 这一页当前效果图对应的数据；效果图换过 → null */
export function cabinetsOf(slide) {
  const c = slide?.cabinets;
  return c && slide.image && c.forImage === slide.image ? c : null;
}

/** 合并更新（纯函数）；patch = null → 清掉 */
export function patchCabinets(slide, patch) {
  if (patch === null) return { ...slide, cabinets: null };
  const cur = cabinetsOf(slide) || { v: 1, on: false, forImage: slide.image || null, shell: null, boxes: [], checked: false, detect: null };
  return { ...slide, cabinets: { ...cur, ...patch, forImage: slide.image || null } };
}

/**
 * 能不能播、怎么播
 * @returns {{ mode:'shell'|'boxes', shell?:string, boxes?:object[] } | { mode:null, why:string }}
 */
export function playableCabinets(slide) {
  const c = slide?.cabinets;
  if (!c?.on) return { mode: null, why: '没勾「展厅播放这张」' };
  if (!cabinetsOf(slide)) return { mode: null, why: '效果图换过了，毛坯图 / 框要重新做' };
  if (c.shell) return { mode: 'shell', shell: c.shell };
  const boxes = (c.boxes || []).filter((b) => validQuad(b?.q));
  if (!boxes.length) return { mode: null, why: '还没有毛坯图，也还没框柜子' };
  if (!c.checked) return { mode: null, why: '框还没核对（核对过、打勾才播）' };
  return { mode: 'boxes', boxes };
}

export const validQuad = (q) => Array.isArray(q) && q.length === 8 && q.every((v) => Number.isFinite(v) && v >= -0.01 && v <= 1.01) && quadArea(q) > 1e-4;

/** 四边形面积（0–1 坐标，鞋带公式） */
export function quadArea(q) {
  let s = 0;
  for (let k = 0; k < 4; k++) {
    const j = (k + 1) % 4;
    s += q[k * 2] * q[j * 2 + 1] - q[j * 2] * q[k * 2 + 1];
  }
  return Math.abs(s) / 2;
}

/** 矩形 → 四边形（左上、右上、右下、左下） */
export const rectQuad = (x0, y0, x1, y1) => [x0, y0, x1, y0, x1, y1, x0, y1];

let boxSeq = 0;
export const newBoxId = () => `cb${Date.now().toString(36)}${(boxSeq++).toString(36)}`;

// ---------------------------------------------------------------------------
// B：AI 先框（只给框）—— 整理回复。绝不抛错；看不懂的丢掉
// ---------------------------------------------------------------------------

/** 发给看图模型的话（英文，只要框、不要画图） */
export const BOX_PROMPT = [
  'You are looking at an interior design rendering.',
  'Find every piece of built-in custom carpentry: fixed cabinets, wardrobes, TV cabinets, kitchen base and wall cabinets, islands,',
  'built-in shelving, display cabinets, shoe cabinets, vanity cabinets, wall panelling and feature walls made by a carpenter.',
  'Do NOT include loose furniture (sofas, chairs, beds, tables, rugs), appliances on their own, lamps, plants, decor or curtains.',
  'Treat one continuous run of cabinets as one item. Return at most 10 items.',
  'Answer with JSON only: [{"box_2d":[ymin,xmin,ymax,xmax],"label":"short name"}] with coordinates normalised to 0-1000.',
].join(' ');

/**
 * Gemini 回复（JSON 文本或已解析的值）→ 框（整张原图 0–1 坐标的四边形），按从左到右排
 * @returns {{ boxes:{ id, q, by:'ai', label }[], notes:string[] }}
 */
export function parseCabinetBoxes(reply) {
  const notes = [];
  let v = reply;
  if (typeof v === 'string') {
    const s = v.replace(/```(?:json)?/gi, '').trim();
    const a = s.indexOf('[');
    const b = s.lastIndexOf(']');
    try {
      v = JSON.parse(a >= 0 && b > a ? s.slice(a, b + 1) : s);
    } catch {
      return { boxes: [], notes: ['AI 的回复看不懂，没有框'] };
    }
  }
  if (v && !Array.isArray(v) && Array.isArray(v.items)) v = v.items;
  if (!Array.isArray(v)) return { boxes: [], notes: ['AI 的回复看不懂，没有框'] };
  const out = [];
  for (const it of v) {
    const bb = it?.box_2d || it?.box || it?.bbox;
    if (!Array.isArray(bb) || bb.length !== 4 || !bb.every((n) => Number.isFinite(Number(n)))) continue;
    let [y0, x0, y1, x1] = bb.map((n) => clamp(Number(n) / 1000));
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    const w = x1 - x0;
    const h = y1 - y0;
    if (w < 0.02 || h < 0.02) {
      notes.push('丢掉一个太小的框');
      continue;
    }
    if (w * h > 0.9) {
      notes.push('丢掉一个几乎整张图的框');
      continue;
    }
    out.push({ q: rectQuad(x0, y0, x1, y1), label: String(it.label || '').slice(0, 40), cx: (x0 + x1) / 2 });
  }
  out.sort((p, q) => p.cx - q.cx);
  if (out.length > MAX_BOXES) notes.push(`AI 框了 ${out.length} 个，只留前 ${MAX_BOXES} 个`);
  return { boxes: out.slice(0, MAX_BOXES).map(({ q, label }) => ({ id: newBoxId(), q, by: 'ai', label })), notes };
}

// ---------------------------------------------------------------------------
// 像素工具
// ---------------------------------------------------------------------------

/** 均值模糊（半径 1，可做几次） */
function blur(a, W, H, times = 1) {
  let src = a;
  for (let t = 0; t < times; t++) {
    const o = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= W) continue;
            s += src[yy * W + xx];
            n++;
          }
        }
        o[y * W + x] = s / n;
      }
    }
    src = o;
  }
  return src;
}

/** 方形膨胀 / 腐蚀（0/1 遮罩，半径 r，横竖两遍） */
function morph(m, W, H, r, grow) {
  const pass = (src, horiz) => {
    const o = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let v = grow ? 0 : 1;
        for (let d = -r; d <= r; d++) {
          const xx = horiz ? x + d : x;
          const yy = horiz ? y : y + d;
          if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
          const s = src[yy * W + xx];
          if (grow ? s : !s) {
            v = grow ? 1 : 0;
            break;
          }
        }
        o[y * W + x] = v;
      }
    }
    return o;
  };
  return pass(pass(m, true), false);
}

/** 连通块（4 邻接）→ { labels:Int16Array（-1 = 不属于）, comps:[{ area, x0, y0, x1, y1 }] } */
function components(mask, W, H) {
  const labels = new Int16Array(W * H).fill(-1);
  const comps = [];
  const stack = new Int32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || labels[i] >= 0) continue;
    if (comps.length >= 32000) break;
    const id = comps.length;
    const c = { area: 0, x0: W, y0: H, x1: 0, y1: 0, sx: 0 };
    let sp = 0;
    stack[sp++] = i;
    labels[i] = id;
    while (sp) {
      const p = stack[--sp];
      const x = p % W;
      const y = (p - x) / W;
      c.area++;
      c.sx += x;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
      for (const q of nb) {
        if (q >= 0 && mask[q] && labels[q] < 0) {
          labels[q] = id;
          stack[sp++] = q;
        }
      }
    }
    comps.push(c);
  }
  return { labels, comps };
}

/** 标签往外长 r 圈（羽化边上的像素也知道自己属于哪一组） */
function growLabels(labels, W, H, r) {
  let cur = labels;
  for (let k = 0; k < r; k++) {
    const o = cur.slice();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (cur[i] >= 0) continue;
        if (x > 0 && cur[i - 1] >= 0) o[i] = cur[i - 1];
        else if (x < W - 1 && cur[i + 1] >= 0) o[i] = cur[i + 1];
        else if (y > 0 && cur[i - W] >= 0) o[i] = cur[i - W];
        else if (y < H - 1 && cur[i + W] >= 0) o[i] = cur[i + W];
      }
    }
    cur = o;
  }
  return cur;
}

// ---------------------------------------------------------------------------
// A：比对毛坯图
// ---------------------------------------------------------------------------

/**
 * 效果图 vs 毛坯图（同尺寸 RGBA）→ 柜子在哪里
 * @returns {{ ok:boolean, why?:string, changed:number, labels?:Int16Array, pieces?:{ x0,y0,x1,y1, area }[] }}
 *   pieces 已按出现的先后排好（大的从左到右，最后一组 = 其余小块）
 */
export function compareShell(render, shell, W, H) {
  const N = W * H;
  const d = new Float32Array(N);
  const ch = (img, k) => {
    const a = new Float32Array(N);
    for (let i = 0; i < N; i++) a[i] = img[i * 4 + k];
    return blur(a, W, H, 2);
  };
  for (let k = 0; k < 3; k++) {
    const a = ch(render, k);
    const b = ch(shell, k);
    for (let i = 0; i < N; i++) d[i] += Math.abs(a[i] - b[i]) / 3;
  }
  let mask = new Uint8Array(N);
  let changed = 0;
  for (let i = 0; i < N; i++) {
    if (d[i] > DIFF_T) {
      mask[i] = 1;
      changed++;
    }
  }
  const ratio = changed / N;
  if (ratio > MAX_CHANGED) {
    return { ok: false, changed: ratio, why: '毛坯图和效果图大半张都不一样：要用同一个场景、同一个机位、同样的出图尺寸和灯光，只关掉柜子再出一张' };
  }
  const r = Math.max(2, Math.round(W / 280));
  mask = morph(morph(mask, W, H, r, true), W, H, r, false); // 闭：柜门之间的缝、把手连成一整块
  mask = morph(morph(mask, W, H, 1, false), W, H, 1, true); // 开：去掉噪点
  const { labels, comps } = components(mask, W, H);
  const keep = comps.map((c, id) => ({ ...c, id })).filter((c) => c.area >= MIN_PIECE * N);
  if (!keep.length) {
    return { ok: false, changed: ratio, why: '毛坯图和效果图几乎一样：柜子图层可能没关掉' };
  }
  // 大的（≥ 1.5%）从左到右一组组出现；放不下的、小的并进最后一组「其余」
  const big = keep.filter((c) => c.area >= 0.015 * N).sort((p, q) => p.sx / p.area - q.sx / q.area);
  const small = keep.filter((c) => c.area < 0.015 * N);
  let order = big;
  let rest = small;
  if (order.length > MAX_PIECES - (rest.length ? 1 : 0)) {
    const n = MAX_PIECES - 1;
    rest = [...order.slice(n), ...rest];
    order = order.slice(0, n);
  }
  if (!order.length) {
    order = rest.slice(0, 1);
    rest = rest.slice(1);
  }
  const map = new Int16Array(comps.length).fill(-1);
  order.forEach((c, k) => (map[c.id] = k));
  if (rest.length) rest.forEach((c) => (map[c.id] = order.length));
  const out = new Int16Array(N).fill(-1);
  for (let i = 0; i < N; i++) if (labels[i] >= 0) out[i] = map[labels[i]];
  const groups = [...order.map((c) => [c]), ...(rest.length ? [rest] : [])];
  const pieces = groups.map((g) => ({
    x0: Math.min(...g.map((c) => c.x0)),
    y0: Math.min(...g.map((c) => c.y0)),
    x1: Math.max(...g.map((c) => c.x1)),
    y1: Math.max(...g.map((c) => c.y1)),
    area: g.reduce((s, c) => s + c.area, 0),
  }));
  return { ok: true, changed: ratio, labels: out, pieces };
}

// ---------------------------------------------------------------------------
// B：框 → 每个像素属于哪一组
// ---------------------------------------------------------------------------

/** 点在四边形里（射线法） */
function inQuad(px, py, P) {
  let inside = false;
  for (let k = 0, j = 3; k < 4; j = k++) {
    const xi = P[k * 2];
    const yi = P[k * 2 + 1];
    const xj = P[j * 2];
    const yj = P[j * 2 + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * 框（整张原图 0–1）→ 版面裁切后 W×H 的标签图；后面的框盖前面的
 * @param {{ l,t,r,b }} crop  placeImage 的裁切（0–1）
 */
export function boxLabels(boxes, W, H, crop = { l: 0, t: 0, r: 0, b: 0 }) {
  const labels = new Int16Array(W * H).fill(-1);
  const cw = 1 - crop.l - crop.r || 1;
  const chh = 1 - crop.t - crop.b || 1;
  const pieces = [];
  (boxes || []).slice(0, MAX_BOXES).forEach((b, k) => {
    const P = b.q.map((v, j) => (j % 2 === 0 ? ((v - crop.l) / cw) * W : ((v - crop.t) / chh) * H));
    const xs = [P[0], P[2], P[4], P[6]];
    const ys = [P[1], P[3], P[5], P[7]];
    const x0 = Math.max(0, Math.floor(Math.min(...xs)));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
    let area = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (inQuad(x + 0.5, y + 0.5, P)) {
          labels[y * W + x] = k;
          area++;
        }
      }
    }
    pieces.push({ x0, y0, x1, y1, area });
  });
  return { labels, pieces };
}

// ---------------------------------------------------------------------------
// 分析 + 逐帧合成
// ---------------------------------------------------------------------------

/**
 * @param {Uint8ClampedArray} data   效果图 RGBA（版面裁切后，W×H）
 * @param {Int16Array} labels        每个像素属于第几组（-1 = 不是柜子）
 * @param {{ y0, y1 }[]} pieces      每组的范围（从下往上长）
 * @returns {{ W, H, mag, order, reveal, label:Int16Array, w:Float32Array, rise:Float32Array, n:number }}
 */
export function analyseCabinets(data, W, H, labels, pieces) {
  const an = analyseSketch(data, W, H);
  const N = W * H;
  const ind = new Float32Array(N);
  for (let i = 0; i < N; i++) ind[i] = labels[i] >= 0 ? 1 : 0;
  const w = blur(ind, W, H, 2); // 羽化 2 px：柜子边不出锯齿
  const label = growLabels(labels, W, H, 3);
  const rise = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const k = label[i];
    if (k < 0) {
      w[i] = 0;
      continue;
    }
    const p = pieces[k];
    const y = Math.floor(i / W);
    rise[i] = p && p.y1 > p.y0 ? clamp((p.y1 - y) / (p.y1 - p.y0)) : 0; // 0 = 底，1 = 顶
  }
  return { ...an, label, w, rise, n: pieces.length };
}

/** 第 k 组（共 n 组）在 pieceQ 时出现了多少（0–1）：一组接一组，前后稍微重叠 */
export function pieceProgress(pieceQ, k, n) {
  if (n <= 0) return 1;
  const dur = n === 1 ? 1 : Math.min(0.5, 1.8 / (n + 1));
  const start = n === 1 ? 0 : ((1 - dur) * k) / (n - 1);
  return clamp((pieceQ - start) / dur);
}

/**
 * 合成一帧（RGBA 写进 out）
 * @param {object} an        analyseCabinets 的结果
 * @param {Uint8ClampedArray} src    效果图 RGBA
 * @param {Uint8ClampedArray|null} shell  毛坯图 RGBA（A）；null = B（框里先是白纸线稿）
 * @param {{ lineQ:number, baseQ:number, pieceQ:number }} q  线稿 → 毛坯上色 → 柜子出现；全部 = 1 时输出 = 原图逐像素相同
 */
export function cabinetFrame(an, src, shell, q, out) {
  const { mag, order, reveal, label, w, rise, n } = an;
  const N = an.W * an.H;
  const drawT = clamp(q.lineQ) * 1.15;
  const cq = clamp(q.baseQ) * 1.3;
  const fin = shell ? ease((q.pieceQ - 0.86) / 0.14) : 1; // A：柜子以外的地方（光影、反射）最后才从毛坯换成原图
  const pk = new Float32Array(Math.max(1, n));
  for (let k = 0; k < n; k++) pk[k] = pieceProgress(q.pieceQ, k, n);
  for (let i = 0; i < N; i++) {
    const la = clamp((drawT - order[i]) / 0.08) * clamp((mag[i] - 0.16) / 0.3);
    const ca = ease((cq - reveal[i]) / 0.22);
    const wi = w[i];
    const k = label[i];
    // 柜子从下往上长出来：这一组的进度走到这一行才显出原图
    const pa = k >= 0 ? ease((pk[k] * 1.6 - rise[i] * 0.6) / 0.4) : 1;
    const outside = shell ? fin : ca; // 柜子以外：A = 毛坯换成原图；B = 原图上色
    const p = i * 4;
    if (pa >= 1 && outside >= 1 && (shell ? ca >= 1 : true)) {
      out[p] = src[p];
      out[p + 1] = src[p + 1];
      out[p + 2] = src[p + 2];
      out[p + 3] = 255;
      continue;
    }
    // 线：柜子以外跟着上色淡掉；柜子里一直留着（设计线），这一组出现时才淡掉
    const keep = (1 - wi) * (1 - ca) + wi * (1 - pa);
    const L = la * keep;
    const alpha = wi * pa + (1 - wi) * outside;
    for (let c = 0; c < 3; c++) {
      const ground = shell ? PAPER[c] * (1 - ca) + shell[p + c] * ca : PAPER[c];
      const before = ground * (1 - L) + INK[c] * L;
      out[p + c] = before * (1 - alpha) + src[p + c] * alpha;
    }
    out[p + 3] = 255;
  }
  return out;
}
