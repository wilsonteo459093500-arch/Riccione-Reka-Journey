// 通用的 worker 池（几个 worker 一起做重活，页面不卡；有「急的」队列）。和 src/cases/sorter/pool.js 同一个做法，
// 只是 worker 由调用的人给（Vite 要在调用的那个文件里写 new Worker(new URL('./worker.js', import.meta.url))）。
// 板材导入先用（src/cases/boards/）；案例整理以后可以换成这个（见 boards/coord.md）。
//   new WorkerPool({ make: () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }), local: runTask, size })
//   浏览器不支持 OffscreenCanvas 的 worker（很旧的 Safari）→ 主线程一个一个做（local），中间让出时间给界面。

const canWorker = () => typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function';

export class WorkerPool {
  constructor({ make, local, size, max = 4 } = {}) {
    const hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
    this.size = size || Math.max(1, Math.min(max, hc - 1));
    this.q = [[], []]; // [0] 急的，[1] 普通
    this.busy = 0;
    this.seq = 0;
    this.workers = [];
    this.waiting = new Map();
    this.localFn = local;
    this.local = !canWorker() || !make;
    this.paused = false;
    if (!this.local) {
      try {
        for (let i = 0; i < this.size; i++) {
          const w = make();
          w.onmessage = (e) => this._done(w, e.data);
          w.onerror = (e) => {
            e?.preventDefault?.();
            this._fail(w, e?.message || 'worker error');
          };
          w.idle = true;
          this.workers.push(w);
        }
      } catch {
        this.local = true;
        for (const w of this.workers) w.terminate();
        this.workers = [];
      }
    }
    if (this.local) this.size = 1;
  }

  /** 加一个任务 → Promise（结果）。urgent：插到最前面 */
  run(task, { urgent = false, transfer } = {}) {
    return new Promise((resolve, reject) => {
      this.q[urgent ? 0 : 1].push({ task, resolve, reject, transfer });
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

  /** 丢掉还没开始的普通任务 */
  clear() {
    for (const j of this.q[1]) j.reject(new Error('cancelled'));
    this.q[1] = [];
  }

  destroy() {
    this.clear();
    for (const j of this.q[0]) j.reject(new Error('cancelled'));
    this.q[0] = [];
    for (const j of this.waiting.values()) j.reject(new Error('cancelled'));
    this.waiting.clear();
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
      if (this.busy || !this.localFn) return;
      const job = this._next();
      if (!job) return;
      this.busy = 1;
      setTimeout(() => {
        Promise.resolve()
          .then(() => this.localFn(job.task))
          .then(job.resolve, job.reject)
          .finally(() => {
            this.busy = 0;
            setTimeout(() => this._pump(), 0);
          });
      }, 0);
      return;
    }
    for (const w of this.workers) {
      if (!w.idle) continue;
      const job = this._next();
      if (!job) return;
      const id = ++this.seq;
      w.idle = false;
      w.job = id;
      this.busy++;
      this.waiting.set(id, job);
      w.postMessage({ id, task: job.task }, job.transfer || []);
    }
  }

  _done(w, msg) {
    const job = this.waiting.get(msg?.id);
    this.waiting.delete(msg?.id);
    w.idle = true;
    w.job = 0;
    this.busy--;
    if (job) {
      if (msg.ok) job.resolve(msg.out);
      else job.reject(new Error(msg.error));
    }
    this._pump();
  }

  _fail(w, error) {
    const job = this.waiting.get(w.job);
    if (!job) return;
    this.waiting.delete(w.job);
    w.idle = true;
    w.job = 0;
    this.busy--;
    job.reject(new Error(error));
    this._pump();
  }
}
