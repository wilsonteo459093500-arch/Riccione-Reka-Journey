// 3D 户型图新流程里存在楼层上的数据：坐标、视角、贴图；换图纸 / 重新裁图时怎么处理；出图参数；每次改完的「理一遍」
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from './harness.mjs';
import {
  floorPlan3d, patchFloorPlan3d, setPlan3dGeo, setPlan3dView, setPlan3dTexture, setPlan3dTexturesOn, activeTextures, normalizeView, defaultView,
  recropGeo, carryPlan3d, sceneOptions, planScene, DEFAULT_VIEW,
} from '../src/ai/plan3d.js';
import { setFloorPlanUpload, setFloorPlan, ASPECTS } from '../src/ai/dollhouse.js';
import { settleGeo, wallTol } from '../src/plan3d/settle.js';
import { applyOp } from '../src/plan3d/edit.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const STUDY = JSON.parse(readFileSync(path.join(here, '../src/plan3d/sample-study-room.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));

const room = (extra = {}) => ({ source: { w: 1000, h: 800 }, mmPerPx: 5, wallT: 20, rooms: [{ name: 'R', rects: [[100, 100, 900, 700]] }], openings: [], items: [], ...extra });
const project = (floor = {}) => ({ id: 'p1', floors: [{ id: 'f1', zh: '一楼', plan: 'asset:plan1', ...floor }] });
const floorOf = (p) => p.floors.find((f) => f.id === 'f1');

test('floorPlan3d：坐标绑定在图纸上；图纸换了（planSrc 对不上）= 没有', () => {
  const geo = room();
  const p = setPlan3dGeo(project(), 'f1', geo);
  assert.equal(floorOf(p).plan3d.planSrc, 'asset:plan1');
  assert.equal(floorPlan3d(floorOf(p)).geo, geo);
  assert.equal(floorPlan3d({ ...floorOf(p), plan: 'asset:other' }), null);
  assert.equal(floorPlan3d({ plan: 'asset:plan1' }), null);
  assert.equal(floorPlan3d(null), null);
});

test('setPlan3dGeo / patchFloorPlan3d：不可变；合并更新；null 清掉；AI 框完那次带上原始结果', () => {
  const p0 = project();
  const before = JSON.stringify(p0);
  const geo = room();
  const p1 = setPlan3dGeo(p0, 'f1', geo, { detected: geo, detect: { at: 1, partial: false, notes: [] } });
  assert.equal(JSON.stringify(p0), before, '原项目不变');
  assert.equal(floorOf(p1).plan3d.detected, geo);
  const geo2 = room({ wallT: 30 });
  const p2 = setPlan3dGeo(p1, 'f1', geo2);
  assert.equal(floorOf(p2).plan3d.geo, geo2);
  assert.equal(floorOf(p2).plan3d.detected, geo, '后面只改坐标，AI 原始结果还在');
  assert.equal(floorOf(patchFloorPlan3d(p2, 'f1', null)).plan3d, null);
});

test('换一张图纸 / 移除图纸：按旧图纸量的坐标清掉', () => {
  const p = setPlan3dGeo(project(), 'f1', room());
  assert.equal(floorOf(setFloorPlanUpload(p, 'f1', 'asset:plan2')).plan3d, null);
  assert.equal(floorOf(setFloorPlan(p, 'f1', null)).plan3d, null);
});

test('视角：不认识的值回到默认；合并更新；没有坐标时不动', () => {
  assert.deepEqual(normalizeView(null), DEFAULT_VIEW);
  assert.deepEqual(normalizeView({ view: 'xx', corner: 'zz', wallMm: 999, cab: 'full', hung: 'hide', junk: 1 }), { view: 'top', corner: 'se', wallMm: 650, cab: 'full', hung: 'hide' });
  const p = setPlan3dGeo(project(), 'f1', room());
  const p2 = setPlan3dView(p, 'f1', { view: 'iso', corner: 'nw' });
  assert.deepEqual(floorOf(p2).plan3d.view, { view: 'iso', corner: 'nw', wallMm: 650, cab: 'cut', hung: 'ghost' });
  assert.equal(setPlan3dView(project(), 'f1', { view: 'iso' }).floors[0].plan3d, undefined);
  const d = defaultView(STUDY);
  assert.equal(d.view, 'top');
  assert.equal(d.corner, 'nw', '斜角立体的默认镜头角 = 推荐的那个');
});

