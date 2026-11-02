// node test/music.test.mjs —— 背景音乐（src/shared/zen.js + src/shared/music/）不需要浏览器的检查：
//   · 谱子：每个声部的拍数 = 段落长度（整小节）；只用 D E F# G A B；旋律在 B3–B5；铺底在 E2–A4、D3 以下没有三度；
//     每一次换和弦都至少留一个共同音（声部进行顺）
//   · 用一个「会记账」的假 AudioContext 把整段旅程（欢迎 → 神灯 → 直觉 → … → 揭晓 → 蓝图 → 3D）排一遍：不丢错、没有 NaN、
//     没有一个音早于它那首曲子开始的时刻、所有音高都在调上、每个情绪的音符密度在设计范围里
//   · Zen（App 用的那一层）：旧 API 都在；bright = reveal；accent('wish') 不出声（音效负责）；duck 页面音量 + 'voice' 层；talk()；
//     pause / resume / 系统恢复 ctx 后排程器自己接上；共用 ctx 时 stop() 不挂起它；musicFor() 的对应关系
import assert from 'node:assert/strict';

const { PIECES, MOODS, ALIAS, JOURNEY, JOURNEY_SECONDS, ZenSong } = await import('../src/shared/music/zensong.js');
const { CUES } = await import('../src/shared/music/zs-scores.js');
const { checkPiece, prepare } = await import('../src/shared/music/zs-run.js');
const { musicFor, applyMusic, CHAPTER_MOOD, isNightHour } = await import('../src/shared/music/moods.js');
const zenMod = await import('../src/shared/zen.js');
const { Zen, tellShell, isWishMode } = zenMod;

let pass = 0;
let fail = 0;
const queue = [];
const test = (name, fn) => queue.push([name, fn]);

// ───────── 假的 AudioContext：只记账（参数的每一次自动化都检查 NaN） ─────────
class Param {
  constructor(v = 0) {
    this.value = v;
    this.calls = [];
  }
  _rec(kind, v, t, x) {
    if (!Number.isFinite(v) || !Number.isFinite(t) || (x !== undefined && !Number.isFinite(x))) throw new Error(`NaN in ${kind}(${v}, ${t}, ${x})`);
    this.calls.push([kind, v, t, x]);
    return this;
  }
  setValueAtTime(v, t) {
    return this._rec('set', v, t);
  }
  linearRampToValueAtTime(v, t) {
    return this._rec('lin', v, t);
  }
  exponentialRampToValueAtTime(v, t) {
    if (!(v > 0)) throw new Error(`exponential ramp to ${v}`);
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
  disconnect() {
    this.outs = [];
  }
}
class FakeCtx {
  constructor({ sampleRate = 16000, offline = false, length = 0 } = {}) {
    this.sampleRate = sampleRate;
    this.currentTime = 0;
    this.nodes = [];
    this.state = offline ? 'suspended' : 'running';
    this.destination = new Node(this, 'dest');
    this.listeners = [];
    this.starts = [];
    if (offline) {
      this.length = length;
      this.startRendering = async () => ({ length, sampleRate, numberOfChannels: 2 });
    }
  }
  addEventListener(type, fn) {
    if (type === 'statechange') this.listeners.push(fn);
  }
  _set(state) {
    this.state = state;
    for (const fn of this.listeners) fn();
  }
  resume() {
    this._set('running');
    return Promise.resolve();
  }
  suspend() {
    this._set('suspended');
    return Promise.resolve();
  }
  _p(n, ...names) {
    for (const k of names) n[k] = new Param(k === 'gain' || k === 'playbackRate' ? 1 : 0);
    return n;
  }
  createGain() {
    return this._p(new Node(this, 'gain'), 'gain');
  }
  createDynamicsCompressor() {
    return this._p(new Node(this, 'comp'), 'threshold', 'knee', 'ratio', 'attack', 'release');
  }
  createConvolver() {
    return new Node(this, 'conv');
  }
  createBiquadFilter() {
    return this._p(new Node(this, 'biquad'), 'frequency', 'Q', 'gain');
  }
  createStereoPanner() {
    return this._p(new Node(this, 'pan'), 'pan');
  }
  createOscillator() {
    const n = this._p(new Node(this, 'osc'), 'frequency', 'detune');
    n.setPeriodicWave = () => {};
    n.start = (t) => this.starts.push(['osc', t]);
    n.stop = () => {};
    return n;
  }
  createBufferSource() {
    const n = this._p(new Node(this, 'src'), 'playbackRate');
    n.start = (t) => this.starts.push(['src', t]);
    n.stop = () => {};
    return n;
  }
  createPeriodicWave() {
    return {};
  }
  createBuffer(ch, len, sr) {
    const data = Array.from({ length: ch }, () => new Float32Array(len));
    return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: (i) => data[i], copyToChannel: (a, i) => data[i].set(a) };
  }
}
const PCS = new Set([2, 4, 6, 7, 9, 11]); // D E F# G A B
const pc = (m) => ((m % 12) + 12) % 12;
const name = (m) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][pc(m)] + (Math.floor(m / 12) - 1);

