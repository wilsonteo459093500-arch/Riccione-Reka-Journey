import React from 'react';
import { X, Star, Trash2, Download, RefreshCw, ImagePlus } from 'lucide-react';
import { MODES, ROOM_TYPES, STYLES } from '../constants.js';
import { downloadDataUrl, applyWatermark } from '../services/images.js';

async function downloadWithWatermark(dataUrl, filename, watermark) {
  downloadDataUrl(await applyWatermark(dataUrl, watermark), filename);
}

function labelOf(list, id) {
  return list.find((x) => x.id === id)?.label || '';
}

function fmtTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function HistoryPanel({ history, onClose, onToggleFav, onDelete, onReuseInput, onIterate, watermark }) {
  return (
    <div className="fixed inset-0 z-50 bg-sail-ink/50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-2xl h-full bg-sail-paper shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-sail-line bg-sail-card">
          <h2 className="font-display font-semibold">生成历史</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-sail-tint text-sail-muted">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto thin-scroll p-4 space-y-4">
          {!history.length && (
            <div className="text-center text-sm text-sail-faint py-16">
              还没有生成记录。历史只存在这台设备的浏览器里，最多保留 60 条（收藏的不会被清理）。
            </div>
          )}

          {history.map((rec) => (
            <div key={rec.id} className="bg-sail-card border border-sail-line rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs text-sail-muted">
                  <span className="font-medium text-sail-ink">
                    {labelOf(MODES, rec.modeId)} · {labelOf(ROOM_TYPES, rec.roomId)} · {labelOf(STYLES, rec.styleId)}
                  </span>
                  <span className="ml-2 text-sail-faint">{fmtTime(rec.ts)}</span>
                  {rec.extra && <div className="mt-0.5 text-sail-faint truncate max-w-md">“{rec.extra}”</div>}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    title={rec.fav ? '取消收藏' : '收藏（不会被自动清理）'}
                    onClick={() => onToggleFav(rec.id, !rec.fav)}
                    className={`p-1.5 rounded-lg hover:bg-sail-tint ${rec.fav ? 'text-sail-gold' : 'text-sail-faint'}`}
                  >
                    <Star size={15} fill={rec.fav ? 'currentColor' : 'none'} />
                  </button>
                  {rec.inputFull && (
                    <button
                      type="button"
                      title="用同一张底图再来一次"
                      onClick={() => onReuseInput(rec)}
                      className="p-1.5 rounded-lg hover:bg-sail-tint text-sail-faint"
                    >
                      <ImagePlus size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    title="删除这条记录"
                    onClick={() => onDelete(rec.id)}
                    className="p-1.5 rounded-lg hover:bg-sail-tint text-sail-faint hover:text-sail-danger"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto thin-scroll pb-1">
                {rec.inputThumb && (
                  <div className="relative shrink-0">
                    <img src={rec.inputThumb} alt="底图" className="h-28 rounded-lg border border-sail-line" />
                    <span className="absolute bottom-1 left-1 px-1.5 rounded bg-black/50 text-white text-[10px]">原图</span>
                  </div>
                )}
                {rec.outputs.map((out, i) => (
                  <div key={i} className="relative shrink-0 group">
                    <img src={out} alt={`方案 ${i + 1}`} className="h-28 rounded-lg border border-sail-line" />
                    <div className="absolute inset-0 rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        title="以此图继续修改"
                        onClick={() => onIterate(out)}
                        className="p-1.5 rounded-lg bg-white/90 text-sail-ink hover:bg-white"
                      >
                        <RefreshCw size={13} />
                      </button>
                      <button
                        type="button"
                        title="下载（带水印）"
                        onClick={() => downloadWithWatermark(out, `sail-render-${rec.id}-${i + 1}.jpg`, watermark)}
                        className="p-1.5 rounded-lg bg-white/90 text-sail-ink hover:bg-white"
                      >
                        <Download size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
