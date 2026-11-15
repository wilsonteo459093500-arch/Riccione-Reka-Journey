// 展厅播放 · 时间线：把导出 PPT 的那一套页（renderDeck → exportableSlides）排成一串「停点」。
//
// 滚动位置 pos 是一个小数：整数 k = 停在第 k 个停点（这一页的版面、效果图和 PPT 完全一样），
// k 与 k+1 之间 = 从第 k 页过渡到第 k+1 页。
//
// 同一空间、同一视角的白天 / 夜晚两张效果图（相邻、同楼层同空间、视角名去掉白天 / 夜晚后相同）配成一对：
// 两张各是一个停点，属于同一「段」，之间的过渡是原图交叉淡化（灯光亮起来），不是换页。
//
// 满版效果图页（PPT 上不放设计说明）：播放时在右下角叠一栏说明（b/design.js bViewFullNotes），只在播放器里出现。

import { splitTimeOfDay } from '../import/labels.js';
import { bViewFullNotes } from '../engine/b/design.js';
import { makeTranslator, langOf } from '../engine/lang.js';
import { hasPlan3d } from './build3d.js';

/** 效果图页上那张效果图（满版 name 'photo:image'，图文页 edit.field 'image'）的元素序号；没有 → -1 */
export const heroIndex = (page) =>
  page?.kind === 'view' ? (page.els || []).findIndex((el) => el.t === 'img' && el.src && (el.name === 'photo:image' || el.edit?.field === 'image')) : -1;

/** 满版效果图页：效果图元素标名 'photo:image'（b/design.js bViewFull） */
export const isFullView = (page) => page?.kind === 'view' && (page.els || []).some((el) => el.name === 'photo:image');

/** 两个 view 页是不是同一视角的白天 / 夜晚 */
export function dayNightPair(a, b) {
  if (!a || !b || a.kind !== 'view' || b.kind !== 'view') return false;
  if ((a.floorId || '') !== (b.floorId || '') || (a.room || '').trim() !== (b.room || '').trim()) return false;
  const ta = splitTimeOfDay(a.subtitle);
  const tb = splitTimeOfDay(b.subtitle);
  if (!ta.tod || !tb.tod || ta.tod === tb.tod) return false;
  return ta.rest === tb.rest;
}

/**
 * @param {object[]} pages    exportableSlides(renderDeck(project, { meta }))
 * @param {object}   project
 * @returns {{ key, page, slide, segment:number, phase:'day'|'night'|null, label:string, section:string }[]}
 *   page = 播放用的页（满版效果图页多了说明那一栏）
 */
export function buildStops(pages, project) {
  const slides = new Map((project?.slides || []).map((s) => [s.id, s]));
  const lang = langOf(project);
  const ctx = { project, lang, tr: makeTranslator(project) };
  const stops = [];
  let segment = -1;
  let prevSlide = null;
  // 3D 户型开场：有 3D 户型图的楼层，在楼层章节页之后插一个停点（没有章节页 = 插在这层第一张效果图前面）
  const floors = new Map((project?.floors || []).map((f) => [f.id, f]));
  const done3d = new Set();
  const push3d = (floorId) => {
    const floor = floors.get(floorId);
    if (!floor || done3d.has(floorId) || !hasPlan3d(floor)) return;
    done3d.add(floorId);
    segment += 1;
    stops.push({
      key: `3d:${floorId}`,
      page: { kind: 'plan3d', bg: 'F3EEE7', els: [] },
      plan3d: floor,
      hero: -1,
      slide: null,
      segment,
      phase: null,
      label: `${floor.zh || '楼层'} · 3D 户型`,
      section: 'design',
      inPair: false,
    });
    prevSlide = null;
  };
  for (const pg of pages || []) {
    const slide = slides.get(pg.slideId) || null;
    if (slide?.kind === 'view' && slide.floorId) push3d(slide.floorId);
    // 同一 slide 的续页（材料第 2 页）、或白天 → 夜晚：留在同一段
    const sameSlide = prevSlide && slide && prevSlide.id === slide.id;
    // 一对只配两张：上一张已经在一对里（白天 · 夜晚 · 白天）就不再往后配
    const last = stops[stops.length - 1];
    const paired = !sameSlide && !!last && !last.inPair && dayNightPair(prevSlide, slide);
    if (paired) last.inPair = true;
    else if (!sameSlide) segment += 1;
    const tod = slide?.kind === 'view' ? splitTimeOfDay(slide.subtitle).tod : null;
    const extra = isFullView(pg) && slide ? bViewFullNotes(ctx, slide).els : [];
    const page = extra.length ? { ...pg, els: [...pg.els, ...extra] } : pg;
    stops.push({
      key: pg.key,
      page,
      hero: heroIndex(page), // 换页进来时「线稿 → 上色 → 原图」的那张效果图
      slide,
      segment,
      phase: tod,
      label: pg.label || '',
      section: pg.section || '',
      inPair: paired,
    });
    prevSlide = slide;
    if (slide?.kind === 'floor' && slide.floorId) push3d(slide.floorId);
  }
  return stops.map(({ inPair, ...s }) => s);
}

/**
 * 两个停点之间的过渡（另有 3D 开场：'build' 进 3D 停点 = 墙升起、柜子出现；'enter' 从 3D 停点进房间 = 高亮推近）：
 *   'same'   同一段（白天 → 夜晚）：交叉淡化
 *   'sketch' 换到一张效果图页：效果图从白纸上「线稿 → 上色 → 原图」
 *   'cut'    其他换页：交叉淡化 + 推近
 */
export function transitionKind(stops, a, b) {
  const sa = stops[a];
  const sb = stops[b];
  if (!sa || !sb) return 'cut';
  if (sa.segment === sb.segment && sa.slide?.kind === 'view' && sb.slide?.kind === 'view') return 'same';
  if (sb.plan3d) return 'build';
  if (sa.plan3d) return 'enter';
  return sb.hero >= 0 ? 'sketch' : 'cut';
}

/** 这段过渡要滑多长（相对一般换页）：「从无到有」慢一点，看得清线是怎么画出来的；3D 开场最慢 */
export const transitionWeight = (kind) => (kind === 'build' || kind === 'enter' ? 3 : kind === 'sketch' ? 2.4 : 1);

/** 目录：每段一项（第一个停点），按章节分组 → [{ section, items:[{ stop, label, segment }] }] */
export function indexOf(stops) {
  const groups = [];
  let seen = -1;
  stops.forEach((s, i) => {
    if (s.segment === seen) return;
    seen = s.segment;
    let g = groups[groups.length - 1];
    if (!g || g.section !== s.section) {
      g = { section: s.section, items: [] };
      groups.push(g);
    }
    const label = s.phase ? s.label.replace(/\s*·\s*(白天|夜晚)$/, '') : s.label;
    g.items.push({ stop: i, label, segment: s.segment });
  });
  return groups;
}

/** 目录分组的中文名 */
export const SECTION_NAMES = { opening: '开篇', brand: '品牌', company: '公司', design: '方案', service: '服务' };
