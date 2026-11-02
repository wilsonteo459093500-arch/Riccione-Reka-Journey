// 把一个案例「实现」在客人自己的家里（SPEC §8.2）—— 纯函数，Node 里可测。
//
//   案例的材质（全屋案例：温暖预设 ⊕ 案例的主牌 ⊕ 案例自己写的；只做几个房间的案例：客人自己的牌 ⊕ 案例写的）
//   → 锁住客人家里留下来的（地板 / 墙 / 柜子 / 沙发）：锁住的表面后面任何一步都不碰，踩到雷区也不换（那是客人家的现实，只给设计师提示）
//   → 雷区（avoidMaterials）、生活方式（有猫狗 → 沙发不用丝绒；天天爆炒 / 有小孩 → 人造石台面）只换没锁的表面
//   → 调和（harmonise）：留下来的颜色偏暖、案例偏冷（或反过来）差得多时，只把软装（地毯、窗帘、点缀、床品）换成两者之间的色温
//   → 明暗建议（只建议、从不自动换）：留下来的深色地板 + 深色墙 → 建议墙亮一点；深色墙 + 深色地板 → 建议浅一点的木地板。
//   → 溪岸板材（SPEC §4.4 + R11 d / R12）：案例原板（case.boards，这台设备认得的）先盖上去；最后把公司做的表面
//     （柜体、主题墙板）里还是程序化材质的，换成最接近的真实板材（boards/match.js toBoards）。锁住的从来不换。
// → { materials, locked, softened, suggestions, boardPicks, mood, time, style, caseId, rev }

import { MATERIALS, MAT_BY_ID, SLOT_BY_ID, fits } from './materials.js';
import { MOOD_BY_ID, tagsOf } from './moods.js';
import { DREAMER_BY_CODE } from './dreamers.js';
import { avoidMaterials, lifestyleSwaps } from './profile.js';
import { COLOR_TAGS, CHROMATIC } from './colorTags.js';
import { exactBoards, toBoards } from './boards/match.js';

/** 软装：调和色温时只动这几个 */
export const SOFT_SLOTS = ['rugs', 'curtains', 'accents', 'bedding'];
/** 客人家里可以「留下来」的表面：K 屏的 id → 材质表面 */
export const LOCKABLE = { floor: 'floor', walls: 'walls', cabinetry: 'cabinetry', sofa: 'upholstery' };
const LOCK_SLOTS = Object.values(LOCKABLE);
/** 色温差到这么多才调和（warm 是 -1 … 1） */
export const TEMP_GAP = 0.6;

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const ALL = Object.keys(SLOT_BY_ID);

/** keep（K 屏的答案：slot 或 id 做 key，值 = 材质 id | 'unsure' | null）→ { slot: matId }，只收放得上那个表面的真材质 */
export function locksOf(keep) {
  const out = {};
  if (!isObj(keep)) return out;
  for (const [k, slot] of Object.entries(LOCKABLE)) {
    const id = keep[slot] ?? keep[k];
    if (typeof id === 'string' && MAT_BY_ID[id] && fits(id, slot)) out[slot] = id;
  }
  return out;
}

const avoidSet = (avoid) => new Set(Array.isArray(avoid) ? avoid : avoid instanceof Set ? [...avoid] : []);
const safe = (m, bad) => !!m && ![...tagsOf(m)].some((x) => bad.has(x));
const moodDist = (a, b) => Math.sqrt(a.mood.reduce((s, v, i) => s + (v - b.mood[i]) ** 2, 0));
const chroma = (id) => new Set((COLOR_TAGS[id] || []).filter((x) => CHROMATIC.includes(x)));

/** 一组表面的平均色温（w = 每个表面的权重） */
function meanWarm(materials, slots, weight = () => 1) {
  let s = 0;
  let n = 0;
  for (const slot of slots) {
    const m = MAT_BY_ID[materials[slot]];
    if (!m) continue;
    const w = weight(slot);
    s += m.warm * w;
    n += w;
  }
  return n > 0 ? s / n : null;
}

/**
 * 调和：locked = { slot: matId }（客人家里留下来的）。
 * T_lock = 留下来的地板 / 墙 / 柜子的平均色温（沙发算半个）；T_case = 没锁的墙 / 主题墙 / 柜子 / 沙发 / 地板的加权平均。
 * 差 ≥ 0.6 → 每个没锁的软装换成「色温最接近两者中间、明暗和原来差不多、情绪相近」又不踩雷的材质（换了才记 softened why:'temp'）。
 * 明暗建议只放进 suggestions（{ slot, from, to, why:'light' }），从不自动套用。
 */
