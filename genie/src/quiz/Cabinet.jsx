// 宝藏页「画出来的柜子」：一格一格的小照片（vignettes/tiles/，和直觉牌同一套家具、材质、光）按客人数的数量拼起来。
// 每一格都是完整的小格子，拼在一起就是一组组合柜；拖滑杆时只换几张图，不重画。
// 怎么重拍这些小样：src/quiz/vignettes/tiles.js（只在开发时用）。
//
// 动效（scratchpad/motion/SPEC.md §6.1 宝藏）：
//   鞋柜：多出来的列从金尘里聚起来（fx.condense，从下往上），少掉的列化成金尘（fx.dissolve，从上往下），
//         其余的列弹到新位置（FLIP，弹簧 260 / 24），不跳。
//         声音（音效 SPEC §7.2：滑杆的手势 = 按下 + 每一格的刻度声）：手指按在滑杆上时，列安静地聚 / 散；
//         放开时多了列 → 一声「聚起来」。键盘一格一格地按：最多 0.7 秒一声，轻一点。
//   书墙：新摆上书的格子淡入（160 ms）。藏 vs 展：换了的格子像柜门一样绕着门轴转开 / 关上（rotateY −75°），再换图。
//   衣柜：多出来的「还差的门」（虚线框）从金尘里聚起来。

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import fx from '../shared/fx.js';
import { sfx } from '../shared/sfx.js';

const FILES = import.meta.glob('./vignettes/tiles/*.webp', { eager: true, query: '?url', import: 'default' });
const TILE = {};
for (const [path, url] of Object.entries(FILES)) {
  const m = /\/([a-z]+-[a-z0-9]+)-tile\.webp$/.exec(path);
  if (m) TILE[m[1]] = url;
}

// 每种小样的尺寸（像素，宽 × 高）—— 和 tiles.js 里的 px / 高宽比一致
const SIZE = { shoe: [200, 194], book: [320, 142], ratio: [240, 158], door: [96, 512] };
const calm = () => fx.motion.reduced || !fx.motion.enabled;
const HINGE = 'perspective(600px) rotateY(0deg)';
const OPEN = 'perspective(600px) rotateY(-75deg)';

/**
 * 一格。swap：换图时怎么换 —— 'fade'（淡入 160 ms）· 'door'（像柜门：转开到 −75°、换图、再转回来；delay 错开）· 不写 = 直接换
 */
function Tile({ k, kind, swap, delay = 0 }) {
  const [w, h] = SIZE[kind];
  const ref = useRef(null);
  const [shown, setShown] = useState(k);
  const out = useRef(null);
  const swung = useRef(false);
  const delayRef = useRef(delay);
  delayRef.current = delay;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (k === shown) {
      // 转开到一半又拖回来了：转回去
      if (out.current) {
        out.current.cancel();
        out.current = null;
        el.animate([{ transform: OPEN, opacity: 0.35 }, { transform: HINGE, opacity: 1 }], { duration: 160, easing: 'cubic-bezier(.22, 1, .36, 1)' });
      }
      return undefined;
    }
    if (swap !== 'door' || calm()) {
      setShown(k);
      if (swap && el.animate) el.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
      return undefined;
    }
    // 柜门：先转开（门轴在左边），侧过去的那一下换图，再转回来
    const d = delayRef.current;
    el.style.transformOrigin = '0 50%';
    out.current?.cancel();
    out.current = el.animate([{ transform: HINGE, opacity: 1 }, { transform: OPEN, opacity: 0.35 }], { duration: 160, delay: d, easing: 'cubic-bezier(.5, 0, .75, .25)', fill: 'forwards' });
    return fx.clock.after(d + 160, () => {
      swung.current = true;
      setShown(k);
    });
  }, [k, shown, swap]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!swung.current || !el) return;
    swung.current = false;
    out.current?.cancel();
    out.current = null;
    el.animate([{ transform: OPEN, opacity: 0.35 }, { transform: HINGE, opacity: 1 }], { duration: 160, easing: 'cubic-bezier(.22, 1, .36, 1)' });
  }, [shown]);
  return <img ref={ref} className="cab-tile" src={TILE[shown] || ''} width={w} height={h} alt="" draggable="false" decoding="async" />;
}

