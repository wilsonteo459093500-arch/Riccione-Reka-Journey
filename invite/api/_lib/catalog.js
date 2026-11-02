/* ============================================================
   案例库 API · 清单（index.json）的纯函数
   ------------------------------------------------------------
   清单格式见 tools/caselib 的合约；重点：
   - 项目名 name、档案路径 f 只给业务看：visiView() 一定拿掉。
   - pid = 'p' + sha256(正规化的文件夹名) 前 10 码：同一个文件夹再拖一次就是续传。
   - 自动标签（source:'auto'）不覆盖人工确认过的；人工改过的照片自动变 confirmed。
   - 只能隐藏 / 复原，没有真的删除：旧方案引用的照片永远解析得到。
   - mutate()：读（不走快取）→ 改 → put(ifMatch)，冲突就重读重试，最多 5 次。
   这里的函数只改传进来的物件，不碰网路（mutate 透过 adapter）。
   ============================================================ */
import { createHash } from 'node:crypto';
import { HttpError } from './http.js';
import { bakPath } from './blob.js';
import { isStyle, isCabinet, isRoom, isPtype, isTrait, isStatus } from './vocab.js';

export const MAX_INDEX = 3.5 * 1024 * 1024;   // 清单上限：约 1 万张照片，远超过需要
export const MAX_PHOTOS_PER_CALL = 40;
export const MAX_PATCH_ENTRIES = 400;
export const LOG_KEEP = 300;
export const SHOT_DISTANCE = 6;               // dHash 汉明距离 ≤ 6 = 同一个镜头（连拍、微调角度）
export const AUTO_BY = 'Claude';              // 分类时 Claude 用这个名字登入；项目的 by 不是它就算人工

const HEX16 = /^[0-9a-f]{16}$/;

export function emptyIndex() {
  return { v: 1, rev: 0, base: '', projects: {}, photos: {}, log: [] };
}

// 文件夹名正规化：NFC、去头尾空白、空白合并、小写 —— 多一个空格或大小写不同仍是同一个项目
export function normalizeName(s) {
  return String(s == null ? '' : s).normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}
export function pidOf(name) {
  return 'p' + createHash('sha256').update(normalizeName(name), 'utf8').digest('hex').slice(0, 10);
}

// 存进清单的文字：去控制字元、空白合并、限长
export function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  var t = s.normalize('NFC').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(t).slice(0, max).join('');
}

