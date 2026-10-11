// 画板舞台：拖动摆位 / 右下角拉大小 / 顶部手柄旋转；标题块与图例用 SVG 叠加（与导出同一套几何）
import React, { useEffect, useMemo, useRef } from 'react';
import { CloudUpload, LoaderCircle } from 'lucide-react';
import {
  ratioOf, bgOf, clampMove, clampWidth, rotationFromDrag, titleBlockMetrics, legendEntries, legendLayout, badgeOf,
  SUB_TRACKING,
} from './layout.js';
import { LEGEND_FONT } from './render.js';

const VB_W = 1000; // SVG 叠加层的坐标宽

// 图例文字宽度：离屏 canvas 量字（与导出一致）
let measureCtx = null;
function measure(text, fs) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = `500 ${fs}px ${LEGEND_FONT}`;
  return measureCtx.measureText(text).width;
}

const ANCHOR = { left: 'start', center: 'middle', right: 'end' };

// 拖素材时 preventDefault 会让焦点留在输入框里 —— 主动失焦，Delete / 方向键才对画板生效
function blurInputs() {
  const el = document.activeElement;
  if (el && el !== document.body && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.blur();
}

function Overlay({ items, board, showLegend, ratio }) {
  const W = VB_W;
  const H = VB_W / ratio;
  const bg = bgOf(board.bgId);
  const t = titleBlockMetrics(W, H, board, bg.ink);
  const rows = showLegend ? legendEntries(items) : [];
  const L = rows.length ? legendLayout(W, H, rows, measure) : null;
  const byId = new Map(items.map((it) => [it.id, it]));
  if (!t && !L) return null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      {L &&
        rows.map((r) => {
          const b = badgeOf(byId.get(r.id), W);
          return (
            <g key={r.id}>
              <circle cx={b.cx} cy={b.cy} r={b.r} fill="rgba(36,28,18,0.86)" />
              <text x={b.cx} y={b.cy} dominantBaseline="central" textAnchor="middle" fontSize={b.r * 1.1} fontWeight="600" fill="#fff" style={{ fontFamily: LEGEND_FONT }}>
                {r.no}
              </text>
            </g>
          );
        })}
      {L && (
        <g>
          <rect x={L.bx} y={L.by} width={L.boxW} height={L.boxH} rx={L.radius} fill="rgba(255,255,255,0.92)" />
          {L.rows.map((r) => {
            const over = measure(r.label, L.fs) > L.maxTextW;
            return (
              <g key={r.id}>
                <circle cx={r.cx} cy={r.cy} r={L.cr} fill="rgba(36,28,18,0.86)" />
                <text x={r.cx} y={r.cy} dominantBaseline="central" textAnchor="middle" fontSize={L.cr * 1.1} fontWeight="600" fill="#fff" style={{ fontFamily: LEGEND_FONT }}>
                  {r.no}
                </text>
                <text
                  x={r.tx}
                  y={r.ty}
                  fontSize={L.fs}
                  fontWeight="500"
                  fill="#241C12"
                  style={{ fontFamily: LEGEND_FONT }}
                  {...(over ? { textLength: L.maxTextW, lengthAdjust: 'spacingAndGlyphs' } : {})}
                >
                  {r.label}
                </text>
              </g>
            );
          })}
        </g>
      )}
      {t && (
        <g>
          <rect x={t.ruleX} y={t.top} width={t.ruleW} height={t.ruleH} fill={t.gold} />
          {t.title && (
            <text x={t.x} y={t.titleY} textAnchor={ANCHOR[t.align]} fontSize={t.titleFs} fontWeight="600" fill={t.color} style={{ fontFamily: t.fontCss }}>
              {t.title}
            </text>
          )}
          {t.subtitle && (
            <text
              x={t.x}
              y={t.subY}
              textAnchor={ANCHOR[t.align]}
              fontSize={t.subFs}
              fontWeight="500"
              fill={t.color}
              fillOpacity={0.72}
              style={{ fontFamily: t.fontCss, letterSpacing: t.subFs * SUB_TRACKING }}
            >
              {t.subtitle}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}

/**
 * props: { items, board, selectedId, onSelect(id|null), onPatch(id, patch), showLegend, onDropFiles(FileList) }
 */
export default function BoardStage({ items, board, selectedId, onSelect, onPatch, showLegend, onDropFiles, standalone = false }) {
  const ratio = ratioOf(board.ratioId).ratio;
  const boardH = 100 / ratio;
  const bg = bgOf(board.bgId);
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const live = useRef({ onPatch, boardH });
  live.current = { onPatch, boardH };

  // 全局指针监听只挂一次，读 ref 里的最新回调
  useEffect(() => {
    function move(e) {
      const d = dragRef.current;
      if (!d) return;
      const { onPatch: patch, boardH: bh } = live.current;
      if (d.kind === 'rotate') {
        patch(d.id, {
          rot: rotationFromDrag({ cx: d.cx, cy: d.cy, x0: d.startX, y0: d.startY, x1: e.clientX, y1: e.clientY, origRot: d.orig.rot || 0, snap: e.shiftKey ? 0 : 4 }),
        });
        return;
      }
      const el = stageRef.current;
      const u = el ? 100 / el.clientWidth : 0.1;
      const dx = (e.clientX - d.startX) * u;
      const dy = (e.clientY - d.startY) * u;
      if (d.kind === 'move') {
        patch(d.id, clampMove(d.orig, dx, dy, bh));
      } else {
        // 沿素材自身的横轴拉伸（旋转后也顺手）
        const a = ((d.orig.rot || 0) * Math.PI) / 180;
        patch(d.id, { w: clampWidth(d.orig.w + dx * Math.cos(a) + dy * Math.sin(a)) });
      }
    }
    function up() {
      dragRef.current = null;
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  function start(e, it, kind) {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    blurInputs();
    onSelect(it.id);
    const d = { id: it.id, kind, startX: e.clientX, startY: e.clientY, orig: { ...it } };
    if (kind === 'rotate') {
      const box = e.currentTarget.closest('[data-board-item]')?.getBoundingClientRect();
      if (box) {
        d.cx = box.left + box.width / 2;
        d.cy = box.top + box.height / 2;
      }
    }
    dragRef.current = d;
  }

  const stageStyle = useMemo(
    () => ({
      background: bg.color,
      aspectRatio: `${ratio}`,
      // 竖版画板别比屏幕还高：按可视高度限制宽度
      maxWidth: `max(320px, calc((100vh - 220px) * ${ratio.toFixed(4)}))`,
    }),
    [bg.color, ratio]
  );

  return (
    <div
      ref={stageRef}
      onPointerDown={() => {
        blurInputs();
        onSelect(null);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer?.files?.length) onDropFiles(e.dataTransfer.files);
      }}
      className="relative w-full mx-auto rounded-2xl border border-bp-line overflow-hidden shadow-sm select-none"
      style={stageStyle}
    >
      {!items.length && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-bp-faint pointer-events-none">
          <CloudUpload size={32} strokeWidth={1.2} />
          <div className="text-sm">{standalone ? '从左侧材质库点样片，或直接拖图片进来' : '点上方「导入本案材料」，或从左侧材质库点样片、直接拖图片进来'}</div>
          <div className="text-xs">拖动摆位 · 右下角拉大小 · 顶部圆点旋转 · 命名后自动进图例</div>
        </div>
      )}

      {items.map((it) => {
        const sel = it.id === selectedId;
        return (
          <div
            key={it.id}
            data-board-item=""
            onPointerDown={(e) => start(e, it, 'move')}
            className="absolute cursor-grab active:cursor-grabbing"
            style={{
              left: `${it.x}%`,
              top: `${(it.y / boardH) * 100}%`,
              width: `${it.w}%`,
              transform: `rotate(${it.rot || 0}deg)`,
              filter: 'drop-shadow(0 6px 14px rgba(26,22,20,0.18))',
              touchAction: 'none',
            }}
          >
            <img src={it.dataUrl} alt={it.label || '素材'} className="w-full block pointer-events-none" draggable={false} />
            {it.busy && (
              <span className="absolute inset-0 bg-white/60 flex items-center justify-center">
                <LoaderCircle size={18} className="animate-spin text-bp-ink" />
              </span>
            )}
            {sel && (
              <>
                <span className="absolute inset-0 ring-2 ring-bp-gold pointer-events-none" />
                <span className="absolute left-1/2 -top-5 h-5 w-px bg-bp-gold pointer-events-none" />
                <span
                  onPointerDown={(e) => start(e, it, 'rotate')}
                  className="absolute left-1/2 -top-7 -ml-2 w-4 h-4 rounded-full bg-white border-2 border-bp-gold cursor-grab"
                  style={{ touchAction: 'none' }}
                  title="拖动旋转（按住 Shift 不吸附）"
                />
                <span
                  onPointerDown={(e) => start(e, it, 'resize')}
                  className="absolute -right-2 -bottom-2 w-4 h-4 rounded-full bg-bp-gold border-2 border-white cursor-nwse-resize"
                  style={{ touchAction: 'none' }}
                  title="拖动调整大小"
                />
              </>
            )}
          </div>
        );
      })}

      <Overlay items={items} board={board} showLegend={showLegend} ratio={ratio} />
    </div>
  );
}
