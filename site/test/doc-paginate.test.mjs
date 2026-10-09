// 文档分页（纯函数）：原子拆分 / 装页 / 续页表头 / 超高原子 / 确定性
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fillReport, SAMPLE_PROJECT, SAMPLE_SETTINGS } from './fixtures.mjs';
import { buildDocModel } from '../src/lib/docmodel.js';
import { buildAtoms, paginate, splitText, gridRows } from '../src/components/doc/paginate.js';
import { FIRST_AVAIL, CONT_AVAIL } from '../src/components/doc/theme.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'templates');

// 模板逐个加载，未写完的跳过
const templates = [];
for (const f of readdirSync(DIR).sort()) {
  if (!f.endsWith('.js') || ['index.js', 'schema.js', 'helpers.js'].includes(f)) continue;
  try {
    const t = (await import(pathToFileURL(join(DIR, f)).href)).default;
    if (t?.id && Array.isArray(t.sections)) templates.push(t);
  } catch {
    /* 跳过 */
  }
}

const model = (t, v = 'full') =>
  buildDocModel({ template: t, report: fillReport(t, v), project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });

// 粗估高度（不依赖浏览器）：让分页逻辑有真实感的输入
const FAKE_H = {
  header: 200, intro: 50, legend: 28, secHead: 40, gridRow: 34, listRow: 46, photoLine: 140,
  clHead: 32, clRow: 58, tick: 32, tblHead: 34, tblRow: 40, tblEmpty: 34, contHead: 50,
  summary: 70, note: 40, sig: 150, endNote: 30,
};
const fakeHeights = (atoms) => atoms.map((a) => FAKE_H[a.kind] || 30);
const fakeHeads = (heads) => Object.fromEntries(Object.keys(heads).map((g) => [g, FAKE_H.contHead]));

function check(atoms, heights, heads, pages) {
  // 每个原子恰好出现一次，顺序不变
  const seq = pages.flat().filter((it) => 'atom' in it).map((it) => it.atom);
  assert.deepEqual(seq, atoms.map((_, i) => i));
  pages.forEach((items, p) => {
    const avail = p === 0 ? FIRST_AVAIL : CONT_AVAIL;
    let used = 0;
    let real = 0;
    items.forEach((it, k) => {
      if ('cont' in it) {
        assert.equal(k, 0, '续页表头只能在页首');
        assert.ok(heads[it.cont], '续页表头对应的表格不存在');
        used += heads[it.cont];
        return;
      }
      used += (real ? atoms[it.atom].space || 0 : 0) + heights[it.atom];
      real += 1;
    });
    // 含超高原子（一页放不下，裁切显示）的页除外，其余必须放得下
    const hasBig = items.some((it) => 'atom' in it && heights[it.atom] > CONT_AVAIL);
    if (real > 1 && !hasBig) assert.ok(used <= avail + 0.01, `第 ${p + 1} 页超高 ${used} > ${avail}`);
    // 节标题不落在页尾
    const last = items[items.length - 1];
    if (p < pages.length - 1 && 'atom' in last) {
      assert.notEqual(atoms[last.atom].kind, 'secHead', `第 ${p + 1} 页末尾是孤立的节标题`);
    }
    // 表格行换页 → 新页以续页表头开头
    const first = items.find((it) => 'atom' in it);
    if (p > 0 && first && atoms[first.atom].group && heads[atoms[first.atom].group] != null) {
      assert.ok('cont' in items[0], `第 ${p + 1} 页表格续行缺少表头`);
    }
  });
}

