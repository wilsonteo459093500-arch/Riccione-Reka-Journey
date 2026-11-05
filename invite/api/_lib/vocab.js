/* ============================================================
   案例库 · 词表（唯一来源）
   ------------------------------------------------------------
   风格、柜类、空间、房型、家庭特点 —— 上传 / 审核 / VISI 全部用这里的 key。
   浏览器版是 assets/js/visi/case-vocab.js，内容必须一模一样
   （tools/caselib/test/vocab.test.mjs 会逐项比对，改一边就要改另一边）。

   match 是「不分大小写」的正规式原文（字串，不是 RegExp）：
   两边都能 JSON 比对；用来从需求卡 / 文件夹名认出 key。
   多个都对上时取第一个，所以排列顺序有意义（例：半独立 要排在 独立 前面）。
   ============================================================ */

// 风格：暂定九种，看完 100 张样本再定。series = 对应溪岸的五个系列（MB.SERIES）
export const CASE_STYLES = [
  { key: 'wood', zh: '原木', en: 'Natural wood', series: 'misty', match: '原木|natural wood' },
  { key: 'wabi', zh: '微侘寂', en: 'Subtle wabi-sabi', series: 'wabi', match: '侘寂|wabi' },
  { key: 'cream', zh: '奶油风', en: 'Cream style', series: 'misty', match: '奶油|cream' },
  { key: 'french', zh: '轻法式', en: 'Light French', series: 'weaving', match: '法式|french' },
  { key: 'midcentury', zh: '中古', en: 'Mid-century', series: 'weaving', match: '中古|mid-?century|vintage' },
  { key: 'modern', zh: '现代简约', en: 'Modern minimal', series: 'skeleton', match: '现代简约|简约|modern minimal|minimalis' },
  { key: 'japandi', zh: '日式', en: 'Japandi', series: 'misty', match: '日式|japandi|japanese' },
  { key: 'nordic', zh: '北欧', en: 'Nordic', series: 'misty', match: '北欧|nordic|scandi' },
  { key: 'luxe', zh: '轻奢', en: 'Modern luxe', series: 'mountain', match: '轻奢|luxe|luxury' }
];

// 柜类：老板确认的 15 种。rooms = 这种柜子通常出现在哪些空间（MB.ROOM 的 key）；空 = 不限空间
export const CASE_CABINETS = [
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

// 照片的空间：VISI 的 13 个 MB.ROOM key，加上 other（拍不出是哪里的）
export const CASE_ROOMS = ['foyer', 'living', 'dining', 'kitchen', 'laundry', 'master', 'walkin', 'vanity',
  'bathroom', 'bedroom', 'study', 'altar', 'guest', 'other'];

// 房型（空字串 = 不知道）。半独立排在独立前面：「半独立」也含「独立」两个字
export const CASE_PTYPES = [
  { key: 'condo', zh: '公寓', en: 'Condo', match: 'condo|公寓|apartment|serviced' },
  { key: 'landed', zh: '有地', en: 'Landed', match: 'landed|有地' },
  { key: 'terrace', zh: '排屋', en: 'Terrace', match: 'terrace|排屋|link house' },
  { key: 'semid', zh: '半独立', en: 'Semi-D', match: 'semi-?d|半独立' },
  { key: 'bungalow', zh: '独立', en: 'Bungalow', match: 'bungalow|独立' }
];

// 家庭特点：key 就是 copy.js MB.caseNote 认得的 TRAIT（对需求卡的 need key），match 也照抄那边
export const CASE_TRAITS = [
  { key: 'elderly', zh: '长辈同住', en: 'Parents at home', match: '长辈|elder|parent' },
  { key: 'kids', zh: '有小孩', en: 'Kids', match: '孩子|小孩|kid|child' },
  { key: 'pets', zh: '养宠物', en: 'Pets', match: '宠物|pet' },
  { key: 'helper', zh: '有帮佣', en: 'Helper', match: '帮佣|helper|maid' }
];

// 需求卡「定制范围」→ 柜类（对上 match 的都算；全屋 = 常见的几种）
export const SCOPE_CABINETS = [
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
export const CASE_STATUS = ['new', 'auto', 'unsure', 'confirmed'];

function find(list, key) {
  for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
  return null;
}
export function caseStyle(key) { return find(CASE_STYLES, key); }
export function caseCabinet(key) { return find(CASE_CABINETS, key); }
export function seriesOf(styleKey) { var s = find(CASE_STYLES, styleKey); return s ? s.series : ''; }

// 需求卡的定制范围（字串或字串阵列）→ 柜类 key，按词表顺序、不重复
export function scopeCabinets(scopes) {
  var text = [].concat(scopes || []).join(' \n ');
  var on = {};
  SCOPE_CABINETS.forEach(function (s) {
    if (new RegExp(s.match, 'i').test(text)) s.cabinets.forEach(function (c) { on[c] = 1; });
  });
  return CASE_CABINETS.filter(function (c) { return on[c.key]; }).map(function (c) { return c.key; });
}

// 写入时的验证用
export const isStyle = (k) => !!caseStyle(k);
export const isCabinet = (k) => !!caseCabinet(k);
export const isRoom = (k) => CASE_ROOMS.indexOf(k) >= 0;
export const isPtype = (k) => !!find(CASE_PTYPES, k);
export const isTrait = (k) => !!find(CASE_TRAITS, k);
export const isStatus = (k) => CASE_STATUS.indexOf(k) >= 0;
