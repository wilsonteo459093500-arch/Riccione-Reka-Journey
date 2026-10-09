// PDF 文字解析（import/labels.js）+ 行拼接（import/pdfExtract.js buildLines）
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import {
  collapseLetterSpacing, normalizeText, pangu, parseRoomTitle, parseFloorLabel, parseMaterialLabel, materialKey,
  parseFileName, parseNoteText, looksLikeMaterial, formatPdfDate, parseClientLine, roomZhFromEn, canonicalRoomEn, findCode,
  ROOM_DICT,
} from '../src/import/labels.js';
import { buildLines } from '../src/import/pdfExtract.js';

// ---------------------------------------------------------------------------
// 字距还原 / 标点
// ---------------------------------------------------------------------------

const SPACED = [
  ['M u a r - M r L a u', 'Muar - Mr Lau'],
  ['3 D d e s i g n', '3D design'],
  ['G R O U N D F L O O R', 'GROUND FLOOR'],
  ['F I R S T F L O O R', 'FIRST FLOOR'],
  ['w w w . s a i l d z . c o m', 'www.saildz.com'],
  ['O ffi c i a l p h o n e n u m b e r', 'Official phone number'],
  ['S h o w r o o m L o c a t i o n :', 'Showroom Location:'],
  ['主 人 房', '主人房'],
  ['化 妆 台 （ 白 天 ）', '化妆台（白天）'],
  ['S e t i a  A l a m', 'Setia Alam'],
  ['Mr Lau', 'Mr Lau'],
  ['SHOE CABIENT', 'SHOE CABIENT'],
  ['SS083M TAJ MAHAL', 'SS083M TAJ MAHAL'],
];
for (const [input, want] of SPACED) {
  test(`字距还原 ${JSON.stringify(input)}`, () => assert.equal(collapseLetterSpacing(input), want));
}

test('标点规范：中文里的半角括号 / 逗号 / 冒号 → 全角，& 两侧空格', () => {
  assert.equal(normalizeText('云岫洞石 AG318 (待确认）'), '云岫洞石 AG318（待确认）');
  assert.equal(normalizeText('液压闭门器 , 配反弹器'), '液压闭门器，配反弹器');
  assert.equal(normalizeText('玻璃门 ： 20隐框款'), '玻璃门：20隐框款');
  assert.equal(normalizeText('柜体&柜门'), '柜体 & 柜门');
  assert.equal(normalizeText('收 纳 柜 体 设 计 + 卫 生 间'), '收纳柜体设计+卫生间');
});

test('中英文之间加空格，5x → 5 ×', () => {
  assert.equal(pangu('35杯内嵌拉手腰线'), '35 杯内嵌拉手腰线');
  assert.equal(pangu('5x抽屉柜'), '5 × 抽屉柜');
  assert.equal(pangu('发光背板 3000k'), '发光背板 3000K');
  assert.equal(pangu('U形衣橱'), 'U 形衣橱');
});

// ---------------------------------------------------------------------------
// 空间标题
// ---------------------------------------------------------------------------

