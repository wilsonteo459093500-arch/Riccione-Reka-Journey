// node test/sfx.test.mjs（npm test 会一起跑） —— 不需要浏览器：用一个「会记账」的假 AudioContext 检查每一个音效的配方。
//   · 音效表完整（老板 / 主管点名的每一种都有；fx.js 报的每一个名字都接得住）
//   · 每一个有音高的音都在 D 宫五声（D E F# A B）上
//   · 防「喀」：每个音量包络都从 0 开始、起音 ≥ 0.8 ms；没有排在过去的自动化；没有 NaN；停的时间在开始之后
//   · 语义默认、家族名、擦神灯参数、旧 API、fx 适配器
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(new URL(import.meta.url).pathname);
const mod = await import(pathToFileURL(path.join(here, '../src/shared/sfx.js')).href);
const { KIT, NAMES, TIERS, MATERIALS, GROUPS, synth, room, semanticSound, rubParams, step, PITCH_CLASSES, Sfx, sfx, isMuted, setMuted, unlock } = mod;

let pass = 0;
let fail = 0;
const queue = [];
const test = (name, fn) => queue.push([name, fn]); // 按顺序跑（可以是 async）

// ───────── 假的 AudioContext：只记账 ─────────
class Param {
  constructor(owner, name, v = 0) {
    this.owner = owner;
    this.name = name;
    this.value = v;
    this.calls = [];
  }
  _rec(kind, v, t, extra) {
    this.calls.push({ kind, v, t, extra });
    return this;
  }
  setValueAtTime(v, t) {
    return this._rec('set', v, t);
  }
  linearRampToValueAtTime(v, t) {
    return this._rec('lin', v, t);
  }
  exponentialRampToValueAtTime(v, t) {
    return this._rec('exp', v, t);
  }
  setTargetAtTime(v, t, tc) {
    return this._rec('target', v, t, tc);
  }
  cancelScheduledValues(t) {
    return this._rec('cancel', 0, t);
  }
}
class Node {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    this.outs = [];
    ctx.nodes.push(this);
  }
  connect(n) {
    this.outs.push(n);
    return n;
  }
  disconnect() {}
}
class Ctx {
  constructor(sr = 48000) {
    this.sampleRate = sr;
    this.currentTime = 0;
    this.nodes = [];
    this.destination = new Node(this, 'dest');
    this.state = 'running';
  }
  createGain() {
    const n = new Node(this, 'gain');
    n.gain = new Param(n, 'gain', 1);
    return n;
  }
  createOscillator() {
    const n = new Node(this, 'osc');
    n.frequency = new Param(n, 'frequency', 440);
    n.detune = new Param(n, 'detune', 0);
    n.type = 'sine';
    n.start = (t) => (n.t0 = t);
    n.stop = (t) => (n.t1 = t);
    return n;
  }
  createBiquadFilter() {
    const n = new Node(this, 'biquad');
    n.frequency = new Param(n, 'frequency', 350);
    n.Q = new Param(n, 'Q', 1);
    n.gain = new Param(n, 'gain', 0);
    n.type = 'lowpass';
    return n;
  }
  createBufferSource() {
    const n = new Node(this, 'src');
    n.playbackRate = new Param(n, 'playbackRate', 1);
    n.start = (t, off) => {
      n.t0 = t;
      n.off = off;
    };
    n.stop = (t) => (n.t1 = t);
    return n;
  }
  createStereoPanner() {
    const n = new Node(this, 'pan');
    n.pan = new Param(n, 'pan', 0);
    return n;
  }
  createConvolver() {
    return new Node(this, 'conv');
  }
  createWaveShaper() {
    return new Node(this, 'shaper');
  }
  createDynamicsCompressor() {
    const n = new Node(this, 'comp');
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new Param(n, k, 0);
    return n;
  }
  createBuffer(ch, len, sr) {
    const data = Array.from({ length: ch }, () => new Float32Array(len));
    return { numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: (i) => data[i] };
  }
}

