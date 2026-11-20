// ============================================================
// 报价单 / Excel 上印的金额：逐行加起来 = 小计，小计加起来 = 总额（纯函数，Node 测试 test/shownMoney.test.mjs）
//
// 每一行各自四舍五入到 RM 1，加起来会和「先加起来再四舍五入」的小计差 RM 1–3，客人自己加一遍会对不上。
// 钱的算法不动：小计、总额照旧（pricing.js / 黄金值）。只动「印出来的那一行」：
//   差几块钱，就从四舍五入时被舍掉（或进位）最多的行开始，每行调 RM 1。所以每一行离它的精确值不到 RM 1。
// ============================================================
const num = (v) => Number(v) || 0;

// values：每一行的精确金额；target：这些行要加到的数（整数）→ 每一行印出来的整数
// 差太多（不是四舍五入造成的，例：有明细没印出来）→ 不硬凑，照旧各自四舍五入，让差额看得见。
export function splitRounded(values, target) {
  const v = (values || []).map(num);
  const out = v.map((x) => Math.round(x));
  const want = Math.round(num(target));
  const exact = v.reduce((a, b) => a + b, 0);
  let diff = want - out.reduce((a, b) => a + b, 0);
  if (!diff || Math.abs(want - exact) > v.length * 0.5 + 1) return out;
  const up = diff > 0;
  // 要加：先加被舍掉最多的；要减：先减进位最多的。一样多 → 金额大的先（影响最小）。0 元的行不动。
  const lost = (i) => Math.round((up ? v[i] - out[i] : out[i] - v[i]) * 1e6); // 取到小数 6 位：10.4 − 10 和 30.4 − 30 算一样多
  const order = v.map((x, i) => i).filter((i) => v[i] !== 0).sort((a, b) => (lost(b) - lost(a)) || (Math.abs(v[b]) - Math.abs(v[a])) || (a - b));
  for (let k = 0; diff !== 0 && order.length; k++) {
    out[order[k % order.length]] += up ? 1 : -1;
    diff += up ? -1 : 1;
  }
  return out;
}

// 一行印出来的精确金额：净价版 × 供货系数；岩板等不折扣的不乘
export const shownExact = (total, noDiscount, priceScale = 1) => (noDiscount ? num(total) : num(total) * priceScale);

// 一个房间印出来的精确小计
export const zoneExact = (zr, priceScale = 1) => (zr?.items || []).reduce((s, ir) => s + shownExact(ir.total, ir.noDiscount, priceScale), 0);

// 每个房间印出来的小计（整数），加起来 = total（零售 / 双价 = 原价总额；净价版 = 设计师总额）
export const zoneSubtotals = (zoneResults, priceScale, total) => splitRounded((zoneResults || []).map((zr) => zoneExact(zr, priceScale)), total);
