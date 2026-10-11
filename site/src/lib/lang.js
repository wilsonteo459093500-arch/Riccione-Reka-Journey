// 文件语言：中文 / English / 中英双语
// ------------------------------------------------------------
// 选择存在报告上（report.lang），没有就用「设置」里的默认（settings.docLang），再没有就是双语。
// 只影响生成的文件（PDF / Word / Excel / WhatsApp 文案）里的固定文字；用户自己填写的内容原样输出，不做翻译。
//
// 约定（docmodel 和各渲染器都按这个来）：
// - 文档模型里的双语标签一律是 { zh, en }；buildDocModel 已按语言规整好：
//     both → 原样；zh → { zh, en: '' }；en → { zh: '', en }（缺哪种就用另一种顶上）
//   渲染器用 labelParts() 取「主 / 副」两行：主 = zh || en，副 = 有中文时的英文。
// - 渲染器里写死的成对文字（表头、页码、「续」等）用 tx(lang, zh, en)。
// - 模板 summary / filename / text 拿到 ctx.lang 和 ctx.t(zh, en)。

export const LANGS = [
  { v: 'zh', label: '中文' },
  { v: 'en', label: 'English' },
  { v: 'both', label: '中英' },
];

export const normLang = (v) => (v === 'zh' || v === 'en' ? v : 'both');

/** 这份报告用哪种语言 */
export const reportLang = (report, settings) => normLang(report?.lang || settings?.docLang);

/** 写死的成对文字：zh / en / 双语（中文在前，sep 隔开） */
export function tx(lang, zh, en, sep = ' ') {
  const l = normLang(lang);
  if (l === 'zh') return zh || en || '';
  if (l === 'en') return en || zh || '';
  if (!zh) return en || '';
  if (!en) return zh;
  return `${zh}${sep}${en}`;
}

/**
 * 一个 { zh, en } 标签按语言规整（保留其他键，如选项的 v / tone）。
 * 单语覆盖：zhOnly / enOnly = 纯中文 / 纯英文文件改用的文字（模板给：原表只有中文的标签、
 * 中英写在同一行的文字、英文行其实是中文的徽章 / 副标题）；双语文件不看它们。
 */
export function localize(label, lang) {
  if (label == null || typeof label !== 'object' || Array.isArray(label)) return label;
  if (!('zh' in label) && !('en' in label)) return label;
  const l = normLang(lang);
  if (l === 'both') return label;
  const { zhOnly, enOnly, ...rest } = label;
  const zh = typeof label.zh === 'string' ? label.zh : '';
  const en = typeof label.en === 'string' ? label.en : '';
  if (l === 'zh') return { ...rest, zh: typeof zhOnly === 'string' ? zhOnly : zh || en, en: '' };
  return { ...rest, zh: '', en: typeof enOnly === 'string' ? enOnly : en || zh };
}

/** 标签的「主 / 副」两行（标签已按语言规整过） */
export function labelParts(label) {
  if (label == null) return { primary: '', secondary: '' };
  if (typeof label === 'string') return { primary: label, secondary: '' };
  const zh = label.zh || '';
  const en = label.en || '';
  return { primary: zh || en, secondary: zh ? en : '' };
}

/** 标签拼成一行（双语时「中文 English」） */
export function labelText(label, sep = ' ') {
  const { primary, secondary } = labelParts(label);
  return secondary ? `${primary}${sep}${secondary}` : primary;
}

/** 文档模型整体按语言规整：遍历所有对象，把带 zh / en 键的标签换成对应语言 */
export function localizeDeep(node, lang) {
  if (normLang(lang) === 'both' || node == null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((x) => localizeDeep(x, lang));
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = localizeDeep(v, lang);
  return localize(out, lang);
}

/** 公司名 / 部门在纯英文文件里去掉中文（「溪岸 Sail by Riccione Reka」→「Sail by Riccione Reka」） */
export function latinOnly(s, fallback = '') {
  const t = String(s || '')
    .replace(/[　-〿㐀-鿿豈-﫿＀-￯]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s·\-–—|/]+|[\s·\-–—|/]+$/g, '')
    .trim();
  return t || fallback;
}
