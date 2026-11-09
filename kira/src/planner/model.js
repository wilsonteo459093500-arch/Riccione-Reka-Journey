// ============================================================
// KIRA 积木柜数据模型（全部用毫米整数）
// ------------------------------------------------------------
// 房间 zone（沿用旧报价工具的 zone）多两个字段：
//   ceilingH  楼高 mm（每个房间问一次）
//   cabinets  积木柜 Cabinet[]（手动明细照旧放 zone.items）
//
// Cabinet（一个模板做出来的柜子，例如「主卧衣柜」）
//   { id, code:'K1', template:'wardrobe'|'kitchen'|'tv'|'shoe', name,
//     spec:   模板的输入（总宽、高、深、底座、每格单元…）—— 业务改的是这里
//     frames: Frame[] —— 由 spec 生成（只在编辑时重算；载入不重算，避免旧报价被改价）
//     series: { door, carcass, open } —— null = 用整份报价的默认系列；open:'door' = 跟门板
//     exposed:{ left, right } —— 两边露出 → 自动加见光板（默认两边都加）
//     glassCoef —— 玻璃门系数（默认旧工具系数表「拼框玻璃门 1.5」）
//     finish: { door, carcass }, handle, view:{ yaw } —— 只影响图，不影响价 }
//
// Frame（一个柜体：地柜 / 吊柜 / 高柜）
//   { id, kind:'base'|'wall'|'tall', label, wall:0, x, y, W, H, D,
//     base: { kind:'plinth'|'legs'|'raised'|'wallhung'|'none', h },
//     body: Node }
//   H = 总高（含踢脚/柜脚/底层架空）；body 高 = H − base.h；吊挂柜 y = 离地高度。
//
// Node（柜身切分树：先竖切成列，列里再横切成格）
//   { split:'v'|'h', sizes:[mm…], children:[Node…] }   v：左→右；h：下→上
//   { leaf:true, type:'closed'|'open'|'glass'|'drawer'|'void', drawers, drawerKind:'full'|'half', interior }
//   第二版「画色块」直接在同一棵树上切，不另立模型。
// ============================================================

export const LEAF_TYPES = [
  { id: 'closed', zh: '封闭区', en: 'Closed / doors' },
  { id: 'open', zh: '开放区', en: 'Open shelves' },
  { id: 'glass', zh: '玻璃柜体区', en: 'Glass cabinet' },
  { id: 'drawer', zh: '抽屉区', en: 'Drawers' },
  { id: 'void', zh: '空位（不计价）', en: 'Gap (not priced)' },
];

export const BASE_KINDS = [
  { id: 'plinth', zh: '踢脚', en: 'Plinth', h: 100 },
  { id: 'legs', zh: '柜脚', en: 'Legs', h: 120 },
  { id: 'raised', zh: '底层架空', en: 'Raised', h: 150 },
  { id: 'wallhung', zh: '悬挂', en: 'Wall-hung', h: 0 },
  { id: 'none', zh: '落地无踢脚', en: 'No base', h: 0 },
];
export const baseKind = (id) => BASE_KINDS.find((b) => b.id === id) || BASE_KINDS[0];

// 旧工具「特殊工艺系数」表（QuotationView.jsx 的 CRAFT_COEF 原样）—— 玻璃门默认用「拼框玻璃门 1.5」
export const CRAFT_COEF = [
  { name: '圆弧 Arc', coef: 3 },
  { name: '加厚 Thickened (25/36)', coef: 2.5 },
  { name: '加厚 Thickened (50)', coef: 3.5 },
  { name: '格栅 Grille', coef: 3 },
  { name: '拼框门 Framed Door', coef: 2.5 },
  { name: '拼框玻璃门 Framed Glass Door', coef: 1.5 },
  { name: '洞洞板 Pegboard', coef: 1.5 },
];
export const DEFAULT_GLASS_COEF = 1.5;

export const DEFAULT_CEILING = 2700;
export const MAX_DOOR = 600; // 每扇门最宽 600 → 自动算门数

let seq = 0;
export const uid = (p) => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const leaf = (type, extra = {}) => ({ leaf: true, type, ...extra });
export const vsplit = (sizes, children) => ({ split: 'v', sizes, children });
export const hsplit = (sizes, children) => ({ split: 'h', sizes, children });

// 总宽平分成 n 份（整数 mm，余数分给前几份），保证加起来 = W
export function splitEven(W, n) {
  const k = Math.max(1, Math.round(n));
  const base = Math.floor(W / k);
  const rem = W - base * k;
  return Array.from({ length: k }, (_, i) => base + (i < rem ? 1 : 0));
}
export const autoDoors = (W) => Math.max(1, Math.ceil((Number(W) || 0) / MAX_DOOR));

// 切分树 → 叶子的绝对矩形（柜身坐标：左下角为原点，y 向上）
export function layoutLeaves(node, x = 0, y = 0, w = 0, h = 0, out = []) {
  if (!node) return out;
  if (node.leaf) { out.push({ x, y, w, h, node }); return out; }
  const sizes = node.sizes || [];
  let off = 0;
  node.children.forEach((c, i) => {
    const s = sizes[i] || 0;
    if (node.split === 'v') layoutLeaves(c, x + off, y, s, h, out);
    else layoutLeaves(c, x, y + off, w, s, out);
    off += s;
  });
  return out;
}

export const bodyHeight = (f) => Math.max(0, (f.H || 0) - (f.base?.h || 0));

// 长度输入（米）：支持「2.86+2.6」加法 → mm
export function parseMetersToMm(raw) {
  if (raw == null) return 0;
  if (typeof raw === 'number') return Math.round(raw * 1000);
  const s = String(raw).trim();
  if (!s) return 0;
  return Math.round(s.split('+').map((x) => parseFloat(x.trim()) || 0).reduce((a, b) => a + b, 0) * 1000);
}
export const mmToM = (mm, dp = 2) => (Math.round((Number(mm) || 0) / 10) / 100).toFixed(dp);
