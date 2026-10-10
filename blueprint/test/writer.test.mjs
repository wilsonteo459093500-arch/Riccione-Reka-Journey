// 导出结构测试：用公司模板 + 合成方案页生成 PPT，检查包结构、关系、XML 闭合。
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { test } from './harness.mjs';
import { newProject, assembleDeck } from '../src/engine/model.js';
import { renderDeck, exportableSlides, collectImageSources } from '../src/engine/deck.js';
import { buildPptx, esc } from '../src/engine/pptx/writer.js';
import { placeImage, countLines, fillTokens } from '../src/engine/spec.js';

// 1×1 白色 PNG
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64'));
const loadImage = async () => ({ data: PNG, mime: 'image/png' });

function sampleProject() {
  const p = newProject({ info: { client: 'Mr Demo', location: 'Muar', date: '2026 · 08' } });
  p.floors = [{ id: 'f1', zh: '一楼', en: 'GROUND FLOOR' }, { id: 'f2', zh: '二楼', en: 'FIRST FLOOR' }];
  p.materials = Array.from({ length: 14 }, (_, i) => ({ id: `m${i}`, name: `材料${i}`, code: `AG${300 + i}`, image: i % 3 ? 'asset:x' : null }));
  p.cover = { image: 'asset:board', layout: 'split-light' };
  const design = [
    { id: 's1', kind: 'floor', floorId: 'f1' },
    { id: 's2', kind: 'view', floorId: 'f1', layout: 'full', image: 'asset:r1', room: '客厅', roomEn: 'LIVING AREA', subtitle: '全景', materials: [{ role: '柜体 & 柜门', materialId: 'm1' }], notes: [] },
    { id: 's3', kind: 'view', floorId: 'f1', layout: 'framed', image: 'asset:r2', room: '客厅', roomEn: 'LIVING AREA', subtitle: '隐形门 <&>', materials: [{ role: '柜体', materialId: 'm2' }, { role: '岩板', materialId: 'gone' }], notes: [{ label: '隐形门', text: '液压闭门器，配反弹器' }] },
    { id: 's4', kind: 'floor', floorId: 'f2' },
    { id: 's5', kind: 'view', floorId: 'f2', layout: 'auto', image: 'asset:r3', room: '主人房', roomEn: 'MASTER BEDROOM', subtitle: '', materials: [], notes: [] },
  ];
  p.slides = assembleDeck(design);
  return p;
}

const meta = (src) => ({ 'asset:r1': { w: 3840, h: 2160 }, 'asset:r2': { w: 2382, h: 2160 }, 'asset:r3': { w: 3840, h: 2160 }, 'asset:board': { w: 1200, h: 1600 }, 'asset:x': { w: 800, h: 600 } })[src] || null;

function assertWellFormed(xml, name) {
  // 去掉声明 / 注释 / CDATA 后做标签配对检查
  const body = xml.replace(/<\?xml[^>]*\?>/, '').replace(/<!--[\s\S]*?-->/g, '');
  const stack = [];
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g;
  let m;
  let last = 0;
  while ((m = re.exec(body))) {
    const between = body.slice(last, m.index);
    assert.ok(!/[<>]/.test(between), `${name}: 非法字符在 ${m.index} 附近：${between.slice(0, 40)}`);
    last = re.lastIndex;
    const [, close, tag, , self] = m;
    if (self) continue;
    if (close) assert.equal(stack.pop(), tag, `${name}: 标签未闭合 </${tag}>`);
    else stack.push(tag);
  }
  assert.equal(stack.length, 0, `${name}: 有 ${stack.length} 个标签未闭合（${stack.slice(-3)}）`);
}

test('整套导出：包结构、关系、XML 闭合', async () => {
  const rendered = exportableSlides(renderDeck(sampleProject(), { meta }));
  // 13 公司开篇 + 方案封面 + 本案材料 + 5 方案页 + 服务章节 + 团队 + 4 服务尾页
  assert.equal(rendered.length, 26);
  const { file, warnings } = await buildPptx(rendered, { loadImage, type: 'uint8array' });
  assert.deepEqual(warnings, []);
  const zip = await JSZip.loadAsync(file);
  const names = Object.keys(zip.files);
  assert.equal(names[0], '[Content_Types].xml');
  const ct = await zip.file('[Content_Types].xml').async('string');
  const presRels = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
  for (let i = 1; i <= rendered.length; i++) {
    const slide = `ppt/slides/slide${i}.xml`;
    assert.ok(zip.file(slide), `缺 ${slide}`);
    assert.ok(ct.includes(`/ppt/slides/slide${i}.xml`), `ContentTypes 缺 slide${i}`);
    assert.ok(presRels.includes(`slides/slide${i}.xml`), `presentation rels 缺 slide${i}`);
    const xml = await zip.file(slide).async('string');
    assertWellFormed(xml, slide);
    const rels = await zip.file(`ppt/slides/_rels/slide${i}.xml.rels`).async('string');
    for (const [, target] of rels.matchAll(/Target="\.\.\/media\/([^"]+)"/g)) assert.ok(zip.file(`ppt/media/${target}`), `缺图 ${target}`);
    for (const [, rid] of xml.matchAll(/r:embed="(rId\d+)"/g)) assert.ok(rels.includes(`Id="${rid}"`), `${slide} 引用了不存在的 ${rid}`);
  }
  for (const part of ['ppt/presentation.xml', 'ppt/slideMasters/slideMaster1.xml', 'ppt/theme/theme1.xml', 'docProps/app.xml', 'docProps/core.xml']) {
    assertWellFormed(await zip.file(part).async('string'), part);
  }
  // 同一张图只存一次
  const media = names.filter((n) => n.startsWith('ppt/media/') && !zip.files[n].dir);
  assert.equal(media.length, collectImageSources(rendered).length, 'media 应按图片来源去重');
});

