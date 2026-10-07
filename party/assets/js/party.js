/* ============================================================
   邀请函：拆信、批注、进场动画、倒数、RSVP、股权证书
   ============================================================ */
(function () {
  'use strict';

  var P = window.PARTY;
  var C = window.PartyCore;
  var $ = function (id) { return document.getElementById(id); };
  var RM = C.reduceMotion;
  var RSVP_KEY = 'dudu.rsvp';

  C.bindLang();

  /* ---------- 专属称呼 ?to=名字 ---------- */
  var params = new URLSearchParams(location.search);
  var invitedAs = (params.get('to') || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 40);
  if (invitedAs) {
    $('toName').textContent = invitedAs;
    document.title = invitedAs + ' · ' + document.title;
  }

  /* ---------- 地图 / 日历 ---------- */
  $('wazeBtn').href = P.waze;
  $('mapsBtn').href = P.maps;
  $('doneWaze').href = P.waze;
  function addToCalendar() {
    var lg = C.lang();
    // iPhone 用 .ics 直接进「日历」；其它用 Google Calendar
    if (/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document) C.downloadIcs(lg);
    else window.open(C.googleCalUrl(lg), '_blank', 'noopener');
  }
  $('calBtn').addEventListener('click', addToCalendar);
  $('doneCal').addEventListener('click', addToCalendar);

  /* ---------- 行情跑马灯：复制一份接在后面，无缝循环 ---------- */
  (function () {
    var track = $('tickerTrack');
    track.innerHTML += track.innerHTML;
  })();

  /* ============================================================
     拆信
     ============================================================ */
  var opened = false;
  function openSeal(instant) {
    if (opened) return;
    opened = true;
    var seal = $('seal');
    if (instant || RM) {
      document.body.dataset.state = 'open';
      afterOpen();
      return;
    }
    if (navigator.vibrate) {
      try { navigator.vibrate(25); } catch (e) { /* ignore */ }
    }
    seal.classList.add('opening');
    setTimeout(function () {
      document.body.dataset.state = 'open';
      window.scrollTo(0, 0);
      afterOpen();
    }, 1450);
  }

  function afterOpen() {
    $('cover').classList.add('is-on');
    var lines = document.querySelectorAll('.cover .reveal');
    lines.forEach(function (el, i) {
      setTimeout(function () { el.classList.add('is-on'); }, RM ? 0 : 150 + i * 220);
    });
    if (!RM) {
      setTimeout(function () {
        C.confetti({ count: 90, y: 0.22, spread: Math.PI * 0.9, shapes: ['rect', 'coin', 'coin', 'circle'] });
      }, 650);
    }
    setTimeout(function () { $('stickyRsvp').classList.add('show'); updateSticky(); }, 1200);
  }

  $('openBtn').addEventListener('click', function () { openSeal(false); });
  if (params.get('open') === '1') openSeal(true);

  /* ============================================================
     分析师批注（一次只显示一条，圆圈全部留着；点圆圈可重看）
     ============================================================ */
  var NOTES = [
    { x: 320, y: 492, zh: '防狗仔墨镜：想投资的人太多，必须低调', en: 'Anti-paparazzi shades. Too many investors.' },
    { x: 196, y: 503, zh: '推墨镜 = 「这份报告，拿回去重做」', en: 'The shades push = "Redo this report."' },
    { x: 302, y: 574, zh: '年度致辞进行中：「啊——」', en: 'Keynote speech in progress: "Ah—"' },
    { x: 240, y: 756, zh: '公司座驾：单人前座，爸爸驱动', en: 'Company car: one seat, dad-powered.' },
    { x: 366, y: 1030, zh: '公司核心资产：一掉地上，全公司停工', en: 'Core asset. Drop it and operations halt.' },
    { x: 322, y: 300, zh: '风水布局：全场大红，huat ah!', en: 'Feng shui: maximum red. Huat ah!' },
    { x: 497, y: 128, zh: '专业保镖表情：零情绪，零睡眠', en: 'Pro bodyguard face. Zero emotion. Zero sleep.', zoom: true }
  ];
  var W0 = 607;
  var H0 = 1080;
  var notesEl = $('notes');
  var frame = $('photoFrame');
  var arrowPath = $('noteArrowPath');
  var current = -1;
  var playing = false;
  var timers = [];

  NOTES.forEach(function (n, i) {
    var t = document.createElement('button');
    t.type = 'button';
    t.className = 'note-target';
    t.style.left = (n.x / W0 * 100) + '%';
    t.style.top = (n.y / H0 * 100) + '%';
    t.setAttribute('aria-label', n.zh + ' / ' + n.en);
    t.dataset.i = i;
    notesEl.appendChild(t);

    var l = document.createElement('div');
    l.className = 'note-label';
    l.innerHTML = '<span class="zh"></span><span class="en"></span>';
    l.querySelector('.zh').textContent = n.zh;
    l.querySelector('.en').textContent = n.en;
    l.style.setProperty('--rot', (i % 2 ? 2 : -2) + 'deg');
    l.setAttribute('aria-hidden', 'true');
    notesEl.appendChild(l);
    n.target = t;
    n.label = l;
  });

  function placeLabel(n) {
    var fw = frame.clientWidth;
    var fh = frame.clientHeight;
    var tx = n.x / W0 * fw;
    var ty = n.y / H0 * fh;
    var l = n.label;
    l.style.left = '0px';
    l.style.top = '0px';
    var lw = l.offsetWidth;
    var lh = l.offsetHeight;
    var gap = Math.max(34, fh * 0.06);
    // 先试上方，放不下就放下方
    var above = ty - gap - lh >= 6;
    var top = above ? ty - gap - lh : Math.min(fh - lh - 6, ty + gap);
    var left = Math.max(6, Math.min(fw - lw - 6, tx - lw / 2));
    l.style.left = left + 'px';
    l.style.top = top + 'px';
    l.classList.toggle('left', tx < left + lw / 2);
    l.classList.toggle('right', tx >= left + lw / 2);

    // 箭头：从标签边缘画到红圈边缘，带一点弧度
    var sx = Math.max(left + 14, Math.min(left + lw - 14, tx + (tx < fw / 2 ? 18 : -18)));
    var sy = above ? top + lh + 2 : top - 2;
    var r = 17;
    var dx = tx - sx;
    var dy = ty - sy;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var ex = tx - dx / dist * r;
    var ey = ty - dy / dist * r;
    var cx = (sx + ex) / 2 + (dy / dist) * 14;
    var cy = (sy + ey) / 2 - (dx / dist) * 14;
    // 箭头头部
    var ang = Math.atan2(ey - cy, ex - cx);
    var h1x = ex - 10 * Math.cos(ang - 0.45);
    var h1y = ey - 10 * Math.sin(ang - 0.45);
    var h2x = ex - 10 * Math.cos(ang + 0.45);
    var h2y = ey - 10 * Math.sin(ang + 0.45);
    $('noteArrow').setAttribute('viewBox', '0 0 ' + fw + ' ' + fh);
    arrowPath.setAttribute('d',
      'M' + sx.toFixed(1) + ' ' + sy.toFixed(1) +
      ' Q' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + ex.toFixed(1) + ' ' + ey.toFixed(1) +
      ' M' + h1x.toFixed(1) + ' ' + h1y.toFixed(1) + ' L' + ex.toFixed(1) + ' ' + ey.toFixed(1) + ' L' + h2x.toFixed(1) + ' ' + h2y.toFixed(1));
  }

  function showNote(i) {
    NOTES.forEach(function (n) { n.label.classList.remove('on'); });
    arrowPath.classList.remove('on');
    current = i;
    if (i < 0) return;
    var n = NOTES[i];
    n.target.classList.add('on');
    placeLabel(n);
    var len = 0;
    try { len = Math.ceil(arrowPath.getTotalLength()); } catch (e) { len = 200; }
    arrowPath.style.setProperty('--len', len);
    // 先收回再画
    arrowPath.getBoundingClientRect();
    requestAnimationFrame(function () {
      arrowPath.classList.add('on');
      setTimeout(function () { n.label.classList.add('on'); }, RM ? 0 : 260);
    });
    $('noteCounter').textContent = (i + 1) + ' / ' + NOTES.length;
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function zoomDad() {
    var z = $('photoZoom');
    notesEl.style.opacity = '0';
    $('noteArrow').style.opacity = '0';
    z.classList.add('zoom-dad');
    timers.push(setTimeout(function () {
      z.classList.remove('zoom-dad');
      timers.push(setTimeout(function () {
        notesEl.style.opacity = '';
        $('noteArrow').style.opacity = '';
        playing = false;
      }, 1200));
    }, 2700));
  }

  function playNotes() {
    clearTimers();
    playing = true;
    NOTES.forEach(function (n) { n.target.classList.remove('on'); });
    showNote(-1);
    var step = RM ? 1600 : 2300;
    NOTES.forEach(function (n, i) {
      timers.push(setTimeout(function () {
        showNote(i);
        if (n.zoom && !RM) timers.push(setTimeout(zoomDad, 1700));
        else if (i === NOTES.length - 1) playing = false;
      }, 400 + i * step));
    });
  }

  notesEl.addEventListener('click', function (e) {
    var t = e.target.closest('.note-target');
    if (!t) return;
    clearTimers();
    playing = false;
    $('photoZoom').classList.remove('zoom-dad');
    notesEl.style.opacity = '';
    $('noteArrow').style.opacity = '';
    showNote(Number(t.dataset.i));
  });
  $('replayNotes').addEventListener('click', playNotes);
  window.addEventListener('resize', function () { if (current >= 0) placeLabel(NOTES[current]); });
  document.addEventListener('langchange', function () { if (current >= 0) setTimeout(function () { placeLabel(NOTES[current]); }, 0); });

  /* ============================================================
     进场动画（IntersectionObserver）
     ============================================================ */
  var seen = new WeakSet();
  function onEnter(el, fn, threshold) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && !seen.has(en.target)) {
          seen.add(en.target);
          io.disconnect();
          fn();
        }
      });
    }, { threshold: threshold || 0.25 });
    io.observe(el);
  }

  function whenOpen(fn) {
    if (document.body.dataset.state === 'open') fn();
    else {
      var mo = new MutationObserver(function () {
        if (document.body.dataset.state === 'open') {
          mo.disconnect();
          fn();
        }
      });
      mo.observe(document.body, { attributes: true, attributeFilter: ['data-state'] });
    }
  }

  whenOpen(function () {
    onEnter(frame, playNotes, 0.45);

    document.querySelectorAll('main .reveal').forEach(function (el) {
      if (el.closest('.cover')) return;
      onEnter(el, function () { el.classList.add('is-on'); }, 0.2);
    });

    onEnter($('facts'), function () { $('facts').classList.add('is-on'); }, 0.4);

    document.querySelectorAll('.kpi').forEach(function (k, i) {
      onEnter(k, function () {
        setTimeout(function () {
          k.classList.add('is-on');
          if (k.dataset.kpi === 'age') runAge();
          if (k.dataset.kpi === 'diapers') C.countUp($('diaperVal'), 2000, 1400);
        }, (i % 2) * 120);
      }, 0.3);
    });

    document.querySelectorAll('.badge').forEach(function (b, i) {
      onEnter(b, function () { setTimeout(function () { b.classList.add('is-on'); }, i * 150); }, 0.3);
    });

    onEnter($('closing'), function () { $('closing').classList.add('is-on'); }, 0.3);
    onEnter($('rsvpForm'), function () { $('rsvpForm').classList.add('is-on'); }, 0.3);
  });

  // 年龄 KPI：0 → 100% → 999% → 9,999% → ∞
  function runAge() {
    var el = $('ageVal');
    if (RM) { el.textContent = '+∞%'; return; }
    var seq = ['+0%', '+12%', '+100%', '+365%', '+999%', '+4,321%', '+9,999%', '+#!@%', '+∞%'];
    seq.forEach(function (v, i) {
      setTimeout(function () {
        el.textContent = v;
        if (v === '+∞%') {
          el.style.transition = 'transform .4s cubic-bezier(.34,1.56,.64,1)';
          el.style.transform = 'scale(1.35)';
          setTimeout(function () { el.style.transform = ''; }, 380);
          el.style.color = 'var(--gold-deep)';
        }
      }, i * 170);
    });
  }

  // 议程：金线跟着滑动往下画，到哪勾到哪
  (function () {
    var list = $('agenda');
    var items = list.querySelectorAll('li');
    var ticking = false;
    function update() {
      ticking = false;
      var r = list.getBoundingClientRect();
      var vh = window.innerHeight;
      var p = Math.max(0, Math.min(1, (vh * 0.7 - r.top) / r.height));
      list.style.setProperty('--fill', (p * 100).toFixed(1) + '%');
      items.forEach(function (li) {
        var lr = li.getBoundingClientRect();
        li.classList.toggle('is-on', lr.top + 10 < r.top + r.height * p);
      });
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    whenOpen(update);
  })();

  // 保镖：点了只会抖，情绪永远 0%
  (function () {
    var b = $('dadBadge');
    var n = 0;
    var meterZh = ['情绪波动：0%', '情绪波动：0%（再点也一样）', '情绪波动：0.0%', '保镖不接受采访。情绪波动：0%'];
    var meterEn = ['Emotional fluctuation: 0%', 'Emotional fluctuation: 0% (still)', 'Emotional fluctuation: 0.0%', 'Security does not give interviews. 0%'];
    function poke() {
      b.classList.remove('shake');
      void b.offsetWidth;
      b.classList.add('shake');
      n = (n + 1) % meterZh.length;
      $('dadMeter').innerHTML = '<span class="zh"></span><span class="en"></span>';
      $('dadMeter').querySelector('.zh').textContent = meterZh[n];
      $('dadMeter').querySelector('.en').textContent = meterEn[n];
    }
    b.addEventListener('click', poke);
    b.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); poke(); }
    });
  })();

  /* ============================================================
     附件 B · 董事长工作照
     ============================================================ */
  var GALLERY = [
    { src: 'shark', pos: '50% 62%', tagZh: '风险承受能力 <b class="up">▲ 满分</b>', tagEn: 'Risk appetite <b class="up">▲ MAX</b>',
      zh: '市场大鳄来袭。董事长：就这？', en: 'A market shark attacks. The CEO: "That\'s it?"' },
    { src: 'lunch', pos: '32% 44%', tagZh: '耐心指数 <b class="down">▼ 跌停</b>', tagEn: 'Patience <b class="down">▼ LIMIT DOWN</b>',
      zh: '听说午餐要 12 点才开。董事长：……', en: 'Told lunch starts at 12. The CEO: "…"' },
    { src: 'kipas', pos: '55% 42%', tagZh: '成本控制 <b class="up">✓ 达标</b>', tagEn: 'Cost control <b class="up">✓ ON TARGET</b>',
      zh: '亲自检查总部冷气系统：确认只开 kipas', en: 'Inspecting HQ air-con in person. Confirmed: kipas only.' },
    { src: 'landbank', pos: '45% 68%', tagZh: '土地储备 <b class="up">▲ 扩张中</b>', tagEn: 'Land bank <b class="up">▲ EXPANDING</b>',
      zh: '考察麻坡土地储备：这片草，我要了', en: 'Land-bank inspection. This patch of grass? Mine.' },
    { src: 'chopper', pos: '42% 28%', tagZh: '交通工具：人肉直升机', tagEn: 'Transport: human chopper',
      zh: '高空视察业务。坐骑表情管理：失败', en: 'Aerial site inspection. The ride\'s poker face: failed.' },
    { src: 'retreat', pos: '52% 62%', tagZh: '今日 KPI：放空', tagEn: 'Today\'s KPI: zoning out',
      zh: '董事会户外静修。会议议程：发呆', en: 'Board off-site retreat. Agenda: staring into the jungle.' },
    { src: 'board', pos: '30% 56%', tagZh: '表决结果 <b class="up">全票通过</b>', tagEn: 'Vote <b class="up">UNANIMOUS</b>',
      zh: '家族董事会：资深董事坐镇，董事长笑得最大声', en: 'Family board meeting. Senior director presiding; the CEO laughs loudest.' }
  ];

  (function () {
    var reel = $('reel');
    var dots = $('reelDots');
    GALLERY.forEach(function (g, i) {
      var fig = document.createElement('figure');
      fig.className = 'snap';
      fig.setAttribute('role', 'listitem');
      fig.style.setProperty('--tilt', (i % 2 ? 2 : -2) + 'deg');
      fig.innerHTML =
        '<button type="button" class="snap-btn" data-i="' + i + '">' +
          '<span class="snap-photo"><img loading="lazy" decoding="async" src="assets/img/gallery/' + g.src + '.jpg" alt="" style="object-position:' + g.pos + '" />' +
          '<span class="snap-tag"><span class="zh">' + g.tagZh + '</span><span class="en">' + g.tagEn + '</span></span></span>' +
          '<span class="snap-cap"><span class="zh"></span><span class="en"></span></span>' +
        '</button>';
      fig.querySelector('.snap-cap .zh').textContent = g.zh;
      fig.querySelector('.snap-cap .en').textContent = g.en;
      fig.querySelector('img').alt = g.zh + ' / ' + g.en;
      reel.appendChild(fig);
      dots.appendChild(document.createElement('i'));
    });

    var figs = reel.querySelectorAll('.snap');
    function updateDots() {
      var mid = reel.scrollLeft + reel.clientWidth / 2;
      var best = 0;
      var bestD = Infinity;
      figs.forEach(function (f, i) {
        var d = Math.abs(f.offsetLeft + f.offsetWidth / 2 - mid);
        if (d < bestD) { bestD = d; best = i; }
      });
      dots.querySelectorAll('i').forEach(function (d, i) { d.classList.toggle('on', i === best); });
    }
    reel.addEventListener('scroll', function () { requestAnimationFrame(updateDots); }, { passive: true });
    updateDots();

    whenOpen(function () {
      onEnter(reel, function () {
        figs.forEach(function (f, i) { setTimeout(function () { f.classList.add('is-on'); }, RM ? 0 : i * 110); });
        if (!RM) setTimeout(function () { reel.classList.add('hint'); }, 700);
      }, 0.25);
    });

    /* ---- 大图 ---- */
    var lb = $('lightbox');
    var idx = 0;
    var lastFocus = null;
    function render(i, animate) {
      idx = (i + GALLERY.length) % GALLERY.length;
      var g = GALLERY[idx];
      var img = $('lbImg');
      img.src = 'assets/img/gallery/' + g.src + '.jpg';
      img.alt = g.zh + ' / ' + g.en;
      $('lbTag').innerHTML = '<span class="zh">' + g.tagZh + '</span><span class="en">' + g.tagEn + '</span>';
      $('lbCap').innerHTML = '<span class="zh"></span><span class="en"></span>';
      $('lbCap').querySelector('.zh').textContent = g.zh;
      $('lbCap').querySelector('.en').textContent = g.en;
      $('lbCount').textContent = (idx + 1) + ' / ' + GALLERY.length;
      if (animate && !RM) {
        img.classList.remove('swap');
        void img.offsetWidth;
        img.classList.add('swap');
      }
    }
    function open(i) {
      lastFocus = document.activeElement;
      render(i, false);
      lb.hidden = false;
      document.body.classList.add('lb-open');
      $('lbClose').focus();
    }
    function close() {
      lb.hidden = true;
      document.body.classList.remove('lb-open');
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
    reel.addEventListener('click', function (e) {
      var b = e.target.closest('.snap-btn');
      if (b) open(Number(b.dataset.i));
    });
    $('lbClose').addEventListener('click', close);
    $('lbPrev').addEventListener('click', function () { render(idx - 1, true); });
    $('lbNext').addEventListener('click', function () { render(idx + 1, true); });
    lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') render(idx - 1, true);
      if (e.key === 'ArrowRight') render(idx + 1, true);
    });
    // 左右滑动换张
    var sx = null;
    var sy = null;
    lb.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (sx === null) return;
      var dx = e.changedTouches[0].clientX - sx;
      var dy = e.changedTouches[0].clientY - sy;
      sx = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) render(idx + (dx < 0 ? 1 : -1), true);
    }, { passive: true });
  })();

  /* ---------- 倒数 ---------- */
  C.countdown(function (t) {
    $('cdDays').textContent = String(t.days);
    $('cdHours').textContent = String(t.hours).padStart(2, '0');
    $('cdMins').textContent = String(t.mins).padStart(2, '0');
  });

  /* ---------- 底部胶囊：看到回执区就收起来 ---------- */
  var rsvpVisible = false;
  function updateSticky() {
    var s = $('stickyRsvp');
    if (document.body.dataset.state !== 'open') return;
    s.classList.toggle('show', !rsvpVisible);
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) {
      rsvpVisible = en[0].isIntersecting;
      updateSticky();
    }, { rootMargin: '0px 0px -20% 0px' }).observe($('rsvp'));
  }

  /* ============================================================
     RSVP
     ============================================================ */
  var form = $('rsvpForm');
  var saved = C.mem.get(RSVP_KEY, null); // { id, data }
  var rsvpId = (saved && saved.id) || C.newId();
  var counts = { adults: 1, kids: 0 };

  if (P.rsvpBy) {
    $('rsvpBy').innerHTML = '<span class="zh"></span><span class="en"></span>';
    $('rsvpBy').querySelector('.zh').textContent = '请在 ' + P.rsvpByZh + ' 前交回执，保镖要订餐。';
    $('rsvpBy').querySelector('.en').textContent = 'Please reply by ' + P.rsvpByEn + ' so Security can order the food.';
  }

  // 公开人数（拿不到就不显示）
  function showLive(s) {
    if (!s || !s.groups) return;
    $('liveCount').hidden = false;
    C.countUp($('liveGroups'), s.groups);
    C.countUp($('livePeople'), s.people);
    C.countUp($('liveGroupsEn'), s.groups);
    C.countUp($('livePeopleEn'), s.people);
  }
  C.api.summary().then(showLive);

  function attending() {
    var r = form.querySelector('[name="attending"]:checked');
    return r ? r.value : '';
  }

  function setCount(key, v, bump) {
    var min = key === 'adults' ? 1 : 0;
    v = Math.max(min, Math.min(20, v));
    counts[key] = v;
    var out = $(key + 'Out');
    out.textContent = String(v);
    $(key === 'adults' ? 'rAdults' : 'rKids').value = String(v);
    if (bump && !RM) {
      out.classList.remove('bump');
      void out.offsetWidth;
      out.classList.add('bump');
    }
    form.querySelector('[data-step="' + key + ':-1"]').disabled = v <= min;
    form.querySelector('[data-step="' + key + ':+1"]').disabled = v >= 20;
    var total = counts.adults + counts.kids;
    $('headcount').innerHTML = '<span class="zh"></span><span class="en"></span>';
    $('headcount').querySelector('.zh').textContent = '合共 ' + total + ' 位股东出席';
    $('headcount').querySelector('.en').textContent = total + (total === 1 ? ' shareholder' : ' shareholders') + ' attending';
  }

  function syncMode() {
    var a = attending();
    form.querySelector('.yes-only').hidden = a !== 'yes';
    form.querySelector('[data-when="yes"]').hidden = a === 'no';
    form.querySelector('[data-when="no"]').hidden = a !== 'no';
    var wish = $('rWish');
    var lg = C.lang();
    wish.placeholder = a === 'no'
      ? (lg === 'en' ? 'e.g. Happy birthday DUDU! Save me a slice of cake.' : '例：DUDU 生日快乐！蛋糕帮我留一块。')
      : (lg === 'en' ? 'e.g. Boss, remember me when you\'re rich!' : '例：董事长，发达了别忘记我！');
  }

  function syncDietNote() {
    var on = form.querySelector('[name="diet"][value="allergy"]').checked;
    var note = $('rDietNote');
    note.hidden = !on;
    note.placeholder = C.lang() === 'en' ? 'Please specify, e.g. peanuts' : '请注明，例：花生、海鲜';
  }

  function setPlaceholders() {
    var en = C.lang() === 'en';
    $('rName').placeholder = en ? "e.g. Ah Ming's family" : '例：阿明一家';
    syncMode();
    syncDietNote();
    setCount('adults', counts.adults);
  }

  form.addEventListener('click', function (e) {
    var b = e.target.closest('[data-step]');
    if (!b) return;
    var parts = b.getAttribute('data-step').split(':');
    setCount(parts[0], counts[parts[0]] + Number(parts[1]), true);
  });
  form.addEventListener('change', function (e) {
    if (e.target.name === 'attending') {
      syncMode();
      clearError('f-attending');
    }
    if (e.target.name === 'diet') syncDietNote();
  });
  $('rName').addEventListener('input', function () { clearError('f-name'); });
  document.addEventListener('langchange', setPlaceholders);

  function setError(id) { $(id).classList.add('error'); }
  function clearError(id) { $(id).classList.remove('error'); }

  function fill(d) {
    $('rName').value = d.name || '';
    form.querySelectorAll('[name="attending"]').forEach(function (r) { r.checked = r.value === d.attending; });
    setCount('adults', d.adults || 1);
    setCount('kids', d.kids || 0);
    form.querySelectorAll('[name="diet"]').forEach(function (c) { c.checked = (d.diet || []).indexOf(c.value) !== -1; });
    $('rDietNote').value = d.dietNote || '';
    $('rWish').value = d.wish || '';
    syncMode();
    syncDietNote();
  }

  function collect() {
    var a = attending();
    return {
      id: rsvpId,
      name: $('rName').value.trim(),
      attending: a,
      adults: a === 'yes' ? counts.adults : 0,
      kids: a === 'yes' ? counts.kids : 0,
      diet: a === 'yes' ? Array.prototype.map.call(form.querySelectorAll('[name="diet"]:checked'), function (c) { return c.value; }) : [],
      dietNote: a === 'yes' && form.querySelector('[name="diet"][value="allergy"]').checked ? $('rDietNote').value.trim() : '',
      wish: $('rWish').value.trim(),
      invitedAs: invitedAs,
      lang: C.lang(),
      website: form.querySelector('[name="website"]').value
    };
  }

  function busy(on) {
    $('rsvpSubmit').disabled = on;
    form.querySelector('[data-when="busy"]').hidden = !on;
    if (on) {
      form.querySelector('[data-when="yes"]').hidden = true;
      form.querySelector('[data-when="no"]').hidden = true;
    } else syncMode();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    $('formMsg').textContent = '';
    var d = collect();
    var bad = false;
    if (!d.name) { setError('f-name'); bad = true; }
    if (!d.attending) { setError('f-attending'); bad = true; }
    if (bad) {
      var first = form.querySelector('.field.error');
      if (first) first.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'center' });
      if (!d.name) $('rName').focus({ preventScroll: true });
      return;
    }

    busy(true);
    var waText = C.rsvpWhatsAppText(d, d.lang);
    var waUrl = C.waLink(waText);
    C.api.submit(d).then(function (res) {
      busy(false);
      if (res.ok) {
        saved = { id: rsvpId, data: d, at: Date.now(), sent: true };
        C.mem.set(RSVP_KEY, saved);
        showDone(d, false);
        if (res.data && res.data.summary) showLive(res.data.summary);
        return;
      }
      if (res.invalid) {
        if (res.fields.name) setError('f-name');
        if (res.fields.attending) setError('f-attending');
        $('formMsg').textContent = C.lang() === 'en' ? 'Please check the form.' : '请检查一下表格。';
        return;
      }
      // 没接存储 / 断网 → WhatsApp
      saved = { id: rsvpId, data: d, at: Date.now(), sent: false };
      C.mem.set(RSVP_KEY, saved);
      $('waLink').href = waUrl;
      showDone(d, true);
      // 试着直接打开 WhatsApp；手机浏览器常会拦掉非点击当下开的视窗，所以画面上一定有按钮
      window.open(waUrl, '_blank', 'noopener');
    });
  });

  /* ---------- 成功画面 ---------- */
  function shareNo(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    var n = 1 + (h % 888);
    return ('00' + n).slice(-3);
  }

  function showDone(d, fallback) {
    var yes = d.attending === 'yes';
    var en = C.lang() === 'en';
    form.hidden = true;
    $('rsvpDone').hidden = false;
    $('rsvpFallback').hidden = !fallback;

    var cert = $('cert');
    cert.classList.toggle('no-cert', !yes);
    var T = {
      kicker: en ? 'DUDU HOLDINGS BERHAD · No. ' + shareNo(rsvpId) : '丞鹤控股 · 股东编号 No. ' + shareNo(rsvpId),
      title: yes ? (en ? 'Godparent Share Certificate' : '干爹干妈股权证书') : (en ? 'Proxy Certificate' : '委任代表书'),
      body: yes
        ? (en ? 'This certifies that the above is now a Founding Godparent-Shareholder of DUDU Holdings Berhad.' : '兹证明以上股东已正式入股丞鹤控股，成为张丞鹤 DUDU 的创始干爹干妈。')
        : (en ? 'Proxy appointed: your good wishes (registered). Behind the shades the CEO is a tiny bit hurt, but totally understands. Your shares are safe forever — catch you at the next meeting!' : '代理出席：你的祝福（已登记）。董事长墨镜后面的眼神有一点点受伤，但完全理解。你的股份永久保留，下次补开会！'),
      meta: yes
        ? (en ? 'Report to: Sat 14 Nov 2026, 12:00 PM · ' + P.event.venueEn + ' · ' + P.event.address : '报到：2026年11月14日（星期六）中午12:00 · ' + P.event.venueZh + ' · ' + P.event.address)
        : (en ? 'Valuation: priceless' : '估值：无价'),
      stamp: fallback ? (en ? 'PENDING · WhatsApp' : '待发 WhatsApp') : yes ? (en ? 'APPROVED' : '核准 · 入股') : (en ? 'PROXY' : '代理 · 已登记'),
      tip: fallback
        ? ''
        : yes
          ? (en ? 'Screenshot this! Show it at the door for the VIP lane (there is no queue).' : '截图保存！当天出示可走 VIP 通道（其实没人排队）。')
          : (en ? 'Wilson has your reply. Thank you!' : 'Wilson 已经收到你的回执，谢谢！')
    };
    $('certKicker').textContent = T.kicker;
    $('certTitle').textContent = T.title;
    $('certBody').textContent = T.body;
    $('certMeta').textContent = T.meta;
    $('certStamp').textContent = T.stamp;
    $('certStamp').style.borderColor = yes ? '' : '#2C5AA0';
    $('certStamp').style.color = yes ? '' : '#2C5AA0';
    $('doneTip').textContent = T.tip;

    var units = $('certUnits');
    units.innerHTML = '';
    if (yes) {
      [
        en ? d.adults + ' major (adult' + (d.adults > 1 ? 's' : '') + ')' : '大股东（大人）× ' + d.adults,
        en ? d.kids + ' minor (kid' + (d.kids === 1 ? '' : 's') + ')' : '小股东（小孩）× ' + d.kids
      ].forEach(function (t) {
        var s = document.createElement('span');
        s.textContent = t;
        units.appendChild(s);
      });
    }

    // 名字一个字一个字打出来
    var nameEl = $('certName');
    nameEl.textContent = '';
    var chars = Array.from(d.name);
    if (RM) nameEl.textContent = d.name;
    else chars.forEach(function (ch, i) { setTimeout(function () { nameEl.textContent += ch; }, 350 + i * 70); });

    cert.classList.remove('is-on');
    void cert.offsetWidth;
    cert.classList.add('is-on');
    $('rsvp').scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
    setTimeout(function () { cert.focus({ preventScroll: true }); }, 400);

    if (yes && !RM) {
      setTimeout(function () {
        C.confetti({ count: 150, y: 0.45, shapes: ['coin', 'coin', 'rect', 'circle'] });
        document.body.animate && document.body.animate(
          [{ transform: 'translate(0,0)' }, { transform: 'translate(-3px,2px)' }, { transform: 'translate(2px,-2px)' }, { transform: 'translate(0,0)' }],
          { duration: 220 }
        );
      }, 850);
    }
  }

  $('rsvpEdit').addEventListener('click', function () {
    form.hidden = false;
    $('rsvpDone').hidden = true;
    if (saved && saved.data) fill(saved.data);
    form.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
  });

  $('rsvpAnother').addEventListener('click', function () {
    rsvpId = C.newId();
    saved = null;
    C.mem.del(RSVP_KEY);
    fill({ name: '', attending: '', adults: 1, kids: 0, diet: [], wish: '' });
    form.querySelectorAll('[name="attending"]').forEach(function (r) { r.checked = false; });
    syncMode();
    form.hidden = false;
    $('rsvpDone').hidden = true;
    $('rName').focus();
  });

  /* ---------- 开始 ---------- */
  setCount('adults', 1);
  setCount('kids', 0);
  setPlaceholders();
  if (saved && saved.data) {
    fill(saved.data);
    showDoneQuiet(saved.data, saved.sent === false);
  } else if (invitedAs) {
    $('rName').value = invitedAs;
  }

  function showDoneQuiet(d, fallback) {
    // 再次打开时：直接显示上次的证书（不放彩带、不卷动）
    var keepRM = RM;
    RM = true;
    showDone(d, fallback);
    if (fallback) $('waLink').href = C.waLink(C.rsvpWhatsAppText(d, d.lang));
    RM = keepRM;
    window.scrollTo(0, 0);
  }
})();
