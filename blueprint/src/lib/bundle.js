// 项目备份（.blueprint.zip）：project.json + assets/<id>.<ext>
// 导出：把项目 JSON 和它引用的所有图片打包；导入：图片重新入库（新 id）、项目换新 id，原项目不受影响。
// 纯函数（清单生成 / 解析 / 引用改写）在 Node 可测；读写 IndexedDB 的部分只在浏览器里调用。

import JSZip from 'jszip';
import { uid } from '../engine/model.js';
import { collectAssetSrcs, assetIdOf, isAssetSrc, storeBlob } from '../store/assets.js';
import { getAssetRecord } from '../store/db.js';

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

/** 深拷贝并改写所有 'asset:<旧id>' → map 里的新 src（不在 map 里的原样保留） */
export function remapAssetSrcs(obj, map) {
  const get = (src) => (map instanceof Map ? map.get(src) : map?.[src]);
  const walk = (v) => {
    if (typeof v === 'string') return isAssetSrc(v) ? get(v) || v : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, x] of Object.entries(v)) out[k] = walk(x);
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
    app: 'DREAMHOUSE BLUEPRINT',
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
    throw new Error('这不是 Dreamhouse Blueprint 的项目备份（.blueprint.zip）。');
  }
  if ((data.version || 1) > BUNDLE_VERSION) {
    throw new Error('这个备份来自更新版本的 Blueprint，请先刷新页面再试。');
  }
  if (!Array.isArray(data.project.slides)) throw new Error('备份文件不完整：缺少页面数据。');
  return { project: data.project, assets: Array.isArray(data.assets) ? data.assets : [] };
}

/** 用新 id 与新素材引用还原项目 */
export function restoreProject(project, srcMap, { id = uid('p'), now = Date.now() } = {}) {
  const out = remapAssetSrcs(project, srcMap);
  return { ...out, id, createdAt: out.createdAt || now, updatedAt: now };
}

// ---------------------------------------------------------------------------
// 浏览器：导出 / 导入
// ---------------------------------------------------------------------------

/** 打包备份 → Blob（application/zip） */
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
  for (const f of files) zip.file(f.path, byId.get(f.id).blob, { binary: true, compression: 'STORE' });
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip', compression: 'DEFLATE', compressionOptions: { level: 6 } }, (meta) =>
    onProgress?.('zip', Math.round(meta.percent), 100)
  );
  return { blob, missing: missing.length, assets: files.length };
}

/** 读备份 → 新项目（图片已重新入库；调用方负责 saveProject） */
export async function importBundle(file, { onProgress } = {}) {
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('打不开这个文件 —— 请选择从 Blueprint 下载的 .blueprint.zip 项目备份。');
  }
  const entry = zip.file('project.json');
  if (!entry) throw new Error('这不是 Dreamhouse Blueprint 的项目备份（缺少 project.json）。');
  const { project, assets } = parseBundleManifest(await entry.async('string'));
  const id = uid('p');
  const srcMap = new Map();
  let missing = 0;
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    const f = a?.file ? zip.file(a.file) : null;
    if (!f) {
      missing += 1;
      continue;
    }
    const data = await f.async('arraybuffer');
    const blob = new Blob([data], { type: a.mime || 'image/jpeg' });
    srcMap.set(`asset:${a.id}`, await storeBlob(blob, { projectId: id, w: a.w || undefined, h: a.h || undefined }));
    onProgress?.('assets', i + 1, assets.length);
  }
  return { project: restoreProject(project, srcMap, { id }), missing };
}
