// 房主手机：收别人的动作 → 用房间规则判定 → 把每个人该看的画面送回去。
// 房间状态存在房主手机里（重新整理页面也接得回来）。

import * as R from './room.js';
import { makeRng } from '../lib/rng.js';

export const PING_MS = 8_000;

export class RoomHost {
  /**
   * @param {object} o
   * @param {object} o.room        现在的房间状态
   * @param {object} o.transport   createTransport(`room:${code}`)
   * @param {(room)=>void} [o.persist]  每次变动后存起来
   * @param {(view)=>void} [o.onView]   房主自己的画面
   * @param {(err)=>void} [o.onError]
   * @param {()=>number} [o.now]
   */
  constructor({ room, transport, persist, onView, onError, now = () => Date.now(), rng = makeRng() }) {
    this.room = room;
    this.t = transport;
    this.persist = persist || (() => {});
    this.onView = onView || (() => {});
    this.onError = onError || (() => {});
    this.now = now;
    this.rng = rng;
    this.onlineSig = '';
    this.timer = null;
    this.offs = [];
  }

  start() {
    this.offs.push(this.t.onMessage((m) => this.receive(m)));
    this.offs.push(this.t.onStatus((s) => s === 'online' && this.broadcastAll()));
    this.timer = setInterval(() => this.tick(), PING_MS);
    this.emitSelf();
    if (this.t.status() === 'online') this.broadcastAll();
    return this;
  }

  stop() {
    clearInterval(this.timer);
    this.offs.forEach((off) => off());
    this.offs = [];
  }

  close() {
    this.t.send({ t: 'closed', from: 'host' });
    this.stop();
  }

  get pid() {
    return this.room.hostPid;
  }

  view(pid = this.pid) {
    return R.viewFor(this.room, pid, this.now());
  }

  emitSelf() {
    this.onView(this.view());
  }

  sigOnline() {
    return this.view().players.map((p) => (p.online ? 1 : 0)).join('');
  }

  tick() {
    this.t.send({ t: 'ping', from: 'host', ver: this.room.ver });
    const sig = this.sigOnline();
    if (sig !== this.onlineSig) {
      this.onlineSig = sig;
      this.broadcastAll();
      this.emitSelf();
    }
  }

  sendState(pid) {
    this.t.send({ t: 'state', from: 'host', to: pid, view: this.view(pid) });
  }

  broadcastAll() {
    for (const p of this.room.players) if (p.pid !== this.pid) this.sendState(p.pid);
    this.onlineSig = this.sigOnline();
  }

  apply(pid, msg) {
    const before = this.room;
    const prevPlayers = new Set(before.players.map((p) => p.pid));
    this.room = R.handle(before, pid, msg, { now: this.now(), rng: this.rng });
    if (this.room.ver !== before.ver) {
      this.persist(this.room);
      // 被请出去的人要通知
      for (const k of this.room.kicked) {
        if (!before.kicked.includes(k) && prevPlayers.has(k)) this.t.send({ t: 'kicked', from: 'host', to: k });
      }
      this.broadcastAll();
      this.emitSelf();
    }
  }

  /** 别人传来的 */
  receive(m) {
    if (!m || m.from === 'host' || typeof m.pid !== 'string') return;
    try {
      this.apply(m.pid, m);
      // 打招呼一定回一次画面（就算没变）
      if (m.t === 'hello' && this.room.players.some((p) => p.pid === m.pid)) this.sendState(m.pid);
    } catch (e) {
      const code = e.code || 'error';
      if (code === 'kicked') this.t.send({ t: 'kicked', from: 'host', to: m.pid });
      else this.t.send({ t: 'err', from: 'host', to: m.pid, code, seq: m.seq });
    }
  }

  /** 房主自己按的 */
  act(action) {
    try {
      this.apply(this.pid, { t: 'act', action });
      return true;
    } catch (e) {
      this.onError(e.code || 'error');
      return false;
    }
  }
}
