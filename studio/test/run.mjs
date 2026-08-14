// 测试入口：`npm test`
//
// 这些是纯断言脚本，不是 node:test 套件 —— 每个文件跑通就打印一行 ✅，
// 任何一条 assert 挂掉就整个进程非零退出。够用，而且没有任何依赖。
//
// 用 Node 写 runner 而不是 shell 循环，是因为要在 Windows 的 PowerShell 上也能跑。

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(HERE)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort();

if (!files.length) {
  console.error('test/ 里没有 *.test.mjs');
  process.exit(1);
}

let failed = 0;
const t0 = Date.now();

for (const f of files) {
  const r = spawnSync(process.execPath, [join(HERE, f)], { encoding: 'utf8' });
  const name = f.replace('.test.mjs', '').padEnd(10);
  if (r.status === 0) {
    // 每个套件自己会打印结论，这里只转发它的输出
    process.stdout.write(r.stdout);
  } else {
    failed++;
    console.error(`\n❌ ${name} 失败`);
    if (r.stdout.trim()) console.error(r.stdout.trim());
    console.error(r.stderr.trim().split('\n').slice(0, 14).join('\n'));
  }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
if (failed) {
  console.error(`\n${failed}/${files.length} 个套件失败（${secs}s）`);
  process.exit(1);
}
console.log(`\n${files.length} 个套件全部通过（${secs}s）`);
