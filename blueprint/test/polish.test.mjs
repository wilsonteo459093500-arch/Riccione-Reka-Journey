// AI 润色纯函数测试：分组、JSON 解析容错、字段清洗、补丁生成与套用（不发网络请求）
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import {
  chunkBalanced, groupViewSlides, slideBrief, extractJson, normalizeDots, sanitizeSubtitle, sanitizeRoomEn,
  sanitizeNoteLabel, sanitizeNotes, parsePolishResponse, buildPatches, applyPolishPatches, isPolishable,
  SUBTITLE_MAX, ROOM_EN_MAX,
} from '../src/ai/polish.js';
import { buildPolishPrompt } from '../src/ai/prompts.js';

const view = (id, room, extra = {}) => ({
  id, kind: 'view', enabled: true, floorId: 'f1', layout: 'auto', image: `asset:${id}`, room, roomEn: '', subtitle: '',
  materials: [], notes: [], ...extra,
});

const project = (slides) => ({
  id: 'p1',
  floors: [{ id: 'f1', zh: '一楼', en: 'GROUND FLOOR' }, { id: 'f2', zh: '二楼', en: 'FIRST FLOOR' }],
  materials: [{ id: 'm1', name: '浅川橡', code: 'AG273', image: null, pending: false }],
  slides,
});

const entriesOf = (slides) => slides.map((slide, i) => ({ key: `v${i + 1}`, slide }));

test('chunkBalanced：均分而不是 6 + 1', () => {
  const ids = (n) => Array.from({ length: n }, (_, i) => i);
  assert.deepEqual(chunkBalanced(ids(7), 6).map((c) => c.length), [4, 3]);
  assert.deepEqual(chunkBalanced(ids(6), 6).map((c) => c.length), [6]);
  assert.deepEqual(chunkBalanced(ids(13), 6).map((c) => c.length), [5, 5, 3]);
  assert.deepEqual(chunkBalanced([], 6), []);
});

test('groupViewSlides：连续同层同空间成组；章节页打断；停用 / 立体图跳过但不打断', () => {
  const p = project([
    { id: 'fl1', kind: 'floor', floorId: 'f1', enabled: true },
    view('a', '客厅'),
    view('b', '客厅'),
    view('off', '客厅', { enabled: false }),
    view('3d', '一楼', { tag: '3d' }),
    view('c', '客厅'),
    view('d', '饭厅'),
    { id: 'fl2', kind: 'floor', floorId: 'f2', enabled: true },
    view('e', '饭厅', { floorId: 'f2' }),
  ]);
  const groups = groupViewSlides(p);
  assert.deepEqual(groups.map((g) => g.slides.map((s) => s.id)), [['a', 'b', 'c'], ['d'], ['e']]);
  assert.equal(groups[0].label, '一楼 · 客厅');
  assert.equal(groups[2].floorLabel, '二楼');
  assert.equal(isPolishable(view('x', '客厅', { tag: '3d' })), false);
});

test('groupViewSlides：超过 6 张分批并标注（1/2）；onlySlideIds 只取指定页', () => {
  const slides = Array.from({ length: 8 }, (_, i) => view(`s${i}`, '主人房'));
  const groups = groupViewSlides(project(slides));
  assert.deepEqual(groups.map((g) => g.slides.length), [4, 4]);
  assert.equal(groups[0].label, '一楼 · 主人房（1/2）');
  assert.equal(groups[1].part, 2);
  const only = groupViewSlides(project(slides), { onlySlideIds: ['s3'] });
  assert.equal(only.length, 1);
  assert.deepEqual(only[0].slides.map((s) => s.id), ['s3']);
});

test('slideBrief：材料写成「role: name code」，空备注去掉', () => {
  const p = project([]);
  const s = view('a', '客厅', {
    roomEn: 'LIVING AREA',
    materials: [{ role: '柜体 & 柜门', materialId: 'm1' }, { role: '', materialId: 'missing' }],
    notes: [{ label: '设计说明', text: '液压闭门器，配反弹器' }, { label: '', text: '  ' }],
  });
  const b = slideBrief(s, p, 'v1');
  assert.equal(b.id, 'v1');
  assert.deepEqual(b.materials, ['柜体 & 柜门: 浅川橡 AG273', '材料: —']);
  assert.deepEqual(b.notes, [{ label: '设计说明', text: '液压闭门器，配反弹器' }]);
});

test('buildPolishPrompt：说明风格、列出每页、要求只回 JSON', () => {
  const p = project([]);
  const prompt = buildPolishPrompt({ floor: '一楼', room: '客厅', briefs: [slideBrief(view('a', '客厅'), p, 'v1')], imageOrder: ['v1'] });
  assert.ok(prompt.includes('v1'));
  assert.ok(prompt.includes('客厅'));
  assert.ok(/JSON/.test(prompt));
});

test('extractJson：代码块 / 前后废话 / 尾逗号 / 字符串里的括号', () => {
  assert.deepEqual(extractJson('```json\n{"slides":[{"id":"v1"}]}\n```'), { slides: [{ id: 'v1' }] });
  assert.deepEqual(extractJson('好的，结果如下：{"a":1,} 希望有帮助'), { a: 1 });
  assert.deepEqual(extractJson('[{"x":"} 不是结束"}]'), [{ x: '} 不是结束' }]);
  assert.deepEqual(extractJson({ already: true }), { already: true });
  assert.throws(() => extractJson('完全不是 JSON'), (e) => e.parse === true);
});

