// PDF 页面分析（import/analyze.js）—— 用真实方案 PDF 抽出的 fixture（客户名已匿名）
//   重新生成 fixture：node scripts/dump_pages.mjs <pdf> --file-name "…" --fixture test/fixtures/sample-pages.json
//   直接跑真实 PDF：BLUEPRINT_PDF=/path/to.pdf node test/run.mjs analyze
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test } from './harness.mjs';
import { analyzePages } from '../src/import/analyze.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(fs.readFileSync(path.join(dir, 'fixtures/sample-pages.json'), 'utf8'));

/** 对一份分析结果做全套断言（fixture 与真实 PDF 共用） */
function checkSample(a, { client = 'Mr Demo' } = {}) {
  const page = (n) => a.pages.find((p) => p.n === n);
  const view = (n) => a.views.find((v) => v.page === n);
  const mat = (code) => a.materials.find((m) => m.code === code);
  const matOf = (v, code) => v.materials.find((m) => m.materialKey === mat(code)?.key);

  // 项目信息
  assert.deepEqual(a.info, { client, location: 'Muar', date: '2026 · 08', sourceFile: a.info.sourceFile });

  // 楼层
  assert.equal(a.floors.length, 2);
  assert.deepEqual(a.floors.map((f) => [f.zh, f.en]), [['一楼', 'GROUND FLOOR'], ['二楼', 'FIRST FLOOR']]);

  // 页类型
  assert.equal(page(1).kind, 'cover');
  assert.equal(page(2).kind, 'title');
  assert.equal(page(3).kind, 'floor');
  assert.equal(page(31).kind, 'floor');
  assert.equal(page(56).kind, 'end');
  assert.ok(a.views.length >= 50, `视角页 ${a.views.length}`);
  for (let n = 4; n <= 55; n++) if (n !== 31) assert.equal(page(n).kind, 'view', `p${n}`);

  // 材料（全稿去重）
  const expect = [
    ['AG275', '归雁胡桃', false], ['AG273', '浅川橡', false], ['AG336', '墨白橡', false], ['AG355', '木隐', false],
    ['AG365', '轻烟云', true], ['AG353A', '柔陶白', true], ['AG318', '云岫洞石', true],
    ['SS083M', '岩板 · Taj Mahal', true], ['SS061M', '岩板 · Light Grey Terrazzo', true], ['GZY004', '超白玻璃 · 20 隐框款', false],
  ];
  for (const [code, name, pending] of expect) {
    const m = mat(code);
    assert.ok(m, `缺少材料 ${code}`);
    assert.equal(m.name, name, code);
    assert.equal(m.pending, pending, `${code} pending`);
    assert.ok(m.imageKey, `${code} 没有色板图`);
  }
  assert.ok(a.materials.some((m) => m.name === '银波纹玻璃' && m.imageKey));
  assert.equal(new Set(a.materials.map((m) => m.key)).size, a.materials.length, '材料重复');
  // 色板图不能是效果图
  const renderKeys = new Set(a.views.map((v) => v.imageKey));
  for (const m of a.materials) assert.ok(!renderKeys.has(m.imageKey), `${m.code || m.name} 的图是效果图`);

  // 视角
  for (const v of a.views) {
    assert.ok(v.imageKey, `p${v.page} 没有效果图`);
    assert.ok(v.room, `p${v.page} 没有空间名`);
    const title = [v.room, v.subtitle].join(' ');
    assert.ok(!/(\S )\S \S /.test(title.replace(/ · /g, '·').replace(/[A-Za-z]+ [A-Za-z]+/g, '')), `p${v.page} 标题像是字距没还原：${title}`);
    assert.ok(!/\b[A-Za-z] [A-Za-z] [A-Za-z]\b/.test(title), `p${v.page} 标题字距：${title}`);
    assert.ok(v.renderAspect > 0.5 && v.renderAspect < 3);
  }
  assert.equal(new Set(a.views.map((v) => `${v.room}·${v.subtitle}`)).size, a.views.length, '有两页标题完全相同');

  // p4 鞋柜
  const p4 = view(4);
  assert.equal(p4.room, '鞋柜');
  assert.equal(p4.roomEn, 'SHOE CABINET');
  assert.equal(p4.floorKey, a.floors[0].key);
  assert.equal(matOf(p4, 'AG275')?.role, '柜体 & 柜门');

  // p5 鞋柜（室内）
  assert.equal(view(5).subtitle, '室内');

  // p9 客厅：隐形门标注
  const p9 = view(9);
  assert.equal(p9.room, '客厅');
  assert.equal(p9.roomEn, 'LIVING AREA');
  assert.ok(p9.notes.some((n) => n.text.includes('液压闭门器')));
  assert.equal(p9.notes[0].label, '隐形门 · Hidden door');
  assert.equal(p9.subtitle, '隐形门');
  assert.equal(matOf(p9, 'AG273')?.role, '柜体 & 柜门');
  assert.equal(matOf(p9, 'AG318')?.role, '开放柜');

  // p17 KTV：4 种材料，含玻璃门 GZY004
  const p17 = view(17);
  assert.equal(p17.room, 'KTV 娱乐室');
  assert.equal(p17.materials.length, 4);
  assert.equal(matOf(p17, 'GZY004')?.role, '玻璃门');
  assert.equal(matOf(p17, 'SS083M')?.role, '岩板');
  assert.equal(matOf(p17, 'AG336')?.role, '柜体 & 柜门');
  assert.equal(p17.inherited, false);

  // p26 饭厅：材料 + 页面备注「开门方式：免拉手」
  const p26 = view(26);
  assert.equal(p26.room, '饭厅');
  assert.ok(p26.notes.some((n) => n.label === '开门方式' && n.text === '免拉手'));
  assert.equal(matOf(p26, 'AG355')?.role, '柜体 & 柜门');
  assert.equal(matOf(p26, 'AG365')?.role, '开放柜');
  assert.equal(matOf(p26, 'SS083M')?.role, '岩板');

  // 二楼
  const p32 = view(32);
  assert.equal(p32.room, '主人房');
  assert.equal(p32.roomEn, 'MASTER BEDROOM');
  assert.equal(p32.floorKey, a.floors[1].key);
  assert.equal(p32.subtitle, 'U 形衣橱 · 化妆台 · 白天');
  assert.equal(view(33).subtitle, 'U 形衣橱 · 化妆台 · 夜晚');
  assert.equal(view(34).subtitle, 'U 形衣橱 · 化妆台 · 视角二 · 白天');
  assert.equal(view(40).room, '收纳柜体');
  assert.equal(view(40).subtitle, '卫生间隐形门');
  assert.equal(view(53).room, '客房 1');
  assert.equal(view(53).roomEn, 'GUEST ROOM 1');
  assert.equal(view(53).subtitle, '原女儿房');

  // 同一空间没有色板的视角沿用材料
  assert.equal(view(7).inherited, true);
  assert.deepEqual(view(7).materials, view(6).materials);
  assert.equal(view(12).inherited, true); // 卧室第一张没色板 → 取下一张的
  assert.ok(matOf(view(12), 'AG275'));

  // 内页插图（p51 细节小图）、logo 都不当材料
  assert.ok(!a.materials.some((m) => /二楼|过道/.test(m.name)));

  // 报告每页一行
  assert.equal(a.report.length, raw.pages.length);
  assert.match(a.report.find((l) => l.startsWith('p09')), /^p09 view 一楼 客厅 · 隐形门 \| mats: 柜体 & 柜门=AG273, 开放柜=AG318\(待确认\) \| notes: 隐形门 · Hidden door=液压闭门器，配反弹器/);
}

