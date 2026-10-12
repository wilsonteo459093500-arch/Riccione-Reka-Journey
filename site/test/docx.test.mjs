// Word 导出测试：每个已存在的模板 × full / empty → buildDocModel → exportDocx
// 检查：Blob 大小 / MIME、zip 结构、中文标题、照片数量、OOXML 结构（避免 Word「修复」提示）。
// 输出写到 test/out/<id>-<variant>.docx，可用 Word / LibreOffice 打开目检。
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { fillReport, mediaLoader, sampleMedia, SAMPLE_PROJECT, SAMPLE_SETTINGS } from './fixtures.mjs';
import { buildDocModel } from '../src/lib/docmodel.js';
import { exportDocx, DOCX_MIME } from '../src/lib/export/docx.js';
import { createReport, reportTitle } from '../src/lib/report.js';
import { resolveScale, normOptions } from '../src/templates/schema.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..');
const OUT = join(DIR, 'out');
const LOGO = readFileSync(join(ROOT, 'public', 'sail-logo.png'));

// 模板逐个按路径导入（templates/index.js 要等 7 个都写好才能导入）
const TEMPLATE_FILES = ['qualityCheck', 'finalInspection', 'handover', 'measurement', 'preInstall', 'siteNotice', 'dailyReport'];

async function loadTemplate(name) {
  const file = join(ROOT, 'src', 'templates', `${name}.js`);
  if (!existsSync(file)) return null; // 还没写好的模板跳过
  return (await import(pathToFileURL(file).href)).default;
}

// ---------- 极简 zip 读取（node:zlib，无第三方依赖） ----------
function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  assert.ok(eocd >= 0, 'zip: 找不到中央目录');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i += 1) {
    assert.equal(buf.readUInt32LE(off), 0x02014b50, 'zip: 中央目录损坏');
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    files.set(name, method === 8 ? inflateRawSync(raw) : Buffer.from(raw));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const text = (files, name) => files.get(name)?.toString('utf8') ?? '';

// ---------- OOXML 结构检查 ----------
// Word 对这些问题会弹「内容有问题，是否修复」：
// 行内格数与网格列数不符、单元格以表格结尾、两张表紧挨着、空行、非法控制字符、表宽与列宽和不一致。
function checkOoxml(xml, where) {
  const errs = [];
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xml)) errs.push('含 XML 非法控制字符');
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(xml) || /(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(xml)) errs.push('含落单代理项');
  if (/<\/w:tbl>\s*<w:tbl>/.test(xml)) errs.push('两张表紧挨着（会被 Word 合并）');
  if (/<\/w:tbl>\s*<\/w:tc>/.test(xml)) errs.push('单元格以表格结尾（缺结尾段落）');
  if (/<w:tc>\s*(<w:tcPr>(?:(?!<\/w:tcPr>).)*<\/w:tcPr>)?\s*<\/w:tc>/s.test(xml)) errs.push('空单元格（没有段落）');
  if (/<w:tr\b[^>]*>\s*(<w:trPr>(?:(?!<\/w:trPr>).)*<\/w:trPr>)?\s*(<w:tblPrEx>.*?<\/w:tblPrEx>)?\s*<\/w:tr>/s.test(xml)) errs.push('空表格行');

  // 标签配对（简易 well-formed 检查）
  const tagRe = /<(\/?)([A-Za-z][\w.:-]*)(?:\s[^>]*?)?(\/?)>/g;
  const open = [];
  let tm;
  while ((tm = tagRe.exec(xml))) {
    const [, close, name, self] = tm;
    if (self) continue;
    if (!close) open.push(name);
    else if (open.pop() !== name) {
      errs.push(`标签不配对：</${name}>`);
      break;
    }
  }
  if (open.length) errs.push(`标签未闭合：<${open[open.length - 1]}>`);

  const re =/<(\/?)w:(tbl|tr|tc|gridCol|gridSpan|tblW)\b([^>]*?)\/?>/g;
  const stack = [];
  let m;
  let tables = 0;
  while ((m = re.exec(xml))) {
    const [, close, tag, attrs] = m;
    if (tag === 'tbl') {
      if (close) {
        const t = stack.pop();
        if (!t.grid.length) errs.push('表格没有 tblGrid');
        const gsum = t.grid.reduce((s, x) => s + x, 0);
        if (t.tblW != null && Math.abs(gsum - t.tblW) > 1) errs.push(`表宽 ${t.tblW} ≠ 列宽和 ${gsum}`);
        if (!t.rows) errs.push('表格没有行');
      } else {
        tables += 1;
        stack.push({ grid: [], tblW: null, row: null, rows: 0 });
      }
      continue;
    }
    const t = stack[stack.length - 1];
    if (!t) continue;
    if (tag === 'tblW' && t.tblW == null && /w:type="dxa"/.test(attrs)) t.tblW = Number(/w:w="(\d+)"/.exec(attrs)?.[1]);
    else if (tag === 'gridCol') t.grid.push(Number(/w:w="(\d+)"/.exec(attrs)?.[1] || 0));
    else if (tag === 'tr') {
      if (close) {
        if (!t.row.cells) errs.push('行里没有单元格');
        else if (t.row.span !== t.grid.length) errs.push(`行跨 ${t.row.span} 列 ≠ 网格 ${t.grid.length} 列`);
        t.row = null;
      } else {
        t.rows += 1;
        t.row = { span: 0, cells: 0 };
      }
    } else if (tag === 'tc' && !close && t.row) {
      t.row.cells += 1;
      t.row.span += 1;
    } else if (tag === 'gridSpan' && t.row) {
      t.row.span += Number(/w:val="(\d+)"/.exec(attrs)?.[1] || 1) - 1;
    }
  }
  if (stack.length) errs.push('w:tbl 标签未闭合');
  assert.deepEqual([...new Set(errs)], [], `${where}: ${[...new Set(errs)].join('；')}`);
  return { tables };
}

/** 关系文件里引用的每个内部部件都必须存在 */
function checkRels(files) {
  for (const [name, buf] of files) {
    if (!name.endsWith('.rels')) continue;
    const base = name.replace(/_rels\/[^/]*\.rels$/, '');
    for (const m of buf.toString('utf8').matchAll(/<Relationship\b([^>]*)\/>/g)) {
      const attrs = m[1];
      if (/TargetMode="External"/.test(attrs)) continue;
      const target = /Target="([^"]+)"/.exec(attrs)[1];
      const path = target.startsWith('/') ? target.slice(1) : join(base, target).replace(/\\/g, '/');
      assert.ok(files.has(path), `${name} 引用了不存在的 ${path}`);
    }
  }
}

/** 文档模型里应出现的图片位置数（照片 / 视频封面 / 签名），用来核对没有丢图 */
function expectedPictures(model, media) {
  const ok = (r) => r && r.id && media.has(r.id);
  let n = 0;
  for (const b of model.blocks) {
    if (b.type === 'fields') for (const f of b.fields) n += (f.photos || []).filter(ok).length + (ok(f.video) ? 1 : 0);
    if (b.type === 'checklist') for (const r of b.rows) n += r.photos.filter(ok).length;
    if (b.type === 'table') for (const r of b.rows) n += r.photos.filter(ok).length;
    if (b.type === 'signatures') for (const r of b.roles) n += ok(r.image) ? 1 : 0;
  }
  return n;
}

