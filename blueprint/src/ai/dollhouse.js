// 「3D 户型图」的公共部分 —— 平面图转图片（PDF 用 pdf.js 渲染）、找图纸范围、裁剪、材质样本（出图模型），
// 以及对项目的纯函数修改（楼层平面图 / 立体图历史 / 插入提案页），便于 Node 测试。
// 坐标、AI 框图、出图在 ./plan3d.js 和 src/plan3d/；提示词在 prompts.js 和 src/plan3d/prompt.js。

import { generateImage, analyzeImage } from './gemini.js';
import { extractJson } from './polish.js';
import { toInlineImage, toJpegBlob, dataUrlToBlob, canvasToBlob } from '../store/assets.js';
import { uid } from '../engine/model.js';
import { planRegionPrompt, swatchPromptText, resolveScope, DOLLHOUSE_VIEWS, PLAN_SCOPES } from './prompts.js';
import { PDFJS_DOC_OPTIONS } from '../import/pdfjsAssets.js';

export { DOLLHOUSE_VIEWS, PLAN_SCOPES, resolveScope };

export const PLAN_SOURCE_EDGE = 3200; // 上传的原图最长边（裁剪之后还要够清楚）
export const PLAN_EDGE = 2000; // 发给 AI 的平面图最长边
export const CROP_MIN_EDGE = 1600; // 裁出来的平面图不到这么大就放大
export const LOOK_EDGE = 1280; // 找图纸范围时的图片最长边
/** 满版大图要这么宽（16:9 = 1.78）；更方的立体图插入提案时用自动版式（图文页，整张图不被裁） */
export const WIDE_RATIO = 1.6;

/** AI 框图优先用的模型（更强的空间理解）；不可用时自动回退到 gemini.js 的候选列表 */
export const PLAN_MODELS = ['gemini-3-pro-preview', 'gemini-2.5-pro'];

/** 项目还没有楼层时用的「全屋」虚拟楼层（第一次存平面图 / 立体图时才真正写进 project.floors） */
export const ALL_FLOOR_ID = 'floor-all';
export const ALL_FLOOR = { id: ALL_FLOOR_ID, zh: '全屋', en: 'WHOLE HOME', image: null };

// ---------------------------------------------------------------------------
// 纯函数：输出比例、裁剪框、AI 回复解析、提示词
// ---------------------------------------------------------------------------

/** 出图模型支持的比例 */
export const ASPECTS = ['21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'];

