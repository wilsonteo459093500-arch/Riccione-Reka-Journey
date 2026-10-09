// 壳层纯函数测试：撤销历史合并、文件名、备份清单、素材引用改写、材料合并 / 删除 / 排序、章节开关
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import {
  emptyHistory, recordChange, undoStep, redoStep, changeSignature, isTypingEdit, HISTORY_LIMIT,
} from '../src/lib/history.js';
import { sanitizeFileName, pptxFileName, bundleFileName, compactDate, formatBytes, timeAgo } from '../src/lib/format.js';
import {
  buildBundleManifest, parseBundleManifest, remapAssetSrcs, restoreProject, extForMime, BUNDLE_FORMAT,
} from '../src/lib/bundle.js';
import { materialUsage, mergeMaterials, deleteMaterials, moveMaterial, addMaterial, updateMaterial } from '../src/lib/materials.js';
import {
  projectThumbSrc, projectStats, copyName, sectionState, setSectionEnabled, kindState, setKindEnabled,
  ensureMaterialsSlide, ensureDesignCoverSlide, designCoverSlideId, coverLayoutFor,
} from '../src/lib/project.js';
import { newProject, assembleDeck } from '../src/engine/model.js';

// ---------------------------------------------------------------------------
// 测试项目
// ---------------------------------------------------------------------------

function sample() {
  const views = [
    {
      id: 'v1', kind: 'view', enabled: true, floorId: 'f1', layout: 'full', image: 'asset:img1', room: '客厅', roomEn: 'LIVING', subtitle: '全景',
      materials: [{ role: '柜体 & 柜门', materialId: 'm1' }, { role: '台面', materialId: 'm2' }], notes: [],
    },
    {
      id: 'v2', kind: 'view', enabled: true, floorId: 'f1', layout: 'framed', image: 'asset:img2', room: '厨房', roomEn: 'KITCHEN', subtitle: '',
      materials: [{ role: '柜体 & 柜门', materialId: 'm3' }, { role: '柜体 & 柜门', materialId: 'm1' }], notes: [],
    },
    { id: 'v3', kind: 'view', enabled: false, floorId: 'f1', layout: 'full', image: 'asset:img3', room: '卧室', materials: [{ role: '柜体', materialId: 'm2' }], notes: [] },
  ];
  const p = newProject({
    id: 'p-1',
    name: 'Muar · Mr Lau',
    info: { client: 'Mr Lau', location: 'Muar', date: '2026 · 08' },
    floors: [{ id: 'f1', zh: '一楼', en: 'GROUND FLOOR', image: null, plan: 'asset:plan1' }],
    materials: [
      { id: 'm1', name: '浅川橡', code: 'AG273', image: 'asset:sw1', pending: false },
      { id: 'm2', name: '云峰洞石', code: 'AG318', image: null, pending: true },
      { id: 'm3', name: '', code: 'AG273', image: 'asset:sw3', pending: false },
    ],
    pages: [{ n: 1, kind: 'cover', title: '', thumb: 'asset:t1' }],
  });
  p.slides = assembleDeck([{ id: 'fl1', kind: 'floor', floorId: 'f1', enabled: true }, ...views]);
  return p;
}

// ---------------------------------------------------------------------------
// 撤销历史
// ---------------------------------------------------------------------------

test('isTypingEdit：连续插入 / 删除算打字，整段替换、换图不算', () => {
  assert.equal(isTypingEdit('abc', 'abcd'), true);
  assert.equal(isTypingEdit('abcd', 'abd'), true);
  assert.equal(isTypingEdit('', '浅川橡'), true);
  assert.equal(isTypingEdit('浅川', '浅川橡'), true);
  assert.equal(isTypingEdit('客厅全景', '客厅 · 全景'), true);
  assert.equal(isTypingEdit('framed', 'full'), false);
  assert.equal(isTypingEdit('split-light', 'split-dark'), false);
  assert.equal(isTypingEdit('asset:a', 'asset:ab'), false);
  assert.equal(isTypingEdit('abc', 3), false);
});

