// pdfExtract 图片摆放：方向（旋转 / 翻转）与裁切 → 编码时画成页面上看到的样子
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { placementOf, placementTransform, intersectBox } from '../src/import/pdfExtract.js';

const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const H = 540;
// 用户空间 ctm → 页面（左上原点）变换：vp = [1,0,0,-1,0,H]
const dev = ([a, b, c, d, e, f]) => [a, -b, c, -d, e, H - f];
const boxOf = (tm) => {
  const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => [tm[0] * u + tm[2] * v + tm[4], tm[1] * u + tm[3] * v + tm[5]]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

test('正放、没裁切：不改键名、原样编码', () => {
  const tm = dev([576, 0, 0, 389, 5, 59]);
  const box = boxOf(tm);
  const p = placementOf(tm, box, box);
  assert.equal(p.upright, true);
  assert.equal(p.cropped, false);
  assert.equal(p.suffix, '');
  const t = placementTransform(p, 1600, 1080, 2560);
  assert.ok(near(t.w / t.h, 576 / 389, 0.01));
  // 像素左上角 → 输出左上角，右下角 → 输出右下角
  assert.deepEqual(apply(t.matrix, 0, 0).map((v) => Math.round(v)), [0, 0]);
  assert.deepEqual(apply(t.matrix, 1600, 1080).map((v) => Math.round(v)), [t.w, t.h]);
});

test('WPS 旋转 90° 的色板（真实样稿第 4 页 AG275）：输出竖版，四角落在输出范围内', () => {
  // 内容流：0 -266.52 -123.72 -0 714.12 359.67 cm /IM41 Do
  const tm = dev([0, -266.52, -123.72, 0, 714.12, 359.67]);
  const box = boxOf(tm);
  assert.ok(near(box.w, 123.72) && near(box.h, 266.52));
  const p = placementOf(tm, box, box);
  assert.equal(p.upright, false);
  assert.match(p.suffix, /^@o/);
  const t = placementTransform(p, 2221, 1031, 900);
  assert.ok(t.h > t.w, '竖版');
  assert.equal(Math.max(t.w, t.h), 900);
  for (const [x, y] of [[0, 0], [2221, 0], [0, 1031], [2221, 1031]]) {
    const [ox, oy] = apply(t.matrix, x, y);
    assert.ok(ox >= -0.5 && ox <= t.w + 0.5 && oy >= -0.5 && oy <= t.h + 0.5, `(${x},${y}) → (${ox},${oy})`);
  }
});

test('水平翻转：键名不同，像素左边画到右边', () => {
  const tm = dev([-200, 0, 0, 100, 300, 300]);
  const box = boxOf(tm);
  const p = placementOf(tm, box, box);
  assert.equal(p.upright, false);
  const t = placementTransform(p, 400, 200);
  assert.ok(near(apply(t.matrix, 0, 0)[0], t.w, 0.5));
});

test('裁切（re W n）：只输出看得见的部分，键名带裁切比例', () => {
  // 1085.6 × 500 的图，只露出中间 760 × 440
  const tm = dev([1085.6, 0, 0, 500, -152.8, 20]);
  const box = boxOf(tm);
  const vis = intersectBox(box, { x: 10, y: 80, w: 760, h: 440 });
  const p = placementOf(tm, box, vis);
  assert.equal(p.cropped, true);
  assert.match(p.suffix, /^@c0\.15,0\.12,0\.15,0$/);
  const t = placementTransform(p, 2000, 921, 2560);
  assert.ok(near(t.w / t.h, 760 / 440, 0.01));
  // 原图左边 15% 落在输出左边之外
  const [x0] = apply(t.matrix, 0.15 * 2000, 0);
  assert.ok(near(x0, 0, 1));
});
