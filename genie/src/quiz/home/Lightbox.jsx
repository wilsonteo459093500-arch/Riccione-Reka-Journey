// 全屏看图（docs/showcase/SPEC.md §2，懒载入）：黑底、整张照片放进来；两指捏放大（最多 4 倍）、双击 1× ↔ 2.5×、
// 放大以后拖着看（不会拖出边）、1× 时左右滑换照片（往下滑 = 关掉）；← → 换照片、Esc / ✕ 回到详情的同一张。
// 底下：房间 · 说明 · 「3 / 18」。没有下载、没有长按存图（许愿模式）。系统设了「减少动态效果」→ 不做动画。
// 照片和详情的相册共用一个 store（读好的小图 / 大图直接拿来用）；大图只留现在这张 ± 1。
// 挂在 body 上（createPortal）：外面那张纸的动画 / 变形不会把它框住。

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import fx from '../../shared/fx.js';
import { sfx } from '../../shared/sfx.js';
import { t } from '../../shared/i18n.js';
import * as C from '../../shared/cases.js';
import { pushLayer, lockScroll, noSave, textOf, inWish, useBig, capture } from './CaseGallery.jsx';

const MAX = 4;
const DOUBLE = 2.5;
const SNAP = 1.05; // 捏完不到这么大 → 回到 1×（放大一点点没意义，还会让左右滑换照片失灵）
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * 放大以后照片的边不离开屏幕的边；比屏幕小的那一边不能拖（放在中间）。
 * size = 照片 1× 时的大小，vp = 屏幕，shiftY = 照片中心比屏幕中心低多少（上下留给字的不一样多）。
 */
export function clampPan(s, x, y, size, vp, shiftY) {
  const mx = (size.w * s - vp.w) / 2;
  const my = (size.h * s - vp.h) / 2;
  return { s, x: mx > 0 ? clamp(x, -mx, mx) : 0, y: my > 0 ? clamp(y, -my - shiftY, my - shiftY) : 0 };
}

/**
 * 两指捏完、松开一根 → { z: 放手以后的倍数和位置, g: 还按着的那根手指（rest = { x, y }，没有 → null）接下来的手势 }。
 * 先定倍数再给手势：不到 SNAP 就回到 1×，剩下那根手指什么都不做（g = null；不能带着捏的时候的倍数接着拖 ——
 * 照片又会放大一点点、「放大」按钮还以为没放大、左右滑也不灵了）；还放大着 → 剩下那根手指接着拖。
 */
export function pinchEnd(z, rest, t0 = 0) {
  const z1 = z.s < SNAP ? { s: 1, x: 0, y: 0 } : { ...z };
  const g = rest && z1.s > 1 ? { kind: 'pan', x0: rest.x, y0: rest.y, t0, z0: { ...z1 }, moved: true } : null;
  return { z: z1, g };
}

