// 整套提案渲染：Project → 有序的渲染页 [{ key, slideId, kind, label, section, enabled, bg, els, warnings }]
// 编辑器预览、缩略图、PPT 导出都只认这一份输出。

import { COMPANY_SLIDES } from './companyTemplate.js';
import { fillTokens } from './spec.js';
import { PX_PER_PT } from '../theme.js';
import { clientLine, floorsLine, findFloor } from './model.js';
import {
  layoutMaterials, layoutFloor, layoutViewFull, layoutViewFramed, layoutDesignCover, layoutTeam,
  autoLayout, MATERIALS_PER_PAGE, coverTexts,
} from './layouts.js';

export const COMPANY_BY_KEY = Object.fromEntries(COMPANY_SLIDES.map((s) => [s.key, s]));

export const SECTION_LABELS = {
  opening: '开篇',
  brand: '01 品牌 · 溪岸',
  company: '02 公司 · 瑞吉欧',
  design: '03 方案 · 设计图',
  service: '04 服务 · 交付',
};

export function projectTokens(project) {
  const info = project.info || {};
  return {
    clientLine: clientLine(info),
    dateLine: info.date || '',
    proposalTitle: info.proposalTitle || '全屋定制设计方案',
    floorsLine: floorsLine(project.floors),
  };
}

/** 公司固定页：填 token + 套用单页文字改写（overrides[元素序号] = 整段文字，\n 分段） */
export function renderCompany(key, tokens, overrides = {}) {
  const tpl = COMPANY_BY_KEY[key];
  if (!tpl) return { bg: 'F5F0E6', els: [], warnings: [`未知的公司页：${key}`] };
  const els = tpl.els.map((el, idx) => {
    if (el.t !== 'text') return el;
    const override = overrides?.[idx];
    let paras = el.paras.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r, text: fillTokens(r.text, tokens) })) }));
    if (typeof override === 'string') {
      const lines = override.split('\n');
      paras = lines.map((line, i) => {
        const src = el.paras[Math.min(i, el.paras.length - 1)];
        return { ...src, runs: [{ ...src.runs[0], text: line }] };
      });
    }
    // 定稿里的文字框是按字量贴身量出来的：沿用「超框自动缩小」，单行框预览时不折行
    const first = el.paras[0]?.runs?.[0];
    const singleLine = el.paras.length === 1 && first && el.h < first.size * PX_PER_PT * 1.2 * 1.6;
    return { ...el, paras, autofit: 'shrink', ...(singleLine ? { nowrap: true } : {}), edit: { field: `overrides.${idx}` } };
  });
  return { bg: tpl.bg, els, warnings: [] };
}

/** 文字元素的纯文本（编辑器回填输入框用） */
export const elementText = (el) => (el?.paras || []).map((p) => p.runs.map((r) => r.text).join('')).join('\n');

/** 某层楼的空间清单（按出现顺序去重） */
export function floorRooms(project, floorId) {
  const seen = new Set();
  const rooms = [];
  for (const s of project.slides || []) {
    if (s.kind !== 'view' || s.floorId !== floorId || s.enabled === false || s.tag === '3d') continue;
    const r = (s.room || '').trim();
    if (r && !seen.has(r)) {
      seen.add(r);
      rooms.push(r);
    }
  }
  return rooms;
}

function floorImage(project, slide, floor) {
  if (slide.image) return slide.image;
  if (floor?.image) return floor.image;
  const first = (project.slides || []).find((s) => s.kind === 'view' && s.floorId === floor?.id && s.image && s.enabled !== false);
  return first?.image || null;
}

function labelFor(slide, project) {
  switch (slide.kind) {
    case 'company':
      return COMPANY_BY_KEY[slide.key]?.title || slide.key;
    case 'designCover':
      return project.cover?.image ? `方案封面 · ${coverTexts(project).title}` : '方案封面（未设 Material Board）';
    case 'materials':
      return '本案材料';
    case 'floor':
      return `楼层 · ${findFloor(project, slide.floorId)?.zh || '未命名'}`;
    case 'view':
      return [slide.room, slide.subtitle].filter(Boolean).join(' · ') || '效果图';
    case 'team':
      return '本案服务团队';
    default:
      return slide.kind;
  }
}

function sectionFor(slide) {
  if (slide.kind === 'company') return COMPANY_BY_KEY[slide.key]?.section || 'opening';
  if (slide.kind === 'team') return 'service';
  return 'design';
}

/**
 * @param {object} project
 * @param {{ meta?: (src:string)=>({w:number,h:number}|null) }} opts  meta：素材原始尺寸（cover/contain 裁切要用）
 */
export function renderDeck(project, { meta = () => null } = {}) {
  const ctx = { meta, project };
  const tokens = projectTokens(project);
  const out = [];
  for (const slide of project.slides || []) {
    const base = {
      slideId: slide.id,
      kind: slide.kind,
      label: labelFor(slide, project),
      section: sectionFor(slide),
      enabled: slide.enabled !== false,
    };
    let pages = [];
    switch (slide.kind) {
      case 'company':
        pages = [renderCompany(slide.key, tokens, slide.overrides)];
        break;
      case 'designCover':
        pages = [project.cover?.image ? layoutDesignCover(project, ctx) : renderCompany('design-divider', tokens, slide.overrides)];
        break;
      case 'materials': {
        const mats = project.materials || [];
        // 均分到各页（20 种 → 10 + 10，而不是 18 + 2）
        const n = Math.max(1, Math.ceil(mats.length / MATERIALS_PER_PAGE));
        const per = Math.max(1, Math.ceil(mats.length / n));
        for (let p = 0; p < n; p++) {
          pages.push(layoutMaterials(mats.slice(p * per, (p + 1) * per), ctx, { page: p + 1, pages: n }));
        }
        break;
      }
      case 'floor': {
        const floor = findFloor(project, slide.floorId);
        pages = [layoutFloor(floor, floorRooms(project, slide.floorId), floorImage(project, slide, floor), ctx)];
        break;
      }
      case 'view': {
        const floor = findFloor(project, slide.floorId);
        const layout = slide.layout && slide.layout !== 'auto' ? slide.layout : autoLayout(slide, slide.image ? meta(slide.image) : null);
        pages = [layout === 'full' ? layoutViewFull(slide, floor, ctx) : layoutViewFramed(slide, floor, ctx)];
        break;
      }
      case 'team':
        pages = [layoutTeam(project.info?.team)];
        break;
      default:
        pages = [{ bg: 'F5F0E6', els: [], warnings: [`未知页面类型：${slide.kind}`] }];
    }
    pages.forEach((pg, i) => out.push({ ...base, key: i ? `${slide.id}#${i + 1}` : slide.id, ...pg }));
  }
  return out;
}

/** 导出用：只保留启用的页 */
export const exportableSlides = (rendered) => rendered.filter((s) => s.enabled);

/** 收集整套用到的图片 src（导出前预加载 / 体检用） */
export function collectImageSources(rendered) {
  const set = new Set();
  for (const s of rendered) for (const el of s.els) if (el.t === 'img' && el.src) set.add(el.src);
  return [...set];
}
