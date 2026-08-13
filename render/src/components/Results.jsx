import React, { useState } from 'react';
import { Download, RefreshCw, Maximize2, X, Columns2, ImageIcon, AlertTriangle, Wand2, Camera } from 'lucide-react';
import CompareSlider from './CompareSlider.jsx';
import { downloadDataUrl, applyWatermark } from '../services/images.js';

async function downloadWithWatermark(dataUrl, filename, watermark) {
  downloadDataUrl(await applyWatermark(dataUrl, watermark), filename);
}

function WatermarkBadge({ text }) {
  if (!text) return null;
  return (
    <span className="absolute bottom-2 right-2 text-[10px] font-semibold tracking-[0.18em] uppercase text-white/80 pointer-events-none [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">
      {text}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="h-full min-h-[420px] rounded-2xl border-2 border-dashed border-sail-line flex flex-col items-center justify-center gap-3 text-sail-faint bg-sail-tint/50">
      <ImageIcon size={40} strokeWidth={1.2} />
      <div className="text-sm font-medium">效果图会出现在这里</div>
      <div className="text-xs max-w-xs text-center leading-relaxed">
        左边上传照片或草图、选好空间和风格，点「生成效果图」。
        <br />
        一次可出 1–4 张方案，点图可放大、与原图对比。
      </div>
    </div>
  );
}

function Slot({ slot, inputImage, onIterate, onEnhance, onRefine, onOpen, watermark }) {
  if (slot.status === 'loading') {
    return (
      <div className="aspect-[4/3] rounded-2xl shimmer border border-sail-line flex items-center justify-center">
        <span className="text-xs text-sail-faint bg-white/70 px-3 py-1 rounded-full max-w-[85%] text-center">
          {slot.note || 'AI 渲染中…'}
        </span>
      </div>
    );
  }
  if (slot.status === 'error') {
    return (
      <div className="aspect-[4/3] rounded-2xl border border-sail-danger/40 bg-sail-danger/5 flex flex-col items-center justify-center gap-2 p-4 text-center">
        <AlertTriangle size={20} className="text-sail-danger" />
        <div className="text-xs text-sail-danger leading-relaxed">{slot.error}</div>
      </div>
    );
  }
  return (
    <div className="group relative rounded-2xl overflow-hidden border border-sail-line bg-white">
      <img
        src={slot.dataUrl}
        alt="生成的效果图"
        className="w-full cursor-zoom-in"
        onClick={() => onOpen(slot)}
      />
      <WatermarkBadge text={watermark} />
      <div className="absolute inset-x-0 bottom-0 p-2 flex gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/50 to-transparent">
        <button
          type="button"
          title="📸 极致真实（2x 放大 + 照片级纹理精炼）"
          onClick={() => onRefine(slot.id)}
          className="p-2 rounded-lg bg-sail-green text-white hover:bg-sail-green-deep"
        >
          <Camera size={15} />
        </button>
        <button
          type="button"
          title="增强真实感（重渲染影子 / 纹理 / 光感）"
          onClick={() => onEnhance(slot.id)}
          className="p-2 rounded-lg bg-sail-gold/90 text-sail-ink hover:bg-sail-gold"
        >
          <Wand2 size={15} />
        </button>
        <button
          type="button"
          title="放大查看 / 对比原图"
          onClick={() => onOpen(slot)}
          className="p-2 rounded-lg bg-white/90 text-sail-ink hover:bg-white"
        >
          <Maximize2 size={15} />
        </button>
        <button
          type="button"
          title="以此图为底继续修改"
          onClick={() => onIterate(slot.dataUrl)}
          className="p-2 rounded-lg bg-white/90 text-sail-ink hover:bg-white"
        >
          <RefreshCw size={15} />
        </button>
        <button
          type="button"
          title="下载（带水印）"
          onClick={() => downloadWithWatermark(slot.dataUrl, `sail-render-${slot.id}.jpg`, watermark)}
          className="p-2 rounded-lg bg-white/90 text-sail-ink hover:bg-white"
        >
          <Download size={15} />
        </button>
      </div>
    </div>
  );
}

export default function Results({ slots, inputImage, onIterate, onEnhance, onRefine, busy, watermark }) {
  const [lightbox, setLightbox] = useState(null); // { slot, compare }

  if (!slots.length) return <EmptyState />;

  return (
    <>
      <div className={`grid gap-4 ${slots.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {slots.map((slot) => (
          <Slot
            key={slot.id}
            slot={slot}
            inputImage={inputImage}
            onIterate={onIterate}
            onEnhance={onEnhance}
            onRefine={onRefine}
            onOpen={(s) => setLightbox({ slot: s, compare: false })}
            watermark={watermark}
          />
        ))}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-sail-ink/90 flex flex-col items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex gap-2">
                {inputImage && (
                  <button
                    type="button"
                    onClick={() => setLightbox((l) => ({ ...l, compare: !l.compare }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
                      lightbox.compare ? 'bg-sail-gold text-sail-ink' : 'bg-white/15 text-white hover:bg-white/25'
                    }`}
                  >
                    <Columns2 size={15} />
                    对比原图
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setLightbox(null);
                    onRefine(lightbox.slot.id);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-sail-green text-white hover:bg-sail-green-deep"
                >
                  <Camera size={15} />
                  极致真实
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLightbox(null);
                    onEnhance(lightbox.slot.id);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-sail-gold text-sail-ink hover:bg-sail-gold/80"
                >
                  <Wand2 size={15} />
                  增强真实感
                </button>
                <button
                  type="button"
                  onClick={() => onIterate(lightbox.slot.dataUrl)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-white/15 text-white hover:bg-white/25"
                >
                  <RefreshCw size={15} />
                  以此继续改
                </button>
                <button
                  type="button"
                  onClick={() => downloadWithWatermark(lightbox.slot.dataUrl, `sail-render-${lightbox.slot.id}.jpg`, watermark)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-white/15 text-white hover:bg-white/25"
                >
                  <Download size={15} />
                  下载
                </button>
              </div>
              <button type="button" onClick={() => setLightbox(null)} className="p-2 rounded-lg bg-white/15 text-white hover:bg-white/25">
                <X size={16} />
              </button>
            </div>

            {lightbox.compare && inputImage ? (
              <CompareSlider before={inputImage.dataUrl} after={lightbox.slot.dataUrl} />
            ) : (
              <div className="relative">
                <img src={lightbox.slot.dataUrl} alt="效果图大图" className="w-full max-h-[80vh] object-contain rounded-xl" />
                <WatermarkBadge text={watermark} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
