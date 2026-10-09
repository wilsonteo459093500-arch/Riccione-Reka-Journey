// Material Board 纯函数测试：排版、本案材料导入、prompt 拼装、标题块 / 图例几何
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import {
  boardHeight, gridLayout, collageLayout, nextSlot, clampMove, clampWidth, normalizeDeg, rotationFromDrag,
  legendEntries, materialLabel, materialsToImport, mergeImported, defaultTitles, newBoardSettings,
  buildFlatlayPrompt, titleBlockMetrics, legendLayout, badgeOf, exportSize, orientationOf, flatlayAspect,
  safeFileName, isLightColor,
} from '../src/moodboard/layout.js';
import { DEFAULT_BOARD, RATIOS, BG_TONE, FLATLAY_ASPECT, TITLE_FONTS } from '../src/moodboard/constants.js';

const mk = (n, aspect = 1.4) => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, aspect, w: 20, x: 0, y: 0, rot: 3, label: '' }));
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('默认画板：竖版 3:4，实拍比例 3:4（方案封面图区 810×1080）', () => {
  assert.equal(DEFAULT_BOARD.ratioId, 'p34');
  assert.equal(flatlayAspect(DEFAULT_BOARD.ratioId), '3:4');
  assert.equal(flatlayAspect('a4p'), '3:4');
  assert.equal(flatlayAspect('16:9'), '16:9');
  assert.ok(near(boardHeight('p34'), 100 / 0.75));
  assert.equal(orientationOf('p34'), 'portrait');
  assert.equal(orientationOf('16:9'), 'landscape');
  assert.equal(orientationOf('1:1'), 'square');
  for (const r of RATIOS) assert.ok(FLATLAY_ASPECT[r.id], `缺少 ${r.id} 的出图比例`);
  assert.equal(TITLE_FONTS.some((f) => /Fraunces|DM Sans/.test(f.css)), false, '字体应换成 Blueprint 字体');
});

test('exportSize：按长边出图', () => {
  assert.deepEqual(exportSize('p34', 2400), { W: 1800, H: 2400 });
  assert.deepEqual(exportSize('16:9', 2400), { W: 2400, H: 1350 });
  assert.deepEqual(exportSize('1:1', 2400), { W: 2400, H: 2400 });
});

test('gridLayout：所有素材在画板内、标题区留空、摆正', () => {
  for (const ratioId of RATIOS.map((r) => r.id)) {
    const bh = boardHeight(ratioId);
    for (const n of [1, 2, 5, 9, 12, 17, 24]) {
      for (const aspect of [0.6, 1, 1.5, 3]) {
        const out = gridLayout(mk(n, aspect), bh, { titlePos: 'bl' });
        assert.equal(out.length, n);
        for (const it of out) {
          const h = it.w / it.aspect;
          assert.equal(it.rot, 0);
          assert.ok(it.x >= 0 && it.x + it.w <= 100 + 1e-9, `${ratioId} n=${n} x 越界`);
          assert.ok(it.y >= 0 && it.y + h <= bh - 16 + 1e-9, `${ratioId} n=${n} a=${aspect} 压到底部标题区`);
        }
      }
    }
  }
  // 标题在上 → 顶部留空
  const top = gridLayout(mk(6), boardHeight('p34'), { titlePos: 'tr' });
  assert.ok(top.every((it) => it.y >= 16));
  assert.deepEqual(gridLayout([], 100), []);
});

test('collageLayout：确定性 + 水平不出界 + 第一张最大且不旋转', () => {
  const bh = boardHeight('p34');
  const a = collageLayout(mk(8), bh);
  const b = collageLayout(mk(8), bh);
  assert.deepEqual(a, b);
  assert.equal(a[0].rot, 0);
  assert.ok(a.every((it) => it.x >= 2 && it.x + it.w <= 96 + 1e-9));
  assert.ok(a.every((it) => it.y >= 2 && it.y + it.w / it.aspect <= bh - 18 + 1e-9));
  assert.ok(a.slice(1).every((it) => it.w < a[0].w));
});

