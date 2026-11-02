// worker 池：几个 worker 一起看照片，页面不卡。有优先级（员工正在看的那一行的缩略图、预览先做）。
// 浏览器不支持 OffscreenCanvas 的 worker（很旧的 Safari）→ 主线程一张一张做，中间让出时间给界面。

import { runTask } from './tasks.js';

const canWorker = () => typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function';

export class Pool {
  constructor({ size } = {}) {
    const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
    this.size = size || Math.max(2, Math.min(6, hc - 1));
    this.q = [[], []]; // [0] = 急的（界面上看得到的），[1] = 普通（批量分析）
    this.busy = 0;
    this.seq = 0;
    this.workers = [];
    this.waiting = new Map();
    this.local = !canWorker();
    this.paused = false;
    if (!this.local) {
      try {
        for (let i = 0; i < this.size; i++) {
          const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
          w.onmessage = (e) => this._done(w, e.data);
          w.onerror = () => {
            /* 单个任务失败在 onmessage 里报；这里只防止整个页面报错 */
          };
          w.idle = true;
          this.workers.push(w);
        }
      } catch {
        this.local = true;
        this.workers = [];
      }
    }
    if (this.local) this.size = 1;
  }

  /** 加一个任务 → Promise（结果）。urgent：插到最前面 */
  run(task, { urgent = false } = {}) {
    return new Promise((resolve, reject) => {
      this.q[urgent ? 0 : 1].push({ task, resolve, reject });
      this._pump();
    });
  }

  pending() {
    return this.q[0].length + this.q[1].length + this.busy;
  }

  pause(on) {
    this.paused = on;
    if (!on) this._pump();
  }

  /** 丢掉还没开始的普通任务（换了文件夹 / 离开页面） */
  clear() {
    for (const j of this.q[1]) j.reject(new Error('cancelled'));
    this.q[1] = [];
  }

  destroy() {
    this.clear();
    for (const j of this.q[0]) j.reject(new Error('cancelled'));
    this.q[0] = [];
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }

  _next() {
    if (this.q[0].length) return this.q[0].shift();
    if (!this.paused && this.q[1].length) return this.q[1].shift();
    return null;
  }

  _pump() {
    if (this.local) {
      if (this.busy) return;
      const job = this._next();
      if (!job) return;
      this.busy = 1;
      const go = () =>
        runTask(job.task)
          .then(job.resolve, job.reject)
          .finally(() => {
            this.busy = 0;
            setTimeout(() => this._pump(), 0); // 让界面喘口气
          });
      setTimeout(go, 0);
      return;
    }
    for (const w of this.workers) {
      if (!w.idle) continue;
      const job = this._next();
      if (!job) return;
      const id = ++this.seq;
      w.idle = false;
      this.busy++;
      this.waiting.set(id, job);
      w.postMessage({ id, task: job.task });
    }
  }

  _done(w, msg) {
    const job = this.waiting.get(msg?.id);
    this.waiting.delete(msg?.id);
    w.idle = true;
    this.busy--;
    if (job) {
      if (msg.ok) job.resolve(msg.out);
      else job.reject(new Error(msg.error));
    }
    this._pump();
  }
}
