// 第三版「户型图 Floor plan」：报价设计页最上面一块。
//   上传（照片 / 截图 / PDF 选页）→ 定比例（点两点打长度）→ 画框选模板 / 把已有的柜子放到图上 → 拖柜子、拖边改尺寸、转 90° → 走道提醒
//   户型图坐标：SVG 用图片像素；柜子位置 cab.place 用 mm（像素 × mmPerPx）。外框每次由 plan.js placedFootprint 算 → 编辑器改尺寸，图上跟着变。
//   拖拉写法同 BlockEditor.jsx：setPointerCapture、getScreenCTM().inverse()；拖完才写回报价（一步撤销）。
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Upload, Ruler, Square, Undo2, Redo2, Maximize2, Minimize2, RotateCw, Pencil, X, Trash2, ChevronDown, ChevronRight, MapPin, Crosshair, AlertTriangle, Loader2, ScanSearch } from 'lucide-react';
import { T } from '../../theme.js';
import { BLOCK_COLORS, BLOCK_SELECTED, INK } from '../../render/palette.js';
import { mmToM } from '../../planner/model.js';
import { cabinetTitle } from '../../planner/templates.js';
import { mmPerPx, planReady, placedFootprint, placeAt, rotatePlace, dragPlanEdge, aisleWarnings, dist } from '../../planner/plan.js';
import { isPdf, prepareImage, openPdf, renderPdfPage, pdfThumb, savePlanImage, planImageUrl, queuePlanDelete } from '../../services/planImages.js';
import { parseMeters, useBackClose } from '../planner/bits.jsx';
import { useToast, useConfirm } from '../ui/UIProvider.jsx';

