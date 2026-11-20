// 楼高提醒（用户 2026-11-20 选方案 2）：补填 / 改了楼高 → 列出还是旧高度的柜子 + 多多少钱，按了才做到顶
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { newCabinet, updateSpec } from '../src/planner/templates.js';
import { setPlanSize } from '../src/planner/plan.js';
import { cabinetTotal } from '../src/planner/bridge.js';
import { staleCeiling, fitZoneToCeiling, keepCeiling, ceilingChange } from '../src/planner/ceiling.js';

const cab = (t, code, opts = {}, patch = null) => { let c = { ...newCabinet(t, opts), code }; if (patch) c = updateSpec(c, patch); return c; };
// AI 开的新房间：楼高没填，柜子按 2.70 m
const room = (cabinets, extra = {}) => ({ id: 'z1', name: 'Master Bedroom 主卧', items: [], cabinets, ceilingH: null, ...extra });
const withCeiling = (z, h) => ({ ...z, ...ceilingChange(z, h) });

test('ceiling reminder: no ceiling yet → nothing; fill in 3.00 m → lists the 2.70 m cabinets and the extra money', () => {
  const w = { ...setPlanSize(newCabinet('wardrobe', {}), { W: 1450 }).cab, code: 'K1' };
  const z0 = room([w, cab('kitchen', 'K2')]);
  assert.deepEqual(staleCeiling(z0), { items: [], delta: 0 });
  const z = withCeiling(z0, 3000);
  const st = staleCeiling(z);
  assert.deepEqual(st.items.map((x) => [x.cab.code, x.fromH]), [['K1', 2700]]); // 厨房不跟楼高
  assert.equal(st.delta, 891); // 体检报告那个衣柜：RM 8,020.35 → RM 8,911.50
  // 价钱没有自己变：没按之前，柜子还是 2.70
  assert.equal(z.cabinets[0].spec.H, 2700);
  // 按「全部做到顶」→ 和直接在 3.00 m 的房间手动加的一样
  const fitted = fitZoneToCeiling(z);
  const byHand = setPlanSize(newCabinet('wardrobe', { ceilingH: 3000 }), { W: 1450 }).cab;
  assert.equal(fitted.cabinets[0].spec.H, 3000);
  assert.equal(cabinetTotal(fitted.cabinets[0]), cabinetTotal(byHand));
  assert.equal(fitted.cabinets[1], z.cabinets[1]); // 厨房原封不动
  assert.equal(fitted.cabinets[0].id, w.id);
  assert.equal(fitted.cabinets[0].code, 'K1');
  assert.deepEqual(staleCeiling(fitted).items, []); // 做完就不再提醒
});

test('ceiling reminder: shoe / blank tall / TV side towers / desk tower count; a TV cabinet without towers does not', () => {
  const z = withCeiling(room([
    cab('shoe', 'K1'), cab('blank', 'K2'), cab('tv', 'K3'), cab('tv', 'K4', {}, { sides: { on: true, which: 'both' } }),
    cab('desk', 'K5'), cab('desk', 'K6', {}, { tower: { which: 'left' } }), cab('island', 'K7'),
  ]), 3000);
  const st = staleCeiling(z);
  assert.deepEqual(st.items.map((x) => x.cab.code), ['K1', 'K2', 'K4', 'K6']);
  assert.ok(st.delta > 0);
  const f = fitZoneToCeiling(z);
  assert.equal(f.cabinets[0].spec.H, 3000);
  assert.equal(f.cabinets[3].spec.sides.H, 3000);
  assert.equal(f.cabinets[5].spec.tower.H, 3000);
  assert.equal(Math.round(f.cabinets.reduce((a, c) => a + cabinetTotal(c), 0) - z.cabinets.reduce((a, c) => a + cabinetTotal(c), 0)), st.delta);
});

test('ceiling reminder: a lower ceiling (2.40 m) shrinks them and shows the saving; heights the salesperson set are left alone', () => {
  const tall = cab('wardrobe', 'K1');
  const low = cab('wardrobe', 'K2', {}, { H: 2200 }); // 业务自己改成 2.20（例：上面有梁）
  const z = withCeiling(room([tall, low]), 2400);
  const st = staleCeiling(z);
  assert.deepEqual(st.items.map((x) => x.cab.code), ['K1']);
  assert.ok(st.delta < 0);
  assert.equal(fitZoneToCeiling(z).cabinets[1].spec.H, 2200);
});

test('ceiling reminder: changing the ceiling again (3.00 → 3.20) catches cabinets already fitted to 3.00 and the ones still at 2.70', () => {
  let z = withCeiling(room([cab('wardrobe', 'K1')]), 3000);
  z = fitZoneToCeiling(z);
  z = { ...z, cabinets: [...z.cabinets, cab('shoe', 'K2')] }; // 后来又加了一个 2.70 的
  z = withCeiling(z, 3200);
  assert.equal(z.ceilingPrev, 3000);
  const st = staleCeiling(z);
  assert.deepEqual(st.items.map((x) => [x.cab.code, x.fromH]), [['K1', 3000], ['K2', 2700]]);
  const f = fitZoneToCeiling(z);
  assert.deepEqual(f.cabinets.map((c) => c.spec.H), [3200, 3200]);
  // 改回 2.70：3.20 的那两个要缩回去
  const back = withCeiling(f, 2700);
  assert.deepEqual(staleCeiling(back).items.map((x) => [x.cab.code, x.fromH]), [['K1', 3200], ['K2', 3200]]);
});

test('ceiling reminder: "Keep" hides it for this ceiling only; a new ceiling asks again; blur without change keeps the memory', () => {
  let z = withCeiling(room([cab('wardrobe', 'K1')]), 3000);
  z = { ...z, ...keepCeiling(z) };
  assert.equal(z.ceilingAck, 3000);
  assert.deepEqual(staleCeiling(z).items, []);
  assert.equal(z.cabinets[0].spec.H, 2700); // 不用 = 不改
  assert.deepEqual(ceilingChange(z, 3000), { ceilingH: 3000 }); // 同一个数（只是点进去又离开）：不动上一次的记录
  z = withCeiling(z, 3100);
  assert.equal(staleCeiling(z).items.length, 1);
  // 楼高清空 → 不提醒
  assert.deepEqual(staleCeiling(withCeiling(z, null)).items, []);
});

test('ceiling reminder: hand-drawn blocks in the cabinet are kept when it is fitted to the ceiling', () => {
  const c = cab('wardrobe', 'K1');
  const f0 = c.frames[0];
  const drawn = { ...c, custom: true, frames: [{ ...f0, body: { ...f0.body, sizes: f0.body.sizes ? f0.body.sizes.map((v, i) => (i === 0 ? v + 50 : v - (i === 1 ? 50 : 0))) : f0.body.sizes } }, ...c.frames.slice(1)] };
  const f = fitZoneToCeiling(withCeiling(room([drawn]), 3000)).cabinets[0];
  assert.equal(f.spec.H, 3000);
  assert.equal(f.frames[0].H, 3000);
  if (f0.body.sizes) assert.equal(f.frames[0].body.sizes[0] - f.frames[0].body.sizes[1], drawn.frames[0].body.sizes[0] - drawn.frames[0].body.sizes[1]); // 手拖过的分隔线留着
});
