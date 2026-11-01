// C 安然 · 方案页 —— 按 Aman 品牌手册的语言重排（样张 /tmp/claude-0/c/dirA2，规格 dirA/notes.md「通用规格」）。
//
//   bDesignCover(ctx)                       方案封面：Material Board 整张不裁（竖版 / 方形贴右、上下贴边；横版贴右、上下居中），
//                                           左栏 logo · 章节标签（DESIGN / 第三章　方案）· 客户 · 短线 · 楼层 · 签名
//   bFloor(ctx, slide)                      楼层章节页：效果图的局部贴左（半版、上下贴边；不和后面的页撞图），纸面栏 楼层名（大字）· 短线 · 本层空间；
//                                           没有可用的图 = 纯纸面的排版章节页（大字 + 空间清单，不画占位色块）
//   bViewFull(ctx, slide, plan?)            效果图满版（Aman 第 9 页的满版带标题）：左上视角名 +「楼层　空间」、右上白 logo、左下材料，
//                                           字下面局部托字（1C1915，最深 45%），效果图中间保持原样；没有图 → 图文（纯文字）
//   bViewPlate(ctx, slide, plan?)           效果图图文：页眉（英文大写 + 中文）在上；横图统一 1180 宽、落到底（cover 裁切），
//                                           规格栏 537 宽从照片顶 + 24 起：楼层 · 空间 / 说明 / 材料表（1–3 种带材质小样）；
//                                           plan.side = 'right' 的镜像页照片贴右、规格栏在左；竖图 = 半版照片贴左、页眉在纸面栏；
//                                           没有说明和材料 = 照片上下贴边 + 纸面栏章节页式大标题；没有图 = 纯文字两栏
//   bMaterials(ctx, mats, i, n, perPage?)   本案材料：页眉 + 材料小样网格（i = 第几页，从 0 起；n = 共几页）
//   bTeam(ctx)                              本案团队：溪岸照片半版贴左，纸面栏 页眉 · 一句话 · 名单（售后表的样子）
//   planViews(project, meta)                每张效果图用满版还是图文 → Map(slideId → 'full'|'plate')，plan.side = 图文页贴左 / 贴右
//   bViewPage(ctx, slide, plan)             按 plan 分派
//   floorPageImage(project, slide, meta)    楼层页实际用哪张图（编辑器显示「自动」用）
//
// ctx = { project, lang:'zh'|'en'|'bi', tr: makeTranslator(project), meta(src) → {w,h}|null, chapters? }
// 每个函数返回 kit page() 的 { bg, els, warnings }（bDesignCover 没有 Material Board 时返回 null）。
// 版式工具只用 kit.js 的 C 接口（字级 SCALE、titleGroup、signature、cornerLogo …）；坐标 px（1920×1080）。
// 方案页属于溪岸：logo 用溪岸（纸面上深色 logo-ink），签名「自然栖居 · 生活回归 / LIVING NATURALLY」。
// 图文页、楼层页、Material Board 上不放字、不压暗、不加色层（字都在纸面上）；只有满版带标题的页有托字渐变（只托字，不盖色层）。

import {
  B, PAGE, ALPHA, HALF, SIGNATURE, style, measure, wrapText, textLines, textBlock, titleGroup,
  signature, cornerLogo, placePhoto, rule, page, pick, hasCJK, sameLatin, shade, inkBox, fullBleed, wrapWidth,
} from './kit.js';
import { findFloor, findMaterial, floorsLine } from '../model.js';
import { makeTranslator, langOf, floorTitleEn, floorsLineEn, resolveEn, memoryEn, roomEnOf } from '../lang.js';
import { chapterZh, PHOTOS } from './company.js';

export { balanceLine } from './text.js';

const W = PAGE.W;
const H = PAGE.H;
const L = PAGE.left; // 112
const R = PAGE.right; // 1810
const TOP = PAGE.top; // 92
const BOTTOM = PAGE.contentBottom; // 900：内容排到这里，下面是签名（944 / 982）

// ---------------------------------------------------------------------------
// 环境、小工具
// ---------------------------------------------------------------------------

/** 没传翻译器时按 ctx.lang 自建一个（测试 / 单独调用） */
function env(ctx = {}) {
  const project = ctx.project || {};
  const lang = ctx.lang === 'en' || ctx.lang === 'bi' || ctx.lang === 'zh' ? ctx.lang : ctx.tr?.lang || langOf(project);
  const tr = ctx.tr || makeTranslator({ ...project, info: { ...(project.info || {}), lang } });
  const meta = typeof ctx.meta === 'function' ? ctx.meta : () => null;
  return { project, lang, tr, meta };
}

const clean = (s) => String(s ?? '').trim();
const editOf = (field) => (field ? { field } : undefined);

// 标题式英文里的虚词小写（titleCase 会写成 'Roof Garden And Terrace'）；第一个词、缩写不动
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'onto', 'or', 'the', 'to', 'with']);
const tidyTitle = (s) =>
  String(s ?? '')
    .split(' ')
    .map((w, i) => (i > 0 && /^[A-Z][a-z]+$/.test(w) && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w))
    .join(' ');

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

// ---------------------------------------------------------------------------
// 方案页自己的几个字级（kit SCALE 的变体；都是 kit 的字体角色）
// ---------------------------------------------------------------------------

const ST = {
  // 右栏顶上的「一楼　餐厅 / GROUND FLOOR — DINING」：售后表项名的样子，英文小号大写
  eyebrow: style('rowKey', { lh: 32 }),
  // 英文大写 16pt 字距 3：和中文 hosM 20 看起来一样大（中英并重）
  eyebrowEn: style('rowKeyEn', { size: 16, spacing: 3, lh: 28, caps: true }),
  // 说明：小标题（7B593D）+ 正文
  noteLabel: style('rowKey', { size: 18, spacing: 2, lh: 32 }),
  noteLabelEn: style('rowKeyEn', { size: 17, spacing: 0.5, lh: 30 }),
  note: style('body'),
  noteEn: style('bodyEn'),
  // 材料编号：Outfit 小字、签名色
  code: style('bodyEn', { size: 15, spacing: 1.2, color: B.foot, lh: 30 }),
  // 本案材料页的名称（表格内容色）
  capName: style('body', { color: B.table, lh: 34 }),
  capNameEn: style('bodyEn', { color: B.table, lh: 32 }),
  // 团队：拉丁字母的名字用 Ogg（像年表里的年份），中文名用思源宋体
  nameLatin: style('year', { size: 28, color: B.table, lh: 44 }),
  nameZh: style('rowVal', { lh: 44 }),
  // 空页提示
  hint: style('body', { color: B.foot }),
  hintEn: style('bodyEn', { color: B.foot }),
};

/**
 * 材料表：一种行样式（售后表的样子：项名 HarmonyOS Medium 20pt + 英文 Outfit Medium 18pt；材料名思源宋体 SemiBold 26pt + 英文 Outfit 24pt；
 * 编号 Outfit 15pt 靠右），按内容多少分几档疏密，样式不变：
 *   SWATCH = 每行前面一块材质小样（1–3 种材料、放得下时；栏不留空洞）· D0 = 标准 · D1 = 紧一档（字小一号、行距收紧）·
 *   D2 = 项名一栏 / 材料名一栏左右排（说明也把小标题和正文排一行）—— 内容很多时用
 */
const D0 = {
  key: style('rowKey', { lh: 32 }),
  keyEn: style('rowKeyEn', { size: 18, spacing: 1, lh: 30 }),
  val: style('rowVal', { lh: 42 }),
  valEn: style('rowValEn', { lh: 38 }),
  pad: 18,
  kv: 6,
};
const DENSITY = [
  D0,
  {
    key: style('rowKey', { size: 18, spacing: 3, lh: 30 }),
    keyEn: style('rowKeyEn', { size: 16, spacing: 0.8, lh: 28 }),
    val: style('rowVal', { size: 22, spacing: 1, lh: 36 }),
    valEn: style('rowValEn', { size: 20, lh: 32 }),
    pad: 12,
    kv: 4,
  },
  {
    side: true,
    key: style('rowKey', { size: 16, spacing: 2, lh: 34 }),
    keyEn: style('rowKeyEn', { size: 15, spacing: 0.6, lh: 30 }),
    val: style('rowVal', { size: 20, spacing: 1, lh: 34 }),
    valEn: style('rowValEn', { size: 18, lh: 32 }),
    pad: 10,
    kv: 0,
    compactNotes: true,
  },
];
/** 材质小样：竖条 11 : 15（像一片木皮小样），1 种 220 × 300、2 种最高 240、3 种最高 190；矮过 140 就不放小样 */
const SWATCH_H = [300, 240, 190];
const SWATCH_RATIO = 220 / 300;
const SWATCH_MIN_H = 140;
const SWATCH_GAP = 28;

/**
 * 一对中英文上下排（华文 = 中文；English = 英文，缺英文先中文；中英 = 中文在上、英文在下）。
 * 每块按自己的文字选字级：有中文用 zhRole，全是拉丁字母（客户名、英文）用 enRole
 * @returns {{ els, blocks, top, bottom, x0, x1, lines, cut }}
 */
function stackPair(x, y, w, pair, lang, zhRole, enRole, opts = {}) {
  const els = [];
  const blocks = [];
  let cur = y;
  let cut = false;
  for (const it of pick(lang, pair || {})) {
    if (blocks.length) cur += opts.gap ?? 4;
    const role = hasCJK(it.text) ? zhRole : enRole;
    const maxLines = typeof opts.maxLines === 'object' ? opts.maxLines?.[it.lang] : opts.maxLines;
    const b = textBlock(x, cur, w, it.text, role, { field: it.field, align: opts.align, balance: opts.balance, maxLines, color: opts.color });
    if (!b.el) continue;
    els.push(b.el);
    blocks.push({ lang: it.lang, el: b.el, top: b.top, bottom: b.bottom, x0: b.x0, x1: b.x1, lines: b.lines, cut: b.cut });
    cut = cut || b.cut;
    cur = b.bottom;
  }
  return {
    els,
    blocks,
    top: y,
    bottom: cur,
    h: cur - y,
    x0: blocks.length ? Math.min(...blocks.map((b) => b.x0)) : x,
    x1: blocks.length ? Math.max(...blocks.map((b) => b.x1)) : x,
    lines: blocks.reduce((n, b) => n + b.lines, 0),
    cut,
  };
}

/** 把一组元素（文字 / 图 / 线）整体上下挪 dy */
const shiftEls = (els, dy) => els.map((el) => ({ ...el, y: Math.round((el.y + dy) * 100) / 100 }));

/** 纸面上的左对齐签名（封面：Board 占了右下角时，签名放在左栏底下 —— Aman 第 7 页的做法） */
function signatureLeft(x, lang) {
  const t = SIGNATURE.sail;
  const en = textLines(x, PAGE.sigTop + 38, [[t.en]], 'sigEn', { align: 'l', name: 'signature' });
  // English 版只留英文一行（同 kit.signature 的 enOnly、公司页的签名）
  if (lang === 'en') return { els: [en.el], x0: x, x1: en.x1, top: en.top, bottom: en.bottom };
  const zh = textLines(x, PAGE.sigTop, [[t.zh]], 'sigZh', { align: 'l', name: 'signature' });
  return { els: [zh.el, en.el], x0: x, x1: Math.max(zh.x1, en.x1), top: zh.top, bottom: en.bottom };
}

/** 一个英文词（大写）比栏宽还宽（标题会被按字拆开）→ 要降一级字号 */
const wordTooWide = (text, st, w) => String(text || '').toUpperCase().split(/\s+/).some((wd) => measure(wd, st) - (st.spacing || 0) * (4 / 3) > w * 0.98);

// ---------------------------------------------------------------------------
// 图：效果图取景（水印不进画面）、缺图
// ---------------------------------------------------------------------------

/** 低像素提醒：放大超过 1.15 倍会发虚 */
function lowRes(warnings, scale, what = '') {
  if (scale > 1.15) warnings.push(`${what}图片像素偏低：放大 ${scale.toFixed(1)} 倍会发虚，建议换高清图`);
}

