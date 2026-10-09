// A4 分页渲染器：预览和 PDF 共用（所见即所得）
// 流程：渲染隐藏测量层 → 读每个原子的高度 → paginate() 装页 → 渲染页面
//       → 等所有 <img> 加载 / 解码完 → onLayout({ pages })
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildAtoms, paginate } from './paginate.js';
import { Atom, ContHeader, Footer } from './blocks.jsx';
import { C, FONT, PAGE_W, PAGE_H, PAD_X, PAD_TOP, FOOT_H, CONT_HEAD_H, CONTENT_W } from './theme.js';

export const PAGE_GAP = 20; // 预览里页与页之间的间距（文档 px）

const NOPOS = { first: false, last: false };
const EMPTY = {};

/** 续页抬头右侧显示的项目名 */
export function projectLabel(model) {
  const find = (keys) => {
    for (const b of model.blocks || []) {
      if (b.type !== 'fields') continue;
      for (const key of keys) {
        const f = b.fields.find((x) => x.key === key && x.value && x.kind === 'inline');
        if (f) return f.value;
      }
    }
    return '';
  };
  const parts = String(model.meta?.reportTitle || '').split(' · ');
  return find(['project', 'site']) || (parts.length > 2 ? parts[1] : '') || find(['address', 'location']);
}

function waitImage(img, timeout = 20000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(finish, timeout);
    const decode = () => {
      if (typeof img.decode === 'function') img.decode().then(finish, finish);
      else finish();
    };
    if (img.complete) {
      if (img.naturalWidth) decode();
      else finish(); // 已失败
      return;
    }
    img.addEventListener('load', decode, { once: true });
    img.addEventListener('error', finish, { once: true });
  });
}

