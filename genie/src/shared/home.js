// 「你的家」—— 揭晓之后、看案例之前问的几件事（像装修平台的报价表：什么房子、在哪里、多大、做哪里、什么时候）。
//
// 这里只放资料和纯函数（许愿之旅、3D 工作室、案例配对、WhatsApp 文字、员工的客人名单都用它）：
//   · 选项是资料（PROPERTY / PROPERTY_TILES / STATES / STATUS / SCOPE / TIMELINE / BUDGET）—— 老板还会改说法、改档位，id 不要动；
//   · 存在客人档案上：profile.home（客人自己的答案，客人版可以看）；
//   · 预算（业主 2026-10-19：要问，但只给员工看）：客人在 H4 选的、设计师在蓝图员工版记的，都只存在这台设备的
//     localStorage 'genie.staffnotes.v1'[档案号]（staffNoteOf / setStaffNote）—— 永远不进档案、不进任何链接、
//     不出现在客人的牌、蓝图、WhatsApp 文字和之后的任何一屏；只在员工入口（蓝图设计师版、员工区的客人名单 / CSV）出现。
//   · 「谁住在这里」（老人 / 小孩 / 宠物）不再问：用许愿之旅「生活」那一章的答案（profile.answers.life.who）。
//   · 客人名单（业主：称呼 + WhatsApp + PDPA 同意）：只存在这台 iPad 的 localStorage 'genie.leads.v1'，员工区导出 CSV（Excel 打得开）。
//
// 文字：中文就是 key，英文在 src/shared/i18n/en-shell.js（资料里的 en 是老板改说法时改的那一份）。

import { t, L, isEn, getLang } from './i18n.js';
import { MAT_BY_ID, fits } from './materials.js';
import { DREAMER_BY_CODE } from './dreamers.js';
import { packJSON, slimProfile } from './profile.js';
import { LEADS_KEY, NOTES_KEY, keptLeads, keptNotes, writeNotes } from './keep.js';

export const HOME_V = 1;

/** 资料里的 { zh, en }：英文模式用资料自己的 en（老板改说法只改这一份；词典里的同一句只为了双语检查） */
export const lab = (o) => (o == null ? '' : typeof o === 'string' ? t(o) : isEn() ? o.en || L(o) : o.zh || o.en || '');

/**
 * 房子类型（业主的顺序：最常见的在前 —— 公寓 → 排屋 → 半独立 / 独立洋房 → 小一点的类型 → 其他 / 商业）。
 * template = 没有户型图时用的示范户型；typical = 不确定大小时的估计（sq ft，按 beds 房）；perBed = 每多 / 少一房 ±；
 * byStoreys = 层数不同时的常见值（单层排屋）。
 */
export const PROPERTY = [
  {
    v: 'condo',
    zh: '公寓 / 共管公寓',
    en: 'Condo / apartment',
    sub: { zh: '高楼里的家 · 服务式公寓也算', en: 'Serviced residences count too' },
    short: { zh: '公寓', en: 'Condo' },
    landed: false,
    template: 'condo3',
    typical: 1100,
    beds: 3,
    baths: 2,
    storeys: 1,
    perBed: 225,
  },
  {
    v: 'terrace',
    zh: '排屋',
    en: 'Terrace / link house',
    sub: { zh: '一排连着的有地房子', en: 'Landed, in a row' },
    short: { zh: '排屋', en: 'Terrace' },
    landed: true,
    template: 'terrace2',
    typical: 1880,
    beds: 4,
    baths: 3,
    storeys: 2,
    perBed: 320,
    byStoreys: { 1: { typical: 1300, beds: 3, baths: 2, template: 'condo3' } },
  },
  {
    v: 'semid',
    zh: '半独立式（双拼）',
    en: 'Semi-D',
    sub: { zh: '两户共用一面墙', en: 'Shares one wall' },
    short: { zh: '半独立式', en: 'Semi-D' },
    landed: true,
    template: 'semid2',
    typical: 2980,
    beds: 5,
    baths: 4,
    storeys: 2,
    perBed: 420,
  },
  {
    v: 'bungalow',
    zh: '独立式洋房',
    en: 'Bungalow',
    sub: { zh: '四面都不靠邻居', en: 'Stands on its own' },
    short: { zh: '独立式洋房', en: 'Bungalow' },
    landed: true,
    template: 'semid2',
    typical: 4000,
    beds: 5,
    baths: 5,
    storeys: 2,
    perBed: 600,
  },
  {
    v: 'townhouse',
    zh: '城镇屋 Townhouse',
    en: 'Townhouse',
    sub: { zh: '上下两户，各有大门', en: 'Two homes stacked, own doors' },
    short: { zh: '城镇屋', en: 'Townhouse' },
    landed: true,
    template: 'terrace2',
    typical: 1500,
    beds: 3,
    baths: 2,
    storeys: 1,
    perBed: 280,
  },
  {
    v: 'shophouse',
    zh: '店屋',
    en: 'Shophouse',
    sub: { zh: '店屋楼上的家', en: 'A home above the shops' },
    short: { zh: '店屋', en: 'Shophouse' },
    landed: false,
    template: 'condo3',
    typical: 1400,
    beds: 3,
    baths: 2,
    storeys: 1,
    perBed: 260,
  },
  {
    v: 'other',
    zh: '其他 / 商业',
    en: 'Other / commercial',
    sub: { zh: '办公室、店面，或还在找房子', en: 'Office, shop — or still looking' },
    short: { zh: '其他', en: 'Other' },
    landed: false,
    template: 'condo3',
    typical: 1000,
    beds: 2,
    baths: 2,
    storeys: 1,
    perBed: 220,
  },
];
export const PROPERTY_BY_V = Object.fromEntries(PROPERTY.map((p) => [p.v, p]));

/**
 * H1 的格子（业主：排屋分单层、双层 —— 同一个类型 terrace，层数不同）。key 是格子自己的 id；type / storeys 写进 home。
 * 没写 zh / en / sub 的格子用 PROPERTY 的。
 */
export const PROPERTY_TILES = [
  { key: 'condo', type: 'condo' },
  { key: 'terrace-1', type: 'terrace', storeys: 1, art: 'terrace1', zh: '单层排屋', en: 'Single-storey terrace', sub: { zh: '一层的有地排屋', en: 'Landed, all on one floor' } },
  { key: 'terrace-2', type: 'terrace', storeys: 2, zh: '双层排屋', en: 'Double-storey terrace', sub: { zh: '两层、两层半都算', en: 'Two or two-and-a-half floors' } },
  { key: 'semid', type: 'semid' },
  { key: 'bungalow', type: 'bungalow' },
  { key: 'townhouse', type: 'townhouse' },
  { key: 'shophouse', type: 'shophouse' },
  { key: 'other', type: 'other' },
];
/** 这个格子现在是不是选中的（排屋看层数：1 层 = 单层，2 层以上 = 双层） */
export function tileOn(tile, home) {
  if (!home?.type || home.type !== tile.type) return false;
  if (tile.storeys == null) return true;
  const st = Number(home.storeys) || PROPERTY_BY_V[home.type]?.storeys || 1;
  return tile.storeys === 1 ? st === 1 : st >= 2;
}

