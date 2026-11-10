// 3D 户型图（程序按坐标画）的纯逻辑测试：墙体推导、门窗、贴墙吸附、场景清单的顺序和投影。画布像素不在这里测。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from './harness.mjs';
import { KINDS, deriveWalls, openingRect, edgeFor, snapToWall, rectPoly, chairPolys, clipPolyToBox, contentBox, roomRects, inventoryLines } from '../src/plan3d/geometry.js';
import { buildScene, recommendCorner, projectPoint, planeMatrix, CORNERS, polyArea, polyDist, hull } from '../src/plan3d/scene.js';
import { reskinPromptText } from '../src/ai/prompts.js';
import { paletteOf, PALETTES } from '../src/plan3d/palette.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(path.join(dir, '../src/plan3d', f), 'utf8');
const STUDY = JSON.parse(src('sample-study-room.json'));

/** 一个 4m x 3m 的方盒子房间（1 像素 = 10 毫米），用来测顺序 */
const box = (extra = {}) => ({
  mmPerPx: 10,
  wallT: 20,
  source: { w: 600, h: 500 },
  rooms: [{ name: 'ROOM', rects: [[100, 100, 500, 400]] }],
  openings: [],
  items: [],
  ...extra,
});
const inBox = (b, x, y) => x > b[0] && x < b[2] && y > b[1] && y < b[3];
const solid = (scene, id) => scene.solids.find((s) => s.id === id);
const order = (scene, id) => scene.solids.findIndex((s) => s.id === id);

test('deriveWalls：墙 = 房间外扩一个墙厚再减去房间；格子不重叠、不落在房间里', () => {
  const cells = deriveWalls(box());
  assert.ok(cells.length >= 8, '四条边 + 四个角');
  const rects = roomRects(box());
  let area = 0;
  for (const c of cells) {
    const cx = (c.box[0] + c.box[2]) / 2;
    const cy = (c.box[1] + c.box[3]) / 2;
    assert.ok(!inBox(rects[0], cx, cy), '墙不在房间里');
    assert.ok(inBox([80, 80, 520, 420], cx, cy), '墙在外扩范围内');
    area += (c.box[2] - c.box[0]) * (c.box[3] - c.box[1]);
  }
  assert.equal(area, 440 * 340 - 400 * 300, '面积正好是一圈墙');
  assert.ok(cells.every((c) => c.type === 'wall'));
  // 朝房间的那条边露在外面（要画内侧面），相邻的墙格之间不露
  const top = cells.find((c) => c.box[1] === 80 && c.box[0] === 100);
  assert.equal(top.open.bottom, true);
  assert.equal(top.open.top, true);
  assert.equal(top.open.left, false, '和左上角的墙格连在一起');
});

test('deriveWalls：L 形房间（主矩形 + 凹位）的墙沿着并集的外轮廓走', () => {
  const cells = deriveWalls(STUDY);
  const hit = (x, y) => cells.find((c) => inBox(c.box, x, y));
  assert.ok(hit(170, 250), '凹位左边有墙');
  assert.ok(hit(240, 378), '凹位下面有墙');
  assert.ok(hit(292, 500), '主房间左墙');
  assert.ok(!hit(250, 250), '凹位里面是地板，不是墙');
  assert.ok(!hit(305 + 5, 250), '凹位和主房间之间没有墙');
  assert.equal(hit(500, 120).type, 'window', '窗切在上墙里');
  assert.equal(hit(292, 800).type, 'door', '门洞切在左墙里');
  assert.equal(hit(400, 870).type, 'hidden-door');
  assert.equal(hit(900, 120).type, 'wall');
});

test('openingRect / edgeFor：门窗贴在那一侧最外面的墙边上；贴不到 = null', () => {
  const rects = roomRects(STUDY);
  assert.equal(edgeFor(rects, 'left', 732, 856), 305, '门在主房间左墙（那一段没有凹位）');
  assert.equal(edgeFor(rects, 'left', 150, 300), 186, '凹位那一段的左墙更靠外');
  assert.deepEqual(openingRect(rects, { side: 'top', a: 309, b: 697 }, 26), [309, 107, 697, 133]);
  assert.deepEqual(openingRect(rects, { side: 'left', a: 856, b: 732 }, 26), [279, 732, 305, 856], 'a、b 写反也行');
  assert.deepEqual(openingRect(rects, { side: 'bottom', a: 305, b: 458 }, 26), [305, 856, 458, 882]);
  assert.deepEqual(openingRect(rects, { side: 'right', a: 200, b: 300 }, 26), [1070, 200, 1096, 300]);
  assert.equal(openingRect(rects, { side: 'top', a: 2000, b: 2100 }, 26), null, '跨度不在任何房间上');
  assert.equal(openingRect(rects, { side: 'top', a: 400, b: 400 }, 26), null, '宽度为 0');
});

