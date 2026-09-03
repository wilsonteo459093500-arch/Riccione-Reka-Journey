import { KINDS, BILLABLE, MM_PER_FT } from '../constants.js';
import { pathLength } from './geometry.js';

/** 一条测量的实际长度（mm）；没标定比例时返回 null */
export function itemMm(item, mmPerPx) {
  if (!mmPerPx) return null;
  return pathLength(item.points) * mmPerPx;
}

/**
 * 汇总：按柜体分类算延尺 + 报价，并把校验线的误差单独列出来。
 * 隐藏 (hidden) 的条目不计入。
 */
export function summarize(items, mmPerPx, rates = {}) {
  const active = items.filter((i) => !i.hidden && i.points.length >= 2);

  const byKind = KINDS.filter((k) => k.id !== 'check').map((k) => {
    const rows = active.filter((i) => i.kind === k.id);
    const mm = rows.reduce((s, i) => s + (itemMm(i, mmPerPx) || 0), 0);
    const rate = Number(rates[k.id]) || 0;
    return {
      ...k,
      count: rows.length,
      mm,
      ft: mm / MM_PER_FT,
      rate,
      amount: BILLABLE.includes(k.id) ? (mm / MM_PER_FT) * rate : 0,
    };
  });

  const billable = byKind.filter((k) => BILLABLE.includes(k.id));
  const totalMm = billable.reduce((s, k) => s + k.mm, 0);
  const totalAmount = billable.reduce((s, k) => s + k.amount, 0);

  const checks = active
    .filter((i) => i.kind === 'check' && Number(i.expectedMm) > 0)
    .map((i) => {
      const measured = itemMm(i, mmPerPx) || 0;
      const expected = Number(i.expectedMm);
      return {
        id: i.id,
        label: i.label,
        expected,
        measured,
        diff: measured - expected,
        errPct: expected ? ((measured - expected) / expected) * 100 : 0,
      };
    });

  return { byKind, billable, totalMm, totalFt: totalMm / MM_PER_FT, totalAmount, checks };
}
