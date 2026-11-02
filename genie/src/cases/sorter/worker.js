// 案例整理的 worker：一次一张照片（解码 → 分析 / 压缩 / 预览），结果（几百字节 + 一张小图）发回主线程。
import { runTask } from './tasks.js';

self.onmessage = async (e) => {
  const { id, task } = e.data || {};
  try {
    const out = await runTask(task);
    self.postMessage({ id, ok: true, out });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
