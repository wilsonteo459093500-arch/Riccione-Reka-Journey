// npm test —— 运行 test/ 下所有 *.test.mjs（Node，无需浏览器）
import { readdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import { tests, setFile } from './harness.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv[2];
for (const f of readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort()) {
  if (only && !f.includes(only)) continue;
  setFile(f);
  await import(pathToFileURL(path.join(dir, f)).href);
}
let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`  ✓ ${t.file} › ${t.name}`);
  } catch (e) {
    failed += 1;
    console.log(`  ✗ ${t.file} › ${t.name}\n      ${String(e?.stack || e).split('\n').slice(0, 6).join('\n      ')}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
