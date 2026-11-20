// 价格表（pricing.js）不能被无意改动：内容必须和 VENDOR.json 记的一致。
// 有意改价时：改完跑 `npm run check:vendor -- --accept`，并更新 pricing.test.mjs 的黄金值。
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { test } from './harness.mjs';

const vendor = JSON.parse(readFileSync(new URL('../VENDOR.json', import.meta.url), 'utf8'));
const sha = (p) => createHash('sha256').update(readFileSync(new URL('../' + p, import.meta.url))).digest('hex');

test('pricing.js matches VENDOR.json (no accidental price change)', () => {
  assert.equal(sha('src/constants/pricing.js'), vendor.files['src/constants/pricing.js'].sha256);
});

test('verbatim files are still byte-identical to the old quote tool', () => {
  for (const [f, info] of Object.entries(vendor.files)) {
    if (info.status === 'verbatim' && f !== 'src/constants/pricing.js') assert.equal(sha(f), info.upstreamSha256, f);
  }
});
