// Blueprint 设计系统（C 安然，参考 Aman 品牌手册）：大照片贴边、暖米色纸、棕色宋体 / Ogg 标题、角上 logo、右下签名。
// 画布 1920×1080 px（= PPT 20in × 11.25in，1px = 9525 EMU）；字号与字距沿用 PowerPoint 的 pt。
// 版式工具（字级表、标题组、正文块、签名、logo、照片、托字渐变、半版栅格）在 engine/b/kit.js。

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;
export const EMU_PER_PX = 9525;
export const PX_PER_PT = 96 / 72;

// 字体角色：每个角色给 PPT 写两种字体 —— latin（英文、数字、标点）与 ea（中文），PowerPoint 按字符自动选用；
// css = 网页预览的字体栈（英文字体在前：拉丁字符用它，中文落到后面的中文字体）；weight = 网页字重（静态字体在 PPT 里各有自己的名字）。
// 旧的 light / regular / title（B 格物：思源黑体 + Hanken Grotesk / Ysabeau Office）留给还没改完的旧版式和旧测试。
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

// C 安然（参考 Aman 品牌手册，字体是老板发来的同一套）：
//   中文标题 思源宋体 CN（Source Han Serif CN）· 英文标题 Ogg · 正文 HarmonyOS Sans SC · 英文正文 / 小字 Outfit
//   PPT 里的字体名照 Aman 原件写（Windows 上静态字重各是一个字体名：「HarmonyOS Sans SC Medium」「Ogg Medium」…）
// 网页预览（index.html 的 Google Fonts + src/index.css）：
//   思源宋体：本机的 'Source Han Serif CN' 优先，没有就用 Google Fonts 的 'Noto Serif SC'（同一套字形）
//   Ogg：付费字体、只有桌面授权 —— 只认本机安装的（'Ogg' 字体族 + 'Ogg Local' = local() 按字体全名找），不托管；
//        没装就退到 Google Fonts 的 'Cormorant Garamond'
//   HarmonyOS：只认本机安装的 'HarmonyOS Sans SC'，没装就落到 'Noto Sans SC'（Google Fonts，同字重）。不托管：
//        华为的授权（HarmonyOS Sans Fonts License Agreement 第 2 条）只允许再分发「未修改」的字体文件，
//        切成 unicode-range 分片、转 woff2 都算修改 —— 要托管得先拿到华为的书面许可，或者原样托管 TTF（老板 / 法务定）
//   Outfit：Google Fonts
// PPT 里每个角色的 ea（中文）字体都是导出对话框 FONT_PACK 列出的字重：设计师照清单装好字体，PPT 里不会有被替换的字
const SONG_CSS = "'Source Han Serif CN','Noto Serif SC','Source Han Serif SC','Songti SC',serif";
const OGG_CSS = "'Ogg','Ogg Local','Cormorant Garamond','Source Han Serif CN','Noto Serif SC',serif";
const HOS_TAIL = "'Noto Sans SC','PingFang SC','Microsoft YaHei',system-ui,sans-serif";
const HOS_CSS = `'HarmonyOS Sans SC',${HOS_TAIL}`;
const OUTFIT_CSS = "'Outfit','HarmonyOS Sans SC','Noto Sans SC',system-ui,sans-serif";
// Regular 装好的字体族名就是「思源宋体 CN」（其余字重才带字重名），和 HarmonyOS 一样
const song = (w, name) => {
  const family = name === 'Regular' ? '思源宋体 CN' : `思源宋体 CN ${name}`;
  return { label: `思源宋体 CN ${name}`, latin: family, ea: family, css: SONG_CSS, weight: w };
};
// Ogg 段里夹带的中文 / 全角标点用思源宋体 CN Medium（FONT_PACK 里有）；Outfit 段里的用 HarmonyOS Sans SC Medium
const ogg = (w, name) => ({ label: `Ogg ${name}`, latin: name === 'Roman' ? 'Ogg' : `Ogg ${name}`, ea: '思源宋体 CN Medium', css: OGG_CSS, weight: w });
const hos = (w, name) => ({
  label: `HarmonyOS Sans SC ${name}`,
  latin: name === 'Regular' ? 'HarmonyOS Sans SC' : `HarmonyOS Sans SC ${name}`,
  ea: name === 'Regular' ? 'HarmonyOS Sans SC' : `HarmonyOS Sans SC ${name}`,
  css: HOS_CSS,
  weight: w,
});
const outfit = (w, name) => ({ label: `Outfit ${name}`, latin: name === 'Regular' ? 'Outfit' : `Outfit ${name}`, ea: 'HarmonyOS Sans SC Medium', css: OUTFIT_CSS, weight: w });

