// 案例详情的相册（docs/showcase/SPEC.md §2）：照片标签（全部 · 各个房间 · 细节 · 整个家（3D））+ 一张大图 + 说明 + 一排小图。
//   大图：先放 480 的小图，1600 读好（decode）再换上；只读现在这张 ± 1 的 1600（store.keepBig），关掉时全部收回。
//   左右滑 / ← → / 两边的箭头（有鼠标的设备）换照片；点大图（或 ⤢）→ 全屏看图（Lightbox，懒载入）。
//   照片框的大小不跟照片走（CSS 定好），大图换上来不会跳；和框差不多比例的照片铺满，差太多的整张放进来（后面垫一层模糊的小图）。
// 这里也放详情 / 看全部 / 全屏看图共用的几样：
//   useImageStore —— 一张一张读设备上的照片（员工在 iPad 上加的，在 IndexedDB），用完收回 object URL；
//   pushLayer     —— 一层一层的弹出画面，Esc、← → 只给最上面那一层（全屏看图 → 详情 → 看全部）；
//   lockScroll    —— 弹出画面开着的时候后面的页面不滚（几层共用一个，数着用）；
//   useCardCovers —— 卡片的封面 + 两张小图（设备上的照片要先读出来），用完收回；
//   noSave        —— 许愿模式：照片不能拖、不能长按存（再加 CSS 的 -webkit-touch-callout: none）。

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import fx from '../../shared/fx.js';
import { sfx } from '../../shared/sfx.js';
import { t, L } from '../../shared/i18n.js';
import * as C from '../../shared/cases.js';
import { SwatchCover } from './CaseCard.jsx';
import './showcase.css';

const Lightbox = lazy(() => import('./Lightbox.jsx'));

// ───────────────────────── 共用的小工具 ─────────────────────────

/** 许愿模式（展厅 iPad）：照片不给存 —— 不能拖出去、没有长按 / 右键菜单 */
const stopMenu = (e) => e.preventDefault();
export const noSave = { draggable: false, onContextMenu: stopMenu };

/** 员工写的 { zh, en }：现在的语言没写就用另一种（和 caseRoomsMade 的 note 一样） */
export const textOf = (o) => (o && typeof o === 'object' ? L(o) || o.zh || o.en || '' : '');

/** 现在是不是在许愿模式里（外壳把 .is-wish 放在页面最外层；弹出画面挂在 body 上，要自己带着） */
export const inWish = () => typeof document !== 'undefined' && !!document.querySelector('.is-wish');

/** 手指拖出照片框也继续跟着（不支持 / 指针已经没了 → 算了） */
export function capture(el, id) {
  try {
    el?.setPointerCapture?.(id);
  } catch {
    /* ignore */
  }
}

/** 照片在这个案例的某个标签里排第几（封面 / 指定的那张；没有 → 0） */
export function indexIn(list, img) {
  const k = img ? list.indexOf(img) : -1;
  if (k >= 0) return k;
  const cv = list.findIndex((im) => im.cover);
  return cv >= 0 ? cv : 0;
}

// 一层一层的弹出画面：最后打开的在最上面，按键只给它（Esc 先关全屏看图，再关详情，最后关看全部）
const LAYERS = [];
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** Tab / Shift+Tab 只在这一层里转（到头了绕回来；焦点跑到外面了拉回第一个） */
function trapTab(e, box) {
  if (!box) return;
  const els = [...box.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length && !el.closest('[aria-hidden="true"]'));
  if (!els.length) return;
  const first = els[0];
  const last = els[els.length - 1];
  const a = document.activeElement;
  if (!box.contains(a)) {
    e.preventDefault();
    first.focus({ preventScroll: true });
  } else if (e.shiftKey && a === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && a === last) {
    e.preventDefault();
    first.focus();
  }
}
/** 登记一层（handler(e) 收 keydown；root = 这一层的 ref，Tab 不会跑出去）→ 返回「拿掉这一层」 */
export function pushLayer(handler, root = null) {
  const me = { handler };
  LAYERS.push(me);
  const onKey = (e) => {
    if (LAYERS[LAYERS.length - 1] !== me || e.defaultPrevented) return;
    if (e.key === 'Tab') return trapTab(e, root?.current);
    const el = e.target;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    me.handler(e);
  };
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('keydown', onKey);
    const i = LAYERS.indexOf(me);
    if (i >= 0) LAYERS.splice(i, 1);
  };
}

