// zs-run.js —— 「演奏者」：把一首曲子的谱子按速度、弹性速度（rubato：句中微微起伏，句尾换气放慢）和
// 人性化的微小误差换算成时刻，交给乐器。每一遍都变一点（装饰音、八度、配器、和声配置、偶尔换段落顺序），
// 但旋律是写好的。只用「时刻」排音，不用 setTimeout —— 在线和离线是同一份代码。

import { parseNotes, parseChords, beatsOf, rng, hashStr, clamp, TAU, stepDown } from './zs-dsp.js';
import * as V from './zs-voices.js';

const MIX = { zheng: 1, pan: 1, kal: 1, harm: 1, flute: 1, pad: 1, drone: 1, deep: 1, bell: 1 };
const WET = { zheng: 0.26, pan: 0.3, kal: 0.36, harm: 0.45, flute: 0.36, pad: 0.5, drone: 0.12, deep: 0.4, bell: 0.5 };

const CACHE = /* @__PURE__ */ new WeakMap();
/** 谱子只解析一次：{ 段落: { beats, lanes } } */
export function prepare(def) {
  let P = CACHE.get(def);
  if (P) return P;
  P = {};
  for (const [sn, S] of Object.entries(def.sections)) {
    const lanes = {};
    let beats = 0;
    for (const [ln, L] of Object.entries(S)) {
      const X = { ...L };
      if (L.kind === 'pad') {
        X.chords = parseChords(L.chords);
        beats = Math.max(beats, X.chords.reduce((a, c) => a + c.d, 0));
      } else {
        X.notes = parseNotes(L.notes);
        if (L.kind !== 'gliss') beats = Math.max(beats, beatsOf(X.notes));
      }
      lanes[ln] = X;
    }
    P[sn] = { beats, lanes };
  }
  CACHE.set(def, P);
  return P;
}

/** 检查：每个声部的拍数都等于段落长度（点缀曲子允许短一点） */
export function checkPiece(def) {
  const out = [];
  for (const [sn, S] of Object.entries(prepare(def))) {
    for (const [ln, L] of Object.entries(S.lanes)) {
      if (L.kind === 'gliss') continue;
      const b = L.kind === 'pad' ? L.chords.reduce((a, c) => a + c.d, 0) : beatsOf(L.notes);
      if (!def.once && Math.abs(b - S.beats) > 1e-6) out.push(`${def.id}.${sn}.${ln}: ${b} ≠ ${S.beats}`);
      if (!def.once && S.beats % (def.meter || 4)) out.push(`${def.id}.${sn}: ${S.beats} beats is not whole bars`);
    }
  }
  return out;
}

export class Run {
  constructor(E, def, t0, o = {}) {
    this.E = E;
    this.def = def;
    this.P = prepare(def);
    this.r = rng(((E.seed ^ hashStr(def.id)) >>> 0) + (o.n || 0) * 7919);
    const c = E.ctx;
    // 淡入、淡出各用一个增益（两条自动化互不干扰：刚淡入一半就要淡出也不会跳）
    const fade = () => {
      const fin = c.createGain();
      const fout = c.createGain();
      fin.gain.value = 0; // 第一个自动化事件之前，增益是它的初始值：必须是 0（不然提前一点点的音会先响、再被切掉 = 咔哒）
      fin.gain.setValueAtTime(0, t0);
      fin.gain.linearRampToValueAtTime(def.gain ?? 1, t0 + Math.max(0.02, o.fadeIn ?? 2.5)); // def.gain：每首曲子的响度校准
      fin.connect(fout);
      return { fin, fout };
    };
    this.dry = fade();
    this.wet = fade();
    this.dry.fout.connect(E.musicIn);
    this.wet.fout.connect(E.musicWet);
    this.bus = {};
    for (const k of Object.keys(MIX)) {
      const g = c.createGain();
      g.gain.value = MIX[k] * (def.mix?.[k] ?? 1);
      const s = c.createGain();
      s.gain.value = WET[k] * (def.wet ?? 1);
      g.connect(this.dry.fin);
      g.connect(s);
      s.connect(this.wet.fin);
      this.bus[k] = g;
    }
    this.padLp = c.createBiquadFilter(); // 铺底的低通，跟着和弦慢慢「呼吸」
    this.padLp.type = 'lowpass';
    this.padLp.Q.value = 0.5;
    this.padLp.frequency.setValueAtTime(def.padTone ?? 1200, t0);
    this.padLp.connect(this.bus.pad);
    this.t = t0;
    this.start = t0; // 任何音都不早于曲子开始的时刻（人性化的微小提前在第一拍会被夹住）
    this.queue = [];
    this.fi = 0;
    this.pass = 0;
    this.form = def.form;
    this.first = true;
    this.intro = !!(o.intro && this.P.I);
    this.endAt = Infinity;
    this.deadAt = Infinity;
    this.ended = false;
    this.drone = null;
  }

