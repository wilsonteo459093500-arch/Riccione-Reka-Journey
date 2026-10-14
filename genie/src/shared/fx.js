// fx.js —— WISH 动效 · Motion kit「光是材质 Light is the material」
// 触碰会亮、选中被一道光扫过、离开的东西化成金色的尘、被选中的飞向它该去的地方、进度是一束光沿着溪流走。
// Spec: scratchpad/motion/SPEC.md (timings, curves, per-screen choreography). This is the production module.
//
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
//  API  (import fx from '../shared/fx.js'  —  or named imports; fx.css is imported by this file)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
//  Every effect: transform / opacity only, one shared lazily-created overlay canvas (DPR ≤ 2, ≤ 600 particles,
//  hidden + no rAF when idle), prefers-reduced-motion → fades / still glows (no particles, no travel), sounds go
//  through sound.js (sfx.fx: the same touch never sounds twice) and keep playing under reduced motion.
//  Colours: canvas from palette.js, CSS from base.css variables. Nothing here ever blocks input.
//  el = an HTMLElement; target = an element or a screen point {x, y}; tone = 'paper' | 'photo' | 'dusk' | 'ash' | 'dawn'
//  (omitted → 'dusk' inside a .dusk ancestor, else 'paper'). All `→ Promise` resolve when the effect is over.
//
//  ── TOUCH (every button) ─────────────────────────────────────────────────────────────────────────────────
//  fx.install(root = document, { selector, rules, sound = false }) → uninstall()
//      ONE line per page (main.jsx): every button / [role=button] / a[href] / .opt / .chip / .pair-card / .wish
//      gets the press (scale .97 + spring back) and the ink ripple from the fingertip. sound=false because
//      installSfx() already plays the right sound for every control. Opt out: data-fx="none" (on it or a
//      container). Per element: data-fx-ripple="off" · data-fx-depth="0.94" · data-fx-tone="dusk".
//      rules: [{ sel, depth, ripple, tone, target, skip }] — target = what actually scales inside the control
//      (the deal-breaker swatch presses its dot: { sel: '.nogo-color', target: ':scope > i', ripple: false }).
//        import fx from '../shared/fx.js'; fx.install();
//  <button {...fx.pressProps}>            one-line opt-in for one element (React spread; no hook needed)
//  <button {...usePress({ depth: .94, ripple: false })}>        same, with options (React hook)
//  fx.tap(el, event, opts) → release()    = fx.press: scale + ripple now; release() springs back
//      opts: { tone, depth = .97, ripple = true, sound = 'tap', buzz = 'tap', duration }
//  fx.bindPress(el, opts) → unbind()      plain-DOM version of pressProps
//
//  ── SELECTION LIGHT ──────────────────────────────────────────────────────────────────────────────────────
//  fx.scan(el, { delay, duration, tone, holo, angle = 20, edge = true, sound = 'scan', reverse }) → Promise
//      a thin gold-white band crosses el in 280–420 ms (by its diagonal) + a 1 px gilt edge glint.
//      The 'scan' sound is skipped when el (or its control) was pressed ≤ 450 ms ago: the delegated
//      select / next / confirm already answered that touch (one choice ≤ 3 sounds, SFX SPEC §4).
//        fx.scan(card, { delay: 30 });
//  fx.holo(el, { delay, duration = 1250 }) → Promise          holographic foil scan (dreamer card / poster)
//        fx.holo(frontRef.current, { delay: 160 });
//  fx.gleam(cta, { first = 900, every = 5200 }) → stop()      the ONE gold CTA of a screen, every few seconds
//        useEffect(() => fx.gleam(ctaRef.current, { every: 4200 }), [ready]);   // or useGleam(ctaRef, ready)
//
//  ── LEAVING / ARRIVING ───────────────────────────────────────────────────────────────────────────────────
//  fx.dissolve(el, { origin, from, duration = 600, delay, tone, dust = 1, drift, hide = true, sound }) → Promise
//      noise-eroded mask + gold ember front + gold dust drifting away from `from` and up. Ends
//      visibility:hidden (layout never jumps). If React reuses the node later, call fx.restore(el).
//      origin: 'left'|'right'|'top'|'bottom'|'center'|{x,y}|{ awayFrom: el | point }   (where the erosion starts)
//        fx.dissolve(loser, { delay: 120, origin: { awayFrom: winner }, from: winner, duration: 640, tone: 'photo' });
//        fx.dissolve(struck, { tone: 'ash' });          // deal-breakers: grey ash falling down
//  fx.prepare(el, { origin }) → Promise   pre-build the erosion sprite on mount, in idle slices (≤ 4 ms each).
//      Sprites are shared by size + compass direction (8 points + centre), so a 9-card commit needs 1–3. A
//      dissolve that starts before its sprite is ready waits ≤ 320 ms, then falls back to fade + a pinch of
//      dust; PNG encoding never runs synchronously on the main thread (except under the manual capture clock).
//  fx.condense(el, { origin = 'center', duration = 560, delay, tone }) → Promise   reverse: dust gathers, el appears
//  fx.restore(el)                         undo what fx left on a node (hidden / mask / fades) — for reused nodes
//
//  ── TRAVEL ───────────────────────────────────────────────────────────────────────────────────────────────
//  fx.fly(el, target, { delay, arc = .32, tilt = 7, tone, landNote, onLand, duration, hideSource = true,
//         context = 'auto' }) → Promise
//      a DOM clone lifts, arcs to target, turns into a mote of light and is caught (pulse + ring + sparks).
//      The source stays visibility:hidden (fx.restore(el) brings it back).
//      Sounds: sound = 'fly' (the whoosh at take-off; skipped when el was just pressed) · landSound = 'land'
//      (+ landNote = the D E F♯ A B step). sound: null = no whoosh, still lands · sound: false = silent.
//        fx.fly(winner, document.querySelector('.stone.is-now svg'), { delay: 300, landNote: 0 }).then(next);
//  fx.mote(from, to, { delay, size = 3, tone, onLand, duration, arc = .35, sound = null, landSound, landNote })
//      → Promise   canvas-only light mote. Silent take-off; landing in a progress stone (.stone / [data-fx-land])
//      plays that stone's 'land' note, so every step of progress lands on the D E F♯ A B ladder.
//        fx.mote(optEl, stoneSvg, { delay: 220 }).then(next);
//  fx.pulse(target, { tone, sparks = 10, ring = true })   "caught": spring scale 1.16 → 1 + ring + sparks
//
//  ── CELEBRATION ──────────────────────────────────────────────────────────────────────────────────────────
//  fx.burst(x, y, { count = 48, tone = 'dusk', speed, life, stars, rect, radius, gravity, ring = true })
//        const r = card.getBoundingClientRect(); fx.burst(r.left + r.width / 2, r.top + r.height / 2, { rect: r, count: 110 });
//  fx.ring(x, y, { r0, r1, duration, color, alpha, add }) · fx.spark(x, y, { vx, vy, tone, star })
//  fx.reveal(card, { front, bloom, emblem, delay, tone = 'dusk' }) → Promise
//      the reveal peak: burst from the card's four edges + emblem stars + bloom → 1 + holo scan on `front` + 'reveal' sound.
//        fx.flip(inner, { stiffness: 70, damping: 12.5, lift: .08 }); fx.reveal(cardEl, { front, bloom, delay: 520 });
//  fx.tilt(card, { target, sheen = true, max = 7, tapHolo }) → unbind()   card follows the finger (±7° / ±6°) + foil sheen
//  fx.stamp(el, { from = 1.35 }) → Promise   seal stamp (spring + ink ring + ash grains + 'stamp' sound)
//  fx.nope(el) → Promise                      the one gentle "no": ±6 px shake + 'nope' sound + haptic
//
//  ── NUMBERS & PROGRESS ───────────────────────────────────────────────────────────────────────────────────
//  fx.countUp(el, to, { from, duration = 900, delay, format, tick = false }) → Promise     text count-up
//        fx.countUp(numEl, 72, { from: 50, format: (n) => `${Math.round(n)}%` });
//  fx.odometer(el, value, { duration, delay, format, tick = true }) → Promise   mechanical rolling digits
//      first call builds the digit strips (no animation); later calls roll. Keep React children out of el.
//        useOdometer(pctRef, pct, { tick: false });
//  fx.streamLight(path, { from, to, duration = 900, delay, tone, onArrive }) → Promise
//      light runs along the stream (<path class="stream-b">); from / to = 0–1 of the length, { x } screen x, or an element.
//        fx.streamLight(streamPath, { from: stoneA, to: stoneB, onArrive: () => fx.pulse(stoneB, { sparks: 12 }) });
//
//  ── CARDS & SCREENS ──────────────────────────────────────────────────────────────────────────────────────
//  fx.flip(inner, { from = 0, to = 180, stiffness = 64, damping = 12, lift = .07, tone = 'dusk', edges = true,
//          delay, sound = 'flip' }) → Promise
//      inner = .flip-inner (with .flip-back / .flip-front). Spring angle (~5° overshoot), shade + specular sweep on
//      each face, gilt card edges, 'flip' + 'flipLand' sounds. Afterwards it HOLDS rotateY(to) inline until the
//      parent .flip gets .is-flipped / .is-flat (then hands back to CSS by itself) — set your state in .then().
//        fx.flip(innerRef.current).then(() => { setFlipped(true); setFlat(true); setReady(true); });
//  fx.wipe(container | null, { tone = 'paper' | 'dawn' | 'dusk', duration = 820 }) → { mid, done }
//      a wide soft band of light crosses; swap the content at `mid` (fully covered). null / body = whole page.
//        const w = fx.wipe(null, { tone: 'dawn', duration: 1000 }); w.mid.then(next);
//  fx.layout(els | () => els, mutate, { stiffness = 260, damping = 24 }) → Promise   FLIP re-layout on a spring
//  fx.enter(els, { stagger = 70, delay, duration = 700, blur = 5, y = 8 }) → Promise   copy blur-fades in
//
//  ── REACT (one line each) ────────────────────────────────────────────────────────────────────────────────
//  const f = useFx();      all of fx, but promises / after() never fire after the component unmounts:
//        f.fly(win, stone).then(onPick);   f.after(900, next);   <button {...f.pressProps}>
//  usePress(opts) → props · useOdometer(ref, value, opts) · useCountUp(ref, value, opts) · useGleam(ref, on, opts)
//  useExit(ref, active, (el) => fx.dissolve(el)) → gone · usePrepare(ref, { origin }, [key])
//
//  ── CSS-ONLY CLASSES (fx.css) ────────────────────────────────────────────────────────────────────────────
//  .fx-blur-in (copy: blur-fade 5 px; stagger with style="--fx-i: 2") · .fx-rise-in · .fx-pop-in (spring) ·
//  .fx-focus-ring (gold 1 px ring on focus) · .fx-rest (dim to .55) · .fx-shake · .fx-pressable (added by fx.press:
//  scope your own `:active { transform: scale(.97) }` rules with :not(.fx-pressable) so they don't double up).
//
//  ── PLUMBING ─────────────────────────────────────────────────────────────────────────────────────────────
//  fx.sound(name, arg)       play a UI sound through the same adapter (config.sound → sound.js sfx.fx → play)
//  fx.config                 { sound: null (auto) | fn | false, layer, maxParticles = 600, dprMax = 2 }
//  fx.motion                 { reduced (live prefers-reduced-motion), enabled (kill switch: false = calm) }
//  fx.haptic(kind)           tap · select · land · nope · stamp · summon · reveal (Android only; iPad has none)
//  fx.clock                  the one clock: after(ms, fn) → cancel · wait(ms) · tween({…}) · hook(fn) · now()
//                            real time even on 1 s frames (only a hidden-tab gap is skipped); wipe's mid / done
//                            also race a real-time timer, so content swaps under the band even when frames are slow
//  fx.reset() · fx.stats()   clear the canvas · { particles, rings, comets, canvas, sleeping }
//  window.__fxClock          deterministic capture: .manual = true; .seed(7); .step(1000 / 30) steps every fx
//                            animation AND every CSS / WAAPI animation on the page; .log = true → .sounds[]
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

import './fx.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PALETTE } from './palette.js';
import * as SOUND_MODULE from './sound.js';

const HAS_DOM = typeof window !== 'undefined' && typeof document !== 'undefined';
const noop = () => {};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const perfNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

// ───────────────────────────── random (seedable for capture / tests) ─────────────────────────────

