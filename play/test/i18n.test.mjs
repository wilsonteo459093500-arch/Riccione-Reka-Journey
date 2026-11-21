import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// i18n.js 用到 react 的 createContext；Node 里直接载入也可以
const { DICT, translate } = await import('../src/lib/i18n.js');

test('中英文字的 key 一样多', () => {
  assert.deepEqual(Object.keys(DICT.en).sort(), Object.keys(DICT.zh).sort());
});

test('程序里用到的 t("…") 都有翻译', () => {
  const files = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(jsx?|mjs)$/.test(f)) files.push(p);
    }
  };
  walk(new URL('../src', import.meta.url).pathname);
  const missing = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([a-z][\w.-]*)'/g)) if (!(m[1] in DICT.zh)) missing.push(`${m[1]} (${f})`);
  }
  assert.deepEqual(missing, []);
});

test('代入数字', () => {
  assert.equal(translate('zh', 'cb.tries', { n: 3 }), '还可以猜 3 次');
  assert.equal(translate('en', 'cb.tries', { n: 3 }), '3 guesses left');
});
