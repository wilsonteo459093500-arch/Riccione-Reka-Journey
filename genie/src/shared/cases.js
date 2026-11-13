// 案例库 —— 公司做过的家（kind 'project'）+ 我们自己画的 3D 风格方案（kind 'concept'，种子案例）。
//
// 资料从哪里来：
//   · 随网站一起发布的 src/cases/manifest.json（纯文字；照片在 CONFIG.cases.base 下面，默认 public/cases/）；
//     真实照片用 scripts/import-cases.mjs 从「一个项目一个文件夹」的照片批量生成（1600 + 480 WebP，去掉 EXIF / GPS）。
//   · 这台设备上员工改过 / 新增的案例：IndexedDB 'genie-cases'（cases、photos 两个仓库）+ localStorage 'genie.cases.meta.v1'（排序、隐藏）。
//     同一个 id：rev 大的赢（设备上改过一次 = rev + 1）。
//
// 配对（matchCases）只用客人自己的、可以给客人看的资料：牌、轴、自己选的图、三个愿望、雷区、你的家。
// 永远不用：门铃那题、反应时间、设计师的谈话提示、预算。理由文字（reasonText）同样只说这些。
//
// 没有任何颜色写死：案例的色板从材质 id 推出来（MAT_BY_ID[id].color）。
//
// 溪岸板材（SPEC §4.2 + §8 R11）：case.boards = { cabinetry?, feature? } 是设计师真的用的那几块板（板材 id，'sail-7'），
// case.boardsAlso = [id…] 是照片里还看得到的别的板（例如织系列编织门：只显示、不上 3D）。
// 板材 id 就算这台设备还不认得也留着（员工可能先填 23号、板材包后来才导入）；case.materials[slot] 永远留一个程序化的
// 近似材质（板材的 near）—— 旧版本、手机、没导入板材包的设备照样看得懂这个案例。

import { CONFIG } from './config.js';
import { t, tIn, L, isEn, missing } from './i18n.js';
import { MAT_BY_ID, SLOTS, SLOT_BY_ID, fits, BOARD_SLOTS } from './materials.js';
import { BOARD_ID_RE, isColourCode } from './boards/library-api.js';
import { exactBoards, idLabel, boardsOn } from './boards/match.js';
import { tagsOf } from './moods.js';
import { AXES, HIDDEN_AXES, DREAMERS, DREAMER_BY_CODE, codeOf } from './dreamers.js';
import * as FLOW from '../quiz/flow.js';

export const CASE_V = 1;
/** project = 我们做过的家 · concept = 3D 风格方案（种子）· showroom = 展厅照片（只给员工看，永远不配给客人） */
export const KINDS = ['project', 'concept', 'showroom'];
export const STATUSES = ['live', 'draft', 'hidden'];

// ───────────────────────── 资料表（员工编辑器、客人卡片都用） ─────────────────────────

/**
 * 案例里「公司那一边」的东西（case.supplies.firm 存 id）：
 *   group 'offer'     = 我们做（业主 2026-10-19 + LEAD NOTE 6 / 8）：定制柜（含柜内灯带）、墙板、门（含隐形门 / 移门 / 旋转门）、
 *                        收纳床（榻榻米 / 栖云 / 翻床）；台面跟着厨房橱柜 / 浴室柜一起算（home.js offersWorktop）；
 *   group 'furniture' = 家具（只是示意）：活动家具是通用的示意款，不是公司的产品，客人那边显示「家具示意」。
 * 「现场搭配」（context：地板、灯光、油漆、窗帘…）只是背景，或者保留客人家里原有的。
 * 我们做的 id 要和 src/studio/offer.js、src/shared/home.js 的 OFFER_SUPPLY 一致（test/studio-case.test.mjs 逐个查）。
 */
export const SUPPLY = {
  firm: [
    { id: 'kitchen', zh: '厨房橱柜', en: 'Kitchen cabinets', group: 'offer' },
    { id: 'wardrobe', zh: '衣柜', en: 'Wardrobes', group: 'offer' },
    { id: 'walkin', zh: '衣帽间', en: 'Walk-in wardrobe', group: 'offer' },
    { id: 'tvWall', zh: '电视墙 · 电视柜', en: 'TV wall & console', group: 'offer' },
    { id: 'shoeCabinet', zh: '鞋柜', en: 'Shoe cabinet', group: 'offer' },
    { id: 'displayShelf', zh: '开放展示架', en: 'Display shelving', group: 'offer' },
    { id: 'displayCabinet', zh: '玻璃展示柜', en: 'Glass display cabinets', group: 'offer' },
    { id: 'bookwall', zh: '书墙', en: 'Bookwall', group: 'offer' },
    { id: 'study', zh: '书房柜 · 书桌', en: 'Study cabinets & desk', group: 'offer' },
    { id: 'bedStorage', zh: '收纳床', en: 'Storage bed', group: 'offer' },
    { id: 'toyStorage', zh: '玩具收纳柜', en: 'Toy storage', group: 'offer' },
    { id: 'vanity', zh: '浴室柜', en: 'Bathroom vanity', group: 'offer' },
    { id: 'altar', zh: '神台', en: 'Altar cabinet', group: 'offer' },
    { id: 'wallPanel', zh: '墙板', en: 'Wall panels', group: 'offer' },
    { id: 'featureWall', zh: '主题墙', en: 'Feature wall', group: 'offer' },
    { id: 'doors', zh: '室内门', en: 'Interior doors', group: 'offer' },
    // 台面：外购、由我们交付（业主 2026-10-19）；有厨房橱柜 / 浴室柜时 home.js offersWorktop 本来就算
    { id: 'worktop', zh: '台面', en: 'Worktop', group: 'offer' },
    { id: 'sofa', zh: '沙发', en: 'Sofa', group: 'furniture' },
    { id: 'diningSet', zh: '餐桌椅', en: 'Dining set', group: 'furniture' },
    { id: 'bed', zh: '床 · 床头', en: 'Bed & headboard', group: 'furniture' },
    { id: 'desk', zh: '书桌', en: 'Desk', group: 'furniture' },
  ],
  context: [
    { id: 'flooring', zh: '地板', en: 'Flooring' },
    { id: 'lighting', zh: '灯光', en: 'Lighting' },
    { id: 'paint', zh: '墙面油漆', en: 'Wall paint' },
    { id: 'curtains', zh: '窗帘', en: 'Curtains' },
    { id: 'tiles', zh: '瓷砖', en: 'Tiles' },
    { id: 'plants', zh: '绿植', en: 'Plants' },
    { id: 'art', zh: '挂画 · 摆件', en: 'Art & objects' },
    { id: 'appliances', zh: '家电', en: 'Appliances' },
  ],
};
export const SUPPLY_BY_ID = Object.fromEntries([...SUPPLY.firm, ...SUPPLY.context].map((s) => [s.id, s]));
/** 员工编辑器分两组显示（存的时候都在 supplies.firm 里，客人那边由 home.js splitSupply 再分） */
export const SUPPLY_OFFER = SUPPLY.firm.filter((s) => s.group === 'offer');
export const SUPPLY_FURNITURE = SUPPLY.firm.filter((s) => s.group === 'furniture');
const OFFER_IDS = new Set(SUPPLY_OFFER.map((s) => s.id));
const OFFER_ORDER = Object.fromEntries(SUPPLY_OFFER.map((s, i) => [s.id, i]));

/**
 * 「每个房间我们做了什么」自动推算（员工没写 roomsMade[room] 的房间）：我们做的这一样，放在候选房间里
 * 第一个这个家真的做了的（case.rooms）；一个都没有 → 「全屋」（ROOM_HOME）。门永远算全屋。
 * 台面不看这张表的第一个：跟着厨房橱柜 / 浴室柜放在同一个房间（caseRoomsMade）。
 */
export const SUPPLY_ROOMS = {
  kitchen: ['kitchen'],
  worktop: ['kitchen', 'bath'],
  wardrobe: ['master', 'bedroom', 'kids'],
  walkin: ['walkin', 'master'],
  tvWall: ['living', 'family'],
  shoeCabinet: ['foyer'],
  displayShelf: ['living', 'family', 'dining'],
  displayCabinet: ['dining', 'living'],
  bookwall: ['study', 'living', 'family'],
  study: ['study'],
  bedStorage: ['master', 'bedroom', 'kids'],
  toyStorage: ['kids', 'family'],
  vanity: ['bath'],
  altar: ['living', 'dining', 'family'],
  wallPanel: ['living', 'master', 'bedroom', 'dining', 'family', 'foyer'],
  featureWall: ['living', 'master', 'dining', 'family'],
  doors: [],
};
/** 不算「柜子」的那几样（案例的柜体板不跟着它们走）：墙板、主题墙、门、台面 */
const NOT_CABINET = new Set(['wallPanel', 'featureWall', 'doors', 'worktop']);
/** 案例的主题墙板跟着这两样走 */
const PANEL_OFFERS = new Set(['wallPanel', 'featureWall']);
/**
 * 这个案例的台面算不算「我们做」：做了厨房橱柜 / 浴室柜（或单独写了台面）—— 和 home.js 的 offersWorktop 同一条。
 * 不 import home.js：它会把板材的配对代码一起拖进员工案例库那一页（多 10 kB）；test/showcase.test.mjs 逐个对过两边一样。
 */
const WORKTOP_WITH = new Set(['kitchen', 'vanity', 'worktop']);
const offersWorktop = (ids) => (Array.isArray(ids) ? ids : []).some((id) => WORKTOP_WITH.has(id));

/** 案例照片拍的是哪个房间（id 和 3D 工作室的 ROOM_TYPES 一致；plan3d = 整个家的 3D 鸟瞰） */
export const ROOMS = [
  { id: 'living', zh: '客厅', en: 'Living' },
  { id: 'dining', zh: '餐厅', en: 'Dining' },
  { id: 'kitchen', zh: '厨房', en: 'Kitchen' },
  { id: 'family', zh: '起居厅', en: 'Family hall' },
  { id: 'master', zh: '主卧', en: 'Master bedroom' },
  { id: 'bedroom', zh: '卧室', en: 'Bedroom' },
  { id: 'kids', zh: '儿童房', en: 'Kids room' },
  { id: 'study', zh: '书房', en: 'Study' },
  { id: 'bath', zh: '浴室', en: 'Bathroom' },
  { id: 'foyer', zh: '玄关', en: 'Foyer' },
  { id: 'walkin', zh: '衣帽间', en: 'Walk-in' },
  { id: 'balcony', zh: '阳台', en: 'Balcony' },
  { id: 'plan3d', zh: '整个家（3D）', en: 'Whole home (3D)' },
];
export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
/**
 * 还没标房间的照片：room = ''（不是「客厅」）。客人那边不显示房间名字，3D 的「对照片」也不会拿它去配房间；
 * 员工的案例库显示「房间？」（roomLabel(id, { ask:true })）。
 */
export const ROOM_UNKNOWN = '';
export const roomOk = (id) => id === ROOM_UNKNOWN || !!ROOM_BY_ID[id];
export const roomLabel = (id, { ask = false } = {}) => (ROOM_BY_ID[id] ? L(ROOM_BY_ID[id]) : ask ? t('房间？') : '');
/** 「全屋」：不属于哪一个房间的（室内门之类）—— 只用在 case.roomsMade 和 caseRoomsMade，不是照片的房间 */
export const ROOM_HOME = 'home';
/** case.roomsMade 认的房间：照片的房间（整个家的 3D 鸟瞰不算）+ 全屋，按这个顺序显示 */
const MADE_ROOMS = [...ROOMS.filter((r) => r.id !== 'plan3d').map((r) => r.id), ROOM_HOME];
const madeRoomLabel = (room) => (room === ROOM_HOME ? t('全屋') : roomLabel(room));

