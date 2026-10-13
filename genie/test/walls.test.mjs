// WALLS 的测试（DESIGN §2.12 墙优先读图）：src/studio/plan/walls.js 是纯 CV —— 不用 AI、不联网，Node 里直接跑 { width, height, data }。
// 图：test/fixtures/walls/ 的合成图纸（联排一楼 / 二楼、开放式公寓、L 形半独立一楼 / 二楼 × 实心 / 斜线填充 / 空心三种墙，
// 有门弧、窗、推拉门、字、尺寸线、家具、地砖、楼梯）+ 老板拍的 TYPE B（拉正后的裁图）。真值在 *.truth.json（墙中线、开口、房间面）。
// 打印一张指标表（墙长 precision / recall ±10 cm、门 P / R、房间 IoU、开放空间里凭空多出来的墙、可信度、耗时）；
// §2.12 C 的目标没达到就失败：干净图（≥ 150 px/m）墙 P、R ≥ 0.95，门 precision ≥ 0.9，房间 IoU ≥ 0.9；60 px/m 墙 P ≥ 0.85、R ≥ 0.8；
// 开放空间里不能凭空多墙。
// 跑法：node test/walls.test.mjs（npm test 会一起跑）；--full（或 WALLS_FULL=1）把每种退化 × 三种墙都跑一遍（慢）。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractWalls, wallsToPlan, fuseWalls, WALL_T } from '../src/studio/plan/walls.js';
import { assemblePlan } from '../src/studio/plan/sheet.js';
import { buildWalls } from '../src/studio/plan/model.js';
import { decodePNG, resize, jpegLike, crop, detToMetres, wallPR, openingPR, faceIoU, inventedOpenPlan, mockRead, planMetrics } from './fixtures/walls/harness.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(ROOT, 'fixtures/walls');
const FULL = process.argv.includes('--full') || process.env.WALLS_FULL === '1';
const PLANS = ['terrace-gf', 'terrace-ff', 'condo', 'semid-gf', 'semid-ff'];
const STYLES = ['solid', 'hatched', 'hollow'];
const TRUTH = Object.fromEntries(PLANS.map((p) => [p, JSON.parse(readFileSync(path.join(FX, `${p}.truth.json`), 'utf8'))]));
const IMGS = new Map();
const image = (p, st) => {
  const k = `${p}-${st}`;
  if (!IMGS.has(k)) IMGS.set(k, decodePNG(readFileSync(path.join(FX, `${k}.png`))));
  return IMGS.get(k);
};

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

// ───────────── 退化：同一张图，换个拿到的方式 ─────────────
// 返回 { img, pxm（这张图每米几像素）, origin（米：图左上角到真值原点）, known（给不给比例） }
function degrade(p, st, deg) {
  const T = TRUTH[p];
  const src = image(p, st);
  const w0 = src.width;
  const at = (img, origin = T.origin) => ({ img, pxm: (img.width / w0) * T.pxPerM, origin, known: deg !== 'unknown' });
  if (deg === 'clean' || deg === 'unknown') return at(src);
  if (deg === '60') return at(resize(src, 60 / T.pxPerM));
  if (deg === 'jpeg') return at(jpegLike(src, 60));
  // 缩到 60 px/m 再放回来（网上转存过的图）
  if (deg === 'up') return at(resize(resize(src, 60 / T.pxPerM), T.pxPerM / 60));
  if (deg === 'phone') {
    // 手机截图：四边各裁掉 4 %，屏幕上 ≈ 30 px/m、JPEG q60，再放大一倍（截图被放大存）
    const x0 = Math.round(src.width * 0.04);
    const y0 = Math.round(src.height * 0.04);
    const c = crop(src, x0, y0, src.width - 2 * x0, src.height - 2 * y0);
    const img = resize(jpegLike(resize(c, 30 / T.pxPerM), 60), 2);
    return { img, pxm: (img.width / c.width) * T.pxPerM, origin: [T.origin[0] - x0 / T.pxPerM, T.origin[1] - y0 / T.pxPerM], known: true };
  }
  throw new Error(deg);
}

