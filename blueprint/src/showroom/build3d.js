// 展厅播放 · 3D 户型开场：用设计师核对过坐标的 3D 户型图（floor.plan3d），排出一串关键帧：
//   墙从地面慢慢升起（墙高 1mm → 满高）→ 固定柜体一组组出现 → 家具一组组出现 → 完整 3D 图（停点）。
// 全部按坐标画（buildScene / paintScene），不用 AI。纯函数（不碰 DOM），Node 可测；画帧在 build3dCache.js。
//
// 镜头不动：每一帧都用同样的参数 build 完整场景，再按 id 留下这一帧该出现的实体（只传部分物件会让画框跟着变、镜头跳）。

import { buildScene } from '../plan3d/scene.js';
import { renderGeo } from '../plan3d/edit.js';
import { floorPlan3d, normalizeView, sceneOptions } from '../ai/plan3d.js';

export const BUILD_LONG_EDGE = 1600; // 关键帧的长边（16:9 → 1600 × 900，放到 1920 的版面上）
export const WALL_STEPS = [0.001, 0.18, 0.4, 0.62, 0.82, 1]; // 墙升起的几帧（占满高的比例）
export const MAX_ITEM_FRAMES = 8;

// 先出现的：固定柜体（全屋定制的主角）；后出现的：家具、洁具
const CABINET_KINDS = ['tall', 'glass', 'hung', 'low', 'desk', 'shelf'];
const kindRank = (k) => {
  const i = CABINET_KINDS.indexOf(k);
  if (i >= 0) return 0;
  if (k === 'column' || k === 'block') return -1; // 柱子、实心体：跟着墙一起（结构）
  return 1;
};

/** 这层楼能不能做 3D 开场 */
export function hasPlan3d(floor) {
  const p3 = floorPlan3d(floor);
  return !!(p3?.geo && (p3.geo.rooms || []).length);
}

/** 实体属于哪件物件（id = 物件 id，或「物件 id-部件」）；墙、门窗 → null */
function ownerOf(solidId, itemIds) {
  if (itemIds.has(solidId)) return solidId;
  const k = solidId.lastIndexOf('-');
  for (let i = k; i > 0; i = solidId.lastIndexOf('-', i - 1)) {
    const head = solidId.slice(0, i);
    if (itemIds.has(head)) return head;
  }
  return null;
}

const filterScene = (scene, keep) => {
  const solids = scene.solids.filter((sd) => keep(sd));
  const ids = new Set(solids.map((sd) => sd.id));
  return { ...scene, solids, shadows: scene.shadows.filter((sh) => ids.has(sh.id)) };
};

/**
 * 关键帧场景（每一帧一个 buildScene 结果，已经按这一帧过滤）
 * @param {object} geo   floor.plan3d.geo
 * @param {object} view  floor.plan3d.view（正俯视看不到墙升起 → 改成立体俯视）
 * @returns {{ scenes:object[], wallFrames:number, groups:string[][], final:object, w, h }|null}
 */
