// 揭晓 —— 整个体验的「峰值」（峰终定律：人记住的是最高点和结尾）。
// 暮色里：16 张梦想家卡牌展开、收拢（洗牌）→ 一张升起 → 翻面。没有廉价的闪光，只有一圈慢慢亮起来的暖光。

import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollText } from 'lucide-react';
import Pangie from '../shared/Pangie.jsx';
import Emblem from '../shared/Emblem.jsx';
import { DREAMER_BY_CODE, AXES } from '../shared/dreamers.js';
import { AVOID_LABEL } from '../shared/summary.js';
import { CardFrame, CardBack } from './ui.jsx';
import { PAIRS } from './flow.js';
import { sfx } from '../shared/sound.js';
import { isWishMode, tellShell } from '../shared/zen.js';
import { t, L, isEn, guideName } from '../shared/i18n.js';

const WISH = isWishMode();

/** 梦想家卡牌（正面）：压印的罗马数字、金线图腾、四个字母、名字、一句话、配色 */
export function DreamerCard({ profile, big = false }) {
  const d = DREAMER_BY_CODE[profile.code];
  if (!d) return null;
  return (
    <CardFrame num={d.num} foot={isEn() ? d.zh : d.en} className={`dreamer-card ${big ? 'big' : ''}`}>
      <span className="dc-emblem">
        <Emblem name={d.emblem} frame size={big ? 104 : 84} stroke={1.7} />
      </span>
      <div className="dc-code" aria-label={profile.code}>
        {profile.code.split('').map((k, i) => (
          <span key={i}>{k}</span>
        ))}
      </div>
      <h3 className="dc-name">{L({ zh: d.zh, en: d.en })}</h3>
      <p className="dc-tag">{t(d.tagline)}</p>
      <div className="dc-palette">
        {d.palette.map((c) => (
          <i key={c} style={{ background: c }} />
        ))}
      </div>
    </CardFrame>
  );
}

/** 「因为你…」：最多三句，全部来自客人自己的答案（不碰「门铃响了」那题 —— 那是悄悄话） */
export function becauseLines(profile) {
  const out = [];
  // 1) 最能代表这张牌的那条轴上，推得最用力的那一题
  const strongest = [...AXES].sort((a, b) => Math.abs((profile.axes?.[b.id] ?? 50) - 50) - Math.abs((profile.axes?.[a.id] ?? 50) - 50))[0];
  if (strongest) {
    const dir = (profile.axes?.[strongest.id] ?? 50) >= 50 ? 1 : -1;
    let best = null;
    let bestV = 0;
    for (const p of PAIRS) {
      const a = profile.answers?.pairs?.[p.id];
      if (!a) continue;
      const v = (p.fx?.[a.pick]?.[strongest.id] || 0) * dir;
      if (v > bestV) {
        bestV = v;
        best = p[a.pick]?.label;
      }
    }
    if (best) out.push(t('因为你选了「{0}」', [t(best)]));
  }
  // 2) 第一个雷区
  const av = (profile.avoid || [])[0];
  if (av && AVOID_LABEL[av]) out.push(t('因为你不要「{0}」', [t(AVOID_LABEL[av])]));
  // 3) 一句话愿望
  if (profile.wish) out.push(t('因为你说「{0}」', [profile.wish]));
  return out.slice(0, 3);
}

export default function Reveal({ profile, onOpen }) {
  const [phase, setPhase] = useState('reading');
  const d = DREAMER_BY_CODE[profile.code];
  const ctaRef = useRef(null);
  const because = useMemo(() => becauseLines(profile), [profile]);

  useEffect(() => {
    sfx.flip();
    const t1 = setTimeout(() => {
      setPhase('rise');
      sfx.flip();
    }, 2800);
    const t2 = setTimeout(() => {
      setPhase('shown');
      if (!WISH) sfx.chime(); // 许愿模式里外壳会奏揭晓的那一段，不要两段叠在一起
      tellShell('reveal');
      if (navigator.vibrate) navigator.vibrate([20, 30, 20, 30, 80]);
    }, 4100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // 翻面 1.2 秒后，把「打开蓝图」滚进画面（iPad 横屏时它可能在折线以下）
  useEffect(() => {
    if (phase !== 'shown') return undefined;
    const tm = setTimeout(() => {
      const el = ctaRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 12 || r.top < 0) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 1200);
    return () => clearTimeout(tm);
  }, [phase]);

  if (!d) return null;
  const name = L({ zh: d.zh, en: d.en });
  const other = isEn() ? d.zh : d.en;

  return (
    <div className={`step step-reveal phase-${phase}`}>
      {phase === 'reading' && (
        <div className="reading">
          <p className="eyebrow">{t('揭晓')}</p>
          <h2 className="h-title">{t('{0}正在读取你的梦想…', [guideName()])}</h2>
          <div className="deck" aria-hidden="true">
            {[...Array(16)].map((_, i) => (
              <span key={i} className="deck-card" style={{ '--i': i, '--k': i - 7.5 }} />
            ))}
          </div>
          <Pangie mood="mystic" prop="ball" size={140} aura />
        </div>
      )}
      {phase !== 'reading' && (
        <div className="reveal-grid">
          <div className="reveal-card">
            <span className="reveal-bloom" aria-hidden="true" />
            <div className={`flip reveal-flip ${phase === 'shown' ? 'is-flipped' : ''}`}>
              <div className="flip-inner">
                <div className="flip-back">
                  <CardBack className="big" />
                </div>
                <div className="flip-front">
                  <DreamerCard profile={profile} big />
                </div>
              </div>
            </div>
          </div>
          {phase === 'shown' && (
            <div className="reveal-text">
              <p className="eyebrow">{profile.name ? t('{0} 的梦想家卡牌', [profile.name]) : t('你的梦想家卡牌')}</p>
              <h2 className="h-display small">
                <span className="rv-num">{d.num}</span> {name}
              </h2>
              <p className="rv-other" lang={isEn() ? 'zh-Hans' : 'en'}>
                {other}
              </p>
              <p className="lead">{t(d.desc)}</p>
              {because.length > 0 && (
                <ul className="because">
                  {because.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
              <div className="axes-mini">
                {AXES.map((ax) => {
                  const v = profile.axes[ax.id];
                  const left = v >= 50;
                  return (
                    <div key={ax.id} className="axis-mini">
                      <span className="ax-dim">
                        {L({ zh: ax.zh, en: ax.en })}
                        {!isEn() && <i>{ax.en}</i>}
                      </span>
                      <span className={`ax-pole ${left ? 'win' : ''}`}>{L(ax.a)}</span>
                      <span className="axis-bar">
                        <i style={{ left: `${100 - v}%` }} />
                      </span>
                      <span className={`ax-pole r ${!left ? 'win' : ''}`}>{L(ax.b)}</span>
                    </div>
                  );
                })}
              </div>
              <button ref={ctaRef} type="button" className="btn btn-gold big" onClick={onOpen}>
                <ScrollText size={18} strokeWidth={1.8} aria-hidden="true" />
                <span>{t('打开我的梦想家蓝图')}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
