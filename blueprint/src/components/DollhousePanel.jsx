import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Upload, Loader2, Download, Trash2, Presentation, ImageIcon, X, FileText, Check, Info, Maximize2, Crop, Wand2, AlertTriangle, PencilRuler, Save,
  SlidersHorizontal,
} from 'lucide-react';
import {
  DOLLHOUSE_VIEWS, PLAN_SCOPES, renderPlanToImage, cropPlan, isFullBox, detectPlanRegion, dollhouseFloors, floorViewSlides, setFloorPlan,
  setFloorPlanUpload, setFloorRegion, setFloorPlanCrop, setFloorImage, addRender3d, removeRender3d, setRenderInfo, insertDollhouseSlide,
  findDollhouseSlides, hasFloorSlide,
} from '../ai/dollhouse.js';
import {
  floorPlan3d, setPlan3dGeo, setPlan3dView, normalizeView, defaultView, activeTextures, recropGeo, carryPlan3d, detectPlanGeometry, detectPlanItems,
} from '../ai/plan3d.js';
import { recommendCorner } from '../plan3d/scene.js';
import { renderGeo } from '../plan3d/edit.js';
import { detectSummary } from '../plan3d/detect.js';
import { storeBlob, getBlob, resolveUrl, onAssetsChanged, metaOf, measureBlob, canvasToBlob } from '../store/assets.js';
import { clientLine } from '../engine/model.js';
import PlanCropper from './PlanCropper.jsx';
import Plan3dEditor from './plan3d/Plan3dEditor.jsx';
import Plan3dPreview, { paintPlan3d, useTextureImages } from './plan3d/Plan3dPreview.jsx';
import { ViewOptions, TexturePanel, viewLabel } from './plan3d/Plan3dOptions.jsx';

// 「3D 户型图」面板：平面布置图 → 框选范围 → AI 先框出墙、门窗、柜子家具（或自己画）→ 在图纸上拖动核对
// → 程序按坐标出图（视角、材质贴图可选）→ 保存 → 插入提案。位置以设计师核对过的坐标为准，AI 不画图。
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

