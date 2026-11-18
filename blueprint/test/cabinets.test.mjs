// 展厅播放 ·「毛坯 → 柜子一件件出现」（src/showroom/cabinets.js）
// 铁律：进度走完 = 原图逐像素相同；显露的只有原图 / 毛坯图本身的像素；AI 只给框、设计师核对过才播
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import {
  cabinetsOf, patchCabinets, playableCabinets, compareShell, boxLabels, analyseCabinets, cabinetFrame, pieceProgress,
  parseCabinetBoxes, rectQuad, validQuad, quadArea, MAX_PIECES,
} from '../src/showroom/cabinets.js';
import { PAPER } from '../src/showroom/sketch.js';

const W = 160;
const H = 90;

/** 毛坯：上浅（墙）下深（地），加一点纹理 */
function shellImg() {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;
      const floor = y > 62;
      const v = floor ? 150 : 228;
      d[p] = v + ((x * 7 + y * 3) % 5);
      d[p + 1] = v - 6;
      d[p + 2] = v - 14;
      d[p + 3] = 255;
    }
  }
  return d;
}

/** 效果图 = 毛坯 + 柜子（深木色矩形，柜门之间一道缝） */
function withCabinets(shell, rects) {
  const d = shell.slice();
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const p = (y * W + x) * 4;
        const gap = (x - x0) % 12 === 0;
        d[p] = gap ? 60 : 110;
        d[p + 1] = gap ? 45 : 78;
        d[p + 2] = gap ? 30 : 50;
      }
    }
  }
  return d;
}

const same = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
const px = (img, x, y) => {
  const p = (y * W + x) * 4;
  return [img[p], img[p + 1], img[p + 2]];
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('毛坯图比对：不一样的地方 = 柜子，连成一块 = 一组，按从左到右', () => {
  const shell = shellImg();
  const render = withCabinets(shell, [[100, 20, 140, 70], [10, 25, 50, 68]]);
  const r = compareShell(render, shell, W, H);
  assert.equal(r.ok, true, r.why);
  assert.equal(r.pieces.length, 2);
  // 左边那组先
  assert.ok(r.pieces[0].x1 < 60 && r.pieces[1].x0 > 90, JSON.stringify(r.pieces));
  // 柜子中间的像素都有组，墙上远处的没有
  assert.equal(r.labels[45 * W + 30], 0);
  assert.equal(r.labels[45 * W + 120], 1);
  assert.equal(r.labels[5 * W + 75], -1);
  // 柜门之间的缝不会把一组切开
  assert.ok(r.labels[45 * W + 22] === 0 && r.labels[45 * W + 34] === 0);
});

test('毛坯图比对：贴在一起的不同材质（橡木墙板 + 前面的胡桃木电视柜）拆成两组，墙板先、电视柜后', () => {
  const shell = shellImg();
  const render = shell.slice();
  const paint = (x0, y0, x1, y1, rgb) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const p = (y * W + x) * 4;
      render[p] = rgb[0] + ((x * 3) % 7);
      render[p + 1] = rgb[1];
      render[p + 2] = rgb[2];
    }
  };
  paint(40, 10, 130, 66, [196, 154, 108]); // 橡木墙板
  paint(55, 46, 115, 58, [80, 52, 34]); // 胡桃木电视柜（挂在墙板前面）
  const r = compareShell(render, shell, W, H);
  assert.equal(r.ok, true, r.why);
  assert.equal(r.pieces.length, 2, JSON.stringify(r.pieces));
  assert.equal(r.labels[20 * W + 85], 0); // 墙板先
  assert.equal(r.labels[52 * W + 85], 1); // 电视柜后
});

