// 案例整理 · 一次整理的全部状态（不在 React 里：几千张照片的 Map 放在这里，界面只拿「版本号」重画）。
//   列文件 → 分组 → 读缓存 → worker 池分析（一个项目一个项目来）→ 每个项目分析完就自动挑 → 员工确认 → 存进案例库 / 导出案例包
// 隐私：存进 IndexedDB 的只有指纹 key、分析数字、小图、员工的决定；路径 / 文件夹名（里面有人名）只在内存里。

import { buildGroups, splitFlat, mergeGroups, splitGroup, groupLabel, numberGroups } from './group.js';
import { hashKey, redact } from './parse.js';
import { autoPick, projectScore } from './pick.js';
import { crossPairs, collectionDupes } from './dupes.js';
import { paletteOf } from './color.js';
import { caseFromGroup, caseIdFor } from './build.js';
import { splitPack, caseBytes, PACK_MAX, partFileName } from './pack.js';
import { ANALYSIS_V } from './imgmath.js';
import { analyseViaImg } from './tasks.js'; // 浏览器自己会解 HEIC 的时候（Safari）用 <img> 解
import * as cache from './cache.js';
import * as C from '../../shared/cases.js';

export const STATES = ['todo', 'ready', 'skip'];
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class Session {
  constructor(entries, { listMs = 0, pool } = {}) {
    this.pool = pool;
    this.listMs = listMs;
    const r = buildGroups(entries);
    this.files = r.files;
    this.groups = r.groups;
    this.names = r.names;
    this.stats = r.stats;
    this.skipped = r.skipped;
    this.sig = 's' + hashKey('root|' + (entries[0]?.path?.split('/')[0] || 'files'));
    this.an = new Map(); // key → 分析结果
    this.failed = new Map(); // key → 'heic' | 'decode'
    this.fresh = new Map(); // key → 刚做好的小图 Blob（还在写进 IndexedDB 的路上）
    this.dec = new Map(); // groupId → 员工的决定
    this.auto = new Map(); // groupId → autoPick 的结果
    this.cross = { dupPhoto: new Map(), dupGroup: new Map() };
    this.include = { showroom: false, event: false };
    this.edits = []; // 员工合并 / 拆开的项目（存起来，下次打开同一个文件夹再套上）
    this.progress = { done: 0, total: 0, t0: 0, rate: 0, running: false, paused: false };
    this.version = 0;
    this.gv = new Map(); // groupId → 这一行改过几次（界面只重画改过的行）
    this.listeners = new Set();
    this.anBatch = cache.batcher('analysis');
    this.thumbBatch = cache.batcher('thumbs');
    this._saveT = null;
    this._ping = null;
  }

  // ───────────── 通知界面 ─────────────
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  changed(immediate = false) {
    this.version++;
    if (immediate) {
      clearTimeout(this._ping);
      this._ping = null;
      for (const f of this.listeners) f(this.version);
      return;
    }
    if (this._ping) return;
    this._ping = setTimeout(() => {
      this._ping = null;
      for (const f of this.listeners) f(this.version);
    }, 250);
  }

  // ───────────── 读缓存（上次整理过同一个文件夹 → 直接接着做） ─────────────
  async resume() {
    const keys = [...this.files.keys()];
    // 很多张：整个缓存一次读出来再挑（9 000 个 get 太慢）
    const got = keys.length > 300 ? await cache.getAllMap('analysis') : await cache.getMany('analysis', keys);
    let hit = 0;
    for (const k of keys) {
      const a = got.get(k);
      if (a?.v === ANALYSIS_V) {
        this.an.set(k, a);
        hit++;
      }
    }
    const s = await cache.get('sessions', this.sig);
    if (s?.dec) for (const [gid, d] of Object.entries(s.dec)) this.dec.set(gid, d);
    if (s?.include) this.include = { ...this.include, ...s.include };
    this.edits = Array.isArray(s?.edits) ? s.edits : [];
    this._regroupFlat();
    this._applyEdits();
    for (const g of this.groups) this._repick(g);
    this._crossCheck();
    this._restampOld();
    this.changed(true);
    return hit;
  }

  /**
   * 以前的版本存的项目（saved 里没有 keys —— 不知道存的是哪几张）、员工也没点过照片的：那时候存的是旧规则自动挑的。
   * 挑的规则后来变了（一个项目最多 18 张），自动挑的结果不一样 → 指纹对不上，每个都会变成「改过，要再存」、被一起重新存。
   * 所以这种项目的指纹不算挑的照片，重新盖一次章（只盖一次：nopick）：案例库里还是那时候存的照片，员工再改什么才算改过。
   */
  _restampOld() {
    let n = 0;
    for (const g of this.groups) {
      const d = this.dec.get(g.id);
      if (!d?.saved || Array.isArray(d.saved.keys) || d.saved.nopick || d.picked != null) continue;
      const next = { ...d, saved: { ...d.saved, nopick: true } };
      this.dec.set(g.id, next);
      next.saved.sig = this.sigOf(g);
      n++;
    }
    if (n) this.saveSoon();
    return n;
  }

  saveSoon() {
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this.saveNow(), 600);
  }
  async saveNow() {
    clearTimeout(this._saveT);
    await cache.put('sessions', this.sig, { v: 1, at: Date.now(), dec: Object.fromEntries(this.dec), include: this.include, edits: this.edits });
  }

  // ───────────── 分析 ─────────────
  activeGroups() {
    return this.groups.filter((g) => g.kind === 'home' || this.include[g.kind]);
  }

  /** 排队：一个项目一个项目来（员工可以边看边等），已经分析过的跳过 */
  start() {
    this.queued = this.queued || new Set();
    const todo = [];
    for (const g of this.activeGroups()) for (const k of g.keys) if (!this.an.has(k) && !this.failed.has(k) && !this.queued.has(k)) todo.push(k);
    const p = this.progress;
    this._inflight = (this._inflight > 0 ? this._inflight : 0) + todo.length;
    p.done = this.an.size + this.failed.size;
    p.total = p.done + this._inflight;
    if (!p.running) {
      p.t0 = now();
      p.base = p.done;
    }
    p.running = this._inflight > 0;
    for (const k of todo) {
      this.queued.add(k);
      const f = this.files.get(k);
      this.pool
        .run({ op: 'analyse', file: f.file, view: f.view })
        .then(({ a, thumb }) => this._gotAnalysis(k, a, thumb))
        .catch(async (e) => {
          if (String(e?.message) === 'cancelled') return;
          // HEIC：worker 读不了 → 主线程用 <img> 再试一次（Safari 读得了；Chrome / Edge 读不了 → 列进「跳过」）
          if (f.kind === 'heic' && typeof document !== 'undefined') {
            try {
              const r = await analyseViaImg(f.file, { view: f.view });
              this._gotAnalysis(k, r.a, r.thumb);
              return;
            } catch {
              /* 读不了 */
            }
          }
          this.failed.set(k, f.kind === 'heic' ? 'heic' : 'decode');
          this.failWhy = this.failWhy || new Map();
          this.failWhy.set(k, String(e?.message || e).slice(0, 160));
        })
        .finally(() => {
          this.queued.delete(k);
          this._step(k);
        });
    }
    this.changed(true);
  }

  pause(on) {
    this.progress.paused = on;
    this.pool.pause(on);
    this.changed(true);
  }

  _gotAnalysis(k, a, thumb) {
    this.an.set(k, a);
    this.anBatch.add(k, a);
    if (thumb) {
      this.fresh.set(k, thumb);
      this.thumbBatch.add(k, thumb);
      this.onThumb?.(k, thumb);
    }
  }

  _step(k) {
    const p = this.progress;
    p.done++;
    const el = (now() - p.t0) / 1000;
    p.rate = el > 0.5 ? (p.done - p.base) / el : 0;
    p.eta = p.rate > 0 ? Math.round((p.total - p.done) / p.rate) : null;
    const g = this.groupOfKey(k);
    if (g && g.keys.every((x) => this.an.has(x) || this.failed.has(x))) {
      if (g.flat) {
        this._regroupFlat(g.id);
        this._applyEdits();
        this._restampOld(); // 按时间分出来的项目这时候才有（上次存过的也要盖章）
      } else this._repick(g);
    }
    if (--this._inflight <= 0) {
      p.running = false;
      p.ms = now() - p.t0;
      this.anBatch.flush();
      this.thumbBatch.flush();
      this._crossCheck();
      this.saveSoon();
      this.changed(true);
      return;
    }
    this.changed();
  }

  /** 「平」的文件夹：分析完（读到拍摄时间）再按时间分 */
  _regroupFlat(onlyId) {
    const times = new Map();
    for (const [k, a] of this.an) if (a.dto) times.set(k, a.dto);
    const flat = this.groups.filter((g) => g.flat && g.kind === 'home' && !g.from && (!onlyId || g.id === onlyId) && g.keys.every((k) => this.an.has(k) || this.failed.has(k)));
    if (!flat.length) return;
    const rest = this.groups.filter((g) => !flat.includes(g));
    const parts = splitFlat(flat, this.files, times);
    this.groups = numberGroups([...rest, ...parts]).sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : (a.part || 0) - (b.part || 0)));
    for (const g of parts) this._repick(g);
  }

  /** 员工的合并 / 拆开，按顺序再套一次（下次打开同一个文件夹） */
  _applyEdits() {
    for (const e of this.edits) {
      const a = this.groups.find((g) => g.id === e.a);
      if (e.op === 'merge') {
        const b = this.groups.find((g) => g.id === e.b);
        if (a && b) this._doMerge(a, b);
      } else if (e.op === 'split' && a && a.keys.includes(e.at)) this._doSplit(a, e.at);
    }
  }

  _doMerge(a, b) {
    const m = mergeGroups(a, b);
    this.groups = this.groups.filter((g) => g !== b).map((g) => (g === a ? m : g));
    for (const k of m.keys) {
      const f = this.files.get(k);
      if (f) f.groupId = m.id;
    }
    this._repick(m);
    return m;
  }
  _doSplit(g, at) {
    const order = this.orderOf(g);
    const parts = splitGroup(g, at, order);
    if (parts.length < 2) return null;
    const i = this.groups.indexOf(g);
    this.groups.splice(i, 1, ...parts);
    for (const p of parts) {
      for (const k of p.keys) {
        const f = this.files.get(k);
        if (f) f.groupId = p.id;
      }
      this._repick(p);
    }
    return parts;
  }

  merge(aId, bId) {
    const a = this.groups.find((g) => g.id === aId);
    const b = this.groups.find((g) => g.id === bId);
    if (!a || !b || a === b) return null;
    this.edits.push({ op: 'merge', a: aId, b: bId });
    const m = this._doMerge(a, b);
    const da = this.dec.get(aId) || {};
    const db = this.dec.get(bId) || {};
    const own = (x) => x.picked ?? x.saved?.keys; // 员工点过的 / 存进案例库的那一份（都没有 = 自动挑）
    if (own(da) || own(db)) this.dec.set(aId, { ...da, picked: [...new Set([...this.pickedOf(a), ...(own(db) || [])])] });
    // b 那边标好的房间 / 细节也带过来（a 自己标过的优先）
    for (const f of ['rooms', 'detail']) if (db[f]) this.dec.set(aId, { ...this.decision(aId), [f]: { ...db[f], ...(this.decision(aId)[f] || {}) } });
    if (db.rooms || db.detail) this._repick(m);
    this.dec.delete(bId);
    this.saveSoon();
    this.changed(true);
    return m;
  }

  split(gid, at) {
    const g = this.groups.find((x) => x.id === gid);
    if (!g) return null;
    this.edits.push({ op: 'split', a: gid, at });
    const parts = this._doSplit(g, at);
    const d = this.dec.get(gid);
    if (d && parts) {
      this.dec.set(parts[0].id, { ...d, picked: d.picked?.filter((k) => parts[0].keys.includes(k)), cover: parts[0].keys.includes(d.cover) ? d.cover : undefined });
      this.dec.set(parts[1].id, { ...d, picked: d.picked?.filter((k) => parts[1].keys.includes(k)), cover: parts[1].keys.includes(d.cover) ? d.cover : undefined, saved: undefined, state: 'todo' });
    }
    this.saveSoon();
    this.changed(true);
    return parts;
  }

  groupOfKey(k) {
    const gid = this.files.get(k)?.groupId;
    return this.groups.find((g) => g.id === gid) || null;
  }

  _repick(g) {
    const photos = g.keys.map((k) => {
      const f = this.files.get(k);
      const a = this.an.get(k) || null;
      return { key: k, a, room: this.dec.get(g.id)?.rooms?.[k] || f?.room || null, view: f?.view || null, detail: this.detailOf(g, k), t: a?.dto ?? f?.mtime ?? null };
    });
    const crossDup = new Set(g.keys.filter((k) => this.cross.dupPhoto.has(k)));
    this.auto.set(g.id, autoPick(photos, { crossDup }));
    this._touch(g.id);
  }

  _touch(gid) {
    this.gv.set(gid, (this.gv.get(gid) || 0) + 1);
  }
  /** 这一行要不要重画（改过决定 / 重新挑过 / 又分析了几张） */
  rowSig(g) {
    let n = 0;
    for (const k of g.keys) if (this.an.has(k) || this.failed.has(k)) n++;
    const sv = this.decision(g.id).saved?.at || 0;
    return `${this.gv.get(g.id) || 0}|${n}|${sv}|${this.cross.dupGroup.has(g.id) ? 1 : 0}`;
  }

  /** 「最新案例集合」和城市里的项目重复的照片 / 整个项目 */
  _crossCheck() {
    const items = [];
    for (const g of this.groups) if (g.kind === 'home') for (const k of g.keys) {
      const a = this.an.get(k);
      if (a?.hash) items.push({ key: k, group: g.id, hash: a.hash });
    }
    const pairs = crossPairs(items);
    const gOf = new Map(items.map((x) => [x.key, x.group]));
    const coll = new Set(this.groups.filter((g) => g.collection).map((g) => g.id));
    const size = new Map(this.groups.map((g) => [g.id, g.keys.length]));
    this.cross = collectionDupes(pairs, (k) => gOf.get(k), (gid) => coll.has(gid), (gid) => size.get(gid) || 1);
    for (const g of this.groups) if (g.collection) this._repick(g);
  }

  // ───────────── 员工的决定 ─────────────
  decision(gid) {
    return this.dec.get(gid) || {};
  }
  setDecision(gid, patch) {
    const d = { ...this.decision(gid), ...patch };
    this.dec.set(gid, d);
    this._touch(gid);
    if (patch.rooms || patch.detail) {
      const g = this.groups.find((x) => x.id === gid);
      if (g) this._repick(g);
    }
    this.saveSoon();
    this.changed(true);
    return d;
  }

  stateOf(g) {
    const d = this.decision(g.id);
    if (d.state) return d.state;
    if (this.cross.dupGroup.has(g.id)) return 'skip';
    return 'todo';
  }
  stylesOf(g) {
    const d = this.decision(g.id);
    return d.styles ?? (g.styles?.length ? g.styles : d.aiStyles || []);
  }
  orderOf(g) {
    const a = this.auto.get(g.id);
    const picked = this.pickedOf(g);
    const rest = g.keys.filter((k) => !picked.includes(k));
    const q = a?.q || new Map();
    rest.sort((x, y) => (q.get(y) || 0) - (q.get(x) || 0));
    return [...picked, ...rest];
  }
  /**
   * 挑好的照片（封面第一）：员工点过的 → 存进案例库的那一份（saved.keys）→ 自动挑的。
   * 存过的项目照样是存的那几张：自动挑的规则以后变了，也不会变成「改过，要再存」（员工自己改了照片才算）。
   */
  pickedOf(g) {
    const d = this.decision(g.id);
    const frozen = d.picked == null && Array.isArray(d.saved?.keys);
    const list = (d.picked ?? (frozen ? d.saved.keys : this.auto.get(g.id)?.picked) ?? []).filter((k) => g.keys.includes(k));
    // 存的那一份：封面就是存的时候的第一张（自动挑的封面以后变了也不换）
    const cover = frozen ? (d.cover && list.includes(d.cover) ? d.cover : list[0] || null) : this.coverOf(g, list);
    return cover ? [cover, ...list.filter((k) => k !== cover)] : list;
  }
  coverOf(g, list = null) {
    const d = this.decision(g.id);
    const picked = list ?? (d.picked ?? this.auto.get(g.id)?.picked ?? []);
    if (d.cover && picked.includes(d.cover)) return d.cover;
    const ac = this.auto.get(g.id)?.cover;
    if (ac && picked.includes(ac)) return ac;
    return picked[0] || null;
  }
  roomOf(g, k) {
    return this.decision(g.id).rooms?.[k] || this.files.get(k)?.room || null;
  }
  /** 这张是不是细节特写：员工 / AI 标过的（dec.detail[k] = true / false）优先，没标就看文件名 / 子文件夹 */
  detailOf(g, k) {
    const v = this.decision(g.id).detail?.[k];
    if (typeof v === 'boolean') return v;
    const f = this.files.get(k);
    return !!(f?.detail || f?.view === 'detail');
  }
  /** 员工改「是不是细节特写」：记下来（是 / 不是都记 —— 之后 AI 预填不会再改员工标过的） */
  setDetail(gid, k, on) {
    if (!this.groups.some((x) => x.id === gid)) return;
    this.setDecision(gid, { detail: { ...(this.decision(gid).detail || {}), [k]: !!on } });
  }
  /** 这个项目值不值得先做（pick.js projectScore）：照片好不好、够不够、拍到几个房间 */
  scoreOf(g) {
    const picked = this.pickedOf(g);
    return projectScore({ picked, q: this.auto.get(g.id)?.q, rooms: picked.map((k) => this.roomOf(g, k)) });
  }
  /** 被藏起来的理由：'dup' | 'cross' | flags… | null */
  hiddenWhy(g, k) {
    const a = this.auto.get(g.id);
    if (!a) return null;
    if (this.cross.dupPhoto.has(k)) return ['cross'];
    if (a.dupOf.has(k)) return ['dup'];
    if (a.rejects.has(k)) return a.rejects.get(k);
    return null;
  }
  analysedShare(g) {
    const n = g.keys.length || 1;
    return g.keys.filter((k) => this.an.has(k) || this.failed.has(k)).length / n;
  }
  readyCheck(g) {
    const miss = [];
    if (!this.stylesOf(g).length) miss.push('style');
    if (!this.decision(g.id).type) miss.push('type');
    if (!this.pickedOf(g).length) miss.push('photos');
    return miss;
  }
  label(g) {
    const d = this.decision(g.id);
    const l = groupLabel(g, { names: this.names });
    return d.label ? { zh: d.label, en: d.label } : l;
  }
  safe(s) {
    return redact(s, this.names);
  }
  paletteOf(g) {
    const picked = this.pickedOf(g);
    return paletteOf(picked.map((k, i) => ({ colours: this.an.get(k)?.colours || [], weight: i === 0 ? 1.5 : 1 })));
  }
  /** 存过以后又改了 → 要重新存 */
  dirty(g) {
    const d = this.decision(g.id);
    return !!d.saved && d.saved.sig !== this.sigOf(g);
  }
  sigOf(g) {
    const d = this.decision(g.id);
    // 以前的版本存的、员工之后没点过照片：挑的照片不算进指纹（_restampOld）
    const picks = d.saved?.nopick && d.picked == null ? null : this.pickedOf(g);
    const parts = [picks, this.stylesOf(g), d.type, d.bedrooms, d.consent, d.rooms, d.aiMats];
    if (d.detail && Object.keys(d.detail).length) parts.push(d.detail); // 没标过细节 = 和以前一样的指纹（存过的不会都变成「改过」）
    return hashKey(JSON.stringify(parts));
  }

  counts() {
    const c = { todo: 0, ready: 0, skip: 0, all: 0, showroom: 0, event: 0 };
    for (const g of this.groups) {
      if (g.kind !== 'home') {
        c[g.kind]++;
        if (!this.include[g.kind]) continue;
      }
      c.all++;
      c[this.stateOf(g)]++;
    }
    return c;
  }

  // ───────────── 存进案例库 / 导出 ─────────────
  /**
   * 把「好了」的项目压缩照片、存成草稿案例。onStep({ i, n, photos, done }) 报进度。
   * 再存一次（存过的项目）：员工在案例库里做的（上架、业主同意、说明、细节、顺序、封面、自己加的照片、每个房间做了什么…）都留着。
   * → { saved:[caseId], skipped:[{ gid, why }], error? }（存不进去：why ['space'] 空间满了 / ['error']，error = 那个错误；
   *   空间满了就不再存后面的项目；已经存好的照样记下来）
   */
  async saveToLibrary(gids, { onStep } = {}) {
    const out = { saved: [], skipped: [] };
    const list = gids.map((id) => this.groups.find((g) => g.id === id)).filter(Boolean);
    const todo = [];
    for (const g of list) {
      const miss = this.readyCheck(g);
      if (miss.length) out.skipped.push({ gid: g.id, why: miss });
      else todo.push(g);
    }
    let photosDone = 0;
    const photosTotal = todo.reduce((s, g) => s + this.pickedOf(g).length, 0);
    // 一个项目的照片一起交给 worker 池（几个 worker 同时压）；写进案例库的时候，下一个项目已经在压了
    const compressAll = (g) =>
      this.pickedOf(g).map((k) =>
        this.pool.run({ op: 'compress', file: this.files.get(k).file }, { urgent: true }).then((blobs) => {
          photosDone++;
          onStep?.({ photos: photosDone, photosTotal });
          return blobs;
        }, () => null)
      );
    let next = todo.length ? compressAll(todo[0]) : null;
    for (let i = 0; i < todo.length; i++) {
      const g = todo[i];
      const d = this.decision(g.id);
      const pending = next;
      next = i + 1 < todo.length ? compressAll(todo[i + 1]) : null;
      const all = await Promise.all(pending);
      if (all.some((x) => !x)) {
        out.skipped.push({ gid: g.id, why: ['photos'] });
        continue;
      }
      const id = d.saved?.caseId || caseIdFor(g.from || g.split || g.merged ? `${g.dir}#${g.id}` : g.dir, g.kind);
      const picked = this.pickedOf(g);
      const written = []; // 这次写进去的照片编号（存不进去的时候，没有案例指着的要删掉）
      let prev = null;
      let c = null;
      let saved = null;
      let bytes = 0;
      try {
        prev = await C.getCase(id);
        // 上次存的时候每张照片的编号（01、02…）→ 同一张照片再存一次，员工在案例库里写的说明 / 替代文字 / 细节 / 顺序留着
        const before = new Map((d.saved?.keys || []).map((k, j) => [k, prev?.images?.find((im) => im.id === String(j + 1).padStart(2, '0')) || null]));
        const shots = [];
        for (let j = 0; j < picked.length; j++) {
          const k = picked[j];
          const f = this.files.get(k);
          const blobs = all[j];
          const imgId = String(j + 1).padStart(2, '0');
          // 没标的就空着（不再把封面猜成客厅）
          const room = this.roomOf(g, k) || null;
          const pv = before.get(k) || null;
          // detail：细节特写（客人那边有「细节」一栏）。整理工具自己说了算的（员工 / AI 标过、文件名说是细节）才盖过
          // 员工在案例库里标的；没说 → 上次存的那张怎么标就怎么标
          const v = d.detail?.[k];
          const said = typeof v === 'boolean' ? v : f.detail || f.view === 'detail' ? true : undefined;
          written.push(imgId);
          const image = await C.putImage(id, null, { id: imgId, room: room || '', kind: room === 'plan3d' ? 'plan3d' : f.view === 'render' ? 'render' : 'photo', blobs, detail: said ?? !!pv?.detail });
          bytes += blobs[1600]?.size || 0;
          shots.push({ key: k, room, view: f.view, detail: said, image, prev: pv });
        }
        // 员工在案例库里自己加的照片（编号不是 01、02… 的）：原样留着
        for (const im of prev?.images || []) if (!/^\d+$/.test(im.id)) shots.push({ key: null, keep: true, image: im, prev: im });
        if (prev?.images?.length) {
          // 员工在案例库里排过的顺序：上次也在的照片按案例库的先后，新挑的接在后面（和 import-cases 一样）
          const at = new Map(prev.images.map((im, n) => [im.id, n]));
          const rank = (x) => (x.prev && at.has(x.prev.id) ? at.get(x.prev.id) : prev.images.length);
          shots.sort((a, b) => rank(a) - rank(b));
          // 封面：整理工具里没换过封面 → 案例库里员工挑的封面留着（那张还在的话）
          const pc = prev.images.find((im) => im.cover)?.id;
          const top = (pc && d.saved?.keys?.[0] === picked[0] && shots.find((x) => x.prev?.id === pc)) || shots.find((x) => x.key === picked[0]) || shots[0];
          for (const x of shots) x.cover = x === top;
        }
        // 「业主同意」：上次存了以后在整理工具里改过（勾上 / 拿掉）才算数；没改过 → 案例库里员工勾的 / 拿掉的留着
        const consent = d.saved && typeof d.saved.consent === 'boolean' && !!d.consent === d.saved.consent ? undefined : d.consent;
        const pal = this.paletteOf(g);
        c = caseFromGroup(g, { ...d, consent, styles: this.stylesOf(g) }, shots, pal, { prev: prev ? { ...prev, id } : { id } });
        if (d.aiMats) c.materials = { ...c.materials, ...d.aiMats };
        saved = await C.saveCase(c);
      } catch (e) {
        // 存不进去（多半是这台设备的照片空间满了）：这个项目这次写进去、又没有案例指着的照片删掉（不白占空间）
        const used = new Set((prev?.images || []).map((im) => im.id));
        for (const imgId of written) if (!used.has(imgId)) await C.dropImage(id, imgId).catch(() => {});
        const space = C.isQuotaError(e);
        out.skipped.push({ gid: g.id, why: [space ? 'space' : 'error'] });
        out.error = e;
        this.changed();
        if (space) break; // 空间满了：后面的项目也存不进去
        continue;
      }
      // 上次存的比这次多 → 多出来的照片删掉（案例存好了才删：存不进去的时候，旧案例的照片都还在）
      for (const im of prev?.images || []) if (im.device && !c.images.some((x) => x.id === im.id)) await C.dropImage(id, im.id).catch(() => {});
      await cache.put('notes', saved.id, this.noteOf(g));
      this.dec.set(g.id, { ...this.decision(g.id), state: 'ready', saved: { caseId: saved.id, at: Date.now(), sig: this.sigOf(g), bytes, json: JSON.stringify(saved).length, keys: picked, consent: !!d.consent } });
      this._touch(g.id);
      out.saved.push(saved.id);
      onStep?.({ photos: photosDone, photosTotal, projects: out.saved.length });
      this.changed();
    }
    await this.saveNow();
    this.changed(true);
    return out;
  }

  /** 只给员工看的笔记（不进案例、不进案例包） */
  noteOf(g) {
    return {
      v: 1,
      city: g.city || '',
      series: g.series || [],
      boards: g.boards || [],
      materials: g.materials || [],
      raw: g.raw || [],
      kind: g.kind,
      photos: g.keys.length,
      at: Date.now(),
    };
  }

  /** 导出：已经存进案例库的这些 → 一份或几份案例包（每份 ≤ 20 MB）→ [{ name, blob, ids }] */
  async exportPacks(caseIds, { max = PACK_MAX } = {}) {
    const all = await C.listCases({ includeDrafts: true, includeHidden: true });
    const byId = new Map(all.map((c) => [c.id, c]));
    const items = [];
    for (const id of caseIds) {
      const c = byId.get(id);
      if (!c) continue;
      const g = this.groups.find((x) => this.decision(x.id).saved?.caseId === id);
      const sv = g ? this.decision(g.id).saved : null;
      const est = sv?.bytes ? caseBytes(sv.json || 4000, [sv.bytes]) : caseBytes(JSON.stringify(c).length, c.images.map(() => 200 * 1024));
      items.push({ id, bytes: est });
    }
    let parts = splitPack(items, max * 0.97);
    const out = [];
    const d = new Date();
    // 估算有误差：真的超过就再对半分
    const queue = parts.map((p) => p.ids);
    const blobs = [];
    while (queue.length) {
      const ids = queue.shift();
      const blob = await C.exportPack(ids);
      if (blob.size > max && ids.length > 1) {
        const h = Math.ceil(ids.length / 2);
        queue.unshift(ids.slice(h));
        queue.unshift(ids.slice(0, h));
        continue;
      }
      blobs.push({ ids, blob });
    }
    blobs.forEach((b, i) => out.push({ ...b, name: partFileName(i + 1, blobs.length, d), oversize: b.blob.size > max }));
    return out;
  }

  destroy() {
    this.anBatch.flush();
    this.thumbBatch.flush();
    this.saveNow();
    this.listeners.clear();
  }
}