/**
 * 在哪里（业主：只问州和地区，不问地址）。地区是一张短短的常见地区表；不在表上 → 「其他地区」自己写几个字（AREA_MAX 字以内）。
 * 中文名是马来西亚华人常用的叫法；英文就是当地的名字。
 */
export const AREA_MAX = 40;
const A = (v, zh, en) => ({ v, zh, en });
export const STATES = [
  {
    v: 'kl',
    zh: '吉隆坡',
    en: 'Kuala Lumpur',
    areas: [A('mont-kiara', '满家乐', 'Mont Kiara'), A('bangsar', '孟沙', 'Bangsar'), A('cheras-kl', '蕉赖', 'Cheras'), A('kepong', '甲洞', 'Kepong'), A('bukit-jalil', '武吉加里尔', 'Bukit Jalil'), A('sri-petaling', '大城堡', 'Sri Petaling'), A('old-klang-road', '旧巴生路', 'Old Klang Road'), A('sentul', '冼都', 'Sentul'), A('kl-city', '市中心', 'City centre')],
  },
  {
    v: 'sel',
    zh: '雪兰莪',
    en: 'Selangor',
    areas: [A('pj', '八打灵再也', 'Petaling Jaya'), A('subang', '梳邦再也', 'Subang Jaya'), A('puchong', '蒲种', 'Puchong'), A('shah-alam', '莎阿南', 'Shah Alam'), A('klang', '巴生', 'Klang'), A('kajang', '加影', 'Kajang'), A('seri-kembangan', '沙登', 'Seri Kembangan'), A('ampang', '安邦', 'Ampang'), A('cyberjaya', '赛城', 'Cyberjaya'), A('rawang', '万挠', 'Rawang'), A('sungai-buloh', '双溪毛糯', 'Sungai Buloh'), A('bangi', '万宜', 'Bangi')],
  },
  {
    v: 'jhr',
    zh: '柔佛',
    en: 'Johor',
    areas: [A('jb', '新山', 'Johor Bahru'), A('iskandar', '依斯干达公主城', 'Iskandar Puteri'), A('skudai', '士古来', 'Skudai'), A('kulai', '古来', 'Kulai'), A('pasir-gudang', '巴西古当', 'Pasir Gudang'), A('batu-pahat', '峇株巴辖', 'Batu Pahat'), A('muar', '麻坡', 'Muar'), A('kluang', '居銮', 'Kluang')],
  },
  {
    v: 'png',
    zh: '槟城',
    en: 'Penang',
    areas: [A('george-town', '乔治市', 'George Town'), A('bayan-lepas', '峇六拜', 'Bayan Lepas'), A('tanjung-bungah', '丹绒武雅', 'Tanjung Bungah'), A('air-itam', '亚依淡', 'Air Itam'), A('butterworth', '北海', 'Butterworth'), A('bukit-mertajam', '大山脚', 'Bukit Mertajam'), A('batu-kawan', '峇都加湾', 'Batu Kawan')],
  },
  { v: 'prk', zh: '霹雳', en: 'Perak', areas: [A('ipoh', '怡保', 'Ipoh'), A('taiping', '太平', 'Taiping'), A('kampar', '金宝', 'Kampar'), A('sitiawan', '实兆远', 'Sitiawan'), A('teluk-intan', '安顺', 'Teluk Intan')] },
  { v: 'nsn', zh: '森美兰', en: 'Negeri Sembilan', areas: [A('seremban', '芙蓉', 'Seremban'), A('nilai', '汝来', 'Nilai'), A('port-dickson', '波德申', 'Port Dickson')] },
  { v: 'mlk', zh: '马六甲', en: 'Melaka', areas: [A('melaka-city', '马六甲市', 'Melaka City'), A('ayer-keroh', '爱极乐', 'Ayer Keroh'), A('alor-gajah', '亚罗牙也', 'Alor Gajah')] },
  { v: 'phg', zh: '彭亨', en: 'Pahang', areas: [A('kuantan', '关丹', 'Kuantan'), A('bentong', '文冬', 'Bentong'), A('genting', '云顶', 'Genting Highlands'), A('cameron', '金马伦高原', 'Cameron Highlands')] },
  { v: 'kdh', zh: '吉打', en: 'Kedah', areas: [A('alor-setar', '亚罗士打', 'Alor Setar'), A('sungai-petani', '双溪大年', 'Sungai Petani'), A('kulim', '居林', 'Kulim'), A('langkawi', '浮罗交怡', 'Langkawi')] },
  { v: 'sbh', zh: '沙巴', en: 'Sabah', areas: [A('kota-kinabalu', '亚庇', 'Kota Kinabalu'), A('sandakan', '山打根', 'Sandakan'), A('tawau', '斗湖', 'Tawau')] },
  { v: 'swk', zh: '砂拉越', en: 'Sarawak', areas: [A('kuching', '古晋', 'Kuching'), A('miri', '美里', 'Miri'), A('sibu', '诗巫', 'Sibu'), A('bintulu', '民都鲁', 'Bintulu')] },
  { v: 'ktn', zh: '吉兰丹', en: 'Kelantan', areas: [A('kota-bharu', '哥打巴鲁', 'Kota Bharu')] },
  { v: 'trg', zh: '登嘉楼', en: 'Terengganu', areas: [A('kuala-terengganu', '瓜拉登嘉楼', 'Kuala Terengganu'), A('kemaman', '甘马挽', 'Kemaman')] },
  { v: 'pls', zh: '玻璃市', en: 'Perlis', areas: [A('kangar', '加央', 'Kangar')] },
  { v: 'pjy', zh: '布城', en: 'Putrajaya', areas: [] },
  { v: 'lbn', zh: '纳闽', en: 'Labuan', areas: [] },
  { v: 'abroad', zh: '马来西亚以外', en: 'Outside Malaysia', areas: [] },
];
export const STATE_BY_V = Object.fromEntries(STATES.map((s) => [s.v, s]));
/** 地区的 id → { 州, 地区 } */
export function areaOf(stateV, areaV) {
  return STATE_BY_V[stateV]?.areas.find((a) => a.v === areaV) || null;
}
/** 「雪兰莪 · 蒲种」（地区是自己写的就用写的；没有地区就只有州） */
export function whereText(home) {
  const s = STATE_BY_V[home?.state];
  if (!s) return '';
  const a = areaOf(home.state, home.area);
  const own = typeof home.areaText === 'string' ? home.areaText.trim().slice(0, AREA_MAX) : '';
  const tail = a ? lab(a) : own;
  return tail ? `${lab(s)} · ${tail}` : lab(s);
}

