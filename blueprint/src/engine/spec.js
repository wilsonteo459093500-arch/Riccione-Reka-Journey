// 元素规格（Element Spec）—— 一张幻灯片 = { bg, els: Element[] }，网页预览与 PPT 导出共用同一份数据，
// 保证「看到的就是导出的」。坐标单位 px（画布 1920×1080），字号/字距单位 pt。
//
// Element 三种：
//   { t:'rect', x,y,w,h, fill?:'RRGGBB', alpha?:0–1, grad?:{ angle, stops:[{pos(0–100), color, alpha}] } }
//       angle 采用 OOXML 习惯：0 = 从左到右，90 = 从上到下，270 = 从下到上（pos 0 在底部）
//   { t:'img',  x,y,w,h, src, fit?:'cover'|'contain'|'stretch', ax?:0–1, ay?:0–1, nat?:{w,h}, crop?:{l,t,r,b} }
//       src：'/template/xx.jpg'（静态）或 'asset:<id>'（项目素材，IndexedDB）
//       crop：显式裁切比例（0–1，可为负 = 留白），给出时忽略 fit
//   { t:'text', x,y,w,h, valign?:'t'|'ctr'|'b', paras:[{ align?:'l'|'ctr'|'r', lineSpacing?:百分比, runs:[Run] }] }
//       Run = { text, font:'serif'|'display'|'sans', size, color, alpha?, spacing?, bold? }；text 里的 \n = 段内换行
//       autofit:'shrink' = 文字超框时自动缩小（PPT normAutofit，公司模板页沿用定稿设置）；nowrap = 预览时不折行
// 所有元素可带 edit:{ field, label } —— 编辑器据此把画布上的字对应回数据字段。

import { FONTS, PX_PER_PT, SLIDE_W, SLIDE_H } from '../theme.js';

export const rect = (x, y, w, h, fill, alpha = 1, extra = {}) => ({ t: 'rect', x, y, w, h, fill, alpha, ...extra });

export const gradRect = (x, y, w, h, angle, stops, extra = {}) => ({ t: 'rect', x, y, w, h, grad: { angle, stops }, ...extra });

export const img = (x, y, w, h, src, opts = {}) => ({ t: 'img', x, y, w, h, src, fit: 'cover', ax: 0.5, ay: 0.5, ...opts });

/** 单一样式的文字框；content 中的 \n 拆成多段 */
export function text(x, y, w, h, content, style, opts = {}) {
  const { align = 'l', lineSpacing, valign, edit, name } = opts;
  const paras = String(content ?? '')
    .split('\n')
    .map((line) => ({ align, ...(lineSpacing ? { lineSpacing } : {}), runs: [{ ...style, text: line }] }));
  return { t: 'text', x, y, w, h, paras, ...(valign ? { valign } : {}), ...(edit ? { edit } : {}), ...(name ? { name } : {}) };
}

/** 多段多样式文字框：paras = [{ align, lineSpacing, runs:[{...style, text}] }] */
export const richText = (x, y, w, h, paras, opts = {}) => ({ t: 'text', x, y, w, h, paras, ...opts });

// ---------------------------------------------------------------------------
// 文字宽度估算（排版决策用：换行数、右对齐列宽）。故意略微偏宽，宁可提前换行也不溢出。
// ---------------------------------------------------------------------------

const CJK = /[⺀-鿿豈-﫿︰-﹏＀-￯　-〿]/;

function charEm(ch, font) {
  if (CJK.test(ch)) return 1.0;
  if (ch === ' ') return 0.3;
  // 中点在中文字体里常按全角渲染（PowerPoint / WPS / LibreOffice 都会），按 0.7em 估，宁宽勿窄
  if (ch === '·' || ch === '•') return 0.7;
  if (ch === '.' || ch === ',' || ch === ':' || ch === ';' || ch === '\'' || ch === '|') return 0.32;
  if (/[0-9]/.test(ch)) return 0.58;
  if (/[A-Z]/.test(ch)) return font === 'display' ? 0.7 : ch === 'M' || ch === 'W' ? 0.86 : 0.66;
  if (/[a-z]/.test(ch)) return ch === 'm' || ch === 'w' ? 0.8 : ch === 'i' || ch === 'l' || ch === 'j' ? 0.28 : 0.54;
  return 0.6;
}

/** 估算一行文字宽度（px） */
export function measureText(str, font = 'sans', sizePt = 18, spacingPt = 0) {
  const sizePx = sizePt * PX_PER_PT;
  let w = 0;
  for (const ch of String(str ?? '')) w += charEm(ch, font) * sizePx + spacingPt * PX_PER_PT;
  return w;
}

/** 估算在给定宽度内折成几行（按字符贪心折行，英文单词不拆） */
export function countLines(str, font, sizePt, spacingPt, boxW) {
  // 不同软件 / 回退字体的字宽有出入：可用宽度打 94 折，宁可多估一行也不让下一块内容被压住
  const avail = Math.max(10, (boxW - 6) * 0.94);
  let lines = 0;
  for (const para of String(str ?? '').split('\n')) {
    lines += 1;
    let cur = 0;
    // 英文按单词、中文按字切分
    const tokens = para.match(/[A-Za-z0-9&'’\-./]+\s*|[^A-Za-z0-9&'’\-./]/g) || [];
    for (const tok of tokens) {
      const tw = measureText(tok, font, sizePt, spacingPt);
      if (cur > 0 && cur + tw > avail) {
        lines += 1;
        cur = tw;
      } else {
        cur += tw;
      }
    }
  }
  return Math.max(1, lines);
}

