// 溪岸板材在 3D 里怎么铺（纯计算：引擎 boardTex.js、家具 furniture.js 和测试共用；只有 3D 工作室用，不进客人页面共用的那一块）。
//
// 贴图约定（R3 / R5）：图顺纹竖放存，盖住 mm = [横纹, 顺纹] 毫米；零件的 UV 是「米」（geom.js worldUV，盒子以自己底面中心为原点）。
// 同一块板裁出来的几扇门，真实的柜子上每扇的木纹都不一样（裁的是板上不同的位置）：
// partShift 给每个零件一个固定的 UV 偏移（按家具 id + 零件位置算，下次打开还是同一个），并且留在扫描图干净的中间那一块里。

/**
 * 照片贴图怎么铺：repeat = (1 / 横纹米, −1 / 顺纹米)，offset = (0.5, 1)：
 *   · u：零件以自己的中心为 0 → 正好落在图的正中间；
 *   · v：图片的第 0 行在上（ImageBitmap 不翻转）→ 用负的 repeat 把图的底边放在零件的底边（v = 0），顺纹往上。
 *   wrapT（顺纹）一律镜像：2.8m 高的墙板也没有横缝；wrapS（横纹）平铺，导入器量出横纹方向拼不上（seam.u = 'fail'）时也改成镜像。
 */
export function photoUV(mat) {
  const b = mat?.board;
  const mm = b?.mm || [1220, 2440];
  const across = mm[0] / 1000;
  const along = mm[1] / 1000;
  return {
    repeat: [1 / across, -1 / along],
    offset: [0.5, 1],
    wrapS: b?.seam?.u === 'fail' ? 'mirror' : 'repeat',
    wrapT: 'mirror',
    across,
    along,
  };
}

/** 零件上的一点（米，零件自己的 UV）→ 贴图坐标（镜像 / 平铺之前）；测试用：600mm 门板在 1220mm 的板上取 u ∈ [0.25, 0.75] */
export function photoUVAt(mat, u, v) {
  const p = photoUV(mat);
  return [u * p.repeat[0] + p.offset[0], v * p.repeat[1] + p.offset[1]];
}

/** 某个分辨率存的图的大小 [w, h]（记录里没有就按 mm 的比例推：顺纹 = tier 像素，横纹取最接近的 2 的幂） */
export function tierDims(mat, tier) {
  const b = mat?.board;
  const t = b?.tiers?.[tier];
  if (Array.isArray(t) && t.length === 2 && t[0] > 0 && t[1] > 0) return [t[0], t[1]];
  const mm = b?.mm || [1220, 2440];
  const h = tier;
  const w = Math.max(16, 2 ** Math.round(Math.log2((tier * mm[0]) / mm[1])));
  return [Math.min(w, tier * 2), h];
}

/** 一张 RGBA8 贴图（含 mipmap）占多少显存（字节） */
export const texBytes = (w, h) => (w * h * 4 * 4) / 3;

// ───────────────────────────── 每扇门不一样的木纹（P1，§2.8） ─────────────────────────────

/** 板的标准尺寸（米）：零件建好的时候还不知道会换成哪块板，按一张整板算 */
export const SHEET = { across: 1.22, along: 2.44 };
/** 横纹方向只在扫描图中间这一段里挑（两边常有扫描的暗角 / 夹具印）；顺纹两头各留 3% */
export const CLEAN = { across: 0.76, along: 0.03 };

/** FNV-1a 32 位（同一个字符串永远同一个数） */
function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
/** 0–1 的两个固定随机数 */
function rand2(seed) {
  const a = hash32(seed);
  const b = hash32(`${seed}#v`);
  return [a / 4294967296, b / 4294967296];
}

/**
 * 一个零件的 UV 偏移 [du, dv]（米）：
 *   seed  家具 id + 零件在家具里的位置（毫米）—— 同一件家具每次建出来都一样，存档 / 分享链接打开还是同样的木纹；
 *   across 零件横纹方向最宽多少（米）；along 顺纹方向多高（米）。
 * 横纹：零件整个落在整板中间 76% 里（600mm 的门 ±0.16m；比那一段还宽的 = 0，和以前一样）；
 * 顺纹：零件整个落在板上（两头各留 3%），放不下（整高的门）= 0（底边对板的底边，不会碰到镜像的那条线）。
 */
export function partShift(seed, across, along) {
  const [r1, r2] = rand2(String(seed));
  const room = Math.max(0, CLEAN.across * SHEET.across - across) / 2;
  const du = room > 0.005 ? (r1 * 2 - 1) * room : 0;
  const m = CLEAN.along * SHEET.along;
  const free = SHEET.along - 2 * m - along;
  const dv = free > 0.005 ? m + r2 * free : 0;
  return [du, dv];
}

/**
 * 把一个（已经 clone、摆到家具坐标里的）零件几何的 UV 整体挪一下（furniture.js compact 合并之前调）。
 * size = 零件自己的盒子尺寸 [x, y, z]（米，没摆之前量的）：横纹宽 = max(x, z)，顺纹高 = y。
 */
export function shiftPartUV(geo, seed, size) {
  const uv = geo?.attributes?.uv;
  if (!uv) return [0, 0];
  const [du, dv] = partShift(seed, Math.max(size[0], size[2]), size[1]);
  if (!du && !dv) return [0, 0];
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv);
  uv.needsUpdate = true;
  return [du, dv];
}

/** 几何没摆之前的盒子尺寸（缓存的几何会记住 boundingBox） */
export function partSize(geo) {
  if (!geo.boundingBox) geo.computeBoundingBox();
  const b = geo.boundingBox;
  return [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
}
