// C 安然 · 版式工具（kit）—— 公司页 company.js、方案页 design.js 共用。
// 基础阶段定稿后冻结：页面只用、不改（要新工具先找总控）。规格：/tmp/claude-0/c/dirA/notes.md「通用规格」+ SPEC 第 3 节。
//
// ===========================================================================
// 约定
// ===========================================================================
//   坐标 px（画布 1920×1080），字号 / 字距 pt（px = pt × 4/3），行高 px（固定行高）。
//   文字：x = 字的左边缘（左对齐）/ 右边缘（右对齐）/ 中心（居中）—— 文本框自己向外让出内边距 INSET；
//         y = 第一行行框的顶（样张 notes 里的「行顶」）。
//   折行在引擎里做完：每行都比栏窄（按栏宽 98% 折），写成换行，文本框 nowrap —— 网页预览和 PPT 行数一样。
//   （中文角色里的「·」按 0.75em 算：PowerPoint / LibreOffice 把它画成全角，浏览器画成半角。）
//   颜色不带 #（B.title / B.body …，见 theme.js）。照片上不盖色层；白字下面用 shade() 局部托字。
//   每个函数都返回 { els 或 el, …几何…, warnings: string[] }：页面把 warnings 收进自己的提醒里。
//   截短了的文字框带 el._cut = true（company.js 的 R.finish 会收走，提醒里说出是哪一栏）。
//   编辑字段：opts.field = 'overrides.title' 之类 → el.edit = { field }（编辑器靠它回到栏位）。
//
// ===========================================================================
// 接口（C 安然）
// ===========================================================================
// 常量
//   PAGE   { W, H, left:112, leftWide:120, right:1810, top:92, labelTop:100, contentBottom:900, sigTop:944 }
//   ALPHA  { rule:0.6, tableRule:0.5, photoRule:0.8, photoVline:0.55, bandVline:0.35, shadeMax:0.45 }
//   HALF   { min:820, max:1050, gapMin:88, gapMax:110 }   半版照片宽、照片边到文字栏的距离
//   SCALE  字级表 { 角色: { font, size(pt), spacing(pt), lh(px), color, caps? } }（见下面的表）
//   EN_ROLE  中文角色 → 英文角色（body → bodyEn、lead → leadEn、title → display …）
//   LOGOS  { sailWhite, sailInk, riccioneColor, riccioneWhite, riccioneInk } → { src, nat }
//   SIGNATURE / RICCIONE_SIGNATURE  签名文字；瑞吉欧页整套统一用 'text'（「瑞吉欧 / RICCIONE」）
//
// 字
//   style(role, over?)                      → 样式 { font, size, spacing, lh, color, caps, lang }（over 可改 color / size / spacing / lh / font）
//   measure(text, st)                       → 一行宽 px（含每个字后面的字距）
//   wrapText(text, st, w, { balance? })     → [[行, 行], [行]]（\n 分段；英文按词、中文按字，标点不放行首；balance = 2–3 行均衡；
//                                              英文段落末行不只剩一个词）
//   clampText(paras, st, w, maxLines)       → { paras, cut }（超出就截到 maxLines 行，末尾「…」）
//   textLines(x, y, paras, role, opts)      → { el, x0, x1, top, bottom, h, lines, lh }   已经折好的行（[[行…], …] 或 ['一行', …]）→ 文字元素
//   textBlock(x, y, w, text, role, opts)    → { el, els, x0, x1, top, bottom, h, lines, lh, cut, warnings }
//        opts: align 'l'|'r'|'ctr' · color · lh · maxLines · balance · field / edit · name · label（截短提醒里的栏位名）
//   pairBlock(x, y, w, pair, lang, role, opts) → { els, blocks, top, bottom, h, x0, x1, cut, warnings }
//        按提案语言排一对中英文：华文 = 中文；English = 英文（缺英文先显示中文）；中英 = 中文在上、英文在下（一样大）
//        pair = { zh, en, field?, fieldEn? }（company.js R.pair() 给的就是这个）
//        opts: enRole（默认 EN_ROLE[role]）· gap（中英之间，默认按角色）· enFirst（英文在上）· maxLines（每种语言）·
//              maxBottom（放不下时从行多的那种语言减行、截短 + 提醒）· align · color · lh · balance · label
//   titleGroup(x, y, w, pair, lang, opts)   → { els, top, bottom, h, x0, x1, en, zh, cut, warnings }
//        标题组：英文大写 Ogg 42pt 字距 9 在上（单行行高 70、多行 58），中文思源宋体 SemiBold 36pt 在下（单行 64、多行 66）
//          华文：英文大写（装饰性页眉）+ 中文；English：只放英文；中英：英文大写 + 中文
//        opts: color（照片上传 B.white）· size 'page' | 'chapter'（章节页：Ogg 30pt + 宋体 28pt，「BRAND / 第一章　品牌」）·
//              enHeader（华文版要不要英文页眉，默认 true）· inline（「CONTENTS 目录」排一行）· maxLines { en:3, zh:2 } · align
//        编辑字段取自 pair.field（中文）/ pair.fieldEn（英文）；en / zh = 那一块的 { el, x0, x1, top, bottom, lines } 或 null
//        华文版的英文页眉就是 pair.en：中文改过、英文没跟上时，调用方自己决定传不传 en（传 '' 就只排中文；公司页 R.pair 已经这样做）
//        中文栏里写的就是英文（Overview / Taj Room）、和英文是同一个词：只排一块英文大写（字段用中文栏），不印两遍
//   sameLatin(a, b)                         → 两段拉丁字是不是同一个词（大小写、空格、行尾逗号不算）
//   scriptSwitches(text)                    → 中文与拉丁字母 / 数字交界几处（折行时每处按 0.25em 预留：PPT 的中西文自动间距）
//
// 签名、logo
//   signature(brand, { onPhoto, enOnly, right, top, color })   → { els, x0, x1, top, bottom }
//        右下角右对齐 x=1810：中文行顶 944（HarmonyOS Medium 15pt 字距 7.5）、英文行顶 982（Outfit Medium 12pt 字距 4.5 大写）
//        brand 'sail' =「自然栖居 · 生活回归 / LIVING NATURALLY」；'riccione' =「瑞吉欧 / RICCIONE」；照片上 F5EFDD，纸面上 8C7B6A
//   signatureVertical(cx, brand, { top = 560, enTop = 944, color, line }) → { els }   封面色带里的竖排签名（一字一行 + 两行英文 + 竖细线）
//   logo(kind, x, y, w, { align })          → 图片元素（kind = LOGOS 的键；align 'r' 时 x 是右边缘）
//   cornerLogo(brand, { onPhoto, corner 'tr'|'tl', w, y })  → { el, x0, x1, top, bottom }
//        溪岸：照片上白色、纸面上深色，宽 300，右上 (1510, 78) / 左上 (112, 84)
//        瑞吉欧：照片上白色、纸面上原色，宽 280，右对齐 1810、y 96 / 左上 (112, 96)
//
// 照片
//   placePhoto(img, x, y, w, h, { field, name, maxScale }) → { el, scale, win, warnings }
//        img = { src, nat?, frame?: { ax, ay, zoom }, label? }（照片位：默认图 + 取景）；cover 裁满框，不加色层
//        放大超过 1.15 倍 →「图片像素偏低」提醒；没有图 → 米色占位 +「缺照片」提醒；win = 用到的原图范围（0–1）
//   halfPage(side 'left'|'right', { photoW = 920, gap = 100, left, right }) → { side, photo:{x,y,w,h}, col:{x,w,right} }
//        半版照片上下贴边、贴左或贴右（宽 820–1050）；文字栏从照片边再空 88–110
//   fullBleed()                             → { x:0, y:0, w:1920, h:1080 }
//
// 托字暗渐变（白字压在照片上时必须有）
//   shade(ink, area, { alpha = 0.45, fade = 200, pad = 12, dir 'auto'|'v'|'h' }) → { el, dir, alpha, box } | null
//        ink = 字的可见范围 { x0, y0, x1, y1 }（inkBox(...) 合并得到），area = 照片框 { x, y, w, h }
//        1C1915 一维线性渐变，只在照片里：贯穿照片的整宽（v）或整高（h），在离字边 ≤ 200px 处平滑归零（smoothstep），
//        字离照片边不到 200px 就一直深到照片边 —— 没有硬边。auto = 两个方向里压暗面积小的那个
//   inkBox(...parts)                        → { x0, y0, x1, y1 }（parts = textLines / textBlock / titleGroup / signature / cornerLogo 的返回）
//   contrastRatio(a, b) · luminance(hex) · mixHex(bg, fg, alpha) · shadeAlphaFor(bgHex, { ratio = 4.5 })
//        照片在字下面的颜色 → 托到 4.5:1 至少要多深（> 0.45 = 托不住，要挪字 / 换版式）
//        默认照片按真实像素量：node /tmp/claude-0/c/qa-contrast.mjs <pages.json>（藏字截图，量每段白字下面的 90 分位亮度）
//
// 线、页、检查
//   rule(x, y, w, { color = B.rule, alpha = 0.6, h = 1.5 })   横细线（章节页短线 180×1.5、售后表 0.5、年表 color B.hair alpha 1）
//   vrule(x, y, h, { color, alpha, w = 1.5 })                 竖细线（目录栏线：白 55%）
//   page(els, warnings, { bg })             → { bg, els, warnings }（默认纸面 F3EEE7；满版照片页传 bg: B.band）
//   maxGap(parts, top, bottom)              → { gap, from, to }   一栏里最大的竖向空洞（> 250 就太空了）
//   cutWarning(label)                       → 截短提醒的文字（和 company.js R.finish 同一格式）
//
// 用法示例（半版照片贴左 + 右栏标题组 + 正文 + 签名）：
//   const g = halfPage('left', { photoW: 880, gap: 110 });
//   const ph = placePhoto(R.resolve('photo'), g.photo.x, 0, g.photo.w, 1080, { field: 'image.photo' });
//   const logoL = cornerLogo('sail', { onPhoto: true, corner: 'tl' });
//   const t = titleGroup(g.col.x, PAGE.top, g.col.w, R.pair('title'), lang, { label: '标题' });
//   const body = pairBlock(g.col.x, t.bottom + 68, 760, R.pair('body'), lang, lang === 'zh' ? 'bodyL' : 'body', { maxBottom: 860 });
//   const sh = shade(inkBox(logoL), g.photo);          // 白 logo 压在照片上：顶部托一下
//   return page([ph.el, sh?.el, logoL.el, ...t.els, ...body.els, ...signature('sail').els], [...ph.warnings, ...t.warnings, ...body.warnings]);
//
// 旧接口（B 格物：GRID / TYPE / block / stack / side / photo / hair / attrList …）在文件后半：页面已全部改成 C，不再用；
// 留给 text.js（升级旧项目时给旧稿分行）、company.js 的旧导出（baseOf / clampLines）和旧测试。

