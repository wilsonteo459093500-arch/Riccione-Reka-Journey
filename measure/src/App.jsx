import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Header from './components/Header.jsx';
import Uploader from './components/Uploader.jsx';
import Toolbar from './components/Toolbar.jsx';
import PlanCanvas from './components/PlanCanvas.jsx';
import CalibrationCard from './components/CalibrationCard.jsx';
import ItemList from './components/ItemList.jsx';
import SummaryPanel from './components/SummaryPanel.jsx';
import ProjectsPanel from './components/ProjectsPanel.jsx';
import HelpModal from './components/HelpModal.jsx';
import { Card } from './components/ui/Bits.jsx';
import { kindOf } from './constants.js';
import { dist, pathLength } from './services/geometry.js';
import { loadPlanFile } from './services/planLoader.js';
import { getProject, saveProject } from './services/projects.js';
import { loadPrefs, savePrefs, loadRates, saveRates, loadCurrentId, saveCurrentId } from './services/prefs.js';
import { summarize } from './services/summary.js';
import { buildCsv, buildSummaryText, copyText, download, exportAnnotatedPng, safeFilename } from './services/exporters.js';

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const stripExt = (n = '') => n.replace(/\.[^.]+$/, '');

export default function App() {
  const [plan, setPlan] = useState(null);
  const [file, setFile] = useState(null); // 原始文件，只为 PDF 换页用（刷新后就没了）
  const [calib, setCalib] = useState(null); // { points:[p1,p2], mm|null }
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState(null); // { target:'calib'|'item', kind, points:[] }
  const [mode, setMode] = useState('draw'); // 'select' | 'draw'
  const [kind, setKind] = useState('base');
  const [selectedId, setSelectedId] = useState(null);
  const [prefs, setPrefsState] = useState(loadPrefs);
  const [rates, setRatesState] = useState(loadRates);
  const [projectId, setProjectId] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyPng, setBusyPng] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [showProjects, setShowProjects] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const setPrefs = (next) => {
    setPrefsState(next);
    savePrefs(next);
  };

  /* ---------- 比例 ---------- */
  const calibPx = calib?.points?.length === 2 ? dist(calib.points[0], calib.points[1]) : 0;
  const mmPerPx = calib?.mm && calibPx > 0 ? calib.mm / calibPx : null;
  const calibPhase = calib?.mm ? 'done' : calib?.points?.length === 2 ? 'pending' : draft?.target === 'calib' ? 'drawing' : 'idle';

  const summary = useMemo(() => summarize(items, mmPerPx, rates), [items, mmPerPx, rates]);

  /* ---------- 载入 / 保存 ---------- */
  const openFile = useCallback(async (f, page = 1, keepName = null) => {
    setBusy(true);
    setError(null);
    try {
      const p = await loadPlanFile(f, { page });
      setFile(f);
      setPlan(p);
      setCalib(null);
      setItems([]);
      setDraft(null);
      setSelectedId(null);
      setMode('draw');
      setProjectId(uid());
      setName(keepName ?? stripExt(p.name));
    } catch (e) {
      setError(e?.message || '这个文件打不开，换一张试试');
    } finally {
      setBusy(false);
    }
  }, []);

  // 恢复上次未做完的项目
  useEffect(() => {
    const id = loadCurrentId();
    if (!id) return;
    getProject(id).then((p) => {
      if (!p?.plan) return;
      setProjectId(p.id);
      setName(p.name || '');
      setPlan(p.plan);
      setCalib(p.calib || null);
      setItems(p.items || []);
    });
  }, []);

  // 自动存档
  useEffect(() => {
    if (!plan || !projectId) return undefined;
    const t = setTimeout(() => {
      saveProject({ id: projectId, name, plan, calib, items });
      saveCurrentId(projectId);
    }, 800);
    return () => clearTimeout(t);
  }, [plan, projectId, name, calib, items]);

  // 粘贴截图
  useEffect(() => {
    const onPaste = (e) => {
      const files = [...(e.clipboardData?.files || [])];
      const f = files[0] || [...(e.clipboardData?.items || [])].find((i) => i.type?.startsWith('image/'))?.getAsFile();
      if (f) openFile(f);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [openFile]);

  /* ---------- 绘制 ---------- */
  function nextLabel(kindId) {
    const k = kindOf(kindId);
    const n = items.filter((i) => i.kind === kindId).length + 1;
    return `${k.label} ${n}`;
  }

  function commitItem(points, kindId) {
    if (points.length < 2 || pathLength(points) < 2) return;
    const item = { id: uid(), kind: kindId, label: nextLabel(kindId), points };
    setItems((prev) => [...prev, item]);
    setSelectedId(item.id);
  }

  function placePoint(p) {
    const pt = { x: p.x, y: p.y };
    if (!draft) {
      // 还没标定就先画标定线，标定过了就开始量
      setDraft(calib?.mm ? { target: 'item', kind, points: [pt] } : { target: 'calib', points: [pt] });
      return;
    }
    // 双击结束、或手抖点重了 —— 同一个位置不重复放点
    const last = draft.points[draft.points.length - 1];
    if (last && dist(last, pt) < 2) return;
    const points = [...draft.points, pt];
    if (draft.target === 'calib') {
      if (points.length >= 2) {
        setCalib({ points: points.slice(0, 2), mm: null });
        setDraft(null);
      } else {
        setDraft({ ...draft, points });
      }
      return;
    }
    if (!prefs.polyline && points.length >= 2) {
      commitItem(points, draft.kind);
      setDraft(null);
    } else {
      setDraft({ ...draft, points });
    }
  }

  function finishDraft() {
    if (!draft) return;
    if (draft.target === 'calib') {
      if (draft.points.length >= 2) setCalib({ points: draft.points.slice(0, 2), mm: null });
      setDraft(null);
      return;
    }
    if (draft.points.length >= 2) commitItem(draft.points, draft.kind);
    setDraft(null);
  }

  function undo() {
    if (draft?.points?.length) {
      const points = draft.points.slice(0, -1);
      setDraft(points.length ? { ...draft, points } : null);
      return;
    }
    if (items.length) {
      const last = items[items.length - 1];
      setItems((prev) => prev.slice(0, -1));
      if (selectedId === last.id) setSelectedId(null);
    }
  }

  function movePoint(itemId, index, p) {
    const pt = { x: p.x, y: p.y };
    if (itemId === '__calib__') {
      setCalib((c) => (c ? { ...c, points: c.points.map((q, i) => (i === index ? pt : q)) } : c));
      return;
    }
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, points: it.points.map((q, i) => (i === index ? pt : q)) } : it)));
  }

  const patchItem = (id, patch) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  function startCalibration() {
    setCalib(null);
    setDraft({ target: 'calib', points: [] });
    setMode('draw');
  }

  /* ---------- 快捷键 ---------- */
  useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName) || el?.isContentEditable;
      if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        undo();
        return;
      }
      if (typing) return;
      if (e.key === 'Enter') finishDraft();
      else if (e.key === 'Escape') {
        setDraft(null);
        setSelectedId(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        removeItem(selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ---------- 导出 ---------- */
  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  async function handleCopy() {
    const text = buildSummaryText({ name, items, mmPerPx, calib, rates, showQuote: prefs.showQuote });
    flash((await copyText(text)) ? '摘要已复制，去粘贴吧' : '复制失败，长按选中文字试试');
  }

  function handleCsv() {
    download(safeFilename(name, 'csv'), buildCsv({ items, mmPerPx }), 'text/csv;charset=utf-8');
  }

  async function handlePng() {
    setBusyPng(true);
    try {
      const dataUrl = await exportAnnotatedPng({ plan, items, calib, mmPerPx, name, rates, showQuote: prefs.showQuote });
      const blob = await (await fetch(dataUrl)).blob();
      download(safeFilename(name, 'png'), blob);
    } catch (e) {
      flash('导出标注图失败');
    } finally {
      setBusyPng(false);
    }
  }

  async function openProject(id) {
    const p = await getProject(id);
    if (!p?.plan) return;
    setProjectId(p.id);
    setName(p.name || '');
    setPlan(p.plan);
    setCalib(p.calib || null);
    setItems(p.items || []);
    setDraft(null);
    setSelectedId(null);
    setFile(null);
    setShowProjects(false);
    saveCurrentId(p.id);
  }

  function newPlan() {
    setPlan(null);
    setFile(null);
    setCalib(null);
    setItems([]);
    setDraft(null);
    setSelectedId(null);
    setProjectId(null);
    setName('');
    saveCurrentId(null);
  }

  function changePage(n) {
    if (!file) return;
    if ((items.length || calib) && !window.confirm('换页会清掉当前的标定和测量，确定？')) return;
    openFile(file, n, name);
  }

  const drawColor = draft?.target === 'calib' || calibPhase !== 'done' ? '#2563EB' : kindOf(draft?.kind || kind).color;

  return (
    <div className="h-[100dvh] flex flex-col bg-sail-paper">
      <Header
        hasPlan={!!plan}
        projectName={name}
        onRename={setName}
        onNew={newPlan}
        onOpenProjects={() => setShowProjects(true)}
        onHelp={() => setShowHelp(true)}
      />

      {!plan ? (
        <div className="flex-1 overflow-y-auto">
          <Uploader onFile={openFile} busy={busy} error={error} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row">
          <div className="flex flex-col shrink-0 lg:flex-1 lg:min-h-0">
            <Toolbar
              mode={mode}
              setMode={setMode}
              kind={kind}
              setKind={setKind}
              prefs={prefs}
              setPrefs={setPrefs}
              drafting={!!draft?.points?.length}
              onUndo={undo}
              onFinish={finishDraft}
              onCancel={() => setDraft(null)}
              canCalibrate={calibPhase === 'done'}
              onRecalibrate={startCalibration}
            />
            {plan.pageCount > 1 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-sail-tint border-b border-sail-line text-xs text-sail-muted">
                <span>
                  PDF 第 {plan.page} / {plan.pageCount} 页
                </span>
                {file ? (
                  <div className="flex gap-1">
                    {Array.from({ length: plan.pageCount }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        onClick={() => changePage(n)}
                        className={`w-6 h-6 rounded-md border text-[11px] ${
                          n === plan.page ? 'bg-sail-green-deep text-white border-sail-green-deep' : 'bg-white border-sail-line'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="text-sail-faint">（重开页面后要换页请重新上传 PDF）</span>
                )}
              </div>
            )}
            <div className="h-[58vh] lg:h-auto lg:flex-1 lg:min-h-0">
              <PlanCanvas
                plan={plan}
                items={items}
                calib={calib}
                draft={draft}
                mode={mode}
                ortho={prefs.ortho}
                mmPerPx={mmPerPx}
                unit={prefs.unit}
                selectedId={selectedId}
                drawColor={drawColor}
                onPlacePoint={placePoint}
                onFinishDraft={finishDraft}
                onSelect={(id) => {
                  setSelectedId(id);
                  if (id) setMode('select');
                }}
                onMovePoint={movePoint}
              />
            </div>
          </div>

          <aside className="w-full lg:w-[380px] shrink-0 lg:overflow-y-auto thin-scroll border-t lg:border-t-0 lg:border-l border-sail-line p-3 space-y-3">
            <CalibrationCard
              phase={calibPhase}
              pxLen={calibPx}
              mmPerPx={mmPerPx}
              calib={calib}
              unit={prefs.unit}
              onStart={startCalibration}
              onSubmit={(mm) => {
                setCalib((c) => ({ ...c, mm }));
                setMode('draw');
              }}
              onCancel={startCalibration}
            />

            <Card title="测量" right={<span className="text-xs text-sail-faint">{items.length} 条</span>}>
              <ItemList
                items={items}
                mmPerPx={mmPerPx}
                unit={prefs.unit}
                selectedId={selectedId}
                onSelect={(id) => {
                  setSelectedId(id);
                  setMode('select');
                }}
                onPatch={patchItem}
                onDelete={removeItem}
              />
            </Card>

            <Card title="汇总">
              <SummaryPanel
                summary={summary}
                rates={rates}
                onRate={(id, v) => {
                  const next = { ...rates, [id]: v === '' ? '' : Number(v) || 0 };
                  setRatesState(next);
                  saveRates(next);
                }}
                showQuote={prefs.showQuote}
                onToggleQuote={() => setPrefs({ ...prefs, showQuote: !prefs.showQuote })}
                onCopy={handleCopy}
                onCsv={handleCsv}
                onPng={handlePng}
                busyPng={busyPng}
              />
            </Card>

            <p className="text-[11px] text-sail-faint leading-relaxed px-1 pb-2">
              按图纸比例估算，误差通常 1–3%。报价、落单前请以现场复尺为准。
            </p>
          </aside>
        </div>
      )}

      <ProjectsPanel open={showProjects} onClose={() => setShowProjects(false)} onOpenProject={openProject} currentId={projectId} />
      <HelpModal open={showHelp} onClose={() => setShowHelp(false)} />

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-sail-ink text-white text-sm px-4 py-2 rounded-xl shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
