// 平面图编辑器：上传底图（图片 / PDF）→ AI 识别（选填）→ 拉方块画房间、点墙放门窗 → 生成 3D。
// 单位：米。0.05m 吸附；房间边会吸到附近房间的边上（墙线才干净）。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ROOM_TYPES, OPENING_KINDS, TEMPLATES, buildWalls, bounds, checkPlan, snapPlan, templatePlan, uid } from './model.js';
import { planFileToImage } from './planImage.js';
import { detectPlan } from './ai.js';
import { loadSettings } from '../store.js';

const SNAP = 0.05;
const snap = (v) => Math.round(v / SNAP) * SNAP;
const r2 = (v) => Math.round(v * 100) / 100;

const TOOLS = [
  { id: 'select', zh: '选择 / 移动', key: 'v', icon: '↖' },
  { id: 'room', zh: '画房间', key: 'r', icon: '▭' },
  { id: 'door', zh: '门', key: 'd', icon: '🚪' },
  { id: 'window', zh: '窗', key: 'w', icon: '🪟' },
  { id: 'slider', zh: '落地趟门', key: 's', icon: '⇆' },
  { id: 'open', zh: '打通', key: 'o', icon: '⋯' },
  { id: 'calibrate', zh: '量尺校准', key: 'c', icon: '📏' },
  { id: 'underlay', zh: '移动底图', key: 'u', icon: '✋' },
];

function edgesOf(rooms) {
  const out = [];
  for (const r of rooms) {
    out.push({ axis: 'x', c: r.y, a: r.x, b: r.x + r.w });
    out.push({ axis: 'x', c: r.y + r.d, a: r.x, b: r.x + r.w });
    out.push({ axis: 'z', c: r.x, a: r.y, b: r.y + r.d });
    out.push({ axis: 'z', c: r.x + r.w, a: r.y, b: r.y + r.d });
  }
  return out;
}

function nearestEdge(rooms, p, maxD) {
  let best = null;
  for (const e of edgesOf(rooms)) {
    const along = e.axis === 'x' ? p.x : p.y;
    const perp = e.axis === 'x' ? p.y : p.x;
    if (along < e.a - 0.1 || along > e.b + 0.1) continue;
    const d = Math.abs(perp - e.c);
    if (d <= maxD && (!best || d < best.d)) best = { ...e, d, along: Math.max(e.a, Math.min(e.b, along)) };
  }
  return best;
}

