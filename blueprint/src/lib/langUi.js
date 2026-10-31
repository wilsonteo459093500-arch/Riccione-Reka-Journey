// 编辑器「提案语言」界面用的纯函数（不碰 React / DOM，Node 可测：test/ui-lang.test.mjs）
//   · 三种语言的选项与一句话说明（中英并重：中英版里中文、英文一样大）
//   · 「AI 翻译」对话框的行：类别标签、排序、AI 结果填进空行、套用哪些
//   · 检查器：空间英文名、页面标题预览、本来就是英文的字（没有 EN 框）
//   · 导出体检：缺英文汇总成一条（不逐页重复），其余提醒逐页列出；English 版的文件名 / 标题用英文的客户与地点

import { LANGS, langOf, hasCJKText, missingInPages, isMissWarning, tmKey, resolveEn, roomEnOf, straightQuotes } from '../engine/lang.js';
import { clientLine } from '../engine/model.js';

// ---------------------------------------------------------------------------
// 语言
// ---------------------------------------------------------------------------

/** 每种语言一句话说明 */
export const LANG_HINTS = {
  zh: '中文提案，与定稿一致',
  en: '全英文提案；缺英文的地方先显示中文',
  bi: '中英并重：中英同样大小，并排或上下对照',
};

/** 语言名（夹在中文句子里时英文前后留空格）：'华文' / ' English ' / '中英' */
export const langNameInline = (lang) => {
  const name = LANGS.find((l) => l.id === normLang(lang))?.label || '华文';
  return /^[A-Za-z]/.test(name) ? ` ${name} ` : name;
};

/** 分段选择的选项：华文 / English / 中英（悬停显示说明） */
export const LANG_OPTIONS = LANGS.map((l) => ({ value: l.id, label: l.label, title: `${l.label}：${LANG_HINTS[l.id]}` }));

/** 「English 版」「中英版」—— 提示文字里用 */
export const LANG_VERSION = { zh: '华文版', en: 'English 版', bi: '中英版' };

export const normLang = (lang) => (lang === 'en' || lang === 'bi' ? lang : 'zh');

/** 这种语言要不要英文栏（华文版不用） */
export const needsEnglish = (lang) => normLang(lang) !== 'zh';

// ---------------------------------------------------------------------------
// AI 翻译对话框
// ---------------------------------------------------------------------------

/** 缺英文的中文属于哪类（对话框里的小标签） */
export const KIND_LABELS = {
  room: '空间',
  view: '视角',
  role: '部位',
  material: '材料',
  label: '标签',
  note: '备注',
  team: '职位',
  text: '文字',
};

/** 对话框里的排列顺序：先短词（空间、视角、部位、材料），再标签、整句备注，最后团队和其它文字 */
const KIND_ORDER = Object.keys(KIND_LABELS);

export const kindLabel = (kind) => KIND_LABELS[kind] || KIND_LABELS.text;

/**
 * 缺英文的条目 → 对话框的行：去重（按规范后的中文），同类排在一起（同类内按出现顺序），英文先空着
 * @param {Array<{ zh:string, kind?:string }>} items  missingInPages 的结果
 * @returns {Array<{ zh:string, kind:string, en:string, source:''|'ai'|'user' }>}
 */
export function translateRows(items) {
  const seen = new Set();
  const rows = [];
  (items || []).forEach((it) => {
    const zh = tmKey(it?.zh);
    if (!zh || seen.has(zh)) return;
    seen.add(zh);
    rows.push({ zh, kind: KIND_LABELS[it.kind] ? it.kind : 'text', en: '', source: '', at: rows.length });
  });
  return rows
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.at - b.at)
    .map(({ at, ...row }) => row);
}

/** 一行英文的状态：empty 空着 / ok 可以套用 / cjk 里面还有中文（不能当英文用） */
export function rowStatus(en) {
  const s = String(en ?? '').trim();
  if (!s) return 'empty';
  if (hasCJKText(s)) return 'cjk';
  return 'ok';
}