import { B, PX_PER_PT } from '../../theme.js';
import { measureText } from '../spec.js';

export { B };

/** 文字框内边距（与 PPT 25400 EMU、SlideCanvas 一致） */
export const INSET = 25400 / 9525;

// ===========================================================================
// C 安然 · 常量
// ===========================================================================

const PX = PX_PER_PT;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

export const PAGE = {
  W: 1920,
  H: 1080,
  left: 112, // 内容页文字栏左边
  leftWide: 120, // 章节页、满版页的左栏
  right: 1810, // 文字栏右边界：签名、右上 logo 都右对齐到这里
  top: 92, // 页标题（英文大标题）行顶
  labelTop: 100, // 章节页栏目名（BRAND）行顶
  contentBottom: 900, // 内容排到这里为止（下面是签名）
  sigTop: 944, // 页脚签名中文行顶（英文 982）
};

export const ALPHA = {
  rule: 0.6, // 纸面短线（章节页 180×1.5、理念页细线）：7B593D × 60%
  tableRule: 0.5, // 售后表细线：7B593D × 50%
  photoRule: 0.8, // 照片上的白短线
  photoVline: 0.55, // 照片上的竖线（目录栏线）
  bandVline: 0.35, // 封面色带里的竖线（F5EFDD）
  shadeMax: 0.45, // 托字渐变最深
};

/** 半版照片：宽 820–1050；照片边到文字栏 88–110 */
export const HALF = { min: 820, max: 1050, gapMin: 88, gapMax: 110 };

/** 栏宽打几折再折行（字宽表是实测的，留 2%） */
export const FILL = 0.98;

// ---------------------------------------------------------------------------
// 字级表（照 dirA/notes.md「字级」；size / spacing 单位 pt，lh = 固定行高 px，color = 纸面上的默认色）
//   照片上的字传 color: B.white（说明 / 签名 B.cream）
// ---------------------------------------------------------------------------

const S = (font, size, spacing, lh, color, extra = {}) => ({ font, size, spacing, lh, color, ...extra });

