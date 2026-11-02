// 溪岸板材 · 配色 → 真实板材（纯函数，Node 里可测；SPEC §4.4 + §8 R1 / R11 / R12）。
//
// 案例、梦想家配色、一键情绪写的都是程序化材质 id（dreamers.js、cases 的 materials 不改）；
// 套到客人的家里时，公司做的两个表面（柜体 —— 含室内门、主题墙板）换成最接近的真实板材：
//   · 同一类：木 → 木纹板；柜体上的漆 / 烤漆 → 纯色板；石 → 石纹板。主题墙刷的漆、石灰墙是背景（不是墙板）→ 不换；
//   · 不多出原来没有的色相（奶油烤漆不会变成鼠尾草绿的 6162）；不踩客人的雷区；隐藏的板不用；
//   · ΔE2000 ≤ CONFIG.boards.matchDE（12）→ 换；再远就保留示意色，记下「最接近的溪岸板材：…」给界面提一句。
// 板材库是空的（出厂）、CONFIG.boards.on / realise 关掉 → 什么都不换，和以前一模一样。

import { CONFIG } from '../config.js';
import { t, L } from '../i18n.js';
import { MAT_BY_ID, fits, BOARDS, BOARD_SLOTS } from '../materials.js';
import { tagsOf } from '../moods.js';
import { CHROMATIC } from '../colorTags.js';
import { hexLab, dE00 } from './derive.js';

const cfg = () => CONFIG.boards || {};
/** 板材整个功能开着（CONFIG.boards.on） */
export const boardsOn = () => cfg().on !== false;
/** 配色要不要换成真实板材（on + realise） */
export const realiseOn = () => boardsOn() && cfg().realise !== false;
/** 多近算「最接近」（ΔE2000） */
export const matchDE = () => (Number.isFinite(+cfg().matchDE) && +cfg().matchDE > 0 ? +cfg().matchDE : 12);
/** 厂家编号给员工 / 设计师看（CONFIG.boards.factoryCode：'staff' = 只给员工；'none' = 谁都不显示） */
export const codesFor = (staff) => !!staff && cfg().factoryCode !== 'none';

const r1 = (v) => Math.round(v * 10) / 10;
const toSet = (a) => (a instanceof Set ? a : new Set(Array.isArray(a) ? a : []));

const LAB = new Map();
/** 材质 → Lab（板材用导入时量好的 lab；程序化材质用它的底色） */
export function labOf(mat) {
  const L0 = mat?.board?.rec?.lab;
  if (Array.isArray(L0) && L0.length === 3 && L0.every((v) => Number.isFinite(+v))) return L0.map(Number);
  const hex = String(mat?.color || '');
  if (!LAB.has(hex)) LAB.set(hex, hexLab(hex));
  return LAB.get(hex);
}

const chromaOf = (mat) => new Set([...tagsOf(mat)].filter((x) => CHROMATIC.includes(x)));

/**
 * 这个表面上的这个程序化材质，该换成哪一类板（null = 不换）：
 *   木 → wood；柜体上的漆（烤漆、哑光漆）→ solid；石 → stone；主题墙上的漆 / 石灰墙 → null（是背景，不是墙板）
 */
export function boardKindFor(mat, slotId) {
  if (!mat || mat.board || !BOARD_SLOTS.includes(slotId)) return null;
  if (mat.cat === 'wood') return 'wood';
  if (mat.cat === 'paint') return slotId === 'cabinetry' ? 'solid' : null;
  if (mat.cat === 'stone') return 'stone';
  return null;
}

/** 候选：这一类、放得上这个表面、没隐藏、不踩雷区（织系列哪里都放不上，fits 已经挡掉） */
export function boardCandidates(slotId, kind, { avoid } = {}) {
  const bad = toSet(avoid);
  return BOARDS.filter((m) => !m.board.hidden && m.board.kind === kind && fits(m.id, slotId) && ![...tagsOf(m)].some((x) => bad.has(x)));
}

/**
 * 最接近的溪岸板材 → { id, dE, ok, hint } | null（没有同一类的候选）
 *   ok   = ΔE2000 ≤ matchDE → 可以直接换上；
 *   hint = ΔE2000 ≤ 2 × matchDE → 不换，但值得提一句「示意色 · 最接近的溪岸板材：…」（再远就不提：黑色哑光不会被建议成白色的板）
 */
export function nearestBoard(matId, slotId, { avoid, kind } = {}) {
  const mat = MAT_BY_ID[matId];
  const k = kind || boardKindFor(mat, slotId);
  if (!k || !mat) return null;
  const fam = chromaOf(mat);
  const lab = labOf(mat);
  let best = null;
  for (const b of boardCandidates(slotId, k, { avoid })) {
    if ([...chromaOf(b)].some((x) => !fam.has(x))) continue; // 不多出原来没有的色相
    const d = dE00(lab, labOf(b));
    if (!best || d < best.d - 1e-9) best = { id: b.id, d };
  }
  return best ? { id: best.id, dE: r1(best.d), ok: best.d <= matchDE(), hint: best.d <= 2 * matchDE() } : null;
}