export function harmonise(materials0, locked0 = {}, { avoid = [] } = {}) {
  const materials = { ...materials0 };
  const locked = isObj(locked0) ? locked0 : {};
  const bad = avoidSet(avoid);
  const softened = [];
  const suggestions = [];
  const isLocked = (slot) => locked[slot] != null;
  const lockSlots = ['floor', 'walls', 'cabinetry', 'upholstery'].filter(isLocked);
  if (!lockSlots.length) return { materials, softened, suggestions };
  const tLock = meanWarm(materials, lockSlots, (s) => (s === 'upholstery' ? 0.5 : 1));
  const caseSlots = ['walls', 'feature', 'cabinetry', 'upholstery', 'floor'].filter((s) => !isLocked(s));
  const tCase = meanWarm(materials, caseSlots, (s) => SLOT_BY_ID[s]?.weight ?? 0.1);
  if (tLock != null && tCase != null && Math.abs(tLock - tCase) >= TEMP_GAP) {
    const mid = (tLock + tCase) / 2;
    for (const slot of SOFT_SLOTS) {
      if (isLocked(slot)) continue;
      const cur = MAT_BY_ID[materials[slot]];
      if (!cur) continue;
      let best = null;
      let bestD = Infinity;
      for (const m of MATERIALS) {
        if (!fits(m.id, slot) || !safe(m, bad)) continue;
        const d = Math.abs(m.warm - mid) + 0.6 * Math.abs(m.light - cur.light) + 0.3 * moodDist(m, cur);
        if (d < bestD - 1e-9) {
          bestD = d;
          best = m;
        }
      }
      if (best && best.id !== cur.id) {
        softened.push({ slot, from: cur.id, to: best.id, why: 'temp' });
        materials[slot] = best.id;
      }
    }
  }
  // 明暗：深色地板 + 深色墙（地板留下来了）→ 墙亮一点；深色墙 + 深色地板（墙留下来了）→ 浅一点的木地板
  const floor = MAT_BY_ID[materials.floor];
  const walls = MAT_BY_ID[materials.walls];
  if (floor && walls && isLocked('floor') && !isLocked('walls') && floor.light < 0.3 && walls.light < 0.45) {
    const fam = chroma(walls.id);
    const paints = MATERIALS.filter((m) => fits(m.id, 'walls') && m.light > walls.light + 0.15 && safe(m, bad));
    const same = fam.size ? paints.filter((m) => [...chroma(m.id)].some((x) => fam.has(x))).sort((a, b) => b.light - a.light) : [];
    const fallback = (walls.warm >= 0.2 ? ['warm-white', 'gallery-white'] : ['gallery-white', 'warm-white']).map((id) => MAT_BY_ID[id]).find((m) => m && safe(m, bad) && m.id !== walls.id);
    const to = same[0] || fallback;
    if (to) suggestions.push({ slot: 'walls', from: walls.id, to: to.id, why: 'light' });
  }
  if (floor && walls && isLocked('walls') && !isLocked('floor') && walls.light < 0.3 && floor.light < 0.35) {
    const woods = MATERIALS.filter((m) => m.cat === 'wood' && fits(m.id, 'floor') && m.light >= 0.55 && safe(m, bad));
    woods.sort((a, b) => Math.abs(a.warm - floor.warm) - Math.abs(b.warm - floor.warm) || b.light - a.light);
    if (woods[0]) suggestions.push({ slot: 'floor', from: floor.id, to: woods[0].id, why: 'light' });
  }
  return { materials, softened, suggestions };
}

/** 案例的起点材质（还没锁、没避雷区） */
export function caseBase(caseObj, profile) {
  const cozy = MOOD_BY_ID.cozy.materials;
  if (!caseObj) {
    const d = DREAMER_BY_CODE[profile?.code];
    return { ...cozy, ...(d?.materials || {}), ...(profile?.materials || {}) };
  }
  const cm = isObj(caseObj.materials) ? caseObj.materials : {};
  if (caseObj.scope === 'rooms') {
    const d = DREAMER_BY_CODE[profile?.code];
    return { ...cozy, ...(d?.materials || {}), ...(profile?.materials || {}), ...cm };
  }
  const primary = DREAMER_BY_CODE[caseObj.style?.dreamers?.[0]];
  return { ...cozy, ...(primary?.materials || {}), ...cm };
}

