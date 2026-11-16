// 展厅播放：在背景线程里分析效果图（线稿边缘、上色先后），不卡住滑动
import { analyseSketch } from './sketch.js';

self.onmessage = (e) => {
  const { id, W, H, buf } = e.data;
  try {
    const an = analyseSketch(new Uint8ClampedArray(buf), W, H);
    self.postMessage({ id, mag: an.mag, order: an.order, reveal: an.reveal }, [an.mag.buffer, an.order.buffer, an.reveal.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
