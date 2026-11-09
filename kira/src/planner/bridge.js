// ============================================================
// 积木柜 → 旧报价工具明细（PR #6 computeItem 能算的标准 item）
// 第一块（报价单搬家）先只做接口：没有积木柜时原样返回。
// ============================================================
import { computeQuote } from '../constants/pricing.js';

// 某个房间里的积木柜 → 标准明细（第二块实现）
export function cabinetItems(zone) {
  return [];
}

// 报价用的房间列表：积木柜明细在前，手动明细在后
export function deriveZones(zones = []) {
  return zones.map((z) => {
    const derived = cabinetItems(z);
    return derived.length ? { ...z, items: [...derived, ...(z.items || [])] } : z;
  });
}

export function computeRecordQuote(r) {
  return computeQuote(deriveZones(r.zones || []), r.adjustPct, r.discountMode, r.discountAmt);
}
