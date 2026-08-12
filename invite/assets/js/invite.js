/* ============================================================
   邀请函 · invitation runtime
   URL 参数由销售端 create.html 生成：
     ?i=<base64url(JSON)>              （推荐，链接干净）
     ?n=陈志明&t=先生&d=2026-08-20…   （明文，方便手改）
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.SAIL || {};
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- 参数解析 ------------------------------------- */
  function b64urlDecode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    try { return decodeURIComponent(escape(atob(s))); } catch (e) { return ''; }
  }

  /* 可读参数名 → 内部短名。两套都认，老链接不会失效。
     /invite/?for=陈志明&on=2026-08-25&at=14:00 */
  var ALIAS = {
    'for': 'n', title: 't', on: 'd', at: 'h',
    mins: 'dur', from: 'by', role: 'role', wa: 'wa', note: 'msg'
  };

  function readParams() {
    var q = new URLSearchParams(location.search);
    var data = {};
    if (q.get('i')) {
      try { data = JSON.parse(b64urlDecode(q.get('i'))) || {}; } catch (e) { data = {}; }
    }
    Object.keys(ALIAS).forEach(function (k) {
      if (q.get(k)) data[ALIAS[k]] = q.get(k);
    });
    ['n', 't', 'co', 'd', 'h', 'dur', 'by', 'role', 'wa', 'msg'].forEach(function (k) {
      if (q.get(k)) data[k] = q.get(k);
    });
    return data;
  }

  var P = readParams();

  var guest = (P.n || '').trim();
  var honor = (P.t || '').trim();
  var host  = (P.by || (CFG.host && CFG.host.name) || 'Wilson Teo').trim();
  var role  = (P.role || (CFG.host && CFG.host.role) || '溪岸 Sail by Riccione Reka').trim();
  var hostWa = String(P.wa || (CFG.host && CFG.host.wa) || '').replace(/\D/g, '');
  var dur   = parseInt(P.dur, 10) > 0 ? parseInt(P.dur, 10) : 60;

  /* ---------- 日期 ----------------------------------------- */
  var when = null;               // Date 对象（当地时间）
  if (P.d) {
    var dp = P.d.split('-').map(Number);
    var tp = (P.h || '00:00').split(':').map(Number);
    if (dp.length === 3 && !isNaN(dp[0])) {
      when = new Date(dp[0], dp[1] - 1, dp[2], tp[0] || 0, tp[1] || 0, 0, 0);
    }
  }

  var WD_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  var WD_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MO_EN = ['January', 'February', 'March', 'April', 'May', 'June',
               'July', 'August', 'September', 'October', 'November', 'December'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateZh(d) { return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function dateEn(d) { return d.getDate() + ' ' + MO_EN[d.getMonth()] + ' ' + d.getFullYear(); }
  function timeStr(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  /* ---------- 双语 ----------------------------------------- */
  function setLang(l) {
    document.documentElement.setAttribute('data-lang', l);
    document.documentElement.setAttribute('lang', l === 'en' ? 'en' : 'zh-Hans');
    $$('[data-set-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === l));
    });
    try { localStorage.setItem('sail-lang', l); } catch (e) {}
    paint();
  }
  $$('[data-set-lang]').forEach(function (b) {
    b.addEventListener('click', function () { setLang(b.getAttribute('data-set-lang')); });
  });

  function lang() { return document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'zh'; }

  /* ---------- 填充内容 ------------------------------------- */
  function paint() {
    var zh = lang() === 'zh';
    var fallbackName = zh ? '亲爱的朋友' : 'Dear Friend';
    var name = guest || fallbackName;

    ['#s-name', '#t-name', '#l-name'].forEach(function (sel) {
      var el = $(sel); if (el) el.textContent = name;
    });
    ['#s-honor', '#l-honor'].forEach(function (sel) {
      var el = $(sel); if (el) el.textContent = guest && honor ? (sel === '#s-honor' ? honor : ' ' + honor) : '';
    });

    $$('.s-host').forEach(function (el) { el.textContent = host; });
    var lr = $('#l-role'); if (lr) lr.textContent = role;
    var cr = $('#c-role'); if (cr) cr.textContent = role;

    // 封面副标题
    var meta = $('#s-meta');
    if (meta) {
      if (when) {
        meta.textContent = zh
          ? dateZh(when) + '（' + WD_ZH[when.getDay()] + '）' + (P.h ? ' · ' + timeStr(when) : '')
          : WD_EN[when.getDay()] + ', ' + dateEn(when) + (P.h ? ' · ' + timeStr(when) : '');
      } else {
        meta.textContent = 'Riccione Reka × Sail';
      }
    }

    // 预约卡片
    var ad = $('#a-date'), aw = $('#a-weekday'), at = $('#a-time'), adr = $('#a-dur');
    if (ad) {
      if (when) {
        ad.firstChild.nodeValue = zh ? dateZh(when) : dateEn(when);
        if (aw) aw.textContent = zh ? WD_ZH[when.getDay()] : WD_EN[when.getDay()];
      } else {
        ad.firstChild.nodeValue = zh ? '待确认' : 'To be confirmed';
        if (aw) aw.textContent = '';
      }
    }
    if (at) {
      at.firstChild.nodeValue = P.h ? timeStr(when || new Date()) : (zh ? '待确认' : 'TBC');
      if (adr) adr.textContent = zh ? '约 ' + dur + ' 分钟' : 'about ' + dur + ' minutes';
    }

    // 顶栏日期
    var tw = $('#t-when');
    if (tw) tw.textContent = when ? (zh ? dateZh(when) + (P.h ? ' · ' + timeStr(when) : '')
                                        : dateEn(when) + (P.h ? ' · ' + timeStr(when) : '')) : '';

    // 销售的私人留言
    if (P.msg) {
      var w = $('#l-msg-wrap'), m = $('#l-msg');
      if (w && m) { m.textContent = P.msg; w.hidden = false; }
    }

    paintCountdown(zh);
    paintLinks(zh);
  }

  /* ---------- 倒数 ----------------------------------------- */
  function paintCountdown(zh) {
    var box = $('#countdown');
    if (!box || !when) return;
    var now = new Date();
    var startOfDay = function (d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
    var days = Math.round((startOfDay(when) - startOfDay(now)) / 86400000);
    var html;
    if (days > 1)       html = zh ? '距离见面还有 <b>' + days + '</b> 天' : '<b>' + days + '</b> days until we meet';
    else if (days === 1) html = zh ? '<b>明天</b> 见' : 'See you <b>tomorrow</b>';
    else if (days === 0) html = zh ? '就是 <b>今天</b> — 我们在展厅等您' : "It's <b>today</b> — we're waiting at the gallery";
    else                 html = zh ? '谢谢您的到访 — 期待下一次见面' : 'Thank you for visiting — until next time';
    box.innerHTML = html;
    box.hidden = false;
  }

  /* ---------- 链接（WhatsApp / 地图 / 日历） ---------------- */
  function confirmText(zh) {
    var whenTxt = when ? (zh ? dateZh(when) + (P.h ? ' ' + timeStr(when) : '') : dateEn(when) + (P.h ? ' ' + timeStr(when) : '')) : '';
    if (zh) {
      return '您好 ' + host + '，我是 ' + (guest || '（请填姓名）') + '。' +
             (whenTxt ? '确认 ' + whenTxt + ' 到溪岸体验馆，' : '想确认到馆时间，') + '谢谢！';
    }
    return 'Hi ' + host + ', this is ' + (guest || '(your name)') + '. ' +
           (whenTxt ? 'Confirming my visit to the Sail gallery on ' + whenTxt + '. ' : 'I would like to confirm my visit. ') + 'Thank you!';
  }

  function paintLinks(zh) {
    var wa = 'https://wa.me/' + (hostWa || '') + '?text=' + encodeURIComponent(confirmText(zh));
    ['#btn-confirm', '#btn-confirm-2', '#btn-confirm-3'].forEach(function (sel) {
      var el = $(sel); if (el) el.href = wa;
    });
    ['#btn-maps', '#btn-maps-2'].forEach(function (sel) {
      var el = $(sel); if (el) el.href = CFG.maps || '#';
    });
    var wz = $('#btn-waze'); if (wz) wz.href = CFG.waze || '#';
    var ph = $('#v-phone');
    if (ph && CFG.venue) { ph.href = 'tel:' + CFG.venue.phone; ph.textContent = CFG.venue.phoneShow; }
  }

  /* ---------- 日历 .ics ------------------------------------ */
  function icsStamp(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
           pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z';
  }
  var icsBtn = $('#btn-ics');
  if (icsBtn) {
    if (!when) { icsBtn.disabled = true; icsBtn.style.opacity = '.45'; }
    icsBtn.addEventListener('click', function () {
      if (!when) return;
      var end = new Date(when.getTime() + dur * 60000);
      var title = '溪岸体验馆到访 · Sail Gallery Visit' + (guest ? ' — ' + guest : '');
      var body = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sail by Riccione Reka//Invitation//EN',
        'BEGIN:VEVENT',
        'UID:' + Date.now() + '@sail-riccione',
        'DTSTAMP:' + icsStamp(new Date()),
        'DTSTART:' + icsStamp(when),
        'DTEND:' + icsStamp(end),
        'SUMMARY:' + title,
        'LOCATION:' + (CFG.venue ? CFG.venue.address.replace(/,/g, '\\,') : ''),
        'DESCRIPTION:' + ('邀请人 ' + host + ' · ' + role + '。约 ' + dur + ' 分钟行程。').replace(/,/g, '\\,'),
        'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:溪岸体验馆到访提醒', 'END:VALARM',
        'END:VEVENT', 'END:VCALENDAR'
      ].join('\r\n');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
      a.download = 'sail-gallery-visit.ics';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    });
  }

  /* ---------- 开启邀请函 ----------------------------------- */
  function openInvitation() {
    document.body.setAttribute('data-state', 'open');
    setTimeout(function () {
      window.scrollTo({ top: 0, behavior: 'auto' });
      var dock = $('#dock'); if (dock) dock.classList.add('show');
    }, 500);
  }
  var ob = $('#openBtn');
  if (ob) ob.addEventListener('click', openInvitation);

  /* ---------- 滚动：进度条 / 顶栏 / 揭示 -------------------- */
  var bar = $('#progress'), top = $('#topbar');
  function onScroll() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    var y = window.scrollY || document.documentElement.scrollTop;
    if (bar) bar.style.width = (h > 0 ? Math.min(100, (y / h) * 100) : 0) + '%';
    if (top) top.classList.toggle('show', y > 260 && document.body.getAttribute('data-state') === 'open');
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    $$('.r').forEach(function (el) { io.observe(el); });
  } else {
    $$('.r').forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- 需求卡入口 ----------------------------------- */
  var bl = $('#brief-link');
  if (bl && CFG.showBriefLink && P.brief !== '0') bl.hidden = false;

  /* ---------- 启动 ----------------------------------------- */
  var saved = 'zh';
  try { saved = localStorage.getItem('sail-lang') || 'zh'; } catch (e) {}
  setLang(saved === 'en' ? 'en' : 'zh');
  onScroll();

  // 预览模式：?open=1 直接跳过封面（销售端预览用）
  if (new URLSearchParams(location.search).get('open') === '1') openInvitation();
})();