/** 房子现在的状态 —— keep：要不要问「哪些会留下来」 */
export const STATUS = [
  { v: 'handover', zh: '新房，刚拿钥匙', en: 'Brand new — keys just in', sub: { zh: '空空的，什么都可以做', en: 'Empty — anything is possible' }, keep: true },
  { v: 'living', zh: '住了一段时间，想翻新', en: 'We live here — time to refresh', sub: { zh: '有些东西会留下来', en: 'Some things will stay' }, keep: true },
  { v: 'building', zh: '还在建，还没交屋', en: 'Still being built', sub: { zh: '先规划好，交屋就动工', en: 'Plan now, start on handover' }, keep: false },
  { v: 'looking', zh: '还在看房子', en: 'Still house-hunting', sub: { zh: '先看看风格', en: 'Exploring styles first' }, keep: false },
];
export const STATUS_BY_V = Object.fromEntries(STATUS.map((s) => [s.v, s]));

/** 这一次做哪些地方 —— v = 3D 工作室 ROOM_TYPES 的 id（whole = 全屋，和其他互斥） */
export const SCOPE = [
  { v: 'whole', zh: '全屋', en: 'Whole home', whole: true },
  { v: 'living', zh: '客厅', en: 'Living' },
  { v: 'dining', zh: '餐厅', en: 'Dining' },
  { v: 'kitchen', zh: '厨房', en: 'Kitchen' },
  { v: 'master', zh: '主卧', en: 'Master bedroom' },
  { v: 'bedroom', zh: '其他卧室', en: 'Other bedrooms' },
  { v: 'kids', zh: '儿童房', en: 'Kids room' },
  { v: 'study', zh: '书房', en: 'Study' },
  { v: 'bath', zh: '浴室', en: 'Bathrooms' },
  { v: 'foyer', zh: '玄关', en: 'Foyer' },
  { v: 'walkin', zh: '衣帽间', en: 'Walk-in' },
  { v: 'balcony', zh: '阳台', en: 'Balcony' },
];
export const SCOPE_BY_V = Object.fromEntries(SCOPE.map((s) => [s.v, s]));
/** 「全屋」在配对时等于这几个房间 */
export const WHOLE_ROOMS = ['living', 'kitchen', 'master'];

/** 希望什么时候住进去（业主：3 个月内 / 3–6 个月 / 6–12 个月 / 还没想好） */
export const TIMELINE = [
  { v: '3m', zh: '3 个月内', en: 'Within 3 months' },
  { v: '6m', zh: '3–6 个月', en: '3–6 months' },
  { v: '12m', zh: '6–12 个月', en: '6–12 months' },
  { v: 'unsure', zh: '还没想好', en: 'Not sure yet' },
];
/** 旧的档案里可能还有的值（不再给客人选） */
const TIMELINE_OLD = [{ v: 'later', zh: '一年以后', en: 'After a year' }];
export const TIMELINE_BY_V = Object.fromEntries([...TIMELINE, ...TIMELINE_OLD].map((s) => [s.v, s]));

/**
 * 预算档位（业主：按整个项目报价，不按尺；RM）—— 只给员工看（见文件开头）。
 * 客人那一屏的问法很轻：「你心里大概的范围」；默认档位是资料，老板改了就改这里。
 */
export const BUDGET = [
  { v: 'lt30', zh: 'RM 30k 以下', en: 'Below RM 30k', max: 30000 },
  { v: '30-60', zh: 'RM 30–60k', en: 'RM 30–60k', min: 30000, max: 60000 },
  { v: '60-100', zh: 'RM 60–100k', en: 'RM 60–100k', min: 60000, max: 100000 },
  { v: '100-150', zh: 'RM 100–150k', en: 'RM 100–150k', min: 100000, max: 150000 },
  { v: '150-250', zh: 'RM 150–250k', en: 'RM 150–250k', min: 150000, max: 250000 },
  { v: 'gt250', zh: 'RM 250k 以上', en: 'Above RM 250k', min: 250000 },
  { v: 'unsure', zh: '还没想好', en: 'Not sure yet' },
];
const BUDGET_OLD = [
  { v: '100-200', zh: 'RM 10–20 万', en: 'RM 100–200k', min: 100000, max: 200000 },
  { v: 'gt200', zh: 'RM 20 万以上', en: 'Over RM 200k', min: 200000 },
  { v: 'skip', zh: '先不说', en: 'Rather not say' },
];
export const BUDGET_BY_V = Object.fromEntries([...BUDGET, ...BUDGET_OLD].map((s) => [s.v, s]));
/** 这个预算值值得写给员工看吗（「还没想好」「先不说」不算一个范围） */
export const budgetKnown = (v) => !!BUDGET_BY_V[v]?.zh && !['unsure', 'skip'].includes(v);

/**
 * 家里会留下来的颜色（K 屏）—— slot = 材质表面；swatches = 色卡（材质 id，按顺序）；labels = 这里改叫的名字
 * 地板（业主：马来西亚新房最常见的 6–8 种地砖 —— 这里 7 种，再加木地板；加上「都不像」正好三排）：客人家里的多半是瓷砖，所以石材在这里叫「…纹砖」。
 */
export const KEEP_SLOTS = [
  {
    id: 'floor',
    slot: 'floor',
    zh: '地板',
    en: 'Floor',
    short: { zh: '地板', en: 'Floor' },
    swatches: ['cream-tile', 'grey-tile', 'carrara', 'calacatta', 'travertine', 'sintered', 'terrazzo', 'light-oak'],
    labels: {
      'cream-tile': { zh: '奶油大板砖', en: 'Cream slab tile' },
      'grey-tile': { zh: '哑光灰砖', en: 'Matte grey tile' },
      carrara: { zh: '白色大理石纹砖', en: 'White marble-look tile' },
      calacatta: { zh: '金线大理石纹砖', en: 'Gold-vein marble-look tile' },
      travertine: { zh: '米色洞石纹砖', en: 'Beige travertine-look tile' },
      sintered: { zh: '深灰岩板砖', en: 'Dark grey stone tile' },
      terrazzo: { zh: '磨石子地', en: 'Terrazzo' },
      'light-oak': { zh: '木地板', en: 'Wood floor' },
    },
  },
  { id: 'walls', slot: 'walls', zh: '墙面', en: 'Walls', short: { zh: '墙面', en: 'Walls' }, swatches: ['gallery-white', 'warm-white', 'oat', 'sand-limewash', 'sage', 'dusty-blue', 'latte'] },
  { id: 'cabinetry', slot: 'cabinetry', zh: '柜子 · 门', en: 'Cabinets & doors', short: { zh: '柜子', en: 'Cabinets' }, swatches: ['white-lacquer', 'cream-lacquer', 'light-oak', 'walnut', 'sage-lacquer', 'black-matte'] },
  { id: 'sofa', slot: 'upholstery', zh: '沙发', en: 'Sofa', short: { zh: '沙发', en: 'Sofa' }, swatches: ['grey-wool', 'linen', 'boucle', 'cognac-leather', 'black-leather', 'navy-velvet'] },
];
export const KEEP_BY_SLOT = Object.fromEntries(KEEP_SLOTS.map((k) => [k.slot, k]));

