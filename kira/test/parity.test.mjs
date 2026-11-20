// 对价：旧报价导入 KIRA 后价钱不变；旧柜体行换成积木柜后价钱一模一样。
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { importOldRecord, oldItemToCabinet, parityReport } from '../src/planner/importOld.js';
import { GOLDEN } from './pricing.test.mjs';

const oldRec = (items, extra = {}) => ({
  id: 'rec_old', groupId: 'rec_old', meta: { name: 'Old 客户', version: '3', outputLang: 'en' },
  zones: [{ id: 'z1', name: 'Kitchen 厨房', items, collapsed: false }], looseItems: [], adjustPct: 10, ...extra,
});

test('import copies the old record with new ids and never mutates the original', () => {
  const old = oldRec(GOLDEN.map((g) => g[1]));
  const snapshot = JSON.stringify(old);
  const rec = importOldRecord(old, { ownerId: 'u1', newId: () => 'rec_new' });
  assert.equal(JSON.stringify(old), snapshot);
  assert.equal(rec.id, 'rec_new');
  assert.equal(rec.groupId, 'rec_new');
  assert.equal(rec.ownerId, 'u1');
  assert.equal(rec.importedFrom.id, 'rec_old');
  assert.deepEqual(rec.zones[0].cabinets, []);
  assert.equal(rec.zones[0].items.length, GOLDEN.length);
  assert.equal(rec.meta.version, '3');
});

test('every convertible golden cabinet item is priced identically as a KIRA cabinet', () => {
  const rep = parityReport([oldRec(GOLDEN.map((g) => g[1]))]);
  assert.equal(rep.records, 1);
  assert.equal(rep.recordsSame, 1);
  assert.ok(rep.itemsChecked >= 5, `checked ${rep.itemsChecked}`);
  assert.equal(rep.itemsSame, rep.itemsChecked, JSON.stringify(rep.rows[0].diffs));
  assert.equal(rep.pass, true);
});

test('random old cabinet items (lengths a+b, series A–K, drawers, open, glass coef) → zero difference', () => {
  let s = 11;
  const rnd = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const items = [];
  for (let i = 0; i < 400; i++) {
    const kind = pick(['base', 'wall', 'tall', 'open', 'glass', 'drawers']);
    const len = rnd() < 0.3 ? `${(0.5 + rnd() * 3).toFixed(2)}+${(0.5 + rnd() * 2).toFixed(2)}` : (0.3 + rnd() * 5).toFixed(2);
    const h = kind === 'wall' ? 0.75 : kind === 'base' || kind === 'drawers' ? 0.85 : (1 + rnd() * 1.8).toFixed(2);
    const d = (0.3 + rnd() * 0.4).toFixed(2);
    const door = pick(['A', 'B', 'C', 'D', 'E', 'K']);
    const it = { id: `r${i}`, type: 'cabinet', cabType: kind === 'open' ? 'open' : kind === 'drawers' ? 'base' : kind === 'glass' ? 'tall' : kind,
      length: len, h: Number(h), d: Number(d), doorSeries: door, carcassSeries: pick(['A', 'B', 'C']), openSeries: door,
      hasDoor: kind !== 'open', hasCarcass: kind !== 'open', hasOpen: kind === 'open' };
    if (kind === 'glass') { it.coef = 1.5; it.coefTarget = 'door'; }
    if (kind === 'drawers') { it.drawers = Math.floor(rnd() * 4); it.drawersHalf = Math.floor(rnd() * 3); }
    items.push(it);
  }
  const rep = parityReport([oldRec(items, { adjustPct: 7 })]);
  assert.equal(rep.itemsSkipped, 0);
  assert.equal(rep.itemsSame, rep.itemsChecked, JSON.stringify(rep.rows[0].diffs.slice(0, 3)));
  assert.equal(rep.pass, true);
});

test('items KIRA cannot express (carcass-only, coef on carcass) are skipped and stay manual', () => {
  assert.equal(oldItemToCabinet({ id: 'x', type: 'cabinet', cabType: 'base', length: '1', h: 0.85, d: 0.6, hasDoor: false, hasCarcass: true }), null);
  assert.equal(oldItemToCabinet({ id: 'y', type: 'cabinet', cabType: 'tall', length: '1', h: 2, d: 0.6, coef: 2.5, coefTarget: 'both' }), null);
  assert.equal(oldItemToCabinet({ id: 'z', type: 'panel', length: '1', h: 2 }), null);
  const rep = parityReport([oldRec([{ id: 'x', type: 'cabinet', cabType: 'base', length: '1', h: 0.85, d: 0.6, hasDoor: false, hasCarcass: true }])]);
  assert.equal(rep.itemsSkipped, 1);
  assert.equal(rep.recordsSame, 1);
});