/**
 * 案例原板（case.boards）里这台设备认得、又放得上那个表面的 → { slot: id }。
 * 还不在板材库里的（员工先填了 23号，板材包还没导入）不算 —— 那一面先用 case.materials 里的近似材质。
 */
export function exactBoards(caseObj) {
  const out = {};
  const b = caseObj?.boards;
  if (!boardsOn() || !b || typeof b !== 'object') return out;
  for (const slot of BOARD_SLOTS) {
    const id = b[slot];
    if (typeof id === 'string' && MAT_BY_ID[id]?.board && fits(id, slot)) out[slot] = id;
  }
  return out;
}

/**
 * 一套材质 → 公司的表面换成真实板材（R12）。locked（客人家里留下来的）、exact（案例原板）的表面不动。
 * → { materials, picks }，picks = { slot: { id, from, dE, exact: false, why: 'near' } | { id: null, from, near, dE, exact: false, why: 'sample' } | { id, exact: true, why: 'set' } }
 *   why 'set'    = 这一面本来就是一块溪岸板材（不换，只记下来）；
 *   why 'near'   = 换成了最接近的溪岸板材；
 *   why 'sample' = 太远，保留示意色；near = 最接近的那一块（界面：「示意色 · 最接近的溪岸板材：…」）；远到 2 × matchDE 以外 = 不记
 */
export function toBoards(materials0, { locked = null, avoid = [], exact = null, slots = BOARD_SLOTS } = {}) {
  const materials = { ...(materials0 || {}) };
  const picks = {};
  if (!realiseOn() || !BOARDS.length) return { materials, picks };
  for (const slot of slots) {
    if (!BOARD_SLOTS.includes(slot) || locked?.[slot] != null || exact?.[slot]) continue;
    const cur = MAT_BY_ID[materials[slot]];
    if (!cur) continue;
    // 已经是一块板（员工 / 客人自己选的、案例原板）：原样，记一笔（简报、WhatsApp 才说得出它）
    if (cur.board) {
      if (fits(cur.id, slot)) picks[slot] = { id: cur.id, from: cur.id, exact: true, why: 'set' };
      continue;
    }
    const r = nearestBoard(cur.id, slot, { avoid });
    if (!r || (!r.ok && !r.hint)) continue;
    if (r.ok) {
      materials[slot] = r.id;
      picks[slot] = { id: r.id, from: cur.id, dE: r.dE, exact: false, why: 'near' };
    } else picks[slot] = { id: null, from: cur.id, near: r.id, dE: r.dE, exact: false, why: 'sample' };
  }
  return { materials, picks };
}

// ───────────────────────── 给人看的名字 ─────────────────────────

/** 板材的显示名（当前语言）：「7号 · 黑胡桃」「2810 · 墨绿」—— 厂家编号永远不在里面 */
export const boardLabel = (id) => (MAT_BY_ID[id]?.board ? L(MAT_BY_ID[id]) : '');

/** 厂家编号（XA-TP-01、AG337…）；色号（2810、P1）已经在名字里，不再重复 → ''。只能用在员工 / 设计师看的地方 */
export function factoryCode(id) {
  const b = MAT_BY_ID[id]?.board;
  const code = String(b?.code || '');
  if (!code || /^(\d{3,6}|P\d{1,2})$/.test(code)) return '';
  return code;
}

/** 同一个厂家编号的别的板（「8号也是这个编号」） */
export function sameCode(id) {
  const code = factoryCode(id);
  if (!code) return [];
  return BOARDS.filter((m) => m.id !== id && m.board.code === code).map((m) => m.id);
}

/**
 * 一行板材名：客人 = 「7号 · 黑胡桃」；员工 / 设计师 = 「7号 · 黑胡桃（溪岸 · XA-TP-01）」（没有厂家编号 =「（溪岸）」）。
 * 不认得的 id（板材包还没导入）→ 从 id 猜出板号：sail-23 →「23号」、sail-c2810 →「2810」
 */
export function boardLine(id, { staff = false } = {}) {
  const m = MAT_BY_ID[id];
  if (!m?.board) return idLabel(id);
  const code = codesFor(staff) ? factoryCode(id) : '';
  if (!staff) return L(m);
  return code ? t('{0}（溪岸 · {1}）', [L(m), code]) : t('{0}（溪岸）', [L(m)]);
}

/** 还不在板材库里的 id → 员工认得的板号（sail-23 →「23号」、sail-c2810 →「2810」、别的原样） */
export function idLabel(id) {
  const s = String(id || '');
  let m = /^sail-(\d{1,4})(?:-[a-z])?$/.exec(s);
  if (m) return t('{0}号', [m[1]]);
  m = /^sail-c([a-z0-9]+)$/.exec(s);
  if (m) return m[1].toUpperCase();
  return s;
}