test('特殊字符被转义、token 被填充', async () => {
  const rendered = exportableSlides(renderDeck(sampleProject(), { meta }));
  const { file } = await buildPptx(rendered, { loadImage, type: 'uint8array' });
  const zip = await JSZip.loadAsync(file);
  let all = '';
  for (const n of Object.keys(zip.files).filter((n) => /slides\/slide\d+\.xml$/.test(n))) all += await zip.file(n).async('string');
  assert.ok(all.includes('隐形门 &lt;&amp;&gt;'));
  assert.ok(!all.includes('{{'), '残留 {{token}}');
  assert.ok(all.includes('Muar · Mr Demo'));
  assert.equal(esc('a\u0001b<'), 'ab&lt;');
  assert.equal(fillTokens('{{a}}-{{zz}}', { a: 1 }), '1-');
});

test('图片裁切：cover / contain', () => {
  const cover = placeImage({ x: 0, y: 0, w: 1920, h: 1080, fit: 'cover', nat: { w: 1000, h: 1000 } });
  assert.ok(Math.abs(cover.crop.t - 0.21875) < 1e-6 && Math.abs(cover.crop.b - 0.21875) < 1e-6);
  const contain = placeImage({ x: 96, y: 96, w: 1140, h: 864, fit: 'contain', ax: 0, ay: 0.5, nat: { w: 2382, h: 2160 } });
  assert.equal(contain.h, 864);
  assert.equal(contain.x, 96);
  assert.ok(contain.w < 1140);
});

test('缺失材料 / 缺图会产生 warning 而不是崩溃', () => {
  const rendered = renderDeck(sampleProject(), { meta });
  const s3 = rendered.find((s) => s.slideId === 's3');
  assert.ok(s3.warnings.some((w) => w.includes('已被删除')));
  assert.ok(countLines('鞋柜 · 客厅 · 楼梯储物柜 · 卧室 · KTV 娱乐室 · 麻将房', 'serif', 42, 0, 576) >= 2);
});

test('材料分页：14 种走 3 行紧凑版一页；30 种均分两页', () => {
  const p = sampleProject();
  let pages = renderDeck(p, { meta }).filter((s) => s.kind === 'materials');
  assert.equal(pages.length, 1);
  p.materials = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, name: `M${i}`, code: '', image: null }));
  pages = renderDeck(p, { meta }).filter((s) => s.kind === 'materials');
  assert.equal(pages.length, 2);
});

// ---------------- 审查发现的导出问题（回归） ----------------
import { fitText, measureText as mt } from '../src/engine/spec.js';
import { layoutMaterials as lm, layoutTeam as lt, layoutFloor as lf } from '../src/engine/layouts.js';
import { exifOrientationOf } from '../src/store/assets.js';

test('esc：落单的 UTF-16 代理项换成 �，结果是合法 UTF-8；成对的 emoji 保留', () => {
  const out = esc('A\uD83DB\uDE00C 😀 <&>');
  assert.equal(out, 'A�B�C 😀 &lt;&amp;&gt;');
  const bytes = new TextEncoder().encode(out);
  assert.doesNotThrow(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes));
});

test('fitText：单行框按宽度缩字号；放得下不动；模板原文（没改过的多行框）不动', () => {
  const el = { t: 'text', x: 0, y: 0, w: 287.5, h: 40, autofit: 'shrink', nowrap: true, paras: [{ runs: [{ text: '35 杯内嵌拉手腰线 · 复合门', font: 'serif', size: 19.5 }] }] };
  const f = fitText(el);
  assert.ok(f.shrunk < 1 && f.shrunk >= 0.5);
  assert.ok(mt(f.paras[0].runs[0].text, 'serif', f.paras[0].runs[0].size) <= (287.5 - 6) * 0.97);
  const short = { ...el, paras: [{ runs: [{ text: '木隐', font: 'serif', size: 19.5 }] }] };
  assert.equal(fitText(short), short);
  const tpl = { ...el, nowrap: false, h: 40, paras: [{ runs: [{ text: '很长很长很长很长很长很长很长很长很长很长很长很长很长很长', font: 'serif', size: 19.5 }] }] };
  assert.equal(fitText(tpl), tpl, '没标 fitWrap 的多行框不缩');
  const edited = fitText({ ...tpl, fitWrap: true });
  assert.ok(edited.shrunk < 1, '设计师改过字的多行框缩到放得下');
});