/** 按图纸的宽高取最接近的输出比例（读不到尺寸 = 4:3） */
export function pickAspect(w, h) {
  const r = w > 0 && h > 0 ? w / h : 0;
  if (!r) return '4:3';
  let best = '4:3';
  let bestD = Infinity;
  for (const a of ASPECTS) {
    const [aw, ah] = a.split(':').map(Number);
    const d = Math.abs(Math.log(r) - Math.log(aw / ah));
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

export const FULL_BOX = { x: 0, y: 0, w: 1, h: 1 };
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const round4 = (n) => Math.round(n * 10000) / 10000;

/**
 * 裁剪框 → { x, y, w, h }（0–1，相对整张图）。
 * 认两种写法：{ x, y, w, h }（0–1）或看图模型的 [ymin, xmin, ymax, xmax]（0–1000）。太小 / 读不懂 → null。
 * @param {{ pad?:number, min?:number }} opts  pad = 四周多留一点（相对整张图）；min = 最小边长
 */
export function normalizeBox(raw, { pad = 0, min = 0.08 } = {}) {
  let x0;
  let y0;
  let x1;
  let y1;
  if (Array.isArray(raw) && raw.length === 4 && raw.every((n) => Number.isFinite(Number(n)))) {
    const [ymin, xmin, ymax, xmax] = raw.map(Number);
    const k = Math.max(ymin, xmin, ymax, xmax) > 1.5 ? 1000 : 1;
    [x0, y0, x1, y1] = [xmin / k, ymin / k, xmax / k, ymax / k];
  } else if (raw && typeof raw === 'object' && ['x', 'y', 'w', 'h'].every((key) => Number.isFinite(Number(raw[key])))) {
    x0 = Number(raw.x);
    y0 = Number(raw.y);
    x1 = x0 + Number(raw.w);
    y1 = y0 + Number(raw.h);
  } else return null;
  if (x1 < x0) [x0, x1] = [x1, x0];
  if (y1 < y0) [y0, y1] = [y1, y0];
  x0 = clamp01(x0 - pad);
  y0 = clamp01(y0 - pad);
  x1 = clamp01(x1 + pad);
  y1 = clamp01(y1 + pad);
  if (x1 - x0 < min || y1 - y0 < min) return null;
  return { x: round4(x0), y: round4(y0), w: round4(x1 - x0), h: round4(y1 - y0) };
}

/** 裁剪框的最小边长（相对整张图） */
export const MIN_CROP = 0.06;

/** 拖动 / 缩放后的新框：mode = 'move' 或把手（'n' 's' 'e' 'w' 'nw' 'ne' 'sw' 'se'）；dx、dy 相对整张图。不出界、不小于 MIN_CROP */
export function dragCropBox(start, mode, dx, dy) {
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  let { x, y, w, h } = start;
  if (mode === 'move') return { x: clamp(x + dx, 0, 1 - w), y: clamp(y + dy, 0, 1 - h), w, h };
  // 只改被拖的那条边，另一条边原样不动
  if (mode.includes('w')) {
    const right = x + w;
    x = clamp(x + dx, 0, right - MIN_CROP);
    w = right - x;
  } else if (mode.includes('e')) w = clamp(w + dx, MIN_CROP, 1 - x);
  if (mode.includes('n')) {
    const bottom = y + h;
    y = clamp(y + dy, 0, bottom - MIN_CROP);
    h = bottom - y;
  } else if (mode.includes('s')) h = clamp(h + dy, MIN_CROP, 1 - y);
  return { x, y, w, h };
}

/** 这个框基本就是整张图（不用裁） */
export const isFullBox = (box) => !box || (box.x <= 0.01 && box.y <= 0.01 && box.w >= 0.98 && box.h >= 0.98);

const cleanText = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const asObject = (v) => (Array.isArray(v) ? v.find((x) => x && typeof x === 'object' && !Array.isArray(x)) : v);

/**
 * 「找图纸范围」的回复 → { kind, roomName, drawing, mainRoom }；整层图纸 mainRoom = drawing。读不懂抛错。
 */
export function parseRegionResponse(text) {
  const obj = asObject(extractJson(text));
  if (!obj || typeof obj !== 'object') throw new Error('AI 没有认出图纸范围');
  const drawing = normalizeBox(obj.drawing, { pad: 0.012 });
  const main = normalizeBox(obj.mainRoom ?? obj.main_room, { pad: 0.015 });
  if (!drawing && !main) throw new Error('AI 没有认出图纸范围');
  const kind = obj.kind === 'floor' ? 'floor' : 'room';
  return {
    kind,
    roomName: cleanText(obj.roomName ?? obj.room_name, 60),
    drawing: drawing || FULL_BOX,
    mainRoom: kind === 'floor' ? drawing || main : main || drawing,
  };
}

/** 某个范围默认用哪个框 */
export const regionBox = (region, scope) => (region ? (resolveScope(scope) === 'room' ? region.mainRoom : region.drawing) || FULL_BOX : FULL_BOX);

// ---------------------------------------------------------------------------
// 平面图 → 图片
// ---------------------------------------------------------------------------

const isPdf = (f) => /pdf/i.test(f?.type || '') || /\.pdf$/i.test(f?.name || '');

let pdfjsPromise = null;
/** 按需加载 pdf.js（首次用到时才下载，避免拖慢首屏） */
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
      .then(([pdfjs, worker]) => {
        if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        return pdfjs;
      })
      .catch((e) => {
        pdfjsPromise = null;
        throw e;
      });
  }
  return pdfjsPromise;
}

/**
 * 平面布置图（图片或 PDF）→ JPEG Blob（原图，还没裁剪）。图片：最长边压到 ≤ 3200（透明底垫白）；PDF：渲染指定页（默认第 1 页）约 3200px 宽。
 * @param {File|Blob} fileOrBlob
 * @param {{ page?:number, maxEdge?:number, onInfo?:(info:{pages:number,page:number})=>void }} opts
 * @returns {Promise<Blob>}
 */
