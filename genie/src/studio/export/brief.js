// 设计师简报的数据（v1）—— 扩展点（SPEC §6.1）。README 里的清单和 schedule.csv 都从这一份生成。
//
// guest-journey v2 会填 property（房子类型、层数、州和地区、建筑面积）、chosenCase（客人选的案例）、
// kept（客人从旧家带过来的东西）、profile（只给员工看的摘要：梦想家代号、收纳目标），并用同一份数据出可打印的简报；
// 字段只加不改名。v1 不把客人档案（profile）里的原始答案写进文件（愿望、雷区、一句话心愿、预算都不写）。
// 唯一从档案「算出来」的是 series：建议客人拿溪岸五大系列的哪一个（老板 2026-11-13，docs/showcase/SERIES.md §4）——
// 只有系列的名字，不带理由（理由里会说到客人的愿望）。README 那一行用 seriesLine(brief)。
// exportBundle(project, { brief }) 可以直接传进来一份更完整的（v2 的）brief。

import { buildScene } from './scene.js';
import { SLOTS } from '../../shared/materials.js';
import { recommendSeries, SERIES_BY_KEY, seriesKeyOf } from '../../shared/series.js';
import { CAT_INFO, SOURCED, slotName } from './catalog.js';
import { bi, biFill } from './names.js';

const mm = (v) => Math.round(v * 1000);
const CAT_RANK = { case: 0, door: 1, fix: 2, furn: 3, soft: 4 };

// ───────────────────────── 建议的溪岸系列 ─────────────────────────

/** 第二个系列只在分数和第一名差不到这么多时才写（差得远 = 只写一个，设计师不会以为两个都一样合适） */
export const SERIES_SECOND_GAP = 0.05;

/**
 * 建议客人拿的溪岸系列 → [{ key, zh, en }]：最合适的那一个；第二个分数够近（SERIES_SECOND_GAP）才有。
 * 和客人那边是同一套 recommendSeries：客人自己的四条轴、明暗线条、牌、愿望 + 客人挑的参考案例（写了系列的分量最重）。
 *   profile：方案里的客人档案（project.profile）；没有 / 什么都没答（五个一样分）→ []。
 *   cases：案例库（可选）—— 有的话，档案里挑过的案例（{ id, rev, title }）换成完整的案例，系列和风格才算得进去。
 */
export function briefSeries(profile, { cases = null } = {}) {
  if (!profile || typeof profile !== 'object') return [];
  const lib = Array.isArray(cases) ? new Map(cases.filter((c) => c?.id).map((c) => [c.id, c])) : null;
  const chosen = (Array.isArray(profile.cases) ? profile.cases : []).filter((c) => c && typeof c === 'object').map((c) => lib?.get(c.id) || c);
  const rec = recommendSeries(profile, { chosen });
  if (!rec.length || rec.every((r) => r.score === rec[0].score)) return [];
  const top = rec.slice(0, 2).filter((r, i) => i === 0 || rec[0].score - r.score <= SERIES_SECOND_GAP + 1e-9);
  return top.map((r) => SERIES_BY_KEY[r.key]).map((s) => ({ key: s.key, zh: s.zh, en: s.en }));
}

/**
 * README 里的那一行（中英）：「建议客人用的溪岸系列：空山」/「…：空山（也可以看看：织）」；brief 没有系列 → null。
 * 别处传进来的（v2）brief 没有 series 字段也不出错。
 */
export function seriesLine(brief) {
  const list = (Array.isArray(brief?.series) ? brief.series : []).map((x) => SERIES_BY_KEY[seriesKeyOf(x)]).filter(Boolean);
  if (!list.length) return null;
  const name = (s) => ({ zh: s.zh, en: s.en });
  return list.length > 1 ? biFill('建议客人用的溪岸系列：{0}（也可以看看：{1}）', [name(list[0]), name(list[1])]) : biFill('建议客人用的溪岸系列：{0}', [name(list[0])]);
}

/**
 * @param {object} project
 * @param {object} [scene] buildScene(project) 的结果（已经算好就传进来）
 * @param {{ cases?: object[] }} [opts] cases：案例库（可选，见 briefSeries）
 */
export function designerBrief(project, scene = buildScene(project), { cases = null } = {}) {
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
    series: briefSeries(project?.profile, { cases }),
    floors,
    rooms,
    items,
    doors,
    materials,
    stats: scene.stats,
    notes: [bi('概念示意，尺寸以现场量尺为准')],
  };
}
