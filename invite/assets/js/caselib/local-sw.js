/* ============================================================
   案例库 · 本机模式的开关（页面这一边）
   ------------------------------------------------------------
   「存在这台电脑」模式靠 /caselib-sw.js（service worker）在浏览器里回答 /api/*。
   caselib.html、visi.html 载入这个档（给客户看的邀请页不载入）：
   - mode()：'local' | 'cloud' | ''（还没选）。记在 localStorage 'caselib-mode'（页面看）
     和 IndexedDB 'caselib-local' 的 meta.mode（service worker 看）
   - setMode('local')：注册 service worker（scope '/caselib'、'/visi' —— 不是 '/'，邀请页才不会被它管），
     等它接手这一页，告诉它「本机模式」。setMode('cloud')：告诉它「云端」再取消注册（本机的资料不删）。
   - ready()：本机模式下，等 service worker 接手这一页再发 /api 请求。
     第一次（刚装好、或 Shift+重新整理）还没接手：等一下；还是没有就重新整理一次（只一次）。
     回 Promise<boolean>：false = 这个浏览器不能用本机模式（不支援 / 无痕模式）
   - estimate()：这台电脑给这个网站的空间 {usage, quota}；persist()：请浏览器别自己清掉（回 true = 答应了）；
     persisted()：浏览器答应了没有（没答应 = 硬碟快满时整个案例库可能被清掉：页面要一直提醒他备份标签档）
   - safari：这是 Safari（7 天没打开这个网址就清掉网站资料）：登入框、上传页要说清楚，请他改用 Chrome / Edge
   对外：MB.localSw
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};
  var KEY = 'caselib-mode';
  var RELOAD = 'caselib-sw-reload';
  var SW = '/caselib-sw.js';
  var SCOPES = ['/caselib', '/visi'];

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* 无痕模式 */ } }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* 无痕模式 */ } }

  var sw = navigator.serviceWorker;
  var supported = !!(sw && window.indexedDB && window.isSecureContext !== false);

  // 这一页在不在 service worker 管得到的范围（/caselib…、/visi…）
  function inScope() {
    var p = location.pathname;
    return SCOPES.some(function (s) { return p.indexOf(s) === 0; });
  }
  function mode() {
    var m = lsGet(KEY);
    return m === 'local' || m === 'cloud' ? m : '';
  }
  function register() {
    return Promise.all(SCOPES.map(function (s) { return sw.register(SW, { scope: s, updateViaCache: 'none' }); }));
  }
  // 那个 registration 的 service worker 装好、可以用了
  function activeOf(reg) {
    if (reg.active) return Promise.resolve(reg.active);
    return new Promise(function (ok, fail) {
      var w = reg.installing || reg.waiting;
      if (!w) { fail(new Error('no worker')); return; }
      var t = setTimeout(function () { fail(new Error('worker timeout')); }, 15000);
      w.addEventListener('statechange', function () {
        if (w.state === 'activated' && reg.active) { clearTimeout(t); ok(reg.active); }
        else if (w.state === 'redundant') { clearTimeout(t); fail(new Error('worker redundant')); }
      });
    });
  }
  function tell(worker, msg) {
    return new Promise(function (ok, fail) {
      var ch = new MessageChannel();
      var t = setTimeout(function () { fail(new Error('service worker did not answer')); }, 8000);
      ch.port1.onmessage = function (e) {
        clearTimeout(t);
        if (e.data && e.data.ok) ok(e.data); else fail(new Error((e.data && e.data.error) || 'service worker error'));
      };
      worker.postMessage(msg, [ch.port2]);
    });
  }
  // 这一页被 service worker 管了没有（clients.claim 之后会有 controllerchange）
  function controlled(ms) {
    if (sw.controller) return Promise.resolve(true);
    return new Promise(function (ok) {
      var done = false;
      function fin() {
        if (done) return;
        done = true;
        sw.removeEventListener('controllerchange', fin);
        ok(!!sw.controller);
      }
      sw.addEventListener('controllerchange', fin);
      setTimeout(fin, ms || 4000);
    });
  }
  // 这一页的 registration（scope 对得上的那个）
  function mine(regs) {
    var here = location.pathname;
    var best = null;
    regs.forEach(function (r) {
      var s = new URL(r.scope).pathname;
      if (here.indexOf(s) === 0 && (!best || s.length > new URL(best.scope).pathname.length)) best = r;
    });
    return best || regs[0];
  }

  var readyP = null;
  function ready() {
    if (mode() !== 'local') return Promise.resolve(true);
    if (!supported || !inScope()) return Promise.resolve(false);
    if (readyP) return readyP;
    readyP = register().then(function (regs) {
      return activeOf(mine(regs));
    }).then(function (w) {
      // 每次都再说一次「本机模式」：IndexedDB 被清过、service worker 重装过也不会跑去问云端
      return tell(w, { type: 'caselib-mode', mode: 'local' });
    }).then(function () {
      return controlled(4000);
    }).then(function (ok) {
      if (ok) { ssSet(RELOAD, null); return true; }
      if (!ssGet(RELOAD)) {
        ssSet(RELOAD, '1');
        location.reload();
        return new Promise(function () { /* 重新整理中 */ });
      }
      return false;
    }).catch(function (e) {
      console.error('[caselib] service worker:', e);
      readyP = null;
      return false;
    });
    return readyP;
  }

  function setMode(m) {
    m = m === 'local' ? 'local' : 'cloud';
    if (m === 'local') {
      if (!supported) return Promise.resolve(false);
      lsSet(KEY, 'local');
      readyP = null;
      return ready();
    }
    lsSet(KEY, 'cloud');
    readyP = null;
    if (!sw || !sw.getRegistrations) return Promise.resolve(true);
    // 先告诉 service worker「云端」（别的分页还被它管着），再取消注册：本机的照片、标签都留着
    return sw.getRegistrations().then(function (regs) {
      regs = regs.filter(function (r) { var w = r.active || r.waiting || r.installing; return w && /\/caselib-sw\.js(\?|$)/.test(w.scriptURL); });
      var first = regs.filter(function (r) { return r.active; })[0];
      return (first ? tell(first.active, { type: 'caselib-mode', mode: 'cloud' }).catch(function () { /* 没回也照样取消 */ }) : Promise.resolve()).then(function () {
        return Promise.all(regs.map(function (r) { return r.unregister().catch(function () { return false; }); }));
      });
    }).then(function () { return true; }, function () { return true; });
  }

  function estimate() {
    try {
      if (navigator.storage && navigator.storage.estimate) return navigator.storage.estimate().then(function (e) { return e || {}; }, function () { return {}; });
    } catch (e) { /* 不支援 */ }
    return Promise.resolve({});
  }
  function persist() {
    try {
      if (navigator.storage && navigator.storage.persist) return navigator.storage.persist().then(function (v) { return !!v; }, function () { return false; });
    } catch (e) { /* 不支援 */ }
    return Promise.resolve(false);
  }
  function persisted() {
    try {
      if (navigator.storage && navigator.storage.persisted) return navigator.storage.persisted().then(function (v) { return !!v; }, function () { return false; });
    } catch (e) { /* 不支援 */ }
    return Promise.resolve(false);
  }
  // Safari（Mac / iPhone / iPad 上的 WebKit，不是 Chrome、Edge、Firefox）
  var ua = navigator.userAgent || '';
  var safari = /Safari\//.test(ua) && /AppleWebKit\//.test(ua) && !/Chrome\/|Chromium\/|CriOS\/|Edg\/|EdgiOS\/|FxiOS\/|OPR\/|Android/.test(ua);

  MB.localSw = {
    supported: supported,
    mode: mode,
    isLocal: function () { return mode() === 'local'; },
    ready: ready,
    setMode: setMode,
    estimate: estimate,
    persist: persist,
    persisted: persisted,
    safari: safari,
    /** 这一页现在被 service worker 管着 */
    controlled: function () { return !!(sw && sw.controller); },
    /** 本机案例库的网址开头（cloud.js 认这个，知道是本机的） */
    base: function () { return location.origin + '/local-cases/'; }
  };

  // 本机模式：一载入就开始等 service worker（visi.html 的照片在第一次排版就要从它拿）。
  // VISI 的网址首页「/」也是 VISI（middleware 转的）：那里不在范围里 → 换到 /visi（一样的页面）
  if (mode() === 'local' && supported) {
    if (!inScope()) location.replace('/visi' + location.search + location.hash);
    else ready();
  }
})();
