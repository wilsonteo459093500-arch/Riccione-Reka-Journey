// 展厅播放 · 动效：滚动位置 → 每一层、每个元素的透明度 / 位移 / 效果图推近。
// 全部是位置的纯函数（不是按时间播的动画）：往前滑、往回滑、跳转，画面都一样，触控拖到一半停住也对。
//
// 铁律：f = 0（停在 A）和 f = 1（停在 B）时，停住的那一页是「原样」—— 透明度 1、不位移、效果图 scale = 1（完整原图，
// 不裁不放大）。动效只发生在两页之间的路上。
//
// 节奏（安静、慢、电影感）：
//   换页（cut）：A 的字先淡出上移 → A 的效果图轻轻推近 1.04 → 两页交叉淡化 → B 的效果图从 1.05 缓缓退回 1.00 →
//                B 的字按排版顺序一行行淡入、轻轻上浮
//   同一段（same：白天 → 夜晚）：版面不动，B 整页在 A 上面慢慢显出来（灯光亮起）
//   设计特点（craft）：A 的字淡掉 → 同一张效果图从 A 的框（含裁切）平滑移到 B 左边的框（整张）→ 特点一张张浮出

import { SLIDE_W, SLIDE_H } from '../theme.js';
import { placeImage } from '../engine/spec.js';

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** smoothstep：两头都没有折角 */
export const ease = (t) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
/** f 在 [a, b] 之间的进度（缓动后，0–1） */
export const span = (f, a, b) => ease((f - a) / (b - a));

/** 大照片（效果图、品牌照片）：做推近；小图（logo、材料小样）只跟着整层淡入淡出 */
export const isHeroImg = (el) => el?.t === 'img' && el.w * el.h >= 0.12 * SLIDE_W * SLIDE_H;
/** 跟着「字」一起动的元素：文字 */
const isText = (el) => el?.t === 'text';

export const PUSH_OUT = 0.04; // A 离场时推近
export const PUSH_IN = 0.05; // B 进场时从 1.05 退回 1

const IDENTITY = Object.freeze({ opacity: 1, ty: 0, scale: 1 });

/** 「从无到有」（sketch）：线稿、上色的进度（过渡进度 f 的函数） */
export const sketchProgress = (f) => ({ lineQ: span(f, 0.12, 0.55), colQ: span(f, 0.5, 0.97) });

/** B 页的字（和小图）依次进来：start0 起，最后一个在 f = 1 前到位 */
function textIn(els, start0, spread, dur) {
  const order = new Map();
  els.forEach((el, i) => {
    if (isText(el)) order.set(i, order.size);
  });
  const n = Math.max(1, order.size);
  return (f, i) => {
    const k = order.get(i) ?? 0;
    const start = start0 + spread * (n > 1 ? k / (n - 1) : 0);
    return span(f, start, Math.min(1, start + dur));
  };
}

/**
 * 某一页在过渡里的样子
 * @param {'a'|'b'} role   a = 离开的那页，b = 进来的那页
 * @param {'cut'|'same'} kind
 * @param {number} f       0–1（0 = 停在 A，1 = 停在 B）
 * @param {object[]} els   这一页的元素（决定字的先后顺序）
 * @returns {{ opacity:number, el:(el:object, i:number)=>({opacity,ty,scale}) }}
 */
