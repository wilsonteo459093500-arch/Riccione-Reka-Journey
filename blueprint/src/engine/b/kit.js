// B 格物 版式工具：网格、字级、文字块（固定行高、精确高度）、中英并排 / 上下对照、图片、细线。
// 所有新页面都用它拼：坐标单位 px（画布 1920×1080），字号写进元素时换成 pt。
//
// 设计规则（摘自定稿样张）：
//   网格 12 栏：栏宽 118、栏距 24、左右边距 120（第 n 栏起点 x = 120 + 142·(n−1)）；上边 96，文字底线 984
//   四种字级：display（封面 / 章节标题）· head（页标题）· body（正文、材料值）· cap（标签、说明、编号）
//   中文 思源黑体 Light（cap 用 Regular），英文 Hanken Grotesk Light；英文 display 用 Ysabeau Office Light
//   中英并重：两种文字同等大小，左右两栏并排，或中文在上英文在下
//   不压暗、不在效果图上放字；没有页脚、页码、装饰短线；细线只用在列表里

import { B, PX_PER_PT } from '../../theme.js';
import { measureText } from '../spec.js';

export { B };

// ---------------------------------------------------------------------------
// 网格
// ---------------------------------------------------------------------------

export const GRID = { left: 120, right: 1800, top: 96, bottom: 984, col: 118, gutter: 24, W: 1920, H: 1080 };

/** 第 n 栏（1–12）的起点 x */
export const colX = (n) => GRID.left + (GRID.col + GRID.gutter) * (n - 1);

/** 跨 n 栏的宽度 */
export const spanW = (n) => n * GRID.col + (n - 1) * GRID.gutter;

// ---------------------------------------------------------------------------
// 字级：px 字号、px 固定行高、em 字距
// ---------------------------------------------------------------------------

export const TYPE = {
  zh: {
    display: { font: 'light', px: 64, lh: 88, track: 0.08, color: B.ink },
    head: { font: 'light', px: 44, lh: 64, track: 0.06, color: B.ink },
    body: { font: 'light', px: 22, lh: 40, track: 0.06, color: B.ink },
    cap: { font: 'regular', px: 18, lh: 28, track: 0.08, color: B.grey },
  },
  en: {
    display: { font: 'title', px: 58, lh: 88, track: 0, color: B.ink },
    head: { font: 'light', px: 46, lh: 56, track: -0.005, color: B.ink },
    body: { font: 'light', px: 23, lh: 36, track: 0, color: B.ink },
    cap: { font: 'regular', px: 18, lh: 28, track: 0.01, color: B.grey },
  },
};

/** 中文、英文上下对照时两块之间多空的距离（display / head / cap 紧贴，正文空一点） */
export const STACK_GAP = { display: 0, head: 0, body: 24, cap: 0 };

/** 文字框内边距（与 PPT 25400 EMU、SlideCanvas 一致） */
export const INSET = 25400 / 9525;

const ptOf = (px) => Math.round((px / PX_PER_PT) * 100) / 100;

/** 一种字级的样式（可覆盖：px / lh / track / color / font） */
export function styleOf(lang, role, over = {}) {
  const base = TYPE[lang === 'en' ? 'en' : 'zh'][role] || TYPE.zh.body;
  return { ...base, ...over };
}

// ---------------------------------------------------------------------------
// 文字：按书写系统切 run（中文加字距，夹在中文里的英文、数字不加；标题里的全角逗号收半格）
// ---------------------------------------------------------------------------

const CJK = /[⺀-鿿豈-﫿︰-﹏＀-￯　-〿]/;
const HALF_PUNCT = /[，、；：]/;

export const hasCJK = (s) => CJK.test(String(s ?? ''));

/**
 * 一行文字 → runs。中文段落里的拉丁字母 / 数字不加字距；display / head 的全角逗号、顿号收成半格宽
 * @returns {Array<{ text, font, size, spacing, color, lang }>}
 */
export function runsOf(line, st, lang, role) {
  const sizePt = ptOf(st.px);
  const base = { font: st.font, size: sizePt, color: st.color, lang: lang === 'en' ? 'en' : 'zh' };
  const tracked = Math.round(st.track * sizePt * 100) / 100;
  if (lang === 'en' || !st.track) return [{ ...base, text: line, spacing: tracked || 0 }];
  const runs = [];
  const push = (text, spacing) => {
    const last = runs[runs.length - 1];
    if (last && last.spacing === spacing) last.text += text;
    else runs.push({ ...base, text, spacing });
  };
  for (const ch of String(line)) {
    if ((role === 'display' || role === 'head') && HALF_PUNCT.test(ch)) push(ch, Math.round(-0.5 * sizePt * 100) / 100);
    else if (CJK.test(ch)) push(ch, tracked);
    else push(ch, 0);
  }
  // 空格前后是拉丁字母时属于拉丁段（不加字距），已在上面的分支里
  return runs.map((r) => ({ ...r, spacing: r.spacing || 0 }));
}

