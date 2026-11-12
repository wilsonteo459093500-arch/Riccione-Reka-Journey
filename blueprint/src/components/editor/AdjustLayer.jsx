import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Move, RotateCcw, Scan, Hand } from 'lucide-react';
import { SLIDE_W, SLIDE_H } from '../../theme.js';
import { groupsOf, autoView, clampView, wholeZoom, clampBox, cleanBlockAdjust, ADJUST_LIMITS } from '../../engine/adjust.js';

// 「调整版面」时盖在画布上的一层：点照片 / 文字块选中，拖动、拉手柄；照片可以在框里挪取景、缩放、整张显示。
// 拖动过程只发草稿（onDraft，舞台据此实时预览）；松手才提交（onCommit）= 一步撤销。
//
// props: { page（自动排版的这一页：{ els, pageIndex }）, adjust（slide.adjust）, scale（屏幕像素 / 画布像素）,
//          onDraft({ key, value } | null), onCommit(key, value | null, soft?), onExit() }
//   soft = 滑块 / 滚轮 / 方向键这种连续的小改动：调用方把它们合成一步撤销

const GUIDES_X = [112, SLIDE_W / 2, 1810]; // 页面左右边界、中线
const GUIDES_Y = [92, SLIDE_H / 2, 900]; // 页面上边界、中线、内容下沿
const SNAP = 6; // 屏幕像素

const CORNERS = ['nw', 'ne', 'se', 'sw'];
const EDGES = ['n', 'e', 's', 'w'];
const HANDLE_POS = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] };
const HANDLE_CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

const isTyping = (el) => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

/** 这一组现在的框（画布像素）：照片 = 手动的框；块 = 自动的外包框套上位移和缩放 */
function currentBox(group, adj) {
  if (group.type === 'photo') return clampBox(adj?.box) || group.box;
  const b = cleanBlockAdjust(adj) || { dx: 0, dy: 0, k: 1 };
  return { x: group.box.x + b.dx, y: group.box.y + b.dy, w: group.box.w * b.k, h: group.box.h * b.k };
}

/** 移动时吸附到参考线：左 / 中 / 右（上 / 中 / 下）哪条边离参考线最近就吸哪条。返回 { d, guide } */
function snapAxis(start, size, lines, tol) {
  let best = null;
  for (const line of lines) {
    for (const off of [0, size / 2, size]) {
      const d = line - (start + off);
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, guide: line };
    }
  }
  return best || { d: 0, guide: null };
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

/** 照片的新调整值：在原来的基础上改框 / 取景；取景记下是给哪张图定的 */
function photoValueOf(adj, el, patch) {
  const base = { ...(adj || {}) };
  if (base.src && base.src !== el.src) delete base.view; // 给旧图定的取景不带过来
  const next = { ...base, ...patch };
  if (next.view) next.src = el.src;
  else {
    delete next.view;
    delete next.src;
  }
  return next;
}

