// 照片缩略图 URL 缓存（同一张图在多个组件里只读一次 IndexedDB）
import { useEffect, useState } from 'react';
import { getMedia, putMedia } from '../../lib/db.js';

const urlCache = new Map(); // key `${id}:${which}` → Promise<string|null>

export function mediaUrl(id, which = 'thumb') {
  const key = `${id}:${which}`;
  if (!urlCache.has(key)) {
    urlCache.set(
      key,
      getMedia(id)
        .then((m) => {
          if (!m) return null;
          // 视频的 blob 是视频文件：缩略图 / 封面只能用 poster
          const b =
            which === 'full'
              ? m.blob
              : which === 'poster' || m.kind === 'video'
                ? m.poster || m.thumb
                : m.thumb || m.blob;
          return b ? URL.createObjectURL(b) : null;
        })
        .catch(() => null),
    );
  }
  return urlCache.get(key);
}

export function forgetMedia(id) {
  for (const which of ['thumb', 'full', 'poster']) {
    const key = `${id}:${which}`;
    const p = urlCache.get(key);
    if (p) p.then((u) => u && URL.revokeObjectURL(u));
    urlCache.delete(key);
  }
}

/** 返回 undefined = 加载中，null = 没有可显示的图（如视频截不到封面） */
export function useMediaUrl(id, which = 'thumb') {
  const [url, setUrl] = useState(undefined);
  useEffect(() => {
    let alive = true;
    setUrl(undefined);
    if (id) mediaUrl(id, which).then((u) => alive && setUrl(u || null));
    return () => {
      alive = false;
    };
  }, [id, which]);
  return url;
}

export function useMediaRecord(id) {
  const [m, setM] = useState(null);
  useEffect(() => {
    let alive = true;
    if (id) getMedia(id).then((r) => alive && setM(r || null));
    return () => {
      alive = false;
    };
  }, [id]);
  return [m, setM];
}

export async function setCaption(id, caption) {
  const m = await getMedia(id);
  if (!m) return;
  await putMedia({ ...m, caption });
}
