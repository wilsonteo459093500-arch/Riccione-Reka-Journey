/* ============================================================
   VISI · 更多内置照片（溪岸 2025 品牌手册里的实拍）
   ------------------------------------------------------------
   老板给的品牌手册（PDF）抽出来的照片：五个系列、五种风格
   （轻法式 french · 中古 midcentury · 原木 wood · 奶油风 cream · 微侘寂 wabi）、
   六类产品（房门、柜门、定制床、护墙、橱柜、衣柜），加上风景与工艺细节。
   原本 43 张，现在这里 37 张：手册里没印出来的 6 张 PDF 内嵌图（看起来不是溪岸的）2026-11-04 移到 MB.RETIRED_BUILTIN。
   - 空间照：加进 MB.BUILTIN，自动配图和图库都用得到 —— 每个空间能挑的图多一倍。
   - series 只标确认过是那个系列的（手册有标系列的那几页）。产品分类页（房门、柜门、定制床、护墙、
     橱柜、衣柜）、风格页（style-*）的系列只是「看起来像」：不标，只给空间页用，绝不上系列页。
   - 氛围照（rooms: ['mood']）：开场短话、章节页、封底这类情绪页轮着用，
     不会每一份方案都同一张（见 model.js 的 MB.deckImages；哪一张适合哪一页在 MOOD_FIT）。
   - rooms 只写照片里真的是哪个空间（原木起居其实是客厅，不标主卧）—— 标错了，主卧那一页就放了一张客厅。
   - land-grassland 裁成 1600 × 426 的窄长条：只适合很宽的格子，自动配图不用（MOOD_FIT 'none'）。
   - 有几张是别张的裁切（detail-corner、misty-corridor…）：model.js 的 SAME_SHOT 把它们和原图当同一张。
     加新照片时重跑两两比对（scratchpad 的 tools/samephoto.py，模板匹配），找出这种裁切。
   - 新照片要用新档名：vercel.json 把 assets/img 设成 immutable 一年，同名换图，看过的人一年都看到旧的。
   - pos = 照片自己的焦点（object-position）：横幅放进直的格子时留哪一边。
   style：客户在 ① 选了喜欢的风格，自动配图先挑这种风格的照片（model.js 的 likeOf）。
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};
  var L = 'assets/img/lib/';

  var MORE = [
    { id: 'b:land-grassland', src: L + 'land-grassland.jpg', w: 1600, h: 426, series: '', style: '', rooms: ['mood'], en: 'Highland grassland', zh: '高原草地' },
    { id: 'b:land-boards', src: L + 'land-boards.jpg', w: 900, h: 1200, series: '', style: '', rooms: ['mood'], en: 'Timber boards in the open', zh: '旷野里的木板' },
    { id: 'b:land-hills', src: L + 'land-hills.jpg', w: 1600, h: 947, series: '', style: '', rooms: ['mood'], en: 'Distant hills', zh: '远山' },
    { id: 'b:craft-touch', src: L + 'craft-touch.jpg', w: 862, h: 438, series: '', style: '', rooms: ['mood'], en: 'A hand on the boards', zh: '手摸板材' },
    // 骨骼线高柜（skeleton-kitchen-3）下缘裁出来、放大过的：档案 1600 宽，实际只有约 595 × 352 —— 写真的大小，挑图才不会把它放上整页
    { id: 'b:detail-corner', src: L + 'detail-corner.jpg', w: 595, h: 352, series: 'skeleton', style: '', rooms: ['mood'], en: 'Cabinet corner detail', zh: '柜角细节' },
    { id: 'b:craft-inspect', src: L + 'craft-inspect.jpg', w: 843, h: 498, series: '', style: '', rooms: ['mood'], en: 'Quality inspection', zh: '质检' },
    { id: 'b:craft-pack', src: L + 'craft-pack.jpg', w: 843, h: 498, series: '', style: '', rooms: ['mood'], en: 'Careful packing', zh: '包装' },
    { id: 'b:store-entrance', src: L + 'store-entrance.jpg', w: 929, h: 1038, series: '', style: '', rooms: ['mood'], en: 'The SAIL entrance', zh: '溪岸门口' },
    { id: 'b:skeleton-kitchen', src: L + 'skeleton-kitchen.jpg', w: 889, h: 480, series: 'skeleton', style: '', rooms: ['kitchen'], en: 'Skeleton Line kitchen', zh: '骨骼线厨房' },
    { id: 'b:skeleton-kitchen-2', src: L + 'skeleton-kitchen-2.jpg', w: 889, h: 1037, series: 'skeleton', style: '', rooms: ['kitchen'], pos: '40% 50%', en: 'Skeleton Line kitchen detail', zh: '骨骼线厨房细节' },
    { id: 'b:skeleton-kitchen-3', src: L + 'skeleton-kitchen-3.jpg', w: 681, h: 1038, series: 'skeleton', style: '', rooms: ['kitchen'], en: 'Skeleton Line tall units', zh: '骨骼线高柜' },
    { id: 'b:skeleton-kitchen-dining', src: L + 'skeleton-kitchen-dining.jpg', w: 1600, h: 947, series: 'skeleton', style: '', rooms: ['kitchen', 'dining'], en: 'Skeleton Line kitchen and dining', zh: '骨骼线厨房与餐厅' },
    { id: 'b:natural-kitchen', src: L + 'natural-kitchen.jpg', w: 1600, h: 798, series: '', style: '', rooms: ['kitchen'], en: 'Natural Line kitchen', zh: '自然线厨房' },
    { id: 'b:mountain-living', src: L + 'mountain-living.jpg', w: 892, h: 484, series: 'mountain', style: '', rooms: ['living'], en: 'Empty Mountain living room', zh: '空山客厅' },
    { id: 'b:mountain-shelf', src: L + 'mountain-shelf.jpg', w: 900, h: 1051, series: 'mountain', style: '', rooms: ['study', 'living'], pos: '45% 50%', en: 'Empty Mountain shelving', zh: '空山书架' },
    { id: 'b:mountain-shelf-2', src: L + 'mountain-shelf-2.jpg', w: 681, h: 1038, series: 'mountain', style: '', rooms: ['study'], en: 'Empty Mountain open shelves', zh: '空山层架' },
    { id: 'b:mountain-living-2', src: L + 'mountain-living-2.jpg', w: 1600, h: 948, series: 'mountain', style: '', rooms: ['living'], en: 'Empty Mountain living room, wide', zh: '空山客厅全景' },
    { id: 'b:mountain-living-3', src: L + 'mountain-living-3.jpg', w: 889, h: 1038, series: 'mountain', style: '', rooms: ['living'], en: 'Empty Mountain lounge', zh: '空山沙发区' },
    { id: 'b:weaving-wardrobe', src: L + 'weaving-wardrobe.jpg', w: 892, h: 484, series: 'weaving', style: '', rooms: ['master', 'walkin'], pos: '30% 50%', en: 'Weaving walk-in wardrobe', zh: '织系列衣帽间' },
    { id: 'b:misty-living', src: L + 'misty-living.jpg', w: 1600, h: 607, series: 'misty', style: '', rooms: ['living'], en: 'Misty Mountain living room', zh: '雾山客厅' },
    { id: 'b:misty-study', src: L + 'misty-study.jpg', w: 895, h: 1038, series: 'misty', style: '', rooms: ['study'], pos: '55% 50%', en: 'Misty Mountain study', zh: '雾山书房' },
    // skeleton-1（溪岸官网骨骼线那一间：客厅木饰墙、通顶柜与过道）的左半边、放大过的：同一张照片，系列、空间都跟着原图
    // （骨骼线、客厅 —— 不是玄关）；id 沿用旧的，存档才认得；档案 842 宽，实际只有约 509 × 628
    { id: 'b:misty-corridor', src: L + 'misty-corridor.jpg', w: 509, h: 628, series: 'skeleton', style: '', rooms: ['living'], en: 'Full-height cabinetry & passage', zh: '通顶柜与过道' },
    { id: 'b:misty-kitchen', src: L + 'misty-kitchen.jpg', w: 1600, h: 798, series: '', style: '', rooms: ['kitchen'], en: 'Walnut kitchen with long island', zh: '胡桃木厨房与长岛台' },
    { id: 'b:misty-bedroom', src: L + 'misty-bedroom.jpg', w: 1600, h: 1067, series: 'misty', style: '', rooms: ['living'], en: 'Warm-wood lounge', zh: '原木起居' },
    { id: 'b:door-home', src: L + 'door-home.jpg', w: 1080, h: 1440, series: '', style: '', rooms: ['foyer'], en: 'Doors at home', zh: '房门与家' },
    { id: 'b:cabinet-doors', src: L + 'cabinet-doors.jpg', w: 1200, h: 800, series: '', style: '', rooms: ['living'], en: 'Cabinet door collection', zh: '柜门系列' },
    { id: 'b:bed-platform', src: L + 'bed-platform.jpg', w: 1016, h: 1038, series: '', style: '', rooms: ['master', 'guest'], en: 'Custom bed collection', zh: '定制床系列' },
    { id: 'b:wall-panel-2', src: L + 'wall-panel-2.jpg', w: 1080, h: 1440, series: '', style: '', rooms: ['living'], en: 'Wall panels and doors', zh: '护墙与门' },
    { id: 'b:kitchen-wood', src: L + 'kitchen-wood.jpg', w: 1015, h: 1038, series: '', style: '', rooms: ['kitchen'], en: 'Kitchen collection', zh: '橱柜系列' },
    { id: 'b:wardrobe-white', src: L + 'wardrobe-white.jpg', w: 1016, h: 1039, series: '', style: '', rooms: ['master', 'bedroom', 'guest'], en: 'Wardrobe collection', zh: '衣柜系列' },
    { id: 'b:style-overview', src: L + 'style-overview.jpg', w: 1600, h: 605, series: '', style: '', rooms: ['living'], en: 'Styles at a glance', zh: '风格展示' },
    { id: 'b:style-french-cabinet', src: L + 'style-french-cabinet.jpg', w: 1080, h: 1440, series: '', style: 'french', rooms: ['dining', 'living'], en: 'Light French arched cabinet', zh: '轻法式拱形柜' },
    { id: 'b:style-midcentury-kitchen', src: L + 'style-midcentury-kitchen.jpg', w: 1014, h: 1039, series: '', style: 'midcentury', rooms: ['kitchen'], en: 'Mid-century kitchen', zh: '中古厨房' },
    { id: 'b:style-wood-living', src: L + 'style-wood-living.jpg', w: 1017, h: 1038, series: '', style: 'wood', rooms: ['living'], en: 'Natural wood living room', zh: '原木客厅' },
    { id: 'b:style-wood-dining', src: L + 'style-wood-dining.jpg', w: 1080, h: 1440, series: '', style: 'wood', rooms: ['dining'], en: 'Natural wood dining', zh: '原木餐厅' },
    { id: 'b:style-cream-dining', src: L + 'style-cream-dining.jpg', w: 1016, h: 1037, series: '', style: 'cream', rooms: ['dining'], en: 'Cream-style dining', zh: '奶油风餐厅' },
    { id: 'b:style-wabi-cabinet', src: L + 'style-wabi-cabinet.jpg', w: 1016, h: 1039, series: '', style: 'wabi', rooms: ['dining', 'living'], en: 'Subtle wabi-sabi cabinetry', zh: '微侘寂柜' }
  ];

  MB.BUILTIN = (MB.BUILTIN || []).concat(MORE);

  /* 拿掉的照片（老板 2026-11-04）：不是溪岸的作品（瑞吉欧斗柜）、老板退回的雾山卧室（#54）、手册 PDF 里没印出来的图。
     图库、自动配图都看不到；旧方案里放了的照样认得（不破图），体检提醒换掉。档案留着、不改名。
     retired：riccione = 瑞吉欧的家具（体检红色）· owner = 老板退回的 · unprinted = 手册没印出来的（体检黄色） */
  function gone(id, src, w, h, kind) {
    return { id: id, src: src, w: w, h: h, series: '', style: '', rooms: [], retired: kind, en: 'Retired photo', zh: '已拿掉的照片' };
  }
  MB.RETIRED_BUILTIN = [
    gone('b:skeleton-5', 'assets/img/cases/skeleton-5.jpg', 1000, 1872, 'riccione'),
    gone('b:detail', 'assets/img/scene-detail.jpg', 1000, 1337, 'riccione'),
    gone('b:misty-2', 'assets/img/cases/misty-2.jpg', 821, 1280, 'owner'),
    gone('b:misty-dining', L + 'misty-dining.jpg', 1600, 605, 'unprinted'),
    gone('b:misty-lounge', L + 'misty-lounge.jpg', 890, 1038, 'unprinted'),
    gone('b:misty-living-wide', L + 'misty-living-wide.jpg', 1600, 605, 'unprinted'),
    gone('b:wall-panel', L + 'wall-panel.jpg', 1600, 1067, 'unprinted'),
    gone('b:door-hidden', L + 'door-hidden.jpg', 1600, 643, 'unprinted'),
    gone('b:style-french-dining', L + 'style-french-dining.jpg', 1096, 1500, 'unprinted')
  ];

  /* 图库的分类多一个「氛围 · 风景」 */
  if (MB.TAGS && !MB.TAGS.some(function (t) { return t.key === 'mood'; })) {
    MB.TAGS.push({ key: 'mood', en: 'Mood & landscape', zh: '氛围 · 风景' });
  }
})();
