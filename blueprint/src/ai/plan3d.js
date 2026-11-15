// 3D 户型图（新流程）：图纸 → AI 先框出墙、门窗、柜子家具 → 设计师在图纸上拖动修正 → 程序按坐标出图。
// 位置由坐标决定，AI 只负责「先框一遍」；这里放：存在楼层上的 plan3d 数据（纯函数修改）、AI 框图的两次看图、出图用的场景参数。
// 几何、画法、整理 AI 回复的规则都在 src/plan3d/（ES5、无依赖，以后原样给 VISI 用）。

import { analyzeImage } from './gemini.js';
import { toInlineImage } from '../store/assets.js';
import { updateFloor, pickAspect, PLAN_MODELS, PLAN_EDGE } from './dollhouse.js';
import { buildScene, recommendCorner } from '../plan3d/scene.js';
import { openingRect, roomRects } from '../plan3d/geometry.js';
import { renderGeo, transformGeo } from '../plan3d/edit.js';
import { looseJson, parseStructure, parseItems, buildGeo, roomsForPrompt, detectSummary } from '../plan3d/detect.js';
import { structurePrompt, itemsPrompt } from '../plan3d/prompt.js';
import { TEXTURE_SLOTS } from '../plan3d/palette.js';

const PLAN_MODEL_KEY = 'blueprint.planModel';
const planModels = (settings) => [settings?.modelPlan, ...PLAN_MODELS].filter(Boolean);

export const VIEW_IDS = ['top', 'persp', 'iso'];
export const WALL_HEIGHTS = [400, 650, 1100];
export const DEFAULT_VIEW = { view: 'top', corner: 'se', wallMm: 650, cab: 'cut', hung: 'ghost' };
const SLOT_IDS = TEXTURE_SLOTS.map((s) => s.id);

// ---------------------------------------------------------------------------
// 楼层上的 plan3d（纯函数，不可变更新）
//   { v:1, planSrc, geo, detected, detect:{ at, partial, notes }, view:{ view, corner, wallMm, cab, hung },
//     tex:{ on, floor|cabinet|worktop|fabric:{ src, from:'material'|'upload'|'ai', materialId? } } }
// ---------------------------------------------------------------------------

/** 这层楼当前图纸对应的 plan3d；图纸换过（planSrc 对不上）= 没有 */
export function floorPlan3d(floor) {
  const p3 = floor?.plan3d;
  return p3 && floor.plan && p3.planSrc === floor.plan ? p3 : null;
}

/** 合并更新 plan3d（没有就新建，绑定到当前图纸）；patch = null → 清掉 */
export const patchFloorPlan3d = (project, floorId, patch) =>
  updateFloor(project, floorId, (f) => {
    if (patch === null) return { ...f, plan3d: null };
    const cur = floorPlan3d(f) || { v: 1, planSrc: f.plan || null };
    return { ...f, plan3d: { ...cur, ...patch } };
  });

/** 存坐标（编辑器每次松手都存）。extra：{ detected, detect } —— AI 框完那一次带上原始结果 */
export const setPlan3dGeo = (project, floorId, geo, extra) => patchFloorPlan3d(project, floorId, { geo: geo || null, ...(extra || {}) });

/** 视角选项（合并；不认识的值丢掉） */
export function normalizeView(view) {
  const v = { ...DEFAULT_VIEW, ...(view || {}) };
  return {
    view: VIEW_IDS.includes(v.view) ? v.view : 'top',
    corner: ['se', 'sw', 'ne', 'nw'].includes(v.corner) ? v.corner : 'se',
    wallMm: WALL_HEIGHTS.includes(v.wallMm) ? v.wallMm : 650,
    cab: v.cab === 'full' ? 'full' : 'cut',
    hung: v.hung === 'hide' ? 'hide' : 'ghost',
  };
}

export const setPlan3dView = (project, floorId, patch) =>
  updateFloor(project, floorId, (f) => {
    const cur = floorPlan3d(f);
    if (!cur) return f;
    return { ...f, plan3d: { ...cur, view: normalizeView({ ...cur.view, ...patch }) } };
  });

/** 某个槽位的贴图：tex = { src, from, materialId? }；null = 清掉（回到默认画法） */
export const setPlan3dTexture = (project, floorId, slot, tex) =>
  updateFloor(project, floorId, (f) => {
    const cur = floorPlan3d(f);
    if (!cur || !SLOT_IDS.includes(slot)) return f;
    const next = { on: true, ...(cur.tex || {}) };
    if (tex?.src) next[slot] = { src: tex.src, from: tex.from || 'upload', ...(tex.materialId ? { materialId: tex.materialId } : {}) };
    else delete next[slot];
    return { ...f, plan3d: { ...cur, tex: next } };
  });

