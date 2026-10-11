// 工作室的方案：存本机（localStorage）+ 分享链接（#s=…）+ 平面图底图（IndexedDB，图片太大不放 localStorage）。

import { buildWalls, templatePlan, uid } from './plan/model.js';
import { furnish } from './engine/furnish.js';
import { MOOD_BY_ID } from '../shared/moods.js';
import { DREAMER_BY_CODE } from '../shared/dreamers.js';
import { packJSON, unpackJSON } from '../shared/profile.js';

const LIST_KEY = 'genie.studio.projects.v1';
const CUR_KEY = 'genie.studio.current';
const SETTINGS_KEY = 'genie.settings.v1';

/** 档案里 3D 用得到的部分（链接短一点） */
export function profileForStudio(p) {
  if (!p) return null;
  const { id, name, code, axes, hidden, life, storage, avoid, materials, wishes, createdAt } = p;
  return { id, name, code, axes, hidden, life, storage, avoid, materials, wishes, createdAt };
}

export function createProject({ plan, profile = null, mood = null, name } = {}) {
  const pl = plan || templatePlan('condo3');
  const walls = buildWalls(pl);
  const prof = profileForStudio(profile);
  const dreamer = prof && DREAMER_BY_CODE[prof.code];
  const m = MOOD_BY_ID[mood] || (dreamer ? null : MOOD_BY_ID.cozy);
  const materials = { ...(m?.materials || MOOD_BY_ID.cozy.materials), ...(prof?.materials || {}) };
  const time = m?.time ?? (dreamer ? MOOD_BY_ID[dreamer.mood]?.time : 18.4) ?? 18.4;
  return {
    id: uid('p'),
    name: name || (prof?.name ? `${prof.name} 的梦想家` : pl.name || '新方案'),
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
  try {
    const list = loadProjects().filter((x) => x.id !== p.id);
    list.unshift({ ...p, updatedAt: new Date().toISOString() });
    localStorage.setItem(LIST_KEY, JSON.stringify(list.slice(0, 40)));
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

export async function unpackProject(s) {
  const p = await unpackJSON(s);
  if (!p?.plan?.rooms) throw new Error('bad project');
  return { ...p, id: p.id || uid('p'), createdAt: new Date().toISOString() };
}

// ───────────────────────── AI 设置 ─────────────────────────

export const DEFAULT_SETTINGS = { apiKey: '', baseUrl: 'https://generativelanguage.googleapis.com', visionModel: 'gemini-2.5-flash' };

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

async function delUnderlay(id) {
  try {
    const d = await db();
    d.transaction('underlay', 'readwrite').objectStore('underlay').delete(id);
  } catch {
    /* ignore */
  }
}
