import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Upload, Loader2, Download, Trash2, Presentation, ImageIcon, X, FileText, RotateCcw, Check, Info, Maximize2,
  Crop, Plus, RefreshCw, Wand2, AlertTriangle, CheckCircle2, ListChecks,
} from 'lucide-react';
import {
  DOLLHOUSE_VIEWS, PLAN_SCOPES, MAX_REFS, MAX_BRIEF_ROWS, renderPlanToImage, cropPlan, isFullBox, detectPlanRegion, analyzePlan,
  generateDollhouse, refineDollhouse, checkDollhouse, dollhouseFloors, floorViewSlides, defaultRefIds, setFloorPlan,
  setFloorPlanUpload, setFloorRegion, setFloorPlanCrop, setFloorBrief, setFloorImage, addRender3d, removeRender3d, setRenderInfo,
  insertDollhouseSlide, findDollhouseSlides, hasFloorSlide,
} from '../ai/dollhouse.js';
import { storeBlob, getBlob, resolveUrl, onAssetsChanged, metaOf } from '../store/assets.js';
import { clientLine, uid } from '../engine/model.js';
import PlanCropper from './PlanCropper.jsx';

// 「3D 户型图」面板：平面布置图 → 框选范围 → AI 读成清单（可改）→ 俯视 3D 户型图 → 对照清单检查 → 文字修正。
// props: { project, settings, notify, onOpenSettings, onChange(updater) }

const card = 'bg-bp-card border border-bp-line rounded-2xl p-4';
const sectionLabel = 'flex items-center justify-between text-xs font-semibold text-bp-faint mb-2';
const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-bp-dark text-bp-light text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';
const btnGhost =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-bp-line bg-white text-xs text-bp-muted hover:bg-bp-tint hover:text-bp-ink disabled:opacity-50 disabled:cursor-not-allowed';
const chip = (active) =>
  `px-3 py-1.5 rounded-lg text-xs border transition-colors ${
    active ? 'bg-bp-dark text-bp-light border-bp-dark' : 'bg-white text-bp-muted border-bp-line hover:border-bp-rule'
  }`;

// —— 生成任务放在模块级：切到别的标签再回来，进行中的状态还在 ——
// '项目id:楼层id' → 出图 / 修正 { startedAt, msg }（按项目区分：复制出来的项目楼层 id 相同）；
// 'brief:项目id:楼层id' → 读图；'check:图片 src' → 对照检查
const jobs = new Map();
const jobListeners = new Set();
function setJob(floorId, job) {
  if (job) jobs.set(floorId, job);
  else jobs.delete(floorId);
  jobListeners.forEach((fn) => fn());
}
function useJobs() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    jobListeners.add(fn);
    return () => jobListeners.delete(fn);
  }, []);
  return jobs;
}

function useAssetsTick() {
  const [, setTick] = useState(0);
  useEffect(() => onAssetsChanged(() => setTick((t) => t + 1)), []);
}

/** 有任务进行时每秒刷新（显示已用时间） */
function useNow(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const fmtSec = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

async function downloadSrc(src, filename) {
  const blob = await getBlob(src);
  if (!blob) throw new Error('图片不存在了');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/** 视角示意：正俯视 = 正方形；微倾俯视 = 上窄下宽的梯形 */
function ViewGlyph({ id }) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" className="inline-block align-[-3px]" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
      {id === 'tilt' ? <path d="M4.5 3.5h7L14 12.5H2z" /> : <rect x="2.5" y="2.5" width="11" height="11" rx="1" />}
    </svg>
  );
}

const inputCls =
  'w-full rounded-lg border border-bp-line bg-white px-2.5 py-1.5 text-xs leading-relaxed text-bp-ink placeholder:text-bp-faint focus:outline-none focus:border-bp-gold';

/** 多行文字：高度跟着内容走 */
function AutoTextarea({ value, onChange, className = '', ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} value={value} onChange={onChange} className={`${inputCls} resize-none overflow-hidden ${className}`} {...rest} />;
}