const count = (s, re) => (s.match(re) || []).length;

async function exportAndOpen(template, variant, { loader, logo = LOGO, mutate, lang } = {}) {
  const report = fillReport(template, variant);
  if (mutate) mutate(report);
  const model = buildDocModel({ template, report, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS, lang });
  const media = sampleMedia();
  const blob = await exportDocx(model, loader === undefined ? mediaLoader(media) : loader, { logo });
  assert.ok(blob instanceof Blob, '返回值应是 Blob');
  assert.equal(blob.type, DOCX_MIME);
  const buf = Buffer.from(await blob.arrayBuffer());
  const files = unzip(buf);
  return { model, media, blob, buf, files, doc: text(files, 'word/document.xml') };
}

function checkPackage(files, where) {
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml']) {
    assert.ok(files.has(part), `${where}: 缺少 ${part}`);
  }
  checkRels(files);
  for (const [name, b] of files) {
    if (/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) checkOoxml(b.toString('utf8'), `${where} ${name}`);
  }
  const ct = text(files, '[Content_Types].xml');
  assert.match(ct, /Extension="jpg"/);
  assert.match(ct, /Extension="png"/);
  // 页脚：第 X / Y 页
  const footers = [...files.keys()].filter((n) => /^word\/footer\d*\.xml$/.test(n)).map((n) => text(files, n));
  assert.ok(footers.length >= 1, `${where}: 没有页脚`);
  for (const f of footers) {
    assert.match(f, /PAGE/);
    assert.match(f, /NUMPAGES/);
  }
  // 默认字体：Arial + 微软雅黑（含 eastAsia）
  assert.match(text(files, 'word/styles.xml'), /w:eastAsia="Microsoft YaHei"/);
}

const tests = [];
mkdirSync(OUT, { recursive: true });

for (const name of TEMPLATE_FILES) {
  const template = await loadTemplate(name);
  if (!template) continue;
  const title = (template.doc?.title || template.name).zh;

  tests.push([
    `${template.id} full → docx（照片齐全、结构合法）`,
    async () => {
      const { model, media, blob, buf, files, doc } = await exportAndOpen(template, 'full');
      writeFileSync(join(OUT, `${template.id}-full.docx`), buf);
      assert.ok(blob.size > 10 * 1024, `文件太小：${blob.size}`);
      checkPackage(files, `${template.id}-full`);
      assert.ok(doc.includes(title), `document.xml 里没有中文标题「${title}」`);
      const mediaFiles = [...files.keys()].filter((n) => n.startsWith('word/media/'));
      assert.ok(mediaFiles.length >= 2, `word/media 应有 logo + 照片，实际 ${mediaFiles.length}`);
      const want = expectedPictures(model, media);
      assert.ok(want > 0, '夹具应带照片');
      // 正文图片 = 文档模型里的全部图片位置 + 抬头 logo
      assert.equal(count(doc, /<pic:pic\b/g), want + 1, '正文图片数与文档模型不符（有照片被丢掉？）');
      // 页眉（第 2 页起）带小 logo
      const headers = [...files.keys()].filter((n) => /^word\/header\d*\.xml$/.test(n)).map((n) => text(files, n));
      assert.ok(headers.some((h) => /<pic:pic\b/.test(h)), '第 2 页起的页眉应有 logo');
      // 检查表：表头跨页重复、行不拆分
      if (model.blocks.some((b) => b.type === 'checklist' || b.type === 'table')) {
        assert.match(doc, /<w:tblHeader\/>/);
        assert.match(doc, /<w:cantSplit\/>/);
      }
      // 视频：封面 + 「▶ 视频（0:42）请见群组」
      const hasVideo = model.blocks.some((b) => b.type === 'fields' && b.fields.some((f) => f.kind === 'video' && f.video));
      if (hasVideo) assert.ok(doc.includes('视频（0:42）请见群组'), '视频说明缺失');
    },
  ]);

  tests.push([
    `${template.id} empty → docx（空白表也能导出）`,
    async () => {
      const { blob, buf, files, doc } = await exportAndOpen(template, 'empty');
      writeFileSync(join(OUT, `${template.id}-empty.docx`), buf);
      assert.ok(blob.size > 10 * 1024, `文件太小：${blob.size}`);
      checkPackage(files, `${template.id}-empty`);
      assert.ok(doc.includes(title), `document.xml 里没有中文标题「${title}」`);
      assert.equal(count(doc, /<pic:pic\b/g), 1, '空白报告正文只应有 logo');
    },
  ]);
}

// ---------- 健壮性 ----------
const qc = await loadTemplate('qualityCheck');

tests.push([
  '媒体读不到（get 返回 null）→ 跳过，不报错',
  async () => {
    const { files, doc } = await exportAndOpen(qc, 'full', { loader: { get: async () => null } });
    checkPackage(files, 'missing-media');
    assert.equal(count(doc, /<pic:pic\b/g), 1, '只剩 logo');
  },
]);

tests.push([
  '媒体出错（get 抛错 / 非图片 / 空 blob / webp）→ 跳过，不报错',
  async () => {
    const real = sampleMedia();
    const loader = {
      get: async (id) => {
        if (id === 'm_photo1') throw new Error('boom');
        if (id === 'm_photo2') return { id, kind: 'photo', blob: new Blob([new Uint8Array(0)]), thumb: null, w: 800, h: 600 };
        if (id === 'm_photo3') return { id, kind: 'photo', blob: new Blob([Buffer.from('RIFF0000WEBPVP8 ' + 'x'.repeat(64))], { type: 'image/webp' }), w: 800, h: 600 };
        if (id === 'm_photo4') return { id, kind: 'photo', blob: new Blob(['not an image at all, just text'.repeat(4)]), w: 0, h: 0 };
        // 原图坏了但缩略图可用 → 用缩略图
        if (id === 'm_photo5') return { ...real.get(id), blob: new Blob([new Uint8Array(40)]) };
        // 视频没有封面 → 只写文字
        if (id === 'm_video') return { ...real.get(id), poster: null, thumb: null };
        return real.get(id) || null;
      },
    };
    for (const name of ['qualityCheck', 'dailyReport', 'finalInspection']) {
      const t = await loadTemplate(name);
      if (!t) continue;
      const { files, doc } = await exportAndOpen(t, 'full', { loader });
      checkPackage(files, `bad-media ${name}`);
      assert.ok(count(doc, /<pic:pic\b/g) >= 1);
      if (name === 'dailyReport') assert.ok(doc.includes('视频（0:42）请见群组'), '无封面视频也要写说明');
    }
  },
]);

tests.push([
  '没有 logo / 没有媒体加载器 → 仍可导出',
  async () => {
    const { files, doc, blob } = await exportAndOpen(qc, 'full', { loader: null, logo: null });
    checkPackage(files, 'no-logo');
    assert.ok(blob.size > 5 * 1024);
    assert.equal(count(doc, /<pic:pic\b/g), 0);
    assert.ok(doc.includes('溪岸 Sail by Riccione Reka'), '无 logo 时抬头写公司名');
  },
]);