/** 交给 AI 的：还空着的行 → [{ zh, kind }] */
export const pendingItems = (rows) => (rows || []).filter((r) => rowStatus(r.en) === 'empty').map(({ zh, kind }) => ({ zh, kind }));

/**
 * AI 的结果填进还空着的行（设计师已经写了的不覆盖）
 * @returns {{ rows:Array, filled:number }}
 */
export function fillRows(rows, pairs) {
  const byZh = new Map();
  for (const p of pairs || []) {
    const en = String(p?.en ?? '').trim();
    if (p?.zh && en) byZh.set(tmKey(p.zh), en);
  }
  let filled = 0;
  const next = (rows || []).map((r) => {
    const en = byZh.get(r.zh);
    if (!en || rowStatus(r.en) !== 'empty') return r;
    filled += 1;
    return { ...r, en, source: 'ai' };
  });
  return { rows: filled ? next : rows, filled };
}

/** 设计师改了一行（不再算 AI 的） */
export const editRow = (rows, zh, en) => (rows || []).map((r) => (r.zh === zh ? { ...r, en, source: 'user' } : r));

/**
 * 套用前把英文整理干净：短词（空间、材料、职位…）里的换行 / 连续空格并成一个空格（不然页面上会断行）；
 * 备注保留设计师有意的换行，只收拾多余的空格和空行
 */
