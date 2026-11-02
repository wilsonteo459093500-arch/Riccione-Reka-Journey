// 板材导入的 worker：一次一张（解码 → 统计 → 出图），结果（几百字节 + 三张小 WebP）发回主线程。
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
