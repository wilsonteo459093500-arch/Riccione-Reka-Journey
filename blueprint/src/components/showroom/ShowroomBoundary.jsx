// 展厅播放 · 出错不空白。
//
// 以前程序任何一处出错，大屏直接整屏空白。现在分三层接住：
//   1. Boundary       —— 动效那一层出错（线稿画布、3D 开场、某个元素的动效）：这一页退回静态原图，翻页照常；翻到下一页再试一次动效
//   2. ShowroomGuard  —— 播放器本身出错：换成最简单的翻页器 StaticShow（没有动效、目录、音乐，每页就是导出 PPT 的那一页）
//   3. 连翻页器也出错：一句话 + 「退出」按钮
// 静态原图 = SlideCanvas 原样画这一页（和编辑器预览、导出的 PPT 同一套版面）。

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import SlideCanvas from '../SlideCanvas.jsx';
import { renderDeck, exportableSlides } from '../../engine/deck.js';
import { metaOf, resolveUrl } from '../../store/assets.js';

/**
 * 出错时显示 fallback；resetKey 变了（翻到别的页）就再试一次 children。
 * fallback 可以是元素，也可以是 (error) => 元素
 */
export class Boundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorKey: undefined };
  }

  static getDerivedStateFromError(error) {
    return { error: error || new Error('unknown'), errorKey: undefined };
  }

  static getDerivedStateFromProps(props, state) {
    if (!state.error) return null;
    if (state.errorKey === undefined) return { errorKey: props.resetKey ?? null }; // 出错后的第一次渲染：记下是在哪一页出的错
    if (state.errorKey !== (props.resetKey ?? null)) return { error: null, errorKey: undefined }; // 换页了：再试一次
    return null;
  }

  componentDidCatch(error, info) {
    console.error(`[展厅播放] ${this.props.what || '这一层'}出错，已退回静态画面`, error, info?.componentStack);
    this.props.onError?.(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const fb = this.props.fallback;
    return typeof fb === 'function' ? fb(this.state.error) : fb ?? null;
  }
}

/** 这一页的静态原图；连原样画都出错 → 一行字（不留空白） */
export function StillPage({ page, width, label }) {
  return (
    <Boundary
      resetKey={page}
      what="静态页"
      fallback={
        <div data-showroom-still="failed" style={{ width, height: (width * 9) / 16 }} className="flex items-center justify-center bg-[#F3EEE7] text-[#7B593D] text-lg">
          {label ? `「${label}」` : '这一页'}暂时显示不了 —— 请翻到下一页
        </div>
      }
    >
      <div data-showroom-still="page" style={{ position: 'absolute', inset: 0 }}>
        <SlideCanvas slide={page} width={width} resolveUrl={resolveUrl} />
      </div>
    </Boundary>
  );
}

const ESC_CONFIRM_MS = 3000;

/** 最简单的翻页器：播放器本身出错时顶上。方向键 / 空格 / 点击翻页，Esc 按两次退出 */
function StaticShow({ project, onClose }) {
  const pages = useMemo(() => exportableSlides(renderDeck(project, { meta: metaOf })), [project]);
  const [k, setK] = useState(0);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [escHint, setEscHint] = useState(false);
  const escAt = useRef(-1e9);
  const count = pages.length;
  const go = (d) => setK((v) => Math.min(Math.max(v + d, 0), Math.max(0, count - 1)));
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    let timer = 0;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (e.repeat) return;
        e.preventDefault();
        const now = performance.now();
        if (now - escAt.current < ESC_CONFIRM_MS) return onClose?.();
        escAt.current = now;
        setEscHint(true);
        clearTimeout(timer);
        timer = setTimeout(() => setEscHint(false), ESC_CONFIRM_MS);
        return;
      }
      if (['ArrowDown', 'ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) go(1);
      else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) go(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, onClose]);
  const stageW = Math.min(vp.w, (vp.h * 16) / 9);
  const stageH = (stageW * 9) / 16;
  const page = pages[Math.min(k, count - 1)];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="展厅播放"
      data-testid="showroom"
      data-showroom-mode="static"
      data-pos={k.toFixed(3)}
      className="fixed inset-0 z-[100] bg-black select-none overflow-hidden"
      onClick={(e) => go(e.clientX / window.innerWidth < 0.25 ? -1 : 1)}
      onWheel={(e) => Math.abs(e.deltaY) >= 40 && go(e.deltaY > 0 ? 1 : -1)}
    >
      <div style={{ position: 'absolute', left: (vp.w - stageW) / 2, top: (vp.h - stageH) / 2, width: stageW, height: stageH, overflow: 'hidden' }}>
        {page ? <StillPage page={page} width={stageW} label={page.label} /> : null}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose?.();
        }}
        title="退出展厅播放"
        aria-label="退出展厅播放"
        className="absolute top-5 right-5 inline-flex items-center justify-center w-11 h-11 rounded-full bg-black/35 text-white/85 hover:bg-black/55"
      >
        <X size={16} />
      </button>
      {escHint && <EscHint />}
    </div>
  );
}

export function EscHint() {
  return (
    <div className="absolute left-1/2 bottom-10 -translate-x-1/2 z-30 px-5 py-2.5 rounded-full bg-black/70 text-white/90 text-sm backdrop-blur-sm pointer-events-none" data-testid="showroom-esc-hint">
      再按一次 Esc 退出播放
    </div>
  );
}

function Broken({ onClose }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="展厅播放" data-testid="showroom" data-showroom-mode="broken" className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center gap-4 text-white/80">
      <div>这份方案现在播放不了 —— 请退出后刷新页面再试；还是不行，先用导出的 PPT。</div>
      <button type="button" onClick={onClose} className="inline-flex items-center gap-2 h-11 px-4 rounded-full bg-white/15 text-white hover:bg-white/25">
        <X size={16} /> 退出
      </button>
    </div>
  );
}

/** 包住整个播放器：播放器出错 → 最简单的翻页器；翻页器也出错 → 一句话 + 退出 */
export default function ShowroomGuard({ project, onClose, children }) {
  return (
    <Boundary what="翻页器" fallback={<Broken onClose={onClose} />}>
      <Boundary what="播放器" fallback={<StaticShow project={project} onClose={onClose} />}>
        {children}
      </Boundary>
    </Boundary>
  );
}
