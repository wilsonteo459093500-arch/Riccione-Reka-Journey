// 手动调整版面：设计师在画布上把照片、文字块拖动 / 改大小，像积木一样微调。
// 调整存在 slide.adjust 里，在整套渲染的最后一步（renderDeck，fitText 之后）套到元素上 ——
// 网页预览和 PPT 导出共用同一份元素，所以「看到的就是导出的」。
//
//   slide.adjust = { [组名]: 块 { dx, dy, k } | 照片 { box?:{x,y,w,h}, base?:{x,y,w,h}, view?:'whole'|{ z, cx, cy }, src? } }
//
// 组 = 一页里 edit.field 相同的元素（中英文标题是两个文字框、同一个栏位）→ 一起动。一个 slide 排成几页时
//   （材料页），第 2 页起组名带页序号：'#2:栏位'。
// 块（文字，或文字 + 色块）：dx / dy = 相对自动排版的位移（px）；k = 绕这一组左上角的缩放倍数（框、字号、字距、行高一起）。
//   存相对值：以后改了字、自动排版挪了位置，手动的偏移照样跟着。
// 照片（这一组只有一张图）：box = 照片框的位置和大小（px）；base = 定这个框时自动排版给的框 ——
//   以后自动排版变了（左右对调、换了比例不同的图、换版式），手动的框按「相对自动位置的位移 + 相对自动大小的倍数」
//   跟过去，不会留在原地压住文字。view = 取景 ——
//   'whole' 整张显示（不裁，比例不同的地方留纸色）；{ z, cx, cy }：z = 相对「刚好铺满框」的放大倍数，
//   cx / cy = 取景中心（占原图的比例）。只改了框、没改取景：沿用自动排版的取景（水印照样留在画外）。
//   src = 取景是给哪张图定的：这个照片位换了图，旧取景自动作废，框留着。
// 语言：每条调整记下是在哪个语言版本里调的（lang）。中文和英文是不同的栏位、排出来的版面也不一样，
//   在华文版里调的版面套到 English / 中英版上只会动一半、叠字 —— 所以调整只对调的那个语言版本生效，
//   别的语言版本按自动排版（那一页带一条提醒）。同一组在第二个语言里再调，存在 '组名@en' 这样的键下，互不影响。
//   没有 lang 的旧数据：各语言都套用。

import { SLIDE_W, SLIDE_H } from '../theme.js';
import { placeImage } from './spec.js';
import { langOf, LANG_NAMES } from './lang.js';

export const ADJUST_LIMITS = { kMin: 0.4, kMax: 3, minBox: 40, zMax: 6 };
const LOW_RES = 1.15; // 和自动排版的低像素提醒同一条线（engine/b/design.js lowRes）

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const r2 = (n) => Math.round(n * 100) / 100;
const r6 = (n) => Math.round(n * 1e6) / 1e6;

/** 组名：第 1 页就是栏位名，第 2 页起带页序号 */
export const adjustKey = (pageIndex, field) => (pageIndex > 0 ? `#${pageIndex + 1}:${field}` : String(field));

const boxOfEl = (el) => (el.t === 'img' ? placeImage(el) : el);

// ---------------------------------------------------------------------------
// 语言：调整只对调的那个语言版本生效
// ---------------------------------------------------------------------------

const LANG_SUFFIX = /@(zh|en|bi)$/;
const isEntry = (e) => !!e && typeof e === 'object';

/** 这一组在这个语言版本里生效的调整：这个语言自己的（'组名@en'）优先；否则是没带后缀的那条 —— 只要它不是别的语言里调的 */
export function entryFor(adjust, key, lang) {
  if (!adjust) return null;
  const own = lang ? adjust[`${key}@${lang}`] : null;
  if (isEntry(own)) return own;
  const e = adjust[key];
  return isEntry(e) && (!lang || !e.lang || e.lang === lang) ? e : null;
}

