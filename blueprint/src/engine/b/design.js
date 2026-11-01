// B 格物 · 方案页（Specimen）—— 样张 /tmp/claude-0/design/boards/B/p4（小样网格）、p5（满版）、p6（图文）的规则落成版式。
//
//   bDesignCover(ctx)                       方案封面：Material Board 完整放进右侧（不裁），左栏 章节标签 · 标题 · 楼层
//   bFloor(ctx, slide)                      楼层章节页：大图出血（上 / 左 / 下），右栏 楼层名 + 本层空间
//   bViewFull(ctx, slide, plan?)            效果图满版：只有图
//   bViewPlate(ctx, slide)                  效果图图文：图出血（上 / 左），右栏 标签 · 标题 · 材料表；说明放在图下（放不下进右栏）
//   bMaterials(ctx, mats, i, n, perPage?)   本案材料：材料小样网格（i = 第几页，从 0 起；n = 共几页；perPage = 每页最多几种）
//   bTeam(ctx)                              本案团队
//   planViews(project, meta)                每张效果图用满版还是图文 → Map(slideId → 'full'|'plate')
//   bViewPage(ctx, slide, plan)             按 plan 分派
//   floorPageImage(project, slide, meta)    楼层页实际用哪张图（编辑器显示「自动」用）
//
// ctx = { project, lang:'zh'|'en'|'bi', tr: makeTranslator(project), meta(src) → {w,h}|null }
// 每个函数返回 kit page() 的 { bg, els, warnings }（bDesignCover 没有 Material Board 时返回 null）。
// 网格、字级、颜色只用 kit.js；坐标 px（1920×1080）。图不压暗、图上不放字；没有页码、页脚、装饰线（细线只在列表里）。
// 文字的 x / w 都是「字」的位置与栏宽（框向左右各让出内边距，与样张、公司页一致）。

import { B, GRID, colX, spanW, STACK_GAP, INSET, styleOf, block, pick, photo, upscale, hair, page, hasCJK } from './kit.js';
import { widthOf, room, balanceText } from './text.js';
import { findFloor, findMaterial, floorsLine } from '../model.js';
import { makeTranslator, langOf, floorTitleEn, floorsLineEn, resolveEn, memoryEn } from '../lang.js';
import { chapterZh, chapterEn } from './company.js';

export { balanceLine } from './text.js';

const W = GRID.W;
const H = GRID.H;
const TOP = GRID.top; // 96：文字从这里往下挂
const FOOT = GRID.bottom; // 984：文字落在这条线上
const RIGHT = GRID.right; // 1800
const COL10 = colX(10); // 1398：右栏（第 10–12 栏）

// ---------------------------------------------------------------------------
// 环境、量字
// ---------------------------------------------------------------------------

/** 没传翻译器时按 ctx.lang 自建一个（测试 / 单独调用） */
function env(ctx = {}) {
  const project = ctx.project || {};
  const lang = ctx.lang === 'en' || ctx.lang === 'bi' || ctx.lang === 'zh' ? ctx.lang : ctx.tr?.lang || langOf(project);
  const tr = ctx.tr || makeTranslator({ ...project, info: { ...(project.info || {}), lang } });
  const meta = typeof ctx.meta === 'function' ? ctx.meta : () => null;
  return { project, lang, tr, meta };
}

// 网页预览里一行字的基线 = 行框顶 + 行高 / 2 + k·字号（k 由段落主字体的 ascent / descent 决定：
// Hanken Grotesk 1.000 / 0.303；Ysabeau Office 1.054 / 0.289）。中英并排、标签与值同一基线都按它对齐。
const BASE_K = { light: (1 - 0.303) / 2, regular: (1 - 0.303) / 2, title: (1.054 - 0.289) / 2 };

/** 行框顶到基线的距离 */
export function baseOff(lang, role, lh) {
  const st = styleOf(lang, role);
  return (lh ?? st.lh) / 2 + (BASE_K[st.font] ?? BASE_K.light) * st.px;
}

/** 拉丁字母写的标题（客户名 Mr Lau、英文人名）用英文的 display / head 字体与字号 */
const scriptOf = (it, role) => (it.lang === 'zh' && !hasCJK(it.text) && (role === 'display' || role === 'head') ? 'en' : it.lang);

/** 多行文字（\n 分行）里最宽的一行 */
const widestLine = (text, lang, role) => Math.max(0, ...String(text ?? '').split('\n').map((l) => widthOf(l, lang, role)));

/**
 * 文字块：x = 字的左边、w = 栏宽（框向左右各让出 INSET，字正好落在网格线上；与公司页 company.js 一致）
 * y = 第一行行框的顶。返回 kit block() 的 { el, h, lines, bottom }
 */
const blk = (x, y, w, str, lang, role, opts = {}) => block(x - INSET, y, w + 2 * INSET, str, lang, role, opts);

const editOf = (field) => (field ? { field } : undefined);
const clean = (s) => String(s ?? '').trim();

// 标题式英文里的虚词小写（titleCase 会写成 'Roof Garden And Terrace'）；第一个词、缩写不动
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'onto', 'or', 'the', 'to', 'with']);
const tidyTitle = (s) =>
  String(s ?? '')
    .split(' ')
    .map((w, i) => (i > 0 && /^[A-Z][a-z]+$/.test(w) && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w))
    .join(' ');

// 均衡断行（标题、说明、名称）：b/text.js（公司页也用）

// ---------------------------------------------------------------------------
// 图：效果图取景（水印不进画面）、缺图、细线框
// ---------------------------------------------------------------------------

/** 低像素提醒：放大超过 1.15 倍会发虚 */
function lowRes(warnings, scale, what = '') {
  if (scale > 1.15) warnings.push(`${what}图片像素偏低：放大 ${scale.toFixed(1)} 倍会发虚，建议换高清图`);
}

// 效果图右下角烙着「sAil 溪岸」水印（量过原稿里的效果图）：3840×2160 的图在宽 88.4–98.5%、高 90.6–97.3%，
// 即离右边 0.206 × 高、离底边 0.094 × 高；水印大小约为对角线的 10%（4000×3000 的图离右边 0.127 × 宽）。
// 设计师在原稿里只裁掉左边的图，水印照样在右下角、像素大小不变。按原图的比例算它占的范围（都留了余量）：
//   左边 = 离右边 max(14% 宽, 0.22 × 高)；上边 = 离底边 9.5%
// 样张 p5 / p6 的取景都把它留在画外：从顶部起取景、左右居中；水印还在画面里就略放大（最多放大到 1.15 倍）——
// 左右裁到水印的左边、或底部裁掉 9.5%，取放大得少的那个（楼层页的窄框左右本来就裁掉很多，16:9 的图不用再放大）。
// 上下要裁得多时上下平分。
const WM_CUT = 0.095;
const WM_SIDE = { w: 0.14, h: 0.22 };

/** 水印在原图里的范围：左边、上边（占原图的比例；右边、下边就是原图的右边、下边） */
const wmBox = (nat) => ({ l: 1 - Math.max(WM_SIDE.w, (WM_SIDE.h * nat.h) / nat.w), t: 1 - WM_CUT });

/**
 * 效果图 / 照片铺满框（cover），水印留在画外
 * @returns {{ el:object, scale:number, wmShown:boolean }} scale = 原图像素放大到页面的倍数（> 1.15 会发虚）；
 *   wmShown = 裁切后的画面里还有水印（为了不放大超过 1.15 倍，左右、底部都没能裁到它）
 */
function rendering(x, y, w, h, src, nat, field = 'image') {
  const base = photo(x, y, w, h, src, { nat, ax: 0.5, ay: 0, edit: editOf(field) });
  if (!nat?.w || !nat?.h) return { el: base, scale: 1, wmShown: false };
  const A = w / h;
  const S = nat.w / nat.h;
  const fw0 = S > A ? A / S : 1; // 刚好铺满时看得见的原图宽（占原图的比例）
  const fh0 = S > A ? 1 : S / A; // 看得见的原图高
  const cover = Math.max(w / nat.w, h / nat.h);
  const mark = wmBox(nat);
  // 放大多少水印才出画：左右居中时看得见的宽 ≤ 2·水印左边 − 1，或看得见的高 ≤ 1 − 9.5%
  const zx = 2 * mark.l - 1 > 0 ? fw0 / (2 * mark.l - 1) : Infinity;
  const zy = fh0 / (1 - WM_CUT);
  let z = Math.max(1, Math.min(zx, zy));
  if (cover * z > 1.15) z = Math.max(1, 1.15 / cover);
  const fw = fw0 / z;
  const fh = fh0 / z;
  const side = (1 - fw) / 2;
  const cutV = 1 - fh;
  const b = cutV >= 2 * WM_CUT ? cutV / 2 : Math.min(cutV, WM_CUT);
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  const crop = { l: r6(side), t: r6(cutV - b), r: r6(side), b: r6(b) };
  // 画面（裁切后看得见的范围）和水印的范围有重叠 = 水印露出来
  const wmShown = 1 - crop.r > mark.l + 1e-4 && 1 - crop.b > mark.t + 1e-4;
  return { el: { ...base, crop }, scale: cover * z, wmShown };
}

/**
 * 这张图铺满 w × h 时图片本身没毛病（这一页不会有像素偏低、水印的提醒）：
 *   像素够 —— 放大不超过 1.15 倍（不发虚）；水印留在画外 —— 为它略放大也不超过 1.15 倍。
 *   两样分开看：很宽的全景图左右裁掉得多，水印不用放大就出了画，但像素不够照样发虚
 */
const fillsClean = (nat, w, h) => {
  const r = rendering(0, 0, w, h, '', nat);
  return r.scale <= 1.15 && !r.wmShown;
};