const TITLES = [
  ['鞋柜 SHOE CABIENT', { room: '鞋柜', roomEn: 'SHOE CABINET', subtitle: '' }],
  ['鞋柜 SHOE CABIENT （室内）', { room: '鞋柜', roomEn: 'SHOE CABINET', subtitle: '室内', qualifier: '室内' }],
  ['Living Area 客厅', { room: '客厅', roomEn: 'LIVING AREA', subtitle: '' }],
  ['Staircase Cabinet 楼梯储物柜', { room: '楼梯储物柜', roomEn: 'STAIRCASE CABINET', subtitle: '' }],
  ['Bedroom 卧室', { room: '卧室', roomEn: 'BEDROOM' }],
  ['KTV 娱乐室', { room: 'KTV 娱乐室', roomEn: 'KTV ROOM' }],
  ['麻将房 Mah Jong’s Room', { room: '麻将房', roomEn: 'MAHJONG ROOM' }],
  ['饭厅 Dining', { room: '饭厅', roomEn: 'DINING' }],
  ['厨房 Kitchen', { room: '厨房', roomEn: 'KITCHEN' }],
  ['主人房U形衣橱+化妆台（白天）', { room: '主人房', roomEn: 'MASTER BEDROOM', subtitle: 'U 形衣橱 · 化妆台 · 白天', qualifier: '白天' }],
  ['主人房U形衣橱+化妆台（晚上）', { room: '主人房', subtitle: 'U 形衣橱 · 化妆台 · 夜晚', qualifier: '夜晚' }],
  ['主人房入口视觉+展示柜体（白天）', { room: '主人房', subtitle: '入口视觉 · 展示柜体 · 白天' }],
  ['主人房+收纳展示柜+t榻榻米（白天）', { room: '主人房', subtitle: '收纳展示柜 · 榻榻米 · 白天' }],
  ['榻榻米+展示柜（白天）', { room: '榻榻米', roomEn: 'TATAMI', subtitle: '展示柜 · 白天' }],
  ['主人房（白天）', { room: '主人房', subtitle: '白天' }],
  ['主人房床头设计+L形衣橱（白天）', { room: '主人房', subtitle: '床头 · L 形衣橱 · 白天' }],
  ['中厅', { room: '中厅', roomEn: 'FAMILY HALL', subtitle: '' }],
  ['客房1（之前的女儿房）', { room: '客房 1', roomEn: 'GUEST ROOM 1', subtitle: '原女儿房', qualifier: '原女儿房' }],
  ['客房2（之前的儿子房）', { room: '客房 2', roomEn: 'GUEST ROOM 2', subtitle: '原儿子房' }],
  ['收纳柜体设计+卫生间隐形门', { room: '收纳柜体', roomEn: 'STORAGE', subtitle: '卫生间隐形门' }],
  ['主 人 房 U 形 衣 橱 + 化 妆 台 （ 白 天 ）', { room: '主人房', subtitle: 'U 形衣橱 · 化妆台 · 白天' }],
  ['Living Area', { room: '客厅', roomEn: 'LIVING AREA' }],
  ['主卧（夜景）', { room: '主卧', roomEn: 'MASTER BEDROOM', subtitle: '夜晚' }],
  ['书房 Study Room', { room: '书房', roomEn: 'STUDY' }],
];
for (const [input, want] of TITLES) {
  test(`空间标题 ${input}`, () => {
    const got = parseRoomTitle(input);
    for (const [k, v] of Object.entries(want)) assert.equal(got[k], v, `${k}: ${JSON.stringify(got)}`);
  });
}

test('空间标题：开头的楼层前缀单独拿出来', () => {
  const r = parseRoomTitle('一楼客厅');
  assert.equal(r.room, '客厅');
  assert.deepEqual(r.floor, { zh: '一楼', en: 'GROUND FLOOR' });
});

test('英文空间名 ↔ 中文', () => {
  assert.equal(roomZhFromEn('Living Area'), '客厅');
  assert.equal(roomZhFromEn('Bedroom'), '卧室');
  assert.equal(roomZhFromEn('Dining'), '饭厅');
  assert.equal(roomZhFromEn('Kitchen'), '厨房');
  assert.equal(roomZhFromEn('Staircase Cabinet'), '楼梯储物柜');
  assert.equal(roomZhFromEn('Mah Jong’s Room'), '麻将房');
  assert.equal(canonicalRoomEn('shoe cabient'), 'SHOE CABINET');
  assert.ok(Object.keys(ROOM_DICT).length >= 50);
});

// ---------------------------------------------------------------------------
// 楼层
// ---------------------------------------------------------------------------

const FLOORS = [
  ['GROUND FLOOR 一楼设计图', { zh: '一楼', en: 'GROUND FLOOR' }],
  ['FIRST FLOOR 二楼设计图', { zh: '二楼', en: 'FIRST FLOOR' }],
  ['SECOND FLOOR', { zh: '三楼', en: 'SECOND FLOOR' }],
  ['1F', { zh: '一楼', en: 'GROUND FLOOR' }],
  ['2F', { zh: '二楼', en: 'FIRST FLOOR' }],
  ['一楼', { zh: '一楼', en: 'GROUND FLOOR' }],
  ['L1', { zh: '二楼', en: 'FIRST FLOOR' }],
  ['L2', { zh: '三楼', en: 'SECOND FLOOR' }],
  ['ROOF', { zh: '天台', en: 'ROOF TOP' }],
  ['阁楼', { zh: '阁楼', en: 'ATTIC' }],
  ['地下室', { zh: '地下室', en: 'BASEMENT' }],
  ['G R O U N D F L O O R', { zh: '一楼', en: 'GROUND FLOOR' }],
  ['一楼客厅', null],
  ['Muar - Mr Lau', null],
  ['3D design 3D设计图', null],
];
for (const [input, want] of FLOORS) {
  test(`楼层 ${input}`, () => assert.deepEqual(parseFloorLabel(input), want));
}

// ---------------------------------------------------------------------------
// 材料标签
// ---------------------------------------------------------------------------