/** 会留下来的大件家具（业主：沙发、床、餐桌）—— 沙发的颜色在上面那一行锁；床、餐桌只记下来给设计师（3D 照样摆，之后再做） */
export const KEEP_ITEMS = [
  { v: 'bed', zh: '床', en: 'Bed' },
  { v: 'dining', zh: '餐桌椅', en: 'Dining table' },
];
export const KEEP_ITEM_BY_V = Object.fromEntries(KEEP_ITEMS.map((k) => [k.v, k]));

/** 色卡上显示的名字（有改名就用改名） */
export function keepLabel(slot, matId) {
  const k = KEEP_BY_SLOT[slot] || KEEP_SLOTS.find((x) => x.id === slot);
  if (k?.labels?.[matId]) return lab(k.labels[matId]);
  const m = MAT_BY_ID[matId];
  return m ? L(m) : '';
}

/**
 * 公司做的 vs 只是示意 / 背景（业主 2026-10-19 + LEAD NOTE 6 / 8，和 3D 的 src/studio/offer.js 同一条规则）：
 *   我们做 · We make this = 定制柜（厨房、衣柜、电视柜、鞋柜、书柜…，柜里的灯带、榻榻米 / 翻床、钢柜、伸缩岛台也算）、
 *     台面（公司从别家配来的 —— LEAD NOTE 8）、墙板、门（含隐形门、口袋门、旋转门）—— 只有这些；
 *   家具示意 · Furniture for illustration = 活动家具（沙发、餐桌椅、床、书桌…）：通用的样子，不是公司的产品，不写产品名；
 *   只是背景 = 地板、天花、灯、窗帘、墙漆、瓷砖 —— 从来不写成公司做的（也没有「合作伙伴」）。
 * 名单是数据：业主的产品目录 / 色卡来了再改这里（studio/offer.js 要一起改）。
 */
export const OFFER = [
  { v: 'cabinets', zh: '定制柜', en: 'Custom cabinets' },
  { v: 'worktops', zh: '台面', en: 'Worktops' },
  { v: 'panels', zh: '墙板', en: 'Wall panels' },
  { v: 'doors', zh: '门', en: 'Doors' },
];
/** 公司做的表面：柜体（定制柜）、主题墙（只有「板」才是墙板）、台面。沙发软包、地板、墙漆从来不是 */
export const OFFER_SLOTS = ['cabinetry', 'feature', 'countertop'];
/**
 * 主题墙什么时候是公司做的墙板：木饰面板，或者仿石纹的板（大理石 / 洞石 / 水磨石纹）。
 * 微水泥、岩板（tex.type 'concrete'：抹灰 / 石材本身）和石灰墙、刷漆（cat 'paint'）一样是背景 —— 公司不做（业主 2026-10-19）。
 * 和 studio/offer.js 同一条规则。
 */
export const PANEL_TEX = ['wood', 'marble', 'travertine', 'terrazzo'];
export function isOfferSlot(slot, matId) {
  if (!OFFER_SLOTS.includes(slot)) return false;
  if (slot === 'feature') {
    const m = MAT_BY_ID[matId];
    return !!m && (m.cat === 'wood' || m.cat === 'stone') && PANEL_TEX.includes(m.tex?.type);
  }
  return true;
}
/**
 * 案例 supplies.firm 里算「我们做」的（src/shared/cases.js SUPPLY.firm 的 id；和 studio/offer.js 的 OFFER_SUPPLY 一样，
 * 另加 bedStorage = 收纳床 / 榻榻米 / 翻床 —— LEAD NOTE 8 说那是公司做的，已请 3D 那边也加上）
 */
export const OFFER_SUPPLY = ['kitchen', 'wardrobe', 'walkin', 'tvWall', 'shoeCabinet', 'displayShelf', 'displayCabinet', 'bookwall', 'study', 'toyStorage', 'vanity', 'altar', 'wallPanel', 'featureWall', 'doors', 'worktop', 'bedStorage'];
const OFFER_SUPPLY_SET = new Set(OFFER_SUPPLY);
const FIRM_PANELS = new Set(['tvWall', 'wallPanel', 'featureWall']);
const FIRM_DOORS = new Set(['doors', 'door']);
/** 台面跟着这几样柜子来（厨房、浴室柜）；案例也可以单独写一样「台面」（worktop，LEAD NOTE 8：公司配台面） */
const FIRM_WORKTOP = new Set(['kitchen', 'vanity', 'worktop']);
/** supplies.firm → { offer: 我们做的那几样 id, illustration: 活动家具（只是示意）的 id } */
export function splitSupply(firmIds = []) {
  const ids = Array.isArray(firmIds) ? firmIds : [];
  const offer = (id) => OFFER_SUPPLY_SET.has(id) || FIRM_DOORS.has(id);
  return { offer: ids.filter(offer), illustration: ids.filter((id) => !offer(id)) };
}
/** 这个案例的台面算不算「我们做」：公司做了厨房橱柜 / 浴室柜，台面就一起配 */
export const offersWorktop = (firmIds = []) => (Array.isArray(firmIds) ? firmIds : []).some((id) => FIRM_WORKTOP.has(id));
/** 案例「我们做」的那几样 → 归到业主的几类（定制柜 · 台面 · 墙板 · 门）；活动家具不算 */
export function offerKinds(firmIds = [], { featureMat } = {}) {
  const out = new Set();
  for (const id of Array.isArray(firmIds) ? firmIds : []) {
    if (FIRM_DOORS.has(id)) out.add('doors');
    else if (!OFFER_SUPPLY_SET.has(id) || id === 'worktop') continue; // 台面：下面的 offersWorktop
    else if (FIRM_PANELS.has(id)) {
      out.add('panels');
      if (id === 'tvWall') out.add('cabinets');
    } else out.add('cabinets');
  }
  if (offersWorktop(firmIds)) out.add('worktops');
  if (featureMat && isOfferSlot('feature', featureMat)) out.add('panels');
  return OFFER.filter((o) => out.has(o.v));
}