// 效果图右下角烙着「sAil 溪岸」水印（量过原稿里的效果图）：3840×2160 的图在宽 88.4–98.5%、高 90.6–97.3%，
// 即离右边 0.206 × 高、离底边 0.094 × 高；水印大小约为对角线的 10%（4000×3000 的图离右边 0.127 × 宽）。
// 设计师在原稿里只裁掉左边的图，水印照样在右下角、像素大小不变。按原图的比例算它占的范围（都留了余量）：
//   左边 = 离右边 max(14% 宽, 0.22 × 高)；上边 = 离底边 9.5%
// 取景都把它留在画外：从顶部起取景、左右居中；水印还在画面里就略放大（最多放大到 1.15 倍）——
// 左右裁到水印的左边、或底部裁掉 9.5%，取放大得少的那个。上下要裁得多时上下平分。
const WM_CUT = 0.095;
const WM_SIDE = { w: 0.14, h: 0.22 };

/** 水印在原图里的范围：左边、上边（占原图的比例；右边、下边就是原图的右边、下边） */
const wmBox = (nat) => ({ l: 1 - Math.max(WM_SIDE.w, (WM_SIDE.h * nat.h) / nat.w), t: 1 - WM_CUT });

/**
 * 效果图 / 照片铺满框（cover），水印留在画外；不加色层
 * @returns {{ el:object, scale:number, wmShown:boolean }} scale = 原图像素放大到页面的倍数（> 1.15 会发虚）；
 *   wmShown = 裁切后的画面里还有水印（为了不放大超过 1.15 倍，左右、底部都没能裁到它）
 */
function rendering(x, y, w, h, src, nat, field = 'image') {
  const base = { t: 'img', x, y, w, h, src, fit: 'cover', ax: 0.5, ay: 0, ...(nat ? { nat } : {}), ...(field ? { edit: { field } } : {}) };
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
  const hairline = (rx, ry, rw, rh) => ({ t: 'rect', x: rx, y: ry, w: rw, h: rh, fill: B.hair });
  if (y > 0) els.push(hairline(x, y, w, 1));
  if (y + h < H) els.push(hairline(x, y + h - 1, w, 1));
  if (x > 0) els.push(hairline(x, y, 1, h));
  if (x + w < W) els.push(hairline(x + w - 1, y, 1, h));
  return els;
}

/** 细线框（没有图的材料小样） */
const frame = (x, y, w, h) => [
  { t: 'rect', x, y, w, h: 1, fill: B.hair },
  { t: 'rect', x, y: y + h - 1, w, h: 1, fill: B.hair },
  { t: 'rect', x, y, w: 1, h, fill: B.hair },
  { t: 'rect', x: x + w - 1, y, w: 1, h, fill: B.hair },
];

/** 纸面栏里成组的字（楼层页、空栏的图文页）上下居中的中线：logo 底（192）与签名顶（944）的中间 */
const MID = 568;

/** 纸面右上角的溪岸 logo（深色）—— 方案页的标准位置 (1510, 78) */
const sailLogo = () => cornerLogo('sail', { onPhoto: false, corner: 'tr' });
/** 页眉的右边界：离右上角 logo 60 */
const HEAD_R = R - 300 - 60; // 1450

// ---------------------------------------------------------------------------
// 方案封面（有 Material Board 时）
// ---------------------------------------------------------------------------

