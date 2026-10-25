// zs-voices.js —— 乐器（全部现场合成，没有采样）：
//   古筝（Karplus-Strong 拨弦 + 桐木琴身共鸣；按音 = 上滑音、下滑音；揉弦；摇指；刮奏；泛音）·
//   手碟 / 卡林巴（模态合成）· 箫（一口气吹完一句：气声 + 连音滑音 + 延迟揉音）·
//   暖铺底 · 低持续音（一个声部，换音时轻轻换气）· 颂钵（不成倍数的泛音 + 慢拍频）· 风铃。
// 每个乐器都是「在时刻 t 排一个音」的函数，不用 setTimeout —— 在线播放和离线渲染是同一份代码。
// E = 引擎（ZenSong）：E.ctx · E.r（随机数）· E.noise · E.waves（波表缓存）· E.log()

import { mhz, clamp, stepUp, stepDown } from './zs-dsp.js';
import { waveData } from './zs-wavedata.js';


export const reg = (m) => clamp(1.2 - (m - 60) * 0.016, 0.62, 1.3); // 高音别刺耳、低音别糊
export const panOf = (m) => clamp((m - 66) / 34, -0.42, 0.42); // 低音偏左、高音偏右：像琴横在面前

/** 把算好的波表数据装进 AudioBuffer、缓存在引擎上（Worker 送回来的、或主线程当场算的，都走这里） */
export function adoptWave(E, kind, m, data, f0) {
  const key = kind + m;
  let w = E.waves.get(key);
  if (w) return w;
  const sr = E.ctx.sampleRate; // 和 AudioContext 同一个采样率：播放时不用重采样（没有镜像噪声）
  const buf = E.ctx.createBuffer(1, data.length, sr);
  buf.copyToChannel ? buf.copyToChannel(data, 0) : buf.getChannelData(0).set(data);
  w = { buf, rate: mhz(m) / f0, dur: data.length / sr };
  E.waves.set(key, w);
  return w;
}

/** 波表：每个音高只算一次（古筝 ≈ 10–40 ms，手碟 ≈ 15 ms）。现场播放时通常已经由 Worker 在后台算好；没有就当场算 */
export function wave(E, kind, m) {
  const w = E.waves.get(kind + m);
  if (w) return w;
  const { data, f0 } = waveData(kind, m, E.ctx.sampleRate);
  return adoptWave(E, kind, m, data, f0);
}

/** 放一个波表音：起音 3 ms（不咔哒）；要提前止音时 rel 秒线性收掉 */
function strike(E, out, t, w, peak, pan, { len = Infinity, rel = 0.3, lp = 0, rate = w.rate } = {}) {
  const c = E.ctx;
  const src = c.createBufferSource();
  src.buffer = w.buf;
  src.playbackRate.setValueAtTime(rate, t);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.003);
  const natural = w.dur / Math.max(0.5, rate);
  const end = t + Math.min(len, natural);
  if (end < t + natural - 0.01) {
    g.gain.setValueAtTime(peak, Math.max(t + 0.004, end - rel));
    g.gain.linearRampToValueAtTime(0, end);
  }
  let head = src;
  if (lp) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    f.Q.value = 0.4;
    src.connect(f);
    head = f;
  }
  head.connect(g);
  if (pan) {
    const p = c.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(out);
  } else g.connect(out);
  src.start(t);
  src.stop(end + 0.02);
  return src;
}

