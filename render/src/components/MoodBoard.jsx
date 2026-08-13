import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  UploadCloud, Scissors, Trash2, ChevronUp, ChevronDown, LayoutGrid,
  Sparkles, Download, Loader2,
} from 'lucide-react';
import { CUTOUT_PROMPT, FLATLAY_PROMPT } from '../constants.js';
import { generateImage } from '../services/gemini.js';
import { prepareInputImage, compressForStorage, dataUrlToInput, downloadDataUrl, applyWatermark } from '../services/images.js';
import { loadBoard, saveBoard } from '../services/moodboardStore.js';

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

// AI 实拍排版的输出画幅（Gemini 支持的固定比例集合）
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
  const usableH = boardH - 16; // 底部留标题
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

/** 杂志拼贴排版：大小错落、轻微旋转、允许叠压（确定性，不用随机数） */
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
  const [board, setBoard] = useState({ ratioId: 'a4l', bgId: 'paper', title: '', subtitle: '' });
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [flatlayUrl, setFlatlayUrl] = useState(null);
  const [flatlayBusy, setFlatlayBusy] = useState(false);
  const [flatlayNote, setFlatlayNote] = useState('');

  const fileRef = useRef(null);
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const saveTimer = useRef(null);

  const ratio = RATIOS.find((r) => r.id === board.ratioId) || RATIOS[0];
  const bg = BGS.find((b) => b.id === board.bgId) || BGS[0];
  const boardH = 100 / ratio.ratio; // 板高（board units，板宽=100）
  const selected = items.find((it) => it.id === selectedId) || null;

  // ---- 持久化 ----
  useEffect(() => {
    loadBoard().then((saved) => {
      if (saved?.board) setBoard(saved.board);
      if (saved?.items) setItems(saved.items.map((it) => ({ ...it, busy: false })));
      setLoaded(true);
    });
  }, []);

  const latestRef = useRef(null);
  useEffect(() => {
    if (!loaded) return;
    latestRef.current = { board, items: items.map(({ busy, ...it }) => it) };
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveBoard(latestRef.current), 800);
    return () => clearTimeout(saveTimer.current);
  }, [board, items, loaded]);

  // 卸载（切换 tab / 关页面前）立即落盘，避免 debounce 中的修改丢失
  useEffect(
    () => () => {
      if (latestRef.current) saveBoard(latestRef.current);
    },
    []
  );

  // ---- 添加图片 ----
  const addFiles = useCallback(
    async (fileList) => {
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
    },
    []
  );

  const patchItem = (id, patch) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

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

  // ---- 层级 / 删除 ----
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

  // ---- AI 实拍级排版：所有素材合成一张摄影级 flat-lay ----
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
        (labels.length ? `\nSample notes: ${labels.join('; ')}.` : '');
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

  /** 把标题字压到图上后下载（提案封面） */
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
    if (board.title || board.subtitle) {
      const mx = W * 0.05;
      let by = H - W * 0.05;
      ctx.shadowColor = 'rgba(26,22,20,0.35)';
      ctx.shadowBlur = W * 0.008;
      if (board.subtitle) {
        ctx.font = `500 ${W * 0.016}px "DM Sans", "Noto Sans SC", sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText(board.subtitle.toUpperCase(), mx, by);
        by -= W * 0.032;
      }
      if (board.title) {
        ctx.font = `600 ${W * 0.036}px Fraunces, Georgia, "Noto Sans SC", serif`;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(board.title, mx, by);
        by -= W * 0.05;
      }
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#B8995A';
      ctx.fillRect(mx, by, W * 0.055, Math.max(3, W * 0.0024));
    }
    downloadDataUrl(
      await applyWatermark(canvas.toDataURL('image/png'), settings.watermark),
      `moodboard-flatlay-${board.title || 'sail'}.png`
    );
  }

  // ---- 导出 PNG ----
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
        if (it.label) {
          const fs = Math.max(22, W * 0.013);
          ctx.font = `500 ${fs}px "DM Sans", "Noto Sans SC", sans-serif`;
          const tw = ctx.measureText(it.label).width;
          const pad = fs * 0.6;
          const ly = h / 2 - fs - pad;
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.fillRect(-w / 2 + pad, ly - pad * 0.4, tw + pad * 1.2, fs * 1.6);
          ctx.fillStyle = '#1A1614';
          ctx.fillText(it.label, -w / 2 + pad * 1.6, ly + fs * 0.85);
        }
        ctx.restore();
      }

      // 标题区（左下）
      if (board.title || board.subtitle) {
        const mx = W * 0.045;
        let by = H - W * 0.045;
        if (board.subtitle) {
          ctx.font = `500 ${W * 0.014}px "DM Sans", "Noto Sans SC", sans-serif`;
          ctx.fillStyle = bg.ink + 'B3';
          ctx.fillText(board.subtitle.toUpperCase(), mx, by);
          by -= W * 0.028;
        }
        if (board.title) {
          ctx.font = `600 ${W * 0.032}px Fraunces, Georgia, "Noto Sans SC", serif`;
          ctx.fillStyle = bg.ink;
          ctx.fillText(board.title, mx, by);
          by -= W * 0.045;
        }
        ctx.fillStyle = '#B8995A';
        ctx.fillRect(mx, by, W * 0.05, Math.max(4, W * 0.0022));
      }

      downloadDataUrl(
        await applyWatermark(canvas.toDataURL('image/png'), settings.watermark),
        `moodboard-${board.title || 'sail'}.png`
      );
    } finally {
      setExporting(false);
    }
  }

  const stageStyle = useMemo(
    () => ({ background: bg.color, aspectRatio: `${ratio.ratio}` }),
    [bg.color, ratio.ratio]
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* 左侧控制 */}
      <div className="space-y-5 bg-sail-card border border-sail-line rounded-2xl p-5 h-fit lg:sticky lg:top-20">
        <div>
          <div className="text-xs font-semibold text-sail-faint mb-2">素材</div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full h-24 rounded-xl border-2 border-dashed border-sail-line hover:border-sail-green/50 flex flex-col items-center justify-center gap-1 text-sail-faint"
          >
            <UploadCloud size={20} />
            <span className="text-sm">添加图片（可多选）</span>
            <span className="text-[11px]">材质小样、家具、地板、五金、灵感照片</span>
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

        <div>
          <div className="text-xs font-semibold text-sail-faint mb-2">封面文字</div>
          <input
            value={board.title}
            onChange={(e) => setBoard({ ...board, title: e.target.value })}
            placeholder="项目名，如：湖景苑 12-3A"
            className="w-full rounded-xl border border-sail-line px-3 py-2 text-sm mb-2 focus:outline-none focus:border-sail-green"
          />
          <input
            value={board.subtitle}
            onChange={(e) => setBoard({ ...board, subtitle: e.target.value })}
            placeholder="副标题，如：Material Board · 奶油风"
            className="w-full rounded-xl border border-sail-line px-3 py-2 text-sm focus:outline-none focus:border-sail-green"
          />
        </div>

        <div>
          <div className="text-xs font-semibold text-sail-faint mb-2">画幅 / 底色</div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {RATIOS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setBoard({ ...board, ratioId: r.id })}
                className={`px-3 py-1.5 rounded-lg text-sm border ${
                  board.ratioId === r.id
                    ? 'bg-sail-green text-white border-sail-green'
                    : 'bg-white text-sail-muted border-sail-line'
                }`}
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
                className={`w-8 h-8 rounded-full border-2 ${
                  board.bgId === b.id ? 'border-sail-green' : 'border-sail-line'
                }`}
                style={{ background: b.color }}
                title={b.id}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-sail-faint mb-2">一键排版</div>
          <button
            type="button"
            onClick={aiFlatlay}
            disabled={flatlayBusy}
            className="w-full mb-2 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-sail-gold/15 border border-sail-gold text-sm font-medium text-sail-ink hover:bg-sail-gold/25 disabled:opacity-60"
            title="把所有素材交给 AI，合成一张摄影级俯拍材料板（真实厚度和影子）"
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
          <div className="text-[11px] text-sail-faint mt-1.5 leading-relaxed">
            「AI 实拍级排版」= 参考图那种真实摄影效果；网格 / 拼贴 = 手动精确控制。
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
                title="AI 把背景换成干净白底"
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

        <button
          type="button"
          onClick={exportPng}
          disabled={exporting}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-sail-green-deep text-white font-semibold hover:bg-sail-green disabled:opacity-60"
        >
          {exporting ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
          导出高清 PNG（提案封面）
        </button>
      </div>

      {/* 画板 */}
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
              <div className="text-sm">把材质、家具图片拖进来，或用左边「添加图片」</div>
              <div className="text-xs">拖动摆位 · 右下角拉大小 · 一键排版 · AI 抠图 · 导出封面</div>
            </div>
          )}

          {items.map((it) => {
            const sel = it.id === selectedId;
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
                {it.label && (
                  <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-white/90 text-sail-ink text-[10px] font-medium rounded">
                    {it.label}
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
          })}

          {(board.title || board.subtitle) && (
            <div className="absolute left-[4.5%] bottom-[4.5%] pointer-events-none" style={{ color: bg.ink }}>
              <div className="w-10 h-1 mb-2" style={{ background: '#B8995A' }} />
              {board.title && <div className="font-display text-2xl font-semibold leading-tight">{board.title}</div>}
              {board.subtitle && (
                <div className="text-[11px] tracking-widest uppercase opacity-70 mt-1">{board.subtitle}</div>
              )}
            </div>
          )}
        </div>
        <div className="text-[11px] text-sail-faint mt-2 text-center">
          画板会自动保存在本机 · 导出为 2400px 高清 PNG，可直接放进 proposal
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
