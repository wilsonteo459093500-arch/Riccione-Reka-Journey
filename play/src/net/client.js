// 加入的人：跟房主打招呼 → 收自己的画面 → 把动作传给房主。
// 房主太久没声音 → 显示「等房主回来」；手机切回来自动再打招呼。

export const HOST_AWAY_MS = 25_000;
export const HB_MS = 10_000;

export class RoomClient {
  /**
   * @param {object} o
   * @param {string} o.pid
   * @param {string} o.name
   * @param {object} o.transport
   * @param {(view)=>void} o.onView
   * @param {(ev)=>void}   o.onEvent   { type: 'status' | 'error' | 'kicked' | 'closed', ... }
   */
  constructor({ pid, name, transport, onView, onEvent, now = () => Date.now() }) {
    this.pid = pid;
    this.name = name;
    this.t = transport;
    this.onView = onView || (() => {});
    this.onEvent = onEvent || (() => {});
    this.now = now;
    this.ver = 0;
    this.lastHost = 0;
    this.gotState = false;
    this.ended = false;
    this.seq = 0;
    this.state = 'connecting'; // connecting | joined | host-away | offline
    this.offs = [];
  }

  start() {
    this.offs.push(this.t.onMessage((m) => this.receive(m)));
    this.offs.push(
      this.t.onStatus((s) => {
        if (s === 'online') this.hello();
        this.updateState();
      }),
    );
    this.hbTimer = setInterval(() => {
      if (this.ended) return;
      this.send({ t: 'hb' });
      this.updateState();
    }, HB_MS);
    // 还没收到画面就每 3 秒再打一次招呼（房主可能刚好在切画面）
    this.helloTimer = setInterval(() => !this.gotState && !this.ended && this.hello(), 3_000);
    if (this.t.status() === 'online') this.hello();
    this.onVisible = () => document.visibilityState === 'visible' && !this.ended && this.hello();
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisible);
    return this;
  }

  stop() {
    clearInterval(this.hbTimer);
    clearInterval(this.helloTimer);
    this.offs.forEach((off) => off());
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisible);
  }

  send(m) {
    this.t.send({ ...m, pid: this.pid });
  }

  hello() {
    this.send({ t: 'hello', name: this.name });
  }

  setName(name) {
    this.name = name;
    this.hello();
  }

  act(action) {
    this.seq += 1;
    this.send({ t: 'act', action, seq: this.seq });
  }

  leave() {
    this.send({ t: 'bye' });
    this.ended = true;
    this.stop();
  }

  updateState() {
    let s;
    if (this.t.status() !== 'online') s = 'offline';
    else if (!this.gotState) s = 'connecting';
    else if (this.now() - this.lastHost > HOST_AWAY_MS) s = 'host-away';
    else s = 'joined';
    if (s !== this.state) {
      this.state = s;
      this.onEvent({ type: 'status', status: s });
    }
  }

  receive(m) {
    if (!m || m.from !== 'host' || this.ended) return;
    this.lastHost = this.now();
    if (m.to && m.to !== this.pid) {
      this.updateState();
      return;
    }
    switch (m.t) {
      case 'state':
        if (m.view && m.view.ver >= this.ver) {
          this.ver = m.view.ver;
          this.gotState = true;
          this.onView(m.view);
        }
        break;
      case 'ping':
        // 房主的版本比我新（可能漏了一则）→ 再要一次
        if (this.gotState && m.ver > this.ver) this.hello();
        break;
      case 'err':
        this.onEvent({ type: 'error', code: m.code });
        break;
      case 'kicked':
        this.ended = true;
        this.onEvent({ type: 'kicked' });
        this.stop();
        return;
      case 'closed':
        this.ended = true;
        this.onEvent({ type: 'closed' });
        this.stop();
        return;
      default:
        break;
    }
    this.updateState();
  }
}
