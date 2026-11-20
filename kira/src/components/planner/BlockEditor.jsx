// 第二版「画框框」：在色块立面图上直接切格子、改类型、改尺寸、每格单独选系列。
//   useBlockEditor —— 选中的格子、看哪个柜体、画笔、撤销 / 重做，所有改动都经过 setCab（价钱条、比价、提醒照常）
//   BlockCanvas    —— 图（手机在上、电脑在左）：点格子选中；电脑在格子里拖 = 画框；拖分隔线改尺寸
//   BlockPanel     —— 设定栏上半：格子设定 / 底座设定
// 拖拉写法同 MeasureTool.jsx：setPointerCapture，拖完存一步撤销；指针 → mm 用 svg.getScreenCTM().inverse()。
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Undo2, Redo2, RotateCcw, Scissors, Trash2, X, MousePointer2, Plus, Move } from 'lucide-react';
import { T } from '../../theme.js';
import { DOOR_SERIES, CARCASS_SERIES } from '../../constants/pricing.js';
import { LEAF_TYPES, BASE_KINDS, mmToM, ceilingOr } from '../../planner/model.js';
import { resolveSeries } from '../../planner/bridge.js';
import { frameTitle, cabinetWalls, addFrame, removeFrame, ADD_KINDS } from '../../planner/templates.js';
import { FRAME_KIND_NAME } from '../../planner/lang.js';
import {
  getNode, nodeBox, cutLines, leafAt, splitLeaf, carveRect, moveCut, resizeLeaf, canResize, removeLeaf, setLeaf, setBase,
  snap, MIN_BLOCK, moveFrame, resizeFrame, setFrameSize,
} from '../../planner/blocks.js';
import { elevationScene } from '../../render/elevation.js';
import { BLOCK_COLORS, BLOCK_SELECTED } from '../../render/palette.js';
import SvgShapes from '../../render/SvgShapes.jsx';
import { Section, Segmented, Stepper, MeterInput, Collapse, Tip, useBackClose } from './bits.jsx';
import { ShelfKindPicker } from './ShelfSettings.jsx';

// 空白柜子：spec 是总尺寸的来源 → 画框框里改了底座 / 柜体模式改了尺寸、离地，spec 跟着改（下次改尺寸才不会跳回去）
const syncBlank = (c) => {
  if (c.template !== 'blank') return c;
  const f = (c.frames || []).find((x) => !x.user);
  if (!f) return c;
  const spec = { ...c.spec, base: { ...f.base }, W: f.W, H: f.H, D: f.D };
  if (spec.kind === 'wall') spec.y = f.y;
  return { ...c, spec };
};
const solidFrames = (frames) => (frames || []).filter((f) => f.kind !== 'backdrop');
// 拖柜体时的吸附目标：同一面墙的其他柜体 + 楼高
const snapsFor = (frames, f, ceilingH) => ({ ceilingH: ceilingOr(ceilingH), others: (frames || []).filter((o) => o.id !== f.id && (o.wall || 0) === (f.wall || 0) && o.W > 0) });

const isPhone = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 1023px)').matches;
const parseSel = (s) => { if (!s) return null; const i = s.indexOf('|'); return { frameId: s.slice(0, i), path: s.slice(i + 1) }; };

