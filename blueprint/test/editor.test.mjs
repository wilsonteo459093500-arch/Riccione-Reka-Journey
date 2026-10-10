// 「页面」编辑器纯函数（src/components/editor/ops.js）：排序 / 复制 / 删除 / 新增 / 版式 / 材料 / 改字 / 提醒修复
import assert from 'node:assert/strict';
import { layoutTeam, layoutViewFramed, layoutViewFull } from '../src/engine/layouts.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test } from './harness.mjs';
import { newProject, assembleDeck, uid, clientLine } from '../src/engine/model.js';
import { renderDeck, elementText } from '../src/engine/deck.js';
import { applyLayoutRhythm } from '../src/engine/layouts.js';
import { analyzePages } from '../src/import/analyze.js';
import {
  canDelete, canDuplicate, canInsertViewAfter, findSlide, listMove, listRemove, listUpdate, listInsert, updateSlide, applyPatches,
  toggleSlide, moveSlideRelative, moveSlide, moveSlideBy, duplicateSlide, deleteSlide, floorContextOf, insertViewsAfter,
  moveToFloorEnd, resolveViewLayout, setViewLayout, setAllViewLayouts, countLayoutChanges, sameRoomViews, copyMaterialsToRoom,
  removeMissingMaterials, splitView, newMaterial, addMaterialAndAssign, assignMaterial, updateFloor, setFloorBackground,
  updateCover, updateTeamMember, addTeamMember, removeTeamMember, teamVisibleIndices, setCompanyOverride, clearCompanyOverride,
  companyFields, companyKeyOf, pageNumbers, groupSections, stabilizePages, warningPageCount, nextWarningIndex, fixForWarning,
  applyFix, inputFieldFor, projectImages, viewTitleOf, roomSuggestions, updateViewList,
} from '../src/components/editor/ops.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

/** 用真实方案 PDF 的 fixture 拼出一个项目（与 importPdf 相同的组装方式，图片用 'asset:<key>' 假引用） */
function fixtureProject() {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'fixtures/sample-pages.json'), 'utf8'));
  const dims = new Map();
  for (const p of raw.pages) for (const im of p.images || []) dims.set(im.key, { w: im.pxW, h: im.pxH });
  const meta = (src) => (src && src.startsWith('asset:') ? dims.get(src.slice(6)) || null : null);
  const a = analyzePages(raw, { fileName: raw.fileName });
  const src = (k) => (k ? `asset:${k}` : null);
  const project = newProject({ name: clientLine(a.info), info: { client: a.info.client, location: a.info.location, date: a.info.date } });
  const fid = new Map();
  project.floors = a.floors.map((f) => {
    const id = uid('f');
    fid.set(f.key, id);
    return { id, zh: f.zh, en: f.en, image: src(f.imageKey), ...(f.planKey ? { plan: src(f.planKey) } : {}) };
  });
  const mid = new Map();
  project.materials = a.materials.map((m) => {
    const id = uid('m');
    mid.set(m.key, id);
    return { id, name: m.name, code: m.code, image: src(m.imageKey), pending: !!m.pending };
  });
  let views = a.views.map((v) => ({
    id: uid('s'), kind: 'view', enabled: true, floorId: v.floorKey ? fid.get(v.floorKey) || null : null, layout: 'auto',
    image: src(v.imageKey), room: v.room, roomEn: v.roomEn, subtitle: v.subtitle,
    materials: v.materials.filter((m) => mid.has(m.materialKey)).map((m) => ({ role: m.role, materialId: mid.get(m.materialKey) })),
    notes: v.notes.map((n) => ({ label: n.label, text: n.text })), sourcePage: v.page,
  }));
  views = applyLayoutRhythm(views, meta);
  const design = views.filter((v) => !v.floorId);
  for (const f of project.floors) {
    design.push({ id: uid('s'), kind: 'floor', floorId: f.id, enabled: true });
    design.push(...views.filter((v) => v.floorId === f.id));
  }
  project.slides = assembleDeck(design);
  return { project, meta };
}