/** 小图：内存里最近用过的几百张（object URL），其余从 IndexedDB 读；都没有 → 让 worker 再做一张 */
export class Thumbs {
  constructor(session, pool, { max = 900 } = {}) {
    this.s = session;
    this.pool = pool;
    this.max = max;
    this.urls = new Map(); // key → url（Map 的顺序 = 最近用过的在后面）
    this.refs = new Map();
    this.wait = new Map(); // key → [cb]
    this.queue = new Set();
    this.timer = null;
  }
  peek(k) {
    const u = this.urls.get(k);
    if (u) {
      this.urls.delete(k);
      this.urls.set(k, u);
    }
    return u || null;
  }
  hold(k) {
    this.refs.set(k, (this.refs.get(k) || 0) + 1);
  }
  release(k) {
    const n = (this.refs.get(k) || 1) - 1;
    if (n <= 0) this.refs.delete(k);
    else this.refs.set(k, n);
  }
  want(k, cb) {
    const u = this.peek(k);
    if (u) return cb(u);
    if (!this.wait.has(k)) this.wait.set(k, []);
    this.wait.get(k).push(cb);
    const fresh = this.s.fresh.get(k);
    if (fresh) return this._set(k, fresh);
    this.queue.add(k);
    if (!this.timer) this.timer = setTimeout(() => this._load(), 30);
  }
  /** 分析刚做好的小图：有人在等就直接给 */
  offer(k, blob) {
    if (this.wait.has(k) && !this.urls.has(k)) this._set(k, blob);
  }
  async _load() {
    this.timer = null;
    const keys = [...this.queue];
    this.queue.clear();
    const got = await cache.getMany('thumbs', keys);
    for (const k of keys) {
      const b = got.get(k);
      if (b) this._set(k, b);
      else if (this.s.files.get(k)?.file && this.s.an.has(k)) {
        // 分析过但小图被清掉了 → 再做一张（急的）
        const f = this.s.files.get(k);
        this.pool
          .run({ op: 'analyse', file: f.file, view: f.view }, { urgent: true })
          .then(({ thumb }) => {
            if (thumb) {
              this.s.thumbBatch.add(k, thumb);
              this._set(k, thumb);
            }
          })
          .catch(() => {});
      }
    }
  }
  _set(k, blob) {
    const u = URL.createObjectURL(blob);
    this.urls.set(k, u);
    this.s.fresh.delete(k);
    for (const cb of this.wait.get(k) || []) cb(u);
    this.wait.delete(k);
    // 超过上限：放掉最久没用、也没有在屏幕上的
    if (this.urls.size > this.max) {
      for (const [kk, uu] of this.urls) {
        if (this.urls.size <= this.max * 0.85) break;
        if (this.refs.has(kk)) continue;
        URL.revokeObjectURL(uu);
        this.urls.delete(kk);
      }
    }
  }
  destroy() {
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear();
  }
}