/** mulberry32: 可重复的随机数（录屏 / 测试时每一帧都一样） */
export function rng(seed = 1) {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let RAND = Math.random;
const rnd = () => RAND();
const rand = (a, b) => a + rnd() * (b - a);
/** seed(n) = deterministic particles from now on; seed(null) = Math.random again */
export function seed(n) {
  RAND = n == null ? Math.random : rng(n);
}

// ───────────────────────────── settings ─────────────────────────────

const mq = HAS_DOM && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
/** reduced = 系统「减少动态效果」（实时跟着系统变）；enabled = 总开关（false = 只留淡入淡出） */
export const motion = { reduced: !!mq?.matches, enabled: true };
if (mq?.addEventListener) mq.addEventListener('change', (e) => (motion.reduced = e.matches));
else mq?.addListener?.((e) => (motion.reduced = e.matches)); // Safari < 14
const calm = () => motion.reduced || !motion.enabled;

/**
 * sound: null = auto (sound.js → sfx.fx, which merges with the delegated button sounds) · a function (name, arg) · false = silent
 * layer: where flight clones live (default body, position: fixed) · maxParticles / dprMax: canvas budget (read when it is created)
 */
export const config = { sound: null, layer: null, maxParticles: 600, dprMax: 2, scale: 1 };
const S = () => (typeof config.scale === 'function' ? config.scale() : config.scale) || 1;

// ── UI-sound adapter: fx never imports a specific API name statically, so the sound owner can rename freely ──
const SOUND_NS = SOUND_MODULE;
const SINK_OBJECTS = ['sfx', 'default'];
const SINK_FN = 'play';
function autoSink() {
  for (const k of SINK_OBJECTS) {
    const s = SOUND_NS[k];
    if (s && typeof s.fx === 'function') return s.fx; // sfx.fx: knows the delegated pointerdown already sounded
    if (s && typeof s.play === 'function') return (n, a) => s.play(n, a && typeof a === 'object' ? a : {});
  }
  const p = SOUND_NS[SINK_FN];
  return typeof p === 'function' ? (n, a) => p(n, a && typeof a === 'object' ? a : {}) : null;
}
/** every sound name fx itself reports (sfx.fx maps them: fly → whoosh, wipe → page, nope → error …) */
export const FX_SOUNDS = ['tap', 'scan', 'holo', 'dissolve', 'condense', 'fly', 'mote', 'land', 'stream', 'flip', 'flipLand', 'tick', 'wipe', 'reveal', 'nope', 'stamp'];
const SOUND_LOG = { on: false, list: [] };
/** 一组只响一声（SPEC §4：九张卡一起化成金尘 = 一声，不是九声）：同名的声音在这个间隔内只响第一下。
 *  dissolve / condense 700 ms：错开离场的一整组（9 张卡 × 45 ms + 本身 0.6 s）也只有一声；land 600 ms：几粒光一起落进同一块石头 = 一声 */
const SOUND_GAP = { dissolve: 700, condense: 700, scan: 90, holo: 300, mote: 70, fly: 200, wipe: 300, flip: 200, stream: 300, land: 600 };
const LAST_SOUND = Object.create(null);
const soundNow = () => (clock.manual ? clock.now() : perfNow());
/** 最近一次按下（press 盖的章）：这一下已经有委托的「选中 / 下一步 / 确认」声了，跟着它的扫光 / 起飞就不再叠一声 */
const LAST_PRESS = { ref: null, at: -1e9 }; // WeakRef：不把下一位客人之前那一页的节点留在内存里
const PRESS_QUIET = 450;
function markPress(el) {
  LAST_PRESS.ref = typeof WeakRef === 'function' ? new WeakRef(el) : { deref: () => el };
  LAST_PRESS.at = soundNow();
}
function pressedRecently(el) {
  const p = LAST_PRESS.ref?.deref();
  if (!p || !el || soundNow() - LAST_PRESS.at > PRESS_QUIET) return false;
  try {
    return p === el || p.contains?.(el) || el.contains?.(p);
  } catch {
    return false;
  }
}
/** 计时器排的声音：真实时间已经晚了 400 ms 以上（很卡的帧）就不响了 —— 晚到的声音比没有声音更糟（和画面对不上） */
function sayAfter(ms, name, arg) {
  if (!name) return;
  const due = clock.now() + Math.max(0, ms || 0);
  clock.after(ms, () => {
    if (clock.now() - due <= 400) say(name, arg);
  });
}
/** play a UI sound through the same adapter fx uses (dedupes with installSfx's delegated button sounds) */
export function sound(name, arg) {
  if (!name) return;
  const now = soundNow(); // 时钟闲着时不走：这里用真实时间
  const gap = SOUND_GAP[name];
  if (gap && LAST_SOUND[name] != null && now >= LAST_SOUND[name] && now - LAST_SOUND[name] < gap) return;
  LAST_SOUND[name] = now;
  if (SOUND_LOG.on) SOUND_LOG.list.push({ t: Math.round(clock.now()), name, arg: typeof arg === 'object' ? JSON.stringify(arg) : arg });
  const sink = typeof config.sound === 'function' ? config.sound : config.sound === false ? null : autoSink();
  try {
    sink?.(name, arg);
  } catch {
    /* sound is decoration */
  }
}
const say = sound;

// ── haptics: Android only (iPad / iPhone Safari expose no vibration API — sound + motion carry it there) ──
export const HAPTICS = { tap: 6, select: 10, land: [8, 40, 12], nope: [14, 40, 14], stamp: 22, summon: [30, 40, 60], reveal: [20, 30, 20, 30, 80] };
export function haptic(kind = 'tap') {
  try {
    if (HAS_DOM && navigator.vibrate) navigator.vibrate(HAPTICS[kind] ?? kind);
  } catch {
    /* ignore */
  }
}

// ───────────────────────────── easing ─────────────────────────────

/** CSS cubic-bezier → JS 函数（同一组参数，CSS / JS 两边的动作完全一样） */
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  const solve = (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-5) return t;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 24; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-5) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  const f = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)));
  f.css = `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
  return f;
}

/** 动效的曲线（fx.css 里 --fx-out / --fx-inout / --fx-in / --fx-scan 是同一组数字；测试会对一遍） */
export const EASE = {
  /** 光落定：ripple、count-up、到达 */
  out: bezier(0.22, 1, 0.36, 1),
  /** 走一段路：飞行、柔光换页 */
  inOut: bezier(0.65, 0, 0.35, 1),
  /** 离开：越走越快 */
  in: bezier(0.5, 0, 0.75, 0.25),
  /** 扫光：几乎匀速，起止都很软 */
  scan: bezier(0.42, 0.04, 0.22, 1),
  /** = base.css 的 --ease */
  std: bezier(0.22, 0.61, 0.36, 1),
  /** 溶解前沿推进 */
  erode: bezier(0.32, 0.02, 0.62, 1),
  linear: Object.assign((t) => t, { css: 'linear' }),
};

/**
 * 阻尼弹簧（解析解）。{ at(ms) → 0…1（可以超过 1 一点）, duration(ms) = 收敛到 0.2 % 以内 }。
 * press 回弹 { 520, 26 } · 落地 { 320, 18 } · 版面 { 260, 24 } · 翻牌角度 { 64, 12 } · 揭晓升起 { 120, 15 }
 */
export function springCurve({ stiffness: k = 170, damping: c = 26, mass: m = 1, velocity: v0 = 0 } = {}) {
  const w0 = Math.sqrt(k / m);
  const z = c / (2 * Math.sqrt(k * m));
  let at;
  let settle;
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    const B = (z * w0 - v0) / wd;
    at = (s) => 1 - Math.exp(-z * w0 * s) * (Math.cos(wd * s) + B * Math.sin(wd * s));
    settle = -Math.log(0.002) / (z * w0); // 包络收敛到 0.2 %
  } else {
    if (z - 1 < 1e-6) at = (s) => 1 - Math.exp(-w0 * s) * (1 + (w0 - v0) * s);
    else {
      // 过阻尼：两个实根
      const q = w0 * Math.sqrt(z * z - 1);
      const r1 = -z * w0 + q;
      const r2 = -z * w0 - q;
      const A = (v0 + r2) / (r1 - r2);
      at = (s) => 1 + A * Math.exp(r1 * s) + (-1 - A) * Math.exp(r2 * s);
    }
    settle = 3.2;
    for (let s = 0.01; s <= 3.2; s += 0.01)
      if (Math.abs(1 - at(s)) < 0.002) {
        settle = s;
        break;
      }
  }
  settle = clamp(settle, 0.18, 3.2);
  return { at: (ms) => at(ms / 1000), duration: Math.round(settle * 1000) };
}

/** 弹簧 → CSS linear() 缓动字符串（41 个点）；纯函数，测试用 */
export function springLinear(opts) {
  const sp = springCurve(opts);
  const n = 40;
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(+sp.at((sp.duration * i) / n).toFixed(4));
  pts[n] = 1;
  return { easing: `linear(${pts.join(', ')})`, duration: sp.duration };
}

let LINEAR_OK = null;
/** 弹簧 → { easing, duration } 给 WAAPI / CSS；不支持 linear()（Safari < 17.2）就退回一条略回弹的 cubic-bezier */
export function springEasing(opts) {
  if (LINEAR_OK === null) LINEAR_OK = HAS_DOM && !!window.CSS?.supports?.('transition-timing-function', 'linear(0, 1)');
  if (!LINEAR_OK) return { easing: 'cubic-bezier(0.34, 1.36, 0.64, 1)', duration: springCurve(opts).duration };
  return springLinear(opts);
}

// ───────────────────────────── timing rules (SPEC §2.1) — pure, tested ─────────────────────────────

/** scan: clamp(220 + 0.36 · diagonal, 280, 420) ms */
export const scanDuration = (w, h) => clamp(220 + Math.hypot(w, h) * 0.36, 280, 420);
/** flight: clamp(520 + 0.28 · distance, 560, 820) ms */
export const flightDuration = (dist) => clamp(520 + dist * 0.28, 560, 820);
/** mote: clamp(420 + 0.35 · distance, 460, 760) ms */
export const moteDuration = (dist) => clamp(420 + dist * 0.35, 460, 760);
/** odometer: clamp(380 + 240 · log10(|Δ| + 1), 380, 1100) ms */
export const odometerDuration = (delta) => clamp(380 + Math.log10(Math.abs(delta) + 1) * 240, 380, 1100);
/** dissolve dust: clamp(area / 330, 26, 240) · density particles */
export const dustBudget = (area, density = 1) => clamp(area / 330, 26, 240) * density;

/** 由近到远排序（stagger 用）：points = [{x,y}…]，返回下标顺序 */
export function rankByDistance(points, origin) {
  return points
    .map((p, i) => [i, Math.hypot(p.x - origin.x, p.y - origin.y)])
    .sort((a, b) => a[1] - b[1])
    .map((a) => a[0]);
}

/** quadratic Bézier point and the "arc upwards" control point used by fly / mote */
export const quad = (a, c, b, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;
export function arcControl(a, b, arc) {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let nx = -(b.y - a.y) / L;
  let ny = (b.x - a.x) / L;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: (a.x + b.x) / 2 + nx * L * arc, y: (a.y + b.y) / 2 + ny * L * arc, L };
}

// ───────────────────────────── clock ─────────────────────────────
// 所有 fx 的计时都走这一个时钟（不用 setTimeout）。只有计时器在等（gleam 每 5 秒一次）时，时钟睡在一个 setTimeout 上，
// 不空转 rAF。manual = true 时由外部 step(ms) 推进：同时推进页面上所有 CSS 动画 / 过渡 / WAAPI，录屏结果完全确定。

class Clock {
  constructor() {
    this.t = 0;
    this.manual = false;
    this.timers = [];
    this.tweens = new Set();
    this.hooks = new Set();
    this._raf = 0;
    this._last = 0;
    this._sleep = 0;
    this._sleepAt = 0;
    this._seen = typeof WeakSet === 'function' ? new WeakSet() : new Set();
    this._skip = false; // 分页刚从后台回来：下一帧只走一帧的时间（不一下跳过整段动画）
    this._loop = this._loop.bind(this);
    if (HAS_DOM && document.addEventListener)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this._skip = true;
      });
  }
  /** 现在（时钟时间）。时钟正睡着（只有计时器在等）：先把睡过的真实时间补上、叫醒 */
  now() {
    if (this._sleepAt) this._wake();
    return this.t;
  }
  /** fn 在 ms 之后执行；返回取消函数 */
  after(ms, fn) {
    const tm = { at: this.now() + Math.max(0, ms || 0), fn, dead: false };
    this.timers.push(tm);
    this._wake();
    return () => {
      tm.dead = true;
    };
  }
  wait(ms) {
    return new Promise((r) => this.after(ms, r));
  }
  /** update(eased, raw) 每帧调用；返回 Promise（结束时 resolve） */
  tween({ duration = 300, delay = 0, ease = EASE.out, update, done } = {}) {
    return new Promise((resolve) => {
      const tw = { start: this.now() + delay, duration: Math.max(1, duration), ease, update, done, resolve };
      this.tweens.add(tw);
      this._wake();
    });
  }
  /** 每帧回调 fn(dt, t)；fn 返回 false 就自己拿掉。返回取消函数 */
  hook(fn) {
    this.hooks.add(fn);
    this._wake();
    return () => this.hooks.delete(fn);
  }
  get sleeping() {
    return !!this._sleep;
  }
  _busy() {
    return this.tweens.size > 0 || this.hooks.size > 0 || this.timers.some((t) => !t.dead);
  }
  _unsleep() {
    if (!this._sleepAt) return;
    if (this._sleep) clearTimeout(this._sleep);
    this._sleep = 0;
    // 睡着的时候只有计时器（没有补间 / 画布），所以可以把这段真实时间一次补上
    this.t += clamp(perfNow() - this._sleepAt, 0, 3.6e6);
    this._sleepAt = 0;
  }
  _kick() {
    if (this.manual || this._raf || !HAS_DOM) return;
    this._last = perfNow();
    this._raf = requestAnimationFrame(this._loop);
  }
  _wake() {
    if (this.manual || !HAS_DOM) return;
    this._unsleep();
    this._kick();
  }
  _loop(now) {
    this._raf = 0;
    // 很卡的帧（iPad 忙、4× 降速，一帧 0.3 s 甚至 1 s）也照真实时间走：和合成线程上的 WAAPI、音效对得上，
    // 编排不会越走越慢（以前 > 250 ms 的帧只算 16.7 ms，2 fps 时时钟只有真实时间的 6 %）。
    // 只有「分页藏起来又回来」才不补（visibilitychange → _skip）：回来时不一下跳过整段动画。
    const raw = now - this._last;
    const dt = this._skip || raw > 4000 ? 16.7 : clamp(raw, 0, 1000); // > 4 s = 分页回来的事件还没到（或者机器睡过）：同样不补
    this._skip = false;
    this._last = now;
    this._tick(dt);
    if (this.manual || !this._busy()) return;
    if (!this.tweens.size && !this.hooks.size) {
      let next = Infinity;
      for (const tm of this.timers) if (!tm.dead && tm.at < next) next = tm.at;
      const gap = next - this.t;
      if (gap > 120) {
        // 从这一帧的时刻开始算睡（t 正好走到这一帧）：同一帧里别的回调占掉的时间（很卡的时候 300 ms）不会丢
        this._sleepAt = Math.min(now, perfNow());
        this._sleep = setTimeout(() => {
          this._sleep = 0;
          this._unsleep();
          this._kick();
        }, gap - 40);
        return;
      }
    }
    this._raf = requestAnimationFrame(this._loop);
  }
  _tick(dt) {
    this.t += dt;
    if (this.timers.length) {
      const due = [];
      const keep = [];
      for (const tm of this.timers) if (!tm.dead) (tm.at <= this.t ? due : keep).push(tm);
      this.timers = keep;
      due.sort((a, b) => a.at - b.at);
      for (const tm of due) {
        try {
          tm.fn();
        } catch (e) {
          console.error('[fx]', e);
        }
      }
    }
    for (const tw of this.tweens) {
      const e = this.t - tw.start;
      if (e < 0) continue;
      const p = Math.min(1, e / tw.duration);
      try {
        tw.update?.(tw.ease(p), p);
      } catch (err) {
        console.error('[fx]', err);
      }
      if (p >= 1) {
        this.tweens.delete(tw);
        try {
          tw.done?.();
        } catch (err) {
          console.error('[fx]', err);
        }
        tw.resolve();
      }
    }
    for (const h of this.hooks) {
      let keep = true;
      try {
        keep = h(dt, this.t) !== false;
      } catch (err) {
        console.error('[fx]', err);
        keep = false;
      }
      if (!keep) this.hooks.delete(h);
    }
  }
  /** 手动推进（manual 模式）：先推进页面上已有的动画，再跑计时器 / 补间 / 画布，最后把新出现的动画停在 0 */
  step(ms = 1000 / 30) {
    if (!this.manual) return;
    this._sync(ms);
    this._tick(ms);
    this._sync(0);
  }
  _sync(ms) {
    if (!HAS_DOM || !document.getAnimations) return;
    for (const a of document.getAnimations()) {
      if (!this._seen.has(a)) {
        this._seen.add(a);
        try {
          a.pause();
          a.currentTime = 0;
        } catch {
          /* ignore */
        }
      } else if (ms) {
        try {
          if (a.playState !== 'paused') a.pause();
          a.currentTime = (a.currentTime || 0) + ms;
        } catch {
          /* ignore */
        }
      }
    }
  }
  setManual(on) {
    if (on && !this.manual) {
      this._unsleep();
      if (this._raf && HAS_DOM) cancelAnimationFrame(this._raf);
      this._raf = 0;
      // 页面上已经在的动画（包括早就播完、fill: forwards 停在终点的进场）：就停在现在的位置，之后跟着 step() 往前走；
      // 只有打开手动之后才出现的动画从 0 开始（以前会把已经停好的卡片倒回 opacity 0 重新进场）
      if (HAS_DOM && document.getAnimations)
        for (const a of document.getAnimations()) {
          this._seen.add(a);
          try {
            a.pause();
          } catch {
            /* ignore */
          }
        }
    }
    this.manual = !!on;
    if (!on) {
      if (HAS_DOM && document.getAnimations)
        for (const a of document.getAnimations()) {
          if (a.playState !== 'paused') continue;
          try {
            // 已经走过终点的：直接结束（play() 会把播完的动画倒回开头重播）
            const end = a.effect?.getComputedTiming?.().endTime;
            if (Number.isFinite(end) && (a.currentTime ?? 0) >= end) a.finish();
            else a.play();
          } catch {
            /* ignore */
          }
        }
      if (this._busy()) this._wake();
    }
  }
}

export const clock = new Clock();
const isEl = (x) => HAS_DOM && x instanceof Element;

// ───────────────────────────── colours (all from palette.js) ─────────────────────────────

export function rgbOf(hex) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** mix two palette colours → '#rrggbb' (t = 0 → a, 1 → b) */
export function mixHex(a, b, t) {
  const A = rgbOf(a);
  const B = rgbOf(b);
  return `#${A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join('')}`;
}
const rgba = (hex, a) => `rgba(${rgbOf(hex).join(',')},${a})`;

/** 画布上的光：金是光，不是颜料。全部由 VI 的 PALETTE 推出来 */
export const LIGHT = {
  deep: mixHex(PALETTE.gold, PALETTE.goldInk, 0.3),
  gold: PALETTE.gold,
  light: PALETTE.goldL,
  halo: PALETTE.pangie?.halo || mixHex(PALETTE.goldL, PALETTE.card, 0.5),
  spec: mixHex(PALETTE.card, PALETTE.goldL, 0.14),
  dusk: PALETTE.duskGold,
  ink: PALETTE.inkSoft,
  stone: mixHex(PALETTE.inkSoft, PALETTE.line, 0.4),
  mist: PALETTE.card,
  seal: PALETTE.seal,
};
/** 每种「调子」用哪些颜色、是不是叠加混合 */
const TONES = {
  paper: { cols: ['deep', 'gold', 'gold', 'light', 'light', 'halo', 'spec'], add: false },
  dawn: { cols: ['gold', 'light', 'light', 'halo', 'spec'], add: false },
  photo: { cols: ['gold', 'light', 'light', 'halo', 'spec', 'spec'], add: false },
  dusk: { cols: ['light', 'halo', 'spec', 'dusk', 'light', 'spec'], add: true },
  ash: { cols: ['ink', 'stone', 'stone', 'mist'], add: false },
};
const COLOR_KEYS = Object.keys(LIGHT);
const pickCol = (tone = 'paper', colors) => {
  const list = colors || TONES[tone]?.cols || TONES.paper.cols;
  return list[(rnd() * list.length) | 0];
};
const SHADOW_LIFT = `0 30px 60px ${rgba(PALETTE.shade, 0.28)}, 0 8px 18px ${rgba(PALETTE.shade, 0.14)}`;
const SHADOW_LAND = `0 6px 12px ${rgba(PALETTE.shade, 0.1)}`;

// ───────────────────────────── the shared canvas ─────────────────────────────
// 一张固定在最上层的画布（pointer-events: none），第一次有粒子时才建。粒子用结构数组（Float32Array），每帧零分配；
// 画成预先渲染好的小光点贴图；只清上一帧画过的矩形；没有粒子 → 隐藏、rAF 停；闲置 6 秒 → 释放画布内存。

const K_DOT = 0;
const K_MIST = 1;
const K_STAR = 2;

class Dust {
  constructor() {
    this.N = 0;
    this.n = 0;
    this.rings = [];
    this.comets = [];
    this.canvas = null;
    this.ctx = null;
    this.dpr = 1;
    this.w = 0;
    this.h = 0;
    this.sprites = null;
    this.dirty = null;
    this.running = false;
    this.stale = false;
    this.shrunk = false;
    this._shrinkT = 0;
  }

  _alloc(N) {
    this.N = N;
    for (const k of ['x', 'y', 'vx', 'vy', 'ax', 'ay', 'drag', 'age', 'life', 'size', 'alpha', 'phase', 'wob']) this[k] = new Float32Array(N);
    for (const k of ['kind', 'col', 'add', 'tw']) this[k] = new Uint8Array(N);
  }

  ensure() {
    if (this.canvas) return true;
    if (!HAS_DOM || !document.body) return false;
    this._alloc(Math.max(16, config.maxParticles | 0));
    const c = document.createElement('canvas');
    c.className = 'fx-canvas';
    c.setAttribute('aria-hidden', 'true');
    // 关键样式写在行内：不管 fx.css 有没有加载完，画布都不会占位、不会挡手指
    c.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:2147483000;visibility:hidden';
    document.body.appendChild(c);
    this.canvas = c;
    this.ctx = c.getContext('2d');
    this.resize();
    window.addEventListener(
      'resize',
      () => {
        if (this.running) this.resize();
        else this.stale = true;
      },
      { passive: true },
    );
    this.sprites = makeSprites();
    return true;
  }