// ───────────── 古筝 ─────────────
/** o: { slide 上滑音（按音）, fall 下滑音, vib 揉弦, grace 倚音 } · dur = 这个音在谱上占的秒数（余音会自然长一点） */
export function zheng(E, out, t, m, dur, vel = 0.7, o = {}) {
  const w = wave(E, 'zheng', m);
  const peak = 0.3 * Math.pow(vel, 1.3) * reg(m);
  const ring = Math.max(dur * 1.7, 1.2);
  const r0 = w.rate;
  const from = o.slide ? r0 * Math.pow(2, (stepDown(m) - m) / 12) : r0;
  if (o.grace) {
    const g = wave(E, 'zheng', stepUp(m));
    strike(E, out, t - 0.075, g, peak * 0.5, panOf(m), { len: 0.11, rel: 0.04 });
  }
  const src = strike(E, out, t, w, peak, panOf(m), { len: ring, lp: vel < 0.5 ? 2400 : 0, rate: from });
  const P = src.playbackRate;
  if (o.slide) {
    P.setValueAtTime(from, t + 0.05);
    P.exponentialRampToValueAtTime(r0, t + 0.24);
  }
  if (o.fall && dur > 0.45) {
    const tf = t + Math.max(0.3, dur * 0.62);
    P.setValueAtTime(r0, tf);
    P.exponentialRampToValueAtTime(r0 * Math.pow(2, (stepDown(m) - m) / 12), tf + Math.min(0.32, dur * 0.3));
  }
  if (o.vib && dur > 0.6) {
    const c = E.ctx;
    const lfo = c.createOscillator();
    lfo.frequency.value = 5 + E.r() * 0.9;
    const lg = c.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.setValueAtTime(0, t + 0.32);
    lg.gain.linearRampToValueAtTime(r0 * 0.0075, t + 0.85); // ≈ ±13 音分，揉弦
    lfo.connect(lg);
    lg.connect(P);
    lfo.start(t);
    lfo.stop(t + ring);
  }
  E.log('zheng', t, m, vel);
}

/** 摇指：长音上快速来回拨（≈ 12–14 次 / 秒），中间鼓起来一点，最后一下让它响完 */
export function zhengTrem(E, out, t, m, dur, vel = 0.7) {
  const w = wave(E, 'zheng', m);
  const hz = 11.5 + E.r() * 2.5;
  const n = Math.max(4, Math.floor(dur * hz));
  const pan = panOf(m);
  for (let k = 0; k < n; k++) {
    const x = k / (n - 1);
    const shape = 0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, x * 1.1));
    const v = vel * shape * (k % 2 ? 0.8 : 1);
    const last = k === n - 1;
    const tk = t + k / hz + (k ? (E.r() - 0.5) * 0.008 : 0);
    strike(E, out, tk, w, 0.17 * Math.pow(v, 1.3) * reg(m), pan, { len: last ? 1.8 : 1 / hz + 0.035, rel: last ? 0.4 : 0.03, lp: 2800 });
  }
  E.log('zheng', t, m, vel);
}

/** 刮奏：一把扫过五声音阶，余音全部留着（古筝最有代表性的「水波」） */
export function zhengGliss(E, out, t, ms, vel = 0.6, spacing = 0.045) {
  let tt = t;
  ms.forEach((m, i) => {
    const x = i / Math.max(1, ms.length - 1);
    zheng(E, out, tt, m, 0.9, vel * (0.5 + 0.5 * x));
    tt += spacing * (0.85 + E.r() * 0.3);
  });
}

export function harm(E, out, t, m, dur, vel = 0.6) {
  strike(E, out, t, wave(E, 'harm', m), 0.2 * vel * reg(m), panOf(m) * 0.6);
  E.log('harm', t, m, vel);
}

// ───────────── 手碟 / 卡林巴 ─────────────
export function handpan(E, out, t, m, dur, vel = 0.7) {
  strike(E, out, t, wave(E, 'pan', m), 0.27 * Math.pow(vel, 1.2) * reg(m), panOf(m) * 0.7, { lp: vel < 0.5 ? 1900 : 0 });
  E.log('pan', t, m, vel);
}
export function kalimba(E, out, t, m, dur, vel = 0.6) {
  strike(E, out, t, wave(E, 'kal', m), 0.15 * vel * reg(m), clamp(panOf(m) + (E.r() - 0.5) * 0.4, -0.6, 0.6));
  E.log('kal', t, m, vel);
}

// ───────────── 箫 ─────────────
const PW = /* @__PURE__ */ new WeakMap();
function periodic(ctx, key, imag) {
  let m = PW.get(ctx);
  if (!m) PW.set(ctx, (m = {}));
  if (!m[key]) m[key] = ctx.createPeriodicWave(new Float32Array(imag.length), Float32Array.from(imag));
  return m[key];
}
const XIAO = [0, 1, 0.19, 0.08, 0.035, 0.018, 0.008];
const PAD = [0, 1, 0.42, 0.2, 0.1, 0.05, 0.025, 0.012];

