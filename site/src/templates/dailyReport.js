// 每日安装进度汇报 DAILY INSTALLATION REPORT —— 每天收工发群
// 来源：安装部每日汇报格式（溪岸定制安装汇报 1–8 项 + 落款 安装部 / 日期）
// 主输出 = text()（WhatsApp 文案）；字段标签带编号，PDF 读起来和文案一致。
import { val } from './helpers.js';
import { siteLabel } from '../lib/report.js';
import { fmtDate, fmtDateDot, daysBetween } from '../lib/format.js';

const ID = 'daily-report';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const str = (v) => (v == null ? '' : String(v).trim());
const lines = (v) => str(v).split('\n').map(str).filter(Boolean);
const has = (v) => (Array.isArray(v) ? v.filter(Boolean).length > 0 : !!str(v));

/**
 * 预计工期文案（第一天发总工期，往后依次递减）。
 * durationText(5, 1) → '预计 5 天（今天第 1 天）'
 * durationText(5, 2) → '剩余 4 天（今天第 2 天 / 共 5 天）'
 * durationText(5, 6) → '已超出预计工期（今天第 6 天 / 原定 5 天）'
 */
export function durationText(total, dayN = 1) {
  const t = Number(total);
  if (total == null || total === '' || !Number.isFinite(t) || t <= 0) return '';
  const k = Math.max(1, Math.floor(Number(dayN) || 1));
  if (k === 1) return `预计 ${t} 天（今天第 1 天）`;
  const left = t - k + 1;
  if (left < 1) return `已超出预计工期（今天第 ${k} 天 / 原定 ${t} 天）`;
  return `剩余 ${left} 天（今天第 ${k} 天 / 共 ${t} 天）`;
}

/**
 * 今天是第几天：之前（日期严格早于 date）的每日汇报按日期去重计数 + 1。
 * 同一天补发 / 日期更晚的汇报不算；不同项目 / 其他模板的报告忽略。
 */
export function dayNumber(previous, date, { projectId, reportId } = {}) {
  const today = fmtDate(date);
  if (!ISO.test(today)) return 1;
  const days = new Set();
  for (const p of previous || []) {
    if (!p || (reportId && p.id === reportId)) continue;
    if (p.templateId && p.templateId !== ID) continue;
    if (projectId && p.projectId && p.projectId !== projectId) continue;
    const d = fmtDate(p.values?.date);
    if (ISO.test(d) && d < today) days.add(d);
  }
  return days.size + 1;
}

/** 新建时自动带出预计工期（报告日期未定时按今天算） */
export function autoDuration(ctx) {
  const date = fmtDate(ctx.report?.values?.date || ctx.today);
  let n = dayNumber(ctx.previous, date, { projectId: ctx.project?.id, reportId: ctx.report?.id });
  // 这台手机上没有之前的汇报（如师傅换了手机 / 浏览器）：按项目开工日期推算第几天
  const start = fmtDate(ctx.project?.startDate);
  if (n === 1 && ISO.test(start) && ISO.test(date) && date > start) n = daysBetween(start, date) + 1;
  return durationText(ctx.project?.plannedDays, n);
}

/** 单行：地址换行 → '，' */
const oneLine = (v) =>
  lines(v)
    .map((s) => s.replace(/[,，、;；\s]+$/, ''))
    .filter(Boolean)
    .join('，');

/** 编号行：单行直接接在后面；多行另起几行 */
function numbered(label, v, empty = '—') {
  const ls = lines(v);
  if (!ls.length) return `${label}：${empty}`;
  if (ls.length === 1) return `${label}：${ls[0]}`;
  return [`${label}：`, ...ls].join('\n');
}

// 落款缩进（与原文一致：安装部 / 日期 靠右）
const DEPT_PAD = ' '.repeat(26);
const DATE_PAD = ' '.repeat(25);

