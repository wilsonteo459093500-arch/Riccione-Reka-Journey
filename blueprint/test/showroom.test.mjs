// 展厅播放（src/showroom/）：停点 = 导出 PPT 的同一套页（隐藏页不播）；白天 / 夜晚配对；满版页叠说明；
// 铁律：停在任何一页时，元素原样（透明度 1、不位移、效果图 scale 1 = 完整原图）；动效只在两页之间；
// 位置的纯函数：前后拖动结果一致
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { renderDeck, exportableSlides } from '../src/engine/deck.js';
import { splitTimeOfDay } from '../src/import/labels.js';
import { buildStops, dayNightPair, transitionKind, indexOf, isFullView } from '../src/showroom/timeline.js';
import { layerMotion, frameAt, snapTarget, isHeroImg, cssOf, PUSH_IN } from '../src/showroom/motion.js';

const SIZES = { '/living.jpg': [2400, 1350], '/night.jpg': [2400, 1350], '/kitchen.jpg': [2400, 1526], '/bed.jpg': [2400, 1350], '/m.jpg': [600, 600] };
const meta = (src) => (SIZES[src] ? { w: SIZES[src][0], h: SIZES[src][1] } : null);

function sample(lang = 'zh') {
  const view = (id, image, room, subtitle, extra = {}) => ({
    id, kind: 'view', enabled: true, floorId: 'f1', layout: 'auto', image, room, subtitle, materials: [{ role: '柜体', materialId: 'm1' }], notes: [], ...extra,
  });
  return {
    id: 'p-show',
    name: 'Show',
    version: 1,
    info: { client: 'Mr Lau', location: 'Muar', date: '2026 · 08', lang, team: [] },
    floors: [{ id: 'f1', zh: '一楼', en: 'GROUND FLOOR', image: null }],
    materials: [{ id: 'm1', name: '浅川橡', code: 'AG273', image: '/m.jpg' }],
    slides: [
      { id: 's-f1', kind: 'floor', floorId: 'f1', enabled: true },
      view('v-day', '/living.jpg', '客厅', '电视墙 · 白天', { layout: 'full', notes: [{ label: '隐形门', text: '液压闭门器，配反弹器' }] }),
      view('v-night', '/night.jpg', '客厅', '电视墙 · 夜晚', { layout: 'full' }),
      view('v-hidden', '/kitchen.jpg', '厨房', '岛台', { enabled: false }),
      view('v-kitchen', '/kitchen.jpg', '厨房', '岛台', { layout: 'plate', notes: [{ label: '灯光', text: '吊柜底部嵌 LED 灯带' }] }),
      view('v-bed-day', '/bed.jpg', '主人房', '白天'),
      view('v-tea-night', '/bed.jpg', '茶室', '夜晚'),
      { id: 's-mats', kind: 'materials', enabled: true },
    ],
    translations: {},
  };
}

const stopsOf = (project) => buildStops(exportableSlides(renderDeck(project, { meta })), project);

test('splitTimeOfDay：认得白天 / 夜晚的各种写法，其余原样留下', () => {
  assert.deepEqual(splitTimeOfDay('电视墙 · 白天'), { tod: 'day', rest: '电视墙' });
  assert.deepEqual(splitTimeOfDay('U 形衣橱 · 化妆台 · 夜晚'), { tod: 'night', rest: 'U 形衣橱 · 化妆台' });
  assert.equal(splitTimeOfDay('晚上').tod, 'night');
  assert.equal(splitTimeOfDay('Night').tod, 'night');
  assert.equal(splitTimeOfDay('日景').tod, 'day');
  assert.deepEqual(splitTimeOfDay('电视墙'), { tod: null, rest: '电视墙' });
  assert.deepEqual(splitTimeOfDay(''), { tod: null, rest: '' });
});