/* ---------- dHash 分组 ---------- */
var POP = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
export function hamming(a, b) {
  if (!HEX16.test(a || '') || !HEX16.test(b || '')) return 64;
  var d = 0;
  for (var i = 0; i < 16; i++) d += POP[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return d;
}

// 同项目里，跟「较早的组长」够像就跟它同组，不然自己当组长。
// 只跟组长比、照登记顺序：后来加的照片不会改动已经分好的组
export function groupShots(index, pid) {
  var leaders = [];
  Object.keys(index.photos).forEach(function (h) {
    var ph = index.photos[h];
    if (ph.p !== pid) return;
    var lead = null;
    for (var i = 0; i < leaders.length; i++) {
      if (hamming(ph.dh, index.photos[leaders[i]].dh) <= SHOT_DISTANCE) { lead = leaders[i]; break; }
    }
    if (lead) ph.shot = lead;
    else { ph.shot = h; leaders.push(h); }
  });
}

function bad(error, extra) { return new HttpError(400, Object.assign({ error: error }, extra || {})); }
function isInt(n, lo, hi) { return typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi; }

/* ---------- addPhotos ----------
   input: {project:{name}, photos:[{h,k,w,ht,sz,dh,f}], pack?:'t/…json'}
   已在同项目的跳过；已在别的项目的留在原处、回报在 dup。 */
export function validateAddPhotos(input) {
  var name = cleanText(input && input.project && input.project.name, 120);
  if (!name) throw bad('project');
  var list = input.photos;
  if (!Array.isArray(list) || !list.length) throw bad('photos');
  if (list.length > MAX_PHOTOS_PER_CALL) throw bad('too_many', { max: MAX_PHOTOS_PER_CALL });
  var photos = list.map(function (x) {
    if (!x || typeof x !== 'object') throw bad('photo');
    var h = x.h;
    if (!HEX16.test(h || '')) throw bad('photo', { field: 'h' });
    // k 是 /api/photo 回来的 pathname：c/<h>-随机后缀.jpg
    if (typeof x.k !== 'string' || x.k.indexOf('c/' + h) !== 0 || !/^c\/[A-Za-z0-9._-]+\.jpg$/.test(x.k) || x.k.length > 120) throw bad('photo', { field: 'k', h: h });
    if (!isInt(x.w, 1, 20000)) throw bad('photo', { field: 'w', h: h });
    if (!isInt(x.ht, 1, 20000)) throw bad('photo', { field: 'ht', h: h });
    if (!isInt(x.sz, 0, 200 * 1024 * 1024)) throw bad('photo', { field: 'sz', h: h });
    if (!HEX16.test(x.dh || '')) throw bad('photo', { field: 'dh', h: h });
    return { h: h, k: x.k, w: x.w, ht: x.ht, sz: x.sz, dh: x.dh, f: cleanText(x.f, 300) };
  });
  return { name: name, photos: photos };
}

export function addPhotos(index, input, by, now) {
  var v = validateAddPhotos(input);
  var pid = pidOf(v.name);
  var proj = index.projects[pid];
  if (!proj) {
    proj = index.projects[pid] = { name: v.name, area: '', ptype: '', traits: [], style: '', packs: [], n: 0, by: by, ts: now };
  }
  var added = [], dup = [];
  v.photos.forEach(function (x) {
    var cur = index.photos[x.h];
    if (cur) {
      if (cur.p !== pid && dup.indexOf(x.h) < 0) dup.push(x.h);
      return;
    }
    index.photos[x.h] = {
      p: pid, k: x.k, w: x.w, h: x.ht, sz: x.sz, dh: x.dh, shot: x.h, f: x.f,
      room: '', cabinets: [], style: '', hero: false, desc: { zh: '', en: '' },
      status: 'new', by: by, ts: now
    };
    added.push(x.h);
  });
  // 一张都没新增（全部已登记过）：不写，省 Blob 写入次数；新项目也等有照片才建立
  if (!added.length) return { pid: pid, added: added, dup: dup, n: 0, noop: true };
  if (input.pack && proj.packs.indexOf(input.pack) < 0) proj.packs.push(input.pack);
  groupShots(index, pid);
  proj.n = Object.keys(index.photos).filter(function (h) { return index.photos[h].p === pid; }).length;
  return { pid: pid, added: added, dup: dup, n: added.length };
}

/* ---------- patch ----------
   {source:'auto'|'human', photos:{h:{room,cabinets,style,hero,desc,status}}, projects:{pid:{area,ptype,traits,style}}} */
var PHOTO_FIELDS = ['room', 'cabinets', 'style', 'hero', 'desc', 'status'];
var PROJECT_FIELDS = ['area', 'ptype', 'traits', 'style'];

function vocabErr(field, id, value) { return bad('vocab', { field: field, id: id, value: value }); }

function cleanList(arr, ok, field, id) {
  if (!Array.isArray(arr) || arr.length > 20) throw vocabErr(field, id, arr);
  var out = [];
  arr.forEach(function (k) {
    if (typeof k !== 'string' || !ok(k)) throw vocabErr(field, id, k);
    if (out.indexOf(k) < 0) out.push(k);
  });
  return out;
}

function validPhotoPatch(h, x, auto) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw vocabErr('photo', h);
  var out = {};
  Object.keys(x).forEach(function (f) {
    var val = x[f];
    if (PHOTO_FIELDS.indexOf(f) < 0) throw vocabErr(f, h);
    if (f === 'room') { if (val !== '' && !isRoom(val)) throw vocabErr(f, h, val); out.room = val; }
    else if (f === 'style') { if (val !== '' && !isStyle(val)) throw vocabErr(f, h, val); out.style = val; }
    else if (f === 'cabinets') out.cabinets = cleanList(val, isCabinet, f, h);
    else if (f === 'hero') { if (typeof val !== 'boolean') throw vocabErr(f, h, val); out.hero = val; }
    else if (f === 'desc') {
      if (!val || typeof val !== 'object' || Array.isArray(val)) throw vocabErr(f, h);
      var d = {};
      Object.keys(val).forEach(function (l) {
        if ((l !== 'zh' && l !== 'en') || typeof val[l] !== 'string') throw vocabErr('desc.' + l, h);
        d[l] = cleanText(val[l], 200);
      });
      out.desc = d;
    }
    else if (f === 'status') {
      // 自动只能标「自动」或「不确定」，确认一定要人来
      if (!isStatus(val) || (auto && val !== 'auto' && val !== 'unsure')) throw vocabErr(f, h, val);
      out.status = val;
    }
  });
  return out;
}

