// 体检第 2 阶段（2026-11-21）：PDF 导入认错的写法 —— 每条一个测试锁住
//   体检时用合成 PDF 重现过：一行两种材料、楼层写法、Bedroom 2 / 3、文件名 日.月.年、TBC、
//   干厨房 / Dry Kitchen、Living/Dining、(Day) / (Night)、设计特点的英文短语和后置否定
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { analyzePages } from '../src/import/analyze.js';
import {
  parseFloorLabel, isGroundStyleLabel, parseRoomTitle, parseMaterialLabel, parseMaterialLabels, splitMaterialLabel,
  looksLikeMaterial, parseFileName, findFileDate,
} from '../src/import/labels.js';
import { craftById, matchEntry, detectCrafts } from '../src/showroom/craft.js';

// ---------------------------------------------------------------------------
// 材料：一行两种、TBC
// ---------------------------------------------------------------------------

test('一行写两种材料：拆成两种，都不丢', () => {
  const p = (s) => parseMaterialLabels(s).map((m) => [m.role, m.name, m.code, m.pending]);
  assert.deepEqual(p('柜体 AG273 柜门 AG275'), [['柜体', '', 'AG273', false], ['柜门', '', 'AG275', false]]);
  assert.deepEqual(p('柜体：AG273 归雁胡桃 柜门：AG275 雾白'), [['柜体', '归雁胡桃', 'AG273', false], ['柜门', '雾白', 'AG275', false]]);
  assert.deepEqual(p('柜体 AG273 + 柜门 AG275 (TBC)'), [['柜体', '', 'AG273', false], ['柜门', '', 'AG275', true]]);
  assert.deepEqual(p('归雁胡桃AG275 雾白AG273'), [['', '归雁胡桃', 'AG275', false], ['', '雾白', 'AG273', false]]);
  assert.deepEqual(p('AG273 归雁胡桃 AG275 雾白'), [['', '归雁胡桃', 'AG273', false], ['', '雾白', 'AG275', false]]);
  // 一种材料：照旧一条
  assert.deepEqual(p('柜体 & 柜门 归雁胡桃AG275'), [['柜体 & 柜门', '归雁胡桃', 'AG275', false]]);
  assert.deepEqual(splitMaterialLabel('岩板：（待确认） SS083M TAJ MAHAL'), ['岩板：（待确认） SS083M TAJ MAHAL']);
  // 「柜体 AG273」：部位 + 编号，名称留空（以前「柜体」被当成名称）
  assert.deepEqual(parseMaterialLabel('柜体 AG273'), { role: '柜体', name: '', code: 'AG273', pending: false });
});

test('TBC / TBA / To be confirmed 跟「待确认」一样：标待确认，名称里不多出「Tbc」', () => {
  assert.deepEqual(parseMaterialLabel('柜体 (TBC) AG275 Oak'), { role: '柜体', name: 'Oak', code: 'AG275', pending: true });
  assert.deepEqual(parseMaterialLabel('Oak AG275 To be confirmed'), { role: '', name: 'Oak', code: 'AG275', pending: true });
  assert.deepEqual(parseMaterialLabel('雾白 AG201 T.B.C.'), { role: '', name: '雾白', code: 'AG201', pending: true });
  assert.equal(parseMaterialLabel('TBC').pending, true);
  assert.equal(parseMaterialLabel('TBC').name, '');
  assert.equal(looksLikeMaterial('TBC'), true);
  // 单词里面的 tbc 不算
  assert.equal(parseMaterialLabel('Stbcx AG201').pending, false);
  // 原来的中文写法不变
  assert.equal(parseMaterialLabel('岩板：SS061M （待确认） LIGHT GREY TERAZZO').name, '岩板 · Light Grey Terrazzo');
  // 视角名里的 (TBC) 不进副标题
  assert.equal(parseRoomTitle('Kitchen (TBC)').subtitle, '');
});

// ---------------------------------------------------------------------------
// 楼层
// ---------------------------------------------------------------------------

