// zs-nature.js —— 马来西亚高原花园的自然声（金马伦的清晨、瓜拉雪兰莪的黄昏）：
//   白天 = 溪水 · 微风 · 水泡 · 鸟（音高贴着 D 五声音阶，和音乐不打架）
//   黄昏 / 夜里 = 溪水小一点 · 风大一点 · 蟋蟀 · 树蛙（「嘀嘀」和木鱼一样的「笃」）
// 「床」一直开着，只换音量；「事件」由引擎的排程器按时刻排（离线渲染一样可用）。

import { mhz, clamp } from './zs-dsp.js';

// 每个情绪的自然声配方：倍数乘在 LEVEL 上；birds / drops / frogs = 两次之间的秒数范围（null = 不出现）
export const NATURE = {
  // 水泡大约 2–3 秒一个：听得出是「石头边的溪水」，在客人身边待 20 分钟也不会变成「滴答」的噪音
  day: { stream: 1, wind: 1, birds: [7, 15], drops: [1, 3], crickets: 0, frogs: null },
  quiet: { stream: 0.9, wind: 0.8, birds: [14, 28], drops: [1.4, 3.6], crickets: 0, frogs: null },
  // 直觉题（3 秒一题）：没有鸟、没有任何突然的声音（水泡也更少、更远）
  still: { stream: 1, wind: 0.85, birds: null, drops: [2, 5], crickets: 0, frogs: null },
  dusk: { stream: 0.75, wind: 1.1, birds: null, drops: [1.8, 4.5], crickets: 1, frogs: [4, 10] },
  night: { stream: 0.65, wind: 0.9, birds: null, drops: [2.2, 5.5], crickets: 1.15, frogs: [3, 8] },
};
export const LEVEL = { stream: 0.11, wind: 0.05, crickets: 0.006, drop: 0.012, bird: 0.03, frog: 0.016 };

const BIRD = [93, 95, 98, 100, 102]; // A6 B6 D7 E7 F#7（1.76–2.96 kHz）：鸟也在调上

export function buildBeds(E, out, t) {
  const c = E.ctx;
  // 溪水：粉红噪声 → 三条带通（中心频率一直在游走 = 流水的咕噜）→ 低通（不刺耳）
  const s = c.createBufferSource();
  s.buffer = E.noise.pink;
  s.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5200;
  lp.Q.value = 0.3;
  const bands = [
    [520, 0.9, 1],
    [1350, 1.3, 0.75],
    [2900, 1.8, 0.45],
  ].map(([f, q, a]) => {
    const b = c.createBiquadFilter();
    b.type = 'bandpass';
    b.frequency.value = f;
    b.Q.value = q;
    const g = c.createGain();
    g.gain.value = a;
    s.connect(b).connect(g).connect(lp);
    return { b, f };
  });
  const sg = c.createGain();
  sg.gain.value = 0;
  const sp = c.createStereoPanner();
  sp.pan.value = -0.3;
  lp.connect(sg).connect(sp).connect(out);
  // 微风：棕噪声 + 低通，偶尔一阵
  const w = c.createBufferSource();
  w.buffer = E.noise.brown;
  w.loop = true;
  const wl = c.createBiquadFilter();
  wl.type = 'lowpass';
  wl.frequency.value = 480;
  const gust = c.createGain();
  gust.gain.value = 0.7;
  const wg = c.createGain();
  wg.gain.value = 0;
  w.connect(wl).connect(gust).connect(wg).connect(out);
  // 蟋蟀：三只，各一个一直开着的振荡器；叫声 = 增益上的小脉冲（不新建节点）
  const cg = c.createGain();
  cg.gain.value = 0;
  cg.connect(out);
  const crickets = [4320, 4610, 4870].map((f, i) => {
    const o = c.createOscillator();
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.value = 0;
    const p = c.createStereoPanner();
    p.pan.value = [-0.65, 0.55, 0.1][i];
    o.connect(g).connect(p).connect(cg);
    o.start(t);
    return { o, g, period: 0.52 + i * 0.09 };
  });
  s.start(t, E.r() * 5);
  w.start(t, E.r() * 5);
  return { sg, wg, gust, wl, bands, cg, crickets, out, srcs: [s, w, ...crickets.map((k) => k.o)] };
}