function validProjectPatch(pid, x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw vocabErr('project', pid);
  var out = {};
  Object.keys(x).forEach(function (f) {
    var val = x[f];
    if (PROJECT_FIELDS.indexOf(f) < 0) throw vocabErr(f, pid);
    if (f === 'area') { if (typeof val !== 'string') throw vocabErr(f, pid, val); out.area = cleanText(val, 60); }
    else if (f === 'ptype') { if (val !== '' && !isPtype(val)) throw vocabErr(f, pid, val); out.ptype = val; }
    else if (f === 'style') { if (val !== '' && !isStyle(val)) throw vocabErr(f, pid, val); out.style = val; }
    else if (f === 'traits') out.traits = cleanList(val, isTrait, f, pid);
  });
  return out;
}

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function isEmpty(v) { return v === '' || v == null || (Array.isArray(v) && !v.length); }

export function patch(index, input, by, now) {
  input = input || {};
  var source = input.source;
  if (source !== 'auto' && source !== 'human') throw bad('vocab', { field: 'source', value: source });
  var auto = source === 'auto';
  var photos = input.photos || {}, projects = input.projects || {};
  if (typeof photos !== 'object' || Array.isArray(photos) || typeof projects !== 'object' || Array.isArray(projects)) throw bad('vocab', { field: 'photos' });
  var ph = Object.keys(photos), pj = Object.keys(projects);
  if (ph.length + pj.length > MAX_PATCH_ENTRIES) throw bad('too_many', { max: MAX_PATCH_ENTRIES });

  // 先全部验证，有一个不对就整批不写
  var P = {}, J = {};
  ph.forEach(function (h) {
    if (!index.photos[h]) throw bad('unknown', { field: 'photos', id: h });
    P[h] = validPhotoPatch(h, photos[h], auto);
  });
  pj.forEach(function (pid) {
    if (!index.projects[pid]) throw bad('unknown', { field: 'projects', id: pid });
    J[pid] = validProjectPatch(pid, projects[pid]);
  });

  var changed = 0;
  ph.forEach(function (h) {
    var cur = index.photos[h], x = P[h];
    // 人工确认过的，自动标签一个字都不动
    if (auto && cur.status === 'confirmed') return;
    var next = JSON.parse(JSON.stringify(cur));
    Object.keys(x).forEach(function (f) {
      if (f === 'desc') next.desc = Object.assign({ zh: '', en: '' }, cur.desc || {}, x.desc);
      else if (f !== 'status') next[f] = x[f];
    });
    if (x.status) next.status = x.status;
    else if (Object.keys(x).length) next.status = auto ? 'auto' : 'confirmed';
    if (same(next, cur)) return;
    next.by = by; next.ts = now;
    index.photos[h] = next;
    changed++;
  });
  pj.forEach(function (pid) {
    var cur = index.projects[pid], x = J[pid];
    var next = JSON.parse(JSON.stringify(cur));
    // 自动只能填空的，或改 Claude 自己上次填的；人改过的不动
    var humanSet = cur.by !== AUTO_BY;
    Object.keys(x).forEach(function (f) {
      if (auto && humanSet && !isEmpty(cur[f])) return;
      next[f] = x[f];
    });
    if (same(next, cur)) return;
    next.by = by; next.ts = now;
    index.projects[pid] = next;
    changed++;
  });
  return { changed: changed, n: changed, noop: changed === 0 };
}