const splitFixes = (text) =>
  String(text || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

export default function DollhousePanel({ project, settings, notify, onOpenSettings, onChange }) {
  useAssetsTick();
  const jobMap = useJobs();
  const floors = dollhouseFloors(project);
  const [floorId, setFloorId] = useState(floors[0]?.id);
  const floor = floors.find((f) => f.id === floorId) || floors[0];
  const fid = floor?.id;

  useEffect(() => {
    if (!floors.some((f) => f.id === floorId)) setFloorId(floors[0]?.id);
  }, [floors, floorId]);

  const views = useMemo(() => floorViewSlides(project, fid), [project, fid]);
  const [refsByFloor, setRefsByFloor] = useState({});
  const refIds = (refsByFloor[fid] ?? defaultRefIds(project, fid)).filter((id) => views.some((v) => v.id === id));
  const setRefIds = (ids) => setRefsByFloor((m) => ({ ...m, [fid]: ids }));

  const [view, setView] = useState('top');
  const [style, setStyle] = useState('');
  const [planBusy, setPlanBusy] = useState(false);
  const [pdfSource, setPdfSource] = useState(null); // { floorId, file, pages, page } 多页 PDF 可换页
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const [pendingInsert, setPendingInsert] = useState(null); // src：该层已有立体图页时，问替换还是再加一页
  const [cropper, setCropper] = useState(null); // { floorId, detecting } 框选对话框
  const [cropBusy, setCropBusy] = useState(false);
  const [briefErr, setBriefErr] = useState({}); // 楼层 id → 读图失败的原因
  const [fixOpen, setFixOpen] = useState(null); // 正在写修正的那张图
  const [fixText, setFixText] = useState('');
  const fileRef = useRef(null);

  const jobKey = (floorId) => `${project.id}:${floorId}`;
  const briefKey = (floorId) => `brief:${project.id}:${floorId}`;
  const checkKey = (src) => `check:${src}`;
  const job = jobMap.get(jobKey(fid));
  const briefJob = jobMap.get(briefKey(fid));
  const myJobs = [...jobMap.keys()].filter((k) => k.startsWith(`${project.id}:`) || k.startsWith(`brief:${project.id}:`)).length;
  const now = useNow(myJobs > 0);
  const planUrl = resolveUrl(floor?.plan);
  const sourceSrc = floor?.planSource || floor?.plan || null;
  const region = floor?.planRegion || null;
  const kind = region?.kind === 'floor' ? 'floor' : 'room';
  const scope = kind === 'floor' ? 'all' : floor?.planScope === 'all' ? 'all' : 'room';
  const cropped = !!floor?.planCrop;
  const brief = floor?.planBrief || null;
  const info = floor?.render3dInfo || {};
  const renders = [...(floor?.renders3d || [])].reverse(); // 最新在前
  const deck3d = findDollhouseSlides(project, fid);
  const canSetFloorBg = hasFloorSlide(project, fid);
  const floorLabel = floor?.zh || '全屋';
  const scopeDef = PLAN_SCOPES.find((x) => x.id === scope) || PLAN_SCOPES[0];

  // ---------------- 平面图：上传 → 框选范围 ----------------
  async function handlePlanFile(file, page = 1) {
    if (!file || !fid) return;
    const target = fid;
    setPlanBusy(true);
    try {
      let pdf = null;
      const blob = await renderPlanToImage(file, { page, onInfo: (i) => (pdf = i) });
      const src = await storeBlob(blob, { projectId: project.id });
      onChange((p) => setFloorPlanUpload(p, target, src), { history: false }); // 上传的平面图 / 生成的立体图不进撤销历史
      setPdfSource(pdf && pdf.pages > 1 ? { floorId: target, file, pages: pdf.pages, page: pdf.page } : null);
      setBriefErr((m) => ({ ...m, [target]: '' }));
      openCropper(target, blob, src);
    } catch (e) {
      notify?.({ type: 'error', text: `平面图读取失败：${e.message || e}` });
    } finally {
      setPlanBusy(false);
    }
  }

  function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) handlePlanFile(file);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handlePlanFile(file);
  }

  /** 打开框选对话框；还没让 AI 认过范围（新上传 / 旧项目）就在后台认一次，认不出也能手动框 */
  async function openCropper(target, blob, src, known = null) {
    const detect = !known && !!settings?.apiKey;
    setCropper({ floorId: target, detecting: detect });
    if (!detect) return;
    try {
      const found = await detectPlanRegion({ settings, blob: blob || (await getBlob(src)) });
      onChange((p) => ((p.floors || []).some((f) => f.id === target && (f.planSource || f.plan) === src) ? setFloorRegion(p, target, found) : p), { history: false });
    } catch {
      /* 认不出：留给设计师手动框 */
    } finally {
      setCropper((c) => (c && c.floorId === target ? { ...c, detecting: false } : c));
    }
  }

  function recrop() {
    if (!sourceSrc || planBusy) return;
    openCropper(fid, null, sourceSrc, region);
  }

  async function confirmCrop({ box, scope: picked }) {
    const target = fid;
    const source = sourceSrc;
    const foundKind = kind;
    const roomName = region?.roomName || '';
    setCropBusy(true);
    try {
      const blob = await getBlob(source);
      if (!blob) throw new Error('平面图找不到了，请重新上传');
      const whole = isFullBox(box);
      const planBlob = whole ? blob : await cropPlan(blob, box);
      const plan = whole ? source : await storeBlob(planBlob, { projectId: project.id });
      onChange((p) => setFloorPlanCrop(p, target, { plan, source, crop: box, scope: picked }), { history: false });
      setCropper(null);
      readBrief(target, { plan, planBlob, kind: foundKind, scope: picked, roomName });
    } catch (e) {
      notify?.({ type: 'error', text: `裁剪失败：${e.message || e}` });
    } finally {
      setCropBusy(false);
    }
  }

  // ---------------- 图纸清单 ----------------
  /** AI 把平面图读成清单；读完时平面图已经换了就丢掉结果 */
  async function readBrief(target, { plan, planBlob, kind: k, scope: sc, roomName }) {
    if (!settings?.apiKey) return;
    const key = briefKey(target);
    setBriefErr((m) => ({ ...m, [target]: '' }));
    setJob(key, { startedAt: Date.now(), msg: '' });
    try {
      const blob = planBlob || (await getBlob(plan));
      if (!blob) throw new Error('平面图找不到了，请重新上传');
      const result = await analyzePlan({ settings, planBlob: blob, kind: k, scope: sc, roomName });
      onChange((p) => ((p.floors || []).some((f) => f.id === target && f.plan === plan) ? setFloorBrief(p, target, result) : p), { history: false });
    } catch (e) {
      setBriefErr((m) => ({ ...m, [target]: e.message || String(e) }));
    } finally {
      setJob(key, null);
    }
  }

  function rereadBrief() {
    if (!settings?.apiKey) {
      onOpenSettings?.();
      return;
    }
    if (brief && !window.confirm('重新读图会覆盖你改过的清单，继续？')) return;
    readBrief(fid, { plan: floor.plan, kind, scope, roomName: region?.roomName || '' });
  }

  const editBrief = (fn) => onChange((p) => setFloorBrief(p, fid, fn(((p.floors || []).find((f) => f.id === fid) || {}).planBrief || brief)), { history: false });
  const setBriefField = (field, value) => editBrief((b) => ({ ...b, [field]: value }));
  const setRow = (id, patch) => editBrief((b) => ({ ...b, rows: (b.rows || []).map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const removeRow = (id) => editBrief((b) => ({ ...b, rows: (b.rows || []).filter((r) => r.id !== id) }));
  const addRow = () => editBrief((b) => ({ ...b, rows: [...(b.rows || []), { id: uid('r'), label: '', text: '' }] }));
  const startBlankBrief = () =>
    onChange((p) => setFloorBrief(p, fid, { kind, scope, title: region?.roomName || '', shape: '', rows: [{ id: uid('r'), label: '', text: '' }], outside: [] }), { history: false });

  // ---------------- 参考图 ----------------
  function toggleRef(id) {
    if (refIds.includes(id)) setRefIds(refIds.filter((x) => x !== id));
    else if (refIds.length >= MAX_REFS) notify?.({ type: 'warn', text: `最多选 ${MAX_REFS} 张参考效果图` });
    else setRefIds([...refIds, id]);
  }

  // ---------------- 出图 / 修正 / 检查 ----------------
  const jobCallbacks = (key) => ({
    onWait: (sec, n) => setJob(key, { ...jobs.get(key), msg: `被限流了，${sec} 秒后自动重试（第 ${n} 次）` }),
    onFallback: (model) => setJob(key, { ...jobs.get(key), msg: `高级 3D 模型暂不可用，改用 ${model} 再试一次…` }),
  });

  /** 出图后让 AI 对照图纸和清单检查一遍；检查失败不打扰（图已经出来了） */
  async function runCheck(target, src, { planBlob, renderBlob, brief: b, scope: sc, kind: k, title }) {
    const key = checkKey(src);
    setJob(key, { startedAt: Date.now(), msg: '' });
    try {
      const check = await checkDollhouse({ settings, planBlob, renderBlob, brief: b, scope: sc, kind: k, title });
      onChange((p) => ((p.floors || []).some((f) => f.id === target && (f.renders3d || []).includes(src)) ? setRenderInfo(p, target, src, { check }) : p), { history: false });
    } catch {
      /* 忽略 */
    } finally {
      setJob(key, null);
    }
  }

  async function generate() {
    if (!settings?.apiKey) {
      onOpenSettings?.();
      return;
    }
    if (!floor?.plan) {
      notify?.({ type: 'warn', text: '先上传这一层的平面布置图' });
      return;
    }
    const target = fid;
    const targetFloor = floor;
    const key = jobKey(target);
    const projectName = project.name || '这个项目';
    const refSrcs = refIds.map((id) => views.find((v) => v.id === id)?.image).filter(Boolean);
    const ctx = { brief, scope, kind, title: brief?.title || region?.roomName || '' };
    const usedView = view;
    setJob(key, { startedAt: Date.now(), msg: '' });
    try {
      const planBlob = await getBlob(targetFloor.plan);
      if (!planBlob) throw new Error('平面图找不到了，请重新上传');
      const blob = await generateDollhouse({ settings, planBlob, refSrcs, view: usedView, style, ...ctx, ...jobCallbacks(key) });
      const src = await storeBlob(blob, { projectId: project.id });
      onChange((p) => setRenderInfo(addRender3d(p, target, src), target, src, { view: usedView }), { history: false });
      notify?.({ type: 'ok', text: `「${projectName}」${targetFloor.zh || '全屋'} 3D 户型图生成好了，正在对照图纸检查` });
      runCheck(target, src, { planBlob, renderBlob: blob, ...ctx });
    } catch (e) {
      notify?.({ type: 'error', text: `「${projectName}」3D 户型图生成失败：${e.message || e}` });
    } finally {
      setJob(key, null);
    }
  }

  /** 在某张图上做文字修正：结果是新的一条记录，原图保留 */
  async function refine(src, fixes) {
    const list = (fixes || []).map((f) => String(f || '').trim()).filter(Boolean);
    if (!list.length) {
      notify?.({ type: 'warn', text: '先写要修正什么（每行一处）' });
      return;
    }
    if (!settings?.apiKey) {
      onOpenSettings?.();
      return;
    }
    const target = fid;
    const key = jobKey(target);
    const ctx = { brief, scope, kind, title: brief?.title || region?.roomName || '' };
    const parentView = info[src]?.view || view;
    setFixOpen(null);
    setFixText('');
    setJob(key, { startedAt: Date.now(), msg: '正在按你的说明修正…', refine: true });
    try {
      const renderBlob = await getBlob(src);
      if (!renderBlob) throw new Error('这张图找不到了');
      const planBlob = floor?.plan ? await getBlob(floor.plan) : null;
      const blob = await refineDollhouse({ settings, renderBlob, planBlob, fixes: list, ...jobCallbacks(key) });
      const next = await storeBlob(blob, { projectId: project.id });
      onChange((p) => setRenderInfo(addRender3d(p, target, next), target, next, { view: parentView, from: src, fixes: list }), { history: false });
      notify?.({ type: 'ok', text: '修正好了，原图还在生成记录里' });
      if (planBlob) runCheck(target, next, { planBlob, renderBlob: blob, ...ctx });
    } catch (e) {
      notify?.({ type: 'error', text: `修正失败：${e.message || e}` });
    } finally {
      setJob(key, null);
    }
  }

  // ---------------- 结果操作 ----------------
  function insert(src, mode) {
    setPendingInsert(null);
    const m = metaOf(src);
    const ratio = m?.w && m?.h ? m.w / m.h : 0; // 方图 / 竖图插入时排成图文页，整张图不被裁
    onChange((p) => insertDollhouseSlide(p, { floorId: fid, image: src, mode, ratio }));
    notify?.({
      type: 'ok',
      text:
        mode === 'replace' && deck3d.length
          ? '已替换提案里的 3D 户型图'
          : canSetFloorBg
            ? `已插入提案：「${floorLabel}」章节页之后`
            : '已插入提案（效果图之前）',
    });
  }

  function onInsertClick(src) {
    if (deck3d.length) setPendingInsert(src);
    else insert(src, 'add');
  }

  function toggleFloorBg(src) {
    const unset = floor?.image === src;
    onChange((p) => setFloorImage(p, fid, unset ? null : src));
    notify?.({ type: 'ok', text: unset ? '章节页背景已恢复为默认效果图' : `已设为「${floorLabel}」章节页背景` });
  }

  function remove(src) {
    if (!window.confirm('从生成记录里删除这张 3D 户型图？（已插入提案的页面不受影响）')) return;
    onChange((p) => removeRender3d(p, fid, src), { history: false });
  }

  async function download(src, i) {
    try {
      const base = safeName(project.name || clientLine(project.info) || 'Dreamhouse');
      await downloadSrc(src, `${base} · ${safeName(floorLabel)} · 3D 户型图${renders.length > 1 ? `-${renders.length - i}` : ''}.jpg`);
    } catch (e) {
      notify?.({ type: 'error', text: `下载失败：${e.message || e}` });
    }
  }

  const viewDef = DOLLHOUSE_VIEWS.find((v) => v.id === view) || DOLLHOUSE_VIEWS[0];
  const reading = !!briefJob;
  const genLabel = brief ? '按清单生成 3D 户型图' : '跳过清单直接生成';

  return (
    <div className="h-full overflow-y-auto thin-scroll bg-bp-paper">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
        {/* 标题 */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] tracking-[0.3em] text-bp-eyebrow">3D OVERVIEW</div>
            <h2 className="font-serif text-2xl text-bp-ink mt-1">3D 立体图 · 俯视户型图</h2>
            <p className="mt-1.5 text-xs text-bp-muted flex items-start gap-1.5 max-w-3xl leading-relaxed">
              <Info size={13} className="mt-0.5 shrink-0 text-bp-gold" />
              上传平面布置图 → 框出要做的范围 → 核对 AI 读出的图纸清单 → 生成俯视 3D 户型图。AI 出的图用来营造提案氛围，不是施工图。
            </p>
          </div>
          {floors.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {floors.map((f) => (
                <button key={f.id} type="button" className={chip(f.id === fid)} onClick={() => setFloorId(f.id)}>
                  {f.zh || f.en || '未命名楼层'}
                  {jobMap.has(jobKey(f.id)) && <Loader2 size={11} className="inline ml-1 animate-spin" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-[400px_minmax(0,1fr)] items-start">
          {/* ---------------- 左：输入 ---------------- */}
          <div className="space-y-4">
            {/* 1 平面图 */}
            <div className={card}>
              <div className={sectionLabel}>
                <span>① 平面布置图 · {floorLabel}</span>
                {floor?.plan && (
                  <button type="button" className="text-bp-faint hover:text-bp-danger font-normal" onClick={() => onChange((p) => setFloorPlan(p, fid, null), { history: false })}>
                    移除
                  </button>
                )}
              </div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => !planBusy && fileRef.current?.click()}
                className={`relative rounded-xl border border-dashed cursor-pointer overflow-hidden transition-colors ${
                  dragOver ? 'border-bp-gold bg-bp-gold/10' : 'border-bp-rule bg-bp-tint hover:border-bp-gold'
                }`}
              >
                {planUrl ? (
                  <div className="aspect-[4/3] bg-white">
                    <img src={planUrl} alt="平面布置图" className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="aspect-[4/3] flex flex-col items-center justify-center gap-2 text-bp-faint px-6 text-center">
                    <Upload size={22} />
                    <div className="text-sm text-bp-muted">点击或拖入平面布置图</div>
                    <div className="text-[11px]">JPG / PNG / PDF（PDF 默认取第 1 页）</div>
                  </div>
                )}
                {planBusy && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center gap-2 text-sm text-bp-muted">
                    <Loader2 size={16} className="animate-spin" /> 读取中…
                  </div>
                )}
                {planUrl && !planBusy && (
                  <span className="absolute right-2 bottom-2 px-2 py-1 rounded-md bg-white/90 border border-bp-line text-[11px] text-bp-muted">
                    更换
                  </span>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" className="hidden" onChange={onPickFile} />
              {pdfSource && pdfSource.floorId === fid && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-bp-faint">
                  <FileText size={12} /> PDF 共 {pdfSource.pages} 页，用第
                  {Array.from({ length: Math.min(pdfSource.pages, 12) }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={planBusy}
                      className={`${chip(n === pdfSource.page)} !px-2 !py-0.5`}
                      onClick={() => handlePlanFile(pdfSource.file, n)}
                    >
                      {n}
                    </button>
                  ))}
                  页
                </div>
              )}
              {floor?.plan && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
                  {cropped ? (
                    <span className="text-bp-muted">
                      范围：{kind === 'floor' ? '整层图纸' : scopeDef.zh}
                      {kind !== 'floor' && region?.roomName ? ` · ${region.roomName}` : ''}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-bp-danger">
                      <AlertTriangle size={12} /> 还没框选范围：标题、logo、装饰栏会干扰 AI
                    </span>
                  )}
                  <div className="flex-1" />
                  <button type="button" className={btnGhost} disabled={planBusy} onClick={recrop}>
                    <Crop size={12} /> {cropped ? '重新框选 / 改范围' : '框选范围'}
                  </button>
                </div>
              )}
            </div>

            {/* 2 图纸清单 */}
            {floor?.plan && (
              <div className={card} data-testid="brief-card">
                <div className={sectionLabel}>
                  <span>② 图纸清单（AI 读的，可以改）</span>
                  {(brief || briefErr[fid]) && !reading && (
                    <button type="button" className="text-bp-faint hover:text-bp-ink font-normal inline-flex items-center gap-1" onClick={rereadBrief}>
                      <RefreshCw size={11} /> 重新读图
                    </button>
                  )}
                </div>
                {reading ? (
                  <div className="py-6 flex flex-col items-center gap-2 text-xs text-bp-muted">
                    <Loader2 size={16} className="animate-spin" />
                    AI 正在读图纸 · {fmtSec(now - briefJob.startedAt)}
                    <span className="text-[11px] text-bp-faint">通常 10–40 秒；读完请核对每面墙的内容</span>
                  </div>
                ) : brief ? (
                  <div className="space-y-2">
                    <div className="text-[11px] text-bp-faint leading-relaxed">
                      出图会严格按这份清单摆放。「上 / 下 / 左 / 右」指图纸的方向；哪一行读错了直接改字。
                    </div>
                    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-1.5 items-start">
                      <span className="text-[11px] text-bp-faint pt-2">{brief.kind === 'floor' ? '楼层' : '房间'}</span>
                      <input className={inputCls} value={brief.title || ''} onChange={(e) => setBriefField('title', e.target.value)} placeholder="房间名（图上印的）" aria-label="房间名" />
                      <span className="text-[11px] text-bp-faint pt-2">形状比例</span>
                      <input className={inputCls} value={brief.shape || ''} onChange={(e) => setBriefField('shape', e.target.value)} placeholder="例如：近正方形，宽:深约 1:1" aria-label="形状比例" />
                    </div>
                    <div className="space-y-1.5 pt-1">
                      {(brief.rows || []).map((r) => (
                        <div key={r.id} className="grid grid-cols-[72px_minmax(0,1fr)_28px] gap-1.5 items-start" data-testid="brief-row">
                          <input className={`${inputCls} !px-2 font-medium`} value={r.label || ''} onChange={(e) => setRow(r.id, { label: e.target.value })} placeholder="哪面墙" aria-label="位置" />
                          <AutoTextarea value={r.text || ''} onChange={(e) => setRow(r.id, { text: e.target.value })} placeholder="这面墙有什么、贴着放了什么" aria-label={`${r.label || '这一行'}的内容`} />
                          <button type="button" className="h-8 flex items-center justify-center rounded-lg text-bp-faint hover:text-bp-danger hover:bg-bp-tint" onClick={() => removeRow(r.id)} title="删掉这一行" aria-label="删掉这一行">
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                    {(brief.rows || []).length < MAX_BRIEF_ROWS && (
                      <button type="button" className={btnGhost} onClick={addRow}>
                        <Plus size={12} /> 加一行
                      </button>
                    )}
                    {brief.kind !== 'floor' && scope === 'room' && (
                      <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-1.5 items-start pt-1">
                        <span className="text-[11px] text-bp-faint pt-2">范围外不画</span>
                        <input
                          className={inputCls}
                          value={(brief.outside || []).join('、')}
                          onChange={(e) => setBriefField('outside', e.target.value.split(/[、,，;；]+/).map((x) => x.trim()).filter(Boolean))}
                          placeholder="例如：楼梯、STORE"
                          aria-label="范围外不画的东西"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 text-xs text-bp-muted leading-relaxed">
                    {briefErr[fid] ? (
                      <div className="flex items-start gap-1.5 text-bp-danger">
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" /> 读图没成功：{briefErr[fid]}
                      </div>
                    ) : !settings?.apiKey ? (
                      <div>配置 API key 之后，AI 会先把图纸读成清单给你核对，再出图。</div>
                    ) : !cropped ? (
                      <div>先框选范围，AI 再读图纸。</div>
                    ) : (
                      <div>还没有清单。让 AI 读一遍图纸，核对后再出图，位置会准很多。</div>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {!cropped && settings?.apiKey ? (
                        <button type="button" className={btnGhost} onClick={recrop}>
                          <Crop size={12} /> 框选范围
                        </button>
                      ) : (
                        <button type="button" className={btnGhost} onClick={rereadBrief}>
                          <ListChecks size={12} /> {briefErr[fid] ? '重试读图' : settings?.apiKey ? '让 AI 读图' : '去配置 API key'}
                        </button>
                      )}
                      <button type="button" className={btnGhost} onClick={startBlankBrief}>
                        <Plus size={12} /> 自己写清单
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3 参考效果图 */}
            <div className={card}>
              <div className={sectionLabel}>
                <span>
                  ③ 参考效果图（已选 {refIds.length}/{MAX_REFS}）
                </span>
                {views.length > 0 && (
                  <button type="button" className="text-bp-faint hover:text-bp-ink font-normal inline-flex items-center gap-1" onClick={() => setRefIds(defaultRefIds(project, fid))}>
                    <RotateCcw size={11} /> 默认
                  </button>
                )}
              </div>
              {views.length ? (
                <div className="grid grid-cols-4 gap-1.5 max-h-72 overflow-y-auto thin-scroll pr-0.5">
                  {views.map((v) => {
                    const idx = refIds.indexOf(v.id);
                    const url = resolveUrl(v.image);
                    const title = [v.room, v.subtitle].filter(Boolean).join(' · ') || '效果图';
                    return (
                      <button
                        key={v.id}
                        type="button"
                        title={title}
                        onClick={() => toggleRef(v.id)}
                        className={`relative rounded-lg overflow-hidden border-2 text-left ${idx >= 0 ? 'border-bp-gold' : 'border-transparent hover:border-bp-line'}`}
                      >
                        <div className="aspect-[4/3] bg-bp-line/40">{url && <img src={url} alt="" className="w-full h-full object-cover" />}</div>
                        <div className="px-1 py-0.5 text-[10px] text-bp-muted truncate bg-white">{title}</div>
                        {idx >= 0 && (
                          <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-bp-dark text-bp-light text-[10px] flex items-center justify-center">
                            {idx + 1}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-bp-faint leading-relaxed">
                  这一层还没有效果图页 —— 只用平面图也能生成，材质会按暖木色默认风格。
                </div>
              )}
              {views.length > 0 && (
                <div className="mt-2 text-[11px] text-bp-faint leading-relaxed">参考图只用来取材质和色调（地板、木饰面、石材、布艺）；位置一律按图纸和清单。</div>
              )}
            </div>

            {/* 4 视角 + 说明 */}
            <div className={card}>
              <div className={sectionLabel}>
                <span>④ 视角</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DOLLHOUSE_VIEWS.map((v) => (
                  <button key={v.id} type="button" className={`${chip(v.id === view)} inline-flex items-center gap-1.5`} onClick={() => setView(v.id)} aria-pressed={v.id === view}>
                    <ViewGlyph id={v.id} />
                    {v.zh}
                  </button>
                ))}
              </div>
              <div className="mt-1.5 text-[11px] text-bp-faint">{viewDef.hint}图纸的上方就是画面的上方。</div>
              <div className={`${sectionLabel} mt-4`}>
                <span>补充说明（可选）</span>
              </div>
              <textarea
                rows={2}
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                placeholder="例如：傍晚暖光；地面统一浅色大理石"
                className="w-full rounded-xl border border-bp-line bg-white px-3 py-2 text-xs leading-relaxed text-bp-ink placeholder:text-bp-faint focus:outline-none focus:border-bp-gold resize-none"
              />
            </div>

            <button type="button" className={`${btnPrimary} w-full`} disabled={!!job || planBusy || reading || !floor?.plan} onClick={generate}>
              {job ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> {job.refine ? '修正中' : '生成中'} · {fmtSec(now - job.startedAt)}
                </>
              ) : reading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> 等 AI 读完图纸…
                </>
              ) : (
                <>
                  <Box size={16} /> {floor?.plan ? genLabel : '生成 3D 户型图'}
                </>
              )}
            </button>
            {job ? (
              <div className="text-[11px] text-bp-faint text-center -mt-2">{job.msg || '通常要 30–90 秒，可以先去改别的页，好了会提示你'}</div>
            ) : !floor?.plan ? (
              <div className="text-[11px] text-bp-faint text-center -mt-2">先上传平面布置图</div>
            ) : !brief && !reading ? (
              <div className="text-[11px] text-bp-faint text-center -mt-2">没有清单也能出图，但位置容易跑偏</div>
            ) : null}
          </div>

          {/* ---------------- 右：生成记录 ---------------- */}
          <div className={card}>
            <div className={sectionLabel}>
              <span>生成记录 · {floorLabel}</span>
              {deck3d.length > 0 && <span className="font-normal text-bp-green">提案里已有 {deck3d.length} 页 3D 户型图</span>}
            </div>
            {!renders.length && !job ? (
              <div className="py-16 text-center text-sm text-bp-faint">
                <Box size={28} className="mx-auto mb-3 text-bp-rule" />
                还没有 3D 户型图。上传平面图、框好范围、核对清单，再点生成。
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {job && (
                  <div className="rounded-xl overflow-hidden border border-bp-line">
                    <div className="aspect-[4/3] shimmer flex items-center justify-center text-xs text-bp-muted">
                      <Loader2 size={14} className="animate-spin mr-1.5" /> {job.refine ? '正在修正…' : '正在画 3D 户型图…'}
                    </div>
                    <div className="px-3 py-2 text-[11px] text-bp-faint">{fmtSec(now - job.startedAt)}</div>
                  </div>
                )}
                {renders.map((src, i) => {
                  const url = resolveUrl(src);
                  const inDeck = (project.slides || []).some((s) => s.tag === '3d' && s.image === src);
                  const isBg = floor?.image === src;
                  const meta = info[src] || {};
                  const checking = jobMap.has(checkKey(src));
                  const issues = meta.check?.issues || [];
                  const viewZh = DOLLHOUSE_VIEWS.find((v) => v.id === meta.view)?.zh;
                  return (
                    <div key={src} className="rounded-xl overflow-hidden border border-bp-line bg-white">
                      <button type="button" className="relative block w-full aspect-[4/3] bg-bp-tint group" onClick={() => url && setPreview(url)}>
                        {url && <img src={url} alt="3D 户型图" className="w-full h-full object-contain" />}
                        <span className="absolute right-2 top-2 p-1 rounded-md bg-white/85 text-bp-muted opacity-0 group-hover:opacity-100 transition-opacity">
                          <Maximize2 size={13} />
                        </span>
                        <span className="absolute left-2 top-2 flex gap-1">
                          {i === 0 && <span className="px-1.5 py-0.5 rounded bg-bp-dark/80 text-bp-light text-[10px]">最新</span>}
                          {meta.from && <span className="px-1.5 py-0.5 rounded bg-bp-dark/60 text-bp-light text-[10px]">修正版</span>}
                          {viewZh && <span className="px-1.5 py-0.5 rounded bg-white/85 text-bp-muted text-[10px]">{viewZh}</span>}
                          {inDeck && <span className="px-1.5 py-0.5 rounded bg-bp-green/90 text-white text-[10px]">已在提案中</span>}
                          {isBg && <span className="px-1.5 py-0.5 rounded bg-bp-gold/90 text-white text-[10px]">章节页背景</span>}
                        </span>
                      </button>

                      {/* 对照图纸检查的结果 */}
                      {checking ? (
                        <div className="px-3 pt-2.5 text-[11px] text-bp-faint flex items-center gap-1.5">
                          <Loader2 size={12} className="animate-spin" /> AI 正在对照图纸检查…
                        </div>
                      ) : meta.check?.ok ? (
                        <div className="px-3 pt-2.5 text-[11px] text-bp-green flex items-center gap-1.5">
                          <CheckCircle2 size={12} /> 对照图纸：没有发现明显不符
                        </div>
                      ) : issues.length ? (
                        <div className="mx-2.5 mt-2.5 rounded-lg bg-bp-tint border border-bp-line px-2.5 py-2" data-testid="check-issues">
                          <div className="text-[11px] font-medium text-bp-ink flex items-center gap-1.5">
                            <AlertTriangle size={12} className="text-bp-gold" /> 对照图纸，AI 发现 {issues.length} 处不符
                          </div>
                          <ul className="mt-1 space-y-0.5 text-[11px] text-bp-muted leading-relaxed list-disc pl-4">
                            {issues.map((it) => (
                              <li key={it}>{it}</li>
                            ))}
                          </ul>
                          <button type="button" className={`${btnGhost} mt-2`} disabled={!!job} onClick={() => refine(src, issues)}>
                            <Wand2 size={12} /> 一键修正这些问题
                          </button>
                        </div>
                      ) : null}

                      {fixOpen === src ? (
                        <div className="p-3 space-y-2 bg-bp-tint mt-2.5">
                          <div className="text-xs text-bp-ink">要改哪里？每行写一处，其余保持不变：</div>
                          <AutoTextarea
                            value={fixText}
                            onChange={(e) => setFixText(e.target.value)}
                            autoFocus
                            placeholder={'例如：\n左边的书桌贴着左墙\n去掉房间中间那面隔墙'}
                            aria-label="修正说明"
                            className="min-h-[64px]"
                          />
                          <div className="flex flex-wrap gap-1.5">
                            <button type="button" className={btnGhost} disabled={!!job || !splitFixes(fixText).length} onClick={() => refine(src, splitFixes(fixText))}>
                              <Wand2 size={12} /> 开始修正
                            </button>
                            <button type="button" className={btnGhost} onClick={() => setFixOpen(null)}>
                              取消
                            </button>
                          </div>
                        </div>
                      ) : pendingInsert === src ? (
                        <div className="p-3 space-y-2 bg-bp-tint mt-2.5">
                          <div className="text-xs text-bp-ink">这一层已经有 3D 户型图页了：</div>
                          <div className="flex flex-wrap gap-1.5">
                            <button type="button" className={btnGhost} onClick={() => insert(src, 'replace')}>
                              <Check size={12} /> 替换那一页的图
                            </button>
                            <button type="button" className={btnGhost} onClick={() => insert(src, 'add')}>
                              再加一页
                            </button>
                            <button type="button" className={btnGhost} onClick={() => setPendingInsert(null)}>
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5 p-2.5">
                          <button type="button" className={btnGhost} onClick={() => onInsertClick(src)} title="插入为提案里的一页">
                            <Presentation size={13} /> 插入提案
                          </button>
                          <button
                            type="button"
                            className={btnGhost}
                            disabled={!!job}
                            onClick={() => {
                              setPendingInsert(null);
                              setFixText('');
                              setFixOpen(src);
                            }}
                            title="用文字说明要改哪里，AI 只改这些地方"
                          >
                            <Wand2 size={13} /> 修正
                          </button>
                          {canSetFloorBg && (
                            <button type="button" className={btnGhost} onClick={() => toggleFloorBg(src)} title="用作这一层的章节页背景">
                              <ImageIcon size={13} /> {isBg ? '取消章节页背景' : '设为章节页背景'}
                            </button>
                          )}
                          <div className="flex-1" />
                          <button type="button" className={`${btnGhost} !px-2`} onClick={() => download(src, i)} title="下载">
                            <Download size={13} />
                          </button>
                          <button type="button" className={`${btnGhost} !px-2 hover:!text-bp-danger`} onClick={() => remove(src)} title="删除">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 框选范围 */}
      {cropper && cropper.floorId === fid && sourceSrc && (
        <PlanCropper
          key={sourceSrc}
          url={resolveUrl(sourceSrc)}
          region={region}
          detecting={cropper.detecting}
          initialBox={floor?.planCrop || null}
          initialScope={floor?.planScope || 'room'}
          busy={cropBusy}
          onConfirm={confirmCrop}
          onCancel={() => !cropBusy && setCropper(null)}
        />
      )}

      {/* 大图预览 */}
      {preview && (
        <div role="dialog" aria-modal="true" aria-label="3D 户型图预览" className="fixed inset-0 z-50 bg-bp-ink/80 flex items-center justify-center p-6" onClick={() => setPreview(null)}>
          <img src={preview} alt="3D 户型图预览" className="max-w-full max-h-full rounded-xl shadow-2xl" />
          <button type="button" className="absolute top-4 right-4 p-2 rounded-lg bg-white/90 text-bp-muted hover:text-bp-ink" onClick={() => setPreview(null)}>
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