tests.push([
  'logo 支持 Blob / Uint8Array / ArrayBuffer',
  async () => {
    const ab = LOGO.buffer.slice(LOGO.byteOffset, LOGO.byteOffset + LOGO.byteLength);
    for (const logo of [new Blob([LOGO], { type: 'image/png' }), new Uint8Array(LOGO), ab]) {
      const { doc } = await exportAndOpen(qc, 'empty', { logo });
      assert.equal(count(doc, /<pic:pic\b/g), 1);
    }
  },
]);

tests.push([
  '特殊字符（控制字符 / 落单代理项 / & < > / emoji / 超长文字）→ XML 合法',
  async () => {
    const nasty = 'A&B <tag> "引号" \u0001\u0008\u000B 尾\uD800巴 😀 ' + '很长的备注'.repeat(80) + ' https://example.com/' + 'x'.repeat(200);
    const { files, doc } = await exportAndOpen(qc, 'full', {
      mutate(r) {
        const first = Object.keys(r.items)[0];
        r.items[first].note = nasty;
        r.values.installer = nasty;
        r.values.project = `Tuai & Timur <17-3>\u0002`;
      },
    });
    checkPackage(files, 'nasty');
    assert.ok(doc.includes('A&amp;B &lt;tag&gt;'), '& < > 应被转义');
    assert.ok(doc.includes('😀'), 'emoji 应保留');
    assert.ok(!doc.includes('\uD800巴'), '落单代理项应被删掉');
  },
]);

