// 项目级操作（浏览器）：复制、彻底删除

import { uid } from '../engine/model.js';
import { saveProject, deleteProject, getAssetRecord } from '../store/db.js';
import { collectAssetSrcs, assetIdOf, storeBlob } from '../store/assets.js';
import { removeBoardsOf } from '../moodboard/store.js';
import { remapAssetSrcs } from './bundle.js';
import { copyName } from './project.js';

/**
 * 复制项目：图片按新项目重新入库（删除原项目时按 projectId 清图，副本不受影响）
 * @returns {Promise<object>} 已保存的副本
 */
export async function duplicateProject(project, { existingNames = [], onProgress } = {}) {
  const id = uid('p');
  const srcs = [...collectAssetSrcs(project)];
  const map = new Map();
  for (let i = 0; i < srcs.length; i++) {
    const rec = await getAssetRecord(assetIdOf(srcs[i]));
    if (rec?.blob) map.set(srcs[i], await storeBlob(rec.blob, { projectId: id, w: rec.w, h: rec.h }));
    onProgress?.(i + 1, srcs.length);
  }
  const now = Date.now();
  const copy = {
    ...remapAssetSrcs(project, map),
    id,
    name: copyName(project.name, existingNames),
    createdAt: now,
    updatedAt: now,
  };
  return await saveProject(copy);
}

/** 删除项目：项目 JSON + 全部图片 + 它的 Material Board 画板 */
export async function removeProjectEverywhere(id) {
  await deleteProject(id);
  try {
    await removeBoardsOf(id);
  } catch {
    /* 画板库清理失败不影响删除项目 */
  }
}
