// 下一位客人（许愿模式外壳的「下一位客人」、闲置自动重来）：上一位客人留在这台展厅 iPad 上的东西删掉（PDPA：不需要了就删）。
//   · 没有留名单（没勾 PDPA 同意）：他的档案（genie.profiles.v1）、3D 方案和底图（genie.studio.projects.v1 + IndexedDB
//     'genie-studio'）、户型图交接（IndexedDB 'genie-handoff'：读好的平面图 + 原图）、员工记的预算（genie.staffnotes.v1）全部删掉。
//   · 留了名单：只留名单（genie.leads.v1 —— 链接里已经带着他的档案和小平面图）和员工记的预算；档案、方案、原图一样删掉。
//   · 「现在打开的方案」（genie.studio.current）清掉：直接打开 studio.html 不会是上一位客人的家。
// 只依赖几个小模块（外壳要轻）：工作室的 store.js 太大，这里直接按它的存法删（键名、数据库名和 store.js 一致）。

import { removeFromArchive, loadArchive } from './profile.js';
import { dropHomePlan } from './handoff.js';
import { dropStaffNote, keptLeads } from './keep.js';

const PROJECTS_KEY = 'genie.studio.projects.v1'; // = studio/store.js LIST_KEY
const CUR_KEY = 'genie.studio.current'; // = studio/store.js CUR_KEY
const STUDIO_DB = 'genie-studio'; // = studio/store.js db()：store 'underlay'，key = 方案 id

/** 这一轮（since 之后）在这台设备上建的档案 id —— 只走完许愿之旅、还没到 3D 的客人也算 */
export function profilesSince(since) {
  if (!Number.isFinite(since)) return [];
  return loadArchive()
    .filter((p) => p?.id && (Date.parse(p.createdAt || '') || 0) >= since)
    .map((p) => p.id);
}

function delUnderlays(projectIds) {
  if (!projectIds.length) return Promise.resolve();
  return new Promise((res) => {
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) return res();
      const r = indexedDB.open(STUDIO_DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('underlay');
      r.onsuccess = () => {
        const d = r.result;
        try {
          const tx = d.transaction('underlay', 'readwrite');
          for (const id of projectIds) tx.objectStore('underlay').delete(id);
          tx.oncomplete = tx.onerror = tx.onabort = () => {
            d.close();
            res();
          };
        } catch {
          d.close();
          res();
        }
      };
      r.onerror = () => res();
      r.onblocked = () => res();
    } catch {
      res();
    }
  });
}

/** 这几位客人（档案 id）留在这台设备上的东西删掉；留了名单的只留名单 + 预算。→ { profiles, projects, keptLeads } */
export async function forgetGuests(ids) {
  const want = new Set((ids || []).filter((x) => typeof x === 'string' && x));
  const out = { profiles: 0, projects: 0, keptLeads: 0 };
  if (!want.size) return out;
  const withLead = new Set(keptLeads().map((l) => l.profileId).filter((id) => want.has(id)));
  out.keptLeads = withLead.size;
  for (const id of want) {
    removeFromArchive(id);
    out.profiles++;
    if (!withLead.has(id)) dropStaffNote(id);
    await dropHomePlan(id);
  }
  let gone = [];
  try {
    const list = JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
    if (Array.isArray(list)) {
      gone = list.filter((p) => want.has(p?.profile?.id)).map((p) => p.id);
      if (gone.length) localStorage.setItem(PROJECTS_KEY, JSON.stringify(list.filter((p) => !want.has(p?.profile?.id))));
    }
    localStorage.removeItem(CUR_KEY);
  } catch {
    /* ignore */
  }
  out.projects = gone.length;
  await delUnderlays(gone);
  return out;
}