/** 一句箫：notes = [{ t, d 秒, m, v, vib, grace }]（中间没有休止）。连音滑过去；同音或有缝 = 吐音；长音延迟揉音、先鼓后收 */
export function flute(E, out, notes, { breath = 0.08, bright = 0.5 } = {}) {
  if (!notes.length) return;
  const c = E.ctx;
  const t0 = notes[0].t;
  const last = notes[notes.length - 1];
  const tEnd = last.t + last.d;
  const osc = c.createOscillator();
  osc.setPeriodicWave(periodic(c, 'xiao', XIAO));
  osc.frequency.setValueAtTime(mhz(notes[0].m), t0 - 0.1);
  const tone = c.createBiquadFilter();
  tone.type = 'lowpass';
  tone.Q.value = 0.3;
  tone.frequency.setValueAtTime(1500, t0 - 0.1);
  const amp = c.createGain();
  amp.gain.setValueAtTime(0, t0 - 0.1);
  osc.connect(tone).connect(amp);
  const lfo = c.createOscillator();
  lfo.frequency.value = 4.6 + E.r() * 0.8;
  const vib = c.createGain();
  vib.gain.setValueAtTime(0, t0 - 0.1);
  lfo.connect(vib).connect(osc.detune);
  const nz = c.createBufferSource();
  nz.buffer = E.noise.white;
  nz.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.1;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0, t0 - 0.1);
  nz.connect(bp).connect(ng);
  const p = c.createStereoPanner();
  p.pan.value = 0.14;
  amp.connect(p);
  ng.connect(p);
  p.connect(out);
  let prevEnd = -9;
  let prevM = null;
  for (const n of notes) {
    const f = mhz(n.m);
    // 箫是持续音：同样的峰值，响度比拨弦大得多 —— 0.058 让它和古筝的「歌唱音量」相当（离线实测，见 SPEC §8）
    const peak = 0.058 * Math.pow(n.v, 1.1) * clamp(1.15 - (n.m - 62) * 0.012, 0.7, 1.2);
    const tongued = prevM == null || n.t - prevEnd > 0.04 || n.m === prevM;
    if (n.grace) {
      osc.frequency.setValueAtTime(mhz(stepUp(n.m)), n.t - 0.07); // 打音
      osc.frequency.setValueAtTime(f, n.t);
    } else if (tongued) osc.frequency.setValueAtTime(f, n.t - 0.005);
    else {
      osc.frequency.setValueAtTime(mhz(prevM), n.t - 0.06); // 连音：手指滑过去
      osc.frequency.exponentialRampToValueAtTime(f, n.t + 0.03);
    }
    if (tongued) {
      amp.gain.setTargetAtTime(0, n.t - 0.04, 0.012);
      amp.gain.setTargetAtTime(peak, n.t, 0.045);
      ng.gain.setTargetAtTime(peak * 0.6, n.t, 0.006); // 吐音的「气头」
      ng.gain.setTargetAtTime(peak * breath, n.t + 0.03, 0.05);
    } else {
      amp.gain.setTargetAtTime(peak * 0.85, n.t - 0.04, 0.015);
      amp.gain.setTargetAtTime(peak, n.t + 0.02, 0.05);
      ng.gain.setTargetAtTime(peak * breath, n.t, 0.05);
    }
    bp.frequency.setTargetAtTime(f * 2, n.t, 0.02);
    tone.frequency.setTargetAtTime((1100 + 2000 * n.v) * (0.8 + bright * 0.4), n.t, 0.08);
    if (n.d > 1.2) {
      amp.gain.setTargetAtTime(peak * 1.1, n.t + n.d * 0.3, n.d * 0.18);
      amp.gain.setTargetAtTime(peak * 0.82, n.t + n.d * 0.72, n.d * 0.12);
    }
    vib.gain.setTargetAtTime(0, n.t, 0.02);
    if (n.vib || n.d > 0.9) vib.gain.setTargetAtTime(n.vib ? 24 : 12, n.t + Math.min(0.45, n.d * 0.38), 0.16);
    prevEnd = n.t + n.d;
    prevM = n.m;
    E.log('flute', n.t, n.m, n.v);
  }
  amp.gain.setTargetAtTime(0, tEnd - 0.06, 0.09);
  ng.gain.setTargetAtTime(0, tEnd - 0.06, 0.06);
  vib.gain.setTargetAtTime(0, tEnd, 0.1);
  const t1 = tEnd + 1;
  osc.start(t0 - 0.1);
  lfo.start(t0 - 0.1);
  nz.start(t0 - 0.1, E.r() * 1.5);
  osc.stop(t1);
  lfo.stop(t1);
  nz.stop(t1);
}