/**
 * 锁住后面的页面不滚（<html> 的 overflow）→ 返回「放开」（叫几次都只算一次）。
 * 看全部、详情、全屏看图共用这一个，数着用：第一个锁的记下原来的值，最后一个放开的才还原。
 * 不能各自记、各自还原：几层一起拿掉（许愿模式没人理了整页重来、下一位客人）的时候，React 先清父亲再清孩子，
 * 孩子最后还原的是父亲设的 'hidden' —— 后面的客人整页都滚不动。
 */
let scrollLocks = 0;
let scrollSaved = '';
export function lockScroll() {
  const html = typeof document !== 'undefined' ? document.documentElement : null;
  if (!html) return () => {};
  if (scrollLocks++ === 0) {
    scrollSaved = html.style.overflow;
    html.style.overflow = 'hidden';
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--scrollLocks === 0) html.style.overflow = scrollSaved;
  };
}

/**
 * 相册的大图：这一下按下去是不是「第二根手指」（两指捏、两指碰到）—— 是就不拖、不换照片，正在拖的那一下也放掉。
 * cur = 正在拖的那一下（{ id, type }）。鼠标永远不算（上一次没收到放开，新的按下照样开始拖）。
 */
export const secondTouch = (cur, e) => e.isPrimary === false || (!!cur && cur.id !== e.pointerId && cur.type === 'touch' && e.pointerType === 'touch');

/**
 * 照片标签那一排要滚到哪里（现在这个标签完整露出来，不压在两边淡出去的那一截里）→ 新的 scrollLeft；已经看得到 → null。
 *   chips = 每个标签在这一排里的 [{ x, w }]，a = 现在这个是第几个，left / view / max = 现在滚到哪、看得到多宽、最多滚到哪，
 *   fade = 两边淡出去多宽（还能往那边滑才有），gap = 标签之间的空。
 * 停的地方对齐到两个标签中间的空：最左边（✕ 旁边）不会只露出半个标签、半个字；对齐的位置里挑最接近「放在中间」的。
 * 对齐的位置都放不下（最后一个标签）→ 滚到最右边。
 */
export function tabScroll(chips, a, left, view, max, fade, gap) {
  const c = chips[a];
  if (!c) return null;
  const fits = (L) => c.x - L >= (L > 1 ? fade : 0) && L + view - (c.x + c.w) >= (L < max - 1 ? fade : 0);
  if (fits(left)) return null;
  const mid = c.x - (view - c.w) / 2;
  let best = null;
  for (let k = 0; k < chips.length; k++) {
    const L = k ? Math.round(chips[k].x - gap) : 0;
    if (L <= max && fits(L) && (best == null || Math.abs(L - mid) < Math.abs(best - mid))) best = L;
  }
  return best ?? Math.round(max);
}

/**
 * 照片网址：随网站的照片直接是路径（浏览器自己缓存）；设备上的照片一张一张从 IndexedDB 读成 object URL。
 * store.url(c, img, size) → 网址（设备上的还没读好 → ''，读好了组件会重画）。
 * store.keepBig(keys)：1600 的大图只留 keys（`${caseId}/${imgId}`）这几张，其余马上收回 —— iPad 上不会一次解出几十张大图。
 * 组件拿掉时全部收回。
 */
export function useImageStore() {
  const [, bump] = useState(0);
  const ref = useRef(null);
  if (!ref.current) ref.current = makeStore(() => bump((x) => x + 1));
  useEffect(() => {
    const s = ref.current;
    s.revive();
    return () => s.dispose();
  }, []);
  return ref.current;
}

function makeStore(changed) {
  const map = new Map(); // `${caseId}/${imgId}/${480|1600}` → { url, release, w }
  let alive = true;
  let queued = 0;
  const ping = () => {
    if (!alive || queued) return;
    queued = requestAnimationFrame(() => {
      queued = 0;
      if (alive) changed();
    });
  };
  return {
    url(c, img, size = 480) {
      if (!c || !img) return '';
      if (!img.device) return C.imageURL(c, img, size);
      const w = size <= 480 ? 480 : 1600;
      const key = `${c.id}/${img.id}/${w}`;
      const hit = map.get(key);
      if (hit) return hit.url;
      if (!alive) return '';
      const entry = { url: '', release: null, w };
      map.set(key, entry);
      C.loadImageURL(c, img, w)
        .then((r) => {
          if (!alive || map.get(key) !== entry) return r.release();
          entry.url = r.url;
          entry.release = r.release;
          if (r.url) ping();
        })
        .catch(() => {});
      return '';
    },
    keepBig(keys) {
      for (const [k, e] of map) {
        if (e.w !== 1600 || keys.has(k.slice(0, k.lastIndexOf('/')))) continue;
        e.release?.();
        map.delete(k);
      }
    },
    // 拿掉又装回来（React 开发模式的 StrictMode 会这样走一遍）：之前读到一半的都丢了，重画一次再读
    revive() {
      if (alive) return;
      alive = true;
      ping();
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(queued);
      queued = 0;
      for (const e of map.values()) e.release?.();
      map.clear();
    },
  };
}

