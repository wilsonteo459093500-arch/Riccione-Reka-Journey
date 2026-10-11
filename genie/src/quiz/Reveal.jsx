// 揭晓 —— 整个体验的「峰值」（峰终定律：人记住的是最高点和结尾）。
// 水晶球发光 → 16 张牌洗牌 → 一张牌升起、翻面 → 金色星屑。

import { useEffect, useState } from 'react';
import Pangie from '../shared/Pangie.jsx';
import Emblem from '../shared/Emblem.jsx';
import { DREAMER_BY_CODE, AXES } from '../shared/dreamers.js';
import { GUIDE } from '../shared/config.js';
import { TarotFrame } from './steps.jsx';
import { sfx } from '../shared/sound.js';
import { tellShell } from '../shared/zen.js';

export function DreamerCard({ profile, big = false }) {
  const d = DREAMER_BY_CODE[profile.code];
  return (
    <TarotFrame num={d.num} title={d.en.toUpperCase()} className={`dreamer-card ${big ? 'big' : ''}`}>
      <div className="dc-emblem" style={{ color: '#B98A3B' }}>
        <Emblem name={d.emblem} size={big ? 92 : 70} />
      </div>
      <div className="dc-code">
        {profile.code.split('').map((k, i) => (
          <span key={i}>{k}</span>
        ))}
      </div>
      <h3 className="dc-name">{d.zh}</h3>
      <p className="dc-tag">{d.tagline}</p>
      <div className="dc-palette">
        {d.palette.map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
      </div>
    </TarotFrame>
  );
}

function Sparkles({ n = 28 }) {
  return (
    <div className="sparkles" aria-hidden="true">
      {[...Array(n)].map((_, i) => (
        <i
          key={i}
          style={{
            left: `${50 + (Math.random() - 0.5) * 90}%`,
            top: `${45 + (Math.random() - 0.5) * 70}%`,
            animationDelay: `${Math.random() * 0.8}s`,
            transform: `scale(${0.5 + Math.random()})`,
          }}
        />
      ))}
    </div>
  );
}

export default function Reveal({ profile, onOpen }) {
  const [phase, setPhase] = useState('reading');
  const d = DREAMER_BY_CODE[profile.code];
  useEffect(() => {
    sfx.flip();
    const t1 = setTimeout(() => {
      setPhase('rise');
      sfx.flip();
    }, 2600);
    const t2 = setTimeout(() => {
      setPhase('shown');
      sfx.chime();
      tellShell('reveal');
      if (navigator.vibrate) navigator.vibrate([20, 30, 20, 30, 80]);
    }, 3700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div className={`step step-reveal phase-${phase}`}>
      {phase === 'reading' && (
        <>
          <p className="eyebrow">THE REVEAL</p>
          <h2 className="h-title">{GUIDE.name}正在读取你的梦想…</h2>
          <div className="deck">
            {[...Array(16)].map((_, i) => (
              <span key={i} className="deck-card" style={{ '--i': i }} />
            ))}
          </div>
          <Pangie mood="mystic" prop="ball" size={150} />
        </>
      )}
      {phase !== 'reading' && (
        <>
          <p className="eyebrow">{profile.name ? `${profile.name} 的梦想家牌` : '你的梦想家牌'}</p>
          <div className={`flip reveal-flip ${phase === 'shown' ? 'is-flipped' : ''}`}>
            <div className="flip-inner">
              <div className="flip-back">
                <TarotFrame className="tarot-back big">
                  <div className="back-pattern" />
                </TarotFrame>
              </div>
              <div className="flip-front">
                <DreamerCard profile={profile} big />
              </div>
            </div>
          </div>
          {phase === 'shown' && <Sparkles />}
          {phase === 'shown' && (
            <div className="reveal-text">
              <h2 className="h-display small">
                {d.num} · {d.zh}
                <small>{d.en}</small>
              </h2>
              <p className="lead center">{d.desc}</p>
              <div className="axes-mini">
                {AXES.map((ax) => {
                  const v = profile.axes[ax.id];
                  const left = v >= 50;
                  return (
                    <div key={ax.id} className="axis-mini">
                      <span className={left ? 'win' : ''}>{ax.a.zh}</span>
                      <div className="axis-bar">
                        <i style={{ left: `${100 - v}%` }} />
                      </div>
                      <span className={!left ? 'win' : ''}>{ax.b.zh}</span>
                    </div>
                  );
                })}
              </div>
              <button type="button" className="btn-gold big" onClick={onOpen}>
                打开我的梦想家蓝图 📜
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
