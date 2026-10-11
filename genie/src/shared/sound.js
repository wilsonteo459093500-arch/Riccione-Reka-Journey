// 小小的音效（WebAudio 现场合成，不用任何音频文件）。可静音，记在本机。
// 声音是「仪式感」的一部分：翻牌、许愿、揭晓，各有一个声音。
//
// iPad Safari：AudioContext 只能在「手指点下去」的那一刻创建 / 恢复。擦神灯用的是 setInterval / pointermove，
// 都不算手势，所以模块一载入就挂几个捕获阶段的监听（pointerup / touchend / keydown / click）：
// 客人打名字、点「开始」的那一下就把声音解锁，到了神灯就有声音。解锁成功后监听自己拆掉。

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

/** persist:false = 只管这一次（许愿模式外壳的「关掉音效」不要记一辈子） */
export function setMuted(v, { persist = true } = {}) {
  muted = !!v;
  if (!persist) return;
  try {
    localStorage.setItem(KEY, muted ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function ensure() {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    // iOS 会停在 'suspended' 或 'interrupted'（来电、切 App）：只要不是 running 就恢复
    if (ctx.state !== 'running') ctx.resume?.().catch?.(() => {});
    return ctx;
  } catch {
    return null;
  }
}

function ac() {
  if (muted) return null;
  return ensure();
}

/** 在手势里调用：建好 / 恢复 AudioContext，再播一个 1 个采样的静音（iOS 解锁的老规矩） */
export function unlock() {
  const a = ensure();
  if (!a) return false;
  try {
    const s = a.createBufferSource();
    s.buffer = a.createBuffer(1, 1, 22050);
    s.connect(a.destination);
    s.start(0);
  } catch {
    /* ignore */
  }
  return a.state === 'running';
}

if (typeof window !== 'undefined') {
  const EVENTS = ['pointerup', 'touchend', 'keydown', 'click'];
  const onGesture = () => {
    if (unlock() || ctx?.state === 'running') EVENTS.forEach((e) => window.removeEventListener(e, onGesture, true));
  };
  EVENTS.forEach((e) => window.addEventListener(e, onGesture, { capture: true, passive: true }));
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
    tone(660, 0, 0.12, { type: 'triangle', gain: 0.06 });
    tone(990, 0.05, 0.14, { type: 'sine', gain: 0.045 });
  },
  tap: () => tone(520, 0, 0.07, { type: 'triangle', gain: 0.035 }),
  flip: () => noise(0, 0.28, { gain: 0.05, from: 600, to: 4000 }),
  rub: () => noise(0, 0.12, { gain: 0.022, from: 1200, to: 2400 }),
  wish: () => [784, 988, 1175].forEach((f, i) => tone(f, i * 0.07, 0.25, { gain: 0.045 })),
  chime: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.5, { type: 'sine', gain: 0.05 })),
  summon: () => {
    noise(0, 0.9, { gain: 0.06, from: 300, to: 5000 });
    tone(220, 0, 0.9, { type: 'sine', gain: 0.055, slide: 4 });
  },
  // 雷区：轻轻的一声「嗯」，不是蜂鸣
  nope: () => tone(330, 0, 0.18, { type: 'sine', gain: 0.03, slide: 0.8 }),
};
