// 许愿之旅的每一关（UI 组件）。每个组件只管自己的输入，答案通过 set(patch) 写回，next() 前进。
// 文字一律经过 t() / tj()：中文原文就是 key，英文在 src/shared/i18n/en-*.js。

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, X, Sparkle } from 'lucide-react';
import Pangie, { Lamp } from '../shared/Pangie.jsx';
import LangToggle from '../shared/LangToggle.jsx';
import Vignette from './Vignette.jsx';
import { CardFrame, CardBack, Segmented, Slider } from './ui.jsx';
import { Ico } from './icons.jsx';
import { BRAND } from '../shared/config.js';
import { CHAPTERS, PAIRS, LIFE, APPLIANCES, BULKY, WISHES, SPLURGE, NOGO_COLORS, NOGO_FINISHES, ONE_WISH_CHIPS } from './flow.js';
import { storagePlan } from '../shared/profile.js';
import { sfx } from '../shared/sound.js';
import { isWishMode, tellShell } from '../shared/zen.js';
import { t, tj, guideName, isEn } from '../shared/i18n.js';
import { fmt, ftNote } from '../shared/units.js';

const WISH = isWishMode();

/** 洗牌（愿望每次进来顺序都不一样：不让「收纳」永远排第一） */
export function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 前进按钮：普通一步用墨色胶囊，仪式时刻用金色 */
function Next({ onClick, children, gold = false, big = false, disabled = false, icon = true }) {
  return (
    <button type="button" className={`btn ${gold ? 'btn-gold' : 'btn-primary'} ${big ? 'big' : ''}`} onClick={onClick} disabled={disabled}>
      <span>{children}</span>
      {icon && <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />}
    </button>
  );
}

function Head({ eyebrow, title, lead }) {
  return (
    <header className="q-head">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="h-title">{title}</h2>
      {lead && <p className="lead">{lead}</p>}
    </header>
  );
}

// ───────────────────────── 开场 ─────────────────────────

export function Welcome({ answers, set, next }) {
  const players = [
    { v: 'solo', label: t('我自己'), icon: <Ico set="players" v="solo" size={17} /> },
    { v: 'couple', label: t('我们两个'), icon: <Ico set="players" v="couple" size={17} /> },
    { v: 'family', label: t('一家人'), icon: <Ico set="players" v="family" size={17} /> },
  ];
  return (
    <div className="step step-welcome">
      <div className="cover">
        <div className="cover-mark">
          <b>{BRAND.app}</b>
          <span>{BRAND.by}</span>
        </div>
        <div className="cover-hero">
          <Pangie mood="happy" size={168} />
        </div>
        <p className="eyebrow">{t('许愿之旅')}</p>
        <h1 className="h-display">{t('嗨，我是{0}', [guideName()])}</h1>
        <p className="cover-sub">{t('住在神灯里的熊猫')}</p>
        <p className="lead">{t('接下来几分钟，我会用五张牌，读懂你心里的那个家。不用懂设计，也不用想太久 —— 跟着第一感觉走就好。')}</p>

        <div className="cover-form">
          <div className="field">
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
            <Segmented options={players} value={answers.players} label={t('今天谁来许愿？')} onChange={(v) => (sfx.tap(), set({ players: v }))} />
          </div>
        </div>

        <button
          type="button"
          className="btn btn-gold big cover-go"
          onClick={() => {
            set({ name: (answers.name || '').trim() });
            next();
          }}
        >
          <Sparkle size={18} strokeWidth={1.8} aria-hidden="true" />
          <span>{t('开始许愿')}</span>
        </button>
        <p className="fine">{t('大约 6–8 分钟 · 5 张牌 · 结束时会得到你的「梦想家蓝图」')}</p>
      </div>
    </div>
  );
}

