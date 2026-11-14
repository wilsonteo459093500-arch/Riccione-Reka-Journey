// 整套提案渲染：Project → 有序的渲染页 [{ key, slideId, kind, label, section, enabled, bg, els, warnings }]
// 编辑器预览、缩略图、PPT 导出都只认这一份输出。
// 版式：C「安然」（参考 Aman 品牌手册，取代 B「格物」）—— engine/b/kit.js（字级、标题组、正文块、签名、logo、照片、托字渐变、
//   半版栅格）、b/design.js（方案页）、b/company.js（公司页 = 品牌画册 19 页）。目录名 b/ 和 renderCompanyB / COMPANY_PAGES_B 等
//   名字沿用 B 时的（编辑器、旧项目的 overrides 和迁移都靠它们），只换了版式，数据结构不变。

import { fitText } from './spec.js';
import { applyAdjust } from './adjust.js';
import { clientLine, floorsLine, findFloor } from './model.js';
import { makeTranslator, missWarning, roomEnOf, langOf, floorsLineEn, resolveEn, hasCJKText } from './lang.js';
import { COMPANY_PAGES_B, renderCompanyB, deckChapters } from './b/company.js';
import { bDesignCover, bFloor, bMaterials, bTeam, planViews, bViewPage, materialSlices } from './b/design.js';

/** 本案材料每页最多几种（超过就均分成几页） */
export const MATERIALS_PER_PAGE = 12;

/** 章节名（编辑器：页面列表的分组标题、项目信息的章节开关） */
export const SECTION_NAMES = {
  opening: '开篇',
  brand: '品牌 · 溪岸',
  company: '公司 · 瑞吉欧',
  design: '方案 · 设计图',
  service: '服务 · 交付',
};

/**
 * 章节名带上它在整套里的编号（01 品牌 · 溪岸）—— 与目录的 01 / 02、章节页的「第二章」、方案封面的章节标签一致：
 * 隐藏了前面的章节就往前排。开篇、整章都隐藏了（目录里没有它）= 不编号
 * @param {string} section
 * @param {{ list:string[], num:Record<string,number> }} chapters  deckChapters(project)
 */
export function sectionLabel(section, chapters) {
  const name = SECTION_NAMES[section] || section;
  const n = chapters?.list?.includes(section) ? chapters.num?.[section] : 0;
  return n ? `${String(n).padStart(2, '0')} ${name}` : name;
}

/** 公司页在编辑器里的页名 / 所在章节 */
export const companyTitle = (key) => COMPANY_PAGES_B[key]?.title || key;
export const companySection = (key) => COMPANY_PAGES_B[key]?.section || 'opening';

/**
 * 公司页 / 封面上的 {{token}}。English / 中英版另外给英文 token（tr = 记缺英文的翻译器；不传 = 不记）
 * 注意：渲染公司页时不要传 tr —— company.js 自己只在用到客户 / 方案名的页（封面、方案章节页）记缺英文
 */
export function projectTokens(project, tr = null) {
  const info = project.info || {};
  const tokens = {
    clientLine: clientLine(info),
    dateLine: info.date || '',
    proposalTitle: info.proposalTitle || '全屋定制设计方案',
    floorsLine: floorsLine(project.floors),
  };
  const lang = tr?.lang || langOf(project);
  if (lang === 'zh') return tokens;
  const en = (s, kind = 'text') => (tr ? tr.en(s, kind) : resolveEn(project, s, kind).text);
  const latin = (s) => (hasCJKText(s) ? en(s, 'text') || s : s);
  const floorsEn = floorsLineEn(project.floors);
  return {
    ...tokens,
    clientLineEn: [info.location, info.client].map((x) => (x || '').trim()).filter(Boolean).map(latin).join(' · '),
    proposalTitleEn: en(info.proposalTitle || '全屋定制设计方案', 'text') || 'Whole-House Design Proposal',
    floorsLineEn: floorsEn,
    floorsLineEnUpper: floorsEn.toUpperCase(),
  };
}

/** 文字元素的纯文本（编辑器回填输入框用） */
export const elementText = (el) => (el?.paras || []).map((p) => p.runs.map((r) => r.text).join('')).join('\n');

/** 某层楼的空间清单（按出现顺序去重） */
export function floorRooms(project, floorId) {
  return floorRoomSlides(project, floorId).map((s) => s.room.trim());
}

/** 某层楼每个空间第一次出现的那一页（英文名从页面的「英文小标题」取） */
function floorRoomSlides(project, floorId) {
  const seen = new Set();
  const out = [];
  for (const s of project.slides || []) {
    if (s.kind !== 'view' || s.floorId !== floorId || s.enabled === false || s.tag === '3d') continue;
    const r = (s.room || '').trim();
    if (r && !seen.has(r)) {
      seen.add(r);
      out.push(s);
    }
  }
  return out;
}