function Page({ items, atoms, heads, index, total, ctx, preview }) {
  const cont = index > 0;
  const top = PAD_TOP + (cont ? CONT_HEAD_H : 0);
  let seenReal = false;
  const realIdx = items.map((it) => ('atom' in it ? it.atom : -1));
  const lastReal = Math.max(...realIdx);
  return (
    <div
      data-page={index + 1}
      style={{
        position: 'relative',
        width: PAGE_W,
        height: PAGE_H,
        overflow: 'hidden',
        background: '#ffffff',
        boxSizing: 'border-box',
        marginTop: preview && index > 0 ? PAGE_GAP : 0,
        boxShadow: preview ? '0 1px 2px rgba(43,42,39,0.10), 0 4px 16px rgba(43,42,39,0.08)' : 'none',
      }}
    >
      {cont && (
        <div style={{ position: 'absolute', left: PAD_X, top: PAD_TOP, width: CONTENT_W }}>
          <ContHeader ctx={ctx} />
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          left: PAD_X,
          top,
          width: CONTENT_W,
          height: PAGE_H - top - FOOT_H,
          overflow: 'hidden',
        }}
      >
        {items.map((it, k) => {
          if ('cont' in it) {
            return (
              <div key={`c${k}`} style={{ display: 'flow-root' }}>
                <Atom atom={heads[it.cont]} ctx={ctx} pos={NOPOS} />
              </div>
            );
          }
          const a = atoms[it.atom];
          const first = !seenReal;
          seenReal = true;
          const prevCont = k > 0 && 'cont' in items[k - 1];
          return (
            <div key={it.atom} style={{ display: 'flow-root', marginTop: first || prevCont ? 0 : a.space || 0 }}>
              <Atom atom={a} ctx={ctx} pos={{ first, last: it.atom === lastReal }} />
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: PAD_X, width: CONTENT_W, bottom: 22 }}>
        <Footer ctx={ctx} page={index + 1} total={total} />
      </div>
    </div>
  );
}

/**
 * @param {{
 *   model: DocModel,
 *   urls?: { [mediaId]: string },          // objectURL（照片 / 签名 / 视频封面）
 *   info?: { [mediaId]: { kind, caption, duration, w, h } },  // 可选：说明 / 时长 / 尺寸
 *   onLayout?: ({ pages, page }) => void,  // 排版完成且图片加载完后调用
 *   preview?: boolean,                     // 预览：页间距 + 阴影
 *   only?: number,                         // 只渲染第 N 页（1 起；PDF 逐页截图省内存）
 * }} props
 */
export default function DocPages({ model, urls = EMPTY, info = EMPTY, onLayout, preview = false, only = null }) {
  const { atoms, heads } = useMemo(() => buildAtoms(model), [model]);
  const headKeys = useMemo(() => Object.keys(heads), [heads]);
  const [layout, setLayout] = useState(null); // { atoms, heads, info, pages }
  const measureRef = useRef(null);
  const rootRef = useRef(null);
  const cbRef = useRef(onLayout);
  cbRef.current = onLayout;

  const stale = !layout || layout.atoms !== atoms || layout.info !== info;

  const ctx = useMemo(
    () => ({ meta: model.meta || {}, accent: model.meta?.accent || C.terra, urls, info, project: projectLabel(model) }),
    [model, urls, info],
  );
  const mctx = useMemo(() => ({ ...ctx, measure: true }), [ctx]);

  // 测量 → 分页
  useLayoutEffect(() => {
    if (!stale) return undefined;
    let cancelled = false;
    const run = () => {
      const el = measureRef.current;
      if (cancelled || !el) return;
      const k = el.getBoundingClientRect().width / (el.offsetWidth || 1) || 1;
      const hOf = (node) => (node ? node.getBoundingClientRect().height / k : 0);
      const heights = atoms.map((_, i) => hOf(el.querySelector(`[data-m="${i}"]`)));
      const headHeights = {};
      headKeys.forEach((g, i) => {
        headHeights[g] = hOf(el.querySelector(`[data-mh="${i}"]`));
      });
      const pages = paginate(atoms, heights, headHeights);
      setLayout({ atoms, heads, info, pages });
    };
    const ready = typeof document !== 'undefined' && document.fonts?.ready ? document.fonts.ready : Promise.resolve();
    ready.then(
      () => !cancelled && run(),
      () => !cancelled && run(),
    );
    return () => {
      cancelled = true;
    };
  }, [stale, atoms, heads, headKeys, info]);

  // 页面渲染完 + 图片加载完 → onLayout
  useEffect(() => {
    if (!layout || stale) return undefined;
    let alive = true;
    const root = rootRef.current;
    const imgs = root ? [...root.querySelectorAll('[data-page] img')] : [];
    Promise.all(imgs.map((img) => waitImage(img))).then(() => {
      if (alive && cbRef.current) cbRef.current({ pages: layout.pages.length, page: only || null });
    });
    return () => {
      alive = false;
    };
  }, [layout, stale, urls, only]);

  const total = layout ? layout.pages.length : 0;

  return (
    <div ref={rootRef} style={{ position: 'relative', width: PAGE_W, fontFamily: FONT, color: C.ink, textAlign: 'left', WebkitFontSmoothing: 'antialiased' }}>
      {stale && (
        <div
          ref={measureRef}
          aria-hidden="true"
          data-doc-measure=""
          style={{ position: 'absolute', left: PAD_X, top: 0, width: CONTENT_W, visibility: 'hidden', pointerEvents: 'none', zIndex: -1 }}
        >
          {atoms.map((a, i) => (
            <div key={i} data-m={i} style={{ display: 'flow-root' }}>
              <Atom atom={a} ctx={mctx} pos={NOPOS} />
            </div>
          ))}
          {headKeys.map((g, i) => (
            <div key={`h${g}`} data-mh={i} style={{ display: 'flow-root' }}>
              <Atom atom={heads[g]} ctx={mctx} pos={NOPOS} />
            </div>
          ))}
        </div>
      )}
      {layout &&
        layout.pages.map((items, i) =>
          only && only !== i + 1 ? null : (
            <Page
              key={i}
              items={items}
              atoms={layout.atoms}
              heads={layout.heads}
              index={i}
              total={total}
              ctx={ctx}
              preview={preview}
            />
          ),
        )}
    </div>
  );
}
