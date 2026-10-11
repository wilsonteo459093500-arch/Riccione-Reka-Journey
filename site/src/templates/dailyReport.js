// 每日安装进度汇报 DAILY INSTALLATION REPORT —— 每天收工发群
// 来源：安装部每日汇报格式（溪岸定制安装汇报 1–8 项 + 落款 安装部 / 日期）
// 主输出 = text()（WhatsApp 文案）；字段标签带编号，PDF 读起来和文案一致。
// 文件语言：中文 = 原文；English = 同结构的英文版；中英 = 与中文版相同（原来的文案）。用户填写的内容原样输出。
import { val, langOf, optionText, plural, asciiParens, fileName, shownValues, siteLabelIn, deptIn } from './helpers.js';
import { siteLabel } from '../lib/report.js';
import { fmtDate, fmtDateDot, daysBetween } from '../lib/format.js';
import { reportLang } from '../lib/lang.js';

const ID = 'daily-report';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const str = (v) => (v == null ? '' : String(v).trim());
const lines = (v) => str(v).split('\n').map(str).filter(Boolean);
const has = (v) => (Array.isArray(v) ? v.filter(Boolean).length > 0 : !!str(v));

/**
 * 预计工期文案（第一天发总工期，往后依次递减）。lang = 'en' 时写英文，其他写中文。
 * durationText(5, 1) → '预计 5 天（今天第 1 天）'
 * durationText(5, 2) → '剩余 4 天（今天第 2 天 / 共 5 天）'
 * durationText(5, 6) → '已超出预计工期（今天第 6 天 / 原定 5 天）'
 * durationText(5, 2, 'en') → '4 days left (today is day 2 of 5)'
 */
export function durationText(total, dayN = 1, lang = 'zh') {
  const t = Number(total);
  if (total == null || total === '' || !Number.isFinite(t) || t <= 0) return '';
  const k = Math.max(1, Math.floor(Number(dayN) || 1));
  const left = t - k + 1;
  if (lang === 'en') {
    if (k === 1) return `Est. ${plural(t, 'day')} (today is day 1)`;
    if (left < 1) return `Over the planned duration (today is day ${k}; planned ${plural(t, 'day')})`;
    return `${plural(left, 'day')} left (today is day ${k} of ${t})`;
  }
  if (k === 1) return `预计 ${t} 天（今天第 1 天）`;
  if (left < 1) return `已超出预计工期（今天第 ${k} 天 / 原定 ${t} 天）`;
  return `剩余 ${left} 天（今天第 ${k} 天 / 共 ${t} 天）`;
}

// durationText 生成的三种写法（中 / 英）→ [总天数, 今天第几天]
const DURATION_FORMS = {
  zh: [
    [/^预计\s*(\d+)\s*天（今天第\s*1\s*天）$/, (m) => [m[1], 1]],
    [/^剩余\s*\d+\s*天（今天第\s*(\d+)\s*天\s*\/\s*共\s*(\d+)\s*天）$/, (m) => [m[2], m[1]]],
    [/^已超出预计工期（今天第\s*(\d+)\s*天\s*\/\s*原定\s*(\d+)\s*天）$/, (m) => [m[2], m[1]]],
  ],
  en: [
    [/^Est\.\s*(\d+)\s*days?\s*\(today is day 1\)$/i, (m) => [m[1], 1]],
    [/^\d+\s*days?\s*left\s*\(today is day\s*(\d+)\s*of\s*(\d+)\)$/i, (m) => [m[2], m[1]]],
    [/^Over the planned duration\s*\(today is day\s*(\d+);\s*planned\s*(\d+)\s*days?\)$/i, (m) => [m[2], m[1]]],
  ],
};

/**
 * 预计工期按文案语言输出：自动生成的写法换成另一种语言（中文报告发英文文案时），
 * 自己写的、或本来就是这种语言的照原样。
 */
export function durationIn(s, lang) {
  const text = String(s ?? '').trim();
  const from = lang === 'en' ? 'zh' : 'en';
  for (const [re, get] of DURATION_FORMS[from]) {
    const m = re.exec(text);
    if (m) {
      const [t, k] = get(m);
      return durationText(t, k, lang === 'en' ? 'en' : 'zh') || text;
    }
  }
  return text;
}