/** 方案封面的章节标签：方案是第几章（老客户隐藏了品牌 / 公司章节 → 往前排；ctx.chapters 由 deck.js 给，单独排时 = 第三章） */
const chapterPair = (ctx) => {
  const n = ctx?.chapters?.num?.design ?? 3;
  return { zh: `${chapterZh(n)}　方案`, en: 'Design' };
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

/**
 * 封面的客户名（大字）：三档字号 —— 公司封面的「MR LAU」（Ogg 66pt 大写）/ 页标题（Ogg 42 + 宋体 36）/ 章节标签（30 + 28）；
 * 每种语言都排得进 2 行（客户 + 地点）的最大一档。中英版的中文是汉字时，英文降一档跟在下面
 */
const HERO_LEVELS = [
  { zh: 'coverNameZh', en: 'coverName', enUnder: 'display', lines: 2, gap: 8 },
  { zh: 'title', en: 'display', enUnder: 'display', lines: 4, gap: 10 },
  { zh: 'labelZh', en: 'label', enUnder: 'label', lines: 4, gap: 8 },
];

function coverHero(x, y, w, pair, lang, minLevel = 0, color = B.title) {
  const items = pick(lang, pair);
  const build = (lv, clamp) => {
    const zhCJK = items.some((it) => it.lang === 'zh' && hasCJK(it.text));
    const enRole = zhCJK ? lv.enUnder : lv.en;
    const zhSt = style(lv.zh, { color });
    const enSt = style(enRole, { color });
    // 拉丁字母写的客户名（中文那一栏也是 Mr Lau）用英文的字级
    return stackPair(x, y, w, pair, lang, zhSt, enSt, { gap: lv.gap, balance: true, maxLines: clamp ? lv.lines : undefined });
  };
  for (const lv of HERO_LEVELS.slice(minLevel)) {
    const r = build(lv, false);
    if (r.blocks.every((b) => b.lines <= lv.lines)) return { ...r, level: HERO_LEVELS.indexOf(lv) };
  }
  return { ...build(HERO_LEVELS[2], true), level: 2 };
}

export function bDesignCover(ctx) {
  const { project, lang, tr, meta } = env(ctx);
  const cover = project.cover || {};
  if (!cover.image) return null;
  const info = project.info || {};
  const els = [];
  const warnings = [];

  // Material Board 是排好的拼贴：整张放、一点不裁（contain，框和 Board 同比例）。
  //   竖版 / 方形：贴右、上下贴边（3:4 = 810 × 1080），左栏是纸面；
  //   横版：贴右、上下居中，宽 1180 / 1040 / 920（客户名长就收窄）、A4 横按高 1000；签名都在左栏底下
  const nat = meta(cover.image);
  const r = nat?.w && nat?.h ? nat.w / nat.h : 3 / 4;
  const titlePair = coverTitlePair(info, tr, lang);
  const subPair = coverSubPair(project, tr);
  const portrait = r <= 1.05;
  let box;
  let band = null;
  if (portrait) {
    const bw = Math.round(H * r);
    box = { x: W - bw, y: 0, w: bw, h: H };
  } else {
    // 横版：放在右边一整条深一级的色块里（上下贴边，有意的「卡纸」），Board 在色块里上下居中、四周留 60；
    // 宽 1180，客户名长（左栏排不进页标题的字号）就收窄到 1040 / 920 / 800；太高（A4 横以上）就按高 960 缩
    const M = 60;
    const fitsAt = (bw) => coverHero(L, 0, W - bw - 2 * M - 100 - L, titlePair, lang).level <= 1;
    let bw = [1180, 1040, 920, 800].find(fitsAt) || 800;
    let bh = Math.round(bw / r);
    if (bh > H - 2 * M) {
      bh = H - 2 * M;
      bw = Math.round(bh * r);
    }
    band = { t: 'rect', x: W - bw - 2 * M, y: 0, w: bw + 2 * M, h: H, fill: B.sample, name: 'band' };
    box = { x: W - M - bw, y: Math.round((H - bh) / 2), w: bw, h: bh };
  }
  if (band) els.push(band);
  els.push({ t: 'img', ...box, src: cover.image, fit: 'contain', ax: 1, ay: 0, ...(nat ? { nat } : {}), edit: { field: 'cover.image' } });
  if (nat?.w && nat?.h) lowRes(warnings, Math.max(box.w / nat.w, box.h / nat.h), 'Material Board ');

  // 左栏：logo 左上 → 字组（章节标签 · 客户 · 短线 · 楼层）上下居中 → 签名
  const colW = (band ? band.x : box.x) - 100 - L;
  const logo = cornerLogo('sail', { onPhoto: false, corner: 'tl' });
  els.push(logo.el);
  const CH = chapterPair(ctx);
  // 楼层一行：方案名的字级（思源宋体 30pt 字距 16）排得进一行就用它；否则换一句话的字级（22pt），最多 3 行
  const subOf = (y, small) =>
    small
      ? stackPair(L, y, colW, subPair, lang, style('lead', { color: B.title }), style('leadEn', { color: B.title }), { gap: 6, balance: true, maxLines: 3 })
      : stackPair(L, y, colW, subPair, lang, style('coverTitle', { lh: 56 }), style('coverTitleEn', { lh: 40 }), { gap: 8, balance: true, color: B.title });
  const group = (y0, lv, small) => {
    const out = [];
    const label = titleGroup(L, y0, colW, { zh: CH.zh, en: CH.en }, lang, { size: 'chapter' });
    out.push(...label.els);
    const hero = coverHero(L, label.bottom + 56, colW, titlePair, lang, lv);
    out.push(...hero.els);
    const ruleY = hero.bottom + 40;
    out.push(rule(L, ruleY, 80, { alpha: ALPHA.rule }));
    const sub = subOf(ruleY + 36, small);
    out.push(...sub.els);
    return { els: out, top: y0, bottom: sub.bottom, hero, subLines: sub.blocks.map((b) => b.lines) };
  };
  // 放得下：楼层先换小字，再把客户名降一档；字组在 logo 下面 110 到 900 之间上下居中
  const minTop = logo.bottom + 110;
  let pick1 = null;
  for (const lv of [0, 1, 2]) {
    for (const small of [false, true]) {
      const t = group(0, lv, small);
      if (!small && t.subLines.some((n) => n > 1)) continue;
      if (minTop + t.bottom <= BOTTOM) {
        pick1 = { lv, small, h: t.bottom };
        break;
      }
    }
    if (pick1) break;
  }
  if (!pick1) pick1 = { lv: 2, small: true, h: group(0, 2, true).bottom };
  const y0 = Math.round(Math.max(minTop, Math.min(MID - pick1.h / 2, BOTTOM - pick1.h)));
  const g = group(y0, pick1.lv, pick1.small);
  els.push(...g.els);
  // 客户名长就降一档（页标题 → 章节标签的字号），这是正常的；真的截短了 / 排不下才提醒
  if (g.hero.cut || g.bottom > BOTTOM + 0.5) warnings.push('封面标题太长：已缩小一级，建议精简');
  // 签名：左栏底下（左对齐，Aman 第 7 页的做法）—— 左栏的字组有了底，Board 那边干干净净
  els.push(...signatureLeft(L, lang).els);
  return page(els, [...new Set(warnings)]);
}

// ---------------------------------------------------------------------------
// 楼层章节页（照 dirA2 p3 品牌章节页：照片贴左、纸面栏大字 + 短线 + 一句话）
// ---------------------------------------------------------------------------

const FLOOR_IMG_W = HALF.max; // 1050：效果图贴左、上下贴边
const FLOOR_COL = FLOOR_IMG_W + 100; // 1150：纸面栏

/**
 * 楼层页的图：这一页自己选的 → 楼层的（导入时取的、或在编辑器里选的）→ 这一层的一张效果图的局部。
 * 不和后面的页撞图（翻过去像重复页）：不用紧接着下一页的那张、不用这一层做满版的那张；
 * 剩下的取离楼层页最远的一张，只取原图的右边一段（part，Aman 的局部取景），和它自己那一页的全图看起来不一样。
 * 一张可用的都没有 → src = null：楼层页排成纯纸面的排版章节页（大字 + 空间清单），不画占位色块
 * @returns {{ src:string|null, auto:boolean, part?:boolean }}  auto = 不是这一页 / 楼层自己选的；part = 只取局部
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
  const p = views.length ? plan || planViews(project, meta) : null;
  const others = views.filter((s) => s.image !== nextImg && s.image !== floor?.image && p?.get(s.id) !== 'full');
  // 横图（≥ 1.5）的右边一段才是「局部」（更方的图右边 60% 差不多就是整张）：先挑横图里离楼层页最远的
  const ratioOf = (s) => {
    const n = meta(s.image);
    return n?.w && n?.h ? n.w / n.h : 16 / 9;
  };
  const wide = others.filter((s) => ratioOf(s) >= 1.5);
  const pick1 = (wide.length ? wide : others)[(wide.length ? wide : others).length - 1];
  if (pick1) return { src: pick1.image, auto: true, part: true };
  return { src: null, auto: true };
}

/**
 * 效果图的局部（楼层页）：铺满框、贴右取（ax = 1，原图右边一段），不放大超过 1.0 倍；
 * 右下角的水印在画面里 → 底部裁掉 9.5%（从顶部起取景）
 */
function renderingPart(x, y, w, h, src, nat, field = 'image') {
  const base = { t: 'img', x, y, w, h, src, fit: 'cover', ax: 1, ay: 0, ...(nat ? { nat } : {}), ...(field ? { edit: { field } } : {}) };
  if (!nat?.w || !nat?.h) return { el: base, scale: 1, wmShown: false };
  const cover = Math.max(w / nat.w, h / nat.h);
  const mark = wmBox(nat);
  // 先按刚好铺满取右边；只取原图右边 60% 以内（局部）；水印露出来（右边总是在画面里）就放大到底部裁掉 9.5%
  // （最多到 1.0 倍，再不行退到 1.15 倍）
  const fh0 = (h / cover) / nat.h;
  const fw0 = (w / cover) / nat.w;
  let z = Math.max(1, fh0 > 1 - WM_CUT ? fh0 / (1 - WM_CUT) : 1, fw0 / 0.6);
  if (cover * z > 1) z = Math.max(1, Math.min(z, 1.15 / cover));
  const s = cover * z;
  const fw = w / s / nat.w;
  const fh = h / s / nat.h;
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  const crop = { l: r6(1 - fw), t: 0, r: 0, b: r6(1 - fh) };
  const wmShown = 1 > mark.l + 1e-4 && 1 - crop.b > mark.t + 1e-4;
  return { el: { ...base, crop }, scale: s, wmShown };
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

/**
 * 本层空间清单：一个空间一行（中英版 = 中文一栏、英文一栏，同一行）；排不下改两栏，再排不下只放得下的
 * @returns {{ els, h, shown }}
 */
function roomList(x, y, w, rooms, lang, maxH) {
  const lead = style('lead');
  const leadEn = style('leadEn');
  const LH = 44;
  const items = rooms.map((rp) => pick(lang, rp));
  // 中文那一栏的宽 = 最长的中文空间名（按折行用的宽量：含中西文交界的预留，「KTV 娱乐室」不会被折成两行）
  const zhW = (list) => Math.max(0, ...list.map((its) => (its[0] && its.length > 1 ? wrapWidth(its[0].text, hasCJK(its[0].text) ? lead : leadEn) / 0.98 + 2 : 0)));
  /** 一栏：每行 = 一个空间（中英版：中文、英文并排） */
  const column = (cx, cy, cw, list) => {
    const out = [];
    let cur = cy;
    const enX = cx + Math.ceil(zhW(list)) + 28;
    for (const its of list) {
      let h = LH;
      its.forEach((it, k) => {
        const st = hasCJK(it.text) ? lead : leadEn;
        const bx = k === 0 ? cx : enX;
        const bw = k === 0 ? (its.length > 1 ? enX - cx - 28 : cw) : cx + cw - enX;
        const b = textBlock(bx, cur, Math.max(60, bw), it.text, st, { lh: LH, maxLines: 2 });
        if (b.el) out.push(b.el);
        h = Math.max(h, b.h);
      });
      cur += h;
    }
    return { els: out, h: cur - cy };
  };
  const one = column(x, y, w, items);
  if (one.h <= maxH) return { els: one.els, h: one.h, shown: rooms.length };
  // 华文 / English：两栏（左栏多一个）
  if (lang !== 'bi') {
    const cw = (w - 40) / 2;
    const a = items.slice(0, Math.ceil(items.length / 2));
    const b = items.slice(Math.ceil(items.length / 2));
    const c1 = column(x, y, cw, a);
    const c2 = column(x + cw + 40, y, cw, b);
    const fitsTwo = [...c1.els, ...c2.els].every((el) => el.paras.every((p) => !p.runs[0].text.includes('\n'))) && Math.max(c1.h, c2.h) <= maxH;
    if (fitsTwo) return { els: [...c1.els, ...c2.els], h: Math.max(c1.h, c2.h), shown: rooms.length };
  }
  // 还放不下：排成一段（「玄关 · 客厅 · 餐厅」，中英版中文一段、英文一段；一个空间名不拆开）；再放不下只放得下的前几个
  const pack = (units, st) => {
    const lines = [];
    let cur = '';
    const fits = (t) => measure(t, st) - (st.spacing || 0) * (4 / 3) <= w * 0.98;
    for (const u of units) {
      const next = cur ? `${cur} · ${u}` : u;
      if (!cur || fits(next)) cur = next;
      else {
        lines.push(cur);
        cur = u;
      }
      if (!fits(cur)) {
        // 一个空间名比整栏还宽：照常折行
        const ws = wrapText(cur, st, w).flat();
        lines.push(...ws.slice(0, -1));
        cur = ws[ws.length - 1] || '';
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const flow = (n) => {
    const list = rooms.slice(0, n);
    const its = [];
    if (lang !== 'en' || list.some((rp) => !clean(rp.en))) its.push({ units: list.map((rp) => clean(rp.zh) || clean(rp.en)), st: lead });
    if (lang === 'en' && !its.length) its.push({ units: list.map((rp) => clean(rp.en)), st: leadEn });
    else if (lang === 'bi' && list.every((rp) => clean(rp.en))) its.push({ units: list.map((rp) => clean(rp.en)), st: leadEn });
    const els = [];
    let cur = y;
    its.forEach((it, k) => {
      if (k) cur += 12;
      const t = textLines(x, cur, [pack(it.units, it.st)], it.st, { w });
      els.push(t.el);
      cur = t.bottom;
    });
    return { els, h: cur - y };
  };
  let shown = rooms.length;
  let f = flow(shown);
  while (shown > 1 && f.h > maxH) {
    shown -= 1;
    f = flow(shown);
  }
  return { els: f.els, h: f.h, shown };
}

/**
 * 章节页式的大标题（楼层页、空栏的图文页）：英文大写在上（English 版 Ogg 60pt → 42 → 30）、中文大字在下（60 → 48 → 36pt）；
 * 每种语言最多 2 行，字号放得下就大，都放不下才截短（cut）。pair.en 空 = 不放英文
 * @returns {{ els, top, bottom, cut }}
 */
function heroTitle(x, y0, w, pair, lang) {
  const fitBlock = (y, text, roles, maxLines, field) => {
    for (const role of roles) {
      const b = textBlock(x, y, w, text, style(role), { field, balance: true });
      if (b.lines <= maxLines) return b;
    }
    return textBlock(x, y, w, text, style(roles[roles.length - 1]), { field, balance: true, maxLines });
  };
  const out = [];
  let cur = y0;
  let cut = false;
  let en = clean(pair.en);
  let zh = clean(pair.zh);
  let fieldEn = pair.fieldEn || pair.field;
  // 中文栏里写的就是英文（Ground Floor / Taj Room）：只排一块英文大写（字段用中文栏），不印成「GROUND FLOOR / GROUND FLOOR」
  if (zh && !hasCJK(zh) && (!en || sameLatin(zh, en))) {
    en = zh;
    zh = '';
    fieldEn = pair.field || fieldEn;
  }
  if (en) {
    const b = fitBlock(cur, en, lang === 'en' ? ['nameEn', 'heroEn', 'label'] : ['heroEn', 'label'], 2, fieldEn);
    out.push(b.el);
    cut = cut || b.cut;
    cur = b.bottom + (lang === 'en' ? 0 : 10);
  }
  if (zh && (lang !== 'en' || !en)) {
    const roles = hasCJK(zh) ? (lang === 'bi' ? ['heroBi', 'title'] : ['hero', 'heroBi', 'title']) : ['heroEn', 'label'];
    const b = fitBlock(cur, zh, roles, 2, pair.field);
    out.push(b.el);
    cut = cut || b.cut;
    cur = b.bottom;
  }
  return { els: out, top: y0, bottom: cur, cut };
}

export function bFloor(ctx, slide) {
  const { project, lang, tr, meta } = env(ctx);
  const floor = findFloor(project, slide?.floorId);
  const els = [];
  const warnings = [];

  // 这一层的效果图页都隐藏了（或还没有）：章节页后面没有内容 —— 提醒隐藏这一页（一键），不再只说「没有背景图」
  const floorViews = floor ? (project.slides || []).filter((s) => s?.kind === 'view' && s.floorId === floor.id) : [];
  const emptyFloor = !!floor && !floorViews.some((s) => s.enabled !== false);
  const { src, part } = floorPageImage(project, slide, meta, ctx.plan || null);
  if (src) {
    const r = part ? renderingPart(0, 0, FLOOR_IMG_W, H, src, meta(src)) : rendering(0, 0, FLOOR_IMG_W, H, src, meta(src));
    els.push(r.el);
    lowRes(warnings, r.scale);
    if (r.wmShown) warnings.push(WM_WARN.plate);
  }
  if (emptyFloor) {
    warnings.push(
      floorViews.length
        ? '这一层的效果图都隐藏了：楼层章节页后面没有内容 —— 也隐藏这一页，或给楼层选一张图'
        : '这一层还没有效果图页：楼层章节页后面没有内容 —— 隐藏这一页，或先加效果图',
    );
  }
  if (!floor) warnings.push('这一页的楼层已被删除 —— 重新选一个楼层，或删掉这一页');
  els.push(sailLogo().el);

  const zh = clean(floor?.zh) || (floor ? '' : '方案');
  const enData = tidyTitle(floorTitleEn(floor?.en)) || (floor ? '' : 'Design');
  const en = enData || (zh && lang !== 'zh' ? tidyTitle(tr.en(zh, 'room')) : '');
  // 英文（华文版也放：装饰性的大写页眉 —— 楼层本来有英文名才放）
  const namePair = { zh: zh || enData || '楼层', en: lang !== 'zh' || enData ? en : '', field: zh ? 'floor.zh' : 'floor.en', fieldEn: 'floor.en' };
  const rooms = floorRoomPairs(project, floor?.id, tr);

  // 没有可用的图（这一层只有紧接着的那一张 / 都做了满版 / 还没有图）：纯纸面的排版章节页（Aman 第 10 页的大字加列表）——
  // 楼层名大字在左（英文 Ogg 60pt + 中文 72pt），短线，下面空间清单（多了排两栏）；不画占位色块
  if (!src) {
    const x = PAGE.leftWide;
    const w = R - x;
    const big = (y0) => {
      const out = [];
      let cur = y0;
      let enT = clean(namePair.en);
      let zhT = clean(namePair.zh);
      let fEn = namePair.fieldEn;
      if (zhT && !hasCJK(zhT) && (!enT || sameLatin(zhT, enT))) {
        enT = zhT;
        zhT = '';
        fEn = namePair.field;
      }
      if (lang === 'en' && enT) zhT = '';
      if (enT) {
        const b = textBlock(x, cur, w, enT, style('nameEn', { size: 60, spacing: 12, lh: 84 }), { field: fEn, maxLines: 2, balance: true });
        out.push(b.el);
        cur = b.bottom + 6;
      }
      if (zhT) {
        const b = textBlock(x, cur, w, zhT, style('name'), { field: namePair.field, maxLines: 2, balance: true });
        out.push(b.el);
        cur = b.bottom;
      }
      return { els: out, bottom: cur };
    };
    const bh = big(0).bottom;
    const listMax = BOTTOM - 250 - bh - 40 - 44;
    const list = rooms.length ? roomList(x, 0, w, rooms, lang, listMax) : { els: [], h: 0, shown: 0 };
    const gh = bh + (rooms.length ? 40 + 44 + list.h : 0);
    const y0 = Math.round(Math.max(250, Math.min(MID - gh / 2, BOTTOM - gh)));
    const b = big(y0);
    els.push(...b.els);
    if (rooms.length) {
      const ry = b.bottom + 40;
      els.push(rule(x + 2, ry, 180, { alpha: ALPHA.rule }), ...shiftEls(list.els, ry + 44));
      if (list.shown < rooms.length) warnings.push(`本层空间太多，楼层页只显示了 ${list.shown} / ${rooms.length} 个`);
    }
    els.push(...signature('sail', { enOnly: lang === 'en' }).els);
    return page(els, warnings);
  }

  // 纸面栏：楼层名（英文大写 + 中文大字，dirA2 p3 / p8 的金句）→ 短线 180 → 本层空间（一句话的字级）；整组上下居中
  const x = FLOOR_COL;
  const w = R - x;

  const heroOf = (y0) => heroTitle(x, y0, w, namePair, lang);
  const heroH = heroOf(0).bottom;
  const RULE_GAP = 40;
  const LIST_GAP = 38;
  const minTop = 250;
  const listMax = BOTTOM - (minTop + heroH + RULE_GAP + LIST_GAP);
  const listTrial = rooms.length ? roomList(x, 0, w, rooms, lang, listMax) : { els: [], h: 0, shown: 0 };
  const gh = heroH + (rooms.length ? RULE_GAP + LIST_GAP + listTrial.h : 0);
  // 整组在 logo 下（192）到签名上（944）之间上下居中：上下的空纸一样多
  const y0 = Math.round(Math.max(minTop, Math.min(MID - gh / 2, BOTTOM - gh)));
  const hero = heroOf(y0);
  els.push(...hero.els);
  if (rooms.length) {
    const ry = hero.bottom + RULE_GAP;
    els.push(rule(x, ry, 180, { alpha: ALPHA.rule }));
    els.push(...shiftEls(listTrial.els, ry + LIST_GAP));
    if (listTrial.shown < rooms.length) warnings.push(`本层空间太多，楼层页只显示了 ${listTrial.shown} / ${rooms.length} 个`);
  }
  els.push(...signature('sail', { enOnly: lang === 'en' }).els);
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

/** 满版带标题：横图至少这么宽（4:3 = 1.33 起；更方的图铺满 16:9 要裁掉上下三成，柜子会被切头切脚） */
const FULL_MIN_RATIO = 1.3;
/** 满版左下角最多印几行材料（再多就排图文） */
const FULL_MATS = 2;

/**
 * 每张效果图页用满版（full）还是图文（plate）—— 整套的节奏：大图和图文交替，不连着几页同一个版式
 *   设定了版式就照设定（full → 满版；framed → 图文）；没有图 → 图文（排成纯文字两栏，不画占位）
 *   自动（auto）：横图（≥ 1.3）、像素够（铺满整页不发虚、水印裁得掉）、没有说明，材料不超过 2 行（印在左下角，Aman 第 9 页的满版带标题）
 *     → 满版；材料多的，它是这个空间的第一张、紧接着的下一页同楼层同空间且材料覆盖它（下一页是图文）→ 也满版；
 *   AI 立体图（tag '3d'）→ 图文；不连续出现 3 页满版；其余图文
 *   图文页的左右（plan.side）：连着的图文页一左一右交替（照片贴左 / 贴右镜像），不连着几页一模一样；竖图的半版照片总贴左
 * @param {object} project
 * @param {(src:string)=>({w:number,h:number}|null)} metaFn
 * @returns {Map<string,'full'|'plate'> & { side: Map<string,'left'|'right'> }}
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
    if (!s.image || s.tag === '3d' || ratioOf(s) < FULL_MIN_RATIO || noteRows(s).length || !fillsClean(natOf(s), W, H)) {
      plan.set(s.id, 'plate');
      continue;
    }
    // 材料不多（≤ 2 行、都选了材料）：满版，材料印在左下角
    if (matRows(s).length <= FULL_MATS && matRows(s).every((r) => r.materialId)) {
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
  // 图文页左右交替：连着的图文页（中间没有满版、楼层页）第 1、3、5 张照片贴左，第 2、4 张贴右；
  // 竖图 / 方图（半版照片）不镜像，也不打断交替
  const side = new Map();
  let k = 0;
  for (const s of shown) {
    if (s.kind !== 'view' || plan.get(s.id) !== 'plate') {
      k = 0;
      continue;
    }
    const halfImg = s.image && ratioOf(s) > 0 && ratioOf(s) < PLATE_HALF_RATIO;
    side.set(s.id, !halfImg && k % 2 === 1 ? 'right' : 'left');
    if (!halfImg) k += 1;
  }
  plan.side = side;
  return plan;
}

/** 满版页把这一页的说明 / 材料藏起来了吗（材料印在左下角的不算丢；出现在同空间另一张图文页上也不算丢） */
function lostOnFull(project, slide, plan) {
  const lost = [];
  if (noteRows(slide).length) lost.push('说明');
  const ids = matIds(slide);
  if (matRows(slide).length > FULL_CAPTION_ROWS) {
    const covered =
      ids.size > 0 &&
      matRows(slide).every((r) => r.materialId) &&
      (project.slides || []).some((x) => x !== slide && x.kind === 'view' && x.enabled !== false && plan.get(x.id) === 'plate' && sameRoom(x, slide) && superset(matIds(x), ids));
    if (!covered) lost.push('材料');
  }
  return lost;
}

/** 满版左下角最多印几行材料（设定成满版、材料更多时其余的不印，并提醒） */
const FULL_CAPTION_ROWS = 3;

/**
 * 满版（Aman 第 9 页的满版带标题）：效果图铺满整页；左上视角名（英文大写 Ogg 30pt + 中文思源宋体 28pt，白字）+「楼层　空间」，
 * 右上白 logo；左下材料（一行一种：项名 · 材料名 · 编号，F5EFDD）；不放页脚签名（右下角常是亮处，托不住）；
 * 字下面一条 1C1915 托字渐变（上面一条；有材料时下面再一条，最深 45%，离字边 200 内归零）—— 效果图中间一大片保持原样明亮
 */
export function bViewFull(ctx, slide, plan) {
  const { project, lang, tr, meta } = env(ctx);
  const s = slide || {};
  if (!s.image) return bViewPlate(ctx, s, plan);
  const els = [];
  const warnings = [];
  const r = rendering(0, 0, W, H, s.image, meta(s.image));
  lowRes(warnings, r.scale);
  if (r.wmShown) warnings.push(WM_WARN.full);
  const t = viewText(project, s, lang, tr, warnings);
  const area = fullBleed();
  const white = { color: B.white };
  // 左上：视角名（章节页栏目名的字号：「SHOE CABINET / 鞋柜」）
  const head = titleGroup(PAGE.leftWide, TOP, 1200, t.titlePair, lang, { size: 'chapter', ...white, maxLines: { en: 1, zh: 1 }, label: t.what.zh });
  if (head.cut) warnings.push(`${head.en?.el?._cut && !head.zh?.el?._cut ? t.what.en : t.what.zh}太长：已截短，建议精简`);
  const logo = cornerLogo('sail', { onPhoto: true, corner: 'tr' });
  // 「楼层　空间」排在视角名下面（同在上面那条托字里；中英版中文一行、英文一行）
  const ebItems = pick(lang, t.eyebrowPair);
  const ebEls = [];
  const ebParts = [];
  let ey = head.bottom + 10;
  for (const it of ebItems) {
    const en = it.lang === 'en' || !hasCJK(it.text);
    const st = en ? style(ST.eyebrowEn, { color: B.cream, size: 14, lh: 26 }) : style(ST.eyebrow, { color: B.cream, size: 16, spacing: 4, lh: 28 });
    const tb = textBlock(PAGE.leftWide, ey, 1100, it.text, st, { field: it.field, maxLines: 1 });
    if (!tb.el) continue;
    ebEls.push(tb.el);
    ebParts.push(tb);
    ey = tb.bottom;
  }
  // 左下：材料（一行一种：项名 · 材料名 · 编号），从下往上排，最后一行的底 1004（签名的那条底）
  const lineH = 32;
  const cap = { zh: style('rowKey', { size: 16, spacing: 3, lh: lineH, color: B.cream }), en: style('rowKeyEn', { size: 15, spacing: 1.5, lh: lineH, color: B.cream }) };
  const capVal = { zh: style('body', { size: 18, spacing: 1, lh: lineH, color: B.white }), en: style('bodyEn', { size: 18, spacing: 0.4, lh: lineH, color: B.white }) };
  const code = style('bodyEn', { size: 15, spacing: 1.2, lh: lineH, color: B.cream });
  const lines = [];
  const shownRows = t.rows.slice(0, FULL_CAPTION_ROWS);
  for (const row of shownRows) {
    const segs = [];
    for (const it of pick(lang, row.label || {})) segs.push({ text: it.text, st: hasCJK(it.text) ? cap.zh : cap.en, field: it.field });
    for (const it of pick(lang, row.value || {})) segs.push({ text: it.text, st: hasCJK(it.text) ? capVal.zh : capVal.en, field: it.field, gap: segs.length ? 28 : 0 });
    if (row.code) segs.push({ text: row.code, st: code, field: row.codeField, gap: 20 });
    lines.push(segs);
  }
  const capEls = [];
  const capParts = [];
  const maxX = 1300;
  lines.forEach((segs, k) => {
    const y = 1004 - (lines.length - k) * lineH;
    let x = PAGE.leftWide;
    segs.forEach((sg, j) => {
      x += j ? sg.gap ?? 12 : 0;
      // 先按剩下的宽截成一行，再按字的实际宽排（文字框不伸到后面那一段上）
      const b = textBlock(x, y, Math.max(80, maxX - x), sg.text, sg.st, { maxLines: 1 });
      if (!b.el) return;
      const tl = textLines(x, y, [b.el.paras[0].runs[0].text], sg.st, { field: sg.field, name: 'caption' });
      if (b.cut) tl.el._cut = true;
      capEls.push(tl.el);
      capParts.push(tl);
      x = tl.x1;
    });
  });
  // 满版效果图上不放页脚签名：右下角常是亮的沙发、窗帘、地面，托到 45% 也不够 4.5:1；品牌由右上角的白 logo 表达
  // 托字：上面一条（视角名 · 楼层空间 · logo），下面一条只在有材料时才放（没有材料，效果图的下半保持原样）；
  // 看不到设计师的效果图有多亮，一律最深 45%
  const shTop = shade(inkBox(head, ...ebParts, logo), area, { dir: 'v' });
  const shBottom = capParts.length ? shade(inkBox(...capParts), area, { dir: 'v' }) : null;
  // 效果图按「照片」标名（name 'photo:image'，排版检查据此认出「字压图且有托字」）
  els.push({ ...r.el, name: 'photo:image' }, shTop?.el, shBottom?.el, ...head.els, ...ebEls, logo.el, ...capEls);
  const lost = lostOnFull(project, s, plan || planViews(project, meta));
  if (lost.length) warnings.push(`满版大图不显示${lost.join('与')} —— 要列出来请换成「图文」版式`);
  return page(els.filter(Boolean), [...new Set(warnings)]);
}

export function bViewPage(ctx, slide, plan) {
  const e = env(ctx);
  const p = plan || planViews(e.project, e.meta);
  return p.get(slide?.id) === 'full' ? bViewFull(ctx, slide, p) : bViewPlate(ctx, slide, p);
}

// ---------------------------------------------------------------------------
// 效果图 · 图文
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
      image: mat.image || null,
      what: `材料「${name || code || '未命名'}」的`,
    });
  });
  return rows;
}

/** 编号在宽 w 的栏里折成几行（在空格、- / _ . 之后折；一段比栏还宽就按字硬折）→ 每行都放得下 */
function wrapCode(code, w, st = ST.code) {
  const avail = w * 0.98;
  const wid = (t) => measure(t.trimEnd(), st) - (st.spacing || 0) * (4 / 3);
  const fits = (t) => wid(t) <= avail;
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
    let best = null;
    for (let k = 1; k < parts.length; k++) {
      const a = parts.slice(0, k).join('');
      const b = parts.slice(k).join('');
      if (!fits(a) || !fits(b)) continue;
      const mx = Math.max(wid(a), wid(b));
      if (!best || mx < best.mx) best = { mx, lines: [a.trimEnd(), b.trimEnd()] };
    }
    if (best) return best.lines;
  }
  return lines;
}