/** 一组柜子：cols × rows 格；cell(c, r) → 小样名 */
function Grid({ kind, cols, rows, cell, className = '', plinth = true, swap, delayOf }) {
  const [w, h] = SIZE[kind];
  const cells = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) cells.push(<Tile key={`${c}-${r}`} k={cell(c, r)} kind={kind} swap={swap} delay={delayOf ? delayOf(c, r) : 0} />);
  return (
    <div className={`cab cab-${kind} ${className}`} style={{ '--cols': cols, '--rows': rows, '--ar': w / h }} aria-hidden="true">
      <div className="cab-grid">{cells}</div>
      {plinth && <i className="cab-plinth" />}
    </div>
  );
}

/**
 * 鞋柜：cols 列 × 7 层，按列从上往下摆满 shoes 双。每一列是一个 .cab-col（才能整列聚起来 / 化成金尘）。
 * 每一列是一个「槽位」（自己的 key）：多出来的插在活着的列后面、从金尘里聚起来；少掉的标成离场、化成金尘，走完再拿掉。
 * 又拖回来的列是新的槽位（新的元素），不会和还在化金尘的那一列抢同一个遮罩。整组柜子的位置变了 → 弹过去（FLIP）。
 */
export function ShoeCabinet({ cols, shoes, shelves = 7, holding = false }) {
  const [w, h] = SIZE.shoe;
  // 拖滑杆的时候不给每一列配一声（刻度声已经在说了）；放开时多了列 → 一声
  const held = useRef(holding);
  held.current = holding;
  const grew = useRef(0);
  const lastSound = useRef(-1e9);
  const voiceCols = (name) => {
    if (held.current) {
      if (name === 'condense') grew.current++;
      return;
    }
    const now = performance.now();
    if (now - lastSound.current < 700) return;
    lastSound.current = now;
    sfx.play(name, { gain: 0.5 });
  };
  useEffect(() => {
    if (holding) {
      grew.current = 0;
      return;
    }
    if (grew.current > 0) {
      grew.current = 0;
      lastSound.current = performance.now();
      sfx.play('condense', { gain: 0.7 });
    }
  }, [holding]);
  const [slots, setSlots] = useState(() => Array.from({ length: cols }, (_, i) => ({ id: i, gone: false })));
  const seq = useRef(cols);
  const els = useRef(new Map());
  const started = useRef(new Map()); // id → 'in' | 'out'
  const enterEnd = useRef(new Map()); // id → 聚起来做完的时间（fx 时钟）
  const cabRef = useRef(null);
  const lastLeft = useRef(null);
  const flipAnim = useRef(null);

  // 1) 列数 → 槽位
  useLayoutEffect(() => {
    const live = slots.filter((s) => !s.gone);
    if (live.length === cols) return;
    const out = slots.filter((s) => s.gone);
    if (live.length < cols) {
      const add = [];
      for (let i = live.length; i < cols; i++) add.push({ id: seq.current++, gone: false, fresh: true });
      setSlots([...live, ...add, ...out]);
    } else setSlots([...live.slice(0, cols), ...live.slice(cols).map((s) => ({ ...s, gone: true })), ...out]);
  }, [cols, slots]);

  // 2) 新槽位聚起来、离场的化成金尘（化完再拿掉）
  useLayoutEffect(() => {
    let nIn = 0;
    let nOut = 0;
    const drop = (id) => setSlots((ss) => ss.filter((x) => x.id !== id));
    for (const s of slots) {
      const el = els.current.get(s.id);
      const st = started.current.get(s.id);
      if (!el) continue;
      if (s.gone && st !== 'out') {
        started.current.set(s.id, 'out');
        if ((enterEnd.current.get(s.id) ?? -1) > fx.clock.now()) {
          // 还在聚起来就又不要了：轻轻淡掉（不和聚起来的遮罩抢）
          el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' });
          fx.clock.after(160, () => drop(s.id));
        } else {
          fx.dissolve(el, { origin: 'top', duration: 460, delay: nOut * 60, tone: 'paper', dust: 0.8, sound: null }).then(() => drop(s.id));
          nOut++;
        }
      } else if (!s.gone && s.fresh && !st) {
        started.current.set(s.id, 'in');
        const delay = nIn * 70;
        enterEnd.current.set(s.id, fx.clock.now() + delay + 540);
        fx.condense(el, { origin: 'bottom', duration: 520, delay, tone: 'paper', dust: 0.7, sound: null });
        nIn++;
      }
    }
    if (nIn) voiceCols('condense');
    else if (nOut) voiceCols('dissolve');
  }, [slots]); // eslint-disable-line react-hooks/exhaustive-deps

  // FLIP：整组柜子的位置变了（加列 / 拿掉列，柜子居中）→ 从旧位置弹到新位置
  useLayoutEffect(() => {
    const el = cabRef.current;
    if (!el) return;
    flipAnim.current?.cancel();
    const left = el.getBoundingClientRect().left;
    const was = lastLeft.current;
    lastLeft.current = left;
    if (was == null || calm() || Math.abs(was - left) < 0.5) return;
    const sp = fx.springEasing({ stiffness: 260, damping: 24 });
    flipAnim.current = el.animate([{ translate: `${was - left}px 0` }, { translate: '0 0' }], { duration: sp.duration, easing: sp.easing });
  });

  const perCell = 10 / shelves;
  const filled = new Set();
  let left = shoes;
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < shelves; r++) {
      if (Math.max(0, Math.min(perCell, left)) > 0.5) filled.add(`${c}-${r}`);
      left -= perCell;
    }
  let c = 0;
  const columns = slots.map((s) => {
    const col = s.gone ? -1 : c++;
    const tiles = [];
    for (let r = 0; r < shelves; r++) tiles.push(<Tile key={r} k={col >= 0 && filled.has(`${col}-${r}`) ? `shoe-${((col * 3 + r) % 4) + 1}` : 'shoe-0'} kind="shoe" swap="fade" />);
    return (
      <div
        key={s.id}
        className={`cab-col ${s.gone ? 'is-gone' : ''}`}
        ref={(el) => {
          if (el) els.current.set(s.id, el);
          else els.current.delete(s.id);
        }}
      >
        {tiles}
      </div>
    );
  });
  return (
    <div ref={cabRef} className="cab cab-shoe cab-cols" style={{ '--cols': slots.length, '--rows': shelves, '--ar': w / h }} aria-hidden="true">
      <div className="cab-grid">{columns}</div>
      <i className="cab-plinth" />
    </div>
  );
}

