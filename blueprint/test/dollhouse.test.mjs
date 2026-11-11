// 3D 户型图纯函数测试：提示词、视角、输出比例、裁剪框、AI 回复解析、楼层 / 参考图选择、插入提案页（不发网络请求）
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import {
  resolveScope, pickAspect, normalizeBox, isFullBox, dragCropBox, regionBox, FULL_BOX, MIN_CROP, parseRegionResponse, dollhouseFloors,
  ensureFloor, setFloorPlan, setFloorPlanUpload, setFloorRegion, setFloorPlanCrop, setFloorImage, setRenderInfo, addRender3d, removeRender3d,
  floorViewSlides, makeDollhouseSlide, dollhouseInsertIndex, insertDollhouseSlide, findDollhouseSlides, hasFloorSlide, ALL_FLOOR_ID,
  DOLLHOUSE_VIEWS,
} from '../src/ai/dollhouse.js';
import * as dollhouse from '../src/ai/dollhouse.js';
import * as prompts from '../src/ai/prompts.js';
import { planRegionPrompt } from '../src/ai/prompts.js';
import { renderDeck } from '../src/engine/deck.js';
import { newProject, assembleDeck } from '../src/engine/model.js';

const view = (id, floorId, room, extra = {}) => ({
  id, kind: 'view', enabled: true, floorId, layout: 'auto', image: `asset:${id}`, room, roomEn: '', subtitle: '',
  materials: [], notes: [], ...extra,
});

function sample() {
  const floors = [
    { id: 'f1', zh: '一楼', en: 'GROUND FLOOR', image: null },
    { id: 'f2', zh: '二楼', en: 'FIRST FLOOR', image: null },
  ];
  const design = [
    { id: 'fl1', kind: 'floor', floorId: 'f1', enabled: true },
    view('a', 'f1', '鞋柜', { roomEn: 'SHOE CABINET' }),
    view('b', 'f1', '客厅', { roomEn: 'LIVING AREA' }),
    view('c', 'f1', '客厅'),
    view('d', 'f1', '饭厅'),
    view('off', 'f1', '厨房', { enabled: false }),
    view('e', 'f1', 'KTV 娱乐室'),
    view('g', 'f1', '麻将房'),
    { id: 'fl2', kind: 'floor', floorId: 'f2', enabled: true },
    view('h', 'f2', '主人房'),
  ];
  return newProject({ id: 'p1', floors, slides: assembleDeck(design) });
}

test('resolveScope：认不出 = 只做主房间；旧版视角只剩名字（给生成记录里的旧图用）', () => {
  assert.equal(resolveScope('all'), 'all');
  assert.equal(resolveScope('乱填'), 'room');
  assert.deepEqual(DOLLHOUSE_VIEWS.map((v) => [v.id, v.zh]), [['top', '正俯视'], ['tilt', '微倾俯视']]);
});

test('旧的「AI 直接出整张图」流程已经整套拿掉（位置不准；现在由程序按核对过的坐标出图）', () => {
  for (const name of ['generateDollhouse', 'refineDollhouse', 'checkDollhouse', 'analyzePlan', 'buildFloorplanPrompt', 'parseBriefResponse', 'parseCheckResponse', 'setFloorBrief']) {
    assert.equal(dollhouse[name], undefined, name);
  }
  for (const name of ['floorplanPromptText', 'planBriefPrompt', 'checkPrompt', 'refinePrompt', 'reskinPromptText']) {
    assert.equal(prompts[name], undefined, name);
  }
});

test('pickAspect：按图纸宽高取最近的输出比例', () => {
  assert.equal(pickAspect(1000, 950), '1:1');
  assert.equal(pickAspect(1600, 900), '16:9');
  assert.equal(pickAspect(1500, 1000), '3:2');
  assert.equal(pickAspect(1300, 1000), '4:3');
  assert.equal(pickAspect(900, 1200), '3:4');
  assert.equal(pickAspect(900, 1600), '9:16');
  assert.equal(pickAspect(0, 0), '4:3', '读不到尺寸');
});

test('normalizeBox：认 0–1000 的 [ymin,xmin,ymax,xmax] 和 0–1 的 {x,y,w,h}；夹在图内；太小 = null', () => {
  assert.deepEqual(normalizeBox([100, 200, 900, 600]), { x: 0.2, y: 0.1, w: 0.4, h: 0.8 });
  assert.deepEqual(normalizeBox({ x: 0.2, y: 0.1, w: 0.4, h: 0.8 }), { x: 0.2, y: 0.1, w: 0.4, h: 0.8 });
  assert.deepEqual(normalizeBox([900, 600, 100, 200]), { x: 0.2, y: 0.1, w: 0.4, h: 0.8 }, '写反了也认');
  assert.deepEqual(normalizeBox([-50, -50, 1200, 1100]), FULL_BOX, '出界夹回来');
  assert.deepEqual(normalizeBox([100, 200, 900, 600], { pad: 0.05 }), { x: 0.15, y: 0.05, w: 0.5, h: 0.9 });
  assert.equal(normalizeBox([100, 200, 120, 220]), null, '太小');
  assert.equal(normalizeBox('乱填'), null);
  assert.equal(normalizeBox([1, 2, 3]), null);
  assert.equal(isFullBox(FULL_BOX), true);
  assert.equal(isFullBox(null), true);
  assert.equal(isFullBox({ x: 0.2, y: 0.1, w: 0.4, h: 0.8 }), false);
});

