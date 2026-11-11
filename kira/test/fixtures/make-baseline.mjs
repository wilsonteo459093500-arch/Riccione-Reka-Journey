// 产生 items-baseline.json（第二版改 bridge.js 之前的明细）。只在改 bridge 之前跑一次！
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { cabinetItemsFor } from '../../src/planner/bridge.js';
import { baselineCases, demoBaseline } from './baseline-cases.mjs';

const { cabs, defaults } = baselineCases();
const out = { cases: cabs.length, items: {} };
cabs.forEach((c) => defaults.forEach((d, i) => { out.items[`${c.id}#${i}`] = cabinetItemsFor(c, d); }));
out.demo = demoBaseline();
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'items-baseline.json');
writeFileSync(file, JSON.stringify(out));
console.log(`wrote ${Object.keys(out.items).length} item lists → ${file}`);