export function layerMotion(role, kind, f, els = []) {
  if (kind === 'craft') {
    // 画的顺序反过来：B（设计特点页）在下，A（原页，不画底色）在上 —— A 的字淡掉的时候还盖在 B 的纸面上，
    // A 的效果图由 B 的效果图接手（从 A 的框移过去），所以一开始就藏起来
    if (role === 'a') {
      if (f <= 0) return { opacity: 1, el: () => IDENTITY };
      const out = span(f, 0, 0.3);
      return {
        opacity: 1,
        el: (el) => (el.t === 'img' && isHeroImg(el) ? { opacity: 0, ty: 0, scale: 1 } : { opacity: 1 - out, ty: isText(el) ? -14 * out : 0, scale: 1 }),
      };
    }
    if (f >= 1) return { opacity: 1, el: () => IDENTITY, morph: 1 };
    const tin = textIn(els, 0.58, 0.24, 0.16);
    const lines = span(f, 0.55, 0.8);
    return {
      opacity: 1,
      morph: span(f, 0.08, 0.7),
      el: (el, i) => {
        if (isText(el)) {
          const o = tin(f, i);
          return { opacity: o, ty: 16 * (1 - o), scale: 1 };
        }
        if (el.t === 'rect') return { opacity: lines, ty: 0, scale: 1 };
        return IDENTITY;
      },
    };
  }
  if (kind === 'same') {
    // 白天 → 夜晚：版面不动。A 的字先淡掉（不然「白天」「夜晚」叠在一起成重影）→ 两张原图交叉淡化 → B 的字再淡入
    if (role === 'a') {
      const out = span(f, 0.1, 0.4);
      return { opacity: 1, el: (el) => (isText(el) && out > 0 ? { opacity: 1 - out, ty: 0, scale: 1 } : IDENTITY) };
    }
    const layer = span(f, 0.12, 0.88);
    const text = span(f, 0.6, 0.9);
    // 元素透明度要乘上整层的透明度：字的实际透明度 = text（不超过整层）
    return { opacity: layer, el: (el) => (isText(el) && layer > 0 && text < layer ? { opacity: clamp01(text / layer), ty: 0, scale: 1 } : IDENTITY) };
  }
  if (kind === 'sketch') {
    // 换到效果图页：上一页淡出 → 这一页的效果图在白纸上画线稿、上色 → 字最后进来；f = 1 原样
    if (role === 'a') {
      if (f <= 0) return { opacity: 1, el: () => IDENTITY };
      const out = span(f, 0, 0.2);
      return { opacity: 1 - span(f, 0.05, 0.3), el: (el) => (isText(el) ? { opacity: 1 - out, ty: -14 * out, scale: 1 } : IDENTITY) };
    }
    if (f >= 1) return { opacity: 1, el: () => IDENTITY, sketch: null };
    const tin = textIn(els, 0.72, 0.14, 0.12);
    const sk = sketchProgress(f);
    const late = span(f, 0.72, 0.98); // 小图（材料小样、logo）和字一起进来
    return {
      opacity: span(f, 0.05, 0.3),
      sketch: sk,
      el: (el, i) => {
        if (isText(el)) {
          const o = tin(f, i);
          return { opacity: o, ty: 16 * (1 - o), scale: 1 };
        }
        if (el.t === 'img' && !isHeroImg(el)) return { opacity: late, ty: 0, scale: 1 };
        // 托字暗渐变（满版页白字下面那条）：跟着字一起出来，不然会先压在白纸线稿上
        if (el.t === 'rect' && /shade/.test(el.name || '')) return { opacity: late, ty: 0, scale: 1 };
        // 效果图本身：线稿画布接手；画布还没准备好时退回淡入
        if (el.t === 'img') return { opacity: sk.colQ, ty: 0, scale: 1 };
        return IDENTITY;
      },
    };
  }
  if (role === 'a') {
    if (f <= 0) return { opacity: 1, el: () => IDENTITY };
    const textOut = span(f, 0, 0.35);
    const push = 1 + PUSH_OUT * ease(f);
    return {
      opacity: 1 - span(f, 0.25, 0.7),
      el: (el) => (isText(el) ? { opacity: 1 - textOut, ty: -14 * textOut, scale: 1 } : isHeroImg(el) ? { opacity: 1, ty: 0, scale: push } : IDENTITY),
    };
  }
  if (f >= 1) return { opacity: 1, el: () => IDENTITY };
  // B：字按排版顺序依次进来，最后一行在 f = 1 时刚好到位
  const order = new Map();
  els.forEach((el, i) => {
    if (isText(el)) order.set(i, order.size);
  });
  const n = Math.max(1, order.size);
  const settle = span(f, 0.3, 1);
  return {
    opacity: span(f, 0.3, 0.75),
    el: (el, i) => {
      if (isText(el)) {
        const k = order.get(i) ?? 0;
        const start = 0.55 + 0.3 * (n > 1 ? k / (n - 1) : 0);
        const o = span(f, start, Math.min(1, start + 0.15));
        return { opacity: o, ty: 16 * (1 - o), scale: 1 };
      }
      if (isHeroImg(el)) return { opacity: 1, ty: 0, scale: 1 + PUSH_IN * (1 - settle) };
      return IDENTITY;
    },
  };
}

