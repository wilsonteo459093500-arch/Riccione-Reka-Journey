// 进度 = 溪上的五块踏脚石（五张牌）。走过的石头是实心的，脚下这块发着金光（外圈是这一章走了多少），
// 前面的是空心的。点 / 悬停一块石头，会浮出章节名。

import { useEffect, useRef, useState } from 'react';
import { CHAPTERS } from './flow.js';
import { t } from '../shared/i18n.js';

// 五块形状不一样的石头（40×28 的框里）
const STONE = [
  'M6 15 C 5 8, 13 4, 21 4.5 C 30 5, 36 9, 35 15.5 C 34 22, 26 24.5, 18 24 C 10 23.5, 7 20.5, 6 15 Z',
  'M5 14 C 6 7, 15 3.5, 23 4 C 31 4.5, 36 10, 35 16 C 34 22.5, 25 25, 17 24.2 C 9 23.5, 4.5 19.5, 5 14 Z',
  'M7 13 C 9 6.5, 17 4, 24 5 C 31 6, 35.5 10.5, 34.5 16.5 C 33.5 22, 27 24.5, 19 24.5 C 11 24.5, 5.5 19.5, 7 13 Z',
  'M5.5 15.5 C 5 9, 12 4.5, 20 4.2 C 28.5 4, 35.5 8, 35 14.5 C 34.5 21, 28 24.6, 19.5 24.4 C 11 24.2, 6 21, 5.5 15.5 Z',
  'M6 14.5 C 6.5 8, 14 4.5, 22 4.6 C 30 4.8, 35 9.5, 34.6 15.6 C 34.2 21.8, 26.5 24.4, 18.5 24.2 C 10.5 24, 5.6 20.5, 6 14.5 Z',
];

export default function Stones({ chapter, sub = 0, done = false }) {
  const idx = done ? CHAPTERS.length : CHAPTERS.findIndex((c) => c.id === chapter);
  const [tip, setTip] = useState(-1);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = (i) => {
    setTip(i);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setTip(-1), 1800);
  };
  return (
    <nav className="stones" aria-label={t('进度')}>
      <svg className="stones-stream" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 22 C 40 14, 70 30, 110 22 S 180 14, 220 22 S 280 30, 300 20" className="stream-a" />
        <path d="M0 24 C 40 17, 70 32, 110 24.5 S 180 17, 220 24.5 S 280 31, 300 22.5" className="stream-b" />
      </svg>
      <ol>
        {CHAPTERS.map((c, i) => {
          const state = i < idx ? 'done' : i === idx ? 'now' : 'next';
          const label = `${c.num} · ${t(c.zh)}`;
          return (
            <li key={c.id} className={`stone is-${state} ${tip === i ? 'show' : ''}`}>
              <button type="button" aria-label={label} aria-current={state === 'now' ? 'step' : undefined} onClick={() => show(i)} onMouseEnter={() => setTip(i)} onMouseLeave={() => setTip(-1)}>
                <svg viewBox="0 0 40 28" width="40" height="28" aria-hidden="true">
                  {state === 'now' && <ellipse cx="20" cy="14.5" rx="19" ry="13.5" className="stone-glow" />}
                  <path d={STONE[i]} className="stone-body" />
                  {state === 'now' && (
                    <path
                      d={STONE[i]}
                      className="stone-ring"
                      pathLength="100"
                      style={{ strokeDasharray: `${Math.max(6, Math.min(100, sub * 100))} 100` }}
                    />
                  )}
                  <path d="M12 9 C 15 7, 20 6.5, 24 7" className="stone-shine" />
                </svg>
              </button>
              <span className="stone-tip" role="tooltip">
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
