// 项目层面的纯函数（Node 可测）：缩略图、统计、章节开关、副本名称等

import { uid, LAYOUT_VERSION } from '../engine/model.js';
import { COMPANY_PAGES_B, legacyOverrides } from '../engine/b/company.js';
import { balanceText } from '../engine/b/text.js';
import { hasCJK } from '../engine/b/kit.js';
import { langOf } from '../engine/lang.js';

const SECTION_OF = Object.fromEntries(Object.entries(COMPANY_PAGES_B).map(([key, p]) => [key, p.section]));

// ---------------------------------------------------------------------------
// 旧版公司页的改写（按旧模板的元素序号）→ 新版式的栏位：意思一样的才搬（其余留在数据里，页面上提醒设计师对照）
//   序号 = 旧模板 engine/companyTemplate.js（接入 B 版式时删掉）每页 els 的下标，例如售后维保 15 / 21 = 「＿＿ 年」
// ---------------------------------------------------------------------------

const BLANK_YEARS = /[＿_]{2,}/;

/** 封底地址：旧版是一长行，新版每行单排（最多三行）—— 在逗号处均衡折成几行（栏宽 544，正文字级） */
const addressLines = (s) =>
  String(s)
    .split('\n')
    .map((line) => balanceText(line.trim(), hasCJK(line) ? 'zh' : 'en', 'body', 544))
    .join('\n');

/** 旧封底「www.saildz.com · +6011-2233 1919 (WhatsApp)」→ 电话 / 网址（认不全就不搬，留给设计师对照） */
function splitContact(text) {
  const parts = String(text).split(/\s*[·•]\s*|\n/).map((x) => x.trim()).filter(Boolean);
  const out = {};
  for (const part of parts) {
    if (/www\.|https?:\/\/|\.(com|my|cn|net)\b/i.test(part) && !out.web) out.web = part;
    else if (/\d[\d\s-]{6,}/.test(part) && !out.phone) out.phone = part;
    else return null;
  }
  return out;
}

const DEFAULT_V3 = COMPANY_PAGES_B.closing.fields.v3.zh;

/**
 * 每页：旧序号 → (旧文字) => { 新栏位: 文字 }（中文 overrides）
 *   封面：5 方案名 → subtitle，6 地点 · 客户 → name，10 日期 → date
 *   售后维保：15 / 21 五金 / 板材质保年数 → r3Text / r4Text（还是「＿＿ 年」的不搬）
 *   封底：3 结语 → title，6 地址 → v1（折成几行），7 网址 · 电话 → v2（电话）、v3 第一行（网址）
 */
const LEGACY_ZH = {
  cover: { 5: (t) => ({ subtitle: t }), 6: (t) => ({ name: t }), 10: (t) => ({ date: t }) },
  'service-aftersales': {
    15: (t) => (BLANK_YEARS.test(t) ? null : { r3Text: t }),
    21: (t) => (BLANK_YEARS.test(t) ? null : { r4Text: t }),
  },
  closing: {
    3: (t) => ({ title: t }),
    6: (t) => ({ v1: addressLines(t) }),
    7: (t) => {
      const c = splitContact(t);
      if (!c) return null;
      const out = {};
      if (c.phone) out.v2 = c.phone;
      if (c.web) out.v3 = [c.web, ...DEFAULT_V3.split('\n').slice(1)].join('\n');
      return out;
    },
  },
};

/** English / 中英版的旧改写（overridesEn 的数字键）：封面 5 / 6、售后维保 15 / 21、封底 3 */
const LEGACY_EN = {
  cover: { 5: (t) => ({ subtitle: t }), 6: (t) => ({ name: t }) },
  'service-aftersales': {
    15: (t) => (BLANK_YEARS.test(t) ? null : { r3Text: t }),
    21: (t) => (BLANK_YEARS.test(t) ? null : { r4Text: t }),
  },
  closing: { 3: (t) => ({ title: t }) },
};

/** 一页的旧改写搬到新栏位（新栏位已经有设计师写的字就不覆盖，旧的留着提醒）；没有可搬的返回原对象 */
function moveLegacyEdits(slide) {
  const key = slide.kind === 'company' ? slide.key : null;
  if (!key) return slide;
  let next = slide;
  for (const [bucket, table] of [['overrides', LEGACY_ZH[key]], ['overridesEn', LEGACY_EN[key]]]) {
    const src = next[bucket];
    if (!table || !src) continue;
    let map = null;
    const fields = COMPANY_PAGES_B[key].fields;
    for (const [idx, fn] of Object.entries(table)) {
      const old = src[idx];
      if (typeof old !== 'string' || !old.trim()) continue;
      const moved = fn(old.trim());
      if (!moved || Object.keys(moved).some((f) => typeof src[f] === 'string')) continue;
      map = map || { ...src };
      // 和新版默认稿一样的（例如封底只改了电话，网址没变）不写成改写
      for (const [f, v] of Object.entries(moved)) if (v !== fields[f]?.zh) map[f] = v;
      delete map[idx];
    }
    if (map) next = { ...next, [bucket]: map };
  }
  return next;
}

