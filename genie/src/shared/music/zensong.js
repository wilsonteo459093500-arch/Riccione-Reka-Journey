// zensong.js —— WISH 禅意音乐引擎：六首写好的曲子（古筝、手碟、箫、铺底……全部现场合成）垫在马来西亚高原花园的
// 自然声上，跟着许愿之旅的每一刻换曲（无缝交叉淡化）。没有任何音频文件，没有版权问题。
// 设计与实测：scratchpad/music/SPEC.md。App 里用 src/shared/zen.js 的 Zen（这个类 + CONFIG 的默认值）。
//
// 公开 API（和旧 zen.js 的 Zen 一样，WishShell / start.js 不用改就能换上）：
//   start({ volume, trackUrl, playlist })  ← 必须在点击 / 触摸里调用（iOS）
//   pause() · resume() · isLive() · stop(fade) · setMood(mood) · accent('chapter'|'reveal'|'wish')
//   duck(倍数 | 'blueprint'|'studio'|'idle', 秒) · setVolume · setMuted · setLayers({ bowl, chimes })
//   attachTrack(url) · onState · onStop · mood · volume · running · ctx · output（喇叭前最后一级，探针接这里）
// 新增：talk(on)（潘吉说话：只压音乐）· duck('voice', 0.35) / unduck('voice')（叠在页面音量上的「层」）·
//   setNature(on) · setMusic(on) · setPlaylist([...]) · attach(ctx, dest) · onMood · onSection · ZenSong.renderOffline({...})
// 情绪：calm · intuition · focus · dusk · reveal（旧名 bright）· blueprint · studio · night
//
// AudioContext：o.getContext()（App 里 = 音效 sfx.js 的那一个）→ 一页只有一个 AudioContext，第一下触碰解锁一次就都有声音。
// 共用的时候 stop() 不挂起它（音效还要用）；pause()（页面藏起来）照样挂起。系统把它恢复（任何一下触碰）→ 排程器自己接上。

import { rng, clamp, loopNoise, loopNoiseData, reverbIRData, toBuffer } from './zs-dsp.js';
import { buildBeds, applyNature, natureLanes } from './zs-nature.js';
import { PIECES, CUES, MOODS, ALIAS, JOURNEY, JOURNEY_SECONDS } from './zs-scores.js';
import { Run, prepare } from './zs-run.js';
import { wave, adoptWave } from './zs-voices.js';

export { PIECES, MOODS, ALIAS, JOURNEY, JOURNEY_SECONDS };

const LOOK = 1.6; // 往前排多少秒（后台计时器被节流到 1 秒一次也不断）
const TICK = 150; // 排程器多久看一次（毫秒）
// 输出校准：volume = 1 时每首曲子（含自然声）的整体响度 ≈ −20 LUFS（离线实测，见 SPEC §8）；
// App 默认 CONFIG.wishVolume 0.7 → ≈ −23 LUFS（比「时刻」音效低、比潘吉说话低很多）。
const OUT = 1.45;
const TALK = { music: 0.42, nature: 0.8 }; // 潘吉说话时：音乐 −7.5 dB、自然声 −2 dB（像电台主持人的压低，而不是整体变小）

/** 演示页 / 设置面板用：每首曲子一行 */
export const PIECE_LIST = /* @__PURE__ */ [
  ['calm', 'chenguang'],
  ['intuition', 'xian'],
  ['focus', 'zhuying'],
  ['dusk', 'mose'],
  ['reveal', 'xingdeng'],
  ['blueprint', 'guijia'],
  ['night', 'guijiaNight'],
].map(([mood, id]) => {
  const p = PIECES[id];
  return { mood, id, en: p.en, feel: p.feel, inst: p.inst, bpm: p.bpm, meter: p.meter, use: { en: MOODS[mood].en } };
});