export const tests = [
  ['splitText 按段落切块且可还原', () => {
    const text = Array.from({ length: 40 }, (_, i) => `第 ${i + 1} 段：${'字'.repeat(60)}`).join('\n');
    const parts = splitText(text, 520);
    assert.ok(parts.length > 1);
    assert.equal(parts.join('\n'), text);
    for (const p of parts) assert.ok(p.length <= 520 * 1.7);
    const huge = '长'.repeat(3000);
    const hp = splitText(huge, 500);
    assert.ok(hp.length >= 5);
    assert.equal(hp.join(''), huge);
  }],
  ['gridRows 按 span 分行并补满', () => {
    const f = (span = 1) => ({ span });
    const rows = gridRows([f(), f(), f(), f(2), f()], 3);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.reduce((s, c) => s + c.span, 0)), [3, 3]);
    const r2 = gridRows([f(), f(3), f()], 3);
    assert.deepEqual(r2.map((r) => r.map((c) => c.span)), [[3], [3], [3]]);
  }],
  ['所有模板：原子拆分 + 装页规则', () => {
    assert.ok(templates.length >= 1, '没有可用模板');
    for (const t of templates) {
      for (const v of ['full', 'empty', 'pass']) {
        const m = model(t, v);
        const { atoms, heads } = buildAtoms(m);
        assert.equal(atoms[0].kind, 'header', t.id);
        // 每个块至少一个原子
        for (const b of m.blocks) {
          assert.ok(atoms.some((a) => a.block === b), `${t.id}/${v}: 块 ${b.type}:${b.id || ''} 没有原子`);
        }
        // 每张照片都在某个照片行 / 视频格里
        const shown = new Set();
        for (const a of atoms) {
          if (a.kind === 'photoLine') a.photos.forEach((p) => shown.add(p.id));
        }
        for (const b of m.blocks) {
          const ids = b.type === 'checklist' ? b.rows.flatMap((r) => r.photos.map((p) => p.id))
            : b.type === 'table' ? b.rows.flatMap((r) => r.photos.map((p) => p.id))
              : b.type === 'fields' ? b.fields.flatMap((f) => (f.photos || []).map((p) => p.id)) : [];
          for (const id of ids) assert.ok(shown.has(id), `${t.id}/${v}: 照片 ${id} 没有渲染`);
        }
        const heights = fakeHeights(atoms);
        const hh = fakeHeads(heads);
        const pages = paginate(atoms, heights, hh);
        check(atoms, heights, hh, pages);
        // 确定性
        assert.deepEqual(paginate(atoms, heights, hh), pages);
      }
    }
  }],
  ['超高原子单独成页，不死循环', () => {
    const atoms = [
      { kind: 'header', space: 0 },
      { kind: 'secHead', space: 20, keep: true },
      { kind: 'listRow', space: 0 },
      { kind: 'listRow', space: 0 },
      { kind: 'note', space: 10 },
    ];
    const heights = [200, 40, 5000, 30, 40];
    const pages = paginate(atoms, heights, {});
    check(atoms, heights, {}, pages);
    const where = pages.findIndex((p) => p.some((it) => it.atom === 2));
    assert.ok(where >= 0);
    assert.ok(!pages[where].some((it) => it.atom === 3), '超高原子后面不应再塞内容');
    assert.ok(pages[where].some((it) => it.atom === 1), '节标题应跟超高原子同页');
    assert.ok(pages.length >= 2 && pages.length <= 4);
  }],
  ['表格跨页：重复表头 + 行与首行照片同页', () => {
    const b = { id: 'tbl' };
    const atoms = [{ kind: 'header', space: 0 }, { kind: 'secHead', block: b, space: 20, keep: true }, { kind: 'clHead', block: b, keep: true, space: 0 }];
    for (let i = 0; i < 30; i += 1) {
      atoms.push({ kind: 'clRow', block: b, group: 'tbl', keep: i % 3 === 0, space: 0 });
      if (i % 3 === 0) atoms.push({ kind: 'photoLine', block: b, group: 'tbl', space: 0 });
    }
    const heights = atoms.map((a) => FAKE_H[a.kind]);
    const heads = { tbl: 50 };
    const pages = paginate(atoms, heights, heads);
    check(atoms, heights, heads, pages);
    assert.ok(pages.length >= 3);
    // 带照片的行不会是一页的最后一个
    pages.forEach((items, p) => {
      const last = items[items.length - 1];
      if (p < pages.length - 1) assert.ok(!(atoms[last.atom].kind === 'clRow' && atoms[last.atom].keep), '行和它的照片被拆开');
    });
  }],
];