export const SCALE = {
  // —— 标题组 ——
  display: S('ogg', 42, 9, 58, B.title, { caps: true }), // 英文大标题 56px，全大写（单行时 titleGroup 用行高 70）
  title: S('songSB', 36, 2, 64, B.title), // 中文标题 48px（多行时 titleGroup 用行高 66）
  label: S('ogg', 30, 9, 48, B.title, { caps: true }), // 章节页栏目名 BRAND / COMPANY 40px
  labelZh: S('songSB', 28, 2, 44, B.title), // 章节页「第一章　品牌」37px
  // —— 大字、金句 ——
  hero: S('songSB', 60, 10, 116, B.title), // 章节页金句（华文）80px
  heroBi: S('songSB', 48, 6, 80, B.title), // 章节页金句（中英）的中文 64px
  heroEn: S('ogg', 42, 6, 60, B.title, { caps: true }), // 章节页金句的英文（全大写，字距 6 让 898 宽的纸面栏放得下）
  name: S('songSB', 72, 18, 128, B.title), // 公司章节大标题「瑞吉欧」96px
  nameEn: S('ogg', 60, 16, 96, B.title, { caps: true }), // 公司章节大标题的英文（English 版「RICCIONE」）—— 样张没有，建议值
  quote: S('songSB', 30, 4, 60, B.title), // 金句（售后「交付之后，照顾还在继续。」）
  quoteEn: S('outfitL', 28, 0.5, 52, B.title), // 金句的英文（Outfit Light 看起来和 30pt 宋体一样大）—— 建议值
  close: S('songSB', 26, 3, 52, B.title), // 结语（华文页）
  closeBi: S('songSB', 24, 3, 44, B.title), // 结语（中英页）的中文
  closeEn: S('outfitL', 22, 0.5, 40, B.title), // 结语的英文
  // —— 正文 ——
  lead: S('hosM', 22, 3, 44, B.body), // 一句话（章节页、标题下）29px
  leadEn: S('outfit', 22, 1, 44, B.body), // 一句话的英文（一样大）
  bodyL: S('hosM', 22, 0.75, 44, B.body), // 大正文（华文的理念页这种字少的页）29px
  bodyLEn: S('outfit', 22, 0.5, 40, B.body),
  body: S('hosM', 18, 0.75, 38, B.body), // 正文 24px（最小就是它）
  bodyEn: S('outfit', 18, 0.4, 36, B.body), // 英文正文 24px（中英一样大）
  // —— 表格、列表 ——
  rowKey: S('hosM', 20, 4, 48, B.title), // 表格项名（售后「入住前」）
  rowKeyEn: S('outfitM', 18, 1.5, 48, B.title), // —— 建议值
  rowVal: S('songSB', 26, 1.5, 48, B.table), // 表格内容（「上门调试一次」「＿＿ 年」）
  rowValEn: S('outfitL', 24, 0.5, 48, B.table), // —— 建议值
  year: S('ogg', 26, 1, 36, B.title), // 年份（历程）
  event: S('hosM', 18, 0.75, 30, B.body), // 年表事件（行高 30；每行上下各空 11）
  eventEn: S('outfit', 18, 0.4, 30, B.body),
  // —— 目录（照片上：白字）——
  tocNum: S('oggM', 60, 0, 96, B.white), // 编号 01
  tocItem: S('hosM', 24, 6, 42, B.white), // 条目「品牌」
  tocItemEn: S('outfit', 24, 2, 42, B.white), // —— 建议值
  tocNote: S('hosM', 18, 1.5, 32, B.cream), // 说明
  tocNoteEn: S('outfit', 18, 0.5, 32, B.cream),
  // —— 封面（照片上：白字）——
  coverName: S('ogg', 66, 22, 112, B.white, { caps: true }), // 客户「MR LAU」一行
  coverNameZh: S('songSB', 54, 16, 96, B.white), // 中文客户名 —— 样张没有，建议值
  coverTitle: S('songM', 30, 16, 60, B.white), // 方案名「全屋定制设计方案」
  coverTitleEn: S('outfitL', 24, 6, 60, B.white, { caps: true }), // —— 建议值
  coverMeta: S('hosM', 16, 9, 32, B.cream), // 「MUAR · 二〇二六年八月」
  coverMetaEn: S('outfitM', 14, 6, 32, B.cream, { caps: true }), // —— 建议值
  // —— 签名 ——
  sigZh: S('hosM', 15, 7.5, 30, B.foot),
  sigEn: S('outfitM', 12, 4.5, 22, B.foot, { caps: true }),
};

/** 中文角色 → 英文角色（pairBlock、titleGroup 用；没列的 = 同一个角色） */
export const EN_ROLE = {
  title: 'display',
  labelZh: 'label',
  hero: 'heroEn',
  heroBi: 'heroEn',
  name: 'nameEn',
  quote: 'quoteEn',
  close: 'closeEn',
  closeBi: 'closeEn',
  lead: 'leadEn',
  bodyL: 'bodyLEn',
  body: 'bodyEn',
  rowKey: 'rowKeyEn',
  rowVal: 'rowValEn',
  event: 'eventEn',
  tocItem: 'tocItemEn',
  tocNote: 'tocNoteEn',
  coverNameZh: 'coverName',
  coverTitle: 'coverTitleEn',
  coverMeta: 'coverMetaEn',
};

/** 中英上下排时两块之间空多少（样张：正文 22、一句话 2、结语 4） */
const GAP_EN = { body: 22, bodyL: 22, lead: 2, close: 4, closeBi: 4, quote: 6, event: 0, rowKey: 0, rowVal: 0, tocItem: 0, tocNote: 0 };

// ===========================================================================
// C 安然 · 字
// ===========================================================================

const STYLE_KEYS = ['font', 'size', 'spacing', 'lh', 'color', 'caps', 'alpha'];
const isLatinFont = (font) => /^(ogg|outfit)/.test(String(font));

/**
 * 一个字级的样式：role = SCALE 的键，或已经是样式对象；over 只取 font / size / spacing / lh / color / caps / alpha / lang
 * @returns {{ font, size, spacing, lh, color, caps, lang, alpha? }}
 */
export function style(role, over = {}) {
  const base = typeof role === 'string' ? SCALE[role] : role;
  if (!base) throw new Error(`kit.style：没有这个字级「${role}」`);
  const st = { ...base };
  for (const k of STYLE_KEYS) if (over?.[k] !== undefined && over[k] !== null) st[k] = over[k];
  st.lang = over?.lang || base.lang || (isLatinFont(st.font) ? 'en' : 'zh');
  return st;
}

/** 一行宽 px（实测字宽表；含每个字后面的字距，和浏览器 / PPT 一样） */
export const measure = (text, st) => measureText(String(text ?? ''), st.font, st.size, st.spacing || 0);