/**
 * 有旧版留下的改写还没对照（新版式没有对应栏位）的公司页：[{ slideId, title, count }]
 * 和页面上的提醒、检查器里的「旧版里改过的字」同一个规则（按提案语言：华文版只算中文的改写 —— 英文的在华文版里看不到）
 */
export function legacyEditPages(project) {
  const out = [];
  const lang = langOf(project);
  for (const s of project?.slides || []) {
    // 方案封面有 Material Board 时不用「方案」章节页，那一页的旧改写也就看不到
    if (s?.kind !== 'company' && !(s?.kind === 'designCover' && !project.cover?.image)) continue;
    const n = legacyOverrides(s, lang).length;
    if (!n) continue;
    const key = s.kind === 'company' ? s.key : 'design-divider';
    out.push({ slideId: s.id, title: COMPANY_PAGES_B[key]?.title || key, count: n });
  }
  return out;
}

/**
 * 打开项目时升级（B「格物」，LAYOUT_VERSION = 2）：
 *   1. 旧项目（layoutVersion < 2）：
 *      · 效果图版式交还给自动排版 —— 旧版式（满版 / 框图）是旧版自动排版写死的，旧满版页上压着材料和说明；
 *        B 的满版页只放图，照旧值排会把材料、说明藏起来（AI 立体图页不动）
 *      · 楼层页的图：旧版设计师选的图存在楼层上（floor.image），旧版一定照用；B 把它当作自动的
 *        （和下一页同一张时会换掉）→ 抄到这一层的楼层页上，算设计师选的，照旧显示（可「恢复自动」）
 *   2. 公司页按旧模板元素序号的改写（数字键）：意思一样的几处搬到新栏位（封面、售后维保的质保年数、封底联系方式）；
 *      其余留在数据里，页面上提醒设计师对照（legacyEditPages）。只要还有可搬的就搬（已升级过的项目也补上）
 *   3. 后来加进整套的公司页（ensureCompanyPages）：第二页的感谢信补在封面后面
 * 没有要改的返回原对象
 */
export function upgradeProject(project) {
  if (!project) return project;
  const old = (project.layoutVersion || 1) < LAYOUT_VERSION;
  const floorImage = new Map(old ? (project.floors || []).filter((f) => f?.image).map((f) => [f.id, f.image]) : []);
  let changed = old;
  let slides = (project.slides || []).map((s) => {
    if (!s) return s;
    let next = s;
    if (old && s.kind === 'view' && s.tag !== '3d' && s.layout && s.layout !== 'auto') next = { ...next, layout: 'auto' };
    if (old && s.kind === 'floor' && !s.image && floorImage.has(s.floorId)) next = { ...next, image: floorImage.get(s.floorId) };
    next = moveLegacyEdits(next);
    if (next !== s) changed = true;
    return next;
  });
  const added = ensureCompanyPages(slides);
  if (added !== slides) {
    slides = added;
    changed = true;
  }
  if (!changed) return project;
  return { ...project, slides, layoutVersion: Math.max(project.layoutVersion || 1, LAYOUT_VERSION) };
}

/**
 * 后来才加进默认整套的公司页：[页, 放在哪一页后面]。旧项目打开时缺哪页就补哪页（公司页只能隐藏、不能删，所以缺 = 当时还没有这一页）
 *   感谢信（2026-11）：封面后面
 */
const LATER_PAGES = [['letter', 'cover']];

/** 补上缺的公司页（还没有整套的空项目不补）；没有要补的返回原数组 */
export function ensureCompanyPages(slides) {
  const list = slides || [];
  if (!list.some((s) => s?.kind === 'company')) return slides;
  let out = list;
  for (const [key, after] of LATER_PAGES) {
    if (out.some((s) => s?.kind === 'company' && s.key === key)) continue;
    const at = out.findIndex((s) => s?.kind === 'company' && s.key === after);
    out = [...out];
    out.splice(at >= 0 ? at + 1 : 0, 0, { id: uid('s'), kind: 'company', key, enabled: true });
  }
  return out;
}

/** 首页卡片缩略图：方案封面（Material Board）→ 第一张效果图 → 楼层图 → 原稿第一页 */
export function projectThumbSrc(project) {
  if (!project) return null;
  if (project.cover?.image) return project.cover.image;
  const slides = project.slides || [];
  const view = slides.find((s) => s.kind === 'view' && s.image && s.enabled !== false && s.tag !== '3d') || slides.find((s) => s.kind === 'view' && s.image);
  if (view) return view.image;
  const floor = (project.floors || []).find((f) => f.image);
  if (floor) return floor.image;
  return (project.pages || []).find((p) => p.thumb)?.thumb || null;
}

