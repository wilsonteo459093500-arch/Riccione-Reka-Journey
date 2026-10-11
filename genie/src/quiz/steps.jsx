// 占卜的每一关（UI 组件）。每个组件只管自己的输入，答案通过 set(patch) 写回，next() 前进。

import { useEffect, useRef, useState } from 'react';
import Pangie, { Lamp } from '../shared/Pangie.jsx';
import Vignette from './Vignette.jsx';
import { GUIDE } from '../shared/config.js';
import { CHAPTERS, PAIRS, LIFE, APPLIANCES, BULKY, WISHES, SPLURGE, NOGO_COLORS, NOGO_FINISHES, ONE_WISH_CHIPS } from './flow.js';
import { storagePlan } from '../shared/profile.js';
import { sfx } from '../shared/sound.js';
import { tellShell } from '../shared/zen.js';

const fmt = (n) => Number(n || 0).toLocaleString('en-US');

/** 塔罗牌框 */
export function TarotFrame({ num, title, children, className = '', onClick, selected, as: As = 'div', ...rest }) {
  return (
    <As className={`tarot ${selected ? 'is-selected' : ''} ${className}`} onClick={onClick} {...rest}>
      <span className="tarot-corner tl" />
      <span className="tarot-corner tr" />
      <span className="tarot-corner bl" />
      <span className="tarot-corner br" />
      {num && <span className="tarot-num">{num}</span>}
      <div className="tarot-body">{children}</div>
      {title && <span className="tarot-title">{title}</span>}
    </As>
  );
}

// ───────────────────────── 开场 ─────────────────────────

export function Welcome({ answers, set, next }) {
  const [name, setName] = useState(answers.name || '');
  return (
    <div className="step step-welcome">
      <div className="welcome-hero">
        <Pangie mood="happy" size={190} />
      </div>
      <p className="eyebrow">GENIE · THE DREAM HOME READING</p>
      <h1 className="h-display">
        嗨，我是{GUIDE.name}
        <small>{GUIDE.nameEn} · 住在神灯里的熊猫</small>
      </h1>
      <p className="lead">
        接下来 5 分钟，我会用几副牌读出你心里的那个家。
        <br />
        不用懂设计，也不用想太久 —— 跟着第一感觉走就好。
      </p>
      <label className="field">
        <span>怎么称呼你？</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：Peggy / 陈小姐" maxLength={30} />
      </label>
      <div className="field">
        <span>今天谁来占卜？</span>
        <div className="chips">
          {[
            ['solo', '🙋 我自己'],
            ['couple', '💑 我们两个'],
            ['family', '👨‍👩‍👧 一家人'],
          ].map(([v, label]) => (
            <button key={v} type="button" className={`chip ${answers.players === v ? 'on' : ''}`} onClick={() => (sfx.tap(), set({ players: v }))}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="btn-gold big"
        onClick={() => {
          set({ name: name.trim() });
          next();
        }}
      >
        开始占卜 ✨
      </button>
      <p className="fine">大约 5 分钟 · 5 张牌 · 结束时会得到你的「梦想家蓝图」</p>
    </div>
  );
}

/** 擦亮神灯：手指在神灯上来回擦（或按住），进度满了盼吉就出来。仪式感 = 承诺的开始。 */
export function LampRub({ next, name }) {
  const [p, setP] = useState(0);
  const [done, setDone] = useState(false);
  const last = useRef(null);
  const holding = useRef(null);
  const lastSound = useRef(0);
  const progress = useRef(0);
  const doneRef = useRef(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

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
      timer.current = setTimeout(next, 1900);
      return;
    }
    const now = performance.now();
    if (now - lastSound.current > 140) {
      lastSound.current = now;
      sfx.rub();
    }
  };

  useEffect(() => () => clearInterval(holding.current), []);

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
      <p className="eyebrow">THE SUMMONING</p>
      <h2 className="h-title">{name ? `${name}，` : ''}擦亮神灯</h2>
      <p className="lead">用手指在神灯上来回擦一擦（按住也可以），把{GUIDE.name}叫出来。</p>
      <div className={`lamp-stage ${done ? 'is-done' : ''}`}>
        <div className="lamp-smoke" style={{ opacity: p, transform: `scale(${0.4 + p * 0.8})` }} />
        <div className={`lamp-genie ${done ? 'out' : ''}`}>
          <Pangie mood="wow" size={170} />
        </div>
        <div
          className="lamp-touch"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
          role="button"
          aria-label="擦亮神灯"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && bump(0.2)}
        >
          <Lamp size={300} glow={p} className={p > 0 && !done ? 'lamp-shake' : ''} />
        </div>
        <svg className="lamp-ring" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" />
          <circle cx="50" cy="50" r="46" className="fill" style={{ strokeDashoffset: 289 * (1 - p) }} />
        </svg>
      </div>
      <p className="fine">{done ? `${GUIDE.name}来啦！` : p > 0 ? `${Math.round(p * 100)}%` : '轻轻擦一擦 ✨'}</p>
    </div>
  );
}