/** 照片放进 vw × vh（留出上下的字）的大小（照片资料里的宽高，不等图片读完 —— 换大图不跳） */
function fitSize(img, vw, vh) {
  const w = img?.w || 4;
  const h = img?.h || 3;
  const k = Math.min(vw / w, vh / h);
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

function Pic({ c, img, store, near, size, title, imgRef }) {
  const small = store.url(c, img, 480);
  const big = near ? store.url(c, img, 1600) : '';
  const src = useBig(small, big);
  return src ? (
    <img ref={imgRef} src={src} alt={textOf(img.alt) || title} width={size.w} height={size.h} style={{ width: size.w, height: size.h }} decoding="async" {...noSave} />
  ) : (
    <span className="cv-lb-wait" style={{ width: size.w, height: size.h }} />
  );
}

export default function Lightbox({ c, list, index, store, title = '', onIndex, onClose }) {
  const n = list.length;
  const [i, setI] = useState(() => clamp(index, 0, Math.max(0, n - 1)));
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [chrome, setChrome] = useState(true);
  const [hint, setHint] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(null);
  const rootRef = useRef(null);
  const trackRef = useRef(null);
  const zoomRef = useRef(null);
  const z = useRef({ s: 1, x: 0, y: 0 });
  const ptrs = useRef(new Map());
  const g = useRef(null);
  const lastTap = useRef(null);
  const tapT = useRef(0);
  const wish = useRef(inWish()).current;
  const reduced = fx.motion.reduced;
  const img = list[i];

  // 照片放在哪一块（上面留 ✕ / 计数，下面留说明；宽的屏幕两边留箭头）
  const wide = vp.w > 700;
  const padX = vp.w >= 1000 ? 76 : 0; // 竖放的 iPad / 手机：照片用满整个宽度（箭头浮在照片上）
  const padTop = 64;
  // 许愿模式（iPad 尺寸）：说明抬到外壳的小坞上面（CSS 多垫 66 px），照片跟着让出这一块，说明不压在照片上
  const padBottom = wish && vp.w > 560 ? 158 : 92;
  const area = { w: Math.max(80, vp.w - padX * 2), h: Math.max(80, vp.h - padTop - padBottom) };
  const size = fitSize(img, area.w, area.h);

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 详情的相册跟着走（关掉时回到同一张）
  useEffect(() => {
    onIndex?.(i);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  // 1600 只留现在这张 ± 1
  useEffect(() => {
    const keep = new Set();
    for (const k of [i - 1, i, i + 1]) if (list[k]) keep.add(`${c.id}/${list[k].id}`);
    store.keepBig(keep);
  }, [c, list, i, store]);

  // 「双指放大 · 双击放大」一会儿就淡掉
  useEffect(() => {
    const id = setTimeout(() => setHint(false), 2600);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => () => clearTimeout(tapT.current), []);

  const apply = (anim = false) => {
    const el = zoomRef.current;
    if (!el) return;
    const { s, x, y } = z.current;
    el.style.transition = anim && !reduced ? 'transform 0.28s var(--ease)' : 'none';
    el.style.transform = s === 1 && !x && !y ? '' : `translate3d(${x}px, ${y}px, 0) scale(${s})`;
  };
  const shiftY = (padTop - padBottom) / 2; // 照片中心比屏幕中心低（正）/ 高（负）多少
  const bound = (s, x, y) => clampPan(s, x, y, size, vp, shiftY);
  const setZoom = (s, x, y, anim) => {
    z.current = s <= 1.01 ? { s: 1, x: 0, y: 0 } : bound(s, x, y);
    apply(anim);
    const on = z.current.s > 1;
    setZoomed((v) => (v === on ? v : on));
  };
  // 转了 iPad / 窗口变了：放大着的照片按新的大小重新夹一下（画出来之前；不然边上露出一条黑的，下一次碰到才跳回来）
  useLayoutEffect(() => {
    if (z.current.s > 1) setZoom(z.current.s, z.current.x, z.current.y);
  }, [vp.w, vp.h]); // eslint-disable-line react-hooks/exhaustive-deps
  /** 以屏幕上的一点 (px, py) 为中心缩放到 s */
  const zoomAt = (s1, px, py, anim) => {
    const { s, x, y } = z.current;
    const cx = vp.w / 2;
    const cy = vp.h / 2 + shiftY;
    const ns = clamp(s1, 1, MAX);
    // 屏幕上 (px, py) 这一点在照片上的位置不动
    const qx = (px - cx - x) / s;
    const qy = (py - cy - y) / s;
    setZoom(ns, px - cx - qx * ns, py - cy - qy * ns, anim);
  };

  const close = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onClose?.(i), reduced ? 0 : 180);
  }, [closing, onClose, i, reduced]);

  const go = (d, wrap = false) => {
    if (n < 2) return;
    let to = i + d;
    if (wrap) to = (to + n) % n;
    if (to < 0 || to >= n) return;
    z.current = { s: 1, x: 0, y: 0 };
    apply();
    setZoomed(false);
    setI(to);
  };

  // 键盘：Esc 关、← → 换照片（只给最上面这一层）
  const keys = useRef(null);
  keys.current = { close, go };
  useEffect(() => {
    const pop = pushLayer((e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        keys.current.close();
      } else if (e.key === 'ArrowRight') keys.current.go(1, true);
      else if (e.key === 'ArrowLeft') keys.current.go(-1, true);
    }, rootRef);
    const unlock = lockScroll();
    let r1 = 0;
    let r2 = 0;
    r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      pop();
      unlock();
    };
  }, []);

  // 换了照片：轨道放回 0、放大还原（画出来之前做：不会闪一下滑走的那张）
  useLayoutEffect(() => {
    const tr = trackRef.current;
    if (tr) {
      tr.style.transition = 'none';
      tr.style.transform = '';
    }
    z.current = { s: 1, x: 0, y: 0 };
    apply();
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  // 滚轮 / 触控板捏合（电脑）：以鼠标那一点缩放（要 passive: false 才能 preventDefault）
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!e.target.closest?.('.cv-lb-stage')) return;
      e.preventDefault();
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      zoomAt(z.current.s * k, e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // ───────── 手势 ─────────
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const track = (dx, dy, anim) => {
    const tr = trackRef.current;
    if (!tr) return;
    tr.style.transition = anim && !reduced ? 'transform 0.28s var(--ease), opacity 0.28s var(--ease)' : 'none';
    tr.style.transform = dx || dy ? `translate3d(${dx}px, ${dy}px, 0)` : '';
    tr.style.opacity = dy ? String(clamp(1 - Math.abs(dy) / (vp.h * 0.7), 0.35, 1)) : '';
  };
  const startPinch = () => {
    const [a, b] = [...ptrs.current.values()];
    g.current = { kind: 'pinch', d0: Math.max(1, dist(a, b)), m0: mid(a, b), z0: { ...z.current } };
    track(0, 0);
  };
  const onDown = (e) => {
    if (e.button > 0) return;
    capture(e.currentTarget, e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2) return startPinch();
    if (ptrs.current.size > 2) return;
    g.current = { kind: z.current.s > 1 ? 'pan' : 'swipe', x0: e.clientX, y0: e.clientY, t0: performance.now(), z0: { ...z.current }, axis: null, moved: false };
  };
  const onMove = (e) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const st = g.current;
    if (!st) return;
    if (st.kind === 'pinch') {
      const [a, b] = [...ptrs.current.values()];
      if (!a || !b) return;
      const m = mid(a, b);
      const s1 = clamp(st.z0.s * (dist(a, b) / st.d0), 1, MAX);
      const cx = vp.w / 2;
      const cy = vp.h / 2 + shiftY;
      // 开始捏的那一点（照片上）跟着两指的中点走
      const qx = (st.m0.x - cx - st.z0.x) / st.z0.s;
      const qy = (st.m0.y - cy - st.z0.y) / st.z0.s;
      z.current = bound(s1, m.x - cx - qx * s1, m.y - cy - qy * s1);
      apply();
      return;
    }
    const dx = e.clientX - st.x0;
    const dy = e.clientY - st.y0;
    if (!st.moved && Math.hypot(dx, dy) > 8) st.moved = true;
    if (st.kind === 'pan') {
      z.current = bound(st.z0.s, st.z0.x + dx, st.z0.y + dy);
      apply();
      return;
    }
    if (!st.axis && st.moved) st.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    if (st.axis === 'x') {
      const edge = (i === 0 && dx > 0) || (i === n - 1 && dx < 0) || n < 2;
      track(edge ? dx / 3 : dx, 0);
    } else if (st.axis === 'y' && dy > 0) track(0, dy);
  };
  const onUp = (e) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.delete(e.pointerId);
    const st = g.current;
    if (!st) return;
    if (st.kind === 'pinch') {
      // 先定倍数（不到 1.05 → 1×），再看还剩的那根手指：还放大着才接着拖
      const rest = ptrs.current.size === 1 ? [...ptrs.current.values()][0] : null;
      const end = pinchEnd(z.current, rest, performance.now());
      g.current = end.g;
      if (end.z.s > 1) setZoomed(true);
      else setZoom(1, 0, 0, true);
      return;
    }
    g.current = null;
    const dt = Math.max(1, performance.now() - st.t0);
    const dx = e.clientX - st.x0;
    const dy = e.clientY - st.y0;
    if (!st.moved && dt < 400) return tap(e.clientX, e.clientY);
    if (st.kind !== 'swipe') return;
    if (st.axis === 'x') {
      const fast = Math.abs(dx) / dt > 0.45 && Math.abs(dx) > 24;
      const dir = Math.abs(dx) > vp.w * 0.16 || fast ? (dx < 0 ? 1 : -1) : 0;
      const to = i + dir;
      if (dir && to >= 0 && to < n) {
        if (reduced) return go(dir);
        track(-dir * (vp.w + 24), 0, true);
        setTimeout(() => go(dir), 280);
        return;
      }
      track(0, 0, true);
    } else if (st.axis === 'y') {
      if (dy > Math.min(140, vp.h * 0.18)) return close();
      track(0, 0, true);
    }
  };
  const onCancel = (e) => {
    ptrs.current.delete(e.pointerId);
    g.current = null;
    track(0, 0, true);
  };
  // 点一下：收起 / 叫出上下的字；很快点两下：1× ↔ 2.5×（以点的那一点为中心）
  const tap = (x, y) => {
    const last = lastTap.current;
    const now = performance.now();
    if (last && now - last.t < 300 && Math.hypot(x - last.x, y - last.y) < 36) {
      lastTap.current = null;
      clearTimeout(tapT.current);
      if (z.current.s > 1) setZoom(1, 0, 0, true);
      else zoomAt(DOUBLE, x, y, true);
      return;
    }
    lastTap.current = { t: now, x, y };
    clearTimeout(tapT.current);
    tapT.current = setTimeout(() => setChrome((v) => !v), 300);
  };

  if (!img) return null;
  const room = C.roomLabel(img.room);
  const cap = textOf(img.caption);
  const slides = [-1, 0, 1].map((k) => ({ k, im: list[i + k] })).filter((x) => x.im);
  return createPortal(
    <div
      ref={rootRef}
      className={`cv-lb ${closing ? 'is-closing' : ''} ${chrome ? '' : 'is-bare'} ${zoomed ? 'is-zoomed' : ''} ${wish ? 'is-wish' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('全屏看图')}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="cv-lb-stage" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} style={{ '--cv-lb-shift': `${shiftY}px` }}>
        <div className="cv-lb-track" ref={trackRef}>
          {slides.map(({ k, im }) => {
            const sz = k === 0 ? size : fitSize(im, area.w, area.h);
            return (
              <div key={im.id} className="cv-lb-slide" style={{ transform: `translate3d(${k * (vp.w + 24)}px, ${shiftY}px, 0)` }} aria-hidden={k !== 0}>
                <div className="cv-lb-zoom" ref={k === 0 ? zoomRef : null}>
                  <Pic c={c} img={im} store={store} near size={sz} title={title} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="cv-lb-top">
        <button ref={closeRef} type="button" className="cv-lb-x" onClick={close} aria-label={t('关闭')} data-sfx="close">
          <X size={20} strokeWidth={2} aria-hidden="true" />
        </button>
        {n > 1 && (
          <span className="cv-lb-count" aria-live="polite">
            {i + 1} / {n}
          </span>
        )}
        <button type="button" className="cv-lb-zbtn" aria-pressed={zoomed} onClick={() => (z.current.s > 1 ? setZoom(1, 0, 0, true) : zoomAt(DOUBLE, vp.w / 2, vp.h / 2 + shiftY, true))} aria-label={zoomed ? t('还原') : t('放大')} data-sfx="tap">
          {zoomed ? <ZoomOut size={19} strokeWidth={2} aria-hidden="true" /> : <ZoomIn size={19} strokeWidth={2} aria-hidden="true" />}
        </button>
      </div>
      {n > 1 && wide && (
        <>
          <button type="button" className="cv-lb-arrow is-prev" aria-label={t('上一张')} disabled={i === 0} onClick={() => go(-1)} data-sfx="tap">
            <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
          </button>
          <button type="button" className="cv-lb-arrow is-next" aria-label={t('下一张')} disabled={i === n - 1} onClick={() => go(1)} data-sfx="tap">
            <ChevronRight size={24} strokeWidth={2} aria-hidden="true" />
          </button>
        </>
      )}
      <div className="cv-lb-foot">
        {(room || img.detail) && (
          <b>
            {[room, img.detail ? t('细节') : ''].filter(Boolean).join(' · ')}
          </b>
        )}
        {cap && <span>{cap}</span>}
        {hint && !zoomed && <em className="cv-lb-hint">{t('两指捏开 · 双击放大')}</em>}
      </div>
    </div>,
    document.body
  );
}