  /** t 之后不再出新音；整首在 fade 秒里淡掉（已经在响的余音自然消失） */
  end(t, fade = 4) {
    if (this.ended) return;
    this.ended = true;
    this.endAt = t;
    for (const f of [this.dry, this.wet]) f.fout.gain.setTargetAtTime(0, t, fade / 3.5);
    this.drone?.stop(t, fade);
    this.deadAt = t + fade + 8;
  }

  dispose() {
    try {
      this.dry.fout.disconnect();
      this.wet.fout.disconnect();
    } catch {
      /* ignore */
    }
  }

  pump(h) {
    const E = this.E;
    for (let guard = 0; guard < 4000; guard++) {
      if (!this.queue.length) {
        if (this.done || this.ended || this.t > h) return;
        if (this.t < E.now - 0.5) this.t = E.now + 0.1; // 卡住很久（后台）：从现在重新接上，不补
        this._section();
        continue;
      }
      const ev = this.queue[0];
      if (ev.t > h) return;
      this.queue.shift();
      if (ev.t >= this.endAt) {
        this.queue.length = 0;
        return;
      }
      if (ev.t < E.now - 0.08) continue; // 漏掉的音不补：回来时不会一次全响
      try {
        this._play(ev);
      } catch (e) {
        E.onError?.(e);
      }
    }
  }

  _section() {
    const def = this.def;
    const r = this.r;
    if (def.once && this.fi >= def.form.length) {
      this.done = true;
      this.end(this.t + 6, 0.5);
      return;
    }
    let name;
    if (this.intro) {
      name = 'I';
      this.intro = false;
    } else {
      if (this.fi && this.fi % this.form.length === 0) {
        this.pass++;
        this.form = def.alt && r.chance(0.3) ? def.alt : def.form; // 偶尔换一个段落顺序
      }
      name = this.form[this.fi % this.form.length];
      this.fi++;
    }
    const S = this.P[name];
    const pre = this.first ? def.pre || 0 : 0; // 第一段先让铺底和自然声进来，旋律晚一两拍
    this.first = false;
    const total = S.beats + pre;
    const map = this._map(total, def.meter || 4);
    const t0 = this.t;
    const evs = [];
    for (const L of Object.values(S.lanes)) {
      if (L.kind === 'pad') {
        let b = 0;
        L.chords.forEach((ch, i) => {
          const d = ch.d + (i === 0 ? pre : 0);
          evs.push({ t: t0 + map(b), kind: 'pad', ms: this._voicing(ch.ms), dur: map(b + d) - map(b), v: L.v ?? 0.7, attack: L.attacks?.[i] });
          b += d;
        });
      } else if (L.kind === 'drone') {
        let b = 0;
        L.notes.forEach((n, i) => {
          if (n.m != null) evs.push({ t: t0 + map(b), kind: 'drone', m: n.m, v: n.v });
          b += n.d + (i === 0 ? pre : 0);
        });
      } else if (L.kind === 'gliss') {
        evs.push({ t: t0 + map(L.at + pre), kind: 'gliss', ms: L.notes.map((n) => n.m), v: L.v ?? 0.6, spacing: L.spacing ?? 0.045 });
      } else {
        const inst = this._inst(L);
        const notes = this._vary(L);
        if (!notes) continue; // 这一遍留白
        let b = pre;
        if (inst === 'flute') {
          let ph = [];
          const flush = () => {
            if (ph.length) evs.push({ t: ph[0].t, kind: 'flute', notes: ph });
            ph = [];
          };
          for (const n of notes) {
            if (n.m == null) flush();
            else ph.push({ t: t0 + map(b) + this._jit(L), d: map(b + n.d) - map(b), m: n.m, v: this._vel(n.v), vib: n.vib, grace: n.grace });
            b += n.d;
          }
          flush();
        } else {
          for (const n of notes) {
            if (n.m != null) evs.push({ t: t0 + map(b) + this._jit(L), kind: inst, m: n.m, dur: map(b + n.d) - map(b), v: this._vel(n.v), o: n, spark: L.role === 'spark' });
            b += n.d;
          }
        }
      }
    }
    // 生成层：偶尔用一把短刮奏「滑」进新的段落（第一拍就有旋律时，刮奏落在它前面）
    if (def.gliss && !def.steady && name !== 'I' && r.chance(def.gliss * (this.pass ? 1 : 0.6))) {
      const lead = Object.values(S.lanes).find((L) => L.role === 'lead' && L.notes);
      if (lead && lead.notes[0].m != null) {
        const ms = [];
        let m = lead.notes[0].m;
        for (let k = 0; k < 6; k++) ms.unshift((m = stepDown(m)));
        const sp = 0.042;
        evs.push({ t: t0 + map(pre) - 0.03 - sp * ms.length, kind: 'gliss', ms, v: 0.5, spacing: sp });
      }
    }
    for (const e of evs) {
      if (e.t < this.start) e.t = this.start;
      if (e.notes) for (const n of e.notes) if (n.t < this.start) n.t = this.start;
    }
    evs.sort((a, b) => a.t - b.t);
    this.queue = evs;
    this.t = t0 + map(total);
    this.E.onSection?.(def, name, t0, this.t);
  }

