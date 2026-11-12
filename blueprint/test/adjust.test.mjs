// 手动调整版面（slide.adjust）：分组、文字块位移 / 缩放、照片框和取景、套进整套渲染和 PPT 导出
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { test } from './harness.mjs';
import {
  groupsOf, applyAdjust, adjustKey, viewCrop, clampView, wholeZoom, autoView, clampBox, cleanBlockAdjust, setAdjust, clearAdjust,
  ADJUST_LIMITS,
} from '../src/engine/adjust.js';
import { placeImage } from '../src/engine/spec.js';
import { newProject, assembleDeck } from '../src/engine/model.js';
import { renderDeck, exportableSlides } from '../src/engine/deck.js';
import { buildPptx } from '../src/engine/pptx/writer.js';
import { remapAssetSrcs } from '../src/lib/bundle.js';

const run = (text, size = 20, extra = {}) => ({ text, font: 'light', size, color: '241C12', ...extra });
const textEl = (x, y, w, h, field, content, size = 20, extra = {}) => ({ t: 'text', x, y, w, h, paras: [{ align: 'l', lineHeight: 30, runs: [run(content, size, { spacing: 2 })] }], edit: { field }, ...extra });
const NAT = { w: 4000, h: 2000 }; // 2 : 1
const page = () => ({
  bg: 'F6F2EA',
  els: [
    { t: 'img', x: 0, y: 0, w: 1000, h: 1000, src: 'asset:a', fit: 'cover', ax: 0.5, ay: 0.5, nat: NAT, edit: { field: 'image' } },
    { t: 'rect', x: 1100, y: 80, w: 200, h: 2, fill: '000000' }, // 装饰线：没有 edit，不能调
    textEl(1100, 100, 600, 40, 'title', 'LIVING AREA', 30),
    textEl(1100, 150, 400, 36, 'title', '客厅', 28),
    textEl(1100, 400, 500, 30, 'room', '一楼　客厅', 16),
  ],
});

test('groupsOf：edit.field 相同的元素一组（中英文标题一起动）；只有一张图的组是照片；没有 edit 的不算；第 2 页起组名带页序号', () => {
  const g = groupsOf(page());
  assert.deepEqual(g.map((x) => [x.key, x.type, x.indexes]), [['image', 'photo', [0]], ['title', 'block', [2, 3]], ['room', 'block', [4]]]);
  assert.deepEqual(g[1].box, { x: 1100, y: 100, w: 600, h: 86 }, '外包框');
  assert.deepEqual(groupsOf(page(), 1).map((x) => x.key), ['#2:image', '#2:title', '#2:room']);
  assert.equal(adjustKey(0, 'a.b'), 'a.b');
  assert.equal(adjustKey(2, 'a.b'), '#3:a.b');
  assert.deepEqual(groupsOf(null), []);
  assert.deepEqual(groupsOf({ els: [{ t: 'text', edit: { field: 'x' } }] }), [], '没有坐标的元素跳过');
});

test('applyAdjust：没有调整 / 组名对不上 / 等于没调 → 原样返回同一个对象', () => {
  const p = page();
  assert.equal(applyAdjust(p, null), p);
  assert.equal(applyAdjust(p, {}), p);
  assert.equal(applyAdjust(p, { nope: { dx: 10, dy: 0, k: 1 } }), p);
  assert.equal(applyAdjust(p, { title: { dx: 0, dy: 0, k: 1 } }), p);
  assert.equal(applyAdjust(p, { title: 'x', image: 5 }), p);
  assert.equal(applyAdjust(p, { '#2:title': { dx: 10, dy: 0, k: 1 } }, 0), p, '别的页的调整不套到这一页');
  assert.equal(applyAdjust(p, { image: {} }), p);
});

