import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  UploadCloud, Scissors, Trash2, ChevronUp, ChevronDown, LayoutGrid,
  Sparkles, Download, Loader2, Plus, Wand2, ListOrdered,
} from 'lucide-react';
import { CUTOUT_PROMPT, FLATLAY_PROMPT, LIB_CATS, SWATCH_PROMPT, TITLE_FONTS, TITLE_POSITIONS } from '../constants.js';
import { generateImage } from '../services/gemini.js';
import {
  prepareInputImage, compressForStorage, dataUrlToInput, downloadDataUrl, applyWatermark, shrinkDataUrl,
} from '../services/images.js';
import { listBoards, putBoard, removeBoard, getActiveBoardId, setActiveBoardId } from '../services/moodboardStore.js';
import { listLibrary, putLibraryItem, removeLibraryItem } from '../services/library.js';

const RATIOS = [
  { id: 'a4l', label: 'A4 横', ratio: 297 / 210 },
  { id: 'a4p', label: 'A4 竖', ratio: 210 / 297 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '1:1', label: '方形', ratio: 1 },
];

const BGS = [
  { id: 'paper', color: '#F5F1EA', ink: '#1A1614' },
  { id: 'white', color: '#FFFFFF', ink: '#1A1614' },
  { id: 'greige', color: '#EDE9E2', ink: '#1A1614' },
  { id: 'linen', color: '#E8E2D7', ink: '#1A1614' },
  { id: 'green', color: '#2D4A3E', ink: '#F5F1EA' },
];

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const DEFAULT_BOARD = {
  ratioId: 'a4l',
  bgId: 'paper',
  title: '',
  subtitle: '',
  titleFont: 'serif', // TITLE_FONTS id
  titleScale: 1, // 0.6 – 1.8
  titlePos: 'bl', // TITLE_POSITIONS id
  titleColor: '', // 空 = 跟随底色自动（浅底墨黑 / 深底暖白）
  notes: '', // 排版偏好描述，喂给 AI 实拍排版
};

const TITLE_COLOR_PRESETS = ['#1A1614', '#F5F1EA', '#B8995A', '#2D4A3E', '#A87C4F'];

/** 封面文字块（金线 + 标题 + 副标题），画板导出与 flat-lay 导出共用 */
function drawTitleBlock(ctx, W, H, board, { defaultColor, shadow }) {
  const { title, subtitle } = board;
  if (!title && !subtitle) return;
  const font = TITLE_FONTS.find((f) => f.id === board.titleFont) || TITLE_FONTS[0];
  const scale = board.titleScale || 1;
  const pos = board.titlePos || 'bl';
  const color = board.titleColor || defaultColor;
  const m = W * 0.045;
  const titleFs = W * 0.032 * scale;
  const subFs = W * 0.014 * scale;
  const ruleH = Math.max(3, W * 0.0022);
  const gapA = W * 0.02 * scale;
  const gapB = W * 0.016 * scale;
  const blockH = ruleH + gapA + (title ? titleFs : 0) + (subtitle ? gapB + subFs : 0);
  const top = pos[0] === 't' ? m : pos === 'c' ? (H - blockH) / 2 : H - m - blockH;
  const center = pos === 'c';
  const right = pos[1] === 'r';
  const x = center ? W / 2 : right ? W - m : m;

  ctx.save();
  if (shadow) {
    ctx.shadowColor = 'rgba(26,22,20,0.35)';
    ctx.shadowBlur = W * 0.008;
  }
  ctx.textAlign = center ? 'center' : right ? 'right' : 'left';
  ctx.textBaseline = 'alphabetic';

  const ruleW = W * 0.05;
  const ruleX = center ? W / 2 - ruleW / 2 : right ? W - m - ruleW : m;
  ctx.fillStyle = '#B8995A';
  ctx.fillRect(ruleX, top, ruleW, ruleH);

  let y = top + ruleH + gapA;
  if (title) {
    y += titleFs * 0.82;
    ctx.font = `600 ${titleFs}px ${font.css}`;
    ctx.fillStyle = color;
    ctx.fillText(title, x, y);
  }
  if (subtitle) {
    y += (title ? gapB : subFs * 0.82) + subFs * (title ? 0.82 : 0);
    ctx.font = `500 ${subFs}px ${font.css}`;
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = color;
    ctx.fillText(subtitle.toUpperCase(), x, y);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

const FLATLAY_ASPECT = { a4l: '4:3', a4p: '3:4', '16:9': '16:9', '1:1': '1:1' };

const BG_TONE = {
  paper: 'a warm beige textured plaster surface',
  white: 'a clean off-white seamless paper surface',
  greige: 'a soft greige lime-plaster surface',
  linen: 'a natural linen fabric surface',
  green: 'a deep muted green textured plaster surface',
};

function measureAspect(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth / img.naturalHeight || 1);
    img.onerror = () => resolve(1);
    img.src = dataUrl;
  });
}