test('贴图：按槽位存 asset 引用和来源；清除；开关；不认识的槽位不存', () => {
  let p = setPlan3dGeo(project(), 'f1', room());
  p = setPlan3dTexture(p, 'f1', 'cabinet', { src: 'asset:t1', from: 'material', materialId: 'm1' });
  p = setPlan3dTexture(p, 'f1', 'floor', { src: 'asset:t2', from: 'ai' });
  p = setPlan3dTexture(p, 'f1', 'ceiling', { src: 'asset:t3' });
  const tex = floorOf(p).plan3d.tex;
  assert.deepEqual(tex, { on: true, cabinet: { src: 'asset:t1', from: 'material', materialId: 'm1' }, floor: { src: 'asset:t2', from: 'ai' } });
  assert.deepEqual(activeTextures(floorOf(p).plan3d), { floor: 'asset:t2', cabinet: 'asset:t1' });
  const off = setPlan3dTexturesOn(p, 'f1', false);
  assert.deepEqual(activeTextures(floorOf(off).plan3d), {}, '关掉 = 用默认画法，贴图还留着');
  assert.equal(floorOf(off).plan3d.tex.cabinet.src, 'asset:t1');
  const cleared = setPlan3dTexture(p, 'f1', 'cabinet', null);
  assert.deepEqual(activeTextures(floorOf(cleared).plan3d), { floor: 'asset:t2' });
  assert.deepEqual(activeTextures(null), {});
});

