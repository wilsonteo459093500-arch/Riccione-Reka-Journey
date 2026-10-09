// 「页面」编辑器的纯函数 —— 全部是不可变更新（project → 新 project），不碰 DOM / IndexedDB，可在 Node 测试。
// 约定：新 id 一律由调用方生成后传进来（onChange 的 updater 可能被 React 调用两次，必须是纯函数）。

import { autoLayout, applyLayoutRhythm } from '../../engine/layouts.js';
import { SECTION_LABELS, COMPANY_BY_KEY, renderCompany, projectTokens, elementText } from '../../engine/deck.js';
import { findFloor } from '../../engine/model.js';
import { SLIDE_W, PX_PER_PT } from '../../theme.js';

/** 材料「部位」常用词（输入框下拉建议） */
export const ROLE_SUGGESTIONS = ['柜体 & 柜门', '柜门', '柜体', '见光板', '开放柜', '岩板', '台面', '墙板', '玻璃门', '背板', '床头板', '地板', '拉手'];

/** onChange 第二个参数：按钮类操作单独算一步撤销（不和前后的打字合并） */
export const NOW = { coalesce: false };

export const KIND_LABELS = {
  company: '公司固定页',
  designCover: '方案封面',
  materials: '本案材料',
  floor: '楼层章节页',
  view: '效果图页',
  team: '服务团队',
};

// ---------------------------------------------------------------------------
// 能力判断
// ---------------------------------------------------------------------------

/** 只有方案页（效果图 / 楼层 / AI 立体图）能删；公司页、方案封面、本案材料、服务团队只能隐藏 */
export const canDelete = (slide) => !!slide && (slide.kind === 'view' || slide.kind === 'floor');
export const canDuplicate = (slide) => !!slide && (slide.kind === 'view' || slide.kind === 'floor');
/** 哪些页后面可以「新增效果图页」（方案章节里的页） */
export const canInsertViewAfter = (slide) => !!slide && ['view', 'floor', 'designCover', 'materials'].includes(slide.kind);

export const findSlide = (project, id) => (project?.slides || []).find((s) => s.id === id) || null;
export const slideIndex = (project, id) => (project?.slides || []).findIndex((s) => s.id === id);

// ---------------------------------------------------------------------------
// 通用数组 / 单页更新
// ---------------------------------------------------------------------------

export function listMove(arr, i, delta) {
  const list = [...(arr || [])];
  const j = i + delta;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return arr || [];
  const [item] = list.splice(i, 1);
  list.splice(j, 0, item);
  return list;
}

export const listRemove = (arr, i) => (arr || []).filter((_, k) => k !== i);

export const listUpdate = (arr, i, patch) =>
  (arr || []).map((item, k) => (k === i ? { ...item, ...(typeof patch === 'function' ? patch(item) : patch) } : item));

export const listInsert = (arr, i, item) => {
  const list = [...(arr || [])];
  list.splice(Math.max(0, Math.min(i, list.length)), 0, item);
  return list;
};

/** 改一页：patch 可以是对象（浅合并）或 (slide) => newSlide */
export function updateSlide(project, id, patch) {
  let hit = false;
  const slides = (project.slides || []).map((s) => {
    if (s.id !== id) return s;
    hit = true;
    return typeof patch === 'function' ? patch(s) : { ...s, ...patch };
  });
  return hit ? { ...project, slides } : project;
}

/** 批量补丁 [{ slideId, patch }]（浅合并） */
export function applyPatches(project, patches) {
  const map = new Map((patches || []).map((p) => [p.slideId, p.patch || {}]));
  if (!map.size) return project;
  return { ...project, slides: (project.slides || []).map((s) => (map.has(s.id) ? { ...s, ...map.get(s.id) } : s)) };
}

export const setSlideEnabled = (project, id, enabled) => updateSlide(project, id, { enabled: !!enabled });
export const toggleSlide = (project, id) => updateSlide(project, id, (s) => ({ ...s, enabled: s.enabled === false }));

/** 效果图页的 materials / notes 列表 */
export const updateViewList = (project, id, listName, fn) =>
  updateSlide(project, id, (s) => ({ ...s, [listName]: fn(s[listName] || []) }));