// ---------- 长内容：行可跨页 ----------
/** document.xml 里每个 <w:tr>（含嵌套表）→ { cant: 本行 trPr 有 cantSplit, text } */
function rowsOf(xml) {
  const out = [];
  const st = [];
  for (const m of xml.matchAll(/<w:tr\b[^>]*>|<\/w:tr>/g)) {
    if (m[0] !== '</w:tr>') {
      st.push(m.index + m[0].length);
      continue;
    }
    const body = xml.slice(st.pop(), m.index);
    const own = /^\s*(?:<w:tblPrEx>.*?<\/w:tblPrEx>)?\s*<w:trPr>(.*?)<\/w:trPr>/s.exec(body);
    const t = [...body.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((x) => x[1]).join('');
    out.push({ cant: !!own && /<w:cantSplit\/>/.test(own[1]), text: t });
  }
  return out;
}

const longText = (n) => '现场检查发现柜门铰链松动需要重新调整并复检确认安装位置正确。'.repeat(Math.ceil(n / 30)).slice(0, n) + '【END】';
const firstItem = (t, pred = (it) => !it.input) => t.sections.filter((s) => s.type === 'checklist').flatMap((s) => s.items).find(pred);

tests.push([
  '长备注 / 长文本所在的行允许跨页（Word 会裁掉比一页还高的不可拆分行），短行仍不拆',
  async () => {
    const cases = [
      ['qualityCheck', '质检备注 1225 字', (t, r) => { r.items[firstItem(t).id] = { r: 'F', note: longText(1225) }; }],
      ['qualityCheck', '信息栏字段 1500 字', (t, r) => { r.values.installer = longText(1500); }],
      ['finalInspection', '整改描述 1800 字', (t, r) => { r.tables.rectification = [{ desc: longText(1800) }]; }],
      ['preInstall', '填写项 2400 字', (t, r) => { r.items[firstItem(t, (x) => x.input?.type === 'textarea').id] = { value: longText(2400) }; }],
      ['preInstall', '填写项 90 行', (t, r) => {
        r.items[firstItem(t, (x) => x.input?.type === 'textarea').id] = { value: Array.from({ length: 90 }, (_, i) => `${i + 1}. 已完成`).join('\n') + '\n【END】' };
      }],
      ['dailyReport', '今日内容 120 行短句', (t, r) => { r.values.todayWork = Array.from({ length: 120 }, (_, i) => `${i + 1}号柜OK`).join('\n') + '\n【END】'; }],
      ['siteNotice', '14 条长规定', (t, r) => {
        r.values.rules = Array.from({ length: 14 }, (_, i) => `第 ${i + 1} 条：` + '走廊、电梯、单位地面先铺保护垫再搬运；垃圾当天清走；'.repeat(8) + (i === 13 ? '【END】' : ''));
      }],
      ['handover', '打勾清单备注 1500 字', (t, r) => { r.items[firstItem(t).id] = { r: 'Y', note: longText(1500) }; }],
      ['measurement', '补充记录 3000 字', (t, r) => { r.values.notes = longText(3000); }],
      // 统计「待处理」会把 6 条备注原文列出来：统计块本身超过一页
      ['measurement', '6 条长备注（统计块）', (t, r) => {
        const its = t.sections.filter((s) => s.type === 'checklist').flatMap((s) => s.items.filter((i) => !i.input)).slice(0, 6);
        for (const it of its) r.items[it.id] = { r: 'N', note: longText(1500) };
      }],
    ];
    for (const [file, what, fill] of cases) {
      const t = await loadTemplate(file);
      if (!t) continue;
      const { files, doc } = await exportAndOpen(t, 'empty', {
        mutate(r) {
          r.items = r.items || {};
          r.tables = r.tables || {};
          r.values = r.values || {};
          fill(t, r);
        },
      });
      checkPackage(files, `long ${file} ${what}`);
      const rows = rowsOf(doc);
      const hold = rows.filter((x) => x.text.includes('【END】'));
      assert.ok(hold.length >= 1, `${what}：document.xml 里找不到长文字`);
      assert.deepEqual(hold.filter((x) => x.cant).length, 0, `${what}：长文字所在的行（含外层）不应设 cantSplit`);
      // 其余短行（空白报告里没有 > 8 张照片的行）保持不拆
      const loose = rows.filter((x) => !x.cant && !x.text.includes('【END】'));
      assert.deepEqual(loose.map((x) => x.text.slice(0, 40)), [], `${what}：短行应保持 cantSplit`);
    }
  },
]);

tests.push([
  '有条件开工（warn）用琥珀色，与 NO-GO（fail）区分',
  async () => {
    const t = await loadTemplate('preInstall');
    if (!t) return;
    const items = t.sections.filter((s) => s.type === 'checklist' && s.id !== 'decision').flatMap((s) => s.items.filter((i) => !i.input));
    const box = async (failKey) => {
      const { model, doc } = await exportAndOpen(t, 'full', {
        mutate(r) {
          for (const it of items) r.items[it.id] = { r: 'P' };
          r.items[items.find((i) => !!i.key === failKey).id] = { r: 'F', note: '异常' };
        },
      });
      const c = model.blocks.find((b) => b.type === 'summary').conclusion;
      const at = doc.indexOf(`>${c.value}<`);
      assert.ok(at > 0, `找不到结论「${c.value}」`);
      const tcPr = doc.slice(doc.lastIndexOf('<w:tc>', at), at);
      return { tone: c.tone, fill: /w:fill="([0-9A-F]{6})"/.exec(tcPr)?.[1], bar: /<w:left [^>]*w:color="([0-9A-F]{6})"/.exec(tcPr)?.[1] };
    };
    const cond = await box(false);
    const nogo = await box(true);
    assert.equal(cond.tone, 'warn');
    assert.equal(nogo.tone, 'fail');
    // 与 PDF（components/doc/theme.js）的 warn 一致
    assert.deepEqual({ fill: cond.fill, bar: cond.bar }, { fill: 'FBF3E1', bar: 'B7791F' });
    assert.deepEqual({ fill: nogo.fill, bar: nogo.bar }, { fill: 'F8E5E0', bar: 'B8452F' });
  },
]);

tests.push([
  '模型缺字段（无 blocks / 空 meta）→ 不抛错',
  async () => {
    const blob = await exportDocx({ meta: {}, blocks: [] }, null);
    const files = unzip(Buffer.from(await blob.arrayBuffer()));
    checkPackage(files, 'bare');
    const blob2 = await exportDocx(
      {
        meta: { title: { zh: '测试' }, brand: 'plain', accent: 'not-a-color' },
        blocks: [
          { type: 'checklist', id: 'x', title: { zh: '空检查表' }, options: [], rows: [], counts: { total: 0, key: 0 } },
          { type: 'table', id: 't', title: { zh: '空表' }, columns: [{ key: 'a', label: 'A', width: 1 }], rows: [], empty: true, emptyText: { zh: '无', en: 'None' } },
          { type: 'summary', title: { zh: '统计' }, items: [], conclusion: '结论文字' },
          { type: 'signatures', id: 's', roles: [] },
          { type: 'note', id: 'n', lines: [] },
          { type: 'fields', id: 'f', layout: 'grid', columns: 3, fields: [] },
          { type: 'unknown-block' },
        ],
      },
      { get: async () => null },
    );
    const f2 = unzip(Buffer.from(await blob2.arrayBuffer()));
    checkPackage(f2, 'odd-blocks');
    assert.ok(text(f2, 'word/document.xml').includes('结论文字'));
  },
]);

// ============================================================
// 文件语言：中文 zh / English en / 中英 both
// ------------------------------------------------------------
// en：用户内容全用英文写的报告 → 整个 .docx（正文 / 页眉 / 页脚 / 文档属性 / 样式）没有一个中文字（logo 图片除外）
// zh：中文报告 → 没有固定标签的英文那一半（Remarks / Check Item / Page / Generated / Pass…）
// both：与以前逐字一样（上面的用例照旧 + 下面锁住双语写死的成对文字）
// ============================================================
const cp = (a, b) => `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}`;
const CJK_CLASS = `${cp(0x2e80, 0x9fff)}${cp(0xf900, 0xfaff)}${cp(0xfe30, 0xfe4f)}${cp(0xff00, 0xffef)}${cp(0x3000, 0x303f)}`;
const CJK = new RegExp(`[${CJK_CLASS}]`);
const CJK_RUNS = new RegExp(`[${CJK_CLASS}]+`, 'g');

export const EN_PROJECT = {
  id: 'p_en',
  name: 'Seri Maya Condo',
  client: 'Mr Tan',
  unit: 'B-12-3',
  address: 'Seri Maya Condo, Block B, 12-3, Jalan Seri Maya, 47100 Puchong',
  mapLink: 'https://maps.app.goo.gl/demo',
  so: 'SO-2026-1001',
  designer: 'Rachel Lim',
  startDate: '2026-10-08',
  plannedDays: 5,
  entryNote: 'Register at the guard house with IC',
  parking: 'Basement visitor bays',
};
export const EN_SETTINGS = { name: 'Jason Lee', phone: '012-3456789', dept: 'Installation Team', company: 'Sail by Riccione Reka', docLang: 'en' };

/** 按模板结构填一份「用户内容全英文」的报告（选项照常选，选项文字由模板 / 核心给英文） */
export function englishReport(template, variant = 'full') {
  const report = createReport(template, { project: EN_PROJECT, settings: EN_SETTINGS });
  report.lang = 'en';
  if (variant === 'empty') {
    // 空白报告：新建时带入的项目资料也按英文写（带入的工地称呼有全角括号，是核心 siteLabel 加的）
    for (const [k, v] of Object.entries(report.values)) if (typeof v === 'string' && CJK.test(v)) report.values[k] = 'Seri Maya Condo B-12-3 (Mr Tan)';
    for (const [k, v] of Object.entries(report.values)) if (Array.isArray(v) && v.some((x) => CJK.test(String(x)))) report.values[k] = ['Lay floor protection first'];
    return report;
  }
  let n = 0;
  const photo = () => `m_photo${(n++ % 7) + 1}`;
  const textFor = (f) => {
    const t = f.type;
    if (t === 'date') return '2026-10-09';
    if (t === 'time') return '09:00';
    if (t === 'number') return 3;
    if (t === 'tel') return '012-3456789';
    if (t === 'url') return 'https://drive.google.com/drive/folders/demo';
    if (t === 'yesno') return 'Y';
    if (t === 'list') return ['Lay floor protection first', 'Clear rubbish daily'];
    if (t === 'textarea') return 'Shoe cabinet and wardrobe carcasses installed.\nSite cleaned, protection intact.';
    if (['select', 'radio'].includes(t)) return normOptions(f.options)[0]?.v ?? '';
    if (t === 'chips') {
      const opts = normOptions(f.options).map((o) => o.v);
      return f.multiple ? [...opts.slice(0, 2), 'Balcony cabinet'] : opts[0];
    }
    return `Sample ${f.key}`;
  };
  for (const s of template.sections) {
    if (s.type === 'fields') {
      for (const f of s.fields) {
        if (f.type === 'photos') report.values[f.key] = [photo(), photo()];
        else if (f.type === 'video') report.values[f.key] = 'm_video';
        else report.values[f.key] = textFor(f);
      }
    }
    if (s.type === 'checklist') {
      s.items.forEach((it, idx) => {
        if (it.input) {
          report.items[it.id] = { value: textFor(it.input), photos: idx % 3 === 0 ? [photo()] : [] };
          return;
        }
        const opts = resolveScale(it.scale || s.scale).options;
        const r = opts.length > 1 && idx % 4 === 3 ? opts[1].v : opts[0].v;
        report.items[it.id] = { r, note: idx % 4 === 3 ? 'Gap 3mm too wide, adjusted on site' : idx % 5 === 0 ? 'Checked against drawing' : '', photos: idx % 3 === 0 ? [photo()] : [] };
      });
    }
    if (s.type === 'table') {
      report.tables[s.id] = [0, 1].map((i) => {
        const row = { photos: i === 0 ? [photo()] : [] };
        for (const slot of s.photoSlots || []) row[slot.key] = [photo()];
        for (const c of s.columns) {
          if (['select', 'radio', 'chips'].includes(c.type)) row[c.key] = normOptions(c.options)[i]?.v ?? '';
          else if (c.type === 'date') row[c.key] = `2026-10-1${i}`;
          else row[c.key] = `Kitchen wall cabinet ${i + 1}`;
        }
        return row;
      });
    }
    if (s.type === 'signatures') {
      s.roles.forEach((r, i) => {
        report.signatures[r.id] = { name: ['Ahmad', 'Jason Lee', 'Rachel Lim'][i % 3], date: '2026-10-09', image: i < 2 ? 'm_sig' : null };
      });
    }
  }
  return report;
}

/** 媒体库：图说也按英文写（图说是用户内容） */
export function englishMedia() {
  const m = sampleMedia();
  for (const x of m.values()) if (x.caption) x.caption = `Site photo ${x.id.slice(-1)}`;
  return m;
}

/** 包里所有文字部件（XML / rels；图片除外） */
const xmlParts = (files) => [...files].filter(([n]) => !n.startsWith('word/media/')).map(([n, b]) => [n, b.toString('utf8')]);
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** 正文 / 页眉 / 页脚里每个段落显示的文字 */
function paraTexts(files) {
  const out = [];
  for (const [name, xml] of xmlParts(files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) continue;
    for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []) {
      out.push(unesc([...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((x) => x[1]).join('')));
    }
  }
  return out;
}

/** 文档模型里显示的字符串（zhOnly / enOnly 是单语覆盖的原料，不直接显示；媒体 id 等除外） */
function modelStrings(node, out = []) {
  if (node == null) return out;
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((x) => modelStrings(x, out));
  else if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (['zhOnly', 'enOnly', 'id', 'key', 'templateId', 'generatedAt', 'accent', 'filename'].includes(k)) continue;
      modelStrings(v, out);
    }
  }
  return out;
}

