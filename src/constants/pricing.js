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
// door   = 门板（含门框及拉五器）地柜/吊柜/高柜
// panel  = 见光板 / 顶板（墙板取此价）
// carcass= 柜身（不含门板）地柜/吊柜/高柜 —— 仅 A/B/C 有价
// strip  = 装饰条 元/米
export const SERIES = [
  { id: 'A', material: '颗粒板 Particle Board', door: 670,  panel: 670,  carcass: 1370, strip: 90 },
  { id: 'B', material: '夹板 Plywood',          door: 870,  panel: 870,  carcass: 1770, strip: 110 },
  { id: 'C', material: 'C 系列',                door: 1070, panel: 1070, carcass: 2070, strip: 130 },
  { id: 'D', material: 'D 系列',                door: 1370, panel: 1370, carcass: null, strip: 150 },
  { id: 'E', material: 'E 系列',                door: 1670, panel: 1670, carcass: null, strip: 180 },
  { id: 'F', material: 'F 系列',                door: 1970, panel: 1970, carcass: null, strip: 210 },
  { id: 'G', material: 'G 系列',                door: 2270, panel: 2270, carcass: null, strip: 240 },
  { id: 'H', material: 'H 系列',                door: 2670, panel: 2670, carcass: null, strip: 270 },
  { id: 'I', material: 'I 系列',                door: 3070, panel: 3070, carcass: null, strip: 330 },
  { id: 'J', material: 'J 系列 藤编 Rattan',    door: 3570, panel: 3570, carcass: null, strip: 390 },
  { id: 'K', material: 'K 系列',                door: 4070, panel: 4070, carcass: null, strip: 460 },
];

export const seriesById = (id) => SERIES.find((s) => s.id === id) || SERIES[0];
export const DOOR_SERIES = SERIES.map((s) => s.id);                       // 门板可选全部系列
export const CARCASS_SERIES = SERIES.filter((s) => s.carcass != null).map((s) => s.id); // 柜体仅 A/B/C

// ---- 五金 / 配件（人民币）----
export const DRAWER_CNY = 970; // 基础款全拉四方抽 元/套
export const LED_CNY = 370;    // D-001 平照灯带 元/米

// ---- 预设区域 / 橱柜（固定常规高度 & 深度，单位：米）----
// method:
//   'sqm'  → 面积法：长度 × max(高, 深)     （高度 ≥ 1m）
//   'linear'→ 延米法：长度                    （高度 < 1m）
// 高度 h / 深度 d 仅作预填，可在行内调整；method 会随高度自动判定。
export const CABINET_PRESETS = [
  // 高柜 / 到顶柜（面积法）
  { id: 'foyer',      label: '玄关鞋柜 Foyer Cabinet',        h: 2.7,  d: 0.6 },
  { id: 'dry_kit',    label: '干厨 Dry Kitchen',              h: 2.7,  d: 0.6 },
  { id: 'wet_kit',    label: '湿厨 Wet Kitchen',              h: 2.7,  d: 0.6 },
  { id: 'prep',       label: '备餐台 Prep Station',           h: 2.7,  d: 0.6 },
  { id: 'wardrobe',   label: '衣柜 Wardrobe',                 h: 2.7,  d: 0.6 },
  { id: 'walk_in',    label: '步入式衣帽间 Walk-in',          h: 2.7,  d: 0.6 },
  { id: 'tall_store', label: '高柜储物 Tall Storage',         h: 2.7,  d: 0.6 },
  { id: 'wellness',   label: '养生柜 Wellness Cabinet',       h: 2.7,  d: 0.6 },
  { id: 'tv_tall',    label: '电视柜(到顶) TV Tall',          h: 2.4,  d: 0.6 },
  { id: 'shoe_tall',  label: '储藏高柜 Storage Tall',         h: 2.4,  d: 0.6 },
  // 矮柜 / 台面（延米法，高度 < 1m）
  { id: 'island',     label: '中岛 Island',                  h: 0.85, d: 1.0 },
  { id: 'tv_low',     label: '电视柜(矮) TV Low',             h: 0.6,  d: 0.4 },
  { id: 'dressing',   label: '梳妆台 Dressing',               h: 0.8,  d: 0.5 },
  { id: 'vanity',     label: '浴室柜 Bath Vanity',            h: 0.8,  d: 0.6 },
  { id: 'low_cab',    label: '矮柜/斗柜 Low Cabinet',         h: 0.9,  d: 0.6 },
  // 自定义
  { id: 'custom',     label: '自定义 Custom',                 h: 2.7,  d: 0.6 },
];

