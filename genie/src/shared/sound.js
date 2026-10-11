// 小小的音效（WebAudio 现场合成，不用任何音频文件）。可静音，记在本机。
// 声音是「仪式感」的一部分：翻牌、许愿、揭晓，各有一个声音。

const KEY = 'genie.mute';
let ctx = null;
let muted = (() => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;
export function setMuted(v) {
  muted = !!v;
  try {
    localStorage.setItem(KEY, muted ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function ac() {
  if (muted || typeof window === 'undefined') return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq, start, dur, { type = 'sine', gain = 0.08, slide = 0 } = {}) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(start, dur, { gain = 0.05, from = 400, to = 3000 } = {}) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + start;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  pick: () => {
    tone(660, 0, 0.12, { type: 'triangle', gain: 0.07 });
    tone(990, 0.05, 0.14, { type: 'sine', gain: 0.05 });
  },
  tap: () => tone(520, 0, 0.07, { type: 'triangle', gain: 0.04 }),
  flip: () => noise(0, 0.28, { gain: 0.06, from: 600, to: 4000 }),
  rub: () => noise(0, 0.12, { gain: 0.025, from: 1200, to: 2400 }),
  wish: () => [784, 988, 1175].forEach((f, i) => tone(f, i * 0.07, 0.25, { gain: 0.05 })),
  chime: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.5, { type: 'sine', gain: 0.055 })),
  summon: () => {
    noise(0, 0.9, { gain: 0.07, from: 300, to: 5000 });
    tone(220, 0, 0.9, { type: 'sine', gain: 0.06, slide: 4 });
  },
  nope: () => tone(260, 0, 0.16, { type: 'square', gain: 0.025, slide: 0.7 }),
};
