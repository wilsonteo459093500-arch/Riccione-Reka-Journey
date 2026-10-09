// 设计师上传图片：校验能否打开、超大图先缩小，再存进 IndexedDB → 'asset:<id>'
import { storeBlob, measureBlob, toJpegBlob } from '../../store/assets.js';

const MAX_BYTES = 60 * 1024 * 1024;

/**
 * @param {File|Blob} file
 * @param {{ projectId:string, maxEdge?:number }} opts  maxEdge：效果图 3840，色板 900
 * @returns {Promise<string>} 'asset:<id>'
 */
export async function uploadImage(file, { projectId, maxEdge = 3840 } = {}) {
  if (!file) throw new Error('没有选到文件');
  if (file.type && !file.type.startsWith('image/')) throw new Error(`「${file.name || '文件'}」不是图片`);
  if (file.size > MAX_BYTES) throw new Error(`「${file.name || '图片'}」太大了（${Math.round(file.size / 1024 / 1024)} MB），请先压缩`);
  const size = await measureBlob(file);
  if (!size.w || !size.h) throw new Error(`「${file.name || '图片'}」打不开（HEIC 等格式请先转成 JPG / PNG）`);
  let blob = file;
  let { w, h } = size;
  const big = Math.max(w, h) > maxEdge;
  const odd = !/^image\/(jpeg|jpg|png)$/i.test(file.type || '');
  if (big || odd) {
    // 超大图缩到 maxEdge；webp / gif 等转成 JPEG（PPT 只认 JPEG / PNG）
    blob = await toJpegBlob(file, { maxEdge: big ? maxEdge : 0, quality: 0.9 });
    const scale = big ? maxEdge / Math.max(w, h) : 1;
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
  }
  return await storeBlob(blob, { projectId, w, h });
}

/** 从 <input type=file> / 拖放里挑出图片文件 */
export const imageFiles = (list) => [...(list || [])].filter((f) => !f.type || f.type.startsWith('image/'));