/** 房子类型（id 和 src/shared/home.js 的 PROPERTY 一致；这里只放案例要用的短名字） */
export const PROPERTY_TYPES = [
  { id: 'condo', zh: '公寓', en: 'Condo', landed: false },
  { id: 'terrace', zh: '排屋', en: 'Terrace', landed: true },
  { id: 'semid', zh: '半独立式', en: 'Semi-D', landed: true },
  { id: 'bungalow', zh: '独立式洋房', en: 'Bungalow', landed: true },
  { id: 'townhouse', zh: '城镇屋', en: 'Townhouse', landed: true },
  { id: 'other', zh: '其他', en: 'Other', landed: null },
];
export const PROPERTY_BY_ID = Object.fromEntries(PROPERTY_TYPES.map((p) => [p.id, p]));
const CLASS = { condo: 'high', terrace: 'landed', semid: 'landed', bungalow: 'landed', townhouse: 'landed' };
export const TEMPLATES = ['condo3', 'terrace2', 'semid2', 'studio'];

/** 照片里看得见的「雷区」质感（和 flow.js NOGO_FINISHES 的 v 一致）—— 员工在编辑器里点 */
export const FEATURES = [
  { id: 'openshelf', zh: '开放层板', en: 'Open shelving' },
  { id: 'glassdoor', zh: '玻璃柜门', en: 'Glass cabinet doors' },
  { id: 'rattan', zh: '藤编', en: 'Rattan' },
  { id: 'herringbone', zh: '人字拼地板', en: 'Herringbone floor' },
  { id: 'wallpaper', zh: '花纹墙纸', en: 'Patterned wallpaper' },
  { id: 'marble', zh: '大理石纹', en: 'Marble' },
  { id: 'glossy', zh: '亮面高光', en: 'High gloss' },
  { id: 'gold', zh: '金色金属', en: 'Gold metal' },
  { id: 'concrete', zh: '水泥工业风', en: 'Industrial concrete' },
  { id: 'velvet', zh: '丝绒', en: 'Velvet' },
  { id: 'leather', zh: '皮革', en: 'Leather' },
];

/** 客人卡片 / 详情「这个家用了」的六个主要表面 */
export const KEY_SLOTS = ['floor', 'walls', 'feature', 'cabinetry', 'countertop', 'upholstery'];
/** 雷区排除只看这些「主角」表面（软装 —— 地毯、窗帘、点缀、床品、五金、木作 —— 3D 里会自动换掉，不排除） */
export const HERO = ['floor', 'walls', 'feature', 'cabinetry', 'upholstery'];
const PALETTE_SLOTS = ['walls', 'floor', 'feature', 'cabinetry', 'upholstery', 'accents'];
const AX = AXES.map((a) => a.id);
const HID = HIDDEN_AXES.map((a) => a.id);

/** 风格「点一点」：每条轴三个档 → 80 / 50 / 20（a 侧的百分比） */
export const CHIP_VALUE = { a: 80, mid: 50, b: 20 };
export const STYLE_CHIPS = [
  ...AXES.map((ax) => ({ id: ax.id, group: 'axes', a: ax.a, b: ax.b })),
  ...HIDDEN_AXES.map((ax) => ({ id: ax.id, group: 'hidden', a: ax.a, b: ax.b })),
];

// ───────────────────────── 小工具 ─────────────────────────

const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const nowISO = () => new Date().toISOString();
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const txt = (v) => (isObj(v) ? { zh: String(v.zh ?? ''), en: String(v.en ?? '') } : { zh: typeof v === 'string' ? v : '', en: '' });
const num = (v, d = null) => (Number.isFinite(+v) && v !== '' && v != null ? +v : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** 案例的「有效材质」：员工没填的表面用主牌的材质补上（真实照片常常只标了几样）；这台设备认得的案例原板盖在上面 */
export function caseMaterials(c) {
  const d = DREAMER_BY_CODE[c?.style?.dreamers?.[0]];
  return { ...(d?.materials || {}), ...(c?.materials || {}), ...exactBoards(c) };
}

/** 板材 id 的样子对不对（'sail-7'、'sail-c2810'…；R8：id 一旦给了就不变） */
export const isBoardId = (id) => typeof id === 'string' && BOARD_ID_RE.test(id);

/** 这个案例用到的溪岸板材（表面的 + 「还用了」的），去重：[{ id, slot | null, known }]（known = 这台设备的板材库里有） */
export function caseBoardList(c) {
  const out = [];
  const seen = new Set();
  const add = (id, slot) => {
    if (!isBoardId(id) || seen.has(id)) return;
    seen.add(id);
    out.push({ id, slot, known: !!MAT_BY_ID[id]?.board });
  };
  for (const slot of BOARD_SLOTS) add(c?.boards?.[slot], slot);
  for (const id of c?.boardsAlso || []) add(id, null);
  return out;
}

/**
 * 员工在案例库里给一个表面选板（id = null 清掉）：case.boards[slot] = id，并且 **每次** 把 case.materials[slot] 写成
 * 这块板最接近的程序化材质（near；R11 a）—— 许愿之旅的配对（不读板材包）、旧版本、手机都和案例原板一致。直接改 c（编辑器的 patch 里用）。
 */
export function setCaseBoard(c, slot, id) {
  if (!BOARD_SLOTS.includes(slot)) return c;
  c.boards = { ...(isObj(c.boards) ? c.boards : {}) };
  if (!isBoardId(id)) {
    delete c.boards[slot];
    return c;
  }
  c.boards[slot] = id;
  c.boardsAlso = (c.boardsAlso || []).filter((x) => x !== id);
  const near = MAT_BY_ID[id]?.board?.near;
  if (near && MAT_BY_ID[near] && !MAT_BY_ID[near].board && fits(near, slot)) c.materials = { ...(c.materials || {}), [slot]: near };
  return c;
}

export const isConcept = (c) => c?.kind !== 'project' && c?.kind !== 'showroom';

/** 卡片上的一行：公寓 · 3 房 2 卫 · 约 1,100 sq ft */
export function placeLine(c) {
  const p = c?.property || {};
  const parts = [];
  const type = PROPERTY_BY_ID[p.type];
  if (type && p.type !== 'other') parts.push(t(type.zh));
  if (p.bedrooms) parts.push(p.bathrooms ? t('{0} 房 {1} 卫', [p.bedrooms, p.bathrooms]) : t('{0} 房', [p.bedrooms]));
  if (p.sizeSqft) parts.push(t('约 {0} sq ft', [Math.round(p.sizeSqft).toLocaleString('en-US')]));
  return parts.join(' · ');
}

// ───────────────────────── 版本迁移 / 检查 ─────────────────────────

/**
 * case.roomsMade（员工写的「这个房间我们做了什么」）整理：{ [room]: { firm: [我们做的 id], boards: [板材 id ≤ 4], note: { zh, en } } }。
 * room 只收 MADE_ROOMS（照片的房间、不含 plan3d，+ 'home'）；firm 只收我们做的（SUPPLY_OFFER，家具 / 现场搭配不算）；
 * boards 只收样子对的板材 id（不认得的也留着，和 case.boards 一样）。按 MADE_ROOMS 的顺序写，可以重复调用。
 */
function cleanRoomsMade(v) {
  const out = {};
  if (!isObj(v)) return out;
  for (const room of MADE_ROOMS) {
    const x = v[room];
    if (!isObj(x)) continue;
    out[room] = {
      firm: [...new Set((Array.isArray(x.firm) ? x.firm : []).filter((id) => OFFER_IDS.has(id)))],
      boards: [...new Set((Array.isArray(x.boards) ? x.boards : []).filter(isBoardId))].slice(0, 4),
      note: txt(x.note),
    };
  }
  return out;
}

/**
 * 任何版本的案例 → v1 的完整形状（缺的字段补默认值；v1 本身原样整理，可以重复调用）。
 * v0（早期草稿 / 手写 JSON）：title 是字符串、dreamer / dreamers / axes / hidden 放在最外层、
 * photos: [url | { src, room }]、type / size / bedrooms 放在最外层、tags = features。
 * 案例展示（showcase）加的字段都是补出来的（v 还是 1）：照片的 caption { zh, en } / detail，案例的 roomsMade（cleanRoomsMade）。
 * case.images 的顺序就是员工排的顺序。
 */
export function migrateCase(raw) {
  const r = isObj(raw) ? clone(raw) : {};
  const v0 = !(r.v >= 1);
  const style = isObj(r.style) ? r.style : {};
  const dreamers = [...new Set([...(style.dreamers || []), ...(v0 ? [].concat(r.dreamers || r.dreamer || []) : [])])].filter((d) => DREAMER_BY_CODE[d]).slice(0, 3);
  const axIn = { ...(v0 && isObj(r.axes) ? r.axes : {}), ...(style.axes || {}) };
  const hidIn = { ...(v0 && isObj(r.hidden) ? r.hidden : {}), ...(style.hidden || {}) };
  const prop = isObj(r.property) ? r.property : {};
  const kind = KINDS.includes(r.kind) ? r.kind : String(r.id || '').startsWith('seed-') ? 'concept' : 'project';
  const imgsIn = Array.isArray(r.images) ? r.images : Array.isArray(r.photos) ? r.photos : [];
  const images = imgsIn
    .map((im, i) => (typeof im === 'string' ? { src: im } : isObj(im) ? im : null))
    .filter(Boolean)
    .map((im, i) => ({
      id: String(im.id ?? String(i + 1).padStart(2, '0')),
      room: ROOM_BY_ID[im.room] ? im.room : ROOM_UNKNOWN,
      kind: ['photo', 'render', 'plan3d'].includes(im.kind) ? im.kind : im.room === 'plan3d' ? 'plan3d' : kind === 'project' ? 'photo' : 'render',
      w: num(im.w, 1600),
      h: num(im.h, 1200),
      src: String(im.src || ''),
      thumb: String(im.thumb || im.src || ''),
      alt: txt(im.alt),
      cover: !!im.cover,
      ...(im.device ? { device: true } : {}),
      // 给客人看的照片说明（中 / 英）+ 细节特写（柜门、拉手、板材纹理、收口…）
      caption: txt(im.caption),
      detail: !!im.detail,
    }));
  if (images.length && !images.some((im) => im.cover)) images[0].cover = true;
  let seenCover = false;
  for (const im of images) {
    if (im.cover && seenCover) im.cover = false;
    if (im.cover) seenCover = true;
  }
  const rooms = [...new Set((Array.isArray(r.rooms) ? r.rooms : images.map((im) => im.room)).filter((x) => ROOM_BY_ID[x] && x !== 'plan3d'))];
  const materials = {};
  for (const [slot, id] of Object.entries(isObj(r.materials) ? r.materials : {})) if (SLOT_BY_ID[slot] && MAT_BY_ID[id] && !MAT_BY_ID[id].board) materials[slot] = id;
  // 溪岸板材：只收样子对的 id（不认得的也留着：板材包可能还没导入）；「还用了」去重、最多 8 块
  const boards = {};
  for (const slot of BOARD_SLOTS) if (isBoardId(r.boards?.[slot])) boards[slot] = r.boards[slot];
  // 手写 / 别的工具把板材 id 写进了 materials：挪到 boards，materials 留它的近似材质
  for (const slot of BOARD_SLOTS) {
    const id = r.materials?.[slot];
    if (!isBoardId(id) || boards[slot]) continue;
    boards[slot] = id;
    const near = MAT_BY_ID[id]?.board?.near;
    if (near && MAT_BY_ID[near] && !MAT_BY_ID[near].board && fits(near, slot)) materials[slot] = near;
  }
  const onSlots = new Set(Object.values(boards));
  const boardsAlso = [...new Set((Array.isArray(r.boardsAlso) ? r.boardsAlso : []).filter((id) => isBoardId(id) && !onSlots.has(id)))].slice(0, 8);
  const furniture = isObj(r.furniture) ? { ...r.furniture } : {};
  const supplies = isObj(r.supplies) ? r.supplies : {};
  const status = STATUSES.includes(r.status) ? r.status : kind === 'project' ? 'draft' : 'live';
  const at = r.createdAt || r.updatedAt || nowISO();
  return {
    id: String(r.id || `p-${Date.now().toString(36)}`),
    kind,
    v: CASE_V,
    rev: Math.max(1, Math.floor(num(r.rev, 1))),
    status,
    order: num(r.order, 1000),
    consent: !!r.consent,
    title: txt(r.title ?? r.name),
    story: txt(r.story),
    place: txt(r.place),
    property: {
      type: PROPERTY_BY_ID[prop.type ?? r.type] ? prop.type ?? r.type : 'other',
      sizeSqft: num(prop.sizeSqft ?? r.sizeSqft ?? r.size, null),
      bedrooms: num(prop.bedrooms ?? r.bedrooms, null),
      bathrooms: num(prop.bathrooms ?? r.bathrooms, null),
      storeys: num(prop.storeys ?? r.storeys, 1),
    },
    scope: r.scope === 'rooms' ? 'rooms' : 'whole',
    rooms,
    template: TEMPLATES.includes(r.template) ? r.template : null,
    style: {
      dreamers,
      axes: Object.fromEntries(AX.map((k) => [k, clamp(num(axIn[k], 50), 0, 100)])),
      hidden: Object.fromEntries(HID.map((k) => [k, clamp(num(hidIn[k], 50), 0, 100)])),
      wishes: [...new Set(style.wishes || r.wishes || [])],
      features: [...new Set(style.features || r.features || r.tags || [])].filter((f) => FEATURES.some((x) => x.id === f)),
    },
    materials,
    boards,
    boardsAlso,
    mood: ['cozy', 'bright', 'moody'].includes(r.mood) ? r.mood : 'cozy',
    time: num(r.time, null),
    furniture,
    supplies: { firm: [...(supplies.firm || [])], context: [...(supplies.context || [])] },
    roomsMade: cleanRoomsMade(r.roomsMade),
    products: Array.isArray(r.products) ? r.products.filter(isObj).map((p) => ({ id: String(p.id || ''), name: txt(p.name), kind: p.kind === 'furniture' ? 'furniture' : 'cabinet', note: txt(p.note) })) : [],
    wishNotes: Object.fromEntries(Object.entries(isObj(r.wishNotes) ? r.wishNotes : {}).map(([k, v]) => [k, txt(v)])),
    images,
    // 设备上的副本存的时候，随网站那一份的照片 id 和 rev（saveCase 记的；merged 用它认出网站后来新加的照片）
    ...(Array.isArray(r.bundledImages) ? { bundledImages: [...new Set(r.bundledImages.map(String))], ...(num(r.bundledRev) != null ? { bundledRev: num(r.bundledRev) } : {}) } : {}),
    createdAt: at,
    updatedAt: r.updatedAt || at,
  };
}

/**
 * 上架前提醒员工（不挡上架）：一半以上的照片还没标房间 → 客人看到的照片没有房间名字，3D 的「对照片」也配不上房间。
 * → [{ field, zh, vars }]（t(zh, vars) 显示）
 */
export function caseWarnings(c) {
  const out = [];
  const imgs = (c?.images || []).filter((im) => im.room !== 'plan3d' && im.kind !== 'plan3d');
  const none = imgs.filter((im) => !ROOM_BY_ID[im.room]).length;
  if (imgs.length && none * 2 > imgs.length) out.push({ field: 'images', zh: '{0} / {1} 张照片还没标房间', vars: [none, imgs.length] });
  // 填了、但这台设备的板材库里还没有的板（不挡上架：导入板材包以后自动显示）
  for (const b of caseBoardList(c)) if (!b.known) out.push({ field: 'boards', zh: '板号 {0} 还不在板材库里（导入板材包后会自动显示）', vars: [idLabel(b.id)] });
  return out;
}

/** 检查一个案例能不能上架（live）。草稿只要求有 id 和中文标题。errors[].zh 是给员工看的提示（t() 显示） */
export function validateCase(c, { forLive = c?.status === 'live' } = {}) {
  const errors = [];
  const err = (field, zh) => errors.push({ field, zh });
  if (!c || typeof c !== 'object') return { ok: false, errors: [{ field: 'id', zh: '不是一个案例' }] };
  if (!c.id) err('id', '缺少编号');
  if (!c.title?.zh?.trim()) err('title', '请填中文标题');
  for (const [slot, id] of Object.entries(c.materials || {})) {
    if (!MAT_BY_ID[id]) err('materials', '有不认识的材质');
    else if (!fits(id, slot)) err('materials', '有材质放在了不合适的表面');
  }
  // 溪岸板材：认得的板放不上那个表面（例如织系列放在柜体上）= 错；还不认得的只是提醒（caseWarnings）
  for (const [slot, id] of Object.entries(c.boards || {})) {
    if (!BOARD_SLOTS.includes(slot) || !isBoardId(id)) err('boards', '有不认识的板号');
    else if (MAT_BY_ID[id]?.board && !fits(id, slot)) err('boards', '有溪岸板材放在了不合适的表面');
  }
  if (forLive) {
    if (!c.title?.en?.trim()) err('title', '请填英文标题');
    if (!c.images?.length) err('images', '至少要一张照片');
    else if (!c.images.some((im) => im.cover)) err('images', '请选一张封面');
    if (!c.rooms?.length) err('rooms', '请选这个家做了哪些房间');
    if (!PROPERTY_BY_ID[c.property?.type]) err('property', '请选房子类型');
    const m = c.materials || {};
    if (!(m.floor && m.walls && m.cabinetry) && !DREAMER_BY_CODE[c.style?.dreamers?.[0]]) err('materials', '请至少选地板、墙面、柜体，或者选一张主牌');
    if (c.kind === 'project' && !c.consent) err('consent', '要先有业主同意，才能给客人看');
    if (c.kind === 'showroom') err('kind', '展厅照片只给员工看，不能上架');
  }
  return { ok: !errors.length, errors };
}

// ───────────────────────── 风格「点一点」 ─────────────────────────

/** chips: { temp:'a'|'mid'|'b', density, texture, storage, light, curve, social } → { axes, hidden } */
export function styleFromChips(chips = {}) {
  const v = (k) => CHIP_VALUE[chips[k]] ?? 50;
  return { axes: Object.fromEntries(AX.map((k) => [k, v(k)])), hidden: Object.fromEntries(HID.map((k) => [k, v(k)])) };
}

/** 反过来：已有的数字 → 三个档（≥ 65 = a，≤ 35 = b） */
export function chipsFromStyle(style = {}) {
  const pick = (x) => (x == null ? 'mid' : x >= 65 ? 'a' : x <= 35 ? 'b' : 'mid');
  const out = {};
  for (const k of AX) out[k] = pick(style.axes?.[k]);
  for (const k of HID) out[k] = pick(style.hidden?.[k]);
  return out;
}

/** 看起来最像哪几张牌：按四条轴的距离排（每张牌的中心 = 字母那一侧 80 / 另一侧 20） */
export function guessDreamers(style = {}, n = 3) {
  const ax = style.axes || {};
  const center = (code) => Object.fromEntries(AXES.map((a, i) => [a.id, code[i] === a.a.k ? 80 : 20]));
  const first = codeOf(Object.fromEntries(AX.map((k) => [k, ax[k] ?? 50])));
  return DREAMERS.map((d) => {
    const c = center(d.code);
    return { code: d.code, dist: AX.reduce((s, k) => s + Math.abs((ax[k] ?? 50) - c[k]), 0) + (d.code === first ? -0.5 : 0) };
  })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, n)
    .map((x) => x.code);
}

