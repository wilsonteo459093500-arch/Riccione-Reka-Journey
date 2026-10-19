// 「带它回家」的小零件：和许愿之旅（steps.jsx）同一套写法、同一套 quiz.css 的 class —— 自己的一份，不改 steps.jsx。
//   Head / Next          题目卡的标题、前进按钮
//   useSinglePick        单选：选中的被光扫过，其余的化成金尘，一粒光飞进顶栏这一步的小圆点，落下去才前进
//   useAdvance           慢一点的题（有「下一步」）：按钮被光扫过，一粒光飞进顶栏
//   HomeSteps            顶栏：你的家 · 案例 · 户型图 · 生成
//   Counter              − 数字 +（卧室 / 浴室 / 几层）
//   ReadingPill          「正在读你的户型图 · 42%」
//   useSwatchURL / Swatch 材质色卡（程序画的，iPad 上一张要几十到几百毫秒）：在后台线程画（swatchWorker.js），
//                        先显示材质的底色，画好了淡进来 —— 案例详情、K 屏「保留」、生成那一屏都不会被色卡卡住；
//                        后台线程起不来（旧 Safari）→ 和以前一样在主线程空闲时一张一张画

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Minus, Plus, Check } from 'lucide-react';
import fx, { useFx } from '../../shared/fx.js';
import { t } from '../../shared/i18n.js';
import { lab } from '../../shared/home.js';
import { phrased } from '../typo.jsx';
import { settle, byDistance } from '../moments.js';
import { Odo } from '../ui.jsx';
import { swatchURL } from '../../shared/textures.js';
import { MAT_BY_ID } from '../../shared/materials.js';

// ───────── 色卡：后台线程画（swatchWorker.js 交回 BMP），画好的记住（blob URL，整页用到关掉）─────────
const swCache = new Map();
const swWait = new Map();
const swQueue = []; // 主线程的退路：一张一张在空闲时画
let swBusy = false;
let swWorker; // undefined = 还没起；null = 起不来（以后都走主线程）
const swSent = new Set(); // 已经交给后台线程、还没回来的
let swDog = 0; // 看门狗：后台线程 10 秒没回音 → 当它坏了，剩下的改在主线程画
let swIdle = 0; // 闲了 20 秒就把后台线程关掉（要用再起）
const later = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 150 }) : setTimeout(fn, 24));

function finish(key, url) {
  swSent.delete(key);
  swCache.set(key, url);
  const cbs = swWait.get(key) || [];
  swWait.delete(key);
  for (const cb of cbs) cb(url);
}

