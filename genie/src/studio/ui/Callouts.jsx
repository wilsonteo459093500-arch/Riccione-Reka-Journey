// 顶部的材质标签：每个主要表面一张色卡，虚线连到 3D 里的位置。也是拖放目标。

import { useEffect, useState } from 'react';
import { MAT_BY_ID, SLOT_BY_ID } from '../../shared/materials.js';
import { swatchURL } from '../../shared/textures.js';

export default function Callouts({ anchors, materials, onPick, activeSlot }) {
  const [size, setSize] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => {
    const r = () => setSize({ w: innerWidth, h: innerHeight });
    addEventListener('resize', r);
    return () => removeEventListener('resize', r);
  }, []);
  const vis = anchors.filter((a) => a.visible).sort((a, b) => a.x - b.x);
  if (!vis.length || size.w < 600) return null;
  const narrow = size.w < 1000;
  const left = narrow ? 56 : size.w * (size.w > 1300 ? 0.3 : 0.32);
  const right = narrow ? size.w - 56 : size.w * (size.w > 1300 ? 0.74 : 0.7);
  const top = 74;
  const step = vis.length > 1 ? (right - left) / (vis.length - 1) : 0;
  const placed = vis.map((a, i) => ({ ...a, cx: vis.length > 1 ? left + step * i : (left + right) / 2, cy: top }));
  return (
    <div className="callouts">
      <svg className="callout-lines" width={size.w} height={size.h}>
        {placed.map((a) => (
          <g key={a.slot}>
            <line x1={a.cx} y1={a.cy + 82} x2={a.x} y2={a.y} />
            <circle cx={a.x} cy={a.y} r="3.5" />
          </g>
        ))}
      </svg>
      {placed.map((a) => {
        const m = MAT_BY_ID[materials[a.slot]];
        return (
          <button key={a.slot} type="button" data-slot={a.slot} className={`callout ${activeSlot === a.slot ? 'on' : ''}`} style={{ left: a.cx, top: a.cy }} onClick={() => onPick(a.slot)}>
            <img src={swatchURL(m?.id, 112) || ''} alt="" draggable={false} />
            <b>{m?.en}</b>
            <em>{SLOT_BY_ID[a.slot]?.en}</em>
          </button>
        );
      })}
    </div>
  );
}
