// 许愿之旅的每一关（UI 组件）。每个组件只管自己的输入，答案通过 set(patch) 写回，next() 前进。
// 文字一律经过 t() / tj()：中文原文就是 key，英文在 src/shared/i18n/en-*.js。
//
// 动效 · 声音 · 潘吉说话（scratchpad/motion/SPEC.md §6.1、sfx/SPEC.md §7.2、voice/SPEC.md §6.2）：
//   每一下触碰：main.jsx 的 fx.install()（按下去 + 指尖的光）+ installSfx()（对的那一声：选中 / 确认 / 返回 / 划掉 …）。
//   选中的被一道光扫过（fx.scan）；没选上的不「滑走」，而是化成金色的细尘（fx.dissolve）；
//   选中的那一张飞进这一章的踏脚石（fx.fly）/ 一粒光飞过去（fx.mote），落下去才换下一题（不是固定的 setTimeout）。
//   潘吉的台词：useVoiceLine（离开画面自动停）；对话泡泡 / 画面上的字 = 她说的那一句（lineText）。
//   三秒的直觉题（PairStep）她一句都不说。

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ArrowRight, Check, X, Sparkle } from 'lucide-react';
import Pangie, { Lamp, useVoiceLine } from '../shared/Pangie.jsx';
import LangToggle from '../shared/LangToggle.jsx';
import fx, { useFx, useGleam } from '../shared/fx.js';
import Vignette, { preloadVignettes } from './Vignette.jsx';
import { ShoeCabinet, BookWall, RatioWall, Wardrobe } from './Cabinet.jsx';
import { CardFrame, CardBack, Segmented, Slider, Odo } from './ui.jsx';
import { Ico } from './icons.jsx';
import { BRAND } from '../shared/config.js';
import { CHAPTERS, PAIRS, LIFE, APPLIANCES, BULKY, WISHES, SPLURGE, NOGO_COLORS, NOGO_FINISHES, ONE_WISH_CHIPS } from './flow.js';
import { storagePlan } from '../shared/profile.js';
import { sfx } from '../shared/sound.js';
import { voice, lineText } from '../shared/voice.js';
import { tellShell } from '../shared/zen.js';
import { t, tj, guideName, isEn } from '../shared/i18n.js';
import { fmt, ftNote } from '../shared/units.js';
import { phrased, segmented, keepHyphens, tjDots } from './typo.jsx';
import { stoneOf, chapterIndex, settle, byDistance, startMusic } from './moments.js';

/** 洗牌（愿望每次进来顺序都不一样：不让「收纳」永远排第一） */
export function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 前进按钮：普通一步用墨色胶囊，仪式时刻用金色。btnRef：主按钮要被光扫（gleam）的时候用 */
function Next({ onClick, children, gold = false, big = false, disabled = false, icon = true, btnRef }) {
  return (
    <button ref={btnRef} type="button" className={`btn ${gold ? 'btn-gold' : 'btn-primary'} ${big ? 'big' : ''}`} onClick={onClick} disabled={disabled}>
      <span>{children}</span>
      {icon && <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />}
    </button>
  );
}

// 断行（不在词的中间换行）：标题按词组 / 句子，正文按词组，「甲 · 乙」「甲 / 乙」只在分隔号后面换行（typo.jsx）
export { phrased };

function Head({ eyebrow, title, lead }) {
  return (
    <header className="q-head">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="h-title">{phrased(title)}</h2>
      {lead && <p className="lead">{phrased(lead, { sentences: false })}</p>}
    </header>
  );
}

/**
 * 「下一步」：按钮被光扫过，一粒光从结果（from：元素，或 (按钮) => 元素）飞进这一章的踏脚石，落下去才换题。
 * 同一题只走一次（连点不会多跳）。
 */
function useAdvance(next, chapter) {
  const f = useFx();
  const busy = useRef(false);
  return (e, from) => {
    if (busy.current) return;
    busy.current = true;
    const btn = e?.currentTarget || null;
    if (btn) fx.scan(btn);
    const src = (typeof from === 'function' ? from(btn) : from) || btn;
    const stone = stoneOf(chapter);
    settle(f, stone && src ? f.mote(src, stone, { delay: 120 }) : f.wait(260), next, 1800);
  };
}

/** 单选题：选中的被光扫过，其余的从离它最远的一侧化成金尘（近的先走），一粒光飞进踏脚石，落下去才换题 */
function useSinglePick(next, chapter) {
  const f = useFx();
  const optsRef = useRef(null);
  const done = useRef(false);
  const pick = (e, apply) => {
    if (done.current) return;
    done.current = true;
    apply();
    const me = e?.currentTarget;
    if (!me || !optsRef.current) return settle(f, f.wait(380), next);
    fx.scan(me);
    const others = byDistance([...optsRef.current.children].filter((s) => s !== me), me);
    others.forEach((s, i) => fx.dissolve(s, { delay: 120 + Math.min(i, 9) * 40, duration: 520, origin: { awayFrom: me }, from: me }));
    const stone = stoneOf(chapter);
    settle(f, stone ? f.mote(me, stone, { delay: 220 }) : f.wait(600), next, 2000);
  };
  return { optsRef, pick };
}

// ───────────────────────── 开场 ─────────────────────────