test('snapToWall：贴墙的东西离墙面很近就拉到墙面；离得远 / 没说贴哪面墙就不动', () => {
  const desk = STUDY.items.find((it) => it.id === 'desk-left');
  assert.deepEqual(snapToWall(STUDY, desk, 16), [305, 338, 408, 641], '左边从 316 拉到墙面 305');
  assert.deepEqual(snapToWall(STUDY, desk, 5), desk.box, '超过容差不动');
  assert.deepEqual(snapToWall(STUDY, { box: [400, 400, 450, 450] }, 16), [400, 400, 450, 450]);
  assert.deepEqual(snapToWall(STUDY, { box: [1005, 668, 1069, 855], against: 'right' }, 16), [1005, 668, 1070, 855]);
  assert.deepEqual(desk.box, [316, 338, 408, 641], '不改原数据');
});

test('rectPoly / chairPolys：顺时针；圆角只加在指定的角；椅背在远离桌子的一侧', () => {
  assert.deepEqual(rectPoly([0, 0, 10, 20]), [[0, 0], [10, 0], [10, 20], [0, 20]]);
  assert.ok(polyArea(rectPoly([0, 0, 10, 20])) > 0, '屏幕坐标里顺时针 = 面积为正');
  const rounded = rectPoly([0, 0, 100, 60], { tr: 20 }, 4);
  assert.equal(rounded.length, 3 + 5, '三个直角 + 一个 5 点的圆角');
  assert.ok(rounded.every((p) => p[0] >= -1e-9 && p[0] <= 100 + 1e-9 && p[1] >= -1e-9 && p[1] <= 60 + 1e-9), '不出框');
  assert.ok(Math.abs(polyArea(rectPoly([0, 0, 100, 60], { tl: 999, tr: 999, br: 999, bl: 999 }, 16)) - (40 * 60 + Math.PI * 900)) < 12, '圆角半径夹到短边的一半');

  const left = chairPolys([418, 386, 494, 467], 'left'); // 桌子在左边
  const backXs = left.back.map((p) => p[0]);
  assert.ok(Math.min(...backXs) > 470, '椅背在右侧');
  assert.ok(left.seat.some((p) => p[0] === 418 && p[1] === 386) && left.seat.some((p) => p[0] === 418 && p[1] === 467), '朝桌子的一边是平的');
  const down = chairPolys([611, 686, 692, 763], 'bottom');
  assert.ok(Math.max(...down.back.map((p) => p[1])) < 710, '桌子在下面 → 椅背在上侧');
  assert.deepEqual(clipPolyToBox([[0, 0], [10, 0], [10, 10], [0, 10]], [5, -5, 20, 20]), [[5, 0], [10, 0], [10, 10], [5, 10]]);
});

test('buildScene 正俯视：画框、换算、叠图位置；矮的先画，半透明的吊柜最后画', () => {
  const scene = buildScene(STUDY, { view: 'top' });
  assert.equal(Math.max(scene.w, scene.h), 2400);
  assert.equal(scene.view, 'top');
  const c = contentBox(STUDY);
  assert.ok(Math.abs(scene.w / scene.h - (c[2] - c[0] + 2 * 0.09 * (c[2] - c[0])) / (c[3] - c[1] + 2 * 0.09 * (c[2] - c[0]))) < 0.01, '比例跟着模型走');
  // 图纸上的点 → 画布：主房间左上角
  const X = (x) => (x + scene.ox) * scene.s;
  const Y = (y) => (y + scene.oy) * scene.s;
  assert.ok(Math.abs(scene.floors[0][0] - X(305)) < 1e-6 && Math.abs(scene.floors[0][1] - Y(133)) < 1e-6);
  assert.deepEqual(scene.plan.map(Math.round), [X(0), Y(0), X(1856), Y(1044)].map(Math.round), '原图在画布上的位置');
  // 正俯视没有侧面
  assert.ok(scene.solids.every((s) => s.faces.length === 1 && s.faces[0].type === 'top'));
  const nonGhost = scene.solids.filter((s) => !s.ghost);
  for (let i = 1; i < nonGhost.length; i++) assert.ok(nonGhost[i - 1].z1 <= nonGhost[i].z1 + 1e-9, '按高度从矮到高');
  const ghosts = scene.solids.filter((s) => s.ghost);
  assert.deepEqual(ghosts.map((s) => s.id).sort(), ['hung-bottom', 'hung-left']);
  assert.ok(scene.solids.slice(-2).every((s) => s.ghost), '吊柜最后画');
  assert.equal(buildScene(STUDY, { view: 'top', hung: 'hide' }).solids.filter((s) => s.kind === 'hung').length, 0);
  assert.equal(buildScene(STUDY, { ratio: 16 / 9, longEdge: 1920 }).h, 1080, '可以指定输出比例');
});

