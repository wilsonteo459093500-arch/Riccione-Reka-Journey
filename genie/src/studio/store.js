// 工作室的方案：存本机（localStorage）+ 分享链接（#s=…）+ 平面图底图（IndexedDB，图片太大不放 localStorage）。
// 分享链接打开的是「自己的一份」（新 id + sharedFrom），不会盖掉这台设备上的原稿。

import { buildWalls, templatePlan, uid } from './plan/model.js';
import { furnish } from './engine/furnish.js';
import { MOOD_BY_ID } from '../shared/moods.js';
import { DREAMER_BY_CODE } from '../shared/dreamers.js';
import { avoidMaterials, packJSON, unpackJSON } from '../shared/profile.js';
import { t } from '../shared/i18n.js';

const LIST_KEY = 'genie.studio.projects.v1';
const CUR_KEY = 'genie.studio.current';
const SETTINGS_KEY = 'genie.settings.v1';
const KEEP = 40; // 本机最多留几份方案

/** 档案里 3D 用得到的部分（链接短一点） */
export function profileForStudio(p) {
  if (!p) return null;
  const { id, name, code, axes, hidden, life, storage, avoid, materials, wishes, createdAt } = p;
  return { id, name, code, axes, hidden, life, storage, avoid, materials, wishes, createdAt };
}

/** 客人的雷区：任何一组材质套进 3D 之前都过一遍（情绪预设、默认材质） */
export function safeMaterials(materials, profile) {
  const avoid = profile?.avoid || [];
  if (!avoid.length) return { materials: { ...materials }, swaps: [] };
  return avoidMaterials(materials, avoid);
}

export function createProject({ plan, profile = null, mood = null, name } = {}) {
  const pl = plan || templatePlan('condo3');
  const walls = buildWalls(pl);
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
    furniture: furnish(pl, walls, prof),
    materials,
    mood: m ? m.id : 'dreamer',
    time,
    profile: prof,
  };
}

export function loadProjects() {
  try {
    const l = JSON.parse(localStorage.getItem(LIST_KEY) || '[]');
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
}

export function saveProject(p) {
  if (!p) return;
  try {
    const list = loadProjects().filter((x) => x.id !== p.id);
    list.unshift({ ...p, updatedAt: new Date().toISOString() });
    // 挤出列表的旧方案：底图（IndexedDB）一起清掉
    for (const x of list.slice(KEEP)) delUnderlay(x.id);
    localStorage.setItem(LIST_KEY, JSON.stringify(list.slice(0, KEEP)));
    localStorage.setItem(CUR_KEY, p.id);
  } catch {
    /* 存不进去不影响使用 */
  }
}

export function deleteProject(id) {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(loadProjects().filter((x) => x.id !== id)));
  } catch {
    /* ignore */
  }
  delUnderlay(id);
}

export function currentProject() {
  try {
    const id = localStorage.getItem(CUR_KEY);
    return loadProjects().find((p) => p.id === id) || null;
  } catch {
    return null;
  }
}

export async function packProject(p) {
  const { id, name, plan, furniture, materials, mood, time, profile } = p;
  return packJSON({ v: 1, id, name, plan, furniture, materials, mood, time, profile });
}

/** 别人分享的方案 → 自己的一份：新 id、记下来源、名字标「分享」 */
export async function unpackProject(s) {
  const p = await unpackJSON(s);
  if (!p?.plan?.rooms) throw new Error('bad project');
  const now = new Date().toISOString();
  return {
    ...p,
    id: uid('p'),
    sharedFrom: p.id || null,
    name: p.name ? t('{0}（分享）', [t(p.name)]) : t('分享的方案'),
    createdAt: now,
    updatedAt: now,
  };
}

// ───────────────────────── 设置（画质 + AI 识别） ─────────────────────────

// quality：'' = 自动（电脑高清、iPad / 手机流畅），'high' | 'fast' = 指定
export const DEFAULT_SETTINGS = { apiKey: '', baseUrl: 'https://generativelanguage.googleapis.com', visionModel: 'gemini-2.5-flash', quality: '' };

export function loadSettings() {
  try {
    const own = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (own) return { ...DEFAULT_SETTINGS, ...own };
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
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// ───────────────────────── 平面图底图（IndexedDB） ─────────────────────────

function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('genie-studio', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('underlay');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function putUnderlay(id, data) {
  try {
    const d = await db();
    await new Promise((res, rej) => {
      const tx = d.transaction('underlay', 'readwrite');
      tx.objectStore('underlay').put(data, id);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export async function getUnderlay(id) {
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

export async function delUnderlay(id) {
  try {
    const d = await db();
    d.transaction('underlay', 'readwrite').objectStore('underlay').delete(id);
  } catch {
    /* ignore */
  }
}
