// 文档分页（纯函数）：原子拆分 / 装页 / 续页表头 / 超高原子 / 长文字切续块 / 确定性；文档媒体取图
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { resolveObjectURL } from 'node:buffer';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fillReport, sampleMedia, SAMPLE_PROJECT, SAMPLE_SETTINGS } from './fixtures.mjs';
import { buildDocModel } from '../src/lib/docmodel.js';
import {
  buildAtoms, paginate, splitText, gridRows, textLines, overTall, clLayout, tblLayout, GRID_LABEL_W,
} from '../src/components/doc/paginate.js';
import { createUrlPool } from '../src/components/doc/media.js';
import { createMediaLoader } from '../src/lib/db.js';
import { FIRST_AVAIL, CONT_AVAIL, CONTENT_W } from '../src/components/doc/theme.js';

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

// ---- 长内容（审查复现：备注 / 填写 / 单元格太长，或很多短行 → 一个原子超过一页被裁掉） ----

const byId = (id) => templates.find((t) => t.id === id);
const firstItem = (t, pred = (it) => !it.input) => {
  for (const s of t.sections) if (s.type === 'checklist') { const it = s.items.find(pred); if (it) return it; }
  return null;
};
const longText = (n) => '现场检查发现柜门铰链松动需要重新调整并复检确认安装位置正确。'.repeat(Math.ceil(n / 30)).slice(0, n);
function longModel(id, mutate) {
  const t = byId(id);
  const r = fillReport(t, 'empty');
  mutate(t, r);
  return buildDocModel({ template: t, report: r, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
}

/** 长文字原子按内容估算的文字高度（与 blocks.jsx 的列宽 / 字号对应） */
function textH(a) {
  const b = a.block;
  const r = a.row || {};
  const tl = (t, w, size, lh) => (t ? textLines(t, w, size) * lh : 0);
  const bl = (ls, w, size, lh) => (ls || []).reduce((s, l) => s + textLines(l, w - 12, size) * lh, 0);
  const input = (w) => (r.lines && r.lines.length ? bl(r.lines, w, 10.5, 16) : tl(r.value, w, 10.5, 16));
  if (a.kind === 'clRow') {
    const L = clLayout(b);
    return r.input ? input(L.res + L.rem - 15) : tl(r.remark, L.rem - 15, 10, 15);
  }
  if (a.kind === 'tick') return (r.input ? input(CONTENT_W - 42) : 0) + tl(r.remark, CONTENT_W - 42, 10, 15);
  if (a.kind === 'tblRow') {
    const T = tblLayout(b);
    return Math.max(0, ...b.columns.map((c, i) => tl(r.cells[c.key], T.ws[i] - 13, 10, 15)));
  }
  if (a.kind === 'listRow') return Math.max(0, ...a.cells.map((f) => (f.lines ? bl(f.lines, CONTENT_W, 12, 18) : tl(f.value, CONTENT_W, 12, 18))));
  if (a.kind === 'gridRow' && a.cells.length === 1 && !a.mediaHead) {
    const f = a.cells[0].field;
    const w = CONTENT_W - (GRID_LABEL_W[a.cols] || 80) - 19;
    return f.lines ? bl(f.lines, w, 11, 16) : tl(f.value, w, 11, 16);
  }
  if (a.kind === 'summary' && a.part === 'long') return tl(a.item.value, CONTENT_W - 165, 10.5, 16);
  return 0;
}
const estHeights = (atoms) => atoms.map((a) => Math.max(FAKE_H[a.kind] || 30, textH(a) + 14));

/** 长内容的通用检查：每块估算 ≤ 半页、续块紧跟、装页后没有超页原子 */
function checkLong(m, kinds) {
  const { atoms, heads } = buildAtoms(m);
  const heights = estHeights(atoms);
  atoms.forEach((a, i) => {
    assert.ok(textH(a) <= CONT_AVAIL / 2, `${a.kind}#${i} 一块估算 ${textH(a)}px，超过半页`);
    if (a.cont && a.kind !== 'gridRow') {
      const prev = atoms[i - 1];
      assert.equal(prev.kind, a.kind, `续块 ${a.kind}#${i} 前面不是同类原子`);
      assert.ok(prev.contNext, `续块 ${a.kind}#${i} 的上一块没有 contNext`);
      assert.equal(prev.group, a.group, '续块换了表格分组');
      assert.ok(!prev.keep || a.kind === 'summary', '前一块不该 keep（照片跟最后一块走）');
    }
  });
  const hh = fakeHeads(heads);
  assert.deepEqual(overTall(atoms, heights, hh), [], '仍有超过一页的原子');
  const pages = paginate(atoms, heights, hh);
  check(atoms, heights, hh, pages);
  const pieces = atoms.filter((a) => kinds.includes(a.kind) && (a.cont || a.contNext));
  return { atoms, pieces };
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
  ['splitText 按行数切块：很多短行 / 一大段都切；硬切在标点处，不拆【】编号和 emoji', () => {
    assert.equal(textLines('a\n\nb', 600, 12), 3, '空段也算一行');
    assert.ok(textLines('字'.repeat(200), 100, 10) >= 25, '中文按 1em 估算并留余量');
    // 120 行短句（< 520 字，旧代码不切）
    const lines = Array.from({ length: 120 }, (_, i) => `${i + 1}. 好`).join('\n');
    const lp = splitText(lines, { maxChars: Infinity, maxLines: 13, width: 714, size: 12 });
    assert.ok(lp.length >= 8);
    assert.equal(lp.join('\n'), lines);
    for (const p of lp) assert.ok(p.split('\n').length <= 13 * 1.5);
    // 一大段（带编号标记）
    let big = '';
    for (let k = 1; k <= 20; k += 1) big += `${longText(140)}【M${k}】`;
    const bp = splitText(big, { maxChars: Infinity, maxLines: 16, width: 121, size: 10 });
    assert.ok(bp.length >= 10);
    assert.equal(bp.join(''), big);
    for (const p of bp) assert.ok(textLines(p, 121, 10) <= 16 * 1.5, `一块 ${textLines(p, 121, 10)} 行`);
    for (let k = 1; k <= 20; k += 1) assert.ok(bp.some((p) => p.includes(`【M${k}】`)), `【M${k}】 被拆开`);
    // emoji（代理对）不拆半个
    const emo = '😀工地'.repeat(400);
    const ep = splitText(emo, { maxChars: Infinity, maxLines: 5, width: 120, size: 10 });
    assert.equal(ep.join(''), emo);
    for (const p of ep) assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(p), '拆出半个 emoji');
  }],
  ['splitText 不切在一个字中间：肤色 / ZWJ 家庭 / 键帽 / 国旗 / 组合符；长编号、带标点的编号不拆', () => {
    // 块首不能是组合符 / 肤色 / ZWJ 后半，块尾不能是 ZWJ；国旗（两个区域字母）不拆开
    const GLUE = /^[\p{M}\u200D\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/u;
    const RI = /[\u{1F1E6}-\u{1F1FF}]/gu;
    const samples = {
      skin: '👍🏻'.repeat(400),
      family: '👨\u200D👩\u200D👧'.repeat(300),
      keycap: '1\uFE0F\u20E32\uFE0F\u20E3#\uFE0F\u20E3'.repeat(200),
      flag: '🇨🇳🇮🇹工'.repeat(300),
      accent: 'e\u0301a\u0300工'.repeat(600),
      mixed: '柜门铰链松动👍🏽需要调整，👩\u200D🔧 OK.'.repeat(200),
    };
    for (const [name, s] of Object.entries(samples)) {
      for (let w = 60; w <= 300; w += 17) {
        for (const L of [2, 3, 5, 16]) {
          const ps = splitText(s, { maxChars: Infinity, maxLines: L, width: w, size: 10 });
          assert.equal(ps.join(''), s, `${name} ${w}/${L}：文字有丢失`);
          ps.forEach((p, i) => {
            if (i > 0) assert.ok(!GLUE.test(p), `${name} ${w}/${L}：块 ${i} 开头是半个字 ${JSON.stringify(p.slice(0, 4))}`);
            if (i < ps.length - 1) assert.ok(!p.endsWith('\u200D'), `${name} ${w}/${L}：块 ${i} 结尾是 ZWJ`);
            assert.equal((p.match(RI) || []).length % 2, 0, `${name} ${w}/${L}：国旗被拆开`);
          });
        }
      }
    }
    // 编号放得进一块就不拆：超过 12 字的、里面有「,」「.」空格的
    const both = (p, a, b) => (p.match(a) || []).length === (p.match(b) || []).length;
    for (const mk of ['【P0001-ABCDEFGHIJKLMNOP】', '【P1, A.B C】', '（见 3.2 节, 图 4）']) {
      const s = `柜门铰链松动需要重新调整安装位置，${mk}`.repeat(120);
      for (let w = 120; w <= 300; w += 13) {
        for (const L of [3, 5, 16]) {
          const ps = splitText(s, { maxChars: Infinity, maxLines: L, width: w, size: 10 });
          assert.equal(ps.join(''), s);
          for (const p of ps) assert.ok(both(p, /[【（]/g, /[】）]/g), `${mk} ${w}/${L}：编号被拆开 ${JSON.stringify(p.slice(-12))}`);
          for (const p of ps) assert.ok(textLines(p, w, 10) <= L * 1.5, `${mk} ${w}/${L}：一块 ${textLines(p, w, 10)} 行`);
        }
      }
    }
    // 一个字比一块还宽：整个放进来（不拆、不死循环）；乱码式超长组合符串照切
    const fam = splitText('👨\u200D👩\u200D👧\u200D👦'.repeat(50), { maxChars: Infinity, maxLines: 1, width: 20, size: 10 });
    assert.ok(fam.every((p) => p === '👨\u200D👩\u200D👧\u200D👦'), '超宽 emoji 被拆开');
    const zalgo = `a${'\u0301'.repeat(400)}`.repeat(10);
    const zp = splitText(zalgo, { maxChars: Infinity, maxLines: 3, width: 120, size: 10 });
    assert.equal(zp.join(''), zalgo);
    assert.ok(zp.length > 10 && zp.every((p) => p.length < 100), '超长组合符串没有切开');
  }],
  ['splitText / buildAtoms 一大段（10 万字、没有换行）是线性时间', () => {
    const s = '柜门铰链松动需要重新调整'.repeat(10000);
    let t0 = performance.now();
    const ps = splitText(s, { maxChars: Infinity, maxLines: 16, width: 135, size: 10 });
    const dt = performance.now() - t0;
    assert.equal(ps.join(''), s);
    assert.ok(dt < 300, `切 12 万字用了 ${dt.toFixed(0)}ms（每切一刀重数整段 = O(n²)）`);
    // 检查表备注 20 万字：排版前的原子拆分（主线程）+ 实测超页后按 0.2 重切
    const m = longModel('quality-check', (t, r) => {
      r.items[firstItem(t).id] = { r: 'F', note: '柜门铰链松动需要重新调整安装位置确认'.repeat(12500) };
    });
    t0 = performance.now();
    const { atoms } = buildAtoms(m);
    const key = atoms.find((a) => a.kind === 'clRow' && a.cont).fit;
    buildAtoms(m, { fit: { [key]: 0.2 } });
    const dt2 = performance.now() - t0;
    assert.ok(dt2 < 1500, `20 万字备注 buildAtoms 用了 ${dt2.toFixed(0)}ms`);
  }],
  ['超长备注 / 填写内容：检查表行切成续行（同列接着写，照片跟最后一段）', () => {
    for (const n of [750, 1225, 3000]) {
      const note = longText(n);
      const m = longModel('quality-check', (t, r) => {
        r.items[firstItem(t).id] = { r: 'F', note, photos: ['m_photo1', 'm_photo2'] };
      });
      const { atoms, pieces } = checkLong(m, ['clRow']);
      assert.ok(pieces.length >= 2, `${n} 字备注没有切开`);
      assert.ok(!pieces[0].cont && pieces.slice(1).every((a) => a.cont), '只有第一段不是续行');
      assert.equal(pieces.map((a) => a.row.remark).join(''), note, '备注文字有丢失 / 重复');
      const last = atoms.indexOf(pieces[pieces.length - 1]);
      assert.ok(atoms[last].keep && atoms[last].hasPhotos && atoms[last + 1].kind === 'photoLine', '照片没跟在最后一段后面');
      assert.ok(pieces.slice(0, -1).every((a) => !a.hasPhotos), '前几段不该带照片标记');
    }
    // 120 行短备注
    const shortLines = Array.from({ length: 120 }, (_, i) => `${i + 1}. 好`).join('\n');
    const p2 = checkLong(longModel('quality-check', (t, r) => { r.items[firstItem(t).id] = { r: 'F', note: shortLines }; }), ['clRow']).pieces;
    assert.equal(p2.map((a) => a.row.remark).join('\n'), shortLines);
    // 场前：textarea 填写项 2400 字
    const value = longText(2400);
    const p3 = checkLong(longModel('pre-install', (t, r) => {
      r.items[firstItem(t, (x) => x.input && x.input.type === 'textarea').id] = { value };
    }), ['clRow']).pieces;
    assert.ok(p3.length >= 2);
    assert.equal(p3.map((a) => a.row.value).join(''), value);
    // 复尺（columns 布局）/ 终检 的长备注
    for (const id of ['measurement', 'final-inspection']) {
      const note2 = longText(1500);
      const p4 = checkLong(longModel(id, (t, r) => { r.items[firstItem(t).id] = { r: id === 'measurement' ? 'N' : 'F', note: note2 }; }), ['clRow']).pieces;
      assert.equal(p4.map((a) => a.row.remark).join(''), note2, id);
    }
  }],
  ['交付打勾清单：长填写 / 长备注切成续块，备注续块不重复「备注」标签', () => {
    const note = longText(3000);
    const { pieces } = checkLong(longModel('handover', (t, r) => { r.items[firstItem(t).id] = { r: 'Y', note }; }), ['tick']);
    assert.ok(pieces.length >= 2);
    assert.equal(pieces.map((a) => a.row.remark).join(''), note);
    assert.ok(!pieces[0].remarkCont && pieces.slice(1).every((a) => a.remarkCont));
    // 合成：打勾项同时有长列表填写 + 长备注 → 先列表、后备注
    const b = {
      type: 'checklist', id: 'syn', title: { zh: '合成' }, options: [{ v: 'Y', zh: '完成', tone: 'pass' }], resultLayout: 'ticks',
      rows: [{ id: 'x', no: '01', title: { zh: '项' }, input: true, lines: Array.from({ length: 80 }, (_, i) => `第 ${i + 1} 项 ${longText(40)}`), value: '', remark: longText(900), result: null, options: [], photos: [] }],
    };
    const m = { meta: {}, blocks: [b] };
    const { atoms } = checkLong(m, ['tick']);
    const ticks = atoms.filter((a) => a.kind === 'tick');
    assert.deepEqual(ticks.flatMap((a) => (a.row.input ? a.row.lines : [])), b.rows[0].lines, '列表行有丢失');
    assert.equal(ticks.map((a) => a.row.remark).join(''), b.rows[0].remark);
    const firstRem = ticks.findIndex((a) => a.row.remark);
    assert.ok(ticks.slice(firstRem + 1).every((a) => !a.row.input), '备注之后不该再有填写内容');
  }],
  ['表格单元格太长：每列各自切，续行同列接着写，序号 / 其他列只在第一行', () => {
    const desc = longText(1800);
    const loc = longText(900);
    const m = longModel('final-inspection', (t, r) => {
      r.tables.rectification = [{ loc, desc, before: ['m_photo1'], after: ['m_photo2'] }, { loc: '主卧', desc: '短' }];
    });
    const { atoms, pieces } = checkLong(m, ['tblRow']);
    const row0 = atoms.filter((a) => a.kind === 'tblRow' && a.ri === 0);
    assert.ok(row0.length >= 2);
    assert.equal(row0.map((a) => a.row.cells.desc).join(''), desc);
    assert.equal(row0.map((a) => a.row.cells.loc).join(''), loc);
    assert.ok(row0.slice(1).every((a) => a.cont && !a.row.cells.category), '续行里重复了其他列');
    assert.ok(row0[row0.length - 1].keep && row0[row0.length - 1].hasPhotos);
    assert.ok(pieces.every((a) => a.group === 'rectification'), '续行要能在新页重复表头');
  }],
  ['很多短行 / 长列表：信息栏切成续块（< 520 字、正好 14 条长规定也切）', () => {
    // 日报 textarea 60 行短句（< 520 字）
    const txt = Array.from({ length: 60 }, (_, i) => `${i + 1}. 好`).join('\n');
    assert.ok(txt.length < 520);
    const { pieces: p1 } = checkLong(longModel('daily-report', (t, r) => {
      const ta = t.sections.flatMap((s) => (s.fields || []).filter((f) => f.type === 'textarea'))[0];
      r.values[ta.key] = txt;
    }), ['listRow']);
    assert.ok(p1.length >= 2);
    assert.equal(p1.map((a) => a.cells[0].value).join('\n'), txt);
    // 进场通知：正好 14 条长规定
    const rules = Array.from({ length: 14 }, (_, i) => `第 ${i + 1} 条：${'走廊、电梯、单位地面先铺保护垫再搬运；垃圾当天清走；'.repeat(8)}`);
    const { pieces: p2 } = checkLong(longModel('site-notice', (t, r) => { r.values.rules = rules; }), ['listRow']);
    assert.ok(p2.length >= 2);
    assert.deepEqual(p2.flatMap((a) => a.cells[0].lines), rules);
    // 复尺补充记录（网格 textarea）100 行
    const notes = Array.from({ length: 100 }, (_, i) => `${i + 1}. 门洞 OK`).join('\n');
    const { atoms: a3 } = checkLong(longModel('measurement', (t, r) => { r.values.notes = notes; }), ['gridRow']);
    const g = a3.filter((a) => a.kind === 'gridRow' && a.cells[0].field.key === 'notes');
    assert.ok(g.length >= 2 && g.slice(1).every((a) => a.cells[0].cont));
    assert.equal(g.map((a) => a.cells[0].field.value).join('\n'), notes);
    // 网格里很长的单行字段 → 独占一行再切
    const addr = longText(3000);
    const { atoms: a4 } = checkLong(longModel('pre-install', (t, r) => { r.values.address = addr; }), ['gridRow']);
    const ad = a4.filter((a) => a.kind === 'gridRow' && a.cells.some((c) => c.field.key === 'address'));
    assert.ok(ad.length >= 2 && ad.every((a) => a.cells.length === 1));
    assert.equal(ad.map((a) => a.cells[0].field.value).join(''), addr);
    // 单条超长的列表项：切开，续上的半条不画圆点
    const huge = longText(5000);
    const b = { type: 'fields', id: 'f', layout: 'list', columns: 1, fields: [{ key: 'l', label: { zh: '列表' }, kind: 'list', lines: ['第一条', huge, '最后一条'], value: '', span: 1 }] };
    const { atoms: a5 } = checkLong({ meta: {}, blocks: [b] }, ['listRow']);
    const rows = a5.filter((a) => a.kind === 'listRow');
    assert.ok(rows.length >= 3);
    // rows[0] = 第一条；rows[1] = 超长那条的开头（画圆点）；之后都是它的后半截（不画圆点）
    assert.ok(!rows[0].cells[0].contLine && !rows[1].cells[0].contLine && rows.slice(2).every((a) => a.cells[0].contLine));
    const flat = rows.flatMap((a) => a.cells[0].lines);
    assert.equal(flat[0], '第一条');
    assert.equal(flat.slice(1, -1).join(''), huge);
    assert.equal(flat[flat.length - 1], '最后一条');
  }],
  ['统计值很长（复尺「待处理」逐条带备注）：拆成卡片 / 长值续块 / 结论', () => {
    const m = longModel('measurement', (t, r) => {
      const items = t.sections.filter((s) => s.type === 'checklist').flatMap((s) => s.items).slice(0, 6);
      for (const it of items) r.items[it.id] = { r: 'N', note: longText(600) };
    });
    const sum = m.blocks.find((b) => b.type === 'summary');
    const longVal = sum.items.find((it) => String(it.value).length > 1000).value;
    const { atoms } = checkLong(m, ['summary']);
    const parts = atoms.filter((a) => a.kind === 'summary');
    assert.equal(parts[0].part, 'cards');
    const longs = parts.filter((a) => a.part === 'long');
    assert.ok(longs.length >= 2 && !longs[0].cont && longs.slice(1).every((a) => a.cont));
    assert.equal(longs.map((a) => a.item.value).join(''), longVal);
    assert.ok(parts.every((a) => a.block === sum), '拆开后仍指向同一个统计块');
    // 普通报告：统计仍是一个原子
    const { atoms: a2 } = buildAtoms(model(byId('measurement'), 'full'));
    assert.equal(a2.filter((a) => a.kind === 'summary').length, 1);
  }],
  ['实测仍超页：fit 缩小切块；overTall 计入续页表头', () => {
    const note = longText(1225);
    const m = longModel('quality-check', (t, r) => { r.items[firstItem(t).id] = { r: 'F', note }; });
    const base = buildAtoms(m).atoms.filter((a) => a.kind === 'clRow' && a.row.remark);
    const key = base[0].fit;
    assert.ok(key && base.every((a) => a.fit === key), '长备注的每一段都要带同一个 fit key');
    const tight = buildAtoms(m, { fit: { [key]: 0.3 } }).atoms.filter((a) => a.kind === 'clRow' && a.row.remark);
    assert.ok(tight.length > base.length * 2, `fit 0.3 没有切得更小：${base.length} → ${tight.length}`);
    assert.equal(tight.map((a) => a.row.remark).join(''), note);
    // 不影响别的行
    const other = (atoms) => atoms.filter((a) => a.kind === 'clRow' && a.fit !== key).length;
    assert.equal(other(buildAtoms(m, { fit: { [key]: 0.3 } }).atoms), other(buildAtoms(m).atoms));
    // 普通报告：一个都不切
    for (const t of templates) {
      const { atoms } = buildAtoms(model(t, 'full'));
      assert.ok(!atoms.some((a) => a.cont || (a.kind === 'gridRow' && a.cells.some((c) => c.cont))), `${t.id}: 普通报告不该切续块`);
    }
    const atoms = [{ kind: 'header' }, { kind: 'clRow', group: 'g' }, { kind: 'note' }];
    assert.deepEqual(overTall(atoms, [100, CONT_AVAIL - 40, CONT_AVAIL + 1], { g: 50 }).map((o) => o.i), [1, 2]);
    assert.equal(overTall(atoms, [100, CONT_AVAIL - 40, 10], { g: 50 })[0].room, CONT_AVAIL - 50);
  }],
  ['文档媒体：没抓到封面的视频不拿视频文件当图片；0 字节照片当缺失', async () => {
    const media = sampleMedia();
    const poster = media.get('m_photo3').blob;
    media.set('v_np', { id: 'v_np', kind: 'video', blob: new Blob([new Uint8Array(64)], { type: 'video/mp4' }), thumb: null, poster: null, w: 640, h: 360 });
    media.set('v_ok', { id: 'v_ok', kind: 'video', blob: new Blob([new Uint8Array(64)], { type: 'video/mp4' }), thumb: poster, poster, w: 640, h: 360 });
    media.set('p_zero', { id: 'p_zero', kind: 'photo', blob: new Blob([], { type: 'image/jpeg' }), thumb: new Blob([], { type: 'image/jpeg' }), w: 10, h: 10 });
    media.set('p_thumb', { id: 'p_thumb', kind: 'photo', blob: new Blob([], { type: 'image/jpeg' }), thumb: poster, w: 10, h: 10 });
    const type = (u) => (u ? resolveObjectURL(u)?.type : null);
    // db.js 的加载器（get 换成内存表，url() 逻辑不变）
    const loader = createMediaLoader();
    loader.get = async (id) => media.get(id) || null;
    for (const which of ['blob', 'thumb', 'poster']) {
      assert.equal(await loader.url('v_np', which), null, `url(v_np, ${which}) 不能给视频文件`);
      assert.equal(type(await loader.url('v_ok', which)), 'image/jpeg', `url(v_ok, ${which}) 应给封面`);
      assert.equal(await loader.url('p_zero', which), null, `url(p_zero, ${which}) 0 字节应当作没有`);
    }
    assert.equal(type(await loader.url('p_thumb', 'blob')), 'image/jpeg', '原图 0 字节时用缩略图');
    loader.dispose();
    // 渲染用的 URL 池：get() 有记录 / 只有 url() 两种加载器都一样
    const m = { blocks: [{ type: 'checklist', rows: [{ photos: ['v_np', 'v_ok', 'p_zero', 'p_thumb', 'm_photo1'].map((id) => ({ id, kind: 'photo' })) }] }] };
    const urlOnly = { url: loader.url, get: async () => null };
    const real = createMediaLoader();
    real.get = async (id) => media.get(id) || null;
    urlOnly.url = (id, which) => real.url(id, which);
    for (const [name, l] of [['get', { get: async (id) => media.get(id) || null }], ['db', real], ['url-only', urlOnly]]) {
      for (const quality of ['full', 'thumb']) {
        const pool = createUrlPool(l, { quality });
        const { urls, info } = await pool.load(m);
        assert.equal(urls.v_np, undefined, `${name}/${quality}: 没封面的视频应显示占位`);
        assert.equal(urls.p_zero, undefined, `${name}/${quality}: 0 字节照片应显示「缺失」`);
        assert.equal(type(urls.v_ok), 'image/jpeg', `${name}/${quality}: 视频应用封面`);
        assert.equal(type(urls.p_thumb), 'image/jpeg', `${name}/${quality}`);
        assert.equal(type(urls.m_photo1), 'image/jpeg', `${name}/${quality}`);
        if (name !== 'url-only') assert.equal(info.v_np.kind, 'video');
        pool.release();
      }
    }
    real.dispose();
  }],
];
