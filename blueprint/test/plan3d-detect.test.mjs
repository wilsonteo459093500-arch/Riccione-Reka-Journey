// AI 框图的纯逻辑测试：两段提示词、把模型的回复（可能带围栏、被截断、形状不对、全是废话）整理成几何数据。不联网、不调模型。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from './harness.mjs';
import * as detect from '../src/plan3d/detect.js';
import * as prompt from '../src/plan3d/prompt.js';
import { looseJson, toPxBox, parseStructure, parseItems, alignRects, dedupeItems, estimateScale, deriveWallT, buildGeo, detectSummary, roomsForPrompt } from '../src/plan3d/detect.js';
import { structurePrompt, itemsPrompt, KIND_ALIASES } from '../src/plan3d/prompt.js';
import { KINDS, openingRect, roomRects } from '../src/plan3d/geometry.js';
import { renderGeo, validateGeo } from '../src/plan3d/edit.js';
import { settleGeo } from '../src/plan3d/settle.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(path.join(dir, '../src/plan3d', f), 'utf8');
const STUDY = JSON.parse(src('sample-study-room.json'));
const snapshot = (v) => structuredClone(v);
const FENCE = '`'.repeat(3);

const SIZE = { w: 600, h: 500 };
/** 像素框 [x0,y0,x1,y1] → 模型的写法 [ymin,xmin,ymax,xmax]（0–1000 的整数） */
const units = (box, size) => [
  Math.round((box[1] / size.h) * 1000),
  Math.round((box[0] / size.w) * 1000),
  Math.round((box[3] / size.h) * 1000),
  Math.round((box[2] / size.w) * 1000),
];
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≈ ${b}（差 ${Math.abs(a - b)}，允许 ${tol}）`);
const nearBox = (a, b, tol, msg) => a.forEach((v, i) => near(v, b[i], tol, `${msg || ''} [${i}]`));
/** 一个 400 x 300 的方盒子房间（像素），整理好的第一次看图结果 */
const structure = (extra = {}) => ({
  rooms: [{ name: 'ROOM', rects: [[100, 100, 500, 400]] }],
  openings: [],
  columns: [],
  wallT: null,
  dimension: null,
  notes: [],
  ...extra,
});

// ---------------------------------------------------------------------------
// looseJson
// ---------------------------------------------------------------------------

test('looseJson：正常的 JSON、带代码围栏的、前面有废话的都读得出来，partial = false', () => {
  assert.deepEqual(looseJson('{"rooms":[{"name":"A","box_2d":[1,2,3,4]}]}'), { value: { rooms: [{ name: 'A', box_2d: [1, 2, 3, 4] }] }, partial: false });
  assert.deepEqual(looseJson('  [1, 2, {"a": "b"}]  '), { value: [1, 2, { a: 'b' }], partial: false });
  assert.deepEqual(looseJson(`${FENCE}json\n{"items": [{"kind": "tall"}]}\n${FENCE}`), { value: { items: [{ kind: 'tall' }] }, partial: false });
  assert.deepEqual(looseJson(`${FENCE}\n[{"kind":"desk"}]\n${FENCE}\nHope this helps!`), { value: [{ kind: 'desk' }], partial: false });
  assert.deepEqual(looseJson('Here is the result you asked for:\n\n{"items":[]}\n\nLet me know {if} anything is off.'), { value: { items: [] }, partial: false });
  assert.deepEqual(looseJson('Sure [see note] — {"wall_thickness": 14}'), { value: { wall_thickness: 14 }, partial: false }, '说明文字里的方括号不是 JSON，跳过');
  assert.deepEqual(looseJson('{"label":"a } \\" ] b","n":[1,2,],}'), { value: { label: 'a } " ] b', n: [1, 2] }, partial: false }, '字符串里的括号不算；多写的逗号去掉');
});

test('looseJson：写到一半被截断 → 前面写完整的条目都留着，partial = true', () => {
  const full = '{"items":[{"kind":"tall","box_2d":[10,20,30,40]},{"kind":"desk","box_2d":[50,60,70,80]},{"kind":"chair","box_2d":[100,200,300,400]}]}';
  const cut = (n) => looseJson(full.slice(0, n));
  // 截在第三项的框中间（数字没写完）
  let r = cut(full.indexOf('300') + 2);
  assert.equal(r.partial, true);
  assert.equal(r.value.items.length, 3);
  assert.deepEqual(r.value.items.slice(0, 2), [{ kind: 'tall', box_2d: [10, 20, 30, 40] }, { kind: 'desk', box_2d: [50, 60, 70, 80] }]);
  assert.deepEqual(r.value.items[2], { kind: 'chair', box_2d: [100, 200] }, '没写完的数字不要（30 可能是 300）');
  // 截在第三项的字符串中间
  r = cut(full.indexOf('"chair"') + 4);
  assert.deepEqual(r, { value: { items: [{ kind: 'tall', box_2d: [10, 20, 30, 40] }, { kind: 'desk', box_2d: [50, 60, 70, 80] }] }, partial: true });
  // 截在两项之间的逗号后面、截在键名后面
  assert.deepEqual(cut(full.indexOf(',{"kind":"desk"') + 1).value, { items: [{ kind: 'tall', box_2d: [10, 20, 30, 40] }] });
  assert.deepEqual(cut(full.indexOf('"box_2d":[50') + 9).value, { items: [{ kind: 'tall', box_2d: [10, 20, 30, 40] }, { kind: 'desk' }] });
  // 只差最后的括号
  assert.deepEqual(cut(full.length - 2), { value: JSON.parse(full), partial: true });
  // 带围栏、还没写到第一项
  assert.deepEqual(looseJson(`${FENCE}json\n{"items":[`), { value: {}, partial: true });
  assert.deepEqual(looseJson('{"rooms":[{"name":"A","box_2d":[1,2,3,4]}],"openings":[{"type":"do'), { value: { rooms: [{ name: 'A', box_2d: [1, 2, 3, 4] }] }, partial: true });
  // 截断的回复整理出来：前两件家具还在
  const items = parseItems(cut(full.indexOf('300') + 2).value, { w: 1000, h: 1000 });
  assert.deepEqual(items.items.map((it) => it.kind), ['tall', 'desk']);
});

test('looseJson：全是废话 → null；已经是对象 / 数组 → 原样', () => {
  assert.deepEqual(looseJson('I could not read this drawing, sorry.'), { value: null, partial: true });
  assert.deepEqual(looseJson(''), { value: null, partial: true });
  assert.deepEqual(looseJson('{this is not json at all}'), { value: null, partial: true });
  assert.deepEqual(looseJson('][ }'), { value: null, partial: true });
  assert.deepEqual(looseJson('oops {'), { value: {}, partial: true }, '只有一个开头的括号 = 刚开始写就断了');
  for (const v of [null, undefined, 42, true, NaN]) assert.deepEqual(looseJson(v), { value: null, partial: true });
  const obj = { rooms: [] };
  const arr = [1, 2];
  assert.equal(looseJson(obj).value, obj);
  assert.equal(looseJson(arr).value, arr);
  assert.equal(looseJson(obj).partial, false);
});

// ---------------------------------------------------------------------------
// toPxBox
// ---------------------------------------------------------------------------

test('toPxBox：[ymin,xmin,ymax,xmax]（0–1000 或 0–1）、{ box_2d }、{ box }、{ x, y, w, h } 都认，换成图纸像素 [x0,y0,x1,y1]', () => {
  assert.deepEqual(toPxBox([200, 100, 800, 500], SIZE), [60, 100, 300, 400]);
  assert.deepEqual(toPxBox([0.2, 0.1, 0.8, 0.5], SIZE), [60, 100, 300, 400], '四个都在 0–1 之间 = 小数写法');
  assert.deepEqual(toPxBox([0, 0, 1, 1], SIZE), [0, 0, 600, 500]);
  assert.equal(toPxBox([0, 0, 1, 2], SIZE), null, '有一个值大于 1.5 = 0–1000 的写法（这个框高不到 1 像素）');
  assert.deepEqual(toPxBox([0, 0, 2, 2], SIZE), [0, 0, 1.2, 1]);
  assert.deepEqual(toPxBox({ box_2d: [200, 100, 800, 500] }, SIZE), [60, 100, 300, 400]);
  assert.deepEqual(toPxBox({ kind: 'tall', box: [200, 100, 800, 500] }, SIZE), [60, 100, 300, 400]);
  assert.deepEqual(toPxBox({ x: 0.1, y: 0.2, w: 0.4, h: 0.6 }, SIZE), [60, 100, 300, 400]);
  assert.deepEqual(toPxBox(['200', '100', '800', '500'], SIZE), [60, 100, 300, 400], '数字写成了字符串也认');
  assert.deepEqual(toPxBox([800, 500, 200, 100], SIZE), [60, 100, 300, 400], '两个角写反了也行');
  assert.deepEqual(toPxBox([127, 164, 820, 577], { w: 1856, h: 1044 }), [304.384, 132.588, 1070.912, 856.08]);
});

test('toPxBox：超出图纸的夹回来；不是数、太小（夹完不到 1 像素）、没有图纸大小 = null', () => {
  assert.deepEqual(toPxBox([-50, -20, 1200, 500], SIZE), [0, 0, 300, 500]);
  assert.deepEqual(toPxBox([900, 900, 1100, 1300], SIZE), [540, 450, 600, 500]);
  assert.equal(toPxBox([1100, 1100, 1300, 1300], SIZE), null, '整个在图纸外面');
  assert.equal(toPxBox([200, 100, 200, 500], SIZE), null, '高度为 0');
  assert.equal(toPxBox([200, 100, 201, 500], SIZE), null, '高度不到 1 像素');
  assert.equal(toPxBox([200, 100, 800], SIZE), null);
  assert.equal(toPxBox([200, 100, 'x', 500], SIZE), null);
  assert.equal(toPxBox([200, 100, NaN, 500], SIZE), null);
  assert.equal(toPxBox([200, 100, Infinity, 500], SIZE), null);
  assert.equal(toPxBox({ x: 0.1, y: 0.2, w: 0.4 }, SIZE), null);
  for (const v of [null, undefined, 'box', 7, {}, { box_2d: 'nope' }]) assert.equal(toPxBox(v, SIZE), null);
  for (const s of [null, undefined, {}, { w: 0, h: 500 }, { w: 600 }, { w: NaN, h: 500 }]) assert.equal(toPxBox([200, 100, 800, 500], s), null);
});

// ---------------------------------------------------------------------------
// parseStructure / parseItems
// ---------------------------------------------------------------------------

test('parseStructure：房间（主矩形 + 凹位）、门窗、柱子、墙厚、尺寸线都换成像素；把握不大的标 unsure', () => {
  const raw = {
    rooms: [
      { name: '  STUDY\n ROOM ', box_2d: [200, 100, 800, 500], niches: [[200, 50, 400, 100]], confidence: 0.9 },
      { name: 'BATH', box_2d: [200, 600, 500, 900], confidence: 0.4 },
    ],
    openings: [
      { type: 'window', box_2d: [180, 200, 200, 400], confidence: 0.9 },
      { type: 'Hidden_Door', box_2d: [800, 150, 820, 250] },
      { type: 'sliding door', box_2d: [500, 480, 700, 500], confidence: 0.5 },
      { type: 'skylight', box_2d: [300, 300, 320, 400], confidence: 0.99 },
      { type: '门洞', box_2d: [300, 500, 400, 520] },
    ],
    columns: [{ box_2d: [150, 300, 200, 350] }, [780, 500, 820, 540]],
    wall_thickness: 20,
    dimension: { mm: 3600, p1: [150, 100], p2: [150, 500] },
  };
  const before = snapshot(raw);
  const s = parseStructure(raw, SIZE);
  assert.deepEqual(raw, before, '不改传进来的数据');
  assert.deepEqual(s.rooms, [
    { name: 'STUDY ROOM', rects: [[60, 100, 300, 400], [30, 100, 60, 200]] },
    { name: 'BATH', rects: [[360, 100, 540, 250]], unsure: true },
  ]);
  assert.deepEqual(s.openings, [
    { type: 'window', box: [120, 90, 240, 100] },
    { type: 'hidden-door', box: [90, 400, 150, 410] },
    { type: 'door', box: [288, 250, 300, 350], unsure: true },
    { type: 'gap', box: [180, 150, 240, 160], unsure: true },
    { type: 'gap', box: [300, 150, 312, 200] },
  ], '不认识的门窗种类 → 门洞 + unsure；confidence < 0.6 → unsure');
  assert.deepEqual(s.columns, [[180, 75, 210, 100], [300, 390, 324, 410]]);
  assert.equal(s.wallT, 11, '墙厚 20/1000 × 横竖两个方向的平均 (600+500)/2');
  assert.deepEqual(s.dimension, { mm: 3600, px: 240 });
  assert.deepEqual(s.notes, []);
});

test('parseStructure：形状不对也尽量读 —— rooms 是单独一个对象、整个回复是数组、缺字段、全是废话；绝不抛错', () => {
  const one = parseStructure({ rooms: { name: 'A', box_2d: [200, 100, 800, 500] }, openings: { type: 'door', box_2d: [500, 480, 700, 500] }, columns: [150, 300, 200, 350] }, SIZE);
  assert.deepEqual(one.rooms, [{ name: 'A', rects: [[60, 100, 300, 400]] }]);
  assert.deepEqual(one.openings, [{ type: 'door', box: [288, 250, 300, 350] }]);
  assert.deepEqual(one.columns, [[180, 75, 210, 100]], 'columns 直接给了一个框');

  const top = parseStructure([{ name: 'A', box_2d: [200, 100, 800, 500] }, { type: 'window', box_2d: [180, 200, 200, 400] }, [200, 600, 500, 900]], SIZE);
  assert.deepEqual(top.rooms.map((r) => r.rects[0]), [[60, 100, 300, 400], [360, 100, 540, 250]], '顶层数组：带门窗种类的当门窗，其余当房间');
  assert.deepEqual(top.openings, [{ type: 'window', box: [120, 90, 240, 100] }]);

  const holes = parseStructure({ rooms: [{ name: 'no box' }, null, 'x', { niches: [[200, 100, 800, 500]] }], openings: [{ type: 'door' }, 5], columns: 'none', wall_thickness: 'thick', dimension: { mm: 0, p1: [1, 2], p2: [3, 4] } }, SIZE);
  assert.deepEqual(holes.rooms, [{ name: '', rects: [[60, 100, 300, 400]] }], '没有主矩形时凹位顶上');
  assert.deepEqual(holes.openings, []);
  assert.deepEqual(holes.columns, []);
  assert.equal(holes.wallT, null);
  assert.equal(holes.dimension, null, '毫米数不大于 0 的尺寸线不要');
  assert.ok(holes.notes.length >= 2, '丢了什么都记下来');
  assert.equal(parseStructure({ dimension: { mm: 3600, p1: [150, 100], p2: [150, 100] } }, SIZE).dimension, null, '两个端点重合（长度 0）不要');

  const empty = { rooms: [], openings: [], columns: [], wallT: null, dimension: null };
  for (const garbage of [null, undefined, 42, 'hello', true, [], {}, { rooms: 7, openings: 'x', columns: null, dimension: [1, 2] }, [[['deep']]], { rooms: [[1, 2]] }]) {
    const { notes, ...rest } = parseStructure(garbage, SIZE);
    assert.deepEqual(rest, empty, JSON.stringify(garbage));
    assert.ok(Array.isArray(notes));
  }
  assert.deepEqual(parseStructure({ rooms: [{ box_2d: [200, 100, 800, 500] }] }, null).rooms, [], '不知道图纸大小 → 什么都换算不了');
});

test('parseStructure：上限 —— 20 个房间、每个房间 6 个矩形、60 个门窗、40 根柱子', () => {
  const box = (i) => [10 + i * 5, 10 + i * 5, 110 + i * 5, 110 + i * 5];
  const many = (n, make) => Array.from({ length: n }, (_, i) => make(i));
  const s = parseStructure(
    {
      rooms: many(25, (i) => ({ name: `R${i}`, box_2d: box(i), niches: i === 0 ? many(9, (k) => box(k + 30)) : [] })),
      openings: many(70, (i) => ({ type: 'door', box_2d: box(i) })),
      columns: many(50, (i) => ({ box_2d: box(i) })),
    },
    { w: 1000, h: 1000 }
  );
  assert.equal(s.rooms.length, 20);
  assert.equal(s.rooms[0].rects.length, 6);
  assert.equal(s.rooms[19].name, 'R19');
  assert.equal(s.openings.length, 60);
  assert.equal(s.columns.length, 40);
  assert.equal(s.notes.length, 4, '每一种超出上限都留一条说明');
});

test('parseItems：种类按别名认（不分大小写、去空白、中文也认）；不认识的 → 其他 + unsure；虚线的柜子 → 吊柜', () => {
  const b = [200, 100, 400, 300];
  const kindOf = (kind, extra) => parseItems({ items: [{ kind, box_2d: b, ...extra }] }, SIZE).items[0];
  assert.equal(kindOf('tall').kind, 'tall');
  assert.equal(kindOf('  Wardrobe ').kind, 'tall');
  assert.equal(kindOf('BOOKCASE').kind, 'tall');
  assert.equal(kindOf('bookshelf').kind, 'tall');
  assert.equal(kindOf('Table').kind, 'desk');
  assert.equal(kindOf('worktop').kind, 'desk');
  assert.equal(kindOf('counter').kind, 'low', '厨房的台面一整条 = 矮柜');
  assert.equal(kindOf('stool').kind, 'chair');
  assert.equal(kindOf('sofa').kind, 'sofa');
  assert.equal(kindOf('bed').kind, 'bed');
  assert.equal(kindOf('Toilet').kind, 'fixture');
  assert.equal(kindOf('洗手盆').kind, 'fixture');
  assert.equal(kindOf('dining table').kind, 'desk');
  assert.equal(kindOf('Pillar').kind, 'column');
  assert.equal(kindOf('wall cabinet').kind, 'hung');
  assert.equal(kindOf('wall-hung_cabinet').kind, 'hung', '下划线、连字符当空格');
  assert.equal(kindOf('display').kind, 'glass');
  assert.equal(kindOf('Glass Door Cabinet').kind, 'glass');
  assert.equal(kindOf('office chair').kind, 'chair', '里面带着认识的词也行');
  assert.equal(kindOf('low cabinet / sideboard').kind, 'low');
  assert.equal(kindOf('glass table').kind, 'desk', '一样长的别名取靠后的（中心词）');
  assert.equal(kindOf('tall cabinet with glass doors').kind, 'tall', '更长的别名优先');
  assert.equal(kindOf('Chairs').kind, 'chair', '复数');
  assert.equal(kindOf('dining chairs').kind, 'chair');
  assert.equal(kindOf('embedded').unsure, true, '英文按整词认：embedded 里的 bed 不算');
  for (const [zh, kind] of [['高柜', 'tall'], ['衣柜', 'tall'], ['书柜', 'tall'], ['矮柜', 'low'], ['书桌', 'desk'], ['桌', 'desk'], ['椅', 'chair'], ['吊柜', 'hung'], ['玻璃柜', 'glass'], ['柱', 'column'], ['层架', 'shelf'], ['实木餐桌', 'desk']]) {
    assert.equal(kindOf(zh).kind, kind, zh);
  }
  assert.equal(kindOf('wardrobe').unsure, undefined, '认得出来的不标 unsure');
  assert.deepEqual(kindOf('spaceship'), { kind: 'block', label: '', box: [60, 100, 180, 200], unsure: true });
  assert.deepEqual(kindOf(undefined), { kind: 'block', label: '', box: [60, 100, 180, 200], unsure: true });
  assert.deepEqual(kindOf('constructor'), { kind: 'block', label: '', box: [60, 100, 180, 200], unsure: true }, '不会撞上对象自带的属性');

  // 虚线：高柜 / 矮柜 / 其他 / 层架 → 吊柜；桌子、椅子、玻璃柜不变
  for (const k of ['tall', 'low', 'block', 'shelf', 'cabinet']) assert.equal(kindOf(k, { dashed: true }).kind, 'hung', k);
  for (const k of ['desk', 'chair', 'glass', 'column', 'hung']) assert.equal(kindOf(k, { dashed: true }).kind, k, k);
  assert.equal(kindOf('tall', { dashed: false }).kind, 'tall');
  assert.equal(kindOf('tall', { dashed: 'true' }).kind, 'hung');

  // 把握不大 → unsure；标签压成一行、最多 40 个字
  assert.equal(kindOf('desk', { confidence: 0.59 }).unsure, true);
  assert.equal(kindOf('desk', { confidence: 0.6 }).unsure, undefined);
  assert.equal(kindOf('desk', { confidence: 45 }).unsure, true, '写成百分数的也认');
  assert.equal(kindOf('desk', { label: '  TOP HUNG\n  CABINET ' }).label, 'TOP HUNG CABINET');
  assert.equal(kindOf('desk', { label: 'x'.repeat(100) }).label, 'x'.repeat(40));
  assert.equal(kindOf('desk', { label: 12 }).label, '12');
  assert.equal(kindOf('desk', { label: { no: 1 } }).label, '');
  assert.equal(kindOf('desk', { label: '储物柜' }).label, '储物柜');
});

test('parseItems：上限 120；容器形状不对也读；坏框和占了大半张图的框丢掉并记下来；全是废话不抛错', () => {
  const many = Array.from({ length: 130 }, (_, i) => ({ kind: 'chair', box_2d: [10 + i * 5, 10, 14 + i * 5, 20] }));
  const capped = parseItems({ items: many }, SIZE);
  assert.equal(capped.items.length, 120);
  assert.equal(capped.notes.length, 1);

  assert.deepEqual(parseItems([{ kind: 'desk', box_2d: [200, 100, 400, 300] }], SIZE).items, [{ kind: 'desk', label: '', box: [60, 100, 180, 200] }], '整个回复就是数组');
  assert.deepEqual(parseItems({ items: { kind: 'desk', box_2d: [200, 100, 400, 300] } }, SIZE).items.length, 1, 'items 是单独一个对象');
  assert.deepEqual(parseItems({ furniture: [{ type: 'chair', name: 'C1', box: [200, 100, 400, 300] }] }, SIZE).items, [{ kind: 'chair', label: 'C1', box: [60, 100, 180, 200] }]);

  const junk = parseItems({ items: [{ kind: 'desk' }, { kind: 'desk', box_2d: [1, 2, 3] }, null, 'x', { kind: 'block', box_2d: [0, 0, 1000, 1000] }, { kind: 'tall', box_2d: [200, 100, 400, 300] }] }, SIZE);
  assert.deepEqual(junk.items.map((it) => it.kind), ['tall']);
  assert.equal(junk.notes.length, 2, '两个坏框 + 一个占满整张图的框');

  for (const garbage of [null, undefined, 42, 'hello', [], {}, { items: 7 }, { items: [[]] }, [[1, 2, 3]]]) {
    assert.deepEqual(parseItems(garbage, SIZE).items, [], JSON.stringify(garbage));
  }
  assert.deepEqual(parseItems({ items: many }, undefined).items, []);
});

// ---------------------------------------------------------------------------
// alignRects / dedupeItems
// ---------------------------------------------------------------------------

test('alignRects：差不多对齐的边拉到完全对齐（取平均）；差得远的不动；压扁了的丢掉；不改原数据', () => {
  const rects = [[305, 133, 1070, 856], [186, 131, 303, 365]];
  const before = snapshot(rects);
  const out = alignRects(rects, 4);
  assert.deepEqual(out, [[304, 132, 1070, 856], [186, 132, 304, 365]], '303 和 305 → 304；131 和 133 → 132');
  assert.deepEqual(rects, before);
  assert.notEqual(out[0], rects[0]);
  assert.deepEqual(alignRects(rects, 1), rects, '容差比差距小就不动');
  assert.deepEqual(alignRects([[0, 0, 100, 100], [100, 0, 103, 50], [200, 200, 300, 201]], 4), [[0, 0, 101, 100]], '100、100、103 → 101：宽 3 的那个被压扁；高 1 的那个本来就太扁');
  assert.deepEqual(alignRects([[10, 10, 50, 50], [0, 5, 10, 15, 20], null, [1, 2, 'x', 4], [60, 60, 20, 20]], 0), [[10, 10, 50, 50], [0, 5, 10, 15], [20, 20, 60, 60]], '坏的跳过，写反的理顺');
  // 一连串各差一点的值不会滚雪球并成一个
  assert.deepEqual(alignRects([[0, 0, 20, 100], [3, 0, 40, 100], [6, 0, 60, 100], [9, 0, 80, 100]], 4).map((r) => r[0]), [1.5, 1.5, 7.5, 7.5]);
  assert.deepEqual(alignRects(null, 4), []);
  assert.deepEqual(alignRects([[0, 0, 10, 10]]), [[0, 0, 10, 10]], '没给容差 = 不动');
});

test('dedupeItems：同种类几乎重叠的留前一个；把几件东西框在一起的大框丢掉；吊柜不和下面的柜子去重', () => {
  const items = [
    { kind: 'chair', label: 'a', box: [100, 100, 150, 150] },
    { kind: 'chair', label: 'b', box: [102, 101, 152, 151] }, // 和 a 重复
    { kind: 'chair', label: 'c', box: [200, 100, 250, 150] },
    { kind: 'chair', label: 'group', box: [99, 99, 251, 152] }, // 把 a 和 c 框在一起
    { kind: 'low', label: 'base', box: [300, 300, 400, 340] },
    { kind: 'hung', label: 'above', box: [300, 300, 400, 340] }, // 正好在矮柜上面：不同种类，都留
    { kind: 'desk', label: 'd', box: [90, 90, 260, 160] }, // 包着两把椅子，但种类不同
    { kind: 'tall', label: 'run', box: [500, 100, 700, 160] },
    { kind: 'tall', label: 'part', box: [500, 100, 600, 160] }, // 只包着一个同种类的：不算成组
    { kind: 'hung', label: 'above2', box: [301, 300, 400, 341] }, // 和 above 重复
    { kind: 'block', label: 'bad' },
    null,
  ];
  const before = snapshot(items);
  const out = dedupeItems(items);
  assert.deepEqual(out.map((it) => it.label), ['a', 'c', 'base', 'above', 'd', 'run', 'part']);
  assert.deepEqual(items, before, '不改原数据');
  assert.equal(out[0], items[0], '留下来的还是原来那个对象');
  assert.deepEqual(dedupeItems(null), []);
  assert.deepEqual(dedupeItems('x'), []);
});

// ---------------------------------------------------------------------------
// estimateScale / deriveWallT
// ---------------------------------------------------------------------------

test('estimateScale：依次取第一个说得通的 —— 设计师给的 → 尺寸线 → 门宽 850 → 椅子 520 → 房间长边 4500 → 5', () => {
  const rooms = [{ name: 'R', rects: [[100, 100, 500, 400], [60, 100, 100, 200]] }];
  const doors = [{ type: 'door', side: 'left', a: 100, b: 180 }, { type: 'door', side: 'top', a: 300, b: 215 }, { type: 'door', side: 'top', a: 400, b: 500 }, { type: 'hidden-door', side: 'top', a: 0, b: 10 }, { type: 'window', side: 'top', a: 0, b: 300 }];
  const chairs = [{ kind: 'chair', box: [200, 200, 252, 260] }, { kind: 'chair', box: [300, 200, 370, 250] }, { kind: 'desk', box: [0, 0, 10, 300] }];
  const all = { rooms, openings: doors, items: chairs };
  const dim = { mm: 4800, px: 400 };

  assert.deepEqual(estimateScale(all, dim, { mmPerPx: 7.3 }), { mmPerPx: 7.3, from: 'user' });
  assert.deepEqual(estimateScale(all, dim, { mmPerPx: 0 }), { mmPerPx: 12, from: 'dimension' }, '设计师给的不是正数 → 不算');
  assert.deepEqual(estimateScale(all, dim, null), { mmPerPx: 12, from: 'dimension' });
  assert.deepEqual(estimateScale(all, { mm: 48, px: 400 }, {}), { mmPerPx: 10, from: 'door' }, '尺寸线折出来房间只有 48 毫米长 → 不可信，改用门宽（80、85、100 的中位数 85）');
  assert.deepEqual(estimateScale(all, { mm: 4800000, px: 400 }, {}), { mmPerPx: 10, from: 'door' }, '房间长 4800 米也不可信');
  assert.deepEqual(estimateScale(all, { mm: 0, px: 400 }, {}).from, 'door');
  assert.deepEqual(estimateScale(all, null, {}), { mmPerPx: 10, from: 'door' });
  assert.deepEqual(estimateScale({ rooms, openings: doors.slice(3), items: chairs }, null, {}), { mmPerPx: 10.196, from: 'chair' }, '暗门、窗不算门；椅子窄边 52 和 50 的中位数 51');
  assert.deepEqual(estimateScale({ rooms, openings: [{ type: 'door', side: 'top', a: 100, b: 102 }], items: chairs }, null, {}).from, 'chair', '门只有 2 像素宽 → 折出来房间 170 米，不可信');
  assert.deepEqual(estimateScale({ rooms, openings: [], items: [] }, null, {}), { mmPerPx: 11.25, from: 'room' }, '最大的房间矩形长边 400 像素当 4.5 米');
  assert.deepEqual(estimateScale({ rooms }, undefined, undefined), { mmPerPx: 11.25, from: 'room' });
  assert.deepEqual(estimateScale({ rooms: [], openings: [], items: [] }, null, {}), { mmPerPx: 5, from: 'default' });
  assert.deepEqual(estimateScale(null, null, null), { mmPerPx: 5, from: 'default' });
  assert.deepEqual(estimateScale({ rooms: [] }, dim, {}), { mmPerPx: 12, from: 'dimension' }, '没有房间就没法核对，先信尺寸线');
});

test('deriveWallT：AI 量的墙厚折成毫米在 80–350 之间就用，否则按 180 毫米；夹在 3 像素和短边的 6% 之间', () => {
  const geo = (mmPerPx, source) => ({ mmPerPx, ...(source ? { source } : {}) });
  assert.equal(deriveWallT(geo(10, SIZE), 20), 20, '200 毫米');
  assert.equal(deriveWallT(geo(10, SIZE), 20.4), 20, '取整');
  assert.equal(deriveWallT(geo(10, SIZE), 8), 8, '80 毫米，刚好算');
  assert.equal(deriveWallT(geo(10, SIZE), 35), 30, '350 毫米可以，但超过短边 500 的 6%');
  assert.equal(deriveWallT(geo(10, SIZE), 5), 18, '50 毫米太薄 → 180 / 10');
  assert.equal(deriveWallT(geo(10, SIZE), 60), 18, '600 毫米太厚');
  assert.equal(deriveWallT(geo(10, SIZE), null), 18);
  assert.equal(deriveWallT(geo(10, SIZE), NaN), 18);
  assert.equal(deriveWallT(geo(6.9, { w: 1856, h: 1044 }), null), 26, '样本：180 / 6.9');
  assert.equal(deriveWallT(geo(100, SIZE), null), 3, '180 / 100 = 2 → 至少 3');
  assert.equal(deriveWallT(geo(1, SIZE), null), 30, '180 → 最多 500 x 6%');
  assert.equal(deriveWallT(geo(1), null), 180, '不知道图纸大小就不设上限');
  assert.equal(deriveWallT({}, null), 36, '没有比例尺先按 5');
  assert.equal(deriveWallT(null, 30), 30);
});

// ---------------------------------------------------------------------------
// buildGeo
// ---------------------------------------------------------------------------

const STUDY_SIZE = { w: 1856, h: 1044 };
const STUDY_KINDS = {
  'storage-niche': { kind: 'tall' },
  'shelf-niche': { kind: 'shelf', confidence: 0.4 },
  'desk-left': { kind: 'Table' },
  'hung-left': { kind: 'low', dashed: true },
  'chair-1': { kind: 'chair' },
  'chair-2': { kind: 'stool' },
  'glass-end': { kind: 'low cabinet' },
  glass: { kind: 'glass' },
  'block-dark': { kind: 'pillar', confidence: 0.5 },
  'block-light': { kind: 'block', confidence: 0.3 },
  book: { kind: 'bookcase' },
  'storage-bottom': { kind: 'base cabinet' },
  'desk-bottom': { kind: 'desk' },
  'hung-bottom': { kind: 'hung', dashed: true },
  'chair-3': { kind: '椅子' },
  'chair-4': { kind: 'chair' },
};
/** 把样本手工写成「模型的回复」：0–1000 的 box_2d，门窗是墙里的那一条 */
function studyReplies() {
  const rects = roomRects(STUDY);
  const u = (box) => units(box, STUDY_SIZE);
  const structureReply = {
    rooms: [{ name: 'STUDY ROOM', box_2d: u(rects[0]), niches: [u(rects[1])], confidence: 0.95 }],
    openings: STUDY.openings.map((o) => ({ type: o.type, box_2d: u(openingRect(rects, o, STUDY.wallT)), confidence: 0.9 })),
    columns: STUDY.items.filter((it) => it.id.startsWith('col-')).map((it) => ({ box_2d: u(it.box) })),
    wall_thickness: 18, // 26 像素 ÷ ((1856 + 1044) / 2) × 1000
    dimension: { mm: 5279, p1: [u(rects[0])[0], u(rects[0])[1]], p2: [u(rects[0])[0], u(rects[0])[3]] }, // 主矩形的宽 765 像素 × 6.9
  };
  const itemsReply = {
    items: STUDY.items
      .filter((it) => !it.id.startsWith('col-'))
      .map((it) => ({ label: it.label, box_2d: u(it.box), dashed: false, confidence: 0.9, ...STUDY_KINDS[it.id] })),
  };
  return { structureReply, itemsReply };
}

test('从头到尾：样本写成模型的回复（带围栏）→ looseJson → parseStructure / parseItems → buildGeo，3 像素以内还原出样本', () => {
  const { structureReply, itemsReply } = studyReplies();
  const j1 = looseJson(`${FENCE}json\n${JSON.stringify(structureReply, null, 1)}\n${FENCE}`);
  const j2 = looseJson(`Here are the items:\n${JSON.stringify(itemsReply)}`);
  assert.equal(j1.partial, false);
  assert.equal(j2.partial, false);
  const st = parseStructure(j1.value, STUDY_SIZE);
  const its = parseItems(j2.value, STUDY_SIZE);
  assert.deepEqual(st.notes, []);
  assert.deepEqual(its.notes, []);
  const stBefore = snapshot(st);
  const itsBefore = snapshot(its);
  const built = buildGeo(st, its, STUDY_SIZE, {});
  assert.deepEqual(st, stBefore, '不改传进来的数据');
  assert.deepEqual(its, itsBefore);
  const geo = built.geo;
  assert.equal(built.partial, false);
  assert.deepEqual(built.notes, [], '没有丢东西');
  assert.deepEqual(Object.keys(geo), ['source', 'mmPerPx', 'wallT', 'rooms', 'openings', 'items', 'scaleFrom']);

  assert.deepEqual(geo.source, STUDY.source);
  assert.equal(geo.scaleFrom, 'dimension');
  near(geo.mmPerPx, STUDY.mmPerPx, 0.05, '比例尺');
  assert.equal(geo.wallT, STUDY.wallT);

  // 房间：主矩形 + 凹位，两个矩形共用的那条边完全对齐
  assert.equal(geo.rooms.length, 1);
  assert.deepEqual(Object.keys(geo.rooms[0]), ['name', 'rects']);
  assert.equal(geo.rooms[0].name, 'STUDY ROOM');
  assert.equal(geo.rooms[0].rects.length, 2);
  geo.rooms[0].rects.forEach((r, i) => nearBox(r, STUDY.rooms[0].rects[i], 3, `房间矩形 ${i}`));
  assert.equal(geo.rooms[0].rects[1][2], geo.rooms[0].rects[0][0], '凹位的右边 = 主矩形的左边');
  assert.equal(geo.rooms[0].rects[1][1], geo.rooms[0].rects[0][1], '上边在一条线上');

  // 门窗：种类、在哪一侧墙上、跨度
  const rects = roomRects(geo);
  assert.equal(geo.openings.length, STUDY.openings.length);
  geo.openings.forEach((o, i) => {
    const want = STUDY.openings[i];
    assert.deepEqual(Object.keys(o), ['type', 'side', 'a', 'b', 'at']);
    assert.equal(o.type, want.type);
    assert.equal(o.side, want.side);
    near(o.a, want.a, 3, `门窗 ${i} a`);
    near(o.b, want.b, 3, `门窗 ${i} b`);
    nearBox(openingRect(rects, o, geo.wallT), openingRect(roomRects(STUDY), want, STUDY.wallT), 3, `门窗 ${i} 在墙里占的位置`);
  });

  // 柜子家具：顺序、种类、框、贴哪面墙、椅子朝向、待确认
  assert.equal(geo.items.length, STUDY.items.length);
  geo.items.forEach((it, i) => {
    const want = STUDY.items[i];
    assert.equal(it.kind, want.kind, want.id);
    assert.equal(it.label, want.label, want.id);
    nearBox(it.box, want.box, 3, want.id);
    assert.equal(it.against, want.against, `${want.id} 贴哪面墙`);
    assert.equal(it.facing, want.facing, `${want.id} 朝向`);
    assert.equal(!!it.unsure, !!want.unsure, `${want.id} 待确认`);
    assert.ok(it.box.every((v) => Number.isInteger(v)), '坐标取整');
  });
  assert.deepEqual(geo.items.map((it) => it.id), ['column-1', 'column-2', 'tall-1', 'shelf-1', 'desk-1', 'hung-1', 'chair-1', 'chair-2', 'low-1', 'glass-1', 'column-3', 'block-1', 'tall-2', 'low-2', 'desk-2', 'hung-2', 'chair-3', 'chair-4']);
  // 样本里离墙只差 1 像素的柜子被拉到了墙面上；离墙 11 像素的书桌（背板线）不动，画图时再拉
  assert.equal(geo.items.find((it) => it.id === 'glass-1').box[2], geo.rooms[0].rects[0][2]);
  assert.equal(geo.items.find((it) => it.id === 'desk-1').box[0], 316);

  // 交给编辑器 / 画图程序：都画得出来，理一遍不会再变，只提醒那三个待确认的
  assert.equal(renderGeo(geo), geo);
  assert.deepEqual(settleGeo(geo), geo);
  assert.deepEqual(validateGeo(geo).map((p) => p.code), ['unsure', 'unsure', 'unsure']);
  assert.deepEqual(detectSummary(geo), { rooms: 1, openings: 3, items: 18, unsure: 3 });
});

test('从头到尾：第二次看图的回复写到一半断了 → 墙和门窗照样完整，家具留下写完的那些，partial = true', () => {
  const { structureReply, itemsReply } = studyReplies();
  const text = JSON.stringify(itemsReply);
  const j2 = looseJson(text.slice(0, text.indexOf('GLASS DOOR CABINET') + 5));
  assert.equal(j2.partial, true);
  const st = parseStructure(looseJson(JSON.stringify(structureReply)).value, STUDY_SIZE);
  const built = buildGeo(st, parseItems(j2.value, STUDY_SIZE), STUDY_SIZE, {});
  assert.equal(built.geo.openings.length, 3);
  assert.deepEqual(built.geo.items.map((it) => it.kind), ['column', 'column', 'tall', 'shelf', 'desk', 'hung', 'chair', 'chair', 'low']);
  // 第二次看图整个失败（null）也一样
  const none = buildGeo(st, parseItems(null, STUDY_SIZE), STUDY_SIZE, {});
  assert.deepEqual(none.geo.items.map((it) => it.kind), ['column', 'column']);
  assert.equal(none.geo.rooms[0].rects.length, 2);
});

test('buildGeo：没认出房间 → 先用设计师框选的范围猜一个，没有就整张图缩 4%；标 roomGuess、留说明；门窗先贴在猜的墙上', () => {
  const none = parseStructure({}, SIZE);
  const a = buildGeo(none, parseItems(null, SIZE), SIZE, { mainRoom: [50.4, 60, 400, 300.2] });
  assert.deepEqual(a.geo.rooms, [{ name: '', rects: [[50, 60, 400, 300]] }]);
  assert.equal(a.geo.roomGuess, true);
  assert.equal(a.geo.scaleFrom, 'room');
  near(a.geo.mmPerPx, 4500 / 350, 0.01);
  assert.equal(a.geo.wallT, 14);
  assert.ok(a.notes.length >= 1);
  assert.equal(a.partial, false);
  assert.deepEqual(a.geo.openings, []);
  assert.deepEqual(a.geo.items, []);

  const b = buildGeo(none, null, SIZE, {});
  assert.deepEqual(b.geo.rooms, [{ name: '', rects: [[24, 20, 576, 480]] }]);
  assert.equal(b.geo.roomGuess, true);
  assert.deepEqual(buildGeo(none, null, SIZE, { mainRoom: [5, 5, 6, 6] }).geo.rooms[0].rects, [[24, 20, 576, 480]], '框选的范围太小不算');
  assert.deepEqual(buildGeo(none, null, SIZE, { mainRoom: [-100, -100, 9000, 9000] }).geo.rooms[0].rects, [[0, 0, 600, 500]], '超出图纸的夹回来');
  assert.deepEqual(buildGeo(null, null, SIZE, null).geo.rooms[0].rects, [[24, 20, 576, 480]]);

  // 只认出一扇门和一把椅子：都留着
  const some = buildGeo(structure({ rooms: [], openings: [{ type: 'door', box: [200, 150, 285, 165] }] }), { items: [{ kind: 'chair', label: '', box: [300, 300, 340, 345] }] }, SIZE, {});
  assert.equal(some.geo.roomGuess, true);
  assert.deepEqual(some.geo.openings, [{ type: 'door', side: 'top', a: 200, b: 285, at: 20 }]);
  assert.equal(some.geo.items.length, 1);
  assert.equal(some.geo.scaleFrom, 'door');
  // 有房间时不带 roomGuess
  assert.equal('roomGuess' in buildGeo(structure(), null, SIZE, {}).geo, false);
});

test('buildGeo：房间外面的东西留着但标 unsure（墙里的柱子不算）；离墙太远的门窗丢掉；重叠的同种门窗并成一个；没连上的凹位丢掉', () => {
  const st = structure({
    rooms: [{ name: 'ROOM', rects: [[100, 100, 500, 400], [20, 20, 60, 60], [60, 150, 101, 250], [200, 200, 300, 300]] }],
    openings: [
      { type: 'door', box: [200, 82, 280, 100] },
      { type: 'door', box: [260, 80, 330, 100] }, // 和上一个重叠 → 并成 200–330
      { type: 'window', box: [350, 84, 450, 100] }, // 种类不同，不并
      { type: 'window', box: [300, 0, 340, 8] }, // 离上墙 96 像素，太远
      { type: 'gap', box: [500, 150, 516, 230], unsure: true },
      { type: 'portal', box: [100, 400, 180, 416] }, // 种类不对 → 门洞
      { type: 'door', box: 'x' },
    ],
    columns: [[495, 150, 515, 180], [560, 450, 590, 480]],
  });
  const items = {
    items: [
      { kind: 'low', label: 'OUT', box: [520, 200, 580, 260] }, // 中心在房间外
      { kind: 'tall', label: 'IN', box: [102.4, 150, 161, 300] }, // 离左墙 1 像素多一点
      { kind: 'desk', label: 'FREE', box: [250, 200, 350, 260] },
      { kind: 'spaceship', label: '?', box: [300, 300, 320, 320] }, // 种类不对
      { kind: 'block', label: 'ROOMISH', box: [102, 101, 498, 399] }, // 把房间当成了家具
      { kind: 'tall', box: [0, 0, NaN, 5] },
      'junk',
    ],
  };
  const stBefore = snapshot(st);
  const itemsBefore = snapshot(items);
  const { geo, notes } = buildGeo(st, items, SIZE, {});
  assert.deepEqual(st, stBefore);
  assert.deepEqual(items, itemsBefore);

  assert.deepEqual(geo.rooms, [{ name: 'ROOM', rects: [[101, 100, 500, 400], [60, 150, 101, 250]] }], '左上角那块没连上 → 丢；在主矩形里面的 → 多余；差 1 像素的边对齐（100 和 101 取平均再取整）');
  assert.equal(geo.scaleFrom, 'door');
  assert.equal(geo.mmPerPx, 11.333, '门宽 80 和 70 的中位数 75 像素当 850 毫米');
  assert.equal(geo.wallT, 16);
  assert.deepEqual(geo.openings, [
    { type: 'door', side: 'top', a: 200, b: 330, at: 100 },
    { type: 'window', side: 'top', a: 350, b: 450, at: 100 },
    { type: 'gap', side: 'right', a: 150, b: 230, at: 500 },
    { type: 'gap', side: 'bottom', a: 101, b: 180, at: 400 },
  ]);
  assert.deepEqual(geo.items, [
    { id: 'column-1', label: '', kind: 'column', box: [495, 150, 515, 180] },
    { id: 'column-2', label: '', kind: 'column', box: [560, 450, 590, 480], unsure: true },
    { id: 'low-1', label: 'OUT', kind: 'low', box: [520, 200, 580, 260], unsure: true },
    { id: 'tall-1', label: 'IN', kind: 'tall', box: [101, 150, 160, 300], against: 'left' },
    { id: 'desk-1', label: 'FREE', kind: 'desk', box: [250, 200, 350, 260] },
    { id: 'block-1', label: '?', kind: 'block', box: [300, 300, 320, 320], unsure: true },
  ]);
  assert.equal(notes.length, 5, `丢了什么、哪些拿不准都记下来：${notes.join(' | ')}`);
  assert.ok(notes.some((n) => n.includes('凹位')) && notes.some((n) => n.includes('离墙太远')) && notes.some((n) => n.includes('门窗 AI 不太确定')) && notes.some((n) => n.includes('房间外面')) && notes.some((n) => n.includes('把房间当成了家具')));
  assert.ok(geo.openings.every((o) => !('unsure' in o)), '门窗的 unsure 不写进数据（编辑器只让确认柜子家具），只留说明');
  assert.ok(notes.every((n) => typeof n === 'string' && n));
  assert.deepEqual(settleGeo(geo), geo, '编辑器打开时理一遍，不会再变');
  // 留下来的房间外的东西不参与出图，但数据里还在
  assert.equal(renderGeo(geo).items.length, 4);
  assert.deepEqual(detectSummary(geo), { rooms: 1, openings: 4, items: 6, unsure: 3 });
});

test('buildGeo：椅子朝着最近的桌子；重复的框去掉；接近正方形的门框（连门扇一起框了）按最近的墙的方向；设计师给的比例尺优先', () => {
  const st = structure({
    openings: [{ type: 'door', box: [420, 320, 500, 400] }], // 80 x 80，贴着右墙和下墙的角：中心离右墙和下墙一样近
    wallT: 18,
  });
  const items = {
    items: [
      { kind: 'desk', label: '', box: [100, 150, 160, 350] },
      { kind: 'chair', label: '', box: [170, 200, 215, 250] },
      { kind: 'chair', label: '', box: [171, 201, 216, 251] }, // 重复
      { kind: 'chair', label: '', box: [300, 150, 345, 200] },
      { kind: 'desk', label: '', box: [280, 100, 370, 140], unsure: true },
    ],
  };
  const { geo, notes } = buildGeo(st, items, SIZE, { mmPerPx: 10 });
  assert.equal(geo.mmPerPx, 10);
  assert.equal(geo.scaleFrom, 'user');
  assert.equal(geo.wallT, 18, 'AI 量的 18 像素 = 180 毫米，说得通');
  assert.deepEqual(geo.items, [
    { id: 'desk-1', label: '', kind: 'desk', box: [100, 150, 160, 350], against: 'left' },
    { id: 'chair-1', label: '', kind: 'chair', box: [170, 200, 215, 250], facing: 'left' },
    { id: 'chair-2', label: '', kind: 'chair', box: [300, 150, 345, 200], facing: 'top' },
    { id: 'desk-2', label: '', kind: 'desk', box: [280, 100, 370, 140], against: 'top', unsure: true },
  ]);
  assert.equal(geo.openings.length, 1);
  assert.equal(geo.openings[0].b - geo.openings[0].a, 80);
  assert.deepEqual(settleGeo(geo), geo, '编辑器打开时理一遍，不会再变');
  assert.ok(notes.some((n) => n.includes('重复')));
  // 没有可靠的尺寸 → 说明里提醒比例尺是估的
  const guessed = buildGeo(structure(), null, SIZE, {});
  assert.equal(guessed.geo.scaleFrom, 'room');
  assert.equal(guessed.geo.mmPerPx, 11.25);
  assert.ok(guessed.notes.some((n) => n.includes('比例尺')));
  // 重新识别家具（ai/plan3d.js 的 detectPlanItems）：房间是设计师改好的像素坐标，直接传进来
  const again = buildGeo({ rooms: [{ name: 'A', rects: [[100, 100, 500, 400]] }], openings: [], columns: [], wallT: 20, dimension: null, notes: [] }, parseItems({ items: [{ kind: 'tall', box_2d: [200, 170, 500, 260] }] }, SIZE), SIZE, { mmPerPx: 10 });
  assert.deepEqual(again.geo.items, [{ id: 'tall-1', label: '', kind: 'tall', box: [100, 100, 154, 250], against: 'left' }], '离左墙 2 像素 → 拉到墙面');
});

test('buildGeo：两个房间各自对齐、几乎重叠的房间只留一个；内墙上的门贴在离它最近的那个房间的边上', () => {
  const st = structure({
    rooms: [
      { name: 'A', rects: [[50, 100, 300, 400]] },
      { name: 'B', rects: [[303, 101, 550, 400]], unsure: true }, // 和 A 之间只隔 3 像素的薄墙：不能并到一起
      { name: 'A again', rects: [[52, 102, 298, 398]] },
      { name: 'EMPTY', rects: [] },
      null,
    ],
    openings: [{ type: 'door', box: [300, 200, 303, 280] }],
  });
  const { geo, notes } = buildGeo(st, null, SIZE, {});
  assert.deepEqual(geo.rooms, [
    { name: 'A', rects: [[50, 100, 300, 400]] },
    { name: 'B', rects: [[303, 101, 550, 400]] },
  ]);
  assert.equal(geo.openings.length, 1);
  assert.deepEqual([geo.openings[0].a, geo.openings[0].b], [200, 280]);
  assert.ok(['left', 'right'].includes(geo.openings[0].side) && [300, 303].includes(geo.openings[0].at));
  assert.deepEqual(settleGeo(geo), geo);
  assert.ok(notes.some((n) => n.includes('重叠')) && notes.some((n) => n.includes('EMPTY')) && notes.some((n) => n.includes('B')));
});

test('buildGeo：全是废话也不抛错，总能给出一份画得出来的数据', () => {
  const garbage = [null, undefined, 42, 'text', [], {}, { rooms: 'x', openings: 5, columns: {}, wallT: 'thick', dimension: 'long' }, { rooms: [{ rects: [[1, 2]] }, { rects: 'no' }, 7], openings: [null, { box: null }, { type: 3, box: [1, 1, 1, 1] }], columns: [null, 'c', [0, 0, NaN, 1]] }, { items: [null, { box: 'x' }, { kind: {}, box: [10, 10, 50, 50], label: [] }] }];
  const sizes = [SIZE, null, {}, { w: 0, h: 0 }, { w: 'a', h: 5 }];
  const hints = [null, {}, { mainRoom: 'x', mmPerPx: -1 }, { mainRoom: [1, 2], mmPerPx: NaN }];
  let n = 0;
  for (const st of garbage) {
    for (const its of garbage) {
      for (const size of sizes) {
        const h = hints[n % hints.length];
        n += 1;
        const out = buildGeo(st, its, size, h);
        const geo = out.geo;
        assert.ok(geo && Array.isArray(geo.rooms) && geo.rooms.length >= 1 && Array.isArray(geo.openings) && Array.isArray(geo.items) && Array.isArray(out.notes));
        assert.ok(geo.mmPerPx > 0 && geo.wallT >= 3 && geo.source.w > 0 && geo.source.h > 0);
        assert.equal(geo.roomGuess, true);
        assert.equal(validateGeo(geo).filter((p) => p.level === 'error').length, 0);
        assert.equal(typeof detectSummary(geo).items, 'number');
      }
    }
  }
  // 从文字开始走一遍：第一次看图回了一句废话，第二次回了半截
  const j1 = looseJson('Sorry, I cannot help with that.');
  const j2 = looseJson('{"items":[{"kind":"desk","box_2d":[400,300,500,6');
  const out = buildGeo(parseStructure(j1.value, SIZE), parseItems(j2.value, SIZE), SIZE, {});
  assert.equal(out.geo.roomGuess, true);
  assert.deepEqual(out.geo.items, []);
  assert.doesNotThrow(() => parseStructure(looseJson('{"rooms":{"box_2d":{"a":1}},"dimension":{"p1":"x"}}').value, SIZE));
  assert.deepEqual(detectSummary(null), { rooms: 0, openings: 0, items: 0, unsure: 0 });
});

// ---------------------------------------------------------------------------
// 复查时发现的问题（每条一个回归测试）
// ---------------------------------------------------------------------------

test('looseJson：一份回复在每一个字符处截断都不抛错，截断点之前写完整的条目一个不少、内容不变', () => {
  const list = STUDY.items.map((it) => ({ kind: it.kind, label: `${it.label} {"[,]"} \\ 柜`, box_2d: units(it.box, STUDY_SIZE), confidence: 0.9 }));
  for (const indent of [0, 1]) {
    const body = JSON.stringify({ note: 'a "quoted" [note]', items: list }, null, indent);
    const text = `${FENCE}json\n${body}\n${FENCE}`;
    // 每个条目在正文里结束的位置
    const ends = [];
    let at = body.indexOf('"items"');
    for (const it of list) {
      const piece = JSON.stringify(it, null, indent).split('\n').join(`\n${' '.repeat(indent * 2)}`);
      at = body.indexOf(piece, at);
      assert.ok(at > 0);
      at += piece.length;
      ends.push(at);
    }
    for (let n = 0; n <= text.length; n += 1) {
      const r = looseJson(text.slice(0, n));
      const inBody = n - `${FENCE}json\n`.length;
      const done = ends.filter((e) => e <= inBody).length;
      if (inBody >= body.length) {
        assert.deepEqual(r, { value: JSON.parse(body), partial: false }, `截在 ${n}`);
        continue;
      }
      if (r.value !== null) assert.equal(r.partial, true, `截在 ${n}`);
      if (!done) continue;
      assert.ok(Array.isArray(r.value.items) && r.value.items.length >= done && r.value.items.length <= list.length, `截在 ${n}：写完整的 ${done} 项都要在`);
      assert.deepEqual(r.value.items.slice(0, done), list.slice(0, done), `截在 ${n}`);
      assert.doesNotThrow(() => parseItems(r.value, STUDY_SIZE));
    }
  }
});

test('toPxBox：box_2d 写坏了就看 box / bbox；图纸大得离谱时坐标也还是数', () => {
  const sz = { w: 2000, h: 1000 };
  assert.deepEqual(toPxBox({ box_2d: [1, 2], box: [100, 200, 300, 400] }, sz), [400, 100, 800, 300]);
  assert.deepEqual(toPxBox({ box_2d: 'x', bbox: [100, 200, 300, 400] }, sz), [400, 100, 800, 300]);
  assert.deepEqual(toPxBox({ box_2d: [100, 200, 300, 400], box: [0, 0, 5, 5] }, sz), [400, 100, 800, 300], 'box_2d 是好的就用它');
  const huge = toPxBox([314, 178, 845, 892], { w: 1e308, h: 1e9 });
  assert.ok(huge.every((v) => Number.isFinite(v)) && huge[0] < huge[2] && huge[1] < huge[3], `${huge}`);
});

test('parseStructure：尺寸线的两个端点用同一个单位（一个端点在图的左上角时不会被当成 0–1 的小数）；给了一个列表就用第一条；墙厚换算出来是 0 就不要', () => {
  const sz = { w: 1000, h: 1000 };
  assert.deepEqual(parseStructure({ dimension: { mm: 3000, p1: [1, 1], p2: [1, 501] } }, sz).dimension, { mm: 3000, px: 500 });
  assert.deepEqual(parseStructure({ dimension: { mm: 3000, p1: [0, 1], p2: [600, 1] } }, sz).dimension, { mm: 3000, px: 600 });
  assert.deepEqual(parseStructure({ dimension: { mm: 3000, p1: [0.1, 0.1], p2: [0.1, 0.6] } }, sz).dimension, { mm: 3000, px: 500 }, '都是小数还是按 0–1 算');
  assert.deepEqual(parseStructure({ dimension: [{ mm: 3000, p1: [100, 100], p2: [100, 600] }, { mm: 1, p1: [0, 0], p2: [5, 5] }] }, sz).dimension, { mm: 3000, px: 500 });
  assert.equal(parseStructure({ dimension: [] }, sz).dimension, null);
  assert.equal(parseStructure({ wall_thickness: 14 }, { w: 1e-5, h: 1e-5 }).wallT, null, '图纸小得离谱：墙厚舍成 0，不能当成量到了');
  assert.equal(parseStructure({ dimension: { mm: 3000, p1: [100, 100], p2: [100, 600] } }, { w: 1e-5, h: 1e-5 }).dimension, null);
});

test('parseStructure / parseItems：回复多包了一层数组、家具按房间分了组、整个回复就是一个框，都读得出来', () => {
  const sz = { w: 1000, h: 1000 };
  const room = { name: 'A', box_2d: [100, 100, 500, 500] };
  const door = { type: 'door', box_2d: [90, 200, 100, 300] };
  const wrapped = parseStructure([{ rooms: [room], openings: [door], wall_thickness: 14 }], sz);
  assert.deepEqual(wrapped.rooms, [{ name: 'A', rects: [[100, 100, 500, 500]] }]);
  assert.deepEqual(wrapped.openings, [{ type: 'door', box: [200, 90, 300, 100] }]);
  assert.equal(wrapped.wallT, 14);
  assert.deepEqual(wrapped.notes, []);
  assert.deepEqual(parseStructure(room, sz).rooms, [{ name: 'A', rects: [[100, 100, 500, 500]] }], '整个回复就是一个房间');
  // 数组里本来就是一个个房间（自己带着框）的，不当成多包了一层
  assert.equal(parseStructure([{ ...room, openings: [door] }, { name: 'B', box_2d: [100, 600, 500, 900] }], sz).rooms.length, 2);

  const desk = { kind: 'desk', label: 'D', box_2d: [100, 100, 200, 200] };
  const chair = { kind: 'chair', box_2d: [300, 300, 350, 350] };
  const tall = { kind: 'tall', box_2d: [500, 500, 600, 600] };
  assert.deepEqual(parseItems([{ items: [desk, chair] }], sz).items.map((it) => it.kind), ['desk', 'chair']);
  assert.deepEqual(parseItems([{ room: 'A', items: [desk] }, { room: 'B', items: [chair, tall] }], sz).items.map((it) => it.kind), ['desk', 'chair', 'tall']);
  assert.deepEqual(parseItems({ items: [{ room: 'A', furniture: [desk] }, chair] }, sz).items.map((it) => it.kind), ['desk', 'chair']);
  assert.deepEqual(parseItems(desk, sz).items, [{ kind: 'desk', label: 'D', box: [100, 100, 200, 200] }], '整个回复就是一件东西');
  assert.deepEqual(parseItems([{ items: [desk] }], sz).notes, []);
});

test('parseItems：label 截到 40 个字之后末尾不留空白', () => {
  const label = parseItems({ items: [{ kind: 'desk', label: `  ${'a'.repeat(39)} bcdef  `, box_2d: [100, 100, 200, 200] }] }, { w: 1000, h: 1000 }).items[0].label;
  assert.equal(label, 'a'.repeat(39));
});

test('alignRects：归完一遍又挨近了的接着归 —— 结果里没有两条差一点点的边，再对齐一次不会变；刚好差一个容差的也算挨近', () => {
  const rects = [[0, 0, 100, 50], [3, 0, 100, 50], [3.5, 0, 100, 50], [3.6, 0, 100, 50]];
  const once = alignRects(rects, 3);
  assert.deepEqual(once.map((r) => r[0]), [2.525, 2.525, 2.525, 2.525], '第一遍是 1.5 和 3.55（只差 2.05），接着并成一个');
  assert.deepEqual(alignRects(once, 3), once);
  // 值本来就一样的不会因为取平均多出一点误差
  const same = alignRects([[0.1, 0, 50, 50], [0.1, 0, 60, 50], [0.1, 0, 70, 50]], 1);
  assert.deepEqual(same.map((r) => r[0]), [0.1, 0.1, 0.1]);
  // 模型的坐标是整数格，差 4 格 = 正好一个容差（0.004 × 2395 = 9.58）：浮点误差不能让它漏掉
  const edge = alignRects([[512.53, 0, 1652.55, 900], [1662.13, 100, 1808.225, 300]], 0.004 * 2395);
  assert.equal(edge[0][2], edge[1][0]);
  near(edge[0][2], 1657.34, 1e-6);
});

test('buildGeo：凹位和主矩形之间不留缝（对齐、取整之后还差一点的拉到主矩形上，免得中间多出一道薄墙）', () => {
  const size = { w: 2395, h: 1646 };
  // 0.004 × 2395 = 9.58：凹位离主矩形 9.6 像素，对齐时差一点没并上，取整之后（1653 和 1662）只差 9 像素又算「连着」
  const st = { rooms: [{ name: 'R', rects: [[512, 403, 1652.6, 1293], [1662.2, 475, 1808, 607], [600, 1300, 830, 1380]] }], openings: [], columns: [], wallT: null, dimension: null, notes: [] };
  const { geo, notes } = buildGeo(st, null, size, {});
  const [main, ...niches] = geo.rooms[0].rects;
  assert.equal(niches.length, 2, notes.join(' | '));
  assert.deepEqual(niches[0], [main[2], 475, 1808, 607], '右边的凹位贴着主矩形的右边');
  assert.equal(niches[1][1], main[3], '下面的凹位贴着主矩形的下边');
  assert.deepEqual(settleGeo(geo), geo);
});

test('dedupeItems：只有两三个像素大的框不会因为放宽 2 像素互相「包着」而一起丢光', () => {
  const a = { kind: 'hung', box: [0, 0, 3, 3] };
  const b = { kind: 'hung', box: [1, 1, 3, 3] };
  const c = { kind: 'hung', box: [0, 0, 2, 2] };
  assert.deepEqual(dedupeItems([a, b, c]), [b, c], '大的那个包着两个小的 → 丢；两个小的留着');
  const line = { kind: 'hung', box: [31, 30, 31, 32] };
  const out = dedupeItems([{ kind: 'hung', box: [29, 29, 31, 30] }, line, { kind: 'hung', box: [31, 29, 32, 32] }]);
  assert.ok(out.includes(line), '压成一条线的框「包着」旁边两个比它大的：不算成组');
});

test('estimateScale / deriveWallT / buildGeo：图纸或房间大得离谱时比例尺不会被舍成 0，墙厚不会是 Infinity', () => {
  const big = estimateScale({ rooms: [{ rects: [[0, 0, 1e8, 10]] }] }, null, null);
  assert.equal(big.from, 'room');
  assert.equal(big.mmPerPx, 4500 / 1e8);
  assert.deepEqual(estimateScale({ rooms: [{ rects: [[0, 0, 1e300, 1e300]] }] }, null, null), { mmPerPx: 4500 / 1e300, from: 'room' });
  assert.deepEqual(estimateScale({ rooms: [{ rects: [[-1e308, 0, 1e308, 10]] }] }, null, null), { mmPerPx: 5, from: 'default' }, '长边算出来溢出了 → 当作没有房间');
  assert.equal(estimateScale({ rooms: [{ rects: [[0, 0, 1e8, 10]] }] }, { mm: 450, px: 1e7 }, null).mmPerPx, 4.5e-5);
  assert.equal(deriveWallT({ mmPerPx: 5e-324 }, null), 36);
  for (const size of [{ w: 1e9, h: 1e9 }, { w: 1e15, h: 1e9 }, { w: 1e-5, h: 1e308 }]) {
    const { geo, partial } = buildGeo(null, { items: [{ kind: 'desk', box: [10, 10, 50, 50] }] }, size, null);
    assert.ok(geo.mmPerPx > 0 && Number.isFinite(geo.mmPerPx) && geo.wallT >= 3 && Number.isFinite(geo.wallT), JSON.stringify(size));
    assert.equal(partial, false);
  }
});

test('buildGeo：一个门窗把前面两个连起来 → 三个并成一个（不会留下两个重叠的）', () => {
  const st = structure({
    openings: [
      { type: 'door', box: [200, 82, 240, 100] },
      { type: 'window', box: [400, 82, 460, 100] },
      { type: 'door', box: [300, 82, 340, 100] },
      { type: 'door', box: [230, 82, 310, 100] }, // 搭在第一个和第三个上
    ],
  });
  assert.deepEqual(buildGeo(st, null, SIZE, {}).geo.openings, [
    { type: 'door', side: 'top', a: 200, b: 340, at: 100 },
    { type: 'window', side: 'top', a: 400, b: 460, at: 100 },
  ]);
});

test('buildGeo：不经过 parse 直接传进来一大堆东西也不会卡住（有上限，留说明）；压成一条线的框不要', () => {
  const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const cell = (i) => [110 + (i % 60) * 6, 110 + Math.floor(i / 60) * 6, 114 + (i % 60) * 6, 114 + Math.floor(i / 60) * 6];
  const st = structure({ openings: many(3000, (i) => ({ type: i % 2 ? 'door' : 'window', box: [100 + (i % 190) * 2, 90, 101 + (i % 190) * 2 + 1, 100] })), columns: many(3000, cell) });
  const items = { items: many(20000, (i) => ({ kind: ['tall', 'chair', 'desk'][i % 3], label: '', box: cell(i) })) };
  const t0 = performance.now();
  const { geo, notes, partial } = buildGeo(st, items, SIZE, {});
  const ms = performance.now() - t0;
  assert.equal(partial, false);
  assert.ok(geo.items.length <= 480 + 160, `${geo.items.length}`);
  assert.ok(geo.items.filter((it) => it.kind === 'column').length <= 160);
  assert.ok(geo.openings.length <= 240);
  assert.ok(notes.some((n) => n.includes('太多')), notes.join(' | '));
  assert.ok(ms < 5000, `用了 ${Math.round(ms)} 毫秒`);
  // 房间也一样：再多也只留前面的
  const rooms = buildGeo({ rooms: many(500, (i) => ({ name: `R${i}`, rects: [[(i % 25) * 24, Math.floor(i / 25) * 24, (i % 25) * 24 + 20, Math.floor(i / 25) * 24 + 20]] })) }, null, SIZE, {});
  assert.equal(rooms.geo.rooms.length, 80);
  // 设计师自己改出来的房间（矩形比 AI 给的多）不受影响
  const edited = buildGeo({ rooms: [{ name: 'A', rects: [[100, 100, 500, 200]].concat(many(11, (i) => [100 + i * 30, 200, 125 + i * 30, 230 + i * 5])) }] }, null, SIZE, {});
  assert.equal(edited.geo.rooms[0].rects.length, 12);
  assert.deepEqual(edited.notes.filter((n) => n.includes('太多')), []);
  // 压成一条线的框（宽或高是 0）
  const flat = buildGeo(structure({ columns: [[150, 150, 150, 200]] }), { items: [{ kind: 'tall', label: 'LINE', box: [200, 300, 260, 300] }, { kind: 'tall', label: 'OK', box: [200, 310, 260, 340] }] }, SIZE, {});
  assert.deepEqual(flat.geo.items.map((it) => it.label), ['OK']);
});

// ---------------------------------------------------------------------------
// roomsForPrompt / 提示词
// ---------------------------------------------------------------------------

test('roomsForPrompt：每个房间的主矩形换回模型的坐标 [ymin,xmin,ymax,xmax]（0–1000 的整数）', () => {
  const st = parseStructure(studyReplies().structureReply, STUDY_SIZE);
  assert.deepEqual(roomsForPrompt(st, STUDY_SIZE), [{ name: 'STUDY ROOM', box_2d: [127, 164, 820, 577] }], '换过去再换回来是同一组数');
  assert.deepEqual(roomsForPrompt({ rooms: [{ name: 'A', rects: [[60, 100, 300, 400], [0, 0, 10, 10]] }, { name: 'bad', rects: [] }, null, { rects: [[-50, 0, 700, 250]] }] }, SIZE), [
    { name: 'A', box_2d: [200, 100, 800, 500] },
    { name: '', box_2d: [0, 0, 500, 1000] },
  ]);
  assert.deepEqual(roomsForPrompt(null, SIZE), []);
  assert.deepEqual(roomsForPrompt({ rooms: [{ rects: [[0, 0, 10, 10]] }] }, null), []);
});

test('提示词：说清楚 box_2d、ymin 在前、0–1000、只回 JSON；家具提示词写了每一种种类、列出传进来的房间', () => {
  const s = structurePrompt();
  const it = itemsPrompt([{ name: 'STUDY ROOM', box_2d: [127, 164, 820, 577] }, { name: '主卧 "A"', box_2d: [100, 600, 400, 900] }]);
  for (const p of [s, it]) {
    assert.equal(typeof p, 'string');
    assert.ok(p.includes('box_2d'));
    assert.ok(p.includes('[ymin,xmin,ymax,xmax]') && p.includes('[ymin, xmin, ymax, xmax]'));
    assert.ok(/0\s?[-–]\s?1000/.test(p), '0–1000');
    assert.ok(/ONLY JSON/.test(p));
    assert.ok(/floor plan/.test(p) && /top view/.test(p));
    assert.ok(/not invent/i.test(p));
    assert.ok(/confidence/.test(p));
    assert.ok(!p.includes('undefined') && !p.includes('[object'));
  }
  for (const word of ['"rooms"', '"niches"', '"openings"', '"columns"', '"wall_thickness"', '"dimension"', '"mm"', '"p1"', '"p2"', 'window|door|hidden-door|gap', 'INNER', 'swing arc', 'millimetres', 'null', 'fully drawn', 'empty array']) {
    assert.ok(s.includes(word), `第一次看图的提示词里有 ${word}`);
  }
  assert.ok(it.includes('tall|glass|low|desk|shelf|hung|chair|bed|sofa|fixture|column|block'));
  for (const kind of Object.keys(KINDS)) assert.ok(new RegExp(`^- ${kind} = `, 'm').test(it), `种类 ${kind} 有定义`);
  for (const word of ['"items"', '"kind"', '"label"', '"dashed"', 'DASHED', 'one box per chair', 'L-shaped', 'verbatim', 'door swings', 'dimension lines', 'title blocks', 'north arrows', 'rugs', 'At most 80']) {
    assert.ok(it.includes(word), `第二次看图的提示词里有 ${word}`);
  }
  assert.ok(it.includes('The rooms are'));
  assert.ok(it.includes('"STUDY ROOM" box_2d [127, 164, 820, 577]'));
  assert.ok(it.includes('"主卧 \\"A\\"" box_2d [100, 600, 400, 900]'), '房间名里的引号转义');
  // 没有房间 / 传进来的不对也照样出提示词
  for (const rooms of [[], null, undefined, 'x', [null, { name: 5 }, { box_2d: [1, 2] }]]) {
    const p = itemsPrompt(rooms);
    assert.ok(p.includes('box_2d') && !p.includes('The rooms are') && !p.includes('undefined'));
  }
  assert.equal(structurePrompt(), s, '同样的输入同样的结果');
  // 提示词里的房间就是 roomsForPrompt 给的那种
  assert.ok(itemsPrompt(roomsForPrompt(parseStructure(studyReplies().structureReply, STUDY_SIZE), STUDY_SIZE)).includes('"STUDY ROOM" box_2d [127, 164, 820, 577]'));
});

test('KIND_ALIASES：键都是小写、不带下划线和连字符，值都是已有的种类之一；每个种类自己也在里面', () => {
  for (const [alias, kind] of Object.entries(KIND_ALIASES)) {
    assert.ok(Object.hasOwn(KINDS, kind), `${alias} → ${kind}`);
    assert.equal(alias, alias.toLowerCase().trim());
    assert.ok(!/[_-]/.test(alias), alias);
  }
  for (const kind of Object.keys(KINDS)) assert.equal(KIND_ALIASES[kind], kind);
  for (const [alias, kind] of [['wardrobe', 'tall'], ['cabinet', 'tall'], ['bookcase', 'tall'], ['bookshelf', 'tall'], ['table', 'desk'], ['worktop', 'desk'], ['counter', 'low'], ['stool', 'chair'], ['sofa', 'sofa'], ['bed', 'bed'], ['toilet', 'fixture'], ['沙发', 'sofa'], ['床', 'bed'], ['马桶', 'fixture'], ['pillar', 'column'], ['wall cabinet', 'hung'], ['display', 'glass'], ['高柜', 'tall'], ['衣柜', 'tall'], ['书柜', 'tall'], ['矮柜', 'low'], ['书桌', 'desk'], ['桌', 'desk'], ['椅', 'chair'], ['吊柜', 'hung'], ['玻璃柜', 'glass'], ['柱', 'column'], ['层架', 'shelf']]) {
    assert.equal(KIND_ALIASES[alias], kind, alias);
  }
});

test('detect.js / prompt.js 导出的名字是约定好的那些；ES5 写法、只引用 plan3d 自己的文件、末尾一行 export', () => {
  assert.deepEqual(Object.keys(detect).sort(), ['alignRects', 'buildGeo', 'dedupeItems', 'deriveWallT', 'detectSummary', 'estimateScale', 'looseJson', 'parseItems', 'parseStructure', 'roomsForPrompt', 'toPxBox']);
  assert.deepEqual(Object.keys(prompt).sort(), ['KIND_ALIASES', 'itemsPrompt', 'structurePrompt']);
  const allowed = { 'detect.js': ['./geometry.js', './edit.js', './prompt.js'], 'prompt.js': [] };
  for (const f of Object.keys(allowed)) {
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
    assert.ok(!/\bfor\s*\([^)]*\sof\s/.test(bare), `${f}: 不用 for-of`);
    assert.ok(!/Object\.(assign|entries|values)|Array\.from|\.includes\(|\.find\(|\.findIndex\(|\.startsWith\(|\.endsWith\(|\.repeat\(|\.padStart\(|Number\.(isFinite|isInteger|isNaN)|Math\.(sign|hypot|trunc)|\bDate\b|Math\.random|\bwindow\s*\.|\bdocument\s*\./.test(bare), `${f}: 不用 ES6 的方法、不碰 DOM / 时间 / 随机数`);
    assert.ok(!/function\s*\w*\s*\([^)]*=[^)]*\)/.test(bare), `${f}: 不用默认参数`);
    assert.ok(!/\bvar\s*[[{]/.test(bare) && !/function\s*\w*\s*\([^)]*[[{]/.test(bare) && !/^\s*\[[^\n=]*\]\s*=[^=]/m.test(bare), `${f}: 不用解构`);
    const real = [...code.matchAll(/^\s*import\s[^;]*from\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    assert.deepEqual(real, allowed[f], `${f}: 只引用约定的文件`);
    assert.ok(!/\bimport\b[^;]*\bas\b/.test(bare), `${f}: 不改名引用`);
    assert.ok(!/import\s+[\w$]+\s*(,|from)/.test(bare), `${f}: 不用默认引用`);
    assert.equal((bare.match(/\bimport\b/g) || []).length, real.length, `${f}: import 都在开头那几行`);
    assert.equal((code.match(/^export\s*\{[^}]*\};?\s*$/gm) || []).length, 1, `${f}: 只有一行 export`);
    assert.equal((bare.match(/\bexport\b/g) || []).length, 1, `${f}: 不在声明处 export`);
    assert.ok(/export \{[^}]*\};\n$/.test(code), `${f}: export 在最后一行`);
    if (real.length) assert.ok(/^(\/\/[^\n]*\n)*(import \{[^}]*\} from '[^']+';\n)+\n/.test(code), `${f}: import 紧跟在开头的说明后面`);
  }
});
