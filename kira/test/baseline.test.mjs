// 第二版「每格系列」改 bridge.js 之后：没设系列的柜子，明细（id、数量、旗标）必须和改之前逐项相同。
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { test } from './harness.mjs';
import { cabinetItemsFor } from '../src/planner/bridge.js';
import { baselineCases, demoBaseline } from './fixtures/baseline-cases.mjs';

const base = JSON.parse(readFileSync(new URL('./fixtures/items-baseline.json', import.meta.url), 'utf8'));
const norm = (v) => JSON.parse(JSON.stringify(v));

test('baseline: every template × unit × base × series → items identical to v1', () => {
  const { cabs, defaults } = baselineCases();
  assert.equal(cabs.length, base.cases);
  cabs.forEach((c) => defaults.forEach((d, i) => {
    assert.deepEqual(norm(cabinetItemsFor(c, d)), base.items[`${c.id}#${i}`], `${c.id}#${i} (${c.template})`);
  }));
});

test('baseline: demo quote items and total identical to v1', () => {
  const now = norm(demoBaseline());
  assert.deepEqual(now.zones, base.demo.zones);
  assert.deepEqual(now.quote, base.demo.quote);
});
