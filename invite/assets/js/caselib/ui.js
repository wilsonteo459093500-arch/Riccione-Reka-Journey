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
    return fetch(path, { method: method, headers: headers, body: payload, credentials: 'same-origin', cache: 'no-store' })
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
      if (r.status === 304 && CL.cat) return (CL.cat.rev | 0) < CL.minRev ? stale() : CL.cat;
      if (r.status !== 200 || !r.json) {
        var e = new Error(r.status === 0 ? '网路连不上' : '读清单失败（' + r.status + (r.json && r.json.error ? ' ' + r.json.error : '') + '）');
        e.status = r.status;
        throw e;
      }
      var c = r.json;
      c.projects = c.projects || {};
      c.photos = c.photos || {};
      c.log = c.log || [];
      if (CL.cat && (c.rev | 0) < CL.minRev) return stale();
      staleTries = 0;
      CL.cat = c;
      CL.etag = r.etag || ('"rev-' + (c.rev | 0) + '"');
      CL.emit('catalog', c);
      return c;
    }, function (e) { catWaiters = null; throw e; });
    return catWaiters;
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
      var msg = r.status === 401 ? '团队密码不对' :
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
      try { localStorage.removeItem('sail-visi-cases'); } catch (e) { /* 无痕模式 */ }
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
