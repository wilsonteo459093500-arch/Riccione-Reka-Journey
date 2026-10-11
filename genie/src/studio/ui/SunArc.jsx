// 太阳弧（像参考视频那样放在日光面板下方）：日出在左、正午在顶、日落在右。拖太阳 = 拖时间；夜里换月亮。

import { useRef } from 'react';
import { fmtTime } from '../engine/daylight.js';

const RISE = 6.6;
const SET = 19.9;
const W = 230;
const H = 140;
const CX = W / 2;
const CY = H - 22;
const R = 96;

function posOf(h) {
  const t = Math.max(0, Math.min(1, (h - RISE) / (SET - RISE)));
  const a = Math.PI * (1 - t);
  return [CX + Math.cos(a) * R, CY - Math.sin(a) * R];
}

export default function SunArc({ time, onTime, onCommit }) {
  const ref = useRef(null);
  const up = time >= RISE && time <= SET;
  const [x, y] = up ? posOf(time) : [CX + R, CY];
  const toHour = (ev) => {
    const r = ref.current.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W - CX;
    const py = CY - ((ev.clientY - r.top) / r.height) * H;
    const a = Math.atan2(Math.max(0, py), px);
    return RISE + (1 - a / Math.PI) * (SET - RISE);
  };
  const down = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onTime(toHour(e));
    const move = (ev) => onTime(toHour(ev));
    const upFn = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', upFn);
      onCommit?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', upFn);
  };
  const ticks = [7, 10, 13, 16, 19].map((h) => posOf(h));
  return (
    <svg ref={ref} className="sunarc" viewBox={`0 0 ${W} ${H}`} width={W} height={H} onPointerDown={down}>
      <path d={`M${CX - R} ${CY} A${R} ${R} 0 0 1 ${CX + R} ${CY}`} className="sunarc-path" />
      <line x1={CX - R - 10} y1={CY} x2={CX + R + 10} y2={CY} className="sunarc-horizon" />
      {ticks.map(([tx, ty], i) => (
        <circle key={i} cx={tx} cy={ty} r="1.6" className="sunarc-tick" />
      ))}
      <text x={CX - R} y={CY + 15} className="sunarc-lbl" textAnchor="middle">
        日出
      </text>
      <text x={CX + R} y={CY + 15} className="sunarc-lbl" textAnchor="middle">
        日落
      </text>
      <g transform={`translate(${x},${y})`} className={`sunarc-sun ${up ? '' : 'moon'}`}>
        <circle r="20" className="sunarc-hit" />
        {up ? (
          <>
            <circle r="8" className="sunarc-core" />
            {[...Array(8)].map((_, i) => {
              const a = (i / 8) * Math.PI * 2;
              return <line key={i} x1={Math.cos(a) * 11.5} y1={Math.sin(a) * 11.5} x2={Math.cos(a) * 16} y2={Math.sin(a) * 16} className="sunarc-ray" />;
            })}
          </>
        ) : (
          <path d="M3 -9 A10 10 0 1 0 9 5 A7.8 7.8 0 1 1 3 -9 Z" className="sunarc-moon" />
        )}
      </g>
      <text x={CX} y={CY - R * 0.42} className="sunarc-time" textAnchor="middle">
        {fmtTime(time)}
      </text>
    </svg>
  );
}
