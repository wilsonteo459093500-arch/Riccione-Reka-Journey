// 第二版「每格系列」改 bridge.js 之后：没设系列的柜子，明细（id、数量、旗标）必须和改之前逐项相同。
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { test } from './harness.mjs';
import { cabinetItemsFor } from '../src/planner/bridge.js';
import { baselineCases, demoBaselineV1, withoutV2 } from './fixtures/baseline-cases.mjs';

const base = JSON.parse(readFileSync(new URL('./fixtures/items-baseline.json', import.meta.url), 'utf8'));
const norm = (v) => JSON.parse(JSON.stringify(v));

// 第二版新加的明细（高柜内侧见光板 panelIn）第一版没有 → 比对时去掉；其他一律逐项相同
test('baseline: every template × unit × base × series → items identical to v1 (apart from v2-added lines)', () => {
  const { cabs, defaults } = baselineCases();
  assert.equal(cabs.length, base.cases);
  cabs.forEach((c) => defaults.forEach((d, i) => {
    assert.deepEqual(norm(withoutV2(cabinetItemsFor(c, d))), base.items[`${c.id}#${i}`], `${c.id}#${i} (${c.template})`);
  }));
});

test('baseline: demo quote items and total identical to v1 (apart from v2-added lines)', () => {
  // 第二版柜体多了 innerPanel 字段（数据，不是价钱）：比对时去掉
  const now = JSON.parse(JSON.stringify(demoBaselineV1(), (k, v) => (k === 'innerPanel' ? undefined : v)));
  assert.deepEqual(now.zones, base.demo.zones);
  assert.deepEqual(now.quote, base.demo.quote);
});

import { elevHash, ELEV_OPTS } from './fixtures/make-elev-baseline.mjs';
const elevBase = JSON.parse(readFileSync(new URL('./fixtures/elev-baseline.json', import.meta.url), 'utf8'));
test('baseline: drawing-style elevation output identical to v1 (sha1 per cabinet × lang × dims)', () => {
  baselineCases().cabs.forEach((c) => ELEV_OPTS.forEach((o, i) => assert.equal(elevHash(c, o), elevBase[`${c.id}#${i}`], `${c.id}#${i}`)));
});