/** 水印提醒：满版页建议换图文（图文的图小一些，裁得开）；图文页 / 楼层页只能换高清图（编辑器的一键修复按这两种说法分） */
export const WM_WARN = {
  full: '效果图右下角的水印会露出来（图片像素不够，裁不掉）—— 换高清图，或改用「图文」',
  plate: '效果图右下角的水印会露出来（图片像素不够，裁不掉）—— 换一张高清图',
};

/** 没有图：小样底色块（点它换图） */
const sampleRect = (x, y, w, h, field) => ({ t: 'rect', x, y, w, h, fill: B.sample, ...(field ? { edit: { field } } : {}) });

/** 缺效果图的位置：小样底色 + 页面里看得见的那几条边的细线（出血的边不画） */
function missingImage(x, y, w, h) {
  const els = [sampleRect(x, y, w, h, 'image')];
  if (y > 0) els.push(hair(x, y, w));
  if (y + h < H) els.push(hair(x, y + h - 1, w));
  if (x > 0) els.push({ t: 'rect', x, y, w: 1, h, fill: B.hair });
  if (x + w < W) els.push({ t: 'rect', x: x + w - 1, y, w: 1, h, fill: B.hair });
  return els;
}

/** 细线框（没有图的材料小样） */
const frame = (x, y, w, h) => [
  hair(x, y, w),
  hair(x, y + h - 1, w),
  { t: 'rect', x, y, w: 1, h, fill: B.hair },
  { t: 'rect', x: x + w - 1, y, w: 1, h, fill: B.hair },
];

// ---------------------------------------------------------------------------
// 文字组：上下对照（stack）、左右并排（side，首行同一基线）、落在底线上（rest）
// ---------------------------------------------------------------------------

/**
 * 上下对照：中文在上、英文紧跟（单语言一块）
 * @returns {{ els:object[], top:number, bottom:number, parts:Array<{lang,top,bottom,lines}> }}
 */
function stackB(x, y, w, role, pair, lang, opts = {}) {
  const els = [];
  const parts = [];
  let cur = y;
  pick(lang, pair).forEach((it, i) => {
    if (i > 0) cur += opts.gap ?? STACK_GAP[role] ?? 0;
    const L = scriptOf(it, role);
    const text = opts.balance ? balanceText(it.text, L, role, w) : it.text;
    const b = blk(x, cur, w, text, L, role, { align: opts.align, edit: editOf(it.field) });
    els.push(b.el);
    parts.push({ lang: L, top: cur, bottom: b.bottom, lines: b.lines });
    cur = b.bottom;
  });
  return { els, top: y, bottom: cur, parts };
}

/** 左右并排：中文一栏、英文一栏，首行基线相同（单语言只用第一栏，宽 singleW） */
function sideB(xs, ws, y, role, pair, lang, opts = {}) {
  const its = pick(lang, pair);
  const els = [];
  let bottom = y;
  const firstLang = its[0] ? scriptOf(its[0], role) : 'zh';
  its.forEach((it, i) => {
    const L = scriptOf(it, role);
    const single = its.length === 1;
    const top = i === 0 ? y : y + baseOff(firstLang, role) - baseOff(L, role);
    const b = blk(xs[single ? 0 : i], top, single && opts.singleW ? opts.singleW : ws[single ? 0 : i], it.text, L, role, { edit: editOf(it.field) });
    els.push(b.el);
    bottom = Math.max(bottom, b.bottom);
  });
  return { els, top: y, bottom };
}

/** 先在 0 试排量高度，再让整组的底正好落在 bottomY（返回带 top） */
function rest(bottomY, builder) {
  const trial = builder(0);
  const y = bottomY - trial.bottom;
  return { ...builder(y), top: y };
}

/**
 * 由几段拼成的一句（「一楼　餐厅」/「Ground Floor — Dining」）：每段都有英文才拼英文；
 * English 版缺的段先用中文（翻译器已记下、页面会提醒），中英版缺英文就整句只显示中文
 */
function joinPair(parts, sepZh, sepEn, lang) {
  const ps = parts.filter((p) => clean(p.zh) || clean(p.en));
  const zh = ps.map((p) => clean(p.zh) || clean(p.en)).join(sepZh);
  const complete = ps.every((p) => clean(p.en));
  let en = '';
  if (complete) en = ps.map((p) => clean(p.en)).join(sepEn);
  else if (lang === 'en') en = ps.map((p) => clean(p.en) || clean(p.zh)).join(sepEn);
  return { zh, en };
}

/** 页眉：标题（head，中英上下）挂在 96；右半边（第 9 栏）一句说明，各行与标题的同语言行同一基线（样张 p4） */
function header(lang, headPair, notePair) {
  const head = stackB(colX(1), TOP, spanW(7), 'head', headPair, lang);
  const els = [...head.els];
  let noteBottom = head.top;
  if (notePair) {
    let prev = -Infinity;
    pick(lang, notePair).forEach((it, i) => {
      const hp = head.parts[Math.min(i, head.parts.length - 1)];
      if (!hp) return;
      const top = Math.max(prev, hp.top + baseOff(hp.lang, 'head') - baseOff(it.lang, 'body'));
      const b = blk(colX(9), top, spanW(4), balanceText(it.text, it.lang, 'body', spanW(4)), it.lang, 'body');
      els.push(b.el);
      prev = b.bottom;
      noteBottom = Math.max(noteBottom, b.bottom);
    });
  }
  return { els, headBottom: head.bottom, noteBottom, bottom: Math.max(head.bottom, noteBottom) };
}

// ---------------------------------------------------------------------------
// 属性列表（与样张 p6 一致）：行 = 细线 + 10 + 中文行 + 英文行 + 10；标签、值、编号同一基线；
// 编号只印一次，在第一行、靠右；标签栏 96 / 142（整套图文页取同一档；更长的标签在栏里折行）
// 编号放在名称旁边最多占值栏的 40%（名称至少留 60%）；带品牌前缀的长编号（EGGER H1145 ST10）另起一行，
// 排在名称下面、仍靠右，过长时在空格 / - / 之后折行 —— 不再挤掉名称那一栏
// ---------------------------------------------------------------------------

const ROW_PAD = 10;
const LABEL_GAP = 12;
const CODE_GAP = 16;
const CODE_INLINE_MAX = 0.4;

const codeWidth = (code) => Math.ceil(widthOf(code, 'en', 'cap') + 2);