  resize() {
    if (!this.canvas) return;
    const dpr = Math.min(config.dprMax, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.dirty = null;
    this.stale = false;
    this.shrunk = false;
  }

  /** 加一粒；满了就替换掉最老的那一粒（永远不超过上限） */
  emit(p) {
    if (!this.ensure()) return;
    let i = this.n;
    if (i >= this.N) {
      let best = 0;
      let bestV = -1;
      for (let j = 0; j < this.N; j += 7) {
        const v = this.age[j] / this.life[j];
        if (v > bestV) {
          bestV = v;
          best = j;
        }
      }
      i = best;
    } else this.n++;
    const s = S();
    this.x[i] = p.x;
    this.y[i] = p.y;
    this.vx[i] = (p.vx || 0) * s;
    this.vy[i] = (p.vy || 0) * s;
    this.ax[i] = (p.ax || 0) * s;
    this.ay[i] = (p.ay || 0) * s;
    this.drag[i] = p.drag ?? 1.2;
    this.age[i] = -(p.delay || 0);
    this.life[i] = p.life || 900;
    this.size[i] = (p.size || 1) * s;
    this.alpha[i] = p.alpha ?? 1;
    this.phase[i] = rnd() * 6.283;
    this.wob[i] = (p.wob ?? 8) * s;
    this.kind[i] = p.kind || K_DOT;
    this.col[i] = Math.max(0, COLOR_KEYS.indexOf(p.color || 'gold'));
    this.add[i] = p.add ? 1 : 0;
    this.tw[i] = p.twinkle ? 1 : 0;
    this.start();
  }

  ringAt(x, y, o = {}) {
    if (!this.ensure()) return;
    const s = S();
    this.rings.push({ x, y, r0: (o.r0 ?? 6) * s, r1: (o.r1 ?? 56) * s, t0: clock.now() + (o.delay || 0), dur: o.duration || 620, w: (o.width ?? 1.4) * s, color: o.color || LIGHT.light, alpha: o.alpha ?? 0.7, add: !!o.add });
    this.start();
  }

  comet(c) {
    if (!this.ensure()) return;
    this.comets.push(c);
    this.start();
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (this._shrinkT) clearTimeout(this._shrinkT);
    this._shrinkT = 0;
    if (this.stale || this.shrunk) this.resize();
    this.canvas.style.visibility = 'visible';
    clock.hook((dt) => this.frame(dt));
  }

  frame(dt) {
    const ctx = this.ctx;
    const dpr = this.dpr;
    const sec = dt / 1000;
    // 清掉上一帧画过的区域（不是整张画布）
    if (this.dirty) {
      const d = this.dirty;
      ctx.clearRect(d[0] * dpr - 2, d[1] * dpr - 2, (d[2] - d[0]) * dpr + 4, (d[3] - d[1]) * dpr + 4);
    }
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const grow = (x, y, r) => {
      if (x - r < x0) x0 = x - r;
      if (y - r < y0) y0 = y - r;
      if (x + r > x1) x1 = x + r;
      if (y + r > y1) y1 = y + r;
    };

    // 彗星（光点 + 拖尾）：先更新位置、往池子里撒拖尾粒子
    const now = clock.now();
    for (let k = this.comets.length - 1; k >= 0; k--) {
      const c = this.comets[k];
      const e = now - c.t0;
      if (e < 0) continue;
      const p = Math.min(1, e / c.dur);
      const q = (c.ease || EASE.inOut)(p);
      const pt = c.at(q);
      c.px = pt.x;
      c.py = pt.y;
      c.p = p;
      if (c.trail && p < 1) {
        for (let i = 0; i < c.trail; i++) {
          const t = rnd();
          const bx = lerp(c.lx ?? pt.x, pt.x, t);
          const by = lerp(c.ly ?? pt.y, pt.y, t);
          this.emit({ x: bx + rand(-1.5, 1.5) * S(), y: by + rand(-1.5, 1.5) * S(), vx: rand(-14, 14), vy: rand(-22, 6), drag: 2.4, life: rand(380, 760), size: rand(0.5, 1.2), color: pickCol(c.tone), add: TONES[c.tone]?.add, twinkle: rnd() < 0.2 });
        }
      }
      c.lx = pt.x;
      c.ly = pt.y;
      if (p >= 1) {
        this.comets.splice(k, 1);
        try {
          c.done?.();
        } catch (err) {
          console.error('[fx]', err);
        }
      }
    }

    // 粒子：积分 + 回收（把最后一粒挪进空位）
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this._kill(i);
        i--;
        continue;
      }
      if (this.age[i] < 0) continue;
      const dragF = Math.exp(-this.drag[i] * sec);
      this.vx[i] = this.vx[i] * dragF + this.ax[i] * sec;
      this.vy[i] = this.vy[i] * dragF + this.ay[i] * sec;
      const wob = this.wob[i] ? Math.sin(this.phase[i] + this.age[i] * 0.004) * this.wob[i] * sec : 0;
      this.x[i] += this.vx[i] * sec + wob;
      this.y[i] += this.vy[i] * sec;
    }

    // 画：两遍（普通 → 叠加）
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalCompositeOperation = pass ? 'lighter' : 'source-over';
      for (let i = 0; i < this.n; i++) {
        if (this.add[i] !== pass || this.age[i] < 0) continue;
        const lt = this.age[i] / this.life[i];
        let a = this.alpha[i] * smooth(0, 0.1, lt) * (1 - smooth(0.5, 1, lt));
        if (this.tw[i]) a *= 0.55 + 0.45 * Math.sin(this.phase[i] + this.age[i] * 0.03);
        if (a <= 0.01) continue;
        const k = this.kind[i];
        const sp = k === K_MIST ? this.sprites.mist : k === K_STAR ? this.sprites.star : this.sprites.dot;
        const img = sp[this.col[i]] || sp[0];
        // 光点贴图的核心只占贴图的 1/4：画的尺寸 = 核心半径 × 4
        const r = this.size[i] * (k === K_MIST ? 1 : 1 - 0.35 * lt) * (k === K_DOT ? 4 : k === K_STAR ? 5 : 1);
        const x = this.x[i];
        const y = this.y[i];
        ctx.globalAlpha = Math.min(1, a);
        if (k === K_STAR) {
          ctx.save();
          ctx.translate(x * dpr, y * dpr);
          ctx.rotate(this.phase[i] + this.age[i] * 0.0015);
          ctx.drawImage(img, -r * dpr, -r * dpr, 2 * r * dpr, 2 * r * dpr);
          ctx.restore();
        } else ctx.drawImage(img, (x - r) * dpr, (y - r) * dpr, 2 * r * dpr, 2 * r * dpr);
        grow(x, y, r + 1);
      }
    }

    // 光环
    for (let k = this.rings.length - 1; k >= 0; k--) {
      const g = this.rings[k];
      const e = now - g.t0;
      if (e < 0) continue;
      const p = Math.min(1, e / g.dur);
      const r = lerp(g.r0, g.r1, EASE.out(p));
      ctx.globalCompositeOperation = g.add ? 'lighter' : 'source-over';
      ctx.globalAlpha = g.alpha * (1 - p) * (1 - p);
      ctx.strokeStyle = g.color;
      ctx.lineWidth = g.w * (1 - 0.5 * p) * dpr;
      ctx.beginPath();
      ctx.arc(g.x * dpr, g.y * dpr, r * dpr, 0, Math.PI * 2);
      ctx.stroke();
      grow(g.x, g.y, r + g.w + 2);
      if (p >= 1) this.rings.splice(k, 1);
    }

    // 彗星的头（最上面）：光晕 → 金色的芯 → 白色的高光点
    for (const c of this.comets) {
      if (c.px === undefined) continue;
      const s = (c.size || 3) * S();
      const fade = c.p > 0.9 ? 1 - (c.p - 0.9) / 0.1 : 1;
      const add = TONES[c.tone]?.add;
      ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
      ctx.globalAlpha = (add ? 0.6 : 0.85) * fade;
      ctx.drawImage(this.sprites.mist[COLOR_KEYS.indexOf('light')], (c.px - s * 6) * dpr, (c.py - s * 6) * dpr, s * 12 * dpr, s * 12 * dpr);
      ctx.globalAlpha = fade;
      ctx.drawImage(this.sprites.dot[COLOR_KEYS.indexOf(add ? 'light' : 'gold')], (c.px - s * 3) * dpr, (c.py - s * 3) * dpr, s * 6 * dpr, s * 6 * dpr);
      ctx.drawImage(this.sprites.dot[COLOR_KEYS.indexOf('spec')], (c.px - s * 1.5) * dpr, (c.py - s * 1.5) * dpr, s * 3 * dpr, s * 3 * dpr);
      grow(c.px, c.py, s * 6 + 2);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.dirty = x1 > x0 ? [Math.max(0, x0), Math.max(0, y0), Math.min(this.w, x1), Math.min(this.h, y1)] : null;
    const alive = this.n > 0 || this.rings.length > 0 || this.comets.length > 0;
    if (!alive) this.sleep();
    return alive;
  }

  sleep() {
    this.running = false;
    if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.dirty = null;
    if (this.canvas) this.canvas.style.visibility = 'hidden';
    // 闲置一会儿：把画布的像素内存还给系统（iPad 上 3D 工作室要用），下一粒光出现时再按屏幕大小建回来
    if (!clock.manual && !this._shrinkT && this.canvas) {
      this._shrinkT = setTimeout(() => {
        this._shrinkT = 0;
        if (!this.running && this.canvas) {
          this.canvas.width = this.canvas.height = 1;
          this.shrunk = true;
        }
      }, 6000);
    }
  }

  _kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (const k of ['x', 'y', 'vx', 'vy', 'ax', 'ay', 'drag', 'age', 'life', 'size', 'alpha', 'phase', 'wob', 'kind', 'col', 'add', 'tw']) this[k][i] = this[k][j];
  }

  clear() {
    this.n = 0;
    this.rings.length = 0;
    this.comets.length = 0;
    if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.dirty = null;
  }
}

/** 预先画好的小贴图：圆形光点（核心 + 光晕）、四角星、雾团 —— 每种颜色一张 */
function makeSprites() {
  const [wr, wg, wb] = rgbOf(PALETTE.card);
  const mk = (size, draw) =>
    COLOR_KEYS.map((key) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      draw(c.getContext('2d'), size, rgbOf(LIGHT[key]));
      return c;
    });
  const dot = mk(48, (g, n, [r, gg, b]) => {
    const h = n / 2;
    const grd = g.createRadialGradient(h, h, 0, h, h, h);
    // 核心半径 = 贴图的 1/4：中间偏白的亮点（往 VI 的卡片白靠），外面一圈同色的光晕
    grd.addColorStop(0, `rgba(${Math.round(lerp(r, wr, 0.55))},${Math.round(lerp(gg, wg, 0.55))},${Math.round(lerp(b, wb, 0.55))},1)`);
    grd.addColorStop(0.16, `rgba(${r},${gg},${b},0.98)`);
    grd.addColorStop(0.27, `rgba(${r},${gg},${b},0.55)`);
    grd.addColorStop(0.5, `rgba(${r},${gg},${b},0.12)`);
    grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, n, n);
  });
  const star = mk(64, (g, n, [r, gg, b]) => {
    const h = n / 2;
    g.translate(h, h);
    for (const rot of [0, Math.PI / 2]) {
      g.save();
      g.rotate(rot);
      g.scale(1, 0.09);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, h);
      grd.addColorStop(0, `rgba(${wr},${wg},${wb},1)`);
      grd.addColorStop(0.25, `rgba(${r},${gg},${b},0.85)`);
      grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      g.fillStyle = grd;
      g.beginPath();
      g.arc(0, 0, h, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    const core = g.createRadialGradient(0, 0, 0, 0, 0, h * 0.3);
    core.addColorStop(0, `rgba(${wr},${wg},${wb},1)`);
    core.addColorStop(0.4, `rgba(${r},${gg},${b},0.7)`);
    core.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = core;
    g.beginPath();
    g.arc(0, 0, h * 0.3, 0, Math.PI * 2);
    g.fill();
  });
  const mist = mk(64, (g, n, [r, gg, b]) => {
    const h = n / 2;
    const grd = g.createRadialGradient(h, h, 0, h, h, h);
    grd.addColorStop(0, `rgba(${r},${gg},${b},0.5)`);
    grd.addColorStop(0.45, `rgba(${r},${gg},${b},0.22)`);
    grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, n, n);
  });
  return { dot, star, mist };
}

const dust = new Dust();

// ───────────────────────────── DOM helpers ─────────────────────────────

const VOID = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'IMG', 'VIDEO', 'CANVAS', 'IFRAME', 'BR', 'HR', 'OPTION', 'AUDIO', 'PICTURE']);
/** can this element hold the effect layer (<span class="fx-ink">)? */
const canHost = (el) => HAS_DOM && el instanceof HTMLElement && !VOID.has(el.tagName);

const AUTO_POS = HAS_DOM ? new WeakSet() : null;
/** 效果层要贴着元素自己的圆角：宿主必须是定位元素（static → relative；只会是按钮 / 卡片这类） */
function host(el) {
  if (!AUTO_POS.has(el)) {
    AUTO_POS.add(el);
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  }
  return el;
}
/** 宿主里的效果层（圆角裁切、点不到）。每个宿主一个，用完留着（很便宜；React 改了文字被清掉也会重建） */
function inkOf(el) {
  host(el);
  let ink = el.querySelector(':scope > .fx-ink');
  if (!ink) {
    ink = document.createElement('span');
    ink.className = 'fx-ink';
    ink.setAttribute('aria-hidden', 'true');
    el.appendChild(ink);
  }
  return ink;
}
function frameOf(el) {
  const r = el.getBoundingClientRect();
  const w = el.offsetWidth || r.width;
  const h = el.offsetHeight || r.height;
  return { r, w, h, k: r.width / (w || 1) || 1 };
}
const centerOf = (t) => {
  if (!t) return { x: 0, y: 0 };
  if (typeof t.x === 'number' && typeof t.y === 'number' && !isEl(t)) return t;
  const r = t.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
};
const toneOf = (el, tone) => tone || (el?.closest?.('.dusk') ? 'dusk' : 'paper');
const toList = (els) => (!els ? [] : typeof els === 'function' ? [...els()] : isEl(els) ? [els] : [...els]).filter(Boolean);

// 留在元素上的东西（隐藏、遮罩、淡出的填充）—— restore() 用来还原（React 复用同一个节点时）
const LEFT = HAS_DOM ? new WeakMap() : null;
function keep(el, anim) {
  if (!el || !anim || !LEFT) return anim;
  let s = LEFT.get(el);
  if (!s) LEFT.set(el, (s = new Set()));
  s.add(anim);
  return anim;
}
/** 把 fx 留在元素上的状态清掉：visibility、遮罩、淡出 / 位移的填充、金边。React 复用节点（同一个 key）时调用 */
export function restore(el) {
  if (!el || !HAS_DOM) return;
  for (const a of LEFT.get(el) || []) {
    try {
      a.cancel();
    } catch {
      /* ignore */
    }
  }
  LEFT.delete(el);
  el.style.visibility = '';
  clearMask(el);
  el.querySelectorAll?.(':scope > .fx-ember').forEach((n) => n.remove());
}

// ───────────────────────────── (a) tap / press ─────────────────────────────

const RELEASE = { stiffness: 520, damping: 26 };
/** WAAPI composite: 'add'（Safari 16+ / Chrome 112+）：把缩放叠在组件自己的 transform 上 */
let COMPOSITE_ADD = null;
function compositeAdd() {
  if (COMPOSITE_ADD !== null) return COMPOSITE_ADD;
  try {
    const a = document.createElement('div').animate([{ transform: 'none' }, { transform: 'none' }], { duration: 1, composite: 'add' });
    COMPOSITE_ADD = a.effect?.composite === 'add';
    a.cancel();
  } catch {
    COMPOSITE_ADD = false;
  }
  return COMPOSITE_ADD;
}

/**
 * 按下：元素缩到 depth（独立的 scale 属性，不碰组件自己的 transform），一圈光从指尖扩散到最远的角。
 * 返回 release()：弹簧回到 1。第一帧在 pointerdown 的下一帧（≈ 16 ms）。很大的元素（> 30 % 屏幕）不缩放，只有光。
 */
export function press(el, e, { tone, depth = 0.97, ripple = true, sound: snd = 'tap', buzz = 'tap', duration } = {}) {
  if (!el || !HAS_DOM || !el.animate) return noop;
  const T = toneOf(el, tone);
  el.classList?.add('fx-pressable');
  el.__fxDown?.cancel?.();
  markPress(el);
  const { r, w, h, k } = frameOf(el);
  const big = r.width * r.height > 0.3 * window.innerWidth * window.innerHeight;
  const d = big ? 1 : depth;
  let down = null;
  let prop = 'scale';
  if (!calm() && d !== 1) {
    // 元素自己有 transform（例如 translate(-50%) 居中）：独立的 scale 会把那段位移也缩掉 → 改用叠加在 transform 上的缩放
    const own = getComputedStyle(el).transform;
    prop = own && own !== 'none' && compositeAdd() ? 'transform' : 'scale';
    down =
      prop === 'scale'
        ? el.animate([{ scale: '1' }, { scale: String(d) }], { duration: 110, easing: EASE.out.css, fill: 'forwards' })
        : el.animate([{ transform: 'scale(1)' }, { transform: `scale(${d})` }], { duration: 110, easing: EASE.out.css, fill: 'forwards', composite: 'add' });
    el.__fxDown = down;
  }
  if (ripple && canHost(el)) {
    const x = e && typeof e.clientX === 'number' ? (e.clientX - r.left) / k : w / 2;
    const y = e && typeof e.clientY === 'number' ? (e.clientY - r.top) / k : h / 2;
    const R = Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y));
    const ink = inkOf(el);
    const dot = document.createElement('i');
    dot.className = `fx-ripple fx-${T}`;
    dot.style.cssText = `left:${x - R}px;top:${y - R}px;width:${2 * R}px;height:${2 * R}px`;
    ink.appendChild(dot);
    const D = duration ?? (big ? 900 : 640);
    if (calm()) dot.animate([{ opacity: 0 }, { opacity: 0.6, offset: 0.3 }, { opacity: 0 }], { duration: 360, fill: 'both' });
    else
      dot.animate(
        [
          { transform: 'scale(0.06)', opacity: 0.9 },
          { transform: 'scale(0.62)', opacity: 1, offset: 0.32 },
          { transform: 'scale(1)', opacity: 0 },
        ],
        { duration: D, easing: EASE.out.css, fill: 'both' },
      );
    clock.after((calm() ? 360 : D) + 40, () => dot.remove());
  }
  if (snd) say(snd);
  if (buzz) haptic(buzz);
  let done = false;
  return function release() {
    if (done) return;
    done = true;
    if (!down) return;
    const sp = springEasing(RELEASE);
    if (prop === 'scale') el.animate([{ scale: String(d) }, { scale: '1' }], { duration: sp.duration, easing: sp.easing });
    else el.animate([{ transform: `scale(${d})` }, { transform: 'scale(1)' }], { duration: sp.duration, easing: sp.easing, composite: 'add' });
    down.cancel();
    if (el.__fxDown === down) el.__fxDown = null;
  };
}
/** = press (the name the owner's brief uses) */
export const tap = press;