export function build3dScenes(geo, view, { longEdge = BUILD_LONG_EDGE } = {}) {
  if (!geo || !(geo.rooms || []).length) return null;
  const g = renderGeo(geo);
  const v = normalizeView(view);
  const base = sceneOptions({ ...v, view: v.view === 'top' ? 'persp' : v.view });
  const fullWall = base.wallMm || (base.view === 'iso' ? 650 : 1100);
  const cut = base.cutMm !== undefined ? base.cutMm : base.view === 'iso' ? 1100 : fullWall;
  const opts = { ...base, wallMm: fullWall, cutMm: cut, ratio: 16 / 9, longEdge };
  const final = buildScene(g, opts);

  const items = g.items || [];
  const itemIds = new Set(items.map((it) => it.id));
  const structural = new Set(items.filter((it) => kindRank(it.kind) < 0).map((it) => it.id));
  // 出现顺序：柜体在前、家具在后；同一类从左到右
  const cx = (it) => (it.box ? (it.box[0] + it.box[2]) / 2 : 0);
  const order = items
    .filter((it) => !structural.has(it.id))
    .slice()
    .sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || cx(a) - cx(b));
  const nGroups = Math.min(MAX_ITEM_FRAMES, order.length);
  const groups = Array.from({ length: nGroups }, (_, k) =>
    order.slice(Math.floor((k * order.length) / nGroups), Math.floor(((k + 1) * order.length) / nGroups)).map((it) => it.id)
  );

  const scenes = [];
  // 墙升起：只有墙（和柱子等结构）；门窗在墙到满高那一帧一起出现
  for (const t of WALL_STEPS) {
    const sc = t >= 1 ? final : buildScene(g, { ...opts, wallMm: Math.max(1, fullWall * t) });
    scenes.push(
      filterScene(sc, (sd) => {
        const owner = ownerOf(sd.id, itemIds);
        if (owner) return structural.has(owner) && t >= 1;
        return sd.kind === 'wall' || t >= 1;
      })
    );
  }
  // 物件一组组出现
  const shown = new Set(structural);
  for (const grp of groups) {
    grp.forEach((id) => shown.add(id));
    const now = new Set(shown);
    scenes.push(
      filterScene(final, (sd) => {
        const owner = ownerOf(sd.id, itemIds);
        return !owner || now.has(owner);
      })
    );
  }
  return { scenes, wallFrames: WALL_STEPS.length, groups, final, w: final.w, h: final.h };
}

// ---------------------------------------------------------------------------
// 房间：3D 图上的房间（图纸原文，常是英文或空）↔ 方案里的空间名（view 页的 room / roomEn）
// ---------------------------------------------------------------------------

const ROOM_WORDS = [
  ['客厅', 'living', 'lounge', 'family', 'hall'],
  ['餐厅', 'dining'],
  ['厨房', 'kitchen', 'pantry', 'wet', 'dry'],
  ['主人房', '主卧', 'master'],
  ['卧室', '房间', '睡房', 'bed', 'bedroom'],
  ['书房', 'study', 'library', 'office'],
  ['卫生间', '浴室', '厕所', 'bath', 'toilet', 'wc', 'powder'],
  ['玄关', '入户', 'entrance', 'foyer', 'lobby', 'entry'],
  ['洗衣', '后阳台', 'laundry', 'yard', 'utility'],
  ['阳台', 'balcony', 'terrace'],
  ['储物', '储藏', 'store', 'storage'],
  ['茶室', 'tea'],
  ['娱乐', 'ktv', 'entertainment', 'media', 'theatre', 'theater'],
  ['衣帽间', 'walk-in', 'wardrobe', 'closet', 'dressing'],
];
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const groupsOf = (s) => {
  const t = norm(s);
  if (!t) return [];
  const out = [];
  ROOM_WORDS.forEach((words, k) => {
    if (words.some((w) => (/^[a-z-]+$/.test(w) ? new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(t) : t.includes(w)))) out.push(k);
  });
  return out;
};

/**
 * 方案里的一个空间对到 3D 图上的哪个房间：先比原文（含 / 被含），再比关键词组（客厅 ↔ LIVING）
 * @param {{ name:string }[]} areas  scene.floorAreas
 * @param {{ room?:string, roomEn?:string }} slide
 * @returns {number}  areas 的序号；对不上 = -1
 */
export function matchRoom(areas, slide) {
  const names = [slide?.room, slide?.roomEn].map(norm).filter(Boolean);
  if (!names.length) return -1;
  let best = -1;
  let bestScore = 0;
  (areas || []).forEach((a, i) => {
    const n = norm(a.name);
    if (!n) return;
    let score = 0;
    if (names.some((s) => s === n)) score = 3;
    else if (names.some((s) => s.includes(n) || n.includes(s))) score = 2;
    else {
      const ga = groupsOf(n);
      // 主人房 / MASTER BEDROOM 也含「bed」：组越具体（越靠前）越好
      if (names.some((s) => groupsOf(s).some((k) => ga.includes(k)))) score = 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}
