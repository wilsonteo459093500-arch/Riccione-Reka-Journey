// 项目备份（.blueprint.zip）：project.json + assets/<id>.<ext> + boards.json（Material Board 画板与 AI 实拍历史）
// 导出：把项目 JSON 和它引用的所有图片打包；导入：图片重新入库（新图片 id）。
// 恢复时（体检第 4 阶段）：这台电脑上没有这个项目 → 照原来的项目 id 恢复；已经有 → 问设计师「更新原项目 / 另存一份」。
// 另外两种备份档（同样是 .blueprint.zip，按里面的索引档认）：
//   Material Board 画板 + 材质库（不属于任何项目的那些）：boards-backup.json + boards.json + library.json
//   全部备份打成一个文件：ukir-all.json + projects/<每个项目一个 .blueprint.zip> + material-board.blueprint.zip
// 纯函数（清单生成 / 解析 / 引用改写 / 合并计划）在 Node 可测；读写 IndexedDB 的部分只在浏览器里调用。

import JSZip from 'jszip';
import { uid } from '../engine/model.js';
import { collectAssetSrcs, assetIdOf, isAssetSrc, storeBlob } from '../store/assets.js';
import { getAssetRecord, deleteAssetsOf, deleteAssetRecords, saveProject } from '../store/db.js';
import { exportBoardsOf, importBoardsTo, removeBoardsOf, listBoards, removeBoard, putBoard, listShots, putShot, getActiveBoardId, setActiveBoardId } from '../moodboard/store.js';
import { listLibrary, putLibraryItem } from '../moodboard/library.js';
import { STANDALONE_ID } from '../moodboard/constants.js';
import { copyName } from './project.js';
import { sanitizeFileName } from './format.js';
import { withSharedLock, WRITE_LOCK } from './locks.js';

export const BUNDLE_FORMAT = 'dreamhouse-blueprint';
export const BUNDLE_VERSION = 1;

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
};

export const extForMime = (mime) => EXT_BY_MIME[String(mime || '').toLowerCase()] || 'bin';

/** 深拷贝并改写所有 'asset:<旧id>' → map 里的新 src（值和对象的键都改；不在 map 里的原样保留） */
export function remapAssetSrcs(obj, map) {
  const get = (src) => (map instanceof Map ? map.get(src) : map?.[src]);
  const walk = (v) => {
    if (typeof v === 'string') return isAssetSrc(v) ? get(v) || v : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out = {};
      // 键也可能是素材引用（render3dInfo 以图片的 src 作键）
      for (const [k, x] of Object.entries(v)) out[isAssetSrc(k) ? get(k) || k : k] = walk(x);
      return out;
    }
    return v;
  };
  return walk(obj);
}

/**
 * 生成备份清单
 * @param {object} project
 * @param {Array<{id:string, mime?:string, w?:number, h?:number}>} records  已找到的素材记录
 * @returns {{ manifest:object, files:Array<{ path:string, id:string }>, missing:string[] }}
 */
export function buildBundleManifest(project, records, { now = Date.now() } = {}) {
  const byId = new Map((records || []).filter(Boolean).map((r) => [r.id, r]));
  const files = [];
  const assets = [];
  const missing = [];
  for (const src of collectAssetSrcs(project)) {
    const id = assetIdOf(src);
    const rec = byId.get(id);
    if (!rec) {
      missing.push(src);
      continue;
    }
    const path = `assets/${id}.${extForMime(rec.mime)}`;
    files.push({ path, id });
    assets.push({ id, file: path, mime: rec.mime || 'image/jpeg', w: rec.w || 0, h: rec.h || 0 });
  }
  const manifest = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    app: 'UKIR STUDIO',
    exportedAt: new Date(now).toISOString(),
    project,
    assets,
  };
  return { manifest, files, missing };
}

