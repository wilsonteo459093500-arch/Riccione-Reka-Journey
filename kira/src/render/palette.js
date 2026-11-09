// 颜色：只影响图，不影响价钱。
// 饰面色卡（占位）——用户之后会发真实板材色卡照片 + 名称清单，到时换成真实颜色/纹理。
export const FINISHES = [
  { id: 'oak', zh: '橡木', en: 'Oak', hex: '#C9A97C' },
  { id: 'walnut', zh: '胡桃', en: 'Walnut', hex: '#7A5A40' },
  { id: 'white', zh: '暖白', en: 'Warm white', hex: '#F2EEE6' },
  { id: 'greige', zh: '灰米', en: 'Greige', hex: '#B9AE9E' },
  { id: 'sage', zh: '鼠尾草绿', en: 'Sage', hex: '#8E9C82' },
  { id: 'charcoal', zh: '炭黑', en: 'Charcoal', hex: '#3E3F3D' },
];
export const finishOf = (id, fallback = 'oak') => FINISHES.find((f) => f.id === id) || FINISHES.find((f) => f.id === fallback);
export const DEFAULT_DOOR_FINISH = 'oak';
export const DEFAULT_CARCASS_FINISH = 'white';

// 线稿用色（品牌色）
export const INK = '#2D3E36';
export const INK_SOFT = '#6B5D4F';
export const LINE = '#D9CFB8';
export const GLASS = '#CFDCE0';
export const WORKTOP = '#E4DED3';
export const WALL = '#F4EFE6';
export const FLOOR = '#EDE5D6';

// 第二版「画色块」用的品牌色系（名称不变：玻璃柜体区 / 封闭区 / 开放区 / 抽屉区 / 底层架空区）
export const BLOCK_COLORS = {
  closed: '#DCE5D5', // 封闭区 —— 鼠尾草绿浅
  open: '#F1E4C6',   // 开放区 —— 金色浅
  glass: '#D9E1E6',  // 玻璃柜体区 —— 冷灰蓝浅
  drawer: '#F0D5CC', // 抽屉区 —— 赤陶浅
  void: '#EDE5D6',   // 底层架空 / 空位 —— 沙色
};

export const HANDLES = [
  { id: 'hidden', zh: '隐藏拉手', en: 'Hidden' },
  { id: 'bar', zh: '长条', en: 'Bar' },
  { id: 'knob', zh: '圆钮', en: 'Knob' },
  { id: 'push', zh: '免拉手（反弹）', en: 'Push-open' },
];