/** 这一组只在别的语言版本里调过（这个语言没有自己的）→ 那个语言；否则 null */
function otherLangOf(adjust, key, lang) {
  if (entryFor(adjust, key, lang)) return null;
  const e = adjust?.[key];
  if (isEntry(e) && e.lang && e.lang !== lang) return e.lang;
  const k = Object.keys(adjust || {}).find((x) => x.startsWith(`${key}@`) && LANG_SUFFIX.test(x) && isEntry(adjust[x]));
  return k ? k.slice(key.length + 1) : null;
}

/** 这个语言版本里生效的全部调整 { 组名: 调整 }（编辑器用：别的语言里调的看作没调） */
export function adjustFor(adjust, lang) {
  const out = {};
  for (const k of Object.keys(adjust || {})) {
    const key = k.replace(LANG_SUFFIX, '');
    if (key in out) continue;
    const e = entryFor(adjust, key, lang);
    if (e) out[key] = e;
  }
  return out;
}

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

const boxOf = (b) => ({ x: b.x, y: b.y, w: b.w, h: b.h });
const sameBox = (a, b) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.w - b.w) < 0.01 && Math.abs(a.h - b.h) < 0.01;
const validBox = (b) => !!b && [b.x, b.y, b.w, b.h].every(finite) && b.w > 0 && b.h > 0;

/**
 * 照片现在的框：手动的框；自动排版给的框变了（adj.base 对不上现在的）就跟着挪 / 缩放。没调过框 = 自动的框
 * @param {{x,y,w,h}} auto  自动排版现在给这张图的框
 */
export function photoBox(auto, adj) {
  const box = clampBox(adj?.box);
  if (!box || !validBox(auto)) return boxOf(auto);
  const base = validBox(adj.base) ? adj.base : null;
  if (!base || sameBox(base, auto)) return box;
  return clampBox({ x: auto.x + (box.x - base.x), y: auto.y + (box.y - base.y), w: (auto.w * box.w) / base.w, h: (auto.h * box.h) / base.h });
}

const sameView = (a, b) =>
  a === b || (!!a && !!b && typeof a === 'object' && typeof b === 'object' && Math.abs(a.z - b.z) < 1e-4 && Math.abs(a.cx - b.cx) < 1e-4 && Math.abs(a.cy - b.cy) < 1e-4);

/**
 * 这个取景和自动的是一回事：数值一样；或者自动排版本来就整张显示（3D 户型图、Material Board），
 * 手动的取景也是「全都看得见」（在取景档拖了一下、按了方向键 —— 没有东西可挪）
 */
const sameAsAuto = (el, box, view, auto) =>
  sameView(view, auto) || (auto === 'whole' && !!view && view !== 'whole' && !!el.nat?.w && !!el.nat?.h && view.z <= wholeZoom(el.nat, box) + 1e-4);

/** 照片的手动取景（给别的图定的 = 作废）：'whole' | { z, cx, cy } | null */
function photoView(el, adj) {
  const stale = adj?.src && el.src && adj.src !== el.src;
  return !stale && (adj?.view === 'whole' || (adj?.view && typeof adj.view === 'object')) ? adj.view : null;
}

/**
 * 照片的调整值整理干净：框和自动的一样 → 不存框；取景和自动的一样（或是给别的图定的）→ 不存取景；都没有 = null
 * @param {object} el  自动排版的这张图
 */
export function cleanPhotoAdjust(adj, el) {
  if (!adj || typeof adj !== 'object' || !el) return null;
  const auto = boxOf(el);
  const box = photoBox(auto, adj);
  const out = {};
  if (!sameBox(box, auto)) {
    out.box = box;
    out.base = { x: r2(auto.x), y: r2(auto.y), w: r2(auto.w), h: r2(auto.h) };
  }
  const view = photoView(el, adj);
  const v = view && view !== 'whole' && el.nat ? clampView(el.nat, box, view) : view;
  if (v && !sameAsAuto(el, box, v, autoView(el))) {
    out.view = v;
    if (el.src) out.src = el.src;
  }
  return out.box || out.view ? out : null;
}

