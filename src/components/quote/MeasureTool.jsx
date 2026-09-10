import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Ruler, RotateCcw, Trash2, Plus, CornerDownRight, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Eraser } from 'lucide-react';
import { T } from '../../theme.js';
import { CABINET_TYPES } from '../../constants/pricing.js';

// 量尺单位 → 换算成米（报价内部一律用米）。寸 = 英寸 2.54cm（马来西亚木工常用）。
const UNITS = [
  { id: 'mm', label: 'mm 毫米', toM: 0.001 },
  { id: 'cm', label: 'cm 厘米', toM: 0.01 },
  { id: 'm', label: 'm 米', toM: 1 },
  { id: 'ft', label: 'feet 尺', toM: 0.3048 },
  { id: 'in', label: '寸 (inch)', toM: 0.0254 },
];

// ============================================================
// Ukur 量尺 —— 上传图纸 → 划线校准比例 → 划线量尺 → 直接加入报价
// 全程浏览器本地运行；坐标用图片原始像素，缩放/换窗不影响比例。
// 量尺支持多段折线：连续点转角（L 型柜），整条折线 = 一个柜体项目（长度累加）。
// ============================================================
export default function MeasureTool({ zones = [], onAddItems, onClose }) {
  const [img, setImg] = useState(null);        // { src, w, h }
  const [pxPerM, setPxPerM] = useState(0);      // 原始像素/米（0=未校准）
  const [pending, setPending] = useState(null); // 校准起点 {x,y}（原始坐标）
  const [calib, setCalib] = useState(null);     // 校准线 {a,b}
  const [askMeters, setAskMeters] = useState(''); // 校准输入框
  const [draft, setDraft] = useState([]);       // 当前正在画的折线点 [{x,y}...]
  const [lines, setLines] = useState([]);       // 量尺结果 [{id,pts:[{x,y}],name,len}]
  const [targetZone, setTargetZone] = useState(zones[0]?.id || '__new');
  const [newZoneName, setNewZoneName] = useState('');
  const [cabKind, setCabKind] = useState('base');
  const [unit, setUnitState] = useState(() => {
    try { const v = localStorage.getItem('sail.ukur.unit'); if (UNITS.some((x) => x.id === v)) return v; } catch { /* ignore */ }
    return 'm';
  });
  const setUnit = (v) => {
    setUnitState(v);
    setLines((ls) => ls.map((l) => (l.manualTxt != null ? { ...l, manualTxt: null } : l))); // 换单位后按米值重新显示
    try { localStorage.setItem('sail.ukur.unit', v); } catch { /* ignore */ }
  };
  const [zoom, setZoom] = useState(1);          // 放大倍数（点线更精准）
  // 撤销/重做历史（快照可回退的部分：校准 + 量尺线 + 草稿）
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [calibM, setCalibM] = useState(0);      // 校准时输入的米数（拖校准端点后可重算比例）
  const [snapOrtho, setSnapOrtho] = useState(true); // 自动拉直成水平/垂直
  const [snapEdge, setSnapEdge] = useState(true);   // 自动吸到图上的墙线（深色线）
  const imgRef = useRef(null);
  const canvasRef = useRef(null);               // 离屏画布：取像素做吸附
  const dragRef = useRef(null);                 // 正在拖的端点 {kind:'line'|'draft'|'calib', id, idx}

  const u = UNITS.find((x) => x.id === unit) || UNITS[2];
  const toDisp = (m) => m / u.toM;                          // 米 → 当前单位
  const fmtLen = (m) => `${toDisp(m).toFixed(u.id === 'm' ? 2 : u.id === 'cm' ? 1 : 0)}${u.id === 'in' ? '"' : u.id === 'ft' ? "'" : u.id}`;

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const pathPx = (pts) => pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1], p) : 0), 0);
  const pathM = (pts) => (pxPerM > 0 ? pathPx(pts) / pxPerM : 0);   // 长度由点+比例现算，重新校准后自动更新
  // 有效长度：手动填了准确尺寸就用手动值（手机画不准时直接打数字），否则按图算
  const effM = (l) => (l.manualM != null && l.manualM > 0 ? l.manualM : pathM(l.pts));
  const centroid = (pts) => ({
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  });

  // 记录快照 → 支持撤销。任何会改动测量的动作前调用。
  const snapshot = () => ({ pxPerM, calibM, calib, pending, draft, lines });
  const commit = () => { setPast((p) => [...p.slice(-99), snapshot()]); setFuture([]); };
  const restore = (s) => { setPxPerM(s.pxPerM); setCalibM(s.calibM ?? 0); setCalib(s.calib); setPending(s.pending); setDraft(s.draft); setLines(s.lines); };
  const undo = () => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [snapshot(), ...f]);
      restore(prev);
      return p.slice(0, -1);
    });
  };
  const redo = () => {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setPast((p) => [...p, snapshot()]);
      restore(next);
      return f.slice(1);
    });
  };

  const loadImage = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const im = new Image();
      im.onload = () => {
        // 离屏画布存原图像素，供「吸附墙线」取样
        try {
          const cv = document.createElement('canvas');
          cv.width = im.naturalWidth; cv.height = im.naturalHeight;
          cv.getContext('2d', { willReadFrequently: true }).drawImage(im, 0, 0);
          canvasRef.current = cv;
        } catch { canvasRef.current = null; }
        setImg({ src: e.target.result, w: im.naturalWidth, h: im.naturalHeight });
        setPxPerM(0); setCalibM(0); setCalib(null); setLines([]); setPending(null); setDraft([]);
        setPast([]); setFuture([]); setZoom(1);
      };
      im.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };
  // 已有测量时换图 → 提醒会清空
  const onFile = (file) => {
    if (!file) return;
    if ((lines.length || calib) && !window.confirm('换图会清空当前的校准和所有量尺，确定？')) return;
    loadImage(file);
  };

  // 点击图片 → 原始坐标
  const pointAt = (e) => {
    const r = imgRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (img.w / r.width),
      y: (e.clientY - r.top) * (img.h / r.height),
    };
  };

  // ---- 吸附：让手机上随手点也准 ----
  // 吸附墙线：在点击处小窗口内找最深色的像素（墙线通常是深色），把点吸过去
  const edgeSnap = (p) => {
    const cv = canvasRef.current;
    if (!snapEdge || !cv || !img) return p;
    const r = Math.max(6, Math.round(img.w / 90));
    const x0 = Math.max(0, Math.round(p.x) - r), y0 = Math.max(0, Math.round(p.y) - r);
    const w = Math.min(img.w - x0, 2 * r + 1), h = Math.min(img.h - y0, 2 * r + 1);
    if (w <= 0 || h <= 0) return p;
    let data;
    try { data = cv.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, w, h).data; } catch { return p; }
    const lum = new Float32Array(w * h);
    let min = 255, max = 0;
    for (let i = 0; i < w * h; i++) {
      const L = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      lum[i] = L; if (L < min) min = L; if (L > max) max = L;
    }
    if (max - min < 40) return p; // 附近没有明显线条，不吸
    const thr = min + 0.35 * (max - min);
    let best = null, bd = Infinity;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (lum[y * w + x] > thr) continue;
      const px = x0 + x, py = y0 + y;
      const d = (px - p.x) ** 2 + (py - p.y) ** 2;
      if (d < bd) { bd = d; best = { x: px, y: py }; }
    }
    return best || p;
  };
  // 直角吸附：与上一点接近水平/垂直（±8°）就拉直
  const orthoSnap = (p, prev) => {
    if (!snapOrtho || !prev) return p;
    const dx = p.x - prev.x, dy = p.y - prev.y, t = Math.tan((8 * Math.PI) / 180);
    if (Math.abs(dy) <= Math.abs(dx) * t) return { x: p.x, y: prev.y };
    if (Math.abs(dx) <= Math.abs(dy) * t) return { x: prev.x, y: p.y };
    return p;
  };
  const snapPoint = (p, prev) => orthoSnap(edgeSnap(p), prev);

  const handleClick = (e) => {
    if (!img) return;
    const p = pointAt(e);
    if (pxPerM <= 0) {
      // 校准：两点一条线
      commit();
      if (!pending) { setPending(edgeSnap(p)); return; }
      setCalib({ a: pending, b: snapPoint(p, pending) });
      setPending(null);
      setAskMeters('');
    } else {
      // 量尺：连续点转角，累加成一条折线（忽略与上一点几乎重合的误点）
      const prev = draft.length ? draft[draft.length - 1] : null;
      const q = snapPoint(p, prev);
      if (prev && dist(prev, q) < img.w / 400) return;
      commit();
      setDraft((d) => [...d, q]);
    }
  };

  // ---- 拖动端点微调（校准线 / 量尺线 / 草稿点）----
  const startDrag = (kind, id, idx) => (e) => {
    e.stopPropagation(); e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    commit();
    dragRef.current = { kind, id, idx };
  };
  const moveDrag = (e) => {
    const d = dragRef.current;
    if (!d || !img) return;
    e.stopPropagation(); e.preventDefault();
    let prev = null;
    if (d.kind === 'line') { const l = lines.find((x) => x.id === d.id); prev = l?.pts[d.idx - 1] ?? l?.pts[d.idx + 1] ?? null; }
    else if (d.kind === 'draft') prev = draft[d.idx - 1] ?? draft[d.idx + 1] ?? null;
    else if (d.kind === 'calib') prev = d.idx === 0 ? calib?.b : calib?.a;
    const p = snapPoint(pointAt(e), prev);
    if (d.kind === 'line') setLines((ls) => ls.map((l) => (l.id === d.id ? { ...l, pts: l.pts.map((q, j) => (j === d.idx ? p : q)) } : l)));
    else if (d.kind === 'draft') setDraft((ds) => ds.map((q, j) => (j === d.idx ? p : q)));
    else if (d.kind === 'calib') setCalib((c) => ({ ...c, [d.idx === 0 ? 'a' : 'b']: p }));
  };
  const endDrag = (e) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    dragRef.current = null;
  };
  // 拖了校准端点 → 按原来输入的米数重算比例
  useEffect(() => {
    if (pxPerM > 0 && calibM > 0 && calib) setPxPerM(dist(calib.a, calib.b) / calibM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calib]);
  // 用普通函数而不是子组件：保证拖动中 <circle> 元素不被重建（否则 pointer capture 会丢）
  // 大圈半透明（手指按的区域）+ 中间小实心点（真正的位置），这样看得到线头对没对准
  const handle = (key, p, r, fill, kind, id, idx) => (
    <g key={key}>
      <circle cx={p.x} cy={p.y} r={r} fill={fill} fillOpacity={0.18} stroke={fill} strokeOpacity={0.6} strokeWidth={sw * 0.5}
        style={{ touchAction: 'none', cursor: 'move' }}
        onPointerDown={startDrag(kind, id, idx)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
        onClick={(e) => e.stopPropagation()} />
      <circle cx={p.x} cy={p.y} r={sw * 0.9} fill={fill} stroke="#fff" strokeWidth={sw * 0.35} style={{ pointerEvents: 'none' }} />
    </g>
  );

  const finishDraft = () => {
    if (draft.length < 2) return;
    commit();
    const pts = draft;
    setLines((ls) => [...ls, { id: 'm' + Date.now(), pts, name: '', kind: cabKind }]);
    setDraft([]);
  };
  const undoPoint = () => { if (!draft.length) return; commit(); setDraft((d) => d.slice(0, -1)); };
  const cancelDraft = () => { if (!draft.length) return; commit(); setDraft([]); };
  const setLineKind = (id, kind) => { commit(); setLines((ls) => ls.map((l) => (l.id === id ? { ...l, kind } : l))); };

  const applyCalibration = () => {
    const v = parseFloat(askMeters);
    if (!calib || !(v > 0)) return;
    const meters = v * u.toM;                    // 输入值按当前单位换成米
    commit();
    setCalibM(meters);
    setPxPerM(dist(calib.a, calib.b) / meters);
  };

  const recalibrate = () => { commit(); setPxPerM(0); setCalib(null); setPending(null); setAskMeters(''); setDraft([]); };
  const removeLine = (id) => { commit(); setLines((ls) => ls.filter((l) => l.id !== id)); };
  const renameLine = (id, name) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, name } : l)));
  const clearAll = () => { if (!lines.length) return; if (!window.confirm('清空全部量尺？校准保留。')) return; commit(); setLines([]); setDraft([]); };

  // 屏幕像素 → 原图像素的比例：让线宽/字号/端点在手机、桌面、放大后都保持同样的「屏幕大小」
  const [natPerPx, setNatPerPx] = useState(1);
  useEffect(() => {
    const el = imgRef.current;
    if (!el || !img) return;
    const upd = () => { const w = el.getBoundingClientRect().width; if (w > 0) setNatPerPx(img.w / w); };
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, [img, zoom]);
  const sw = 2 * natPerPx;    // 线宽 ≈ 2 屏幕像素
  const fs = 11 * natPerPx;   // 字号 ≈ 11 屏幕像素
  const hr = 11 * natPerPx;   // 端点半径 ≈ 11 屏幕像素（手指点得到）
  const draftLenM = pathM(draft);
  const total = lines.reduce((a, l) => a + effM(l), 0);
  // manualTxt 保留用户原始输入（避免打 "2." 时被格式化吃掉小数点）；manualM 存米
  const setManual = (id, v) => {
    const n = parseFloat(v);
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, manualTxt: v, manualM: n > 0 ? n * u.toM : null } : l)));
  };
  const clearManual = (id) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, manualM: null, manualTxt: null } : l)));
  const dispLen = (l) => (l.manualTxt != null && l.manualM != null ? l.manualTxt : Number(toDisp(effM(l)).toFixed(u.id === 'm' ? 2 : u.id === 'cm' ? 1 : 0)));
  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  // 键盘：Ctrl/Cmd+Z 撤销、Ctrl+Shift+Z / Ctrl+Y 重做、Enter 完成、Esc 取消当前段
  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); }
      else if (e.key === 'Enter' && draft.length >= 2) { e.preventDefault(); finishDraft(); }
      else if (e.key === 'Escape') { if (draft.length) { e.preventDefault(); cancelDraft(); } else if (pending) { e.preventDefault(); setPending(null); } }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const addToQuote = () => {
    if (!lines.length) return;
    const measures = lines.map((l) => ({ length: Math.round(effM(l) * 100) / 100, name: l.name, kind: l.kind || cabKind }));
    onAddItems({ zoneId: targetZone, newZoneName: newZoneName.trim(), kind: cabKind, measures });
    onClose();
  };

  const ptsStr = (pts) => pts.map((p) => `${p.x},${p.y}`).join(' ');

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-auto no-print" style={{ background: 'rgba(45,62,54,0.9)' }} onClick={onClose}>
      <div className="min-h-screen flex items-start justify-center p-3 lg:p-6">
        <div className="w-full max-w-6xl my-2" style={{ background: T.paper, borderRadius: 4 }} onClick={(e) => e.stopPropagation()}>

          {/* header */}
          <div className="flex items-center justify-between p-4" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
            <div className="flex items-center gap-2">
              <Ruler size={18} style={{ color: T.wood }} />
              <span className="font-display text-xl" style={{ color: T.ink }}>Ukur 量尺</span>
              <span className="text-xs" style={{ color: T.inkSoft }}>上传图 → 校准 → 量尺 → 加入报价</span>
            </div>
            <button onClick={onClose} style={{ color: T.inkSoft }}><X size={18} /></button>
          </div>

          <div className="grid gap-4 p-4 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
            {/* 左：图纸 + 画布 */}
            <div>
              {!img ? (
                <label className="flex flex-col items-center justify-center gap-2 cursor-pointer text-sm py-24 rounded"
                  style={{ border: `2px dashed ${T.line}`, color: T.inkSoft }}>
                  <Upload size={28} strokeWidth={1.2} />
                  <span>Upload floor plan / photo 上传图纸或照片</span>
                  <span className="text-xs">JPG / PNG</span>
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => onFile(e.target.files?.[0])} />
                </label>
              ) : (
                <>
                  {/* 步骤提示 */}
                  <div className="mb-2 px-3 py-2 text-xs rounded" style={{ background: T.sand, color: T.ink }}>
                    {pxPerM <= 0
                      ? (calib ? '① 已画校准线 → 在右边填这条线的真实长度（米）' : '① 校准：在一段已知长度上点两下画一条线（例如一面 3 米的墙）')
                      : '② 量尺：在墙/柜上点，直的点两下即可；L 型柜连续点转角，然后按「完成这段」。'}
                    {pending && <span style={{ color: T.terra }}>　（已点起点，点第二下完成校准线）</span>}
                    {pxPerM > 0 && draft.length > 0 && <span style={{ color: T.terra }}>　（进行中 {fmtLen(draftLenM)} · 点转角继续，或按完成）</span>}
                  </div>
                  <div style={{ overflow: 'auto', maxHeight: '68vh', border: `1px solid ${T.lineSoft}`, borderRadius: 2, background: T.cream }}>
                  <div style={{ position: 'relative', display: 'inline-block', width: `${zoom * 100}%`, lineHeight: 0 }}>
                    <img ref={imgRef} src={img.src} alt="plan" draggable={false}
                      style={{ width: '100%', height: 'auto', display: 'block', userSelect: 'none' }} />
                    <svg viewBox={`0 0 ${img.w} ${img.h}`} preserveAspectRatio="none" onClick={handleClick}
                      onDoubleClick={finishDraft}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'crosshair' }}>
                      {/* 校准线 */}
                      {calib && (
                        <g>
                          <line x1={calib.a.x} y1={calib.a.y} x2={calib.b.x} y2={calib.b.y} stroke={T.terra} strokeWidth={sw} />
                          <text x={(calib.a.x + calib.b.x) / 2} y={(calib.a.y + calib.b.y) / 2 - sw * 2}
                            fill={T.terra} fontSize={fs} fontWeight="700" textAnchor="middle">
                            {pxPerM > 0 ? '校准 CAL' : '校准线'}
                          </text>
                          {handle('ca', calib.a, hr, T.terra, 'calib', null, 0)}
                          {handle('cb', calib.b, hr, T.terra, 'calib', null, 1)}
                        </g>
                      )}
                      {/* 已完成的量尺折线 */}
                      {lines.map((l) => {
                        const c = centroid(l.pts);
                        return (
                          <g key={l.id}>
                            <polyline points={ptsStr(l.pts)} fill="none" stroke={T.wood} strokeWidth={sw} strokeLinejoin="round" />
                            {l.pts.map((p, j) => handle(j, p, hr, T.wood, 'line', l.id, j))}
                            <text x={c.x} y={c.y - sw * 2} fill={T.wood} fontSize={fs} fontWeight="700" textAnchor="middle">
                              {(l.name ? l.name + ' ' : '') + fmtLen(effM(l)) + (l.manualM != null ? ' ✎' : '')}
                            </text>
                          </g>
                        );
                      })}
                      {/* 正在画的折线 */}
                      {draft.length > 0 && (
                        <g>
                          {draft.length > 1 && <polyline points={ptsStr(draft)} fill="none" stroke={T.terra} strokeWidth={sw} strokeDasharray={`${sw * 2} ${sw * 2}`} strokeLinejoin="round" />}
                          {draft.map((p, j) => handle(j, p, hr * 1.1, T.terra, 'draft', null, j))}
                        </g>
                      )}
                      {pending && (
                        <g>
                          <circle cx={pending.x} cy={pending.y} r={hr} fill={T.terra} fillOpacity={0.18} stroke={T.terra} strokeOpacity={0.6} strokeWidth={sw * 0.5} />
                          <circle cx={pending.x} cy={pending.y} r={sw * 0.9} fill={T.terra} stroke="#fff" strokeWidth={sw * 0.35} />
                        </g>
                      )}
                    </svg>
                  </div>
                  </div>
                  {/* 工具条：撤销/重做 · 缩放 · 换图/校准/清空 */}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <div className="flex items-center rounded overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
                      <button onClick={undo} disabled={!canUndo} title="撤销 (Ctrl+Z)"
                        className="text-xs px-2.5 py-1.5 flex items-center gap-1 disabled:opacity-30" style={{ color: T.inkSoft }}>
                        <Undo2 size={13} /> 撤销
                      </button>
                      <button onClick={redo} disabled={!canRedo} title="重做 (Ctrl+Shift+Z)"
                        className="text-xs px-2.5 py-1.5 flex items-center gap-1 disabled:opacity-30" style={{ color: T.inkSoft, borderLeft: `1px solid ${T.line}` }}>
                        <Redo2 size={13} /> 重做
                      </button>
                    </div>
                    <div className="flex items-center rounded overflow-hidden" style={{ border: `1px solid ${T.line}` }}>
                      <button onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))} disabled={zoom <= 1} title="缩小"
                        className="text-xs px-2.5 py-1.5 disabled:opacity-30" style={{ color: T.inkSoft }}><ZoomOut size={13} /></button>
                      <span className="text-xs px-1.5" style={{ color: T.inkSoft, minWidth: 42, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                      <button onClick={() => setZoom((z) => Math.min(5, +(z + 0.25).toFixed(2)))} disabled={zoom >= 5} title="放大"
                        className="text-xs px-2.5 py-1.5 disabled:opacity-30" style={{ color: T.inkSoft, borderLeft: `1px solid ${T.line}` }}><ZoomIn size={13} /></button>
                      <button onClick={() => setZoom(1)} disabled={zoom === 1} title="还原大小"
                        className="text-xs px-2.5 py-1.5 disabled:opacity-30" style={{ color: T.inkSoft, borderLeft: `1px solid ${T.line}` }}><Maximize2 size={13} /></button>
                    </div>
                    {/* 吸附开关 */}
                    <button onClick={() => setSnapOrtho((v) => !v)} title="自动拉直成水平 / 垂直（±8°）"
                      className="text-xs px-2.5 py-1.5"
                      style={{ border: `1px solid ${snapOrtho ? T.wood : T.line}`, background: snapOrtho ? T.sand : 'transparent', color: snapOrtho ? T.wood : T.inkSoft, borderRadius: 2 }}>
                      ⊾ 直角
                    </button>
                    <button onClick={() => setSnapEdge((v) => !v)} title="点击处自动吸到图上的墙线（深色线）"
                      className="text-xs px-2.5 py-1.5"
                      style={{ border: `1px solid ${snapEdge ? T.wood : T.line}`, background: snapEdge ? T.sand : 'transparent', color: snapEdge ? T.wood : T.inkSoft, borderRadius: 2 }}>
                      🧲 吸附墙线
                    </button>
                    <label className="text-xs px-3 py-1.5 cursor-pointer" style={{ border: `1px solid ${T.line}`, borderRadius: 2, color: T.inkSoft }}>
                      <Upload size={12} className="inline mr-1" /> 换图
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                    </label>
                    {pxPerM > 0 && (
                      <button onClick={recalibrate} className="text-xs px-3 py-1.5 flex items-center gap-1" style={{ border: `1px solid ${T.line}`, borderRadius: 2, color: T.inkSoft }}>
                        <RotateCcw size={12} /> 重新校准
                      </button>
                    )}
                    {pxPerM > 0 && lines.length > 0 && (
                      <button onClick={clearAll} className="text-xs px-3 py-1.5 flex items-center gap-1" style={{ border: `1px solid ${T.line}`, borderRadius: 2, color: T.terra }}>
                        <Eraser size={12} /> 清空量尺
                      </button>
                    )}
                    {pxPerM > 0 && draft.length > 0 && (
                      <>
                        <button onClick={finishDraft} disabled={draft.length < 2}
                          className="text-xs px-3 py-1.5 flex items-center gap-1"
                          style={{ background: draft.length < 2 ? T.line : T.wood, color: '#fff', borderRadius: 2, opacity: draft.length < 2 ? 0.6 : 1 }}>
                          <CornerDownRight size={12} /> 完成这段 {draft.length >= 2 ? `(${fmtLen(draftLenM)})` : ''}
                        </button>
                        <button onClick={undoPoint} className="text-xs px-3 py-1.5 flex items-center gap-1" style={{ border: `1px solid ${T.line}`, borderRadius: 2, color: T.inkSoft }}>
                          <Undo2 size={12} /> 撤销点
                        </button>
                        <button onClick={cancelDraft} className="text-xs px-3 py-1.5" style={{ border: `1px solid ${T.line}`, borderRadius: 2, color: T.terra }}>取消这段</button>
                      </>
                    )}
                    {pending && <span className="text-xs" style={{ color: T.terra }}>点第二下完成 /
                      <button onClick={() => setPending(null)} className="underline ml-1">取消</button></span>}
                  </div>
                  {pxPerM > 0 && (
                    <p className="text-[11px] mt-1.5" style={{ color: T.inkSoft }}>在墙上大概点一下即可：会自动<b>吸到墙线</b>并<b>拉直</b>；不准就<b>按住端点拖</b>微调，或在右边直接打准确尺寸。直的柜点两下按「完成这段」；L 型连续点转角再完成（双击 / Enter = 完成，Esc = 取消）。点错按「撤销」。</p>
                  )}
                </>
              )}
            </div>

            {/* 右：单位 + 校准输入 + 量尺列表 + 加入报价 */}
            <div className="space-y-3">
              {img && (
                <div className="p-3 rounded" style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
                  <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>Unit 尺寸单位</div>
                  <select value={unit} onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm outline-none" style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 2, color: T.ink }}>
                    {UNITS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                  <p className="text-[10px] mt-1" style={{ color: T.inkSoft }}>校准与显示都用这个单位；报价内部一律换算成米。</p>
                </div>
              )}

              {img && pxPerM <= 0 && calib && (
                <div className="p-3 rounded" style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
                  <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>Calibrate 校准</div>
                  <div className="flex items-center gap-2 text-sm">
                    <span style={{ color: T.inkSoft }}>这条线 =</span>
                    <input type="number" step="any" value={askMeters} autoFocus
                      onChange={(e) => setAskMeters(e.target.value)} placeholder={u.id === 'm' ? '3' : u.id === 'cm' ? '300' : u.id === 'mm' ? '3000' : u.id === 'ft' ? '10' : '120'}
                      className="w-24 px-2 py-1 outline-none" style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 2 }} />
                    <span style={{ color: T.inkSoft }}>{u.label.split(' ')[0]}</span>
                    <button onClick={applyCalibration} className="px-3 py-1 text-sm" style={{ background: T.wood, color: '#fff', borderRadius: 2 }}>Set</button>
                  </div>
                </div>
              )}

              {pxPerM > 0 && (
                <div className="p-3 rounded" style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-widest" style={{ color: T.inkSoft }}>Measurements 量尺 · {lines.length}</span>
                    <span className="text-xs" style={{ color: T.wood }}>Σ {fmtLen(total)}</span>
                  </div>
                  {lines.length === 0 && <div className="text-xs py-2" style={{ color: T.inkSoft }}>在图上画线…</div>}
                  <div className="space-y-2 max-h-72 overflow-auto">
                    {lines.map((l, i) => (
                      <div key={l.id} className="p-1.5 rounded" style={{ background: T.paper, border: `1px solid ${T.lineSoft}` }}>
                        <div className="flex items-center gap-1.5 text-sm">
                          <input value={l.name} onChange={(e) => renameLine(l.id, e.target.value)} placeholder={`#${i + 1}${l.pts.length > 2 ? ' (L型)' : ''}`}
                            className="flex-1 min-w-0 px-2 py-1 text-xs outline-none" style={{ background: T.cream, border: `1px solid ${T.line}`, borderRadius: 2 }} />
                          {/* 长度可直接打数字（画不准时输入准确尺寸）*/}
                          <input type="number" step="any" inputMode="decimal"
                            value={dispLen(l)}
                            onChange={(e) => setManual(l.id, e.target.value)}
                            title="可直接输入准确长度 Type exact length"
                            className="w-20 px-1.5 py-1 text-sm text-right font-medium outline-none"
                            style={{ background: l.manualM != null ? T.sand : T.cream, border: `1px solid ${l.manualM != null ? T.wood : T.line}`, borderRadius: 2, color: T.ink }} />
                          <span className="text-xs" style={{ color: T.inkSoft }}>{u.id === 'in' ? '"' : u.id === 'ft' ? "'" : u.id}</span>
                          {l.manualM != null && (
                            <button onClick={() => clearManual(l.id)} title="恢复按图量的长度" style={{ color: T.inkSoft }}><RotateCcw size={12} /></button>
                          )}
                          <button onClick={() => removeLine(l.id)} style={{ color: T.terra }}><Trash2 size={13} /></button>
                        </div>
                        <select value={l.kind || cabKind} onChange={(e) => setLineKind(l.id, e.target.value)}
                          className="w-full mt-1 px-2 py-1 text-xs outline-none" style={{ background: T.cream, border: `1px solid ${T.line}`, borderRadius: 2, color: T.ink }}>
                          {CABINET_TYPES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pxPerM > 0 && lines.length > 0 && (
                <div className="p-3 rounded space-y-2" style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
                  <div className="text-[10px] uppercase tracking-widest" style={{ color: T.inkSoft }}>Add to quote 加入报价</div>
                  <label className="block text-[10px]" style={{ color: T.inkSoft }}>Room 区域
                    <select value={targetZone} onChange={(e) => setTargetZone(e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 text-sm outline-none" style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 2 }}>
                      {zones.map((z) => <option key={z.id} value={z.id}>{z.name || 'Untitled 未命名'}</option>)}
                      <option value="__new">+ New room 新区域</option>
                    </select>
                  </label>
                  {targetZone === '__new' && (
                    <input value={newZoneName} onChange={(e) => setNewZoneName(e.target.value)} placeholder="Room name 区域名，如 Kitchen 厨房"
                      className="w-full px-2 py-1.5 text-sm outline-none" style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 2 }} />
                  )}
                  <label className="block text-[10px]" style={{ color: T.inkSoft }}>Default type for new lines 新线默认柜体类型
                    <select value={cabKind} onChange={(e) => setCabKind(e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 text-sm outline-none" style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 2 }}>
                      {CABINET_TYPES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </label>
                  <button onClick={addToQuote} className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm"
                    style={{ background: T.ink, color: T.paper, borderRadius: 2 }}>
                    <Plus size={14} /> Add {lines.length} item(s) 加入 {lines.length} 项
                  </button>
                  <p className="text-[10px]" style={{ color: T.inkSoft }}>每条量尺（含 L 型折线）会变成一个柜体项目，柜体类型可在上面每条单独选，长度自动填入。之后可在报价里微调。</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