test('dragCropBox：拖动不出界，缩放不小于最小边长', () => {
  const start = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };
  assert.deepEqual(dragCropBox(start, 'move', 0.9, -0.9), { x: 0.6, y: 0, w: 0.4, h: 0.4 });
  const se = dragCropBox(start, 'se', 0.1, 0.2);
  assert.ok(Math.abs(se.w - 0.5) < 1e-9 && Math.abs(se.h - 0.6) < 1e-9 && se.x === 0.2 && se.y === 0.2);
  const nw = dragCropBox(start, 'nw', 0.9, 0.9);
  assert.ok(Math.abs(nw.w - MIN_CROP) < 1e-9 && Math.abs(nw.h - MIN_CROP) < 1e-9, '拖过头 = 最小框');
  assert.ok(Math.abs(nw.x + nw.w - 0.6) < 1e-9, '右边不动');
  const e = dragCropBox(start, 'e', 5, 5);
  assert.ok(Math.abs(e.x + e.w - 1) < 1e-9 && e.h === 0.4, '只动右边，停在图边');
});

test('parseRegionResponse：带代码块 / 字段名变体都能读；整层 mainRoom = drawing；读不懂抛错', () => {
  const r = parseRegionResponse('```json\n{"kind":"room","roomName":"STUDY ROOM","drawing":[60,65,910,612],"main_room":[95,160,845,595],}\n```');
  assert.equal(r.kind, 'room');
  assert.equal(r.roomName, 'STUDY ROOM');
  assert.ok(r.drawing.x + r.drawing.w < 0.65, '右边的装饰栏在框外');
  assert.ok(r.mainRoom.x > r.drawing.x && r.mainRoom.w < r.drawing.w, '主房间框比图纸框小');
  assert.deepEqual(regionBox(r, 'room'), r.mainRoom);
  assert.deepEqual(regionBox(r, 'all'), r.drawing);
  assert.deepEqual(regionBox(null, 'room'), FULL_BOX);

  const f = parseRegionResponse('{"kind":"floor","roomName":"","drawing":[50,50,950,700],"mainRoom":[100,100,400,400]}');
  assert.equal(f.kind, 'floor');
  assert.deepEqual(f.mainRoom, f.drawing);

  const half = parseRegionResponse('{"kind":"room","mainRoom":[100,100,800,600]}');
  assert.deepEqual(half.drawing, FULL_BOX, '没给图纸框 = 整张图');
  assert.throws(() => parseRegionResponse('{"kind":"room"}'));
  assert.throws(() => parseRegionResponse('我看不出来'));
});

test('找图纸范围的提示词', () => {
  const region = planRegionPrompt();
  assert.ok(/\[ymin, xmin, ymax, xmax\]/.test(region) && /"drawing"/.test(region) && /"mainRoom"/.test(region));
  assert.ok(/Exclude slide titles, logos, decorative panels/.test(region));
});

test('dollhouseFloors / ensureFloor：没有楼层 → 「全屋」虚拟楼层，第一次用到才写进项目', () => {
  const empty = newProject({ id: 'p0' });
  assert.deepEqual(dollhouseFloors(empty).map((f) => f.id), [ALL_FLOOR_ID]);
  assert.equal(ensureFloor(empty, 'unknown'), empty);
  const withAll = ensureFloor(empty, ALL_FLOOR_ID);
  assert.deepEqual(withAll.floors.map((f) => f.id), [ALL_FLOOR_ID]);
  assert.equal(ensureFloor(withAll, ALL_FLOOR_ID), withAll);
  const p = sample();
  assert.deepEqual(dollhouseFloors(p).map((f) => f.id), ['f1', 'f2']);
});