// ---------------------------------------------------------------------------
// 排序 / 复制 / 删除 / 新增
// ---------------------------------------------------------------------------

/** 拖放：把 id 放到 targetId 前 / 后 */
export function moveSlideRelative(project, id, targetId, place = 'before') {
  if (!id || id === targetId) return project;
  const slides = project.slides || [];
  const from = slides.findIndex((s) => s.id === id);
  if (from < 0) return project;
  const rest = slides.filter((s) => s.id !== id);
  const t = rest.findIndex((s) => s.id === targetId);
  if (t < 0) return project;
  const at = place === 'after' ? t + 1 : t;
  const next = [...rest.slice(0, at), slides[from], ...rest.slice(at)];
  if (next.every((s, i) => s === slides[i])) return project;
  return { ...project, slides: next };
}

/** 移到整套里的第 toIndex 位（移动后的位置） */
export function moveSlide(project, id, toIndex) {
  const slides = project.slides || [];
  const from = slides.findIndex((s) => s.id === id);
  if (from < 0) return project;
  const to = Math.max(0, Math.min(slides.length - 1, toIndex));
  if (to === from) return project;
  const rest = slides.filter((s) => s.id !== id);
  return { ...project, slides: [...rest.slice(0, to), slides[from], ...rest.slice(to)] };
}

/** Alt + ↑ / ↓：上下挪一位 */
export function moveSlideBy(project, id, delta) {
  const from = slideIndex(project, id);
  if (from < 0) return project;
  return moveSlide(project, id, from + delta);
}

const clone = (v) => JSON.parse(JSON.stringify(v));

/** 复制一页（效果图 / 楼层），插在原页后面 */
export function duplicateSlide(project, id, newId) {
  const slides = project.slides || [];
  const i = slides.findIndex((s) => s.id === id);
  if (i < 0 || !canDuplicate(slides[i]) || !newId) return project;
  const copy = { ...clone(slides[i]), id: newId, enabled: true };
  return { ...project, slides: [...slides.slice(0, i + 1), copy, ...slides.slice(i + 1)] };
}

export function deleteSlide(project, id) {
  const s = findSlide(project, id);
  if (!s || !canDelete(s)) return project;
  return { ...project, slides: project.slides.filter((x) => x.id !== id) };
}

/** 某一页所在的楼层章节（往前找最近的楼层页） */
export function floorContextOf(project, id) {
  const slides = project.slides || [];
  const i = slides.findIndex((s) => s.id === id);
  for (let k = i; k >= 0; k--) {
    const s = slides[k];
    if (s.kind === 'floor') return s.floorId || null;
    if (s.kind === 'company' || s.kind === 'designCover' || s.kind === 'materials' || s.kind === 'team') return null;
  }
  return null;
}

/** 新效果图页的空白模板 */
export const newViewSlide = (id, partial = {}) => ({
  id,
  kind: 'view',
  enabled: true,
  floorId: null,
  layout: 'auto',
  image: null,
  room: '',
  roomEn: '',
  subtitle: '',
  materials: [],
  notes: [],
  ...partial,
});

/**
 * 在某页后面新增效果图页（可一次多张）：同楼层，沿用当前页的房间名，版式「自动」
 * @param {Array<{ id:string, image:string }>} items
 */
export function insertViewsAfter(project, afterId, items) {
  const slides = project.slides || [];
  const i = slides.findIndex((s) => s.id === afterId);
  if (i < 0 || !items?.length) return project;
  const cur = slides[i];
  const floorId = cur.kind === 'view' || cur.kind === 'floor' ? cur.floorId || null : floorContextOf(project, afterId);
  const room = cur.kind === 'view' ? { room: cur.room || '', roomEn: cur.roomEn || '' } : {};
  const added = items.map((it) => newViewSlide(it.id, { floorId, image: it.image || null, ...room }));
  return { ...project, slides: [...slides.slice(0, i + 1), ...added, ...slides.slice(i + 1)] };
}

