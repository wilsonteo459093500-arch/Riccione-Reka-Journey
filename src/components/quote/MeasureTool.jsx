import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Ruler, RotateCcw, Trash2, Plus, CornerDownRight, Undo2 } from 'lucide-react';
import { T } from '../../theme.js';
import { CABINET_TYPES } from '../../constants/pricing.js';

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
  const imgRef = useRef(null);

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const pathPx = (pts) => pts.reduce((s, p, i) => (i ? s + dist(pts[i - 1], p) : 0), 0);
  const pathM = (pts) => (pxPerM > 0 ? pathPx(pts) / pxPerM : 0);
  const centroid = (pts) => ({
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  });

  const onFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const im = new Image();
      im.onload = () => { setImg({ src: e.target.result, w: im.naturalWidth, h: im.naturalHeight }); setPxPerM(0); setCalib(null); setLines([]); setPending(null); setDraft([]); };
      im.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  // 点击图片 → 原始坐标
  const pointAt = (e) => {
    const r = imgRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (img.w / r.width),
      y: (e.clientY - r.top) * (img.h / r.height),
    };
  };

  const handleClick = (e) => {
    if (!img) return;
    const p = pointAt(e);
    if (pxPerM <= 0) {
      // 校准：两点一条线
      if (!pending) { setPending(p); return; }
      setCalib({ a: pending, b: p });
      setPending(null);
      setAskMeters('');
    } else {
      // 量尺：连续点转角，累加成一条折线
      setDraft((d) => [...d, p]);
    }
  };

  const finishDraft = () => {
    if (draft.length < 2) return;
    const pts = draft;
    setLines((ls) => [...ls, { id: 'm' + Date.now(), pts, name: '', len: pathM(pts), kind: cabKind }]);
    setDraft([]);
  };
  const undoPoint = () => setDraft((d) => d.slice(0, -1));
  const cancelDraft = () => setDraft([]);
  const setLineKind = (id, kind) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, kind } : l)));

  const applyCalibration = () => {
    const m = parseFloat(askMeters);
    if (!calib || !(m > 0)) return;
    setPxPerM(dist(calib.a, calib.b) / m);
  };

  const recalibrate = () => { setPxPerM(0); setCalib(null); setPending(null); setAskMeters(''); setDraft([]); };
  const removeLine = (id) => setLines((ls) => ls.filter((l) => l.id !== id));
  const renameLine = (id, name) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, name } : l)));

  const sw = img ? Math.max(2, img.w / 320) : 2;   // 线宽（原始坐标）
  const fs = img ? Math.max(12, img.w / 45) : 12;  // 字号
  const draftLenM = pathM(draft);
  const total = lines.reduce((a, l) => a + l.len, 0);

  const addToQuote = () => {
    if (!lines.length) return;
    const measures = lines.map((l) => ({ length: Math.round(l.len * 100) / 100, name: l.name, kind: l.kind || cabKind }));
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

          <div className="grid gap-4 p-4" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
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
                    {pxPerM > 0 && draft.length > 0 && <span style={{ color: T.terra }}>　（进行中 {draftLenM.toFixed(2)}m · 点转角继续，或按完成）</span>}
                  </div>
                  <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', lineHeight: 0 }}>
                    <img ref={imgRef} src={img.src} alt="plan" draggable={false}
                      style={{ maxWidth: '100%', height: 'auto', display: 'block', userSelect: 'none' }} />
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
                        </g>
                      )}
                      {/* 已完成的量尺折线 */}
                      {lines.map((l) => {
                        const c = centroid(l.pts);
                        return (
                          <g key={l.id}>
                            <polyline points={ptsStr(l.pts)} fill="none" stroke={T.wood} strokeWidth={sw} strokeLinejoin="round" />
                            {l.pts.map((p, j) => <circle key={j} cx={p.x} cy={p.y} r={sw * 1.4} fill={T.wood} />)}
                            <text x={c.x} y={c.y - sw * 2} fill={T.wood} fontSize={fs} fontWeight="700" textAnchor="middle">
                              {(l.name ? l.name + ' ' : '') + l.len.toFixed(2) + 'm'}
                            </text>
                          </g>
                        );
                      })}
                      {/* 正在画的折线 */}
                      {draft.length > 0 && (
                        <g>
                          {draft.length > 1 && <polyline points={ptsStr(draft)} fill="none" stroke={T.terra} strokeWidth={sw} strokeDasharray={`${sw * 2} ${sw * 2}`} strokeLinejoin="round" />}
                          {draft.map((p, j) => <circle key={j} cx={p.x} cy={p.y} r={sw * 1.8} fill={T.terra} />)}
                        </g>
                      )}
                      {pending && <circle cx={pending.x} cy={pending.y} r={sw * 2} fill={T.terra} />}
                    </svg>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <label className="text-xs px-3 py-1.5 cursor-pointer" style={{ border: `1px solid ${T.line}`, borderRadius: 2, color: T.inkSoft }}>
                      <Upload size={12} className="inline mr-1" /> 换图
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                    </label>
                    {pxPerM > 0 && (
                      <button onClick={recalibrate} className="text-xs px-3 py-1.5 flex items-center gap-1" style={{ border: `1px solid ${T.line}`, borderRadius: 2, color: T.inkSoft }}>
                        <RotateCcw size={12} /> 重新校准
                      </button>
                    )}
                    {pxPerM > 0 && draft.length > 0 && (
                      <>
                        <button onClick={finishDraft} disabled={draft.length < 2}
                          className="text-xs px-3 py-1.5 flex items-center gap-1"
                          style={{ background: draft.length < 2 ? T.line : T.wood, color: '#fff', borderRadius: 2, opacity: draft.length < 2 ? 0.6 : 1 }}>
                          <CornerDownRight size={12} /> 完成这段 {draft.length >= 2 ? `(${draftLenM.toFixed(2)}m)` : ''}
                        </button>
                        <button onClick={undoPoint} className="text-xs px-3 py-1.5 flex items-center gap-1" style={{ border: `1px solid ${T.line}`, borderRadius: 2, color: T.inkSoft }}>
                          <Undo2 size={12} /> 撤销点
                        </button>
                        <button onClick={cancelDraft} className="text-xs px-3 py-1.5" style={{ border: `1px solid ${T.line}`, borderRadius: 2, color: T.terra }}>取消</button>
                      </>
                    )}
                    {pending && <span className="text-xs" style={{ color: T.terra }}>点第二下完成 /
                      <button onClick={() => setPending(null)} className="underline ml-1">取消</button></span>}
                  </div>
                  {pxPerM > 0 && (
                    <p className="text-[11px] mt-1.5" style={{ color: T.inkSoft }}>直的柜：点两下即可按「完成这段」。L 型 / 转角柜：连续点每个转角，再按「完成这段」，整条长度自动累加成一个柜。双击 = 完成。</p>
                  )}
                </>
              )}
            </div>

            {/* 右：校准输入 + 量尺列表 + 加入报价 */}
            <div className="space-y-3">
              {img && pxPerM <= 0 && calib && (
                <div className="p-3 rounded" style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
                  <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>Calibrate 校准</div>
                  <div className="flex items-center gap-2 text-sm">
                    <span style={{ color: T.inkSoft }}>这条线 =</span>
                    <input type="number" step="0.01" value={askMeters} autoFocus
                      onChange={(e) => setAskMeters(e.target.value)} placeholder="3"
                      className="w-20 px-2 py-1 outline-none" style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 2 }} />
                    <span style={{ color: T.inkSoft }}>m</span>
                    <button onClick={applyCalibration} className="px-3 py-1 text-sm" style={{ background: T.wood, color: '#fff', borderRadius: 2 }}>Set</button>
                  </div>
                </div>
              )}

              {pxPerM > 0 && (
                <div className="p-3 rounded" style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-widest" style={{ color: T.inkSoft }}>Measurements 量尺 · {lines.length}</span>
                    <span className="text-xs" style={{ color: T.wood }}>Σ {total.toFixed(2)} m</span>
                  </div>
                  {lines.length === 0 && <div className="text-xs py-2" style={{ color: T.inkSoft }}>在图上画线…</div>}
                  <div className="space-y-2 max-h-72 overflow-auto">
                    {lines.map((l, i) => (
                      <div key={l.id} className="p-1.5 rounded" style={{ background: T.paper, border: `1px solid ${T.lineSoft}` }}>
                        <div className="flex items-center gap-1.5 text-sm">
                          <input value={l.name} onChange={(e) => renameLine(l.id, e.target.value)} placeholder={`#${i + 1}${l.pts.length > 2 ? ' (L型)' : ''}`}
                            className="flex-1 min-w-0 px-2 py-1 text-xs outline-none" style={{ background: T.cream, border: `1px solid ${T.line}`, borderRadius: 2 }} />
                          <span className="font-medium" style={{ color: T.ink }}>{l.len.toFixed(2)}m</span>
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