/** 模型里所有带英文的 { zh, en } 标签的英文半边 */
function enHalves(node, out = new Set()) {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) node.forEach((x) => enHalves(x, out));
  else {
    if (typeof node.en === 'string' && node.en.trim() && typeof node.zh === 'string' && node.zh.trim()) out.add(node.en.trim());
    for (const v of Object.values(node)) enHalves(v, out);
  }
  return out;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w) => new RegExp(`${/^[A-Za-z0-9]/.test(w) ? '\\b' : ''}${esc(w)}${/[A-Za-z0-9]$/.test(w) ? '\\b' : ''}`);

/**
 * docx 里的中文：每段连续中文都必须出自 excused（核心 / 模板还没按语言规整的模型文字）；
 * excused 为空 = 一个中文字都不许有。返回漏出来的位置。
 */
function cjkLeaks(files, excused = []) {
  const out = [];
  for (const [name, xml] of xmlParts(files)) {
    for (const m of xml.matchAll(CJK_RUNS)) {
      if (!excused.some((s) => s.includes(m[0]))) out.push(`${name}: …${xml.slice(Math.max(0, m.index - 60), m.index + m[0].length + 20)}…`);
    }
  }
  return out;
}

/** 模型里还带中文的字符串（en 文件里本该是英文；等核心 / 模板规整好后应为空） */
const modelCJK = (model) => [...new Set(modelStrings(model).filter((s) => CJK.test(s)))];

/** 把模型里所有带中文的字符串换成英文占位：模拟核心已规整完，只考渲染器自己写死的文字 */
function stripCJK(node) {
  if (typeof node === 'string') return CJK.test(node) ? 'Sample text' : node;
  if (Array.isArray(node)) return node.map(stripCJK);
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, stripCJK(v)]));
  return node;
}

async function openDocx(model, media, logo = LOGO) {
  const blob = await exportDocx(model, mediaLoader(media), { logo });
  assert.equal(blob.type, DOCX_MIME);
  const buf = Buffer.from(await blob.arrayBuffer());
  const files = unzip(buf);
  return { buf, files, doc: text(files, 'word/document.xml') };
}

const footersOf = (files) => [...files.keys()].filter((n) => /^word\/footer\d*\.xml$/.test(n)).map((n) => text(files, n));
const headersOf = (files) => [...files.keys()].filter((n) => /^word\/header\d*\.xml$/.test(n)).map((n) => text(files, n));

/** 含 text 的那个 run 的 rPr（看主行 / 副行样式） */
function runProps(xml, t) {
  const at = xml.indexOf(`>${t}</w:t>`);
  assert.ok(at > 0, `找不到 run「${t}」`);
  const start = xml.lastIndexOf('<w:r>', at);
  return xml.slice(start, at);
}

const CORE_GAPS = new Map(); // 模板 → 核心还没规整的中文（只打印一次）
function noteGaps(id, gaps) {
  if (!gaps.length || CORE_GAPS.has(id)) return;
  CORE_GAPS.set(id, gaps);
  console.log(`    （${id} en：模型里还有 ${gaps.length} 段中文，属于核心 / 模板的语言规整，不算 Word 渲染器的：${gaps.slice(0, 3).map((s) => `「${s.slice(0, 24)}」`).join(' ')}…）`);
}

/** 中文文件里不该出现的、渲染器写死的英文半边 */
const ZH_FORBIDDEN = ['Remarks', 'Remark', 'Check Item', 'Inspection Item', 'Item', 'Standard', 'Method', 'Result', 'Photos', 'Photo', 'PHOTO', 'Page', 'Generated', 'Signature', 'Name', 'Date', 'Conclusion', 'Summary', 'Pass', 'Fail', 'Yes', 'None', 'Video', 'shared', 'items', 'No.'];