// —— AI 框图的任务放在模块级：切到别的标签再回来，进行中的状态还在 ——
// 'detect:项目id:楼层id' → { startedAt, stage:'structure'|'items' }（按项目区分：复制出来的项目楼层 id 相同）
const jobs = new Map();
const jobListeners = new Set();
function setJob(key, job) {
  if (job) jobs.set(key, job);
  else jobs.delete(key);
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

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

async function downloadSrc(src, filename) {
  const blob = await getBlob(src);
  if (!blob) throw new Error('图片不存在了');
  saveBlob(blob, filename);
}

const STAGE_ZH = { structure: 'AI 正在看墙和门窗（第 1 次看图）', items: 'AI 正在找柜子和家具（第 2 次看图）' };

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

  const [planBusy, setPlanBusy] = useState(false);
  const [pdfSource, setPdfSource] = useState(null); // { floorId, file, pages, page } 多页 PDF 可换页
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const [pendingInsert, setPendingInsert] = useState(null); // src：该层已有立体图页时，问替换还是再加一页
  const [cropper, setCropper] = useState(null); // { floorId, detecting } 框选对话框
  const [cropBusy, setCropBusy] = useState(false);
  const [detectErr, setDetectErr] = useState({}); // 楼层 id → AI 框图失败的原因
  const [editing, setEditing] = useState(null); // 正在核对位置的楼层 id
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const detectKey = (id) => `detect:${project.id}:${id}`;
  const job = jobMap.get(detectKey(fid));
  const myJobs = [...jobMap.keys()].filter((k) => k.startsWith(`detect:${project.id}:`)).length;
  const now = useNow(myJobs > 0);
  const planUrl = resolveUrl(floor?.plan);
  const sourceSrc = floor?.planSource || floor?.plan || null;
  const region = floor?.planRegion || null;
  const kind = region?.kind === 'floor' ? 'floor' : 'room';
  const scope = kind === 'floor' ? 'all' : floor?.planScope === 'all' ? 'all' : 'room';
  const cropped = !!floor?.planCrop;
  const info = floor?.render3dInfo || {};
  const renders = [...(floor?.renders3d || [])].reverse(); // 最新在前
  const deck3d = findDollhouseSlides(project, fid);
  const canSetFloorBg = hasFloorSlide(project, fid);
  const floorLabel = floor?.zh || '全屋';
  const scopeDef = PLAN_SCOPES.find((x) => x.id === scope) || PLAN_SCOPES[0];

  // ---------------- 这层楼的坐标、视角、贴图 ----------------
  const p3 = floorPlan3d(floor);
  const geo = p3?.geo || null;
  const hasRoom = !!geo && (geo.rooms || []).length > 0;
  const view = useMemo(() => normalizeView(p3?.view), [p3?.view]);
  const texSrcs = useMemo(() => activeTextures(p3), [p3]);
  const textures = useTextureImages(texSrcs);
  const summary = useMemo(() => (geo ? detectSummary(geo) : null), [geo]);
  const bestCorner = useMemo(() => {
    try {
      return hasRoom ? recommendCorner(renderGeo(geo)) : 'se';
    } catch {
      return 'se';
    }
  }, [geo, hasRoom]);
  const planMeta = metaOf(floor?.plan);
  const planSize = planMeta?.w && planMeta?.h ? { w: planMeta.w, h: planMeta.h } : geo?.source || null;
  const refSrcs = useMemo(() => floorViewSlides(project, fid).map((s) => s.image), [project, fid]);

  // ---------------- 平面图：上传 → 框选范围 ----------------
  async function handlePlanFile(file, page = 1) {
    if (!file || !fid) return;
    const target = fid;
    setPlanBusy(true);
    try {
      let pdf = null;
      const blob = await renderPlanToImage(file, { page, onInfo: (i) => (pdf = i) });
      const src = await storeBlob(blob, { projectId: project.id });
      onChange((p) => setFloorPlanUpload(p, target, src), { history: false }); // 上传的平面图 / 保存的立体图不进撤销历史
      setPdfSource(pdf && pdf.pages > 1 ? { floorId: target, file, pages: pdf.pages, page: pdf.page } : null);
      setDetectErr((m) => ({ ...m, [target]: '' }));
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
    if (!file) return;
    if (geo && !window.confirm('换一张图纸？按现在这张图纸核对好的位置会清掉。')) return;
    handlePlanFile(file);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (geo && !window.confirm('换一张图纸？按现在这张图纸核对好的位置会清掉。')) return;
    handlePlanFile(file);
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
    const old = floorPlan3d(floor);
    const oldBox = floor.plan === source ? null : floor.planCrop || null; // 旧图就是原图 = 没裁过
    const oldSize = old?.geo?.source || metaOf(floor.plan);
    setCropBusy(true);
    try {
      const blob = await getBlob(source);
      if (!blob) throw new Error('平面图找不到了，请重新上传');
      const whole = isFullBox(box);
      const planBlob = whole ? blob : await cropPlan(blob, box);
      const plan = whole ? source : await storeBlob(planBlob, { projectId: project.id });
      // 已经核对过位置：把框带到新范围上（范围外的丢掉）
      let carried = null;
      if (old?.geo) {
        const m = metaOf(plan);
        const size = m?.w && m?.h ? { w: m.w, h: m.h } : await measureBlob(planBlob);
        carried = recropGeo(old.geo, oldBox, oldSize, whole ? null : box, size);
      }
      onChange(
        (p) => {
          const next = setFloorPlanCrop(p, target, { plan, source, crop: box, scope: picked });
          return old?.geo ? carryPlan3d(next, target, { planSrc: plan, geo: carried }) : next;
        },
        { history: false }
      );
      setCropper(null);
      if (old?.geo) notify?.({ type: carried ? 'ok' : 'info', text: carried ? '范围改了，已把核对好的位置带过去，请再看一眼' : '范围变化太大，位置要重新核对' });
    } catch (e) {
      notify?.({ type: 'error', text: `裁剪失败：${e.message || e}` });
    } finally {
      setCropBusy(false);
    }
  }

  // ---------------- 位置：AI 先框 / 自己画 → 在图纸上核对 ----------------
  /** 存坐标；第一次存的时候顺便定下默认视角 */
  const saveGeo = (target, planSrc, g, extra) =>
    onChange(
      (p) => {
        const f = (p.floors || []).find((x) => x.id === target);
        if (!f || f.plan !== planSrc) return p; // 这期间图纸换了：丢掉
        const cur = floorPlan3d(f);
        return setPlan3dGeo(p, target, g, { ...(extra || {}), ...(cur?.view ? {} : { view: defaultView(g) }) });
      },
      { history: false }
    );

  async function runDetect() {
    if (!floor?.plan) return;
    if (!settings?.apiKey) {
      onOpenSettings?.();
      return;
    }
    const target = fid;
    const planSrc = floor.plan;
    const key = detectKey(target);
    if (jobs.has(key)) return;
    if (geo && summary && summary.rooms + summary.openings + summary.items > 0 && !window.confirm('让 AI 重新框一遍？现在核对好的位置会被替换。')) return;
    setJob(key, { startedAt: Date.now(), stage: 'structure' });
    setDetectErr((m) => ({ ...m, [target]: '' }));
    try {
      const blob = await getBlob(planSrc);
      if (!blob) throw new Error('平面图找不到了，请重新上传');
      const m = metaOf(planSrc);
      const size = m?.w && m?.h ? { w: m.w, h: m.h } : await measureBlob(blob);
      const res = await detectPlanGeometry({ settings, planBlob: blob, size, onStage: (stage) => jobs.has(key) && setJob(key, { ...jobs.get(key), stage }) });
      saveGeo(target, planSrc, res.geo, {
        detected: res.geo,
        detect: { at: Date.now(), partial: res.partial, notes: res.notes, itemsError: res.itemsError, raw: res.raw },
      });
      const s = res.summary;
      notify?.({
        type: res.itemsError ? 'info' : 'ok',
        text: res.itemsError
          ? `「${floorLabel}」的墙和门窗框好了；柜子家具没框出来（${res.itemsError}），可以在核对时重试或自己画`
          : `「${floorLabel}」AI 框好了：${s.items} 个柜子家具，${s.unsure} 个待确认。请在图纸上核对`,
      });
      setEditing((cur) => cur || target);
    } catch (e) {
      const text = e.message || String(e);
      setDetectErr((m) => ({ ...m, [target]: text }));
      notify?.({ type: 'error', text: `AI 框图失败：${text}` });
      if (e.keyProblem) onOpenSettings?.();
    } finally {
      setJob(key, null);
    }
  }

  async function redetectItems(g) {
    const blob = await getBlob(floor.plan);
    if (!blob) throw new Error('平面图找不到了，请重新上传');
    const res = await detectPlanItems({ settings, planBlob: blob, geo: g });
    return res.items;
  }

  /** 导出 AI 的原始回复和整理后的坐标（不含图纸），发给开发调提示词用 */
  function exportRaw() {
    const data = { at: p3?.detect?.at || null, size: planSize, notes: p3?.detect?.notes || [], itemsError: p3?.detect?.itemsError || '', raw: p3?.detect?.raw || null, detected: p3?.detected || null, corrected: geo };
    saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${safeName(project.name || 'plan3d')} · ${safeName(floorLabel)} · AI 框图结果.json`);
  }

  // ---------------- 出图：保存 ----------------
  async function saveRender() {
    if (!hasRoom || saving) return;
    const target = fid;
    setSaving(true);
    try {
      const canvas = document.createElement('canvas');
      if (!paintPlan3d(canvas, geo, view, textures)) throw new Error('还没有房间');
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      const src = await storeBlob(blob, { projectId: project.id, w: canvas.width, h: canvas.height });
      onChange((p) => setRenderInfo(addRender3d(p, target, src), target, src, { by: 'plan3d', ...view, tex: Object.keys(texSrcs), at: Date.now() }), { history: false });
      notify?.({ type: 'ok', text: `已保存到「${floorLabel}」的生成记录` });
    } catch (e) {
      notify?.({ type: 'error', text: `保存失败：${e.message || e}` });
    } finally {
      setSaving(false);
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
              上传平面布置图 → 框出要做的范围 → AI 先在图纸上框出墙、门窗、柜子，你拖动核对 → 程序按核对好的位置出图。图不是 AI 画的，所以位置不会跑；用来营造提案氛围，不是施工图。
            </p>
          </div>
          {floors.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {floors.map((f) => (
                <button key={f.id} type="button" className={chip(f.id === fid)} onClick={() => setFloorId(f.id)}>
                  {f.zh || f.en || '未命名楼层'}
                  {jobMap.has(detectKey(f.id)) && <Loader2 size={11} className="inline ml-1 animate-spin" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-[400px_minmax(0,1fr)] items-start">
          {/* ---------------- 左：图纸、位置、视角和材质 ---------------- */}
          <div className="space-y-4">
            {/* 1 平面图 */}
            <div className={card}>
              <div className={sectionLabel}>
                <span>① 平面布置图 · {floorLabel}</span>
                {floor?.plan && (
                  <button
                    type="button"
                    className="text-bp-faint hover:text-bp-danger font-normal"
                    onClick={() => (!geo || window.confirm('移除这张图纸？按它核对好的位置也会清掉。')) && onChange((p) => setFloorPlan(p, fid, null), { history: false })}
                  >
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
                    <div className="text-[11px]">一张图上并排两层？每个楼层各上传一次，框选范围时各框一层</div>
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

            {/* 2 核对位置 */}
            {floor?.plan && (
              <div className={card} data-testid="position-card">
                <div className={sectionLabel}>
                  <span>② 核对位置</span>
                  {p3?.detect?.raw && (
                    <button type="button" className="text-bp-faint hover:text-bp-ink font-normal" onClick={exportRaw} title="只有坐标和文字，不含图纸；AI 框得不准时发给开发调整用">
                      导出 AI 原始结果
                    </button>
                  )}
                </div>
                {job ? (
                  <div className="rounded-xl bg-bp-tint border border-bp-line px-3 py-4 text-xs text-bp-muted flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin shrink-0" />
                    <span>
                      {STAGE_ZH[job.stage] || 'AI 正在看图纸'} · {fmtSec(now - job.startedAt)}
                      <span className="block text-[11px] text-bp-faint mt-0.5">通常要 20–60 秒，可以先去改别的页</span>
                    </span>
                  </div>
                ) : geo ? (
                  <div className="space-y-2.5">
                    <div className="text-xs text-bp-ink">
                      房间 {summary.rooms} · 门窗 {summary.openings} · 柜子家具 {summary.items}
                      {summary.unsure > 0 && <span className="text-bp-danger"> · {summary.unsure} 个待确认</span>}
                    </div>
                    {!hasRoom && (
                      <div className="text-[11px] text-bp-danger flex items-center gap-1">
                        <AlertTriangle size={12} /> 还没有房间，出不了图：打开核对，先画出房间
                      </div>
                    )}
                    {p3?.detect?.partial && <div className="text-[11px] text-bp-faint">AI 的回复不完整，可能漏了东西，核对时留意。</div>}
                    {p3?.detect?.itemsError && <div className="text-[11px] text-bp-faint">上次 AI 没框出柜子家具：{p3.detect.itemsError}</div>}
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" className={btnPrimary} onClick={() => setEditing(fid)}>
                        <PencilRuler size={15} /> 在图纸上核对 / 修改
                      </button>
                      <button type="button" className={btnGhost} onClick={runDetect} title="AI 重新看一遍图纸（2 次看图），替换现在的位置">
                        <Wand2 size={12} /> 让 AI 重新框
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="text-xs text-bp-muted leading-relaxed">
                      先在图纸上定出墙、门窗和每个柜子的位置。可以让 AI 先框一遍再改，也可以自己画。
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" className={btnPrimary} onClick={runDetect}>
                        <Wand2 size={15} /> 让 AI 先框（2 次看图）
                      </button>
                      <button type="button" className={btnGhost} onClick={() => setEditing(fid)}>
                        <PencilRuler size={12} /> 我自己画
                      </button>
                    </div>
                    <div className="text-[11px] text-bp-faint leading-relaxed">
                      AI 框图用你的 Gemini key 看 2 次图（先墙和门窗，再柜子家具），不是出图，费用很低。{!settings?.apiKey && '还没有 key：点上面会先打开设置。'}
                    </div>
                  </div>
                )}
                {detectErr[fid] && !job && <div className="mt-2 text-[11px] text-bp-danger">AI 框图没成功：{detectErr[fid]}</div>}
              </div>
            )}

            {/* 3 视角和材质 */}
            {hasRoom && (
              <div className={card}>
                <div className={sectionLabel}>
                  <span className="inline-flex items-center gap-1.5">
                    <SlidersHorizontal size={12} /> ③ 视角
                  </span>
                </div>
                <ViewOptions view={view} bestCorner={bestCorner} onChange={(patch) => onChange((p) => setPlan3dView(p, fid, patch), { history: false })} />
                <div className={`${sectionLabel} mt-4`}>
                  <span>④ 材质贴图（可选）</span>
                </div>
                <TexturePanel project={project} floorId={fid} plan3d={p3} settings={settings} refSrcs={refSrcs} notify={notify} onChange={onChange} onOpenSettings={onOpenSettings} />
              </div>
            )}
          </div>

          {/* ---------------- 右：出图 + 生成记录 ---------------- */}
          <div className="space-y-4 min-w-0">
            {hasRoom && (
              <div className={card} data-testid="render-card">
                <div className={sectionLabel}>
                  <span>出图 · {viewLabel(view.view)}</span>
                  <span className="font-normal">程序按核对好的位置画，不花 key</span>
                </div>
                <Plan3dPreview geo={geo} view={view} textures={textures} longEdge={1400} className="rounded-xl overflow-hidden border border-bp-line bg-white" />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" className={btnPrimary} disabled={saving} onClick={saveRender}>
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 保存这张图
                  </button>
                  <span className="text-[11px] text-bp-faint">保存后进下面的生成记录，可以插入提案、下载。</span>
                </div>
              </div>
            )}

            <div className={card}>
              <div className={sectionLabel}>
                <span>生成记录 · {floorLabel}</span>
                {deck3d.length > 0 && <span className="font-normal text-bp-green">提案里已有 {deck3d.length} 页 3D 户型图</span>}
              </div>
              {!renders.length ? (
                <div className="py-14 text-center text-sm text-bp-faint">
                  <Box size={28} className="mx-auto mb-3 text-bp-rule" />
                  还没有保存的 3D 户型图。上传平面图、框好范围、核对位置，再点「保存这张图」。
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {renders.map((src, i) => {
                    const url = resolveUrl(src);
                    const inDeck = (project.slides || []).some((s) => s.tag === '3d' && s.image === src);
                    const isBg = floor?.image === src;
                    const meta = info[src] || {};
                    const legacy = meta.by !== 'plan3d';
                    const viewZh = legacy ? DOLLHOUSE_VIEWS.find((v) => v.id === meta.view)?.zh : viewLabel(meta.view);
                    return (
                      <div key={src} className="rounded-xl overflow-hidden border border-bp-line bg-white">
                        <button type="button" className="relative block w-full aspect-[4/3] bg-bp-tint group" onClick={() => url && setPreview(url)}>
                          {url && <img src={url} alt="3D 户型图" className="w-full h-full object-contain" />}
                          <span className="absolute right-2 top-2 p-1 rounded-md bg-white/85 text-bp-muted opacity-0 group-hover:opacity-100 transition-opacity">
                            <Maximize2 size={13} />
                          </span>
                          <span className="absolute left-2 top-2 flex flex-wrap gap-1 pr-8">
                            {i === 0 && <span className="px-1.5 py-0.5 rounded bg-bp-dark/80 text-bp-light text-[10px]">最新</span>}
                            {legacy && <span className="px-1.5 py-0.5 rounded bg-bp-dark/60 text-bp-light text-[10px]">旧版 AI 图</span>}
                            {viewZh && <span className="px-1.5 py-0.5 rounded bg-white/85 text-bp-muted text-[10px]">{viewZh}</span>}
                            {inDeck && <span className="px-1.5 py-0.5 rounded bg-bp-green/90 text-white text-[10px]">已在提案中</span>}
                            {isBg && <span className="px-1.5 py-0.5 rounded bg-bp-gold/90 text-white text-[10px]">章节页背景</span>}
                          </span>
                        </button>

                        {pendingInsert === src ? (
                          <div className="p-3 space-y-2 bg-bp-tint">
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
                            {canSetFloorBg && (
                              <button type="button" className={btnGhost} onClick={() => toggleFloorBg(src)} title="用作这一层的章节页背景">
                                <ImageIcon size={13} /> {isBg ? '取消章节页背景' : '设为章节页背景'}
                              </button>
                            )}
                            {!legacy && p3 && (
                              <button type="button" className={btnGhost} onClick={() => onChange((p) => setPlan3dView(p, fid, meta), { history: false })} title="把上面的视角换成这张图当时的设置">
                                用这张的视角
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

      {/* 核对位置 */}
      {editing === fid && floor?.plan && planSize && planUrl && (
        <Plan3dEditor
          key={floor.plan}
          planUrl={planUrl}
          size={planSize}
          geo={geo}
          detected={p3?.detected || null}
          textures={textures}
          canAi={!!settings?.apiKey}
          onChange={(g) => saveGeo(fid, floor.plan, g)}
          onClose={() => setEditing(null)}
          onRedetectItems={redetectItems}
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