/** 解析并校验 project.json */
export function parseBundleManifest(text) {
  let data;
  try {
    data = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    throw new Error('备份文件损坏：project.json 不是有效的 JSON。');
  }
  if (!data || data.format !== BUNDLE_FORMAT || !data.project || typeof data.project !== 'object') {
    throw new Error('这不是 UKIR STUDIO 的项目备份（.blueprint.zip）。');
  }
  if ((data.version || 1) > BUNDLE_VERSION) {
    throw new Error('这个备份来自更新版本的 Blueprint，请先刷新页面再试。');
  }
  if (!Array.isArray(data.project.slides)) throw new Error('备份文件不完整：缺少页面数据。');
  const exportedAt = Date.parse(data.exportedAt || '') || 0;
  return { project: data.project, assets: Array.isArray(data.assets) ? data.assets : [], exportedAt };
}

/** 用新 id 与新素材引用还原项目 */
export function restoreProject(project, srcMap, { id = uid('p'), now = Date.now() } = {}) {
  const out = remapAssetSrcs(project, srcMap);
  return { ...out, id, createdAt: out.createdAt || now, updatedAt: now };
}

// ---------------------------------------------------------------------------
// 资料夹里的文件名、另外两种备份档的索引（纯函数）
// ---------------------------------------------------------------------------

/** 项目 id 的尾巴（文件名里用来认「这是哪个项目」，改了项目名也认得出） */
export const idTail = (id) => String(id || '').replace(/[^0-9a-z]/gi, '').slice(-6) || 'x';

/** 资料夹里每个项目一个文件：'Muar · Mr Lau · k2x9q.blueprint.zip' */
export function folderFileName(project) {
  const info = project?.info || {};
  const clean = (v) => String(v || '').trim();
  const base = clean(project?.name) || [clean(info.location), clean(info.client)].filter(Boolean).join(' · ') || 'Dreamhouse Blueprint';
  return `${sanitizeFileName(base).slice(0, 80)} · ${idTail(project?.id)}.blueprint.zip`;
}

/** 文件名 → 它是哪个项目的（id 尾巴）；不是项目备份 → null */
export function tailOfFileName(name) {
  const m = /· ([0-9a-z]{1,6})\.blueprint\.zip$/i.exec(String(name || ''));
  return m ? m[1] : null;
}

export const BOARDS_FILE_NAME = 'Material Board · 画板与材质库.blueprint.zip';
export const BOARDS_INDEX = 'boards-backup.json';
export const BOARDS_FORMAT = 'ukir-material-board';
export const ALL_INDEX = 'ukir-all.json';
export const ALL_FORMAT = 'ukir-studio-all';

export function parseBoardsIndex(text) {
  let data;
  try {
    data = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    throw new Error('备份文件损坏：画板备份的索引不是有效的 JSON。');
  }
  if (!data || data.format !== BOARDS_FORMAT) throw new Error('这不是 UKIR STUDIO 的 Material Board 备份。');
  if ((data.version || 1) > 1) throw new Error('这个备份来自更新版本的 UKIR STUDIO，请先刷新页面再试。');
  return { exportedAt: Date.parse(data.exportedAt || '') || 0 };
}

export function parseAllIndex(text) {
  let data;
  try {
    data = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    throw new Error('备份文件损坏：全部备份的索引不是有效的 JSON。');
  }
  if (!data || data.format !== ALL_FORMAT || !Array.isArray(data.projects)) throw new Error('这不是 UKIR STUDIO 的全部备份。');
  if ((data.version || 1) > 1) throw new Error('这个备份来自更新版本的 UKIR STUDIO，请先刷新页面再试。');
  const projects = data.projects
    .filter((p) => p && typeof p.file === 'string' && p.file)
    .map((p) => ({ id: String(p.id || ''), name: String(p.name || ''), file: p.file, updatedAt: Number(p.updatedAt) || 0 }));
  return { exportedAt: Date.parse(data.exportedAt || '') || 0, projects, boards: typeof data.boards === 'string' ? data.boards : null };
}