test('毛坯图比对：机位 / 曝光不一样、柜子没关掉 → 不用，并说明原因', () => {
  const shell = shellImg();
  const render = withCabinets(shell, [[100, 20, 140, 70]]);
  const dark = render.map((v, i) => (i % 4 === 3 ? 255 : v * 0.6));
  const r1 = compareShell(dark, shell, W, H);
  assert.equal(r1.ok, false);
  assert.match(r1.why, /同一个机位/);
  const r2 = compareShell(shell, shell, W, H);
  assert.equal(r2.ok, false);
  assert.match(r2.why, /没关掉/);
});

test('毛坯图比对：组太多 → 大的前 7 组 + 其余一组，最多 MAX_PIECES', () => {
  const shell = shellImg();
  const rects = [];
  for (let k = 0; k < 10; k++) rects.push([4 + k * 15, 20, 4 + k * 15 + 11, 60]);
  const r = compareShell(withCabinets(shell, rects), shell, W, H);
  assert.equal(r.ok, true, r.why);
  assert.ok(r.pieces.length <= MAX_PIECES);
});

for (const mode of ['shell', 'boxes']) {
  test(`合成（${mode === 'shell' ? 'A 毛坯图' : 'B 框'}）：进度走完 = 原图逐像素相同；一开始是白纸`, () => {
    const shell = shellImg();
    const render = withCabinets(shell, [[100, 20, 140, 70], [10, 25, 50, 68]]);
    const lab = mode === 'shell' ? compareShell(render, shell, W, H) : boxLabels([{ q: rectQuad(0.06, 0.27, 0.32, 0.76) }, { q: rectQuad(0.62, 0.22, 0.88, 0.78) }], W, H);
    const an = analyseCabinets(render, W, H, lab.labels, lab.pieces);
    const out = new Uint8ClampedArray(W * H * 4);
    const sh = mode === 'shell' ? shell : null;
    cabinetFrame(an, render, sh, { lineQ: 1, baseQ: 1, pieceQ: 1 }, out);
    assert.ok(same(out, render), '走完必须是原图');
    cabinetFrame(an, render, sh, { lineQ: 0, baseQ: 0, pieceQ: 0 }, out);
    assert.deepEqual(px(out, 5, 5), PAPER);
    assert.deepEqual(px(out, 120, 45), PAPER);
  });
}

test('合成 A：毛坯上完色、柜子还没出现时，柜子那里是毛坯图（真的墙），不是原图', () => {
  const shell = shellImg();
  const render = withCabinets(shell, [[100, 20, 140, 70]]);
  const lab = compareShell(render, shell, W, H);
  const an = analyseCabinets(render, W, H, lab.labels, lab.pieces);
  const out = new Uint8ClampedArray(W * H * 4);
  cabinetFrame(an, render, shell, { lineQ: 1, baseQ: 1, pieceQ: 0 }, out);
  // 柜门中间（没有线的地方）≈ 毛坯，离原图远
  const c = px(out, 118, 50);
  assert.ok(dist(c, px(shell, 118, 50)) < dist(c, px(render, 118, 50)), `${c}`);
  // 墙上 = 毛坯
  assert.ok(dist(px(out, 75, 5), px(shell, 75, 5)) < 2);
});

test('合成：柜子从下往上长出来；一组接一组', () => {
  const shell = shellImg();
  const render = withCabinets(shell, [[10, 20, 50, 70], [100, 20, 140, 70]]);
  const lab = compareShell(render, shell, W, H);
  const an = analyseCabinets(render, W, H, lab.labels, lab.pieces);
  const out = new Uint8ClampedArray(W * H * 4);
  // 第一组走到一半：底已经是原图，顶还不是；第二组还没开始
  const n = lab.pieces.length;
  let q = 0;
  while (pieceProgress(q, 0, n) < 0.5) q += 0.01;
  cabinetFrame(an, render, shell, { lineQ: 1, baseQ: 1, pieceQ: q }, out);
  const bottom = dist(px(out, 30, 66), px(render, 30, 66));
  const top = dist(px(out, 30, 23), px(render, 30, 23));
  assert.ok(bottom < top, `bottom ${bottom} top ${top}`);
  assert.ok(pieceProgress(q, 1, n) < pieceProgress(q, 0, n));
  for (let k = 0; k < n; k++) assert.equal(pieceProgress(1, k, n), 1);
  for (let k = 0; k < n; k++) assert.equal(pieceProgress(0, k, n), 0);
});

