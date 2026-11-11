import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Trash2, Check, AlertTriangle, RotateCcw, Wand2, Loader2, MousePointer2 } from 'lucide-react';
import { KINDS, roomRects, openingRect } from '../../plan3d/geometry.js';
import {
  hitTest, dragRect, snapBox, snapOpening, guessFacing, validateGeo, applyOp, histInit, histPush, histUndo, histRedo,
} from '../../plan3d/edit.js';
import { settleGeo } from '../../plan3d/settle.js';
import Plan3dPreview from './Plan3dPreview.jsx';

// 「核对位置」对话框：图纸上叠着 AI 框出来（或自己画）的房间、门窗、柜子家具，可以拖动、拉边、画新的、删除、改种类；
// 右边的 3D 图跟着实时变。位置以这里确认的为准。
// props: { planUrl, size:{w,h}, geo, detected?, textures?, canAi?, onChange(geo), onClose(), onRedetectItems?(geo)→Promise<items> }

const KIND_ORDER = ['tall', 'low', 'desk', 'chair', 'glass', 'hung', 'shelf', 'column', 'block'];
const KIND_COLORS = {
  tall: '#7A4F2E', low: '#B07A45', desk: '#C99A2E', chair: '#D2527A', glass: '#2E9C9C', hung: '#8A5BD1', shelf: '#7D8B3A', column: '#3A3A3A', block: '#6F7785',
};
const OPENING_TYPES = [
  { id: 'door', zh: '门', color: '#E07B1A' },
  { id: 'window', zh: '窗', color: '#1E8FD0' },
  { id: 'hidden-door', zh: '暗门', color: '#9A4FC0' },
  { id: 'gap', zh: '门洞', color: '#7A7A7A' },
];
const openingDef = (type) => OPENING_TYPES.find((t) => t.id === type) || OPENING_TYPES[3];
const ROOM_COLOR = '#2563EB';

const chip = (active) =>
  `px-2.5 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-40 ${
    active ? 'bg-bp-dark text-bp-light border-bp-dark' : 'bg-white text-bp-muted border-bp-line hover:border-bp-rule'
  }`;
const iconBtn = 'p-1.5 rounded-lg border border-bp-line bg-white text-bp-muted hover:text-bp-ink hover:bg-bp-tint disabled:opacity-40';

const HANDLE_AT = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] };
const HANDLE_CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

/** 还没有坐标（自己画）时的空白模型：比例先按「图纸长边 ≈ 6 米」估 */
export function blankGeo(size) {
  const long = Math.max(size.w, size.h) || 1000;
  return { source: { w: size.w, h: size.h }, mmPerPx: 6000 / long, wallT: Math.max(3, Math.round(long * 0.014)), rooms: [], openings: [], items: [] };
}

const isTyping = (el) => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
const boxOf = (p0, p1) => [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1])];

/** 门窗在图上的两个端点（沿着墙） */
function openingEnds(o) {
  const horiz = o.side === 'top' || o.side === 'bottom';
  return horiz ? [[o.a, o.at], [o.b, o.at]] : [[o.at, o.a], [o.at, o.b]];
}