/** 编号太长（另起一行还要折行）的提醒 */
const codeWarning = (code, lines) => `材料编号太长：「${code}」折成了 ${lines} 行 —— 建议精简（去材料清单改）`;

/** 一行字的可见宽（不含最后一个字后面的字距） */
const inkW = (text, st) => measure(text, st) - (st.spacing || 0) * (4 / 3);

/** 一对中英文排成一行要多宽（中英版：中文 + 14 + 英文；单语言 = 那一种） */
function pairInlineW(pair, lang, stZh, stEn) {
  const its = pick(lang, pair || {});
  return its.reduce((s0, it, k) => s0 + (k ? 14 : 0) + inkW(it.text, hasCJK(it.text) ? stZh : stEn), 0);
}

/**
 * 一格（项名 / 材料名）：中英版放得下就排一行（中文在前、英文跟着，同一条中线），否则中文在上、英文在下
 * @returns {{ els, bottom }}
 */
function pairCell(x, y, w, pair, lang, stZh, stEn, mode = 'auto') {
  const its = pick(lang, pair || {});
  if (its.length === 2 && mode !== 'stack' && (mode === 'inline' || pairInlineW(pair, lang, stZh, stEn) <= w * 0.98)) {
    const st0 = hasCJK(its[0].text) ? stZh : stEn;
    const lh = Math.max(st0.lh, stEn.lh);
    const a = textLines(x, y + (lh - st0.lh) / 2, [[its[0].text]], st0, { field: its[0].field });
    const b = textLines(a.x1 + 14, y + (lh - stEn.lh) / 2, [[its[1].text]], stEn, { field: its[1].field });
    return { els: [a.el, b.el], bottom: y + lh };
  }
  const r = stackPair(x, y, w, pair, lang, stZh, stEn, { gap: 0, balance: true });
  return { els: r.els, bottom: r.bottom };
}