/** 某层楼的空间英文名（与 floorRooms 一一对应；缺英文 = ''） */
export function floorRoomsEn(project, floorId, tr) {
  return floorRoomSlides(project, floorId).map((s) => (tr ? tr.room(s) : roomEnOf(project, s).text) || '');
}

/**
 * 方案封面（Material Board 页）的标题 / 副标题，留空时自动（与 b/design.js 的封面一致）：
 *   标题 = 自填的 coverTitle → 客户与地点（两行）→ 方案名；副标题 = 自填的 coverSubtitle → 楼层（一楼与二楼）
 */
export function designCoverTexts(project) {
  const info = project?.info || {};
  const clean = (s) => String(s ?? '').trim();
  const parts = [info.client, info.location].map(clean).filter(Boolean);
  return {
    title: clean(info.coverTitle) || parts.join('\n') || clean(info.proposalTitle) || '全屋定制设计方案',
    subtitle: clean(info.coverSubtitle) || floorsLine(project?.floors),
  };
}

function labelFor(slide, project) {
  switch (slide.kind) {
    case 'company':
      return companyTitle(slide.key);
    case 'designCover':
      return project.cover?.image ? `方案封面 · ${designCoverTexts(project).title.replace(/\n/g, ' · ')}` : '方案封面（未设 Material Board）';
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
  if (slide.kind === 'company') return companySection(slide.key);
  if (slide.kind === 'team') return 'service';
  return 'design';
}

/**
 * 材料均分到各页（14 种 → 7 + 7，而不是 12 + 2）：[{ mats, perPage }]
 * renderDeck 用的是 b/design.js materialSlices：同样均分，只是名称很长、两排的小样会被挤扁时每页少放（一排 6 种）
 */
export function materialPages(mats) {
  const list = mats || [];
  const n = Math.max(1, Math.ceil(list.length / MATERIALS_PER_PAGE));
  const per = Math.max(1, Math.ceil(list.length / n));
  return Array.from({ length: n }, (_, p) => ({ mats: list.slice(p * per, (p + 1) * per), perPage: per }));
}

/**
 * @param {object} project
 * @param {{ meta?: (src:string)=>({w:number,h:number}|null) }} opts  meta：素材原始尺寸（裁切、放大倍数、版式计划都要用）
 */
export function renderDeck(project, { meta = () => null } = {}) {
  const lang = langOf(project);
  const tokens = projectTokens(project);
  // 效果图页满版 / 图文：整套一起排（节奏：不连续 3 页满版；同空间的下一页能补上材料才用满版）
  const plan = planViews(project, meta);
  // 看得到的章节（老客户隐藏了品牌 / 公司 / 服务）：目录只列这几章，章节页、方案封面的编号跟着往前排
  const chapters = deckChapters(project);
  const out = [];
  for (const slide of project.slides || []) {
    // 每页一个翻译器：记下这一页缺英文的地方，放进这一页的提醒
    const tr = makeTranslator(project);
    const ctx = { meta, project, tr, lang, tokens, chapters };
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
        pages = [renderCompanyB(slide.key, slide, ctx)];
        break;
      case 'designCover':
        // 没有 Material Board：退回「方案」章节页（公司页的 design-divider，文字 / 照片照样可改）
        pages = [bDesignCover(ctx) || renderCompanyB('design-divider', slide, ctx)];
        break;
      case 'materials': {
        const slices = materialSlices(ctx, project.materials, MATERIALS_PER_PAGE);
        pages = slices.map((s, i) => bMaterials(ctx, s.mats, i, slices.length, s.perPage, s.rows));
        break;
      }
      case 'floor':
        pages = [bFloor(ctx, slide)];
        break;
      case 'view':
        pages = [bViewPage(ctx, slide, plan)];
        break;
      case 'team':
        pages = [bTeam(ctx)];
        break;
      default:
        pages = [{ bg: 'F6F2EA', els: [], warnings: [`未知页面类型：${slide.kind}`] }];
    }
    const miss = missWarning(lang, tr.misses);
    pages.filter(Boolean).forEach((pg, i) =>
      out.push(
        // 最后一步：套上设计师的手动调整（slide.adjust）—— 预览和导出共用这份元素，所以两边一致
        applyAdjust(
          {
            ...base,
            key: i ? `${slide.id}#${i + 1}` : slide.id,
            pageIndex: i,
            ...pg,
            els: (pg.els || []).map((el) => fitText(el)),
            ...(miss ? { warnings: [...(pg.warnings || []), miss], missing: tr.misses } : {}),
          },
          slide.adjust,
          i,
          lang
        )
      )
    );
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
