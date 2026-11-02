// 溪岸板材 · 几张小词表（纯资料）：3D 工作室的材质栏 / 板材卡片也要用，所以和导入器用的大词表（vocab.js：树种、标记、编号家族…）分开，
// 工作室不用把整张大词表下载下来。vocab.js 原样转出这几张（导入器、测试照旧从 vocab.js 拿）。

/** 纹理（grain）：乱纹 / 山纹 = 山形（cathedral），直纹 / 径切 = 直的 */
export const GRAINS = [
  { zh: '乱纹', en: 'Crown cut', v: 'crown' },
  { zh: '山纹', en: 'Crown cut', v: 'crown' },
  { zh: '直纹', en: 'Straight grain', v: 'straight' },
  { zh: '径切', en: 'Quarter cut', v: 'straight' },
];

/** 3D 用的表面 → 粗糙度（R10：v1 每块板一个固定的 ORM） */
export const FINISHES = [
  { v: 'matte', zh: '哑光', en: 'Matte', short: 'Matte', rough: 0.62 },
  { v: 'softtouch', zh: '肤感', en: 'Soft-touch matte', short: 'Soft', rough: 0.72 },
  { v: 'satin', zh: '缎面', en: 'Satin', short: 'Satin', rough: 0.45 },
  { v: 'gloss', zh: '亮光', en: 'Gloss', short: 'Gloss', rough: 0.2 },
];
export const FINISH_BY_V = Object.fromEntries(FINISHES.map((f) => [f.v, f]));

/** 板的类别（kind）。weave = 织系列编织膜 / 藤编：v1 只是资料 */
export const KINDS = [
  { v: 'wood', zh: '木纹', en: 'Wood grain', short: 'Wood' },
  { v: 'solid', zh: '纯色', en: 'Solid colour', short: 'Solid' },
  { v: 'stone', zh: '石纹', en: 'Stone look', short: 'Stone' },
  { v: 'weave', zh: '编织', en: 'Woven', short: 'Woven' },
];
export const KIND_BY_V = Object.fromEntries(KINDS.map((k) => [k.v, k]));

/** 目录里的系列（产品标准设计手册）：界面用 t(series)，英文在词典里（和这里一样） */
export const SERIES = [
  { zh: '木皮', en: 'Veneer' },
  { zh: '原木', en: 'Solid wood' },
  { zh: '烤漆', en: 'Lacquer' },
  { zh: '颗粒板', en: 'Particleboard' },
  { zh: '织系列', en: 'Woven' },
  { zh: '藤编', en: 'Rattan' },
];

/** 板材用在哪（R1：只有定制柜 + 墙板；台面外购、活动家具是示意）。short = 英文界面里小按钮用的短词 */
export const USES = [
  { v: 'cabinetry', zh: '柜体 · 门', en: 'Cabinets & doors', short: 'Cabinets' },
  { v: 'feature', zh: '墙板', en: 'Wall panels', short: 'Panels' },
];