/**
 * 恢复 Material Board 备份时怎么合并：同一块画板（同 id）这台电脑上的比较新就不动，否则用备份的；新的直接加
 * @returns {{ put:object[], skip:number }}
 */
export function planBoardsMerge(existing, incoming) {
  const have = new Map((existing || []).map((b) => [b.id, b]));
  const put = [];
  let skip = 0;
  for (const b of incoming || []) {
    if (!b?.id) continue;
    const cur = have.get(b.id);
    if (cur && (cur.ts || cur.createdAt || 0) >= (b.ts || b.createdAt || 0)) skip += 1;
    else put.push(b);
  }
  return { put, skip };
}

/** 材质库：这台电脑上没有的（按 id）才加 */
export const newLibraryItems = (existing, incoming) => {
  const have = new Set((existing || []).map((x) => x.id));
  return (incoming || []).filter((x) => x?.id && x.dataUrl && !have.has(x.id));
};

/** 画板 / 材质库最近一次改动的时间（判断要不要再备份）；空画板（上面什么都没有）不算 —— 没东西可丢 */
export function boardsChangedAtOf(boards, library) {
  let t = 0;
  for (const b of boards || []) {
    if (!b?.items?.length && !b?.shots?.length) continue;
    t = Math.max(t, b?.ts || 0, b?.createdAt || 0);
    for (const s of b?.shots || []) t = Math.max(t, s?.ts || 0);
  }
  for (const x of library || []) t = Math.max(t, x?.ts || 0);
  return t;
}

// ---------------------------------------------------------------------------
// 浏览器：导出
// ---------------------------------------------------------------------------

/** 打包项目备份 → Blob（application/zip） */
export async function exportBundle(project, { onProgress } = {}) {
  const ids = [...collectAssetSrcs(project)].map(assetIdOf);
  const records = [];
  for (let i = 0; i < ids.length; i++) {
    records.push(await getAssetRecord(ids[i]));
    onProgress?.('read', i + 1, ids.length);
  }
  const { manifest, files, missing } = buildBundleManifest(project, records.filter((r) => r?.blob));
  const byId = new Map(records.filter(Boolean).map((r) => [r.id, r]));
  const zip = new JSZip();
  zip.file('project.json', JSON.stringify(manifest, null, 1));
  try {
    const boards = await exportBoardsOf(project.id);
    if (boards.boards.length) zip.file('boards.json', JSON.stringify(boards));
  } catch {
    /* 画板库读不了：项目照样备份 */
  }
  for (const f of files) zip.file(f.path, byId.get(f.id).blob, { binary: true, compression: 'STORE' });
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip', compression: 'DEFLATE', compressionOptions: { level: 6 } }, (meta) =>
    onProgress?.('zip', Math.round(meta.percent), 100)
  );
  return { blob, missing: missing.length, assets: files.length };
}

/** 独立 Material Board（不属于任何项目的画板）+ 我的材质库 → 备份档；两样都空 → blob = null */
export async function exportBoardsBackup({ now = Date.now() } = {}) {
  const boards = await exportBoardsOf(STANDALONE_ID);
  const library = await listLibrary();
  const changedAt = boardsChangedAtOf(boards.boards, library);
  if (!boards.boards.length && !library.length) return { blob: null, boards: 0, library: 0, changedAt: 0 };
  const zip = new JSZip();
  zip.file(BOARDS_INDEX, JSON.stringify({ format: BOARDS_FORMAT, version: 1, app: 'UKIR STUDIO', exportedAt: new Date(now).toISOString(), boards: boards.boards.length, library: library.length }));
  zip.file('boards.json', JSON.stringify(boards));
  zip.file('library.json', JSON.stringify(library));
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip', compression: 'DEFLATE', compressionOptions: { level: 3 } });
  return { blob, boards: boards.boards.length, library: library.length, changedAt };
}

