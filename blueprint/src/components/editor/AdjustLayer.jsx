import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Move, RotateCcw, Scan, Hand } from 'lucide-react';
import { SLIDE_W, SLIDE_H } from '../../theme.js';
import { groupsOf, autoView, clampView, wholeZoom, clampBox, clampBlock, cleanPhotoAdjust, photoBox, ADJUST_LIMITS } from '../../engine/adjust.js';

// 「调整版面」时盖在画布上的一层：点照片 / 文字块选中，拖动、拉手柄；照片可以在框里挪取景、缩放、整张显示。
// 拖动过程只发草稿（onDraft，舞台据此实时预览）；松手才提交（onCommit）= 一步撤销。
//
// props: { page（自动排版的这一页：{ els, pageIndex }）, adjust（slide.adjust）, scale（屏幕像素 / 画布像素）,
//          areaEl?（画布周围的空白区域：点它取消选中）, onDraft({ key, value } | null), onCommit(key, value | null, soft?), onExit() }
//   soft = 滑块 / 滚轮 / 方向键这种连续的小改动：调用方把它们合成一步撤销

const INSET = 25400 / 9525; // 文本框的内边距（SlideCanvas / PPT 一样）：字的左边缘在框左边缘往里这么多
const MARGIN_L = 112; // 页面左右边界
const MARGIN_R = 1810;
const GUIDES_Y = [92, SLIDE_H / 2, 900]; // 页面上边界、中线、内容下沿
const SNAP = 6; // 屏幕像素

const CORNERS = ['nw', 'ne', 'se', 'sw'];
const EDGES = ['n', 'e', 's', 'w'];
const HANDLE_POS = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] };
const HANDLE_CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

// 正在打字的地方不抢键盘；滑块不算（方向键仍然是微调，Esc 仍然退出）
const isTyping = (el) => !!el && ((/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.type !== 'range') || el.isContentEditable);
const clampN = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const IDENTITY = { dx: 0, dy: 0, k: 1 };

/** 这一组现在的框（画布像素）：照片 = 手动的框；块 = 自动的外包框套上位移和缩放 */
function currentBox(group, adj) {
  if (group.type === 'photo') return photoBox(group.box, adj);
  const b = clampBlock(group.box, adj) || IDENTITY;
  return { x: group.box.x + b.dx, y: group.box.y + b.dy, w: group.box.w * b.k, h: group.box.h * b.k };
}

/**
 * 移动时吸附。auto = 自动排版的位置（左 / 上边缘）：离它近就先回到它；否则看参考线。
 * @param {Array<[number, number, number?]>} cands  [参考线, 用框的哪一处去对（相对 start 的偏移）, 画出来的参考线位置?]
 * @returns {{ d:number, guide:number|null }}
 */
function snapAxis(start, cands, tol, auto) {
  if (!(tol > 0)) return { d: 0, guide: null };
  if (Math.abs(auto - start) <= tol) return { d: auto - start, guide: null };
  let best = null;
  for (const [line, off, show] of cands) {
    const d = line - (start + off);
    if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, guide: show ?? line };
  }
  return best || { d: 0, guide: null };
}

/** 参考线候选：文字块 = 字的边缘对页边（扣掉文本框的内边距）；照片 = 框的边缘对页边 / 版心 */
function snapCands(type, size, axis) {
  if (axis === 'y') return [...(type === 'photo' ? [0, SLIDE_H] : []), ...GUIDES_Y].flatMap((l) => [0, size / 2, size].map((off) => [l, off]));
  if (type === 'photo') return [0, SLIDE_W, MARGIN_L, SLIDE_W / 2, MARGIN_R].flatMap((l) => [0, size / 2, size].map((off) => [l, off]));
  return [
    [MARGIN_L - INSET, 0, MARGIN_L],
    [SLIDE_W / 2, size / 2],
    [MARGIN_R + INSET, size, MARGIN_R],
  ];
}