/** 卡片要的那几张（封面 + 前两张别的）：设备上的照片只读这几张 480（40 张照片的案例也只读 3 张） */
const cardCopy = (c, n) => {
  const cv = C.coverOf(c);
  return { ...c, images: cv ? [cv, ...(c.images || []).filter((im) => im !== cv).slice(0, n)] : [] };
};
const hasDevice = (c) => (c?.images || []).some((im) => im.device);

/**
 * 卡片的照片（设备上的照片先读出来）→ { [caseId]: 读好的副本 }（只有封面 + thumbs 张小图；随网站的案例不用读，不在里面）。
 * 副本只给卡片显示；选中、配对永远用原来的案例。组件拿掉时全部收回。
 */
export function useCardCovers(cases, { thumbs = 2 } = {}) {
  const [got, setGot] = useState({});
  const cache = useRef(new Map()).current; // id → 读好的副本 | null（正在读）
  const mounted = useRef(false);
  const list = useRef(cases);
  list.current = cases;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const r of cache.values()) if (r) C.releaseImages(r);
      cache.clear();
    };
  }, [cache]);
  const ids = (cases || [])
    .filter(hasDevice)
    .map((c) => `${c.id}:${c.rev || 0}`)
    .join('|');
  useEffect(() => {
    if (!ids) return;
    for (const c of (list.current || []).filter(hasDevice)) {
      if (cache.has(c.id)) continue;
      cache.set(c.id, null);
      C.resolveImages(cardCopy(c, thumbs), { thumbsOnly: true })
        .then((r) => {
          if (!mounted.current || cache.get(c.id) !== null) return C.releaseImages(r);
          cache.set(c.id, r);
          setGot((g) => ({ ...g, [c.id]: r }));
        })
        .catch(() => cache.delete(c.id));
    }
  }, [ids, cache, thumbs]);
  return got;
}

/** el 在可以左右滚的 box 里离最左边多远（含已经滚过去的；offsetLeft 量的是别的祖先，不能用） */
const leftIn = (box, el) => box.scrollLeft + el.getBoundingClientRect().left - box.getBoundingClientRect().left;
/** 照片标签那一排两边淡出去多宽、标签之间的空（showcase.css .cv-tabs 的 mask 22px、gap 6px） */
const TAB_FADE = 22;
const TAB_GAP = 6;

/** 照片框（w × h）放这张照片：比例差不多（裁掉 ≤ 22%：4:3 的照片放进两栏的框）就铺满，不然整张放进来（竖的照片） */
const FILL_MAX_CROP = 0.22;
function fitOf(img, box) {
  if (!img?.w || !img?.h || !box?.w || !box?.h) return 'cover';
  const a = img.w / img.h;
  const b = box.w / box.h;
  return 1 - Math.min(a, b) / Math.max(a, b) <= FILL_MAX_CROP ? 'cover' : 'contain';
}

/** 一张大图：先放 480，1600 读好（decode 完）再换上；同一个 <img>、同一个框，换图不跳 */
export function useBig(small, big) {
  const [ready, setReady] = useState('');
  useEffect(() => {
    if (!big || big === small) return undefined;
    let alive = true;
    const im = new Image();
    im.decoding = 'async';
    const ok = () => alive && setReady(big);
    im.onload = () => (im.decode ? im.decode().then(ok, ok) : ok());
    im.src = big;
    return () => {
      alive = false;
      im.onload = null;
    };
  }, [big, small]);
  return ready && ready === big ? big : small || big;
}