  /** 拍 → 秒：每 4 小节一个呼吸（±2%），句尾最后 15% 慢下来约 10%；每一遍整体速度也有 ±1.5% 的出入 */
  _map(beats, meter) {
    const def = this.def;
    const spb = (60 / def.bpm) * (1 + (this.r() - 0.5) * 0.03);
    const step = 0.25;
    const n = Math.ceil(beats / step) + 2;
    const T = new Float64Array(n + 1);
    const phrase = meter * 4;
    const depth = def.steady ? 0.004 : 0.022;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      T[i] = acc;
      const pos = ((i * step) % phrase) / phrase;
      let f = 1 + depth * Math.sin(TAU * pos);
      if (!def.steady && pos > 0.85) f *= 1 + 0.1 * ((pos - 0.85) / 0.15);
      acc += step * spb * f;
    }
    T[n] = acc;
    return (b) => {
      const x = clamp(b / step, 0, n - 1e-9);
      const i = Math.floor(x);
      return T[i] + (T[i + 1] - T[i]) * (x - i);
    };
  }

  _jit(L) {
    if (this.def.steady) return 0;
    return this.r.gauss() * 0.006 + (L.inst === 'zheng' ? 0.004 : 0); // 古筝稍微「靠后」一点，更松
  }

  _vel(v) {
    return this.def.steady ? v : clamp(v * (1 + this.r.gauss() * 0.06), 0.15, 1);
  }

  _inst(L) {
    if (L.swap && this.pass > 0 && !this.def.steady && this.r.chance(0.35)) return L.swap;
    return L.inst;
  }

  /** 变奏：装饰音重新掷骰子；应答声部第二遍起可能升八度，第三遍起偶尔留白 */
  _vary(L) {
    const r = this.r;
    const P = this.pass;
    const notes = L.notes.map((n) => ({ ...n }));
    if (this.def.steady || L.role === 'bed' || L.role === 'spark') return notes;
    if (L.role === 'answer' && P > 0) {
      if (P >= 2 && r.chance(0.2)) return null;
      if (r.chance(0.25) && notes.every((n) => n.m == null || n.m + 12 <= 86)) notes.forEach((n) => n.m != null && (n.m += 12));
    }
    if (L.inst === 'zheng' || L.inst === 'flute') {
      for (const n of notes) {
        if (n.m == null) continue;
        if (!n.slide && !n.trem && !n.vib && n.d >= 1.5 && r.chance(P ? 0.3 : 0.1)) {
          if (L.inst === 'zheng' && r.chance(0.5)) n.slide = true;
          else n.vib = true;
        }
        if (L.inst === 'zheng' && n.d >= 3 && !n.trem && P && r.chance(0.2)) n.trem = true;
        if (P && (n.slide || n.vib) && r.chance(0.15)) n.slide = n.vib = false;
        if (P && n.d <= 1 && n.d >= 0.5 && r.chance(0.07)) n.grace = true;
      }
    }
    return notes;
  }

  /** 和声配置：第二遍起偶尔把第二低的音翻高八度（同一个和弦，换一种「开」法） */
  _voicing(ms) {
    if (this.def.steady || !this.pass || !this.r.chance(0.35)) return ms;
    const v = [...ms].sort((a, b) => a - b);
    if (v.length >= 3 && v[1] + 12 <= 79) v.push(v.splice(1, 1)[0] + 12);
    return v;
  }

  _play(ev) {
    const E = this.E;
    const b = this.bus;
    switch (ev.kind) {
      case 'zheng':
        return ev.o.trem ? V.zhengTrem(E, b.zheng, ev.t, ev.m, ev.dur, ev.v) : V.zheng(E, b.zheng, ev.t, ev.m, ev.dur, ev.v, ev.o);
      case 'pan':
        return V.handpan(E, b.pan, ev.t, ev.m, ev.dur, ev.v);
      case 'kal':
        return ev.spark && E.layers.chimes ? V.chime(E, b.bell, ev.t, ev.m, ev.v) : V.kalimba(E, b.kal, ev.t, ev.m, ev.dur, ev.v);
      case 'harm':
        return V.harm(E, b.harm, ev.t, ev.m, ev.dur, ev.v);
      case 'deep':
        return E.layers.bowl ? V.bowl(E, b.bell, ev.t, ev.m, ev.v) : V.handpan(E, b.deep, ev.t, ev.m, ev.dur, ev.v * 0.9);
      case 'flute':
        return V.flute(E, b.flute, ev.notes, { bright: this.def.fluteBright ?? 0.5 });
      case 'pad':
        this.padLp.frequency.setTargetAtTime((this.def.padTone ?? 1200) * this.r.range(0.8, 1.2), ev.t, 3);
        return V.pad(E, this.padLp, ev.t, ev.ms, ev.dur, ev.v, { attack: ev.attack ?? 2.6 });
      case 'drone':
        if (!this.drone) this.drone = V.droneVoice(E, b.drone, ev.t - 0.05);
        return this.drone.to(ev.m, ev.t, ev.v);
      case 'gliss':
        return V.zhengGliss(E, b.zheng, ev.t, ev.ms, ev.v, ev.spacing);
      default:
        return undefined;
    }
  }
}