test('buildScene：高柜在墙的切面高度切平并标记 tall；柱子和墙一样高；默认高度按种类', () => {
  const scene = buildScene(STUDY, { view: 'top', wallMm: 1100 });
  assert.equal(solid(scene, 'book').zMm, 1100);
  assert.equal(solid(scene, 'book').tall, true);
  assert.equal(solid(scene, 'glass').tall, true);
  assert.equal(solid(scene, 'storage-bottom').zMm, KINDS.low.z1);
  assert.equal(solid(scene, 'storage-bottom').tall, false);
  assert.equal(solid(scene, 'desk-left').zMm, KINDS.desk.z1);
  assert.equal(solid(scene, 'col-top').zMm, 1100);
  assert.equal(solid(scene, 'chair-1-back').zMm, KINDS.chair.back);
  assert.ok(Math.abs(solid(scene, 'desk-left').z1 - 750 * scene.zs) < 1e-9, '毫米 → 画布像素');
  assert.equal(solid(scene, 'shelf-niche').unsure, true);
});

test('buildScene 立体俯视：地面上的脚印不动（仍和图纸重合），顶面往外倒，只画朝向镜头的侧面', () => {
  const top = buildScene(STUDY, { view: 'top' });
  const persp = buildScene(STUDY, { view: 'persp' });
  assert.equal(persp.w, top.w);
  for (const s of top.solids) {
    const p = solid(persp, s.id);
    assert.deepEqual(p.base, s.base, `${s.id} 的脚印不变`);
  }
  assert.deepEqual(persp.floors, top.floors);
  const book = solid(persp, 'book'); // 在右下角
  const topFace = book.faces[book.faces.length - 1];
  assert.equal(topFace.type, 'top');
  book.base.forEach((b, i) => {
    assert.ok(topFace.pts[i][0] > b[0] && topFace.pts[i][1] > b[1], '右下角的柜子顶面往右下倒');
  });
  const k = persp.camH / (persp.camH - book.z1);
  assert.ok(Math.abs(topFace.pts[0][0] - (persp.vp[0] + (book.base[0][0] - persp.vp[0]) * k)) < 1e-6, 'P = vp + (p - vp) * H / (H - z)');
  for (const s of persp.solids) {
    for (const f of s.faces) {
      if (f.type !== 'side') continue;
      const mx = (f.pts[0][0] + f.pts[1][0]) / 2;
      const my = (f.pts[0][1] + f.pts[1][1]) / 2;
      assert.ok((persp.vp[0] - mx) * f.nx + (persp.vp[1] - my) * f.ny > 0, `${s.id} 的侧面朝向镜头`);
    }
  }
  assert.ok(book.faces.some((f) => f.type === 'side' && f.nx < -0.9), '看得到书柜朝房间的正面');
});

