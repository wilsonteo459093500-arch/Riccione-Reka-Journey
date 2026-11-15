import React, { useEffect, useMemo, useRef, useState } from 'react';
import { paintScene } from '../../plan3d/paint.js';
import { paletteOf } from '../../plan3d/palette.js';
import { planScene } from '../../ai/plan3d.js';
import { resolveUrl } from '../../store/assets.js';

// 3D 户型图的画布：坐标一变就重画（程序出图，不花 key）。
// props: { geo, view, textures?:{ 槽位: <img> }, longEdge?, className?, canvasRef? }

const createCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

/** 画到指定的画布上；坐标还画不出来（没有房间）→ false */
export function paintPlan3d(canvas, geo, view, textures, longEdge) {
  if (!canvas || !geo || !(geo.rooms || []).length) return false;
  const scene = planScene(geo, view, longEdge ? { longEdge } : undefined);
  paintScene(canvas, scene, paletteOf('warm'), { createCanvas, textures: textures || {} });
  return true;
}

const imageCache = new Map(); // 图片地址 → Promise<HTMLImageElement>
function loadImage(url) {
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('贴图读不出来'));
      img.src = url;
    });
    imageCache.set(url, p);
    p.catch(() => imageCache.delete(url));
  }
  return p;
}

/** { 槽位: 'asset:…' } → { 槽位: 已加载的 <img> }（加载完才出现；读不出来的槽位按默认画法） */
export function useTextureImages(srcs) {
  const key = JSON.stringify(srcs || {});
  const [state, setState] = useState({ key: '', imgs: {} });
  useEffect(() => {
    let alive = true;
    const entries = Object.entries(srcs || {});
    Promise.all(
      entries.map(async ([slot, src]) => {
        const url = resolveUrl(src);
        if (!url) return null;
        try {
          return [slot, await loadImage(url)];
        } catch {
          return null;
        }
      })
    ).then((list) => alive && setState({ key, imgs: Object.fromEntries(list.filter(Boolean)) }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.imgs;
}

export default function Plan3dPreview({ geo, view, textures, longEdge = 1000, className = '', canvasRef }) {
  const own = useRef(null);
  const ref = canvasRef || own;
  const frame = useRef(0);
  const [ok, setOk] = useState(true);
  const viewKey = useMemo(() => JSON.stringify(view || {}), [view]);

  useEffect(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      try {
        setOk(paintPlan3d(ref.current, geo, view, textures, longEdge));
      } catch {
        setOk(false);
      }
    });
    return () => cancelAnimationFrame(frame.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, viewKey, textures, longEdge]);

  return (
    <div className={`relative ${className}`}>
      <canvas ref={ref} className={`block w-full h-auto ${ok ? '' : 'invisible'}`} aria-label="3D 户型图" />
      {!ok && <div className="absolute inset-0 flex items-center justify-center text-xs text-bp-faint px-4 text-center">先画出房间，这里就会出图</div>}
    </div>
  );
}
