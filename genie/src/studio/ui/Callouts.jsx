// 顶部的材质标签：每个主要表面一片样板，细虚线连到 3D 里的位置。也是拖放目标（data-slot）。
// 排版：按锚点从左到右排成整齐的一行，只放在两块面板之间空着的那段画布里；标签之间至少 8px。
// 一行放不下：先去掉表面小字（只留材质名）；还放不下：交错排成两行。

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MAT_BY_ID, SLOT_BY_ID } from '../../shared/materials.js';
import { swatchURL } from '../../shared/textures.js';
import { L } from '../../shared/i18n.js';
import { slotName, freeBand } from './kit.jsx';

const SW = 50; // 样板宽
const PAD_X = 22; // 名牌左右内边距 + 发丝线
const MIN_GAP = 8;
const MAX_GAP = 28;
const ROW_GAP = 10;

// 量字宽：和 CSS 同一种字体（第一次画出来以后从真实的标签上读 font）
let ctx2d = null;
const fontCache = { name: '600 13px system-ui, sans-serif', sub: '500 13px system-ui, sans-serif' };
function textW(s, font) {
  if (!ctx2d) {
    try {
      ctx2d = document.createElement('canvas').getContext('2d');
    } catch {
      ctx2d = null;
    }
  }
  if (!ctx2d) return String(s).length * 7.5;
  ctx2d.font = font;
  return ctx2d.measureText(String(s)).width;
}

/** 一行：总宽放得下 → 等距排开、整体对准锚点的中间，夹在 [lo, hi] 里；放不下 → null */
function packRow(items, lo, hi, key) {
  const n = items.length;
  if (!n) return [];
  const sum = items.reduce((s, it) => s + it[key], 0);
  const span = hi - lo;
  if (sum + MIN_GAP * (n - 1) > span) return null;
  const gap = n > 1 ? Math.min(MAX_GAP, (span - sum) / (n - 1)) : 0;
  const total = sum + gap * (n - 1);
  const mid = (items[0].x + items[n - 1].x) / 2;
  let x = Math.max(lo, Math.min(hi - total, mid - total / 2));
  return items.map((it) => {
    const cx = x + it[key] / 2;
    x += it[key] + gap;
    return { ...it, cx };
  });
}

export default function Callouts({ anchors, materials, onPick, activeSlot, top = 76, panels }) {
  const [size, setSize] = useState({ w: innerWidth, h: innerHeight });
  const [, remeasure] = useState(0);
  const [fontVer, setFontVer] = useState(0);
  const hs = useRef({});
  const root = useRef(null);

  useEffect(() => {
    const r = () => setSize({ w: innerWidth, h: innerHeight });
    addEventListener('resize', r);
    return () => removeEventListener('resize', r);
  }, []);
  // 面板展开 / 收起有 0.38s 的动画：动画结束后再量一次空位
  useEffect(() => {
    const tm = setTimeout(() => remeasure((n) => n + 1), 420);
    return () => clearTimeout(tm);
  }, [panels]);

  // 每一片的名字、表面名和宽度（材质或语言变了才重算）
  const vis = anchors.filter((a) => a.visible).sort((a, b) => a.x - b.x);
  const labels = useMemo(() => {
    const out = {};
    for (const a of vis) {
      const m = MAT_BY_ID[materials[a.slot]];
      const name = L(m);
      const sub = slotName(SLOT_BY_ID[a.slot]);
      const wn = textW(name, fontCache.name);
      const ws = textW(sub, fontCache.sub);
      out[a.slot] = { m, name, sub, full: Math.ceil(Math.max(SW, Math.max(wn, ws) + PAD_X)), compact: Math.ceil(Math.max(SW, wn + PAD_X)) };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials, vis.map((a) => a.slot).join(','), fontVer]);

  // 画完以后：读真实字体（第一次）+ 每片的高度（虚线从名牌底下出发）
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    let changed = false;
    let fontChanged = false;
    const b = el.querySelector('.callout-tag b');
    const e = el.querySelector('.callout-tag em');
    if (b) {
      const f = getComputedStyle(b).font;
      if (f && f !== fontCache.name) {
        fontCache.name = f;
        fontChanged = true;
      }
    }
    if (e) {
      const f = getComputedStyle(e).font;
      if (f && f !== fontCache.sub) {
        fontCache.sub = f;
        fontChanged = true;
      }
    }
    if (fontChanged) setFontVer((v) => v + 1);
    el.querySelectorAll('.callout').forEach((n) => {
      const h = n.offsetHeight;
      if (Math.abs((hs.current[n.dataset.slot] || 0) - h) > 0.5) {
        hs.current[n.dataset.slot] = h;
        changed = true;
      }
    });
    if (changed) remeasure((n) => n + 1);
  });

  if (!vis.length || size.w < 600 || size.h < 560) return null;

  // 排版：一行（完整）→ 一行（只留材质名）→ 两行交错（完整 / 只留名）
  const items = vis.map((a) => ({ ...a, full: labels[a.slot]?.full || 96, compact: labels[a.slot]?.compact || 80 }));
  const estH = (compact) => SW + 7 + (compact ? 28 : 44);
  const band1 = freeBand(top, top + estH(false));
  let placed = null;
  let compact = false;
  let rows = 1;
  placed = packRow(items, band1.L, band1.R, 'full');
  if (!placed) {
    compact = true;
    placed = packRow(items, band1.L, band1.R, 'compact');
  }
  if (!placed) {
    rows = 2;
    const even = items.filter((_, i) => i % 2 === 0);
    const odd = items.filter((_, i) => i % 2 === 1);
    for (const key of ['full', 'compact']) {
      const rowH = estH(key === 'compact') + ROW_GAP;
      const b2 = freeBand(top, top + rowH * 2);
      const a = packRow(even, b2.L, b2.R, key);
      const b = packRow(odd, b2.L, b2.R, key);
      if (a && b) {
        compact = key === 'compact';
        placed = [...a.map((p) => ({ ...p, cy: top })), ...b.map((p) => ({ ...p, cy: top + rowH }))].sort((p, q) => p.x - q.x);
        break;
      }
    }
  }
  if (!placed) return null;
  placed = placed.map((p) => ({ ...p, cy: p.cy ?? top }));

  return (
    <div ref={root} className={`callouts ${compact ? 'compact' : ''} rows-${rows}`}>
      <svg className="callout-lines" width={size.w} height={size.h} aria-hidden="true">
        {placed.map((a) => (
          <g key={a.slot} className={activeSlot === a.slot ? 'on' : ''}>
            <line x1={a.cx} y1={a.cy + (hs.current[a.slot] || estH(compact))} x2={a.x} y2={a.y} />
            <circle cx={a.x} cy={a.y} r="4" />
          </g>
        ))}
      </svg>
      {placed.map((a) => {
        const lb = labels[a.slot] || {};
        return (
          <button
            key={a.slot}
            type="button"
            data-slot={a.slot}
            className={`callout ${activeSlot === a.slot ? 'on' : ''}`}
            style={{ left: a.cx, top: a.cy }}
            onClick={() => onPick(a.slot)}
            aria-label={`${lb.sub} · ${lb.name}`}
            title={compact ? `${lb.sub} · ${lb.name}` : undefined}
          >
            <span className="sample md">
              <img src={swatchURL(lb.m?.id, 112) || ''} alt="" draggable={false} />
            </span>
            <span className="callout-tag">
              <b>{lb.name}</b>
              {!compact && <em>{lb.sub}</em>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