/** 预计工期字段的 display：文件 / 文案按语言写（English 用英文写法，中文 / 双语用中文写法）；没换时原样 */
function durationShown(v, ctx) {
  if (typeof v !== 'string') return v;
  const out = durationIn(v, langOf(ctx) === 'en' ? 'en' : 'zh');
  return out === v.trim() ? v : out;
}

// 只点开、什么都没填的草稿（如师傅开工前点链接看看）不算一个工作日
const FILLED = ['todayWork', 'progressPhotos', 'hygienePhotos', 'utilitiesPhotos', 'exitVideo'];
const filled = (r) => FILLED.some((k) => has(r?.values?.[k]));

/**
 * 之前的每日汇报：日期严格早于 date、已填写；同一项目（调用方没给项目时不限）；
 * 给了开工日期时，开工前的不算。不同项目 / 其他模板 / 本报告自己忽略。
 */
function earlierReports(previous, date, { projectId, reportId, startDate } = {}) {
  const today = fmtDate(date);
  if (!ISO.test(today)) return [];
  const start = fmtDate(startDate);
  return (previous || []).filter((p) => {
    if (!p || (reportId && p.id === reportId)) return false;
    if (p.templateId && p.templateId !== ID) return false;
    if (projectId && p.projectId && p.projectId !== projectId) return false;
    const d = fmtDate(p.values?.date);
    return ISO.test(d) && d < today && (!ISO.test(start) || d >= start) && filled(p);
  });
}

/** 今天是第几天：之前的每日汇报按日期去重计数 + 1（同一天补发只算一天） */
export function dayNumber(previous, date, opts = {}) {
  return new Set(earlierReports(previous, date, opts).map((p) => fmtDate(p.values.date))).size + 1;
}

// 中文「今天第 k 天」或英文「today is day k」
const DAY_RE = /今天第\s*(\d+)\s*天|today is day\s*(\d+)/i;

/**
 * 新建时自动带出预计工期（报告日期未定时按今天算）：
 * 1. 这台手机上有之前的汇报 → 接着最近那份的「今天第 k 天」往下数（手改过就照改过的数）
 * 2. 没有（如师傅中途接手、换了手机 / 浏览器）→ 按项目开工日期推算
 * 3. 最近那份没写第几天（旧报告）→ 按汇报计数，再补上开工到第一份汇报之间的天数
 */
export function autoDuration(ctx) {
  const date = fmtDate(ctx.report?.values?.date || ctx.today);
  const start = fmtDate(ctx.project?.startDate);
  const opts = { projectId: ctx.project?.id, reportId: ctx.report?.id, startDate: start };
  const earlier = earlierReports(ctx.previous, date, opts).sort((a, b) => fmtDate(a.values.date).localeCompare(fmtDate(b.values.date)));
  let n = 1;
  if (earlier.length) {
    const m = String(earlier[earlier.length - 1].values?.duration || '').match(DAY_RE);
    const k = Number(m?.[1] || m?.[2]);
    if (k > 0) n = k + 1;
    else {
      const first = fmtDate(earlier[0].values.date);
      n = dayNumber(ctx.previous, date, opts) + (ISO.test(start) && first > start ? daysBetween(start, first) : 0);
    }
  } else if (ISO.test(start) && ISO.test(date) && date > start) {
    n = daysBetween(start, date) + 1;
  }
  // 默认文件语言是 English 时写英文（报告 / 设置都没选时按中文，与原来一致）
  return durationText(ctx.project?.plannedDays, n, reportLang(ctx.report, ctx.settings) === 'en' ? 'en' : 'zh');
}

/** 单行：地址换行 → '，'（英文文案用 ', '） */
const oneLine = (v, lang = 'zh') =>
  lines(v)
    .map((s) => s.replace(/[,，、;；\s]+$/, ''))
    .filter(Boolean)
    .join(lang === 'en' ? ', ' : '，');

/** 编号行：单行直接接在后面；多行另起几行（colon：中文全角「：」，英文「: 」） */
function numbered(label, v, empty = '—', colon = '：') {
  const ls = lines(v);
  if (!ls.length) return `${label}${colon}${empty}`;
  if (ls.length === 1) return `${label}${colon}${ls[0]}`;
  return [`${label}${colon.trim()}`, ...ls].join('\n');
}