/**
 * 材料表的一行（售后表的样子）：细线 → 项名（7B593D；中英版英文跟在中文后面，放不下另起一行）+ 编号靠右 → 材料名（中、英上下）
 *   编号和项名同一行；项名太长、编号放不下时编号排在材料名下面（仍靠右）
 * @returns {{ els, bottom, codeLines }}
 */
function matRow(x, y, w, row, lang, d, keyW = 0, keyMode = 'auto', noRule = false) {
  if (d.swatch) {
    // 小样在左（竖条，像一片木皮小样），项名 · 材料名 · 编号排在小样右边、和小样顶对齐
    const els = [rule(x, y, w, { alpha: ALPHA.tableRule })];
    const warn = [];
    const top = y + d.pad;
    if (row.image) {
      const ph = placePhoto({ src: row.image, nat: row.nat, label: row.what.replace(/的$/, '') }, x, top, d.sw, d.sh, { field: row.codeField });
      els.push(ph.el);
      if (ph.scale > 1.15) warn.push(`${row.what}图片像素偏低：放大 ${ph.scale.toFixed(1)} 倍会发虚，建议换高清图`);
    } else {
      els.push(sampleRect(x, top, d.sw, d.sh, row.codeField), ...frame(x, top, d.sw, d.sh));
    }
    const tx = x + d.sw + 24;
    const t = matRow(tx, top - 2, w - d.sw - 24, row, lang, { ...d, swatch: false, pad: 0 }, 0, 'auto', true);
    els.push(...t.els);
    return { els, bottom: Math.max(top + d.sh, t.bottom) + d.pad, codeLines: t.codeLines, warn };
  }
  const els = noRule ? [] : [rule(x, y, w, { alpha: ALPHA.tableRule })];
  let cur = y + d.pad;
  const keys = pick(lang, row.label || {});
  const codeW = row.code ? measure(row.code, ST.code) - ST.code.spacing * (4 / 3) : 0;
  if (d.side) {
    // 左右排：项名一栏、材料名一栏（中英版：中文、英文放得下就排一行，否则上下）；编号在材料名第一行的右边（放不下就排在下面、靠右）
    const kw = keyW || Math.round(w * 0.3);
    const vw = w - kw;
    const inline = !!row.code && codeW + 16 <= vw * 0.4;
    const k = pairCell(x, cur, kw - 16, row.label, lang, d.key, d.keyEn, keyMode);
    const v = pairCell(x + kw, cur, vw - (inline ? codeW + 16 : 0), row.value, lang, d.val, d.valEn);
    els.push(...k.els, ...v.els);
    let bottom = Math.max(k.bottom, v.bottom);
    let codeLines = 0;
    if (inline) els.push(textLines(x + w, cur + (d.val.lh - ST.code.lh) / 2, [[row.code]], ST.code, { align: 'r', field: row.codeField }).el);
    else if (row.code) {
      const lines = wrapCode(row.code, vw);
      codeLines = lines.length;
      els.push(textLines(x + w, v.bottom, [lines], ST.code, { align: 'r', field: row.codeField }).el);
      bottom = Math.max(bottom, v.bottom + lines.length * ST.code.lh);
    }
    return { els, bottom: bottom + d.pad, codeLines };
  }
  const keyLine = d.key.lh;
  let codeInline = !!row.code && codeW <= w * 0.42;
  let keyBottom = cur;
  if (keys.length) {
    const room = w - (codeInline ? codeW + 24 : 0);
    const kz = keys[0];
    const kzSt = hasCJK(kz.text) ? d.key : d.keyEn;
    const kzW = measure(kz.text, kzSt) - (kzSt.spacing || 0) * (4 / 3);
    const ke = keys[1];
    const keW = ke ? measure(ke.text, d.keyEn) - (d.keyEn.spacing || 0) * (4 / 3) : 0;
    if (ke && kzW + 20 + keW <= room * 0.98) {
      // 中英版：中文项名、英文项名排一行
      const a = textLines(x, cur, [[kz.text]], kzSt, { field: kz.field });
      const b = textLines(x + kzW + 20, cur + (keyLine - d.keyEn.lh) / 2, [[ke.text]], d.keyEn, { field: ke.field });
      els.push(a.el, b.el);
      keyBottom = cur + keyLine;
    } else {
      const a = textBlock(x, cur, room, kz.text, kzSt, { field: kz.field, balance: true });
      els.push(a.el);
      keyBottom = a.bottom;
      if (ke) {
        const b = textBlock(x, keyBottom, room, ke.text, d.keyEn, { field: ke.field, balance: true });
        els.push(b.el);
        keyBottom = b.bottom;
      }
    }
  }
  if (codeInline && (!keys.length || keyBottom - cur <= keyLine * 2)) {
    els.push(textLines(x + w, cur + (keyLine - ST.code.lh) / 2, [[row.code]], ST.code, { align: 'r', field: row.codeField }).el);
  } else codeInline = false;
  cur = keys.length ? keyBottom + d.kv : cur;
  const val = stackPair(x, cur, w, row.value, lang, d.val, d.valEn, { gap: 0, balance: true });
  els.push(...val.els);
  cur = val.bottom;
  let codeLines = 0;
  if (row.code && !codeInline) {
    const lines = wrapCode(row.code, w);
    codeLines = lines.length;
    els.push(textLines(x + w, cur + 2, [lines], ST.code, { align: 'r', field: row.codeField }).el);
    cur += 2 + lines.length * ST.code.lh;
  }
  return { els, bottom: cur + d.pad, codeLines };
}

/** 整张材料表：最后一行下面再一条细线 */
function matTable(x, y, w, rows, lang, d) {
  const els = [];
  let cur = y;
  const codeWarn = [];
  // 左右排时项名一栏的宽：最长的项名 + 20，最多栏宽的 36%（更长的在栏里折行）
  let keyW = 0;
  let keyMode = 'auto';
  if (d.side) {
    // 项名一栏：中英版每一行的中英项名都排得进一行（最多栏宽的 42%）就整张表都排一行；否则整张表都上下排（同一张表一个样子）
    const inl = Math.max(0, ...rows.map((r) => pairInlineW(r.label, lang, d.key, d.keyEn)));
    const one = Math.max(0, ...rows.flatMap((r) => pick(lang, r.label || {}).map((it) => inkW(it.text, hasCJK(it.text) ? d.key : d.keyEn))));
    const inlineOk = inl + 24 <= w * 0.42;
    keyMode = inlineOk ? 'inline' : 'stack';
    keyW = Math.round(Math.max(72, inlineOk ? inl + 24 : Math.min(w * 0.36, one + 24)));
  }
  for (const row of rows) {
    const r = matRow(x, cur, w, row, lang, d, keyW, keyMode);
    els.push(...r.els);
    if (r.codeLines > 1) codeWarn.push(codeWarning(row.code, r.codeLines));
    if (r.warn) codeWarn.push(...r.warn);
    cur = r.bottom;
  }
  if (rows.length) els.push(rule(x, cur, w, { alpha: ALPHA.tableRule }));
  return { els, top: y, bottom: cur + (rows.length ? 1.5 : 0), h: cur - y, codeWarn };
}

/** 一条说明：小标题（7B593D）+ 正文（中、英上下） */
function noteBlock(x, y, w, nt, lang, compact = false) {
  const els = [];
  let cur = y;
  const labels = nt.label ? pick(lang, nt.label) : [];
  if (compact && labels.length) {
    // 紧凑：小标题（中英版：中英排一行）和正文的第一行同一行，正文从小标题后面接着排（中英版的英文从下一行的栏头排起）；
    // 小标题太长就照常上下排
    const lw = labels.reduce((s, it, k) => s + (k ? 14 : 0) + measure(it.text, hasCJK(it.text) ? ST.noteLabel : ST.noteLabelEn), 0);
    const oneLine = lw + 16 <= w * 0.45;
    if (oneLine) {
      let lx = x;
      labels.forEach((it) => {
        const st = hasCJK(it.text) ? ST.noteLabel : ST.noteLabelEn;
        const a = textLines(lx, cur + (ST.note.lh - st.lh) / 2, [[it.text]], st, { field: it.field });
        els.push(a.el);
        lx = a.x1 + 14;
      });
      // 正文接在小标题后面（中英版：中文接在后面，英文从下一行的栏头排起）
      const texts2 = pick(lang, nt.text);
      const first = stackPair(x + lw + 16, cur, w - lw - 16, { ...nt.text, en: lang === 'bi' ? '' : nt.text.en }, lang === 'bi' ? 'zh' : lang, ST.note, ST.noteEn, { balance: true });
      els.push(...first.els);
      let bottom = first.bottom;
      if (lang === 'bi' && texts2.length === 2) {
        const enB = textBlock(x, bottom + 4, w, texts2[1].text, ST.noteEn, { field: texts2[1].field, balance: true });
        els.push(enB.el);
        bottom = enB.bottom;
      }
      return { els, top: y, bottom, h: bottom - y };
    }
  }
  if (labels.length) {
    const lb = stackPair(x, cur, w, nt.label, lang, ST.noteLabel, ST.noteLabelEn, { gap: 0, balance: true });
    els.push(...lb.els);
    cur = lb.bottom + 4;
  }
  const tx = stackPair(x, cur, w, nt.text, lang, ST.note, ST.noteEn, { gap: 6, balance: true });
  els.push(...tx.els);
  return { els, top: y, bottom: tx.bottom, h: tx.bottom - y };
}

/**
 * 视角名（页眉）：英文大写 + 中文（titleGroup）。放不下（每种语言超过 2 行 / 英文单词比栏宽）先降成章节页的字号，
 * 还放不下就截短；两种情况都提醒（说清是哪一栏，编辑器的一键修复跳过去）
 * @returns {{ els, top, bottom, x0, x1, warn:string|null }}
 */
function viewTitle(x, y, w, pair, lang, { maxEn = 2, what }) {
  const tooLong = (g, lines) => {
    const zhCut = !!g.zh?.el?._cut;
    const enCut = !!g.en?.el?._cut;
    return { any: zhCut || enCut, zh: zhCut, en: enCut, lines };
  };
  const enText = clean(pair.en);
  const page1 = titleGroup(x, y, w, pair, lang, { maxLines: { en: maxEn, zh: 2 } });
  const enWide = !!enText && wordTooWide(enText, style('display'), w);
  const t1 = tooLong(page1);
  if (!t1.any && !enWide) return { ...page1, warn: null };
  // 华文版的英文页眉只是装饰：英文太长就不放它（不提醒，华文版不管英文）
  if (lang === 'zh' && !t1.zh) return { ...titleGroup(x, y, w, { ...pair, en: '' }, lang, { maxLines: { zh: 2 } }), warn: null };
  const small = titleGroup(x, y, w, pair, lang, { size: 'chapter', maxLines: { en: 3, zh: 2 } });
  const t2 = tooLong(small);
  // 太长的是哪一栏：中文 / 英文（只有英文长 = 英文那一栏）
  const enOnly = (t1.en || enWide) && !t1.zh;
  const warn = `${enOnly ? what.en : what.zh}太长：已缩小一级，建议精简`;
  return { ...small, warn: t2.any || t1.any || enWide ? warn : null };
}

