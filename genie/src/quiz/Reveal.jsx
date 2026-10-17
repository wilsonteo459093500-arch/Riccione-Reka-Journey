// 揭晓 —— 整个体验的「峰值」（峰终定律：人记住的是最高点和结尾）。
// 暮色里：16 张梦想家卡牌展开、收拢（洗牌）→ 一张升起 → 翻面。没有廉价的闪光，只有一圈慢慢亮起来的暖光。
// 动效（动效 SPEC §3h）：洗牌收拢时一道暮色的光扫过牌堆 → 升起 → 弹簧翻面（镜面高光 + 烫金牌边）→ 正面转过来的那一刻
// 牌的四边迸出火花、牌后的暖光亮到 1、全息光慢慢扫过正面（fx.reveal）→ 文字一块块模糊淡入、四条轴的小圆点从中间弹到位 →
// 主按钮被光扫一下、之后每 4.8 秒一下。翻开以后手指在牌上 = 牌跟着倾斜、珠光跟着走；点一下 = 再扫一次全息光。
// 潘吉：洗牌时「让我读一读你的梦想……」，翻开后「就是这一张——你的梦想家卡牌！」，8 秒没人碰再轻轻提醒一句。

import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollText } from 'lucide-react';
import Pangie, { useVoiceLine } from '../shared/Pangie.jsx';
import Emblem from '../shared/Emblem.jsx';
import { DREAMER_BY_CODE, AXES } from '../shared/dreamers.js';
import { AVOID_LABEL } from '../shared/summary.js';
import { CardFrame, CardBack } from './ui.jsx';
import { PAIRS } from './flow.js';
import { sfx } from '../shared/sound.js';
import fx, { useFx, useGleam } from '../shared/fx.js';
import { voice } from '../shared/voice.js';
import { t, L, isEn } from '../shared/i18n.js';
import { phrased, keepWords } from './typo.jsx';
import { cue, settle } from './moments.js';

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
      <p className="dc-tag">{phrased(t(d.tagline), { sentences: false })}</p>
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
  const f = useFx();
  const [phase, setPhase] = useState('reading');
  // 翻面落定后把牌「放平」：不留 3D 图层（Chromium 偶尔会把它的残影留在下一页上）
  const [flipped, setFlipped] = useState(false);
  const [flat, setFlat] = useState(false);
  const [opening, setOpening] = useState(false);
  const d = DREAMER_BY_CODE[profile.code];
  const ctaRef = useRef(null);
  const cardRef = useRef(null);
  const flipRef = useRef(null);
  const innerRef = useRef(null);
  const bloomRef = useRef(null);
  const deckRef = useRef(null);
  const axesRef = useRef(null);
  const because = useMemo(() => becauseLines(profile), [profile]);
  const shown = phase === 'shown';
  // 「就是这一张——」：等揭晓的金铃（音乐的刮奏落在主音上 ≈ 翻开后 0.5 秒）响完、余音散开再开口（音效 SPEC §9：先响时刻，≥ 0.6 秒后潘吉才说）
  useVoiceLine('reveal.shown', { when: shown, delay: 2300 });
  // 「让我读一读你的梦想……」：洗牌一开始说；牌升起来时不打断她（这一页真的走了才停 ——
  // 开发时 StrictMode 假装卸载又马上装回来，那一下不算）
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      setTimeout(() => !live.current && voice.stopIf('reveal.reading'), 0);
    };
  }, []);

  const once = useRef(false);
  useEffect(() => {
    if (once.current) return; // 开发时 StrictMode 会把挂载的 effect 跑两次：这一整段只要一次
    once.current = true;
    // 读懂你：音乐换成《暮色》（许愿模式里告诉外壳）；洗牌的纸声；潘吉开口
    cue('mood', { mood: 'dusk' });
    sfx.flip();
    voice.say('reveal.reading', { delay: 500 });
    // 牌堆收拢的那一下：一道暮色的光扫过
    f.after(2150, () => deckRef.current && fx.scan(deckRef.current, { tone: 'dusk', sound: null, duration: 420 }));
    // 牌升起来：音乐的《星灯》从这里开始（许愿模式里外壳奏这一段；单独打开时自己的音乐）——
    // 铺底在牌升起时涨上来，刮奏的落点正好落在翻面后的那一下爆开（动效 SPEC §1.6：声音 ≙ 动作）
    let rose = false;
    const rise = () => {
      if (rose) return;
      rose = true;
      setPhase((ph) => (ph === 'reading' ? 'rise' : ph));
      cue('reveal');
    };
    let opened = false;
    const show = () => {
      if (opened) return;
      opened = true;
      rise();
      setPhase('shown');
      const inner = innerRef.current;
      settle(
        f,
        inner ? f.flip(inner, { stiffness: 70, damping: 12.5, lift: 0.08, tone: 'dusk' }) : f.wait(0),
        () => {
          setFlipped(true);
          setFlat(true);
        },
        2600
      );
      // 正面转到正对的那一刻：四边迸出火花 + 暖光亮到 1 + 全息光扫过正面 + 揭晓的声音（许愿模式里音乐负责，这里只响全息光）
      const card = cardRef.current;
      if (card) fx.reveal(card, { front: flipRef.current?.querySelector('.flip-front .dcard') || undefined, bloom: bloomRef.current || undefined, delay: 520 });
    };
    f.after(2800, rise);
    f.after(4100, show);
    // 保险用真实时间：很卡的设备上 fx 的时钟会走慢，牌和「打开蓝图」也一定会出来（客人不会卡在洗牌上）。录帧（手动时钟）时不算
    const guard = () => {
      if (!f.alive()) return;
      if (fx.clock.manual) setTimeout(guard, 500);
      else show();
    };
    setTimeout(guard, 6500);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!shown) return undefined;
    // 四条轴的小圆点从中间弹到自己的位置（弹簧 160 / 17，一条一条错开 90 ms）
    if (!fx.motion.reduced) {
      const sp = fx.springEasing({ stiffness: 160, damping: 17 });
      axesRef.current?.querySelectorAll('.axis-bar').forEach((bar, i) => {
        const dot = bar.querySelector('i');
        const w = bar.getBoundingClientRect().width;
        const left = parseFloat(dot?.style.left) || 50;
        if (!dot || !w) return;
        dot.animate([{ translate: `${((50 - left) / 100) * w}px 0` }, { translate: '0 0' }], { duration: sp.duration, easing: sp.easing, delay: 700 + i * 90, fill: 'backwards' });
      });
    }
    // 翻面 1.2 秒后，把「打开蓝图」滚进画面（iPad 横屏时它可能在折线以下）。
    // 手机不自动滚：滚到按钮就会把刚翻开的牌切掉一半（停在一张被顶栏切掉的牌上）——牌完整地留在画面上，
    // 下面露出名字和说明，客人自己往下滑。
    const tm = f.after(1200, () => {
      const el = ctaRef.current;
      if (!el || window.matchMedia?.('(max-width: 560px)').matches) return;
      const r = el.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 12 || r.top < 0) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    // 主按钮：+1.3 秒被光扫一下
    const sc = f.after(1300, () => ctaRef.current && fx.scan(ctaRef.current, { sound: null }));
    // 8 秒没人碰：潘吉轻轻提醒一句（不打断别的话）
    let touched = false;
    const onTouch = () => (touched = true);
    window.addEventListener('pointerdown', onTouch, true);
    const nudge = f.after(8000, () => !touched && voice.say('reveal.nudge', { mode: 'ifIdle' }));
    return () => {
      tm();
      sc();
      nudge();
      window.removeEventListener('pointerdown', onTouch, true);
      voice.stopIf('reveal.nudge');
    };
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  useGleam(ctaRef, flat && !opening, { first: 4800, every: 4800 });

  // 翻开以后：牌跟着手指倾斜（±7°），珠光跟着走；松开弹回去；点一下再扫一次全息光。
  // 只接横着的拖动（pan-y）：手机上从牌上往上滑照样能滚页面。
  useEffect(() => {
    const card = cardRef.current;
    const target = flipRef.current;
    if (!flat || !card || !target) return undefined;
    const front = target.querySelector('.flip-front .dcard');
    const off = fx.tilt(card, { target, sheen: front || true });
    card.style.touchAction = 'pan-y';
    return off;
  }, [flat]);

  // 打开我的梦想家蓝图：按钮被光扫过，一大片晨光拂过，换到蓝图
  const open = (e) => {
    if (opening) return;
    setOpening(true);
    fx.scan(e.currentTarget);
    const w = fx.wipe(null, { tone: 'dawn', duration: 1000 });
    settle(null, w.mid, onOpen, 900);
  };

  if (!d) return null;
  const name = L({ zh: d.zh, en: d.en });
  const other = isEn() ? d.zh : d.en;

  return (
    <div className={`step step-reveal phase-${phase}`}>
      {phase === 'reading' && (
        <div className="reading">
          <p className="eyebrow">{t('揭晓')}</p>
          <h2 className="h-title">
            {t('让我读一读你的梦想')}
            {isEn() ? '…' : '……'}
          </h2>
          <div className="deck" ref={deckRef} aria-hidden="true">
            {[...Array(16)].map((_, i) => (
              <span key={i} className="deck-card" style={{ '--i': i, '--k': i - 7.5 }} />
            ))}
          </div>
          <Pangie mood="mystic" prop="ball" size={140} aura speaker />
        </div>
      )}
      {phase !== 'reading' && (
        <div className="reveal-grid">
          <div className="reveal-card" ref={cardRef}>
            <span className="reveal-bloom" ref={bloomRef} aria-hidden="true" />
            <div ref={flipRef} className={`flip reveal-flip ${flipped ? 'is-flipped' : ''} ${flat ? 'is-flat' : ''}`}>
              <div ref={innerRef} className="flip-inner">
                <div className="flip-back">
                  <CardBack className="big" />
                </div>
                <div className="flip-front">
                  <DreamerCard profile={profile} big />
                </div>
              </div>
            </div>
          </div>
          {shown && (
            <div className="reveal-text">
              {/* 「就是这一张——」是她亲口说的：画面上有一只小小的潘吉在说（嘴跟着声音动），不是一句没有来处的话 */}
              <div className="rv-hello">
                <Pangie mood="happy" prop="none" size={64} float={false} speaker className="rv-pangie" />
                <p className="eyebrow">{profile.name ? t('{0} 的梦想家卡牌', [profile.name]) : t('你的梦想家卡牌')}</p>
              </div>
              <h2 className="h-display small">
                <span className="rv-num">{d.num}</span> {name}
              </h2>
              <p className="rv-other" lang={isEn() ? 'zh-Hans' : 'en'}>
                {other}
              </p>
              {/* 词不拆开：不会断成「包 / 包」「陈 / 列」（英文原样） */}
              <p className="lead">{isEn() ? t(d.desc) : keepWords(t(d.desc))}</p>
              {because.length > 0 && (
                <ul className="because">
                  {because.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              )}
              <div className="axes-mini" ref={axesRef}>
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
              <button ref={ctaRef} type="button" className="btn btn-gold big" onClick={open} disabled={opening} aria-label={t('打开我的梦想家蓝图')}>
                <ScrollText size={18} strokeWidth={1.8} aria-hidden="true" />
                <span className="cta-long">{t('打开我的梦想家蓝图')}</span>
                {/* 英文手机：全名太长、会挤出一行 → 短一点的说法 */}
                {isEn() && <span className="cta-short">{t('打开我的蓝图')}</span>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