const near = (f) => {
  const m = 69 + 12 * Math.log2(f / 440);
  const r = Math.round(m);
  return { midi: r, cents: (m - r) * 100, pc: ((r % 12) + 12) % 12 };
};

/** 把一声排进假 ctx，收集「音」：每个开始时间最响的那个振荡器 = 基音（泛音、噪声、往下掉的「咚」不算） */
function notesOf(name, opts = {}) {
  const ctx = new Ctx();
  const before = ctx.nodes.length;
  const v = synth(ctx, name, 1, { rr: 1, ...opts }, 1234);
  const oscs = ctx.nodes.slice(before).filter((n) => n.kind === 'osc');
  const items = oscs.map((o) => {
    const g = o.outs.find((n) => n.kind === 'gain');
    const lin = g?.gain.calls.find((c) => c.kind === 'lin');
    const f0 = o.frequency.calls.find((c) => c.kind === 'set')?.v ?? o.frequency.value;
    const f1 = o.frequency.calls.find((c) => c.kind === 'exp')?.v;
    return { o, t0: o.t0, f0, f1, peak: lin ? lin.v : 0, gain: g };
  });
  const groups = new Map();
  for (const it of items) {
    const k = it.t0.toFixed(4);
    if (!groups.has(k) || groups.get(k).peak < it.peak) groups.set(k, it);
  }
  return { ctx, v, items, fundamentals: [...groups.values()] };
}

console.log('WISH 音效 · sfx.js tests');

test('every sound has en / tier / material / group / make (no Chinese strings or hex colours in the module itself)', () => {
  assert.ok(NAMES.length >= 40, `only ${NAMES.length} sounds`);
  const groups = new Set(GROUPS.map((g) => g.id));
  for (const n of NAMES) {
    const d = KIT[n];
    assert.ok(d.en && /[A-Za-z]/.test(d.en), `${n}: en`);
    assert.ok(TIERS[d.tier], `${n}: tier ${d.tier}`);
    assert.ok(MATERIALS[d.mat], `${n}: mat ${d.mat}`);
    assert.ok(groups.has(d.group), `${n}: group ${d.group}`);
    assert.equal(typeof d.make, 'function', `${n}: make`);
    assert.ok(d.send >= 0 && d.send < 0.5, `${n}: send ${d.send}`);
  }
  // genie 的 i18n / palette 测试：src 里不许有不经过 t() 的中文字符串、不许写死颜色 —— 去掉注释后检查
  const src = fs.readFileSync(new URL('../src/shared/sfx.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/(['"`])[^'"`\n]*[\u4e00-\u9fff][^'"`\n]*\1/.test(src), 'Chinese string literal in sfx.js');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src), 'hex colour in sfx.js');
});

test('board metadata (sfx-meta.js, only for the demo board) covers every sound', async () => {
  let meta;
  try {
    meta = await import(pathToFileURL(path.join(here, '../proto/sfx-meta.js')).href);
  } catch {
    return; // 搬进 genie 后没有这一份：跳过
  }
  for (const n of NAMES) assert.ok(meta.META[n] && /[一-鿿]/.test(meta.META[n].zh) && meta.META[n].use.length > 4, `${n}: meta`);
  for (const m of Object.keys(MATERIALS)) assert.ok(meta.MATERIALS_META[m]?.color, `${m}: colour`);
});

test('the brief\'s full kit is present', () => {
  const need = 'tap toggleOn toggleOff select deselect confirm back open close slider plus minus chipAdd chipRemove flip whoosh scan dissolve reveal tick achievement error type grab drop page rub wish'.split(' ');
  for (const n of need) assert.ok(KIT[n], `missing ${n}`);
});