for (const name of TEMPLATE_FILES) {
  const template = await loadTemplate(name);
  if (!template) continue;

  tests.push([
    `${template.id} en（英文内容）→ 整个 docx 没有中文`,
    async () => {
      for (const variant of ['full', 'empty']) {
        const report = englishReport(template, variant);
        const model = buildDocModel({ template, report, project: EN_PROJECT, settings: EN_SETTINGS, lang: 'en' });
        assert.equal(model.meta.lang, 'en');
        const media = englishMedia();
        const { buf, files, doc } = await openDocx(model, media);
        writeFileSync(join(OUT, `${template.id}-${variant}-en.docx`), buf);
        checkPackage(files, `${template.id}-${variant}-en`);
        // 核心 / 模板还没规整的中文（如整行的抬头小字）由它们负责；其余一个中文字都不许有。
        // 自动报告名（「模板中文名 · 项目（客户）· 日期」）由 Word 自己换成英文标题 + 半角括号，不算核心的
        const gaps = modelCJK({ ...model, meta: { ...model.meta, reportTitle: '' } });
        noteGaps(template.id, gaps);
        assert.deepEqual(cjkLeaks(files, gaps).slice(0, 5), [], `${template.id}-${variant} en：Word 渲染器漏出中文`);
        // 图片一张不少
        if (variant === 'full') assert.equal(count(doc, /<pic:pic\b/g), expectedPictures(model, media) + 1);
        // 英文标题 / 页码 / 生成行
        const title = (template.doc?.title || template.name).en;
        assert.ok(doc.includes(`>${unesc(title).replace(/&/g, '&amp;')}<`), `en 标题「${title}」`);
        for (const f of footersOf(files)) {
          assert.match(f, />Page </);
          assert.match(f, /> of </);
          assert.ok(!/第|页/.test(f), 'en 页脚不应有「第 / 页」');
        }
        assert.ok(paraTexts(files).some((p) => /^Installation Team · TORA Generated \d{4}-\d\d-\d\d \d\d:\d\d$/.test(p)), 'en 末行：部门 · TORA Generated 时间');
      }
    },
  ]);

  tests.push([
    `${template.id} en（核心已规整的模型）→ Word 渲染器自己一个中文字都不写`,
    async () => {
      // 中文夹具的 en 模型，把模型里残留的中文全换成英文占位：剩下的中文只可能是 docx.js 写死的
      for (const variant of ['full', 'empty']) {
        const model = stripCJK(buildDocModel({ template, report: fillReport(template, variant), project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS, lang: 'en' }));
        const { files } = await openDocx(model, englishMedia());
        assert.deepEqual(cjkLeaks(files).slice(0, 5), [], `${template.id}-${variant}：docx.js 写死的中文漏进 en 文件`);
        const { files: noLogo } = await openDocx(model, englishMedia(), null);
        assert.deepEqual(cjkLeaks(noLogo).slice(0, 5), [], `${template.id}-${variant}（无 logo）：抬头 / 页眉公司名应是英文`);
      }
    },
  ]);

  tests.push([
    `${template.id} zh → 没有固定标签的英文半边`,
    async () => {
      const report = fillReport(template, 'full');
      const zhModel = buildDocModel({ template, report, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS, lang: 'zh' });
      const both = buildDocModel({ template, report, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS, lang: 'both' });
      const media = sampleMedia();
      const { buf, files, doc } = await openDocx(zhModel, media);
      writeFileSync(join(OUT, `${template.id}-full-zh.docx`), buf);
      checkPackage(files, `${template.id}-zh`);
      assert.equal(count(doc, /<pic:pic\b/g), expectedPictures(zhModel, media) + 1, '图片一张不少');
      const title = (template.doc?.title || template.name).zh;
      assert.ok(doc.includes(title), `zh 标题「${title}」`);
      const paras = paraTexts(files);
      const all = paras.join('\n');
      // 模型里（中文文字 / 用户内容）本来就有的英文词不算（如「登记 Punch List」、整行图例还没换成 zhOnly 时的 Pass）
      const own = modelStrings(zhModel);
      const inModel = (w) => own.some((s) => wordRe(w).test(s));
      for (const w of ZH_FORBIDDEN) if (!inModel(w)) assert.ok(!wordRe(w).test(all), `zh 文件出现英文「${w}」：${paras.find((p) => wordRe(w).test(p))}`);
      // 模板标签的英文半边（双语模型里有的）一个都不该出现
      for (const en of enHalves(both)) {
        if (!/[A-Za-z]{2}/.test(en) || en.length < 3 || inModel(en)) continue;
        assert.ok(!wordRe(en).test(all), `zh 文件出现标签的英文半边「${en}」：${paras.find((p) => wordRe(en).test(p))}`);
      }
      for (const f of footersOf(files)) {
        assert.match(f, />第 </);
        assert.match(f, /> 页</);
      }
      assert.ok(paras.some((p) => /^安装部 · TORA 生成 \d{4}-\d\d-\d\d \d\d:\d\d$/.test(p)), 'zh 末行：部门 · TORA 生成 时间');
    },
  ]);

  tests.push([
    `${template.id} zh / en 版式：单语没有悬空的「·」、没有重复的标签`,
    async () => {
      for (const lang of ['zh', 'en']) {
        const report = lang === 'en' ? englishReport(template) : fillReport(template, 'full');
        const model = buildDocModel({ template, report, project: lang === 'en' ? EN_PROJECT : SAMPLE_PROJECT, settings: lang === 'en' ? EN_SETTINGS : SAMPLE_SETTINGS, lang });
        const { files, doc } = await openDocx(model, lang === 'en' ? englishMedia() : sampleMedia());
        const paras = paraTexts(files).map((p) => p.trim()).filter(Boolean);
        const dangling = paras.filter((p) => /^·|·$/.test(p) || /·\s*·/.test(p));
        assert.deepEqual(dangling, [], `${lang}：段落以「·」开头 / 结尾`);
        // 章节条「EN · 中文」的分隔 run 只在双语出现
        assert.ok(!doc.includes('>  ·  </w:t>'), `${lang}：章节条不应有「EN · 中文」分隔`);
      }
    },
  ]);
}

tests.push([
  'en：标签按主行排（粗体正文色），不排成灰色小字的副行；长英文大标题缩字号',
  async () => {
    const t = await loadTemplate('measurement');
    if (!t) return;
    const model = buildDocModel({ template: t, report: englishReport(t), project: EN_PROJECT, settings: EN_SETTINGS, lang: 'en' });
    const { doc } = await openDocx(model, englishMedia());
    // 大标题：粗体、墨色、字号缩到放得下（FINAL MEASUREMENT & CONFIRMATION CHECKLIST 在 20pt 放不下）
    const tp = runProps(doc, 'FINAL MEASUREMENT &amp; CONFIRMATION CHECKLIST');
    assert.match(tp, /<w:b\/>/);
    assert.match(tp, /<w:color w:val="2B2A27"\/>/);
    const sz = Number(/<w:sz w:val="(\d+)"/.exec(tp)[1]) / 2;
    assert.ok(sz >= 16 && sz < 20, `en 长标题字号 ${sz}pt`);
    // 信息栏标签：8pt 粗体（双语时英文是 6.5pt 灰色副行）
    const label = model.blocks.find((b) => b.type === 'fields').fields[0].label.en;
    const lp = runProps(doc, label);
    assert.match(lp, /<w:b\/>/);
    assert.match(lp, /<w:sz w:val="16"\/>/);
    // 检查表表头：7.5pt 粗体主行
    const cl = model.blocks.find((b) => b.type === 'checklist');
    const hp = runProps(doc, cl.options[0].en);
    assert.match(hp, /<w:b\/>/);
    assert.match(hp, /<w:sz w:val="15"\/>/);
    // 页眉标题：主行粗体
    const t2 = await loadTemplate('qualityCheck');
    const m2 = buildDocModel({ template: t2, report: englishReport(t2), project: EN_PROJECT, settings: EN_SETTINGS, lang: 'en' });
    const { files } = await openDocx(m2, englishMedia());
    assert.ok(headersOf(files).some((h) => /<w:b\/>[\s\S]{0,200}>INSTALLATION QUALITY CHECKLIST</.test(h)), '页眉英文标题应为主行');
  },
]);

