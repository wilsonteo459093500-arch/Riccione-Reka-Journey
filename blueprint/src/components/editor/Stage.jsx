import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Columns2, Sparkles, LayoutTemplate, TriangleAlert, Wand2, EyeOff, MousePointerClick,
  RectangleHorizontal, PanelLeft, Shuffle, Languages, Move, RotateCcw,
} from 'lucide-react';
import SlideCanvas from '../SlideCanvas.jsx';
import AdjustLayer from './AdjustLayer.jsx';
import { applyAdjust } from '../../engine/adjust.js';
import { resolveUrl, metaOf } from '../../store/assets.js';
import { langOf } from '../../engine/lang.js';
import { LANG_OPTIONS, LANG_VERSION, toolbarCompactWidth } from '../../lib/langUi.js';
import { fixForWarning, companyKeyOf } from './ops.js';
import { useElementSize } from './hooks.js';
import { Menu, Segmented, btnGhost } from './ui.jsx';

// 中间大画布：按可用空间缩放；点画面上的字 / 图 → 右侧检查器定位到对应输入框；
// 翻页、提醒与一键修复、「对照原稿」、AI 润色、全局版式、提案语言（华文 / English / 中英）与「AI 翻译」。

const PAD = 40; // 画布四周留白（px）
const GAP = 20;
// 画布区比 toolbarCompactWidth(…) 窄：顶栏按钮收成图标 / 短字，页名才放得下（English / 中英版多了「AI 翻译 · N」，门槛更宽）

/** 提案语言 + 缺英文时的「AI 翻译 · N」（整套的设置，放在顶栏最右；窄屏折行时靠右） */
function LangControls({ lang, onLang, missingCount, onTranslate, compact }) {
  const missing = lang !== 'zh' && missingCount > 0;
  return (
    <div className={`ml-auto flex items-center gap-1.5 ${compact ? '' : 'pl-2.5 border-l border-bp-line'}`}>
      <Segmented
        size={compact ? 'xs' : 'sm'}
        className={compact ? 'h-[30px]' : ''}
        options={LANG_OPTIONS}
        value={lang}
        onChange={(v) => v !== lang && onLang?.(v)}
      />
      {missing && (
        <button
          type="button"
          onClick={onTranslate}
          title={`${LANG_VERSION[lang]}还有 ${missingCount} 处中文没有英文 —— AI 一次翻好，逐条确认后套用`}
          className={`${btnGhost} !border-bp-warn/40 !bg-bp-warn/10 !text-bp-ink hover:!bg-bp-warn/[0.16] ${compact ? '!px-2' : ''}`}
        >
          <Languages className="w-3.5 h-3.5 text-bp-warn" />
          {compact ? '翻译' : 'AI 翻译'}
          <span className="tabular-nums text-bp-warn font-medium">· {missingCount}</span>
        </button>
      )}
    </div>
  );
}