test('拖动 / 缩放 / 旋转的边界', () => {
  const orig = { x: 10, y: 10, w: 20 };
  assert.deepEqual(clampMove(orig, 200, 200, 133), { x: 90, y: 129 });
  assert.deepEqual(clampMove(orig, -200, -200, 133), { x: -10, y: -2 });
  assert.equal(clampWidth(1), 4);
  assert.equal(clampWidth(200), 96);
  assert.equal(normalizeDeg(270), -90);
  assert.equal(normalizeDeg(-190), 170);
  assert.equal(normalizeDeg(180), 180);
  // 从正右方拖到正下方 = 顺时针 90°
  assert.equal(rotationFromDrag({ cx: 0, cy: 0, x0: 10, y0: 0, x1: 0, y1: 10, origRot: 0 }), 90);
  // 3° 以内吸附回 0
  assert.equal(rotationFromDrag({ cx: 0, cy: 0, x0: 10, y0: 0, x1: 10, y1: 0.5, origRot: 0 }), 0);
  assert.notEqual(rotationFromDrag({ cx: 0, cy: 0, x0: 10, y0: 0, x1: 10, y1: 0.5, origRot: 0, snap: 0 }), 0);
  const s = nextSlot(3);
  assert.ok(s.x >= 6 && s.x < 61 && s.y >= 6 && s.y < 46);
});

test('本案材料导入：只取有图的、跳过已在画板上的', () => {
  const materials = [
    { id: 'm1', name: '浅川橡', code: 'AG273', image: 'asset:a' },
    { id: 'm2', name: '归雁胡桃', code: 'AG275', image: 'asset:b' },
    { id: 'm3', name: '超白玻璃', code: '', image: null },
    { id: 'm4', name: '云峰洞石', code: 'AG318', image: 'asset:c' },
    { id: 'm1', name: '浅川橡', code: 'AG273', image: 'asset:a' },
  ];
  assert.equal(materialLabel(materials[0]), '浅川橡 AG273');
  assert.equal(materialLabel({ name: ' 超白玻璃 ', code: '' }), '超白玻璃');
  assert.deepEqual(materialsToImport(materials, []).map((m) => m.id), ['m1', 'm2', 'm4']);
  const items = [
    { id: 'x', materialId: 'm1', label: '浅川橡 AG273' },
    { id: 'y', label: '云峰洞石 AG318' }, // 旧画板没有 materialId，按标签去重
  ];
  assert.deepEqual(materialsToImport(materials, items).map((m) => m.id), ['m2']);
  assert.deepEqual(materialsToImport(undefined, []), []);
});

test('mergeImported：空画板排网格；已有素材则追加；异步期间重复的不再加', () => {
  const bh = boardHeight('p34');
  const incoming = [
    { id: 'a', materialId: 'm1', aspect: 1.4, w: 18, x: 0, y: 0, rot: 0, label: 'A' },
    { id: 'b', materialId: 'm2', aspect: 1.4, w: 18, x: 0, y: 0, rot: 0, label: 'B' },
  ];
  const fromEmpty = mergeImported([], incoming, bh);
  assert.equal(fromEmpty.length, 2);
  assert.deepEqual(fromEmpty, gridLayout(incoming, bh));
  const prev = [{ id: 'p', materialId: 'm1', aspect: 1, w: 30, x: 5, y: 5, rot: 0, label: 'A' }];
  const merged = mergeImported(prev, incoming, bh);
  assert.deepEqual(merged.map((it) => it.id), ['p', 'b']);
  assert.equal(merged[0], prev[0]);
  assert.equal(mergeImported(prev, [incoming[0]], bh), prev);
});

test('默认标题：封面标题优先，其次「客户 · 地点」', () => {
  assert.deepEqual(defaultTitles({ client: 'Miss Chua', location: 'The Mines' }), {
    title: 'Miss Chua · The Mines',
    subtitle: 'THE DREAM HOUSE JOURNEY',
  });
  assert.deepEqual(defaultTitles({ client: 'Mr Lau', location: 'Muar', coverTitle: ' 劉府 ', coverSubtitle: 'The Bakery Dream House Journey' }), {
    title: '劉府',
    subtitle: 'The Bakery Dream House Journey',
  });
  assert.deepEqual(defaultTitles({}), { title: '', subtitle: 'THE DREAM HOUSE JOURNEY' });
  const b = newBoardSettings({ client: 'Mr Lau' }, { ratioId: '16:9', bgId: 'white', title: 'ignored' });
  assert.equal(b.ratioId, '16:9');
  assert.equal(b.bgId, 'white');
  assert.equal(b.title, 'Mr Lau');
  assert.equal(b.titleFont, DEFAULT_BOARD.titleFont);
});

