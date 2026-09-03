import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Ruler, RotateCcw, Trash2, Plus } from 'lucide-react';
import { T } from '../../theme.js';
import { CABINET_TYPES } from '../../constants/pricing.js';

// ============================================================
// Ukur 量尺 —— 上传图纸 → 划线校准比例 → 划线量尺 → 直接加入报价
// 全程浏览器本地运行；坐标用图片原始像素，缩放/换窗不影响比例。
// ============================================================
export default function MeasureTool({ zones = [], onAddItems, onClose }) {
  const [img, setImg] = useState(null);        // { src, w, h }
  const [pxPerM, setPxPerM] = useState(0);      // 原始像素/米（0=未校准）
  const [pending, setPending] = useState(null); // 起点 {x,y}（原始坐标）
  const [calib, setCalib] = useState(null);     // 校准线 {a,b}
  const [askMeters, setAskMeters] = useState(''); // 校准输入框
  const [lines, setLines] = useState([]);       // 量尺结果 [{id,a,b,name,len}]
  const [targetZone, setTargetZone] = useState(zones[0]?.id || '__new');
  const [newZoneName, setNewZoneName] = useState('');
  const [cabKind, setCabKind] = useState('base');
  const imgRef = useRef(null);

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const lenM = (a, b) => (pxPerM > 0 ? dist(a, b) / pxPerM : 0);

  const onFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const im = new Image();
      im.onload = () => { setImg({ src: e.target.result, w: im.naturalWidth, h: im.naturalHeight }); setPxPerM(0); setCalib(null); setLines([]); setPending(null); };
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
    if (!pending) { setPending(p); return; }
    const a = pending, b = p;
    setPending(null);
    if (pxPerM <= 0) {
      setCalib({ a, b });          // 第一条线 = 校准线
      setAskMeters('');
    } else {
      const id = 'm' + Date.now();
      setLines((ls) => [...ls, { id, a, b, name: '', len: lenM(a, b) }]);
    }
  };

  const applyCalibration = () => {
    const m = parseFloat(askMeters);
    if (!calib || !(m > 0)) return;
    setPxPerM(dist(calib.a, calib.b) / m);
  };

  const recalibrate = () => { setPxPerM(0); setCalib(null); setPending(null); setAskMeters(''); };
  const removeLine = (id) => setLines((ls) => ls.filter((l) => l.id !== id));
  const renameLine = (id, name) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, name } : l)));

  const sw = img ? Math.max(2, img.w / 320) : 2;   // 线宽（原始坐标）
  const fs = img ? Math.max(12, img.w / 45) : 12;  // 字号

  const total = lines.reduce((a, l) => a + l.len, 0);

  const addToQuote = () => {
    if (!lines.length) return;
    const measures = lines.map((l) => ({ length: Math.round(l.len * 100) / 100, name: l.name }));
    onAddItems({ zoneId: targetZone, newZoneName: newZoneName.trim(), kind: cabKind, measures });
    onClose();
  };

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
                      : '② 量尺：在墙/柜上点两下画线，自动算长度。可继续画多条。'}
                    {pending && <span style={{ color: T.terra }}>　（已点起点，点第二下完成）</span>}
                  </div>
                  <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', lineHeight: 0 }}>
                    <img ref={imgRef} src={img.src} alt="plan" draggable={false}
                      style={{ maxWidth: '100%', height: 'auto', display: 'block', userSelect: 'none' }} />
                    <svg viewBox={`0 0 ${img.w} ${img.h}`} preserveAspectRatio="none" onClick={handleClick}
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
                      {/* 量尺线 */}
                      {lines.map((l, i) => (
                        <g key={l.id}>
                          <line x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke={T.wood} strokeWidth={sw} />
                          <text x={(l.a.x + l.b.x) / 2} y={(l.a.y + l.b.y) / 2 - sw * 2}
                            fill={T.wood} fontSize={fs} fontWeight="700" textAnchor="middle">
                            {(l.name ? l.name + ' ' : '') + l.len.toFixed(2) + 'm'}
                          </text>
                        </g>
                      ))}
                      {pending && <circle cx={pending.x} cy={pending.y} r={sw * 2} fill={T.terra} />}
                    </svg>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <label className="text-xs px-3 py-1.5 cursor-pointer" style={{ border: `1px solid ${T.line}`, borderRadius: 2, color: T.inkSoft }}>
                      <Upload size={12} className="inline mr-1" /> 换图
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                    </label>
                    {pxPerM > 0 && (
                      <button onClick={recalibrate} className="text-xs px-3 py-1.5 flex items-center gap-1" style={{ border: `1px solid ${T.line}`, borderRadius: 2, color: T.inkSoft }}>
                        <RotateCcw size={12} /> 重新校准
                      </button>
                    )}
                    {pending && <span className="text-xs" style={{ color: T.terra }}>点第二下完成 /
                      <button onClick={() => setPending(null)} className="underline ml-1">取消</button></span>}
                  </div>
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
                  <div className="space-y-1.5 max-h-64 overflow-auto">
                    {lines.map((l, i) => (
                      <div key={l.id} className="flex items-center gap-1.5 text-sm">
                        <input value={l.name} onChange={(e) => renameLine(l.id, e.target.value)} placeholder={`#${i + 1}`}
                          className="flex-1 min-w-0 px-2 py-1 text-xs outline-none" style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 2 }} />
                        <span className="font-medium" style={{ color: T.ink }}>{l.len.toFixed(2)}m</span>
                        <button onClick={() => removeLine(l.id)} style={{ color: T.terra }}><Trash2 size={13} /></button>
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
                  <label className="block text-[10px]" style={{ color: T.inkSoft }}>Cabinet type 柜体类型
                    <select value={cabKind} onChange={(e) => setCabKind(e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 text-sm outline-none" style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 2 }}>
                      {CABINET_TYPES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </label>
                  <button onClick={addToQuote} className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm"
                    style={{ background: T.ink, color: T.paper, borderRadius: 2 }}>
                    <Plus size={14} /> Add {lines.length} item(s) 加入 {lines.length} 项
                  </button>
                  <p className="text-[10px]" style={{ color: T.inkSoft }}>每条量尺线会变成一个柜体项目，长度自动填入。之后可在报价里微调。</p>
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
