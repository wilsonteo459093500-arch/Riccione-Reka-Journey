// 顶部的材质标签：每个主要表面一片样板，细虚线连到 3D 里的位置。也是拖放目标（data-slot）。

import { useEffect, useState } from 'react';
import { MAT_BY_ID, SLOT_BY_ID } from '../../shared/materials.js';
import { swatchURL } from '../../shared/textures.js';
import { L } from '../../shared/i18n.js';
import { slotName } from './kit.jsx';

const LABEL_H = 92; // 样板 48 + 名牌

export default function Callouts({ anchors, materials, onPick, activeSlot, top = 76 }) {
  const [size, setSize] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => {
    const r = () => setSize({ w: innerWidth, h: innerHeight });
    addEventListener('resize', r);
    return () => removeEventListener('resize', r);
  }, []);
  const vis = anchors.filter((a) => a.visible).sort((a, b) => a.x - b.x);
  if (!vis.length || size.w < 600 || size.h < 560) return null;
  const narrow = size.w < 1000;
  const left = narrow ? 64 : size.w * (size.w > 1300 ? 0.3 : 0.33);
  const right = narrow ? size.w - 64 : size.w * (size.w > 1300 ? 0.74 : 0.7);
  const step = vis.length > 1 ? (right - left) / (vis.length - 1) : 0;
  const placed = vis.map((a, i) => ({ ...a, cx: vis.length > 1 ? left + step * i : (left + right) / 2, cy: top }));
  return (
    <div className="callouts">
      <svg className="callout-lines" width={size.w} height={size.h} aria-hidden="true">
        {placed.map((a) => (
          <g key={a.slot} className={activeSlot === a.slot ? 'on' : ''}>
            <line x1={a.cx} y1={a.cy + LABEL_H} x2={a.x} y2={a.y} />
            <circle cx={a.x} cy={a.y} r="4" />
          </g>
        ))}
      </svg>
      {placed.map((a) => {
        const m = MAT_BY_ID[materials[a.slot]];
        return (
          <button key={a.slot} type="button" data-slot={a.slot} className={`callout ${activeSlot === a.slot ? 'on' : ''}`} style={{ left: a.cx, top: a.cy }} onClick={() => onPick(a.slot)}>
            <span className="sample md">
              <img src={swatchURL(m?.id, 112) || ''} alt="" draggable={false} />
            </span>
            <span className="callout-tag">
              <b>{L(m)}</b>
              <em>{slotName(SLOT_BY_ID[a.slot])}</em>
            </span>
          </button>
        );
      })}
    </div>
  );
}