/** 自己挂指针事件：按下 = press，抬起 / 取消 / 移出 = release。返回解绑函数 */
export function bindPress(el, opts = {}) {
  if (!el || !HAS_DOM) return noop;
  el.setAttribute('data-fx', 'own');
  let rel = null;
  const down = (e) => {
    if (e.button > 0) return;
    rel?.();
    rel = press(el, e, opts);
  };
  const up = () => {
    rel?.();
    rel = null;
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);
  return () => {
    up();
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('pointerleave', up);
  };
}

/** React / JSX props for one element: <button {...pressWith({ depth: .94 })}>. data-fx="own" keeps fx.install() off it */
export function pressWith(opts) {
  const held = new WeakMap();
  const end = (e) => {
    const el = e.currentTarget;
    const rel = el && held.get(el);
    if (rel) {
      held.delete(el);
      rel();
    }
  };
  return {
    'data-fx': 'own',
    onPointerDown: (e) => {
      if (e.button > 0) return;
      const el = e.currentTarget;
      held.get(el)?.();
      held.set(el, press(el, e, opts));
    },
    onPointerUp: end,
    onPointerCancel: end,
    onPointerLeave: end,
  };
}
/** <button {...fx.pressProps}>: the default press (scale .97 + ripple + tap sound), no hook needed */
export const pressProps = Object.freeze(pressWith());

const PRESS_SELECTOR = 'button, [role="button"], [role="tab"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], a[href], summary, .opt, .chip, .pair-card, .wish, [data-fx="press"]';
/** 默认的按法（SPEC §6）：玻璃小图标不要涟漪；色票按深一点；擦神灯有自己的效果。
 *  target：真正缩下去的是按钮里的哪一个（雷区色票 = 那颗圆点，SPEC §6.1「P on the dot」）；
 *  雷区色票不要涟漪 —— 没有圆角的整列按钮会被涟漪画出一块灰色方框，打叉、红圈、删除线本身就是回馈 */
const PRESS_RULES = [
  { sel: '.lamp-touch, [data-fx="none"]', skip: true },
  { sel: '.lang-toggle button, .icon-btn, .nav-back, .stone button, .tb-group button, .menu button, .ws-pill', ripple: false },
  { sel: '.chip.sw', ripple: false, depth: 0.94 },
  { sel: '.nogo-color', target: ':scope > i', depth: 0.94, ripple: false },
];

/**
 * 一页一行：整页的可按元素都有「按下去 + 指尖的光」。委托在 root 上（捕获阶段，passive），不改任何组件。
 *   fx.install()                                          // main.jsx 里，installSfx() 旁边
 *   fx.install(document, { rules: [{ sel: '.big-tile', depth: 0.985 }] })
 * sound 默认 false：installSfx() 的委托监听已经给每个控件配了对的声音（选中 / 开关 / 返回 …）。
 * 跳过：data-fx="none"（自己或容器）、data-fx="own"（已经用 pressProps / usePress / bindPress）、disabled / aria-disabled。
 */
export function install(root, { selector = PRESS_SELECTOR, rules = [], sound: snd = false, depth = 0.97 } = {}) {
  if (!HAS_DOM) return noop;
  const R = root || document;
  const all = [...rules, ...PRESS_RULES];
  const held = new Map(); // pointerId → release
  const down = (e) => {
    if (e.button > 0 || e.isPrimary === false) return;
    const t = e.target;
    if (!t || !t.closest) return;
    const el = t.closest(selector);
    if (!el || (R !== document && !R.contains(el))) return;
    if (el.closest('[data-fx="none"], [data-fx="own"], .fx-ghost')) return;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    let o = { depth, ripple: true, sound: snd || null, buzz: 'tap' };
    for (const r of all) {
      if (!el.matches(r.sel)) continue;
      if (r.skip) return;
      o = { ...o, ...r, sel: undefined };
      break;
    }
    const ds = el.dataset || {};
    if (ds.fxRipple === 'off') o.ripple = false;
    if (ds.fxDepth) o.depth = +ds.fxDepth || o.depth;
    if (ds.fxTone) o.tone = ds.fxTone;
    let tgt = el;
    if (o.target) {
      try {
        tgt = el.querySelector(o.target) || el;
      } catch {
        tgt = el;
      }
      // 按钮本身也算「fx 在按」：页面自己的 :not(.fx-pressable):active 后备缩放就不会叠上来
      el.classList?.add('fx-pressable');
    }
    held.get(e.pointerId)?.();
    held.set(e.pointerId, press(tgt, e, { ...o, target: undefined }));
    if (tgt !== el) markPress(el); // 「刚按过」记在整个按钮上（扫光 / 起飞的去重看的是按钮）
  };
  const up = (e) => {
    const rel = held.get(e.pointerId);
    if (rel) {
      held.delete(e.pointerId);
      rel();
    }
  };
  const cap = { capture: true, passive: true };
  R.addEventListener('pointerdown', down, cap);
  window.addEventListener('pointerup', up, cap);
  window.addEventListener('pointercancel', up, cap);
  return () => {
    R.removeEventListener('pointerdown', down, cap);
    window.removeEventListener('pointerup', up, cap);
    window.removeEventListener('pointercancel', up, cap);
    for (const rel of held.values()) rel();
    held.clear();
  };
}

// ───────────────────────────── (b) scan · holo · gleam ─────────────────────────────

/**
 * 选中：一道斜的光带从左到右扫过元素（时长按对角线 280–420 ms），1 px 的金边晚 24 ms 跟着亮（光先照到面、再照到边）。
 * holo: true → 梦想家卡牌的全息光（珠光薄膜 + 细密箔纹，1150–1250 ms）。
 */
export function scan(el, { duration, delay = 0, tone, holo = false, angle = 20, edge = true, width, sound: snd = holo ? 'holo' : 'scan', reverse = false } = {}) {
  if (!el || !HAS_DOM) return Promise.resolve();
  // 扫的是刚按下去的那一个（或它里面 / 外面）：委托的「选中 / 下一步」已经响过 —— 光照样扫，不再叠一声（一下选择 ≤ 3 个声音）
  if (snd && !(snd === 'scan' && pressedRecently(el))) sayAfter(delay, snd, { holo });
  if (!canHost(el)) return clock.wait(delay);
  const T = toneOf(el, tone);
  const { w, h } = frameOf(el);
  const D = duration ?? (holo ? 1150 : scanDuration(w, h));
  const ink = inkOf(el);
  if (calm()) {
    // 减少动态：不移动，只有一层很淡的光亮起再退掉
    const glow = document.createElement('i');
    glow.className = `fx-glow fx-${T}`;
    ink.appendChild(glow);
    glow.animate([{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 320, delay, fill: 'both' });
    clock.after(delay + 360, () => glow.remove());
    return clock.wait(delay + 320);
  }
  const bw = width ?? (holo ? clamp(w * 0.95, 160, 420) : clamp(w * 0.46, 56, 190));
  const skew = Math.tan((angle * Math.PI) / 180) * h;
  const x0 = -bw - skew - 4;
  const x1 = w + skew + 4;
  const tf = (x) => `translate3d(${x}px,0,0) skewX(${-angle}deg)`;
  const frames = reverse ? [{ transform: tf(x1) }, { transform: tf(x0) }] : [{ transform: tf(x0) }, { transform: tf(x1) }];
  const band = document.createElement('i');
  band.className = `fx-scan fx-${T}${holo ? ' is-holo' : ''}`;
  band.style.width = `${bw}px`;
  ink.appendChild(band);
  band.animate(frames, { duration: D, delay, easing: EASE.scan.css, fill: 'both' });
  let ring = null;
  if (edge) {
    ring = document.createElement('i');
    ring.className = `fx-edge fx-${T}`;
    const glint = document.createElement('i');
    glint.style.width = `${clamp(bw * 0.9, 60, 260)}px`;
    ring.appendChild(glint);
    ink.appendChild(ring);
    glint.animate(frames, { duration: D, delay: delay + 24, easing: EASE.scan.css, fill: 'both' });
  }
  clock.after(delay + D + 60, () => {
    band.remove();
    ring?.remove();
  });
  return clock.wait(delay + D);
}

/** 全息光（揭晓的卡牌、海报）：= scan(el, { holo: true, duration: 1250 }) */
export function holo(el, opts = {}) {
  return scan(el, { duration: 1250, ...opts, holo: true });
}

/** 主按钮（金色、唯一的那一个）每隔 every 毫秒被光轻轻扫一下（不出声）；返回 stop() */
export function gleam(el, { every = 5200, first = 900, tone, duration = 900 } = {}) {
  if (!el || !HAS_DOM) return noop;
  let alive = true;
  let cancel = null;
  const loop = (wait) => {
    cancel = clock.after(wait, () => {
      if (!alive || !el.isConnected) return;
      if (!el.disabled && !calm()) scan(el, { duration, tone, sound: null, width: Math.max(70, el.offsetWidth * 0.36) });
      loop(every);
    });
  };
  loop(first);
  return () => {
    alive = false;
    cancel?.();
  };
}

// ───────────────────────────── (c) dissolve / condense ─────────────────────────────
// 噪声场 v(x,y) = 0.70 × 离「侵蚀起点」的距离 + 0.30 × fbm（4 个八度，10 圈）；第 i 帧 = smoothstep(Tᵢ ± e, v)。
// 竖着排成一张长图（每帧 W×H，共 24 帧）当 mask-image，mask-position 一帧一帧换；同一张噪声场也告诉画布：
// 这一帧有哪些格子刚被「吃掉」→ 就在那里冒金尘。第二张帧图 = 侵蚀前沿那一圈细细的金光（ember）。

const SPRITES = new Map(); // key → { W, H, F, v, order, e, url, glowUrl, pending }
const SPRITE_CAP = 10;
const SPRITE_WAIT = 320; // 溶解开始时帧图还没好：最多等这么久（同一组错开的离场里，后面的几张多半已经好了），再退回淡出
const SPRITE_STATS = { built: 0, fades: 0 };
const ERODE_E = 0.032;
const ERODE_FRAMES = 24;

function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash(xi, yi, s), hash(xi + 1, yi, s), u), lerp(hash(xi, yi + 1, s), hash(xi + 1, yi + 1, s), u), v);
}
function fbm(x, y, s) {
  let f = 0;
  let amp = 0.5;
  let fr = 1;
  let norm = 0;
  for (let o = 0; o < 4; o++) {
    f += vnoise(x * fr, y * fr, s + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
    fr *= 2.03;
  }
  return f / norm;
}

/**
 * 侵蚀噪声场的生成器：每算 rows 行歇一下（yield），建帧图时可以切成 ≤ 4 ms 的小片，不在一次触碰里卡住主线程。
 * 算完写进 out.v / out.order
 */
function* fieldJob(W, H, ox, oy, seedN, out, rows = 6) {
  const v = new Float32Array(W * H);
  const asp = H / W;
  let maxD = 0;
  for (const [cx, cy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ])
    maxD = Math.max(maxD, Math.hypot(cx - ox, (cy - oy) * asp));
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const w = (y + 0.5) / H;
      const ramp = Math.hypot(u - ox, (w - oy) * asp) / (maxD || 1);
      const val = ramp * 0.7 + fbm(u * 10, w * 10 * asp, seedN) * 0.3;
      v[y * W + x] = val;
      if (val < lo) lo = val;
      if (val > hi) hi = val;
    }
    if (y % rows === rows - 1) yield;
  }
  for (let i = 0; i < v.length; i++) v[i] = (v[i] - lo) / (hi - lo || 1);
  // 被吃掉的先后顺序：计数排序（4096 档，O(n)）—— 比带比较函数的 sort 快一个数量级（iPad 上建一张大卡的帧图 < 10 ms）
  const B = 4096;
  const count = new Uint32Array(B + 1);
  const bucket = new Uint16Array(v.length);
  for (let i = 0; i < v.length; i++) {
    const b = Math.min(B - 1, (v[i] * B) | 0);
    bucket[i] = b;
    count[b + 1]++;
  }
  for (let b = 0; b < B; b++) count[b + 1] += count[b];
  const order = new Uint32Array(v.length);
  for (let i = 0; i < v.length; i++) order[count[bucket[i]]++] = i;
  out.v = v;
  out.order = order;
}

/** 侵蚀噪声场（纯函数）：{ v: Float32Array 0–1, order: 由先到后被吃掉的格子 } */
export function erosionField(W, H, ox, oy, seedN = 7) {
  const out = {};
  const g = fieldJob(W, H, ox, oy, seedN, out, H);
  while (!g.next().done);
  return { v: out.v, order: out.order };
}

/**
 * 侵蚀起点归到 9 个点（8 个方位 + 中心）。同样大小、朝差不多方向散开的卡片共用一张帧图：
 * 一次提交九张愿望卡（都「离开」按钮）= 1–3 张帧图，不是九张（以前起点按 1/8 取整，81 档，每张卡都要现场建一张）
 */
export function snapOrigin(ox, oy) {
  const dx = ox - 0.5;
  const dy = oy - 0.5;
  if (Math.hypot(dx, dy) < 0.2) return [0.5, 0.5];
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return [0.5 + 0.55 * Math.round(Math.cos(a)), 0.5 + 0.55 * Math.round(Math.sin(a))];
}

/** 帧 i 的阈值（侵蚀进行到哪里）—— 遮罩图和金尘用同一个函数 */
export const thresholdAt = (i, F = ERODE_FRAMES, e = ERODE_E) => lerp(-e, 1 + e, i / (F - 1));

/** 侵蚀起点（元素内 0–1 坐标）：'left' | 'right' | 'top' | 'bottom' | 'center' | {x,y}（屏幕点）| { awayFrom: 点 / 元素 } */
export function originFor(origin, r) {
  if (origin && typeof origin === 'object') {
    if (origin.awayFrom) {
      const c = centerOf(origin.awayFrom);
      const dx = r.left + r.width / 2 - c.x;
      const dy = r.top + r.height / 2 - c.y;
      const len = Math.hypot(dx, dy) || 1;
      // 离「那一点」最远的一侧先开始，最近的一侧最后消失
      return [clamp(0.5 + (dx / len) * 0.62, -0.1, 1.1), clamp(0.5 + (dy / len) * 0.62, -0.1, 1.1)];
    }
    if (typeof origin.x === 'number') return [clamp((origin.x - r.left) / r.width, -0.2, 1.2), clamp((origin.y - r.top) / r.height, -0.2, 1.2)];
  }
  switch (origin) {
    case 'left':
      return [-0.05, 0.5];
    case 'right':
      return [1.05, 0.5];
    case 'top':
      return [0.5, -0.05];
    case 'bottom':
      return [0.5, 1.05];
    case 'center':
      return [0.5, 0.5];
    default:
      return [1.05, 0.15];
  }
}

/** 帧图的分辨率：长边 96 / 128 px，短边按比例（噪声不会被拉长），≥ 20 */
export function spriteSize(r) {
  const long = Math.max(r.width, r.height) > 220 ? 128 : 96;
  const ar = r.width / Math.max(1, r.height);
  if (ar >= 1) return [long, clamp(Math.round(long / ar / 4) * 4, 20, long)];
  return [clamp(Math.round((long * ar) / 4) * 4, 20, long), long];
}

// ── 帧图的建造：一张帧图 = 噪声场（切片算）→ 24 帧遮罩 + 金边像素（三帧一片）→ PNG（worker 里编码，异步）。
// 挂载时的 prepare() 在空闲时间里做（requestIdleCallback，每片 ≤ 4 ms）；真正要溶解了还没好 → 改成「尽快」（setTimeout 0，
// 每片仍 ≤ 4 ms，中间让出帧）。除了录帧（手动时钟）以外，绝不在主线程上同步编码 PNG（4× 降速时一次 toDataURL 就是几十毫秒）。

const BUILD_SLICE = 4;
const BUILDS = []; // 还没建好的帧图（急的排前面）
let buildTimer = null;
const ric = HAS_DOM && typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback.bind(window) : null;
const cic = HAS_DOM && typeof window.cancelIdleCallback === 'function' ? window.cancelIdleCallback.bind(window) : null;

function scheduleBuilds() {
  if (!BUILDS.length) return;
  const urgent = BUILDS.some((b) => b.urgent);
  if (buildTimer) {
    if (!urgent || buildTimer.urgent) return;
    if (buildTimer.idle != null) cic?.(buildTimer.idle); // 空闲排队中来了急的：改成马上
    else clearTimeout(buildTimer.t);
    buildTimer = null;
  }
  if (urgent || !ric) buildTimer = { urgent, t: setTimeout(runBuilds, urgent ? 0 : 32) };
  else buildTimer = { urgent: false, idle: ric(runBuilds, { timeout: 700 }) };
}

function runBuilds(deadline) {
  buildTimer = null;
  const t0 = perfNow();
  while (BUILDS.length && perfNow() - t0 < BUILD_SLICE) {
    const sp = BUILDS[0];
    if (!sp.urgent && deadline && !deadline.didTimeout && typeof deadline.timeRemaining === 'function' && deadline.timeRemaining() < 1) break;
    let done = true;
    try {
      done = !sp.job || sp.job.next().done;
    } catch (e) {
      console.error('[fx]', e);
      sp.failed = true;
    }
    if (done) {
      BUILDS.shift();
      sp.job = null;
      encodeSprite(sp);
    }
  }
  scheduleBuilds();
}

/** 噪声场 + 帧图的生成器（一步 = 几行噪声 / 一帧遮罩） */
function* spriteJob(sp, ox, oy, seedN, invert) {
  yield* fieldJob(sp.W, sp.H, ox, oy, seedN, sp);
  if (invert) {
    // condense：离起点近的格子先出现 → 场反过来（倒放时 v 大的先出现）
    for (let i = 0; i < sp.v.length; i++) sp.v[i] = 1 - sp.v[i];
    sp.order.reverse();
  }
  yield;
  if (!HAS_DOM || typeof ImageData === 'undefined') return;
  yield* paintJob(sp);
}

