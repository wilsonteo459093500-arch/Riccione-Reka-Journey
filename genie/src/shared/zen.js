// 许愿模式的背景音乐 —— 现场合成的「大自然 × 禅」声景（WebAudio，不用任何音频文件，没有版权问题）。
// 层次：溪水（带呼吸的粉噪声）· 微风 · 五声音阶的长音铺底 · 偶尔的颂钵 · 风铃 · 远处的鸟。
// 想换成公司自己有版权的曲子：在 config.js 填 CONFIG.wishMusic（mp3 网址），自然声仍会垫在底下。
//
// iPad Safari 的规矩：AudioContext 必须在「手指点下去」的那一刻创建 / resume，所以 start() 一定要在点击事件里调用。

const PENTA = [0, 2, 4, 7, 9]; // 宫商角徵羽
const ROOT = 146.83; // D3
const hz = (semi) => ROOT * Math.pow(2, semi / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const MOODS = {
  calm: { stream: 0.11, wind: 0.05, pad: 0.05, chime: [5, 11], bowl: [16, 28], bird: [7, 15] },
  focus: { stream: 0.08, wind: 0.035, pad: 0.065, chime: [11, 19], bowl: [24, 38], bird: [15, 28] },
  bright: { stream: 0.1, wind: 0.04, pad: 0.045, chime: [4, 8], bowl: [20, 32], bird: [4, 9] },
  night: { stream: 0.07, wind: 0.06, pad: 0.06, chime: [9, 16], bowl: [18, 30], bird: [999, 999] },
};

function noiseBuffer(ctx, seconds = 4, kind = 'pink') {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.2;
      } else {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
      }
    }
  }
  return buf;
}

