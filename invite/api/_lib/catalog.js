/* ============================================================
   案例库 API · 清单（index.json）的纯函数
   ------------------------------------------------------------
   清单格式见 tools/caselib 的合约；重点：
   - 项目名 name、档案路径 f 只给业务看：visiView() 一定拿掉。
   - pid = 'p' + sha256(正规化的文件夹名) 前 10 码：同一个文件夹再拖一次就是续传。
   - 自动标签（source:'auto'）不覆盖人工确认过的；人工改过的照片自动变 confirmed。
   - 平常只隐藏 / 复原。真的删除（purge）只给审核页「删除隐藏的照片（释放空间）」用：
     只能删已经隐藏的，删了旧方案里那张就变空位（VISI 显示空位，不会破图）。
   - 免费（Hobby）方案的额度：quota() / checkWrites()，见下面「额度」。
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
const PID_RE = /^p[0-9a-f]{10}$/;
var own = Object.prototype.hasOwnProperty;
// 只认清单里真的有的 id：'__proto__'、'constructor' 这类继承来的名字一律当不认得（不然会改到 Object.prototype）
export function hasPhoto(index, h) { return typeof h === 'string' && HEX16.test(h) && own.call(index.photos, h); }
export function hasProject(index, pid) { return typeof pid === 'string' && PID_RE.test(pid) && own.call(index.projects, pid); }

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
  // 这次登记的照片各自花了一次 /api/photo 写入（同一个 k 重送的不算：那是同一次上传）
  var puts = 0;
  v.photos.forEach(function (x) {
    var cur = index.photos[x.h];
    if (!cur || cur.k !== x.k) puts++;
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
  // 删过又亲手选回来传的：从「删过」拿掉
  if (Array.isArray(index.purged) && index.purged.length) index.purged = index.purged.filter(function (x) { return added.indexOf(x) < 0; });
  if (input.pack && proj.packs.indexOf(input.pack) < 0) {
    // 缩图包的大小记在 pb：旧项目（还没记过）先按原有张数估
    proj.pb = packBytes(proj) + Math.max(0, input.packSz | 0);
    proj.packs.push(input.pack);
  }
  groupShots(index, pid);
  proj.n = Object.keys(index.photos).filter(function (h) { return index.photos[h].p === pid; }).length;
  // writes：照片 + 缩图包（清单本身那一次由 mutate 算）；sunk：照片早就传上去了（拒绝登记也省不回来），不拿来比上限
  return { pid: pid, added: added, dup: dup, n: added.length, writes: puts + (input.pack ? 1 : 0), sunk: puts };
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
    if (!hasPhoto(index, h)) throw bad('unknown', { field: 'photos', id: h });
    P[h] = validPhotoPatch(h, photos[h], auto);
  });
  pj.forEach(function (pid) {
    if (!hasProject(index, pid)) throw bad('unknown', { field: 'projects', id: pid });
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
  ph.forEach(function (h) { if (!hasPhoto(index, h)) throw bad('unknown', { field: 'photos', id: String(h).slice(0, 40) }); });
  pj.forEach(function (p) { if (!hasProject(index, p)) throw bad('unknown', { field: 'projects', id: String(p).slice(0, 40) }); });
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
  delete out.purged;
  return out;
}

export function sizeOk(indexOrText) {
  var text = typeof indexOrText === 'string' ? indexOrText : JSON.stringify(indexOrText);
  return Buffer.byteLength(text, 'utf8') <= MAX_INDEX;
}

export function utcDay(ts) { return new Date(ts).toISOString().slice(0, 10); }
export function utcMonth(ts) { return new Date(ts).toISOString().slice(0, 7); }

/* ---------- 这个月用掉几次 Blob 写入 ----------
   usage: { 'YYYY-MM': { writes } }，每次写清单时一起记：清单本身、没写成的那几次、备份、这次登记的照片和缩图包。
   上传页拿它跟 Hobby 的每月约 2,000 次比（log 只留 300 笔，不能拿来算）。只留最近 3 个月 */
export function bumpUsage(index, ts, writes) {
  var u = index.usage && typeof index.usage === 'object' && !Array.isArray(index.usage) ? index.usage : {};
  var m = utcMonth(ts);
  var cur = u[m] && typeof u[m] === 'object' ? u[m] : { writes: 0 };
  var out = {};
  Object.keys(u).sort().slice(-2).forEach(function (k) { if (k !== m && /^\d{4}-\d{2}$/.test(k)) out[k] = u[k]; });
  out[m] = { writes: (cur.writes | 0) + Math.max(0, writes | 0) };
  index.usage = out;
}

