/* ============================================================
   案例库 · 本机模式的清单逻辑（local-core）
   ------------------------------------------------------------
   「存在这台电脑」模式：caselib-sw.js（service worker）在这台电脑的浏览器里
   回答跟伺服器一模一样的 /api/session、/api/photo、/api/catalog，资料放 IndexedDB。
   这个档就是 invite/api/_lib/catalog.js 的纯函数照抄成 ES5（没有 DOM、没有网路）：
   - service worker 用 importScripts 载入；caselib.html 也载入（自动标签、标签档）；
     测试用 Node 的 vm 载入，跟伺服器的版本跑同一串操作、比对结果要一模一样
     （tools/caselib/test/local-core.test.mjs）。改伺服器那边就要改这边。
   - pid = 'p' + sha256(正规化的文件夹名) 前 10 码：这里自己算 SHA-256（同步），
     跟伺服器的 pidOf 一模一样 —— 之后搬回云端，项目 id 不变。照片 id = 原档 sha256 前 16 码，本来就一样。
   - 错误跟伺服器的 HttpError 一样：{status, body:{error, …}}。
   - 词表用 case-vocab.js 的 MB.CASE_*（要先载入那个档）。
   另外三样只有本机模式用得到（伺服器没有）：
   - autoTags(index, opts)：从文件夹名猜风格、区域（项目），子文件夹名猜空间、柜类（照片）。
     一律 source:'auto'，只填空的；客户名字绝不会进到任何标签。
   - exportTags / readTags / mergeTags：标签档（只有标签，没有照片、没有档案路径），
     同事汇入同一个文件夹后套用同一份分类。
   对外：MB.clCore
   ============================================================ */
