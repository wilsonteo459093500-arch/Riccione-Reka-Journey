// 顶部「方案封面」卡：当前封面预览 + 三步说明 + 上传现成的 Material Board
import React, { useRef } from 'react';
import { ImageUp, Check, LoaderCircle, Info } from 'lucide-react';
import { resolveUrl } from '../store/assets.js';
import { COVER_LAYOUTS } from '../engine/layouts.js';
import { orientationOf, coverRatioMismatch } from './layout.js';
import { coverLayoutFor } from '../lib/project.js';
import { card, btnGhost } from './ui.js';

/**
 * props: { project, ratioId, coverBusy, coverDone, onUploadCover(file) }
 */
export default function CoverCard({ project, ratioId, coverBusy, coverDone, onUploadCover }) {
  const fileRef = useRef(null);
  const cover = project?.cover || {};
  const url = resolveUrl(cover.image);
  const layout = cover.layout || 'split-light';
  const layoutLabel = COVER_LAYOUTS.find((l) => l.id === layout)?.label || layout;
  const full = layout === 'full';
  const orient = orientationOf(ratioId);
  // 设封面时版式会跟着画板方向换；换完后比例仍不同（方形 / A4）→ 提示四周会补底色
  const nextLayout = coverLayoutFor(layout, orient);
  const mismatch = coverRatioMismatch(ratioId, nextLayout);

  return (
    <div className={`${card} flex gap-4 items-start`}>
      <div
        className="shrink-0 w-24 sm:w-28 rounded-lg overflow-hidden border border-bp-line bg-bp-tint flex items-center justify-center"
        style={{ aspectRatio: full ? '16 / 9' : '3 / 4' }}
        title={url ? '当前方案封面' : '还没有方案封面'}
      >
        {url ? (
          <img src={url} alt="当前方案封面" className="w-full h-full object-cover" draggable={false} />
        ) : (
          <span className="text-[10px] text-bp-faint px-2 text-center leading-snug">还没有封面</span>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <div className="text-[11px] tracking-[0.25em] text-bp-eyebrow">MATERIAL BOARD</div>
          <div className="text-sm font-semibold text-bp-ink">方案封面</div>
          <span className="text-[11px] text-bp-faint">当前版式：{layoutLabel}</span>
          {coverDone && (
            <span className="inline-flex items-center gap-1 text-[11px] text-bp-green">
              <Check size={12} /> 已更新封面
            </span>
          )}
        </div>
        <div className="text-xs text-bp-muted leading-relaxed">
          ① 导入本案材料 → ② 摆好画板，或交给 AI 实拍排版 → ③ 设为方案封面（放在「方案 · 设计图」章节的第一页，公司封面不变）。
        </div>
        <div className="flex items-start gap-1 text-[11px] text-bp-faint leading-relaxed">
          <Info size={12} className="mt-0.5 shrink-0" />
          <span>封面上的标题文字会在 PPT 里以可编辑文字呈现，所以这里导出的是无字版。左文右图封面用竖版，满版封面用 16:9。</span>
        </div>
        {mismatch && (
          <div className="text-[11px] text-bp-warn leading-relaxed">
            {nextLayout === 'full'
              ? '设为封面后是「满版大图」（16:9）：这块画板的比例不同，四周会补上底色 —— 想铺满就把画幅换成 16:9。'
              : '设为封面后是「左文右图」（3:4）：这块画板的比例不同，四周会补上底色 —— 想铺满就把画幅换成竖版 3:4。'}
          </div>
        )}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={!!coverBusy}
            className={`${btnGhost} text-xs py-1.5`}
            title="例如在 UKIR STUDIO 做好的 Material Board 图片"
          >
            {coverBusy === 'upload' ? <LoaderCircle size={13} className="animate-spin" /> : <ImageUp size={13} />}
            上传现成的 Material Board
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onUploadCover(f);
            }}
          />
        </div>
      </div>
    </div>
  );
}