const ROWS = [];
function measure(p, st, deg) {
  const T = TRUTH[p];
  const { img, pxm, origin, known } = degrade(p, st, deg);
  const t0 = performance.now();
  const res = extractWalls(img, known ? { pxPerM: pxm } : {});
  const ms = performance.now() - t0;
  const D = detToMetres(res, pxm, origin);
  const row = {
    name: `${p}-${st}`,
    deg,
    pxm,
    wall: wallPR(D.walls, T.walls, 0.1),
    door: openingPR(D.gaps, T.openings, ['door']),
    win: openingPR(D.gaps, T.openings, ['window']),
    slider: openingPR(D.gaps, T.openings, ['slider']),
    iou: faceIoU(D.faces, T.faces).mean,
    inv: inventedOpenPlan(D.walls, D.gaps, T),
    q: res.quality,
    scale: res.pxPerM ? res.pxPerM / pxm : 0,
    scaleSource: res.scaleSource,
    ms,
  };
  ROWS.push(row);
  return row;
}

const f2 = (v) => (v == null ? '  - ' : v.toFixed(2));
function table(rows, title) {
  console.log(`\n${title}`);
  console.log('  fixture                    deg      px/m | wall P  R    | door P  R    | win P  R    | sldr P  R   | IoU  | inv | q     eff | scale       | ms');
  for (const r of rows)
    console.log(
      `  ${r.name.padEnd(26)} ${r.deg.padEnd(7)} ${String(Math.round(r.pxm)).padStart(4)} | ${f2(r.wall.precision)} ${f2(r.wall.recall)} | ${f2(r.door.precision)} ${f2(r.door.recall)} | ${f2(r.win.precision)} ${f2(r.win.recall)} | ${f2(r.slider.precision)} ${f2(r.slider.recall)} | ${f2(r.iou)} | ${String(r.inv.pieces).padStart(3)} | ${f2(r.q.score)} ${String(r.q.effPxPerM ?? '-').padStart(4)} | ${(r.scaleSource || '-').padEnd(5)} ${f2(r.scale)} | ${Math.round(r.ms)}`,
    );
}

// ───────────── 1. 干净的图（≥ 150 px/m）：§2.12 C 的硬指标 ─────────────
console.log('walls.js —— 墙优先读图（DESIGN §2.12）');
const clean = [];
for (const st of STYLES) for (const p of PLANS) clean.push(measure(p, st, 'clean'));
table(clean, '干净的图（150–200 px/m，给了比例）：目标 墙 P、R ≥ 0.95 · 门 P ≥ 0.9 · 房间 IoU ≥ 0.9 · 开放空间多出来的墙 = 0');
await test('干净的图：15 张都达到 §2.12 C（墙 P / R ≥ 0.95、门 P ≥ 0.9、房间 IoU ≥ 0.9、开放空间不多墙）', () => {
  const bad = [];
  for (const r of clean) {
    if (r.wall.precision < 0.95) bad.push(`${r.name} 墙 P ${f2(r.wall.precision)}`);
    if (r.wall.recall < 0.95) bad.push(`${r.name} 墙 R ${f2(r.wall.recall)}`);
    if (r.door.precision < 0.9) bad.push(`${r.name} 门 P ${f2(r.door.precision)}`);
    if (r.iou < 0.9) bad.push(`${r.name} IoU ${r.iou.toFixed(3)}`);
    if (r.inv.pieces) bad.push(`${r.name} 开放空间多了 ${r.inv.metres} m 墙`);
  }
  assert.deepEqual(bad, []);
});
await test('干净的图：可信度 ≥ 0.6（sheet.js 会用墙优先），比例 = 给的', () => {
  for (const r of clean) {
    assert.ok(r.q.score >= 0.6, `${r.name} 可信度 ${r.q.score} ${r.q.reasons.join(',')}`);
    assert.equal(r.scaleSource, 'given');
  }
});

// ───────────── 2. 60 px/m（小图 / 低清扫描）：§2.12 C ─────────────
const low = [];
for (const st of STYLES) for (const p of PLANS) low.push(measure(p, st, '60'));
table(low, '缩到 60 px/m：目标 墙 P ≥ 0.85、R ≥ 0.8 · 开放空间多出来的墙 = 0');
await test('60 px/m：15 张墙 P ≥ 0.85、R ≥ 0.8，开放空间不多墙', () => {
  const bad = [];
  for (const r of low) {
    if (r.wall.precision < 0.85) bad.push(`${r.name} 墙 P ${f2(r.wall.precision)}`);
    if (r.wall.recall < 0.8) bad.push(`${r.name} 墙 R ${f2(r.wall.recall)}`);
    if (r.inv.pieces) bad.push(`${r.name} 开放空间多了 ${r.inv.metres} m 墙`);
  }
  assert.deepEqual(bad, []);
});

