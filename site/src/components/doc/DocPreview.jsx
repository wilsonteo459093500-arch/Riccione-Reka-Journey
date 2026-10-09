// 手机上的 A4 预览：与 PDF 同一套渲染（DocPages），按容器宽度等比缩放
import { useCallback, useEffect, useRef, useState } from 'react';
import DocPages, { PAGE_GAP } from './DocPages.jsx';
import { createUrlPool } from './media.js';
import { PAGE_W, PAGE_H } from './theme.js';

function Loading({ text }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-[13px] text-ink-mute">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-line border-t-terra" />
      {text}
    </div>
  );
}

/**
 * @param {{ model: DocModel, media: { get(id), url?(id, which) } }} props
 */
export default function DocPreview({ model, media }) {
  const boxRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [assets, setAssets] = useState(null); // { model, urls, info }
  const [laid, setLaid] = useState(null); // { model, pages }
  const [error, setError] = useState('');
  const poolRef = useRef(null);

  // 容器宽度
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') {
      const onResize = () => setWidth(el.clientWidth);
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 媒体 URL 池：跟随 media 加载器的生命周期
  useEffect(() => {
    const pool = createUrlPool(media, { quality: 'thumb' }); // 预览用缩略图，PDF 才用原图
    poolRef.current = pool;
    return () => {
      poolRef.current = null;
      pool.release();
    };
  }, [media]);

  // 模型变化 → 预加载照片 / 签名 / 视频封面
  useEffect(() => {
    let alive = true;
    const pool = poolRef.current;
    if (!pool || !model) return undefined;
    setError('');
    pool
      .load(model)
      .then(({ urls, info }) => alive && setAssets({ model, urls, info }))
      .catch((e) => {
        if (!alive) return;
        setError(e?.message || String(e));
        setAssets({ model, urls: {}, info: {} });
      });
    return () => {
      alive = false;
    };
  }, [model, media]);

  const onLayout = useCallback(({ pages }) => {
    setLaid((cur) => (cur && cur.model === assets?.model && cur.pages === pages ? cur : { model: assets?.model, pages }));
  }, [assets]);

  const scale = width ? Math.min(1, width / PAGE_W) : 0;
  const pages = laid?.pages || 0;
  const innerH = pages ? pages * PAGE_H + (pages - 1) * PAGE_GAP : 0;
  const ready = !!assets && pages > 0;
  const busy = !assets || !laid || laid.model !== assets.model;

  return (
    <div ref={boxRef} className="relative w-full">
      {error && <div className="mb-2 rounded-lg bg-fail/10 px-3 py-2 text-[12px] text-fail">部分照片读取失败：{error}</div>}
      {!ready && <Loading text="正在排版预览…" />}
      {assets && scale > 0 && (
        <div
          style={{
            position: 'relative',
            width: Math.floor(PAGE_W * scale),
            height: ready ? Math.ceil(innerH * scale) : 0,
            margin: '0 auto',
            overflow: ready ? 'visible' : 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: PAGE_W,
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
            }}
          >
            <DocPages model={assets.model} urls={assets.urls} info={assets.info} onLayout={onLayout} preview />
          </div>
        </div>
      )}
      {ready && busy && (
        <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-white/90 px-2.5 py-1 text-[11px] text-ink-mute shadow-sm ring-1 ring-line">
          更新中…
        </div>
      )}
      {ready && (
        <div className="mt-2 text-center text-[11px] text-ink-faint">
          共 {pages} 页 · A4 · 与导出的 PDF 一致
        </div>
      )}
    </div>
  );
}
