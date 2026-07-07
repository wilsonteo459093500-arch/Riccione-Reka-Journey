// ============================================================
// PRICING ENGINE — 定制橱柜预估报价
// ------------------------------------------------------------
// 数据源：全国零售价格表（人民币）。
// 马来西亚零售价换算公式（与 Excel 一致）：
//   MYR = MROUND( CNY * 1.3 / 1.65 , 5 )
// ============================================================

// ---- 汇率 / 换算 ----
export const RATE = { mult: 1.3, div: 1.65, round: 5 };

// Excel MROUND：四舍五入到最接近的 5（正数即“逢 2.5 进位”）。
export const mround = (n, multiple = RATE.round) => Math.round(n / multiple) * multiple;

// 人民币 → 马来西亚零售价
export const cnyToMyr = (cny) => (cny == null ? null : mround((cny * RATE.mult) / RATE.div, RATE.round));

// ---- 板材系列价格（人民币 / 平米，装饰条为 元/米）----
// door   = 门板（含门框及拉五器）
// panel  = 见光板 / 顶板（墙板取此价）
// carcass= 柜身（不含门板）—— 仅 A/B/C 有价（价格表其余系列为 “—”）
// strip  = 装饰条 元/米
// 注：系列只用字母区分，不写基材（同一字母在不同项目可能是不同材料）。
export const SERIES = [
  { id: 'A', door: 670,  panel: 670,  carcass: 1370, strip: 90 },
  { id: 'B', door: 870,  panel: 870,  carcass: 1770, strip: 110 },
  { id: 'C', door: 1070, panel: 1070, carcass: 2070, strip: 130 },
  { id: 'D', door: 1370, panel: 1370, carcass: null, strip: 150 },
  { id: 'E', door: 1670, panel: 1670, carcass: null, strip: 180 },
  { id: 'F', door: 1970, panel: 1970, carcass: null, strip: 210 },
  { id: 'G', door: 2270, panel: 2270, carcass: null, strip: 240 },
  { id: 'H', door: 2670, panel: 2670, carcass: null, strip: 270 },
  { id: 'I', door: 3070, panel: 3070, carcass: null, strip: 330 },
  { id: 'J', door: 3570, panel: 3570, carcass: null, strip: 390 },
  { id: 'K', door: 4070, panel: 4070, carcass: null, strip: 460 },
];

export const seriesById = (id) => SERIES.find((s) => s.id === id) || SERIES[0];
export const DOOR_SERIES = SERIES.map((s) => s.id);                                     // 门板可选全部系列
export const CARCASS_SERIES = SERIES.filter((s) => s.carcass != null).map((s) => s.id); // 柜体仅 A/B/C

// ---- 五金 / 配件（人民币）----
export const DRAWER_CNY = 970; // 基础款全拉四方抽 元/套
export const LED_CNY = 370;    // D-001 平照灯带 元/米

// ---- Rooms 区域/房间（英文为主；尽量覆盖家里需要做定制的地方）----
export const CUSTOM_ROOM = 'Custom 自定义';
export const ROOMS = [
  'Foyer 玄关', 'Living Room 客厅', 'Dining 餐厅', 'Kitchen 厨房', 'Island 中岛',
  'Bar 吧台', 'Study 书房',
  'Master Bedroom 主卧', 'Bedroom 2 卧室2', 'Bedroom 3 卧室3', 'Bedroom 4 卧室4',
  'Walk-in Closet 衣帽间', 'Bathroom 卫生间', 'Laundry 洗衣房', 'Balcony 阳台',
  'Storeroom 储藏室', 'Hallway 走廊', 'Altar 神台', CUSTOM_ROOM,
];

// ---- 柜体类型：决定常规高度 / 深度 & 计价方式 ----
// method：
//   'linear'→ 延米法：长度            （高度 < 1m —— 地柜 / 吊柜）
//   'sqm'   → 面积法：长度 × max(高,深)（高度 ≥ 1m —— 高柜）
// 高 h / 深 d 仅作预填，可行内调整；实际计价方式随高度自动判定（h<1 即延米）。
export const CABINET_TYPES = [
  { id: 'base', label: 'Base 地柜', h: 0.85, d: 0.6,  method: 'linear' },
  { id: 'wall', label: 'Wall 吊柜', h: 0.75, d: 0.35, method: 'linear' },
  { id: 'tall', label: 'Tall 高柜', h: 2.7,  d: 0.6,  method: 'sqm' },
];
export const cabTypeById = (id) => CABINET_TYPES.find((t) => t.id === id) || CABINET_TYPES[0];

// 墙板预设高度（面积法，长 × 高）
export const WALL_PANEL_PRESETS = [
  { id: 'wall',      label: 'Wall Panel 护墙板', h: 2.7 },
  { id: 'headboard', label: 'Headboard 床头板',  h: 1.2 },
  { id: 'feature',   label: 'Feature 造型墙',    h: 2.4 },
  { id: 'custom',    label: 'Custom 自定义',      h: 2.7 },
];

