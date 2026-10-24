// 公司做的 vs 只是示意 / 背景（业主 2026-10-19，OWNER-ANSWERS.md + LEAD NOTE 6 + LEAD NOTE 8）：
//   我们做 · We make this —— 只有定制柜（厨房、衣柜、电视柜、鞋柜、书柜……，柜里的灯带也算）、台面（公司从别家配来的）、墙板、门。
//   家具示意 · Furniture for illustration —— 3D 里摆的活动家具（沙发、桌椅、床……）是通用的示意，不是公司的产品，不写产品名。
//   只是背景 —— 地板、天花、灯、窗帘 / 软装、墙面油漆、瓷砖：要么是客人家里留下来的（保留你家原有），要么是中性的背景，
//   绝不标成公司要交付的东西（也没有「合作伙伴」的标签）。
// 3D 里：材质板、标签、选中家具的小条、参考案例那一排只给「我们做」的那几样加一个安静的金色记号；
// 活动家具在选中的小条上写「家具示意」；别的什么都不标。客人家里留下来的（锁住的）不是我们要做的。
// 名单是数据：业主的产品目录 / 色卡来了再改这里。

import { MAT_BY_ID } from '../shared/materials.js';
import { CATALOG } from './engine/furniture.js';

/** 公司做的表面：柜体（定制柜）、主题墙（墙板 —— 只有木 / 石的才算；刷漆的主题墙是油漆）、台面（LEAD NOTE 8：公司配台面） */
export const OFFER_SLOTS = ['cabinetry', 'feature', 'countertop'];

/** 公司做的东西（CATALOG 的 kind）：定制柜 + 墙板 */
export const OFFER_ITEMS = ['kitchenRun', 'tallUnit', 'island', 'wardrobe', 'tvWall', 'featureWall', 'shoeCabinet', 'bookshelf', 'displayCabinet', 'sideboard', 'toyStorage', 'vanity', 'altar'];

/** 活动家具：只是示意（通用的样子，不是公司的产品） */
export const ILLUSTRATION_ITEMS = ['sofa', 'armchair', 'lounger', 'coffeeTable', 'sideTable', 'diningTable', 'chair', 'bench', 'bed', 'kidsBed', 'nightstand', 'desk', 'dresser'];

/** 案例 supplies.firm 里算「我们做」的（src/shared/cases.js SUPPLY.firm 的 id）：柜子、墙板、门、收纳床（榻榻米 / 栖云 / 翻床，LEAD NOTE 8）；
 *  沙发、餐桌椅、普通的床、书桌不算。和 src/shared/home.js 的 OFFER_SUPPLY 同一份名单（test/home.test.mjs 逐个比） */
export const OFFER_SUPPLY = ['kitchen', 'wardrobe', 'walkin', 'tvWall', 'shoeCabinet', 'displayShelf', 'displayCabinet', 'bookwall', 'study', 'toyStorage', 'vanity', 'altar', 'wallPanel', 'featureWall', 'doors', 'worktop', 'bedStorage'];

const ITEM_SET = new Set(OFFER_ITEMS);
const ILLU_SET = new Set(ILLUSTRATION_ITEMS);
const SUPPLY_SET = new Set(OFFER_SUPPLY);

/**
 * 主题墙算「墙板」（我们做）的纹理：木、大理石、洞石、水磨石的板。微水泥、岩板（tex 'concrete'：抹灰 / 石材本身）和
 * 石灰墙、刷漆（cat 'paint'）一样是背景 —— 公司不做（业主 2026-10-19）。和 src/shared/home.js 的 PANEL_TEX 同一份（test/home.test.mjs 比）
 */
export const PANEL_TEX = ['wood', 'marble', 'travertine', 'terrazzo'];

/** 这个表面（现在是这种材质）是不是公司做的 */
export function isOfferSlot(slot, matId) {
  if (!OFFER_SLOTS.includes(slot)) return false;
  if (slot === 'feature') {
    const m = MAT_BY_ID[matId];
    return !!m && (m.cat === 'wood' || m.cat === 'stone') && PANEL_TEX.includes(m.tex?.type);
  }
  return true;
}

/** 这件东西是不是公司做的（定制柜、墙板） */
export const isOfferItem = (kind) => ITEM_SET.has(kind) && !!CATALOG[kind];

/**
 * 选中 / 悬停一件家具时名字旁边的那个记号：
 *   'make'    我们做（定制柜、木 / 石墙板）
 *   'kept'    保留你家原有（主材质那一面锁住了：客人家里留下来的）
 *   'console' 我们做 · 电视柜 —— 电视墙的墙面是微水泥 / 石灰墙 / 刷漆（背景，不是墙板），只有下面的电视柜是我们做的
 *   'illu'    家具示意（活动家具）
 *   null      不标（灯、绿植、地毯、家电、窗帘；墙面不是墙板的主题墙）
 * 主题墙、电视墙（CATALOG slot 'feature'）看现在的主题墙材质：和材质板、标签用同一条 isOfferSlot 规则。
 */
export function offerTagOf(kind, { materials = null, locked = null } = {}) {
  if (isOfferItem(kind)) {
    const slot = CATALOG[kind]?.slot;
    if (slot && locked?.[slot]) return 'kept';
    if (slot === 'feature' && !isOfferSlot('feature', materials?.feature)) {
      // 电视柜跟着柜体的材质；柜子是客人家里留下来的 → 那也不是我们要做的
      if (kind !== 'tvWall' || locked?.cabinetry) return null;
      return 'console';
    }
    return 'make';
  }
  if (isIllustrationItem(kind)) return 'illu';
  return null;
}

/** 这件是不是只是示意的活动家具 */
export const isIllustrationItem = (kind) => ILLU_SET.has(kind) && !!CATALOG[kind];

/** 案例里「我们做」的那几样（supplies.firm 过滤掉活动家具） */
export const offerSupply = (firmIds) => (Array.isArray(firmIds) ? firmIds.filter((id) => SUPPLY_SET.has(id)) : []);

/** 一套材质里，哪几个表面是公司做的（{ slot: true }）。客人家里留下来的（locked）不是我们要做的 */
export function offerSlots(materials, locked = null) {
  const out = {};
  for (const s of OFFER_SLOTS) if (materials?.[s] && isOfferSlot(s, materials[s]) && !locked?.[s]) out[s] = true;
  return out;
}