// PNG 编码交给一个很小的 worker（OffscreenCanvas.convertToBlob，iPadOS 16.4+ / Chrome）：主线程只算噪声场和像素（切片），
// 不编码。没有 worker / OffscreenCanvas（旧设备）→ 画布 + toBlob（异步）。
const ENCODER_SRC =
  "self.onmessage=function(e){var d=e.data;function enc(buf){var c=new OffscreenCanvas(d.W,d.H);c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buf),d.W,d.H),0,0);return c.convertToBlob({type:'image/png'});}" +
  "Promise.all([enc(d.mask),enc(d.glow)]).then(function(r){self.postMessage({id:d.id,a:r[0],b:r[1]});},function(err){self.postMessage({id:d.id,err:String(err)});});};";
let ENC = null; // null = 还没试 · false = 用不了 · { w, n, cb }
function encoder() {
  if (ENC !== null) return ENC;
  ENC = false;
  try {
    if (!HAS_DOM || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof ImageData === 'undefined' || !OffscreenCanvas.prototype.convertToBlob) return ENC;
    const w = new Worker(URL.createObjectURL(new Blob([ENCODER_SRC], { type: 'text/javascript' })));
    const cb = new Map();
    const fail = () => {
      ENC = false;
      for (const f of cb.values()) f({ err: 'worker' });
      cb.clear();
    };
    w.onmessage = (e) => {
      const f = cb.get(e.data?.id);
      cb.delete(e.data?.id);
      f?.(e.data);
    };
    w.onerror = fail;
    ENC = { w, n: 0, cb };
  } catch {
    ENC = false;
  }
  return ENC;
}

/** 像素 → 画布（主线程的编码路线 / 录帧的同步编码用） */
function toCanvases(sp) {
  const mk = (img) => {
    const c = document.createElement('canvas');
    c.width = sp.W;
    c.height = sp.H * sp.F;
    c.getContext('2d')?.putImageData(img, 0, 0);
    return c;
  };
  return { mask: mk(sp.pixels.mask), glow: mk(sp.pixels.glow) };
}

/** 像素已经交给 worker（或丢了）：用留着的噪声场再画一次（只在 worker 失败 / 录帧中途切手动时发生） */
function repaint(sp) {
  sp.pixels = null;
  const g = paintJob(sp);
  while (!g.next().done);
}

/** 画好的帧图 → URL。sync：toDataURL（录帧要确定）；否则 worker 编码，或画布 toBlob（都是异步，主线程不编码） */
function encodeSprite(sp, sync = false) {
  if (sp.url || sp.encoding === 'sync') return;
  if (sp.failed || !sp.v) {
    sp.resolve(sp);
    return;
  }
  if (sync) {
    if (!sp.pixels || sp.encoding === 'worker') repaint(sp);
    if (!sp.pixels) {
      sp.resolve(sp);
      return;
    }
    sp.encoding = 'sync';
    const { mask, glow } = toCanvases(sp);
    sp.url = mask.toDataURL('image/png');
    sp.glowUrl = glow.toDataURL('image/png');
    sp.pixels = null;
    sp.resolve(sp);
    return;
  }
  if (sp.encoding || !sp.pixels) return;
  const E = encoder();
  if (E) {
    sp.encoding = 'worker';
    const id = ++E.n;
    const { mask, glow } = sp.pixels;
    E.cb.set(id, (d) => {
      if (sp.url || sp.evicted) return sp.resolve(sp);
      if (d.err || !d.a || !d.b) {
        // 这台设备的 worker 编不了：以后都走主线程的画布路线；这一张重新画、再编
        ENC = false;
        sp.encoding = null;
        repaint(sp);
        return encodeSprite(sp);
      }
      sp.url = URL.createObjectURL(d.a);
      sp.glowUrl = URL.createObjectURL(d.b);
      sp.resolve(sp);
    });
    sp.pixels = null;
    E.w.postMessage({ id, W: sp.W, H: sp.H * sp.F, mask: mask.data.buffer, glow: glow.data.buffer }, [mask.data.buffer, glow.data.buffer]);
    return;
  }
  sp.encoding = 'blob';
  const { mask, glow } = toCanvases(sp);
  sp.pixels = null;
  if (typeof mask.toBlob !== 'function') {
    sp.url = mask.toDataURL('image/png');
    sp.glowUrl = glow.toDataURL('image/png');
    sp.resolve(sp);
    return;
  }
  Promise.all([new Promise((r) => mask.toBlob(r, 'image/png')), new Promise((r) => glow.toBlob(r, 'image/png'))]).then(([a, b]) => {
    if (!sp.url && a && b && !sp.evicted) {
      sp.url = URL.createObjectURL(a);
      sp.glowUrl = URL.createObjectURL(b);
    }
    sp.resolve(sp);
  });
}

/** 马上要（录帧）：剩下的步骤一口气做完、同步编码（还在路上的 worker / toBlob 不等） */
function finishSync(sp) {
  if (sp.url) return sp;
  if (sp.job) {
    try {
      while (!sp.job.next().done);
    } catch (e) {
      console.error('[fx]', e);
      sp.failed = true;
    }
    sp.job = null;
    const i = BUILDS.indexOf(sp);
    if (i >= 0) BUILDS.splice(i, 1);
  }
  if (!sp.url) {
    if (sp.encoding === 'blob') sp.encoding = null;
    encodeSprite(sp, true);
  }
  return sp;
}

/**
 * 拿（或开始建）遮罩帧图：{ W, H, F, v, order, e, url, glowUrl, pending }。
 *   sync：现在就要（同步做完 + toDataURL）· urgent：尽快（切片，不卡帧）· 默认：空闲时间里建（prepare）
 * url 还是 null = 还在建：等 pending（resolve 时 url 可能仍是 null = 建不出来，调用的人退回淡出）
 */
function erosion(W, H, ox0, oy0, { sync = false, urgent = false, seedN = 7, invert = false } = {}) {
  const [ox, oy] = snapOrigin(ox0, oy0);
  const key = `${W}x${H}:${ox}:${oy}:${seedN}${invert ? ':i' : ''}`;
  let sp = SPRITES.get(key);
  if (sp) {
    SPRITES.delete(key);
    SPRITES.set(key, sp); // LRU
  } else {
    sp = { W, H, F: ERODE_FRAMES, e: ERODE_E, v: null, order: null, url: null, glowUrl: null, pixels: null, job: null, urgent: false, encoding: null };
    sp.pending = new Promise((r) => (sp.resolve = r));
    sp.job = spriteJob(sp, ox, oy, seedN, invert);
    SPRITE_STATS.built++;
    SPRITES.set(key, sp);
    while (SPRITES.size > SPRITE_CAP) {
      const old = SPRITES.keys().next().value;
      const o = SPRITES.get(old);
      SPRITES.delete(old);
      if (!o) continue;
      o.evicted = true;
      const i = BUILDS.indexOf(o);
      if (i >= 0) BUILDS.splice(i, 1);
      o.resolve?.(o);
      if (o.url?.startsWith('blob:')) URL.revokeObjectURL(o.url);
      if (o.glowUrl?.startsWith('blob:')) URL.revokeObjectURL(o.glowUrl);
    }
    if (!sync) BUILDS.push(sp);
  }
  if (sp.url) return sp;
  if (sync) return finishSync(sp);
  if (urgent && !sp.urgent) {
    sp.urgent = true;
    const i = BUILDS.indexOf(sp);
    if (i > 0) {
      BUILDS.splice(i, 1);
      BUILDS.unshift(sp);
    }
  }
  scheduleBuilds();
  return sp;
}

/** 24 帧的遮罩 + 金边像素（一步 = 三帧）。只算像素（ImageData），编码另外做 */
function* paintJob(sp) {
  const { W, H, F, v, e } = sp;
  const N = W * H;
  const mi = new ImageData(W, H * F);
  const gi = new ImageData(W, H * F);
  // 大部分像素在一帧里不是全有就是全无：先整帧填「不透明」（原生 fill），只算前沿附近那一圈
  new Uint32Array(mi.data.buffer).fill(0xff000000);
  const md = mi.data;
  const gd = gi.data;
  for (let f = 0; f < F; f++) {
    const T = thresholdAt(f, F, e);
    const lo = T - e;
    const hi = T + e;
    const g0 = T + e * 1.2;
    const base = f * N * 4;
    for (let p = 0; p < N; p++) {
      const val = v[p];
      if (val >= hi + e * 3) continue; // 完全留着、也不在金边里
      const o = base + p * 4 + 3;
      if (val <= lo) {
        md[o] = 0;
        continue;
      }
      const a = val >= hi ? 1 : smooth(lo, hi, val);
      md[o] = Math.round(a * 255);
      const d = (val - g0) / (e * 1.1);
      const g = Math.exp(-d * d) * a;
      if (g > 0.004) {
        gd[o - 3] = gd[o - 2] = gd[o - 1] = 255;
        gd[o] = Math.round(g * 255);
      }
    }
    if (f % 3 === 2) yield;
  }
  sp.pixels = { mask: mi, glow: gi };
}

/** 提前生成帧图（挂载时）：在空闲时间里切片建好，真正溶解时就不用等。返回 pending（建好时 resolve） */
export function prepare(el, { origin, urgent = false } = {}) {
  if (!el || calm() || !HAS_DOM) return;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const [W, H] = spriteSize(r);
  const [ox, oy] = originFor(origin, r);
  return erosion(W, H, ox, oy, { urgent }).pending;
}

function setMask(el, url, F, f) {
  const st = el.style;
  const pos = `0 ${F > 1 ? (f / (F - 1)) * 100 : 0}%`;
  if (url !== undefined) {
    st.webkitMaskImage = st.maskImage = `url("${url}")`;
    st.webkitMaskSize = st.maskSize = `100% ${F * 100}%`;
    st.webkitMaskRepeat = st.maskRepeat = 'no-repeat';
  }
  st.webkitMaskPosition = st.maskPosition = pos;
}
function clearMask(el) {
  const st = el.style;
  if (!st) return;
  st.webkitMaskImage = st.maskImage = '';
  st.webkitMaskSize = st.maskSize = '';
  st.webkitMaskRepeat = st.maskRepeat = '';
  st.webkitMaskPosition = st.maskPosition = '';
}

/**
 * 离场：元素被一道不规则的前沿「吃掉」，前沿一圈细细的金光，被吃掉的地方冒出金尘往上飘、慢慢淡掉。
 *   origin 侵蚀从哪里开始 · from 金尘往哪里散（离开这一点 / 元素）· duration 420–800 · tone 'paper'|'photo'|'dusk'|'ash'
 *   dust 粒子密度 0–1.5 · drift 'up' | 'down'（ash 默认往下落）· hide 结束后 visibility:hidden（占位不变）
 */
export function dissolve(el, opts = {}) {
  if (!el || !HAS_DOM) return Promise.resolve();
  const { duration = 600, delay = 0, tone, dust: density = 1, drift, hide = true, glow = true, sound: snd = 'dissolve' } = opts;
  const T = toneOf(el, tone);
  if (calm()) {
    sayAfter(delay, snd, { size: 0 });
    keep(el, el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, delay, fill: 'forwards' }));
    return clock.wait(delay + 240).then(() => {
      if (hide) el.style.visibility = 'hidden';
    });
  }
  const up = (drift || (T === 'ash' ? 'down' : 'up')) === 'up';
  return new Promise((resolve) => {
    // 现在就开始建帧图（切片、不卡帧；同样大小、同一方向的卡共用一张，多半早就在缓存里）：开始的时候多半已经好了
    prepare(el, { origin: opts.origin, urgent: true });
    const run = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || !el.isConnected) return resolve();
      const [W, H] = spriteSize(r);
      const [ox, oy] = originFor(opts.origin, r);
      const sp = erosion(W, H, ox, oy, { sync: clock.manual, urgent: true }); // 录屏（手动时钟）要确定：同步
      // 帧图还在建 / 编码：等它一会儿；还没好（很卡的设备）就退回「淡出 + 一小撮金尘」—— 绝不在主线程上同步编码
      let started = false;
      const start = () => {
        if (started) return;
        started = true;
        if (sp.url) go(r, sp, ox, oy, W, H);
        else fade(r);
      };
      if (sp.url) start();
      else {
        sp.pending.then(start);
        clock.after(SPRITE_WAIT, start);
      }
    };
    /** 帧图来不及：整张淡出、往上飘 5 px，冒一小撮金尘（和正常的溶解同一个方向、同一个声音） */
    const fade = (r) => {
      if (!el.isConnected) return resolve();
      SPRITE_STATS.fades++;
      if (snd) say(snd, { size: r.width * r.height });
      const D = Math.min(duration, 420);
      const n = Math.round(dustBudget(r.width * r.height, density) * 0.45);
      for (let i = 0; i < n; i++) {
        const x = r.left + rnd() * r.width;
        const y = r.top + rnd() * r.height;
        dust.emit({ x, y, vx: rand(-14, 14), vy: up ? rand(-46, -16) : rand(10, 30), ay: up ? -14 : 40, drag: 1.3, life: rand(620, 1200), size: rand(0.55, 1.25), alpha: rand(0.7, 1), kind: K_DOT, color: pickCol(T, opts.colors), add: TONES[T]?.add, twinkle: rnd() < 0.18, wob: rand(4, 14), delay: rnd() * D * 0.8 });
      }
      keep(el, el.animate([{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: `0 ${up ? -5 : 4}px` }], { duration: D, easing: EASE.out.css, fill: 'forwards' }));
      clock.wait(D).then(() => {
        if (hide) el.style.visibility = 'hidden';
        resolve();
      });
    };
    const go = (r, sp, ox, oy, W, H) => {
      if (!el.isConnected) return resolve();
      const F = sp.F;
      setMask(el, sp.url, F, 0);
      // 元素自己的投影会被遮罩切掉：先把它收起来（像是从纸面上「松开」）
      const shadow = keep(el, el.animate([{ boxShadow: getComputedStyle(el).boxShadow || 'none' }, { boxShadow: 'none' }], { duration: 140, fill: 'forwards' }));
      let ember = null;
      if (glow && canHost(el)) {
        host(el);
        ember = document.createElement('i');
        ember.className = `fx-ember fx-${T}`;
        setMask(ember, sp.glowUrl, F, 0);
        el.appendChild(ember);
      }
      if (snd) say(snd, { size: r.width * r.height });
      const want = dustBudget(r.width * r.height, density);
      const total = W * H;
      const prob = want / total;
      const fromPt = opts.from ? centerOf(opts.from) : { x: r.left + ox * r.width, y: r.top + oy * r.height };
      let cursor = 0;
      const cw = r.width / W;
      const ch = r.height / H;
      // 跟着轻轻上浮几个像素（不是滑走：让「散开」有方向）
      const lift = keep(el, el.animate([{ translate: '0 0' }, { translate: `0 ${up ? -5 : 4}px` }], { duration, easing: EASE.out.css, fill: 'forwards' }));
      clock
        .tween({
          duration,
          ease: EASE.erode,
          update: (q) => {
            const f = Math.round(q * (F - 1));
            setMask(el, undefined, F, f);
            if (ember) setMask(ember, undefined, F, f);
            const Tq = lerp(-sp.e, 1 + sp.e, q);
            // 这一帧被吃掉的格子 → 按概率冒金尘
            while (cursor < total && sp.v[sp.order[cursor]] < Tq) {
              if (rnd() < prob) {
                const idx = sp.order[cursor];
                const x = r.left + ((idx % W) + rnd()) * cw;
                const y = r.top + (((idx / W) | 0) + rnd()) * ch;
                let dx = x - fromPt.x;
                let dy = y - fromPt.y;
                const len = Math.hypot(dx, dy) || 1;
                dx /= len;
                dy /= len;
                const v0 = rand(10, 42);
                const isMist = rnd() < 0.07;
                const isStar = !isMist && T === 'dusk' && rnd() < 0.06;
                dust.emit({
                  x,
                  y,
                  vx: dx * v0 + rand(-8, 8),
                  vy: dy * v0 * 0.6 + (up ? rand(-46, -16) : rand(10, 30)),
                  ay: up ? -14 : 40,
                  drag: 1.3,
                  life: isMist ? rand(900, 1500) : rand(620, 1350),
                  size: isMist ? rand(7, 13) : isStar ? rand(1.6, 2.4) : rnd() < 0.12 ? rand(1.3, 1.9) : rand(0.55, 1.25),
                  alpha: isMist ? rand(0.1, 0.18) : rand(0.75, 1),
                  kind: isMist ? K_MIST : isStar ? K_STAR : K_DOT,
                  color: isMist ? (T === 'paper' ? 'light' : T === 'ash' ? 'mist' : 'halo') : pickCol(T, opts.colors),
                  add: TONES[T]?.add,
                  twinkle: rnd() < 0.18,
                  wob: rand(4, 14),
                });
              }
              cursor++;
            }
          },
        })
        .then(() => {
          ember?.remove();
          if (!hide) {
            // 不隐藏：停在最后一帧（全透明、占位不变），等调用的人把它拿掉（或 fx.restore(el)）—— 不会闪回来
            resolve();
            return;
          }
          el.style.visibility = 'hidden';
          // 留着最后一帧（全透明）直到 visibility 生效，再拿掉遮罩：不会闪一下
          clock.after(30, () => {
            clearMask(el);
            shadow.cancel();
            lift.cancel();
            resolve();
          });
        });
    };
    clock.after(delay, run);
  });
}