/** 书墙：5 × 3 格，每格 = 一层 800mm 的书（新摆上的淡入） */
export function BookWall({ n }) {
  return <Grid kind="book" cols={5} rows={3} swap="fade" cell={(c, r) => (r * 5 + c < Math.min(15, n) ? `book-${((r * 5 + c) % 3) + 1}` : 'book-0')} />;
}

/** 藏 vs 展：4 × 3 格，open = 打开的格子（其余是门）。换了的格子像柜门一样转开 / 关上，40 ms 一扇错开 */
export function RatioWall({ open }) {
  const prev = useRef(open);
  const changed = [];
  for (let i = 0; i < 12; i++) if (prev.current.has(i) !== open.has(i)) changed.push(i);
  useEffect(() => {
    prev.current = open;
  });
  const rank = (i) => Math.max(0, changed.indexOf(i));
  return <Grid kind="ratio" cols={4} rows={3} swap="door" delayOf={(c, r) => rank(r * 4 + c) * 40} cell={(c, r) => (open.has(r * 4 + c) ? `ratio-${((r * 4 + c) % 3) + 1}` : 'ratio-0')} />;
}

/** 新出现的格子（衣柜的门 / 还差的门）从金尘里聚起来；第一次画的时候不聚 */
function Appear({ live, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (live && ref.current) fx.condense(ref.current, { origin: 'bottom', duration: 460, tone: 'paper', dust: 0.6 });
    // 只在挂上来的那一下
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return children(ref);
}

/** 衣柜：have 扇现有的门 + 虚线框出还差的门（到 target 扇）。live = 不是第一次画（新出现的才聚起来） */
export function Wardrobe({ have, target, live = false }) {
  const [w, h] = SIZE.door;
  return (
    <div className="cab cab-door" style={{ '--cols': target, '--rows': 1, '--ar': w / h }} aria-hidden="true">
      <i className="cab-top" />
      <div className="cab-grid">
        {[...Array(target)].map((_, i) =>
          i < have ? (
            <Appear key={`d${i}`} live={live}>
              {(ref) => (
                <span ref={ref} className="cab-cell">
                  <Tile k={i % 2 ? 'door-l' : 'door-r'} kind="door" />
                </span>
              )}
            </Appear>
          ) : (
            <Appear key={`g${i}`} live={live}>
              {(ref) => <span ref={ref} className="cab-ghost" />}
            </Appear>
          )
        )}
      </div>
      <i className="cab-plinth" />
    </div>
  );
}
