// 溪岸板材 · 每块板存几种分辨率（纯函数；R10：v1 只有两档）。
//   256  = 顺纹方向 256 px：预览、省电档、显卡吃紧之后用（≈ 2 KB）
//   1024 = 顺纹方向 1024 px：完整（iPad 和电脑一样；2440 mm 的整板 ≈ 2.4 mm / 像素，正常走动的距离看不出差别）
//   chip = 128 × 128 色卡（中间一块）
// 图一律顺纹竖放（h = 顺纹）。横纹方向按原图比例（一个 px/mm，不拉伸）；永远不放大（原图不够就用原图的像素）。
// 纯色没有纹理要看，1024 档最多 512（600 × 600 mm ≈ 1.2 mm / 像素，≈ 2 KB）。

export const TIERS = [256, 1024];
export const CHIP = 128;
export const SOLID_MAX = 512;

/**
 * 一档的像素 [w, h]（w = 横纹，h = 顺纹）。
 * @param {number} w 源图（裁过、转成顺纹竖放以后）的宽
 * @param {number} h 源图的高（顺纹）
 * @param {256|1024} tier
 * @param {{ kind?: string }} [o]
 */
export function tierDims(w, h, tier, { kind } = {}) {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  let along = Math.min(tier, h);
  if (kind === 'solid') along = Math.min(along, SOLID_MAX);
  let across = Math.max(1, Math.round((along * w) / h));
  // 横纹太宽（很扁的图）：横纹那边也不超过这一档
  if (across > tier) {
    across = Math.min(tier, w);
    along = Math.max(1, Math.round((across * h) / w));
  }
  return [across, along];
}

/** 全部档的像素：{ 256: [w, h], 1024: [w, h] } */
export function allTiers(w, h, o) {
  return Object.fromEntries(TIERS.map((t) => [t, tierDims(w, h, t, o)]));
}

/** GPU 字节（RGBA8 + 全套 mipmap） */
export const gpuBytes = ([w, h]) => (w * h * 4 * 4) / 3;

/** 一块板在包里大约多少字节（WebP 的 base64 + data: 前缀），给拆包估算用 */
export function packBytes(blobSizes) {
  return blobSizes.reduce((s, b) => s + Math.ceil(b / 3) * 4 + 40, 0);
}
