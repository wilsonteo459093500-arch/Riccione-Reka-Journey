// Material Board —— 移植自旧版 UKIR STUDIO（只保留 material board 功能）。
// 两种用法：
//   · 提案里（编辑器「Material Board 封面」分页）：每个项目一组画板；第一块「方案封面画板」自动导入本案材料；
//     成品（手动画板或 AI 实拍排版）一键设为方案封面。
//   · 独立画板（standalone，首页进入）：和旧版 UKIR STUDIO 一样，单纯做材质排版图（下载 PNG 发 WhatsApp / 社媒 / 打印）。
//
// props: { project, settings, notify, onOpenSettings, onUseAsCover: (blob, meta?) => Promise|void, standalone? }
//   meta = { source:'board'|'flatlay'|'upload', orientation:'portrait'|'landscape'|'square' }（可忽略）
//   standalone 时 project = { id: STANDALONE_ID }，不传 onUseAsCover
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PackageOpen, ImagePlus, LayoutGrid, Download, Stamp, LoaderCircle, Scissors, ChevronUp, ChevronDown, Trash2,
  RotateCcw,
} from 'lucide-react';
import { generateImage } from '../ai/gemini.js';
import { CUTOUT_PROMPT, DEFAULT_BOARD, FIRST_BOARD_NAME, EXPORT_LONG_EDGE, STANDALONE_RATIO_ID } from './constants.js';
import {
  boardHeight, gridLayout, collageLayout, nextSlot, materialLabel, materialsToImport, mergeImported, defaultTitles,
  newBoardSettings, legendEntries, orientationOf, safeFileName,
} from './layout.js';
import { listBoards, putBoard, removeBoard, getActiveBoardId, setActiveBoardId } from './store.js';
import {
  fileToBoardImage, assetToBoardImage, compressForStorage, dataUrlToInput, measureAspect, downloadBlob,
} from './images.js';
import { renderBoardCanvas, finishForDownload, canvasToCoverBlob } from './render.js';
import BoardStage from './BoardStage.jsx';
import LibraryPanel from './LibraryPanel.jsx';
import FlatlayPanel from './FlatlayPanel.jsx';
import CoverCard from './CoverCard.jsx';
import { BoardPanel, TitlePanel } from './BoardSettings.jsx';
import { card, input, btnPrimary, btnGhost, iconBtn } from './ui.js';

const uid = (p = 'i') => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const boardMeta = ({ id, name, createdAt, ts }) => ({ id, name, createdAt: createdAt || ts || 0 });
const stripBusy = (items) => items.map(({ busy, ...it }) => it);

