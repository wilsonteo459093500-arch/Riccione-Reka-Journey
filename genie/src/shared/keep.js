// 这台设备上留着的客人资料，留多久（DESIGN §6 / PDPA：不需要了就删）。
//   CONFIG.keepDays 天（默认 90；0 = 不自动删）。没有日期的旧记录先留着（看不出几天，和 profile.expired 一样）。
//
//   genie.profiles.v1    本机蓝图                                   profile.js loadArchive()：建好起算
//   genie.leads.v1       客人名单：称呼 + WhatsApp + PDPA 同意        这里 keptLeads()：从这位客人最后一次留资料起算
//   genie.staffnotes.v1  员工记的预算（只在员工的设备上问）           这里 keptNotes()：从最后一次改起算
//   genie-handoff        户型图交接（IndexedDB）                     handoff.js：存进去起算
//
// 读的时候过期的就真的删掉（不只是不显示）；入口页 / 许愿模式一打开也扫一次（sweepKept），员工没打开名单也会按时删。
// 只依赖 config.js：入口页、许愿模式外壳都能用，不用把整套 home.js 拉进来。

import { CONFIG } from './config.js';

export const LEADS_KEY = 'genie.leads.v1';
export const NOTES_KEY = 'genie.staffnotes.v1';
const DAY = 864e5;

/** 还在保留期内？x.at = ISO 时间。days ≤ 0 → 一直留；没有 / 读不懂的日期 → 留着 */
export function withinKeep(x, { days = CONFIG.keepDays, now = Date.now() } = {}) {
  if (!(days > 0)) return true;
  const at = Date.parse(x?.at || '');
  return !Number.isFinite(at) || now - at <= days * DAY;
}

const read = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
};

/** 客人名单（新的在前），过期的这一次就删掉 */
export function keptLeads(opts) {
  const l = read(LEADS_KEY);
  if (!Array.isArray(l)) return [];
  const kept = l.filter((x) => x && x.id && withinKeep(x, opts));
  if (kept.length !== l.length) write(LEADS_KEY, kept.length ? kept : null);
  return kept;
}

/** 员工记录 { [profileId]: { budget?, budgetBy?, at } }，过期的这一次就删掉 */
export function keptNotes(opts) {
  const all = read(NOTES_KEY);
  if (!all || typeof all !== 'object' || Array.isArray(all)) return {};
  let dropped = false;
  for (const id of Object.keys(all)) {
    if (all[id] && typeof all[id] === 'object' && withinKeep(all[id], opts)) continue;
    delete all[id];
    dropped = true;
  }
  if (dropped) write(NOTES_KEY, Object.keys(all).length ? all : null);
  return all;
}

export const writeNotes = (all) => write(NOTES_KEY, all && Object.keys(all).length ? all : null);

/** 这一位客人的员工记录删掉（员工在入口页删了他的蓝图） */
export function dropStaffNote(id) {
  if (!id) return;
  const all = keptNotes();
  if (!(id in all)) return;
  delete all[id];
  writeNotes(all);
}

/** 员工记录全部删掉（入口页「清空本机全部蓝图」） */
export function clearStaffNotes() {
  write(NOTES_KEY, null);
}

/** 入口页 / 许愿模式打开时扫一次 → { leads, notes }（留下来的条数） */
export function sweepKept(opts) {
  return { leads: keptLeads(opts).length, notes: Object.keys(keptNotes(opts)).length };
}