/** 项目统计：启用页数、效果图、楼层、材料 */
export function projectStats(project) {
  const slides = project?.slides || [];
  return {
    slides: slides.filter((s) => s.enabled !== false).length,
    hidden: slides.filter((s) => s.enabled === false).length,
    views: slides.filter((s) => s.kind === 'view').length,
    floors: (project?.floors || []).length,
    materials: (project?.materials || []).length,
  };
}

/** 「名称（副本）」「名称（副本 2）」… */
export function copyName(name, existing = []) {
  const base = String(name || '未命名方案').replace(/（副本(?: \d+)?）$/, '').trim() || '未命名方案';
  const taken = new Set(existing);
  let n = 1;
  let out = `${base}（副本）`;
  while (taken.has(out)) {
    n += 1;
    out = `${base}（副本 ${n}）`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 方案章节显示（老客户可隐藏品牌 / 公司介绍）
// ---------------------------------------------------------------------------

/**
 * 可开关的章节（封底「联系方式」始终保留）。章节名与编号不写死：显示时用 deck.js sectionLabel(id, deckChapters(project))，
 * 隐藏了前面的章节，后面的编号跟着往前排（与目录、章节页一致）
 */
export const TOGGLE_SECTIONS = [
  { id: 'brand', hint: '品牌理念、故事、原创系列、奖项、供应链' },
  { id: 'company', hint: '关于我们、发展历程、展厅、品质认证' },
  { id: 'service', hint: '服务流程、订单周期、售后维保（封底保留）' },
];

const KEEP_ALWAYS = new Set(['closing']);

const inSection = (slide, section) =>
  slide.kind === 'company' && !KEEP_ALWAYS.has(slide.key) && SECTION_OF[slide.key] === section;

/** 章节状态：'on' | 'off' | 'mixed' | 'none'（整套里没有该章节的页） */
export function sectionState(project, section) {
  const list = (project?.slides || []).filter((s) => inSection(s, section));
  if (!list.length) return 'none';
  const on = list.filter((s) => s.enabled !== false).length;
  if (on === list.length) return 'on';
  return on ? 'mixed' : 'off';
}

/** 一键开 / 关整个章节 */
export function setSectionEnabled(project, section, enabled) {
  let changed = false;
  const slides = (project.slides || []).map((s) => {
    if (!inSection(s, section) || (s.enabled !== false) === enabled) return s;
    changed = true;
    return { ...s, enabled };
  });
  return changed ? { ...project, slides } : project;
}

/** 单页类型（本案材料 / 服务团队）的显示状态 */
export function kindState(project, kind) {
  const list = (project?.slides || []).filter((s) => s.kind === kind);
  if (!list.length) return 'none';
  const on = list.filter((s) => s.enabled !== false).length;
  if (on === list.length) return 'on';
  return on ? 'mixed' : 'off';
}

export function setKindEnabled(project, kind, enabled) {
  let changed = false;
  const slides = (project.slides || []).map((s) => {
    if (s.kind !== kind || (s.enabled !== false) === enabled) return s;
    changed = true;
    return { ...s, enabled };
  });
  return changed ? { ...project, slides } : project;
}

/** 整套里没有「本案材料」页时补一页：放在方案封面之后（没有方案封面就放在第一张方案页之前） */
export function ensureMaterialsSlide(project) {
  const slides = project.slides || [];
  if (slides.some((s) => s.kind === 'materials')) return project;
  let at = slides.findIndex((s) => s.kind === 'designCover');
  if (at >= 0) at += 1;
  else {
    at = slides.findIndex((s) => s.kind === 'floor' || s.kind === 'view');
    if (at < 0) at = slides.length;
  }
  const next = [...slides];
  next.splice(at, 0, { id: uid('s'), kind: 'materials', enabled: true });
  return { ...project, slides: next };
}

/** 整套里没有「方案封面」页时补一页：放在第一张方案页（材料 / 楼层 / 效果图）之前，没有方案页就放在「服务」章节页之前 */
export function ensureDesignCoverSlide(project) {
  const slides = project.slides || [];
  if (slides.some((s) => s.kind === 'designCover')) return project;
  let at = slides.findIndex((s) => s.kind === 'materials' || s.kind === 'floor' || s.kind === 'view');
  if (at < 0) at = slides.findIndex((s) => s.kind === 'company' && s.key === 'service-divider');
  if (at < 0) at = slides.length;
  const next = [...slides];
  next.splice(at, 0, { id: uid('s'), kind: 'designCover', enabled: true });
  return { ...project, slides: next };
}

export const designCoverSlideId = (project) => (project?.slides || []).find((s) => s.kind === 'designCover')?.id || null;