test('楼层修改是不可变更新：平面图 / 背景 / 立体图历史', () => {
  const p = sample();
  const p1 = setFloorPlan(p, 'f1', 'asset:plan');
  assert.equal(p1.floors[0].plan, 'asset:plan');
  assert.equal(p.floors[0].plan, undefined);
  assert.equal(p1.floors[1], p.floors[1]);
  const p2 = addRender3d(addRender3d(p1, 'f1', 'asset:r1'), 'f1', 'asset:r2');
  assert.deepEqual(p2.floors[0].renders3d, ['asset:r1', 'asset:r2']);
  assert.deepEqual(addRender3d(p2, 'f1', 'asset:r1').floors[0].renders3d, ['asset:r2', 'asset:r1'], '重复加 = 移到最新');
  assert.deepEqual(removeRender3d(p2, 'f1', 'asset:r1').floors[0].renders3d, ['asset:r2']);
  const p3 = setRenderInfo(setRenderInfo(p2, 'f1', 'asset:r1', { view: 'top' }), 'f1', 'asset:r1', { check: { ok: true, issues: [] } });
  assert.deepEqual(p3.floors[0].render3dInfo, { 'asset:r1': { view: 'top', check: { ok: true, issues: [] } } }, '合并更新');
  assert.deepEqual(removeRender3d(p3, 'f1', 'asset:r1').floors[0].render3dInfo, {}, '删图连同它的信息');
  assert.equal(setFloorImage(p, 'f2', 'asset:bg').floors[1].image, 'asset:bg');
  assert.equal(setFloorImage(p, 'f2', '').floors[1].image, null);
});

test('平面图：上传 → 认范围 → 确认裁剪；换图后范围作废；移除全部清掉', () => {
  const p = sample();
  const up = setFloorPlanUpload(p, 'f1', 'asset:src');
  assert.equal(up.floors[0].plan, 'asset:src');
  assert.equal(up.floors[0].planSource, 'asset:src');
  assert.equal(up.floors[0].planCrop, null);
  const region = { kind: 'room', roomName: 'STUDY ROOM', drawing: FULL_BOX, mainRoom: { x: 0.1, y: 0.1, w: 0.5, h: 0.8 } };
  const withRegion = setFloorRegion(up, 'f1', region);
  const crop = setFloorPlanCrop(withRegion, 'f1', { plan: 'asset:crop', source: 'asset:src', crop: region.mainRoom, scope: 'room' });
  assert.equal(crop.floors[0].plan, 'asset:crop');
  assert.equal(crop.floors[0].planSource, 'asset:src', '原图留着，可以重新框选');
  assert.deepEqual(crop.floors[0].planCrop, region.mainRoom);
  assert.equal(crop.floors[0].planScope, 'room');
  assert.deepEqual(crop.floors[0].planRegion, region);
  const again = setFloorPlanCrop(crop, 'f1', { plan: 'asset:crop2', crop: FULL_BOX, scope: 'all' });
  assert.equal(again.floors[0].planSource, 'asset:src');
  assert.equal(again.floors[0].planScope, 'all');
  const legacy = setFloorPlanCrop(setFloorPlan(p, 'f1', 'asset:old'), 'f1', { plan: 'asset:oldcrop', crop: FULL_BOX });
  assert.equal(legacy.floors[0].planSource, 'asset:old', '旧项目：原来那张当原图');
  const reup = setFloorPlanUpload(crop, 'f1', 'asset:src2');
  assert.equal(reup.floors[0].planRegion, null);
  assert.equal(reup.floors[0].planCrop, null);
  const gone = setFloorPlan(crop, 'f1', null).floors[0];
  assert.deepEqual([gone.plan, gone.planSource, gone.planCrop, gone.planRegion, gone.plan3d], [null, null, null, null, null]);
  assert.equal(crop.floors[1], p.floors[1], '别的楼层不动');
});

test('材质参考图：本层启用的效果图（AI 出材质样本时取前几张）', () => {
  const p = sample();
  assert.deepEqual(floorViewSlides(p, 'f1').map((s) => s.id), ['a', 'b', 'c', 'd', 'e', 'g']);
  assert.deepEqual(floorViewSlides(p, ALL_FLOOR_ID).map((s) => s.id), ['a', 'b', 'c', 'd', 'e', 'g', 'h']);
});

