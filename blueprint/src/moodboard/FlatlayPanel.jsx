// AI 实拍排版：把画板上的材质拍成一张杂志级俯拍 flat-lay（可加客户故事道具），结果可设为方案封面
import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, LoaderCircle, Download, Stamp, Trash2, KeyRound } from 'lucide-react';
import { generateImage } from '../ai/gemini.js';
import { MAX_FLATLAY_INPUTS, MAX_SHOTS } from './constants.js';
import { buildFlatlayPrompt, flatlayAspect, ratioOf, safeFileName } from './layout.js';
import { listShots, putShot, removeShot } from './store.js';
import { compressForStorage, shrinkDataUrl, dataUrlToInput, dataUrlToBlobSync, downloadBlob } from './images.js';
import { renderFlatlayCanvas, finishForDownload } from './render.js';
import { card, textarea, btnPrimary, btnGhost, btnGold } from './ui.js';

const uid = () => `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * props: { boardId, projectId, board, onBoardChange(patch), items, settings, notify, onOpenSettings,
 *          onUseAsCover(blob, meta) → Promise, coverBusy }
 */
export default function FlatlayPanel({
  boardId, projectId, board, onBoardChange, items, settings, notify, onOpenSettings, onUseAsCover, coverBusy,
}) {
  const [shots, setShots] = useState([]);
  const [activeShotId, setActiveShotId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [downloading, setDownloading] = useState(false);
  const boardRef = useRef(boardId);
  boardRef.current = boardId;
  const hasKey = !!settings?.apiKey;

  useEffect(() => {
    let alive = true;
    setShots([]);
    setActiveShotId(null);
    if (boardId) {
      listShots(boardId).then((all) => {
        if (!alive) return;
        setShots(all);
        setActiveShotId(all[0]?.id || null);
      });
    }
    return () => {
      alive = false;
    };
  }, [boardId]);

  const shot = shots.find((s) => s.id === activeShotId) || shots[0] || null;

  async function generate() {
    if (!hasKey) {
      onOpenSettings?.();
      return;
    }
    if (busy) return;
    if (items.length < 2) {
      notify?.({ type: 'warn', text: '先在画板上放至少 2 张材质图片' });
      return;
    }
    const startBoard = boardId;
    const used = items.slice(0, MAX_FLATLAY_INPUTS);
    if (items.length > MAX_FLATLAY_INPUTS) {
      notify?.({ type: 'warn', text: `素材太多，这次只取图层最底下的 ${MAX_FLATLAY_INPUTS} 张（可在画板里调图层顺序）` });
    }
    setBusy(true);
    setNote('AI 正在摆盘拍摄，约 20–40 秒…');
    try {
      const inputs = await Promise.all(used.map(async (it) => dataUrlToInput(await shrinkDataUrl(it.dataUrl, 1280))));
      const prompt = buildFlatlayPrompt({
        bgId: board.bgId,
        ratioId: board.ratioId,
        titlePos: board.titlePos,
        labels: used.map((it) => it.label || ''),
        notes: board.notes,
        story: board.story,
      });
      const raw = await generateImage(settings, prompt, inputs, flatlayAspect(board.ratioId), (w, a) =>
        setNote(`被限流，${w} 秒后自动重试（第 ${a}/3 次）…`)
      );
      const rec = { id: uid(), boardId: startBoard, projectId, dataUrl: await compressForStorage(raw), ratioId: board.ratioId, ts: Date.now() };
      const ok = await putShot(rec, MAX_SHOTS);
      if (!ok) notify?.({ type: 'warn', text: '实拍图没能存到本机（存储空间可能不足），记得先下载' });
      if (boardRef.current === startBoard) {
        setShots((prev) => [rec, ...prev].slice(0, MAX_SHOTS));
        setActiveShotId(rec.id);
      }
      notify?.({ type: 'ok', text: '实拍排版完成 —— 不满意可以再生成一张' });
    } catch (e) {
      notify?.({ type: 'error', text: `生成失败：${e.message}` });
    } finally {
      setBusy(false);
      setNote('');
    }
  }

  async function download() {
    if (!shot || downloading) return;
    setDownloading(true);
    try {
      const canvas = await renderFlatlayCanvas(shot.dataUrl, board, { withTitle: true });
      const blob = await finishForDownload(canvas, settings?.watermark);
      downloadBlob(blob, `material-board-flatlay-${safeFileName(board.title)}.png`);
    } catch (e) {
      notify?.({ type: 'error', text: `下载失败：${e.message}` });
    } finally {
      setDownloading(false);
    }
  }

  async function asCover() {
    if (!shot) return;
    // 干净的实拍图：不带标题、不带水印（PPT 封面自己有可编辑标题）
    const ratio = ratioOf(shot.ratioId || board.ratioId).ratio;
    await onUseAsCover(dataUrlToBlobSync(shot.dataUrl), {
      source: 'flatlay',
      orientation: ratio < 1 ? 'portrait' : ratio > 1 ? 'landscape' : 'square',
    });
  }

  async function deleteShot(id) {
    await removeShot(id);
    setShots((prev) => prev.filter((s) => s.id !== id));
    if (activeShotId === id) setActiveShotId(null);
  }

  const aspect = (shot && ratioOf(shot.ratioId || board.ratioId).ratio) || ratioOf(board.ratioId).ratio;

  return (
    <div className={`${card} space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-bp-ink">
            <Sparkles size={15} className="text-bp-gold" /> AI 实拍排版
          </div>
          <div className="text-xs text-bp-faint mt-0.5">把画板上的材质「拍」成一张杂志级俯拍照{onUseAsCover ? '，最适合做方案封面' : ''}。</div>
        </div>
        {!hasKey && (
          <button type="button" onClick={() => onOpenSettings?.()} className={`${btnGhost} shrink-0 text-xs py-1.5`}>
            <KeyRound size={13} /> 填 API key
          </button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-bp-faint">排版偏好（AI 会严格照做）</span>
          <textarea
            value={board.notes}
            onChange={(e) => onBoardChange({ notes: e.target.value })}
            rows={3}
            placeholder={'例：木饰面切成整齐的方块小样；石材保留完整大板；玻璃切成圆形；深色材质集中放右下。'}
            className={`${textarea} mt-1`}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-bp-faint">客户故事 / 道具</span>
          <textarea
            value={board.story}
            onChange={(e) => onBoardChange({ story: e.target.value })}
            rows={3}
            placeholder={'例：客户是面包店老板 —— 加一片烤酸种面包和香蕉叶'}
            className={`${textarea} mt-1`}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={generate} disabled={busy} className={btnGold}>
          {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {shots.length ? '再生成一张' : '生成实拍排版'}
        </button>
        <span className="text-[11px] text-bp-faint">
          {busy
            ? note
            : `用画板上的 ${Math.min(items.length, MAX_FLATLAY_INPUTS)} 张素材 · 底色、画幅跟随画板 · 标题位置会留白`}
        </span>
      </div>

      {(shot || busy) && (
        <div className="space-y-3">
          <div className="relative mx-auto" style={{ maxWidth: `max(280px, calc((100vh - 260px) * ${aspect.toFixed(4)}))` }}>
            {busy && !shot ? (
              <div className="rounded-xl shimmer flex items-center justify-center" style={{ aspectRatio: `${aspect}` }}>
                <span className="text-xs text-bp-faint bg-white/70 px-3 py-1 rounded-full">{note}</span>
              </div>
            ) : (
              shot && (
                <>
                  <img src={shot.dataUrl} alt="AI 实拍排版" className="w-full rounded-xl border border-bp-line" />
                  {busy && (
                    <span className="absolute top-2 left-2 flex items-center gap-1 text-[11px] text-bp-muted bg-white/85 px-2 py-1 rounded-full">
                      <LoaderCircle size={12} className="animate-spin" /> 生成新的一张…
                    </span>
                  )}
                </>
              )
            )}
          </div>

          {shots.length > 1 && (
            <div className="flex gap-2 overflow-x-auto thin-scroll pb-1">
              {shots.map((s) => (
                <div key={s.id} className="relative group shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveShotId(s.id)}
                    className={`block rounded-lg overflow-hidden border-2 ${s.id === shot?.id ? 'border-bp-gold' : 'border-transparent hover:border-bp-line'}`}
                  >
                    <img src={s.dataUrl} alt="" className="h-16 w-auto block" draggable={false} />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteShot(s.id)}
                    className="absolute top-1 right-1 p-0.5 rounded-full bg-bp-ink/70 text-white opacity-0 group-hover:opacity-100 focus:opacity-100"
                    title="删除这张"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {shot && (
            <div className="flex flex-wrap gap-2">
              {onUseAsCover && (
                <button type="button" onClick={asCover} disabled={!!coverBusy} className={btnPrimary}>
                  {coverBusy === 'flatlay' ? <LoaderCircle size={15} className="animate-spin" /> : <Stamp size={15} />}
                  设为方案封面
                </button>
              )}
              <button type="button" onClick={download} disabled={downloading} className={btnGhost}>
                {downloading ? <LoaderCircle size={15} className="animate-spin" /> : <Download size={15} />}
                下载 PNG（带标题{settings?.watermark ? ' + logo' : ''}）
              </button>
              {shots.length === 1 && (
                <button type="button" onClick={() => deleteShot(shot.id)} className={btnGhost} title="删除这张">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
