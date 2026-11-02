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
  /** {en, zh} → HTML；双语时英文为主、中文小一号（旧版式用；方案 2.0 的页面用 deck.js 自己的 T()：华文在前） */
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
      // language 这个 key 沿用旧存档，现在是「品牌一页」。
      // 这是 moodboard：资讯多的页（工期·保障、团队、章节页）默认关，销售需要时自己打开
      pages: { letter: true, glance: true, needs: true, plan: true, chapter: false, cases: true, practical: false,
        language: true, team: false, invite: true, back: true },
      extra: { notIncluded: '', timeline: '', budget: '', built: '' },
      // 每一页的图：null = 自动（MB.deckImages 按方案 id 轮换，整份不重复）；销售在 ⑤ 选了就存 ref
      images: { cover: null, letter: null, glance: null, chapter: null, practical: null, language: null, team: null, invite: null, back: null },
      letter: null,          // 开场短话：null = 自动草稿（copy.js 的 MB.draftLetter），销售改过就存成字串
      // 「参考空间」（溪岸的实拍，不是客户案例）：[{ ref, note|null }]，最多 3。
      // 等云端案例库有每个项目的区域 / 房型 / 家庭资料，才改叫「像你们这样的家」
      cases: [],
      // 本案团队：先放接待的销售；其他人由销售填名字（没名字的那行不印）
      team: [{ role: 'sales', name: profile.host || host.name || '' }],
      paletteFrom: 'style',  // 'ref' = 配色取自客户发来的参考图（p.refImages）
      refImages: [],         // [{ src: dataURL ≤ 360px, w, h }]，最多 3
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

  /** 房间页印出来的特点：需求卡点到的排最前，而且照需求的先后排（页面只印 3 个名称，
      不能先砍掉客户最在乎的那条；WhatsApp 的重点也取第一个） */
  MB.roomFeats = function (p, room) {
    var def = MB.ROOM[room.key];
    var first = {};   // 卖点 id → 第一次点到它的需求是第几条
    p.needs.forEach(function (n, i) {
      var d = MB.needDef(p, n.key);
      if (d && d.feats && MB.needRoom(p, n) === room) d.feats.forEach(function (id) { if (first[id] == null) first[id] = i; });
    });
    var picked = def.feats.filter(function (f) { return room.feats.indexOf(f.id) > -1; });
    // 开放层架是「代替吊柜」：两个都勾时只印层架 —— 同一页不能又说有吊柜、又说没吊柜（旧存档、导入的方案可能两个都勾）
    if (room.feats.indexOf('openshelf') > -1) picked = picked.filter(function (f) { return f.id !== 'topbase'; });
    var hit = picked.filter(function (f) { return first[f.id] != null; });
    // 同一条需求点到的几个卖点维持资料库的顺序（sort 不保证稳定，自己比位置）
    hit.sort(function (a, b) { return first[a.id] - first[b.id] || picked.indexOf(a) - picked.indexOf(b); });
    return hit.concat(picked.filter(function (f) { return first[f.id] == null; }));
  };

  /** 「你们说的」页真正印出来的需求：原话是空的不印（编辑区按「＋」还没填的那一行），最多 3 条。
      deck、页码、讲稿、体检都用这一份，四处一致 */
  MB.printedNeeds = function (p) {
    return (p.needs || []).filter(function (n) {
      var q = MB.needQuote(n);
      if (q && typeof q === 'object') return !!String(q.zh || q.en || '').trim();
      return !!String(q || '').trim();
    }).slice(0, 3);
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

  // 准备的三样：每样 ≤ 16 字 / 9 words（moodboard 字数上限）
  var PREP_PLAN = { en: 'Your floor plan, printed large, to mark up together', zh: '按你们平面图打印的大图，现场一起改',
    short: { en: 'your floor plan, printed large', zh: '你们的平面图大图' } };
  var PREP_BOARDS = { en: 'Board and colour samples in your palette', zh: '按你们配色挑好的板材与色板',
    short: { en: 'board samples in your palette', zh: '你们配色的板材样板' } };
  var PREP_HARDWARE = { en: 'Hinges, runners and handles to try by hand', zh: '铰链、滑轨与把手，现场亲手试',
    short: { en: 'the hinges, runners and handles', zh: '铰链与滑轨样品' } };
  // 还没有空间、也没有平面图时的第三样（展厅一定有柜门与抽屉可以开关）
  var PREP_DOORS = { en: 'Doors and drawers to open and close', zh: '柜门与抽屉，现场亲手开关',
    short: { en: 'the door and drawer samples', zh: '柜门与抽屉样品' } };

  /** 有平面图才答应「打印大图」—— 客户在需求卡写了「没有平面图」，就别这样承诺
      （三种语言的需求卡都认：brief-parse.js 的 MB.briefSaysPlan） */
  MB.hasPlan = function (p) {
    if (p.plan.src) return true;
    return MB.briefSaysPlan ? MB.briefSaysPlan(p.brief) : /平面图[:：]\s*有/.test(p.brief || '');
  };

  function autoPrepared(p) {
    var hasPlan = MB.hasPlan(p);
    var auto = [];
    MB.roomPriority(p).forEach(function (r) {
      var prep = MB.ROOM[r.key].prep;
      if (prep && auto.length < (hasPlan ? 2 : 3) && auto.indexOf(prep) < 0) auto.push(prep);
    });
    if (hasPlan) auto.push(PREP_PLAN);
    // 永远凑满三样：邀约页印「01 02 03」，少一样会印出空的那一行
    [PREP_BOARDS, PREP_HARDWARE, PREP_DOORS].forEach(function (x) { if (auto.length < 3) auto.push(x); });
    return auto;
  }

  /** 销售写的第 i 样；空白（删光了）当作没写 —— 邀约页永远印满「01 02 03」 */
  function ownPrep(p, i) {
    var v = ((p.visit && p.visit.prepared) || [])[i];
    return typeof v === 'string' && v.trim() ? v : null;
  }
  /** 到馆那天准备的三样：销售写的 > 依客户在乎的空间推荐 > 平面图（永远 3 样） */
  MB.prepared = function (p) {
    var auto = autoPrepared(p);
    return [0, 1, 2].map(function (i) {
      var own = ownPrep(p, i);
      return own != null ? own : auto[i];
    });
  };
  /** 讲解稿 / 提醒里用的短说法（「把 ___ 准备好了」）；i = 0–2 永远有字 */
  MB.preparedShort = function (p, i, L) {
    var own = ownPrep(p, i);
    if (own != null) return String(own).split(/[，,：:;；]/)[0].trim() || String(own).trim();
    var a = autoPrepared(p)[i];
    return a ? MB.t(a.short || a, L) : '';
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

  /* ---------- 图库 -------------------------------------------
     老板：「图片的选择可以更多吗？不要完全用一样的」——
     1. 同一份方案里，同一张照片只出现一次（封面、情绪页、空间页、案例页加起来）
     2. 不同客户拿到不同的图：同分的候选之间用 p.id 当种子轮换（同一份每次打开都一样）
     3. 情绪页（开场、章节、品牌、团队、工期、封底）从「氛围照池」挑：
        先挑跟方案系列对得上的，再挑通用的；品牌照（MB.BRAND.photos）也在池子里
     照片优先序：客户 / 业务自己的图 > 同系列的空间照 > 氛围照 > 品牌照 */

  /** 字串 hash（FNV-1a，32 位）：方案 id → 种子 */
  function hashStr(s) {
    s = String(s || '');
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
      h >>>= 0;
    }
    return h >>> 0;
  }
  /** 简单的线性同余乱数：乘积不超过 2^53，ES5 也算得准 */
  function rng(seed) {
    var s = seed >>> 0;
    var next = function () { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    next(); next();   // 相邻的种子先走两步，开头才不会太像
    return next;
  }
  /** 依分数排（高的在前）；同分的用种子决定先后 —— 同一个 key 永远同一个顺序 */
  function rankBy(list, score, key) {
    var r = rng(hashStr(key));
    return list.map(function (x) { return { x: x, s: score(x), t: r() }; })
      .sort(function (a, b) { return b.s - a.s || a.t - b.t; })
      .map(function (o) { return o.x; });
  }
  MB.seedRank = rankBy;

  /* 同一张照片的不同裁切 / 不同档案（品牌手册与官网各存了一份）：当成同一张，整份只出现一次。
     加新照片时要重跑一次两两比对（模板匹配 NCC ≥ 0.94 的就是同一张：scratchpad 的 tools/samephoto.py）。
     - 柜角细节（detail-corner）是骨骼线高柜那张下缘裁出来、放大 2.7 倍的
     - 骨骼线走廊（misty-corridor）是 skeleton-1 的左半边 */
  var SAME_SHOT = [
    ['b:misty-3', 'b:misty-study'],
    ['b:living-wide', 'b:misty-living'],
    ['b:skeleton-kitchen', 'b:skeleton-kitchen-2'],
    ['b:skeleton-3', 'b:skeleton-kitchen-3', 'b:detail-corner'],
    ['b:skeleton-1', 'b:misty-corridor'],
    ['b:mountain-living', 'b:mountain-shelf']
  ];
  var SHOT = {};
  SAME_SHOT.forEach(function (g) { g.forEach(function (ref) { SHOT[ref] = g[0]; }); });
  function shot(ref) { return SHOT[ref] || ref; }
  MB.shotKey = shot;
  /* 不同的照片、同一个地方：开场的「草原上走路的人」（品牌照 letter）和「远山」拍的是同一道雪山山脊、
     同一片草原 —— 同一份方案只用其中一张（老板：「不要完全用一样的」）。只在自动挑图时让开，
     不算「同一张照片」（销售自己两张都选，是他的决定；体检另外提醒） */
  var SAME_PLACE = [
    ['b:land-hills', 'b:brand-letter']
  ];
  var PLACE = {};
  SAME_PLACE.forEach(function (g) { g.forEach(function (ref) { PLACE[ref] = 'place:' + g[0]; }); });

  /* 品牌照进图库：没有对应内置图的，给一个 b:brand-xxx 的 ref（选图弹窗选得到、存得进方案）；
     跟内置图是同一张的，直接用那张内置图的 ref（不会出现两次） */
  var BRAND_ALIAS = { brand: 'b:hero-sail', detail: 'b:detail', welcome: 'b:wall-panel-2' };
  /* 照片自己的焦点（object-position）：裁切时留哪一边。deck.js 的 photo() 写成行内样式，
     哪一页用到都一样（PPTX 照网页裁）。展厅一角（team）上缘有半个 SAIL 招牌：靠底裁，不露出半截字 */
  var BRAND_POS = { team: '50% 100%' };
  var brandCache = null;
  function brandImages() {
    if (brandCache) return brandCache;
    var ph = MB.BRAND && MB.BRAND.photos;
    if (!ph) return [];   // brand.js 比 model.js 晚载入：用到时才建
    brandCache = Object.keys(ph).filter(function (k) { return !BRAND_ALIAS[k]; }).map(function (k) {
      var b = ph[k], label = String(b.note || '').split(/\s*[—（(]/)[0];
      return { id: 'b:brand-' + k, src: b.src, w: b.w, h: b.h, series: '', rooms: ['mood'], en: label, zh: label, brand: k, pos: BRAND_POS[k] || '' };
    });
    return brandCache;
  }
  function builtins() { return MB.BUILTIN.concat(brandImages()); }
  /** 品牌照 key → 实际用的 ref */
  function brandRef(k) { return BRAND_ALIAS[k] || 'b:brand-' + k; }

  /* 氛围照适合放哪几页（整页出血的页要够大、白字压得住；工厂照不放「欢迎回家」）。
     room = 内置图库没有图的空间（浴室、梳妆台、神台）拿来当主图的细节 / 质感照。
     够不够大、直幅还是横幅，另外由 grade() 按版位大小打分；这里只管「意思对不对」。
     没列在这里的氛围照（以后加的、业务自己传的）每一页都可以 */
  var MOOD_FIT = {
    'b:land-hills': 'cover letter chapter back language practical glance invite',   // 风景不当空间页的主图（细节、质感照才当）
    // 直幅：不放整页出血的页；户外（天空、山、草地）也不当浴室、厨房的主图 —— 放在「台面不放瓶罐」旁边像放错图
    'b:land-boards': 'letter language practical team glance invite',
    'b:land-grassland': 'none',   // 1600 × 426 的窄长条（天空去掉了）：放进哪一格都只剩一小块 —— 只给销售手动选
    // 骨骼线高柜那张的下缘裁出来放大的（实际只有约 595 × 352）：只放得进拼贴的小格；
    // 跟骨骼线高柜是同一张（SAME_SHOT），整份只会出现其中一张
    'b:detail-corner': 'glance',
    'b:craft-touch': 'none',      // 深蓝外套抢了米色配色；横幅小图放进直幅版位会糊 —— 只给销售手动选
    'b:craft-inspect': 'none',    // 同上：843 宽，放进直幅要放大 1.45 倍
    'b:craft-pack': 'none',       // 裁成直幅时盒子上的 SAIL 字只剩倒着的半截
    'b:store-entrance': 'language team invite',
    'b:brand-cover': 'cover letter chapter back practical glance invite room',
    // 直幅：不放整页出血的章节页、封底；拼贴的直格（小风格的图库不够三张实景时）放得下
    'b:brand-letter': 'letter language invite glance',
    'b:hero-sail': 'language team',
    'b:brand-craft': 'practical chapter back glance invite room',
    'b:detail': 'letter practical invite room glance',   // 实木斗柜的细节：工期·保障页（质保、五金）正合适；直幅，拼贴的直格也放得下
    'b:brand-team': 'team language invite',
    'b:brand-showroom': 'team',
    'b:wall-panel-2': 'letter practical'   // 品牌的「欢迎回家」照是直幅（1080 × 1440）：放进整页封底只剩四成，改放开场、工期页（护墙与门，是我们做的东西）
  };
  /* 品牌照里真的拍到某一个系列的（护墙与门 = 雾山的浅橡木护墙）：只有那个系列的方案当它「对得上」；
     别的风格排在意思对的氛围照、风格实景后面（跟意思不对的同一级）—— 不然微侘寂的第 2 页会是一间浅橡木客厅。
     其他品牌照（实木斗柜细节、门面…）哪个风格都可以用 */
  var SERIES_LOCK = { 'b:wall-panel-2': 1 };
  /* 每个版位最后的退路（品牌照；会重复，所以排在所有图之后）。
     整页出血的章节页、封底要横的大图：木格柜细节、老木板（品牌的「欢迎回家」是直幅，放整页只剩四成） */
  var SLOT_BRAND = { cover: 'cover', letter: 'letter', chapter: 'craft', practical: 'craft', language: 'brand', team: 'team', invite: 'team', back: 'cover' };
  /* 整页出血的情绪页：意思不对的图（展厅、门面）宁可不放，改用方案风格的实景 */
  var BLEED = { chapter: 1, back: 1 };
  /* 版位：哪些用空间照（风格对上的实景），哪些是情绪页（氛围照池） */
  var ROOM_SLOTS = { cover: 1, glance: 1, invite: 1 };
  /* 每个版位在页面上的大小（deck.js 的版面表）：用来判断直幅 / 横幅对不对、够不够大。
     拼贴：glance = 小格，glanceTall = 左边整高那一格，glanceWide = 上面横的那一格 */
  var SLOT_BOX = { cover: [1120, 720], letter: [600, 720], glance: [296, 280], glanceTall: [416, 720], glanceWide: [720, 400],
    chapter: [1280, 720], practical: [600, 720], language: [640, 720], team: [600, 720], invite: [600, 720], back: [1280, 720],
    room: [720, 720] };
  /**
   * 一张图放进一个版位（object-fit: cover）合不合适：2 好 · 1 可以 · 0 会糊或裁掉太多。
   * keep = 裁完还看得到原图的几成；up = 要放大几倍（超过 1.35 倍，打印出来看得出糊）。
   * 分数故意分得粗：同一级的候选按方案 id 轮换，不同客户才拿到不同的图
   */
  function grade(box, c) {
    if (!box || !c || !c.w || !c.h) return 1;
    var s = Math.max(box[0] / c.w, box[1] / c.h);
    var keep = (box[0] * box[1]) / (c.w * c.h * s * s);
    if (keep >= 0.55 && s <= 1.25) return 2;
    if (keep >= 0.4 && s <= 1.35) return 1;
    return 0;
  }
  MB.photoGrade = function (slot, c) { return grade(SLOT_BOX[slot], c); };
  /** 放大不超过 1.6 倍、至少看得到三成：打印出来稍软，但还看得清 */
  function softOk(box, c) {
    if (!box || !c || !c.w || !c.h) return true;
    var s = Math.max(box[0] / c.w, box[1] / c.h);
    return s <= 1.6 && (box[0] * box[1]) / (c.w * c.h * s * s) >= 0.3;
  }

  /* 空间页的拼法（照片区 720 × 720，deck.css 的 .rm-imgs）：看照片是直是横，挑裁得最少的那一种 */
  var ROOM_LAYOUTS = {
    l1: [[720, 720]],
    l2: [[720, 472], [720, 240]],                   // 主图在上，横的辅图在下
    l2v: [[356, 720], [356, 720]],                  // 两张直的并排
    l3: [[720, 472], [356, 240], [356, 240]],       // 主图在上，两张辅图在下
    l3v: [[476, 720], [236, 356], [236, 356]]       // 直的主图在左，两张辅图叠在右边
  };
  function keepOf(box, c) {
    if (!c || !c.w || !c.h) return 0.6;
    var s = Math.max(box[0] / c.w, box[1] / c.h);
    return (box[0] * box[1]) / (c.w * c.h * s * s);
  }
  /** 主图 + 候选辅图 → 最好的拼法 { name, list }：每一张至少看得到原图的 38%（不然不如不放）；
      主图的完整度算两倍；能多放一张就多放（这是 moodboard） */
  function roomLayout(cs) {
    var best = null;
    function tryIt(name, list) {
      var boxes = ROOM_LAYOUTS[name], sc = list.length * 0.6;
      for (var i = 0; i < list.length; i++) {
        var k = keepOf(boxes[i], list[i]);
        if (name !== 'l1' && k < 0.38) return;
        sc += k * (i ? 1 : 2);
      }
      if (!best || sc > best.sc + 0.001) best = { name: name, list: list, sc: sc };
    }
    var h = cs[0], a = cs[1], b = cs[2];
    tryIt('l1', [h]);
    [a, b].forEach(function (x) { if (x) { tryIt('l2', [h, x]); tryIt('l2v', [h, x]); } });
    if (a && b) { tryIt('l3', [h, a, b]); tryIt('l3v', [h, a, b]); }
    return best;
  }
  /** 页面 type → 版位（只有这些页有可以换的图） */
  MB.IMAGE_SLOTS = ['cover', 'letter', 'glance', 'chapter', 'practical', 'language', 'team', 'invite', 'back'];

  /** ref → { src, w, h, series, rooms }；ref 形如 'b:misty-1'（内置）或 'u:xxx'（本机图库） */
  MB.makeResolver = function (userImages) {
    var map = {};
    builtins().forEach(function (b) { map[b.id] = b; });
    (userImages || []).forEach(function (u) { map['u:' + u.id] = u; });
    var fn = function (ref) { return ref ? map[ref] || null : null; };
    fn.map = map;
    // 记住最近一个：MB.pageList(p) 没带 resolve 时（页码、讲稿）也能判断案例图找不找得到
    MB.makeResolver.last = fn;
    return fn;
  };

  /** 所有图（内置 + 品牌照 + 本机），给图库与自动配图用 */
  MB.allImages = function (userImages) {
    var list = (userImages || []).map(function (u) {
      return { ref: 'u:' + u.id, src: u.src, w: u.w, h: u.h, rooms: [u.tag], series: u.series || '', own: true, label: u.label || '' };
    });
    builtins().forEach(function (b) {
      list.push({ ref: b.id, src: b.src, w: b.w, h: b.h, rooms: b.rooms, series: b.series, own: false, label: b.zh });
    });
    return list;
  };

  /** 一个空间能用的图，排好序：自己图库里对得上的 > 同系列内置 > 其他内置；同分的按方案 id 轮换。
      list = MB.allImages 的形状；used = 已经用掉的照片（shotKey → 1）。autoPick 与 deckImages 共用 */
  function roomCands(p, room, list, used) {
    var series = MB.dir(p).series;
    var cands = list.filter(function (im) {
      return (im.rooms || []).indexOf(room.key) > -1 && !used[shot(im.ref)];
    });
    // 够大、而且不是超宽的全景（放进 720 × 720 的主图位置至少看得到 45%）才加分：
    // 超宽的（门厅、客厅 2.5 : 1 的全景）会排到辅图（720 × 240 的横条正好）或封面、拼贴
    function score(im) {
      var ok = Math.max(im.w, im.h) >= 900 && keepOf(SLOT_BOX.room, im) >= 0.45;
      return (im.own ? 4 : 0) + (im.series === series ? 2 : 0) + (ok ? 1 : 0);
    }
    // 同类的第几间（两间儿童房各自轮换，不会挑到一样的顺序）
    var nth = 0;
    p.rooms.forEach(function (r) { if (r.key === room.key && p.rooms.indexOf(r) < p.rooms.indexOf(room)) nth++; });
    return rankBy(cands, score, (p.id || '') + ':room:' + room.key + ':' + nth);
  }

  /** 销售亲手选的（开着的页的版位图 + 案例）：{ shotKey: 用在哪 }。
      这些一定照印，所以自动配图要让开 —— 不然同一张会出现两次 */
  function handPicked(p, resolve) {
    var out = {}, types = {};
    MB.pageList(p, resolve).forEach(function (pg) { types[pg.type] = 1; });
    var images = p.images || {};
    MB.IMAGE_SLOTS.forEach(function (slot) {
      if (types[slot] && images[slot]) out[shot(images[slot])] = slot;
    });
    if (types.cases) MB.caseRefs(p, resolve).forEach(function (c) { out[shot(c.ref)] = 'cases'; });
    return out;
  }
  MB.handPicked = function (p, resolve) { return handPicked(p, resolve || MB.makeResolver.last); };

  /** 给一个空间自动挑图：自己图库里对得上的 > 同系列内置 > 其他内置；
      不跨空间重复，也不用销售已经放在封面 / 情绪页 / 案例的那几张；
      同分的之间按方案 id 轮换 —— 不要每个客户的厨房都是同一张 */
  MB.autoPick = function (p, room, userImages, count) {
    count = count || 3;
    var used = handPicked(p, MB.makeResolver.last);
    p.rooms.forEach(function (r) { if (r !== room) r.images.forEach(function (ref) { used[shot(ref)] = 1; }); });
    var cands = roomCands(p, room, MB.allImages(userImages), used);
    if (!cands.length) return [];
    // 同一页只用同一系列（没标系列的自己的图除外），免得自己挑的图被体检判「混了系列」；同一张照片的裁切不放两次
    var hero = cands[0], seen = {};
    seen[shot(hero.ref)] = 1;
    var rest = cands.slice(1).filter(function (im) {
      if (seen[shot(im.ref)]) return false;
      // 主图有系列：辅图也要同系列（没标系列的内置图风格不一定对得上；只有自己的图例外）
      if (hero.series && im.series !== hero.series && !(im.own && !im.series)) return false;
      seen[shot(im.ref)] = 1;
      return true;
    });
    return [hero].concat(rest).slice(0, count).map(function (im) { return im.ref; });
  };

  /** 图库里所有候选：{ ref, w, h, series, rooms, own, mood } */
  function pool(resolve) {
    var map = resolve && resolve.map;
    var out = [];
    if (map) {
      Object.keys(map).forEach(function (ref) {
        var b = map[ref];
        var own = ref.indexOf('u:') === 0;
        var rooms = own ? [b.tag] : (b.rooms || []);
        out.push({ ref: ref, w: +b.w || 0, h: +b.h || 0, series: b.series || '', rooms: rooms, own: own });
      });
    } else {
      builtins().forEach(function (b) { out.push({ ref: b.id, w: b.w, h: b.h, series: b.series || '', rooms: b.rooms, own: false }); });
    }
    // 同一张照片的不同档案：只留第一个（品牌照的别名本来就指向内置图）
    out.forEach(function (c) {
      c.mood = c.rooms.indexOf('mood') > -1 || !!MOOD_FIT[c.ref];
      c.room = !c.mood && c.rooms.some(function (k) { return MB.ROOM[k]; });   // 平面图、展厅、其他 都不算空间照
    });
    return out;
  }
  function fits(c, slot) {
    var f = MOOD_FIT[c.ref];
    return f ? (' ' + f + ' ').indexOf(' ' + slot + ' ') > -1 : true;
  }
  /** 本机图库的 resolve 可能不认得品牌照（测试或旧的 resolver）：自己补上 */
  function look(resolve, ref) {
    if (!ref) return null;
    var im = resolve ? resolve(ref) : null;
    if (im) return im;
    var b = builtins();
    for (var i = 0; i < b.length; i++) if (b[i].id === ref) return b[i];
    return null;
  }

  /**
   * 整份方案每一页用哪几张图（预览、PDF、PPTX、⑤ 的缩图都用这一份）。
   * 老板：「不要完全用一样的」—— 同一张照片（含同一张的不同裁切）整份只出现一次；不同客户按方案 id 轮换。
   * 顺序（前面的先挑，后面的只能用剩下的）：
   *   1 销售亲手选的版位图、案例：一定照印
   *   2 空间主图：手选过的空间照销售的；自动配的空间让开 1 用掉的，整组都被用掉就从图库重挑一张
   *   3 封面（= WhatsApp 预览）：方案风格的实景 —— 在空间辅图之前先留好，不然小风格的图库会被辅图用光
   *   4 一页看懂：先留第一格 + 1 张风格实景（预留，最后照实际格子大小重挑）
   *   4b 封底、章节页（整页出血，能放的横幅大图不多）
   *   5 没有图的空间（浴室、梳妆台、神台…）：一张风格对得上、够清楚的细节 / 质感照当主图，不留一整页空白
   *     （风景不当主图；挑不到就让那一页用没有图的版式）
   *   5b 开场（第 2 页）：按方案 id 轮换，不要每个客户都剩同一张
   *   6 空间辅图（最多 2 张）
   *   7 拼贴补满（先决定几格再照格子大小挑；实景不到 3 张补氛围照，最多 2 张）→ 邀约 → 情绪页（工期、品牌、团队）
   *   关着的页最后才算（只给 ⑤ 的缩图看，不占前面的图）。
   * 每一张都看版位的直幅 / 横幅与大小（grade）：整页出血放横的大图，直幅版位放直的。
   * 情绪页挑不到意思对的氛围照时，先用方案风格的实景（够清楚的），再用意思不对的（章节页、封底不用）。
   * 同一个地方的两张（SAME_PLACE：同一道山脊）也只用一张。
   * @returns {{ rooms: Object<uid, string[]>, slot: Object<slot, string|null>, glance: string[], glanceWide: boolean,
   *            moodRooms: string[], dups: Array<{ ref: string, where: string[] }> }}
   *   ref 可能是 'b:brand-xxx'（品牌照）。glanceWide = 拼贴第一格是横的（放上面）。
   *   moodRooms = 主图是氛围照代替的空间 uid。
   *   dups = 还是重复了的照片（销售在两个地方亲手选了同一张）；where 是 'cover'、'glance'、'cases'、'room:<uid>'…
   *   （跟预览的 data-goto 同一套，体检可以直接当「去改」）
   */
  MB.deckImages = function (p, resolve) {
    resolve = resolve || MB.makeResolver.last || MB.makeResolver([]);
    var used = {};
    // 同一张（含裁切）、同一个地方（同一道山脊的两张）都只用一次
    function take(ref) { used[shot(ref)] = 1; if (PLACE[ref]) used[PLACE[ref]] = 1; }
    function free(ref) { return !used[shot(ref)] && !(PLACE[ref] && used[PLACE[ref]]); }
    // 拼贴先预留的那一格：最后照实际格子大小重挑时先放回去（没挑上的，后面的页还能用）
    function release(ref) { delete used[shot(ref)]; if (PLACE[ref]) delete used[PLACE[ref]]; }
    var out = { rooms: {}, roomLayout: {}, slot: {}, glance: [], glanceWide: false, moodRooms: [], dups: [] };
    var series = MB.dir(p).series;
    var seed = String(p.id || '');
    var images = p.images || {};
    var all = pool(resolve);
    var byRef = {};
    all.forEach(function (c) { byRef[c.ref] = c; });
    var types = {};
    MB.pageList(p, resolve).forEach(function (pg) { types[pg.type] = 1; });
    function on(slot) { return !!types[slot]; }
    /** 销售在 ⑤ 选的那张（找得到才算） */
    function set(slot) { var ref = images[slot]; return ref && look(resolve, ref) ? ref : null; }
    /** 方案风格的实景（自己的、没标系列的空间照也算） */
    function mine(c) { return c.room && (c.series === series || (c.own && !c.series)); }

    /** 这张图放在这个版位几分（0 = 不放）。分数分得粗：同一级的按种子轮换，不同客户才拿到不同的图 */
    // 拼贴的小格：第一格是横的（.wide）→ 下面一排直的小格 235 × 312；直的 → 右边一列横的小格 296 × 235
    var gBox = null;
    function boxOf(slot) { return slot === 'glance' && gBox ? gBox : SLOT_BOX[slot]; }
    function score(slot, c) {
      var g = grade(boxOf(slot), c);
      if (ROOM_SLOTS[slot] && c.room) {
        if (!mine(c)) return 1;            // 别的风格的实景：排在所有氛围照后面，什么都没有才用
        if (c.own) return 100 + g;         // 客户 / 业务自己的图最优先
        if (g) return 60;                  // 好的、可以的同一级（同级按种子轮换）
        // 稍微小一点的风格实景还是比风景好（老板：封面、拼贴要看得到他们的风格）；糊得明显的才让给氛围照。
        // 邀约页不是看风格的页：放大的实景排在清楚的氛围照（40）后面
        return softOk(boxOf(slot), c) ? (slot === 'invite' ? 38 : 45) : 35;
      }
      // 情绪页（开场、章节、工期、品牌、团队、封底）挑不到对得上的氛围照时：
      // 一张方案风格、够清楚的实景，比展厅、门面、放大两倍的糊图好（真的房间，而且是他们的风格）
      if (slot !== 'room' && !ROOM_SLOTS[slot] && c.room) return mine(c) && g ? 16 + g : 0;
      if (!c.mood || MOOD_FIT[c.ref] === 'none') return 0;
      if (c.own) return 90 + g;            // 业务自己传的氛围照
      // 拍到别的系列的品牌照（雾山的护墙与门放进微侘寂方案）：跟意思不对的同一级，什么都没有才用
      if (SERIES_LOCK[c.ref] && c.series && c.series !== series) return slot === 'room' || BLEED[slot] ? 0 : 2 + g;
      // 先挑跟方案系列对得上的，再挑通用的（没标系列的、品牌照）；标了别的系列的氛围照不用
      var m = c.series === series ? 50 : !c.series || brandKeyOf(c.ref) ? 30 : 0;
      if (!m) return 0;
      // 没图的空间拿来当主图（720 × 720）：要够清楚，糊的不放（宁可那一页不放图）
      if (slot === 'room' && !g) return 0;
      // 意思不对：只在什么都没有时才用（还是比重复好）；这时也先挑直横对得上的。
      // 整页出血的章节页、封底不用（展厅、门面整页铺满，像家具店的广告；白字也压不住）
      if (!fits(c, slot)) return slot === 'room' || BLEED[slot] ? 0 : 2 + g;
      if (ROOM_SLOTS[slot]) m = Math.min(m, 30);           // 封面、拼贴、邀约：氛围照排在风格实景后面（最高 40 < 45）
      // 糊的（g = 0）排在风格实景（16–18）后面
      return g === 2 ? m + 10 : g === 1 ? m + 5 : 15;
    }
    /** 还没用过、放得进这个版位的图：分数高的先，同分按种子轮换 */
    function ranked(slot, only) {
      return rankBy(all.filter(function (c) { return free(c.ref) && (!only || only(c)) && score(slot, c) > 0; }),
        function (c) { return score(slot, c); }, seed + ':' + slot);
    }
    /** 封面（= WhatsApp 预览）要每个客户不一样：小风格的图库（微侘寂、织）够清楚的风格实景只剩一两张时，
        每个客户都拿到同一张 —— 这时把稍微小一点（放大 ≤ 1.6 倍，盖了暗层看不太出来）的风格实景一起按种子轮换 */
    function varied(slot, list) {
      var sharp = list.filter(function (c) { var s = score(slot, c); return s >= 60 && s < 90; }).length;
      if (sharp >= 3) return list;
      // 裁掉超过一半的（直幅的抽屉特写放进横的封面）不算：那样封面只剩一条
      return rankBy(list, function (c) {
        var s = score(slot, c);
        return s >= 90 ? s : s >= 45 && keepOf(SLOT_BOX[slot], c) >= 0.45 ? 60 : s;
      }, seed + ':' + slot + ':varied');
    }
    /** 情绪页（开场、工期…）：同系列的氛围照只有一两张时（雾山的护墙与门、骨骼线的斗柜细节），
        排第一就等于每个同风格的客户都拿到同一张 —— 这时跟通用的氛围照同一级、按种子轮换；够三张才真的排前面 */
    function moodVaried(slot, list) {
      function top(c) { var s = score(slot, c); return s >= 55 && s < 90; }
      var n = list.filter(top).length;
      // 开场（第 2 页）：意思对的氛围照剩不到 3 张时（浴室、梳妆台先拿走了细节照，封底拿走了远山），
      // 清楚的风格实景（直幅、裁得少，score 18）也一起轮换 —— 规格本来就是「没有就用风格对上的空间图」；
      // 不然同风格的客户第 2 页几乎都是同一张
      var good = list.filter(function (c) { var s = score(slot, c); return s >= 35 && s < 90; }).length;
      var lift = slot === 'letter' && good < 3;
      if ((!n || n >= 3) && !lift) return list;
      return rankBy(list, function (c) {
        var s = score(slot, c);
        if (n && n < 3 && top(c)) return s - 20;
        return lift && c.room && s === 18 ? 40 : s;
      }, seed + ':' + slot + ':varied');
    }
    function slotPick(slot) {
      var ref = set(slot);
      if (!ref) {
        var list = ranked(slot);
        var hit = (slot === 'cover' ? varied(slot, list) : ROOM_SLOTS[slot] ? list : moodVaried(slot, list))[0];
        ref = hit ? hit.ref : null;
        // 整个图库都用完了：用这一页的品牌照（会重复 —— 记在 dups，体检会提醒）
        if (!ref && SLOT_BRAND[slot] && look(resolve, brandRef(SLOT_BRAND[slot]))) ref = brandRef(SLOT_BRAND[slot]);
      }
      if (ref) take(ref);
      return ref;
    }

    /* 一页看懂的拼贴：第一格看照片 —— 直的放左边整高、横的放上面（看哪一种裁得少）；其余格子放风格实景。
       格子多大要看一共几张（deck.css 的 .gl-col.n2 / n3 / n4）：所以先决定几张，再照「那个大小」挑图 ——
       照 4 格的小方块挑、最后只放 2 张，就会把一张横的风景塞进 296 × 720 的直条，只剩两成。
       风格实景（含第一格）不到 3 张时，补氛围照（最多 2 张、直的优先）凑成 3 格；凑不到 3 格，
       第二格是整高的直条，只放直的（横的全景放进去只剩一条缝）。 */
    var GL_CELL = { tall: { 2: [296, 720], 3: [296, 356], 4: [296, 235] }, wide: { 2: [720, 356], 3: [356, 312], 4: [235, 312] } };
    // 每一格至少看得到原图的几成（跟空间页辅图同一条线）；2 张时的整高直条更严：0.45 = 只收直的、接近方的，横的一张都放不进去
    var GL_KEEP = { 2: 0.45, 3: 0.38, 4: 0.38 };
    function glCell(n) { return GL_CELL[out.glanceWide ? 'wide' : 'tall'][n]; }
    function glanceStart() {
      var g = { list: [], moods: 0 };
      var first = set('glance');
      if (!first) {
        var c = rankBy(all.filter(function (x) { return free(x.ref) && mine(x); }), function (x) {
          return (x.own ? 10 : 0) + Math.max(grade(SLOT_BOX.glanceTall, x), grade(SLOT_BOX.glanceWide, x));
        }, seed + ':glance:1')[0];
        first = c ? c.ref : null;
      }
      if (!first) return g;
      var im = look(resolve, first) || {};
      var fc = byRef[first];
      g.list.push(first); take(first);
      if (fc && fc.mood) g.moods = 1;
      out.glanceWide = grade(SLOT_BOX.glanceWide, im) > grade(SLOT_BOX.glanceTall, im);
      // 先替拼贴留一张风格实景（照最常见的 3 格大小挑）：不然小风格的图库会先被空间辅图、邀约页用光。
      // 最后 glanceFinish 照实际几格重挑，没挑上的会放回去
      gBox = glCell(3);
      var keep = ranked('glance', mine).filter(function (x) { return keepOf(gBox, x) >= GL_KEEP[3]; })[0];
      if (keep) { g.list.push(keep.ref); take(keep.ref); }
      return g;
    }
    /** 这一格大小（box）放得下的氛围照：意思对得上拼贴、看得到够多；直的（裁得少的）排前面，同级按种子轮换 */
    function glanceMoods(box, minKeep, n) {
      return rankBy(all.filter(function (c) {
        return free(c.ref) && c.mood && score('glance', c) >= 25 && keepOf(box, c) >= minKeep;
      }), function (c) {
        return (c.own ? 10 : 0) + grade(box, c) + (keepOf(box, c) >= 0.7 ? 1 : 0);
      }, seed + ':glance:mood:' + n);
    }
    function glanceFinish(g) {
      // 预留的那一张先放回去，跟其他候选一起照最后的格子大小重挑
      g.list.slice(1).forEach(release);
      var list = g.list.slice(0, 1);
      // 风格实景被空间页用光了（第一格也没有）：第一格用一张氛围照，看直横决定放左边还是上面
      if (!list.length) {
        var m0 = rankBy(all.filter(function (c) { return free(c.ref) && c.mood && score('glance', c) >= 25; }), function (c) {
          return (c.own ? 10 : 0) + Math.max(grade(SLOT_BOX.glanceTall, c), grade(SLOT_BOX.glanceWide, c));
        }, seed + ':glance:mood:1')[0];
        if (m0) {
          list = [m0.ref]; take(m0.ref); g.moods = 1;
          var im0 = look(resolve, m0.ref) || {};
          out.glanceWide = grade(SLOT_BOX.glanceWide, im0) > grade(SLOT_BOX.glanceTall, im0);
        }
      }
      var rest = [];
      /** 一张一张拿（同一张的裁切、同一个地方的两张，拿了一张另一张就不 free） */
      function fill(cands, upto) {
        cands.forEach(function (c) {
          if (rest.length < upto && free(c.ref) && keepOf(gBox, c) >= GL_KEEP[n]) { rest.push(c.ref); take(c.ref); }
        });
      }
      if (list.length) {
        // 先决定几格：4 格只放风格实景；3 格可以补氛围照（实景不到 3 张时，最多 2 张氛围照）；2 格要直条放得下
        for (var n = 4; n >= 2; n--) {
          gBox = glCell(n);
          fill(ranked('glance', mine), n - 1);
          if (rest.length < n - 1 && n <= 3 && (g.moods ? 0 : 1) + rest.length < 3) {
            fill(glanceMoods(gBox, GL_KEEP[n], n), Math.min(n - 1, rest.length + 2 - g.moods));
          }
          if (rest.length === n - 1) break;
          rest.forEach(release);   // 凑不满这么多格：放回去，少一格再试
          rest = [];
        }
      }
      out.glance = list.concat(rest);
      out.slot.glance = out.glance[0] || null;
    }
    // 1 · 销售亲手选的：开着的页的版位图、案例 —— 一定照印
    MB.IMAGE_SLOTS.forEach(function (slot) { if (on(slot) && set(slot)) take(set(slot)); });
    if (on('cases')) MB.caseRefs(p, resolve).forEach(function (c) { take(c.ref); });

    // 2 · 空间主图：手选过的空间照销售的（就算跟封面重复也是他选的 → dups，体检提醒）；
    //     自动配的空间让开前面用掉的，整组都被用掉就从图库重挑一张（跟 autoPick 同一套排序）
    var live = {};
    p.rooms.forEach(function (r) {
      live[r.uid] = (r.images || []).filter(function (ref) { return look(resolve, ref); });
      out.rooms[r.uid] = [];
    });
    // 手选空间的辅图（最多 2 张）也先留住：不然封面、拼贴、开场会先拿走销售挑的图。第 6 步照版式再决定放几张
    var held = {};
    p.rooms.forEach(function (r) {
      if (!r.manual || !live[r.uid].length) return;
      out.rooms[r.uid].push(live[r.uid][0]); take(live[r.uid][0]);
      held[r.uid] = [];
      live[r.uid].slice(1).forEach(function (ref) {
        if (held[r.uid].length < 2 && free(ref)) { held[r.uid].push(ref); take(ref); }
      });
    });
    p.rooms.forEach(function (r) {
      if (r.manual) return;   // 销售把图都拿掉了：不替他补实景（下面第 5 步会放一张氛围照）
      var hero = live[r.uid].filter(free)[0];
      // 只有「原本有图、但都被别页用掉」才重挑；本来就没有图的空间不偷偷补（③ 会显示还没有图），第 5 步放氛围照
      if (!hero && live[r.uid].length) { var c = roomCands(p, r, all, used)[0]; hero = c ? c.ref : null; }
      if (hero) { out.rooms[r.uid].push(hero); take(hero); }
    });

    // 3 · 封面
    if (on('cover')) out.slot.cover = slotPick('cover');
    // 4 · 一页看懂：先留第一格 + 1 张
    var gl = on('glance') ? glanceStart() : null;
    // 4b · 封底（峰终：最后看到的那一页）、章节页要整页横的大图，能放的不多 —— 在空间页的氛围照、
    //      辅图、拼贴补满之前先挑（不然只剩展厅、门面）
    if (on('back')) out.slot.back = slotPick('back');
    if (on('chapter')) out.slot.chapter = slotPick('chapter');
    // 5 · 没有图的空间：风格对得上的氛围 / 细节照
    p.rooms.forEach(function (r) {
      if (out.rooms[r.uid].length) return;
      var c = ranked('room')[0];
      if (c) { out.rooms[r.uid].push(c.ref); take(c.ref); out.moodRooms.push(r.uid); }
    });
    // 5b · 开场（第 2 页，客户最先看到的几页之一）：在辅图、邀约、拼贴补满之前先挑，按方案 id 轮换。
    //      排在最后的话，前面的页把意思对的氛围照用光了，每个客户的第 2 页都剩同一张
    if (on('letter')) out.slot.letter = slotPick('letter');
    // 6 · 空间辅图：前面没用到的才放，最多 2 张；看直横挑拼法，裁到只剩一条缝的辅图不放（留给别页）
    p.rooms.forEach(function (r) {
      var keep = out.rooms[r.uid];
      out.roomLayout[r.uid] = keep.length ? 'l1' : '';
      if (!keep.length || out.moodRooms.indexOf(r.uid) > -1) return;
      if (held[r.uid]) held[r.uid].forEach(release);   // 第 2 步留住的：放回来，下面照版式挑（没用上的留给后面的页）
      var subs = live[r.uid].filter(function (ref) { return free(ref) && ref !== keep[0]; }).slice(0, 2);
      if (!subs.length) return;
      var cs = [keep[0]].concat(subs).map(function (ref) { var im = look(resolve, ref) || {}; return { ref: ref, w: +im.w || 0, h: +im.h || 0 }; });
      var lay = roomLayout(cs);
      out.roomLayout[r.uid] = lay.name;
      lay.list.slice(1).forEach(function (c) { keep.push(c.ref); take(c.ref); });
    });
    // 7 · 邀约 → 拼贴补满 → 情绪页（开着的页先，关着的最后）
    var later = [];
    // 封底、章节页已经在 4b 挑过；开场在 5b。
    // 拼贴（第 4 页）在邀约之前补满：邀约页还有门面、展厅可以放，拼贴放得下的氛围照只有那几张
    ['cover', 'glance', 'invite', 'back', 'letter', 'chapter', 'language', 'practical', 'team'].forEach(function (slot) {
      if ((slot === 'cover' || slot === 'back' || slot === 'chapter' || slot === 'letter') && on(slot)) return;   // 第 3、4b、5b 步挑过了
      if (!on(slot)) { later.push(slot); return; }
      if (slot === 'glance') glanceFinish(gl);
      else out.slot[slot] = slotPick(slot);
    });
    later.forEach(function (slot) {
      if (slot === 'glance') glanceFinish(glanceStart());
      else out.slot[slot] = slotPick(slot);
    });

    // 还是重复了的（只算印出来的页）：交给体检
    var seen = {}, keys = [];
    function mark(ref, where) {
      if (!ref) return;
      var k = shot(ref);
      if (!seen[k]) { seen[k] = { ref: ref, where: [] }; keys.push(k); }
      seen[k].where.push(where);
    }
    p.rooms.forEach(function (r) { out.rooms[r.uid].forEach(function (ref) { mark(ref, 'room:' + r.uid); }); });
    MB.IMAGE_SLOTS.forEach(function (slot) {
      if (!on(slot)) return;
      if (slot === 'glance') out.glance.forEach(function (ref) { mark(ref, 'glance'); });
      else mark(out.slot[slot], slot);
    });
    if (on('cases')) MB.caseRefs(p, resolve).forEach(function (c) { mark(c.ref, 'cases'); });
    out.dups = keys.filter(function (k) { return seen[k].where.length > 1; }).map(function (k) { return seen[k]; });
    return out;
  };

  /** 品牌照的 key（b:brand-xxx 或别名），不是就回 null */
  function brandKeyOf(ref) {
    if (!ref) return null;
    if (ref.indexOf('b:brand-') === 0) return ref.slice(8);
    for (var k in BRAND_ALIAS) if (BRAND_ALIAS[k] === ref) return k;
    return null;
  }

  /** 封面 / 开场 / 一页看懂 / … 用哪张：销售选的 > 自动（整份不重复）。
      回 ref（内置 b:xxx、品牌照 b:brand-xxx、本机 u:xxx —— MB.makeResolver 都认得）；这一页没有图回 null */
  MB.pageImage = function (p, slot, resolve, plan) {
    plan = plan || MB.deckImages(p, resolve);
    return plan.slot[slot] || null;
  };

  /* 每个版位没图时用哪张品牌照（MB.BRAND.photos 的 key） */
  var BRAND_PHOTO = { cover: 'cover', letter: 'letter', back: 'cover', chapter: 'craft', practical: 'craft', language: 'brand', team: 'team' };

  /** 版位实际要画的图：{ src, w, h, ref, brand, pick, pos }。ref = null 表示用的是品牌照（不是客户图库里的图）；
      pick = 实际挑到的 ref（含 b:brand-xxx）；pos = 照片自己的焦点（object-position，空 = 置中）。
      deck / PPTX / 「选图」缩图共用，三处永远同一张。plan 可省略（MB.deckImages 的结果；一次排版算一次就好） */
  MB.pageImageSrc = function (p, slot, resolve, plan) {
    plan = plan || MB.deckImages(p, resolve);
    var pick = plan.slot[slot] || null;
    var im = look(resolve, pick);
    var bk = brandKeyOf(pick);
    if (im) return { src: im.src, w: im.w, h: im.h, ref: pick.indexOf('b:brand-') === 0 ? null : pick, brand: bk, pick: pick, pos: im.pos || '' };
    var b = MB.BRAND && MB.BRAND.photos[BRAND_PHOTO[slot]];
    return b ? { src: b.src, w: b.w, h: b.h, ref: null, brand: BRAND_PHOTO[slot], pick: brandRef(BRAND_PHOTO[slot]), pos: BRAND_POS[BRAND_PHOTO[slot]] || '' } : null;
  };
  /** 一页看懂的拼贴：[{ src, w, h, ref, pos }]（3–4 张，可能更少） */
  MB.glanceImages = function (p, resolve, plan) {
    plan = plan || MB.deckImages(p, resolve);
    return plan.glance.map(function (ref) {
      var im = look(resolve, ref);
      return im ? { src: im.src, w: im.w, h: im.h, ref: ref, pos: im.pos || '' } : null;
    }).filter(Boolean);
  };
  /** 空间页实际印的图（主图 + 最多 2 张辅图，跳过前面空间用过的） */
  MB.roomImages = function (p, room, resolve, plan) {
    plan = plan || MB.deckImages(p, resolve);
    return plan.rooms[room.uid] || [];
  };

  /* ---------- 页码 ------------------------------------------- */
  /** 依开关与资料决定有哪些页；回 [{type, room?}]，页码 = index + 1。
      页序：他们的家在前（开场短话、他们说的、一页看懂、平面图、逐个空间），品牌只占后面一页。
      resolve 可省略（用最近建的图库）：只用来判断案例图还找不找得到 */
  MB.pageList = function (p, resolve) {
    var pg = p.pages || {};
    var pages = [{ type: 'cover' }];
    if (pg.letter) pages.push({ type: 'letter' });
    if (pg.needs && MB.printedNeeds(p).length) pages.push({ type: 'needs' });
    if (pg.glance) pages.push({ type: 'glance' });
    if (pg.plan && p.plan.src) pages.push({ type: 'plan' });
    if (pg.chapter && p.rooms.length) pages.push({ type: 'chapter' });
    p.rooms.forEach(function (r) { pages.push({ type: 'room', room: r }); });
    if (pg.cases && MB.caseRefs(p, resolve).length) pages.push({ type: 'cases' });
    // 订单周期、售后都是公司资料，这一页永远有内容；只看开关
    if (pg.practical !== false) pages.push({ type: 'practical' });
    if (pg.language) pages.push({ type: 'language' });
    if (pg.team && MB.teamRows(p).length) pages.push({ type: 'team' });
    if (pg.invite) pages.push({ type: 'invite' });
    if (pg.back) pages.push({ type: 'back' });
    return pages;
  };
  /** 销售有没有填工期 / 预算 / 为马来西亚而做（体检用；这一页本身不再靠它决定出不出） */
  MB.hasPractical = function (p) {
    var x = p.extra || {};
    return !!(String(x.timeline || '').trim() || String(x.budget || '').trim() || String(x.built || '').trim());
  };
  /** 「参考空间」页真正印得出来的案例（图找得到的、同一张照片只算一次），最多 3 个：[{ ref, note }] */
  MB.caseRefs = function (p, resolve) {
    resolve = resolve || MB.makeResolver.last;
    var seen = {};
    return (p.cases || []).filter(function (c) {
      if (!c || !c.ref || (resolve && !resolve(c.ref))) return false;
      // 同一张照片的两种裁切（例：骨骼线厨房的横幅与直幅）只算一个案例，不然这一页会出现两次同一张
      if (seen[shot(c.ref)]) return false;
      seen[shot(c.ref)] = 1;
      return true;
    }).slice(0, 3);
  };
  /** 团队页印的行：有名字的才印；role 是 MB.BRAND.roles 的 key 就换成职称，否则原样（销售自己写的职称） */
  MB.teamRows = function (p) {
    var roles = (MB.BRAND && MB.BRAND.roles) || [];
    return (p.team || []).filter(function (m) { return m && String(m.name || '').trim(); }).map(function (m) {
      var r = null;
      roles.forEach(function (x) { if (x.key === m.role) r = x; });
      var role = String(m.role || '').trim();
      return { name: String(m.name).trim(), role: r ? { en: r.en, zh: r.zh } : role, key: r ? r.key : '' };
    });
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
    // 存档里没有的开关用 newProject 的默认（工期·保障、团队、章节页默认关 —— moodboard 字少）
    Object.keys(out.pages).forEach(function (k) { if (typeof pg[k] === 'boolean') out.pages[k] = pg[k]; });
    var im = p.images || {};
    Object.keys(out.images).forEach(function (k) { out.images[k] = ref(im[k]); });
    var x = p.extra || {};
    out.extra = { notIncluded: str(x.notIncluded, 300), timeline: str(x.timeline, 300), budget: str(x.budget, 600), built: str(x.built, 1000) };
    out.brief = str(p.brief, 8000);
    // 方案 2.0 以前的存档：「工期·保障」页只有填了工期 / 预算才出，开关一直是 true。
    // 照旧：没填就不出（不然旧方案打开会突然多一页只有公司资料的页）
    if (!Array.isArray(p.team) && !('letter' in p) && !MB.hasPractical(out)) out.pages.practical = false;

    /* ---- 方案 2.0 的字段：旧存档没有就用 newProject 的默认 ---- */
    out.letter = strOrNull(p.letter, 3000);
    var seen = {};
    out.cases = (Array.isArray(p.cases) ? p.cases : []).map(function (c) {
      c = c && typeof c === 'object' ? c : {};
      return { ref: ref(c.ref), note: strOrNull(c.note, 300) };
    }).filter(function (c) {
      if (!c.ref || seen[shot(c.ref)]) return false;   // 同一张图（含同一张的不同裁切）不放两次
      seen[shot(c.ref)] = 1;
      return true;
    }).slice(0, 3);
    // 旧存档没有团队：先放接待的那位销售（这份方案自己的 host，不是本机设定）
    out.team = Array.isArray(p.team)
      ? p.team.filter(function (m) { return m && typeof m === 'object'; }).slice(0, 6).map(function (m) {
          return { role: str(m.role, 60), name: str(m.name, 80) };
        })
      : [{ role: 'sales', name: out.host.name }];
    out.paletteFrom = p.paletteFrom === 'ref' ? 'ref' : 'style';
    // 参考图缩图：只收 png / jpeg / webp 的 base64（会放进 src 属性），太大的不收
    out.refImages = (Array.isArray(p.refImages) ? p.refImages : []).filter(function (r) {
      return r && typeof r.src === 'string' && r.src.length <= 400000 &&
        /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+=*$/.test(r.src);
    }).slice(0, 3).map(function (r) {
      return { src: r.src, w: Math.max(1, Math.min(4000, Math.round(+r.w) || 360)), h: Math.max(1, Math.min(4000, Math.round(+r.h) || 360)) };
    });
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
    // 邀请函跟方案同一种语言打开（华文 / 英文 / 中英文）；客户在邀请函上自己切换，网址会跟着改
    if (['zh', 'en', 'bi'].indexOf(p.lang) > -1) q.set('lang', p.lang);
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