function Toolbar({
  page, navIndex, navTotal, pageNo, exportTotal, onPrev, onNext, compare, canCompare, onToggleCompare, isView, onPolish, onGlobalLayout, hasViews,
  lang, onLang, missingCount, onTranslate, compact, adjusting, onToggleAdjust,
}) {
  // 页名：画布区够宽（桌面）时至少留 96px —— 放不下就让语言组折到第二行，不让页名被挤没（窗口变宽页名反而消失）；
  // 很窄（手机）时页名只是提示（检查器顶上也有），挤得只剩一两个字就干脆不显示，留作空白
  const barRef = useRef(null);
  const barSize = useElementSize(barRef);
  const roomy = barSize.w >= 560;
  const labelRef = useRef(null);
  const labelSize = useElementSize(labelRef);
  const squeezed = !roomy && labelSize.w > 0 && labelSize.w < 84;
  return (
    <div ref={barRef} className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-bp-line/70 bg-bp-paper">
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
      <div
        ref={labelRef}
        className={`${roomy ? 'min-w-[96px]' : 'min-w-0'} flex-1 basis-0 truncate text-sm text-bp-ink font-medium ${squeezed ? 'invisible' : ''}`}
        title={page?.label}
      >
        {page?.label}
      </div>
      <div className="flex items-center gap-1.5">
        {isView && (
          <button
            type="button"
            onClick={onToggleCompare}
            disabled={!canCompare}
            title={canCompare ? '把原稿 PDF 的那一页放在旁边对照' : '这一页没有对应的原稿页'}
            aria-label="对照原稿"
            className={`${btnGhost} ${compact ? '!px-2' : ''} ${compare ? '!bg-bp-dark !text-bp-light !border-bp-dark' : ''}`}
          >
            <Columns2 className="w-3.5 h-3.5" />
            {!compact && '对照原稿'}
          </button>
        )}
        <button
          type="button"
          onClick={onToggleAdjust}
          aria-pressed={adjusting}
          title="手动调整这一页：拖动照片和文字换位置、改大小，照片可以改取景"
          aria-label="调整版面"
          className={`${btnGhost} ${compact ? '!px-2' : ''} ${adjusting ? '!bg-bp-dark !text-bp-light !border-bp-dark' : ''}`}
        >
          <Move className="w-3.5 h-3.5" />
          {!compact && '调整版面'}
        </button>
        <Menu
          label={compact ? '润色' : 'AI 润色'}
          icon={Sparkles}
          width="w-60"
          items={[
            { label: '润色全部效果图标题…', icon: Sparkles, hint: '看图改写视角名、空间英文名和备注，逐页确认后套用', onClick: () => onPolish() },
            isView && { label: '只润色这一页…', icon: Wand2, onClick: () => onPolish(true) },
          ]}
        />
        <Menu
          label="版式"
          icon={LayoutTemplate}
          width="w-60"
          items={[
            { label: '全部自动排版', icon: Shuffle, disabled: !hasViews, hint: '横图、像素够又不丢材料 / 说明的页用满版，其余图文；不连续 3 页满版', onClick: () => onGlobalLayout('auto') },
            { label: '全部满版大图', icon: RectangleHorizontal, disabled: !hasViews, hint: '效果图铺满整页、不放文字（材料、说明不显示）', onClick: () => onGlobalLayout('full') },
            { label: '全部图文', icon: PanelLeft, disabled: !hasViews, hint: '页眉视角名 + 效果图贴左 + 右栏：楼层空间、说明、材料', onClick: () => onGlobalLayout('framed') },
          ]}
        />
      </div>
      {onLang && <LangControls lang={lang} onLang={onLang} missingCount={missingCount} onTranslate={onTranslate} compact={compact} />}
    </div>
  );
}

/**
 * @param {{ page:object, slide:object, project:object, navIndex:number, navTotal:number, pageNo?:number, exportTotal:number,
 *   onPrev(), onNext(), onPick(field, el), activeField?:string, onClearPick(), compare:boolean, onToggleCompare(),
 *   onFix(fix), onPolish(onlyThis?:boolean), onGlobalLayout(mode), onToggleEnabled(),
 *   onLang?(lang:'zh'|'en'|'bi'), missingCount?:number, onTranslate?(),
 *   onAdjust?(key, value|null, soft?), onClearAdjust?(pageIndex) }} props
 *   onLang：顶栏的提案语言切换；missingCount：整套缺英文的条数（English / 中英版时显示「AI 翻译 · N」）
 */