test('changeSignature：同一字段打字 → 签名相同；开关 / 结构改动 → null', () => {
  const p = sample();
  const a = { ...p, info: { ...p.info, client: 'Mr La' } };
  const b = { ...a, info: { ...a.info, client: 'Mr Lau' } };
  const s1 = changeSignature(p, a);
  const s2 = changeSignature(a, b);
  assert.ok(s1);
  assert.equal(s1, s2);
  assert.equal(s1, '.info.client');
  // 另一个字段 → 签名不同
  const c = { ...b, info: { ...b.info, location: 'Muar2' } };
  assert.notEqual(changeSignature(b, c), s1);
  // 页面里的文字：路径带上页 id
  const slides = p.slides.map((s) => (s.id === 'v1' ? { ...s, subtitle: '全景图' } : s));
  assert.equal(changeSignature(p, { ...p, slides }), '.slides[v1].subtitle');
  // 布尔开关
  const off = { ...p, slides: p.slides.map((s) => (s.id === 'v1' ? { ...s, enabled: false } : s)) };
  assert.equal(changeSignature(p, off), null);
  // 增删 / 排序
  assert.equal(changeSignature(p, { ...p, slides: p.slides.slice(1) }), null);
  assert.equal(changeSignature(p, { ...p, slides: [...p.slides].reverse() }), null);
  // 换图（asset 引用）
  assert.equal(changeSignature(p, { ...p, cover: { ...p.cover, image: 'asset:new' } }), null);
  // 第一次填一个原本不存在的字段
  assert.equal(changeSignature(p, { ...p, info: { ...p.info, newField: 'x' } }), '.info.newField');
  // 没变化
  assert.equal(changeSignature(p, p), null);
});

test('recordChange：同签名且间隔短 → 合并成一步；超时 / 不同签名 → 新的一步', () => {
  let h = emptyHistory();
  h = recordChange(h, 'S0', { sig: '.info.client', now: 1000 });
  h = recordChange(h, 'S1', { sig: '.info.client', now: 1500 });
  h = recordChange(h, 'S2', { sig: '.info.client', now: 2400 });
  assert.deepEqual(h.past, ['S0'], '连续输入只记最早的快照');
  h = recordChange(h, 'S3', { sig: '.info.client', now: 5000 });
  assert.deepEqual(h.past, ['S0', 'S3'], '停顿后另起一步');
  h = recordChange(h, 'S4', { sig: '.info.location', now: 5100 });
  assert.deepEqual(h.past, ['S0', 'S3', 'S4']);
  h = recordChange(h, 'S5', { sig: null, now: 5200 });
  h = recordChange(h, 'S6', { sig: null, now: 5300 });
  assert.deepEqual(h.past, ['S0', 'S3', 'S4', 'S5', 'S6'], '无签名的改动从不合并');
});

test('undo / redo：往返一致；撤销后再改会清空 redo，且不会与撤销前的输入合并', () => {
  let h = emptyHistory();
  h = recordChange(h, 'A', { sig: 'x', now: 0 });
  let cur = 'B';
  h = recordChange(h, 'B', { sig: null, now: 10 });
  cur = 'C';
  let r = undoStep(h, cur);
  assert.equal(r.project, 'B');
  h = r.hist;
  cur = r.project;
  r = undoStep(h, cur);
  assert.equal(r.project, 'A');
  h = r.hist;
  cur = r.project;
  assert.equal(undoStep(h, cur), null);
  r = redoStep(h, cur);
  assert.equal(r.project, 'B');
  h = r.hist;
  cur = r.project;
  assert.equal(h.future.length, 1);
  h = recordChange(h, cur, { sig: 'x', now: 20 });
  assert.equal(h.future.length, 0, '新改动清空 redo');
  assert.deepEqual(h.past, ['A', 'B']);
  assert.equal(redoStep(h, 'D'), null);
});