/** 出场：金尘从四周聚拢到前沿，元素从 origin 那一侧开始长出来（dissolve 倒着放）。新出现的柜格（origin 'bottom'）、神灯出现 */
export function condense(el, opts = {}) {
  if (!el || !HAS_DOM) return Promise.resolve();
  const { duration = 560, delay = 0, tone, dust: density = 0.8, glow = true, sound: snd = 'condense' } = opts;
  const T = toneOf(el, tone);
  restore(el);
  if (calm()) {
    sayAfter(delay, snd);
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay, fill: 'backwards' });
    return clock.wait(delay + 240);
  }
  const r0 = el.getBoundingClientRect();
  if (!r0.width || !r0.height) return Promise.resolve();
  const [W, H] = spriteSize(r0);
  const [ox, oy] = originFor(opts.origin ?? 'center', r0);
  const sp = erosion(W, H, ox, oy, { sync: clock.manual, urgent: true, invert: true });
  const F = sp.F;
  // 先全透明：帧图好了 = 停在最后一帧的遮罩；还在建（很少：同样的卡多半早就在缓存里）= 先用 opacity 藏着，不同步编码
  let hold = null;
  if (sp.url) setMask(el, sp.url, F, F - 1);
  else hold = el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'forwards' });
  return new Promise((resolve) => {
    const fallback = () => {
      SPRITE_STATS.fades++;
      const D = Math.min(duration, 360);
      if (snd) say(snd);
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D, easing: EASE.out.css, fill: 'backwards' });
      hold?.cancel();
      hold = null;
      clock.wait(D).then(resolve);
    };
    const ready = (begin) => {
      if (sp.url) {
        if (hold) {
          setMask(el, sp.url, F, F - 1);
          hold.cancel();
          hold = null;
        }
        return begin();
      }
      let started = false;
      const go2 = () => {
        if (started) return;
        started = true;
        if (!sp.url) return fallback();
        setMask(el, sp.url, F, F - 1);
        hold?.cancel();
        hold = null;
        begin();
      };
      sp.pending.then(go2);
      clock.after(SPRITE_WAIT, go2);
    };
    clock.after(delay, () => ready(() => {
      const r = el.getBoundingClientRect();
      let ember = null;
      if (glow && canHost(el)) {
        host(el);
        ember = document.createElement('i');
        ember.className = `fx-ember fx-${T}`;
        setMask(ember, sp.glowUrl, F, F - 1);
        el.appendChild(ember);
      }
      if (snd) say(snd);
      const total = W * H;
      const prob = (clamp((r.width * r.height) / 420, 16, 160) * density) / total;
      const cw = r.width / W;
      const ch = r.height / H;
      // 粒子要「刚好」在格子出现时到达：提前 travel 毫秒在外面生出来，往里飞
      const travel = 420;
      let cursor = total - 1;
      clock
        .tween({
          duration,
          ease: bezier(0.3, 0, 0.4, 1),
          update: (q) => {
            const f = Math.round((1 - q) * (F - 1));
            setMask(el, undefined, F, f);
            if (ember) setMask(ember, undefined, F, f);
            const Tq = lerp(-sp.e, 1 + sp.e, 1 - Math.min(1, q + travel / duration));
            while (cursor >= 0 && sp.v[sp.order[cursor]] > Tq) {
              if (rnd() < prob) {
                const idx = sp.order[cursor];
                const tx = r.left + ((idx % W) + rnd()) * cw;
                const ty = r.top + (((idx / W) | 0) + rnd()) * ch;
                const a = rnd() * Math.PI * 2;
                const dist = rand(18, 46) * S();
                const life = travel * rand(0.85, 1.1);
                dust.emit({ x: tx + Math.cos(a) * dist, y: ty + Math.sin(a) * dist, vx: (-Math.cos(a) * dist) / (life / 1000) / S(), vy: (-Math.sin(a) * dist) / (life / 1000) / S(), drag: 0, life, size: rand(0.5, 1.2), color: pickCol(T), add: TONES[T]?.add, wob: 0 });
              }
              cursor--;
            }
          },
        })
        .then(() => {
          clearMask(el);
          ember?.remove();
          resolve();
        });
    }));
  });
}

// ───────────────────────────── (d) flight · mote · pulse ─────────────────────────────

function layerOf(opts) {
  const layer = opts.layer || (typeof config.layer === 'function' ? config.layer() : config.layer) || document.body;
  const lr = layer === document.body ? { left: 0, top: 0, width: window.innerWidth } : layer.getBoundingClientRect();
  const k = layer === document.body ? 1 : lr.width / (layer.offsetWidth || lr.width) || 1;
  return { layer, lr, k, fixed: layer === document.body };
}

/**
 * 替身离开了原来的祖先：把祖先链的 class 照抄成 display: contents 的空壳，后代选择器（.qz .pair-card img）和
 * 继承的颜色变量（.dusk）照样生效。context = 'auto' | false | 'class names'
 */
function ghostContext(el, context) {
  if (context === false || context === 'none') return null;
  if (typeof context === 'string' && context !== 'auto') {
    const d = document.createElement('div');
    d.className = `fx-ghost-ctx ${context}`;
    return { outer: d, inner: d };
  }
  const chain = [];
  for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement && chain.length < 14; a = a.parentElement) chain.push(a);
  if (!chain.length) return null;
  let outer = null;
  let inner = null;
  for (let i = chain.length - 1; i >= 0; i--) {
    const a = chain[i];
    const d = document.createElement('div');
    d.className = `fx-ghost-ctx ${a.getAttribute('class') || ''}`;
    const lang = a.getAttribute('lang');
    if (lang) d.setAttribute('lang', lang);
    // 行内的 CSS 变量（--glow 之类）也带上
    const st = a.style;
    if (st) for (let j = 0; j < st.length; j++) if (st[j].startsWith('--')) d.style.setProperty(st[j], st.getPropertyValue(st[j]));
    if (!outer) outer = d;
    else inner.appendChild(d);
    inner = d;
  }
  return { outer, inner };
}

/** 落地：目标轻轻「接住」（弹一下）+ 一圈光 + 几粒火花 */
export function pulse(target, { tone = 'paper', ring: withRing = true, sparks = 10, scale: s1 = 1.16 } = {}) {
  if (!target || !HAS_DOM) return;
  const c = centerOf(target);
  if (isEl(target) && target.animate && !calm()) {
    if (target instanceof SVGElement && target.ownerSVGElement) {
      target.style.transformBox = 'fill-box';
      target.style.transformOrigin = '50% 50%';
    }
    const sp = springEasing({ stiffness: 320, damping: 18 });
    target.animate([{ scale: String(s1) }, { scale: '1' }], { duration: sp.duration, easing: sp.easing });
  }
  if (calm()) {
    if (isEl(target) && target.animate) target.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.25)', offset: 0.3 }, { filter: 'brightness(1)' }], { duration: 300 });
    return;
  }
  const dk = tone === 'dusk';
  if (withRing) dust.ringAt(c.x, c.y, { r0: 4, r1: 34, duration: 560, width: 1.4, color: dk ? LIGHT.light : LIGHT.gold, alpha: 0.75, add: dk });
  for (let i = 0; i < sparks; i++) {
    const a = rand(0, Math.PI * 2);
    const v = rand(30, 90);
    dust.emit({ x: c.x, y: c.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, drag: 3, life: rand(360, 700), size: rand(0.6, 1.3), color: pickCol(dk ? 'dusk' : 'paper'), add: dk, twinkle: true });
  }
}

/**
 * 被选中的那一张抬起（1.045×，影子变深），沿往上拱的弧线飞到目标，一路洒一点金尘，越飞越小，
 * 到 62 % 化成一粒光（mote）飞完剩下的路，落地 = 目标「接住」（pulse + 'land' 声音，landNote = 第几块石头的音高）。
 * 用的是元素的 DOM 替身（cloneNode，不是截图）：清晰、便宜。
 */
export function fly(el, target, opts = {}) {
  if (!el || !target || !HAS_DOM) return Promise.resolve();
  const { delay = 0, arc = 0.32, lift = 1.045, tilt: tiltDeg = 7, tone = toneOf(el), trail = true, hideSource = true, endScale, sound: snd0 = 'fly', land = true, onLand } = opts;
  // 起飞的「呼」：刚按下去的那一张自己飞走时不响（选中的声音刚响过，SPEC §4：一下选择 = 选中 → 金尘 → 落地）。
  // 落地的音高（landSound，默认 'land' + landNote）和起飞分开：sound: null 只关掉起飞，sound: false 全部不响
  const landSnd = snd0 === false ? null : opts.landSound === undefined ? 'land' : opts.landSound;
  const snd = snd0 && !(snd0 === 'fly' && pressedRecently(el)) ? snd0 : null;
  if (calm()) {
    sayAfter(delay, snd, { distance: 0 });
    if (hideSource) keep(el, el.animate([{ opacity: 1 }, { opacity: 0.25 }], { duration: 200, delay, fill: 'forwards' }));
    return clock.wait(delay + 200).then(() => {
      if (land) {
        pulse(target, { tone, ring: false, sparks: 0 });
        if (landSnd) say(landSnd, opts.landNote);
        haptic('land');
      }
      onLand?.();
    });
  }
  return new Promise((resolve) => {
    clock.after(delay, () => {
      const sr = el.getBoundingClientRect();
      const tc = centerOf(target);
      const { layer, lr, k, fixed } = layerOf(opts);
      const dist = Math.hypot(tc.x - (sr.left + sr.width / 2), tc.y - (sr.top + sr.height / 2));
      const D = opts.duration ?? flightDuration(dist);
      const tr = tc.r || { width: 24, height: 24 };
      const s1 = endScale ?? clamp(Math.min(tr.width / (sr.width || 1), tr.height / (sr.height || 1)), 0.05, 1);
      // 替身
      const g = el.cloneNode(true);
      g.removeAttribute('id');
      g.removeAttribute('data-fx');
      g.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
      g.querySelectorAll('.fx-ink, .fx-ember').forEach((n) => n.remove());
      // 画布的内容不会被 cloneNode 带走：照着画一份
      const srcCanvases = el.querySelectorAll('canvas');
      g.querySelectorAll('canvas').forEach((c, i) => {
        try {
          c.getContext('2d')?.drawImage(srcCanvases[i], 0, 0);
        } catch {
          /* webgl / tainted */
        }
      });
      g.classList.add('fx-ghost');
      g.setAttribute('aria-hidden', 'true');
      g.style.transform = 'none';
      g.style.translate = 'none';
      g.style.scale = 'none';
      g.style.rotate = 'none';
      g.style.webkitMaskImage = g.style.maskImage = '';
      const w0 = el.offsetWidth || sr.width / k;
      const h0 = el.offsetHeight || sr.height / k;
      const x0 = (sr.left - lr.left) / k + (sr.width / k - w0) / 2;
      const y0 = (sr.top - lr.top) / k + (sr.height / k - h0) / 2;
      const cs = getComputedStyle(el);
      for (const p of ['background', 'borderRadius', 'boxShadow', 'color', 'font', 'padding', 'display', 'flexDirection', 'alignItems', 'justifyContent', 'gap', 'textAlign', 'border']) g.style[p] = cs[p];
      Object.assign(g.style, { position: fixed ? 'fixed' : 'absolute', left: `${x0}px`, top: `${y0}px`, width: `${w0}px`, height: `${h0}px`, margin: '0', boxSizing: 'border-box', visibility: 'visible', opacity: '1' });
      const ctxWrap = ghostContext(el, opts.context ?? 'auto');
      let mount = g;
      if (ctxWrap) {
        ctxWrap.inner.appendChild(g);
        mount = ctxWrap.outer;
      }
      // 路径：中心到中心（层坐标），控制点在中点往「上」拱
      const ax = x0 + w0 / 2;
      const ay = y0 + h0 / 2;
      const bx = (tc.x - lr.left) / k;
      const by = (tc.y - lr.top) / k;
      const ctl = arcControl({ x: ax, y: ay - 6 }, { x: bx, y: by }, arc);
      const LIFT = 0.16; // 前 16 %：原地抬起
      const sgn = Math.sign(bx - ax) || 1;
      const pose = (t) => {
        if (t <= LIFT) {
          const q = EASE.out(t / LIFT);
          return { x: ax, y: ay - 6 * q, s: lerp(1, lift, q), r: 0, o: 1, b: 1 };
        }
        const u = (t - LIFT) / (1 - LIFT);
        const q = EASE.inOut(u);
        const x = quad(ax, ctl.x, bx, q);
        const y = quad(ay - 6, ctl.y, by, q);
        const s = lerp(lift, s1, EASE.inOut(Math.min(1, u * 1.08)));
        const r = sgn * tiltDeg * Math.sin(Math.PI * Math.min(1, u * 1.1)) * (1 - u);
        // 最后一段：实物变成光 —— 越来越亮、越来越透明，交给一粒光（mote）落进目标
        const o = u < 0.58 ? 1 : 1 - EASE.inOut(Math.min(1, (u - 0.58) / 0.3));
        const b = 1 + 0.55 * smooth(0.4, 0.8, u);
        return { x, y, s, r, o, b };
      };
      const K = 40;
      const frames = [];
      for (let i = 0; i <= K; i++) {
        const p = pose(i / K);
        frames.push({ offset: i / K, transform: `translate(${(p.x - ax).toFixed(2)}px, ${(p.y - ay).toFixed(2)}px) rotate(${p.r.toFixed(2)}deg) scale(${p.s.toFixed(4)})`, opacity: p.o, filter: `brightness(${p.b.toFixed(3)})` });
      }
      layer.appendChild(mount);
      g.animate(frames, { duration: D, easing: 'linear', fill: 'both' });
      g.animate([{ boxShadow: cs.boxShadow }, { boxShadow: SHADOW_LIFT, offset: 0.2 }, { boxShadow: SHADOW_LAND }], { duration: D, fill: 'both' });
      if (hideSource) {
        el.style.visibility = 'hidden';
        keep(el, { cancel: () => (el.style.visibility = '') });
      }
      if (snd) say(snd, { distance: dist });
      const t0 = clock.now();
      let lx = null;
      let ly = null;
      const stop = trail
        ? clock.hook(() => {
            const t = (clock.now() - t0) / D;
            if (t >= 0.97) return false;
            if (t <= LIFT) return true;
            const p = pose(t);
            const x = lr.left + p.x * k;
            const y = lr.top + p.y * k;
            for (let i = 0; i < 3; i++) {
              const f = rnd();
              dust.emit({ x: lerp(lx ?? x, x, f) + rand(-1, 1) * w0 * p.s * k * 0.3, y: lerp(ly ?? y, y, f) + rand(-1, 1) * h0 * p.s * k * 0.3, vx: rand(-10, 10), vy: rand(-20, 6), drag: 2.2, life: rand(420, 820), size: rand(0.5, 1.15), color: pickCol(tone), add: TONES[tone]?.add, twinkle: rnd() < 0.25 });
            }
            lx = x;
            ly = y;
            return true;
          })
        : null;
      // 实物 → 光：在 62 % 的位置接一颗彗星，剩下的路由它飞完，落地那一下 = 彗星到达
      const T_LIGHT = 0.62;
      clock.after(D * T_LIGHT, () => {
        const p = pose(T_LIGHT);
        const p2 = pose(Math.min(1, T_LIGHT + 0.12));
        const sx = lr.left + p.x * k;
        const sy = lr.top + p.y * k;
        const tx = lr.left + p2.x * k;
        const ty = lr.top + p2.y * k;
        const ex = lr.left + bx * k;
        const ey = lr.top + by * k;
        dust.comet({
          t0: clock.now(),
          dur: D * (1 - T_LIGHT),
          size: 3.2,
          tone,
          trail: 2,
          ease: EASE.out,
          at: (q) => ({ x: quad(sx, tx, ex, q), y: quad(sy, ty, ey, q) }),
          done: () => {
            if (land) {
              pulse(target, { tone });
              if (landSnd) say(landSnd, opts.landNote);
              haptic('land');
            }
            onLand?.();
          },
        });
      });
      clock.after(D + 30, () => {
        stop?.();
        mount.remove();
        resolve();
      });
    });
  });
}

/** 进度石的第几块（.stone 在列表里的位置），或目标上写的 data-fx-land="2"：落地的音高 = D E F♯ A B 的第几级。不是进度石 = null */
function landStep(to) {
  if (!isEl(to)) return null;
  const tag = to.closest?.('[data-fx-land]');
  if (tag) {
    const n = Number(tag.getAttribute('data-fx-land'));
    return Number.isFinite(n) ? n : 0;
  }
  const li = to.closest?.('.stone');
  if (!li || !li.parentElement) return null;
  const i = [...li.parentElement.children].filter((n) => n.classList?.contains('stone')).indexOf(li);
  return i < 0 ? null : i;
}

/**
 * 一粒光（只画在画布上）：从 a 飞到 b，带金尘尾巴；到了 → pulse(b)。选项 → 进度石、愿望 → 神灯。
 * 声音：出发不响（按下去的那一声已经够了）；落进进度石时响那一块石头的音高（land，D E F♯ A B 一级一级往上 = 进度的旋律）。
 * sound: 'mote' = 出发也响一声 · landSound / landNote：别的目标也要落地声时自己给
 */
export function mote(from, to, opts = {}) {
  if (!HAS_DOM || !from || !to) return Promise.resolve();
  const { delay = 0, arc = 0.35, size = 3, tone = isEl(from) ? toneOf(from) : 'paper', trail = 2, sound: snd = null, land = true, onLand } = opts;
  const step = opts.landNote ?? landStep(to);
  const landSnd = snd === false ? null : opts.landSound !== undefined ? opts.landSound : step != null ? 'land' : null;
  const arrive = () => {
    if (landSnd) say(landSnd, step ?? undefined);
  };
  if (calm()) {
    sayAfter(delay, snd);
    return clock.wait(delay + 120).then(() => {
      if (land && isEl(to)) pulse(to, { tone, ring: false, sparks: 0 });
      arrive();
      onLand?.();
    });
  }
  return new Promise((resolve) => {
    clock.after(delay, () => {
      const a = centerOf(from);
      const b = centerOf(to);
      const ctl = arcControl(a, b, arc);
      if (snd) say(snd);
      dust.comet({
        t0: clock.now(),
        dur: opts.duration ?? moteDuration(ctl.L),
        size,
        tone,
        trail,
        ease: opts.ease || EASE.inOut,
        at: (q) => ({ x: quad(a.x, ctl.x, b.x, q), y: quad(a.y, ctl.y, b.y, q) }),
        done: () => {
          if (land) pulse(isEl(to) ? to : b, { tone });
          arrive();
          onLand?.();
          resolve();
        },
      });
    });
  });
}

// ───────────────────────────── bursts · rings · sparks ─────────────────────────────