test('buildScene 立体俯视的顺序：墙先画、靠墙的柜子后画；桌前的椅子在桌子之后画；相邻的墙格之间不画侧面', () => {
  const geo = box({
    items: [
      { id: 'cab', kind: 'low', box: [300, 340, 420, 400], against: 'bottom' }, // 靠下墙、偏右的矮柜
      { id: 'desk', kind: 'desk', box: [100, 180, 160, 320], against: 'left' },
      { id: 'chair', kind: 'chair', box: [170, 220, 220, 280], facing: 'left' },
      { id: 'hung', kind: 'hung', box: [100, 180, 130, 320], against: 'left' },
    ],
  });
  const scene = buildScene(geo, { view: 'persp' });
  const wallsBelow = scene.solids.filter((s) => s.kind === 'wall' && Math.min(...s.base.map((p) => p[1])) >= (400 + scene.oy) * scene.s - 1e-6);
  assert.ok(wallsBelow.length > 0);
  wallsBelow.forEach((w) => assert.ok(order(scene, w.id) < order(scene, 'cab'), '下墙在矮柜之前画（柜顶盖住墙内侧面的下半截）'));
  assert.ok(order(scene, 'desk') < order(scene, 'chair'), '椅子比桌子靠近镜头，后画');
  assert.ok(order(scene, 'chair') < order(scene, 'chair-back'), '同一把椅子：座面先、靠背后');
  assert.equal(scene.solids[scene.solids.length - 1].id, 'hung', '半透明的吊柜最后');
  // 一条直墙被网格切成几格：格子之间的面不画
  const sideCount = scene.solids.filter((s) => s.kind === 'wall').reduce((n, s) => n + s.faces.filter((f) => f.type === 'side').length, 0);
  assert.equal(sideCount, 4, '方盒子房间只看得到四条内侧面');
});

test('buildScene：门窗 —— 窗 = 窗台 + 玻璃；暗门 = 和墙一样高的饰面板；门洞 = 地上一条门槛、墙上留空', () => {
  const scene = buildScene(STUDY, { view: 'persp' });
  const kinds = scene.solids.map((s) => s.kind);
  assert.equal(kinds.filter((k) => k === 'window').length, 1);
  assert.equal(kinds.filter((k) => k === 'sill').length, 1);
  assert.equal(kinds.filter((k) => k === 'hidden-door').length, 1);
  const hidden = scene.solids.find((s) => s.kind === 'hidden-door');
  assert.equal(hidden.zMm, 1100);
  assert.equal(hidden.mat, 'panel');
  assert.deepEqual(scene.patches.map((p) => p.kind), ['threshold']);
  const X = (x) => (x + scene.ox) * scene.s;
  const glass = scene.solids.find((s) => s.kind === 'window');
  assert.ok(Math.abs(Math.min(...glass.base.map((p) => p[0])) - X(309)) < 1e-6 && Math.abs(Math.max(...glass.base.map((p) => p[0])) - X(697)) < 1e-6, '玻璃的跨度 = 图纸上的窗');
  // 门洞那一段没有墙
  const doorCells = scene.solids.filter((s) => s.kind === 'wall' && s.base.every((p) => p[1] >= (732 + scene.oy) * scene.s - 1e-6 && p[1] <= (856 + scene.oy) * scene.s + 1e-6 && p[0] < X(305) + 1e-6));
  assert.equal(doorCells.length, 0);
});

test('影子：每个实体一块，沿光线方向、按高度拉长；吊柜不投影', () => {
  const scene = buildScene(STUDY, { view: 'top', light: [0.1, 0.2] });
  const book = solid(scene, 'book');
  const sh = scene.shadows.find((s) => s.id === 'book');
  const maxX = Math.max(...book.base.map((p) => p[0]));
  const maxY = Math.max(...book.base.map((p) => p[1]));
  assert.ok(Math.abs(Math.max(...sh.pts.map((p) => p[0])) - (maxX + 0.1 * book.z1)) < 1e-6);
  assert.ok(Math.abs(Math.max(...sh.pts.map((p) => p[1])) - (maxY + 0.2 * book.z1)) < 1e-6);
  assert.ok(!scene.shadows.some((s) => s.id.startsWith('hung')));
  assert.equal(hull([[0, 0], [2, 0], [1, 1], [2, 2], [0, 2]]).length, 4, '凸包去掉内部的点');
  assert.equal(polyDist([5, 5], [[0, 0], [10, 0], [10, 10], [0, 10]]), 0, '点在里面 = 0');
  assert.equal(polyDist([15, 5], [[0, 0], [10, 0], [10, 10], [0, 10]]), 5);
});

