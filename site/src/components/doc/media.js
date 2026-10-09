// 文档渲染用的媒体 URL 池：把 MediaRef 换成 objectURL + 元数据（说明 / 时长 / 尺寸）
// 只撤销自己创建的 objectURL；加载器 url() 返回的交给加载器自己 dispose。
import { modelMedia } from '../../lib/docmodel.js';

// 第一个能当图片用的 Blob（0 字节的跳过 → 显示「照片缺失」占位）
const pick = (...xs) => xs.find((b) => typeof Blob !== 'undefined' && b instanceof Blob && b.size > 0) || null;

async function resolveOne(media, ref, quality) {
  let rec = null;
  try {
    rec = media && typeof media.get === 'function' ? await media.get(ref.id) : null;
  } catch {
    rec = null;
  }
  const kind = rec?.kind || ref.kind || 'photo';
  const info = {
    kind,
    caption: (rec?.caption || ref.caption || '').trim(),
    duration: rec?.duration || 0,
    w: rec?.w || 0,
    h: rec?.h || 0,
  };
  // 视频用封面（没抓到封面就是 null → 「视频 Video」占位，视频文件本身不能当 <img>）；
  // 照片 / 签名：PDF 用原图（清晰），手机预览用缩略图（省内存）
  const blob =
    kind === 'video'
      ? pick(rec?.poster, rec?.thumb)
      : quality === 'thumb' && kind !== 'signature'
        ? pick(rec?.thumb, rec?.blob)
        : pick(rec?.blob, rec?.thumb);
  if (blob) {
    return { url: URL.createObjectURL(blob), owned: true, info };
  }
  if (media && typeof media.url === 'function') {
    try {
      const u = await media.url(ref.id, kind === 'video' ? 'poster' : quality === 'thumb' ? 'thumb' : 'blob');
      if (u) return { url: u, owned: false, info };
    } catch {
      /* 读不到就显示占位 */
    }
  }
  return { url: null, owned: false, info };
}

/**
 * const pool = createUrlPool(loader, { quality: 'full' | 'thumb' });
 * const { urls, info } = await pool.load(model);   // 可重复调用，已加载的复用
 * pool.release();                                    // 撤销全部自建 URL
 * 图片框尺寸固定（按 info.w/h 等比缩放），所以缩略图 / 原图排版完全一致。
 */
export function createUrlPool(media, { quality = 'full' } = {}) {
  const map = new Map(); // id → Promise<{ url, owned, info }>
  let released = false;
  return {
    async load(model) {
      const refs = modelMedia(model);
      const want = new Set(refs.map((r) => r.id));
      // 不再引用的先撤销（预览里改报告后）
      for (const [id, p] of map) {
        if (!want.has(id)) {
          map.delete(id);
          p.then((e) => e.owned && e.url && URL.revokeObjectURL(e.url));
        }
      }
      const urls = {};
      const info = {};
      await Promise.all(
        refs.map(async (r) => {
          if (!map.has(r.id)) map.set(r.id, resolveOne(media, r, quality));
          const e = await map.get(r.id);
          if (released) return;
          if (e.url) urls[r.id] = e.url;
          info[r.id] = e.info;
        }),
      );
      return { urls, info };
    },
    release() {
      released = true;
      for (const p of map.values()) p.then((e) => e.owned && e.url && URL.revokeObjectURL(e.url));
      map.clear();
    },
  };
}