console.log('WISH 背景音乐 · music tests');

test('every piece and cue adds up to whole bars (checkPiece: 0 errors)', () => {
  const errs = [...Object.values(PIECES), ...Object.values(CUES)].flatMap(checkPiece);
  assert.deepEqual(errs, []);
  assert.equal(Object.keys(PIECES).length, 7);
});

test('one key: every written pitch is D E F# G A B; melodies B3–B5; pads E2–A4 with no third below D3', () => {
  for (const def of [...Object.values(PIECES), ...Object.values(CUES)]) {
    for (const [sn, S] of Object.entries(prepare(def))) {
      for (const [ln, L] of Object.entries(S.lanes)) {
        const ms = L.kind === 'pad' ? L.chords.flatMap((c) => c.ms) : L.notes.filter((n) => n.m != null).map((n) => n.m);
        for (const m of ms) assert.ok(PCS.has(pc(m)), `${def.id}.${sn}.${ln}: ${name(m)} is off the scale`);
        if (L.role === 'lead') for (const m of ms) assert.ok(m >= 59 && m <= 83, `${def.id}.${sn}.${ln}: lead ${name(m)} outside B3–B5`);
        if (L.kind === 'pad') {
          for (const c of L.chords) {
            const v = [...c.ms].sort((a, b) => a - b);
            assert.ok(v[0] >= 40 && v.at(-1) <= 69, `${def.id}.${sn}: pad ${v.map(name)} outside E2–A4`);
            for (let i = 1; i < v.length; i++) if (v[i - 1] < 50 && [3, 4].includes(v[i] - v[i - 1])) assert.fail(`${def.id}.${sn}: third below D3 in ${v.map(name)}`);
          }
        }
      }
    }
  }
});

test('voice-leading: every chord change keeps at least one common tone (section joins included)', () => {
  let changes = 0;
  for (const def of Object.values(PIECES)) {
    const P = prepare(def);
    const pads = (sn) => Object.values(P[sn].lanes).find((L) => L.kind === 'pad')?.chords || [];
    const order = [...(P.I ? ['I'] : []), ...def.form, def.form[0]];
    let prev = null;
    for (const sn of order) {
      for (const c of pads(sn)) {
        const set = new Set(c.ms.map(pc));
        if (prev) {
          changes++;
          assert.ok([...set].some((x) => prev.has(x)), `${def.id}.${sn}: no common tone into ${c.ms.map(name)}`);
        }
        prev = set;
      }
    }
  }
  assert.ok(changes > 100, `only ${changes} chord changes checked`);
});

test('moods: every mood names a real piece and nature bed; old names (bright …) alias correctly', () => {
  for (const [k, M] of Object.entries(MOODS)) assert.ok(PIECES[M.piece], `${k} → ${M.piece}`);
  assert.equal(ALIAS.bright, 'reveal');
  for (const s of JOURNEY) if (s.mood) assert.ok(MOODS[s.mood], s.mood);
});

/** 整段旅程用假 ctx 排一遍（和离线渲染同一条路：ZenSong.renderOffline，虚拟时钟） */
async function journey(script = JOURNEY, seconds = JOURNEY_SECONDS) {
  const OAC = class extends FakeCtx {
    constructor(ch, len, sr) {
      super({ sampleRate: 16000, offline: true, length: len });
      OAC.last = this;
    }
  };
  globalThis.OfflineAudioContext = OAC;
  const r = await ZenSong.renderOffline({ seconds, sampleRate: 16000, seed: 11, script, Engine: Zen });
  return { ...r, ctx: OAC.last };
}