test('块：位移整组一起走；缩放绕组的左上角，框、字号、字距、行高一起变；别的元素不动；不改原数据', () => {
  const p = page();
  const before = JSON.stringify(p);
  const moved = applyAdjust(p, { title: { dx: 40, dy: -20, k: 1 } });
  assert.equal(JSON.stringify(p), before);
  assert.equal(moved.adjusted, true);
  assert.equal(moved.autoEls, p.els, '留着自动排版的元素（编辑器算相对位移用）');
  assert.deepEqual([moved.els[2].x, moved.els[2].y, moved.els[3].x, moved.els[3].y], [1140, 80, 1140, 130]);
  assert.equal(moved.els[2].paras[0].runs[0].size, 30, '只移位：字号不变');
  assert.equal(moved.els[0], p.els[0]);
  assert.equal(moved.els[1], p.els[1], '装饰线不动');
  assert.equal(moved.els[4], p.els[4]);

  const scaled = applyAdjust(p, { title: { dx: 0, dy: 0, k: 1.5 } });
  const [en, zh] = [scaled.els[2], scaled.els[3]];
  assert.deepEqual([en.x, en.y, en.w, en.h], [1100, 100, 900, 60]);
  assert.deepEqual([zh.x, zh.y, zh.w, zh.h], [1100, 175, 600, 54], '第二个框离组的左上角的距离也放大');
  assert.equal(en.paras[0].runs[0].size, 45);
  assert.equal(zh.paras[0].runs[0].size, 42);
  assert.equal(en.paras[0].runs[0].spacing, 3);
  assert.equal(en.paras[0].lineHeight, 45);
  assert.equal(applyAdjust(p, { room: { k: 1.03 } }).els[4].paras[0].runs[0].size, 16.5, '字号取到 0.5 pt');
});

test('块：缩放夹在 0.4–3 倍；位移不超过一页；点文字里另一栏的范围（zones）跟着变', () => {
  assert.deepEqual(cleanBlockAdjust({ dx: 1e9, dy: -1e9, k: 99 }), { dx: 1920, dy: -1080, k: ADJUST_LIMITS.kMax });
  assert.equal(cleanBlockAdjust({ k: 0.01 }).k, ADJUST_LIMITS.kMin);
  assert.equal(cleanBlockAdjust({ dx: NaN, dy: 'x', k: null }), null);
  assert.equal(cleanBlockAdjust(null), null);
  const p = { els: [textEl(100, 100, 400, 40, 'cycle', '60–75 天', 20, { edit: { field: 'cycle', zones: [{ field: 'unit', x: 300, y: 100, w: 100, h: 40 }] } })] };
  const out = applyAdjust(p, { cycle: { dx: 10, dy: 0, k: 2 } });
  assert.deepEqual(out.els[0].edit.zones[0], { field: 'unit', x: 510, y: 100, w: 200, h: 80 });
});

test('照片取景：z = 相对「刚好铺满」的倍数；整张显示 = 比例不同的方向留白（负值）；夹住不超出原图', () => {
  const box = { x: 0, y: 0, w: 1000, h: 1000 }; // 方框放 2 : 1 的图：铺满时左右各裁 25%
  assert.deepEqual(viewCrop(NAT, box, { z: 1, cx: 0.5, cy: 0.5 }), { l: 0.25, t: 0, r: 0.25, b: 0 });
  assert.deepEqual(viewCrop(NAT, box, { z: 1, cx: 0, cy: 0.5 }), { l: 0, t: 0, r: 0.5, b: 0 }, '拖到最左：夹住，不露出图外');
  assert.deepEqual(viewCrop(NAT, box, { z: 2, cx: 0.5, cy: 0.5 }), { l: 0.375, t: 0.25, r: 0.375, b: 0.25 }, '放大 2 倍');
  assert.equal(wholeZoom(NAT, box), 0.5);
  assert.deepEqual(viewCrop(NAT, box, { z: 0.5, cx: 0.2, cy: 0.1 }), { l: 0, t: -0.5, r: 0, b: -0.5 }, '整张：上下留白，居中');
  assert.deepEqual(clampView(NAT, box, { z: 0.01, cx: 0.5, cy: 0.5 }), { z: 0.5, cx: 0.5, cy: 0.5 }, '最小就是整张');
  assert.equal(clampView(NAT, box, { z: 99 }).z, ADJUST_LIMITS.zMax);
  assert.equal(clampView(NAT, box, 'whole'), 'whole');
  assert.equal(viewCrop(NAT, box, 'whole'), null);
  assert.equal(viewCrop(null, box, { z: 1, cx: 0.5, cy: 0.5 }), null, '不知道原图多大');
});

