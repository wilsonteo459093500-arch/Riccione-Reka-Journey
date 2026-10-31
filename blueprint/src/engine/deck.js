// 整套提案渲染：Project → 有序的渲染页 [{ key, slideId, kind, label, section, enabled, bg, els, warnings }]
// 编辑器预览、缩略图、PPT 导出都只认这一份输出。

import { COMPANY_SLIDES } from './companyTemplate.js';
import { EN as COMPANY_EN, BI as COMPANY_BI, FLOWS as COMPANY_FLOWS } from './companyLang.js';
import { fillTokens, fitText } from './spec.js';
import { applyFlows, realWidth } from './flow.js';
import { PX_PER_PT } from '../theme.js';
import { clientLine, floorsLine, findFloor } from './model.js';
import { makeTranslator, missWarning, roomEnOf, langOf, floorsLineEn, resolveEn, hasCJKText } from './lang.js';
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

/**
 * 公司页 / 封面上的 {{token}}。English / 中英版另外给英文 token（tr = 这一页的翻译器，用来记下缺英文的地方）
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

// 定稿 PPT 里这些位置写的是什么（模板文字框就是按这些字量出来的）：缩字号以它为基准，原文永远不缩
const APPROVED_TOKENS = { clientLine: 'Muar · Mr Lau', dateLine: '2026 · 08', proposalTitle: '全屋定制设计方案', floorsLine: '一楼与二楼' };

/**
 * 公司固定页：填 token + 套用单页文字改写（overrides[元素序号] = 整段中文，\n 分段）
 * opts.lang：'en' / 'bi' 时再套英文版（companyLang.js；overridesEn[元素序号] = 设计师改过的英文）
 */
export function renderCompany(key, tokens, overrides = {}, opts = {}) {
  const zh = renderCompanyZh(key, tokens, overrides);
  const lang = opts.lang || 'zh';
  if (lang === 'zh' || !COMPANY_BY_KEY[key]) return zh;
  return lang === 'en' ? companyEn(key, zh, tokens, overrides, opts.overridesEn || {}) : companyBi(key, zh, tokens, overrides, opts.overridesEn || {});
}

const GEO_KEYS = ['x', 'y', 'w', 'h'];
const pickGeo = (s) => (s && typeof s === 'object' ? Object.fromEntries(GEO_KEYS.filter((k) => typeof s[k] === 'number').map((k) => [k, s[k]])) : {});
const stripFit = ({ fitRef, fitWrap, ...rest }) => rest;

/** 这一页顺排的栏里有哪些元素 */
const flowMembers = (key) => new Set((COMPANY_FLOWS[key] || []).flatMap((f) => f.items.flat()));

/**
 * 换过字的框收尾：
 *   在顺排的栏里 —— 框高由顺排决定（放不下往下推，整栏超底线才缩字）；定稿里是单行框、英文一行放不下 → 改成可折行
 *   不在栏里 —— 单行框照旧按宽度缩字，多行框「放不下再缩」
 */
function finishChanged(el, inFlow) {
  if (!inFlow) return el.nowrap ? el : { ...el, fitWrap: true };
  if (!el.nowrap) return el;
  if (!el.paras.some((p) => realWidth(p.runs) > (el.w - 5.3) * 0.97)) return el;
  const { nowrap, ...rest } = el;
  return rest;
}