const STICK_PREV = /^[，。、；：！？）」』〉》】…,.;:!?)\]}·・—–％%°’”]/u;
const STICK_NEXT = /[（「『〈《【(\[{“‘]$/u;
const WORD = /[A-Za-z0-9À-ɏ&'’\-./%@#+_]+(?:,\d{3})*[A-Za-z0-9À-ɏ&'’\-./%@#+_]*\s*|\s+|./gu;
const FUNC_WORD = /^(of|and|with|for|in|on|at|to|by|from|the|a|an|&|\+)\s/i;
const CAPS_TRAIL = /[\s,，、;；:：]+$/u;

/** 一段 → 断行单位：英文一个词、中文一个字；标点黏在前一个上，开括号黏在后一个上，空格跟着前一个 */
function tokensOf(line) {
  const out = [];
  for (const t of String(line).match(WORD) || []) {
    const prev = out[out.length - 1];
    if (prev !== undefined && (STICK_PREV.test(t) || /^\s+$/.test(t) || STICK_NEXT.test(prev))) out[out.length - 1] = prev + t;
    else out.push(t);
  }
  return out;
}

/**
 * 一行字的可见宽（不含最后一个字后面的字距）：折行、截短都按它和栏宽比。
 * 中文角色里的中点「·」PowerPoint / WPS / LibreOffice 常按全角画（浏览器按半角）：按 0.75em 算，宁宽勿窄，PPT 里也不出栏
 */
const DOTS = /[·•]/gu;
/**
 * 中文和拉丁字母 / 数字交界的次数（「吉隆坡 11,000 平方尺」= 2）：PowerPoint、LibreOffice 默认在交界处自动加一点空
 * （中西文自动间距），网页不加 —— 折行时每处按 0.25em 预留，PPT 里的行也不出栏
 */
const SCRIPT_SWITCH = /(?:[⺀-鿿豈-﫿][A-Za-z0-9]|[A-Za-z0-9][⺀-鿿豈-﫿])/gu;
export const scriptSwitches = (s) => (String(s).replace(/\s+/g, '').match(SCRIPT_SWITCH) || []).length;
const lineW = (s, st) => {
  const t = String(s).trim();
  if (!t) return 0;
  const sp = (st.spacing || 0) * PX;
  let w = measure(t, st) - sp;
  if (st.lang === 'zh') {
    const n = (t.match(DOTS) || []).length;
    if (n) w += n * Math.max(0, 0.75 * st.size * PX - (measure('·', st) - sp));
    w += scriptSwitches(t) * 0.25 * st.size * PX;
  }
  return w;
};

/** 一行字的可见宽（折行用的那个宽：含中西文交界的预留）—— 先量字宽、再在这么宽的栏里折行时用它，不会多折一行 */
export const wrapWidth = (s, st) => lineW(s, st);

function greedy(toks, st, avail) {
  const lines = [];
  let cur = '';
  for (const tok of toks) {
    const next = cur + tok;
    if (cur.trim() && lineW(next, st) > avail) {
      lines.push(cur.trim());
      cur = tok.trimStart();
    } else {
      cur = next;
    }
    // 一个词比整栏还宽（网址、超长英文词）：按字拆
    while (lineW(cur, st) > avail && [...cur.trim()].length > 1) {
      const chars = [...cur.trim()];
      let k = chars.length - 1;
      while (k > 1 && lineW(chars.slice(0, k).join(''), st) > avail) k -= 1;
      lines.push(chars.slice(0, k).join('').trim());
      cur = chars.slice(k).join('');
    }
  }
  if (cur.trim() || !lines.length) lines.push(cur.trim());
  return lines;
}

/** 在 prev 与 next 之间断行好不好：2 = 标点后；1.5 = 英文虚词前（OF NATURE）；1 = 词与词之间 / 中文「的」后、连词前；0 = 其它；−1 = 行尾留冠词 */
function cutQuality(prev, next) {
  const p = prev.replace(/\s+$/, '');
  if (/(^|\s)(the|a|an)$/i.test(p) && /\s$/.test(prev)) return -1;
  if (/[，。、；：！？,.;:!?—·]$/u.test(p)) return 2;
  if (FUNC_WORD.test(next)) return 1.5;
  if (/\s$/.test(prev) || /[的之]$/u.test(p) || /^[与和及或并]/u.test(next)) return 1;
  return 0;
}

/** 2–3 行的均衡断行：行数和贪心一样，最长的一行尽量短；好的断点（标点后、虚词前）允许多长 30%，其余 12% */
function balanced(toks, st, avail, n) {
  const T = toks.length;
  const memo = new Map();
  const wid = (a, b) => {
    const k = a * 1000 + b;
    if (!memo.has(k)) memo.set(k, lineW(toks.slice(a, b).join(''), st));
    return memo.get(k);
  };
  const q = toks.map((t, j) => (j === 0 ? 0 : cutQuality(toks[j - 1], t)));
  const cands = [];
  const consider = (cuts) => {
    const b = [0, ...cuts, T];
    let mx = 0;
    for (let k = 0; k < b.length - 1; k++) {
      const w = wid(b[k], b[k + 1]);
      if (w > avail) return;
      mx = Math.max(mx, w);
    }
    const qs = cuts.map((c) => q[c]);
    if (qs.some((x) => x < 0)) return;
    cands.push({ cuts, mx, qual: qs.reduce((a, c) => a + c, 0), soft: qs.every((x) => x > 0), first: wid(0, b[1]) });
  };
  if (n === 2) for (let a = 1; a < T; a++) consider([a]);
  else for (let a = 1; a < T - 1; a++) for (let c = a + 1; c < T; c++) consider([a, c]);
  if (!cands.length) return null;
  const opt = Math.min(...cands.map((c) => c.mx));
  const ok = cands.filter((c) => c.mx <= opt * (c.soft ? 1.3 : 1.12) + 0.01);
  ok.sort((a, b) => b.qual - a.qual || a.mx - b.mx || b.first - a.first);
  const b = [0, ...ok[0].cuts, T];
  return b.slice(0, -1).map((s, k) => toks.slice(s, b[k + 1]).join('').trim());
}

/**
 * 按栏宽折行：\n 分段，每段折成几行
 * @param {string} text
 * @param {object} st      style() 的结果（caps = 先转大写，行尾的逗号去掉）
 * @param {number} w       栏宽 px（按 98% 折）
 * @param {{ balance?: boolean }} opts  balance = 折成 2–3 行时各行长短接近（标题、金句用）
 * @returns {string[][]}   [[段 1 的行…], [段 2 的行…]]
 */
export function wrapText(text, st, w, opts = {}) {
  const avail = Math.max(10, w * FILL);
  const src = String(text ?? '').replace(/\r/g, '');
  if (!src.trim()) return [];
  return src.split('\n').map((para) => {
    const p = st.caps ? para.toUpperCase().replace(CAPS_TRAIL, '') : para;
    const toks = tokensOf(p);
    let lines = greedy(toks, st, avail);
    if (opts.balance && lines.length >= 2 && lines.length <= 3) lines = balanced(toks, st, avail, lines.length) || lines;
    lines = noWidow(lines, st, avail);
    return st.caps ? lines.map((l) => l.replace(CAPS_TRAIL, '')) : lines;
  });
}

/**
 * 英文段落的末行只剩一个词（「… makes the / brand」）：把上一行的最后一个词也带下来（上一行至少留 2 个词、末行放得下才挪）
 */
function noWidow(lines, st, avail) {
  if (lines.length < 2) return lines;
  const last = lines[lines.length - 1];
  const prev = lines[lines.length - 2];
  if (hasCJK(last) || hasCJK(prev) || /\s/.test(last.trim()) || !last.trim()) return lines;
  const words = prev.trim().split(/\s+/);
  if (words.length < 3) return lines;
  const moved = `${words[words.length - 1]} ${last.trim()}`;
  if (lineW(moved, st) > avail) return lines;
  return [...lines.slice(0, -2), words.slice(0, -1).join(' '), moved];
}

const countLines = (paras) => paras.reduce((n, p) => n + p.length, 0);
const ELLIPSIS_TRAIL = /[\s,，、;；:：·.。]+$/u;

/**
 * 截到最多 maxLines 行（跨段算），最后一行末尾加「…」（放得下为止；英文退到词边界）
 * @returns {{ paras: string[][], cut: boolean }}
 */
export function clampText(paras, st, w, maxLines) {
  if (maxLines == null || countLines(paras) <= maxLines) return { paras, cut: false };
  if (maxLines <= 0) return { paras: [], cut: true };
  const out = [];
  let left = maxLines;
  for (const p of paras) {
    if (left <= 0) break;
    out.push(p.slice(0, left));
    left -= Math.min(left, p.length);
  }
  const lastPara = out[out.length - 1];
  const orig = lastPara[lastPara.length - 1];
  const avail = Math.max(10, w * FILL);
  const chars = [...orig];
  while (chars.length && lineW(`${chars.join('').replace(ELLIPSIS_TRAIL, '')}…`, st) > avail) chars.pop();
  let t = chars.join('');
  if (chars.length < [...orig].length && (st.lang === 'en' || !hasCJK(t))) {
    const sp = t.lastIndexOf(' ');
    if (sp > 0 && sp > t.length - 24) t = t.slice(0, sp);
  }
  lastPara[lastPara.length - 1] = `${t.replace(ELLIPSIS_TRAIL, '')}…`;
  return { paras: out, cut: true };
}

/** 截短提醒（和 company.js R.finish 一个格式：编辑器的一键修复按「」里的栏位名跳过去） */
export const cutWarning = (label) => `文字太长放不下：「${label || '文字'}」已截短（末尾「…」）—— 请删减`;

const editOf = (opts) => (opts.edit ? opts.edit : opts.field ? { field: opts.field } : null);

/**
 * 已经折好的行 → 一个文字元素（固定行高、nowrap）
 * @param {number} x    字的左边缘 / 右边缘 / 中心（按 align）
 * @param {number} y    第一行行框的顶
 * @param {Array<string[]|string>} paras  每段的行
 * @param {string|object} role  SCALE 的键或样式
 * @param {{ align?, w?, lh?, color?, field?, edit?, name? }} opts  w = 栏宽（文本框至少这么宽，编辑器点得到整栏）
 * @returns {{ el, x0, x1, top, bottom, h, lines, lh }}  x0 / x1 = 字的可见左右边（不含最后一个字后面的字距）
 */
export function textLines(x, y, paras, role, opts = {}) {
  const st = style(role, opts);
  const lh = opts.lh ?? st.lh;
  const ps = paras.map((p) => (Array.isArray(p) ? p : [String(p)]));
  const flat = ps.flat();
  const n = flat.length;
  const sp = (st.spacing || 0) * PX;
  const natural = Math.max(0, ...flat.map((l) => measure(l, st)));
  const ink = natural > 0 ? natural - sp : 0;
  const boxW = Math.ceil(Math.max(opts.w ?? 0, natural) + 2 * INSET + 2);
  const align = opts.align || 'l';
  const bx = align === 'l' ? x - INSET : align === 'r' ? x + INSET + sp - boxW : x - boxW / 2 + sp / 2;
  const [x0, x1] = align === 'l' ? [x, x + ink] : align === 'r' ? [x - ink, x] : [x - ink / 2, x + ink / 2];
  const run = { font: st.font, size: st.size, color: st.color, spacing: st.spacing || 0, lang: st.lang };
  if (st.alpha != null && st.alpha < 1) run.alpha = st.alpha;
  const edit = editOf(opts);
  const el = {
    t: 'text',
    x: r1(bx),
    y: r2(y - INSET),
    w: boxW,
    h: r2(n * lh + 2 * INSET),
    nowrap: true,
    paras: ps.map((lines) => ({ align, lineHeight: lh, runs: [{ ...run, text: lines.join('\n') }] })),
    ...(edit ? { edit } : {}),
    ...(opts.name ? { name: opts.name } : {}),
  };
  return { el, x0: r1(x0), x1: r1(x1), top: y, bottom: y + n * lh, h: n * lh, lines: n, lh };
}

const EMPTY = (x, y) => ({ el: null, els: [], x0: x, x1: x, top: y, bottom: y, h: 0, lines: 0, lh: 0, cut: false, warnings: [] });

/**
 * 正文块：按栏宽折行、固定行高；maxLines 超出就截短（末尾「…」+ el._cut + 提醒）
 * @param {number} x  @param {number} y  @param {number} w 栏宽
 * @param {string} text  \n = 换段
 * @param {string|object} role  SCALE 的键（body / lead / quote …）或样式
 * @param {{ align?, color?, lh?, maxLines?, balance?, field?, edit?, name?, label? }} opts
 * @returns {{ el, els, x0, x1, top, bottom, h, lines, lh, cut, warnings }}
 */
export function textBlock(x, y, w, text, role, opts = {}) {
  const st = style(role, opts);
  let paras = wrapText(text, st, w, { balance: opts.balance });
  if (!paras.length) return EMPTY(x, y);
  let cut = false;
  if (opts.maxLines != null) ({ paras, cut } = clampText(paras, st, w, opts.maxLines));
  if (!paras.length) return { ...EMPTY(x, y), cut, warnings: cut ? [cutWarning(opts.label)] : [] };
  const r = textLines(x, y, paras, st, { ...opts, w });
  if (cut) r.el._cut = true;
  return { ...r, els: [r.el], cut, warnings: cut ? [cutWarning(opts.label)] : [] };
}

/**
 * 一对中英文按提案语言排（上下对照）：华文 = 中文；English = 英文（缺英文先显示中文）；中英 = 中文在上、英文在下，一样大
 * @param {{ zh?:string, en?:string, field?:string, fieldEn?:string }} pair
 * @param {'zh'|'en'|'bi'} lang
 * @param {string} role  中文用的角色；英文用 opts.enRole ?? EN_ROLE[role] ?? role
 * @param {{ enRole?, gap?, enFirst?, maxLines?, maxBottom?, align?, color?, balance?, label? }} opts
 * @returns {{ els, blocks, top, bottom, h, x0, x1, cut, warnings }}  blocks = [{ lang, el, top, bottom, lines, x0, x1, cut }]
 */
export function pairBlock(x, y, w, pair, lang, role, opts = {}) {
  const items = pick(lang, pair);
  if (opts.enFirst) items.reverse();
  const enRole = opts.enRole || EN_ROLE[role] || role;
  const sts = items.map((it) => style(it.lang === 'en' ? enRole : role, opts));
  const gap = opts.gap ?? GAP_EN[role] ?? 8;
  const wrapped = items.map((it, i) => wrapText(it.text, sts[i], w, { balance: opts.balance }));
  const natural = wrapped.map(countLines);
  const budget = natural.map((nn) => Math.min(nn, opts.maxLines ?? Infinity));
  const lhOf = (i) => opts.lh ?? sts[i].lh;
  const height = () => budget.reduce((h, nn, i) => h + nn * lhOf(i), 0) + gap * Math.max(0, budget.filter((nn) => nn > 0).length - 1);
  if (opts.maxBottom != null) {
    while (y + height() > opts.maxBottom + 0.5 && budget.some((nn) => nn > 1)) {
      let k = -1;
      budget.forEach((nn, i) => {
        if (nn > 1 && (k < 0 || nn * lhOf(i) > budget[k] * lhOf(k))) k = i;
      });
      budget[k] -= 1;
    }
  }
  const els = [];
  const blocks = [];
  const warnings = [];
  let cur = y;
  items.forEach((it, i) => {
    if (!wrapped[i].length) return;
    if (blocks.length) cur += gap;
    const { paras, cut } = budget[i] < natural[i] ? clampText(wrapped[i], sts[i], w, budget[i]) : { paras: wrapped[i], cut: false };
    if (!paras.length) return;
    const field = it.field;
    const r = textLines(x, cur, paras, sts[i], { ...opts, w, field, edit: field ? { field } : opts.edit });
    if (cut) {
      r.el._cut = true;
      warnings.push(cutWarning(opts.label ? `${opts.label}${it.lang === 'en' ? '（英文）' : ''}` : ''));
    }
    els.push(r.el);
    blocks.push({ lang: it.lang, el: r.el, top: r.top, bottom: r.bottom, lines: r.lines, x0: r.x0, x1: r.x1, cut });
    cur = r.bottom;
  });
  return {
    els,
    blocks,
    top: y,
    bottom: cur,
    h: cur - y,
    x0: blocks.length ? Math.min(...blocks.map((b) => b.x0)) : x,
    x1: blocks.length ? Math.max(...blocks.map((b) => b.x1)) : x,
    cut: blocks.some((b) => b.cut),
    warnings,
  };
}

/** 两段拉丁字是不是同一个词（大小写、多余空格、行尾逗号不算）：标题组 / 大标题去重用 */
export const sameLatin = (a, b) => {
  const n = (s) => String(s ?? '').toUpperCase().replace(/\s+/g, ' ').replace(CAPS_TRAIL, '').trim();
  return !!n(a) && n(a) === n(b);
};

/**
 * 标题组：英文大写 Ogg 在上、中文思源宋体在下（Aman 的页眉）
 *   华文：英文大写（装饰性页眉，opts.enHeader = false 可关）+ 中文；English：只放英文（缺英文先放中文）；中英：英文大写 + 中文
 *   page：英文 42pt 字距 9（单行行高 70、多行 58，均衡断行，行尾逗号去掉）；中文 36pt 字距 2（单行 64、多行 66）；
 *         英文单行时中文行顶 = 英文行顶 + 72，多行时 = 英文底 + 14
 *   chapter：英文 30pt 字距 9 行高 48；中文 28pt 行高 44，行顶 = 英文行顶 + 52（「BRAND / 第一章　品牌」）
 *   inline：「CONTENTS　目录」排一行（中文在英文右边 40px，各一行；放不下就照常上下排）
 * @param {{ zh?:string, en?:string, field?:string, fieldEn?:string }} pair  英文写正常大小写，这里转大写
 * @param {{ color?, size?:'page'|'chapter', enHeader?:boolean, inline?:boolean, maxLines?:{en?:number, zh?:number}, align? }} opts
 * @returns {{ els, top, bottom, h, x0, x1, en, zh, cut, warnings }}
 */
export function titleGroup(x, y, w, pair, lang, opts = {}) {
  const chapter = opts.size === 'chapter';
  const zhText = String(pair?.zh ?? '').trim();
  let enText = String(pair?.en ?? '').trim();
  let showEn = !!enText && (lang !== 'zh' || opts.enHeader !== false);
  let showZh = !!zhText && (lang !== 'en' || !enText);
  let fieldEn = pair?.fieldEn || pair?.field;
  // 中文栏里写的就是英文（Overview / Taj Room / Ground Floor）：英文页眉和「中文」是同一个词 —— 只排一块英文大写（编辑字段用中文栏），
  // 不印成「OVERVIEW / Overview」
  if (showEn && showZh && !hasCJK(zhText) && sameLatin(zhText, enText)) {
    showZh = false;
    enText = zhText;
    fieldEn = pair?.field || fieldEn;
  }
  const color = opts.color ? { color: opts.color } : {};
  const enSt = style(chapter ? 'label' : 'display', color);
  const zhSt = style(chapter ? 'labelZh' : 'title', color);
  const maxEn = opts.maxLines?.en ?? (chapter ? 1 : 3);
  const maxZh = opts.maxLines?.zh ?? 2;
  const align = opts.align || 'l';
  const warnings = [];
  let en = null;
  let zh = null;
  let cur = y;
  let cut = false;
  if (showEn) {
    let paras = wrapText(enText, enSt, w, { balance: true });
    const c = clampText(paras, enSt, w, maxEn);
    paras = c.paras;
    const n = countLines(paras);
    const lh = chapter ? 48 : n > 1 ? 58 : 70;
    if (opts.inline && showZh && n === 1) {
      const lhI = 72;
      en = textLines(x, y, paras, enSt, { align: 'l', lh: lhI, field: fieldEn });
      const zx = en.x1 + 40;
      const zp = wrapText(zhText, zhSt, x + w - zx);
      if (countLines(zp) === 1) {
        zh = textLines(zx, y + 2, zp, zhSt, { align: 'l', lh: lhI, field: pair?.field });
        if (c.cut) en.el._cut = true;
        return {
          els: [en.el, zh.el],
          top: y,
          bottom: y + 2 + lhI,
          h: lhI + 2,
          x0: en.x0,
          x1: zh.x1,
          en,
          zh,
          cut: c.cut,
          warnings: c.cut ? [cutWarning(opts.label ? `${opts.label}（英文）` : '')] : [],
        };
      }
    }
    en = textLines(x, cur, paras, enSt, { align, lh, w, field: fieldEn });
    if (c.cut) {
      en.el._cut = true;
      cut = true;
      warnings.push(cutWarning(opts.label ? `${opts.label}（英文）` : ''));
    }
    cur = en.bottom + (chapter ? 4 : n > 1 ? 14 : 2);
  }
  if (showZh) {
    let paras = wrapText(zhText, zhSt, w, { balance: true });
    const c = clampText(paras, zhSt, w, maxZh);
    paras = c.paras;
    const n = countLines(paras);
    const lh = chapter ? 44 : n > 1 ? 66 : 64;
    zh = textLines(x, cur, paras, zhSt, { align, lh, w, field: pair?.field });
    if (c.cut) {
      zh.el._cut = true;
      cut = true;
      warnings.push(cutWarning(opts.label || ''));
    }
    cur = zh.bottom;
  }
  const parts = [en, zh].filter(Boolean);
  const bottom = parts.length ? parts[parts.length - 1].bottom : y;
  return {
    els: parts.map((p) => p.el),
    top: y,
    bottom,
    h: bottom - y,
    x0: parts.length ? Math.min(...parts.map((p) => p.x0)) : x,
    x1: parts.length ? Math.max(...parts.map((p) => p.x1)) : x,
    en,
    zh,
    cut,
    warnings,
  };
}

// ===========================================================================
// C 安然 · 签名、logo
// ===========================================================================

export const SIGNATURE = {
  sail: { zh: '自然栖居 · 生活回归', en: 'LIVING NATURALLY' },
  riccione: { zh: '瑞吉欧', en: 'RICCIONE' },
};

/**
 * 瑞吉欧页的签名：'text' =「瑞吉欧 / RICCIONE」文字（和溪岸签名同一个样式）；'logo' = 小号 RICCIONE 商标图。
 * 整套统一用 'text'：瑞吉欧的页角上已经有 RICCIONE 商标，签名再放一个商标就重复了。页面不要自己选，改这里。
 */
export const RICCIONE_SIGNATURE = 'text';

/**
 * 页脚签名（右下角，右对齐 x = 1810；中文行顶 944、英文行顶 982）。签名是品牌的固定元素：华文 / 中英版是中英两行，
 * English 版传 enOnly 只留英文一行（整套统一：公司页、方案页、封面竖排签名都这样做）
 * @param {'sail'|'riccione'} brand
 * @param {{ onPhoto?:boolean, enOnly?:boolean, right?:number, top?:number, color?:string }} opts
 *   onPhoto = 压在照片上（F5EFDD，下面要用 shade() 托）；纸面上 8C7B6A；enOnly = 只要英文一行
 * @returns {{ els, x0, x1, top, bottom }}
 */
export function signature(brand = 'sail', opts = {}) {
  const color = opts.color || (opts.onPhoto ? B.cream : B.foot);
  const right = opts.right ?? PAGE.right;
  const top = opts.top ?? PAGE.sigTop;
  if (brand === 'riccione' && RICCIONE_SIGNATURE === 'logo') {
    const el = logo(opts.onPhoto ? 'riccioneWhite' : 'riccioneColor', right, top + 14, 150, { align: 'r', name: 'signature' });
    return { els: [el], x0: el.x, x1: right, top: el.y, bottom: el.y + el.h };
  }
  const t = SIGNATURE[brand] || SIGNATURE.sail;
  const en = textLines(right, top + 38, [[t.en]], 'sigEn', { align: 'r', color, name: 'signature' });
  if (opts.enOnly) return { els: [en.el], x0: en.x0, x1: right, top: en.top, bottom: en.bottom };
  const zh = textLines(right, top, [[t.zh]], 'sigZh', { align: 'r', color, name: 'signature' });
  return { els: [zh.el, en.el], x0: Math.min(zh.x0, en.x0), x1: right, top, bottom: en.bottom };
}

/**
 * 竖排签名（封面右侧色带里，Aman 第 8、10 页的做法）：中文一字一行（行高 34），英文按词两行横排压在最下面（行顶 944），
 * 上面一条竖细线（F5EFDD 35%，y 92–472）
 * @param {number} cx  色带中心 x
 * @returns {{ els }}
 */
export function signatureVertical(cx, brand = 'sail', opts = {}) {
  const t = SIGNATURE[brand] || SIGNATURE.sail;
  const color = opts.color || B.cream;
  const chars = [...t.zh].filter((ch) => ch.trim());
  const zh = textLines(cx, opts.top ?? 560, [chars], 'sigZh', { align: 'ctr', color, spacing: 0, lh: 34, name: 'signature' });
  const en = textLines(cx, opts.enTop ?? PAGE.sigTop, [t.en.split(' ')], 'sigEn', { align: 'ctr', color, lh: 22, name: 'signature' });
  const els = [zh.el, en.el];
  if (opts.line !== false) els.push(vrule(cx - 0.75, 92, 380, { color, alpha: ALPHA.bandVline }));
  return { els };
}

/** logo 图（public/template/b/）：溪岸 1417×539；RICCIONE 商标 2000×359（从矢量原件导出） */
export const LOGOS = {
  sailWhite: { src: '/template/b/logo-white.png', nat: { w: 1417, h: 539 } }, // 照片上
  sailInk: { src: '/template/b/logo-ink.png', nat: { w: 1417, h: 539 } }, // 纸面上
  riccioneColor: { src: '/template/b/riccione-logo-color.png', nat: { w: 2000, h: 359 } }, // 纸面上：橙 + 黑 + ®
  riccioneWhite: { src: '/template/b/riccione-logo-white.png', nat: { w: 2000, h: 359 } }, // 照片上
  riccioneInk: { src: '/template/b/riccione-logo-ink.png', nat: { w: 2000, h: 359 } }, // 深色 33302B（需要单色时）
};

/**
 * logo 图片元素（按原图比例算高）
 * @param {keyof LOGOS} kind
 * @param {{ align?:'l'|'r'|'ctr', name?:string }} opts  align 'r' = x 是右边缘
 */
export function logo(kind, x, y, w, opts = {}) {
  const L = LOGOS[kind];
  if (!L) throw new Error(`kit.logo：没有这个 logo「${kind}」`);
  const h = r1((w * L.nat.h) / L.nat.w);
  const lx = opts.align === 'r' ? x - w : opts.align === 'ctr' ? x - w / 2 : x;
  return { t: 'img', x: r1(lx), y, w, h, src: L.src, nat: L.nat, fit: 'contain', ax: 0.5, ay: 0.5, name: opts.name || 'logo' };
}

/**
 * 角上的 logo（标准位置）。品牌分开：「公司 · 瑞吉欧」章节只用 'riccione'，其余页只用 'sail'
 * @param {'sail'|'riccione'} brand
 * @param {{ onPhoto?:boolean, corner?:'tr'|'tl', w?:number, y?:number, x?:number, kind?:string }} opts
 * @returns {{ el, x0, x1, top, bottom }}
 */
export function cornerLogo(brand = 'sail', opts = {}) {
  const corner = opts.corner || 'tr';
  const ric = brand === 'riccione';
  const w = opts.w ?? (ric ? 280 : 300);
  const kind = opts.kind || (ric ? (opts.onPhoto ? 'riccioneWhite' : 'riccioneColor') : opts.onPhoto ? 'sailWhite' : 'sailInk');
  const y = opts.y ?? (ric ? 96 : corner === 'tl' ? 84 : 78);
  const x = opts.x ?? (corner === 'tl' ? PAGE.left : PAGE.right - w);
  const el = logo(kind, x, y, w);
  return { el, x0: el.x, x1: el.x + el.w, top: el.y, bottom: el.y + el.h };
}

// ===========================================================================
// C 安然 · 照片、栅格
// ===========================================================================

/**
 * 照片位 → 图片元素：cover 裁满框，取景 frame = { ax, ay（重心 0–1）, zoom（在刚好铺满之上再放大）}；不加色层
 *   放大超过 maxScale（1.15）倍 →「图片像素偏低」提醒；没有图 → 米色占位 +「缺照片」提醒（编辑器点占位换图）
 * @param {{ src?:string|null, nat?:{w,h}|null, frame?:{ax?,ay?,zoom?}, label?:string }} img  company.js R.resolve() 的结果
 * @param {{ field?:string, edit?:object, name?:string, maxScale?:number }} opts
 * @returns {{ el, scale, win:{l,t,r,b}|null, warnings }}  scale = 原图像素放大到页面的倍数（不知道原图尺寸 = 1）
 */
export function placePhoto(img, x, y, w, h, opts = {}) {
  const edit = editOf(opts);
  const extra = { ...(edit ? { edit } : {}), ...(opts.name ? { name: opts.name } : {}) };
  const label = img?.label || '照片';
  const src = img?.src || null;
  if (!src) {
    return { el: { t: 'rect', x, y, w, h, fill: B.sample, ...extra }, scale: 1, win: null, warnings: [`缺照片：${label} —— 点这个位置换一张照片`] };
  }
  const nat = img.nat;
  const frame = img.frame || {};
  if (!nat?.w || !nat?.h) return { el: { t: 'img', x, y, w, h, src, fit: 'cover', ax: frame.ax ?? 0.5, ay: frame.ay ?? 0.5, ...extra }, scale: 1, win: null, warnings: [] };
  const s = Math.max(w / nat.w, h / nat.h) * Math.max(1, frame.zoom || 1);
  const warnings = s > (opts.maxScale ?? 1.15) + 1e-6 ? [`图片像素偏低：${label}放大 ${s.toFixed(1)} 倍会发虚，建议换高清图`] : [];
  const dw = nat.w * s;
  const dh = nat.h * s;
  const ax = frame.ax ?? 0.5;
  const ay = frame.ay ?? 0.5;
  const ox = (dw - w) * ax;
  const oy = (dh - h) * ay;
  const r5 = (v) => Math.max(0, Math.round(v * 1e5) / 1e5);
  const crop = { l: r5(ox / dw), t: r5(oy / dh), r: r5((dw - w - ox) / dw), b: r5((dh - h - oy) / dh) };
  return {
    el: { t: 'img', x, y, w, h, src, nat, fit: 'cover', ax, ay, crop, ...extra },
    scale: Math.round(s * 1000) / 1000,
    win: { l: crop.l, t: crop.t, r: 1 - crop.r, b: 1 - crop.b },
    warnings,
  };
}

/**
 * 半版照片 + 文字栏：照片上下贴边、贴左或贴右（宽 820–1050）；文字栏从照片边再空 gap（88–110）到页边距
 * @param {'left'|'right'} side  照片在哪边
 * @param {{ photoW?:number, gap?:number, left?:number, right?:number }} opts
 * @returns {{ side, photo:{x,y,w,h}, col:{x,w,right} }}
 */
export function halfPage(side = 'left', opts = {}) {
  const pw = opts.photoW ?? 920;
  const gap = opts.gap ?? 100;
  if (side === 'right') {
    const px = PAGE.W - pw;
    const left = opts.left ?? PAGE.left;
    return { side, photo: { x: px, y: 0, w: pw, h: PAGE.H }, col: { x: left, w: px - gap - left, right: px - gap } };
  }
  const cx = pw + gap;
  const right = opts.right ?? PAGE.right;
  return { side, photo: { x: 0, y: 0, w: pw, h: PAGE.H }, col: { x: cx, w: right - cx, right } };
}

/** 满版照片框 */
export const fullBleed = () => ({ x: 0, y: 0, w: PAGE.W, h: PAGE.H });

// ===========================================================================
// C 安然 · 托字暗渐变
// ===========================================================================

/**
 * 几块东西（文字 / logo / 签名）可见范围的并集
 * @param {...({x0,x1,top,bottom}|{x,y,w,h}|null)} parts
 * @returns {{ x0, y0, x1, y1 }|null}
 */
export function inkBox(...parts) {
  const bs = parts.flat().filter(Boolean).map((p) => (p.x0 != null ? { x0: p.x0, x1: p.x1, y0: p.top ?? p.y0, y1: p.bottom ?? p.y1 } : { x0: p.x, x1: p.x + p.w, y0: p.y, y1: p.y + p.h }));
  if (!bs.length) return null;
  return { x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)), x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) };
}

/** 0 → A 的平滑过渡（smoothstep：两头都没有折角，看不出渐变的边） */
function ramp(p0, p1, a0, a1) {
  return [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => ({ pos: p0 + (p1 - p0) * t, a: a0 + (a1 - a0) * (3 * t * t - 2 * t * t * t) }));
}

/** 一维：照片 [e0, e1]、字 [lo, hi] → 渐变的起止和各点（绝对坐标） */
function span1(lo, hi, e0, e1, A, fade, pad) {
  const c0 = Math.max(e0, lo - pad);
  const c1 = Math.min(e1, hi + pad);
  const toStart = lo - e0 <= fade; // 字离照片边不到 fade：一直深到照片边
  const toEnd = e1 - hi <= fade;
  const s = toStart ? e0 : lo - fade;
  const e = toEnd ? e1 : hi + fade;
  const pts = [];
  if (toStart) pts.push({ pos: s, a: A });
  else pts.push(...ramp(s, c0, 0, A));
  if (toEnd) pts.push({ pos: e, a: A });
  else pts.push(...ramp(c1, e, A, 0));
  return { s, e, pts };
}

/**
 * 托字暗渐变：白字压在照片上时，字下面放一条 1C1915 的局部渐变（最深 45%，离字边 ≤ 200px 平滑归零，不留硬边）
 *   v = 竖向（上→下）一条，左右贯穿照片整宽；h = 横向（左→右）一条，上下贯穿照片整高；auto = 压暗面积小的那个
 *   字离照片边不到 fade：那一头一直深到照片边（照片边本来就是边）
 * 对比度：默认照片按真实像素量（alpha 用 shadeAlphaFor 算，至少 4.5:1）；设计师换的照片看不到像素，用最深的 0.45
 * @param {{x0,y0,x1,y1}} ink   字的可见范围（inkBox(...)）
 * @param {{x,y,w,h}} area      照片框（渐变只在照片里）
 * @param {{ alpha?:number, fade?:number, pad?:number, dir?:'auto'|'v'|'h', color?:string }} opts
 * @returns {{ el, dir:'v'|'h', alpha:number, box:{x,y,w,h} }|null}  字和照片不相交 → null
 */
export function shade(ink, area, opts = {}) {
  if (!ink || !area) return null;
  const A = Math.max(0, Math.min(opts.alpha ?? ALPHA.shadeMax, ALPHA.shadeMax));
  const fade = Math.min(opts.fade ?? 200, 200);
  const pad = Math.min(opts.pad ?? 12, fade);
  const ax1 = area.x + area.w;
  const ay1 = area.y + area.h;
  if (ink.x1 <= area.x || ink.x0 >= ax1 || ink.y1 <= area.y || ink.y0 >= ay1 || A <= 0) return null;
  const v = span1(ink.y0, ink.y1, area.y, ay1, A, fade, pad);
  const h = span1(ink.x0, ink.x1, area.x, ax1, A, fade, pad);
  const dir = opts.dir === 'v' || opts.dir === 'h' ? opts.dir : area.w * (v.e - v.s) <= area.h * (h.e - h.s) ? 'v' : 'h';
  const g = dir === 'v' ? v : h;
  const len = g.e - g.s;
  const stops = g.pts.map((p) => ({ pos: r1(((p.pos - g.s) / len) * 100), color: opts.color || B.shade, alpha: Math.round(p.a * 1000) / 1000 }));
  const box = dir === 'v' ? { x: area.x, y: r1(g.s), w: area.w, h: r1(len) } : { x: r1(g.s), y: area.y, w: r1(len), h: area.h };
  return { el: { t: 'rect', ...box, grad: { angle: dir === 'v' ? 90 : 0, stops }, name: 'shade' }, dir, alpha: A, box };
}

const rgbOf = (hex) => {
  const h = String(hex || '000000').replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const toHex = (rgb) => rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('').toUpperCase();
const lin = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
/** WCAG 相对亮度（0–1） */
export const luminance = (hex) => {
  const [r, g, b] = rgbOf(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
/** 两个颜色的对比度（1–21） */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** bg 上盖一层 alpha 的 fg（sRGB 里混合，和浏览器 / PPT 一样） */
export const mixHex = (bg, fg, alpha) => {
  const a = rgbOf(bg);
  const b = rgbOf(fg);
  return toHex(a.map((c, i) => c * (1 - alpha) + b[i] * alpha));
};
/**
 * 照片在字下面的颜色（取最亮的那一片，例如 90 分位）→ 托到对比度 ratio 至少要多深的 1C1915
 * @returns {number} 0–1（> ALPHA.shadeMax = 45% 也托不住：挪字、换取景或换版式）
 */
export function shadeAlphaFor(bgHex, opts = {}) {
  const ratio = opts.ratio ?? 4.5;
  const text = opts.text || B.white;
  const color = opts.color || B.shade;
  if (contrastRatio(text, bgHex) >= ratio) return 0;
  if (contrastRatio(text, mixHex(bgHex, color, 1)) < ratio) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(text, mixHex(bgHex, color, mid)) >= ratio) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi * 100) / 100;
}

// ===========================================================================
// C 安然 · 线、检查
// ===========================================================================

/** 横细线：默认 7B593D × 60%、1.5px（章节页短线 180 宽；售后表传 alpha 0.5；年表传 color B.hair, alpha 1） */
export const rule = (x, y, w, opts = {}) => ({ t: 'rect', x, y, w, h: opts.h ?? 1.5, fill: opts.color || B.rule, alpha: opts.alpha ?? ALPHA.rule, ...(opts.name ? { name: opts.name } : {}) });

/** 竖细线：默认 7B593D × 60%、1.5px（目录栏线传 color B.white, alpha ALPHA.photoVline） */
export const vrule = (x, y, h, opts = {}) => ({ t: 'rect', x, y, w: opts.w ?? 1.5, h, fill: opts.color || B.rule, alpha: opts.alpha ?? ALPHA.rule, ...(opts.name ? { name: opts.name } : {}) });

/**
 * 一栏里最大的竖向空洞（「页面撑满」：> 250px 就太空了）
 * @param {Array<{top:number, bottom:number}|{y:number,h:number}>} parts  栏里的各块（textBlock / titleGroup / 元素）
 * @param {number} top  栏顶  @param {number} bottom  栏底（一般是签名的顶 944）
 * @returns {{ gap:number, from:number, to:number }}
 */
export function maxGap(parts, top, bottom) {
  const rs = parts
    .filter(Boolean)
    .map((p) => (p.top != null ? [p.top, p.bottom] : [p.y, p.y + p.h]))
    .filter(([a, b]) => b > top && a < bottom)
    .sort((a, b) => a[0] - b[0]);
  let best = { gap: 0, from: top, to: top };
  let cur = top;
  for (const [a, b] of [...rs, [bottom, bottom]]) {
    if (a - cur > best.gap) best = { gap: a - cur, from: cur, to: a };
    cur = Math.max(cur, b);
  }
  return best;
}

// ===========================================================================
// 旧接口（B 格物）—— 页面已全部改成 C（用上面的 C 工具）；这里留给 text.js、company.js 的旧导出和旧测试
// ===========================================================================
//   网格 12 栏：栏宽 118、栏距 24、左右边距 120（第 n 栏起点 x = 120 + 142·(n−1)）；上边 96，文字底线 984
//   四种字级：display · head · body · cap（B 的字体角色 light / regular / title，theme.js 里仍是思源黑体 + Hanken Grotesk /
//   Ysabeau Office；C 的页面不用）
//   颜色已经跟着 B 换成 C 的值（paper F3EEE7、ink 333333、grey 8C7B6A、hair C9B9A6）

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

/** 一页：默认纸面底色（B.paper）；extra.bg 换底色（满版照片页用 B.band），extra 里的其它键原样带上 */
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