test('楼层写法：顶楼、Tingkat、LG、繁体「樓」、B1、Level 6', () => {
  const f = (s, o) => parseFloorLabel(s, o);
  assert.deepEqual(f('顶楼'), { zh: '顶楼', en: 'TOP FLOOR' });
  assert.deepEqual(f('顶楼 Roof Terrace'), { zh: '顶楼', en: 'ROOF TERRACE' });
  assert.deepEqual(f('Tingkat Bawah'), { zh: '一楼', en: 'GROUND FLOOR' });
  assert.deepEqual(f('Tingkat 1'), { zh: '二楼', en: 'FIRST FLOOR' });
  assert.deepEqual(f('Tingkat 2'), { zh: '三楼', en: 'SECOND FLOOR' });
  assert.deepEqual(f('LG'), { zh: '地下层', en: 'LOWER GROUND FLOOR' });
  assert.deepEqual(f('三樓'), { zh: '三楼', en: 'SECOND FLOOR' });
  assert.deepEqual(f('B1'), { zh: '地下一层', en: 'BASEMENT 1' });
  assert.deepEqual(f('Level 6'), { zh: '七楼', en: 'SIXTH FLOOR' });
  assert.deepEqual(f('七楼'), { zh: '七楼', en: 'SIXTH FLOOR' });
  // 不是楼层的照旧不认
  assert.equal(f('LG Bedroom'), null);
  assert.equal(f('Bedroom 2'), null);
});

test('1F：中文习惯是一楼；同一份方案另有 GF 时，1F 是 GF 上面那层', () => {
  assert.deepEqual(parseFloorLabel('1F'), { zh: '一楼', en: 'GROUND FLOOR' });
  assert.deepEqual(parseFloorLabel('1F', { nfAboveGround: true }), { zh: '二楼', en: 'FIRST FLOOR' });
  assert.deepEqual(parseFloorLabel('L1'), { zh: '二楼', en: 'FIRST FLOOR' }, 'L1 / Level 1 一直是 GF 上面那层');
  assert.equal(isGroundStyleLabel('GF'), true);
  assert.equal(isGroundStyleLabel('Ground Floor 一楼设计图'), true);
  assert.equal(isGroundStyleLabel('Lower Ground Floor'), false);
  assert.equal(isGroundStyleLabel('1F'), false);
  assert.equal(isGroundStyleLabel('GF 客厅'), false, '只认纯楼层标签');
});

// ---------------------------------------------------------------------------
// 空间名
// ---------------------------------------------------------------------------

test('Bedroom 2 / Bedroom 3 是两间房；Living/Dining；(Day) / (Night)', () => {
  const t = (s) => { const r = parseRoomTitle(s); return [r.room, r.roomEn, r.subtitle]; };
  assert.deepEqual(t('Bedroom 2'), ['卧室 2', 'BEDROOM 2', '']);
  assert.deepEqual(t('Bedroom 3'), ['卧室 3', 'BEDROOM 3', '']);
  assert.deepEqual(t('Bedroom2'), ['卧室 2', 'BEDROOM 2', '']);
  assert.deepEqual(t('BEDROOM 2 卧室'), ['卧室 2', 'BEDROOM 2', '']);
  assert.deepEqual(t('Living/Dining'), ['客餐厅', 'LIVING & DINING', '']);
  assert.deepEqual(t('Living / Dining Area'), ['客餐厅', 'LIVING & DINING', '']);
  assert.deepEqual(t('Living Area (Night)'), ['客厅', 'LIVING AREA', '夜晚']);
  assert.deepEqual(t('Master Bedroom (Day)'), ['主人房', 'MASTER BEDROOM', '白天']);
  assert.deepEqual(t('Kitchen - Night'), ['厨房', 'KITCHEN', '夜晚']);
  assert.deepEqual(t('Living Area - Night View'), ['客厅', 'LIVING AREA', '夜晚']);
  assert.deepEqual(t('客厅 (Day)'), ['客厅', 'LIVING AREA', '白天']);
  assert.deepEqual(t('干厨房'), ['干厨房', 'DRY KITCHEN', '']);
  // 原来的写法不变
  assert.deepEqual(t('客房1（之前的女儿房）'), ['客房 1', 'GUEST ROOM 1', '原女儿房']);
  assert.deepEqual(t('客厅 - 电视柜'), ['客厅', 'LIVING AREA', '电视柜']);
});