/** English 版公司页：按 EN 表换字（'' = 不显示）、改样式 / 位置，再按栏顺排 */
function companyEn(key, zhPage, tokens, overrides, overridesEn) {
  const tpl = COMPANY_BY_KEY[key];
  const spec = COMPANY_EN[key] || {};
  const members = flowMembers(key);
  const warnings = [];
  const ref = [];
  const cur = [];
  zhPage.els.forEach((el, idx) => {
    const s = spec[idx];
    const base = { ...el, ...pickGeo(s) };
    ref[idx] = base;
    if (el.t !== 'text' || s === undefined) {
      cur[idx] = base;
      return;
    }
    if (s === '') {
      cur[idx] = null;
      return;
    }
    const sObj = typeof s === 'string' ? { text: s } : s;
    if (sObj.text === undefined) {
      // 只改位置（字本来就是英文，如品牌名）：沿用中文版的字（含设计师的改动）
      cur[idx] = base;
      return;
    }
    const zhEdit = overrides?.[idx];
    const userEn = overridesEn?.[idx];
    const derived = typeof zhEdit === 'string' && sObj.fromZh ? sObj.fromZh(zhEdit) : null;
    if (typeof zhEdit === 'string' && typeof userEn !== 'string' && !derived) {
      warnings.push('这页有改过的中文，English 版这里还是模板英文 —— 需要的话在右侧「英文」栏里改');
    }
    const text = fillTokens(typeof userEn === 'string' ? userEn : derived ?? sObj.text, tokens);
    const p0 = tpl.els[idx].paras[0];
    const style = {
      ...p0.runs[0],
      ...(sObj.font ? { font: sObj.font } : {}),
      ...(typeof sObj.size === 'number' ? { size: sObj.size } : {}),
      ...(typeof sObj.spacing === 'number' ? { spacing: sObj.spacing } : {}),
    };
    const paras = text.split('\n').map((line) => ({
      ...p0,
      ...(sObj.align ? { align: sObj.align } : {}),
      ...(sObj.lineSpacing ? { lineSpacing: sObj.lineSpacing } : {}),
      runs: [{ ...style, text: line }],
    }));
    cur[idx] = finishChanged({ ...stripFit(base), paras, changed: true, edit: { field: `overridesEn.${idx}` } }, members.has(idx));
  });
  return { bg: zhPage.bg, els: flowed(cur, ref, key), warnings: [...new Set(warnings)] };
}

/** 按栏顺排，去掉隐藏的元素和顺排用的内部标记 */
const flowed = (cur, ref, key) =>
  applyFlows(cur, ref, COMPANY_FLOWS[key])
    .filter(Boolean)
    .map(({ changed, addedParas, ...el }) =>
      el.t === 'text' && addedParas !== undefined ? { ...el, paras: el.paras.map((p) => ({ ...p, runs: p.runs.map(({ en, ...r }) => r) })) } : el
    );

/** 中英版英文段的样式：body = 正文的英文；small = 小一号；caps = 大写小字 */
function biStyle(r0, s) {
  const as = s.as || 'body';
  if (as === 'caps') {
    return { run: { font: 'sans', size: s.size ?? 15, spacing: s.spacing ?? 3.6, color: s.color || r0.color }, lineSpacing: 100, spacer: 0 };
  }
  const k = as === 'small' ? 0.84 : 0.8;
  return {
    run: { font: 'serif', size: s.size ?? Math.max(13, Math.round(r0.size * k * 2) / 2), color: s.color || r0.color, alpha: 0.9 },
    lineSpacing: as === 'small' ? 112 : 125,
    spacer: as === 'body' ? 7 : 0,
  };
}

