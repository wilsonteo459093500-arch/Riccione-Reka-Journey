// 内容色（材质 / 测验刺激 / 光照），不随 VI 换色
// 材质库 —— 测试页（蓝图材质板）与 3D 工作室共用一份。
// 每个材质：名字、类别、程序化贴图参数（textures.js 生成，不用任何图片文件）、
// 物理参数（粗糙度 / 金属度 / 丝绒光泽 / 清漆层），以及「情绪」权重 mood = [cozy, bright, moody]，
// 贴图参数里：木头 species（橡 / 枫 / 胡桃 / 柚 / 樱桃：年轮、导管、射线斑不同），大理石 style，
// 金属 f0（真实的金属反射色；base 仍是 UI 色卡 / 情绪计算用的颜色）。
// warm（-1 冷 … 1 暖）与 light（0 深 … 1 浅）—— 情绪仪表、梦想家配色、雷区替换都靠它们。

import { t, L, isEn } from './i18n.js';
import { bindMatTable, boardFits, boardDefaultSlot } from './boards/library-api.js';

// 溪岸板材（src/shared/boards/）：登记表在 library-api.js，这里只是转出去 —— 板材在 MAT_BY_ID 里，不在 MATERIALS 里。
// 随网站的板材库（library.js）不在这里 import：用到的地方 await boards/bundled.js 的 bundledBoards()（客人的测验不下载它）
export { BOARD_SLOTS, BOARDS, BOARD_BY_ID, registerBoards, unregisterBoards, boardOf, isBoard, onBoards, boardsVersion, boardsFor, boardInfo } from './boards/library-api.js';

/** 可以换材质的「表面」。cats = 这个表面接受哪些类别的材质；not = 同类别里不接受的质感（tex.type：皮革不做床品、窗帘，藤编不做软包） */
export const SLOTS = [
  { id: 'floor', zh: '地板', en: 'FLOOR', cats: ['wood', 'stone', 'tile'], weight: 0.2 },
  { id: 'walls', zh: '墙面', en: 'WALLS', cats: ['paint'], weight: 0.2 },
  { id: 'feature', zh: '主题墙', en: 'FEATURE WALL', cats: ['wood', 'paint', 'stone'], weight: 0.09 },
  { id: 'cabinetry', zh: '柜体', en: 'CABINETRY', cats: ['wood', 'paint'], weight: 0.12 },
  { id: 'countertop', zh: '台面', en: 'COUNTERTOP', cats: ['stone'], weight: 0.04 },
  { id: 'tile', zh: '厨卫墙地砖', en: 'WET TILE', cats: ['tile', 'stone'], weight: 0.03 },
  { id: 'upholstery', zh: '沙发软包', en: 'UPHOLSTERY', cats: ['fabric'], not: ['rattan'], weight: 0.1 },
  { id: 'bedding', zh: '床品', en: 'BEDDING', cats: ['fabric'], not: ['leather', 'rattan'], weight: 0.04 },
  { id: 'rugs', zh: '地毯', en: 'RUGS', cats: ['fabric'], weight: 0.06 },
  { id: 'woodwork', zh: '木作家具', en: 'WOODWORK', cats: ['wood', 'paint'], weight: 0.05 },
  { id: 'accents', zh: '点缀', en: 'ACCENTS', cats: ['fabric'], weight: 0.03 },
  { id: 'curtains', zh: '窗帘', en: 'CURTAINS', cats: ['fabric'], not: ['leather', 'rattan'], weight: 0.02 },
  { id: 'metal', zh: '五金灯具', en: 'METAL', cats: ['metal'], weight: 0.02 },
];
export const SLOT_BY_ID = Object.fromEntries(SLOTS.map((s) => [s.id, s]));

export const CATEGORIES = [
  { id: 'wood', zh: '木', en: 'Wood' },
  { id: 'stone', zh: '石', en: 'Stone' },
  { id: 'tile', zh: '砖', en: 'Tile' },
  { id: 'fabric', zh: '布', en: 'Fabric' },
  { id: 'paint', zh: '漆', en: 'Paint' },
  { id: 'metal', zh: '金属', en: 'Metal' },
];