function adjustPhoto(el, adj) {
  if (!validBox(el)) return el;
  const box = photoBox(el, adj);
  const moved = !sameBox(box, el);
  // 取景是给某一张图定的（adj.src）：这个照片位换了另一张图，旧取景作废（新图比例不同），框留着
  const auto = autoView(el);
  const view0 = photoView(el, adj);
  const view = view0 && !sameAsAuto(el, box, view0, auto) ? view0 : null;
  if (!moved && !view) return el;
  const { crop: _crop, ...rest } = el;
  const next = moved ? { ...rest, ...box } : rest;
  const v = view || auto;
  // 整张显示：用户选的 → 居中；自动排版本来就是整张（3D 户型图）→ 保持它原来靠哪边
  if (v === 'whole') return view ? { ...next, fit: 'contain', ax: 0.5, ay: 0.5 } : { ...next, fit: 'contain' };
  const crop = el.nat ? viewCrop(el.nat, next, v) : null;
  // 不知道原图多大：算不出取景，按原来的铺法（cover / contain / 原来的裁切）放进新框
  return crop ? { ...next, crop } : el.crop ? { ...next, crop: el.crop } : next;
}

/** 手动取景把照片放大了多少倍（原图 1 像素占页面几像素）；算不出 = 0 */
function photoScale(el) {
  const nat = el?.nat;
  if (!nat?.w || !nat?.h || !validBox(el)) return 0;
  if (el.fit === 'contain' && !el.crop) return Math.min(el.w / nat.w, el.h / nat.h);
  const crop = placeImage(el).crop;
  const fw = 1 - crop.l - crop.r;
  const fh = 1 - crop.t - crop.b;
  return fw > 0 && fh > 0 ? Math.max(el.w / (nat.w * fw), el.h / (nat.h * fh)) : 0;
}

/** 压在照片上的托字暗渐变（name:'shade'）：照片框变了，跟着照片框一起挪 / 缩放 */
function followPhoto(els, from, to) {
  const sx = to.w / from.w;
  const sy = to.h / from.h;
  let hit = false;
  els.forEach((el, i) => {
    if (el?.name !== 'shade' || !validBox(el)) return;
    if (el.x < from.x - 1 || el.y < from.y - 1 || el.x + el.w > from.x + from.w + 1 || el.y + el.h > from.y + from.h + 1) return;
    els[i] = { ...el, x: r2(to.x + (el.x - from.x) * sx), y: r2(to.y + (el.y - from.y) * sy), w: r2(el.w * sx), h: r2(el.h * sy) };
    hit = true;
  });
  return hit;
}

// ---------------------------------------------------------------------------
// 块（文字 / 色块）：平移 + 绕组的左上角缩放
// ---------------------------------------------------------------------------

const half = (n) => Math.round(n * 2) / 2;

