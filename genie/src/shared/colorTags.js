// 雷区颜色：每个材质明确登记它属于哪个色系，不再从 HSL 去猜。
// （猜的结果：雾粉被当成「红」、浅橡木被当成「黄」—— 避开米黄会把家变粉，避开粉色、绿色却什么都没换。）
//
// 规则：
//   · 木头没有色系；只有胡桃、烟熏橡、樱桃、乌木算「深木色」。
//   · 灰 / 黑仍按明度算（moods.js tagsOf），质感标签（亮面、大理石纹、丝绒…）也照旧。
//   · 新加材质时在这里补一行 —— profile.test.mjs 会检查每个材质都登记过；没登记的才退回按颜色猜。

/** 雷区里的「颜色」类选项（和 flow.js NOGO_COLORS 的 v 一一对应） */
export const COLOR_FAMILIES = ['white', 'beige', 'grey', 'black', 'darkwood', 'pink', 'green', 'blue', 'yellow', 'red'];

/** 有明显色相的色系：替换材质时不能凭空多出来（避开米黄，不该换成雾粉） */
export const CHROMATIC = ['pink', 'green', 'blue', 'yellow', 'red'];

/** 按明度算出来的深浅（不是色系）：没有颜色的材质可以换成灰 / 黑，但不能换成有色系的 */
export const SHADES = ['grey', 'black'];

const FAMILY = {
  pink: ['blush', 'blush-boucle'],
  green: ['sage', 'sage-lacquer', 'sage-linen', 'zellige-sage', 'olive', 'verde', 'emerald-velvet'],
  beige: ['warm-white', 'oat', 'sand-limewash', 'cream-lacquer', 'cream-tile', 'linen', 'boucle', 'oat-knit', 'travertine', 'calacatta', 'latte', 'quartz-travertine', 'quartz-calacatta'],
  white: ['gallery-white', 'white-lacquer', 'cotton-white', 'carrara', 'zellige-white', 'quartz-white'],
  yellow: ['ochre-velvet', 'brass'],
  red: ['terracotta', 'terracotta-tile', 'rust-wool'],
  blue: ['dusty-blue', 'navy-paint', 'navy-velvet'],
  darkwood: ['walnut', 'smoked-oak', 'cherry', 'ebony-oak'],
};

/** 登记过、但不属于任何色系的材质（浅色木头、水磨石、灰 / 黑系、皮革、藤编、金属…） */
const NONE = [
  'white-oak', 'maple', 'light-oak', 'herringbone-oak', 'greige-oak', 'teak',
  'terrazzo', 'microcement', 'sintered', 'sintered-light', 'nero',
  'grey-tile',
  'charcoal', 'black-matte',
  'grey-wool', 'rattan', 'cognac-leather', 'charcoal-felt', 'black-leather',
  'bronze', 'steel', 'gunmetal', 'matte-black',
];

/** 黄铜同时算「金色」 */
const EXTRA = { brass: ['gold'] };

/** 材质 id → 色系标签数组（空数组 = 登记过、没有色系） */
export const COLOR_TAGS = {};
for (const id of NONE) COLOR_TAGS[id] = [];
for (const [fam, ids] of Object.entries(FAMILY)) for (const id of ids) (COLOR_TAGS[id] ||= []).push(fam);
for (const [id, extra] of Object.entries(EXTRA)) (COLOR_TAGS[id] ||= []).push(...extra);
