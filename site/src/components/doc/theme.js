// 文档版式常量 & 配色（预览与 PDF 共用，单位 = CSS px，A4 @96dpi）
// 所有行高 / 内边距都用整数 px，排版测量才稳定（不会因小数累积超出页面）。

export const PAGE_W = 794;
export const PAGE_H = 1123;
export const PAD_X = 40;
export const PAD_TOP = 36;
export const FOOT_H = 50; // 页脚区（页脚文字 + 上方留白）
export const CONT_HEAD_H = 44; // 续页抬头（含下方留白）
export const CONTENT_W = PAGE_W - PAD_X * 2; // 714
export const SAFETY = 3; // 每页预留几 px，吸收页末收边线等 1px 差异
export const FIRST_AVAIL = PAGE_H - PAD_TOP - FOOT_H - SAFETY;
export const CONT_AVAIL = PAGE_H - PAD_TOP - CONT_HEAD_H - FOOT_H - SAFETY;

export const C = {
  terra: '#B5623A',
  terraDark: '#934C2B',
  terraSoft: '#F6E6DC',
  pine: '#2F4A3C',
  pineSoft: '#E3EAE4',
  cream: '#F8F4EB',
  creamDeep: '#F1EBDE',
  paper: '#FCFAF5',
  ink: '#2B2A27',
  body: '#55524B',
  mute: '#8A857C',
  faint: '#B3ACA0',
  line: '#E4DCCB',
  lineSoft: '#EFE9DC',
  pass: '#3F7A4F',
  fail: '#B8452F',
  na: '#8A857C',
  warn: '#B7791F',
};

// 语气色：fg 文字 / bg 底色 / bd 边框
export const TONE = {
  pass: { fg: C.pass, bg: '#EDF4EE', bd: '#BFD6C4', bar: C.pass },
  fail: { fg: C.fail, bg: '#FBECE8', bd: '#EBC1B6', bar: C.fail },
  na: { fg: C.na, bg: '#F3F1EC', bd: '#DCD6CB', bar: '#B3ACA0' },
  warn: { fg: C.warn, bg: '#FBF3E1', bd: '#EBD3A1', bar: C.warn },
  neutral: { fg: C.ink, bg: C.cream, bd: C.line, bar: '#CFC5B3' },
};

export const tone = (t) => TONE[t] || TONE.neutral;

export const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', 'Noto Sans CJK SC', 'Source Han Sans SC', 'Microsoft YaHei', 'WenQuanYi Zen Hei', sans-serif";

// 照片格子尺寸：sm = 检查表 / 表格里一行 4 张；lg = 文案类报告一行 3 张
export const PHOTO = {
  sm: { w: 156, h: 117, per: 4, gap: 8 },
  lg: { w: 228, h: 171, per: 3, gap: 15 },
};

export const LOGO_SRC = '/sail-logo.png';
export const LOGO_RATIO = 700 / 268;
