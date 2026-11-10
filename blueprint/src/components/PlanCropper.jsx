import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Maximize, X } from 'lucide-react';
import { FULL_BOX, PLAN_SCOPES, regionBox, dragCropBox } from '../ai/dollhouse.js';

// 「框选要生成的范围」对话框：平面图上叠一个可拖动、八个把手可缩放的框（鼠标 / 触屏都能用）。
// props: { url, region, detecting, initialBox, initialScope, busy, onConfirm({ box, scope }), onCancel }
//   region：AI 认出的 { kind, drawing, mainRoom }（可能还没回来 = null）；detecting：AI 还在认
//   用户没动过框时，AI 的结果回来 / 切换范围会把框换成对应的默认框；动过就不再自动改

const HANDLES = [
  { id: 'nw', cls: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize' },
  { id: 'n', cls: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize' },
  { id: 'ne', cls: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize' },
  { id: 'e', cls: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize' },
  { id: 'se', cls: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize' },
  { id: 's', cls: 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize' },
  { id: 'sw', cls: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize' },
  { id: 'w', cls: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize' },
];

const pct = (n) => `${(n * 100).toFixed(3)}%`;

export default function PlanCropper({ url, region, detecting, initialBox, initialScope = 'room', busy, onConfirm, onCancel }) {
  const [scope, setScope] = useState(initialScope === 'all' ? 'all' : 'room');
  const [box, setBox] = useState(initialBox || FULL_BOX);
  const touched = useRef(!!initialBox); // 已经有确认过的框（重新框选）就不让 AI 的结果覆盖
  const wrapRef = useRef(null);
  const drag = useRef(null);
  const isFloor = region?.kind === 'floor';

  // AI 的结果回来：没动过框就用它的默认框
  useEffect(() => {
    if (region && !touched.current) setBox(regionBox(region, isFloor ? 'all' : scope));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onCancel?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  function pickScope(id) {
    setScope(id);
    if (region) {
      touched.current = false;
      setBox(regionBox(region, id));
    }
  }

  function onPointerDown(e, mode) {
    if (busy) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return;
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: box, rw: rect.width, rh: rect.height };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d) return;
    touched.current = true;
    setBox(dragCropBox(d.start, d.mode, (e.clientX - d.sx) / d.rw, (e.clientY - d.sy) / d.rh));
  }

  function onPointerUp(e) {
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }

  const useWhole = () => {
    touched.current = true;
    setBox(FULL_BOX);
  };

  const status = detecting
    ? 'AI 正在找图纸范围…也可以直接自己拖'
    : region
      ? isFloor
        ? 'AI 认出这是整层图纸，已框出图纸范围（标题、logo、装饰栏在框外）。不准就拖动框线调整。'
        : `AI 已框出${scope === 'room' ? `主房间${region.roomName ? `「${region.roomName}」` : ''}` : '整张图纸'}。不准就拖动框线调整。`
      : '拖动框线，把要生成的范围框进去，标题、logo、装饰栏留在框外。';

  return (
    <div role="dialog" aria-modal="true" aria-label="框选要生成的范围" className="fixed inset-0 z-50 bg-bp-ink/70 flex items-center justify-center p-3 sm:p-6">
      <div className="bg-bp-card rounded-2xl shadow-2xl w-full max-w-4xl max-h-full flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-bp-line">
          <div>
            <div className="font-serif text-lg text-bp-ink">框选要生成的范围</div>
            <div className="mt-1 text-xs text-bp-muted leading-relaxed flex items-start gap-1.5">
              {detecting && <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin" />}
              {status}
            </div>
          </div>
          <button type="button" className="p-1.5 rounded-lg text-bp-faint hover:text-bp-ink hover:bg-bp-tint" onClick={onCancel} disabled={busy} aria-label="取消">
            <X size={18} />
          </button>
        </div>

        {!isFloor && (
          <div className="px-5 pt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-bp-faint mr-1">生成范围</span>
            {PLAN_SCOPES.map((s) => (
              <button
                key={s.id}
                type="button"
                title={s.hint}
                disabled={busy}
                onClick={() => pickScope(s.id)}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                  scope === s.id ? 'bg-bp-dark text-bp-light border-bp-dark' : 'bg-white text-bp-muted border-bp-line hover:border-bp-rule'
                }`}
              >
                {s.zh}
              </button>
            ))}
            <span className="text-[11px] text-bp-faint basis-full sm:basis-auto sm:ml-1">{PLAN_SCOPES.find((s) => s.id === scope)?.hint}</span>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto p-5 flex items-center justify-center bg-bp-tint/60 mt-3">
          <div
            ref={wrapRef}
            className="relative inline-block select-none"
            style={{ touchAction: 'none' }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <img src={url} alt="平面布置图" draggable={false} className="block max-w-full max-h-[58vh] bg-white" />
            {/* 框外压暗：四块 */}
            <div className="absolute inset-x-0 top-0 bg-bp-ink/45 pointer-events-none" style={{ height: pct(box.y) }} />
            <div className="absolute inset-x-0 bottom-0 bg-bp-ink/45 pointer-events-none" style={{ height: pct(1 - box.y - box.h) }} />
            <div className="absolute left-0 bg-bp-ink/45 pointer-events-none" style={{ top: pct(box.y), height: pct(box.h), width: pct(box.x) }} />
            <div className="absolute right-0 bg-bp-ink/45 pointer-events-none" style={{ top: pct(box.y), height: pct(box.h), width: pct(1 - box.x - box.w) }} />
            {/* 框 */}
            <div
              data-testid="crop-box"
              className="absolute border-2 border-bp-gold cursor-move"
              style={{ left: pct(box.x), top: pct(box.y), width: pct(box.w), height: pct(box.h) }}
              onPointerDown={(e) => onPointerDown(e, 'move')}
            >
              {HANDLES.map((hd) => (
                <span
                  key={hd.id}
                  data-handle={hd.id}
                  className={`absolute w-8 h-8 flex items-center justify-center ${hd.cls}`}
                  onPointerDown={(e) => onPointerDown(e, hd.id)}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-white border-2 border-bp-gold shadow" />
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-bp-line">
          <button type="button" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-bp-line bg-white text-xs text-bp-muted hover:bg-bp-tint disabled:opacity-50" onClick={useWhole} disabled={busy}>
            <Maximize size={13} /> 用整张图
          </button>
          <div className="flex-1" />
          <button type="button" className="px-3 py-2 rounded-lg text-xs text-bp-muted hover:text-bp-ink disabled:opacity-50" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-bp-dark text-bp-light text-sm font-medium hover:opacity-90 disabled:opacity-50"
            disabled={busy}
            onClick={() => onConfirm?.({ box, scope: isFloor ? 'all' : scope })}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} 确认范围
          </button>
        </div>
      </div>
    </div>
  );
}
