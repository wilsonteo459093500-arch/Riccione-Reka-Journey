/* ============================================================
   案例库 · 「存在这台电脑」模式的 service worker（caselib-sw.js）
   ------------------------------------------------------------
   本机模式打开时，这个档在浏览器里回答跟伺服器一模一样的 API，资料放这台电脑的 IndexedDB：
     /api/session   GET → {name} | 401 {error:'login'} · POST {name} → {name}（不用密码）· DELETE → 登出
     /api/photo?h=  POST image/jpeg（FF D8 FF、≤ 3.5 MB）→ 存 'c/<h>-<随机>.jpg' → {k, url, sig:'local'}
     /api/catalog   GET ?view=visi|full（ETag "local-rev-N"：跟伺服器的 "rev-N" 分得开，VISI 换模式不会拿错清单；
                    If-None-Match → 304；full 多一个 quota {plan:'local', …}）
                    POST {op: addPhotos | patch | hide | unhide | purge | importTags | clearPending}
     /local-cases/<path>  照片、缩图包（IndexedDB 'files'）：Content-Type、Content-Length、ETag、
                    Cache-Control: no-cache、Access-Control-Allow-Origin: *（PPTX 用 mode:'cors' 拿）
   规则（invite/api/_lib/catalog.js 那一套）都在 assets/js/caselib/local-core.js（MB.clCore），这里只管存取。
   - 只碰这几个路径。/api/* 只在本机模式才回答，不然原封不动交给网路（云端模式）。其它请求一律不碰。
     哪个模式看「这一页」说的（页面送 X-Caselib-Mode: local | cloud，ui.js 的 CL.api、cloud.js 的 call）：
     另一个分页换成本机模式、service worker 接手了这一页，云端的那一页照样问伺服器。
     没带这个标头（测试、旧页面）才看 IndexedDB 'caselib-local' 的 meta.mode
   - 只给 caselib.html、visi.html 用：页面用 scope '/caselib'、'/visi' 注册（assets/js/caselib/local-sw.js），
     所以给客户看的邀请页（index.html 等）永远不会被它管。
   - 每次写入 = 一个 IndexedDB readwrite 交易（读清单 → 改 → 写回同一个交易）：
     两个分页、两个 service worker 同时写也不会互相盖掉（IndexedDB 会排队）。
   - 一装好就接手（skipWaiting + clients.claim）。
   IndexedDB 'caselib-local'：
     meta     {k:'mode', v} · {k:'user', name} · {k:'index', index}
     files    pathname → {blob, type, size, ts}（'c/…jpg' 照片、't/…json' 缩图包）
     pending  'h:'+h16 / 'p:'+pid → {tag, by, ts}：汇入的标签档里、这台电脑还没有的照片 / 项目
              （照片登记进来时 MB.clCore.afterAdd 套用：先照现在的词表清一次，套不上就丢掉，不会挡住登记）
   ============================================================ */
'use strict';

// case-vocab.js 用 window.MB：service worker 没有 window
self.window = self;
importScripts('assets/js/visi/case-vocab.js', 'assets/js/caselib/local-core.js');
var C = self.MB.clCore;

var DB_NAME = 'caselib-local';
var DB_V = 1;
var FILES = '/local-cases/';
var MAX_PHOTO = 3.5 * 1024 * 1024;
var MAX_BODY = 4 * 1024 * 1024;
var MAX_TAGS_BODY = 24 * 1024 * 1024;
var MAX_THUMB = 200 * 1024;
var THUMB_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;
var FILE_RE = /^(c\/[A-Za-z0-9._-]+\.jpg|t\/[A-Za-z0-9._-]+\.json)$/;
var API = { '/api/session': 1, '/api/photo': 1, '/api/catalog': 1 };
var MODE = '';           // '' = 还不知道（刚启动）· 'local' · 'cloud'
var chan = typeof BroadcastChannel === 'function' ? new BroadcastChannel('caselib-local') : null;

function base() { return self.location.origin + FILES; }