// ───────────── 3. 其他退化（只报告；手机截图要老实地说自己没把握） ─────────────
const DEGS = ['jpeg', 'up', 'phone', 'unknown'];
const deg = [];
for (const d of DEGS)
  STYLES.forEach((st, si) =>
    PLANS.forEach((p, pi) => {
      // 默认每种退化每张平面图跑一种墙（轮着来），--full 全跑
      if (FULL || (pi + DEGS.indexOf(d)) % 3 === si) deg.push(measure(p, st, d));
    }),
  );
table(deg, `其他退化（${FULL ? '全部' : '每张平面图轮一种墙；--full 全跑'}）：JPEG q60 · 缩到 60 再放大 · 手机截图（裁边、30 px/m、JPEG、×2）· 不给比例（按墙厚 / 门宽估）`);
await test('JPEG q60 和干净的图差不多：墙 P / R ≥ 0.95、门 P ≥ 0.9、开放空间不多墙', () => {
  for (const r of deg.filter((x) => x.deg === 'jpeg')) {
    assert.ok(r.wall.precision >= 0.95 && r.wall.recall >= 0.95, `${r.name} 墙 ${f2(r.wall.precision)} / ${f2(r.wall.recall)}`);
    assert.ok(r.door.precision >= 0.9, `${r.name} 门 P ${f2(r.door.precision)}`);
    assert.equal(r.inv.pieces, 0, r.name);
  }
});
await test('手机截图（有效 ≈ 30 px/m）：可信度 < 0.6 → sheet.js 退回 AI 房间框 + 墨迹检查', () => {
  for (const r of deg.filter((x) => x.deg === 'phone')) assert.ok(r.q.score < 0.6, `${r.name} 可信度 ${r.q.score}`);
});
await test('可信度 ≥ 0.6 的结果都靠得住（墙 P ≥ 0.9、房间 IoU ≥ 0.55）', () => {
  for (const r of ROWS.filter((x) => x.q.score >= 0.6)) {
    assert.ok(r.wall.precision >= 0.9, `${r.name} ${r.deg} 可信度 ${r.q.score} 但墙 P ${f2(r.wall.precision)}`);
    assert.ok(r.iou >= 0.55, `${r.name} ${r.deg} 可信度 ${r.q.score} 但 IoU ${f2(r.iou)}`);
  }
});

// ───────────── 4. 老板的 TYPE B（照片拉正后的裁图，≈ 61 px/m，空心双线墙） ─────────────
const OT = JSON.parse(readFileSync(path.join(FX, 'owner-type-b.truth.json'), 'utf8'));
const owner = decodePNG(readFileSync(path.join(FX, 'owner-type-b.png')));
const owner2 = resize(owner, 2); // ImportFlow 把 < 1400 px 的裁图放大一倍再读
let OWN = null;
{
  const pxm = OT.pxPerM * (owner2.width / owner.width);
  const t0 = performance.now();
  const res = extractWalls(owner2, { pxPerM: pxm });
  const ms = performance.now() - t0;
  const D = detToMetres(res, pxm, OT.origin);
  // 照片拉正 + 真值从尺寸链算（右边分户墙差 ~0.14 m）→ 墙用 ±15 cm 比
  OWN = { res, wall: wallPR(D.walls, OT.walls, 0.15), wall10: wallPR(D.walls, OT.walls, 0.1), door: openingPR(D.gaps, OT.openings, ['door']), win: openingPR(D.gaps, OT.openings, ['window']), iou: faceIoU(D.faces, OT.faces).mean, inv: inventedOpenPlan(D.walls, D.gaps, OT), ms };
  console.log(`\n老板的 TYPE B（照片拉正、裁图 ×2 = ${Math.round(pxm)} px/m，原图 ≈ ${Math.round(OT.pxPerM)} px/m）`);
  console.log(`  墙 P ${f2(OWN.wall.precision)} R ${f2(OWN.wall.recall)}（±15 cm；±10 cm：${f2(OWN.wall10.precision)} / ${f2(OWN.wall10.recall)}）· 门 P ${f2(OWN.door.precision)} R ${f2(OWN.door.recall)}（${OWN.door.tp}/${OWN.door.truth}）· 窗 P ${f2(OWN.win.precision)} R ${f2(OWN.win.recall)} · 房间 IoU ${f2(OWN.iou)} · 客厅 / 餐厅之间多出来的墙 ${OWN.inv.pieces} · 可信度 ${res.quality.score}（${res.quality.reasons.join(', ') || '—'}）· ${Math.round(ms)} ms`);
}
await test('老板的 TYPE B：门只在有门弧的地方（P ≥ 0.9）、客厅 | 餐厅 | 厨房之间不多墙、墙 P ≥ 0.85 R ≥ 0.8（±15 cm）', () => {
  assert.ok(OWN.door.precision >= 0.9, `门 P ${OWN.door.precision}`);
  assert.ok(OWN.door.recall >= 0.85, `门 R ${OWN.door.recall}`);
  assert.equal(OWN.inv.pieces, 0, `开放空间多了 ${OWN.inv.metres} m 墙`);
  assert.ok(OWN.wall.precision >= 0.85 && OWN.wall.recall >= 0.8, `墙 ${OWN.wall.precision} / ${OWN.wall.recall}`);
  assert.ok(OWN.iou >= 0.8, `IoU ${OWN.iou}`);
  // 照片、原图只有 ~61 px/m、空心双线墙 → 可信度老实地低于 0.6（sheet.js 用 AI 房间框 + 墨迹检查那条路）
  assert.ok(OWN.res.quality.score < 0.6, `可信度 ${OWN.res.quality.score}`);
});

