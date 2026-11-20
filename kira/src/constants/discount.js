// ============================================================
// 折扣只能是 0–100%（体检 2026-11-19 问题 9）
// 以前折扣框什么都收：150% → 总价变成负数；−10% → 变成加价。
// pricing.js 要和旧报价工具一字不差（VENDOR.json 指纹），所以在外面把关：
//   画面上的折扣框、算钱前、读旧记录时都过这里。旧记录里存了怪数字的，打开时也照 0–100% 算。
// 要不要再设「最多打几折 / 要谁批准」由老板定，这里只挡不可能的数字。
// ============================================================
import { computeQuote, computeLoose, discountChainRate } from './pricing.js';

export const PCT_MIN = 0;
export const PCT_MAX = 100;

// 百分比折扣：夹在 0–100；空的 / 乱打 → 0
export const clampPct = (v) => { const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v); return Number.isFinite(n) ? Math.min(PCT_MAX, Math.max(PCT_MIN, n)) : 0; };
// 定额折扣（RM）：不能是负数（上限 = 可折扣金额，computeQuote 本来就有）
export const clampAmt = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, n) : 0; };
export const pctOutOfRange = (v) => { const n = Number(v); return Number.isFinite(n) && (n < PCT_MIN || n > PCT_MAX); };

// 设计师折扣链 "30+10"：每一段夹在 0–100，打到一半的（"30+"）、乱打的丢掉 → "30+10"
export function cleanDiscChain(str) {
  return String(str ?? '').split('+').map((s) => parseFloat(s.trim())).filter((n) => !Number.isNaN(n)).map((n) => String(clampPct(n))).join('+');
}
export const safeChainRate = (str) => discountChainRate(cleanDiscChain(str));

// 算钱一律走这两个（百分比先夹好）
export const quoteOf = (zones, adjustPct, discountMode, discountAmt) => computeQuote(zones, clampPct(adjustPct), discountMode, discountAmt);
export const looseOf = (items, adjustPct, discountMode, discountAmt) => computeLoose(items, clampPct(adjustPct), discountMode, discountAmt);