/** 画板 / 材质库现在的「最近改动时间」（不打包） */
export async function boardsChangedAt() {
  const boards = await exportBoardsOf(STANDALONE_ID);
  return boardsChangedAtOf(boards.boards, await listLibrary());
}

/**
 * 全部项目 + Material Board 打成一个文件（里面每个项目还是一个 .blueprint.zip，单独拿出来也能恢复）
 * @returns {Promise<{ blob:Blob, entries:Array<{ id, rev }>, boardsChangedAt:number, missing:number }>}
 */
export async function exportAllInOne(projects, { onProgress, now = Date.now() } = {}) {
  const zip = new JSZip();
  const entries = [];
  let missing = 0;
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    onProgress?.(i, projects.length, p.name);
    const r = await exportBundle(p);
    missing += r.missing;
    const file = `projects/${folderFileName(p)}`;
    zip.file(file, r.blob, { binary: true, compression: 'STORE' });
    entries.push({ id: p.id, name: p.name || '', rev: p.rev || 0, updatedAt: p.updatedAt || 0, file });
  }
  onProgress?.(projects.length, projects.length, 'Material Board');
  const boards = await exportBoardsBackup({ now });
  if (boards.blob) zip.file('material-board.blueprint.zip', boards.blob, { binary: true, compression: 'STORE' });
  zip.file(
    ALL_INDEX,
    JSON.stringify({ format: ALL_FORMAT, version: 1, app: 'UKIR STUDIO', exportedAt: new Date(now).toISOString(), projects: entries, boards: boards.blob ? 'material-board.blueprint.zip' : null }, null, 1)
  );
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip', compression: 'STORE' });
  return { blob, entries, boardsChangedAt: boards.changedAt, missing };
}

// ---------------------------------------------------------------------------
// 浏览器：打开 / 恢复
// ---------------------------------------------------------------------------

/**
 * 打开备份档（不写任何东西）
 * @returns {Promise<
 *   { kind:'project', zip, project, assets, exportedAt } |
 *   { kind:'boards', zip, exportedAt } |
 *   { kind:'all', zip, exportedAt, projects:Array<{ id, name, file, updatedAt }>, boards:string|null }>}
 */
export async function openBackupFile(file) {
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('打不开这个文件 —— 请选择从 UKIR STUDIO 下载的 .blueprint.zip 备份。');
  }
  const all = zip.file(ALL_INDEX);
  if (all) return { kind: 'all', zip, ...parseAllIndex(await all.async('string')) };
  const boards = zip.file(BOARDS_INDEX);
  if (boards) return { kind: 'boards', zip, ...parseBoardsIndex(await boards.async('string')) };
  const entry = zip.file('project.json');
  if (!entry) throw new Error('这不是 UKIR STUDIO 的项目备份（缺少 project.json）。');
  return { kind: 'project', zip, ...parseBundleManifest(await entry.async('string')) };
}

/** 全部备份里的一个项目 → 像单独的备份档一样打开 */
export async function openInnerBackup(opened, file) {
  const f = opened.zip.file(file);
  if (!f) throw new Error('全部备份里少了这个项目的文件。');
  return await openBackupFile(await f.async('blob'));
}

/**
 * 恢复一个项目备份（自己存好项目；中途失败把写进去的图片 / 画板清掉，原项目不受影响）
 *   keep   = 照备份里的项目 id（这台电脑上没有这个项目时）
 *   update = 盖掉这台电脑上的同一个项目（换下来的旧图片之后自动清理）；备份里有画板就换成备份的，没有就留着原来的
 *   copy   = 另存一份（新 id，名字加「副本」）
 * @returns {Promise<{ project:object, missing:number }>}
 */