// 单选项：存的值仍是中文；enOnly = 纯英文文件 / 英文文案显示的文字（中文 / 双语照旧）
const OPT = (zh, enOnly) => ({ v: zh, zh, enOnly });
const YES_NO = [OPT('是', 'Yes'), OPT('否', 'No')];
const HYGIENE = [OPT('已清理', 'Cleaned'), OPT('未清理', 'Not cleaned')];
const UTILITIES = [OPT('已关闭', 'Off & locked'), OPT('未关闭', 'Not yet off & locked')];

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
  // 首页卡片一句话、输入框提示（placeholder）、字段说明（hint）只在 App 界面显示，跟界面语言：{ zh, en }
  desc: { zh: '每天收工发群：进度、卫生、水电门窗、退场视频', en: 'Post to the group after work: progress, cleanliness, utilities, exit video' },
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
          label: { zh: '1、地址', en: 'Address', enOnly: '1. Address' },
          rows: 2,
          bind: 'project.address',
          default: (ctx) => ctx.project?.address || siteLabel(ctx.project),
          display: siteLabelIn, // 项目没地址时带入的是工地称呼：英文文件里换半角括号
          placeholder: { zh: '项目地址', en: 'Project address' },
        },
        {
          key: 'duration',
          type: 'text',
          label: { zh: '2、预计工期', en: 'Planned duration', enOnly: '2. Planned duration' },
          default: autoDuration,
          display: durationShown,
          placeholder: { zh: '例：预计 5 天（今天第 1 天）', en: 'e.g. Est. 5 days (today is day 1)' },
          hint: {
            zh: '按项目「预计安装天数」自动倒数：第一天发总工期，往后依次递减（可手改）',
            en: "Counts down from the project's planned installation days: day 1 shows the total, then one less each day (editable)",
          },
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
          label: { zh: '3、今日内容', en: "Today's work", enOnly: "3. Today's work" },
          rows: 3,
          required: true,
          placeholder: { zh: '当天工作内容，例：鞋柜、主卧衣柜柜体安装完成', en: "Today's work, e.g. shoe cabinet and master wardrobe carcasses installed" },
          keepOnDuplicate: false,
        },
        { key: 'progressPhotos', type: 'photos', label: { zh: '今日进度照', en: 'Progress photos' }, max: 30, hint: { zh: '每柜每日进度照', en: 'Daily progress photos of every cabinet' } },
        { key: 'continueTomorrow', type: 'radio', label: { zh: '4、明天是否继续', en: 'Continue tomorrow', enOnly: '4. Continue tomorrow' }, options: YES_NO, default: '是' },
      ],
    },
    {
      id: 'closing',
      type: 'fields',
      title: { zh: '收工', en: 'CLOSING' },
      fields: [
        { key: 'hygiene', type: 'radio', label: { zh: '5、施工现场卫生', en: 'Site cleanliness', enOnly: '5. Site cleanliness' }, options: HYGIENE, default: '已清理' },
        { key: 'hygienePhotos', type: 'photos', label: { zh: '卫生照片', en: 'Cleanliness photos' }, max: 20 },
        { key: 'utilities', type: 'radio', label: { zh: '6、水电门窗', en: 'Water / power / doors & windows', enOnly: '6. Water / power / doors & windows' }, options: UTILITIES, default: '已关闭' },
        { key: 'utilitiesPhotos', type: 'photos', label: { zh: '水电门窗照片', en: 'Water / power / doors & windows photos' }, max: 20 },
        { key: 'exitVideo', type: 'video', label: { zh: '退场视频', en: 'Exit walkthrough video' }, hint: { zh: '收工前全场巡一遍拍视频', en: 'Walk the whole site and record a video before leaving' } },
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
          label: { zh: '7、下一步计划', en: 'Next plan', enOnly: '7. Next plan' },
          rows: 2,
          placeholder: { zh: '安装计划', en: 'Installation plan' },
          keepOnDuplicate: false,
        },
        { key: 'tips', type: 'textarea', label: { zh: '8、温馨提示', en: 'Reminders', enOnly: '8. Reminders' }, rows: 2, placeholder: { zh: '日常小提示或工种协调配合', en: 'Daily tips or coordination with other trades' } },
        { key: 'dept', type: 'text', label: { zh: '落款', en: 'Signed by' }, bind: 'settings.dept', default: '安装部', display: deptIn },
      ],
    },
  ],
  // 「3、今日内容」是必填字段，未填已由通用提醒提示，这里不重复
  // 提醒文字跟界面语言（ctx.lang）；中英时与通用提醒一样「中文 / English」
  checks(ctx) {
    const out = [];
    const tt = (zh, en) => ctx.t(zh, en, ' / ');
    if (!has(val(ctx, 'progressPhotos'))) out.push(tt('还没有今日进度照', 'No progress photos for today yet'));
    if (!has(val(ctx, 'hygienePhotos'))) out.push(tt('「5、施工现场卫生」还没有照片', '"5. Site cleanliness" has no photos yet'));
    if (!has(val(ctx, 'utilitiesPhotos'))) out.push(tt('「6、水电门窗」还没有照片', '"6. Water / power / doors & windows" has no photos yet'));
    if (!has(val(ctx, 'exitVideo'))) out.push(tt('还没有退场视频（收工前全场巡一遍拍视频）', 'No exit video yet (walk the whole site and record a video before leaving)'));
    if (val(ctx, 'hygiene') === '未清理') out.push(tt('施工现场卫生为「未清理」', 'Site cleanliness is marked "Not cleaned"'));
    if (val(ctx, 'utilities') === '未关闭') out.push(tt('水电门窗为「未关闭」，离场前请确认', 'Water / power / doors & windows marked "Not yet off & locked" — please check before leaving'));
    return out;
  },
  // WhatsApp 文案：标题 2 行 + 1–8 项 + 落款（安装部 / 2026.10.8 靠右）。English = 同结构的英文版；中英 = 原来的中文文案
  text(ctx) {
    return dailyText(ctx, langOf(ctx) === 'en' ? 'en' : 'zh');
  },
  filename(ctx) {
    const v = ctx.report.values || {};
    const where = ctx.project ? siteLabel(ctx.project) : lines(v.address)[0];
    return fileName(ctx, '安装汇报', 'Daily_Installation_Report', where, v.date);
  },
};

