// 厨房 L / U 转角：每面墙各量到墙角（转角两面都算）—— 墙短到实物 runW = 0（高柜占满 / 短回头墙）也照算，价钱连续不跳。
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { computeItem } from '../src/constants/pricing.js';
import { newCabinet, updateSpec } from '../src/planner/templates.js';
import { cabinetTotal, cabinetItemsFor, frameQuantities } from '../src/planner/bridge.js';
import { wallRuns } from '../src/planner/kitchen.js';
import { validateCabinet } from '../src/planner/validate.js';

const closeTo = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} ≠ ${b}`);
const kit = (shape, lens, tall = { on: false }, extra = {}) =>
  updateSpec(newCabinet('kitchen'), { shape, walls: lens.map((len) => ({ len })), tall: { ...tall }, ...extra });
const old = (cabType, length, h, d, extra = {}) => computeItem({ type: 'cabinet', cabType, length: String(length), h, d, doorSeries: 'A', carcassSeries: 'A', ...extra }).total;
// 某面墙地柜 / 吊柜的计价长度（mm）= 实物宽 + 转角照算
const priced = (c, wall, kind) => c.frames.filter((f) => f.wall === wall && f.kind === kind).reduce((a, f) => a + frameQuantities(f).q.closed, 0);
const wallWarn = (c) => validateCabinet(c).filter((m) => /doesn't fit/.test(m.msg.en));
const OVEN = { on: true, end: 'end', kind: 'oven', W: 600 };

test('L 3000/1200 + oven tower at the end of wall B: wall B still prices its corner (base 3+0.6, top 3+0.6, tower) = old tool', () => {
  const c = kit('L', [3000, 1200], OVEN);
  const r = wallRuns(c.spec)[1];
  assert.deepEqual([r.runW, r.cornerW, r.overflow], [0, 600, 0]);
  const b1 = c.frames.find((f) => f.id.endsWith('-w1-base'));
  assert.ok(b1, 'corner-only base frame is built');
  assert.deepEqual([b1.W, b1.cornerW, b1.ends], [0, 600, { left: false, right: false }]);
  const u1 = c.frames.find((f) => f.id.endsWith('-w1-upper'));
  assert.deepEqual([u1.W, u1.cornerW], [250, 350]); // 吊柜实物 250（让给墙A吊柜 350），转角 350 照算
  assert.equal(priced(c, 1, 'base'), 600);
  assert.equal(priced(c, 1, 'wall'), 600);
  // 同旧工具：地柜 3+0.6 延米、吊柜 3+0.6 延米、烤箱高柜 0.6×2.25（2 抽）+ 见光板（墙A 起点 + 高柜终点）
  // 第二版加：高柜内侧见光板 = 深 0.6 × 高 2.25 − 地柜挡住 0.6 × (0.85 + 台面 0.03) − 吊柜挡住 0.35 × 0.75
  const inner = 0.6 * 2.25 - 0.6 * 0.88 - 0.35 * 0.75;
  const panels = (0.6 * 0.85 + 0.35 * 0.75 + 0.6 * 2.25 + inner) * 530;
  const expect = old('base', '3+0.6', 0.85, 0.6) + old('wall', '3+0.6', 0.75, 0.35) + old('tall', '0.6', 2.25, 0.6, { drawers: 2 }) + panels;
  const c2 = updateSpec(c, { walls: c.spec.walls.map((w, i) => ({ ...w, units: w.units.map(() => ({ layout: i === 0 ? 'doors' : w.units[0].layout })) })) });
  closeTo(cabinetTotal(c2), expect);
  assert.equal(wallWarn(c).length, 0); // 刚好放得下：不提醒
});

test('price is continuous: return wall 1200 vs 1210 differs by 10 mm of base + top, not ~RM 1,965', () => {
  for (const kind of ['oven', 'fridgeTop', 'fridgeGap']) {
    const a = cabinetTotal(kit('L', [3000, 1200], { ...OVEN, kind }));
    const b = cabinetTotal(kit('L', [3000, 1210], { ...OVEN, kind }));
    closeTo(b - a, 0.01 * (old('base', 1, 0.85, 0.6) + old('wall', 1, 0.75, 0.35)), 1e-6);
  }
});

test('sweep wall B 600 → 2400 (step 10) with a tower: priced base = top = max(0, B − tower), every step the same small change', () => {
  const step = 0.01 * (old('base', 1, 0.85, 0.6) + old('wall', 1, 0.75, 0.35));
  for (const W of [600, 900]) {
    let prev = null;
    for (let B = 600; B <= 2400; B += 10) {
      const c = kit('L', [3000, B], { ...OVEN, W });
      const want = Math.max(0, B - W);
      assert.equal(priced(c, 1, 'base'), want, `base B=${B} tower ${W}`);
      assert.equal(priced(c, 1, 'wall'), want, `top B=${B} tower ${W}`);
      assert.ok(c.frames.every((f) => Number.isFinite(f.x) && f.W >= 0 && (f.cornerW || 0) >= 0));
      const t = cabinetTotal(c);
      if (prev != null) closeTo(t - prev, B - 10 >= W ? step : 0, 1e-6);
      prev = t;
    }
  }
});

test('U 3000/2400/600: wall C (short return) prices its 600 corner + top; 610 adds 10 mm plus the now-exposed end panel', () => {
  const a = kit('U', [3000, 2400, 600]);
  const b = kit('U', [3000, 2400, 610]);
  assert.equal(priced(a, 2, 'base'), 600);
  assert.equal(priced(a, 2, 'wall'), 600);
  assert.equal(priced(b, 2, 'base'), 610);
  assert.equal(priced(b, 2, 'wall'), 610);
  // C = 600：宽 0 的地柜没有露出的侧面（前端就是墙A转角柜的门面）→ 不加见光板；吊柜 250 实物前端露出 → 有
  const c2 = a.frames.find((f) => f.id.endsWith('-w2-base'));
  assert.deepEqual([c2.W, c2.cornerW, c2.ends], [0, 600, { left: false, right: false }]);
  const panelsA = cabinetItemsFor(a).filter((i) => i.type === 'panel' && i.kira.frameId.endsWith('-w2-base'));
  assert.equal(panelsA.length, 0);
  const sidePanel = 0.6 * 0.85 * 530;
  closeTo(cabinetTotal(b) - cabinetTotal(a), 0.01 * (old('base', 1, 0.85, 0.6) + old('wall', 1, 0.75, 0.35)) + sidePanel, 1e-6);
});

test('corner-only base never prices the unit chosen before (no Blum drawers on a 0 mm run)', () => {
  let c = kit('L', [3000, 2400], OVEN);
  c = updateSpec(c, { walls: c.spec.walls.map((w, i) => (i === 1 ? { ...w, units: w.units.map(() => ({ layout: 'drawers' })) } : w)) });
  assert.ok(cabinetItemsFor(c).some((i) => i.kira.frameId.endsWith('-w1-base') && i.drawers > 0));
  c = updateSpec(c, { walls: c.spec.walls.map((w, i) => (i === 1 ? { ...w, len: 1200 } : w)) });
  const items = cabinetItemsFor(c).filter((i) => i.kira.frameId.endsWith('-w1-base'));
  assert.equal(items.length, 1);
  assert.equal(items[0].drawers, '');
  closeTo(items[0].length, 0.6);
});

test('tall unit + corner wider than the wall: priced only up to the tower (no jump) and a warning names the wall', () => {
  const c = kit('L', [3000, 1180], OVEN);
  const r = wallRuns(c.spec)[1];
  assert.deepEqual([r.runW, r.cornerW, r.overflow], [0, 580, 20]);
  assert.equal(priced(c, 1, 'base'), 580);
  assert.equal(priced(c, 1, 'wall'), 580);
  const w = wallWarn(c);
  assert.equal(w.length, 1);
  assert.match(w[0].msg.en, /Wall B: tall unit 600 \+ corner 600 = 1200 mm doesn't fit on the wall \(1180 mm\)/);
  assert.match(w[0].msg.zh, /墙B：高柜 600 \+ 转角 600 = 1200，比墙长 1180 还长/);
  // 塔占满整面墙：墙B 地柜 / 吊柜都不算（价钱 = 墙长 − 高柜 = 0），照样提醒
  const full = kit('L', [3000, 600], OVEN);
  assert.equal(full.frames.filter((f) => f.wall === 1 && f.kind !== 'tall').length, 0);
  assert.equal(wallWarn(full).length, 1);
  // U：塔在墙C 前端（start），同样规则
  const u = kit('U', [3000, 2400, 1100], { ...OVEN, end: 'start' });
  assert.equal(priced(u, 2, 'base'), 500);
  assert.equal(priced(u, 2, 'wall'), 500);
  assert.match(wallWarn(u)[0].msg.en, /^Wall C:/);
  // 一字型：塔比墙还宽
  assert.match(wallWarn(kit('I', [600], { ...OVEN, W: 900 }))[0].msg.en, /^tall unit 900 = 900 mm doesn't fit on the wall \(600 mm\)/);
  // 正常厨房不提醒
  for (const k of [kit('L', [3000, 2400], OVEN), kit('U', [3000, 2400, 2400]), kit('galley', [3000, 3000]), kit('I', [3000], OVEN)]) assert.equal(wallWarn(k).length, 0);
});

test('golden: normal L / U kitchens unchanged (each wall to the corner; corner on both walls)', () => {
  const L = kit('L', [3000, 2400], { on: false }, {});
  const r = wallRuns(L.spec);
  assert.deepEqual(r.map((x) => [x.runW, x.cornerW]), [[3000, 0], [1800, 600]]);
  assert.equal(priced(L, 1, 'base'), 2400);
  assert.equal(priced(L, 1, 'wall'), 2400);
  const U = kit('U', [3000, 2400, 2000]);
  assert.deepEqual(wallRuns(U.spec).map((x) => [x.runW, x.cornerW]), [[3000, 0], [1800, 600], [1400, 600]]);
  assert.equal(priced(U, 2, 'base'), 2000);
  assert.equal(priced(U, 2, 'wall'), 2000);
});

test('v2: tall unit inner side panel — exposed area above the worktop / beside the top cabinets; toggle off; none for a bare fridge gap', () => {
  const c = kit('I', [3000], OVEN);
  const t = c.frames.find((f) => f.kind === 'tall');
  assert.deepEqual(t.innerPanel, { side: 'left', area: Math.round(600 * 2250 - 600 * 880 - 350 * 750) });
  const pin = (x) => cabinetItemsFor(x).filter((i) => i.kira.part === 'panelIn');
  assert.equal(pin(c).length, 1);
  closeTo(pin(c)[0].length * pin(c)[0].h, 0.5595);
  assert.equal(pin({ ...c, exposed: { ...c.exposed, tallInner: false } }).length, 0);
  assert.equal(pin(kit('I', [3000], { ...OVEN, kind: 'fridgeGap' })).length, 0);
  // 没有吊柜：台面以上整段露出
  const noUp = updateSpec(c, { walls: [{ ...c.spec.walls[0], upper: false }] });
  closeTo(pin(noUp)[0].length * pin(noUp)[0].h, 0.6 * (2.25 - 0.88));
});
