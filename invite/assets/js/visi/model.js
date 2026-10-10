/* ============================================================
   VISI · 方案模型
   ------------------------------------------------------------
   一份方案（project）长什么样、默认值从哪里来、页码怎么排。
   画面（deck.js）、文案（copy.js）、体检（check.js）都从这里取值，
   所以「销售没改过的地方」三处永远一致。

   约定：可编辑的文字字段，null = 用默认（会跟着语言 / 风格自动变），
   一旦销售改过就存成字符串，原样输出。
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};
  var CFG = window.SAIL || {};

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  MB.clone = clone;

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  MB.pad2 = pad2;

  MB.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /** 颜色只收 #RGB / #RRGGBB —— 会被塞进 style 属性，导入的方案文件不能借此塞别的 CSS */
  MB.hex = function (v) {
    return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(v || '').trim()) ? String(v).trim() : '#CCCCCC';
  };

  /** {en, zh} 依语言取字（纯文字）；bi 模式回英文（中文另取） */
  MB.t = function (o, lang) {
    if (o == null) return '';
    if (typeof o === 'string') return o;
    return lang === 'zh' ? (o.zh || o.en || '') : (o.en || o.zh || '');
  };
  /** {en, zh} → HTML；双语时英文为主、中文小一号 */
  MB.th = function (o, lang) {
    if (o == null) return '';
    if (typeof o === 'string') return MB.esc(o);
    if (lang === 'bi' && o.zh && o.en) return MB.esc(o.en) + '<span class="bi">' + MB.esc(o.zh) + '</span>';
    return MB.esc(MB.t(o, lang));
  };

  /* ---------- 建立 ------------------------------------------ */
  MB.newProject = function (profile) {
    profile = profile || {};
    var host = CFG.host || {};
    var dir = MB.DIRECTION.misty;
    return {
      id: MB.uid('p-'), ts: Date.now(), v: 1,
      lang: 'en',
      client: { names: '', honor: '', wa: '' },
      property: { name: '', area: '', type: '', size: '' },
      date: todayISO(),
      host: { name: profile.host || host.name || '', role: profile.role || host.role || '', wa: profile.wa || host.wa || '' },
      direction: dir.key,
      palette: clone(dir.palette),
      materials: clone(dir.materials),
      promises: [null, null, null],
      needs: [],
      rooms: [],
      plan: { src: null, w: 0, h: 0, pins: {} },
      visit: { date: '', time: '14:00', date2: '', time2: '11:00', mins: 60, auto: false, prepared: [null, null, null] },
      pages: { glance: true, needs: true, plan: true, practical: true, language: true, invite: true, back: true },
      extra: { notIncluded: '', timeline: '', budget: '', built: '' },
      images: { cover: null, glance: null, invite: null, back: null },
      brief: ''
    };
  };

  MB.newRoom = function (key) {
    var r = MB.ROOM[key];
    return {
      uid: MB.uid('r-'), key: key, title: null, images: [], manual: false,
      feats: r.feats.filter(function (f) { return f.def; }).map(function (f) { return f.id; }),
      note: null
    };
  };

  /* ---------- 取值（覆写优先，否则默认） --------------------- */
  MB.dir = function (p) { return MB.DIRECTION[p.direction] || MB.DIRECTIONS[0]; };

  MB.roomTitle = function (p, room) {
    if (room.title) return room.title;
    var r = MB.ROOM[room.key];
    return { en: r.en, zh: r.zh };
  };

  /** 公寓 / condo：没有楼梯底，大件改放主卧衣柜顶 */
  MB.isCondo = function (p) {
    return /condo|公寓|apartment|serviced/i.test((p && p.property && p.property.type) || '');
  };
  /** 需求卡对应的默认（公寓有自己的版本） */
  MB.needDef = function (p, key) {
    var d = key && MB.NEEDS[key];
    if (!d) return null;
    return d.condo && MB.isCondo(p) ? d.condo : d;
  };

  MB.needQuote = function (n) {
    if (n.quote != null) return n.quote;
    return n.key && MB.NEEDS[n.key] ? MB.NEEDS[n.key].quote : '';
  };
  MB.needAnswer = function (n, p) {
    if (n.answer != null) return n.answer;
    var d = MB.needDef(p, n.key);
    return d ? d.answer : '';
  };
  /** 这条需求落在哪个空间（用来标页码）：指定的那一间 > 同类第一间 */
  MB.needRoom = function (p, n) {
    if (n.roomUid) {
      for (var j = 0; j < p.rooms.length; j++) if (p.rooms[j].uid === n.roomUid) return p.rooms[j];
    }
    var d = MB.needDef(p, n.key);
    var key = n.room || (d && d.room);
    if (!key) return null;
    for (var i = 0; i < p.rooms.length; i++) if (p.rooms[i].key === key) return p.rooms[i];
    return null;
  };

  /** 房间页「为你」那一句：销售写的 > 需求卡对上的 > 空 */
  MB.roomNote = function (p, room) {
    if (room.note != null) return room.note;
    for (var i = 0; i < p.needs.length; i++) {
      var n = p.needs[i], d = MB.needDef(p, n.key);
      if (d && d.room === room.key && MB.needRoom(p, n) === room) return d.note;
    }
    return '';
  };

  /** 房间页印出来的特点：需求卡点到的排最前（双语只印 3 条，不能先砍掉客户在乎的那条） */
  MB.roomFeats = function (p, room) {
    var def = MB.ROOM[room.key];
    var first = {};
    p.needs.forEach(function (n) {
      var d = MB.needDef(p, n.key);
      if (d && d.feats && MB.needRoom(p, n) === room) d.feats.forEach(function (id) { first[id] = 1; });
    });
    var picked = def.feats.filter(function (f) { return room.feats.indexOf(f.id) > -1; });
    return picked.filter(function (f) { return first[f.id]; }).concat(picked.filter(function (f) { return !first[f.id]; }));
  };

  MB.promise = function (p, i) {
    return p.promises[i] != null ? p.promises[i] : MB.dir(p).promises[i];
  };

  /** 空间按「客户在乎的程度」排：被需求点到的在前（客户原话最前），其余照页序 */
  MB.roomPriority = function (p) {
    var rank = {};
    p.needs.forEach(function (n, i) {
      var r = MB.needRoom(p, n);
      if (r && rank[r.uid] == null) rank[r.uid] = i;
    });
    return p.rooms.slice().sort(function (a, b) {
      var ra = rank[a.uid] == null ? 1e3 + p.rooms.indexOf(a) : rank[a.uid];
      var rb = rank[b.uid] == null ? 1e3 + p.rooms.indexOf(b) : rank[b.uid];
      return ra - rb;
    });
  };

  var PREP_PLAN = { en: 'Your floor plan printed large, so we can mark changes together', zh: '按你们平面图打印的大图，现场一起改',
    short: { en: 'your floor plan, printed large', zh: '你们的平面图大图' } };
  var PREP_BOARDS = { en: 'Board and colour samples in your palette', zh: '按你们配色挑好的板材与色板',
    short: { en: 'board samples in your palette', zh: '你们配色的板材样板' } };
  var PREP_HARDWARE = { en: 'Hinges, runners and handles to try by hand', zh: '铰链、滑轨与把手，现场亲手试',
    short: { en: 'the hinges, runners and handles', zh: '铰链与滑轨样品' } };

  /** 有平面图才答应「打印大图」—— 客户在需求卡写了「没有平面图」，就别这样承诺 */
  MB.hasPlan = function (p) {
    return !!p.plan.src || /平面图[:：]\s*有/.test(p.brief || '');
  };

  function autoPrepared(p) {
    var hasPlan = MB.hasPlan(p);
    var auto = [];
    MB.roomPriority(p).forEach(function (r) {
      var prep = MB.ROOM[r.key].prep;
      if (prep && auto.length < (hasPlan ? 2 : 3) && auto.indexOf(prep) < 0) auto.push(prep);
    });
    if (hasPlan) auto.push(PREP_PLAN);
    [PREP_BOARDS, PREP_HARDWARE].forEach(function (x) { if (auto.length < 3) auto.push(x); });
    return auto;
  }

  /** 到馆那天准备的三样：销售写的 > 依客户在乎的空间推荐 > 平面图 */
  MB.prepared = function (p) {
    var auto = autoPrepared(p);
    return [0, 1, 2].map(function (i) {
      return p.visit.prepared[i] != null ? p.visit.prepared[i] : auto[i];
    });
  };
  /** 讲解稿 / 提醒里用的短说法（「把 ___ 准备好了」） */
  MB.preparedShort = function (p, i, L) {
    var v = p.visit.prepared[i];
    if (v != null) return String(v).split(/[，,：:;；]/)[0].trim();
    var a = autoPrepared(p)[i];
    return MB.t(a.short || a, L);
  };

  /** 客户称呼；没填就回空串，由各处自己决定怎么写（不要印出「there」） */
  MB.namesOr = function (p) {
    return (p.client.names || '').trim();
  };

  MB.propertyLabel = function (p) {
    return [p.property.name, p.property.area].map(function (s) { return (s || '').trim(); })
      .filter(Boolean).join(' · ');
  };

  /* ---------- 日期 · 时间 ----------------------------------- */
  var WD_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var WD_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  var MO_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function parseISO(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  MB.parseISO = parseISO;

  MB.dateLabel = function (iso, lang, withYear) {
    var d = parseISO(iso);
    if (!d) return '';
    if (lang === 'zh') return (withYear ? d.getFullYear() + '年' : '') + (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WD_ZH[d.getDay()] + '）';
    return WD_EN[d.getDay()] + ', ' + d.getDate() + ' ' + MO_EN[d.getMonth()] + (withYear ? ' ' + d.getFullYear() : '');
  };
  MB.longDate = function (iso, lang) {
    var d = parseISO(iso);
    if (!d) return '';
    return lang === 'zh' ? d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日'
      : d.getDate() + ' ' + MO_EN[d.getMonth()] + ' ' + d.getFullYear();
  };
  MB.timeLabel = function (hm, lang) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(hm || '');
    if (!m) return '';
    var h = +m[1], mm = m[2], h12 = h % 12 || 12;
    if (lang === 'zh') return (h < 12 ? '上午 ' : h < 18 ? '下午 ' : '晚上 ') + h12 + ':' + mm;
    return h12 + ':' + mm + (h < 12 ? ' am' : ' pm');
  };
  /** 「星期六, 11 October · 2:00 pm」；没有日期回空串 */
  MB.slotLabel = function (date, time, lang) {
    var d = MB.dateLabel(date, lang);
    if (!d) return '';
    var t = MB.timeLabel(time, lang);
    return lang === 'zh' ? d + (t ? ' ' + t : '') : d + (t ? ' · ' + t : '');
  };

  /* ---------- 图库 ------------------------------------------- */
  /** ref → { src, w, h, series, rooms }；ref 形如 'b:misty-1'（内置）或 'u:xxx'（本机图库） */
  MB.makeResolver = function (userImages) {
    var map = {};
    MB.BUILTIN.forEach(function (b) { map[b.id] = b; });
    (userImages || []).forEach(function (u) { map['u:' + u.id] = u; });
    var fn = function (ref) { return ref ? map[ref] || null : null; };
    fn.map = map;
    return fn;
  };

  /** 所有图（内置 + 本机），给图库与自动配图用 */
  MB.allImages = function (userImages) {
    var list = (userImages || []).map(function (u) {
      return { ref: 'u:' + u.id, src: u.src, w: u.w, h: u.h, rooms: [u.tag], series: u.series || '', own: true, label: u.label || '' };
    });
    MB.BUILTIN.forEach(function (b) {
      list.push({ ref: b.id, src: b.src, w: b.w, h: b.h, rooms: b.rooms, series: b.series, own: false, label: b.zh });
    });
    return list;
  };

  /** 给一个空间自动挑图：自己图库里对得上的 > 同系列内置 > 其他内置；不重复用 */
  MB.autoPick = function (p, room, userImages, count) {
    count = count || 3;
    var used = {};
    p.rooms.forEach(function (r) { if (r !== room) r.images.forEach(function (ref) { used[ref] = 1; }); });
    var series = MB.dir(p).series;
    var cands = MB.allImages(userImages).filter(function (im) {
      return im.rooms.indexOf(room.key) > -1 && !used[im.ref];
    });
    cands.sort(function (a, b) { return score(b) - score(a); });
    function score(im) { return (im.own ? 4 : 0) + (im.series === series ? 2 : 0) + (im.w >= 900 ? 1 : 0); }
    if (!cands.length) return [];
    // 同一页只用同一系列（没标系列的自己的图除外），免得自己挑的图被体检判「混了系列」
    var hero = cands[0];
    var rest = cands.slice(1).filter(function (im) { return !im.series || !hero.series || im.series === hero.series; });
    return [hero].concat(rest).slice(0, count).map(function (im) { return im.ref; });
  };

  /** 封面 / 一页看懂 / 邀约 / 封底 用哪张：销售选的 > 自动 */
  MB.pageImage = function (p, slot, resolve) {
    var set = p.images[slot];
    if (set && resolve(set)) return set;
    var heroes = p.rooms.map(function (r) { return r.images[0]; }).filter(function (ref) { return ref && resolve(ref); });
    var prefer = ['living', 'kitchen', 'dining', 'master'];
    function byRoom(skip) {
      for (var i = 0; i < prefer.length; i++) {
        for (var j = 0; j < p.rooms.length; j++) {
          var ref = p.rooms[j].images[0];
          if (p.rooms[j].key === prefer[i] && ref && resolve(ref) && ref !== skip) return ref;
        }
      }
      for (var k = 0; k < heroes.length; k++) if (heroes[k] !== skip) return heroes[k];
      return null;
    }
    var series = MB.dir(p).series;
    /** 同系列的内置图，跳过已经出现在别处的 */
    function seriesPick(skip) {
      for (var i = 0; i < MB.BUILTIN.length; i++) {
        var b = MB.BUILTIN[i];
        if (b.series === series && b.rooms.indexOf('showroom') < 0 && !skip[b.id]) return b.id;
      }
      return null;
    }
    if (slot === 'cover') return byRoom(null) || seriesPick({});
    var cover = MB.pageImage(p, 'cover', resolve);
    if (slot === 'glance') {
      var second = null;
      p.rooms.forEach(function (r) { r.images.forEach(function (ref) { if (!second && ref !== cover && resolve(ref)) second = ref; }); });
      var skip = {};
      skip[cover] = 1;
      return second || seriesPick(skip) || cover;
    }
    if (slot === 'back') return 'b:hero-sail';
    if (slot === 'invite') {
      // 邀约页不要和前面任何一页撞图（封面、一页看懂、空间页、封底）
      var used = {};
      used[cover] = 1;
      if (p.pages.glance) used[MB.pageImage(p, 'glance', resolve)] = 1;
      if (p.pages.back) used[MB.pageImage(p, 'back', resolve)] = 1;
      p.rooms.forEach(function (r) { r.images.forEach(function (ref) { used[ref] = 1; }); });
      var pick = seriesPick(used);
      if (pick) return pick;
      for (var i = 0; i < MB.BUILTIN.length; i++) {
        var b = MB.BUILTIN[i];
        if (b.rooms.indexOf('showroom') < 0 && !used[b.id]) return b.id;
      }
      return !used['b:living-wide'] ? 'b:living-wide' : cover;
    }
    return null;
  };

  /* ---------- 页码 ------------------------------------------- */
  /** 依开关与资料决定有哪些页；回 [{type, room?}]，页码 = index + 1 */
  MB.pageList = function (p) {
    var pages = [{ type: 'cover' }];
    if (p.pages.glance) pages.push({ type: 'glance' });
    if (p.pages.needs && p.needs.length) pages.push({ type: 'needs' });
    if (p.pages.plan && p.plan.src) pages.push({ type: 'plan' });
    p.rooms.forEach(function (r) { pages.push({ type: 'room', room: r }); });
    if (p.pages.practical !== false && MB.hasPractical(p)) pages.push({ type: 'practical' });
    if (p.pages.language) pages.push({ type: 'language' });
    if (p.pages.invite) pages.push({ type: 'invite' });
    if (p.pages.back) pages.push({ type: 'back' });
    return pages;
  };
  MB.hasPractical = function (p) {
    var x = p.extra || {};
    return !!(String(x.timeline || '').trim() || String(x.budget || '').trim() || String(x.built || '').trim());
  };

  /** 马来西亚手机号 → wa.me 要的国际格式：012-345 6789 → 60123456789 */
  MB.msisdn = function (v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.charAt(0) === '0') return '6' + d;
    if (d.charAt(0) === '1' && d.length >= 9 && d.length <= 10) return '60' + d;
    return d;
  };

  /* ---------- 清洗方案 ----------------------------------------
     读档、导入同事的 .json 都先过这一关：只留认得的字段与格式，
     旧版存档补上新字段。导入的文件不可信 —— 任何字串都可能被塞进 HTML。 */
  var REF_RE = /^(b|u):[\w.-]{1,80}$/;
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
  function strOrNull(v, max) { return typeof v === 'string' ? v.slice(0, max) : null; }
  function ref(v) { return typeof v === 'string' && REF_RE.test(v) ? v : null; }
  function iso(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : ''; }
  function hm(v) { return /^\d{1,2}:\d{2}$/.test(v || '') ? v : ''; }
  function unit(v) { v = +v; return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5; }

  /** @param {{newId?: boolean}} opts  newId = 导入：换掉 id，免得覆盖本机的方案 */
  MB.normalizeProject = function (raw, opts) {
    opts = opts || {};
    var p = raw && typeof raw === 'object' ? raw : {};
    var out = MB.newProject({});
    if (!opts.newId && typeof p.id === 'string' && /^[\w-]{1,60}$/.test(p.id)) out.id = p.id;
    out.ts = +p.ts || Date.now();
    out.lang = ['en', 'zh', 'bi'].indexOf(p.lang) > -1 ? p.lang : 'en';
    out.label = str(p.label, 40);
    if (p.demo === true) out.demo = true;
    var c = p.client || {};
    out.client = { names: str(c.names, 120), honor: ['mr', 'ms', 'mrs', 'miss', 'teacher', 'designer'].indexOf(c.honor) > -1 ? c.honor : '', wa: MB.msisdn(c.wa) };
    var pr = p.property || {};
    out.property = { name: str(pr.name, 120), area: str(pr.area, 120), type: str(pr.type, 60), size: str(pr.size, 30) };
    out.date = iso(p.date) || out.date;
    var h = p.host || {};
    out.host = { name: str(h.name, 80) || out.host.name, role: str(h.role, 120) || out.host.role, wa: MB.msisdn(h.wa) || out.host.wa };
    if (MB.DIRECTION[p.direction]) out.direction = p.direction;
    var d = MB.DIRECTION[out.direction];
    function sw(list, def) {
      if (!Array.isArray(list) || !list.length) return clone(def);
      return def.map(function (x, i) {
        var s = list[i] || x;
        return { hex: MB.hex(s.hex), en: str(s.en, 60), zh: str(s.zh, 60) };
      });
    }
    out.palette = sw(p.palette, d.palette);
    out.materials = sw(p.materials, d.materials);
    out.promises = [0, 1, 2].map(function (i) { return strOrNull((p.promises || [])[i], 200); });

    var uidMap = {};
    out.rooms = (Array.isArray(p.rooms) ? p.rooms : []).filter(function (r) {
      return r && typeof r.key === 'string' && MB.ROOM.hasOwnProperty(r.key);
    }).slice(0, 30).map(function (r) {
      var keep = !opts.newId && typeof r.uid === 'string' && /^r-[a-z0-9]{1,40}$/.test(r.uid);
      var uid = keep ? r.uid : MB.uid('r-');
      if (typeof r.uid === 'string') uidMap[r.uid] = uid;
      var valid = MB.ROOM[r.key].feats.map(function (f) { return f.id; });
      return {
        uid: uid, key: r.key, title: strOrNull(r.title, 80) || null,
        images: (Array.isArray(r.images) ? r.images : []).map(ref).filter(Boolean).slice(0, 4),
        feats: (Array.isArray(r.feats) ? r.feats : []).filter(function (f) { return valid.indexOf(f) > -1; }),
        note: strOrNull(r.note, 600),
        manual: r.manual === true
      };
    });
    out.needs = (Array.isArray(p.needs) ? p.needs : []).slice(0, 12).map(function (n) {
      n = n || {};
      var o = {};
      if (typeof n.key === 'string' && MB.NEEDS.hasOwnProperty(n.key)) o.key = n.key;
      if (n.quote != null) o.quote = str(n.quote, 300);
      if (n.answer != null) o.answer = str(n.answer, 600);
      if (typeof n.room === 'string' && MB.ROOM.hasOwnProperty(n.room)) o.room = n.room;
      if (n.roomUid && uidMap[n.roomUid]) o.roomUid = uidMap[n.roomUid];
      return o;
    }).filter(function (n) { return n.key || n.quote != null; });

    var pl = p.plan || {};
    var src = typeof pl.src === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(pl.src) ? pl.src : null;
    out.plan = { src: src, w: src ? (+pl.w || 0) : 0, h: src ? (+pl.h || 0) : 0, pins: {} };
    if (src && pl.pins && typeof pl.pins === 'object') {
      Object.keys(pl.pins).forEach(function (k) {
        var pin = pl.pins[k];
        if (uidMap[k] && pin) out.plan.pins[uidMap[k]] = { x: unit(pin.x), y: unit(pin.y) };
      });
    }
    var v = p.visit || {};
    out.visit = {
      date: iso(v.date), time: hm(v.time) || '14:00', date2: iso(v.date2), time2: hm(v.time2) || '11:00',
      mins: Math.max(15, Math.min(480, +v.mins || 60)), auto: v.auto === true,
      prepared: [0, 1, 2].map(function (i) { return strOrNull((v.prepared || [])[i], 200); })
    };
    var pg = p.pages || {};
    Object.keys(out.pages).forEach(function (k) { if (typeof pg[k] === 'boolean') out.pages[k] = pg[k]; });
    var im = p.images || {};
    Object.keys(out.images).forEach(function (k) { out.images[k] = ref(im[k]); });
    var x = p.extra || {};
    out.extra = { notIncluded: str(x.notIncluded, 300), timeline: str(x.timeline, 300), budget: str(x.budget, 600), built: str(x.built, 1000) };
    out.brief = str(p.brief, 8000);
    return out;
  };

  /** 图库图片记录（导入的备份文件也要过这一关） */
  MB.normalizeImage = function (u) {
    if (!u || typeof u.id !== 'string' || !/^[\w-]{1,60}$/.test(u.id)) return null;
    if (typeof u.src !== 'string' || !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(u.src)) return null;
    var tags = MB.TAGS.map(function (t) { return t.key; }).concat(['plan']);
    return {
      id: u.id, tag: tags.indexOf(u.tag) > -1 ? u.tag : 'other', src: u.src,
      w: Math.max(1, +u.w || 1000), h: Math.max(1, +u.h || 1000),
      series: MB.DIRECTION[u.series] ? u.series : '', label: str(u.label, 80), source: str(u.source, 120), ts: +u.ts || Date.now()
    };
  };
  MB.roomPageNo = function (p, room) {
    var list = MB.pageList(p);
    for (var i = 0; i < list.length; i++) if (list[i].room === room) return i + 1;
    return 0;
  };
  MB.pageNoOf = function (p, type) {
    var list = MB.pageList(p);
    for (var i = 0; i < list.length; i++) if (list[i].type === type) return i + 1;
    return 0;
  };

  /* ---------- 邀请函链接（与 create.js 同一套参数） ---------- */
  MB.inviteLink = function (p) {
    var local = /^(localhost|127\.|0\.0\.0\.0|\[?::1)/.test(location.hostname) || location.protocol === 'file:';
    var base = (CFG.publicBase || '').replace(/\/$/, '');
    if (!base) base = location.origin + location.pathname.replace(/[^/]*$/, '').replace(/\/$/, '');
    var path = local && !CFG.publicBase ? base + '/index.html' : base + '/';

    var def = CFG.host || {};
    var team = CFG.team || [];
    var host = (p.host.name || '').trim();
    var me = null;
    for (var i = 0; i < team.length; i++) {
      if (team[i].name && team[i].name.toLowerCase() === host.toLowerCase()) { me = team[i]; break; }
    }
    var q = new URLSearchParams();
    if (p.client.names) q.set('for', p.client.names.trim());
    if (p.client.honor) q.set('title', p.client.honor);
    if (p.visit.date) q.set('on', p.visit.date);
    if (p.visit.time && p.visit.time !== '14:00') q.set('at', p.visit.time);
    if (p.visit.mins && +p.visit.mins !== 60) q.set('mins', String(+p.visit.mins));
    if (host && host !== def.name) {
      if (me && me.code) q.set('from', me.code);
      else {
        q.set('from', host);
        if (p.host.role && p.host.role !== def.role) q.set('role', p.host.role);
        var wa = MB.msisdn(p.host.wa);
        if (wa && wa !== String(def.wa || '')) q.set('wa', wa);
      }
    }
    var qs = q.toString();
    return { url: path + (qs ? '?' + qs : ''), local: local && !CFG.publicBase };
  };

  /** 文件名 = 打印对话框的预设档名 = PDF 标题：「SAIL x Mr & Mrs Lim - Sample Residence Setia Alam Home Proposal」 */
  MB.fileTitle = function (p) {
    var prop = MB.propertyLabel(p).replace(/ · /g, ' ');
    return 'SAIL x ' + ((p.client.names || '').trim() || 'Client') + (prop ? ' - ' + prop : '') + ' Home Proposal';
  };

})();