tests.push([
  'zh / en / both 写死的成对文字：各自只出对应语言，双语与以前逐字一样',
  async () => {
    const handover = await loadTemplate('handover');
    const daily = await loadTemplate('dailyReport');
    const pre = await loadTemplate('preInstall');
    const mk = (t, lang, mutate) => {
      const r = fillReport(t, 'full');
      if (mutate) mutate(r);
      return buildDocModel({ template: t, report: r, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS, lang });
    };
    const withRemark = (t) => (r) => {
      const it = firstItem(t);
      r.items[it.id] = { ...(r.items[it.id] || {}), r: resolveScale(it.scale || t.sections.find((s) => s.items?.includes(it)).scale).options[0].v, note: 'Remark text' };
    };
    const texts = async (t, lang, mutate) => {
      const { files, doc } = await openDocx(mk(t, lang, mutate), sampleMedia());
      return { all: paraTexts(files).join('\n'), doc, footer: footersOf(files).join('\n') };
    };
    // 双语：照旧
    const hb = await texts(handover, 'both', withRemark(handover));
    for (const s of ['备注 Remarks：', 'TORA 生成 Generated', '照片 Photos · ']) assert.ok(hb.all.includes(s), `both 应有「${s}」`);
    assert.ok(/>第 <[\s\S]*> \/ <[\s\S]*> 页</.test(hb.footer), 'both 页码「第 X / Y 页」');
    const db = await texts(daily, 'both');
    assert.ok(db.all.includes('视频（0:42）请见群组'));
    const pb = await texts(pre, 'both');
    for (const s of ['【影像】', 'No.', '其中关键项', '签名 Signature', '姓名 Name：', '日期 Date：']) assert.ok(pb.all.includes(s), `both 应有「${s}」`);
    // 中文
    const hz = await texts(handover, 'zh', withRemark(handover));
    for (const s of ['备注：', 'TORA 生成 2', '照片 · ']) assert.ok(hz.all.includes(s), `zh 应有「${s}」`);
    const dz = await texts(daily, 'zh');
    assert.ok(dz.all.includes('视频（0:42）请见群组'));
    const pz = await texts(pre, 'zh');
    for (const s of ['【影像】', '其中关键项', '签名', '姓名：', '日期：']) assert.ok(pz.all.includes(s), `zh 应有「${s}」`);
    assert.ok(pz.doc.includes('>#</w:t>') && !pz.doc.includes('>No.</w:t>'), 'zh 序号列用 #');
    assert.ok(pb.doc.includes('>No.</w:t>'), 'both 序号列照旧 No.');
    // English
    const he = await texts(handover, 'en', withRemark(handover));
    for (const s of ['Remarks: ', 'TORA Generated 2', 'Photos · ']) assert.ok(he.all.includes(s), `en 应有「${s}」`);
    assert.ok(/>Page <[\s\S]*> of </.test(he.footer), 'en 页码「Page X of Y」');
    const de = await texts(daily, 'en');
    assert.ok(de.all.includes('Video (0:42) shared separately'));
    const pe = await texts(pre, 'en');
    for (const s of ['[PHOTO]', 'No.', ' key items', 'Signature', 'Name: ', 'Date: ']) assert.ok(pe.all.includes(s), `en 应有「${s}」`);
  },
]);

tests.push([
  '文档语言 / 文档属性：en = en-US、公司名英文；zh / both = 东亚文字 zh-CN',
  async () => {
    const t = qc;
    const open = async (lang) => {
      const report = lang === 'en' ? englishReport(t) : fillReport(t, 'full');
      const model = buildDocModel({ template: t, report, project: lang === 'en' ? EN_PROJECT : SAMPLE_PROJECT, settings: lang === 'en' ? EN_SETTINGS : SAMPLE_SETTINGS, lang });
      const { files } = await openDocx(model, lang === 'en' ? englishMedia() : sampleMedia());
      return { styles: text(files, 'word/styles.xml'), core: text(files, 'docProps/core.xml'), footer: footersOf(files).join('\n'), model };
    };
    const en = await open('en');
    assert.match(en.styles, /<w:lang w:val="en-US"\/>/);
    assert.ok(!/w:eastAsia="zh-CN"/.test(en.styles), 'en 不设 zh-CN');
    assert.match(en.core, /<dc:creator>Sail by Riccione Reka<\/dc:creator>/);
    assert.ok(!CJK.test(en.core), 'en 文档属性没有中文');
    assert.match(en.core, /<dc:title>[^<]*Seri Maya Condo B-12-3 \(Mr Tan\)[^<]*<\/dc:title>/);
    assert.ok(!CJK.test(en.footer), 'en 页脚没有中文');
    assert.ok(en.footer.includes('Sail by Riccione Reka · '), 'en 页脚公司名');
    if (CJK.test(en.model.meta.reportTitle)) {
      // 核心给的还是自动生成的中文报告名「模板中文名 · 项目（客户）· 日期」→ 英文标题 + 半角括号
      assert.match(en.core, /<dc:title>INSTALLATION QUALITY CHECKLIST · Seri Maya Condo B-12-3 \(Mr Tan\) · \d{4}-\d\d-\d\d<\/dc:title>/);
      assert.ok(en.footer.includes('Sail by Riccione Reka · INSTALLATION QUALITY CHECKLIST · Seri Maya Condo B-12-3 (Mr Tan)'));
    }
    for (const lang of ['zh', 'both']) {
      const x = await open(lang);
      assert.match(x.styles, /<w:lang w:val="en-US" w:eastAsia="zh-CN"\/>/);
      assert.match(x.core, /<dc:creator>溪岸 Sail by Riccione Reka<\/dc:creator>/);
      assert.ok(x.core.includes(`<dc:title>${x.model.meta.reportTitle}</dc:title>`), `${lang} 报告名照旧`);
      assert.ok(x.footer.includes(x.model.meta.reportTitle), `${lang} 页脚报告名照旧`);
    }
  },
]);

/** 页脚左边那段文字（公司 · 报告名），每个页脚都一样 */
function footerLefts(files) {
  return footersOf(files).map((x) => unesc(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/.exec(x)?.[1] ?? ''));
}

tests.push([
  'en：没有项目、日期空着 → 报告名只剩模板中文名一段，页脚 / 文档属性也换成英文标题',
  async () => {
    const t = await loadTemplate('handover');
    if (!t) return;
    const report = createReport(t, { project: null, settings: EN_SETTINGS });
    report.values.date = '';
    report.title = reportTitle(t, report, null);
    assert.ok(CJK.test(report.title) && !report.title.includes(' · '), `前提：自动报告名只有模板中文名「${report.title}」`);
    const title = (t.doc?.title || t.name).en;
    const en = await openDocx(buildDocModel({ template: t, report, project: null, settings: EN_SETTINGS, lang: 'en' }), englishMedia());
    const core = text(en.files, 'docProps/core.xml');
    assert.ok(!CJK.test(core), `en 文档属性不应有中文：${core.match(CJK_RUNS)}`);
    assert.ok(core.includes(`<dc:title>${title}</dc:title>`), 'en 文档标题 = 英文模板名');
    for (const left of footerLefts(en.files)) assert.equal(left, `Sail by Riccione Reka · ${title}`);
    // 中文 / 双语：报告名原样
    for (const lang of ['zh', 'both']) {
      const x = await openDocx(buildDocModel({ template: t, report, project: null, settings: SAMPLE_SETTINGS, lang }), sampleMedia());
      assert.ok(text(x.files, 'docProps/core.xml').includes(`<dc:title>${report.title}</dc:title>`), `${lang} 报告名照旧`);
      for (const left of footerLefts(x.files)) assert.ok(left.endsWith(` · ${report.title}`), `${lang} 页脚报告名照旧：${left}`);
    }
  },
]);