function getWorker() {
  if (swWorker !== undefined) return swWorker;
  swWorker = null;
  if (typeof Worker !== 'function' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  try {
    const w = new Worker(new URL('./swatchWorker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => fromWorker(e.data);
    w.onerror = (e) => {
      e?.preventDefault?.();
      workerBroke();
    };
    swWorker = w;
  } catch {
    swWorker = null;
  }
  return swWorker;
}

function workerBroke() {
  clearTimeout(swDog);
  clearTimeout(swIdle);
  try {
    swWorker?.terminate();
  } catch {
    /* 已经停了 */
  }
  swWorker = null;
  for (const key of swSent) swQueue.push(key);
  swSent.clear();
  pump();
}

function watch() {
  clearTimeout(swDog);
  clearTimeout(swIdle);
  if (swSent.size) swDog = setTimeout(workerBroke, 10000);
  else
    swIdle = setTimeout(() => {
      if (swSent.size || !swWorker) return;
      try {
        swWorker.terminate();
      } catch {
        /* 已经停了 */
      }
      swWorker = undefined;
    }, 20000);
}

function fromWorker(d) {
  const key = d?.key;
  if (!key || !swSent.has(key)) return;
  // 后台线程交回一张 BMP（swatchWorker.js）；画不了这个材质 → null，色块就停在材质的底色
  finish(key, d.blob ? URL.createObjectURL(d.blob) : null);
  watch();
}

function pump() {
  if (swBusy || !swQueue.length) return;
  swBusy = true;
  later(() => {
    const key = swQueue.shift();
    const at = key.lastIndexOf('@');
    let url = null;
    try {
      url = swatchURL(key.slice(0, at), Number(key.slice(at + 1))) || null;
    } catch {
      url = null;
    }
    swBusy = false;
    finish(key, url);
    pump();
  });
}
/** 要一张色卡：画好了就马上回（同步），没画好就排队，画好了 cb(url) */
export function requestSwatch(id, px, cb) {
  if (!id || !MAT_BY_ID[id]) return null;
  const key = `${id}@${px}`;
  if (swCache.has(key)) {
    cb?.(swCache.get(key));
    return swCache.get(key);
  }
  const fresh = !swWait.has(key);
  if (fresh) swWait.set(key, []);
  if (cb) swWait.get(key).push(cb);
  if (fresh) {
    const w = getWorker();
    if (w) {
      swSent.add(key);
      const at = key.lastIndexOf('@');
      w.postMessage({ key, id, px: Number(key.slice(at + 1)) });
      watch();
    } else {
      swQueue.push(key);
      pump();
    }
  }
  return null;
}
/** 先在空闲时把一组色卡画好（例如户型图那一屏就先画 K 屏的色卡） */
export const prewarmSwatches = (ids, px) => ids.forEach((id) => requestSwatch(id, px));
export function useSwatchURL(id, px) {
  const [url, setUrl] = useState(() => swCache.get(`${id}@${px}`) ?? null);
  useEffect(() => {
    let alive = true;
    const now = requestSwatch(id, px, (u) => alive && setUrl(u));
    if (now) setUrl(now);
    return () => {
      alive = false;
    };
  }, [id, px]);
  return url;
}
/** 材质色卡：还没画好的时候是这个材质的底色（资料里的颜色），画好了淡进来 */
export function Swatch({ id, px = 96, className = '', as: Tag = 'span', children, ...rest }) {
  const url = useSwatchURL(id, px);
  const color = MAT_BY_ID[id]?.color;
  return (
    <Tag className={`hj-sw ${url ? 'is-ready' : ''} ${className}`} style={{ backgroundColor: color, backgroundImage: url ? `url(${url})` : undefined }} {...rest}>
      {children}
    </Tag>
  );
}

export const HOME_STEPS = [
  { id: 'home', zh: '你的家', en: 'Your home' },
  { id: 'cases', zh: '案例', en: 'Cases' },
  { id: 'plan', zh: '户型图', en: 'Floor plan' },
  { id: 'gen', zh: '生成', en: 'Build' },
];

/** 顶栏这一步的小圆点（被选中的东西飞过去的地方） */
export const stepDot = () => (typeof document !== 'undefined' ? document.querySelector('.hj-steps li.now i') : null);

export function HomeSteps({ now = 0 }) {
  const items = [];
  HOME_STEPS.forEach((s, i) => {
    items.push(
      <li key={s.id} className={i < now ? 'done' : i === now ? 'now' : ''} aria-current={i === now ? 'step' : undefined}>
        <i />
        <span>{lab(s)}</span>
      </li>
    );
    if (i < HOME_STEPS.length - 1) items.push(<li key={`${s.id}-sep`} className="hj-sep" aria-hidden="true" />);
  });
  return (
    <ol className="hj-steps" aria-label={t('带它回家')}>
      {items}
    </ol>
  );
}

export function Next({ onClick, children, gold = false, big = false, disabled = false, icon = true, btnRef, sfx }) {
  return (
    <button ref={btnRef} type="button" className={`btn ${gold ? 'btn-gold' : 'btn-primary'} ${big ? 'big' : ''}`} onClick={onClick} disabled={disabled} data-sfx={sfx}>
      <span>{children}</span>
      {icon && <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />}
    </button>
  );
}

export function Head({ eyebrow, title, lead, children }) {
  return (
    <header className="q-head">
      {children}
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="h-title">{phrased(title)}</h2>
      {lead && <p className="lead">{phrased(lead, { sentences: false })}</p>}
    </header>
  );
}

/** 「下一步」：按钮被光扫过，一粒光从 from（或按钮）飞进顶栏这一步的圆点，落下去才前进。同一题只走一次 */
export function useAdvance(next) {
  const f = useFx();
  const busy = useRef(false);
  return (e, from) => {
    if (busy.current) return;
    busy.current = true;
    const btn = e?.currentTarget || null;
    if (btn) fx.scan(btn);
    const src = (typeof from === 'function' ? from(btn) : from) || btn;
    const dot = stepDot();
    settle(f, dot && src ? f.mote(src, dot, { delay: 120 }) : f.wait(260), next, 1800);
  };
}

/** 单选：选中的被光扫过，其余的从离它最远的一侧化成金尘，一粒光飞进顶栏，落下去才前进 */
export function useSinglePick(next) {
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
    const dot = stepDot();
    settle(f, dot ? f.mote(me, dot, { delay: 220 }) : f.wait(600), next, 2000);
  };
  return { optsRef, pick };
}

/** − 数字 +：按一下数字像里程表一样滚；到头的那一边变灰 */
export function Counter({ label, value, min = 1, max = 9, onChange, plus = false }) {
  const shown = plus && value >= max ? `${max}+` : null;
  return (
    <div className="hj-stepper">
      <span>{label}</span>
      <div className="hj-ctl">
        <button type="button" aria-label={t('少一个')} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} data-sfx="minus">
          <Minus size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        <b aria-live="polite" aria-label={`${label} ${shown || value}`}>
          {shown ? shown : <Odo value={value} />}
        </b>
        <button type="button" aria-label={t('多一个')} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} data-sfx="plus">
          <Plus size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** 「正在读你的户型图 · 42%」—— 读好了变成「读好了」 */
export function ReadingPill({ reading, thumb }) {
  const ref = useRef(null);
  const st = reading?.state;
  const done = st === 'done';
  const pct = Math.round(Math.max(0, Math.min(100, reading?.pct || 0)));
  useEffect(() => {
    if (done && ref.current) fx.scan(ref.current, { sound: null, duration: 360 });
  }, [done]);
  if (!st || st === 'idle') return null;
  return (
    <div className="pp-pill-wrap">
      <span ref={ref} className={`pp-pill ${done ? 'is-done' : ''}`} role="status">
        {thumb ? <img src={thumb} alt="" /> : <span className="pp-pill-ph" aria-hidden="true" />}
        {done ? (
          <>
            <Check size={16} strokeWidth={2.4} aria-hidden="true" />
            <span>{t('你的户型图读好了')}</span>
          </>
        ) : (
          <>
            <span>{t('正在读你的户型图 · {0}%', [pct])}</span>
            <span className="pp-bar" aria-hidden="true">
              <i style={{ width: `${Math.max(6, pct)}%` }} />
            </span>
          </>
        )}
      </span>
    </div>
  );
}
