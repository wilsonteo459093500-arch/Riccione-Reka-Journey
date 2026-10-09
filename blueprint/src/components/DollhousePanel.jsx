import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Upload, Loader2, Download, Trash2, Presentation, ImageIcon, X, FileText, RotateCcw, Check, Info, Maximize2,
} from 'lucide-react';
import {
  DOLLHOUSE_ANGLES, MAX_REFS, renderPlanToImage, generateDollhouse, dollhouseFloors, floorViewSlides, floorRoomsList,
  defaultRefIds, setFloorPlan, setFloorImage, addRender3d, removeRender3d, insertDollhouseSlide, findDollhouseSlides,
  hasFloorSlide,
} from '../ai/dollhouse.js';
import { storeBlob, getBlob, resolveUrl, onAssetsChanged } from '../store/assets.js';
import { clientLine } from '../engine/model.js';

// 「3D 全屋立体图」面板：平面布置图 + 3–4 张效果图 → AI 照片级等轴测剖切鸟瞰（像 The Sims）。
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
const jobs = new Map(); // floorId → { startedAt, msg }
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

/** 方位示意：小方块 = 平面图（上方为北），圆点 = 镜头所在角 */
function AngleGlyph({ id }) {
  const pos = {
    'south-east': 'right-0.5 bottom-0.5',
    'south-west': 'left-0.5 bottom-0.5',
    'north-east': 'right-0.5 top-0.5',
    'north-west': 'left-0.5 top-0.5',
  }[id];
  return (
    <span className="relative inline-block w-4 h-4 rounded-[3px] border border-current opacity-80 align-[-3px]">
      <span className={`absolute w-1.5 h-1.5 rounded-full bg-current ${pos}`} />
    </span>
  );
}

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

  const [angle, setAngle] = useState('south-east');
  const [style, setStyle] = useState('');
  const [planBusy, setPlanBusy] = useState(false);
  const [pdfSource, setPdfSource] = useState(null); // { floorId, file, pages, page } 多页 PDF 可换页
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const [pendingInsert, setPendingInsert] = useState(null); // src：该层已有立体图页时，问替换还是再加一页
  const fileRef = useRef(null);

  const job = jobMap.get(fid);
  const now = useNow(jobMap.size > 0);
  const planUrl = resolveUrl(floor?.plan);
  const renders = [...(floor?.renders3d || [])].reverse(); // 最新在前
  const deck3d = findDollhouseSlides(project, fid);
  const canSetFloorBg = hasFloorSlide(project, fid);
  const floorLabel = floor?.zh || '全屋';

  // ---------------- 平面图 ----------------
  async function handlePlanFile(file, page = 1) {
    if (!file || !fid) return;
    const target = fid;
    setPlanBusy(true);
    try {
      let info = null;
      const blob = await renderPlanToImage(file, { page, onInfo: (i) => (info = i) });
      const src = await storeBlob(blob, { projectId: project.id });
      onChange((p) => setFloorPlan(p, target, src));
      setPdfSource(info && info.pages > 1 ? { floorId: target, file, pages: info.pages, page: info.page } : null);
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

  // ---------------- 参考图 ----------------
  function toggleRef(id) {
    if (refIds.includes(id)) setRefIds(refIds.filter((x) => x !== id));
    else if (refIds.length >= MAX_REFS) notify?.({ type: 'warn', text: `最多选 ${MAX_REFS} 张参考效果图` });
    else setRefIds([...refIds, id]);
  }

  // ---------------- 生成 ----------------
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
    const refSrcs = refIds.map((id) => views.find((v) => v.id === id)?.image).filter(Boolean);
    setJob(target, { startedAt: Date.now(), msg: '' });
    try {
      const planBlob = await getBlob(targetFloor.plan);
      if (!planBlob) throw new Error('平面图找不到了，请重新上传');
      const blob = await generateDollhouse({
        settings,
        planBlob,
        refSrcs,
        floor: targetFloor,
        angle,
        style,
        roomsList: floorRoomsList(project, target),
        onWait: (sec, n) => setJob(target, { ...jobs.get(target), msg: `被限流了，${sec} 秒后自动重试（第 ${n} 次）` }),
        onFallback: (model) => setJob(target, { ...jobs.get(target), msg: `高级 3D 模型暂不可用，改用 ${model} 再试一次…` }),
      });
      const src = await storeBlob(blob, { projectId: project.id });
      onChange((p) => addRender3d(p, target, src));
      notify?.({ type: 'ok', text: `${targetFloor.zh || '全屋'}立体图生成好了，可以插入提案` });
    } catch (e) {
      notify?.({ type: 'error', text: `立体图生成失败：${e.message || e}` });
    } finally {
      setJob(target, null);
    }
  }

  // ---------------- 结果操作 ----------------
  function insert(src, mode) {
    setPendingInsert(null);
    onChange((p) => insertDollhouseSlide(p, { floorId: fid, image: src, mode }));
    notify?.({
      type: 'ok',
      text:
        mode === 'replace' && deck3d.length
          ? '已替换提案里的立体图'
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
    if (!window.confirm('从生成记录里删除这张立体图？（已插入提案的页面不受影响）')) return;
    onChange((p) => removeRender3d(p, fid, src));
  }

  async function download(src, i) {
    try {
      const base = safeName(project.name || clientLine(project.info) || 'Dreamhouse');
      await downloadSrc(src, `${base} · ${safeName(floorLabel)} · 立体图${renders.length > 1 ? `-${renders.length - i}` : ''}.jpg`);
    } catch (e) {
      notify?.({ type: 'error', text: `下载失败：${e.message || e}` });
    }
  }

  const angleDef = DOLLHOUSE_ANGLES.find((a) => a.id === angle) || DOLLHOUSE_ANGLES[0];
  const cornerZh = { 'bottom-right': '右下角', 'bottom-left': '左下角', 'top-right': '右上角', 'top-left': '左上角' }[angleDef.corner];

  return (
    <div className="h-full overflow-y-auto thin-scroll bg-bp-paper">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
        {/* 标题 */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] tracking-[0.3em] text-bp-eyebrow">3D OVERVIEW</div>
            <h2 className="font-serif text-2xl text-bp-ink mt-1">3D 全屋立体图</h2>
            <p className="mt-1.5 text-xs text-bp-muted flex items-start gap-1.5 max-w-3xl leading-relaxed">
              <Info size={13} className="mt-0.5 shrink-0 text-bp-gold" />
              AI 立体图用来营造提案氛围，不是施工图；上传干净的平面布置图（家具布置图）+ 3–4 张效果图，效果最好。
            </p>
          </div>
          {floors.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {floors.map((f) => (
                <button key={f.id} type="button" className={chip(f.id === fid)} onClick={() => setFloorId(f.id)}>
                  {f.zh || f.en || '未命名楼层'}
                  {jobMap.has(f.id) && <Loader2 size={11} className="inline ml-1 animate-spin" />}
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
                  <button type="button" className="text-bp-faint hover:text-bp-danger font-normal" onClick={() => onChange((p) => setFloorPlan(p, fid, null))}>
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
            </div>

            {/* 2 参考效果图 */}
            <div className={card}>
              <div className={sectionLabel}>
                <span>
                  ② 参考效果图（已选 {refIds.length}/{MAX_REFS}）
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
            </div>

            {/* 3 镜头 + 说明 */}
            <div className={card}>
              <div className={sectionLabel}>
                <span>③ 镜头方位</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DOLLHOUSE_ANGLES.map((a) => (
                  <button key={a.id} type="button" className={`${chip(a.id === angle)} inline-flex items-center gap-1.5`} onClick={() => setAngle(a.id)}>
                    <AngleGlyph id={a.id} />
                    {a.zh}
                  </button>
                ))}
              </div>
              <div className="mt-1.5 text-[11px] text-bp-faint">镜头在平面图的{cornerZh}，斜 45° 俯看整层（按图纸上方为北）。</div>
              <div className={`${sectionLabel} mt-4`}>
                <span>补充说明（可选）</span>
              </div>
              <textarea
                rows={2}
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                placeholder="例如：傍晚暖光；地面统一浅色大理石；主人房保留床的位置"
                className="w-full rounded-xl border border-bp-line bg-white px-3 py-2 text-xs leading-relaxed text-bp-ink placeholder:text-bp-faint focus:outline-none focus:border-bp-gold resize-none"
              />
            </div>

            <button type="button" className={`${btnPrimary} w-full`} disabled={!!job || planBusy || !floor?.plan} onClick={generate}>
              {job ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> 生成中 · {fmtSec(now - job.startedAt)}
                </>
              ) : (
                <>
                  <Box size={16} /> 生成立体图
                </>
              )}
            </button>
            {job ? (
              <div className="text-[11px] text-bp-faint text-center -mt-2">{job.msg || '通常要 30–90 秒，可以先去改别的页，好了会提示你'}</div>
            ) : !floor?.plan ? (
              <div className="text-[11px] text-bp-faint text-center -mt-2">先上传平面布置图</div>
            ) : null}
          </div>

          {/* ---------------- 右：生成记录 ---------------- */}
          <div className={card}>
            <div className={sectionLabel}>
              <span>生成记录 · {floorLabel}</span>
              {deck3d.length > 0 && <span className="font-normal text-bp-green">提案里已有 {deck3d.length} 页立体图</span>}
            </div>
            {!renders.length && !job ? (
              <div className="py-16 text-center text-sm text-bp-faint">
                <Box size={28} className="mx-auto mb-3 text-bp-rule" />
                还没有立体图。上传平面图、选好参考图，点「生成立体图」。
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {job && (
                  <div className="rounded-xl overflow-hidden border border-bp-line">
                    <div className="aspect-video shimmer flex items-center justify-center text-xs text-bp-muted">
                      <Loader2 size={14} className="animate-spin mr-1.5" /> 正在搭建立体图…
                    </div>
                    <div className="px-3 py-2 text-[11px] text-bp-faint">{fmtSec(now - job.startedAt)}</div>
                  </div>
                )}
                {renders.map((src, i) => {
                  const url = resolveUrl(src);
                  const inDeck = (project.slides || []).some((s) => s.tag === '3d' && s.image === src);
                  const isBg = floor?.image === src;
                  return (
                    <div key={src} className="rounded-xl overflow-hidden border border-bp-line bg-white">
                      <button type="button" className="relative block w-full aspect-video bg-bp-line/40 group" onClick={() => url && setPreview(url)}>
                        {url && <img src={url} alt="立体图" className="w-full h-full object-cover" />}
                        <span className="absolute right-2 top-2 p-1 rounded-md bg-white/85 text-bp-muted opacity-0 group-hover:opacity-100 transition-opacity">
                          <Maximize2 size={13} />
                        </span>
                        <span className="absolute left-2 top-2 flex gap-1">
                          {i === 0 && <span className="px-1.5 py-0.5 rounded bg-bp-dark/80 text-bp-light text-[10px]">最新</span>}
                          {inDeck && <span className="px-1.5 py-0.5 rounded bg-bp-green/90 text-white text-[10px]">已在提案中</span>}
                          {isBg && <span className="px-1.5 py-0.5 rounded bg-bp-gold/90 text-white text-[10px]">章节页背景</span>}
                        </span>
                      </button>

                      {pendingInsert === src ? (
                        <div className="p-3 space-y-2 bg-bp-tint">
                          <div className="text-xs text-bp-ink">这一层已经有立体图页了：</div>
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
                          <button type="button" className={btnGhost} onClick={() => onInsertClick(src)} title="插入为一页满版效果图">
                            <Presentation size={13} /> 插入提案
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

      {/* 大图预览 */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-bp-ink/80 flex items-center justify-center p-6" onClick={() => setPreview(null)}>
          <img src={preview} alt="立体图预览" className="max-w-full max-h-full rounded-xl shadow-2xl" />
          <button type="button" className="absolute top-4 right-4 p-2 rounded-lg bg-white/90 text-bp-muted hover:text-bp-ink" onClick={() => setPreview(null)}>
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
