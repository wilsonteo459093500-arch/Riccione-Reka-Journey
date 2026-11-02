// zs-wavedata.js —— 乐器波表的「纯数学」：给一个乐器、一个音高、一个采样率，算出一段 Float32Array。
// 不碰 Web Audio、不碰 DOM：主线程（离线渲染、兜底）和 Web Worker（现场播放时不占动画的那一帧）用的是同一份代码。

import { mhz, clamp, ksPluck, modal } from './zs-dsp.js';

/** kind：zheng 古筝 · pan 手碟 · kal 卡林巴 · harm 古筝泛音；m = MIDI 音高。返回 { data, f0 }（f0 = 波表里真正的音高） */
export function waveData(kind, m, sr) {
  const f = mhz(m);
  if (kind === 'zheng') {
    const t60 = clamp(5.2 - (m - 50) * 0.11, 1.5, 5.4);
    const s = ksPluck(sr, f, clamp(t60 * 0.85, 1.4, 4.2), { bright: 0.62, pos: 0.12, soft: 0.38, t60, seed: m * 3 + 1 });
    return { data: s.data, f0: s.f0 };
  }
  if (kind === 'pan') {
    const t1 = clamp(5.2 - (m - 50) * 0.09, 2.2, 5.2);
    const data = modal(sr, f, clamp(t1 * 0.9, 2, 4.6), [[1, 1, t1, 0.45], [2, 0.42, t1 * 0.55, 0.7], [3, 0.17, t1 * 0.3, 1.1], [4.1, 0.05, t1 * 0.15]], { attack: 6, thump: 0.1, seed: m * 5 + 2 });
    return { data, f0: f };
  }
  if (kind === 'kal') {
    const data = modal(sr, f, 2.4, [[1, 1, 2.0, 0.25], [5.93, 0.14, 0.3], [11.4, 0.035, 0.1]], { attack: 2.5, thump: 0.05, seed: m * 7 + 3 });
    return { data, f0: f };
  }
  // 'harm' 古筝泛音（m = 听到的音高）：轻触弦的中点，纯净、像玉
  const data = modal(sr, f, 3, [[1, 1, 2.6, 0.15], [2, 0.18, 1.0], [3, 0.05, 0.45]], { attack: 6, thump: 0.02, seed: m * 11 + 4 });
  return { data, f0: f };
}
