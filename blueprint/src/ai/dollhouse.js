// 「3D 全屋立体图」—— 平面布置图 + 3–4 张效果图 → 照片级等轴测剖切鸟瞰（像 The Sims 的建造视图）。
// 提示词在 prompts.js；这里负责：平面图转图片（PDF 用 pdf.js 渲染第一页）、调出图模型（Pro 优先，失败回退）、
// 以及对项目的纯函数修改（楼层平面图 / 立体图历史 / 插入提案页），便于 Node 测试。

import { generateImage } from './gemini.js';
import { toInlineImage, toJpegBlob, dataUrlToBlob, canvasToBlob } from '../store/assets.js';
import { uid } from '../engine/model.js';
import { dollhousePromptText, resolveAngle, DOLLHOUSE_ANGLES } from './prompts.js';

export { DOLLHOUSE_ANGLES, resolveAngle };

export const MAX_REFS = 4;
export const PLAN_EDGE = 2000; // 平面图最长边
export const REF_EDGE = 1280; // 参考效果图最长边

/** 项目还没有楼层时用的「全屋」虚拟楼层（第一次存平面图 / 立体图时才真正写进 project.floors） */
export const ALL_FLOOR_ID = 'floor-all';
export const ALL_FLOOR = { id: ALL_FLOOR_ID, zh: '全屋', en: 'WHOLE HOME', image: null };

// ---------------------------------------------------------------------------
// 提示词
// ---------------------------------------------------------------------------

/** 楼层 → 提示词里的名字：「GROUND FLOOR (一楼)」 */
export function floorNameOf(floor) {
  if (!floor) return 'floor';
  if (typeof floor === 'string') return floor.trim() || 'floor';
  const en = (floor.en || '').trim();
  const zh = (floor.zh || '').trim();
  if (en && zh) return `${en.toUpperCase()} (${zh})`;
  return en.toUpperCase() || zh || 'floor';
}

/** 空间清单 → 「客厅 (LIVING AREA)」 */
const roomLabel = (r) => {
  if (!r) return '';
  if (typeof r === 'string') return r.trim();
  const zh = (r.zh || r.room || '').trim();
  const en = (r.en || r.roomEn || '').trim().toUpperCase();
  return zh && en ? `${zh} (${en})` : zh || en;
};

/**
 * @param {{ floor:object|string, angle?:string, style?:string, roomsList?:Array<string|{zh,en}>, refCount?:number }} args
 * @returns {string} 英文提示词
 */
export function buildDollhousePrompt({ floor, angle, style = '', roomsList = [], refCount = 0 } = {}) {
  const wholeHome = !floor || (typeof floor === 'object' && floor.id === ALL_FLOOR_ID);
  const rooms = [...new Set((roomsList || []).map(roomLabel).filter(Boolean))].slice(0, 16);
  return dollhousePromptText({
    floorName: floorNameOf(floor),
    angle: resolveAngle(angle),
    style,
    rooms,
    refCount: Math.max(0, Math.min(MAX_REFS, Number(refCount) || 0)),
    wholeHome,
  });
}

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
 * 平面布置图（图片或 PDF）→ JPEG Blob。图片：最长边压到 ≤ 2000（透明底垫白）；PDF：渲染指定页（默认第 1 页）约 2000px 宽。
 * @param {File|Blob} fileOrBlob
 * @param {{ page?:number, maxEdge?:number, onInfo?:(info:{pages:number,page:number})=>void }} opts
 * @returns {Promise<Blob>}
 */