function adjustBlockEl(el, origin, dx, dy, k) {
  const map = (b) => ({ x: r2(origin.x + dx + (b.x - origin.x) * k), y: r2(origin.y + dy + (b.y - origin.y) * k), w: r2(b.w * k), h: r2(b.h * k) });
  const next = { ...el, ...map(el) };
  if (el.edit && Array.isArray(el.edit.zones)) next.edit = { ...el.edit, zones: el.edit.zones.map((z) => (z && typeof z === 'object' ? { ...z, ...map(z) } : z)) };
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
 * 块的调整值按这一组的外包框再夹一次：缩放后的块至少留 40 px 在页面里（拖出页面外就找不回来了）
 * @param {{x,y,w,h}} box  这一组自动排版的外包框
 * @returns {{dx,dy,k}|null}
 */
export function clampBlock(box, adj) {
  const b = cleanBlockAdjust(adj);
  if (!b || !validBox(box)) return b;
  const m = ADJUST_LIMITS.minBox;
  const dx = r2(clamp(b.dx, m - box.w * b.k - box.x, SLIDE_W - m - box.x));
  const dy = r2(clamp(b.dy, m - box.h * b.k - box.y, SLIDE_H - m - box.y));
  return dx || dy || b.k !== 1 ? { dx, dy, k: b.k } : null;
}

/**
 * 把手动调整套到一页上。没有调整（或组名都对不上）= 原样返回同一个对象。
 * @param {{els:object[]}} page  自动排好的一页
 * @param {object|null|undefined} adjust  slide.adjust
 * @param {number} [pageIndex]  这个 slide 排出来的第几页（0 起）
 * @param {'zh'|'en'|'bi'|null} [lang]  现在渲染的语言版本：只套用在这个语言里调的（和没记语言的旧数据）；不给 = 都套用
 * @returns {object} 调过的页带 adjusted:true 和 autoEls（自动排版的元素，编辑器算相对位移用）
 */
export function applyAdjust(page, adjust, pageIndex = 0, lang = null) {
  if (!page || !adjust || typeof adjust !== 'object') return page;
  const all = groupsOf(page, pageIndex);
  const picked = new Map(all.map((g) => [g.key, entryFor(adjust, g.key, lang)]));
  const groups = all.filter((g) => picked.get(g.key));
  // 这一页的版面是在别的语言版本里调的：这个语言版本按自动排版，提醒一下
  const other = lang ? all.map((g) => otherLangOf(adjust, g.key, lang)).find(Boolean) : null;
  const warned = (pg) =>
    other ? { ...pg, warnings: [...(pg.warnings || []), `这一页的版面是在${LANG_NAMES[other] || other}版里手动调的，${LANG_NAMES[lang] || lang}版按自动排版 —— 要调请在这个语言版本里再调一次`] } : pg;
  if (!groups.length) return warned(page);
  const els = page.els.slice();
  let changed = false;
  let blurry = 0;
  for (const g of groups) {
    const adj = picked.get(g.key);
    if (g.type === 'photo') {
      const i = g.indexes[0];
      const el = els[i];
      const next = adjustPhoto(el, adj);
      if (next !== el) {
        els[i] = next;
        changed = true;
        if (!sameBox(next, el)) followPhoto(els, el, next);
        // 手动放大过头会发虚：自动排版最多放大到 1.15 倍，手动的不拦，但要提醒
        const scale = photoScale(next);
        if (scale > LOW_RES && scale > photoScale(el) * 1.02) blurry = Math.max(blurry, scale);
      }
      continue;
    }
    const b = clampBlock(g.box, adj);
    if (!b) continue;
    g.indexes.forEach((i) => {
      els[i] = adjustBlockEl(els[i], g.box, b.dx, b.dy, b.k);
    });
    changed = true;
  }
  if (!changed) return warned(page);
  const out = warned({ ...page, els, adjusted: true, autoEls: page.els });
  if (blurry) out.warnings = [...(out.warnings || []), `手动取景把照片放大了 ${blurry.toFixed(1)} 倍，会发虚：缩小一点，或换高清图`];
  return out;
}

// ---------------------------------------------------------------------------
// 对项目的修改（纯函数）
// ---------------------------------------------------------------------------

/**
 * 设某一组的调整；value 为空（或等于没调）= 清掉这一组；整页都清了就去掉 adjust 字段。
 * 记下是在哪个语言版本里调的；这一组已经在别的语言里调过 → 存在 '组名@语言' 下，两边互不影响
 */
export function setAdjust(project, slideId, key, value) {
  const slides = project?.slides || [];
  const idx = slides.findIndex((s) => s.id === slideId);
  if (idx < 0 || !key) return project;
  const slide = slides[idx];
  const cur = slide.adjust || {};
  const lang = langOf(project);
  const own = `${key}@${lang}`;
  const base = cur[key];
  const target = own in cur || (isEntry(base) && base.lang && base.lang !== lang) ? own : key;
  const next = { ...cur };
  const keep = value && typeof value === 'object' && Object.keys(value).length > 0;
  if (keep) next[target] = { ...value, lang };
  else delete next[target];
  if (!keep && !(target in cur)) return project;
  const { adjust: _old, ...rest } = slide;
  const out = Object.keys(next).length ? { ...rest, adjust: next } : rest;
  return { ...project, slides: slides.map((s, i) => (i === idx ? out : s)) };
}

const keyPage = (key) => {
  const m = /^#(\d+):/.exec(key);
  return m ? Number(m[1]) - 1 : 0;
};

/**
 * 恢复自动排版：pageIndex 给了 = 只清这个 slide 排出来的那一页（材料页会排成几页）；不给 = 整个 slide。
 * lang 给了 = 只清这个语言版本里生效的（别的语言版本里调的不动）
 */
export function clearAdjust(project, slideId, pageIndex = null, lang = null) {
  const slides = project?.slides || [];
  const idx = slides.findIndex((s) => s.id === slideId);
  if (idx < 0 || !slides[idx].adjust) return project;
  const { adjust, ...rest } = slides[idx];
  const gone = ([k, e]) => {
    if (pageIndex !== null && keyPage(k) !== pageIndex) return false;
    const of = (LANG_SUFFIX.exec(k) || [])[1] || (isEntry(e) && e.lang) || null;
    return !lang || !of || of === lang;
  };
  const kept = Object.fromEntries(Object.entries(adjust).filter((x) => !gone(x)));
  if (Object.keys(kept).length === Object.keys(adjust).length) return project;
  const out = Object.keys(kept).length ? { ...rest, adjust: kept } : rest;
  return { ...project, slides: slides.map((s, i) => (i === idx ? out : s)) };
}

/**
 * 丢掉某个列表（notes / materials…）按序号记的调整（'notes.1.text'、'#2:materials.0'）—— 序号对到别的条目上就不能再用
 * @param {object} slide
 * @param {string} listName
 * @param {(index:number) => boolean} [keep]  给了 = 这些序号的留着（条目没挪位置）
 * @returns {object} 没有要丢的 = 原样返回同一个对象
 */
export function dropListAdjust(slide, listName, keep = null) {
  if (!slide?.adjust || !listName) return slide;
  const re = new RegExp(`^(?:#\\d+:)?${listName}\\.(\\d+)(?:\\.|@|$)`);
  const kept = Object.fromEntries(
    Object.entries(slide.adjust).filter(([k]) => {
      const m = re.exec(k);
      return !m || (!!keep && keep(Number(m[1])));
    })
  );
  if (Object.keys(kept).length === Object.keys(slide.adjust).length) return slide;
  const { adjust: _old, ...rest } = slide;
  return Object.keys(kept).length ? { ...rest, adjust: kept } : rest;
}

/**
 * 列表从 prev 改成了 next：只丢掉「序号现在对到了别的条目（或没有条目了）」的调整。
 *   同一位置还是同一个对象 = 没挪；条数没变、只有一条换了新对象 = 改了那一条的字，也算没挪；
 *   其余情况（中间删了、换了顺序）：第一处不一样的位置起全丢。在末尾加一条、删最后一条，前面的都留着。
 */
export function pruneListAdjust(slide, listName, prev, next) {
  if (!slide?.adjust) return slide;
  if (!Array.isArray(prev) || !Array.isArray(next)) return dropListAdjust(slide, listName);
  const n = Math.min(prev.length, next.length);
  const diff = [];
  for (let i = 0; i < n; i += 1) if (next[i] !== prev[i]) diff.push(i);
  const stable = !diff.length || (diff.length === 1 && next.length === prev.length) ? n : diff[0];
  return dropListAdjust(slide, listName, (i) => i < stable);
}
