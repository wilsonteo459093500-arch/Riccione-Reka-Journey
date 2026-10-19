// 工作室的方案：存本机（localStorage）+ 分享链接（#s=…）+ 平面图底图（IndexedDB，图片太大不放 localStorage）。
// 分享链接打开的是「自己的一份」（新 id + sharedFrom），不会盖掉这台设备上的原稿。
//
// 多层（plan v2）：读进来的一律变成 v2（migrateProject），每件家具都有 floor。
// 存起来 / 分享出去的是「存档形」（toStoredProject）：plan 顶层多一份一楼的镜像（rooms / openings / wallH），
// 一楼的家具放 furniture、楼上的放 furnitureUpper —— 还在跑旧版的展厅 iPad 打开也看得到完整的一楼，楼上原样留着。

import { templatePlan, uid, migratePlan } from './plan/model.js';
import { furnish } from './engine/furnish.js';
import { MOOD_BY_ID } from '../shared/moods.js';
import { DREAMER_BY_CODE } from '../shared/dreamers.js';
import { avoidMaterials, packJSON, unpackJSON } from '../shared/profile.js';
import { t } from '../shared/i18n.js';

const LIST_KEY = 'genie.studio.projects.v1';
const CUR_KEY = 'genie.studio.current';
const SETTINGS_KEY = 'genie.settings.v1';
const KEEP = 40; // 本机最多留几份方案

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

/** 「你的家」里 3D 用得到的部分：不带链接里的小平面图（方案里本来就有平面图） */
function homeForStudio(h) {
  if (!isObj(h)) return undefined;
  const plan = isObj(h.plan) ? (({ inline, ...rest }) => rest)(h.plan) : h.plan;
  return { ...h, plan };
}

/** 档案里 3D 用得到的部分（链接短一点）。许愿之旅 v2 多了：home（你的家）、cases（选的参考案例 { id, rev, title }）、caseId */
export function profileForStudio(p) {
  if (!p) return null;
  const { id, name, code, axes, hidden, life, storage, avoid, materials, wishes, createdAt } = p;
  const out = { id, name, code, axes, hidden, life, storage, avoid, materials, wishes, createdAt };
  if (isObj(p.home)) out.home = homeForStudio(p.home);
  if (Array.isArray(p.cases)) out.cases = p.cases.filter((c) => isObj(c) && c.id).map(({ id: cid, rev, title }) => ({ id: cid, rev: rev || 1, title: isObj(title) ? { zh: title.zh || '', en: title.en || '' } : { zh: String(title || ''), en: '' } })).slice(0, 3);
  if (p.caseId !== undefined) out.caseId = p.caseId ?? null;
  return out;
}

/** 客人的雷区：任何一组材质套进 3D 之前都过一遍（情绪预设、默认材质） */
export function safeMaterials(materials, profile) {
  const avoid = profile?.avoid || [];
  if (!avoid.length) return { materials: { ...materials }, swaps: [] };
  return avoidMaterials(materials, avoid);
}

// ───────────────────────── v1 → v2、存档形 ─────────────────────────

/** 任何版本的方案 → plan v2；每件家具记下它在哪一层（按房间；房间找不到 → 原来写的那层 / 一楼）。幂等 */
export function migrateProject(p) {
  if (!isObj(p)) return p;
  const plan = migratePlan(p.plan);
  const byRoom = new Map();
  for (const f of plan.floors) for (const r of f.rooms) byRoom.set(r.id, f.id);
  const fids = new Set(plan.floors.map((f) => f.id));
  const f0 = plan.floors[0].id;
  const seen = new Set();
  const furniture = [];
  for (const it of [...(Array.isArray(p.furniture) ? p.furniture : []), ...(Array.isArray(p.furnitureUpper) ? p.furnitureUpper : [])]) {
    if (!isObj(it) || (it.id != null && seen.has(it.id))) continue;
    if (it.id != null) seen.add(it.id);
    const floor = byRoom.get(it.room) ?? (fids.has(it.floor) ? it.floor : f0);
    furniture.push(it.floor === floor ? it : { ...it, floor });
  }
  const { furnitureUpper, ...rest } = p;
  return { ...rest, plan, furniture };
}

/** 存档形：plan 加一楼的镜像（旧版看得懂），家具分一楼 / 楼上 */
export function toStoredProject(p) {
  if (!isObj(p) || !p.plan) return p;
  const m = migrateProject(p);
  const f0 = m.plan.floors[0];
  const lower = m.furniture.filter((i) => i.floor === f0.id);
  const upper = m.furniture.filter((i) => i.floor !== f0.id);
  const out = { ...m, plan: { ...m.plan, rooms: f0.rooms, openings: f0.openings, wallH: f0.ceil }, furniture: lower };
  if (upper.length) out.furnitureUpper = upper;
  return out;
}

