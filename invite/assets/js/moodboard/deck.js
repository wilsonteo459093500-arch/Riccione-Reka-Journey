/* ============================================================
   Moodboard 生成器 · 排版（A4 横向，每页 1122 × 793）
   ------------------------------------------------------------
   页序照《快思慢想》排：
     封面写客人名字            → System 1 第一眼就知道「这是我的」
     一页看懂                  → WYSIATI：先给一个完整、连贯的故事
     你说的 · 我们做的          → 被听见；用客户自己的话
     平面图编号                 → 把注意力锚在「我家」
     逐个空间：1 张主图 + 最多 2 张辅图 + 为你一句话
     设计语言（只一页，品牌放后面）
     到馆邀约 · 峰值与结尾       → 峰终定律：最后一页给下一步，不是电话号码
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};
  var esc = MB.esc;

  /**
   * @param {object} p      方案
   * @param {object} ctx    { resolve(ref), userImages, qrSvg, cases, venue }
   * @returns {string}      全部页面 HTML
   */
  MB.renderDeck = function (p, ctx) {
    var lang = p.lang;
    var list = MB.pageList(p);
    var total = list.length;
    return list.map(function (pg, i) {
      var n = i + 1;
      var html = '';
      switch (pg.type) {
        case 'cover': html = cover(p, ctx, lang); break;
        case 'glance': html = glance(p, ctx, lang); break;
        case 'needs': html = needs(p, ctx, lang); break;
        case 'plan': html = plan(p, ctx, lang); break;
        case 'room': html = room(p, ctx, lang, pg.room); break;
        case 'practical': html = practical(p, ctx, lang); break;
        case 'language': html = language(p, ctx, lang); break;
        case 'invite': html = invite(p, ctx, lang); break;
        case 'back': html = back(p, ctx, lang); break;
      }
      var foot = (pg.type === 'cover' || pg.type === 'back') ? '' : footer(p, n, total, pageName(p, pg, lang));
      var target = pg.room ? 'room:' + esc(pg.room.uid) : pg.type;
      return '<div class="pg-wrap"><div class="pg pg-' + pg.type + '" data-goto="' + target + '" data-n="' + n + '/' + total + '">' +
        html + foot + '</div></div>';
    }).join('');
  };

  /* ---------- 小零件 ---------------------------------------- */
  function img(ctx, ref, cls) {
    var im = ctx.resolve(ref);
    if (!im) return '<div class="ph ' + (cls || '') + '"><span>＋</span></div>';
    return '<figure class="ph ' + (cls || '') + '"><img src="' + esc(im.src) + '" alt="" decoding="async" /></figure>';
  }
  function lbl(o, lang) { return '<p class="lbl">' + MB.th(o, lang) + '</p>'; }
  function text(v, lang) { return MB.th(v, lang); }   // 字串原样、{en,zh} 依语言
  /** 引号只包住主语言那一句；双语时中文另起一行 */
  function quote(v, lang) {
    if (v && typeof v === 'object' && lang === 'bi') return '“' + esc(v.en) + '”<span class="bi">「' + esc(v.zh) + '」</span>';
    var s = MB.t(v, lang);
    return lang === 'zh' ? '「' + esc(s) + '」' : '“' + esc(s) + '”';
  }
  function names(p, lang) { return esc(MB.namesOr(p, lang === 'zh' ? 'zh' : 'en')); }

  /** 页脚：「07 / 13 · Kitchen」—— 客户回讯息时说得出是哪一页 */
  function footer(p, n, total, name) {
    var who = [p.client.names, p.property.name].filter(Boolean).map(esc).join(' · ');
    return '<div class="pg-foot"><span>SAIL 溪岸' + (who ? ' · ' + who : '') + '</span><span>' +
      MB.pad2(n) + ' / ' + MB.pad2(total) + (name ? ' · ' + esc(name) : '') + '</span></div>';
  }
  var PAGE_NAMES = {
    glance: { en: 'At a glance', zh: '一页看懂' }, needs: { en: 'You told us', zh: '你们说的' },
    plan: { en: 'Layout', zh: '平面布局' }, practical: { en: 'Timeline & care', zh: '工期与保障' },
    language: { en: 'Design language', zh: '设计语言' }, invite: { en: 'Next step', zh: '下一步' }
  };
  function pageName(p, pg, lang) {
    var o = pg.room ? MB.roomTitle(p, pg.room) : PAGE_NAMES[pg.type];
    return MB.t(o, lang === 'zh' ? 'zh' : 'en');
  }
  /** 楼盘和展厅在同一个镇区（例：都在 Setia Alam）→ 邀约页可以说「就在你们新家附近」 */
  function sameTown(p, ctx) {
    var area = (p.property.area || '').trim().toLowerCase();
    var addr = ((ctx.venue && ctx.venue.address) || '').toLowerCase();
    return area.length > 2 && addr.indexOf(area) > -1;
  }
  MB.sameTown = sameTown;

  function swatches(p) {
    return '<div class="sw-row">' + p.palette.map(function (c) {
      return '<i style="background:' + MB.hex(c.hex) + '"></i>';
    }).join('') + '</div>';
  }

  /* ---------- 1 · 封面 -------------------------------------- */
  function cover(p, ctx, lang) {
    var prop = MB.propertyLabel(p);
    var by = p.host.name ? (lang === 'zh' ? '设计顾问 ' : 'Prepared by ') + esc(p.host.name) : '';
    return img(ctx, MB.pageImage(p, 'cover', ctx.resolve), 'cv-img') +
      '<div class="cv-txt">' +
        '<img class="cv-logo" src="assets/img/brand/sail.png" alt="Sail 溪岸" />' +
        '<div class="cv-mid">' +
          lbl({ en: 'Prepared for', zh: '专属方案 · 为' }, lang) +
          '<h1 class="cv-name">' + names(p, lang) + '</h1>' +
          '<span class="rule"></span>' +
          (prop ? '<p class="cv-prop">' + esc(prop) + '</p>' : '') +
          '<p class="cv-kind">' + MB.th(p.rooms.length
            ? { en: 'Built-in cabinetry proposal · ' + p.rooms.length + (p.rooms.length > 1 ? ' spaces' : ' space'), zh: '全屋定制方案 · ' + p.rooms.length + ' 个空间' }
            : { en: 'Built-in cabinetry proposal', zh: '全屋定制方案' }, lang) + '</p>' +
        '</div>' +
        '<div class="cv-foot">' + swatches(p) +
          '<p>' + esc(MB.longDate(p.date, lang === 'zh' ? 'zh' : 'en')) + (by ? '<br />' + by : '') + '</p>' +
        '</div>' +
      '</div>';
  }

  /* ---------- 2 · 一页看懂 ---------------------------------- */
  function glance(p, ctx, lang) {
    var d = MB.dir(p);
    var pal = p.palette.map(function (c) {
      return '<li><i style="background:' + MB.hex(c.hex) + '"></i><b>' + text({ en: c.en, zh: c.zh }, lang) + '</b><em>' + MB.hex(c.hex).toUpperCase() + '</em></li>';
    }).join('');
    var mats = p.materials.map(function (m) {
      return '<li><i style="background:' + MB.hex(m.hex) + '"></i>' + text({ en: m.en, zh: m.zh }, lang) + '</li>';
    }).join('');
    var prom = [0, 1, 2].map(function (i) {
      return '<li><span>' + (i + 1) + '</span><div>' + text(MB.promise(p, i), lang) + '</div></li>';
    }).join('');
    return img(ctx, MB.pageImage(p, 'glance', ctx.resolve), 'gl-img') +
      '<div class="gl-txt">' +
        lbl({ en: 'Your home, in one page', zh: '一页看懂你们的家' }, lang) +
        '<h2 class="gl-dir">' + text({ en: d.en, zh: d.zh }, lang) + '</h2>' +
        '<p class="gl-mood">' + text(d.mood, lang) + '</p>' +
        lbl({ en: 'Palette', zh: '配色' }, lang) + '<ul class="gl-pal">' + pal + '</ul>' +
        lbl({ en: 'Materials', zh: '材质' }, lang) + '<ul class="gl-mats">' + mats + '</ul>' +
        lbl({ en: 'What it will feel like', zh: '住进去的感觉' }, lang) + '<ol class="gl-prom">' + prom + '</ol>' +
      '</div>';
  }

  /* ---------- 3 · 你说的 · 我们做的 -------------------------- */
  function needs(p, ctx, lang) {
    var rows = p.needs.slice(0, 5).map(function (n) {
      var r = MB.needRoom(p, n);
      var pn = r ? MB.roomPageNo(p, r) : 0;
      var ans = MB.needAnswer(n);
      return '<div class="nd">' +
        '<p class="nd-q">' + quote(MB.needQuote(n), lang) + '</p>' +
        '<span class="nd-arr">→</span>' +
        '<p class="nd-a">' + (ans ? text(ans, lang) : '<span class="todo">' + (lang === 'zh' ? '（写下我们的做法）' : '(write our answer)') + '</span>') +
          (pn ? ' <em>p.' + MB.pad2(pn) + '</em>' : '') + '</p>' +
      '</div>';
    }).join('');
    return '<div class="hd">' +
        lbl({ en: 'You told us', zh: '你们说的' }, lang) +
        '<h2>' + MB.th({ en: 'What we heard — and what we did about it.', zh: '我们听到的，和我们为此做的。' }, lang) + '</h2>' +
      '</div>' +
      '<div class="nd-list">' + rows + '</div>';
  }

  /* ---------- 4 · 平面图 ------------------------------------ */
  function plan(p, ctx, lang) {
    var notIn = ((p.extra || {}).notIncluded || '').trim();
    var boxW = 735, boxH = 600;
    var w = p.plan.w || 1000, h = p.plan.h || 700;
    var k = Math.min(boxW / w, boxH / h);
    var iw = Math.round(w * k), ih = Math.round(h * k);
    var pins = p.rooms.map(function (r, i) {
      var pin = p.plan.pins[r.uid];
      if (!pin) return '';
      return '<span class="pin" style="left:' + (pin.x * 100).toFixed(2) + '%;top:' + (pin.y * 100).toFixed(2) + '%">' + (i + 1) + '</span>';
    }).join('');
    var legend = p.rooms.map(function (r, i) {
      return '<li><span class="pin">' + (i + 1) + '</span><b>' + text(MB.roomTitle(p, r), lang) + '</b><em>p.' + MB.pad2(MB.roomPageNo(p, r)) + '</em></li>';
    }).join('');
    return '<div class="hd">' +
        lbl({ en: 'Layout', zh: '平面布局' }, lang) +
        '<h2>' + MB.th({ en: 'Where everything goes.', zh: '每一件，放在哪里。' }, lang) + '</h2>' +
      '</div>' +
      '<div class="pl-box"><div class="pl-inner" style="width:' + iw + 'px;height:' + ih + 'px">' +
        '<img src="' + esc(ctx.planSrc || p.plan.src) + '" alt="" />' + pins +
      '</div></div>' +
      '<div class="pl-side"><ol class="pl-legend">' + legend + '</ol>' +
      (notIn ? '<p class="pl-not">' + (lang === 'zh'
        ? '<b>这次没包含：</b>' + esc(notIn) + ' —— 想加进来，跟我们说一声。'
        : '<b>Not in this proposal:</b> ' + esc(notIn) + ' — tell us if you’d like them included.') + '</p>' : '') +
      '</div>';
  }

  /* ---------- 5 · 空间 -------------------------------------- */
  function room(p, ctx, lang, r) {
    var def = MB.ROOM[r.key];
    var idx = p.rooms.indexOf(r) + 1;
    var refs = r.images.filter(function (ref) { return ctx.resolve(ref); }).slice(0, 4);
    var layout = 'l' + Math.max(1, refs.length);
    var imgs = refs.length ? refs.map(function (ref, i) { return img(ctx, ref, i === 0 ? 'hero' : ''); }).join('')
      : img(ctx, null, 'hero');
    var feats = def.feats.filter(function (f) { return r.feats.indexOf(f.id) > -1; }).slice(0, 4).map(function (f) {
      return '<li><b>' + text({ en: f.en, zh: f.zh }, lang) + '</b><span>' + text(f.why, lang) + '</span></li>';
    }).join('');
    var note = MB.roomNote(p, r);
    var who = (p.client.names || '').trim();   // MB.th 会转义，这里不要先转
    var forLbl = who ? { en: 'For ' + who, zh: '为 ' + who } : { en: 'Why this, for you', zh: '为什么这样做' };
    var mats = p.materials.slice(0, 3).map(function (m) {
      return '<span><i style="background:' + MB.hex(m.hex) + '"></i>' + text({ en: m.en, zh: m.zh }, lang) + '</span>';
    }).join('');
    return '<div class="rm-head">' +
        '<span class="rm-no">' + MB.pad2(idx) + '</span>' +
        '<div><h2>' + text(MB.roomTitle(p, r), lang) + '</h2>' +
        '<p class="rm-line">' + text(def.head, lang) + '</p></div>' +
      '</div>' +
      '<div class="rm-body">' +
        '<div class="rm-imgs ' + layout + '">' + imgs + '</div>' +
        '<div class="rm-txt">' +
          (feats ? '<ol class="rm-feats">' + feats + '</ol>' : '') +
          (note ? '<div class="rm-for"><p class="lbl">' + MB.th(forLbl, lang === 'bi' ? 'en' : lang) + '</p><p>' + text(note, lang) + '</p></div>' : '') +
          '<div class="rm-mats">' + mats + '</div>' +
        '</div>' +
      '</div>';
  }

  /* ---------- 5b · 工期 · 预算 · 保障 ------------------------
     锚定：第一个具体数字会变成锚 —— 我们先给，好过让别家的按尺价先给。
     规划谬误：工期写过往项目的真实区间，不写最快那一次。
     全部由销售填真实资料；没填就不出这一页。 */
  function practical(p, ctx, lang) {
    var x = p.extra || {};
    function col(title, body) {
      if (!String(body || '').trim()) return '';
      var lines = String(body).split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
      return '<div class="pr-col">' + lbl(title, lang) + (lines.length > 1
        ? '<ul>' + lines.map(function (l) { return '<li>' + esc(l.replace(/^[-•·]\s*/, '')) + '</li>'; }).join('') + '</ul>'
        : '<p class="pr-big">' + esc(lines[0]) + '</p>') + '</div>';
    }
    return '<div class="hd">' +
        lbl({ en: 'Before you decide', zh: '决定之前' }, lang) +
        '<h2>' + MB.th({ en: 'How long, how much, and what we stand behind.', zh: '要多久、大概多少、我们保证什么。' }, lang) + '</h2>' +
      '</div>' +
      '<div class="pr-cols">' +
        col({ en: 'Timeline', zh: '工期' }, x.timeline) +
        col({ en: 'Investment', zh: '预算' }, x.budget) +
        col({ en: 'Built for Malaysian homes', zh: '为马来西亚的家而做' }, x.built) +
      '</div>';
  }

  /* ---------- 6 · 设计语言（品牌只占一页） -------------------- */
  function language(p, ctx, lang) {
    var d = MB.dir(p);
    var c = null;
    (ctx.cases || []).forEach(function (x) { if (x.slug === d.series) c = x; });
    var photos = c ? c.photos.slice(0, 2) : [];
    var pics = photos.map(function (ph, i) {
      return '<figure class="ph' + (i ? '' : ' hero') + '"><img src="assets/img/cases/' + esc(ph.src) + '" alt="" /></figure>';
    }).join('');
    var desc = c ? { en: c.descEn, zh: c.descZh } : d.mood;
    var tag = c ? { en: c.tagEn, zh: c.tagZh } : null;
    var v = ctx.venue || {};
    return '<div class="lg-pics n' + photos.length + '">' + pics + '</div>' +
      '<div class="lg-txt">' +
        lbl({ en: 'Our design language', zh: '这套方案的设计语言' }, lang) +
        '<h2>' + text({ en: d.en, zh: d.zh }, lang) + '</h2>' +
        (tag ? '<p class="lg-tag">' + text(tag, lang) + '</p>' : '') +
        '<p class="lg-desc">' + text(desc, lang) + '</p>' +
        '<div class="lg-proof">' +
          '<div><b>2011</b><span>' + MB.th({ en: 'Founded in Chengdu', zh: '创立于成都' }, lang) + '</span></div>' +
          '<div><b>30+</b><span>' + MB.th({ en: 'City showrooms', zh: '城市展厅' }, lang) + '</span></div>' +
          '<div><b>1:1</b><span>' + MB.th({ en: 'Showroom in Setia Alam', zh: 'Setia Alam 实景展厅' }, lang) + '</span></div>' +
        '</div>' +
        (v.address ? '<p class="lg-addr">' + esc(v.address) + '</p>' : '') +
      '</div>';
  }

  /* ---------- 7 · 到馆邀约（峰值） ---------------------------- */
  function invite(p, ctx, lang) {
    var L1 = lang === 'zh' ? 'zh' : 'en';
    var slot1 = MB.slotLabel(p.visit.date, p.visit.time, L1);
    var slot2 = MB.slotLabel(p.visit.date2, p.visit.time2, L1);
    var prep = MB.prepared(p).map(function (x) { return '<li><div>' + text(x, lang) + '</div></li>'; }).join('');
    var mins = +p.visit.mins || 60;
    var slot = slot1
      ? '<p class="iv-slot">' + esc(slot1) + '</p>' +
        (slot2 ? '<p class="iv-alt">' + (L1 === 'zh' ? '或 ' : 'or ') + esc(slot2) + '</p>' : '') +
        '<p class="iv-meta">' + (L1 === 'zh' ? '约 ' + mins + ' 分钟 · Setia Alam 展厅' : mins + ' minutes · our Setia Alam showroom') + '</p>'
      : '<p class="iv-slot">' + (L1 === 'zh' ? '时间由你们定 —— 回我一个方便的时段' : 'Tell us a time that suits you') + '</p>';
    var wa = MB.msisdn(p.host.wa);
    var who = MB.namesOr(p, L1), prop = MB.propertyLabel(p);
    var hello = L1 === 'zh'
      ? '你好 ' + (p.host.name || '') + '，我是 ' + who + (prop ? '（' + prop + '）' : '') + '，想约时间到展厅看看。'
      : 'Hi ' + (p.host.name || '') + ', this is ' + who + (prop ? ' (' + prop + ')' : '') + '. We’d like to visit the showroom.';
    // 打印成 PDF 后链接仍然点得开：客户在手机上一点就 WhatsApp / 导航
    var links = [
      wa ? '<a href="https://wa.me/' + wa + '?text=' + encodeURIComponent(hello) + '">WhatsApp ' + esc(p.host.name || '') + '</a>' : '',
      ctx.waze ? '<a href="' + esc(ctx.waze) + '">Waze</a>' : '',
      ctx.maps ? '<a href="' + esc(ctx.maps) + '">Google Maps</a>' : ''
    ].filter(Boolean).join(' · ');
    var near = sameTown(p, ctx) ? '<p class="iv-near">' + MB.th({
      en: 'Our showroom is in ' + p.property.area.trim() + ' too — the same township as your new home.',
      zh: '展厅也在 ' + p.property.area.trim() + ' —— 和你们新家在同一个镇区。' }, lang) + '</p>' : '';
    return img(ctx, MB.pageImage(p, 'invite', ctx.resolve), 'iv-img') +
      '<div class="iv-txt">' +
        lbl({ en: 'Next · Come and feel it', zh: '下一步 · 到展厅摸一摸' }, lang) +
        '<h2>' + MB.th({ en: 'Some things photos can’t show you.', zh: '有些东西，照片给不了。' }, lang) + '</h2>' +
        '<p class="iv-lede">' + MB.th({ en: 'The weight of a drawer. The grain under your fingers. The sound a door makes as it closes.',
          zh: '抽屉拉出来的分量，木纹在指尖的触感，柜门关上的那一声。' }, lang) + '</p>' + near +
        lbl({ en: 'Prepared for your visit', zh: '为你们准备好的' }, lang) +
        '<ol class="iv-prep">' + prep + '</ol>' +
        '<div class="iv-bottom">' +
          '<div class="iv-when">' + lbl({ en: 'Reserved for you', zh: '已为你们保留' }, lang) + slot + '</div>' +
          (ctx.qrSvg ? '<a class="iv-qr" href="' + esc(ctx.inviteUrl || '#') + '">' + ctx.qrSvg + '<span>' + MB.th({ en: 'Invitation & parking guide', zh: '邀请函 · 停车指引' }, lang) + '</span></a>' : '') +
        '</div>' +
        '<p class="iv-host">' + esc(p.host.name || '') + (wa ? ' · +' + esc(wa) : '') + (links ? '<br />' + links : '') + '</p>' +
      '</div>';
  }

  /* ---------- 8 · 封底 -------------------------------------- */
  function back(p, ctx, lang) {
    var v = ctx.venue || {};
    var rows = [
      v.phoneShow ? ['WhatsApp', v.phoneShow] : null,
      v.website ? [lang === 'zh' ? '网站' : 'Website', v.website] : null,
      v.instagram ? ['Instagram', v.instagram] : null,
      v.address ? [lang === 'zh' ? '展厅' : 'Showroom', v.address] : null,
      v.hoursEn ? [lang === 'zh' ? '营业时间' : 'Hours', lang === 'zh' ? v.hoursZh : v.hoursEn] : null
    ].filter(Boolean).map(function (r) { return '<li><span>' + esc(r[0]) + '</span>' + esc(r[1]) + '</li>'; }).join('');
    return '<div class="bk-txt">' +
        '<img class="cv-logo" src="assets/img/brand/sail.png" alt="Sail 溪岸" />' +
        '<h2>' + (lang === 'zh' ? '谢谢，' + names(p, lang) + '。' : 'Thank you, ' + names(p, lang) + '.') + '</h2>' +
        '<p class="bk-line">' + MB.th({ en: 'Designs that soothe the soul — made for the way you live.', zh: '抚慰人心的设计，为你们的生活方式而做。' }, lang) + '</p>' +
        '<ul class="bk-contact">' + rows + '</ul>' +
      '</div>' +
      img(ctx, MB.pageImage(p, 'back', ctx.resolve), 'bk-img');
  }
})();
