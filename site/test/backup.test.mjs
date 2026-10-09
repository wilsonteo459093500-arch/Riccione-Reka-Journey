// 备份逐行读取：长行跨数据块、末行无换行、空行
import assert from 'node:assert/strict';
import { readLines } from '../src/lib/backup.js';

async function collect(blob) {
  const out = [];
  for await (const l of readLines(blob)) out.push(l);
  return out;
}

export const tests = [
  ['长行跨块 / 末行无换行 / 跳过空行', async () => {
    const big = 'x'.repeat(3 * 1024 * 1024); // 远大于一个数据块
    const blob = new Blob([`{"a":1}\n\n{"media":"`, big, `"}\n`, '{"b":2}']);
    const lines = await collect(blob);
    assert.equal(lines.length, 3);
    assert.equal(lines[0], '{"a":1}');
    assert.equal(JSON.parse(lines[1]).media.length, big.length);
    assert.equal(lines[2], '{"b":2}');
  }],
  ['中文跨块不乱码', async () => {
    const zh = '溪岸定制安装汇报'.repeat(200000);
    const lines = await collect(new Blob([`${zh}\n`, '尾']));
    assert.equal(lines[0], zh);
    assert.equal(lines[1], '尾');
  }],
];