/** 存档形 → v2。旧版的 build 改过一楼的话（镜像和 floors[0] 不一样了），一楼以镜像为准、楼上照留 */
export function fromStoredProject(s) {
  if (!isObj(s)) return s;
  let plan = s.plan;
  if (isObj(plan) && Array.isArray(plan.floors) && plan.floors.length && isObj(plan.floors[0]) && Array.isArray(plan.rooms)) {
    const f0 = plan.floors[0];
    const J = (x) => JSON.stringify(x ?? []);
    const same = J(plan.rooms) === J(f0.rooms) && J(plan.openings) === J(f0.openings) && (plan.wallH == null || plan.wallH === f0.ceil);
    if (!same) plan = { ...plan, floors: [{ ...f0, rooms: plan.rooms, openings: Array.isArray(plan.openings) ? plan.openings : [], ceil: plan.wallH ?? f0.ceil }, ...plan.floors.slice(1)] };
  }
  return migrateProject({ ...s, plan });
}

// ───────────────────────── 方案 ─────────────────────────

export function createProject({ plan, profile = null, mood = null, name } = {}) {
  const pl = migratePlan(plan || templatePlan('condo3'));
  const prof = profileForStudio(profile);
  const dreamer = prof && DREAMER_BY_CODE[prof.code];
  const m = MOOD_BY_ID[mood] || (dreamer ? null : MOOD_BY_ID.cozy);
  const materials = safeMaterials({ ...(m?.materials || MOOD_BY_ID.cozy.materials), ...(prof?.materials || {}) }, prof).materials;
  const time = m?.time ?? (dreamer ? MOOD_BY_ID[dreamer.mood]?.time : 18.4) ?? 18.4;
  return {
    id: uid('p'),
    name: name || (prof?.name ? t('{0} 的梦想家', [prof.name]) : t(pl.name) || t('新方案')),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    plan: pl,
    furniture: furnish(pl, undefined, prof),
    materials,
    mood: m ? m.id : 'dreamer',
    time,
    profile: prof,
  };
}

/** 本机存着的原样（存档形） */
function rawList() {
  try {
    const l = JSON.parse(localStorage.getItem(LIST_KEY) || '[]');
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
}

export function loadProjects() {
  return rawList().map((x) => {
    if (!isObj(x) || !x.plan) return x;
    try {
      return fromStoredProject(x);
    } catch {
      return x;
    }
  });
}

export function saveProject(p) {
  if (!p) return;
  try {
    const list = rawList().filter((x) => x?.id !== p.id);
    list.unshift(toStoredProject({ ...p, updatedAt: new Date().toISOString() }));
    // 挤出列表的旧方案：底图（IndexedDB）一起清掉
    for (const x of list.slice(KEEP)) delUnderlay(x?.id);
    localStorage.setItem(LIST_KEY, JSON.stringify(list.slice(0, KEEP)));
    localStorage.setItem(CUR_KEY, p.id);
  } catch {
    /* 存不进去不影响使用 */
  }
}

export function deleteProject(id) {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(rawList().filter((x) => x?.id !== id)));
  } catch {
    /* ignore */
  }
  delUnderlay(id);
}

export function currentProject() {
  try {
    const id = localStorage.getItem(CUR_KEY);
    return loadProjects().find((p) => p?.id === id) || null;
  } catch {
    return null;
  }
}

/** 方案里「参考案例」那几样（链接里只带 id / rev / 标题、客人家里留下来的颜色；不带照片） */
export function caseFields(p) {
  const out = {};
  if (!isObj(p)) return out;
  if (p.caseId != null) out.caseId = p.caseId;
  if (isObj(p.caseRef)) out.caseRef = p.caseRef;
  if (Array.isArray(p.cases) && p.cases.length) out.cases = p.cases;
  if (isObj(p.keep)) out.keep = p.keep;
  if (isObj(p.locked) && Object.keys(p.locked).length) out.locked = p.locked;
  if (isObj(p.caseStyle) && Object.keys(p.caseStyle).length) out.caseStyle = p.caseStyle;
  if (p.sample) out.sample = true;
  if (p.homeAt) out.homeAt = p.homeAt;
  return out;
}

/**
 * 「你的家」里只给员工看的（业主 2026-10-19：预算只给员工看，从不出现在客人的牌、蓝图、WhatsApp、分享链接里；时间表同样只在员工这边）。
 * 这台设备上存的方案留着（设计师接手要用），分享链接里拿掉。
 */