// ───────────── 铺底 · 持续音 · 颂钵 · 风铃 ─────────────
export function pad(E, out, t, ms, dur, vel = 0.7, { attack = 2.6, release = 4.5 } = {}) {
  const c = E.ctx;
  const pw = periodic(c, 'pad', PAD);
  const base = (0.03 * vel) / Math.sqrt(ms.length);
  const hold = t + Math.max(attack, dur);
  for (const m of ms) {
    const pk = base * clamp(1.25 - (m - 52) * 0.018, 0.55, 1.35);
    for (const det of [-6, 5]) {
      const o = c.createOscillator();
      o.setPeriodicWave(pw);
      o.frequency.value = mhz(m);
      o.detune.value = det + (E.r() - 0.5) * 4;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(pk, t + attack);
      g.gain.setValueAtTime(pk, hold);
      g.gain.setTargetAtTime(0, hold, release / 4);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(hold + release * 1.9);
    }
  }
  E.log('pad', t, ms[0], vel);
}

/** 低持续音：整首曲子一个声部（同一组振荡器，换音时轻轻换一口气，不会两个同音互相抵消） */
export function droneVoice(E, out, t0) {
  const c = E.ctx;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.connect(out);
  const oscs = [
    [1, 1, 0],
    [1, 0.5, 3], // 3 音分 → 很慢、很浅的「呼吸」
    [2, 0.3, -5],
    [3, 0.1, 3], // 小喇叭（iPad）听得到的泛音
  ].map(([mul, a, det]) => {
    const o = c.createOscillator();
    o.detune.value = det;
    const og = c.createGain();
    og.gain.value = a;
    o.connect(og).connect(g);
    o.start(t0);
    return { o, mul };
  });
  let cur = null;
  return {
    to(m, t, vel = 0.7) {
      const f = mhz(m);
      const lv = 0.026 * vel; // 很低的「地气」：耳机里感觉得到，iPad 喇叭几乎放不出来（不抢旋律的余量）
      if (cur == null) {
        for (const { o, mul } of oscs) o.frequency.setValueAtTime(f * mul, t);
        g.gain.setTargetAtTime(lv, t, 1.2);
      } else if (cur !== m) {
        g.gain.setTargetAtTime(0, t - 1.1, 0.35);
        for (const { o, mul } of oscs) o.frequency.setValueAtTime(f * mul, t);
        g.gain.setTargetAtTime(lv, t + 0.02, 1.3);
      } else g.gain.setTargetAtTime(lv, t, 1.5);
      cur = m;
      E.log('drone', t, m, vel);
    },
    stop(t, fade = 4) {
      g.gain.setTargetAtTime(0, t, fade / 4);
      for (const { o } of oscs) o.stop(t + fade * 1.9);
    },
  };
}

export function bowl(E, out, t, m, vel = 0.6) {
  const c = E.ctx;
  const f = mhz(m);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.08 * vel, t + 0.012); // 软槌
  g.connect(out);
  for (const [ratio, a, t60, beat] of [[1, 1, 14, 0.9], [2.71, 0.5, 9, 1.6], [5.15, 0.22, 5.5, 2.4], [8.2, 0.08, 3.2, 3.1]]) {
    if (f * ratio > 8000) continue;
    for (const s of [-1, 1]) {
      const o = c.createOscillator();
      o.frequency.value = f * ratio + (s * beat) / 2;
      const og = c.createGain();
      og.gain.setValueAtTime(a * 0.5, t);
      og.gain.setTargetAtTime(0, t + 0.012, t60 / 6.9);
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + t60 * 1.1);
    }
  }
  E.log('bowl', t, m, vel);
}

export function chime(E, out, t, m, vel = 0.5) {
  const c = E.ctx;
  const f = mhz(m);
  const p = c.createStereoPanner();
  p.pan.value = (E.r() - 0.5) * 1.2;
  p.connect(out);
  for (const [ratio, a, t60] of [[1, 1, 3.4], [2.76, 0.24, 1.5], [5.4, 0.07, 0.7]]) {
    if (f * ratio > 8000) continue;
    const o = c.createOscillator();
    o.frequency.value = f * ratio;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06 * vel * a, t + 0.003);
    g.gain.setTargetAtTime(0, t + 0.003, t60 / 6.9);
    o.connect(g).connect(p);
    o.start(t);
    o.stop(t + t60 * 1.1);
  }
  E.log('chime', t, m, vel);
}