export default {
  id: ID,
  version: 1,
  kind: 'message',
  stage: 4,
  name: { zh: '每日安装汇报', en: 'Daily Installation Report' },
  short: '日报',
  desc: '每天收工发群：进度、卫生、水电门窗、退场视频',
  icon: 'CalendarCheck',
  accent: '#B5623A',
  doc: {
    brand: 'sail',
    title: { zh: '溪岸定制安装汇报', en: 'DAILY INSTALLATION REPORT' },
    subtitle: { zh: '每日安装进度汇报', en: 'Daily installation progress update' },
  },
  sections: [
    {
      id: 'info',
      type: 'fields',
      title: { zh: '基本', en: 'BASICS' },
      fields: [
        { key: 'date', type: 'date', label: { zh: '汇报日期', en: 'Report date' }, bind: 'today', required: true },
        {
          key: 'address',
          type: 'textarea',
          label: { zh: '1、地址', en: 'Address' },
          rows: 2,
          bind: 'project.address',
          default: (ctx) => ctx.project?.address || siteLabel(ctx.project),
          placeholder: '项目地址',
        },
        {
          key: 'duration',
          type: 'text',
          label: { zh: '2、预计工期', en: 'Planned duration' },
          default: autoDuration,
          placeholder: '例：预计 5 天（今天第 1 天）',
          hint: '按项目「预计安装天数」自动倒数：第一天发总工期，往后依次递减（可手改）',
        },
      ],
    },
    {
      id: 'today',
      type: 'fields',
      title: { zh: '今日', en: 'TODAY' },
      fields: [
        {
          key: 'todayWork',
          type: 'textarea',
          label: { zh: '3、今日内容', en: "Today's work" },
          rows: 3,
          required: true,
          placeholder: '当天工作内容，例：鞋柜、主卧衣柜柜体安装完成',
          keepOnDuplicate: false,
        },
        { key: 'progressPhotos', type: 'photos', label: { zh: '今日进度照', en: 'Progress photos' }, max: 30, hint: '每柜每日进度照' },
        { key: 'continueTomorrow', type: 'radio', label: { zh: '4、明天是否继续', en: 'Continue tomorrow' }, options: ['是', '否'], default: '是' },
      ],
    },
    {
      id: 'closing',
      type: 'fields',
      title: { zh: '收工', en: 'CLOSING' },
      fields: [
        { key: 'hygiene', type: 'radio', label: { zh: '5、施工现场卫生', en: 'Site cleanliness' }, options: ['已清理', '未清理'], default: '已清理' },
        { key: 'hygienePhotos', type: 'photos', label: { zh: '卫生照片', en: 'Cleanliness photos' }, max: 20 },
        { key: 'utilities', type: 'radio', label: { zh: '6、水电门窗', en: 'Water / power / doors & windows' }, options: ['已关闭', '未关闭'], default: '已关闭' },
        { key: 'utilitiesPhotos', type: 'photos', label: { zh: '水电门窗照片', en: 'Water / power / doors & windows photos' }, max: 20 },
        { key: 'exitVideo', type: 'video', label: { zh: '退场视频', en: 'Exit walkthrough video' }, hint: '收工前全场巡一遍拍视频' },
      ],
    },
    {
      id: 'next',
      type: 'fields',
      title: { zh: '下一步', en: 'NEXT' },
      fields: [
        {
          key: 'nextPlan',
          type: 'textarea',
          label: { zh: '7、下一步计划', en: 'Next plan' },
          rows: 2,
          placeholder: '安装计划',
          keepOnDuplicate: false,
        },
        { key: 'tips', type: 'textarea', label: { zh: '8、温馨提示', en: 'Reminders' }, rows: 2, placeholder: '日常小提示或工种协调配合' },
        { key: 'dept', type: 'text', label: { zh: '落款', en: 'Signed by' }, bind: 'settings.dept', default: '安装部' },
      ],
    },
  ],
  // 「3、今日内容」是必填字段，未填已由通用提醒提示，这里不重复
  checks(ctx) {
    const out = [];
    if (!has(val(ctx, 'progressPhotos'))) out.push('还没有今日进度照');
    if (!has(val(ctx, 'hygienePhotos'))) out.push('「5、施工现场卫生」还没有照片');
    if (!has(val(ctx, 'utilitiesPhotos'))) out.push('「6、水电门窗」还没有照片');
    if (!has(val(ctx, 'exitVideo'))) out.push('还没有退场视频（收工前全场巡一遍拍视频）');
    if (val(ctx, 'hygiene') === '未清理') out.push('施工现场卫生为「未清理」');
    if (val(ctx, 'utilities') === '未关闭') out.push('水电门窗为「未关闭」，离场前请确认');
    return out;
  },
  // WhatsApp 文案：标题 2 行 + 1–8 项 + 落款（安装部 / 2026.10.8 靠右）
  text(ctx) {
    const v = ctx.report.values || {};
    const p = ctx.project;
    const address = oneLine(v.address) || oneLine(p?.address) || siteLabel(p);
    const seen = has(v.hygienePhotos) ? '（见图）' : '';
    const util = (has(v.utilitiesPhotos) ? '（见图）' : '') + (has(v.exitVideo) ? '（附退场视频）' : '');
    const out = [
      '每日安装进度汇报：',
      '溪岸定制安装汇报',
      `1、地址：${address || '—'}`,
      `2、预计工期：${oneLine(v.duration) || '—'}`,
      numbered('3、今日内容', v.todayWork),
      `4、明天是否继续：${str(v.continueTomorrow) || '—'}`,
      `5、施工现场卫生：${str(v.hygiene) || '—'}${seen}`,
      `6、水电门窗：${str(v.utilities) || '—'}${util}`,
      numbered('7、下一步计划', v.nextPlan),
      numbered('8、温馨提示', v.tips, '无'),
      DEPT_PAD + (str(v.dept) || str(ctx.settings?.dept) || '安装部'),
    ];
    if (str(v.date)) out.push(DATE_PAD + fmtDateDot(v.date));
    return out.join('\n');
  },
  filename(ctx) {
    const v = ctx.report.values || {};
    const where = ctx.project ? siteLabel(ctx.project) : lines(v.address)[0];
    return ['安装汇报', where, v.date].filter(Boolean).join('_');
  },
};