test('框（B）：按版面裁切换算；后面的框盖前面的', () => {
  const crop = { l: 0.5, t: 0, r: 0, b: 0 }; // 只看右半张
  const r = boxLabels([{ q: rectQuad(0.55, 0.1, 0.95, 0.9) }, { q: rectQuad(0.7, 0.4, 0.8, 0.6) }], W, H, crop);
  assert.equal(r.labels[45 * W + 30], 0); // 0.55 → 裁切后 0.1
  assert.equal(r.labels[45 * W + 80], 1); // 0.75 → 0.5，被第二个框盖住
  assert.equal(r.labels[45 * W + 5], -1);
});

test('AI 先框：整理回复（围栏、颠倒、太小、整张图都丢掉），从左到右排，标 by ai', () => {
  const reply = '```json\n[{"box_2d":[200,600,800,900],"label":"wardrobe"},{"box_2d":[700,100,300,400],"label":"tv cabinet"},{"box_2d":[0,0,5,5]},{"box_2d":[0,0,1000,1000]},{"nope":1}]\n```';
  const { boxes, notes } = parseCabinetBoxes(reply);
  assert.equal(boxes.length, 2);
  assert.equal(boxes[0].label, 'tv cabinet');
  assert.deepEqual(boxes[0].q.map((v) => +v.toFixed(3)), rectQuad(0.1, 0.3, 0.4, 0.7));
  assert.ok(boxes.every((b) => b.by === 'ai' && b.id && validQuad(b.q)));
  assert.equal(notes.length, 2);
  assert.deepEqual(parseCabinetBoxes('对不起，我看不出来').boxes, []);
  assert.equal(quadArea(rectQuad(0, 0, 0.5, 0.5)), 0.25);
});

test('能不能播：要勾、要对得上这张效果图；有毛坯图就播 A；框要核对过才播', () => {
  let s = { id: 'v', kind: 'view', image: 'asset:r1' };
  assert.equal(playableCabinets(s).mode, null);
  s = patchCabinets(s, { on: true });
  assert.match(playableCabinets(s).why, /还没有毛坯图/);
  s = patchCabinets(s, { boxes: [{ id: 'a', q: rectQuad(0.1, 0.1, 0.4, 0.8), by: 'ai' }] });
  assert.match(playableCabinets(s).why, /核对/);
  s = patchCabinets(s, { checked: true });
  assert.equal(playableCabinets(s).mode, 'boxes');
  s = patchCabinets(s, { shell: 'asset:shell' });
  assert.equal(playableCabinets(s).mode, 'shell');
  // 换了效果图 → 失效
  const swapped = { ...s, image: 'asset:r2' };
  assert.equal(cabinetsOf(swapped), null);
  assert.match(playableCabinets(swapped).why, /换过/);
  assert.equal(patchCabinets(s, null).cabinets, null);
});

// ---------------------------------------------------------------------------
// 接进展厅播放（timeline / motion）
// ---------------------------------------------------------------------------
import { renderDeck, exportableSlides } from '../src/engine/deck.js';
import { buildStops, transitionKind, transitionWeight } from '../src/showroom/timeline.js';
import { layerMotion, cabinetProgress } from '../src/showroom/motion.js';

const SIZES = { '/living.jpg': [2400, 1350], '/kitchen.jpg': [2400, 1350], '/night.jpg': [2400, 1350], '/m.jpg': [600, 600] };
const meta = (src) => (SIZES[src] ? { w: SIZES[src][0], h: SIZES[src][1] } : null);
const ready = { on: true, forImage: '/kitchen.jpg', shell: '/kitchen-shell.jpg', boxes: [], checked: false };

