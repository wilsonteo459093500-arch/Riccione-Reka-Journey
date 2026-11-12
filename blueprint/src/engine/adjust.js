// 手动调整版面：设计师在画布上把照片、文字块拖动 / 改大小，像积木一样微调。
// 调整存在 slide.adjust 里，在整套渲染的最后一步（renderDeck，fitText 之后）套到元素上 ——
// 网页预览和 PPT 导出共用同一份元素，所以「看到的就是导出的」。
//
//   slide.adjust = { [组名]: 块 { dx, dy, k } | 照片 { box?:{x,y,w,h}, view?:'whole'|{ z, cx, cy }, src? } }
//
// 组 = 一页里 edit.field 相同的元素（中英文标题是两个文字框、同一个栏位）→ 一起动。一个 slide 排成几页时
//   （材料页），第 2 页起组名带页序号：'#2:栏位'。
// 块（文字，或文字 + 色块）：dx / dy = 相对自动排版的位移（px）；k = 绕这一组左上角的缩放倍数（框、字号、字距、行高一起）。
//   存相对值：以后改了字、自动排版挪了位置，手动的偏移照样跟着。
// 照片（这一组只有一张图）：box = 照片框的位置和大小（px，绝对值）；view = 取景 ——
//   'whole' 整张显示（不裁，比例不同的地方留纸色）；{ z, cx, cy }：z = 相对「刚好铺满框」的放大倍数，
//   cx / cy = 取景中心（占原图的比例）。只改了框、没改取景：沿用自动排版的取景（水印照样留在画外）。
//   src = 取景是给哪张图定的：这个照片位换了图，旧取景自动作废，框留着。

import { SLIDE_W, SLIDE_H } from '../theme.js';
import { placeImage } from './spec.js';

export const ADJUST_LIMITS = { kMin: 0.4, kMax: 3, minBox: 40, zMax: 6 };

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const r2 = (n) => Math.round(n * 100) / 100;
const r6 = (n) => Math.round(n * 1e6) / 1e6;

/** 组名：第 1 页就是栏位名，第 2 页起带页序号 */
export const adjustKey = (pageIndex, field) => (pageIndex > 0 ? `#${pageIndex + 1}:${field}` : String(field));

const boxOfEl = (el) => (el.t === 'img' ? placeImage(el) : el);

/**
 * 这一页可以调的组（按自动排版的元素算）。
 * @param {{els:object[]}} page
 * @param {number} [pageIndex]
 * @returns {Array<{ key:string, field:string, type:'photo'|'block', box:{x,y,w,h}, indexes:number[] }>}
 *   box = 这一组的外包框（照片 = 照片框本身，contain 的图按实际画出来的范围）
 */