/** 空的「你的家」 */
export function emptyHome() {
  return {
    v: HOME_V,
    at: null,
    type: null,
    state: null,
    area: null,
    areaText: '',
    status: null,
    sizeSqft: null,
    sizeSure: true,
    bedrooms: null,
    bathrooms: null,
    storeys: null,
    scope: [],
    timeline: null,
    keep: { floor: null, walls: null, cabinetry: null, upholstery: null },
    keepItems: [],
    keepMode: null,
    template: null,
    // 客人有没有亲手动过（没动过的数字，设计师版标「默认值，未确认」）
    touched: {},
    plan: { state: 'none', source: null },
  };
}

/** 读旧的 / 不完整的 home（链接、存档）：缺的字段补上，多的保留；预算永远不留在 home 上（见文件开头） */
export function normalizeHome(h) {
  if (!h || typeof h !== 'object') return emptyHome();
  const e = emptyHome();
  const { budget, ...rest } = h; // eslint-disable-line no-unused-vars
  return {
    ...e,
    ...rest,
    state: STATE_BY_V[h.state] ? h.state : null,
    area: STATE_BY_V[h.state] && areaOf(h.state, h.area) ? h.area : null,
    areaText: typeof h.areaText === 'string' ? h.areaText.slice(0, AREA_MAX) : '',
    scope: Array.isArray(h.scope) ? h.scope.filter((s) => SCOPE_BY_V[s]) : [],
    keep: { ...e.keep, ...(h.keep || {}) },
    keepItems: Array.isArray(h.keepItems) ? h.keepItems.filter((v) => KEEP_ITEM_BY_V[v]) : [],
    touched: { ...(h.touched || {}) },
    plan: { ...e.plan, ...(h.plan || {}) },
  };
}

const variant = (type, storeys) => {
  const p = PROPERTY_BY_V[type] || PROPERTY_BY_V.condo;
  const v = p.byStoreys?.[Number(storeys)];
  return v ? { ...p, ...v } : p;
};