/** 手写的小项目 */
function smallProject() {
  const p = newProject({ info: { client: 'Mr Lau', location: 'Muar', date: '2026 · 08' } });
  p.floors = [{ id: 'f1', zh: '一楼', en: 'GROUND FLOOR', image: null }, { id: 'f2', zh: '二楼', en: 'FIRST FLOOR', image: null }];
  p.materials = [
    { id: 'm1', name: '浅川橡', code: 'AG273', image: 'asset:sw1' },
    { id: 'm2', name: '归雁胡桃', code: 'AG275', image: null },
    { id: 'm3', name: '云峰洞石', code: 'AG318', image: null },
  ];
  const view = (id, floorId, room, extra = {}) => ({
    id, kind: 'view', enabled: true, floorId, layout: 'full', image: `asset:${id}`, room, roomEn: '', subtitle: '', materials: [], notes: [], ...extra,
  });
  p.slides = assembleDeck([
    { id: 'F1', kind: 'floor', floorId: 'f1', enabled: true },
    view('v1', 'f1', '客厅', { subtitle: '全景', materials: [{ role: '柜体 & 柜门', materialId: 'm1' }] }),
    view('v2', 'f1', '客厅', { subtitle: '电视柜' }),
    view('v3', 'f1', '餐厅'),
    { id: 'F2', kind: 'floor', floorId: 'f2', enabled: true },
    view('v4', 'f2', '主卧'),
    view('v5', 'f2', '客厅'),
  ]);
  return p;
}

const ids = (p) => p.slides.map((s) => s.id);
const designIds = (p) => p.slides.filter((s) => s.kind === 'floor' || s.kind === 'view').map((s) => s.id);
const meta169 = () => ({ w: 1920, h: 1080 });

// ---------------------------------------------------------------------------
// 能力 / 数组工具
// ---------------------------------------------------------------------------

test('能力：只有效果图 / 楼层 / 立体图页能删和复制', () => {
  const p = smallProject();
  const byKind = (k) => p.slides.find((s) => s.kind === k);
  for (const k of ['company', 'designCover', 'materials', 'team']) {
    assert.equal(canDelete(byKind(k)), false, k);
    assert.equal(canDuplicate(byKind(k)), false, k);
  }
  assert.equal(canDelete(byKind('view')), true);
  assert.equal(canDelete(byKind('floor')), false, '楼层章节页只能隐藏');
  assert.equal(canDelete({ kind: 'view', tag: '3d' }), true);
  assert.equal(canInsertViewAfter(byKind('materials')), true);
  assert.equal(canInsertViewAfter(byKind('company')), false);
  assert.equal(canDelete(null), false);
});