// m(id, zh, en, cat, tex, phys, mood[cozy,bright,moody], warm, light)
const m = (id, zh, en, cat, tex, phys, mood, warm, light) => ({
  id,
  zh,
  en,
  cat,
  tex,
  rough: phys.rough ?? 0.7,
  metal: phys.metal ?? 0,
  sheen: phys.sheen ?? 0,
  clearcoat: phys.clearcoat ?? 0,
  ccRough: phys.ccRough ?? 0.08, // 清漆层自己的粗糙度（烤漆、抛光石材、釉面很低）
  color: tex.base,
  mood,
  warm,
  light,
});

export const MATERIALS = [
  // ── 木 Wood ──────────────────────────────────────────────
  m('white-oak', '白橡', 'White oak', 'wood', { type: 'wood', base: '#D8C2A0', grain: '#B49470', species: 'oak' }, { rough: 0.62 }, [0.45, 0.9, 0], 0.2, 0.8),
  m('maple', '枫木', 'Maple', 'wood', { type: 'wood', base: '#E2CDAA', grain: '#C4A57C', species: 'maple' }, { rough: 0.6 }, [0.5, 0.9, 0], 0.35, 0.85),
  m('light-oak', '浅川橡', 'Natural oak', 'wood', { type: 'wood', base: '#C8A272', grain: '#9F784A', species: 'oak' }, { rough: 0.6 }, [0.72, 0.68, 0.05], 0.5, 0.65),
  m('herringbone-oak', '人字拼橡木', 'Herringbone oak', 'wood', { type: 'wood', base: '#C29866', grain: '#94693D', pattern: 'herringbone', species: 'oak' }, { rough: 0.58 }, [0.8, 0.55, 0.1], 0.55, 0.6),
  m('greige-oak', '灰橡', 'Greige oak', 'wood', { type: 'wood', base: '#B2A491', grain: '#877A69', species: 'oak' }, { rough: 0.64 }, [0.35, 0.62, 0.28], 0, 0.6),
  m('teak', '柚木', 'Teak', 'wood', { type: 'wood', base: '#A66E3D', grain: '#744522', species: 'teak' }, { rough: 0.55 }, [0.9, 0.3, 0.25], 0.8, 0.45),
  m('cherry', '樱桃木', 'Cherry', 'wood', { type: 'wood', base: '#985436', grain: '#68331E', species: 'cherry' }, { rough: 0.5 }, [0.8, 0.2, 0.42], 0.85, 0.35),
  m('smoked-oak', '烟熏橡', 'Smoked oak', 'wood', { type: 'wood', base: '#866043', grain: '#583B25', species: 'oak' }, { rough: 0.6 }, [0.85, 0.2, 0.38], 0.55, 0.35),
  m('walnut', '胡桃木', 'Walnut', 'wood', { type: 'wood', base: '#694330', grain: '#3F2618', species: 'walnut' }, { rough: 0.5 }, [0.7, 0.1, 0.62], 0.6, 0.25),
  m('ebony-oak', '乌木', 'Ebonized oak', 'wood', { type: 'wood', base: '#2F2723', grain: '#181210', species: 'oak' }, { rough: 0.55 }, [0.25, 0, 1], 0.2, 0.08),

  // ── 石 Stone ─────────────────────────────────────────────
  m('carrara', '卡拉拉白', 'Carrara marble', 'stone', { type: 'marble', base: '#E9E7E2', vein: '#8F9094', veins: 0.55, style: 'carrara' }, { rough: 0.24, clearcoat: 0.5, ccRough: 0.06 }, [0.15, 0.95, 0.15], -0.2, 0.9),
  m('calacatta', '金线白', 'Calacatta gold', 'stone', { type: 'marble', base: '#EFE9DE', vein: '#AE8F5D', veins: 0.65, style: 'calacatta' }, { rough: 0.22, clearcoat: 0.55, ccRough: 0.05 }, [0.42, 0.88, 0.12], 0.3, 0.9),
  m('travertine', '洞石', 'Travertine', 'stone', { type: 'travertine', base: '#D6C1A0', vein: '#B79E7A' }, { rough: 0.58 }, [0.82, 0.6, 0.1], 0.6, 0.7),
  m('terrazzo', '水磨石', 'Terrazzo', 'stone', { type: 'terrazzo', base: '#E8E3D9', chips: ['#B8B1A4', '#8C8478', '#C98A6A', '#6E7F73', '#F6F3EE'] }, { rough: 0.4 }, [0.45, 0.85, 0.05], 0.1, 0.85),
  m('microcement', '微水泥', 'Microcement', 'stone', { type: 'concrete', base: '#9D9992' }, { rough: 0.68 }, [0.22, 0.4, 0.6], -0.1, 0.5),
  m('sintered', '岩板灰', 'Sintered stone', 'stone', { type: 'concrete', base: '#5F5E5B', fine: true }, { rough: 0.55 }, [0.1, 0.18, 0.88], -0.2, 0.3),
  m('verde', '绿大理石', 'Verde marble', 'stone', { type: 'marble', base: '#2E4A3E', vein: '#C5D3C8', veins: 0.7, style: 'verde' }, { rough: 0.2, clearcoat: 0.6, ccRough: 0.05 }, [0.32, 0.1, 0.85], -0.2, 0.2),
  m('nero', '黑金花', 'Nero marquina', 'stone', { type: 'marble', base: '#1F1E20', vein: '#E6E0D6', veins: 0.6, style: 'nero' }, { rough: 0.2, clearcoat: 0.6, ccRough: 0.05 }, [0.12, 0, 1], -0.1, 0.06),
  // 人造石台面：天天爆炒、家里有小孩时，profile.js lifestyleSwaps 把天然石台面换成它们（花色接近，不怕油渍渗色）
  m('quartz-travertine', '石英石·洞石纹', 'Quartz, travertine look', 'stone', { type: 'travertine', base: '#D6C1A0', vein: '#B79E7A', fill: 1 }, { rough: 0.45 }, [0.78, 0.62, 0.08], 0.55, 0.7),
  m('quartz-calacatta', '石英石·金线白纹', 'Quartz, Calacatta look', 'stone', { type: 'marble', base: '#F0EBE2', vein: '#B39668', style: 'quartz' }, { rough: 0.3, clearcoat: 0.35, ccRough: 0.08 }, [0.4, 0.86, 0.1], 0.25, 0.9),
  m('quartz-white', '纯白石英石', 'Pure white quartz', 'stone', { type: 'concrete', base: '#EEECE7', fine: true, quartz: true }, { rough: 0.32, clearcoat: 0.3, ccRough: 0.1 }, [0.2, 0.92, 0.08], -0.05, 0.93),
  m('sintered-light', '浅色岩板', 'Light sintered stone', 'stone', { type: 'concrete', base: '#D9D6CF', fine: true }, { rough: 0.5 }, [0.25, 0.75, 0.25], -0.05, 0.75),

  // ── 砖 Tile ──────────────────────────────────────────────
  m('zellige-white', '手工白砖', 'Zellige white', 'tile', { type: 'tile', base: '#EDE9E0', grout: '#D6D0C4', size: 0.1, vary: 0.07 }, { rough: 0.2, clearcoat: 0.9, ccRough: 0.04 }, [0.42, 0.9, 0.05], 0.15, 0.9),
  m('zellige-sage', '鼠尾草砖', 'Zellige sage', 'tile', { type: 'tile', base: '#8EA289', grout: '#D4D3C8', size: 0.1, vary: 0.09 }, { rough: 0.2, clearcoat: 0.9, ccRough: 0.04 }, [0.58, 0.48, 0.25], 0, 0.55),
  m('grey-tile', '哑光灰砖', 'Matte grey tile', 'tile', { type: 'tile', base: '#A9A59F', grout: '#8F8B85', size: 0.6, vary: 0.025 }, { rough: 0.7 }, [0.2, 0.5, 0.42], -0.1, 0.55),
  m('cream-tile', '奶油大板砖', 'Cream slab tile', 'tile', { type: 'tile', base: '#E4DACB', grout: '#CFC5B5', size: 0.6, rect: true, vary: 0.02 }, { rough: 0.45 }, [0.6, 0.8, 0.05], 0.4, 0.85),
  m('terracotta-tile', '陶土砖', 'Terracotta tile', 'tile', { type: 'tile', base: '#B4694A', grout: '#CDBDAA', size: 0.2, vary: 0.08 }, { rough: 0.8 }, [0.9, 0.3, 0.22], 0.9, 0.4),

  // ── 漆 Paint / 烤漆 ─────────────────────────────────────
  m('gallery-white', '画廊白', 'Gallery white', 'paint', { type: 'paint', base: '#F0EEE9' }, { rough: 0.92 }, [0.2, 1, 0], 0, 0.95),
  m('warm-white', '暖白', 'Warm white', 'paint', { type: 'paint', base: '#EEE4D3' }, { rough: 0.92 }, [0.55, 0.85, 0], 0.4, 0.9),
  m('sand-limewash', '砂洗石灰', 'Sand limewash', 'paint', { type: 'limewash', base: '#D6C0A0' }, { rough: 0.95 }, [0.9, 0.5, 0.1], 0.6, 0.72),
  m('oat', '燕麦', 'Oat', 'paint', { type: 'paint', base: '#D8CAB3' }, { rough: 0.92 }, [0.75, 0.65, 0.05], 0.45, 0.78),
  m('blush', '雾粉', 'Blush', 'paint', { type: 'paint', base: '#DCBEB3' }, { rough: 0.92 }, [0.72, 0.6, 0.1], 0.5, 0.75),
  m('sage', '鼠尾草绿', 'Sage', 'paint', { type: 'paint', base: '#A7B298' }, { rough: 0.92 }, [0.6, 0.5, 0.2], 0.05, 0.62),
  m('dusty-blue', '雾霾蓝', 'Dusty blue', 'paint', { type: 'paint', base: '#9DAFBC' }, { rough: 0.92 }, [0.3, 0.6, 0.35], -0.5, 0.62),
  m('latte', '奶咖', 'Latte', 'paint', { type: 'limewash', base: '#B59A7E' }, { rough: 0.94 }, [0.8, 0.35, 0.32], 0.55, 0.55),
  m('terracotta', '陶土红', 'Terracotta', 'paint', { type: 'limewash', base: '#B77250' }, { rough: 0.94 }, [0.85, 0.25, 0.35], 0.9, 0.42),
  m('olive', '橄榄绿', 'Olive', 'paint', { type: 'paint', base: '#6D6A4A' }, { rough: 0.9 }, [0.5, 0.1, 0.65], 0.3, 0.3),
  m('navy-paint', '午夜蓝', 'Midnight blue', 'paint', { type: 'paint', base: '#29334A' }, { rough: 0.9 }, [0.2, 0, 1], -0.6, 0.12),
  m('charcoal', '炭灰', 'Charcoal', 'paint', { type: 'paint', base: '#3A3938' }, { rough: 0.9 }, [0.2, 0, 1], 0, 0.12),
  m('white-lacquer', '白色烤漆', 'White lacquer', 'paint', { type: 'paint', base: '#ECEBE7', smooth: true }, { rough: 0.3, clearcoat: 0.8, ccRough: 0.07 }, [0.2, 0.95, 0.05], -0.1, 0.93),
  m('cream-lacquer', '奶油烤漆', 'Cream lacquer', 'paint', { type: 'paint', base: '#EAE0CE', smooth: true }, { rough: 0.32, clearcoat: 0.8, ccRough: 0.07 }, [0.55, 0.85, 0], 0.4, 0.88),
  m('sage-lacquer', '灰绿烤漆', 'Sage lacquer', 'paint', { type: 'paint', base: '#8C9884', smooth: true }, { rough: 0.38, clearcoat: 0.7, ccRough: 0.08 }, [0.55, 0.45, 0.3], 0, 0.55),
  m('black-matte', '黑色哑光', 'Matte black', 'paint', { type: 'paint', base: '#272626', smooth: true }, { rough: 0.72 }, [0.15, 0, 1], 0, 0.06),

  // ── 布 Fabric ────────────────────────────────────────────
  m('cotton-white', '纯白棉', 'White cotton', 'fabric', { type: 'linen', base: '#F3F1EC', fine: true }, { rough: 0.88, sheen: 0.4 }, [0.3, 1, 0], 0.05, 0.97),
  m('linen', '亚麻', 'Linen', 'fabric', { type: 'linen', base: '#E4D9C7' }, { rough: 0.9, sheen: 0.4 }, [0.62, 0.8, 0], 0.4, 0.85),
  m('boucle', '羊羔绒', 'Bouclé', 'fabric', { type: 'boucle', base: '#EEE8DD' }, { rough: 0.95, sheen: 0.7 }, [0.72, 0.8, 0], 0.3, 0.9),
  m('blush-boucle', '雾粉羊羔绒', 'Blush bouclé', 'fabric', { type: 'boucle', base: '#E2C4B8' }, { rough: 0.95, sheen: 0.7 }, [0.78, 0.6, 0.05], 0.5, 0.76),
  m('oat-knit', '燕麦针织', 'Oat knit', 'fabric', { type: 'knit', base: '#D8CBB4' }, { rough: 0.95, sheen: 0.6 }, [0.85, 0.55, 0.05], 0.45, 0.78),
  m('grey-wool', '灰羊毛', 'Grey wool', 'fabric', { type: 'felt', base: '#A8A6A1' }, { rough: 0.95, sheen: 0.5 }, [0.38, 0.5, 0.35], -0.1, 0.6),
  m('sage-linen', '鼠尾草亚麻', 'Sage linen', 'fabric', { type: 'linen', base: '#A6B29B' }, { rough: 0.9, sheen: 0.4 }, [0.6, 0.5, 0.15], 0.05, 0.62),
  m('rattan', '藤编', 'Rattan cane', 'fabric', { type: 'rattan', base: '#C69C60' }, { rough: 0.5 }, [0.85, 0.55, 0.05], 0.7, 0.55),
  m('ochre-velvet', '赭黄丝绒', 'Ochre velvet', 'fabric', { type: 'velvet', base: '#C6912E' }, { rough: 0.8, sheen: 1 }, [0.85, 0.35, 0.3], 0.9, 0.5),
  m('rust-wool', '铁锈羊毛', 'Rust wool', 'fabric', { type: 'felt', base: '#B3552E' }, { rough: 0.95, sheen: 0.5 }, [0.9, 0.2, 0.35], 0.95, 0.38),
  m('cognac-leather', '干邑皮革', 'Cognac leather', 'fabric', { type: 'leather', base: '#8C4D2A' }, { rough: 0.42 }, [0.72, 0.15, 0.55], 0.85, 0.3),
  m('emerald-velvet', '祖母绿丝绒', 'Emerald velvet', 'fabric', { type: 'velvet', base: '#1E5345' }, { rough: 0.8, sheen: 1 }, [0.42, 0.05, 0.85], -0.2, 0.18),
  m('navy-velvet', '海军蓝丝绒', 'Navy velvet', 'fabric', { type: 'velvet', base: '#2B3A5E' }, { rough: 0.8, sheen: 1 }, [0.5, 0.05, 0.8], -0.5, 0.15),
  m('charcoal-felt', '炭灰毛毡', 'Charcoal felt', 'fabric', { type: 'felt', base: '#3D3D40' }, { rough: 0.95, sheen: 0.45 }, [0.3, 0, 0.95], 0, 0.14),
  m('black-leather', '黑皮革', 'Black leather', 'fabric', { type: 'leather', base: '#252322' }, { rough: 0.4 }, [0.2, 0, 1], 0, 0.06),

  // ── 金属 Metal ───────────────────────────────────────────
  m('brass', '拉丝黄铜', 'Brushed brass', 'metal', { type: 'metal', base: '#B8914A', f0: '#D8B676' }, { rough: 0.32, metal: 1 }, [0.75, 0.4, 0.4], 0.8, 0.55),
  m('bronze', '古铜', 'Bronze', 'metal', { type: 'metal', base: '#6C4B2F', f0: '#9A7250' }, { rough: 0.4, metal: 1 }, [0.6, 0.1, 0.7], 0.6, 0.3),
  m('steel', '不锈钢', 'Stainless', 'metal', { type: 'metal', base: '#B4B6B8', f0: '#CDD0D3' }, { rough: 0.28, metal: 1 }, [0.1, 0.8, 0.3], -0.3, 0.7),
  m('gunmetal', '枪灰', 'Gunmetal', 'metal', { type: 'metal', base: '#55585C', f0: '#73777C' }, { rough: 0.4, metal: 1 }, [0.15, 0.2, 0.8], -0.2, 0.3),
  m('matte-black', '哑光黑', 'Matte black metal', 'metal', { type: 'metal', base: '#232323' }, { rough: 0.5, metal: 0 }, [0.2, 0.1, 0.9], 0, 0.08),
];