test('fixture：整份方案的结构与人工版一致', () => {
  const a = analyzePages(raw, { fileName: raw.fileName });
  checkSample(a);
});

test('fixture：没有文件名时从标题页 / PDF 日期补信息', () => {
  const a = analyzePages(raw, {});
  assert.equal(a.info.client, 'Mr Demo');
  assert.equal(a.info.location, 'Muar');
  assert.equal(a.info.date, '2026 · 08');
});

test('fixture：楼层章节页背景取该层第一张满幅横图', () => {
  const a = analyzePages(raw, { fileName: raw.fileName });
  const p7 = a.views.find((v) => v.page === 7);
  assert.equal(a.floors[0].imageKey, p7.imageKey);
  assert.ok(a.floors[1].imageKey);
});

test('没有楼层页的 PDF：floors 为空，视角的 floorKey 为 null', () => {
  const pages = raw.pages.filter((p) => p.n !== 3 && p.n !== 31);
  const a = analyzePages({ meta: raw.meta, pages }, { fileName: raw.fileName });
  assert.deepEqual(a.floors, []);
  assert.ok(a.views.length >= 50);
  assert.ok(a.views.every((v) => v.floorKey === null));
});

test('标题缺失的视角沿用上一页的空间', () => {
  const pages = raw.pages.map((p) => (p.n === 8 ? { ...p, lines: [] } : p));
  const a = analyzePages({ meta: raw.meta, pages }, { fileName: raw.fileName });
  const v8 = a.views.find((v) => v.page === 8);
  assert.equal(v8.room, '客厅');
  assert.match(v8.subtitle, /视角/);
});