// ───────────────────────── 章节牌 ─────────────────────────

export function Interlude({ chapter, next }) {
  const ch = CHAPTERS.find((c) => c.id === chapter);
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setFlipped(true);
      sfx.flip();
    }, 350);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="step step-interlude" onClick={() => flipped && next()}>
      <div className={`flip ${flipped ? 'is-flipped' : ''}`}>
        <div className="flip-inner">
          <div className="flip-back">
            <TarotFrame className="tarot-back">
              <div className="back-pattern" />
            </TarotFrame>
          </div>
          <div className="flip-front">
            <TarotFrame num={ch.num} title={ch.en}>
              <h2 className="chapter-zh">{ch.zh}</h2>
              <Pangie mood={ch.mode === 'slow' ? 'think' : 'mystic'} prop={chapter === 'treasure' ? 'magnifier' : chapter === 'wishes' ? 'ball' : 'cards'} size={150} float={false} />
            </TarotFrame>
          </div>
        </div>
      </div>
      <p className="lead center">{ch.hint}</p>
      <button
        type="button"
        className="btn-gold"
        onClick={(e) => {
          e.stopPropagation();
          next();
        }}
        disabled={!flipped}
      >
        翻开这一张 →
      </button>
    </div>
  );
}

// ───────────────────────── I · 直觉 ─────────────────────────

const PAIR_REACT = {
  room: { a: '暖光派！☀️', b: '清爽派！🌊' },
  wall: { a: '少即是多 🤍', b: '越丰富越有你 🖼️' },
  touch: { a: '自然的手感 🌾', b: '精致的触感 💎' },
  guest: { a: '收纳控，盼吉懂 📦', b: '你的收藏值得被看见 ✨' },
  palette: { a: '大地色，有温度 🍂', b: '海风色，好清爽 🌊' },
  sofa: { a: '圆圆的最可爱 ☁️', b: '利落有型 🖤' },
  night: { a: '亮亮的才安心 💡', b: '氛围感拉满 🕯️' },
  floor: { a: '木头的温度 🪵', b: '石头的清凉 🪨' },
  kitchen: { a: '干干净净 ✨', b: '烟火气 🍳' },
  table: { a: '原木派 🌳', b: '大理石派 🤍' },
  shelf: { a: '留白的美 🤍', b: '故事满满 📚' },
  weekend: { a: '热闹最好 🥳', b: '独处最好 🍵' },
};