/** 一圈火花（揭晓、召唤、愿望成真）：细金尘为主，少量四角星，一圈很淡的光环。rect = 从一张牌的四条边往外迸 */
export function burst(x, y, { count = 48, speed = [70, 240], life = [700, 1500], tone = 'dusk', stars = 0.14, ring: withRing = true, spread = Math.PI * 2, dir = -Math.PI / 2, gravity = 18, radius = 0, rect = null } = {}) {
  if (calm() || !HAS_DOM) return;
  const add = TONES[tone]?.add;
  const per = rect ? 2 * (rect.width + rect.height) : 0;
  for (let i = 0; i < count; i++) {
    let a = dir + (rnd() - 0.5) * spread;
    const v = rand(speed[0], speed[1]);
    const star = rnd() < stars;
    let px;
    let py;
    if (rect) {
      let d = rnd() * per;
      if (d < rect.width) {
        px = rect.left + d;
        py = rect.top;
        a = -Math.PI / 2;
      } else if ((d -= rect.width) < rect.height) {
        px = rect.left + rect.width;
        py = rect.top + d;
        a = 0;
      } else if ((d -= rect.height) < rect.width) {
        px = rect.left + rect.width - d;
        py = rect.top + rect.height;
        a = Math.PI / 2;
      } else {
        d -= rect.width;
        px = rect.left;
        py = rect.top + rect.height - d;
        a = Math.PI;
      }
      a += rand(-0.55, 0.55);
    } else {
      const r0 = radius * Math.sqrt(rnd());
      px = x + Math.cos(a) * r0;
      py = y + Math.sin(a) * r0;
    }
    dust.emit({ x: px, y: py, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ay: gravity, drag: 2.1, life: rand(life[0], life[1]), size: star ? rand(1.8, 3) : rand(0.6, 1.5), kind: star ? K_STAR : K_DOT, color: pickCol(tone), add, twinkle: true, wob: rand(2, 10) });
  }
  if (withRing) dust.ringAt(x, y, { r0: rect ? Math.max(rect.width, rect.height) * 0.45 : 10, r1: rect ? Math.max(rect.width, rect.height) * 0.95 : 150, duration: 1000, width: 1.2, color: add ? LIGHT.light : LIGHT.gold, alpha: 0.45, add });
}
export function ring(x, y, opts = {}) {
  if (calm() || !HAS_DOM) return;
  dust.ringAt(x, y, opts);
}
/** 画布上的一粒（场景自己用：擦神灯的火花、扫描线上的闪光） */
export function spark(x, y, o = {}) {
  if (calm() || !HAS_DOM) return;
  const tone = o.tone || 'paper';
  dust.emit({ x, y, vx: o.vx ?? rand(-20, 20), vy: o.vy ?? rand(-40, -10), ay: o.ay ?? 0, drag: o.drag ?? 2, life: o.life ?? rand(400, 900), size: o.size ?? rand(0.6, 1.3), kind: o.star ? K_STAR : o.mist ? K_MIST : K_DOT, color: o.color || pickCol(tone), add: o.add ?? TONES[tone]?.add, twinkle: o.twinkle ?? true, alpha: o.alpha ?? 1 });
}

// ───────────────────────────── (e) numbers ─────────────────────────────

export const fmtInt = (n) => Math.round(n).toLocaleString('en-US');

/** 文字数字从 from 数到 to（等宽数字）。tick = 每跳一个整数响一下（≥ 40 ms 一次） */
export function countUp(el, to, { from, duration = 900, delay = 0, ease = EASE.out, format = fmtInt, tick = false } = {}) {
  if (!el) return Promise.resolve();
  const a = from ?? (parseFloat(String(el.textContent).replace(/[^\d.-]/g, '')) || 0);
  if (calm()) {
    el.textContent = format(to);
    return Promise.resolve();
  }
  if (el.style) el.style.fontVariantNumeric = 'tabular-nums';
  let last = Math.round(a);
  let lastTick = -1e9;
  el.textContent = format(a);
  return clock.tween({
    duration,
    delay,
    ease,
    update: (q) => {
      const v = lerp(a, to, q);
      el.textContent = format(v);
      const i = Math.round(v);
      if (tick && i !== last && clock.now() - lastTick > 40) {
        lastTick = clock.now();
        say('tick', { value: i, up: to > a });
      }
      last = i;
    },
  });
}

/**
 * 里程表每一位的位置（纯函数）：个位连续转；高位只在低位从 …9 走到 …0 的那一下跟着转一格（机械进位）。
 * 返回从高到低每一位的「格」位置（0–10，10 = 又回到 0）
 */
export function odometerPositions(value, nDigits) {
  const av = Math.abs(value);
  const out = [];
  for (let i = 0; i < nDigits; i++) {
    const k = nDigits - 1 - i;
    const p = Math.pow(10, k);
    if (k === 0) out.push(av % 10);
    else out.push((Math.floor(av / p) % 10) + clamp((av % p) - (p - 1), 0, 1));
  }
  return out;
}

/**
 * 机械里程表：odometer(el, value) 第一次把 el 的内容换成数字条（不动）；之后每次给新值就滚过去。
 * format：数字 → 字符串（默认千分位）；只有数字位会滚。读屏读最终的数（aria-label + 隐藏文字）。
 */
export function odometer(el, value, { duration, delay = 0, format = fmtInt, tick = true } = {}) {
  if (!el || !HAS_DOM) return Promise.resolve();
  let st = el.__odo;
  const target = Math.round(value);
  if (!st || !el.querySelector(':scope > .fx-odo-col, :scope > .fx-odo-sep')) {
    st = el.__odo = { value: target, shown: target, tween: 0 };
    buildOdo(el, format(target));
    renderOdo(el, target);
    labelOdo(el, format(target));
    return Promise.resolve();
  }
  if (calm()) {
    st.value = st.shown = target;
    st.tween++;
    buildOdo(el, format(target));
    renderOdo(el, target);
    labelOdo(el, format(target));
    return Promise.resolve();
  }
  const from = st.shown;
  st.value = target;
  labelOdo(el, format(target));
  const id = ++st.tween;
  const D = duration ?? odometerDuration(target - from);
  let last = Math.round(from);
  let lastTick = -1e9;
  return clock.tween({
    duration: D,
    delay,
    ease: EASE.out,
    update: (q) => {
      if (st.tween !== id) return; // 被新的值接手了（滑杆拖动）：从当前显示的数继续
      const v = lerp(from, target, q);
      st.shown = v;
      const str = format(Math.round(v));
      if (el.__odoLen !== str.length) buildOdo(el, str);
      renderOdo(el, v);
      const i = Math.round(v);
      if (tick && i !== last && clock.now() - lastTick > 45) {
        lastTick = clock.now();
        say('tick', { value: i, up: target > from });
      }
      last = i;
    },
  });
}
function labelOdo(el, str) {
  el.setAttribute('aria-label', str);
  let sr = el.querySelector(':scope > .fx-odo-sr');
  if (!sr) {
    sr = document.createElement('span');
    sr.className = 'fx-odo-sr';
    el.appendChild(sr);
  }
  sr.textContent = str;
}
function buildOdo(el, str) {
  el.classList.add('fx-odo');
  el.__odoLen = str.length;
  const sr = el.querySelector(':scope > .fx-odo-sr');
  el.textContent = '';
  for (const ch of str) {
    if (/\d/.test(ch)) {
      const col = document.createElement('span');
      col.className = 'fx-odo-col';
      col.setAttribute('aria-hidden', 'true');
      const strip = document.createElement('span');
      strip.className = 'fx-odo-strip';
      for (let d = 0; d <= 10; d++) {
        const c = document.createElement('span');
        c.textContent = String(d % 10);
        strip.appendChild(c);
      }
      col.appendChild(strip);
      el.appendChild(col);
    } else {
      const s = document.createElement('span');
      s.className = 'fx-odo-sep';
      s.setAttribute('aria-hidden', 'true');
      s.textContent = ch;
      el.appendChild(s);
    }
  }
  if (sr) el.appendChild(sr);
}
function renderOdo(el, v) {
  const cols = el.querySelectorAll(':scope > .fx-odo-col');
  const pos = odometerPositions(v, cols.length);
  for (let i = 0; i < cols.length; i++) cols[i].firstChild.style.transform = `translate3d(0, ${(-pos[i] * 100) / 11}%, 0)`;
}

// ───────────────────────────── (f) progress: light along the stream ─────────────────────────────

/**
 * 一束光沿溪流走：SVG 里多画一段亮的「水光」（stroke-dasharray 的一小段往前移）+ 画布上一颗彗星头和金尘尾巴。
 *   path = 溪流的 <path>（Stones.jsx 的 .stream-b）；from / to = 0–1 路程比例 | { x } 屏幕横坐标 | 元素（取它的中心 x）
 */
export function streamLight(path, { from = 0, to = 1, duration = 900, delay = 0, tone, sound: snd = 'stream', onArrive } = {}) {
  if (!path || !HAS_DOM || typeof path.getTotalLength !== 'function') return Promise.resolve();
  const T = toneOf(path, tone);
  const len = path.getTotalLength();
  const toLen = (v) => {
    if (typeof v === 'number') return clamp(v, 0, 1) * len;
    const x = isEl(v) ? centerOf(v).x : v.x;
    let lo = 0; // 屏幕横坐标 → 路程：二分找
    let hi = len;
    const m = path.getScreenCTM();
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      const p = path.getPointAtLength(mid);
      if (m.a * p.x + m.c * p.y + m.e < x) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  if (snd) clock.after(delay, () => say(snd, { duration }));
  if (calm()) return clock.wait(delay + 200).then(() => onArrive?.());
  const L0 = toLen(from);
  const L1 = toLen(to);
  const svg = path.ownerSVGElement;
  const lit = path.cloneNode(false);
  lit.removeAttribute('id');
  lit.setAttribute('class', `fx-streamlit fx-${T}`);
  lit.setAttribute('aria-hidden', 'true');
  const seg = Math.max(18, Math.abs(L1 - L0) * 0.38);
  // 虚线长度按路径自己的单位（和 getPointAtLength 一致）；线宽换算回屏幕上的 ≈ 3.2 px（溪流多半是横的：看纵向的缩放）
  const cm = path.getScreenCTM();
  const sy = cm ? Math.hypot(cm.c, cm.d) || 1 : 1;
  lit.style.strokeWidth = `${(3.2 / sy).toFixed(3)}`;
  lit.style.strokeDasharray = `${seg} ${len * 2}`;
  lit.style.strokeDashoffset = `${-L0 + seg}`;
  lit.style.opacity = '0';
  (path.parentNode || svg).appendChild(lit);
  const toScreen = (l) => {
    const p = path.getPointAtLength(l);
    const m = path.getScreenCTM();
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  };
  return new Promise((resolve) => {
    dust.comet({ t0: clock.now() + delay, dur: duration, size: 2.6, tone: T === 'dusk' ? 'dusk' : 'paper', trail: 2, ease: EASE.inOut, at: (q) => toScreen(lerp(L0, L1, q)) });
    clock
      .tween({
        duration,
        delay,
        ease: EASE.inOut,
        update: (q) => {
          lit.style.strokeDashoffset = `${-(lerp(L0, L1, q) - seg)}`;
          lit.style.opacity = String(q < 0.85 ? 1 : 1 - (q - 0.85) / 0.15);
        },
      })
      .then(() => {
        lit.remove();
        onArrive?.();
        resolve();
      });
  });
}

// ───────────────────────────── (g) card flip ─────────────────────────────

const HOLDS = HAS_DOM ? new WeakMap() : null;
/** rotateY 的角度和计算后的 transform 对得上吗（看 cos：m11） */
function sameTurn(transform, deg) {
  let m11 = 1;
  if (transform && transform !== 'none') {
    const n = transform.match(/-?[\d.]+(?:e-?\d+)?/g);
    if (n) m11 = +n[0];
  }
  return Math.abs(m11 - Math.cos((deg * Math.PI) / 180)) < 0.08;
}
/**
 * 翻完以后先用行内样式「按住」最后的角度，等 .flip 拿到 .is-flipped / .is-flat（React 的状态）再交还给 CSS ——
 * 交还的时候过渡是关着的（.fx-flipping），不会再转一遍。
 */
function holdFlip(inner, to) {
  HOLDS.get(inner)?.();
  inner.style.transform = `rotateY(${to}deg)`;
  const parent = inner.parentElement;
  let mo = null;
  let raf = 0;
  const release = () => {
    mo?.disconnect();
    mo = null;
    HOLDS.delete(inner);
  };
  const check = () => {
    if (!inner.isConnected) return release();
    const keepT = inner.style.transform;
    const flat = parent?.classList.contains('is-flat');
    inner.style.transform = '';
    const ok = flat || sameTurn(getComputedStyle(inner).transform, to); // 读一次：样式在过渡关着的时候就生效
    if (!ok) {
      inner.style.transform = keepT;
      return;
    }
    release();
    inner.classList.remove('fx-flipping');
  };
  if (parent && typeof MutationObserver === 'function') {
    mo = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(check);
    });
    mo.observe(parent, { attributes: true, attributeFilter: ['class'] });
  }
  HOLDS.set(inner, () => {
    cancelAnimationFrame(raf);
    release();
  });
  clock.after(48, check);
}

/**
 * 翻牌：角度走一条弹簧（多翻 4–6° 再回来），牌被托起一点；每一面盖一层「明暗」（侧过去变暗）和一道镜面高光，
 * 牌边是烫金的（侧面对着人的那一下会亮）。inner = .flip-inner（里面有 .flip-back / .flip-front）
 */
export function flip(inner, { from = 0, to = 180, stiffness = 64, damping = 12, lift = 0.07, tone = 'dusk', edges = true, thickness = 3, sound: snd = 'flip', delay = 0 } = {}) {
  if (!inner || !HAS_DOM) return Promise.resolve();
  HOLDS.get(inner)?.();
  const back = inner.querySelector(':scope > .flip-back');
  const front = inner.querySelector(':scope > .flip-front');
  inner.classList.add('fx-flipping');
  if (calm()) {
    return clock.wait(delay).then(() => {
      if (snd) say(snd);
      const face = to % 360 ? front : back;
      holdFlip(inner, to);
      face?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
      if (snd) clock.after(240, () => say('flipLand'));
      return clock.wait(260);
    });
  }
  const sp = springCurve({ stiffness, damping });
  const D = sp.duration;
  const angle = (ms) => from + (to - from) * sp.at(ms);
  const layers = [];
  for (const [face, isFront] of [
    [back, false],
    [front, true],
  ]) {
    if (!face) continue;
    const card = face.firstElementChild || face;
    if (!canHost(card)) continue;
    // 明暗 + 高光放进牌面自己的效果层（圆角裁切）：高光带比牌高，不能露到牌外面
    const ink = inkOf(card);
    const shade = document.createElement('i');
    shade.className = 'fx-shade';
    const spec = document.createElement('i');
    spec.className = `fx-spec fx-${tone}`;
    ink.appendChild(shade);
    ink.appendChild(spec);
    layers.push({ isFront, shade, spec });
  }
  const edgeEls = [];
  if (edges) {
    for (const side of ['l', 'r']) {
      const e = document.createElement('i');
      e.className = `fx-edge3d is-${side}`;
      e.setAttribute('aria-hidden', 'true');
      e.style.setProperty('--t', `${thickness}px`);
      inner.appendChild(e);
      edgeEls.push(e);
    }
  }
  const N = Math.max(12, Math.round(D / 16));
  const fr = [];
  const lf = layers.map(() => ({ shade: [], spec: [] }));
  for (let i = 0; i <= N; i++) {
    const ms = (D * i) / N;
    const th = angle(ms);
    const s = 1 + lift * Math.sin(Math.PI * clamp((ms / D) * 2.2, 0, 1));
    fr.push({ offset: i / N, transform: `rotateY(${th.toFixed(2)}deg) scale(${s.toFixed(4)})` });
    layers.forEach((L, j) => {
      // 这一面「朝向」观众的程度：0 = 正对，90 = 侧过去
      const local = L.isFront ? Math.abs(180 - th) : Math.abs(th);
      const turn = clamp(local / 90, 0, 1);
      lf[j].shade.push({ offset: i / N, opacity: (Math.pow(turn, 1.4) * 0.5).toFixed(3) });
      // 高光：背面在 0→80° 之间扫过；正面在 100→180° 之间扫过
      const sweep = L.isFront ? clamp((th - 100) / 80, 0, 1.2) : clamp(th / 80, 0, 1);
      const o = Math.sin(Math.PI * clamp(sweep, 0, 1)) * (1 - turn * 0.4);
      lf[j].spec.push({ offset: i / N, transform: `translate3d(${lerp(-70, 150, sweep).toFixed(1)}%,0,0) skewX(-16deg)`, opacity: o.toFixed(3) });
    });
  }
  return new Promise((resolve) => {
    clock.after(delay, () => {
      const anims = [inner.animate(fr, { duration: D, easing: 'linear', fill: 'both' })];
      layers.forEach((L, j) => {
        L.shade.animate(lf[j].shade, { duration: D, easing: 'linear', fill: 'both' });
        L.spec.animate(lf[j].spec, { duration: D, easing: 'linear', fill: 'both' });
      });
      if (snd) say(snd);
      let tLand = D * 0.5; // 落定那一下（第一次过终点角度）
      for (let ms = 0; ms < D; ms += 8)
        if (Math.abs(angle(ms) - from) >= Math.abs(to - from) - 0.5) {
          tLand = ms;
          break;
        }
      if (snd) clock.after(tLand, () => say('flipLand'));
      clock.after(D + 20, () => {
        holdFlip(inner, to);
        for (const a of anims) a.cancel();
        for (const L of layers) {
          L.shade.remove();
          L.spec.remove();
        }
        for (const e of edgeEls) e.remove();
        resolve();
      });
    });
  });
}

// ───────────────────────────── (h) reveal · tilt · stamp · nope ─────────────────────────────

/**
 * 揭晓的峰值（翻牌开始后 ≈ 520 ms 调）：从牌的四条边迸出火花 + 徽章上的慢星 + 牌后的暖光亮到 1 + 全息光扫过正面 + 'reveal'。
 *   card = 牌的外框（量位置）· front = 正面（全息光）· bloom = 牌后的暖光元素（可选）· emblem = 徽章（可选）
 */