test('实拍排版 prompt：底色 / 画幅 / 留白 / 标签 / 客户故事 / 排版偏好', () => {
  const p = buildFlatlayPrompt({
    bgId: 'paper',
    ratioId: 'p34',
    labels: ['浅川橡 AG273', '', '云峰洞石 AG318'],
    notes: '石材保留完整大板',
    story: '客户是面包店老板：加一片烤酸种面包和香蕉叶',
  });
  assert.ok(p.includes(BG_TONE.paper));
  assert.ok(p.includes('portrait 3:4'));
  assert.ok(p.includes('lower-left'));
  assert.ok(!p.includes('{SPACE}'));
  assert.ok(p.includes('Sample 1: 浅川橡 AG273'));
  assert.ok(!p.includes('Sample 2:'), '无名称的素材不写标签');
  assert.ok(p.includes('Sample 3: 云峰洞石 AG318'));
  assert.ok(p.includes('烤酸种面包和香蕉叶'));
  assert.ok(p.includes('FOLLOW THESE STRICTLY') && p.includes('石材保留完整大板'));
  assert.ok(/NO text/.test(p));
  assert.ok(/thickness/.test(p) && /shadow/.test(p) && /colour/.test(p));

  const q = buildFlatlayPrompt({ bgId: 'dark', ratioId: '16:9', titlePos: 'tr' });
  assert.ok(q.includes(BG_TONE.dark));
  assert.ok(q.includes('16:9'));
  assert.ok(q.includes('upper-right'));
  assert.ok(q.includes('olive branch'), '没写客户故事时用默认小道具');
  assert.ok(!q.includes('Client story'));
  assert.ok(!q.includes('Sample identities'));
  assert.ok(!q.includes('FOLLOW THESE STRICTLY'));
});

test('标题块几何：左下 / 右上 / 居中', () => {
  const W = 1800;
  const H = 2400;
  const base = { ...DEFAULT_BOARD, title: 'Miss Chua · The Mines', subtitle: 'the dream house journey' };
  assert.equal(titleBlockMetrics(W, H, { ...base, title: '', subtitle: ' ' }, '#000'), null);

  const bl = titleBlockMetrics(W, H, base, '#241C12');
  const m = W * 0.045;
  assert.equal(bl.align, 'left');
  assert.equal(bl.x, m);
  assert.equal(bl.ruleX, m);
  assert.ok(near(bl.top + bl.blockH, H - m));
  assert.ok(bl.subY > bl.titleY && bl.subY <= H - m + 1e-6);
  assert.equal(bl.subtitle, 'THE DREAM HOUSE JOURNEY');
  assert.equal(bl.color, '#241C12');

  const tr = titleBlockMetrics(W, H, { ...base, titlePos: 'tr', titleColor: '#B8995A' }, '#241C12');
  assert.equal(tr.align, 'right');
  assert.equal(tr.x, W - m);
  assert.ok(near(tr.ruleX + tr.ruleW, W - m));
  assert.equal(tr.top, m);
  assert.equal(tr.color, '#B8995A');

  const c = titleBlockMetrics(W, H, { ...base, titlePos: 'c', titleScale: 1.5 }, '#fff');
  assert.equal(c.align, 'center');
  assert.ok(near(c.top + c.blockH / 2, H / 2));
  assert.ok(near(c.titleFs, bl.titleFs * 1.5));

  // 只有副标题
  const sub = titleBlockMetrics(W, H, { ...base, title: '' }, '#000');
  assert.equal(sub.titleY, null);
  assert.ok(sub.subY > sub.top);
});

test('图例清单卡：在画板内、行数多时自动缩字、编号连续', () => {
  const items = [
    { id: 'a', label: '浅川橡 AG273', x: 10, y: 10 },
    { id: 'b', label: '' },
    { id: 'c', label: ' 云峰洞石 AG318 ', x: 40, y: 50 },
  ];
  const rows = legendEntries(items);
  assert.deepEqual(rows.map((r) => [r.id, r.no, r.label]), [['a', 1, '浅川橡 AG273'], ['c', 2, '云峰洞石 AG318']]);

  const measure = (t, fs) => t.length * fs * 0.6;
  const W = 2400;
  const H = 1350;
  const L = legendLayout(W, H, rows, measure);
  assert.ok(L.bx > 0 && L.bx + L.boxW <= W);
  assert.ok(L.by + L.boxH <= H);
  assert.equal(L.rows.length, 2);
  assert.ok(L.rows[1].cy > L.rows[0].cy);

  const many = Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, no: i + 1, label: `材料 ${i + 1} AG${300 + i}` }));
  const L2 = legendLayout(W, H, many, measure);
  assert.ok(L2.fs < W * 0.014, '30 行应缩小字号');
  assert.ok(L2.by + L2.boxH <= H * 0.95);
  assert.ok(L2.boxW <= W * 0.34 + 1e-9);
  assert.equal(legendLayout(W, H, [], measure), null);

  const b = badgeOf({ x: 10, y: 20 }, 1000);
  assert.ok(near(b.r, 11) && b.cx > 100 && b.cy > 200);
});