/** 一行（不折行）的宽度 px */
export const lineWidth = (runs) => runs.reduce((w, r) => w + measureText(r.text, r.font, r.size, r.spacing || 0), 0);

/**
 * 一行文字在 w 宽里折成几行（按词 / 按字贪心折行；可用宽度按 98% 算，字宽表是实测的）
 */
export function wrapCount(line, st, lang, role, w) {
  const runs = runsOf(line, st, lang, role);
  const avail = Math.max(10, (w - 2 * INSET) * 0.98);
  let lines = 1;
  let cur = 0;
  for (const r of runs) {
    const tokens = String(r.text).match(/[A-Za-z0-9&'’\-./%]+\s*|\s+|./gu) || [];
    for (const tok of tokens) {
      const tw = measureText(tok, r.font, r.size, r.spacing || 0);
      if (cur > 0 && cur + tw > avail && tok.trim()) {
        lines += 1;
        cur = measureText(tok.trimStart(), r.font, r.size, r.spacing || 0);
      } else {
        cur += tw;
      }
    }
  }
  return lines;
}

/**
 * 文字块：一种字级，\n = 换段（同样的固定行高）。y = 第一行行框的顶（与样张的 top 一致）
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {string} str
 * @param {'zh'|'en'} lang
 * @param {'display'|'head'|'body'|'cap'} role
 * @param {{ align?:'l'|'r'|'ctr', over?:object, edit?:object, nowrap?:boolean, name?:string, maxLines?:number }} opts
 * @returns {{ el:object, h:number, lines:number, bottom:number }}  bottom = 最后一行行框的底
 */
export function block(x, y, w, str, lang, role, opts = {}) {
  const st = styleOf(lang, role, opts.over);
  const text = String(str ?? '');
  const parts = text.split('\n');
  let lines = 0;
  const paras = parts.map((line) => {
    lines += opts.nowrap ? 1 : wrapCount(line, st, lang, role, w);
    return { align: opts.align || 'l', lineHeight: st.lh, runs: runsOf(line, st, lang, role) };
  });
  const h = lines * st.lh;
  const el = {
    t: 'text',
    x,
    y: y - INSET,
    w,
    h: h + 2 * INSET,
    paras,
    ...(opts.nowrap ? { nowrap: true } : {}),
    ...(opts.edit ? { edit: opts.edit } : {}),
    ...(opts.name ? { name: opts.name } : {}),
  };
  return { el, h, lines, bottom: y + h };
}

// ---------------------------------------------------------------------------
// 中英：按提案语言取文字
// ---------------------------------------------------------------------------

/** 这一页显示哪些语言（华文 = 中文；English = 英文；中英 = 两种） */
export const langsOf = (lang) => (lang === 'en' ? ['en'] : lang === 'bi' ? ['zh', 'en'] : ['zh']);

/**
 * 一对中英文 → 要显示的几块 [{ lang, text, field }]
 *   English 版缺英文时先显示中文（翻译器已记下，页面上会提醒）；中英版缺英文就只显示中文
 * @param {'zh'|'en'|'bi'} lang
 * @param {{ zh?:string, en?:string, field?:string, fieldEn?:string }} pair
 */
export function pick(lang, pair) {
  const zh = String(pair?.zh ?? '').trim();
  const en = String(pair?.en ?? '').trim();
  const out = [];
  if (lang === 'en') {
    if (en) out.push({ lang: 'en', text: en, field: pair.fieldEn || pair.field });
    else if (zh) out.push({ lang: 'zh', text: zh, field: pair.field });
    return out;
  }
  if (zh) out.push({ lang: 'zh', text: zh, field: pair.field });
  if (lang === 'bi' && en && en !== zh) out.push({ lang: 'en', text: en, field: pair.fieldEn || pair.field });
  return out;
}

/**
 * 上下对照：中文在上、英文在下（单语言只有一块）
 * @returns {{ els:object[], bottom:number, blocks:object[] }}
 */
export function stack(x, y, w, role, pair, lang, opts = {}) {
  const els = [];
  const blocks = [];
  let cur = y;
  pick(lang, pair).forEach((it, i) => {
    if (i > 0) cur += opts.gap ?? STACK_GAP[role] ?? 0;
    const b = block(x, cur, w, it.text, it.lang, role, { ...opts, edit: it.field ? { field: it.field } : opts.edit });
    els.push(b.el);
    blocks.push(b);
    cur = b.bottom;
  });
  return { els, bottom: cur, blocks };
}

/**
 * 左右并排：中英版 中文一栏、英文一栏，顶部对齐；单语言只用第一栏
 * @param {[number, number]} xs  两栏的 x
 * @param {[number, number]} ws  两栏的宽
 */
export function side(xs, y, ws, role, pair, lang, opts = {}) {
  const items = pick(lang, pair);
  const els = [];
  let bottom = y;
  items.forEach((it, i) => {
    const col = items.length === 1 ? 0 : i;
    const b = block(xs[col], y, opts.singleW && items.length === 1 ? opts.singleW : ws[col], it.text, it.lang, role, {
      ...opts,
      edit: it.field ? { field: it.field } : opts.edit,
    });
    els.push(b.el);
    bottom = Math.max(bottom, b.bottom);
  });
  return { els, bottom };
}

/** 一对文字在某语言下的高度（不生成元素，排版前量） */
export function measureStack(w, role, pair, lang, opts = {}) {
  return stack(0, 0, w, role, pair, lang, opts).bottom;
}

// ---------------------------------------------------------------------------
// 图片、细线、页
// ---------------------------------------------------------------------------

/**
 * 照片 / 效果图：裁满框（cover），可指定取景重心 ax / ay（0–1）。不加任何压暗
 * @param {{ ax?:number, ay?:number, nat?:{w:number,h:number}, edit?:object, name?:string }} opts
 */
export function photo(x, y, w, h, src, opts = {}) {
  return {
    t: 'img',
    x,
    y,
    w,
    h,
    src,
    fit: 'cover',
    ax: opts.ax ?? 0.5,
    ay: opts.ay ?? 0.5,
    ...(opts.nat ? { nat: opts.nat } : {}),
    ...(opts.edit ? { edit: opts.edit } : {}),
    ...(opts.name ? { name: opts.name } : {}),
  };
}

/** 照片在框里被放大了多少（> 1 = 放大；> 1.15 会发虚） */
export function upscale(nat, w, h) {
  if (!nat?.w || !nat?.h) return 1;
  return Math.max(w / nat.w, h / nat.h);
}

/** 细线（列表的分隔线） */
export const hair = (x, y, w, color = B.hair) => ({ t: 'rect', x, y, w, h: 1, fill: color });

/** 一页：奶白纸底 */
export const page = (els, warnings = [], extra = {}) => ({ bg: B.paper, els: els.filter(Boolean), warnings, ...extra });

// ---------------------------------------------------------------------------
// 属性列表（材料 / 联系方式）：标签一栏、值一栏、编号靠右；行与行之间细线
// ---------------------------------------------------------------------------

/**
 * @param {number} x       列表左边
 * @param {number} y       第一条细线的 y
 * @param {number} w       列表宽（细线长度）
 * @param {Array<{ label:{zh,en}, value:{zh,en}, code?:string, field?:string }>} rows
 * @param {'zh'|'en'|'bi'} lang
 * @param {{ labelW?:number }} opts  标签栏宽（默认 96）
 * @returns {{ els:object[], bottom:number }}  bottom = 最后一条细线的 y
 */
export function attrList(x, y, w, rows, lang, opts = {}) {
  const labelW = opts.labelW ?? 96;
  const els = [hair(x, y, w)];
  let cur = y;
  for (const row of rows) {
    const top = cur + 10;
    const label = stack(x, top + 1, labelW - 8, 'cap', row.label, lang, { nowrap: true });
    const value = stack(x + labelW, top, w - labelW - (row.code ? 96 : 0), 'body', { ...row.value, field: row.field }, lang, { gap: 0 });
    els.push(...label.els, ...value.els);
    if (row.code) {
      els.push(block(x + w - 160, top + 1, 160, row.code, 'en', 'cap', { align: 'r', nowrap: true }).el);
    }
    cur = Math.max(label.bottom, value.bottom) + 10;
    els.push(hair(x, cur, w));
  }
  return { els, bottom: cur };
}

/** 把一组元素整体上下挪 dy（先在 y=0 排好、量出高度，再「落」到底线上） */
export const shift = (els, dy) => els.map((el) => ({ ...el, y: el.y + dy }));

/**
 * 底对齐：builder(y) 在给定起点排版并返回 { els, bottom }；先试排量高度，再让 bottom 正好落在 bottomY
 * @param {(y:number)=>{els:object[], bottom:number}} builder
 */
export function restOn(bottomY, builder) {
  const trial = builder(0);
  return builder(bottomY - trial.bottom);
}
