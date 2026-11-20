// 示范报价：打开就有一份做好的（衣柜 + L 型厨房 + 鞋柜），新人照着改。
import { newCabinet, updateSpec, setUnit } from './templates.js';
import { uid } from './model.js';

export function demoRecord(ownerId = null) {
  const id = uid('rec');
  const today = new Date().toISOString().slice(0, 10);
  let wardrobe = newCabinet('wardrobe', { ceilingH: 2700, code: 'K1' });
  wardrobe = setUnit(wardrobe, 1, { layout: 'drawersHang' });
  wardrobe = setUnit(wardrobe, 3, { layout: 'glass' });
  wardrobe = { ...wardrobe, name: 'Master wardrobe 主卧衣柜' };
  let kitchen = newCabinet('kitchen', { ceilingH: 2800, code: 'K2' });
  kitchen = updateSpec(kitchen, { shape: 'L', walls: [{ len: 3200, upper: true, units: [], upperUnits: [] }, { len: 2400, upper: true, units: [], upperUnits: [] }], tall: { on: true, end: 'end', kind: 'fridgeTop' } });
  kitchen = { ...kitchen, name: 'Dry kitchen 干厨' };
  const shoe = { ...newCabinet('shoe', { ceilingH: 2700, code: 'K3' }), name: 'Foyer shoe cabinet 玄关鞋柜' };
  const zone = (name, ceilingH, cabinets) => ({ id: uid('zone'), name, items: [], cabinets, ceilingH, collapsed: false });
  return {
    id, app: 'kira', schema: 1, ownerId, groupId: id, demo: true,
    meta: { name: 'Demo 示范客户', phone: '', location: 'Kuala Lumpur', ref: 'DEMO', pic: '', version: '1', outputLang: 'both', date: today },
    defaults: { door: 'A', carcass: 'A' },
    zones: [zone('Master Bedroom 主卧', 2700, [wardrobe]), zone('Dry Kitchen 干厨', 2800, [kitchen]), zone('Foyer 玄关', 2700, [shoe])],
    looseItems: [], adjustPct: 0, looseAdjustPct: 0, cabinetNote: '', looseNote: '',
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}