test('空输入不崩溃', () => {
  const a = analyzePages({ meta: {}, pages: [] });
  assert.deepEqual(a.views, []);
  assert.deepEqual(a.floors, []);
  assert.deepEqual(a.materials, []);
});

// 真实 PDF（可选）：BLUEPRINT_PDF=/path/to/2026.8.6 Muar - Mr Lau - GF  L1.pdf
if (process.env.BLUEPRINT_PDF) {
  test('真实 PDF：extractPdf + analyzePages', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { extractPdf } = await import('../src/import/pdfExtract.js');
    const file = process.env.BLUEPRINT_PDF;
    const data = new Uint8Array(fs.readFileSync(file));
    const live = await extractPdf(pdfjs, data, { docOptions: { isOffscreenCanvasSupported: false } });
    assert.equal(live.pages.length, live.meta.numPages);
    const a = analyzePages(live, { fileName: process.env.BLUEPRINT_PDF_NAME || '2026.8.6 Muar - Mr Lau - GF  L1.pdf' });
    checkSample(a, { client: process.env.BLUEPRINT_CLIENT || 'Mr Lau' });
  });
}

// ---------------------------------------------------------------------------
// 其它设计师的 PDF（审查发现的问题回归）：合成的页面数据
// ---------------------------------------------------------------------------

const L = (text, x, y, fs = 12, w) => ({ text, x, y, w: w ?? text.length * fs * 0.8, h: fs, fs });
const I = (key, x, y, w, h, pxW = 1600, pxH = 1000) => ({ key, x, y, w, h, pxW, pxH });
const pageOf = (n, lines, images, W = 720, H = 540) => ({ n, width: W, height: H, lines, images });

test('每页都有的页脚（网址 / 品牌）：不当备注、不吞掉最后两页、不影响楼层页', () => {
  const footer = (n) => [L('www.saildz.com', 600, 520, 8), L(`P.${String(n).padStart(2, '0')}`, 20, 520, 8)];
  const withFooter = {
    ...raw,
    pages: raw.pages.map((p) => ({ ...p, lines: [...p.lines, ...footer(p.n)] })),
  };
  const a = analyzePages(withFooter, { fileName: '2026.8.6 Muar - Mr Demo - GF  L1.pdf' });
  checkSample(a);
  for (const v of a.views) assert.ok(!v.notes.some((n) => /saildz|P\./.test(n.text + n.label)), `p${v.page} 页脚变成了备注`);
});

test('最大的图是阴影位图（低清、比效果图大一圈）：取真正的效果图', () => {
  const pages = [1, 2, 3].map((n) =>
    pageOf(n, [L(['客厅 LIVING AREA', '饭厅 DINING', '厨房 KITCHEN'][n - 1], 20, 20, 20), L('柜体 & 柜门', 800, 240), L(`浅川橡 AG27${n}`, 800, 256)], [
      I('shadow', 1, 71, 784, 464, 650, 385),
      I(`render${n}`, 10, 80, 760, 440, 1600, 1000),
      I(`sw${n}`, 800, 100, 130, 130, 500, 500),
    ], 960, 540)
  );
  const a = analyzePages({ pages });
  assert.deepEqual(a.views.map((v) => v.imageKey), ['render1', 'render2', 'render3']);
  assert.equal(a.materials.length, 3);
});

