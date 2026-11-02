// WALLS 的测试（DESIGN §2.12 墙优先读图）：src/studio/plan/walls.js 是纯 CV —— 不用 AI、不联网，Node 里直接跑 { width, height, data }。
// 图：test/fixtures/walls/ 的合成图纸（联排一楼 / 二楼、开放式公寓、L 形半独立一楼 / 二楼 × 实心 / 斜线填充 / 空心三种墙，
// 有门弧、窗、推拉门、字、尺寸线、家具、地砖、楼梯）+ 老板拍的 TYPE B（拉正后的裁图）。真值在 *.truth.json（墙中线、开口、房间面）。
// 打印一张指标表（墙长 precision / recall ±10 cm、门 P / R、房间 IoU、开放空间里凭空多出来的墙、可信度、耗时）；
// §2.12 C 的目标没达到就失败：干净图（≥ 150 px/m）墙 P、R ≥ 0.95，门 precision ≥ 0.9，房间 IoU ≥ 0.9；60 px/m 墙 P ≥ 0.85、R ≥ 0.8；
// 开放空间里不能凭空多墙。
// 8–10. 评审做的 CAD 图纸（test/fixtures/walls/*-pdf / *-phonezoom / *-phone：联排双层斜线填充墙、L 形半独立空心墙 + 挑空，有轴线、
//    尺寸链、字、家具、洁具、地砖、楼梯扶手、阳台栏杆、排水沟；真值另有 rails = 栏杆 / 扶手，不是墙）：IMPORT 实际的分辨率
//    （矢量 PDF 区域 106–113 px/m、手机放大截图 57–65 px/m、整张手机截图 36 px/m）、复印件（photocopy.mjs 现场做）、比例错 ±5 / 10 %、
//    重采样到 80–150 px/m、不给比例、接上 sheet.js 的整条路（AI 回答带错、墙 = buildWalls、±0.4 m 配准后比）、可信度校准、速度。
// 跑法：node test/walls.test.mjs（npm test 会一起跑）；--full（或 WALLS_FULL=1）把每种退化 × 三种墙都跑一遍（慢）。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractWalls, wallsToPlan, fuseWalls, WALL_T } from '../src/studio/plan/walls.js';
import { assemblePlan, inkMask } from '../src/studio/plan/sheet.js';
import { buildWalls } from '../src/studio/plan/model.js';
import { decodePNG, resize, jpegLike, crop, detToMetres, wallPR, openingPR, faceIoU, inventedOpenPlan, mockRead, planMetrics, offRuns } from './fixtures/walls/harness.mjs';
import { photocopy } from './fixtures/walls/photocopy.mjs';
import { JpegImage } from 'pdfjs-dist/image_decoders/pdf.image_decoders.mjs';

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
      `  ${r.name.padEnd(26)} ${r.deg.padEnd(7)} ${String(Math.round(r.pxm)).padStart(4)} | ${f2(r.wall.precision)} ${f2(r.wall.recall)} | ${f2(r.door.precision)} ${f2(r.door.recall)} | ${f2(r.win.precision)} ${f2(r.win.recall)} | ${f2(r.slider.precision)} ${f2(r.slider.recall)} | ${f2(r.iou)} | ${String(r.inv.pieces).padStart(3)} | ${f2(r.q.score)} ${String(r.q.effPxPerM ?? '-').padStart(4)} | ${(r.scaleSource || '-').padEnd(5)} ${f2(r.scale)} | ${Math.round(r.ms)}${r.rails ? ` | 栏杆上的墙 ${r.rails.m} m` : ''}`,
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