/** 擦亮神灯：手指在神灯上来回擦（或按住），进度满了潘吉就出来。仪式感 = 承诺的开始。 */
export function LampRub({ next, name }) {
  const [p, setP] = useState(0);
  const [done, setDone] = useState(false);
  const last = useRef(null);
  const holding = useRef(null);
  const lastSound = useRef(0);
  const progress = useRef(0);
  const doneRef = useRef(false);
  const timer = useRef(null);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearInterval(holding.current);
    },
    []
  );

  const bump = (amt) => {
    if (doneRef.current) return;
    progress.current = Math.min(1, progress.current + amt);
    setP(progress.current);
    if (progress.current >= 1) {
      doneRef.current = true;
      clearInterval(holding.current);
      setDone(true);
      sfx.summon();
      if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
      timer.current = setTimeout(next, 2100);
      return;
    }
    const now = performance.now();
    if (now - lastSound.current > 140) {
      lastSound.current = now;
      sfx.rub();
    }
  };

  const onDown = (e) => {
    if (done) return;
    last.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    clearInterval(holding.current);
    holding.current = setInterval(() => bump(0.012), 50); // 按住也会慢慢满
  };
  const onMove = (e) => {
    if (!last.current || done) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    bump(Math.min(0.04, Math.hypot(dx, dy) / 900));
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
          <Pangie mood="wow" size={176} aura />
        </div>
        <svg className="lamp-ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="47" />
          <circle cx="50" cy="50" r="47" className="fill" pathLength="100" style={{ strokeDashoffset: 100 * (1 - p) }} />
        </svg>
        <div
          className="lamp-touch"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
          role="button"
          aria-label={t('擦亮神灯')}
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && bump(0.2)}
        >
          <Lamp size={280} glow={p} className={p > 0 && !done ? 'lamp-shake' : ''} />
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
  const ch = CHAPTERS.find((c) => c.id === chapter);
  const [flipped, setFlipped] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => {
      setFlipped(true);
      sfx.flip();
    }, 420);
    const b = setTimeout(() => setReady(true), 1150); // 翻完才能点：防止上一页的连点直接跳过
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  const prop = chapter === 'treasure' ? 'magnifier' : chapter === 'wishes' ? 'ball' : 'cards';
  return (
    <div className="step step-interlude">
      <div className={`flip ${flipped ? 'is-flipped' : ''}`}>
        <div className="flip-inner">
          <div className="flip-back">
            <CardBack />
          </div>
          <div className="flip-front">
            <CardFrame num={ch.num} foot={isEn() ? ch.zh : ch.en} className="chapter-card">
              <h2 className="chapter-name">{t(ch.zh)}</h2>
              <Pangie mood={ch.mode === 'slow' ? 'think' : 'mystic'} prop={prop} size={132} float={false} />
            </CardFrame>
          </div>
        </div>
      </div>
      <p className="lead center interlude-hint">{t(ch.hint)}</p>
      <Next gold onClick={next} disabled={!ready}>
        {t('翻开这一张')}
      </Next>
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

export function PairStep({ pair, onPick, index, total, timed = true }) {
  // 左右随机：不让「a 永远在左边」替客人做选择（左撇子 / 习惯点左边的人会被带偏）
  const order = useMemo(() => (Math.random() < 0.5 ? ['a', 'b'] : ['b', 'a']), [pair.id]);
  const [picked, setPicked] = useState(null);
  const mountAt = useRef(performance.now());
  // 画面淡入约 0.45 秒：从卡片看得见才开始计时
  const t0 = useRef(performance.now() + 450);
  const pick = (side) => {
    if (picked) return;
    const now = performance.now();
    if (now - mountAt.current < 250) return; // 上一题的连点不算
    const ms = Math.max(0, Math.round(now - t0.current));
    setPicked(side);
    sfx.pick();
    onPick(side, ms, PAIR_REACT[pair.id]?.[side], order[0]);
  };
  return (
    <div className="step step-pair">
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
            type="button"
            className={`pair-card ${picked === side ? 'is-picked' : picked ? 'is-dropped' : ''}`}
            onClick={() => pick(side)}
            aria-label={t(pair[side].label)}
          >
            <span className="pair-art">
              <Vignette visual={pair[side].visual} />
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
        <span className="opt-label">{label}</span>
        {sub && <span className="opt-sub">{sub}</span>}
      </span>
      <span className="opt-tick" aria-hidden="true">
        {x ? <X size={14} strokeWidth={2.6} /> : <Check size={14} strokeWidth={2.6} />}
      </span>
    </button>
  );
}

export function LifeStep({ item, value, onChange, next, index, total }) {
  const multi = !!item.multi;
  const sel = multi ? new Set(value || []) : value;
  const choose = (v) => {
    sfx.tap();
    if (multi) {
      const s = new Set(sel);
      s.has(v) ? s.delete(v) : s.add(v);
      onChange([...s]);
    } else {
      onChange(v);
      setTimeout(next, 380); // next() 自己会挡掉重复 / 过期的调用
    }
  };
  return (
    <div className="step step-life">
      <Head eyebrow={t('生活之牌 · {0} / {1}', [index + 1, total])} title={t(item.q)} lead={item.sub ? t(item.sub) : null} />
      <div className={`opts ${item.options.length > 6 ? 'opts-many' : ''}`}>
        {item.options.map((o) => (
          <Opt key={o.v} set={item.id} v={o.v} on={multi ? sel.has(o.v) : sel === o.v} onClick={() => choose(o.v)} label={t(o.label)} sub={o.sub ? t(o.sub) : null} small={item.options.length > 6} />
        ))}
      </div>
      {multi && (
        <div className="q-actions">
          <Next onClick={next}>{sel.size ? t('就是这些（{0}）', [sel.size]) : t('都没有')}</Next>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── III · 宝藏（慢想） ─────────────────────────

const touch = (answers, ...keys) => ({ touched: { ...(answers.touched || {}), ...Object.fromEntries(keys.map((k) => [k, true])) } });

function Calc({ children, mm }) {
  return (
    <p className="calc">
      <span>{children}</span>
      {mm ? <em>{ftNote(mm)}</em> : null}
    </p>
  );
}

const SHOE_COLORS = ['#3B3A36', '#B3552E', '#8C9884', '#D9CBB4', '#5E4632', '#2E4057', '#C8A272'];

/** 鞋子数量 → 鞋柜宽度，画出来 */
export function ShoesStep({ answers, set, next }) {
  const plan = storagePlan({ shoes: answers.shoes });
  const cols = Math.max(2, plan.shoeCabinetMM / 300);
  const shelves = 7;
  const perCell = 10 / shelves;
  let left = answers.shoes;
  return (
    <div className="step step-treasure">
      <Head eyebrow={t('宝藏之牌 · {0} / 6', [1])} title={t('全家大概有几双鞋？')} lead={t('连拖鞋、运动鞋、高跟鞋一起数。')} />
      <div className="viz viz-cabinet">
        <svg viewBox={`0 0 ${cols * 60 + 20} 232`} preserveAspectRatio="xMidYMax meet" aria-hidden="true">
          <rect x="4" y="4" width={cols * 60 + 12} height="222" rx="6" fill="#C8A272" />
          <rect x="4" y="220" width={cols * 60 + 12} height="6" rx="3" fill="#A8834F" />
          {[...Array(cols)].map((_, c) =>
            [...Array(shelves)].map((_, r) => {
              const n = Math.max(0, Math.min(perCell, left));
              left -= perCell;
              const filled = n > 0.5;
              const x = 10 + c * 60;
              const y = 10 + r * 30;
              const col = SHOE_COLORS[(c * 3 + r) % SHOE_COLORS.length];
              return (
                <g key={`${c}-${r}`}>
                  <rect x={x} y={y} width="56" height="26" rx="2" fill="#F6F1E8" />
                  {filled && (
                    <g fill={col}>
                      <path d={`M${x + 8} ${y + 21} c0 -6 4 -8 8 -7 l6 3 c3 1 8 1 10 3 l0 3 z`} />
                      <path d={`M${x + 30} ${y + 21} c0 -6 4 -8 8 -7 l6 3 c3 1 8 1 10 3 l0 3 z`} opacity=".85" />
                    </g>
                  )}
                </g>
              );
            })
          )}
        </svg>
      </div>
      <Slider min={0} max={150} step={5} value={answers.shoes} label={t('全家大概有几双鞋？')} onChange={(v) => set({ shoes: v, ...touch(answers, 'shoes') })} unit={t('双')} />
      <Calc mm={plan.shoeCabinetMM}>{tj('鞋柜 {0} 宽（通高 2100 · 深 350）', [<b key="b">{fmt(plan.shoeCabinetMM)} mm</b>])}</Calc>
      <div className="q-actions">
        <Next onClick={next}>{t('数好了')}</Next>
      </div>
    </div>
  );
}

export function WardrobeStep({ answers, set, next }) {
  const plan = storagePlan({ wardrobeDoors: answers.wardrobeDoors, wardrobeFit: answers.wardrobeFit, longHang: answers.longHang });
  const doors = answers.wardrobeDoors;
  const targetDoors = Math.max(doors, Math.round(plan.wardrobeMM / 450));
  const chip = (field, v, label) => (
    <button key={String(v)} type="button" className={`chip ${answers[field] === v ? 'on' : ''}`} aria-pressed={answers[field] === v} onClick={() => (sfx.tap(), set({ [field]: v, ...touch(answers, field) }))}>
      {label}
    </button>
  );
  return (
    <div className="step step-treasure">
      <Head eyebrow={t('宝藏之牌 · {0} / 6', [2])} title={t('主卧现在的衣柜，大概几门？')} lead={t('一扇门约 450mm 宽。没有衣柜的话，想想你的衣服大概能塞满几门。')} />
      <div className="viz viz-wardrobe">
        <svg viewBox={`0 0 ${targetDoors * 40 + 12} 152`} preserveAspectRatio="xMidYMax meet" aria-hidden="true">
          {[...Array(targetDoors)].map((_, i) => {
            const have = i < doors;
            return (
              <g key={i}>
                <rect x={6 + i * 40} y="6" width="38" height="138" rx="3" fill={have ? '#C8A272' : 'none'} stroke={have ? '#9E7A4E' : '#B98A3B'} strokeDasharray={have ? '0' : '5 4'} strokeWidth="1.6" />
                {have && <rect x={i % 2 ? 9 + i * 40 : 37 + i * 40} y="66" width="2.4" height="20" rx="1.2" fill="#7A5A2E" />}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="chips center">{[2, 3, 4, 5, 6, 8].map((n) => chip('wardrobeDoors', n, n === 8 ? t('6 门以上') : t('{0} 门', [n])))}</div>
      <div className="field center">
        <span className="field-label">{t('现在够用吗？')}</span>
        <div className="chips center">
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
        <div className="chips center">
          {[
            ['few', '很少'],
            ['some', '一些'],
            ['many', '很多'],
          ].map(([v, l]) => chip('longHang', v, t(l)))}
        </div>
      </div>
      <Calc mm={plan.wardrobeMM}>{tj('目标衣柜 {0}（长挂 {1} · 短挂 {2} · 叠放 {3}）', [<b key="b">{fmt(plan.wardrobeMM)} mm</b>, fmt(plan.longHangMM), fmt(plan.shortHangMM), fmt(plan.foldMM)])}</Calc>
      <div className="q-actions">
        <Next onClick={next}>{t('下一个宝藏')}</Next>
      </div>
    </div>
  );
}

const BOOK_COLORS = ['#A65A3A', '#4A6652', '#C6912E', '#7C9A6D', '#B3552E', '#6B4B2F', '#D9CBB4'];

export function BooksStep({ answers, set, next }) {
  const n = answers.books;
  return (
    <div className="step step-treasure">
      <Head eyebrow={t('宝藏之牌 · {0} / 6', [3])} title={t('书和收藏品，大概能摆满几层书架？')} lead={t('一层约 800mm 宽。漫画、唱片、模型、酒，都算。')} />
      <div className="viz viz-books">
        <svg viewBox="0 0 320 172" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
          <rect x="4" y="4" width="312" height="164" rx="5" fill="#8E6A4E" />
          {[...Array(15)].map((_, i) => {
            const c = i % 5;
            const r = Math.floor(i / 5);
            const on = i < Math.min(15, n);
            return (
              <g key={i}>
                <rect x={10 + c * 61.5} y={10 + r * 52} width="56" height="46" rx="1.5" fill="#F6F1E8" />
                {on &&
                  [...Array(6)].map((_, k) => (
                    <rect key={k} x={14 + c * 61.5 + k * 8.5} y={18 + r * 52 + (k % 3) * 2} width="7" height={36 - (k % 3) * 2} rx="1" fill={BOOK_COLORS[(k + i) % BOOK_COLORS.length]} />
                  ))}
              </g>
            );
          })}
        </svg>
        {n > 15 && <span className="viz-more">{t('+{0} 层', [n - 15])}</span>}
      </div>
      <Slider min={0} max={30} value={n} label={t('书和收藏品，大概能摆满几层书架？')} onChange={(v) => set({ books: v, ...touch(answers, 'books') })} unit={t('层')} />
      <Calc mm={n * 800}>{tj('书墙 {0} 长的层板', [<b key="b">{fmt(n * 800)} mm</b>])}</Calc>
      <div className="q-actions">
        <Next onClick={next}>{t('继续')}</Next>
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
          onClick={() => {
            sfx.tap();
            const s = new Set(sel);
            s.has(o.v) ? s.delete(o.v) : s.add(o.v);
            onChange([...s]);
          }}
        />
      ))}
    </div>
  );
}

export function AppliancesStep({ answers, set, next }) {
  const plan = storagePlan({ appliances: answers.appliances }, APPLIANCES);
  return (
    <div className="step step-treasure">
      <Head eyebrow={t('宝藏之牌 · {0} / 6', [4])} title={t('厨房里有哪些小家电？')} lead={t('点一点你有的（或打算买的）。')} />
      <ChipGrid items={APPLIANCES} set="appliances" value={answers.appliances} onChange={(v) => set({ appliances: v })} />
      {plan.applianceCount ? (
        <Calc mm={plan.counterMM}>
          {tj('台面家电区 ≈ {0}', [<b key="b">{fmt(plan.counterMM)} mm</b>])}
          {plan.tallUnits ? ` · ${t('嵌入式 {0} 台', [plan.tallUnits])}${plan.applianceTallCabinet ? t('（建议一组电器高柜）') : ''}` : ''}
        </Calc>
      ) : (
        <p className="calc">{t('一样都没有？那台面可以很清爽')}</p>
      )}
      <div className="q-actions">
        <Next onClick={next}>{t('继续')}</Next>
      </div>
    </div>
  );
}

export function BulkyStep({ answers, set, next }) {
  const n = (answers.bulky || []).length;
  return (
    <div className="step step-treasure">
      <Head eyebrow={t('宝藏之牌 · {0} / 6', [5])} title={t('这些「大家伙」，你家有哪些？')} lead={t('它们最常被忘记，也最常让家变乱。')} />
      <ChipGrid items={BULKY} set="bulky" value={answers.bulky} onChange={(v) => set({ bulky: v })} />
      <p className="calc">{n >= 4 ? t('大家伙不少 —— 潘吉建议留一间储物间，或一组 600 深的通高柜。') : n ? t('记下了，会帮它们找好位置。') : t('很清爽！')}</p>
      <div className="q-actions">
        <Next onClick={next}>{t('继续')}</Next>
      </div>
    </div>
  );
}

/** 藏 vs 展：拖动滑杆，柜墙上的门一扇扇变成开放格 —— 直接操作，马上看到 */
export function RatioStep({ answers, set, next }) {
  const r = answers.ratio;
  const open = Math.round((r / 100) * 12);
  const order = [5, 6, 1, 2, 9, 10, 4, 7, 0, 3, 8, 11];
  const openSet = new Set(order.slice(0, open));
  return (
    <div className="step step-treasure">
      <Head eyebrow={t('宝藏之牌 · {0} / 6', [6])} title={t('家里「看得见」的东西，要占多少？')} lead={t('往左：全部藏起来；往右：大方展示。')} />
      <div className="viz viz-ratio">
        <svg viewBox="0 0 320 172" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
          <rect x="4" y="4" width="312" height="164" rx="5" fill="#C8A272" />
          {[...Array(12)].map((_, i) => {
            const c = i % 4;
            const row = Math.floor(i / 4);
            const x = 8 + c * 77;
            const y = 8 + row * 52.6;
            const o = openSet.has(i);
            return (
              <g key={i}>
                <rect x={x} y={y} width="73" height="48.6" rx="1.5" fill={o ? '#F6F1E8' : '#DCC197'} stroke={o ? 'none' : '#B48C5F'} strokeWidth=".8" />
                {!o && <rect x={x + 33} y={y + 20} width="7" height="2" rx="1" fill="#9E7A4E" />}
                {o &&
                  (i % 3 === 0 ? (
                    <path d={`M${x + 30} ${y + 46} Q${x + 24} ${y + 30} ${x + 34} ${y + 18} L${x + 40} ${y + 18} Q${x + 50} ${y + 30} ${x + 44} ${y + 46} Z`} fill="#B3552E" />
                  ) : i % 3 === 1 ? (
                    [...Array(5)].map((_, k) => <rect key={k} x={x + 12 + k * 9} y={y + 12 + (k % 2) * 3} width="7" height={34 - (k % 2) * 3} rx="1" fill={['#4A6652', '#C6912E', '#7C9A6D', '#A65A3A', '#6B4B2F'][k]} />)
                  ) : (
                    <circle cx={x + 36} cy={y + 30} r="12" fill="#7C9A6D" />
                  ))}
              </g>
            );
          })}
        </svg>
      </div>
      <Slider min={0} max={100} step={5} value={r} label={t('家里「看得见」的东西，要占多少？')} onChange={(v) => set({ ratio: v, ratioTouched: true })} unit={t('% 看得见')} />
      <p className="calc">
        <span>{tj('藏 {0} : 展 {1}', [<b key="h">{100 - r}</b>, <b key="d">{r}</b>])}</span>
      </p>
      <div className="q-actions">
        <Next onClick={next}>{t('宝藏清点完毕')}</Next>
      </div>
    </div>
  );
}

// ───────────────────────── IV · 三个愿望 ─────────────────────────

export function WishesStep({ answers, set, next, say }) {
  const sel = answers.wishes || [];
  const ok = Array.isArray(answers.wishOrder) && answers.wishOrder.length === WISHES.length;
  const fallback = useMemo(() => shuffled(WISHES.map((w) => w.v)), []);
  const order = ok ? answers.wishOrder : fallback;
  useEffect(() => {
    if (!ok) set({ wishOrder: fallback });
  }, [ok, fallback, set]);
  const toggle = (v) => {
    if (sel.includes(v)) {
      sfx.tap();
      set({ wishes: sel.filter((x) => x !== v) });
    } else if (sel.length >= 3) {
      sfx.nope();
      say('think', t('只能三个哦！先放掉一个 🙏'));
    } else {
      if (!WISH) sfx.wish(); // 许愿模式里外壳会响一声风铃，不要叠两次
      tellShell('wish');
      set({ wishes: [...sel, v] });
      if (sel.length === 2) say('happy', t('三个愿望，潘吉收到了 ✨'));
    }
  };
  return (
    <div className="step step-wishes">
      <Head eyebrow={t('愿望之牌')} title={t('潘吉只能实现你 3 个愿望')} lead={t('选最想要的三个')} />
      <div className="wish-grid">
        {order.map((v) => {
          const w = WISHES.find((x) => x.v === v);
          if (!w) return null;
          const on = sel.includes(v);
          return (
            <button key={v} type="button" className={`wish ${on ? 'on' : ''}`} onClick={() => toggle(v)} aria-pressed={on}>
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
          <span key={i} className={i < sel.length ? 'lit' : ''}>
            <Lamp size={52} glow={i < sel.length ? 1 : 0} />
          </span>
        ))}
      </div>
      <div className="q-actions">
        <Next gold onClick={next} disabled={sel.length !== 3} icon={sel.length === 3}>
          {sel.length === 3 ? t('许愿') : t('还差 {0} 个', [3 - sel.length])}
        </Next>
      </div>
    </div>
  );
}

export function SplurgeStep({ answers, set, next }) {
  return (
    <div className="step step-life">
      <Head eyebrow={t('愿望之牌 · 附加题')} title={t('如果只能在一个地方「舍得花」，你选 ——')} />
      <div className="opts">
        {SPLURGE.map((o) => (
          <Opt
            key={o.v}
            set="splurge"
            v={o.v}
            on={answers.splurge === o.v}
            label={t(o.label)}
            onClick={() => {
              sfx.tap();
              set({ splurge: o.v });
              setTimeout(next, 380);
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── V · 雷区 ─────────────────────────

export function NogoStep({ answers, set, next }) {
  const sel = new Set(answers.avoid || []);
  const toggle = (v) => {
    const s = new Set(sel);
    if (s.has(v)) {
      s.delete(v);
      sfx.tap();
    } else {
      s.add(v);
      sfx.nope();
    }
    set({ avoid: [...s] });
  };
  return (
    <div className="step step-nogo">
      <Head eyebrow={t('雷区之牌')} title={t('点一下你「绝对不要」的')} lead={t('讨厌的东西，往往比喜欢的更确定。')} />
      <div className="nogo-colors">
        {NOGO_COLORS.map((c) => (
          <button key={c.v} type="button" className={`nogo-color ${sel.has(c.v) ? 'x' : ''}`} onClick={() => toggle(c.v)} aria-pressed={sel.has(c.v)}>
            <i style={{ background: c.sw }}>
              <X size={18} strokeWidth={2.4} aria-hidden="true" />
            </i>
            <span>{t(c.label)}</span>
          </button>
        ))}
      </div>
      <div className="opts opts-many">
        {NOGO_FINISHES.map((f) => (
          <Opt key={f.v} small x set="finishes" v={f.v} on={sel.has(f.v)} label={t(f.label)} onClick={() => toggle(f.v)} />
        ))}
      </div>
      <div className="q-actions">
        <Next onClick={next}>{sel.size ? t('扫雷完成（{0}）', [sel.size]) : t('没有雷区，我都 OK')}</Next>
      </div>
    </div>
  );
}

export function OneWishStep({ answers, set, finish }) {
  const [text, setText] = useState(answers.oneWish || '');
  const [sent, setSent] = useState(false);
  return (
    <div className="step step-onewish">
      <Head eyebrow={t('最后一句')} title={t('如果这个家只能实现一件事，那会是 ——')} />
      <div className="chips center">
        {ONE_WISH_CHIPS.map((c) => (
          <button key={c} type="button" className={`chip ${text === t(c) ? 'on' : ''}`} onClick={() => (sfx.tap(), setText(t(c)))}>
            {t(c)}
          </button>
        ))}
      </div>
      <textarea className="text-in" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('一句话就好（可以跳过）')} maxLength={140} rows={3} />
      <div className="q-actions">
        <button
          type="button"
          className="btn btn-gold big"
          disabled={sent}
          onClick={() => {
            if (sent) return;
            setSent(true);
            set({ oneWish: text.trim() });
            finish(text.trim());
          }}
        >
          <Sparkle size={18} strokeWidth={1.8} aria-hidden="true" />
          <span>{t('交给潘吉')}</span>
        </button>
      </div>
    </div>
  );
}

export const PAIR_COUNT = PAIRS.length;
export const LIFE_COUNT = LIFE.length;
