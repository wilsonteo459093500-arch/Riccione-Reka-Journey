// 体检 2026-11-19 问题 10：报价单 / Excel 逐行加起来和小计、总价差 RM 1–2（每行先四舍五入再加）
// 现在：逐行加起来 = 小计，小计加起来 = 总额；钱（小计 / 总额）一分不变。
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { splitRounded, zoneSubtotals, zoneExact } from '../src/components/quote/shownMoney.js';
import { newCabinet, updateSpec } from '../src/planner/templates.js';
import { computeRecordQuote } from '../src/planner/bridge.js';
import { computeLoose, discountChainRate } from '../src/constants/pricing.js';
import { excelWorkbook } from '../src/components/quote/exportExcel.js';

const sum = (a) => a.reduce((x, y) => x + y, 0);

test('splitRounded: rows are rounded, then nudged RM 1 at a time so they add up to the target', () => {
  assert.deepEqual(splitRounded([10.4, 20.4, 30.4], 61), [10, 20, 31]);  // 61.2 → 61：舍掉的一样多 → 金额最大的那行 +1
  assert.deepEqual(splitRounded([10.6, 20.6, 30.6], 62), [11, 21, 30]);  // 61.8 → 62：三行都进位成 63 → 金额最大的 −1
  assert.deepEqual(splitRounded([10.45, 20.3, 30.1], 61), [11, 20, 30]); // 被舍掉最多的先加
  assert.deepEqual(splitRounded([1.5, 2.5, 3.5], 8), [2, 3, 3]);         // 各自进位成 9 → 金额最大的 −1
  assert.deepEqual(splitRounded([100, 200], 300), [100, 200]);           // 本来就对：不动
  assert.deepEqual(splitRounded([], 0), []);
  const z = splitRounded([0, 0.4, 0.4, 0.4], 1);
  assert.equal(z[0], 0); assert.equal(sum(z), 1);                        // 0 元的行不动
});

test('splitRounded: every row stays within RM 1 of its exact amount; a real gap is never hidden', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let k = 0; k < 500; k++) {
    const v = Array.from({ length: 1 + Math.floor(rnd() * 12) }, () => Math.round(rnd() * 900000) / 100);
    const target = Math.round(sum(v));
    const out = splitRounded(v, target);
    assert.equal(sum(out), target);
    out.forEach((x, i) => { assert.ok(Number.isInteger(x)); assert.ok(Math.abs(x - v[i]) < 1, `${x} vs ${v[i]}`); });
  }
  // 差 RM 1,445（真的漏了东西，不是四舍五入）→ 不硬凑，照旧各自四舍五入
  assert.deepEqual(splitRounded([1000.4, 2000.4], 4446), [1000, 2000]);
});

// 一份有零头的报价：衣柜 1.45 / 2.33 m、L 型厨房带岩板、电视柜 3.17 m
const record = (adjustPct = 0) => {
  const w = newCabinet('wardrobe', { ceilingH: 2700 });
  const kitchen = updateSpec(newCabinet('kitchen', { code: 'K3' }), { shape: 'L', walls: [{ len: 2880 }, { len: 2000 }], tall: { on: true, kind: 'oven' }, stone: true });
  const tv = updateSpec(newCabinet('tv', { ceilingH: 2700, code: 'K4' }), { W: 3170, sides: { on: true, which: 'both' }, upper: { on: true } });
  return {
    id: 'r1', adjustPct, discountMode: 'pct', discountAmt: 0, defaults: { door: 'A', carcass: 'A' },
    zones: [
      { id: 'z1', name: 'Master Bedroom 主卧', items: [], cabinets: [{ ...updateSpec(w, { W: 1450 }), id: 'c1', code: 'K1' }, { ...updateSpec(w, { W: 2330 }), id: 'c2', code: 'K2' }] },
      { id: 'z2', name: 'Dry Kitchen 干厨', items: [{ id: 'o1', type: 'other', name: 'Sink 水槽', desc: 'Sink', qty: 1, uom: 'pc', unitMyr: 1234.5 }], cabinets: [kitchen] },
      { id: 'z3', name: 'Living Room 客厅', items: [], cabinets: [tv] },
    ],
  };
};
const meta = { name: 'T', location: 'L', date: '2026-11-19' };
const sheetRows = async (q, loose, notes, sheet = 'Quotation') => {
  const XLSX = await import('xlsx');
  return XLSX.utils.sheet_to_json(excelWorkbook(XLSX, meta, q, loose, notes, 'en').wb.Sheets[sheet], { header: 1, defval: '' });
};
// → { zones:[{ rows:[金额…], sub }], totals:{ 标签: 金额 } }
const parse = (rows) => {
  const zones = []; const totals = {}; let cur = [];
  rows.forEach((r) => {
    if (typeof r[1] === 'number' && typeof r[4] === 'number') cur.push(r[4]);
    else if (r[3] === 'Sub-Total') { zones.push({ rows: cur, sub: r[4] }); cur = []; }
    else if (typeof r[4] === 'number') totals[String(r[3]).split(' (')[0].split(' ·')[0]] = r[4];
  });
  return { zones, totals };
};