export async function restoreBundle(opened, { mode = 'keep', existingNames = [], onProgress } = {}) {
  const { zip, project, assets } = opened;
  const id = mode === 'copy' || !project.id ? uid('p') : project.id;
  return await withSharedLock(WRITE_LOCK, async () => {
    const oldBoards = mode === 'copy' ? [] : (await listBoards(id)).map((b) => b.id);
    const stored = [];
    const srcMap = new Map();
    let missing = 0;
    let boardsIn = false;
    let saved;
    try {
      for (let i = 0; i < assets.length; i++) {
        const a = assets[i];
        const f = a?.file ? zip.file(a.file) : null;
        if (!f) {
          missing += 1;
          continue;
        }
        const data = await f.async('arraybuffer');
        const blob = new Blob([data], { type: a.mime || 'image/jpeg' });
        const src = await storeBlob(blob, { projectId: id, w: a.w || undefined, h: a.h || undefined });
        stored.push(assetIdOf(src));
        srcMap.set(`asset:${a.id}`, src);
        onProgress?.('assets', i + 1, assets.length);
      }
      const boardsEntry = zip.file('boards.json');
      if (boardsEntry) {
        let boards = null;
        try {
          boards = JSON.parse(await boardsEntry.async('string'));
        } catch {
          boards = null; // 画板数据坏了：项目照样恢复
        }
        if (boards?.boards?.length) {
          boardsIn = true;
          await importBoardsTo(id, boards, uid);
        }
      }
      const restored = restoreProject(project, srcMap, { id });
      if (mode === 'copy') restored.name = copyName(project.name, existingNames);
      saved = await saveProject(restored);
    } catch (err) {
      // 中途失败（多半是存储空间不足）：这次写进去的图片 / 画板清掉，不留孤儿；原项目（更新时）照旧
      await deleteAssetRecords(stored).catch(() => {});
      if (boardsIn) {
        for (const b of await listBoards(id).catch(() => [])) if (!oldBoards.includes(b.id)) await removeBoard(b.id);
      }
      throw err;
    }
    // 存好了：换下来的旧画板删掉（旧图片交给自动清理 —— 别的分页可能还开着这个项目）
    if (boardsIn) for (const bid of oldBoards) await removeBoard(bid);
    return { project: saved, missing };
  });
}

/**
 * 恢复 Material Board 备份：合并进这台电脑（同一块画板这里比较新就不动；材质库只加没有的）
 * @returns {Promise<{ boards:number, skipped:number, library:number }>}
 */
export async function restoreBoardsBackup(opened) {
  const read = async (name) => {
    const f = opened.zip.file(name);
    if (!f) return null;
    try {
      return JSON.parse(await f.async('string'));
    } catch {
      throw new Error('画板备份损坏：读不出里面的资料。');
    }
  };
  const boards = (await read('boards.json')) || { boards: [] };
  const library = (await read('library.json')) || [];
  const { put, skip } = planBoardsMerge(await listBoards(STANDALONE_ID), boards.boards);
  for (const b of put) {
    const { shots = [], ...rec } = b;
    if (!(await putBoard({ ...rec, projectId: STANDALONE_ID }))) throw new Error('画板没能保存（浏览器存储空间可能不足）');
    const have = new Set((await listShots(b.id)).map((s) => s.id));
    for (const s of [...shots].reverse()) {
      if (!s?.id || !s.dataUrl || have.has(s.id)) continue;
      if (!(await putShot({ ...s, boardId: b.id, projectId: STANDALONE_ID }))) throw new Error('实拍图没能保存（浏览器存储空间可能不足）');
    }
  }
  if (boards.active && put.some((b) => b.id === boards.active) && !(await getActiveBoardId(STANDALONE_ID))) await setActiveBoardId(STANDALONE_ID, boards.active);
  const items = newLibraryItems(await listLibrary(), Array.isArray(library) ? library : []);
  for (const it of items) if (!(await putLibraryItem(it))) throw new Error('材质没能保存（浏览器存储空间可能不足）');
  return { boards: put.length, skipped: skip, library: items.length };
}

/** 清掉某个（还没保存成功的）项目的图片与画板 */
export async function discardProjectData(id) {
  await deleteAssetsOf(id).catch(() => {});
  await removeBoardsOf(id).catch(() => {});
}