// ---------------------------------------------------------------------------
// 文件名
// ---------------------------------------------------------------------------

test('文件名：日.月.年 / 日期在后面 / 英文月份 —— 客户和地点不再对调', () => {
  const f = (s) => { const r = parseFileName(s); return [r.date, r.client, r.location]; };
  assert.deepEqual(f('6.8.2026 Mr Tan - Puchong.pdf'), ['2026 · 08', 'Mr Tan', 'Puchong']);
  assert.deepEqual(f('06-08-2026 Puchong - Mr Tan.pdf'), ['2026 · 08', 'Mr Tan', 'Puchong']);
  assert.deepEqual(f('Mr Tan - Puchong - 6.8.2026.pdf'), ['2026 · 08', 'Mr Tan', 'Puchong']);
  assert.deepEqual(f('Ms Lim - Setia Alam - 12 Sep 2026.pdf'), ['2026 · 09', 'Ms Lim', 'Setia Alam']);
  assert.deepEqual(f('20260806 Mr Tan - Puchong.pdf'), ['2026 · 08', 'Mr Tan', 'Puchong']);
  // 原来的写法不变
  assert.deepEqual(f('2026.8.6 Muar - Mr Lau - GF  L1.pdf'), ['2026 · 08', 'Mr Lau', 'Muar']);
  assert.deepEqual(f('2026年8月6日 陈先生 - 蒲种.pdf'), ['2026 · 08', '陈先生', '蒲种']);
  // 不像日期的数字不当日期
  assert.equal(findFileDate('Unit 12-3 Mr Tan'), null);
  assert.equal(findFileDate('31.13.2026'), null);
});

// ---------------------------------------------------------------------------
// 设计特点认词
// ---------------------------------------------------------------------------

test('设计特点：英文短语在句子中间也认得；后置否定（「海棠角不做」）不建议', () => {
  const m = (id, t) => matchEntry(craftById(id), t);
  assert.equal(m('yinxingmen', 'Wardrobe with hidden door'), 'hidden door');
  assert.equal(m('tuofeng', 'Shadow gap 10mm all round'), 'shadow gap');
  assert.equal(m('lacao', 'Fluted door panel'), 'fluted');
  assert.equal(m('yinxingmen', 'no hidden door'), null);
  assert.equal(m('yinxingmen', 'without hidden door'), null);
  assert.equal(m('haitang', '海棠角不做'), null);
  assert.equal(m('haitang', '海棠角不做，改直角'), null);
  assert.equal(m('haitang', '海棠角（不做）'), null);
  assert.equal(m('yinxingmen', '隐形门：取消'), null);
  // 否定的是后面别的东西 → 照样算
  assert.equal(m('yinxingmen', '隐形门不要门套'), '隐形门');
  // 原来的规则不变
  assert.equal(m('haitang', '不做海棠角'), null);
  assert.equal(m('jiaxin', 'abacus'), null);
  assert.equal(m('jiaxin', '夹心板'), null);
  const view = { notes: [{ label: '设计说明', text: 'Display cabinet with hidden door and shadow gap' }], subtitle: '', materials: [] };
  assert.deepEqual(detectCrafts(view).map((x) => x.id), ['tuofeng', 'yinxingmen']);
});

// ---------------------------------------------------------------------------
// 整份：写法很乱的方案（重现体检时那份合成 PDF 的问题）
// ---------------------------------------------------------------------------

const L = (text, x, y, fs = 12, w) => ({ text, x, y, w: w ?? text.length * fs * 0.8, h: fs, fs });
const I = (key, x, y, w, h, pxW = 1600, pxH = 1000) => ({ key, x, y, w, h, pxW, pxH });
const pageOf = (n, lines, images, W = 960, H = 540) => ({ n, width: W, height: H, lines, images });
const floorPage = (n, text) => pageOf(n, [L(text, 300, 250, 28)], []);
// 效果图页：标题在左上，效果图在左，色板在右，标签在色板下面
const viewPage = (n, title, labels = [], { swatch = true } = {}) =>
  pageOf(
    n,
    [L(title, 20, 20, 20), ...labels.map((t, i) => L(t, 800, 240 + i * 16))],
    [I(`r${n}`, 10, 80, 760, 440), ...(swatch ? [I(`sw${n}`, 800, 100, 130, 130, 500, 500)] : [])]
  );

