// 太阳弧（日光面板里的主视觉，像「天气」App）：日出在左、正午在顶、日落在右；走过的那一段是金色。
// 拖太阳 = 拖时间（只在日出到日落之间；夜里换成月亮，用下面的滑杆调）。

import { useRef } from 'react';
import { fmtTime } from '../engine/daylight.js';
import { t } from '../../shared/i18n.js';

// 和 engine/daylight.js 同一套：马来西亚约 7:09 日出、19:18 日落
const RISE = 7.15;
const SET = 19.3;
const W = 220;
const H = 104;
const CX = W / 2;
const CY = 80;
const R = 84;

function posOf(h) {
  const k = Math.max(0, Math.min(1, (h - RISE) / (SET - RISE)));
  const a = Math.PI * (1 - k);
  return [CX + Math.cos(a) * R, CY - Math.sin(a) * R];
}

export default function SunArc({ time, onTime, onCommit }) {
  const ref = useRef(null);
  const up = time >= RISE && time <= SET;
  const [x, y] = up ? posOf(time) : [CX, CY - R];
  const toHour = (ev) => {
    const r = ref.current.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W - CX;
    const py = CY - ((ev.clientY - r.top) / r.height) * H;
    const a = Math.atan2(Math.max(0, py), px);
    return RISE + (1 - a / Math.PI) * (SET - RISE);
  };
  const down = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const id = e.pointerId;
    onTime(toHour(e));
    const move = (ev) => ev.pointerId === id && onTime(toHour(ev));
    const end = (ev) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      onCommit?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  // 走过的弧（日出 → 现在）
  const [ex, ey] = posOf(Math.min(Math.max(time, RISE), SET));
  const sweep = up ? `M${CX - R} ${CY} A${R} ${R} 0 0 1 ${ex.toFixed(2)} ${ey.toFixed(2)}` : '';
  return (
    <svg ref={ref} className={`sunarc ${up ? 'is-day' : 'is-night'}`} viewBox={`0 0 ${W} ${H}`} onPointerDown={down} role="slider" aria-label={t('拖太阳调时间')} aria-valuetext={fmtTime(time)}>
      <line x1={6} y1={CY} x2={W - 6} y2={CY} className="sunarc-horizon" />
      <path d={`M${CX - R} ${CY} A${R} ${R} 0 0 1 ${CX + R} ${CY}`} className="sunarc-path" />
      {sweep && <path d={sweep} className="sunarc-done" />}
      <circle cx={CX - R} cy={CY} r="2.5" className="sunarc-end" />
      <circle cx={CX + R} cy={CY} r="2.5" className="sunarc-end" />
      <text x={CX - R} y={CY + 18} className="sunarc-lbl" textAnchor="middle">
        {t('日出')} {fmtTime(RISE)}
      </text>
      <text x={CX + R} y={CY + 18} className="sunarc-lbl" textAnchor="middle">
        {t('日落')} {fmtTime(SET)}
      </text>
      <g transform={`translate(${x.toFixed(2)},${y.toFixed(2)})`} className="sunarc-sun">
        <circle r="18" className="sunarc-hit" />
        {up ? (
          <>
            <circle r="12" className="sunarc-halo" />
            <circle r="6.5" className="sunarc-core" />
          </>
        ) : (
          <path d="M2.6 -7.6 A8 8 0 1 0 7.6 4.2 A6.2 6.2 0 1 1 2.6 -7.6 Z" className="sunarc-moon" />
        )}
      </g>
    </svg>
  );
}