// ───────────── 5. 和 sheet.js 合起来：模拟的第二遍 AI 回答（框偏 ±0.25 m、漏一个房间、多画的门） ─────────────
const INJ = {
  'terrace-gf': { dropRoom: 'g-gbth', extraDoors: [{ x1: 1.0, y1: 10.0, x2: 1.9, y2: 10.0 }] },
  'terrace-ff': { dropRoom: 'f-wir', extraDoors: [{ x1: 1.0, y1: 7.6, x2: 1.9, y2: 7.6 }] },
  condo: { dropRoom: 'b2b', extraDoors: [{ x1: 0.5, y1: 2.4, x2: 1.4, y2: 2.4 }, { x1: 2.0, y1: 5.2, x2: 2.9, y2: 5.2 }] },
  'semid-gf': { dropRoom: 'st', extraDoors: [{ x1: 1.0, y1: 7.6, x2: 1.9, y2: 7.6 }] },
  'semid-ff': { dropRoom: 'c1', extraDoors: [{ x1: 1.0, y1: 3.8, x2: 1.9, y2: 3.8 }] },
};
const FUSE = [];
STYLES.forEach((st, si) =>
  PLANS.forEach((p, pi) => {
    if (!FULL && pi % 3 !== si) return;
    const T = TRUTH[p];
    const img = image(p, st);
    const read = mockRead(T, img.width, img.height, { seed: 3, jitter: 0.25, ...INJ[p] });
    const walls = extractWalls(img, { pxPerM: T.pxPerM });
    const floors = [{ level: 'ground', title: p, read, cropW: img.width, cropH: img.height, walls }];
    const inner = T.rooms.filter((r) => !['porch', 'balcony'].includes(r.type));
    const at = { dx: Math.min(...inner.map((r) => r.x)), dy: Math.min(...inner.map((r) => r.y)) };
    const row = { name: `${p}-${st}` };
    for (const [k, fuse] of [
      ['roomsFirst', null],
      ['wallFirst', fuseWalls],
    ]) {
      const { plan, report } = assemblePlan(floors, fuse ? { fuse } : {});
      row[k] = planMetrics(plan.floors[0], T, buildWalls, at);
      row[k].used = fuse ? !!(report.floors[0].walls && !report.floors[0].walls.lowQuality) : false;
    }
    FUSE.push(row);
  }),
);
console.log('\n和 sheet.js 合起来（模拟的第二遍回答：房间框偏 ±0.25 m、漏一个房间、多画 1–2 扇门；墙 = model.buildWalls 的结果，±15 cm）');
console.log('  fixture             | 按房间框铺（旧）: 墙 P  R    门 P  R    多墙 | 墙优先（新）: 墙 P  R    门 P  R    多墙');
for (const r of FUSE) {
  const a = r.roomsFirst;
  const b = r.wallFirst;
  console.log(`  ${r.name.padEnd(19)} |                  ${f2(a.wallP)} ${f2(a.wallR)}  ${f2(a.doorP)} ${f2(a.doorR)}  ${String(a.inventedM).padStart(4)} m |              ${f2(b.wallP)} ${f2(b.wallR)}  ${f2(b.doorP)} ${f2(b.doorR)}  ${String(b.inventedM).padStart(4)} m${b.used ? '' : '（没采用）'}`);
}
await test('墙优先（fuseWalls）：被采用；墙 P / R ≥ 0.9、门 P ≥ 0.9、开放空间不多墙；多出来的门都去掉', () => {
  for (const r of FUSE) {
    const b = r.wallFirst;
    assert.ok(b.used, `${r.name} 没采用墙优先`);
    assert.ok(b.wallP >= 0.9 && b.wallR >= 0.9, `${r.name} 墙 ${f2(b.wallP)} / ${f2(b.wallR)}`);
    assert.ok(b.doorP >= 0.9, `${r.name} 门 P ${f2(b.doorP)}`);
    assert.equal(b.invented, 0, `${r.name} 开放空间多了 ${b.inventedM} m 墙`);
  }
});