// ============================================================
// 状态 + 动作
// ============================================================
export function useBlockEditor({ cab, setCab, kitchen = false, ceilingH = null }) {
  const [selected, setSelected] = useState(null); // 'frameId|path' 或 'frameId|base' 或（柜体模式）'frameId|frame'
  const [focus, setFocus] = useState(() => (solidFrames(cab.frames).length > 1 && isPhone() ? solidFrames(cab.frames)[0].id : 'all'));
  const [mode, setModeRaw] = useState('cells'); // 'cells' 格子 | 'boxes' 柜体（追加 2）
  const setMode = (m) => { setModeRaw(m); setSelected(null); if (m === 'boxes') setFocus('all'); };
  const [brush, setBrush] = useState('open');
  const hist = useRef({ undo: [], redo: [] });
  const [, bump] = useState(0);
  const cabRef = useRef(cab);
  cabRef.current = cab;

  const snapshot = (c) => ({ frames: c.frames, custom: !!c.custom, spec: c.spec, removedFrames: c.removedFrames }); // 含 spec：改模板设定也能撤销；含 removedFrames：删柜体也能撤销
  const push = (prev) => { hist.current.undo.push(prev); if (hist.current.undo.length > 100) hist.current.undo.shift(); hist.current.redo = []; bump((n) => n + 1); };

  // 改一个柜体：fn(frame) → 新 frame；没变就不存撤销
  const apply = useCallback((frameId, fn, { record = true } = {}) => {
    const c = cabRef.current;
    const f = (c.frames || []).find((x) => x.id === frameId);
    if (!f) return null;
    const g = fn(f);
    if (!g || g === f) return null;
    if (record) push(snapshot(c));
    const next = syncBlank({ ...c, frames: c.frames.map((x) => (x.id === frameId ? g : x)), custom: true });
    cabRef.current = next;
    setCab(() => next);
    return g;
  }, [setCab]);

  // 拖拉中：直接换掉（不存撤销）；拖完 commitDrag(start) 存一步
  const replaceFrames = useCallback((frames) => {
    const next = syncBlank({ ...cabRef.current, frames, custom: true });
    cabRef.current = next;
    setCab(() => next);
  }, [setCab]);
  const commitDrag = (start) => { if (start && start.frames !== cabRef.current.frames) push(start); };

  const restore = (s) => {
    const { custom: _c, removedFrames: _r, ...rest } = cabRef.current;
    const base = { ...rest, frames: s.frames, ...(s.spec ? { spec: s.spec } : {}), ...(s.removedFrames?.length ? { removedFrames: s.removedFrames } : {}) };
    const next = syncBlank(s.custom ? { ...base, custom: true } : base); // 没画过 → 不留 custom 键（关闭时才不会误问「还没保存」）
    cabRef.current = next;
    setCab(() => next);
  };
  const undo = () => { const s = hist.current.undo.pop(); if (!s) return; hist.current.redo.push(snapshot(cabRef.current)); restore(s); bump((n) => n + 1); };
  const redo = () => { const s = hist.current.redo.pop(); if (!s) return; hist.current.undo.push(snapshot(cabRef.current)); restore(s); bump((n) => n + 1); };
  const resetHistory = () => { hist.current = { undo: [], redo: [] }; bump((n) => n + 1); };
  // 整个柜子的改动（模板设定）：存一步撤销再换
  const applyCab = (fn) => { const c = cabRef.current; const next = fn(c); if (!next || next === c) return; push(snapshot(c)); cabRef.current = next; setCab(() => next); };
  // 「还原成模板」：也能撤销
  const restoreTemplate = (build) => { const c = cabRef.current; push(snapshot(c)); const next = build(c); cabRef.current = next; setCab(() => next); setSelected(null); };

  // 选中的格子还在不在（撤销 / 删格之后可能不见）
  const sel = parseSel(selected);
  const selFrame = sel ? (cab.frames || []).find((f) => f.id === sel.frameId) : null;
  const selNode = selFrame && sel.path !== 'base' && sel.path !== 'frame' ? getNode(selFrame.body, sel.path) : null;
  const valid = !!selFrame && (sel.path === 'base' || sel.path === 'frame' ? true : !!selNode?.leaf);
  useEffect(() => { if (selected && !valid) setSelected(null); }, [selected, valid]);
  // 看单一柜体时，那个柜体被删了（例：厨房改设定）→ 回到全部
  useEffect(() => { if (focus !== 'all' && !solidFrames(cab.frames).some((f) => f.id === focus)) setFocus(solidFrames(cab.frames)[0]?.id || 'all'); }, [cab.frames, focus]);

  const ops = {
    select: setSelected,
    split(dir) {
      if (!sel || !selNode) return;
      const box = nodeBox(selFrame, sel.path);
      const g = apply(sel.frameId, (f) => splitLeaf(f, sel.path, dir));
      if (g) setSelected(`${sel.frameId}|${leafAt(g, box.x + 1, box.y + 1)}`); // 切完选左边 / 下面那格
    },
    carve(frameId, path, rect) {
      const g = apply(frameId, (f) => carveRect(f, path, rect, { type: brush }));
      if (g) {
        const cx = Math.min(rect.x, rect.x + rect.w) + Math.abs(rect.w) / 2, cy = Math.min(rect.y, rect.y + rect.h) + Math.abs(rect.h) / 2;
        const p = leafAt(g, cx, cy);
        if (p != null) setSelected(`${frameId}|${p}`);
      }
    },
    setLeaf(patch) { if (sel && selNode) apply(sel.frameId, (f) => setLeaf(f, sel.path, patch, { kitchen })); },
    resize(axis, mm) { if (sel && selNode) apply(sel.frameId, (f) => resizeLeaf(f, sel.path, axis, mm)); },
    remove() {
      if (!sel || !selNode || sel.path === '') return;
      const box = nodeBox(selFrame, sel.path);
      const g = apply(sel.frameId, (f) => removeLeaf(f, sel.path));
      if (g) { const p = leafAt(g, box.x + box.w / 2, box.y + box.h / 2); setSelected(p != null ? `${sel.frameId}|${p}` : null); }
    },
    setBase(base) { if (sel) apply(sel.frameId, (f) => setBase(f, { ...f.base, ...base })); },
    // ---- 柜体模式（追加 2）----
    setFrame(patch) { if (sel) apply(sel.frameId, (f) => setFrameSize(f, patch)); },
    removeFrame() {
      if (!sel) return;
      applyCab((c) => syncBlank(removeFrame(c, sel.frameId)));
      setSelected(null);
    },
    addFrame(kind) {
      let id = null;
      applyCab((c) => { const r = addFrame(c, kind, { ceilingH }); id = r.id; return r.cab; });
      if (id) setSelected(`${id}|frame`);
    },
  };

  return {
    cab, selected: valid ? selected : null, sel: valid ? sel : null, selFrame: valid ? selFrame : null, selNode: valid ? selNode : null,
    focus, setFocus, brush, setBrush, ops, mode, setMode, ceilingH, apply, replaceFrames, commitDrag, restore, snapshot: () => snapshot(cabRef.current),
    undo, redo, applyCab, canUndo: hist.current.undo.length > 0, canRedo: hist.current.redo.length > 0, resetHistory, restoreTemplate, kitchen,
  };
}