const STAFF_ONLY_HOME = ['budget', 'timeline'];
export function clientProfile(profile) {
  if (!isObj(profile) || !isObj(profile.home)) return profile;
  const home = { ...profile.home };
  for (const k of STAFF_ONLY_HOME) delete home[k];
  return { ...profile, home };
}

/**
 * 设计师接手要的全部（业主 2026-10-19：设计师在这个概念上深化；下一步的设计师简报 / 导出从这里拿）：
 * 平面图（每一层）+ 家具布局 + 选的参考案例 + 客人家里留下来的（keep / locked）+ 颜色 + 房子资料（profile.home）；
 * 预算只在这台设备的员工笔记里（home.js staffNoteOf(profile.id)，由调用的人传进来），时间表在 home 上 —— 两样都只放在 staff 里，
 * 这个对象只给员工用，不进任何链接。
 */
export function designerFacts(p, { staffNote = null } = {}) {
  if (!isObj(p) || !p.plan) return null;
  const m = migrateProject(p);
  const home = isObj(m.profile?.home) ? { ...m.profile.home } : null;
  const staff = { budget: staffNote?.budget ?? home?.budget ?? null, timeline: home?.timeline ?? null };
  if (home) {
    delete home.budget;
    delete home.timeline;
  }
  return {
    v: 1,
    projectId: m.id,
    profileId: m.profile?.id || null,
    guest: { name: m.profile?.name || '', code: m.profile?.code || '' },
    plan: m.plan,
    furniture: m.furniture,
    materials: { ...m.materials },
    mood: m.mood,
    time: m.time,
    caseId: m.caseId ?? null,
    caseRef: m.caseRef ?? null,
    cases: m.cases || [],
    keep: m.keep || null,
    locked: m.locked || {},
    sample: !!m.sample,
    home,
    staff,
  };
}

/** 分享链接（v: 2，存档形：旧版打开也看得到一楼）。参考案例：caseRef + keep（+ 选过的几个案例的 id / 标题），没有照片；预算、时间表不带 */
export async function packProject(p) {
  const s = toStoredProject(p);
  const { id, name, plan, furniture, furnitureUpper, materials, mood, time } = s;
  const profile = clientProfile(s.profile);
  return packJSON({ v: 2, id, name, plan, furniture, ...(furnitureUpper ? { furnitureUpper } : {}), materials, mood, time, profile, ...caseFields(s) });
}

/** 别人分享的方案（v1 或 v2 的链接）→ 自己的一份：新 id、记下来源、名字标「分享」 */
export async function unpackProject(s) {
  const p = await unpackJSON(s);
  if (!isObj(p?.plan) || !(Array.isArray(p.plan.rooms) || Array.isArray(p.plan.floors))) throw new Error('bad project');
  const m = fromStoredProject(p);
  const now = new Date().toISOString();
  return {
    ...m,
    id: uid('p'),
    sharedFrom: p.id || null,
    name: p.name ? t('{0}（分享）', [t(p.name)]) : t('分享的方案'),
    createdAt: now,
    updatedAt: now,
  };
}

// ───────────────────────── 设置（画质 + AI 识别） ─────────────────────────

// quality：'' = 自动（电脑高清、iPad / 手机流畅），'high' | 'fast' = 指定
// visionModel：'auto' = 读平面图用最强的 pro 模型（额度用完退到 flash），也可以在设置里填一个模型名
export const DEFAULT_SETTINGS = { apiKey: '', baseUrl: 'https://generativelanguage.googleapis.com', visionModel: 'auto', quality: '' };
const OLD_DEFAULT_MODEL = 'gemini-2.5-flash'; // 旧版的默认值：不是设计师自己选的，换成 'auto'

const withModel = (s) => (!s.visionModel || s.visionModel === OLD_DEFAULT_MODEL ? { ...s, visionModel: 'auto' } : s);

export function loadSettings() {
  try {
    const own = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (own) return withModel({ ...DEFAULT_SETTINGS, ...own });
    // 同一网址上用过 UKIR STUDIO 的话，沿用它的 key
    const bp = JSON.parse(localStorage.getItem('blueprint.settings.v1') || 'null');
    if (bp?.apiKey) return { ...DEFAULT_SETTINGS, apiKey: bp.apiKey, baseUrl: bp.baseUrl || DEFAULT_SETTINGS.baseUrl };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s) {
  try {
    // 'auto' 存成 ''（读回来 withModel 还是 'auto'）：回滚到旧版 build 时，旧版会把 '' 去掉、从 gemini-2.5-flash 开始，
    // 不会先去请求不存在的 models/auto（404）
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...s, visionModel: s?.visionModel === 'auto' ? '' : s?.visionModel }));
  } catch {
    /* ignore */
  }
}