// ───────────────────────── 色板 / 雷区 ─────────────────────────

export function casePalette(c) {
  const m = caseMaterials(c);
  return PALETTE_SLOTS.filter((s) => MAT_BY_ID[m[s]]).map((slot) => ({ slot, id: m[slot], color: MAT_BY_ID[m[slot]].color }));
}

/**
 * 「亮面高光」在照片里真的看得出来的材质：镜面一样亮（抛光石材、釉面砖 —— 粗糙度 ≤ 0.25，有清漆）。
 * 缎面烤漆柜门（粗糙度 0.3 以上）不算；台面的光泽也不算（台面本来就会反光）。
 * 员工看照片觉得整个家都很亮（钢琴烤漆之类），在编辑器里点「亮面高光」这个特征 = 一定排除。
 */
export const isHighGloss = (m) => !!m && m.cat !== 'metal' && m.rough <= 0.25 && (m.clearcoat ?? 0) >= 0.4;

/**
 * 雷区标签 + 它从哪里来：[{ tag, slot, soft }]
 *   slot：哪个表面的材质（3D 里可以帮客人换掉）；null = 员工标的特征（换不掉，只能不推荐）。
 *   soft：只是缎面烤漆 / 台面的光泽 —— 不排除这个家，3D 里照样换成哑光，卡片上说一声。
 * 只看主角表面（+ 照片里有厨房时的台面）；软装（地毯、窗帘、点缀、床品、五金、木作）3D 里会自动换掉，不算。
 */