export default function MoodBoard({ project, settings, notify, onOpenSettings, onUseAsCover, standalone = false }) {
  const projectId = project?.id || null;
  const info = project?.info;
  const materials = project?.materials;

  // ---- 画板集合 ----
  const [boards, setBoards] = useState([]); // [{ id, name, createdAt }]
  const [activeId, setActiveId] = useState(null);
  const [boardName, setBoardName] = useState('');
  const [board, setBoardState] = useState({ ...DEFAULT_BOARD });
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // ---- 进行中 ----
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [coverBusy, setCoverBusy] = useState(null); // 'board' | 'flatlay' | 'upload'
  const [coverDone, setCoverDone] = useState(false);

  const rootRef = useRef(null);
  const boardFileRef = useRef(null);
  const saveTimer = useRef(null);
  const latestRef = useRef(null); // 待落盘的画板记录
  const recRef = useRef(null); // 当前画板的 { id, projectId, createdAt }
  const itemsRef = useRef(items);
  const boardRef = useRef(board);
  const importingRef = useRef(false);
  const coverBusyRef = useRef(false);
  const saveWarned = useRef(false);
  itemsRef.current = items;
  boardRef.current = board;

  const setBoard = useCallback((patch) => setBoardState((b) => ({ ...b, ...patch })), []);
  const boardH = boardHeight(board.ratioId);
  const selected = items.find((it) => it.id === selectedId) || null;
  const legend = useMemo(() => legendEntries(items), [items]);
  const importable = useMemo(() => materialsToImport(materials, items), [materials, items]);
  const hasKey = !!settings?.apiKey;

  function applyRecord(rec) {
    recRef.current = { id: rec.id, projectId: rec.projectId, createdAt: rec.createdAt || rec.ts || Date.now() };
    const nextItems = (rec.items || []).map((it) => ({ ...it, busy: false }));
    itemsRef.current = nextItems;
    setActiveId(rec.id);
    setBoardName(rec.name || '画板');
    setBoardState({ ...DEFAULT_BOARD, ...(rec.board || {}) });
    setItems(nextItems);
    setSelectedId(null);
  }

  async function flushSave() {
    clearTimeout(saveTimer.current);
    if (latestRef.current) await putBoard(latestRef.current);
  }

  // ---- 按项目加载画板（没有就建第一块「方案封面画板」） ----
  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    setLoaded(false);
    (async () => {
      let all = await listBoards(projectId);
      const act = await getActiveBoardId(projectId);
      if (cancelled) return;
      let rec = all.find((b) => b.id === act) || all[0];
      if (!rec) {
        const now = Date.now();
        rec = {
          id: uid('b'),
          projectId,
          name: standalone ? '画板 1' : FIRST_BOARD_NAME,
          board: standalone ? newBoardSettings(null, { ratioId: STANDALONE_RATIO_ID }) : newBoardSettings(info),
          items: [],
          createdAt: now,
          ts: now,
        };
        await putBoard(rec);
        await setActiveBoardId(projectId, rec.id);
        all = [rec];
        if (cancelled) return;
      }
      setBoards(all.map(boardMeta));
      applyRecord(rec);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
      // 换项目 / 卸载：立刻落盘
      clearTimeout(saveTimer.current);
      if (latestRef.current) putBoard(latestRef.current);
      latestRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // ---- 自动保存（800ms 防抖） ----
  useEffect(() => {
    if (!loaded || !activeId || recRef.current?.id !== activeId) return undefined;
    latestRef.current = {
      ...recRef.current,
      name: boardName,
      board,
      items: stripBusy(items),
      ts: Date.now(),
    };
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const rec = latestRef.current;
      if (!rec) return;
      const ok = await putBoard(rec);
      if (!ok && !saveWarned.current) {
        saveWarned.current = true;
        notify?.({ type: 'warn', text: '画板没能保存到本机（浏览器存储空间可能不足）' });
      }
    }, 800);
    return () => clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, items, boardName, activeId, loaded]);

  // ---- 画板管理 ----
  async function switchBoard(id) {
    if (!id || id === activeId) return;
    await flushSave();
    const all = await listBoards(projectId);
    const rec = all.find((b) => b.id === id);
    if (!rec) return;
    latestRef.current = null;
    applyRecord(rec);
    setBoards(all.map(boardMeta));
    await setActiveBoardId(projectId, id);
  }

  async function newBoard() {
    await flushSave();
    const now = Date.now();
    const rec = {
      id: uid('b'),
      projectId,
      name: `画板 ${boards.length + 1}`,
      board: newBoardSettings(standalone ? null : info, board),
      items: [],
      createdAt: now,
      ts: now,
    };
    await putBoard(rec);
    await setActiveBoardId(projectId, rec.id);
    latestRef.current = null;
    setBoards((prev) => [...prev, boardMeta(rec)]);
    applyRecord(rec);
  }

  async function deleteBoard() {
    if (boards.length <= 1) {
      notify?.({ type: 'warn', text: '至少保留一块画板' });
      return;
    }
    if (!window.confirm(`删除画板「${boardName || '未命名画板'}」？画板上的素材和实拍图都会删掉。`)) return;
    clearTimeout(saveTimer.current);
    latestRef.current = null;
    recRef.current = null; // 删除期间别再自动保存这块画板
    await removeBoard(activeId);
    const all = await listBoards(projectId);
    setBoards(all.map(boardMeta));
    if (all.length) {
      applyRecord(all[0]);
      await setActiveBoardId(projectId, all[0].id);
    }
    notify?.({ type: 'ok', text: '画板已删除' });
  }

  function renameBoard(name) {
    setBoardName(name);
    setBoards((prev) => prev.map((b) => (b.id === activeId ? { ...b, name } : b)));
  }

  // ---- 素材 ----
  const patchItem = useCallback((id, patch) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it))), []);

  /** 导入本案材料（PDF 里自动识别的材质小样） */
  async function importMaterials({ auto = false } = {}) {
    if (importingRef.current) return;
    const todo = materialsToImport(materials, itemsRef.current);
    if (!todo.length) {
      if (!auto) {
        const any = (materials || []).some((m) => m.image);
        notify?.({ type: 'warn', text: any ? '本案材料都已经在画板上了' : '方案 PDF 里没有识别到带图片的材料' });
      }
      return;
    }
    importingRef.current = true;
    setImporting(true);
    const startBoard = recRef.current?.id;
    try {
      const results = await Promise.all(todo.map((m) => assetToBoardImage(m.image).catch(() => null)));
      if (recRef.current?.id !== startBoard) return; // 导入期间换了画板
      const incoming = [];
      results.forEach((img, i) => {
        if (!img) return;
        const m = todo[i];
        incoming.push({ id: uid(), dataUrl: img.dataUrl, aspect: img.aspect, w: 18, x: 0, y: 0, rot: 0, label: materialLabel(m), materialId: m.id });
      });
      const failed = todo.length - incoming.length;
      if (incoming.length) {
        const b = boardRef.current;
        setItems((prev) => mergeImported(prev, incoming, boardHeight(b.ratioId), { titlePos: b.titlePos }));
        setBoard({ autoImported: true });
      }
      if (incoming.length || !auto) {
        notify?.({
          type: incoming.length ? 'ok' : 'warn',
          text: incoming.length
            ? `已导入 ${incoming.length} 种本案材料${failed ? `（${failed} 张图读不到，跳过）` : ''}`
            : '本案材料的图片读不到，请到「材料清单」重新上传',
        });
      }
    } finally {
      importingRef.current = false;
      setImporting(false);
    }
  }

  // 第一块画板还空着 → 自动导入一次（之后清空了也不再自动加）
  const firstBoardId = boards[0]?.id;
  const importableCount = importable.length;
  useEffect(() => {
    if (standalone || !loaded || !activeId || activeId !== firstBoardId) return;
    if (items.length || board.autoImported || !importableCount) return;
    importMaterials({ auto: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, activeId, firstBoardId, importableCount]);

  async function addFiles(fileList) {
    const files = [...(fileList || [])].filter((f) => f.type.startsWith('image/'));
    for (const file of files) {
      try {
        const img = await fileToBoardImage(file);
        setItems((prev) => [
          ...prev,
          { id: uid(), dataUrl: img.dataUrl, aspect: img.aspect, w: 24, ...nextSlot(prev.length), rot: 0, label: '' },
        ]);
      } catch (e) {
        notify?.({ type: 'error', text: e.message });
      }
    }
  }

  async function addFromLibrary(libItem) {
    const aspect = await measureAspect(libItem.dataUrl);
    setItems((prev) => [
      ...prev,
      { id: uid(), dataUrl: libItem.dataUrl, aspect, w: 20, ...nextSlot(prev.length), rot: 0, label: libItem.name || '' },
    ]);
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }

  function moveLayer(id, dir) {
    setItems((prev) => {
      const i = prev.findIndex((it) => it.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function autoLayout(kind) {
    const fn = kind === 'grid' ? gridLayout : collageLayout;
    setItems((prev) => fn(prev, boardH, { titlePos: board.titlePos }));
  }

  // ---- AI 抠图 ----
  async function cutout(id) {
    if (!hasKey) {
      onOpenSettings?.();
      return;
    }
    const it = itemsRef.current.find((x) => x.id === id);
    if (!it || it.busy) return;
    patchItem(id, { busy: true });
    try {
      const raw = await generateImage(settings, CUTOUT_PROMPT, dataUrlToInput(it.dataUrl), null);
      const dataUrl = await compressForStorage(raw, 1600);
      const aspect = await measureAspect(dataUrl);
      patchItem(id, { dataUrl, aspect, busy: false });
      notify?.({ type: 'ok', text: '抠图完成' });
    } catch (e) {
      patchItem(id, { busy: false });
      notify?.({ type: 'error', text: `抠图失败：${e.message}` });
    }
  }

  // ---- 键盘：Delete 删除、方向键微调、Esc 取消选中 ----
  useEffect(() => {
    if (!selectedId) return undefined;
    function onKey(e) {
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (!rootRef.current || rootRef.current.offsetParent === null) return; // 标签页隐藏时不响应
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeItem(selectedId);
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      } else if (/^Arrow/.test(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 2 : 0.5;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        setItems((prev) => prev.map((it) => (it.id === selectedId ? { ...it, x: it.x + dx, y: it.y + dy } : it)));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ---- 方案封面 ----
  /** makeBlob() 产出封面图 → 交给壳层 onUseAsCover（存素材、写 project.cover.image） */
  async function runCover(source, makeBlob, meta = {}) {
    if (!onUseAsCover) {
      notify?.({ type: 'warn', text: '这里还没接上方案封面，请从项目编辑器里打开 Material Board' });
      return;
    }
    if (coverBusyRef.current) return;
    coverBusyRef.current = true;
    setCoverBusy(source);
    try {
      const blob = await makeBlob();
      await onUseAsCover(blob, { source, ...meta });
      setCoverDone(true);
      notify?.({ type: 'ok', text: '已设为方案封面 —— 到「页面」里看看效果' });
    } catch (e) {
      notify?.({ type: 'error', text: `设为封面失败：${e?.message || e}` });
    } finally {
      coverBusyRef.current = false;
      setCoverBusy(null);
    }
  }

  /** AI 实拍图（FlatlayPanel 已给出干净的 Blob） */
  const flatlayAsCover = (blob, meta) => runCover('flatlay', async () => blob, meta);

  /** 手动画板 → 无标题 / 无图例 / 无水印的高清 JPEG */
  function boardAsCover() {
    if (!items.length) {
      notify?.({ type: 'warn', text: '画板还是空的，先导入本案材料或加几张图片' });
      return;
    }
    const snapshot = { items: stripBusy(items), board };
    runCover(
      'board',
      async () => {
        const canvas = await renderBoardCanvas({ ...snapshot, longEdge: EXPORT_LONG_EDGE, withTitle: false, withLegend: false });
        return await canvasToCoverBlob(canvas);
      },
      { orientation: orientationOf(board.ratioId) }
    );
  }

  function uploadCover(file) {
    if (!file.type.startsWith('image/')) {
      notify?.({ type: 'warn', text: '请上传图片文件（JPG / PNG）' });
      return;
    }
    runCover('upload', async () => file);
  }

  /** 下载手动画板 PNG（带标题、可选图例、logo 水印）—— 发 WhatsApp / 社媒用 */
  async function exportPng() {
    if (!items.length) {
      notify?.({ type: 'warn', text: '先加几张材质图片再导出' });
      return;
    }
    setExporting(true);
    try {
      const canvas = await renderBoardCanvas({ items, board, longEdge: EXPORT_LONG_EDGE, withTitle: true, withLegend: !!board.showLegend });
      const blob = await finishForDownload(canvas, settings?.watermark);
      downloadBlob(blob, `material-board-${safeFileName(board.title || boardName)}.png`);
    } catch (e) {
      notify?.({ type: 'error', text: `导出失败：${e.message}` });
    } finally {
      setExporting(false);
    }
  }

  // ---------------------------------------------------------------------------

  if (!projectId) {
    return <div className="p-6 text-sm text-bp-muted">先打开一个项目，再来做 Material Board。</div>;
  }

  if (!loaded) {
    return (
      <div className="p-10 flex items-center justify-center gap-2 text-sm text-bp-faint">
        <LoaderCircle size={16} className="animate-spin" /> 正在打开画板…
      </div>
    );
  }

  return (
    <div ref={rootRef} className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] items-start">
      {/* 左侧：画板 / 标题 / 材质库 */}
      <div className="space-y-4 min-w-0 order-2 lg:order-1">
        <BoardPanel
          boards={boards}
          activeId={activeId}
          boardName={boardName}
          onRename={renameBoard}
          onSwitch={switchBoard}
          onNew={newBoard}
          onDelete={deleteBoard}
          board={board}
          onBoardChange={setBoard}
          standalone={standalone}
        />
        <TitlePanel board={board} onBoardChange={setBoard} onResetTitles={() => setBoard(defaultTitles(info))} standalone={standalone} />
        <LibraryPanel settings={settings} notify={notify} onOpenSettings={onOpenSettings} onPick={addFromLibrary} />
      </div>

      {/* 右侧：封面卡 + 工具条 + 画板 + AI 实拍排版 */}
      <div className="space-y-4 min-w-0 order-1 lg:order-2">
        {!standalone && (
          <CoverCard project={project} ratioId={board.ratioId} coverBusy={coverBusy} coverDone={coverDone} onUploadCover={uploadCover} />
        )}

        <div className="flex flex-wrap items-center gap-2">
          {!standalone && (
            <button
              type="button"
              onClick={() => importMaterials()}
              disabled={importing}
              className={btnGhost}
              title={importable.length ? '把 PDF 里识别到的材质小样加到画板（已在画板上的会跳过）' : '本案材料都已在画板上'}
            >
              {importing ? <LoaderCircle size={15} className="animate-spin" /> : <PackageOpen size={15} />}
              导入本案材料{importable.length ? `（${importable.length}）` : ''}
            </button>
          )}
          <button type="button" onClick={() => boardFileRef.current?.click()} className={btnGhost}>
            <ImagePlus size={15} /> 加图片
          </button>
          <input
            ref={boardFileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button type="button" onClick={() => autoLayout('grid')} disabled={!items.length} className={btnGhost}>
            <LayoutGrid size={15} /> 整齐网格
          </button>
          <button type="button" onClick={() => autoLayout('collage')} disabled={!items.length} className={btnGhost}>
            <LayoutGrid size={15} className="rotate-45" /> 杂志拼贴
          </button>
          <div className="flex-1" />
          <button type="button" onClick={exportPng} disabled={exporting || !items.length} className={btnGhost}>
            {exporting ? <LoaderCircle size={15} className="animate-spin" /> : <Download size={15} />}
            下载 PNG
          </button>
          {!standalone && (
            <button type="button" onClick={boardAsCover} disabled={!!coverBusy || !items.length} className={btnPrimary}>
              {coverBusy === 'board' ? <LoaderCircle size={15} className="animate-spin" /> : <Stamp size={15} />}
              设为方案封面
            </button>
          )}
        </div>

        {/* 选中素材的工具条：固定高度，选中 / 取消时画板不跳动 */}
        <div className={`${card} !py-0 !px-3 h-[54px] flex flex-nowrap items-center gap-2 overflow-x-auto thin-scroll`}>
          {selected ? (
            <>
              <input
                value={selected.label || ''}
                onChange={(e) => patchItem(selected.id, { label: e.target.value })}
                placeholder="材质名称 / 编号，如：浅川橡 AG273"
                className={`${input} flex-1 min-w-[180px]`}
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] text-bp-faint">旋转</span>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={Math.round(selected.rot || 0)}
                  onChange={(e) => patchItem(selected.id, { rot: Number(e.target.value) })}
                  className="w-24 accent-[#B8995A]"
                />
                <span className="text-[11px] text-bp-faint w-9 text-right">{Math.round(selected.rot || 0)}°</span>
                <button type="button" onClick={() => patchItem(selected.id, { rot: 0 })} className={iconBtn} title="摆正">
                  <RotateCcw size={13} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => cutout(selected.id)}
                disabled={selected.busy}
                className={`${iconBtn} gap-1 text-xs shrink-0`}
                title={hasKey ? 'AI 去掉背景，换成纯白棚拍底' : '先在设置里填 API key'}
              >
                {selected.busy ? <LoaderCircle size={13} className="animate-spin" /> : <Scissors size={13} />} AI 抠图
              </button>
              <button type="button" onClick={() => moveLayer(selected.id, 1)} className={`${iconBtn} shrink-0`} title="上移一层">
                <ChevronUp size={14} />
              </button>
              <button type="button" onClick={() => moveLayer(selected.id, -1)} className={`${iconBtn} shrink-0`} title="下移一层">
                <ChevronDown size={14} />
              </button>
              <button type="button" onClick={() => removeItem(selected.id)} className={`${iconBtn} shrink-0 hover:text-bp-danger`} title="删除（Delete 键）">
                <Trash2 size={14} />
              </button>
            </>
          ) : (
            <div className="text-xs text-bp-faint truncate">
              {items.length
                ? '点选画板上的素材：改名称 / 旋转 / AI 抠图 / 调图层 · Delete 删除 · 方向键微调'
                : standalone
                  ? '画板还是空的 —— 从左边「我的材质库」点选，或者把图片拖进下面的画板'
                  : '画板还是空的 —— 先导入本案材料，或者把图片拖进下面的画板'}
            </div>
          )}
        </div>

        <BoardStage
          items={items}
          board={board}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onPatch={patchItem}
          showLegend={!!board.showLegend}
          onDropFiles={addFiles}
        />

        {legend.length > 0 && (
          <div className={card}>
            <div className="text-xs font-semibold text-bp-faint mb-2">材质清单（{legend.length}）</div>
            <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {legend.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`flex items-center gap-2 text-left text-sm rounded-md px-1 -mx-1 hover:bg-bp-tint ${r.id === selectedId ? 'text-bp-ink' : 'text-bp-muted'}`}
                >
                  <span className="w-5 h-5 rounded-full bg-bp-ink text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
                    {r.no}
                  </span>
                  <span className="truncate">{r.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="text-[11px] text-bp-faint text-center">
          画板自动保存在本机 · 下载 PNG 为 {EXPORT_LONG_EDGE}px 高清（带标题{settings?.watermark ? ' + logo 水印' : ''}）{standalone ? '' : ' · 设为封面为无字版'}
        </div>

        <FlatlayPanel
          boardId={activeId}
          projectId={projectId}
          board={board}
          onBoardChange={setBoard}
          items={items}
          settings={settings}
          notify={notify}
          onOpenSettings={onOpenSettings}
          onUseAsCover={standalone ? undefined : flatlayAsCover}
          coverBusy={coverBusy}
        />
      </div>
    </div>
  );
}