test('整份乱写的方案：楼层、房间、材料、文件名都对', () => {
  const pages = [
    pageOf(1, [], [I('cover', 0, 0, 960, 540)]),
    pageOf(2, [L('3D DESIGN', 300, 200, 28), L('Mr Tan - Puchong', 300, 260, 14)], []),
    floorPage(3, 'GF'),
    viewPage(4, 'Living/Dining', ['柜体 AG273 柜门 AG275']),
    viewPage(5, 'Bedroom 2', ['柜体：雾白 AG201']),
    viewPage(6, 'Bedroom 3', [], { swatch: false }),
    viewPage(7, '干厨房', ['柜门：浅川橡 AG280']),
    viewPage(8, 'Dry Kitchen', [], { swatch: false }),
    floorPage(9, '1F'),
    viewPage(10, 'Master Bedroom (Night)', ['柜体 & 柜门 归雁胡桃AG290']),
    floorPage(11, '顶楼 Roof Terrace'),
    pageOf(12, [L('阳台 BALCONY', 20, 20, 20), L('岩板 SS083M', 800, 240), L('TBC', 800, 290)], [I('r12', 10, 80, 760, 440), I('sw12', 800, 100, 130, 130, 500, 500)]),
    floorPage(13, 'Tingkat 2'),
    viewPage(14, '书房 Study', ['柜体：墨白橡 AG336']),
  ];
  const a = analyzePages({ meta: { creationDate: 'D:20261101000000' }, pages }, { fileName: '6.8.2026 Mr Tan - Puchong.pdf' });

  assert.deepEqual([a.info.client, a.info.location, a.info.date], ['Mr Tan', 'Puchong', '2026 · 08']);
  assert.deepEqual(a.floors.map((f) => `${f.zh} ${f.en}`), ['一楼 GROUND FLOOR', '二楼 FIRST FLOOR', '顶楼 ROOF TERRACE', '三楼 SECOND FLOOR']);
  assert.deepEqual(a.pages.map((p) => p.kind), ['cover', 'title', 'floor', 'view', 'view', 'view', 'view', 'view', 'floor', 'view', 'floor', 'view', 'floor', 'view']);

  const v = (n) => a.views.find((x) => x.page === n);
  const fl = (n) => a.floors.find((f) => f.key === v(n).floorKey)?.zh;
  assert.deepEqual([4, 5, 6, 7, 8, 10, 12, 14].map((n) => [v(n).room, fl(n)]), [
    ['客餐厅', '一楼'], ['卧室 2', '一楼'], ['卧室 3', '一楼'], ['干厨房', '一楼'], ['干厨房', '一楼'],
    ['主人房', '二楼'], ['阳台', '顶楼'], ['书房', '三楼'],
  ]);
  assert.equal(v(10).subtitle, '夜晚');

  const codes = (n) => v(n).materials.map((m) => a.materials.find((x) => x.key === m.materialKey)?.code);
  assert.deepEqual(codes(4), ['AG273', 'AG275'], '一行两种材料都在');
  assert.deepEqual(codes(6), [], 'Bedroom 3 没有色板，不能借 Bedroom 2 的材料');
  assert.deepEqual(codes(8), ['AG280'], 'Dry Kitchen 和干厨房是同一间，沿用材料');
  const ss = a.materials.find((m) => m.code === 'SS083M');
  assert.equal(ss.pending, true, 'TBC 标在材料上');
  assert.ok(!v(12).notes.some((n) => /TBC/i.test(n.text)), 'TBC 不当备注');
  assert.ok(!a.materials.some((m) => /tbc/i.test(m.name)));
});

test('「岩板 SS083M」：部位就是材料，当名称；「柜体 AG273」的柜体不是材料', () => {
  assert.deepEqual(parseMaterialLabel('岩板 SS083M'), { role: '岩板', name: '岩板', code: 'SS083M', pending: false });
  assert.equal(parseMaterialLabel('柜体 AG273').name, '');
});