/**
 * 图文页的几何：
 *   横图、方图（≥ 0.9）：页眉在上（x 112，右边到 logo 前 60）；效果图贴左、落到底（上边 = 页眉下 48，至少 200），
 *     宽 = 按比例、最多 1340；右栏从图边再空 96（至少），宽最多 640、靠右边界 1810；放不下时照片收窄到 1180 / 1080。
 *     全景图（很宽）按「放大不超过 1.15 倍」缩矮一点，仍落到底
 *   竖图、方图（< 1.25）：半版照片贴左（宽 820–1050 按比例，上下贴边）；页眉在纸面栏（照片边 + 100 起，右边到 logo 前 60）
 *   这一页没有说明、没有材料（立体图页常这样）：照片上下贴边（宽最多 1340；竖图 / 方图 820–1050），纸面栏放章节页式的大标题 +
 *     短线 +「楼层　空间」，整组上下居中 —— 不留一栏空纸
 */
const PLATE_IMG_MAX = 1340;
const PLATE_GAP = 96;
const PLATE_COL_MAX = 640;
const HALF_GAP = 100;

/**
 * 效果图页的字：页眉（视角名，没有 = 空间名）、「楼层　空间」小标签、材料行、说明
 * @returns {{ floor, titlePair, eyebrowPair, what, rows, notes }}
 */
function viewText(project, s, lang, tr, warnings) {
  const floor = findFloor(project, s.floorId);
  // 右栏顶上：楼层　空间（没有视角名 = 标题就是空间名，这时只写楼层）；页眉：视角名（没有 = 空间名）
  const roomZh = clean(s.room);
  const sub = clean(s.subtitle);
  const roomEn = roomZh || clean(s.roomEn) ? tidyTitle(tr.room(s)) : '';
  const floorPart = floor ? { zh: clean(floor.zh), en: tidyTitle(floorTitleEn(floor.en)) || (clean(floor.zh) ? tidyTitle(tr.en(floor.zh, 'room')) : '') } : null;
  // AI 立体图页的「空间」就是楼层名（一楼 / 全屋）：标签只写一次，不印成「一楼　一楼」
  const roomInLabel = sub && roomZh && !(s.tag === '3d' || (floorPart && roomZh === floorPart.zh));
  const labelParts = [floorPart, roomInLabel ? { zh: roomZh, en: roomEn } : null].filter(Boolean);
  if (!labelParts.length && s.tag === '3d' && roomZh) labelParts.push({ zh: roomZh, en: roomZh === '全屋' ? 'Whole Home' : roomEn });
  const eyebrowPair = { ...joinPair(labelParts, '　', ' — ', lang), field: roomInLabel || !floorPart ? 'room' : 'floor', fieldEn: roomInLabel || !floorPart ? 'roomEn' : 'floor' };
  // 华文版的英文页眉是装饰：有现成的英文（翻译记忆 / 词典 / 英文小标题）才放，不记缺英文
  const decoEn = (zh, kind) => (lang === 'zh' ? resolveEn(project, zh, kind).text : '');
  const titlePair = sub
    ? { zh: sub, en: lang === 'zh' ? tidyTitle(decoEn(sub, 'view')) : tidyTitle(tr.en(sub, 'view')), field: 'title', fieldEn: 'subtitleEn' }
    : { zh: roomZh, en: lang === 'zh' ? tidyTitle(roomEnOf(project, s).text) : roomEn, field: 'room', fieldEn: 'roomEn' };
  const what = sub ? { zh: '视角名', en: '视角名的英文' } : { zh: '空间名', en: '空间英文名' };
  const rows = materialRowsOf(project, s, lang, tr, warnings);
  const notes = notesOf(project, s, lang, tr);
  return { floor, titlePair, eyebrowPair, what, rows, notes };
}

/** 竖图、方图（宽高比低于这个）：图文页用半版照片（上下贴边） */
const PLATE_HALF_RATIO = 1.25;
/** 横图的图文页：照片统一 1180 宽（cover 裁切）；规格栏统一 537 宽，离照片 93（贴左时 x = 1273；镜像时 x = 112、照片贴右） */
const PLATE_W = 1180;
const PLATE_COL_W = 537;

export function bViewPlate(ctx, slide, plan = null) {
  const { project, lang, tr, meta } = env(ctx);
  const s = slide || {};
  const els = [];
  const warnings = [];
  const { titlePair, eyebrowPair, what, rows, notes: allNotes } = viewText(project, s, lang, tr, warnings);
  if (rows.length > 6) warnings.push('材料太多：建议拆成两页');
  const empty = !rows.length && !allNotes.length;
  const mirror = plan?.side?.get(s.id) === 'right';
  if (!s.image) return plateNoImage({ project, lang, tr, meta }, s, { titlePair, eyebrowPair, what, rows, notes: allNotes }, warnings);

  // —— 几何 ——
  const nat = s.image ? meta(s.image) : null;
  const ratio = nat?.w && nat?.h ? nat.w / nat.h : 16 / 9;
  const logo = sailLogo();
  // 竖图、方图（< 1.25）：半版照片上下贴边（宽 820–1050，按比例），页眉在纸面栏 —— 不缩成一小块、旁边空一大片
  const half = ratio < PLATE_HALF_RATIO;
  const halfW = Math.max(HALF.min, Math.min(HALF.max, Math.round(H * ratio)));
  const putImage = (img) => {
    if (s.image) {
      const r = rendering(img.x, img.y, img.w, img.h, s.image, nat);
      els.push(r.el);
      lowRes(warnings, r.scale);
      if (r.wmShown) warnings.push(WM_WARN.plate);
    } else {
      els.push(...missingImage(img.x, img.y, img.w, img.h));
      warnings.push('缺少效果图');
    }
  };

  if (empty) {
    // 全景图（≥ 1.9 : 1，宽够 1920 不发虚）：页眉 +「楼层　空间」在上，照片通栏一条（0–1920），签名在下面的纸上
    if (!half && ratio >= 1.9 && (!nat?.w || W / nat.w <= 1.15)) {
      const head = viewTitle(L, TOP, HEAD_R - L, titlePair, lang, { maxEn: 2, what });
      if (head.warn) warnings.push(head.warn);
      const eb = stackPair(L, Math.ceil(head.bottom + 20), HEAD_R - L, eyebrowPair, lang, ST.eyebrow, ST.eyebrowEn, { gap: 2, balance: true });
      const top = Math.max(240, Math.ceil(Math.max(head.bottom, eb.bottom) + 48));
      const bh = Math.min(PAGE.sigTop - 40 - top, Math.round(W / ratio));
      putImage({ x: 0, y: Math.round(top + (PAGE.sigTop - 40 - top - bh) / 2), w: W, h: bh });
      els.push(logo.el, ...head.els, ...eb.els, ...signature('sail', { enOnly: lang === 'en' }).els);
      return page(els, [...new Set(warnings)]);
    }
    // 其余：照片上下贴边（宽最多 1340；竖图 / 方图 820–1050），纸面栏放章节页式的大标题 + 短线 +「楼层　空间」，整组上下居中（楼层页的样子）。
    // 原图不够大（铺满 1080 高要放大超过 1.15 倍、或躲不开水印）：照片缩小到清楚为止、上下居中（上下留同样的纸）
    let box = { x: 0, y: 0, w: half ? halfW : Math.min(PLATE_IMG_MAX, Math.round(H * ratio)), h: H };
    if (nat?.w && !fillsClean(nat, box.w, box.h)) {
      for (let ih = H - 20; ih >= 0.6 * H; ih -= 20) {
        const iw = half ? Math.min(halfW, Math.round(ih * ratio)) : Math.min(PLATE_IMG_MAX, Math.round(ih * ratio));
        if (fillsClean(nat, iw, ih)) {
          box = { x: 0, y: Math.round((H - ih) / 2), w: iw, h: ih };
          break;
        }
      }
    }
    const iw = box.w;
    putImage(box);
    els.push(logo.el);
    const x = iw + HALF_GAP;
    const w = R - x;
    const group = (y0) => {
      const out = [];
      const t = heroTitle(x, y0, w, titlePair, lang);
      out.push(...t.els);
      let bottom = t.bottom;
      const eb = stackPair(x, t.bottom + 56 + 48, w, eyebrowPair, lang, ST.eyebrow, ST.eyebrowEn, { gap: 2, balance: true });
      if (eb.els.length) {
        out.push(rule(x, t.bottom + 56, 180, { alpha: ALPHA.rule }), ...eb.els);
        bottom = eb.bottom;
      }
      return { els: out, bottom, cut: t.cut };
    };
    const gh = group(0).bottom;
    const y0 = Math.round(Math.max(250, Math.min(MID - gh / 2, BOTTOM - gh)));
    const g = group(y0);
    els.push(...g.els);
    if (g.cut) warnings.push(`${what.zh}太长：已缩小一级，建议精简`);
    els.push(...signature('sail', { enOnly: lang === 'en' }).els);
    return page(els, [...new Set(warnings)]);
  }

  // —— 有说明 / 材料：页眉 + 照片 + 右栏（楼层 · 空间 → 说明 → 材料表，售后表的样子），右栏在 [栏顶, 900] 里上下居中 ——
  let head;
  const geoms = [];
  if (!half) {
    // 横图：一套固定的栅格（翻页时栏位、字级不跳）—— 页眉在上；照片 1180 宽、上边 = 页眉下 48、落到底（cover 裁切）；
    // 规格栏 537 宽，从照片上边下 24 起（和照片顶对齐着往下排）；镜像页照片贴右、规格栏在左（x 112）
    head = viewTitle(L, TOP, HEAD_R - L, titlePair, lang, { maxEn: 2, what });
    const top = Math.max(200, Math.ceil(head.bottom + 48));
    let ih = H - top;
    // 全景图：铺满这么高要放大超过 1.15 倍 → 缩矮（仍落到底），只缩一点点就够时才缩（本来就太小的图照常提醒）
    if (nat?.h && ih / nat.h > 1.15 && nat.h * 1.15 >= 0.75 * ih) ih = Math.floor(nat.h * 1.15);
    const iw = PLATE_W;
    const ix = mirror ? W - iw : 0;
    const cx = mirror ? L : R - PLATE_COL_W;
    geoms.push({ img: { x: ix, y: H - ih, w: iw, h: ih }, col: { x: cx, w: PLATE_COL_W, top: top + 24 }, head });
  } else {
    // 半版照片宽：按比例（820–1050）；右栏放不下时收窄到 920、820（页眉和右栏都宽一些）
    for (const hw of [halfW, 920, HALF.min].filter((v, i) => i === 0 || v < halfW)) {
      const cx = hw + HALF_GAP;
      const hd = viewTitle(cx, TOP, HEAD_R - cx, titlePair, lang, { maxEn: 3, what });
      geoms.push({ img: { x: 0, y: 0, w: hw, h: H }, col: { x: cx, w: R - cx, top: Math.ceil(hd.bottom + 56) }, head: hd });
    }
    // 照片宽了、页眉挤得要降字号：先收窄照片（页眉在纸面栏里排得开就不降）
    const clean = geoms.filter((g) => !g.head.warn);
    if (clean.length && clean.length < geoms.length) geoms.splice(0, geoms.length, ...clean);
    head = geoms[0].head;
  }

  const EB_GAP = 36;
  const NOTE_GAP = 28;
  const TABLE_GAP = 40;
  const measureCol = (col) => {
    const eyebrow = stackPair(col.x, 0, col.w, eyebrowPair, lang, ST.eyebrow, ST.eyebrowEn, { gap: 2, balance: true });
    const ebH = eyebrow.els.length ? eyebrow.bottom + EB_GAP : 0;
    const notesH = (list, d) => list.reduce((h, nt, k) => h + (k ? NOTE_GAP : 0) + noteBlock(col.x, 0, col.w, nt, lang, d.compactNotes).h, 0);
    const tableH = (rs, d) => (rs.length ? matTable(col.x, 0, col.w, rs, lang, d).bottom : 0);
    const total = (ns, rs, d) => ebH + notesH(ns, d) + (ns.length && rs.length ? TABLE_GAP : 0) + tableH(rs, d);
    return { eyebrow, ebH, total, avail: BOTTOM - col.top };
  };
  // 材料带上小样图（swatch）：rows 里补上原图尺寸
  const rowsN = rows.map((r) => ({ ...r, nat: r.image ? meta(r.image) : null }));
  rows.splice(0, rows.length, ...rowsN);
  /** 1–3 种材料、放得下：每行前面一块材质小样（高 300 / 240 / 190，按剩下的地方收；矮过 140 不放） */
  const swatchD = (g) => {
    const n = rows.length;
    if (!n || n > SWATCH_H.length || g.col.w < 480) return null;
    const m = measureCol(g.col);
    const pad = 16;
    // 栏里扣掉「楼层　空间」、说明、说明和表之间的空、最后一条细线，剩下的分给每一行
    const rest = m.avail - m.total(allNotes, [], D0) - (allNotes.length ? TABLE_GAP : 0) - 2;
    const sh = Math.floor(Math.min(SWATCH_H[n - 1], rest / n - 2 * pad));
    if (sh < SWATCH_MIN_H) return null;
    return { ...D0, swatch: true, sh, sw: Math.round(sh * SWATCH_RATIO), pad };
  };
  // 版式的选法：有小样的优先，其次疏的（售后表样子的大字）；全部说明 + 全部材料都放得下的第一种
  const cands = [];
  for (const g of geoms) {
    const sd = swatchD(g);
    if (sd) cands.push({ g, d: sd });
  }
  for (const d of DENSITY.slice(0, 2)) for (const g of geoms) cands.push({ g, d });
  for (const g of geoms) cands.push({ g, d: DENSITY[2] });
  let pickC = null;
  for (const c of cands) {
    const m = measureCol(c.g.col);
    if (c.g.col.w >= 380 && m.total(allNotes, rows, c.d) <= m.avail) {
      pickC = { ...c, m };
      break;
    }
  }
  // 都放不下（说明、材料很多）：版式和字级不变，依次 ① 规格栏从 logo 下面起（照片贴左、页眉没伸进栏里时；栏高 600 → 680）
  //   ② 照片收窄到 1080、规格栏放宽到 637 ③ 两样都用。还放不下才少印（下面）
  if (!pickC && !half) {
    const tryGeoms = (list) => {
      for (const d of DENSITY) {
        for (const g of list) {
          const m = measureCol(g.col);
          if (g.col.w >= 380 && m.total(allNotes, rows, d) <= m.avail) return { g, d, m };
        }
      }
      return null;
    };
    const liftTop = Math.max(220, Math.ceil(logo.bottom + 28));
    const lift = (g) => {
      if (mirror) return null;
      const nh = viewTitle(L, TOP, g.col.x - 40 - L, titlePair, lang, { maxEn: 2, what });
      // 页眉的框也收窄到规格栏前面（不和规格栏叠）
      return nh.bottom === head.bottom && !nh.warn === !head.warn ? { ...g, head: nh, col: { ...g.col, top: liftTop } } : null;
    };
    const g0 = geoms[0];
    const IW2 = 1080;
    const wide = { ...g0, img: { ...g0.img, x: mirror ? W - IW2 : 0, w: IW2 }, col: { ...g0.col, x: mirror ? L : IW2 + 93, w: mirror ? W - IW2 - 93 - L : R - IW2 - 93 } };
    const steps = [[lift(g0)], [wide], [lift(wide)]].map((l) => l.filter(Boolean));
    for (const list of steps) {
      if (!list.length) continue;
      pickC = tryGeoms(list);
      if (pickC) break;
      geoms.splice(0, geoms.length, ...list);
    }
  }
  let notes = allNotes;
  let shownRows = rows;
  if (!pickC) {
    // 都放不下：用最宽的右栏、最紧的字；先少印说明（材料是事实，优先），再少印材料
    const g = geoms[geoms.length - 1];
    pickC = { g, d: DENSITY[2], m: measureCol(g.col) };
    const { total, avail } = pickC.m;
    const d = pickC.d;
    const dropped = [];
    notes = [];
    for (const nt of allNotes) {
      if (total([...notes, nt], rows, d) <= avail) notes.push(nt);
      else dropped.push(nt);
    }
    while (shownRows.length && total(notes, shownRows, d) > avail) shownRows = shownRows.slice(0, -1);
    if (dropped.length) {
      const dn = dropped[0];
      const which = `第 ${dn.i + 1} 条${String(dn.text?.field || '').endsWith('.label') ? '的标签' : ''}`;
      warnings.push(allNotes.length === 1 ? `说明太长（${which}）：建议精简或拆页` : '说明太多放不下：建议拆成两页');
    }
    if (shownRows.length < rows.length && rows.length <= 6) warnings.push(`材料表放不下：第 ${shownRows.length + 1} 项起没有印出来 —— 建议精简名称或拆成两页`);
  }
  const { g, m } = pickC;
  let { d } = pickC;
  if (g.head.warn) warnings.push(g.head.warn);
  putImage(g.img);
  els.push(logo.el, ...g.head.els);
  const { x, w } = g.col;
  // 地方宽裕：材料表的行再松一点（售后表的行距 108 上下），栏里不留大空洞
  if (!d.side && !d.swatch && shownRows.length) {
    const slack = m.avail - m.total(notes, shownRows, d);
    const extra = Math.max(0, Math.min(shownRows.length <= 2 ? 40 : 24, Math.floor(slack / (2 * shownRows.length + 4))));
    if (extra) d = { ...d, pad: d.pad + extra };
  }
  const used = m.total(notes, shownRows, d);
  // 横图：规格栏从照片顶（+ 24）起往下排，和照片顶对齐（每页同一条线）；剩下的地方大时略往下挪，上下的空纸不超过 250
  // 竖图（半版）：在 logo 底到签名顶之间居中，但不高过栏顶、不低过 900
  let y = half
    ? Math.round(Math.max(g.col.top, Math.min(MID - used / 2, BOTTOM - used)))
    : Math.round(g.col.top + Math.max(0, Math.min(BOTTOM - g.col.top - used, PAGE.sigTop - 240 - (g.col.top + used))));
  if (m.eyebrow.els.length) {
    els.push(...shiftEls(m.eyebrow.els, y));
    y += m.ebH;
  }
  notes.forEach((nt, k) => {
    if (k) y += NOTE_GAP;
    const nb = noteBlock(x, y, w, nt, lang, d.compactNotes);
    els.push(...nb.els);
    y = nb.bottom;
  });
  if (shownRows.length) {
    if (notes.length) y += TABLE_GAP;
    const t = matTable(x, y, w, shownRows, lang, d);
    els.push(...t.els);
    warnings.push(...t.codeWarn);
  }
  // 镜像页（照片贴右）：签名在纸面栏的右下（不压在照片上）
  els.push(...signature('sail', { enOnly: lang === 'en', ...(mirror && !half ? { right: g.col.x + g.col.w } : {}) }).els);
  return page(els, [...new Set(warnings)]);
}

