// 溪岸板材 · 文件名里的词（纯资料，Node + 浏览器都能用）。parse.js 查这几张表：长的词先认（「黑胡桃」先于「胡桃」）。
// 认不出来的字不丢：留在 raw 里给员工看 / 自己对应。加一个词 = 在这里加一行（英文同时加到 i18n/en-cases.js 的「// boards importer」一段，
// test/boards.test.mjs 会检查两边一样）。
//
// proc：程序化「替身」贴图用的木种（textures.js 认 oak / maple / walnut / teak / cherry）—— 板材图还没到之前、离线时先用它。

import { GRAINS, FINISHES, FINISH_BY_V, KINDS, KIND_BY_V, SERIES, USES } from './vocab-core.js';

export { GRAINS, FINISHES, FINISH_BY_V, KINDS, KIND_BY_V, SERIES, USES };

/** 树种（species）。单字的「橡」「柚」只在别的词都认不出时才算（长词优先） */
export const SPECIES = [
  { zh: '黑胡桃', en: 'Black walnut', proc: 'walnut' },
  { zh: '胡桃', en: 'Walnut', proc: 'walnut' },
  { zh: '红橡', en: 'Red oak', proc: 'oak' },
  { zh: '白橡', en: 'White oak', proc: 'oak' },
  { zh: '橡木', en: 'Oak', proc: 'oak' },
  { zh: '橡', en: 'Oak', proc: 'oak' },
  { zh: '白蜡', en: 'Ash', proc: 'oak' },
  { zh: '水曲柳', en: 'Ash', proc: 'oak' },
  { zh: '红樱桃', en: 'Red cherry', proc: 'cherry' },
  { zh: '樱桃', en: 'Cherry', proc: 'cherry' },
  { zh: '卡斯楠', en: 'Castanea', proc: 'walnut' },
  { zh: '欧桦木', en: 'European birch', proc: 'maple' },
  { zh: '欧桦', en: 'European birch', proc: 'maple' },
  { zh: '桦木', en: 'Birch', proc: 'maple' },
  { zh: '白桦', en: 'White birch', proc: 'maple' },
  { zh: '枫木', en: 'Maple', proc: 'maple' },
  { zh: '柚木', en: 'Teak', proc: 'teak' },
  { zh: '柚', en: 'Teak', proc: 'teak' },
  { zh: '榆木', en: 'Elm', proc: 'oak' },
  { zh: '黑檀', en: 'Ebony', proc: 'walnut' },
  { zh: '沙比利', en: 'Sapele', proc: 'cherry' },
  { zh: '科技木', en: 'Engineered veneer', proc: 'oak' },
];

/** 标记 / 表面（flags）。finish = 3D 的表面（matte 哑光 · softtouch 肤感 · satin 缎面 · gloss 亮光）；kind = 顺便说明是什么板（弱提示） */
export const FLAGS = [
  { zh: '素板', en: 'Plain board', v: 'plain' },
  { zh: '同步', en: 'Registered emboss', v: 'emboss' },
  { zh: '结疤', en: 'Knotty', v: 'knot' },
  { zh: '肤感', en: 'Soft-touch matte', v: 'softtouch', finish: 'softtouch' },
  { zh: '哑光', en: 'Matte', v: 'matte', finish: 'matte' },
  { zh: '亮光', en: 'Gloss', v: 'gloss', finish: 'gloss' },
  { zh: '高光', en: 'High gloss', v: 'gloss', finish: 'gloss' },
  { zh: '半透', en: 'Semi-transparent', v: 'semi', finish: 'matte' },
  { zh: '封闭', en: 'Closed pore', v: 'closed', finish: 'satin' },
  { zh: '开放', en: 'Open pore', v: 'open', finish: 'matte' },
  { zh: '烤漆', en: 'Lacquer', v: 'lacquer', kind: 'solid' },
];

/**
 * 「是什么板」的词。strong = 一定是（文件名说了就听文件名）；weak = 名字最后一个这样的词（诗意名字的中心词：「沙岩杏」是杏色，不是石头）。
 * 织系列（编织膜 / 藤编）在 3D 里只是资料（R6），不会铺到柜子上。
 */
export const KIND_WORDS = [
  { zh: '编织膜', kind: 'weave', strong: true, series: '织系列', strip: true },
  { zh: '织系列', kind: 'weave', strong: true, series: '织系列', strip: true },
  { zh: '编织', kind: 'weave', strong: true, series: '织系列' },
  { zh: '藤编', kind: 'weave', strong: true, series: '藤编' },
  { zh: '藤', kind: 'weave' },
  { zh: '织', kind: 'weave' },
  { zh: '桑榆', kind: 'weave' },
  { zh: '墨染', kind: 'weave' },
  { zh: '白苎', kind: 'weave' },
  { zh: '葛麻', kind: 'weave' },
  { zh: '洞石', kind: 'stone' },
  { zh: '岩泥', kind: 'stone' },
  { zh: '大理石', kind: 'stone' },
  { zh: '大理', kind: 'stone' },
  { zh: '水泥', kind: 'stone' },
  { zh: '岩板', kind: 'stone' },
  { zh: '岩', kind: 'stone' },
  { zh: '石', kind: 'stone' },
  { zh: '纯色', kind: 'solid', strong: true },
  { zh: '素色', kind: 'solid', strong: true },
  { zh: '布纹', kind: 'solid' },
  { zh: '皮纹', kind: 'solid' },
  { zh: '云', kind: 'solid' },
  { zh: '杏', kind: 'solid' },
  { zh: '陶', kind: 'solid' },
  { zh: '灰', kind: 'solid' },
  { zh: '白', kind: 'solid' },
  { zh: '纸', kind: 'solid' },
];

/** 同一块板的「大板」（整张扫描）/「小板」（小样）：大板做贴图，小板不另外导入 */
export const SIZE_WORDS = [
  { zh: '大板', v: 'big' },
  { zh: '小板', v: 'small' },
];

/** 厂家编号的家族 → 是什么板（手册：XA-TP 木皮 · XA-SM 原木 · GKL 烤漆 · SG-BZ / SG-PK 编织门 · GZY 藤编） */
export const CODE_FAMILIES = [
  { re: /^XA-TP-/, kind: 'wood', series: '木皮' },
  { re: /^XA-SM-/, kind: 'wood', series: '原木' },
  { re: /^GKL\d/, kind: 'solid', series: '烤漆' },
  { re: /^SG-(BZ|PK)/, kind: 'weave', series: '织系列' },
  { re: /^GZY\d/, kind: 'weave', series: '藤编' },
  { re: /^\d{3,6}$/, kind: 'solid', series: '烤漆' },
  { re: /^P\d{1,2}$/, kind: 'solid', series: '烤漆' },
];

/** 聊天软件 / 相机改过的名字（名字已经丢了，不要当成板名） */
export const LOST_NAME = /^(IMG|DSCN?|DCIM|PXL|MVIMG|VID|mmexport|wx_camera|WeChat ?Image|WhatsApp ?Image|微信图片|Screenshot|截屏|截图|屏幕截图|Snipaste|image)(?=[\s_\-.()\d]|$)/i;
