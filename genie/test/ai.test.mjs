// AI 读平面图的测试（IMPORT）：sheet.js（纯函数）+ ai.js（假的 fetch、录好的回答）。沙盒里没有 Gemini key，也绝不连 Gemini。
// 跑法：node test/ai.test.mjs（npm test 会一起跑）。用例对应 DESIGN §2.11 的 1–15。
import assert from 'assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseDimText,
  levelOf,
  normalizeFound,
  cropBox,
  scaleFromDims,
  estimateScale,
  sheetScale,
  readToMetres,
  tileRooms,
  snapOpenings,
  alignFloors,
  stairsFromRooms,
  assemblePlan,
  manualPlan,
  trimChrome,
  enhance,
  pageTextScore,
  lowResReport,
  knownMetres,
  houseKind,
  roomTypeOf,
  cleanLabel,
} from '../src/studio/plan/sheet.js';
import * as AI from '../src/studio/plan/ai.js';
import { buildWalls, checkPlan, migratePlan } from '../src/studio/plan/model.js';
import { furnish } from '../src/studio/engine/furnish.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FX = path.join(ROOT, 'test/fixtures/ai');
const J = (n) => JSON.parse(fs.readFileSync(path.join(FX, n), 'utf8'));
const TRUTH = J('truth-terrace2.json');