test('数组工具：移动 / 删除 / 更新 / 插入，越界不变', () => {
  const a = ['a', 'b', 'c'];
  assert.deepEqual(listMove(a, 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(listMove(a, 2, -2), ['c', 'a', 'b']);
  assert.equal(listMove(a, 0, -1), a);
  assert.deepEqual(listRemove(a, 1), ['a', 'c']);
  assert.deepEqual(listUpdate([{ x: 1 }, { x: 2 }], 1, { y: 3 }), [{ x: 1 }, { x: 2, y: 3 }]);
  assert.deepEqual(listInsert(a, 1, 'z'), ['a', 'z', 'b', 'c']);
  assert.deepEqual(listInsert(a, 99, 'z'), ['a', 'b', 'c', 'z']);
  assert.deepEqual(a, ['a', 'b', 'c'], '原数组不变');
});

test('updateSlide / applyPatches / toggleSlide：不可变，未命中返回原对象', () => {
  const p = smallProject();
  const before = JSON.stringify(p);
  const q = updateSlide(p, 'v1', { room: '起居室' });
  assert.equal(findSlide(q, 'v1').room, '起居室');
  assert.equal(JSON.stringify(p), before, '原项目不变');
  assert.equal(q.slides[q.slides.findIndex((s) => s.id === 'v2')], p.slides[p.slides.findIndex((s) => s.id === 'v2')], '其它页对象沿用');
  assert.equal(updateSlide(p, 'nope', { room: 'x' }), p);
  const r = applyPatches(p, [{ slideId: 'v2', patch: { subtitle: '电视墙' } }, { slideId: 'v3', patch: { roomEn: 'DINING' } }]);
  assert.equal(findSlide(r, 'v2').subtitle, '电视墙');
  assert.equal(findSlide(r, 'v3').roomEn, 'DINING');
  assert.equal(applyPatches(p, []), p);
  const t = toggleSlide(p, 'v1');
  assert.equal(findSlide(t, 'v1').enabled, false);
  assert.equal(findSlide(toggleSlide(t, 'v1'), 'v1').enabled, true);
});

// ---------------------------------------------------------------------------
// 排序
// ---------------------------------------------------------------------------

test('moveSlideRelative：拖到目标前 / 后；公司页也能拖；拖到自己不变', () => {
  const p = smallProject();
  const q = moveSlideRelative(p, 'v3', 'v1', 'before');
  assert.deepEqual(designIds(q), ['F1', 'v3', 'v1', 'v2', 'F2', 'v4', 'v5']);
  const r = moveSlideRelative(p, 'v1', 'v4', 'after');
  assert.deepEqual(designIds(r), ['F1', 'v2', 'v3', 'F2', 'v4', 'v1', 'v5']);
  assert.equal(moveSlideRelative(p, 'v1', 'v1', 'after'), p);
  assert.equal(moveSlideRelative(p, 'v1', 'v2', 'before'), p, '位置没变返回原对象');
  const closing = p.slides[p.slides.length - 1];
  const s = moveSlideRelative(p, closing.id, p.slides[0].id, 'before');
  assert.equal(s.slides[0].id, closing.id);
  assert.equal(s.slides.length, p.slides.length);
});

test('moveSlide / moveSlideBy：Alt+↑/↓ 一次一位，到头不动', () => {
  const p = smallProject();
  const i = p.slides.findIndex((s) => s.id === 'v2');
  const up = moveSlideBy(p, 'v2', -1);
  assert.equal(up.slides[i - 1].id, 'v2');
  assert.equal(up.slides[i].id, 'v1');
  const down = moveSlideBy(p, 'v2', 1);
  assert.equal(down.slides[i + 1].id, 'v2');
  assert.equal(moveSlideBy(p, p.slides[0].id, -1), p);
  assert.equal(moveSlideBy(p, p.slides[p.slides.length - 1].id, 1), p);
  assert.equal(moveSlide(p, 'v2', 0).slides[0].id, 'v2');
});

// ---------------------------------------------------------------------------
// 复制 / 删除 / 新增
// ---------------------------------------------------------------------------

test('duplicateSlide：深拷贝插在原页后；公司页不能复制', () => {
  const p = smallProject();
  const q = duplicateSlide(p, 'v1', 'v1b');
  assert.deepEqual(designIds(q).slice(0, 3), ['F1', 'v1', 'v1b']);
  const a = findSlide(q, 'v1');
  const b = findSlide(q, 'v1b');
  assert.deepEqual({ ...b, id: 'v1' }, a);
  assert.notEqual(a.materials, b.materials, '材料列表是新数组');
  const company = p.slides.find((s) => s.kind === 'company');
  assert.equal(duplicateSlide(p, company.id, 'x'), p);
  assert.equal(duplicateSlide(p, 'v1', ''), p, '没给新 id 不动');
});

test('deleteSlide：方案页可删；公司页 / 封面 / 材料 / 团队不能删', () => {
  const p = smallProject();
  const q = deleteSlide(p, 'v2');
  assert.equal(findSlide(q, 'v2'), null);
  assert.equal(q.slides.length, p.slides.length - 1);
  for (const k of ['company', 'designCover', 'materials', 'team']) {
    const s = p.slides.find((x) => x.kind === k);
    assert.equal(deleteSlide(p, s.id), p, k);
  }
  assert.equal(deleteSlide(p, 'F2'), p, '楼层章节页只能隐藏，不能删');
});

test('moveToFloorEnd：该楼层没有章节页（旧项目里删过）→ 在这一页前补一张章节页', () => {
  const p = smallProject();
  const noF2 = { ...p, slides: p.slides.filter((s) => s.id !== 'F2') };
  const v = noF2.slides.find((s) => s.kind === 'view' && s.floorId === p.slides.find((x) => x.id === 'F2').floorId);
  const q = moveToFloorEnd(noF2, v.id, 'F2-new');
  const i = q.slides.findIndex((s) => s.id === 'F2-new');
  assert.equal(q.slides[i].kind, 'floor');
  assert.equal(q.slides[i + 1].id, v.id);
});

test('insertViewsAfter：同楼层、沿用房间名、版式自动；材料页后面新增 = 无楼层', () => {
  const p = smallProject();
  const q = insertViewsAfter(p, 'v1', [{ id: 'n1', image: 'asset:new1' }, { id: 'n2', image: 'asset:new2' }]);
  assert.deepEqual(designIds(q).slice(0, 4), ['F1', 'v1', 'n1', 'n2']);
  const n1 = findSlide(q, 'n1');
  assert.equal(n1.kind, 'view');
  assert.equal(n1.floorId, 'f1');
  assert.equal(n1.room, '客厅');
  assert.equal(n1.subtitle, '');
  assert.equal(n1.layout, 'auto');
  assert.equal(n1.image, 'asset:new1');
  assert.deepEqual(n1.materials, []);
  const r = insertViewsAfter(p, 'F2', [{ id: 'n3', image: 'asset:x' }]);
  assert.equal(findSlide(r, 'n3').floorId, 'f2');
  assert.equal(findSlide(r, 'n3').room, '');
  const mats = p.slides.find((s) => s.kind === 'materials');
  const s = insertViewsAfter(p, mats.id, [{ id: 'n4', image: 'asset:y' }]);
  assert.equal(findSlide(s, 'n4').floorId, null);
  assert.equal(s.slides[s.slides.findIndex((x) => x.id === mats.id) + 1].id, 'n4');
  assert.equal(insertViewsAfter(p, 'v1', []), p);
  // 新页能正常渲染
  const out = renderDeck(q, { meta: meta169 });
  assert.ok(out.some((pg) => pg.slideId === 'n1'));
});

test('floorContextOf / moveToFloorEnd：改楼层后移到该楼层章节末尾', () => {
  const p = smallProject();
  assert.equal(floorContextOf(p, 'v3'), 'f1');
  assert.equal(floorContextOf(p, 'v4'), 'f2');
  assert.equal(floorContextOf(p, p.slides.find((s) => s.kind === 'materials').id), null);
  const q = updateSlide(p, 'v1', { floorId: 'f2' });
  const r = moveToFloorEnd(q, 'v1');
  assert.deepEqual(designIds(r), ['F1', 'v2', 'v3', 'F2', 'v4', 'v5', 'v1']);
  assert.equal(moveToFloorEnd(updateSlide(p, 'v1', { floorId: null }), 'v1').slides.length, p.slides.length);
});

// ---------------------------------------------------------------------------
// 版式
// ---------------------------------------------------------------------------

test('resolveViewLayout：auto 按图片比例 / 内容判断', () => {
  const v = { kind: 'view', layout: 'auto', image: 'asset:a', materials: [], notes: [] };
  assert.equal(resolveViewLayout(v, () => ({ w: 1920, h: 1080 })), 'full');
  assert.equal(resolveViewLayout(v, () => ({ w: 1000, h: 1000 })), 'framed');
  assert.equal(resolveViewLayout({ ...v, notes: [{ label: 'x', text: 'y' }] }, () => ({ w: 1920, h: 1080 })), 'framed');
  assert.equal(resolveViewLayout({ ...v, layout: 'framed' }, () => ({ w: 1920, h: 1080 })), 'framed');
  assert.equal(resolveViewLayout({ kind: 'floor' }), null);
});

test('setAllViewLayouts：全部满版 / 框图；AI 立体图不动；自动 = 节奏调整（不连续 3 页同版式）', () => {
  const p = smallProject();
  p.slides = [...p.slides, { id: 'd3', kind: 'view', tag: '3d', layout: 'full', image: 'asset:d', floorId: 'f1', materials: [], notes: [] }];
  const framed = setAllViewLayouts(p, 'framed');
  assert.ok(framed.slides.filter((s) => s.kind === 'view' && s.tag !== '3d').every((s) => s.layout === 'framed'));
  assert.equal(findSlide(framed, 'd3').layout, 'full');
  assert.equal(countLayoutChanges(p, framed), 5);
  assert.equal(setAllViewLayouts(framed, 'framed'), framed, '没变化返回原对象');
  const auto = setAllViewLayouts(framed, 'auto', meta169);
  const seq = auto.slides.filter((s) => s.kind === 'view' && s.tag !== '3d').map((s) => s.layout);
  assert.ok(seq.every((l) => l === 'full' || l === 'framed'), '自动排版写回具体版式');
  for (let i = 2; i < seq.length; i++) assert.ok(!(seq[i] === seq[i - 1] && seq[i] === seq[i - 2]), `第 ${i} 页连续三页同版式`);
  assert.equal(setViewLayout(p, 'v1', 'framed').slides.find((s) => s.id === 'v1').layout, 'framed');
});

test('setAllViewLayouts(auto) 在真实方案（fixture）上：与导入结果一致', () => {
  const { project, meta } = fixtureProject();
  const views = project.slides.filter((s) => s.kind === 'view');
  assert.ok(views.length > 40, `效果图页 ${views.length}`);
  const allFull = setAllViewLayouts(project, 'full');
  const back = setAllViewLayouts(allFull, 'auto', meta);
  assert.deepEqual(back.slides.filter((s) => s.kind === 'view').map((s) => s.layout), views.map((s) => s.layout));
});

// ---------------------------------------------------------------------------
// 材料 / 备注
// ---------------------------------------------------------------------------

test('copyMaterialsToRoom：只复制到同楼层同房间（不含立体图），深拷贝', () => {
  const p = smallProject();
  assert.deepEqual(sameRoomViews(p, 'v1').map((s) => s.id), ['v2'], '二楼的客厅不算');
  const q = copyMaterialsToRoom(p, 'v1');
  assert.deepEqual(findSlide(q, 'v2').materials, [{ role: '柜体 & 柜门', materialId: 'm1' }]);
  assert.notEqual(findSlide(q, 'v2').materials[0], findSlide(q, 'v1').materials[0]);
  assert.deepEqual(findSlide(q, 'v5').materials, []);
  assert.equal(copyMaterialsToRoom(p, 'v3'), p, '没有同房间页');
});

test('assignMaterial / addMaterialAndAssign / removeMissingMaterials', () => {
  const p = smallProject();
  const a = assignMaterial(p, 'v1', 0, 'm2');
  assert.deepEqual(findSlide(a, 'v1').materials, [{ role: '柜体 & 柜门', materialId: 'm2' }]);
  const b = assignMaterial(p, 'v1', -1, 'm3', '岩板');
  assert.deepEqual(findSlide(b, 'v1').materials[1], { role: '岩板', materialId: 'm3' });
  const mat = newMaterial('m9', { name: ' 墨白橡 ', code: 'ag336' });
  assert.deepEqual(mat, { id: 'm9', name: '墨白橡', code: 'AG336', image: null, pending: false });
  const c = addMaterialAndAssign(p, 'v2', -1, mat, '柜门');
  assert.equal(c.materials.length, 4);
  assert.deepEqual(findSlide(c, 'v2').materials, [{ role: '柜门', materialId: 'm9' }]);
  const d = updateViewList(c, 'v2', 'materials', (l) => [...l, { role: 'x', materialId: 'gone' }, { role: 'y', materialId: null }]);
  assert.equal(findSlide(d, 'v2').materials.length, 3);
  assert.deepEqual(findSlide(removeMissingMaterials(d, 'v2'), 'v2').materials, [{ role: '柜门', materialId: 'm9' }]);
});

test('splitView：备注在前、材料在后对半分，两页都用框图，同一张图', () => {
  const p = smallProject();
  const notes = [{ label: 'A', text: '1' }, { label: 'B', text: '2' }];
  const mats = ['m1', 'm2', 'm3'].map((id, i) => ({ role: `r${i}`, materialId: id }));
  const q0 = updateSlide(p, 'v3', { notes, materials: mats });
  const q = splitView(q0, 'v3', 'v3b');
  const a = findSlide(q, 'v3');
  const b = findSlide(q, 'v3b');
  assert.deepEqual(designIds(q).slice(3, 5), ['v3', 'v3b']);
  assert.equal(a.notes.length + a.materials.length, 3);
  assert.equal(b.notes.length + b.materials.length, 2);
  assert.deepEqual(a.notes, notes);
  assert.deepEqual([...a.materials, ...b.materials], mats);
  assert.equal(a.layout, 'framed');
  assert.equal(b.layout, 'framed');
  assert.equal(b.image, a.image);
  assert.equal(splitView(p, 'v4', 'x'), p, '只有 0 项不拆');
});

// ---------------------------------------------------------------------------
// 楼层 / 封面 / 团队
// ---------------------------------------------------------------------------

test('updateFloor / setFloorBackground：换图写在楼层上；恢复自动 = 该层第一张效果图', () => {
  const p = smallProject();
  const q = updateFloor(p, 'f1', { zh: '首层' });
  assert.equal(q.floors[0].zh, '首层');
  assert.equal(updateFloor(p, 'nope', { zh: 'x' }), p);
  const r = setFloorBackground(updateSlide(p, 'F1', { image: 'asset:old' }), 'F1', 'asset:bg');
  assert.equal(r.floors[0].image, 'asset:bg');
  assert.equal('image' in findSlide(r, 'F1'), false, '单页旧设置清掉');
  const out = renderDeck(r, { meta: meta169 });
  assert.equal(out.find((pg) => pg.slideId === 'F1').els.find((e) => e.t === 'img').src, 'asset:bg');
  const s = setFloorBackground(r, 'F1', null);
  assert.equal(s.floors[0].image, null);
  const out2 = renderDeck(s, { meta: meta169 });
  assert.equal(out2.find((pg) => pg.slideId === 'F1').els.find((e) => e.t === 'img').src, 'asset:v1', '第一张效果图');
});

test('团队：显示序号 ↔ info.team 序号；增删改', () => {
  const p = smallProject();
  const team = [{ en: 'A', name: '', role: '' }, { en: 'B', name: 'Sheerly', role: '方案设计师' }, { en: 'C', name: '', role: '销售' }];
  const q = updateCover(p, {});
  const t = { ...q, info: { ...q.info, team } };
  assert.deepEqual(teamVisibleIndices(team), [1, 2]);
  // 画布上的 edit 字段就是 info.team 原始序号
  const teamFields = layoutTeam(team).els.filter((e) => e.edit).map((e) => e.edit.field);
  assert.deepEqual(teamFields, ['team.1.en', 'team.1.name', 'team.1.role', 'team.2.en', 'team.2.name', 'team.2.role']);
  assert.equal(inputFieldFor('team.1.name'), 'team.1.name');
  const u = updateTeamMember(t, 0, { name: 'Lau' });
  assert.equal(u.info.team[0].name, 'Lau');
  assert.equal(addTeamMember(t).info.team.length, 4);
  assert.deepEqual(removeTeamMember(t, 0).info.team.map((m) => m.en), ['B', 'C']);
  assert.equal(teamVisibleIndices(Array.from({ length: 9 }, () => ({ name: 'x' }))).length, 6);
});

test('updateCover：只改封面字段', () => {
  const p = smallProject();
  const q = updateCover(p, { layout: 'full' });
  assert.deepEqual(q.cover, { image: null, layout: 'full' });
});

// ---------------------------------------------------------------------------
// 公司页改字
// ---------------------------------------------------------------------------

test('companyFields / setCompanyOverride：改字、恢复原文、与原文相同自动去掉改写', () => {
  const p = smallProject();
  const cover = p.slides.find((s) => s.kind === 'company' && s.key === 'cover');
  const fields = companyFields(cover, p);
  assert.ok(fields.length >= 4);
  const client = fields.find((f) => f.tokens && f.text === 'Muar · Mr Lau');
  assert.ok(client, '客户行来自项目信息');
  assert.equal(client.overridden, false);
  const q = setCompanyOverride(p, cover.id, client.idx, 'Muar · Mr & Mrs Lau', client.original);
  assert.equal(findSlide(q, cover.id).overrides[client.idx], 'Muar · Mr & Mrs Lau');
  const out = renderDeck(q);
  const el = out.find((pg) => pg.slideId === cover.id).els[client.idx];
  assert.equal(elementText(el), 'Muar · Mr & Mrs Lau');
  assert.equal(companyFields(findSlide(q, cover.id), q).find((f) => f.idx === client.idx).overridden, true);
  const r = clearCompanyOverride(q, cover.id, client.idx);
  assert.equal('overrides' in findSlide(r, cover.id), false, '没有改写时去掉 overrides');
  const s = setCompanyOverride(q, cover.id, client.idx, client.original, client.original);
  assert.equal('overrides' in findSlide(s, cover.id), false, '改回原文 = 恢复');
  // 多段文字
  const t = setCompanyOverride(p, cover.id, client.idx, '第一行\n第二行', client.original);
  assert.equal(renderDeck(t).find((pg) => pg.slideId === cover.id).els[client.idx].paras.length, 2);
  // 页脚分组
  assert.ok(fields.some((f) => f.footer));
});

test('companyKeyOf：方案封面没有 Material Board 时 = 方案章节页模板', () => {
  const p = smallProject();
  const dc = p.slides.find((s) => s.kind === 'designCover');
  assert.equal(companyKeyOf(dc, p), 'design-divider');
  assert.equal(companyKeyOf(dc, updateCover(p, { image: 'asset:board' })), null);
  assert.ok(companyFields(dc, p).length > 0);
  assert.equal(companyFields(dc, updateCover(p, { image: 'asset:board' })).length, 0);
});

// ---------------------------------------------------------------------------
// 渲染结果整理
// ---------------------------------------------------------------------------

test('pageNumbers / groupSections：页码只数启用的页；章节按连续分组', () => {
  const p = toggleSlide(smallProject(), 'v2');
  const out = renderDeck(p, { meta: meta169 });
  const nums = pageNumbers(out);
  assert.equal(nums.has('v2'), false);
  assert.equal(nums.get(out[0].key), 1);
  assert.equal(Math.max(...nums.values()), out.filter((pg) => pg.enabled).length);
  const groups = groupSections(out);
  assert.deepEqual(groups.map((g) => g.section), ['opening', 'brand', 'company', 'design', 'service']);
  assert.equal(groups[3].label, '03 方案 · 设计图');
  assert.equal(groups.reduce((n, g) => n + g.items.length, 0), out.length);
  // 公司页拖到方案中间 → 章节分成两段
  const moved = moveSlideRelative(p, p.slides.find((s) => s.key === 'brand-awards').id, 'v3', 'after');
  const g2 = groupSections(renderDeck(moved, { meta: meta169 }));
  assert.equal(g2.filter((g) => g.section === 'design').length, 2);
});

test('stabilizePages：内容没变沿用旧对象，改了一页只换那一页', () => {
  const p = smallProject();
  const r1 = stabilizePages(null, renderDeck(p, { meta: meta169 }));
  const q = updateSlide(p, 'v3', { subtitle: '餐桌' });
  const r2 = stabilizePages(r1.cache, renderDeck(q, { meta: meta169 }));
  const changed = r2.pages.filter((pg, i) => pg !== r1.pages[i]).map((pg) => pg.key);
  // 餐厅改了视角名 → 只影响这一页（楼层页的空间清单只列房间名，不变）
  assert.deepEqual(changed, ['v3']);
  // 改房间名 → 这一页 + 楼层页
  const r3 = stabilizePages(r2.cache, renderDeck(updateSlide(q, 'v3', { room: '厨房' }), { meta: meta169 }));
  assert.deepEqual(r3.pages.filter((pg, i) => pg !== r2.pages[i]).map((pg) => pg.key).sort(), ['F1', 'v3']);
});

test('提醒：一键修复的识别与套用（满版放不下 → 框图；材料被删 → 移除）', () => {
  const p = smallProject();
  const many = ['m1', 'm2', 'm3', 'm1', 'm2', 'm3', 'm1', 'm2'].map((id, i) => ({ role: `柜体 & 柜门 ${i}`, materialId: id }));
  const q = updateSlide(p, 'v1', { layout: 'full', materials: many });
  const pg = renderDeck(q, { meta: meta169 }).find((x) => x.key === 'v1');
  assert.ok(pg.warnings.length, '满版放不下应有提醒');
  const fix = fixForWarning(pg.warnings[0]);
  assert.equal(fix.id, 'framed');
  const r = applyFix(q, fix.id, 'v1');
  const pg2 = renderDeck(r, { meta: meta169 }).find((x) => x.key === 'v1');
  assert.equal(findSlide(r, 'v1').layout, 'framed');
  assert.ok(!pg2.warnings.some((w) => /满版/.test(w)));
  // 材料被删
  const s = { ...updateSlide(p, 'v3', { layout: 'framed', materials: [{ role: 'x', materialId: 'gone' }] }) };
  const w = renderDeck(s, { meta: meta169 }).find((x) => x.key === 'v3').warnings;
  assert.equal(fixForWarning(w[0]).id, 'removeMissing');
  assert.deepEqual(findSlide(applyFix(s, 'removeMissing', 'v3'), 'v3').materials, []);
  // 其它提醒
  assert.equal(fixForWarning('缺少效果图').id, 'pickImage');
  assert.equal(fixForWarning('楼层章节页没有背景图').field, 'image');
  assert.equal(fixForWarning('本案材料为空').id, 'gotoMaterials');
  assert.equal(fixForWarning('服务团队还没填名字（项目信息 → 服务团队）').field, 'team.0.name');
  assert.equal(fixForWarning('右侧说明太多放不下 —— 建议拆成两页，或删掉部分备注').id, 'split');
  assert.equal(fixForWarning('未知的公司页：x'), null);
  assert.equal(applyFix(p, 'nope', 'v1'), p);
});

test('nextWarningIndex / warningPageCount：只看启用的页，循环查找', () => {
  const rendered = [
    { key: 'a', enabled: true, warnings: [] },
    { key: 'b', enabled: true, warnings: ['x'] },
    { key: 'c', enabled: false, warnings: ['y'] },
    { key: 'd', enabled: true, warnings: ['z'] },
  ];
  assert.equal(warningPageCount(rendered), 2);
  assert.equal(nextWarningIndex(rendered, 0), 1);
  assert.equal(nextWarningIndex(rendered, 1), 3);
  assert.equal(nextWarningIndex(rendered, 3), 1);
  assert.equal(nextWarningIndex([{ enabled: true, warnings: [] }], 0), -1);
});

test('框图 / 满版：备注的 edit 字段是原始序号（空备注跳过但不改号）', () => {
  const v = { kind: 'view', room: '客厅', layout: 'framed', notes: [{ label: '', text: '' }, { label: 'A', text: '1' }, { label: 'B', text: '2' }], materials: [] };
  const fields = (els) => els.filter((e) => e.edit && /^notes\./.test(e.edit.field)).map((e) => e.edit.field);
  assert.deepEqual(fields(layoutViewFramed(v, null, { project: null, meta: () => null }).els), ['notes.1.label', 'notes.1.text', 'notes.2.label', 'notes.2.text']);
  assert.deepEqual(fields(layoutViewFull(v, null, { project: null, meta: () => null }).els).sort(), ['notes.1.label', 'notes.1.text', 'notes.2.label', 'notes.2.text']);
  assert.equal(inputFieldFor('materials.2.role'), 'materials.2.role');
  assert.equal(inputFieldFor('title'), 'title');
});

test('projectImages / roomSuggestions / viewTitleOf', () => {
  const p = smallProject();
  const q = updateCover(updateFloor(p, 'f1', { image: 'asset:v1', plan: 'asset:plan1', renders3d: ['asset:3d'] }), { image: 'asset:board' });
  const imgs = projectImages(q);
  const srcs = imgs.map((i) => i.src);
  assert.equal(new Set(srcs).size, srcs.length, '去重');
  assert.deepEqual(srcs.slice(0, 5), ['asset:v1', 'asset:v2', 'asset:v3', 'asset:v4', 'asset:v5']);
  assert.ok(srcs.includes('asset:plan1') && srcs.includes('asset:3d') && srcs.includes('asset:board'));
  assert.equal(srcs.includes('asset:sw1'), false, '材料色板不算');
  assert.equal(imgs[0].label, '一楼 · 客厅 · 全景');
  assert.deepEqual(roomSuggestions(p), ['客厅', '餐厅', '主卧']);
  assert.equal(viewTitleOf({ room: '客厅', subtitle: ' 全景 ' }), '客厅 · 全景');
  assert.equal(viewTitleOf({}), '未命名');
});

test('真实方案（fixture）：整套操作后仍能渲染', () => {
  const { project, meta } = fixtureProject();
  const views = project.slides.filter((s) => s.kind === 'view');
  let p = duplicateSlide(project, views[0].id, 'dup');
  p = moveSlideRelative(p, 'dup', views[5].id, 'after');
  p = insertViewsAfter(p, views[3].id, [{ id: 'ins', image: views[3].image }]);
  p = copyMaterialsToRoom(p, views[1].id);
  p = setAllViewLayouts(p, 'framed');
  p = deleteSlide(p, views[2].id);
  const out = renderDeck(p, { meta });
  assert.equal(out.filter((pg) => pg.kind === 'view').length, views.length + 1);
  assert.ok(out.every((pg) => Array.isArray(pg.els) && pg.els.length));
  const nums = pageNumbers(out);
  assert.equal(nums.size, out.length);
});