/** 换情绪：三张「床」慢慢换音量；事件的密度由 E.nat 决定（下一次排的时候就生效） */
export function applyNature(E, key, t, tau = 2.2) {
  const P = NATURE[key] || NATURE.day;
  E.nat = P;
  E.natKey = NATURE[key] ? key : 'day';
  const B = E.beds;
  if (!B) return;
  B.sg.gain.setTargetAtTime(LEVEL.stream * P.stream, t, tau);
  B.wg.gain.setTargetAtTime(LEVEL.wind * P.wind, t, tau);
  B.cg.gain.setTargetAtTime(LEVEL.crickets * P.crickets, t, tau * 1.3);
}

/** 排程器的「车道」：fn(时刻) 在那个时刻排好一个事件，返回下一次的时刻 */
export function natureLanes(E, t) {
  const r = E.r;
  const B = E.beds;
  return [
    { next: t + 0.1, fn: (tt) => (babble(E, tt), tt + r.range(0.25, 0.5)) },
    { next: t + 1, fn: (tt) => (gust(E, tt), tt + r.range(2.5, 7)) },
    { next: t + r.range(0.5, 2), fn: (tt) => (E.nat?.drops ? (droplet(E, tt), tt + r.range(...E.nat.drops)) : tt + 1) },
    { next: t + r.range(2, 5), fn: (tt) => (E.nat?.birds ? (bird(E, tt), tt + r.range(...E.nat.birds)) : tt + 1.5) },
    { next: t + r.range(1, 4), fn: (tt) => (E.nat?.frogs ? (frog(E, tt), tt + r.range(...E.nat.frogs)) : tt + 1.5) },
    ...B.crickets.map((k) => ({ next: t + r.range(0.1, 0.6), fn: (tt) => (E.nat?.crickets ? chirp(E, k, tt) : 0, tt + k.period * r.range(0.93, 1.08)) })),
  ];
}

function babble(E, t) {
  const r = E.r;
  for (const k of E.beds.bands) k.b.frequency.setTargetAtTime(k.f * r.range(0.75, 1.32), t, 0.22);
}

function gust(E, t) {
  const r = E.r;
  E.beds.wl.frequency.setTargetAtTime(r.range(280, 760), t, 1.4);
  E.beds.gust.gain.setTargetAtTime(r.range(0.45, 1.05), t, 1.8);
}

/** 水泡：很短的上滑正弦（气泡变小、音变高），声音像石头边的溪水 */
function droplet(E, t) {
  const c = E.ctx;
  const r = E.r;
  const f = r.range(650, 1500);
  const o = c.createOscillator();
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * r.range(1.45, 2.1), t + r.range(0.03, 0.06));
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(LEVEL.drop * r.range(0.35, 1), t + 0.004);
  g.gain.setTargetAtTime(0, t + 0.005, 0.014);
  const p = c.createStereoPanner();
  p.pan.value = r.range(-0.75, 0.05);
  o.connect(g).connect(p).connect(E.beds.out);
  o.start(t);
  o.stop(t + 0.14);
  E.log('drop', t, 0, 0.2);
}

