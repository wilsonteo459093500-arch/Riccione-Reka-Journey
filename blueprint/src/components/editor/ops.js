// 「页面」编辑器的纯函数 —— 全部是不可变更新（project → 新 project），不碰 DOM / IndexedDB，可在 Node 测试。
// 约定：新 id 一律由调用方生成后传进来（onChange 的 updater 可能被 React 调用两次，必须是纯函数）。

import { SECTION_LABELS } from '../../engine/deck.js';
import { planViews, TEAM_MAX } from '../../engine/b/design.js';
import { COMPANY_PAGES_B, companyFieldsB, companyImagesB, companyFieldByLabel, legacyOverrides } from '../../engine/b/company.js';
import { isMissWarning, langOf } from '../../engine/lang.js';
import { findFloor } from '../../engine/model.js';

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
// 楼层章节页只能隐藏不能删（删掉后该层的效果图会挤进上一层章节，且没法再加回来）
export const canDelete = (slide) => !!slide && slide.kind === 'view';
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

/**
 * 改了楼层后：移到该楼层章节的末尾（最后一张同楼层页之后）。
 * 该楼层没有章节页（旧项目里被删过）→ 用 floorSlideId 在这一页前面补一张章节页。
 */
export function moveToFloorEnd(project, id, floorSlideId = null) {
  const s = findSlide(project, id);
  if (!s || !s.floorId) return project;
  if (floorSlideId && !(project.slides || []).some((x) => x.kind === 'floor' && x.floorId === s.floorId)) {
    const i = project.slides.findIndex((x) => x.id === id);
    const floorSlide = { id: floorSlideId, kind: 'floor', floorId: s.floorId, enabled: true };
    return { ...project, slides: [...project.slides.slice(0, i), floorSlide, ...project.slides.slice(i)] };
  }
  const slides = project.slides;
  let last = -1;
  slides.forEach((x, k) => {
    if (x.id !== id && (x.kind === 'view' || x.kind === 'floor') && x.floorId === s.floorId) last = k;
  });
  if (last < 0) return project;
  return moveSlideRelative(project, id, slides[last].id, 'after');
}

// ---------------------------------------------------------------------------
// 版式（B「格物」）：full = 满版大图（只有图，不放字）；framed = 图文（图 + 右栏：楼层空间、标题、材料、说明）
// 'auto' 交给整套的排版计划（b/design.js planViews：横图且不丢内容才满版、同空间下一页能补上材料、不连续 3 页满版）
// ---------------------------------------------------------------------------

/**
 * 这一页实际用的版式：'full' | 'framed'
 * @param {object} slide
 * @param {(src:string)=>({w,h}|null)} metaFn
 * @param {object|Map|null} projectOrPlan  整套（或已算好的 planViews 结果）—— 'auto' 要看前后页才知道
 */
export function resolveViewLayout(slide, metaFn = () => null, projectOrPlan = null) {
  if (!slide || slide.kind !== 'view') return null;
  if (slide.layout === 'full' || slide.layout === 'framed') return slide.layout;
  const plan = projectOrPlan instanceof Map ? projectOrPlan : planViews(projectOrPlan || { slides: [slide] }, metaFn);
  return plan.get(slide.id) === 'full' ? 'full' : 'framed';
}

export const setViewLayout = (project, id, layout) => updateSlide(project, id, { layout });

/** 全局版式：mode = 'auto'（全部交还给自动排版）| 'full' | 'framed'。AI 立体图页保持不动 */
export function setAllViewLayouts(project, mode) {
  const want = mode === 'full' || mode === 'framed' ? mode : 'auto';
  let changed = false;
  const slides = (project.slides || []).map((s) => {
    if (s.kind !== 'view' || s.tag === '3d' || (s.layout || 'auto') === want) return s;
    changed = true;
    return { ...s, layout: want };
  });
  return changed ? { ...project, slides } : project;
}