/**
 * 滚动位置 → 画面上的两层
 * @param {number} pos     0 … stops.length-1
 * @param {number} count   停点数
 * @returns {{ a:number, b:number|null, f:number }}  b = null：正好停在 a
 */
export function frameAt(pos, count) {
  if (!count) return { a: 0, b: null, f: 0 };
  const p = Math.min(Math.max(pos, 0), count - 1);
  const a = Math.floor(p + 1e-6);
  const f = p - a;
  if (f < 1e-3 || a >= count - 1) return { a: Math.min(a, count - 1), b: null, f: 0 };
  if (f > 1 - 1e-3) return { a: a + 1, b: null, f: 0 };
  return { a, b: a + 1, f };
}

/** 停手后吸到最近的停点（保证停下来就是完整原图） */
export const snapTarget = (pos, count) => Math.min(Math.max(Math.round(pos), 0), Math.max(0, count - 1));

/**
 * 滚轮 / 触控板停手后吸到哪一页：从 from 页出发，往一个方向滑过了 commit（一页的一小段）就翻过去，没到就回 from。
 * 以前是四舍五入：要滑过半页才翻 ——「从无到有」那一段等于鼠标滚 10 格，滚少了 1 秒后弹回原页。
 * 一次手势最多翻一页（from ± 1）。
 */
export const WHEEL_COMMIT = 0.12;
export function snapToward(pos, from, count, commit = WHEEL_COMMIT) {
  const d = pos - from;
  const to = Math.abs(d) >= commit ? from + Math.sign(d) : from;
  return Math.min(Math.max(to, 0), Math.max(0, count - 1));
}

/**
 * 这一下滚轮是不是「一格」（有刻度的鼠标滚轮）：是 → 直接翻一页；不是（触控板、无刻度滚轮的细碎小步）→ 跟手滑。
 *   · 按行 / 按页报的（Firefox、部分鼠标驱动）
 *   · 一下就 80 px 以上（Windows 的鼠标一格 100 px）。高分屏（4K 电视、缩放 150–200% 的笔电）上浏览器报的数会除以缩放倍数
 *     （200% 时一格只报 50），所以先乘回屏幕的缩放倍数 dpr 再比
 *   · macOS 的鼠标：deltaY 只有几 px，但旧式的 wheelDeltaY 是 120 的整数倍
 * 触控板快速一甩偶尔也会被算成一格 —— 那本来就是要翻页，结果一样。
 * @param {{ deltaMode?:number, wheelDeltaY?:number }} e
 * @param {number} px   这一下换算成 px 的滚动量（主方向）
 * @param {number} dpr  window.devicePixelRatio
 */
export function isWheelStep(e, px, dpr = 1) {
  if (!px) return false;
  if (e.deltaMode === 1 || e.deltaMode === 2) return true;
  if (Math.abs(px) * Math.max(1, dpr || 1) >= 80) return true;
  const wd = Math.abs(e.wheelDeltaY || 0);
  return wd >= 120 && wd % 120 === 0;
}

/** 元素样式 → CSS（给 SlideCanvas 的 elStyle） */
export function cssOf(m) {
  if (!m || (m.opacity === 1 && !m.ty && m.scale === 1)) return null;
  return { opacity: m.opacity, transform: m.ty ? `translate3d(0, ${m.ty.toFixed(2)}px, 0)` : undefined, imgScale: m.scale };
}