export const setPlan3dTexturesOn = (project, floorId, on) =>
  updateFloor(project, floorId, (f) => {
    const cur = floorPlan3d(f);
    return cur ? { ...f, plan3d: { ...cur, tex: { ...(cur.tex || {}), on: !!on } } } : f;
  });

/** 用得上的贴图 { 槽位: src }（开关关着 = 空） */
export function activeTextures(plan3d) {
  const tex = plan3d?.tex;
  const out = {};
  if (!tex || tex.on === false) return out;
  SLOT_IDS.forEach((id) => {
    if (tex[id]?.src) out[id] = tex[id].src;
  });
  return out;
}

/**
 * 重新框选范围后把坐标带到新图上。裁剪框是相对原图的 { x, y, w, h }（0–1），size 是裁出来那张图的像素大小。
 * 新范围以外的东西丢掉；没有可带的 = null。
 */
export function recropGeo(geo, oldCrop, oldSize, newCrop, newSize) {
  if (!geo || !oldSize?.w || !oldSize?.h || !newSize?.w || !newSize?.h) return null;
  const a = oldCrop || { x: 0, y: 0, w: 1, h: 1 };
  const b = newCrop || { x: 0, y: 0, w: 1, h: 1 };
  if (!(a.w > 0 && a.h > 0 && b.w > 0 && b.h > 0)) return null;
  const sx = ((a.w / oldSize.w) / b.w) * newSize.w;
  const sy = ((a.h / oldSize.h) / b.h) * newSize.h;
  const dx = ((a.x - b.x) / b.w) * newSize.w;
  const dy = ((a.y - b.y) / b.h) * newSize.h;
  const moved = transformGeo(geo, sx, sy, dx, dy);
  const inside = (box) => {
    const cx = (box[0] + box[2]) / 2;
    const cy = (box[1] + box[3]) / 2;
    return cx >= 0 && cy >= 0 && cx <= newSize.w && cy <= newSize.h;
  };
  const r2 = (n) => Math.round(n * 100) / 100; // 换算后的小数尾巴抹掉
  const rooms = (moved.rooms || [])
    .map((r) => ({ ...r, rects: (r.rects || []).filter(inside).map((b) => b.map(r2)) }))
    .filter((r) => r.rects.length);
  if (!rooms.length) return null;
  const items = (moved.items || []).filter((it) => it.box && inside(it.box)).map((it) => ({ ...it, box: it.box.map(r2) }));
  const next = { ...moved, source: { w: newSize.w, h: newSize.h }, wallT: r2(moved.wallT || 0), rooms, items };
  const rects = roomRects(next);
  next.openings = (moved.openings || [])
    .map((o) => ({ ...o, a: r2(o.a), b: r2(o.b), ...(typeof o.at === 'number' ? { at: r2(o.at) } : {}) }))
    .filter((o) => openingRect(rects, o, next.wallT || 0));
  return next;
}

/** 把坐标（连同视角、贴图）带到新裁的图上；带不了就清掉 */
export const carryPlan3d = (project, floorId, { planSrc, geo }) =>
  updateFloor(project, floorId, (f) => {
    const cur = f.plan3d;
    if (!cur || !geo || !planSrc) return { ...f, plan3d: null };
    return { ...f, plan3d: { ...cur, planSrc, geo, detected: null } };
  });

// ---------------------------------------------------------------------------
// 出图参数（纯函数）
// ---------------------------------------------------------------------------

/** 界面上的视角选项 → buildScene 的参数 */
export function sceneOptions(view) {
  const v = normalizeView(view);
  if (v.view !== 'iso') return { view: v.view, hung: v.hung };
  const full = v.cab === 'full';
  return { view: 'iso', corner: v.corner, wallMm: v.wallMm, cutMm: full ? Infinity : undefined, hung: full ? 'solid' : v.hung };
}

const ratioOf = (aspect) => {
  const [w, h] = aspect.split(':').map(Number);
  return w / h;
};

/**
 * 按坐标和视角排出场景；画布比例取出图模型支持的比例里最接近的（和提案页的版式一致）。
 * 落在房间外的东西不参与出图（否则整张图会被它撑大、房间变小）。
 * @param {{ longEdge?:number }} [extra]
 */