/** 改了楼层后：移到该楼层章节的末尾（最后一张同楼层页之后） */
export function moveToFloorEnd(project, id) {
  const s = findSlide(project, id);
  if (!s || !s.floorId) return project;
  const slides = project.slides;
  let last = -1;
  slides.forEach((x, k) => {
    if (x.id !== id && (x.kind === 'view' || x.kind === 'floor') && x.floorId === s.floorId) last = k;
  });
  if (last < 0) return project;
  return moveSlideRelative(project, id, slides[last].id, 'after');
}

// ---------------------------------------------------------------------------
// 版式
// ---------------------------------------------------------------------------

/** 这一页实际用的版式（'auto' 按图片比例 / 内容判断） */
export function resolveViewLayout(slide, metaFn = () => null) {
  if (!slide || slide.kind !== 'view') return null;
  if (slide.layout && slide.layout !== 'auto') return slide.layout;
  return autoLayout(slide, slide.image ? metaFn(slide.image) : null);
}

export const setViewLayout = (project, id, layout) => updateSlide(project, id, { layout });

/** 全局版式：mode = 'auto'（重新自动排版 + 节奏调整）| 'full' | 'framed'。AI 立体图页保持不动 */
export function setAllViewLayouts(project, mode, metaFn = () => null) {
  const slides = project.slides || [];
  const targets = slides.filter((s) => s.kind === 'view' && s.tag !== '3d');
  if (!targets.length) return project;
  const layoutOf = new Map();
  if (mode === 'auto') {
    const run = (list) => applyLayoutRhythm(list.map((s) => ({ ...s, layout: 'auto' })), metaFn).forEach((v) => layoutOf.set(v.id, v.layout));
    run(targets.filter((s) => s.enabled !== false));
    run(targets.filter((s) => s.enabled === false));
  } else {
    targets.forEach((s) => layoutOf.set(s.id, mode));
  }
  let changed = false;
  const next = slides.map((s) => {
    if (!layoutOf.has(s.id) || s.layout === layoutOf.get(s.id)) return s;
    changed = true;
    return { ...s, layout: layoutOf.get(s.id) };
  });
  return changed ? { ...project, slides: next } : project;
}

/** 两个版本之间改了几页的版式（提示用） */
export function countLayoutChanges(before, after) {
  const prev = new Map((before.slides || []).map((s) => [s.id, s.layout]));
  return (after.slides || []).filter((s) => s.kind === 'view' && prev.has(s.id) && prev.get(s.id) !== s.layout).length;
}

// ---------------------------------------------------------------------------
// 材料 / 备注
// ---------------------------------------------------------------------------

/** 同楼层同房间的其它效果图页（不含 AI 立体图） */
export function sameRoomViews(project, id) {
  const s = findSlide(project, id);
  const room = (s?.room || '').trim();
  if (!s || s.kind !== 'view' || !room) return [];
  return (project.slides || []).filter(
    (x) => x.id !== id && x.kind === 'view' && x.tag !== '3d' && (x.room || '').trim() === room && (x.floorId || null) === (s.floorId || null)
  );
}

/** 把这一页的材料清单复制到同房间其它页（覆盖它们原来的材料） */
export function copyMaterialsToRoom(project, id) {
  const s = findSlide(project, id);
  const targets = new Set(sameRoomViews(project, id).map((x) => x.id));
  if (!s || !targets.size) return project;
  const mats = s.materials || [];
  return {
    ...project,
    slides: project.slides.map((x) => (targets.has(x.id) ? { ...x, materials: mats.map((m) => ({ ...m })) } : x)),
  };
}

/** 去掉引用了已删除材料的行（以及还没选材料的空行） */
export function removeMissingMaterials(project, id) {
  const ids = new Set((project.materials || []).map((m) => m.id));
  return updateSlide(project, id, (s) => ({ ...s, materials: (s.materials || []).filter((r) => r.materialId && ids.has(r.materialId)) }));
}

