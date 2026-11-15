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

import { SLIDE_W, SLIDE_H } from '../theme.js';

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

/**
 * 某一页在过渡里的样子
 * @param {'a'|'b'} role   a = 离开的那页，b = 进来的那页
 * @param {'cut'|'same'} kind
 * @param {number} f       0–1（0 = 停在 A，1 = 停在 B）
 * @param {object[]} els   这一页的元素（决定字的先后顺序）
 * @returns {{ opacity:number, el:(el:object, i:number)=>({opacity,ty,scale}) }}
 */
export function layerMotion(role, kind, f, els = []) {
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

/** 元素样式 → CSS（给 SlideCanvas 的 elStyle） */
export function cssOf(m) {
  if (!m || (m.opacity === 1 && !m.ty && m.scale === 1)) return null;
  return { opacity: m.opacity, transform: m.ty ? `translate3d(0, ${m.ty.toFixed(2)}px, 0)` : undefined, imgScale: m.scale };
}
