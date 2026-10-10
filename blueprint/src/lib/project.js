// 项目层面的纯函数（Node 可测）：缩略图、统计、章节开关、副本名称等

import { uid } from '../engine/model.js';
import { COMPANY_SLIDES } from '../engine/companyTemplate.js';

const SECTION_OF = Object.fromEntries(COMPANY_SLIDES.map((s) => [s.key, s.section]));

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

/** 可开关的章节（封底「联系方式」始终保留） */
export const TOGGLE_SECTIONS = [
  { id: 'brand', label: '01 品牌 · 溪岸', hint: '品牌理念、故事、原创系列、奖项、供应链' },
  { id: 'company', label: '02 公司 · 瑞吉欧', hint: '关于我们、发展历程、展厅、品质认证' },
  { id: 'service', label: '04 服务 · 交付', hint: '服务流程、订单周期、售后维保（封底保留）' },
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

/** 设封面后自动挑版式：横图 → 满版；竖图且当前是满版 → 左文右图 */
export function coverLayoutFor(current, orientation) {
  if (orientation === 'landscape' && current !== 'full') return 'full';
  // 方形画板放进满版（16:9）会被裁掉近一半 → 左文右图
  if ((orientation === 'portrait' || orientation === 'square') && current === 'full') return 'split-light';
  return current || 'split-light';
}