/** 中英版公司页：中文原样，按 BI 表在后面另起一段英文；可隐藏 / 改位置，再按栏顺排 */
function companyBi(key, zhPage, tokens, overrides, overridesEn) {
  const spec = COMPANY_BI[key] || {};
  const members = flowMembers(key);
  const warnings = [];
  const ref = [];
  const cur = [];
  zhPage.els.forEach((el, idx) => {
    const s = spec[idx];
    const base = { ...el, ...pickGeo(s) };
    ref[idx] = base;
    if (!s) {
      cur[idx] = base;
      return;
    }
    if (s.hide) {
      cur[idx] = null;
      return;
    }
    const userEn = overridesEn?.[idx];
    if (el.t !== 'text' || (s.en === undefined && typeof userEn !== 'string')) {
      cur[idx] = base;
      return;
    }
    if (typeof overrides?.[idx] === 'string' && typeof userEn !== 'string') {
      warnings.push('这页有改过的中文，中英版的英文那行还是模板原文 —— 需要的话在右侧「英文」栏里改');
    }
    const en = fillTokens(typeof userEn === 'string' ? userEn : s.en, tokens);
    if (!en.trim()) {
      cur[idx] = base;
      return;
    }
    const last = el.paras[el.paras.length - 1];
    const st = biStyle(el.paras[0].runs[0], s);
    // 英文的 run 标上 en：顺排放不下时只缩英文（中文保持定稿字号）
    if (s.inline) {
      // 短标题：英文接在中文同一行后面（「品牌成立  BRAND FOUNDED」），不占新的一行
      const paras = [...el.paras.slice(0, -1), { ...last, runs: [...last.runs, { ...st.run, text: `   ${en.replace(/\n/g, ' ')}`, en: true }] }];
      cur[idx] = finishChanged({ ...stripFit(base), paras, changed: true, addedParas: 0 }, members.has(idx));
      return;
    }
    const enParas = en.split('\n').map((line) => ({ align: last.align, lineSpacing: st.lineSpacing, runs: [{ ...st.run, text: line, en: true }] }));
    const spacer = st.spacer ? [{ align: last.align, runs: [{ ...st.run, size: st.spacer, text: '', en: true }] }] : [];
    cur[idx] = finishChanged(
      { ...stripFit(base), paras: [...el.paras, ...spacer, ...enParas], changed: true, addedParas: spacer.length + enParas.length },
      members.has(idx)
    );
  });
  return { bg: zhPage.bg, els: flowed(cur, ref, key), warnings: [...new Set(warnings)] };
}

/** 华文版（定稿原样） */
function renderCompanyZh(key, tokens, overrides = {}) {
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
    // 缩字号的基准：定稿原文（填上定稿当时的客户 / 日期）—— 只有比原文更长时才缩
    const refParas = el.paras.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r, text: fillTokens(r.text, APPROVED_TOKENS) })) }));
    return {
      ...el,
      paras,
      autofit: 'shrink',
      ...(singleLine ? { nowrap: true } : {}),
      ...(typeof override === 'string' ? { fitWrap: true } : {}),
      fitRef: refParas,
      edit: { field: `overrides.${idx}` },
    };
  });
  return { bg: tpl.bg, els, warnings: [] };
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
  const tokens = projectTokens(project);
  const lang = langOf(project);
  const out = [];
  for (const slide of project.slides || []) {
    // 每页一个翻译器：记下这一页缺英文的地方，放进这一页的提醒
    const tr = makeTranslator(project);
    const ctx = { meta, project, tr };
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
        pages = [renderCompany(slide.key, lang === 'zh' ? tokens : projectTokens(project, tr), slide.overrides, { lang, overridesEn: slide.overridesEn })];
        break;
      case 'designCover':
        pages = [
          project.cover?.image
            ? layoutDesignCover(project, ctx)
            : renderCompany('design-divider', lang === 'zh' ? tokens : projectTokens(project, tr), slide.overrides, { lang, overridesEn: slide.overridesEn }),
        ];
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
        const roomsEn = lang === 'zh' ? [] : floorRoomsEn(project, slide.floorId, tr);
        pages = [layoutFloor(floor, floorRooms(project, slide.floorId), floorImage(project, slide, floor), ctx, roomsEn)];
        break;
      }
      case 'view': {
        const floor = findFloor(project, slide.floorId);
        const layout = slide.layout && slide.layout !== 'auto' ? slide.layout : autoLayout(slide, slide.image ? meta(slide.image) : null);
        pages = [layout === 'full' ? layoutViewFull(slide, floor, ctx) : layoutViewFramed(slide, floor, ctx)];
        break;
      }
      case 'team':
        pages = [layoutTeam(project.info?.team, ctx)];
        break;
      default:
        pages = [{ bg: 'F5F0E6', els: [], warnings: [`未知页面类型：${slide.kind}`] }];
    }
    const miss = missWarning(lang, tr.misses);
    pages.forEach((pg, i) =>
      out.push({
        ...base,
        key: i ? `${slide.id}#${i + 1}` : slide.id,
        ...pg,
        els: (pg.els || []).map((el) => fitText(el)),
        ...(miss ? { warnings: [...(pg.warnings || []), miss], missing: tr.misses } : {}),
      })
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
