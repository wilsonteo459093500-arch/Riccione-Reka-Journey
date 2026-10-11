// 材料清单的纯函数（Node 可测）：引用统计、新增、改、排序、合并、删除。
// 材料被效果图页引用：slide.materials = [{ role, materialId }]

import { uid } from '../engine/model.js';

/** 每种材料被哪些效果图页引用：Map<materialId, Slide[]>（按整套顺序） */
export function materialUsage(project) {
  const map = new Map((project?.materials || []).map((m) => [m.id, []]));
  for (const s of project?.slides || []) {
    if (s.kind !== 'view' || !Array.isArray(s.materials)) continue;
    const seen = new Set();
    for (const ref of s.materials) {
      if (!ref?.materialId || seen.has(ref.materialId)) continue;
      seen.add(ref.materialId);
      if (!map.has(ref.materialId)) map.set(ref.materialId, []);
      map.get(ref.materialId).push(s);
    }
  }
  return map;
}

export const newMaterial = (partial = {}) => ({ id: uid('m'), name: '', code: '', image: null, pending: false, ...partial });

export function addMaterial(project, partial = {}) {
  const mat = newMaterial(partial);
  return { project: { ...project, materials: [...(project.materials || []), mat] }, material: mat };
}

export function updateMaterial(project, id, patch) {
  let changed = false;
  const materials = (project.materials || []).map((m) => {
    if (m.id !== id) return m;
    changed = true;
    return { ...m, ...patch };
  });
  return changed ? { ...project, materials } : project;
}

/** 拖拽排序：把 from 位置的材料移到 to 位置（顺序 = 「本案材料」页上的顺序） */
export function moveMaterial(project, from, to) {
  const list = [...(project.materials || [])];
  if (from === to || from < 0 || from >= list.length) return project;
  const clamped = Math.max(0, Math.min(list.length - 1, to));
  const [m] = list.splice(from, 1);
  list.splice(clamped, 0, m);
  return { ...project, materials: list };
}

/** 改写效果图页的材料引用：mapId(id) → 新 id | null（null = 去掉这条） */
function rewriteRefs(project, mapId) {
  let changed = false;
  const slides = (project.slides || []).map((s) => {
    if (s.kind !== 'view' || !Array.isArray(s.materials) || !s.materials.length) return s;
    const out = [];
    const seen = new Set();
    let touched = false;
    for (const ref of s.materials) {
      const id = mapId(ref.materialId);
      if (id !== ref.materialId) touched = true;
      if (!id) continue;
      const key = `${ref.role || ''}\u0000${id}`;
      if (seen.has(key)) {
        touched = true;
        continue;
      }
      seen.add(key);
      out.push(id === ref.materialId ? ref : { ...ref, materialId: id });
    }
    if (!touched) return s;
    changed = true;
    return { ...s, materials: out };
  });
  return changed ? slides : project.slides;
}

/**
 * 合并材料：ids 里排在清单最前面的那种保留，其余并进去。
 * 保留项缺图时取第一张有图的；任一「待确认」→ 合并后仍待确认；缺名称 / 编号时取其余的。
 */
export function mergeMaterials(project, ids) {
  const pick = new Set(ids);
  const ordered = (project.materials || []).filter((m) => pick.has(m.id));
  if (ordered.length < 2) return project;
  const [keep, ...rest] = ordered;
  const merged = {
    ...keep,
    name: keep.name || rest.find((m) => m.name)?.name || '',
    code: keep.code || rest.find((m) => m.code)?.code || '',
    image: keep.image || rest.find((m) => m.image)?.image || null,
    pending: ordered.some((m) => m.pending),
  };
  const gone = new Set(rest.map((m) => m.id));
  const materials = (project.materials || []).filter((m) => !gone.has(m.id)).map((m) => (m.id === keep.id ? merged : m));
  const slides = rewriteRefs(project, (id) => (gone.has(id) ? keep.id : id));
  return { ...project, materials, slides };
}

/** 删除材料，同时去掉所有效果图页上的引用 */
export function deleteMaterials(project, ids) {
  const gone = new Set(ids);
  if (!(project.materials || []).some((m) => gone.has(m.id))) return project;
  const materials = (project.materials || []).filter((m) => !gone.has(m.id));
  const slides = rewriteRefs(project, (id) => (gone.has(id) ? null : id));
  return { ...project, materials, slides };
}