test('recropGeo：重新裁图时把坐标带到新图上；范围外的丢掉；带不了 = null', () => {
  const geo = room({
    openings: [{ type: 'door', side: 'left', a: 300, b: 400, at: 100 }],
    items: [
      { id: 'a', kind: 'tall', box: [100, 100, 300, 160] },
      { id: 'b', kind: 'low', box: [800, 600, 900, 700] },
    ],
  });
  // 同一个范围、同样大小：原样
  const same = recropGeo(geo, null, { w: 1000, h: 800 }, null, { w: 1000, h: 800 });
  assert.deepEqual(same.rooms, geo.rooms);
  assert.deepEqual(same.items.map((i) => i.box), geo.items.map((i) => i.box));
  // 旧图是原图的左上 1/2（宽）× 1（高）裁出来再放大成 1000×800；新范围 = 整张原图、2000×800
  const wide = recropGeo(geo, { x: 0, y: 0, w: 0.5, h: 1 }, { w: 1000, h: 800 }, null, { w: 2000, h: 800 });
  assert.deepEqual(wide.rooms[0].rects[0], [100, 100, 900, 700], '横向：旧图 1000px = 原图一半 = 新图 1000px');
  assert.deepEqual(wide.source, { w: 2000, h: 800 });
  // 新范围只包住右下角：左上的高柜、门都在范围外
  const part = recropGeo(geo, null, { w: 1000, h: 800 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, { w: 1000, h: 800 });
  assert.equal(part, null, '房间的中心不在新范围里 → 带不了');
  const shifted = recropGeo(geo, null, { w: 1000, h: 800 }, { x: 0.05, y: 0, w: 0.95, h: 1 }, { w: 950, h: 800 });
  assert.deepEqual(shifted.rooms[0].rects[0], [50, 100, 850, 700]);
  assert.deepEqual(shifted.items[0].box, [50, 100, 250, 160]);
  assert.equal(shifted.openings[0].at, 50);
  assert.equal(recropGeo(null, null, { w: 1, h: 1 }, null, { w: 1, h: 1 }), null);
  assert.equal(recropGeo(geo, null, null, null, { w: 1, h: 1 }), null);
});

test('carryPlan3d：带得过去就换绑到新图纸（视角、贴图留着，AI 原始结果作废）；带不了就清掉', () => {
  let p = setPlan3dGeo(project(), 'f1', room(), { detected: room() });
  p = setPlan3dView(p, 'f1', { view: 'iso' });
  p = setPlan3dTexture(p, 'f1', 'floor', { src: 'asset:t2', from: 'upload' });
  const moved = { ...p, floors: p.floors.map((f) => ({ ...f, plan: 'asset:plan2' })) };
  const g2 = room({ wallT: 10 });
  const kept = carryPlan3d(moved, 'f1', { planSrc: 'asset:plan2', geo: g2 });
  const p3 = floorPlan3d(floorOf(kept));
  assert.equal(p3.geo, g2);
  assert.equal(p3.view.view, 'iso');
  assert.equal(p3.tex.floor.src, 'asset:t2');
  assert.equal(p3.detected, null);
  assert.equal(floorOf(carryPlan3d(moved, 'f1', { planSrc: 'asset:plan2', geo: null })).plan3d, null);
});

test('出图参数：斜角立体才有镜头角 / 墙高；柜子全高 = 不切、吊柜画实体；画布比例取出图模型支持的比例', () => {
  assert.deepEqual(sceneOptions({ view: 'top', hung: 'hide' }), { view: 'top', hung: 'hide' });
  assert.deepEqual(sceneOptions({ view: 'iso', corner: 'nw', wallMm: 400, cab: 'cut', hung: 'ghost' }), { view: 'iso', corner: 'nw', wallMm: 400, cutMm: undefined, hung: 'ghost' });
  assert.deepEqual(sceneOptions({ view: 'iso', cab: 'full', hung: 'hide' }), { view: 'iso', corner: 'se', wallMm: 650, cutMm: Infinity, hung: 'solid' });
  const ratios = ASPECTS.map((a) => a.split(':').map(Number)).map(([w, h]) => w / h);
  for (const view of ['top', 'persp', 'iso']) {
    const s = planScene(STUDY, { view });
    assert.ok(ratios.some((r) => Math.abs(r - s.w / s.h) < 0.02), `${view}: ${s.w}×${s.h}`);
  }
});

test('planScene：落在房间外的东西不参与出图（不会把画面撑大）', () => {
  const base = planScene(STUDY, { view: 'top' });
  const stray = clone(STUDY);
  stray.items.push({ id: 'stray', kind: 'tall', box: [1500, 20, 1800, 90] });
  const s = planScene(stray, { view: 'top' });
  assert.equal(s.w, base.w);
  assert.equal(s.h, base.h);
  assert.equal(s.s, base.s, '比例尺没变');
  assert.ok(!s.solids.some((x) => x.id === 'stray'));
});

test('settleGeo：样本过一遍不变（贴墙、椅子朝向都和手工录入的一致）；门窗补上墙的位置', () => {
  const s = settleGeo(STUDY);
  assert.deepEqual(s.items.map((i) => [i.id, i.against || null, i.facing || null]), STUDY.items.map((i) => [i.id, i.against || null, i.facing || null]));
  assert.deepEqual(s.items.map((i) => i.box), STUDY.items.map((i) => i.box), '不移动任何东西');
  assert.deepEqual(s.openings.map((o) => [o.type, o.side, o.a, o.b]), STUDY.openings.map((o) => [o.type, o.side, o.a, o.b]));
  assert.deepEqual(s.openings.map((o) => o.at), [133, 305, 856]);
  assert.equal(wallTol(STUDY), 16);
  assert.ok(wallTol({ source: { w: 2000, h: 1000 } }) > 16);
  assert.doesNotThrow(() => settleGeo({}));
  assert.deepEqual(settleGeo(null).items, []);
});

test('settleGeo：房间的墙挪了，门窗跟着走；柜子按新位置重新判断贴哪面墙', () => {
  const geo = settleGeo(
    room({
      openings: [{ type: 'door', side: 'left', a: 300, b: 400 }],
      items: [
        { id: 't', kind: 'tall', box: [100, 100, 400, 160] },
        { id: 'd', kind: 'desk', box: [500, 300, 700, 380] },
        { id: 'c', kind: 'chair', box: [570, 390, 630, 450] },
      ],
    })
  );
  assert.equal(geo.openings[0].at, 100);
  assert.equal(geo.items[0].against, 'top');
  assert.equal(geo.items[1].against, undefined);
  assert.equal(geo.items[2].facing, 'top', '桌子在椅子上方');
  // 左墙往里挪 60：门跟着到 x = 160
  const moved = settleGeo(applyOp(geo, { type: 'setRoomRect', room: 0, rect: 0, box: [160, 100, 900, 700] }));
  assert.equal(moved.openings[0].side, 'left');
  assert.equal(moved.openings[0].at, 160);
  // 高柜拖离上墙：不再贴墙
  const away = settleGeo(applyOp(geo, { type: 'updateItem', index: 0, patch: { box: [300, 300, 600, 360] } }));
  assert.equal(away.items[0].against, undefined);
});
