// Blueprint 设计系统（B 格物）：明亮、精确、以图为主。
// 画布 1920×1080 px（= PPT 20in × 11.25in，1px = 9525 EMU）；字号与字距沿用 PowerPoint 的 pt。

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;
export const EMU_PER_PX = 9525;
export const PX_PER_PT = 96 / 72;

// 字体（B 格物）：中文 思源黑体（Noto Sans SC），英文 Hanken Grotesk，英文标题 Ysabeau Office —— 都是 SIL OFL 免费字体。
// 每个角色给 PPT 写两种字体：latin（英文、数字、标点）与 ea（中文），PowerPoint 按字符自动选用；
// css = 网页预览的字体栈（英文字体在前：拉丁字符用它，中文落到思源黑体）；weight = 网页字重（静态字体在 PPT 里各有自己的名字）。
const SANS_CSS = "'Hanken Grotesk','Noto Sans SC','PingFang SC','Microsoft YaHei',system-ui,sans-serif";
const LIGHT = { label: '思源黑体 Light · Hanken Grotesk Light', latin: 'Hanken Grotesk Light', ea: 'Noto Sans SC Light', css: SANS_CSS, weight: 300 };
const REGULAR = { label: '思源黑体 · Hanken Grotesk', latin: 'Hanken Grotesk', ea: 'Noto Sans SC', css: SANS_CSS, weight: 400 };
const TITLE = {
  label: 'Ysabeau Office Light（英文标题）',
  latin: 'Ysabeau Office Light',
  ea: 'Noto Sans SC Light',
  css: "'Ysabeau Office','Noto Sans SC','PingFang SC',system-ui,sans-serif",
  weight: 300,
};

export const FONTS = {
  light: LIGHT,
  regular: REGULAR,
  title: TITLE,
  // 旧的角色名（旧版式 / 旧测试）：统一落到新字体，整套风格一致
  serif: LIGHT,
  sans: REGULAR,
  display: TITLE,
};

/** 设计师要装的字体（导出对话框里列出下载地址） */
export const FONT_PACK = [
  { name: '思源黑体 Noto Sans SC（Light / Regular）', href: 'https://fonts.google.com/noto/specimen/Noto+Sans+SC' },
  { name: 'Hanken Grotesk（Light / Regular）', href: 'https://fonts.google.com/specimen/Hanken+Grotesk' },
  { name: 'Ysabeau Office（Light）', href: 'https://fonts.google.com/specimen/Ysabeau+Office' },
];

/** B 格物的颜色：奶白纸、墨色、灰、细线（不带 #） */
export const B = {
  paper: 'F6F2EA',
  ink: '33302B',
  grey: '6F6960',
  hair: 'DAD5CB',
  sample: 'EFEBE3', // 材料小样的底
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
