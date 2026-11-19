// 走进去 · 工具面板（src/studio/walk/PaintTray.jsx、FurnishPanel.jsx、LightPanel.jsx、MeasureLayer.jsx、PhotoPanel.jsx、
// walk-tools.css —— docs/walk/SPEC.md §5 · U5b）：
//   刷颜色 / 地板：托盘只列放得上这个表面的材质（和材质栏同一份 MATERIALS + fits）、给名字不给编号（溪岸板材的厂家编号不出现）、
//     我们做的表面（柜体、台面、木 / 石墙板）打记号、别的不打；换不了的地方（玻璃、外墙）一句提示；地板跟着你站的房间（厨卫 → 砖）。
//   家具：名字 + 我们做 / 家具示意 / 保留你家原有；贴墙的不能转、不能挪。灯光：白天 / 晚上、四个时刻。
//   拍照：新的在上面、房间名 / 楼层 / 钟点；许愿模式没有任何下载，员工版有「下载这张」。量尺：mm + 尺 / ft、墙的长 × 高。
//   中 / 英都画一遍：英文版看得到的字没有中文。样式：选择器都带 walk、触控 ≥ 44px、没有写死的颜色、z < 110。
// .jsx 用 esbuild 打包成临时的 ESM（react-dom/server 画成 HTML，不跑 effect）；i18n、材质表、words.js 都从同一个包里拿
// （和面板用的是同一份：登记的板材、切换的语言面板都看得到）。
// 跑法：node test/walk-tools.test.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { fromStoredProject } from '../src/studio/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let n = 0;
let failed = 0;
async function test(name, fn) {
  n++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 5).join('\n    ')}`);
  }
}

console.log('走进去 · 工具面板（walk-tools）');

// ───────────────────────── 打包 ─────────────────────────

const B = await (async () => {
  const r = await build({
    stdin: {
      contents: [
        "import './src/studio/walk/words.js';",
        "export * as PAINT from './src/studio/walk/PaintTray.jsx';",
        "export * as FURN from './src/studio/walk/FurnishPanel.jsx';",
        "export * as LIGHT from './src/studio/walk/LightPanel.jsx';",
        "export * as MEAS from './src/studio/walk/MeasureLayer.jsx';",
        "export * as PHOTO from './src/studio/walk/PhotoPanel.jsx';",
        "export * as I18N from './src/shared/i18n.js';",
        "export * as MAT from './src/shared/materials.js';",
        "export { isOfferSlot } from './src/studio/offer.js';",
        "export { addMark, MAX_MARKS } from './src/studio/walk/marks.js';",
        "export { default as EWL } from './src/shared/i18n/en-walktools.js';",
        "export { default as EN } from './src/shared/i18n/en.js';",
        "import { createElement } from 'react';",
        "import { renderToStaticMarkup } from 'react-dom/server.browser';",
        'export const render = (C, p) => renderToStaticMarkup(createElement(C, p));',
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'jsx',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    logLevel: 'silent',
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const file = path.join(os.tmpdir(), `walk-tools-${process.pid}.mjs`);
  fs.writeFileSync(file, r.outputFiles[0].text);
  try {
    return await import(pathToFileURL(file).href);
  } finally {
    fs.rmSync(file, { force: true });
  }
})();
const { render, PAINT, FURN, LIGHT, MEAS, PHOTO, MAT } = B;
const setLang = (l) => B.I18N.setLang(l, { reload: false });
const L = (o) => B.I18N.L(o);

const fixture = (f) => fromStoredProject(JSON.parse(read(`test/fixtures/walk/${f}.json`)));
const CONDO = fixture('condo3');
const SEMID = fixture('semid2');
const noop = () => {};
const HAN = /[㐀-鿿]/;
const count = (html, re) => (html.match(re) || []).length;
const textOf = (html) =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&[a-z]+;|&#\d+;/g, ' ');
/** 英文版：看得到的字（标签外的文字 + aria-label / title）没有中文 */
const noHan = (html, what) => {
  const vis = [textOf(html), ...[...html.matchAll(/(?:aria-label|title)="([^"]*)"/g)].map((m) => m[1])].join(' ');
  assert.ok(!HAN.test(vis), `${what}：英文版里有中文 ${vis.match(/\S*[㐀-鿿]\S*/g)}`);
};
const both = async (fn) => {
  for (const lang of ['zh', 'en']) {
    setLang(lang);
    try {
      await fn(lang);
    } finally {
      setLang('zh');
    }
  }
};
/** 托盘里画出来的样板：[{ id, name, make }] */
const chipsOf = (html) =>
  [...html.matchAll(/<button[^>]*class="walk-chip[^"]*"[^>]*data-mat="([^"]+)"[^>]*aria-label="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => ({ id: m[1], name: m[2], make: m[3].includes('st-make-dot') }));
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
const withMats = (materials, extra = {}) => ({ ...CONDO, materials: { ...CONDO.materials, ...materials }, ...extra });

// ───────────────────────── 1. 刷颜色 / 地板 ─────────────────────────

await test('托盘的分组：只放得上这个表面的（MATERIALS + fits，和材质栏同一份）；类别按表面的顺序；没有的表面 → 空', () => {
  for (const s of MAT.SLOTS) {
    const g = PAINT.trayGroups(s.id);
    const all = g.flatMap((x) => x.items);
    assert.ok(all.length > 0, s.id);
    for (const m of all) assert.ok(MAT.fits(m.id, s.id), `${s.id}：${m.id} 放不上`);
    // 放得上的程序化材质一个都不少
    assert.deepEqual(all.map((m) => m.id).sort(), MAT.MATERIALS.filter((m) => MAT.fits(m.id, s.id)).map((m) => m.id).sort(), s.id);
    assert.deepEqual(
      g.map((x) => x.id),
      s.cats.filter((c) => all.some((m) => m.cat === c)),
      `${s.id} 的类别顺序`,
    );
  }
  assert.deepEqual(PAINT.trayGroups('nope'), []);
  assert.deepEqual(PAINT.trayGroups(null), []);
  // 一开始停在现在用的那一组
  const fl = PAINT.trayGroups('floor');
  assert.equal(PAINT.trayTab(fl, 'grey-tile'), 'tile');
  assert.equal(PAINT.trayTab(fl, 'carrara'), 'stone');
  assert.equal(PAINT.trayTab(fl, 'whatever'), 'wood');
  assert.equal(PAINT.trayTab([], 'x'), null);
});

await test('刷颜色 / 地板：点到的是哪个表面（刷颜色还没点 = 提示；点到玻璃、外墙 = null；地板跟着你站的房间、厨卫铺砖）', () => {
  const { traySlot } = PAINT;
  assert.equal(traySlot('paint', null, { type: 'living' }), undefined);
  assert.equal(traySlot('paint', { slot: null }, null), null);
  assert.equal(traySlot('paint', { slot: 'cabinetry' }, null), 'cabinetry');
  assert.equal(traySlot('floor', null, { type: 'living' }), 'floor');
  assert.equal(traySlot('floor', null, { type: 'kitchen' }), 'tile');
  assert.equal(traySlot('floor', null, { type: 'bath' }), 'tile');
  assert.equal(traySlot('floor', null, null), 'floor');
  assert.equal(traySlot('floor', { slot: 'tile' }, { type: 'living' }), 'tile', '点了厨房的地面：换厨房那一种');
});

await test('托盘（中 / 英）：柜体 —— 只有放得上的、名字（不是 id）、每一块都是「我们做」；现在用的那一块圈出来', () =>
  both((lang) => {
    for (const cur of ['light-oak', 'white-lacquer']) {
      const project = withMats({ cabinetry: cur });
      const html = render(PAINT.MaterialTray, { slot: 'cabinetry', project, mode: 'paint', onChoose: noop, onClose: noop });
      const chips = chipsOf(html);
      const want = MAT.MATERIALS.filter((m) => m.cat === MAT.MAT_BY_ID[cur].cat && MAT.fits(m.id, 'cabinetry'));
      assert.deepEqual(
        chips.map((c) => c.id),
        want.map((m) => m.id),
        `${lang} ${cur}：停在 ${MAT.MAT_BY_ID[cur].cat} 那一组`,
      );
      for (const c of chips) {
        assert.equal(unesc(c.name), L(MAT.MAT_BY_ID[c.id]), '名字');
        assert.ok(c.make, `${c.id}：柜体是我们做的`);
      }
      assert.equal(count(html, /class="walk-chip is-cur"/g), 1);
      assert.match(html, new RegExp(`class="walk-chip is-cur" data-mat="${cur}"`));
      assert.match(html, /data-walk-slot="cabinetry"/);
      assert.match(textOf(html), lang === 'en' ? /Cabinetry/ : /柜体/);
      assert.match(textOf(html), lang === 'en' ? /Now: / : /现在：/);
      assert.match(textOf(html), lang === 'en' ? /We make this/ : /我们做/);
      // 两组（木 / 漆）→ 分段；收起
      assert.equal(count(html, /<div class="walk-seg"/g), 1);
      assert.match(html, /class="walk-panel-x"/);
      if (lang === 'en') noHan(html, `柜体 ${cur}`);
    }
  }));

await test('托盘：墙面（油漆）、地毯不打「我们做」；主题墙只有木 / 石的墙板打；锁住的（客人家里留下来的）写「保留你家原有」', () =>
  both((lang) => {
    const walls = chipsOf(render(PAINT.MaterialTray, { slot: 'walls', project: CONDO, onChoose: noop, onClose: noop }));
    assert.ok(walls.length >= 10 && walls.every((c) => !c.make && MAT.MAT_BY_ID[c.id].cat === 'paint'));
    const rugs = render(PAINT.MaterialTray, { slot: 'rugs', project: CONDO, onChoose: noop, onClose: noop });
    assert.ok(chipsOf(rugs).every((c) => !c.make));
    assert.doesNotMatch(rugs, /st-offer-tag/, '地毯：现在的材质旁边也不标');
    // 主题墙：每一组都看一遍
    for (const cur of ['walnut', 'sage', 'travertine', 'microcement']) {
      const chips = chipsOf(render(PAINT.MaterialTray, { slot: 'feature', project: withMats({ feature: cur }), onChoose: noop, onClose: noop }));
      assert.ok(chips.length > 0);
      for (const c of chips) assert.equal(c.make, B.isOfferSlot('feature', c.id), `主题墙 ${c.id}`);
    }
    assert.ok(chipsOf(render(PAINT.MaterialTray, { slot: 'feature', project: withMats({ feature: 'sage' }), onChoose: noop, onClose: noop })).every((c) => !c.make), '刷漆的主题墙是油漆');
    // 锁住的柜体
    const kept = render(PAINT.MaterialTray, { slot: 'cabinetry', project: withMats({}, { locked: { cabinetry: true } }), onChoose: noop, onClose: noop });
    assert.match(kept, /st-offer-tag kept/);
    assert.match(textOf(kept), lang === 'en' ? /Kept from your home/ : /保留你家原有/);
    if (lang === 'en') noHan(kept, '锁住的柜体');
  }));

await test('托盘：溪岸板材排第一组，只写显示名 —— 厂家编号（XA-TP-99）不出现；织系列、隐藏的板不列', async () => {
  const recs = [
    { id: 'sail-t-wt1', kind: 'wood', hex: '#694330', seq: null, code: 'XA-TP-99', name: { zh: '测试胡桃', en: 'Test walnut' }, uses: ['cabinetry', 'feature'], img: false },
    { id: 'sail-t-wt2', kind: 'solid', hex: '#ECEBE6', seq: 12, code: 'GKL018Y', name: { zh: '测试亮白', en: 'Test white' }, uses: ['cabinetry', 'feature'], fav: true, img: false },
    { id: 'sail-t-wt3', kind: 'weave', hex: '#B9A98E', seq: null, code: 'SG-PK02-1', name: { zh: '测试编织', en: 'Test weave' }, img: false },
    { id: 'sail-t-wt4', kind: 'wood', hex: '#866043', seq: null, code: 'AG337', name: { zh: '测试隐藏', en: 'Test hidden' }, uses: ['cabinetry'], hidden: true, img: false },
  ];
  const r = MAT.registerBoards(recs, { src: 'bundled' });
  assert.deepEqual(r.skipped, []);
  try {
    const g = PAINT.trayGroups('cabinetry');
    assert.equal(g[0].id, 'sail');
    assert.deepEqual(
      g[0].items.map((m) => m.id),
      ['sail-t-wt2', 'sail-t-wt1'],
      '★ 常用在前；织系列、隐藏的不列',
    );
    assert.ok(!PAINT.trayGroups('floor').some((x) => x.id === 'sail'), '地板没有板材');
    assert.ok(!PAINT.trayGroups('countertop').some((x) => x.id === 'sail'), '台面没有板材');
    await both((lang) => {
      const html = render(PAINT.MaterialTray, { slot: 'cabinetry', project: withMats({ cabinetry: 'sail-t-wt1' }), onChoose: noop, onClose: noop });
      const chips = chipsOf(html);
      assert.deepEqual(
        chips.map((c) => c.id),
        ['sail-t-wt2', 'sail-t-wt1'],
      );
      assert.ok(chips.every((c) => c.make));
      assert.ok(html.includes(lang === 'en' ? 'Test walnut' : '测试胡桃'));
      for (const code of ['XA-TP-99', 'GKL018Y', 'SG-PK02-1', 'AG337']) assert.ok(!html.includes(code), `${lang}：厂家编号 ${code} 出现了`);
      assert.ok(!html.includes('测试编织') && !html.includes('测试隐藏'));
      assert.match(textOf(html), lang === 'en' ? /sAil boards/ : /溪岸板材/);
    });
  } finally {
    MAT.unregisterBoards(
      recs.map((x) => x.id),
      { src: 'bundled' },
    );
  }
});

await test('刷颜色还没点：提示「点一下想换的地方」；点到换不了的：提示，没有样板；地板：直接是你站的房间的地面', () =>
  both((lang) => {
    const first = render(PAINT.default, { ctl: null, engine: null, project: CONDO, api: {}, room: { id: 'liv', type: 'living' }, mode: 'paint', onClose: noop });
    assert.match(textOf(first), lang === 'en' ? /Tap what you want to change/ : /点一下想换的地方/);
    assert.equal(chipsOf(first).length, 0);
    const none = render(PAINT.TrayHint, { none: true, onClose: noop });
    assert.match(textOf(none), lang === 'en' ? /can't be changed/ : /换不了颜色/);
    assert.equal(chipsOf(none).length, 0);
    // 地板：客厅 → 地板；厨房 → 厨卫墙地砖
    const liv = render(PAINT.default, { ctl: null, engine: null, project: CONDO, api: {}, room: CONDO.plan.floors[0].rooms.find((r) => r.id === 'liv'), mode: 'floor', onClose: noop });
    assert.match(liv, /data-walk-slot="floor"/);
    assert.ok(chipsOf(liv).length >= 5);
    assert.match(liv, new RegExp(`class="walk-chip is-cur" data-mat="${CONDO.materials.floor}"`));
    const kit = render(PAINT.default, { ctl: null, engine: null, project: CONDO, api: {}, room: CONDO.plan.floors[0].rooms.find((r) => r.id === 'kit'), mode: 'floor', onClose: noop });
    assert.match(kit, /data-walk-slot="tile"/);
    assert.ok(chipsOf(kit).every((c) => MAT.fits(c.id, 'tile') && !c.make));
    if (lang === 'en') for (const [h, w] of [[first, '提示'], [none, '换不了'], [liv, '地板'], [kit, '厨房']]) noHan(h, w);
  }));

await test('托盘：点一块 → api.dropMaterial(slot, id)（源码里就是这一条路，不用 engine.slotAt）', () => {
  const src = read('src/studio/walk/PaintTray.jsx');
  assert.match(src, /api\?\.dropMaterial\?\.\(slot, id\)/);
  assert.doesNotMatch(src, /slotAt/);
  assert.match(src, /highlightSlot\(slot\)/);
  assert.match(src, /highlightSlot\(null\)/);
});

// ───────────────────────── 2. 家具 ─────────────────────────

const itemOf = (kind) => CONDO.furniture.find((f) => f.kind === kind);

await test('家具（中 / 英）：沙发 = 家具示意、可以转、可以拖；橱柜 = 我们做；电视墙贴墙 = 不能转、不能挪；锁住的柜子 = 保留你家原有', () =>
  both((lang) => {
    const card = (kind, project = CONDO) => render(FURN.ItemCard, { item: itemOf(kind), project, onRotate: noop, onRemove: noop, onClose: noop });
    const sofa = card('sofa');
    assert.match(textOf(sofa), lang === 'en' ? /Sofa/ : /沙发/);
    assert.match(sofa, /st-offer-tag illu/);
    assert.doesNotMatch(sofa, /st-offer-tag"|st-offer-tag kept/);
    assert.match(sofa, /data-walk-act="rotate"/);
    assert.match(sofa, /data-walk-act="remove"/);
    assert.match(textOf(sofa), lang === 'en' ? /Press and drag/ : /按住它拖动/);
    assert.match(textOf(sofa), new RegExp(L(B.MAT.MAT_BY_ID[CONDO.materials.upholstery])), '它那一面的材质名');
    const kit = card('kitchenRun');
    assert.match(kit, /class="st-offer-tag"/);
    assert.match(textOf(kit), lang === 'en' ? /We make this/ : /我们做/);
    const tv = card('tvWall');
    assert.doesNotMatch(tv, /data-walk-act="rotate"/, '贴墙的不能转');
    assert.match(tv, /data-walk-act="remove"/);
    assert.match(textOf(tv), lang === 'en' ? /fixed to the wall/ : /贴在墙上的/);
    const kept = card('wardrobe', { ...CONDO, locked: { cabinetry: true } });
    assert.match(kept, /st-offer-tag kept/);
    // 地毯、绿植：什么都不标
    assert.doesNotMatch(card('plant'), /st-offer-tag/);
    if (lang === 'en') for (const [h, w] of [[sofa, '沙发'], [kit, '橱柜'], [tv, '电视墙'], [kept, '锁住']]) noHan(h, w);
  }));

await test('家具：没选中 → 一句提示、没有按钮；itemFacts 的名字 = CATALOG 的名字（和鸟瞰的选中条一样）', () =>
  both((lang) => {
    const html = render(FURN.default, { ctl: null, project: CONDO, api: {}, onClose: noop });
    assert.match(textOf(html), lang === 'en' ? /Tap a piece of furniture/ : /点一件家具选中它/);
    assert.doesNotMatch(html, /data-walk-act/);
    const f = FURN.itemFacts(itemOf('bed'), CONDO);
    assert.equal(f.name, lang === 'en' ? 'Bed' : '床');
    assert.equal(f.tag, 'illu');
    assert.equal(f.wall, false);
    assert.equal(FURN.itemFacts(itemOf('curtains'), CONDO).wall, true);
    assert.equal(FURN.itemFacts({ kind: 'nope' }, CONDO), null);
    if (lang === 'en') noHan(html, '没选中');
  }));

// ───────────────────────── 3. 灯光 ─────────────────────────

await test('灯光（中 / 英）：白天 / 晚上的开关、太阳弧、四个时刻；晚上 = 灯都亮着', () =>
  both((lang) => {
    const day = render(LIGHT.default, { project: { ...CONDO, time: 12.8 }, api: {}, onClose: noop });
    assert.match(day, /data-walk-light="day" aria-pressed="true"|aria-pressed="true" data-walk-light="day"/);
    assert.match(day, /class="sunarc /, '鸟瞰日光面板的太阳弧');
    assert.match(day, /12:48/);
    assert.equal(count(day, /<div class="walk-light-presets"[\s\S]*?<\/div>/g), 1);
    const presets = day.match(/<div class="walk-light-presets"[\s\S]*?<\/div>/)[0];
    assert.equal(count(presets, /<button /g), 4);
    assert.equal(count(presets, /aria-pressed="true"/g), 1, '正午那一档');
    const night = render(LIGHT.default, { project: { ...CONDO, time: 22.2 }, api: {}, onClose: noop });
    assert.match(night, /class="on" aria-pressed="true" data-walk-light="night"/);
    assert.match(textOf(night), lang === 'en' ? /the lights are on/ : /灯都亮着/);
    if (lang === 'en') {
      noHan(day, '白天');
      noHan(night, '晚上');
    }
  }));

await test('灯光：哪个钟点算晚上（和 daylight() 的夜灯一样）、离哪一档近', () => {
  assert.equal(LIGHT.isNight(12), false);
  assert.equal(LIGHT.isNight(18.5), false);
  assert.equal(LIGHT.isNight(21), true);
  assert.equal(LIGHT.isNight(22.2), true);
  assert.equal(LIGHT.isNight(5), true);
  assert.deepEqual(
    [LIGHT.nearPreset(12.5).near.id, LIGHT.nearPreset(12.5).on],
    ['midday', true],
  );
  assert.equal(LIGHT.nearPreset(15.5).on, false);
  const src = read('src/studio/walk/LightPanel.jsx');
  assert.match(src, /import SunArc from '\.\.\/ui\/SunArc\.jsx'/);
  assert.match(src, /DAY_PRESETS/);
  assert.match(src, /api\?\.setTime\?\.\(h\)/);
});

// ───────────────────────── 4. 量尺 ─────────────────────────

await test('量尺的字（中 / 英）：两点 = mm + 尺 / ft（中点上）；点墙 = 墙长 / 墙高 + 长 × 高；还没点 / 点了一下 = 提示', () =>
  both((lang) => {
    const en = lang === 'en';
    const v0 = MEAS.measureView(null);
    assert.deepEqual([v0.lines, v0.at, v0.result], [[], null, '']);
    assert.equal(v0.hint, en ? 'Tap twice to measure · tap a wall for its size' : '点两下量距离 · 点墙看长和高');
    const a = { x: 0, y: 1, z: 0 };
    const b = { x: 2.1, y: 1, z: 0 };
    const v2 = MEAS.measureView({ a, b, mm: 2100, text: 'ignored', wall: null });
    assert.deepEqual(v2.lines, [en ? '2,100 mm · about 7 ft' : '2,100 mm · 约 7 尺 / ft']);
    assert.equal(v2.result, v2.lines[0]);
    assert.deepEqual(v2.at, { x: 1.05, y: 1, z: 0 });
    // 事件里没给 mm：自己量
    assert.equal(MEAS.measureView({ a, b: { x: 0, y: 1, z: 3.2 } }).result, en ? '3,200 mm · about 10.5 ft' : '3,200 mm · 约 10.5 尺 / ft');
    const vw = MEAS.measureView({ a, b: null, wall: { id: 'w1', lengthMm: 3200, heightMm: 2800, text: 'x' } });
    assert.deepEqual(vw.lines, en ? ['Wall length 3,200 mm · about 10.5 ft', 'Wall height 2,800 mm · about 9 ft'] : ['墙长 3,200 mm · 约 10.5 尺 / ft', '墙高 2,800 mm · 约 9 尺 / ft']);
    assert.equal(vw.result, en ? 'Wall 3,200 × 2,800 mm (length × height)' : '墙 3,200 × 2,800 mm（长 × 高）');
    assert.equal(vw.at, a);
    const v1 = MEAS.measureView({ a, b: null, wall: null });
    assert.deepEqual([v1.lines, v1.at], [[], null]);
    assert.equal(v1.hint, en ? 'Tap a second point' : '再点一下另一点');
    // 画出来：还没量 → 控制条（提示 + 收起），没有标签、没有「清掉」
    const html = render(MEAS.default, { ctl: null, onClose: noop });
    assert.match(html, /^<div class="walk-measure">/);
    assert.match(html, /class="walk-measure-bar glass"/);
    assert.doesNotMatch(html, /walk-measure-label|data-walk-act="clear"/);
    if (en) noHan(html, '量尺');
  }));

await test('量尺：标签只在量尺开着、有标签时跑 requestAnimationFrame（卸下就停），位置来自 ctl.project', () => {
  const src = read('src/studio/walk/MeasureLayer.jsx');
  assert.match(src, /ctl\.project\(/);
  assert.match(src, /cancelAnimationFrame\(raf\)/);
  assert.match(src, /ctl\?\.clearMeasure\?\.\(\)/);
});

// ───────────────────────── 5. 拍照 ─────────────────────────

/** 三个收藏的角度（从旧到新）：客厅、主卧、外面（不在房间里） */
function marked(base) {
  const fl = base.plan.floors;
  const last = fl[fl.length - 1];
  let l = [];
  l = B.addMark(l, { floor: fl[0].id, x: 1, z: 1, yaw: 0, pitch: 0, hour: 10, room: fl[0].rooms[0].id }, { at: new Date('2026-11-19T01:00:00Z') });
  l = B.addMark(l, { floor: last.id, x: 2, z: 2, yaw: 1, pitch: 0, hour: 21, room: last.rooms[last.rooms.length - 1].id }, { at: new Date('2026-11-19T02:00:00Z') });
  l = B.addMark(l, { floor: fl[0].id, x: 3, z: 3, yaw: 2, pitch: 0, hour: 18.5, room: null }, { at: new Date('2026-11-19T03:00:00Z') });
  return { ...base, walkMarks: l };
}
const apiOf = (wish) => ({ setMarks: noop, flash: noop, setTime: noop, shoot: wish ? null : () => Promise.resolve() });

await test('拍照（中 / 英）：新的在上面；房间名来自平面图、多层写哪一层、那时几点；不在房间里 → 角度 n', () =>
  both((lang) => {
    for (const base of [CONDO, SEMID]) {
      const p = marked(base);
      const html = render(PHOTO.default, { ctl: null, project: p, api: apiOf(false), wish: false, staff: true, onClose: noop });
      const order = [...html.matchAll(/data-mark="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(
        order,
        p.walkMarks.map((m) => m.id).reverse(),
        '新的在上面',
      );
      const rows = PHOTO.markRows(p);
      assert.deepEqual(
        rows.map((r) => r.mark.id),
        order,
      );
      const fl = base.plan.floors;
      const multi = fl.length > 1;
      // 最新的那个：不在房间里（第 3 个）
      assert.equal(rows[0].name, lang === 'en' ? 'View 3' : '角度 3');
      assert.equal(rows[0].sub, multi ? `${lang === 'en' ? 'Ground floor' : '一楼'} · 18:30` : '18:30');
      assert.equal(rows[0].night, false);
      assert.equal(rows[1].night, true, '21:00 是晚上');
      assert.ok(rows[1].sub.endsWith('21:00'));
      if (multi) assert.ok(rows[1].sub.startsWith(lang === 'en' ? 'First floor' : '二楼'), rows[1].sub);
      assert.ok(!HAN.test(rows[2].name) || lang === 'zh');
      assert.match(textOf(html), lang === 'en' ? /Save this view/ : /收藏这个角度/);
      assert.equal(count(html, /class="walk-photo-x"/g), 3);
      if (lang === 'en') noHan(html, `拍照 ${base.id}`);
    }
    // 没有收藏：一句说明，没有列表
    const empty = render(PHOTO.default, { ctl: null, project: { ...CONDO, walkMarks: [] }, api: apiOf(false), wish: false, staff: true, onClose: noop });
    assert.doesNotMatch(empty, /walk-photo-list/);
  }));

await test('拍照：许愿模式什么都不下载（没有「下载这张」，就算 api.shoot 给了也不画）；员工版、api.shoot 有 → 有「下载这张」', () =>
  both((lang) => {
    const p = marked(CONDO);
    const wish = render(PHOTO.default, { ctl: null, project: p, api: apiOf(true), wish: true, staff: false, onClose: noop });
    const wish2 = render(PHOTO.default, { ctl: null, project: p, api: apiOf(false), wish: true, staff: false, onClose: noop });
    for (const html of [wish, wish2]) {
      assert.doesNotMatch(html, /data-walk-act="shoot"/);
      assert.doesNotMatch(textOf(html), /下载|Download/i);
      assert.doesNotMatch(html, /\sdownload(=|\s|>)/i);
      assert.doesNotMatch(html, /lucide-download/);
    }
    const staff = render(PHOTO.default, { ctl: null, project: p, api: apiOf(false), wish: false, staff: true, onClose: noop });
    assert.match(staff, /data-walk-act="shoot"/);
    assert.match(textOf(staff), lang === 'en' ? /Download this image/ : /下载这张/);
    const noShoot = render(PHOTO.default, { ctl: null, project: p, api: { ...apiOf(false), shoot: null }, wish: false, staff: true, onClose: noop });
    assert.doesNotMatch(noShoot, /data-walk-act="shoot"/);
  }));

await test('拍照：「收藏这个角度」→ api.setMarks(addMark(marksOf(project), ctl.photo()))；× → removeMark；点一行 → ctl.goto', () => {
  const src = read('src/studio/walk/PhotoPanel.jsx');
  assert.match(src, /ctl\?\.photo\?\.\(\)/);
  assert.match(src, /addMark\(list, pose\)/);
  assert.match(src, /api\.setMarks\(next\)/);
  assert.match(src, /removeMark\(marksOf\(project\), id\)/);
  assert.match(src, /ctl\?\.goto\?\.\(mark\)/);
});

// ───────────────────────── 6. 样式、词典、守门 ─────────────────────────

/** walk-tools.css → [{ at, selectors, decls }]（一层 @media；@keyframes 跳过） */
function cssRules(text) {
  const s = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}|(@[^{}]+)\{|\}/g;
  const at = [];
  let skip = 0;
  for (const m of s.matchAll(re)) {
    if (m[3]) {
      if (/^@(-\w+-)?keyframes/.test(m[3].trim()) || skip) skip++;
      else at.push(m[3].trim());
      continue;
    }
    if (!m[1]) {
      if (skip) skip--;
      else at.pop();
      continue;
    }
    if (skip) continue;
    const decls = {};
    for (const d of m[2].split(';')) {
      const k = d.indexOf(':');
      if (k > 0) decls[d.slice(0, k).trim()] = d.slice(k + 1).trim();
    }
    out.push({ at: [...at], selectors: m[1].split(',').map((x) => x.trim()), decls });
  }
  return out;
}

await test('walk-tools.css：选择器都带 walk；按钮 ≥ 44px；没有写死的颜色；不比提示（110）高', () => {
  const css = read('src/studio/walk/walk-tools.css');
  const rules = cssRules(css);
  assert.ok(rules.length > 40, `读到的规则太少：${rules.length}`);
  for (const r of rules) for (const sel of r.selectors) assert.match(sel, /walk/, sel);
  const top = (sel) => rules.filter((r) => !r.at.length && r.selectors.includes(sel)).reduce((a, r) => ({ ...a, ...r.decls }), {});
  const px = (v) => parseFloat(v);
  for (const sel of ['.walk-panel-x', '.walk-photo-x']) assert.ok(px(top(sel).width) >= 44 && px(top(sel).height) >= 44, sel);
  for (const sel of ['.walk-btn', '.walk-seg button', '.walk-chip', '.walk-photo-go', '.walk-light-presets button', '.walk-panel-head']) assert.ok(px(top(sel)['min-height']) >= 44, `${sel} min-height`);
  for (const r of rules) if ('z-index' in r.decls) assert.ok(+r.decls['z-index'] < 110, r.selectors.join());
  assert.ok(!/(?<![\w&#/-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), '没有写死的颜色');
  // 量尺的控制条：工具轮正上方（walk.css 给的变量）；它自己接指针
  const bar = top('.walk-measure-bar');
  assert.equal(bar.bottom, 'var(--walk-panel-b)');
  assert.equal(bar['pointer-events'], 'auto');
  assert.equal(top('.walk-measure')['pointer-events'], 'none');
  // 每个面板都 import 这份样式
  for (const f of ['PaintTray', 'FurnishPanel', 'LightPanel', 'MeasureLayer', 'PhotoPanel']) assert.match(read(`src/studio/walk/${f}.jsx`), /import '\.\/walk-tools\.css';/, f);
});

await test('英文：面板的字都在 en-walktools.js 或总表；en-walktools.js 不和总表、en-walk.js 打架', () => {
  const EW = B.EWL;
  assert.ok(Object.keys(EW).length >= 25);
  for (const [k, v] of Object.entries(EW)) {
    assert.ok(v && !HAN.test(v), `${k} → ${v}`);
    if (B.EN[k] != null) assert.equal(B.EN[k], v, `${k}：和总表不一样`);
  }
});

await test('守门：面板不碰存储 / 下载 / 选文件；不用 engine.slotAt；不放价钱、预算、工期', () => {
  for (const f of ['PaintTray', 'FurnishPanel', 'LightPanel', 'MeasureLayer', 'PhotoPanel']) {
    const src = read(`src/studio/walk/${f}.jsx`).replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB|createObjectURL|download=|\.download\b|type="file"|slotAt/, f);
    assert.doesNotMatch(src, /factoryCode|codesFor|board\.code|price|budget|RM\s?\d/i, `${f}：客人看不到编号、价钱、预算`);
  }
});

console.log(`\n${n - failed}/${n} 通过`);
if (failed) process.exit(1);