test('文件名与颜色工具', () => {
  assert.equal(safeFileName('Miss Chua · The Mines'), 'Miss-Chua-The-Mines');
  assert.equal(safeFileName('劉府 · 客厅'), '劉府-客厅');
  assert.equal(safeFileName('a/b:c*?'), 'a-b-c');
  assert.equal(safeFileName(''), 'riccione');
  assert.equal(isLightColor('#F2ECE0'), true);
  assert.equal(isLightColor('#241C12'), false);
  assert.equal(isLightColor('#FFFFFF'), true);
  assert.equal(isLightColor('bad'), true);
});

// ---------------- 独立画板 / 旧版 UKIR STUDIO 搬家 ----------------
import { convertBoard, convertLibraryItem } from '../src/moodboard/migrate.js';
import { STANDALONE_ID, STANDALONE_RATIO_ID, DEFAULT_BOARD as DB2 } from '../src/moodboard/constants.js';

test('独立画板：标题留空（与旧版 UKIR 一致），画幅 A4 横；提案画板仍取项目信息', () => {
  const s = newBoardSettings(null, { ratioId: STANDALONE_RATIO_ID });
  assert.equal(s.ratioId, 'a4l');
  assert.equal(s.title, '');
  assert.equal(s.subtitle, '');
  const p = newBoardSettings({ client: 'Mr Lau', location: 'Muar' });
  assert.equal(p.title, 'Mr Lau · Muar');
  assert.equal(p.subtitle, 'THE DREAM HOUSE JOURNEY');
  assert.deepEqual(defaultTitles(null), { title: '', subtitle: 'THE DREAM HOUSE JOURNEY' });
});

test('convertBoard：旧画板 → 独立画板（设置补齐、去掉 busy、丢掉没有图的素材）', () => {
  const old = {
    id: 'b-old1',
    name: '客厅板',
    board: { ratioId: 'a4l', bgId: 'green', title: 'MISS CHUA', subtitle: 'THE MINES', titleFont: 'serif', titleScale: 1.2, titlePos: 'tr', titleColor: '' },
    items: [
      { id: 'i1', dataUrl: 'data:image/png;base64,AAA', aspect: 1.5, w: 20, x: 10, y: 12, rot: 3, label: '浅川橡 AG273', busy: true },
      { id: 'i2', dataUrl: '', aspect: 1, w: 10, x: 0, y: 0 },
      { id: 'i3', dataUrl: 'data:image/jpeg;base64,BBB', aspect: 0.8, w: 18, x: 40, y: 30 },
    ],
    ts: 1700000000000,
  };
  const rec = convertBoard(old, 42);
  assert.equal(rec.id, 'b-old1');
  assert.equal(rec.projectId, STANDALONE_ID);
  assert.equal(rec.name, '客厅板');
  assert.equal(rec.createdAt, 1700000000000);
  assert.equal(rec.board.bgId, 'green');
  assert.equal(rec.board.titlePos, 'tr');
  assert.equal(rec.board.titleScale, 1.2);
  assert.equal(rec.board.showLegend, DB2.showLegend, '新字段用默认值补齐');
  assert.deepEqual(rec.items.map((it) => it.id), ['i1', 'i3']);
  assert.equal('busy' in rec.items[0], false);
  assert.equal(rec.items[1].rot, 0);
  assert.equal(rec.items[1].label, '');
  // 旧版的画幅 / 底色 / 字体 / 位置 id 在新版里都认得
  for (const key of ['ratioId', 'bgId', 'titleFont', 'titlePos']) assert.ok(rec.board[key]);
});

test('convertLibraryItem：结构相同，补齐缺省；坏条目丢掉', () => {
  assert.deepEqual(convertLibraryItem({ id: 'l1', dataUrl: 'data:x', name: '木隐', cat: 'wood', ts: 5 }, 9), { id: 'l1', dataUrl: 'data:x', name: '木隐', cat: 'wood', ts: 5 });
  assert.deepEqual(convertLibraryItem({ id: 'l2', dataUrl: 'data:y' }, 9), { name: '', cat: 'other', ts: 9, id: 'l2', dataUrl: 'data:y' });
  assert.equal(convertLibraryItem({ id: 'l3' }), null);
  assert.equal(convertLibraryItem(null), null);
});
