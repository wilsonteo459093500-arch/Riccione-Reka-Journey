// 备份 / 恢复：把本机全部项目、报告、照片打包成一个 .json 文件
// （换手机、清浏览器数据前用；照片以 base64 内嵌，文件可能较大）
import { db } from './db.js';
import { blobToDataURL } from './images.js';

const FORMAT = 'sail-site-backup';

async function dataURLToBlob(url) {
  const res = await fetch(url);
  return res.blob();
}

export async function exportBackup({ onProgress } = {}) {
  const [projects, reports, media, kv] = await Promise.all([
    db.getAll('projects'),
    db.getAll('reports'),
    db.getAll('media'),
    db.getAll('kv'),
  ]);
  const outMedia = [];
  for (let i = 0; i < media.length; i += 1) {
    const m = media[i];
    const { blob, thumb, poster, ...meta } = m;
    outMedia.push({
      ...meta,
      blob: blob ? await blobToDataURL(blob) : null,
      thumb: thumb ? await blobToDataURL(thumb) : null,
      poster: poster ? await blobToDataURL(poster) : null,
    });
    onProgress?.(i + 1, media.length);
  }
  const data = { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), projects, reports, kv, media: outMedia };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

/** 合并导入（同 id 覆盖，不删除本机已有数据）。返回统计。 */
export async function importBackup(file, { onProgress } = {}) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('不是有效的备份文件');
  }
  if (data?.format !== FORMAT) throw new Error('不是溪岸 SITE 的备份文件');
  for (const p of data.projects || []) await db.put('projects', p);
  for (const r of data.reports || []) await db.put('reports', r);
  for (const k of data.kv || []) await db.put('kv', k);
  const media = data.media || [];
  for (let i = 0; i < media.length; i += 1) {
    const m = media[i];
    await db.put('media', {
      ...m,
      blob: m.blob ? await dataURLToBlob(m.blob) : null,
      thumb: m.thumb ? await dataURLToBlob(m.thumb) : null,
      poster: m.poster ? await dataURLToBlob(m.poster) : null,
    });
    onProgress?.(i + 1, media.length);
  }
  return {
    projects: (data.projects || []).length,
    reports: (data.reports || []).length,
    media: media.length,
  };
}
