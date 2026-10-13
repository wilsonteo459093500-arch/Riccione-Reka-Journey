// zs-wave-worker.js —— 在后台线程里算「纯数学」的音频数据，主线程只负责把结果装进 AudioBuffer（不和动画抢帧）：
//   · 乐器波表（古筝一根弦 ≈ 10–40 ms 的计算）：{ kind, m, sr } → { kind, m, sr, f0, data }
//   · 自然声的循环噪声、混响脉冲（开场那一下最重的计算）：{ job: 'buf', key, sr, what: 'noise' | 'ir', args } → { job, key, sr, chans }
// 用法（zensong.js 自己会建）：new Worker(new URL('./zs-wave-worker.js', import.meta.url), { type: 'module' })
import { waveData } from './zs-wavedata.js';
import { loopNoiseData, reverbIRData } from './zs-dsp.js';

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.job === 'buf') {
    try {
      const { key, sr, what, args = [] } = msg;
      const chans = what === 'ir' ? reverbIRData(sr, ...args) : loopNoiseData(sr, ...args);
      self.postMessage({ job: 'buf', key, sr, chans }, chans.map((c) => c.buffer));
    } catch (err) {
      self.postMessage({ job: 'buf', key: msg.key, sr: msg.sr, error: String(err?.message || err) });
    }
    return;
  }
  const { kind, m, sr } = msg;
  try {
    const { data, f0 } = waveData(kind, m, sr);
    self.postMessage({ kind, m, sr, f0, data }, [data.buffer]);
  } catch (err) {
    self.postMessage({ kind, m, sr, error: String(err?.message || err) });
  }
};
