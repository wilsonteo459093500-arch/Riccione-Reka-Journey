/* ============================================================
   VISI · 方案 2.0 排版（16:9，每页 1280 × 720 逻辑像素 = 13.333 × 7.5 in）
   ------------------------------------------------------------
   这是一份 moodboard（老板 2026-11-02）：以图为主、资讯少，每页只讲一件事，
   文字约占 30% 以下；细节不印，放进讲稿（copy.js 的 MB.pageNotes → PPTX 备注）。
   品牌设计语言照 HIPPO / Aman 两份 PPT：米色页底、半版出血大图、左上英文大写标签、
   右上 logo、右下品牌签名 + 页码、1px 细线、咖啡棕大号数字；情绪页 = 整页照片 + 一句话。
   页序（model.js 的 MB.pageList）：他们的家在前，品牌只占后面一页 ——
     封面写名字 → 开场短话（业务署名）→ 你们说的 → 一页看懂（拼贴）→ 平面图 →（章节）
     → 逐个空间 → 参考空间 →（工期·保障）→ 品牌一页 →（本案团队）→ 到馆邀约 → 欢迎回家
   图（model.js 的 MB.deckImages）：整份同一张照片只出现一次；情绪页按方案 id 从氛围照池轮换。
   语言（p.lang）：英文大写标签是品牌字体，三种都印；标题与正文 zh 只华文、en 只英文、
   bi 华文在前英文在后。每段字都包成 <span class="l-zh|l-en">，字体字号由 CSS 决定。

   ---------- 版面表（PPTX 照这张做：px ÷ 96 = in；x, y, w, h；区块都是绝对定位） ----------
   每页共用
     logo         1004, 50, 204, 78    右对齐；米色上 MB.BRAND.logo.ink，照片上 .white
     foot          808, 628, 400, 44   右对齐：「07 / 14」+ 页名（大写）│ 品牌签名两行（zh / bi 才有华文那行）
     head           72, 60, 880, ~120  英文大写标签（Outfit 22px，每页同一个大小，字距 .3em，咖啡棕）+ 标题（衬线，依语言）
     栏线：照片 / 文字的分界只有三种 —— 600（文字从 664 起）、640（704）、720（784）
   cover          （没有 foot）
     photo           0, 0, 1120, 720   MB.pageImageSrc(p,'cover') + 遮罩 rgba(28,25,21,.4) + 下半部再暗一点的渐层
     strip        1120, 0, 160, 720    #3A2D24；细线 1200,64,1,250；竖排华文签名 1180,372,40,210；LIVING NATURALLY 1128,628,144,40
     logo           72, 56, 204, 78    white，左对齐
     name           80, 236, 960, 156  以下全部置中；垂直置中；字号依名字长度 66 / 52 / 42 / 33（class sz1–sz4）
     kind           80, 410, 960, 30   一行副题「全屋定制 · Moodboard」/ WHOLE-HOME DESIGN · MOODBOARD（1–2 个空间：CUSTOM CABINETRY · MOODBOARD）
     prop           80, 452, 960, 30   楼盘 · 区域（有客户名才印）
     date           80, 494, 960, 22   一个日期（zh 华文，其余英文）
     by             80, 640, 960, 22
   letter
     photo           0, 0, 600, 720    MB.pageImageSrc(p,'letter')；下半部渐层 0,380,600,340
     ph-kick        56, 584, 488, 88   照片上的白字标签，底部对齐
     salute        664, 132, 544, 72   底部对齐（bi 两行）；长名字 .long / 更长 .longer 缩字；
                                       bi 的华文名字只留华文那行、很长的英文名字只留英文那行
     body          664, 222, 544, 316  .lt-body（会溢出 → .tight / .tighter）
     sign          664, 548, 320, 70   名字 Cormorant 斜体 34px + 职称
   needs（最多 3 条，MB.printedNeeds：原话空的不印）
     head           72, 60, 880, 120
     list           72, 212, 1136, 404 .nd-list；每行四栏：编号 64 · 原话 432 · 做法 480 · 页码 80（间距 20）
   glance（拼贴 moodboard）
     collage         0, 0, 720, 720    MB.glanceImages（2–4 张：风格实景，氛围照最多 1 张）
                       直（预设）：g1 0,0,416,720 · g2 424,0,296,235 · g3 424,243,296,234 · g4 424,485,296,235
                                   3 张 g2 424,0,296,356 · g3 424,364,296,356；2 张 g2 424,0,296,720；1 张 g1 0,0,720,720
                       横（.wide，第一张是横的）：g1 0,0,720,400 · g2 0,408,235,312 · g3 243,408,234,312 · g4 485,408,235,312
                                   3 张 g2 0,408,356,312 · g3 364,408,356,312；2 张 g1 0,0,720,356 · g2 0,364,720,356
     refs           24, 580, ≤284, 116 客户发来的参考图（配色取自参考图时）：每张 88 × 108，米色 5px 边，间距 10
     head          784, 150, 424, 186  标签 + 风格名 + 一句 mood
     palette       784, 352, 424, 130  5 色块（72 × 56，间距 8）+ 名字；取自参考图时多一行说明
     materials     784, 496, 424, 116  3 行：色块 + 名称 + 色号
   plan
     panel           0, 0, 720, 720    #FBF8F3
     plan box       48, 48, 624, 624   平面图等比置中（deck.js 算好 width / height）
     head          784, 156, 424, 110  （bi：top 132）
     side          784, 272, 424, 344  .pl-side（编号清单 + 这次没包含）
   chapter        （p.pages.chapter，预设关）
     photo           0, 0, 1280, 720   MB.pageImageSrc(p,'chapter') + 左暗右亮的暖色渐层
     kicker         80, 292, 700, 24   white
     line           80, 330, 700, 200  white
   room（有图；没有实景的空间 MB.deckImages 会放一张氛围 / 细节照当主图）
     照片区 0,0,720,720，拼法看照片直横（MB.deckImages 的 roomLayout，裁得最少的那一种）：
       l1   hero 0,0,720,720
       l2   hero 0,0,720,472 · sub1 0,480,720,240              （横的辅图）
       l2v  hero 0,0,356,720 · sub1 364,0,356,720              （两张直的）
       l3   hero 0,0,720,472 · sub1 0,480,356,240 · sub2 364,480,356,240
       l3v  hero 0,0,476,720 · sub1 484,0,236,356 · sub2 484,364,236,356
     no            784, 48, 160, 64    大号编号（Outfit 300 56px）
     name          784, 126, 424, 26   h2：英文大写 + 华文（同一行）；长名字缩字（class n1–n3）
     line          784, 172, 424, 128  一句 head；上缘 1px 细线
     txt           784, 316, 424, 300  .rm-txt：卖点名称（≤ 3）+「为 X」一句（贴底）
   room（没图：.pg.rm-noimg）
     no             72, 40, 260, 178   140px
     name           72, 222, 540, 30
     line           72, 272, 560, 240
     txt           704, 272, 504, 344  跟左边那一句的细线对齐
   cases（「SAIL spaces · 参考空间」：溪岸的实拍，不是客户案例）
     head           72, 60, 880, 120
     list           72, 184, 1136, 432 .cs-list；卡片 left = i × (w + 28)
       3 个：w 360；img 0,0,w,340；caption 0,356,w,76（系列 · 空间 + 一行）
       2 个：w 554；同上
       1 个：img 0,0,720,432；caption 760,0,376,432（底部对齐）
   practical      （p.pages.practical，预设关）
     photo           0, 0, 600, 720    MB.pageImageSrc(p,'practical')
     head          664, 60, 324, 130  标题在 logo 左边换行
     body          664, 232, 544, 384  .pr-body：两组大数字（订单周期 0,0,256 · 质保 288,0,256；高 168；
                                       每组两个数字并排，数字下面一行写是什么）
                                       + 一句顾虑回应（从 196 往下排）+ 你们家（有填工期 / 预算才有，一项最多两行，接在后面）
   language（品牌一页）
     photo           0, 0, 640, 720    MB.pageImageSrc(p,'language')
     head          704, 60, 290, 40    标签
     line          704, 196, 504, 180  MB.BRAND.story.title（大号衬线）
     proof         704, 410, 504, 206  奖项（每个奖一行）+ 供应链一行
   team           （p.pages.team，预设关）
     photo           0, 0, 600, 720    MB.pageImageSrc(p,'team')
     head          664, 60, 320, 140
     rows          664, 236, 544, 380  ≤ 6 行：职称 0–200 · 名字 216–544
   invite
     photo           0, 0, 600, 720    MB.pageImageSrc(p,'invite')
     head          664, 60, 324, 130  标题在 logo 左边换行
     flow          664, 214, 544, 402  .iv-flow：一条直的流（flex 直排），三块从上往下排，不叠在一起：
       prep          0, 0, 544, ≥166   标签 + 三样；bi：英文在华文下面一行（小一号）
       row           0, prep + 24, 544 .iv-row（三样没超过 166 → 页面 y = 404）：
         when        0, 0, 384, ~156   上缘 1px 咖啡棕线：标签（真的留了才写「已为你们保留」）+ 日期 / 时间两行 + 备选
                                       + 时长 · 地点（同一个镇区自己一行）
         qr        408, 0, 136, 150    svg 112 × 112 置中（页面 x = 1072）
       host          0, 底, 544, 24    贴底（页面 y = 592）一行：名字 · 电话 · WhatsApp · Waze · Google Maps
                                       放不下 → .tight / .tighter（app.js fitText 量 .iv-flow）
   back           （整页照片；foot 只有品牌签名，白色）
     photo           0, 0, 1280, 720   MB.pageImageSrc(p,'back') + 左暗右亮渐层
     welcome        80, 214, 700, 110  h1，底部对齐，白字
     thanks         80, 334, 700, 40   h2
     contact        80, 506, 620, 110  小字联络（白）
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};
  var esc = MB.esc;
  var pad2 = MB.pad2;
  var CJK = /[　-〿㐀-鿿豈-﫿＀-￯]/;
  var IMG = null;   // 这一次排版的图（MB.deckImages）：每页都从这一份拿，整份才不会重复

  /**
   * @param {object} p      方案
   * @param {object} ctx    { resolve(ref), qrSvg, cases, venue, planSrc, inviteUrl, maps, waze }
   * @returns {string}      全部页面 HTML
   */
  MB.renderDeck = function (p, ctx) {
    var lang = ['zh', 'en', 'bi'].indexOf(p.lang) > -1 ? p.lang : 'en';
    var list = MB.pageList(p, ctx.resolve);
    var total = list.length;
    IMG = MB.deckImages ? MB.deckImages(p, ctx.resolve) : null;
    try {
      return list.map(function (pg, i) {
        var n = i + 1;
        var html = '', extra = '';
        switch (pg.type) {
          case 'cover': html = cover(p, ctx, lang); break;
          case 'letter': html = letter(p, ctx, lang); break;
          case 'needs': html = needs(p, ctx, lang); break;
          case 'glance': html = glance(p, ctx, lang); break;
          case 'plan': html = plan(p, ctx, lang); break;
          case 'chapter': html = chapter(p, ctx, lang); break;
          case 'room':
            html = room(p, ctx, lang, pg.room);
            if (html.indexOf('rm-hero') < 0) extra = ' rm-noimg';
            break;
          case 'cases': html = cases(p, ctx, lang); break;
          case 'practical': html = practical(p, ctx, lang); break;
          case 'language': html = language(p, ctx, lang); break;
          case 'team': html = team(p, ctx, lang); break;
          case 'invite': html = invite(p, ctx, lang); break;
          case 'back': html = back(p, ctx, lang); break;
        }
        // 整页照片当底的页，页脚与 logo 用白色
        var dark = pg.type === 'chapter' || pg.type === 'back';
        var foot = pg.type === 'cover' ? '' : footer(pg.type === 'back' ? 0 : n, total, MB.pageName(p, pg, lang), lang, dark);
        var target = pg.room ? 'room:' + esc(pg.room.uid) : pg.type;
        return '<div class="pg-wrap"><div class="pg pg-' + pg.type + extra + ' L-' + lang + '" data-goto="' + target + '" data-n="' + n + '/' + total + '">' +
          html + foot + '</div></div>';
      }).join('');
    } finally { IMG = null; }
  };

  /* ---------- 小零件 ---------------------------------------- */
  /* class 用 l-zh / l-en：invite.css 的全站语言切换会用 !important 藏掉 .zh / .en（那是界面语言，不是方案语言） */
  function span(s, cls) { return '<span class="l-' + cls + '">' + esc(s) + '</span>'; }
  /** 依语言出字：zh 只华文、en 只英文、bi 华文在前英文在后；销售自己写的字串原样（含华文就当华文排） */
  function T(o, lang) {
    if (o == null || o === '') return '';
    if (typeof o === 'string') return span(o, CJK.test(o) ? 'zh' : 'en');
    var zh = o.zh || '', en = o.en || '';
    if (lang === 'zh') return zh ? span(zh, 'zh') : en ? span(en, 'en') : '';
    if (lang === 'en') return en ? span(en, 'en') : zh ? span(zh, 'zh') : '';
    return (zh ? span(zh, 'zh') : '') + (en && en !== zh ? span(en, 'en') : '');
  }
  /** 纯文字（页名、讲稿用）：bi 取英文 */
  function plain(o, lang) { return MB.t(o, lang === 'zh' ? 'zh' : 'en'); }
  /** 左上大标签：英文大写是品牌字体，三种语言都印 */
  function kicker(en) { return '<p class="kick">' + esc(en) + '</p>'; }
  /** 小标签：英文大写；华文 / 双语时后面跟华文 */
  function lbl(en, zh, lang) {
    return '<p class="lbl">' + esc(en) + (lang !== 'en' && zh ? span(zh, 'zh') : '') + '</p>';
  }
  function head(cls, en, title, lang) {
    return '<div class="hd ' + cls + '">' + kicker(en) + (title ? '<h2 class="ttl">' + T(title, lang) + '</h2>' : '') + '</div>';
  }
  function logo(white) {
    var b = MB.BRAND && MB.BRAND.logo;
    var src = b ? (white ? b.white : b.ink) : 'assets/img/brand/sail.png';
    return '<img class="logo' + (white ? ' on-photo' : '') + '" src="' + esc(src) + '" alt="Sail 溪岸 by Riccione Reka" />';
  }
  /** 一张照片（object-fit: cover）。pos = 照片自己的焦点（model.js 的 BRAND_POS 等）：写成行内样式，
      不管放在哪一页都裁同一边（PPTX 读 computed style，跟着一样） */
  function photo(src, cls, pos) {
    if (!src) return '<div class="ph ' + cls + '"></div>';
    var st = pos && /^[\d.]+%? [\d.]+%?$|^(left|right|center|top|bottom)( (left|right|center|top|bottom))?$/.test(pos)
      ? ' style="object-position:' + esc(pos) + '"' : '';
    return '<figure class="ph ' + cls + '"><img src="' + esc(src) + '" alt="" decoding="async"' + st + ' /></figure>';
  }
  /** 版位图（封面、开场、邀约、封底…）：销售选的 > 自动（整份不重复）> 品牌照 */
  function slotPhoto(p, ctx, slot, cls) {
    var s = MB.pageImageSrc ? MB.pageImageSrc(p, slot, ctx.resolve, IMG || undefined) : null;
    return photo(s && s.src, cls, s && s.pos);
  }
  function refPhoto(ctx, ref, cls) {
    var im = ctx.resolve(ref);
    return photo(im && im.src, cls, im && im.pos);
  }
  /** 引号只包住那一句：华文「」、英文“”。句末的句号、惊叹号拿掉 ——
      内置的原话有句号、客户自己打的没有，同一页两种样子 */
  function quote(v, lang) {
    function q(s) {
      s = String(s).trim().replace(/[。．.！!]+$/, '');
      return CJK.test(s) ? span('「' + s + '」', 'zh') : span('“' + s + '”', 'en');
    }
    if (v == null || v === '') return '';
    if (typeof v === 'string') return q(v);
    if (lang === 'zh') return q(v.zh || v.en || '');
    if (lang === 'en') return q(v.en || v.zh || '');
    return (v.zh ? q(v.zh) : '') + (v.en && v.en !== v.zh ? q(v.en) : '');
  }
  /** 段落：空行分段、单个换行保留 */
  function paras(s, cls) {
    return String(s || '').split(/\n\s*\n/).map(function (x) { return x.trim(); }).filter(Boolean).map(function (x) {
      return '<p class="' + (CJK.test(x) ? 'l-zh' : 'l-en') + (cls ? ' ' + cls : '') + '">' + esc(x).replace(/\n/g, '<br />') + '</p>';
    }).join('');
  }
  /** 一个函式不存在、或出错，都不能让整份方案画不出来（copy.js / data.js 可能还没更新） */
  function safe(fn, args, dflt) {
    if (typeof fn !== 'function') return dflt;
    try { var v = fn.apply(null, args); return v == null || v === '' ? dflt : v; } catch (e) { return dflt; }
  }
  /** 华文称呼：「Mr & Mrs Lim」→「Lim 先生、太太」；华文名字原样 */
  function zhName(names) {
    if (!names || CJK.test(names)) return names;
    var m = /^(mr\.?\s*(?:&|and)\s*mrs\.?|mrs\.?|mr\.?|ms\.?|miss|madam|dr\.?)\s+(.+)$/i.exec(names);
    if (!m) return names;
    var h = m[1].toLowerCase().replace(/\./g, '');
    var t = /&|and/.test(h) ? '先生、太太' : { mr: '先生', mrs: '太太', ms: '女士', miss: '小姐', madam: '女士', dr: '医生' }[h];
    return m[2] + ' ' + t;
  }
  // copy.js 的讯息、讲稿用同一个称呼（华文方案：PDF 写「Wong 先生、太太」，WhatsApp 也一样）
  MB.zhName = zhName;

  /* ---------- 页脚：页码 + 页名 │ 品牌签名 --------------------
     客户回讯息时说得出「第 7 页 Kitchen」 */
  function footer(n, total, name, lang, white) {
    var tg = (MB.BRAND && MB.BRAND.tagline) || { zh: '自然栖居 · 生活回归', en: 'LIVING NATURALLY' };
    return '<div class="pg-foot' + (white ? ' on-photo' : '') + '">' +
      (n ? '<div class="pf-no"><b>' + pad2(n) + ' / ' + pad2(total) + '</b>' + (name ? '<span>' + esc(name) + '</span>' : '') + '</div>' : '') +
      '<div class="pf-tag">' + (lang !== 'en' ? span(tg.zh, 'zh') : '') + span(tg.en, 'en') + '</div>' +
    '</div>';
  }
  var PAGE_NAMES = {
    cover: { en: 'Cover', zh: '封面' }, letter: { en: 'A note for you', zh: '写在前面' },
    needs: { en: 'You told us', zh: '你们说的' }, glance: { en: 'At a glance', zh: '一页看懂' },
    plan: { en: 'Layout', zh: '平面布局' }, chapter: { en: 'The spaces', zh: '逐个空间' },
    // 现在放的是溪岸自己的实拍（不是客户案例）：叫「参考空间」，不说「像你们这样的家」（稻盛：不编）。
    // 等云端案例库有每个项目的区域 / 房型 / 家庭资料，才改回「Homes like yours」
    cases: { en: 'SAIL spaces', zh: '参考空间' }, practical: { en: 'Time & care', zh: '工期 · 保障' },
    language: { en: 'About SAIL', zh: '关于溪岸' }, team: { en: 'Project team', zh: '本案团队' },
    invite: { en: 'Next step', zh: '下一步' }, back: { en: 'Welcome home', zh: '欢迎回家' }
  };
  /** 页名（页脚、PPTX 备注、界面都用）：zh 回华文，其余回英文 */
  MB.pageName = function (p, pg, lang) {
    var o = pg.room ? MB.roomTitle(p, pg.room) : PAGE_NAMES[pg.type];
    return plain(o, lang);
  };

  /** 楼盘和展厅在同一个镇区（config 的 venue.township，例：Setia Alam）→ 邀约页可以说「同一个镇区」。
      只认完全相同的镇区名：Shah Alam、Selangor 都在地址里，但不是同一个镇区 */
  function sameTown(p, ctx) {
    var t = ((ctx.venue && ctx.venue.township) || '').trim().toLowerCase();
    var area = String(p.property.area || '').split(/[,，·]/)[0].trim().toLowerCase();
    return !!t && area === t;
  }
  MB.sameTown = sameTown;

  /* ---------- 1 · 封面 --------------------------------------
     WhatsApp 预览就是这一页的缩图：名字要大到缩图上看得清。
     只放：名字、楼盘、一行副题、日期、业务名 */
  function nameSize(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) n += CJK.test(s.charAt(i)) ? 1.7 : 1;
    return n <= 15 ? 'sz1' : n <= 22 ? 'sz2' : n <= 34 ? 'sz3' : 'sz4';
  }
  function cover(p, ctx, lang) {
    var who = MB.namesOr(p), prop = MB.propertyLabel(p);
    var tg = (MB.BRAND && MB.BRAND.tagline) || { zh: '自然栖居 · 生活回归', en: 'LIVING NATURALLY' };
    // 没填客户名（例如内部样稿）：大字改放楼盘，不要印出「Prepared for there」
    var big = who || prop;
    var name = big ? span(big, CJK.test(big) ? 'zh' : 'en') : T({ en: 'Your new home', zh: '你们的新家' }, lang === 'bi' ? 'zh' : lang);
    var L1 = lang === 'zh' ? 'zh' : 'en';
    var date = MB.longDate(p.date, L1);
    // 只做一两个空间：英文不说 whole-home（对这位客户不是真的，跟第 2 页、WhatsApp 讯息同一条规则）；
    // 华文的「全屋定制」是行业名称，照旧
    var kindEn = p.rooms.length && p.rooms.length <= 2 ? 'Custom cabinetry · Moodboard' : 'Whole-home design · Moodboard';
    return slotPhoto(p, ctx, 'cover', 'cv-img') + '<div class="cv-shade"></div>' +
      '<div class="cv-strip"><i></i>' + span(tg.zh, 'zh') + span(tg.en, 'en') + '</div>' +
      logo(true) +
      '<div class="cv-mid">' +
        '<h1 class="cv-name ' + nameSize(big || 'Your new home') + '">' + name + '</h1>' +
        '<p class="cv-kind">' + (lang === 'en' ? span(kindEn, 'en')
          : '<span class="l-zh">全屋定制 · <i>Moodboard</i></span>') + '</p>' +
        (prop && who ? '<p class="cv-prop">' + span(prop, CJK.test(prop) ? 'zh' : 'en') + '</p>' : '') +
        (date ? '<p class="cv-date">' + span(date, L1) + '</p>' : '') +
        (p.host.name ? '<p class="cv-by">' + (lang === 'zh' ? span(coverRole(p), 'zh') : 'Prepared by') + '<b>' + esc(p.host.name) + '</b></p>' : '') +
      '</div>';
  }
  /** 封面（华文）写在名字前面的职称：跟第 2 页署名同一个（MB.letterText 的 sign.role），
      不另外抬成「设计顾问」；没有华文职称就写中性的「方案准备」 */
  function coverRole(p) {
    var role = signOf(p).role;
    if (role && typeof role === 'object') role = role.zh || '';
    role = String(role || '').trim();
    return role && CJK.test(role) ? role : '方案准备';
  }

  /* ---------- 2 · 开场短话（Aman 情绪页） ----------------------
     业务署名的两三句话：引用他们说过的一件事 + 这份方案怎么回应。
     p.letter 是销售改过的字串就原样印；null = copy.js 自动起草（≤ 70 字 / 55 words） */
  function salute(p, L) {
    var names = MB.namesOr(p);
    if (L !== 'zh') return names ? 'Dear ' + names + ',' : 'Hello,';
    if (!names) return '你们好：';
    if (CJK.test(names)) return names + '：';
    var z = zhName(names);
    return z === names ? names + '，你们好：' : z + '：';
  }
  /** copy.js 没载入或出错时的开场短话：只说真的（不说「每一页都照你们说的做」—— 大部分空间没有对到需求） */
  function fallbackLetter(p, L) {
    var prop = (p.property.name || '').trim();
    return L === 'zh'
      ? '谢谢你们跟我们聊' + (prop ? ' ' + prop + ' 的' : '你们的') + '家。\n\n慢慢看，想改的地方圈起来，见面一起过一遍。'
      : 'Thank you for telling us about your home' + (prop ? ' at ' + prop : '') + '.\n\nTake your time — circle anything you’d change, and we’ll go through it together.';
  }
  /** 开场短话的字（deck 与 PPTX 共用）：{ salute:[{s,L}], body:[{s,L}], sign:{ name, role } } */
  MB.letterText = function (p, lang) {
    var Ls = lang === 'bi' ? ['zh', 'en'] : [lang === 'zh' ? 'zh' : 'en'];
    var custom = typeof p.letter === 'string' && p.letter.trim();
    // 销售改过的就原样；称呼跟着内文用的语言（华文信配华文称呼，有整句英文才加英文称呼）
    // 双语、客户名字是华文（陈先生、陈太太）：英文称呼会变成「Dear 陈先生、陈太太,」两种语言混在一行 —— 只留华文那行
    var sal = Ls;
    if (custom) {
      var hasZh = CJK.test(p.letter), hasEn = /[A-Za-z]+(\s+[A-Za-z’']+){3,}/.test(p.letter);
      sal = lang === 'bi' ? (hasZh ? ['zh'] : []).concat(hasEn || !hasZh ? ['en'] : []) : [hasZh ? 'zh' : 'en'];
    }
    var nm = MB.namesOr(p);
    if (lang === 'bi' && CJK.test(nm) && sal.indexOf('zh') > -1) sal = ['zh'];
    // 双语、很长的英文名字（Dato’ … bin … & Datin …）：华文那行只是同一串英文名字加「你们好」，
    // 两行都会断成两行、往上顶到 logo —— 只留英文那行（跟华文名字只留华文那行同一个道理）
    else if (lang === 'bi' && nm && !CJK.test(nm) && nm.length > 30 && sal.length > 1) sal = ['en'];
    var body = custom ? [{ s: p.letter, L: CJK.test(p.letter) ? 'zh' : 'en' }]
      : Ls.map(function (L) { return { s: String(safe(MB.draftLetter, [p, L], fallbackLetter(p, L))), L: L }; });
    return {
      salute: sal.map(function (L) { return { s: salute(p, L), L: L }; }),
      body: body,
      sign: signOf(p)
    };
  };
  /** 署名：名字 + 职称（团队里有这个人就用团队的职称 {en, zh}，否则用「我是谁」填的字串） */
  function signOf(p) {
    var me = null;
    MB.teamRows(p).forEach(function (m) { if (!me && m.name.toLowerCase() === String(p.host.name || '').trim().toLowerCase()) me = m; });
    return { name: String(p.host.name || '').trim(), role: me ? me.role : String(p.host.role || '').trim() };
  }
  /** 称呼的字号级：华文字算两个宽 */
  function salSize(list) {
    var n = list.reduce(function (m, x) {
      var w = 0;
      for (var i = 0; i < x.s.length; i++) w += CJK.test(x.s.charAt(i)) ? 1.8 : 1;
      return Math.max(m, w);
    }, 0);
    return n > 44 ? ' longer' : n > 26 ? ' long' : '';
  }
  function letter(p, ctx, lang) {
    var t = MB.letterText(p, lang);
    return slotPhoto(p, ctx, 'letter', 'lt-img') + '<div class="ph-shade lt-shade"></div>' +
      '<div class="lt-kick">' + kicker('A note for you') + (lang !== 'en' ? span('写在前面', 'zh') : '') + '</div>' +
      logo(false) +
      // 很长的称呼（Mr & Mrs Muhammad Hafiz bin Abdullah）缩字，不往上顶到 logo；更长的（拿督、bin / binti、两位医生）再缩一号
      '<div class="lt-salute' + salSize(t.salute) + '">' +
        t.salute.map(function (x) { return span(x.s, x.L); }).join('') + '</div>' +
      '<div class="lt-body">' + t.body.map(function (b) { return paras(b.s); }).join('') + '</div>' +
      (t.sign.name ? '<div class="lt-sign"><b>' + esc(t.sign.name) + '</b>' + (t.sign.role ? '<span>' + (typeof t.sign.role === 'string' ? esc(t.sign.role) : esc(plain(t.sign.role, lang))) + '</span>' : '') + '</div>' : '');
  }

  /* ---------- 3 · 你们说的 · 我们做的 --------------------------
     目标是让客户看完说「对，就是这样」：左边是他们的原话，右边是我们的做法 + 在第几页。
     最多 3 条（moodboard：挑最痛的；其余的讲稿里讲）；原话是空的那一行不印（MB.printedNeeds） */
  var NO_ANSWER = { en: 'We’ll work this one out with you at the showroom.', zh: '这一条，我们见面时一起想。' };
  var NOT_HERE = { en: 'Not in this proposal yet — let’s talk it through at the showroom.', zh: '这一项还不在这次的方案里，见面时一起聊。' };
  function todo(en, zh, lang) { return '<span class="todo">' + (lang === 'en' ? en : zh) + '</span>'; }
  /** 左边那一句：客户 / 销售自己打的字才加引号；需求卡勾选的选项不是他们亲口说的，转述（「你们提到…」）——
      跟第 2 页开场短话、讯息、讲稿同一套说法（copy.js 的 MB.needSaid）。回 { html, typed } */
  function said(p, n, lang) {
    var typed = typeof n.quote === 'string' && !!n.quote.trim();
    if (typed) return { html: quote(n.quote, lang), typed: true };
    function one(L) {
      var v = safe(MB.needSaid, [p, n, L], null);
      if (v && v.text) return v.text;
      var dk = n.key && MB.NEEDS[n.key];
      if (dk && dk.told) return L === 'zh' ? '你们提到' + dk.told.zh : 'You mentioned ' + dk.told.en;
      return '';
    }
    var o = { zh: one('zh'), en: one('en') };
    // 旧资料没有 told：照选项文字，不加引号
    if (!o.zh && !o.en) { var q = MB.needQuote(n); o = typeof q === 'string' ? { zh: q, en: q } : { zh: q.zh || '', en: q.en || '' }; }
    return { html: T(o, lang), typed: false };
  }
  function needs(p, ctx, lang) {
    var list = MB.printedNeeds ? MB.printedNeeds(p) : p.needs.slice(0, 3);
    var rows = list.map(function (n, i) {
      var r = MB.needRoom(p, n);
      var pn = r ? MB.roomPageNo(p, r) : 0;
      // 内置需求对应的空间不在这份方案里（说了鞋子多，但没有玄关页）：不能印「整面通顶鞋柜」这种方案里没有的承诺
      var d = MB.needDef(p, n.key);
      var missing = !r && n.answer == null && !!(d && d.room);
      var ans = missing ? '' : MB.needAnswer(n, p);
      // 还没写做法：不能印成空白（客户会读成「听到了，但没做」）—— 印一句真话；
      // 预览另外用红字提醒销售（.todo：打印、PPTX 都不出现）
      var a = ans ? T(ans, lang)
        : missing ? T(NOT_HERE, lang) + todo('(its room is not in this proposal)', '（对应的空间不在方案里）', lang)
        : T(NO_ANSWER, lang) + todo('(write our answer)', '（写下我们的做法）', lang);
      var s = said(p, n, lang);
      return '<div class="nd">' +
        '<span class="nd-no">' + pad2(i + 1) + '</span>' +
        '<p class="nd-q' + (s.typed ? '' : ' told') + '">' + s.html + '</p>' +
        '<div class="nd-a">' + a + '</div>' +
        // 页码只跟着真的做法印：还没有做法（见面一起想）、空间不在方案里，都不指到一页没写这件事的页
        '<em class="nd-p">' + (pn && ans ? 'P.' + pad2(pn) : '') + '</em>' +
      '</div>';
    }).join('');
    return head('nd-hd', 'You told us', { en: 'What we heard — and what we did about it.', zh: '你们说的，我们这样做。' }, lang) +
      logo(false) +
      '<div class="nd-list n' + list.length + '">' + rows + '</div>';
  }

  /* ---------- 4 · 一页看懂（拼贴 moodboard） ----------------------
     3–4 张图 + 5 色 + 3 材质（名称 + 色号）+ 风格名 + 一句 mood。三句承诺不印（在讲稿里） */
  function glance(p, ctx, lang) {
    var d = MB.dir(p);
    var ims = MB.glanceImages ? MB.glanceImages(p, ctx.resolve, IMG || undefined).slice(0, 4) : [];
    if (!ims.length) { var one = MB.pageImageSrc && MB.pageImageSrc(p, 'glance', ctx.resolve, IMG || undefined); if (one) ims = [one]; }
    // 配色取自客户发来的照片：写出来（真的才写），有缩图就钉在拼贴上
    var fromRef = p.paletteFrom === 'ref';
    var hasRefs = fromRef && (p.refImages || []).length;
    var refs = hasRefs ? '<div class="gl-refs n' + Math.min(3, p.refImages.length) + '">' + p.refImages.slice(0, 3).map(function (r) {
      return '<figure class="ph"><img src="' + esc(r.src) + '" alt="" /></figure>';
    }).join('') + '</div>' : '';
    var pal = p.palette.slice(0, 5).map(function (c) {
      return '<li><i style="background:' + MB.hex(c.hex) + '"></i><b>' + T({ en: c.en, zh: c.zh }, lang) + '</b></li>';
    }).join('');
    var mats = p.materials.slice(0, 3).map(function (m) {
      return '<li><i style="background:' + MB.hex(m.hex) + '"></i><b>' + T({ en: m.en, zh: m.zh }, lang) + '</b><em>' + MB.hex(m.hex).toUpperCase() + '</em></li>';
    }).join('');
    // 第一格是横的（放上面）还是直的（放左边整高）：MB.deckImages 看照片决定，裁得最少
    var wide = !!(IMG && IMG.glanceWide && ims.length > 1);
    return '<div class="gl-col n' + ims.length + (wide ? ' wide' : '') + '">' + ims.map(function (im, i) { return photo(im.src, 'g' + (i + 1), im.pos); }).join('') + refs + '</div>' +
      logo(false) +
      '<div class="hd gl-hd">' + kicker('At a glance') +
        '<h2 class="ttl">' + T({ en: d.en, zh: d.zh }, lang) + '</h2>' +
        '<p class="gl-mood">' + T(d.mood, lang) + '</p>' +
      '</div>' +
      '<div class="gl-pal' + (fromRef ? ' from-ref' : '') + '">' +
        lbl('Palette', '配色', lang) +
        (fromRef ? '<p class="gl-from">' + T({ en: 'From the photos you sent us', zh: '取自你们发来的照片' }, lang) + '</p>' : '') +
        '<ul>' + pal + '</ul>' +
      '</div>' +
      '<div class="gl-mats">' + lbl('Materials', '材质', lang) + '<ul>' + mats + '</ul></div>';
  }

  /* ---------- 5 · 平面图 ------------------------------------ */
  function plan(p, ctx, lang) {
    var notIn = ((p.extra || {}).notIncluded || '').trim();
    var boxW = 624, boxH = 624;   // 与 CSS 的 .pl-box 一致
    var w = p.plan.w || 1000, h = p.plan.h || 700;
    var k = Math.min(boxW / w, boxH / h);
    var iw = Math.round(w * k), ih = Math.round(h * k);
    var pins = p.rooms.map(function (r, i) {
      var pin = p.plan.pins[r.uid];
      if (!pin) return '';
      return '<span class="pin" style="left:' + (pin.x * 100).toFixed(2) + '%;top:' + (pin.y * 100).toFixed(2) + '%">' + (i + 1) + '</span>';
    }).join('');
    var legend = p.rooms.map(function (r, i) {
      return '<li><span class="pin">' + (i + 1) + '</span><b>' + T(MB.roomTitle(p, r), lang) + '</b><em>P.' + pad2(MB.roomPageNo(p, r)) + '</em></li>';
    }).join('');
    return '<div class="pl-panel"></div>' +
      '<div class="pl-box"><div class="pl-inner" style="width:' + iw + 'px;height:' + ih + 'px">' +
        '<img src="' + esc(ctx.planSrc || p.plan.src) + '" alt="" />' + pins +
      '</div></div>' +
      logo(false) +
      head('pl-hd', 'Layout', { en: 'Where everything goes.', zh: '每一件，放在哪里。' }, lang) +
      '<div class="pl-side"><ol class="pl-legend">' + legend + '</ol>' +
      // 一句话只用一种语言：华文方案、或双语而销售打的是华文 → 华文句；其余英文句
      (notIn ? '<p class="pl-not ' + (lang === 'zh' || (lang === 'bi' && CJK.test(notIn)) ? 'l-zh">' +
          '<b>这次没包含：</b>' + esc(notIn) + '。想加进来，跟我们说一声。'
        : 'l-en"><b>Not in this proposal:</b> ' + esc(notIn) + ' — tell us if you’d like them included.') + '</p>' : '') +
      '</div>';
  }

  /* ---------- 6 · 章节情绪页（可选） --------------------------- */
  function chapter(p, ctx, lang) {
    return slotPhoto(p, ctx, 'chapter', 'ch-img') + '<div class="ch-shade"></div>' + logo(true) +
      '<p class="ch-kick">The spaces' + (lang !== 'en' ? span('逐个空间', 'zh') : '') + '</p>' +
      // 只说真的：不是每一间都对到他们说过的话，所以不写「每一处都照你们说的做」
      '<p class="ch-line">' + T({ en: 'Now, room by room.', zh: '接下来，一间一间看。' }, lang) + '</p>';
  }

  /* ---------- 7 · 空间 --------------------------------------
     1 张主图 + 最多 2 张辅图；一句 head；卖点只印名称（最多 3 个，why 在讲稿）；「为 X」一句 */
  function room(p, ctx, lang, r) {
    var def = MB.ROOM[r.key];
    var idx = p.rooms.indexOf(r) + 1;
    var refs = (IMG && IMG.rooms[r.uid] ? IMG.rooms[r.uid] : r.images.filter(function (ref) { return ctx.resolve(ref); })).slice(0, 3);
    var imgs = refs.map(function (ref, i) { return refPhoto(ctx, ref, i === 0 ? 'rm-hero' : 'rm-sub rm-sub' + i); }).join('');
    var feats = MB.roomFeats(p, r).slice(0, 3).map(function (f) {
      return '<li><b>' + T({ en: f.en, zh: f.zh }, lang) + '</b></li>';
    }).join('');
    var note = MB.roomNote(p, r);
    var who = MB.namesOr(p);
    // 双语跟其他标签一样英文 + 华文（FOR MR & MRS LIM 为 Lim 先生、太太）；称呼跟开场短话、封底一样
    var zhWho = who ? zhName(who) : '';
    var forLbl = !who ? lbl('Why this, for you', '为什么这样做', lang)
      // 英文名字转不成华文称呼（Dato’ …）：双语只印英文那半，不把同一串名字印两次
      : lang === 'bi' && zhWho === who && !CJK.test(who) ? lbl('For ' + who, '', 'en')
      : lbl('For ' + who, '为 ' + zhWho, lang);
    // zh 的「为 X」不要再印一次英文 For X；双语、华文名字也一样（一行不混两种文字：FOR 陈先生、陈太太）
    if (who && (lang === 'zh' || (lang === 'bi' && CJK.test(who)))) forLbl = '<p class="lbl">' + span('为 ' + zhWho, 'zh') + '</p>';
    var title = MB.roomTitle(p, r);
    // 英文大写当标签（品牌字体）；华文 / 双语再加华文
    var en = typeof title === 'string' ? title : title.en, zh = typeof title === 'string' ? '' : title.zh;
    var name = typeof title === 'string' ? span(title, CJK.test(title) ? 'zh' : 'en') :
      (lang === 'en' ? span(en, 'en') : span(en, 'en') + span(zh, 'zh'));
    // 自己取的长名字缩字
    var nlen = 0;
    for (var i = 0; i < (en || '').length; i++) nlen += CJK.test(en.charAt(i)) ? 2 : 1;
    // 拼法（l1 / l2 / l2v / l3 / l3v）由 MB.deckImages 看照片直横决定，裁得最少
    var lay = (IMG && IMG.roomLayout && IMG.roomLayout[r.uid]) || 'l' + refs.length;
    return '<div class="rm-imgs ' + esc(lay) + '">' + imgs + '</div>' +
      logo(false) +
      '<span class="rm-no">' + pad2(idx) + '</span>' +
      '<h2 class="rm-name ' + (nlen <= 18 ? 'n1' : nlen <= 30 ? 'n2' : 'n3') + '">' + name + '</h2>' +
      '<p class="rm-line">' + T(def.head, lang) + '</p>' +
      '<div class="rm-txt">' +
        (feats ? '<ol class="rm-feats">' + feats + '</ol>' : '') +
        (note ? '<div class="rm-for">' + forLbl + '<p class="rm-note">' + T(note, lang) + '</p></div>' : '') +
      '</div>';
  }

  /* ---------- 8 · 参考空间 ---------------------------------------
     现在的图是溪岸自己的实拍（品牌手册、内置图库），不是客户的家：所以叫「SAIL spaces · 参考空间」，
     不写「像你们这样的家」，那一行也只写看得到的事实（系列、空间），不编「和你们很像」。
     等云端案例库有每个项目的区域 / 房型 / 家庭资料，才改回「Homes like yours」（稻盛：不编案例）。
     每个案例：一张图 + 一行（note 由 copy.js 起草，销售可改） */
  function caseImage(ref, resolve) {
    var b = resolve(ref);
    if (!b) return null;
    var own = ref.indexOf('u:') === 0;
    // 跟 MB.allImages 同一个形状，copy.js 的 MB.caseNote 拿得到 rooms / series / label
    return { ref: ref, src: b.src, w: b.w, h: b.h, series: b.series || '', rooms: b.rooms || (b.tag ? [b.tag] : []),
      own: own, label: own ? (b.label || '') : (b.zh || ''), en: b.en || '', zh: b.zh || '', pos: b.pos || '' };
  }
  /** 一个案例那一句：销售写的 > copy.js 起草 > 图本身的说明（不编） */
  function caseLine(p, c, im, lang) {
    if (c.note != null && String(c.note).trim()) return c.note;
    var fb = { en: im.en || im.label || '', zh: im.zh || im.label || '' };
    return { en: String(safe(MB.caseNote, [p, im, 'en'], fb.en)), zh: String(safe(MB.caseNote, [p, im, 'zh'], fb.zh)) };
  }
  /** 案例卡片（deck 与 PPTX 共用）：[{ im, line, tag, tagZh }] */
  MB.caseCards = function (p, resolve, lang) {
    var said = {};
    return MB.caseRefs(p, resolve).map(function (c) {
      var im = caseImage(c.ref, resolve);
      if (!im) return null;
      var dir = MB.DIRECTION[im.series], rm = MB.ROOM[im.rooms[0]];
      var tag = [dir ? dir.en : '', rm ? rm.en : ''].filter(Boolean).join(' · ');
      var tagZh = [dir ? dir.zh : '', rm ? rm.zh : ''].filter(Boolean).join(' · ');
      var line = caseLine(p, c, im, lang);
      // 自动那句跟前一张一模一样（同系列、同空间）：改印这张图自己的说明，三张不要读起来一样
      var key = typeof line === 'string' ? line : (line.zh || '') + '|' + (line.en || '');
      if (said[key] && typeof line !== 'string' && (im.en || im.zh)) line = { en: im.en || im.label, zh: im.zh || im.label };
      said[key] = 1;
      return { im: im, line: line, tag: tag, tagZh: tagZh };
    }).filter(Boolean);
  };
  function cases(p, ctx, lang) {
    var cards = MB.caseCards(p, ctx.resolve, lang);
    // 1 个案例：大图 + 旁边一行（不留半页空白）；2 个 554 宽；3 个 360 宽
    var n = cards.length, w = n === 1 ? 1136 : n === 3 ? 360 : 554, gap = 28;
    var html = cards.map(function (c, i) {
      return '<div class="cs" style="left:' + (i * (w + gap)) + 'px;width:' + w + 'px">' +
        photo(c.im.src, 'cs-img', c.im.pos) +
        '<div class="cs-cap">' + (c.tag ? lbl(c.tag, c.tagZh, lang === 'bi' ? 'en' : lang) : '') +
          '<p class="cs-line">' + T(c.line, lang) + '</p></div>' +
      '</div>';
    }).join('');
    return head('cs-hd', 'SAIL spaces', { en: 'A few SAIL spaces, for reference.', zh: '几个溪岸的参考空间。' }, lang) + logo(false) +
      '<div class="cs-list n' + n + '">' + html + '</div>';
  }

  /* ---------- 9 · 工期 · 保障（预设关） ----------------------------
     只放大数字（订单周期两个系列、五金与板材质保）+ 一句顾虑回应；数字只用 MB.BRAND（老板确认过的，
     「终身保家」是老板自己的说法，照用）。销售填了这一家的工期 / 预算：多印一小行「你们家」（第一行）。
     其余的（流程、售后细节）在讲稿 */
  var CONCERN_FALLBACK = [
    { worry: { en: 'Will custom cabinetry take forever?', zh: '全屋定制，会不会等很久？' },
      answer: { en: 'Each series has its own lead time — real ranges, shown here.', zh: '每个系列有自己的订单周期 —— 都是真实的区间。' } },
    { worry: { en: 'What happens after it is installed?', zh: '装好以后，有问题找谁？' },
      answer: { en: 'We come back: an adjustment visit before you move in, then a maintenance visit every year.', zh: '我们会回来：入住前上门调试一次，之后每年一次集中维保。' } }
  ];
  /** 挑 2–3 条顾虑（双语只放 2 条）；data.js 的 MB.CONCERNS 照重要性排，取前面的 */
  MB.pickConcerns = function (p, lang) {
    var list = Array.isArray(MB.CONCERNS) && MB.CONCERNS.length ? MB.CONCERNS : CONCERN_FALLBACK;
    var x = p.extra || {};
    return list.filter(function (c) {
      if (!c || !c.worry || !c.answer) return false;
      // 讲预算的那条：销售没填预算就先不讲（答不出具体数字的顾虑，讲出来反而更担心）
      var need = c.needs || c.need;
      return !need || String(x[need] || '').trim();
    }).slice(0, lang === 'bi' ? 2 : 3);
  };
  /** 工期·保障页的资料（deck 与 PPTX 共用）：
      { lead:[{series:{zh,en}, days}], unit:{zh,en}, care:[{label:{zh,en}, value:{zh,en}}]（五金、板材），
        concern:{worry, answer}|null, project:[{label:{zh,en}, text}]（销售填的第一行） } */
  MB.practicalBlocks = function (p) {
    var B = MB.BRAND || {}, x = p.extra || {};
    var rows = (B.aftercare || {}).rows || [];
    function row(re) { for (var i = 0; i < rows.length; i++) if (re.test((rows[i].label || {}).en || '')) return rows[i]; return null; }
    var care = [row(/hardware/i), row(/panel/i)].filter(Boolean);
    if (!care.length) care = rows.slice(-2);
    // 只取第一行、第一句（分号、括号后面的补充说明留给讲稿）
    function first(s) {
      var l = String(s || '').split(/\n+/).map(function (t) { return t.trim().replace(/^[-•·]\s*/, ''); }).filter(Boolean)[0] || '';
      return l.split(/\s*[;；（(]/)[0].trim() || l;
    }
    var project = [];
    // 客户看的字：不说「这一单」（帐本的说法）、不用 Investment 这种包装过的词
    if (first(x.timeline)) project.push({ label: { en: 'Your home', zh: '你们家' }, text: first(x.timeline) });
    if (first(x.budget)) project.push({ label: { en: 'Budget', zh: '预算' }, text: first(x.budget) });
    return {
      lead: B.lead || [], unit: B.leadUnit || { zh: '天', en: 'days' }, care: care,
      concern: MB.pickConcerns(p, 'en')[0] || null, project: project
    };
  };
  /** 一个大数字：「1 年」→ 大的 1 + 小的「年」（跟订单周期同一个字体、同一个大小）；
      不是数字开头的（终身保家 / Lifetime）整个印大字 */
  function bigValue(v, lang) {
    var main = String((lang === 'en' ? v.en || v.zh : v.zh || v.en) || '');
    var m = /^(\d[\d.,–-]*)\s*(.*)$/.exec(main);
    if (!m) return '<b class="pr-n ' + (CJK.test(main) ? 'zh' : 'word') + '">' + esc(main) + '</b>';
    var unit = m[2];
    if (lang === 'bi') { var e = /^\d[\d.,–-]*\s*(.*)$/.exec(String(v.en || '')); if (e && e[1] && e[1] !== unit) unit += ' · ' + e[1]; }
    return '<b class="pr-n">' + esc(m[1]) + (unit ? '<small>' + esc(unit) + '</small>' : '') + '</b>';
  }
  function practical(p, ctx, lang) {
    var k = MB.practicalBlocks(p);
    // 单位写进标签（「订单周期 · 天」），数字下面只放系列名 —— 不会有一个「天」孤零零挂在第一个系列下面
    var lead = '<div class="pr-blk pr-b1">' + lbl('Lead time · ' + (k.unit.en || 'days'), '订单周期（' + (k.unit.zh || '天') + '）', lang) +
      '<div class="pr-nums">' + k.lead.slice(0, 2).map(function (l) {
        return '<div class="pr-num"><b class="pr-n">' + esc(l.days) + '</b><span class="pr-cap">' + T(l.series, lang) + '</span></div>';
      }).join('') + '</div></div>';
    // 质保：五金、板材并排，跟订单周期同一个样子（大字 + 下面一行是什么）
    var care = '<div class="pr-blk pr-b2">' + lbl('Warranty', '质保', lang) + '<div class="pr-nums">' +
      k.care.slice(0, 2).map(function (r) {
        var v = r.value || {}, lb = r.label || {};
        var cap = { en: String(lb.en || '').replace(/\s*warranty$/i, ''), zh: String(lb.zh || '').replace(/质保$/, '') };
        // 双语：大字是华文（终身保家）时，英文的值补在英文那行（「Hardware · lifetime」）；
        // 数字开头的（1 年 · year）大字已经两种语言都有，不再写一次
        if (lang === 'bi' && v.en && v.en !== v.zh && !/^\d/.test(String(v.zh || ''))) cap.en += ' · ' + String(v.en).toLowerCase();
        return '<div class="pr-num">' + bigValue(v, lang) + '<span class="pr-cap">' + T(cap, lang) + '</span></div>';
      }).join('') + '</div></div>';
    var c = k.concern;
    var concern = c ? '<div class="pr-con"><p class="pr-w">' + T(c.worry, lang) + '</p><div class="pr-a">' + T(c.answer, lang) + '</div></div>' : '';
    var proj = k.project.length ? '<div class="pr-proj">' + k.project.map(function (x) {
      return '<p><span class="k">' + esc(lang === 'zh' ? x.label.zh : x.label.en.toUpperCase()) + '</span>' + span(x.text, CJK.test(x.text) ? 'zh' : 'en') + '</p>';
    }).join('') + '</div>' : '';
    return slotPhoto(p, ctx, 'practical', 'pr-img') + logo(false) +
      head('pr-hd', 'Time & care', { en: 'How long it takes, and what we stand behind.', zh: '要多久，保多久。' }, lang) +
      '<div class="pr-body">' + lead + care + concern + proj + '</div>';
  }

  /* ---------- 10 · 品牌一页（key 沿用 language） -----------------
     权威放在他们的家后面，只占一页：一张照片 + 一句品牌话 + 一行奖项 + 一行供应链（全部 MB.BRAND 的事实） */
  /** 品牌页的字（deck 与 PPTX 共用）：{ line:{zh,en}, awards:[{years, name:{zh,en}}], supply:'Egger · Blum · Laminam' } */
  MB.brandFacts = function () {
    var B = MB.BRAND || {};
    // 同一个奖合并年份：「HCA 高定家居设计奖 2022–2024」；只得过一次的写奖项全名（含金奖）
    var groups = [], by = {};
    (B.awards || []).forEach(function (a) {
      var en = String((a.title || {}).en || ''), zh = String((a.title || {}).zh || '');
      var key = en.split(/\s*·\s*/)[0];
      if (!by[key]) { by[key] = { years: [], en: en, zh: zh, ken: key, kzh: zh.split(/\s*·\s*/)[0] }; groups.push(by[key]); }
      by[key].years.push(+a.year || a.year);
    });
    var awards = groups.map(function (g) {
      var ys = g.years.slice().sort();
      var run = ys.every(function (y, i) { return !i || +y === +ys[i - 1] + 1; });
      var years = ys.length === 1 ? String(ys[0]) : run ? ys[0] + '–' + ys[ys.length - 1] : ys.join(', ');
      return { years: years, name: ys.length === 1 ? { en: g.en, zh: g.zh } : { en: g.ken, zh: g.kzh } };
    });
    // 供应链一行：先列客户认得的牌子（有在 MB.BRAND 里才列，不编）
    var all = [];
    ((B.supply || {}).rows || []).forEach(function (r) { String(r.brands || '').split(/\s*·\s*/).forEach(function (b) { if (b) all.push(b); }); });
    var known = ['Egger', 'Blum', 'Laminam'].filter(function (b) { return all.indexOf(b) > -1; });
    var supply = (known.length ? known : ((B.supply || {}).rows || []).map(function (r) { return String(r.brands || '').split(/\s*·\s*/)[0]; })).join(' · ');
    return { line: (B.story || {}).title || null, awards: awards, supply: supply };
  };
  function language(p, ctx, lang) {
    var f = MB.brandFacts();
    var aw = f.awards.map(function (a) {
      return '<li><b>' + esc(a.years) + '</b><span>' + esc(lang === 'zh' ? a.name.zh : a.name.en) + '</span></li>';
    }).join('');
    return slotPhoto(p, ctx, 'language', 'lg-img') + logo(false) +
      '<div class="hd lg-hd">' + kicker('About SAIL') + '</div>' +
      (f.line ? '<h2 class="lg-line">' + T(f.line, lang) + '</h2>' : '') +
      '<div class="lg-proof">' +
        (aw ? lbl('Design awards', '设计奖项', lang) + '<ul class="lg-awards">' + aw + '</ul>' : '') +
        (f.supply ? lbl('Sourced from', '供应链', lang) + '<p class="lg-supply">' + esc(f.supply) + '</p>' : '') +
      '</div>';
  }

  /* ---------- 11 · 本案团队（预设关） --------------------------- */
  function team(p, ctx, lang) {
    var list = MB.teamRows(p).slice(0, 6);
    var rows = list.map(function (m) {
      return '<li><span class="k">' + T(m.role, lang) + '</span><b' + (m.name.length > 16 ? ' class="long"' : '') + '>' +
        span(m.name, CJK.test(m.name) ? 'zh' : 'en') + '</b></li>';
    }).join('');
    return slotPhoto(p, ctx, 'team', 'tm-img') + logo(false) +
      head('tm-hd', 'Project team', { en: 'The people looking after your home.', zh: '照顾你们家的人。' }, lang) +
      '<ul class="tm-rows' + (list.length > 4 ? ' many' : '') + '">' + rows + '</ul>';
  }

  /* ---------- 12 · 到馆邀约（峰值） ----------------------------
     保留时段 + 准备的三样 + QR + 一行链接 */
  function invite(p, ctx, lang) {
    var L1 = lang === 'zh' ? 'zh' : 'en';
    var slot1 = MB.slotLabel(p.visit.date, p.visit.time, L1);
    var slot2 = MB.slotLabel(p.visit.date2, p.visit.time2, L1);
    var prep = MB.prepared(p).filter(Boolean).map(function (x, i) {
      return '<li><span class="no">' + pad2(i + 1) + '</span><div>' + T(x, lang) + '</div></li>';
    }).join('');
    var mins = +p.visit.mins || 60;
    var town = (ctx.venue && ctx.venue.township) || 'Setia Alam';
    var near = sameTown(p, ctx);
    // 日期一行、时间一行：不会断在「星期 / 六」中间
    var d1 = MB.dateLabel(p.visit.date, L1), t1 = MB.timeLabel(p.visit.time, L1);
    // 时长 · 地点一行；同一个镇区自己一行（不会断成「…SHOWROOM, IN YOUR / TOWNSHIP」）
    var slot = slot1
      ? '<p class="iv-slot"><span>' + esc(d1) + '</span>' + (t1 ? '<span>' + esc(t1) + '</span>' : '') + '</p>' +
        (slot2 ? '<p class="iv-alt">' + (L1 === 'zh' ? '或 ' : 'or ') + esc(slot2) + '</p>' : '') +
        '<p class="iv-meta"><span>' + (L1 === 'zh' ? '约 ' + mins + ' 分钟 · ' + esc(town) + ' 展厅' : mins + ' minutes · our ' + esc(town) + ' showroom') + '</span>' +
          (near ? '<span>' + (L1 === 'zh' ? '和你们新家同一个镇区' : 'In the same township as your new home') + '</span>' : '') + '</p>'
      : '<p class="iv-slot iv-open">' + T({ zh: '回我一个方便的时段', en: 'Just tell us a day and time.' }, lang) + '</p>';
    var wa = MB.msisdn(p.host.wa);
    var who = MB.namesOr(p), prop = MB.propertyLabel(p);
    var hello = L1 === 'zh'
      ? '你好 ' + (p.host.name || '') + '，' + (who ? '我是 ' + who + (prop ? '（' + prop + '）' : '') + '，' : '') + '想约时间到展厅看看。'
      : 'Hi ' + (p.host.name || '') + ', ' + (who ? 'this is ' + who + (prop ? ' (' + prop + ')' : '') + '. ' : '') + 'We’d like to visit the showroom.';
    // 打印成 PDF 后链接仍然点得开：客户在手机上一点就 WhatsApp / 导航
    var links = [
      wa ? '<a href="https://wa.me/' + wa + '?text=' + encodeURIComponent(hello) + '">WhatsApp</a>' : '',
      ctx.waze ? '<a href="' + esc(ctx.waze) + '">Waze</a>' : '',
      ctx.maps ? '<a href="' + esc(ctx.maps) + '">Google Maps</a>' : ''
    ].filter(Boolean).join(' · ');
    var host = [esc(p.host.name || ''), wa ? '+' + esc(wa) : ''].filter(Boolean).join(' · ');
    // 右栏是一条直的流：三样 → 时段 + QR → 联络。三样在双语时变高，时段跟着往下挪，不会叠在一起
    return slotPhoto(p, ctx, 'invite', 'iv-img') + logo(false) +
      head('iv-hd', 'Come and feel it', { en: 'Some things photos can’t show you.', zh: '有些东西，照片给不了。' }, lang) +
      '<div class="iv-flow">' +
        '<div class="iv-prep">' + lbl('Prepared for your visit', '为你们准备好的', lang) + '<ol>' + prep + '</ol></div>' +
        '<div class="iv-row">' +
          // 「已为你们保留」只在真的留了时段（销售确认过，不是需求卡自动建议的）才写 —— 不编稀缺
          '<div class="iv-when">' + (slot1 && !p.visit.auto ? lbl('Reserved for you', '已为你们保留', lang)
            : slot1 ? lbl('Suggested time', '建议的时段', lang) : lbl('When suits you', '挑一个时间', lang)) + slot + '</div>' +
          (ctx.qrSvg ? '<a class="iv-qr" href="' + esc(ctx.inviteUrl || '#') + '">' + ctx.qrSvg + '<span>' + T({ en: 'Invitation & parking guide', zh: '邀请函 · 停车指引' }, lang === 'bi' ? 'zh' : lang) + '</span></a>' : '') +
        '</div>' +
        '<p class="iv-host">' + host + (links ? (host ? '<i></i>' : '') + links : '') + '</p>' +
      '</div>';
  }

  /* ---------- 13 · 欢迎回家（封底，Aman）：整页照片 + 一句话 + 联络小字 ---------- */
  function thanks(p, lang) {
    var who = MB.namesOr(p);
    var zh = who ? '谢谢，' + zhName(who) + '。' : '谢谢。';
    // 双语、华文名字：英文那行不再放华文名字（一行只用一种语言）
    var en = who && !(lang === 'bi' && CJK.test(who)) ? 'Thank you, ' + who + '.' : 'Thank you.';
    return T({ zh: zh, en: en }, lang);
  }
  function back(p, ctx, lang) {
    var v = ctx.venue || {};
    function row(en, zh, val) {
      return val ? '<li><span class="k">' + T({ en: en, zh: zh }, lang === 'bi' ? 'en' : lang) + '</span><span class="v">' + esc(val) + '</span></li>' : '';
    }
    var hours = lang === 'zh' ? v.hoursZh : v.hoursEn;
    var rows = row('Showroom', '展厅', v.address) + row('WhatsApp', 'WhatsApp', v.phoneShow) +
      row('Online', '线上', [v.website, v.instagram ? 'Instagram ' + v.instagram : ''].filter(Boolean).join('  ·  ')) +
      row('Hours', '营业时间', hours);
    return slotPhoto(p, ctx, 'back', 'bk-img') + '<div class="bk-shade"></div>' + logo(true) +
      '<div class="bk-txt">' +
        '<h1 class="bk-wel">' + T({ en: 'Welcome home.', zh: '欢迎回家。' }, lang) + '</h1>' +
        '<h2 class="bk-thanks">' + thanks(p, lang) + '</h2>' +
        '<ul class="bk-contact">' + rows + '</ul>' +
      '</div>';
  }
})();