test('autoView：把自动排版的铺法读成取景 —— cover、带水印取景的 crop、contain', () => {
  const cover = page().els[0];
  assert.deepEqual(autoView(cover), { z: 1, cx: 0.5, cy: 0.5 });
  assert.deepEqual(autoView({ ...cover, ax: 0 }), { z: 1, cx: 0.25, cy: 0.5 }, '靠左取景');
  // 水印取景：略放大、从顶部起（底部裁掉一条）
  const wm = { ...cover, crop: { l: 0.3, t: 0, r: 0.3, b: 0.2 } };
  const v = autoView(wm);
  assert.ok(Math.abs(v.z - 1.25) < 1e-6 && Math.abs(v.cx - 0.5) < 1e-6 && Math.abs(v.cy - 0.4) < 1e-6, JSON.stringify(v));
  assert.deepEqual(viewCrop(NAT, wm, v), wm.crop, '读出来再算回去是同一个裁切');
  assert.equal(autoView({ ...cover, fit: 'contain' }), 'whole');
  assert.equal(autoView({ ...cover, nat: undefined }), null);
  assert.equal(autoView(page().els[2]), null);
});

test('照片：只改框 → 沿用自动的取景（不变形）；改取景 → 显式裁切；整张显示 → contain；不知道原图大小也不报错', () => {
  const p = page();
  // 框变成 2 : 1：正好放下整张图
  const wide = applyAdjust(p, { image: { box: { x: 100, y: 200, w: 1200, h: 600 } } }).els[0];
  assert.deepEqual([wide.x, wide.y, wide.w, wide.h], [100, 200, 1200, 600]);
  assert.deepEqual(wide.crop, { l: 0, t: 0, r: 0, b: 0 }, '铺满新框：不用裁');
  const pl = placeImage(wide);
  assert.ok(Math.abs((NAT.w * (1 - pl.crop.l - pl.crop.r)) / (NAT.h * (1 - pl.crop.t - pl.crop.b)) - pl.w / pl.h) < 1e-6, '看得见的范围和框同一个比例（不拉伸）');

  const panned = applyAdjust(p, { image: { view: { z: 1, cx: 0.3, cy: 0.5 } } }).els[0];
  assert.deepEqual([panned.x, panned.y, panned.w, panned.h], [0, 0, 1000, 1000], '框没动');
  assert.deepEqual(panned.crop, { l: 0.05, t: 0, r: 0.45, b: 0 });

  const whole = applyAdjust(p, { image: { view: 'whole' } }).els[0];
  assert.equal(whole.fit, 'contain');
  assert.equal(whole.crop, undefined);
  assert.deepEqual(placeImage(whole), { x: 0, y: 250, w: 1000, h: 500, crop: { l: 0, t: 0, r: 0, b: 0 } }, '整张图在框里上下居中');

  const noNat = { els: [{ ...p.els[0], nat: undefined }] };
  const moved = applyAdjust(noNat, { image: { box: { x: 10, y: 10, w: 500, h: 500 }, view: { z: 2, cx: 0.5, cy: 0.5 } } }).els[0];
  assert.deepEqual([moved.x, moved.w, moved.fit, moved.crop], [10, 500, 'cover', undefined]);
});

test('clampBox：不小于 40 px；至少留 40 px 在页面里；坏数据 = null', () => {
  assert.deepEqual(clampBox({ x: 0, y: 0, w: 5, h: 5 }), { x: 0, y: 0, w: 40, h: 40 });
  assert.deepEqual(clampBox({ x: 5000, y: -5000, w: 400, h: 300 }), { x: 1880, y: -260, w: 400, h: 300 });
  assert.equal(clampBox({ x: 0, y: 0, w: NaN, h: 1 }), null);
  assert.equal(clampBox(null), null);
});