/** 编号在宽 w 的栏里折成几行（在空格、- / _ . 之后折；一段比栏还宽就按字硬折）→ 每行都放得下 */
function wrapCode(code, w) {
  const avail = room(w);
  const fits = (t) => widthOf(t.trimEnd(), 'en', 'cap') + 2 <= avail;
  const parts = String(code).match(/[^\s\-/_.]+[\s\-/_.]*|[\s\-/_.]+/g) || [String(code)];
  const lines = [];
  let cur = '';
  for (const p of parts) {
    if (fits(cur + p)) {
      cur += p;
      continue;
    }
    if (cur.trim()) lines.push(cur.trimEnd());
    let piece = p;
    while (!fits(piece) && piece.length > 1) {
      let k = piece.length - 1;
      while (k > 1 && !fits(piece.slice(0, k))) k -= 1;
      lines.push(piece.slice(0, k));
      piece = piece.slice(k);
    }
    cur = piece;
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  // 折成两行时两行长短接近（LAMINAM-CALCE- / BIANCO-12MM，而不是 …BIANCO- / 12MM）
  if (lines.length === 2 && parts.length > 2) {
    const width = (t) => widthOf(t.trimEnd(), 'en', 'cap');
    let best = null;
    for (let k = 1; k < parts.length; k++) {
      const a = parts.slice(0, k).join('');
      const b = parts.slice(k).join('');
      if (!fits(a) || !fits(b)) continue;
      const mx = Math.max(width(a), width(b));
      if (!best || mx < best.mx) best = { mx, lines: [a.trimEnd(), b.trimEnd()] };
    }
    if (best) return best.lines;
  }
  return lines;
}

/**
 * 编号放哪：{ inline:true, cw } = 名称第一行的右边；{ inline:false, lines } = 名称下面另起（靠右）；没有编号 = null
 * @param {number} colW  名称 + 编号共用的栏宽（图文页 = 值栏；材料页 = 小样宽）
 */
function codePlan(code, colW, gap = CODE_GAP) {
  if (!code) return null;
  const cw = codeWidth(code);
  if (cw + gap <= colW * CODE_INLINE_MAX) return { inline: true, cw };
  return { inline: false, lines: wrapCode(code, colW) };
}

/** 编号太长（另起一行还要折行）的提醒 */
const codeWarning = (code, lines) => `材料编号太长：「${code}」折成了 ${lines} 行 —— 建议精简（去材料清单改）`;

/**
 * 正文行里的小字（标签 / 编号）：与正文同一基线；行框收在正文这一行的行框里（不伸进下一行）
 * @returns {{ top:number, lh:number }}
 */
function capInLine(lineTop, lineLang, capLang) {
  const lh = styleOf(lineLang, 'body').lh;
  const st = styleOf(capLang, 'cap');
  const center = lineTop + baseOff(lineLang, 'body') - (BASE_K[st.font] ?? BASE_K.regular) * st.px;
  const half = Math.min(center - lineTop, lineTop + lh - center);
  return { top: center - half, lh: 2 * half };
}

/** 标签栏宽：96（样张）/ 142（到第 11 栏）；放不下最长标签就取 142，更长的在栏里折行 */
const LABEL_STEPS = [96, 142];
function labelColW(rows, lang) {
  let need = 0;
  for (const row of rows) for (const it of pick(lang, row.label || {})) need = Math.max(need, widthOf(it.text, it.lang, 'cap'));
  return LABEL_STEPS.find((s) => need + LABEL_GAP <= s) || LABEL_STEPS[LABEL_STEPS.length - 1];
}

/**
 * 整套图文页共用一个标签栏宽（翻页时材料名的左边线不跳）：按全部启用效果图页的材料部位量
 * （只查不记：这里不调用翻译器，免得把别的页缺的英文记到这一页）
 */
function deckLabelW(project, lang) {
  const rows = [];
  for (const s of project.slides || []) {
    if (s?.kind !== 'view' || s.enabled === false) continue;
    for (const r of s.materials || []) {
      const role = clean(r?.role);
      if (role) rows.push({ label: { zh: role, en: lang === 'zh' ? '' : resolveEn(project, role, 'role').text } });
    }
  }
  return labelColW(rows, lang);
}

/**
 * 一行属性
 * @param {{ label:{zh,en,field,fieldEn}, value:{zh,en,field,fieldEn}, code?:string, codeField?:string }} row
 */
function drawRow(x, top, w, labelW, row, lang) {
  const els = [hair(x, top, w)];
  const labels = pick(lang, row.label || {});
  const values = pick(lang, row.value || {});
  const n = Math.max(labels.length, values.length, 1);
  const cp = codePlan(row.code, w - labelW);
  let y = top + ROW_PAD;
  for (let k = 0; k < n; k++) {
    const lb = labels[k];
    const vl = values[k];
    const lineLang = (vl || lb || { lang: 'zh' }).lang;
    const lh = styleOf(lineLang, 'body').lh;
    const code = k === 0 && cp?.inline ? row.code : '';
    const cw = code ? cp.cw : 0;
    let h = lh;
    if (vl) {
      const vw = w - labelW - (code ? cw + CODE_GAP : 0);
      const b = blk(x + labelW, y, vw, balanceText(vl.text, vl.lang, 'body', vw), vl.lang, 'body', { edit: editOf(vl.field) });
      els.push(b.el);
      h = Math.max(h, b.h);
    }
    if (lb) {
      // 标签太长折行时：每一行占正文的一行，各自与那一行同一基线
      let slot = y;
      let lines = 0;
      for (const part of balanceText(lb.text, lb.lang, 'cap', labelW - LABEL_GAP).split('\n')) {
        const fit = capInLine(slot, lineLang, lb.lang);
        const b = blk(x, fit.top, labelW - LABEL_GAP, part, lb.lang, 'cap', { over: { lh: fit.lh }, edit: editOf(lb.field) });
        els.push(b.el);
        lines += b.lines;
        slot += b.lines * lh;
      }
      h = Math.max(h, lines * lh);
    }
    if (code) {
      const fit = capInLine(y, lineLang, 'en');
      els.push(blk(x + w - cw, fit.top, cw, code, 'en', 'cap', { align: 'r', over: { lh: fit.lh }, nowrap: true, edit: editOf(row.codeField) }).el);
    }
    y += h;
  }
  // 长编号：名称下面另起一行（靠右，与短编号同一条右边线）
  if (cp && !cp.inline) {
    const b = blk(x + labelW, y, w - labelW, cp.lines.join('\n'), 'en', 'cap', { align: 'r', edit: editOf(row.codeField) });
    els.push(b.el);
    y = b.bottom;
  }
  return { els, bottom: y + ROW_PAD };
}

/** 整张表：从 top 起排，最后一条细线在 bottom */
function drawList(x, top, w, rows, lang, labelW) {
  const els = [];
  let y = top;
  for (const row of rows) {
    const r = drawRow(x, y, w, labelW, row, lang);
    els.push(...r.els);
    y = r.bottom;
  }
  if (rows.length) els.push(hair(x, y, w));
  return { els, bottom: y };
}

// ---------------------------------------------------------------------------
// 方案封面（有 Material Board 时）
// ---------------------------------------------------------------------------

/** 方案封面的章节标签：方案是第几章（老客户隐藏了品牌 / 公司章节 → 往前排；ctx.chapters 由 deck.js 给，单独排时 = 第三章） */
const chapterPair = (ctx) => {
  const n = ctx?.chapters?.num?.design ?? 3;
  return { zh: `${chapterZh(n)}　方案`, en: `${chapterEn(n)} — Design` };
};
const DEFAULT_TITLE = '全屋定制设计方案';

/** 封面标题：自填的 coverTitle；否则客户与地点（各占一行，像公司封面的名牌）；都没有 = 方案名 */
function coverTitlePair(info, tr, lang) {
  const custom = clean(info.coverTitle);
  if (custom) {
    return hasCJK(custom)
      ? { zh: custom, en: tr.en(custom, 'text'), field: 'coverTitle', fieldEn: 'coverTitleEn' }
      : { zh: custom, en: custom, field: 'coverTitle', fieldEn: 'coverTitle' };
  }
  const parts = [info.client, info.location].map(clean).filter(Boolean);
  if (parts.length) {
    const p = joinPair(parts.map((s) => ({ zh: s, en: hasCJK(s) ? tr.en(s, 'text') : s })), '\n', '\n', lang);
    return { ...p, field: 'coverTitle', fieldEn: 'coverTitle' };
  }
  const t = clean(info.proposalTitle) || DEFAULT_TITLE;
  // 默认英文只配默认的方案名；自己改过的方案名没有英文就是缺英文（页面会提醒），不拿通用英文顶替
  return { zh: t, en: tr.en(t, 'text') || (t === DEFAULT_TITLE ? 'Whole-House Design Proposal' : ''), field: 'coverTitle', fieldEn: 'coverTitle' };
}

/** 封面副标题：自填的 coverSubtitle；空 = 楼层（一楼与二楼 / Ground & First Floor） */
function coverSubPair(project, tr) {
  const sub = clean(project.info?.coverSubtitle);
  if (sub) {
    return hasCJK(sub)
      ? { zh: sub, en: tr.en(sub, 'text'), field: 'coverSubtitle', fieldEn: 'coverSubtitleEn' }
      : { zh: sub, en: sub, field: 'coverSubtitle', fieldEn: 'coverSubtitle' };
  }
  return { zh: floorsLine(project.floors), en: tidyTitle(floorsLineEn(project.floors)), field: 'coverSubtitle', fieldEn: 'coverSubtitle' };
}

export function bDesignCover(ctx) {
  const { project, lang, tr, meta } = env(ctx);
  const cover = project.cover || {};
  if (!cover.image) return null;
  const info = project.info || {};
  const els = [];
  const warnings = [];

  // Material Board 是排好的拼贴：整张放进右侧，一点不裁，四周是纸；贴右、落在 984 —— 与左栏楼层那一行同一条底线。
  //   竖版 / 方形（宽高比 ≤ 970 : 888）：第 6–12 栏的面板里占满高度（上下各留 96）；
  //   横版：标题在窄的左栏里也排得下（每种语言都不超过 3 行）时，面板放宽到第 4–12 栏（1254 × 888）——
  //     A4 横正好占满高度，16:9 约 1254 × 705（不缩成 970 × 546 的一小块、上面空一大片纸）；
  //     客户名长的保持第 6–12 栏的面板（左栏 656 宽），不把标题挤成沿着左边的一长条
  const nat = meta(cover.image);
  const r = nat?.w && nat?.h ? nat.w / nat.h : 3 / 4;
  const boxH = FOOT - TOP;
  const narrow = { x: colX(6), w: RIGHT - colX(6) };
  const wide = { x: colX(4), w: RIGHT - colX(4) };
  const landscape = r > narrow.w / boxH;
  const titlePair = coverTitlePair(info, tr, lang);
  const subPair = coverSubPair(project, tr);
  const WIDE_LINES = 3;
  const fitsWide = () => {
    const w = wide.x - 54 - colX(1);
    return pick(lang, titlePair).every((it) => {
      const L = scriptOf(it, 'display');
      return blk(0, 0, w, balanceText(it.text, L, 'display', w), L, 'display').lines <= WIDE_LINES;
    });
  };
  const box = landscape && fitsWide() ? wide : narrow;
  const tall = r <= box.w / boxH;
  const bw = tall ? Math.round(boxH * r) : box.w;
  const bh = tall ? boxH : Math.round(box.w / r);
  const bx = RIGHT - bw;
  const by = FOOT - bh;
  els.push({ t: 'img', x: bx, y: by, w: bw, h: bh, src: cover.image, fit: 'contain', ax: 1, ay: 1, ...(nat ? { nat } : {}), edit: { field: 'cover.image' } });
  lowRes(warnings, upscale(nat, bw, bh), 'Material Board ');

  // 左栏：右边界离图 54（竖版 / 方形的图从第 6 栏起时：左栏 = 第 1–5 栏）
  const textR = landscape || bx >= colX(7) ? bx - 54 : colX(6) - GRID.gutter;
  const colW = textR - colX(1);

  // 中英版：像公司封面（样张 p1）那样中文第 1 栏、英文第 3 栏并排，同一顶线、同样断行；放不下就上下对照
  const xs = [colX(1), colX(3)];
  const ws = [spanW(2), textR - colX(3)];
  const fitsSide = (pair, role) => {
    const its = pick(lang, pair);
    if (its.length < 2) return true;
    return widestLine(its[0].text, scriptOf(its[0], role), role) <= room(ws[0]) && widestLine(its[1].text, scriptOf(its[1], role), role) <= room(ws[1]);
  };
  const CHAPTER = chapterPair(ctx);
  const side = lang === 'bi' && fitsSide(CHAPTER, 'cap') && fitsSide(titlePair, 'display') && fitsSide(subPair, 'body');

  const put = (y, role, pair) => (side ? sideB(xs, ws, y, role, pair, lang, { singleW: colW }) : stackB(colX(1), y, colW, role, pair, lang, { gap: 0, balance: true }));
  const label = put(TOP, 'cap', CHAPTER);
  const sub = rest(FOOT, (y) => put(y, 'body', subPair));
  let title = rest(sub.top - (side ? 18 : 24), (y) => put(y, 'display', titlePair));
  if (title.top < label.bottom + 48) {
    // 标题太长：降一级字号（head），仍挂在标签下面
    warnings.push('封面标题太长：已缩小一级，建议精简');
    title = rest(sub.top - 24, (y) => (side ? sideB(xs, ws, y, 'head', titlePair, lang, { singleW: colW }) : stackB(colX(1), y, colW, 'head', titlePair, lang, { balance: true })));
  }
  els.push(...label.els, ...title.els, ...sub.els);
  return page(els, warnings);
}

// ---------------------------------------------------------------------------
// 楼层章节页
// ---------------------------------------------------------------------------

const FLOOR_IMG_W = colX(9) - GRID.gutter; // 1232

/**
 * 楼层页的图：这一页自己选的 → 楼层的（导入时取的、或在编辑器里选的）→ 这一层的效果图。
 * 不用紧接着下一页的那张图（连续两页同一张图、取景又差不多）：楼层图正好是下一页的图时也换一张 ——
 * 先取这一层的满版大图，没有就取下一张不同的效果图；这一层只有那一张时才用它。
 * @returns {{ src:string|null, auto:boolean }}  auto = 不是这一页 / 楼层自己选的
 */
export function floorPageImage(project, slide, meta = () => null, plan = null) {
  if (slide?.image) return { src: slide.image, auto: false };
  const floor = findFloor(project, slide?.floorId);
  const shown = (project.slides || []).filter((s) => s && s.enabled !== false);
  const i = shown.findIndex((s) => s.id === slide?.id);
  const next = i >= 0 ? shown[i + 1] : null;
  const nextImg = next?.kind === 'view' ? next.image || null : null;
  if (floor?.image && floor.image !== nextImg) return { src: floor.image, auto: false };
  const views = shown.filter((s) => s.kind === 'view' && s.floorId === floor?.id && s.image && s.tag !== '3d');
  const others = views.filter((s) => s.image !== nextImg);
  const p = others.length > 1 ? plan || planViews(project, meta) : null;
  const pick1 = (p && others.find((s) => p.get(s.id) === 'full')) || others[0];
  if (pick1) return { src: pick1.image, auto: true };
  return { src: floor?.image || views[0]?.image || null, auto: !floor?.image };
}

/** 这一层的空间（启用、非立体图的效果图页，按出现顺序去重）：[{ zh, en }] */
function floorRoomPairs(project, floorId, tr) {
  const seen = new Set();
  const out = [];
  for (const s of project.slides || []) {
    if (s.kind !== 'view' || s.floorId !== floorId || s.enabled === false || s.tag === '3d') continue;
    const r = clean(s.room);
    if (!r || seen.has(r)) continue;
    seen.add(r);
    out.push({ zh: r, en: tidyTitle(tr.room(s)) });
  }
  return out;
}

export function bFloor(ctx, slide) {
  const { project, lang, tr, meta } = env(ctx);
  const floor = findFloor(project, slide?.floorId);
  const els = [];
  const warnings = [];

  // 这一层的效果图页都隐藏了（或还没有）：章节页后面没有内容 —— 提醒隐藏这一页（一键），不再只说「没有背景图」
  const floorViews = floor ? (project.slides || []).filter((s) => s?.kind === 'view' && s.floorId === floor.id) : [];
  const emptyFloor = !!floor && !floorViews.some((s) => s.enabled !== false);
  const { src } = floorPageImage(project, slide, meta);
  if (src) {
    const r = rendering(0, 0, FLOOR_IMG_W, H, src, meta(src));
    els.push(r.el);
    lowRes(warnings, r.scale);
    if (r.wmShown) warnings.push(WM_WARN.plate);
  } else {
    els.push(...missingImage(0, 0, FLOOR_IMG_W, H));
    if (!emptyFloor) warnings.push('楼层章节页没有背景图');
  }
  if (emptyFloor) {
    warnings.push(
      floorViews.length
        ? '这一层的效果图都隐藏了：楼层章节页后面没有内容 —— 也隐藏这一页，或给楼层选一张图'
        : '这一层还没有效果图页：楼层章节页后面没有内容 —— 隐藏这一页，或先加效果图',
    );
  }

  // 右栏：楼层名（display，中英上下）挂在 96；本层空间落在 984
  const x = COL10;
  const w = RIGHT - x;
  if (!floor) warnings.push('这一页的楼层已被删除 —— 重新选一个楼层，或删掉这一页');
  const zh = clean(floor?.zh) || (floor ? '' : '方案');
  const enRaw = tidyTitle(floorTitleEn(floor?.en)) || (floor ? '' : 'Design');
  const en = enRaw || (zh ? tidyTitle(tr.en(zh, 'room')) : '');
  const name = stackB(x, TOP, w, 'display', { zh: zh || enRaw || '楼层', en, field: zh ? 'floor.zh' : 'floor.en', fieldEn: 'floor.en' }, lang, { balance: true });
  els.push(...name.els);

  const rooms = floorRoomPairs(project, floor?.id, tr);
  if (rooms.length) {
    const gap = lang === 'bi' ? 20 : 0; // 中英版：一个空间 = 中文一行 + 英文一行，空间之间空一点
    const minTop = name.bottom + 64;
    const column = (cx, y, cw, list) => {
      const out = [];
      let cur = y;
      list.forEach((rp, i) => {
        if (i) cur += gap;
        const s = stackB(cx, cur, cw, 'body', rp, lang, { gap: 0, balance: true });
        out.push(...s.els);
        cur = s.bottom;
      });
      return { els: out, bottom: cur };
    };
    const heightOf = (list, cw) => column(0, 0, cw, list).bottom;
    let placed = null;
    let shown = rooms.length;
    if (FOOT - heightOf(rooms, w) >= minTop) {
      placed = rest(FOOT, (y) => column(x, y, w, rooms));
    } else {
      // 两栏（左栏多一个），两栏顶对齐；还放不下就只放得下的部分
      const cw = (w - GRID.gutter) / 2;
      const x2 = x + cw + GRID.gutter;
      const split = (n) => {
        const a = rooms.slice(0, Math.ceil(n / 2));
        const b = rooms.slice(Math.ceil(n / 2), n);
        return { a, b, h: Math.max(heightOf(a, cw), b.length ? heightOf(b, cw) : 0) };
      };
      while (shown > 0 && FOOT - split(shown).h < minTop) shown -= 1;
      const { a, b, h } = split(shown);
      const top = FOOT - h;
      const c1 = column(x, top, cw, a);
      const c2 = column(x2, top, cw, b);
      placed = { els: [...c1.els, ...c2.els] };
      if (shown < rooms.length) warnings.push(`本层空间太多，楼层页只显示了 ${shown} / ${rooms.length} 个`);
    }
    els.push(...placed.els);
  }
  return page(els, warnings);
}

// ---------------------------------------------------------------------------
// 效果图 · 满版 / 图文 的分配
// ---------------------------------------------------------------------------

const noteRows = (s) => (s?.notes || []).filter((n) => clean(n?.text) || clean(n?.label));
const matRows = (s) => (s?.materials || []).filter((r) => r && (r.materialId || clean(r.role)));
const matIds = (s) => new Set(matRows(s).map((r) => r.materialId).filter(Boolean));
const forcedOf = (s) => (s.layout === 'full' ? 'full' : s.layout === 'framed' || s.layout === 'plate' ? 'plate' : null);
const sameRoom = (a, b) => !!clean(a.room) && clean(a.room) === clean(b.room) && (a.floorId || null) === (b.floorId || null);
const superset = (big, small) => [...small].every((id) => big.has(id));

/**
 * 每张效果图页用满版（full）还是图文（plate）
 *   设定了版式就照设定（full → 满版；framed → 图文）
 *   自动（auto）：横图（≥ 1.5）、像素够（铺满整页不发虚、水印裁得掉），且这一页满版也不丢东西（没有说明、没有材料），
 *     或它是这个空间的第一张、没有说明、紧接着的下一页同楼层同空间且材料覆盖它（下一页是图文）→ 满版；
 *   AI 立体图（tag '3d'）→ 图文；不连续出现 3 页满版；其余图文
 * @param {object} project
 * @param {(src:string)=>({w:number,h:number}|null)} metaFn
 * @returns {Map<string,'full'|'plate'>}
 */
export function planViews(project, metaFn = () => null) {
  const slides = project?.slides || [];
  const shown = slides.filter((s) => s && s.enabled !== false);
  const plan = new Map();
  const auto = new Set();
  const natOf = (s) => (s.image ? metaFn(s.image) : null);
  const ratioOf = (s) => {
    const nat = natOf(s);
    return nat?.w && nat?.h ? nat.w / nat.h : 0;
  };
  const nextShown = (s) => {
    const i = shown.indexOf(s);
    return i >= 0 ? shown[i + 1] || null : null;
  };
  const firstOfRoom = (s) => {
    const first = shown.find((x) => x.kind === 'view' && x.tag !== '3d' && sameRoom(x, s));
    return first === s;
  };
  for (const s of slides) {
    if (s?.kind !== 'view') continue;
    const forced = forcedOf(s);
    if (forced) {
      plan.set(s.id, forced);
      continue;
    }
    // 满版要像素够：铺满整页不放大超过 1.15 倍，右下角的水印也裁得掉（16:9 的图约 1845 宽、3 : 1 的全景图约 940 高以上）；
    // 像素不够的放图文（图小一些：放大得少、裁得开）—— 自动排出来的满版页不会有像素偏低、水印的提醒
    if (s.tag === '3d' || ratioOf(s) < 1.5 || noteRows(s).length || !fillsClean(natOf(s), W, H)) {
      plan.set(s.id, 'plate');
      continue;
    }
    if (!matRows(s).length) {
      plan.set(s.id, 'full');
      auto.add(s.id);
      continue;
    }
    const next = nextShown(s);
    const covered =
      firstOfRoom(s) &&
      next?.kind === 'view' &&
      next.tag !== '3d' &&
      next.layout !== 'full' &&
      sameRoom(next, s) &&
      matIds(s).size > 0 &&
      matRows(s).every((r) => r.materialId) &&
      superset(matIds(next), matIds(s));
    plan.set(s.id, covered ? 'full' : 'plate');
    if (covered) auto.add(s.id);
  }
  // 不连续 3 页满版：连续的满版里，第 3 页起改回图文（只改自动的；第 3 页是设定的就改前面自动的那页）
  let run = [];
  for (const s of shown) {
    if (s.kind !== 'view' || plan.get(s.id) !== 'full') {
      run = [];
      continue;
    }
    run.push(s);
    if (run.length < 3) continue;
    const pickable = [run[run.length - 1], run[run.length - 2], run[run.length - 3]].find((x) => auto.has(x.id));
    if (!pickable) continue;
    plan.set(pickable.id, 'plate');
    run = run.slice(run.indexOf(pickable) + 1);
  }
  return plan;
}

/** 满版页把这一页的说明 / 材料藏起来了吗（材料出现在同空间另一张图文页上就不算丢） */
function lostOnFull(project, slide, plan) {
  const lost = [];
  if (noteRows(slide).length) lost.push('说明');
  const ids = matIds(slide);
  if (matRows(slide).length) {
    const covered =
      ids.size > 0 &&
      matRows(slide).every((r) => r.materialId) &&
      (project.slides || []).some((x) => x !== slide && x.kind === 'view' && x.enabled !== false && plan.get(x.id) === 'plate' && sameRoom(x, slide) && superset(matIds(x), ids));
    if (!covered) lost.push('材料');
  }
  return lost;
}

export function bViewFull(ctx, slide, plan) {
  const { project, meta } = env(ctx);
  const els = [];
  const warnings = [];
  if (slide?.image) {
    const r = rendering(0, 0, W, H, slide.image, meta(slide.image));
    els.push(r.el);
    lowRes(warnings, r.scale);
    if (r.wmShown) warnings.push(WM_WARN.full);
  } else {
    els.push(sampleRect(0, 0, W, H, 'image'));
    warnings.push('缺少效果图');
  }
  const lost = lostOnFull(project, slide || {}, plan || planViews(project, meta));
  if (lost.length) warnings.push(`满版大图不显示${lost.join('与')} —— 要列出来请换成「图文」版式`);
  return page(els, warnings);
}

export function bViewPage(ctx, slide, plan) {
  const e = env(ctx);
  const p = plan || planViews(e.project, e.meta);
  return p.get(slide?.id) === 'full' ? bViewFull(ctx, slide, p) : bViewPlate(ctx, slide);
}

// ---------------------------------------------------------------------------
// 效果图 · 图文（样张 p6）
// ---------------------------------------------------------------------------

// 不印的笼统标签（说明 / 备注）：正文本身就是说明
const GENERIC_LABELS = new Set(['说明', '备注', '设计说明', '备注说明', '注', '注释', '注意事项', 'note', 'notes', 'remark', 'remarks']);

/** 「隐形门 · Hidden door」这种中英写在一起的标签 → { zh:'隐形门', en:'Hidden door' }；否则 null */
function splitBiLabel(label) {
  const segs = String(label).split(/\s*[·•・]\s*/).map(clean).filter(Boolean);
  if (segs.length !== 2) return null;
  const [a, b] = segs;
  if (hasCJK(a) && !hasCJK(b) && /[A-Za-z]{2}/.test(b)) return { zh: a, en: b };
  return null;
}

/** 这一页的说明：[{ i, label:{zh,en,field,fieldEn}|null, text:{zh,en,field,fieldEn} }] */
function notesOf(project, slide, lang, tr) {
  const out = [];
  (slide.notes || []).forEach((n, i) => {
    const text = clean(n?.text);
    const raw = clean(n?.label);
    const generic = !raw || GENERIC_LABELS.has(raw.toLowerCase());
    if (!text && generic) return;
    // 「隐形门 · Hidden door」：华文版只印中文，中英版拆成中文一行、英文一行，English 版取英文；
    // 设计师在「英文」里另填过（翻译记忆）就用填的
    const bi = raw ? splitBiLabel(raw) : null;
    const labelPair = generic
      ? null
      : {
          zh: bi ? bi.zh : raw,
          en: lang === 'zh' ? '' : memoryEn(project, raw) || (bi ? bi.en : tr.en(raw, 'label')),
          field: `notes.${i}.label`,
          fieldEn: `notes.${i}.labelEn`,
        };
    if (!text) {
      // 只有标签：标签就是这条说明
      out.push({ i, label: null, text: { ...labelPair, field: `notes.${i}.label`, fieldEn: `notes.${i}.labelEn` } });
      return;
    }
    out.push({ i, label: labelPair, text: { zh: text, en: lang === 'zh' ? '' : tr.en(text, 'note'), field: `notes.${i}.text`, fieldEn: `notes.${i}.textEn` } });
  });
  return out;
}

const NOTE_LABEL_GAP = 8; // 标签与正文
const NOTE_GAP = 32; // 右栏里两条说明之间
const UNDER_GAP = 48; // 图下的说明离图
const TITLE_TOP = 200; // 样张 p6：标题挂在 200
const TITLE_GAP = 40; // 标题与材料表之间至少

/**
 * 图下的说明（第 1–9 栏，x 120–1374，图宽 1344）：
 *   3 条 = 第 1、4、7 栏起各 3 栏；2 条 = 第 1 栏起 5 栏、第 6 栏起 4 栏（样张 p6）；
 *   1 条 = 5 栏，放不下再试 6 栏、9 栏（少折几行）
 */
const UNDER = {
  3: [{ xs: [colX(1), colX(4), colX(7)], ws: [spanW(3), spanW(3), spanW(3)] }],
  2: [{ xs: [colX(1), colX(6)], ws: [spanW(5), spanW(4)] }],
  1: [{ xs: [colX(1)], ws: [spanW(5)] }, { xs: [colX(1)], ws: [spanW(6)] }, { xs: [colX(1)], ws: [spanW(9)] }],
};

/** 一排并列的说明：标签、中文、英文各成一行，跨栏对齐（同一种语言在各栏同一高度起排） */
function notesRow(notes, xs, ws, y, lang) {
  const els = [];
  let cur = y;
  if (notes.some((nt) => nt.label && pick(lang, nt.label).length)) {
    let h = 0;
    notes.forEach((nt, k) => {
      if (!nt.label) return;
      const s = stackB(xs[k], cur, ws[k], 'cap', nt.label, lang, { balance: true });
      els.push(...s.els);
      h = Math.max(h, s.bottom - cur);
    });
    cur += h + NOTE_LABEL_GAP;
  }
  const texts = notes.map((nt) => pick(lang, nt.text));
  const rowsN = Math.max(...texts.map((t) => t.length));
  for (let k = 0; k < rowsN; k++) {
    let h = 0;
    texts.forEach((t, c) => {
      const it = t[k];
      if (!it) return;
      const b = blk(xs[c], cur, ws[c], balanceText(it.text, it.lang, 'body', ws[c]), it.lang, 'body', { edit: editOf(it.field) });
      els.push(b.el);
      h = Math.max(h, b.h);
    });
    cur += h;
  }
  return { els, bottom: cur };
}

/** 材料行：[{ label, value, code, codeField }]（材料被删 / 没选的行不印，提醒） */
function materialRowsOf(project, slide, lang, tr, warnings) {
  const rows = [];
  (slide.materials || []).forEach((r, i) => {
    const mat = r?.materialId ? findMaterial(project, r.materialId) : null;
    if (!mat) {
      if (r?.materialId) warnings.push(`第 ${i + 1} 项材料已被删除`);
      else if (clean(r?.role)) warnings.push(`第 ${i + 1} 项还没选材料`);
      return;
    }
    const role = clean(r.role);
    const name = clean(mat.name);
    const code = clean(mat.code);
    rows.push({
      label: { zh: role, en: role && lang !== 'zh' ? tidyTitle(tr.en(role, 'role')) : '', field: `materials.${i}.role`, fieldEn: `materials.${i}.roleEn` },
      value: {
        zh: name || code || '未命名材料',
        en: name ? (lang !== 'zh' ? tr.en(name, 'material') : '') : code || 'Unnamed material',
        field: `materials.${i}`,
        fieldEn: name ? `materials.${i}.nameEn` : `materials.${i}`,
      },
      code: name ? code : '',
      codeField: `materials.${i}`,
    });
  });
  return rows;
}

/**
 * 图与右栏的位置
 *   横图（≥ 1.45）：上、左出血，宽 1344，高 = 1344 / 比例（最多 792）；右栏第 10 栏起（402 宽）
 *   方图 / 竖图：占满高；右栏起在网格上（第 6–10 栏），图的右边离它 54；取裁得最少的那一档。
 *     文字栏最多 5 栏宽、靠右边线（竖图时图与文字之间留白，不把文字拉成一大片）
 */
function plateGeometry(ratio) {
  if (ratio >= 1.45) return { landscape: true, iw: 1344, ih: Math.min(792, Math.round(1344 / ratio)), cx: COL10, cw: RIGHT - COL10 };
  let best = null;
  for (const n of [10, 9, 8, 7, 6]) {
    const iw = colX(n) - 54;
    const box = iw / H;
    const cut = box > ratio ? 1 - ratio / box : 1 - box / ratio;
    if (!best || cut < best.cut - 1e-9) best = { n, iw, cut };
  }
  const cx = Math.max(colX(best.n), RIGHT - spanW(5));
  return { landscape: false, iw: best.iw, ih: H, cx, cw: RIGHT - cx };
}

/**
 * 视角名（标题）：每种语言最多 2 行（head）；更长就中英一起降成正文字号（最多 3 行），还放不下就截短
 * @returns {{ els, bottom, role, cut }}
 */
function titleBlock(x, top, w, pair, lang, role, maxLines, limit = Infinity) {
  const its = pick(lang, pair);
  // caps[i] = 第 i 种语言最多几行；超出的截短（over = 有截短）
  const build = (caps) => {
    const els = [];
    let cur = top;
    let over = false;
    its.forEach((it, i) => {
      if (i > 0) cur += STACK_GAP[role] ?? 0;
      const L = scriptOf(it, role);
      let b = blk(x, cur, w, balanceText(it.text, L, role, w), L, role, { edit: editOf(it.field) });
      if (b.lines > caps[i]) {
        over = true;
        b = blk(x, cur, w, clampText(it.text, L, role, w, caps[i]), L, role, { edit: editOf(it.field) });
      }
      els.push(b.el);
      cur = b.bottom;
    });
    return { els, bottom: cur, over };
  };
  const caps = its.map(() => maxLines);
  let r = build(caps);
  // 还超出 limit：行多的那种语言先减一行，直到放得下或都只剩一行
  while (r.bottom > limit && caps.some((c) => c > 1)) {
    let k = 0;
    caps.forEach((c, i) => {
      if (c > caps[k]) k = i;
    });
    caps[k] -= 1;
    r = { ...build(caps), over: true };
  }
  return r;
}

/** 截到最多 n 行，末尾加「…」（中文按字、英文按词） */
function clampText(text, lang, role, w, n) {
  const s = String(text ?? '').replace(/\n/g, lang === 'en' ? ' ' : '');
  const fits = (t) => blk(0, 0, w, balanceText(t, lang, role, w), lang, role).lines <= n;
  if (fits(s)) return balanceText(s, lang, role, w);
  const chars = [...s];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (fits(`${chars.slice(0, mid).join('').trimEnd()}…`)) lo = mid;
    else hi = mid - 1;
  }
  let cut = chars.slice(0, lo).join('');
  if (lang === 'en') {
    const sp = cut.lastIndexOf(' ');
    if (sp > 0) cut = cut.slice(0, sp);
  }
  return balanceText(`${cut.replace(/[\s,，、;；:：·]+$/u, '')}…`, lang, role, w);
}