// ============================================================
// 图
// ============================================================
export function BlockCanvas({ ed, lang = 'both', onRestore, canRestore }) {
  const { cab, focus, setFocus, selected, ops, mode } = ed;
  const boxes = mode === 'boxes';
  const svgRef = useRef(null);
  const [upp, setUpp] = useState(1);   // 1 屏幕 px = 多少 svg 单位（mm）
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const frames = cab.frames || [];

  // 只看一个柜体：放到墙 0、x 0，图放大来改
  const viewCab = useMemo(() => {
    if (focus === 'all') return cab;
    const f = frames.find((x) => x.id === focus);
    return f ? { ...cab, frames: [{ ...f, x: 0, wall: 0 }] } : cab;
  }, [cab, focus, frames]);
  const scene = useMemo(() => {
    try {
      const walls = focus === 'all' ? cabinetWalls(cab) : [{ ox: 0, oz: 0, angle: 0, len: viewCab.frames[0]?.W || 0 }];
      return elevationScene(viewCab, { style: 'blocks', dims: true, lang: lang === 'both' ? 'zh' : lang, walls, selected, sizes: true });
    } catch (e) { return null; }
  }, [viewCab, focus, cab, lang, selected]);
  const viewBox = drag?.vb || scene?.viewBox;

  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const measure = () => { const m = el.getScreenCTM && el.getScreenCTM(); if (m && m.a) setUpp(1 / m.a); };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scene?.viewBox?.join(' ')]);

  // 屏幕 → svg 坐标 → 某个柜体的柜身 mm（左下角为原点，y 向上）
  const toSvg = (e) => {
    const el = svgRef.current;
    const m = el?.getScreenCTM?.();
    if (!m) return null;
    const p = el.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(m.inverse());
    return { x: q.x, y: q.y };
  };
  const hitFrame = (sp) => {
    for (const fr of scene?.frames || []) {
      const f = frames.find((x) => x.id === fr.id);
      if (!f || f.kind === 'backdrop') continue; // 格子模式：电视墙不挡住后面的格子
      const bx = sp.x - fr.X0, by = -sp.y - fr.yb;
      if (bx >= 0 && bx <= fr.W) {
        if (by >= 0 && by <= fr.Hb) return { f, fr, bx, by, base: false };
        if (by < 0 && by >= -(f.base?.h || 0)) return { f, fr, bx, by, base: true };
      }
    }
    return null;
  };

  // 柜体模式：点到哪个柜体（整个外框，含底座）；电视墙最后才算
  const hitBox = (sp) => {
    const list = (scene?.frames || []).slice().sort((a, b) => (a.kind === 'backdrop') - (b.kind === 'backdrop'));
    for (const fr of list) {
      const f = frames.find((x) => x.id === fr.id);
      const bx = sp.x - fr.X0, by = -sp.y;
      if (f && bx >= 0 && bx <= fr.W && by >= fr.y && by <= fr.y + fr.H) return { f, fr };
    }
    return null;
  };
  const startBoxDrag = (e, kind, f, extra) => {
    const sp = toSvg(e);
    const d = { kind, id: e.pointerId, frameId: f.id, startFrame: f, start: ed.snapshot(), sp0: sp, vb: scene.viewBox, sx: e.clientX, sy: e.clientY, sel: `${f.id}|frame`, ...extra };
    dragRef.current = d; setDrag(d);
  };
  const onBoxDown = (e, sp) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const edgeEl = e.target?.closest?.('[data-edge]');
    const moveEl = e.target?.closest?.('[data-move]');
    if (edgeEl || moveEl) {
      const [frameId, edge] = (edgeEl || moveEl).getAttribute(edgeEl ? 'data-edge' : 'data-move').split('|');
      const f = frames.find((x) => x.id === frameId);
      if (f) startBoxDrag(e, edgeEl ? 'edge' : 'move', f, edgeEl ? { edge } : {});
      return;
    }
    const h = hitBox(sp);
    if (!h) { dragRef.current = { kind: 'none', id: e.pointerId }; return; }
    // 手指：只选（拖动用中间的移动把手）；滑鼠 / 笔：拖 = 移动
    if (e.pointerType === 'touch') { dragRef.current = { kind: 'tap', id: e.pointerId, sel: `${h.f.id}|frame` }; return; }
    startBoxDrag(e, 'maybeMove', h.f);
  };
  const onBoxMove = (e, d, sp) => {
    if (d.kind === 'maybeMove') { if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return; }
    const dx = snap(sp.x - d.sp0.x), dy = snap(-(sp.y - d.sp0.y));
    const snaps = snapsFor(d.start.frames, d.startFrame, ed.ceilingH);
    const g = d.kind === 'edge'
      ? resizeFrame(d.startFrame, d.edge, d.edge === 'left' || d.edge === 'right' ? dx : dy, snaps)
      : moveFrame(d.startFrame, dx, dy, snaps);
    const nd = { ...d, kind: d.kind === 'maybeMove' ? 'move' : d.kind, frame: g, moved: g !== d.startFrame };
    dragRef.current = nd; setDrag(nd);
    if (g === d.startFrame) ed.restore(d.start);
    else ed.replaceFrames(d.start.frames.map((x) => (x.id === d.frameId ? g : x)));
    if (!selected || selected !== d.sel) ops.select(d.sel);
  };

  const onPointerDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    const sp = toSvg(e);
    if (!sp || !scene) return;
    if (boxes) { onBoxDown(e, sp); return; }
    const cutEl = e.target?.closest?.('[data-cut]');
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (cutEl) {
      const [frameId, path, k] = cutEl.getAttribute('data-cut').split('|');
      const f = frames.find((x) => x.id === frameId);
      const line = f && cutLines(f).find((l) => l.path === path && String(l.k) === k);
      if (!line) return;
      const h0 = hitFrame(sp);
      const tapSel = h0 && !h0.base ? `${h0.f.id}|${leafAt(h0.f, h0.bx, h0.by)}` : null;
      const d = { kind: 'line', id: e.pointerId, frameId, line, start: ed.snapshot(), startFrame: f, vb: scene.viewBox, fr: scene.frames.find((x) => x.id === frameId), cur: line.pos, tapSel };
      dragRef.current = d; setDrag(d);
      return;
    }
    const h = hitFrame(sp);
    if (!h) { dragRef.current = { kind: 'none', id: e.pointerId }; return; }
    if (h.base) { dragRef.current = { kind: 'tap', id: e.pointerId, sel: `${h.f.id}|base`, sx: e.clientX, sy: e.clientY }; return; }
    const path = leafAt(h.f, h.bx, h.by);
    const tap = { kind: 'tap', id: e.pointerId, sel: `${h.f.id}|${path}`, sx: e.clientX, sy: e.clientY };
    // 手指：只选格子，拖不会画框（免得误画）；滑鼠 / 笔：拖 = 画框
    if (e.pointerType === 'touch' || path == null) { dragRef.current = tap; return; }
    dragRef.current = { ...tap, kind: 'maybeRect', frameId: h.f.id, path, x0: h.bx, y0: h.by, fr: h.fr, vb: scene.viewBox };
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const sp = toSvg(e);
    if (!sp) return;
    if (d.kind === 'move' || d.kind === 'maybeMove' || d.kind === 'edge') { onBoxMove(e, d, sp); return; }
    if (d.kind === 'line') {
      const { line, fr, startFrame } = d;
      const raw = line.dir === 'v' ? sp.x - fr.X0 : -sp.y - fr.yb;
      const pos = snap(raw);
      const g = moveCut(startFrame, line.path, line.k, pos - line.pos);
      const nd = { ...d, cur: g === startFrame ? line.pos : pos, frame: g };
      dragRef.current = nd; setDrag(nd);
      // 拖回原位 / 没动 → 还原成按下时的样子（不留 custom、不存撤销）
      if (g === startFrame) ed.restore(d.start);
      else ed.replaceFrames(d.start.frames.map((x) => (x.id === d.frameId ? g : x)));
      return;
    }
    if (d.kind === 'maybeRect' || d.kind === 'rect') {
      const moved = Math.hypot(e.clientX - d.sx, e.clientY - d.sy);
      if (d.kind === 'maybeRect' && moved < 6) return;
      const box = nodeBox(frames.find((x) => x.id === d.frameId), d.path);
      if (!box) return;
      const x1 = Math.min(box.x + box.w, Math.max(box.x, sp.x - d.fr.X0));
      const y1 = Math.min(box.y + box.h, Math.max(box.y, -sp.y - d.fr.yb));
      const nd = { ...d, kind: 'rect', x1, y1 };
      dragRef.current = nd; setDrag(nd);
    }
  };

  const onPointerUp = (e) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null; setDrag(null);
    if (d.kind === 'move' || d.kind === 'edge' || d.kind === 'maybeMove') {
      if (d.moved) ed.commitDrag(d.start); else if (d.frame) ed.restore(d.start);
      ops.select(d.sel);
      return;
    }
    if (d.kind === 'line') {
      if (d.cur === d.line.pos) { ed.restore(d.start); if (d.tapSel) ops.select(d.tapSel); return; } // 没拖动 = 点了线旁边那格
      ed.commitDrag(d.start); return;
    }
    if (d.kind === 'rect') { ops.carve(d.frameId, d.path, { x: d.x0, y: d.y0, w: d.x1 - d.x0, h: d.y1 - d.y0 }); return; }
    if (d.kind === 'tap' || d.kind === 'maybeRect') ops.select(d.sel); // 再点同一格不会取消（取消：✕ / Esc / 返回键 / 点空白处）
    if (d.kind === 'none') ops.select(null);
  };
  const onPointerCancel = (e) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null; setDrag(null);
    if (d.kind === 'line') { if (d.cur === d.line.pos) ed.restore(d.start); else ed.commitDrag(d.start); }
    if (d.kind === 'move' || d.kind === 'edge') { if (d.moved) ed.commitDrag(d.start); else if (d.frame) ed.restore(d.start); }
  };

  // 分隔线把手：透明、粗（手指 24 px、滑鼠 10 px），touch-action:none
  const handles = useMemo(() => {
    if (!scene || boxes) return [];
    const coarse = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const sw = (coarse ? 24 : 10) * upp;
    return (scene.frames || []).flatMap((fr) => {
      const f = frames.find((x) => x.id === fr.id);
      if (!f) return [];
      return cutLines(f).map((l) => {
        const ln = l.dir === 'v'
          ? { x1: fr.X0 + l.pos, x2: fr.X0 + l.pos, y1: -(fr.yb + l.from), y2: -(fr.yb + l.to) }
          : { x1: fr.X0 + l.from, x2: fr.X0 + l.to, y1: -(fr.yb + l.pos), y2: -(fr.yb + l.pos) };
        return { key: `${f.id}|${l.path}|${l.k}`, ln, sw, dir: l.dir };
      });
    });
  }, [scene, frames, upp, boxes]);

  // 柜体模式：选中的柜体画四边把手 + 中间的移动把手（手指拖这里）
  const coarse = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const selBox = boxes && selected?.endsWith('|frame') ? (scene?.frames || []).find((fr) => `${fr.id}|frame` === selected) : null;
  let boxHandles = null;
  if (selBox) {
    const { X0, W, y, H, id } = selBox;
    const x0 = X0, x1 = X0 + W, yT = -(y + H), yB = -y;
    const hw = (coarse ? 26 : 12) * upp;
    const grip = (coarse ? 9 : 6) * upp;
    const edges = [
      ['left', { x1: x0, x2: x0, y1: yT, y2: yB }, 'ew-resize', [x0, (yT + yB) / 2]],
      ['right', { x1: x1, x2: x1, y1: yT, y2: yB }, 'ew-resize', [x1, (yT + yB) / 2]],
      ['top', { x1: x0, x2: x1, y1: yT, y2: yT }, 'ns-resize', [(x0 + x1) / 2, yT]],
      ['bottom', { x1: x0, x2: x1, y1: yB, y2: yB }, 'ns-resize', [(x0 + x1) / 2, yB]],
    ];
    const r = Math.min((coarse ? 22 : 15) * upp, W / 3, H / 3);
    boxHandles = (
      <g>
        {edges.map(([edge, ln, cursor, [gx, gy]]) => (
          <g key={edge} data-edge={`${id}|${edge}`} style={{ touchAction: 'none', cursor }}>
            <line {...ln} stroke="#000" strokeOpacity={0} strokeWidth={hw} />
            <rect x={gx - grip} y={gy - grip} width={grip * 2} height={grip * 2} fill="#fff" stroke={BLOCK_SELECTED} strokeWidth={2 * upp} />
          </g>
        ))}
        {r > 4 * upp && (
          <g data-move={`${id}|move`} style={{ touchAction: 'none', cursor: 'move' }}>
            <circle cx={(x0 + x1) / 2} cy={(yT + yB) / 2} r={r} fill={BLOCK_SELECTED} fillOpacity={0.9} stroke="#fff" strokeWidth={2 * upp} />
            <path d={`M ${(x0 + x1) / 2 - r * 0.55} ${(yT + yB) / 2} H ${(x0 + x1) / 2 + r * 0.55} M ${(x0 + x1) / 2} ${(yT + yB) / 2 - r * 0.55} V ${(yT + yB) / 2 + r * 0.55}`} stroke="#fff" strokeWidth={2.2 * upp} strokeLinecap="round" />
          </g>
        )}
      </g>
    );
  }

  const fs = 12 * upp;
  let overlay = null;
  if (drag?.kind === 'rect') {
    const x = drag.fr.X0 + Math.min(drag.x0, drag.x1), y = -(drag.fr.yb + Math.max(drag.y0, drag.y1));
    const w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
    overlay = (
      <g pointerEvents="none">
        <rect x={x} y={y} width={w} height={h} fill={BLOCK_COLORS[ed.brush] || BLOCK_COLORS.open} fillOpacity={0.6} stroke={BLOCK_SELECTED} strokeWidth={2 * upp} strokeDasharray={`${6 * upp} ${4 * upp}`} />
        <text x={x + w / 2} y={y + h / 2} fontSize={fs} textAnchor="middle" dominantBaseline="central" fill={T.ink} fontWeight={700}>{snap(w)}×{snap(h)}</text>
      </g>
    );
  } else if ((drag?.kind === 'move' || drag?.kind === 'edge') && drag.frame) {
    // 浮标：移动 → 离地 / 离墙边；改大小 → 宽 / 高
    const f = drag.frame;
    const fr = scene?.frames?.find((x) => x.id === f.id);
    if (fr) {
      const txt = drag.kind === 'move' ? `离地 ${Math.round(f.y)} · ←${Math.round(f.x)}`
        : drag.edge === 'left' || drag.edge === 'right' ? `宽 W ${Math.round(f.W)}` : `高 H ${Math.round(f.H)} · 顶 ${Math.round(f.y + f.H)}`;
      const px = fr.X0 + fr.W / 2, py = -(fr.y + fr.H) - 16 * upp;
      const w = Math.max(90, txt.length * 8) * upp;
      overlay = (
        <g pointerEvents="none" data-drag-label>
          <rect x={px - w / 2} y={py - 11 * upp} width={w} height={22 * upp} rx={3 * upp} fill={T.ink} />
          <text x={px} y={py} fontSize={fs} textAnchor="middle" dominantBaseline="central" fill="#fff" fontWeight={700}>{txt}</text>
        </g>
      );
    }
  } else if (drag?.kind === 'line' && drag.frame) {
    const { line, fr, frame } = drag;
    const n = getNode(frame.body, line.path);
    const a = n?.sizes?.[line.k - 1], b = n?.sizes?.[line.k];
    const mid = (line.from + line.to) / 2;
    const px = line.dir === 'v' ? fr.X0 + drag.cur : fr.X0 + mid, py = line.dir === 'v' ? -(fr.yb + mid) : -(fr.yb + drag.cur);
    overlay = (
      <g pointerEvents="none">
        {line.dir === 'v'
          ? <line x1={px} x2={px} y1={-(fr.yb + line.from)} y2={-(fr.yb + line.to)} stroke={BLOCK_SELECTED} strokeWidth={3 * upp} />
          : <line x1={fr.X0 + line.from} x2={fr.X0 + line.to} y1={py} y2={py} stroke={BLOCK_SELECTED} strokeWidth={3 * upp} />}
        <rect x={px - 46 * upp} y={py - 11 * upp} width={92 * upp} height={22 * upp} rx={3 * upp} fill={T.ink} />
        <text x={px} y={py} fontSize={fs} textAnchor="middle" dominantBaseline="central" fill="#fff" fontWeight={700}>{a} | {b}</text>
      </g>
    );
  }

  return (
    <div className="h-full flex flex-col" data-block-canvas>
      <div className="flex items-center gap-1.5 px-2 pt-2 flex-wrap">
        <div data-mode><Segmented size="sm" value={mode} onChange={ed.setMode}
          options={[{ id: 'cells', label: '格子 Blocks' }, { id: 'boxes', label: '柜体 Boxes' }]} /></div>
        {!boxes && solidFrames(frames).length > 1 && (
          <select value={focus} onChange={(e) => { setFocus(e.target.value); ops.select(null); }} data-focus
            className="text-xs px-1.5 py-1.5 outline-none max-w-[46%]" style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 2, color: T.ink }}>
            <option value="all">全部 All</option>
            {solidFrames(frames).filter((f) => f.W > 0).map((f) => <option key={f.id} value={f.id}>{frameTitle(cab, f, 'zh')}</option>)}
          </select>
        )}
        <div className="ml-auto flex items-center gap-1">
          <IconBtn title="Undo 撤销 (Ctrl+Z)" disabled={!ed.canUndo} onClick={ed.undo} data-undo><Undo2 size={15} /></IconBtn>
          <IconBtn title="Redo 重做 (Ctrl+Shift+Z)" disabled={!ed.canRedo} onClick={ed.redo} data-redo><Redo2 size={15} /></IconBtn>
          {canRestore && <IconBtn title="Back to template 还原成模板" onClick={onRestore} data-restore><RotateCcw size={15} /><span className="text-[11px] ml-1 hidden sm:inline">还原成模板</span></IconBtn>}
        </div>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-2" style={{ background: '#fff' }}>
        {scene && (
          <SvgShapes scene={scene} viewBox={viewBox} svgRef={svgRef} title={cab.code} style={{ width: '100%', height: '100%', touchAction: 'manipulation', userSelect: 'none', cursor: 'crosshair' }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
            {handles.map((h) => (
              <line key={h.key} data-cut={h.key} {...h.ln} stroke="#000" strokeOpacity={0} strokeWidth={h.sw}
                style={{ touchAction: 'none', cursor: h.dir === 'v' ? 'ew-resize' : 'ns-resize' }} />
            ))}
            {boxHandles}
            {overlay}
          </SvgShapes>
        )}
      </div>
      <div className="px-3 py-1.5 text-[10px] leading-snug" style={{ color: T.inkSoft }}>
        {boxes ? (<>
        <span className="hidden lg:inline">点柜体选中 · 拖动 = 移动（会贴齐地面 / 楼高 / 别的柜体）· 拖四边改大小 — Click a box · drag to move · drag an edge to resize</span>
        <span className="lg:hidden">点柜体选中，拖中间的圆点移动、拖四边改大小 — Tap a box, drag the dot to move, edges to resize</span>
        </>) : (<>
        <span className="hidden lg:inline">点格子选中 · 在格子里拖出框框 · 拖分隔线改尺寸 · Delete 删格 · Ctrl+Z 撤销 — Click a block · drag inside to draw · drag a line to resize</span>
        <span className="lg:hidden">点一格来改，分隔线可以拖 — Tap a block to edit, drag a line to resize</span>
        </>)}
      </div>
    </div>
  );
}