test('本案材料（≤12）：第一排有两行名称时第二排下移，编号不被盖住', () => {
  const mats = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, name: i === 2 ? '岩板 · Light Grey Terrazzo 加长说明文字' : '木隐', code: `AG3${i}0`, image: null }));
  const { els } = lm(mats, { project: { info: {} }, meta: () => null });
  const rects = els.filter((e) => e.t === 'rect' && e.w > 200 && e.h > 150);
  const row2Top = Math.min(...rects.slice(6).map((r) => r.y));
  const codeEls = els.filter((e) => e.t === 'text' && /^AG/.test(e.paras[0].runs[0].text));
  const row1CodeBottom = Math.max(...codeEls.slice(0, 6).map((e) => e.y + e.h));
  assert.ok(row1CodeBottom <= row2Top, `编号底 ${row1CodeBottom} 压到了第二排 ${row2Top}`);
  for (const e of codeEls) assert.ok(e.y + e.h <= 983.7, `编号 ${e.paras[0].runs[0].text} 压到页脚线（${e.y + e.h}）`);
  // 第二排也有长名称：限一行（缩字号），编号仍在页脚线以上
  const both = mats.map((m, i) => (i === 8 ? { ...m, name: '超白玻璃 · 20 隐框款 · 加长说明文字' } : m));
  const r2 = lm(both, { project: { info: {} }, meta: () => null }).els.filter((e) => e.t === 'text' && /^AG/.test(e.paras[0].runs[0].text));
  for (const e of r2) assert.ok(e.y + e.h <= 983.7, `编号 ${e.paras[0].runs[0].text} 压到页脚线（${e.y + e.h}）`);
});

test('服务团队：英文名一行放下（自动缩小），太长才提示', () => {
  const team = ['Sheerly Tan', 'Jonathan Lim', 'Ahmad Faizal', 'Vivian Wong', '陈美玲'].map((name, i) => ({ en: 'DESIGN', name, role: '设计师' }));
  const { els, warnings } = lt(team);
  const names = els.filter((e) => e.edit && /\.name$/.test(e.edit.field));
  for (const e of names) {
    const r = e.paras[0].runs[0];
    assert.ok(mt(r.text, r.font, r.size) <= (e.w - 6) * 0.97 + 0.5, `${r.text} ${r.size}pt 放不下`);
  }
  assert.equal(warnings.length, 0);
  const long = lt([{ en: 'X', name: 'Muhammad Abdullah bin Ibrahim Al-Haj', role: '' }, ...team.slice(0, 4)]);
  assert.ok(long.warnings.some((w) => /太长/.test(w)));
});

test('楼层页：空间太多时最多四行，并提示没显示的数量', () => {
  const rooms = Array.from({ length: 30 }, (_, i) => `空间名称${i + 1}`);
  const { warnings } = lf({ zh: '一楼', en: 'GROUND FLOOR' }, rooms, null, { meta: () => null });
  assert.ok(warnings.some((w) => /只显示了 \d+ \/ 30 个/.test(w)));
  const few = lf({ zh: '一楼', en: 'GROUND FLOOR' }, ['客厅', '饭厅'], 'asset:x', { meta: () => null });
  assert.deepEqual(few.warnings, []);
});

test('EXIF 方向：手机竖拍（6）读得出来，普通 JPEG / 非 JPEG 为 1', () => {
  // 最小 JPEG 头：SOI + APP1(Exif, II, IFD0: 1 项 0x0112 = 6) + SOS
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0];
  const len = app1.length + 2;
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...app1, 0xff, 0xda, 0, 2]);
  assert.equal(exifOrientationOf(bytes.buffer), 6);
  assert.equal(exifOrientationOf(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer), 1);
  assert.equal(exifOrientationOf(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), 1);
});

test('公司模板页：定稿原文一个字号都不缩；客户名比定稿长时才缩', () => {
  const deckOf = (info) => renderDeck(newProject({ id: 'p', info, slides: assembleDeck([]) }));
  const shrunk = (r) => r.flatMap((s) => s.els.filter((e) => e.shrunk));
  assert.equal(shrunk(deckOf({ client: 'Mr Lau', location: 'Muar', date: '2026 · 08' })).length, 0);
  const long = shrunk(deckOf({ client: 'Puan Sri Datin Noraini binti Abdullah', location: 'Kota Kemuning, Shah Alam', date: '2026 · 10' }));
  assert.ok(long.length >= 1 && long.every((e) => e.shrunk >= 0.5 && e.shrunk < 1));
});