function showProject(cabinets) {
  const view = (id, image, room, subtitle, extra = {}) => ({
    id, kind: 'view', enabled: true, floorId: 'f1', layout: 'full', image, room, subtitle, materials: [{ role: '柜体', materialId: 'm1' }], notes: [], ...extra,
  });
  return {
    id: 'p-cab', name: 'Cab', version: 1,
    info: { client: 'Mr Lau', location: 'Muar', date: '2026 · 08', lang: 'zh', team: [] },
    floors: [{ id: 'f1', zh: '一楼', en: 'GROUND FLOOR', image: null }],
    materials: [{ id: 'm1', name: '浅川橡', code: 'AG273', image: '/m.jpg' }],
    slides: [
      { id: 's-f1', kind: 'floor', floorId: 'f1', enabled: true },
      view('v-living', '/living.jpg', '客厅', '电视墙 · 白天'),
      view('v-night', '/night.jpg', '客厅', '电视墙 · 夜晚', { cabinets: { ...ready, forImage: '/night.jpg' } }),
      view('v-kitchen', '/kitchen.jpg', '厨房', '岛台', { cabinets }),
    ],
    translations: {},
  };
}
const stopsOf = (p) => buildStops(exportableSlides(renderDeck(p, { meta })), p);

test('展厅播放：勾了、有毛坯图的效果图页 → 换页进来是「柜子一件件出现」，滑得最慢', () => {
  const stops = stopsOf(showProject(ready));
  const k = stops.findIndex((s) => s.slide?.id === 'v-kitchen');
  assert.equal(stops[k].cabinets.mode, 'shell');
  assert.equal(transitionKind(stops, k - 1, k), 'cabinets');
  assert.ok(transitionWeight('cabinets') > transitionWeight('sketch'));
  // 白天 → 夜晚是交叉淡化：夜晚那张勾了也不播
  const n = stops.findIndex((s) => s.slide?.id === 'v-night');
  assert.equal(transitionKind(stops, n - 1, n), 'same');
  // 没勾 / 框没核对 / 换过图 → 照旧「从无到有」
  for (const c of [{ ...ready, on: false }, { ...ready, shell: null, boxes: [{ id: 'a', q: rectQuad(0.1, 0.1, 0.5, 0.9), by: 'ai' }] }, { ...ready, forImage: '/old.jpg' }]) {
    const st = stopsOf(showProject(c));
    const j = st.findIndex((s) => s.slide?.id === 'v-kitchen');
    assert.equal(st[j].cabinets, null);
    assert.equal(transitionKind(st, j - 1, j), 'sketch');
  }
});

test('展厅播放：柜子一件件出现 —— 停点原样；线稿 → 毛坯 → 柜子依次；字最后才进来', () => {
  const stops = stopsOf(showProject(ready));
  const k = stops.findIndex((s) => s.slide?.id === 'v-kitchen');
  const els = stops[k].page.els;
  const end = layerMotion('b', 'cabinets', 1, els);
  els.forEach((el, i) => assert.deepEqual(end.el(el, i), { opacity: 1, ty: 0, scale: 1 }));
  assert.equal(end.cab, null);
  const mid = layerMotion('b', 'cabinets', 0.6, els);
  assert.ok(mid.cab && mid.cab.lineQ === 1 && mid.cab.baseQ === 1 && mid.cab.pieceQ > 0 && mid.cab.pieceQ < 1);
  const ti = els.findIndex((el) => el.t === 'text');
  assert.equal(mid.el(els[ti], ti).opacity, 0);
  const a = cabinetProgress(0.2);
  const b = cabinetProgress(0.4);
  assert.ok(a.lineQ > 0 && a.pieceQ === 0 && b.baseQ > a.baseQ);
  assert.deepEqual(cabinetProgress(1), { lineQ: 1, baseQ: 1, pieceQ: 1 });
});