export class ZenSong {
  constructor(o = {}) {
    this.seed = (o.seed ?? Math.floor(Math.random() * 1e9)) >>> 0;
    this.r = rng(this.seed);
    this.volume = o.volume ?? 0.7;
    this.muted = false;
    this.duckF = 1;
    this.duckLevels = { blueprint: 0.5, studio: 0.25, idle: 0.12, ...(o.duck || {}) };
    this.layerDucks = {}; // duck('voice', 0.35) 这种「层」：名字 → 倍数，全部乘在页面音量上
    this.talkLevels = { ...TALK, ...(o.talk || {}) };
    this.getContext = typeof o.getContext === 'function' ? o.getContext : null;
    this.shared = false; // ctx 是不是和别人（音效）共用的
    this.layers = { bowl: !!o.layers?.bowl, chimes: !!o.layers?.chimes };
    this.natureOn = o.nature !== false;
    this.musicOn = o.music !== false;
    this.latencyHint = o.latencyHint || 'playback'; // 只放音乐：大缓冲、省电；和音效共用时用 'interactive'
    this.sessionType = o.sessionType || 'playback'; // iOS 17+：'playback' 不受静音键影响（展厅 iPad）；客人自己的手机用 'ambient'
    this.mood = ALIAS[o.mood] || o.mood || 'calm';
    this.ctx = null;
    this.running = false;
    this.looping = false;
    this.paused = false;
    this.offline = false;
    this.gen = 0;
    this.runs = [];
    this.cur = null;
    this.lanes = [];
    this.waves = new Map();
    this.nRuns = 0;
    this.logOn = !!o.log;
    this.events = [];
    this.playlist = null;
    this.onState = null; // (state) => {}
    this.onStop = null;
    this.onMood = null; // (mood, piece) => {}
    this.onSection = null;
    this._vnow = null;
  }

  get now() {
    return this._vnow ?? (this.ctx ? this.ctx.currentTime : 0);
  }

  log(inst, t, m, v) {
    if (this.logOn) this.events.push([Math.round(t * 1000) / 1000, inst, m, Math.round(v * 1000) / 1000, this.mood]);
  }

  _live() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** 真的在出声吗（开始了、没被系统挂起）。静音也算 live */
  isLive() {
    return this.running && this._live();
  }

  /** 接上一个已有的 AudioContext（音乐和音效共用一个）；dest = 输出节点（默认扬声器） */
  attach(ctx, dest) {
    if (!this.ctx) this._build(ctx, dest);
    return this;
  }