export async function renderPlanToImage(fileOrBlob, { page = 1, maxEdge = PLAN_SOURCE_EDGE, onInfo } = {}) {
  if (!fileOrBlob) throw new Error('没有选择平面图');
  if (!isPdf(fileOrBlob)) {
    if (fileOrBlob.type && !/^image\//i.test(fileOrBlob.type)) throw new Error('只支持图片（JPG / PNG）或 PDF 平面图');
    try {
      return await toJpegBlob(fileOrBlob, { maxEdge, quality: 0.92 });
    } catch {
      throw new Error('这张图片读不出来，换成 JPG / PNG 再试');
    }
  }

  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await fileOrBlob.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, verbosity: 0, ...PDFJS_DOC_OPTIONS }).promise;
  try {
    const n = Math.min(Math.max(1, Math.round(page) || 1), doc.numPages);
    onInfo?.({ pages: doc.numPages, page: n });
    const pg = await doc.getPage(n);
    const base = pg.getViewport({ scale: 1 });
    const scale = Math.min(maxEdge / base.width, (maxEdge * 1.5) / base.height, 8);
    const viewport = pg.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvasContext: ctx, viewport }).promise;
    pg.cleanup?.();
    let blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
    // 很长的图纸再压一次最长边
    if (Math.max(canvas.width, canvas.height) > maxEdge * 1.5) blob = await toJpegBlob(blob, { maxEdge: maxEdge * 1.5, quality: 0.92 });
    return blob;
  } finally {
    doc.destroy?.();
  }
}

/**
 * 按框裁出平面图（box 相对整张图 0–1）→ JPEG Blob，最长边 ≤ PLAN_EDGE；太小的放大到约 CROP_MIN_EDGE（最多 2 倍）。
 * @returns {Promise<Blob>}
 */
export async function cropPlan(blob, box, { maxEdge = PLAN_EDGE } = {}) {
  if (!blob) throw new Error('平面图找不到了，请重新上传');
  const b = normalizeBox(box, { min: 0.02 }) || FULL_BOX;
  const bmp = await createImageBitmap(blob);
  const sx = Math.round(b.x * bmp.width);
  const sy = Math.round(b.y * bmp.height);
  const sw = Math.max(1, Math.min(bmp.width - sx, Math.round(b.w * bmp.width)));
  const sh = Math.max(1, Math.min(bmp.height - sy, Math.round(b.h * bmp.height)));
  // 裁出来太小（从整页截图里框出一个房间）就放大到约 1600：图上的小字和细线，模型看大图读得更准
  const long = Math.max(sw, sh);
  const scale = long > maxEdge ? maxEdge / long : long < CROP_MIN_EDGE ? Math.min(2, CROP_MIN_EDGE / long) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return await canvasToBlob(canvas, 'image/jpeg', 0.92);
}

const inline = ({ mimeType, base64 }) => ({ mimeType, base64 });

// ---------------------------------------------------------------------------
// 读图（看图模型，便宜）：找图纸范围
// ---------------------------------------------------------------------------

/**
 * 在上传的整张图里找出图纸范围和主房间范围。
 * @returns {Promise<{ kind:'room'|'floor', roomName:string, drawing:object, mainRoom:object }>}
 */
export async function detectPlanRegion({ settings, blob }) {
  if (!settings?.apiKey) throw new Error('还没有配置 API key，点右上角设置。');
  const img = await toInlineImage(blob, LOOK_EDGE);
  const text = await analyzeImage(settings, planRegionPrompt(), inline(img), { json: true });
  return parseRegionResponse(text);
}

// ---------------------------------------------------------------------------
// 材质样本（出图模型）
// ---------------------------------------------------------------------------

/** 这种错误换模型重试也没用（key 问题） */
const keyProblem = (e) => /API key|还没有配置/i.test(e?.message || '');

export const MAX_SWATCH_REFS = 3;

/**
 * 「材质贴图」：让出图模型出一小块 1:1 的材质样本（它看不到户型，只看得到最多 3 张效果图作材质参考）。
 * 先用普通出图模型（便宜），失败再用高级的那个。
 * @param {{ settings, slot:'floor'|'cabinet'|'worktop'|'fabric', refSrcs?:Array<string|Blob>, hint?:string, onWait? }} args
 * @returns {Promise<Blob>} JPEG
 */
