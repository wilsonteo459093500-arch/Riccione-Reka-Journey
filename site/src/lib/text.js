// WhatsApp 文案 + 随文案一起分享的照片顺序
// 模板有 text() 就用它（进场通知 / 每日汇报）；否则给检查表生成通用摘要。
// 文件语言（lib/lang.js）：中文 = 中文摘要（双语标签只取中文）；English = 同结构的英文摘要；
// 中英 = 原来的摘要（逐字不变：中文标签 + 统计 / 结论照双语写法）。用户填写的内容（备注、项目名…）原样输出，不翻译。
import { resolveScale, L } from '../templates/schema.js';
import { pick, asciiParens, shownValue, shownValues } from '../templates/helpers.js';
import { makeCtx, siteLabel } from './report.js';
import { formatFieldValue, tablePhotoSlots } from './docmodel.js';
import { fmtDate } from './format.js';
import { normLang, reportLang } from './lang.js';

const str = (v) => (v == null ? '' : String(v).trim());
const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
/** 多行备注拼成一行（中文用「；」，英文用「; 」） */
const flat = (v, lang = 'zh') => str(v).split('\n').map(str).filter(Boolean).join(lang === 'en' ? '; ' : '；');
/** 标签按语言取一行：中英 = 原来的写法（只取中文，不看单语覆盖）；中文 / English 见 helpers.pick */
const lab = (x, lang) => (lang === 'both' ? L(x, 'zh') : pick(x, lang));

// 判定结果按 tone 归类（不写死 P / F，yes-no-na、GO / NO-GO 一样适用）
const TONE_ORDER = ['pass', 'fail', 'warn', 'na', 'neutral'];
const TONE_ICON = { pass: '✅', fail: '❌', warn: '⚠️', na: '➖', neutral: '🔘' };
const ISSUE_TONES = ['fail', 'warn'];

/** 文案里的固定文字：W[lang]（中英 = 原来的中文写法，见 w()） */
const W = {
  zh: {
    colon: '：',
    notDone: '未完成',
    blank: '未填',
    allDone: '✅ 全部完成',
    leftHead: '⬜ 未完成项：',
    failWord: '不合格项',
    issueWord: '问题项',
    none: (word) => `✅ 无${word}`,
    head: (word) => `❌ ${word}：`,
    tag: (label) => `【${label}】`,
    rows: (title, n) => `📋 ${title || '记录'}：${n} 条`,
    conclusion: '结论',
    report: '报告',
    title: (name, where) => `【${name}】${where}`,
  },
  en: {
    colon: ': ',
    notDone: 'Not done',
    blank: 'Not filled',
    allDone: '✅ All done',
    leftHead: '⬜ Not done:',
    failWord: 'failed items',
    issueWord: 'issues',
    none: (word) => `✅ No ${word}`,
    head: (word) => `❌ ${word[0].toUpperCase()}${word.slice(1)}:`,
    tag: (label) => ` [${label}]`,
    rows: (title, n) => `📋 ${title || 'Records'}: ${n} ${n === 1 ? 'entry' : 'entries'}`,
    conclusion: 'Conclusion',
    report: 'Report',
    title: (name, where) => `[${name}]${where ? ` ${where}` : ''}`,
  },
};
const w = (lang) => W[lang === 'en' ? 'en' : 'zh'];

/**
 * 判定选项按语言取文字：zh 优先用中文，en 优先用英文（单语覆盖 zhOnly / enOnly 见 schema.js）；
 * 中英 = 原来的写法（中文，没有中文才用英文）
 */
const optLabel = (o, lang) => (lang === 'both' ? o?.zh || o?.en : pick(o, lang)) || o?.v || '';

/** 所有判定项（跳过填写型 / 隐藏节），附带选中的选项 */
function judgedRows(template, report) {
  const rows = [];
  for (const s of template.sections || []) {
    if (s.type !== 'checklist' || s.hidden) continue;
    for (const it of s.items || []) {
      if (it.input) continue;
      const scale = resolveScale(it.scale || s.scale);
      const a = report.items?.[it.id];
      let opt = null;
      if (a?.r) opt = scale.options.find((o) => o.v === a.r) || { v: a.r, zh: String(a.r), tone: 'neutral' };
      rows.push({ section: s, item: it, scale, answer: a || {}, opt });
    }
  }
  return rows;
}

/** 只有「完成」一种选项的打勾清单（如交付清单）：没勾 = 未完成 */
const tickOnly = (rows) => rows.every((r) => !r.scale.options.some((o) => ISSUE_TONES.includes(o.tone)));

/** 项目编号：不同节编号重复时（01、02… 每节重来）加节号前缀，如 O2-04 */
function numberer(rows) {
  const nos = rows.map((r) => str(r.item.no));
  const dup = nos.some((n, i) => n && nos.indexOf(n) !== i);
  return (r, i) => {
    const no = str(r.item.no) || String(i + 1);
    const sec = str(r.section.no);
    return dup && sec && !no.startsWith(sec) ? `${sec}-${no}` : no;
  };
}