const MATERIALS = [
  ['柜体 & 柜门 归雁胡桃AG275', { role: '柜体 & 柜门', name: '归雁胡桃', code: 'AG275', pending: false }],
  ['柜体： 归雁胡桃AG275', { role: '柜体', name: '归雁胡桃', code: 'AG275', pending: false }],
  ['柜门 &见光板： 35杯内嵌拉手腰线 复合门', { role: '柜门 & 见光板', name: '35 杯内嵌拉手腰线 · 复合门', code: '', pending: false }],
  ['岩板： SS083M TAJ MAHAL', { role: '岩板', name: '岩板 · Taj Mahal', code: 'SS083M', pending: false }],
  ['玻璃门 ： 20隐框款 GZY004 超白玻璃', { role: '玻璃门', name: '超白玻璃 · 20 隐框款', code: 'GZY004', pending: false }],
  ['轻烟云AG365 （待确认）', { role: '', name: '轻烟云', code: 'AG365', pending: true }],
  ['开放柜 云岫洞石 AG318 （待确认）', { role: '开放柜', name: '云岫洞石', code: 'AG318', pending: true }],
  ['岩板：（待确认） SS083M TAJ MAHAL', { role: '岩板', name: '岩板 · Taj Mahal', code: 'SS083M', pending: true }],
  ['发光背板（3000k）', { role: '', name: '发光背板 3000K', code: '', pending: false }],
  ['银波纹玻璃', { role: '', name: '银波纹玻璃', code: '', pending: false }],
  ['岩板：SS061M （待确认） LIGHT GREY TERAZZO', { role: '岩板', name: '岩板 · Light Grey Terrazzo', code: 'SS061M', pending: true }],
  ['柜体 & 见光板： 归雁胡桃AG275', { role: '柜体 & 见光板', name: '归雁胡桃', code: 'AG275', pending: false }],
  ['墙板： 墨白橡 AG336', { role: '墙板', name: '墨白橡', code: 'AG336', pending: false }],
  ['床头板：\n柔陶白AG353A\n（待确认）', { role: '床头板', name: '柔陶白', code: 'AG353A', pending: true }],
  ['柜体&柜门：\n木隐AG355', { role: '柜体 & 柜门', name: '木隐', code: 'AG355', pending: false }],
];
for (const [input, want] of MATERIALS) {
  test(`材料标签 ${JSON.stringify(input)}`, () => assert.deepEqual(parseMaterialLabel(input), want));
}

test('材料编号：不认 3000k / 20 / 250mm', () => {
  assert.equal(findCode('发光背板 3000k'), null);
  assert.equal(findCode('20隐框款'), null);
  assert.equal(findCode('最高可做到250mm'), null);
  assert.equal(findCode('归雁胡桃AG275').code, 'AG275');
  assert.equal(findCode('柔陶白 AG353A').code, 'AG353A');
});

test('材料去重键', () => {
  assert.equal(materialKey({ code: 'ag275', name: '归雁胡桃' }), 'AG275');
  assert.equal(materialKey({ code: '', name: '银波纹 玻璃' }), '银波纹玻璃');
  assert.equal(materialKey({ name: '超白玻璃 · 20 隐框款' }), materialKey({ name: '超白玻璃·20隐框款' }));
});

test('像不像材料标签', () => {
  assert.equal(looksLikeMaterial('轻烟云AG365（待确认）'), true);
  assert.equal(looksLikeMaterial('银波纹玻璃'), true);
  assert.equal(looksLikeMaterial('开门方式：免拉手'), true);
  assert.equal(looksLikeMaterial('* 开门方式：免拉手'), false);
  assert.equal(looksLikeMaterial('二楼左边橱柜会让过道会狭窄'), false);
  assert.equal(looksLikeMaterial('下面加封板，避免卫生死角'), false);
});

// ---------------------------------------------------------------------------
// 备注
// ---------------------------------------------------------------------------

const NOTES = [
  [['door closer hydraulic', 'hidden door', '液压闭门器,配反弹器'], { label: '隐形门 · Hidden door', text: '液压闭门器，配反弹器' }],
  [['* 开门方式：免拉手'], { label: '开门方式', text: '免拉手' }],
  [['2个抽屉'], { label: '抽屉', text: '2 个抽屉' }],
  [['下面加封板，避免卫生死角'], { label: '封板', text: '下面加封板，避免卫生死角' }],
  [['隐形门,', '配反弹器'], { label: '隐形门', text: '配反弹器' }],
  [['柜门是', '全身镜'], { label: '柜门', text: '柜门是全身镜' }],
  [['4x 上下收纳', '柜体'], { label: '柜体', text: '4 × 上下收纳柜体' }],
  [['*建议用浅色和榻', '榻米颜色做链接'], { label: '建议', text: '浅色和榻榻米颜色做链接' }],
  [['*高度跟窗口齐平，', '最高可做到250mm，', '深度太浅不建议做成橱', '柜'], { label: '高度', text: '高度跟窗口齐平，最高可做到 250mm，深度太浅不建议做成橱柜' }],
  [['展示柜'], { label: '设计说明', text: '展示柜' }],
];
for (const [input, want] of NOTES) {
  test(`备注 ${JSON.stringify(input)}`, () => {
    const got = parseNoteText(input);
    assert.equal(got.label, want.label);
    assert.equal(got.text, want.text);
  });
}