let n = 0;
let failed = 0;
async function test(name, fn) {
  n++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${(e && e.stack) || e}`);
  }
}

// 绝不连网：任何没被 mock 的 fetch 都直接失败
globalThis.fetch = async (url) => {
  throw new Error(`un-mocked fetch: ${String(url).slice(0, 80)}`);
};

const IoU = (p, q) => {
  const ix = Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x));
  const iy = Math.max(0, Math.min(p.y + p.d, q.y + q.d) - Math.max(p.y, q.y));
  return (ix * iy) / (p.w * p.d + q.w * q.d - ix * iy);
};
const overlaps = (rooms) => {
  let k = 0;
  for (let i = 0; i < rooms.length; i++)
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.01 && Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y) > 0.01) k++;
    }
  return k;
};
const area = (rs) => rs.reduce((t, r) => t + r.w * r.d, 0);

/** 一页图纸（A3，420 × 297 mm）：第一遍收到 2048 px 宽的整页，裁图按同一个比例（最大的那块长边 3072 px） */
function sheetCrops(kind) {
  if (kind === 'sheet') {
    const PW = 2048;
    const PH = Math.round((2048 * 297) / 420);
    const found = normalizeFound(J('pass1-sheet.json'), PW, PH);
    const mmPerPx = 420 / PW;
    const mm = (c) => ({ w: (c.x1 - c.x0) * mmPerPx, h: (c.y1 - c.y0) * mmPerPx });
    const long = Math.max(...found.plans.map((p) => Math.max(mm(p.crop).w, mm(p.crop).h)));
    const pxPerMm = 3072 / long;
    return { found, pxPerMm, size: (p) => ({ w: mm(p.crop).w * pxPerMm, h: mm(p.crop).h * pxPerMm }), srcScale: 1 };
  }
  // 手机截图（1170 × 2532）：第一遍收到整张截图；裁图从原图像素裁，小于 1400 px → ×2
  const found = normalizeFound(J('pass1-phone.json'), 1170, 2532);
  return { found, pxPerMm: (1130 / 420) * 2, size: (p) => ({ w: (p.crop.x1 - p.crop.x0) * 2, h: (p.crop.y1 - p.crop.y0) * 2 }), srcScale: 2 };
}

function assembleFixture(kind, opts = {}) {
  const { found, size, srcScale } = sheetCrops(kind);
  const reads = { ground: J(`pass2-${kind}-gf.json`), first: J(`pass2-${kind}-ff.json`) };
  const floors = found.plans
    .filter((p) => p.include)
    .map((p) => {
      const s = size(p);
      return { level: p.level, title: p.title, read: reads[p.level], cropW: s.w, cropH: s.h, src: `data:image/jpeg;base64,${p.level}`, srcScale, page: 12, box: [0, 0, 1, 1] };
    });
  return { found, ...assembleWithFloors(floors, { screenshot: found.screenshot, ...opts }) };
}
const assembleWithFloors = (floors, opts) => assemblePlan(floors, opts);

function meanIoU(plan) {
  return plan.floors.map((f, i) => {
    const tf = TRUTH.floors[i];
    const ious = tf.rooms.map((r) => Math.max(0, ...f.rooms.map((g) => IoU(r, g))));
    return ious.reduce((t, v) => t + v, 0) / ious.length;
  });
}

// ───────────────────────── 1–2 文字 ─────────────────────────
console.log('尺寸字、楼层名');
await test('1 parseDimText', () => {
  const T = [
    ['3600', 3600],
    ['3,600', 3600],
    ['3600mm', 3600],
    ['3.6m', 3600],
    ['3.60', 3600],
    ["12'-6\"", 3810],
    ["12' 6\"", 3810],
    ["20'", 6096],
    ['20 ft', 6096],
    ['6100', 6100],
    ['180', null],
    ['abc', null],
    ['', null],
    [null, null],
    ['25000', 25000],
    ['99999', null],
  ];
  for (const [s, v] of T) assert.equal(parseDimText(s), v, String(s));
  // 设计师填的已知尺寸：6.1 / 6 → 米
  assert.equal(knownMetres('6.1'), 6.1);
  assert.equal(knownMetres('6'), 6);
  assert.equal(knownMetres('6100'), 6.1);
  assert.ok(Math.abs(knownMetres("20'") - 6.096) < 1e-9);
  assert.ok(Math.abs(knownMetres('20 ft') - 6.096) < 1e-9);
  assert.equal(knownMetres('abc'), null);
});
await test('2 levelOf：图名比模型的 level 可信', () => {
  assert.equal(levelOf('other', 'PELAN LANTAI ATAS'), 'first');
  assert.equal(levelOf('', 'TINGKAT BAWAH'), 'ground');
  assert.equal(levelOf('first', 'ROOF PLAN'), 'roof');
  assert.equal(levelOf('', 'GROUND FLOOR PLAN'), 'ground');
  assert.equal(levelOf('ground', 'FIRST FLOOR PLAN'), 'first');
  assert.equal(levelOf('', 'SECOND FLOOR PLAN'), 'second');
  assert.equal(levelOf('', '二楼平面图'), 'first');
  assert.equal(levelOf('second', ''), 'second');
  assert.equal(levelOf('nonsense', 'SITE PLAN'), 'other');
});

// ───────────────────────── 3 第一遍 ─────────────────────────
console.log('第一遍（找图）');
await test('3 normalizeFound：按楼层排、裁图多 3 %、在纸里面、去重、屋顶不要', () => {
  const W = 2048;
  const H = 1448;
  const p1 = J('pass1-sheet.json');
  const f = normalizeFound(p1, W, H);
  assert.deepEqual(
    f.plans.map((p) => p.level),
    ['ground', 'first'],
    'FIRST 印在左边，也排在 GROUND 后面',
  );
  for (const p of f.plans) {
    const bw = p.box.x1 - p.box.x0;
    const bh = p.box.y1 - p.box.y0;
    assert.ok(Math.abs(p.box.x0 - p.crop.x0 - bw * 0.03) < 1e-6 || p.crop.x0 === f.page.x0);
    assert.ok(Math.abs(p.crop.y1 - p.box.y1 - bh * 0.03) < 1e-6 || p.crop.y1 === f.page.y1);
    assert.ok(p.crop.x0 >= 0 && p.crop.y0 >= 0 && p.crop.x1 <= W && p.crop.y1 <= H);
    assert.equal(p.include, true);
  }
  assert.deepEqual(f.units, ['INTERMEDIATE LOT']);
  // 同一张图回了两次 + 一张屋顶平面图 + 一个坏框
  const dup = { ...p1, plans: [...p1.plans, { ...p1.plans[1], box_2d: p1.plans[1].box_2d.map((v, i) => v + (i < 2 ? 4 : -4)) }, { title: 'ROOF PLAN', level: 'first', box_2d: [100, 620, 400, 780] }, { title: 'X', level: 'ground', box_2d: [500, 500, 400, 600] }] };
  const g = normalizeFound(dup, W, H);
  assert.equal(g.plans.filter((p) => p.level === 'ground').length, 1, '重复的合并');
  assert.equal(g.plans.length, 3);
  assert.equal(g.plans.find((p) => p.level === 'roof').include, false, '屋顶默认不要');
  // 截图：page_box 去掉了手机外框，裁图不出纸
  const ph = normalizeFound(J('pass1-phone.json'), 1170, 2532);
  assert.equal(ph.screenshot, true);
  for (const p of ph.plans) assert.ok(p.crop.y0 >= ph.page.y0 - 1e-9 && p.crop.y1 <= ph.page.y1 + 1e-9);
  assert.equal(houseKind(f), 'double-storey terraced house');
  // 没有平面图 / 垃圾输入
  assert.deepEqual(normalizeFound({ plans: [] }, W, H).plans, []);
  assert.deepEqual(normalizeFound(null, W, H).plans, []);
});

// ───────────────────────── 4–5 比例 ─────────────────────────
console.log('比例');
await test('4 scaleFromDims：误差 < 1 %，读错的 180 不投票，[] → null', () => {
  const { found, pxPerMm, size } = sheetCrops('sheet');
  const gf = found.plans.find((p) => p.level === 'ground');
  const s = size(gf);
  const r = scaleFromDims(J('pass2-sheet-gf.json').dimensions, s.w, s.h);
  const truth = 1 / (10 * pxPerMm); // 1 m = 10 mm（1:100）
  assert.equal(r.source, 'dims');
  assert.ok(Math.abs(r.mPerPx / truth - 1) < 0.01, `误差 ${((r.mPerPx / truth - 1) * 100).toFixed(2)} %`);
  // 读错的「180」（其实是 1800）：不像长度（< 300 mm）→ 根本不投票
  assert.equal(parseDimText('180'), null);
  assert.equal(r.n, J('pass2-sheet-gf.json').dimensions.filter((d) => parseDimText(d.text)).length);
  assert.equal(r.n, 12);
  // 读错成另一个像样的数（1800 → 1300）：离中位数 > 6 % → 剔除
  const bad = J('pass2-sheet-gf.json').dimensions.map((d) => (d.text === '3300' ? { ...d, text: '2300' } : d));
  const rb = scaleFromDims(bad, s.w, s.h);
  assert.ok(rb.rejected.includes('2300'));
  assert.ok(Math.abs(rb.mPerPx / truth - 1) < 0.01);
  assert.equal(scaleFromDims([], 100, 100), null);
  assert.equal(scaleFromDims(null, 100, 100), null);
  // 一条横跨一半以上的总尺寸就够；一条短的不够
  assert.ok(scaleFromDims([{ text: '6100', axis: 'x', box_2d: [10, 100, 20, 900] }], 1000, 1000));
  assert.equal(scaleFromDims([{ text: '1200', axis: 'x', box_2d: [10, 100, 20, 300] }], 1000, 1000), null);
  // 两层合起来
  const ff = found.plans.find((p) => p.level === 'first');
  const s2 = size(ff);
  const pooled = sheetScale([r, scaleFromDims(J('pass2-sheet-ff.json').dimensions, s2.w, s2.h)]);
  assert.equal(pooled.source, 'dims');
  assert.ok(pooled.n > 20 && Math.abs(pooled.mPerPx / truth - 1) < 0.01);
});
await test('5 estimateScale：没有尺寸 → 门宽（4.5–8 m）；没有门 → 猜 6.1 m；绝不是 12 m', () => {
  const { found, size } = sheetCrops('phone');
  const gf = found.plans.find((p) => p.level === 'ground');
  const s = size(gf);
  const read = J('pass2-phone-gf.json');
  const e = estimateScale(read, s.w, s.h);
  assert.equal(e.source, 'doors');
  assert.ok(e.widthM > 4.5 && e.widthM < 8, `宽 ${e.widthM}`);
  const g = estimateScale({ ...read, doors: [] }, s.w, s.h);
  assert.equal(g.source, 'guess');
  assert.equal(g.widthM, 6.1);
  assert.notEqual(g.widthM, 12);
  assert.equal(estimateScale({}, 100, 100), null);
});

// ───────────────────────── 6 去重叠 / 补空隙 ─────────────────────────
console.log('去重叠、补空隙');
await test('6a 老板的那张：YARD×KITCHEN、DINING×UTILITY 重叠 → 0 重叠，面积 ±10 %', () => {
  // 本来的样子（米）
  const truth = [
    { id: 'yard', type: 'utility', x: 0, y: 0, w: 6, d: 2 },
    { id: 'kit', type: 'kitchen', x: 0, y: 2, w: 3.5, d: 3 },
    { id: 'uti', type: 'utility', x: 3.5, y: 2, w: 2.5, d: 3 },
    { id: 'din', type: 'dining', x: 0, y: 5, w: 6, d: 3.5 },
    { id: 'liv', type: 'living', x: 0, y: 8.5, w: 6, d: 5 },
  ];
  // AI 画的：YARD 往下伸 0.4 进厨房；DINING 往上伸 0.45 进 UTILITY；KITCHEN 宽了 0.3
  const ai = [
    { ...truth[0], d: 2.4 },
    { ...truth[1], w: 3.8 },
    { ...truth[2] },
    { ...truth[3], y: 4.55, d: 3.95 },
    { ...truth[4] },
  ];
  assert.ok(overlaps(ai) >= 2);
  const t = tileRooms(ai, { footprint: { x: 0, y: 0, w: 6, d: 13.5 } });
  assert.equal(overlaps(t.rooms), 0);
  assert.ok(t.report.overlaps >= 2);
  for (const r of truth) {
    const got = area(t.rooms.filter((q) => q.id === r.id || q.id.startsWith(`${r.id}-`)));
    assert.ok(Math.abs(got / (r.w * r.d) - 1) <= 0.1, `${r.id}: ${got.toFixed(2)} vs ${r.w * r.d}`);
  }
  assert.ok(Math.abs(area(t.rooms) - 6 * 13.5) < 0.05, '铺满');
  assert.equal(checkPlan({ rooms: t.rooms.map((r) => ({ ...r, name: r.id })), openings: [] }).filter((i) => i.code === 'overlap').length, 0);
});
await test('6b 浴室框画在卧室框里 → 浴室挖出来，卧室变 L（两块）', () => {
  const t = tileRooms([
    { id: 'bed', type: 'bedroom', x: 0, y: 0, w: 4, d: 4 },
    { id: 'bth', type: 'bath', x: 2.5, y: 0, w: 1.5, d: 2 },
  ]);
  const bath = t.rooms.filter((r) => r.id === 'bth');
  const bed = t.rooms.filter((r) => r.id === 'bed' || r.id.startsWith('bed-'));
  assert.equal(bath.length, 1);
  assert.equal(bath[0].w * bath[0].d, 3);
  assert.equal(bed.length, 2, 'L 形 = 两个矩形');
  assert.ok(bed.every((r) => r.type === 'bedroom'));
  assert.ok(Math.abs(area(bed) - 13) < 1e-6);
  assert.equal(overlaps(t.rooms), 0);
});
await test('6c 漏掉的玄关 → 补成走廊（gap）', () => {
  // 和样板排屋一样：客厅左边、楼梯上面、车廊下面，玄关那一条没框
  const t = tileRooms(
    [
      { id: 'din', type: 'dining', x: 0, y: 0, w: 5, d: 3 },
      { id: 'st', type: 'stair', x: 5, y: 0, w: 1, d: 4 },
      { id: 'liv', type: 'living', x: 0, y: 3, w: 5, d: 5 },
      { id: 'por', type: 'porch', x: 0, y: 8, w: 6, d: 5 },
    ],
    { footprint: { x: 0, y: 0, w: 6, d: 8 } },
  );
  const gap = t.rooms.find((r) => r.gap);
  assert.ok(gap, '有补出来的走廊');
  assert.equal(gap.type, 'corridor');
  assert.deepEqual([gap.x, gap.y, gap.w, gap.d], [5, 4, 1, 4]);
  assert.equal(t.report.filled, 1);
});
await test('6d 细条（0.15 / 0.3 m）并给邻居', () => {
  for (const gapM of [0.15, 0.3]) {
    const t = tileRooms(
      [
        { id: 'a', type: 'bedroom', x: 0, y: 0, w: 3, d: 4 },
        { id: 'b', type: 'bedroom', x: 3 + gapM, y: 0, w: 3, d: 4 },
      ],
      { footprint: { x: 0, y: 0, w: 6 + gapM, d: 4 } },
    );
    assert.equal(t.rooms.length, 2, `gap ${gapM}`);
    assert.ok(t.rooms.every((r) => r.w >= 0.35 && r.d >= 0.35));
    assert.ok(Math.abs(area(t.rooms) - (6 + gapM) * 4) < 0.25, `铺满 ${area(t.rooms)}`);
  }
  // 房间画长了 0.25 m 伸进邻居 → 切出来的小块并回去
  const t = tileRooms([
    { id: 'a', type: 'bedroom', x: 0, y: 0, w: 3, d: 4 },
    { id: 'b', type: 'bath', x: 3, y: 0, w: 2, d: 2 },
    { id: 'c', type: 'study', x: 3, y: 2, w: 2.25, d: 2 },
  ]);
  assert.equal(overlaps(t.rooms), 0);
  assert.ok(t.rooms.every((r) => Math.min(r.w, r.d) >= 0.35));
});
await test('6e L 形房子的缺口留空（不补走廊）', () => {
  const t = tileRooms(
    [
      { id: 'a', type: 'living', x: 0, y: 0, w: 10, d: 4 },
      { id: 'b', type: 'bedroom', x: 0, y: 4, w: 5, d: 4 },
    ],
    { footprint: { x: 0, y: 0, w: 10, d: 8 } },
  );
  assert.equal(t.rooms.length, 2);
  assert.ok(!t.rooms.some((r) => r.gap));
  assert.ok(Math.abs(area(t.rooms) - 60) < 1e-6, '缺口 5×4 留空');
});

// ───────────────────────── 7 门窗 ─────────────────────────
console.log('门窗');
await test('7 snapOpenings：留下来的门窗都在 buildWalls 的墙上；离墙太远的丢掉', () => {
  const rooms = [
    { id: 'a', type: 'living', name: 'A', x: 0, y: 0, w: 4, d: 4 },
    { id: 'b', type: 'bedroom', name: 'B', x: 4, y: 0, w: 3, d: 4 },
  ];
  const openings = [
    { id: 'd1', kind: 'door', x1: 3.8, x2: 4.2, y1: 1, y2: 1.9 }, // 竖的门，离墙 0
    { id: 'd2', kind: 'door', x1: 4.2, x2: 4.2, y1: 2.2, y2: 3.1 }, // 偏了 0.2
    { id: 'w1', kind: 'window', x1: 1, x2: 2.5, y1: -0.15, y2: -0.15 }, // 外墙外面 0.15
    { id: 'x', kind: 'door', x1: 2, x2: 2.9, y1: 2, y2: 2 }, // 房间中间：没有墙 → 丢
  ];
  const so = snapOpenings(rooms, openings);
  assert.equal(so.dropped, 1);
  const walls = buildWalls({ rooms, openings: so.openings });
  for (const o of so.openings) assert.ok(walls.some((w) => w.pieces.some((p) => p.openingId === o.id)), `${o.id} 不在墙上`);
  // 端到端的两层也一样
  const { plan } = assembleFixture('sheet');
  for (const f of plan.floors) {
    const ws = buildWalls(f);
    for (const o of f.openings) assert.ok(ws.some((w) => w.pieces.some((p) => p.openingId === o.id)), `${f.id} ${o.id}`);
  }
});

// ───────────────────────── 8 对齐 ─────────────────────────
console.log('对齐楼层');
await test('8 alignFloors：二楼偏 (+0.37, −0.12) → 按楼梯找回（< 5 cm）；没楼梯 → 按外墙，分户墙对齐', () => {
  const gf = TRUTH.floors[0];
  const ff = TRUTH.floors[1];
  const moved = { rooms: ff.rooms.map((r) => ({ ...r, x: r.x - 0.37, y: r.y + 0.12 })) };
  const a = alignFloors(gf, moved);
  assert.equal(a.by, 'stairs');
  assert.ok(Math.abs(a.dx - 0.37) < 0.05 && Math.abs(a.dy + 0.12) < 0.05, JSON.stringify(a));
  const noStairs = (f) => ({ rooms: f.rooms.filter((r) => r.type !== 'stair') });
  const b = alignFloors(noStairs(gf), noStairs(moved));
  assert.equal(b.by, 'walls');
  const x0 = Math.min(...moved.rooms.map((r) => r.x)) + b.dx;
  const x1 = Math.max(...moved.rooms.map((r) => r.x + r.w)) + b.dx;
  assert.ok(Math.abs(x0 - 0) < 1e-6 && Math.abs(x1 - 6.1) < 1e-6, `分户墙 ${x0} … ${x1}`);
  // 楼梯配对：两层同一个矩形，up 用一楼读到的
  const st = stairsFromRooms([
    { id: 'g', rooms: gf.rooms, stairs: [{ x: 5.1, y: 6.6, w: 1, d: 4.6, up: 'N', shape: 'straight' }] },
    { id: 'f', rooms: ff.rooms },
  ]);
  assert.equal(st.length, 1);
  assert.deepEqual([st[0].from, st[0].to, st[0].up, st[0].shape, st[0].x, st[0].w], ['g', 'f', 'N', 'straight', 5.1, 1]);
  // 没读到方向：出口在楼上能走的地方
  const st2 = stairsFromRooms([{ id: 'g', rooms: gf.rooms }, { id: 'f', rooms: ff.rooms }]);
  assert.equal(st2[0].up, 'N');
});

// ───────────────────────── 9–10 端到端 ─────────────────────────
console.log('端到端（录好的回答）');
await test('9 图纸 / PDF：两层、一座楼梯、宽 6.1 ± 0.12 m、没有重叠和楼梯错误、IoU ≥ 0.85、床只在卧室', () => {
  const { plan, underlays, report } = assembleFixture('sheet');
  assert.equal(plan.v, 2);
  assert.deepEqual(
    plan.floors.map((f) => f.id),
    ['gf', 'ff'],
  );
  assert.equal(plan.stairs.length, 1);
  const s = plan.stairs[0];
  const sg = plan.floors[0].rooms.find((r) => r.stairId === s.id);
  const sf = plan.floors[1].rooms.find((r) => r.stairId === s.id);
  assert.deepEqual([sg.x, sg.y, sg.w, sg.d], [sf.x, sf.y, sf.w, sf.d], '两层楼梯同一个矩形');
  assert.equal(s.up, 'N');
  assert.equal(report.scale.source, 'dims');
  assert.ok(Math.abs(report.scale.widthM - 6.1) <= 0.12, `宽 ${report.scale.widthM}`);
  const issues = checkPlan(plan);
  assert.deepEqual(
    issues.filter((i) => i.level === 'error' || /^stair/.test(i.code)).map((i) => i.code),
    [],
  );
  const m = meanIoU(plan);
  assert.ok(m[0] >= 0.85 && m[1] >= 0.85, `IoU ${m.map((v) => v.toFixed(3))}`);
  assert.equal(report.aligned, 'stairs');
  assert.ok(plan.floors[0].rooms.some((r) => r.type === 'corridor'), '漏掉的玄关补成走廊');
  // 房间 id 整个方案里不重复
  const ids = plan.floors.flatMap((f) => f.rooms.map((r) => r.id));
  assert.equal(new Set(ids).size, ids.length);
  // 底图：每层一张，大小 = 裁图像素 × 比例
  assert.deepEqual(Object.keys(underlays).sort(), ['ff', 'gf']);
  assert.ok(Math.abs(underlays.gf.w / underlays.gf.iw - report.scale.mPerPx) < 1e-6);
  assert.equal(plan.floors[0].meta.import.page, 12);
  assert.equal(plan.floors[1].meta.import.page, 12);
  // 家具：床只在卧室（二楼 + 一楼客房）
  const items = furnish(plan, undefined, null);
  const beds = items.filter((i) => /bed$/i.test(i.kind) && !/bedside/i.test(i.kind));
  const roomOf = new Map(plan.floors.flatMap((f) => f.rooms.map((r) => [r.id, r])));
  assert.ok(beds.length >= 4, `床 ${beds.length}`);
  for (const b of beds) assert.ok(['bedroom', 'master', 'kids'].includes(roomOf.get(b.room)?.type), `${b.kind} 在 ${roomOf.get(b.room)?.type}`);
  assert.ok(beds.some((b) => b.floor === 'gf') && beds.some((b) => b.floor === 'ff'));
  // 设计师填一个已知尺寸 → 全部重算（'known'）
  const k2 = assembleFixture('sheet', { scale: { mPerPx: report.scale.mPerPx * (6.4 / report.scale.widthM), source: 'known' } });
  assert.equal(k2.report.scale.source, 'known');
  assert.ok(Math.abs(k2.report.scale.widthM - 6.4) < 0.08);
});
await test('10 手机截图：lowRes、提示、比例不是 dims、0 重叠', () => {
  const { plan, report } = assembleFixture('phone', { screenshot: true });
  assert.equal(report.lowRes, true);
  assert.ok(report.planPx > 100 && report.planPx < 400, `每层约 ${report.planPx} px`);
  assert.ok(report.pxPerM < 60);
  assert.notEqual(report.scale.source, 'dims');
  assert.ok(report.scale.widthM > 4.5 && report.scale.widthM < 8, `宽 ${report.scale.widthM}`);
  assert.equal(checkPlan(plan).filter((i) => i.code === 'overlap').length, 0);
  assert.equal(plan.floors.length, 2);
  const pre = lowResReport([{ srcPxW: 210 }, { srcPxW: 216 }], { screenshot: true });
  assert.equal(pre.lowRes, true);
  assert.equal(pre.planPx, 210);
  assert.equal(lowResReport([{ srcPxW: 3000 }]).lowRes, false);
});
await test('读不到的一层（跳过 / 自己描）= 只有底图；全部没读 → 不抛错', () => {
  const { found, size } = sheetCrops('sheet');
  const fl = found.plans.map((p) => ({ level: p.level, title: p.title, read: p.level === 'ground' ? J('pass2-sheet-gf.json') : null, cropW: size(p).w, cropH: size(p).h, src: 'data:x', page: 12 }));
  const r = assemblePlan(fl, {});
  assert.equal(r.plan.floors.length, 2);
  assert.equal(r.plan.floors[1].rooms.filter((q) => !q.stairId).length, 0, '只有接上来的楼梯间');
  assert.ok(r.underlays.ff && r.underlays.gf);
  assert.ok(r.report.warnings.some((w) => w.code === 'empty'));
  const none = assemblePlan([{ level: 'ground', read: null, src: 'x', cropW: 10, cropH: 10 }], {});
  assert.equal(none.plan.v, 2);
});
await test('没有 AI：自己框每一层 → 只有底图的多层方案，比例按整体宽', () => {
  const fl = [
    { level: 'ground', cropW: 1000, cropH: 3000, src: 'data:g', page: 3, house: { x0: 100, y0: 100, x1: 900, y1: 2900 } },
    { level: 'first', cropW: 1000, cropH: 2200, src: 'data:f', page: 3, house: { x0: 100, y0: 100, x1: 900, y1: 2100 } },
  ];
  const g = manualPlan(fl);
  assert.equal(g.report.scale.source, 'guess');
  assert.ok(Math.abs(g.report.scale.widthM - 6.1) < 0.01);
  const k = manualPlan(fl, { widthM: 6.4 });
  assert.equal(k.report.scale.source, 'known');
  assert.ok(Math.abs(k.underlays.gf.w - 8) < 1e-6, '1000 px × 6.4 / 800');
  assert.ok(Math.abs(k.underlays.gf.x + 0.8) < 1e-6 && Math.abs(k.underlays.ff.x + 0.8) < 1e-6, '框的左上角在 (0, 0)');
  assert.deepEqual(
    k.plan.floors.map((f) => [f.id, f.rooms.length]),
    [
      ['gf', 0],
      ['ff', 0],
    ],
  );
});
await test('房间类型和名字', () => {
  assert.equal(roomTypeOf('bedroom', 'DRIVEWAY'), 'porch');
  assert.equal(roomTypeOf('', 'STAIRCASE'), 'stair');
  assert.equal(roomTypeOf('', 'OPEN TO BELOW'), 'void');
  assert.equal(roomTypeOf('', 'FAMILY HALL'), 'family');
  assert.equal(roomTypeOf('', 'BILIK AIR'), 'bath');
  assert.equal(roomTypeOf('nonsense', 'Room 3'), 'bedroom');
  assert.equal(roomTypeOf('', ''), 'corridor');
  assert.equal(cleanLabel('LIVING'), '');
  assert.equal(cleanLabel('MASTER BEDROOM'), '');
  assert.equal(cleanLabel('BEDROOM 3'), 'Bedroom 3');
  assert.equal(cleanLabel('WET KITCHEN'), 'Wet Kitchen');
  assert.equal(cleanLabel('客厅 A'), '客厅 A');
});

// ───────────────────────── 11–12 模型、调用 ─────────────────────────
console.log('模型、调用（假的 fetch）');
await test('11 rankModels', () => {
  const list = ['models/gemini-2.5-flash', 'models/gemini-2.5-pro', 'models/gemini-3-pro-preview', 'models/gemini-2.5-flash-lite', 'models/gemini-2.5-flash-preview-tts', 'models/gemini-2.5-flash-image', 'models/gemini-embedding-001', 'models/gemini-pro-latest', 'models/gemini-flash-latest', 'models/gemini-2.5-pro-preview-06-05', 'models/gemini-3-flash-preview', 'models/text-bison', 'models/gemini-2.0-flash-live-001', 'models/learnlm-2.0-flash'];
  const pro = AI.rankModels(list, 'pro');
  assert.deepEqual(pro.slice(0, 4), ['gemini-3-pro-preview', 'gemini-pro-latest', 'gemini-2.5-pro', 'gemini-2.5-pro-preview-06-05']);
  assert.ok(pro.indexOf('gemini-2.5-pro') < pro.indexOf('gemini-2.5-flash'));
  for (const bad of ['lite', 'tts', 'image', 'embedding', 'live', 'bison', 'learnlm']) assert.ok(!pro.some((m) => m.includes(bad)), bad);
  const flash = AI.rankModels(list, 'flash');
  assert.ok(/flash/.test(flash[0]) && flash.indexOf('gemini-3-flash-preview') < flash.indexOf('gemini-2.5-pro'));
  assert.equal(flash[0], 'gemini-3-flash-preview');
  assert.equal(AI.rankModels(list, 'pro', 'gemini-2.5-flash')[0], 'gemini-2.5-flash', '指定的模型排第一');
  assert.equal(AI.rankModels(list, 'pro', 'auto')[0], 'gemini-3-pro-preview');
  // 名单是对象：只要有 generateContent 的
  const objs = [
    { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3-pro-preview', supportedGenerationMethods: ['countTokens'] },
  ];
  assert.deepEqual(AI.rankModels(objs, 'pro'), ['gemini-2.5-pro']);
  assert.deepEqual(AI.rankModels(AI.FALLBACK_MODELS, 'pro').slice(0, 3), ['gemini-3-pro-preview', 'gemini-pro-latest', 'gemini-2.5-pro']);
});

const KEY = 'AIzaFAKE-test-key-0000000000000000000';
const SETTINGS = { apiKey: KEY, baseUrl: 'https://generativelanguage.googleapis.com', visionModel: 'auto' };
const ok = (json) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] }) });
const fail = (status, message) => ({ ok: false, status, json: async () => ({ error: { code: status, message } }) });
const MODELS = { models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-pro-preview', 'gemini-flash-latest'].map((m) => ({ name: `models/${m}`, supportedGenerationMethods: ['generateContent'] })) };
/** 假的 fetch：GET models → 名单；POST → script(model, body, n) */
function mockFetch(script) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = String(url);
    assert.ok(!u.includes(KEY), 'key 不能在网址里');
    assert.equal(init.headers?.['x-goog-api-key'], KEY, 'key 在请求头里');
    if ((init.method || 'GET') === 'GET') {
      calls.push({ url: u, get: true });
      return { ok: true, status: 200, json: async () => MODELS };
    }
    const model = decodeURIComponent(/models\/([^:]+):generateContent/.exec(u)[1]);
    const body = JSON.parse(init.body);
    calls.push({ url: u, model, body });
    return script(model, body, calls.filter((c) => !c.get).length);
  };
  f.calls = calls;
  return f;
}
const PARTS = [AI.imagePart('data:image/jpeg;base64,QUJD'), { text: 'hi' }];
const noSleep = async () => {};

await test('12a callGemini：请求的样子（图片在前、schema + propertyOrdering、temperature 0、key 只在请求头）', async () => {
  AI._resetModelFlags();
  const f = mockFetch(() => ok({ pages: [] }));
  const r = await AI.callGemini(SETTINGS, { tier: 'pro', parts: PARTS, schema: AI.READ_SCHEMA, fetchImpl: f, sleep: noSleep });
  assert.equal(r.model, 'gemini-3-pro-preview');
  assert.equal(r.downgraded, false);
  const c = f.calls.find((x) => !x.get);
  assert.ok(c.url.startsWith('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent'));
  const b = c.body;
  assert.ok(b.contents[0].parts[0].inline_data, '图片在前');
  assert.equal(b.contents[0].parts[0].inline_data.mime_type, 'image/jpeg');
  assert.equal(b.contents[0].parts[1].text, 'hi');
  assert.equal(b.generationConfig.temperature, 0);
  assert.equal(b.generationConfig.responseMimeType, 'application/json');
  assert.equal(b.generationConfig.mediaResolution, 'MEDIA_RESOLUTION_HIGH');
  assert.deepEqual(b.generationConfig.responseSchema.propertyOrdering.slice(0, 4), ['title', 'overall_width_text', 'overall_depth_text', 'dimensions']);
  assert.ok(!JSON.stringify(b).includes(KEY), 'key 不在请求内容里');
  // 列模型的 GET 也只在请求头里放 key
  assert.ok(f.calls.some((x) => x.get && /\/v1beta\/models\?pageSize=200$/.test(x.url)));
});
await test('12b 404 → 下一个模型；429 → flash（downgraded）；400 mediaResolution → 去掉再试；401 → 停；5xx → 重试一次', async () => {
  AI._resetModelFlags();
  let f = mockFetch((model) => (model === 'gemini-3-pro-preview' ? fail(404, 'models/gemini-3-pro-preview is not found for API version v1beta') : ok({ a: 1 })));
  let r = await AI.callGemini(SETTINGS, { tier: 'pro', parts: PARTS, fetchImpl: f, sleep: noSleep });
  assert.equal(r.model, 'gemini-2.5-pro');
  assert.equal(r.downgraded, false);

  f = mockFetch((model) => (/pro/.test(model) ? fail(429, 'Resource has been exhausted (e.g. check quota).') : ok({ a: 2 })));
  r = await AI.callGemini(SETTINGS, { tier: 'pro', parts: PARTS, fetchImpl: f, sleep: noSleep });
  assert.equal(r.model, 'gemini-2.5-flash');
  assert.equal(r.downgraded, true);
  assert.equal(r.quota, true);
  assert.deepEqual(r.json, { a: 2 });

  AI._resetModelFlags();
  f = mockFetch((model, body) => (body.generationConfig.mediaResolution ? fail(400, 'Invalid JSON payload received. Unknown name "mediaResolution" at generation_config') : ok({ a: 3 })));
  r = await AI.callGemini(SETTINGS, { tier: 'pro', parts: PARTS, fetchImpl: f, sleep: noSleep });
  assert.equal(r.model, 'gemini-3-pro-preview', '同一个模型去掉 mediaResolution 再试');
  assert.equal(f.calls.filter((c) => !c.get).length, 2);
  // 记住了：下一次直接不送
  const f2 = mockFetch((model, body) => (body.generationConfig.mediaResolution ? fail(400, 'mediaResolution not supported') : ok({ a: 4 })));
  await AI.callGemini(SETTINGS, { tier: 'pro', parts: PARTS, fetchImpl: f2, sleep: noSleep });
  assert.equal(f2.calls.filter((c) => !c.get).length, 1);

  AI._resetModelFlags();
  f = mockFetch((model, body) => (body.generationConfig.responseSchema ? fail(400, 'Invalid value at generation_config.response_schema') : ok({ a: 5 })));
  r = await AI.callGemini(SETTINGS, { tier: 'flash', parts: PARTS, schema: AI.FIND_SCHEMA, fetchImpl: f, sleep: noSleep });
  assert.deepEqual(r.json, { a: 5 });

  f = mockFetch(() => fail(401, `API key not valid. key=${KEY}`));
  await assert.rejects(AI.callGemini(SETTINGS, { tier: 'pro', parts: PARTS, fetchImpl: f, sleep: noSleep }), (e) => e.code === 'key' && !String(e.message).includes(KEY));
  assert.equal(f.calls.filter((c) => !c.get).length, 1, '401 不再试别的模型');

  let k = 0;
  f = mockFetch(() => (++k === 1 ? fail(503, 'overloaded') : ok({ a: 6 })));
  r = await AI.callGemini(SETTINGS, { tier: 'pro', parts: PARTS, fetchImpl: f, sleep: noSleep });
  assert.equal(r.model, 'gemini-3-pro-preview', '5xx 同一个模型重试一次');

  f = mockFetch(() => fail(429, 'quota'));
  await assert.rejects(AI.callGemini(SETTINGS, { tier: 'flash', parts: PARTS, fetchImpl: f, sleep: noSleep }), (e) => e.code === 'quota');
});
await test('12c 超时 / 取消 / 没有 key / 网址必须 https', async () => {
  const slow = mockFetch(() => new Promise(() => {}));
  const never = async (url, init) =>
    url.includes('generateContent')
      ? new Promise((_, no) => init.signal.addEventListener('abort', () => no(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
      : slow(url, init);
  await assert.rejects(AI.callGemini(SETTINGS, { tier: 'flash', parts: PARTS, fetchImpl: never, timeoutMs: 30, sleep: noSleep }), (e) => e.code === 'timeout');
  const ctl = new AbortController();
  const p = AI.callGemini(SETTINGS, { tier: 'flash', parts: PARTS, fetchImpl: never, signal: ctl.signal, sleep: noSleep });
  setTimeout(() => ctl.abort(), 10);
  await assert.rejects(p, (e) => e.code === 'cancel');
  await assert.rejects(AI.callGemini({ ...SETTINGS, apiKey: '' }, { parts: PARTS }), (e) => e.code === 'key');
  await assert.rejects(AI.callGemini({ ...SETTINGS, baseUrl: 'http://evil.example' }, { parts: PARTS }), (e) => e.code === 'base');
  // 列模型失败 → 用固定名单
  const f = async (url, init) => ((init.method || 'GET') === 'GET' ? { ok: false, status: 500, json: async () => ({}) } : ok({ z: 1 }));
  const r = await AI.callGemini(SETTINGS, { tier: 'pro', parts: PARTS, fetchImpl: f, sleep: noSleep });
  assert.equal(r.model, AI.FALLBACK_MODELS[0]);
});
await test('findPlans / readFloors（2 个一起）/ findPlanPagesAI / rereadFloor：用录好的回答', async () => {
  AI._resetModelFlags();
  const p1 = J('pass1-sheet.json');
  let f = mockFetch((model, body) => {
    assert.ok(/flash/.test(model), '第一遍用 flash');
    assert.equal(body.contents[0].parts[1].text, AI.FIND_PROMPT);
    return ok(p1);
  });
  const fp = await AI.findPlans(SETTINGS, { src: 'data:image/jpeg;base64,AA', width: 2048, height: 1448 }, { fetchImpl: f, sleep: noSleep });
  assert.deepEqual(
    fp.found.plans.map((p) => p.level),
    ['ground', 'first'],
  );

  let live = 0;
  let peak = 0;
  const reads = { GROUND: J('pass2-sheet-gf.json'), FIRST: J('pass2-sheet-ff.json'), SECOND: J('pass2-sheet-ff.json') };
  f = mockFetch(async (model, body) => {
    assert.ok(/pro/.test(model), '第二遍用 pro');
    live++;
    peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 15));
    live--;
    const txt = body.contents[0].parts[1].text;
    return ok(reads[/"(GROUND|FIRST|SECOND)/.exec(txt)[1]]);
  });
  const items = ['GROUND', 'FIRST', 'SECOND'].map((k) => ({ key: k, image: { src: 'data:image/jpeg;base64,AA', width: 1000, height: 2000 }, ctx: { title: `${k} FLOOR PLAN`, level: k.toLowerCase(), houseKind: 'double-storey terraced house', otherTitles: ['FRONT ELEVATION'] } }));
  const seen = [];
  const out = await AI.readFloors(SETTINGS, items, { fetchImpl: f, sleep: noSleep, onProgress: (k, s) => seen.push(`${k}:${s}`) });
  assert.equal(peak, 2, '同时最多 2 个');
  assert.ok(out.every((o) => o.ok));
  assert.equal(out[0].read.title, 'GROUND FLOOR PLAN');
  assert.ok(seen.includes('GROUND:done'));
  assert.ok(AI.readPrompt(items[0].ctx).includes('"GROUND FLOOR PLAN" (ground) of a double-storey terraced house in Malaysia.\nThe same sheet also shows: FRONT ELEVATION.'));

  // 一层失败（没有房间）不拖垮其他层
  f = mockFetch((model, body) => (/"FIRST FLOOR PLAN"/.test(body.contents[0].parts[1].text) ? ok({ rooms: [] }) : ok(reads.GROUND)));
  const out2 = await AI.readFloors(SETTINGS, items.slice(0, 2), { fetchImpl: f, sleep: noSleep });
  assert.equal(out2[0].ok, true);
  assert.equal(out2[1].ok, false);
  assert.equal(out2[1].error.code, 'empty');

  f = mockFetch((model, body) => {
    assert.equal(body.contents[0].parts[1].text, AI.PAGES_PROMPT);
    return ok(J('pages-contact.json'));
  });
  const pages = await AI.findPlanPagesAI(SETTINGS, { src: 'data:image/jpeg;base64,AA', width: 2048, height: 1600 }, { pages: 20, fetchImpl: f, sleep: noSleep });
  assert.deepEqual(pages, [{ page: 12, levels: ['first', 'ground'] }]);

  // 重新识别这一层：用底图的比例和位置（编辑器里的坐标）
  const { plan, underlays } = assembleFixture('sheet');
  const u = underlays.gf;
  f = mockFetch(() => ok(reads.GROUND));
  const rr = await AI.rereadFloor(SETTINGS, u, { floorId: 'gf', level: 'ground', title: 'GROUND FLOOR PLAN' }, { fetchImpl: f, sleep: noSleep });
  assert.ok(rr.floor.rooms.length >= 9 && rr.floor.openings.length >= 8);
  assert.equal(rr.info.scaleSource, 'underlay');
  assert.ok(Math.abs(rr.info.dimsRatio - 1) < 0.02);
  const liv0 = plan.floors[0].rooms.find((r) => r.type === 'living');
  const liv1 = rr.floor.rooms.find((r) => r.type === 'living');
  assert.ok(IoU(liv0, liv1) > 0.95, '和原来同一个坐标');
  assert.ok(rr.floor.rooms.every((r) => r.id.startsWith('gf-')));
  assert.equal(overlaps(rr.floor.rooms), 0);
});

// ───────────────────────── 13–14 图像、PDF 文字 ─────────────────────────
console.log('截图外框、PDF 文字');
function synthPhone() {
  const W = 1170;
  const H = 2532;
  const data = new Uint8ClampedArray(W * H * 4);
  const fill = (x0, y0, x1, y1, [r, g, b]) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
  };
  fill(0, 0, W, H, [255, 255, 255]); // 状态栏、网址栏是白的
  fill(0, 140, W, 2300, [102, 101, 106]); // PDF 阅读器的灰底
  fill(20, 620, 1150, 1419, [255, 255, 255]); // 纸
  fill(120, 700, 400, 1300, [30, 30, 30]); // 纸上的平面图（墨）
  fill(40, 160, 300, 220, [40, 40, 44]); // 「20 of 30」
  fill(60, 2350, 1110, 2440, [228, 228, 232]); // 网址栏
  return { width: W, height: H, data };
}
await test('13 trimChrome：手机截图 → 纸的范围（± 4 px）；普通图纸 → null', () => {
  const r = trimChrome(synthPhone());
  assert.ok(r, '找到外框');
  for (const [k, v] of [
    ['x', 20],
    ['y', 620],
    ['w', 1130],
    ['h', 799],
  ])
    assert.ok(Math.abs(r[k] - v) <= 4, `${k} ${r[k]} vs ${v}`);
  const W = 800;
  const H = 566;
  const plain = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let y = 100; y < 400; y++) for (let x = 200; x < 205; x++) plain.set([0, 0, 0, 255], (y * W + x) * 4);
  assert.equal(trimChrome({ width: W, height: H, data: plain }), null);
  // enhance：灰蒙蒙的图拉开
  const dull = { width: 4, height: 1, data: new Uint8ClampedArray([100, 100, 100, 255, 120, 120, 120, 255, 140, 140, 140, 255, 160, 160, 160, 255]) };
  const e = enhance(dull);
  assert.ok(e.data[0] < 10 && e.data[12] > 245);
  assert.equal(dull.data[0], 100, '原图不动');
});
await test('14 pageTextScore：第 12 页最高，第 2 页（图纸目录）< 5，其他 ≤ 0', () => {
  const pages = J('pages-text.json');
  assert.equal(pages.length, 20);
  const scores = pages.map(pageTextScore);
  const best = scores.indexOf(Math.max(...scores)) + 1;
  assert.equal(best, 12);
  assert.ok(scores[11] >= 5);
  assert.ok(scores[1] < 5, `p2 = ${scores[1]}`);
  assert.equal(scores.filter((s) => s >= 5).length, 1);
  assert.equal(pageTextScore(''), 0);
});

// ───────────────────────── 15 旧接口 ─────────────────────────
console.log('旧接口');
await test('15 convertDetection：没有尺寸 → 不是 12 m，scaleSource 是 doors / guess；不重叠；门窗在墙上', () => {
  const j = {
    footprint: [100, 300, 900, 520],
    rooms: [
      { label: 'Living', type: 'living', box: [500, 300, 900, 520] },
      { label: 'Kitchen', type: 'kitchen', box: [100, 300, 520, 420] },
      { label: 'Yard', type: 'utility', box: [100, 410, 300, 520] },
      { label: 'Bedroom', type: 'bedroom', box: [290, 400, 510, 520] },
    ],
    doors: [{ box: [495, 330, 505, 370] }],
    windows: [],
  };
  const { plan, info } = AI.convertDetection(j, { src: 'x', width: 1000, height: 1000 });
  assert.notEqual(info.widthM, 12);
  assert.ok(['doors', 'guess'].includes(info.scaleSource), info.scaleSource);
  assert.equal(info.widthM, 6.1, '排屋的长宽比 → 6.1 m');
  const fl = migratePlan(plan).floors[0];
  assert.equal(overlaps(fl.rooms), 0);
  const walls = buildWalls(fl);
  for (const o of fl.openings) assert.ok(walls.some((w) => w.pieces.some((p) => p.openingId === o.id)));
  // 有总尺寸 → dims
  const d = AI.convertDetection({ ...j, overall_width_mm: 6100 }, { src: 'x', width: 1000, height: 1000 });
  assert.equal(d.info.scaleSource, 'dims');
  assert.equal(d.info.fromDims, true);
});

console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