  _build(ctx, dest = ctx.destination) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    // 安全阀：平时几乎不动（混音本来就留了余量），只防万一
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -9;
    comp.knee.value = 6;
    comp.ratio.value = 3;
    comp.attack.value = 0.008;
    comp.release.value = 0.25;
    this.master.connect(comp);
    comp.connect(dest);
    this.output = comp;
    this.musicIn = ctx.createGain();
    this.musicWet = ctx.createGain();
    this.natureIn = ctx.createGain();
    this.musicIn.gain.value = this.musicWet.gain.value = this.musicOn ? 1 : 0;
    this.natureIn.gain.value = this.natureOn ? 1 : 0;
    // 潘吉说话时的压低（talk）：音乐干声、音乐湿声、自然声各一个增益，互不干扰 duck() / 音量
    this.talkG = [ctx.createGain(), ctx.createGain(), ctx.createGain()];
    const [tmDry, tmWet, tn] = this.talkG;
    const verb = ctx.createConvolver();
    this.verb = verb; // 脉冲响应稍后装上（现场：后台线程算好再装；离线：马上算）
    const natSend = ctx.createGain();
    natSend.gain.value = 0.16;
    this.musicIn.connect(tmDry).connect(this.master);
    this.talkG.forEach((g) => (g.gain.value = 1));
    this.natureIn.connect(tn);
    tn.connect(this.master);
    this.musicWet.connect(tmWet).connect(verb);
    tn.connect(natSend).connect(verb);
    verb.connect(this.master);
    // 噪声与混响：开场那一下最重的计算（约 150 万个采样）。白噪声很便宜（箫的气声要用），马上算；
    // 粉红 / 棕噪声（溪水、微风）和混响脉冲交给后台线程，算好了再装上 —— 开始那一下轻触不卡（自然声本来就要 0.6 s 才淡进来）
    this.noise = { white: loopNoise(ctx, 2, 'white', 7), pink: null, brown: null };
    const jobs = [
      ['pink', 'noise', [6, 'pink', 3]],
      ['brown', 'noise', [6, 'brown', 5]],
      ['ir', 'ir', [{ seed: (this.seed % 89) + 5 }]],
    ];
    // 现场：start() 先把第一首曲子的波表排进 Worker，再排这些（第一句旋律比溪水更急）；离线：马上算
    if (this.offline) this._bufJobs(jobs);
    else this._bufTodo = jobs;
    if (this.talking) this.talk(true);
    if (!this.offline) {
      const onState = () => this._onCtxState();
      if (ctx.addEventListener) ctx.addEventListener('statechange', onState);
      else ctx.onstatechange = onState;
    }
  }

  /** ctx 的状态变了（iOS：来电、锁屏、切 app；或者音效那边的一下触碰把它恢复了）：通知外壳；恢复了就把排程器接上 */
  _onCtxState() {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === 'running' && this.running && !this.looping && !this.offline) {
      const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
      if (visible && (!this.paused || this._pauseHidden)) {
        this.paused = false;
        this._plPlay?.();
        this._ramp(1.2);
        this._loop();
      }
    }
    try {
      this.onState?.(ctx.state);
    } catch {
      /* 外壳的回调不能影响音乐 */
    }
  }

  /** 粉红 / 棕噪声、混响脉冲：现场交给 Worker（先排在波表前面），没有 Worker 就稍后在主线程上算；离线渲染马上算（每次一样） */
  _bufJobs(jobs) {
    const sr = this.ctx.sampleRate;
    const compute = ([key, what, args]) => this._adoptBuf(key, what === 'ir' ? reverbIRData(sr, ...args) : loopNoiseData(sr, ...args));
    if (this.offline) {
      jobs.forEach(compute);
      return;
    }
    this._bufPending = new Map(jobs.map((j) => [j[0], j]));
    const wk = this._worker();
    if (wk) {
      for (const [key, what, args] of jobs) wk.postMessage({ job: 'buf', key, what, args, sr });
      return;
    }
    this._bufLocal();
  }

  /** Worker 用不了：剩下的在主线程上一个一个算（不在开始那一下轻触里） */
  _bufLocal() {
    const sr = this.ctx?.sampleRate;
    const step = () => {
      const next = this._bufPending?.values().next().value;
      if (!next || !this.ctx) return;
      const [key, what, args] = next;
      this._adoptBuf(key, what === 'ir' ? reverbIRData(sr, ...args) : loopNoiseData(sr, ...args));
      if (this._bufPending.size) setTimeout(step, 60);
    };
    setTimeout(step, 250);
  }

  _adoptBuf(key, chans) {
    if (!this.ctx || !chans?.length) return;
    this._bufPending?.delete(key);
    const buf = toBuffer(this.ctx, chans);
    if (key === 'ir') {
      if (!this.verb.buffer) this.verb.buffer = buf;
      return;
    }
    if (this.noise[key]) return;
    this.noise[key] = buf;
    // 溪水、微风到了：已经在放的话，自然声从这里淡进来
    if (this.running && !this.beds && this.noise.pink && this.noise.brown) {
      const t = this.now + 0.05;
      this._startBeds(t);
      applyNature(this, this.natKey || MOODS[this.mood]?.nature || 'day', t, 0.9);
    }
  }

  _target() {
    let f = this.duckF;
    for (const v of Object.values(this.layerDucks)) f *= v;
    return this.muted ? 0 : this.volume * f * OUT;
  }

  /**
   * 潘吉开口 / 闭嘴（语音模块的 onTalking）：只压音乐，自然声几乎不动 —— 她的声音像站在花园里说话。
   * 0.25 秒压下去、0.9 秒回来；叠在 duck()（页面音量）之上。不想用这个时，语音模块照旧调用 duck(倍数) 也可以。
   */
  talk(on, { music = this.talkLevels.music, nature = this.talkLevels.nature, down = 0.25, up = 0.9 } = {}) {
    this.talking = !!on;
    if (!this.talkG) return;
    const t = this.now;
    const [a, b, c] = this.talkG;
    for (const g of [a, b]) g.gain.setTargetAtTime(on ? music : 1, t, (on ? down : up) / 3);
    c.gain.setTargetAtTime(on ? nature : 1, t, (on ? down : up) / 3);
  }

  _ramp(seconds) {
    if (this.master) this.master.gain.setTargetAtTime(this._target(), this.now, Math.max(0.02, seconds / 3));
  }

  /** 必须在点击 / 触摸事件里调用 */
  start({ volume, trackUrl, playlist } = {}) {
    if (volume != null) this.volume = volume;
    try {
      if (navigator.audioSession) navigator.audioSession.type = this.sessionType;
    } catch {
      /* ignore */
    }
    if (!this.ctx) {
      let ctx = null;
      try {
        ctx = this.getContext ? this.getContext() : null;
      } catch {
        ctx = null;
      }
      this.shared = !!ctx;
      if (!ctx) {
        const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!AC) return; // 没有 Web Audio：安静地什么都不做（不能让开场那一下轻触出错）
        try {
          ctx = new AC({ latencyHint: this.latencyHint });
        } catch {
          try {
            ctx = new AC();
          } catch {
            return;
          }
        }
      }
      this._build(ctx);
    }
    const ctx = this.ctx;
    try {
      ctx.resume?.()?.catch?.(() => {});
      const s = ctx.createBufferSource(); // iOS 解锁：在手势里播一个 1 个采样的静音
      s.buffer = ctx.createBuffer(1, 1, 22050);
      s.connect(ctx.destination);
      s.start(0);
    } catch {
      /* ignore */
    }
    const list = playlist?.length ? playlist : trackUrl ? [trackUrl] : null;
    if (list && !this.playlist) this.setPlaylist(list, { gesture: true });
    if (this.running) {
      this.resume();
      return;
    }
    this.running = true;
    this.paused = false;
    const t = ctx.currentTime;
    this._startBeds(t);
    this._apply(this.mood, t, true); // 这里也把第一首曲子的波表排进 Worker
    if (this._bufTodo) {
      const jobs = this._bufTodo;
      this._bufTodo = null;
      this._bufJobs(jobs);
    }
    this._ramp(3.5);
    this._loop();
    this.warmAll();
  }

  _startBeds(t) {
    if (this.beds || !this.noise?.pink || !this.noise?.brown) return; // 噪声还在后台算：算好了 _adoptBuf 会接上
    this.beds = buildBeds(this, this.natureIn, t);
    this.lanes = natureLanes(this, t);
  }

  _loop() {
    if (this.looping || this.offline) return;
    this.looping = true;
    const gen = ++this.gen;
    const tick = () => {
      if (gen !== this.gen || !this.looping) return;
      if (this._live()) this._pump(this.ctx.currentTime + LOOK);
    };
    clearInterval(this._iv);
    this._iv = setInterval(tick, TICK);
    tick();
  }

  _pump(h) {
    const now = this.now;
    for (const L of this.lanes) {
      if (L.next < now - 0.3) L.next = now + 0.05 + this.r() * 0.3; // 卡住过：不补
      for (let g = 0; L.next < h && g < 64; g++) L.next = L.fn(L.next);
    }
    for (const R of this.runs) R.pump(h);
    // 拆掉已经结束的曲子（断开连接）。离线渲染不拆：那时所有音都是「预先排好」的，提前 disconnect 会让整段都没声音
    if (!this.offline && this.runs.some((R) => R.deadAt < now)) {
      this.runs = this.runs.filter((R) => {
        if (R.deadAt >= now) return true;
        R.dispose();
        return false;
      });
    }
  }

  /** 换情绪：自然声慢慢换；音乐 —— 旧曲子不再出新音、4 秒淡出，新曲子 1.3 秒后从铺底开始淡入（同一个调，叠在一起也和谐） */
  _apply(key, t, first = false) {
    const M = MOODS[key];
    applyNature(this, M.nature, t, first ? 0.6 : 2.2);
    if (this.playlist) return;
    const def = PIECES[M.piece];
    if (this.cur && this.cur.def === def && !this.cur.ended) return; // 同一首（蓝图 ↔ 3D 白天）：接着弹
    const old = this.cur;
    old?.end(t + 0.02, M.fadeOut ?? 4);
    const start = t + (old ? M.gap ?? 1.3 : 0.15);
    this.cur = new Run(this, def, start, { intro: M.intro, fadeIn: old ? M.fadeIn ?? 3 : M.fadeIn ?? 1.5, n: this.nRuns++ });
    this.runs.push(this.cur);
    this.warm(def);
    this.onMood?.(key, def);
  }

  setMood(mood, o = {}) {
    const key = ALIAS[mood] || mood;
    if (!MOODS[key]) return false;
    if (key === this.mood && !o.force) return true;
    this.mood = key;
    if (this.running && this.ctx) this._apply(key, o.at ?? this.now + 0.02);
    return true;
  }

  /** 关键时刻的点缀：chapter 翻章节牌（暮色里的一声）· wish 许愿（三个亮音）· reveal 揭晓（铺底涨起来 → 刮奏 → 落定，接着放「星灯」） */
  accent(kind, o = {}) {
    if (!this.running || !this.ctx) return;
    const t = o.at ?? this.now + 0.03;
    if (kind === 'reveal') {
      this.setMood('reveal', { at: t });
      return;
    }
    const def = CUES[kind];
    if (!def || this.playlist) return;
    this.runs.push(new Run(this, def, t, { fadeIn: 0.02, n: this.nRuns++ }));
  }

  /**
   * 整体渐弱 / 渐强，不改客人调的音量。两种写法：
   *   duck(倍数 0–1 | 页面名 'blueprint' | 'studio' | 'idle'（CONFIG.wishDuck）, 秒 = 3)  —— 页面音量（换一个就替换上一个）
   *   duck('voice', 倍数 = 0.35, 秒 = 0.25)  —— 其他任何名字 = 一层「临时压低」，乘在页面音量上，unduck('voice') 收回
   */
  duck(factor = 1, seconds, layerSeconds) {
    if (typeof factor === 'string' && !(factor in this.duckLevels)) {
      const f = seconds == null ? 0.35 : Number(seconds);
      this.layerDucks[factor] = clamp(Number.isFinite(f) ? f : 0.35, 0, 1);
      this._ramp(layerSeconds ?? 0.25);
      return;
    }
    const f = typeof factor === 'string' ? this.duckLevels[factor] ?? 1 : Number(factor);
    this.duckF = clamp(Number.isFinite(f) ? f : 1, 0, 1);
    this._ramp(seconds ?? 3);
  }

  /** 收回 duck('名字', …) 的那一层（默认 0.9 秒回来）。名字不写 = 全部的层 */
  unduck(name, seconds = 0.9) {
    if (name == null) this.layerDucks = {};
    else delete this.layerDucks[name];
    this._ramp(seconds);
  }

  setVolume(v) {
    this.volume = clamp(Number(v) || 0, 0, 1);
    this._ramp(0.4);
  }

  setMuted(m) {
    this.muted = !!m;
    this._ramp(0.6);
  }

  setLayers({ bowl, chimes } = {}) {
    if (bowl != null) this.layers.bowl = !!bowl;
    if (chimes != null) this.layers.chimes = !!chimes;
  }

  /** 自然声开 / 关（音乐照常） */
  setNature(on) {
    this.natureOn = !!on;
    this.natureIn?.gain.setTargetAtTime(on ? 1 : 0, this.now, 0.4);
  }

  /** 音乐开 / 关（自然声照常；老板的曲子也算音乐） */
  setMusic(on) {
    this.musicOn = !!on;
    for (const g of [this.musicIn, this.musicWet]) g?.gain.setTargetAtTime(on ? 1 : 0, this.now, 0.4);
  }

  /**
   * 锁屏 / 切到别的 app：停掉排程、音乐收到 0、挂起声音（挂起时 currentTime 不走，回来接着弹，不会「一次全响」）。
   * 页面还看得见时（有人手动暂停）不挂起和音效共用的 ctx：音效照常；系统恢复 ctx 也不会自己接着放。
   */
  pause() {
    this.gen++;
    this._resumeToken = (this._resumeToken || 0) + 1;
    this.paused = true;
    this._pauseHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    this.looping = false;
    clearInterval(this._iv);
    this._plPause?.();
    if (!this.ctx || !this.running || this.offline) return Promise.resolve();
    try {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    } catch {
      /* ignore */
    }
    if (this.shared && !this._pauseHidden) return Promise.resolve();
    return Promise.resolve(this.ctx.suspend?.()).catch(() => {});
  }

  /** 回来：恢复声音、重新排程。在点击里调用最稳（iOS）。返回 Promise<是否真的在出声> */
  resume() {
    if (!this.ctx || !this.running) return Promise.resolve(false);
    const token = (this._resumeToken = (this._resumeToken || 0) + 1);
    this.paused = false;
    this._plPlay?.();
    return Promise.resolve(this.ctx.resume?.())
      .catch(() => {})
      .then(() => {
        if (token !== this._resumeToken || this.paused || !this.running) return this._live() && !this.paused && this.running;
        if (this._live()) {
          this._ramp(1.2);
          this._loop();
        }
        return this._live();
      });
  }

  /**
   * 结束（许愿模式「结束」/ 回到大厅）：音乐在 fade 秒里淡出，然后拆掉。淡出的时候又 start() 也没关系：
   * 旧的曲子和自然声各自淡掉、拆掉，新的从头开始（不会把新开的那一份拆掉，也不会硬切出「喀」）。
   */
  stop(fade = 2.5) {
    this.onStop?.();
    if (!this.ctx || !this.running) return Promise.resolve();
    const ctx = this.ctx;
    this.running = false;
    this.looping = false;
    this.gen++;
    clearInterval(this._iv);
    this.master.gain.setTargetAtTime(0, ctx.currentTime, fade / 4);
    this._plStop?.();
    const runs = this.runs;
    const beds = this.beds;
    for (const R of runs) R.end(ctx.currentTime, fade); // 不再出新音；已经在响的跟着 master 淡掉
    this.runs = [];
    this.cur = null;
    this.beds = null;
    this.lanes = [];
    return new Promise((res) =>
      setTimeout(() => {
        const now = ctx.currentTime;
        if (beds) for (const g of [beds.sg, beds.wg, beds.cg]) g.gain.setTargetAtTime(0, now, 0.03);
        setTimeout(() => {
          for (const R of runs) R.dispose();
          for (const s of beds?.srcs || []) {
            try {
              s.stop();
            } catch {
              /* ignore */
            }
          }
        }, 300);
        if (!this.shared && !this.running) ctx.suspend?.(); // 和音效共用的 ctx 不挂起：大厅的按钮还要有声音
        res();
      }, fade * 1000 + 60)
    );
  }

  /** 旧 API：一首有版权的曲子 = 只有一首的播放列表 */
  attachTrack(url) {
    if (url) this.setPlaylist([url]);
  }

  /**
   * 老板自己的曲子（有版权的 mp3，放进 public/music/）：两首之间 6 秒交叉淡化，整张列表循环；自然声照样垫在底下，
   * 音量 / duck / 静音都照常。list = ['/music/a.mp3', { src, gain }] · null = 回到写好的曲子。
   */
  setPlaylist(list, { gesture = false } = {}) {
    const items = (list || []).map((x) => (typeof x === 'string' ? { src: x } : x)).filter((x) => x && x.src);
    this._plStop?.();
    this.playlist = items.length ? items : null;
    if (!this.ctx || this.offline) return;
    if (!this.playlist) {
      if (this.running) {
        this.cur = null;
        this._apply(this.mood, this.now + 0.05);
      }
      return;
    }
    for (const R of this.runs) R.end(this.now, 3);
    this.cur = null;
    const ctx = this.ctx;
    const XF = 6;
    const pl = this.playlist;
    const els = [0, 1].map(() => {
      const el = new Audio();
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      el.setAttribute('playsinline', '');
      const g = ctx.createGain();
      g.gain.value = 0;
      ctx.createMediaElementSource(el).connect(g).connect(this.musicIn); // iOS 不能改 el.volume，音量都走 Web Audio
      return { el, g };
    });
    let cur = 0;
    let idx = 0;
    let errors = 0;
    let alive = true;
    const play = (k, i, fadeSec) => {
      const { el, g } = els[k];
      const it = pl[i % pl.length];
      el._xf = false;
      if (!el.src.endsWith(it.src)) el.src = it.src;
      el.currentTime = 0;
      el.play()?.catch?.(() => {});
      g.gain.setTargetAtTime(it.gain ?? 1, ctx.currentTime, fadeSec / 3);
    };
    const next = () => {
      if (!alive) return;
      const old = els[cur];
      old.g.gain.setTargetAtTime(0, ctx.currentTime, XF / 3.5);
      setTimeout(() => old.el.pause(), XF * 1000 + 300);
      cur = 1 - cur;
      idx++;
      play(cur, idx, XF);
    };
    els.forEach(({ el }, k) => {
      el.addEventListener('timeupdate', () => {
        if (k === cur && !el._xf && el.duration && el.duration - el.currentTime < XF) {
          el._xf = true;
          errors = 0;
          next();
        }
      });
      el.addEventListener('ended', () => k === cur && !el._xf && ((el._xf = true), next()));
      el.addEventListener('error', () => {
        if (k !== cur || el._xf) return;
        el._xf = true;
        if (++errors >= pl.length) this.setPlaylist(null); // 全部打不开：回到写好的曲子
        else next();
      });
    });
    play(0, 0, 2.5);
    if (gesture && pl.length > 1) {
      const b = els[1].el; // iOS：第二个播放器也要在这一下手势里「解锁」
      b.src = pl[1].src;
      b.play()
        ?.then?.(() => cur !== 1 && b.pause())
        ?.catch?.(() => {});
    }
    this._plPause = () => els.forEach(({ el }) => el.pause());
    this._plPlay = () => els[cur].el.play()?.catch?.(() => {});
    this._plStop = () => {
      alive = false;
      for (const { el, g } of els) {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
        setTimeout(() => {
          el.pause();
          el.removeAttribute('src');
          el.load();
        }, 1800);
      }
      this._plPause = this._plPlay = this._plStop = null;
    };
  }

  /**
   * 预先算好这首曲子要用的波表。首选 Web Worker（后台线程算，主线程只把结果装进 AudioBuffer，不和动画抢帧）；
   * Worker 建不起来（老系统 / 页面限制）就在主线程上一次算一个，40 ms 一个。还没算好就要弹的音，排程器当场算。
   */
  warm(def) {
    if (this.offline || !def || !this.ctx) return;
    const todo = (this._warmQ ||= []);
    const seen = (this._warmSeen ||= new Set());
    for (const S of Object.values(prepare(def))) {
      for (const L of Object.values(S.lanes)) {
        if (L.kind === 'pad' || L.kind === 'drone') continue;
        const kinds = L.kind === 'gliss' ? ['zheng'] : [L.inst === 'deep' ? 'pan' : L.inst, L.swap].filter((k) => k && k !== 'flute');
        for (const n of L.notes) {
          if (n.m == null) continue;
          for (const k of kinds) {
            const key = k + n.m;
            if (this.waves.has(key) || seen.has(key)) continue;
            seen.add(key);
            todo.push([k, n.m]);
          }
        }
      }
    }
    const wk = this._worker();
    if (wk) {
      while (todo.length) {
        const [kind, m] = todo.shift();
        wk.postMessage({ kind, m, sr: this.ctx.sampleRate });
      }
      return;
    }
    if (this._warming) return;
    this._warming = true;
    const step = () => {
      const job = todo.shift();
      if (job && this.ctx) wave(this, ...job);
      if (todo.length) setTimeout(step, 40);
      else this._warming = false;
    };
    setTimeout(step, 40);
  }

  _worker() {
    if (this._wk !== undefined) return this._wk;
    this._wk = null;
    try {
      if (typeof Worker === 'undefined') return null;
      const wk = new Worker(new URL('./zs-wave-worker.js', import.meta.url), { type: 'module' });
      wk.onmessage = (e) => {
        const { job, key, chans, kind, m, sr, f0, data, error } = e.data || {};
        if (!this.ctx || sr !== this.ctx.sampleRate) return;
        if (job === 'buf') {
          if (error || !chans) this._bufLocal();
          else this._adoptBuf(key, chans);
          return;
        }
        if (error || !data) return;
        adoptWave(this, kind, m, data, f0);
      };
      wk.onerror = () => {
        // 模块 Worker 不被允许：退回主线程（没送回来的波表，排程器会当场算；噪声 / 混响稍后在主线程上算）
        this._wk = null;
        this._warmSeen?.clear();
        if (this._bufPending?.size) this._bufLocal();
      };
      this._wk = wk;
    } catch {
      this._wk = null;
    }
    return this._wk;
  }

  /** 开场就把所有曲子的波表在空闲时间慢慢备好（客人走完一整段旅程不会有「第一次」的计算） */
  warmAll() {
    for (const def of Object.values(PIECES)) this.warm(def);
    for (const def of Object.values(CUES)) this.warm(def);
  }

  _script(s) {
    const t = this.now;
    if (s.mood) this.setMood(s.mood, { at: t });
    if (s.cue) this.accent(s.cue, { at: t });
    if (s.duck != null) this.duck(s.duck, s.duckSec ?? 3);
    if (s.layers) this.setLayers(s.layers);
    if (s.nature != null) this.setNature(s.nature);
  }

  /**
   * 离线渲染（OfflineAudioContext）：和在线播放同一份代码 —— 用「虚拟时钟」一步步往前走，像排程器一样排音，再一次渲染出来。
   * script = [{ t, mood } | { t, cue } | { t, duck }]（第一个的 mood = 开头的情绪）。返回 { buffer, events }。
   */
  static async renderOffline({ seconds = 75, sampleRate = 48000, seed = 7, script = [{ t: 0, mood: 'calm' }], volume = 0.7, layers, nature = true, music = true, log = true, Engine = ZenSong, options = {} } = {}) {
    const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    const ctx = new OAC(2, Math.ceil(seconds * sampleRate), sampleRate);
    const steps = [...script].sort((a, b) => a.t - b.t);
    const z = new Engine({ ...options, seed, volume, layers, nature, music, log, mood: steps[0]?.mood || 'calm', getContext: null });
    z.offline = true;
    z._vnow = 0;
    z._build(ctx);
    z.running = true;
    z._startBeds(0);
    z._apply(z.mood, 0, true);
    z._ramp(3.5);
    let i = 0;
    for (let k = 0; k <= Math.round(seconds * 10); k++) {
      const t = k / 10;
      z._vnow = t;
      while (i < steps.length && steps[i].t <= t) z._script(steps[i++]);
      z._pump(t + LOOK);
    }
    const buffer = await ctx.startRendering();
    return { buffer, events: z.events };
  }
}

export default ZenSong;
