/* ============================================================
   案例库 · 页面骨架（ui）
   ------------------------------------------------------------
   MB.cl：大家共用的东西
   - api()：呼叫 /api/*（写入自动带 X-VISI: 1；cookie 同网域自动带）
   - 登入 / 登出；needLogin()：中途 401 时叫出登入框，登入后原来的工作接着做（不丢上传、不丢未保存的修改）
   - 清单 catalog（view=full：含项目真名，只给业务）的快取与重新载入
   - 分页（上传 / 审核）、toast、小工具
   上传在 upload.js，审核在 review.js，读文件夹在 scan.js，照片处理在 worker.js。
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var NAME_KEY = 'caselib-name';
  var TAB_KEY = 'caselib-tab';

  var CL = MB.cl = {
    me: '',
    cat: null,          // 目前的清单（full）
    etag: '',           // 上次从伺服器拿到的那一版
    minRev: 0,          // 自己写入后伺服器回的 rev：拿到比它旧的清单 = CDN 还没更新
    catErr: null,       // 上次读清单失败的原因（.code = 'storage_blocked' = 案例库被停权）
    thumbs: {},         // h16 → 缩图 dataURL（这次上传的、或从缩图包读到的）
    $: $, $$: $$
  };

  /* ---------- 小工具 ---------- */
  CL.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  CL.n = function (x) { return Number(x || 0).toLocaleString('en-US'); };
  CL.mb = function (bytes) {
    var m = (bytes || 0) / 1048576;
    if (m >= 1024) return (m / 1024).toFixed(2) + ' GB';
    return (m >= 100 ? Math.round(m) : m.toFixed(1)) + ' MB';
  };
  CL.time = function (ts) {
    if (!ts) return '';
    var d = new Date(ts), now = new Date();
    var hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    if (d.toDateString() === now.toDateString()) return '今天 ' + hm;
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
  };
  // 上传时留下的缩图：只留最近 400 张（3,000 张全留约 90 MB）；审核页要的会从缩图包再读
  var thumbOrder = [];
  CL.keepThumb = function (h, url) {
    if (!url) return;
    if (!CL.thumbs[h]) thumbOrder.push(h);
    CL.thumbs[h] = url;
    while (thumbOrder.length > 400) delete CL.thumbs[thumbOrder.shift()];
  };
  CL.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  // 退避：第 n 次重试等多久（加一点随机，几个视窗不会同时撞上）
  CL.backoff = function (n, base, max) {
    var ms = Math.min(max || 30000, (base || 1500) * Math.pow(2.4, n));
    return Math.round(ms * (0.8 + Math.random() * 0.4));
  };

  /* 空间名：用 VISI 的 MB.ROOM（data.js），没有就用这里的 */
  var ROOM_FALLBACK = {
    foyer: '玄关', living: '客厅', dining: '餐厅', kitchen: '厨房', laundry: '洗衣房', master: '主卧',
    walkin: '衣帽间', vanity: '梳妆台', bathroom: '浴室', bedroom: '儿童房', study: '书房', altar: '神台',
    guest: '客房', other: '其他'
  };
  CL.roomZh = function (k) {
    if (!k) return '';
    if (MB.ROOM && MB.ROOM[k]) return MB.ROOM[k].zh;
    return ROOM_FALLBACK[k] || k;
  };
  CL.roomEn = function (k) {
    if (MB.ROOM && MB.ROOM[k]) return MB.ROOM[k].en;
    return k === 'other' ? 'Other' : k;
  };
  CL.styleZh = function (k) { var s = MB.caseStyle && MB.caseStyle(k); return s ? s.zh : (k || ''); };
  CL.cabZh = function (k) { var c = MB.caseCabinet && MB.caseCabinet(k); return c ? c.zh : k; };
  CL.STATUS = {
    unsure: { zh: '待确认', en: 'Unsure' },
    'new': { zh: '新上传', en: 'New' },
    auto: { zh: '自动标签', en: 'Auto' },
    confirmed: { zh: '已确认', en: 'Confirmed' }
  };

  /* 跟伺服器一样算 pid：去控制字元、空白合并、限 120 字 → NFC、小写 → sha256 前 10 码 */
  var CTRL;
  try { CTRL = new RegExp('[\\p{Cc}\\p{Cf}\\p{Zl}\\p{Zp}]', 'gu'); } catch (e) { CTRL = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u00ad\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]', 'g'); }
  CL.cleanName = function (s) {
    var t = String(s == null ? '' : s);
    if (t.normalize) t = t.normalize('NFC');
    t = t.replace(CTRL, ' ').replace(/\s+/g, ' ').trim();
    return Array.from ? Array.from(t).slice(0, 120).join('') : t.slice(0, 120);
  };
  CL.pidOf = function (name) {
    var t = CL.cleanName(name);
    if (t.normalize) t = t.normalize('NFC');
    t = t.trim().replace(/\s+/g, ' ').toLowerCase();
    var bytes = new TextEncoder().encode(t);
    return crypto.subtle.digest('SHA-256', bytes).then(function (d) {
      var b = new Uint8Array(d), s = '';
      for (var i = 0; i < 5; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
      return 'p' + s;
    });
  };

  /* ---------- toast / 状态列 ---------- */
  var toastTimer;
  CL.toast = function (msg, ms) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, ms || 2400);
  };

  /* ---------- API ----------
     回 {status, json, etag}；网路断 → status 0。呼叫的人自己看 status 决定怎么办 */
  CL.api = function (method, path, body, opts) {
    opts = opts || {};
    var headers = {};
    var payload;
    if (method !== 'GET') headers['X-VISI'] = '1';
    if (body instanceof Blob) { payload = body; headers['Content-Type'] = opts.type || body.type || 'application/octet-stream'; }
    else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
    if (opts.etag) headers['If-None-Match'] = opts.etag;
    var init = { method: method, headers: headers, body: payload, credentials: 'same-origin', cache: 'no-store' };
    if (opts.keepalive) init.keepalive = true;     // 关页时最后一次保存：页面关了请求照样送完
    return fetch(path, init)
      .then(function (r) {
        var etag = r.headers.get('ETag') || '';
        if (r.status === 304) return { status: 304, json: null, etag: etag };
        return r.text().then(function (text) {
          var j = null;
          try { j = text ? JSON.parse(text) : null; } catch (e) { j = null; }
          return { status: r.status, json: j, etag: etag };
        });
      }, function (e) {
        return { status: 0, json: null, error: String((e && e.message) || e) };
      });
  };

  // 401 → 登入框；登入后 resolve。同时间很多请求 401 只叫一次
  var loginWaiters = [];
  CL.needLogin = function () {
    return new Promise(function (resolve) {
      loginWaiters.push(resolve);
      showLogin(true);
    });
  };

  // 常用：失败就交给呼叫的人，401 自动等登入再试一次（可以连续）
  CL.call = function (method, path, body, opts) {
    return CL.api(method, path, body, opts).then(function (r) {
      if (r.status === 401) return CL.needLogin().then(function () { return CL.call(method, path, body, opts); });
      return r;
    });
  };

  /* ---------- 清单 ---------- */
  var catWaiters = null;
  var staleTimer = 0, staleTries = 0;
  // 公开 Blob 有 CDN：刚写完的一分钟内可能还拿到旧版。旧的就先用手上的，过几秒再拿
  function stale() {
    if (staleTimer || staleTries >= 18) return CL.cat;
    staleTries++;
    staleTimer = setTimeout(function () { staleTimer = 0; CL.loadCatalog(true).catch(function () { /* 下次再拿 */ }); }, 5000);
    return CL.cat;
  }
  // force：不带 If-None-Match（重新拿整份）
  CL.loadCatalog = function (force) {
    if (catWaiters) return catWaiters;
    catWaiters = CL.call('GET', '/api/catalog?view=full', undefined, { etag: force ? '' : CL.etag }).then(function (r) {
      catWaiters = null;
      if (r.status === 304 && CL.cat) { CL.catErr = null; return (CL.cat.rev | 0) < CL.minRev ? stale() : CL.cat; }
      if (r.status !== 200 || !r.json) {
        var code = (r.json && r.json.error) || '';
        // 给业务看的话：不放英文代码（not_configured…）；没设定好 ≠ 网路断，要老板去 Vercel 设
        var e = new Error(r.status === 0 ? '网路连不上' :
          code === 'storage_blocked' ? '案例库的储存（Vercel Blob）被暂停了，现在读不到照片清单，也不能上传。请老板到 Vercel 看看（多半是免费额度用完了），恢复后再重新整理这一页。' :
          code === 'not_configured' ? '伺服器还没接好照片储存（Vercel 的 Blob 设定），现在读不到照片清单，也不能上传：请老板到 Vercel 设定好、重新部署后，再重新整理这一页。' :
          '读不到案例库的清单（伺服器回 ' + r.status + '）。');
        e.status = r.status;
        e.code = code;
        CL.catErr = e;
        throw e;
      }
      var c = r.json;
      c.projects = c.projects || {};
      c.photos = c.photos || {};
      c.log = c.log || [];
      CL.catErr = null;
      if (CL.cat && (c.rev | 0) < CL.minRev) return stale();
      staleTries = 0;
      CL.cat = c;
      CL.etag = r.etag || ('"rev-' + (c.rev | 0) + '"');
      CL.emit('catalog', c);
      return c;
    }, function (e) { catWaiters = null; throw e; });
    return catWaiters;
  };

  /* ---------- 这个月用掉几次 Blob 写入 ----------
     Vercel 免费（Hobby）方案每月约 2,000 次写入、1 GB 空间；超过整个 store 会被停权（连传好的照片都打不开）。
     伺服器自己设了上限：这个月写入到 1,800 次、或空间到 950 MB 就不收新照片（回 507）。
     上限以伺服器为准（GET ?view=full 的 quota，见 CL.quota）；这里的数字只给旧伺服器（没有 quota）用。
     伺服器每次写清单都记在 usage['YYYY-MM']（照片、缩图包、清单、备份都算）。
     旧的清单没有 usage：才从操作纪录估（log 只留最近 300 笔，会少算） */
  CL.LIMIT_WRITES = 1800;
  CL.LIMIT_BYTES = 950 * 1024 * 1024;
  function monthKey() { return new Date().toISOString().slice(0, 7); }
  CL.monthWrites = function (cat) {
    cat = cat || CL.cat || {};
    if (cat.usage && typeof cat.usage === 'object') {
      var u = cat.usage[monthKey()];
      return u ? (u.writes | 0) : 0;
    }
    var now = new Date();
    var month = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    var writes = 0, days = {};
    (cat.log || []).forEach(function (e) {
      if (!e || e.ts < month) return;
      writes += e.op === 'addPhotos' ? (e.n | 0) + 2 : 1;
      days[new Date(e.ts).toISOString().slice(0, 10)] = 1;
    });
    return writes + Object.keys(days).length;   // 每天第一次写入前的备份（copy 也算写入）
  };
  // 自己刚写成功：本地的计数先加上（下一次拿到伺服器的清单就以那边为准）
  // bytes：这次多存了多少（照片 + 缩图），额度的「空间」也先扣掉
  CL.addWrites = function (n, bytes) {
    var c = CL.cat;
    if (!c || !(n > 0)) return;
    if (!c.usage || typeof c.usage !== 'object') c.usage = {};
    var k = monthKey();
    c.usage[k] = { writes: ((c.usage[k] && c.usage[k].writes) | 0) + n };
    var q = c.quota;
    if (q && typeof q === 'object') {
      q.writes = (q.writes | 0) + n;
      if (q.writesLeft != null) q.writesLeft = Math.max(0, (q.writesLeft | 0) - n);
      if (bytes > 0) {
        q.bytes = (+q.bytes || 0) + bytes;
        if (q.bytesLeft != null) q.bytesLeft = Math.max(0, (+q.bytesLeft || 0) - bytes);
      }
    }
  };

  /* ---------- 额度：伺服器给的 quota（GET ?view=full）----------
     {plan:'hobby'|'pro', month, writes, bytes, uploadCap, writeCap, bytesCap, writesLeft, bytesLeft}
     Pro 的 cap / left 都是 null（不限）。旧伺服器没有 quota：用上面的数字自己估（est: true）。 */
  var bytesMemo = { rev: -1, n: -1, v: 0 };
  function estBytes(cat) {
    var photos = cat.photos || {};
    var keys = Object.keys(photos);
    if (bytesMemo.rev === (cat.rev | 0) && bytesMemo.n === keys.length) return bytesMemo.v;
    var b = 0;
    keys.forEach(function (h) { b += Math.max(0, +photos[h].sz || 0) + 35 * 1024; });
    var text = 0;
    try { text = JSON.stringify(cat).length; } catch (e) { text = keys.length * 500; }
    b += 8 * text;                     // 清单本身 + 7 份每天的备份
    bytesMemo = { rev: cat.rev | 0, n: keys.length, v: b };
    return b;
  }
  CL.quota = function (cat) {
    cat = cat || CL.cat || {};
    var q = cat.quota;
    if (q && typeof q === 'object' && (q.plan === 'pro' || q.plan === 'hobby')) {
      var out = {};
      Object.keys(q).forEach(function (k) { out[k] = q[k]; });
      if (q.plan === 'pro') { out.writesLeft = null; out.bytesLeft = null; out.uploadCap = null; out.bytesCap = null; }
      else {
        out.uploadCap = q.uploadCap == null ? CL.LIMIT_WRITES : q.uploadCap;
        out.bytesCap = q.bytesCap == null ? CL.LIMIT_BYTES : q.bytesCap;
        out.writesLeft = q.writesLeft == null ? Math.max(0, out.uploadCap - (q.writes | 0)) : Math.max(0, q.writesLeft | 0);
        out.bytesLeft = q.bytesLeft == null ? Math.max(0, out.bytesCap - (+q.bytes || 0)) : Math.max(0, +q.bytesLeft || 0);
      }
      return out;
    }
    var w = CL.monthWrites(cat), b = estBytes(cat);
    return {
      plan: 'hobby', month: monthKey(), writes: w, bytes: b, est: true,
      uploadCap: CL.LIMIT_WRITES, writeCap: 1950, bytesCap: CL.LIMIT_BYTES,
      writesLeft: Math.max(0, CL.LIMIT_WRITES - w), bytesLeft: Math.max(0, CL.LIMIT_BYTES - b)
    };
  };

  // 自己写入成功后：rev 以伺服器回的为准（公开 Blob 的 CDN 可能一分钟内还给旧版）
  CL.bumpRev = function (rev) {
    if (rev == null) return;
    if ((rev | 0) > CL.minRev) CL.minRev = rev | 0;
  };

  /* ---------- 小小的事件 ---------- */
  var handlers = {};
  CL.on = function (ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); };
  CL.emit = function (ev, data) { (handlers[ev] || []).forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } }); };

  /* ---------- 登入 ---------- */
  function showLogin(overlay) {
    var box = $('#login');
    box.hidden = false;
    box.classList.toggle('overlay', !!overlay);
    document.body.classList.toggle('cl-locked', !overlay);
    if (overlay) $('#login-why').hidden = false;
    var nm = $('#login-name');
    if (!nm.value) { try { nm.value = localStorage.getItem(NAME_KEY) || ''; } catch (e) { /* 无痕模式 */ } }
    setTimeout(function () { (nm.value ? $('#login-pass') : nm).focus(); }, 30);
  }
  function hideLogin() {
    $('#login').hidden = true;
    $('#login-why').hidden = true;
    $('#login-pass').value = '';
    document.body.classList.remove('cl-locked');
  }

  function setMe(name) {
    CL.me = name;
    $('#who-name').textContent = name;
    $('#who').hidden = false;
    $('#tabs').hidden = false;
  }

  function doLogin(ev) {
    if (ev) ev.preventDefault();
    var name = $('#login-name').value.trim();
    var pass = $('#login-pass').value;
    var line = $('#login-err');
    line.classList.remove('on');
    if (!name) { line.textContent = '请填你的名字（之后每次修改都会记下是谁改的）'; line.classList.add('on'); return; }
    if (!pass) { line.textContent = '请填团队密码'; line.classList.add('on'); return; }
    var btn = $('#login-go');
    btn.disabled = true;
    btn.textContent = '登入中…';
    CL.api('POST', '/api/session', { name: name, password: pass }).then(function (r) {
      btn.disabled = false;
      btn.textContent = '登入';
      if (r.status === 200 && r.json) {
        try {
          localStorage.setItem(NAME_KEY, name);
          // 同一个网址：VISI 看到这两个就会自己去拿案例库，不用再登入一次（cloud.js 的 FLAG / USER）
          localStorage.setItem('sail-visi-cases', '1');
          localStorage.setItem('sail-visi-cases-user', r.json.name);
        } catch (e) { /* 无痕模式 */ }
        var first = !CL.me;
        setMe(r.json.name);
        hideLogin();
        var w = loginWaiters; loginWaiters = [];
        w.forEach(function (fn) { fn(); });
        if (first) start();
        return;
      }
      var wait = r.status === 429 && r.json && r.json.retryAfter ? Math.max(1, Math.ceil(r.json.retryAfter / 60)) : 0;
      var msg = r.status === 401 ? '团队密码不对' :
        r.status === 429 ? '密码错太多次了，为了安全先锁住：请约 ' + (wait || 10) + ' 分钟后再试' :
        r.status === 400 ? '名字要 1–30 个字' :
        r.status === 503 ? '老板还没设定团队密码（Vercel 的 VISI_TEAM_PASSWORD）' :
        r.status === 0 ? '网路连不上，请检查网路再试' : '登入失败（' + r.status + '）';
      line.textContent = msg;
      line.classList.add('on');
      if (r.status === 401) { $('#login-pass').select(); }
    });
  }

  function logout() {
    var dirty = (MB.clReview && MB.clReview.unsaved()) || 0;
    var busy = MB.clUpload && MB.clUpload.busy();
    if (busy) { CL.toast('上传中不能登出，请先暂停并等它停好'); return; }
    if (dirty && !window.confirm('还有 ' + dirty + ' 项修改没保存，登出就会丢掉。确定登出？')) return;
    CL.api('DELETE', '/api/session').then(function () {
      CL.me = '';
      // VISI 那边也别再自己去拿（快取的清单留着，旧方案的公司照片才不会变空白）
      try { localStorage.removeItem('sail-visi-cases'); localStorage.removeItem('sail-visi-cases-user'); } catch (e) { /* 无痕模式 */ }
      location.reload();
    });
  }

  /* ---------- 分页 ---------- */
  CL.tab = '';
  CL.showTab = function (t) {
    if (t !== 'upload' && t !== 'review') t = 'upload';
    CL.tab = t;
    $$('#tabs button').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === t ? 'true' : 'false'); });
    $$('.cl-pane').forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== t; });
    try { localStorage.setItem(TAB_KEY, t); } catch (e) { /* 无痕模式 */ }
    if (history.replaceState) history.replaceState(null, '', '#' + t);
    CL.emit('tab', t);
  };

  /* ---------- 开机 ---------- */
  function start() {
    var want = (location.hash || '').replace('#', '');
    var saved = '';
    try { saved = localStorage.getItem(TAB_KEY) || ''; } catch (e) { /* 无痕模式 */ }
    if (MB.clUpload) MB.clUpload.init();
    if (MB.clReview) MB.clReview.init();
    CL.showTab(want || saved || 'upload');
    CL.loadCatalog().catch(function (e) { CL.toast(e.message, 4000); });
  }

  function boot() {
    $('#login-form').addEventListener('submit', doLogin);
    $('#logout').addEventListener('click', logout);
    $$('#tabs button').forEach(function (b) {
      b.addEventListener('click', function () { CL.showTab(b.getAttribute('data-tab')); });
    });
    // 还在上传，或有修改没保存：关页前提醒
    window.addEventListener('beforeunload', function (e) {
      var busy = (MB.clUpload && MB.clUpload.busy()) || (MB.clReview && MB.clReview.unsaved());
      if (!busy) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    });
    CL.api('GET', '/api/session').then(function (r) {
      $('#boot').hidden = true;
      if (r.status === 200 && r.json && r.json.name) { setMe(r.json.name); hideLogin(); start(); return; }
      if (r.status === 503) { $('#not-config').hidden = false; return; }
      if (r.status === 0) {
        $('#boot').hidden = false;
        $('#boot').innerHTML = '网路连不上。<button class="mini" type="button" id="boot-retry">再试一次</button>';
        $('#boot-retry').addEventListener('click', function () { location.reload(); });
        return;
      }
      showLogin(false);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