test('normalizeDots / sanitizeSubtitle：统一分隔符、去掉重复空间名、保留白天/夜晚、限长', () => {
  assert.equal(normalizeDots('衣柜•化妆台・夜晚'), '衣柜 · 化妆台 · 夜晚');
  assert.equal(sanitizeSubtitle('「客厅 · 全景」', { room: '客厅' }), '全景');
  assert.equal(sanitizeSubtitle('衣柜近景', { room: '主人房', before: 'U形衣橱 · 化妆台 · 夜晚' }), '衣柜近景 · 夜晚');
  const long = sanitizeSubtitle('超长的视角名称一二三四五六七八九十 · 夜晚', { room: '主人房' });
  assert.ok(Array.from(long).length <= SUBTITLE_MAX, long);
  assert.ok(long.endsWith('夜晚'), long);
  assert.equal(sanitizeSubtitle(42), '');
});

test('sanitizeRoomEn：大写、去怪字符、按单词截断', () => {
  assert.equal(sanitizeRoomEn('Living area'), 'LIVING AREA');
  assert.equal(sanitizeRoomEn('  Mah-Jong room!! '), 'MAH-JONG ROOM');
  const long = sanitizeRoomEn('master bedroom wardrobe and vanity with display cabinet');
  assert.ok(long.length <= ROOM_EN_MAX);
  assert.ok(!long.endsWith(' '));
  assert.equal(sanitizeRoomEn(null), '');
});

test('sanitizeNoteLabel / sanitizeNotes：「中文 English」→「中文 · English」，丢掉空项', () => {
  assert.equal(sanitizeNoteLabel('隐形门 Hidden door'), '隐形门 · Hidden door');
  assert.equal(sanitizeNoteLabel('开门方式：'), '开门方式');
  assert.deepEqual(sanitizeNotes([{ label: '隐形门 Hidden door', text: ' 液压闭门器，配反弹器 ' }, { label: '', text: '' }, '免拉手']), [
    { label: '隐形门 · Hidden door', text: '液压闭门器，配反弹器' },
    { label: '', text: '免拉手' },
  ]);
  assert.equal(sanitizeNotes('不是数组'), null);
});

test('parsePolishResponse：按短 id / 原 id / 位置对应；未知 id 忽略；类型不对的字段丢掉', () => {
  const entries = entriesOf([view('a', '客厅'), view('b', '客厅')]);
  const r1 = parsePolishResponse('{"slides":[{"id":"v2","subtitle":"沙发视角"},{"id":"zzz","subtitle":"x"},{"id":"a","roomEn":"LIVING AREA","notes":"bad"}]}', entries);
  assert.deepEqual(r1.get('v2'), { subtitle: '沙发视角' });
  assert.deepEqual(r1.get('v1'), { roomEn: 'LIVING AREA' });
  const r2 = parsePolishResponse('[{"subtitle":"全景"},{"subtitle":"电视柜","room_en":"living"}]', entries);
  assert.equal(r2.get('v1').subtitle, '全景');
  assert.equal(r2.get('v2').roomEn, 'living');
  assert.throws(() => parsePolishResponse('{"slides":[{"id":"zzz","subtitle":"x"}]}', entries), (e) => e.parse === true);
});

test('buildPatches：只留变化；英文名同组统一；不凭空加备注；撞名撤回改出来的那个', () => {
  const slides = [
    view('a', '客厅', { subtitle: '', notes: [{ label: '设计说明', text: '液压闭门器，配反弹器' }] }),
    view('b', '客厅', { subtitle: '视角二' }),
    view('c', '客厅', { subtitle: '全景' }),
  ];
  const entries = entriesOf(slides);
  const results = new Map([
    ['v1', { subtitle: '电视柜', roomEn: 'Living Area', notes: [{ label: '隐形门 Hidden door', text: '液压闭门器，配反弹器' }, { label: '多出来的', text: '编造' }] }],
    ['v2', { subtitle: '全景', roomEn: 'LIVING AREA', notes: [{ label: '凭空', text: '不该加' }] }],
    ['v3', { subtitle: '全景', roomEn: 'LIVING ROOM' }],
  ]);
  const rows = buildPatches(entries, results);
  const byId = Object.fromEntries(rows.map((r) => [r.slideId, r.patch]));
  assert.equal(byId.a.subtitle, '电视柜');
  assert.equal(byId.a.roomEn, 'LIVING AREA');
  assert.deepEqual(byId.a.notes, [{ label: '隐形门 · Hidden door', text: '液压闭门器，配反弹器' }]);
  // b 想改成「全景」，但 c 原本就叫「全景」→ 撤回 b 的视角名
  assert.equal(byId.b.subtitle, undefined);
  assert.equal(byId.b.notes, undefined, '原来没有备注就不加');
  assert.equal(byId.b.roomEn, 'LIVING AREA');
  assert.equal(byId.c.subtitle, undefined, '没变化不出补丁');
  for (const r of rows) assert.ok(Object.keys(r.patch).length > 0, '只返回有改动的页');
});

test('applyPolishPatches：只改 subtitle / roomEn / notes，材料与其它页不动', () => {
  const mats = [{ role: '柜体', materialId: 'm1' }];
  const p = project([view('a', '客厅', { materials: mats }), view('b', '饭厅')]);
  const next = applyPolishPatches(p, [
    { slideId: 'a', patch: { subtitle: '全景', roomEn: 'LIVING AREA', notes: [{ label: 'x', text: 'y' }], materials: [], room: '改房间' } },
    { slideId: 'nope', patch: { subtitle: 'z' } },
  ]);
  const a = next.slides[0];
  assert.equal(a.subtitle, '全景');
  assert.equal(a.roomEn, 'LIVING AREA');
  assert.deepEqual(a.notes, [{ label: 'x', text: 'y' }]);
  assert.equal(a.materials, mats);
  assert.equal(a.room, '客厅');
  assert.equal(next.slides[1], p.slides[1]);
  assert.equal(applyPolishPatches(p, []), p);
});
