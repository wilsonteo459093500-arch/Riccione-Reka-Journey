// 备份（浏览器）：单个项目下载、「全部备份到资料夹」、「全部打包成一个文件」、Material Board 画板 + 材质库。
// 每次备份成功都记进备份记录（lib/backupLog.js），首页据此显示「上次备份几天前」、7 天没备份变黄。
//
// 资料夹（用户 2026-11-21 选「两种都要」，平时用这个）：Chrome / Edge 才有「选资料夹」；第一次选一个（可以是会自动同步的
// Google Drive / OneDrive 资料夹），以后点一下只重写改过的项目。每个项目一个文件，文件名带项目 id 的尾巴，
// 改了项目名会把旧名字的那份换掉；删掉的项目在资料夹里的那份留着（当存档）。
// 不支持选资料夹的浏览器：改过的项目一个个下载。

import { listProjects, getProject } from '../store/db.js';
import { getLocal, setLocal } from '../store/local.js';
import { downloadBlob } from './download.js';
import { bundleFileName, formatDay } from './format.js';
import {
  exportBundle, exportBoardsBackup, exportAllInOne, boardsChangedAt, folderFileName, tailOfFileName, idTail, BOARDS_FILE_NAME,
  restoreBundle, restoreBoardsBackup, openInnerBackup,
} from './bundle.js';
import {
  readBackupLog, updateBackupLog, withBackups, withBoardsBackup, withAllBackup, folderUpToDate, backupStatus, boardsBackupStatus,
} from './backupLog.js';

export const folderSupported = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

const FOLDER_KEY = 'backupFolder';

/** 上次选的资料夹（没选过 → null） */
export async function savedFolder() {
  return (await getLocal(FOLDER_KEY)) || null;
}

/** 选资料夹（必须在点击里调用）；取消 → null */
export async function pickFolder() {
  try {
    const handle = await window.showDirectoryPicker({ id: 'ukir-backup', mode: 'readwrite', startIn: 'documents' });
    await setLocal(FOLDER_KEY, handle);
    return handle;
  } catch (e) {
    if (e?.name === 'AbortError') return null;
    throw e;
  }
}

/** 这个资料夹现在能不能写；ask = 不能就问一次（要在点击里） */
export async function folderWritable(handle, { ask = false } = {}) {
  if (!handle) return false;
  if (typeof handle.queryPermission !== 'function') return true;
  const opts = { mode: 'readwrite' };
  try {
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if (!ask || typeof handle.requestPermission !== 'function') return false;
    return (await handle.requestPermission(opts)) === 'granted';
  } catch {
    return false;
  }
}

async function writeFile(dir, name, blob) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  try {
    await w.write(blob);
    await w.close();
  } catch (e) {
    await w.abort?.().catch(() => {});
    throw e;
  }
}

async function fileNames(dir) {
  const out = new Set();
  try {
    for await (const [name, h] of dir.entries()) if (h.kind === 'file') out.add(name);
  } catch {
    /* 列不出来：当成空的，全部重写 */
  }
  return out;
}

const friendly = (e) =>
  e?.name === 'QuotaExceededError' || /quota/i.test(e?.message || '')
    ? new Error('磁盘空间不够，写不进去。')
    : e?.name === 'NotAllowedError'
    ? new Error('浏览器没有这个资料夹的写入权限 —— 再按一次「备份到资料夹」，在弹出的问题里选「允许」。')
    : e?.name === 'NotFoundError'
    ? new Error('找不到上次选的资料夹（可能被移走或删掉了）—— 请重新选一个。')
    : e;

/**
 * 全部备份到资料夹：只写改过的项目（和资料夹里不见了的）；画板 / 材质库改过也写一份
 * @returns {Promise<{ written:number, skipped:number, boards:boolean, folder:string, missing:number }>}
 */
export async function backupAllToFolder(dir, { onProgress } = {}) {
  const projects = await listProjects();
  const names = await fileNames(dir);
  const log = readBackupLog();
  const todo = projects.filter((p) => !folderUpToDate(p, log.projects[p.id]) || !names.has(folderFileName(p)));
  let missing = 0;
  try {
    for (let i = 0; i < todo.length; i++) {
      const p = todo[i];
      onProgress?.(i, todo.length, p.name || '未命名方案');
      const r = await exportBundle(p);
      missing += r.missing;
      const name = folderFileName(p);
      await writeFile(dir, name, r.blob);
      // 改过名的项目：旧名字那份换掉（同一个 id 尾巴）
      for (const old of names) {
        if (old !== name && tailOfFileName(old) === idTail(p.id)) await dir.removeEntry(old).catch(() => {});
      }
      updateBackupLog((l) => withBackups(l, [{ id: p.id, rev: p.rev }], { folder: true }));
    }
    onProgress?.(todo.length, todo.length, 'Material Board');
    let boards = false;
    const changed = await boardsChangedAt();
    const rec = readBackupLog().boards;
    if (changed && (!rec?.folderAt || changed > (rec.folderChangedAt || 0) || !names.has(BOARDS_FILE_NAME))) {
      const b = await exportBoardsBackup();
      if (b.blob) {
        await writeFile(dir, BOARDS_FILE_NAME, b.blob);
        updateBackupLog((l) => withBoardsBackup(l, b.changedAt, { folder: true }));
        boards = true;
      }
    }
    updateBackupLog((l) => withAllBackup(l, { via: 'folder', folder: dir.name }));
    return { written: todo.length, skipped: projects.length - todo.length, boards, folder: dir.name, missing };
  } catch (e) {
    throw friendly(e);
  }
}