test('停点 = 导出 PPT 的那一套页：隐藏页不播，顺序不变', () => {
  const project = sample();
  const pages = exportableSlides(renderDeck(project, { meta }));
  const stops = buildStops(pages, project);
  assert.deepEqual(stops.map((s) => s.key), pages.map((p) => p.key));
  assert.ok(!stops.some((s) => s.slide?.id === 'v-hidden'));
});

test('白天 / 夜晚：同空间同视角相邻的两张配成一段，过渡是交叉淡化；不同视角、不同空间不配', () => {
  const project = sample();
  const stops = stopsOf(project);
  const i = stops.findIndex((s) => s.slide?.id === 'v-day');
  assert.equal(stops[i + 1].slide.id, 'v-night');
  assert.equal(stops[i].segment, stops[i + 1].segment);
  assert.equal(stops[i].phase, 'day');
  assert.equal(stops[i + 1].phase, 'night');
  assert.equal(transitionKind(stops, i, i + 1), 'same');
  assert.equal(transitionKind(stops, i - 1, i), 'cut');
  // 主人房白天 → 茶室夜晚：不同空间，不配
  const b = stops.findIndex((s) => s.slide?.id === 'v-bed-day');
  assert.notEqual(stops[b].segment, stops[b + 1].segment);
  assert.equal(dayNightPair(project.slides[1], project.slides[2]), true);
  assert.equal(dayNightPair(project.slides[1], { ...project.slides[2], subtitle: '沙发 · 夜晚' }), false);
  // 目录：一对只列一次，名字不带白天
  const items = indexOf(stops).flatMap((g) => g.items);
  assert.equal(items.filter((it) => it.segment === stops[i].segment).length, 1);
  assert.ok(!/白天/.test(items.find((it) => it.segment === stops[i].segment).label));
});

test('白天 · 夜晚 · 白天：一对只配两张，第三张另起一段', () => {
  const project = sample();
  const third = { ...project.slides[1], id: 'v-day2', notes: [] };
  project.slides.splice(3, 0, third);
  const stops = stopsOf(project);
  const i = stops.findIndex((s) => s.slide?.id === 'v-day');
  assert.equal(stops[i].segment, stops[i + 1].segment);
  assert.equal(stops[i + 2].slide.id, 'v-day2');
  assert.notEqual(stops[i + 2].segment, stops[i + 1].segment);
});

test('满版效果图页：播放时右下角叠上设计说明（白字 + 托字渐变），PPT 那一页本身不变', () => {
  for (const lang of ['zh', 'en', 'bi']) {
    const project = sample(lang);
    const pages = exportableSlides(renderDeck(project, { meta }));
    const stops = buildStops(pages, project);
    const st = stops.find((s) => s.slide?.id === 'v-day');
    assert.ok(isFullView(st.page), lang);
    const orig = pages.find((p) => p.slideId === 'v-day');
    assert.ok(!orig.els.some((el) => /^showroom/.test(el.name || '')), `${lang} PPT 页不带说明`);
    const extra = st.page.els.filter((el) => /^showroom/.test(el.name || ''));
    const notes = extra.filter((el) => el.t === 'text');
    assert.ok(notes.length >= 2, `${lang} 有说明`);
    assert.ok(extra.some((el) => el.name === 'showroom-shade'), `${lang} 有托字`);
    for (const el of notes) {
      assert.ok(el.x >= 1300 && el.x + el.w <= 1920 && el.y + el.h <= 1080, `${lang} 说明在右下角、不出画布`);
      assert.ok(!el.edit, '说明不可编辑（只在播放器里）');
    }
    // 没有说明的满版页（夜晚那张）：什么都不加
    const night = stops.find((s) => s.slide?.id === 'v-night');
    assert.equal(night.page.els.length, pages.find((p) => p.slideId === 'v-night').els.length);
  }
});