export function Welcome({ answers, set, next }) {
  const f = useFx();
  const coverRef = useRef(null);
  const goRef = useRef(null);
  const [leaving, setLeaving] = useState(false);
  // 唯一的金色主按钮：每 5 秒被光轻轻扫一下
  useGleam(goRef, !leaving, { first: 1600, every: 5200 });
  const players = [
    { v: 'solo', label: t('我自己'), icon: <Ico set="players" v="solo" size={17} /> },
    { v: 'couple', label: t('我们俩'), icon: <Ico set="players" v="couple" size={17} /> },
    { v: 'family', label: t('一家大小'), icon: <Ico set="players" v="family" size={17} /> },
  ];
  // 封面上的第一下触碰（不是「开始许愿」）：iPad 在点击里才肯开口 → 解锁，潘吉打招呼（一位客人一次）
  const greet = (e) => {
    if (e.target?.closest?.('.cover-go')) return;
    voice.unlock();
    voice.say('welcome.hello', { mode: 'queue' });
  };
  const go = () => {
    if (leaving) return;
    set({ name: (answers.name || '').trim() });
    startMusic('dusk'); // 单独打开：音乐在这一下里开（下一页是暮色里的神灯）
    setLeaving(true);
    fx.scan(goRef.current);
    // 封面从下往上化成金色的雾（金尘离开按钮往上飘），暮色接上来
    const p = coverRef.current ? f.dissolve(coverRef.current, { origin: 'bottom', from: goRef.current, duration: 700, delay: 60, dust: 1.2, tone: 'photo', hide: false }) : f.wait(0);
    settle(f, p, next, 1600);
  };
  return (
    <div className="step step-welcome">
      <div className="cover" ref={coverRef} onClickCapture={greet}>
        {/* 手机：语言放在封面右上角（省下一整行，「开始许愿」不用往下滑） */}
        <LangToggle compact className="cover-lang" />
        <div className="cover-intro">
          <div className="cover-mark">
            <b>{BRAND.app}</b>
            <span>{BRAND.by}</span>
          </div>
          <div className="cover-hero fx-blur-in" style={{ '--fx-delay': '150ms', '--fx-dur': '600ms' }}>
            <Pangie mood="happy" size={168} speaker />
          </div>
          <p className="eyebrow">{t('许愿之旅')}</p>
          <h1 className="h-display">{t('嗨，我是{0}', [guideName()])}</h1>
          <p className="cover-sub">{t('住在神灯里的熊猫')}</p>
          <p className="lead">{phrased(t('接下来几分钟，我会用五张牌，读懂你心里的那个家。不用懂设计，也不用想太久 —— 跟着第一感觉走就好。'), { sentences: false })}</p>
        </div>

        <div className="cover-act">
          <div className="cover-form">
            <div className="field field-lang">
              <span className="field-label">{t('语言 · Language')}</span>
              <LangToggle className="is-big" />
            </div>
            <label className="field">
              <span className="field-label">{t('怎么称呼你？')}</span>
              <input
                className="text-in"
                value={answers.name || ''}
                onChange={(e) => set({ name: e.target.value })}
                placeholder={t('例：Peggy / 陈小姐 / Peggy & Ken')}
                maxLength={30}
                autoComplete="off"
                enterKeyHint="go"
              />
            </label>
            <div className="field">
              <span className="field-label">{t('今天谁来许愿？')}</span>
              <Segmented options={players} value={answers.players} label={t('今天谁来许愿？')} onChange={(v) => set({ players: v })} />
            </div>
          </div>

          <button ref={goRef} type="button" className="btn btn-gold big cover-go" onClick={go}>
            <Sparkle size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>{t('开始许愿')}</span>
          </button>
          <p className="fine">{segmented(t('大约 6–8 分钟 · 5 张牌 · 结束时会得到你的「梦想家蓝图」'))}</p>
        </div>
      </div>
    </div>
  );
}

/** 擦亮神灯：手指在神灯上来回擦（或按住），进度满了潘吉就出来。仪式感 = 承诺的开始。 */
export function LampRub({ next, name }) {
  const f = useFx();
  const [p, setP] = useState(0);
  const [done, setDone] = useState(false);
  const [hint, setHint] = useState(false);
  const last = useRef(null);
  const holding = useRef(null);
  const lastSpark = useRef(0);
  const progress = useRef(0);
  const doneRef = useRef(false);
  const touchRef = useRef(null);
  useEffect(() => () => clearInterval(holding.current), []);
  // 神灯从金尘里聚起来（暮色）。once：开发时 StrictMode 会把挂载的 effect 跑两次，动效只要一次
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    if (touchRef.current) fx.condense(touchRef.current, { origin: 'bottom', duration: 700, delay: 160, tone: 'dusk', dust: 1 });
  }, []);
  // 潘吉在神灯里说话；9 秒还没开始擦 → 轻轻提醒一句（不打断别的话）；擦满了她出来
  useVoiceLine('lamp.rub', { delay: 900 });
  useVoiceLine('lamp.hint', { when: hint, mode: 'ifIdle' });
  useVoiceLine('lamp.done', { when: done, delay: 650 });
  const started = p > 0;
  useEffect(() => {
    if (started || done) return undefined;
    const id = setTimeout(() => setHint(true), 9000);
    return () => clearTimeout(id);
  }, [started, done]);

  const bump = (amt, speed = 0.35) => {
    if (doneRef.current) return;
    progress.current = Math.min(1, progress.current + amt);
    setP(progress.current);
    if (progress.current >= 1) {
      doneRef.current = true;
      clearInterval(holding.current);
      setDone(true);
      sfx.rubEnd?.();
      sfx.summon();
      fx.haptic('summon');
      // 召唤：神灯上方迸出一圈暮色里的火花 + 一圈光，潘吉从光里出来
      const svg = touchRef.current?.querySelector('svg');
      if (svg) {
        const r = svg.getBoundingClientRect();
        fx.burst(r.left + r.width * 0.5, r.top + r.height * 0.3, { count: 120, tone: 'dusk', stars: 0.2, speed: [50, 200] });
      }
      f.after(2100, next);
      return;
    }
    // 摩擦声跟着手指（越快越亮），五声音阶跟着进度往上；停手 0.26 秒自己收
    sfx.rub({ progress: progress.current, speed });
  };

  const onDown = (e) => {
    if (done) return;
    last.current = { x: e.clientX, y: e.clientY };
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* 自动化测试的合成指针没有真的 pointerId：真手指永远不会到这里 */
    }
    clearInterval(holding.current);
    holding.current = setInterval(() => bump(0.012), 50); // 按住也会慢慢满
  };
  const onMove = (e) => {
    if (!last.current || done) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    const d = Math.hypot(dx, dy);
    bump(Math.min(0.04, d / 900), Math.min(1, d / 26));
    // 指尖冒一两粒暮色的火花（一秒最多 40 粒）
    const now = performance.now();
    if (d > 2 && now - lastSpark.current > 50) {
      lastSpark.current = now;
      const n = 1 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) fx.spark(e.clientX + (Math.random() - 0.5) * 10, e.clientY + (Math.random() - 0.5) * 10, { tone: 'dusk', vy: -10 - Math.random() * 40 });
    }
  };
  const onUp = () => {
    last.current = null;
    clearInterval(holding.current);
  };

  return (
    <div className="step step-lamp">
      <Head eyebrow={t('神灯')} title={name ? t('{0}，擦亮神灯', [name]) : t('擦亮神灯')} lead={t('用手指在神灯上来回擦一擦（按住也可以），把{0}叫出来。', [guideName()])} />
      <div className={`lamp-stage ${done ? 'is-done' : ''}`} style={{ '--p': p }}>
        <div className="lamp-mist" />
        <div className={`lamp-genie ${done ? 'out' : ''}`}>
          <Pangie mood="wow" size={176} aura speaker />
        </div>
        <svg className="lamp-ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="47" />
          <circle cx="50" cy="50" r="47" className="fill" pathLength="100" style={{ strokeDashoffset: 100 * (1 - p) }} />
          {p > 0 && p < 1 && (
            <g className="lamp-head" style={{ transform: `rotate(${(p * 360).toFixed(2)}deg)` }}>
              <circle cx="97" cy="50" r="1.6" />
            </g>
          )}
        </svg>
        <div
          ref={touchRef}
          className="lamp-touch"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
          role="button"
          aria-label={t('擦亮神灯')}
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && bump(0.2, 0.6)}
        >
          <Lamp size={280} glow={p} smoke="glow" className={p > 0 && !done ? 'lamp-shake' : ''} />
        </div>
      </div>
      <p className="lamp-status" aria-live="polite">
        {done ? t('{0}来啦！', [guideName()]) : p > 0 ? `${Math.round(p * 100)}%` : t('轻轻擦一擦')}
      </p>
    </div>
  );
}

