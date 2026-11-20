// ============================================================
// 岩板台面 Sintered stone（马来西亚零售价，直接用 RM，不经人民币换算）
// 用户定：台面延米 ÷ 0.3 × RM240（每 0.3 m RM240 = 每米 RM800，按实际延米算，不进位）。
// 岩板不参与折扣（pricing.js 的 NO_DISCOUNT_RE 也认得 sintered / 岩板）。
// 放在这里而不是 pricing.js：pricing.js 要和旧报价工具一字不差（VENDOR.json 指纹）。
// ============================================================
export const SINTERED_STEP_M = 0.3;
export const SINTERED_STEP_MYR = 240;
export const SINTERED_MYR_PER_M = (SINTERED_STEP_MYR * 10) / (SINTERED_STEP_M * 10); // 800（避开 240 / 0.3 的浮点误差）
