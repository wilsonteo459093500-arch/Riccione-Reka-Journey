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

import { CONFIG } from './config.js';
import { t, L, isEn } from './i18n.js';
import { MAT_BY_ID, SLOTS, SLOT_BY_ID, fits } from './materials.js';
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

/** 案例的「有效材质」：员工没填的表面用主牌的材质补上（真实照片常常只标了几样） */
export function caseMaterials(c) {
  const d = DREAMER_BY_CODE[c?.style?.dreamers?.[0]];
  return { ...(d?.materials || {}), ...(c?.materials || {}) };
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
 * 任何版本的案例 → v1 的完整形状（缺的字段补默认值；v1 本身原样整理，可以重复调用）。
 * v0（早期草稿 / 手写 JSON）：title 是字符串、dreamer / dreamers / axes / hidden 放在最外层、
 * photos: [url | { src, room }]、type / size / bedrooms 放在最外层、tags = features。
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
    }));
  if (images.length && !images.some((im) => im.cover)) images[0].cover = true;
  let seenCover = false;
  for (const im of images) {
    if (im.cover && seenCover) im.cover = false;
    if (im.cover) seenCover = true;
  }
  const rooms = [...new Set((Array.isArray(r.rooms) ? r.rooms : images.map((im) => im.room)).filter((x) => ROOM_BY_ID[x] && x !== 'plan3d'))];
  const materials = {};
  for (const [slot, id] of Object.entries(isObj(r.materials) ? r.materials : {})) if (SLOT_BY_ID[slot] && MAT_BY_ID[id]) materials[slot] = id;
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
    mood: ['cozy', 'bright', 'moody'].includes(r.mood) ? r.mood : 'cozy',
    time: num(r.time, null),
    furniture,
    supplies: { firm: [...(supplies.firm || [])], context: [...(supplies.context || [])] },
    products: Array.isArray(r.products) ? r.products.filter(isObj).map((p) => ({ id: String(p.id || ''), name: txt(p.name), kind: p.kind === 'furniture' ? 'furniture' : 'cabinet', note: txt(p.note) })) : [],
    wishNotes: Object.fromEntries(Object.entries(isObj(r.wishNotes) ? r.wishNotes : {}).map(([k, v]) => [k, txt(v)])),
    images,
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
  for (const s of slots) {
    const m = MAT_BY_ID[c?.materials?.[s]];
    if (!m) continue;
    const tags = tagsOf(m);
    if (m.tex?.pattern === 'herringbone') tags.add('herringbone');
    for (const tag of tags) out.push({ tag, slot: s, soft: tag === 'glossy' && (s === 'countertop' || !isHighGloss(m)) });
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
  const hit = [...new Set(Object.values(c.materials || {}).filter((id) => picksMats.has(id)))];
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
  for (const id of m.pickHits) {
    const label = picks.get(id);
    if (!label || labels.has(label) || !HERO.some((s) => c.materials?.[s] === id)) continue;
    const mat = MAT_BY_ID[id];
    out.push({ kind: 'pick', key: '你选了「{0}」—— 这个家也是{1}', vars: [label, { zh: mat.zh, en: mat.en.toLowerCase() }] });
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
 * 为一位客人挑案例。
 * profile：客人档案（code / axes / hidden / wishes / avoid / home / answers.pairs）。
 * cases：listCases() 的结果（草稿、隐藏的这里再挡一次，客人永远看不到）。
 * → { picks: Match[], excluded: [{ id, tags }], rest: Match[] }，Match = { case, score, parts, reasons }
 */
export function matchCases(profile, cases = [], { limit = 4, picksMats, lambda = 0.3, allowDrafts = false, keepConcepts = false } = {}) {
  const p = profile || {};
  // 客人：只有上架的；真实项目还要有业主同意。员工预览（allowDrafts）：草稿也算，隐藏的不算
  // 展厅照片（kind showroom）永远不配：不是客人的家
  const live = (cases || []).filter((c) => c && c.kind !== 'showroom' && (allowDrafts ? c.status !== 'hidden' : c.status === 'live' && (c.kind !== 'project' || c.consent)));
  const projects = live.filter((c) => c.kind === 'project' && c.status === 'live').length;
  const hideAt = CONFIG.cases?.hideConceptsAt ?? 8;
  const pool0 = !keepConcepts && hideAt > 0 && projects >= hideAt ? live.filter((c) => c.kind === 'project') : live;
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
  while (out.length < limit && pool.length) {
    let bi = 0;
    let bv = -Infinity;
    pool.forEach((m, i) => {
      const red = out.length ? Math.max(...out.map((o) => caseSim(o.c, m.c))) : 0;
      const v = m.score - lambda * red;
      if (v > bv + 1e-9) {
        bv = v;
        bi = i;
      }
    });
    out.push(pool.splice(bi, 1)[0]);
  }
  // 雷区挡掉太多、凑不满一屏：把「只是表面材质踩雷」的家放回来（3D 里换掉那几个表面），
  // 换得少的先、分数高的先；员工标的特征（开放层板、玻璃柜门…）换不掉，永远不放回来
  if (out.length < limit) {
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

// ───────────────────────── 本机存储（IndexedDB + localStorage；Node 测试里用内存） ─────────────────────────

const DB_NAME = 'genie-cases';
const META_KEY = 'genie.cases.meta.v1';
const hasIDB = () => typeof indexedDB !== 'undefined';
const mem = { cases: new Map(), photos: new Map(), meta: null };
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

async function idb(store, mode, fn) {
  const db = await openDB();
  if (!db) return fn(null, mem[store]);
  return new Promise((res, rej) => {
    try {
      const tx = db.transaction(store, mode);
      const out = fn(tx.objectStore(store), null);
      const isReq = typeof IDBRequest !== 'undefined' && out instanceof IDBRequest;
      tx.oncomplete = () => res(isReq ? out.result : out);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    } catch (e) {
      rej(e);
    }
  });
}
const dbGet = (store, key) => idb(store, 'readonly', (os, m) => (os ? os.get(key) : m.get(key)));
const dbPut = (store, key, val) => idb(store, 'readwrite', (os, m) => (os ? (os.put(val, key), undefined) : (m.set(key, val), undefined)));
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
    tx.onerror = () => rej(tx.error);
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

/** 测试用：清掉内存里的设备资料 */
export function _resetDevice() {
  mem.cases.clear();
  mem.photos.clear();
  mem.meta = null;
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(META_KEY);
  } catch {
    /* ignore */
  }
}

/** 随网站发布的 + 这台设备上的，合在一起（rev 大的赢），排好序 */
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
    else if (c.rev > b.rev) byId.set(c.id, { ...c, origin: 'override' });
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

/** 存一个案例到这台设备（rev + 1；比随网站发布的那份大，所以会盖过它） */
export async function saveCase(c) {
  const cur = migrateCase(c);
  const prev = await getCase(cur.id);
  const rev = Math.max(cur.rev || 0, prev?.rev || 0) + 1;
  const { origin, ...rest } = { ...cur, rev, updatedAt: nowISO() };
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
 */
export async function putImage(caseId, file, { room = ROOM_UNKNOWN, id, blobs, kind = 'photo' } = {}) {
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
  await dbPut('photos', `${caseId}/${imgId}/1600`, big);
  await dbPut('photos', `${caseId}/${imgId}/480`, small);
  return { id: imgId, room: ROOM_BY_ID[room] ? room : ROOM_UNKNOWN, kind: room === 'plan3d' ? 'plan3d' : kind, w: w || 1600, h: h || 1200, src: '', thumb: '', alt: { zh: '', en: '' }, cover: false, device: true };
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
      } catch {
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