export function bViewPlate(ctx, slide) {
  const { project, lang, tr, meta } = env(ctx);
  const s = slide || {};
  const els = [];
  const warnings = [];
  const floor = findFloor(project, s.floorId);

  const nat = s.image ? meta(s.image) : null;
  const ratio = nat?.w && nat?.h ? nat.w / nat.h : 16 / 9;
  const g = plateGeometry(ratio);
  if (s.image) {
    const r = rendering(0, 0, g.iw, g.ih, s.image, nat);
    els.push(r.el);
    lowRes(warnings, r.scale);
    if (r.wmShown) warnings.push(WM_WARN.plate);
  } else {
    els.push(...missingImage(0, 0, g.iw, g.ih));
    warnings.push('缺少效果图');
  }
  const x = g.cx;
  const tw = g.cw; // 右栏：标签、标题、说明、材料表同一宽度（最多 5 栏）

  // 标签（cap）挂在 96：楼层　空间；标题挂在 200：视角名（没有视角名 = 空间名，这时标签只写楼层）
  const roomZh = clean(s.room);
  const sub = clean(s.subtitle);
  const roomEn = roomZh || clean(s.roomEn) ? tidyTitle(tr.room(s)) : '';
  const floorPart = floor ? { zh: clean(floor.zh), en: tidyTitle(floorTitleEn(floor.en)) || (clean(floor.zh) ? tidyTitle(tr.en(floor.zh, 'room')) : '') } : null;
  // AI 立体图页的「空间」就是楼层名（一楼 / 全屋）：标签只写一次，不印成「一楼　一楼」
  const roomInLabel = sub && roomZh && !(s.tag === '3d' || (floorPart && roomZh === floorPart.zh));
  const labelParts = [floorPart, roomInLabel ? { zh: roomZh, en: roomEn } : null].filter(Boolean);
  if (!labelParts.length && s.tag === '3d' && roomZh) labelParts.push({ zh: roomZh, en: roomZh === '全屋' ? 'Whole Home' : roomEn });
  const labelPair = { ...joinPair(labelParts, '　', ' — ', lang), field: roomInLabel || !floorPart ? 'room' : 'floor', fieldEn: roomInLabel || !floorPart ? 'roomEn' : 'floor' };
  const label = stackB(x, TOP, tw, 'cap', labelPair, lang);
  els.push(...label.els);
  const titlePair = sub
    ? { zh: sub, en: lang === 'zh' ? '' : tidyTitle(tr.en(sub, 'view')), field: 'title', fieldEn: 'subtitleEn' }
    : { zh: roomZh, en: roomEn, field: 'room', fieldEn: 'roomEn' };
  const titleTopMin = label.bottom + 40;

  // 材料表落在 984。材料是事实，不因为标题长而少印：只有超过 6 行、或连「标签 + 一行标题」都放不下时才少印（提醒拆页）
  const rows = materialRowsOf(project, s, lang, tr, warnings);
  const labelW = Math.max(labelColW(rows, lang), deckLabelW(project, lang));
  const listH = (rs) => drawList(x, 0, tw, rs, lang, labelW).bottom;
  const oneLineTitle = pick(lang, titlePair).reduce((h, it) => h + styleOf(scriptOf(it, 'head'), 'head').lh, 0);
  let shownRows = rows;
  while (shownRows.length && FOOT - listH(shownRows) < titleTopMin + oneLineTitle + TITLE_GAP) shownRows = shownRows.slice(0, -1);
  // 超过 6 行 = 材料多；没超过却放不下（名称、部位很长）= 说清楚是哪几项没印出来
  if (rows.length > 6) warnings.push('材料太多：建议拆成两页');
  else if (shownRows.length < rows.length) warnings.push(`材料表放不下：第 ${shownRows.length + 1} 项起没有印出来 —— 建议精简名称或拆成两页`);
  for (const r of shownRows) {
    const cp = codePlan(r.code, tw - labelW);
    if (cp && !cp.inline && cp.lines.length > 1) warnings.push(codeWarning(r.code, cp.lines.length));
  }
  let listTop = FOOT;
  if (shownRows.length) {
    const list = rest(FOOT, (y) => drawList(x, y, tw, shownRows, lang, labelW));
    els.push(...list.els);
    listTop = list.top;
  }

  // 标题：head 每种语言最多 2 行，挂在 200；放不下先往上挪到标签下 40，再降成正文字号（提醒精简）
  const limit = shownRows.length ? listTop - TITLE_GAP : FOOT;
  let title = titleBlock(x, TITLE_TOP, tw, titlePair, lang, 'head', 2, limit);
  if (title.over || title.bottom > limit) {
    const up = titleBlock(x, titleTopMin, tw, titlePair, lang, 'head', 2, limit);
    if (!up.over && up.bottom <= limit) title = up;
    else {
      // 提醒说清原因：标题本身超过两行 = 太长；标题不长、是材料表占了地方 = 材料多。
      // 太长的是哪一栏：视角名（没有视角名时标题是空间名）、中文还是英文 —— 编辑器的一键修复跳到那一栏
      const longIts = pick(lang, titlePair).filter((it) => {
        const L = scriptOf(it, 'head');
        return blk(0, 0, tw, balanceText(it.text, L, 'head', tw), L, 'head').lines > 2;
      });
      const enLong = longIts.length > 0 && longIts.every((it) => it.lang === 'en');
      title = titleBlock(x, titleTopMin, tw, titlePair, lang, 'body', 3, limit);
      const what = sub ? (enLong ? '视角名的英文' : '视角名') : enLong ? '空间英文名' : '空间名';
      warnings.push(longIts.length ? `${what}太长：已缩小一级，建议精简` : '材料较多，视角名已缩小一级：建议拆成两页');
    }
  }
  els.push(...title.els);
  const titleBottom = Math.max(title.bottom, label.bottom);

  // 说明：横图时放在图下（图底 + 48 起，最多 3 栏，落不出 984）——放得下几条放几条（前 3、2、1 条；
  // 只放 1 条时可放宽到 6 栏、9 栏）；其余进右栏（标题与材料表之间），右栏宽（≥ 2 条说明的宽）时两条并排；
  // 还放不下的不印（不重叠），提醒
  let pending = notesOf(project, s, lang, tr);
  if (g.landscape && pending.length) {
    let placed = null;
    for (let k = Math.min(3, pending.length); k > 0 && !placed; k--) {
      for (const v of UNDER[k]) {
        const u = notesRow(pending.slice(0, k), v.xs, v.ws, g.ih + UNDER_GAP, lang);
        if (u.bottom <= FOOT) {
          placed = { u, k };
          break;
        }
      }
    }
    if (placed) {
      els.push(...placed.u.els);
      pending = pending.slice(placed.k);
    }
  }
  if (pending.length) {
    const colTop = titleBottom + 48;
    const colLimit = shownRows.length ? listTop - 48 : FOOT;
    const two = tw >= 2 * 300 + GRID.gutter;
    const nw2 = (tw - GRID.gutter) / 2;
    const dropped = [];
    let y = colTop;
    let i = 0;
    while (i < pending.length) {
      const per = two ? Math.min(2, pending.length - i) : 1;
      const group = pending.slice(i, i + per);
      const ws = per === 2 ? [nw2, nw2] : [tw];
      const r = notesRow(group, group.map((_, k) => x + k * (nw2 + GRID.gutter)), ws, y, lang);
      if (r.bottom <= colLimit) {
        els.push(...r.els);
        y = r.bottom + NOTE_GAP;
        i += per;
        continue;
      }
      if (per === 2) {
        // 两条并排放不下：先试只放第一条（整栏宽）
        const one = notesRow([group[0]], [x], [tw], y, lang);
        if (one.bottom <= colLimit) {
          els.push(...one.els);
          y = one.bottom + NOTE_GAP;
        } else dropped.push(group[0]);
        i += 1;
        continue;
      }
      dropped.push(group[0]);
      i += 1;
    }
    // 只有一条说明还放不下 = 说明太长（说清是第几条、是不是只有标签 —— 一键修复跳到那一栏）；几条里有放不下的 = 说明太多
    if (dropped.length) {
      const d = dropped[0];
      const which = `第 ${d.i + 1} 条${String(d.text?.field || '').endsWith('.label') ? '的标签' : ''}`;
      warnings.push(notesOf(project, s, lang, tr).length === 1 ? `说明太长（${which}）：建议精简或拆页` : '说明太多放不下：建议拆成两页');
    }
  }
  return page(els, [...new Set(warnings)]);
}

