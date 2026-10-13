// 进度 = 溪上的五块踏脚石（五张牌）。走过的石头是实心的，脚下这块发着金光（外圈是这一章走了多少），
// 前面的是空心的。点 / 悬停一块石头，会浮出章节名。
//
// 走完一章（动效 SPEC §3f）：这块石头的外圈走满 → 260 ms 后变成苔绿（走过了）→ 一束光沿着溪流走到下一块石头
// （fx.streamLight，820 ms，竖琴的刮奏）→ 下一块亮起来、被「接住」（pulse + 一圈光 + 火花），踏上去的音高 = 第几块（D E F♯ A B）。
// 被选中的东西飞过来时找的是 .stone[data-ch="…"]（moments.js 的 stoneOf）。

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import fx from '../shared/fx.js';
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
  // 走完一章时的过场：{ from, to, phase: 'ring'（外圈走满）| 'travel'（溪光在走） }；null = 照 idx 显示
  const [hop, setHop] = useState(null);
  const prev = useRef(idx);
  const listRef = useRef(null);
  const streamRef = useRef(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  // 前进一章（不是返回、不是跳到揭晓）→ 外圈满 → 苔绿 → 溪光 → 下一块
  useLayoutEffect(() => {
    const from = prev.current;
    prev.current = idx;
    if (from === idx) return undefined;
    if (!(idx === from + 1 && from >= 0 && idx < CHAPTERS.length)) {
      setHop(null);
      return undefined;
    }
    let alive = true;
    setHop({ from, to: idx, phase: 'ring' });
    const cancel = fx.clock.after(260, () => {
      if (!alive) return;
      setHop({ from, to: idx, phase: 'travel' });
      const stones = listRef.current?.querySelectorAll(':scope > .stone');
      const a = stones?.[from];
      const b = stones?.[idx];
      const land = () => {
        if (!alive) return;
        setHop(null);
        const svg = b?.querySelector('svg');
        if (svg) fx.pulse(svg, { sparks: 12, tone: b.closest('.dusk') ? 'dusk' : 'paper' });
        fx.sound('land', idx); // 踏上第 idx + 1 块石头：D E F♯ A B
      };
      if (!streamRef.current || !a || !b) return land();
      fx.streamLight(streamRef.current, { from: a, to: b, duration: 820, onArrive: land });
    });
    return () => {
      alive = false;
      cancel();
    };
  }, [idx]);

  const show = (i) => {
    setTip(i);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setTip(-1), 1800);
  };
  const stateOf = (i) => {
    if (!hop) return i < idx ? 'done' : i === idx ? 'now' : 'next';
    if (hop.phase === 'ring') return i < hop.from ? 'done' : i === hop.from ? 'now' : 'next';
    return i <= hop.from ? 'done' : 'next';
  };
  const ringOf = () => (hop ? 1 : sub);
  return (
    <nav className="stones" aria-label={t('进度')}>
      <svg className="stones-stream" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 22 C 40 14, 70 30, 110 22 S 180 14, 220 22 S 280 30, 300 20" className="stream-a" />
        <path ref={streamRef} d="M0 24 C 40 17, 70 32, 110 24.5 S 180 17, 220 24.5 S 280 31, 300 22.5" className="stream-b" />
      </svg>
      <ol ref={listRef}>
        {CHAPTERS.map((c, i) => {
          const state = stateOf(i);
          const label = `${c.num} · ${t(c.zh)}`;
          return (
            <li key={c.id} className={`stone is-${state} ${tip === i ? 'show' : ''}`} data-ch={c.id}>
              <button
                type="button"
                aria-label={label}
                aria-current={i === idx ? 'step' : undefined}
                onClick={() => show(i)}
                onMouseEnter={() => setTip(i)}
                onMouseLeave={() => setTip(-1)}
              >
                <svg viewBox="0 0 40 28" width="40" height="28" aria-hidden="true">
                  {state === 'now' && <ellipse cx="20" cy="14.5" rx="19" ry="13.5" className="stone-glow" />}
                  <path d={STONE[i]} className="stone-body" />
                  {state === 'now' && (
                    <path
                      d={STONE[i]}
                      className="stone-ring"
                      pathLength="100"
                      style={{ strokeDasharray: `${Math.max(6, Math.min(100, ringOf() * 100))} 100` }}
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
