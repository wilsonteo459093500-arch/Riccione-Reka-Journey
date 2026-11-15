// 展厅播放（src/showroom/）：停点 = 导出 PPT 的同一套页（隐藏页不播）；白天 / 夜晚配对；满版页叠说明；
// 铁律：停在任何一页时，元素原样（透明度 1、不位移、效果图 scale 1 = 完整原图）；动效只在两页之间；
// 位置的纯函数：前后拖动结果一致
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { renderDeck, exportableSlides } from '../src/engine/deck.js';
import { splitTimeOfDay } from '../src/import/labels.js';
import { buildStops, dayNightPair, transitionKind, indexOf, isFullView } from '../src/showroom/timeline.js';
import { layerMotion, frameAt, snapTarget, isHeroImg, cssOf, PUSH_IN, sketchProgress } from '../src/showroom/motion.js';
import { analyseSketch, sketchFrame, PAPER } from '../src/showroom/sketch.js';
import { heroIndex, transitionWeight } from '../src/showroom/timeline.js';

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
  assert.equal(transitionKind(stops, i - 1, i), 'sketch', '换到效果图页 =「从无到有」');
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
  for (const kind of ['cut', 'same', 'sketch']) {
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

/** 测试图：米色墙 + 一个深色柜子（矩形）+ 一条浅色地脚线 */
function testImage(W = 160, H = 90) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const cab = x >= 40 && x < 100 && y >= 20 && y < 75;
    const floor = y >= 80;
    const c = cab ? [92, 64, 44] : floor ? [200, 190, 175] : [236, 230, 220];
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  return { d, W, H };
}

test('从无到有：线稿来自效果图本身（柜子的边上有线、墙面中间没有）；上色完成 = 原图逐像素相同；一开始是白纸', () => {
  const { d, W, H } = testImage();
  const an = analyseSketch(d, W, H);
  const at = (x, y) => an.mag[y * W + x];
  assert.ok(at(40, 45) > 0.5 || at(39, 45) > 0.5, '柜子左边有线');
  assert.ok(at(70, 47) < 0.05, '柜门中间没有线');
  assert.ok(at(15, 10) < 0.05, '墙中间没有线');
  for (const k of ['order', 'reveal']) for (const v of an[k]) assert.ok(v >= -1e-6 && v <= 1 + 1e-6, `${k} 在 0–1`);
  const out = new Uint8ClampedArray(d.length);
  sketchFrame(an, d, 1, 1, out);
  assert.deepEqual(Array.from(out), Array.from(d), '上色完成 = 原图');
  sketchFrame(an, d, 0, 0, out);
  assert.deepEqual([out[0], out[1], out[2]], PAPER, '一开始是白纸');
  // 线稿画完、还没上色：柜子边缘是墨线（比纸深），柜门中间还是纸
  sketchFrame(an, d, 1, 0, out);
  const px = (x, y) => out[(y * W + x) * 4];
  assert.ok(Math.min(px(39, 45), px(40, 45)) < PAPER[0] - 40, '边上画出了线');
  assert.equal(px(70, 47), PAPER[0], '中间还是白纸');
  // 同一张图每次分析结果一样（固定种子）
  const an2 = analyseSketch(d, W, H);
  assert.deepEqual(Array.from(an2.reveal.slice(0, 50)), Array.from(an.reveal.slice(0, 50)));
});

test('从无到有：换到效果图页才用；线稿先、上色后、字最后；这段滑得慢一些', () => {
  const stops = stopsOf(sample());
  const kitchen = stops.find((s) => s.slide?.id === 'v-kitchen');
  assert.ok(kitchen.hero >= 0 && kitchen.page.els[kitchen.hero].edit?.field === 'image', '图文页的效果图');
  const full = stops.find((s) => s.slide?.id === 'v-day');
  assert.equal(full.page.els[full.hero].name, 'photo:image', '满版页的效果图');
  assert.equal(stops.find((s) => s.slide?.kind === 'floor').hero, -1, '楼层页不画线稿');
  assert.equal(heroIndex({ kind: 'materials', els: [] }), -1);
  assert.ok(transitionWeight('sketch') > transitionWeight('cut'));
  const a = sketchProgress(0.3);
  const b = sketchProgress(0.7);
  assert.ok(a.lineQ > 0 && a.colQ === 0, '先画线');
  assert.ok(b.lineQ === 1 && b.colQ > 0 && b.colQ < 1, '再上色');
  assert.deepEqual(sketchProgress(1), { lineQ: 1, colQ: 1 });
  const pg = kitchen.page;
  const m = layerMotion('b', 'sketch', 0.6, pg.els);
  const firstText = pg.els.findIndex((el) => el.t === 'text');
  assert.equal(m.el(pg.els[firstText], firstText).opacity, 0, '上色时字还没出来');
  assert.ok(m.sketch && m.sketch.lineQ === 1);
  // 满版页的托字渐变：线稿、上色时还没有（不压在白纸上），和字一起出来
  const fp = full.page;
  const sh = fp.els.findIndex((el) => el.t === 'rect' && el.name === 'shade');
  assert.ok(sh >= 0);
  assert.equal(layerMotion('b', 'sketch', 0.5, fp.els).el(fp.els[sh], sh).opacity, 0);
  assert.equal(layerMotion('b', 'sketch', 1, fp.els).el(fp.els[sh], sh).opacity, 1);
});