(function (G) {
  'use strict';

  var MB = G.MB = G.MB || {};

  var MAX_PHOTOS_PER_CALL = 40;
  var MAX_PATCH_ENTRIES = 400;
  var LOG_KEEP = 300;
  var SHOT_DISTANCE = 6;
  var AUTO_BY = 'Claude';
  var PACK_EST = 35 * 1024;
  var MAX_PURGE = 1000;
  var PURGED_KEEP = 20000;
  var TAGS_KIND = 'visi-caselib-tags';

  var HEX16 = /^[0-9a-f]{16}$/;
  var PID_RE = /^p[0-9a-f]{10}$/;
  var own = Object.prototype.hasOwnProperty;

  /* ---------- 小工具 ---------- */
  function assign(t) {
    for (var i = 1; i < arguments.length; i++) {
      var s = arguments[i];
      if (s) for (var k in s) if (own.call(s, k)) t[k] = s[k];
    }
    return t;
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function chars(t) { return Array.from ? Array.from(t) : t.split(''); }
  // 伺服器：/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu。旧浏览器不认得 \p{…} 就用列出来的范围
  var CTRL;
  try { CTRL = new RegExp('[\\p{Cc}\\p{Cf}\\p{Zl}\\p{Zp}]', 'gu'); } catch (e) {
    CTRL = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u00ad\\u0600-\\u0605\\u061c\\u06dd\\u070f\\u180e\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u2064\\u2066-\\u206f\\ufeff\\ufff9-\\ufffb]', 'g');
  }
  function nfc(s) { return s.normalize ? s.normalize('NFC') : s; }

  // 跟伺服器的 HttpError 一样：status + body
  function HttpError(status, body) {
    var e = new Error((body && body.error) || 'http_' + status);
    e.status = status;
    e.body = body || { error: 'http_' + status };
    e.http = true;
    return e;
  }
  function bad(error, extra) { return HttpError(400, assign({ error: error }, extra || {})); }
  function isInt(n, lo, hi) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n >= lo && n <= hi; }

  /* ---------- SHA-256（同步，UTF-8）：pidOf 跟伺服器的 node:crypto 一模一样 ---------- */
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  // 字串 → UTF-8 bytes。落单的 surrogate 跟 Node 的 Buffer 一样变成 U+FFFD
  function utf8(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
        var cp = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(++i) - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else if (c >= 0xd800 && c <= 0xdfff) out.push(0xef, 0xbf, 0xbd);
      else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  // UTF-8 的 byte 数（缩图包很大，不必真的转一次）
  function utf8Len(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function sha256Hex(str) {
    var bytes = utf8(String(str));
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var len = bytes.length;
    var hi = Math.floor(len / 0x20000000), lo = (len * 8) >>> 0;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    var W = new Array(64);
    for (var i = 0; i < bytes.length; i += 64) {
      var t;
      for (t = 0; t < 16; t++) W[t] = (bytes[i + 4 * t] << 24) | (bytes[i + 4 * t + 1] << 16) | (bytes[i + 4 * t + 2] << 8) | bytes[i + 4 * t + 3];
      for (t = 16; t < 64; t++) {
        var x = W[t - 15], y = W[t - 2];
        var s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
        var s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + W[t]) | 0;
        var t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = '';
    for (var j = 0; j < 8; j++) out += ('00000000' + (H[j] >>> 0).toString(16)).slice(-8);
    return out;
  }

  /* ---------- 词表（case-vocab.js 的 MB.CASE_*） ---------- */
  function hasKey(list, k) {
    list = list || [];
    for (var i = 0; i < list.length; i++) if (list[i].key === k) return true;
    return false;
  }
  function isStyle(k) { return hasKey(MB.CASE_STYLES, k); }
  function isCabinet(k) { return hasKey(MB.CASE_CABINETS, k); }
  function isRoom(k) { return (MB.CASE_ROOMS || []).indexOf(k) >= 0; }
  function isPtype(k) { return hasKey(MB.CASE_PTYPES, k); }
  function isTrait(k) { return hasKey(MB.CASE_TRAITS, k); }
  function isStatus(k) { return (MB.CASE_STATUS || []).indexOf(k) >= 0; }

  /* ============================================================
     下面照抄 invite/api/_lib/catalog.js（一样的顺序、一样的规则）
     ============================================================ */
  function hasPhoto(index, h) { return typeof h === 'string' && HEX16.test(h) && own.call(index.photos, h); }
  function hasProject(index, pid) { return typeof pid === 'string' && PID_RE.test(pid) && own.call(index.projects, pid); }

  function emptyIndex() {
    return { v: 1, rev: 0, base: '', projects: {}, photos: {}, log: [] };
  }
  function normalizeName(s) {
    return nfc(String(s == null ? '' : s)).trim().replace(/\s+/g, ' ').toLowerCase();
  }
  function pidOf(name) { return 'p' + sha256Hex(normalizeName(name)).slice(0, 10); }
  function cleanText(s, max) {
    if (typeof s !== 'string') return '';
    var t = nfc(s).replace(CTRL, ' ').replace(/\s+/g, ' ').trim();
    return chars(t).slice(0, max).join('');
  }
  // 登入的名字（= auth.js 的 cleanName）：去控制字元、空白合并、1–30 个字
  function cleanName(s) {
    if (typeof s !== 'string') return '';
    var t = nfc(s).replace(CTRL, '').replace(/\s+/g, ' ').trim();
    var len = chars(t).length;
    return len >= 1 && len <= 30 ? t : '';
  }

  var POP = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
  function hamming(a, b) {
    if (!HEX16.test(a || '') || !HEX16.test(b || '')) return 64;
    var d = 0;
    for (var i = 0; i < 16; i++) d += POP[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
    return d;
  }
  function groupShots(index, pid) {
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

  /* ---------- addPhotos ---------- */
  function validateAddPhotos(input) {
    var name = cleanText(input && input.project && input.project.name, 120);
    if (!name) throw bad('project');
    var list = input.photos;
    if (!Array.isArray(list) || !list.length) throw bad('photos');
    if (list.length > MAX_PHOTOS_PER_CALL) throw bad('too_many', { max: MAX_PHOTOS_PER_CALL });
    var photos = list.map(function (x) {
      if (!x || typeof x !== 'object') throw bad('photo');
      var h = x.h;
      if (!HEX16.test(h || '')) throw bad('photo', { field: 'h' });
      if (typeof x.k !== 'string' || x.k.indexOf('c/' + h) !== 0 || !/^c\/[A-Za-z0-9._-]+\.jpg$/.test(x.k) || x.k.length > 120) throw bad('photo', { field: 'k', h: h });
      if (!isInt(x.w, 1, 20000)) throw bad('photo', { field: 'w', h: h });
      if (!isInt(x.ht, 1, 20000)) throw bad('photo', { field: 'ht', h: h });
      if (!isInt(x.sz, 0, 200 * 1024 * 1024)) throw bad('photo', { field: 'sz', h: h });
      if (!HEX16.test(x.dh || '')) throw bad('photo', { field: 'dh', h: h });
      return { h: h, k: x.k, w: x.w, ht: x.ht, sz: x.sz, dh: x.dh, f: cleanText(x.f, 300) };
    });
    return { name: name, photos: photos };
  }

  function packBytes(proj) {
    if (typeof proj.pb === 'number' && isFinite(proj.pb) && proj.pb >= 0) return proj.pb;
    return Math.max(0, proj.n | 0) * PACK_EST;
  }

  function addPhotos(index, input, by, now) {
    var v = validateAddPhotos(input);
    var pid = pidOf(v.name);
    var proj = index.projects[pid];
    if (!proj) {
      proj = index.projects[pid] = { name: v.name, area: '', ptype: '', traits: [], style: '', packs: [], n: 0, by: by, ts: now };
    }
    var added = [], dup = [];
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
    if (!added.length) return { pid: pid, added: added, dup: dup, n: 0, noop: true };
    if (Array.isArray(index.purged) && index.purged.length) index.purged = index.purged.filter(function (x) { return added.indexOf(x) < 0; });
    if (input.pack && proj.packs.indexOf(input.pack) < 0) {
      proj.pb = packBytes(proj) + Math.max(0, input.packSz | 0);
      proj.packs.push(input.pack);
    }
    groupShots(index, pid);
    proj.n = Object.keys(index.photos).filter(function (h) { return index.photos[h].p === pid; }).length;
    return { pid: pid, added: added, dup: dup, n: added.length, writes: puts + (input.pack ? 1 : 0), sunk: puts };
  }

  /* ---------- patch ---------- */
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

  function patch(index, input, by, now) {
    input = input || {};
    var source = input.source;
    if (source !== 'auto' && source !== 'human') throw bad('vocab', { field: 'source', value: source });
    var auto = source === 'auto';
    var photos = input.photos || {}, projects = input.projects || {};
    if (typeof photos !== 'object' || Array.isArray(photos) || typeof projects !== 'object' || Array.isArray(projects)) throw bad('vocab', { field: 'photos' });
    var ph = Object.keys(photos), pj = Object.keys(projects);
    if (ph.length + pj.length > MAX_PATCH_ENTRIES) throw bad('too_many', { max: MAX_PATCH_ENTRIES });

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
      if (auto && cur.status === 'confirmed') return;
      var next = clone(cur);
      Object.keys(x).forEach(function (f) {
        if (f === 'desc') next.desc = assign({ zh: '', en: '' }, cur.desc || {}, x.desc);
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
      var next = clone(cur);
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

  /* ---------- 隐藏 / 复原 ---------- */
  function setHidden(index, input, hide, by, now) {
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
      if (isPhoto) { rec.by = by; rec.ts = now; }
      changed++;
    }
    ph.forEach(function (h) { apply(index.photos[h], true); });
    pj.forEach(function (p) { apply(index.projects[p], false); });
    return { changed: changed, n: changed, noop: changed === 0 };
  }

  /* ---------- 给 VISI 的版本：拿掉项目名、档案路径、操作纪录 ---------- */
  function visiView(index) {
    var out = clone(index);
    Object.keys(out.projects || {}).forEach(function (pid) { delete out.projects[pid].name; });
    Object.keys(out.photos || {}).forEach(function (h) { delete out.photos[h].f; });
    delete out.log;
    delete out.purged;
    return out;
  }

  function utcDay(ts) { return new Date(ts).toISOString().slice(0, 10); }
  function utcMonth(ts) { return new Date(ts).toISOString().slice(0, 7); }

  function bumpUsage(index, ts, writes) {
    var u = index.usage && typeof index.usage === 'object' && !Array.isArray(index.usage) ? index.usage : {};
    var m = utcMonth(ts);
    var cur = u[m] && typeof u[m] === 'object' ? u[m] : { writes: 0 };
    var out = {};
    Object.keys(u).sort().slice(-2).forEach(function (k) { if (k !== m && /^\d{4}-\d{2}$/.test(k)) out[k] = u[k]; });
    out[m] = { writes: (cur.writes | 0) + Math.max(0, writes | 0) };
    index.usage = out;
  }
  function monthWrites(index, ts) {
    var u = index && index.usage && typeof index.usage === 'object' ? index.usage[utcMonth(ts)] : null;
    return u && typeof u === 'object' ? Math.max(0, u.writes | 0) : 0;
  }
  // 照片 + 缩图包 + 清单（本机没有每天的备份：清单算一份）
  function storedBytes(index) {
    var n = 0;
    Object.keys(index.photos || {}).forEach(function (h) { n += Math.max(0, +index.photos[h].sz || 0); });
    Object.keys(index.projects || {}).forEach(function (pid) { n += packBytes(index.projects[pid]); });
    n += utf8Len(JSON.stringify(index));
    return n;
  }

  /* ---------- 删除隐藏的照片 ---------- */
  function validatePurge(index, input) {
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
  function planPurge(index, hs) {
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
  function applyPurge(index, plan) {
    var removed = 0, touched = {}, gone = [];
    plan.photos.forEach(function (h) {
      if (!hasPhoto(index, h)) return;
      var pid = index.photos[h].p;
      if (hasProject(index, pid)) {
        var pr = index.projects[pid];
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
        pr.packs = (pr.packs || []).filter(function (k) { return plan.packs.indexOf(k) < 0; });
        pr.pb = n * PACK_EST;
      }
      pr.n = n;
      groupShots(index, pid);
    });
    return { removed: removed, projectsRemoved: gonePids.length, n: removed, noop: removed === 0 };
  }

  /* ---------- run：伺服器 mutate 的同步版本（本机没有冲突、没有每天的备份） ----------
     index 直接改（呼叫的人给一份自己的副本：IndexedDB 读出来的本来就是）。
     fn(index, ts) 回 {…, n, noop?, writes?}；noop = 什么都没变（不写）。
     回 {write: 要不要存, out: 给页面的结果（含 rev）}；fn 丢错就整个不算（呼叫的人不存） */
  function run(index, fn, opts) {
    opts = opts || {};
    if (!index.projects || typeof index.projects !== 'object') index.projects = {};
    if (!index.photos || typeof index.photos !== 'object') index.photos = {};
    var baseRev = index.rev | 0;
    var ts = opts.now ? opts.now() : Date.now();
    var result = fn(index, ts) || {};
    var out;
    if (result.noop) {
      out = assign({}, result, { rev: baseRev });
      delete out.noop; delete out.writes; delete out.sunk;
      return { write: false, out: out };
    }
    index.v = 1;
    index.rev = baseRev + 1;
    if (!index.base && opts.base) index.base = opts.base;
    if (!Array.isArray(index.log)) index.log = [];
    index.log.push({ op: opts.op || '?', by: opts.by || '', ts: ts, n: result.n | 0 });
    if (index.log.length > LOG_KEEP) index.log = index.log.slice(-LOG_KEEP);
    bumpUsage(index, ts, 1 + (result.writes | 0));
    out = assign({}, result, { rev: index.rev });
    delete out.noop; delete out.writes; delete out.sunk;
    return { write: true, out: out };
  }

  /* ============================================================
     自动标签：文件夹名 → 风格、区域；子文件夹名 → 空间、柜类
     ============================================================ */
  // 空间：照顺序比（衣帽间在主卧前面：「主卧衣帽间」是衣帽间；浴室在主卧前面：「主卧浴室」是浴室）
  var ROOM_WORDS = [
    ['walkin', '衣帽间|更衣间|更衣室|walk[\\s-]?in'],
    ['bathroom', '浴室|厕所|卫生间|洗手间|淋浴|bath(room)?s?\\b|toilets?\\b|washrooms?\\b|wc\\b'],
    ['vanity', '梳妆间|化妆间|dressing room'],
    ['master', '主卧|主人房|master'],
    ['guest', '客房|客卧|guest'],
    ['bedroom', '儿童房|小孩房|孩子房|男孩房|女孩房|kids?[\\s-]?(bed)?rooms?|child(ren)?\'?s?[\\s-]?rooms?'],
    ['kitchen', '厨房|kitchen|dapur|pantry'],
    ['dining', '餐厅|饭厅|dining'],
    ['living', '客厅|起居室|living'],
    ['foyer', '玄关|入户|门厅|foyer|entrance|entry'],
    ['laundry', '洗衣房|洗衣间|洗衣|laundry'],
    ['study', '书房|study|home office'],
    ['altar', '神台|佛台|佛堂|神明|altar|prayer']
  ];
  // 柜类：子文件夹名里明明白白写着的（床尾柜在定制床前面）
  var CABINET_WORDS = [
    ['kitchen', '橱柜|厨柜|厨房|kitchen'],
    ['wardrobe', '衣柜|wardrobes?'],
    ['display', '展示柜|陈列柜|酒柜|display'],
    ['bookcase', '书柜|书架|book(case|shelf|shelves)'],
    ['bedend', '床尾柜|bed[\\s-]?end'],
    ['dresser', '化妆台|梳妆台|dresser|dressing table'],
    ['island', '中岛|island'],
    ['tvcab', '电视柜|tv[\\s-]?(cabinet|console)'],
    ['tvwall', '电视墙|电视背景墙|tv[\\s-]?wall|feature wall'],
    ['door', '房门|门板|\\bdoors?\\b'],
    ['shoe', '鞋柜|shoe'],
    ['bathvanity', '浴室柜|洗手台|洗脸台|bath(room)?[\\s-]?vanity|vanity'],
    ['wallpanel', '护墙板|墙板|wall[\\s-]?panel'],
    ['sideboard', '餐边柜|sideboard'],
    ['bed', '定制床|榻榻米|床架|custom bed|bed[\\s-]?frame']
  ];
  var ROOM_RE = ROOM_WORDS.map(function (x) { return [x[0], new RegExp(x[1], 'i')]; });
  var CAB_RE = CABINET_WORDS.map(function (x) { return [x[0], new RegExp(x[1], 'i')]; });
  /* 区域：文件夹名照「区域 风格 客户名」取风格前面那几个字 —— 但一定要「明显是地名」才收，
     客户名字绝不能被当成区域（区域会印在 VISI 的项目名「区域 · 风格 · #n」上）：
     - 只收拉丁字母（有数字的多半是门牌、单位号）、1–4 个字、没有称呼（先生、Mr…）、没有路名（Jalan、Lot…）
     - 而且一定是常见的地名（AREAS），或开头是 Taman、Bandar、Desa、Kota… 这种一看就是地名的字（PLACE）。
       「John Doe 原木 黄先生」「M Vertica 奶油风」看不出是人名还是楼盘名：一律留空
     其它一律留空，业务在「审核」自己填 */
  var HONOR = /先生|太太|小姐|女士|夫人|老板|夫妇|阿姨|叔叔|伯伯|医生|老师|(^|[\s.])(mr|mrs|ms|mdm|madam|miss|dr|dato'?|datin|datuk|tan sri|puan|encik|en|cik|tuan|sir|uncle|aunty|auntie)([\s.]|$)/i;
  var CLIENTISH = /客户|客人|client|测试|test/i;
  var STREET = /(^|\s)(jalan|jln|lorong|lrg|persiaran|lebuh|lebuhraya|road|rd|street|st|lane|ln|avenue|ave|lot|unit|block|blok|no|tingkat|floor|level)(\s|\.|$)/i;
  var AREAS = new RegExp('^(' + ['setia alam', 'shah alam', 'bangsar( south)?', 'mont kiara', 'sri hartamas', '(ara |kota |mutiara )?damansara( heights| jaya| perdana| utama)?',
    'petaling jaya', 'pj', 'subang( jaya)?', 'usj', 'puchong', 'cheras', 'kepong', 'klang', 'kajang', 'semenyih', 'rawang', 'cyberjaya', 'putrajaya',
    'seri kembangan', 'serdang', 'bukit jalil', 'sri petaling', 'old klang road', 'ampang', 'setapak', 'wangsa maju', 'gombak', 'selayang',
    'kuala lumpur', 'kl', 'klcc', 'bukit bintang', 'desa park ?city', 'sentul', 'segambut', 'bukit jelutong', 'kota kemuning', 'bandar utama',
    'tropicana', '(bandar )?sunway', 'glenmarie', 'denai alam', 'sungai buloh', 'penang', 'george ?town', 'bayan lepas', 'butterworth',
    'ipoh', 'johor bahru', 'jb', 'iskandar puteri', 'seremban', 'melaka', 'malacca', 'nilai', 'kuantan', 'kota kinabalu', 'kuching'].join('|') + ')$', 'i');
  // 开头是这些字、后面还有字：一定是地名（Taman Desa Jaya、Bandar Baru Bangi…）。Sri、Alam、Mutiara 也可能是人名：不算
  var PLACE = /^(taman|tmn|bandar|bdr|desa|kota|kampung|kg|bukit|bkt|sungai|sg|tanjung|tg|teluk|pulau|lembah|puncak)\s+[a-z]/i;

  function styleIn(name) {
    var list = MB.CASE_STYLES || [];
    for (var i = 0; i < list.length; i++) {
      var m = new RegExp(list[i].match, 'i').exec(name);
      if (m) return { key: list[i].key, at: m.index };
    }
    return null;
  }
  function areaBefore(name, at) {
    // 风格字所在的那一段（「轻法式」整段）之前 = 区域，之后 = 客户
    var start = at > 0 ? name.lastIndexOf(' ', at - 1) + 1 : 0;
    if (!(start > 0)) return '';
    var a = name.slice(0, start).trim();
    if (!a || a.length > 40) return '';
    if (!/^[A-Za-z][A-Za-z .'\-]*$/.test(a)) return '';
    if (a.split(/\s+/).length > 4) return '';
    if (HONOR.test(a) || CLIENTISH.test(a)) return '';
    if (AREAS.test(a)) return a;
    if (STREET.test(a)) return '';
    // 房型、家庭特点的字不是地名
    var bad = (MB.CASE_PTYPES || []).concat(MB.CASE_TRAITS || []).some(function (x) { return new RegExp('^(' + x.match + ')$', 'i').test(a); });
    if (bad) return '';
    // 看不出是地名（可能是客户的英文名字、楼盘名）：留空。after 不再拿来猜 —— 后面有称呼不代表前面是地名
    return PLACE.test(a) ? a : '';
  }
  /** 文件夹名 → {style, area}（猜不到就是空字串） */
  function guessProject(name) {
    var n = cleanText(String(name || ''), 120).replace(/[_·,，、|]+/g, ' ').replace(/\s+-+\s+|\s+-+$|^-+\s+/g, ' ').replace(/\s+/g, ' ').trim();
    var st = styleIn(n);
    return { style: st ? st.key : '', area: st ? areaBefore(n, st.at) : '' };
  }
  /** 照片的相对路径（项目里面）→ {room, cabinets}：看子文件夹名（档名本身不算） */
  function guessPhoto(f) {
    var parts = String(f || '').split('/').filter(Boolean);
    parts.pop();
    var room = '', cabs = {};
    for (var i = parts.length - 1; i >= 0 && !room; i--) {
      for (var j = 0; j < ROOM_RE.length; j++) if (ROOM_RE[j][1].test(parts[i])) { room = ROOM_RE[j][0]; break; }
    }
    parts.forEach(function (seg) {
      CAB_RE.forEach(function (c) { if (c[1].test(seg)) cabs[c[0]] = 1; });
    });
    var cabinets = (MB.CASE_CABINETS || []).filter(function (c) { return cabs[c.key]; }).map(function (c) { return c.key; });
    // 没写空间、柜子只会出现在一个空间（橱柜 → 厨房、鞋柜 → 玄关）：空间就是那里
    if (!room) {
      var only = {};
      cabinets.forEach(function (k) {
        var c = (MB.CASE_CABINETS || []).filter(function (x) { return x.key === k; })[0];
        if (c && c.rooms.length === 1) only[c.rooms[0]] = 1;
      });
      var ks = Object.keys(only);
      if (ks.length === 1 && isRoom(ks[0])) room = ks[0];
    }
    return { room: room, cabinets: cabinets };
  }
  /** 整份清单（或 opts.pids 那几个项目、opts.photos 那几张）→ 一份 source:'auto' 的 patch：只填空的。
      已确认 / 不确定（人看过的）照片不动；项目只给还空着的栏位 */
  function autoTags(index, opts) {
    opts = opts || {};
    var pids = opts.pids ? opts.pids.filter(function (p) { return hasProject(index, p); }) : Object.keys(index.projects || {});
    var only = opts.photos ? {} : null;
    if (only) opts.photos.forEach(function (h) { only[h] = 1; });
    var inP = {};
    pids.forEach(function (p) { inP[p] = 1; });
    var out = { source: 'auto', photos: {}, projects: {} };
    pids.forEach(function (pid) {
      var pr = index.projects[pid], g = guessProject(pr.name), x = {};
      if (g.style && !pr.style) x.style = g.style;
      if (g.area && !pr.area) x.area = g.area;
      if (Object.keys(x).length) out.projects[pid] = x;
    });
    Object.keys(index.photos || {}).forEach(function (h) {
      var ph = index.photos[h];
      if (!inP[ph.p] || (only && !only[h])) return;
      if (ph.status === 'confirmed' || ph.status === 'unsure') return;
      var g = guessPhoto(ph.f), x = {};
      if (g.room && !ph.room) x.room = g.room;
      if (g.cabinets.length && !(ph.cabinets && ph.cabinets.length)) x.cabinets = g.cabinets;
      if (Object.keys(x).length) out.photos[h] = x;
    });
    return out;
  }
  /** 一份很大的 patch 切成每次最多 400 笔（伺服器的上限） */
  function chunkPatch(p, max) {
    max = max || MAX_PATCH_ENTRIES;
    var out = [], cur = null, n = 0;
    function next() { cur = { source: p.source, photos: {}, projects: {} }; n = 0; out.push(cur); }
    ['projects', 'photos'].forEach(function (k) {
      Object.keys(p[k] || {}).forEach(function (id) {
        if (!cur || n >= max) next();
        cur[k][id] = p[k][id];
        n++;
      });
    });
    return out;
  }

  /* ============================================================
     标签档：{kind:'visi-caselib-tags', v:1, at, by, projects:{pid:{name, area, ptype, traits, style, hidden}},
              photos:{h16:{p, room, cabinets, style, hero, desc:{zh,en}, status, hidden}}}
     没有照片、没有档案路径（f）、没有网址（k）。项目名（文件夹名）留着：同事汇入同一个文件夹才对得上
     ============================================================ */
  function exportTags(index, ts, by) {
    var out = { kind: TAGS_KIND, v: 1, at: ts || 0, by: String(by || '').slice(0, 30), projects: {}, photos: {} };
    Object.keys(index.projects || {}).sort().forEach(function (pid) {
      var x = index.projects[pid];
      out.projects[pid] = { name: x.name || '', area: x.area || '', ptype: x.ptype || '', traits: (x.traits || []).slice(), style: x.style || '', hidden: !!x.hidden };
    });
    Object.keys(index.photos || {}).sort().forEach(function (h) {
      var x = index.photos[h], d = x.desc || {};
      out.photos[h] = { p: x.p, room: x.room || '', cabinets: (x.cabinets || []).slice(), style: x.style || '', hero: !!x.hero,
        desc: { zh: d.zh || '', en: d.en || '' }, status: x.status || 'new', hidden: !!x.hidden };
    });
    return out;
  }
  function pickOne(ok, v) { return typeof v === 'string' && ok(v) ? v : ''; }
  function pickMany(ok, arr) {
    var out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (v) { if (typeof v === 'string' && ok(v) && out.indexOf(v) < 0) out.push(v); });
    return out.slice(0, 20);
  }
  /* 标签档里的一个项目 / 一张照片 → 只留认得的栏位、词表里有的值（不认得就是空的）；不是物件回 null。
     汇入时用，记着等照片的（pending）套用前也再用一次：词表之后改过（例：拿掉一种风格），旧的值就当成空的，不会挡住登记 */
  function cleanProjectTag(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
    return { name: cleanText(x.name, 120), area: cleanText(x.area, 60), ptype: pickOne(isPtype, x.ptype),
      traits: pickMany(isTrait, x.traits), style: pickOne(isStyle, x.style), hidden: x.hidden === true };
  }
  function cleanPhotoTag(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
    var d = x.desc && typeof x.desc === 'object' ? x.desc : {};
    return { p: PID_RE.test(x.p || '') ? x.p : '', room: pickOne(isRoom, x.room), cabinets: pickMany(isCabinet, x.cabinets),
      style: pickOne(isStyle, x.style), hero: x.hero === true, desc: { zh: cleanText(d.zh, 200), en: cleanText(d.en, 200) },
      status: pickOne(isStatus, x.status) || 'new', hidden: x.hidden === true };
  }
  /** 读进来的标签档：不是标签档就丢 400 {error:'kind'}；不认得的值一律拿掉（不会写坏清单） */
  function readTags(raw) {
    if (!raw || typeof raw !== 'object' || raw.kind !== TAGS_KIND || raw.v !== 1) throw bad('kind');
    var P = raw.projects && typeof raw.projects === 'object' ? raw.projects : {};
    var F = raw.photos && typeof raw.photos === 'object' ? raw.photos : {};
    var out = { kind: TAGS_KIND, v: 1, at: +raw.at || 0, by: cleanText(raw.by, 30), projects: {}, photos: {} };
    Object.keys(P).forEach(function (pid) {
      var x = PID_RE.test(pid) ? cleanProjectTag(P[pid]) : null;
      if (x) out.projects[pid] = x;
    });
    Object.keys(F).forEach(function (h) {
      var x = HEX16.test(h) ? cleanPhotoTag(F[h]) : null;
      if (x) out.photos[h] = x;
    });
    return out;
  }
  /* 一张照片：这台电脑的 L、标签档的 F → 要改的栏位（human patch）或 null
     - L 已确认（这台电脑有人看过）：只补 L 空着的（空间、柜类、风格、说明），状态留「已确认」
     - L 还没确认、F 是有人看过的（已确认 / 不确定）：整张照 F —— 空的也照抄（那边可能特地清掉了自动标错的柜子），
       状态照 F。所以先汇入文件夹（自动标签）再汇入标签档，跟先汇入标签档再汇入文件夹，结果一样
     - L 还没确认、F 也没人看过（自动 / 新的）：只拿 F 有的，标「自动」（空的不拿：不要把这台电脑自动标的洗掉） */
  function photoMerge(L, F) {
    var x = {}, d = {};
    var conf = L.status === 'confirmed';
    var lc = L.cabinets || [], ld = L.desc || {};
    var exact = !conf && (F.status === 'confirmed' || F.status === 'unsure');
    if (exact) {
      if (F.room !== (L.room || '')) x.room = F.room;
      if (!same(F.cabinets, lc)) x.cabinets = F.cabinets.slice();
      if (F.style !== (L.style || '')) x.style = F.style;
      if (F.hero !== !!L.hero) x.hero = F.hero;
      ['zh', 'en'].forEach(function (l) { if (F.desc[l] !== (ld[l] || '')) d[l] = F.desc[l]; });
    } else {
      if (F.room && (conf ? !L.room : F.room !== L.room)) x.room = F.room;
      if (F.cabinets.length && (conf ? !lc.length : !same(F.cabinets, lc))) x.cabinets = F.cabinets.slice();
      if (F.style && (conf ? !L.style : F.style !== L.style)) x.style = F.style;
      if (!conf && F.hero && !L.hero) x.hero = true;
      ['zh', 'en'].forEach(function (l) { if (F.desc[l] && (conf ? !ld[l] : F.desc[l] !== ld[l])) d[l] = F.desc[l]; });
    }
    if (Object.keys(d).length) x.desc = d;
    var fields = Object.keys(x).length;
    var want = conf ? 'confirmed' : exact ? F.status : (fields ? (L.status === 'new' ? 'auto' : L.status) : L.status);
    if (fields || want !== L.status) x.status = want;
    return Object.keys(x).length ? x : null;
  }
  /* 项目：这台电脑的栏位是空的、上次是自动填的（by = AUTO_BY）、或就是文件夹名自动猜的那个值（风格、区域）才套用。
     「就是自动猜的」：同一个文件夹名两边猜的一定一样，标签档的不一样 = 那边有人改过 */
  function projectMerge(L, F) {
    var x = {}, autoSet = L.by === AUTO_BY, g = guessProject(L.name);
    function free(f) { return isEmpty(L[f]) || autoSet || ((f === 'style' || f === 'area') && g[f] && L[f] === g[f]); }
    if (F.area && F.area !== L.area && free('area')) x.area = F.area;
    if (F.ptype && F.ptype !== L.ptype && free('ptype')) x.ptype = F.ptype;
    if (F.traits.length && !same(F.traits, L.traits || []) && free('traits')) x.traits = F.traits.slice();
    if (F.style && F.style !== L.style && free('style')) x.style = F.style;
    return Object.keys(x).length ? x : null;
  }
  /** 标签档 → 这台电脑要做的事：
      {patch:{source:'human', photos, projects}, hide:{photos:[], projects:[]},
       pending:{photos:{h:F}, projects:{pid:F}}（这台电脑还没有的：等汇入那个文件夹再套用）,
       n:{photos（要改的照片）, projects, pending（还没有的照片）, pendingProjects, same（这台电脑有、标签已经一样的照片）}} */
  function mergeTags(index, tags) {
    var out = { patch: { source: 'human', photos: {}, projects: {} }, hide: { photos: [], projects: [] },
      pending: { photos: {}, projects: {} }, n: { photos: 0, projects: 0, pending: 0, pendingProjects: 0, same: 0 } };
    Object.keys(tags.projects || {}).forEach(function (pid) {
      var F = tags.projects[pid];
      if (!hasProject(index, pid)) { out.pending.projects[pid] = F; out.n.pendingProjects++; return; }
      var L = index.projects[pid], x = projectMerge(L, F), hid = F.hidden && !L.hidden;
      if (x) out.patch.projects[pid] = x;
      if (hid) out.hide.projects.push(pid);
      if (x || hid) out.n.projects++;
    });
    Object.keys(tags.photos || {}).forEach(function (h) {
      var F = tags.photos[h];
      if (!hasPhoto(index, h)) { out.pending.photos[h] = F; out.n.pending++; return; }
      var L = index.photos[h], x = photoMerge(L, F), hid = F.hidden && !L.hidden;
      if (x) out.patch.photos[h] = x;
      if (hid) out.hide.photos.push(h);
      if (x || hid) out.n.photos++;
      else out.n.same++;
    });
    return out;
  }

  /** mergeTags 的结果写进清单：一次人工 patch（每批最多 400 笔）+ 隐藏，各算一次写入（run）。回改了几笔。
      opts = {base, now}；丢错 = 那一批不算（patch 先检查完才改，一批不会改一半；前面的批照样算） */
  function applyMerge(index, m, by, opts) {
    opts = opts || {};
    var changed = 0;
    chunkPatch(m.patch).forEach(function (c) {
      changed += run(index, function (idx, ts) {
        var n = patch(idx, c, by, ts).changed;
        return { changed: n, n: n, noop: !n };
      }, { op: 'patch', by: by, base: opts.base, now: opts.now }).out.changed | 0;
    });
    if (m.hide.photos.length || m.hide.projects.length) {
      changed += run(index, function (idx, ts) {
        var n = 0, M = MAX_PATCH_ENTRIES;
        for (var i = 0; i < m.hide.projects.length; i += M) n += setHidden(idx, { projects: m.hide.projects.slice(i, i + M) }, true, by, ts).changed;
        for (var j = 0; j < m.hide.photos.length; j += M) n += setHidden(idx, { photos: m.hide.photos.slice(j, j + M) }, true, by, ts).changed;
        return { changed: n, n: n, noop: !n };
      }, { op: 'hide', by: by, base: opts.base, now: opts.now }).out.changed | 0;
    }
    return changed;
  }

  /** 照片刚登记进来（addPhotos 之后，同一个交易里）：
      1. 汇入过的标签档里、等着这几张 / 这个项目的（pending：'h:'+h16 / 'p:'+pid → {tag}）先套用（人工，by）——
         套用前照现在的词表再清一次；还是套不上（坏掉的）就丢掉那几笔，照片照样登记（不会每次都卡住）
      2. 再从文件夹名自动标还空着的：by = AUTO_BY（「自动」）—— 之后汇入同事的标签档可以盖掉，人改过的就不会
      opts = {pids, added, pending, by, base, now}。回 {used: 用掉的 pending key（套上或丢掉的，都要删掉）, merged, auto, dropped} */
  function afterAdd(index, opts) {
    opts = opts || {};
    var pend = opts.pending || {}, used = [], dropped = 0, merged = 0, autoN = 0;
    var tags = { projects: {}, photos: {} };
    Object.keys(pend).forEach(function (key) {
      var id = key.slice(2), kind = key.slice(0, 2), rec = pend[key], x;
      if (kind === 'h:' && hasPhoto(index, id)) { used.push(key); x = cleanPhotoTag(rec && rec.tag); if (x) tags.photos[id] = x; else dropped++; }
      else if (kind === 'p:' && hasProject(index, id)) { used.push(key); x = cleanProjectTag(rec && rec.tag); if (x) tags.projects[id] = x; else dropped++; }
    });
    if (used.length) {
      try { merged = applyMerge(index, mergeTags(index, tags), opts.by, opts); } catch (e) {
        if (!e || !e.http) throw e;
        dropped += used.length;
      }
    }
    var auto = autoTags(index, { pids: opts.pids || [], photos: opts.added || [] });
    chunkPatch(auto).forEach(function (c) {
      try {
        autoN += run(index, function (idx, ts) { var n = patch(idx, c, AUTO_BY, ts).changed; return { changed: n, n: n, noop: !n }; },
          { op: 'patch', by: AUTO_BY, base: opts.base, now: opts.now }).out.changed | 0;
      } catch (e) { if (!e || !e.http) throw e; }
    });
    return { used: used, merged: merged, auto: autoN, dropped: dropped };
  }

  MB.clCore = {
    MAX_PHOTOS_PER_CALL: MAX_PHOTOS_PER_CALL, MAX_PATCH_ENTRIES: MAX_PATCH_ENTRIES, LOG_KEEP: LOG_KEEP,
    SHOT_DISTANCE: SHOT_DISTANCE, AUTO_BY: AUTO_BY, PACK_EST: PACK_EST, MAX_PURGE: MAX_PURGE, PURGED_KEEP: PURGED_KEEP,
    TAGS_KIND: TAGS_KIND,
    HttpError: HttpError,
    sha256Hex: sha256Hex, utf8Len: utf8Len,
    hasPhoto: hasPhoto, hasProject: hasProject, emptyIndex: emptyIndex, normalizeName: normalizeName, pidOf: pidOf,
    cleanText: cleanText, cleanName: cleanName, hamming: hamming, groupShots: groupShots,
    validateAddPhotos: validateAddPhotos, addPhotos: addPhotos, patch: patch, setHidden: setHidden, visiView: visiView,
    utcDay: utcDay, utcMonth: utcMonth, bumpUsage: bumpUsage, monthWrites: monthWrites, storedBytes: storedBytes, packBytes: packBytes,
    validatePurge: validatePurge, planPurge: planPurge, applyPurge: applyPurge, run: run,
    guessProject: guessProject, guessPhoto: guessPhoto, autoTags: autoTags, chunkPatch: chunkPatch,
    exportTags: exportTags, readTags: readTags, cleanPhotoTag: cleanPhotoTag, cleanProjectTag: cleanProjectTag,
    mergeTags: mergeTags, applyMerge: applyMerge, afterAdd: afterAdd
  };
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this);
