// AI 识图：把 AI 的墙线段贴到图上真正的墙（合成的墙）+ 去黑边 / 白边
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { snapSegment, trimBorders, darkGrid } from '../src/planner/wallSnap.js';

// 1200 × 800 的合成户型：外墙 8 px（96–103 / 1096–1103 / 696–703），中间隔墙 x 596–603，隔墙上 y 400–480 是门口
function plan2rooms({ doubleTop = false } = {}) {
  const w = 1200, h = 800, data = new Uint8Array(w * h);
  const fill = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data[y * w + x] = 1; };
  if (doubleTop) { fill(96, 96, 1103, 97); fill(96, 102, 1103, 103); } else fill(96, 96, 1103, 103);
  fill(96, 696, 1103, 703);
  fill(96, 96, 103, 703); fill(1096, 96, 1103, 703);
  fill(596, 96, 603, 399); fill(596, 481, 603, 703);
  return { w, h, data };
}
const BED = [104, 104, 596, 696];

test('wall snap: AI line 16 px inside the room → moved onto the top wall\'s inner face (y 104)', () => {
  const r = snapSegment(plan2rooms(), [110, 120, 350, 120], BED);
  assert.equal(r.snapped, true);
  assert.deepEqual(r.seg, [110, 104, 350, 104]);
  assert.equal(r.moved, 16);
});

test('wall snap: AI line on the outside of the building → still the room side of the wall', () => {
  const r = snapSegment(plan2rooms(), [110, 90, 350, 90], BED);
  assert.equal(r.snapped, true);
  assert.deepEqual(r.seg, [110, 104, 350, 104]);
});

test('wall snap: a slightly slanted line (5°) is straightened; direction kept', () => {
  const r = snapSegment(plan2rooms(), [350, 125, 110, 104], BED);
  assert.equal(r.snapped, true);
  assert.deepEqual(r.seg, [350, 104, 110, 104]);
});

test('wall snap: an end past the room corner is cut at the side wall', () => {
  const r = snapSegment(plan2rooms(), [40, 112, 350, 112], BED);
  assert.equal(r.snapped, true);
  assert.equal(r.seg[1], 104);
  assert.ok(r.seg[0] >= 104 && r.seg[0] <= 106, String(r.seg[0]));
  assert.equal(r.seg[2], 350);
});

test('wall snap: a wardrobe stops at a door opening; a kitchen does not cut at gaps', () => {
  const ward = snapSegment(plan2rooms(), [585, 150, 585, 450], BED);
  assert.equal(ward.snapped, true);
  assert.equal(ward.seg[0], 595); // 隔墙左边那一面
  assert.ok(ward.seg[3] <= 400 && ward.seg[3] >= 395, String(ward.seg[3]));
  const kit = snapSegment(plan2rooms(), [585, 150, 585, 450], BED, { cutGaps: false });
  assert.equal(kit.seg[3], 450);
});

test('wall snap: the room to the right of the partition gets the right-hand face', () => {
  const r = snapSegment(plan2rooms(), [615, 150, 615, 380], [604, 104, 1096, 696]);
  assert.equal(r.snapped, true);
  assert.equal(r.seg[0], 604);
});

test('wall snap: double-line walls → the inner line\'s face', () => {
  const r = snapSegment(plan2rooms({ doubleTop: true }), [110, 115, 350, 115], BED);
  assert.equal(r.snapped, true);
  assert.equal(r.seg[1], 104);
});

test('wall snap: no wall nearby / slanted line → left as the AI gave it', () => {
  const g = plan2rooms();
  const r = snapSegment(g, [200, 300, 400, 300], BED);
  assert.equal(r.snapped, false);
  assert.deepEqual(r.seg, [200, 300, 400, 300]);
  assert.equal(snapSegment(g, [110, 110, 300, 300], BED).snapped, false);
});

test('darkGrid: dark / coloured walls count, light grey fill does not', () => {
  const px = new Uint8ClampedArray([0, 0, 0, 255, 58, 138, 58, 255, 200, 200, 200, 255, 255, 255, 255, 0]);
  assert.deepEqual([...darkGrid(px, 4, 1).data], [1, 1, 0, 0]);
});

test('trimBorders: phone screenshot black bars + white page margin are trimmed', () => {
  const w = 400, h = 300, g = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x < 30 || x >= 370) g[y * w + x] = 0; // 黑边
    else if (x >= 80 && x < 320 && y >= 60 && y < 240 && (x % 17 === 0 || y % 23 === 0)) g[y * w + x] = 20; // 户型图的线
  }
  const [x0, y0, x1, y1] = trimBorders(g, w, h);
  assert.ok(x0 >= 75 && x0 <= 85 && x1 >= 314 && x1 <= 320, `${x0} ${x1}`);
  assert.ok(y0 >= 55 && y0 <= 62 && y1 >= 230 && y1 <= 240, `${y0} ${y1}`);
  // 没有边 → 整张
  const full = new Uint8Array(100 * 100).map((_, i) => (i % 7 ? 255 : 0));
  assert.deepEqual(trimBorders(full, 100, 100), [0, 0, 99, 99]);
});

test('wall snap: a thin furniture line touching the wall (bed outline) is not taken for a room corner', () => {
  const g = plan2rooms();
  for (let y = 104; y <= 300; y++) g.data[y * g.w + 250] = 1; // 1 px 的床边线，从上墙往下
  const r = snapSegment(g, [110, 115, 350, 115], BED);
  assert.deepEqual(r.seg, [110, 104, 350, 104]);
});
