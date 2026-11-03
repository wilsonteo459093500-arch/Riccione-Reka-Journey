/* ============================================================
   VISI · 发出去之前的体检
   ------------------------------------------------------------
   每一条都对应一个具体原理（README「文案怎么写」）；画面上只讲「要改什么、为什么」，不讲书名、不讲术语。
   这是 moodboard：字要少、每页一件事、每张照片只出现一次；销售打的字不能有空泛形容词，更不能有假的急迫。
   bad = 一定要改；warn = 建议改；tip = 提醒；ok = 已做到
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};

  /* 空泛的形容词：人人都会说，读过就忘 —— 换成看得见、摸得到的细节 */
  var VAGUE = /温馨|高端|奢华|豪华|尊贵|尊享|完美|极致|顶级|大气|高大上|梦想中的家|梦幻|\b(?:cozy|cosy|luxurious|luxury|premium|perfect(?:ly)?|stunning|dream home|high-end|world-class|exquisite|amazing|gorgeous|top-notch)\b/gi;
  /* 假的急迫：没有真的期限就不能催（真的期限要写日期：「这个时段为你们保留到 X 日」） */
  var URGENT = /限时|限量|最后机会|仅剩|名额有限|错过|抢购|手慢无|倒计时|limited[- ]time|limited offer|last chance|\bonly\s+(?:\d+|a few|one|two|three|four|five|several|limited)\s+(?:[\w’']+\s+){0,2}left\b|\bhurry\b|act now|while stocks last|ends soon/gi;
  /* 「不急」的说法不算催促：no hurry / not in a hurry / don't hurry */
  var CALM = /\b(?:no|not in a|don[’']t|there[’']s no)\s+hurry\b/gi;
  var CJK = /[㐀-鿿]/;

  /** 字数：华文 = 汉字 + 英文词；英文 = 词数（copy.js 有 MB.textCount 就用同一把尺） */
  function count(s, L) {
    if (MB.textCount) return MB.textCount(s, L);
    s = String(s || '');
    if (L === 'zh') return (s.match(/[㐀-鿿]/g) || []).length;
    return s.split(/\s+/).filter(function (w) { return /[A-Za-z0-9]/.test(w); }).length;
  }
  function trim(s) { return String(s == null ? '' : s).trim(); }
  /** 需求的原话（华文或英文，有一个就算有） */
  function quoteOf(n) {
    var q = MB.needQuote(n);
    return trim(typeof q === 'string' ? q : (q && (q.zh || q.en)) || '').replace(/[。．.！!]+$/, '');
  }
  /** 体检讯息里怎么指出一条需求：客户自己打的字加引号；需求卡勾选的用转述（「几乎天天开火」不是他们的原话，不加引号） */
  function needLabel(n) {
    var typedQ = typeof n.quote === 'string' && n.quote.trim();
    if (typedQ) return '「' + quoteOf(n) + '」';
    var dk = n.key && MB.NEEDS && MB.NEEDS[n.key];
    return dk && dk.told ? '勾选：' + String(dk.told.zh || '').trim() : '「' + quoteOf(n) + '」';
  }
  /** 「你们说的」页实际印了哪几条（跟方案页同一份：model.js 的 MB.printedNeeds；都没有就照旧版面：前 3 条） */
  function needsShown(p) {
    if (typeof MB.needsShownOr === 'function') return MB.needsShownOr(p);
    if (typeof MB.printedNeeds === 'function') return MB.printedNeeds(p) || [];
    return p.needs.slice(0, 3);
  }
  /** 需求对应的空间应该在方案里却不在（copy.js 有同一条规则就用它） */
  function roomMissing(p, n) {
    if (typeof MB.needRoomMissing === 'function') return MB.needRoomMissing(p, n);
    if (MB.needRoom(p, n)) return false;
    var d = MB.needDef(p, n.key);
    return !!(n.roomUid || n.room || (d && d.room));
  }

  /** 销售自己打的字（客户原话不算）：[{ text, where, go, max }] —— 体检要拦空话、假急迫、太长。
      max = 字数上限；页面上没印出来的（例：第 4 条以后的需求）不量字数 */
  function typed(p) {
    var out = [];
    var shown = needsShown(p);
    function push(v, where, go, max) { if (typeof v === 'string' && v.trim()) out.push({ text: v, where: where, go: go, max: max || null }); }
    push(p.letter, '开场短话', 'letter', { zh: 70, en: 55 });
    p.needs.forEach(function (n, i) { push(n.answer, '第 ' + (i + 1) + ' 条需求的做法', 'needs', shown.indexOf(n) > -1 ? { zh: 30, en: 18 } : null); });
    p.rooms.forEach(function (r) { push(r.note, MB.t(MB.roomTitle(p, r), 'zh') + '的「为你」', 'room:' + r.uid, { zh: 40, en: 25 }); });
    p.promises.forEach(function (t, i) { push(t, '第 ' + (i + 1) + ' 句承诺', 'style'); });
    p.visit.prepared.forEach(function (t, i) { push(t, '准备的第 ' + (i + 1) + ' 样', 'visit', { zh: 16, en: 9 }); });
    (p.cases || []).forEach(function (c, i) { if (c) push(c.note, '第 ' + (i + 1) + ' 个案例那一句', 'cases', { zh: 20, en: 12 }); });
    var x = p.extra || {};
    push(x.timeline, '工期', 'practical'); push(x.budget, '预算', 'practical'); push(x.built, '为马来西亚而做', 'practical');
    push(x.notIncluded, '「这次没包含」', 'plan');
    return out;
  }
  /** 在这些字里找词：{ words:[去重], where:[出现在哪], go } */
  function find(list, re, skip) {
    var words = [], where = [], go = null;
    list.forEach(function (t) {
      var m = (skip ? t.text.replace(skip, ' ') : t.text).match(re);
      if (!m) return;
      m.forEach(function (w) { w = w.toLowerCase(); if (words.indexOf(w) < 0) words.push(w); });
      if (where.indexOf(t.where) < 0) where.push(t.where);
      go = go || t.go;
    });
    return { words: words, where: where, go: go };
  }
  /** 方案自动起草的开场短话（app.js 双语是华文一段 + 英文一段）—— 销售原样存下来也算没改 */
  function letterDrafts(p) {
    if (typeof MB.draftLetter !== 'function') return [];
    try {
      var zh = MB.draftLetter(p, 'zh'), en = MB.draftLetter(p, 'en');
      return [zh, en, zh + '\n\n' + en].map(function (s) { return String(s).trim(); });
    } catch (e) { return []; }
  }

  /** 页名（体检讯息用）：「第 8 页（客厅）」 */
  function pageLabel(p, u) {
    var name = '';
    try { name = MB.pageName ? MB.pageName(p, u.pg, 'zh') : ''; } catch (e) { name = ''; }
    return '第 ' + u.no + ' 页' + (name ? '（' + name + '）' : '');
  }
  /**
   * 整份方案每一页实际印的照片：[{ ref, no, pg, hand }]（hand = 销售亲手选的）。
   * 资料来源跟方案页同一份：model.js 的 MB.deckImages（空间页、版位图、拼贴）+ MB.caseRefs（案例）；
   * deck.js 若提供 MB.deckPhotoUses(p, resolve) 就直接用它（版面改了也不会对不上）。
   */
  function photoUses(p, resolve, plan) {
    if (typeof MB.deckPhotoUses === 'function') return MB.deckPhotoUses(p, resolve) || [];
    if (typeof MB.deckImages !== 'function') return [];
    plan = plan || MB.deckImages(p, resolve);
    var images = p.images || {};
    var uses = [];
    MB.pageList(p, resolve).forEach(function (pg, i) {
      function use(ref, hand) { if (ref) uses.push({ ref: ref, no: i + 1, pg: pg, hand: !!hand }); }
      if (pg.type === 'room') {
        var rr = plan.rooms && plan.rooms[pg.room.uid] || [];
        rr.forEach(function (ref) { use(ref, !!pg.room.manual); });
      } else if (pg.type === 'cases') {
        MB.caseRefs(p, resolve).forEach(function (c) { use(c.ref, true); });
      } else if (pg.type === 'glance') {
        var g = plan.glance && plan.glance.length ? plan.glance : [];
        if (!g.length && MB.pageImageSrc) { var s0 = MB.pageImageSrc(p, 'glance', resolve, plan); if (s0 && s0.pick) g = [s0.pick]; }
        g.forEach(function (ref) { use(ref, images.glance === ref); });
      } else if ((MB.IMAGE_SLOTS || []).indexOf(pg.type) > -1 && MB.pageImageSrc) {
        var s = MB.pageImageSrc(p, pg.type, resolve, plan);
        if (s && s.pick) use(s.pick, images[pg.type] === s.pick);
      }
    });
    return uses;
  }
  /* 同一张照片的裁切（体检自己也认得，model.js 的 MB.shotKey 还没列进去时一样会提醒）：
     柜角细节是骨骼线高柜那张的下半截放大；雾山走廊是骨骼线客厅那张的左半边 */
  var SAME_FRAME = [
    ['b:skeleton-3', 'b:skeleton-kitchen-3', 'b:detail-corner'],
    ['b:skeleton-1', 'b:misty-corridor']
  ];
  /* 不同的照片、同一个地方：开场的「草原上走路的人」和「远山」拍的是同一道山脊、同一片草原，放在同一份里读起来像同一张 */
  var SAME_PLACE = [
    ['b:brand-letter', 'b:land-hills']
  ];
  function groupKey(groups, ref) {
    for (var i = 0; i < groups.length; i++) if (groups[i].indexOf(ref) > -1) return groups[i][0];
    return null;
  }
  function frameKey(ref) {
    var k = MB.shotKey ? MB.shotKey(ref) : ref;
    return groupKey(SAME_FRAME, k) || groupKey(SAME_FRAME, ref) || k;
  }
  /** 同一张照片（含同一张的不同裁切）出现两次以上：[[use, use, …], …]；place = true 时改找「同一个地方」 */
  function photoDups(uses, place) {
    var by = {}, order = [];
    uses.forEach(function (u) {
      var k = place ? groupKey(SAME_PLACE, u.ref) : frameKey(u.ref);
      if (!k) return;
      if (!by[k]) { by[k] = []; order.push(k); }
      by[k].push(u);
    });
    return order.map(function (k) { return by[k]; }).filter(function (g) {
      if (g.length < 2) return false;
      if (!place) return true;
      // 同一个地方：要是两张不同的照片（同一张两次，上面「重复」那一条已经说了）
      var seen = {};
      g.forEach(function (u) { seen[frameKey(u.ref)] = 1; });
      return Object.keys(seen).length > 1;
    });
  }
  /** 图（内置 / 品牌照 / 本机）：resolve 认不得的品牌照用 MB.allImages 补 */
  function imageOf(resolve, ref) {
    var im = resolve && resolve(ref);
    if (im) return im;
    var all = MB.allImages ? MB.allImages([]) : [];
    for (var i = 0; i < all.length; i++) if (all[i].ref === ref) return all[i];
    return null;
  }

  /**
   * @param {object} [overflow]  预览量出来放不下的页：{ needs, plan, letter, practical, cases, rooms:[uid] }（app.js fitText）
   * @returns {{items: Array<{level,text,why,goto}>, score:number, total:number}}
   */
  MB.checkProject = function (p, resolve, overflow) {
    var items = [];
    function add(level, text, why, go) { items.push({ level: level, text: text, why: why, goto: go || null }); }
    var d = MB.dir(p);
    // 整份方案实际印的图（跟预览、PDF、PPTX 同一份）：哪些空间的主图是代替的质感照、哪一张印了两次
    var plan = null;
    try { plan = typeof MB.deckImages === 'function' ? MB.deckImages(p, resolve) : null; } catch (e) { plan = null; }
    var moodRooms = (plan && plan.moodRooms) || [];

    // 1 · 封面名字
    if ((p.client.names || '').trim()) add('ok', '封面写着客户的名字', '客户第一眼抓到的是自己的名字 —— WhatsApp 预览图就是封面。');
    else add('bad', '封面没有客户名字', 'WhatsApp 预览只显示第 1 页。没有名字，它看起来就是一份群发的型录。', 'brief');

    // 2 · 楼盘
    if (!MB.propertyLabel(p)) add('warn', '没有填楼盘 / 区域', '「楼盘名 · Setia Alam」比「您的新家」具体 —— 具体的东西更像真的。', 'brief');

    // 3 · 空间
    if (!p.rooms.length) add('bad', '还没有任何空间', '先在「空间」加入要做的房间。', 'rooms');
    var noImg = [], standIn = [], tooMany = [], noNote = [], mixed = [], lowRes = [], noFeat = [], cutFeats = [], clash = [];
    p.rooms.forEach(function (r) {
      var name = MB.t(MB.roomTitle(p, r), 'zh');
      var refs = r.images.filter(function (x) { return resolve(x); });
      // 没有实景图：方案页已经放了一张风格对得上的质感照代替（MB.deckImages 的 moodRooms）→ 不是空白，只是还不是实景
      if (!refs.length) (moodRooms.indexOf(r.uid) > -1 ? standIn : noImg).push(name);
      if (refs.length > 3) tooMany.push(name);
      if (!r.feats.length) noFeat.push(name);
      if (MB.roomFeats(p, r).length > 3) cutFeats.push(name);
      // 旧存档、导入的方案可能两个都勾：页面只印层架（MB.roomFeats），编辑区却两个都勾着
      if (r.feats.indexOf('openshelf') > -1 && r.feats.indexOf('topbase') > -1) clash.push(name);
      if (!MB.roomNote(p, r)) noNote.push(name);
      var series = {};
      refs.forEach(function (x) { var s = resolve(x).series; if (s) series[s] = 1; });
      if (Object.keys(series).length > 1) mixed.push(name);
      var hero = refs[0] && resolve(refs[0]);
      if (hero && Math.max(hero.w, hero.h) < 900) lowRes.push(name);
    });
    if (p.rooms.length) {
      if (noImg.length) add('bad', '没有图的空间：' + noImg.join('、'), '空白的位置会让人以为方案还没做完。', 'rooms');
      else if (standIn.length) add('warn', '先放了一张质感照代替：' + standIn.join('、'),
        '页面不会空白，但那不是这个空间的实景。有做过的实景图就换上（「图库」上传，或拖旧 proposal PDF 进去）。', 'rooms');
      else add('ok', '每个空间都有主图', '一张主图先给整体感觉，辅图再补细节。');
      if (tooMany.length) add('warn', '超过 3 张图：' + tooMany.join('、'), '每页只印 1 张主图 + 2 张辅图，多的不会出现。图一多，客户会开始比较哪张好，而不是想象自己的家。', 'rooms');
      if (mixed.length) add('warn', '同一页混了不同系列的图：' + mixed.join('、'), '客户会把每一页当成一个故事；同一页两种风格，故事就讲不通。只留同一个系列的图。', 'rooms');
      if (lowRes.length) add('warn', '主图太小，打印会糊：' + lowRes.join('、'), '模糊的图，客户说不出哪里不对，但会觉得不够好。换一张长边至少 900px 的。', 'rooms');
      if (noFeat.length) add('warn', '没有勾卖点：' + noFeat.join('、'), '只放图，客户只能自己猜「这对我有什么用」。', 'rooms');
      if (noNote.length) add('warn', '没写「为你」那一句：' + noNote.join('、'), '写一句跟他们生活有关的话，例：「你们天天开火，所以锅具放在腰部高度的拉篮」—— 比柜型名称和形容词都有力。', 'rooms');
      else add('ok', '每个空间都写了「为你」', '每一页都在讲他们的家，不是我们的产品。');
      // 方案页三种语言都只印 3 个卖点（需求点到的排最前）
      if (cutFeats.length) add('tip', '每页只印 3 个卖点：' + cutFeats.join('、'), '需求卡点到的排最前；其余的不印在页上，留到展厅讲（讲稿里有）。', 'rooms');
      if (clash.length) add('warn', clash.join('、') + '同时勾了「开放层架代替吊柜」和「吊柜 + 地柜」',
        '两个说法相反，页面只印「开放层架代替吊柜」。要做吊柜，就把层架那一个取消。', 'rooms');
    }

    // 4 · 你说的 · 我们做的
    if (!p.pages.needs) { /* 关掉了这一页，不检查 */ }
    else if (!p.needs.length) add('warn', '没有「你们说的 · 我们做的」', '客户最想确认的是「你有没有听懂我」。贴需求卡就会自动带出来。', 'brief');
    else {
      var blank = [], noAns = 0;
      p.needs.forEach(function (n, i) {
        if (!quoteOf(n)) blank.push(i + 1);
        else if (!trim(MB.t(MB.needAnswer(n, p), 'zh'))) noAns++;
      });
      // 方案页（MB.printedNeeds）会跳过空的那一条；旧版面会印成只有编号的空行
      if (blank.length) add('warn', '第 ' + blank.join('、') + ' 条需求是空的',
        (MB.printedNeeds ? '空的那一条不会印在方案上。' : '空的那一条，方案页上会是一行只有编号的空白。') + '写上客户的原话，或删掉这一条。', 'needs');
      if (noAns) add('bad', noAns + ' 条客户原话还没写我们的做法', '只引用不回答，等于告诉客户「我们听到了，但没做」。', 'brief');
      else if (!blank.length) add('ok', '客户的原话都有对应做法', '用他们自己的话开头，最容易被接受。');
      // 需求对应的空间不在方案里：页上会答应一个方案里没有的东西
      var missing = [];
      p.needs.forEach(function (n) {
        if (!quoteOf(n) || !roomMissing(p, n)) return;
        var dk = MB.needDef(p, n.key), key = n.room || (dk && dk.room);
        var rm = MB.ROOM[key];
        missing.push(needLabel(n) + ' → ' + (rm ? rm.zh : '那个空间'));
      });
      if (missing.length) add('warn', '需求对应的空间不在方案里：' + missing.join('、'),
        '客户会以为方案里有这个做法。要嘛把那个空间加进来，要嘛把这一条的做法改成「见面一起看」。', 'needs');
      // 方案页只印前几条：没印的要讲出来是哪几条
      var shown = needsShown(p);
      var dropped = p.needs.filter(function (n) { return shown.indexOf(n) < 0 && quoteOf(n); });
      if (dropped.length) add('tip', '需求有 ' + (p.needs.length - blank.length) + ' 条，方案页只印前 ' + shown.length + ' 条，没印的：' +
        dropped.map(needLabel).join('、'),
        '把最痛的 ' + shown.length + ' 条排在最前面；其余的当面讲（讲稿里有）。', 'needs');
    }

    // 4b · 英文方案里混了中文（销售自己打的字不会自动翻译）—— 「去改」直接到第一处所在的分页
    if (p.lang === 'en') {
      var mixedLang = 0, firstTab = null;
      var hit = function (v, tab) {
        if (typeof v === 'string' && CJK.test(v)) { mixedLang++; firstTab = firstTab || tab; }
      };
      p.needs.forEach(function (n) { hit(MB.needQuote(n), 'brief'); hit(MB.needAnswer(n, p), 'brief'); });
      p.rooms.forEach(function (r) { hit(r.title, 'rooms'); hit(r.note, 'rooms'); });
      p.promises.forEach(function (t) { hit(t, 'style'); });
      p.visit.prepared.forEach(function (t) { hit(t, 'visit'); });
      hit(p.letter, 'letter');
      (p.cases || []).forEach(function (c) { if (c) hit(c.note, 'cases'); });
      var x = p.extra || {};
      if (MB.hasPractical(p) && p.pages.practical !== false) { hit(x.timeline, 'visit'); hit(x.budget, 'visit'); hit(x.built, 'visit'); }
      if (p.pages.plan && p.plan.src) hit(x.notIncluded, 'plan');
      if (mixedLang) add('warn', '英文方案里有 ' + mixedLang + ' 处中文', '一份文件夹着两种语言，读起来费力。翻成英文，或把方案切到「双语」。', firstTab);
    }

    // 4c · 排版放不下（自动缩小两级后还是太多）
    var ov = overflow || {};
    if (ov.needs) add('warn', '「你们说的」放不下，最后几条会被裁掉', '挑最痛的 3 条，或把做法写短。被裁掉的话，客户只会看到半句。', 'brief');
    if (ov.plan) add('warn', '平面图页右边的编号清单放不下', '空间太多或「这次没包含」写太长 —— 合并相近的空间，或把那句写短。', 'plan');
    if (ov.letter) add('warn', '开场短话太长，放不下', '这一页只放两三句。写短一点，客户才会读完。', 'letter');
    if (ov.practical) add('warn', '「工期 · 保障」那一页放不下', '这一页只留几个大数字和一句回应顾虑的话，其余的当面讲。', 'practical');
    if (ov.cases) add('warn', '案例那一页放不下，句子会被裁掉', '每个案例只写一行（≤ 20 字 / 12 words），其余的当面讲。', 'cases');
    // 邀约页「为你们准备好的」三样：双语时华文、英文排成一行，太长会压到下面的时段（app.js fitText 量到才有）
    if (ov.invite) add('warn', '邀约页「为你们准备好的」放不下，会压到时段那一块', '每一样写短一点（≤ 16 字 / 9 words），细节到展厅再讲。', 'visit');
    if (ov.rooms && ov.rooms.length) {
      var names = p.rooms.filter(function (r) { return ov.rooms.indexOf(r.uid) > -1; }).map(function (r) { return MB.t(MB.roomTitle(p, r), 'zh'); });
      if (names.length) add('warn', '字太多放不下：' + names.join('、'), '「为你」那句写短一点，或少勾一个卖点。一页只讲一件事，客户一眼就看懂。', 'rooms');
    }

    // 5 · 平面图
    if (!p.pages.plan) { /* 关掉了平面图页 */ }
    else if (!p.plan.src) add('tip', '没有平面图页', '有平面图 + 编号，客户会开始想象「我家」的样子。', 'plan');
    else {
      var pinned = p.rooms.filter(function (r) { return p.plan.pins[r.uid]; }).length;
      if (pinned < p.rooms.length) add('warn', '平面图上还有 ' + (p.rooms.length - pinned) + ' 个空间没标位置', '编号把平面图和后面每一页连起来；没有编号，黄色色块只是装饰。', 'plan');
      else add('ok', '平面图编号对上每一页', '');
    }

    // 6 · 结尾 = 下一步
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var vd = MB.parseISO(p.visit.date);
    if (!p.pages.invite) add('bad', '关掉了到馆邀约页', '客户记得最清楚的是最后几页：要给下一步（已经留好的时段），而不是电话号码。', 'visit');
    else if (!vd) add('bad', '还没定到馆时间', '「欢迎参观」不是下一步。先替他们留好一个时段 —— 改时间比决定要不要来容易。', 'visit');
    else if (vd < today) add('bad', '到馆日期已经过了', '改成未来的日期。', 'visit');
    else if (p.visit.auto) add('warn', '到馆时段是按需求卡自动建议的 —— 先确认真的留了', '「已为你们保留」只有在真的保留时才能写。确认后到 ⑤ 按「已确认留好」（或直接改时段），这条就会消失。', 'visit');
    else {
      add('ok', '结尾已经替客户留好时段', '已经留好的时间，最容易被接受。');
      if (!MB.parseISO(p.visit.date2)) add('tip', '可以再给一个备选时段', '给两个选项，让他们回「1」或「2」就好，不用想开放题。', 'visit');
    }
    add('tip', '确认展厅真的准备好「为你们准备的三样」，时段也真的留了', '「已为你们保留」只有在真的保留时才能写；说到做到，到馆那天才会是真正的高峰。', 'visit');

    // 6b · 工期 · 预算 · 保障
    if (p.pages.practical !== false && !MB.hasPractical(p)) add('tip', '「工期 · 保障」页只有公司资料', '客户最想知道的是「我家要多久、大概多少」。有公司认可的真实工期或预算，就填在 ⑤；没有就不要估。', 'practical');
    // 「你们家 / 预算」那一行只有一行宽：太长会被「…」截成半句，PDF 和 PPTX 都一样
    if (p.pages.practical !== false && typeof MB.practicalBlocks === 'function') {
      var projRows = [];
      try { projRows = MB.practicalBlocks(p).project || []; } catch (e) { projRows = []; }
      var longProj = projRows.filter(function (x) {
        var t = String(x.text || ''), w = 0;
        for (var i = 0; i < t.length; i++) w += CJK.test(t.charAt(i)) ? 2 : 1;   // 华文一个字占两个英文字母宽
        return w > 60;
      }).map(function (x) { return x.label && x.label.zh ? '「' + x.label.zh + '」' : ''; }).filter(Boolean);
      if (longProj.length) add('warn', '「工期 · 保障」页' + longProj.join('、') + '那一行太长，会被截成半句',
        '页面上只留一行（例：「设计确认后约 8–10 周安装」），「看板材」「看排期」这类补充当面讲。', 'practical');
    }

    // 7 · 材料是示例
    var same = p.materials.every(function (m, i) { return d.materials[i] && m.en === d.materials[i].en; });
    if (same) add('tip', '材料还是示例名称', '换成真实板材色号（例：EGGER H3303）。具体的名称比形容词可信。', 'style');

    // 8 · 页数
    var pages = MB.pageList(p).length;
    if (pages > 14) add('warn', '共 ' + pages + ' 页，偏长', '这是一份 moodboard：页数越多，每一页越轻。合并相近的空间，关掉资讯多的页（工期 · 保障、团队、章节页），细节留到展厅讲。', 'rooms');

    // 9 · 二维码网址
    var link = MB.inviteLink(p);
    if (p.pages.invite && link.local) add('warn', '二维码指向本机网址，客户扫不开', '在 config.js 填 publicBase（正式网址），或在正式网站上做方案。', 'visit');

    // 10 · 联络
    if (!String(p.host.wa || '').replace(/\D/g, '')) add('warn', '没有你的 WhatsApp 号码', '客户看完想问，第一个找的就是你的号码。', 'brief');

    // 11 · 销售打的字：假的急迫（一定要改）、空泛形容词、太长
    var mine = typed(p);
    var urg = find(mine, URGENT, CALM);
    if (urg.words.length) add('bad', '有催促的字眼：' + urg.words.join('、') + '（' + urg.where.join('、') + '）',
      '催促会让人起戒心，反而不回。真的有期限才写，而且写清楚日期，例：「这个时段为你们保留到 11 月 8 日」。', urg.go);
    var vague = find(mine, VAGUE);
    if (vague.words.length) add('warn', '空泛的形容词：' + vague.words.join('、') + '（' + vague.where.join('、') + '）',
      '这些词谁都会说，客户读过就忘。换成看得见、摸得到的细节：抽屉拉出来的分量、柜门关上的那一声、早上六点开柜门灯就亮。', vague.go);
    // 双语的字（华文一段 + 英文一段）各自算：华文数汉字，英文数词
    var long = mine.filter(function (t) {
      if (!t.max) return false;
      var k = t.go === 'letter' ? 1 : 1.2;   // 开场短话照上限；其余的字放宽一点，明显超过才提醒
      var han = (t.text.match(/[㐀-鿿]/g) || []).length;
      var en = count(t.text.replace(/[㐀-鿿]/g, ' '), 'en');
      return han > t.max.zh * k || ((!han || en > 12) && en > t.max.en * k);
    });
    if (long.length) add('warn', '写得太长：' + long.map(function (t) { return t.where; }).join('、'),
      '这是一份 moodboard，每页只讲一件事。页面上留一句，其余的当面讲（讲稿里有）。', long[0].go);

    // 12 · 开场短话：还是自动草稿 = 每个客户都一样
    if (p.pages.letter) {
      var lt = typeof p.letter === 'string' ? p.letter.trim() : '';
      if (!lt || letterDrafts(p).indexOf(lt) > -1) add('warn', '开场短话还是自动草稿',
        '草稿只用得到需求卡上的字。加一件只有你知道的事 —— 见面时他们提过的一个细节 —— 这一页才像是写给他们的。', 'letter');
      else add('ok', '开场短话是你自己写的', '翻开第一页之后，先读到的是写给他们的话。');
    }

    // 13 · 案例：风格要和方案一样，不然他们会开始比较哪个好，而不是想象自己的家。
    //      公司案例另外有细的风格（原木、奶油风、日式…都是雾山）：方案定了案例风格（p.caseStyle），也要对得上
    if (p.pages.cases && MB.caseRefs) {
      var series = d.series, off = [];
      var myStyle = p.caseStyle && MB.caseStyle ? MB.caseStyle(p.caseStyle) : null;
      MB.caseRefs(p, resolve).forEach(function (c, i) {
        var im = resolve && resolve(c.ref);
        if (im && im.series && im.series !== series) off.push('第 ' + (i + 1) + ' 个（' + ((MB.DIRECTION[im.series] || {}).zh || im.series) + '）');
        else if (im && myStyle && im.style && im.style !== myStyle.key && MB.caseStyle(im.style)) {
          off.push('第 ' + (i + 1) + ' 个（' + MB.caseStyle(im.style).zh + '，方案是' + myStyle.zh + '）');
        }
      });
      if (off.length) add('warn', '案例和方案风格不一样：' + off.join('、'),
        '这一页是要他们觉得「这就是我们要的」。风格不一样的案例，会让他们开始比较哪个好，而不是想象自己的家。', 'cases');
    }

    // 14 · 团队页只有自己一个人
    if (p.pages.team && MB.teamRows) {
      var team = MB.teamRows(p);
      var host = String(p.host.name || '').trim().toLowerCase();
      if (team.length === 1 && (team[0].key === 'sales' || team[0].name.toLowerCase() === host)) add('tip', '团队页只有你一个人',
        '把会跟进这个家的设计师、项目经理也写上名字，客户会知道签约之后找得到谁。暂时没有，就先关掉这一页。', 'team');
    }

    // 15 · 配色说「来自你们的照片」，就要有照片
    if (p.paletteFrom === 'ref' && !(p.refImages || []).length) add('warn', '配色写着「来自你们发来的照片」，但没有放照片',
      '这句话要有照片作证。放上他们发来的参考图，或改回按风格配色。', 'style');

    // 16 · 照片：同一份方案里每张只出现一次；封面、邀约、空间主图要是方案的风格
    var uses = [];
    try { uses = photoUses(p, resolve, plan); } catch (e) { uses = []; }
    var dups = photoDups(uses);
    if (dups.length) {
      var txt = dups.slice(0, 3).map(function (g) {
        var labels = [];
        g.forEach(function (u) { var l = pageLabel(p, u); if (labels.indexOf(l) < 0) labels.push(l); });
        return labels.join('、') + (labels.length === 1 ? '（同一页两次）' : '');
      });
      // 「去改」：销售亲手选的版位图 → ⑤；案例 → 案例；否则到那一间
      var g0 = dups[0], go = null;
      g0.forEach(function (u) { if (!go && u.hand && MB.IMAGE_SLOTS && MB.IMAGE_SLOTS.indexOf(u.pg.type) > -1) go = 'visit'; });
      g0.forEach(function (u) { if (!go && u.pg.type === 'cases') go = 'cases'; });
      g0.forEach(function (u) { if (!go && u.pg.type === 'room') go = 'room:' + u.pg.room.uid; });
      add('warn', '同一张照片重复出现：' + txt.join('；'),
        '这是一份 moodboard，每张照片只出现一次，客户翻到每一页都是新的。到 ⑤「用哪张图」或「空间」换掉其中一张。', go || 'visit');
    }
    // 不同的两张、同一个地方（同一道山脊、同一片草原）：客户读起来像同一张
    var places = photoDups(uses, true);
    if (places.length) {
      var ptxt = places.slice(0, 2).map(function (g) {
        var labels = [];
        g.forEach(function (u) { var l = pageLabel(p, u); if (labels.indexOf(l) < 0) labels.push(l); });
        return labels.join('、');
      });
      // 这两张都是情绪页的版位图：「去改」到 ⑤ 的「用哪张图」
      add('tip', '两张照片拍的是同一个地方：' + ptxt.join('；'),
        '同一道山、同一片草原出现两次，客户会觉得是同一张。到 ⑤「用哪张图」把其中一页换成别的照片。', 'visit');
    }
    // 16b · 印出来的公司案例照片：分类时标了「不确定」、或已经被隐藏（拍到客户、不想再用）—— 发出去之前换掉
    var shaky = [], gone = [], odd = [], shakyGo = null, goneGo = null, oddGo = null;
    uses.forEach(function (u) {
      if (String(u.ref).indexOf('c:') !== 0) return;
      var im = resolve && resolve(u.ref);
      if (!im) return;
      var l = pageLabel(p, u);
      var go = u.pg.type === 'room' ? 'room:' + u.pg.room.uid : u.pg.type === 'cases' ? 'cases' : 'visit';
      var isRoom = MB.caseIsRoom ? MB.caseIsRoom(im) : !!(im.rooms && im.rooms[0] && MB.ROOM[im.rooms[0]]);
      if (im.hidden) { if (gone.indexOf(l) < 0) gone.push(l); goneGo = goneGo || go; }
      else if (im.status === 'unsure') { if (shaky.indexOf(l) < 0) shaky.push(l); shakyGo = shakyGo || go; }
      // 不是标好空间的照片（平面图、截图、报价单…）或还没有人看过的新照片：常拍到别的客户的名字、门牌、电话
      else if (!isRoom || im.status === 'new') { if (odd.indexOf(l) < 0) odd.push(l); oddGo = oddGo || go; }
    });
    if (gone.length) add('warn', '用了已经隐藏的公司案例照片：' + gone.join('、'),
      '案例库里把它隐藏了（可能拍到客户、或不想再给人看）。换一张 —— 帮我挑、图库都挑得到别的。', goneGo);
    if (shaky.length) add('warn', '用了还没确认的公司案例照片：' + shaky.join('、'),
      '这张分类时标了「不确定」（空间、柜类、风格可能标错）。看一眼照片对不对，不对就换一张。', shakyGo);
    if (odd.length) add('warn', '用了不是空间照、或还没人看过的公司案例照片：' + odd.join('、'),
      '这张没有标成哪一个空间（可能是平面图、截图、报价单），或刚上传还没人看过。放大看清楚：有别的客户的名字、门牌、电话就一定要换掉。', oddGo);

    // 16c · 方案里的公司案例照片：这台电脑看不到（同事导出的方案、没登入过），或登入过期（存着的是旧清单）
    var cref = MB.caseRefsIn ? MB.caseRefsIn(p) : [];
    var unseen = cref.filter(function (ref) { return !(resolve && resolve(ref)); });
    var stale = cref.filter(function (ref) { var im = resolve && resolve(ref); return !!(im && im.stale); });
    if (unseen.length) add('warn', '有 ' + unseen.length + ' 张公司案例照片这台电脑看不到 —— 先登入公司案例库',
      '这份方案用了公司案例库的照片（例如同事导出给你的）。到「图库」登入之后就看得到；登入之前先别按「自动配图」、换风格或重新选图，不然那几张会被换掉。', 'library');
    else if (stale.length) add('warn', '公司案例库登入过期：' + stale.length + ' 张案例照片没办法确认还能不能用',
      '这台电脑存着的是旧清单 —— 之后被隐藏的照片（例如拍到别的客户）这里看不出来。到「图库」重新登入，再发给客户。', 'library');

    var offStyle = [];
    uses.forEach(function (u) {
      var t = u.pg.type;
      var first = t === 'room' && uses.filter(function (x) { return x.pg === u.pg; })[0] === u;
      if (!(first || t === 'cover' || t === 'invite')) return;
      // 没有实景、系统自己放的代替照：上面「先放了一张质感照代替」已经说了，这里不再叫他换成另一种风格的图
      if (t === 'room' && moodRooms.indexOf(u.pg.room.uid) > -1) return;
      var im = imageOf(resolve, u.ref);
      var isRoom = im && (im.rooms || []).some(function (k) { return MB.ROOM[k]; });
      if (isRoom && im.series && im.series !== d.series) {
        var label = (t === 'room' ? MB.t(MB.roomTitle(p, u.pg.room), 'zh') : t === 'cover' ? '封面' : '邀约页') +
          '（' + ((MB.DIRECTION[im.series] || {}).zh || im.series) + '）';
        if (offStyle.indexOf(label) < 0) offStyle.push(label);
      }
    });
    if (offStyle.length) add('tip', '主图和方案风格不一样：' + offStyle.join('、'),
      '客户看到另一种风格，会开始比较，而不是想象自己的家。换一张「' + d.zh + '」的图；图库没有的话，上传你们做过的同风格案例。', 'rooms');

    var order = { bad: 0, warn: 1, tip: 2, ok: 3 };
    items.sort(function (a, b) { return order[a.level] - order[b.level]; });
    var scored = items.filter(function (x) { return x.level !== 'tip'; });
    return {
      items: items,
      score: scored.filter(function (x) { return x.level === 'ok'; }).length,
      total: scored.length,
      bad: items.filter(function (x) { return x.level === 'bad'; }).length
    };
  };
})();
