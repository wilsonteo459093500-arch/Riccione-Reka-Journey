/* ============================================================
   销售端 · 生成需求卡链接 + 邀请函链接
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.SAIL || {};
  var $  = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  /* 路径：本地开发要带 .html，线上开了 cleanUrls 就不用。
     dir 是 create.html 所在的资料夹 —— 独立部署时是 '/'，
     挂在主站底下时是 '/invite/'，两种都自动算对。 */
  var local = /^(localhost|127\.|0\.0\.0\.0|\[?::1)/.test(location.hostname);
  var dir   = location.pathname.replace(/[^/]*$/, '');
  // config.js 的 publicBase = 邀请函的正式网址：销售端在哪里打开（本机、VISI 的网址），
  // 客户收到的链接都指向它。没填才用当前网址。
  var PUB   = String(CFG.publicBase || '').replace(/\/$/, '');
  var BASE  = PUB || location.origin + dir.replace(/\/$/, '');
  // 结尾的斜线不能省：少了它，浏览器会把 /invite 当档案，相对路径的样式与图片全部 404
  var PATH_INVITE = local && !PUB ? BASE + '/index.html' : BASE + '/';
  var PATH_BRIEF  = local && !PUB ? BASE + '/brief.html' : BASE + '/brief';

  var F = {
    host: $('#g-host'), role: $('#g-role'), wa: $('#g-wa'),
    name: $('#g-name'), honor: $('#g-honor'), cwa: $('#g-cwa'),
    date: $('#g-date'), time: $('#g-time'), dur: $('#g-dur'), msg: $('#g-msg'),
    printMsg: $('#g-print-msg')
  };

  /* ---------- 记住销售自己的资料 --------------------------- */
  var KEY = 'sail-sales-profile';
  (function restore() {
    var d = {};
    try { d = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
    F.host.value = d.host || (CFG.host && CFG.host.name) || '';
    F.role.value = d.role || (CFG.host && CFG.host.role) || '';
    F.wa.value   = d.wa   || (CFG.host && CFG.host.wa) || '';
  })();
  function remember() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        host: F.host.value.trim(), role: F.role.value.trim(), wa: F.wa.value.trim()
      }));
    } catch (e) {}
  }

  /* ---------- 工具 ---------------------------------------- */
  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  var WD = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  function dateLabel() {
    if (!F.date.value) return '';
    var p = F.date.value.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    return p[0] + '年' + p[1] + '月' + p[2] + '日（' + WD[d.getDay()] + '）' +
           (F.time.value ? ' ' + F.time.value : '');
  }

  /* ---------- 签名链接（体检第 2c 阶段）--------------------
     链接里的销售名字、职称、号码、留言要伺服器签过才算数（link-sign.js / api/link）。
     没签到的链接照样能发，但客户看到的是公司预设联络人、需求卡送去公司号码。
     登入 = 跟 VISI / 案例库同一个团队密码（名字用上面「姓名」那一格），cookie 30 天 */
  var LS = window.SAIL_LINK;
  var SIGS = {};              // JSON[by, role, wa, note] → sig
  var want = {};              // 这次 build 要签、还没签到的
  var signState = '';         // '' · 'busy' · 'login' · 'down' · 'error'
  var signTimer = 0;
  var SIGNED_FLAG = 'sail-sales-signed';
  function sigKey(f) { return JSON.stringify([f.by || '', f.role || '', f.wa || '', f.note || '']); }
  function sealed(q, f) {
    if (!LS || !LS.needs(f)) return;
    var k = sigKey(f);
    if (SIGS[k]) q.set('sig', SIGS[k]);
    else want[k] = f;
  }
  function askSigs(login) {
    var keys = Object.keys(want);
    if (!keys.length || !LS) return;
    if (signState === 'login' && !login) return;     // 等他登入
    signState = 'busy'; paintSign();
    var first = login;
    var run = keys.reduce(function (chain, k) {
      return chain.then(function () {
        var f = want[k];
        var p = LS.sign(f, first ? login : null);
        first = null;
        return p.then(function (r) { SIGS[k] = r.sig; });
      });
    }, Promise.resolve());
    run.then(function () {
      signState = '';
      try { localStorage.setItem(SIGNED_FLAG, '1'); } catch (e) {}
      if (login) ping('已登入，链接已认证');
      build();
    }, function (e) {
      var st = e && e.status;
      signState = st === 401 && e.error !== 'password' ? 'login' : st === 401 ? 'wrong' : st === 429 ? 'slow' :
        (!st || st === 404 || st === 503) ? 'down' : 'error';
      if (st === 401 && e.error === 'login') { try { localStorage.removeItem(SIGNED_FLAG); } catch (x) {} }
      paintSign(e);
    });
  }
  function paintSign(e) {
    var box = $('#sign-box'), st = $('#sign-status'), form = $('#sign-login');
    if (!box) return;
    var pending = Object.keys(want).length;
    var anySigned = !pending && $('#out-invite-link').textContent.indexOf('sig=') > -1;
    if (!pending && !anySigned) { box.hidden = true; return; }
    box.hidden = false;
    var DEF = (CFG.host && CFG.host.name) || 'Wilson Teo';
    var fallback = '没认证的链接，客户看到的是公司预设联络人（' + DEF + '），需求卡也会送去公司的号码。';
    var html = '', showForm = false;
    if (!pending) html = '<span style="color:#3F6B43">✓ 链接已认证：客户看到的是你的名字、号码' + (F.msg.value.trim() && F.printMsg.checked ? '和留言' : '') + '。</span>';
    else if (signState === 'busy') html = '认证链接中…';
    else if (signState === 'login' || signState === 'wrong' || signState === 'slow') {
      showForm = true;
      html = (signState === 'wrong' ? '<b style="color:#A8402A">团队密码不对。</b>' :
        signState === 'slow' ? '<b style="color:#A8402A">密码错太多次，请 ' + Math.ceil(((e && e.retryAfter) || 600) / 60) + ' 分钟后再试。</b>' : '') +
        '用<b>团队密码</b>登入一次（跟 VISI、公司案例库同一个），链接才会显示你的名字和号码。' + fallback;
    } else if (signState === 'down') html = '<b style="color:#A8402A">连不上伺服器，链接还没认证。</b>' + fallback;
    else if (signState === 'error') html = '<b style="color:#A8402A">认证失败（' + ((e && e.error) || '') + '）。</b>' + fallback;
    else html = '认证链接中…';
    st.innerHTML = html;
    form.hidden = !showForm;
  }
  $('#sign-login').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var pw = $('#sign-pw').value;
    if (!pw) return;
    var name = F.host.value.trim() || (CFG.host && CFG.host.name) || '';
    askSigs({ name: name, password: pw });
    $('#sign-pw').value = '';
  });

  /* ---------- 生成 ---------------------------------------- */
  function build() {
    remember();
    want = {};

    var host = F.host.value.trim() || (CFG.host && CFG.host.name) || 'Wilson Teo';
    var role = F.role.value.trim() || (CFG.host && CFG.host.role) || '溪岸 Sail by Riccione Reka';
    var hostWa = digits(F.wa.value) || (CFG.host && CFG.host.wa) || '';
    var name = F.name.value.trim();
    var honor = F.honor.value;   // 存的是短代号：mr / ms / …
    var HONOR_ZH = { mr: '先生', ms: '女士', mrs: '太太', miss: '小姐', teacher: '老师', designer: '设计师' };
    var call = name ? name + (HONOR_ZH[honor] || '') : '您';
    var cwa = digits(F.cwa.value);

    /* 邀请人在团队名单里的话，用代号，链接里就不必出现电话与中文姓名 */
    var me = null, team = CFG.team || [];
    for (var i = 0; i < team.length; i++) {
      if (team[i].name && team[i].name.toLowerCase() === host.toLowerCase()) { me = team[i]; break; }
    }

    /* ① 需求卡 */
    var bq = new URLSearchParams();
    if (me && me.code) {
      bq.set('from', me.code);
    } else {
      bq.set('by', host);
      if (hostWa) bq.set('wa', hostWa);
      sealed(bq, { by: host, wa: hostWa });
    }
    if (name) bq.set('for', name);
    var briefLink = PATH_BRIEF + '?' + bq.toString();

    var briefMsg =
      call + '，您好，我是溪岸的 ' + host + '。\n\n' +
      '在见面之前，想先了解一下您的空间 —— 这里有一份 3 分钟的需求卡：\n' +
      briefLink + '\n\n' +
      '填完之后我会先读一遍，做一版初步想法，再约您到展厅。这样见面那天，我们可以直接聊方案，不用从零开始。';

    /* ② 邀请函 —— 用可读参数，链接看起来才像一封邀请，不像钓鱼
       与 config.js 默认值相同的字段直接省略 */
    var def = CFG.host || {};
    var iq = new URLSearchParams();
    if (name) iq.set('for', name);
    if (honor) iq.set('title', honor);
    if (F.date.value) iq.set('on', F.date.value);
    if (F.time.value && F.time.value !== '14:00') iq.set('at', F.time.value);
    if (F.dur.value && +F.dur.value !== 60) iq.set('mins', String(+F.dur.value));
    if (host !== def.name) {
      if (me && me.code) {
        iq.set('from', me.code);
      } else {
        iq.set('from', host);
        if (role !== def.role) iq.set('role', role);
        if (hostWa && hostWa !== String(def.wa || '')) iq.set('wa', hostWa);
      }
    }
    if (F.msg.value.trim() && F.printMsg.checked) iq.set('note', F.msg.value.trim());
    sealed(iq, { by: iq.get('from') || '', role: iq.get('role') || '', wa: iq.get('wa') || '', note: iq.get('note') || '' });
    var qs = iq.toString();
    var inviteLink = PATH_INVITE + (qs ? '?' + qs : '');

    var dl = dateLabel();
    var inviteMsg =
      call + '，' + (F.msg.value.trim()
        ? F.msg.value.trim()
        : '我们读过您填的需求卡，已经准备好一版初步想法。') + '\n\n' +
      '这是给您的邀请函 —— 里面有当天约 ' + (F.dur.value || 60) + ' 分钟的流程安排、我们的介绍，以及到馆的停车路线：\n' +
      inviteLink + '\n\n' +
      (dl ? '约定时间：' + dl + '\n' : '') +
      '期待与您见面。\n' + host + ' · ' + role;

    $('#out-brief-link').textContent = briefLink;
    $('#out-brief-msg').textContent = briefMsg;
    $('#out-invite-link').textContent = inviteLink;
    $('#out-invite-msg').textContent = inviteMsg;

    $('#send-brief').href  = 'https://wa.me/' + cwa + '?text=' + encodeURIComponent(briefMsg);
    $('#send-invite').href = 'https://wa.me/' + cwa + '?text=' + encodeURIComponent(inviteMsg);
    $('#open-brief').href  = briefLink;
    $('#open-invite').href = inviteLink + (qs ? '&' : '?') + 'open=1';

    // 有要签的：停手 0.6 秒后去要（打字时不会一个字一次）
    clearTimeout(signTimer);
    if (Object.keys(want).length && signState !== 'login' && signState !== 'wrong' && signState !== 'slow') {
      signTimer = setTimeout(function () { askSigs(null); }, 600);
    }
    paintSign();
  }

  $$('input, select, textarea').forEach(function (el) {
    el.addEventListener('input', build);
    el.addEventListener('change', build);
  });

  /* 一句话模板 */
  $$('#msg-presets [data-msg]').forEach(function (b) {
    b.addEventListener('click', function () {
      F.msg.value = b.getAttribute('data-msg');
      build();
      F.msg.focus();
    });
  });

  /* 复制 */
  var toast = $('#toast');
  function ping(t) {
    toast.textContent = t; toast.classList.add('on');
    setTimeout(function () { toast.classList.remove('on'); }, 1800);
  }
  $$('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = $('#' + b.getAttribute('data-copy')).textContent;
      var ok = function () { ping('已复制'); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(ok, fb); else fb();
      function fb() {
        var ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); ok(); } catch (e) {}
        document.body.removeChild(ta);
      }
    });
  });

  build();
})();
