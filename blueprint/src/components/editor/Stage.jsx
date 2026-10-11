import React, { useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Columns2, Sparkles, LayoutTemplate, TriangleAlert, Wand2, EyeOff, MousePointerClick,
  RectangleHorizontal, PanelLeft, Shuffle,
} from 'lucide-react';
import SlideCanvas from '../SlideCanvas.jsx';
import { resolveUrl, metaOf } from '../../store/assets.js';
import { fixForWarning } from './ops.js';
import { useElementSize } from './hooks.js';
import { Menu, btnGhost } from './ui.jsx';

// 中间大画布：按可用空间缩放；点画面上的字 / 图 → 右侧检查器定位到对应输入框；
// 翻页、提醒与一键修复、「对照原稿」、AI 润色、全局版式。

const PAD = 40; // 画布四周留白（px）
const GAP = 20;

function Toolbar({ page, navIndex, navTotal, pageNo, exportTotal, onPrev, onNext, compare, canCompare, onToggleCompare, isView, onPolish, onGlobalLayout, hasViews }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-bp-line/70 bg-bp-paper">
      <div className="flex items-center gap-1">
        <button type="button" onClick={onPrev} disabled={navIndex <= 0} className={btnGhost + ' !px-2'} title="上一页（←）">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="min-w-[64px] text-center text-xs tabular-nums text-bp-muted" title={`列表第 ${navIndex + 1} / ${navTotal} 项`}>
          {pageNo ? (
            <>
              <span className="text-bp-ink font-semibold">{pageNo}</span> / {exportTotal}
            </>
          ) : (
            <span className="text-bp-faint">隐藏页</span>
          )}
        </span>
        <button type="button" onClick={onNext} disabled={navIndex >= navTotal - 1} className={btnGhost + ' !px-2'} title="下一页（→）">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="min-w-0 flex-1 truncate text-sm text-bp-ink font-medium" title={page?.label}>
        {page?.label}
      </div>
      <div className="flex items-center gap-1.5">
        {isView && (
          <button
            type="button"
            onClick={onToggleCompare}
            disabled={!canCompare}
            title={canCompare ? '把原稿 PDF 的那一页放在旁边对照' : '这一页没有对应的原稿页'}
            className={`${btnGhost} ${compare ? '!bg-bp-dark !text-bp-light !border-bp-dark' : ''}`}
          >
            <Columns2 className="w-3.5 h-3.5" />
            对照原稿
          </button>
        )}
        <Menu
          label="AI 润色"
          icon={Sparkles}
          width="w-60"
          items={[
            { label: '润色全部效果图标题…', icon: Sparkles, hint: '看图改写视角名、英文小标题和备注，逐页确认后套用', onClick: () => onPolish() },
            isView && { label: '只润色这一页…', icon: Wand2, onClick: () => onPolish(true) },
          ]}
        />
        <Menu
          label="版式"
          icon={LayoutTemplate}
          width="w-60"
          items={[
            { label: '全部自动排版', icon: Shuffle, disabled: !hasViews, hint: '按图片比例和内容重新选，避免连续 3 页同一版式', onClick: () => onGlobalLayout('auto') },
            { label: '全部满版', icon: RectangleHorizontal, disabled: !hasViews, hint: '整张效果图铺满，材料放右下角', onClick: () => onGlobalLayout('full') },
            { label: '全部框图', icon: PanelLeft, disabled: !hasViews, hint: '左图右文，适合材料 / 备注多的页', onClick: () => onGlobalLayout('framed') },
          ]}
        />
      </div>
    </div>
  );
}

/**
 * @param {{ page:object, slide:object, project:object, navIndex:number, navTotal:number, pageNo?:number, exportTotal:number,
 *   onPrev(), onNext(), onPick(field, el), activeField?:string, onClearPick(), compare:boolean, onToggleCompare(),
 *   onFix(fix), onPolish(onlyThis?:boolean), onGlobalLayout(mode), onToggleEnabled() }} props
 */