/** 整齐网格排版：底部预留标题区 */
function gridLayout(items, boardH) {
  const n = items.length;
  if (!n) return items;
  const usableH = boardH - 16;
  const cols = Math.ceil(Math.sqrt(n * (100 / usableH)));
  const rows = Math.ceil(n / cols);
  const gap = 3;
  const w = (100 - gap * (cols + 1)) / cols;
  const rowH = (usableH - gap * (rows + 1)) / rows;
  return items.map((it, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const cellW = Math.min(w, rowH * it.aspect);
    return {
      ...it,
      w: cellW,
      x: gap + c * (w + gap) + (w - cellW) / 2,
      y: gap + r * (rowH + gap) + Math.max(0, (rowH - cellW / it.aspect) / 2),
      rot: 0,
    };
  });
}

/** 杂志拼贴排版：大小错落、轻微旋转（确定性） */
function collageLayout(items, boardH) {
  const n = items.length;
  if (!n) return items;
  const usableH = boardH - 18;
  return items.map((it, i) => {
    const big = i === 0;
    const w = big ? 38 : 18 + ((i * 13) % 14);
    const cx = big ? 30 : 12 + ((i * 41) % 72);
    const cy = big ? usableH * 0.4 : 6 + ((i * 29) % Math.max(8, usableH - w / it.aspect - 8));
    return {
      ...it,
      w,
      x: Math.max(2, Math.min(96 - w, cx)),
      y: Math.max(2, Math.min(usableH - w / it.aspect, cy)),
      rot: big ? 0 : ((i * 37) % 9) - 4,
    };
  });
}

