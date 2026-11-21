// 开发工具：解析一份设计师 PDF，打印逐页分析报告；可选写出测试用的 fixture（只有文字与图片框，不含像素）。
//
//   node scripts/dump_pages.mjs <pdf> [--file-name "2026.8.6 Muar - Mr Lau - GF  L1.pdf"]
//                                     [--fixture test/fixtures/sample-pages.json] [--pages 4,9] [--json]
//                                     [--redact "Tan,Puchong,Jalan Bunga 3"]
//   node scripts/dump_pages.mjs --from-fixture test/fixtures/sample-pages.json
//
// --pages：额外打印这些页的原始文字行 / 图片框；--json：输出完整 analysis JSON。
//
// 写 fixture 时去掉客户资料（仓库是公开的，真的方案 PDF 本身只放临时资料夹，不进仓库）：
//   · 自动：文件名 / 标题页认出的客户名、地点 → 'Mr Demo' / 'Demo Town'；电话号码、电邮、身份证号 → 占位
//   · --redact：另外要抹掉的字（门牌、花园名、设计师名…），逗号分开
//   · 写完再扫一遍：还找得到任何一个要抹的字，就不写、直接报错

import fs from 'fs';
import path from 'path';
import { extractPdf } from '../src/import/pdfExtract.js';
import { analyzePages } from '../src/import/analyze.js';
import { parseFileName, parseClientLine } from '../src/import/labels.js';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name) => args.includes(name);
const valueFlags = new Set(['--file-name', '--fixture', '--pages', '--from-fixture']);
const positional = args.filter((a, i) => !a.startsWith('--') && !valueFlags.has(args[i - 1]));