test('备注：单个字 / 空白是噪声', () => {
  assert.equal(parseNoteText(['x']), null);
  assert.equal(parseNoteText(['，']), null);
  assert.equal(parseNoteText([]), null);
});

// ---------------------------------------------------------------------------
// 文件名 / 日期 / 客户
// ---------------------------------------------------------------------------

test('文件名：WPS 导出的原名', () => {
  assert.deepEqual(parseFileName('2026.8.6 Muar - Mr Lau - GF  L1.pdf'), { date: '2026 · 08', location: 'Muar', client: 'Mr Lau' });
});
test('文件名：上传后被改过的名字（哈希前缀 + 下划线）', () => {
  assert.deepEqual(parseFileName('5e430e16-2026.8.6_Muar_-_Mr_Lau_-_GF__L1.pdf'), { date: '2026 · 08', location: 'Muar', client: 'Mr Lau' });
});
test('文件名：客户在前 / 8 位日期', () => {
  assert.deepEqual(parseFileName('2025-11-02 Mdm Wong - Johor Bahru.pdf'), { date: '2025 · 11', location: 'Johor Bahru', client: 'Mdm Wong' });
  assert.deepEqual(parseFileName('20260806 KL - Mrs Tan.pdf'), { date: '2026 · 08', location: 'KL', client: 'Mrs Tan' });
});
test('文件名：认不出 → 空', () => {
  assert.deepEqual(parseFileName('proposal.pdf'), { date: '', location: '', client: '' });
  assert.deepEqual(parseFileName(''), { date: '', location: '', client: '' });
});
test('PDF 日期 / 标题页客户行', () => {
  assert.equal(formatPdfDate("D:20260807171604+08'00'"), '2026 · 08');
  assert.equal(formatPdfDate('garbage'), '');
  assert.deepEqual(parseClientLine('Muar - Mr Lau'), { location: 'Muar', client: 'Mr Lau' });
});

// ---------------------------------------------------------------------------
// 行拼接
// ---------------------------------------------------------------------------

test('行拼接：同一基线相邻片段 → 一行；中文之间不加空格，中英之间按间距加', () => {
  const lines = buildLines([
    { str: '柜体', x: 603.5, base: 322.1, w: 28.1, fs: 14.1 },
    { str: '&', x: 635.4, base: 322.1, w: 9.4, fs: 14.1 },
    { str: '柜门', x: 648.6, base: 322.1, w: 28.1, fs: 14.1 },
    { str: '归雁胡桃', x: 603.5, base: 344.5, w: 56.1, fs: 14.1 },
    { str: 'AG275', x: 659.5, base: 344.5, w: 43.7, fs: 14.1 },
    { str: '鞋柜', x: 20.1, base: 48.9, w: 36, fs: 18 },
    { str: 'SHOE CABIENT', x: 61.5, base: 48.9, w: 130.4, fs: 18 },
  ]);
  assert.deepEqual(lines.map((l) => l.text), ['鞋柜 SHOE CABIENT', '柜体 & 柜门', '归雁胡桃AG275']);
  assert.equal(lines[1].fs, 14.1);
  assert.ok(Math.abs(lines[1].y - (322.1 - 0.8 * 14.1)) < 0.2);
});

test('行拼接：远处同一基线的文字是不同的行；字距拉开的字合拢', () => {
  const lines = buildLines([
    { str: '圆 弧 形 床 边 设 计', x: 134.6, base: 181.3, w: 102.1, fs: 13 },
    { str: '床 头 织 物 纹 理 设', x: 324.8, base: 181.9, w: 102.1, fs: 13 },
    { str: '（待确认', x: 606.7, base: 347.8, w: 48, fs: 12 },
    { str: '）', x: 654.7, base: 347.8, w: 14.1, fs: 14.1 },
  ]);
  assert.deepEqual(lines.map((l) => l.text), ['圆弧形床边设计', '床头织物纹理设', '（待确认）']);
});
