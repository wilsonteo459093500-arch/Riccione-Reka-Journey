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
// open   = 开放柜投影 元/平米（无门开放柜，按投影面积计，A–K 全系列有价）
// strip  = 装饰条 元/米
// 注：系列只用字母区分，不写基材（同一字母在不同项目可能是不同材料）。
export const SERIES = [
  { id: 'A', door: 670,  panel: 670,  carcass: 1370, open: 2070,  strip: 90 },
  { id: 'B', door: 870,  panel: 870,  carcass: 1770, open: 2770,  strip: 110 },
  { id: 'C', door: 1070, panel: 1070, carcass: 2070, open: 3470,  strip: 130 },
  { id: 'D', door: 1370, panel: 1370, carcass: null, open: 4170,  strip: 150 },
  { id: 'E', door: 1670, panel: 1670, carcass: null, open: 5180,  strip: 180 },
  { id: 'F', door: 1970, panel: 1970, carcass: null, open: 6270,  strip: 210 },
  { id: 'G', door: 2270, panel: 2270, carcass: null, open: 7270,  strip: 240 },
  { id: 'H', door: 2670, panel: 2670, carcass: null, open: 9070,  strip: 270 },
  { id: 'I', door: 3070, panel: 3070, carcass: null, open: 10770, strip: 330 },
  { id: 'J', door: 3570, panel: 3570, carcass: null, open: 12570, strip: 390 },
  { id: 'K', door: 4070, panel: 4070, carcass: null, open: 14270, strip: 460 },
];

export const seriesById = (id) => SERIES.find((s) => s.id === id) || SERIES[0];
export const DOOR_SERIES = SERIES.map((s) => s.id);                                     // 门板可选全部系列
export const CARCASS_SERIES = SERIES.filter((s) => s.carcass != null).map((s) => s.id); // 柜体仅 A/B/C
export const OPEN_SERIES = SERIES.filter((s) => s.open != null).map((s) => s.id);        // 开放柜 A–K

// ---- 五金 / 配件（人民币）----
export const DRAWER_CNY = 970; // 基础款全拉四方抽 元/套
export const LED_CNY = 370;    // D-001 平照灯带 元/米

// ---- Rooms 区域/房间（英文为主；尽量覆盖家里需要做定制的地方）----
export const CUSTOM_ROOM = 'Custom 自定义';
export const ROOMS = [
  'Foyer 玄关', 'Living Room 客厅', 'Dining 餐厅', 'Dry Kitchen 干厨', 'Wet Kitchen 湿厨', 'Island 中岛',
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
  { id: 'base', label: 'Base Cabinet 地柜', h: 0.85, d: 0.6,  method: 'linear' },
  { id: 'wall', label: 'Top Cabinet 吊柜',  h: 0.75, d: 0.35, method: 'linear' },
  { id: 'tall', label: 'Tall Cabinet 高柜', h: 2.7,  d: 0.6,  method: 'sqm' },
  { id: 'open', label: 'Open Cabinet 开放柜', h: 2.0, d: 0.35, method: 'sqm' }, // 开放柜：投影面积计价
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
  { key: 'open',     label: 'Open Cabinet 开放柜' },
  { key: 'drawer',   label: 'Drawer 抽屉' },
  { key: 'panel',    label: 'Wall Panel 墙板' },
  { key: 'roomdoor', label: 'Room Door 房门' },
  { key: 'led',      label: 'LED 灯带' },
  { key: 'other',    label: 'Other 其他' },
];