/**
 * 图文页没有效果图：不画占位色块（客户拿到像坏页）—— 排成纯文字两栏：页眉 +「楼层　空间」在上，
 * 说明在左栏（x 112）、材料表在右栏（x 1010）；提醒「缺少效果图」（一键换图）
 */
function plateNoImage(e, s, t, warnings) {
  const { lang } = e;
  const els = [sailLogo().el];
  warnings.push('缺少效果图');
  const head = viewTitle(L, TOP, HEAD_R - L, t.titlePair, lang, { maxEn: 2, what: t.what });
  if (head.warn) warnings.push(head.warn);
  els.push(...head.els);
  const eb = stackPair(L, Math.ceil(head.bottom + 24), HEAD_R - L, t.eyebrowPair, lang, ST.eyebrow, ST.eyebrowEn, { gap: 2, balance: true });
  els.push(...eb.els);
  const top = Math.ceil(Math.max(head.bottom, eb.bottom) + 72);
  const C1 = { x: L, w: 800 };
  const C2 = { x: 1010, w: R - 1010 };
  const hasNotes = t.notes.length > 0;
  // 只有一种内容时占左栏（宽一些）
  const tableCol = hasNotes ? C2 : C1;
  let y = top;
  t.notes.forEach((nt, k) => {
    if (k) y += 28;
    const nb = noteBlock(C1.x, y, C1.w, nt, lang, false);
    if (nb.bottom > BOTTOM) {
      warnings.push(t.notes.length === 1 ? `说明太长（第 ${nt.i + 1} 条）：建议精简或拆页` : '说明太多放不下：建议拆成两页');
      return;
    }
    els.push(...nb.els);
    y = nb.bottom;
  });
  if (t.rows.length) {
    const d = DENSITY.find((dd) => matTable(tableCol.x, top, tableCol.w, t.rows, lang, dd).bottom <= BOTTOM) || DENSITY[2];
    let rs = t.rows;
    while (rs.length > 1 && matTable(tableCol.x, top, tableCol.w, rs, lang, d).bottom > BOTTOM) rs = rs.slice(0, -1);
    if (rs.length < t.rows.length && t.rows.length <= 6) warnings.push(`材料表放不下：第 ${rs.length + 1} 项起没有印出来 —— 建议精简名称或拆成两页`);
    const tb = matTable(tableCol.x, top, tableCol.w, rs, lang, d);
    els.push(...tb.els);
    warnings.push(...tb.codeWarn);
  }
  els.push(...signature('sail', { enOnly: lang === 'en' }).els);
  return page(els, [...new Set(warnings)]);
}

// ---------------------------------------------------------------------------
// 本案材料：页眉 + 小样网格（小样挂在页眉下，说明在小样下，最长的说明落在 900）
// ---------------------------------------------------------------------------

/** 版心 112–1810（1698 宽）；小样之间空 32 */
const GRID_W = R - L;
const SW_GAP = 32;
const modW = (k) => Math.floor((GRID_W - (k - 1) * SW_GAP) / k);
/**
 * 一排几块 → 小样宽与步距：6 块 256 · 5 块 314 · 4 块 400 · 3 块 544 · 1–2 块 = 两块撑满版心（833）
 */
const MODULE = Object.fromEntries([1, 2, 3, 4, 5, 6].map((k) => {
  const w = modW(Math.max(2, k));
  return [k, { w, step: w + SW_GAP }];
}));
// 一排时小样最多高到宽的 2.7 倍（6 种 = 256 × 690 左右的竖条，像一排木皮小样；实际高度还受「不放大超过 1.15 倍」限制）
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
 * 两排的小样最矮多少：宽的 0.6 倍，但不超过「说明都只有一行时」小样高度的 0.75 倍。
 * 名称很长、长编号另起一行把小样挤得比这还矮 → 每页少放几种、排一排（materialSlices）
 */
const SWATCH_MIN = 0.6;
const SWATCH_MIN_STD = 0.75;

/**
 * 小样下面的说明：名称（中英上下，表格内容色），编号与第一行同一行、靠右（签名色小字）；
 * 编号太宽（超过小样宽的 40%）就排在名称下面、仍靠右
 * @returns {{ els, bottom, cut:boolean, codeLines:number }}  cut = 名称截短了；codeLines = 另起一行的编号折成几行
 */
function drawCaption(x, y, w, cap, lang, field) {
  const its = pick(lang, cap.name);
  const els = [];
  let cur = y;
  let cut = false;
  const codeW = cap.code ? measure(cap.code, ST.code) - ST.code.spacing * (4 / 3) : 0;
  const inline = !!cap.code && codeW + 12 <= w * 0.4;
  its.forEach((it, k) => {
    const st = it.lang === 'en' || !hasCJK(it.text) ? ST.capNameEn : ST.capName;
    const bw = w - (k === 0 && inline ? codeW + 12 : 0);
    const b = textBlock(x, cur, bw, it.text, st, { field: it.field, balance: true, maxLines: CAPTION_LINES });
    els.push(b.el);
    if (b.cut) cut = true;
    if (k === 0 && inline) els.push(textLines(x + w, cur + (st.lh - ST.code.lh) / 2, [[cap.code]], ST.code, { align: 'r', field }).el);
    cur = b.bottom;
  });
  let codeLines = 0;
  if (cap.code && !inline) {
    const lines = wrapCode(cap.code, w);
    codeLines = lines.length;
    els.push(textLines(x + w, cur, [lines], ST.code, { align: 'r', field }).el);
    cur += lines.length * ST.code.lh;
  }
  return { els, bottom: cur, cut, codeLines };
}

/** 一行名称（中、英各一行）的说明有多高：两排、分页时按它定小样高度（几页的小样一样大） */
const stdCaptionH = (lang) => (lang === 'bi' ? ST.capName.lh + ST.capNameEn.lh : lang === 'en' ? ST.capNameEn.lh : ST.capName.lh);

const MAT_TITLE = { zh: '本案材料', en: 'Materials' };
const MAT_TITLE_CONT = { zh: '本案材料（续）', en: 'Materials, continued' };

