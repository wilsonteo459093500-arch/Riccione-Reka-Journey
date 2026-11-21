// 备份记录：每个项目上次备份是几时、备份的是第几版（project.rev），Material Board 画板 / 材质库同样记一笔。
// 存在本机 localStorage（「清除本机全部资料」时一起清掉）。判断「该备份了」的规则是纯函数，Node 可测。
//
//   { projects: { <项目 id>: { at, rev, folderAt?, folderRev? } },
//     boards:   { at, changedAt, folderAt?, folderChangedAt? },     // Material Board 画板 + 材质库（不属于任何项目的那些）
//     all:      { at, via: 'folder' | 'file' | 'downloads', folder? } }   // 上一次「全部备份」

export const BACKUP_DUE_DAYS = 7; // 用户 2026-11-21 定的：改过、7 天没备份就提醒
export const BACKUP_LOG_KEY = 'ukir.backups.v1';
const DAY = 24 * 3600 * 1000;

export const emptyLog = () => ({ projects: {}, boards: null, all: null });

export function normalizeLog(raw) {
  const log = emptyLog();
  if (!raw || typeof raw !== 'object') return log;
  if (raw.projects && typeof raw.projects === 'object') {
    for (const [id, r] of Object.entries(raw.projects)) {
      if (r && typeof r === 'object' && Number(r.at) > 0) log.projects[id] = { ...r, at: Number(r.at), rev: Number(r.rev) || 0 };
    }
  }
  if (raw.boards && Number(raw.boards.at) > 0) log.boards = { ...raw.boards };
  if (raw.all && Number(raw.all.at) > 0) log.all = { ...raw.all };
  return log;
}

/**
 * 这个项目的备份状态
 *   never   = 从来没备份过（建好超过 7 天 → due）
 *   fresh   = 备份之后没改过
 *   changed = 备份之后改过，备份还不到 7 天
 *   due     = 备份之后改过、备份已经 7 天以上（或从没备份、项目建好 7 天以上）→ 首页变黄
 * @returns {{ state:'never'|'fresh'|'changed'|'due', at:number|null, due:boolean }}
 */
export function backupStatus(project, rec, { now = Date.now(), days = BACKUP_DUE_DAYS } = {}) {
  const limit = days * DAY;
  if (!rec?.at) {
    const since = project?.createdAt || project?.updatedAt || now;
    const due = now - since >= limit;
    return { state: due ? 'due' : 'never', at: null, due };
  }
  const changed = (Number(project?.rev) || 0) > (Number(rec.rev) || 0);
  if (!changed) return { state: 'fresh', at: rec.at, due: false };
  const due = now - rec.at >= limit;
  return { state: due ? 'due' : 'changed', at: rec.at, due };
}

/** Material Board 画板 / 材质库：changedAt = 最近一次改动（画板 ts、材质 ts 的最大值）；没有内容 → empty */
export function boardsBackupStatus(changedAt, rec, { now = Date.now(), days = BACKUP_DUE_DAYS } = {}) {
  if (!changedAt) return { state: 'empty', at: rec?.at || null, due: false };
  const limit = days * DAY;
  if (!rec?.at) {
    const due = now - changedAt >= limit;
    return { state: due ? 'due' : 'never', at: null, due };
  }
  if (changedAt <= (rec.changedAt || 0)) return { state: 'fresh', at: rec.at, due: false };
  const due = now - rec.at >= limit;
  return { state: due ? 'due' : 'changed', at: rec.at, due };
}

/** 首页顶部那句：几个项目该备份了 */
export function dueProjects(projects, log, opts) {
  return (projects || []).filter((p) => backupStatus(p, log?.projects?.[p.id], opts).due);
}

/** 记一笔（不可变）：entries = [{ id, rev }]；folder = 这次是写进资料夹 */
export function withBackups(log, entries, { now = Date.now(), folder = false } = {}) {
  const out = normalizeLog(log);
  for (const e of entries || []) {
    if (!e?.id) continue;
    const prev = out.projects[e.id] || {};
    out.projects[e.id] = { ...prev, at: now, rev: Number(e.rev) || 0, ...(folder ? { folderAt: now, folderRev: Number(e.rev) || 0 } : {}) };
  }
  return out;
}

export function withBoardsBackup(log, changedAt, { now = Date.now(), folder = false } = {}) {
  const out = normalizeLog(log);
  const prev = out.boards || {};
  out.boards = { ...prev, at: now, changedAt: changedAt || 0, ...(folder ? { folderAt: now, folderChangedAt: changedAt || 0 } : {}) };
  return out;
}

export function withAllBackup(log, { now = Date.now(), via, folder } = {}) {
  const out = normalizeLog(log);
  out.all = { at: now, via: via || 'file', ...(folder ? { folder } : {}) };
  return out;
}

/** 删掉的项目不用再记 */
export function pruneLog(log, projectIds) {
  const out = normalizeLog(log);
  const keep = new Set(projectIds || []);
  for (const id of Object.keys(out.projects)) if (!keep.has(id)) delete out.projects[id];
  return out;
}

/** 资料夹里那份是不是已经是最新的（不用重写） */
export const folderUpToDate = (project, rec) => !!rec?.folderAt && (Number(rec.folderRev) || 0) === (Number(project?.rev) || 0);

// ---------------- 浏览器：读写 localStorage ----------------

const listeners = new Set();
export function onBackupLogChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function readBackupLog() {
  try {
    return normalizeLog(JSON.parse(localStorage.getItem(BACKUP_LOG_KEY) || 'null'));
  } catch {
    return emptyLog();
  }
}

export function writeBackupLog(log) {
  try {
    localStorage.setItem(BACKUP_LOG_KEY, JSON.stringify(normalizeLog(log)));
  } catch {
    /* 存不进去：只是少了提醒，不影响备份本身 */
  }
  listeners.forEach((fn) => fn());
}

/** 读 → 改 → 写 */
export function updateBackupLog(fn) {
  writeBackupLog(fn(readBackupLog()));
}
