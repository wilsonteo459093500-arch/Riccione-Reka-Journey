/* ============================================================
   VISI · 更多内置照片（溪岸 2025 品牌手册里的实拍）
   ------------------------------------------------------------
   老板给的品牌手册（PDF）抽出来的 44 张：五个系列、五种风格
   （轻法式 french · 中古 midcentury · 原木 wood · 奶油风 cream · 微侘寂 wabi）、
   六类产品（房门、柜门、定制床、护墙、橱柜、衣柜），加上风景与工艺细节。
   - 空间照：加进 MB.BUILTIN，自动配图和图库都用得到 —— 每个空间能挑的图多一倍。
   - 氛围照（rooms: ['mood']）：开场短话、章节页、封底这类情绪页轮着用，
     不会每一份方案都同一张（见 model.js 的 MB.pageImage）。
   style 先记下来，案例库做好后「按风格找图」会用到。
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};
  var L = 'assets/img/lib/';

  var MORE = [
    { id: 'b:land-grassland', src: L + 'land-grassland.jpg', w: 1600, h: 930, series: '', style: '', rooms: ['mood'], en: 'Highland grassland', zh: '高原草地' },
    { id: 'b:land-boards', src: L + 'land-boards.jpg', w: 900, h: 1200, series: '', style: '', rooms: ['mood'], en: 'Timber boards in the open', zh: '旷野里的木板' },
    { id: 'b:land-hills', src: L + 'land-hills.jpg', w: 1600, h: 947, series: '', style: '', rooms: ['mood'], en: 'Distant hills', zh: '远山' },
    { id: 'b:craft-touch', src: L + 'craft-touch.jpg', w: 862, h: 438, series: '', style: '', rooms: ['mood'], en: 'A hand on the boards', zh: '手摸板材' },
    { id: 'b:detail-corner', src: L + 'detail-corner.jpg', w: 1600, h: 947, series: 'skeleton', style: '', rooms: ['mood'], en: 'Cabinet corner detail', zh: '柜角细节' },
    { id: 'b:craft-inspect', src: L + 'craft-inspect.jpg', w: 843, h: 498, series: '', style: '', rooms: ['mood'], en: 'Quality inspection', zh: '质检' },
    { id: 'b:craft-pack', src: L + 'craft-pack.jpg', w: 843, h: 498, series: '', style: '', rooms: ['mood'], en: 'Careful packing', zh: '包装' },
    { id: 'b:store-entrance', src: L + 'store-entrance.jpg', w: 929, h: 1038, series: '', style: '', rooms: ['mood'], en: 'The SAIL entrance', zh: '溪岸门口' },
    { id: 'b:skeleton-kitchen', src: L + 'skeleton-kitchen.jpg', w: 889, h: 480, series: 'skeleton', style: '', rooms: ['kitchen'], en: 'Skeleton Line kitchen', zh: '骨骼线厨房' },
    { id: 'b:skeleton-kitchen-2', src: L + 'skeleton-kitchen-2.jpg', w: 889, h: 1037, series: 'skeleton', style: '', rooms: ['kitchen'], en: 'Skeleton Line kitchen detail', zh: '骨骼线厨房细节' },
    { id: 'b:skeleton-sideboard', src: L + 'skeleton-sideboard.jpg', w: 1044, h: 685, series: 'skeleton', style: '', rooms: ['dining', 'living'], en: 'Skeleton Line sideboard', zh: '骨骼线边柜' },
    { id: 'b:skeleton-kitchen-3', src: L + 'skeleton-kitchen-3.jpg', w: 681, h: 1038, series: 'skeleton', style: '', rooms: ['kitchen'], en: 'Skeleton Line tall units', zh: '骨骼线高柜' },
    { id: 'b:skeleton-kitchen-dining', src: L + 'skeleton-kitchen-dining.jpg', w: 1600, h: 947, series: 'skeleton', style: '', rooms: ['kitchen', 'dining'], en: 'Skeleton Line kitchen and dining', zh: '骨骼线厨房与餐厅' },
    { id: 'b:natural-kitchen', src: L + 'natural-kitchen.jpg', w: 1600, h: 798, series: 'skeleton', style: '', rooms: ['kitchen'], en: 'Natural Line kitchen', zh: '自然线厨房' },
    { id: 'b:mountain-living', src: L + 'mountain-living.jpg', w: 892, h: 484, series: 'mountain', style: '', rooms: ['living'], en: 'Empty Mountain living room', zh: '空山客厅' },
    { id: 'b:mountain-shelf', src: L + 'mountain-shelf.jpg', w: 900, h: 1051, series: 'mountain', style: '', rooms: ['study', 'living'], en: 'Empty Mountain shelving', zh: '空山书架' },
    { id: 'b:mountain-shelf-2', src: L + 'mountain-shelf-2.jpg', w: 681, h: 1038, series: 'mountain', style: '', rooms: ['study'], en: 'Empty Mountain open shelves', zh: '空山层架' },
    { id: 'b:mountain-living-2', src: L + 'mountain-living-2.jpg', w: 1600, h: 948, series: 'mountain', style: '', rooms: ['living'], en: 'Empty Mountain living room, wide', zh: '空山客厅全景' },
    { id: 'b:mountain-living-3', src: L + 'mountain-living-3.jpg', w: 889, h: 1038, series: 'mountain', style: '', rooms: ['living'], en: 'Empty Mountain lounge', zh: '空山沙发区' },
    { id: 'b:weaving-wardrobe', src: L + 'weaving-wardrobe.jpg', w: 892, h: 484, series: 'weaving', style: '', rooms: ['master', 'walkin'], en: 'Weaving walk-in wardrobe', zh: '织系列衣帽间' },
    { id: 'b:misty-dining', src: L + 'misty-dining.jpg', w: 1600, h: 605, series: 'misty', style: '', rooms: ['dining'], en: 'Misty Mountain dining', zh: '雾山餐厅' },
    { id: 'b:misty-living', src: L + 'misty-living.jpg', w: 1600, h: 607, series: 'misty', style: '', rooms: ['living'], en: 'Misty Mountain living room', zh: '雾山客厅' },
    { id: 'b:misty-lounge', src: L + 'misty-lounge.jpg', w: 890, h: 1038, series: 'misty', style: '', rooms: ['living'], en: 'Misty Mountain reading corner', zh: '雾山休闲角' },
    { id: 'b:misty-study', src: L + 'misty-study.jpg', w: 895, h: 1038, series: 'misty', style: '', rooms: ['study'], en: 'Misty Mountain study', zh: '雾山书房' },
    { id: 'b:misty-corridor', src: L + 'misty-corridor.jpg', w: 842, h: 1039, series: 'misty', style: '', rooms: ['foyer'], en: 'Misty Mountain corridor', zh: '雾山走廊' },
    { id: 'b:misty-kitchen', src: L + 'misty-kitchen.jpg', w: 1600, h: 798, series: 'misty', style: '', rooms: ['kitchen'], en: 'Misty Mountain kitchen', zh: '雾山厨房' },
    { id: 'b:misty-living-wide', src: L + 'misty-living-wide.jpg', w: 1600, h: 605, series: 'misty', style: '', rooms: ['living'], en: 'Warm-wood living room', zh: '原木客厅' },
    { id: 'b:misty-bedroom', src: L + 'misty-bedroom.jpg', w: 1600, h: 1067, series: 'misty', style: '', rooms: ['master', 'living'], en: 'Warm-wood lounge', zh: '原木起居' },
    { id: 'b:door-hidden', src: L + 'door-hidden.jpg', w: 1600, h: 643, series: 'misty', style: '', rooms: ['foyer'], en: 'Door collection', zh: '房门系列' },
    { id: 'b:door-home', src: L + 'door-home.jpg', w: 1080, h: 1440, series: '', style: '', rooms: ['foyer'], en: 'Doors at home', zh: '房门与家' },
    { id: 'b:cabinet-doors', src: L + 'cabinet-doors.jpg', w: 1200, h: 800, series: '', style: '', rooms: ['living'], en: 'Cabinet door collection', zh: '柜门系列' },
    { id: 'b:bed-platform', src: L + 'bed-platform.jpg', w: 1016, h: 1038, series: 'wabi', style: '', rooms: ['master', 'guest'], en: 'Custom bed collection', zh: '定制床系列' },
    { id: 'b:wall-panel', src: L + 'wall-panel.jpg', w: 1600, h: 1067, series: 'mountain', style: '', rooms: ['living'], en: 'Wall panel collection', zh: '护墙系列' },
    { id: 'b:wall-panel-2', src: L + 'wall-panel-2.jpg', w: 1080, h: 1440, series: '', style: '', rooms: ['living'], en: 'Wall panels and doors', zh: '护墙与门' },
    { id: 'b:kitchen-wood', src: L + 'kitchen-wood.jpg', w: 1015, h: 1038, series: 'misty', style: '', rooms: ['kitchen'], en: 'Kitchen collection', zh: '橱柜系列' },
    { id: 'b:wardrobe-white', src: L + 'wardrobe-white.jpg', w: 1016, h: 1039, series: 'misty', style: '', rooms: ['master', 'bedroom', 'guest'], en: 'Wardrobe collection', zh: '衣柜系列' },
    { id: 'b:style-overview', src: L + 'style-overview.jpg', w: 1600, h: 605, series: 'misty', style: '', rooms: ['living'], en: 'Styles at a glance', zh: '风格展示' },
    { id: 'b:style-french-dining', src: L + 'style-french-dining.jpg', w: 1096, h: 1500, series: 'weaving', style: 'french', rooms: ['dining'], en: 'Light French dining', zh: '轻法式餐厅' },
    { id: 'b:style-french-cabinet', src: L + 'style-french-cabinet.jpg', w: 1080, h: 1440, series: 'weaving', style: 'french', rooms: ['dining', 'living'], en: 'Light French arched cabinet', zh: '轻法式拱形柜' },
    { id: 'b:style-midcentury-kitchen', src: L + 'style-midcentury-kitchen.jpg', w: 1014, h: 1039, series: 'weaving', style: 'midcentury', rooms: ['kitchen'], en: 'Mid-century kitchen', zh: '中古厨房' },
    { id: 'b:style-wood-living', src: L + 'style-wood-living.jpg', w: 1017, h: 1038, series: 'misty', style: 'wood', rooms: ['living'], en: 'Natural wood living room', zh: '原木客厅' },
    { id: 'b:style-wood-dining', src: L + 'style-wood-dining.jpg', w: 1080, h: 1440, series: 'misty', style: 'wood', rooms: ['dining'], en: 'Natural wood dining', zh: '原木餐厅' },
    { id: 'b:style-cream-dining', src: L + 'style-cream-dining.jpg', w: 1016, h: 1037, series: 'misty', style: 'cream', rooms: ['dining'], en: 'Cream-style dining', zh: '奶油风餐厅' },
    { id: 'b:style-wabi-cabinet', src: L + 'style-wabi-cabinet.jpg', w: 1016, h: 1039, series: 'wabi', style: 'wabi', rooms: ['dining', 'living'], en: 'Subtle wabi-sabi cabinetry', zh: '微侘寂柜' }
  ];

  MB.BUILTIN = (MB.BUILTIN || []).concat(MORE);

  /* 图库的分类多一个「氛围 · 风景」 */
  if (MB.TAGS && !MB.TAGS.some(function (t) { return t.key === 'mood'; })) {
    MB.TAGS.push({ key: 'mood', en: 'Mood & landscape', zh: '氛围 · 风景' });
  }
})();