test('setAdjust / clearAdjust：不可变；清到没有就去掉字段', () => {
  const p = { slides: [{ id: 's1', kind: 'view' }, { id: 's2', kind: 'view' }] };
  const before = JSON.stringify(p);
  const a = setAdjust(p, 's1', 'title', { dx: 5, dy: 0, k: 1 });
  assert.equal(JSON.stringify(p), before);
  assert.deepEqual(a.slides[0].adjust, { title: { dx: 5, dy: 0, k: 1 } });
  assert.equal(a.slides[1], p.slides[1], '别的页不动');
  const b = setAdjust(a, 's1', 'image', { box: { x: 1, y: 2, w: 300, h: 300 }, view: { z: 2, cx: 0.5, cy: 0.5 } });
  assert.deepEqual(Object.keys(b.slides[0].adjust), ['title', 'image']);
  const d = setAdjust(setAdjust(b, 's1', 'title', null), 's1', 'image', {});
  assert.equal('adjust' in d.slides[0], false, '整页都清了：去掉字段');
  assert.equal(setAdjust(p, 's1', 'title', null), p, '本来就没有：原样返回');
  assert.equal(setAdjust(p, 'nope', 'title', { dx: 1 }), p);
  assert.equal('adjust' in clearAdjust(b, 's1').slides[0], false);
  assert.equal(clearAdjust(p, 's1'), p);
});

test('换了照片：给旧图定的取景作废（按自动的铺法），照片框留着', () => {
  const p = page();
  const adj = { image: { box: { x: 0, y: 0, w: 800, h: 800 }, view: { z: 2, cx: 0.5, cy: 0.5 }, src: 'asset:a' } };
  const same = applyAdjust(p, adj).els[0];
  assert.deepEqual(same.crop, { l: 0.375, t: 0.25, r: 0.375, b: 0.25 }, '还是那张图：取景生效');
  const swapped = { els: [{ ...p.els[0], src: 'asset:b' }] };
  const out = applyAdjust(swapped, adj).els[0];
  assert.deepEqual([out.w, out.h], [800, 800], '框留着');
  assert.deepEqual(out.crop, { l: 0.25, t: 0, r: 0.25, b: 0 }, '取景回到自动（铺满、居中）');
});

// ---------------------------------------------------------------------------
// 整套渲染 + 导出
// ---------------------------------------------------------------------------

function sampleProject() {
  const p = newProject({ info: { client: 'Mr Demo', location: 'Muar', date: '2026 · 08' } });
  p.floors = [{ id: 'f1', zh: '一楼', en: 'GROUND FLOOR' }];
  p.slides = assembleDeck([
    { id: 'v1', kind: 'view', floorId: 'f1', layout: 'framed', image: 'asset:r1', room: '书房', roomEn: 'STUDY ROOM', subtitle: '视角三', materials: [], notes: [{ label: '', text: 'Study Room View (Right)' }] },
    { id: 'v2', kind: 'view', floorId: 'f1', layout: 'framed', image: 'asset:r2', room: '书房', roomEn: 'STUDY ROOM', subtitle: '视角四', materials: [], notes: [] },
  ]);
  return p;
}
const meta = (src) => ({ 'asset:r1': { w: 3840, h: 2160 }, 'asset:r2': { w: 3840, h: 2160 } })[src] || null;
const pageOf = (project, id) => renderDeck(project, { meta }).find((r) => r.slideId === id);

