// 体检第 3 阶段（2026-11-21）：认不准的地方会告诉设计师 —— 「请核对这几处」清单 + 加、删、移动楼层
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test } from './harness.mjs';
import { analyzePages } from '../src/import/analyze.js';
import { buildReview } from '../src/import/review.js';
import { reviewFromDrafts, reviewList, reviewStatus, openReviewCount, slideReview, setReviewDone } from '../src/lib/review.js';
import { addFloor, removeFloor, moveFloor, nextFloorName, floorViewCount } from '../src/lib/floors.js';
import { newProject, assembleDeck } from '../src/engine/model.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

const L = (text, x, y, fs = 12, w) => ({ text, x, y, w: w ?? text.length * fs * 0.8, h: fs, fs });
const I = (key, x, y, w, h, pxW = 1600, pxH = 1000) => ({ key, x, y, w, h, pxW, pxH });
const pageOf = (n, lines, images, W = 960, H = 540) => ({ n, width: W, height: H, lines, images });
const floorPage = (n, text) => pageOf(n, [L(text, 300, 250, 28)], []);
const viewPage = (n, title, labels = [], { swatch = true } = {}) =>
  pageOf(
    n,
    [...(title ? [L(title, 20, 20, 20)] : []), ...labels.map((t, i) => L(t, 800, 240 + i * 16))],
    [I(`r${n}`, 10, 80, 760, 440), ...(swatch ? [I(`sw${n}`, 800, 100, 130, 130, 500, 500)] : [])]
  );
const kinds = (r) => r.map((x) => `${x.page ?? '-'}:${x.kind}`);

test('样例方案：清单列出材料是照别页放的、没有材料的页；标题全认得就不列空间名', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'fixtures/sample-pages.json'), 'utf8'));
  const a = analyzePages(raw, { fileName: raw.fileName });
  const r = buildReview(a);
  const count = (k) => r.filter((x) => x.kind === k).length;
  assert.equal(count('no-materials'), 11, '厨房 4 页 + 主人房收纳 7 页没有材料');
  assert.equal(count('materials-prev'), 9, '连着几页照同一页放的合成一条');
  assert.equal(count('room-prev') + count('room-none') + count('room-unknown'), 0);
  assert.equal(count('page-unused'), 0);
  const p33 = r.find((x) => x.page === 33);
  assert.equal(p33.kind, 'materials-prev');
  assert.match(p33.text, /第 32 页/);
  assert.match(p33.detail, /第 33–39 页/);
  // 按原稿页序
  assert.deepEqual(r.map((x) => x.page), [...r.map((x) => x.page)].sort((x, y) => x - y));
});

test('没认出标题 → 沿用上一页的空间名要核对；不认得的空间名、没用上的原稿页也列出来', () => {
  const pages = [
    floorPage(1, 'GF'),
    viewPage(2, '客厅 Living Area', ['柜体 AG273']),
    viewPage(3, '', ['柜体 AG273']), // 没有标题：沿用「客厅」
    viewPage(4, '神秘角落', ['柜体 AG275']), // 不是常用空间名
    pageOf(5, [L('施工注意事项', 20, 20, 20), L('请业主确认水电位置', 20, 80)], []), // 文字页：没用上
    pageOf(6, [L('平面布置图', 20, 20, 20)], [I('plan', 10, 60, 900, 460)]), // 平面图：挂到楼层上，算用上了
    viewPage(7, '书房 Study', ['柜体 AG280']),
  ];
  const a = analyzePages({ meta: {}, pages }, { fileName: 'x.pdf' });
  const r = buildReview(a);
  assert.deepEqual(kinds(r), ['3:room-prev', '4:room-unknown', '5:page-unused']);
  assert.match(r[0].text, /客厅/);
  assert.match(r[0].detail, /没有认出标题/);
  assert.match(r[1].text, /神秘角落/);
  assert.match(r[2].detail, /施工注意事项/);
});