/* ---------- 额度（Vercel Blob 免费 Hobby 方案）----------
   Hobby：每月约 2,000 次写入（put / copy …），储存 1 GB（总量，不是每月重算）。超过整个 store 会被停权约 30 天，
   连已经传上去的照片都打不开。所以伺服器自己设上限，不让它超过：
   - 传新照片（/api/photo）：这个月写入到 UPLOAD_CAP 就停，总储存量超过 BYTES_CAP 也停
   - 写清单（登记、改标签、隐藏）：到 WRITE_CAP 才停 —— 已经传上去的照片还能登记，不会变成没人用的档
   - 删除（purge）：到 PURGE_CAP 才停（删东西是为了救急）
   BLOB_PLAN=pro 就不设上限（Pro 超过只是多付钱，不会停权）。 */
export const UPLOAD_CAP = 1800;
export const WRITE_CAP = 1950;
export const PURGE_CAP = 1990;
export const BYTES_CAP = 950 * 1024 * 1024;
export const PACK_EST = 35 * 1024;           // 还没记大小的旧缩图包：每张缩图估 35 KB
export const INDEX_COPIES = 8;               // 清单本身 + 7 份每日备份

export function blobPlan() { return String(process.env.BLOB_PLAN || '').trim().toLowerCase() === 'pro' ? 'pro' : 'hobby'; }

export function monthWrites(index, ts) {
  var u = index && index.usage && typeof index.usage === 'object' ? index.usage[utcMonth(ts)] : null;
  return u && typeof u === 'object' ? Math.max(0, u.writes | 0) : 0;
}
function packBytes(proj) {
  if (typeof proj.pb === 'number' && isFinite(proj.pb) && proj.pb >= 0) return proj.pb;
  return Math.max(0, proj.n | 0) * PACK_EST;
}
// 总储存量（估）：照片 + 缩图包 + 清单和它的备份
export function storedBytes(index) {
  var n = 0;
  Object.keys(index.photos || {}).forEach(function (h) { n += Math.max(0, +index.photos[h].sz || 0); });
  Object.keys(index.projects || {}).forEach(function (pid) { n += packBytes(index.projects[pid]); });
  n += Buffer.byteLength(JSON.stringify(index), 'utf8') * INDEX_COPIES;
  return n;
}
// 给上传页 / 审核页看的额度；Pro 没有上限（cap 一律 null）
export function quota(index, ts, plan) {
  plan = plan || blobPlan();
  var writes = monthWrites(index, ts), bytes = storedBytes(index);
  var pro = plan === 'pro';
  return {
    plan: plan, month: utcMonth(ts), writes: writes, bytes: bytes,
    uploadCap: pro ? null : UPLOAD_CAP, writeCap: pro ? null : WRITE_CAP, bytesCap: pro ? null : BYTES_CAP,
    writesLeft: pro ? null : Math.max(0, UPLOAD_CAP - writes),
    bytesLeft: pro ? null : Math.max(0, BYTES_CAP - bytes)
  };
}
export function quotaError(reason, writesLeft, bytesLeft) {
  return new HttpError(507, { error: 'quota', reason: reason, writesLeft: Math.max(0, writesLeft | 0), bytesLeft: Math.max(0, Math.floor(bytesLeft || 0)) });
}
// 这次要写 add 次，会不会超过 cap（这个月已经写了 writes 次）
export function checkWrites(writes, add, cap, bytesLeft) {
  if (cap == null) return;
  if (writes + add > cap) throw quotaError('writes', cap - writes, bytesLeft);
}

/* ---------- 删除隐藏的照片（释放空间）----------
   planPurge：只读，算出要删哪些 Blob 档；applyPurge：从清单拿掉。
   - 只能删已经隐藏的照片（照片自己隐藏，或它的项目隐藏）
   - 项目的照片全删光：缩图包一起删、项目也拿掉；只删一部分：缩图包留着（缩图约占 8% 的空间） */
