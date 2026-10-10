/* ============================================================
   VISI · 发出去之前的体检
   ------------------------------------------------------------
   每一条都对应《快思慢想》里一个具体原理。
   bad = 一定要改；warn = 建议改；tip = 提醒；ok = 已做到
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};

  /**
   * @param {object} [overflow]  预览量出来放不下的页：{ needs, plan, rooms:[uid] }（app.js fitText）
   * @returns {{items: Array<{level,text,why,goto}>, score:number, total:number}}
   */
  MB.checkProject = function (p, resolve, overflow) {
    var items = [];
    function add(level, text, why, go) { items.push({ level: level, text: text, why: why, goto: go || null }); }

    // 1 · 封面名字
    if ((p.client.names || '').trim()) add('ok', '封面写着客户的名字', '名字是 System 1 最先抓到的东西 —— WhatsApp 预览图就是封面。');
    else add('bad', '封面没有客户名字', 'WhatsApp 预览只显示第 1 页。没有名字，它看起来就是一份群发的型录。', 'brief');

    // 2 · 楼盘
    if (!MB.propertyLabel(p)) add('warn', '没有填楼盘 / 区域', '「楼盘名 · Setia Alam」比「您的新家」具体 —— 具体的东西更像真的。', 'brief');

    // 3 · 空间
    if (!p.rooms.length) add('bad', '还没有任何空间', '先在「空间」加入要做的房间。', 'rooms');
    var noImg = [], tooMany = [], noNote = [], mixed = [], lowRes = [], noFeat = [];
    p.rooms.forEach(function (r) {
      var name = MB.t(MB.roomTitle(p, r), 'zh');
      var refs = r.images.filter(function (x) { return resolve(x); });
      if (!refs.length) noImg.push(name);
      if (refs.length > 3) tooMany.push(name);
      if (!r.feats.length) noFeat.push(name);
      if (!MB.roomNote(p, r)) noNote.push(name);
      var series = {};
      refs.forEach(function (x) { var s = resolve(x).series; if (s) series[s] = 1; });
      if (Object.keys(series).length > 1) mixed.push(name);
      var hero = refs[0] && resolve(refs[0]);
      if (hero && Math.max(hero.w, hero.h) < 900) lowRes.push(name);
    });
    if (p.rooms.length) {
      if (noImg.length) add('bad', '没有图的空间：' + noImg.join('、'), '空白的位置会让人以为方案还没做完。', 'rooms');
      else add('ok', '每个空间都有主图', '一张主图先给感觉（System 1），辅图再补细节。');
      if (tooMany.length) add('warn', '超过 3 张图：' + tooMany.join('、'), '同一页风格太多，客户要开始比较 —— 那是 System 2 的工作，会累。一张主图 + 两张辅图就够。', 'rooms');
      if (mixed.length) add('warn', '同一页混了不同系列的图：' + mixed.join('、'), 'WYSIATI：客户会把每一页拼成一个故事。同一页两种风格，故事就讲不通。', 'rooms');
      if (lowRes.length) add('warn', '主图太小，打印会糊：' + lowRes.join('、'), '模糊的图会造成认知紧张 —— 客户说不出哪里不对，但会觉得不够好。', 'rooms');
      if (noFeat.length) add('warn', '没有勾卖点：' + noFeat.join('、'), '只放图，客户只能自己猜「这对我有什么用」。', 'rooms');
      if (noNote.length) add('warn', '没写「为你」那一句：' + noNote.join('、'), '具体的生活场景 System 1 一看就懂；抽象的柜型名称要靠 System 2 翻译。「你们天天开火，所以…」比任何形容词都有力。', 'rooms');
      else add('ok', '每个空间都写了「为你」', '每一页都在讲他们的家，不是我们的产品。');
    }

    // 4 · 你说的 · 我们做的
    if (!p.pages.needs) { /* 关掉了这一页，不检查 */ }
    else if (!p.needs.length) add('warn', '没有「你们说的 · 我们做的」', '客户最想确认的是「你有没有听懂我」。贴需求卡就会自动带出来。', 'brief');
    else {
      var empty = p.needs.filter(function (n) { return !MB.needAnswer(n, p); }).length;
      if (empty) add('bad', empty + ' 条客户原话还没写我们的做法', '只引用不回答，等于告诉客户「我们听到了，但没做」。', 'brief');
      else add('ok', '客户的原话都有对应做法', '用他们自己的话开头，最容易被接受。');
      if (p.needs.length > 5) add('tip', '需求超过 5 条，只会显示前 5 条', '挑最痛的 3–5 条就好。', 'brief');
    }

    // 4b · 英文方案里混了中文（销售自己打的字不会自动翻译）—— 「去改」直接到第一处所在的分页
    if (p.lang === 'en') {
      var CJK = /[㐀-鿿]/, mixedLang = 0, firstTab = null;
      var hit = function (v, tab) {
        if (typeof v === 'string' && CJK.test(v)) { mixedLang++; firstTab = firstTab || tab; }
      };
      p.needs.forEach(function (n) { hit(MB.needQuote(n), 'brief'); hit(MB.needAnswer(n, p), 'brief'); });
      p.rooms.forEach(function (r) { hit(r.title, 'rooms'); hit(r.note, 'rooms'); });
      p.promises.forEach(function (t) { hit(t, 'style'); });
      p.visit.prepared.forEach(function (t) { hit(t, 'visit'); });
      var x = p.extra || {};
      if (MB.hasPractical(p) && p.pages.practical !== false) { hit(x.timeline, 'visit'); hit(x.budget, 'visit'); hit(x.built, 'visit'); }
      if (p.pages.plan && p.plan.src) hit(x.notIncluded, 'plan');
      if (mixedLang) add('warn', '英文方案里有 ' + mixedLang + ' 处中文', '一份文件两种语言会造成认知紧张。翻成英文，或把方案切到「双语」。', firstTab);
    }

    // 4c · 排版放不下（自动缩小两级后还是太多）
    var ov = overflow || {};
    if (ov.needs) add('warn', '「你们说的」放不下，最后几条会被裁掉', '挑最痛的 3–4 条，或把做法写短。被裁掉的话，客户只会看到半句。', 'brief');
    if (ov.plan) add('warn', '平面图页右边的编号清单放不下', '空间太多或「这次没包含」写太长 —— 合并相近的空间，或把那句写短。', 'plan');
    if (ov.rooms && ov.rooms.length) {
      var names = p.rooms.filter(function (r) { return ov.rooms.indexOf(r.uid) > -1; }).map(function (r) { return MB.t(MB.roomTitle(p, r), 'zh'); });
      if (names.length) add('warn', '字太多放不下：' + names.join('、'), '「为你」那句写短一点，或少勾一个卖点。一页只讲一件事，System 1 才接得住。', 'rooms');
    }
    if (p.lang === 'bi') {
      var cut = p.rooms.filter(function (r) { return r.feats.length > 3; }).map(function (r) { return MB.t(MB.roomTitle(p, r), 'zh'); });
      if (cut.length) add('tip', '双语每页只印 3 个卖点：' + cut.join('、'), '需求卡点到的排最前，其余的留到展厅讲。', 'rooms');
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
    if (!p.pages.invite) add('bad', '关掉了到馆邀约页', '峰终定律：到馆那天的高峰和离开时的感受决定他们怎么记住这次体验 —— 方案最后一页要给下一步，而不是电话号码。', 'visit');
    else if (!vd) add('bad', '还没定到馆时间', '「欢迎参观」不是下一步。先替他们留好一个时段 —— 改时间比决定要不要来容易。', 'visit');
    else if (vd < today) add('bad', '到馆日期已经过了', '改成未来的日期。', 'visit');
    else if (p.visit.auto) add('warn', '到馆时段是按需求卡自动建议的 —— 先确认真的留了', '「已为你们保留」只有在真的保留时才能写。确认后到 ⑤ 按「已确认留好」（或直接改时段），这条就会消失。', 'visit');
    else {
      add('ok', '结尾已经替客户留好时段', '默认选项：已经留好的时间，最容易被接受。');
      if (!MB.parseISO(p.visit.date2)) add('tip', '可以再给一个备选时段', '给两个选项，让他们回「1」或「2」—— 不问开放题（最省力法则）。', 'visit');
    }
    add('tip', '确认展厅真的准备好「为你们准备的三样」，时段也真的留了', '「已为你们保留」只有在真的保留时才能写；说到做到，到馆那天才会是真正的高峰。', 'visit');

    // 6b · 工期 · 预算 · 保障
    if (!MB.hasPractical(p)) add('tip', '没有「工期 · 预算 · 保障」这一页', '第一个具体数字会变成锚（锚定）；没讲到的保障，在客户眼里等于没有（WYSIATI）。有公司认可的真实资料就填在 ⑤。', 'visit');

    // 7 · 材料是示例
    var d = MB.dir(p);
    var same = p.materials.every(function (m, i) { return d.materials[i] && m.en === d.materials[i].en; });
    if (same) add('tip', '材料还是示例名称', '换成真实板材色号（例：EGGER H3303）。具体的名称比形容词可信。', 'style');

    // 8 · 页数
    var pages = MB.pageList(p).length;
    if (pages > 16) add('warn', '共 ' + pages + ' 页，偏长', '页数越多，每一页的分量越轻。合并相近的空间，或把次要空间留到展厅讲。', 'rooms');

    // 9 · 二维码网址
    var link = MB.inviteLink(p);
    if (p.pages.invite && link.local) add('warn', '二维码指向本机网址，客户扫不开', '在 config.js 填 publicBase（正式网址），或在正式网站上做方案。', 'visit');

    // 10 · 联络
    if (!String(p.host.wa || '').replace(/\D/g, '')) add('warn', '没有你的 WhatsApp 号码', '客户看完想问，第一个找的就是你的号码。', 'brief');

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