/** 右侧放不下：拆成两页（同一张图；备注在前、材料在后，按条数对半分），两页都用框图 */
export function splitView(project, id, newId) {
  const slides = project.slides || [];
  const i = slides.findIndex((s) => s.id === id);
  const s = slides[i];
  if (!s || s.kind !== 'view' || !newId) return project;
  const notes = s.notes || [];
  const mats = s.materials || [];
  const total = notes.length + mats.length;
  if (total < 2) return project;
  const half = Math.ceil(total / 2);
  const n1 = Math.min(notes.length, half);
  const m1 = Math.max(0, half - notes.length);
  const first = { ...s, layout: 'framed', notes: notes.slice(0, n1), materials: mats.slice(0, m1) };
  const second = { ...clone(s), id: newId, enabled: true, layout: 'framed', notes: clone(notes.slice(n1)), materials: clone(mats.slice(m1)) };
  return { ...project, slides: [...slides.slice(0, i), first, second, ...slides.slice(i + 1)] };
}

export const newMaterial = (id, { name = '', code = '', image = null, pending = false } = {}) => ({
  id,
  name: String(name || '').trim(),
  code: String(code || '').trim().toUpperCase(),
  image: image || null,
  pending: !!pending,
});

export const addMaterial = (project, mat) => ({ ...project, materials: [...(project.materials || []), mat] });

/** 某页第 row 行换材料；row = -1（或超出）= 新增一行 */
export function assignMaterial(project, slideId, row, materialId, role) {
  return updateViewList(project, slideId, 'materials', (list) => {
    if (row >= 0 && row < list.length) return listUpdate(list, row, { materialId });
    return [...list, { role: role || '', materialId }];
  });
}

/** 新建材料并放进某页（一步完成，方便撤销） */
export const addMaterialAndAssign = (project, slideId, row, mat, role) =>
  assignMaterial(addMaterial(project, mat), slideId, row, mat.id, role);

// ---------------------------------------------------------------------------
// 楼层 / 封面 / 项目信息 / 团队
// ---------------------------------------------------------------------------

export function updateFloor(project, floorId, patch) {
  if (!findFloor(project, floorId)) return project;
  return { ...project, floors: project.floors.map((f) => (f.id === floorId ? { ...f, ...patch } : f)) };
}

/** 楼层章节页背景：src = 新图；null = 恢复自动（该层第一张效果图）。写在楼层上，同时清掉单页上的旧设置 */
export function setFloorBackground(project, slideId, src) {
  const s = findSlide(project, slideId);
  if (!s || s.kind !== 'floor') return project;
  let p = updateSlide(project, slideId, (x) => {
    if (!('image' in x)) return x;
    const { image, ...rest } = x;
    return rest;
  });
  if (findFloor(p, s.floorId)) p = updateFloor(p, s.floorId, { image: src || null });
  else if (src) p = updateSlide(p, slideId, { image: src });
  return p;
}

export const updateInfo = (project, patch) => ({ ...project, info: { ...(project.info || {}), ...patch } });
export const updateCover = (project, patch) => ({ ...project, cover: { ...(project.cover || {}), ...patch } });

const teamOf = (project) => project.info?.team || [];
export const updateTeamMember = (project, i, patch) => updateInfo(project, { team: listUpdate(teamOf(project), i, patch) });
export const addTeamMember = (project, member = { en: '', name: '', role: '' }) => updateInfo(project, { team: [...teamOf(project), member] });
export const removeTeamMember = (project, i) => updateInfo(project, { team: listRemove(teamOf(project), i) });
export const moveTeamMember = (project, i, delta) => updateInfo(project, { team: listMove(teamOf(project), i, delta) });

/** 服务团队页上实际显示的成员 → info.team 里的序号（layoutTeam 只显示有名字或职位的前 6 位） */
export function teamVisibleIndices(team) {
  const out = [];
  (team || []).forEach((m, i) => {
    if (out.length < 6 && ((m?.name || '').trim() || (m?.role || '').trim())) out.push(i);
  });
  return out;
}

// ---------------------------------------------------------------------------
// 公司固定页：逐段改字
// ---------------------------------------------------------------------------

function writeOverride(project, slideId, idx, text) {
  return updateSlide(project, slideId, (s) => {
    const overrides = { ...(s.overrides || {}) };
    if (typeof text === 'string') overrides[idx] = text;
    else delete overrides[idx];
    const { overrides: _old, ...rest } = s;
    return Object.keys(overrides).length ? { ...rest, overrides } : rest;
  });
}

/** 改字；与原文（已填 token）一致时去掉改写，让 token 继续跟随项目信息 */
export const setCompanyOverride = (project, slideId, idx, text, original) =>
  writeOverride(project, slideId, idx, original !== undefined && text === original ? null : String(text ?? ''));