// ───────────── 6. 接口 ─────────────
await test('接口：灰度 / RGB / RGBA 一样；空白图 → no-walls；wallsToPlan 换成米（+ dx / dy）；fuseWalls 没有面 → null', () => {
  const T = TRUTH.condo;
  const src = image('condo', 'solid');
  const small = resize(src, 0.5);
  const rgba = extractWalls(small, { pxPerM: T.pxPerM / 2 });
  const N = small.width * small.height;
  const rgb = { width: small.width, height: small.height, data: new Uint8Array(N * 3) };
  const grey = { width: small.width, height: small.height, data: new Uint8Array(N) };
  for (let i = 0; i < N; i++) {
    for (let c = 0; c < 3; c++) rgb.data[i * 3 + c] = small.data[i * 4 + c];
    grey.data[i] = small.data[i * 4];
  }
  for (const other of [extractWalls(rgb, { pxPerM: T.pxPerM / 2 }), extractWalls(grey, { pxPerM: T.pxPerM / 2 })]) {
    assert.equal(other.walls.length, rgba.walls.length);
    assert.equal(other.gaps.length, rgba.gaps.length);
    assert.equal(other.faces.length, rgba.faces.length);
  }
  const blank = extractWalls({ width: 400, height: 300, data: new Uint8Array(400 * 300).fill(255) }, { pxPerM: 100 });
  assert.deepEqual([blank.walls.length, blank.quality.score, blank.quality.reasons[0]], [0, 0, 'no-walls']);
  const m = wallsToPlan(rgba, 2 / T.pxPerM, { dx: 1, dy: 2 });
  assert.equal(m.walls.length, rgba.walls.length);
  const w0 = rgba.walls[0];
  assert.ok(Math.abs(m.walls[0].x1 - ((w0.x1 * 2) / T.pxPerM + 1)) < 0.002 && Math.abs(m.walls[0].y1 - ((w0.y1 * 2) / T.pxPerM + 2)) < 0.002);
  assert.ok(m.openings.every((o) => ['door', 'open', 'window', 'slider'].includes(o.kind)));
  assert.ok(m.faces.every((f) => f.rects.every((r) => r.w > 0 && r.d > 0)));
  assert.ok(rgba.walls.every((w) => w.t / (T.pxPerM / 2) >= WALL_T.min * 0.8 && w.t / (T.pxPerM / 2) <= WALL_T.thick * 1.1));
  assert.equal(fuseWalls({ m: { rooms: [] }, walls: blank, mPerPx: 0.01 }), null);
});

// ───────────── 7. 速度：3000 × 2000 的裁图 ≤ 400 ms（Node） ─────────────
await test('速度：3000 × 2000 的裁图（220 px/m）最快一次 ≤ 400 ms（机器很忙时放宽到 1.2 s，WALLS_PERF_STRICT=1 严格）', () => {
  const big = crop(resize(image('condo', 'hollow'), 1.1), 0, 0, 3000, 2000);
  const ts = [];
  let res = null;
  for (let i = 0; i < 4; i++) {
    const t0 = performance.now();
    res = extractWalls(big, { pxPerM: 220 });
    ts.push(performance.now() - t0);
  }
  const best = Math.min(...ts);
  console.log(`    ${ts.map((t) => Math.round(t)).join(' / ')} ms（第一次含 JIT 预热）· 各步 ${JSON.stringify(res.timing)} · 墙 ${res.walls.length}`);
  assert.ok(res.walls.length >= 8);
  const limit = process.env.WALLS_PERF_STRICT === '1' ? 400 : 1200;
  assert.ok(best <= limit, `最快 ${Math.round(best)} ms > ${limit} ms`);
  if (best > 400) console.log(`    （最快 ${Math.round(best)} ms > 400 ms：机器忙？单独跑 WALLS_PERF_STRICT=1 node test/walls.test.mjs 复查）`);
});

console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