test('the whole journey schedules without errors: no NaN, nothing before t = 0, on the scale, density by design', async () => {
  const { events, ctx } = await journey();
  assert.ok(events.length > 200, `only ${events.length} events`);
  for (const [kind, t] of ctx.starts) assert.ok(t >= -0.15, `${kind} starts at ${t}`); // 箫 / 持续音提前 0.1 s 静音起振
  const MUSIC = new Set(['zheng', 'pan', 'kal', 'harm', 'flute', 'pad', 'drone', 'bowl', 'chime']);
  for (const [t, inst, m] of events) if (MUSIC.has(inst)) assert.ok(PCS.has(pc(m)), `${inst} ${name(m)} at ${t}`);
  // 每个情绪的音符密度（不算铺底、持续音、自然声）：39–105 / 分钟（SPEC §1）；直觉题最稀
  const per = {};
  for (const [t, inst, , , mood] of events) {
    if (!MUSIC.has(inst) || inst === 'pad' || inst === 'drone') continue;
    (per[mood] ||= []).push(t);
  }
  const span = {};
  JOURNEY.filter((s) => s.mood).forEach((s, i, a) => (span[s.mood] = (span[s.mood] || 0) + ((a[i + 1]?.t ?? JOURNEY_SECONDS) - s.t)));
  const nm = (m) => (per[m]?.length || 0) / (span[m] / 60);
  assert.ok(nm('intuition') < nm('calm'), `intuition ${nm('intuition').toFixed(0)} ≥ calm ${nm('calm').toFixed(0)}`);
  for (const m of ['calm', 'focus', 'dusk']) assert.ok(nm(m) > 20 && nm(m) < 140, `${m}: ${nm(m).toFixed(0)} notes / min`);
  // 直觉题里没有鸟（三秒的选择中间不突然出声）
  const intu = JOURNEY.find((s) => s.mood === 'intuition');
  const next = JOURNEY.find((s) => s.t > intu.t && s.mood);
  assert.ok(!events.some(([t, inst]) => inst === 'bird' && t > intu.t + 0.5 && t < next.t), 'a bird sang during the intuition chapter');
});

test('accent("wish") in the app is silent (the wishAdd UI sound owns it); force: true still plays the cue', async () => {
  const quiet = await journey([{ t: 0, mood: 'focus' }, { t: 2, cue: 'wish' }], 6);
  assert.ok(!quiet.events.some(([t, inst]) => inst === 'kal' && t >= 2 && t < 3), 'a kalimba wish cue played');
  const z = new Zen({ getContext: () => new FakeCtx() });
  z.warmAll = z.warm = () => {};
  z.start();
  const n = z.runs.length;
  z.accent('wish');
  assert.equal(z.runs.length, n);
  z.accent('wish', { force: true });
  assert.equal(z.runs.length, n + 1);
  z.accent('chapter');
  assert.equal(z.runs.length, n + 2);
  await z.stop(0.001);
});

test('Zen keeps the old API (WishShell / start.js unchanged) and maps the old mood names', async () => {
  const ctx = new FakeCtx();
  const z = new Zen({ getContext: () => ctx });
  z.warmAll = z.warm = () => {};
  for (const k of ['start', 'pause', 'resume', 'isLive', 'stop', 'setMood', 'accent', 'duck', 'unduck', 'talk', 'setVolume', 'setMuted', 'setLayers', 'attachTrack', 'setNature', 'setMusic', 'setPlaylist']) assert.equal(typeof z[k], 'function', k);
  assert.equal(z.volume, 0.7);
  assert.equal(z.running, false);
  z.setMood('calm');
  z.start({ trackUrl: '', volume: 0.7 });
  assert.equal(z.ctx, ctx, 'uses the shared (sfx) AudioContext');
  assert.equal(z.shared, true);
  assert.equal(z.running, true);
  assert.equal(z.isLive(), true);
  assert.ok(z.output, 'output node for probes');
  z.setMood('bright');
  assert.equal(z.mood, 'reveal');
  z.setMood('intuition');
  assert.equal(z.mood, 'intuition');
  assert.equal(z.setMood('nonsense'), false);
  assert.equal(z.mood, 'intuition');
  await z.stop(0.001);
  assert.equal(ctx.state, 'running', 'stop() must not suspend the AudioContext the UI sounds share');
  assert.equal(z.running, false);
});

test('duck: page levels replace each other; "voice" is a layer on top; unduck restores; talk() only lowers the music', async () => {
  const z = new Zen({ getContext: () => new FakeCtx() });
  z.warmAll = z.warm = () => {};
  z.start({ volume: 1 });
  const base = z._target();
  z.duck('blueprint', 3);
  assert.ok(Math.abs(z._target() / base - 0.5) < 1e-9);
  z.duck('voice', 0.35);
  assert.ok(Math.abs(z._target() / base - 0.5 * 0.35) < 1e-9);
  z.duck('studio');
  assert.ok(Math.abs(z._target() / base - 0.25 * 0.35) < 1e-9, 'voice layer survives a page change');
  z.unduck('voice');
  assert.ok(Math.abs(z._target() / base - 0.25) < 1e-9);
  z.duck('voice'); // 不写倍数 = CONFIG.music.voiceDuck
  assert.ok(Math.abs(z._target() / base - 0.25 * z.voiceDuck) < 1e-9);
  z.unduck();
  z.duck(1, 2);
  assert.ok(Math.abs(z._target() - base) < 1e-9);
  z.setMuted(true);
  assert.equal(z._target(), 0);
  z.setMuted(false);
  z.talk(true);
  const [dry, wet, nat] = z.talkG.map((g) => g.gain.calls.at(-1)[1]);
  assert.ok(dry < 0.5 && wet < 0.5 && nat >= 0.75, `talk gains ${dry} ${wet} ${nat}`);
  z.talk(false);
  assert.deepEqual(z.talkG.map((g) => g.gain.calls.at(-1)[1]), [1, 1, 1]);
  await z.stop(0.001);
});

