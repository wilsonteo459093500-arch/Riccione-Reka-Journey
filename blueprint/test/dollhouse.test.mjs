// 3D 全屋立体图纯函数测试：提示词、方位、楼层 / 参考图选择、插入提案页（不发网络请求）
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import {
  buildDollhousePrompt, resolveAngle, floorNameOf, dollhouseFloors, ensureFloor, setFloorPlan, setFloorImage,
  addRender3d, removeRender3d, floorViewSlides, floorRoomsList, defaultRefIds, makeDollhouseSlide,
  dollhouseInsertIndex, insertDollhouseSlide, findDollhouseSlides, hasFloorSlide, ALL_FLOOR, ALL_FLOOR_ID, MAX_REFS,
} from '../src/ai/dollhouse.js';
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

test('resolveAngle：中文 / 缩写 / 对象都认得，认不出 = 东南', () => {
  assert.equal(resolveAngle('东南').id, 'south-east');
  assert.equal(resolveAngle('NW').id, 'north-west');
  assert.equal(resolveAngle('south west').id, 'south-west');
  assert.equal(resolveAngle({ id: 'north-east' }).id, 'north-east');
  assert.equal(resolveAngle('乱填').id, 'south-east');
});

test('buildDollhousePrompt：楼层名、方位、参考图张数、空间清单、风格备注都写进提示词', () => {
  const prompt = buildDollhousePrompt({
    floor: { id: 'f1', zh: '一楼', en: 'Ground floor' },
    angle: '西北',
    style: 'warm evening light',
    roomsList: [{ zh: '客厅', en: 'living area' }, '饭厅', { zh: '客厅', en: 'living area' }],
    refCount: 3,
  });
  assert.ok(prompt.includes('GROUND FLOOR (一楼)'), '楼层名');
  assert.ok(/north-west/i.test(prompt), '方位');
  assert.ok(prompt.includes('images 2–4'), '参考图是第 2–4 张');
  assert.ok(prompt.includes('客厅 (LIVING AREA)') && prompt.includes('饭厅'), '空间清单');
  assert.equal(prompt.split('客厅 (LIVING AREA)').length - 1, 1, '空间清单去重');
  assert.ok(prompt.includes('warm evening light'), '风格备注');
  assert.ok(/isometric/i.test(prompt) && /no text/i.test(prompt), '等轴测、无文字');
});

test('buildDollhousePrompt：参考图张数夹在 0–4；全屋模式', () => {
  const p1 = buildDollhousePrompt({ floor: ALL_FLOOR, refCount: 9 });
  assert.ok(p1.includes(`images 2–${1 + MAX_REFS}`));
  assert.ok(/ENTIRE home/.test(p1));
  const p0 = buildDollhousePrompt({ floor: 'Ground floor', refCount: 0 });
  assert.ok(!/images 2/.test(p0));
  assert.equal(floorNameOf(null), 'floor');
  assert.equal(floorNameOf({ zh: '三楼' }), '三楼');
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
  assert.equal(setFloorImage(p, 'f2', 'asset:bg').floors[1].image, 'asset:bg');
  assert.equal(setFloorImage(p, 'f2', '').floors[1].image, null);
});

test('参考图：本层启用的效果图；默认取前 4 个不同空间', () => {
  const p = sample();
  assert.deepEqual(floorViewSlides(p, 'f1').map((s) => s.id), ['a', 'b', 'c', 'd', 'e', 'g']);
  assert.deepEqual(floorViewSlides(p, ALL_FLOOR_ID).map((s) => s.id), ['a', 'b', 'c', 'd', 'e', 'g', 'h']);
  assert.deepEqual(defaultRefIds(p, 'f1'), ['a', 'b', 'd', 'e'], '客厅只取第一张');
  assert.deepEqual(defaultRefIds(p, 'f2'), ['h']);
  assert.deepEqual(floorRoomsList(p, 'f1').map((r) => r.zh), ['鞋柜', '客厅', '饭厅', 'KTV 娱乐室', '麻将房']);
  assert.equal(floorRoomsList(p, 'f1')[1].en, 'LIVING AREA');
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
