/* ============================================================
   VISI · 案例库词表（浏览器版）
   ------------------------------------------------------------
   和伺服器的 invite/api/_lib/vocab.js 内容必须一模一样：
   tools/caselib/test/vocab.test.mjs 会逐项比对，改一边就要改另一边。
   caselib.html（上传 / 审核）和 visi.html 都载入这个档。

   MB.CASE_STYLES   [{key, zh, en, series, match}]  风格 → 溪岸系列
   MB.CASE_CABINETS [{key, zh, en, rooms}]          柜类（rooms 空 = 不限空间）
   MB.CASE_ROOMS    ['foyer', …, 'other']           照片的空间
   MB.CASE_PTYPES   [{key, zh, en, match}]          房型
   MB.CASE_TRAITS   [{key, zh, en, match}]          家庭特点（= copy.js caseNote 的 TRAIT）
   MB.SCOPE_CABINETS [{scope, match, cabinets}]     需求卡定制范围 → 柜类
   MB.CASE_STATUS   ['new', 'auto', 'unsure', 'confirmed']
   MB.caseStyle(key) / MB.caseCabinet(key) → 那一项或 null
   MB.scopeCabinets(scopes) → 柜类 key 阵列（按词表顺序、不重复）

   match 是不分大小写的正规式原文（字串）：两边能 JSON 比对。
   多个都对上时取第一个，排列顺序有意义（半独立 排在 独立 前面）。
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};

  // 风格：九种 + 公司文件夹名常写的欧式、美式、混搭。series = 对应溪岸的五个系列（MB.SERIES），空 = 不对应。
  // match 也拿来读文件夹名：「日期-城市-客户-风格」，例：20210513-上海-方女士-现代美式 → 现代简约 + 美式（照字出现的先后）
  // 旧需求卡选项要一直认得（客户手上还没送出的卡）：match 只加不减
  MB.CASE_STYLES = [
    { key: 'wood', zh: '原木', en: 'Natural wood', series: 'misty', match: '原木|natural wood' },
    { key: 'wabi', zh: '微侘寂', en: 'Subtle wabi-sabi', series: 'wabi', match: '侘寂|wabi' },
    { key: 'cream', zh: '奶油风', en: 'Cream style', series: 'misty', match: '奶油|cream' },
    { key: 'french', zh: '轻法式', en: 'Light French', series: 'weaving', match: '法式|french' },
    { key: 'midcentury', zh: '中古', en: 'Mid-century', series: 'weaving', match: '中古|复古|mid-?century|vintage|retro' },
    { key: 'modern', zh: '现代简约', en: 'Modern minimal', series: 'skeleton', match: '现代|简约|极简|modern minimal|minimalis' },
    { key: 'japandi', zh: '日式', en: 'Japandi', series: 'misty', match: '日式|japandi|japanese' },
    { key: 'nordic', zh: '北欧', en: 'Nordic', series: 'misty', match: '北欧|nordic|scandi' },
    { key: 'luxe', zh: '轻奢', en: 'Modern luxe', series: 'mountain', match: '轻奢|luxe|luxury' },
    // 公司文件夹名常见、不对应溪岸五个系列的（series 空：方案不拿它们配系列）
    { key: 'european', zh: '欧式', en: 'European', series: '', match: '欧式|european' },
    { key: 'american', zh: '美式', en: 'American', series: '', match: '美式|american' },
    { key: 'mixed', zh: '混搭', en: 'Eclectic', series: '', match: '混搭|eclectic|mix(ed)? style' }
  ];

  // 柜类：老板确认的 15 种。rooms = 通常出现在哪些空间；空 = 不限空间
  MB.CASE_CABINETS = [
    { key: 'kitchen', zh: '橱柜', en: 'Kitchen cabinets', rooms: ['kitchen'] },
    { key: 'wardrobe', zh: '衣柜', en: 'Wardrobe', rooms: ['master', 'walkin', 'bedroom', 'guest'] },
    { key: 'display', zh: '展示柜', en: 'Display cabinet', rooms: ['living', 'dining'] },
    { key: 'bookcase', zh: '书柜', en: 'Bookcase', rooms: ['study', 'living'] },
    { key: 'bedend', zh: '床尾柜', en: 'Bed-end cabinet', rooms: ['master', 'bedroom'] },
    { key: 'dresser', zh: '化妆台', en: 'Dressing table', rooms: ['vanity', 'master'] },
    { key: 'island', zh: '中岛', en: 'Kitchen island', rooms: ['kitchen'] },
    { key: 'tvcab', zh: '电视柜', en: 'TV cabinet', rooms: ['living'] },
    { key: 'tvwall', zh: '电视墙', en: 'TV feature wall', rooms: ['living'] },
    { key: 'door', zh: '房门', en: 'Doors', rooms: [] },
    { key: 'shoe', zh: '鞋柜', en: 'Shoe cabinet', rooms: ['foyer'] },
    { key: 'bathvanity', zh: '浴室柜', en: 'Bathroom vanity', rooms: ['bathroom'] },
    { key: 'wallpanel', zh: '护墙板', en: 'Wall panelling', rooms: ['living', 'master', 'foyer'] },
    { key: 'sideboard', zh: '餐边柜', en: 'Sideboard', rooms: ['dining'] },
    { key: 'bed', zh: '定制床', en: 'Custom bed', rooms: ['master', 'bedroom', 'guest'] }
  ];

  // 照片的空间：13 个 MB.ROOM key，加上 other（拍不出是哪里的）
  MB.CASE_ROOMS = ['foyer', 'living', 'dining', 'kitchen', 'laundry', 'master', 'walkin', 'vanity',
    'bathroom', 'bedroom', 'study', 'altar', 'guest', 'other'];

  // 房型（空字串 = 不知道）。半独立排在独立前面：「半独立」也含「独立」两个字
  MB.CASE_PTYPES = [
    { key: 'condo', zh: '公寓', en: 'Condo', match: 'condo|公寓|apartment|serviced' },
    { key: 'landed', zh: '有地', en: 'Landed', match: 'landed|有地' },
    { key: 'terrace', zh: '排屋', en: 'Terrace', match: 'terrace|排屋|link house' },
    { key: 'semid', zh: '半独立', en: 'Semi-D', match: 'semi-?d|半独立' },
    { key: 'bungalow', zh: '独立', en: 'Bungalow', match: 'bungalow|独立' }
  ];

  // 家庭特点：key 就是 copy.js MB.caseNote 认得的 TRAIT，match 也照抄那边
  MB.CASE_TRAITS = [
    { key: 'elderly', zh: '长辈同住', en: 'Parents at home', match: '长辈|elder|parent' },
    { key: 'kids', zh: '有小孩', en: 'Kids', match: '孩子|小孩|kid|child' },
    { key: 'pets', zh: '养宠物', en: 'Pets', match: '宠物|pet' },
    { key: 'helper', zh: '有帮佣', en: 'Helper', match: '帮佣|helper|maid' }
  ];

  // 需求卡「定制范围」→ 柜类（对上 match 的都算；全屋 = 常见的几种）
  MB.SCOPE_CABINETS = [
    { scope: '全屋', match: '全屋|whole (house|home)', cabinets: ['kitchen', 'wardrobe', 'shoe', 'tvcab', 'tvwall', 'display', 'sideboard', 'bathvanity'] },
    { scope: '厨房', match: '厨房|kitchen', cabinets: ['kitchen', 'island'] },
    { scope: '衣柜', match: '衣柜|wardrobe', cabinets: ['wardrobe'] },
    { scope: '鞋柜', match: '鞋柜|shoe', cabinets: ['shoe'] },
    { scope: '电视柜', match: '电视柜|\\bTV\\b', cabinets: ['tvcab', 'tvwall'] },
    { scope: '书房', match: '书房|study', cabinets: ['bookcase'] },
    { scope: '浴室柜', match: '浴室柜|vanity|bathroom', cabinets: ['bathvanity'] },
    { scope: '门·墙板', match: '墙板|wall panel|door', cabinets: ['door', 'wallpanel'] }
  ];

  // 照片审核状态
  MB.CASE_STATUS = ['new', 'auto', 'unsure', 'confirmed'];

  function find(list, key) {
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return null;
  }
  MB.caseStyle = function (key) { return find(MB.CASE_STYLES, key); };
  // 案例的风格最多两种（style + style2，例：现代 + 美式）：任一种对上就算
  MB.hasStyle = function (c, key) { return !!key && !!c && (c.style === key || c.style2 === key); };
  // 产品（档名读的原字，例：水吧柜）：跟伺服器 catalog.js 的 isProduct 同一条规则
  MB.clProductOk = function (t) {
    return typeof t === 'string' && /^[\u4e00-\u9fff]{2,10}$/.test(t) && /(柜|台|墙|门|板|床|架|桌|岛|吧|榻榻米|格栅|隔断|屏风)$/.test(t) &&
      !/先生|太太|小姐|女士|夫人|老板|夫妇|客户|客人|测试|阳台|露台|天台|平台/.test(t);
  };
  MB.caseCabinet = function (key) { return find(MB.CASE_CABINETS, key); };

  MB.scopeCabinets = function (scopes) {
    var text = [].concat(scopes || []).join(' \n ');
    var on = {};
    MB.SCOPE_CABINETS.forEach(function (s) {
      if (new RegExp(s.match, 'i').test(text)) s.cabinets.forEach(function (c) { on[c] = 1; });
    });
    return MB.CASE_CABINETS.filter(function (c) { return on[c.key]; }).map(function (c) { return c.key; });
  };
})();