// ───────────────────────── 章节牌 ─────────────────────────

export function Interlude({ chapter, next }) {
  const f = useFx();
  const ch = CHAPTERS.find((c) => c.id === chapter);
  const [flipped, setFlipped] = useState(false);
  const [ready, setReady] = useState(false);
  // 翻面落定后把牌「放平」（不再是 3D 图层）：Chromium 有时会把翻牌的 3D 图层残影留在下一题的画面上
  const [flat, setFlat] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const armed = useRef(false);
  const flipRef = useRef(null);
  const innerRef = useRef(null);
  const ctaRef = useRef(null);
  const hintRef = useRef(null);
  const actRef = useRef(null);
  // 潘吉念这张牌（离开这张牌就停：她绝不会在三秒的直觉题上说话）
  useVoiceLine(`ch.${chapter}`, { delay: 1150 });
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return; // 开发时 StrictMode 会把挂载的 effect 跑两次：翻牌只要一次
    once.current = true;
    // 牌背发下来（弹簧 180 / 18），420 ms 后翻面：弹簧角度 + 镜面高光 + 烫金牌边（fx.flip）
    const el = flipRef.current;
    if (el?.animate && !fx.motion.reduced) {
      const sp = fx.springEasing({ stiffness: 180, damping: 18 });
      el.animate([{ transform: 'translateY(60px) rotate(-4deg) scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: sp.duration, easing: sp.easing, fill: 'backwards' });
    }
    // 翻完才能点：防止上一页的连点直接跳过
    settle(
      f,
      f.flip(innerRef.current, { tone: 'dusk', delay: 420 }),
      () => {
        setFlipped(true);
        setFlat(true);
        setReady(true);
      },
      2400
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 主按钮亮起来的那一下被光扫过，之后每 4.2 秒轻轻扫一下
  useEffect(() => {
    if (ready && ctaRef.current) fx.scan(ctaRef.current, { sound: null });
  }, [ready]);
  useGleam(ctaRef, ready && !leaving, { first: 2600, every: 4200 });
  const prop = chapter === 'treasure' ? 'magnifier' : chapter === 'wishes' ? 'ball' : 'cards';
  useEffect(() => {
    if (chapter === 'intuition') preloadVignettes(PAIRS[0]);
  }, [chapter]);
  // 翻开这一张：牌飞进这一章的踏脚石（化成一粒光被接住），一大片晨光拂过，换到这一章的第一题
  const open = () => {
    if (!ready || leaving) return;
    setLeaving(true);
    fx.scan(ctaRef.current);
    // 提示和按钮先退下（视线交给飞走的牌）
    hintRef.current?.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: fx.EASE.in.css, fill: 'forwards' });
    actRef.current?.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 260, delay: 120, easing: fx.EASE.in.css, fill: 'forwards' });
    const stone = stoneOf(chapter);
    const fly = stone && flipRef.current ? f.fly(flipRef.current, stone, { delay: 220, tone: 'dusk', arc: 0.22, tilt: 4, landNote: chapterIndex(chapter) }) : f.wait(300);
    settle(
      f,
      fly,
      () => {
        const w = fx.wipe(null, { tone: 'dawn', duration: 1000 });
        settle(null, w.mid, next, 900);
      },
      2400
    );
  };
  return (
    <div className={`step step-interlude ${leaving ? 'is-leaving' : ''}`}>
      <div ref={flipRef} className={`flip ${flipped ? 'is-flipped' : ''} ${flat ? 'is-flat' : ''}`}>
        <div ref={innerRef} className="flip-inner">
          <div className="flip-back">
            <CardBack />
          </div>
          <div className="flip-front">
            <CardFrame num={ch.num} foot={isEn() ? ch.zh : ch.en} className="chapter-card">
              <h2 className="chapter-name">{phrased(t(ch.zh))}</h2>
              <Pangie mood={ch.mode === 'slow' ? 'think' : 'mystic'} prop={prop} size={132} float={false} speaker />
            </CardFrame>
          </div>
        </div>
      </div>
      <p ref={hintRef} className={`lead center interlude-hint ${ready ? 'fx-blur-in' : 'is-waiting'}`} style={{ '--fx-delay': '120ms' }}>
        {t(ch.hint)}
      </p>
      <div
        ref={actRef}
        className="q-actions"
        onPointerDown={() => (armed.current = true)}
        onClickCapture={(e) => {
          // 擦神灯时按着的手指 / 鼠标在这里放开，会「点」到这个按钮：只认在按钮上按下去的那一下（键盘的 Enter 也算）
          if (!armed.current && e.detail !== 0) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <Next gold onClick={open} disabled={!ready} btnRef={ctaRef}>
          {t('翻开这一张')}
        </Next>
      </div>
    </div>
  );
}

// ───────────────────────── I · 直觉 ─────────────────────────

const PAIR_REACT = {
  room: { a: '暖光派！☀️', b: '清爽派！🌊' },
  wall: { a: '少即是多 🤍', b: '越丰富越有你 🖼️' },
  touch: { a: '自然的手感 🌾', b: '精致的触感 💎' },
  guest: { a: '收纳控，潘吉懂 📦', b: '你的收藏值得被看见 ✨' },
  palette: { a: '大地色，有温度 🍂', b: '海风色，好清爽 🌊' },
  sofa: { a: '圆圆的最可爱 ☁️', b: '利落有型 🖤' },
  night: { a: '亮亮的才安心 💡', b: '氛围感拉满 🕯️' },
  floor: { a: '木头的温度 🪵', b: '石头的清凉 🪨' },
  kitchen: { a: '干干净净 ✨', b: '烟火气 🍳' },
  table: { a: '原木派 🌳', b: '大理石派 🤍' },
  shelf: { a: '留白的美 🤍', b: '故事满满 📚' },
  weekend: { a: '热闹最好 🥳', b: '独处最好 🍵' },
};

/**
 * 二选一（3 秒）。选中：被光扫过；另一张从远离赢家的一侧化成金尘；赢家抬起、沿弧线飞进第一块踏脚石，
 * 落下去才换下一题（onDone）。答案在按下去的那一刻就记下（onPick：反应时间照旧从卡片出现算）。
 */
export function PairStep({ pair, onPick, onDone, index, total, timed = true }) {
  const f = useFx();
  // 左右随机：不让「a 永远在左边」替客人做选择（左撇子 / 习惯点左边的人会被带偏）
  const order = useMemo(() => (Math.random() < 0.5 ? ['a', 'b'] : ['b', 'a']), [pair.id]);
  const [picked, setPicked] = useState(null);
  const cards = useRef({});
  const mountAt = useRef(performance.now());
  // 画面淡入约 0.45 秒：从卡片看得见才开始计时
  const t0 = useRef(performance.now() + 450);
  // 下一题的两张图先拿下来，换题时不闪；两张牌的「化成金尘」帧图先做好（真的选的时候不用等）
  useEffect(() => {
    const id = setTimeout(() => preloadVignettes(PAIRS[index + 1]), 600);
    const prep = fx.clock.after(320, () => {
      const { a, b } = cards.current;
      if (a && b) {
        fx.prepare(a, { origin: { awayFrom: b } });
        fx.prepare(b, { origin: { awayFrom: a } });
      }
    });
    return () => {
      clearTimeout(id);
      prep();
    };
  }, [index]);
  const pick = (side) => {
    if (picked) return;
    const now = performance.now();
    if (now - mountAt.current < 250) return; // 上一题的连点不算
    const ms = Math.max(0, Math.round(now - t0.current));
    setPicked(side);
    onPick(side, ms, PAIR_REACT[pair.id]?.[side], order[0]);
    const win = cards.current[side];
    const lose = cards.current[side === 'a' ? 'b' : 'a'];
    if (!win) return settle(f, f.wait(650), onDone);
    fx.scan(win, { delay: 30 });
    if (lose) fx.dissolve(lose, { delay: 120, origin: { awayFrom: win }, from: win, duration: 640, tone: 'photo' });
    const stone = stoneOf('intuition');
    settle(f, stone ? f.fly(win, stone, { delay: 300, landNote: 0 }) : f.wait(650), onDone, 2400);
  };
  return (
    <div className={`step step-pair ${picked ? 'is-picked' : ''}`}>
      <Head eyebrow={t('直觉之牌 · {0} / {1}', [index + 1, total])} title={t(pair.q)} />
      {timed && (
        <div className="breath" key={pair.id} aria-hidden="true">
          <i />
        </div>
      )}
      <div className="pair">
        {order.map((side) => (
          <button
            key={side}
            ref={(el) => (cards.current[side] = el)}
            type="button"
            className={`pair-card ${picked === side ? 'is-picked' : ''}`}
            onClick={() => pick(side)}
            aria-label={t(pair[side].label)}
          >
            <span className="pair-art">
              <Vignette visual={pair[side].visual} id={`${pair.id}-${side}`} />
            </span>
            <span className="pair-label">{t(pair[side].label)}</span>
            <span className="pair-check" aria-hidden="true">
              <Check size={16} strokeWidth={2.4} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── II · 生活 ─────────────────────────

function Opt({ on, onClick, set, v, label, sub, small = false, x = false }) {
  return (
    <button type="button" className={`opt ${small ? 'small' : ''} ${on ? 'on' : ''} ${x ? 'is-x' : ''}`} onClick={onClick} aria-pressed={on}>
      <span className="opt-icon">
        <Ico set={set} v={v} size={small ? 22 : 26} />
      </span>
      <span className="opt-text">
        <span className="opt-label">{segmented(label, '/')}</span>
        {sub && <span className="opt-sub">{sub}</span>}
      </span>
      <span className="opt-tick" aria-hidden="true">
        {x ? <X size={14} strokeWidth={2.6} /> : <Check size={14} strokeWidth={2.6} />}
      </span>
    </button>
  );
}

export function LifeStep({ item, value, onChange, next, index, total }) {
  const f = useFx();
  const multi = !!item.multi;
  const sel = multi ? new Set(value || []) : value;
  const { optsRef, pick } = useSinglePick(next, 'life');
  const committed = useRef(false);
  const choose = (v, e) => {
    if (multi) {
      if (committed.current) return;
      const s = new Set(sel);
      const adding = !s.has(v);
      adding ? s.add(v) : s.delete(v);
      onChange([...s]);
      // 打勾的那一下被光扫过；取消就只是勾收起来（可以反悔，不化成金尘）
      if (adding && e?.currentTarget) fx.scan(e.currentTarget, { duration: 280 });
    } else pick(e, () => onChange(v));
  };
  // 多选题「就是这些」：选中的各送一粒光进踏脚石，没选的化成金尘
  const commit = (e) => {
    if (committed.current) return;
    committed.current = true;
    const btn = e.currentTarget;
    fx.scan(btn);
    const tiles = [...(optsRef.current?.children || [])];
    const on = tiles.filter((x) => x.classList.contains('on'));
    const off = byDistance(
      tiles.filter((x) => !x.classList.contains('on')),
      btn
    );
    off.forEach((x, i) => fx.dissolve(x, { delay: 100 + Math.min(i, 12) * 30, duration: 480, origin: { awayFrom: btn }, from: btn }));
    const stone = stoneOf('life');
    const motes = stone ? on.slice(0, 6).map((x, i) => f.mote(x, stone, { delay: 160 + i * 60 })) : [];
    settle(f, Promise.all([f.wait(off.length ? 760 : 420), ...motes]), next, 2400);
  };
  return (
    <div className="step step-life">
      <Head eyebrow={t('生活之牌 · {0} / {1}', [index + 1, total])} title={t(item.q)} lead={item.sub ? t(item.sub) : null} />
      {/* 单选题：按已选的那个 = 轻触，换一个 = 选中（音效 SPEC §7.2） */}
      <div ref={optsRef} className={`opts ${item.options.length > 6 ? 'opts-many' : ''}`} data-sfx={multi ? undefined : 'radio'}>
        {item.options.map((o) => (
          <Opt
            key={o.v}
            set={item.id}
            v={o.v}
            on={multi ? sel.has(o.v) : sel === o.v}
            onClick={(e) => choose(o.v, e)}
            label={t(o.label)}
            sub={o.sub ? t(o.sub) : null}
            small={item.options.length > 6}
          />
        ))}
      </div>
      {multi && (
        <div className="q-actions">
          <Next onClick={commit}>{sel.size ? tj('就是这些（{0}）', [<Odo key="n" value={sel.size} />]) : t('都没有')}</Next>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── III · 宝藏（慢想） ─────────────────────────

const touch = (answers, ...keys) => ({ touched: { ...(answers.touched || {}), ...Object.fromEntries(keys.map((k) => [k, true])) } });
/** 「下一步」的光点从这一题的结果（.calc）飞出去 */
const calcOf = (btn) => btn?.closest('.step')?.querySelector('.calc') || btn;
/** 算出来的毫米数：机械里程表一样滚过去，停下来响一声「数好了」 */
const mmOdo = (mm) => <Odo value={mm} format={fmt} settle={600} />;

function Calc({ children, mm }) {
  return (
    <p className="calc">
      <span>{children}</span>
      {mm ? <em>{ftNote(mm)}</em> : null}
    </p>
  );
}

/** 鞋子数量 → 鞋柜宽度，画出来 */
export function ShoesStep({ answers, set, next }) {
  const plan = storagePlan({ shoes: answers.shoes });
  const cols = Math.max(2, Math.round(plan.shoeCabinetMM / 300));
  const advance = useAdvance(next, 'treasure');
  return (
    <div className="step step-treasure">
      <Head eyebrow={t('宝藏之牌 · {0} / 6', [1])} title={t('全家大概有几双鞋？')} lead={t('连拖鞋、运动鞋、高跟鞋一起数。')} />
      <div className="viz viz-cabinet">
        <ShoeCabinet cols={cols} shoes={answers.shoes} shelves={7} />
      </div>
      <Slider min={0} max={150} step={5} value={answers.shoes} label={t('全家大概有几双鞋？')} onChange={(v) => set({ shoes: v, ...touch(answers, 'shoes') })} unit={t('双')} />
      <Calc mm={plan.shoeCabinetMM}>{tjDots('鞋柜 {0} 宽（通高 2100 · 深 350）', [<b key="b">{mmOdo(plan.shoeCabinetMM)} mm</b>])}</Calc>
      <div className="q-actions">
        <Next onClick={(e) => advance(e, calcOf)}>{t('数好了')}</Next>
      </div>
    </div>
  );
}

export function WardrobeStep({ answers, set, next }) {
  const plan = storagePlan({ wardrobeDoors: answers.wardrobeDoors, wardrobeFit: answers.wardrobeFit, longHang: answers.longHang });
  const doors = answers.wardrobeDoors;
  const targetDoors = Math.max(doors, Math.round(plan.wardrobeMM / 450));
  const advance = useAdvance(next, 'treasure');
  // 第一次画的时候不聚；之后多出来的门 / 虚线框才从金尘里聚起来
  const live = useRef(false);
  useEffect(() => {
    live.current = true;
  }, []);
  // 单选标签：按下去的那一点是新颜色铺开的圆心（--tx / --ty）
  const chip = (field, v, label) => (
    <button
      key={String(v)}
      type="button"
      className={`chip ${answers[field] === v ? 'on' : ''}`}
      aria-pressed={answers[field] === v}
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty('--tx', `${(((e.clientX - r.left) / (r.width || 1)) * 100).toFixed(1)}%`);
        e.currentTarget.style.setProperty('--ty', `${(((e.clientY - r.top) / (r.height || 1)) * 100).toFixed(1)}%`);
      }}
      onClick={() => set({ [field]: v, ...touch(answers, field) })}
    >
      {label}
    </button>
  );
  return (
    <div className="step step-treasure">
      <Head eyebrow={t('宝藏之牌 · {0} / 6', [2])} title={t('主卧现在的衣柜，大概几门？')} lead={t('一扇门约 450mm 宽。没有衣柜的话，想想你的衣服大概能塞满几门。')} />
      <div className="viz viz-wardrobe">
        <Wardrobe have={doors} target={targetDoors} live={live.current} />
      </div>
      <div className="chips center ink-chips">{[2, 3, 4, 5, 6, 8].map((n) => chip('wardrobeDoors', n, n === 8 ? t('6 门以上') : t('{0} 门', [n])))}</div>
      <div className="field center">
        <span className="field-label">{t('现在够用吗？')}</span>
        <div className="chips center ink-chips">
          {[
            ['roomy', '还有空位'],
            ['ok', '刚刚好'],
            ['full', '挤爆了'],
            ['double', '要两倍'],
          ].map(([v, l]) => chip('wardrobeFit', v, t(l)))}
        </div>
      </div>
      <div className="field center">
        <span className="field-label">{t('长衣服（大衣、长裙、礼服）')}</span>
        <div className="chips center ink-chips">
          {[
            ['few', '很少'],
            ['some', '一些'],
            ['many', '很多'],
          ].map(([v, l]) => chip('longHang', v, t(l)))}
        </div>
      </div>
      <Calc mm={plan.wardrobeMM}>
        {tjDots('目标衣柜 {0}（长挂 {1} · 短挂 {2} · 叠放 {3}）', [<b key="b">{mmOdo(plan.wardrobeMM)} mm</b>, fmt(plan.longHangMM), fmt(plan.shortHangMM), fmt(plan.foldMM)])}
      </Calc>
      <div className="q-actions">
        <Next onClick={(e) => advance(e, calcOf)}>{t('下一个宝藏')}</Next>
      </div>
    </div>
  );
}

export function BooksStep({ answers, set, next }) {
  const n = answers.books;
  const advance = useAdvance(next, 'treasure');
  const vizRef = useRef(null);
  const prevN = useRef(n);
  const lastScan = useRef(0);
  // 多摆上一层书：书墙被一道很淡的光扫过（安静的：滑杆自己每一格就有声音）
  useEffect(() => {
    const was = prevN.current;
    prevN.current = n;
    const now = performance.now();
    if (n > was && n <= 15 && now - lastScan.current > 520) {
      lastScan.current = now;
      const cab = vizRef.current?.querySelector('.cab');
      if (cab) fx.scan(cab, { sound: null, duration: 380 });
    }
  }, [n]);
  return (
    <div className="step step-treasure">
      <Head eyebrow={t('宝藏之牌 · {0} / 6', [3])} title={t('书和收藏品，大概能摆满几层书架？')} lead={t('一层约 800mm 宽。漫画、唱片、模型、酒，都算。')} />
      <div className="viz viz-books" ref={vizRef}>
        <BookWall n={n} />
        {n > 15 && <span className="viz-more fx-pop-in">{tj('+{0} 层', [<Odo key="n" value={n - 15} />])}</span>}
      </div>
      <Slider min={0} max={30} value={n} label={t('书和收藏品，大概能摆满几层书架？')} onChange={(v) => set({ books: v, ...touch(answers, 'books') })} unit={t('层')} />
      <Calc mm={n * 800}>{tj('书墙 {0} 长的层板', [<b key="b">{mmOdo(n * 800)} mm</b>])}</Calc>
      <div className="q-actions">
        <Next onClick={(e) => advance(e, calcOf)}>{t('继续')}</Next>
      </div>
    </div>
  );
}

function ChipGrid({ items, set: iconSet, value, onChange }) {
  const sel = new Set(value || []);
  return (
    <div className="opts opts-many">
      {items.map((o) => (
        <Opt
          key={o.v}
          small
          set={iconSet}
          v={o.v}
          on={sel.has(o.v)}
          label={t(o.label)}
          onClick={(e) => {
            const s = new Set(sel);
            const adding = !s.has(o.v);
            adding ? s.add(o.v) : s.delete(o.v);
            onChange([...s]);
            if (adding && e.currentTarget) fx.scan(e.currentTarget, { duration: 280 });
          }}
        />
      ))}
    </div>
  );
}

export function AppliancesStep({ answers, set, next }) {
  const plan = storagePlan({ appliances: answers.appliances }, APPLIANCES);
  const advance = useAdvance(next, 'treasure');
  return (
    <div className="step step-treasure">
      <Head eyebrow={t('宝藏之牌 · {0} / 6', [4])} title={t('厨房里有哪些小家电？')} lead={t('点一点你有的（或打算买的）。')} />
      <ChipGrid items={APPLIANCES} set="appliances" value={answers.appliances} onChange={(v) => set({ appliances: v })} />
      {plan.applianceCount ? (
        <Calc mm={plan.counterMM}>
          {tj('台面家电区 ≈ {0}', [<b key="b">{mmOdo(plan.counterMM)} mm</b>])}
          {/* 英文的「built-in」不从连字号断开 */}
          {plan.tallUnits ? keepHyphens(` · ${t('嵌入式 {0} 台', [plan.tallUnits])}${plan.applianceTallCabinet ? t('（建议一组电器高柜）') : ''}`) : ''}
        </Calc>
      ) : (
        <p className="calc">{t('一样都没有？那台面可以很清爽')}</p>
      )}
      <div className="q-actions">
        <Next onClick={(e) => advance(e, calcOf)}>{t('继续')}</Next>
      </div>
    </div>
  );
}

export function BulkyStep({ answers, set, next }) {
  const n = (answers.bulky || []).length;
  const advance = useAdvance(next, 'treasure');
  return (
    <div className="step step-treasure">
      <Head eyebrow={t('宝藏之牌 · {0} / 6', [5])} title={t('这些「大家伙」，你家有哪些？')} lead={t('它们最常被忘记，也最常让家变乱。')} />
      <ChipGrid items={BULKY} set="bulky" value={answers.bulky} onChange={(v) => set({ bulky: v })} />
      {/* 英文的「600-deep」「full-height」不从连字号断开 */}
      <p className="calc">{keepHyphens(n >= 4 ? t('大家伙不少 —— 潘吉建议留一间储物间，或一组 600 深的通高柜。') : n ? t('记下了，会帮它们找好位置。') : t('很清爽！'))}</p>
      <div className="q-actions">
        <Next onClick={(e) => advance(e, calcOf)}>{t('继续')}</Next>
      </div>
    </div>
  );
}

/** 藏 vs 展：拖动滑杆，柜墙上的门一扇扇转开变成开放格 —— 直接操作，马上看到 */
export function RatioStep({ answers, set, next }) {
  const r = answers.ratio;
  const open = Math.round((r / 100) * 12);
  const order = [5, 6, 1, 2, 9, 10, 4, 7, 0, 3, 8, 11];
  const openSet = useMemo(() => new Set(order.slice(0, open)), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const advance = useAdvance(next, 'treasure');
  return (
    <div className="step step-treasure">
      <Head eyebrow={t('宝藏之牌 · {0} / 6', [6])} title={t('家里「看得见」的东西，要占多少？')} lead={t('往左：全部藏起来；往右：大方展示。')} />
      <div className="viz viz-ratio">
        <RatioWall open={openSet} />
      </div>
      <Slider min={0} max={100} step={5} value={r} label={t('家里「看得见」的东西，要占多少？')} onChange={(v) => set({ ratio: v, ratioTouched: true })} unit={t('% 看得见')} />
      <p className="calc">
        <span>{tj('藏 {0} : 展 {1}', [<b key="h"><Odo value={100 - r} /></b>, <b key="d"><Odo value={r} /></b>])}</span>
      </p>
      <div className="q-actions">
        <Next onClick={(e) => advance(e, calcOf)}>{t('宝藏清点完毕')}</Next>
      </div>
    </div>
  );
}

// ───────────────────────── IV · 三个愿望 ─────────────────────────

/**
 * 三个愿望：选一个 = 勾弹出来 + 一道光扫过 + 一粒光飞进第 k 盏神灯（落下去灯才亮，700 ms）；再按 = 取消（灯暗下去）；
 * 第四个 = 轻轻摇一下 + 潘吉「只能三个哦」。许愿：没选的九个从按钮这一侧开始化成金尘，三个聚到中间一排，三盏灯一起亮一下。
 */
export function WishesStep({ answers, set, next, say }) {
  const f = useFx();
  const sel = answers.wishes || [];
  const ok = Array.isArray(answers.wishOrder) && answers.wishOrder.length === WISHES.length;
  const fallback = useMemo(() => shuffled(WISHES.map((w) => w.v)), []);
  const order = ok ? answers.wishOrder : fallback;
  useEffect(() => {
    if (!ok) set({ wishOrder: fallback });
  }, [ok, fallback, set]);
  const gridRef = useRef(null);
  const lampRefs = useRef([]);
  const ctaRef = useRef(null);
  const [lit, setLit] = useState(sel.length); // 亮着的灯：光点落进去才亮
  const [gathered, setGathered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const selLen = useRef(sel.length);
  selLen.current = sel.length;
  const full = sel.length === 3;

  // 灯的光：从现在的亮度补间到目标（亮 700 ms / 暗 360 ms）；新的一次会接手旧的
  const glowNow = useRef([0, 1, 2].map((i) => (i < lit ? 1 : 0)));
  const glowTok = useRef([0, 0, 0]);
  useLayoutEffect(() => {
    [0, 1, 2].forEach((i) => {
      const want = i < lit ? 1 : 0;
      const svg = lampRefs.current[i]?.querySelector('svg');
      const from = glowNow.current[i];
      if (!svg || from === want) return;
      const tok = ++glowTok.current[i];
      svg.style.setProperty('--glow', String(from));
      fx.clock.tween({
        duration: want ? 700 : 360,
        ease: fx.EASE.out,
        update: (q) => {
          if (glowTok.current[i] !== tok) return;
          const v = from + (want - from) * q;
          glowNow.current[i] = v;
          svg.style.setProperty('--glow', v.toFixed(3));
        },
      });
    });
  }, [lit]);

  const toggle = (v, e) => {
    if (leaving) return;
    const tile = e?.currentTarget;
    if (sel.includes(v)) {
      // 放掉一个：勾收起来、最后一盏灯暗下去（按下去那一下的「取消选中」已经响了）
      set({ wishes: sel.filter((x) => x !== v) });
      setLit((l) => Math.min(l, sel.length - 1));
    } else if (sel.length >= 3) {
      // 只能三个：轻轻摇一下（「轻提示」那一声按下去时已经响了）
      fx.nope(tile, { sound: null });
      say('think', lineText('wishes.full'));
      voice.say('wishes.full');
    } else {
      const k = sel.length;
      tellShell('wish');
      set({ wishes: [...sel, v] });
      const lamp = lampRefs.current[k];
      if (tile) fx.scan(tile, { delay: 40 });
      const land = () => {
        setLit((l) => Math.min(Math.max(l, k + 1), selLen.current));
        // 三盏灯都亮了：愿望成真（D 大三和弦的金铃）
        if (k === 2) sfx.play('wish');
      };
      if (tile && lamp) f.mote(tile, lamp, { delay: 160, size: 3.2, onLand: land });
      else f.after(420, land);
      if (k === 2) {
        say('happy', lineText('wishes.three'));
        // 「时刻」的金铃先响完一点，她再开口（音效 SPEC §9：不同时开始）
        voice.say('wishes.three', { delay: 1300 });
      }
    }
  };

  // 三个都选好了：许愿按钮亮起来的那一下被光扫过，之后每 4.2 秒轻轻扫一下
  useEffect(() => {
    if (full && !leaving && ctaRef.current) fx.scan(ctaRef.current, { sound: null });
  }, [full]); // eslint-disable-line react-hooks/exhaustive-deps
  useGleam(ctaRef, full && !leaving, { first: 2200, every: 4200 });

  const commit = (e) => {
    if (!full || leaving) return;
    setLeaving(true);
    const cta = e.currentTarget;
    fx.scan(cta);
    const tiles = [...(gridRef.current?.querySelectorAll('.wish') || [])];
    const chosen = tiles.filter((x) => x.classList.contains('on'));
    const rest = byDistance(
      tiles.filter((x) => !x.classList.contains('on')),
      cta
    );
    const gone = rest.map((x, i) => f.dissolve(x, { delay: 120 + i * 45, origin: { awayFrom: cta }, from: cta, duration: 620 }));
    settle(
      f,
      Promise.all(gone),
      () => {
        // 留下的三个聚到中间一排（FLIP 弹簧 210 / 22）→ 各被光扫一下 → 三盏灯一起亮一下 → 下一题。
        // 格子区域的高度先留着（那一排在原来的位置里居中）：下面的神灯和按钮不会跳上去
        const g = gridRef.current;
        if (g) g.style.minHeight = `${g.offsetHeight}px`;
        f.layout(() => chosen, () => flushSync(() => setGathered(true)), { stiffness: 210, damping: 22 });
        chosen.forEach((x, i) => fx.scan(x, { delay: 160 + i * 80, sound: i ? null : 'scan' }));
        lampRefs.current.forEach((l, i) => l && f.after(420 + i * 110, () => fx.pulse(l, { sparks: 14 })));
        settle(f, f.wait(900), next, 1400);
      },
      2400
    );
  };

  return (
    <div className={`step step-wishes ${leaving ? 'is-leaving' : ''}`}>
      <Head eyebrow={t('愿望之牌')} title={t('潘吉只能实现你 3 个愿望')} lead={t('选最想要的三个')} />
      <div ref={gridRef} className={`wish-grid ${gathered ? 'is-gathered' : ''}`}>
        {order.map((v) => {
          const w = WISHES.find((x) => x.v === v);
          if (!w) return null;
          const on = sel.includes(v);
          return (
            <button key={v} type="button" className={`wish ${on ? 'on' : ''} ${full && !on ? 'rest' : ''}`} onClick={(e) => toggle(v, e)} aria-pressed={on}>
              <span className="wish-icon">
                <Ico set="wishes" v={v} size={26} />
              </span>
              <span className="wish-label">{t(w.label)}</span>
              <span className="wish-tick" aria-hidden="true">
                <Check size={14} strokeWidth={2.6} />
              </span>
            </button>
          );
        })}
      </div>
      <div className="wish-lamps" aria-label={t('还差 {0} 个', [3 - sel.length])}>
        {[0, 1, 2].map((i) => (
          <span key={i} ref={(el) => (lampRefs.current[i] = el)} className={i < lit ? 'lit' : ''}>
            <Lamp size={52} glow={i < lit ? 1 : 0} />
          </span>
        ))}
      </div>
      <div className="q-actions">
        <Next gold onClick={commit} disabled={!full} icon={full} btnRef={ctaRef}>
          {full ? t('许愿') : tj('还差 {0} 个', [<Odo key="n" value={3 - sel.length} />])}
        </Next>
      </div>
    </div>
  );
}

export function SplurgeStep({ answers, set, next }) {
  const { optsRef, pick } = useSinglePick(next, 'wishes');
  return (
    <div className="step step-life">
      <Head eyebrow={t('愿望之牌 · 附加题')} title={t('如果只能在一个地方「舍得花」，你选 ——')} />
      <div ref={optsRef} className="opts" data-sfx="radio">
        {SPLURGE.map((o) => (
          <Opt key={o.v} set="splurge" v={o.v} on={answers.splurge === o.v} label={t(o.label)} onClick={(e) => pick(e, () => set({ splurge: o.v }))} />
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── V · 雷区 ─────────────────────────

/** 雷区：划掉 = X 盖上去 + 红圈 + 字上一道线从左划到右（金色只给愿望，这里没有扫光）。扫雷完成：划掉的那些化成灰往下落 */
export function NogoStep({ answers, set, next }) {
  const f = useFx();
  const sel = new Set(answers.avoid || []);
  const rootRef = useRef(null);
  const busy = useRef(false);
  const toggle = (v) => {
    if (busy.current) return;
    const s = new Set(sel);
    s.has(v) ? s.delete(v) : s.add(v);
    set({ avoid: [...s] });
  };
  const commit = () => {
    if (busy.current) return;
    busy.current = true;
    const struck = [...(rootRef.current?.querySelectorAll('.nogo-color.x, .opt.is-x.on') || [])];
    const gone = struck.map((el, i) => f.dissolve(el, { tone: 'ash', origin: 'top', duration: 560, delay: Math.min(i, 12) * 35 }));
    settle(f, Promise.all([f.wait(struck.length ? 0 : 240), ...gone]), next, 2400);
  };
  return (
    <div className="step step-nogo" ref={rootRef}>
      <Head eyebrow={t('雷区之牌')} title={t('点一下你「绝对不要」的')} lead={t('讨厌的东西，往往比喜欢的更确定。')} />
      <div className="nogo-colors">
        {NOGO_COLORS.map((c) => (
          <button key={c.v} type="button" className={`nogo-color ${sel.has(c.v) ? 'x' : ''}`} onClick={() => toggle(c.v)} aria-pressed={sel.has(c.v)}>
            <i style={{ background: c.sw }}>
              <X size={18} strokeWidth={2.4} aria-hidden="true" />
            </i>
            <span>
              <em className="nx">{t(c.label)}</em>
            </span>
          </button>
        ))}
      </div>
      <div className="opts opts-many">
        {NOGO_FINISHES.map((fi) => (
          <Opt key={fi.v} small x set="finishes" v={fi.v} on={sel.has(fi.v)} label={t(fi.label)} onClick={() => toggle(fi.v)} />
        ))}
      </div>
      <div className="q-actions">
        <Next onClick={commit}>{sel.size ? tj('扫雷完成（{0}）', [<Odo key="n" value={sel.size} />]) : t('没有雷区，我都 OK')}</Next>
      </div>
    </div>
  );
}

/**
 * 最后一句：点一个建议 = 那句话化成一粒光飞进文字框，光扫过、字出现。
 * 交给潘吉：文字框往上化成金尘（愿望升起来），一大片暮色拂过，换到揭晓。
 */
export function OneWishStep({ answers, set, finish }) {
  const f = useFx();
  const [text, setText] = useState(answers.oneWish || '');
  const [chipOn, setChipOn] = useState(null);
  const [sent, setSent] = useState(false);
  const wrapRef = useRef(null);
  const sentRef = useRef(false);
  const pickChip = (c, e) => {
    if (sentRef.current) return;
    const v = t(c);
    setChipOn(c);
    const wrap = wrapRef.current;
    const show = () => {
      setText(v);
      if (wrap) fx.scan(wrap, { duration: 360 });
    };
    if (e?.currentTarget && wrap) f.mote(e.currentTarget, wrap, { delay: 40, size: 3, land: false, onLand: show });
    else show();
  };
  const give = (e) => {
    if (sentRef.current) return;
    sentRef.current = true;
    setSent(true);
    const v = text.trim();
    set({ oneWish: v });
    fx.scan(e.currentTarget);
    const wrap = wrapRef.current;
    if (wrap) fx.dissolve(wrap, { origin: 'bottom', from: wrap, duration: 800, dust: 1.4, hide: false });
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      finish(v);
    };
    f.after(300, () => {
      const w = fx.wipe(null, { tone: 'dusk', duration: 900 });
      settle(null, w.mid, go, 900);
    });
    // 保险：动效没跑起来也一定交给潘吉（档案、蓝图都在 finish 里）
    f.after(2400, go);
  };
  return (
    <div className="step step-onewish">
      <Head eyebrow={t('最后一句')} title={t('如果这个家只能实现一件事，那会是 ——')} />
      <div className="chips center" data-sfx="radio">
        {ONE_WISH_CHIPS.map((c) => (
          <button key={c} type="button" className={`chip ${text === t(c) || chipOn === c ? 'on' : ''}`} aria-pressed={text === t(c) || chipOn === c} onClick={(e) => pickChip(c, e)}>
            {t(c)}
          </button>
        ))}
      </div>
      <div className="ow-input" ref={wrapRef}>
        <textarea
          className="text-in"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setChipOn(null);
          }}
          placeholder={t('一句话就好（可以跳过）')}
          maxLength={140}
          rows={3}
        />
      </div>
      <div className="q-actions">
        <button type="button" className="btn btn-gold big" disabled={sent} onClick={give}>
          <Sparkle size={18} strokeWidth={1.8} aria-hidden="true" />
          <span>{t('交给潘吉')}</span>
        </button>
      </div>
    </div>
  );
}

export const PAIR_COUNT = PAIRS.length;
export const LIFE_COUNT = LIFE.length;