export default function Stage({
  page, slide, project, navIndex, navTotal, pageNo, exportTotal, onPrev, onNext, onPick, activeField, onClearPick, compare,
  onToggleCompare, onFix, onPolish, onGlobalLayout, onToggleEnabled, onLang, missingCount = 0, onTranslate, onAdjust, onClearAdjust,
}) {
  const areaRef = useRef(null);
  // 「调整版面」：打开后在画布上拖动照片 / 文字块（AdjustLayer）；关着时和原来一样（点一下跳到右侧输入框）
  const [adjusting, setAdjusting] = useState(false);
  const [draft, setDraft] = useState(null); // 拖动中的草稿 { key, value }：实时预览，松手才写进项目
  useEffect(() => setDraft(null), [page?.key]);
  // 自动排版的这一页（没套手动调整）：调整都是相对它算的
  const autoPage = useMemo(() => (page?.adjusted ? { ...page, els: page.autoEls } : page), [page]);
  const shownPage = useMemo(
    () => (adjusting && draft && autoPage ? applyAdjust(autoPage, { ...(slide?.adjust || {}), [draft.key]: draft.value }, page?.pageIndex || 0) : page),
    [adjusting, draft, autoPage, slide?.adjust, page]
  );
  const size = useElementSize(areaRef);
  const isView = slide?.kind === 'view';
  const lang = langOf(project);
  const compact = size.w > 0 && size.w < toolbarCompactWidth(lang, missingCount);
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
  // 公司页的提醒说的是栏位名（「第一章说明」）：一键修复要知道这一页用的是哪张公司页
  const fixCtx = { key: companyKeyOf(slide, project) };

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
        lang={lang}
        onLang={onLang}
        missingCount={missingCount}
        onTranslate={onTranslate}
        compact={compact}
        adjusting={adjusting}
        onToggleAdjust={() => {
          setAdjusting((v) => !v);
          setDraft(null);
          onClearPick?.();
        }}
      />

      <div
        ref={areaRef}
        onClick={onClearPick}
        className={`relative flex-1 min-h-0 flex items-center justify-center ${adjusting ? 'overflow-hidden' : ''}`}
      >
        {page && slideW > 0 && (
          <div className="flex items-center" style={{ gap: GAP }}>
            <div className="relative">
              <div
                className={`shadow-[0_10px_40px_rgba(36,28,18,0.14)] ring-1 ring-black/5 ${page.enabled ? '' : 'opacity-60'}`}
                onClick={(e) => e.stopPropagation()}
              >
                <SlideCanvas
                  slide={shownPage}
                  width={slideW}
                  resolveUrl={resolveUrl}
                  interactive={!adjusting}
                  onPick={onPick}
                  activeField={adjusting ? undefined : activeField || undefined}
                />
              </div>
              {adjusting && autoPage && (
                <AdjustLayer
                  key={page.key}
                  page={autoPage}
                  adjust={slide?.adjust}
                  scale={slideW / 1920}
                  areaEl={areaRef.current}
                  onDraft={setDraft}
                  onCommit={(key, value, soft) => {
                    setDraft(null);
                    onAdjust?.(key, value, soft);
                  }}
                  onExit={() => {
                    setAdjusting(false);
                    setDraft(null);
                    // 焦点回到开关上（键盘用户不会掉到页面开头）
                    areaRef.current?.parentElement?.querySelector('button[aria-label="调整版面"]')?.focus();
                  }}
                />
              )}
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
              const fix = fixForWarning(w, fixCtx);
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
          <p className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-bp-faint">
            {adjusting ? (
              <>
                <Move className="w-3.5 h-3.5" />
                点照片或文字选中 · 拖动换位置，拖角改大小 · 照片可在框里拖动取景、滚轮缩放 · 方向键微调 · 按住 Alt 不吸附 · Esc 退出
              </>
            ) : (
              <>
                <MousePointerClick className="w-3.5 h-3.5" />
                点画面上的文字或图片，右侧就会跳到对应的输入框 · ← → 翻页 · Alt + ↑ ↓ 调整顺序
              </>
            )}
          </p>
        )}
        {page?.adjusted && (
          <p className="flex justify-center mt-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => onClearAdjust?.(page.pageIndex || 0)}
              className="inline-flex items-center gap-1 text-bp-eyebrow hover:underline"
              title="这一页的照片和文字全部回到程序排的位置"
            >
              <RotateCcw className="w-3 h-3" />
              这一页有手动调整 · 整页恢复自动排版
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
