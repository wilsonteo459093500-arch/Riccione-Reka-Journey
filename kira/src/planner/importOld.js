// ============================================================
// 旧报价工具 → KIRA
//   importOldRecord：把旧工具的一份报价（只读读来的）复制成 KIRA 记录（新 id；旧的绝不改）
//   oldItemToCabinet：把旧工具的一行柜体明细换成 KIRA 积木柜（对价用）
//   parityReport：旧柜子行 → 积木柜重算，逐项和旧工具价钱比对（差异必须为 0）
// ============================================================
import { computeItem, computeQuote, parseLength } from '../constants/pricing.js';
import { leaf, vsplit, uid } from './model.js';
import { frameItems, deriveZones } from './bridge.js';

const nowTs = () => Date.now();

export function importOldRecord(old, { ownerId = null, newId = () => uid('rec') } = {}) {
  const id = newId();
  const rec = structuredClone(old);
  delete rec._updatedAt;
  rec.id = id;
  rec.groupId = id;
  rec.app = 'kira';
  rec.schema = 1;
  rec.ownerId = ownerId;
  rec.defaults = rec.defaults || { door: 'A', carcass: 'A' };
  rec.meta = { phone: '', ...(rec.meta || {}) };
  rec.zones = (rec.zones || []).map((z) => ({ cabinets: [], ceilingH: null, ...z, items: z.items || [] }));
  rec.importedFrom = { id: old.id, groupId: old.groupId || old.id, version: old.meta?.version || '1', at: nowTs() };
  rec.createdAt = nowTs();
  rec.updatedAt = nowTs();
  return rec;
}

// 旧工具柜体明细 → KIRA 积木柜（一个柜体）。表达不了的（只有柜体 / 系数乘柜体 / 门+开放混在一行）回传 null。
export function oldItemToCabinet(item) {
  if (item?.type !== 'cabinet') return null;
  const L = parseLength(item.length);
  const H = Number(item.h) || 0;
  const D = Number(item.d) || 0;
  if (!(L > 0 && H > 0)) return null;
  const hasDoor = item.hasDoor !== false;
  const hasCarcass = item.hasCarcass !== false;
  const hasOpen = !!item.hasOpen;
  const coef = Number(item.coef) > 0 ? Number(item.coef) : 1;
  const target = item.coefTarget === 'carcass' ? 'carcass' : item.coefTarget === 'both' ? 'both' : 'door';
  const full = Math.max(0, Math.round(Number(item.drawers) || 0));
  const half = Math.max(0, Math.round(Number(item.drawersHalf) || 0));
  let type;
  if (hasDoor && hasCarcass && !hasOpen) type = coef !== 1 ? 'glass' : 'closed';
  else if (!hasDoor && !hasCarcass && hasOpen) type = 'open';
  else return null;
  if (type === 'glass' && target !== 'door') return null; // 系数乘柜体 / 两者：积木柜表达不了
  if (type === 'open' && (full || half)) return null;
  const W = Math.round(L * 1e6) / 1e3; // mm（可带小数，保证和旧工具一样长）
  let body;
  if (full && half) body = vsplit([W / 2, W / 2], [leaf('drawer', { drawers: full, drawerKind: 'full' }), leaf('drawer', { drawers: half, drawerKind: 'half' })]);
  else if (full || half) body = leaf('drawer', { drawers: full || half, drawerKind: full ? 'full' : 'half' });
  else body = leaf(type);
  if (type === 'glass' && (full || half)) return null;
  const cab = {
    id: `conv-${item.id}`, code: 'K?', template: 'converted', name: item.name || '',
    series: { door: item.doorSeries || 'A', carcass: item.carcassSeries || 'A', open: item.openSeries || 'A' },
    exposed: { left: false, right: false }, glassCoef: coef,
    frames: [{ id: 'f0', kind: H < 1 ? 'base' : 'tall', label: item.name || '', wall: 0, x: 0, y: 0,
      W, H: Math.round(H * 1e6) / 1e3, D: Math.round(D * 1e6) / 1e3, base: { kind: 'none', h: 0 }, ends: { left: false, right: false }, body }],
  };
  return cab;
}

const r2 = (n) => Math.round(n * 100) / 100;

// 对一批旧报价做对价：① 原样导入后总价（必须等于旧工具）② 每一行柜体换成积木柜后的价钱（必须等于旧那一行）
export function parityReport(oldRecords = []) {
  const rows = [];
  let itemsChecked = 0, itemsSame = 0, itemsSkipped = 0, recordsSame = 0;
  oldRecords.forEach((old) => {
    const oldQ = computeQuote(old.zones || [], old.adjustPct, old.discountMode, old.discountAmt);
    const imp = importOldRecord(old, { newId: () => 'tmp' });
    const newQ = computeQuote(deriveZones(imp.zones, imp.defaults), imp.adjustPct, imp.discountMode, imp.discountAmt);
    const recSame = r2(oldQ.net) === r2(newQ.net) && r2(oldQ.gross) === r2(newQ.gross);
    if (recSame) recordsSame += 1;
    const diffs = [];
    (old.zones || []).forEach((z) => (z.items || []).forEach((it) => {
      if (it.type !== 'cabinet') return;
      const cab = oldItemToCabinet(it);
      if (!cab) { itemsSkipped += 1; return; }
      itemsChecked += 1;
      const oldT = computeItem(it).total;
      const newT = frameItems(cab, cab.frames[0]).reduce((a, x) => a + computeItem(x).total, 0);
      if (Math.abs(oldT - newT) < 0.005) itemsSame += 1;
      else diffs.push({ zone: z.name, item: it.name || it.cabType, length: it.length, old: r2(oldT), kira: r2(newT) });
    }));
    rows.push({ id: old.id, name: old.meta?.name || '', version: old.meta?.version || '1', oldNet: oldQ.net, kiraNet: newQ.net, same: recSame && !diffs.length, diffs });
  });
  return {
    rows, records: oldRecords.length, recordsSame, itemsChecked, itemsSame, itemsSkipped,
    pass: oldRecords.length > 0 && recordsSame === oldRecords.length && itemsSame === itemsChecked,
  };
}