function IconBtn({ children, disabled, onClick, title, ...rest }) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} {...rest}
      className="flex items-center px-2 py-1.5 disabled:opacity-30" style={{ border: `1px solid ${T.line}`, borderRadius: 2, background: T.paper, color: T.ink }}>
      {children}
    </button>
  );
}

// 键盘：Delete 删格；Ctrl+Z 撤销；Ctrl+Shift+Z / Ctrl+Y 重做；Esc 取消选中（打字时不管）
export function useBlockKeys(ed, on) {
  const ref = useRef(ed);
  ref.current = ed;
  useEffect(() => {
    if (!on) return undefined;
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
      const x = ref.current;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) x.redo(); else x.undo(); }
      else if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); x.redo(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && x.sel && x.sel.path === 'frame') { e.preventDefault(); x.ops.removeFrame(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && x.sel && x.sel.path !== 'base') { e.preventDefault(); x.ops.remove(); }
      else if (e.key === 'Escape' && x.selected) { e.preventDefault(); x.ops.select(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on]);
}

// ============================================================
// 设定栏上半
// ============================================================
const INTERIORS = [
  { id: 'shelves', label: '层板 Shelves' },
  { id: 'rod', label: '挂衣杆 Rod' },
  { id: '', label: '空 Empty' },
];
const swatch = (type) => (
  <span className="inline-block w-3 h-3 mr-1.5 align-[-1px]" style={{ background: BLOCK_COLORS[type], border: `1px solid ${T.ink}`, borderRadius: 1 }} />
);