/** 全部打包成一个文件并下载 */
export async function backupAllToOneFile({ onProgress } = {}) {
  const projects = await listProjects();
  const r = await exportAllInOne(projects, { onProgress });
  const name = `UKIR STUDIO 全部备份 ${formatDay(Date.now())}.blueprint.zip`;
  downloadBlob(r.blob, name);
  updateBackupLog((l) => {
    let out = withBackups(l, r.entries);
    if (r.boardsChangedAt) out = withBoardsBackup(out, r.boardsChangedAt);
    return withAllBackup(out, { via: 'file' });
  });
  return { size: r.blob.size, projects: r.entries.length, missing: r.missing, name };
}

/** 不能选资料夹的浏览器：改过 / 没备份过的项目一个个下载（画板 / 材质库改过也下载一份） */
export async function backupAllAsDownloads({ onProgress } = {}) {
  const projects = await listProjects();
  const log = readBackupLog();
  const todo = projects.filter((p) => backupStatus(p, log.projects[p.id]).state !== 'fresh');
  let missing = 0;
  for (let i = 0; i < todo.length; i++) {
    const p = todo[i];
    onProgress?.(i, todo.length, p.name || '未命名方案');
    const r = await exportBundle(p);
    missing += r.missing;
    downloadBlob(r.blob, bundleFileName(p));
    updateBackupLog((l) => withBackups(l, [{ id: p.id, rev: p.rev }]));
    await new Promise((res) => setTimeout(res, 600)); // 浏览器一口气下载太多会拦
  }
  let boards = false;
  const changed = await boardsChangedAt();
  if (boardsBackupStatus(changed, readBackupLog().boards).state !== 'fresh' && changed) {
    const b = await exportBoardsBackup();
    if (b.blob) {
      downloadBlob(b.blob, BOARDS_FILE_NAME);
      updateBackupLog((l) => withBoardsBackup(l, b.changedAt));
      boards = true;
    }
  }
  updateBackupLog((l) => withAllBackup(l, { via: 'downloads' }));
  return { written: todo.length, skipped: projects.length - todo.length, boards, missing };
}

/**
 * 下载一个项目的备份（首页卡片、导出窗口共用）
 * @param {object} project  要备份的内容
 * @param {{ rev?:number, onProgress? }} opts  rev = 这份内容是第几版（默认读库里的）
 */
export async function downloadProjectBackup(project, { rev, onProgress } = {}) {
  const r = await exportBundle(project, { onProgress });
  downloadBlob(r.blob, bundleFileName(project));
  const v = rev ?? (await getProject(project.id))?.rev ?? project.rev;
  updateBackupLog((l) => withBackups(l, [{ id: project.id, rev: v }]));
  return { size: r.blob.size, missing: r.missing };
}

/** 下载 Material Board 画板 + 材质库的备份；两样都空 → null */
export async function downloadBoardsBackup() {
  const b = await exportBoardsBackup();
  if (!b.blob) return null;
  downloadBlob(b.blob, BOARDS_FILE_NAME);
  updateBackupLog((l) => withBoardsBackup(l, b.changedAt));
  return { size: b.blob.size, boards: b.boards, library: b.library };
}

// ---------------------------------------------------------------------------
// 恢复（首页）—— 恢复成「备份里的那一版」：记成在备份那天备份过
// ---------------------------------------------------------------------------

/**
 * 恢复一个项目备份
 * @param {'keep'|'update'|'copy'} mode  见 bundle.js restoreBundle
 */
export async function restoreProjectBackup(opened, mode, { existingNames = [], onProgress } = {}) {
  const r = await restoreBundle(opened, { mode, existingNames, onProgress });
  if (mode !== 'copy') updateBackupLog((l) => withBackups(l, [{ id: r.project.id, rev: r.project.rev }], { now: opened.exportedAt || Date.now() }));
  return r;
}

/**
 * 恢复「全部备份」的大文件
 * @param {{ conflict:'update'|'copy'|'skip', localIds:Set<string>, existingNames:string[], onProgress? }} opts
 *   conflict = 这台电脑上已经有的项目怎么办
 * @returns {Promise<{ added:number, updated:number, copied:number, skipped:number, missing:number, boards:object|null, failed:string[] }>}
 */
export async function restoreAllBackup(opened, { conflict = 'skip', localIds = new Set(), existingNames = [], onProgress } = {}) {
  const out = { added: 0, updated: 0, copied: 0, skipped: 0, missing: 0, boards: null, failed: [] };
  const names = [...existingNames];
  for (let i = 0; i < opened.projects.length; i++) {
    const e = opened.projects[i];
    onProgress?.(i, opened.projects.length, e.name || '未命名方案');
    const here = e.id && localIds.has(e.id);
    if (here && conflict === 'skip') {
      out.skipped += 1;
      continue;
    }
    const mode = here ? conflict : 'keep';
    try {
      const inner = await openInnerBackup(opened, e.file);
      if (inner.kind !== 'project') throw new Error('不是项目备份');
      const r = await restoreProjectBackup(inner, mode, { existingNames: names });
      names.push(r.project.name);
      out.missing += r.missing;
      if (mode === 'update') out.updated += 1;
      else if (mode === 'copy') out.copied += 1;
      else out.added += 1;
    } catch (err) {
      if (err?.name === 'QuotaExceededError' || /quota|空间不足/i.test(err?.message || '')) throw err; // 空间不够：后面的也存不进去
      out.failed.push(e.name || '未命名方案');
    }
  }
  if (opened.boards) {
    onProgress?.(opened.projects.length, opened.projects.length, 'Material Board');
    try {
      const inner = await openInnerBackup(opened, opened.boards);
      if (inner.kind === 'boards') out.boards = await restoreBoardsBackup(inner);
    } catch {
      out.failed.push('Material Board');
    }
  }
  return out;
}
