import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Minus, Maximize2 } from 'lucide-react';
import { clamp, dist, distToPath, midpoint, orthoSnap, pathLength, segments, snapToVertices } from '../services/geometry.js';
import { kindOf } from '../constants.js';
import { fmtLen } from '../services/units.js';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 24;
const SNAP_PX = 12; // 端点吸附半径（屏幕像素）
const TAP_PX = 6; // 小于这个位移算「点一下」，大于就是拖动画布

/**
 * 户型图画布：底图 + SVG 标注层，整体用 transform 缩放平移，
 * 所有测量坐标都存图片像素坐标，跟缩放无关。
 */
export default function PlanCanvas({
  plan,
  items,
  calib,
  draft,
  mode, // 'select' | 'draw'
  ortho,
  mmPerPx,
  unit,
  selectedId,
  drawColor,
  onPlacePoint,
  onFinishDraft,
  onSelect,
  onMovePoint,
}) {
  const wrapRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ zoom: 1, tx: 0, ty: 0 });
  const [hover, setHover] = useState(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const ptrs = useRef(new Map());
  const gest = useRef(null);
  const fittedRef = useRef(null);

  /* ---------- 尺寸 / 适配 ---------- */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 窗口/转屏导致画布尺寸变化时，保持视野中心对着同一处图纸，别把图甩出屏幕外
  const prevBox = useRef(null);
  useEffect(() => {
    if (!box.w || !box.h) return;
    const prev = prevBox.current;
    prevBox.current = box;
    if (!prev || !prev.w || fittedRef.current !== plan?.dataUrl) return;
    setView((v) => ({ ...v, tx: v.tx + (box.w - prev.w) / 2, ty: v.ty + (box.h - prev.h) / 2 }));
  }, [box.w, box.h, box, plan]);

  const fit = useCallback(() => {
    if (!plan || !box.w || !box.h) return;
    const z = Math.min(box.w / plan.width, box.h / plan.height) * 0.94;
    setView({ zoom: z, tx: (box.w - plan.width * z) / 2, ty: (box.h - plan.height * z) / 2 });
  }, [plan, box.w, box.h]);

  useEffect(() => {
    if (!plan || !box.w || !box.h) return;
    if (fittedRef.current === plan.dataUrl) return;
    fittedRef.current = plan.dataUrl;
    fit();
  }, [plan, box.w, box.h, fit]);

  /* ---------- 坐标换算 ---------- */
  const toImage = useCallback((clientX, clientY) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - rect.left - v.tx) / v.zoom, y: (clientY - rect.top - v.ty) / v.zoom };
  }, []);

  const zoomAt = useCallback((factor, screenX, screenY) => {
    const v = viewRef.current;
    const z = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const k = z / v.zoom;
    setView({ zoom: z, tx: screenX - (screenX - v.tx) * k, ty: screenY - (screenY - v.ty) * k });
  }, []);

  const zoomCenter = (factor) => zoomAt(factor, box.w / 2, box.h / 2);

  /* ---------- 吸附 ---------- */
  const vertices = useMemo(() => {
    const out = [];
    items.forEach((it) => it.points.forEach((p, i) => out.push({ ...p, itemId: it.id, index: i })));
    if (calib?.points) calib.points.forEach((p, i) => out.push({ ...p, itemId: '__calib__', index: i }));
    return out;
  }, [items, calib]);

  const snapPoint = useCallback(
    (p, { anchor, exclude } = {}) => {
      const tol = SNAP_PX / viewRef.current.zoom;
      const pool = exclude
        ? vertices.filter((v) => !(v.itemId === exclude.itemId && v.index === exclude.index))
        : vertices;
      const v = snapToVertices(p, pool, tol);
      if (v) return { x: v.x, y: v.y, snapped: true };
      if (anchor && ortho) return { ...orthoSnap(anchor, p), ortho: true };
      return p;
    },
    [vertices, ortho]
  );

  const draftAnchor = draft?.points?.length ? draft.points[draft.points.length - 1] : null;

  /* ---------- 命中测试 ---------- */
  const hitVertex = useCallback(
    (p) => {
      const tol = SNAP_PX / viewRef.current.zoom;
      let best = null;
      let bestD = tol;
      for (const v of vertices) {
        const d = dist(p, v);
        if (d <= bestD) {
          bestD = d;
          best = v;
        }
      }
      return best;
    },
    [vertices]
  );

  const hitItem = useCallback(
    (p) => {
      const tol = 10 / viewRef.current.zoom;
      let best = null;
      let bestD = tol;
      for (const it of items) {
        if (it.hidden || it.points.length < 2) continue;
        const d = distToPath(p, it.points);
        if (d <= bestD) {
          bestD = d;
          best = it;
        }
      }
      return best;
    },
    [items]
  );

  /* ---------- 指针事件 ---------- */
  function startPinch() {
    const rect = wrapRef.current.getBoundingClientRect();
    const [a, b] = [...ptrs.current.values()];
    gest.current = {
      type: 'pinch',
      d0: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      c0: { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top },
      view: { ...viewRef.current },
    };
  }

  function handlePointerDown(e) {
    if (!plan) return;
    wrapRef.current.setPointerCapture?.(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2) {
      startPinch();
      return;
    }
    if (ptrs.current.size > 2) return;

    const p = toImage(e.clientX, e.clientY);
    const v = mode === 'select' ? hitVertex(p) : null;
    if (v) {
      gest.current = { type: 'vertex', itemId: v.itemId, index: v.index };
      return;
    }
    gest.current = {
      type: 'pan',
      sx: e.clientX,
      sy: e.clientY,
      view: { ...viewRef.current },
      moved: false,
    };
  }

  function handlePointerMove(e) {
    if (!plan) return;
    const g = gest.current;

    if (!ptrs.current.has(e.pointerId)) {
      // 只是鼠标划过：画橡皮筋预览
      if (mode === 'draw') {
        const p = toImage(e.clientX, e.clientY);
        setHover(snapPoint(p, { anchor: draftAnchor }));
      }
      return;
    }
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g) return;

    if (g.type === 'pinch' && ptrs.current.size >= 2) {
      const rect = wrapRef.current.getBoundingClientRect();
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const c = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
      const z = clamp((g.view.zoom * d) / g.d0, MIN_ZOOM, MAX_ZOOM);
      // 捏合中心对应的图片坐标保持不动
      const ix = (g.c0.x - g.view.tx) / g.view.zoom;
      const iy = (g.c0.y - g.view.ty) / g.view.zoom;
      setView({ zoom: z, tx: c.x - ix * z, ty: c.y - iy * z });
      return;
    }

    if (g.type === 'pan') {
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (!g.moved && Math.hypot(dx, dy) > TAP_PX) g.moved = true;
      if (g.moved) setView({ zoom: g.view.zoom, tx: g.view.tx + dx, ty: g.view.ty + dy });
      else if (mode === 'draw') setHover(snapPoint(toImage(e.clientX, e.clientY), { anchor: draftAnchor }));
      return;
    }

    if (g.type === 'vertex') {
      const p = toImage(e.clientX, e.clientY);
      const owner = g.itemId === '__calib__' ? calib : items.find((i) => i.id === g.itemId);
      const neighbor = owner?.points?.[g.index === 0 ? 1 : g.index - 1] || null;
      onMovePoint(g.itemId, g.index, snapPoint(p, { anchor: neighbor, exclude: g }));
    }
  }

  function handlePointerUp(e) {
    const g = gest.current;
    ptrs.current.delete(e.pointerId);

    if (ptrs.current.size === 0) {
      gest.current = null;
      if (g?.type === 'pan' && !g.moved) handleTap(e);
      return;
    }
    if (g?.type === 'pinch' && ptrs.current.size === 1) {
      // 松开一根手指，用剩下那根继续平移
      const [only] = [...ptrs.current.values()];
      gest.current = { type: 'pan', sx: only.x, sy: only.y, view: { ...viewRef.current }, moved: true };
      return;
    }
    gest.current = null;
  }

  function handleTap(e) {
    const p = toImage(e.clientX, e.clientY);
    if (mode === 'draw') {
      onPlacePoint(snapPoint(p, { anchor: draftAnchor }));
      setHover(null);
      return;
    }
    const it = hitItem(p);
    onSelect(it ? it.id : null);
  }

  /* ---------- 滚轮缩放（要 passive:false 才能 preventDefault） ---------- */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  /* ---------- 绘制 ---------- */
  const z = view.zoom || 1;
  const k = 1 / z;
  const label = (key, x, y, text, color, weight = 600) => (
    <text
      key={key}
      x={x}
      y={y}
      fontSize={13 * k}
      fontWeight={weight}
      fill={color}
      stroke="#ffffff"
      strokeWidth={3.5 * k}
      paintOrder="stroke"
      textAnchor="middle"
      dominantBaseline="middle"
      style={{ pointerEvents: 'none' }}
    >
      {text}
    </text>
  );

  const renderPath = (points, color, { dashed, selected, keyPrefix, showSeg = true, totalLabel } = {}) => {
    const els = [];
    els.push(
      <polyline
        key={`${keyPrefix}-line`}
        points={points.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={(selected ? 4 : 2.6) * k}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dashed ? `${8 * k} ${5 * k}` : undefined}
      />
    );
    points.forEach((p, i) => {
      els.push(
        <circle
          key={`${keyPrefix}-v${i}`}
          cx={p.x}
          cy={p.y}
          r={(selected ? 6 : 4) * k}
          fill={selected ? '#fff' : color}
          stroke={color}
          strokeWidth={2 * k}
        />
      );
    });
    if (showSeg && mmPerPx) {
      segments(points).forEach((s, i) => {
        const m = midpoint(s.a, s.b);
        els.push(label(`${keyPrefix}-s${i}`, m.x, m.y - 10 * k, fmtLen(s.len * mmPerPx, unit), color));
      });
    }
    if (totalLabel) {
      const last = points[points.length - 1];
      els.push(label(`${keyPrefix}-t`, last.x, last.y - 22 * k, totalLabel, color, 700));
    }
    return els;
  };

  const cursor = mode === 'draw' ? 'crosshair' : 'grab';

  return (
    <div
      ref={wrapRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={() => mode === 'draw' && onFinishDraft()}
      onPointerLeave={() => setHover(null)}
      className="relative w-full h-full overflow-hidden bg-[#E9E4DA] select-none"
      style={{ touchAction: 'none', cursor }}
    >
      {plan && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: plan.width,
            height: plan.height,
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${z})`,
            transformOrigin: '0 0',
          }}
        >
          <img
            src={plan.dataUrl}
            width={plan.width}
            height={plan.height}
            alt="户型图"
            draggable={false}
            className="block max-w-none pointer-events-none bg-white"
          />
          <svg
            width={plan.width}
            height={plan.height}
            className="absolute inset-0 pointer-events-none"
            style={{ overflow: 'visible' }}
          >
            {calib?.points?.length === 2 &&
              renderPath(calib.points, '#2563EB', {
                dashed: true,
                keyPrefix: 'calib',
                showSeg: false,
                totalLabel: calib.mm ? `标定 ${Math.round(calib.mm)} mm` : '待输入尺寸',
              })}

            {items.map((it) => {
              if (it.hidden || !it.points.length) return null;
              const color = kindOf(it.kind).color;
              const total = mmPerPx ? pathLength(it.points) * mmPerPx : 0;
              const many = it.points.length > 2;
              return (
                <g key={it.id}>
                  {renderPath(it.points, color, {
                    selected: selectedId === it.id,
                    keyPrefix: it.id,
                    totalLabel: many && total ? `${it.label} Σ ${fmtLen(total, unit)}` : it.label,
                  })}
                </g>
              );
            })}

            {draft?.points?.length > 0 &&
              renderPath(hover ? [...draft.points, hover] : draft.points, drawColor || '#1A1614', {
                dashed: true,
                keyPrefix: 'draft',
              })}

            {hover && (
              <circle
                cx={hover.x}
                cy={hover.y}
                r={5 * k}
                fill="none"
                stroke={hover.snapped ? '#2563EB' : drawColor || '#1A1614'}
                strokeWidth={2 * k}
              />
            )}
          </svg>
        </div>
      )}

      {/* 缩放控制 */}
      <div className="absolute right-3 bottom-3 flex flex-col gap-1.5">
        <button
          onClick={() => zoomCenter(1.3)}
          className="w-9 h-9 rounded-lg bg-white/95 border border-sail-line text-sail-muted hover:bg-sail-tint flex items-center justify-center"
          title="放大"
        >
          <Plus size={16} />
        </button>
        <button
          onClick={() => zoomCenter(1 / 1.3)}
          className="w-9 h-9 rounded-lg bg-white/95 border border-sail-line text-sail-muted hover:bg-sail-tint flex items-center justify-center"
          title="缩小"
        >
          <Minus size={16} />
        </button>
        <button
          onClick={fit}
          className="w-9 h-9 rounded-lg bg-white/95 border border-sail-line text-sail-muted hover:bg-sail-tint flex items-center justify-center"
          title="适配窗口"
        >
          <Maximize2 size={16} />
        </button>
      </div>

      <div className="absolute left-3 bottom-3 text-[11px] text-sail-muted bg-white/90 border border-sail-line rounded-lg px-2 py-1">
        {mode === 'draw'
          ? '点一下放点 · 拖动平移 · 滚轮/双指缩放 · 双击或回车结束'
          : '点线条选中 · 拖端点微调 · 拖动平移'}
      </div>
    </div>
  );
}