// ───────────── 8. 评审做的 CAD 图纸：IMPORT 实际拿到的分辨率 ─────────────
// *-pdf：矢量 PDF 区域重渲染（106–113 px/m，ImportFlow 读 PDF 就是这个分辨率）· *-phonezoom：手机放大到平面图的截图（57–65 px/m）·
// *-phone：整张 A2 图纸的手机截图（36 px/m，裁出来 ×2）。墙：联排 = 45° 斜线填充，半独立 = 空心双线（+ 挑空、阳台栏杆）。
const SHEETS = ['terrace-gf-pdf', 'terrace-ff-pdf', 'semid-gf-pdf', 'semid-ff-pdf', 'terrace-gf-phonezoom', 'semid-ff-phonezoom', 'semid-gf-phone'];
const PDFS = SHEETS.filter((s) => s.endsWith('-pdf'));
const SH = Object.fromEntries(SHEETS.map((s) => [s, { T: JSON.parse(readFileSync(path.join(FX, `${s}.truth.json`), 'utf8')), img: decodePNG(readFileSync(path.join(FX, `${s}.png`))) }]));
// 落在栏杆 / 扶手上的墙（m）：真值的 rails ±0.15 m，又不在真墙上
const onRails = (walls, T) => {
  const rails = T.rails || [];
  const r = offRuns(walls, T.walls, 0.15, (s, u) => (rails.some((q) => q.axis === s.axis && Math.abs(q.c - s.c) <= 0.15 && u >= q.a - 0.15 && u <= q.b + 0.15) ? 'rail' : ''));
  const p = r.pieces.filter((q) => q.what === 'rail');
  return { pieces: p.length, m: +p.reduce((v, q) => v + q.b - q.a, 0).toFixed(2) };
};
const SROWS = [];
function measureSheet(name, img, T, { deg = 'given', pxPerM = T.pxPerM, given = true } = {}) {
  const t0 = performance.now();
  const res = extractWalls(img, given ? { pxPerM } : {});
  const ms = performance.now() - t0;
  // 墙在图上的位置和比例对不对无关：一律按图真正的比例换成米再比
  const D = detToMetres(res, T.pxPerM, T.origin);
  const row = {
    name,
    deg,
    pxm: T.pxPerM,
    res,
    wall: wallPR(D.walls, T.walls, 0.1),
    door: openingPR(D.gaps, T.openings, ['door']),
    win: openingPR(D.gaps, T.openings, ['window']),
    slider: openingPR(D.gaps, T.openings, ['slider']),
    iou: faceIoU(D.faces, T.faces).mean,
    inv: inventedOpenPlan(D.walls, D.gaps, T),
    rails: onRails(D.walls, T),
    q: res.quality,
    scale: res.pxPerM ? res.pxPerM / T.pxPerM : 0,
    scaleSource: res.scaleSource,
    ms,
  };
  SROWS.push(row);
  return row;
}
const sheet = SHEETS.map((s) => measureSheet(s, SH[s].img, SH[s].T, { deg: s.split('-').pop() }));
table(sheet, '评审的 CAD 图纸（给了比例）：pdf = 矢量 PDF 区域 106–113 px/m · phonezoom = 手机放大截图 57–65 px/m · phone = 整张图纸的手机截图 36 px/m');
await test('矢量 PDF 裁图（106–113 px/m）：§2.12 C 达标（墙 P / R ≥ 0.95、门 P ≥ 0.9、房间 IoU ≥ 0.9），门窗推拉门都对，栏杆 / 扶手 / 排水沟不当墙，过闸（可信度 ≥ 0.6）', () => {
  const bad = [];
  for (const r of sheet.filter((x) => x.deg === 'pdf')) {
    if (r.wall.precision < 0.95 || r.wall.recall < 0.95) bad.push(`${r.name} 墙 ${f2(r.wall.precision)} / ${f2(r.wall.recall)}`);
    if (r.door.precision < 0.9 || r.door.recall < 0.9) bad.push(`${r.name} 门 ${f2(r.door.precision)} / ${f2(r.door.recall)}`);
    if (r.win.precision < 0.9) bad.push(`${r.name} 窗 P ${f2(r.win.precision)}`);
    if (r.slider.precision < 0.9 || r.slider.recall < 0.9) bad.push(`${r.name} 推拉门 ${f2(r.slider.precision)} / ${f2(r.slider.recall)}`);
    if (r.iou < 0.9) bad.push(`${r.name} IoU ${f2(r.iou)}`);
    if (r.inv.pieces) bad.push(`${r.name} 开放空间多了 ${r.inv.metres} m 墙`);
    if (r.rails.pieces) bad.push(`${r.name} 栏杆上 ${r.rails.m} m 墙`);
    if (r.q.score < 0.6) bad.push(`${r.name} 可信度 ${r.q.score}（${r.q.reasons.join(',')}）`);
  }
  assert.deepEqual(bad, []);
});
await test('手机放大截图（57–65 px/m）：墙 P ≥ 0.95、R ≥ 0.9、门 P ≥ 0.9、不多墙、过闸；整张图纸的手机截图（36 px/m）：可信度 < 0.6（退回 AI 房间框）', () => {
  const bad = [];
  for (const r of sheet.filter((x) => x.deg === 'phonezoom')) {
    if (r.wall.precision < 0.95 || r.wall.recall < 0.9) bad.push(`${r.name} 墙 ${f2(r.wall.precision)} / ${f2(r.wall.recall)}`);
    if (r.door.precision < 0.9) bad.push(`${r.name} 门 P ${f2(r.door.precision)}`);
    if (r.inv.pieces || r.rails.pieces) bad.push(`${r.name} 多墙 ${r.inv.metres} m / 栏杆 ${r.rails.m} m`);
    if (r.q.score < 0.6) bad.push(`${r.name} 可信度 ${r.q.score}（${r.q.reasons.join(',')}）`);
  }
  for (const r of sheet.filter((x) => x.deg === 'phone')) if (r.q.score >= 0.6) bad.push(`${r.name} 可信度 ${r.q.score}`);
  assert.deepEqual(bad, []);
});

