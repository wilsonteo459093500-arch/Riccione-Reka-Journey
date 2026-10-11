// 界面语言：中文 / English / 中英（首页右上角、「设置」里切换）
// ------------------------------------------------------------
// 和「文件语言」（lib/lang.js，导出的 PDF / Word / Excel / 文案用哪种语言）是两个独立的设置：
//   settings.uiLang  = 这台手机的 App 界面语言
//   settings.docLang = 导出文件的默认语言（每份报告还能在导出页单独改）
//
// 用法（组件和 lib 里都一样，直接 import）：
//   t('保存', 'Save')              短文字：中文 → 保存；English → Save；中英 → 保存 Save
//   tb('一段说明…', 'A paragraph…') 段落：中英时中文一行、英文另起一行（放在 whitespace-pre-line 的容器里）
//   uiLabel(label)                模板里的 { zh, en } 标签 → { primary, secondary }
//                                 （中英 = 中文主行 + 英文小字；单语只有 primary）
//   uiText(label)                 模板标签拼成一行
//   getUiLang()                   'zh' | 'en' | 'both'（需要按语言分支时，如日期、复数）
//
// 切换语言时整个页面重新挂载（App.jsx 里 <Screens key={uiLang}>），所以组件里直接调用 t() 即可，
// 不需要 hook。lib 里的函数在调用时读当前语言（toast / 确认框 / 提醒文字）。
import { normLang, tx, localize, labelParts } from './lang.js';

const KEY = 'tora.lang';

function stored() {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    return v === 'zh' || v === 'en' || v === 'both' ? v : null;
  } catch {
    return null;
  }
}

// 默认中文；存过就用存的（数据还没从本机数据库读出来时，错误页等也能用对语言）
let current = stored() || 'zh';

export const getUiLang = () => current;

/** 新手机（还没有任何设置）按手机系统语言猜：系统是中文 → 中文，其他 → English */
export function detectUiLang() {
  try {
    const list = [...(globalThis.navigator?.languages || []), globalThis.navigator?.language].filter(Boolean);
    if (!list.length) return 'zh';
    return list.some((l) => /^zh\b/i.test(l)) ? 'zh' : 'en';
  } catch {
    return 'zh';
  }
}

/** 生效（store 读到 / 改了 settings.uiLang 时调用） */
export function applyUiLang(lang) {
  current = lang === 'zh' || lang === 'en' ? lang : lang === 'both' ? 'both' : 'zh';
  try {
    globalThis.localStorage?.setItem(KEY, current);
  } catch {
    /* 隐私模式等：不影响使用 */
  }
  try {
    if (globalThis.document) document.documentElement.lang = current === 'en' ? 'en' : 'zh-CN';
  } catch {
    /* 非浏览器 */
  }
  return current;
}

/** 短文字（按钮、标题、标签、提示一句话） */
export function t(zh, en) {
  if (zh === en) return zh || '';
  return tx(current, zh, en, ' ');
}

/** 段落：中英时中文、英文各一段（容器要 whitespace-pre-line，如确认框的 message）；多行长文用 sep = '\n\n' 空一行 */
export function tb(zh, en, sep = '\n') {
  if (zh === en) return zh || '';
  return tx(current, zh, en, sep);
}

const asLabel = (label) => (label == null ? null : typeof label === 'string' ? { zh: label } : label);

/** 模板的 { zh, en } 标签 → { primary, secondary }（字符串当中文） */
export function uiLabel(label) {
  const l = asLabel(label);
  if (!l) return { primary: '', secondary: '' };
  const parts = labelParts(localize(l, current));
  // 中英：原表只有中文的标签（只有 enOnly、没有 en）也给一行英文小字，方便看不懂中文的师傅；
  // 中文那行本身已经带英文的（同一行中英）就不重复
  if (current === 'both' && !parts.secondary && typeof l.enOnly === 'string' && l.enOnly && !/[A-Za-z]{2,}/.test(parts.primary)) {
    return { primary: parts.primary, secondary: l.enOnly };
  }
  return parts;
}

/** 模板标签拼成一行（中英时「中文 English」） */
export function uiText(label, sep = ' ') {
  const { primary, secondary } = uiLabel(label);
  return secondary && secondary !== primary ? `${primary}${sep}${secondary}` : primary;
}

/** 英文全大写的标题（文件里的小标题写法，如「21-ITEM INSPECTION」）在界面句子里改成首字母大写「21-Item Inspection」；
 *  两个字母以内的词（SS、QC、O1）照旧 */
export function tidyCaps(s) {
  if (typeof s !== 'string' || /[a-z]/.test(s) || !/[A-Z]{3}/.test(s) || !/\s/.test(s.trim())) return s;
  return s.replace(/[A-Za-z][A-Za-z']*/g, (w) => (w.length <= 2 ? w : w[0] + w.slice(1).toLowerCase()));
}

/** 选项文字（{ v, zh, en } 或字符串） */
export const uiOption = (o) => (o == null ? '' : typeof o === 'string' ? o : uiText(o) || o.v || '');

export const UI_LANGS = [
  { v: 'zh', short: '中', label: '中文' },
  { v: 'en', short: 'EN', label: 'English' },
  { v: 'both', short: '中/EN', label: '中英 Bilingual' },
];

export { normLang };