test('斜角立体：所有东西都在画框里；地面是一个仿射变换；顶面 = 脚印套上那个高度的变换', () => {
  for (const corner of Object.keys(CORNERS)) {
    const scene = buildScene(STUDY, { view: 'iso', corner });
    assert.equal(scene.view, 'iso');
    assert.equal(scene.corner, corner);
    assert.equal(Math.max(scene.w, scene.h), 2400);
    assert.equal(scene.plan, null, '斜角下不提供叠图位置');
    for (const sd of scene.solids) {
      for (const f of sd.faces) for (const p of f.pts) assert.ok(p[0] > 0 && p[0] < scene.w && p[1] > 0 && p[1] < scene.h, `${corner} ${sd.id} 在画框里`);
      const top = sd.faces[sd.faces.length - 1];
      const m = sd.tm;
      sd.base.forEach((b, i) => {
        assert.ok(Math.abs(top.pts[i][0] - (m[0] * b[0] + m[2] * b[1] + m[4])) < 1e-6 && Math.abs(top.pts[i][1] - (m[1] * b[0] + m[3] * b[1] + m[5])) < 1e-6, `${sd.id} 顶面`);
      });
      assert.deepEqual(sd.foot, sd.base.map((b) => projectPoint(scene.pj, b, 0)));
    }
    assert.deepEqual(planeMatrix(scene.pj, 0), scene.fm);
    assert.ok(Math.abs(planeMatrix(scene.pj, 100)[5] - (scene.fm[5] - 100 * scene.pj.kz)) < 1e-9, '越高越往画面上方');
  }
  // 镜头在右下角：图纸右下角的点落在画面最下面，左上角的点落在最上面
  const se = buildScene(STUDY, { view: 'iso', corner: 'se' });
  const at = (x, y) => projectPoint(se.pj, [x * se.s, y * se.s], 0);
  assert.ok(at(1070, 856)[1] > at(305, 856)[1] && at(1070, 856)[1] > at(1070, 133)[1] && at(305, 133)[1] < at(305, 856)[1]);
  assert.ok(Math.abs(at(1070, 133)[0] - at(305, 856)[0]) > 100, '另外两个角一左一右');
});

test('斜角立体：只画朝镜头的侧面；靠近镜头的东西后画；墙默认矮、柜子在 1.1 米切开', () => {
  const scene = buildScene(STUDY, { view: 'iso', corner: 'se' });
  assert.equal(Math.round(solid(scene, 'wall-0').zMm), 650);
  assert.equal(solid(scene, 'book').zMm, 1100);
  assert.equal(solid(scene, 'book').tall, true);
  for (const sd of scene.solids) for (const f of sd.faces) if (f.type === 'side') assert.ok(f.nx + f.ny > 0, `${sd.id}：镜头在右下，只看得到朝右和朝下的面`);
  assert.ok(solid(scene, 'book').faces.filter((f) => f.type === 'side').length === 2);
  // 书柜在右下角（靠近镜头），左上角凹位里的储物柜离镜头最远
  assert.ok(order(scene, 'storage-niche') < order(scene, 'book'));
  assert.ok(order(scene, 'desk-left') < order(scene, 'chair-1'), '椅子在书桌右边，更靠近镜头');
  assert.ok(order(scene, 'chair-1') < order(scene, 'chair-1-back'));
  assert.ok(order(scene, 'desk-bottom') < order(scene, 'hung-bottom'), '吊柜的轮廓画在书桌之后');
  // 换成左上角看，顺序反过来
  const nw = buildScene(STUDY, { view: 'iso', corner: 'nw' });
  assert.ok(order(nw, 'book') < order(nw, 'storage-niche'));
  for (const sd of nw.solids) for (const f of sd.faces) if (f.type === 'side') assert.ok(f.nx + f.ny < 0);
  assert.equal(solid(buildScene(STUDY, { view: 'iso', wallMm: 400 }), 'wall-0').zMm, 400);
});