// ---------------------------------------------------------------------------
// 本案材料：小样网格（样张 p4：小样挂在页眉下 64，说明在小样下 32，最长的说明落在 984）
// ---------------------------------------------------------------------------

const MAT_NOTE = { zh: '本案选用的材料与饰面。', en: 'The materials and finishes chosen for this home.' };

/**
 * 一排几块 → 小样宽与步距（都在 1680 宽的版心里）：
 *   1–2 块 = 5 栏（686）· 3 块 = 4 栏（544）· 4 块 = 3 栏（402）· 5 块 = 样张 p4 的 312（间距 30）· 6 块 = 2 栏（260）
 */
const MODULE = {
  1: { w: spanW(5), step: spanW(5) + GRID.gutter },
  2: { w: spanW(5), step: spanW(5) + GRID.gutter },
  3: { w: spanW(4), step: spanW(4) + GRID.gutter },
  4: { w: spanW(3), step: spanW(3) + GRID.gutter },
  5: { w: 312, step: 342 },
  6: { w: spanW(2), step: spanW(2) + GRID.gutter },
};
// 一排时小样最多高到宽的 2.7 倍（6 种 = 260 × 690 左右的竖条，像一排木皮小样；实际高度还受「不放大超过 1.15 倍」限制）
const SWATCH_MAX = 2.7;