export default function AdjustLayer({ page, adjust, scale, onDraft, onCommit, onExit }) {
  const groups = useMemo(() => groupsOf(page, page?.pageIndex || 0), [page]);
  const [sel, setSel] = useState(null); // 选中的组名
  const [photoMode, setPhotoMode] = useState('pan'); // 'pan' 取景 | 'frame' 移动框
  const [draft, setDraft] = useState(null); // { key, value }
  const [guides, setGuides] = useState({ x: null, y: null });
  const rootRef = useRef(null);
  const drag = useRef(null);

  const adjOf = (key) => (draft && draft.key === key ? draft.value : adjust?.[key]) || null;
  const group = groups.find((g) => g.key === sel) || null;
  const selAdj = group ? adjOf(group.key) : null;
  const selBox = group ? currentBox(group, selAdj) : null;
  const photoEl = group?.type === 'photo' ? page.els[group.indexes[0]] : null;
  const nat = photoEl?.nat?.w && photoEl?.nat?.h ? photoEl.nat : null;
  const viewNow = photoEl ? currentView(photoEl, selAdj) : null;
  const zoomNow = !nat || !selBox ? 1 : viewNow === 'whole' ? wholeZoom(nat, selBox) : viewNow?.z || 1;

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
  const commit = (key, value) => {
    endDraft();
    onCommit?.(key, value);
  };

  const toPage = (e) => {
    const r = rootRef.current.getBoundingClientRect();
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale];
  };

  const viewObj = (box) => viewNumbers(nat, box, viewNow);
  const photoValue = (patch) => photoValueOf(selAdj, photoEl, patch);

  // ---------------- 指针 ----------------
  function startDrag(e, g, handle) {
    if (e.button) return;
    e.preventDefault();
    e.stopPropagation();
    rootRef.current.setPointerCapture?.(e.pointerId);
    const adj = adjOf(g.key);
    // 照片：「取景」档拖的是照片在框里的位置，「移动框」档拖的是框
    const h = g.type === 'photo' && handle === 'body' ? (photoMode === 'frame' ? 'move' : 'pan') : handle === 'body' ? 'move' : handle;
    drag.current = { key: g.key, g, handle: h, p0: toPage(e), box0: currentBox(g, adj), adj0: adj, moved: false, last: null };
    if (sel !== g.key) setSel(g.key);
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d) return;
    const [px, py] = toPage(e);
    const dx = px - d.p0[0];
    const dy = py - d.p0[1];
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3 / scale) return;
    d.moved = true;
    const tol = SNAP / scale;
    const g = d.g;
    let value = null;
    let gx = null;
    let gy = null;

    if (g.type === 'block') {
      const b0 = cleanBlockAdjust(d.adj0) || { dx: 0, dy: 0, k: 1 };
      if (d.handle === 'move') {
        // 吸附：参考线 + 原来的自动位置
        const sx = snapAxis(d.box0.x + dx, d.box0.w, [...GUIDES_X, g.box.x], tol);
        const sy = snapAxis(d.box0.y + dy, d.box0.h, [...GUIDES_Y, g.box.y], tol);
        gx = sx.guide;
        gy = sy.guide;
        value = { dx: b0.dx + dx + sx.d, dy: b0.dy + dy + sy.d, k: b0.k };
      } else {
        // 拖角：对角不动，等比缩放（字号跟着变）
        const fx = d.handle.includes('w') ? d.box0.x + d.box0.w : d.box0.x;
        const fy = d.handle.includes('n') ? d.box0.y + d.box0.h : d.box0.y;
        const k = Math.max(ADJUST_LIMITS.kMin, Math.min(ADJUST_LIMITS.kMax, Math.max(Math.abs(px - fx) / g.box.w, Math.abs(py - fy) / g.box.h)));
        const nx = d.handle.includes('w') ? fx - g.box.w * k : fx;
        const ny = d.handle.includes('n') ? fy - g.box.h * k : fy;
        value = { dx: nx - g.box.x, dy: ny - g.box.y, k };
      }
      value = cleanBlockAdjust(value) || { dx: 0, dy: 0, k: 1 };
    } else {
      const el = page.els[g.indexes[0]];
      const n = el.nat?.w && el.nat?.h ? el.nat : null;
      const mk = (patch) => photoValueOf(d.adj0, el, patch);
      if (d.handle === 'pan') {
        // 取景：拖照片 = 挪看得见的范围（照片跟着手走）
        const v0 = d.view0 || (d.view0 = viewNumbers(n, d.box0, currentView(el, d.adj0)));
        if (!n || !v0) return;
        const A = d.box0.w / d.box0.h;
        const S = n.w / n.h;
        const fw = (S > A ? A / S : 1) / v0.z;
        const fh = (S > A ? 1 : S / A) / v0.z;
        value = mk({ view: clampView(n, d.box0, { z: v0.z, cx: v0.cx - (dx * fw) / d.box0.w, cy: v0.cy - (dy * fh) / d.box0.h }) });
      } else if (d.handle === 'move') {
        const sx = snapAxis(d.box0.x + dx, d.box0.w, [0, SLIDE_W, ...GUIDES_X, g.box.x], tol);
        const sy = snapAxis(d.box0.y + dy, d.box0.h, [0, SLIDE_H, ...GUIDES_Y, g.box.y], tol);
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

  function onPointerUp(e) {
    const d = drag.current;
    drag.current = null;
    rootRef.current?.releasePointerCapture?.(e.pointerId);
    if (!d) return;
    if (d.moved && d.last) commit(d.key, d.last);
    else endDraft();
  }

  // 滚轮：选中照片时缩放取景
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!group || group.type !== 'photo' || !nat || !selBox) return;
      e.preventDefault();
      const v = viewObj(selBox);
      const view = clampView(nat, selBox, { ...v, z: v.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08) });
      onCommit?.(group.key, photoValue({ view }), true);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // 键盘：方向键微调（在翻页的快捷键之前截住）；Esc 取消选中 / 退出
  useEffect(() => {
    const onKey = (e) => {
      if (isTyping(e.target)) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (sel) setSel(null);
        else onExit?.();
        return;
      }
      if (!group || !/^Arrow/.test(e.key) || e.altKey || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      const step = e.shiftKey ? 10 : 1;
      const ddx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const ddy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      if (group.type === 'block') {
        const b = cleanBlockAdjust(selAdj) || { dx: 0, dy: 0, k: 1 };
        onCommit?.(group.key, cleanBlockAdjust({ dx: b.dx + ddx, dy: b.dy + ddy, k: b.k }), true);
      } else {
        onCommit?.(group.key, photoValue({ box: clampBox({ ...selBox, x: selBox.x + ddx, y: selBox.y + ddy }) }), true);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  });

  const px = (n) => n * scale;
  const adjusted = !!(group && adjust?.[group.key]);
  const handles = group ? (group.type === 'photo' ? (photoMode === 'frame' ? [...CORNERS, ...EDGES] : []) : CORNERS) : [];
  const barAbove = selBox ? px(selBox.y) > 46 : true;
  const btn = (active) =>
    `inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] whitespace-nowrap ${active ? 'bg-bp-dark text-bp-light' : 'text-bp-ink hover:bg-bp-tint'}`;

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        if (e.target === rootRef.current) setSel(null);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(e) => e.stopPropagation()}
      data-testid="adjust-layer"
    >
      {/* 每一组一个可以点的范围：大块在下、小块在上（文字压在照片上也点得到），选中的那块永远在最上面 */}
      {groups
        .map((g) => ({ g, b: currentBox(g, adjOf(g.key)) }))
        .sort((p, q) => (p.g.key === sel) - (q.g.key === sel) || q.b.w * q.b.h - p.b.w * p.b.h)
        .map(({ g, b }) => {
        const on = g.key === sel;
        const changed = !!adjust?.[g.key];
        return (
          <div
            key={g.key}
            data-adjust-key={g.key}
            data-adjust-type={g.type}
            onPointerDown={(e) => startDrag(e, g, 'body')}
            className={`absolute ${on ? '' : 'hover:outline hover:outline-1 hover:outline-sky-400/70'}`}
            style={{
              left: px(b.x),
              top: px(b.y),
              width: Math.max(8, px(b.w)),
              height: Math.max(8, px(b.h)),
              cursor: on ? (g.type === 'photo' && photoMode === 'pan' ? 'grab' : 'move') : 'pointer',
              outline: on ? '1.5px solid #0ea5e9' : changed ? '1px dashed rgba(14,165,233,0.55)' : undefined,
              outlineOffset: 0,
            }}
          />
        );
      })}

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

      {/* 选中的东西的小工具栏 */}
      {group && selBox && (
        <div
          className="absolute z-10 flex items-center gap-0.5 rounded-lg bg-white/95 shadow-lg ring-1 ring-black/10 px-1 py-1"
          style={{
            left: Math.max(4, Math.min(px(selBox.x), px(SLIDE_W) - (group.type === 'photo' ? 430 : 170))),
            top: barAbove ? px(selBox.y) - 38 : Math.min(px(selBox.y + selBox.h) + 8, px(SLIDE_H) - 34),
          }}
          onPointerDown={(e) => e.stopPropagation()}
          data-testid="adjust-bar"
        >
          {group.type === 'photo' ? (
            <>
              <button type="button" className={btn(photoMode === 'pan')} aria-pressed={photoMode === 'pan'} onClick={() => setPhotoMode('pan')} title="在框里拖照片，改看得见的部分；滚轮缩放">
                <Hand size={12} /> 取景
              </button>
              <button type="button" className={btn(photoMode === 'frame')} aria-pressed={photoMode === 'frame'} onClick={() => setPhotoMode('frame')} title="拖动照片框换位置，拉手柄改大小">
                <Move size={12} /> 移动框
              </button>
              <span className="w-px h-4 bg-bp-line mx-0.5" />
              <input
                type="range"
                min={nat ? wholeZoom(nat, selBox) : 1}
                max="3"
                step="any"
                value={Math.min(3, zoomNow)}
                disabled={!nat}
                onChange={(e) => {
                  const v = viewObj(selBox);
                  if (v) onCommit?.(group.key, photoValue({ view: clampView(nat, selBox, { ...v, z: Number(e.target.value) }) }), true);
                }}
                className="w-24"
                aria-label="照片缩放"
                title="缩放"
              />
              <button type="button" className={btn(viewNow === 'whole')} onClick={() => onCommit?.(group.key, photoValue({ view: 'whole' }))} title="整张照片都放进框里，不裁">
                <Scan size={12} /> 整张显示
              </button>
              <button type="button" className={btn(false)} onClick={() => onCommit?.(group.key, photoValue({ view: { z: 1, cx: 0.5, cy: 0.5 } }))} title="照片刚好铺满框，居中">
                <Maximize size={12} /> 铺满
              </button>
            </>
          ) : (
            <span className="px-1.5 text-[11px] text-bp-muted whitespace-nowrap">拖动换位置 · 拖角改大小</span>
          )}
          {adjusted && (
            <>
              <span className="w-px h-4 bg-bp-line mx-0.5" />
              <button type="button" className={btn(false)} onClick={() => commit(group.key, null)} title="这一块回到程序排的位置和大小">
                <RotateCcw size={12} /> 恢复自动
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