// 房门预设（马来西亚零售价，元/樘）
export const ROOM_DOOR_PRESETS = [
  { id: 'std',    label: 'Standard 普通房门', price: 7570 },
  { id: 'prem',   label: 'Premium 高级房门',  price: 10370 },
  { id: 'ward',   label: 'Wardrobe 衣柜门',   price: 7755 },
  { id: 'custom', label: 'Custom 自定义',      price: 7570 },
];

// ---- 计算辅助 ----
// 数量算法：高度 < 1m 用延米（只算长度）；否则面积（长 × max(高,深)）。
export const isLinear = (h) => Number(h) < 1;
export const cabinetQty = (length, h, d) => {
  const L = Number(length) || 0;
  if (isLinear(h)) return L;                            // 延米
  return L * Math.max(Number(h) || 0, Number(d) || 0);  // 平米
};

// 支持“a+b+c”式长度输入（对应 Excel 里 (2.86+2.6) 的写法）。
export const parseLength = (raw) => {
  if (raw == null) return 0;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (!s) return 0;
  return s.split('+').map((x) => parseFloat(x.trim()) || 0).reduce((a, b) => a + b, 0);
};

// ---- 格式化 ----
export const fmtMYR = (n) =>
  'RM ' + (Number(n) || 0).toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const fmtNum = (n, dp = 2) =>
  (Number(n) || 0).toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: dp });

// ============================================================
// 报价核心：把一个「区域」的多条明细算出各分类金额
// ------------------------------------------------------------
// 分类 bucket：door 门板 · carcass 柜体 · drawer 抽屉 · panel 墙板
//              · roomdoor 房门 · led 灯带 · other 其他
// ============================================================
export const CATEGORIES = [
  { key: 'door',     label: 'Door Panel 门板' },
  { key: 'carcass',  label: 'Carcass 柜体' },
  { key: 'drawer',   label: 'Drawer 抽屉' },
  { key: 'panel',    label: 'Wall Panel 墙板' },
  { key: 'roomdoor', label: 'Room Door 房门' },
  { key: 'led',      label: 'LED 灯带' },
  { key: 'other',    label: 'Other 其他' },
];

// 计算单条明细 → 返回 { lines: [{bucket, desc, qty, uom, unitMyr, total}], total }
export function computeItem(item) {
  const lines = [];
  const push = (bucket, desc, qty, uom, unitMyr) => {
    // 保留小数，仅在区域小计处四舍五入（与 Excel 一致）。
    const total = (Number(qty) || 0) * (Number(unitMyr) || 0);
    lines.push({ bucket, desc, qty, uom, unitMyr, total });
  };

  if (item.type === 'cabinet') {
    const L = parseLength(item.length);
    const qty = cabinetQty(L, item.h, item.d);
    const uom = isLinear(item.h) ? 'L.m 延米' : '㎡';
    const door = seriesById(item.doorSeries);
    const carc = seriesById(item.carcassSeries);
    if (item.hasDoor !== false) push('door', `Door 门板 ${door.id}`, qty, uom, cnyToMyr(door.door));
    if (item.hasCarcass !== false) push('carcass', `Carcass 柜体 ${carc.id}`, qty, uom, cnyToMyr(carc.carcass));
    const drawers = Number(item.drawers) || 0;
    if (drawers > 0) push('drawer', 'Drawer 抽屉', drawers, 'set 套', cnyToMyr(DRAWER_CNY));
  } else if (item.type === 'panel') {
    const L = parseLength(item.length);
    const qty = L * (Number(item.h) || 0);
    const s = seriesById(item.panelSeries);
    push('panel', `Panel 墙板 ${s.id}`, qty, '㎡', cnyToMyr(s.panel));
  } else if (item.type === 'roomdoor') {
    push('roomdoor', item.desc || 'Room Door 房门', Number(item.qty) || 0, 'pc 樘', Number(item.unitMyr) || 0);
  } else if (item.type === 'led') {
    push('led', 'LED 灯带', parseLength(item.length), 'm 米', cnyToMyr(LED_CNY));
  } else if (item.type === 'other') {
    push('other', item.desc || 'Other 其他', Number(item.qty) || 0, item.uom || 'item 项', Number(item.unitMyr) || 0);
  }

  const total = lines.reduce((a, b) => a + b.total, 0);
  return { lines, total };
}

// 计算整个报价 → 各区域小计 + 分类汇总 + 总额
export function computeQuote(zones = [], adjustPct = 0) {
  const zoneResults = zones.map((z) => {
    const items = (z.items || []).map((it) => ({ item: it, ...computeItem(it) }));
    const subtotal = mround(items.reduce((a, b) => a + b.total, 0), 1);
    return { zone: z, items, subtotal };
  });

  const byCategory = {};
  CATEGORIES.forEach((c) => (byCategory[c.key] = 0));
  zoneResults.forEach((zr) =>
    zr.items.forEach((ir) => ir.lines.forEach((ln) => (byCategory[ln.bucket] += ln.total)))
  );

  const gross = zoneResults.reduce((a, b) => a + b.subtotal, 0);
  const discount = Math.round((gross * (Number(adjustPct) || 0)) / 100);
  const net = gross - discount;

  return { zoneResults, byCategory, gross, discount, net };
}