tests.push([
  '页脚按宽度排一行：单语放不下先去日期、再在词间截断；双语照旧按字数截',
  async () => {
    const model = (lang, where) => ({
      meta: {
        lang,
        title: lang === 'en' ? { zh: '', en: 'FINAL MEASUREMENT & CONFIRMATION CHECKLIST' } : { zh: '复尺确认表', en: lang === 'both' ? 'FINAL MEASUREMENT & CONFIRMATION CHECKLIST' : '' },
        company: lang === 'en' ? 'Sail by Riccione Reka' : '溪岸 Sail by Riccione Reka',
        reportTitle: `复尺确认表 · ${where} · 2026-10-09`,
      },
      blocks: [],
    });
    const left = async (lang, where) => {
      const lefts = footerLefts((await openDocx(model(lang, where), new Map())).files);
      assert.ok(lefts.length >= 1 && lefts.every((l) => l === lefts[0]), '首页 / 续页页脚一致');
      return lefts[0];
    };
    const EN_HEAD = 'Sail by Riccione Reka · FINAL MEASUREMENT & CONFIRMATION CHECKLIST · ';
    // 英文长标题 + 普通项目名：一行放得下，日期 / 客户都不截（以前按 96 个字截成「(Mr…」）
    assert.equal(await left('en', 'Seri Maya Condo B-12-3（Mr Tan）'), `${EN_HEAD}Seri Maya Condo B-12-3 (Mr Tan) · 2026-10-09`);
    // 稍长：去掉日期就放得下 → 项目 / 客户完整
    assert.equal(await left('en', 'Seri Maya Condominium B-12-3（Mr Tan Wei Ming）'), `${EN_HEAD}Seri Maya Condominium B-12-3 (Mr Tan Wei Ming)`);
    // 很长：去掉日期仍放不下 → 在词间截断加「…」，不留半个词 / 结尾的「(」
    const long = 'The Residences at Seri Maya Condominium Tower B-12-3 (Mr and Mrs Tan Wei Ming)';
    const l3 = await left('en', long.replace(' (', '（').replace(')', '）'));
    assert.ok(l3.endsWith('…') && !l3.includes('2026'), `en 很长：${l3}`);
    const cut = l3.slice(0, -1);
    const full = `${EN_HEAD}${long}`;
    assert.ok(full.startsWith(cut) && cut.length > EN_HEAD.length + 20, `en 截断应是原文前缀：${l3}`);
    assert.match(full[cut.length], /[\s(]/, `en 应截在词间：${l3}`);
    assert.ok(!CJK.test(l3));
    // 中文：按宽度（中文字宽），放得下照旧带日期；放不下先去日期再截
    const zhShort = '吉隆坡蒲种斯里玛雅公寓第二期豪华住宅 17-3（陈伟明先生与林美玲女士）';
    assert.equal(await left('zh', zhShort), `溪岸 Sail by Riccione Reka · 复尺确认表 · ${zhShort} · 2026-10-09`);
    const zhLong = '吉隆坡蒲种斯里玛雅公寓第二期豪华住宅花园别墅区A座十七楼三号单位 17-3（陈伟明先生与林美玲女士及其家人）';
    const z = await left('zh', zhLong);
    assert.ok(z.endsWith('…') && !z.includes('2026') && `溪岸 Sail by Riccione Reka · 复尺确认表 · ${zhLong}`.startsWith(z.slice(0, -1)), `zh 很长：${z}`);
    // 双语：与以前逐字一样（超过 96 个字截到 95 个字 + 「…」）
    for (const where of [zhShort, zhLong]) {
      const old = `溪岸 Sail by Riccione Reka · 复尺确认表 · ${where} · 2026-10-09`;
      assert.equal(await left('both', where), old.length > 96 ? `${old.slice(0, 95)}…` : old);
    }
  },
]);

tests.push([
  '单语覆盖 zhOnly / enOnly（徽章 / 标签 / 说明）：核心没处理时 Word 也照用；双语照旧',
  async () => {
    // 不认 zhOnly / enOnly 的规整（核心早期的 localize）：zh → { zh: zh||en, en: '' }，en → { zh: '', en: en||zh }，其他键原样
    const plainLocalize = (node, lang) => {
      if (lang === 'both' || node == null || typeof node !== 'object') return node;
      if (Array.isArray(node)) return node.map((x) => plainLocalize(x, lang));
      const out = Object.fromEntries(Object.entries(node).map(([k, v]) => [k, plainLocalize(v, lang)]));
      if (!('zh' in node) && !('en' in node)) return out;
      const zh = node.zh || '';
      const en = node.en || '';
      return lang === 'zh' ? { ...out, zh: zh || en, en: '' } : { ...out, zh: '', en: en || zh };
    };
    const model = (lang) => plainLocalize({
      meta: {
        lang,
        title: { zh: '完工终检表', en: 'FINAL INSPECTION REPORT' },
        badge: { zh: 'INTERNAL · 内部文件', en: '无需出示客户 not for client', zhOnly: '内部文件 · 无需出示客户', enOnly: 'INTERNAL · Not for client' },
        subtitle: { zh: '按 5O 五步核查', en: '现场主管填写', zhOnly: '按 5O 五步核查；现场主管填写', enOnly: '5O five-step check, by the site supervisor' },
        company: lang === 'en' ? 'Sail by Riccione Reka' : '溪岸 Sail by Riccione Reka',
      },
      blocks: [
        { type: 'fields', id: 'f', layout: 'grid', columns: 2, fields: [{ key: 'p', label: { zh: '项目 / 客户', enOnly: 'Project / Client' }, kind: 'inline', value: 'Seri Maya', span: 1 }] },
        { type: 'note', id: 'n', lines: [{ zh: '类别 Category：安装质量', en: 'Category: installation', zhOnly: '类别：安装质量', enOnly: 'Category: installation quality' }] },
      ],
    }, lang);
    const open = async (lang) => paraTexts((await openDocx(model(lang), new Map())).files).join('\n');
    const en = await open('en');
    for (const s of ['INTERNAL · Not for client', '5O five-step check, by the site supervisor', 'Project / Client', 'Category: installation quality']) assert.ok(en.includes(s), `en 应有「${s}」`);
    assert.ok(!CJK.test(en), `en 不应有中文：${en.match(CJK_RUNS)}`);
    const zh = await open('zh');
    for (const s of ['内部文件 · 无需出示客户', '按 5O 五步核查；现场主管填写', '项目 / 客户', '类别：安装质量']) assert.ok(zh.includes(s), `zh 应有「${s}」`);
    assert.ok(!/not for client|Category|Project/.test(zh), 'zh 不应有英文半边');
    const both = await open('both');
    for (const s of ['INTERNAL · 内部文件', '无需出示客户 not for client', '按 5O 五步核查   现场主管填写', '类别 Category：安装质量  Category: installation']) assert.ok(both.includes(s), `both 应照旧有「${s}」`);
  },
]);

export { tests };