export const presetById = (id) => CABINET_PRESETS.find((p) => p.id === id) || CABINET_PRESETS[0];

// 墙板预设高度（面积法，长 × 高）
export const WALL_PANEL_PRESETS = [
  { id: 'wall',      label: '护墙板 Wall Panel',   h: 2.7 },
  { id: 'headboard', label: '床头板 Headboard',    h: 1.2 },
  { id: 'feature',   label: '造型墙 Feature Wall', h: 2.4 },
  { id: 'custom',    label: '自定义 Custom',       h: 2.7 },
];

// 房门预设（马来西亚零售价，元/樘）
export const ROOM_DOOR_PRESETS = [
  { id: 'std',   label: '普通房门 Standard',        price: 7570 },
  { id: 'prem',  label: '高级房门 Premium',         price: 10370 },
  { id: 'ward',  label: '衣柜门 Wardrobe Door',     price: 7755 },
  { id: 'custom',label: '自定义 Custom',            price: 7570 },
];

// ---- 计算辅助 ----
// 数量算法：高度 < 1m 用延米（只算长度）；否则面积（长 × max(高,深)）。
export const isLinear = (h) => Number(h) < 1;
export const cabinetQty = (length, h, d) => {
  const L = Number(length) || 0;
  if (isLinear(h)) return L;                        // 延米
  return L * Math.max(Number(h) || 0, Number(d) || 0); // 平米
};

// 支持“a+b+c”式长度输入（对应 Excel 里 (2.86+2.6) 的写法）。
export const parseLength = (raw) => {
  if (raw == null) return 0;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (!s) return 0;
  return s
    .split('+')
    .map((x) => parseFloat(x.trim()) || 0)
    .reduce((a, b) => a + b, 0);
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
  { key: 'door',     label: '门板 Door Panel' },
  { key: 'carcass',  label: '柜体 Carcass' },
  { key: 'drawer',   label: '抽屉 Drawer' },
  { key: 'panel',    label: '墙板 Wall Panel' },
  { key: 'roomdoor', label: '房门 Room Door' },
  { key: 'led',      label: '灯带 LED' },
  { key: 'other',    label: '其他 Other' },
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
    const uom = isLinear(item.h) ? '延米' : '㎡';
    const door = seriesById(item.doorSeries);
    const carc = seriesById(item.carcassSeries);
    if (item.hasDoor !== false) push('door', `门板 ${door.id}`, qty, uom, cnyToMyr(door.door));
    if (item.hasCarcass !== false) push('carcass', `柜体 ${carc.id}`, qty, uom, cnyToMyr(carc.carcass));
    const drawers = Number(item.drawers) || 0;
    if (drawers > 0) push('drawer', '抽屉', drawers, '套', cnyToMyr(DRAWER_CNY));
  } else if (item.type === 'panel') {
    const L = parseLength(item.length);
    const qty = L * (Number(item.h) || 0);
    const s = seriesById(item.panelSeries);
    push('panel', `墙板 ${s.id}`, qty, '㎡', cnyToMyr(s.panel));
  } else if (item.type === 'roomdoor') {
    push('roomdoor', item.desc || '房门', Number(item.qty) || 0, '樘', Number(item.unitMyr) || 0);
  } else if (item.type === 'led') {
    push('led', '灯带 LED', parseLength(item.length), '米', cnyToMyr(LED_CNY));
  } else if (item.type === 'other') {
    push('other', item.desc || '其他', Number(item.qty) || 0, item.uom || '项', Number(item.unitMyr) || 0);
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
