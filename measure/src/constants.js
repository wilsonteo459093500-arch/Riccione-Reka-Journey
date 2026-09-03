// 单位换算基准
export const MM_PER_FT = 304.8;
export const MM_PER_INCH = 25.4;

// 柜体分类 —— 量出来的每一段线都归到一类，汇总时分开算延尺。
// rate = 默认单价（RM / 尺），只是占位，第一次用请在「预估报价」里改成自家价目。
export const KINDS = [
  { id: 'base', label: '地柜', short: '地', color: '#3D5A4A', rate: 380 },
  { id: 'wall', label: '吊柜', short: '吊', color: '#A87C4F', rate: 300 },
  { id: 'tall', label: '高柜', short: '高', color: '#7A4B3A', rate: 600 },
  { id: 'top', label: '台面', short: '台', color: '#B8995A', rate: 260 },
  { id: 'other', label: '其他', short: '他', color: '#6B6358', rate: 0 },
  { id: 'check', label: '校验', short: '验', color: '#2563EB', rate: 0 },
];

// 参与「橱柜延尺 / 报价」汇总的分类（校验线与其他不计价）
export const BILLABLE = ['base', 'wall', 'tall', 'top'];

export const kindOf = (id) => KINDS.find((k) => k.id === id) || KINDS[4];

export const UNITS = [
  { id: 'mm', label: 'mm' },
  { id: 'm', label: '米' },
  { id: 'ft', label: '尺' },
];

// 常用参考值，标定输入框下方一键填入
export const COMMON_MM = [600, 900, 1200, 2400, 3000, 3600];

export const STORAGE_KEYS = {
  rates: 'ukur.rates.v1',
  prefs: 'ukur.prefs.v1',
  current: 'ukur.current.v1',
};