const SNAP = 10;
const snapMm = (v) => Math.round(v / SNAP) * SNAP;
const newPlanId = () => `plan_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isCoarse = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const isPhone = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 1023px)').matches;

// 把某个柜子换掉（或去掉 place）
export const replaceCab = (zones, cab) => zones.map((z) => ((z.cabinets || []).some((c) => c.id === cab.id)
  ? { ...z, cabinets: z.cabinets.map((c) => (c.id === cab.id ? cab : c)) } : z));
const dropPlace = (cab) => { const { place, ...rest } = cab; return rest; };

function BackCloser({ onBack }) { useBackClose(onBack); return null; }

function Btn({ on, children, title, onClick, disabled, danger, ...rest }) {
  return (
    <button type="button" title={title} aria-label={typeof title === 'string' ? title : undefined} onClick={onClick} disabled={disabled} {...rest}
      className="flex items-center gap-1 px-2 py-1.5 text-xs whitespace-nowrap disabled:opacity-30"
      style={{ borderRadius: 2, border: `1px solid ${on ? T.ink : T.line}`, background: on ? T.ink : T.paper, color: on ? T.paper : danger ? T.terra : T.ink }}>
      {children}
    </button>
  );
}

// ============================================================
export default function PlanBoard({ plans = [], zones = [], onChange, onDraw, onEdit, lang = 'en' }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(() => plans.length > 0 || !isPhone());
  const [activeId, setActiveId] = useState(() => plans[0]?.id || null);
  const plan = plans.find((p) => p.id === activeId) || plans[0] || null;
  const [mode, setMode] = useState('view'); // view | scale | draw | place
  const [placing, setPlacing] = useState(null); // 要放到图上的柜子 id
  const [sel, setSel] = useState(null); // 选中的柜子 id
  const [scalePts, setScalePts] = useState([]);
  const [scaleTxt, setScaleTxt] = useState('');
  const [drawZone, setDrawZone] = useState(null);
  const [busy, setBusy] = useState('');
  const [pdf, setPdf] = useState(null); // { doc, file, n, thumbs }
  const [full, setFull] = useState(false);
  const [urls, setUrls] = useState({});
  const [drag, setDrag] = useState(null);
  const [corner, setCorner] = useState(null); // 手指画框：第一个角
  const fileRef = useRef(null);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const touches = useRef(new Map());
  const pinch = useRef(null);
  const [upp, setUpp] = useState(1); // 1 屏幕 px = 多少图片 px

  const k = plan ? mmPerPx(plan) : 0;
  const ready = !!plan && planReady(plan);
  const W = plan?.image?.w || 1000, H = plan?.image?.h || 700;
  const [vb, setVb] = useState([0, 0, W, H]);
  useEffect(() => { setVb([0, 0, W, H]); setSel(null); setScalePts([]); setCorner(null); }, [plan?.id, W, H]);
  useEffect(() => { if (plan && !planReady(plan)) setMode('scale'); }, [plan?.id, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // 图片
  useEffect(() => {
    let alive = true;
    plans.forEach((p) => {
      const path = p.image?.path;
      if (!path || urls[path] !== undefined) return;
      setUrls((u) => ({ ...u, [path]: null }));
      planImageUrl(path).then((u) => { if (alive) setUrls((x) => ({ ...x, [path]: u || '' })); });
    });
    return () => { alive = false; };
  }, [plans.map((p) => p.image?.path).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // 所有柜子（带房间）
  const allCabs = useMemo(() => zones.flatMap((z) => (z.cabinets || []).map((c) => ({ zoneId: z.id, zone: z, cab: c }))), [zones]);
  const cabsHere = allCabs.filter((x) => x.cab.place?.planId === plan?.id);
  const notPlaced = allCabs.filter((x) => !x.cab.place || !plans.some((p) => p.id === x.cab.place.planId));
  const selCab = allCabs.find((x) => x.cab.id === sel)?.cab || null;
  const warnings = useMemo(() => (plan && ready ? aisleWarnings(plan, allCabs.map((x) => (drag?.cab && drag.cab.id === x.cab.id ? drag.cab : x.cab))) : []), [plan, ready, allCabs, drag]);

  // ---------------- 撤销 / 重做（只管户型图上的改动；别处改了报价就清掉）----------------
  const hist = useRef({ undo: [], redo: [], last: null });
  const [, bump] = useState(0);
  useEffect(() => {
    const h = hist.current;
    if (h.last && (h.last.zones !== zones || h.last.plans !== plans)) { h.undo = []; h.redo = []; h.last = null; bump((n) => n + 1); }
  }, [zones, plans]);
  // 一律用最新的 plans / zones / onChange（上传、PDF 渲页、确认框都要等；等完再用旧的会把整份报价盖回去）
  const live = useRef(null);
  live.current = { plans, zones, onChange };
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const emit = (out) => { if (alive.current) live.current.onChange(out); };
  // next：{ plans?, zones? } 或 (现在的 { plans, zones }) => { plans?, zones? }
  const commit = (next) => {
    const cur = { plans: live.current.plans, zones: live.current.zones };
    const n = typeof next === 'function' ? next(cur) : next;
    const out = { plans: n.plans || cur.plans, zones: n.zones || cur.zones };
    hist.current.undo.push(cur);
    if (hist.current.undo.length > 60) hist.current.undo.shift();
    hist.current.redo = [];
    hist.current.last = out;
    emit(out);
    bump((x) => x + 1);
  };
  const undo = () => { const h = hist.current; const s = h.undo.pop(); if (!s) return; h.redo.push({ plans: live.current.plans, zones: live.current.zones }); h.last = s; emit(s); bump((n) => n + 1); };
  const redo = () => { const h = hist.current; const s = h.redo.pop(); if (!s) return; h.undo.push({ plans: live.current.plans, zones: live.current.zones }); h.last = s; emit(s); bump((n) => n + 1); };

  const setPlan = (p) => commit((c) => ({ plans: c.plans.map((x) => (x.id === p.id ? p : x)) }));

  // ---------------- 上传 ----------------
  const addPlan = async (blob, w, h, extra) => {
    const path = await savePlanImage(blob);
    // 等的时候换了报价（这个画面已经关掉）→ 不写回，免得写进别的报价
    if (!alive.current) { queuePlanDelete(path); return; }
    const n = live.current.plans.length + 1;
    const p = { id: newPlanId(), name: `Plan ${n} 户型图 ${n}`, image: { path, w, h, ...extra }, scale: null };
    commit((c) => ({ plans: [...c.plans, p] }));
    setActiveId(p.id);
    setOpen(true);
    setMode('scale');
  };
  const onFile = async (file) => {
    if (!file) return;
    try {
      if (isPdf(file)) {
        setBusy('Reading PDF 读取 PDF…');
        const doc = await openPdf(file);
        if (doc.numPages === 1) { setBusy('Rendering 处理中…'); const r = await renderPdfPage(doc, 1); await addPlan(r.blob, r.w, r.h, { kind: 'pdf', page: 1 }); }
        else {
          const n = Math.min(doc.numPages, 40);
          setPdf({ doc, n, thumbs: {} });
          for (let i = 1; i <= n; i++) {
            const t = await pdfThumb(doc, i).catch(() => '');
            setPdf((x) => (x && x.doc === doc ? { ...x, thumbs: { ...x.thumbs, [i]: t } } : x));
          }
        }
      } else {
        setBusy('Compressing 压缩中…');
        const r = await prepareImage(file);
        await addPlan(r.blob, r.w, r.h, { kind: 'img', page: 1 });
      }
    } catch (e) {
      toast(`Could not open the file 打不开这个文件：${e?.message || e}`, 'error');
    } finally { setBusy(''); }
  };
  const pickPdfPage = async (page) => {
    const doc = pdf.doc;
    setPdf(null);
    try {
      setBusy('Rendering 处理中…');
      const r = await renderPdfPage(doc, page);
      await addPlan(r.blob, r.w, r.h, { kind: 'pdf', page });
    } catch (e) { toast(`PDF page failed 这一页处理失败：${e?.message || e}`, 'error'); } finally { setBusy(''); }
  };

  const removePlan = async () => {
    if (!plan) return;
    const n = cabsHere.length;
    if (!(await confirm({ title: 'Delete floor plan 删除户型图', message: `Delete "${plan.name}"?${n ? ` ${n} cabinet(s) will be taken off the plan (they stay in the quote). 上面的 ${n} 个柜子会从图上拿掉（报价里还在）。` : ''} 确定删除？`, danger: true, confirmText: 'Delete 删除', cancelText: 'Cancel 取消' }))) return;
    if (!alive.current) return;
    const path = plan.image?.path;
    const { plans: P, zones: Z } = live.current; // 确认框等的时候报价可能改过 → 用最新的
    let zs = Z;
    Z.flatMap((z) => z.cabinets || []).filter((c) => c.place?.planId === plan.id).forEach((c) => { zs = replaceCab(zs, dropPlace(c)); });
    // 先删报价里的引用；图片排队，等这个改动同步完、而且没有任何报价版本还在用，才真的删（QuoteApp）
    emit({ plans: P.filter((p) => p.id !== plan.id), zones: zs });
    hist.current = { undo: [], redo: [], last: null };
    setActiveId(P.find((p) => p.id !== plan.id)?.id || null);
    if (path) queuePlanDelete(path);
  };

  // ---------------- 坐标 ----------------
  const toSvg = (e) => {
    const el = svgRef.current;
    const m = el?.getScreenCTM?.();
    if (!m) return null;
    const p = el.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(m.inverse());
    return [q.x, q.y];
  };
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const measure = () => { const m = el.getScreenCTM && el.getScreenCTM(); if (m && m.a) setUpp(1 / m.a); };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vb.join(' '), open, full, plan?.id]);

  const zoomAt = (cx, cy, f) => setVb(([x, y, w, h]) => {
    const nw = Math.min(W * 4, Math.max(W / 25, w * f));
    const s = nw / w;
    return [cx - (cx - x) * s, cy - (cy - y) * s, w * s, h * s];
  });
  // 滑鼠滚轮缩放（要 passive:false 才能挡住页面捲动）
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const onWheel = (e) => { e.preventDefault(); const p = toSvg(e); if (p) zoomAt(p[0], p[1], e.deltaY > 0 ? 1.15 : 1 / 1.15); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open, full, plan?.id, W]); // eslint-disable-line react-hooks/exhaustive-deps

  const pxToMm = (p) => [p[0] * k, p[1] * k];
  const rectPx = (r) => [r[0] / k, r[1] / k, r[2] / k, r[3] / k];

  // ---------------- 指针 ----------------
  const onDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    const sp = toSvg(e);
    if (!sp) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, [e.clientX, e.clientY]);
      if (touches.current.size === 2) { // 两指缩放：取消正在做的拖拉；以两指中点为中心
        const [a, b] = [...touches.current.values()];
        const c = toSvg({ clientX: (a[0] + b[0]) / 2, clientY: (a[1] + b[1]) / 2 });
        pinch.current = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), vb, c };
        dragRef.current = null; setDrag(null);
        return;
      }
    }
    const base = { id: e.pointerId, sx: e.clientX, sy: e.clientY, sp, vb0: vb, touch: e.pointerType === 'touch' };
    const edgeEl = e.target?.closest?.('[data-pedge]');
    if (edgeEl && ready) {
      const [cid, edge] = edgeEl.getAttribute('data-pedge').split('|');
      const cab = allCabs.find((x) => x.cab.id === cid)?.cab;
      if (cab) { dragRef.current = { ...base, kind: 'edge', edge, start: cab }; return; }
    }
    const cabEl = e.target?.closest?.('[data-pcab]');
    if (mode === 'view' && cabEl && ready) {
      const cid = cabEl.getAttribute('data-pcab');
      const cab = allCabs.find((x) => x.cab.id === cid)?.cab;
      // 手指：要先选中才能拖（免得想平移却拖走了柜子）
      if (cab && (!base.touch || sel === cid)) { dragRef.current = { ...base, kind: 'maybeMove', start: cab }; return; }
      dragRef.current = { ...base, kind: 'tap', tapCab: cid };
      return;
    }
    if (mode === 'draw' && ready && !base.touch) { dragRef.current = { ...base, kind: 'maybeRect' }; return; }
    dragRef.current = { ...base, kind: 'maybePan' };
  };

  const onMove = (e) => {
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) touches.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch.current && touches.current.size === 2) {
      const [a, b] = [...touches.current.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const { vb: [x0, y0, w0, h0], c } = pinch.current;
      if (!d || !c) return;
      const f = Math.min((W * 4) / w0, Math.max(W / 25 / w0, pinch.current.d / d));
      setVb([c[0] - (c[0] - x0) * f, c[1] - (c[1] - y0) * f, w0 * f, h0 * f]);
      return;
    }
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - d.sx, e.clientY - d.sy);
    if (d.kind === 'maybePan' || d.kind === 'pan') {
      if (d.kind === 'maybePan' && moved < 6) return;
      // 平移：按下时的 viewBox 为准（屏幕位移 × 每屏幕 px 多少图片 px）
      const s = d.vb0[2] / (svgRef.current?.clientWidth || 1);
      const r = svgRef.current?.getBoundingClientRect();
      const sY = r ? d.vb0[3] / r.height : s;
      const nd = { ...d, kind: 'pan' };
      dragRef.current = nd;
      setVb([d.vb0[0] - (e.clientX - d.sx) * Math.max(s, sY), d.vb0[1] - (e.clientY - d.sy) * Math.max(s, sY), d.vb0[2], d.vb0[3]]);
      return;
    }
    const sp = toSvg(e);
    if (!sp) return;
    if (d.kind === 'maybeRect' || d.kind === 'rect') {
      if (d.kind === 'maybeRect' && moved < 6) return;
      const nd = { ...d, kind: 'rect', cur: sp };
      dragRef.current = nd; setDrag(nd);
      return;
    }
    if (d.kind === 'maybeMove' || d.kind === 'move') {
      if (d.kind === 'maybeMove' && moved < 5) return;
      const dx = snapMm((sp[0] - d.sp[0]) * k), dy = snapMm((sp[1] - d.sp[1]) * k);
      const cab = { ...d.start, place: { ...d.start.place, x: d.start.place.x + dx, y: d.start.place.y + dy } };
      const nd = { ...d, kind: 'move', cab };
      dragRef.current = nd; setDrag(nd);
      return;
    }
    if (d.kind === 'edge') {
      const dm = snapMm(((d.edge === 'left' || d.edge === 'right') ? sp[0] - d.sp[0] : sp[1] - d.sp[1]) * k);
      if (!dm) { if (drag) { dragRef.current = { ...d, cab: null }; setDrag(null); } return; }
      const r = dragPlanEdge(d.start, d.edge, dm);
      const nd = { ...d, cab: r.cab, rebuilt: r.rebuilt };
      dragRef.current = nd; setDrag(nd);
    }
  };

  const finishRect = (a, b, touch = false) => {
    const [ax, ay] = pxToMm(a), [bx, by] = pxToMm(b);
    const rect = { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
    if (rect.w < 200 || rect.h < 150) { toast('Box too small 框太小了（至少 0.20 × 0.15 m）', 'info'); return; }
    rect.x = snapMm(rect.x); rect.y = snapMm(rect.y); rect.w = snapMm(rect.w); rect.h = snapMm(rect.h);
    setMode('view');
    const go = () => onDraw({ planId: plan.id, rect, zoneId: drawZone || zones[0]?.id || null });
    // 手指点完第二个角：浏览器随后还会补一个 click，会点到刚打开的选模板卡片上 → 等一下再开
    if (touch) setTimeout(go, 450); else go();
  };

  const onUp = (e) => {
    touches.current.delete(e.pointerId);
    if (pinch.current) { if (touches.current.size < 2) pinch.current = null; dragRef.current = null; return; }
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null; setDrag(null);
    const sp = toSvg(e) || d.sp;
    if (d.kind === 'move' && d.cab) { commit({ zones: replaceCab(zones, d.cab) }); return; }
    if (d.kind === 'edge' && !d.cab) return; // 点了把手没拖：保持选中
    if (d.kind === 'edge' && d.cab) {
      commit({ zones: replaceCab(zones, d.cab) });
      if (d.rebuilt?.length) toast('Rebuilt from the template (the size change touched hand-drawn blocks) — Undo to go back 照模板重做了，按撤销可以回来', 'info');
      return;
    }
    if (d.kind === 'rect' && d.cur) { finishRect(d.sp, d.cur); return; }
    if (d.kind === 'pan') return;
    // ---- 点一下 ----
    if (d.kind === 'maybeMove' || d.kind === 'tap') { setSel(d.start?.id || d.tapCab); return; }
    if (!plan) return;
    if (mode === 'scale') {
      const pts = scalePts.length >= 2 ? [sp] : [...scalePts, sp];
      setScalePts(pts);
      return;
    }
    if (mode === 'draw' && ready) {
      if (!corner) { setCorner(sp); return; }
      finishRect(corner, sp, d.touch); setCorner(null);
      return;
    }
    if (mode === 'place' && ready && placing) {
      const x = allCabs.find((c) => c.cab.id === placing);
      if (x) {
        const [mx, my] = pxToMm(sp);
        const cab = { ...x.cab, place: placeAt(x.cab, snapMm(mx), snapMm(my), 0, plan.id) };
        commit({ zones: replaceCab(zones, cab) });
        setSel(cab.id);
      }
      setPlacing(null); setMode('view');
      return;
    }
    setSel(null);
  };

  // ---------------- 定比例 ----------------
  const applyScale = () => {
    const { mm } = parseMeters(scaleTxt);
    if (scalePts.length < 2 || !(mm > 0) || dist(scalePts[0], scalePts[1]) < 3) { toast('Tap two points, then type the real length 先点两点，再打真实长度', 'info'); return; }
    setPlan({ ...plan, scale: { a: scalePts[0].map((v) => Math.round(v * 10) / 10), b: scalePts[1].map((v) => Math.round(v * 10) / 10), mm } });
    setScalePts([]); setScaleTxt(''); setMode('view');
    toast(`Scale set 比例定好了：${mmToM(mm)} m`, 'success');
  };

  // ---------------- 选中的柜子 ----------------
  const rotateSel = () => { if (selCab) commit({ zones: replaceCab(zones, { ...selCab, place: rotatePlace(selCab, 90) }) }); };
  const unplaceSel = () => { if (selCab) { commit({ zones: replaceCab(zones, dropPlace(selCab)) }); setSel(null); } };
  const startPlace = (cid) => { setPlacing(cid); setMode('place'); setSel(null); };

  // ---------------- 画 ----------------
  const url = plan ? urls[plan.image?.path] : null;
  const sw = 1.5 * upp, fs = 12 * upp;
  const grip = (isCoarse() ? 10 : 6) * upp;
  const hw = (isCoarse() ? 26 : 12) * upp;

  const cabView = (x) => {
    const cab = drag?.cab && drag.cab.id === x.cab.id ? drag.cab : x.cab;
    const fp = placedFootprint(cab);
    const on = sel === cab.id;
    const bb = rectPx(fp.bbox);
    return (
      <g key={cab.id} data-pcab={cab.id} style={{ cursor: mode === 'view' ? 'move' : undefined, touchAction: on ? 'none' : undefined }}>
        {fp.parts.map((p) => {
          const r = rectPx(p.rect);
          return <rect key={p.id} x={r[0]} y={r[1]} width={r[2] - r[0]} height={r[3] - r[1]}
            fill={p.floor ? BLOCK_COLORS.closed : 'none'} fillOpacity={p.floor ? 0.85 : 0} stroke={INK} strokeWidth={sw} strokeDasharray={p.floor ? undefined : `${4 * upp} ${3 * upp}`} />;
        })}
        {/* 柜门那一边：粗线 */}
        {fp.parts.filter((p) => p.floor).map((p) => {
          const r = rectPx(p.rect); const [fx, fy] = p.front;
          const ln = fy > 0 ? [r[0], r[3], r[2], r[3]] : fy < 0 ? [r[0], r[1], r[2], r[1]] : fx > 0 ? [r[2], r[1], r[2], r[3]] : [r[0], r[1], r[0], r[3]];
          return <line key={`f${p.id}`} x1={ln[0]} y1={ln[1]} x2={ln[2]} y2={ln[3]} stroke={T.wood} strokeWidth={sw * 2.2} />;
        })}
        <text x={(bb[0] + bb[2]) / 2} y={(bb[1] + bb[3]) / 2} fontSize={Math.min(fs * 1.3, (bb[3] - bb[1]) * 0.6, (bb[2] - bb[0]) * 0.4)} textAnchor="middle" dominantBaseline="central" fill={INK} fontWeight={700} pointerEvents="none">{cab.code}</text>
        {on && <rect x={bb[0]} y={bb[1]} width={bb[2] - bb[0]} height={bb[3] - bb[1]} fill="none" stroke={BLOCK_SELECTED} strokeWidth={sw * 2} pointerEvents="none" />}
        {on && (drag?.cab || drag?.kind === 'move') && (
          <text x={(bb[0] + bb[2]) / 2} y={bb[1] - 8 * upp} fontSize={fs} textAnchor="middle" fill={T.ink} fontWeight={700} pointerEvents="none" data-plan-size>
            {mmToM(fp.bbox[2] - fp.bbox[0])} × {mmToM(fp.bbox[3] - fp.bbox[1])} m
          </text>
        )}
      </g>
    );
  };
  const selBox = selCab && selCab.place?.planId === plan?.id ? rectPx(placedFootprint(drag?.cab?.id === selCab.id ? drag.cab : selCab).bbox) : null;

  const content = (
    <div className={full ? 'fixed inset-0 z-40 flex flex-col' : ''} style={full ? { background: T.paper } : undefined} data-plan-board>
      {full && <BackCloser onBack={() => setFull(false)} />}
      {/* 顶栏：户型图选择 + 上传 + 模式 */}
      <div className="flex items-center gap-1.5 px-3 py-2 flex-wrap" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
        {!full && (
          <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 font-display text-base" style={{ color: T.ink }} data-plan-toggle>
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />} 户型图 <span className="text-xs" style={{ color: T.inkSoft }}>Floor plan</span>
          </button>
        )}
        {open && plans.length > 1 && (
          <select value={plan?.id || ''} onChange={(e) => setActiveId(e.target.value)} className="text-xs px-1.5 py-1.5 outline-none max-w-[40%]" data-plan-select
            style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 2, color: T.ink }}>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        {open && (
          <div className="ml-auto flex items-center gap-1 flex-wrap">
            <Btn title="Upload a floor plan 上传户型图（照片 / 截图 / PDF）" onClick={() => fileRef.current?.click()} data-plan-upload><Upload size={13} /> 上传 Upload</Btn>
            {plan && <>
              <Btn on={mode === 'scale'} title="Set scale 定比例" onClick={() => { setMode(mode === 'scale' ? 'view' : 'scale'); setScalePts([]); }} data-plan-mode="scale"><Ruler size={13} /> 比例</Btn>
              <Btn on={mode === 'draw'} disabled={!ready} title="Draw a cabinet 画柜子" onClick={() => { setMode(mode === 'draw' ? 'view' : 'draw'); setCorner(null); }} data-plan-mode="draw"><Square size={13} /> 画柜子</Btn>
              <Btn title="Undo 撤销" disabled={!hist.current.undo.length} onClick={undo} data-plan-undo><Undo2 size={13} /></Btn>
              <Btn title="Redo 重做" disabled={!hist.current.redo.length} onClick={redo}><Redo2 size={13} /></Btn>
              <Btn title="Fit 看全部" onClick={() => setVb([0, 0, W, H])}><ScanSearch size={13} /></Btn>
              <Btn title={full ? 'Exit full screen 退出全屏' : 'Full screen 全屏'} onClick={() => setFull(!full)} data-plan-full>{full ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</Btn>
            </>}
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" className="hidden" data-plan-file
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; onFile(f); }} />
      </div>

      {open && busy && <div className="px-3 py-2 text-xs flex items-center gap-1.5" style={{ color: T.inkSoft }}><Loader2 size={13} className="animate-spin" /> {busy}</div>}

      {open && !plan && !busy && (
        <button type="button" onClick={() => fileRef.current?.click()} className="w-full py-6 text-sm flex flex-col items-center gap-1" style={{ color: T.inkSoft }}>
          <Upload size={22} style={{ color: T.wood }} />
          上传户型图（照片 / 截图 / PDF），在图上画柜子、检查走道
          <span className="text-[11px]">Upload a floor plan (photo / screenshot / PDF) to place cabinets and check aisles</span>
        </button>
      )}

      {open && plan && (
        <>
          {/* 提示 / 比例输入 */}
          <div className="px-3 py-1.5 text-[11px] flex items-center gap-2 flex-wrap" style={{ background: T.cream, color: T.ink, borderBottom: `1px solid ${T.lineSoft}` }}>
            <input value={plan.name} onChange={(e) => emit({ plans: live.current.plans.map((p) => (p.id === plan.id ? { ...p, name: e.target.value } : p)), zones: live.current.zones })}
              className="bg-transparent outline-none text-xs font-medium min-w-0 w-36" style={{ color: T.ink }} title="Plan name 户型图名称" data-plan-name />
            {mode === 'scale' && (
              <span className="flex items-center gap-1.5 flex-wrap" data-plan-scale>
                <Ruler size={12} style={{ color: T.wood }} />
                {scalePts.length < 2 ? `点两点（例：一道墙两端）${scalePts.length}/2 — Tap two points (e.g. both ends of a wall)` : '打真实长度 Real length:'}
                {scalePts.length === 2 && <>
                  <input autoFocus value={scaleTxt} onChange={(e) => setScaleTxt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') applyScale(); }}
                    placeholder="2.70" inputMode="decimal" className="w-20 px-2 py-1 text-sm outline-none" data-plan-scale-input
                    style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 2 }} />
                  <span>m</span>
                  <Btn on onClick={applyScale} data-plan-scale-ok>OK</Btn>
                </>}
              </span>
            )}
            {mode === 'view' && ready && <span style={{ color: T.inkSoft }}>比例 1 px = {k.toFixed(1)} mm · 点柜子选中、拖动；拖边改尺寸 — Tap a cabinet, drag to move, drag an edge to resize</span>}
            {mode === 'draw' && (
              <span className="flex items-center gap-1.5 flex-wrap">
                <Square size={12} style={{ color: T.wood }} />
                {corner ? '点对角 Tap the opposite corner' : '拖出柜子的框（手机：点两个对角）— Drag the cabinet box (phone: tap two corners)'}
                {zones.length > 1 && (
                  <select value={drawZone || zones[0]?.id} onChange={(e) => setDrawZone(e.target.value)} className="text-xs px-1 py-0.5 outline-none" data-plan-zone
                    style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 2 }}>
                    {zones.map((z) => <option key={z.id} value={z.id}>{z.name || 'Room 房间'}</option>)}
                  </select>
                )}
              </span>
            )}
            {mode === 'place' && <span className="flex items-center gap-1.5"><MapPin size={12} style={{ color: T.wood }} /> 点图上的位置放 {allCabs.find((x) => x.cab.id === placing)?.cab.code} — Tap where it goes <Btn onClick={() => { setMode('view'); setPlacing(null); }}><X size={12} /></Btn></span>}
          </div>

          {/* 图 */}
          <div className={full ? 'flex-1 min-h-0' : 'h-[56vh] lg:h-[460px]'} style={{ background: '#fff' }}>
            <svg ref={svgRef} viewBox={vb.join(' ')} className="w-full h-full block select-none" data-plan-svg
              style={{ touchAction: 'none', cursor: mode === 'view' ? 'grab' : 'crosshair' }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
              <rect x={0} y={0} width={W} height={H} fill="#FAFAF7" />
              {url && <image href={url} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />}
              {url === '' && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={fs * 1.3} fill={T.inkSoft}>Image not available offline 图片离线看不到</text>}
              {/* 比例线 */}
              {plan.scale && mode !== 'scale' && (
                <g pointerEvents="none" opacity={0.6}>
                  <line x1={plan.scale.a[0]} y1={plan.scale.a[1]} x2={plan.scale.b[0]} y2={plan.scale.b[1]} stroke={T.wood} strokeWidth={sw} strokeDasharray={`${6 * upp} ${4 * upp}`} />
                </g>
              )}
              {mode === 'scale' && scalePts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={6 * upp} fill={T.terra} stroke="#fff" strokeWidth={sw} pointerEvents="none" />)}
              {mode === 'scale' && scalePts.length === 2 && <line x1={scalePts[0][0]} y1={scalePts[0][1]} x2={scalePts[1][0]} y2={scalePts[1][1]} stroke={T.terra} strokeWidth={sw * 1.5} pointerEvents="none" />}
              {/* 柜子 */}
              {ready && cabsHere.map(cabView)}
              {/* 走道 / 重叠提醒 */}
              {ready && warnings.map((w, i) => (w.kind === 'aisle' ? (
                <g key={i} pointerEvents="none" data-plan-aisle={w.level}>
                  <line x1={w.line[0][0] / k} y1={w.line[0][1] / k} x2={w.line[1][0] / k} y2={w.line[1][1] / k} stroke={w.level === 'warn' ? '#C0392B' : T.terra} strokeWidth={sw * 1.6} />
                  <text x={(w.line[0][0] + w.line[1][0]) / 2 / k + 4 * upp} y={(w.line[0][1] + w.line[1][1]) / 2 / k} fontSize={fs} fill={w.level === 'warn' ? '#C0392B' : T.terra} fontWeight={700} dominantBaseline="central">{w.gap}</text>
                </g>
              ) : (
                <rect key={i} x={w.rect[0] / k} y={w.rect[1] / k} width={(w.rect[2] - w.rect[0]) / k} height={(w.rect[3] - w.rect[1]) / k} fill="#C0392B" fillOpacity={0.35} pointerEvents="none" data-plan-overlap />
              )))}
              {/* 选中柜子的四边把手 */}
              {ready && selBox && mode === 'view' && [
                ['left', [selBox[0], selBox[1], selBox[0], selBox[3]], 'ew-resize'],
                ['right', [selBox[2], selBox[1], selBox[2], selBox[3]], 'ew-resize'],
                ['top', [selBox[0], selBox[1], selBox[2], selBox[1]], 'ns-resize'],
                ['bottom', [selBox[0], selBox[3], selBox[2], selBox[3]], 'ns-resize'],
              ].map(([edge, l, cursor]) => (
                <g key={edge} data-pedge={`${sel}|${edge}`} style={{ cursor }}>
                  <line x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} stroke="#000" strokeOpacity={0} strokeWidth={hw} />
                  <rect x={(l[0] + l[2]) / 2 - grip} y={(l[1] + l[3]) / 2 - grip} width={grip * 2} height={grip * 2} fill="#fff" stroke={BLOCK_SELECTED} strokeWidth={sw * 1.4} />
                </g>
              ))}
              {/* 画框中 */}
              {drag?.kind === 'rect' && drag.cur && (() => {
                const x = Math.min(drag.sp[0], drag.cur[0]), y = Math.min(drag.sp[1], drag.cur[1]);
                const w = Math.abs(drag.cur[0] - drag.sp[0]), h = Math.abs(drag.cur[1] - drag.sp[1]);
                return (
                  <g pointerEvents="none">
                    <rect x={x} y={y} width={w} height={h} fill={BLOCK_COLORS.open} fillOpacity={0.6} stroke={BLOCK_SELECTED} strokeWidth={sw * 1.4} strokeDasharray={`${6 * upp} ${4 * upp}`} />
                    <text x={x + w / 2} y={y + h / 2} fontSize={fs} textAnchor="middle" dominantBaseline="central" fill={T.ink} fontWeight={700} data-plan-draw-size>{mmToM(snapMm(w * k))} × {mmToM(snapMm(h * k))} m</text>
                  </g>
                );
              })()}
              {corner && <circle cx={corner[0]} cy={corner[1]} r={6 * upp} fill={BLOCK_SELECTED} pointerEvents="none" />}
            </svg>
          </div>

          {/* 选中的柜子 */}
          {selCab && selCab.place?.planId === plan.id && (
            <div className="px-3 py-2 flex items-center gap-1.5 flex-wrap text-xs" style={{ borderTop: `1px solid ${T.lineSoft}` }} data-plan-sel>
              <span className="font-medium mr-1" style={{ color: T.ink }}>{selCab.code} · {cabinetTitle(selCab, 'zh')}</span>
              <span style={{ color: T.inkSoft }} data-plan-sel-size>{(() => { const b = placedFootprint(selCab).bbox; return `${mmToM(b[2] - b[0])} × ${mmToM(b[3] - b[1])} m`; })()}</span>
              <span className="ml-auto flex gap-1">
                <Btn title="Turn 90° 转 90°" onClick={rotateSel} data-plan-rotate><RotateCw size={13} /> 转 90°</Btn>
                <Btn title="Edit cabinet 编辑柜子" onClick={() => { const x = allCabs.find((c) => c.cab.id === selCab.id); if (x) onEdit(x.zoneId, x.cab); }} data-plan-edit><Pencil size={13} /> 编辑</Btn>
                <Btn title="Take off the plan 从图上拿掉" onClick={unplaceSel} danger><X size={13} /></Btn>
              </span>
            </div>
          )}

          {/* 走道提醒 */}
          {ready && warnings.length > 0 && (
            <div className="px-3 py-2 space-y-0.5" style={{ borderTop: `1px solid ${T.lineSoft}` }} data-plan-warnings>
              {warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs" style={{ color: w.level === 'warn' ? T.terra : T.inkSoft }}>
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {lang === 'zh' ? w.msg.zh : `${w.msg.zh} — ${w.msg.en}`}
                </div>
              ))}
            </div>
          )}

          {/* 还没放到图上的柜子 */}
          {ready && notPlaced.length > 0 && (
            <div className="px-3 py-2 flex items-center gap-1.5 flex-wrap text-xs" style={{ borderTop: `1px solid ${T.lineSoft}` }} data-plan-unplaced>
              <span style={{ color: T.inkSoft }}>放到图上 Place:</span>
              {notPlaced.map((x) => (
                <Btn key={x.cab.id} on={placing === x.cab.id} onClick={() => startPlace(x.cab.id)} data-plan-place={x.cab.code}><Crosshair size={12} /> {x.cab.code} {cabinetTitle(x.cab, 'zh')}</Btn>
              ))}
            </div>
          )}

          <div className="px-3 py-1.5 flex justify-end" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
            <button type="button" onClick={removePlan} className="flex items-center gap-1 text-[11px]" style={{ color: T.terra }} data-plan-delete><Trash2 size={12} /> 删除这张户型图 Delete plan</button>
          </div>
        </>
      )}

      {pdf && createPortal(<PdfPagePicker pdf={pdf} onPick={pickPdfPage} onClose={() => setPdf(null)} />, document.body)}
    </div>
  );

  return (
    <div className="rounded overflow-hidden no-print" style={{ border: `1px solid ${T.line}`, background: T.paper }}>
      {content}
    </div>
  );
}

function PdfPagePicker({ pdf, onPick, onClose }) {
  useBackClose(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} data-pdf-pages>
      <div className="w-full sm:max-w-2xl max-h-[85vh] overflow-y-auto p-4" style={{ background: T.paper, borderRadius: 2 }}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-display text-lg" style={{ color: T.ink }}>选一页 Pick a page <span className="text-xs" style={{ color: T.inkSoft }}>{pdf.n}</span></div>
          <button type="button" onClick={onClose} className="p-1" style={{ color: T.inkSoft }} aria-label="Close 关闭"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Array.from({ length: pdf.n }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" onClick={() => onPick(n)} className="p-1.5 text-xs flex flex-col items-center gap-1" data-pdf-page={n}
              style={{ border: `1px solid ${T.line}`, borderRadius: 2, background: T.cream, color: T.ink }}>
              {pdf.thumbs[n] ? <img src={pdf.thumbs[n]} alt={`Page ${n}`} className="max-h-32 object-contain" /> : <span className="h-24 flex items-center"><Loader2 size={16} className="animate-spin" /></span>}
              第 {n} 页 Page {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