export function PairStep({ pair, onPick, index, total }) {
  const [picked, setPicked] = useState(null);
  const t0 = useRef(performance.now());
  useEffect(() => {
    t0.current = performance.now();
    setPicked(null);
  }, [pair.id]);
  const pick = (side) => {
    if (picked) return;
    const ms = Math.round(performance.now() - t0.current);
    setPicked(side);
    sfx.pick();
    onPick(side, ms, PAIR_REACT[pair.id]?.[side]);
  };
  return (
    <div className="step step-pair">
      <p className="eyebrow">
        直觉之牌 · {index + 1} / {total}
      </p>
      <h2 className="h-title">{pair.q}</h2>
      <div className="timer" key={pair.id}>
        <i />
      </div>
      <div className="pair">
        {['a', 'b'].map((side) => (
          <TarotFrame
            key={side}
            as="button"
            type="button"
            className={`pair-card ${picked === side ? 'is-picked' : picked ? 'is-dropped' : ''}`}
            title={pair[side].label}
            onClick={() => pick(side)}
          >
            <Vignette visual={pair[side].visual} />
          </TarotFrame>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── II · 生活 ─────────────────────────

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
      setTimeout(next, 380);
    }
  };
  return (
    <div className="step step-life">
      <p className="eyebrow">
        生活之牌 · {index + 1} / {total}
      </p>
      <h2 className="h-title">{item.q}</h2>
      {item.sub && <p className="lead center">{item.sub}</p>}
      <div className={`opts ${item.options.length > 6 ? 'opts-many' : ''}`}>
        {item.options.map((o) => {
          const on = multi ? sel.has(o.v) : sel === o.v;
          return (
            <button key={o.v} type="button" className={`opt ${on ? 'on' : ''}`} onClick={() => choose(o.v)}>
              <span className="opt-icon">{o.icon}</span>
              <span className="opt-label">{o.label}</span>
              {o.sub && <span className="opt-sub">{o.sub}</span>}
            </button>
          );
        })}
      </div>
      {multi && (
        <button type="button" className="btn-gold" onClick={next}>
          {sel.size ? `就是这些（${sel.size}）→` : '都没有 →'}
        </button>
      )}
    </div>
  );
}

// ───────────────────────── III · 宝藏（慢想） ─────────────────────────

function Slider({ min, max, step = 1, value, onChange, unit = '' }) {
  return (
    <div className="slider">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="slider-val">
        <b>{fmt(value)}</b> {unit}
      </div>
    </div>
  );
}

/** 鞋子数量 → 鞋柜宽度，画出来 */
export function ShoesStep({ answers, set, next }) {
  const plan = storagePlan({ shoes: answers.shoes });
  const cols = Math.max(2, plan.shoeCabinetMM / 300);
  const shelves = 7;
  const perCell = 10 / shelves;
  let left = answers.shoes;
  return (
    <div className="step step-treasure">
      <p className="eyebrow">宝藏之牌 · 1 / 6</p>
      <h2 className="h-title">全家大概有几双鞋？</h2>
      <p className="lead center">连拖鞋、运动鞋、高跟鞋一起数。</p>
      <div className="viz viz-cabinet">
        <svg viewBox={`0 0 ${cols * 60 + 20} 230`} preserveAspectRatio="xMidYMax meet">
          <rect x="6" y="6" width={cols * 60 + 8} height="214" rx="3" fill="#C8A272" />
          {[...Array(cols)].map((_, c) =>
            [...Array(shelves)].map((_, r) => {
              const n = Math.max(0, Math.min(perCell, left));
              left -= perCell;
              const filled = n > 0.5;
              return (
                <g key={`${c}-${r}`}>
                  <rect x={10 + c * 60} y={10 + r * 30} width="56" height="26" fill="#F4EEE4" />
                  {filled && <text x={38 + c * 60} y={29 + r * 30} textAnchor="middle" fontSize="15">👟</text>}
                </g>
              );
            })
          )}
        </svg>
      </div>
      <Slider min={0} max={150} step={5} value={answers.shoes} onChange={(v) => set({ shoes: v })} unit="双" />
      <p className="calc">
        ≈ 鞋柜 <b>{fmt(plan.shoeCabinetMM)} mm</b> 宽（通高 2100 · 深 350）
      </p>
      <button type="button" className="btn-gold" onClick={next}>
        数好了 →
      </button>
    </div>
  );
}

export function WardrobeStep({ answers, set, next }) {
  const plan = storagePlan({ wardrobeDoors: answers.wardrobeDoors, wardrobeFit: answers.wardrobeFit, longHang: answers.longHang });
  const doors = answers.wardrobeDoors;
  const targetDoors = Math.max(doors, Math.round(plan.wardrobeMM / 450));
  return (
    <div className="step step-treasure">
      <p className="eyebrow">宝藏之牌 · 2 / 6</p>
      <h2 className="h-title">主卧现在的衣柜，大概几门？</h2>
      <p className="lead center">一扇门约 450mm 宽。没有衣柜的话，想想你的衣服大概能塞满几门。</p>
      <div className="viz viz-wardrobe">
        <svg viewBox={`0 0 ${targetDoors * 40 + 12} 150`} preserveAspectRatio="xMidYMax meet">
          {[...Array(targetDoors)].map((_, i) => (
            <rect key={i} x={6 + i * 40} y="6" width="38" height="138" rx="2" fill={i < doors ? '#C8A272' : 'none'} stroke={i < doors ? '#8E6A4E' : '#D7A54A'} strokeDasharray={i < doors ? '0' : '5 4'} strokeWidth="2" />
          ))}
        </svg>
      </div>
      <div className="chips center">
        {[2, 3, 4, 5, 6, 8].map((n) => (
          <button key={n} type="button" className={`chip ${doors === n ? 'on' : ''}`} onClick={() => (sfx.tap(), set({ wardrobeDoors: n }))}>
            {n === 8 ? '6 门以上' : `${n} 门`}
          </button>
        ))}
      </div>
      <div className="field center">
        <span>现在够用吗？</span>
        <div className="chips center">
          {[
            ['roomy', '还有空位'],
            ['ok', '刚刚好'],
            ['full', '挤爆了'],
            ['double', '要两倍'],
          ].map(([v, l]) => (
            <button key={v} type="button" className={`chip ${answers.wardrobeFit === v ? 'on' : ''}`} onClick={() => (sfx.tap(), set({ wardrobeFit: v }))}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="field center">
        <span>长衣服（大衣、长裙、礼服）</span>
        <div className="chips center">
          {[
            ['few', '很少'],
            ['some', '一些'],
            ['many', '很多'],
          ].map(([v, l]) => (
            <button key={v} type="button" className={`chip ${answers.longHang === v ? 'on' : ''}`} onClick={() => (sfx.tap(), set({ longHang: v }))}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <p className="calc">
        ≈ 目标衣柜 <b>{fmt(plan.wardrobeMM)} mm</b>（长挂 {fmt(plan.longHangMM)} · 短挂 {fmt(plan.shortHangMM)} · 叠放 {fmt(plan.foldMM)}）
      </p>
      <button type="button" className="btn-gold" onClick={next}>
        下一个宝藏 →
      </button>
    </div>
  );
}

export function BooksStep({ answers, set, next }) {
  const n = answers.books;
  return (
    <div className="step step-treasure">
      <p className="eyebrow">宝藏之牌 · 3 / 6</p>
      <h2 className="h-title">书和收藏品，大概能摆满几层书架？</h2>
      <p className="lead center">一层约 800mm 宽。漫画、唱片、模型、酒，都算。</p>
      <div className="viz viz-books">
        <svg viewBox="0 0 320 170" preserveAspectRatio="xMidYMax meet">
          <rect x="4" y="4" width="312" height="162" fill="#8E6A4E" />
          {[...Array(15)].map((_, i) => {
            const c = i % 5;
            const r = Math.floor(i / 5);
            const on = i < Math.min(15, n);
            return (
              <g key={i}>
                <rect x={10 + c * 61.5} y={10 + r * 52} width="56" height="46" fill="#F4EEE4" />
                {on &&
                  [...Array(6)].map((_, k) => (
                    <rect key={k} x={14 + c * 61.5 + k * 8.5} y={18 + r * 52 + (k % 3) * 2} width="7" height={36 - (k % 3) * 2} fill={['#A65A3A', '#2E4057', '#C6912E', '#7C9A6D', '#B3552E', '#6B4B2F'][(k + i) % 6]} />
                  ))}
              </g>
            );
          })}
        </svg>
        {n > 15 && <span className="viz-more">+{n - 15} 层</span>}
      </div>
      <Slider min={0} max={30} value={n} onChange={(v) => set({ books: v })} unit="层" />
      <p className="calc">
        ≈ 书墙 <b>{fmt(n * 800)} mm</b> 长的层板
      </p>
      <button type="button" className="btn-gold" onClick={next}>
        继续 →
      </button>
    </div>
  );
}

function ChipGrid({ items, value, onChange }) {
  const sel = new Set(value || []);
  return (
    <div className="opts opts-many">
      {items.map((o) => (
        <button
          key={o.v}
          type="button"
          className={`opt small ${sel.has(o.v) ? 'on' : ''}`}
          onClick={() => {
            sfx.tap();
            const s = new Set(sel);
            s.has(o.v) ? s.delete(o.v) : s.add(o.v);
            onChange([...s]);
          }}
        >
          <span className="opt-icon">{o.icon}</span>
          <span className="opt-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function AppliancesStep({ answers, set, next }) {
  const plan = storagePlan({ appliances: answers.appliances }, APPLIANCES);
  return (
    <div className="step step-treasure">
      <p className="eyebrow">宝藏之牌 · 4 / 6</p>
      <h2 className="h-title">厨房里有哪些小家电？</h2>
      <p className="lead center">点一点你有的（或打算买的）。</p>
      <ChipGrid items={APPLIANCES} value={answers.appliances} onChange={(v) => set({ appliances: v })} />
      <p className="calc">
        {plan.applianceCount ? (
          <>
            台面家电区 ≈ <b>{fmt(plan.counterMM)} mm</b>
            {plan.tallUnits ? ` · 嵌入式 ${plan.tallUnits} 台${plan.applianceTallCabinet ? '（建议一组电器高柜）' : ''}` : ''}
          </>
        ) : (
          '一样都没有？那台面可以很清爽 ✨'
        )}
      </p>
      <button type="button" className="btn-gold" onClick={next}>
        继续 →
      </button>
    </div>
  );
}

export function BulkyStep({ answers, set, next }) {
  const n = (answers.bulky || []).length;
  return (
    <div className="step step-treasure">
      <p className="eyebrow">宝藏之牌 · 5 / 6</p>
      <h2 className="h-title">这些「大家伙」，你家有哪些？</h2>
      <p className="lead center">它们最常被忘记，也最常让家变乱。</p>
      <ChipGrid items={BULKY} value={answers.bulky} onChange={(v) => set({ bulky: v })} />
      <p className="calc">{n >= 4 ? '大家伙不少 —— 盼吉建议留一间储物间，或一组 600 深的通高柜。' : n ? '记下了，会帮它们找好位置。' : '很清爽！'}</p>
      <button type="button" className="btn-gold" onClick={next}>
        继续 →
      </button>
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
      <p className="eyebrow">宝藏之牌 · 6 / 6</p>
      <h2 className="h-title">家里「看得见」的东西，要占多少？</h2>
      <p className="lead center">往左：全部藏起来；往右：大方展示。</p>
      <div className="viz viz-ratio">
        <svg viewBox="0 0 320 170" preserveAspectRatio="xMidYMax meet">
          <rect x="4" y="4" width="312" height="162" fill="#C8A272" />
          {[...Array(12)].map((_, i) => {
            const c = i % 4;
            const row = Math.floor(i / 4);
            const x = 8 + c * 77;
            const y = 8 + row * 52.6;
            const o = openSet.has(i);
            return (
              <g key={i}>
                <rect x={x} y={y} width="73" height="48.6" fill={o ? '#F4EEE4' : '#D9BC92'} stroke={o ? 'none' : '#B48C5F'} />
                {o && (i % 3 === 0 ? <path d={`M${x + 30} ${y + 46} Q${x + 24} ${y + 30} ${x + 34} ${y + 18} L${x + 40} ${y + 18} Q${x + 50} ${y + 30} ${x + 44} ${y + 46} Z`} fill="#B3552E" /> : i % 3 === 1 ? [...Array(5)].map((_, k) => <rect key={k} x={x + 12 + k * 9} y={y + 12 + (k % 2) * 3} width="7" height={34 - (k % 2) * 3} fill={['#2E4057', '#C6912E', '#7C9A6D', '#A65A3A', '#6B4B2F'][k]} />) : <circle cx={x + 36} cy={y + 30} r="12" fill="#7C9A6D" />)}
              </g>
            );
          })}
        </svg>
      </div>
      <Slider min={0} max={100} step={5} value={r} onChange={(v) => set({ ratio: v })} unit="% 看得见" />
      <p className="calc">
        藏 <b>{100 - r}</b> : 展 <b>{r}</b>
      </p>
      <button type="button" className="btn-gold" onClick={next}>
        宝藏清点完毕 →
      </button>
    </div>
  );
}

// ───────────────────────── IV · 三个愿望 ─────────────────────────

export function WishesStep({ answers, set, next, say }) {
  const sel = answers.wishes || [];
  const toggle = (v) => {
    if (sel.includes(v)) {
      sfx.tap();
      set({ wishes: sel.filter((x) => x !== v) });
    } else if (sel.length >= 3) {
      sfx.nope();
      say('think', '只能三个哦！先放掉一个 🙏');
    } else {
      sfx.wish();
      tellShell('wish');
      set({ wishes: [...sel, v] });
      if (sel.length === 2) say('happy', '三个愿望，盼吉收到了 ✨');
    }
  };
  return (
    <div className="step step-wishes">
      <p className="eyebrow">愿望之牌</p>
      <h2 className="h-title">盼吉只能实现你 3 个愿望</h2>
      <p className="lead center">选最想要的三个（按重要顺序点）。</p>
      <div className="wish-grid">
        {WISHES.map((w) => {
          const i = sel.indexOf(w.v);
          return (
            <button key={w.v} type="button" className={`wish ${i >= 0 ? 'on' : ''}`} onClick={() => toggle(w.v)}>
              {i >= 0 && <span className="wish-badge">{i + 1}</span>}
              <span className="wish-icon">{w.icon}</span>
              <span className="wish-label">{w.label}</span>
            </button>
          );
        })}
      </div>
      <div className="wish-lamps">
        {[0, 1, 2].map((i) => (
          <span key={i} className={i < sel.length ? 'lit' : ''}>
            🪔
          </span>
        ))}
      </div>
      <button type="button" className="btn-gold" onClick={next} disabled={sel.length !== 3}>
        {sel.length === 3 ? '许愿 ✨' : `还差 ${3 - sel.length} 个`}
      </button>
    </div>
  );
}

export function SplurgeStep({ answers, set, next }) {
  return (
    <div className="step step-life">
      <p className="eyebrow">愿望之牌 · 附加题</p>
      <h2 className="h-title">如果只能在一个地方「舍得花」，你选 ——</h2>
      <div className="opts">
        {SPLURGE.map((o) => (
          <button
            key={o.v}
            type="button"
            className={`opt ${answers.splurge === o.v ? 'on' : ''}`}
            onClick={() => {
              sfx.tap();
              set({ splurge: o.v });
              setTimeout(next, 380);
            }}
          >
            <span className="opt-icon">{o.icon}</span>
            <span className="opt-label">{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── V · 禁忌 ─────────────────────────

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
      <p className="eyebrow">禁忌之牌</p>
      <h2 className="h-title">点一下你「绝对不要」的</h2>
      <p className="lead center">讨厌的东西，往往比喜欢的更确定。</p>
      <div className="nogo-colors">
        {NOGO_COLORS.map((c) => (
          <button key={c.v} type="button" className={`nogo-color ${sel.has(c.v) ? 'x' : ''}`} onClick={() => toggle(c.v)}>
            <i style={{ background: c.sw }} />
            <span>{c.label}</span>
          </button>
        ))}
      </div>
      <div className="chips center">
        {NOGO_FINISHES.map((f) => (
          <button key={f.v} type="button" className={`chip ${sel.has(f.v) ? 'x' : ''}`} onClick={() => toggle(f.v)}>
            {f.label}
          </button>
        ))}
      </div>
      <button type="button" className="btn-gold" onClick={next}>
        {sel.size ? `扫雷完成（${sel.size}）→` : '没有雷区，我都 OK →'}
      </button>
    </div>
  );
}

export function OneWishStep({ answers, set, finish }) {
  const [text, setText] = useState(answers.oneWish || '');
  return (
    <div className="step step-onewish">
      <p className="eyebrow">最后一句</p>
      <h2 className="h-title">如果这个家只能实现一件事，那会是 ——</h2>
      <div className="chips center">
        {ONE_WISH_CHIPS.map((c) => (
          <button key={c} type="button" className="chip" onClick={() => (sfx.tap(), setText(c))}>
            {c}
          </button>
        ))}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="一句话就好（可以跳过）" maxLength={140} rows={3} />
      <button
        type="button"
        className="btn-gold big"
        onClick={() => {
          set({ oneWish: text.trim() });
          finish(text.trim());
        }}
      >
        交给盼吉 🔮
      </button>
    </div>
  );
}

export const PAIR_COUNT = PAIRS.length;
export const LIFE_COUNT = LIFE.length;
