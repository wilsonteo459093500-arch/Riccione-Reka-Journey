// 展厅播放：在背景线程里分析效果图，不卡住滑动
//   默认：「从无到有」（线稿边缘、上色先后）
//   task 'cabinets'：「毛坯 → 柜子一件件出现」（比对毛坯图 / 按框分组 + 线稿）
import { analyseSketch } from './sketch.js';
import { compareShell, boxLabels, analyseCabinets } from './cabinets.js';

self.onmessage = (e) => {
  const { id, W, H, buf, task } = e.data;
  try {
    const data = new Uint8ClampedArray(buf);
    if (task === 'cabinets') {
      const { shellBuf, boxes, crop } = e.data;
      const lab = shellBuf ? compareShell(data, new Uint8ClampedArray(shellBuf), W, H) : { ok: true, ...boxLabels(boxes, W, H, crop) };
      if (!lab.ok) {
        self.postMessage({ id, refused: lab.why });
        return;
      }
      const an = analyseCabinets(data, W, H, lab.labels, lab.pieces);
      const bufs = [an.mag, an.order, an.reveal, an.label, an.w, an.rise].map((a) => a.buffer);
      self.postMessage({ id, an: { mag: an.mag, order: an.order, reveal: an.reveal, label: an.label, w: an.w, rise: an.rise, n: an.n } }, bufs);
      return;
    }
    const an = analyseSketch(data, W, H);
    self.postMessage({ id, mag: an.mag, order: an.order, reveal: an.reveal }, [an.mag.buffer, an.order.buffer, an.reveal.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