/** 一行文字的行高（px）：PowerPoint 单倍行距 ≈ 1.2 × 字号 */
export const lineHeightPx = (sizePt, lineSpacingPct = 100) => sizePt * PX_PER_PT * 1.2 * (lineSpacingPct / 100);

/**
 * autofit:'shrink' 的文字框：在引擎里先把字号缩到放得下，网页预览和 PPT（PowerPoint / WPS / Keynote / LibreOffice）结果一致，
 * 不依赖各软件各自的「自动缩小」。
 *   nowrap（单行框）：最宽的一段放得进宽度；fitWrap（设计师改过字的多行框）：总行高放得进高度。
 *   定稿模板原文不动（它们本来就是按字量贴身量好的）。最小缩到 50%。
 */
export function fitText(el, minScale = 0.5) {
  if (!el || el.t !== 'text' || el.autofit !== 'shrink' || (!el.nowrap && !el.fitWrap)) return el;
  const paras = el.paras || [];
  const paraW = (p, k) => p.runs.reduce((w, r) => w + measureText(r.text, r.font, (r.size || 18) * k, (r.spacing || 0) * k), 0);
  const parasH = (ps, k) =>
    ps.reduce((total, p) => {
      const r0 = p.runs[0] || {};
      const size = (r0.size || 18) * k;
      return total + countLines(p.runs.map((r) => r.text).join(''), r0.font, size, (r0.spacing || 0) * k, el.w) * lineHeightPx(size, p.lineSpacing || 100);
    }, 0);
  // fitRef = 定稿原文：原文放得下（定稿就是这么排的），所以可用空间至少是原文的量
  const ref = el.fitRef;
  const availW = Math.max((el.w - 6) * 0.97, ref ? Math.max(0, ...ref.map((p) => paraW(p, 1))) : 0);
  const availH = Math.max(el.h + 2, ref ? parasH(ref, 1) : 0);
  const fits = (k) => (el.nowrap ? paras.every((p) => paraW(p, k) <= availW + 0.01) : parasH(paras, k) <= availH + 0.01);
  if (fits(1)) return el;
  let k = 1;
  while (k > minScale + 1e-9 && !fits(k)) k = Math.round((k - 0.04) * 100) / 100;
  k = Math.max(minScale, k);
  return {
    ...el,
    paras: paras.map((p) => ({
      ...p,
      runs: p.runs.map((r) => ({ ...r, size: Math.round((r.size || 18) * k * 2) / 2, ...(r.spacing ? { spacing: Math.round(r.spacing * k * 100) / 100 } : {}) })),
    })),
    shrunk: k,
  };
}

// ---------------------------------------------------------------------------
// 图片摆放：cover = 裁满；contain = 完整放进框（按 ax/ay 对齐）；stretch = 拉伸
// 返回 { x,y,w,h, crop:{l,t,r,b} }（crop 为裁掉的比例，PPT srcRect / 网页预览共用）
// ---------------------------------------------------------------------------

export function placeImage(el) {
  const box = { x: el.x, y: el.y, w: el.w, h: el.h };
  if (el.crop) return { ...box, crop: { l: 0, t: 0, r: 0, b: 0, ...el.crop } };
  const nat = el.nat;
  const none = { l: 0, t: 0, r: 0, b: 0 };
  if (!nat || !nat.w || !nat.h || el.fit === 'stretch') return { ...box, crop: none };
  const ia = nat.w / nat.h;
  const ba = el.w / el.h;
  const ax = el.ax ?? 0.5;
  const ay = el.ay ?? 0.5;
  if (el.fit === 'contain') {
    if (ia > ba) {
      const h = el.w / ia;
      return { x: el.x, y: el.y + (el.h - h) * ay, w: el.w, h, crop: none };
    }
    const w = el.h * ia;
    return { x: el.x + (el.w - w) * ax, y: el.y, w, h: el.h, crop: none };
  }
  // cover
  if (ia > ba) {
    const cut = 1 - ba / ia;
    return { ...box, crop: { l: cut * ax, r: cut * (1 - ax), t: 0, b: 0 } };
  }
  const cut = 1 - ia / ba;
  return { ...box, crop: { l: 0, r: 0, t: cut * ay, b: cut * (1 - ay) } };
}

// ---------------------------------------------------------------------------
// 杂项
// ---------------------------------------------------------------------------

/** {{token}} 填充；未知 token 置空 */
export const fillTokens = (str, tokens) => String(str ?? '').replace(/\{\{(\w+)\}\}/g, (_, k) => tokens[k] ?? '');

export const fontCss = (key) => (FONTS[key] || FONTS.sans).css;

export const hexA = (hex, alpha = 1) => {
  const h = String(hex || '000000').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

/** 元素是否落在画布内（导出前自检用） */
export const inCanvas = (el) => el.x < SLIDE_W && el.y < SLIDE_H && el.x + el.w > 0 && el.y + el.h > 0;

/** 文字是否含中日韩字符（决定标题用宋体还是 Ogg） */
export const hasCJK = (s) => CJK.test(String(s ?? ''));