test('every name fx.js reports is handled by the adapter', () => {
  const s = new Sfx();
  const got = [];
  s.play = (n, o) => (got.push([n, o]), { stop() {} });
  for (const n of ['tap', 'scan', 'holo', 'dissolve', 'condense', 'fly', 'land', 'mote', 'tick', 'stream', 'flip', 'flipLand', 'wipe']) {
    got.length = 0;
    s.fx(n, n === 'land' ? 2 : n === 'tick' ? { value: 3, up: true } : n === 'fly' ? { distance: 500 } : n === 'scan' ? { holo: false } : {});
    assert.equal(got.length, 1, `fx '${n}' did not play`);
    assert.ok(KIT[got[0][0]], `fx '${n}' → unknown ${got[0][0]}`);
  }
  s.fx('scan', { holo: true });
  assert.equal(got.at(-1)[0], 'holo');
  s.fx('wipe');
  assert.equal(got.at(-1)[0], 'page');
  s.fx('fly', { distance: 900 });
  assert.deepEqual(got.at(-1), ['whoosh', { distance: 900 }]);
  s.fx('land', 3);
  assert.equal(got.at(-1)[1].step, 3);
});

test('fx "tap" right after a delegated press is swallowed (no double sound)', () => {
  const s = new Sfx();
  const got = [];
  s.play = (n) => (got.push(n), { stop() {} });
  s.press = { at: performance.now(), name: 'select' };
  s.fx('tap');
  assert.equal(got.length, 0);
  s.press = { at: performance.now() - 1000, name: 'select' };
  s.fx('tap');
  assert.deepEqual(got, ['tap']);
});

test('legacy sfx.tap() / pick() after a delegated press: no second sound; specific beats generic', () => {
  const s = new Sfx();
  const got = [];
  s.play = (n) => (got.push(n), { stop() {} });
  s.press = { at: performance.now(), name: 'tap', used: false };
  s.tap();
  assert.deepEqual(got, [], 'tap after tap');
  s.press = { at: performance.now(), name: 'tap', used: false };
  s.pick();
  assert.deepEqual(got, ['select'], 'pick after generic tap adds the select');
  s.press = { at: performance.now(), name: 'chipAdd', used: false };
  s.nope();
  assert.deepEqual(got, ['select'], 'specific press already said it');
  s.press = null;
  s.flip();
  s.summon();
  assert.deepEqual(got, ['select', 'flip', 'summon'], 'code-driven moments always play');
});

const PENTA_SET = new Set(PITCH_CLASSES);
const PARAMS = { tick: [{ value: 0 }, { value: 7 }, { value: 13, up: false }], plus: [{ value: 0 }, { value: 9 }], minus: [{ value: 4 }], slider: [{ value: 0 }, { value: 0.5 }, { value: 1, edge: true }], land: [0, 1, 2, 3, 4].map((step) => ({ step })), wishAdd: [0, 1, 2].map((step) => ({ step })), chipAdd: [{ step: 0 }, { step: 3 }], dissolve: [{ size: 1000 }, { size: 400000 }], whoosh: [{ distance: 100 }, { distance: 2000 }], stream: [{ duration: 600 }, { duration: 1800 }] };

