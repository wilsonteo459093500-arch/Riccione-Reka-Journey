// 编辑器用的小 hooks（尺寸、可见性、媒体查询、点外关闭）
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** 最新值的 ref（给稳定回调读最新 props 用） */
export function useLatest(value) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/** 稳定的回调：引用不变，调用时总是用最新的函数 */
export function useStableCallback(fn) {
  const ref = useLatest(fn);
  return useCallback((...args) => ref.current?.(...args), [ref]);
}

/** 元素内容区尺寸（ResizeObserver） */
export function useElementSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    read();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', read);
      return () => window.removeEventListener('resize', read);
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** 进入视口（含预加载边距）后返回 true，之后保持 true —— 缩略图懒渲染 */
export function useInViewOnce(ref, { rootMargin = '600px', root = null } = {}) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { root: root?.current || null, rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, root, rootMargin, seen]);
  return seen;
}

export function useMediaQuery(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : true);
  const [match, setMatch] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const fn = () => setMatch(mq.matches);
    fn();
    mq.addEventListener?.('change', fn);
    return () => mq.removeEventListener?.('change', fn);
  }, [query]);
  return match;
}

/** 从元素顶部到视口底部的高度（桌面三栏布局的兜底：外壳没给定高度时用作 maxHeight） */
export function useFillViewport(ref, enabled, { min = 560, bottom = 0 } = {}) {
  const [height, setHeight] = useState(null);
  useLayoutEffect(() => {
    if (!enabled) {
      setHeight(null);
      return undefined;
    }
    const measure = () => {
      const el = ref.current;
      if (!el || !el.getClientRects().length) return; // 标签页隐藏（display:none）时不量
      const top = el.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(min, Math.round(window.innerHeight - top - bottom)));
    };
    measure();
    window.addEventListener('resize', measure);
    // 外壳上方的内容（提示条等）变高变矮时也重新量
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(document.body);
    if (ref.current) ro?.observe(ref.current); // 从隐藏切回可见时也会触发
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [ref, enabled, min, bottom]);
  return height;
}

/** 点到 ref 外面 / 按 Esc 时调用 onClose */
export function useDismiss(ref, open, onClose) {
  const close = useStableCallback(onClose);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [ref, open, close]);
}

/** 焦点在输入框里时不响应翻页 / 排序快捷键 */
export function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