self.addEventListener('install', function (e) { e.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

/* ---------- IndexedDB ---------- */
var dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise(function (ok, fail) {
    var req = indexedDB.open(DB_NAME, DB_V);
    req.onupgradeneeded = function () {
      var d = req.result;
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
      if (!d.objectStoreNames.contains('files')) d.createObjectStore('files');
      if (!d.objectStoreNames.contains('pending')) d.createObjectStore('pending');
    };
    req.onsuccess = function () {
      var d = req.result;
      d.onversionchange = function () { d.close(); dbp = null; };
      d.onclose = function () { dbp = null; };
      ok(d);
    };
    req.onerror = function () { dbp = null; fail(req.error); };
    req.onblocked = function () { dbp = null; fail(new Error('IndexedDB blocked')); };
  });
  return dbp;
}
/* 一个交易：先读 gets（[[store, key], …]），全部读到之后 fn(values, t) —— 同步做完、要写的直接 put。
   fn 丢错：整个交易取消（什么都不写），Promise reject 那个错 */
function txRun(stores, mode, gets, fn) {
  return db().then(function (d) {
    return new Promise(function (ok, fail) {
      var t, err = null, result, vals = new Array(gets.length), left = gets.length;
      try { t = d.transaction(stores, mode); } catch (e) { dbp = null; fail(e); return; }
      function go() {
        try { result = fn ? fn(vals, t) : vals; } catch (e) { err = e; try { t.abort(); } catch (x) { /* 已经结束 */ } }
      }
      t.oncomplete = function () { ok(result); };
      t.onabort = function () { fail(err || t.error || new Error('IndexedDB aborted')); };
      if (!left) { go(); return; }
      gets.forEach(function (g, i) {
        var r = t.objectStore(g[0]).get(g[1]);
        r.onsuccess = function () { vals[i] = r.result; if (--left === 0) go(); };
      });
    });
  });
}
function getOne(store, key) { return txRun([store], 'readonly', [[store, key]], function (v) { return v[0]; }); }
// 写入排队：同一个 service worker 一次做一件（交易本身也会排队，这里再保险一次）
var chain = Promise.resolve();
function queue(job) {
  var p = chain.then(job, job);
  chain = p.catch(function () { /* 下一件照做 */ });
  return p;
}

/* ---------- 模式 ---------- */
function readMode() {
  return getOne('meta', 'mode').then(function (r) {
    MODE = r && r.v === 'local' ? 'local' : 'cloud';
    return MODE;
  }, function () { return 'cloud'; });
}
function setMode(mode) {
  var m = mode === 'local' ? 'local' : 'cloud';
  return txRun(['meta'], 'readwrite', [], function (v, t) { t.objectStore('meta').put({ k: 'mode', v: m, ts: Date.now() }); }).then(function () {
    MODE = m;
    if (chan) chan.postMessage({ type: 'mode', mode: m });
    return m;
  });
}
if (chan) chan.onmessage = function (e) { if (e.data && e.data.type === 'mode') MODE = e.data.mode === 'local' ? 'local' : 'cloud'; };
readMode();

self.addEventListener('message', function (e) {
  var d = e.data || {};
  function reply(msg) {
    if (e.ports && e.ports[0]) e.ports[0].postMessage(msg);
    else if (e.source && e.source.postMessage) e.source.postMessage(msg);
  }
  if (d.type === 'caselib-mode') {
    e.waitUntil(setMode(d.mode).then(function (m) { reply({ ok: true, mode: m }); }, function (err) { reply({ ok: false, error: String(err && err.message || err) }); }));
  } else if (d.type === 'caselib-ping') {
    e.waitUntil(readMode().then(function (m) { reply({ ok: true, mode: m }); }));
  }
});

/* ---------- 请求 ---------- */
self.addEventListener('fetch', function (e) {
  var req = e.request, url;
  try { url = new URL(req.url); } catch (x) { return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf(FILES) === 0) { e.respondWith(serveFile(req, url).catch(fail500)); return; }
  if (!API[url.pathname]) return;
  // 页面说了自己是哪个模式：照它的（云端 = 完全不碰，跟没有 service worker 一样）
  var want = String(req.headers.get('x-caselib-mode') || '').toLowerCase();
  if (want === 'cloud') return;
  if (want === 'local') { e.respondWith(Promise.resolve().then(function () { return api(req, url); }).catch(errResp)); return; }
  // 没说（测试、旧页面）：看 IndexedDB 记的模式
  if (MODE === 'cloud') return;
  e.respondWith(readMode().then(function (m) {
    if (m !== 'local') return fetch(req);
    // api() 可能当场丢错（checkWrite…）：一律变成 JSON 的错误回应，不要变成网路错误
    return Promise.resolve().then(function () { return api(req, url); }).catch(errResp);
  }));
});

function json(status, body, extra) {
  var h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  Object.keys(extra || {}).forEach(function (k) { h[k] = extra[k]; });
  return new Response(status === 304 ? null : JSON.stringify(body == null ? {} : body), { status: status, headers: h });
}
function errResp(e) {
  if (e && e.http) return json(e.status, e.body);
  // 这台电脑的硬碟（浏览器给的空间）满了：跟伺服器的「额度到了」一样，上传页会整批停下来
  if (e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message || '')))) {
    return json(507, { error: 'quota', reason: 'bytes', writesLeft: 0, bytesLeft: 0, local: true });
  }
  console.error('[caselib-sw]', e);
  return json(500, { error: 'server', message: String((e && e.message) || e).slice(0, 300) });
}
function fail500(e) { return errResp(e); }
function H(status, body) { return C.HttpError(status, body); }