test('recordChange：历史最多保留 60 步', () => {
  let h = emptyHistory();
  for (let i = 0; i < 100; i++) h = recordChange(h, i, { sig: null, now: i });
  assert.equal(h.past.length, HISTORY_LIMIT);
  assert.equal(HISTORY_LIMIT, 60);
  assert.equal(h.past[0], 40);
  assert.equal(h.past[59], 99);
});

// ---------------------------------------------------------------------------
// 文件名 / 显示
// ---------------------------------------------------------------------------

test('sanitizeFileName：去掉非法字符、压缩空白、去首尾点和空格', () => {
  assert.equal(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j'), 'a b c d e f g h i j');
  assert.equal(sanitizeFileName('  ..Mr  Lau.. '), 'Mr Lau');
  assert.equal(sanitizeFileName('\u0001\u0002'), 'Dreamhouse Blueprint');
  assert.equal(sanitizeFileName('', 'x'), 'x');
  assert.equal(sanitizeFileName('客厅 · 全景'), '客厅 · 全景');
  assert.ok(sanitizeFileName('长'.repeat(400)).length <= 150);
});

test('compactDate', () => {
  assert.equal(compactDate('2026 · 08'), '2026.08');
  assert.equal(compactDate('2026.8.6'), '2026.08.06');
  assert.equal(compactDate(''), '');
  assert.equal(compactDate('八月'), '');
});

test('pptxFileName：<日期> <地点> - <客户> - Dreamhouse Blueprint.pptx，缺信息退回项目名', () => {
  const p = sample();
  assert.equal(pptxFileName(p), '2026.08 Muar - Mr Lau - Dreamhouse Blueprint.pptx');
  assert.equal(pptxFileName({ ...p, info: { ...p.info, date: '' } }), 'Muar - Mr Lau - Dreamhouse Blueprint.pptx');
  assert.equal(pptxFileName({ ...p, info: { ...p.info, client: '' } }), '2026.08 Muar - Dreamhouse Blueprint.pptx');
  assert.equal(pptxFileName({ name: 'A/B 方案', info: {} }), 'A B 方案 - Dreamhouse Blueprint.pptx');
  assert.equal(pptxFileName({ name: '', info: {} }), 'Dreamhouse Blueprint.pptx');
  assert.equal(pptxFileName({ name: 'x', info: { client: 'Mr: Lau?', location: '' } }), 'Mr Lau - Dreamhouse Blueprint.pptx');
});

test('bundleFileName / formatBytes / timeAgo', () => {
  assert.equal(bundleFileName(sample()), 'Muar · Mr Lau.blueprint.zip');
  assert.equal(bundleFileName({ name: '', info: { client: 'Mr Lau', location: 'Muar' } }), 'Muar · Mr Lau.blueprint.zip');
  assert.equal(formatBytes(500), '500 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(12.34 * 1024 * 1024), '12.3 MB');
  const now = Date.UTC(2026, 9, 9, 12);
  assert.equal(timeAgo(now - 10 * 1000, now), '刚刚');
  assert.equal(timeAgo(now - 5 * 60 * 1000, now), '5 分钟前');
  assert.equal(timeAgo(now - 3 * 3600 * 1000, now), '3 小时前');
  assert.equal(timeAgo(now - 30 * 3600 * 1000, now), '昨天');
  assert.match(timeAgo(now - 30 * 86400 * 1000, now), /^2026-09-\d\d$/);
});

// ---------------------------------------------------------------------------
// 项目备份
// ---------------------------------------------------------------------------

test('remapAssetSrcs：深层改写 asset 引用，不改原对象，未映射的保留', () => {
  const p = sample();
  const before = JSON.stringify(p);
  const map = new Map([['asset:img1', 'asset:N1'], ['asset:sw1', 'asset:N2'], ['asset:plan1', 'asset:N3'], ['asset:t1', 'asset:N4']]);
  const out = remapAssetSrcs(p, map);
  assert.equal(JSON.stringify(p), before, '原项目不变');
  assert.equal(out.slides.find((s) => s.id === 'v1').image, 'asset:N1');
  assert.equal(out.slides.find((s) => s.id === 'v2').image, 'asset:img2', '未映射的保留');
  assert.equal(out.materials[0].image, 'asset:N2');
  assert.equal(out.floors[0].plan, 'asset:N3');
  assert.equal(out.pages[0].thumb, 'asset:N4');
  assert.equal(out.info.client, 'Mr Lau');
  assert.equal(out.cover.image, null);
  // 普通对象做映射表也可以；静态模板图不动
  const o = remapAssetSrcs({ a: ['asset:x', '/template/cover-1.jpg'] }, { 'asset:x': 'asset:y' });
  assert.deepEqual(o, { a: ['asset:y', '/template/cover-1.jpg'] });
});

test('buildBundleManifest：每个引用一个文件，扩展名按 mime，缺失的单独列出', () => {
  const p = sample();
  const recs = [
    { id: 'img1', mime: 'image/jpeg', w: 2560, h: 1440 },
    { id: 'img2', mime: 'image/png', w: 100, h: 100 },
    { id: 'img3', mime: 'image/webp', w: 10, h: 10 },
    { id: 'sw1', mime: 'image/jpeg', w: 300, h: 300 },
    { id: 'sw3', mime: '', w: 300, h: 300 },
    { id: 'plan1', mime: 'image/jpeg', w: 2000, h: 1400 },
  ];
  const { manifest, files, missing } = buildBundleManifest(p, recs, { now: Date.UTC(2026, 7, 6) });
  assert.equal(manifest.format, BUNDLE_FORMAT);
  assert.equal(manifest.version, 1);
  assert.equal(manifest.exportedAt, '2026-08-06T00:00:00.000Z');
  assert.equal(manifest.project, p);
  assert.deepEqual(missing, ['asset:t1']);
  assert.equal(files.length, 6);
  const byId = Object.fromEntries(manifest.assets.map((a) => [a.id, a]));
  assert.equal(byId.img1.file, 'assets/img1.jpg');
  assert.equal(byId.img2.file, 'assets/img2.png');
  assert.equal(byId.img3.file, 'assets/img3.webp');
  assert.equal(byId.sw3.file, 'assets/sw3.bin');
  assert.equal(byId.sw3.mime, 'image/jpeg');
  assert.deepEqual([byId.img1.w, byId.img1.h], [2560, 1440]);
  assert.deepEqual(files.map((f) => f.path).sort(), manifest.assets.map((a) => a.file).sort());
  assert.equal(extForMime('IMAGE/JPEG'), 'jpg');
});

test('parseBundleManifest + restoreProject：校验格式，新项目 id、新素材引用', () => {
  const p = sample();
  const { manifest } = buildBundleManifest(p, [{ id: 'img1', mime: 'image/jpeg' }]);
  const parsed = parseBundleManifest(JSON.stringify(manifest));
  assert.equal(parsed.project.id, 'p-1');
  assert.equal(parsed.assets.length, 1);
  assert.throws(() => parseBundleManifest('{nope'), /JSON/);
  assert.throws(() => parseBundleManifest(JSON.stringify({ format: 'other', project: {} })), /不是/);
  assert.throws(() => parseBundleManifest(JSON.stringify({ ...manifest, version: 99 })), /更新版本/);
  assert.throws(() => parseBundleManifest(JSON.stringify({ ...manifest, project: { ...p, slides: null } })), /不完整/);
  const restored = restoreProject(parsed.project, new Map([['asset:img1', 'asset:NEW']]), { id: 'p-new', now: 42 });
  assert.equal(restored.id, 'p-new');
  assert.equal(restored.updatedAt, 42);
  assert.equal(restored.createdAt, p.createdAt);
  assert.equal(restored.slides.find((s) => s.id === 'v1').image, 'asset:NEW');
  assert.equal(restored.name, p.name);
});

// ---------------------------------------------------------------------------
// 材料清单
// ---------------------------------------------------------------------------

test('materialUsage：按页统计（同页重复引用只算一次），含隐藏页', () => {
  const u = materialUsage(sample());
  assert.deepEqual(u.get('m1').map((s) => s.id), ['v1', 'v2']);
  assert.deepEqual(u.get('m2').map((s) => s.id), ['v1', 'v3']);
  assert.deepEqual(u.get('m3').map((s) => s.id), ['v2']);
});

test('mergeMaterials：并入清单里最前面的一种，改写引用并去重，待确认取并集，缺图补图', () => {
  const p = sample();
  const out = mergeMaterials(p, ['m3', 'm1']);
  assert.deepEqual(out.materials.map((m) => m.id), ['m1', 'm2']);
  const v2 = out.slides.find((s) => s.id === 'v2');
  assert.deepEqual(v2.materials, [{ role: '柜体 & 柜门', materialId: 'm1' }], '同角色同材料去重');
  // m2（待确认、无图）并入 m1 → m1 待确认，图保留 m1 的
  const out2 = mergeMaterials(p, ['m1', 'm2']);
  const m1 = out2.materials.find((m) => m.id === 'm1');
  assert.equal(m1.pending, true);
  assert.equal(m1.image, 'asset:sw1');
  assert.deepEqual(out2.slides.find((s) => s.id === 'v3').materials, [{ role: '柜体', materialId: 'm1' }]);
  assert.deepEqual(out2.slides.find((s) => s.id === 'v1').materials.map((r) => r.materialId), ['m1', 'm1']);
  // m2 无图并入 → 保留项缺图时取其余的
  const out3 = mergeMaterials({ ...p, materials: [p.materials[1], p.materials[2]] }, ['m2', 'm3']);
  assert.equal(out3.materials[0].image, 'asset:sw3');
  assert.equal(out3.materials[0].name, '云峰洞石');
  // 不足两种不变
  assert.equal(mergeMaterials(p, ['m1']), p);
  assert.equal(p.materials.length, 3, '原项目不变');
});

test('deleteMaterials：删材料并去掉所有引用', () => {
  const p = sample();
  const out = deleteMaterials(p, ['m1']);
  assert.deepEqual(out.materials.map((m) => m.id), ['m2', 'm3']);
  assert.deepEqual(out.slides.find((s) => s.id === 'v1').materials, [{ role: '台面', materialId: 'm2' }]);
  assert.deepEqual(out.slides.find((s) => s.id === 'v2').materials, [{ role: '柜体 & 柜门', materialId: 'm3' }]);
  assert.equal(out.slides.find((s) => s.id === 'v3'), p.slides.find((s) => s.id === 'v3'), '无关页保持引用相同');
  assert.equal(deleteMaterials(p, ['nope']), p);
});

test('moveMaterial / addMaterial / updateMaterial', () => {
  const p = sample();
  assert.deepEqual(moveMaterial(p, 0, 2).materials.map((m) => m.id), ['m2', 'm3', 'm1']);
  assert.deepEqual(moveMaterial(p, 2, 0).materials.map((m) => m.id), ['m3', 'm1', 'm2']);
  assert.deepEqual(moveMaterial(p, 1, 99).materials.map((m) => m.id), ['m1', 'm3', 'm2']);
  assert.equal(moveMaterial(p, 1, 1), p);
  const { project, material } = addMaterial(p, { name: '新材料' });
  assert.equal(project.materials.length, 4);
  assert.equal(project.materials[3], material);
  assert.equal(material.pending, false);
  assert.match(material.id, /^m-/);
  const up = updateMaterial(p, 'm2', { pending: false });
  assert.equal(up.materials[1].pending, false);
  assert.equal(updateMaterial(p, 'nope', { pending: false }), p);
});

// ---------------------------------------------------------------------------
// 项目
// ---------------------------------------------------------------------------

test('projectThumbSrc / projectStats / copyName', () => {
  const p = sample();
  assert.equal(projectThumbSrc(p), 'asset:img1');
  assert.equal(projectThumbSrc({ ...p, cover: { image: 'asset:cov', layout: 'full' } }), 'asset:cov');
  assert.equal(projectThumbSrc({ ...p, slides: [] }), 'asset:t1');
  assert.equal(projectThumbSrc(null), null);
  const st = projectStats(p);
  assert.equal(st.views, 3);
  assert.equal(st.hidden, 1);
  assert.equal(st.slides, p.slides.length - 1);
  assert.equal(st.materials, 3);
  assert.equal(copyName('方案 A'), '方案 A（副本）');
  assert.equal(copyName('方案 A（副本）', ['方案 A（副本）']), '方案 A（副本 2）');
  assert.equal(copyName(''), '未命名方案（副本）');
});

test('章节开关：品牌 / 公司 / 服务一键隐藏，封底始终保留', () => {
  const p = sample();
  assert.equal(sectionState(p, 'brand'), 'on');
  const off = setSectionEnabled(p, 'brand', false);
  assert.equal(sectionState(off, 'brand'), 'off');
  assert.equal(sectionState(off, 'company'), 'on');
  assert.equal(off.slides.filter((s) => s.kind === 'company' && s.key.startsWith('brand-')).every((s) => s.enabled === false), true);
  assert.equal(setSectionEnabled(off, 'brand', false), off, '无变化返回原对象');
  const svc = setSectionEnabled(p, 'service', false);
  assert.equal(svc.slides.find((s) => s.key === 'closing').enabled, true, '封底保留');
  assert.equal(svc.slides.find((s) => s.key === 'service-process').enabled, false);
  assert.equal(svc.slides.find((s) => s.kind === 'team').enabled, true, '服务团队页不受影响');
  // 部分隐藏 → mixed
  const mixed = { ...p, slides: p.slides.map((s) => (s.key === 'brand-story' ? { ...s, enabled: false } : s)) };
  assert.equal(sectionState(mixed, 'brand'), 'mixed');
  assert.equal(sectionState({ slides: [] }, 'brand'), 'none');
  // 单页类型
  assert.equal(kindState(p, 'team'), 'on');
  assert.equal(kindState(setKindEnabled(p, 'team', false), 'team'), 'off');
});

test('ensureMaterialsSlide / designCoverSlideId / coverLayoutFor', () => {
  const p = sample();
  assert.equal(ensureMaterialsSlide(p), p);
  const noMat = { ...p, slides: p.slides.filter((s) => s.kind !== 'materials') };
  const fixed = ensureMaterialsSlide(noMat);
  const iCover = fixed.slides.findIndex((s) => s.kind === 'designCover');
  assert.equal(fixed.slides[iCover + 1].kind, 'materials');
  assert.equal(fixed.slides.length, p.slides.length);
  assert.equal(designCoverSlideId(p), p.slides[iCover].id);
  assert.equal(designCoverSlideId({ slides: [] }), null);
  assert.equal(coverLayoutFor('split-light', 'landscape'), 'full');
  assert.equal(coverLayoutFor('full', 'portrait'), 'split-light');
  assert.equal(coverLayoutFor('split-dark', 'portrait'), 'split-dark');
  assert.equal(coverLayoutFor('split-dark', 'square'), 'split-dark');
  assert.equal(coverLayoutFor(undefined, undefined), 'split-light');
});

test('ensureDesignCoverSlide：方案封面页被删时补回到第一张方案页之前', () => {
  const p = sample();
  assert.equal(ensureDesignCoverSlide(p), p);
  const noCover = { ...p, slides: p.slides.filter((s) => s.kind !== 'designCover') };
  const fixed = ensureDesignCoverSlide(noCover);
  const i = fixed.slides.findIndex((s) => s.kind === 'designCover');
  assert.equal(fixed.slides[i + 1].kind, 'materials');
  assert.equal(fixed.slides[i - 1].key, 'company-certified');
  // 只剩公司页：放在服务章节页之前
  const onlyCompany = { ...p, slides: p.slides.filter((s) => s.kind === 'company') };
  const f2 = ensureDesignCoverSlide(onlyCompany);
  const j = f2.slides.findIndex((s) => s.kind === 'designCover');
  assert.equal(f2.slides[j + 1].key, 'service-divider');
  assert.equal(ensureDesignCoverSlide({ slides: [] }).slides[0].kind, 'designCover');
});