export default function Stage({
  page, slide, project, navIndex, navTotal, pageNo, exportTotal, onPrev, onNext, onPick, activeField, onClearPick, compare,
  onToggleCompare, onFix, onPolish, onGlobalLayout, onToggleEnabled,
}) {
  const areaRef = useRef(null);
  const size = useElementSize(areaRef);
  const isView = slide?.kind === 'view';
  const source = isView && slide.sourcePage ? (project.pages || []).find((p) => p.n === slide.sourcePage) : null;
  const sourceUrl = source?.thumb ? resolveUrl(source.thumb) : null;
  const canCompare = !!sourceUrl;
  const showCompare = compare && canCompare;
  const hasViews = (project.slides || []).some((s) => s.kind === 'view' && s.tag !== '3d');

  // 画布尺寸：塞进可用区域（对照时两张并排，同高）；窄屏留白小一点
  const pad = size.w < 640 ? 12 : PAD;
  const availW = Math.max(0, size.w - pad * 2);
  const availH = Math.max(0, size.h - pad * 2);
  let slideW = 0;
  let origW = 0;
  let origH = 0;
  if (availW > 0 && availH > 0) {
    if (showCompare) {
      const m = metaOf(source.thumb);
      const aspect = m?.w && m?.h ? m.w / m.h : 4 / 3;
      const h = Math.min(availH, (availW - GAP) / (16 / 9 + aspect));
      slideW = Math.floor((h * 16) / 9);
      origW = Math.floor(h * aspect);
      origH = Math.floor(h);
    } else {
      slideW = Math.floor(Math.min(availW, (availH * 16) / 9));
    }
  }

  const warnings = page?.warnings || [];

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0">
      <Toolbar
        page={page}
        navIndex={navIndex}
        navTotal={navTotal}
        pageNo={pageNo}
        exportTotal={exportTotal}
        onPrev={onPrev}
        onNext={onNext}
        compare={showCompare}
        canCompare={canCompare}
        onToggleCompare={onToggleCompare}
        isView={isView}
        onPolish={onPolish}
        onGlobalLayout={onGlobalLayout}
        hasViews={hasViews}
      />

      <div
        ref={areaRef}
        onClick={onClearPick}
        className="relative flex-1 min-h-0 flex items-center justify-center"
      >
        {page && slideW > 0 && (
          <div className="flex items-center" style={{ gap: GAP }}>
            <div className="relative">
              <div
                className={`shadow-[0_10px_40px_rgba(36,28,18,0.14)] ring-1 ring-black/5 ${page.enabled ? '' : 'opacity-60'}`}
                onClick={(e) => e.stopPropagation()}
              >
                <SlideCanvas
                  slide={page}
                  width={slideW}
                  resolveUrl={resolveUrl}
                  interactive
                  onPick={onPick}
                  activeField={activeField || undefined}
                />
              </div>
              {!page.enabled && (
                <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-white/95 shadow px-3 py-1 text-xs text-bp-muted">
                  <EyeOff className="w-3.5 h-3.5" />
                  这一页已隐藏，不会导出
                  <button type="button" onClick={onToggleEnabled} className="text-bp-eyebrow font-medium hover:underline">
                    显示
                  </button>
                </div>
              )}
            </div>
            {showCompare && (
              <figure className="relative shrink-0" style={{ width: origW }}>
                <div className="bg-white ring-1 ring-bp-line shadow-sm overflow-hidden" style={{ width: origW, height: origH }}>
                  <img src={sourceUrl} alt="原稿页" className="w-full h-full object-contain" draggable={false} />
                </div>
                <figcaption className="absolute left-0 right-0 top-full mt-1.5 text-center text-[11px] text-bp-faint truncate">
                  原稿 PDF 第 {slide.sourcePage} 页{source?.title ? ` · ${source.title}` : ''}
                </figcaption>
              </figure>
            )}
          </div>
        )}
      </div>

      <div className="px-5 pb-4 pt-1 min-h-[44px]">
        {warnings.length > 0 ? (
          <ul className="space-y-1.5">
            {warnings.map((w, i) => {
              const fix = fixForWarning(w);
              return (
                <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-bp-warn/10 border border-bp-warn/25 px-3 py-1.5 text-xs text-bp-ink">
                  <TriangleAlert className="w-3.5 h-3.5 text-bp-warn shrink-0" />
                  <span className="flex-1 min-w-0">{w}</span>
                  {fix && (
                    <button
                      type="button"
                      onClick={() => onFix(fix)}
                      className="inline-flex items-center gap-1 rounded-lg bg-bp-dark text-bp-light px-2.5 py-1 text-[11px] hover:opacity-90"
                    >
                      <Wand2 className="w-3 h-3" />
                      {fix.label}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-bp-faint">
            <MousePointerClick className="w-3.5 h-3.5" />
            点画面上的文字或图片，右侧就会跳到对应的输入框 · ← → 翻页 · Alt + ↑ ↓ 调整顺序
          </p>
        )}
      </div>
    </div>
  );
}