test('斜角立体 · 柜子全高：高柜不切、吊柜是悬在墙上的实体；切开时吊柜只是轮廓', () => {
  const full = buildScene(STUDY, { view: 'iso', corner: 'nw', cutMm: Infinity, hung: 'solid' });
  assert.equal(solid(full, 'book').zMm, KINDS.tall.z1);
  assert.equal(solid(full, 'book').tall, false);
  const hung = solid(full, 'hung-left');
  assert.equal(hung.ghost, false);
  assert.ok(Math.abs(hung.z0 - KINDS.hung.z0 * full.zs) < 1e-9 && hung.z1 > hung.z0, '离地');
  assert.ok(hung.faces.some((f) => f.type === 'side'));
  assert.ok(order(full, 'desk-left') < order(full, 'hung-left'));
  const cut = buildScene(STUDY, { view: 'iso', corner: 'nw', hung: 'solid' });
  assert.equal(solid(cut, 'hung-left').ghost, true, '切面比吊柜低：画不出实体，退回轮廓');
  const shadow = full.shadows.find((sh) => sh.id === 'hung-left');
  assert.ok(shadow && shadow.pts.length >= 4);
});

test('recommendCorner：镜头一侧的两面墙上柜子越少越好', () => {
  assert.equal(recommendCorner(STUDY), 'nw', '上墙只有窗，左墙比右墙轻');
  const g = box({ items: [{ id: 'a', kind: 'tall', box: [100, 100, 500, 140], against: 'top' }, { id: 'b', kind: 'tall', box: [100, 100, 140, 400], against: 'left' }] });
  assert.equal(recommendCorner(g), 'se');
  assert.equal(recommendCorner(box()), 'se', '没有柜子：默认右下');
});

test('AI 美化的提示词：只换材质和光影、位置不动、物件清单、参考图只取材质', () => {
  const inv = inventoryLines(STUDY);
  assert.ok(inv.includes('4 x chair') && inv.includes('1 x glass-door display cabinet (GLASS DOOR CABINET)') && inv.includes('1 x window'));
  assert.ok(inv.includes('2 x full-height cabinet (STORAGE CABINET, BOOK CABINET)'), '同名的柜名不重复');
  const p = reskinPromptText({ inventory: inv, refCount: 2, view: 'iso' });
  assert.ok(/MATERIAL AND LIGHTING pass only/.test(p) && /Do not move, rotate, resize, merge or split anything/.test(p));
  assert.ok(/must line up with image 1/.test(p) && /Do not add anything/.test(p) && /No text/.test(p));
  assert.ok(p.includes('The scene contains exactly: ') && p.includes('4 x chair'));
  assert.ok(p.includes('images 2–3') && /ONLY for materials and colours/.test(p));
  assert.ok(/angled axonometric/.test(p));
  const bare = reskinPromptText({ view: 'top' });
  assert.ok(!/MATERIAL REFERENCES/.test(bare) && !/The scene contains exactly/.test(bare) && /strict top-down/.test(bare));
});

test('配色：每套都有画图要用的材质槽', () => {
  const mats = ['wall', 'structure', 'panel', 'cabinet', 'worktop', 'glass', 'windowGlass', 'fabric', 'neutral'];
  for (const [id, pal] of Object.entries(PALETTES)) {
    mats.forEach((m) => assert.ok(pal[m] && pal[m].top && pal[m].side, `${id}.${m}`));
    assert.ok(pal.floor && pal.bg && pal.shadow, id);
  }
  assert.equal(paletteOf('没有这个'), PALETTES.warm);
});

test('plan3d 核心文件是 ES5 写法、没有外部依赖（以后原样搬到没有构建步骤的 VISI）', () => {
  for (const f of ['geometry.js', 'scene.js', 'palette.js', 'paint.js']) {
    const code = src(f);
    const bare = code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
    assert.ok(!/=>/.test(bare), `${f}: 不用箭头函数`);
    assert.ok(!/`/.test(bare), `${f}: 不用模板字符串`);
    assert.ok(!/\b(let|const|class)\s/.test(bare), `${f}: 不用 let / const / class`);
    assert.ok(!/\.\.\./.test(bare), `${f}: 不用展开运算符`);
    const imports = [...bare.matchAll(/^\s*import\s[^;]*from\s*(''|"")/gm)];
    const real = [...code.matchAll(/^\s*import\s[^;]*from\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    assert.ok(real.every((p) => /^\.\/(geometry|scene|palette)\.js$/.test(p)), `${f}: 只引用 plan3d 自己的文件（${real.join(', ') || '无'}）`);
    assert.equal(imports.length, real.length);
    assert.equal((code.match(/^export\s*\{[^}]*\};?\s*$/gm) || []).length, 1, `${f}: 只有末尾一行 export`);
    assert.ok(!/^export\s+(function|var|default)/m.test(code), `${f}: 不在声明处 export`);
  }
});