test('贴着上边的整幅效果图（A4 竖版 / 横幅）不是装饰条；多页重复的风景条才是', () => {
  const portrait = [1, 2].map((n) =>
    pageOf(n, [L(['客厅 LIVING AREA', '主人房 MASTER BEDROOM'][n - 1], 30, 400, 22), L('柜体 & 柜门', 160, 476), L(`浅川橡 AG27${n}`, 160, 494)], [
      I(`r${n}`, 0, 0, 595, 379),
      I(`s${n}`, 30, 463, 120, 120, 500, 500),
    ], 595, 842)
  );
  const a = analyzePages({ pages: portrait });
  assert.deepEqual(a.views.map((v) => v.room), ['客厅', '主人房']);
  assert.deepEqual(a.pages.map((p) => p.kind), ['view', 'view']);
  // 真实样稿：标题页 / 楼层页底部的风景条（同一张图出现 3 次）仍被当成装饰
  const s = analyzePages(raw, { fileName: '2026.8.6 Muar - Mr Demo - GF  L1.pdf' });
  assert.equal(s.pages.find((p) => p.n === 3).kind, 'floor');
});

test('第一页：有空间标题 / 材料标签的效果图不是封面；整份只有一页也能导入；纯图片 PDF 不丢第一页', () => {
  const render = (n, title) => pageOf(n, title ? [L(title, 20, 20, 20)] : [], [I(`r${n}`, 0, 0, 720, 540)]);
  assert.equal(analyzePages({ pages: [render(1, '客厅 LIVING AREA'), render(2, '饭厅')] }).pages[0].kind, 'view');
  assert.equal(analyzePages({ pages: [render(1, '客厅 LIVING AREA')] }).views.length, 1);
  assert.equal(analyzePages({ pages: [render(1), render(2), render(3)] }).views.length, 3);
  // 真正的封面（满版图、没有文字）仍是封面
  assert.equal(analyzePages({ pages: [render(1), render(2, '客厅'), render(3, '饭厅')] }).pages[0].kind, 'cover');
});

test('标题：底部标题、中文大标题下的小字英文、只有英文的空间名、标题里的楼层前缀', () => {
  const pg = (n, lines) => pageOf(n, lines, [I(`r${n}`, 5, 60, 576, 389)]);
  const a = analyzePages({
    pages: [
      pg(1, [L('客厅', 20, 20, 24), L('LIVING AREA', 20, 50, 11)]),
      pg(2, [L('Powder Room', 20, 20, 20)]),
      pg(3, [L('二楼 主人房', 20, 20, 20)]),
      pg(4, [L('厨房 KITCHEN', 20, 470, 20)]),
    ],
  });
  assert.deepEqual(a.views.map((v) => [v.room, v.roomEn]), [['客厅', 'LIVING AREA'], ['化妆间', 'POWDER ROOM'], ['主人房', 'MASTER BEDROOM'], ['厨房', 'KITCHEN']]);
  assert.deepEqual(a.floors.map((f) => f.zh), ['二楼']);
  assert.equal(a.views[2].floorKey, a.floors[0].key);
});

test('楼层章节页同时列了本层空间：仍认得出', () => {
  const a = analyzePages({
    pages: [
      pageOf(1, [L('FIRST FLOOR 二楼设计图', 200, 200, 28), L('主人房 · 中厅 · 客房 1 · 客房 2', 200, 260, 14)], []),
      pageOf(2, [L('主人房 MASTER BEDROOM', 20, 20, 20)], [I('r2', 5, 60, 576, 389)]),
    ],
  });
  assert.equal(a.pages[0].kind, 'floor');
  assert.equal(a.views[0].floorKey, a.floors[0].key);
});
