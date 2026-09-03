import { MM_PER_FT } from '../constants.js';

export const mmToFt = (mm) => mm / MM_PER_FT;
export const ftToMm = (ft) => ft * MM_PER_FT;

/** 按当前单位格式化长度（内部一律以 mm 存储） */
export function fmtLen(mm, unit = 'mm') {
  if (!isFinite(mm)) return '—';
  if (unit === 'm') return `${(mm / 1000).toFixed(2)} m`;
  if (unit === 'ft') return `${mmToFt(mm).toFixed(2)} ft`;
  return `${Math.round(mm)} mm`;
}

/** 汇总处同时给出米 + 尺，报价按尺走 */
export function fmtBoth(mm) {
  if (!isFinite(mm)) return '—';
  return `${(mm / 1000).toFixed(2)} m · ${mmToFt(mm).toFixed(2)} ft`;
}

export function fmtMoney(v, currency = 'RM') {
  if (!isFinite(v)) return '—';
  return `${currency} ${Math.round(v).toLocaleString('en-MY')}`;
}

/** "3600"、"3.6m"、"12ft"、"12'" 都能解析成 mm */
export function parseLenToMm(raw, unit = 'mm') {
  if (raw == null) return NaN;
  const s = String(raw).trim().toLowerCase().replace(/,/g, '');
  if (!s) return NaN;
  const m = s.match(/^(-?\d*\.?\d+)\s*(mm|cm|m|ft|'|尺|米|厘米|毫米)?$/);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return NaN;
  const suffix = m[2];
  if (!suffix) {
    // 没写单位就按当前显示单位理解
    if (unit === 'm') return n * 1000;
    if (unit === 'ft') return ftToMm(n);
    return n;
  }
  if (suffix === 'mm' || suffix === '毫米') return n;
  if (suffix === 'cm' || suffix === '厘米') return n * 10;
  if (suffix === 'm' || suffix === '米') return n * 1000;
  return ftToMm(n); // ft / ' / 尺
}
