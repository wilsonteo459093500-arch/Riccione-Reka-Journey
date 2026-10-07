/* ============================================================
   邀请函：拆信、上市牌、照片披露、通告、相册、决议、RSVP、页尾
   ============================================================ */
(function () {
  'use strict';

  var P = window.PARTY;
  var C = window.PartyCore;
  var $ = function (id) { return document.getElementById(id); };
  var RM = C.reduceMotion;
  var RSVP_KEY = 'dudu.rsvp';
  var SITE = (P.siteUrl || location.origin).replace(/\/$/, '') + '/';

  C.bindLang();

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /** 中英两个 span，textContent 写入（不经过 innerHTML）。 */
  function bi(target, zh, en) {
    target.textContent = '';
    target.appendChild(el('span', 'zh', zh));
    target.appendChild(el('span', 'en', en));
  }

  function toast(msg) {
    var t = $('toast');
    if (!t) {
      t = el('div', 'toast');
      t.id = 'toast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      t.style.cssText = 'position:fixed;left:50%;bottom:calc(76px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:95;background:#0E1A2B;color:#fff;padding:10px 18px;border-radius:999px;font:600 14px/1.3 var(--sans);box-shadow:0 8px 20px rgba(0,0,0,.3);opacity:0;transition:opacity .2s;pointer-events:none;max-width:calc(100% - 32px);text-align:center';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.style.opacity = '0'; }, 2000);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  /* ---------- 专属称呼 ?to=名字 ---------- */
  var params = new URLSearchParams(location.search);
  var invitedAs = (params.get('to') || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 40);
  if (invitedAs) {
    $('toName').textContent = invitedAs;
    document.title = invitedAs + ' · ' + document.title;
  }

  /* ---------- 地图 / 日历 / 复制地址 / 转发 ---------- */
  $('wazeBtn').href = P.waze;
  $('mapsBtn').href = P.maps;
  $('doneWaze').href = P.waze;
  function addToCalendar() {
    var lg = C.lang();
    // iPhone / iPad 用 .ics 直接进「日历」；其它用 Google Calendar
    if (/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document) C.downloadIcs(lg);
    else window.open(C.googleCalUrl(lg), '_blank', 'noopener');
  }
  $('calBtn').addEventListener('click', addToCalendar);
  $('doneCal').addEventListener('click', addToCalendar);
  $('copyAddr').addEventListener('click', function () {
    copyText(P.event.venueZh + ', ' + P.event.address).then(function (ok) {
      toast(ok ? (C.lang() === 'en' ? 'Address copied' : '已复制地址') : (C.lang() === 'en' ? 'Copy failed' : '复制失败，请手动选取'));
    });
  });
  function updateForward() {
    $('fwdBtn').href = 'https://wa.me/?text=' + encodeURIComponent(C.inviteText('', C.lang(), SITE));
  }
  updateForward();
  document.addEventListener('langchange', updateForward);

  /* ---------- 行情跑马灯：复制一份接在后面，无缝循环 ---------- */
  (function () {
    var track = $('tickerTrack');
    track.innerHTML += track.innerHTML;
  })();

  /* ============================================================
     进场工具
     ============================================================ */
  function onEnter(target, fn, threshold) {
    if (!target) return;
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var done = false;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && !done) {
          done = true;
          io.disconnect();
          fn();
        }
      });
    }, { threshold: threshold || 0.25 });
    io.observe(target);
  }

  function whenOpen(fn) {
    if (document.body.dataset.state === 'open') { fn(); return; }
    var mo = new MutationObserver(function () {
      if (document.body.dataset.state === 'open') {
        mo.disconnect();
        fn();
      }
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['data-state'] });
  }

  /* ============================================================
     拆信
     ============================================================ */
  var opened = false;
  function openSeal(instant) {
    if (opened) return;
    opened = true;
    if (instant || RM) {
      document.body.dataset.state = 'open';
      afterOpen();
      return;
    }
    if (navigator.vibrate) {
      try { navigator.vibrate(25); } catch (e) { /* ignore */ }
    }
    $('seal').classList.add('opening');
    setTimeout(function () {
      document.body.dataset.state = 'open';
      window.scrollTo(0, 0);
      afterOpen();
    }, 1450);
  }

  function afterOpen() {
    $('cover').classList.add('is-on');
    document.querySelectorAll('.cover .reveal').forEach(function (e, i) {
      setTimeout(function () { e.classList.add('is-on'); }, RM ? 0 : 150 + i * 200);
    });
    setTimeout(runPriceBoard, RM ? 0 : 1100);
    if (!RM) {
      setTimeout(function () {
        C.confetti({ count: 90, y: 0.22, spread: Math.PI * 0.9, shapes: ['rect', 'coin', 'coin', 'circle'] });
      }, 650);
    }
    setTimeout(function () { stickyAllowed = true; updateSticky(); }, RM ? 0 : 1600);
  }

  $('openBtn').addEventListener('click', function () { openSeal(false); });
  if (params.get('open') === '1') openSeal(true);

  /* ---------- 股价牌：0.00 → 1.00，涨幅一路飙到 ∞ ---------- */
  function runPriceBoard() {
    var price = $('pbPrice');
    var chg = $('pbChg');
    if (RM) { price.textContent = '1.00'; chg.textContent = '▲ +∞%'; return; }
    var start = performance.now();
    (function step(now) {
      var k = Math.min(1, (now - start) / 1400);
      var e = k >= 1 ? 1 : 1 - Math.pow(2, -10 * k);
      price.textContent = e.toFixed(2);
      if (k < 1) requestAnimationFrame(step);
    })(start);
    var seq = ['▲ +0%', '▲ +100%', '▲ +999%', '▲ +9,999%', '▲ +#@!%', '▲ +∞%'];
    seq.forEach(function (v, i) {
      setTimeout(function () {
        chg.textContent = v;
        chg.classList.toggle('glitch', v === '▲ +#@!%');
        if (v === '▲ +∞%' && chg.animate) {
          chg.animate([{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        }
      }, 200 + i * 230);
    });
  }

  /* ============================================================
     董事会官方合照：聚光灯 → 保镖登场 → 7 条披露 → Deal with it
     ============================================================ */
  var NOTES = [
    { x: 300, y: 85, place: 'below', pillZh: '中央冷气（风扇）', pillEn: 'Central aircon (kipas)',
      zh: '总部中央冷气系统。成本控制中，只开风扇。', en: 'HQ central air-conditioning. Cost-cutting mode: kipas only.' },
    { x: 240, y: 755, place: 'below', pillZh: '人肉版 Alphard', pillEn: 'Dad-powered Alphard',
      zh: '公司座驾：人肉版 Alphard。单人前座，靠 kopi 驱动。', en: 'Company car: a Dad-powered Alphard. One seat, front-mounted. Runs on kopi.' },
    { x: 365, y: 1030, place: 'above', pillZh: '公司印章', pillEn: 'The Company Chop',
      zh: '公司印章（Company Chop）：重要文件一律用嘴盖。一掉地上，全公司停工。', en: 'The Company Chop: all official documents are sealed by mouth. If it\'s dropped, all operations halt.' },
    { x: 322, y: 455, place: 'above', pillZh: '防狗仔墨镜', pillEn: 'Anti-paparazzi shades', glint: true,
      zh: '防狗仔墨镜：想投资的人太多，必须低调。', en: 'Anti-paparazzi shades. Too many investors. Must stay low-key.' },
    { x: 198, y: 505, place: 'above', pillZh: '「这份报告，重做。」', pillEn: '"Redo this report."',
      zh: '推墨镜 ＝「这份报告，拿回去重做。」', en: 'The shades push. Translation: "Redo this report."' },
    { x: 302, y: 575, place: 'below', pillZh: '「估值就这样？」', pillEn: '"That\'s the valuation?"',
      zh: '董事长年度致辞：「哦？估值就这样而已？」', en: 'The Boss\'s keynote address: "Oh? That\'s your valuation?"' },
    { x: 500, y: 150, place: 'below', pillZh: '情绪波动：0%', pillEn: 'Emotional range: 0%', dad: true,
      zh: '首席背娃官 Wilson（兼保镖、司机、公司秘书）。上班时间，禁止微笑。内心：「千万别哭，千万别哭……」', en: 'Wilson, Chief Carrying Officer (also bodyguard, driver and company secretary). No smiling on duty. Inner voice: "Please don\'t cry, please don\'t cry…"' }
  ];
  var FINALE = { zh: '董事会决议：首席背娃官也配一副。', en: 'Board resolution: the Chief Carrying Officer gets shades too.' };
  var W0 = 607;
  var H0 = 1080;
  var notesEl = $('notes');
  var frame = $('photoFrame');
  var arrowPath = $('noteArrowPath');
  var current = -1;
  var timers = [];

  NOTES.forEach(function (n, i) {
    var t = el('button', 'note-target');
    t.type = 'button';
    t.style.left = (n.x / W0 * 100) + '%';
    t.style.top = (n.y / H0 * 100) + '%';
    t.setAttribute('aria-label', (i + 1) + '. ' + n.zh + ' / ' + n.en);
    t.dataset.i = i;
    t.appendChild(el('span', 'n', String(i + 1)));
    notesEl.appendChild(t);

    var l = el('div', 'note-label');
    bi(l, n.pillZh, n.pillEn);
    l.style.setProperty('--rot', (i % 2 ? 3 : -3) + 'deg');
    l.setAttribute('aria-hidden', 'true');
    notesEl.appendChild(l);
    n.target = t;
    n.label = l;

    var li = el('li');
    bi(li, n.zh, n.en);
    $('noteList').appendChild(li);
  });
  (function () {
    var li = el('li');
    bi(li, FINALE.zh, FINALE.en);
    $('noteList').appendChild(li);
  })();

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
    var gap = Math.max(30, fh * 0.05);
    var above = n.place === 'above' ? ty - gap - lh >= 6 : ty + gap + lh > fh - 6;
    var top = above ? ty - gap - lh : ty + gap;
    top = Math.max(6, Math.min(fh - lh - 6, top));
    var left = Math.max(6, Math.min(fw - lw - 6, tx - lw / 2));
    l.style.left = left + 'px';
    l.style.top = top + 'px';

    // 箭头：从标签边缘画到红圈边缘，带一点弧度
    var sx = Math.max(left + 12, Math.min(left + lw - 12, tx));
    var sy = above ? top + lh + 2 : top - 2;
    var r = 17;
    var dx = tx - sx;
    var dy = ty - sy;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var ex = tx - dx / dist * r;
    var ey = ty - dy / dist * r;
    var bend = tx < fw / 2 ? 14 : -14;
    var cx = (sx + ex) / 2 + (dy / dist) * bend;
    var cy = (sy + ey) / 2 - (dx / dist) * bend;
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

  function setCard(no, zh, en) {
    $('ncNo').textContent = no;
    var t = $('ncText');
    bi(t, zh, en);
    t.classList.remove('swap');
    void t.offsetWidth;
    t.classList.add('swap');
  }

  function glintOnce() {
    var bar = document.querySelector('.glint .bar');
    if (!bar || RM) return;
    bar.style.animation = 'none';
    void bar.getBoundingClientRect();
    bar.style.animation = '';
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
    arrowPath.getBoundingClientRect();
    requestAnimationFrame(function () {
      arrowPath.classList.add('on');
      setTimeout(function () { n.label.classList.add('on'); }, RM ? 0 : 240);
    });
    setCard(String(i + 1), n.zh, n.en);
    if (n.glint) glintOnce();
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  /* ---- Deal with it 像素墨镜 ---- */
  (function buildPixels() {
    var rows = [
      '1111111111111111111111',
      '0122111111001221111110',
      '0012211110000122111100',
      '0001111100000011111000'
    ];
    var g = $('dealPixels');
    var NS = 'http://www.w3.org/2000/svg';
    rows.forEach(function (row, y) {
      row.split('').forEach(function (c, x) {
        if (c === '0') return;
        var r = document.createElementNS(NS, 'rect');
        r.setAttribute('x', x * 10);
        r.setAttribute('y', y * 10);
        r.setAttribute('width', 10);
        r.setAttribute('height', 10);
        r.setAttribute('fill', c === '2' ? '#fff' : '#000');
        g.appendChild(r);
      });
    });
  })();

  function dealWithIt() {
    var g = $('dealShades');
    var banner = $('dealBanner');
    notesEl.style.opacity = '0';
    $('noteArrow').style.opacity = '0';
    banner.classList.remove('on');
    banner.textContent = '';
    setCard('★', FINALE.zh, FINALE.en);
    if (RM) {
      g.setAttribute('transform', 'translate(0 0)');
      banner.textContent = C.lang() === 'en' ? FINALE.en : FINALE.zh;
      banner.classList.add('on');
      return;
    }
    var steps = 8;
    for (var s = 0; s <= steps; s++) {
      (function (s) {
        timers.push(setTimeout(function () {
          g.setAttribute('transform', 'translate(0 ' + Math.round(-320 + 320 * s / steps) + ')');
        }, s * 110));
      })(s);
    }
    timers.push(setTimeout(function () {
      var text = C.lang() === 'en' ? FINALE.en : FINALE.zh;
      banner.classList.add('on');
      Array.from(text).forEach(function (ch, i) {
        timers.push(setTimeout(function () { banner.textContent += ch; }, i * 45));
      });
    }, steps * 110 + 200));
  }

  function resetDeal() {
    $('dealShades').setAttribute('transform', 'translate(0 -320)');
    $('dealBanner').classList.remove('on');
    $('dealBanner').textContent = '';
    notesEl.style.opacity = '';
    $('noteArrow').style.opacity = '';
  }

  function playNotes(fromIndex) {
    clearTimers();
    resetDeal();
    var start = fromIndex || 0;
    if (start === 0) NOTES.forEach(function (n) { n.target.classList.remove('on'); });
    showNote(-1);
    var step = RM ? 1600 : 2800;
    for (var i = start; i < NOTES.length; i++) {
      (function (i, k) {
        timers.push(setTimeout(function () {
          showNote(i);
          if (NOTES[i].dad) timers.push(setTimeout(dealWithIt, 2200));
        }, 300 + k * step));
      })(i, i - start);
    }
  }

  // 聚光灯：先只看到墨镜 → 打开 → CCTV 框住保镖
  var revealed = false;
  function spotlightReveal(then) {
    if (revealed) { then(); return; }
    revealed = true;
    if (RM) { frame.classList.remove('spot'); then(); return; }
    glintOnce();
    timers.push(setTimeout(function () { frame.classList.remove('spot'); }, 700));
    timers.push(setTimeout(function () {
      $('cctv').classList.add('on');
      $('recTag').classList.add('on');
    }, 1700));
    timers.push(setTimeout(function () {
      $('cctv').classList.remove('on');
      $('recTag').classList.remove('on');
      then();
    }, 3500));
  }

  function forceReveal() {
    if (revealed) return;
    revealed = true;
    frame.classList.remove('spot');
  }

  notesEl.addEventListener('click', function (e) {
    var t = e.target.closest('.note-target');
    if (!t) return;
    clearTimers();
    resetDeal();
    forceReveal();
    var i = Number(t.dataset.i);
    showNote(i);
    if (NOTES[i].dad) timers.push(setTimeout(dealWithIt, 900));
  });
  $('nextNote').addEventListener('click', function () {
    forceReveal();
    clearTimers();
    if (current >= NOTES.length - 1) { dealWithIt(); return; }
    resetDeal();
    var i = current + 1;
    showNote(i);
    if (NOTES[i].dad) timers.push(setTimeout(dealWithIt, 1200));
  });
  $('allNotes').addEventListener('click', function () {
    var list = $('noteList');
    list.hidden = !list.hidden;
    if (!list.hidden) {
      forceReveal();
      NOTES.forEach(function (n) { n.target.classList.add('on'); });
    }
  });
  $('replayNotes').addEventListener('click', function () {
    forceReveal();
    playNotes(0);
  });
  window.addEventListener('resize', function () { if (current >= 0) placeLabel(NOTES[current]); });
  document.addEventListener('langchange', function () {
    if (current >= 0) setTimeout(function () { placeLabel(NOTES[current]); }, 0);
  });

  /* ============================================================
     各区块进场
     ============================================================ */
  whenOpen(function () {
    // 观察外框而不是照片本身：照片被聚光灯裁成小圆时，浏览器算的可见比例会偏低
    onEnter(frame.parentNode, function () { spotlightReveal(function () { playNotes(0); }); }, 0.4);

    document.querySelectorAll('main .reveal').forEach(function (e) {
      if (e.closest('.cover')) return;
      onEnter(e, function () { e.classList.add('is-on'); }, 0.2);
    });

    onEnter($('facts'), function () { $('facts').classList.add('is-on'); }, 0.4);
    onEnter($('signoff'), function () { $('signoff').classList.add('is-on'); }, 0.4);
    onEnter($('invest'), spinReel, 0.6);
    onEnter($('rsvpForm'), function () { $('rsvpForm').classList.add('is-on'); }, 0.3);

    // 决议：一条一条盖章；第四条被否决
    var motions = document.querySelectorAll('.motion');
    onEnter($('resolutions'), function () {
      motions.forEach(function (m, i) {
        setTimeout(function () {
          m.classList.add('is-on');
          setTimeout(function () {
            m.classList.add('stamped');
            if (!RM) {
              m.classList.add('shake');
              setTimeout(function () { m.classList.remove('shake'); }, 700);
            }
          }, RM ? 0 : 260);
        }, RM ? 0 : i * 520);
      });
    }, 0.15);
  });

  /* ---------- 入股条件转盘 ---------- */
  var REEL = [
    { zh: '金条', en: 'Gold bars', ok: false },
    { zh: '股票', en: 'Shares', ok: false },
    { zh: '比特币', en: 'Bitcoin', ok: false },
    { zh: '房产', en: 'Property', ok: false },
    { zh: '你本人 ＋ 一个空肚子 ✓', en: 'You + an empty stomach ✓', ok: true }
  ];
  (function () {
    var track = $('slotTrack');
    REEL.forEach(function (r) {
      var s = el('span', r.ok ? 'ok' : 'x');
      bi(s, r.zh + (r.ok ? '' : ' ✗'), r.en + (r.ok ? '' : ' ✗'));
      track.appendChild(s);
    });
    track.style.transform = 'translateY(-' + (REEL.length - 1) * 1.6 + 'em)';
  })();
  var reelTimers = [];
  function spinReel() {
    var track = $('slotTrack');
    if (RM || !reelTimers) return;
    reelTimers.forEach(clearTimeout);
    reelTimers = [];
    track.style.transition = 'none';
    track.style.transform = 'translateY(0)';
    void track.offsetWidth;
    track.style.transition = '';
    REEL.forEach(function (r, i) {
      reelTimers.push(setTimeout(function () { track.style.transform = 'translateY(-' + i * 1.6 + 'em)'; }, 250 + i * 520));
    });
  }
  $('spinAgain').addEventListener('click', spinReel);

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
      var fig = el('figure', 'snap');
      fig.setAttribute('role', 'listitem');
      fig.style.setProperty('--tilt', (i % 2 ? 2 : -2) + 'deg');
      // tagZh / tagEn 是上面写死的字串（含 <b>），其余文字都用 textContent
      fig.innerHTML =
        '<button type="button" class="snap-btn" data-i="' + i + '">' +
          '<span class="snap-photo"><img loading="lazy" decoding="async" src="assets/img/gallery/' + g.src + '.jpg" alt="" style="object-position:' + g.pos + '" />' +
          '<span class="snap-tag"><span class="zh">' + g.tagZh + '</span><span class="en">' + g.tagEn + '</span></span></span>' +
          '<span class="snap-cap"></span>' +
        '</button>';
      bi(fig.querySelector('.snap-cap'), g.zh, g.en);
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
      bi($('lbCap'), g.zh, g.en);
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

  /* ---------- 倒数（当天中午后改字） ---------- */
  var endAt = new Date(P.event.end).getTime();
  C.countdown(function (t) {
    var box = $('countdown');
    if (t.done) {
      var over = Date.now() > endAt + 6 * 3600e3;
      box.querySelector('.cd-pre').hidden = true;
      box.querySelector('.cd-nums').hidden = true;
      var d = box.querySelector('.cd-done');
      d.hidden = false;
      if (d.dataset.set !== String(over)) {
        bi(d, over ? '感谢出席，董事长已午睡 💤' : '大会进行中 · 快来吃饭！', over ? 'Thanks for coming — the Boss is napping 💤' : 'Meeting in progress — come eat!');
        d.dataset.set = String(over);
      }
      return;
    }
    $('cdDays').textContent = String(t.days);
    $('cdHours').textContent = String(t.hours).padStart(2, '0');
    $('cdMins').textContent = String(t.mins).padStart(2, '0');
  });

  /* ---------- 底部常驻栏：看到回执表格就让位 ---------- */
  var stickyAllowed = false;
  var formVisible = false;
  var doneVisible = false;
  function updateSticky() {
    $('stickyBar').classList.toggle('show', stickyAllowed && !formVisible && !doneVisible && document.body.dataset.state === 'open');
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) {
      formVisible = en[0].isIntersecting;
      updateSticky();
    }, { threshold: 0.3 }).observe($('rsvpForm'));
    new IntersectionObserver(function (en) {
      doneVisible = en[0].isIntersecting;
      updateSticky();
    }, { threshold: 0.2 }).observe($('rsvpDone'));
  }
  $('stickyRsvp').addEventListener('click', function (e) {
    e.preventDefault();
    var target = !$('rsvpDone').hidden ? $('cert') : $('rsvp');
    target.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
  });

  function setStickyDone(done) {
    $('stickyBar').classList.toggle('done', done);
    $('stickyRsvp').querySelector('.sb-todo').hidden = done;
    $('stickyRsvp').querySelector('.sb-done').hidden = !done;
  }

  /* ============================================================
     RSVP · 股东出席登记表
     ============================================================ */
  var form = $('rsvpForm');
  var saved = C.mem.get(RSVP_KEY, null); // { id, data, sent }
  var rsvpId = (saved && saved.id) || C.newId();
  var counts = { adults: 1, kids: 0 };
  var DIET_REAL = ['vegetarian', 'no-beef', 'halal', 'no-spicy', 'allergy'];

  if (P.rsvpBy) {
    bi($('rsvpBy'), '请在 ' + P.rsvpByZh + ' 前登记，公司秘书要订餐。', 'Please reply by ' + P.rsvpByEn + ' so the Company Secretary can order the food.');
  }

  // 公开人数：只在 ≥ 5 位时显示（只有数字，没有名字）
  function showLive(s) {
    if (!s || !s.people || s.people < 5) return;
    $('liveCount').hidden = false;
    C.countUp($('livePeople'), s.people);
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
    var a = counts.adults;
    var k = counts.kids;
    bi($('headcount'),
      '合共 ' + (a + k) + ' 位出席（大人 ' + a + ' · 小孩 ' + k + '）',
      'Total ' + (a + k) + ' attending (' + a + (a === 1 ? ' adult' : ' adults') + ' · ' + k + (k === 1 ? ' kid' : ' kids') + ')');
  }

  function syncMode() {
    var a = attending();
    form.querySelector('.yes-only').hidden = a !== 'yes';
    form.querySelector('[data-when="yes"]').hidden = a === 'no';
    form.querySelector('[data-when="no"]').hidden = a !== 'no';
    var en = C.lang() === 'en';
    $('rWish').placeholder = a === 'no'
      ? (en ? 'e.g. Happy birthday DUDU! See you at the 2nd AGM.' : '例：DUDU 生日快乐！两岁股东大会一定到。')
      : (en ? 'e.g. Boss, when you\'re rich, remember who came to your 1st birthday!' : '例：董事长，发达了记得请干爹干妈吃饭！');
  }

  function dietChecked() {
    return Array.prototype.map.call(form.querySelectorAll('[name="diet"]:checked'), function (c) { return c.value; });
  }

  function syncDiet(changed) {
    var none = form.querySelector('[name="diet"][value="none"]');
    var real = Array.prototype.filter.call(form.querySelectorAll('[name="diet"]'), function (c) { return c.value !== 'none'; });
    if (changed === none && none.checked) real.forEach(function (c) { c.checked = false; });
    else if (changed && changed !== none && changed.checked) none.checked = false;
    var any = real.some(function (c) { return c.checked; });
    if (!any) none.checked = true;
    $('dietMore').hidden = !any;
    var en = C.lang() === 'en';
    $('rDietNote').placeholder = en ? 'Details (how many? allergic to what?) e.g. 2 vegetarian; kid allergic to peanuts' : '请注明（几位？过敏什么？）例：2位吃素；小孩对花生过敏';
    if (!form.querySelector('[name="diet"][value="allergy"]').checked) clearError('f-diet');
  }

  function setPlaceholders() {
    var en = C.lang() === 'en';
    $('rName').placeholder = en ? "e.g. Ah Ming's family" : '例：阿明一家';
    syncMode();
    syncDiet(null);
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
    if (e.target.name === 'diet') syncDiet(e.target);
  });
  $('rName').addEventListener('input', function () { clearError('f-name'); });
  $('rDietNote').addEventListener('input', function () { clearError('f-diet'); });
  $('rWish').addEventListener('input', function () { $('wishCount').textContent = $('rWish').value.length + ' / 200'; });
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
    $('wishCount').textContent = $('rWish').value.length + ' / 200';
    syncMode();
    syncDiet(null);
  }

  function collect() {
    var a = attending();
    var diet = a === 'yes' ? dietChecked().filter(function (k) { return DIET_REAL.indexOf(k) !== -1; }) : [];
    return {
      id: rsvpId,
      name: $('rName').value.trim(),
      attending: a,
      adults: a === 'yes' ? counts.adults : 0,
      kids: a === 'yes' ? counts.kids : 0,
      diet: diet,
      dietNote: a === 'yes' && diet.length ? $('rDietNote').value.trim() : '',
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
    $('formWa').hidden = true;
    var d = collect();
    var bad = false;
    if (!d.name) { setError('f-name'); bad = true; }
    if (!d.attending) { setError('f-attending'); bad = true; }
    if (d.attending === 'yes' && d.diet.indexOf('allergy') !== -1 && !d.dietNote) { setError('f-diet'); bad = true; }
    if (bad) {
      var first = form.querySelector('.field.error');
      if (first) first.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'center' });
      if (!d.name) $('rName').focus({ preventScroll: true });
      return;
    }

    busy(true);
    var waUrl = C.waLink(C.rsvpWhatsAppText(d, d.lang));
    var t0 = Date.now();
    C.api.submit(d).then(function (res) {
      // 让「董事长审批中」至少露脸 0.6 秒
      var wait = RM ? 0 : Math.max(0, 600 - (Date.now() - t0));
      setTimeout(function () { handleResult(res, d, waUrl); }, wait);
    });
  });

  function handleResult(res, d, waUrl) {
    busy(false);
    if (res.ok) {
      saved = { id: rsvpId, data: d, at: Date.now(), sent: true };
      C.mem.set(RSVP_KEY, saved);
      showDone(d, false, true);
      if (res.data && res.data.summary) showLive(res.data.summary);
      return;
    }
    if (res.invalid) {
      if (res.fields.name) setError('f-name');
      if (res.fields.attending) setError('f-attending');
      $('formMsg').textContent = C.lang() === 'en' ? 'Please check the form.' : '请检查一下表格。';
      return;
    }
    if (res.status === 503) {
      // 还没接存储：直接走 WhatsApp
      saved = { id: rsvpId, data: d, at: Date.now(), sent: false };
      C.mem.set(RSVP_KEY, saved);
      $('waLink').href = waUrl;
      showDone(d, true, true);
      window.open(waUrl, '_blank', 'noopener');
      return;
    }
    // 断网 / 伺服器出错：可以再试，也可以改用 WhatsApp
    $('formMsg').textContent = C.lang() === 'en' ? 'Network jam, please try again.' : '网络塞车，再试一次。';
    $('formWaLink').href = waUrl;
    $('formWa').hidden = false;
  }

  /* ---------- 证书 ---------- */
  function shareNo(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return ('00' + (1 + (h % 888))).slice(-3);
  }

  function showDone(d, fallback, animate) {
    var yes = d.attending === 'yes';
    var en = C.lang() === 'en';
    var anim = animate && !RM;
    form.hidden = true;
    $('welcomeBack').hidden = true;
    $('rsvpDone').hidden = false;
    $('rsvpFallback').hidden = !fallback;
    if (fallback) $('waLink').href = C.waLink(C.rsvpWhatsAppText(d, d.lang));
    $('changeMind').hidden = yes;
    setStickyDone(!fallback);

    var cert = $('cert');
    cert.classList.toggle('no-cert', !yes);
    var no = 'DUDU-1122-' + shareNo(rsvpId);
    var addr = P.event.address;
    var T = yes ? {
      kicker: (en ? 'DUDU Holdings Berhad · Bursa Bayi 1122 · No. ' : '丞鹤控股 · Bursa Bayi 1122 · 股东编号 ') + no,
      title: en ? 'Godparent Share Certificate' : '干爹干妈股权证书',
      body: en ? 'This certifies that the above is now a Lifetime Godparent-Shareholder of DUDU Holdings Berhad.' : '兹证明以上股东已正式入股，成为 张丞鹤 DUDU 的终身干爹干妈。',
      extra: en ? 'Valuation: priceless · Non-dilutable · No exit strategy' : '估值：无价 · 不可稀释 · 不设退出机制',
      meta: en ? 'Report to: Saturday 14 Nov 2026, 12:00pm · ' + P.event.venueEn + ' · ' + addr : '报到：2026年11月14日（星期六）中午12点 · ' + P.event.venueZh + ' · ' + addr,
      sign: en ? 'Signed: The Boss [drool mark] · Company Secretary: Wilson' : '签署：董事长［口水印］ · 公司秘书 Wilson',
      stamp: fallback ? (en ? 'PENDING · WhatsApp' : '待发 WhatsApp') : (en ? 'APPROVED' : '已入股 · APPROVED'),
      tip: fallback ? '' : (en ? 'Screenshot this! Show it at the door for the VIP lane. (There\'s no queue. Just come.)' : '截图保存！当天出示可走 VIP 通道（其实没人排队，人来就好）。')
    } : {
      kicker: (en ? 'DUDU Holdings Berhad · No. ' : '丞鹤控股 · 股东编号 ') + no,
      title: en ? 'Spiritual Shareholder Certificate' : '精神股东证书',
      body: en ? 'This certifies that the above is a Spiritual Shareholder of DUDU Holdings Berhad: attendance optional, good vibes mandatory.' : '兹证明以上人士为丞鹤控股「精神股东」：人可以不到，祝福要准时到。',
      extra: (en ? 'The Boss totally understands. (The Boss can\'t talk yet, but the look behind the shades said it all.) Your shares are reserved forever, with priority access at the 2nd AGM!' : '董事长表示完全理解（其实董事长还不会说话，但墨镜后面的眼神很理解）。你的股份永久保留，两岁股东大会优先认购！') +
        (d.wish ? (en ? ' Your message has been delivered to the Boss\'s office (the baby carrier). It will be read aloud at the meeting (or possibly chewed).' : ' 你的祝福已送达董事长办公室（就是那个背带），将于大会上宣读（或被咬一下）。') : ''),
      meta: en ? 'Valuation: priceless' : '估值：无价',
      sign: '',
      stamp: fallback ? (en ? 'PENDING · WhatsApp' : '待发 WhatsApp') : (en ? 'SHARES RESERVED' : '股份保留'),
      tip: fallback ? '' : (en ? 'Wilson has your reply. Thank you!' : 'Wilson 已收到你的回复，谢谢！')
    };
    $('certKicker').textContent = T.kicker;
    $('certTitle').textContent = T.title;
    $('certBody').textContent = T.body;
    $('certExtra').textContent = T.extra;
    $('certMeta').textContent = T.meta;
    $('certSign').textContent = T.sign;
    $('certStamp').textContent = T.stamp;
    $('certStamp').style.borderColor = yes ? '' : '#5B6B82';
    $('certStamp').style.color = yes ? '' : '#5B6B82';
    $('doneTip').textContent = T.tip;

    var units = $('certUnits');
    units.textContent = '';
    if (yes) {
      units.appendChild(el('span', '', en ? d.adults + (d.adults === 1 ? ' adult' : ' adults') : '大股东（大人）' + d.adults + ' 位'));
      units.appendChild(el('span', '', en ? d.kids + (d.kids === 1 ? ' kid' : ' kids') : '小股东（小孩）' + d.kids + ' 位'));
    }

    // 名字一个字一个字打出来
    var nameEl = $('certName');
    nameEl.textContent = '';
    if (!anim) nameEl.textContent = d.name;
    else Array.from(d.name).forEach(function (ch, i) { setTimeout(function () { nameEl.textContent += ch; }, 350 + i * 40); });

    cert.classList.remove('is-on');
    void cert.offsetWidth;
    cert.classList.add('is-on');
    if (animate) {
      $('rsvp').scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
      setTimeout(function () { cert.focus({ preventScroll: true }); }, 400);
    }

    if (yes && anim && !fallback) {
      setTimeout(function () {
        if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) { /* ignore */ } }
        C.confetti({ count: 40, y: 0.45, shapes: ['coin', 'coin', 'rect', 'circle'] });
        if (document.body.animate) {
          document.body.animate(
            [{ transform: 'translate(0,0)' }, { transform: 'translate(-2px,2px)' }, { transform: 'translate(2px,-2px)' }, { transform: 'translate(0,0)' }],
            { duration: 200 }
          );
        }
      }, 850);
    }
  }

  function editReply(preset) {
    form.hidden = false;
    $('rsvpDone').hidden = true;
    $('welcomeBack').hidden = true;
    if (saved && saved.data) fill(saved.data);
    if (preset) {
      form.querySelectorAll('[name="attending"]').forEach(function (r) { r.checked = r.value === preset; });
      syncMode();
    }
    form.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
  }

  $('rsvpEdit').addEventListener('click', function () { editReply(); });
  $('changeMind').addEventListener('click', function () { editReply('yes'); });
  $('wbEdit').addEventListener('click', function () { editReply(); });
  $('wbView').addEventListener('click', function () {
    if (saved && saved.data) showDone(saved.data, saved.sent === false, false);
    $('cert').scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
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
    setStickyDone(false);
    $('rName').focus();
  });

  /* ============================================================
     页尾：风险声明放大镜、Huat ah 撒金币
     ============================================================ */
  $('finePrint').addEventListener('click', function () {
    var b = $('finePrint');
    b.setAttribute('aria-expanded', String(b.getAttribute('aria-expanded') !== 'true'));
  });

  var px = 1;
  $('huatBtn').addEventListener('click', function (e) {
    var b = $('huatBtn');
    b.classList.remove('squish');
    void b.offsetWidth;
    b.classList.add('squish');
    px = Math.round((px + 0.01) * 100) / 100;
    $('huatPx').textContent = px.toFixed(2);
    if (RM) return;
    var r = b.getBoundingClientRect();
    var x = e.clientX || r.left + r.width / 2;
    var y = e.clientY || r.top;
    for (var i = 0; i < 16; i++) {
      var c = el('span', 'coin', '发');
      c.setAttribute('aria-hidden', 'true');
      c.style.left = x + 'px';
      c.style.top = y + 'px';
      c.style.setProperty('--dx', Math.round((Math.random() - 0.5) * 260) + 'px');
      c.style.setProperty('--up', -Math.round(60 + Math.random() * 120) + 'px');
      c.style.setProperty('--rot', Math.round((Math.random() - 0.5) * 540) + 'deg');
      c.style.animationDelay = (i * 18) + 'ms';
      document.body.appendChild(c);
      setTimeout(function (n) { return function () { n.remove(); }; }(c), 1500);
    }
  });

  /* ---------- 开始 ---------- */
  setCount('adults', 1);
  setCount('kids', 0);
  setPlaceholders();
  if (saved && saved.data) {
    // 再次打开：先打招呼，不直接跳证书
    fill(saved.data);
    form.hidden = true;
    $('welcomeBack').hidden = false;
    bi($('wbText'),
      '欢迎回来，' + saved.data.name + '！' + (saved.data.attending === 'yes' ? '你已入股 ✓' : '你的祝福已登记 ✓'),
      'Welcome back, ' + saved.data.name + '! ' + (saved.data.attending === 'yes' ? 'You\'re in ✓' : 'Your wishes are registered ✓'));
    if (saved.sent !== false) setStickyDone(true);
  } else if (invitedAs) {
    $('rName').value = invitedAs;
  }
})();