test('insertDollhouseSlide：插在楼层章节页之后；再插 = 只换图；add 模式追加在后面', () => {
  const p = sample();
  const p1 = insertDollhouseSlide(p, { floorId: 'f1', image: 'asset:r1', id: 'd1' });
  const idx = p1.slides.findIndex((s) => s.id === 'd1');
  assert.equal(p1.slides[idx - 1].id, 'fl1');
  const d1 = p1.slides[idx];
  assert.equal(d1.tag, '3d');
  assert.equal(d1.layout, 'full');
  assert.equal(d1.room, '一楼');
  assert.equal(d1.subtitle, '全屋立体图');
  assert.equal(d1.roomEn, '3D OVERVIEW');
  assert.equal(p1.slides.length, p.slides.length + 1);

  const edited = { ...p1, slides: p1.slides.map((s) => (s.id === 'd1' ? { ...s, subtitle: '设计师改过' } : s)) };
  const p2 = insertDollhouseSlide(edited, { floorId: 'f1', image: 'asset:r2' });
  assert.equal(p2.slides.length, p1.slides.length, 'replace 不新增页');
  const again = p2.slides.find((s) => s.id === 'd1');
  assert.equal(again.image, 'asset:r2');
  assert.equal(again.subtitle, '设计师改过', '保留设计师改过的文字');

  const p3 = insertDollhouseSlide(p2, { floorId: 'f1', image: 'asset:r3', mode: 'add', id: 'd2' });
  const i1 = p3.slides.findIndex((s) => s.id === 'd1');
  assert.equal(p3.slides[i1 + 1].id, 'd2');
  assert.equal(findDollhouseSlides(p3, 'f1').length, 2);
  assert.equal(hasFloorSlide(p3, 'f1'), true);
  assert.equal(hasFloorSlide(p3, 'nope'), false);
});

test('insertDollhouseSlide：方图 / 竖图用自动版式（图文页，不被满版裁掉）；宽图仍满版', () => {
  const p = sample();
  const sq = insertDollhouseSlide(p, { floorId: 'f1', image: 'asset:sq', id: 'd1', ratio: 1 });
  assert.equal(sq.slides.find((s) => s.id === 'd1').layout, 'auto');
  const wide = insertDollhouseSlide(p, { floorId: 'f1', image: 'asset:w', id: 'd1', ratio: 16 / 9 });
  assert.equal(wide.slides.find((s) => s.id === 'd1').layout, 'full');
  const swapped = insertDollhouseSlide(wide, { floorId: 'f1', image: 'asset:sq', ratio: 1 });
  assert.equal(swapped.slides.find((s) => s.id === 'd1').layout, 'auto', '满版页换成方图 → 改回自动版式');
  const framed = { ...wide, slides: wide.slides.map((s) => (s.id === 'd1' ? { ...s, layout: 'framed' } : s)) };
  assert.equal(insertDollhouseSlide(framed, { floorId: 'f1', image: 'asset:sq', ratio: 1 }).slides.find((s) => s.id === 'd1').layout, 'framed', '设计师选的图文版式不动');
  assert.equal(makeDollhouseSlide(null, 'asset:x', 'd9', { ratio: 0.75 }).layout, 'auto');
  const rendered = renderDeck(sq);
  assert.ok(rendered.find((r) => r.slideId === 'd1').els.length > 0);
});

test('dollhouseInsertIndex：没有章节页 → 本层第一张效果图之前 → 本案材料之后', () => {
  const slides = [
    { id: 'cov', kind: 'designCover' },
    { id: 'mat', kind: 'materials' },
    view('a', 'f1', '客厅'),
  ];
  assert.equal(dollhouseInsertIndex(slides, 'f1'), 2);
  assert.equal(dollhouseInsertIndex(slides, ALL_FLOOR_ID), 2);
  assert.equal(dollhouseInsertIndex(slides, 'f9'), 2, '本案材料之后');
  assert.equal(dollhouseInsertIndex([{ id: 'cov', kind: 'designCover' }], 'f9'), 1);
  assert.equal(dollhouseInsertIndex([], 'f9'), 0);
});

test('没有楼层的项目：立体图页挂在「全屋」下，整套照常渲染', () => {
  const p = newProject({ id: 'p2', slides: assembleDeck([view('a', null, '客厅')]) });
  const p1 = insertDollhouseSlide(p, { floorId: ALL_FLOOR_ID, image: 'asset:r1', id: 'd1' });
  const s = p1.slides.find((x) => x.id === 'd1');
  assert.equal(s.room, '全屋');
  assert.equal(s.subtitle, '立体图');
  assert.ok(p1.slides.findIndex((x) => x.id === 'd1') < p1.slides.findIndex((x) => x.id === 'a'));
  const rendered = renderDeck(p1);
  const page = rendered.find((r) => r.slideId === 'd1');
  assert.ok(page && page.els.length > 0);
});

test('立体图页不算进楼层章节页的空间清单', () => {
  const p = insertDollhouseSlide(sample(), { floorId: 'f1', image: 'asset:r1', id: 'd1' });
  const rendered = renderDeck(p);
  const floorPage = rendered.find((r) => r.slideId === 'fl1');
  const texts = floorPage.els.filter((e) => e.t === 'text').map((e) => e.paras.map((q) => q.runs.map((r) => r.text).join('')).join('\n')).join('\n');
  assert.ok(texts.includes('客厅'));
  assert.ok(!texts.includes('全屋立体图'));
  assert.ok(makeDollhouseSlide(null, 'asset:x').floorId === ALL_FLOOR_ID);
});
