// 模板可复用的小工具（模板文件里 import 用）
import { resolveScale, normOptions } from './schema.js';
import { latinOnly, normLang, tx } from '../lib/lang.js';
import { parseISODate } from '../lib/format.js';
import { siteLabel } from '../lib/report.js';

/**
 * 统计某个 checklist 节（或全部节）的判定结果。
 * 返回 { P: 3, F: 1, NA: 0, _empty: 2, _total: 6, _keyFail: 1 }
 */
export function countResults(ctx, sectionId = null) {
  const out = { _empty: 0, _total: 0, _keyFail: 0 };
  for (const s of ctx.template.sections) {
    if (s.type !== 'checklist') continue;
    if (sectionId && s.id !== sectionId) continue;
    for (const it of s.items) {
      if (it.input) continue; // 填写型不计入判定
      out._total += 1;
      const a = ctx.report.items?.[it.id];
      const r = a?.r;
      if (!r) {
        out._empty += 1;
        continue;
      }
      out[r] = (out[r] || 0) + 1;
      const opt = resolveScale(it.scale || s.scale).options.find((o) => o.v === r);
      if (it.key && opt?.tone === 'fail') out._keyFail += 1;
    }
  }
  return out;
}

/** 关键项（★）中判定为 fail 的项目列表 */
export function keyFails(ctx) {
  const out = [];
  for (const s of ctx.template.sections) {
    if (s.type !== 'checklist') continue;
    for (const it of s.items) {
      if (!it.key || it.input) continue;
      const r = ctx.report.items?.[it.id]?.r;
      const opt = resolveScale(it.scale || s.scale).options.find((o) => o.v === r);
      if (opt?.tone === 'fail') out.push({ section: s, item: it });
    }
  }
  return out;
}

/** 所有判定为 fail 的项目 */
export function allFails(ctx) {
  const out = [];
  for (const s of ctx.template.sections) {
    if (s.type !== 'checklist') continue;
    for (const it of s.items) {
      if (it.input) continue;
      const r = ctx.report.items?.[it.id]?.r;
      const opt = resolveScale(it.scale || s.scale).options.find((o) => o.v === r);
      if (opt?.tone === 'fail') out.push({ section: s, item: it, answer: ctx.report.items[it.id] });
    }
  }
  return out;
}

/** 取字段值（values 命名空间） */
export const val = (ctx, key) => ctx.report.values?.[key];

// ---------- 文件语言（中文 / English / 中英，见 lib/lang.js） ----------

/** 生成文件用的语言；测试里手搭的 ctx 没有 lang 时按双语 */
export const langOf = (ctx) => normLang(ctx?.lang);

/**
 * summary / 文件名 / 文案里「拼出来的」固定文字按语言取：zh → 中文，en → 英文；
 * 双语默认「中文 English」（同 ctx.t）。原来的双语写法不是简单拼接时（如 '3 项 items'、
 * 'GO 可开工'）传 both，保证双语输出与改版前逐字一致。
 */
export function say(ctx, zh, en, both) {
  const lg = langOf(ctx);
  if (lg === 'zh') return zh;
  if (lg === 'en') return en;
  return both !== undefined ? both : tx('both', zh, en);
}

/**
 * 标签（{ zh, en, zhOnly?, enOnly? } 或字符串）按语言取一行文字。
 * zhOnly / enOnly = 纯中文 / 纯英文时改用的文字（见 schema.js「单语覆盖」）；双语照旧「zh en」。
 */
export function pick(label, lang, sep = ' ') {
  if (label == null) return '';
  if (typeof label !== 'object') return String(label);
  const l = normLang(lang);
  const zh = typeof label.zh === 'string' ? label.zh : '';
  const en = typeof label.en === 'string' ? label.en : '';
  if (l === 'zh') return typeof label.zhOnly === 'string' ? label.zhOnly : zh || en;
  if (l === 'en') return typeof label.enOnly === 'string' ? label.enOnly : en || zh;
  return tx('both', zh, en, sep);
}

/** 数量 + 英文单复数：plural(1, 'item') → '1 item'，plural(3, 'item') → '3 items' */
export const plural = (n, word, many = `${word}s`) => `${n} ${Number(n) === 1 ? word : many}`;

/**
 * 选项值 → 文案里显示的文字（按语言）。选项是 { v, zh, en?, zhOnly?, enOnly? }；
 * 不在选项里的值（自己填的）原样返回。
 */
export function optionText(options, v, lang) {
  const s = v == null ? '' : String(v).trim();
  const o = normOptions(options || []).find((x) => x.v === s);
  return o ? pick(o, lang) : s;
}