export async function generateSwatch({ settings, slot, refSrcs = [], hint = '', onWait }) {
  if (!settings?.apiKey) throw new Error('还没有配置 API key，点右上角设置。');
  const inputs = [];
  for (const src of (refSrcs || []).slice(0, MAX_SWATCH_REFS)) {
    try {
      inputs.push(inline(await toInlineImage(src, 1024)));
    } catch {
      /* 某张参考图读不出来就跳过 */
    }
  }
  const prompt = swatchPromptText({ slot, refCount: inputs.length, hint });
  const cheap = settings.model || settings.model3d;
  let dataUrl;
  try {
    dataUrl = await generateImage({ ...settings, model: cheap }, prompt, inputs, '1:1', onWait, { imageSize: '1K' });
  } catch (e) {
    if (!settings.model3d || settings.model3d === cheap || keyProblem(e)) throw e;
    dataUrl = await generateImage({ ...settings, model: settings.model3d }, prompt, inputs, '1:1', onWait, { imageSize: '1K' });
  }
  return await toJpegBlob(await dataUrlToBlob(dataUrl), { maxEdge: 1024, quality: 0.9 });
}

// ---------------------------------------------------------------------------
// 项目修改（纯函数，全部不可变更新；楼层按 id 更新）
// ---------------------------------------------------------------------------

/** 面板用的楼层列表：没有楼层 → 一个「全屋」虚拟楼层 */
export function dollhouseFloors(project) {
  const floors = project?.floors || [];
  return floors.length ? floors : [ALL_FLOOR];
}

/** 确保楼层存在（「全屋」虚拟楼层第一次用到时写进 project.floors） */
export function ensureFloor(project, floorId) {
  const floors = project.floors || [];
  if (floors.some((f) => f.id === floorId)) return project;
  if (floorId !== ALL_FLOOR_ID) return project;
  return { ...project, floors: [...floors, { ...ALL_FLOOR }] };
}

export function updateFloor(project, floorId, fn) {
  const p = ensureFloor(project, floorId);
  return { ...p, floors: (p.floors || []).map((f) => (f.id === floorId ? fn(f) : f)) };
}

// plan3d：换了图纸，按旧图纸量的坐标作废
const PLAN_FIELDS = { planSource: null, planCrop: null, planRegion: null, planScope: null, planBrief: null, plan3d: null };

/** 直接设平面图（PDF 导入自动填的那张）；src 为空 = 移除平面图，连同原图 / 裁剪框 / 清单一起清掉 */
export const setFloorPlan = (project, floorId, src) =>
  updateFloor(project, floorId, (f) => (src ? { ...f, plan: src } : { ...f, plan: null, ...PLAN_FIELDS }));

/** 新上传一张平面图（还没裁剪）：原图存 planSource，plan 先指向原图；旧的裁剪框 / 清单作废 */
export const setFloorPlanUpload = (project, floorId, src) =>
  updateFloor(project, floorId, (f) => ({ ...f, ...PLAN_FIELDS, plan: src || null, planSource: src || null }));

/** AI 认出的图纸范围 { kind, roomName, drawing, mainRoom }（重新框选时不用再认一次） */
export const setFloorRegion = (project, floorId, region) => updateFloor(project, floorId, (f) => ({ ...f, planRegion: region || null }));

/**
 * 确认裁剪：plan = 裁剪后的图（发给 AI 的那张），planSource = 原图；裁剪框或范围变了，旧清单作废。
 * @param {{ plan:string, source?:string, crop?:object, scope?:string }} opts
 */
export const setFloorPlanCrop = (project, floorId, { plan, source, crop, scope } = {}) =>
  updateFloor(project, floorId, (f) => ({
    ...f,
    plan: plan || f.plan || null,
    planSource: source || f.planSource || f.plan || null,
    planCrop: crop || null,
    planScope: resolveScope(scope),
    planBrief: null,
  }));

export const setFloorImage = (project, floorId, src) => updateFloor(project, floorId, (f) => ({ ...f, image: src || null }));

/** 立体图历史：追加到末尾（界面倒序显示 = 最新在前） */
export const addRender3d = (project, floorId, src) =>
  updateFloor(project, floorId, (f) => ({ ...f, renders3d: [...(f.renders3d || []).filter((s) => s !== src), src] }));

export const removeRender3d = (project, floorId, src) =>
  updateFloor(project, floorId, (f) => {
    const { [src]: _gone, ...info } = f.render3dInfo || {};
    return { ...f, renders3d: (f.renders3d || []).filter((s) => s !== src), ...(f.render3dInfo ? { render3dInfo: info } : {}) };
  });