/** 统计行：✅ 合格 14 · ❌ 不合格 4 · ➖ 不适用 3 · ⬜ 未填 0 */
function countLine(rows, lang) {
  const words = w(lang);
  const tones = new Map();
  let empty = 0;
  for (const r of rows) {
    for (const o of r.scale.options) {
      const t = TONE_ORDER.includes(o.tone) ? o.tone : 'neutral';
      if (!tones.has(t)) tones.set(t, { n: 0, labels: [] });
      const g = tones.get(t);
      const label = optLabel(o, lang);
      if (!g.labels.includes(label)) g.labels.push(label);
    }
    if (!r.opt) empty += 1;
    else {
      const t = TONE_ORDER.includes(r.opt.tone) ? r.opt.tone : 'neutral';
      if (!tones.has(t)) tones.set(t, { n: 0, labels: [optLabel(r.opt, lang)] });
      tones.get(t).n += 1;
    }
  }
  const parts = TONE_ORDER.filter((t) => tones.has(t)).map((t) => {
    const g = tones.get(t);
    return `${TONE_ICON[t]} ${g.labels.join('/')} ${g.n}`;
  });
  parts.push(`⬜ ${tickOnly(rows) ? words.notDone : words.blank} ${empty}`);
  return parts.join(' · ');
}

/** 问题项（fail / warn）列表；标签都是「不合格」时不再逐条标注 */
function issueBlock(rows, lang) {
  const t = w(lang);
  const num = numberer(rows);
  if (tickOnly(rows)) {
    const left = rows.map((r, i) => ({ r, no: num(r, i) })).filter((x) => !x.r.opt);
    if (!left.length) return [t.allDone];
    return [t.leftHead, ...left.map(({ r, no }) => `${no}. ${lab(r.item.title, lang)}`)];
  }
  // 「问题项」还是「不合格项」按中文标签判断（与语言无关）
  const issueLabels = new Set();
  for (const r of rows) {
    for (const o of r.scale.options) if (ISSUE_TONES.includes(o.tone)) issueLabels.add(o.zh || o.v);
  }
  const plain = issueLabels.size === 0 || (issueLabels.size === 1 && issueLabels.has('不合格'));
  const word = plain ? t.failWord : t.issueWord;
  const answered = rows.filter((r) => r.opt).length;
  const bad = rows
    .map((r, i) => ({ ...r, no: num(r, i) }))
    .filter((r) => r.opt && ISSUE_TONES.includes(r.opt.tone));
  if (!bad.length) return answered ? [t.none(word)] : [];
  return [
    t.head(word),
    ...bad.map((r) => {
      const no = r.no;
      const star = r.item.key ? ' ★' : '';
      const tag = plain ? '' : t.tag(optLabel(r.opt, lang));
      const note = flat(r.answer.note, lang);
      return `${no}. ${lab(r.item.title, lang)}${star}${tag}${note ? ` — ${note}` : ''}`;
    }),
  ];
}

/** 表格节（如整改清单）：只报条数 */
function tableLines(template, report, lang) {
  const out = [];
  for (const s of template.sections || []) {
    if (s.type !== 'table' || s.hidden) continue;
    const slots = tablePhotoSlots(s);
    const rows = (report.tables?.[s.id] || []).filter(
      (r) =>
        r &&
        ((s.columns || []).some((c) => !isEmpty(r[c.key])) || slots.some((sl) => !isEmpty(r[sl.key]))),
    );
    if (rows.length) out.push(w(lang).rows(lab(s.title, lang), rows.length));
  }
  return out;
}

/** 模板 summary() 里的结论（conclusion，或标签为「结论 / 建议 / 判定」的统计项）；ctx.lang = lang */
function conclusionLines(template, ctx, lang) {
  if (typeof template.summary !== 'function') return [];
  let sum = null;
  try {
    sum = template.summary(ctx);
  } catch {
    return [];
  }
  if (!sum) return [];
  const t = w(lang);
  const text = (x) => (x == null ? '' : typeof x === 'string' ? x : lab(x, lang));
  const out = [];
  const c = sum.conclusion;
  if (c && text(c.value)) {
    out.push(`📌 ${text(c.label) || t.conclusion}${t.colon}${text(c.value)}`);
    if (text(c.note)) out.push(text(c.note));
  } else {
    for (const it of sum.items || []) {
      // 用中文标签认「结论 / 建议 / 判定」，输出按语言
      const key = typeof it.label === 'string' ? it.label : L(it.label, 'zh');
      if (/结论|建议|判定/.test(key) && text(it.value)) out.push(`📌 ${text(it.label)}${t.colon}${text(it.value)}`);
    }
  }
  return out;
}