function impulse(ctx, seconds = 3.6, decay = 2.6) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export class Zen {
  constructor() {
    this.ctx = null;
    this.running = false;
    this.volume = 0.7;
    this.muted = false;
    this.mood = 'calm';
    this.timers = new Set();
    this.track = null;
  }

  /** 必须在点击 / 触摸事件里调用 */
  start({ volume, trackUrl } = {}) {
    if (volume != null) this.volume = volume;
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback'; // iOS 17+：不受静音键影响
    } catch {
      /* ignore */
    }
    if (!this.ctx) this.build();
    const ctx = this.ctx;
    ctx.resume?.();
    // iOS 解锁：播一个极短的静音
    const s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, 22050);
    s.connect(ctx.destination);
    s.start(0);
    if (trackUrl && !this.track) this.attachTrack(trackUrl);
    if (this.track) this.track.el.play().catch(() => {});
    if (this.running) return;
    this.running = true;
    this.startBeds();
    this.applyMood(0.1);
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setValueAtTime(this.master.gain.value, ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(this.muted ? 0 : this.volume, ctx.currentTime + 3.5);
    this.loop('chime', () => this.chime());
    this.loop('bowl', () => this.bowl(hz(pick([-12, -5, 0])), 0.5), 2.5);
    this.loop('bird', () => this.bird());
    this.padLoop();
    this.babble();
  }

  build() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp).connect(ctx.destination);
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    this.verb = ctx.createConvolver();
    this.verb.buffer = impulse(ctx);
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.9;
    this.verbIn.connect(this.verb).connect(this.master);
    this.pink = noiseBuffer(ctx, 5, 'pink');
    this.brown = noiseBuffer(ctx, 5, 'brown');
  }

  startBeds() {
    const ctx = this.ctx;
    // 溪水：两路带通，中心频率慢慢游走 = 流水的「咕噜」
    const src = ctx.createBufferSource();
    src.buffer = this.pink;
    src.loop = true;
    this.streamGain = ctx.createGain();
    this.streamGain.gain.value = 0;
    this.bands = [
      [700, 0.8],
      [1900, 1.4],
      [3800, 2.2],
    ].map(([f, q]) => {
      const b = ctx.createBiquadFilter();
      b.type = 'bandpass';
      b.frequency.value = f;
      b.Q.value = q;
      src.connect(b).connect(this.streamGain);
      return { b, f };
    });
    const pan = ctx.createStereoPanner();
    pan.pan.value = -0.25;
    this.streamGain.connect(pan).connect(this.dry);
    src.start();
    // 微风：棕噪声 + 低通
    const w = ctx.createBufferSource();
    w.buffer = this.brown;
    w.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    w.connect(lp).connect(this.windGain).connect(this.dry);
    w.start();
    this.windFilter = lp;
    // 长音铺底
    this.padBus = ctx.createGain();
    this.padBus.gain.value = 0;
    const padLp = ctx.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 1100;
    this.padBus.connect(padLp);
    padLp.connect(this.dry);
    padLp.connect(this.verbIn);
    this.beds = [src, w];
  }

  applyMood(t = 2) {
    if (!this.ctx || !this.streamGain) return;
    const m = MOODS[this.mood] || MOODS.calm;
    const now = this.ctx.currentTime;
    this.streamGain.gain.setTargetAtTime(m.stream, now, t);
    this.windGain.gain.setTargetAtTime(m.wind, now, t);
    this.padBus.gain.setTargetAtTime(m.pad, now, t);
  }

  setMood(mood) {
    if (!MOODS[mood] || mood === this.mood) return;
    this.mood = mood;
    this.applyMood(2.5);
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.ctx && !this.muted) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.3);
    if (this.track) this.track.el.volume = this.volume * 0.8;
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.4);
    if (this.track) this.track.el.muted = this.muted;
  }

  /** 用公司自己的曲子（有版权的）。自然声继续垫底。 */
  attachTrack(url) {
    const el = new Audio(url);
    el.loop = true;
    el.crossOrigin = 'anonymous';
    el.volume = this.volume * 0.8;
    this.track = { el };
  }

  loop(kind, fn, delayFirst) {
    const tick = () => {
      if (!this.running) return;
      const [a, b] = (MOODS[this.mood] || MOODS.calm)[kind];
      if (a < 900) fn();
      const t = setTimeout(tick, rand(a, b) * 1000);
      this.timers.add(t);
    };
    const t = setTimeout(tick, (delayFirst ?? rand(1, 4)) * 1000);
    this.timers.add(t);
  }

  babble() {
    const step = () => {
      if (!this.running) return;
      const now = this.ctx.currentTime;
      for (const { b, f } of this.bands) b.frequency.setTargetAtTime(f * rand(0.75, 1.3), now, 0.25);
      this.windFilter.frequency.setTargetAtTime(rand(300, 650), now, 2);
      const t = setTimeout(step, rand(180, 420));
      this.timers.add(t);
    };
    step();
  }

  padLoop() {
    const chords = [
      [-12, -5, 0, 4],
      [-10, -3, 2, 7],
      [-15, -8, -3, 2],
      [-12, -5, 2, 9],
    ];
    let i = 0;
    const play = () => {
      if (!this.running) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const notes = chords[i++ % chords.length];
      for (const n of notes) {
        for (const det of [-4, 4]) {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = hz(n);
          o.detune.value = det;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, now);
          g.gain.linearRampToValueAtTime(0.12, now + 5);
          g.gain.setValueAtTime(0.12, now + 13);
          g.gain.linearRampToValueAtTime(0, now + 19);
          o.connect(g).connect(this.padBus);
          o.start(now);
          o.stop(now + 19.5);
        }
      }
      const t = setTimeout(play, 14000);
      this.timers.add(t);
    };
    play();
  }

  /** 颂钵：几个不成整数倍的泛音 + 轻微拍频，长长地散开 */
  bowl(freq = hz(-12), amp = 0.5) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.02;
    const partials = [
      [1, 1],
      [2.71, 0.45],
      [5.15, 0.2],
      [8.2, 0.08],
    ];
    const out = ctx.createGain();
    out.gain.value = amp * 0.16;
    out.connect(this.dry);
    out.connect(this.verbIn);
    for (const [ratio, a] of partials) {
      for (const det of [-0.6, 0.6]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq * ratio + det;
        const g = ctx.createGain();
        const dur = 9 / Math.sqrt(ratio);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(a, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        o.connect(g).connect(out);
        o.start(now);
        o.stop(now + dur + 0.1);
      }
    }
  }

  chime(semi) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.01;
    const n = semi ?? 12 + pick(PENTA) + pick([0, 12]);
    const p = ctx.createStereoPanner();
    p.pan.value = rand(-0.7, 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.06, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 3.2);
    g.connect(p);
    p.connect(this.dry);
    p.connect(this.verbIn);
    for (const [mul, a] of [
      [1, 1],
      [2.76, 0.18],
      [5.4, 0.06],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz(n) * mul;
      const og = ctx.createGain();
      og.gain.value = a;
      o.connect(og).connect(g);
      o.start(now);
      o.stop(now + 3.3);
    }
  }

  /** 远处的鸟：两三声快速的上滑音 */
  bird() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    let t = ctx.currentTime + 0.05;
    const base = rand(2400, 3600);
    const p = ctx.createStereoPanner();
    p.pan.value = rand(-0.9, 0.9);
    const out = ctx.createGain();
    out.gain.value = 0.035;
    out.connect(p);
    p.connect(this.dry);
    p.connect(this.verbIn);
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const g = ctx.createGain();
      const d = rand(0.06, 0.13);
      o.frequency.setValueAtTime(base * rand(0.85, 1), t);
      o.frequency.exponentialRampToValueAtTime(base * rand(1.25, 1.6), t + d * 0.6);
      o.frequency.exponentialRampToValueAtTime(base * rand(0.9, 1.1), t + d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + d + 0.02);
      t += d + rand(0.04, 0.12);
    }
  }

  /** 关键时刻的点缀：wish 许愿 / reveal 揭晓 / chapter 翻牌 */
  accent(kind) {
    if (!this.running) return;
    if (kind === 'reveal') {
      this.bowl(hz(-12), 0.9);
      [0, 4, 7, 12, 16].forEach((s, i) => setTimeout(() => this.chime(12 + PENTA[i % 5] + (i > 2 ? 12 : 0)), 600 + i * 260));
    } else if (kind === 'wish') this.chime(24 + pick(PENTA));
    else if (kind === 'chapter') this.bowl(hz(pick([-5, 0])), 0.35);
  }

  stop(fade = 2.5) {
    if (!this.ctx || !this.running) return Promise.resolve();
    const ctx = this.ctx;
    this.running = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setValueAtTime(this.master.gain.value, ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(0, ctx.currentTime + fade);
    if (this.track) this.track.el.pause();
    return new Promise((res) =>
      setTimeout(() => {
        for (const b of this.beds || []) {
          try {
            b.stop();
          } catch {
            /* ignore */
          }
        }
        this.beds = [];
        ctx.suspend?.();
        res();
      }, fade * 1000 + 50)
    );
  }
}

/** 页面之间的约定：子页面（iframe 里的 quiz / studio）用 postMessage 告诉外壳现在在哪一步 */
export function tellShell(type, data = {}) {
  try {
    if (window.parent && window.parent !== window) window.parent.postMessage({ source: 'genie', type, ...data }, location.origin);
  } catch {
    /* ignore */
  }
}

/** 子页面是不是在许愿模式里（?mode=wish） */
export function isWishMode() {
  try {
    return new URLSearchParams(location.search).get('mode') === 'wish';
  } catch {
    return false;
  }
}