function Slide({ c, img, k, store, near, box, title }) {
  const small = store.url(c, img, 480);
  const big = near ? store.url(c, img, 1600) : '';
  const src = useBig(small, big);
  const fit = fitOf(img, box);
  return (
    <figure className={`cv-slide is-${fit}`} style={{ left: `calc(${k} * (100% + var(--cv-gap)))` }} aria-hidden={k !== 0}>
      {fit === 'contain' && small && <span className="cv-slide-bg" style={{ backgroundImage: `url("${small}")` }} aria-hidden="true" />}
      {src ? <img src={src} className={src === big ? 'is-big' : ''} alt={textOf(img.alt) || title} decoding="async" {...noSave} /> : <span className="cv-slide-wait" />}
    </figure>
  );
}

// ───────────────────────── 相册 ─────────────────────────

/**
 * props：c（案例）· tabs（C.galleryTabs）· tab · onTab(id) · list（C.galleryImages(c, tab)）· index · onIndex(k) · store（useImageStore）·
 *        lead（放在标签那一排最前面：✕、返回）· title
 */
export default function CaseGallery({ c, tabs, tab, onTab, list, index, onIndex, store, lead = null, title = '' }) {
  const n = list.length;
  const i = Math.min(Math.max(0, index), Math.max(0, n - 1));
  const img = list[i] || null;
  const [box, setBox] = useState(null);
  const [zoom, setZoom] = useState(false);
  const stageRef = useRef(null);
  const trackRef = useRef(null);
  const stripRef = useRef(null);
  const tabsRef = useRef(null);
  const drag = useRef(null);
  const moving = useRef(false);
  const reduced = fx.motion.reduced;
  // 小图那一排滚到附近（左右多看 240 px）才读：设备上的照片才会从 IndexedDB 读出来，40 张的案例不会一打开就读 40 张。
  // 读过的就留着（来回滑不会再闪）；没有 IntersectionObserver → seen = null（全部读）
  const [seen, setSeen] = useState(() => (typeof IntersectionObserver === 'undefined' ? null : new Set()));

  // 照片框的大小（铺满还是整张放进来，看框的比例）
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const read = () => setBox((b) => (b && b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }));
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // 1600 只留现在这张 ± 1（全屏看图开着的时候它自己管）
  useEffect(() => {
    if (zoom) return;
    const keep = new Set();
    for (const k of [i - 1, i, i + 1]) if (list[k]) keep.add(`${c.id}/${list[k].id}`);
    store.keepBig(keep);
  }, [c, list, i, store, zoom]);

  // 换了照片：小图那一排把这一张滚到中间；换了标签：标签那一排把它滚出来
  useEffect(() => {
    const s = stripRef.current;
    const el = s?.querySelector(`[data-k="${i}"]`);
    if (!el) return;
    const left = leftIn(s, el) - (s.clientWidth - el.offsetWidth) / 2;
    s.scrollTo?.({ left: Math.max(0, left), behavior: reduced ? 'auto' : 'smooth' });
  }, [i, list, reduced]);
  // 标签那一排两边：还能往那边滑才淡出去（.is-l / .is-r）—— 切到一半的标签看起来是故意的，不像没对齐。
  // 最右边也停在两个标签中间：滚到头时最左边（✕ 旁边）会被切开的那个标签，在最后一个标签后面补上它露出来的那么多空
  const [tabEdge, setTabEdge] = useState('');
  const hasTabs = tabs.length > 1;
  useEffect(() => {
    const s = tabsRef.current;
    if (!s) return undefined;
    const read = () => {
      const l = s.scrollLeft > 1;
      const r = s.scrollLeft + s.clientWidth < s.scrollWidth - 1;
      const v = `${l ? 'is-l' : ''} ${r ? 'is-r' : ''}`.trim();
      setTabEdge((x) => (x === v ? x : v));
    };
    const fixEnd = () => {
      const last = s.lastElementChild;
      if (!last) return;
      last.style.marginRight = '';
      const max = s.scrollWidth - s.clientWidth;
      if (max <= 1) return;
      const cut = [...s.children].map((b) => ({ x0: leftIn(s, b), x1: leftIn(s, b) + b.offsetWidth })).find((e) => e.x0 < max && e.x1 > max + 0.5);
      if (cut) last.style.marginRight = `${parseFloat(getComputedStyle(last).marginRight) + cut.x1 - max}px`;
    };
    const update = () => {
      fixEnd();
      read();
    };
    update();
    s.addEventListener('scroll', read, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    ro?.observe(s);
    return () => {
      s.removeEventListener('scroll', read);
      ro?.disconnect();
    };
  }, [hasTabs, n > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const s = tabsRef.current;
    const el = s?.querySelector('.on');
    if (!el) return;
    const all = [...s.querySelectorAll('.cv-tab')];
    const chips = all.map((b) => ({ x: leftIn(s, b), w: b.offsetWidth }));
    const left = tabScroll(chips, all.indexOf(el), s.scrollLeft, s.clientWidth, s.scrollWidth - s.clientWidth, TAB_FADE, TAB_GAP);
    if (left != null) s.scrollTo?.({ left, behavior: reduced ? 'auto' : 'smooth' });
  }, [tab, reduced]);

  useEffect(() => {
    const s = stripRef.current;
    if (!s || !seen) return undefined;
    const io = new IntersectionObserver(
      (ents) => {
        const add = ents.filter((e) => e.isIntersecting).map((e) => e.target.dataset.id);
        if (add.length) setSeen((cur) => (add.every((id) => cur.has(id)) ? cur : new Set([...cur, ...add])));
      },
      { root: s, rootMargin: '0px 240px' }
    );
    for (const el of s.querySelectorAll('.cv-thumb')) io.observe(el);
    return () => io.disconnect();
  }, [list, !!seen]); // eslint-disable-line react-hooks/exhaustive-deps

  // 滑完一张：换了 index 的那一下把轨道放回 0（同一帧，没有闪）
  useLayoutEffect(() => {
    const tr = trackRef.current;
    if (!tr) return;
    tr.style.transition = 'none';
    tr.style.transform = '';
    moving.current = false;
  }, [i, list]);

  const go = useCallback(
    (d) => {
      const tr = trackRef.current;
      const to = i + d;
      if (!tr || moving.current || to < 0 || to >= n) return false;
      if (reduced) {
        onIndex(to);
        return true;
      }
      moving.current = true;
      const w = stageRef.current?.clientWidth || 0;
      tr.style.transition = 'transform 0.3s var(--ease)';
      tr.style.transform = `translate3d(${-d * (w + 12)}px, 0, 0)`;
      setTimeout(() => onIndex(to), 300);
      return true;
    },
    [i, n, onIndex, reduced]
  );
  const snapBack = () => {
    const tr = trackRef.current;
    if (!tr) return;
    tr.style.transition = reduced ? 'none' : 'transform 0.26s var(--ease)';
    tr.style.transform = '';
  };
  // 两边的箭头 / 键盘：到头了绕回去（和以前一样）
  const stepWrap = (d) => {
    if (n < 2) return;
    if (!go(d)) onIndex((i + d + n) % n);
  };

  const onDown = (e) => {
    if (e.button > 0 || moving.current || !n) return;
    // 第二根手指（在大图上两指捏、两指碰到）：不拖、不换照片；第一根正在拖的那一下也放掉，照片弹回原位
    if (secondTouch(drag.current, e)) {
      if (drag.current) {
        drag.current = null;
        snapBack();
      }
      return;
    }
    drag.current = { id: e.pointerId, type: e.pointerType, x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, axis: null };
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.axis && Math.hypot(dx, dy) > 8) {
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (d.axis === 'x') capture(stageRef.current, e.pointerId);
    }
    if (d.axis !== 'x' || n < 2) return;
    // 第一张往右、最后一张往左：拉得动一点点（橡皮筋），放手弹回来
    const edge = (i === 0 && dx > 0) || (i === n - 1 && dx < 0);
    d.dx = edge ? dx / 3 : dx;
    const tr = trackRef.current;
    if (tr) {
      tr.style.transition = 'none';
      tr.style.transform = `translate3d(${d.dx}px, 0, 0)`;
    }
  };
  const onUp = (e) => {
    const d = drag.current;
    // 只有开始拖的那根手指放开才结束（别的手指放开不算）
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const dt = Math.max(1, performance.now() - d.t);
    if (!d.axis) {
      if (dt < 600 && img) openZoom();
      return;
    }
    if (d.axis !== 'x') return;
    const w = stageRef.current?.clientWidth || 1;
    const fast = Math.abs(d.dx) / dt > 0.45 && Math.abs(d.dx) > 24;
    const dir = Math.abs(d.dx) > w * 0.18 || fast ? (d.dx < 0 ? 1 : -1) : 0;
    if (!dir || !go(dir)) snapBack();
  };
  const onCancel = (e) => {
    if (drag.current && drag.current.id !== e.pointerId) return;
    drag.current = null;
    snapBack();
  };

  // 照片框本身不出「轻触」的声音（滑动也是按下去）：真的打开全屏才响
  const openZoom = (quiet = false) => {
    if (!img) return;
    if (!quiet) sfx.play('open');
    setZoom(true);
  };

  if (!n) {
    return (
      <div className="cv-gal is-empty">
        <div className="cv-bar">{lead}</div>
        <div className="cv-stage">
          <SwatchCover c={c} />
        </div>
      </div>
    );
  }

  const room = C.roomLabel(img?.room);
  const cap = textOf(img?.caption);
  const slides = [-1, 0, 1].map((k) => ({ k, im: list[i + k] })).filter((x) => x.im);
  return (
    <div className="cv-gal">
      <div className="cv-bar">
        {lead}
        {tabs.length > 1 && (
          <div className={`cv-tabs ${tabEdge}`} ref={tabsRef} role="group" aria-label={t('照片分类')} data-sfx="radio">
            {tabs.map((tb) => (
              <button key={tb.id} type="button" className={`cv-tab ${tb.id === tab ? 'on' : ''}`} aria-pressed={tb.id === tab} onClick={() => onTab(tb.id)}>
                {tb.label}
                <small>{tb.n}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      <div
        className="cv-stage"
        ref={stageRef}
        role="button"
        tabIndex={0}
        aria-label={t('第 {0} 张，共 {1} 张 · 点一下全屏看', [i + 1, n])}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openZoom())}
        onContextMenu={stopMenu}
        data-sfx="none"
      >
        <div className="cv-track" ref={trackRef}>
          {slides.map(({ k, im }) => (
            <Slide key={im.id} c={c} img={im} k={k} store={store} near box={box} title={title} />
          ))}
        </div>
        {img?.detail && <span className="cv-badge">{t('细节')}</span>}
        {n > 1 && (
          <span className="cv-count" aria-hidden="true">
            {i + 1} / {n}
          </span>
        )}
        {n > 1 && (
          <>
            <button type="button" className="cv-arrow is-prev" aria-label={t('上一张')} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => (e.stopPropagation(), stepWrap(-1))} data-sfx="tap">
              <ChevronLeft size={22} strokeWidth={2} aria-hidden="true" />
            </button>
            <button type="button" className="cv-arrow is-next" aria-label={t('下一张')} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => (e.stopPropagation(), stepWrap(1))} data-sfx="tap">
              <ChevronRight size={22} strokeWidth={2} aria-hidden="true" />
            </button>
          </>
        )}
        <button type="button" className="cv-zoom" aria-label={t('全屏看')} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => (e.stopPropagation(), openZoom(true))} data-sfx="open">
          <Maximize2 size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <p className="cv-cap">
        {room && <b>{room}</b>}
        {cap && <span>{cap}</span>}
      </p>
      {n > 1 && (
        <div className="cv-strip" ref={stripRef} role="group" aria-label={t('这一组的照片')}>
          {list.map((im, k) => (
            <Thumb key={im.id} c={c} img={im} k={k} on={k === i} show={!seen || seen.has(im.id) || Math.abs(k - i) <= 2} store={store} onPick={() => onIndex(k)} />
          ))}
        </div>
      )}
      {zoom && (
        <Suspense fallback={null}>
          <Lightbox
            c={c}
            list={list}
            index={i}
            store={store}
            title={title}
            onIndex={onIndex}
            onClose={() => {
              setZoom(false);
              stageRef.current?.focus({ preventScroll: true });
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

function Thumb({ c, img, k, on, show, store, onPick }) {
  const url = show ? store.url(c, img, 480) : '';
  const label = [C.roomLabel(img.room), img.detail ? t('细节') : '', t('第 {0} 张', [k + 1])].filter(Boolean).join(' · ');
  return (
    <button type="button" className={`cv-thumb ${on ? 'on' : ''}`} data-k={k} data-id={img.id} aria-pressed={on} aria-label={label} onClick={onPick} data-sfx="radio">
      {url ? <img src={url} alt="" loading="lazy" decoding="async" {...noSave} /> : <span />}
      {img.detail && <i aria-hidden="true" />}
    </button>
  );
}

/** 一张小图（相似的家、每个房间的封面）：设备上的照片读好再显示；没有照片 → 这个家的色卡 */
export function CaseThumb({ c, img, store, className = '' }) {
  const url = img ? store.url(c, img, 480) : '';
  const fallback = useMemo(() => (img ? null : <SwatchCover c={c} px={56} />), [img, c]);
  return <span className={`cv-pic ${className}`}>{url ? <img src={url} alt="" loading="lazy" decoding="async" {...noSave} /> : fallback}</span>;
}
