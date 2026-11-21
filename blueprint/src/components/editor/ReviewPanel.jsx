import React, { useState } from 'react';
import { ClipboardCheck, X, Check, ChevronDown, ChevronRight, CircleCheck, Layers } from 'lucide-react';
import { REVIEW_KINDS } from '../../import/review.js';
import { resolveUrl } from '../../store/assets.js';

// 「请核对这几处」：导入时程序没把握的地方（lib/review.js）。常驻在页面列表的位置，点一条跳到那一页，核对完打勾。
// 已经改好的（加了材料、选了楼层…）自动算核对过；删掉的页不再列。

/**
 * @param {{ items:Array, project, pageNoOf:(slideId)=>number|undefined, currentSlideId?:string,
 *   onGo:(item)=>void, onDone:(id, done)=>void, onClose:()=>void, onGoInfo:()=>void, horizontal?:boolean }} props
 */
export default function ReviewPanel({ items, project, pageNoOf, currentSlideId, onGo, onDone, onClose, onGoInfo, horizontal }) {
  const [showDone, setShowDone] = useState(false);
  const open = items.filter((it) => it.status === 'open');
  const done = items.filter((it) => it.status !== 'open');
  const thumbOf = (n) => (project.pages || []).find((p) => p.n === n)?.thumb || null;

  const row = (it) => {
    const isOpen = it.status === 'open';
    const here = it.slideId && it.slideId === currentSlideId;
    const no = it.slideId ? pageNoOf(it.slideId) : undefined;
    const thumb = it.kind === 'page-unused' ? resolveUrl(thumbOf(it.page)) : null;
    const where = [it.page ? `原稿 p${it.page}` : '', it.slideId ? (no ? `第 ${no} 页` : '已隐藏的页') : ''].filter(Boolean).join(' → ');
    const clickable = !!it.slideId || it.kind === 'no-floors';
    return (
      <li
        key={it.id}
        className={`group rounded-lg border px-2 py-1.5 ${here ? 'border-bp-gold/60 bg-bp-gold/5' : 'border-bp-line bg-white'} ${isOpen ? '' : 'opacity-60'}`}
      >
        <div className="flex items-start gap-2">
          <button
            type="button"
            role="checkbox"
            aria-checked={!isOpen}
            disabled={it.status === 'fixed'}
            onClick={() => onDone(it.id, isOpen)}
            title={it.status === 'fixed' ? '已经改好了' : isOpen ? '核对好了，打勾' : '取消打勾'}
            className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
              isOpen ? 'border-bp-rule bg-white hover:border-bp-gold' : 'border-bp-gold bg-bp-gold text-white'
            }`}
          >
            {!isOpen && <Check className="w-3 h-3" strokeWidth={3} />}
          </button>
          <div
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={clickable ? () => (it.slideId ? onGo(it) : onGoInfo()) : undefined}
            onKeyDown={clickable ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), it.slideId ? onGo(it) : onGoInfo()) : undefined}
            className={`min-w-0 flex-1 ${clickable ? 'cursor-pointer' : ''}`}
            title={clickable ? (it.slideId ? '跳到这一页' : '去项目信息加楼层') : undefined}
          >
            <div className="flex items-center gap-1 text-[10px] text-bp-faint">
              <span className="font-medium text-bp-eyebrow">{REVIEW_KINDS[it.kind] || '核对'}</span>
              {where && <span>· {where}</span>}
              {it.status === 'fixed' && <span className="text-bp-green">· 已改好</span>}
            </div>
            <div className={`text-xs leading-snug ${isOpen ? 'text-bp-ink' : 'text-bp-muted line-through decoration-bp-rule'}`}>{it.text}</div>
            {isOpen && it.detail && <div className="mt-0.5 text-[11px] text-bp-muted leading-snug">{it.detail}</div>}
            {isOpen && thumb && <img src={thumb} alt={`原稿第 ${it.page} 页`} className="mt-1 w-full max-w-[140px] rounded border border-bp-line" />}
            {isOpen && it.kind === 'no-floors' && (
              <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-bp-gold">
                <Layers className="w-3 h-3" /> 去项目信息加楼层
              </span>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div data-review-panel className={`flex flex-col min-h-0 ${horizontal ? 'max-h-[50vh]' : 'h-full'}`}>
      <div className={`flex items-start justify-between gap-2 ${horizontal ? 'pb-1.5' : 'px-3 pt-3 pb-2'}`}>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-bp-ink">
            <ClipboardCheck className="w-3.5 h-3.5 text-bp-gold" />
            请核对这几处
          </div>
          <div className="text-[10px] text-bp-faint leading-snug">
            {open.length ? `还有 ${open.length} 处 · 导入时程序没把握的地方，点一条跳到那页` : '全部核对好了'}
          </div>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 inline-flex items-center gap-0.5 text-[11px] text-bp-muted hover:text-bp-ink" title="回到页面列表（清单还在，随时可以再打开）">
          页面列表
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className={`flex-1 min-h-0 overflow-y-auto thin-scroll ${horizontal ? '' : 'px-2 pb-6'}`}>
        {open.length ? (
          <ul className="space-y-1">{open.map(row)}</ul>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-bp-tint px-3 py-3 text-xs text-bp-muted">
            <CircleCheck className="w-4 h-4 text-bp-green shrink-0" />
            导入时没把握的地方都核对过了。
          </div>
        )}
        {done.length > 0 && (
          <div className="mt-2">
            <button type="button" onClick={() => setShowDone((v) => !v)} className="inline-flex items-center gap-1 px-1 text-[11px] text-bp-faint hover:text-bp-ink">
              {showDone ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              已核对 {done.length} 处
            </button>
            {showDone && <ul className="mt-1 space-y-1">{done.map(row)}</ul>}
          </div>
        )}
      </div>
    </div>
  );
}

/** 检查器顶上：这一页还要核对的（每条一个「核对好了」） */
export function SlideReviewNotes({ items, onDone }) {
  if (!items?.length) return null;
  return (
    <div className="mb-3 space-y-1.5" data-review-notes>
      {items.map((it) => (
        <div key={it.id} className="rounded-xl border border-bp-warn/30 bg-bp-warn/5 px-3 py-2">
          <div className="text-[10px] font-semibold tracking-wide text-bp-warn">请核对 · {REVIEW_KINDS[it.kind] || ''}</div>
          <div className="mt-0.5 text-xs text-bp-ink leading-snug">{it.text}</div>
          {it.detail && <div className="mt-0.5 text-[11px] text-bp-muted leading-snug">{it.detail}</div>}
          <button
            type="button"
            onClick={() => onDone(it.id, true)}
            className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-bp-line bg-white px-2.5 py-0.5 text-[11px] text-bp-ink hover:border-bp-gold"
          >
            <Check className="w-3 h-3 text-bp-gold" /> 核对好了
          </button>
        </div>
      ))}
    </div>
  );
}