/** 鸟：鹎（圆润的滑音句子）· 绣眼鸟（一串细碎的短音）· 远处的斑鸠（咕——咕，D5 · B4） */
function bird(E, t) {
  const c = E.ctx;
  const r = E.r;
  const kind = r.pick(['warble', 'warble', 'twitter', 'coo']);
  const p = c.createStereoPanner();
  p.pan.value = r.range(-0.85, 0.85);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = kind === 'coo' ? 1400 : 5200;
  const g = c.createGain();
  g.gain.value = 0;
  const o = c.createOscillator();
  o.connect(g).connect(lp).connect(p).connect(E.beds.out);
  const lv = LEVEL.bird * r.range(0.5, 1) * (kind === 'twitter' ? 0.55 : kind === 'coo' ? 0.8 : 1);
  let tt = t;
  if (kind === 'warble') {
    const n = r.int(3, 5);
    let i = r.int(0, 3);
    o.frequency.setValueAtTime(mhz(BIRD[i]), tt);
    for (let k = 0; k < n; k++) {
      const d = r.range(0.07, 0.16);
      o.frequency.setTargetAtTime(mhz(BIRD[i]) * r.range(0.985, 1.015), tt, 0.012);
      g.gain.setTargetAtTime(lv, tt, 0.008);
      g.gain.setTargetAtTime(0, tt + d * 0.75, 0.015);
      tt += d + r.range(0.02, 0.07);
      i = clamp(i + r.pick([-1, 1, 1, 2, -2]), 0, BIRD.length - 1);
    }
  } else if (kind === 'twitter') {
    const n = r.int(5, 9);
    const base = r.range(3100, 3900);
    for (let k = 0; k < n; k++) {
      const d = r.range(0.022, 0.04);
      o.frequency.setValueAtTime(base * r.range(0.92, 1.08), tt);
      o.frequency.exponentialRampToValueAtTime(base * r.range(1.1, 1.25), tt + d);
      g.gain.setTargetAtTime(lv, tt, 0.004);
      g.gain.setTargetAtTime(0, tt + d * 0.6, 0.008);
      tt += d + r.range(0.03, 0.06);
    }
  } else {
    for (const m of r.chance(0.5) ? [74, 71] : [74, 74, 71]) {
      const d = r.range(0.28, 0.4);
      const f = mhz(m);
      o.frequency.setValueAtTime(f * 0.97, tt);
      o.frequency.linearRampToValueAtTime(f, tt + 0.06);
      o.frequency.linearRampToValueAtTime(f * 0.96, tt + d);
      g.gain.setTargetAtTime(lv, tt, 0.03);
      g.gain.setTargetAtTime(0, tt + d * 0.7, 0.05);
      tt += d + r.range(0.12, 0.22);
    }
  }
  o.start(t);
  o.stop(tt + 0.3);
  E.log('bird', t, 0, lv);
}

/** 树蛙：「嘀嘀嘀」（A6 / B6 / D7 附近）或木鱼一样的「笃、笃」（D5 / E5） */
function frog(E, t) {
  const c = E.ctx;
  const r = E.r;
  const p = c.createStereoPanner();
  p.pan.value = r.range(-0.8, 0.8);
  const o = c.createOscillator();
  o.type = 'triangle';
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3000;
  const g = c.createGain();
  g.gain.value = 0;
  o.connect(lp).connect(g).connect(p).connect(E.beds.out);
  const kik = r.chance(0.7);
  const n = kik ? r.int(3, 6) : r.int(2, 3);
  const f = kik ? r.pick([1760, 1976, 2349]) * r.range(0.97, 1.03) : r.pick([587.3, 659.3]);
  const gap = kik ? r.range(0.11, 0.16) : r.range(0.28, 0.4);
  const lv = LEVEL.frog * r.range(0.5, 1) * (kik ? 0.8 : 1.2);
  let tt = t;
  for (let k = 0; k < n; k++) {
    o.frequency.setValueAtTime(f * 1.12, tt);
    o.frequency.exponentialRampToValueAtTime(f * 0.92, tt + 0.03);
    g.gain.setTargetAtTime(lv, tt, 0.003);
    g.gain.setTargetAtTime(0, tt + 0.012, kik ? 0.012 : 0.025);
    tt += gap * r.range(0.9, 1.1);
  }
  o.start(t);
  o.stop(tt + 0.3);
  E.log('frog', t, 0, lv);
}

function chirp(E, k, t) {
  const r = E.r;
  const n = r.int(3, 5);
  const gap = 0.031 + r.range(-0.002, 0.003);
  for (let i = 0; i < n; i++) {
    const ti = t + i * gap;
    k.g.gain.setValueAtTime(0, ti);
    k.g.gain.linearRampToValueAtTime(1, ti + 0.006);
    k.g.gain.linearRampToValueAtTime(0, ti + 0.019);
  }
}