/** 小样挂在页眉下 64（按第一页的页眉量，续页的小样与第一页同一高度） */
const matTop = (lang) => Math.ceil(titleGroup(L, TOP, HEAD_R - L, MAT_TITLE, lang).bottom + 64);

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
  // 1–3 种：小样很大，原图不够清楚就收窄到「放大 1.15 倍」的宽（不窄过 4 块一排的 400；本来就太小的图单独提醒，不拖累整页）
  const nats = list.map((m) => (m.image ? meta(m.image) : null));
  const sharpW = Math.min(...nats.map((nt) => (nt?.w ? nt.w * 1.15 : Infinity)));
  if (perRow <= 3 && mod.w > sharpW && sharpW >= MODULE[4].w) {
    const sw = Math.floor(sharpW + 1e-6);
    mod = { w: sw, step: sw + SW_GAP };
  }
  const size = mod.w;
  const top = matTop(lang);
  const caps = list.map((m) => materialCaption(m, lang, tr));
  const capInfo = caps.map((c) => drawCaption(0, 0, size, c, lang));
  const rowsOf = Array.from({ length: rowsN }, (_, r) => list.slice(r * perRow, (r + 1) * perRow).map((_, k) => r * perRow + k)).filter((r) => r.length);
  const rowCapH = rowsOf.map((idx) => Math.max(...idx.map((i) => capInfo[i].bottom)));
  // 不放大超过 1.15 倍：按「宽度上清楚」的小样算高度上限（本来就不清楚的那张单独提醒，不拖累整页）
  const sharpH = Math.min(...nats.map((nt) => (nt?.w && nt?.h && nt.w * 1.15 + 1e-6 >= size ? nt.h * 1.15 : Infinity)));
  let capGap;
  let rowGap = 0;
  let plateH;
  let minH = 0;
  if (rowsN === 1) {
    capGap = 24;
    const fitH = BOTTOM - top - capGap - rowCapH[0];
    plateH = Math.floor(Math.min(fitH, sharpH, size * SWATCH_MAX));
  } else {
    capGap = 18;
    rowGap = 44;
    const std = stdCaptionH(lang);
    const fitStd = (BOTTOM - top - rowGap - 2 * (capGap + std)) / 2;
    const fitAct = (BOTTOM - top - rowGap - 2 * capGap - rowCapH.reduce((a, b) => a + b, 0) - (rowCapH.length < 2 ? std : 0)) / 2;
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
  const head = titleGroup(L, TOP, HEAD_R - L, cont ? MAT_TITLE_CONT : MAT_TITLE, lang);
  els.push(sailLogo().el, ...head.els, ...signature('sail', { enOnly: lang === 'en' }).els);
  if (all.length > 12) warnings.push(`一页最多放 12 种材料（这一页有 ${all.length} 种），其余请分页`);
  if (!list.length) {
    const msg = stackPair(L, matTop(lang) + 120, 900, { zh: '还没有材料 —— 在「材料清单」里添加。', en: 'No materials yet — add them in the Materials list.' }, lang, ST.hint, ST.hintEn, { gap: 4 });
    els.push(...msg.els);
    return page(els, ['本案材料为空']);
  }

  const g = matGrid(e, list, pageCount, perPage, rows);
  const { mod, size, caps, capInfo, nats, rowsOf, rowCapH, capGap, rowGap } = g;
  const plateH = Math.max(1, g.plateH);
  let y = g.top;
  rowsOf.forEach((idx, r) => {
    idx.forEach((i, k) => {
      const m = list[i];
      const x = L + k * mod.step;
      const field = `material:${m.id}`;
      const what = `材料「${clean(m.name) || clean(m.code) || '未命名'}」的`;
      if (m.image) {
        const ph = placePhoto({ src: m.image, nat: nats[i], label: what.replace(/的$/, '') }, x, y, size, plateH, { field });
        els.push(ph.el);
        if (ph.scale > 1.15) warnings.push(`${what}图片像素偏低：放大 ${ph.scale.toFixed(1)} 倍会发虚，建议换高清图`);
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
// 本案团队：溪岸照片半版贴左（dirA2 p5 的版式），纸面栏 页眉 · 一句话 · 名单（售后表的样子）
// ---------------------------------------------------------------------------

const TEAM_NOTE = { zh: '从方案到交付，一个团队全程陪伴。', en: 'One team beside you, from design to delivery.' };
const TEAM_TITLE = { zh: '本案团队', en: 'Project Team' };
/** 团队页的照片（溪岸手册：骨骼线厨房 —— 手作、木作的气质） */
const TEAM_PHOTO = { ...PHOTOS.sailSkeleton, label: '团队照片' };
const TEAM_IMG_W = 880;
const TEAM_COL = TEAM_IMG_W + 100; // 980

/** 团队页最多放几位：6 位以内一栏；7–12 位排两栏（左栏多一位），两栏同一套行 */
export const TEAM_MAX = 12;

export function bTeam(ctx) {
  const { project, lang, tr } = env(ctx);
  const team = project.info?.team || [];
  const els = [];
  const warnings = [];

  const ph = placePhoto(TEAM_PHOTO, 0, 0, TEAM_IMG_W, H, { name: 'photo' });
  els.push(ph.el, sailLogo().el);
  const x = TEAM_COL;
  const w = R - x;
  const head = titleGroup(x, TOP, HEAD_R - x, TEAM_TITLE, lang, { maxLines: { en: 3, zh: 2 } });
  els.push(...head.els);
  const leadOf = () => stackPair(x, Math.ceil(head.bottom + 28), Math.min(w, 760), TEAM_NOTE, lang, 'lead', 'leadEn', { gap: 2, balance: true });
  els.push(...signature('sail', { enOnly: lang === 'en' }).els);

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
  if (!members.length) {
    els.push(...leadOf().els);
    return page(els, warnings);
  }

  // 名单：6 位以内一栏（职位在左、名字在右，dirA2 p7 售后表的样子）；7 位起两栏（职位在上、名字在下）
  const two = members.length > 6;
  const cols = two ? [members.slice(0, Math.ceil(members.length / 2)), members.slice(Math.ceil(members.length / 2))] : [members];
  const perCol = cols[0].length;
  const cw = two ? (w - 48) / 2 : w;
  const keyW = two ? cw : 260;
  const nameX = two ? 0 : 300;
  const nameW = cw - nameX;
  // 几档：一句话 + 职位中英上下 → 职位中英排一行（放得下时）→ 不放一句话 → 字小一号（人多时）→ 名字只排一行（长名字截短 + 提醒）
  const CONFIGS = [
    { lead: true, inline: false, small: false },
    { lead: true, inline: true, small: false },
    { lead: false, inline: true, small: false },
    { lead: false, inline: true, small: true },
    { lead: false, inline: true, small: true, nameMax: 1 },
  ];
  // 职位的英文和中文看起来一样大（中英并重）：中文 hosM 20 配 Outfit Medium 18
  const stylesOf = (cf) => ({
    role: style('rowKey', cf.small ? { size: 17, spacing: 3, lh: 28 } : { lh: 32 }),
    roleEn: style('rowKeyEn', cf.small ? { size: 15, spacing: 0.8, lh: 26 } : { size: 18, spacing: 1, lh: 30 }),
    name: (name) => (hasCJK(name) ? style(ST.nameZh, cf.small ? { size: 22, lh: 36 } : {}) : style(ST.nameLatin, cf.small ? { size: 24, lh: 36 } : {})),
  });

  /** 一位：职位（中英）+ 名字；pad = 行的上下空白 */
  const cell = (cx, cy, m, pad, cf) => {
    const S = stylesOf(cf);
    const out = [];
    const role = clean(m.role);
    const rolePair = { zh: role, en: role && lang !== 'zh' ? tidyTitle(tr.en(role, 'team')) : '', field: `team.${m.idx}.role`, fieldEn: `team.${m.idx}.roleEn` };
    const cur = cy + pad;
    let roleBottom = cur;
    const its = pick(lang, rolePair);
    const wid = (t, st) => measure(t, st) - (st.spacing || 0) * (4 / 3);
    if (cf.inline && its.length === 2 && wid(its[0].text, S.role) + 20 + wid(its[1].text, S.roleEn) <= keyW * 0.98) {
      const a = textLines(cx, cur, [[its[0].text]], S.role, { field: its[0].field });
      const b = textLines(cx + wid(its[0].text, S.role) + 20, cur + (S.role.lh - S.roleEn.lh) / 2, [[its[1].text]], S.roleEn, { field: its[1].field });
      out.push(a.el, b.el);
      roleBottom = cur + S.role.lh;
    } else {
      const rs = stackPair(cx, cur, keyW, rolePair, lang, S.role, S.roleEn, { gap: 0, balance: true });
      out.push(...rs.els);
      roleBottom = rs.bottom;
    }
    const name = clean(m.name);
    let nameBottom = cur;
    let nameLines = 0;
    if (name) {
      const st = S.name(name);
      const ny = two ? roleBottom + 4 : cur + (S.role.lh - st.lh) / 2;
      const b = textBlock(cx + nameX, ny, nameW, name, st, { field: `team.${m.idx}.name`, balance: true, maxLines: cf.nameMax });
      out.push(b.el);
      nameBottom = b.bottom;
      nameLines = b.lines;
      if (b.cut) return { els: out, bottom: Math.max(roleBottom, nameBottom) + pad, name, nameLines, cut: true };
    }
    return { els: out, bottom: Math.max(roleBottom, nameBottom) + pad, name, nameLines };
  };
  const plan = (cf) => {
    const lead = cf.lead ? leadOf() : null;
    const tableTop = Math.ceil((lead ? lead.bottom : head.bottom) + 56);
    const avail = BOTTOM - tableTop;
    const rowH = Math.max(...members.map((m) => cell(0, 0, m, 0, cf).bottom - (two ? 0 : Math.min(0, (stylesOf(cf).role.lh - stylesOf(cf).name(clean(m.name)).lh) / 2))));
    // 行距：内容 + 上下各至少 12；地方够就松到 108（售后表的行距），不再更松
    const minPitch = rowH + 24;
    const pitch = Math.max(minPitch, Math.min(Math.max(108, minPitch), avail / perCol));
    return { cf, lead, tableTop, avail, rowH, pitch, fits: minPitch * perCol <= avail + 0.5 };
  };
  const P = CONFIGS.map(plan).find((p) => p.fits) || plan(CONFIGS[CONFIGS.length - 1]);
  if (P.lead) els.push(...P.lead.els);
  const { cf, tableTop, avail, rowH } = P;
  // 最紧的一档也放不下（名字很长、职位折行）：每栏只排得下的前几位（不压到签名、不出页面），其余提醒
  const fitRows = P.fits ? perCol : Math.max(1, Math.floor((avail + 0.5) / (rowH + 24)));
  const pitch = P.fits ? P.pitch : rowH + 24;
  const pad = (pitch - rowH) / 2;
  const used = pitch * Math.min(perCol, fitRows);
  const y0 = tableTop + Math.max(0, Math.round((avail - used) / 2));
  const cellOf = (cx, cy, m) => cell(cx, cy, m, pad, cf);
  const dropped = [];
  let cutName = null;
  cols.forEach((list, c) => {
    const cx = x + c * (cw + 48);
    const shownList = list.slice(0, fitRows);
    dropped.push(...list.slice(fitRows));
    shownList.forEach((m, k) => {
      const cy = y0 + k * pitch;
      els.push(rule(cx, cy, cw, { alpha: ALPHA.tableRule }));
      const r = cellOf(cx, cy, m);
      els.push(...r.els);
      if (r.cut && !cutName) cutName = m;
      if (r.nameLines > 2) warnings.push(`「${r.name}」太长，名字折成了 ${r.nameLines} 行 —— 可以只写名字或英文名`);
    });
    els.push(rule(cx, y0 + shownList.length * pitch, cw, { alpha: ALPHA.tableRule }));
  });
  if (dropped.length) {
    const first = dropped.sort((a, b) => a.idx - b.idx)[0];
    warnings.push(`服务团队名单放不下：第 ${first.idx + 1} 位起有 ${dropped.length} 位没有印出来 —— 名字写短一些（只写名字或英文名）`);
  } else if (cutName) {
    warnings.push(`服务团队第 ${cutName.idx + 1} 位的名字太长：团队页上截短了（末尾「…」）—— 只写名字或英文名`);
  }
  return page(els, [...new Set(warnings)]);
}