// 计算单条明细 → 每行携带独立中英文（descEn/descZh、uomEn/uomZh），
// 供报价单按所选语言渲染。piece=true 表示按个/件计（数量不显示小数）。
export function computeItem(item) {
  const lines = [];
  // 系数（特殊工艺）：默认 1（不影响）。定制柜只乘「门板」；其他类型乘该项。
  const coef = Number(item.coef) > 0 ? Number(item.coef) : 1;
  const push = (bucket, en, zh, qty, uEn, uZh, piece, unitMyr, applyCoef = false) => {
    const u = (Number(unitMyr) || 0) * (applyCoef ? coef : 1);
    const total = (Number(qty) || 0) * u; // 仅在区域小计处四舍五入
    lines.push({ bucket, descEn: en, descZh: zh, uomEn: uEn, uomZh: uZh, piece, qty, unitMyr: u, total });
  };

  if (item.type === 'cabinet') {
    const len = parseLength(item.length);
    const qty = cabinetQty(len, item.h, item.d);
    const lin = isLinear(item.h);
    const uEn = lin ? 'L.m' : 'm²';
    const uZh = lin ? '延米' : '㎡';
    const door = seriesById(item.doorSeries);
    const carc = seriesById(item.carcassSeries);
    if (item.hasDoor !== false) push('door', `Door ${door.id}`, `门板 ${door.id}`, qty, uEn, uZh, false, cnyToMyr(door.door), true); // 系数只乘门板
    if (item.hasCarcass !== false) push('carcass', `Carcass ${carc.id}`, `柜体 ${carc.id}`, qty, uEn, uZh, false, cnyToMyr(carc.carcass));
    // 开放柜（无门）：按投影面积计（长 × 高），A–K 各系列有独立投影价
    if (item.hasOpen) {
      const op = seriesById(item.openSeries || 'A');
      const openQty = (Number(len) || 0) * (Number(item.h) || 0);
      push('open', `Open ${op.id}`, `开放柜 ${op.id}`, openQty, 'm²', '㎡', false, cnyToMyr(op.open));
    }
    const drawers = Number(item.drawers) || 0;
    if (drawers > 0) push('drawer', 'Blum Full Extension Drawer', 'Blum 全展抽屉', drawers, 'set', '套', true, cnyToMyr(DRAWER_CNY));
  } else if (item.type === 'panel') {
    const len = parseLength(item.length);
    const qty = len * (Number(item.h) || 0);
    const s = seriesById(item.panelSeries);
    push('panel', `Panel ${s.id}`, `墙板 ${s.id}`, qty, 'm²', '㎡', false, cnyToMyr(s.panel), true);
  } else if (item.type === 'roomdoor') {
    const t = item.desc || '';
    push('roomdoor', t || 'Room Door', t || '房门', Number(item.qty) || 0, 'pc', '樘', true, Number(item.unitMyr) || 0, true);
  } else if (item.type === 'led') {
    push('led', 'LED', '灯带', parseLength(item.length), 'm', '米', false, cnyToMyr(LED_CNY), true);
  } else if (item.type === 'other') {
    const t = item.desc || '';
    const u = item.uom || '';
    push('other', t || 'Other', t || '其他', Number(item.qty) || 0, u || 'item', u || '项', /pc|set|item|套|樘|项/i.test(u), Number(item.unitMyr) || 0, true);
  }

  const total = lines.reduce((a, b) => a + b.total, 0);
  return { lines, total };
}

// ============================================================
// 输出语言 i18n —— 报价单/Excel/文本按 lang（'en' | 'zh' | 'both'）渲染
// ============================================================
export const OUTPUT_LANGS = [
  { id: 'en', label: 'EN' },
  { id: 'zh', label: '中文' },
  { id: 'both', label: 'EN+中' },
];

// obj = { en, zh } → 按语言取值（both 则并列）
export function tr(obj, lang) {
  if (!obj) return '';
  if (lang === 'en') return obj.en;
  if (lang === 'zh') return obj.zh;
  return [obj.en, obj.zh].filter(Boolean).join(' ');
}

// 颜色/规格首字母大写：把每个 " / " 段的首个小写字母大写（walnut→Walnut）。
export function capColor(s) {
  return String(s || '').split(' / ').map((seg) => {
    const t = seg.trim();
    return /^[a-z]/.test(t) ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  }).join(' / ');
}

// 把 "English 中文" 形式的字符串按语言拆分取用；无中文则原样返回。
export function pickLang(text, lang) {
  const s = String(text || '');
  if (lang === 'both' || !s) return s;
  const m = s.match(/^(.*?)[\s·]+([一-鿿][一-鿿0-9．·\s]*)$/);
  if (!m) return s;
  return lang === 'en' ? (m[1].trim() || s) : (m[2].trim() || s);
}

// 报价单固定文案
export const RLBL = {
  estQuote:  { en: 'Estimated Quotation', zh: '预估报价' },
  name:      { en: 'Name', zh: '客户' },
  site:      { en: 'Site', zh: '地点' },
  date:      { en: 'Date', zh: '日期' },
  ref:       { en: 'Ref', zh: '编号' },
  pic:       { en: 'PIC', zh: '负责人' },
  rev:       { en: 'Rev', zh: '版本' },
  desc:      { en: 'Description', zh: '项目' },
  qty:       { en: 'Qty', zh: '数量' },
  uom:       { en: 'UOM', zh: '单位' },
  unitPrice: { en: 'Unit Price RM', zh: '单价 RM' },
  amount:    { en: 'Amount RM', zh: '金额 RM' },
  productType: { en: 'Product Type', zh: '产品类型' },
  model:     { en: 'Model', zh: '型号' },
  color:     { en: 'Color', zh: '颜色' },
  photo:     { en: 'Photo', zh: '照片' },
  looseSection: { en: 'Loose Furniture', zh: '家具' },
  notes:     { en: 'Notes', zh: '备注' },
  summary:   { en: 'Summary', zh: '总览' },
  customCabinet: { en: 'Custom Cabinet', zh: '定制橱柜' },
  grandTotal: { en: 'Grand Total', zh: '总计' },
  totalBeforeDiscount: { en: 'Total Before Discount', zh: '原价合计' },
  totalDiscountAmt: { en: 'Total Discount', zh: '折扣合计' },
  detailNote: { en: 'Detailed breakdown on the following pages.', zh: '详细明细见后页。' },
  subtotal:  { en: 'Sub-Total', zh: '小计' },
  gross:     { en: 'Gross', zh: '合计' },
  discount:  { en: 'Discount', zh: '折扣' },
  total:     { en: 'Total', zh: '预估总额' },
  untitled:  { en: 'Untitled', zh: '未命名' },
  director:  { en: 'Director Signature / Date', zh: '董事签名 / 日期' },
  customer:  { en: 'Customer Signature / Date', zh: '客户签名 / 日期' },
  preview:   { en: 'Quotation Preview', zh: '报价单预览' },
  printBtn:  { en: 'Print / Save PDF', zh: '打印 / 存 PDF' },
};