export function planScene(geo, view, extra) {
  const g = renderGeo(geo);
  const opts = { ...sceneOptions(view), ...(extra || {}) };
  const natural = buildScene(g, opts);
  return buildScene(g, { ...opts, ratio: ratioOf(pickAspect(natural.w, natural.h)) });
}

/** 第一次出图用的视角：斜角立体的镜头角取「挡得最少」的那个 */
export const defaultView = (geo) => normalizeView({ ...DEFAULT_VIEW, corner: geo ? recommendCorner(renderGeo(geo)) : 'se' });

// ---------------------------------------------------------------------------
// AI 框图（看图模型，两次看图：先墙和门窗，再柜子家具）
// ---------------------------------------------------------------------------

const inline = ({ mimeType, base64 }) => ({ mimeType, base64 });

async function look(settings, prompt, img) {
  return analyzeImage(settings, prompt, inline(img), { json: true, models: planModels(settings), cacheKey: PLAN_MODEL_KEY });
}

/**
 * 让 AI 在图纸上先框一遍。
 * @param {{ settings:object, planBlob:Blob, size:{w:number,h:number}, hints?:object, onStage?:(stage:'structure'|'items')=>void }} opts
 *   size = 图纸（floor.plan）的像素大小 —— 坐标按它算
 * @returns {Promise<{ geo:object, notes:string[], partial:boolean, summary:object, raw:{ structure:string, items:string }, itemsError:string }>}
 *   第二次看图失败（限流 / 回复看不懂）不算整体失败：墙和门窗照样给，家具留给设计师自己画或重试
 */
export async function detectPlanGeometry({ settings, planBlob, size, hints, onStage }) {
  if (!settings?.apiKey) {
    const err = new Error('还没有配置 API key，点右上角设置。');
    err.keyProblem = true;
    throw err;
  }
  const img = await toInlineImage(planBlob, PLAN_EDGE);
  onStage?.('structure');
  const text1 = await look(settings, structurePrompt(), img);
  const j1 = looseJson(text1);
  const structure = parseStructure(j1.value, size);

  onStage?.('items');
  let text2 = '';
  let itemsError = '';
  let j2 = { value: null, partial: false };
  try {
    text2 = await look(settings, itemsPrompt(roomsForPrompt(structure, size)), img);
    j2 = looseJson(text2);
  } catch (e) {
    if (e.keyProblem) throw e;
    itemsError = e.message || String(e);
  }
  const items = parseItems(j2.value, size);
  const built = buildGeo(structure, items, size, hints || {});
  return {
    geo: built.geo,
    notes: [...(structure.notes || []), ...(items.notes || []), ...(built.notes || [])],
    partial: !!(j1.partial || j2.partial || built.partial),
    summary: detectSummary(built.geo),
    raw: { structure: String(text1 || ''), items: String(text2 || '') },
    itemsError,
  };
}

/**
 * 只重新识别柜子家具（墙和门窗用设计师改好的）。返回新的 items，由调用方决定替换。
 * @returns {Promise<{ items:object[], notes:string[], partial:boolean, raw:string }>}
 */
export async function detectPlanItems({ settings, planBlob, geo, onStage }) {
  if (!settings?.apiKey) {
    const err = new Error('还没有配置 API key，点右上角设置。');
    err.keyProblem = true;
    throw err;
  }
  const size = geo.source;
  const img = await toInlineImage(planBlob, PLAN_EDGE);
  const rects = roomRects(geo);
  // 把设计师确认的房间和门窗还原成「AI 第一次看图的结果」，再走同一套整理规则
  const structure = {
    rooms: (geo.rooms || []).map((r) => ({ name: r.name || '', rects: r.rects || [] })),
    openings: (geo.openings || []).map((o) => ({ type: o.type, box: openingRect(rects, o, geo.wallT || 0) })).filter((o) => o.box),
    columns: [],
    wallT: geo.wallT || null,
    dimension: null,
    notes: [],
  };
  onStage?.('items');
  const text = await look(settings, itemsPrompt(roomsForPrompt(structure, size)), img);
  const j = looseJson(text);
  const items = parseItems(j.value, size);
  const built = buildGeo(structure, items, size, { mmPerPx: geo.mmPerPx });
  return { items: built.geo.items || [], notes: [...(items.notes || []), ...(built.notes || [])], partial: !!j.partial, raw: String(text || '') };
}