export default function MoodBoard({ settings, onOpenSettings, notify }) {
  // ---- 画板集合 ----
  const [boards, setBoards] = useState([]); // [{id,name,ts}]（轻量列表，内容按需读）
  const [activeId, setActiveId] = useState(null);
  const [board, setBoard] = useState({ ...DEFAULT_BOARD });
  const [items, setItems] = useState([]);
  const [boardName, setBoardName] = useState('画板 1');
  const [selectedId, setSelectedId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showLegend, setShowLegend] = useState(true);

  // ---- 材质库 ----
  const [library, setLibrary] = useState([]);
  const [libCat, setLibCat] = useState('all');
  const [genDesc, setGenDesc] = useState('');
  const [genBusy, setGenBusy] = useState(false);

  // ---- AI 实拍排版 ----
  const [flatlayUrl, setFlatlayUrl] = useState(null);
  const [flatlayBusy, setFlatlayBusy] = useState(false);
  const [flatlayNote, setFlatlayNote] = useState('');

  const fileRef = useRef(null);
  const libFileRef = useRef(null);
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const saveTimer = useRef(null);
  const latestRef = useRef(null);

  const ratio = RATIOS.find((r) => r.id === board.ratioId) || RATIOS[0];
  const bg = BGS.find((b) => b.id === board.bgId) || BGS[0];
  const boardH = 100 / ratio.ratio;
  const selected = items.find((it) => it.id === selectedId) || null;
  const legendItems = useMemo(() => items.filter((it) => (it.label || '').trim()), [items]);

  // ---- 初始加载：画板集合 + 材质库 ----
  useEffect(() => {
    (async () => {
      const [all, act, lib] = await Promise.all([listBoards(), getActiveBoardId(), listLibrary()]);
      setLibrary(lib);
      if (all.length) {
        const rec = all.find((b) => b.id === act) || all[0];
        setBoards(all.map(({ id, name, ts }) => ({ id, name, ts })));
        applyRecord(rec);
      } else {
        const rec = { id: `b-${uid()}`, name: '画板 1', board: { ...DEFAULT_BOARD }, items: [], ts: Date.now() };
        await putBoard(rec);
        await setActiveBoardId(rec.id);
        setBoards([{ id: rec.id, name: rec.name, ts: rec.ts }]);
        applyRecord(rec);
      }
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyRecord(rec) {
    setActiveId(rec.id);
    setBoardName(rec.name || '画板');
    setBoard({ ...DEFAULT_BOARD, ...(rec.board || {}) });
    setItems((rec.items || []).map((it) => ({ ...it, busy: false })));
    setSelectedId(null);
    setFlatlayUrl(null);
  }

  // ---- 自动保存（debounce + 卸载即时落盘） ----
  useEffect(() => {
    if (!loaded || !activeId) return;
    latestRef.current = {
      id: activeId,
      name: boardName,
      board,
      items: items.map(({ busy, ...it }) => it),
      ts: Date.now(),
    };
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => putBoard(latestRef.current), 800);
    return () => clearTimeout(saveTimer.current);
  }, [board, items, boardName, activeId, loaded]);

  useEffect(
    () => () => {
      if (latestRef.current) putBoard(latestRef.current);
    },
    []
  );

  // ---- 画板管理 ----
  async function flushSave() {
    clearTimeout(saveTimer.current);
    if (latestRef.current) await putBoard(latestRef.current);
  }

  async function switchBoard(id) {
    if (id === activeId) return;
    await flushSave();
    const all = await listBoards();
    const rec = all.find((b) => b.id === id);
    if (rec) {
      applyRecord(rec);
      await setActiveBoardId(id);
      setBoards(all.map(({ id: i, name, ts }) => ({ id: i, name, ts })));
    }
  }

  async function newBoard() {
    await flushSave();
    const rec = {
      id: `b-${uid()}`,
      name: `画板 ${boards.length + 1}`,
      board: { ...DEFAULT_BOARD, ratioId: board.ratioId, bgId: board.bgId },
      items: [],
      ts: Date.now(),
    };
    await putBoard(rec);
    await setActiveBoardId(rec.id);
    setBoards((prev) => [{ id: rec.id, name: rec.name, ts: rec.ts }, ...prev]);
    applyRecord(rec);
  }

  async function deleteBoard() {
    if (boards.length <= 1) {
      notify?.({ type: 'warn', text: '至少保留一块画板' });
      return;
    }
    await removeBoard(activeId);
    latestRef.current = null;
    const all = await listBoards();
    setBoards(all.map(({ id, name, ts }) => ({ id, name, ts })));
    if (all.length) {
      applyRecord(all[0]);
      await setActiveBoardId(all[0].id);
    }
    notify?.({ type: 'ok', text: '画板已删除' });
  }

  // ---- 材质库 ----
  const addLibraryFiles = useCallback(
    async (fileList) => {
      const files = [...(fileList || [])].filter((f) => f.type.startsWith('image/'));
      for (const file of files) {
        const img = await prepareInputImage(file);
        const small = await shrinkDataUrl(img.dataUrl, 640);
        const item = {
          id: uid(),
          dataUrl: small,
          name: '',
          cat: libCat === 'all' ? 'other' : libCat,
          ts: Date.now(),
        };
        await putLibraryItem(item);
        setLibrary((prev) => [item, ...prev]);
      }
    },
    [libCat]
  );

  async function genSwatch() {
    if (!settings.apiKey) {
      onOpenSettings();
      return;
    }
    if (!genDesc.trim() || genBusy) return;
    setGenBusy(true);
    try {
      const prompt = SWATCH_PROMPT.replace('{DESC}', genDesc.trim());
      const raw = await generateImage(settings, prompt, null, '1:1');
      const small = await shrinkDataUrl(await compressForStorage(raw), 640);
      const item = {
        id: uid(),
        dataUrl: small,
        name: genDesc.trim(),
        cat: libCat === 'all' ? 'other' : libCat,
        ts: Date.now(),
      };
      await putLibraryItem(item);
      setLibrary((prev) => [item, ...prev]);
      setGenDesc('');
      notify?.({ type: 'ok', text: '材质样片已生成并存入材质库' });
    } catch (e) {
      notify?.({ type: 'error', text: `生成失败：${e.message}` });
    } finally {
      setGenBusy(false);
    }
  }

  async function renameLibItem(id, name) {
    setLibrary((prev) => prev.map((it) => (it.id === id ? { ...it, name } : it)));
    const item = library.find((it) => it.id === id);
    if (item) await putLibraryItem({ ...item, name });
  }

  async function deleteLibItem(id) {
    await removeLibraryItem(id);
    setLibrary((prev) => prev.filter((it) => it.id !== id));
  }

  /** 材质库 → 画板 */
  async function addLibToBoard(libItem) {
    const aspect = await measureAspect(libItem.dataUrl);
    setItems((prev) => [
      ...prev,
      {
        id: uid(),
        dataUrl: libItem.dataUrl,
        aspect,
        w: 20,
        x: 6 + ((prev.length * 17) % 55),
        y: 6 + ((prev.length * 11) % 40),
        rot: 0,
        label: libItem.name || '',
        busy: false,
      },
    ]);
  }

  // ---- 直接上传到画板 ----
  const addFiles = useCallback(async (fileList) => {
    const files = [...(fileList || [])].filter((f) => f.type.startsWith('image/'));
    for (const file of files) {
      const img = await prepareInputImage(file);
      const aspect = await measureAspect(img.dataUrl);
      setItems((prev) => [
        ...prev,
        {
          id: uid(),
          dataUrl: img.dataUrl,
          aspect,
          w: 24,
          x: 6 + ((prev.length * 17) % 55),
          y: 6 + ((prev.length * 11) % 40),
          rot: 0,
          label: '',
          busy: false,
        },
      ]);
    }
  }, []);

  const patchItem = (id, patch) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  // ---- 拖动 / 缩放 ----
  function unitsPerPx() {
    const el = stageRef.current;
    return el ? 100 / el.clientWidth : 0.1;
  }

  function startDrag(e, id, kind) {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(id);
    const it = items.find((i) => i.id === id);
    dragRef.current = { id, kind, startX: e.clientX, startY: e.clientY, orig: { ...it } };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', endDrag, { once: true });
  }

  function onDragMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const u = unitsPerPx();
    const dx = (e.clientX - d.startX) * u;
    const dy = (e.clientY - d.startY) * u;
    if (d.kind === 'move') {
      patchItem(d.id, {
        x: Math.max(-d.orig.w / 2, Math.min(100 - d.orig.w / 2, d.orig.x + dx)),
        y: Math.max(-2, Math.min(boardH - 4, d.orig.y + dy)),
      });
    } else {
      patchItem(d.id, { w: Math.max(8, Math.min(92, d.orig.w + dx)) });
    }
  }

  function endDrag() {
    dragRef.current = null;
    window.removeEventListener('pointermove', onDragMove);
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

  // ---- AI 抠图 ----
  async function cutout(id) {
    if (!settings.apiKey) {
      onOpenSettings();
      return;
    }
    const it = items.find((x) => x.id === id);
    if (!it || it.busy) return;
    patchItem(id, { busy: true });
    try {
      const raw = await generateImage(settings, CUTOUT_PROMPT, dataUrlToInput(it.dataUrl), null);
      const dataUrl = await compressForStorage(raw);
      const aspect = await measureAspect(dataUrl);
      patchItem(id, { dataUrl, aspect, busy: false });
      notify?.({ type: 'ok', text: '抠图完成' });
    } catch (e) {
      patchItem(id, { busy: false });
      notify?.({ type: 'error', text: `抠图失败：${e.message}` });
    }
  }

  // ---- AI 实拍级排版 ----
  async function aiFlatlay() {
    if (!settings.apiKey) {
      onOpenSettings();
      return;
    }
    if (items.length < 2) {
      notify?.({ type: 'warn', text: '先添加至少 2 张材质 / 家具图片' });
      return;
    }
    if (flatlayBusy) return;
    setFlatlayBusy(true);
    setFlatlayNote('AI 正在摆盘拍摄，约 15–30 秒…');
    try {
      const inputs = items.slice(0, 10).map((it) => dataUrlToInput(it.dataUrl));
      const labels = items
        .slice(0, 10)
        .map((it, i) => (it.label ? `Sample ${i + 1}: ${it.label}` : null))
        .filter(Boolean);
      const prompt =
        `${FLATLAY_PROMPT}\nBackdrop surface: ${BG_TONE[board.bgId] || BG_TONE.paper}.` +
        (labels.length ? `\nSample notes: ${labels.join('; ')}.` : '') +
        (board.notes?.trim()
          ? `\nDesigner styling preferences — FOLLOW THESE STRICTLY for how each sample is cut, shaped and arranged: ${board.notes.trim()}`
          : '');
      const raw = await generateImage(settings, prompt, inputs, FLATLAY_ASPECT[board.ratioId] || '4:3', (w, a) =>
        setFlatlayNote(`被限流，${w} 秒后自动重试（第 ${a}/3 次）…`)
      );
      setFlatlayUrl(await compressForStorage(raw));
      notify?.({ type: 'ok', text: '实拍排版完成 — 不满意可以再生成一张' });
    } catch (e) {
      notify?.({ type: 'error', text: `生成失败：${e.message}` });
    } finally {
      setFlatlayBusy(false);
      setFlatlayNote('');
    }
  }

  async function downloadFlatlay() {
    if (!flatlayUrl) return;
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = flatlayUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const W = canvas.width;
    const H = canvas.height;
    drawTitleBlock(ctx, W, H, board, { defaultColor: '#FFFFFF', shadow: true });
    downloadDataUrl(
      await applyWatermark(canvas.toDataURL('image/png'), settings.watermark),
      `moodboard-flatlay-${board.title || 'riccione'}.png`
    );
  }

  // ---- 导出手动画板 PNG（含图例） ----
  async function exportPng() {
    if (!items.length) {
      notify?.({ type: 'warn', text: '先加几张材质 / 家具图片再导出' });
      return;
    }
    setExporting(true);
    try {
      const W = 2400;
      const s = W / 100;
      const H = Math.round(boardH * s);
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, W, H);

      let legendNo = 0;
      const legendRows = [];
      for (const it of items) {
        const img = await new Promise((resolve, reject) => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = reject;
          im.src = it.dataUrl;
        });
        const w = it.w * s;
        const h = w / it.aspect;
        const cx = (it.x + it.w / 2) * s;
        const cy = it.y * s + h / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((it.rot * Math.PI) / 180);
        ctx.shadowColor = 'rgba(26,22,20,0.18)';
        ctx.shadowBlur = 36;
        ctx.shadowOffsetY = 14;
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.shadowColor = 'transparent';
        ctx.restore();

        // 编号圆点（有名称的材质）
        if (showLegend && (it.label || '').trim()) {
          legendNo += 1;
          legendRows.push({ no: legendNo, label: it.label.trim() });
          const r = W * 0.011;
          const dx = (it.x + 1.2) * s + r;
          const dy = it.y * s + r + W * 0.004;
          ctx.beginPath();
          ctx.arc(dx, dy, r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(26,22,20,0.85)';
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `600 ${r * 1.1}px "DM Sans", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(legendNo), dx, dy + r * 0.05);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
        }
      }

      // 图例清单卡（右上）
      if (showLegend && legendRows.length) {
        const fs = W * 0.014;
        const lh = fs * 1.7;
        const pad = fs * 1.2;
        ctx.font = `500 ${fs}px "DM Sans", "Noto Sans SC", sans-serif`;
        const boxW = Math.min(
          W * 0.34,
          Math.max(...legendRows.map((r) => ctx.measureText(`${r.no}. ${r.label}`).width)) + pad * 2 + fs * 1.6
        );
        const boxH = legendRows.length * lh + pad * 1.6;
        const bx = W - boxW - W * 0.025;
        const by = W * 0.025;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, fs);
        ctx.fill();
        legendRows.forEach((r, i) => {
          const ry = by + pad + i * lh + fs * 0.4;
          const cr = fs * 0.62;
          ctx.beginPath();
          ctx.arc(bx + pad + cr, ry, cr, 0, Math.PI * 2);
          ctx.fillStyle = '#1A1614';
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `600 ${cr * 1.1}px "DM Sans", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(r.no), bx + pad + cr, ry + cr * 0.06);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = '#1A1614';
          ctx.font = `500 ${fs}px "DM Sans", "Noto Sans SC", sans-serif`;
          ctx.fillText(r.label, bx + pad + cr * 2 + fs * 0.5, ry + fs * 0.36);
        });
      }

      // 标题区（位置/字体/字号/颜色跟随画板设置）
      drawTitleBlock(ctx, W, H, board, { defaultColor: bg.ink, shadow: false });

      downloadDataUrl(
        await applyWatermark(canvas.toDataURL('image/png'), settings.watermark),
        `moodboard-${board.title || 'riccione'}.png`
      );
    } finally {
      setExporting(false);
    }
  }

  const stageStyle = useMemo(() => ({ background: bg.color, aspectRatio: `${ratio.ratio}` }), [bg.color, ratio.ratio]);
  const filteredLib = libCat === 'all' ? library : library.filter((it) => it.cat === libCat);

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      {/* 左侧：材质库 + 画板控制 */}
      <div className="space-y-5 h-fit lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto thin-scroll">
        {/* 材质库 */}
        <div className="bg-sail-card border border-sail-line rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">材质库</div>
            <span className="text-[11px] text-sail-faint">点样片 = 加进画板</span>
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setLibCat('all')}
              className={`px-2 py-1 rounded-md text-[11px] border ${libCat === 'all' ? 'bg-sail-green text-white border-sail-green' : 'bg-white text-sail-muted border-sail-line'}`}
            >
              全部
            </button>
            {LIB_CATS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setLibCat(c.id)}
                className={`px-2 py-1 rounded-md text-[11px] border ${libCat === c.id ? 'bg-sail-green text-white border-sail-green' : 'bg-white text-sail-muted border-sail-line'}`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {filteredLib.length > 0 && (
            <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto thin-scroll pr-1">
              {filteredLib.map((it) => (
                <div key={it.id} className="group">
                  <div className="relative rounded-lg overflow-hidden border border-sail-line">
                    <img
                      src={it.dataUrl}
                      alt={it.name || '材质样片'}
                      className="w-full h-16 object-cover cursor-pointer hover:opacity-85"
                      onClick={() => addLibToBoard(it)}
                      title="点击加进画板"
                    />
                    <button
                      type="button"
                      onClick={() => deleteLibItem(it.id)}
                      className="absolute top-1 right-1 p-0.5 rounded-full bg-sail-ink/70 text-white opacity-0 group-hover:opacity-100"
                      title="从材质库删除"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                  <input
                    value={it.name}
                    onChange={(e) => renameLibItem(it.id, e.target.value)}
                    placeholder="名称/编号"
                    className="mt-1 w-full rounded border border-sail-line px-1 py-0.5 text-[10px] focus:outline-none focus:border-sail-green"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => libFileRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-sail-line hover:border-sail-green/50 text-xs text-sail-faint"
            >
              <UploadCloud size={13} /> 上传材质
            </button>
          </div>
          <input
            ref={libFileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addLibraryFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <div className="flex gap-1.5">
            <input
              value={genDesc}
              onChange={(e) => setGenDesc(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && genSwatch()}
              placeholder="AI 生成样片，如：深胡桃直纹木饰面"
              className="flex-1 rounded-lg border border-sail-line px-2 py-1.5 text-xs focus:outline-none focus:border-sail-green"
            />
            <button
              type="button"
              onClick={genSwatch}
              disabled={genBusy || !genDesc.trim()}
              className="px-2.5 py-1.5 rounded-lg bg-sail-gold/20 border border-sail-gold text-xs font-medium disabled:opacity-50"
              title="AI 生成无缝材质样片并存入材质库"
            >
              {genBusy ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
            </button>
          </div>
        </div>

        {/* 画板控制 */}
        <div className="bg-sail-card border border-sail-line rounded-2xl p-4 space-y-4">
          <div>
            <div className="text-xs font-semibold text-sail-faint mb-1.5">画板</div>
            <div className="flex gap-1.5">
              <select
                value={activeId || ''}
                onChange={(e) => switchBoard(e.target.value)}
                className="flex-1 rounded-lg border border-sail-line px-2 py-1.5 text-sm bg-white focus:outline-none"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id === activeId ? boardName : b.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={newBoard} className="px-2 rounded-lg border border-sail-line text-sail-muted hover:bg-sail-tint" title="新建画板">
                <Plus size={15} />
              </button>
              <button type="button" onClick={deleteBoard} className="px-2 rounded-lg border border-sail-line text-sail-faint hover:text-sail-danger hover:bg-sail-tint" title="删除当前画板">
                <Trash2 size={14} />
              </button>
            </div>
            <input
              value={boardName}
              onChange={(e) => {
                setBoardName(e.target.value);
                setBoards((prev) => prev.map((b) => (b.id === activeId ? { ...b, name: e.target.value } : b)));
              }}
              placeholder="画板名称，如：湖景苑 12-3A 主卧"
              className="mt-1.5 w-full rounded-lg border border-sail-line px-2 py-1.5 text-xs focus:outline-none focus:border-sail-green"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-sail-faint mb-1.5">封面文字</div>
            <input
              value={board.title}
              onChange={(e) => setBoard({ ...board, title: e.target.value })}
              placeholder="项目名，如：湖景苑 12-3A"
              className="w-full rounded-xl border border-sail-line px-3 py-2 text-sm mb-1.5 focus:outline-none focus:border-sail-green"
            />
            <input
              value={board.subtitle}
              onChange={(e) => setBoard({ ...board, subtitle: e.target.value })}
              placeholder="副标题，如：Material Board · 奶油风"
              className="w-full rounded-xl border border-sail-line px-3 py-2 text-sm focus:outline-none focus:border-sail-green"
            />

            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-1">
                {TITLE_FONTS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setBoard({ ...board, titleFont: f.id })}
                    style={{ fontFamily: f.css }}
                    className={`px-2 py-1 rounded-md text-[11px] border ${board.titleFont === f.id ? 'bg-sail-green text-white border-sail-green' : 'bg-white text-sail-muted border-sail-line'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-sail-faint shrink-0">字号</span>
                <input
                  type="range"
                  min="0.6"
                  max="1.8"
                  step="0.05"
                  value={board.titleScale}
                  onChange={(e) => setBoard({ ...board, titleScale: Number(e.target.value) })}
                  className="flex-1 accent-[#3D5A4A]"
                />
                <span className="text-[11px] text-sail-faint w-8 text-right">{Math.round(board.titleScale * 100)}%</span>
              </div>

              <div className="flex flex-wrap gap-1">
                {TITLE_POSITIONS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setBoard({ ...board, titlePos: p.id })}
                    className={`px-2 py-1 rounded-md text-[11px] border ${board.titlePos === p.id ? 'bg-sail-green text-white border-sail-green' : 'bg-white text-sail-muted border-sail-line'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-sail-faint shrink-0">颜色</span>
                <button
                  type="button"
                  onClick={() => setBoard({ ...board, titleColor: '' })}
                  className={`px-1.5 py-0.5 rounded text-[10px] border ${!board.titleColor ? 'bg-sail-green text-white border-sail-green' : 'bg-white text-sail-muted border-sail-line'}`}
                  title="跟随底色自动（浅底墨黑 / 深底暖白）"
                >
                  自动
                </button>
                {TITLE_COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setBoard({ ...board, titleColor: c })}
                    className={`w-5 h-5 rounded-full border-2 ${board.titleColor === c ? 'border-sail-green' : 'border-sail-line'}`}
                    style={{ background: c }}
                    title={c}
                  />
                ))}
                <input
                  type="color"
                  value={board.titleColor || bg.ink}
                  onChange={(e) => setBoard({ ...board, titleColor: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer border border-sail-line p-0 bg-white"
                  title="自定义颜色"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-sail-faint mb-1.5">排版偏好（告诉 AI 你想要的）</div>
            <textarea
              value={board.notes}
              onChange={(e) => setBoard({ ...board, notes: e.target.value })}
              rows={3}
              placeholder={'例：面板切成整齐的方块小样；石材保留完整大板；玻璃切成圆形；深色材质集中放右下。\n「AI 实拍级排版」会严格照做。'}
              className="w-full rounded-xl border border-sail-line bg-white px-3 py-2 text-xs leading-relaxed focus:outline-none focus:border-sail-green resize-none"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-sail-faint mb-1.5">画幅 / 底色</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {RATIOS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setBoard({ ...board, ratioId: r.id })}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${board.ratioId === r.id ? 'bg-sail-green text-white border-sail-green' : 'bg-white text-sail-muted border-sail-line'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {BGS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBoard({ ...board, bgId: b.id })}
                  className={`w-8 h-8 rounded-full border-2 ${board.bgId === b.id ? 'border-sail-green' : 'border-sail-line'}`}
                  style={{ background: b.color }}
                  title={b.id}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-sail-faint mb-1.5">一键排版</div>
            <button
              type="button"
              onClick={aiFlatlay}
              disabled={flatlayBusy}
              className="w-full mb-2 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-sail-gold/15 border border-sail-gold text-sm font-medium text-sail-ink hover:bg-sail-gold/25 disabled:opacity-60"
            >
              {flatlayBusy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              AI 实拍级排版 ✨
            </button>
            {flatlayBusy && <div className="text-[11px] text-sail-faint mb-2 text-center">{flatlayNote}</div>}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setItems((prev) => gridLayout(prev, boardH))}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-sail-line text-sm text-sail-muted hover:bg-sail-tint"
              >
                <LayoutGrid size={15} /> 整齐网格
              </button>
              <button
                type="button"
                onClick={() => setItems((prev) => collageLayout(prev, boardH))}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-sail-line text-sm text-sail-muted hover:bg-sail-tint"
              >
                <LayoutGrid size={15} className="rotate-45" /> 杂志拼贴
              </button>
            </div>
          </div>

          {selected && (
            <div className="rounded-xl bg-sail-tint border border-sail-line p-3 space-y-2">
              <div className="text-xs font-semibold text-sail-faint">选中的素材</div>
              <input
                value={selected.label}
                onChange={(e) => patchItem(selected.id, { label: e.target.value })}
                placeholder="材质 / 名字，如：橡木饰面 EW-302"
                className="w-full rounded-lg border border-sail-line px-3 py-1.5 text-sm focus:outline-none focus:border-sail-green"
              />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => cutout(selected.id)}
                  disabled={selected.busy}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-sail-line text-xs text-sail-muted hover:bg-white disabled:opacity-50"
                >
                  {selected.busy ? <Loader2 size={13} className="animate-spin" /> : <Scissors size={13} />}
                  AI 抠图
                </button>
                <button type="button" onClick={() => moveLayer(selected.id, 1)} className="px-2 py-1.5 rounded-lg border border-sail-line text-sail-muted hover:bg-white" title="上移一层">
                  <ChevronUp size={13} />
                </button>
                <button type="button" onClick={() => moveLayer(selected.id, -1)} className="px-2 py-1.5 rounded-lg border border-sail-line text-sail-muted hover:bg-white" title="下移一层">
                  <ChevronDown size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setItems((prev) => prev.filter((it) => it.id !== selected.id));
                    setSelectedId(null);
                  }}
                  className="px-2 py-1.5 rounded-lg border border-sail-line text-sail-muted hover:text-sail-danger hover:bg-white"
                  title="删除"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-sail-muted cursor-pointer">
            <input type="checkbox" checked={showLegend} onChange={(e) => setShowLegend(e.target.checked)} className="w-4 h-4 accent-[#3D5A4A]" />
            <ListOrdered size={13} />
            显示编号 + 材质图例清单（有名称的素材）
          </label>

          <button
            type="button"
            onClick={exportPng}
            disabled={exporting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-sail-green-deep text-white font-semibold hover:bg-sail-green disabled:opacity-60"
          >
            {exporting ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
            导出高清 PNG（含图例）
          </button>

          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full py-2 rounded-xl border border-dashed border-sail-line hover:border-sail-green/50 text-xs text-sail-faint"
            >
              或者直接上传图片到画板（不进材质库）
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
        </div>
      </div>

      {/* 右侧：画板 */}
      <div>
        <div
          ref={stageRef}
          onPointerDown={() => setSelectedId(null)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
          className="relative w-full rounded-2xl border border-sail-line overflow-hidden shadow-sm select-none"
          style={stageStyle}
        >
          {!items.length && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sail-faint pointer-events-none">
              <UploadCloud size={32} strokeWidth={1.2} />
              <div className="text-sm">从左侧材质库点样片加进来，或直接拖图片到这里</div>
              <div className="text-xs">拖动摆位 · 右下角拉大小 · 命名后自动进图例清单</div>
            </div>
          )}

          {(() => {
            let no = 0;
            return items.map((it) => {
              const sel = it.id === selectedId;
              const labeled = showLegend && (it.label || '').trim();
              if (labeled) no += 1;
              const thisNo = no;
              return (
                <div
                  key={it.id}
                  onPointerDown={(e) => startDrag(e, it.id, 'move')}
                  className={`absolute cursor-grab active:cursor-grabbing ${sel ? 'ring-2 ring-sail-green' : ''}`}
                  style={{
                    left: `${it.x}%`,
                    top: `${(it.y / boardH) * 100}%`,
                    width: `${it.w}%`,
                    transform: `rotate(${it.rot}deg)`,
                    filter: 'drop-shadow(0 6px 14px rgba(26,22,20,0.18))',
                  }}
                >
                  <img src={it.dataUrl} alt={it.label || '素材'} className="w-full block pointer-events-none" draggable={false} />
                  {labeled && (
                    <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-sail-ink/85 text-white text-[10px] font-semibold flex items-center justify-center">
                      {thisNo}
                    </span>
                  )}
                  {it.busy && (
                    <span className="absolute inset-0 bg-white/60 flex items-center justify-center">
                      <Loader2 size={18} className="animate-spin text-sail-green" />
                    </span>
                  )}
                  {sel && (
                    <span
                      onPointerDown={(e) => startDrag(e, it.id, 'resize')}
                      className="absolute -right-1.5 -bottom-1.5 w-4 h-4 rounded-full bg-sail-green border-2 border-white cursor-nwse-resize"
                    />
                  )}
                </div>
              );
            });
          })()}

          {(board.title || board.subtitle) &&
            (() => {
              const pos = board.titlePos || 'bl';
              const font = TITLE_FONTS.find((f) => f.id === board.titleFont) || TITLE_FONTS[0];
              const scale = board.titleScale || 1;
              const color = board.titleColor || bg.ink;
              const posCls =
                pos === 'tl'
                  ? 'top-[4.5%] left-[4.5%] items-start text-left'
                  : pos === 'tr'
                    ? 'top-[4.5%] right-[4.5%] items-end text-right'
                    : pos === 'c'
                      ? 'inset-0 items-center justify-center text-center'
                      : pos === 'br'
                        ? 'bottom-[4.5%] right-[4.5%] items-end text-right'
                        : 'bottom-[4.5%] left-[4.5%] items-start text-left';
              return (
                <div className={`absolute flex flex-col ${posCls} pointer-events-none`} style={{ color }}>
                  <div className="w-10 h-1 mb-2" style={{ background: '#B8995A' }} />
                  {board.title && (
                    <div
                      className="font-semibold leading-tight"
                      style={{ fontFamily: font.css, fontSize: `${1.5 * scale}rem` }}
                    >
                      {board.title}
                    </div>
                  )}
                  {board.subtitle && (
                    <div
                      className="tracking-widest uppercase opacity-70 mt-1"
                      style={{ fontFamily: font.css, fontSize: `${0.68 * scale}rem` }}
                    >
                      {board.subtitle}
                    </div>
                  )}
                </div>
              );
            })()}
        </div>

        {/* 屏幕上的图例清单 */}
        {showLegend && legendItems.length > 0 && (
          <div className="mt-3 bg-sail-card border border-sail-line rounded-2xl p-4">
            <div className="text-xs font-semibold text-sail-faint mb-2">材质图例</div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {legendItems.map((it, i) => (
                <div key={it.id} className="flex items-center gap-2 text-sm text-sail-muted">
                  <span className="w-5 h-5 rounded-full bg-sail-ink text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="truncate">{it.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-[11px] text-sail-faint mt-2 text-center">
          画板自动保存本机 · 导出 2400px 高清 PNG（含编号图例 + logo 水印）
        </div>

        {(flatlayUrl || flatlayBusy) && (
          <div className="mt-5 bg-sail-card border border-sail-line rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold">AI 实拍排版结果</div>
              {flatlayUrl && (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={aiFlatlay}
                    disabled={flatlayBusy}
                    className="px-3 py-1.5 rounded-lg border border-sail-line text-xs text-sail-muted hover:bg-sail-tint disabled:opacity-50"
                  >
                    再生成一张
                  </button>
                  <button
                    type="button"
                    onClick={downloadFlatlay}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sail-green-deep text-white text-xs font-medium hover:bg-sail-green"
                  >
                    <Download size={13} /> 下载（带标题字）
                  </button>
                </div>
              )}
            </div>
            {flatlayBusy && !flatlayUrl ? (
              <div className="aspect-[4/3] rounded-xl shimmer flex items-center justify-center">
                <span className="text-xs text-sail-faint bg-white/70 px-3 py-1 rounded-full">{flatlayNote}</span>
              </div>
            ) : (
              flatlayUrl && <img src={flatlayUrl} alt="AI 实拍排版" className="w-full rounded-xl border border-sail-line" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