export function reveal(card, { front, bloom, emblem, tone = 'dusk', delay = 0, count = 110, holo: withHolo = true, duration = 1250, sound: snd = 'reveal' } = {}) {
  if (!card || !HAS_DOM) return Promise.resolve();
  return new Promise((resolve) => {
    clock.after(delay, () => {
      const r = card.getBoundingClientRect();
      if (snd) say(snd);
      haptic('reveal');
      if (bloom?.animate) keep(bloom, bloom.animate([{ opacity: getComputedStyle(bloom).opacity }, { opacity: 1 }], { duration: calm() ? 300 : 900, easing: EASE.out.css, fill: 'forwards' }));
      if (!calm() && r.width) {
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        burst(cx, cy, { count, tone, speed: [40, 170], life: [800, 1700], rect: r, stars: 0.12, gravity: -6 });
        const e = emblem ? centerOf(emblem) : { x: cx, y: r.top + r.height * 0.32 };
        burst(e.x, e.y, { count: 26, tone, speed: [30, 120], radius: 40, stars: 0.3, ring: false, gravity: -10 });
      }
      const face = front || card;
      (withHolo ? holo(face, { delay: 160, duration, sound: null }) : clock.wait(0)).then(resolve);
    });
  });
}

/**
 * 揭晓之后：手指在牌上移动 = 牌跟着倾斜（±max°），珠光跟着手指走；松开 = 弹簧回正（170 / 18）；点一下 = 再扫一次全息光。
 *   card = 接手指的那一层（会设 touch-action: none）· target = 被倾斜的那一层（不要有自己的 CSS transform；默认 card）
 *   sheen = true（在 target 里加一层）| 元素（在它里面加）| false · tapHolo = 点一下扫全息光的那一面（默认 sheen 的宿主）
 */
export function tilt(card, { target, sheen = true, max = 7, maxX = 6, tapHolo } = {}) {
  if (!card || !HAS_DOM) return noop;
  const face = target || card;
  const sheenHost = isEl(sheen) ? sheen : sheen ? face : null;
  let sh = null;
  if (sheenHost && canHost(sheenHost)) {
    sh = document.createElement('i');
    sh.className = 'fx-sheen';
    inkOf(sheenHost).appendChild(sh);
  }
  const holoFace = tapHolo === false ? null : tapHolo || sheenHost || face;
  const prevTouch = card.style.touchAction;
  const prevSelect = card.style.webkitUserSelect;
  card.style.touchAction = 'none';
  card.style.webkitUserSelect = card.style.userSelect = 'none'; // 拖着倾斜时不要选中文字
  let back = null;
  let on = false;
  let downAt = null;
  const move = (e) => {
    if (calm()) return;
    if (e.pointerType !== 'mouse' && !downAt) return;
    const r = card.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width, 0, 1);
    const y = clamp((e.clientY - r.top) / r.height, 0, 1);
    back?.cancel();
    back = null;
    face.style.transform = `perspective(1000px) rotateY(${((x - 0.5) * 2 * max).toFixed(2)}deg) rotateX(${((0.5 - y) * 2 * maxX).toFixed(2)}deg)`;
    if (sh) {
      sh.style.setProperty('--hx', `${(x * 100).toFixed(1)}%`);
      sh.style.setProperty('--hy', `${(y * 100).toFixed(1)}%`);
      sh.style.opacity = '0.85';
    }
    on = true;
  };
  const leave = () => {
    downAt = null;
    if (!on) return;
    on = false;
    const from = face.style.transform || 'none';
    face.style.transform = '';
    const sp = springEasing({ stiffness: 170, damping: 18 });
    back = face.animate([{ transform: from }, { transform: 'perspective(1000px)' }], { duration: sp.duration, easing: sp.easing });
    if (sh) sh.style.opacity = '0';
  };
  const down = (e) => {
    downAt = { x: e.clientX, y: e.clientY };
    move(e);
  };
  const up = (e) => {
    const d = downAt;
    leave();
    if (d && holoFace && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 10) holo(holoFace, { duration: 1000 });
  };
  const outMouse = (e) => e.pointerType === 'mouse' && leave();
  card.addEventListener('pointerdown', down);
  card.addEventListener('pointermove', move);
  card.addEventListener('pointerup', up);
  card.addEventListener('pointercancel', leave);
  card.addEventListener('pointerleave', outMouse);
  return () => {
    card.removeEventListener('pointerdown', down);
    card.removeEventListener('pointermove', move);
    card.removeEventListener('pointerup', up);
    card.removeEventListener('pointercancel', leave);
    card.removeEventListener('pointerleave', outMouse);
    card.style.touchAction = prevTouch;
    card.style.webkitUserSelect = card.style.userSelect = prevSelect || '';
    face.style.transform = '';
    sh?.remove();
  };
}

/** 盖章（潘吉认证）：从 1.35 倍弹簧压下来 + 一圈印泥光 + 8 粒灰；'stamp' 声音 + 触感 */
export function stamp(el, { from = 1.35, delay = 0, grains = 8, sound: snd = 'stamp', buzz = 'stamp' } = {}) {
  if (!el || !HAS_DOM) return Promise.resolve();
  return clock.wait(delay).then(() => {
    if (snd) say(snd);
    if (buzz) haptic(buzz);
    el.style.visibility = '';
    if (calm()) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
      return clock.wait(180);
    }
    const sp = springEasing({ stiffness: 420, damping: 22 });
    el.animate([{ scale: String(from) }, { scale: '1' }], { duration: sp.duration, easing: sp.easing });
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: EASE.out.css });
    // 印泥的那一圈：落下的那一刻（≈ 120 ms）才扩散
    clock.after(110, () => {
      const r = el.getBoundingClientRect();
      const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const R = Math.max(r.width, r.height) / 2;
      dust.ringAt(c.x, c.y, { r0: R * 0.9, r1: R + 8, duration: 520, width: 2, color: LIGHT.seal, alpha: 0.4 });
      for (let i = 0; i < grains; i++) {
        const a = rand(0, Math.PI * 2);
        dust.emit({ x: c.x + Math.cos(a) * R, y: c.y + Math.sin(a) * R, vx: Math.cos(a) * rand(20, 50), vy: Math.sin(a) * rand(20, 50), ay: 30, drag: 2.6, life: rand(420, 760), size: rand(0.6, 1.1), color: pickCol('ash'), twinkle: false });
      }
    });
    return clock.wait(sp.duration);
  });
}

/** 那一声温柔的「不行」（第 4 个愿望）：±6 px 摇一下 + 'nope' 声音 + 触感。不是蜂鸣器 */
export function nope(el, { amp = 6, sound: snd = 'nope', buzz = 'nope' } = {}) {
  if (snd) say(snd);
  if (buzz) haptic(buzz);
  if (!el || !HAS_DOM || calm() || !el.animate) return Promise.resolve();
  el.animate([{ translate: '0 0' }, { translate: `${-amp}px 0` }, { translate: `${amp * 0.84}px 0` }, { translate: `${-amp * 0.5}px 0` }, { translate: `${amp * 0.2}px 0` }, { translate: '0 0' }], { duration: 320, easing: 'ease-out' });
  return clock.wait(320);
}

// ───────────────────────────── layout · wipe · enter ─────────────────────────────

/**
 * 版面变了不要「跳」：先量、再改（mutate）、再量，用独立的 translate 从旧位置弹到新位置（不碰组件自己的 transform）。
 * els 可以是函数（改完以后再取一次元素）
 */
export function layout(els, mutate, { stiffness = 260, damping = 24, delay = 0 } = {}) {
  if (!HAS_DOM) {
    mutate?.();
    return Promise.resolve();
  }
  const before = new Map(toList(els).map((el) => [el, el.getBoundingClientRect()]));
  mutate?.();
  if (calm()) return Promise.resolve();
  const sp = springEasing({ stiffness, damping });
  for (const el of toList(els)) {
    const a = before.get(el);
    if (!a) continue;
    const b = el.getBoundingClientRect();
    const k = b.width && el.offsetWidth ? b.width / el.offsetWidth : 1;
    const dx = (a.left - b.left) / k;
    const dy = (a.top - b.top) / k;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    el.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: sp.duration, easing: sp.easing, delay, fill: 'backwards' });
  }
  return clock.wait(delay + sp.duration);
}

/**
 * 换页：一大片柔光斜着拂过（像早上的光扫过纸面）。mid = 光最厚、完全盖住的时候（在这里换内容）。
 * container = null / body → 整个屏幕（fixed）；否则盖住这个容器。只移动一层渐变（transform），iPad 上永远 60 fps。
 */
export function wipe(container, { tone = 'paper', duration = 820, angle = 14, sound: snd = 'wipe', zIndex } = {}) {
  if (!HAS_DOM) {
    const p = Promise.resolve();
    return { mid: p, done: p };
  }
  const page = !container || container === document.body || container === document.documentElement;
  const o = document.createElement('div');
  o.className = `fx-wipe fx-${tone}${page ? ' is-page' : ''}`;
  o.setAttribute('aria-hidden', 'true');
  if (zIndex != null) o.style.zIndex = String(zIndex);
  const band = document.createElement('i');
  o.appendChild(band);
  (page ? document.body : host(container)).appendChild(o);
  const w = page ? window.innerWidth : container.offsetWidth;
  const h = page ? window.innerHeight : container.offsetHeight;
  if (snd) say(snd);
  if (calm()) {
    o.classList.add('is-still'); // 不移动：一层均匀的光淡入淡出（420 ms）
    band.style.transform = 'none';
    band.style.width = '100%';
    band.style.left = '0';
    o.animate([{ opacity: 0 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }], { duration: 420, fill: 'both' });
    return { mid: soon(210), done: soon(440).then(() => o.remove()) };
  }
  // 光带比容器宽一半，中间将近一半完全不透明：mid 的时候整个容器都被盖住（边上也有 ≥ 60 % 的光），换内容看不见
  const bw = Math.max(w * 1.5, 640);
  band.style.width = `${bw}px`;
  const skew = Math.tan((angle * Math.PI) / 180) * h;
  band.animate([{ transform: `translate3d(${-bw - skew}px,0,0) skewX(${-angle}deg)` }, { transform: `translate3d(${w + skew}px,0,0) skewX(${-angle}deg)` }], { duration, easing: EASE.inOut.css, fill: 'both' });
  return { mid: soon(duration * 0.5), done: soon(duration + 20).then(() => o.remove()) };
}

/** fx 时钟的 ms，或者真实时间的 ms + 120（先到的算）：光带是合成线程上的 WAAPI，主线程很卡时 mid 也要落在光最厚的那一刻
 *  （换内容不能等到光已经扫过去）。录帧（手动时钟）只看时钟 */
function soon(ms) {
  if (clock.manual || !HAS_DOM) return clock.wait(ms);
  return Promise.race([clock.wait(ms), new Promise((r) => setTimeout(r, ms + 120))]);
}

/** 文字进场：一块一块 5 px 模糊 + 8 px 上浮淡入（stagger 70 ms）。减少动态 = 只淡入 */
export function enter(els, { stagger = 70, delay = 0, duration = 700, blur = 5, y = 8 } = {}) {
  const list = toList(els);
  if (!HAS_DOM || !list.length) return Promise.resolve();
  const c = calm();
  list.forEach((el, i) => {
    el.animate?.(c ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, translate: `0 ${y}px`, filter: `blur(${blur}px)` }, { opacity: 1, translate: '0 0', filter: 'blur(0px)' }], { duration: c ? 240 : duration, delay: delay + i * stagger, easing: EASE.out.css, fill: 'backwards' });
  });
  return clock.wait(delay + (list.length - 1) * stagger + (c ? 240 : duration));
}

// ───────────────────────────── housekeeping ─────────────────────────────

/** 清空画布（换场景 / 下一位客人） */
export function reset() {
  dust.clear();
}
/** 调试 / 性能：画布上有多少粒子、光环、彗星；画布在不在；时钟是不是在睡；溶解帧图（缓存几张、还在建几张、退回淡出过几次） */
export function stats() {
  return { particles: dust.n, rings: dust.rings.length, comets: dust.comets.length, canvas: !!dust.canvas && dust.running, sleeping: clock.sleeping, cap: dust.N || config.maxParticles, sprites: SPRITES.size, building: BUILDS.length, fades: SPRITE_STATS.fades, built: SPRITE_STATS.built };
}

// ───────────────────────────── React (one line each) ─────────────────────────────

/** <button {...usePress({ depth: .94, ripple: false })}>：按下的光 + 缩放；抬起 / 取消 / 移出 = 弹回 */
export function usePress(opts) {
  const o = useRef(opts);
  o.current = opts;
  const props = useMemo(() => {
    const held = new Map();
    const end = (e) => {
      const rel = held.get(e.currentTarget);
      if (rel) {
        held.delete(e.currentTarget);
        rel();
      }
    };
    return {
      'data-fx': 'own',
      onPointerDown: (e) => {
        if (e.button > 0) return;
        const el = e.currentTarget;
        held.get(el)?.();
        held.set(el, press(el, e, o.current));
      },
      onPointerUp: end,
      onPointerCancel: end,
      onPointerLeave: end,
      _held: held,
    };
  }, []);
  useEffect(
    () => () => {
      for (const rel of props._held.values()) rel();
      props._held.clear();
    },
    [props],
  );
  const { _held, ...rest } = props;
  return rest;
}

const SCOPED = ['scan', 'holo', 'dissolve', 'condense', 'fly', 'mote', 'countUp', 'odometer', 'streamLight', 'flip', 'layout', 'reveal', 'stamp', 'nope', 'enter'];
/** fx 的一份「跟着组件走」的版本：组件卸载以后，promise 的 then / after 的回调都不会再跑（不会对卸载的组件 setState） */
export function scoped(isAlive) {
  const guard = (p) => new Promise((res, rej) => p.then((v) => isAlive() && res(v), (e) => isAlive() && rej(e)));
  const o = { ...fx, pressProps };
  for (const k of SCOPED) o[k] = (...a) => guard(fx[k](...a));
  o.wipe = (...a) => {
    const w = wipe(...a);
    return { mid: guard(w.mid), done: guard(w.done) };
  };
  o.wait = (ms) => guard(clock.wait(ms));
  o.after = (ms, fn) => clock.after(ms, () => isAlive() && fn());
  o.alive = isAlive;
  return o;
}
/** const f = useFx();  f.fly(win, stone).then(onPick) —— 卸载后不会再回调 */
export function useFx() {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return useMemo(() => scoped(() => alive.current), []);
}
/** const n = useRef(); useOdometer(n, value) → <b ref={n} />（这个元素里不要放 React 子节点） */
export function useOdometer(ref, value, opts) {
  const o = useRef(opts);
  o.current = opts;
  useEffect(() => {
    if (ref.current && Number.isFinite(Number(value))) odometer(ref.current, Number(value), o.current);
  }, [ref, value]);
}
/** 值变了就从现在显示的数数过去（第一次直接显示）。<b ref={n} /> 里不要放 React 子节点 */
export function useCountUp(ref, value, opts) {
  const o = useRef(opts);
  o.current = opts;
  const first = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || !Number.isFinite(Number(value))) return;
    const fmt = o.current?.format || fmtInt;
    if (first.current) {
      first.current = false;
      if (!o.current?.from && o.current?.from !== 0) {
        el.textContent = fmt(Number(value));
        return;
      }
    }
    countUp(el, Number(value), o.current);
  }, [ref, value]);
}
/** 唯一的主按钮每 4–5 秒被光扫一下（on = false 时停） */
export function useGleam(ref, on = true, opts) {
  const o = useRef(opts);
  o.current = opts;
  useEffect(() => {
    if (!on || !ref.current) return undefined;
    return gleam(ref.current, o.current);
  }, [ref, on]);
}
/**
 * 离场：active 从 true 变 false 时，元素还留在 DOM 里跑 exit(el)，跑完 gone = true，父组件这时再真正不渲染它。
 *   const gone = useExit(ref, visible, (el) => fx.dissolve(el, { origin: 'top' })); if (!visible && gone) return null;
 */
export function useExit(ref, active, exit) {
  const [gone, setGone] = useState(!active);
  const fn = useRef(exit);
  fn.current = exit;
  useEffect(() => {
    if (active) {
      setGone(false);
      return undefined;
    }
    let alive = true;
    const el = ref.current;
    Promise.resolve(el ? fn.current?.(el) : null).then(() => alive && setGone(true));
    return () => {
      alive = false;
    };
  }, [active, ref]);
  return gone;
}
/** 挂载后（两帧以后，不抢第一帧）为 ref 预先生成溶解帧图；deps 变了再生成一次 */
export function usePrepare(ref, opts, deps = []) {
  const o = useRef(opts);
  o.current = opts;
  useEffect(() => {
    const cancel = clock.after(120, () => {
      for (const el of toList(ref.current)) prepare(el, typeof o.current === 'function' ? o.current(el) : o.current);
    });
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ───────────────────────────── exports ─────────────────────────────

export const fx = {
  motion,
  config,
  clock,
  EASE,
  LIGHT,
  bezier,
  springCurve,
  springEasing,
  sound,
  haptic,
  press,
  tap,
  bindPress,
  pressWith,
  pressProps,
  install,
  scan,
  holo,
  gleam,
  prepare,
  dissolve,
  condense,
  restore,
  fly,
  mote,
  pulse,
  burst,
  ring,
  spark,
  reveal,
  tilt,
  stamp,
  nope,
  countUp,
  odometer,
  streamLight,
  flip,
  layout,
  wipe,
  enter,
  seed,
  reset,
  stats,
};
export default fx;

if (HAS_DOM) {
  // 录屏 / 测试：__fxClock.manual = true; __fxClock.seed(7); __fxClock.step(1000 / 30); __fxClock.log = true → __fxClock.sounds
  window.__fxClock = {
    get manual() {
      return clock.manual;
    },
    set manual(v) {
      clock.setManual(v);
    },
    step: (ms) => clock.step(ms),
    now: () => clock.now(),
    seed,
    stats,
    reset,
    get log() {
      return SOUND_LOG.on;
    },
    set log(v) {
      SOUND_LOG.on = !!v;
      if (v) SOUND_LOG.list.length = 0;
    },
    get sounds() {
      return SOUND_LOG.list;
    },
    fx,
  };
}