/** 每张立体图的附带信息（合并更新）：新流程 { by:'plan3d', view, corner, wallMm, cab, hung, tex, at }；旧版 AI 图 { view, check, from, fixes } */
export const setRenderInfo = (project, floorId, src, patch) =>
  updateFloor(project, floorId, (f) => ({ ...f, render3dInfo: { ...(f.render3dInfo || {}), [src]: { ...(f.render3dInfo?.[src] || {}), ...patch } } }));

/** 某层可用作参考的效果图页（启用、有图、非立体图）；「全屋」= 全部 */
export function floorViewSlides(project, floorId) {
  return (project?.slides || []).filter(
    (s) => s.kind === 'view' && s.enabled !== false && s.tag !== '3d' && s.image && (floorId === ALL_FLOOR_ID || s.floorId === floorId)
  );
}

/** 该层已有的立体图页 */
export const findDollhouseSlides = (project, floorId) =>
  (project?.slides || []).filter((s) => s.kind === 'view' && s.tag === '3d' && (s.floorId || ALL_FLOOR_ID) === floorId);

/** ratio = 图片宽 / 高：够宽（≥ 1.6）才用满版；方图、竖图用自动版式（排成图文页，整张图不被裁）。不知道比例 = 满版 */
const slideLayoutFor = (ratio) => (ratio > 0 && ratio < WIDE_RATIO ? 'auto' : 'full');

export function makeDollhouseSlide(floor, image, id = uid('s'), { ratio = 0 } = {}) {
  const whole = !floor || floor.id === ALL_FLOOR_ID;
  return {
    id,
    kind: 'view',
    enabled: true,
    tag: '3d',
    floorId: floor?.id || ALL_FLOOR_ID,
    layout: slideLayoutFor(ratio),
    image,
    room: (floor?.zh || '').trim() || '全屋',
    roomEn: '3D OVERVIEW',
    subtitle: whole ? '立体图' : '全屋立体图',
    materials: [],
    notes: [],
  };
}

/** 新立体图页插在哪：该层章节页之后 → 该层第一张效果图之前 →（全屋）第一张效果图之前 → 本案材料 / 方案封面之后 → 末尾 */
export function dollhouseInsertIndex(slides, floorId) {
  const floorIdx = slides.findIndex((s) => s.kind === 'floor' && s.floorId === floorId);
  if (floorIdx >= 0) return floorIdx + 1;
  const firstView = slides.findIndex((s) => s.kind === 'view' && s.tag !== '3d' && (floorId === ALL_FLOOR_ID || s.floorId === floorId));
  if (firstView >= 0) return firstView;
  for (const kind of ['materials', 'designCover']) {
    const i = slides.findIndex((s) => s.kind === kind);
    if (i >= 0) return i + 1;
  }
  return slides.length;
}

/**
 * 把立体图放进提案。
 * @param {{ floorId:string, image:string, mode?:'replace'|'add', id?:string, ratio?:number }} opts
 *   replace：已有该层立体图页 → 只换图（保留设计师改过的文字和位置；原来是满版而新图不够宽 → 改回自动版式，免得被裁）；
 *   add：再加一页（插在已有立体图页之后）；ratio = 图片宽 / 高
 */
export function insertDollhouseSlide(project, { floorId, image, mode = 'replace', id, ratio = 0 } = {}) {
  const p = ensureFloor(project, floorId);
  const slides = p.slides || [];
  const floor = (p.floors || []).find((f) => f.id === floorId) || (floorId === ALL_FLOOR_ID ? ALL_FLOOR : { id: floorId });
  const existing = findDollhouseSlides(p, floorId);
  if (existing.length && mode === 'replace') {
    const target = existing[0].id;
    const relayout = (s) => (s.layout === 'full' && slideLayoutFor(ratio) === 'auto' ? { layout: 'auto' } : {});
    return { ...p, slides: slides.map((s) => (s.id === target ? { ...s, image, enabled: true, ...relayout(s) } : s)) };
  }
  const slide = makeDollhouseSlide(floor, image, id, { ratio });
  const at = existing.length
    ? slides.findIndex((s) => s.id === existing[existing.length - 1].id) + 1
    : dollhouseInsertIndex(slides, floorId);
  return { ...p, slides: [...slides.slice(0, at), slide, ...slides.slice(at)] };
}

/** 该层是否有楼层章节页（「设为章节页背景」只在有章节页时显示） */
export const hasFloorSlide = (project, floorId) => (project?.slides || []).some((s) => s.kind === 'floor' && s.floorId === floorId);