/** 这个类型（+ 层数）默认几房几卫几层 */
export function defaultsFor(type, storeys) {
  const p = variant(type, storeys);
  return { bedrooms: p.beds, bathrooms: p.baths, storeys: storeys != null && p.landed ? Number(storeys) : p.storeys };
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const SIZE_MIN = 300;
export const SIZE_MAX = 6000;
/** 大小四舍五入：2,000 以下按 50，以上按 100 */
export const roundSize = (v) => {
  const x = clamp(Number(v) || 0, SIZE_MIN, SIZE_MAX);
  return x < 2000 ? Math.round(x / 50) * 50 : Math.round(x / 100) * 100;
};

/** 不确定多大：按类型（+ 层数）+ 房数估一个（sq ft） */
export function typicalSize(type, bedrooms, storeys) {
  const p = PROPERTY_BY_V[type] ? variant(type, storeys) : PROPERTY_BY_V.other;
  const b = Number.isFinite(+bedrooms) && +bedrooms > 0 ? +bedrooms : p.beds;
  return b === p.beds ? p.typical : roundSize(p.typical + (b - p.beds) * p.perBed);
}

/** 没有户型图时用哪个示范户型（1 房的公寓 → 小公寓 studio；单层排屋 → 一层的 condo3，不是两层的排屋） */
export function templateFor(home = {}) {
  const p = PROPERTY_BY_V[home?.type];
  const tpl = (p && variant(home.type, p.landed ? home.storeys : null).template) || 'condo3';
  if (tpl === 'condo3' && !p?.landed && Number(home?.bedrooms) > 0 && Number(home.bedrooms) <= 1) return 'studio';
  return tpl;
}

/** 有地 / 高楼 */
export const isLanded = (home) => !!PROPERTY_BY_V[home?.type]?.landed;

/** K 屏（留下来的颜色）要不要出现：住着翻新、刚交屋 */
export const needsKeep = (home) => !!STATUS_BY_V[home?.status]?.keep;

/** 锁住的颜色：表面 → 材质 id（只收真的材质、放得上那个表面；「不确定」「都不像」不算） */
export function keepLocks(home) {
  const out = {};
  if (!home || home.keepMode === 'new' || home.keepMode === 'unsure') return out;
  for (const k of KEEP_SLOTS) {
    const id = home.keep?.[k.slot] ?? home.keep?.[k.id];
    if (typeof id === 'string' && MAT_BY_ID[id] && fits(id, k.slot)) out[k.slot] = id;
  }
  return out;
}

/** 平方英尺 → 平方米（取整） */
export const sqm = (sqft) => Math.round((Number(sqft) || 0) * 0.0929);
/** 约几个羽毛球场（13.4 × 6.1 m = 81.7 m² ≈ 880 sq ft；取到 0.5） */
export const COURT_SQFT = 880;
export const courts = (sqft) => Math.max(0.5, Math.round(((Number(sqft) || 0) / COURT_SQFT) * 2) / 2);
export const fmtSqft = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');

/** 大小滑杆：对数刻度 0–1 ↔ sq ft */
export function sizeToPos(sqft) {
  const v = clamp(Number(sqft) || SIZE_MIN, SIZE_MIN, SIZE_MAX);
  return Math.log(v / SIZE_MIN) / Math.log(SIZE_MAX / SIZE_MIN);
}
export function posToSize(pos) {
  return roundSize(SIZE_MIN * Math.pow(SIZE_MAX / SIZE_MIN, clamp(Number(pos) || 0, 0, 1)));
}

/** 「约一个 / 约 {0} 个羽毛球场」 */
export function courtsText(sqft) {
  const c = courts(sqft);
  return c === 1 ? t('约一个羽毛球场') : t('约 {0} 个羽毛球场', [c]);
}

/** 给 3D 读户型图的提示（H1–H3 的答案） */
export function planHint(home = {}) {
  const d = defaultsFor(home.type, home.storeys);
  return {
    type: home.type || null,
    sizeSqft: home.sizeSqft || typicalSize(home.type, home.bedrooms, home.storeys),
    bedrooms: home.bedrooms ?? d.bedrooms,
    bathrooms: home.bathrooms ?? d.bathrooms,
    storeys: isLanded(home) ? home.storeys ?? d.storeys : 1,
  };
}

const typeName = (home, { short = false } = {}) => {
  const p = PROPERTY_BY_V[home?.type];
  if (!p) return '';
  if (short) {
    const st = isLanded(home) ? Number(home.storeys) || p.storeys : 1;
    const base = lab(p.short);
    if (p.v === 'terrace' && st === 1) return t('单层{0}', [base]);
    if (p.landed && st >= 2) return st === 2 ? t('双层{0}', [base]) : t('{0} 层{1}', [st, base]);
    return base;
  }
  return lab(p);
};

/** 一行话：「双层排屋 · 4 房 3 卫 · 1,880 sq ft」（不确定大小时写「约」） */
export function homeLine(home) {
  if (!home?.type) return '';
  const bits = [typeName(home, { short: true })];
  if (home.bedrooms) bits.push(t('{0} 房 {1} 卫', [home.bedrooms >= 7 ? '7+' : home.bedrooms, home.bathrooms || 1]));
  if (home.sizeSqft) bits.push(home.sizeSure === false ? t('约 {0} sq ft', [fmtSqft(home.sizeSqft)]) : t('{0} sq ft', [fmtSqft(home.sizeSqft)]));
  return bits.filter(Boolean).join(' · ');
}

/** 做哪些地方：「全屋」或「客厅、厨房」 */
export function scopeText(home) {
  const s = home?.scope || [];
  if (!s.length || s.includes('whole')) return lab(SCOPE_BY_V.whole);
  return s.map((v) => lab(SCOPE_BY_V[v])).filter(Boolean).join(isEn() ? ', ' : '、');
}

/** 「两层楼」「三层楼」（中文用汉字说层数，像人说话；英文 Two floors）—— 不用「三层」：那是 3D 模板卡上的「三层（Three-storey）」 */
const FLOOR_WORDS = ['一层楼', '两层楼', '三层楼', '四层楼'];
export const floorsText = (n) => {
  const k = Math.max(1, Math.round(Number(n) || 1));
  return FLOOR_WORDS[k - 1] ? t(FLOOR_WORDS[k - 1]) : t('{0} 层楼', [k]); // 「{0} 层」在词典里是书架的「层」
};

/** 户型图这一行 */
export function planText(home, { wish = false } = {}) {
  const st = home?.plan?.state || 'none';
  if (st === 'read' || st === 'rough') {
    // 这里的 rooms 是「几个房间」（数字），不是户型的房间表 —— 用解构读，静态守门（floors.test）只认 plan.rooms 那种写法
    const { floors: f = 1, rooms: r = 0 } = home.plan;
    const head = f > 1 ? t('已读好 · {0} · {1} 个房间', [floorsText(f), r]) : t('已读好 · {0} 个房间', [r]);
    return wish ? t('{0}（在展厅 iPad 上）', [head]) : head;
  }
  if (st === 'reading') return t('正在读');
  if (st === 'unreadable') return t('已上传（设计师会照着重新画）');
  if (st === 'staff') return t('请员工帮忙上传');
  if (st === 'later') return t('示范户型（之后可以换成你的）');
  return t('还没有');
}

/**
 * 保留的颜色和大件：「地板 奶油大板砖、柜子 胡桃木、床」/ 'Floor (Cream slab tile), Cabinets (Walnut), Bed'
 * （英文不能把小写的「floor」直接接在材质名前面 —— 读起来像「floor Cream slab tile」；前面常有「Keeping: 」，所以用括号不用冒号）
 */
export function keepText(home) {
  const locks = keepLocks(home);
  const sep = isEn() ? ', ' : '、';
  const mats = KEEP_SLOTS.filter((k) => locks[k.slot]).map((k) => (isEn() ? `${lab(k.short)} (${keepLabel(k.slot, locks[k.slot])})` : `${lab(k.short)} ${keepLabel(k.slot, locks[k.slot])}`));
  const items = home?.keepMode === 'new' ? [] : (home?.keepItems || []).map((v) => lab(KEEP_ITEM_BY_V[v])).filter(Boolean);
  return [...mats, ...items].join(sep);
}

/** 谁住在这里（许愿之旅「生活」那一章的答案，不再问一次）—— 资料只用来配案例和给设计师；文字由 summary.js 的 lifeLabel 出 */
export const whoOf = (profile) => {
  const w = profile?.life?.who ?? profile?.answers?.life?.who;
  return Array.isArray(w) ? w : [];
};

/**
 * 客人版 / 设计师版的「你的家」几行 —— [{ id, label, value }]
 * 客人版只放客人自己答的；设计师版多：预算（staffNote.budget：客人在 H4 选的 / 设计师记的）、「默认值，未确认」、
 * 留下来但色卡里没有的表面、读图的把握。预算只从 staffNote 来（home 上永远没有预算）。
 */
export function homeSummary(home, { designer = false, staffNote = null } = {}) {
  if (!home?.type) return [];
  const out = [];
  const p = PROPERTY_BY_V[home.type];
  const st = STATUS_BY_V[home.status];
  const tl = TIMELINE_BY_V[home.timeline];
  const unconfirmed = designer ? ` · ${t('默认值，未确认')}` : '';
  out.push({ id: 'type', label: t('房子'), value: typeName(home, { short: true }) || lab(p) });
  const wh = whereText(home);
  if (wh) out.push({ id: 'where', label: t('在哪里'), value: wh });
  if (st) out.push({ id: 'status', label: t('现在'), value: lab(st) });
  if (home.sizeSqft) {
    const v = home.sizeSure === false ? t('约 {0} sq ft（估的）', [fmtSqft(home.sizeSqft)]) : t('约 {0} sq ft', [fmtSqft(home.sizeSqft)]);
    out.push({ id: 'size', label: t('大小'), value: v + (designer && home.sizeSure === false ? '' : designer && !home.touched?.size ? unconfirmed : '') });
  }
  if (home.bedrooms) {
    const v = t('{0} 房 {1} 卫', [home.bedrooms >= 7 ? '7+' : home.bedrooms, home.bathrooms || 1]);
    out.push({ id: 'rooms', label: t('几房几卫'), value: v + (designer && !home.touched?.bedrooms && !home.touched?.bathrooms ? unconfirmed : '') });
  }
  if (isLanded(home) && home.storeys) out.push({ id: 'storeys', label: t('几层'), value: t('{0} 层楼', [home.storeys]) });
  out.push({ id: 'scope', label: t('这次做'), value: scopeText(home) });
  if (tl) out.push({ id: 'timeline', label: t('想住进去'), value: lab(tl) });
  out.push({ id: 'plan', label: t('户型图'), value: planText(home) });
  const kt = keepText(home);
  if (kt) out.push({ id: 'keep', label: t('保留'), value: kt });
  if (designer) {
    const b = staffNote?.budget;
    if (budgetKnown(b)) out.push({ id: 'budget', label: t('预算（只给员工看）'), value: lab(BUDGET_BY_V[b]), designer: true });
    else if (b === 'unsure') out.push({ id: 'budget', label: t('预算（只给员工看）'), value: t('客人还没想好'), designer: true });
    if (home.keepMode === 'unsure') out.push({ id: 'keepUnsure', label: t('留下来的颜色'), value: t('客人还不确定，见面再说'), designer: true });
    for (const k of KEEP_SLOTS) {
      if (home.keep?.[k.slot] === 'unsure') out.push({ id: `keep-${k.slot}`, label: t('留下来的颜色'), value: t('客人要保留的{0}不在色卡里', [lab(k)]), designer: true });
    }
    const c = home.plan?.confidence;
    if (Number.isFinite(c) && (home.plan?.state === 'read' || home.plan?.state === 'rough')) {
      out.push({ id: 'confidence', label: t('读图把握'), value: `${Math.round(c * 100)}%`, designer: true });
    }
  }
  return out;
}

/** 案例 → 档案里存的小引用 { id, rev, title } */
export function caseRef(c) {
  if (!c) return null;
  const title = c.title && typeof c.title === 'object' ? { zh: c.title.zh || '', en: c.title.en || '' } : { zh: String(c.title || ''), en: '' };
  return { id: c.id, rev: c.rev || 1, title };
}

/**
 * 把「你的家」和选好的案例挂到档案上（不重算轴、不动牌；预算不会挂上去）。
 * cases 不传 = 保留档案原来的选择；传 [] = 清空（「先用你的牌」）。
 */
export function withHome(profile, home, cases) {
  if (!profile) return profile;
  const out = { ...profile };
  if (home) out.home = { ...normalizeHome(home), v: HOME_V, at: new Date().toISOString() };
  if (cases !== undefined) {
    out.cases = (cases || []).map(caseRef).filter((c) => c && c.id).slice(0, 3);
    out.caseId = out.cases[0]?.id ?? null;
  }
  return out;
}

/** 档案里的「你的家」走完没有（蓝图 CTA：去 3D / 继续「带它回家」） */
export function homeDone(profile) {
  const st = profile?.home?.plan?.state;
  return !!(profile?.home?.type && st && st !== 'none' && st !== 'reading' && profile.home.done);
}

/** 链接里的档案最长多少字（studio.html#p=…；iPad 的 Safari、WhatsApp 都吃得下） */
export const PACK_LIMIT = 6000;

/**
 * 打包给 3D（studio.html?from=home#p=…）：档案（你的家 + 选的案例）原样打包（预算本来就不在档案上）；
 * 太长（> PACK_LIMIT）就把小平面（home.plan.inline）拿掉再打包 —— 同一台设备的 3D 从 IndexedDB 读（handoff.js），
 * 别的设备打开就是示范户型。户型图的照片 / PDF 永远不进链接。
 * → { packed, profile, droppedInline }
 */
export async function packForStudio(profile, { limit = PACK_LIMIT } = {}) {
  let p = profile?.home && 'budget' in profile.home ? { ...profile, home: normalizeHome(profile.home) } : profile;
  let packed = await packJSON(slimProfile(p));
  let droppedInline = false;
  if (packed.length > limit && p?.home?.plan?.inline) {
    const { inline, ...plan } = p.home.plan; // eslint-disable-line no-unused-vars
    p = { ...p, home: { ...p.home, plan } };
    packed = await packJSON(slimProfile(p));
    droppedInline = true;
  }
  return { packed, profile: p, droppedInline };
}

// ───────────────────────── 员工记的（这台设备）：预算 ─────────────────────────
// 留多久见 keep.js（CONFIG.keepDays 天，从最后一次改起算；入口页「清空本机全部蓝图」一起清掉）

export { NOTES_KEY, LEADS_KEY };
export { clearStaffNotes, dropStaffNote, sweepKept } from './keep.js';
const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
};
/** 这一位客人的员工记录（{ budget?, at? }）—— 只在这台设备 */
export function staffNoteOf(id) {
  if (!id) return {};
  return keptNotes()[id] || {};
}
export function setStaffNote(id, patch) {
  if (!id) return {};
  const all = keptNotes();
  const next = { ...(all[id] || {}), ...patch, at: new Date().toISOString() };
  for (const k of Object.keys(next)) if (next[k] == null) delete next[k];
  all[id] = next;
  writeNotes(all);
  return next;
}
/** 只在员工的设备上问预算：许愿模式（展厅 iPad）、设计师版（?staff=1）。客人自己的手机上问了也到不了员工那里 → 不问 */
export const askBudgetOn = ({ config = {}, wish = false, staff = false } = {}) => !!config?.home?.askBudget && (wish || staff);