export const FONTS = {
  light: LIGHT,
  regular: REGULAR,
  title: TITLE,
  // C 安然
  songXL: song(200, 'ExtraLight'),
  songL: song(300, 'Light'),
  song: song(400, 'Regular'),
  songM: song(500, 'Medium'),
  songSB: song(600, 'SemiBold'),
  ogg: ogg(400, 'Roman'),
  oggM: ogg(500, 'Medium'),
  hosL: hos(300, 'Light'),
  hos: hos(400, 'Regular'),
  hosM: hos(500, 'Medium'),
  outfitL: outfit(300, 'Light'),
  outfit: outfit(400, 'Regular'),
  outfitM: outfit(500, 'Medium'),
  // 旧的角色名（旧版式 / 旧测试）：统一落到新字体，整套风格一致
  serif: LIGHT,
  sans: REGULAR,
  display: TITLE,
};

/**
 * 设计师要装的字体（导出对话框里列出下载地址）—— PPT 里写的就是这些字体名，没装时 PowerPoint 会换成替代字体
 *   note = 授权 / 出处；paid = 付费字体（公司买的是桌面授权：只装在设计师电脑上，不放进网站）
 */
export const FONT_PACK = [
  {
    name: '思源宋体 CN（Source Han Serif CN）Regular / Medium / SemiBold',
    href: 'https://github.com/adobe-fonts/source-han-serif/releases',
    note: '免费（SIL OFL）· Adobe GitHub',
  },
  {
    name: 'HarmonyOS Sans SC Medium',
    href: 'https://developer.huawei.com/consumer/cn/design/resource/',
    note: '免费商用（HarmonyOS Sans Fonts License）· 华为开发者网站 · 网页预览不托管，装在本机才显示',
  },
  {
    name: 'Outfit Light / Regular / Medium',
    href: 'https://fonts.google.com/specimen/Outfit',
    note: '免费（SIL OFL）· Google Fonts',
  },
  {
    name: 'Ogg Roman / Medium',
    href: 'https://sharptype.co/typefaces/ogg',
    note: '付费字体 · Sharp Type · 公司购买的桌面授权',
    paid: true,
  },
];

/**
 * C 安然的颜色（不带 #，与 OOXML srgbClr 一致）。
 *   paper / ink / grey / hair / sample 是 B 格物时的键名（旧版式、测试在用），值已换成 C 安然；其余是 C 新加的
 */
export const B = {
  paper: 'F3EEE7', // 纸面底色（暖米色）
  ink: '333333', // 最深的字：表格内容
  grey: '8C7B6A', // 次要小字：纸面上的页脚签名、说明、瑞吉欧小字
  hair: 'C9B9A6', // 纸面细线（年表、列表）
  sample: 'E9E2D8', // 材料小样 / 缺图占位的底（比纸面深一级）
  // —— C 安然 ——
  title: '7B593D', // 标题、英文大标题、金句、年份、售后项名（照片上换成 white）
  body: '464646', // 正文
  table: '333333', // 表格内容
  white: 'FFFFFF', // 照片上的标题
  cream: 'F5EFDD', // 照片上的说明、签名
  foot: '8C7B6A', // 纸面上的页脚签名
  rule: '7B593D', // 纸面短线、售后表细线（配透明度 0.5–0.6，见 kit ALPHA）
  shade: '1C1915', // 托字暗渐变（中性暖黑，最深 45%）
  band: '3B2E24', // 有意的实色色带（封面右侧竖带）/ 满版照片页的底色
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