/** 只有字段的模板（无 text()）：逐行「标签：值」；值按字段 display 换好（与文件里一致） */
function fieldLines(ctx, lang) {
  const { template, report } = ctx;
  const out = [];
  const colon = w(lang).colon;
  for (const s of template.sections || []) {
    if (s.type !== 'fields' || s.hidden) continue;
    for (const f of s.fields || []) {
      if (f.hidden || ['photos', 'video'].includes(f.type) || ['project', 'date'].includes(f.key)) continue;
      const raw = report.values?.[f.key];
      if (isEmpty(raw)) continue;
      const v = shownValue(f, raw, ctx);
      const fv = formatFieldValue(f, v, lang);
      // 选项文字：单语按语言（含单语覆盖），与 docmodel 一致；中英照原来的「中文 English」
      if (lang !== 'both' && ['select', 'radio', 'chips'].includes(f.type)) fv.value = optionValues(f, v, lang);
      const label = lab(typeof f.label === 'string' ? { zh: f.label } : f.label, lang);
      if (fv.kind === 'list' || (fv.kind === 'block' && fv.value.includes('\n'))) {
        out.push(`${label}${colon.trim()}`, ...str(fv.value).split('\n').map(str).filter(Boolean));
      } else if (str(fv.value)) out.push(`${label}${colon}${str(fv.value)}`);
    }
  }
  return out;
}

/** 选择题的值 → 文字（多选用 ' / ' 连接；自己填的值原样） */
function optionValues(field, value, lang) {
  const opts = (field.options || []).map((o) => (typeof o === 'string' ? { v: o, zh: o } : o));
  const arr = Array.isArray(value) ? value : isEmpty(value) ? [] : [value];
  return arr
    .map((v) => {
      const o = opts.find((x) => x.v === v);
      return o ? optLabel(o, lang) : String(v);
    })
    .join(' / ');
}

/** 通用摘要（检查表类模板）：lang = 'zh' | 'en' | 'both'（= 原来的摘要），与 ctx.lang 一致 */
function genericText(ctx, lang) {
  const { template, report, project, settings } = ctx;
  const t = w(lang);
  const v = shownValues(ctx); // 自动带入的工地称呼等按字段 display 换好
  let where = str(v.project) || siteLabel(project) || flat(v.address, lang);
  // 自动带入的「工地称呼」在英文里用半角括号；用户自己写的照原样
  if (lang === 'en' && project && where === siteLabel(project)) where = asciiParens(where);
  const blocks = [];

  const name = lab(template.name, lang) || t.report;
  const head = [t.title(name, where)];
  const meta = [fmtDate(v.date), str(settings?.name)].filter(Boolean);
  if (meta.length) head.push(`📅 ${meta.join(' · ')}`);
  const rows = judgedRows(template, report);
  if (rows.length) head.push(countLine(rows, lang));
  blocks.push(head);

  if (rows.length) {
    const issues = issueBlock(rows, lang);
    if (issues.length) blocks.push(issues);
  } else {
    const fl = fieldLines(ctx, lang);
    if (fl.length) blocks.push(fl);
  }
  const tl = tableLines(template, report, lang);
  if (tl.length) blocks.push(tl);
  const cl = conclusionLines(template, ctx, lang);
  if (cl.length) blocks.push(cl);
  if (str(settings?.name)) blocks.push([`— ${str(settings.name)}`]);

  return blocks.map((b) => b.join('\n')).join('\n\n');
}

/**
 * WhatsApp 文案。
 * @param {{ template, report, project?, settings?, previous?, lang? }} args
 *   lang 不给时用 report.lang / settings.docLang（都没有 = 中英 = 原来的文案，逐字不变）
 * @returns string
 */
export function buildText({ template, report, project, settings, previous, lang }) {
  const lg = lang ? normLang(lang) : reportLang(report, settings);
  const ctx = makeCtx({ template, report, project, settings, previous, lang: lg });
  if (typeof template.text === 'function') {
    try {
      return String(template.text(ctx) ?? '').replace(/\s+$/, '');
    } catch (e) {
      // 模板文案出错时退回通用摘要，不让分享页白屏
      console.error('[text] template.text failed', template.id, e);
    }
  }
  return genericText(ctx, lg);
}

/**
 * 随文案一起分享的媒体 id（按顺序、去重）：
 * 字段照片 → 检查项照片 → 表格照片 → 视频（视频放最后）。签名不分享。与文件语言无关。
 */
export function photoListForShare(template, report) {
  const seen = new Set();
  const photos = [];
  const videos = [];
  const push = (list, id) => {
    if (typeof id !== 'string' || !id || seen.has(id)) return;
    seen.add(id);
    list.push(id);
  };
  const sections = (template.sections || []).filter((s) => !s.hidden);
  for (const s of sections) {
    if (s.type !== 'fields') continue;
    for (const f of s.fields || []) {
      if (f.hidden) continue;
      const v = report.values?.[f.key];
      if (f.type === 'photos') (Array.isArray(v) ? v : []).forEach((id) => push(photos, id));
      else if (f.type === 'video') (Array.isArray(v) ? v : [v]).forEach((id) => push(videos, id));
    }
  }
  for (const s of sections) {
    if (s.type !== 'checklist') continue;
    for (const it of s.items || []) (report.items?.[it.id]?.photos || []).forEach((id) => push(photos, id));
  }
  for (const s of sections) {
    if (s.type !== 'table') continue;
    const slots = tablePhotoSlots(s);
    for (const row of report.tables?.[s.id] || []) {
      for (const sl of slots) (row?.[sl.key] || []).forEach((id) => push(photos, id));
    }
  }
  return [...photos, ...videos];
}