/** 一种语言的每日汇报（lang = 'zh' | 'en'）；工期 / 落款 / 地址按字段 display 换好（与文件里一致） */
function dailyText(ctx, lang) {
  const v = shownValues(ctx);
  const p = ctx.project;
  // 落款：字段为空时用「设置」里的部门 / 默认「安装部」（英文同样换成英文写法）
  const dept = str(v.dept) || str(deptIn(str(ctx.settings?.dept) || '安装部', ctx));
  const date = str(v.date) ? DATE_PAD + fmtDateDot(v.date) : null;
  if (lang === 'en') {
    const address = oneLine(v.address, 'en') || oneLine(p?.address, 'en') || asciiParens(siteLabel(p));
    const seen = has(v.hygienePhotos) ? ' (see photos)' : '';
    const util = (has(v.utilitiesPhotos) ? ' (see photos)' : '') + (has(v.exitVideo) ? ' (exit video attached)' : '');
    const out = [
      'Daily Installation Progress Report:',
      'Sail Custom Installation Report',
      `1. Address: ${address || '—'}`,
      `2. Planned duration: ${oneLine(v.duration, 'en') || '—'}`,
      numbered("3. Today's work", v.todayWork, '—', ': '),
      `4. Continue tomorrow: ${optionText(YES_NO, v.continueTomorrow, 'en') || '—'}`,
      `5. Site cleanliness: ${optionText(HYGIENE, v.hygiene, 'en') || '—'}${seen}`,
      `6. Water / power / doors & windows: ${optionText(UTILITIES, v.utilities, 'en') || '—'}${util}`,
      numbered('7. Next plan', v.nextPlan, '—', ': '),
      numbered('8. Reminders', v.tips, 'None', ': '),
      DEPT_PAD + dept,
    ];
    if (date) out.push(date);
    return out.join('\n');
  }
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
    DEPT_PAD + dept,
  ];
  if (date) out.push(date);
  return out.join('\n');
}