// ───────────────────────── 平面图底图（IndexedDB，每层一张） ─────────────────────────
// 存的值：{ ...一楼那一张（镜像）, v: 2, mirror: floorId, floors: { [floorId]: { src, x, y, w, h, opacity, iw, ih } } }。
// 顶层的镜像是给旧版 build 看的（旧版存的、读的都是一张：src / x / y / w / h）—— 和 localStorage 存档形的一楼镜像同一个道理：
// 回滚的版本、这台设备上还开着的旧分页打开编辑器，底图照样在（以前读到 {v, floors} 会算出 NaN，整个编辑器空白）。
// 旧版改了底图（拖动、校准、透明度）存回来的还是这个对象（顶层改了、floors 原样）→ 读的时候镜像那一层以顶层为准。

function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('genie-studio', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('underlay');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function idbGet(id) {
  try {
    const d = await db();
    return await new Promise((res) => {
      const r = d.transaction('underlay').objectStore('underlay').get(id);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}

async function idbPut(id, data) {
  try {
    const d = await db();
    await new Promise((res, rej) => {
      const tx = d.transaction('underlay', 'readwrite');
      if (data == null) tx.objectStore('underlay').delete(id);
      else tx.objectStore('underlay').put(data, id);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    /* ignore */
  }
}

/** 这个方案一楼的 id（旧的一层方案迁移后是 'f0'） */
function floor0Of(projectId) {
  const raw = rawList().find((x) => x?.id === projectId);
  const f = raw?.plan?.floors?.[0]?.id;
  return typeof f === 'string' && f ? f : 'f0';
}

const isUnderlay = (u) => isObj(u) && typeof u.src === 'string';
const MIRROR_KEYS = ['src', 'x', 'y', 'w', 'h', 'opacity'];

/** 每层的底图：{ [floorId]: underlay }（没有 → {}）。旧版存的一张 → 算一楼的（floor0 不给就查方案） */
export async function getUnderlays(projectId, floor0) {
  const raw = await idbGet(projectId);
  if (!isObj(raw)) return {};
  if (raw.v === 2 && isObj(raw.floors)) {
    const out = {};
    for (const [k, u] of Object.entries(raw.floors)) if (isUnderlay(u)) out[k] = u;
    // 顶层的镜像和它那一层的不一样了 = 旧版 build 改过底图 → 那一层用顶层的（其他楼层照留）
    if (isUnderlay(raw)) {
      const key = typeof raw.mirror === 'string' && raw.mirror ? raw.mirror : floor0 || floor0Of(projectId);
      const { v, floors, mirror, ...top } = raw;
      const cur = out[key];
      if (!cur || MIRROR_KEYS.some((k) => top[k] !== cur[k])) out[key] = top;
    }
    return out;
  }
  if (isUnderlay(raw)) return { [floor0 || floor0Of(projectId)]: raw };
  return {};
}

/** 存每层的底图（map 里 null / 没有的楼层 = 不要了）；一张都没有就整个删掉。顶层放一楼那一张的镜像（一楼没有 → 第一张），旧版读得懂 */
export async function putUnderlays(projectId, map, floor0) {
  const floors = {};
  for (const [k, u] of Object.entries(isObj(map) ? map : {})) if (isUnderlay(u)) floors[k] = u;
  const keys = Object.keys(floors);
  if (!keys.length) return idbPut(projectId, null);
  const f0 = floor0 || floor0Of(projectId);
  const mirror = floors[f0] ? f0 : keys[0];
  await idbPut(projectId, { ...floors[mirror], v: 2, mirror, floors });
}

/** 旧的接口：一楼那一张（ENGINE 换成 getUnderlays 之前用） */
export async function getUnderlay(id) {
  const map = await getUnderlays(id);
  return map[floor0Of(id)] || null;
}

/** 旧的接口：只换一楼那一张，楼上的照留 */
export async function putUnderlay(id, data) {
  const map = await getUnderlays(id);
  const f0 = floor0Of(id);
  if (isUnderlay(data)) map[f0] = data;
  else delete map[f0];
  await putUnderlays(id, map);
}

export async function delUnderlay(id) {
  if (id == null) return;
  try {
    const d = await db();
    d.transaction('underlay', 'readwrite').objectStore('underlay').delete(id);
  } catch {
    /* ignore */
  }
}