/** 从 3D 停点进房间：前 35% 只做「高亮 + 推近」，之后下一页才开始（线稿 → 上色），见 enterProgress */
export const ENTER_SPLIT = 0.35;
/** 进房间时，下一页（效果图）用的进度：前 35% 还没开始 */
export const enterProgress = (f) => clamp01((f - ENTER_SPLIT) / (1 - ENTER_SPLIT));

/**
 * 3D 户型开场那一层（停点 kind 'plan3d'）的样子
 *   进场（build，role b）：原平面图在纸上 → 关键帧依次（墙升起、柜子出现）→ 房间逐个亮一下 → f = 1 完整 3D 图、无高亮
 *   离场（enter，role a）：要去的房间亮起、镜头向它推近，再淡出（下一页的效果图同时线稿 → 上色）
 *   停点：最后一帧原样（不高亮、不放大）
 * @param {{ frames:number, areas:number, target?:number }} info  关键帧数、房间数、要去的房间（-1 = 不知道）
 * @returns {{ opacity, frameT, planAlpha, highlights:[{ i, alpha }], zoom, zoomArea }}
 */
export function plan3dMotion(role, kind, f, info) {
  const n = Math.max(1, info.frames);
  const last = n - 1;
  const still = { opacity: 1, frameT: last, planAlpha: 0, highlights: [], zoom: 1, zoomArea: -1 };
  if (role === 'b') {
    if (f >= 1) return still;
    if (kind !== 'build') return { ...still, opacity: span(f, 0.3, 0.75) };
    const m = Math.max(1, info.areas);
    const highlights = [];
    for (let i = 0; i < info.areas; i++) {
      const s = 0.85 + 0.08 * (m > 1 ? i / (m - 1) : 0);
      const t = clamp01((f - s) / 0.06);
      if (t > 0 && t < 1) highlights.push({ i, alpha: Math.sin(Math.PI * t) * 0.9 });
    }
    return {
      opacity: span(f, 0, 0.12),
      frameT: clamp01((f - 0.2) / 0.65) * last,
      planAlpha: 1 - span(f, 0.14, 0.26),
      highlights,
      zoom: 1,
      zoomArea: -1,
    };
  }
  if (f <= 0) return still;
  if (kind !== 'enter') return { ...still, opacity: 1 - span(f, 0.25, 0.7) };
  const target = info.target ?? -1;
  return {
    ...still,
    opacity: 1 - span(f, ENTER_SPLIT, ENTER_SPLIT + 0.25),
    highlights: target >= 0 ? [{ i: target, alpha: 0.9 * span(f, 0, 0.15) }] : [],
    zoom: 1 + 0.7 * span(f, 0, ENTER_SPLIT + 0.25),
    zoomArea: target,
  };
}

/**
 * 一张效果图元素在画布上的两个框：clip = 看得见的框，img = 整张图（含裁掉的部分）铺开的位置。
 * SlideCanvas 的 ImgEl 就是这样画的（clip 是 overflow:hidden 的框，img 在里面偏移）。
 */
export function imageRects(el) {
  const pl = placeImage(el);
  const { l, t, r, b } = pl.crop;
  const iw = pl.w / (1 - l - r || 1);
  const ih = pl.h / (1 - t - b || 1);
  return { clip: { x: pl.x, y: pl.y, w: pl.w, h: pl.h }, img: { x: pl.x - l * iw, y: pl.y - t * ih, w: iw, h: ih } };
}

// a·(1−t) + b·t：t = 0 / 1 时正好是 a / b（不留浮点误差）
const mix = (a, b, t) => a * (1 - t) + b * t;
const lerpRect = (a, b, t) => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), w: mix(a.w, b.w, t), h: mix(a.h, b.h, t) });

/** 设计特点：效果图从 A 的样子（t = 0，和 A 页一模一样）移到 B 的样子（t = 1，和 B 页一模一样） */
export function morphRects(fromEl, toEl, t) {
  const a = imageRects(fromEl);
  const b = imageRects(toEl);
  const k = clamp01(t);
  return { clip: lerpRect(a.clip, b.clip, k), img: lerpRect(a.img, b.img, k) };
}