test('铁律：停在任何一页时元素原样 —— 透明度 1、不位移、效果图 scale 1', () => {
  const stops = stopsOf(sample('bi'));
  for (const kind of ['cut', 'same']) {
    for (const s of stops) {
      const a = layerMotion('a', kind, 0, s.page.els);
      const b = layerMotion('b', kind, 1, s.page.els);
      assert.equal(a.opacity, 1);
      assert.equal(b.opacity, 1);
      s.page.els.forEach((el, i) => {
        for (const m of [a.el(el, i), b.el(el, i)]) {
          assert.deepEqual([m.opacity, m.ty, m.scale], [1, 0, 1], `${s.key} #${i}`);
          assert.equal(cssOf(m), null);
        }
      });
    }
  }
});

test('换页途中：字先淡出、效果图推近；新一页效果图从 1.05 退回 1，字依次淡入', () => {
  const stops = stopsOf(sample());
  const pg = stops.find((s) => s.slide?.id === 'v-kitchen').page;
  const hero = pg.els.findIndex(isHeroImg);
  const firstText = pg.els.findIndex((el) => el.t === 'text');
  const lastText = pg.els.length - 1 - [...pg.els].reverse().findIndex((el) => el.t === 'text');
  assert.ok(hero >= 0 && firstText >= 0);
  const a = layerMotion('a', 'cut', 0.4, pg.els);
  assert.ok(a.el(pg.els[firstText], firstText).opacity < 0.2);
  assert.ok(a.el(pg.els[hero], hero).scale > 1);
  const b0 = layerMotion('b', 'cut', 0.05, pg.els);
  assert.ok(b0.opacity < 0.05);
  assert.ok(Math.abs(b0.el(pg.els[hero], hero).scale - (1 + PUSH_IN)) < 1e-6);
  const b = layerMotion('b', 'cut', 0.75, pg.els);
  assert.ok(b.el(pg.els[firstText], firstText).opacity > b.el(pg.els[lastText], lastText).opacity, '先上面的字');
  // 白天 → 夜晚：版面不动，只有夜晚那层慢慢显出来
  const same = layerMotion('b', 'same', 0.5, pg.els);
  assert.ok(same.opacity > 0.3 && same.opacity < 0.7);
  assert.deepEqual(same.el(pg.els[hero], hero), { opacity: 1, ty: 0, scale: 1 });
  // 字不重影：「白天」先淡掉，「夜晚」等照片换过去了再出来
  assert.equal(layerMotion('a', 'same', 0.5, pg.els).el(pg.els[firstText], firstText).opacity, 0);
  assert.equal(same.el(pg.els[firstText], firstText).opacity, 0);
  const late = layerMotion('b', 'same', 0.8, pg.els);
  assert.ok(late.opacity * late.el(pg.els[firstText], firstText).opacity > 0.4);
});

test('位置的纯函数：同一位置不管从哪边滑过来，画面一样；停手吸到最近一页', () => {
  assert.deepEqual(frameAt(0, 5), { a: 0, b: null, f: 0 });
  assert.deepEqual(frameAt(2, 5), { a: 2, b: null, f: 0 });
  const mid = frameAt(2.4, 5);
  assert.equal(mid.a, 2);
  assert.equal(mid.b, 3);
  assert.ok(Math.abs(mid.f - 0.4) < 1e-9);
  assert.deepEqual(frameAt(9, 5), { a: 4, b: null, f: 0 });
  assert.deepEqual(frameAt(-1, 5), { a: 0, b: null, f: 0 });
  assert.equal(snapTarget(2.49, 5), 2);
  assert.equal(snapTarget(2.51, 5), 3);
  assert.equal(snapTarget(7, 5), 4);
  const stops = stopsOf(sample());
  const pg = stops[1].page;
  const m1 = layerMotion('b', 'cut', 0.6, pg.els);
  const m2 = layerMotion('b', 'cut', 0.6, pg.els);
  pg.els.forEach((el, i) => assert.deepEqual(m1.el(el, i), m2.el(el, i)));
});
