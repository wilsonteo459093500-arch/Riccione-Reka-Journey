// 日期 / 时间格式化（全部按本地时区，避免 toISOString 的时差坑）
import { getUiLang } from './i18n.js';

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' → Date（本地午夜）。无效返回 null。 */
export function parseISODate(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date → 'YYYY-MM-DD'（本地）。 */
export function toISODate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayISO = () => toISODate(new Date());

/** '2026-10-09' → '10月9日 周五' */
export function fmtDateCN(iso) {
  const d = parseISODate(iso);
  if (!d) return iso || '';
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}`;
}

const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 界面上显示的日期（跟界面语言）：中文 / 中英 '10月9日 周五'；English 'Fri, 9 Oct' */
export function fmtDateUi(iso) {
  const d = parseISODate(iso);
  if (!d) return iso || '';
  if (getUiLang() !== 'en') return fmtDateCN(iso);
  return `${WEEK_EN[d.getDay()]}, ${d.getDate()} ${MONTH_EN[d.getMonth()]}`;
}

/** '2026-10-08' → '2026.10.8' */
export function fmtDateDot(iso) {
  const d = parseISODate(iso);
  if (!d) return iso || '';
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

/** '2026-10-08' → '2026-10-08'（规整显示） */
export function fmtDate(iso) {
  const d = parseISODate(iso);
  return d ? toISODate(d) : iso || '';
}

/** 两个 ISO 日期相差天数（b - a）。 */
export function daysBetween(a, b) {
  const da = parseISODate(a);
  const db = parseISODate(b);
  if (!da || !db) return null;
  return Math.round((db - da) / 86400000);
}

/** ISO + n 天 */
export function addDays(iso, n) {
  const d = parseISODate(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** 'HH:MM' 规整（'8:45' → '8:45'，保留用户写法；空值返回 ''） */
export function fmtTime(t) {
  if (!t) return '';
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  return `${Number(m[1])}:${m[2]}`;
}

/** 时间戳 → '10/9 14:05' 用于列表 */
export function fmtStamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 文件名安全化 */
export function safeFilename(s) {
  return (
    String(s || 'report')
      .replace(/[\\/:*?"<>|\n\r\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'report'
  );
}