/* ---------- 隐藏 / 复原（没有删除） ---------- */
export function setHidden(index, input, hide, by, now) {
  input = input || {};
  var ph = input.photos || [], pj = input.projects || [];
  if (!Array.isArray(ph) || !Array.isArray(pj)) throw bad('ids');
  if (ph.length + pj.length > MAX_PATCH_ENTRIES) throw bad('too_many', { max: MAX_PATCH_ENTRIES });
  ph.forEach(function (h) { if (typeof h !== 'string' || !index.photos[h]) throw bad('unknown', { field: 'photos', id: h }); });
  pj.forEach(function (p) { if (typeof p !== 'string' || !index.projects[p]) throw bad('unknown', { field: 'projects', id: p }); });
  var changed = 0;
  function apply(rec, isPhoto) {
    if (hide) {
      if (rec.hidden) return;
      rec.hidden = { by: by, ts: now };
    } else {
      if (!rec.hidden) return;
      delete rec.hidden;
    }
    // 照片记下谁动的；项目的 by 留给「谁改了项目资料」，自动标签的规则要看它
    if (isPhoto) { rec.by = by; rec.ts = now; }
    changed++;
  }
  ph.forEach(function (h) { apply(index.photos[h], true); });
  pj.forEach(function (p) { apply(index.projects[p], false); });
  return { changed: changed, n: changed, noop: changed === 0 };
}

/* ---------- 给 VISI 的版本：拿掉项目名、档案路径、操作纪录 ---------- */
export function visiView(index) {
  var out = JSON.parse(JSON.stringify(index));
  Object.keys(out.projects || {}).forEach(function (pid) { delete out.projects[pid].name; });
  Object.keys(out.photos || {}).forEach(function (h) { delete out.photos[h].f; });
  delete out.log;
  return out;
}

export function sizeOk(indexOrText) {
  var text = typeof indexOrText === 'string' ? indexOrText : JSON.stringify(indexOrText);
  return Buffer.byteLength(text, 'utf8') <= MAX_INDEX;
}

export function utcDay(ts) { return new Date(ts).toISOString().slice(0, 10); }

/* ---------- mutate：读 → 改 → 条件写入，冲突重试 ----------
   fn(index) 直接改传进去的副本，回传 {…结果, n, noop?}；noop = 什么都没变，不写。
   opts: {by, op, now(), tries=5, sleep(ms)} */
export async function mutate(adapter, path, fn, opts) {
  opts = opts || {};
  var tries = opts.tries || 5;
  var now = opts.now || Date.now;
  var sleep = opts.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  for (var attempt = 0; attempt < tries; attempt++) {
    var cur = await adapter.getJson(path, { fresh: attempt > 0 });
    var base = cur && cur.data && typeof cur.data === 'object' ? cur.data : emptyIndex();
    var work = JSON.parse(JSON.stringify(base));
    if (!work.projects || typeof work.projects !== 'object') work.projects = {};
    if (!work.photos || typeof work.photos !== 'object') work.photos = {};
    var ts = now();
    var result = (await fn(work, ts)) || {};
    if (result.noop) {
      var out0 = Object.assign({}, result, { rev: base.rev | 0 });
      delete out0.noop;
      return out0;
    }
    work.v = 1;
    work.rev = (base.rev | 0) + 1;
    if (!work.base && adapter.base) work.base = adapter.base;
    if (!Array.isArray(work.log)) work.log = [];
    work.log.push({ op: opts.op || '?', by: opts.by || '', ts: ts, n: result.n | 0 });
    if (work.log.length > LOG_KEEP) work.log = work.log.slice(-LOG_KEEP);
    var text = JSON.stringify(work);
    if (!sizeOk(text)) throw new HttpError(413, { error: 'index_too_large' });

    // 每天（UTC）第一次写入前，先备份一份昨天的样子；失败不影响写入
    var last = base.log && base.log.length ? base.log[base.log.length - 1].ts : 0;
    if (cur && last && utcDay(last) !== utcDay(ts) && adapter.copy) {
      try { await adapter.copy(path, bakPath(utcDay(ts))); } catch (e) { /* 备份失败不挡写入 */ }
    }

    try {
      await adapter.putJson(path, text, cur ? { ifMatch: cur.etag } : { create: true });
      var out = Object.assign({}, result, { rev: work.rev });
      delete out.noop;
      return out;
    } catch (e) {
      if (!e || e.code !== 'conflict') throw e;
      // 别人刚好也在写：等一下（随机，免得两边又撞在一起）再重读
      if (attempt < tries - 1) await sleep(Math.round((80 + Math.random() * 170) * Math.pow(2, attempt)));
    }
  }
  throw new HttpError(409, { error: 'conflict' });
}
