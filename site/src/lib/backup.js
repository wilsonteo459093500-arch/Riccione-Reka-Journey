// 备份 / 恢复：把本机全部项目、报告、照片打包成一个文件（换手机、清浏览器前用）
//
// 格式 v2（逐行 JSON）：第 1 行是项目 / 报告 / 设置，之后每行一个照片 / 视频（base64）。
// 逐条拼成 Blob、恢复时逐行读，不会把几百 MB 的视频塞进一个字符串（会撑爆手机内存）。
// 仍兼容 v1（整份一个 JSON）。
import { db } from './db.js';
import { blobToDataURL } from './images.js';

const FORMAT = 'sail-site-backup';

async function dataURLToBlob(url) {
  const res = await fetch(url);
  return res.blob();
}

/**
 * @param {{ includeVideos?: boolean, onProgress?: (done, total) => void }} opts
 * @returns {Promise<Blob>}
 */
export async function exportBackup({ includeVideos = true, onProgress } = {}) {
  const [projects, reports, kv] = await Promise.all([db.getAll('projects'), db.getAll('reports'), db.getAll('kv')]);
  const media = await db.getAll('media');
  const list = includeVideos ? media : media.filter((m) => m.kind !== 'video');
  const parts = [
    JSON.stringify({ format: FORMAT, version: 2, exportedAt: new Date().toISOString(), projects, reports, kv, mediaCount: list.length, videosSkipped: media.length - list.length }),
    '\n',
  ];
  for (let i = 0; i < list.length; i += 1) {
    const { blob, thumb, poster, ...meta } = list[i];
    parts.push(
      JSON.stringify({
        media: {
          ...meta,
          blob: blob ? await blobToDataURL(blob) : null,
          thumb: thumb ? await blobToDataURL(thumb) : null,
          poster: poster ? await blobToDataURL(poster) : null,
        },
      }),
      '\n',
    );
    onProgress?.(i + 1, list.length);
  }
  return new Blob(parts, { type: 'application/x-ndjson' });
}

/** 逐行读文件（支持流式的浏览器不一次性读进内存） */
async function* readLines(file) {
  if (file.stream && typeof TextDecoderStream !== 'undefined') {
    const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (line.trim()) yield line;
      }
    }
    if (buf.trim()) yield buf;
    return;
  }
  for (const line of (await file.text()).split('\n')) if (line.trim()) yield line;
}

async function putMediaRecord(m) {
  await db.put('media', {
    ...m,
    blob: m.blob ? await dataURLToBlob(m.blob) : null,
    thumb: m.thumb ? await dataURLToBlob(m.thumb) : null,
    poster: m.poster ? await dataURLToBlob(m.poster) : null,
  });
}

/**
 * 合并导入：本机较新的项目 / 报告保留不动；本机已填的「我的资料」不被覆盖。
 * 返回统计 { projects, reports, media, skipped }。
 */
export async function importBackup(file, { onProgress } = {}) {
  const lines = readLines(file);
  const first = await lines.next();
  let head;
  try {
    head = JSON.parse(first.value || '');
  } catch (e) {
    if (e instanceof RangeError) throw new Error('备份文件太大，这台设备读不了');
    throw new Error('不是有效的备份文件');
  }
  if (head?.format !== FORMAT) throw new Error('不是溪岸 SITE 的备份文件');

  const stats = { projects: 0, reports: 0, media: 0, skipped: 0 };
  const newer = async (store, row) => {
    const local = await db.get(store, row.id);
    if (local && (local.updatedAt || 0) > (row.updatedAt || 0)) {
      stats.skipped += 1;
      return false;
    }
    return true;
  };
  for (const p of head.projects || []) {
    if (await newer('projects', p)) {
      await db.put('projects', p);
      stats.projects += 1;
    }
  }
  for (const r of head.reports || []) {
    if (await newer('reports', r)) {
      await db.put('reports', r);
      stats.reports += 1;
    }
  }
  for (const k of head.kv || []) {
    if (k.key === 'settings') {
      // 我的资料：只补本机还空着的项
      const local = (await db.get('kv', 'settings'))?.value || {};
      const merged = { ...local };
      for (const [key, v] of Object.entries(k.value || {})) if (!local[key]) merged[key] = v;
      await db.put('kv', { key: 'settings', value: merged });
    } else if (!(await db.get('kv', k.key))) {
      await db.put('kv', k);
    }
  }

  const total = head.version >= 2 ? head.mediaCount || 0 : (head.media || []).length;
  if (head.version >= 2) {
    for await (const line of lines) {
      const row = JSON.parse(line);
      if (!row.media) continue;
      await putMediaRecord(row.media);
      stats.media += 1;
      onProgress?.(stats.media, total);
    }
  } else {
    for (const m of head.media || []) {
      await putMediaRecord(m);
      stats.media += 1;
      onProgress?.(stats.media, total);
    }
  }
  return stats;
}
