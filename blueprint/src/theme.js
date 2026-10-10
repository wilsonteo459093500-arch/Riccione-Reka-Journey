// Blueprint 设计系统 —— 与已定稿的 Dreamhouse Blueprint PPT 完全一致。
// 画布 1920×1080 px（= PPT 20in × 11.25in，1px = 9525 EMU）；字号与字距沿用 PowerPoint 的 pt。

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;
export const EMU_PER_PX = 9525;
export const PX_PER_PT = 96 / 72;

/** 三套字体：pptx = 写进 PPT 的字体名（与定稿一致）；css = 网页预览用的回退栈 */
export const FONTS = {
  serif: {
    label: '思源宋体',
    pptx: 'Source Han Serif CN',
    css: '"Source Han Serif CN","Source Han Serif SC","Noto Serif SC","Songti SC",serif',
  },
  display: {
    label: 'Ogg 展示衬线',
    pptx: 'Ogg',
    css: '"Ogg","Cormorant Garamond","Noto Serif SC",Georgia,serif',
  },
  sans: {
    label: 'Outfit',
    pptx: 'Outfit',
    css: 'Outfit,"Noto Sans SC",system-ui,sans-serif',
  },
};

/** 颜色（不带 #，与 OOXML srgbClr 一致） */
export const C = {
  paper: 'F5F0E6', // 浅色页底
  dark: '211A12', // 深色页底
  overlay: '17120C', // 满版图压暗
  ink: '241C12', // 正文墨色
  eyebrow: '8A6844', // 英文小标题
  faint: '9A8F7D', // 次要文字
  muted: '6E6353', // 说明文字 / 编号
  rule: 'B8A98E', // 标题下短线
  line: 'DDD2BE', // 分隔线
  light: 'F2ECE0', // 深底文字
  lightMuted: 'D8C8A8', // 深底小标题
  darkMuted: 'B3A78F', // 深底次要文字
  darkFoot: '8D7B5F', // 深底页脚右侧
  gold: 'A9835A', // 章节页短线
  boardGold: 'B8995A', // Material Board 金线
  placeholder: 'E9E5DC', // 无图材料占位
};

export const BRAND_FOOTER = 'SAIL · BY RICCIONE REKA';

/** 常用文字样式（size/spacing 单位 pt） */
export const TS = {
  eyebrow: { font: 'sans', size: 18, spacing: 7.56, color: C.eyebrow },
  eyebrowDark: { font: 'sans', size: 18, spacing: 7.56, color: C.lightMuted },
  label: { font: 'sans', size: 18, spacing: 2.52, color: C.faint },
  labelDark: { font: 'sans', size: 18, spacing: 3.6, color: C.light },
  code: { font: 'sans', size: 18, spacing: 2.52, color: C.muted },
  codeDark: { font: 'sans', size: 18, spacing: 2.52, color: C.light },
  value: { font: 'serif', size: 22.5, color: C.ink },
  valueDark: { font: 'serif', size: 22.5, color: C.light },
  footBrand: { font: 'display', size: 18, spacing: 3.96, color: C.muted },
  footBrandDark: { font: 'display', size: 18, spacing: 3.96, color: C.darkMuted },
  footRight: { font: 'sans', size: 18, spacing: 2.52, color: C.faint },
  footRightDark: { font: 'sans', size: 18, spacing: 2.52, color: C.darkFoot },
};