test('renderDeck：没调过的页和以前一模一样；调过的页只有那一组变了，带 adjusted 标记；别的页不受影响', () => {
  const p = sampleProject();
  const auto = pageOf(p, 'v1');
  assert.equal(auto.adjusted, undefined);
  const groups = groupsOf(auto);
  const photo = groups.find((g) => g.type === 'photo');
  const block = groups.find((g) => g.type === 'block');
  assert.ok(photo && block, JSON.stringify(groups.map((g) => g.key)));
  assert.ok(auto.els[photo.indexes[0]].crop, '效果图默认仍然裁切（藏水印）');

  let q = setAdjust(p, 'v1', photo.key, { view: 'whole' });
  q = setAdjust(q, 'v1', block.key, { dx: 30, dy: 12, k: 1.2 });
  const adj = pageOf(q, 'v1');
  assert.equal(adj.adjusted, true);
  assert.equal(adj.els.length, auto.els.length);
  const img = adj.els[photo.indexes[0]];
  assert.equal(img.fit, 'contain');
  assert.equal(img.crop, undefined, '整张显示：不裁');
  const changed = adj.els.map((el, i) => (JSON.stringify(el) === JSON.stringify(auto.els[i]) ? null : i)).filter((i) => i !== null);
  assert.deepEqual(changed, [...photo.indexes, ...block.indexes].sort((a, b) => a - b), '只有调过的两组变了');
  const first = block.indexes[0];
  assert.equal(adj.els[first].x, auto.els[first].x + 30);
  assert.deepEqual(JSON.stringify(pageOf(q, 'v2')), JSON.stringify(pageOf(p, 'v2')), '别的页不受影响');
  assert.deepEqual(JSON.stringify(pageOf(clearAdjust(q, 'v1'), 'v1')), JSON.stringify(auto), '恢复自动排版 = 回到原样');
});

test('导出 PPT：调过的照片框 / 裁切、文字框位置 / 字号都写进 XML（和预览是同一份元素）', async () => {
  const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64'));
  const loadImage = async () => ({ data: PNG, mime: 'image/png' });
  const p = sampleProject();
  const auto = pageOf(p, 'v1');
  const photo = groupsOf(auto).find((g) => g.type === 'photo');
  const block = groupsOf(auto).find((g) => g.type === 'block');
  let q = setAdjust(p, 'v1', photo.key, { box: { x: 96, y: 192, w: 960, h: 480 }, view: { z: 2, cx: 0.5, cy: 0.5 } });
  q = setAdjust(q, 'v1', block.key, { dx: 96, dy: 0, k: 2 });
  const rendered = exportableSlides(renderDeck(q, { meta }));
  const idx = rendered.findIndex((r) => r.slideId === 'v1');
  const { file } = await buildPptx(rendered, { loadImage, type: 'uint8array' });
  const zip = await JSZip.loadAsync(file);
  const xml = await zip.file(`ppt/slides/slide${idx + 1}.xml`).async('string');
  const EMU = 9525;
  assert.ok(xml.includes(`<a:off x="${96 * EMU}" y="${192 * EMU}"/><a:ext cx="${960 * EMU}" cy="${480 * EMU}"/>`), '照片框的位置和大小');
  // 2 : 1 的框放 16 : 9 的图、放大 2 倍：看得见 宽 50%、高 = 50% × (16/9)/2 = 44.44%
  assert.ok(/<a:srcRect l="25000" t="27778" r="25000" b="27778"\/>/.test(xml), xml.match(/<a:srcRect[^>]*>/)?.[0]);
  const el = pageOf(q, 'v1').els[block.indexes[0]];
  const size = el.paras[0].runs[0].size;
  assert.equal(size, auto.els[block.indexes[0]].paras[0].runs[0].size * 2);
  assert.ok(xml.includes(`<a:off x="${Math.round(el.x * EMU)}" y="${Math.round(el.y * EMU)}"/>`), '文字框的位置');
  assert.ok(xml.includes(`sz="${Math.round(size * 100)}"`), '文字的字号');
});

test('复制项目：手动调整跟着走', () => {
  const q = setAdjust(sampleProject(), 'v1', 'image', { view: 'whole' });
  const copy = remapAssetSrcs(q, new Map([['asset:r1', 'asset:n1']])); // 复制 / 备份导入都走这一步（深拷贝 + 改写素材引用）
  assert.deepEqual(copy.slides.find((s) => s.id === 'v1').adjust, { image: { view: 'whole' } });
});
