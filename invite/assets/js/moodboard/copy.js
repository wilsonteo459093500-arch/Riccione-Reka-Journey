/* ============================================================
   Moodboard 生成器 · 文案
   ------------------------------------------------------------
   根据这份方案，直接写好销售要发的每一则讯息：
     发方案 → 邀约到馆 → 没回跟进 → 到馆前提醒 → 60 秒讲解稿 → AI 润色提示词
   每一则都标注用了《快思慢想》的哪个原理 —— 让销售知道「为什么这样写」，
   下次自己写也会。

   底线：不编数字、不编折扣、不写「限时」「最后机会」。
   施压会叫醒 System 2 的戒心，长期只会降低回复率。
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};

  var P = {
    name:    { zh: '名字 · 与我有关', d: 'System 1 会自动注意跟自己有关的东西 —— 第一行就是他们的名字和他们的家。' },
    ease:    { zh: '认知放松', d: '读起来不费力的讯息，感觉更可信、也更容易被接受。只讲三点，不讲十点。' },
    wysiati: { zh: 'WYSIATI · 所见即全部', d: '客户只会用眼前看到的东西拼出故事 —— 我们决定他先看到哪三件事。' },
    effort:  { zh: '最省力法则', d: '回一个数字就好。回复的门槛越低，越会回。' },
    loss:    { zh: '损失厌恶', d: '「照片给不了的东西」比「展厅很漂亮」更有推动力：人对失去的感受比得到强。' },
    own:     { zh: '「为你们」· 非书中概念', d: '「为你们准备好了」「你们的厨房」让方案读起来是他们的（心理拥有感）。注意：书里的禀赋效应讲的是已经拥有的东西，方案还没签不算拥有，别指望它。' },
    deflt:   { zh: '默认选项', d: '先替他们留好时段：维持默认最省力，改时间反而要多花力气（书里的器官捐献例子）。「回 1 或 2」的二选一格式是销售实务，不是书中概念。只有真的留了时段才这样写。' },
    ref:     { zh: '参照点 · 损失厌恶', d: '「已经为你们留好」把参照点设在「我们有这个时段」，不去就像失去它。前提是时段真的有留。' },
    avail:   { zh: '可得性', d: '一个具体、画面感强的细节，比一串卖点更容易被想起。' },
    calm:    { zh: '不触发戒心', d: '不施压、不催促。紧迫感会叫醒 System 2 的怀疑，反而不回。' },
    peakend: { zh: '峰终定律', d: '人记住的是高峰和结尾。结尾给「下一步」，不是电话号码或价格。' },
    halo:    { zh: '光环效应', d: '前 15 秒的印象，会染色后面听到的每一句。' },
    s1first: { zh: '先感受 · 再思考', d: '先用一句话给出整体感觉（System 1），细节等对方想听再讲（System 2）。' },
    words:   { zh: '用客户原话', d: '把他们说过的话原封不动说回去 —— 被听见，是最强的信任状。' }
  };

  function strip(s) { return String(s || '').trim().replace(/[。．.！!]+$/, ''); }
  function lower1(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
  var CJK = /[㐀-鿿豈-﫿]/;

  /** 三个重点：客户在乎的空间优先，每个空间取第一个被需求点到（或第一个勾选）的卖点 */
  function highlights(p, L) {
    var linked = {};
    p.needs.forEach(function (n) {
      var def = n.key && MB.NEEDS[n.key];
      if (def) def.feats.forEach(function (f) { linked[def.room + ':' + f] = 1; });
    });
    var out = [];
    MB.roomPriority(p).forEach(function (r) {
      if (out.length >= 3) return;
      var def = MB.ROOM[r.key];
      var chosen = def.feats.filter(function (f) { return r.feats.indexOf(f.id) > -1; });
      if (!chosen.length) return;
      var f = chosen.filter(function (x) { return linked[r.key + ':' + x.id]; })[0] || chosen[0];
      out.push({
        room: MB.t(MB.roomTitle(p, r), L), feat: MB.t({ en: f.en, zh: f.zh }, L),
        why: MB.t(f.why, L), page: MB.roomPageNo(p, r)
      });
    });
    return out;
  }

  /** 第一条客户原话（客户自己写的优先）；英文讯息不引用中文原话 */
  function firstNeed(p, L) {
    var list = p.needs.filter(function (n) {
      var q = MB.t(MB.needQuote(n), L);
      return q && !(L === 'en' && CJK.test(q));
    });
    list.sort(function (a, b) { return (a.key ? 1 : 0) - (b.key ? 1 : 0); });
    var n = list[0];
    if (!n) return null;
    var r = MB.needRoom(p, n);
    var ans = strip(MB.t(MB.needAnswer(n), L));
    if (CJK.test(ans) !== (L === 'zh')) ans = '';   // 做法和讯息不同语言就不引用，免得中英夹杂
    return { quote: strip(MB.t(MB.needQuote(n), L)), answer: ans, page: r ? MB.roomPageNo(p, r) : 0 };
  }

  function lines(arr) { return arr.filter(function (x) { return x != null; }).join('\n'); }

  /**
   * @param {object} p   方案
   * @param {'zh'|'en'} L
   * @returns {Array<{id,title,when,text,principles,wa}>}
   */
  MB.writeCopy = function (p, L) {
    var zh = L === 'zh';
    var names = MB.namesOr(p, L);
    var host = (p.host.name || '').trim() || (zh ? '溪岸团队' : 'the Sail team');
    var prop = MB.propertyLabel(p) || (zh ? '你们新家' : 'your new home');
    var hs = highlights(p, L);
    var need = firstNeed(p, L);
    var glanceNo = MB.pageNoOf(p, 'glance');
    var slot1 = MB.slotLabel(p.visit.date, p.visit.time, L);
    var slot2 = MB.slotLabel(p.visit.date2, p.visit.time2, L);
    var mins = +p.visit.mins || 60;
    var prep = MB.prepared(p).map(function (x) { return strip(MB.t(x, L)); });
    var prepShort = [0, 1, 2].map(function (i) { return strip(MB.preparedShort(p, i, L)); });
    var link = MB.inviteLink(p).url;
    var d = MB.dir(p);
    var wa = MB.msisdn(p.host.wa);
    var near = MB.sameTown && MB.sameTown(p, { venue: (window.SAIL || {}).venue }) ? p.property.area.trim() : '';

    var num = zh ? ['①', '②', '③'] : ['1.', '2.', '3.'];
    var hlLines = hs.map(function (h, i) {
      return zh ? num[i] + ' ' + h.room + '：' + h.feat + ' —— ' + h.why
        : num[i] + ' ' + h.room + ' — ' + lower1(h.feat) + '. ' + h.why;
    });

    var out = [];

    /* ---------- ① 发方案 ---------- */
    out.push({
      id: 'send', title: zh ? '① 发方案（附 PDF）' : '① Sending the proposal (with PDF)',
      when: zh ? '和 PDF 一起发。PDF 先发，这则紧跟在后。夫妻两人的话，最后补一句点名问两人各一个问题 —— 内容要来自见面时他们真的说过的话。'
        : 'Send right after the PDF. For a couple, add one question addressed to each of them — based on what they actually said when you met.',
      principles: [P.name, P.ease, P.wysiati, P.words, P.effort],
      text: zh ? lines([
        names + '，你们好！我是溪岸的 ' + host + '。',
        '',
        '为 ' + prop + ' 准备的柜体与氛围方案做好了（PDF 附上）。' +
          (glanceNo ? '第 ' + glanceNo + ' 页是「一页看懂」，30 秒就能看完整个家。' : ''),
        hs.length ? '' : null,
        hs.length ? '先看三个重点：' : null,
        hs.length ? hlLines.join('\n') : null,
        need ? '' : null,
        need ? '你们提到「' + need.quote + '」' + (need.page ? '—— 第 ' + need.page + ' 页就是为这个做的。' : '，方案里我们特别处理了。') : null,
        '',
        '看完回我一个页码就好：哪一页最像你们想要的家？'
      ]) : lines([
        'Hi ' + names + ', it’s ' + host + ' from Sail.',
        '',
        'Your cabinetry & mood proposal for ' + prop + ' is ready (PDF attached).' +
          (glanceNo ? ' Page ' + glanceNo + ' is the one-page version — the whole home in 30 seconds.' : ''),
        hs.length ? '' : null,
        hs.length ? 'Three things to look at first:' : null,
        hs.length ? hlLines.join('\n') : null,
        need ? '' : null,
        need ? 'You mentioned “' + need.quote + '”' + (need.page ? ' — page ' + need.page + ' is designed around that.' : ' — we planned around it.') : null,
        '',
        'When you’ve had a look, just reply with a page number: which page feels most like the home you want?'
      ])
    });

    /* ---------- ② 邀约到馆 ---------- */
    var reply = slot2 ? (zh ? '回我「1」或「2」就好 🙂' : 'Just reply “1” or “2” 🙂') : (zh ? '回我「好」就确认 🙂' : 'Just reply “OK” to confirm 🙂');
    out.push({
      id: 'invite', title: zh ? '② 邀约到馆' : '② Showroom invitation',
      when: zh ? '对方回了页码 / 有反应之后发；或发方案隔天。' : 'After they react to the proposal, or the next day.',
      principles: [P.loss, P.ref, P.deflt, P.effort, P.own, P.peakend],
      text: zh ? lines([
        names + '，照片看得到样子，但看不到手感 —— 抽屉拉出来的分量、木纹在指尖的感觉、柜门关上的那一声。',
        '',
        '我们在 Setia Alam 展厅为你们准备好了' + (near ? '（和你们新家在同一个镇区）' : '') + '：',
        prep.map(function (x) { return '· ' + x; }).join('\n'),
        '',
        slot1 ? '已经先帮你们留了 ' + slot1 + (slot2 ? '；不方便的话，' + slot2 + ' 也可以' : '') + '，大约 ' + mins + ' 分钟。' : '这个周末或下周，哪个时段方便？大约 ' + mins + ' 分钟。',
        slot1 ? reply : null,
        '',
        '邀请函（含停车路线）：' + link,
        host
      ]) : lines([
        names + ', photos show you how it looks — not how it feels: the weight of a drawer, the grain under your fingers, the sound a door makes as it closes.',
        '',
        'At our Setia Alam showroom' + (near ? ' — the same township as your new home —' : '') + ' we’ve prepared:',
        prep.map(function (x) { return '• ' + x; }).join('\n'),
        '',
        slot1 ? 'We’ve held ' + slot1 + ' for you' + (slot2 ? ' — or ' + slot2 + ' if that’s easier' : '') + '. It takes about ' + mins + ' minutes.' : 'Which time suits you this weekend or next week? It takes about ' + mins + ' minutes.',
        slot1 ? reply : null,
        '',
        'Your invitation (with parking guide): ' + link,
        host
      ])
    });

    /* ---------- ③ 没回 · 跟进 ---------- */
    var h0 = hs[0];
    out.push({
      id: 'nudge', title: zh ? '③ 两天没回 · 跟进' : '③ No reply after 2 days',
      when: zh ? '发方案后 2–3 天还没回。只发一次。' : '2–3 days of silence. Send once only.',
      principles: [P.calm, P.avail, P.loss, P.deflt],
      text: zh ? lines([
        names + '，不急着回 🙂 只补一句：',
        h0 ? '方案第 ' + h0.page + ' 页的' + h0.room + '，有一个细节照片看不出来：' + h0.why : '方案里有几个细节，照片其实看不出来。',
        '这种东西，到展厅 10 分钟就看清楚了。' + (slot1 ? '我还帮你们留着 ' + slot1 + '，要改时间随时说。' : '想约哪天，随时告诉我。')
      ]) : lines([
        'No rush at all, ' + names + ' 🙂 Just one thing:',
        h0 ? 'On page ' + h0.page + ' (' + h0.room + ') there’s a detail photos can’t really show: ' + lower1(h0.why) : 'A few details in the proposal don’t really come through in photos.',
        'It takes ten minutes in the showroom to see it properly.' + (slot1 ? ' I’m still holding ' + slot1 + ' for you — happy to move it.' : ' Let me know a day that suits you.')
      ])
    });

    /* ---------- ④ 到馆前一天 ---------- */
    var tLabel = MB.timeLabel(p.visit.time, L);
    out.push({
      id: 'remind', title: zh ? '④ 到馆前一天 · 提醒' : '④ Day-before reminder',
      when: zh ? '约好时间后，到馆前一天傍晚。' : 'The evening before the visit.',
      principles: [P.peakend, P.own, P.effort],
      text: !p.visit.date ? (zh ? '（先在「到馆」填好日期，这则才会生成）' : '(Set the visit date first.)') : zh ? lines([
        names + '，明天' + (tLabel ? tLabel : '') + ' 展厅见！',
        prepShort[0] + '，已经为你们准备好了。',
        '停车路线（一步一步带照片）在邀请函里：' + link,
        wa ? '到了直接 WhatsApp 我：+' + wa : null
      ]) : lines([
        'See you tomorrow' + (tLabel ? ' at ' + tLabel : '') + ', ' + names + '!',
        prepShort[0].charAt(0).toUpperCase() + prepShort[0].slice(1) + ' — all set out for you.',
        'Step-by-step parking guide (with photos) is in your invitation: ' + link,
        wa ? 'WhatsApp me when you arrive: +' + wa : null
      ])
    });

    /* ---------- ⑤ 60 秒讲解稿 ---------- */
    var talkH = hs.map(function (h, i) {
      return zh ? ['第一', '第二', '第三'][i] + '，' + h.room + '：' + h.feat + '。' + h.why
        : ['First', 'Second', 'Third'][i] + ', the ' + h.room.toLowerCase() + ': ' + lower1(h.feat) + '. ' + h.why;
    });
    out.push({
      id: 'voice', title: zh ? '⑤ 60 秒讲解稿（语音 / 电话 / 见面）' : '⑤ 60-second talk track (voice note / call)',
      when: zh ? '发完 PDF 补一段语音；或电话、见面时照这个顺序讲。' : 'As a voice note after the PDF, or on a call.',
      principles: [P.halo, P.s1first, P.words, P.peakend],
      text: zh ? lines([
        '【0–5 秒 · 先叫名字】',
        names + '，我是 ' + host + '。方案发给你们了，我用一分钟讲重点。',
        '',
        '【5–15 秒 · 一句话说完整个家】',
        '整个家我们走「' + d.zh + '」—— ' + d.mood.zh,
        '',
        '【15–45 秒 · 三个重点，每个都连回你们的生活】',
        talkH.length ? talkH.join('\n') : '（先在「空间」勾选卖点）',
        need ? '' : null,
        need ? '【45–55 秒 · 用他们自己的话收】' : null,
        need ? '你们说过「' + need.quote + '」' + (need.answer ? '，所以方案里是：' + need.answer + '。' : '，这一点方案里特别处理了。') : null,
        '',
        '【最后 5 秒 · 结尾给下一步，不讲价格】',
        '有些东西照片给不了。我们在展厅把' + prepShort[0] + '准备好了，' + (slot1 ? '先帮你们留了 ' + slot1 + '，可以吗？' : '你们挑个时间来看看？')
      ]) : lines([
        '[0–5 s · Say their names first]',
        names + ', it’s ' + host + '. I’ve sent your proposal — here’s the one-minute version.',
        '',
        '[5–15 s · The whole home in one sentence]',
        'We’ve designed the whole home around “' + d.en + '” — ' + lower1(d.mood.en),
        '',
        '[15–45 s · Three highlights, each tied to how you live]',
        talkH.length ? talkH.join('\n') : '(Tick features under Rooms first.)',
        need ? '' : null,
        need ? '[45–55 s · Close with their own words]' : null,
        need ? 'You told us “' + need.quote + '”' + (need.answer ? ' — so: ' + lower1(need.answer) + '.' : ' — we planned around that.') : null,
        '',
        '[Last 5 s · End on the next step, not the price]',
        'Some things photos can’t show. We’ve prepared ' + lower1(prepShort[0]) + ' at the showroom — ' + (slot1 ? 'we’ve held ' + slot1 + '. Does that work?' : 'which day suits you?')
      ])
    });

    /* ---------- ⑥ AI 润色提示词 ---------- */
    var facts = [
      '客户：{客户称呼}（发出前自己换回真名）',
      '楼盘：' + (MB.propertyLabel(p) || '（未填）') + (p.property.type ? '，' + p.property.type : ''),
      '风格方向：' + d.zh + ' ' + d.en + ' —— ' + d.mood.zh,
      '他们说过：' + (p.needs.map(function (n) { return '「' + strip(MB.t(MB.needQuote(n), 'zh') || MB.t(MB.needQuote(n), 'en')) + '」'; }).join('、') || '（无）'),
      '重点空间与卖点：' + (hs.map(function (h) { return h.room + '·' + h.feat + '（第 ' + h.page + ' 页）'; }).join('；') || '（无）'),
      '展厅为他们准备：' + prep.join('；'),
      '保留时段：' + (slot1 || '（未定）') + (slot2 ? '；备选 ' + slot2 : '') + '；约 ' + mins + ' 分钟',
      '邀请函链接：{邀请函链接}',
      '销售：' + host
    ];
    out.push({
      id: 'ai', title: zh ? '⑥ AI 润色提示词（贴进 ChatGPT / Gemini / Claude）' : '⑥ AI polish prompt (paste into ChatGPT / Gemini / Claude)',
      when: zh ? '想多几个版本、或换个口吻时用。把整段复制给 AI。客户的真名与链接故意留成 {占位}，不贴给第三方 AI —— 拿到结果后自己换回。'
        : 'When you want more variations. Paste the whole block into an AI chat. The client’s name and link are left as {placeholders} on purpose — put them back yourself.',
      principles: [P.ease, P.loss, P.deflt, P.peakend],
      noWa: true,
      text: lines([
        '你是马来西亚高端全屋定制品牌「溪岸 Sail by Riccione Reka」的资深销售设计师。',
        '请根据下面的方案资料，写 3 个不同口吻的 WhatsApp 讯息（用' + (zh ? '中文' : '英文') + '），目的：让客户看完 proposal 之后，愿意约时间到 Setia Alam 展厅。',
        '',
        '写法规则（来自《快思慢想》）：',
        '1. 第一行就叫客户名字、讲「他们的家」（System 1 会先注意跟自己有关的事）',
        '2. 只讲 3 个重点，每个都连回他们说过的话（认知放松 + 所见即全部）',
        '3. 用「避免麻烦 / 避免损失」的说法，不要堆功能（损失厌恶）',
        '4. 直接给一个已保留的时段 + 一个备选，请对方回 1 或 2（默认选项 + 最省力法则）',
        '5. 结尾是下一步，不是价格、不是公司介绍（峰终定律）',
        '6. 不要编造任何数字、折扣或期限；不要用「限时」「最后机会」这类施压字眼',
        '7. 每则不超过 ' + (zh ? '120 字' : '90 words') + '；口吻像人，不像广告；最多 1 个 emoji',
        '8. 保留 {客户称呼}、{邀请函链接} 这两个占位，不要自己编名字或网址',
        '',
        '方案资料：',
        facts.map(function (f) { return '- ' + f; }).join('\n')
      ])
    });

    return out;
  };

  MB.COPY_PRINCIPLES = P;
})();