const HONORIFIC_WORD = /^(mr|mrs|ms|miss|mdm|madam|dr|dato'?|datin|datuk|puan|encik|en|tuan|先生|女士|小姐|太太|夫人)\.?$/i;
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 要抹掉的字 → [{ re, to }]；字距拉开的写法（'M r  T a n'）也抹 */
function buildRedactor(terms) {
  const rules = [];
  const seen = new Set();
  for (const { text, to } of terms) {
    const t = String(text || '').trim();
    if (t.length < 2 || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    const body = [...t.replace(/\s+/g, '')].map(escRe).join('\\s*');
    const latin = /^[A-Za-z]/.test(t);
    rules.push({ term: t, re: new RegExp(latin ? `(^|[^A-Za-z])${body}(?![A-Za-z])` : `()${body}`, 'gi'), to });
  }
  const PHONE = /(\+?\s*6\s*0|\b0)(?:[\s-]*\d){8,10}\b/g;
  const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
  const IC = /\b\d{6}-\d{2}-\d{4}\b/g;
  const apply = (s) => {
    let out = String(s ?? '');
    for (const r of rules) out = out.replace(r.re, (m, pre) => `${pre}${r.to}`);
    return out.replace(EMAIL, 'demo@example.com').replace(IC, '000000-00-0000').replace(PHONE, (m, pre) => `${pre.trim()}0000000`);
  };
  return { apply, rules };
}

/** 从文件名、标题页、--redact 收集要抹掉的字 */
function redactTerms(fileName, raw) {
  const terms = [];
  const addClient = (client) => {
    if (!client) return;
    terms.push({ text: client, to: 'Mr Demo' });
    for (const w of client.split(/[\s,.]+/)) if (!HONORIFIC_WORD.test(w)) terms.push({ text: w, to: 'Demo' });
  };
  const addPlace = (loc) => loc && terms.push({ text: loc, to: 'Demo Town' });
  const fromFile = parseFileName(fileName || '');
  addClient(fromFile.client);
  addPlace(fromFile.location);
  // 标题页（前 3 页）上写客户的那一行
  for (const p of raw.pages.slice(0, 3)) {
    for (const l of p.lines || []) {
      const r = parseClientLine(l.text);
      if (r.client) {
        addClient(r.client);
        addPlace(r.location);
      }
    }
  }
  for (const t of String(opt('--redact') || '').split(',')) if (t.trim()) terms.push({ text: t.trim(), to: 'Demo' });
  // 长的先换（'Mr Tan' 在 'Tan' 前面）
  return terms.sort((a, b) => b.text.length - a.text.length);
}

async function main() {
  let raw;
  let fileName = opt('--file-name');
  const fromFixture = opt('--from-fixture');
  if (fromFixture) {
    raw = JSON.parse(fs.readFileSync(fromFixture, 'utf8'));
    fileName = fileName || raw.fileName;
  } else {
    const pdfPath = positional[0];
    if (!pdfPath) {
      console.error('用法：node scripts/dump_pages.mjs <pdf> [--file-name 名称] [--fixture 输出.json] [--pages 4,9] [--json]');
      process.exit(1);
    }
    fileName = fileName || path.basename(pdfPath);
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const t0 = Date.now();
    raw = await extractPdf(pdfjs, data, {
      docOptions: { isOffscreenCanvasSupported: false },
      onProgress: (stage, done, total) => {
        if (done === total || done % 10 === 0) process.stderr.write(`\r${stage} ${done}/${total}`);
      },
    });
    process.stderr.write(`\r解析完成：${raw.pages.length} 页，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  }

  const analysis = analyzePages(raw, { fileName });

  const showPages = (opt('--pages') || '').split(',').map(Number).filter(Boolean);
  for (const n of showPages) {
    const p = raw.pages.find((x) => x.n === n);
    if (!p) continue;
    console.log(`\n=== 原始 p${n} (${p.width}×${p.height})`);
    for (const l of p.lines) console.log(`  T (${l.x},${l.y}) w${l.w} fs${l.fs}  ${l.text}`);
    for (const im of p.images) console.log(`  I ${im.key} (${im.x},${im.y}) ${im.w}×${im.h} px ${im.pxW}×${im.pxH}`);
  }

  if (flag('--json')) {
    console.log(JSON.stringify(analysis, null, 2));
  } else {
    console.log('\n=== 逐页报告');
    for (const line of analysis.report) console.log(line);
    console.log('\n=== 项目信息');
    console.log(analysis.info);
    console.log('\n=== 楼层');
    for (const f of analysis.floors) console.log(`  ${f.key}  ${f.zh}  ${f.en}  背景=${f.imageKey || '自动'}`);
    console.log('\n=== 材料（按首次出现）');
    for (const m of analysis.materials) {
      console.log(`  ${(m.code || '—').padEnd(8)} ${m.name.padEnd(24)} ${m.pending ? '待确认' : '      '}  图=${m.imageKey || '无'}`);
    }
    const kinds = analysis.pages.reduce((acc, p) => ({ ...acc, [p.kind]: (acc[p.kind] || 0) + 1 }), {});
    console.log(`\n视角 ${analysis.views.length} 页 · 材料 ${analysis.materials.length} 种 · 页类型 ${JSON.stringify(kinds)}`);
  }

  const fixture = opt('--fixture');
  if (fixture && !fromFixture) {
    const terms = redactTerms(fileName, raw);
    const { apply: anonymize, rules } = buildRedactor(terms);
    console.error(`要抹掉的字：${rules.map((r) => r.term).join('、') || '（没有）'}`);
    const out = {
      fileName: anonymize(fileName),
      meta: { numPages: raw.meta.numPages, title: anonymize(raw.meta.title), creationDate: raw.meta.creationDate },
      pages: raw.pages.map((p) => ({
        n: p.n,
        width: p.width,
        height: p.height,
        lines: p.lines.map((l) => ({ ...l, text: anonymize(l.text) })),
        images: p.images,
      })),
    };
    // 每页一行，diff 时好读
    const body = out.pages.map((p) => `    ${JSON.stringify(p)}`).join(',\n');
    const text = `{\n  "fileName": ${JSON.stringify(out.fileName)},\n  "meta": ${JSON.stringify(out.meta)},\n  "pages": [\n${body}\n  ]\n}\n`;
    // 写之前再扫一遍：要抹掉的字一个都不能剩
    const left = rules.filter((r) => new RegExp(r.re.source, 'i').test(text)).map((r) => r.term);
    if (left.length) {
      console.error(`没写 fixture：还找得到 ${left.join('、')}`);
      process.exit(2);
    }
    fs.mkdirSync(path.dirname(fixture), { recursive: true });
    fs.writeFileSync(fixture, text);
    console.error(`fixture 已写入 ${fixture}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