// ───────────────────────── 客人名单（展厅 iPad）：称呼 + WhatsApp + PDPA ─────────────────────────
// 留多久见 keep.js（CONFIG.keepDays 天，从这位客人最后一次留资料起算；过期的读的时候就删掉）

/** PDPA 同意那一句的版本（改了文字就加一） */
export const PDPA_V = 1;
export const NAME_MAX = 40;

/** WhatsApp 号码 → 「+60123456789」；看不出是电话 → ''。马来西亚手机 01x… / 601x… / +601x…；别的国家要带 + */
export function normalizePhone(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const plus = s.startsWith('+');
  const d = s.replace(/\D+/g, '');
  if (!plus && /^01\d{8,9}$/.test(d)) return `+6${d}`;
  if (/^601\d{8,9}$/.test(d)) return `+${d}`;
  if (plus && d.length >= 8 && d.length <= 15) return `+${d}`;
  return '';
}
/** 「+60 12-345 6789」（给人看的） */
export function phoneText(p) {
  const m = /^\+60(1\d)(\d{3,4})(\d{4})$/.exec(p || '');
  return m ? `+60 ${m[1]}-${m[2]} ${m[3]}` : p || '';
}
/** 「012-345 6789」（马来西亚号码的本地写法：Excel 当文字，不会吃掉开头的 0、也不会当成公式） */
export function phoneLocal(p) {
  const m = /^\+60(1\d)(\d{3,4})(\d{4})$/.exec(p || '');
  return m ? `0${m[1]}-${m[2]} ${m[3]}` : p || '';
}