export function tidyEn(en, kind) {
  const s = String(en ?? '');
  if (kind !== 'note') return s.replace(/\s+/g, ' ').trim();
  return s
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 「套用 N 条」：只要非空、不含中文的行 → [{ zh, en }] */
export const applicablePairs = (rows) =>
  (rows || []).filter((r) => rowStatus(r.en) === 'ok').map((r) => ({ zh: r.zh, en: tidyEn(r.en, r.kind) }));

/** 还没填好的行（空着 / 英文里夹着中文）→ 中文列表；对话框「只看没填好的」用 */
export const unfinishedKeys = (rows) => (rows || []).filter((r) => rowStatus(r.en) !== 'ok').map((r) => r.zh);

/** 分批（AI 翻译一批一批地跑，每批回来就填进去，停止时不用等） */
export function sliceItems(items, size) {
  const n = Math.max(1, Math.floor(size) || 1);
  const out = [];
  for (let i = 0; i < (items || []).length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/** 整句（备注、长的中文）用会长高的多行输入框；短词用单行框（回车跳到下一条） */
export const isLongRow = (row) => row?.kind === 'note' || String(row?.zh || '').length > 16;

/**
 * 对话框里按回车：'next' 跳到下一条；'newline' 换行（只有备注可以 Shift+回车 换行）；
 * 'none' 什么都不做（短词里的 Shift+回车：不换行，也不跳走）
 */
export const enterAction = (kind, shiftKey) => (!shiftKey ? 'next' : kind === 'note' ? 'newline' : 'none');

/** API key 没配 / 无效：后面的批次也会一样失败 */
export const isKeyError = (msg) => /API key|key 无效|401|403/i.test(String(msg || ''));

/** 给 AI 的项目背景：'Muar · Mr Lau · 全屋定制设计方案' */
export function translateContext(project) {
  const info = project?.info || {};
  return [clientLine(info) || String(project?.name || '').trim(), String(info.proposalTitle || '').trim() || '全屋定制设计方案']
    .filter(Boolean)
    .join(' · ');
}

/**
 * 翻译结束后的提示
 * @param {{ filled:number, left:number, stopped?:boolean }} r  filled = 这次填好的条数；left = 还空着的条数
 */
export function translateResultText({ filled = 0, left = 0, stopped = false } = {}) {
  if (!filled) {
    if (stopped) return '已停止，还没有翻好的条目';
    return left ? `这 ${left} 条没拿到可用的英文，可以再点一次「AI 翻译」，或直接手填` : '没有需要翻译的条目';
  }
  const head = `${stopped ? '已停止' : '翻译完成'}：填好了 ${filled} 条，看一遍、改一改，再套用`;
  if (!left) return head;
  return `${head}；还有 ${left} 条空着${stopped ? '' : '（没翻出来）'}，可以再点「AI 翻译」或手填`;
}

// ---------------------------------------------------------------------------
// 检查器：EN 框（翻译记忆）打字时的值
// ---------------------------------------------------------------------------

/**
 * EN 框里显示什么：翻译记忆存的是去掉首尾空格的英文，直接拿它当输入框的值，刚打的空格会被吃掉（「Light Oak」变成「LightOak」）。
 * 所以打字时用打的原文 draft —— 但只在它和记忆里存的一致时用（撤销 / 别处改了英文 / 换了一句中文 → 用记忆里的）。
 * @param {{ key:string, text:string }|null} draft  正在打的原文（离开输入框后清掉）
 * @param {string} key     这个框对应的中文
 * @param {string} stored  翻译记忆里现在的英文（memoryEn）
 */
export function enDraftValue(draft, key, stored) {
  if (!draft || draft.key !== key) return stored;
  return straightQuotes(String(draft.text ?? '').trim()) === stored ? draft.text : stored;
}

// ---------------------------------------------------------------------------
// 检查器：效果图页的空间英文名（roomEn，单页）
// ---------------------------------------------------------------------------

/**
 * 空间名的英文从哪来（检查器的徽标与占位字）：
 *   source = 'field'（这一页填了 roomEn）| 'memory' | 'glossary' | 'latin' | 'missing' | 'empty'
 *   auto   = 不填时自动用的英文（占位字）
 */
export function roomEnState(project, slide) {
  const own = String(slide?.roomEn || '').trim();
  const auto = resolveEn(project, slide?.room, 'room');
  return { source: own ? 'field' : auto.source, auto: auto.text };
}

/**
 * 检查器里「页面标题」那一行（和页面上一致）：
 *   华文 { zh:'餐厅 · 面向花园', en:'' }
 *   English { en:'Dining · Open to the Garden' }（缺英文的那一半先用中文，和页面一样）
 *   中英 { zh, en:'Dining · Open to the Garden' }（只有已有的英文）
 */
export function viewTitlePreview(project, slide) {
  const lang = langOf(project);
  const room = String(slide?.room || '').trim();
  const subtitle = String(slide?.subtitle || '').trim();
  const zh = [room, subtitle].filter(Boolean).join(' · ') || '未命名';
  if (lang === 'zh') return { lang, zh, en: '' };
  const roomEn = room || String(slide?.roomEn || '').trim() ? roomEnOf(project, slide).text : '';
  const subEn = subtitle ? resolveEn(project, subtitle, 'view').text : '';
  if (lang === 'en') return { lang, zh, en: [roomEn || room, subEn || subtitle].filter(Boolean).join(' · ') || 'Untitled' };
  return { lang, zh, en: [roomEn, subEn].filter(Boolean).join(' · ') };
}

/**
 * 这段字本来就是英文（「Taj Mahal」「Overview」），所以没有 EN 框 —— 画布上点它的英文要落到中文框上
 * （和 EnInput 不显示的条件一致）
 */
export function isLatinSource(project, zh, kind = 'text') {
  return resolveEn(project, zh, kind).source === 'latin';
}

// ---------------------------------------------------------------------------
// 页面顶栏
// ---------------------------------------------------------------------------

/**
 * 画布区比这窄时顶栏按钮收成图标 / 短字（页名才有地方显示）：
 *   华文 / 没缺英文 —— 780；English / 中英版又缺英文（多一个「AI 翻译 · N」）—— 再宽一些
 */
export function toolbarCompactWidth(lang, missingCount = 0) {
  if (normLang(lang) === 'zh' || !(missingCount > 0)) return 780;
  return 920 + (String(missingCount).length - 1) * 8;
}

// ---------------------------------------------------------------------------
// 导出体检
// ---------------------------------------------------------------------------

/**
 * 导出前体检（按选定语言渲染出来、会导出的页）：
 *   issues  —— 逐页的提醒（缺英文那条不在这里逐页重复）
 *   missing —— 缺英文汇总 { count, pages, firstSlideId, items } | null
 * @param {Array<object>} slides  exportableSlides(renderDeck(...))
 * @param {{ missingImages?:(slide:object)=>number }} opts  这一页有几张图在本机找不到
 */
export function exportHealth(slides, { missingImages = () => 0 } = {}) {
  const issues = [];
  (slides || []).forEach((s, i) => {
    const msgs = (s.warnings || []).filter((w) => !isMissWarning(w));
    const n = missingImages(s) || 0;
    if (n) msgs.push(n > 1 ? `${n} 张图片在本机找不到` : '有一张图片在本机找不到');
    if (msgs.length) issues.push({ key: s.key, slideId: s.slideId, page: i + 1, label: s.label, msgs: [...new Set(msgs)] });
  });
  const items = missingInPages(slides);
  const withMiss = (slides || []).filter((s) => s.enabled !== false && s.missing?.length);
  return {
    issues,
    missing: items.length ? { count: items.length, pages: withMiss.length, firstSlideId: withMiss[0]?.slideId || null, items } : null,
  };
}

/** 缺英文（导出体检的标题行） */
export function missingEnText(lang, count) {
  return normLang(lang) === 'bi'
    ? `中英版还有 ${count} 处中文没有英文，导出后这些地方只显示中文`
    : `English 版还有 ${count} 处中文没有英文，导出后这些地方会显示中文`;
}

/** 缺英文（导出体检的做法提示）：导出语言 = 提案语言时直接去翻译；不同时先把提案语言切过去 */
export function missingEnHint(exportLang, projectLang, count) {
  const target = normLang(exportLang);
  if (target === normLang(projectLang)) return `在「页面」顶栏点「AI 翻译 · ${count}」一次补齐，也可以在各页的 EN 框里逐条填。`;
  const name = LANGS.find((l) => l.id === target)?.label || target;
  return `先在「页面」顶栏把提案语言切到「${name}」，再点「AI 翻译」一次补齐。`;
}

/**
 * 导出用的项目信息：English 版里客户、地点换成英文（翻译记忆 / 词典；没有英文就保持原样）——
 * 文件名和 PPT 的标题（文件属性）里不再出现中文；华文 / 中英版原样
 */
export function exportInfo(project, lang) {
  const info = project?.info || {};
  if (normLang(lang) !== 'en') return info;
  const en = (s) => {
    const raw = String(s ?? '').trim();
    if (!raw || !hasCJKText(raw)) return s;
    const r = resolveEn(project, raw, 'text');
    return r.text && !hasCJKText(r.text) ? r.text : s;
  };
  return { ...info, client: en(info.client), location: en(info.location) };
}

/** PPT 文件属性里的标题：'Muar · Mr Lau · Dreamhouse Blueprint'（English 版用英文的客户 / 地点） */
export function pptxTitle(project, lang) {
  return [clientLine(exportInfo(project, lang)) || String(project?.name || '').trim(), 'Dreamhouse Blueprint'].filter(Boolean).join(' · ');
}

/**
 * 材料清单右侧预览下面的缺英文提醒（引擎的那句说「在右侧填」，在这个标签页里不对）
 * @param {string} lang
 * @param {Array<{ zh:string, kind:string }>} misses  预览页的 missing（已去重）
 */
export function materialsMissText(lang, misses) {
  const list = misses || [];
  if (normLang(lang) === 'zh' || !list.length) return '';
  const mats = list.filter((m) => m.kind === 'material').length;
  const what = mats === list.length ? `${mats} 种材料还没有英文名` : `${list.length} 处还没有英文`;
  const shown = normLang(lang) === 'bi' ? '页上只显示中文' : '页上先显示中文';
  return `${LANG_VERSION[normLang(lang)]}：${what}，${shown} —— 在清单里每种材料的 EN 框填写，或到「页面」顶栏点「AI 翻译」`;
}