/** 一种材料的名称（中英）与编号 */
function materialCaption(m, lang, tr) {
  const name = clean(m.name);
  const code = clean(m.code);
  return {
    name: {
      zh: name || code || '未命名材料',
      en: name ? (lang !== 'zh' ? tr.en(name, 'material') : '') : code || 'Unnamed material',
      field: `material:${m.id}`,
      fieldEn: `material:${m.id}`,
    },
    code: name ? code : '',
  };
}

/** 材料名称每种语言最多排几行（再长截短加「…」，并提醒）：说明不至于把小样挤扁 */
const CAPTION_LINES = 3;
/**
 * 两排的小样最矮多少：宽的 0.6 倍，但不超过「说明都只有一行时」小样高度的 0.75 倍
 * （中英版两排的标准小样本来就只有 228 高，402 宽的那档也照样排两排）。
 * 名称很长、长编号另起一行把小样挤得比这还矮 → 每页少放几种、排一排（materialSlices）
 */
const SWATCH_MIN = 0.6;
const SWATCH_MIN_STD = 0.75;

/**
 * 小样下面的说明：名称（中英上下），编号与第一行同一基线、靠右；编号太宽（超过小样宽的 40%）就排在名称下面、仍靠右
 * @returns {{ els, bottom, cut:boolean, codeLines:number }}  cut = 名称截短了；codeLines = 另起一行的编号折成几行
 */