const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-10-09' → 'Fri, 9 Oct'（英文文案里的日期，对应中文的「10月9日 周五」） */
export function fmtDateEn(iso) {
  const d = parseISODate(iso);
  if (!d) return iso || '';
  return `${WEEK_EN[d.getDay()]}, ${d.getDate()} ${MONTH_EN[d.getMonth()]}`;
}

/** 英文里不用全角括号（项目名「17-3（Hailey）」→「17-3 (Hailey)」） */
export const asciiParens = (s) =>
  String(s ?? '')
    .replace(/\s*（\s*/g, ' (')
    .replace(/\s*）/g, ')')
    .trim();

/**
 * 导出文件名：中文 / 双语用原来的中文前缀，纯英文用英文前缀（如 Installation_QC_<项目>_<日期>）。
 * parts 是用户填写的项目 / 日期等，原样保留（纯英文时把全角括号换成半角）。
 */
export function fileName(ctx, zhPrefix, enPrefix, ...parts) {
  const en = langOf(ctx) === 'en';
  const rest = parts.filter(Boolean).map((p) => (en ? asciiParens(p) : p));
  return [en ? enPrefix : zhPrefix, ...rest].join('_');
}

// ---------- 字段 display：存的值在文件 / 文案里怎么显示（见 schema.js「字段 display」） ----------
// 新建时自动带入的默认文字（施工规定、预计工期、工地称呼的全角括号、落款「安装部」…）存的是建报告时的写法；
// 生成文件时按文件语言换成对应写法。只认「与自动值完全相同」的值，用户写 / 改过的照原样；
// 中文 / 双语 = 中文写法（与改版前逐字一致）。

/** 字段值按 field.display(value, ctx, field) 换成文件里显示的样子；没有 display / 出错时原样 */
export function shownValue(field, value, ctx) {
  if (!field || typeof field.display !== 'function') return value;
  try {
    const v = field.display(value, ctx, field);
    return v === undefined ? value : v;
  } catch {
    return value;
  }
}

/** 整份报告的 values 按各字段的 display 换好（文案模板 text() 用，与文件里显示的一致） */
export function shownValues(ctx) {
  const values = { ...(ctx?.report?.values || {}) };
  for (const s of ctx?.template?.sections || []) {
    if (s.type !== 'fields') continue;
    for (const f of s.fields || []) if (typeof f.display === 'function') values[f.key] = shownValue(f, values[f.key], ctx);
  }
  return values;
}

/**
 * 「默认文字」字段的 display：纯英文文件里，与默认文字逐字相同的行换成英文（map：中文默认 → 英文）。
 * 列表字段逐行比对；自己写 / 改过的行照原样。中文 / 双语原样。
 */
export function defaultTextIn(map) {
  const one = (s) => (typeof s === 'string' && Object.prototype.hasOwnProperty.call(map, s.trim()) ? map[s.trim()] : s);
  return (v, ctx) => {
    if (langOf(ctx) !== 'en') return v;
    return Array.isArray(v) ? v.map(one) : one(v);
  };
}

/**
 * 工地称呼（bind 'project.siteLabel' 自动带入的「17-3（Hailey）」）的 display：纯英文文件里换半角括号。
 * 只换自动带入的值（= 项目推算的 / report.autofill 记下的）；用户改过的照原样。
 */
export function siteLabelIn(v, ctx, field) {
  if (langOf(ctx) !== 'en' || typeof v !== 'string' || !/[（）]/.test(v)) return v;
  const auto = field?.key ? ctx?.report?.autofill?.[field.key] : undefined;
  return v === siteLabel(ctx?.project) || (typeof auto === 'string' && v === auto) ? asciiParens(v) : v;
}

/** 落款 / 部门的英文：默认的「安装部」写成 Installation Department，其他去掉中文（与文档抬头 meta.dept 一致） */
export const deptEn = (d) => latinOnly(d === '安装部' ? 'Installation Department' : d, 'Installation Department');

/**
 * 落款（bind 'settings.dept'，默认「安装部」）的 display：纯英文文件里，仍是「设置」里的部门 / 默认值时写英文；
 * 在报告里改过的照原样。
 */
export function deptIn(v, ctx) {
  if (langOf(ctx) !== 'en' || typeof v !== 'string') return v;
  const d = v.trim();
  if (!d) return v;
  return d === '安装部' || d === String(ctx?.settings?.dept || '').trim() ? deptEn(d) : v;
}
