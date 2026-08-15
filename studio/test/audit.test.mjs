import assert from 'node:assert';
import {
  OPEN_GAP, issue, collector, sortIssues, countIssues, issuesFor, findOpeningClashes, mergedSpan,
} from '../src/services/audit.js';
import { auditMatrix } from '../src/services/matrix.js';
import { auditShorts } from '../src/services/shorts.js';

// ---- 形状统一 ----
assert.deepStrictEqual(issue('error', 'open', '撞了', 'P2'), { level: 'error', kind: 'open', msg: '撞了', ref: 'P2' });

const { add, issues } = collector();
add('warn', 'a', '轻的');
add('error', 'b', '重的', 'X1');
assert.strictEqual(issues.length, 2);
assert.deepStrictEqual(countIssues(issues), { errors: 1, warns: 1 });
assert.strictEqual(sortIssues(issues)[0].level, 'error', '硬伤要排前面');
assert.strictEqual(issuesFor(issues, 'X1').length, 1);
assert.strictEqual(issuesFor(issues, '不存在').length, 0);

// ---- 开场撞车：量产和再切共用这一份 ----
assert.strictEqual(OPEN_GAP, 2.0);

// 来源不同 = 画面不同，永远不撞
assert.strictEqual(
  findOpeningClashes([
    { ref: 'A', source: 'A1', from: 0, to: 2 },
    { ref: 'B', source: 'A2', from: 0, to: 2 },
  ]).length,
  0
);

// 同来源、区间重叠 → 撞
assert.strictEqual(
  findOpeningClashes([
    { ref: 'A', source: 'A1', from: 2, to: 4 },
    { ref: 'B', source: 'A1', from: 2.5, to: 4.5 },
  ]).length,
  1
);

// 同来源、间隔正好超过 2 秒 → 不撞
assert.strictEqual(
  findOpeningClashes([
    { ref: 'A', source: 'A1', from: 0, to: 2 },
    { ref: 'B', source: 'A1', from: 4.1, to: 6 },
  ]).length,
  0,
  '间隔 2.1 秒不该报'
);
// 间隔 1 秒 → 撞
assert.strictEqual(
  findOpeningClashes([
    { ref: 'A', source: 'A1', from: 0, to: 2 },
    { ref: 'B', source: 'A1', from: 3, to: 5 },
  ]).length,
  1,
  '间隔 1 秒要报'
);

// 同来源但没写时间段 → 保守判为撞（gap 为 null 表示「无从判断」）
const unknown = findOpeningClashes([
  { ref: 'A', source: 'A1', from: null, to: null },
  { ref: 'B', source: 'A1', from: null, to: null },
]);
assert.strictEqual(unknown.length, 1);
assert.strictEqual(unknown[0].gap, null);
// 关掉保守模式
assert.strictEqual(
  findOpeningClashes(
    [{ ref: 'A', source: 'A1', from: null, to: null }, { ref: 'B', source: 'A1', from: null, to: null }],
    { unknownIsClash: false }
  ).length,
  0
);

// 再切的用法：全部同一条主片（source 都是 null），开场是单点
const pointClash = findOpeningClashes([
  { ref: 'S1', source: null, from: 0, to: 0 },
  { ref: 'S2', source: null, from: 1.2, to: 1.2 },
  { ref: 'S3', source: null, from: 10, to: 10 },
]);
assert.strictEqual(pointClash.length, 1, 'S1/S2 差 1.2 秒要撞，S3 不该牵连');
assert.deepStrictEqual([pointClash[0].a, pointClash[0].b], ['S1', 'S2']);

// ---- 区间合并 ----
assert.strictEqual(mergedSpan([[0, 10], [5, 15]]), 15, '重叠要合并');
assert.strictEqual(mergedSpan([[0, 20], [5, 10]]), 20, '包含关系不能重复计');
assert.strictEqual(mergedSpan([[0, 5], [10, 15]]), 10, '不相邻要分别计');
assert.strictEqual(mergedSpan([[5, 15], [0, 10]]), 15, '乱序输入也要对');
assert.strictEqual(mergedSpan([]), 0);
assert.strictEqual(mergedSpan([[3, 3], [5, 1], ['x', 2]]), 0, '零长/倒序/非数字要被丢掉');

// ---- 两个调用方现在真的返回统一的 ref 字段 ----
const m = auditMatrix(
  { pieces: [{ id: 'P1', type: '主片', one_idea: '玄关柜为什么做 60 深', open_with: 'A1 0-2', uses: [] },
             { id: 'P2', type: '切片', one_idea: '木纹对纹差 2mm 看得出', open_with: 'A1 0.5-2.5', uses: [] }] },
  [{ id: 'A1', kind: 'video', name: 'a.mov', duration: 20 }]
);
const mOpen = m.find((i) => i.kind === 'open');
assert.ok(mOpen, '量产应报开场撞车');
assert.strictEqual(mOpen.ref, 'P2', '量产的问题要挂在 ref 上（不再是 pieceId）');
assert.ok(!('pieceId' in mOpen), 'pieceId 已废弃');

const s = auditShorts(
  { shorts: [{ id: 'S1', from_s: 0, to_s: 8, new_hook: '开场一', one_idea: '第一件事讲清楚' },
             { id: 'S2', from_s: 1, to_s: 9, new_hook: '开场二', one_idea: '第二件事讲清楚' }] },
  30
);
const sOpen = s.find((i) => i.kind === 'open');
assert.ok(sOpen, '再切应报开场撞车');
assert.strictEqual(sOpen.ref, 'S2', '再切的问题也挂在 ref 上（不再是 id）');
assert.ok(!('id' in sOpen), 'id 字段已废弃');

console.log('✅ audit 断言通过（形状统一 / 开场撞车共用一份实现 / 区间合并）');
