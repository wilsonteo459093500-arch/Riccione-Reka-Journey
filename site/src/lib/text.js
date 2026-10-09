// WhatsApp 文案 + 随文案一起分享的照片顺序
// 模板有 text() 就用它（进场通知 / 每日汇报）；否则给检查表生成通用摘要。
import { resolveScale, L } from '../templates/schema.js';
import { makeCtx, siteLabel } from './report.js';
import { formatFieldValue, tablePhotoSlots } from './docmodel.js';
import { fmtDate } from './format.js';

const str = (v) => (v == null ? '' : String(v).trim());
const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
const flat = (v) => str(v).split('\n').map(str).filter(Boolean).join('；');

// 判定结果按 tone 归类（不写死 P / F，yes-no-na、GO / NO-GO 一样适用）
const TONE_ORDER = ['pass', 'fail', 'warn', 'na', 'neutral'];
const TONE_ICON = { pass: '✅', fail: '❌', warn: '⚠️', na: '➖', neutral: '🔘' };
const ISSUE_TONES = ['fail', 'warn'];

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
function countLine(rows) {
  const tones = new Map();
  let empty = 0;
  for (const r of rows) {
    for (const o of r.scale.options) {
      const t = TONE_ORDER.includes(o.tone) ? o.tone : 'neutral';
      if (!tones.has(t)) tones.set(t, { n: 0, labels: [] });
      const g = tones.get(t);
      const label = o.zh || o.en || o.v;
      if (!g.labels.includes(label)) g.labels.push(label);
    }
    if (!r.opt) empty += 1;
    else {
      const t = TONE_ORDER.includes(r.opt.tone) ? r.opt.tone : 'neutral';
      if (!tones.has(t)) tones.set(t, { n: 0, labels: [r.opt.zh || r.opt.v] });
      tones.get(t).n += 1;
    }
  }
  const parts = TONE_ORDER.filter((t) => tones.has(t)).map((t) => {
    const g = tones.get(t);
    return `${TONE_ICON[t]} ${g.labels.join('/')} ${g.n}`;
  });
  parts.push(`⬜ ${tickOnly(rows) ? '未完成' : '未填'} ${empty}`);
  return parts.join(' · ');
}

/** 问题项（fail / warn）列表；标签都是「不合格」时不再逐条标注 */
function issueBlock(rows) {
  const num = numberer(rows);
  if (tickOnly(rows)) {
    const left = rows.map((r, i) => ({ r, no: num(r, i) })).filter((x) => !x.r.opt);
    if (!left.length) return ['✅ 全部完成'];
    return ['⬜ 未完成项：', ...left.map(({ r, no }) => `${no}. ${L(r.item.title, 'zh')}`)];
  }
  const issueLabels = new Set();
  for (const r of rows) {
    for (const o of r.scale.options) if (ISSUE_TONES.includes(o.tone)) issueLabels.add(o.zh || o.v);
  }
  const plain = issueLabels.size === 0 || (issueLabels.size === 1 && issueLabels.has('不合格'));
  const word = plain ? '不合格项' : '问题项';
  const answered = rows.filter((r) => r.opt).length;
  const bad = rows
    .map((r, i) => ({ ...r, no: num(r, i) }))
    .filter((r) => r.opt && ISSUE_TONES.includes(r.opt.tone));
  if (!bad.length) return answered ? [`✅ 无${word}`] : [];
  return [
    `❌ ${word}：`,
    ...bad.map((r) => {
      const no = r.no;
      const star = r.item.key ? ' ★' : '';
      const tag = plain ? '' : `【${r.opt.zh || r.opt.v}】`;
      const note = flat(r.answer.note);
      return `${no}. ${L(r.item.title, 'zh')}${star}${tag}${note ? ` — ${note}` : ''}`;
    }),
  ];
}

