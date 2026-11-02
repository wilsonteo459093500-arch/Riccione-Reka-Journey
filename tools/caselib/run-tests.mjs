/* ============================================================
   让 `node --test tools/caselib/test/` 能跑：
   Node 22 把资料夹参数当成一个模组路径，所以 test/package.json 的 main 指到这里，
   这里再把 test/ 里所有 *.test.mjs 载入（同一个 process，依序执行）。
   也可以直接 node --test 'tools/caselib/test/*.test.mjs'（每个档各自一个 process）。
   ============================================================ */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'test');
for (const f of readdirSync(dir).filter((n) => n.endsWith('.test.mjs')).sort()) {
  try {
    await import(pathToFileURL(join(dir, f)).href);
  } catch (e) {
    // 一个档载入失败不要让其它档跟着不见：记成一个失败的测试
    test('load ' + f, () => { throw e; });
  }
}