export function listLeads() {
  return keptLeads();
}
export function clearLeads() {
  try {
    localStorage.removeItem(LEADS_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * 一位客人留下的联系方式 + 这一刻的家（存下原始的答案，导出时才用当时的语言写成字）。
 * intent：'measure'（预约免费量房）| 'whatsapp'（把我的家发到 WhatsApp）；同一位客人两样都按 → intents 两个都有。
 * link = 客人自己的家（不带预算，员工发到客人的 WhatsApp 用）。
 */
export const INTENTS = ['measure', 'whatsapp'];
/** 链接带上客人的语言（英文 → ?lang=en；中文 → 不带）。不是网址就原样返回 */
export function linkWithLang(link, lang) {
  if (!link) return link || '';
  try {
    const u = new URL(link);
    if (lang === 'en') u.searchParams.set('lang', 'en');
    else u.searchParams.delete('lang');
    return u.href;
  } catch {
    return link;
  }
}
/** 这一条名单是用哪种语言留的（旧的没记：看链接有没有 ?lang=en，再不行用现在的语言） */
export function leadLang(lead) {
  if (lead?.lang === 'en' || lead?.lang === 'zh') return lead.lang;
  if (/[?&]lang=en(&|#|$)/.test(String(lead?.link || ''))) return 'en';
  return getLang();
}
export function makeLead({ profile, name, phone, consent, intent, link = '', lang = getLang(), at = new Date().toISOString() }) {
  const ph = normalizePhone(phone);
  const nm = String(name || '').trim().slice(0, NAME_MAX);
  if (!nm || !ph || !consent) return null;
  const home = profile?.home ? normalizeHome(profile.home) : null;
  if (home?.plan) delete home.plan.inline;
  return {
    v: 1,
    id: `ld_${Date.parse(at).toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at,
    name: nm,
    phone: ph,
    consent: { v: PDPA_V, at },
    intents: [INTENTS.includes(intent) ? intent : 'measure'],
    profileId: profile?.id || null,
    code: profile?.code || null,
    who: whoOf(profile),
    home,
    cases: (profile?.cases || []).map((c) => c?.title).filter(Boolean),
    budget: profile?.id ? staffNoteOf(profile.id).budget || null : null,
    lang: lang === 'en' ? 'en' : 'zh',
    link: linkWithLang(link, lang),
  };
}
/**
 * 留了名单以后客人的家又变了（员工在 3D 里帮他上传了户型图）：那一条名单的「家」、参考案例、链接跟着更新；
 * 称呼、号码、PDPA 同意、时间（保留期从客人最后一次留资料起算）都不动。没有这一位的名单 → null
 */
export function updateLeadHome(profile, link) {
  if (!profile?.id) return null;
  const all = listLeads();
  const old = all.find((x) => x.profileId === profile.id);
  if (!old) return null;
  const home = profile.home ? normalizeHome(profile.home) : null;
  if (home?.plan) delete home.plan.inline;
  const next = { ...old, home, cases: (profile.cases || []).map((c) => c?.title).filter(Boolean), ...(link ? { link: linkWithLang(link, leadLang(old)) } : {}) };
  lsSet(LEADS_KEY, all.map((x) => (x === old ? next : x)));
  return next;
}
/** 存进这台 iPad（同一位客人再按一次 = 更新那一条：名字 / 号码用新的，想要的两样合在一起，不重复） */
export function saveLead(lead) {
  if (!lead) return null;
  const all = listLeads();
  const old = lead.profileId ? all.find((x) => x.profileId === lead.profileId) : null;
  const merged = old ? { ...old, ...lead, id: old.id, intents: INTENTS.filter((v) => [...(old.intents || []), ...(lead.intents || [])].includes(v)) } : lead;
  const list = [merged, ...all.filter((x) => x !== old)];
  lsSet(LEADS_KEY, list.slice(0, 500));
  return merged;
}

const INTENT = { measure: '预约免费量房', whatsapp: '把我的家发到 WhatsApp' };
export const intentText = (v) => t(INTENT[v] || INTENT.measure);
/** 一条名单想要的（旧的 intent 字段也认） */
export const intentsOf = (lead) => (Array.isArray(lead?.intents) ? lead.intents : lead?.intent ? [lead.intent] : []).filter((v) => INTENTS.includes(v));

/** 一行名单（导出、员工区都用这一份）→ [{ k, label, value }] —— 员工看的，所以预算在里面 */
export function leadFields(lead, { lifeLabel = (k, v) => v } = {}) {
  const h = lead?.home || {};
  const d = DREAMER_BY_CODE[lead?.code];
  const at = lead?.at ? new Date(lead.at) : null;
  const pad = (n) => String(n).padStart(2, '0');
  const when = at && !Number.isNaN(+at) ? `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}` : '';
  const b = lead?.budget;
  return [
    { k: 'at', label: t('时间'), value: when },
    { k: 'name', label: t('称呼'), value: lead?.name || '' },
    { k: 'phone', label: t('WhatsApp'), value: phoneLocal(lead?.phone) },
    { k: 'intent', label: t('想要'), value: intentsOf(lead).map(intentText).join(' + ') },
    { k: 'card', label: t('梦想家卡牌'), value: d ? `${d.code} ${L({ zh: d.zh, en: d.en })}` : lead?.code || '' },
    { k: 'home', label: t('房子'), value: homeLine(h) },
    { k: 'where', label: t('在哪里'), value: whereText(h) },
    { k: 'status', label: t('现在'), value: lab(STATUS_BY_V[h.status]) },
    { k: 'scope', label: t('这次做'), value: h.type ? scopeText(h) : '' },
    { k: 'timeline', label: t('想住进去'), value: lab(TIMELINE_BY_V[h.timeline]) },
    { k: 'budget', label: t('预算'), value: budgetKnown(b) ? lab(BUDGET_BY_V[b]) : b === 'unsure' ? t('还没想好') : '' },
    { k: 'who', label: t('同住'), value: (lead?.who || []).map((v) => lifeLabel('who', v)).join(isEn() ? ', ' : '、') },
    { k: 'cases', label: t('参考案例'), value: (lead?.cases || []).map((c) => L(c)).filter(Boolean).join(isEn() ? ', ' : '、') },
    { k: 'keep', label: t('保留'), value: keepText(h) },
    { k: 'plan', label: t('户型图'), value: h.type ? planText(h) : '' },
    { k: 'consent', label: t('PDPA 同意'), value: lead?.consent?.at ? t('同意（第 {0} 版）', [lead.consent.v || 1]) : '' },
    { k: 'link', label: t('客人的家（链接）'), value: lead?.link || '' },
    { k: 'profile', label: t('档案号'), value: lead?.profileId || '' },
  ];
}

const csvCell = (v) => {
  const s = String(v ?? '');
  // 公式开头的字（= + - @）前面加一个 '，Excel 才不会把它当公式（外国号码 +65… 也一样）
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
/** 名单 → CSV（UTF-8 带 BOM，Excel 直接打开中文不乱码；CRLF 换行） */
export function leadsCSV(leads, opts) {
  const rows = (leads || []).map((l) => leadFields(l, opts));
  const head = (rows[0] || leadFields({}, opts)).map((f) => f.label);
  const lines = [head, ...rows.map((r) => r.map((f) => f.value))].map((r) => r.map(csvCell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}
/** 导出文件名：WISH-leads-YYYYMMDD-HHmm.csv */
export function leadsFileName(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `WISH-leads-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.csv`;
}