// 复印件（灰纸、碳粉不匀、断线、斑点、0.3° 歪、JPEG）：现场从 PDF 裁图做（photocopy.mjs），默认两张，--full 四张
const houseCentre = (T) => {
  const xs = T.walls.flatMap((w) => (w.axis === 'h' ? [w.a, w.b] : [w.c]));
  const ys = T.walls.flatMap((w) => (w.axis === 'h' ? [w.c] : [w.a, w.b]));
  return [((Math.min(...xs) + Math.max(...xs)) / 2 + T.origin[0]) * T.pxPerM, ((Math.min(...ys) + Math.max(...ys)) / 2 + T.origin[1]) * T.pxPerM];
};
const copies = (FULL ? PDFS : ['terrace-gf-pdf', 'semid-ff-pdf']).map((s) => {
  const { T, img } = SH[s];
  const [cx, cy] = houseCentre(T);
  return measureSheet(s.replace('-pdf', '-copy'), photocopy(img, { cx, cy, jpeg: jpegLike }), T, { deg: 'copy' });
});
table(copies, `复印件（photocopy.mjs：灰纸、碳粉不匀、断线、0.3° 歪、JPEG q70；${FULL ? '四张' : '两张，--full 四张'}）`);
await test('复印件：墙 P ≥ 0.85、R ≥ 0.8；可信度 ≥ 0.6 时墙 P ≥ 0.9（不然老实地低于 0.6）', () => {
  for (const r of copies) {
    assert.ok(r.wall.precision >= 0.85 && r.wall.recall >= 0.8, `${r.name} 墙 ${f2(r.wall.precision)} / ${f2(r.wall.recall)}`);
    if (r.q.score >= 0.6) assert.ok(r.wall.precision >= 0.9 && r.iou >= 0.55, `${r.name} 可信度 ${r.q.score} 但墙 P ${f2(r.wall.precision)} IoU ${f2(r.iou)}`);
  }
});

// 稳不稳：AI 量出来的比例差 ±5 / 10 %；同一张图换分辨率（重采样到 80–150 px/m）
const scaled = [];
for (const s of PDFS) for (const k of [0.9, 0.95, 1.05, 1.1]) scaled.push(measureSheet(s, SH[s].img, SH[s].T, { deg: `×${k}`, pxPerM: SH[s].T.pxPerM * k }));
table(scaled, '比例错了（给的 px/m = 真的 × 0.9 / 0.95 / 1.05 / 1.1）');
await test('比例错 ±5 %：墙 P / R ≥ 0.95、过闸；错 ±10 %：墙 P ≥ 0.95，可信度 ≥ 0.6 的墙 P ≥ 0.9', () => {
  const bad = [];
  for (const r of scaled) {
    const near = r.deg === '×0.95' || r.deg === '×1.05';
    if (r.wall.precision < 0.95) bad.push(`${r.name} ${r.deg} 墙 P ${f2(r.wall.precision)}`);
    if (near && (r.wall.recall < 0.95 || r.q.score < 0.6)) bad.push(`${r.name} ${r.deg} 墙 R ${f2(r.wall.recall)} 可信度 ${r.q.score}`);
    if (r.q.score >= 0.6 && r.wall.precision < 0.9) bad.push(`${r.name} ${r.deg} 可信度 ${r.q.score} 但墙 P ${f2(r.wall.precision)}`);
  }
  assert.deepEqual(bad, []);
});
const resampled = [];
for (const s of ['terrace-gf-pdf', 'semid-ff-pdf'])
  for (const p of [80, 95, 130, 150]) {
    const { T, img } = SH[s];
    const k = p / T.pxPerM;
    const im = resize(img, k);
    const T2 = { ...T, pxPerM: T.pxPerM * (im.width / img.width) };
    resampled.push(measureSheet(s, im, T2, { deg: `${p}px` }));
  }
