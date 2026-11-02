// 设计师简报的数据（v1）—— 扩展点（SPEC §6.1）。README 里的清单和 schedule.csv 都从这一份生成。
//
// guest-journey v2 会填 property（房子类型、层数、州和地区、建筑面积）、chosenCase（客人选的案例）、
// kept（客人从旧家带过来的东西）、profile（只给员工看的摘要：梦想家代号、收纳目标），并用同一份数据出可打印的简报；
// 字段只加不改名。v1 不把客人档案（profile）里的任何东西写进文件。
// exportBundle(project, { brief }) 可以直接传进来一份更完整的（v2 的）brief。

import { buildScene } from './scene.js';
import { SLOTS } from '../../shared/materials.js';
import { CAT_INFO, SOURCED, slotName } from './catalog.js';
import { bi } from './names.js';

const mm = (v) => Math.round(v * 1000);
const CAT_RANK = { case: 0, door: 1, fix: 2, furn: 3, soft: 4 };

/**
 * @param {object} project
 * @param {object} [scene] buildScene(project) 的结果（已经算好就传进来）
 */
export function designerBrief(project, scene = buildScene(project)) {
  const floors = scene.floors.map((F) => ({
    id: F.id,
    code: F.code,
    name: F.name,
    ceil: F.ceil,
    height: F.height,
    indoorArea: Math.round(F.rooms.filter((r) => r.area != null && !r.outdoor).reduce((s, r) => s + r.area, 0) * 10) / 10,
  }));
  const rooms = scene.floors.flatMap((F) => F.rooms.filter((r) => r.net).map((r) => ({ id: r.id, floor: F.code, type: r.type, name: r.name, net: [mm(r.net.w), mm(r.net.d)], area: Math.round(r.area * 100) / 100 })));
  const items = scene.floors
    .flatMap((F) =>
      F.items.map((it) => ({
        id: String(it.id),
        floor: F.code,
        room: it.room,
        kind: it.kind,
        name: it.name,
        category: it.cat,
        ours: !!CAT_INFO[it.cat]?.ours,
        size: [it.W, it.D, it.H],
        ftRun: Math.round((it.W / 304.8) * 2) / 2,
        materials: it.mats.map((m) => ({ slot: m.slot, id: m.id, zh: m.zh, en: m.en, slotZh: m.slotZh, slotEn: m.slotEn, sourced: !!m.sourced })),
      }))
    )
    .sort((a, b) => a.floor.localeCompare(b.floor) || CAT_RANK[a.category] - CAT_RANK[b.category] || a.room.zh.localeCompare(b.room.zh) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  const doors = scene.floors.flatMap((F) =>
    F.openings
      .filter((o) => o.kind === 'door')
      .map((o) => ({ id: String(o.id), floor: F.code, room: o.room || bi(''), size: [mm(o.b - o.a), mm(Math.min(o.head ?? 2.1, F.ceil - 0.05))], thick: mm(o.t) }))
  );
  const materials = SLOTS.map((s) => {
    const m = scene.materials[s.id];
    return { slot: s.id, slotName: slotName(s.id), id: m.id, zh: m.mat.zh, en: m.mat.en, hex: m.hex, sourced: !!SOURCED[s.id] };
  });
  return {
    v: 1,
    project: { id: scene.id, name: scene.name, createdAt: scene.createdAt, updatedAt: scene.updatedAt, exportedAt: scene.now.toISOString() },
    property: null,
    chosenCase: null,
    kept: [],
    profile: null,
    floors,
    rooms,
    items,
    doors,
    materials,
    stats: scene.stats,
    notes: [bi('概念示意，尺寸以现场量尺为准')],
  };
}
