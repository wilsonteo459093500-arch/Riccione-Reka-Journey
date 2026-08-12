/* ============================================================
   销售端 · 生成需求卡链接 + 邀请函链接
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.SAIL || {};
  var $  = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var BASE = location.href.replace(/[^/]*$/, '');   // …/invite/

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

  /* ---------- 生成 ---------------------------------------- */
  function build() {
    remember();

    var host = F.host.value.trim() || (CFG.host && CFG.host.name) || 'Wilson Teo';
    var role = F.role.value.trim() || (CFG.host && CFG.host.role) || '溪岸 Sail by Riccione Reka';
    var hostWa = digits(F.wa.value) || (CFG.host && CFG.host.wa) || '';
    var name = F.name.value.trim();
    var honor = F.honor.value;
    var call = name ? name + (honor ? honor : '') : '您';
    var cwa = digits(F.cwa.value);

    /* ① 需求卡 */
    var bq = new URLSearchParams();
    bq.set('by', host);
    if (hostWa) bq.set('wa', hostWa);
    if (name) bq.set('n', name);
    // 线上开了 cleanUrls，可以省掉 .html；本地用 python 起的服务器不行
    var local = /^(localhost|127\.|0\.0\.0\.0|\[?::1)/.test(location.hostname);
    var briefLink = BASE + (local ? 'brief.html?' : 'brief?') + bq.toString();

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
    if (host !== def.name) iq.set('from', host);
    if (role !== def.role) iq.set('role', role);
    if (hostWa && hostWa !== String(def.wa || '')) iq.set('wa', hostWa);
    if (F.msg.value.trim() && F.printMsg.checked) iq.set('note', F.msg.value.trim());
    var qs = iq.toString();
    var inviteLink = BASE + (qs ? '?' + qs : '');

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