test('every tuned note is in D major pentatonic (D E F# A B), within 3 cents (+ the declared round-robin jitter)', () => {
  const bad = [];
  for (const n of NAMES) {
    for (const opts of PARAMS[n] || [{}]) {
      for (const it of notesOf(n, opts).fundamentals) {
        for (const f of [it.f0, it.f1].filter(Boolean)) {
          const glidingDown = it.f1 && it.f1 < it.f0 * 0.83;
          if (f < 300 && (glidingDown || (it.f1 && it.f1 > it.f0 * 1.2))) continue; // 往下掉的「咚」= 打击，不是音
          if (n === 'type') continue; // 键盘的「笃」= 打击
          const q = near(f);
          if (!PENTA_SET.has(q.pc) || Math.abs(q.cents) > 3 + (KIT[n].jitter || 0)) bad.push(`${n} ${JSON.stringify(opts)} ${f.toFixed(1)} Hz (pc ${q.pc}, ${q.cents.toFixed(1)}¢)`);
        }
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('click-safety: envelopes start at 0, attack ≥ 1.5 ms, nothing in the past, no NaN, stop after start', () => {
  for (const n of NAMES) {
    for (const opts of PARAMS[n] || [{}]) {
      const { ctx, v } = notesOf(n, opts);
      assert.ok(v && v.end > 1, `${n}: end`);
      for (const node of ctx.nodes) {
        for (const p of Object.values(node).filter((x) => x instanceof Param)) {
          for (const c of p.calls) {
            assert.ok(Number.isFinite(c.v) && Number.isFinite(c.t), `${n}: NaN on ${node.kind}.${p.name}`);
            // 滑音的振荡器会提前 ≤ 8 ms 静音开始（躲开 Chrome 的块边界折角），其余都不早于这一声的开始
            if (c.kind !== 'cancel') assert.ok(c.t >= 1 - 0.0080001, `${n}: ${node.kind}.${p.name} scheduled at ${c.t} < start`);
            if (node.kind === 'gain' && p.name === 'gain' && c.kind !== 'cancel') assert.ok(c.t >= 1 - 1e-9, `${n}: gain automation before the sound starts`);
          }
        }
        if (node.kind === 'osc' || node.kind === 'src') {
          if (node.t0 === undefined) continue; // 混响 / 噪声缓冲里预先建好的东西
          assert.ok(node.t1 > node.t0, `${n}: ${node.kind} stops before it starts`);
          const g = node.outs.find((o) => o.kind === 'gain') || node.outs[0]?.outs?.find?.((o) => o.kind === 'gain');
          const calls = g?.gain?.calls || [];
          if (calls.length) {
            assert.equal(calls[0].kind, 'set', `${n}: first envelope call`);
            assert.equal(calls[0].v, 0, `${n}: envelope must start at 0`);
            const lin = calls.find((c) => c.kind === 'lin');
            if (lin) assert.ok(lin.t - calls[0].t >= 0.0015 - 1e-9, `${n}: attack ${(lin.t - calls[0].t) * 1000} ms`);
            const last = calls.at(-1);
            if (node.kind === 'osc') {
              assert.ok(last.kind === 'target' && last.v === 0, `${n}: envelope must decay to 0`);
              // 停的时候已经低于 −70 dB：e^(−(t1 − t)/τ)
              const lvl = Math.exp(-(node.t1 - last.t) / last.extra);
              assert.ok(lvl < 0.0004, `${n}: osc stopped at ${(20 * Math.log10(lvl)).toFixed(1)} dB of its peak`);
            }
          }
        }
      }
    }
  }
});

test('durations: micro sounds are short, moments ring, nothing > 3 s', () => {
  for (const n of NAMES) {
    const { v } = notesOf(n);
    const dur = v.end - 1;
    if (KIT[n].tier === 1) assert.ok(dur < 0.5, `${n}: ${dur.toFixed(2)} s for a micro sound`);
    assert.ok(dur < 3.4, `${n}: ${dur.toFixed(2)} s`);
  }
});

test('no oscillator above 12 kHz (highs stay soft)', () => {
  for (const n of NAMES) for (const it of notesOf(n).items) assert.ok(it.f0 < 12000 && (!it.f1 || it.f1 < 12000), `${n}: ${it.f0}`);
});

test('pentatonic step() helper', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((i) => step(i)), [74, 76, 78, 81, 83, 86, 88]);
  assert.equal(step(-1), 71);
});

test('lamp rub rises with progress (louder, brighter, higher, more sparkle)', () => {
  const a = rubParams(0, 0.7);
  const b = rubParams(1, 0.7);
  assert.ok(b.noise > a.noise && b.f > a.f && b.hum > a.hum && b.rate > a.rate && b.sparkPeak > a.sparkPeak);
  const lows = [0, 0.2, 0.4, 0.6, 0.8, 1].map((p) => rubParams(p).humNotes[0]);
  for (let i = 1; i < lows.length; i++) assert.ok(lows[i] >= lows[i - 1], 'hum climbs');
  for (const p of [0, 0.3, 0.7, 1]) for (const m of rubParams(p).humNotes) assert.ok(PENTA_SET.has(((m % 12) + 12) % 12));
});

// 语义默认：最小的假元素
const el = (tag, at = {}, extra = {}) => ({ tagName: tag, nodeType: 1, getAttribute: (k) => (k in at ? String(at[k]) : null), classList: { contains: () => false }, ...extra });
test('semantic defaults by element type / ARIA state', () => {
  const cases = [
    [el('BUTTON'), 'tap'],
    [el('INPUT', { type: 'checkbox' }, { checked: false }), 'toggleOn'],
    [el('INPUT', { type: 'checkbox' }, { checked: true }), 'toggleOff'],
    [el('INPUT', { type: 'radio' }, { checked: false }), 'select'],
    [el('INPUT', { type: 'range' }), 'grab'],
    [el('INPUT', { type: 'text' }), 'focus'],
    [el('INPUT', { type: 'submit' }), 'confirm'],
    [el('TEXTAREA'), 'focus'],
    [el('SELECT'), 'open'],
    [el('DIV', { role: 'switch', 'aria-checked': 'false' }), 'toggleOn'],
    [el('DIV', { role: 'switch', 'aria-checked': 'true' }), 'toggleOff'],
    [el('BUTTON', { role: 'radio', 'aria-checked': 'false' }), 'select'],
    [el('BUTTON', { role: 'radio', 'aria-checked': 'true' }), 'tap'],
    [el('BUTTON', { role: 'tab', 'aria-selected': 'false' }), 'select'],
    [el('BUTTON', { 'aria-pressed': 'false' }), 'select'],
    [el('BUTTON', { 'aria-pressed': 'true' }), 'deselect'],
    [el('BUTTON', { 'aria-expanded': 'false' }), 'open'],
    [el('BUTTON', { 'aria-expanded': 'true' }), 'close'],
    [el('DIV', { role: 'slider' }), 'grab'],
  ];
  for (const [e, want] of cases) assert.equal(semanticSound(e), want, `${e.tagName} ${JSON.stringify(e)}`);
});

test('works without a DOM: play() is a quiet no-op, mute / level persist safely', () => {
  const s = new Sfx();
  assert.equal(s.play('tap'), null);
  s.setMuted(true);
  assert.equal(s.isMuted(), true);
  s.setLevel(2);
  assert.equal(s.getLevel(), 1);
  s.setLevel(-1);
  assert.equal(s.getLevel(), 0);
  assert.equal(typeof sfx.play, 'function');
  assert.equal(typeof isMuted(), 'boolean');
  setMuted(false, { persist: false });
  assert.equal(isMuted(), false);
  assert.equal(unlock(), false);
  s.rub({ progress: 0.5 });
  s.rubEnd();
});

test('aliases (old sound.js, fx, music prototype names) all land on a real sound', () => {
  const { ALIAS, soundName } = mod;
  for (const [a, n] of Object.entries(ALIAS)) assert.ok(KIT[n], `${a} → ${n}`);
  assert.equal(soundName('tap'), 'tap');
  assert.equal(soundName('countUp'), 'plus');
  assert.equal(soundName('nope'), 'error');
  assert.equal(soundName('nothing'), null);
});

test('WISH_RULES: every rule names a real sound, a family, none, or a function', () => {
  const { WISH_RULES } = mod;
  const families = new Set(['chip', 'toggle', 'cross', 'choice', 'radio', 'auto', 'none']);
  assert.ok(WISH_RULES.length >= 10);
  for (const r of WISH_RULES) {
    assert.equal(typeof r.sel, 'string');
    if (typeof r.sound === 'function') continue;
    const base = String(r.sound).split(':')[0];
    assert.ok(KIT[base] || families.has(base), `${r.sel} → ${r.sound}`);
  }
});

test('the coverage log records played / muted / merged / unknown with how it was triggered', () => {
  const s = new Sfx();
  const log = s.enableLog();
  s.setMuted(true, { persist: false });
  s.play('confirm', {}, 'press');
  s.play('nope-not-a-sound');
  s.press = { at: performance.now(), name: 'select', used: false };
  s.pick();
  assert.deepEqual(
    log.map((e) => [e.name, e.status, e.via]),
    [
      ['confirm', 'muted', 'press'],
      ['nope-not-a-sound', 'unknown', 'code'],
      ['select', 'merged', 'legacy'], // sfx.pick() = select；同一下已经响过
    ]
  );
});

test('look-ahead scheduling: deferred parts build exactly the same nodes, only later; first part stays immediate', () => {
  for (const n of ['reveal', 'wish', 'achievement', 'summon', 'tap', 'select']) {
    const a = new Ctx();
    room(a);
    const a0 = a.nodes.length;
    synth(a, n, 1, { rr: 1 }, 77);
    const full = a.nodes.length - a0;
    const b = new Ctx();
    room(b);
    const b0 = b.nodes.length;
    const v = synth(b, n, 1, { rr: 1 }, 77, { defer: true });
    const now = b.nodes.length - b0;
    for (const it of v.later) {
      assert.ok(it.at - 1 >= 0.3 - 1e-9, `${n}: deferred part at +${(it.at - 1).toFixed(3)} s`);
      it.fn();
    }
    assert.equal(b.nodes.length - b0, full, `${n}: node count after running deferred parts`);
    if (n === 'tap' || n === 'select') assert.equal(v.later.length, 0, `${n} must be fully immediate`);
    else assert.ok(now < full, `${n}: nothing deferred`);
  }
});

// ───────── genie 里才有的：旧入口 sound.js、和音乐共用 ctx、潘吉说话时的 duck ─────────

test('sound.js (the old entry) re-exports the kit: every existing import and legacy call keeps working', async () => {
  const snd = await import(pathToFileURL(path.join(here, '../src/shared/sound.js')).href);
  assert.equal(snd.sfx, sfx);
  assert.equal(snd.default, sfx);
  for (const k of ['isMuted', 'setMuted', 'unlock', 'play', 'getAudioContext', 'installSfx']) assert.equal(typeof snd[k], 'function', k);
  for (const k of ['tap', 'pick', 'flip', 'rub', 'wish', 'chime', 'summon', 'nope', 'play', 'fx']) assert.equal(typeof sfx[k], 'function', `sfx.${k}`);
  // 没有 DOM：都是安静的 no-op，不会丢错
  sfx.tap();
  sfx.pick();
  sfx.flip();
  sfx.rub();
  sfx.wish();
  sfx.chime();
  sfx.summon();
  sfx.nope();
  assert.equal(snd.play('scan'), null);
  assert.equal(snd.getAudioContext(), null);
  assert.equal(snd.installSfx(), sfx);
  // 音乐 SPEC 的 UI 声音名字（tap, scan, select, dissolve, flip, reveal, soft error）都接得住
  for (const n of ['tap', 'scan', 'select', 'dissolve', 'flip', 'reveal', 'softError']) assert.ok(mod.soundName(n), n);
});

test('duck(on) while Pangie talks: level × 0.6, ticks skipped; duck(false) restores', () => {
  const s = new Sfx();
  const log = s.enableLog();
  s.duck(true);
  assert.equal(s.duckF, 0.6);
  s.play('tick', { value: 2 });
  assert.equal(log.at(-1).status, 'merged');
  s.duck(false);
  assert.equal(s.duckF, 1);
  s.play('tick', { value: 2 });
  assert.equal(log.at(-1).status, 'noaudio'); // 没有 DOM：没有 AudioContext（但不是被 duck 吃掉）
});

test('Wish Mode: the reveal fanfare belongs to the music — fx / chime() "reveal" plays only the holo shine', () => {
  const s = new Sfx();
  const got = [];
  s.play = (n) => (got.push(n), { stop() {} });
  s.fx('reveal');
  s.chime();
  assert.deepEqual(got, ['reveal', 'reveal']);
  got.length = 0;
  s.musicReveal = true;
  s.fx('reveal');
  s.chime();
  assert.deepEqual(got, ['holo', 'holo']);
});

for (const [name, fn] of queue) {
  try {
    await fn();
    pass++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    fail++;
    console.log(`  FAIL ${name}\n       ${e.message}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