function resizeBox(box, handle, dx, dy) {
  const m = ADJUST_LIMITS.minBox;
  let { x, y, w, h } = box;
  if (handle.includes('w')) {
    const nx = Math.min(x + dx, x + w - m);
    w += x - nx;
    x = nx;
  }
  if (handle.includes('e')) w = Math.max(m, w + dx);
  if (handle.includes('n')) {
    const ny = Math.min(y + dy, y + h - m);
    h += y - ny;
    y = ny;
  }
  if (handle.includes('s')) h = Math.max(m, h + dy);
  return { x, y, w, h };
}

/** 照片现在的取景：手动定的（而且是给这张图定的），否则自动排版的；'whole' = 整张显示；null = 不知道原图大小 */
function currentView(el, adj) {
  const stale = adj?.src && adj.src !== el.src;
  return (!stale && adj?.view ? adj.view : autoView(el)) || null;
}

/** 取景的数字形式（'whole' 换成对应的倍数、居中） */
function viewNumbers(nat, box, view) {
  if (!nat) return null;
  if (view === 'whole' || !view) return { z: wholeZoom(nat, box), cx: 0.5, cy: 0.5 };
  return view;
}

/** 看得见的范围占原图多少（宽、高） */
function viewWindow(nat, box, z) {
  const A = box.w / box.h;
  const S = nat.w / nat.h;
  return { fw: (S > A ? A / S : 1) / z, fh: (S > A ? 1 : S / A) / z };
}

/** 照片的新调整值：在原来的基础上改框 / 取景；框记下是相对哪个自动位置定的，取景记下是给哪张图定的 */
function photoValueOf(adj, el, patch) {
  const base = { ...(adj || {}) };
  if (base.src && base.src !== el.src) delete base.view; // 给旧图定的取景不带过来
  const next = { ...base, ...patch };
  if (patch.box) next.base = { x: el.x, y: el.y, w: el.w, h: el.h };
  if (next.view) next.src = el.src;
  else {
    delete next.view;
    delete next.src;
  }
  return next;
}