export function caseNoGoSources(c) {
  const out = [];
  for (const f of c?.style?.features || []) out.push({ tag: f, slot: null, soft: false });
  const slots = [...HERO, ...((c?.rooms || []).includes('kitchen') ? ['countertop'] : [])];
  const boards = exactBoards(c);
  for (const s of slots) {
    // 这一面的程序化材质 + 这台设备认得的案例原板（两样的标签合在一起：R11 b —— 不改成主牌补齐的那一套）
    const seen = new Set();
    for (const m of [MAT_BY_ID[c?.materials?.[s]], MAT_BY_ID[boards[s]]]) {
      if (!m) continue;
      const tags = tagsOf(m);
      if (m.tex?.pattern === 'herringbone') tags.add('herringbone');
      for (const tag of tags) {
        const soft = tag === 'glossy' && (s === 'countertop' || !isHighGloss(m));
        const key = `${tag}|${soft}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ tag, slot: s, soft });
      }
    }
  }
  return out;
}

/** 这个案例「看得见」的雷区标签（一定会排除的那些）：主角表面的色系 / 质感 + 员工标的特征 */
export function caseNoGo(c) {
  return new Set(caseNoGoSources(c).filter((x) => !x.soft).map((x) => x.tag));
}

/** 「这个家的{0}我会帮你换掉」里的表面名字（客人的话，不是 SLOTS 里的大写英文） */
const SWAP_NAME = {
  floor: { zh: '地板', en: 'floor' },
  walls: { zh: '墙面', en: 'walls' },
  feature: { zh: '主题墙', en: 'feature wall' },
  cabinetry: { zh: '柜体', en: 'cabinets' },
  countertop: { zh: '台面', en: 'worktop' },
  upholstery: { zh: '沙发布', en: 'sofa fabric' },
};
const swapSlotsVar = (slots) => {
  const names = slots.map((s) => SWAP_NAME[s]).filter(Boolean);
  const en = names.map((x) => x.en);
  return { zh: names.map((x) => x.zh).join('、'), en: en.length > 1 ? `${en.slice(0, -1).join(', ')} and ${en[en.length - 1]}` : en[0] || '' };
};
const swapReason = (slots) => ({ kind: 'swap', key: '这个家的{0}我会帮你换掉', vars: [swapSlotsVar(slots)] });

// ───────────────────────── 客人自己选的图 → 材质 ─────────────────────────

const optionsOfPair = (pair) => {
  if (!pair) return [];
  if (typeof FLOW.optionsOf === 'function') {
    try {
      const o = FLOW.optionsOf(pair);
      if (Array.isArray(o) && o.length) return o;
    } catch {
      /* 题库还是旧版 */
    }
  }
  if (Array.isArray(pair.options)) return pair.options;
  return ['a', 'b', 'c', 'd', 'e', 'f'].filter((v) => pair[v]).map((v) => ({ v, ...pair[v] }));
};
const matsOf = (opt) => (Array.isArray(opt?.mats) && opt.mats.length ? opt.mats : opt?.visual?.kind === 'swatches' ? opt.visual.ids || [] : []).filter((id) => MAT_BY_ID[id]);

/** 材质 id → 客人选的那张图的中文标签（第一张用到它的） */
function pickIndex(profile) {
  const out = new Map();
  const pairs = profile?.answers?.pairs || {};
  for (const pair of FLOW.PAIRS || []) {
    const ans = pairs[pair.id];
    if (!ans?.pick) continue;
    const opt = optionsOfPair(pair).find((o) => o.v === ans.pick);
    for (const id of matsOf(opt)) if (!out.has(id)) out.set(id, opt.label || '');
  }
  return out;
}

/** 客人在直觉题里选的图用到了哪些材质（还没做完 / 旧版题库也不会出错） */
export function picksMaterials(profile) {
  try {
    return new Set(pickIndex(profile).keys());
  } catch {
    return new Set();
  }
}

// ───────────────────────── 配对 ─────────────────────────

export const WEIGHTS = { style: 1, hidden: 0.35, card: 0.18, cardNear: 0.08, wish: 0.05, propClass: 0.1, propType: 0.04, size: 0.05, scope: 0.1, pick: 0.04, real: 0.05, swap: 0.03 };
const simOf = (a = {}, b = {}, keys) => 1 - keys.reduce((s, k) => s + Math.abs((a[k] ?? 50) - (b[k] ?? 50)), 0) / (100 * keys.length);
const caseSim = (a, b) => 0.7 * simOf(a.style?.axes, b.style?.axes, AX) + 0.3 * (a.style?.dreamers?.[0] && a.style.dreamers[0] === b.style?.dreamers?.[0] ? 1 : 0);

function scoreOne(p, c, picksMats) {
  const W = WEIGHTS;
  const parts = [];
  const add = (kind, v) => {
    if (v) parts.push({ kind, v: Math.round(v * 1000) / 1000 });
  };
  add('style', W.style * simOf(p.axes, c.style?.axes, AX));
  add('hidden', W.hidden * simOf(p.hidden, c.style?.hidden, HID));
  const ds = c.style?.dreamers || [];
  if (ds[0] && ds[0] === p.code) add('card', W.card);
  else if (ds.includes(p.code)) add('card', W.cardNear);
  const wishes = (p.wishes || []).filter((w) => (c.style?.wishes || []).includes(w));
  add('wish', W.wish * Math.min(3, wishes.length));
  const h = p.home || {};
  const cp = c.property || {};
  if (h.type) {
    if (CLASS[h.type] && CLASS[h.type] === CLASS[cp.type]) add('prop', W.propClass);
    if (h.type === cp.type) add('prop', W.propType);
    if (h.sizeSqft > 0 && cp.sizeSqft > 0) add('size', W.size * Math.max(0, 1 - Math.abs(Math.log(h.sizeSqft / cp.sizeSqft)) / Math.log(2)));
  }
  if (h.scope?.length) {
    const want = h.scope.includes('whole') ? ['living', 'kitchen', 'master'] : h.scope;
    add('scope', W.scope * (want.filter((r) => (c.rooms || []).includes(r)).length / want.length));
  }
  // 案例原板的近似材质（near）也算：客人在直觉题里选的是程序化材质
  const nears = Object.values(exactBoards(c)).map((id) => MAT_BY_ID[id].board.near);
  const hit = [...new Set([...Object.values(c.materials || {}), ...nears].filter((id) => picksMats.has(id)))];
  add('pick', W.pick * Math.min(3, hit.length));
  if (c.kind === 'project') add('real', W.real);
  return { score: parts.reduce((s, x) => s + x.v, 0), parts, wishes, pickHits: hit };
}

/**
 * 理由候选（只用客人看得到的事实），按「最能说明为什么」排好；matchCases 再挑出每张卡最多 3 条，
 * 而且同一批卡片的第一条（卡片上看得到的那条）不重复。key = 中文模板（也是 i18n key）
 */
function reasonsOf(p, c, m, picks) {
  const out = [];
  const d = DREAMER_BY_CODE[p.code];
  const ds = c.style?.dreamers || [];
  if (d && ds[0] === p.code) out.push({ kind: 'card', key: '和你的牌一样：{0}', vars: [{ zh: d.zh, en: d.en }] });
  // 你选的图：最多两条，而且是两张不同的图（第一条被别的卡片用掉时，还有第二张可以说）
  const labels = new Set();
  const exact = exactBoards(c);
  const boardSlot = (id) => BOARD_SLOTS.find((s) => exact[s] && (c.materials?.[s] === id || MAT_BY_ID[exact[s]].board.near === id));
  for (const id of m.pickHits) {
    const label = picks.get(id);
    const bs = boardSlot(id);
    if (!label || labels.has(label) || (!bs && !HERO.some((s) => c.materials?.[s] === id))) continue;
    const mat = MAT_BY_ID[id];
    // 这一面是案例原板：说出那块板（客人看的名字 boardGuestNames：序号 + 名字，没有厂家编号）；
    // 板没有客人看的名字（只有编号）→ 和没有原板一样，说客人选的那个材质（= 这块板的近似材质 near，或者这一面的程序化材质）
    const gn = bs ? boardGuestNames(exact[bs], { series: false }) : null;
    if (gn && (gn.zh || gn.en)) out.push({ kind: 'pick', key: '你选了「{0}」—— 这个家用的就是溪岸 {1}', vars: [label, gn] });
    else out.push({ kind: 'pick', key: '你选了「{0}」—— 这个家也是{1}', vars: [label, { zh: mat.zh, en: mat.en.toLowerCase() }] });
    labels.add(label);
    if (labels.size >= 2) break;
  }
  let wishN = 0;
  for (const w of m.wishes) {
    const note = c.wishNotes?.[w];
    const wish = (FLOW.WISHES || []).find((x) => x.v === w);
    if (note?.zh && wish) {
      out.push({ kind: 'wish', key: '{0}：{1}', vars: [wish.label, note] });
      if (++wishN >= 2) break;
    }
  }
  const h = p.home || {};
  const cp = c.property || {};
  const type = PROPERTY_BY_ID[cp.type];
  if (h.type && h.type === cp.type && h.bedrooms && h.bedrooms === cp.bedrooms && type && cp.type !== 'other') out.push({ kind: 'prop', key: '同样是 {0} 房{1}', vars: [cp.bedrooms, { zh: type.zh, en: type.en.toLowerCase() }] });
  if (d && ds[0] !== p.code && ds.includes(p.code)) out.push({ kind: 'near', key: '和你的牌很像：{0}', vars: [{ zh: d.zh, en: d.en }] });
  if (!out.some((x) => x.kind === 'prop') && h.type && CLASS[h.type] && CLASS[h.type] === CLASS[cp.type]) {
    out.push({ kind: 'class', key: '同样是{0}住宅', vars: [CLASS[h.type] === 'high' ? { zh: '高楼', en: 'high-rise' } : { zh: '有地', en: 'landed' }] });
  }
  if (p.axes && c.style?.axes) {
    const pole = (s) => ({ zh: s.zh, en: s.en.toLowerCase() });
    const two = (a, b) => ({ kind: 'style', key: '和你一样「{0}」、「{1}」', vars: [pole(a), pole(b)] });
    const shared = AXES.filter((ax) => p.axes[ax.id] != null && (p.axes[ax.id] >= 50) === ((c.style.axes[ax.id] ?? 50) >= 50)).map((ax) => (p.axes[ax.id] >= 50 ? ax.a : ax.b));
    // 明暗、线条（社交那条不说：「独处」放在卡片上不像称赞）—— 案例要明显偏一边才算
    const hid = HIDDEN_AXES.filter((ax) => ax.id !== 'social' && p.hidden?.[ax.id] != null && c.style?.hidden?.[ax.id] != null && Math.abs(c.style.hidden[ax.id] - 50) >= 10 && (p.hidden[ax.id] >= 50) === (c.style.hidden[ax.id] >= 50)).map((ax) => (p.hidden[ax.id] >= 50 ? ax.a : ax.b));
    if (shared.length >= 2) out.push(two(shared[0], shared[1]));
    // 备用的说法（第一条被同一批的别的卡片用掉时）
    if (shared.length >= 4) out.push(two(shared[2], shared[3]));
    else if (shared.length === 3) out.push(two(shared[1], shared[2]));
    if (hid.length >= 2) out.push(two(hid[0], hid[1]));
    else if (hid.length === 1 && shared.length) out.push(two(shared[shared.length - 1], hid[0]));
    else if (shared.length === 1) out.push({ kind: 'style', key: '和你一样「{0}」', vars: [pole(shared[0])] });
  }
  return out;
}

const varPlain = (v) => (v == null ? '' : typeof v === 'object' ? v.zh || v.en || '' : String(v));
/** 「同一句话」的指纹：你选的图按图（同一张图 = 同一句，不管说的是哪个材质）；其余按整句 */
const sigOf = (r) => (r.kind === 'pick' ? `pick:${varPlain(r.vars?.[0])}` : `${r.kind}:${r.key}:${(r.vars || []).map(varPlain).join('|')}`);

/**
 * 一批一起给客人看的卡片：每张最多 3 条理由；卡片上看得到的第一条，同一批里不重复
 * （例如「你选了『暖暖的傍晚』」只出现在一张卡片上，别的卡片用下一条：愿望、同样的房子、相同的取向…）。
 * 要换表面的家：被雷区挡住又放回来的（readmit）第一条就说「这个家的柜体我会帮你换掉」；只是缎面光泽的放在最后。
 */
function pickReasons(batch) {
  const usedFirst = new Set();
  return batch.map(({ cands, swap, readmit }) => {
    let list = [...cands];
    const i = list.findIndex((r) => !usedFirst.has(sigOf(r)));
    if (i > 0) list.unshift(...list.splice(i, 1));
    list = list.filter((r, k) => list.findIndex((x) => sigOf(x) === sigOf(r)) === k).slice(0, 3);
    if (list[0]) usedFirst.add(sigOf(list[0]));
    if (swap?.length) {
      const sw = swapReason(swap.map((x) => x.slot));
      list = readmit ? [sw, ...list].slice(0, 3) : [...list.slice(0, 2), sw];
    }
    return list;
  });
}

const varText = (v) => (v == null ? '' : typeof v === 'number' ? String(v) : typeof v === 'string' ? t(v) : isEn() ? v.en || v.zh || '' : v.zh || v.en || '');

/** 一条理由 → 当前语言的句子 */
export function reasonText(r) {
  if (!r?.key) return '';
  const vars = (r.vars || []).map(varText);
  if (r.kind === 'wish') return isEn() ? `${vars[0]}: ${vars[1]}` : `${vars[0]}：${vars[1]}`;
  return t(r.key, vars);
}

/**
 * 哪些案例可以给客人看（matchCases、相似的家、看全部都用这一条）：
 *   客人：只有上架的；真实项目还要有业主同意。员工预览（allowDrafts）：草稿也算，隐藏的不算。
 *   展厅照片（kind showroom）永远不配：不是客人的家。
 *   上架的真实项目 ≥ CONFIG.cases.hideConceptsAt 以后不再给 3D 风格方案（keepConcepts = 照样给）。
 */
export function guestPool(cases, { allowDrafts = false, keepConcepts = false } = {}) {
  const live = (cases || []).filter((c) => c && c.kind !== 'showroom' && (allowDrafts ? c.status !== 'hidden' : c.status === 'live' && (c.kind !== 'project' || c.consent)));
  const projects = live.filter((c) => c.kind === 'project' && c.status === 'live').length;
  const hideAt = CONFIG.cases?.hideConceptsAt ?? 8;
  return !keepConcepts && hideAt > 0 && projects >= hideAt ? live.filter((c) => c.kind === 'project') : live;
}

/**
 * 为一位客人挑案例。
 * profile：客人档案（code / axes / hidden / wishes / avoid / home / answers.pairs）。
 * cases：listCases() 的结果（草稿、隐藏的这里再挡一次，客人永远看不到 —— guestPool）。
 * → { picks: Match[], excluded: [{ id, tags }], rest: Match[] }，Match = { case, score, parts, reasons }
 */
export function matchCases(profile, cases = [], { limit = 4, picksMats, lambda = 0.3, allowDrafts = false, keepConcepts = false } = {}) {
  return rankCases(profile, guestPool(cases, { allowDrafts, keepConcepts }), { limit, picksMats, lambda });
}

/**
 * matchCases 的本体（pool0 = 已经挑好、可以给客人看的案例）。
 * readmit = false（看全部）：雷区挡掉的家不放回来，只留在 excluded 里。
 */
function rankCases(profile, pool0, { limit = 4, picksMats, lambda = 0.3, readmit = true } = {}) {
  const p = profile || {};
  const avoid = new Set(p.avoid || []);
  const pm = picksMats instanceof Set ? picksMats : picksMaterials(p);
  const picksLabel = pickIndex(p);
  const excluded = [];
  const pool = [];
  // 每个表面一条：{ slot, tags }（3D 里 avoidMaterials 会把这些表面换成最接近的安全材质）
  const bySlot = (hits) => {
    const m = new Map();
    for (const h of hits) if (h.slot) m.set(h.slot, [...new Set([...(m.get(h.slot) || []), h.tag])]);
    return [...m].map(([slot, tags]) => ({ slot, tags }));
  };
  for (const c of pool0) {
    const hits = caseNoGoSources(c).filter((x) => avoid.has(x.tag));
    const hard = hits.filter((x) => !x.soft);
    if (hard.length) {
      excluded.push({ id: c.id, tags: [...new Set(hard.map((x) => x.tag))], c, hits });
      continue;
    }
    const swap = bySlot(hits);
    const s = scoreOne(p, c, pm);
    if (swap.length) {
      s.parts.push({ kind: 'swap', v: -WEIGHTS.swap * swap.length });
      s.score -= WEIGHTS.swap * swap.length;
    }
    pool.push({ c, ...s, swap });
  }
  pool.sort((a, b) => b.score - a.score || (a.c.order ?? 0) - (b.c.order ?? 0));
  const out = [];
  // MMR：每个候选和已经挑出来的家「最像」的那个（red[i]，和 pool 一一对应）—— 每挑出一个只更新一次，
  // 看全部（limit = 全部）100 个案例也只是 n² 次比较
  const red = pool.map(() => -Infinity);
  while (out.length < limit && pool.length) {
    let bi = 0;
    let bv = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const v = pool[i].score - lambda * (out.length ? red[i] : 0);
      if (v > bv + 1e-9) {
        bv = v;
        bi = i;
      }
    }
    const m = pool.splice(bi, 1)[0];
    red.splice(bi, 1);
    out.push(m);
    for (let i = 0; i < pool.length; i++) red[i] = Math.max(red[i], caseSim(m.c, pool[i].c));
  }
  // 雷区挡掉太多、凑不满一屏：把「只是表面材质踩雷」的家放回来（3D 里换掉那几个表面），
  // 换得少的先、分数高的先；员工标的特征（开放层板、玻璃柜门…）换不掉，永远不放回来
  if (readmit && out.length < limit) {
    const back = excluded
      .filter((e) => e.hits.every((x) => x.slot))
      .map((e) => ({ e, swap: bySlot(e.hits), ...scoreOne(p, e.c, pm) }))
      .sort((a, b) => a.swap.length - b.swap.length || b.score - a.score || (a.e.c.order ?? 0) - (b.e.c.order ?? 0));
    for (const b of back.slice(0, limit - out.length)) {
      excluded.splice(excluded.indexOf(b.e), 1);
      b.parts.push({ kind: 'swap', v: -WEIGHTS.swap * b.swap.length });
      out.push({ c: b.e.c, score: b.score - WEIGHTS.swap * b.swap.length, parts: b.parts, wishes: b.wishes, pickHits: b.pickHits, swap: b.swap, readmit: true });
    }
  }
  const wrapAll = (list) => {
    const reasons = pickReasons(list.map((m) => ({ cands: reasonsOf(p, m.c, m, picksLabel), swap: m.swap, readmit: m.readmit })));
    return list.map((m, i) => ({
      case: m.c,
      score: Math.round(m.score * 1000) / 1000,
      parts: m.parts,
      reasons: reasons[i],
      ...(m.swap?.length ? { swap: m.swap } : {}),
    }));
  };
  // 「都不喜欢 → 再看看这几个」一次给 limit 个：每一批各自不重复
  const rest = [];
  for (let i = 0; i < pool.length; i += Math.max(1, limit)) rest.push(...wrapAll(pool.slice(i, i + Math.max(1, limit))));
  return { picks: wrapAll(out), excluded: excluded.map((e) => ({ id: e.id, tags: e.tags })), rest };
}

/** 客人看得懂的雷区名字（排除提示「已经帮你避开用了「{0}」的家」用） */
export function noGoLabel(tag) {
  const all = [...(FLOW.NOGO_COLORS || []), ...(FLOW.NOGO_FINISHES || [])];
  const x = all.find((o) => o.v === tag);
  return x ? t(x.label) : '';
}

// ───────────────────────── 案例展示：照片标签、每个房间我们做了什么、房子档案、相似的家、看全部 ─────────────────────────

/** { zh, en } → 现在的语言；这一种语言没写就用另一种（员工只写了中文的说明，英文客人也看得到） */
const txtNow = (o) => (isObj(o) ? L(o) || o.zh || o.en || '' : '');

/**
 * 详情的照片标签 → [{ id, n, label }]：
 *   'all'（全部）· 各个房间（ROOMS 的顺序，至少有一张才有）· 'detail'（细节，有细节特写才有）· 'plan3d'（整个家（3D），有才有，永远最后）。
 * 没标房间的照片（room ''）只在「全部」里。
 */
export function galleryTabs(c) {
  const imgs = c?.images || [];
  const count = new Map();
  let detail = 0;
  for (const im of imgs) {
    if (ROOM_BY_ID[im.room]) count.set(im.room, (count.get(im.room) || 0) + 1);
    if (im.detail) detail++;
  }
  const room = (id) => ({ id, n: count.get(id), label: roomLabel(id) });
  return [
    { id: 'all', n: imgs.length, label: t('全部') },
    ...ROOMS.filter((r) => r.id !== 'plan3d' && count.get(r.id)).map((r) => room(r.id)),
    ...(detail ? [{ id: 'detail', n: detail, label: t('细节') }] : []),
    ...(count.get('plan3d') ? [room('plan3d')] : []),
  ];
}

/**
 * 一个标签里的照片（员工排的顺序 = case.images 的顺序；返回的就是原来的图片对象）：
 *   不给 / 'all' = 全部 · 'detail' = 所有细节特写 · 房间 id = 这个房间的（含这个房间的细节特写）。
 */
export function galleryImages(c, tabId = 'all') {
  const imgs = c?.images || [];
  if (!tabId || tabId === 'all') return imgs.slice();
  if (tabId === 'detail') return imgs.filter((im) => im.detail);
  return imgs.filter((im) => im.room === tabId);
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HAN_RE = /[一-鿿]/;

/** { zh, en } → 指定的语言（不管界面现在是哪一种）。英文和 L() 一样：中文在词典里就用词典的，没有再用 en（不出「还没翻译」的提醒） */
function inLang(l, o) {
  const zh = String(o?.zh ?? '');
  const en = String(o?.en ?? '');
  if (l !== 'en') return zh || en;
  return zh && HAN_RE.test(zh) && missing(zh) == null ? tIn('en', zh) : en || zh;
}

/**
 * 客人看的板材名字，中英文各一个 → { zh, en }：这台设备认得的板 → 「7号 · 黑胡桃」；有系列、名字里又没有的 → 「织系列 · …」
 * （和详情的「还用了」一样）。这台设备不认得、板材整个关掉（CONFIG.boards.on = false）→ { zh: '', en: '' }。
 * 没有真正的名字（没有序号、没有色号、没有名字、员工也没写显示名）→ ''：显示名只剩 id，拿掉编号也只剩 id 的碎片（'sail-c'）。
 * 永远不出厂家编号（XA-TP-01、AG337 …）：员工写的显示名里万一带了，也拿掉（色号 2810 这种本来就是名字）。
 * series: false = 不加系列（「为什么适合你」那一句只说序号 + 名字）。
 */
export function boardGuestNames(id, { series = true } = {}) {
  const m = isBoardId(id) && boardsOn() ? MAT_BY_ID[id] : null;
  const b = m?.board;
  if (!b) return { zh: '', en: '' };
  const code = String(b.code || '').trim();
  const named = !!b.rec?.label?.zh || !!(b.name?.zh || b.name?.en) || (b.seq != null && b.seq !== '') || isColourCode(code);
  if (!named) return { zh: '', en: '' };
  const one = (l) => {
    let name = inLang(l, m);
    if (code && !isColourCode(code) && name.toLowerCase().includes(code.toLowerCase())) {
      name = name
        .replace(new RegExp(escRe(code), 'gi'), ' ')
        .replace(/\s*·\s*(·\s*)+/g, ' · ')
        .replace(/\s+/g, ' ')
        .replace(/^[\s·]+|[\s·]+$/g, '');
    }
    // 剩下的还是 id（或 id 的一段）：不是名字
    if (!name || name === id || /^sail-[a-z0-9-]*$/i.test(name)) return '';
    const pre = series && b.series && !name.includes(b.series) ? inLang(l, { zh: b.series, en: b.series }) : '';
    return pre ? `${pre} · ${name}` : name;
  };
  return { zh: one('zh'), en: one('en') };
}

/** boardGuestNames 现在这个语言的那一个（'' = 不给客人说这块板） */
export function boardGuestName(id) {
  return boardGuestNames(id)[isEn() ? 'en' : 'zh'];
}

/**
 * 每个房间我们做了什么 → [{ room, label, firm: [{ id, label }], boards: [{ id, name, color }], note, images, cover, derived, tab }]，
 * ROOMS 的顺序，「全屋」（ROOM_HOME）最后。
 *   员工写了 roomsMade[room] 的房间：用员工的（derived false，不推算）。
 *   没写的自动推算（derived true）：
 *     · 我们做的每一样（supplies.firm 里 SUPPLY_OFFER 的）→ SUPPLY_ROOMS 里第一个这个家做了的房间（case.rooms），没有 → 全屋；门永远全屋；
 *     · 台面：只有 offersWorktop（做了厨房橱柜 / 浴室柜，或单独写了台面）才有，和厨房橱柜 / 浴室柜同一个房间（只写了台面 → SUPPLY_ROOMS.worktop）；
 *     · 案例的柜体板（boards.cabinetry）→ 每个拿到柜子的房间（墙板、主题墙、门、台面不算柜子）；一个都没有 → 全屋；
 *     · 案例的主题墙板（boards.feature）→ 拿到墙板 / 主题墙的房间；没有 → 全屋。
 *   客人（默认）：板只列这台设备认得的（名字 = boardGuestName，没有厂家编号）；什么都没有的房间不列。
 *   员工（{ staff: true }）：不认得的板也列（name = idLabel，color = null）、每块板多一个 known；case.rooms 里的房间、全屋、
 *     员工写过的房间就算是空的也列；每行多一个 made = { firm: [id], boards: [id], note: { zh, en } }（写 roomsMade[room] 用的完整资料）。
 *   note：员工写的说明（现在的语言；只写了一种语言就用那一种）。
 *   images / cover / tab：这个房间几张照片、封面小图（这个房间的封面 / 第一张不是细节的；全屋 = 案例封面，images = 全部照片）、
 *     点这一行照片切到哪个标签（galleryTabs 的 id；这个房间没有照片 → 'all'）。
 */
export function caseRoomsMade(c, { staff = false } = {}) {
  if (!c) return [];
  const rooms = new Set(c.rooms || []);
  const own = isObj(c.roomsMade) ? c.roomsMade : {};
  const firmAll = Array.isArray(c.supplies?.firm) ? c.supplies.firm : [];
  const firmIds = [...new Set(firmAll.filter((id) => OFFER_IDS.has(id)))];
  // 自动推算：room → { firm: Set, boards: Set }（先全部算好；员工写过的房间最后用员工的）
  const auto = new Map();
  const at = (room) => {
    if (!auto.has(room)) auto.set(room, { firm: new Set(), boards: new Set() });
    return auto.get(room);
  };
  const roomOf = (id) => (SUPPLY_ROOMS[id] || []).find((r) => rooms.has(r)) || ROOM_HOME;
  const cabRooms = new Set();
  const panelRooms = new Set();
  for (const id of firmIds) {
    if (id === 'worktop') continue;
    const room = roomOf(id);
    at(room).firm.add(id);
    if (!NOT_CABINET.has(id)) cabRooms.add(room);
    if (PANEL_OFFERS.has(id)) panelRooms.add(room);
  }
  if (offersWorktop(firmAll)) {
    const next = ['kitchen', 'vanity'].filter((id) => firmIds.includes(id)).map(roomOf);
    for (const room of next.length ? next : [roomOf('worktop')]) at(room).firm.add('worktop');
  }
  const cab = c.boards?.cabinetry;
  const feat = c.boards?.feature;
  if (isBoardId(cab)) for (const room of cabRooms.size ? cabRooms : [ROOM_HOME]) at(room).boards.add(cab);
  if (isBoardId(feat)) for (const room of panelRooms.size ? panelRooms : [ROOM_HOME]) at(room).boards.add(feat);

  const imgs = c.images || [];
  const out = [];
  for (const room of MADE_ROOMS) {
    const o = isObj(own[room]) ? own[room] : null;
    const a = auto.get(room);
    const firm = [...new Set(o ? (Array.isArray(o.firm) ? o.firm : []) : a ? [...a.firm] : [])].filter((id) => OFFER_IDS.has(id)).sort((x, y) => OFFER_ORDER[x] - OFFER_ORDER[y]);
    const boardIds = [...new Set(o ? (Array.isArray(o.boards) ? o.boards : []) : a ? [...a.boards] : [])].filter(isBoardId).slice(0, 4);
    const note = o ? txt(o.note) : { zh: '', en: '' };
    const boards = [];
    for (const id of boardIds) {
      const name = boardGuestName(id);
      const known = !!MAT_BY_ID[id]?.board;
      if (name) boards.push({ id, name, color: MAT_BY_ID[id].color, ...(staff ? { known } : {}) });
      else if (staff) boards.push({ id, name: idLabel(id), color: known ? MAT_BY_ID[id].color : null, known });
    }
    const noteText = txtNow(note);
    if (!firm.length && !boards.length && !noteText && !(staff && (o || rooms.has(room) || room === ROOM_HOME))) continue;
    const home = room === ROOM_HOME;
    const mine = home ? imgs : imgs.filter((im) => im.room === room);
    const cover = home ? coverOf(c) : mine.find((im) => im.cover) || mine.find((im) => !im.detail) || mine[0] || null;
    out.push({
      room,
      label: madeRoomLabel(room),
      firm: firm.map((id) => ({ id, label: L(SUPPLY_BY_ID[id]) })),
      boards,
      note: noteText,
      images: mine.length,
      cover,
      derived: !o,
      tab: home || !mine.length ? 'all' : room,
      ...(staff ? { made: { firm, boards: boardIds, note } } : {}),
    });
  }
  return out;
}

/** 案例的地点其实就是「公寓 · 3 房 2 卫 · 约 1,100 sq ft」这种房子的一行（种子案例）→ 不当地区再说一遍 */
const PLACE_LINE_RE = /sq\s*ft|\d+\s*(房|卫|bed|bath)/i;

/**
 * 房子档案（客人看的，只有这些）→ [{ k, label, value }]：
 *   type 房子 · size 面积 · beds 几房几卫（3 房 2 卫；和蓝图 homeSummary 同一个标签）· storeys 楼层（有地的房子、两层以上才有）· scope 我们做了（整个家 / {0} 个房间）·
 *   style 风格（主牌的名字）· area 地区（case.place，不是又把房子那一行说一遍才有）。
 * 永远没有价钱、预算、时间、员工的资料。
 */
export function caseFacts(c) {
  if (!c) return [];
  const p = c.property || {};
  const out = [];
  const add = (k, label, value) => {
    if (value) out.push({ k, label, value: String(value) });
  };
  const type = PROPERTY_BY_ID[p.type];
  if (type && p.type !== 'other') add('type', t('房子'), t(type.zh));
  if (p.sizeSqft > 0) add('size', t('建筑面积'), t('约 {0} sq ft', [Math.round(p.sizeSqft).toLocaleString('en-US')]));
  if (p.bedrooms > 0) add('beds', t('几房几卫'),p.bathrooms > 0 ? t('{0} 房 {1} 卫', [p.bedrooms, p.bathrooms]) : t('{0} 房', [p.bedrooms]));
  if (type?.landed && p.storeys > 1) add('storeys', t('楼层'), t('{0} 层楼', [p.storeys]));
  const rooms = (c.rooms || []).filter((r) => ROOM_BY_ID[r] && r !== 'plan3d');
  if (c.scope !== 'rooms') add('scope', t('我们做了'), t('整个家'));
  else if (rooms.length === 1) add('scope', t('我们做了'), roomLabel(rooms[0]));
  else if (rooms.length > 1) add('scope', t('我们做了'), t('{0} 个房间', [rooms.length]));
  const d = DREAMER_BY_CODE[c.style?.dreamers?.[0]];
  if (d) add('style', t('风格'), L(d));
  const area = txtNow(c.place);
  if (area && area !== placeLine(c) && !PLACE_LINE_RE.test(area)) add('area', t('地区'), area);
  return out;
}

const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * 相似的家 → [{ case, score }]（最多 n 个）：从 guestPool(cases)（员工预览 allowDrafts）里挑，不含 c 自己、exclude 的 id、
 * 客人档案一定要避开的家（caseNoGo(x) ∩ profile.avoid）。
 * 分数：0.55 四条风格轴的相似 + 0.15 主牌一样 + 0.1 有同一张牌 + 0.1 同一类房子（高楼 / 有地；同一种类型再 + 0.05）
 *       + 0.1 做的房间（Jaccard）+ 0.02 真实项目；同分按 order。
 */
export function similarCases(c, cases, { n = 4, profile = null, exclude = [], allowDrafts = false } = {}) {
  if (!c) return [];
  const skip = new Set([c.id, ...(Array.isArray(exclude) ? exclude : []).map((x) => (isObj(x) ? x.id : x))]);
  const avoid = new Set(profile?.avoid || []);
  const ds = c.style?.dreamers || [];
  const rooms = new Set(c.rooms || []);
  const type = c.property?.type;
  const cls = CLASS[type];
  const out = [];
  for (const x of guestPool(cases, { allowDrafts })) {
    if (skip.has(x.id)) continue;
    if (avoid.size && [...caseNoGo(x)].some((tag) => avoid.has(tag))) continue;
    const xd = x.style?.dreamers || [];
    let s = 0.55 * simOf(c.style?.axes, x.style?.axes, AX);
    if (ds[0] && ds[0] === xd[0]) s += 0.15;
    if (ds.some((d) => xd.includes(d))) s += 0.1;
    if (cls && cls === CLASS[x.property?.type]) s += 0.1;
    if (type && type !== 'other' && type === x.property?.type) s += 0.05;
    const xr = new Set(x.rooms || []);
    const union = new Set([...rooms, ...xr]).size;
    if (union) s += (0.1 * [...rooms].filter((r) => xr.has(r)).length) / union;
    if (x.kind === 'project') s += 0.02;
    out.push({ case: x, score: Math.round(s * 1e6) / 1e6 });
  }
  out.sort((a, b) => b.score - a.score || (a.case.order ?? 1000) - (b.case.order ?? 1000) || String(a.case.id).localeCompare(String(b.case.id)));
  return out.slice(0, Math.max(0, n)).map((m) => ({ case: m.case, score: r3(m.score) }));
}

/** 看全部的筛选用的几样：种类 · 房子类型 · 房间（做了的 + 有照片的）· 风格（主牌） */
function browseKeys(c) {
  const rooms = new Set((c.rooms || []).filter((r) => ROOM_BY_ID[r] && r !== 'plan3d'));
  for (const im of c.images || []) if (ROOM_BY_ID[im.room] && im.room !== 'plan3d') rooms.add(im.room);
  const d = c.style?.dreamers?.[0];
  return { kind: c.kind === 'project' ? 'project' : 'concept', type: PROPERTY_BY_ID[c.property?.type] ? c.property.type : 'other', rooms, style: DREAMER_BY_CODE[d] ? d : null };
}
const KIND_FACETS = [
  { id: 'project', zh: '做过的家', en: 'Homes we made' },
  { id: 'concept', zh: '3D 方案', en: '3D schemes' },
];
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);

/**
 * 看全部（客人可以翻所有的家）→ { list: Match[], excluded: [{ id, tags }], facets, total }
 *   list：筛选以后的家，排法和 matchCases 一样（limit = 全部、MMR、理由一起给，同一页第一条理由不重复）；雷区一定要避开的家不放回来。
 *   excluded：雷区一定要避开的家（不管筛选；界面照旧说「已经帮你避开…」）。
 *   facets：{ kind: [{ id, n, label }], type: [{ id, n, label }], room: [{ id, n, label }], style: [{ code, n, label }] }
 *     —— 在没筛选、可以给客人看、没被雷区挡掉的家里数（n ≥ 1 的才有；种类 / 房子 / 房间 / 牌各按自己的表的顺序）。
 *   total：没筛选时一共几个家（= facets 数的那一批）。
 * filters = { kind: 'all' | 'project' | 'concept', type: [], room: [], style: [] }：不同组之间「而且」，同一组里「或者」；
 *   room = case.rooms 里有、或者有这个房间的照片；style = 主牌。
 * opts（和 matchCases 一样）：picksMats、lambda、allowDrafts（员工预览）、keepConcepts。
 */
export function browseCases(profile, cases, filters = {}, { picksMats, lambda = 0.3, allowDrafts = false, keepConcepts = false } = {}) {
  const p = profile || {};
  const avoid = new Set(p.avoid || []);
  const f = filters || {};
  const excluded = [];
  const ok = [];
  for (const c of guestPool(cases, { allowDrafts, keepConcepts })) {
    const tags = avoid.size ? [...new Set(caseNoGoSources(c).filter((x) => !x.soft && avoid.has(x.tag)).map((x) => x.tag))] : [];
    if (tags.length) excluded.push({ id: c.id, tags });
    else ok.push({ c, k: browseKeys(c) });
  }
  // 数一数（没筛选的那一批）
  const cnt = { kind: new Map(), type: new Map(), room: new Map(), style: new Map() };
  const bump = (m, key) => key && m.set(key, (m.get(key) || 0) + 1);
  for (const { k } of ok) {
    bump(cnt.kind, k.kind);
    bump(cnt.type, k.type);
    for (const r of k.rooms) bump(cnt.room, r);
    bump(cnt.style, k.style);
  }
  const facets = {
    kind: KIND_FACETS.filter((x) => cnt.kind.get(x.id)).map((x) => ({ id: x.id, n: cnt.kind.get(x.id), label: L(x) })),
    type: PROPERTY_TYPES.filter((x) => cnt.type.get(x.id)).map((x) => ({ id: x.id, n: cnt.type.get(x.id), label: L(x) })),
    room: ROOMS.filter((x) => cnt.room.get(x.id)).map((x) => ({ id: x.id, n: cnt.room.get(x.id), label: L(x) })),
    style: DREAMERS.filter((x) => cnt.style.get(x.code)).map((x) => ({ code: x.code, n: cnt.style.get(x.code), label: L(x) })),
  };
  const kind = f.kind === 'project' || f.kind === 'concept' ? f.kind : null;
  const types = asList(f.type);
  const rooms = asList(f.room);
  const styles = asList(f.style);
  const shown = ok
    .filter(({ k }) => (!kind || k.kind === kind) && (!types.length || types.includes(k.type)) && (!rooms.length || rooms.some((r) => k.rooms.has(r))) && (!styles.length || styles.includes(k.style)))
    .map((x) => x.c);
  const r = rankCases(p, shown, { limit: shown.length, picksMats, lambda, readmit: false });
  return { list: r.picks, excluded, facets, total: ok.length };
}

// ───────────────────────── 本机存储（IndexedDB + localStorage；Node 测试里用内存） ─────────────────────────

const DB_NAME = 'genie-cases';
const META_KEY = 'genie.cases.meta.v1';
const hasIDB = () => typeof indexedDB !== 'undefined';
const mem = { cases: new Map(), photos: new Map(), meta: null, fail: null };
let dbp = null;

function openDB() {
  if (!hasIDB()) return Promise.resolve(null);
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch {
      res(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cases')) db.createObjectStore('cases');
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => res(null);
    req.onblocked = () => res(null);
  });
  return dbp;
}

/**
 * 交易失败的原因：出错的那一个请求的错误。请求的 error 事件冒泡到交易的时候 tx.error 还是 null
 * （规范如此，iPad 的 WebKit 也一样：先发 error 事件，然后才 abort、才填 tx.error）—— 只看 tx.error 就会拿到 null。
 */
const txError = (tx, e) => tx.error || e?.target?.error || new Error('IndexedDB transaction failed');

async function idb(store, mode, fn) {
  const db = await openDB();
  if (!db) return fn(null, mem[store]);
  return new Promise((res, rej) => {
    let tx = null;
    try {
      tx = db.transaction(store, mode);
      const out = fn(tx.objectStore(store), null);
      const isReq = typeof IDBRequest !== 'undefined' && out instanceof IDBRequest;
      tx.oncomplete = () => res(isReq ? out.result : out);
      tx.onerror = (e) => rej(txError(tx, e));
      tx.onabort = (e) => rej(txError(tx, e));
    } catch (e) {
      // fn 里同步出错：已经排进这个交易的写入也不要留下来
      try {
        tx?.abort();
      } catch {
        /* 交易已经结束了 */
      }
      rej(e);
    }
  });
}

/** 写进这台设备的时候出的错（isQuotaError 用：写的时候出的 NotFound / UnknownError 多半是空间满了） */
const WRITE_ERRS = new WeakSet();
function writeError(e) {
  const err = e && typeof e === 'object' ? e : new Error(String(e ?? 'write failed'));
  WRITE_ERRS.add(err);
  return err;
}

/**
 * 是不是「这台设备的空间不够了」：QuotaExceededError；错误信息里说 quota / space；或者写案例 / 照片的时候出的
 * NotFoundError / UnknownError（iPad 的 WebKit 空间满的时候常常是这两个：SQLite 写不进去、Blob 的临时文件建不出来）。
 * 员工的案例库、整理照片都用这一条：空间不够 = 停下来说一声，不要每张照片都说「打不开」。
 */
export function isQuotaError(e) {
  if (!e || typeof e !== 'object') return false;
  if (e.name === 'QuotaExceededError') return true;
  if (/quota|\bspace\b/i.test(String(e.message || ''))) return true;
  return (e.name === 'NotFoundError' || e.name === 'UnknownError') && WRITE_ERRS.has(e);
}

/** 内存仓库（Node 测试）写一样；测试可以让它失败（_failWrites），模拟设备空间满了 */
function memSet(store, m, key, val) {
  const err = mem.fail?.(store, key);
  if (err) throw err;
  m.set(key, val);
}

/** 一起写几样：同一个 readwrite 交易（一样写不进去，整个交易都不算）；内存仓库写到一半失败也退回原样 */
function dbPutAll(store, entries) {
  return idb(store, 'readwrite', (os, m) => {
    if (os) {
      for (const [key, val] of entries) os.put(val, key);
      return undefined;
    }
    const before = entries.map(([key]) => [key, m.has(key), m.get(key)]);
    try {
      for (const [key, val] of entries) memSet(store, m, key, val);
    } catch (e) {
      for (const [key, had, old] of before) {
        if (had) m.set(key, old);
        else m.delete(key);
      }
      throw e;
    }
    return undefined;
  }).catch((e) => {
    throw writeError(e);
  });
}

const dbGet = (store, key) => idb(store, 'readonly', (os, m) => (os ? os.get(key) : m.get(key)));
const dbPut = (store, key, val) => dbPutAll(store, [[key, val]]);
const dbDel = (store, key) => idb(store, 'readwrite', (os, m) => (os ? (os.delete(key), undefined) : (m.delete(key), undefined)));
async function dbAll(store) {
  const db = await openDB();
  if (!db) return [...mem[store].entries()];
  return new Promise((res, rej) => {
    const out = [];
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) {
        out.push([cur.key, cur.value]);
        cur.continue();
      }
    };
    tx.oncomplete = () => res(out);
    tx.onerror = (e) => rej(txError(tx, e));
  });
}

function loadMeta() {
  let m = null;
  try {
    if (typeof localStorage !== 'undefined') m = JSON.parse(localStorage.getItem(META_KEY) || 'null');
  } catch {
    m = null;
  }
  if (!m && mem.meta) m = mem.meta;
  return { hidden: Array.isArray(m?.hidden) ? m.hidden : [], order: isObj(m?.order) ? m.order : {} };
}
function saveMeta(m) {
  mem.meta = m;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* 隐私模式：只留在这一页 */
  }
}

// ───────────────────────── 随网站发布的案例（manifest.json） ─────────────────────────

let bundled = null;
let bundledP = null;

/** 测试 / 脚本用：直接给一份 manifest（不读文件） */
export function useManifest(manifest) {
  bundled = (manifest?.cases || []).map(migrateCase);
  bundledP = Promise.resolve(bundled);
}

const IN_NODE = typeof window === 'undefined' && typeof process !== 'undefined' && !!process.versions?.node;

/** Node（测试 / 脚本）：直接读文件。路径和模块名故意拼出来，Vite 不会把它当成要打包的东西 */
async function readManifestInNode() {
  const fsName = ['node', 'fs'].join(':');
  const fs = await import(/* @vite-ignore */ fsName);
  const url = new URL(['..', 'cases', 'manifest.json'].join('/'), import.meta.url);
  return JSON.parse(fs.readFileSync(url, 'utf8'));
}

function loadBundled() {
  if (bundledP) return bundledP;
  // 浏览器：Vite 把 JSON 变成一个单独的小 chunk（用到案例的时候才下载）
  const load = IN_NODE ? readManifestInNode() : import('../cases/manifest.json').then((mod) => mod.default || mod);
  bundledP = load.then((m) => (bundled = (m?.cases || []).map(migrateCase))).catch(() => (bundled = []));
  return bundledP;
}

/** 测试用：fail(store, key) 返回一个错误 → 内存仓库的那一次写入抛出它（模拟设备空间满了）；不给 = 恢复正常 */
export function _failWrites(fail) {
  mem.fail = typeof fail === 'function' ? fail : null;
}

/** 测试用：清掉内存里的设备资料 */
export function _resetDevice() {
  mem.cases.clear();
  mem.photos.clear();
  mem.meta = null;
  mem.fail = null;
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(META_KEY);
  } catch {
    /* ignore */
  }
}

const NUM_ID = /^\d+$/;

/**
 * 设备上的副本盖过随网站的案例（override）时：网站后来新加的照片照样补上（排在副本的照片后面，封面不变）。
 * 副本「已经知道」的随网站照片不补 —— 员工删掉的永远不会回来：
 *   · 存的时候记下来的 copy.bundledImages（saveCase：那时候随网站那一份的照片 id）；随网站那一份后来重新发布过（rev 和记下的
 *     bundledRev 不一样，例如这台设备的案例包合回了网站）→ 一张都不补：新的照片可能就是副本里设备上的那几张，补了会重复；
 *   · 旧副本没记：副本里不是设备上的照片的 id，加上编号不超过其中最大那个的（副本有 01、03 → 01–03 都算知道）；
 *     副本里一张随网站的照片都没有（员工全删了）→ 全部算知道。
 */
function withNewBundled(copy, base) {
  const imgs = copy.images || [];
  let known;
  if (Array.isArray(copy.bundledImages)) {
    if (copy.bundledRev != null && copy.bundledRev !== base.rev) return copy;
    known = new Set(copy.bundledImages);
  } else {
    const own = imgs.filter((im) => !im.device);
    if (!own.length) return copy;
    const top = Math.max(...own.map((im) => (NUM_ID.test(im.id) ? +im.id : -Infinity)));
    known = new Set(own.map((im) => im.id));
    for (const im of base.images || []) if (NUM_ID.test(im.id) && +im.id <= top) known.add(im.id);
  }
  const have = new Set(imgs.map((im) => im.id));
  const add = (base.images || []).filter((im) => !known.has(im.id) && !have.has(im.id));
  if (!add.length) return copy;
  return { ...copy, images: [...imgs, ...add.map((im) => ({ ...clone(im), cover: false }))] };
}

/** 随网站发布的 + 这台设备上的，合在一起（rev 大的赢；盖过随网站的副本照样拿到网站新加的照片），排好序 */
async function merged() {
  const base = await loadBundled();
  let device = [];
  try {
    device = (await dbAll('cases')).map(([, v]) => migrateCase(v));
  } catch {
    device = [];
  }
  const meta = loadMeta();
  const byId = new Map();
  for (const c of base) byId.set(c.id, { ...clone(c), origin: 'bundled' });
  for (const c of device) {
    const b = byId.get(c.id);
    if (!b) byId.set(c.id, { ...c, origin: 'device' });
    else if (c.rev > b.rev) byId.set(c.id, { ...withNewBundled(c, b), origin: 'override' });
  }
  const out = [...byId.values()];
  for (const c of out) {
    if (meta.hidden.includes(c.id)) c.status = 'hidden';
    if (meta.order[c.id] != null) c.order = meta.order[c.id];
  }
  out.sort((a, b) => (a.order ?? 1000) - (b.order ?? 1000) || String(a.title?.zh).localeCompare(String(b.title?.zh)));
  return out;
}

/** 案例列表。客人：只有上架的（默认）；员工：includeDrafts / includeHidden */
export async function listCases({ includeDrafts = false, includeHidden = false } = {}) {
  const all = await merged();
  return all.filter((c) => c.status === 'live' || (includeDrafts && c.status === 'draft') || (includeHidden && c.status === 'hidden'));
}

export async function getCase(id) {
  return (await merged()).find((c) => c.id === id) || null;
}

/** 新案例的骨架（员工「＋ 新增案例」） */
export function newCase(kind = 'project') {
  const at = nowISO();
  return migrateCase({ id: `p-${Date.now().toString(36)}`, kind, v: CASE_V, rev: 0, status: 'draft', order: 1000, createdAt: at, updatedAt: at });
}

/**
 * 存一个案例到这台设备（rev + 1；比随网站发布的那份大，所以会盖过它）。
 * 随网站也有的案例：记下那一份现在的照片 id 和 rev（bundledImages / bundledRev）—— 网站以后新加的照片才认得出来（merged / withNewBundled）。
 */
export async function saveCase(c) {
  const cur = migrateCase(c);
  const prev = await getCase(cur.id);
  const base = (await loadBundled()).find((x) => x.id === cur.id);
  const rev = Math.max(cur.rev || 0, prev?.rev || 0) + 1;
  const { origin, bundledImages, bundledRev, ...rest } = { ...cur, rev, updatedAt: nowISO() };
  if (base) Object.assign(rest, { bundledImages: base.images.map((im) => im.id), bundledRev: base.rev });
  const meta = loadMeta();
  if (meta.hidden.includes(rest.id) && rest.status !== 'hidden') saveMeta({ ...meta, hidden: meta.hidden.filter((x) => x !== rest.id) });
  await dbPut('cases', rest.id, rest);
  return { ...rest, origin: prev && prev.origin !== 'device' ? 'override' : 'device' };
}

/** 删掉：设备上新增的 → 连照片一起删；随网站发布的 → 只在这台设备上隐藏 */
export async function deleteCase(id) {
  const c = await getCase(id);
  await dbDel('cases', id);
  for (const im of c?.images || []) if (im.device) for (const w of [1600, 480]) await dbDel('photos', `${id}/${im.id}/${w}`);
  const isBundled = (await loadBundled()).some((x) => x.id === id);
  if (isBundled) {
    const meta = loadMeta();
    if (!meta.hidden.includes(id)) saveMeta({ ...meta, hidden: [...meta.hidden, id] });
  }
  return true;
}

/** 排序（员工拖动）：按给的顺序写 10、20、30… */
export async function setOrder(ids = []) {
  const meta = loadMeta();
  const order = { ...meta.order };
  ids.forEach((id, i) => (order[id] = (i + 1) * 10));
  saveMeta({ ...meta, order });
}

export async function setStatus(id, status) {
  if (!STATUSES.includes(status)) throw new Error('bad status');
  const c = await getCase(id);
  if (!c) return null;
  const meta = loadMeta();
  if (status !== 'hidden' && meta.hidden.includes(id)) saveMeta({ ...meta, hidden: meta.hidden.filter((x) => x !== id) });
  return saveCase({ ...c, status });
}

// ───────────────────────── 照片 ─────────────────────────

/** 一个案例最多几张照片（员工编辑器的上限；随网站的 / 导入的案例超过了也照样显示） */
export const PHOTO_MAX = CONFIG.cases?.maxPhotos ?? 40;
/** 设备上一张照片大约占多少（1600 + 480 两张 WebP）—— 员工编辑器估算还能放几张 */
export const PHOTO_EST_BYTES = 330 * 1024;

const ABS = /^(https?:|data:|blob:|\/\/)/;
function baseURL() {
  let b = CONFIG.cases?.base ?? '/cases/';
  if (b && !b.endsWith('/')) b += '/';
  return b;
}

/** 一张图的网址：size ≤ 480 用小图，否则用 1600 大图。设备上的照片要先 resolveImages() */
export function imageURL(c, img, size = 480) {
  if (!img) return '';
  const small = size <= 480;
  if (img.device) return (small ? img.thumbUrl || img.url : img.url || img.thumbUrl) || '';
  const path = (small ? img.thumb || img.src : img.src || img.thumb) || '';
  if (!path) return '';
  return ABS.test(path) || path.startsWith('/') ? path : baseURL() + path;
}

/** 封面（没有就第一张） */
export const coverOf = (c) => c?.images?.find((im) => im.cover) || c?.images?.[0] || null;

const objURLs = new WeakMap();

/**
 * 填上 img.url / img.thumbUrl（设备上的照片 → object URL；用完记得 releaseImages）。
 * thumbsOnly：只读 480 小图（列表）；coverOnly：只读封面（卡片）—— 40 个案例 / 200 张照片也不会一次全读出来。
 */
export async function resolveImages(c, { thumbsOnly = false, coverOnly = false } = {}) {
  if (!c) return c;
  const urls = [];
  const images = [];
  const cover = coverOf(c);
  for (const im of c.images || []) {
    if (!im.device) {
      images.push({ ...im, url: imageURL(c, im, 1600), thumbUrl: imageURL(c, im, 480) });
      continue;
    }
    const out = { ...im };
    if (coverOnly && im !== cover) {
      images.push(out);
      continue;
    }
    for (const [w, key] of thumbsOnly ? [[480, 'thumbUrl']] : [[1600, 'url'], [480, 'thumbUrl']]) {
      try {
        const blob = await dbGet('photos', `${c.id}/${im.id}/${w}`);
        if (blob && typeof URL !== 'undefined' && URL.createObjectURL) {
          out[key] = URL.createObjectURL(blob);
          urls.push(out[key]);
        }
      } catch {
        /* 读不到就没有图 */
      }
    }
    images.push(out);
  }
  const res = { ...c, images };
  objURLs.set(res, urls);
  return res;
}

export function releaseImages(c) {
  const urls = c && objURLs.get(c);
  if (!urls) return;
  for (const u of urls) {
    try {
      URL.revokeObjectURL(u);
    } catch {
      /* ignore */
    }
  }
  objURLs.delete(c);
}

const NOOP = () => {};

/**
 * 只读一张图（详情 / 全屏一次读一张大图，不会把 40 张 1600 一起解出来）→ { url, release() }。
 *   设备上的照片：从 IndexedDB 读成 object URL（release() 收回；这一个尺寸没有就用另一个尺寸）；
 *   随网站的照片：imageURL()，release() 什么都不做。读不到 → url ''。
 */
export async function loadImageURL(c, img, size = 1600) {
  if (!img) return { url: '', release: NOOP };
  if (!img.device) return { url: imageURL(c, img, size), release: NOOP };
  const want = size <= 480 ? [480, 1600] : [1600, 480];
  for (const w of want) {
    try {
      const blob = await dbGet('photos', `${c?.id}/${img.id}/${w}`);
      if (!blob || typeof URL === 'undefined' || !URL.createObjectURL) continue;
      const url = URL.createObjectURL(blob);
      let done = false;
      return {
        url,
        release() {
          if (done) return;
          done = true;
          try {
            URL.revokeObjectURL(url);
          } catch {
            /* ignore */
          }
        },
      };
    } catch {
      /* 这个尺寸读不到：试另一个 */
    }
  }
  return { url: '', release: NOOP };
}

/** 这台设备存照片的空间（navigator.storage）→ { usage, quota, persisted }（字节）；不支持（Node、旧浏览器）→ null */
export async function storageInfo() {
  try {
    const s = typeof navigator !== 'undefined' ? navigator.storage : null;
    if (!s?.estimate) return null;
    const e = await s.estimate();
    let persisted = false;
    try {
      persisted = s.persisted ? !!(await s.persisted()) : false;
    } catch {
      persisted = false;
    }
    return { usage: Number(e?.usage) || 0, quota: Number(e?.quota) || 0, persisted };
  } catch {
    return null;
  }
}

/** 请浏览器别在空间不够时清掉这台设备的照片（navigator.storage.persist）→ true = 答应了；不支持 → false */
export async function askPersist() {
  try {
    const s = typeof navigator !== 'undefined' ? navigator.storage : null;
    if (!s?.persist) return false;
    return !!(await s.persist());
  } catch {
    return false;
  }
}

/** 浏览器里压缩：长边 / 宽不超过 max，WebP（Safari 不支持编码 WebP 时用 JPEG）。重新画一次 = EXIF / GPS 都没了 */
export async function compressImage(src, { maxW = 1600, maxH = 1600, q = 0.82 } = {}) {
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') throw new Error('no canvas');
  let bmp;
  if (typeof createImageBitmap === 'function') {
    try {
      bmp = await createImageBitmap(src, { imageOrientation: 'from-image' });
    } catch {
      bmp = null;
    }
  }
  if (!bmp) {
    const url = URL.createObjectURL(src);
    try {
      bmp = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('decode'));
        im.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  const W0 = bmp.width || bmp.naturalWidth;
  const H0 = bmp.height || bmp.naturalHeight;
  const k = Math.min(1, maxW / W0, maxH / H0);
  const w = Math.max(1, Math.round(W0 * k));
  const h = Math.max(1, Math.round(H0 * k));
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const enc = (type, qq) => new Promise((res) => cv.toBlob((b) => res(b), type, qq));
  let blob = await enc('image/webp', q);
  if (!blob || blob.type !== 'image/webp') blob = await enc('image/jpeg', 0.86);
  cv.width = cv.height = 0;
  if (!blob) throw new Error('encode');
  return { blob, w, h };
}

/**
 * 给案例加一张照片（员工编辑器）：压缩成 1600 + 480，存进这台设备。
 * 返回 image 条目（还没写进案例：调用的人把它放进 c.images 再 saveCase）。
 * blobs：已经压好的 { 1600: Blob, 480: Blob, w, h }（导入案例包 / 测试用）。
 * 存不进去 → 抛出写的那个错误（空间不够用 isQuotaError 认）。
 */
export async function putImage(caseId, file, { room = ROOM_UNKNOWN, id, blobs, kind = 'photo', detail = false, caption } = {}) {
  let big = blobs?.[1600];
  let small = blobs?.[480];
  let w = blobs?.w;
  let h = blobs?.h;
  if (!big) {
    const r = await compressImage(file, { maxW: 1600, maxH: 1600 });
    big = r.blob;
    w = r.w;
    h = r.h;
  }
  if (!small) {
    try {
      small = (await compressImage(big, { maxW: 480, maxH: 640 })).blob;
    } catch {
      small = big;
    }
  }
  const imgId = id || `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  // 大图、小图同一个交易：小图写不进去（多半是空间满了）大图也不留下（不会有一张没有案例指着、永远清不掉的照片）
  await dbPutAll('photos', [
    [`${caseId}/${imgId}/1600`, big],
    [`${caseId}/${imgId}/480`, small],
  ]);
  return { id: imgId, room: ROOM_BY_ID[room] ? room : ROOM_UNKNOWN, kind: room === 'plan3d' ? 'plan3d' : kind, w: w || 1600, h: h || 1200, src: '', thumb: '', alt: { zh: '', en: '' }, cover: false, device: true, caption: txt(caption), detail: !!detail };
}

/** 删掉设备上的一张照片（编辑器里移除） */
export async function dropImage(caseId, imgId) {
  for (const w of [1600, 480]) await dbDel('photos', `${caseId}/${imgId}/${w}`);
}

// ───────────────────────── 案例包：导出 / 导入 ─────────────────────────

export const PACK_KIND = 'wish-cases';

/** WISH-cases-20261018.json */
export function packFileName(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `WISH-cases-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
}

async function blobToDataURL(blob) {
  if (typeof FileReader !== 'undefined') {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
  }
  const buf = Buffer.from(await blob.arrayBuffer());
  return `data:${blob.type || 'application/octet-stream'};base64,${buf.toString('base64')}`;
}
async function dataURLToBlob(url) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(url || '');
  if (!m) throw new Error('bad data url');
  if (typeof atob === 'function') {
    const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] || 'application/octet-stream' });
  }
  return new Blob([Buffer.from(m[3], 'base64')], { type: m[1] });
}

/** 导出（员工）：ids 不给 = 全部（含草稿、隐藏）。设备上的照片内嵌（1600 WebP），网站上的照片只留网址 */
export async function exportPack(ids) {
  const all = await merged();
  const list = ids?.length ? all.filter((c) => ids.includes(c.id)) : all;
  const photos = {};
  const cases = [];
  for (const c of list) {
    const { origin, ...rest } = c;
    cases.push(rest);
    for (const im of c.images || []) {
      if (!im.device) continue;
      try {
        const blob = await dbGet('photos', `${c.id}/${im.id}/1600`);
        if (blob) photos[`${c.id}/${im.id}`] = await blobToDataURL(blob);
      } catch {
        /* 这张照片读不到：只导出文字 */
      }
    }
  }
  const pack = { kind: PACK_KIND, v: CASE_V, exportedAt: nowISO(), cases, photos };
  return new Blob([JSON.stringify(pack)], { type: 'application/json' });
}

/** 导入案例包：按 id + rev 合并（rev 大的赢），重新生成 480 小图 → { added, updated, skipped, errors } */
export async function importPack(file) {
  const res = { added: 0, updated: 0, skipped: 0, errors: [] };
  let pack;
  try {
    pack = JSON.parse(typeof file === 'string' ? file : await file.text());
  } catch {
    res.errors.push({ id: null, zh: '这个文件打不开' });
    return res;
  }
  if (pack?.kind !== PACK_KIND || !Array.isArray(pack.cases)) {
    res.errors.push({ id: null, zh: '这不是案例包' });
    return res;
  }
  const current = new Map((await merged()).map((c) => [c.id, c]));
  for (const raw of pack.cases) {
    if (!raw?.id) {
      res.errors.push({ id: null, zh: '有一个案例没有编号' });
      continue;
    }
    const c = migrateCase(raw);
    const prev = current.get(c.id);
    if (prev && c.rev <= prev.rev) {
      res.skipped++;
      continue;
    }
    for (const im of c.images) {
      if (!im.device) continue;
      const url = pack.photos?.[`${c.id}/${im.id}`];
      if (!url) {
        im.device = false;
        continue;
      }
      try {
        const big = await dataURLToBlob(url);
        let small = big;
        try {
          small = (await compressImage(big, { maxW: 480, maxH: 640 })).blob;
        } catch {
          /* Node / 没有 canvas：小图先用大图 */
        }
        await putImage(c.id, null, { id: im.id, room: im.room, kind: im.kind, blobs: { 1600: big, 480: small, w: im.w, h: im.h } });
      } catch (e) {
        // 设备满了：说清楚、停下来（后面的照片一样存不进去）；别的错只是这一张读不出来
        if (isQuotaError(e)) {
          res.errors.push({ id: c.id, zh: '这台设备的空间不够了：后面的照片没有存进去' });
          return res;
        }
        res.errors.push({ id: c.id, zh: '有一张照片读不出来' });
      }
    }
    c.images = c.images.filter((im) => im.device || im.src);
    await dbPut('cases', c.id, c);
    if (prev) res.updated++;
    else res.added++;
  }
  return res;
}