/** 表格节（如整改清单）：只报条数 */
function tableLines(template, report) {
  const out = [];
  for (const s of template.sections || []) {
    if (s.type !== 'table' || s.hidden) continue;
    const slots = tablePhotoSlots(s);
    const rows = (report.tables?.[s.id] || []).filter(
      (r) =>
        r &&
        ((s.columns || []).some((c) => !isEmpty(r[c.key])) || slots.some((sl) => !isEmpty(r[sl.key]))),
    );
    if (rows.length) out.push(`📋 ${L(s.title, 'zh') || '记录'}：${rows.length} 条`);
  }
  return out;
}

/** 模板 summary() 里的结论（conclusion，或标签为「结论 / 建议 / 判定」的统计项） */
function conclusionLines(template, ctx) {
  if (typeof template.summary !== 'function') return [];
  let sum = null;
  try {
    sum = template.summary(ctx);
  } catch {
    return [];
  }
  if (!sum) return [];
  const text = (x) => (x == null ? '' : typeof x === 'string' ? x : L(x, 'zh'));
  const out = [];
  const c = sum.conclusion;
  if (c && text(c.value)) {
    out.push(`📌 ${text(c.label) || '结论'}：${text(c.value)}`);
    if (text(c.note)) out.push(text(c.note));
  } else {
    for (const it of sum.items || []) {
      const label = text(it.label);
      if (/结论|建议|判定/.test(label) && text(it.value)) out.push(`📌 ${label}：${text(it.value)}`);
    }
  }
  return out;
}

/** 只有字段的模板（无 text()）：逐行「标签：值」 */
function fieldLines(template, report) {
  const out = [];
  for (const s of template.sections || []) {
    if (s.type !== 'fields' || s.hidden) continue;
    for (const f of s.fields || []) {
      if (f.hidden || ['photos', 'video'].includes(f.type) || ['project', 'date'].includes(f.key)) continue;
      const v = report.values?.[f.key];
      if (isEmpty(v)) continue;
      const fv = formatFieldValue(f, v);
      const label = L(typeof f.label === 'string' ? { zh: f.label } : f.label, 'zh');
      if (fv.kind === 'list' || (fv.kind === 'block' && fv.value.includes('\n'))) {
        out.push(`${label}：`, ...str(fv.value).split('\n').map(str).filter(Boolean));
      } else if (str(fv.value)) out.push(`${label}：${str(fv.value)}`);
    }
  }
  return out;
}

/** 通用摘要（检查表类模板） */
function genericText(ctx) {
  const { template, report, project, settings } = ctx;
  const v = report.values || {};
  const where = str(v.project) || siteLabel(project) || flat(v.address);
  const blocks = [];

  const head = [`【${template.name?.zh || template.name?.en || '报告'}】${where}`];
  const meta = [fmtDate(v.date), str(settings?.name)].filter(Boolean);
  if (meta.length) head.push(`📅 ${meta.join(' · ')}`);
  const rows = judgedRows(template, report);
  if (rows.length) head.push(countLine(rows));
  blocks.push(head);

  if (rows.length) {
    const issues = issueBlock(rows);
    if (issues.length) blocks.push(issues);
  } else {
    const fl = fieldLines(template, report);
    if (fl.length) blocks.push(fl);
  }
  const tl = tableLines(template, report);
  if (tl.length) blocks.push(tl);
  const cl = conclusionLines(template, ctx);
  if (cl.length) blocks.push(cl);
  if (str(settings?.name)) blocks.push([`— ${str(settings.name)}`]);

  return blocks.map((b) => b.join('\n')).join('\n\n');
}

/**
 * WhatsApp 文案。
 * @param {{ template, report, project?, settings?, previous? }} args
 * @returns string
 */
export function buildText({ template, report, project, settings, previous }) {
  const ctx = makeCtx({ template, report, project, settings, previous });
  if (typeof template.text === 'function') {
    try {
      return String(template.text(ctx) ?? '').replace(/\s+$/, '');
    } catch (e) {
      // 模板文案出错时退回通用摘要，不让分享页白屏
      console.error('[text] template.text failed', template.id, e);
    }
  }
  return genericText(ctx);
}

/**
 * 随文案一起分享的媒体 id（按顺序、去重）：
 * 字段照片 → 检查项照片 → 表格照片 → 视频（视频放最后）。签名不分享。
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
