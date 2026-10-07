/* ============================================================
   通用小工具：语言、本机记忆、RSVP 提交、WhatsApp、日历、倒数、彩带。
   邀请函（party.js）和主人页（host.js）都会用到。
   ============================================================ */
(function () {
  'use strict';

  var P = window.PARTY;

  /* ---------- 本机记忆（私密窗口 / 被禁用时安静失败） ---------- */
  var mem = {
    get: function (k, fallback) {
      try {
        var v = localStorage.getItem(k);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set: function (k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch (e) {
        /* ignore */
      }
    },
    del: function (k) {
      try {
        localStorage.removeItem(k);
      } catch (e) {
        /* ignore */
      }
    }
  };

  /* ---------- 语言 ---------- */
  var LANG_KEY = 'dudu.lang';

  function initialLang() {
    var q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'zh') return q;
    var saved = mem.get(LANG_KEY, null);
    if (saved === 'en' || saved === 'zh') return saved;
    return 'zh';
  }

  function setLang(lang) {
    lang = lang === 'en' ? 'en' : 'zh';
    var root = document.documentElement;
    root.setAttribute('data-lang', lang);
    root.setAttribute('lang', lang === 'en' ? 'en' : 'zh-Hans');
    document.querySelectorAll('[data-set-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === lang));
    });
    mem.set(LANG_KEY, lang);
    document.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
  }

  function lang() {
    return document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'zh';
  }

  function bindLang() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-set-lang]');
      if (b) setLang(b.getAttribute('data-set-lang'));
    });
    setLang(initialLang());
  }

  /* ---------- id ---------- */
  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var s = '';
    var a = new Uint8Array(16);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.floor(Math.random() * 256); });
    a.forEach(function (b) { s += ('0' + b.toString(16)).slice(-2); });
    return s;
  }

  /* ---------- API ---------- */
  function fetchJson(url, opts, timeoutMs) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 12000) : null;
    var o = Object.assign({}, opts || {});
    if (ctrl) o.signal = ctrl.signal;
    return fetch(url, o).then(function (res) {
      clearTimeout(t);
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { status: res.status, data: data };
      });
    }, function (err) {
      clearTimeout(t);
      throw err;
    });
  }

  var api = {
    /** 公开人数；拿不到就 null（页面上那一行就不显示）。 */
    summary: function () {
      return fetchJson('/api/rsvp', { headers: { Accept: 'application/json' } }, 8000).then(function (r) {
        return r.status === 200 && r.data && r.data.ok ? r.data : null;
      }, function () { return null; });
    },
    /**
     * 送出 RSVP。
     * 结果：{ ok:true, data } | { ok:false, invalid:true, fields } | { ok:false, fallback:true }
     * fallback = 没接存储 / 断网 / 伺服器出错 → 改走 WhatsApp。
     */
    submit: function (payload) {
      return fetchJson('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      }, 15000).then(function (r) {
        if (r.status === 200 && r.data && r.data.ok) return { ok: true, data: r.data };
        if (r.status === 400 && r.data && r.data.fields) return { ok: false, invalid: true, fields: r.data.fields };
        return { ok: false, fallback: true, status: r.status };
      }, function () {
        return { ok: false, fallback: true, status: 0 };
      });
    }
  };

  /* ---------- WhatsApp ---------- */
  var DIET_LABEL = {
    zh: { vegetarian: '素食', 'no-beef': '不吃牛', halal: 'Halal', 'no-spicy': '不吃辣', allergy: '过敏' },
    en: { vegetarian: 'Vegetarian', 'no-beef': 'No beef', halal: 'Halal', 'no-spicy': 'No spicy', allergy: 'Allergy' }
  };

  function dietText(r, lg) {
    var L = DIET_LABEL[lg] || DIET_LABEL.zh;
    var parts = (r.diet || []).map(function (k) { return L[k] || k; });
    if (r.dietNote) parts.push(r.dietNote);
    return parts.join(lg === 'en' ? ', ' : '、');
  }

  function rsvpWhatsAppText(r, lg) {
    var en = lg === 'en';
    var lines = [];
    lines.push(en ? '【DUDU Godparents\' Meeting · RSVP】' : '【DUDU 干爹干妈召集会 · 回复】');
    lines.push((en ? 'Name: ' : '名字：') + r.name);
    if (r.attending === 'yes') {
      lines.push(en ? 'Attending: YES ✅' : '出席：会来 ✅');
      lines.push(en
        ? 'Adults: ' + r.adults + '   Kids: ' + r.kids
        : '大人：' + r.adults + ' 位　小孩：' + r.kids + ' 位');
      var d = dietText(r, lg);
      if (d) lines.push((en ? 'Food notes: ' : '饮食：') + d);
    } else {
      lines.push(en ? 'Attending: Can\'t make it 🙏' : '出席：这次来不了 🙏');
    }
    if (r.wish) lines.push((en ? 'Message for DUDU: ' : '给 DUDU 的话：') + r.wish);
    return lines.join('\n');
  }

  function waLink(text, number) {
    var n = String(number || (P && P.host && P.host.wa) || '').replace(/\D/g, '');
    return 'https://wa.me/' + n + '?text=' + encodeURIComponent(text);
  }

  /* ---------- 日历 ---------- */
  function icsStamp(iso) {
    return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  function icsEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  }

  function calendarText(lg) {
    var en = lg === 'en';
    return {
      title: en ? 'DUDU turns ONE · Godparents\' Meeting 🎂' : '张丞鹤 DUDU 一岁生日 · 干爹干妈召集会 🎂',
      details: (en ? 'Lunch at ' + P.event.venueEn : '午餐 · ' + P.event.venueZh) + '\n' + P.event.address + '\n' + location.origin + location.pathname,
      location: P.event.venueZh + ', ' + P.event.address
    };
  }

  function googleCalUrl(lg) {
    var c = calendarText(lg);
    var params = new URLSearchParams({
      action: 'TEMPLATE',
      text: c.title,
      dates: icsStamp(P.event.start) + '/' + icsStamp(P.event.end),
      details: c.details,
      location: c.location,
      ctz: 'Asia/Kuala_Lumpur'
    });
    return 'https://calendar.google.com/calendar/render?' + params.toString();
  }

  function icsFile(lg) {
    var c = calendarText(lg);
    var body = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//DUDU//Party//ZH',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:dudu-1st-birthday-20261114@dudu-party',
      'DTSTAMP:' + icsStamp(new Date().toISOString()),
      'DTSTART:' + icsStamp(P.event.start),
      'DTEND:' + icsStamp(P.event.end),
      'SUMMARY:' + icsEscape(c.title),
      'DESCRIPTION:' + icsEscape(c.details),
      'LOCATION:' + icsEscape(c.location),
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      'DESCRIPTION:' + icsEscape(c.title),
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
    return new Blob([body], { type: 'text/calendar;charset=utf-8' });
  }

  function downloadIcs(lg) {
    var url = URL.createObjectURL(icsFile(lg));
    var a = document.createElement('a');
    a.href = url;
    a.download = 'DUDU-1st-birthday.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  }

  /* ---------- 倒数 ---------- */
  function countdown(onTick) {
    var target = new Date(P.event.start).getTime();
    function tick() {
      var ms = Math.max(0, target - Date.now());
      onTick({
        done: ms === 0,
        days: Math.floor(ms / 864e5),
        hours: Math.floor((ms % 864e5) / 36e5),
        mins: Math.floor((ms % 36e5) / 6e4),
        secs: Math.floor((ms % 6e4) / 1e3)
      });
    }
    tick();
    return setInterval(tick, 1000);
  }

  /* ---------- 彩带（canvas，自己画，不靠外部套件） ---------- */
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function confetti(opts) {
    if (reduceMotion) return;
    opts = opts || {};
    var colors = opts.colors || ['#D4AF37', '#F2D27A', '#C8102E', '#FFFFFF', '#1F7A4D'];
    var count = opts.count || 140;
    var canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999';
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = (canvas.width = innerWidth * dpr);
    var H = (canvas.height = innerHeight * dpr);
    var ox = (opts.x != null ? opts.x : 0.5) * W;
    var oy = (opts.y != null ? opts.y : 0.35) * H;
    var shapes = opts.shapes || ['rect', 'rect', 'circle', 'coin'];
    var parts = [];
    for (var i = 0; i < count; i++) {
      // spread 给了 → 往上喷的扇形；没给 → 四面八方
      var ang = opts.spread != null
        ? -Math.PI / 2 + (Math.random() - 0.5) * opts.spread
        : Math.random() * Math.PI * 2;
      var sp = (6 + Math.random() * 10) * dpr;
      parts.push({
        x: ox, y: oy,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 6 * dpr,
        w: (6 + Math.random() * 6) * dpr,
        h: (8 + Math.random() * 10) * dpr,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.35,
        c: colors[(Math.random() * colors.length) | 0],
        s: shapes[(Math.random() * shapes.length) | 0],
        life: 0
      });
    }
    var start = performance.now();
    var dur = opts.duration || 2600;
    function frame(now) {
      var t = now - start;
      ctx.clearRect(0, 0, W, H);
      parts.forEach(function (p) {
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.35 * dpr;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        var alpha = Math.max(0, 1 - Math.max(0, t - dur * 0.6) / (dur * 0.4));
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        if (p.s === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.s === 'coin') {
          ctx.beginPath();
          ctx.ellipse(0, 0, p.w * 0.75, p.w * 0.75 * Math.abs(Math.cos(p.r * 2)) + 1, 0, 0, Math.PI * 2);
          ctx.fillStyle = '#D4AF37';
          ctx.fill();
          ctx.strokeStyle = '#A8841C';
          ctx.lineWidth = dpr;
          ctx.stroke();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r)) + 1);
        }
        ctx.restore();
      });
      if (t < dur) requestAnimationFrame(frame);
      else canvas.remove();
    }
    requestAnimationFrame(frame);
  }

  /* ---------- 数字滚动 ---------- */
  function fmt(n) {
    return n >= 1000 ? n.toLocaleString('en-US') : String(n);
  }

  function countUp(el, to, ms) {
    if (!el) return;
    to = Number(to) || 0;
    if (reduceMotion || to === 0) {
      el.textContent = fmt(to);
      return;
    }
    var from = 0;
    var start = performance.now();
    ms = ms || 1200;
    function step(now) {
      var k = Math.min(1, (now - start) / ms);
      var e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  window.PartyCore = {
    mem: mem,
    lang: lang,
    setLang: setLang,
    bindLang: bindLang,
    newId: newId,
    api: api,
    dietText: dietText,
    DIET_LABEL: DIET_LABEL,
    rsvpWhatsAppText: rsvpWhatsAppText,
    waLink: waLink,
    googleCalUrl: googleCalUrl,
    downloadIcs: downloadIcs,
    countdown: countdown,
    confetti: confetti,
    countUp: countUp,
    reduceMotion: reduceMotion,
    fetchJson: fetchJson
  };
})();