/** 恢复原文 */
export const clearCompanyOverride = (project, slideId, idx) => writeOverride(project, slideId, idx, null);

/** 这一页用的是哪张公司模板（方案封面没有 Material Board 时退回「方案 · 章节页」） */
export function companyKeyOf(slide, project) {
  if (slide?.kind === 'company') return slide.key;
  if (slide?.kind === 'designCover' && !project?.cover?.image) return 'design-divider';
  return null;
}

function fieldRole(el) {
  const r = el?.paras?.[0]?.runs?.[0] || {};
  if (el.y >= 960) return el.x + el.w / 2 < SLIDE_W / 2 ? '左侧' : '右侧';
  if ((r.size || 0) >= 40) return '大标题';
  if ((r.size || 0) >= 28) return '标题';
  const raw = (el.paras || []).map((p) => p.runs.map((x) => x.text).join('')).join('');
  if (r.font === 'sans' && !/[a-z]/.test(raw.replace(/\{\{\w+\}\}/g, '')) && (r.spacing || 0) >= 3) return '英文小标题';
  return '正文';
}

/**
 * 公司模板页的全部文字框：[{ idx, text, original, overridden, tokens, role, footer }]
 *   text = 当前显示的文字；original = 模板原文（已填项目信息）
 */
export function companyFields(slide, project) {
  const key = companyKeyOf(slide, project);
  const tpl = key ? COMPANY_BY_KEY[key] : null;
  if (!tpl) return [];
  const tokens = projectTokens(project);
  const base = renderCompany(key, tokens, {});
  const cur = renderCompany(key, tokens, slide.overrides || {});
  const out = [];
  tpl.els.forEach((el, idx) => {
    if (el.t !== 'text') return;
    const raw = (el.paras || []).map((p) => p.runs.map((r) => r.text).join('')).join('\n');
    const role = fieldRole(el);
    out.push({
      idx,
      text: elementText(cur.els[idx]),
      original: elementText(base.els[idx]),
      overridden: typeof slide.overrides?.[idx] === 'string',
      tokens: /\{\{\w+\}\}/.test(raw),
      role,
      footer: el.y >= 960,
      // 多段，或框高超过两行字 → 多行输入框
      multiline: (el.paras || []).length > 1 || el.h > (el.paras?.[0]?.runs?.[0]?.size || 18) * PX_PER_PT * 1.2 * 1.8,
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// 渲染结果的整理：页码、分组、缩略图稳定化、提醒
// ---------------------------------------------------------------------------

/** 页码：只给启用的页编号（= 导出后的页码） */
export function pageNumbers(rendered) {
  const map = new Map();
  let n = 0;
  for (const pg of rendered || []) if (pg.enabled) map.set(pg.key, ++n);
  return map;
}

/** 按章节分组（连续的同章节页一组；公司页被拖到别处时会出现重复的章节标题） */
export function groupSections(rendered) {
  const groups = [];
  (rendered || []).forEach((page, index) => {
    const last = groups[groups.length - 1];
    if (last && last.section === page.section) last.items.push({ page, index });
    else groups.push({ section: page.section, label: SECTION_LABELS[page.section] || page.section, items: [{ page, index }] });
  });
  return groups;
}

/**
 * 内容没变的渲染页沿用上一次的对象 → 缩略图（memo）不会因为别的页打字而重绘。
 * @param {Map<string,{sig:string,page:object}>|null} cache  上一次的结果（素材版本变化时传 null）
 * @returns {{ pages:object[], cache:Map }}
 */
export function stabilizePages(cache, rendered) {
  const next = new Map();
  const pages = (rendered || []).map((pg) => {
    const sig = JSON.stringify(pg);
    const prev = cache?.get(pg.key);
    const page = prev && prev.sig === sig ? prev.page : pg;
    next.set(pg.key, { sig, page });
    return page;
  });
  return { pages, cache: next };
}

/** 有提醒的启用页数 */
export const warningPageCount = (rendered) => (rendered || []).filter((p) => p.enabled && p.warnings?.length).length;

/** 从 fromIndex 往后找下一页有提醒的（循环） */
export function nextWarningIndex(rendered, fromIndex) {
  const n = rendered?.length || 0;
  for (let k = 1; k <= n; k++) {
    const i = (fromIndex + k + n) % n;
    if (rendered[i].enabled && rendered[i].warnings?.length) return i;
  }
  return -1;
}

/**
 * 提醒 → 一键修复（layouts.js 里的中文提示）
 *   { id:'framed'|'split'|'removeMissing'|'pickImage'|'gotoMaterials'|'focus', label, field? }
 */
export function fixForWarning(text) {
  const s = String(text || '');
  if (/满版页右下放不下/.test(s)) return { id: 'framed', label: '切换成框图' };
  if (/右侧说明太多放不下/.test(s)) return { id: 'split', label: '拆成两页' };
  if (/项材料已被删除/.test(s)) return { id: 'removeMissing', label: '移除失效的材料' };
  if (/缺少效果图|没有背景图/.test(s)) return { id: 'pickImage', label: '选一张图', field: 'image' };
  if (/本案材料为空/.test(s)) return { id: 'gotoMaterials', label: '去材料清单' };
  if (/服务团队还没填名字/.test(s)) return { id: 'focus', label: '填写团队名字', field: 'team.0.name' };
  return null;
}

/** 纯数据的修复（其余由界面处理：选图、跳转） */
export function applyFix(project, fixId, slideId, { newId } = {}) {
  switch (fixId) {
    case 'framed':
      return setViewLayout(project, slideId, 'framed');
    case 'split':
      return splitView(project, slideId, newId);
    case 'removeMissing':
      return removeMissingMaterials(project, slideId);
    default:
      return project;
  }
}

// ---------------------------------------------------------------------------
// 画布点选 → 检查器输入框
// ---------------------------------------------------------------------------

/**
 * 把画布元素的 edit.field 换成检查器里输入框的 data-field：
 *   框图版式的备注序号是「非空备注」里的序号 → 换回原始序号；团队页序号 → info.team 里的序号
 */
export function inputFieldFor(field) {
  // 版式输出的 edit 字段已经是数据下标（notes.N / materials.N / team.N 都按原始序号），直接对应输入框
  return String(field || '');
}

// ---------------------------------------------------------------------------
// 本案图片（「从本案图片里选」）
// ---------------------------------------------------------------------------

/** 项目里用过的大图（效果图、楼层图、平面图、立体图、Material Board），按出现顺序去重 */
export function projectImages(project) {
  const out = [];
  const seen = new Set();
  const add = (src, label, group) => {
    if (!src || seen.has(src)) return;
    seen.add(src);
    out.push({ src, label, group });
  };
  const floorName = (id) => findFloor(project, id)?.zh || '';
  for (const s of project.slides || []) {
    if (s.kind !== 'view' || !s.image) continue;
    const title = [s.room, s.subtitle].map((x) => (x || '').trim()).filter(Boolean).join(' · ') || '效果图';
    add(s.image, [floorName(s.floorId), title].filter(Boolean).join(' · '), s.tag === '3d' ? '3d' : 'view');
  }
  for (const f of project.floors || []) {
    add(f.image, `${f.zh || '楼层'} · 章节页`, 'floor');
    add(f.plan, `${f.zh || '楼层'} · 平面图`, 'plan');
    (f.renders3d || []).forEach((src) => add(src, `${f.zh || '全屋'} · 3D 立体图`, '3d'));
  }
  for (const s of project.slides || []) if (s.kind === 'floor' && s.image) add(s.image, `${floorName(s.floorId)} · 章节页`, 'floor');
  add(project.cover?.image, 'Material Board', 'board');
  return out;
}

/** 效果图页的标题预览（与 layouts.js 的 viewTitle 一致） */
export const viewTitleOf = (s) => [s?.room, s?.subtitle].map((x) => (x || '').trim()).filter(Boolean).join(' · ') || '未命名';

/** 项目里出现过的房间名（输入建议） */
export function roomSuggestions(project) {
  const set = new Set();
  for (const s of project.slides || []) if (s.kind === 'view' && (s.room || '').trim()) set.add(s.room.trim());
  return [...set];
}
