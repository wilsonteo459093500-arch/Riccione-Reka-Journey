// 导出用的家具目录：谁做的（定制柜 = 我们做）、在 DXF 的哪一层、3D 的哪一组、名义尺寸、图块 / 组件的名字。
//
// CATEGORY 是唯一的一张「谁做」表：以后 guest-journey v2 的「我们做」报价标签只要换掉这一张。
// 业主在这个对话里确认过：餐桌和换鞋凳不是我们做的（「不是我们做的」）→ 成品家具。
// 业主最新的决定：活动家具在 3D / 平面里只是「家具示意」（通用的样子，不是公司的产品，也不写产品名）；
// 公司做的只有定制柜、墙板（电视墙、主题墙）和门 —— 定制柜在 A-CASE 图层，门在 A-DOOR。
// 还没确认的（README「待确认」里列出来）：浴室柜、神台、餐边柜、梳妆台、玩具柜算定制柜；床头柜算成品家具。

import { CATALOG } from '../engine/furniture.js';
import { SLOT_BY_ID } from '../../shared/materials.js';
import { bi } from './names.js';

export const CATEGORY = {
  case: ['kitchenRun', 'island', 'tallUnit', 'wardrobe', 'shoeCabinet', 'tvWall', 'featureWall', 'bookshelf', 'displayCabinet', 'altar', 'sideboard', 'vanity', 'toyStorage', 'dresser'],
  furn: ['sofa', 'armchair', 'coffeeTable', 'sideTable', 'diningTable', 'chair', 'bench', 'bed', 'kidsBed', 'nightstand', 'desk', 'lounger', 'petBed'],
  soft: ['rug', 'curtains', 'pendant', 'floorLamp', 'plant', 'art'],
  fix: ['fridge', 'washer', 'toilet', 'shower'],
};

/** 还要业主确认的分类（README 里列出来） */
export const UNCERTAIN = { case: ['vanity', 'altar', 'sideboard', 'dresser', 'toyStorage'], furn: ['nightstand'] };

const CAT_BY_KIND = Object.fromEntries(Object.entries(CATEGORY).flatMap(([c, kinds]) => kinds.map((k) => [k, c])));
export const catOf = (kind) => CAT_BY_KIND[kind] || null;

/** 每一类：DXF 图层、3D 组名、属性里写的分类、是不是我们做的 */
export const CAT_INFO = {
  case: { layer: 'A-CASE', group: '定制柜（我们做）', label: '定制柜 我们做', ours: true },
  furn: { layer: 'A-FURN', group: '家具示意', label: '家具示意 不是我们做', ours: false },
  soft: { layer: 'A-FURN-SOFT', group: '软装灯具', label: '软装灯具窗帘 不是我们做', ours: false },
  fix: { layer: 'A-EQPM', group: '洁具电器', label: '洁具电器 不是我们做', ours: false },
  door: { layer: 'A-DOOR', group: '门窗', label: '门 我们做', ours: true },
};

export const catGroup = (cat) => bi(CAT_INFO[cat].group);

/**
 * 外购：我们配、但向别的厂家采购的表面（业主 2026-10-19：台面跟着我们的柜子走，没有 sAil 板材编号）。
 * 这些表面的部件还在 A-CASE 图层、3D 的「定制柜」组里；只是名字上写明「外购」。表面 id → 标签。
 */
export const SOURCED = { countertop: { zh: '台面 · 外购', en: 'Worktop (sourced)', tag: '外购' } };

/**
 * sAil 板材编号（以后填：材质 id → 编号，例如 'white-oak': 'SA-xxxx'）。写进 3D 材质名（dae.js materialName）。
 * 外购的表面（台面）永远没有编号。
 */
export const BOARD_CODE = {};
export const boardCode = (slot, id) => (SOURCED[slot] ? null : BOARD_CODE[id] || null);

const tight = (s) => s.replace(/\s*·\s*/g, '·');

/** 表面名（材质表、3D 材质名用）：台面 → 「台面·外购 / Worktop (sourced)」，其他 → 词典 */
export function slotName(slot) {
  const s = SOURCED[slot];
  return s ? { zh: tight(s.zh), en: s.en } : bi(SLOT_BY_ID[slot]?.zh || slot);
}

/** 清单一行里的表面名：台面 → 「台面（外购）」 */
export function slotShort(slot) {
  const s = SOURCED[slot];
  return s ? { zh: s.zh.replace(/\s*·\s*(.+)$/, '（$1）'), en: s.en } : bi(SLOT_BY_ID[slot]?.zh || slot);
}

/** DXF 属性 MATERIALS 的一段：cabinetry=white-oak 白橡；外购的加一个词：countertop=quartz-travertine 外购 石英石·洞石纹 */
export const matTag = (m) => `${m.slot}=${m.id}${SOURCED[m.slot] ? ` ${SOURCED[m.slot].tag}` : ''} ${m.zh}`;
export const catLabel = (cat) => bi(CAT_INFO[cat].label);