/** 两个版本之间实际改了几页的版式（提示用；metaFn 给了就按实际版式比，'auto' 换算成满版 / 图文） */
export function countLayoutChanges(before, after, metaFn = null) {
  if (metaFn) {
    const a = planViews(before, metaFn);
    const b = planViews(after, metaFn);
    const ids = new Set((before.slides || []).filter((s) => s.kind === 'view').map((s) => s.id));
    const of = (plan, s) => (s.layout === 'full' || s.layout === 'framed' ? (s.layout === 'full' ? 'full' : 'plate') : plan.get(s.id));
    const prev = new Map((before.slides || []).map((s) => [s.id, of(a, s)]));
    return (after.slides || []).filter((s) => s.kind === 'view' && ids.has(s.id) && prev.get(s.id) !== of(b, s)).length;
  }
  const prev = new Map((before.slides || []).map((s) => [s.id, s.layout || 'auto']));
  return (after.slides || []).filter((s) => s.kind === 'view' && prev.has(s.id) && prev.get(s.id) !== (s.layout || 'auto')).length;
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

/**
 * 楼层章节页的大图：src = 设计师选的图（写在这一页上，页面一定照用）；
 * null = 恢复自动（同时清掉导入时从原稿带来的楼层图）→ 由版式从这一层的效果图里挑，不和紧接着的下一页重复
 */
export function setFloorBackground(project, slideId, src) {
  const s = findSlide(project, slideId);
  if (!s || s.kind !== 'floor') return project;
  if (src) return updateSlide(project, slideId, { image: src });
  let p = updateSlide(project, slideId, (x) => {
    if (!('image' in x)) return x;
    const { image, ...rest } = x;
    return rest;
  });
  if (findFloor(p, s.floorId)?.image) p = updateFloor(p, s.floorId, { image: null });
  return p;
}

export const updateInfo = (project, patch) => ({ ...project, info: { ...(project.info || {}), ...patch } });

/** 提案语言：'zh' 华文 | 'en' English | 'bi' 中英 */
export const setLang = (project, lang) => updateInfo(project, { lang: lang === 'en' || lang === 'bi' ? lang : 'zh' });
export const updateCover = (project, patch) => ({ ...project, cover: { ...(project.cover || {}), ...patch } });

const teamOf = (project) => project.info?.team || [];
export const updateTeamMember = (project, i, patch) => updateInfo(project, { team: listUpdate(teamOf(project), i, patch) });
export const addTeamMember = (project, member = { en: '', name: '', role: '' }) => updateInfo(project, { team: [...teamOf(project), member] });
export const removeTeamMember = (project, i) => updateInfo(project, { team: listRemove(teamOf(project), i) });
export const moveTeamMember = (project, i, delta) => updateInfo(project, { team: listMove(teamOf(project), i, delta) });

/**
 * 服务团队页上实际显示的成员 → info.team 里的序号（与 b/design.js bTeam 一致）：
 *   有人填了名字 → 只放填了名字的；一个名字都没有 → 有职位的先排着；最多 TEAM_MAX（12）位（7 位起排两行）
 */
export function teamVisibleIndices(team) {
  const listed = [];
  (team || []).forEach((m, i) => {
    if ((m?.name || '').trim() || (m?.role || '').trim()) listed.push(i);
  });
  const named = listed.filter((i) => (team[i]?.name || '').trim());
  return (named.length ? named : listed).slice(0, TEAM_MAX);
}

// ---------------------------------------------------------------------------
// 公司固定页（品牌画册，b/company.js）：按栏位改字、换照片
//   中文 → slide.overrides[栏位]；英文 → slide.overridesEn[栏位]（'' = 英文里不要这一行）；照片 → slide.images[照片位]
//   旧版按元素序号的改写（数字键）新版式不读，也不会被改写
// ---------------------------------------------------------------------------

const BUCKET = { zh: 'overrides', en: 'overridesEn' };

function writeField(project, slideId, field, lang, text) {
  const bucket = BUCKET[lang] || 'overrides';
  return updateSlide(project, slideId, (s) => {
    const map = { ...(s[bucket] || {}) };
    if (typeof text === 'string') map[field] = text;
    else delete map[field];
    const { [bucket]: _old, ...rest } = s;
    return Object.keys(map).length ? { ...rest, [bucket]: map } : rest;
  });
}

/** 改一栏（lang = 'zh' | 'en'）；和默认文字一样时去掉改写（带 token 的栏位继续跟随项目信息） */
export const setCompanyField = (project, slideId, field, lang, text, dflt) =>
  writeField(project, slideId, field, lang, dflt !== undefined && text === dflt ? null : String(text ?? ''));

/** 恢复默认文字 */
export const clearCompanyField = (project, slideId, field, lang) => writeField(project, slideId, field, lang, null);

/**
 * 「恢复默认」管哪些栏位（companyFields 的结果）：华文版只算中文改过的 —— 英文的改写在华文版里看不到，
 * 不替设计师一起丢掉；English / 中英版中文、英文改过的都算
 */
export const editedCompanyFields = (fields, lang) => (fields || []).filter((f) => f.overridden?.zh || (lang !== 'zh' && !f.shared && f.overridden?.en));

/** 只改了英文的栏位（华文版里提一句「另有 N 处英文改动」） */
export const enOnlyEdits = (fields) => (fields || []).filter((f) => !f.shared && f.overridden?.en && !f.overridden?.zh);

/** 恢复默认：华文版只清中文；English / 中英版中文、英文一起清 */
export const resetCompanyFields = (project, slideId, fieldNames, lang) =>
  (fieldNames || []).reduce((p, field) => {
    const q = clearCompanyField(p, slideId, field, 'zh');
    return lang === 'zh' ? q : clearCompanyField(q, slideId, field, 'en');
  }, project);

/** 版面上只排一行的栏位（目录、章节名、年份…）：回车、粘贴进来的换行都换成空格（不然页面上会截成「…」） */
export const singleLine = (text) => String(text ?? '').replace(/[^\S\n]*\n+[^\S\n]*/g, ' ');

/** 换照片：src = 新图；null = 恢复默认 */
export function setCompanyImage(project, slideId, slot, src) {
  return updateSlide(project, slideId, (s) => {
    const images = { ...(s.images || {}) };
    if (src) images[slot] = src;
    else delete images[slot];
    const { images: _old, ...rest } = s;
    return Object.keys(images).length ? { ...rest, images } : rest;
  });
}

/** 这一页用的是哪张公司页（方案封面没有 Material Board 时退回「方案」章节页） */
export function companyKeyOf(slide, project) {
  if (slide?.kind === 'company') return slide.key;
  if (slide?.kind === 'designCover' && !project?.cover?.image) return 'design-divider';
  return null;
}

/**
 * 检查器用的栏位：[{ field, label, zh, en, zhDefault, enDefault, overridden:{zh,en}, multiline, shared, tokens,
 *   zhInput, enInput }]
 *   zh / en = 页面上的字；zhInput / enInput = 输入框里的字（改过的栏位用设计师打的原文：留住行尾空格、换行）
 *   shared = 中英同一段（品牌名、年份、地址）
 */
export function companyFields(slide, project) {
  const key = companyKeyOf(slide, project);
  if (!key || !COMPANY_PAGES_B[key]) return [];
  return companyFieldsB(key, slide, project).map((f) => {
    const oz = slide?.overrides?.[f.field];
    const oe = slide?.overridesEn?.[f.field];
    return {
      ...f,
      zhInput: typeof oz === 'string' ? oz : f.zh,
      enInput: typeof oe === 'string' ? oe : f.en,
    };
  });
}

/** 照片位：[{ slot, field, label, src, default, custom }]（src = null：这一页不要这张照片） */
export function companyImages(slide, project) {
  const key = companyKeyOf(slide, project);
  return key ? companyImagesB(key, slide) : [];
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

/** 公司页照片位的名字（提醒里说的是照片位的中文名）→ 照片位 */
const PHOTO_SLOT_BY_LABEL = (() => {
  const map = new Map();
  for (const p of Object.values(COMPANY_PAGES_B)) for (const [slot, d] of Object.entries(p.images || {})) if (d?.label) map.set(d.label, slot);
  return map;
})();

/**
 * 提醒 → 一键修复（b/design.js、b/company.js 里的中文提示）
 *   { id:'framed'|'split'|'removeMissing'|'pickImage'|'gotoMaterials'|'focus'|'translate'|'dismissLegacy'|'hide', label, field? }
 *   pickImage / focus：把右侧对应的输入框（data-field = field）滚出来并聚焦
 * @param {string} text
 * @param {{ key?:string|null }} ctx  key = 这一页用的公司页（companyKeyOf）：公司页的提醒说的是栏位名，要它才对得上栏位
 */
export function fixForWarning(text, ctx = {}) {
  const s = String(text || '');
  if (/满版大图不显示/.test(s)) return { id: 'framed', label: '换成图文' };
  if (/水印会露出来/.test(s)) return { id: 'framed', label: '换成图文' };
  if (/说明太多放不下|材料太多|材料表放不下|材料较多，视角名已缩小/.test(s)) return { id: 'split', label: '拆成两页' };
  const longNote = s.match(/^说明太长（第 (\d+) 条(的标签)?）/);
  if (longNote) return { id: 'focus', label: '去精简说明', field: `notes.${Number(longNote[1]) - 1}.${longNote[2] ? 'label' : 'text'}` };
  if (/^说明太长/.test(s)) return { id: 'focus', label: '去精简说明', field: 'notes.0.text' };
  if (/^视角名的英文太长/.test(s)) return { id: 'focus', label: '去改英文视角名', field: 'subtitleEn' };
  if (/^视角名太长/.test(s)) return { id: 'focus', label: '去改视角名', field: 'title' };
  if (/^空间英文名太长/.test(s)) return { id: 'focus', label: '去改空间英文名', field: 'roomEn' };
  if (/^空间名太长/.test(s)) return { id: 'focus', label: '去改空间名', field: 'room' };
  if (/封面标题太长/.test(s)) return { id: 'focus', label: '去改标题', field: 'coverTitle' };
  if (/^这一层的效果图都隐藏了|^这一层还没有效果图页/.test(s)) return { id: 'hide', label: '隐藏这一页' };
  if (/编号太长/.test(s)) return { id: 'gotoMaterials', label: '去材料清单改编号' };
  if (/^旧版里改过的字/.test(s)) return { id: 'dismissLegacy', label: '知道了' };
  // 公司页：提醒里写的是栏位名（「第一章说明」「正文（英文）」）→ 那一栏
  if (ctx.key) {
    const cut = s.match(/^文字太长放不下：「(.+?)」/);
    const cutField = cut && companyFieldByLabel(ctx.key, cut[1]);
    if (cutField) return { id: 'focus', label: '去删减', field: cutField };
    const stale = s.match(/^改过的中文还没有对应的英文：「(.+?)」/);
    const staleField = stale && companyFieldByLabel(ctx.key, stale[1]);
    if (staleField) return { id: 'focus', label: '去补英文', field: staleField.replace(/^overrides\./, 'overridesEn.') };
  }
  if (/项材料已被删除/.test(s)) return { id: 'removeMissing', label: '移除失效的材料' };
  const unpicked = s.match(/^第 (\d+) 项还没选材料/);
  if (unpicked) return { id: 'focus', label: '去选材料', field: `materials.${Number(unpicked[1]) - 1}` };
  // 公司页的照片：缺照片 / 像素偏低 →「照片」栏里那一张
  const photo = s.match(/^缺照片：(.+?) —— /) || s.match(/^图片像素偏低：(.+?)放大 /);
  if (photo && PHOTO_SLOT_BY_LABEL.has(photo[1])) return { id: 'pickImage', label: '换一张照片', field: `image.${PHOTO_SLOT_BY_LABEL.get(photo[1])}` };
  if (/^材料「.*」的图片像素偏低/.test(s)) return { id: 'gotoMaterials', label: '去材料清单换图' };
  if (/^Material Board 图片像素偏低/.test(s)) return { id: 'pickImage', label: '换一张图', field: 'cover.image' };
  if (/缺少效果图|没有背景图|^图片像素偏低：放大/.test(s)) return { id: 'pickImage', label: '换一张图', field: 'image' };
  if (/本案材料为空/.test(s)) return { id: 'gotoMaterials', label: '去材料清单' };
  const member = s.match(/服务团队第 (\d+) 位/);
  if (member) return { id: 'focus', label: '填写名字', field: `team.${Number(member[1]) - 1}.name` };
  if (/服务团队还没填名字/.test(s)) return { id: 'focus', label: '填写团队名字', field: 'team.0.name' };
  // 质保年数：中文没填 → 中文栏（英文会自动跟着变成 5 years）；中文填了、英文没跟上 → 英文栏
  const years = s.match(/质保年数(的英文)?还没填/);
  if (years) {
    const row = /^售后维保：五金/.test(s) ? 'r3Text' : 'r4Text';
    return years[1] ? { id: 'focus', label: '去补英文', field: `overridesEn.${row}` } : { id: 'focus', label: '去填年数', field: `overrides.${row}` };
  }
  if (isMissWarning(s)) return { id: 'translate', label: 'AI 翻译' };
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
    case 'hide':
      return setSlideEnabled(project, slideId, false);
    case 'dismissLegacy':
      return clearLegacyEdits(project, slideId, langOf(project));
    default:
      return project;
  }
}

/**
 * 旧版留下的改写（按元素序号的数字键，新版式没有对应栏位）：设计师对照过了，点「知道了」清掉。
 * 华文版只清中文的（English / 中英版的英文改写看不到，不替设计师丢掉）
 */
export function clearLegacyEdits(project, slideId, lang = 'zh') {
  const drop = new Set(legacyOverrides(findSlide(project, slideId), lang).map((x) => `${x.bucket}.${x.key}`));
  if (!drop.size) return project;
  return updateSlide(project, slideId, (s) => {
    const next = { ...s };
    for (const bucket of ['overrides', 'overridesEn']) {
      if (!s[bucket]) continue;
      const map = Object.fromEntries(Object.entries(s[bucket]).filter(([k]) => !drop.has(`${bucket}.${k}`)));
      if (Object.keys(map).length) next[bucket] = map;
      else delete next[bucket];
    }
    return next;
  });
}

/** 这一页还留着的旧版改写（检查器里列出来对照）：[{ bucket, key, text }] */
export const legacyEdits = (slide, project) => legacyOverrides(slide, langOf(project));

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

/** 效果图页在编辑器列表里的标题（房间 · 视角名） */
export const viewTitleOf = (s) => [s?.room, s?.subtitle].map((x) => (x || '').trim()).filter(Boolean).join(' · ') || '未命名';

/** 项目里出现过的房间名（输入建议） */
export function roomSuggestions(project) {
  const set = new Set();
  for (const s of project.slides || []) if (s.kind === 'view' && (s.room || '').trim()) set.add(s.room.trim());
  return [...set];
}
