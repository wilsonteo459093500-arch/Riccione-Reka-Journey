// 楼层的加、删、移动（项目信息 → 楼层）。纯函数，新 id 由调用方传进来（onChange 的 updater 可能被调用两次）。
//
// 整套里一层 = 「楼层章节页 + 后面跟着的页」（到下一个楼层章节页、或方案部分结束为止）。
//   加一层：楼层章节页放在方案部分最后，设计师再把效果图页的「楼层」改过去（改了会提示移到该层末尾）
//   删一层：拿掉它的章节页；它的效果图页归到排在它们前面的那一层（第一层被删 → 不分楼层）
//   上移 / 下移：楼层清单换位置，整套里两层的页一起整块换位置

import { parseFloorLabel } from '../import/labels.js';

const DESIGN_KINDS = new Set(['view', 'floor']);
const STOP_KINDS = new Set(['company', 'team', 'designCover', 'materials']);

/** 某一页往前找最近的楼层章节（和 editor/ops.js floorContextOf 同一个规则） */
function contextFloor(slides, i) {
  for (let k = i; k >= 0; k--) {
    const s = slides[k];
    if (s.kind === 'floor') return s.floorId || null;
    if (STOP_KINDS.has(s.kind)) return null;
  }
  return null;
}

/** 一层在整套里的范围 [start, end)；没有章节页 → null */
function floorBlock(slides, floorId) {
  const start = slides.findIndex((s) => s.kind === 'floor' && s.floorId === floorId);
  if (start < 0) return null;
  let end = start + 1;
  while (end < slides.length && slides[end].kind !== 'floor' && !STOP_KINDS.has(slides[end].kind)) end++;
  return { start, end };
}

const ZH_LEVELS = ['一楼', '二楼', '三楼', '四楼', '五楼', '六楼', '七楼', '八楼', '九楼', '十楼'];

/** 加一层时的默认名字：还没用过的下一层（一楼 GROUND FLOOR、二楼 FIRST FLOOR…）；都用过了 → 空 */
export function nextFloorName(project) {
  const used = new Set((project.floors || []).map((f) => String(f.zh || '').trim()));
  for (const zh of ZH_LEVELS) {
    if (used.has(zh)) continue;
    const parsed = parseFloorLabel(zh);
    return { zh, en: parsed?.zh === zh ? parsed.en : '' };
  }
  return { zh: '', en: '' };
}

/** 加一层：楼层清单最后 + 方案部分最后一张章节页 */
export function addFloor(project, { floorId, slideId, zh = '', en = '' }) {
  if (!floorId || !slideId) return project;
  const slides = project.slides || [];
  let at = -1;
  slides.forEach((s, i) => {
    if (DESIGN_KINDS.has(s.kind)) at = i;
  });
  if (at < 0) at = slides.findLastIndex((s) => s.kind === 'materials' || s.kind === 'designCover');
  const floorSlide = { id: slideId, kind: 'floor', floorId, enabled: true };
  return {
    ...project,
    floors: [...(project.floors || []), { id: floorId, zh, en, image: null }],
    slides: [...slides.slice(0, at + 1), floorSlide, ...slides.slice(at + 1)],
  };
}

/** 这一层有几张效果图页（删之前问一句用） */
export const floorViewCount = (project, floorId) => (project.slides || []).filter((s) => s.kind === 'view' && s.floorId === floorId).length;

/** 删一层：拿掉章节页；这一层的效果图页归到排在它们前面的那一层（没有就不分楼层） */
export function removeFloor(project, floorId) {
  if (!(project.floors || []).some((f) => f.id === floorId)) return project;
  const slides = (project.slides || []).filter((s) => !(s.kind === 'floor' && s.floorId === floorId));
  const next = slides.map((s, i) => (s.kind === 'view' && s.floorId === floorId ? { ...s, floorId: contextFloor(slides, i) } : s));
  return { ...project, floors: project.floors.filter((f) => f.id !== floorId), slides: next };
}

/** 上移（-1）/ 下移（+1）：楼层清单换位置；整套里这一层整块移到另一层前面 / 后面 */
export function moveFloor(project, floorId, delta) {
  const floors = project.floors || [];
  const i = floors.findIndex((f) => f.id === floorId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= floors.length) return project;
  const nextFloors = [...floors];
  [nextFloors[i], nextFloors[j]] = [nextFloors[j], nextFloors[i]];
  let slides = project.slides || [];
  const mine = floorBlock(slides, floorId);
  const other = floorBlock(slides, floors[j].id);
  if (mine && other) {
    const block = slides.slice(mine.start, mine.end);
    const rest = [...slides.slice(0, mine.start), ...slides.slice(mine.end)];
    const o = floorBlock(rest, floors[j].id);
    const at = delta < 0 ? o.start : o.end;
    slides = [...rest.slice(0, at), ...block, ...rest.slice(at)];
  }
  return { ...project, floors: nextFloors, slides };
}
