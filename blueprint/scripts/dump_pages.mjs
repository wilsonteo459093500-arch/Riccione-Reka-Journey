// 开发工具：解析一份设计师 PDF，打印逐页分析报告；可选写出测试用的 fixture（只有文字与图片框，不含像素）。
//
//   node scripts/dump_pages.mjs <pdf> [--file-name "2026.8.6 Muar - Mr Lau - GF  L1.pdf"]
//                                     [--fixture test/fixtures/sample-pages.json] [--pages 4,9] [--json]
//   node scripts/dump_pages.mjs --from-fixture test/fixtures/sample-pages.json
//
// --pages：额外打印这些页的原始文字行 / 图片框；--json：输出完整 analysis JSON。
// 写 fixture 时客户名做匿名化（'Mr Lau' → 'Mr Demo'）。

import fs from 'fs';
import path from 'path';
import { extractPdf } from '../src/import/pdfExtract.js';
import { analyzePages } from '../src/import/analyze.js';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name) => args.includes(name);
const valueFlags = new Set(['--file-name', '--fixture', '--pages', '--from-fixture']);
const positional = args.filter((a, i) => !a.startsWith('--') && !valueFlags.has(args[i - 1]));

const anonymize = (s) =>
  String(s ?? '')
    .replace(/M\s*r\s*\.?\s+L\s*a\s*u\b/g, (m) => (/ r /.test(m) ? 'M r D e m o' : 'Mr Demo'))
    .replace(/\bLau\b/g, 'Demo');

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
    fs.mkdirSync(path.dirname(fixture), { recursive: true });
    // 每页一行，diff 时好读
    const body = out.pages.map((p) => `    ${JSON.stringify(p)}`).join(',\n');
    fs.writeFileSync(
      fixture,
      `{\n  "fileName": ${JSON.stringify(out.fileName)},\n  "meta": ${JSON.stringify(out.meta)},\n  "pages": [\n${body}\n  ]\n}\n`
    );
    console.error(`fixture 已写入 ${fixture}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