table(resampled, '同一张 PDF 裁图重采样到 80 / 95 / 130 / 150 px/m（给对的比例）');
await test('重采样到 80–150 px/m：墙 P ≥ 0.95、R ≥ 0.9、门 P ≥ 0.9、过闸 —— 结果不随分辨率跳', () => {
  const bad = [];
  for (const r of resampled) {
    if (r.wall.precision < 0.95 || r.wall.recall < 0.9) bad.push(`${r.name} ${r.deg} 墙 ${f2(r.wall.precision)} / ${f2(r.wall.recall)}`);
    if (r.door.precision < 0.9) bad.push(`${r.name} ${r.deg} 门 P ${f2(r.door.precision)}`);
    if (r.q.score < 0.6) bad.push(`${r.name} ${r.deg} 可信度 ${r.q.score}（${r.q.reasons.join(',')}）`);
  }
  assert.deepEqual(bad, []);
});
const unknown = PDFS.map((s) => measureSheet(s, SH[s].img, SH[s].T, { deg: 'unknown', given: false }));
table(unknown, '不给比例（按墙厚 / 门宽估）');
await test('不给比例：估出来的比例在 ±6 % 里（墙厚先估、在估的比例下再量一次门宽），墙 P ≥ 0.95；可信度 ≥ 0.6 的墙 P ≥ 0.9', () => {
  for (const r of unknown) {
    assert.ok(Math.abs(r.scale - 1) <= 0.06, `${r.name} 估的比例 ×${f2(r.scale)}（${r.scaleSource}）`);
    assert.ok(r.wall.precision >= 0.95, `${r.name} 墙 P ${f2(r.wall.precision)}`);
    if (r.q.score >= 0.6) assert.ok(r.wall.precision >= 0.9, `${r.name} 可信度 ${r.q.score} 但墙 P ${f2(r.wall.precision)}`);
  }
});