test('楼层：1F 是推断的（有没有写 GF 两种说法）；没楼层页 / 排在第一个楼层页之前也列出来', () => {
  const withGf = analyzePages({ meta: {}, pages: [floorPage(1, 'GF'), viewPage(2, '客厅', ['柜体 AG101']), floorPage(3, '1F'), viewPage(4, '主人房', ['柜体 AG202'])] }, {});
  const r1 = buildReview(withGf);
  assert.deepEqual(kinds(r1), ['3:floor-guess']);
  assert.match(r1[0].text, /「1F」认成了「二楼」/);
  assert.match(r1[0].detail, /另外写了 GF/);

  const noGf = analyzePages({ meta: {}, pages: [floorPage(1, '1F'), viewPage(2, '客厅', ['柜体 AG101']), floorPage(3, '2F'), viewPage(4, '主人房', ['柜体 AG202'])] }, {});
  const r2 = buildReview(noGf);
  assert.deepEqual(kinds(r2), ['1:floor-guess', '3:floor-guess']);
  assert.match(r2[0].text, /「1F」认成了「一楼」/);
  assert.match(r2[0].detail, /中文习惯/);

  // 写明的楼层（一楼 / Ground Floor）不用核对
  const plain = analyzePages({ meta: {}, pages: [floorPage(1, '一楼'), viewPage(2, '客厅', ['柜体 AG101'])] }, {});
  assert.deepEqual(buildReview(plain), []);

  const before = analyzePages({ meta: {}, pages: [viewPage(1, '玄关', ['柜体 AG101']), floorPage(2, '一楼'), viewPage(3, '客厅', ['柜体 AG202'])] }, {});
  assert.deepEqual(kinds(buildReview(before)), ['1:no-floor']);

  const none = analyzePages({ meta: {}, pages: [viewPage(1, '玄关', ['柜体 AG101']), viewPage(2, '客厅', ['柜体 AG202'])] }, {});
  assert.deepEqual(kinds(buildReview(none)), ['-:no-floors']);
});

/** 一份小项目：一楼（客厅 ×2）、二楼（主人房），清单照导入时的样子生成 */
function sampleProject() {
  const p = newProject({ name: 'T' });
  p.floors = [
    { id: 'fA', zh: '一楼', en: 'GROUND FLOOR', image: null },
    { id: 'fB', zh: '二楼', en: 'FIRST FLOOR', image: null },
  ];
  const v = (id, floorId, room, sourcePage, materials = []) => ({ id, kind: 'view', enabled: true, floorId, layout: 'auto', image: null, room, roomEn: '', subtitle: '', materials, notes: [], sourcePage });
  p.slides = assembleDeck([
    { id: 'sfA', kind: 'floor', floorId: 'fA', enabled: true },
    v('v1', 'fA', '客厅', 2, [{ role: '柜体', materialId: 'm1' }]),
    v('v2', 'fA', '客厅', 3),
    { id: 'sfB', kind: 'floor', floorId: 'fB', enabled: true },
    v('v3', 'fB', '主人房', 5),
  ]);
  const drafts = [
    { kind: 'room-prev', page: 3, text: '空间名沿用了上一页的「客厅」', detail: '' },
    { kind: 'no-materials', page: 3, text: '这页没有材料', detail: '' },
    { kind: 'floor-guess', page: 4, floorKey: 'f2', text: '「1F」认成了「二楼」', detail: '' },
    { kind: 'page-unused', page: 6, text: '原稿第 6 页没用上', detail: '' },
    { kind: 'no-materials', page: 99, text: '找不到的页', detail: '' }, // 对不上页的不进清单
  ];
  p.review = reviewFromDrafts(drafts, { project: p, floorId: new Map([['f1', 'fA'], ['f2', 'fB']]) });
  return p;
}