// 报价单条款（有效期 / 声明 / 产品规格 / 标准材质与五金）
export const QUOTE_TERMS = [
  {
    title: { en: 'Validity', zh: '报价有效期' },
    lines: [
      { en: 'Quotation is valid for 30 days from the date of quotation.', zh: '报价自出具日期起 30 天内有效。' },
    ],
  },
  {
    title: { en: 'Disclaimer', zh: '声明' },
    lines: [
      { en: 'Prices are subject to change based on final design confirmation, material selection, and site conditions.', zh: '最终价格将根据设计确认、材质选择及现场状况进行调整。' },
    ],
  },
  {
    title: { en: 'Payment & Delivery', zh: '付款与交付' },
    lines: [
      { en: 'Payments are non-refundable, and orders must be delivered within 12 months from the date of initial payment received, to prevent forfeiture of payments. The unit price of all products and services is valid for 12 months from the date of the initial payment.', zh: '所有已支付款项均不予退还。为避免已支付款项被没收，订单必须于首次收到付款之日起十二（12）个月内完成交付。所有产品及服务的单价，自首次收到付款之日起十二（12）个月内有效。' },
    ],
  },
  {
    title: { en: 'Contract Value', zh: '合约金额' },
    lines: [
      { en: 'Once the order is confirmed, the contract value may be increased. Any reduction to the contract value shall be limited to a maximum of twenty percent (20%) of the original contract value.', zh: '订单确认后，合约金额可因新增项目而增加；如需减少，最终合约金额不得低于原合约金额的百分之八十（80%），即减少幅度不得超过原合约金额的百分之二十（20%）。' },
    ],
  },
  {
    title: { en: 'Specifications', zh: '产品规格' },
    bullet: true,
    lines: [
      { en: 'Door panel thickness: 18mm', zh: '门板厚度：18mm' },
      { en: 'Internal carcass thickness: 18mm', zh: '柜体厚度：18mm' },
      { en: 'Back panel thickness: 9mm', zh: '背板厚度：9mm' },
      { en: 'Edge technique: PUR edge banding', zh: '封边工艺：PUR封边' },
      { en: "Environmental grade: F★★★★ (Japan's highest environmental standard)", zh: '环保等级：F★★★★（日本最高环保等级）' },
    ],
  },
  {
    title: { en: 'Standard Materials & Hardware', zh: '标准材质与五金' },
    bullet: true,
    lines: [
      { en: 'Material: Solid wood melamine (particle board)', zh: '材质：实木颗粒板' },
      { en: 'Hinges brand: Salice', zh: '铰链品牌：萨郦奇' },
      { en: 'Drawer runner brand: Blum', zh: '导轨品牌：百隆' },
    ],
    note: { en: '*Upgrade of material option is available', zh: '*可选择升级材质' },
  },
];

// 计算整个报价 → 各区域小计 + 分类汇总 + 总额
export function computeQuote(zones = [], adjustPct = 0, discountMode = 'pct', discountAmt = 0) {
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
  const pct = Number(adjustPct) || 0;
  const discount = discountMode === 'amt'
    ? Math.min(Math.max(Math.round(Number(discountAmt) || 0), 0), gross) // 定额：不超过合计
    : Math.round((gross * pct) / 100);
  const net = gross - discount;

  return { zoneResults, byCategory, gross, discount, net, adjustPct: pct, discountMode, discountAmt: Number(discountAmt) || 0 };
}

// ---- Loose Furniture 家具（品牌：Riccione Furniture；独立折扣）----
// 每项：{ type 产品类型, model 型号, color 颜色, qty 数量, unitMyr 单价 } → total 总价
export function computeLoose(items = [], adjustPct = 0, discountMode = 'pct', discountAmt = 0) {
  const rows = (items || []).map((it) => ({
    ...it,
    total: (Number(it.qty) || 0) * (Number(it.unitMyr) || 0),
  }));
  const gross = mround(rows.reduce((a, b) => a + b.total, 0), 1);
  const pct = Number(adjustPct) || 0;
  const discount = discountMode === 'amt'
    ? Math.min(Math.max(Math.round(Number(discountAmt) || 0), 0), gross)
    : Math.round((gross * pct) / 100);
  const net = gross - discount;
  return { rows, gross, discount, net, adjustPct: pct, discountMode, discountAmt: Number(discountAmt) || 0, total: net }; // total=net，兼容旧引用
}
