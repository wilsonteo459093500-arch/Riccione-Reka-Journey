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

async function exportAndOpen(template, variant, { loader, logo = LOGO, mutate } = {}) {
  const report = fillReport(template, variant);
  if (mutate) mutate(report);
  const model = buildDocModel({ template, report, project: SAMPLE_PROJECT, settings: SAMPLE_SETTINGS });
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

export { tests };
