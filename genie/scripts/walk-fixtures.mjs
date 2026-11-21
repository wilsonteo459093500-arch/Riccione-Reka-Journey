// 走进去的冻结样本（SPEC §8 / §9）：condo3、semid2 两个模板，按工作室「开一个新方案」的同一条路做出来
// （store.createProject：模板平面图 + furnish() 自动摆家具 + 「温暖」情绪的材质），再固定 id / 日期 / 时间（上午 10 点），
// 写成本机存档的原样（store.toStoredProject = localStorage 'genie.studio.projects.v1' 里的一项）。
// 家具的 id 来自 model.uid()（Math.random）：做样本时临时换成固定种子的随机数，id 的样子和真的一样、每次做出来都一样。
// 用法：node scripts/walk-fixtures.mjs [--check]
//   不带参数：写 test/fixtures/walk/{condo3,semid2}.json（只在模板 / 摆家具的规则有意改动后重做一次）
//   --check：只比对，不写；和现有的样本不一样就退出 1
// 读回来：store.fromStoredProject(JSON.parse(...)) → v2 方案（家具全部在 furniture 里，每件都有 floor）。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { templatePlan } from '../src/studio/plan/model.js';
import { createProject, toStoredProject } from '../src/studio/store.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test', 'fixtures', 'walk');
const AT = '2026-11-19T00:00:00.000Z'; // 固定日期：样本每次做出来一模一样
const TIME = 10; // 上午 10 点：白天、太阳够高，屋里看得清

export const FIXTURES = [
  { id: 'condo3', pid: 'pwalkcondo3' },
  { id: 'semid2', pid: 'pwalksemid2' },
];

/** 固定种子的随机数（mulberry32） */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

/** 一个模板 → 存档形的方案（和 StudioApp「开始一个空间」→ newFromTemplate 一样：没有客人档案、情绪 cozy） */
export function fixtureProject(tid, pid) {
  const random = Math.random;
  Math.random = rng(seedOf(pid));
  try {
    const p = createProject({ plan: templatePlan(tid), mood: 'cozy' });
    return toStoredProject({ ...p, id: pid, createdAt: AT, updatedAt: AT, time: TIME });
  } finally {
    Math.random = random;
  }
}

const text = (o) => `${JSON.stringify(o, null, 2)}\n`;

function main() {
  const check = process.argv.includes('--check');
  let bad = 0;
  mkdirSync(OUT, { recursive: true });
  for (const { id, pid } of FIXTURES) {
    const a = text(fixtureProject(id, pid));
    // 同一份再做一次：furnish / 模板里不能有随机数，不然样本不是冻结的
    if (text(fixtureProject(id, pid)) !== a) throw new Error(`${id}: 两次做出来不一样（有随机数？）`);
    const file = join(OUT, `${id}.json`);
    const old = existsSync(file) ? readFileSync(file, 'utf8') : null;
    if (check) {
      const same = old === a;
      if (!same) bad++;
      console.log(`${same ? '✓' : '✗'} ${id}${same ? '' : old == null ? '：还没有样本' : '：和样本不一样（模板或摆家具的规则变了）'}`);
      continue;
    }
    writeFileSync(file, a);
    const p = JSON.parse(a);
    const n = p.furniture.length + (p.furnitureUpper?.length || 0);
    console.log(`${old === a ? '=' : '✎'} ${file}  ${p.plan.floors.length} 层 · ${n} 件家具 · ${(a.length / 1024).toFixed(1)} kB`);
  }
  if (bad) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