export default function AdjustLayer({ page, adjust, scale, areaEl, onDraft, onCommit, onExit }) {
  const groups = useMemo(() => groupsOf(page, page?.pageIndex || 0), [page]);
  const [sel, setSel] = useState(null); // 选中的组名
  const [photoMode, setPhotoMode] = useState('pan'); // 'pan' 取景 | 'frame' 移动框
  const [draft, setDraft] = useState(null); // { key, value }
  const [guides, setGuides] = useState({ x: null, y: null });
  const [barSize, setBarSize] = useState({ w: 0, h: 0 });
  const rootRef = useRef(null);
  const barRef = useRef(null);
  const drag = useRef(null);

  const adjOf = (key) => (draft && draft.key === key ? draft.value : adjust?.[key]) || null;
  const group = groups.find((g) => g.key === sel) || null;
  const selAdj = group ? adjOf(group.key) : null;
  const selBox = group ? currentBox(group, selAdj) : null;
  const photoEl = group?.type === 'photo' ? page.els[group.indexes[0]] : null;
  const nat = photoEl?.nat?.w && photoEl?.nat?.h ? photoEl.nat : null;
  const viewNow = photoEl ? currentView(photoEl, selAdj) : null;
  const zoomMin = nat && selBox ? wholeZoom(nat, selBox) : 1;
  const zoomNow = !nat || !selBox ? 1 : viewNow === 'whole' ? zoomMin : viewNow?.z || 1;
  const isWhole = viewNow === 'whole' || (!!nat && zoomMin < 1 && zoomNow <= zoomMin + 1e-4);
  // 不知道原图多大：取景算不了，只能挪框
  const mode = nat ? photoMode : 'frame';

  // 换页 / 组没了：取消选中
  useEffect(() => {
    if (sel && !groups.some((g) => g.key === sel)) setSel(null);
  }, [groups, sel]);

  const pushDraft = (key, value) => {
    const d = { key, value };
    setDraft(d);
    onDraft?.(d);
  };
  const endDraft = () => {
    setDraft(null);
    setGuides({ x: null, y: null });
    onDraft?.(null);
  };
  /** 提交：先整理（等于没调 = 清掉这一组）；本来就没调过、现在也等于没调 → 什么都不做（不多出一步撤销） */
  const commit = (g, value, soft = false) => {
    const clean = !value ? null : g.type === 'block' ? clampBlock(g.box, value) : cleanPhotoAdjust(value, page.els[g.indexes[0]]);
    endDraft();
    if (!clean && !adjust?.[g.key]) return;
    onCommit?.(g.key, clean, soft);
  };

  const toPage = (e) => {
    const r = rootRef.current.getBoundingClientRect();
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale];
  };
  const inBox = (b, [x, y]) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

  const viewObj = (box) => viewNumbers(nat, box, viewNow);
  const photoValue = (patch) => photoValueOf(selAdj, photoEl, patch);

  // ---------------- 指针 ----------------
  function startDrag(e, g, handle) {
    if (e.button || drag.current) return; // 右键不管；已经在拖（第二根手指）不抢
    e.preventDefault();
    e.stopPropagation();
    // 焦点还留在右侧输入框 / 缩放滑块上：方向键、Esc 会被它们吃掉
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur?.();
    rootRef.current.setPointerCapture?.(e.pointerId);
    const adj = adjOf(g.key);
    const el = page.els[g.indexes[0]];
    const hasNat = g.type === 'photo' && el?.nat?.w && el?.nat?.h;
    // 照片：「取景」档拖的是照片在框里的位置，「移动框」档拖的是框
    const h = handle !== 'body' ? handle : g.type === 'photo' && photoMode === 'pan' && hasNat ? 'pan' : 'move';
    drag.current = {
      pointerId: e.pointerId, key: g.key, g, handle: h, body: handle === 'body', wasSel: sel === g.key,
      p0: toPage(e), box0: currentBox(g, adj), adj0: adj, moved: false, last: null,
    };
    if (sel !== g.key) setSel(g.key);
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      finishDrag(e); // 松手的事件丢了（在窗口外松的）：到此为止
      return;
    }
    const [px, py] = toPage(e);
    const dx = px - d.p0[0];
    const dy = py - d.p0[1];
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3 / scale) return;
    d.moved = true;
    const tol = e.altKey ? 0 : SNAP / scale; // 按住 Alt 不吸附
    const g = d.g;
    let value = null;
    let gx = null;
    let gy = null;

    if (g.type === 'block') {
      const b0 = clampBlock(g.box, d.adj0) || IDENTITY;
      if (d.handle === 'move') {
        const sx = snapAxis(d.box0.x + dx, snapCands('block', d.box0.w, 'x'), tol, g.box.x);
        const sy = snapAxis(d.box0.y + dy, snapCands('block', d.box0.h, 'y'), tol, g.box.y);
        gx = sx.guide;
        gy = sy.guide;
        value = { dx: b0.dx + dx + sx.d, dy: b0.dy + dy + sy.d, k: b0.k };
      } else {
        // 拖角：对角不动，等比缩放（字号跟着变）。倍数 = 手沿着对角线方向走了多远（不看手的绝对位置，抓歪一点也不会跳）
        const sx = d.handle.includes('w') ? -1 : 1;
        const sy = d.handle.includes('n') ? -1 : 1;
        const w0 = d.box0.w;
        const h0 = d.box0.h;
        const along = (dx * sx * w0 + dy * sy * h0) / (w0 * w0 + h0 * h0);
        const k = clampN(b0.k * (1 + along), ADJUST_LIMITS.kMin, ADJUST_LIMITS.kMax);
        const fx = sx < 0 ? d.box0.x + w0 : d.box0.x;
        const fy = sy < 0 ? d.box0.y + h0 : d.box0.y;
        value = { dx: (sx < 0 ? fx - g.box.w * k : fx) - g.box.x, dy: (sy < 0 ? fy - g.box.h * k : fy) - g.box.y, k };
      }
      value = clampBlock(g.box, value) || IDENTITY;
    } else {
      const el = page.els[g.indexes[0]];
      const n = el.nat?.w && el.nat?.h ? el.nat : null;
      const mk = (patch) => photoValueOf(d.adj0, el, patch);
      if (d.handle === 'pan') {
        // 取景：拖照片 = 挪看得见的范围（照片跟着手走）
        const v0 = d.view0 || (d.view0 = viewNumbers(n, d.box0, currentView(el, d.adj0)));
        if (!n || !v0) return;
        const win = viewWindow(n, d.box0, v0.z);
        value = mk({ view: clampView(n, d.box0, { z: v0.z, cx: v0.cx - (dx * win.fw) / d.box0.w, cy: v0.cy - (dy * win.fh) / d.box0.h }) });
      } else if (d.handle === 'move') {
        const sx = snapAxis(d.box0.x + dx, snapCands('photo', d.box0.w, 'x'), tol, g.box.x);
        const sy = snapAxis(d.box0.y + dy, snapCands('photo', d.box0.h, 'y'), tol, g.box.y);
        gx = sx.guide;
        gy = sy.guide;
        value = mk({ box: clampBox({ ...d.box0, x: d.box0.x + dx + sx.d, y: d.box0.y + dy + sy.d }) });
      } else {
        value = mk({ box: clampBox(resizeBox(d.box0, d.handle, dx, dy)) });
      }
    }
    d.last = value;
    setGuides({ x: gx, y: gy });
    pushDraft(d.key, value);
  }

  /** 拖动结束：cancel = 不要这次的改动（系统打断、Esc） */
  function finishDrag(e, cancel = false) {
    const d = drag.current;
    if (!d || (e && e.pointerId !== undefined && e.pointerId !== d.pointerId)) return;
    drag.current = null;
    try {
      rootRef.current?.releasePointerCapture?.(d.pointerId);
    } catch {
      /* 已经放掉了 */
    }
    if (cancel) {
      endDraft();
      return;
    }
    if (d.moved && d.last) {
      commit(d.g, d.last);
      return;
    }
    endDraft();
    // 点了一下已经选中的那块（没拖）：换成它下面的那一块 —— 满版照片选中后，压在上面的字照样点得到
    if (d.body && d.wasSel) {
      const under = groups
        .map((g) => ({ g, b: currentBox(g, adjOf(g.key)) }))
        .filter((x) => inBox(x.b, d.p0))
        .sort((p, q) => p.b.w * p.b.h - q.b.w * q.b.h);
      const i = under.findIndex((x) => x.g.key === d.key);
      const next = under[(i + 1) % under.length];
      if (next && next.g.key !== d.key) setSel(next.g.key);
    }
  }

  // 点画布外面的空白：取消选中
  useEffect(() => {
    if (!areaEl) return undefined;
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setSel(null);
    };
    areaEl.addEventListener('pointerdown', onDown);
    return () => areaEl.removeEventListener('pointerdown', onDown);
  }, [areaEl]);

  // 滚轮：指针在选中的照片上时缩放取景（别处照常滚动页面）
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!group || group.type !== 'photo' || !nat || !selBox || !inBox(selBox, toPage(e))) return;
      e.preventDefault();
      const v = viewObj(selBox);
      const view = clampView(nat, selBox, { ...v, z: v.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08) });
      commit(group, photoValue({ view }), true);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // 键盘：方向键微调（在翻页的快捷键之前截住）；Esc 取消拖动 / 取消选中 / 退出。打字、开着弹窗或菜单时不管
  useEffect(() => {
    const onKey = (e) => {
      if (isTyping(e.target) || document.querySelector('[role="dialog"],[role="menu"]')) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (drag.current) finishDrag(null, true);
        else if (sel) setSel(null);
        else onExit?.();
        return;
      }
      if (!group || !/^Arrow/.test(e.key) || e.altKey || e.metaKey || e.ctrlKey || drag.current) return;
      e.preventDefault();
      e.stopPropagation();
      const step = e.shiftKey ? 10 : 1;
      const ddx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const ddy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      if (group.type === 'block') {
        const b = clampBlock(group.box, selAdj) || IDENTITY;
        commit(group, { dx: b.dx + ddx, dy: b.dy + ddy, k: b.k }, true);
      } else if (mode === 'pan') {
        // 取景档：方向键挪的是照片在框里的位置（和拖动一个方向）
        const v = viewObj(selBox);
        const win = viewWindow(nat, selBox, v.z);
        commit(group, photoValue({ view: clampView(nat, selBox, { z: v.z, cx: v.cx - (ddx * win.fw) / selBox.w, cy: v.cy - (ddy * win.fh) / selBox.h }) }), true);
      } else {
        commit(group, photoValue({ box: clampBox({ ...selBox, x: selBox.x + ddx, y: selBox.y + ddy }) }), true);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  });

  // 小工具栏的实际大小：靠右、靠下时不跑出画布
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w !== barSize.w || h !== barSize.h) setBarSize({ w, h });
  });

  const px = (n) => n * scale;
  const adjusted = !!(group && adjust?.[group.key]);
  const handles = group ? (group.type === 'photo' ? (mode === 'frame' ? [...CORNERS, ...EDGES] : []) : CORNERS) : [];
  const slideW = px(SLIDE_W);
  const slideH = px(SLIDE_H);
  const barH = barSize.h || 34;
  const barAbove = selBox ? px(selBox.y) > barH + 10 : true;
  const btn = (active) =>
    `inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] whitespace-nowrap ${active ? 'bg-bp-dark text-bp-light' : 'text-bp-ink hover:bg-bp-tint'}`;
  const ordered = groups
    .map((g) => ({ g, b: currentBox(g, adjOf(g.key)) }))
    .sort((p, q) => (p.g.key === sel) - (q.g.key === sel) || q.b.w * q.b.h - p.b.w * p.b.h);

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        if (e.target === rootRef.current || e.target.dataset?.adjustBg) setSel(null);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finishDrag(e)}
      onPointerCancel={(e) => finishDrag(e, true)}
      onLostPointerCapture={(e) => finishDrag(e)}
      onClick={(e) => e.stopPropagation()}
      data-testid="adjust-layer"
    >
      {/* 每一组一个可以点的范围：大块在下、小块在上（文字压在照片上也点得到），选中的那块在最上面。
          超出画布的部分裁掉，免得盖住旁边的面板 */}
      <div className="absolute inset-0 overflow-hidden" data-adjust-bg="1">
        {ordered.map(({ g, b }, n) => {
          const on = g.key === sel;
          const changed = !!adjust?.[g.key];
          return (
            <div
              key={g.key}
              data-adjust-key={g.key}
              data-adjust-type={g.type}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={`${g.type === 'photo' ? '照片' : '文字块'} ${n + 1}${changed ? '（已手动调整）' : ''}`}
              onPointerDown={(e) => startDrag(e, g, 'body')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSel(g.key);
                }
              }}
              className={`absolute outline-none ${on ? '' : 'hover:outline hover:outline-1 hover:outline-sky-400/70 focus-visible:outline focus-visible:outline-1 focus-visible:outline-sky-500'}`}
              style={{
                left: px(b.x),
                top: px(b.y),
                width: Math.max(8, px(b.w)),
                height: Math.max(8, px(b.h)),
                cursor: on ? (g.type === 'photo' && mode === 'pan' ? 'grab' : 'move') : 'pointer',
                outline: on ? '1.5px solid #0ea5e9' : changed ? '1px dashed rgba(14,165,233,0.55)' : undefined,
                outlineOffset: on ? -1.5 : changed ? -1 : 0,
              }}
            />
          );
        })}
      </div>

      {/* 参考线 */}
      {guides.x !== null && <div className="absolute top-0 bottom-0 w-px bg-rose-500/80 pointer-events-none" style={{ left: px(guides.x) }} />}
      {guides.y !== null && <div className="absolute left-0 right-0 h-px bg-rose-500/80 pointer-events-none" style={{ top: px(guides.y) }} />}

      {/* 手柄 */}
      {selBox &&
        handles.map((h) => (
          <div
            key={h}
            data-handle={h}
            onPointerDown={(e) => startDrag(e, group, h)}
            className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-white border border-sky-600 shadow-sm"
            style={{ left: px(selBox.x + selBox.w * HANDLE_POS[h][0]), top: px(selBox.y + selBox.h * HANDLE_POS[h][1]), cursor: HANDLE_CURSOR[h] }}
          />
        ))}

      {/* 选中的东西的小工具栏：画布窄就折行，不跑出画布 */}
      {group && selBox && (
        <div
          ref={barRef}
          className="absolute z-10 flex flex-wrap items-center gap-0.5 rounded-lg bg-white/95 shadow-lg ring-1 ring-black/10 px-1 py-1"
          style={{
            maxWidth: Math.max(160, slideW - 8),
            left: clampN(px(selBox.x), 4, Math.max(4, slideW - (barSize.w || 0) - 4)),
            top: barAbove ? Math.min(px(selBox.y), slideH) - barH - 6 : clampN(px(selBox.y + selBox.h) + 8, 4, Math.max(4, slideH - barH - 4)),
          }}
          onPointerDown={(e) => e.stopPropagation()}
          data-testid="adjust-bar"
        >
          {group.type === 'photo' ? (
            <>
              <button type="button" className={btn(mode === 'pan')} aria-pressed={mode === 'pan'} disabled={!nat} onClick={() => setPhotoMode('pan')} title="在框里拖照片，改看得见的部分；滚轮缩放">
                <Hand size={12} /> 取景
              </button>
              <button type="button" className={btn(mode === 'frame')} aria-pressed={mode === 'frame'} onClick={() => setPhotoMode('frame')} title="拖动照片框换位置，拉手柄改大小">
                <Move size={12} /> 移动框
              </button>
              <span className="w-px h-4 bg-bp-line mx-0.5" />
              <input
                type="range"
                min={zoomMin}
                max={Math.max(3, zoomNow)}
                step="any"
                value={zoomNow}
                disabled={!nat}
                onChange={(e) => {
                  const v = viewObj(selBox);
                  if (v) commit(group, photoValue({ view: clampView(nat, selBox, { ...v, z: Number(e.target.value) }) }), true);
                }}
                className="w-24"
                aria-label="照片缩放"
                title="缩放"
              />
              <button type="button" className={btn(isWhole)} aria-pressed={isWhole} onClick={() => commit(group, photoValue({ view: 'whole' }))} title="整张照片都放进框里，不裁">
                <Scan size={12} /> 整张显示
              </button>
              <button type="button" className={btn(false)} disabled={!nat} onClick={() => commit(group, photoValue({ view: { z: 1, cx: 0.5, cy: 0.5 } }))} title="照片刚好铺满框，居中">
                <Maximize size={12} /> 铺满
              </button>
            </>
          ) : (
            <span className="px-1.5 text-[11px] text-bp-muted whitespace-nowrap">拖动换位置 · 拖角改大小</span>
          )}
          {adjusted && (
            <>
              <span className="w-px h-4 bg-bp-line mx-0.5" />
              <button type="button" className={btn(false)} onClick={() => commit(group, null)} title="这一块回到程序排的位置和大小">
                <RotateCcw size={12} /> 恢复自动
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