function checkWrite(req) {
  if (req.headers.get('x-visi') !== '1') throw H(403, { error: 'cross_site' });
  var origin = req.headers.get('origin');
  if (origin && origin !== self.location.origin) throw H(403, { error: 'cross_site' });
}
function readBody(req, limit) {
  return req.arrayBuffer().then(function (buf) {
    if (buf.byteLength > limit) throw H(413, { error: 'too_large' });
    return buf;
  });
}
function readJson(req, limit) {
  return readBody(req, limit).then(function (buf) {
    if (!buf.byteLength) throw H(400, { error: 'json' });
    var v;
    try { v = JSON.parse(new TextDecoder('utf-8').decode(buf)); } catch (e) { throw H(400, { error: 'json' }); }
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw H(400, { error: 'json' });
    return v;
  });
}
function user() {
  return getOne('meta', 'user').then(function (r) { return r && r.name ? C.cleanName(r.name) : ''; });
}
function requireUser() {
  return user().then(function (n) { if (!n) throw H(401, { error: 'login' }); return n; });
}
function rand(n) {
  var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', b = new Uint8Array(n), s = '';
  crypto.getRandomValues(b);
  for (var i = 0; i < n; i++) s += abc[b[i] % abc.length];
  return s;
}
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

function api(req, url) {
  var p = url.pathname;
  if (p === '/api/session') return session(req);
  if (p === '/api/photo') return photo(req, url);
  return catalog(req, url);
}

/* ---------- /api/session ---------- */
function session(req) {
  if (req.method === 'GET') return requireUser().then(function (n) { return json(200, { name: n }); });
  if (req.method === 'POST') {
    checkWrite(req);
    return readJson(req, 16 * 1024).then(function (body) {
      // 本机模式不用团队密码：资料本来就只在这台电脑。名字照伺服器的规则（1–30 个字）
      var name = C.cleanName(body.name);
      if (!name) throw H(400, { error: 'name' });
      return queue(function () {
        return txRun(['meta'], 'readwrite', [], function (v, t) { t.objectStore('meta').put({ k: 'user', name: name, ts: Date.now() }); });
      }).then(function () { return json(200, { name: name }); });
    });
  }
  if (req.method === 'DELETE') {
    checkWrite(req);
    return queue(function () {
      return txRun(['meta'], 'readwrite', [], function (v, t) { t.objectStore('meta').delete('user'); });
    }).then(function () { return json(200, {}); });
  }
  return Promise.resolve(json(405, { error: 'method' }, { Allow: 'GET, POST, DELETE' }));
}