export default function Plan3dEditor({ planUrl, size, geo: initial, detected, textures, canAi, onChange, onClose, onRedetectItems }) {
  const [hist, setHist] = useState(() => histInit(settleGeo(initial || blankGeo(size))));
  const [live, setLive] = useState(null); // 拖动过程中的坐标（松手才进历史）
  const geo = live || hist.present;
  const [mode, setMode] = useState(() => ((initial?.rooms || []).length ? 'items' : 'structure')); // 'structure' 墙和门窗 | 'items' 柜子家具
  const [tool, setTool] = useState(null); // null = 选择；{ type:'item', kind } | { type:'room' } | { type:'opening', kind }
  const [sel, setSel] = useState(null); // { type:'item'|'opening'|'room', index, rect? }
  const [draft, setDraft] = useState(null); // 正在画的新框 { p0, p1 }
  const [zoom, setZoom] = useState(1);
  const [box, setBox] = useState({ w: 0, h: 0 }); // 图纸区域的可用大小
  const [pview, setPview] = useState('top');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const drag = useRef(null);

  const W = size.w;
  const H = size.h;
  const fitW = box.w && box.h ? Math.min(box.w, (box.h * W) / H) : 0;
  const scale = fitW ? (fitW * zoom) / W : 1; // 屏幕像素 / 图纸像素
  const layer = mode === 'items' ? 'items' : 'structure';

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => setBox({ w: el.clientWidth - 2, h: el.clientHeight - 2 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ⌘ / Ctrl + 滚轮缩放
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(8, Math.max(1, z * (e.deltaY < 0 ? 1.2 : 1 / 1.2))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function commit(next) {
    if (!next || next === hist.present) return;
    setHist(histPush(hist, next));
    onChange?.(next);
  }
  const run = (op) => commit(settleGeo(applyOp(hist.present, op)));

  function undo() {
    const h = histUndo(hist);
    if (h === hist) return;
    setHist(h);
    setSel(null);
    onChange?.(h.present);
  }
  function redo() {
    const h = histRedo(hist);
    if (h === hist) return;
    setHist(h);
    setSel(null);
    onChange?.(h.present);
  }

  function removeSelected() {
    if (!sel) return;
    if (sel.type === 'item') run({ type: 'removeItem', index: sel.index });
    else if (sel.type === 'opening') run({ type: 'removeOpening', index: sel.index });
    else run({ type: 'removeRoomRect', room: sel.index, rect: sel.rect || 0 });
    setSel(null);
  }

  function nudge(dx, dy) {
    if (!sel) return;
    const base = hist.present;
    const bounds = [0, 0, W, H];
    if (sel.type === 'item' && base.items[sel.index]) {
      run({ type: 'updateItem', index: sel.index, patch: { box: dragRect(base.items[sel.index].box, 'move', dx, dy, bounds, 2) } });
    } else if (sel.type === 'room' && base.rooms[sel.index]?.rects?.[sel.rect || 0]) {
      run({ type: 'setRoomRect', room: sel.index, rect: sel.rect || 0, box: dragRect(base.rooms[sel.index].rects[sel.rect || 0], 'move', dx, dy, bounds, 2) });
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel) {
          e.preventDefault();
          removeSelected();
        }
      } else if (e.key === 'Escape') {
        if (draft || tool) {
          setDraft(null);
          drag.current = null;
          setTool(null);
        } else if (sel) setSel(null);
      } else if (/^Arrow/.test(e.key) && sel) {
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1) * Math.max(1, Math.round(1 / scale));
        nudge(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------------- 指针：选中 / 拖动 / 画新的 ----------------
  const toPt = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const tolFor = (e) => (e.pointerType === 'touch' ? 18 : 8) / scale;

  /** 拖动中的坐标：从按下时的坐标（d.base）重新算，不累积误差 */
  function dragged(d, dx, dy, tol) {
    const base = d.base;
    const hit = d.hit;
    const bounds = [0, 0, W, H];
    if (hit.type === 'item') {
      const it = base.items[hit.index];
      const snapped = snapBox(base, dragRect(it.box, hit.handle, dx, dy, bounds, 3), tol, hit.handle);
      const patch = { box: snapped.box, against: snapped.against || undefined };
      if (it.kind === 'chair') patch.facing = guessFacing(base, snapped.box) || it.facing;
      return applyOp(base, { type: 'updateItem', index: hit.index, patch });
    }
    if (hit.type === 'room') {
      const rect = base.rooms[hit.index].rects[hit.rect || 0];
      return settleGeo(applyOp(base, { type: 'setRoomRect', room: hit.index, rect: hit.rect || 0, box: dragRect(rect, hit.handle, dx, dy, bounds, 8) }));
    }
    const o = base.openings[hit.index];
    const ends = openingEnds(o);
    const p1 = hit.handle === 'b' ? ends[0] : [ends[0][0] + dx, ends[0][1] + dy];
    const p2 = hit.handle === 'a' ? ends[1] : [ends[1][0] + dx, ends[1][1] + dy];
    const so = snapOpening(base, p1, p2, Infinity);
    return so ? applyOp(base, { type: 'updateOpening', index: hit.index, patch: { side: so.side, at: so.at, a: so.a, b: so.b } }) : base;
  }

  function onPointerDown(e) {
    if (e.button) return;
    e.preventDefault();
    const pt = toPt(e);
    svgRef.current.setPointerCapture?.(e.pointerId);
    if (tool) {
      drag.current = { kind: 'draw', p0: pt, tol: tolFor(e) };
      setDraft({ p0: pt, p1: pt });
      return;
    }
    const tol = tolFor(e);
    const hit = hitTest(hist.present, pt, { tol, layer, selected: sel });
    if (!hit) {
      setSel(null);
      return;
    }
    setSel({ type: hit.type, index: hit.index, rect: hit.rect });
    drag.current = { kind: 'edit', hit, p0: pt, base: hist.present, tol, moved: false };
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d) return;
    const pt = toPt(e);
    if (d.kind === 'draw') {
      setDraft({ p0: d.p0, p1: pt });
      return;
    }
    const dx = pt[0] - d.p0[0];
    const dy = pt[1] - d.p0[1];
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3 / scale) return;
    d.moved = true;
    setLive(dragged(d, dx, dy, d.tol));
  }

  function onPointerUp(e) {
    const d = drag.current;
    drag.current = null;
    svgRef.current?.releasePointerCapture?.(e.pointerId);
    if (!d) return;
    if (d.kind === 'edit') {
      const next = live;
      setLive(null);
      if (d.moved && next) commit(settleGeo(next));
      return;
    }
    // 画新的
    const p1 = toPt(e);
    setDraft(null);
    const base = hist.present;
    const b = boxOf(d.p0, p1);
    const big = b[2] - b[0] > 6 / scale && b[3] - b[1] > 6 / scale;
    if (tool.type === 'opening') {
      const so = snapOpening(base, d.p0, p1, Infinity);
      if (!so) {
        setErr('先画出房间，门窗才有墙可以放');
        return;
      }
      commit(settleGeo(applyOp(base, { type: 'addOpening', opening: { type: tool.kind, side: so.side, at: so.at, a: so.a, b: so.b } })));
      setSel({ type: 'opening', index: (base.openings || []).length });
    } else if (!big) {
      return;
    } else if (tool.type === 'room') {
      const rooms = base.rooms || [];
      if (!rooms.length) commit(settleGeo(applyOp(base, { type: 'addRoom', name: '', box: b })));
      else commit(settleGeo(applyOp(base, { type: 'addRoomRect', room: sel?.type === 'room' ? sel.index : 0, box: b })));
    } else {
      const first = snapBox(base, b, d.tol, 'nw');
      const snapped = snapBox(base, first.box, d.tol, 'se');
      const item = { kind: tool.kind, label: '', box: snapped.box };
      if (snapped.against) item.against = snapped.against;
      if (tool.kind === 'chair') item.facing = guessFacing(base, snapped.box) || 'top';
      commit(settleGeo(applyOp(base, { type: 'addItem', item })));
      setSel({ type: 'item', index: (base.items || []).length });
    }
    setTool(null);
    setErr('');
  }

  // ---------------- 派生的显示数据 ----------------
  const rects = useMemo(() => roomRects(geo), [geo]);
  const warnings = useMemo(() => validateGeo(geo), [geo]);
  const unsureCount = (geo.items || []).filter((it) => it.unsure).length;
  const mainRect = useMemo(() => {
    let best = null;
    rects.forEach((r) => {
      if (!best || (r[2] - r[0]) * (r[3] - r[1]) > (best[2] - best[0]) * (best[3] - best[1])) best = r;
    });
    return best;
  }, [rects]);
  const roomLongPx = mainRect ? Math.max(mainRect[2] - mainRect[0], mainRect[3] - mainRect[1]) : 0;
  const roomLongM = roomLongPx ? (roomLongPx * geo.mmPerPx) / 1000 : 0;
  const selItem = sel?.type === 'item' ? geo.items?.[sel.index] : null;
  const selOpening = sel?.type === 'opening' ? geo.openings?.[sel.index] : null;
  const selRoom = sel?.type === 'room' ? geo.rooms?.[sel.index] : null;
  const selBox = selItem ? selItem.box : selRoom ? selRoom.rects?.[sel.rect || 0] : null;
  const hs = 9 / scale; // 手柄大小（图纸像素）
  const sw = 1.6 / scale; // 线宽

  function switchMode(m) {
    setMode(m);
    setTool(null);
    setSel(null);
  }

  async function redetectItems() {
    if (!onRedetectItems || busy) return;
    if ((geo.items || []).length && !window.confirm('让 AI 重新识别柜子和家具？现在的柜子家具会被替换（墙和门窗不动）。')) return;
    setBusy('items');
    setErr('');
    try {
      const items = await onRedetectItems(hist.present);
      commit(settleGeo({ ...hist.present, items }));
      setSel(null);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy('');
    }
  }

  function restoreDetected() {
    if (!detected || !window.confirm('恢复成 AI 刚框完的样子？你之后的修改会被替换（可以用撤销找回）。')) return;
    commit(settleGeo(detected));
    setSel(null);
  }

  const cursor = tool ? 'crosshair' : 'default';

  return (
    <div role="dialog" aria-modal="true" aria-label="核对位置" className="fixed inset-0 z-50 bg-bp-paper flex flex-col" data-testid="plan3d-editor">
      {/* 顶栏 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 border-b border-bp-line bg-white">
        <div className="font-serif text-base text-bp-ink mr-1">核对位置</div>
        <div className="flex items-center gap-1.5" role="tablist" aria-label="核对哪一部分">
          <button type="button" role="tab" aria-selected={mode === 'structure'} className={chip(mode === 'structure')} onClick={() => switchMode('structure')}>
            ① 墙和门窗
          </button>
          <button type="button" role="tab" aria-selected={mode === 'items'} className={chip(mode === 'items')} onClick={() => switchMode('items')}>
            ② 柜子家具{unsureCount ? ` · ${unsureCount} 个待确认` : ''}
          </button>
        </div>
        <div className="flex-1" />
        <button type="button" className={iconBtn} disabled={!hist.past.length} onClick={undo} title="撤销（⌘Z）" aria-label="撤销">
          <Undo2 size={15} />
        </button>
        <button type="button" className={iconBtn} disabled={!hist.future.length} onClick={redo} title="重做（⇧⌘Z）" aria-label="重做">
          <Redo2 size={15} />
        </button>
        <span className="w-px h-5 bg-bp-line" />
        <button type="button" className={iconBtn} disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z / 1.5))} title="缩小" aria-label="缩小">
          <ZoomOut size={15} />
        </button>
        <button type="button" className={iconBtn} disabled={zoom >= 8} onClick={() => setZoom((z) => Math.min(8, z * 1.5))} title="放大（⌘ + 滚轮）" aria-label="放大">
          <ZoomIn size={15} />
        </button>
        <button type="button" className={iconBtn} disabled={zoom === 1} onClick={() => setZoom(1)} title="整张图" aria-label="整张图">
          <Maximize size={15} />
        </button>
        <button type="button" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-bp-dark text-bp-light text-sm font-medium hover:opacity-90" onClick={onClose}>
          <Check size={15} /> 完成
        </button>
      </div>

      {/* 工具 */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-bp-line bg-bp-card" data-testid="plan3d-tools">
        <button type="button" className={chip(!tool)} aria-pressed={!tool} onClick={() => setTool(null)}>
          <MousePointer2 size={12} className="inline -mt-0.5 mr-1" />
          选择 / 拖动
        </button>
        <span className="text-[11px] text-bp-faint ml-1">加一个：</span>
        {mode === 'structure' ? (
          <>
            <button type="button" className={chip(tool?.type === 'room')} aria-pressed={tool?.type === 'room'} onClick={() => setTool({ type: 'room' })}>
              {(geo.rooms || []).length ? '凹位 / 房间的另一块' : '房间'}
            </button>
            {OPENING_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={chip(tool?.type === 'opening' && tool.kind === t.id)}
                aria-pressed={tool?.type === 'opening' && tool.kind === t.id}
                disabled={!(geo.rooms || []).length}
                onClick={() => setTool({ type: 'opening', kind: t.id })}
              >
                <span className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle" style={{ background: t.color }} />
                {t.zh}
              </button>
            ))}
          </>
        ) : (
          KIND_ORDER.map((k) => (
            <button key={k} type="button" className={chip(tool?.type === 'item' && tool.kind === k)} aria-pressed={tool?.type === 'item' && tool.kind === k} onClick={() => setTool({ type: 'item', kind: k })}>
              <span className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle" style={{ background: KIND_COLORS[k] }} />
              {KINDS[k].zh}
            </button>
          ))
        )}
        <span className="text-[11px] text-bp-faint ml-1">
          {tool ? (tool.type === 'opening' ? '沿着墙拖一段' : '在图纸上拖出一个框') : '点一下选中，拖动移位，拉边改大小；Delete 删除'}
        </span>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* 图纸 + 框 */}
        <div ref={wrapRef} className="flex-1 min-h-[45vh] lg:min-h-0 overflow-auto thin-scroll bg-bp-tint p-px">
          {fitW > 0 && (
            <div className="relative mx-auto select-none" style={{ width: fitW * zoom, height: (fitW * zoom * H) / W }}>
              <img src={planUrl} alt="平面图" draggable={false} className="absolute inset-0 w-full h-full" />
              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                className="absolute inset-0 w-full h-full"
                style={{ touchAction: 'none', cursor }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                data-testid="plan3d-stage"
              >
                {/* 房间 */}
                {(geo.rooms || []).map((room, ri) =>
                  (room.rects || []).map((r, k) => {
                    const on = sel?.type === 'room' && sel.index === ri && (sel.rect || 0) === k;
                    return (
                      <rect
                        key={`r${ri}-${k}`}
                        x={r[0]}
                        y={r[1]}
                        width={r[2] - r[0]}
                        height={r[3] - r[1]}
                        fill={ROOM_COLOR}
                        fillOpacity={mode === 'structure' ? 0.07 : 0.03}
                        stroke={ROOM_COLOR}
                        strokeWidth={(on ? 2.6 : mode === 'structure' ? 1.8 : 1) / scale}
                        strokeOpacity={mode === 'structure' ? 1 : 0.45}
                        pointerEvents="none"
                      />
                    );
                  })
                )}
                {/* 门窗 */}
                {(geo.openings || []).map((o, i) => {
                  const r = openingRect(rects, o, geo.wallT || 0);
                  if (!r) return null;
                  const def = openingDef(o.type);
                  const on = sel?.type === 'opening' && sel.index === i;
                  return (
                    <rect
                      key={`o${i}`}
                      x={r[0]}
                      y={r[1]}
                      width={r[2] - r[0]}
                      height={r[3] - r[1]}
                      fill={def.color}
                      fillOpacity={mode === 'structure' ? 0.55 : 0.25}
                      stroke={def.color}
                      strokeWidth={(on ? 2.6 : 1.2) / scale}
                      pointerEvents="none"
                    />
                  );
                })}
                {/* 柜子家具 */}
                {(geo.items || []).map((it, i) => {
                  const b = it.box;
                  const color = KIND_COLORS[it.kind] || KIND_COLORS.block;
                  const on = sel?.type === 'item' && sel.index === i;
                  const dim = mode !== 'items';
                  return (
                    <g key={it.id || i} pointerEvents="none" opacity={dim ? 0.35 : 1}>
                      <rect
                        x={b[0]}
                        y={b[1]}
                        width={b[2] - b[0]}
                        height={b[3] - b[1]}
                        fill={color}
                        fillOpacity={on ? 0.34 : 0.2}
                        stroke={color}
                        strokeWidth={(on ? 2.6 : 1.5) / scale}
                        strokeDasharray={it.unsure ? `${5 / scale} ${4 / scale}` : undefined}
                      />
                      {(b[2] - b[0]) * scale > 34 && (b[3] - b[1]) * scale > 15 && (
                        <text x={b[0] + 3 / scale} y={b[1] + 11 / scale} fontSize={10 / scale} fill={color} fontWeight="600" style={{ paintOrder: 'stroke' }} stroke="#fff" strokeWidth={2.5 / scale}>
                          {KINDS[it.kind]?.zh || '其他'}
                          {it.unsure ? ' ?' : ''}
                        </text>
                      )}
                    </g>
                  );
                })}
                {/* 选中的框的 8 个手柄 */}
                {selBox &&
                  Object.entries(HANDLE_AT).map(([id, [fx, fy]]) => (
                    <rect
                      key={id}
                      x={selBox[0] + (selBox[2] - selBox[0]) * fx - hs / 2}
                      y={selBox[1] + (selBox[3] - selBox[1]) * fy - hs / 2}
                      width={hs}
                      height={hs}
                      fill="#fff"
                      stroke="#111"
                      strokeWidth={sw}
                      style={{ cursor: HANDLE_CURSOR[id] }}
                      pointerEvents="none"
                    />
                  ))}
                {/* 选中的门窗的两个端点 */}
                {selOpening &&
                  typeof selOpening.at === 'number' &&
                  openingEnds(selOpening).map((p, k) => <circle key={k} cx={p[0]} cy={p[1]} r={hs * 0.6} fill="#fff" stroke="#111" strokeWidth={sw} pointerEvents="none" />)}
                {/* 正在画的 */}
                {draft &&
                  (tool?.type === 'opening' ? (
                    <line x1={draft.p0[0]} y1={draft.p0[1]} x2={draft.p1[0]} y2={draft.p1[1]} stroke={openingDef(tool.kind).color} strokeWidth={4 / scale} strokeLinecap="round" pointerEvents="none" />
                  ) : (
                    (() => {
                      const b = boxOf(draft.p0, draft.p1);
                      const color = tool?.type === 'item' ? KIND_COLORS[tool.kind] : ROOM_COLOR;
                      return <rect x={b[0]} y={b[1]} width={b[2] - b[0]} height={b[3] - b[1]} fill={color} fillOpacity="0.15" stroke={color} strokeWidth={1.6 / scale} strokeDasharray={`${4 / scale} ${3 / scale}`} pointerEvents="none" />;
                    })()
                  ))}
              </svg>
            </div>
          )}
        </div>

        {/* 右栏：实时 3D 图 + 选中的东西 */}
        <div className="lg:w-[340px] shrink-0 border-t lg:border-t-0 lg:border-l border-bp-line bg-white overflow-y-auto thin-scroll p-3 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-bp-faint">出图预览（跟着你的修改实时变）</span>
              <span className="flex gap-1">
                <button type="button" className={`${chip(pview === 'top')} !px-2 !py-1`} onClick={() => setPview('top')}>
                  正俯视
                </button>
                <button type="button" className={`${chip(pview === 'iso')} !px-2 !py-1`} onClick={() => setPview('iso')}>
                  斜角
                </button>
              </span>
            </div>
            <Plan3dPreview geo={geo} view={{ view: pview, corner: 'se', wallMm: 650, cab: 'cut', hung: 'ghost' }} textures={textures} longEdge={live ? 520 : 900} className="rounded-xl overflow-hidden border border-bp-line bg-bp-tint min-h-[120px]" />
          </div>

          {/* 选中的东西 */}
          {selItem ? (
            <div className="rounded-xl border border-bp-line p-3 space-y-2.5" data-testid="item-inspector">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-bp-ink">
                  {KINDS[selItem.kind]?.zh || '其他'}
                  {selItem.unsure && <span className="ml-1.5 text-bp-danger font-normal">AI 不太确定</span>}
                </span>
                <button type="button" className="text-bp-faint hover:text-bp-danger" onClick={removeSelected} aria-label="删除这个">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="种类">
                {KIND_ORDER.map((k) => (
                  <button key={k} type="button" className={`${chip(selItem.kind === k)} !px-2 !py-1`} aria-pressed={selItem.kind === k} onClick={() => run({ type: 'updateItem', index: sel.index, patch: { kind: k } })}>
                    {KINDS[k].zh}
                  </button>
                ))}
              </div>
              <input
                className="w-full rounded-lg border border-bp-line bg-white px-2.5 py-1.5 text-xs text-bp-ink placeholder:text-bp-faint focus:outline-none focus:border-bp-gold"
                value={selItem.label || ''}
                onChange={(e) => run({ type: 'updateItem', index: sel.index, patch: { label: e.target.value.slice(0, 40) } })}
                placeholder="名称（可选，例如 书柜）"
                aria-label="名称"
              />
              {selItem.unsure && (
                <button type="button" className={chip(false)} onClick={() => run({ type: 'updateItem', index: sel.index, patch: { unsure: undefined } })}>
                  <Check size={12} className="inline -mt-0.5 mr-1" />
                  这个没问题
                </button>
              )}
            </div>
          ) : selOpening ? (
            <div className="rounded-xl border border-bp-line p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-bp-ink">{openingDef(selOpening.type).zh}</span>
                <button type="button" className="text-bp-faint hover:text-bp-danger" onClick={removeSelected} aria-label="删除这个">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="门窗种类">
                {OPENING_TYPES.map((t) => (
                  <button key={t.id} type="button" className={`${chip(selOpening.type === t.id)} !px-2 !py-1`} aria-pressed={selOpening.type === t.id} onClick={() => run({ type: 'updateOpening', index: sel.index, patch: { type: t.id } })}>
                    {t.zh}
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-bp-faint">拖两头的圆点改宽度；拖中间可以移到别的墙上。</div>
            </div>
          ) : selRoom ? (
            <div className="rounded-xl border border-bp-line p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-bp-ink">{(sel.rect || 0) === 0 ? '房间' : '凹位'}</span>
                <button type="button" className="text-bp-faint hover:text-bp-danger" onClick={removeSelected} aria-label="删除这一块">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="text-[11px] text-bp-faint leading-relaxed">框要贴着墙的内侧（地板的边）。房间不是方的，就用「凹位」再加一块拼起来。</div>
            </div>
          ) : (
            <div className="rounded-xl border border-bp-line p-3 space-y-2.5">
              <div className="text-xs font-semibold text-bp-ink">
                房间 {(geo.rooms || []).length} · 门窗 {(geo.openings || []).length} · 柜子家具 {(geo.items || []).length}
              </div>
              {roomLongPx > 0 && (
                <label className="flex items-center gap-2 text-[11px] text-bp-muted">
                  房间长边约
                  <input
                    type="number"
                    min="1"
                    max="30"
                    step="0.1"
                    className="w-16 rounded-lg border border-bp-line px-2 py-1 text-xs text-bp-ink focus:outline-none focus:border-bp-gold"
                    value={Number(roomLongM.toFixed(1))}
                    onChange={(e) => {
                      const m = Number(e.target.value);
                      if (m > 0.5 && m < 60) run({ type: 'setScale', mmPerPx: (m * 1000) / roomLongPx });
                    }}
                    aria-label="房间长边（米）"
                  />
                  米（影响柜子看起来多高）
                </label>
              )}
              <label className="flex items-center gap-2 text-[11px] text-bp-muted">
                墙厚
                <input
                  type="range"
                  min="2"
                  max={Math.max(40, Math.round(Math.max(W, H) * 0.04))}
                  step="1"
                  value={Math.round(geo.wallT || 0)}
                  onChange={(e) => run({ type: 'setWallT', wallT: Number(e.target.value) })}
                  aria-label="墙厚"
                />
                约 {Math.round((geo.wallT || 0) * geo.mmPerPx)} 毫米
              </label>
            </div>
          )}

          {/* 提醒 */}
          {warnings.length > 0 && (
            <div className="rounded-xl border border-bp-line bg-bp-tint p-3 space-y-1.5" data-testid="plan3d-warnings">
              <div className="text-xs font-semibold text-bp-ink flex items-center gap-1.5">
                <AlertTriangle size={12} className="text-bp-gold" /> 要看一下的 {warnings.length} 处
              </div>
              <ul className="space-y-1">
                {warnings.slice(0, 12).map((w, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className="text-left text-[11px] text-bp-muted hover:text-bp-ink leading-relaxed"
                      onClick={() => {
                        if (w.type === 'item') {
                          setMode('items');
                          setSel({ type: 'item', index: w.index });
                        } else if (w.type === 'opening') {
                          setMode('structure');
                          setSel({ type: 'opening', index: w.index });
                        } else if (w.code === 'no-room') {
                          setMode('structure');
                          setTool({ type: 'room' });
                        }
                      }}
                    >
                      · {w.zh}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* AI */}
          <div className="flex flex-wrap gap-1.5">
            {onRedetectItems && mode === 'items' && (
              <button type="button" className={chip(false)} disabled={!canAi || !!busy || !(geo.rooms || []).length} onClick={redetectItems} title="墙和门窗不动，只让 AI 重新找柜子家具（1 次看图）">
                {busy === 'items' ? <Loader2 size={12} className="inline -mt-0.5 mr-1 animate-spin" /> : <Wand2 size={12} className="inline -mt-0.5 mr-1" />}
                让 AI 重新识别柜子家具（1 次看图）
              </button>
            )}
            {detected && (
              <button type="button" className={chip(false)} onClick={restoreDetected}>
                <RotateCcw size={12} className="inline -mt-0.5 mr-1" />
                恢复 AI 原始结果
              </button>
            )}
          </div>
          {err && <div className="text-[11px] text-bp-danger">{err}</div>}
          <div className="text-[11px] text-bp-faint leading-relaxed">每次松手都会自动保存。小东西看不清就放大。</div>
        </div>
      </div>
    </div>
  );
}