/**
 * caseObj：案例（manifest 里的一条）或 null（= 客人自己的牌）。keep：K 屏的答案（或 keepLocks(home) 的结果）。
 * profile：客人的档案（雷区 avoid、生活 life、牌 code / materials）。base：给了就从这组材质开始（例如设计师已经在改的方案）。
 * raw：true = 不调和（「还原案例原样」：锁照样保留、雷区照样避开）。
 */
export function realiseCase({ caseObj = null, keep = null, profile = null, base = null, raw = false } = {}) {
  const start = { ...(isObj(base) ? base : caseBase(caseObj, profile)) };
  // 案例原板（设计师真的用的那几块）先盖上去 —— 在「放不上就退回温暖预设」之前（不认得的 id 不盖：那一面留着 case.materials 的近似材质）
  const exact = exactBoards(caseObj);
  Object.assign(start, exact);
  // 不合法的（放不上那个表面）退回温暖预设
  for (const s of ALL) if (start[s] && !fits(start[s], s)) start[s] = MOOD_BY_ID.cozy.materials[s];
  const locked = locksOf(keep);
  const isLocked = (slot) => locked[slot] != null;
  let materials = { ...start, ...locked };
  const softened = [];
  /** 公司的表面用的是哪块板：{ slot: { id, exact, why, dE?, near?, from? } }（界面：「案例原板」/「最接近」/「示意色」） */
  const boardPicks = {};
  for (const [slot, id] of Object.entries(exact)) if (!isLocked(slot)) boardPicks[slot] = { id, exact: true, why: 'case' };
  // 雷区：只换没锁的
  const avoid = Array.isArray(profile?.avoid) ? profile.avoid : [];
  if (avoid.length) {
    const r = avoidMaterials(materials, avoid);
    for (const sw of r.swaps) {
      if (isLocked(sw.slot)) continue;
      materials[sw.slot] = sw.to;
      softened.push({ slot: sw.slot, from: sw.from, to: sw.to, why: 'avoid' });
      // 案例原板踩到客人的雷区被换掉了：记下来，员工看得到为什么不是案例那块
      if (boardPicks[sw.slot]?.exact) boardPicks[sw.slot] = { id: MAT_BY_ID[sw.to]?.board ? sw.to : null, from: sw.from, exact: false, why: 'avoid' };
    }
  }
  // 生活方式：只换没锁的
  const ls = lifestyleSwaps(materials, { life: profile?.life || {}, avoid });
  for (const sw of ls.swaps) {
    if (isLocked(sw.slot)) continue;
    materials[sw.slot] = sw.to;
    softened.push({ slot: sw.slot, from: sw.from, to: sw.to, why: sw.why });
  }
  let suggestions = [];
  if (!raw) {
    const h = harmonise(materials, locked, { avoid });
    materials = h.materials;
    softened.push(...h.softened);
    suggestions = h.suggestions;
  }
  // 公司的表面换成最接近的真实板材（「还原案例原样」= raw：只用案例原板，不再换）
  if (!raw) {
    const keepExact = Object.fromEntries(Object.entries(boardPicks).filter(([, p]) => p.exact).map(([s]) => [s, true]));
    const tb = toBoards(materials, { locked, avoid, exact: keepExact });
    materials = tb.materials;
    // 案例原板被雷区换掉的那一面：还是记「为什么不是案例那块」（why 'avoid'），换上的板跟着更新
    for (const [slot, p] of Object.entries(tb.picks)) boardPicks[slot] = boardPicks[slot]?.why === 'avoid' ? { ...boardPicks[slot], id: p.id ?? boardPicks[slot].id, near: p.near, dE: p.dE } : p;
  }
  // 锁住的再写一次（保险：上面任何一步都不该动它们）
  Object.assign(materials, locked);
  const d = DREAMER_BY_CODE[profile?.code];
  const mood = caseObj?.mood && MOOD_BY_ID[caseObj.mood] ? caseObj.mood : caseObj ? 'cozy' : d ? 'dreamer' : 'cozy';
  const time = Number.isFinite(caseObj?.time) ? caseObj.time : MOOD_BY_ID[caseObj ? mood : d?.mood]?.time ?? 18.4;
  return {
    materials,
    locked,
    softened,
    suggestions,
    boardPicks,
    mood,
    time,
    style: isObj(caseObj?.furniture) ? { ...caseObj.furniture } : {},
    caseId: caseObj?.id ?? null,
    rev: caseObj?.rev ?? null,
  };
}

/** 这个锁住的表面叫什么（「地板」「沙发」）—— 中文原文，界面用 t() */
export const LOCK_NAME = { floor: '地板', walls: '墙面', cabinetry: '柜子', upholstery: '沙发' };
export { LOCK_SLOTS };