export default function PlanEditor({ initial, underlay: initialUnderlay, autoUpload, onCancel, onApply, onSettings }) {
  const [plan, setPlan] = useState(() => initial);
  const [underlay, setUnderlay] = useState(initialUnderlay || null);
  const [tool, setTool] = useState(initial.rooms.length ? 'select' : 'room');
  const [sel, setSel] = useState(null);
  const [view, setView] = useState({ s: 50, ox: 80, oy: 80 });
  const [preview, setPreview] = useState(null);
  const [calib, setCalib] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [widthHint, setWidthHint] = useState('');
  const svgRef = useRef(null);
  const fileRef = useRef(null);
  const drag = useRef(null);
  const imageRef = useRef(null);

  const walls = useMemo(() => buildWalls(plan), [plan]);
  const issues = useMemo(() => checkPlan(plan), [plan]);

  const fit = useCallback(
    (p = plan, u = underlay) => {
      const el = svgRef.current;
      if (!el) return;
      const W = el.clientWidth;
      const H = el.clientHeight;
      let bb = p.rooms.length ? bounds(p) : null;
      if (u) {
        const ub = { x0: u.x, y0: u.y, x1: u.x + u.w, y1: u.y + u.h };
        bb = bb ? { x0: Math.min(bb.x0, ub.x0), y0: Math.min(bb.y0, ub.y0), x1: Math.max(bb.x1, ub.x1), y1: Math.max(bb.y1, ub.y1) } : ub;
      }
      if (!bb) bb = { x0: 0, y0: 0, x1: 12, y1: 9 };
      const s = Math.min((W - 80) / (bb.x1 - bb.x0), (H - 80) / (bb.y1 - bb.y0));
      setView({ s, ox: (W - (bb.x1 - bb.x0) * s) / 2 - bb.x0 * s, oy: (H - (bb.y1 - bb.y0) * s) / 2 - bb.y0 * s });
    },
    [plan, underlay]
  );

  useEffect(() => {
    fit();
    if (autoUpload) setTimeout(() => fileRef.current?.click(), 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toM = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.ox) / view.s, y: (e.clientY - r.top - view.oy) / view.s };
  };

  const updateRoom = (id, patch) => setPlan((p) => ({ ...p, rooms: p.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const updateOpening = (id, patch) => setPlan((p) => ({ ...p, openings: p.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));

  const snapEdges = (vals, others, tol = 0.15) => {
    let best = null;
    for (const v of vals)
      for (const o of others) {
        const d = o - v;
        if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best))) best = d;
      }
    return best || 0;
  };

  // ── 上传 + AI ──
  const onFile = async (file) => {
    if (!file) return;
    setBusy('读取平面图…');
    setMsg('');
    try {
      const img = await planFileToImage(file);
      imageRef.current = img;
      const w = Number(widthHint) || 12;
      const u = { src: img.src, x: 0, y: 0, w, h: (w * img.height) / img.width, opacity: 0.55, iw: img.width, ih: img.height };
      setUnderlay(u);
      setTimeout(() => fit(plan, u), 30);
      const s = loadSettings();
      if (s.apiKey && !plan.rooms.length) await runAI(img);
      else setMsg(s.apiKey ? '底图已放好。可以按「AI 识别」，或直接拉方块描房间。' : '底图已放好。用「画房间」沿着墙描一遍；先用 📏 量尺校准比例会更准。（设置里填 Gemini key 就能 AI 自动识别）');
    } catch (e) {
      setMsg(`读不出来：${e.message || e}`);
    } finally {
      setBusy('');
    }
  };

  const runAI = async (img = imageRef.current) => {
    const im = img || (underlay && { src: underlay.src, width: underlay.iw || 1600, height: underlay.ih || 1200 });
    if (!im) return setMsg('先上传一张平面图。');
    const s = loadSettings();
    if (!s.apiKey) {
      setMsg('需要先在设置里填 Gemini API key。');
      onSettings?.();
      return;
    }
    setBusy('AI 正在看图（约 10–30 秒）…');
    try {
      const { plan: p, underlay: u, info } = await detectPlan(s, im, { widthM: Number(widthHint) || undefined });
      const next = { ...plan, rooms: p.rooms, openings: p.openings };
      setPlan(next);
      setUnderlay({ ...u, iw: im.width, ih: im.height });
      setTool('select');
      setTimeout(() => fit(next, u), 30);
      setMsg(`识别到 ${info.rooms} 个房间、${info.openings} 个门窗（整体宽约 ${info.widthM}m${info.fromDims ? '，读自图上尺寸' : '，按你填的 / 估算'}）。请对一下：拖动房间边缘校正，再按「生成 3D」。`);
    } catch (e) {
      setMsg(e.message || String(e));
    } finally {
      setBusy('');
    }
  };

  // ── 指针 ──
  const onDown = (e) => {
    if (e.button === 1 || e.button === 2) {
      drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy };
      return;
    }
    const p = toM(e);
    svgRef.current.setPointerCapture?.(e.pointerId);
    const target = e.target.closest('[data-kind]');
    if (tool === 'select') {
      if (target?.dataset.kind === 'handle') {
        const r = plan.rooms.find((x) => x.id === target.dataset.id);
        drag.current = { kind: 'resize', id: r.id, h: target.dataset.h, start: p, orig: { ...r } };
      } else if (target?.dataset.kind === 'opening') {
        const o = plan.openings.find((x) => x.id === target.dataset.id);
        setSel({ type: 'opening', id: o.id });
        drag.current = { kind: 'moveOpening', id: o.id, start: p, orig: { ...o } };
      } else if (target?.dataset.kind === 'room') {
        const r = plan.rooms.find((x) => x.id === target.dataset.id);
        setSel({ type: 'room', id: r.id });
        drag.current = { kind: 'moveRoom', id: r.id, start: p, orig: { ...r } };
      } else {
        setSel(null);
        drag.current = { kind: 'pan', x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy };
      }
    } else if (tool === 'room') {
      drag.current = { kind: 'draw', start: { x: snap(p.x), y: snap(p.y) } };
      setPreview({ x: snap(p.x), y: snap(p.y), w: 0, d: 0 });
    } else if (['door', 'window', 'slider', 'open'].includes(tool)) {
      if (preview?.opening) {
        const o = { id: uid('o'), kind: tool, ...preview.opening };
        setPlan((pl) => ({ ...pl, openings: [...pl.openings, o] }));
        setSel({ type: 'opening', id: o.id });
      }
    } else if (tool === 'calibrate') {
      if (!calib || calib.p2) setCalib({ p1: p, p2: null, len: '' });
      else setCalib({ ...calib, p2: p });
    } else if (tool === 'underlay' && underlay) {
      drag.current = { kind: 'underlay', start: p, orig: { ...underlay } };
    }
  };

  const onMove = (e) => {
    const p = toM(e);
    const d = drag.current;
    if (!d) {
      if (['door', 'window', 'slider', 'open'].includes(tool)) {
        const edge = nearestEdge(plan.rooms, p, 22 / view.s);
        if (edge) {
          const k = OPENING_KINDS[tool];
          const w = Math.min(k.width, edge.b - edge.a);
          const c = Math.max(edge.a + w / 2, Math.min(edge.b - w / 2, snap(edge.along)));
          const opening = edge.axis === 'x' ? { x1: r2(c - w / 2), x2: r2(c + w / 2), y1: edge.c, y2: edge.c } : { x1: edge.c, x2: edge.c, y1: r2(c - w / 2), y2: r2(c + w / 2) };
          setPreview({ opening });
        } else setPreview(null);
      } else if (tool === 'calibrate' && calib?.p1 && !calib.p2) setPreview({ calibTo: p });
      return;
    }
    if (d.kind === 'pan') setView((v) => ({ ...v, ox: d.ox + e.clientX - d.x, oy: d.oy + e.clientY - d.y }));
    else if (d.kind === 'draw') {
      const x0 = d.start.x;
      const y0 = d.start.y;
      const x1 = snap(p.x);
      const y1 = snap(p.y);
      setPreview({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), d: Math.abs(y1 - y0) });
    } else if (d.kind === 'moveRoom') {
      let x = snap(d.orig.x + p.x - d.start.x);
      let y = snap(d.orig.y + p.y - d.start.y);
      const others = plan.rooms.filter((r) => r.id !== d.id);
      x += snapEdges([x, x + d.orig.w], others.flatMap((r) => [r.x, r.x + r.w]));
      y += snapEdges([y, y + d.orig.d], others.flatMap((r) => [r.y, r.y + r.d]));
      updateRoom(d.id, { x: r2(x), y: r2(y) });
    } else if (d.kind === 'resize') {
      const o = d.orig;
      let { x, y, w, d: dd } = o;
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      const others = plan.rooms.filter((r) => r.id !== d.id);
      const xs = others.flatMap((r) => [r.x, r.x + r.w]);
      const ys = others.flatMap((r) => [r.y, r.y + r.d]);
      if (d.h.includes('w')) {
        let nx = snap(o.x + dx);
        nx += snapEdges([nx], xs);
        w = o.x + o.w - nx;
        x = nx;
      }
      if (d.h.includes('e')) {
        let ne = snap(o.x + o.w + dx);
        ne += snapEdges([ne], xs);
        w = ne - o.x;
      }
      if (d.h.includes('n')) {
        let ny = snap(o.y + dy);
        ny += snapEdges([ny], ys);
        dd = o.y + o.d - ny;
        y = ny;
      }
      if (d.h.includes('s')) {
        let ns = snap(o.y + o.d + dy);
        ns += snapEdges([ns], ys);
        dd = ns - o.y;
      }
      if (w >= 0.6 && dd >= 0.6) updateRoom(d.id, { x: r2(x), y: r2(y), w: r2(w), d: r2(dd) });
    } else if (d.kind === 'moveOpening') {
      const o = d.orig;
      const horiz = Math.abs(o.y1 - o.y2) < 0.01;
      const delta = snap(horiz ? p.x - d.start.x : p.y - d.start.y);
      if (horiz) updateOpening(d.id, { x1: r2(o.x1 + delta), x2: r2(o.x2 + delta) });
      else updateOpening(d.id, { y1: r2(o.y1 + delta), y2: r2(o.y2 + delta) });
    } else if (d.kind === 'underlay') {
      setUnderlay((u) => ({ ...u, x: d.orig.x + p.x - d.start.x, y: d.orig.y + p.y - d.start.y }));
    }
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'draw' && preview && preview.w >= 0.6 && preview.d >= 0.6) {
      const type = plan.rooms.length === 0 ? 'living' : 'bedroom';
      const r = { id: uid('r'), type, name: ROOM_TYPES[type].zh, x: r2(preview.x), y: r2(preview.y), w: r2(preview.w), d: r2(preview.d) };
      setPlan((p) => ({ ...p, rooms: [...p.rooms, r] }));
      setSel({ type: 'room', id: r.id });
    }
    if (d?.kind === 'draw') setPreview(null);
  };

  const onWheel = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const k = Math.exp(-e.deltaY * 0.0015);
    setView((v) => {
      const s = Math.max(8, Math.min(400, v.s * k));
      return { s, ox: mx - ((mx - v.ox) * s) / v.s, oy: my - ((my - v.oy) * s) / v.s };
    });
  };

  useEffect(() => {
    const el = svgRef.current;
    const prevent = (e) => e.preventDefault();
    el.addEventListener('wheel', prevent, { passive: false });
    el.addEventListener('contextmenu', prevent);
    return () => {
      el.removeEventListener('wheel', prevent);
      el.removeEventListener('contextmenu', prevent);
    };
  }, []);

  const removeSel = useCallback(() => {
    if (!sel) return;
    if (sel.type === 'room') setPlan((p) => ({ ...p, rooms: p.rooms.filter((r) => r.id !== sel.id) }));
    else setPlan((p) => ({ ...p, openings: p.openings.filter((o) => o.id !== sel.id) }));
    setSel(null);
  }, [sel]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input,select,textarea')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') removeSel();
      else if (e.key === 'Escape') {
        setSel(null);
        setCalib(null);
        setPreview(null);
      } else {
        const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
        if (t) setTool(t.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [removeSel]);

  const applyCalibration = () => {
    if (!calib?.p1 || !calib?.p2 || !underlay) return;
    const real = Number(calib.len);
    const meas = Math.hypot(calib.p2.x - calib.p1.x, calib.p2.y - calib.p1.y);
    if (!real || !meas) return;
    const f = real / meas;
    const p1 = calib.p1;
    setUnderlay((u) => ({ ...u, x: p1.x + (u.x - p1.x) * f, y: p1.y + (u.y - p1.y) * f, w: u.w * f, h: u.h * f }));
    setCalib(null);
    setPreview(null);
    setMsg(`底图比例已校准（×${f.toFixed(3)}）。`);
  };

  const room = sel?.type === 'room' && plan.rooms.find((r) => r.id === sel.id);
  const opening = sel?.type === 'opening' && plan.openings.find((o) => o.id === sel.id);
  const sw = 1 / view.s;

  // 网格
  const grid = useMemo(() => {
    const el = svgRef.current;
    if (!el) return null;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const step = view.s < 20 ? 1 : 0.5;
    const x0 = Math.floor(-view.ox / view.s / step) * step;
    const x1 = (W - view.ox) / view.s;
    const y0 = Math.floor(-view.oy / view.s / step) * step;
    const y1 = (H - view.oy) / view.s;
    const lines = [];
    for (let x = x0; x <= x1; x += step) lines.push(<line key={`x${x.toFixed(2)}`} x1={x} y1={y0} x2={x} y2={y1} className={Math.abs(x % 1) < 0.01 ? 'g1' : 'g2'} strokeWidth={sw} />);
    for (let y = y0; y <= y1; y += step) lines.push(<line key={`y${y.toFixed(2)}`} x1={x0} y1={y} x2={x1} y2={y} className={Math.abs(y % 1) < 0.01 ? 'g1' : 'g2'} strokeWidth={sw} />);
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  return (
    <div className="pe">
      <header className="pe-head">
        <div className="pe-title">
          <b>平面图</b>
          <span>拉方块 = 房间 · 点墙 = 门窗 · 拖边 = 改尺寸</span>
        </div>
        <div className="pe-head-actions">
          <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button type="button" className="pe-btn" onClick={() => fileRef.current?.click()}>
            📐 上传平面图
          </button>
          <label className="pe-hint-in" title="平面图的整体外墙宽度（米），AI 读不到尺寸时用">
            整体宽
            <input value={widthHint} onChange={(e) => setWidthHint(e.target.value.replace(/[^\d.]/g, ''))} placeholder="12" inputMode="decimal" />m
          </label>
          <button type="button" className="pe-btn ai" onClick={() => runAI()} disabled={!!busy}>
            ✨ AI 识别
          </button>
          <select
            className="pe-btn"
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              const p = templatePlan(e.target.value);
              setPlan({ ...plan, rooms: p.rooms, openings: p.openings, wallH: p.wallH, north: p.north, name: p.name });
              setTimeout(() => fit(p, underlay), 20);
            }}
          >
            <option value="">用模板…</option>
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.zh}
              </option>
            ))}
          </select>
          <button type="button" className="pe-btn" onClick={() => fit()}>
            ⤢ 全图
          </button>
        </div>
        <div className="pe-head-right">
          <button type="button" className="pe-btn ghost" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="pe-btn gold" disabled={!plan.rooms.length} onClick={() => onApply(snapPlan(plan, 0.06), underlay)}>
            生成 3D ✨
          </button>
        </div>
      </header>

      <div className="pe-body">
        <nav className="pe-tools">
          {TOOLS.map((t) => (
            <button key={t.id} type="button" className={tool === t.id ? 'on' : ''} onClick={() => (setTool(t.id), setPreview(null), setCalib(null))} title={`${t.zh}（${t.key.toUpperCase()}）`} disabled={(t.id === 'calibrate' || t.id === 'underlay') && !underlay}>
              <span>{t.icon}</span>
              <em>{t.zh}</em>
            </button>
          ))}
        </nav>

        <div className="pe-canvas">
          <svg ref={svgRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => !drag.current && setPreview((p) => (p?.opening ? null : p))} onWheel={onWheel} className={`tool-${tool}`}>
            <g transform={`translate(${view.ox},${view.oy}) scale(${view.s})`}>
              <g className="grid">{grid}</g>
              {underlay && <image href={underlay.src} x={underlay.x} y={underlay.y} width={underlay.w} height={underlay.h} opacity={underlay.opacity ?? 0.55} preserveAspectRatio="none" />}
              {plan.rooms.map((r) => (
                <g key={r.id}>
                  <rect data-kind="room" data-id={r.id} x={r.x} y={r.y} width={r.w} height={r.d} fill={ROOM_TYPES[r.type]?.color || '#ddd'} className={`pe-room ${room?.id === r.id ? 'on' : ''}`} strokeWidth={sw * (room?.id === r.id ? 2.5 : 1)} />
                  <text x={r.x + r.w / 2} y={r.y + r.d / 2} fontSize={Math.min(14 * sw, r.w / 5)} textAnchor="middle" className="pe-label">
                    {r.name}
                  </text>
                  <text x={r.x + r.w / 2} y={r.y + r.d / 2 + 16 * sw} fontSize={Math.min(11 * sw, r.w / 6)} textAnchor="middle" className="pe-dim">
                    {r.w.toFixed(2)} × {r.d.toFixed(2)} m
                  </text>
                </g>
              ))}
              {/* 墙 + 门窗（由房间自动生成） */}
              {walls.map((w) =>
                w.pieces.map((p, i) => {
                  const [x1, y1, x2, y2] = w.axis === 'x' ? [p.a, w.c, p.b, w.c] : [w.c, p.a, w.c, p.b];
                  return <line key={`${w.id}-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} className={`pe-wall k-${p.kind}`} strokeWidth={p.kind === 'solid' ? w.t : p.kind === 'open' ? 2 * sw : w.t * 0.6} pointerEvents="none" />;
                })
              )}
              {plan.openings.map((o) => (
                <line key={o.id} data-kind="opening" data-id={o.id} x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} className={`pe-open-hit ${opening?.id === o.id ? 'on' : ''}`} strokeWidth={Math.max(0.25, 14 * sw)} />
              ))}
              {room &&
                ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((h) => {
                  const cx = h.includes('w') ? room.x : h.includes('e') ? room.x + room.w : room.x + room.w / 2;
                  const cy = h.includes('n') ? room.y : h.includes('s') ? room.y + room.d : room.y + room.d / 2;
                  return <rect key={h} data-kind="handle" data-id={room.id} data-h={h} x={cx - 6 * sw} y={cy - 6 * sw} width={12 * sw} height={12 * sw} className="pe-handle" strokeWidth={sw * 1.5} />;
                })}
              {preview && preview.w != null && <rect x={preview.x} y={preview.y} width={preview.w} height={preview.d} className="pe-preview" strokeWidth={sw * 2} />}
              {preview?.opening && <line x1={preview.opening.x1} y1={preview.opening.y1} x2={preview.opening.x2} y2={preview.opening.y2} className={`pe-open-prev k-${tool}`} strokeWidth={10 * sw} />}
              {calib?.p1 && <line x1={calib.p1.x} y1={calib.p1.y} x2={(calib.p2 || preview?.calibTo || calib.p1).x} y2={(calib.p2 || preview?.calibTo || calib.p1).y} className="pe-calib" strokeWidth={3 * sw} />}
            </g>
          </svg>
          <div className="pe-zoom">
            <button type="button" onClick={() => setView((v) => ({ ...v, s: Math.min(400, v.s * 1.25) }))}>
              ＋
            </button>
            <button type="button" onClick={() => setView((v) => ({ ...v, s: Math.max(8, v.s / 1.25) }))}>
              －
            </button>
          </div>
          {busy && (
            <div className="pe-busy">
              <div className="boot-ring" />
              <p>{busy}</p>
            </div>
          )}
          {calib?.p2 && (
            <div className="pe-calib-box">
              这段的真实长度是
              <input autoFocus value={calib.len} onChange={(e) => setCalib({ ...calib, len: e.target.value.replace(/[^\d.]/g, '') })} onKeyDown={(e) => e.key === 'Enter' && applyCalibration()} placeholder="3.6" inputMode="decimal" />
              米
              <button type="button" className="pe-btn gold" onClick={applyCalibration}>
                校准
              </button>
            </div>
          )}
        </div>

        <aside className="pe-side">
          {msg && <p className="pe-msg">{msg}</p>}
          {room ? (
            <div className="pe-insp">
              <h4>房间</h4>
              <div className="pe-types">
                {Object.entries(ROOM_TYPES).map(([k, t]) => (
                  <button key={k} type="button" className={room.type === k ? 'on' : ''} style={{ '--c': t.color }} onClick={() => updateRoom(room.id, { type: k, name: room.name === ROOM_TYPES[room.type]?.zh ? t.zh : room.name })}>
                    {t.zh}
                  </button>
                ))}
              </div>
              <label>
                名字
                <input value={room.name} onChange={(e) => updateRoom(room.id, { name: e.target.value })} />
              </label>
              <div className="pe-nums">
                {[
                  ['x', 'X'],
                  ['y', 'Y'],
                  ['w', '宽'],
                  ['d', '深'],
                ].map(([k, l]) => (
                  <label key={k}>
                    {l}
                    <input type="number" step="0.05" value={room[k]} onChange={(e) => updateRoom(room.id, { [k]: Math.max(k === 'w' || k === 'd' ? 0.6 : -99, Number(e.target.value)) })} />
                  </label>
                ))}
              </div>
              <button type="button" className="pe-btn danger" onClick={removeSel}>
                删除房间
              </button>
            </div>
          ) : opening ? (
            <div className="pe-insp">
              <h4>门窗</h4>
              <div className="pe-types">
                {Object.entries(OPENING_KINDS).map(([k, t]) => (
                  <button key={k} type="button" className={opening.kind === k ? 'on' : ''} onClick={() => updateOpening(opening.id, { kind: k })}>
                    {t.zh}
                  </button>
                ))}
              </div>
              <label>
                宽度（m）
                <input
                  type="number"
                  step="0.05"
                  value={r2(Math.hypot(opening.x2 - opening.x1, opening.y2 - opening.y1))}
                  onChange={(e) => {
                    const w = Math.max(0.3, Number(e.target.value));
                    const horiz = Math.abs(opening.y1 - opening.y2) < 0.01;
                    const c = horiz ? (opening.x1 + opening.x2) / 2 : (opening.y1 + opening.y2) / 2;
                    updateOpening(opening.id, horiz ? { x1: r2(c - w / 2), x2: r2(c + w / 2) } : { y1: r2(c - w / 2), y2: r2(c + w / 2) });
                  }}
                />
              </label>
              {(opening.kind === 'window' || opening.kind === 'slider') && (
                <div className="pe-nums">
                  <label>
                    窗台高
                    <input type="number" step="0.05" value={opening.sill ?? OPENING_KINDS[opening.kind].sill} onChange={(e) => updateOpening(opening.id, { sill: Number(e.target.value) })} />
                  </label>
                  <label>
                    窗顶高
                    <input type="number" step="0.05" value={opening.head ?? OPENING_KINDS[opening.kind].head} onChange={(e) => updateOpening(opening.id, { head: Number(e.target.value) })} />
                  </label>
                </div>
              )}
              <button type="button" className="pe-btn danger" onClick={removeSel}>
                删除
              </button>
            </div>
          ) : (
            <div className="pe-insp">
              <h4>整体</h4>
              <label>
                方案名
                <input value={plan.name || ''} onChange={(e) => setPlan({ ...plan, name: e.target.value })} />
              </label>
              <div className="pe-nums">
                <label>
                  层高（m）
                  <input type="number" step="0.05" min="2.4" max="4" value={plan.wallH} onChange={(e) => setPlan({ ...plan, wallH: Math.max(2.4, Math.min(4, Number(e.target.value))) })} />
                </label>
                <label title="平面图上方是北 = 0°；顺时针转">
                  北方（°）
                  <input type="number" step="15" value={plan.north || 0} onChange={(e) => setPlan({ ...plan, north: ((Number(e.target.value) % 360) + 360) % 360 })} />
                </label>
              </div>
              <div className="pe-compass" style={{ transform: `rotate(${plan.north || 0}deg)` }}>
                <span>N</span>
              </div>
              {underlay && (
                <label>
                  底图透明度
                  <input type="range" min="0" max="1" step="0.05" value={underlay.opacity ?? 0.55} onChange={(e) => setUnderlay({ ...underlay, opacity: Number(e.target.value) })} />
                </label>
              )}
              <ul className="pe-howto">
                <li>
                  <b>画房间</b>：按住拖出方块；边会自动吸到旁边房间的边上。
                </li>
                <li>
                  <b>门 / 窗</b>：选工具后把鼠标移到墙上，出现金色预览就点一下。
                </li>
                <li>
                  <b>打通</b>：两个空间之间不要墙（开放式厨房）。客厅 / 餐厅 / 玄关 / 走廊之间默认已打通。
                </li>
                <li>
                  <b>北方</b>：决定阳光从哪边进来（西晒看得出来）。
                </li>
              </ul>
              {issues.length > 0 && (
                <div className="pe-issues">
                  {issues.map((t, i) => (
                    <p key={i}>⚠️ {t}</p>
                  ))}
                </div>
              )}
            </div>
          )}
          <p className="pe-stat">
            {plan.rooms.length} 个房间 · {plan.openings.length} 个门窗 · {walls.length} 段墙
          </p>
        </aside>
      </div>
    </div>
  );
}

