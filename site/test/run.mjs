// 运行 test/ 下所有 *.test.mjs（纯 Node，无需浏览器）：npm test
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const only = process.argv[2];
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.test.mjs'))
  .filter((f) => !only || f.includes(only))
  .sort();

let pass = 0;
let fail = 0;
for (const f of files) {
  const mod = await import(pathToFileURL(join(DIR, f)).href);
  const tests = mod.tests || [];
  for (const [name, fn] of tests) {
    try {
      await fn();
      pass += 1;
      console.log(`  ✓ ${f} › ${name}`);
    } catch (e) {
      fail += 1;
      console.log(`  ✗ ${f} › ${name}\n    ${e?.stack || e}`);
    }
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
