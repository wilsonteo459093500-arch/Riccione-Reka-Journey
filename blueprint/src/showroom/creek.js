// 展厅开场的溪水声：浏览器现场合成（Web Audio），不用另找音档、没有版权问题。
//   水流的「身体」= 粉红噪声过一道带通（中心频率慢慢飘）；
//   水花的「细碎声」= 另一段噪声过高频带通，音量随机起伏（像水流过石头）。
// 音量很轻；静音 / 淡出都是平滑的。浏览器没有 Web Audio（或被挡住）时什么都不做。

const QUIET = { start() {}, resume() {}, setMuted() {}, fadeOut() {}, stop() {} };

/** 一段可以无缝循环的粉红噪声（Paul Kellet 滤波：前后没有直流漂移，接缝听不出来） */
function pinkBuffer(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i += 1) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    // 头尾 50 ms 交叉淡化，循环接缝更顺
    const x = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < x; i += 1) {
      const k = i / x;
      d[i] = d[i] * k + d[len - x + i] * (1 - k);
    }
  }
  return buf;
}

/**
 * @param {{ volume?:number }} opts
 * @returns {{ start():void, resume():void, setMuted(m:boolean):void, fadeOut(ms?:number):void, stop():void }}
 */
export function createCreek({ volume = 0.2 } = {}) {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return QUIET;
  let ctx;
  try {
    ctx = new AC();
  } catch {
    return QUIET;
  }
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const buf = pinkBuffer(ctx, 7);
  const nodes = [];
  let started = false;
  let muted = false;
  let closed = false;
  let timer = 0;

  // 水流
  const body = ctx.createBufferSource();
  body.buffer = buf;
  body.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 650;
  bp.Q.value = 0.55;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.06;
  const lfoAmt = ctx.createGain();
  lfoAmt.gain.value = 160;
  lfo.connect(lfoAmt).connect(bp.frequency);
  const bodyGain = ctx.createGain();
  bodyGain.gain.value = 0.9;
  body.connect(bp).connect(bodyGain).connect(master);

  // 水花
  const ripple = ctx.createBufferSource();
  ripple.buffer = buf;
  ripple.loop = true;
  ripple.playbackRate.value = 1.13;
  const hp = ctx.createBiquadFilter();
  hp.type = 'bandpass';
  hp.frequency.value = 2600;
  hp.Q.value = 1.1;
  const rippleGain = ctx.createGain();
  rippleGain.gain.value = 0.15;
  ripple.connect(hp).connect(rippleGain).connect(master);
  nodes.push(body, ripple, lfo);

  const babble = () => {
    if (closed) return;
    const now = ctx.currentTime;
    rippleGain.gain.setTargetAtTime(0.06 + Math.random() * 0.32, now, 0.12 + Math.random() * 0.25);
    hp.frequency.setTargetAtTime(2000 + Math.random() * 1800, now, 0.3);
    timer = setTimeout(babble, 220 + Math.random() * 700);
  };

  const level = () => (muted ? 0 : volume);
  const rampTo = (v, sec) => {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(v, now + sec);
  };

  return {
    start() {
      if (closed || started) return;
      started = true;
      ctx.resume?.().catch(() => {});
      const t = ctx.currentTime;
      body.start(t);
      ripple.start(t, 3.1);
      lfo.start(t);
      babble();
      rampTo(level(), 3);
    },
    /** 浏览器还没允许出声（没有点击过）：第一次点击时再叫一次 */
    resume() {
      if (!closed) ctx.resume?.().catch(() => {});
    },
    setMuted(m) {
      muted = !!m;
      if (!closed && started) rampTo(level(), 0.6);
    },
    fadeOut(ms = 2500) {
      if (closed) return;
      rampTo(0, ms / 1000);
      setTimeout(() => this.stop(), ms + 100);
    },
    stop() {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      for (const n of nodes) {
        try {
          n.stop();
        } catch {
          /* 没开始过 */
        }
      }
      ctx.close?.().catch(() => {});
    },
  };
}
