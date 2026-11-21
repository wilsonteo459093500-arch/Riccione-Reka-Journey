// 自动清掉没人用的图片和画板（体检第 4 阶段，用户 2026-11-21 选「自动清」）。
//   没人用 = 哪个项目都没引用它：导入失败 / 取消留下的、换掉的、删掉的、恢复备份「更新原项目」换下来的旧图
//   不清：1 小时内刚存的（可能是正在导入 / 正在上传、还没挂到项目上）；正在编辑的项目的图（撤销历史里可能还用着）；
//         有人正在导入 PDF / 恢复备份 / 复制项目时整轮都不清；浏览器不支持 Web Locks 时也不清（分不清有没有人在用）
// 判断是纯函数（Node 可测）；读写 IndexedDB 的部分只在浏览器里调用。

import { collectAssetSrcs, assetIdOf } from '../store/assets.js';
import { listProjects, listAssetInfo, deleteAssetRecords } from '../store/db.js';
import { listAllBoards, removeBoard } from '../moodboard/store.js';
import { STANDALONE_ID } from '../moodboard/constants.js';
import { whenNobodyWrites } from './locks.js';

export const CLEAN_MIN_AGE = 3600 * 1000;

/** 全部项目引用到的图片 id */
export function referencedAssetIds(projects) {
  const out = new Set();
  for (const p of projects || []) for (const src of collectAssetSrcs(p)) out.add(assetIdOf(src));
  return out;
}

/**
 * @param {Array<{ id, projectId, ts, size }>} assets
 * @param {object[]} projects  库里全部项目
 * @param {{ now?:number, minAge?:number, editing?:Set<string> }} opts
 * @returns {{ ids:string[], bytes:number }}
 */
export function findOrphanAssets(assets, projects, { now = Date.now(), minAge = CLEAN_MIN_AGE, editing = new Set() } = {}) {
  const used = referencedAssetIds(projects);
  const ids = [];
  let bytes = 0;
  for (const a of assets || []) {
    if (!a?.id || used.has(a.id)) continue;
    if (a.projectId && editing.has(a.projectId)) continue;
    if (!(a.ts > 0) || now - a.ts < minAge) continue; // 没记时间的也不碰
    ids.push(a.id);
    bytes += a.size || 0;
  }
  return { ids, bytes };
}

/** 项目已经不在了的画板（独立 Material Board 的不算）→ 画板 id */
export function findOrphanBoards(boards, projects, { now = Date.now(), minAge = CLEAN_MIN_AGE } = {}) {
  const alive = new Set((projects || []).map((p) => p.id));
  return (boards || [])
    .filter((b) => b?.id && b.projectId && b.projectId !== STANDALONE_ID && !alive.has(b.projectId))
    .filter((b) => {
      const ts = b.ts || b.createdAt || 0;
      return ts > 0 && now - ts >= minAge;
    })
    .map((b) => b.id);
}

// ---------------------------------------------------------------------------
// 浏览器
// ---------------------------------------------------------------------------

/**
 * 清一轮。有人正在写 / 浏览器不支持 → null（这轮不清）
 * @returns {Promise<{ images:number, bytes:number, boards:number }|null>}
 */
export async function cleanUpStorage({ now = Date.now() } = {}) {
  return await whenNobodyWrites(async (editing) => {
    const projects = await listProjects();
    const { ids, bytes } = findOrphanAssets(await listAssetInfo(), projects, { now, editing });
    await deleteAssetRecords(ids);
    const boardIds = findOrphanBoards(await listAllBoards(), projects, { now });
    for (const id of boardIds) await removeBoard(id);
    return { images: ids.length, bytes, boards: boardIds.length };
  });
}