export function BlockPanel({ ed, defaults }) {
  const { sel, selNode } = ed;
  if (ed.mode === 'boxes') return sel?.path === 'frame' ? <BoxPanel ed={ed} /> : <BoxIdle ed={ed} />;
  if (!sel) {
    return (
      <Section title="Blocks 画框框">
        <div className="text-sm mb-2" style={{ color: T.ink }}>
          <MousePointer2 size={14} className="inline mr-1 -mt-0.5" style={{ color: T.wood }} />
          点一格来改 Tap a block to edit it
        </div>
        <div className="hidden lg:block">
          <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>Brush 画笔（拖出的框框用这种）</div>
          <div className="flex flex-wrap gap-1.5" data-brush>
            {LEAF_TYPES.map((tp) => {
              const on = ed.brush === tp.id;
              return (
                <button key={tp.id} type="button" onClick={() => ed.setBrush(tp.id)} className="px-2 py-1.5 text-xs"
                  style={{ borderRadius: 2, background: on ? T.ink : T.paper, color: on ? T.paper : T.ink, border: `1px solid ${on ? T.ink : T.line}` }}>
                  {swatch(tp.id)}{tp.zh}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-2"><Tip>Click the bottom strip to change the base 点最下面那条改底座</Tip></div>
      </Section>
    );
  }
  if (sel.path === 'base') return <BasePanel ed={ed} />;
  if (!selNode) return null;
  return <CellPanel ed={ed} defaults={defaults} />;
}

function PanelHead({ title, onClose }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      <div className="text-[11px] uppercase tracking-widest" style={{ color: T.inkSoft }}>{title}</div>
      <button type="button" onClick={onClose} className="p-1 -mr-1" title="Close 关闭" aria-label="Close 关闭" style={{ color: T.inkSoft }}><X size={16} /></button>
    </div>
  );
}

function CellPanel({ ed, defaults }) {
  const { cab, sel, selFrame, selNode, ops } = ed;
  useBackClose(() => ops.select(null)); // 手机返回键：先关格子设定栏
  const box = nodeBox(selFrame, sel.path);
  const cabSer = resolveSeries(cab, defaults);
  const own = selNode.series || {};
  const type = selNode.type || 'closed';
  const canW = canResize(selFrame, sel.path, 'x'), canH = canResize(selFrame, sel.path, 'y');
  const many = (cab.frames || []).length > 1;
  return (
    <section className="py-3" data-cell-panel style={{ borderTop: `1px solid ${T.lineSoft}` }}>
      <PanelHead title={<>Block 格子 · <span className="normal-case tracking-normal" data-cell-size>{box.w} × {box.h} mm</span>{many ? ` · ${frameTitle(cab, selFrame, 'zh')}` : ''}</>} onClose={() => ops.select(null)} />

      <div className="flex flex-wrap gap-1.5 mb-3" data-cell-type>
        {LEAF_TYPES.map((tp) => {
          const on = type === tp.id;
          return (
            <button key={tp.id} type="button" data-type={tp.id} onClick={() => ops.setLeaf({ type: tp.id })} className="px-2 py-1.5 text-xs"
              style={{ borderRadius: 2, background: on ? T.ink : BLOCK_COLORS[tp.id], color: on ? T.paper : T.ink, border: `1px solid ${on ? T.ink : T.line}` }}>
              {tp.zh}<span className="block text-[9px] opacity-75">{tp.en}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <button type="button" data-split="v" onClick={() => ops.split('v')} disabled={box.w < MIN_BLOCK * 2}
          className="flex items-center justify-center gap-1.5 py-2.5 text-sm disabled:opacity-30" style={{ border: `1px solid ${T.line}`, borderRadius: 2, background: T.paper, color: T.ink }}>
          <Scissors size={14} className="rotate-90" /> 竖切一刀 <span className="text-[10px] opacity-70">Split ↔</span>
        </button>
        <button type="button" data-split="h" onClick={() => ops.split('h')} disabled={box.h < MIN_BLOCK * 2}
          className="flex items-center justify-center gap-1.5 py-2.5 text-sm disabled:opacity-30" style={{ border: `1px solid ${T.line}`, borderRadius: 2, background: T.paper, color: T.ink }}>
          <Scissors size={14} /> 横切一刀 <span className="text-[10px] opacity-70">Split ↕</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-1">
        {canW ? <MeterInput label="Width 宽" mm={box.w} onChange={(mm) => ops.resize('x', mm)} />
          : <Fixed label="Width 宽" mm={box.w} />}
        {canH ? <MeterInput label="Height 高" mm={box.h} onChange={(mm) => ops.resize('y', mm)} />
          : <Fixed label="Height 高" mm={box.h} />}
      </div>
      <div className="text-[10px] mb-3" style={{ color: T.inkSoft }}>差额由右边 / 上面那格吸收 The block to the right / above takes the difference</div>

      {type === 'drawer' && (
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <Stepper value={selNode.drawers || 1} min={1} max={12} onChange={(drawers) => ops.setLeaf({ drawers })} suffix="抽" />
          <Segmented size="sm" value={selNode.drawerKind === 'full' ? 'full' : 'half'} onChange={(drawerKind) => ops.setLeaf({ drawerKind })}
            options={[{ id: 'half', label: '半展 Half' }, { id: 'full', label: '全展 Full' }]} />
        </div>
      )}

      {type === 'shelf' && (
        <div className="mb-3">
          <div className="flex items-center gap-3 mb-2">
            <Stepper value={selNode.shelves || 1} min={1} max={20} onChange={(shelves) => ops.setLeaf({ shelves })} suffix="块" />
            <span className="text-[10px]" style={{ color: T.inkSoft }}>每块在自己那一段的顶上 Each board sits at the top of its band</span>
          </div>
          <ShelfKindPicker value={selNode.shelfKind || 'if25'} onChange={(shelfKind) => ops.setLeaf({ shelfKind })} />
        </div>
      )}

      {type !== 'drawer' && type !== 'void' && type !== 'shelf' && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>Inside 里面（只影响图）</div>
          <Segmented size="sm" value={INTERIORS.some((o) => o.id === (selNode.interior || '')) ? (selNode.interior || '') : null}
            onChange={(interior) => ops.setLeaf({ interior })} options={INTERIORS} />
        </div>
      )}

      {type !== 'void' && (
        <div className="mb-3" data-cell-series>
          <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>Series 系列（这一格）</div>
          <div className="flex flex-wrap gap-1.5">
            <SerBtn on={!own.door} onClick={() => ops.setLeaf({ series: { ...own, door: null } })} data-series="">跟柜子（{cabSer.door}）</SerBtn>
            {DOOR_SERIES.map((L) => <SerBtn key={L} on={own.door === L} onClick={() => ops.setLeaf({ series: { ...own, door: L } })} data-series={L}>{L}</SerBtn>)}
          </div>
          {type !== 'open' && type !== 'shelf' && (
            <Collapse title={`Carcass 柜体：${own.carcass || `跟柜子 ${cabSer.carcass}`}`}>
              <div className="flex flex-wrap gap-1.5">
                <SerBtn on={!own.carcass} onClick={() => ops.setLeaf({ series: { ...own, carcass: null } })}>跟柜子（{cabSer.carcass}）</SerBtn>
                {CARCASS_SERIES.map((L) => <SerBtn key={L} on={own.carcass === L} onClick={() => ops.setLeaf({ series: { ...own, carcass: L } })}>{L}</SerBtn>)}
              </div>
            </Collapse>
          )}
          {type === 'open' && <Tip>Open shelves use this door series 开放格跟这格的门板系列</Tip>}
          {type === 'shelf' && <Tip>Floating shelves are priced per board by this door series 飘板按这格的门板系列、每块分档计价</Tip>}
        </div>
      )}

      <button type="button" data-remove onClick={ops.remove} disabled={sel.path === ''}
        className="flex items-center gap-1.5 text-xs py-1.5 disabled:opacity-30" style={{ color: T.terra }}>
        <Trash2 size={13} /> 删掉这格 Delete block
      </button>
    </section>
  );
}

function Fixed({ label, mm }) {
  return (
    <div>
      <span className="block text-[10px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>{label}</span>
      <div className="px-3 py-2.5 text-base" style={{ color: T.inkSoft, background: T.cream, border: `1px solid ${T.lineSoft}`, borderRadius: 2 }}>
        {mmToM(mm)} m <span className="text-[10px]">· 整个柜子 full</span>
      </div>
    </div>
  );
}

function SerBtn({ on, children, onClick, ...rest }) {
  return (
    <button type="button" onClick={onClick} {...rest} className="px-2.5 py-1.5 text-xs"
      style={{ borderRadius: 2, background: on ? T.ink : T.paper, color: on ? T.paper : T.ink, border: `1px solid ${on ? T.ink : T.line}` }}>
      {children}
    </button>
  );
}

function BasePanel({ ed }) {
  const { selFrame, ops } = ed;
  useBackClose(() => ops.select(null));
  const b = selFrame.base || { kind: 'none', h: 0 };
  const hasH = b.kind === 'plinth' || b.kind === 'legs' || b.kind === 'raised';
  return (
    <section className="py-3" data-base-panel style={{ borderTop: `1px solid ${T.lineSoft}` }}>
      <PanelHead title="Base 底座" onClose={() => ops.select(null)} />
      <Segmented value={b.kind} onChange={(kind) => ops.setBase({ kind, h: BASE_KINDS.find((k) => k.id === kind)?.h })}
        options={BASE_KINDS.map((k) => ({ id: k.id, label: k.zh, sub: k.en }))} />
      {hasH && <div className="w-32 mt-3"><MeterInput label="Height 高" mm={b.h} onChange={(h) => ops.setBase({ h })} /></div>}
      <div className="mt-2"><Tip>Priced at total height, merged into the lowest block 按总高算，并入最下面那格</Tip></div>
    </section>
  );
}

// ============================================================
// 柜体模式（追加 2）：设定栏
// ============================================================
function BoxIdle({ ed }) {
  return (
    <Section title="Boxes 柜体">
      <div className="text-sm mb-3" style={{ color: T.ink }}>
        <MousePointer2 size={14} className="inline mr-1 -mt-0.5" style={{ color: T.wood }} />
        点一个柜体来移动 / 改大小 Tap a box to move or resize it
      </div>
      <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>Add 加柜体</div>
      <div className="grid grid-cols-2 gap-1.5" data-add-frame>
        {ADD_KINDS.map((k) => (
          <button key={k.id} type="button" data-add={k.id} onClick={() => ed.ops.addFrame(k.id)}
            className="flex items-center justify-center gap-1 py-2.5 text-sm" style={{ border: `1px solid ${T.line}`, borderRadius: 2, background: T.paper, color: T.ink }}>
            <Plus size={14} /> {k.zh} <span className="text-[10px] opacity-70">{k.en}</span>
          </button>
        ))}
      </div>
      <div className="mt-2"><Tip>Position doesn't change the price 位置不影响价钱；尺寸照常计价</Tip></div>
    </Section>
  );
}

function BoxPanel({ ed }) {
  const { cab, selFrame: f, ops } = ed;
  useBackClose(() => ops.select(null));
  const backdrop = f.kind === 'backdrop';
  const b = f.base || { kind: 'none', h: 0 };
  const hasH = b.kind === 'plinth' || b.kind === 'legs' || b.kind === 'raised';
  const kindName = FRAME_KIND_NAME[f.kind] || FRAME_KIND_NAME.tall;
  return (
    <section className="py-3" data-box-panel style={{ borderTop: `1px solid ${T.lineSoft}` }}>
      <PanelHead title={<><Move size={12} className="inline -mt-0.5 mr-1" />{frameTitle(cab, f, 'zh')} · <span className="normal-case tracking-normal">{kindName.zh} {kindName.en}</span></>} onClose={() => ops.select(null)} />
      <div className="grid grid-cols-2 gap-2 mb-2">
        <MeterInput label="Off floor 离地" mm={f.y} min={-1} onChange={(y) => ops.setFrame({ y })} />
        <MeterInput label="From left 离左边" mm={f.x} min={-1} onChange={(x) => ops.setFrame({ x })} />
        <MeterInput label="Width 宽" mm={f.W} onChange={(W) => ops.setFrame({ W })} />
        <MeterInput label="Height 高" mm={f.H} onChange={(H) => ops.setFrame({ H })} />
        {!backdrop && <MeterInput label="Depth 深" mm={f.D} onChange={(D) => ops.setFrame({ D })} />}
      </div>
      <div className="text-[10px] mb-3" style={{ color: T.inkSoft }} data-box-top>顶 Top {mmToM(f.y + f.H)} m · 格子由右边 / 上面吸收 The right / top blocks take the difference</div>
      {!backdrop && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>Base 底座</div>
          <Segmented size="sm" value={b.kind} onChange={(kind) => ops.setBase({ kind, h: BASE_KINDS.find((k) => k.id === kind)?.h })}
            options={BASE_KINDS.map((k) => ({ id: k.id, label: k.zh }))} />
          {hasH && <div className="w-32 mt-2"><MeterInput label="Height 高" mm={b.h} onChange={(h) => ops.setBase({ h })} /></div>}
        </div>
      )}
      <button type="button" data-remove-frame onClick={ops.removeFrame}
        className="flex items-center gap-1.5 text-xs py-1.5" style={{ color: T.terra }}>
        <Trash2 size={13} /> 删掉这个柜体 Delete box
      </button>
    </section>
  );
}