test('清单存进项目：对上页 / 楼层章节页；打勾、改好、删页都会消掉', () => {
  let p = sampleProject();
  const items = p.review.items;
  assert.equal(items.length, 4);
  assert.deepEqual(items.map((it) => [it.kind, it.slideId || null]), [
    ['room-prev', 'v2'], ['no-materials', 'v2'], ['floor-guess', 'sfB'], ['page-unused', null],
  ]);
  assert.equal(items[2].floorId, 'fB');
  assert.equal(openReviewCount(p), 4);
  assert.equal(slideReview(p, 'v2').length, 2);

  // 打勾 → done；取消打勾 → 回到 open
  const id = items[0].id;
  p = setReviewDone(p, id, true);
  assert.equal(reviewStatus(p, p.review.items[0]), 'done');
  assert.equal(openReviewCount(p), 3);
  p = setReviewDone(p, id, false);
  assert.equal(openReviewCount(p), 4);
  assert.ok(!('done' in p.review.items[0]));

  // 加了材料 → 自动算改好（不用打勾）
  p = { ...p, slides: p.slides.map((s) => (s.id === 'v2' ? { ...s, materials: [{ role: '柜体', materialId: 'm1' }] } : s)) };
  assert.equal(reviewList(p).find((it) => it.kind === 'no-materials').status, 'fixed');
  assert.equal(openReviewCount(p), 3);

  // 删掉那一页 → 那一页的都不再列
  p = { ...p, slides: p.slides.filter((s) => s.id !== 'v2') };
  assert.deepEqual(reviewList(p).map((it) => it.kind), ['floor-guess', 'page-unused']);

  // 删掉那一层 → 楼层那条不再列
  p = removeFloor(p, 'fB');
  assert.deepEqual(reviewList(p).map((it) => it.kind), ['page-unused']);

  // 没有要核对的 → 不建清单
  assert.equal(reviewFromDrafts([], { project: p, floorId: new Map() }), null);
  // 旧项目没有清单
  assert.deepEqual(reviewList(newProject()), []);
});

test('楼层：加一层放在方案最后；名字自动取下一层', () => {
  const p0 = sampleProject();
  assert.deepEqual(nextFloorName(p0), { zh: '三楼', en: 'SECOND FLOOR' });
  assert.deepEqual(nextFloorName(newProject()), { zh: '一楼', en: 'GROUND FLOOR' });
  const p = addFloor(p0, { floorId: 'fC', slideId: 'sfC', zh: '三楼', en: 'SECOND FLOOR' });
  assert.deepEqual(p.floors.map((f) => f.zh), ['一楼', '二楼', '三楼']);
  const ids = p.slides.map((s) => s.id);
  assert.equal(ids.indexOf('sfC'), ids.indexOf('v3') + 1, '章节页排在最后一张效果图后面');
  assert.equal(p.slides[ids.indexOf('sfC') + 1].kind, 'company', '后面是服务章节');
  // 没有方案页的空项目：放在本案材料后面
  const e = addFloor(newProject({ slides: assembleDeck([]) }), { floorId: 'f1', slideId: 's1', zh: '一楼', en: 'GROUND FLOOR' });
  const ei = e.slides.findIndex((s) => s.id === 's1');
  assert.equal(e.slides[ei - 1].kind, 'materials');
});

test('楼层：删一层，这层的页并到前面那一层；第一层删掉就不分楼层', () => {
  const p0 = sampleProject();
  assert.equal(floorViewCount(p0, 'fA'), 2);
  const p = removeFloor(p0, 'fB');
  assert.deepEqual(p.floors.map((f) => f.id), ['fA']);
  assert.ok(!p.slides.some((s) => s.id === 'sfB'));
  assert.equal(p.slides.find((s) => s.id === 'v3').floorId, 'fA');
  const q = removeFloor(p0, 'fA');
  assert.equal(q.slides.find((s) => s.id === 'v1').floorId, null);
  assert.equal(q.slides.find((s) => s.id === 'v3').floorId, 'fB');
  assert.equal(removeFloor(p0, 'nope'), p0);
});

test('楼层：上移 / 下移，整层的页一起换位置', () => {
  const p0 = sampleProject();
  const order = (p) => p.slides.filter((s) => s.kind === 'floor' || s.kind === 'view').map((s) => s.id);
  assert.deepEqual(order(p0), ['sfA', 'v1', 'v2', 'sfB', 'v3']);
  const up = moveFloor(p0, 'fB', -1);
  assert.deepEqual(up.floors.map((f) => f.id), ['fB', 'fA']);
  assert.deepEqual(order(up), ['sfB', 'v3', 'sfA', 'v1', 'v2']);
  const down = moveFloor(p0, 'fA', 1);
  assert.deepEqual(order(down), ['sfB', 'v3', 'sfA', 'v1', 'v2']);
  assert.equal(moveFloor(p0, 'fA', -1), p0, '第一层不能再上移');
  // 前后的公司页不动
  assert.deepEqual(up.slides.filter((s) => s.kind === 'company').map((s) => s.key), p0.slides.filter((s) => s.kind === 'company').map((s) => s.key));
  assert.equal(up.slides.length, p0.slides.length);
});