// ───────────── 9. 评审的图纸接上 sheet.js：设计师在编辑器里拿到的 ─────────────
// ImportFlow 的样子：floors[i] = { read（模拟的第二遍回答：房间框偏 ±0.25 m、漏一个房间、多画两扇门）, cropW / H, walls, ink: inkMask, srcScale }，
// opts.fuse = fuseWalls；最后的墙 = model.buildWalls。AI 的框整体偏了不该算两次错 → 在 ±0.4 m 里找最合的整体平移再比（planMetrics register）。
const INJ8 = {
  'terrace-gf': { dropRoom: 'sto', extraDoors: [{ x1: 1.0, y1: 14.0, x2: 1.9, y2: 14.0 }, { x1: 0, y1: 7.0, x2: 0, y2: 7.9 }] },
  'terrace-ff': { dropRoom: 'wir', extraDoors: [{ x1: 1.0, y1: 16.8, x2: 1.9, y2: 16.8 }, { x1: 4.4, y1: 10.5, x2: 4.4, y2: 11.4 }] },
  'semid-gf': { dropRoom: 'bth', extraDoors: [{ x1: 1.0, y1: 9.0, x2: 1.9, y2: 9.0 }, { x1: 7.6, y1: 8.6, x2: 7.6, y2: 9.4 }] },
  'semid-ff': { dropRoom: 'cor', extraDoors: [{ x1: 1.0, y1: 9.0, x2: 1.9, y2: 9.0 }, { x1: 3.6, y1: 11.0, x2: 3.6, y2: 11.9 }] },
};
const APP = [];
for (const r of sheet) {
  const { T, img } = SH[r.name];
  const base = r.name.replace(/-(pdf|phonezoom|phone)$/, '');
  const read = mockRead(T, img.width, img.height, { seed: 3, jitter: 0.25, ...INJ8[base] });
  const floor = { level: 'ground', title: base, read, cropW: img.width, cropH: img.height, walls: r.res, ink: inkMask(img), srcScale: r.deg === 'phone' ? 2 : 1 };
  const { plan, report } = assemblePlan([floor], { fuse: fuseWalls });
  const inner = T.rooms.filter((q) => !['porch', 'balcony'].includes(q.type));
  const at = { dx: Math.min(...inner.map((q) => q.x)), dy: Math.min(...inner.map((q) => q.y)) };
  const m = planMetrics(plan.floors[0], T, buildWalls, { ...at, register: 0.4 });
  const wr = report.floors[0].walls;
  APP.push({ name: r.name, deg: r.deg, q: r.q.score, used: !!(wr && !wr.lowQuality), m, rooms: plan.floors[0].rooms });
}
console.log('\n评审的图纸 → sheet.js（模拟的 AI 回答带错；墙 = buildWalls；±0.4 m 配准后比，±15 cm）');
console.log('  fixture               q     路      平移 m      | 墙 P  R    | 多墙（屋里 / 栏杆 / 外面）| 漏墙 m | 门 P  R   多 / 漏 | 推拉门 R | 窗 R');
for (const a of APP) {
  const m = a.m;
  const by = (w) => +m.inventedAll.pieces.filter((p) => p.what === w).reduce((v, p) => v + p.b - p.a, 0).toFixed(2);
  console.log(`  ${a.name.padEnd(21)} ${f2(a.q)}  ${a.used ? '墙优先' : '退回  '}  ${m.shift.map((v) => v.toFixed(2).padStart(5)).join(',')} | ${f2(m.wallP)} ${f2(m.wallR)} | ${String(by('inside')).padStart(5)} / ${String(by('rail')).padStart(4)} / ${String(by('outside')).padStart(4)}       | ${String(m.missing.m).padStart(5)} | ${f2(m.doorP)} ${f2(m.doorR)}  ${m.extraDoors.length} / ${m.missedDoors.length}     | ${f2(m.slider.recall)}     | ${f2(m.window.recall)}`);
  for (const d of m.extraDoors) console.log(`      多的门 ${d}`);
}
await test('接上 sheet.js：PDF / 手机放大截图都用墙优先；墙 P / R ≥ 0.95、屋里 / 栏杆上不多墙、不多门不漏门、推拉门（客厅 | 车廊、二楼阳台）都在、没有 < 0.6 m 的长条房间；整张手机截图退回 AI 房间框', () => {
  const bad = [];
  for (const a of APP) {
    if (a.deg === 'phone') {
      if (a.used) bad.push(`${a.name} 可信度 ${a.q} 却用了墙优先`);
      continue;
    }
    const m = a.m;
    if (!a.used) bad.push(`${a.name} 没用墙优先（可信度 ${a.q}）`);
    if (m.wallP < 0.95 || m.wallR < 0.95) bad.push(`${a.name} 墙 ${f2(m.wallP)} / ${f2(m.wallR)}`);
    const inside = m.inventedAll.pieces.filter((p) => p.what === 'inside' || p.what === 'rail' || p.what === 'open-arch');
    if (inside.length) bad.push(`${a.name} 多墙 ${inside.map((p) => `${p.axis}${p.c}[${p.a},${p.b}] ${p.what}`).join(' ')}`);
    if (m.extraDoors.length) bad.push(`${a.name} 多的门 ${m.extraDoors.join(' ')}`);
    if (m.missedDoors.length) bad.push(`${a.name} 漏的门 ${m.missedDoors.join(' ')}`);
    if (m.slider.recall < 1) bad.push(`${a.name} 推拉门 R ${f2(m.slider.recall)}`);
    const sliver = a.rooms.filter((q) => q.type !== 'stair' && Math.min(q.w, q.d) < 0.6);
    if (sliver.length) bad.push(`${a.name} 长条房间 ${sliver.map((q) => `${q.type} ${q.w}×${q.d}`).join(' ')}`);
  }
  assert.deepEqual(bad, []);
});