export const MAT_BY_ID = Object.fromEntries(MATERIALS.map((x) => [x.id, x]));
// 板材排在程序化材质后面进 MAT_BY_ID：随网站的那份由 boards/bundled.js 的 bundledBoards() 登记，
// 这台设备导入的由 boards/device.js 的 boardsReady() 登记（都是用到的时候才读）
bindMatTable(MAT_BY_ID);

export function matOf(id) {
  return MAT_BY_ID[id] || null;
}

/** 某材质能不能放到某表面 */
export function fits(matId, slotId) {
  const mat = MAT_BY_ID[matId];
  const slot = SLOT_BY_ID[slotId];
  if (mat?.board) return boardFits(mat, slot); // 溪岸板材：只上柜体（含室内门）和主题墙板，织系列哪里都不放
  return !!(mat && slot && slot.cats.includes(mat.cat) && !slot.not?.includes(mat.tex.type));
}

/** 拖到不合适的表面时，给一句俏皮又有用的提示（已经按当前语言翻好） */
export function misfitHint(matId, slotId) {
  const mat = MAT_BY_ID[matId];
  const slot = SLOT_BY_ID[slotId];
  if (!mat || !slot) return '';
  const slotWord = isEn() ? slot.en.toLowerCase() : slot.zh;
  if (mat.board) return mat.board.kind === 'weave' ? t('织系列是柜门的面料，3D 里先用柜体的颜色示意') : t('溪岸板材只用在定制柜、墙板和门上；活动家具是示意');
  if (slot.cats.includes(mat.cat) && slot.not?.includes(mat.tex.type)) return t('{0}不适合做{1}，试试亚麻、纯棉或针织', [L(mat), slotWord]);
  if (mat.cat === 'fabric' && slotId === 'floor') return t('布料不能铺地板哦～试试拖到地毯上');
  if (mat.cat === 'fabric') return t('{0} 是布料，适合沙发、床品、地毯、窗帘', [L(mat)]);
  if (mat.cat === 'metal') return t('金属适合五金把手与灯具');
  if (mat.cat === 'paint' && slotId === 'floor') return t('油漆不能当地板～地板试试木、石或砖');
  if (mat.cat === 'stone' && slotId === 'walls') return t('整面石材请放到「主题墙」');
  return t('{0}用不了{1}，换一个试试', [slotWord, L(mat)]);
}

/** 这个类别默认去哪个表面（点一下色块、又没选表面时用） */
export const DEFAULT_SLOT_FOR_CAT = {
  wood: 'floor',
  stone: 'countertop',
  tile: 'tile',
  fabric: 'upholstery',
  paint: 'walls',
  metal: 'metal',
};

/** 点一下色块、又没选表面时，这个材质去哪个表面（板材 → 柜体，不是木头默认的地板） */
export function defaultSlotFor(matId) {
  const mat = MAT_BY_ID[matId];
  if (!mat) return null;
  return mat.board ? boardDefaultSlot(mat) : DEFAULT_SLOT_FOR_CAT[mat.cat] || null;
}

/** 十六进制颜色 → {r,g,b} 0–255 */
export function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