test('Excel retail: rows add up to each room sub-total, sub-totals add up to the total; the money itself is unchanged', async () => {
  for (const pct of [0, 7]) {
    const q = computeRecordQuote(record(pct));
    const { zones, totals } = parse(await sheetRows(q, null, {}));
    assert.equal(zones.length, 3);
    zones.forEach((z, i) => {
      assert.equal(sum(z.rows), z.sub, `room ${i + 1}: rows ${sum(z.rows)} vs sub-total ${z.sub}`);
      assert.equal(z.sub, q.zoneResults[i].subtotal); // 小计 = 算出来的小计（没动）
    });
    assert.equal(sum(zones.map((z) => z.sub)), q.gross);
    assert.equal(totals.Gross, q.gross);
    assert.equal(totals.Total, q.net);
    if (pct) assert.equal(totals.Gross + totals.Discount, totals.Total);
  }
  // 这份报价以前真的对不上：各自四舍五入的话，三个房间里有两个差 RM 1–2
  const q = computeRecordQuote(record());
  const naive = q.zoneResults.map((zr) => sum(zr.items.flatMap((ir) => ir.lines.map((ln) => Math.round(ln.total)))) - zr.subtotal);
  assert.ok(naive.some((d) => d !== 0), `naive rounding gaps ${naive}`);
});

test('Excel designer (two prices) and designer NET: rows = sub-total, sub-totals = the total printed', async () => {
  const q = computeRecordQuote(record(7)); // 给零售客户的折扣不影响设计师版
  for (const disc of ['30+10', '30', '25+5', '40']) {
    const rate = discountChainRate(disc);
    const dual = parse(await sheetRows(q, null, { audience: 'designer', designerDisc: disc }));
    dual.zones.forEach((z) => assert.equal(sum(z.rows), z.sub));
    assert.equal(sum(dual.zones.map((z) => z.sub)), dual.totals['Retail Total']);
    assert.equal(dual.totals['Retail Total'], q.gross);
    const net = parse(await sheetRows(q, null, { audience: 'designer_net', designerDisc: disc }));
    const supply = Math.round((q.gross - q.excluded) * rate) + Math.round(q.excluded); // 设计师总额的算法没变
    assert.equal(net.totals['Designer Total'], supply, disc);
    assert.equal(dual.totals['Designer Supply'], supply, disc);
    net.zones.forEach((z, i) => {
      assert.equal(sum(z.rows), z.sub, `${disc} room ${i + 1}`);
      assert.ok(Math.abs(z.sub - zoneExact(q.zoneResults[i], rate)) < 1.5, `${disc} room ${i + 1} sub-total`);
    });
    assert.equal(sum(net.zones.map((z) => z.sub)), supply, disc);
  }
  // 「30」这一档以前小计加起来比设计师总额少 RM 1
  const rate = discountChainRate('30');
  const naive = sum(q.zoneResults.map((zr) => Math.round(zoneExact(zr, rate))));
  assert.notEqual(naive, Math.round((q.gross - q.excluded) * rate) + Math.round(q.excluded));
  assert.equal(sum(zoneSubtotals(q.zoneResults, rate, naive + 1)), naive + 1);
});

test('Excel loose furniture: NET rows add up to the designer total; retail rows add up to the gross', async () => {
  const loose = computeLoose([
    { id: 'l1', type: 'Sofa', model: 'S1', color: 'grey', qty: 1, unitMyr: 3335 },
    { id: 'l2', type: 'Chair', model: 'C1', color: 'oak', qty: 3, unitMyr: 445 },
    { id: 'l3', type: 'Table', model: 'T1', color: 'oak', qty: 1, unitMyr: 2225 },
  ], 5);
  const q = computeRecordQuote(record());
  const amounts = (rows) => rows.filter((r) => typeof r[3] === 'number' && typeof r[5] === 'number').map((r) => r[5]);
  const total = (rows, label) => rows.find((r) => String(r[4]).startsWith(label))[5];
  const retail = await sheetRows(q, loose, {}, 'Loose Furniture');
  assert.equal(sum(amounts(retail)), loose.gross);
  assert.equal(total(retail, 'Total'), loose.net);
  for (const disc of ['30+10', '30', '25+5']) {
    const net = await sheetRows(q, loose, { audience: 'designer_net', designerDisc: disc }, 'Loose Furniture');
    assert.equal(sum(amounts(net)), Math.round(loose.gross * discountChainRate(disc)), disc);
    assert.equal(sum(amounts(net)), total(net, 'Designer Total'), disc);
  }
});