function drawCaption(x, y, w, cap, lang, field) {
  const its = pick(lang, cap.name);
  const els = [];
  let cur = y;
  let cut = false;
  const cp = codePlan(cap.code, w, 12);
  its.forEach((it, k) => {
    const bw = w - (k === 0 && cp?.inline ? cp.cw + 12 : 0);
    let text = balanceText(it.text, it.lang, 'body', bw);
    if (blk(0, 0, bw, text, it.lang, 'body').lines > CAPTION_LINES) {
      text = clampText(it.text, it.lang, 'body', bw, CAPTION_LINES);
      cut = true;
    }
    const b = blk(x, cur, bw, text, it.lang, 'body', { edit: editOf(it.field) });
    els.push(b.el);
    if (k === 0 && cp?.inline) {
      const fit = capInLine(cur, it.lang, 'en');
      els.push(blk(x + w - cp.cw, fit.top, cp.cw, cap.code, 'en', 'cap', { align: 'r', over: { lh: fit.lh }, nowrap: true, edit: editOf(field) }).el);
    }
    cur = b.bottom;
  });
  if (cp && !cp.inline) {
    const b = blk(x, cur, w, cp.lines.join('\n'), 'en', 'cap', { align: 'r', edit: editOf(field) });
    els.push(b.el);
    cur = b.bottom;
  }
  return { els, bottom: cur, cut, codeLines: cp && !cp.inline ? cp.lines.length : 0 };
}

/** 一行名称（中、英各一行）的说明有多高：两排、分页时按它定小样高度（几页的小样一样大） */
const stdCaptionH = (lang) => langsOf3(lang).reduce((h, L) => h + styleOf(L, 'body').lh, 0);
const langsOf3 = (lang) => (lang === 'bi' ? ['zh', 'en'] : [lang === 'en' ? 'en' : 'zh']);

/** 小样挂在页眉下 64（且离右上的说明至少 32；按第一页的页眉量，续页的小样与第一页同一高度） */
const matTop = (lang) => {
  const ref = header(lang, { zh: '本案材料', en: 'Materials' }, MAT_NOTE);
  return Math.max(ref.headBottom + 64, ref.noteBottom + 32);
};

/**
 * 这一页的小样网格：一排 / 两排、每排几块、小样宽高、说明高
 *   排法：≤ 6 种一排；7–12 种两排、上下均分（7 = 4 + 3，9 = 5 + 4，11 = 6 + 5）；
 *   分页时每页同一套格子（rows 由 materialSlices 定：两排，或说明太高时一排）
 */
function matGrid(e, list, pageCount = 1, perPage = 0, rowsHint = 0) {
  const { lang, tr, meta } = e;
  const n = list.length;
  const paged = pageCount > 1;
  const rowsN = rowsHint || (paged || n > 6 ? 2 : 1);
  const perRow = rowsN === 1 ? Math.min(6, Math.max(n, paged ? perPage || 0 : 0)) : Math.min(6, Math.max(4, Math.ceil(Math.max(n, paged ? perPage || 0 : 0) / 2)));
  let mod = MODULE[perRow];
  // 1–3 种：小样很大，原图不够清楚就退一档（686 → 544 → 402）—— 只在退了就清楚时才退（本来就太小的图单独提醒）
  const nats = list.map((m) => (m.image ? meta(m.image) : null));
  const sharpW = Math.min(...nats.map((nt) => (nt?.w ? nt.w * 1.15 : Infinity)));
  if (perRow <= 3 && mod.w > sharpW) {
    const ok = [MODULE[3], MODULE[4]].find((m) => m.w < mod.w && m.w <= sharpW);
    if (ok) mod = ok;
  }
  const size = mod.w;
  const top = matTop(lang);
  const caps = list.map((m) => materialCaption(m, lang, tr));
  const capInfo = caps.map((c) => drawCaption(0, 0, size, c, lang));
  const rowsOf = Array.from({ length: rowsN }, (_, r) => list.slice(r * perRow, (r + 1) * perRow).map((_, k) => r * perRow + k)).filter((r) => r.length);
  const rowCapH = rowsOf.map((idx) => Math.max(...idx.map((i) => capInfo[i].bottom)));
  // 不放大超过 1.15 倍：按「宽度上清楚」的小样算高度上限（本来就不清楚的那张单独提醒，不拖累整页）
  const sharpH = Math.min(...nats.map((nt) => (nt?.w && nt?.h && nt.w * 1.15 >= size ? nt.h * 1.15 : Infinity)));
  let capGap;
  let rowGap = 0;
  let plateH;
  let minH = 0;
  if (rowsN === 1) {
    capGap = 32;
    const fitH = FOOT - top - capGap - rowCapH[0];
    plateH = Math.floor(Math.min(fitH, sharpH, size * SWATCH_MAX));
  } else {
    capGap = 24;
    rowGap = 48;
    const std = stdCaptionH(lang);
    const fitStd = (FOOT - top - rowGap - 2 * (capGap + std)) / 2;
    const fitAct = (FOOT - top - rowGap - 2 * capGap - rowCapH.reduce((a, b) => a + b, 0) - (rowCapH.length < 2 ? std : 0)) / 2;
    plateH = Math.floor(Math.min(fitStd, fitAct, sharpH));
    minH = Math.min(size * SWATCH_MIN, Math.floor(Math.min(fitStd, sharpH)) * SWATCH_MIN_STD);
  }
  return { mod, size, top, caps, capInfo, nats, rowsOf, rowCapH, plateH, minH, capGap, rowGap };
}