test('lifecycle: pause() stops the scheduler; a context resumed by anyone (a UI tap) restarts it; resume() returns live', async () => {
  const ctx = new FakeCtx();
  const z = new Zen({ getContext: () => ctx });
  z.warmAll = z.warm = () => {};
  const states = [];
  z.onState = (s) => states.push(s);
  z.start();
  assert.equal(z.looping, true);
  states.length = 0;
  globalThis.document = { visibilityState: 'hidden' };
  await z.pause();
  assert.equal(z.looping, false);
  assert.equal(ctx.state, 'suspended');
  globalThis.document.visibilityState = 'visible';
  await ctx.resume(); // 例如：音效那边的一下触碰把共用的 ctx 恢复了
  assert.equal(z.looping, true, 'scheduler did not restart after the context came back');
  assert.equal(z.paused, false);
  assert.deepEqual(states, ['suspended', 'running']);
  await z.pause();
  assert.equal(await z.resume(), true);
  assert.equal(z.isLive(), true);
  delete globalThis.document;
  await z.stop(0.001);
  assert.equal(z.looping, false);
});

test('start() again while stop() is still fading: the new music survives the old fade-out', async () => {
  const ctx = new FakeCtx();
  const z = new Zen({ getContext: () => ctx });
  z.warmAll = z.warm = () => {};
  z.start();
  const oldBeds = z.beds;
  const stopping = z.stop(0.15);
  z.start(); // 员工刚按「结束」，客人又按了「客户许愿模式」
  await stopping;
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(z.running, true);
  assert.ok(z.beds && z.beds !== oldBeds, 'new nature beds');
  assert.ok(z.runs.length >= 1 && z.cur && !z.cur.ended, 'new song still playing');
  assert.equal(ctx.state, 'running');
  await z.stop(0.001);
});

test('musicFor(): the event → music map shared by the shell and the standalone quiz', () => {
  assert.deepEqual(musicFor('page', { page: 'quiz' }), { mood: 'calm', duck: 1, duckSec: 2 });
  assert.deepEqual(musicFor('page', { page: 'blueprint' }), { mood: 'blueprint', duck: 'blueprint', duckSec: 3 });
  assert.equal(musicFor('page', { page: 'studio', night: true }).mood, 'night');
  assert.deepEqual(musicFor('chapter', { chapter: 'intuition' }), { mood: 'intuition', cue: 'chapter' });
  assert.equal(musicFor('chapter', { chapter: 'treasure' }).mood, 'focus');
  assert.equal(musicFor('chapter', { chapter: 'nogo' }).mood, 'calm');
  assert.deepEqual(musicFor('mood', { mood: 'dusk' }), { mood: 'dusk' });
  assert.deepEqual(musicFor('mood', { mood: 'bright' }), { mood: 'reveal' });
  assert.equal(musicFor('mood', { mood: 'nope' }), null);
  assert.deepEqual(musicFor('reveal'), { cue: 'reveal' });
  assert.equal(musicFor('wish'), null);
  assert.equal(musicFor('time', { hour: 21 }).mood, 'night');
  assert.equal(musicFor('time', { hour: 12 }).mood, 'studio');
  assert.ok(isNightHour(5) && !isNightHour(9));
  for (const m of Object.values(CHAPTER_MOOD)) assert.ok(MOODS[m]);
  const calls = [];
  applyMusic({ setMood: (m) => calls.push(['mood', m]), accent: (c) => calls.push(['cue', c]), duck: (d, s) => calls.push(['duck', d, s]) }, musicFor('page', { page: 'blueprint' }));
  assert.deepEqual(calls, [['mood', 'blueprint'], ['duck', 'blueprint', 3]]);
  applyMusic(null, null);
});

test('zen.js still exports tellShell / isWishMode and they are safe without a DOM', () => {
  assert.equal(typeof tellShell, 'function');
  assert.equal(isWishMode(), false);
  tellShell('page', { page: 'quiz' });
  assert.ok(zenMod.PIECE_LIST.length === 7 && zenMod.PIECE_LIST.every((p) => p.en && MOODS[p.mood]));
});

for (const [n, fn] of queue) {
  try {
    await fn();
    pass++;
    console.log(`  ok  ${n}`);
  } catch (e) {
    fail++;
    console.log(`  FAIL ${n}\n       ${e.stack?.split('\n').slice(0, 3).join('\n       ')}`);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