export const MAX_PURGE = 1000;
export const PURGED_KEEP = 20000;           // 删过的 hash 留着（每个 16 字）：再拖同一个文件夹时上传页不会又传一次
export function validatePurge(index, input) {
  input = input || {};
  var list = input.photos;
  if (!Array.isArray(list) || !list.length) throw bad('photos');
  if (list.length > MAX_PURGE) throw bad('too_many', { max: MAX_PURGE });
  var hs = [];
  list.forEach(function (h) {
    if (!hasPhoto(index, h)) throw bad('unknown', { field: 'photos', id: String(h).slice(0, 40) });
    var ph = index.photos[h];
    var pr = hasProject(index, ph.p) ? index.projects[ph.p] : null;
    if (!ph.hidden && !(pr && pr.hidden)) throw bad('not_hidden', { id: h });
    if (hs.indexOf(h) < 0) hs.push(h);
  });
  return hs;
}
export function planPurge(index, hs) {
  var gone = {};
  hs.forEach(function (h) { gone[h] = 1; });
  var keys = [], packs = [], emptied = [], freed = 0;
  hs.forEach(function (h) { var ph = index.photos[h]; if (ph.k) keys.push(ph.k); freed += Math.max(0, +ph.sz || 0); });
  var left = {};
  Object.keys(index.photos).forEach(function (h) { if (!gone[h]) left[index.photos[h].p] = 1; });
  var touched = {};
  hs.forEach(function (h) { touched[index.photos[h].p] = 1; });
  Object.keys(touched).forEach(function (pid) {
    if (left[pid] || !hasProject(index, pid)) return;
    var pr = index.projects[pid];
    emptied.push(pid);
    (pr.packs || []).forEach(function (k) { if (typeof k === 'string' && k) packs.push(k); });
    freed += packBytes(pr);
  });
  return { photos: hs, keys: keys, packs: packs, emptied: emptied, freed: freed };
}
export function applyPurge(index, plan) {
  var removed = 0, touched = {}, gone = [];
  plan.photos.forEach(function (h) {
    if (!hasPhoto(index, h)) return;              // 别人刚好也删了
    var pid = index.photos[h].p;
    if (hasProject(index, pid)) {
      var pr = index.projects[pid];
      // 缩图包还留着：先把大小定下来，之后张数变少也不会少算
      if (!touched[pid]) { pr.pb = packBytes(pr); touched[pid] = 1; }
    }
    delete index.photos[h];
    gone.push(h);
    removed++;
  });
  if (gone.length) {
    var prev = Array.isArray(index.purged) ? index.purged.filter(function (x) { return typeof x === 'string' && HEX16.test(x) && gone.indexOf(x) < 0; }) : [];
    index.purged = prev.concat(gone).slice(-PURGED_KEEP);
  }
  var gonePids = [];
  Object.keys(touched).forEach(function (pid) {
    var n = Object.keys(index.photos).filter(function (h) { return index.photos[h].p === pid; }).length;
    if (!n && plan.emptied.indexOf(pid) >= 0) { delete index.projects[pid]; gonePids.push(pid); return; }
    var pr = index.projects[pid];
    if (plan.emptied.indexOf(pid) >= 0) {
      // 删的时候别人刚好又传了几张进这个项目：旧的缩图包已经删了，从清单拿掉，大小改回用估的
      pr.packs = (pr.packs || []).filter(function (k) { return plan.packs.indexOf(k) < 0; });
      pr.pb = n * PACK_EST;
    }
    pr.n = n;
    groupShots(index, pid);                        // 组长可能被删了：重新分组
  });
  return { removed: removed, projectsRemoved: gonePids.length, n: removed, noop: removed === 0 };
}

/* ---------- mutate：读 → 改 → 条件写入，冲突重试 ----------
   fn(index) 直接改传进去的副本，回传 {…结果, n, noop?}；noop = 什么都没变，不写。
   opts: {by, op, now(), tries=5, sleep(ms), cap}
   cap：这个月写入的上限（null = 不限）；这次写入会超过就回 507，不写 */
export async function mutate(adapter, path, fn, opts) {
  opts = opts || {};
  var tries = opts.tries || 5;
  var now = opts.now || Date.now;
  var sleep = opts.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var spent = 0;                               // 这次 mutate 里没写成的清单、备份：也算写入次数
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
      delete out0.writes;
      delete out0.sunk;
      return out0;
    }
    work.v = 1;
    work.rev = (base.rev | 0) + 1;
    if (!work.base && adapter.base) work.base = adapter.base;
    if (!Array.isArray(work.log)) work.log = [];
    work.log.push({ op: opts.op || '?', by: opts.by || '', ts: ts, n: result.n | 0 });
    if (work.log.length > LOG_KEEP) work.log = work.log.slice(-LOG_KEEP);

    // 每天（UTC）第一次写入前，先备份一份昨天的样子（按星期几轮流覆盖）；失败不影响写入
    var last = base.log && base.log.length ? base.log[base.log.length - 1].ts : 0;
    if (cur && last && utcDay(last) !== utcDay(ts) && adapter.copy) {
      spent++;
      try { await adapter.copy(path, bakPath(ts)); } catch (e) { /* 备份失败不挡写入 */ }
    }
    var cost = 1 + spent + (result.writes | 0);
    if (opts.cap != null) checkWrites(monthWrites(base, ts), cost - Math.max(0, result.sunk | 0), opts.cap, BYTES_CAP - storedBytes(base));
    bumpUsage(work, ts, cost);
    var text = JSON.stringify(work);
    if (!sizeOk(text)) throw new HttpError(413, { error: 'index_too_large' });

    try {
      spent++;
      await adapter.putJson(path, text, cur ? { ifMatch: cur.etag } : { create: true });
      spent--;
      var out = Object.assign({}, result, { rev: work.rev });
      delete out.noop;
      delete out.writes;
      delete out.sunk;
      return out;
    } catch (e) {
      if (!e || e.code !== 'conflict') throw e;
      // 别人刚好也在写：等一下（随机，免得两边又撞在一起）再重读
      if (attempt < tries - 1) await sleep(Math.round((80 + Math.random() * 170) * Math.pow(2, attempt)));
    }
  }
  throw new HttpError(409, { error: 'conflict' });
}