/**
 * 本案材料分页：一页最多 maxPer（12）种、均分（14 = 7 + 7）；两排的小样被说明挤得矮过宽的 0.6 倍
 * （名称很长、长编号另起一行）→ 改成每页最多 6 种、排一排，不把每块小样都压扁
 * @returns {Array<{ mats:object[], perPage:number, rows:1|2 }>}
 */
export function materialSlices(ctx, mats, maxPer = 12) {
  const e = env(ctx);
  const list = (Array.isArray(mats) ? mats : []).filter(Boolean);
  const split = (cap) => {
    const n = Math.max(1, Math.ceil(list.length / cap));
    const per = Math.max(1, Math.ceil(list.length / n));
    return Array.from({ length: n }, (_, p) => ({ mats: list.slice(p * per, (p + 1) * per), perPage: per }));
  };
  const two = split(maxPer).map((s, _, all) => ({ ...s, rows: all.length > 1 || s.mats.length > 6 ? 2 : 1 }));
  const fits = two.every((s) => {
    if (s.rows === 1 || !s.mats.length) return true;
    const g = matGrid(e, s.mats, two.length, s.perPage, 2);
    return g.plateH >= g.minH;
  });
  if (fits) return two;
  return split(6).map((s) => ({ ...s, rows: 1 }));
}

export function bMaterials(ctx, mats = [], pageIndex = 0, pageCount = 1, perPage = 0, rows = 0) {
  const e = env(ctx);
  const { lang } = e;
  const all = Array.isArray(mats) ? mats.filter(Boolean) : [];
  const list = all.slice(0, 12);
  const els = [];
  const warnings = [];
  const cont = pageIndex > 0 && pageCount > 1;
  const head = header(lang, cont ? { zh: '本案材料（续）', en: 'Materials, continued' } : { zh: '本案材料', en: 'Materials' }, cont ? null : MAT_NOTE);
  els.push(...head.els);
  if (all.length > 12) warnings.push(`一页最多放 12 种材料（这一页有 ${all.length} 种），其余请分页`);
  if (!list.length) {
    const msg = stackB(colX(1), 420, spanW(8), 'body', { zh: '还没有材料 —— 在「材料清单」里添加。', en: 'No materials yet — add them in the Materials list.' }, lang, { gap: 0 });
    els.push(...msg.els.map((el) => ({ ...el, paras: el.paras.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r, color: B.grey })) })) })));
    return page(els, ['本案材料为空']);
  }

  const g = matGrid(e, list, pageCount, perPage, rows);
  const { mod, size, caps, capInfo, nats, rowsOf, rowCapH, capGap, rowGap } = g;
  const plateH = Math.max(1, g.plateH);
  let y = g.top;
  rowsOf.forEach((idx, r) => {
    idx.forEach((i, k) => {
      const m = list[i];
      const x = colX(1) + k * mod.step;
      const field = `material:${m.id}`;
      const what = `材料「${clean(m.name) || clean(m.code) || '未命名'}」的`;
      if (m.image) {
        const nt = nats[i];
        els.push(photo(x, y, size, plateH, m.image, { nat: nt, edit: { field } }));
        lowRes(warnings, upscale(nt, size, plateH), what);
      } else {
        els.push(sampleRect(x, y, size, plateH, field), ...frame(x, y, size, plateH));
      }
      els.push(...drawCaption(x, y + plateH + capGap, size, caps[i], lang, field).els);
      if (capInfo[i].cut) warnings.push(`${what}名称太长：页面上截短了（末尾「…」）—— 建议精简（去材料清单改）`);
      if (capInfo[i].codeLines > 1) warnings.push(codeWarning(caps[i].code, capInfo[i].codeLines));
    });
    y += plateH + capGap + rowCapH[r] + rowGap;
  });
  return page(els, [...new Set(warnings)]);
}

// ---------------------------------------------------------------------------
// 本案团队
// ---------------------------------------------------------------------------

const TEAM_NOTE = { zh: '从方案到交付，一个团队全程陪伴。', en: 'One team beside you, from design to delivery.' };

/** 团队一排几位 → 每位的栏宽与步距（≤ 4 位 3 栏宽，5 位 = p4 的 312，6 位 2 栏宽） */
const TEAM_MODULE = (k) => (k <= 4 ? MODULE[4] : MODULE[k]);

/** 团队页最多放几位：6 位以内一排；7–12 位排两排（4 + 3、4 + 4、5 + 4、5 + 5、6 + 5、6 + 6），两排同一套栏 */
export const TEAM_MAX = 12;
const TEAM_ROW_GAP = 64; // 上一排名字的底 → 下一排细线

export function bTeam(ctx) {
  const { project, lang, tr } = env(ctx);
  const team = project.info?.team || [];
  const els = [];
  const warnings = [];
  const head = header(lang, { zh: '本案团队', en: 'Project Team' }, TEAM_NOTE);
  els.push(...head.els);

  // 只有职位、还没填名字的成员：有人填了名字时先不放（客户看到的页面不留空位），逐个提醒；一个名字都没有时职位先排着
  const listed = team.map((m, idx) => ({ ...m, idx })).filter((m) => clean(m.name) || clean(m.role));
  const named = listed.filter((m) => clean(m.name));
  let all = listed;
  if (!named.length) {
    if (listed.length) warnings.push('服务团队还没填名字（项目信息 → 服务团队）');
  } else {
    all = named;
    for (const m of listed) if (!clean(m.name)) warnings.push(`服务团队第 ${m.idx + 1} 位「${clean(m.role)}」还没填名字，团队页上先不放`);
  }
  if (all.length > TEAM_MAX) warnings.push(`团队一页最多放 ${TEAM_MAX} 位（现在 ${all.length} 位），只显示了前 ${TEAM_MAX} 位`);
  const members = all.slice(0, TEAM_MAX);
  if (!members.length) return page(els, warnings);

  // 6 位以内一排，落在 984；7 位起两排（上排多一位），下排落在 984、上排落在下排细线上方 64。
  // 职位（cap 中英）在上，名字在下；名字都放得进两行就用 display（与封面的客户名同级），否则 head（两排放不下时也退到 head）
  const perRow = members.length <= 6 ? members.length : Math.ceil(members.length / 2);
  const rows = members.length <= 6 ? [members] : [members.slice(0, perRow), members.slice(perRow)];
  const mod = TEAM_MODULE(perRow);
  const cw = mod.w;
  const xOf = (i) => colX(1) + i * mod.step;
  const langOfName = (m) => (hasCJK(clean(m.name)) ? 'zh' : 'en');
  const nameLines = (m, role) => blk(0, 0, cw, balanceText(clean(m.name), langOfName(m), role, cw), langOfName(m), role).lines;
  const build = (list, nameRole) => (y0) => {
    const out = [];
    const notes = [];
    let roleBottom = y0;
    list.forEach((m, i) => {
      const role = clean(m.role);
      const s = stackB(xOf(i), y0, cw, 'cap', { zh: role, en: role && lang !== 'zh' ? tidyTitle(tr.en(role, 'team')) : '', field: `team.${m.idx}.role`, fieldEn: `team.${m.idx}.roleEn` }, lang);
      out.push(...s.els);
      roleBottom = Math.max(roleBottom, s.bottom);
    });
    // 名字：中文名、英文名首行同一基线
    const nameTop = roleBottom + (nameRole === 'display' ? 4 : 8);
    const base = Math.max(...list.map((m) => baseOff(langOfName(m), nameRole)));
    let bottom = roleBottom;
    list.forEach((m, i) => {
      const name = clean(m.name);
      if (!name) return;
      const L = langOfName(m);
      const b = blk(xOf(i), nameTop + base - baseOff(L, nameRole), cw, balanceText(name, L, nameRole, cw), L, nameRole, { edit: { field: `team.${m.idx}.name` } });
      out.push(b.el);
      bottom = Math.max(bottom, b.bottom);
      if (b.lines > 2) notes.push(`「${name}」太长，名字折成了 ${b.lines} 行 —— 可以只写名字或英文名`);
    });
    return { els: out, bottom, notes };
  };
  // 从下往上排：每排落在下一排细线上方（细线在职位上方 16，样张 p3）
  const place = (nameRole) => {
    const placed = [];
    let bottomY = FOOT;
    for (let r = rows.length - 1; r >= 0; r--) {
      const row = rest(bottomY, build(rows[r], nameRole));
      placed.unshift({ row, n: rows[r].length });
      bottomY = row.top - 16 - TEAM_ROW_GAP;
    }
    return placed;
  };
  let nameRole = members.every((m) => !clean(m.name) || nameLines(m, 'display') <= 2) ? 'display' : 'head';
  let placed = place(nameRole);
  if (nameRole === 'display' && placed[0].row.top - 16 < head.bottom + 48) placed = place((nameRole = 'head'));
  for (const { row, n } of placed) {
    els.push(hair(colX(1), row.top - 16, n * mod.step - (mod.step - cw)), ...row.els);
    warnings.push(...row.notes);
  }
  return page(els, [...new Set(warnings)]);
}