export function groupsOf(page, pageIndex = 0) {
  const byField = new Map();
  (page?.els || []).forEach((el, i) => {
    const field = el?.edit?.field;
    if (!field || !finite(el.x) || !finite(el.y) || !finite(el.w) || !finite(el.h)) return;
    if (!byField.has(field)) byField.set(field, []);
    byField.get(field).push(i);
  });
  const out = [];
  for (const [field, indexes] of byField) {
    const els = indexes.map((i) => page.els[i]);
    const photo = els.length === 1 && els[0].t === 'img';
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    els.forEach((el) => {
      const b = photo ? el : boxOfEl(el);
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    });
    out.push({ key: adjustKey(pageIndex, field), field, type: photo ? 'photo' : 'block', box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, indexes });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 照片取景
// ---------------------------------------------------------------------------

/** 刚好铺满框时看得见的原图范围（占原图的比例） */
function coverWindow(nat, box) {
  const A = box.w / box.h;
  const S = nat.w / nat.h;
  return S > A ? { fw: A / S, fh: 1 } : { fw: 1, fh: S / A };
}

/** 「整张显示」相当于放大多少倍（≤ 1）：再小就没有意义，要让照片更小请缩小照片框 */
export function wholeZoom(nat, box) {
  if (!nat?.w || !nat?.h || !(box?.w > 0) || !(box?.h > 0)) return 1;
  const c = coverWindow(nat, box);
  return Math.min(c.fw, c.fh);
}

/** 取景夹到合理范围：放大倍数在「整张」和 6 倍之间；看得见的范围不超出原图（比原图还大的那个方向居中） */
export function clampView(nat, box, view) {
  if (view === 'whole' || !view || !nat?.w || !nat?.h) return view === 'whole' ? 'whole' : null;
  const c = coverWindow(nat, box);
  const z = clamp(finite(view.z) ? view.z : 1, wholeZoom(nat, box), ADJUST_LIMITS.zMax);
  const fw = c.fw / z;
  const fh = c.fh / z;
  const cx = fw >= 1 ? 0.5 : clamp(finite(view.cx) ? view.cx : 0.5, fw / 2, 1 - fw / 2);
  const cy = fh >= 1 ? 0.5 : clamp(finite(view.cy) ? view.cy : 0.5, fh / 2, 1 - fh / 2);
  return { z: r6(z), cx: r6(cx), cy: r6(cy) };
}

/** 取景 → 显式裁切（占原图的比例；负值 = 这一边留白） */
export function viewCrop(nat, box, view) {
  const v = clampView(nat, box, view);
  if (!v || v === 'whole') return null;
  const c = coverWindow(nat, box);
  const fw = c.fw / v.z;
  const fh = c.fh / v.z;
  return { l: r6(v.cx - fw / 2), t: r6(v.cy - fh / 2), r: r6(1 - v.cx - fw / 2), b: r6(1 - v.cy - fh / 2) };
}

/** 自动排版给这张图的取景（'whole' = contain；没有原图尺寸 = null） */
export function autoView(el) {
  if (!el || el.t !== 'img') return null;
  if (el.fit === 'contain' && !el.crop) return 'whole';
  const nat = el.nat;
  if (!nat?.w || !nat?.h || el.fit === 'stretch') return null;
  const crop = placeImage(el).crop;
  const fw = 1 - crop.l - crop.r;
  const fh = 1 - crop.t - crop.b;
  if (!(fw > 0) || !(fh > 0)) return null;
  const c = coverWindow(nat, el);
  return { z: r6(Math.max(c.fw / fw, c.fh / fh)), cx: r6(crop.l + fw / 2), cy: r6(crop.t + fh / 2) };
}

/** 照片框夹在页面附近：不小于 40 px，至少留 40 px 在页面里 */
export function clampBox(box) {
  if (!box || ![box.x, box.y, box.w, box.h].every(finite)) return null;
  const m = ADJUST_LIMITS.minBox;
  const w = clamp(box.w, m, SLIDE_W * 2);
  const h = clamp(box.h, m, SLIDE_H * 2);
  return { x: r2(clamp(box.x, m - w, SLIDE_W - m)), y: r2(clamp(box.y, m - h, SLIDE_H - m)), w: r2(w), h: r2(h) };
}

function adjustPhoto(el, adj) {
  const box = clampBox(adj.box) || { x: el.x, y: el.y, w: el.w, h: el.h };
  const moved = box.x !== el.x || box.y !== el.y || box.w !== el.w || box.h !== el.h;
  // 取景是给某一张图定的（adj.src）：这个照片位换了另一张图，旧取景作废（新图比例不同），框留着
  const stale = adj.src && el.src && adj.src !== el.src;
  const view = !stale && (adj.view === 'whole' || (adj.view && typeof adj.view === 'object')) ? adj.view : null;
  if (!moved && !view) return el;
  const { crop: _crop, ...rest } = el;
  const next = { ...rest, ...box };
  const v = view || autoView(el);
  if (v === 'whole') return { ...next, fit: 'contain', ax: 0.5, ay: 0.5 };
  const crop = el.nat ? viewCrop(el.nat, box, v) : null;
  // 不知道原图多大：算不出取景，按原来的铺法（cover / contain）放进新框
  return crop ? { ...next, crop } : next;
}

// ---------------------------------------------------------------------------
// 块（文字 / 色块）：平移 + 绕组的左上角缩放
// ---------------------------------------------------------------------------

const half = (n) => Math.round(n * 2) / 2;

function adjustBlockEl(el, origin, dx, dy, k) {
  const map = (b) => ({ x: r2(origin.x + dx + (b.x - origin.x) * k), y: r2(origin.y + dy + (b.y - origin.y) * k), w: r2(b.w * k), h: r2(b.h * k) });
  const next = { ...el, ...map(el) };
  if (el.edit && Array.isArray(el.edit.zones)) next.edit = { ...el.edit, zones: el.edit.zones.map((z) => ({ ...z, ...map(z) })) };
  if (el.t === 'text' && k !== 1) {
    next.paras = (el.paras || []).map((p) => ({
      ...p,
      ...(typeof p.lineHeight === 'number' ? { lineHeight: r2(p.lineHeight * k) } : {}),
      runs: (p.runs || []).map((r) => ({ ...r, size: Math.max(1, half((r.size || 18) * k)), ...(r.spacing ? { spacing: r2(r.spacing * k) } : {}) })),
    }));
  }
  return next;
}

/** 块的调整值夹到合理范围；全是默认值 = null（等于没调） */
export function cleanBlockAdjust(adj) {
  if (!adj || typeof adj !== 'object') return null;
  const dx = finite(adj.dx) ? clamp(r2(adj.dx), -SLIDE_W, SLIDE_W) : 0;
  const dy = finite(adj.dy) ? clamp(r2(adj.dy), -SLIDE_H, SLIDE_H) : 0;
  const k = finite(adj.k) ? clamp(Math.round(adj.k * 1000) / 1000, ADJUST_LIMITS.kMin, ADJUST_LIMITS.kMax) : 1;
  return dx || dy || k !== 1 ? { dx, dy, k } : null;
}

/**
 * 把手动调整套到一页上。没有调整（或组名都对不上）= 原样返回同一个对象。
 * @param {{els:object[]}} page  自动排好的一页
 * @param {object|null|undefined} adjust  slide.adjust
 * @param {number} [pageIndex]  这个 slide 排出来的第几页（0 起）
 * @returns {object} 调过的页带 adjusted:true 和 autoEls（自动排版的元素，编辑器算相对位移用）
 */
export function applyAdjust(page, adjust, pageIndex = 0) {
  if (!page || !adjust || typeof adjust !== 'object') return page;
  const groups = groupsOf(page, pageIndex).filter((g) => adjust[g.key] && typeof adjust[g.key] === 'object');
  if (!groups.length) return page;
  const els = page.els.slice();
  let changed = false;
  for (const g of groups) {
    const adj = adjust[g.key];
    if (g.type === 'photo') {
      const i = g.indexes[0];
      const next = adjustPhoto(els[i], adj);
      if (next !== els[i]) {
        els[i] = next;
        changed = true;
      }
      continue;
    }
    const b = cleanBlockAdjust(adj);
    if (!b) continue;
    g.indexes.forEach((i) => {
      els[i] = adjustBlockEl(els[i], g.box, b.dx, b.dy, b.k);
    });
    changed = true;
  }
  return changed ? { ...page, els, adjusted: true, autoEls: page.els } : page;
}

// ---------------------------------------------------------------------------
// 对项目的修改（纯函数）
// ---------------------------------------------------------------------------

/** 设某一组的调整；value 为空（或等于没调）= 清掉这一组；整页都清了就去掉 adjust 字段 */
export function setAdjust(project, slideId, key, value) {
  const slides = project?.slides || [];
  const idx = slides.findIndex((s) => s.id === slideId);
  if (idx < 0 || !key) return project;
  const slide = slides[idx];
  const cur = slide.adjust || {};
  const next = { ...cur };
  const keep = value && typeof value === 'object' && Object.keys(value).length > 0;
  if (keep) next[key] = value;
  else delete next[key];
  if (!keep && !(key in cur)) return project;
  const { adjust: _old, ...rest } = slide;
  const out = Object.keys(next).length ? { ...rest, adjust: next } : rest;
  return { ...project, slides: slides.map((s, i) => (i === idx ? out : s)) };
}

/** 整页恢复自动排版 */
export function clearAdjust(project, slideId) {
  const slides = project?.slides || [];
  const idx = slides.findIndex((s) => s.id === slideId);
  if (idx < 0 || !slides[idx].adjust) return project;
  const { adjust: _old, ...rest } = slides[idx];
  return { ...project, slides: slides.map((s, i) => (i === idx ? rest : s)) };
}
