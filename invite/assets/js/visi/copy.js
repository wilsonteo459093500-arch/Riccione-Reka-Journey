/* ============================================================
   VISI · 文案
   ------------------------------------------------------------
   根据这份方案，直接写好销售要发的每一则讯息：
     发方案 → 邀约到馆 → 没回跟进 → 到馆前提醒 → 60 秒讲解稿 → AI 润色提示词
   每一则都标注用了哪个原理 —— 让销售知道「为什么这样写」，下次自己写也会。
   另外三样给方案页用：
     MB.draftLetter  第 2 页的开场短话（自动草稿，销售改一句就变成他的话）
     MB.caseNote     「参考空间」每个案例那一句
     MB.pageNotes    每一页的讲稿（PPTX 备注；页面上不印的细节都在这里）

   写法分层（README「文案怎么写」）：结构一页一件事；说服点只用真的；
   语气讲他们在乎的事；先说出他们的顾虑；具体细节胜过形容词。
   底线：不编数字、不编折扣、不编案例、不写「限时」「最后机会」。
   引号只给客户自己打的字；需求卡勾选的选项用转述（「你们提到…」），不当成原话引用。
   施压会叫醒戒心，长期只会降低回复率。
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
    avail:   { zh: '可得性', d: '一个具体、画面感强的细节，比一串卖点更容易被想起。' },
    calm:    { zh: '不触发戒心', d: '不施压、不催促。紧迫感会叫醒 System 2 的怀疑，反而不回。' },
    peakend: { zh: '峰终定律', d: '人记住的是高峰和结尾。结尾给「下一步」，不是电话号码或价格。' },
    halo:    { zh: '光环效应', d: '前 15 秒的印象，会染色后面听到的每一句。' },
    s1first: { zh: '先感受 · 再思考', d: '先用一句话给出整体感觉（System 1），细节等对方想听再讲（System 2）。' },
    words:   { zh: '用客户原话', d: '把他们说过的话原封不动说回去 —— 被听见，是最强的信任状。只有他们自己打的字才加引号；勾选的选项用「你们提到…」转述。' },
    noq:     { zh: '用「不」来回答的问句', d: '「会不会太赶？」比「方便吗？」好回：回一句「不会」，对方觉得是自己做的决定，没有被推着走。' },
    note2:   { zh: '先读到写给他们的话', d: '先告诉他们第 2 页是写给他们的：翻开第一眼看到的是自己，不是型录。' }
  };

  function strip(s) { return String(s || '').trim().replace(/[。．.！!]+$/, ''); }
  function lower1(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
  function cap1(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  var CJK = /[㐀-鿿豈-﫿]/;
  var NUM_EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  /** 英文句子里的小数字拼出来（two more spaces），10 以上照写数字 */
  function numEn(n) { return NUM_EN[n] || String(n); }

  /** 最多三个重点：客户在乎的空间优先，每个空间取被需求点到的（否则第一个勾选的）卖点。
      与方案房间页同一套排序（MB.roomFeats），讲的和印的一致 */
  function highlights(p, L) {
    var out = [];
    MB.roomPriority(p).forEach(function (r) {
      if (out.length >= 3) return;
      var f = MB.roomFeats(p, r)[0];
      if (!f) return;
      out.push({
        room: MB.t(MB.roomTitle(p, r), L), key: r.key, custom: !!r.title, feat: MB.t({ en: f.en, zh: f.zh }, L),
        why: MB.t(f.why, L), page: MB.roomPageNo(p, r)
      });
    });
    return out;
  }
  /** 讲解稿里的「the kitchen」；销售自己取的名字（Ethan’s Room）原样，不改小写 */
  function theRoom(h) { return h.custom ? h.room : 'the ' + (h.key === 'dining' ? 'dining area' : h.room.toLowerCase()); }
  /** 「Mr & Mrs Lim，…」—— 没有名字就拿掉称呼，句首大写 */
  function voc(names, rest, zh) {
    if (names) return names + (zh ? '，' : ', ') + rest;
    return zh ? rest : cap1(rest);
  }

  function lines(arr) { return arr.filter(function (x) { return x != null; }).join('\n'); }

  /* ============================================================
     客户说过的那一件事（开场短话、讯息、讲稿引用同一条）
     ============================================================ */

  /** 字数：华文 = 汉字 + 夹在里面的英文词 / 数字；英文 = 词数（moodboard 的字数上限用这个量） */
  function count(s, L) {
    s = String(s || '');
    if (L === 'zh') {
      var han = (s.match(/[㐀-鿿豈-﫿]/g) || []).length;
      return han + (s.replace(/[㐀-鿿豈-﫿]/g, ' ').match(/[A-Za-z0-9][\w:.’'-]*/g) || []).length;
    }
    return s.split(/\s+/).filter(function (w) { return /[A-Za-z0-9]/.test(w); }).length;
  }
  MB.textCount = count;
  var LETTER_MAX = { zh: 70, en: 55 };   // 第 2 页正文上限（moodboard：2–3 句）

  function sameLang(s, L) { return !!s && CJK.test(s) === (L === 'zh'); }
  function end(s, zh) { s = strip(s); return s ? s + (/[?？…]$/.test(s) ? '' : zh ? '。' : '.') : ''; }
  /** 我们自己写的句子才降第一个字母；销售打的字，只在开头是常见字时才降（名字、TV 不动）。
      销售的做法多半是名词短语（「Two tall pantries…」「Pull-out pantry…」）：这些开头字也要降，接在冒号后面才不会句中大写 */
  var COMMON = /^(a|an|the|every|each|all|one|two|three|four|our|your|you|we|it|its|this|these|there|no|nothing|more|open|low|lit|tall|floating|ceiling-high|full-height|wardrobes|shelves|storage|pots|with|lots|luggage|pull-outs?|built-in|soft-close|hidden|new|bigger|wider|deeper)\b/i;
  function lowerSafe(s) { return COMMON.test(s || '') && !/^[A-Z]{2}/.test(s) ? lower1(s) : s; }
  /** 我们写的英文句子里，销售打的「A + B」念成「A and B」 */
  function plusEn(s) { return String(s || '').replace(/\s*\+\s*/g, ' and '); }
  /** 念出来的华文：「吊柜 + 地柜」念成「吊柜加地柜」 */
  function plusZh(s) { return String(s || '').replace(/\s*\+\s*/g, '加'); }

  /** 华文讯息、讲稿的称呼跟方案页（开场短话、「为 X」、封底）一样：「Mr & Mrs Wong」→「Wong 先生、太太」；
      华文名字原样。deck.js 有 MB.zhName 就用它（两边永远一致），没有就用同一条规则 */
  function zhNames(names) {
    if (!names) return names;
    if (typeof MB.zhName === 'function') { try { return MB.zhName(names) || names; } catch (e) { /* 用下面的 */ } }
    if (CJK.test(names)) return names;
    var m = /^(mr\.?\s*(?:&|and)\s*mrs\.?|mrs\.?|mr\.?|ms\.?|miss|madam|dr\.?)\s+(.+)$/i.exec(names);
    if (!m) return names;
    var h = m[1].toLowerCase().replace(/\./g, '');
    var t = /&|and/.test(h) ? '先生、太太' : { mr: '先生', mrs: '太太', ms: '女士', miss: '小姐', madam: '女士', dr: '医生' }[h];
    return t ? m[2] + ' ' + t : names;
  }
  /** 称呼：华文用「Wong 先生、太太」，英文照销售填的 */
  function namesFor(p, zh) { var n = MB.namesOr(p); return zh ? zhNames(n) : n; }

  /** 一两个空间的方案不能说「整个家」（英文 whole home 是真的整间）；还没加空间时，就是给整个家的 */
  function wholeHome(p) { return !p.rooms.length || p.rooms.length > 2; }

  /** 空间名放进句子里：the kitchen / your kitchen；销售取的名字（Ethan’s Room）原样 */
  var IN_SENTENCE = { dining: 'dining area' };   // 「the dining」不成话
  function roomRef(p, r, L, your) {
    var t = MB.roomTitle(p, r);
    if (typeof t === 'string') return t;
    return L === 'zh' ? t.zh : (your ? 'your ' : 'the ') + (IN_SENTENCE[r.key] || t.en.toLowerCase());
  }
  /** 空间的种类名（不看销售取的名字）：「厨房」/「kitchen」—— 案例那一句用 */
  function roomKind(key, L) {
    var d = MB.ROOM[key];
    if (!d) return '';
    return L === 'zh' ? d.zh : IN_SENTENCE[key] || d.en.toLowerCase();
  }
  function listJoin(arr, L) {
    if (arr.length < 2) return arr.join('');
    return L === 'zh' ? arr.slice(0, -1).join('、') + '和' + arr[arr.length - 1]
      : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
  }
  /** 楼盘念出来：「Setia Alam 的 Quartz」/「Quartz in Setia Alam」（页面上的「 · 」不好念） */
  function propSpoken(p, L) {
    var name = String(p.property.name || '').trim(), area = String(p.property.area || '').trim();
    if (name && area) return L === 'zh' ? area + ' 的 ' + name : name + ' in ' + area;
    return name || area;
  }

  /** 方案里的「原创系列」几页：pages = 五个系列页的页码（MB.SERIES_ORDER 的顺序；没有这一页的不算），
      overview = 「原创系列」总览页的页码（没有 = 0）。方案不「走」哪一个系列：这些页是介绍溪岸，不是替客户定了一个 */
  function seriesInfo(p) {
    var pages = (MB.SERIES_ORDER || []).map(function (k) { return MB.pageNoOf(p, 'series', k); }).filter(Boolean);
    return { pages: pages, overview: MB.pageNoOf(p, 'collections') };
  }
  /** 五个系列的名字（MB.SERIES 的固定顺序）：华文「骨骼线、空山、织、雾山、侘寂东方」/ 英文「…, Misty Mountain and Wabi-Sabi Eastern」 */
  function seriesNames(L) {
    var n = (MB.SERIES || []).map(function (s) { return L === 'zh' ? s.zh : s.en; }).filter(Boolean);
    return L === 'zh' ? n.join('、') : listJoin(n, 'en');
  }

  /** 句子太长就只取第一个分句（照原文，不改字），后面接「…」 */
  function firstClause(s, L, max) {
    if (count(s, L) <= max) return s;
    var cut = s.split(/[，,；;：:。]|\s+—\s+/)[0];
    return count(cut, L) >= 3 ? cut + '…' : s;
  }

  /** 这条需求对应的空间应该在方案里，却不在（例：「鞋子很多」→ 玄关，但方案没有玄关）。
      这样的需求不能说「这份方案这样做」（check.js 用同一条规则提醒） */
  function roomMissing(p, n) {
    if (!n || MB.needRoom(p, n)) return false;
    var d = MB.needDef(p, n.key);
    return !!(n.roomUid || n.room || (d && d.room));
  }
  MB.needRoomMissing = roomMissing;

  /**
   * 一条需求在 L 语言里怎么说：
   *   quote   客户 / 销售自己打的字（可以加引号引用）；英文不引华文原话，华文可以引英文原话
   *   told    需求卡勾选项的转述（data.js 的 told）：不加引号
   *   answer  我们的做法（只给 L 语言的）；answered = 任何语言有做法（「第 N 页就是为这个做的」看这个）
   */
  function needView(p, n, L) {
    if (!n) return null;
    var zh = L === 'zh';
    var custom = typeof n.quote === 'string' && n.quote.trim() !== '';
    var q = strip(MB.t(MB.needQuote(n), L));
    var def = n.key && MB.NEEDS[n.key];
    var told = '';
    if (!custom && q) told = def && def.told ? strip(def.told[zh ? 'zh' : 'en']) : '';
    var room = MB.needRoom(p, n);
    var any = strip(MB.t(MB.needAnswer(n, p), L));
    return {
      n: n, custom: custom,
      quote: custom && (zh || !CJK.test(q)) ? q : '',
      told: told,
      // 旧资料没有 told 的勾选项：只能照选项文字转述（不加引号）
      plain: !custom && q && !told && sameLang(q, L) ? q : '',
      answer: sameLang(any, L) ? any : '', answered: !!any,
      customAns: n.answer != null && String(n.answer).trim() !== '',
      room: room, page: room ? MB.roomPageNo(p, room) : 0
    };
  }

  /** 挑哪一条（L = 挑的语言）：有 L 语言做法的 > 别的语言有做法 > 还没做法；客户自己写的 > 勾选项。
      华文：有华文可说的需求时，不引英文原话；英文：引不了华文原话的，只在有页码时才用（「你们说过的厨房」）。
      对应空间不在方案里的不挑 —— 不能答应方案里没有的东西 */
  function pickNeed(p, L) {
    var best = null, rank = 1e9;
    p.needs.forEach(function (n, i) {
      var v = needView(p, n, L);
      if (!v || roomMissing(p, n)) return;
      if (!v.quote && !v.told && !v.plain && !(v.custom && v.page)) return;
      var r = (v.answer ? 0 : v.answered ? 2 : 4) + (v.custom ? 0 : 1);
      if (v.custom && !v.quote) r += 8;                                   // 英文信：华文原话只能转述成「你们说过的厨房」
      if (L === 'zh' && v.quote && !CJK.test(v.quote)) r += 8;            // 华文：有华文的需求可说，就不引英文原话
      r = r * 100 + i;
      if (r < rank) { rank = r; best = n; }
    });
    return best;
  }
  /** 开场短话、讯息、讲稿共用的那一条。双语方案：华文一段挑的那条，英文一段也讲同一条 */
  function letterNeed(p, L) {
    var n = pickNeed(p, p.lang === 'bi' ? 'zh' : L);
    return n ? needView(p, n, L) : null;
  }

  /**
   * 「你们说的」页每一行左边那一句（deck.js / PPTX 用）：
   *   客户 / 销售自己打的字 → { text: 原话, typed: true }（页面加引号）
   *   需求卡勾选的选项     → { text: '你们提到家里有长辈同住', typed: false }（转述，不加引号 —— 不是他们亲口说的）
   *   旧资料没有 told 的勾选项：照选项文字，也不加引号
   * 跟开场短话、讯息、讲稿同一套说法，第 2 页和第 3 页不会一边转述、一边引号。上限 20 字 / 12 words 以内。
   * @param {'zh'|'en'} L
   * @returns {{text:string, typed:boolean}|null}
   */
  MB.needSaid = function (p, n, L) {
    if (!n) return null;
    var zh = L === 'zh';
    if (typeof n.quote === 'string' && n.quote.trim()) return { text: strip(n.quote), typed: true };
    var dk = n.key && MB.NEEDS[n.key];
    if (dk && dk.told) return { text: zh ? '你们提到' + strip(dk.told.zh) : 'You mentioned ' + strip(dk.told.en), typed: false };
    var q = strip(MB.t(MB.needQuote(n), zh ? 'zh' : 'en'));
    return q ? { text: q, typed: false } : null;
  };

  /**
   * 第 2 页的开场短话（不含称呼与署名 —— 方案页自己印「Dear …」和署名）。
   * 三段：① 他们说过的一件事（让他们心里说「对，就是这样」）② 这份方案怎么回应 ③ 慢慢看，见面一起过。
   * 有做法可讲时，第 ② 段只讲做法（黏上别的话读起来像机器拼的）；没有做法可讲时，第 ② 段说后面有溪岸的五个原创系列 ——
   * 只是介绍溪岸，让他们自己看哪一个最像他们的家，不说方案「走」哪一个。
   * 第 ③ 段不约时间：到馆邀约页和 WhatsApp 已经在约了，这一页不重复。
   * 上限 70 字 / 55 words（moodboard：2–3 句）。放不下就依序：做法只留第一个分句 → 原话再短 → 拿掉原创系列那句 → 拿掉第 ③ 段。
   * @param {'zh'|'en'|'bi'} L
   */
  MB.draftLetter = function (p, L) {
    if (L === 'bi') return [MB.draftLetter(p, 'zh'), MB.draftLetter(p, 'en')].join('\n\n');
    var zh = L === 'zh';
    L = zh ? 'zh' : 'en';
    var v = letterNeed(p, L);
    var sp = zh ? '' : ' ';

    // 原创系列那一句（没有做法可讲时才说）：系列页在空间页后面；只有总览页就指那一页；两种都关了就不说
    var si = seriesInfo(p);
    var series = si.pages.length
      ? (p.rooms.length
        ? (zh ? '空间之后，是溪岸的五个原创系列，看看哪一个最像你们想要的家。' : 'After the rooms come SAIL’s five original collections: see which one feels most like your home.')
        : (zh ? '后面是溪岸的五个原创系列，看看哪一个最像你们想要的家。' : 'Further on are SAIL’s five original collections: see which one feels most like your home.'))
      : si.overview
        ? (zh ? '第 ' + si.overview + ' 页是溪岸的五个原创系列，看看哪一个最像你们想要的家。' : 'Page ' + si.overview + ' shows SAIL’s five original collections: see which one feels most like your home.')
        : '';

    // 没有需求可引：说「这一份是为哪几个空间做的」
    function intro() {
      var names = p.rooms.slice(0, 3).map(function (r) {
        var t = MB.roomTitle(p, r);
        return typeof t === 'string' ? t : zh ? t.zh : IN_SENTENCE[r.key] || t.en.toLowerCase();
      });
      var more = p.rooms.length - names.length;
      var name = (p.property.name || '').trim(), area = (p.property.area || '').trim();
      if (zh) {
        var what = !names.length ? '新家' : more > 0 ? names.join('、') + '等 ' + p.rooms.length + ' 个空间' : listJoin(names, 'zh');
        return '这一份，是为你们' + (name || area ? ' ' + (name || area) + ' ' : '') + '的' + what + '做的。';
      }
      if (more > 0) names.push(numEn(more) + ' more space' + (more > 1 ? 's' : ''));
      return 'This moodboard is for ' + (names.length ? 'your ' + listJoin(names, 'en') : 'your new home') +
        (name ? ' at ' + name : area ? ' in ' + area : '') + '.';
    }

    // ① 他们说的：自己打的字加引号；勾选项转述；英文信引不了华文原话 → 指出那一页
    var viaPage = false;
    function said(maxQ) {
      if (v.quote) {
        var q = firstClause(v.quote, L, maxQ);
        return zh ? '你们说「' + q + '」。' : 'You told us: “' + end(q, false) + '”';
      }
      if (v.told) return zh ? '你们提到' + v.told + '。' : 'You mentioned ' + v.told + '.';
      if (v.plain) return zh ? '你们提到：' + v.plain + '。' : 'You mentioned: ' + lower1(v.plain) + '.';
      viaPage = true;
      if (!v.answered) return zh ? '你们说过的' + roomRef(p, v.room, 'zh') + '，我们见面时一起想。'
        : 'About ' + roomRef(p, v.room, 'en') + ' you mentioned: we’ll work that out with you when we meet.';
      return zh ? '你们说过的' + roomRef(p, v.room, 'zh') + '，在第 ' + v.page + ' 页。'
        : cap1(roomRef(p, v.room, 'en')) + ' you told us about is on page ' + v.page + '.';
    }
    // ② 我们的做法：「所以第 8 页的主卧：…」/「So on page 8, in your master bedroom: …」
    function answer(short) {
      var a = short ? firstClause(v.answer, L, 1) : v.answer;
      // 做法里已经说了是哪个空间（「洗衣房一个清洁高柜」），前面就不再说一次
      var rn = v.room ? roomRef(p, v.room, L) : '', named = !!rn && a.toLowerCase().indexOf(rn.replace(/^the /, '').toLowerCase()) > -1;
      if (zh) {
        return (v.page ? '所以第 ' + v.page + ' 页' + (named ? '' : '的' + rn) : '我们的做法') + (!named && /[：:]/.test(a) ? '，' : '：') +
          end(a.replace(/\s*\+\s*/g, '，加上'), true);
      }
      a = plusEn(v.customAns ? lowerSafe(a) : lower1(a));
      // 一律用冒号：销售打的做法有句子（We moved the fridge…）也有名词短语（Two tall pantries…），冒号后面两种都通；
      // 逗号接名词短语会变成没有动词的半句
      return end(v.page ? 'So on page ' + v.page + (named ? '' : ', in ' + roomRef(p, v.room, 'en', true)) + ': ' + a : 'Our answer: ' + a, false);
    }
    // 没有 L 语言的做法：有页码就指过去（真的有做），还没做法就老实说见面一起想
    function noAnswer() {
      if (viaPage) return '';
      if (v.answered && v.page) return zh ? '第 ' + v.page + ' 页的' + roomRef(p, v.room, 'zh') + '，就是照这一点做的。'
        : 'Page ' + v.page + ', ' + roomRef(p, v.room, 'en', true) + ', is planned around that.';
      return zh ? '这一点，我们见面时一起想。' : 'We’ll work this one out with you when we meet.';
    }

    var p3 = zh ? '慢慢看，想改的地方圈起来，见面一起过一遍。' : 'Take your time — circle anything you’d change, and we’ll go through it together.';

    function build(o) {
      var paras;
      if (!v) paras = [intro()].concat(o.noSeries || !series ? [] : [series]);
      else if (v.answer) paras = [said(o.q), answer(o.short)];
      else {
        viaPage = false;
        var s1 = said(o.q), s2 = noAnswer();
        paras = [s1 + (s2 ? sp + s2 : '')].concat(o.noSeries || !series ? [] : [series]);
      }
      if (!o.noP3) paras.push(p3);
      return paras.join('\n\n');
    }
    var qMax = zh ? 20 : 12, qMin = zh ? 12 : 8;
    var tries = [{ q: qMax }, { q: qMax, short: true }, { q: qMin, short: true },
      { q: qMin, short: true, noSeries: true }, { q: qMin, short: true, noSeries: true, noP3: true }];
    var out = '';
    for (var i = 0; i < tries.length; i++) {
      out = build(tries[i]);
      if (count(out, L) <= LETTER_MAX[L]) return out;
    }
    return out;   // 还是超过（销售写的原话、做法都很长）：给最短的那一版，体检会提醒
  };

  /* ============================================================
     讯息
     ============================================================ */
  /**
   * @param {object} p   方案
   * @param {'zh'|'en'} L
   * @returns {Array<{id,title,when,text,principles,wa}>}
   */
  MB.writeCopy = function (p, L) {
    var zh = L === 'zh';
    // 华文讯息跟 PDF 同一个称呼（「Wong 先生、太太」），客户收到的头两样东西不要一个叫法一个样
    var names = namesFor(p, zh);
    var whole = wholeHome(p);
    var hostName = (p.host.name || '').trim();
    // 没填业务名：用品牌开口，不要印出「我是溪岸的 溪岸团队」
    var sign = hostName || (zh ? '溪岸 SAIL' : 'SAIL');
    var propL = MB.propertyLabel(p);
    var hs = highlights(p, L);
    var need = letterNeed(p, L);   // 跟第 2 页开场短话同一条
    var si = seriesInfo(p), coNo = si.overview;   // 「原创系列」总览页
    var letterNo = MB.pageNoOf(p, 'letter');
    var slot1 = MB.slotLabel(p.visit.date, p.visit.time, L);
    var slot2 = MB.slotLabel(p.visit.date2, p.visit.time2, L);
    var mins = +p.visit.mins || 60;
    // 没有空间、也没有平面图时 model.js 只给两样：缺的那一样不印、也不能当掉
    var prep = MB.prepared(p).map(function (x) { return strip(MB.t(x, L)); }).filter(Boolean);
    var prepShort = [0, 1, 2].map(function (i) { try { return strip(MB.preparedShort(p, i, L)); } catch (e) { return ''; } });
    var prep0 = p.visit.prepared[0] == null ? lower1(prepShort[0]) : prepShort[0];
    var link = MB.inviteLink(p).url;
    var wa = MB.msisdn(p.host.wa);
    var near = !!(MB.sameTown && MB.sameTown(p, { venue: (window.SAIL || {}).venue }));
    var day1 = MB.parseISO(p.visit.date), today = new Date();
    today.setHours(0, 0, 0, 0);
    var upcoming = !!day1 && day1 >= today;   // 已经过了的日期，不能再说「还帮你们留着」
    // 按需求卡自动建议、还没确认的时段：只能「建议」，不能说「已经帮你们留了」（稀缺只写真的）
    var held = !!slot1 && !p.visit.auto;
    var heads = zh ? ['', '先看这一个重点：', '先看两个重点：', '先看三个重点：']
      : ['', 'One thing to look at first:', 'Two things to look at first:', 'Three things to look at first:'];

    var num = zh ? ['①', '②', '③'] : ['1.', '2.', '3.'];
    var hlLines = hs.map(function (h, i) {
      return zh ? num[i] + ' ' + h.room + '：' + h.feat + ' —— ' + h.why
        : num[i] + ' ' + h.room + ': ' + lower1(h.feat) + '. ' + h.why;
    });

    /** 「你们提到…」那一句：原话加引号；勾选项转述；英文讯息引不了华文原话 → 直接指那一页 */
    function needLine() {
      if (!need) return null;
      var pg = need.page;
      var tail = zh ? (pg && need.answered ? '，第 ' + pg + ' 页就是为这个做的。' : pg ? '，第 ' + pg + ' 页我们见面一起看。' : '，我们见面再细聊。')
        : (pg && need.answered ? ' — page ' + pg + ' is designed around that.' : pg ? ' — let’s go through page ' + pg + ' together.' : ' — let’s talk it through when we meet.');
      if (need.quote) return (zh ? '你们提到「' + need.quote + '」' : 'You mentioned “' + need.quote + '”') + tail;
      if (need.told) return (zh ? '你们提到' + need.told : 'You mentioned ' + need.told) + tail;
      if (need.plain) return (zh ? '你们提到：' + need.plain : 'You mentioned: ' + lower1(need.plain)) + tail;
      return zh ? '第 ' + pg + ' 页是你们说过的' + roomRef(p, need.room, 'zh') + '。'
        : need.answered ? 'Page ' + pg + ' is about ' + roomRef(p, need.room, 'en') + ' you told us about.'
        : 'About ' + roomRef(p, need.room, 'en') + ' you mentioned: let’s go through page ' + pg + ' together.';
    }

    var out = [];

    /* ---------- ① 发方案 ---------- */
    out.push({
      id: 'send', title: zh ? '① 发方案（附 PDF）' : '① Sending the proposal (with PDF)',
      when: zh ? '和 PDF 一起发。PDF 先发，这则紧跟在后。夫妻两人的话，最后补一句点名问两人各一个问题 —— 内容要来自见面时他们真的说过的话。'
        : 'Send right after the PDF. For a couple, add one question addressed to each of them — based on what they actually said when you met.',
      principles: [P.name, P.note2, P.ease, P.words, P.effort],
      text: zh ? lines([
        (names ? names + '，你们好！' : '你好！') + (hostName ? '我是溪岸的 ' + hostName + '。' : '这里是溪岸。'),
        '',
        (propL ? '为 ' + propL + ' ' : '为你们新家') + '准备的全屋定制 moodboard 做好了（PDF 附上）。' +
          (letterNo ? '第 ' + letterNo + ' 页是' + (hostName ? '我' : '我们') + '写给你们的几句话；' : '') +
          (coNo ? '第 ' + coNo + ' 页是溪岸的五个原创系列，一页看完。' : (letterNo ? '先从那一页看起。' : '')),
        hs.length ? '' : null,
        hs.length ? heads[hs.length] : null,
        hs.length ? hlLines.join('\n') : null,
        need ? '' : null,
        needLine(),
        '',
        '看完回' + (hostName ? '我' : '我们') + '一个页码就好：哪一页最像你们想要的家？'
      ]) : lines([
        'Hi' + (names ? ' ' + names : '') + ', it’s ' + (hostName ? hostName + ' from SAIL.' : 'SAIL here.'),
        '',
        // 一两个空间不叫 whole-home（华文「全屋定制」是服务的名字，照用）
        'Your ' + (whole ? 'whole-home ' : '') + 'moodboard' + (propL ? ' for ' + propL : '') + ' is ready (PDF attached).' +
          (letterNo ? ' Page ' + letterNo + ' is a short note ' + (hostName ? 'I' : 'we') + ' wrote for you' + (coNo ? '; page ' + coNo + ' shows SAIL’s five original collections on a single page.' : '. Start there.') :
            coNo ? ' Page ' + coNo + ' shows SAIL’s five original collections on a single page.' : ''),
        hs.length ? '' : null,
        hs.length ? heads[hs.length] : null,
        hs.length ? hlLines.join('\n') : null,
        need ? '' : null,
        needLine(),
        '',
        'When you’ve had a look, just reply with a page number: which page feels most like the home you want?'
      ])
    });

    /* ---------- ② 邀约到馆 ---------- */
    // 两个时段就编号，客户才回得出「1」或「2」
    var slotLines = !slot1
      ? [zh ? '这个周末或下周，哪个时段方便？大约 ' + mins + ' 分钟。' : 'Which time suits you this weekend or next week? It takes about ' + mins + ' minutes.']
      : !held ? (slot2 ? (zh
        ? ['这两个时段，哪个比较好？大约 ' + mins + ' 分钟：', '① ' + slot1, '② ' + slot2, '回我「1」或「2」，我就帮你们留下来 🙂']
        : ['Would one of these suit you (about ' + mins + ' minutes)?', '1) ' + slot1, '2) ' + slot2, 'Reply “1” or “2” and I’ll hold it for you 🙂'])
        : (zh ? [slot1 + ' 过来，会不会太赶？大约 ' + mins + ' 分钟。', '回我「好」，我就帮你们留下来 🙂']
          : ['Would ' + slot1 + ' be too soon? It takes about ' + mins + ' minutes.', 'Reply “OK” and I’ll hold it for you 🙂']))
      : slot2 ? (zh
        ? ['已经先帮你们留了时段，大约 ' + mins + ' 分钟：', '① ' + slot1, '② ' + slot2 + '（备选）', '回我「1」或「2」就好 🙂']
        : ['We’ve held a time for you (about ' + mins + ' minutes):', '1) ' + slot1, '2) ' + slot2 + ' (if that’s easier)', 'Just reply “1” or “2” 🙂'])
      : (zh ? ['已经先帮你们留了 ' + slot1 + '，大约 ' + mins + ' 分钟。', '回我「好」就确认 🙂']
        : ['We’ve held ' + slot1 + ' for you. It takes about ' + mins + ' minutes.', 'Just reply “OK” to confirm 🙂']);
    out.push({
      id: 'invite', title: zh ? '② 邀约到馆' : '② Showroom invitation',
      when: zh ? '对方回了页码 / 有反应之后发；或发方案隔天。客户回「2」的话，先到「到馆」按「客户选了时段 2」，邀请函与提醒才会跟着换。'
        : 'After they react to the proposal, or the next day. If they reply “2”, press 「客户选了时段 2」 in the visit tab so the invitation and reminder follow.',
      principles: [P.loss, P.deflt, P.effort, P.own],
      text: zh ? lines([
        voc(names, '照片看得到样子，但看不到手感 —— 抽屉拉出来的分量、木纹在指尖的感觉、柜门关上的那一声。', true),
        '',
        '我们在 Setia Alam 展厅为你们准备好了' + (near ? '（和你们新家在同一个镇区）' : '') + '：',
        prep.map(function (x) { return '· ' + x; }).join('\n'),
        '',
        slotLines.join('\n'),
        '',
        '邀请函（含停车路线）：' + link,
        sign
      ]) : lines([
        voc(names, 'photos show you how it looks, not how it feels: the weight of a drawer, the grain under your fingers, the sound a door makes as it closes.', false),
        '',
        'At our Setia Alam showroom' + (near ? ' (in the same township as your new home)' : '') + ', we’ve prepared:',
        prep.map(function (x) { return '• ' + x; }).join('\n'),
        '',
        slotLines.join('\n'),
        '',
        'Your invitation (with parking guide): ' + link,
        sign
      ])
    });

    /* ---------- ③ 没回 · 跟进 ---------- */
    var h0 = hs[0];
    var hold = held && upcoming;
    out.push({
      id: 'nudge', title: zh ? '③ 两天没回 · 跟进' : '③ No reply after 2 days',
      when: zh ? '发方案后 2–3 天还没回。只发一次。' : '2–3 days of silence. Send once only.',
      principles: [P.calm, P.avail, P.loss, P.noq],
      text: zh ? lines([
        voc(names, '不急着回 🙂 只补一句：', true),
        h0 ? '方案第 ' + h0.page + ' 页的' + h0.room + '：' + h0.feat + ' —— ' + h0.why : '方案里有几个细节，照片其实看不出来。',
        '这些细节，到展厅亲手试一下就清楚了。' + (hold ? '我还帮你们留着 ' + slot1 + '，这个时间会不会太赶？' : '这个周末或下周过来看看，会不会太赶？')
      ]) : lines([
        'No rush at all' + (names ? ', ' + names : '') + ' 🙂 Just one thing:',
        h0 ? 'Page ' + h0.page + ', ' + theRoom(h0) + ': ' + lower1(h0.feat) + '. ' + h0.why : 'A few details in the proposal don’t really come through in photos.',
        'Details like this are easier to judge by hand in the showroom.' + (hold ? ' I’m still holding ' + slot1 + ' for you. Would that be too soon?' : ' Would this weekend or next be too soon to drop by?')
      ])
    });

    /* ---------- ④ 到馆前一天 ---------- */
    var tLabel = MB.timeLabel(p.visit.time, L);
    out.push({
      id: 'remind', title: zh ? '④ 到馆前一天 · 提醒' : '④ Day-before reminder',
      when: zh ? '约好时间后，到馆前一天傍晚。用的是「时段 1」—— 客户选了时段 2 的话，先到「到馆」按「客户选了时段 2」。'
        : 'The evening before the visit. Uses slot 1 — if the client picked slot 2, press 「客户选了时段 2」 in the visit tab first.',
      principles: [P.own, P.effort],
      noWa: !p.visit.date,
      text: !p.visit.date ? (zh ? '（先在「到馆」填好日期，这则才会生成）' : '(Set the visit date first.)') : zh ? lines([
        voc(names, '明天' + (tLabel ? tLabel : '') + ' 展厅见！', true),
        prepShort[0] + '，已经为你们准备好了。',
        '停车路线（一步一步带照片）在邀请函里：' + link,
        wa ? '到了直接 WhatsApp 我：+' + wa : null
      ]) : lines([
        'See you tomorrow' + (tLabel ? ' at ' + tLabel : '') + (names ? ', ' + names : '') + '!',
        cap1(prepShort[0]) + ': all set out for you.',
        'Step-by-step parking guide (with photos) is in your invitation: ' + link,
        wa ? 'WhatsApp me when you arrive: +' + wa : null
      ])
    });

    /* ---------- ⑤ 60 秒讲解稿 ---------- */
    var talkH = hs.map(function (h, i) {
      // 讲解稿是念出来的：卖点名称里的「+」念成「加 / and」
      return zh ? ['第一', '第二', '第三'][i] + '，' + h.room + '：' + plusZh(h.feat) + '。' + h.why
        : ['First', 'Second', 'Third'][i] + ', ' + theRoom(h) + ': ' + plusEn(lower1(h.feat)) + '. ' + h.why;
    });
    var nAns = need && need.answer ? (zh ? need.answer : plusEn(need.customAns ? lowerSafe(need.answer) : lower1(need.answer))) : '';
    /** 用他们自己的话收：原话加引号；勾选项转述 */
    function closeLine() {
      if (!need) return null;
      var pg = need.page;
      if (zh) {
        var who = need.quote ? '你们说过「' + need.quote + '」' : need.told ? '你们提到' + need.told : need.plain ? '你们提到：' + need.plain : '';
        if (!who) return '第 ' + pg + ' 页，就是你们说过的' + roomRef(p, need.room, 'zh') + '。';
        return who + (need.answer ? '，所以方案里是：' + end(need.answer, true) : pg && need.answered ? '，第 ' + pg + ' 页就是为这个做的。' : '，这一点我们见面一起看。');
      }
      var whoEn = need.quote ? 'You told us “' + need.quote + '”' : need.told ? 'You mentioned ' + need.told : need.plain ? 'You mentioned: ' + lower1(need.plain) : '';
      if (!whoEn) return need.answered ? cap1(roomRef(p, need.room, 'en')) + ' you told us about is on page ' + pg + '.'
        : 'About ' + roomRef(p, need.room, 'en') + ' you mentioned: let’s look at that together.';
      // 一律「. So in the plan: …」：销售写的做法有句子也有名词短语，「, so」接名词短语会变成没有动词的半句
      return whoEn + (nAns ? '. So in the plan: ' + end(nAns, false) : pg && need.answered ? ', and page ' + pg + ' is planned around that.' : '. Let’s look at that together.');
    }
    // 5–15 秒那一句：几个空间（每个一页）+ 溪岸的五个原创系列 —— 介绍溪岸，不说方案「走」哪一个系列
    var nRooms = p.rooms.length, needsNo = MB.pageNoOf(p, 'needs');
    var roomsZh = nRooms ? (whole ? '整个家一共 ' : '这一份是 ') + nRooms + ' 个空间，每个空间一页' + (needsNo ? '，先从你们说的那几件事做起' : '') : '';
    var roomsEn = nRooms ? cap1(numEn(nRooms)) + (nRooms > 1 ? ' spaces' : ' space') + ', one page each' + (needsNo ? ', starting from what you told us' : '') : '';
    var srZh = si.pages.length ? '后面是溪岸的五个原创系列，看看哪一个最像你们' : coNo ? '第 ' + coNo + ' 页是溪岸的五个原创系列' : '';
    var srEn = si.pages.length ? (nRooms ? 'after them, SAIL’s' : 'further on are SAIL’s') + ' five original collections, to see which one feels most like you'
      : coNo ? 'page ' + coNo + ' shows SAIL’s five original collections' : '';
    var oneZh = [roomsZh, srZh].filter(Boolean).join('；');
    var oneEn = [roomsEn, srEn].filter(Boolean).join('; ');
    oneZh = oneZh ? oneZh + '。' : '这一份是为你们新家做的 moodboard。';
    oneEn = oneEn ? cap1(oneEn) + '.' : 'This is the moodboard for your new home.';
    out.push({
      id: 'voice', title: zh ? '⑤ 60 秒讲解稿（语音 / 电话 / 见面）' : '⑤ 60-second talk track (voice note / call)',
      when: zh ? '发完 PDF 补一段语音；或电话、见面时照这个顺序讲。方括号里是给你的提示，不要照念。' : 'As a voice note after the PDF, or on a call. The bracketed lines are cues for you — don’t read them out.',
      principles: [P.halo, P.s1first, P.words, P.peakend],
      noWa: true,
      text: zh ? lines([
        '【0–5 秒 · 先叫名字】',
        (names ? names + '，' : '') + (hostName ? '我是 ' + hostName + '。' : '这里是溪岸。') + '方案发给你们了，' + (hostName ? '我' : '我们') + '用一分钟讲重点。',
        '',
        '【5–15 秒 · 一句话说完这一份】',
        oneZh,
        '',
        '【15–45 秒 · ' + (['', '一个', '两个', '三个'][hs.length] || '') + '重点，' + (hs.length > 1 ? '每个都' : '') + '连回你们的生活】',
        talkH.length ? talkH.join('\n') : '（先在「空间」勾选卖点）',
        need ? '' : null,
        need ? '【45–55 秒 · 用他们自己的话收】' : null,
        closeLine(),
        '',
        '【最后 5 秒 · 结尾给下一步，不讲价格】',
        '有些东西照片给不了。我们在展厅把' + (/^[A-Za-z0-9]/.test(prepShort[0] || '') ? ' ' : '') + prepShort[0] + '准备好了，' + (held && upcoming ? '先帮你们留了 ' + slot1 + '，可以吗？' : '你们挑个时间来看看？')
      ]) : lines([
        '[0–5 s · Say their names first]',
        (names ? names + ', it’s ' : 'Hi, it’s ') + (hostName ? hostName + '. I’ve' : 'SAIL. We’ve') + ' sent your proposal, and here’s the one-minute version.',
        '',
        '[5–15 s · The whole proposal in one sentence]',
        oneEn,
        '',
        '[15–45 s · ' + (['', 'One highlight', 'Two highlights', 'Three highlights'][hs.length] || 'Highlights') + (hs.length > 1 ? ', each' : ',') + ' tied to how you live]',
        talkH.length ? talkH.join('\n') : '(Tick features under Rooms first.)',
        need ? '' : null,
        need ? '[45–55 s · Close with their own words]' : null,
        closeLine(),
        '',
        '[Last 5 s · End on the next step, not the price]',
        'Some things photos can’t show. We’ve prepared ' + prep0 + ' at the showroom. ' + (held && upcoming ? 'We’ve held ' + slot1 + ' for you. Does that work?' : 'Which day suits you?')
      ])
    });

    /* ---------- ⑥ AI 润色提示词 ---------- */
    // 楼盘名可能带单位号（B-12-3），和客户名、链接一样留成占位，不贴给第三方 AI
    var area = (p.property.area || '').trim();
    // 他们自己打的字才算「说过」；勾选项另列，免得 AI 把选项当成原话加引号
    var own = [], ticked = [];
    p.needs.forEach(function (n) {
      var v = needView(p, n, 'zh');
      if (!v) return;
      if (v.quote) own.push('「' + v.quote + '」');
      else if (v.told || v.plain) ticked.push(v.told || v.plain);
    });
    // 我们对每一条的做法（只能用这些）：只给需求不给做法，AI 会替没有做法的需求编一个做法、编一个页码
    var ours = p.needs.map(function (n) {
      var v = needView(p, n, 'zh');
      if (!v || !(v.quote || v.told || v.plain)) return null;
      var any = strip(MB.t(MB.needAnswer(n, p), 'zh'));
      return (v.quote ? '「' + v.quote + '」' : v.told || v.plain) + ' → ' +
        (roomMissing(p, n) ? '这次方案没有那个空间，见面再谈'
          : any ? (v.page ? '第 ' + v.page + ' 页：' : '') + any : '还没有做法，见面一起想');
    }).filter(Boolean);
    // 原创系列：方案介绍溪岸全部五个系列（让 AI 不要写成「我们替你们选了 X 系列」）
    var srHow = [si.overview ? '一页总览' : '', si.pages.length ? '每个系列一页' : ''].filter(Boolean).join(' + ');
    var facts = [
      '客户：{客户称呼}',
      '楼盘：{楼盘}' + (area ? '（' + area + '）' : '') + (p.property.type ? '，' + p.property.type : ''),
      '方案里介绍的溪岸原创系列：' + (srHow ? seriesNames('zh') + '（' + srHow + '；是让客户认识溪岸的系列，不是替他们定了其中一个）' : '（这次没放）'),
      '他们说过（原话）：' + (own.join('、') || '（无）'),
      '需求卡勾选：' + (ticked.join('、') || '（无）'),
      '我们的做法（只能用这些）：' + (ours.length ? '\n  · ' + ours.join('\n  · ') : '（无）'),
      '重点空间与卖点：' + (hs.map(function (h) { return h.room + '·' + h.feat + '（第 ' + h.page + ' 页）'; }).join('；') || '（无）'),
      '展厅为他们准备：' + prep.join('；'),
      (held || !slot1 ? '保留时段：' : '建议时段（还没确认保留）：') + (slot1 || '（未定）') + (slot2 ? '；备选 ' + slot2 : '') + '；约 ' + mins + ' 分钟',
      '邀请函链接：{邀请函链接}',
      '销售：' + (hostName || '（未填）')
    ];
    out.push({
      id: 'ai', title: zh ? '⑥ AI 润色提示词（贴进 ChatGPT / Gemini / Claude）' : '⑥ AI polish prompt (paste into ChatGPT / Gemini / Claude)',
      when: zh ? '想多几个版本、或换个口吻时用。把整段复制给 AI。客户的真名、楼盘与链接故意留成 {占位}，不贴给第三方 AI —— 拿到结果后自己换回。'
        : 'When you want more variations. Paste the whole block into an AI chat. The client’s name, property and link are left as {placeholders} on purpose — put them back yourself.',
      principles: [P.ease, P.loss, P.deflt, P.peakend],
      noWa: true,
      text: lines([
        '你是马来西亚全屋定制品牌「溪岸 SAIL by Riccione Reka」的资深销售设计师。',
        '请根据下面的方案资料，写 3 个不同口吻的 WhatsApp 讯息（用' + (zh ? '中文' : '英文') + '），目的：让客户看完 moodboard 之后，愿意约时间到 Setia Alam 展厅。',
        '',
        '写法规则：',
        '1. 第一行就叫客户名字、讲「他们的家」（System 1 会先注意跟自己有关的事）',
        p.needs.length ? '2. 只讲 3 个重点，每个都连回他们说过的话；只有「他们说过（原话）」能加引号，需求卡勾选的用转述（「你们提到…」）（认知放松 + 所见即全部）'
          : '2. 最多 3 个重点，连回他们的生活；不要编造客户说过的话（认知放松 + 所见即全部）',
        '3. 用「避免麻烦 / 避免损失」的说法，不要堆功能（损失厌恶）',
        held ? '4. 直接给已保留的时段' + (slot2 ? ' + 备选，编号 1、2，请对方回 1 或 2' : '，请对方回「好」确认') + '（默认选项 + 最省力法则）'
          : slot1 ? '4. 给建议的时段' + (slot2 ? '（编号 1、2，请对方回 1 或 2）' : '') + '；还没确认保留，不要说「已保留」（最省力法则）'
          : '4. 问对方哪个时段方便；不要自己编时间，也不要说已经保留（最省力法则）',
        '5. 结尾是下一步，不是价格、不是公司介绍（峰终定律）',
        '6. 不要编造任何数字、折扣或期限；不要用「限时」「最后机会」这类施压字眼',
        '7. 每则不超过 ' + (zh ? '120 字' : '90 words') + '；口吻像人，不像广告；最多 1 个 emoji',
        '8. 保留 {客户称呼}、{楼盘}、{邀请函链接} 这几个占位，不要自己编名字、楼盘或网址',
        '9. 用看得见、摸得到的细节（抽屉拉出来的分量、柜门关上的那一声），不要用「温馨、高端、奢华、完美」这类空泛的形容词',
        '10. 要问时间就用「不」来回答的问句，例：「这周六过来，会不会太赶？」，不要问「方便吗？」',
        '11. 只能用「我们的做法」里写的做法和页码；还没有做法的，就说「见面一起想」，不要替我们编做法',
        '',
        '方案资料：',
        facts.map(function (f) { return '- ' + f; }).join('\n')
      ])
    });

    return out;
  };

  /* ============================================================
     方案页上的字：案例那一句 · 每页讲稿
     ============================================================ */

  /** 前面有几个同空间、也只能说「同样是厨房」的案例（三张不要读起来一样：「同样是厨房」「另一个厨房」「第三个厨房」）：
      0 = 第一个；im.ref 不在 p.cases 里也回 0。销售自己写了那一句、或图库有说明的（卡片印的是别句）不算。
      不看系列：方案不「走」哪一个系列，另一个系列的厨房也是另一个厨房 */
  function caseTwin(p, im, key, L) {
    if (!im || !im.ref || !MB.caseRefs) return 0;
    var res = MB.makeResolver && MB.makeResolver.last;
    var list = MB.caseRefs(p, res), twin = 0;
    for (var i = 0; i < list.length && list[i].ref !== im.ref; i++) {
      var c = list[i], b = res ? res(c.ref) : null;
      if (!b || (c.note != null && String(c.note).trim())) continue;
      var rooms = b.rooms || (b.tag ? [b.tag] : []);
      var own = String(c.ref).indexOf('u:') === 0;
      if (rooms.indexOf(key) > -1 && !caseWhat({ zh: b.zh || '', en: b.en || '', own: own, label: own ? b.label || '' : b.zh || '' }, L)) twin++;
    }
    return i < list.length ? twin : 0;
  }

  /**
   * 「参考空间」每个案例一句（≤ 20 字 / 12 words）。
   * 现在的案例是溪岸的空间照（品牌手册 / 图库），不是「像你们这样的家」：只说我们真的知道的 ——
   * 这张拍的是什么、同样是厨房。案例库以后有区域、房型、特点（im.area / ptype / traits）才说「也在 Setia Alam」「也有长辈同住」。
   * 不拿系列跟他们的方案连在一起：方案不替客户选系列（卡片标签已经印了这张是哪个系列）。
   * 不叫他们「对照、比较」（标题要他们想象自己的家，不是比哪个好）。
   */
  MB.caseNote = function (p, im, L) {
    if (!p || !im) return '';
    var zh = L === 'zh';
    L = zh ? 'zh' : 'en';
    var room = null, key = '';
    (im.rooms || []).some(function (k) {
      for (var i = 0; i < p.rooms.length; i++) if (p.rooms[i].key === k) { room = p.rooms[i]; key = k; return true; }
      return false;
    });
    var page = room ? MB.roomPageNo(p, room) : 0;

    // 案例库的项目资料（之后才有）：同区、同房型、同样有长辈 / 小孩 / 宠物
    var facts = [];
    var area = String(im.area || '').trim(), myArea = String(p.property.area || '').trim();
    if (area && myArea && area.toLowerCase() === myArea.toLowerCase()) facts.push(zh ? '同在 ' + area : 'Also in ' + area);
    if (im.ptype && p.property.type) {
      // 案例库的房型是 key（terrace、semid…）：跟客户同一种就说那一种（「也是排屋」），否则只分公寓 / 有地
      var pk = MB.ptypeKey ? MB.ptypeKey(p.property.type) : '';
      var pt = pk && pk === im.ptype && pk !== 'landed' && pk !== 'condo' ? (MB.CASE_PTYPES || []).filter(function (t) { return t.key === pk; })[0] : null;
      var PT_EN = { terrace: 'a terrace house', semid: 'a semi-D', bungalow: 'a bungalow' };
      // 两边都要认得出来才说：客户是「商用」「店屋」这类认不出的（pk = ''），什么都不说 —— 不能说成「也是有地住宅」
      var LANDED = { landed: 1, terrace: 1, semid: 1, bungalow: 1 };
      if (pt) facts.push(zh ? '也是' + pt.zh : 'also ' + (PT_EN[pk] || 'a ' + pt.en.toLowerCase()));
      else if (pk === 'condo' && im.ptype === 'condo') facts.push(zh ? '也是公寓' : 'also a condo');
      else if (LANDED[pk] && LANDED[im.ptype]) facts.push(zh ? '也是有地住宅' : 'also a landed home');
    }
    var TRAIT = { elderly: [/长辈|elder|parent/i, '也有长辈同住', 'parents at home too'], kids: [/孩子|小孩|kid|child/i, '也有小孩', 'kids at home too'],
      pets: [/宠物|pet/i, '也养宠物', 'pets too'], helper: [/帮佣|helper|maid/i, '也有帮佣', 'a helper too'] };
    (Array.isArray(im.traits) ? im.traits : []).forEach(function (t) {
      p.needs.forEach(function (n) {
        var x = TRAIT[n.key];
        if (x && x[0].test(String(t)) && facts.length < 3) {
          var s = zh ? x[1] : x[2];
          if (facts.indexOf(s) < 0) facts.push(s);
        }
      });
    });
    if (facts.length) {
      var f = zh ? facts.join('，') : listJoin(facts, 'en');
      return zh ? f : cap1(f) + '.';
    }

    var kind = roomKind(key, L);
    // 这张图拍的是什么（图库自己的说明，去掉卡片标签已经印的系列名之后还有内容才算）：真的、具体
    var what = caseWhat(im, L);
    if (what) return zh ? what : cap1(what) + '.';
    // 图库的说明只有系列 + 空间名：他们家也有这个空间就说「同样是厨房」；第二个、第三个说「另一个厨房」「第三个厨房」
    if (page) {
      var twin = caseTwin(p, im, key, L);
      if (!twin) return zh ? '同样是' + kind : 'Also ' + (/^[aeiou]/.test(kind) ? 'an ' : 'a ') + kind + '.';
      var nth = zh ? ['', '另一个', '第三个'][twin] || '再一个' : ['', 'Another', 'A third'][twin] || 'One more';
      return zh ? nth + kind : nth + ' ' + kind + '.';
    }
    return zh ? '溪岸的空间' : 'A SAIL space.';
  };

  /* 案例图自己的说明：去掉开头的系列名（卡片标签已经印了）；剩下的只是空间名、「系列」「全景」这类字，就当没有说明。
     内置图华文、英文都有说明：两种都有内容才用 —— 双语页上华文一行、英文一行要讲同一件事 */
  var CASE_FILLER_EN = /\b(?:and|with|wide|detail|collection|lounge|corridor|room|rooms)\b|[&,·]/gi;
  var CASE_FILLER_ZH = /[与和、，·]|系列|全景|细节|起居|走廊|卧室/g;
  function caseWhatOne(s, zh) {
    s = String(s || '').trim();
    if (!s || CJK.test(s) !== zh) return '';
    // 系列名只拿掉开头的（「雾山客厅」「Skeleton Line kitchen」）：「织」只有一个字，「藤织柜门」里的不是系列名
    var names = (MB.SERIES || []).map(function (s) { return zh ? s.zh : s.en; }).concat(zh ? ['自然线'] : ['Natural Line']);
    var again = true;
    while (again) {
      again = false;
      names.forEach(function (n) {
        if (n && s.toLowerCase().indexOf(n.toLowerCase()) === 0) { s = s.slice(n.length).replace(/^[\s,，、·&-]+/, ''); again = true; }
      });
    }
    s = s.replace(/\s+/g, ' ').replace(/[\s,，、·&-]+$/g, '').trim();
    if (!s) return '';
    // 只剩空间名：没有比卡片标签多说什么
    var rest = s.toLowerCase();
    MB.ROOMS.forEach(function (r) {
      [zh ? r.zh : r.en.toLowerCase()].concat(zh ? [] : [r.en.toLowerCase().split(' ')[0]]).forEach(function (w) {
        if (w) rest = rest.split(w).join(' ');
      });
    });
    rest = rest.replace(zh ? CASE_FILLER_ZH : CASE_FILLER_EN, ' ').replace(/[\s’'-]+/g, '');
    return rest ? s : '';
  }
  function caseWhat(im, L) {
    var zh = L === 'zh';
    if (im.zh && im.en) {
      var z = caseWhatOne(im.zh, true), e = caseWhatOne(im.en, false);
      return z && e ? (zh ? z : e) : '';
    }
    return caseWhatOne((zh ? im.zh : im.en) || (im.own ? im.label : ''), zh);
  }

  /** 「你们说的」页印了哪几条：跟方案页同一份（model.js 的 MB.printedNeeds：原话空的不印、最多 3 条）；
      没有就照旧版面：前 3 条 */
  function needsShown(p) {
    var fn = MB.printedNeeds || MB.needsShown;
    if (typeof fn === 'function') { try { return fn(p) || []; } catch (e) { /* 用下面的 */ } }
    return p.needs.slice(0, 3);
  }
  MB.needsShownOr = needsShown;   // check.js 用同一份

  /**
   * 每一页的讲稿（PPTX 备注 · 展厅或电话里边翻边讲）：2–4 句，从 60 秒讲解稿拆开。
   * 页面上为了少字没印的东西（卖点的 why、多勾的卖点、没印的需求、系列的补充与引文、订单周期与售后的细节、奖项全名）都在这里。
   * 要念得出来：句中不用大写、不用「 · 」。括号里是给销售的提示，不要念出来。
   * @param {{type:string, room?:object, series?:string}} pg  MB.pageList 的一项
   * @param {'zh'|'en'|'bi'} L
   */
  MB.pageNotes = function (p, pg, L) {
    if (!p || !pg) return '';
    if (L === 'bi') return [MB.pageNotes(p, pg, 'zh'), MB.pageNotes(p, pg, 'en')].join('\n\n');
    var zh = L === 'zh';
    L = zh ? 'zh' : 'en';
    var B = MB.BRAND || {};
    var names = namesFor(p, zh);   // 华文讲稿跟方案页同一个称呼（Wong 先生、太太）
    var prop = propSpoken(p, L);
    // 没填业务名：讲稿里说「我们」，不说「我」（跟开场短话那页的讲稿一样）
    var me = String(p.host.name || '').trim() ? { zh: '我', en: 'me', I: 'I’ll', my: 'I’m your' } : { zh: '我们', en: 'us', I: 'we’ll', my: 'we’re your' };
    var no = pg.room ? MB.roomPageNo(p, pg.room) : MB.pageNoOf(p, pg.type, pg.series);
    var out = [];
    function say(zhS, enS) { var s = zh ? zhS : enS; if (s) out.push(s); }
    function T(o) { return strip(MB.t(o, L)); }
    var day1 = MB.parseISO(p.visit.date), today = new Date();
    today.setHours(0, 0, 0, 0);
    var hold = !!day1 && day1 >= today && !p.visit.auto;   // 自动建议、还没确认的时段不说「留了」
    // 念出来：「Saturday, 7 November at 2:00 pm」（页面上的「 · 」不好念）
    var slot1 = MB.slotLabel(p.visit.date, p.visit.time, L).replace(/\s*·\s*/g, ' at ');
    var slot2 = hold ? MB.slotLabel(p.visit.date2, p.visit.time2, L).replace(/\s*·\s*/g, ' at ') : '';
    /** 需求念出来：原话加引号；勾选项转述。
        华文讲稿一句里不夹英文：客户用英文写的原话不引，改说「你们说过的厨房」（没对到空间就说「你们写的那一条」） */
    function needSaid(v) {
      if (!v) return '';
      if (v.quote && (!zh || CJK.test(v.quote))) return zh ? '「' + v.quote + '」' : '“' + v.quote + '”';
      if (v.told) return zh ? '你们提到' + v.told : 'you mentioned ' + v.told;
      if (v.plain) return zh ? '你们提到：' + v.plain : 'you mentioned: ' + lower1(v.plain);
      if (v.custom && v.room) return zh ? '你们说过的' + roomRef(p, v.room, 'zh') : 'what you told us about ' + roomRef(p, v.room, 'en');
      if (zh && v.quote) return '你们写的那一条';
      return '';
    }
    /** 做法是用英文写的（华文讲稿念不了）：这条需求有默认的华文做法就用它；没有回空串（只指页码） */
    function zhAnswerOf(n) {
      var dk = MB.needDef(p, n && n.key);
      var a = dk ? strip(MB.t(dk.answer, 'zh')) : '';
      return CJK.test(a) ? a : '';
    }

    switch (pg.type) {
      case 'cover':
        say((names ? names + '，' : '') + '这是为' + (prop ? ' ' + prop + ' ' : '你们新家') + '做的 moodboard，一共 ' + MB.pageList(p).length + ' 页。',
          (names ? names + ', this' : 'This') + ' is the moodboard for ' + (prop || 'your new home') + ', ' + MB.pageList(p).length + ' pages in all.');
        say('先看整体的感觉，细节' + me.zh + '一页一页讲。', 'Take in the overall feel first; ' + me.I + ' go through the details page by page.');
        say('看的时候，哪一页最像你们想要的家，记一下页码就好。', 'As you go, note the page that feels most like the home you want.');
        break;

      case 'letter':
        var n = letterNeed(p, L);
        var I = String(p.host.name || '').trim() ? { zh: '我', en: 'I' } : { zh: '我们', en: 'we' };
        say('第 ' + no + ' 页是' + I.zh + '写给你们的几句话。（让他们自己读完，不用念出来。）',
          'Page ' + no + ' is a short note ' + I.en + ' wrote for you. (Let them read it themselves; don’t read it aloud.)');
        // 华文讲稿不引英文原话（一句里不夹两种语言）：改问那个空间那一页
        var nq = n && n.quote && (!zh || CJK.test(n.quote)) ? firstClause(n.quote, L, zh ? 20 : 12) : '';
        if (nq) say('读完问一句：「你们说『' + nq + '』，我理解得对吗？」', 'Then ask: “You said ‘' + nq + '’. Have I got that right?”');
        else if (n && (n.told || n.plain)) say('读完问一句：「你们' + (n.told || '提到' + n.plain) + '，我理解得对吗？」', 'Then ask: “You mentioned ' + (n.told || lower1(n.plain)) + '. Have I got that right?”');
        else if (n && n.room) say('读完问一句：「' + roomRef(p, n.room, 'zh') + '这一页，是你们想要的吗？」', 'Then ask: “Is ' + roomRef(p, n.room, 'en') + ' on page ' + n.page + ' what you had in mind?”');
        else say('读完问一句：「这几句，有说到你们最在意的地方吗？」', 'Then ask: “Does that cover what matters most to you?”');
        break;

      case 'needs':
        say('左边是你们说过的话，右边是我们的做法和页码。', 'On the left is what you told us; on the right, what we did about it, with the page.');
        var shown = needsShown(p);
        var said = shown.map(function (x) {
          var v = needView(p, x, L), who = needSaid(v);
          if (!who) return '';
          // 对应的空间不在方案里：不念做法（方案里没有），老实说要不要加
          if (roomMissing(p, x)) {
            var dk = MB.needDef(p, x.key), kind = roomKind(x.room || (dk && dk.room), L);
            return zh ? who + '，这次方案没有' + (kind || '那个空间') + '，见面一起看要不要加。'
              : cap1(who) + '. ' + cap1(kind ? 'the ' + kind : 'that space') + ' isn’t in this proposal yet; let’s talk about adding it.';
          }
          // 英文讲稿引不了华文原话（「what you told us about the kitchen」）：用冒号接，不留一个没有动词的半句
          var only = !(v.quote || v.told || v.plain);
          // 华文讲稿、做法是英文写的：用这条需求默认的华文做法；没有的话只说第几页是照这一点做的（不念英文）
          var za = zh && !v.answer && v.answered ? zhAnswerOf(x) : '';
          if (za) return who + (v.page ? '，在第 ' + v.page + ' 页：' : '：') + end(za, true);
          var rz = zh && v.room ? roomRef(p, v.room, 'zh') : '';
          // 有做法、但是另一种语言写的、又没有对应的空间页：页上右边印着做法 —— 指过去，不说「见面一起想」
          if (!v.answer && v.answered && !v.page) return zh ? who + '，我们的做法就写在这一页右边。'
            : cap1(who) + (only ? ': our answer is on the right of this page.' : '. Our answer is on the right of this page.');
          if (!v.answer) return zh ? who + (v.answered && v.page ? '，第 ' + v.page + ' 页' + (rz && who !== '你们说过的' + rz ? '的' + rz : '') + '就是照这一点做的。' : /一条$/.test(who) ? '，我们见面一起想。' : '，这一条我们见面一起想。')
            : cap1(who) + (v.answered && v.page ? (only ? ' is on page ' : ', on page ') + v.page + '.' : (only ? ': we’ll work this one out together.' : '. We’ll work this one out together.'));
          var a = plusEn(v.customAns ? lowerSafe(v.answer) : lower1(v.answer));
          return zh ? who + (v.page ? '，在第 ' + v.page + ' 页：' : '：') + end(v.answer, true)
            : cap1(who) + (v.page ? '. Page ' + v.page + ': ' : '. Our answer: ') + end(a, false);
        }).filter(Boolean);
        if (said.length) out.push(said.join(zh ? '' : ' '));
        // 页面只印前几条：其余的在这里讲（体检的提醒说「讲稿里有」）
        var rest = p.needs.filter(function (x) { return shown.indexOf(x) < 0; }).map(function (x) {
          var v = needView(p, x, L);
          return v && (v.told || v.plain) ? (zh ? v.told || v.plain : v.told || lower1(v.plain)) : needSaid(v);
        }).filter(Boolean);
        if (rest.length) say('页上没印的还有：' + rest.join('、') + '，也可以顺便聊。', 'Not on the page, but worth raising: ' + listJoin(rest, 'en') + '.');
        say('有没有哪一条，我们理解错了？（停一下，等他们说「对」。）', 'Is there anything we’ve got wrong? (Pause; let them say “that’s right”.)');
        break;

      case 'collections':
        // 原创系列（五个一页）：介绍溪岸全部五个系列，让他们自己挑 —— 不替他们选、不说方案「走」哪一个。
        // 字照官方文案（MB.SERIES 的名字、SERIES_CONCEPT 的 family）；这一页讲的是溪岸：不念客户的名字、楼盘
        var co = typeof MB.collectionsBlocks === 'function' ? MB.collectionsBlocks(p, L) : null;
        if (!co || !co.cols.length) break;
        var coNames = co.cols.map(function (c) { return c.name[L]; });
        var coN = co.cols.length === 5 ? (zh ? '五' : 'five') : zh ? ' ' + co.cols.length + ' ' : numEn(co.cols.length);
        say('第 ' + no + ' 页是溪岸的' + coN + '个原创系列：' + coNames.join('、') + '。',
          'Page ' + no + ' shows SAIL’s ' + coN + ' original collections: ' + listJoin(coNames, 'en') + '.');
        // 系列家族：「骨骼线、空山、织属于自然线系列；侘寂东方属于实木系列」（念出来不用「 · 」：拿掉「溪岸 · 」「SAIL · 」）
        var fl = co.fams.map(function (f) {
          var ns = coNames.slice(f.from, f.to + 1);
          var fz = String(f.family.zh || '').replace(/^溪岸\s*·\s*/, ''), fe = String(f.family.en || '').replace(/^SAIL\s*·\s*/, '');
          return zh ? (fz ? ns.join('、') + '属于' + fz : '') : (fe ? listJoin(ns, 'en') + (ns.length > 1 ? ' are' : ' is') + ' from the ' + fe + ' series' : '');
        }).filter(Boolean);
        if (fl.length) say(fl.join('；') + '。', fl.join('; ') + '.');
        // 后面每个系列各有一页：指出页码（系列页关了就不说）
        var srPages = seriesInfo(p).pages;
        if (srPages.length) {
          var srA = srPages[0], srB = srPages[srPages.length - 1];
          say((p.rooms.length ? '空间之后' : '后面') + '，每个系列各有一页细讲（第 ' + (srA === srB ? srA : srA + '–' + srB) + ' 页）。',
            (p.rooms.length ? 'After the rooms' : 'Further on') + ', each one has its own page (' + (srA === srB ? 'page ' + srA : 'pages ' + srA + '–' + srB) + ').');
        }
        say('哪一个最像你们想要的家？（停一下，让他们自己挑；不用替他们选。）', 'Which one feels most like the home you want? (Pause; let them pick. Don’t pick for them.)');
        break;

      case 'series':
        // 五个系列各一页：照 MB.SERIES_CONCEPT 念（溪岸的官方文案，不另外编、不删句子）；
        // 页上没印的补充、雾山的佩索阿引文都在这里。这一页讲的是溪岸：不念客户的名字、楼盘，也不说方案「走」这个系列
        var sc = typeof MB.seriesBlocks === 'function' ? MB.seriesBlocks(p, L, pg.series) : null;
        if (!sc) break;
        // 念出来不用「 · 」：「溪岸 · 自然线系列」→「自然线系列」、「SAIL · Natural Line」→「the Natural Line series」
        var famZh = sc.ownFamily ? String(sc.family.zh || '').replace(/^溪岸\s*·\s*/, '') : '';
        var famEn = sc.ownFamily ? String(sc.family.en || '').replace(/^SAIL\s*·\s*/, '') : '';
        say('第 ' + no + ' 页是溪岸的「' + sc.name.zh + '」' + (famZh ? '，属于' + famZh : '') + '。',
          'Page ' + no + ' is SAIL’s ' + sc.name.en + (famEn ? ', from the ' + famEn + ' series' : '') + '.');
        say('它的设计理念：' + end(sc.title.zh, true), 'The idea behind it: ' + end(lower1(strip(sc.title.en)), false));
        say(end(sc.body.zh, true), end(sc.body.en, false));
        if (sc.noteAll) say(end(sc.noteAll.zh, true), end(sc.noteAll.en, false));
        if (sc.quote) say('（可以念给他们听：）' + end(sc.quote.zh, true), '(You can read them this line:) ' + end(sc.quote.en, false));
        say('这样的感觉，是你们想要的吗？（停一下，听他们怎么说。）', 'Does that sound like the home you want? (Pause; let them answer.)');
        break;

      case 'plan':
        var rl = p.rooms.map(function (r, i) {
          return zh ? (i + 1) + ' 号是' + roomRef(p, r, 'zh') : roomRef(p, r, 'en') + ' is number ' + (i + 1);
        });
        say('平面图上的编号，对应后面每个空间的页码。', 'Each number on the plan matches a page that follows.');
        if (rl.length) say('这次一共 ' + rl.length + ' 个空间：' + rl.join('，') + '。', 'There are ' + numEn(rl.length) + ' spaces: ' + listJoin(rl, 'en') + '.');
        var notIn = strip((p.extra || {}).notIncluded);
        if (notIn) say('这次没包含：' + notIn + '，想加进来跟我说。', 'Not in this proposal: ' + notIn + '. Just say if you’d like them in.');
        say('位置不对的话，现在就可以在图上改。', 'If anything is in the wrong place, we can mark it on the plan now.');
        break;

      case 'chapter':
        // 不是每一间都有「为你们」那一句：有的才说
        var noted = p.rooms.filter(function (r) { return !!MB.roomNote(p, r); }).length;
        say('接下来，一个空间一个空间看。', 'Now, room by room.');
        say(noted ? '每一页一张主图；跟你们说过的话有关的，旁边写着「为你们」。' : '每一页一张主图，加上最要紧的几个做法。',
          noted ? 'Each page has one main photo; where it answers something you told us, it says so.' : 'Each page has one main photo and the few things that matter most.');
        break;

      case 'room':
        var r = pg.room, def = r && MB.ROOM[r.key];
        if (!def) break;
        var note = strip(MB.t(MB.roomNote(p, r), L));
        if (note && !sameLang(note, L)) note = '';
        say('第 ' + no + ' 页，' + roomRef(p, r, 'zh') + '：' + (note || strip(def.head.zh)) + '。',
          'Page ' + no + ', ' + roomRef(p, r, 'en', true) + ': ' + (note ? (r.note != null ? lowerSafe(note) : lower1(note)) : lower1(strip(def.head.en))) + '.');
        // 页面只印卖点名称（最多 3 个）—— why 在这里讲；多勾的也在这里说
        var all = MB.roomFeats(p, r), fs = all.slice(0, 3), more = all.slice(3);
        if (fs.length) out.push(fs.map(function (f) {
          return zh ? plusZh(f.zh) + '：' + strip(f.why.zh) : plusEn(f.en) + ': ' + lower1(strip(f.why.en));
        }).join(zh ? '；' : '. ') + (zh ? '。' : '.'));
        if (more.length) say('另外还有：' + more.map(function (f) { return plusZh(f.zh); }).join('、') + '，展厅可以一起看。',
          'We’ve also included ' + listJoin(more.map(function (f) { return plusEn(lower1(f.en)); }), 'en') + '; we can look at them at the showroom.');
        // 到馆那天准备的东西里有这个空间的，就顺便说（互惠：已经为他们准备好了）
        var prepIdx = -1;
        if (def.prep) MB.prepared(p).forEach(function (x, i) { if (x === def.prep && prepIdx < 0) prepIdx = i; });
        if (prepIdx > -1) say('到展厅那天，' + strip(MB.preparedShort(p, prepIdx, 'zh')) + '会为你们准备好。',
          'When you visit, ' + strip(MB.preparedShort(p, prepIdx, 'en')) + ' will be ready for you.');
        break;

      case 'cases':
        // 现在的案例是溪岸的空间照，不是客户的家：不说「像你们」「跟你们很接近」
        say('这几个是溪岸的空间，给你们参考。', 'These are SAIL spaces, for reference.');
        var res = MB.makeResolver.last;
        var cl = (MB.caseRefs ? MB.caseRefs(p, res) : []).map(function (c, i) {
          var t = c.note != null && String(c.note).trim() ? strip(c.note) : '';
          if (t && !sameLang(t, L)) t = '';
          if (!t && res) {
            var b = res(c.ref);
            // 跟方案页（deck.js 的 caseImage）同一个形状：带上图库自己的说明，讲稿念的跟卡片印的是同一句
            if (b) t = strip(MB.caseNote(p, { ref: c.ref, series: b.series || '', rooms: b.rooms || (b.tag ? [b.tag] : []), own: c.ref.indexOf('u:') === 0,
              label: c.ref.indexOf('u:') === 0 ? b.label || '' : b.zh || '', en: b.en || '', zh: b.zh || '', area: b.area, ptype: b.ptype, traits: b.traits }, L));
          }
          return t ? (zh ? '第 ' + (i + 1) + ' 张：' + t + '。' : 'Photo ' + (i + 1) + ': ' + lower1(t) + '.') : '';
        }).filter(Boolean);
        if (cl.length) out.push(cl.join(zh ? '' : ' '));
        say('想看哪一张的更多照片，跟我说。', 'If you’d like to see more like any of these, just ask.');
        break;

      case 'practical':
        var cons = (MB.CONCERNS || []).filter(function (c) { return c && c.worry && c.answer && (!c.needs || String((p.extra || {})[c.needs] || '').trim()); }).slice(0, 3);
        if (cons.length) {
          say('你们可能会担心几件事。（先把顾虑说出来，再一条一条答。）', 'You might be wondering about a few things. (Name each worry first, then answer it.)');
          out.push(cons.map(function (c) {
            return zh ? '「' + String(c.worry.zh).trim() + '」' + end(c.answer.zh, true) : '“' + String(c.worry.en).trim() + '” ' + end(c.answer.en, false);
          }).join(zh ? '' : ' '));
        }
        var lead = (B.lead || []).map(function (x) { return zh ? T(x.series) + ' ' + x.days + ' 天' : x.days + ' days for the ' + T(x.series).toLowerCase(); });
        if (lead.length) say('订单周期：' + lead.join('，') + '。', 'Lead times: ' + listJoin(lead, 'en') + '.');
        // 顾虑那几句已经讲过的，后面不再念一次（「装好以后找谁」讲了每年上门 → 售后只念质保；「预算」讲了量尺后报价 → 预算只念数字）
        var saidAfter = cons.some(function (c) { return c.key === 'after'; });
        var saidBudget = cons.some(function (c) { return c.key === 'budget'; });
        var care = ((B.aftercare || {}).rows || []).filter(function (x) {
          return !saidAfter || /warranty/i.test(String((x.label || {}).en || ''));
        }).map(function (x) {
          var v = T(x.value), k = T(x.label);
          // 华文「入住前 上门调试一次」；英文「one on-site adjustment visit before move-in」「lifetime hardware warranty」
          return zh ? k + (/^\d/.test(v) ? ' ' : '') + v : lower1(v).replace(/^(\d+) (years?)$/, '$1-year') + ' ' + k.toLowerCase();
        });
        if (care.length) say('售后：' + care.join('；') + '。', 'Aftercare: ' + listJoin(care, 'en') + '.');
        var bud = strip(String((p.extra || {}).budget || '').split(/\n/)[0]);
        if (bud && CJK.test(bud) && !zh) bud = '';
        if (bud) say('预算：' + bud + (saidBudget ? '。' : '；正式报价在上门量尺之后。'), 'Budget: ' + bud + (saidBudget ? '.' : '; the final quote follows a site measurement.'));
        else if (!saidBudget) say('报价在上门量尺之后，按你们家的实际尺寸算。', 'We quote after measuring on site, based on your home’s actual dimensions.');
        break;

      case 'language':
        if (B.story && B.story.body) say(T(B.story.body) + '。', T(B.story.body) + '.');
        // 奖项按奖名合并年份：「HCA 高定家居设计奖（2022、2023、2024）」；只得过一次的念全名（「金奖」）
        var aw = [], seen = {};
        (B.awards || []).forEach(function (a) {
          var nm = T(a.title).split(/\s*·\s*/)[0];
          if (!seen[nm]) { seen[nm] = []; aw.push(nm); }
          seen[nm].push(a.year);
        });
        function awName(x) {
          if (seen[x].length > 1) return x;
          var one = null;
          (B.awards || []).forEach(function (a) { if (!one && T(a.title).indexOf(x) === 0) one = T(a.title); });
          if (!one) return x;
          var parts = one.split(/\s*·\s*/);
          // 「MUSE Design Awards, USA · Gold」→「Gold at the MUSE Design Awards, USA」；华文直接接起来
          return parts.length < 2 ? one : zh ? parts.join('') : parts.slice(1).join(', ') + ' at the ' + parts[0];
        }
        if (aw.length) say('设计奖项：' + aw.map(function (x) { return awName(x) + '（' + seen[x].join('、') + '）'; }).join('，') + '。',
          'Awards: ' + listJoin(aw.map(function (x) { return awName(x) + ' (' + listJoin(seen[x], 'en') + ')'; }), 'en') + '.');
        var sup = ((B.supply || {}).rows || []).map(function (x) {
          var brands = String(x.brands || '').split(/\s*·\s*/).filter(Boolean);
          return zh ? T(x.label) + ' ' + brands.join('、') : T(x.label).toLowerCase().replace(/\s*&\s*/g, ' and ') + ' from ' + listJoin(brands, 'en');
        });
        if (sup.length) say('供应链：' + sup.join('；') + '。（这一页讲短一点，重点还是他们的家。）',
          'We source ' + sup.join('; ') + '. (Keep this page short; the point is still their home.)');
        break;

      case 'team':
        var rows = (MB.teamRows ? MB.teamRows(p) : []).map(function (m) {
          var role = T(m.role);
          if (!zh && typeof m.role !== 'string') role = role.toLowerCase();   // 我们的职称句中小写；销售自己写的原样
          return zh ? (role ? role + ' ' : '') + m.name : m.name + (role ? ' (' + role + ')' : '');
        });
        if (rows.length) say('这份方案由 ' + rows.join('、') + (rows.length > 1 ? ' 一起做。' : ' 负责。'), 'This proposal was put together by ' + listJoin(rows, 'en') + '.');
        say('有任何问题，先找' + me.zh + '就好。', 'For anything at all, ' + me.my + ' first call.');
        break;

      case 'invite':
        var mins = +p.visit.mins || 60;
        var sug = !hold && slot1 && day1 >= today;   // 自动建议、还没确认的时段：说「建议」
        say(hold && slot1 ? '最后一步：我们先为你们留了 ' + slot1 + (slot2 ? '，备选 ' + slot2 : '') + '，大约 ' + mins + ' 分钟。'
          : sug ? '最后一步：我们建议 ' + slot1 + '，大约 ' + mins + ' 分钟；你们说好，我们就留下来。' : '最后一步：挑一个方便的时段来展厅，大约 ' + mins + ' 分钟。',
          hold && slot1 ? 'Last step: we’ve held ' + slot1 + (slot2 ? ' (or ' + slot2 + ')' : '') + ' for you, about ' + mins + ' minutes.'
          : sug ? 'Last step: we suggest ' + slot1 + ', about ' + mins + ' minutes; say yes and we’ll hold it for you.' : 'Last step: pick a time to visit the showroom, about ' + mins + ' minutes.');
        var prep = MB.prepared(p).map(function (x) {
          var t = strip(MB.t(x, L));
          if (typeof x === 'string') return sameLang(t, L) ? (zh ? t : lowerSafe(t)) : '';
          return zh ? t : lower1(t);
        }).filter(Boolean);
        if (prep.length) say('那天会为你们准备好：' + prep.join('；') + '。', 'On the day, we’ll have ready: ' + prep.join('; ') + '.');
        say((hold || sug) && slot1 ? '这个时间会不会太赶？' : '这个周末或下周过来，会不会太赶？', (hold || sug) && slot1 ? 'Would that time be too soon?' : 'Would this weekend or next be too soon?');
        break;

      case 'back':
        // 已经看完了：不再说「慢慢看」；没填业务名就说「我们」
        say('谢谢你们花时间看完。', 'Thank you for going through it with us.');
        say('回去再想想，哪一页最像你们想要的家，回' + me.zh + '一个页码就好。', 'When you’re ready, just send ' + me.en + ' the number of the page that feels most like your home.');
        break;
    }
    return out.join(zh ? '' : ' ');
  };

  MB.COPY_PRINCIPLES = P;
})();