// ───────────── 9b. 楼梯不随比例跳（IMPORT 的 PDF 裁图 crop-sheet-gf.jpg，128.1 px/m；pdf.js 按长边 3072 px 渲染，px/m 随第一遍的框高变） ─────────────
{
  const jp = new JpegImage();
  jp.parse(new Uint8Array(readFileSync(path.join(ROOT, 'fixtures/ai/crop-sheet-gf.jpg'))));
  const rgb = jp.getData({ width: jp.width, height: jp.height, forceRGB: true, isSourcePDF: false });
  const N = jp.width * jp.height;
  const src = { width: jp.width, height: jp.height, data: new Uint8ClampedArray(N * 4) };
  for (let i = 0; i < N; i++) {
    src.data[i * 4] = rgb[i * 3];
    src.data[i * 4 + 1] = rgb[i * 3 + 1];
    src.data[i * 4 + 2] = rgb[i * 3 + 2];
    src.data[i * 4 + 3] = 255;
  }
  const PXM = 128.1;
  const ks = FULL ? [0.94, 0.96, 0.97, 0.98, 0.99, 1, 1.01, 1.02, 1.03, 1.04, 1.06] : [0.94, 0.97, 0.99, 1, 1.01, 1.03, 1.06];
  const got = ks.map((k) => {
    const img = k === 1 ? src : resize(src, k);
    const pxm = PXM * (img.width / src.width);
    const res = extractWalls(img, { pxPerM: pxm });
    return { k, pxm, q: res.quality.score, st: res.stairs.map((q) => [+(q.w / pxm).toFixed(2), +(q.h / pxm).toFixed(2)]) };
  });
  console.log(`\n楼梯 × 比例（crop-sheet-gf，${PXM} px/m × 0.94–1.06）：${got.map((g) => `${g.k}: ${JSON.stringify(g.st)}`).join(' · ')}`);
  await test('楼梯不随比例跳：crop-sheet-gf 缩放 0.94–1.06×（120–136 px/m）每次都只有一座 1.0 × 4.6 m 的楼梯', () => {
    const bad = got.filter((g) => !(g.st.length === 1 && Math.abs(g.st[0][0] - 1) < 0.15 && Math.abs(g.st[0][1] - 4.6) < 0.3)).map((g) => `${g.k}× (${g.pxm.toFixed(1)} px/m) ${JSON.stringify(g.st)}`);
    assert.deepEqual(bad, []);
  });
}

// ───────────── 10. 可信度校准（所有评审图纸的结果） + IMPORT 分辨率下的速度 ─────────────
await test('可信度 ≥ 0.6 的结果都靠得住（评审图纸 / 复印件 / 比例错 / 重采样 / 不给比例：墙 P ≥ 0.9、房间 IoU ≥ 0.55）', () => {
  const bad = SROWS.filter((r) => r.q.score >= 0.6 && (r.wall.precision < 0.9 || r.iou < 0.55)).map((r) => `${r.name} ${r.deg} 可信度 ${r.q.score} 墙 P ${f2(r.wall.precision)} IoU ${f2(r.iou)}`);
  assert.deepEqual(bad, []);
});
await test('速度：IMPORT 实际的裁图（矢量 PDF 2066 × 3072 = 6.3 MP，113 px/m）最快一次 ≤ 400 ms（机器很忙时放宽到 1.2 s，WALLS_PERF_STRICT=1 严格）', () => {
  const { T, img } = SH['semid-ff-pdf'];
  const ts = [];
  let res = null;
  for (let i = 0; i < 4; i++) {
    const t0 = performance.now();
    res = extractWalls(img, { pxPerM: T.pxPerM });
    ts.push(performance.now() - t0);
  }
  const best = Math.min(...ts);
  console.log(`    ${ts.map((t) => Math.round(t)).join(' / ')} ms · 各步 ${JSON.stringify(res.timing)}`);
  const limit = process.env.WALLS_PERF_STRICT === '1' ? 400 : 1200;
  assert.ok(best <= limit, `最快 ${Math.round(best)} ms > ${limit} ms`);
  if (best > 400) console.log(`    （最快 ${Math.round(best)} ms > 400 ms：机器忙？单独跑 WALLS_PERF_STRICT=1 node test/walls.test.mjs 复查）`);
});

console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