export async function renderPlanToImage(fileOrBlob, { page = 1, maxEdge = PLAN_EDGE, onInfo } = {}) {
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
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
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

// ---------------------------------------------------------------------------
// 出图
// ---------------------------------------------------------------------------

/** 这种错误换模型重试也没用（key 问题） */
const keyProblem = (e) => /API key|还没有配置/i.test(e?.message || '');

/**
 * 生成一张立体图：输入 = [平面图, ...最多 4 张参考效果图]，16:9。
 * 先用 settings.model3d（Pro 图像模型），不可用 / 额度用完等失败时自动用 settings.model 再试一次。
 * @param {{ settings, planBlob:Blob, refSrcs?:Array<string|Blob>, floor, angle?, style?, roomsList?,
 *           onWait?:(sec:number, attempt:number)=>void, onFallback?:(model:string, err:Error)=>void }} args
 * @returns {Promise<Blob>} JPEG
 */
export async function generateDollhouse({ settings, planBlob, refSrcs = [], floor, angle, style, roomsList, onWait, onFallback }) {
  if (!settings?.apiKey) throw new Error('还没有配置 API key，点右上角设置。');
  if (!planBlob) throw new Error('先上传这一层的平面布置图');

  const plan = await toInlineImage(planBlob, PLAN_EDGE);
  const refs = [];
  for (const src of (refSrcs || []).slice(0, MAX_REFS)) {
    try {
      refs.push(await toInlineImage(src, REF_EDGE));
    } catch {
      /* 某张参考图丢了就跳过 */
    }
  }
  const inputs = [plan, ...refs].map(({ mimeType, base64 }) => ({ mimeType, base64 }));
  const prompt = buildDollhousePrompt({ floor, angle, style, roomsList, refCount: refs.length });

  const primary = settings.model3d || settings.model;
  let dataUrl;
  try {
    dataUrl = await generateImage({ ...settings, model: primary }, prompt, inputs, '16:9', onWait);
  } catch (e) {
    if (!settings.model || primary === settings.model || keyProblem(e)) throw e;
    onFallback?.(settings.model, e);
    dataUrl = await generateImage({ ...settings }, prompt, inputs, '16:9', onWait);
  }
  const blob = await dataUrlToBlob(dataUrl);
  return await toJpegBlob(blob, { quality: 0.92 });
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

export const setFloorPlan = (project, floorId, src) => updateFloor(project, floorId, (f) => ({ ...f, plan: src || null }));

export const setFloorImage = (project, floorId, src) => updateFloor(project, floorId, (f) => ({ ...f, image: src || null }));

/** 立体图历史：追加到末尾（界面倒序显示 = 最新在前） */
export const addRender3d = (project, floorId, src) =>
  updateFloor(project, floorId, (f) => ({ ...f, renders3d: [...(f.renders3d || []).filter((s) => s !== src), src] }));

export const removeRender3d = (project, floorId, src) =>
  updateFloor(project, floorId, (f) => ({ ...f, renders3d: (f.renders3d || []).filter((s) => s !== src) }));

/** 某层可用作参考的效果图页（启用、有图、非立体图）；「全屋」= 全部 */
export function floorViewSlides(project, floorId) {
  return (project?.slides || []).filter(
    (s) => s.kind === 'view' && s.enabled !== false && s.tag !== '3d' && s.image && (floorId === ALL_FLOOR_ID || s.floorId === floorId)
  );
}

/** 某层的空间清单 [{ zh, en }]（按出现顺序去重） */
export function floorRoomsList(project, floorId) {
  const seen = new Set();
  const out = [];
  for (const s of floorViewSlides(project, floorId)) {
    const zh = (s.room || '').trim();
    if (!zh || seen.has(zh)) continue;
    seen.add(zh);
    out.push({ zh, en: (s.roomEn || '').trim() });
  }
  return out;
}

/** 默认参考图：前 4 个不同空间各取第一张，不够再按顺序补 */
export function defaultRefIds(project, floorId, max = MAX_REFS) {
  const views = floorViewSlides(project, floorId);
  const picked = [];
  const rooms = new Set();
  for (const s of views) {
    const r = (s.room || '').trim();
    if (picked.length >= max) break;
    if (rooms.has(r)) continue;
    rooms.add(r);
    picked.push(s.id);
  }
  for (const s of views) {
    if (picked.length >= max) break;
    if (!picked.includes(s.id)) picked.push(s.id);
  }
  return picked;
}

/** 该层已有的立体图页 */
export const findDollhouseSlides = (project, floorId) =>
  (project?.slides || []).filter((s) => s.kind === 'view' && s.tag === '3d' && (s.floorId || ALL_FLOOR_ID) === floorId);

export function makeDollhouseSlide(floor, image, id = uid('s')) {
  const whole = !floor || floor.id === ALL_FLOOR_ID;
  return {
    id,
    kind: 'view',
    enabled: true,
    tag: '3d',
    floorId: floor?.id || ALL_FLOOR_ID,
    layout: 'full',
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
 * @param {{ floorId:string, image:string, mode?:'replace'|'add', id?:string }} opts
 *   replace：已有该层立体图页 → 只换图（保留设计师改过的文字和位置）；add：再加一页（插在已有立体图页之后）
 */
export function insertDollhouseSlide(project, { floorId, image, mode = 'replace', id } = {}) {
  const p = ensureFloor(project, floorId);
  const slides = p.slides || [];
  const floor = (p.floors || []).find((f) => f.id === floorId) || (floorId === ALL_FLOOR_ID ? ALL_FLOOR : { id: floorId });
  const existing = findDollhouseSlides(p, floorId);
  if (existing.length && mode === 'replace') {
    const target = existing[0].id;
    return { ...p, slides: slides.map((s) => (s.id === target ? { ...s, image, enabled: true } : s)) };
  }
  const slide = makeDollhouseSlide(floor, image, id);
  const at = existing.length
    ? slides.findIndex((s) => s.id === existing[existing.length - 1].id) + 1
    : dollhouseInsertIndex(slides, floorId);
  return { ...p, slides: [...slides.slice(0, at), slide, ...slides.slice(at)] };
}

/** 该层是否有楼层章节页（「设为章节页背景」只在有章节页时显示） */
export const hasFloorSlide = (project, floorId) => (project?.slides || []).some((s) => s.kind === 'floor' && s.floorId === floorId);
