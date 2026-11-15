// 楼层上「生成出来的」字段：平面图、框选范围、3D 户型图的坐标和贴图、立体图历史。
// 它们不进撤销历史（花了钱 / 花了功夫的结果不能被一次 ⌘Z 撤掉），撤销 / 重做时从当前状态带回去。

export const GENERATED_FIELDS = ['renders3d', 'plan', 'planSource', 'planCrop', 'planRegion', 'planScope', 'planBrief', 'render3dInfo', 'plan3d'];

const hasGenerated = (floor) =>
  GENERATED_FIELDS.some((k) => {
    const v = floor[k];
    return Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v;
  });

/**
 * 撤销 / 重做：把当前状态里的生成字段带进恢复出来的快照。
 * 快照里没有、但当前带着生成内容的楼层（例如后来才建的「整套」）也带过去 —— 否则一次撤销会把图纸和记录一起丢掉。
 */
export function keepGenerated(current, restored) {
  const curFloors = (current && current.floors) || [];
  const byId = new Map(curFloors.map((f) => [f.id, f]));
  let changed = false;
  const floors = ((restored && restored.floors) || []).map((f) => {
    const cur = byId.get(f.id);
    if (!cur || GENERATED_FIELDS.every((k) => cur[k] === f[k])) return f;
    changed = true;
    return { ...f, ...Object.fromEntries(GENERATED_FIELDS.map((k) => [k, cur[k]])) };
  });
  const have = new Set(floors.map((f) => f.id));
  curFloors.forEach((f) => {
    if (have.has(f.id) || !hasGenerated(f)) return;
    changed = true;
    floors.push(f);
  });
  return changed ? { ...restored, floors } : restored;
}