/* ---------- /api/photo ---------- */
function photo(req, url) {
  if (req.method !== 'POST') return Promise.resolve(json(405, { error: 'method' }, { Allow: 'POST' }));
  checkWrite(req);
  return requireUser().then(function () {
    var h = url.searchParams.get('h') || '';
    if (!/^[0-9a-f]{16}$/.test(h)) throw H(400, { error: 'h' });
    var type = String(req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (type !== 'image/jpeg') throw H(415, { error: 'type' });
    return readBody(req, MAX_PHOTO).then(function (buf) {
      var b = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
      if (buf.byteLength < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) throw H(415, { error: 'not_jpeg' });
      var k = 'c/' + h + '-' + rand(10) + '.jpg';
      var rec = { blob: new Blob([buf], { type: 'image/jpeg' }), type: 'image/jpeg', size: buf.byteLength, ts: Date.now() };
      return queue(function () {
        return txRun(['files'], 'readwrite', [], function (v, t) { t.objectStore('files').put(rec, k); });
      }).then(function () { return json(200, { k: k, url: base() + k, sig: 'local' }); });
    });
  });
}

/* ---------- /api/catalog ---------- */
function etagMatches(req, etag) {
  var inm = String(req.headers.get('if-none-match') || '');
  if (!inm) return false;
  return inm.split(',').some(function (t) { t = t.trim().replace(/^W\//, ''); return t === etag || t === '*'; });
}
// 这台电脑的空间（浏览器给这个网站的）：navigator.storage.estimate()
function estimate() {
  try {
    if (self.navigator && navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate().then(function (e) { return e || {}; }, function () { return {}; });
    }
  } catch (e) { /* 不支援 */ }
  return Promise.resolve({});
}
function localQuota(index, now) {
  return estimate().then(function (est) {
    var usage = typeof est.usage === 'number' ? est.usage : null, cap = typeof est.quota === 'number' && est.quota > 0 ? est.quota : null;
    var stored = C.storedBytes(index);
    return {
      plan: 'local', month: C.utcMonth(now), writes: C.monthWrites(index, now), bytes: usage != null ? usage : stored, stored: stored,
      uploadCap: null, writeCap: null, bytesCap: cap, writesLeft: null, bytesLeft: cap != null && usage != null ? Math.max(0, cap - usage) : null
    };
  });
}
// 只数照片（'h:'…）：项目（'p:'…）不算在「还有 N 张在等照片」里
function pendingPhotos() { return IDBKeyRange.bound('h:', 'h:\uffff'); }
function readIndex() {
  return txRun(['meta', 'pending'], 'readonly', [['meta', 'index']], function (vals, t) {
    var out = { index: vals[0] && vals[0].index ? vals[0].index : C.emptyIndex(), pending: 0 };
    var r = t.objectStore('pending').count(pendingPhotos());
    r.onsuccess = function () { out.pending = r.result | 0; };
    return out;
  });
}

function catalog(req, url) {
  if (req.method === 'GET') return getCatalog(req, url);
  if (req.method === 'POST') return postCatalog(req);
  return Promise.resolve(json(405, { error: 'method' }, { Allow: 'GET, POST' }));
}

function getCatalog(req, url) {
  return requireUser().then(function () {
    var view = url.searchParams.get('view') || 'visi';
    if (view !== 'visi' && view !== 'full') throw H(400, { error: 'view' });
    return readIndex().then(function (got) {
      var index = got.index, now = Date.now();
      index.base = base();
      // "local-rev-N"：伺服器是 "rev-N" —— VISI 存着另一边（云端）的清单时，rev 刚好一样也不会回 304
      var etag = '"local-rev-' + (index.rev | 0) + (view === 'full' ? '-' + C.utcMonth(now) : '') + '"';
      if (etagMatches(req, etag)) return json(304, null, { ETag: etag });
      if (view !== 'full') return json(200, C.visiView(index), { ETag: etag });
      return localQuota(index, now).then(function (q) {
        var full = Object.assign({}, index, { quota: q, pendingTags: got.pending });
        return json(200, full, { ETag: etag });
      });
    });
  });
}

// 缩图包：只收这次照片的，格式不对整批退回（跟伺服器一样）
function pickThumbs(thumbs, photos) {
  if (thumbs == null) return {};
  if (typeof thumbs !== 'object' || Array.isArray(thumbs)) throw H(400, { error: 'thumb' });
  var want = {};
  photos.forEach(function (p) { want[p.h] = 1; });
  var out = {}, n = 0;
  Object.keys(thumbs).forEach(function (h) {
    if (!want[h]) return;
    var v = thumbs[h];
    if (typeof v !== 'string' || v.length > MAX_THUMB || !THUMB_RE.test(v)) throw H(400, { error: 'thumb', h: h });
    out[h] = v;
    n++;
  });
  return n ? out : {};
}
// 包名由这批照片决定（重送同一批 = 同一个档）
function packName(pid, hs) { return 't/' + pid + '-' + C.sha256Hex('pack:' + pid + ':' + hs.join(',')).slice(0, 24) + '.json'; }

function postCatalog(req) {
  checkWrite(req);
  return requireUser().then(function (by) {
    var big = /[?&]op=importTags\b/.test(req.url);
    return readJson(req, big ? MAX_TAGS_BODY : MAX_BODY).then(function (body) {
      var op = body.op;
      if (op === 'addPhotos') return addPhotos(body, by);
      // 自动标签（审核页「按文件夹名字自动标」）记成 AUTO_BY（「自动」）：之后汇入同事的标签档可以盖掉，跟登记时自动标的一样
      if (op === 'patch') {
        var pby = body.source === 'auto' ? C.AUTO_BY : by;
        return simple(body, pby, 'patch', function (idx, ts) { return C.patch(idx, body, pby, ts); });
      }
      if (op === 'hide' || op === 'unhide') return simple(body, by, op, function (idx, ts) { return C.setHidden(idx, body, op === 'hide', by, ts); });
      if (op === 'purge') return purge(body, by);
      if (op === 'importTags') return importTags(body, by);
      if (op === 'clearPending') return clearPending();
      throw H(400, { error: 'op' });
    });
  });
}

function save(t, index) { t.objectStore('meta').put({ k: 'index', index: index }); }

function simple(body, by, op, fn) {
  return queue(function () {
    return txRun(['meta'], 'readwrite', [['meta', 'index']], function (vals, t) {
      var index = vals[0] && vals[0].index ? vals[0].index : C.emptyIndex();
      var r = C.run(index, fn, { op: op, by: by, base: base() });
      if (r.write) save(t, index);
      return r.out;
    });
  }).then(function (out) { return json(200, { rev: out.rev, changed: out.changed | 0 }); });
}

function addPhotos(body, by) {
  var v = C.validateAddPhotos(body);
  var thumbs = pickThumbs(body.thumbs, v.photos);
  var pid = C.pidOf(v.name);
  return queue(function () {
    var gets = [['meta', 'index'], ['pending', 'p:' + pid]];
    v.photos.forEach(function (p) { gets.push(['pending', 'h:' + p.h]); gets.push(['files', p.k]); });
    return txRun(['meta', 'files', 'pending'], 'readwrite', gets, function (vals, t) {
      var index = vals[0] && vals[0].index ? vals[0].index : C.emptyIndex();
      var pend = {};
      if (vals[1]) pend['p:' + pid] = vals[1];
      v.photos.forEach(function (p, i) {
        var pv = vals[2 + 2 * i], fv = vals[3 + 2 * i];
        if (pv) pend['h:' + p.h] = pv;
        // 跟伺服器的签章一样：只登记这台电脑真的存好的照片
        var cur = own(index.photos, p.h) ? index.photos[p.h] : null;
        if (!fv && !(cur && cur.k === p.k)) throw H(400, { error: 'photo', field: 'sig', h: p.h });
      });
      var fresh = {};
      v.photos.forEach(function (p) { if (!own(index.photos, p.h) && thumbs[p.h]) fresh[p.h] = thumbs[p.h]; });
      var hs = Object.keys(fresh).sort(), pack = '', packText = '';
      if (hs.length) {
        pack = packName(pid, hs);
        packText = JSON.stringify(fresh);
        t.objectStore('files').put({ blob: new Blob([packText], { type: 'application/json' }), type: 'application/json', size: C.utf8Len(packText), ts: Date.now() }, pack);
      }
      var r = C.run(index, function (idx, ts) {
        return C.addPhotos(idx, { project: { name: v.name }, photos: body.photos, pack: pack, packSz: packText ? C.utf8Len(packText) : 0 }, by, ts);
      }, { op: 'addPhotos', by: by, base: base() });
      // 已经登记过、这次又传了一张（k 不一样）：新传的那张没人用，删掉
      v.photos.forEach(function (p) {
        var cur = index.photos[p.h];
        if (cur && cur.k !== p.k && r.out.added.indexOf(p.h) < 0) t.objectStore('files').delete(p.k);
      });
      if (r.write) {
        // 1. 汇入过的标签档（同事分好类的）先套用；2. 再从文件夹名自动标还空着的（记成「自动」）
        var aa = C.afterAdd(index, { pids: [pid], added: r.out.added, pending: pend, by: by, base: base() });
        aa.used.forEach(function (k) { t.objectStore('pending').delete(k); });
        if (aa.dropped) console.warn('[caselib-sw] 标签档里有 ' + aa.dropped + ' 笔套不上（词表改过？），已略过');
        save(t, index);
      }
      return { pid: r.out.pid, added: r.out.added, dup: r.out.dup, rev: index.rev | 0 };
    });
  }).then(function (out) { return json(200, out); });
}

/* 真的删除：只删已经隐藏的照片，档案一起删（同一个交易：不会删了档、清单却没改） */
function purge(body, by) {
  if (body.confirm !== '删除') throw H(400, { error: 'confirm' });
  return queue(function () {
    return txRun(['meta', 'files'], 'readwrite', [['meta', 'index']], function (vals, t) {
      var index = vals[0] && vals[0].index ? vals[0].index : C.emptyIndex();
      if (!index.photos || typeof index.photos !== 'object') index.photos = {};
      if (!index.projects || typeof index.projects !== 'object') index.projects = {};
      var hs = C.validatePurge(index, body);
      var plan = C.planPurge(index, hs);
      plan.keys.concat(plan.packs).forEach(function (k) { t.objectStore('files').delete(k); });
      var r = C.run(index, function (idx) { return C.applyPurge(idx, plan); }, { op: 'purge', by: by, base: base() });
      if (r.write) save(t, index);
      return { out: r.out, freed: plan.freed, index: index };
    });
  }).then(function (x) {
    return localQuota(x.index, Date.now()).then(function (q) {
      return json(200, { rev: x.out.rev, removed: x.out.removed | 0, projectsRemoved: x.out.projectsRemoved | 0, freed: x.freed, quota: q });
    });
  });
}

/* 汇入标签档（只有本机模式有）：这台电脑有的照片 / 项目马上套用，还没有的先记着，汇入那个文件夹时自动套用 */
function importTags(body, by) {
  var tags = C.readTags(body.tags);
  return queue(function () {
    return txRun(['meta', 'pending'], 'readwrite', [['meta', 'index']], function (vals, t) {
      var index = vals[0] && vals[0].index ? vals[0].index : C.emptyIndex();
      var m = C.mergeTags(index, tags);
      var changed = C.applyMerge(index, m, by, { base: base() });
      if (changed) save(t, index);
      var now = Date.now(), ps = t.objectStore('pending');
      Object.keys(m.pending.photos).forEach(function (h) { ps.put({ tag: m.pending.photos[h], by: by, ts: now }, 'h:' + h); });
      Object.keys(m.pending.projects).forEach(function (pid) { ps.put({ tag: m.pending.projects[pid], by: by, ts: now }, 'p:' + pid); });
      return { rev: index.rev | 0, changed: changed, photos: m.n.photos, projects: m.n.projects, same: m.n.same, pending: m.n.pending, pendingProjects: m.n.pendingProjects };
    });
  }).then(function (out) { return json(200, out); });
}

/* 「不用等了」：汇入的标签档里、这台电脑没有的照片 / 项目（之后也不会汇入那个文件夹）—— 全部不等了 */
function clearPending() {
  return queue(function () {
    return txRun(['pending'], 'readwrite', [], function (v, t) {
      var out = { cleared: 0 }, ps = t.objectStore('pending');
      var r = ps.count(pendingPhotos());
      r.onsuccess = function () { out.cleared = r.result | 0; ps.clear(); };
      return out;
    });
  }).then(function (out) { return json(200, out); });
}

/* ---------- /local-cases/<path>：照片、缩图包 ---------- */
function serveFile(req, url) {
  var cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'ETag, Content-Length' };
  if (req.method === 'OPTIONS') {
    return Promise.resolve(new Response(null, { status: 204, headers: Object.assign({ 'Access-Control-Allow-Methods': 'GET, HEAD', 'Access-Control-Allow-Headers': '*', 'Access-Control-Max-Age': '600' }, cors) }));
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return Promise.resolve(new Response(null, { status: 405, headers: Object.assign({ Allow: 'GET, HEAD' }, cors) }));
  var path = '';
  try { path = decodeURIComponent(url.pathname.slice(FILES.length)); } catch (e) { path = ''; }
  function notFound() {
    return new Response(req.method === 'HEAD' ? null : 'Not found', { status: 404, headers: Object.assign({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' }, cors) });
  }
  if (!FILE_RE.test(path)) return Promise.resolve(notFound());
  return getOne('files', path).then(function (rec) {
    if (!rec || !rec.blob) return notFound();
    var size = rec.size != null ? rec.size : rec.blob.size;
    var etag = '"' + (rec.ts || 0).toString(36) + '-' + size.toString(36) + '"';
    var h = Object.assign({ 'Content-Type': rec.type || 'application/octet-stream', ETag: etag, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }, cors);
    if (etagMatches(req, etag)) return new Response(null, { status: 304, headers: h });
    h['Content-Length'] = String(size);
    return new Response(req.method === 'HEAD' ? null : rec.blob, { status: 200, headers: h });
  });
}