/** 名义高度（m）：高柜 / 衣柜 / 书墙… 用 item.h（没有就是这一层的天花高） */
const H_FIXED = {
  sofa: 0.85, armchair: 0.845, lounger: 0.8, coffeeTable: 0.4, rug: 0.012, plant: 1.6, floorLamp: 1.54, sideTable: 0.53,
  altar: 1.95, diningTable: 0.75, chair: 0.8, sideboard: 0.78, fridge: 1.86, island: 0.9, bed: 1.16, kidsBed: 0.98,
  nightstand: 0.52, dresser: 0.82, desk: 0.74, toyStorage: 0.62, petBed: 0.2, bench: 0.48, vanity: 0.85, toilet: 0.8,
  shower: 2.05, washer: 0.85,
};
const H_ITEM = new Set(['wardrobe', 'tallUnit', 'shoeCabinet', 'bookshelf', 'displayCabinet', 'tvWall', 'featureWall', 'curtains', 'kitchenRun']);

/**
 * 名义尺寸（米）：W = item.w，D = item.d —— 圆餐桌 D = W（item.d 是含椅子的占地），马桶按 0.4 宽算；
 * H = 配方的名义高度（§4.4）。ceil = 这一层的天花高。
 */
export function nominal(item, ceil = 2.8) {
  const def = CATALOG[item.kind];
  const W = +(item.w ?? def?.size?.[0]) || 0.5;
  let D = +(item.d ?? def?.size?.[1]) || 0.5;
  if (item.kind === 'diningTable' && item.variant === 'round') D = W;
  if (item.kind === 'rug' && item.variant === 'round') D = W; // 圆地毯：直径 = w（furniture.js rug 一样）
  let H;
  if (item.kind === 'plant') H = item.variant === 'small' ? 0.57 : 1.6;
  else if (item.kind === 'armchair') H = item.variant === 'lounge' ? 0.8 : 0.845;
  else if (item.kind === 'sofa' && item.variant === 'curvy') H = 0.75;
  else if (item.kind === 'coffeeTable' && item.variant === 'stone') H = 0.35;
  else if (item.kind === 'kitchenRun' && item.upper === false) H = 0.9;
  else if (item.kind === 'pendant') H = ceil;
  else if (item.kind === 'art') H = +item.h || 0.65;
  else if (H_ITEM.has(item.kind)) H = +item.h || ceil;
  else H = H_FIXED[item.kind] ?? 0.8;
  if (item.kind === 'shoeCabinet' || item.kind === 'wardrobe' || item.kind === 'tallUnit' || item.kind === 'bookshelf' || item.kind === 'displayCabinet') H = Math.min(H, ceil);
  return { W, D, H };
}

const mmI = (v) => Math.round(v * 1000);

/** 6 位十六进制的小哈希（橱柜的水槽 / 灶 / 窗位不同 → 不同的图块） */
export function hash6(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 6).toUpperCase();
}

const VARIANT_KINDS = new Set(Object.entries(CATALOG).filter(([, d]) => d.variants).map(([k]) => k));

/** 图块 / 组件名：WISH_<KIND>_<W>x<D>x<H>[_<variant>][_s<seats>][_<hash>]（ASCII，大写的 kind） */
export function blockKey(item, n) {
  let k = `WISH_${item.kind.toUpperCase()}_${mmI(n.W)}x${mmI(n.D)}x${mmI(n.H)}`;
  if (VARIANT_KINDS.has(item.kind)) k += `_${String(item.variant || CATALOG[item.kind].variants[0]).toUpperCase()}`;
  if (item.kind === 'diningTable') k += `_S${Math.max(1, +item.seats || 0)}`;
  if (item.kind === 'kitchenRun') {
    const g = (item.gaps || []).map((x) => `${(+x.a).toFixed(3)}-${(+x.b).toFixed(3)}`).join(',');
    k += `_${hash6(`${item.sinkAt ?? item.sink ?? ''}|${item.hobAt ?? item.hob ?? ''}|${g}|${item.upper !== false}`)}`;
  }
  if (item.kind === 'pendant') k += `_D${mmI(+item.drop || 0.9)}`;
  if (item.kind === 'bookshelf' && item.key && item.key !== 'woodwork') k += `_${String(item.key).toUpperCase()}`;
  return k.replace(/[^A-Za-z0-9_]/g, '_');
}

/** 这件家具的主材质用哪个表面（属性 MATERIAL） */
export const MAIN_SLOT = {
  kitchenRun: 'cabinetry', island: 'cabinetry', tallUnit: 'cabinetry', wardrobe: 'cabinetry', shoeCabinet: 'cabinetry', tvWall: 'feature',
  featureWall: 'feature', displayCabinet: 'cabinetry', altar: 'cabinetry', sideboard: 'cabinetry', vanity: 'cabinetry', toyStorage: 'cabinetry',
  dresser: 'cabinetry', sofa: 'upholstery', armchair: 'upholstery', lounger: 'upholstery', coffeeTable: 'woodwork', sideTable: 'woodwork',
  diningTable: 'woodwork', chair: 'woodwork', bench: 'woodwork', bed: 'bedding', kidsBed: 'bedding', nightstand: 'woodwork', desk: 'woodwork',
  petBed: 'accents', rug: 'rugs', curtains: 'curtains', pendant: 'metal', floorLamp: 'metal', plant: 'fixed__leaf', art: 'woodwork',
  fridge: 'fixed__steel', washer: 'fixed__porcelain', toilet: 'fixed__porcelain', shower: 'tile',
};
