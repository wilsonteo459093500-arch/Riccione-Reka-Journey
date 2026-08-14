import assert from 'node:assert';
import { parseOpenWith, auditMatrix, matrixStats, scheduleMatrix, fmtDate } from '../src/services/matrix.js';
import { matrixPrompt } from '../src/prompts/matrix.js';

// ---- parseOpenWith ----
assert.deepStrictEqual(parseOpenWith('A3 6.2-7.0'), { assetId: 'A3', from: 6.2, to: 7.0 });
assert.deepStrictEqual(parseOpenWith('A12 1.5–3.25s'), { assetId: 'A12', from: 1.5, to: 3.25 });
assert.deepStrictEqual(parseOpenWith('A7 2至4'), { assetId: 'A7', from: 2, to: 4 });
assert.deepStrictEqual(parseOpenWith('A5'), { assetId: 'A5', from: null, to: null });
assert.deepStrictEqual(parseOpenWith(''), { assetId: '', from: null, to: null });

const assets = [
  { id: 'A1', kind: 'video', name: '客厅.mov', duration: 20, label: { best_moments: [{ start: 2, end: 8 }, { start: 12, end: 18 }] } },
  { id: 'A2', kind: 'video', name: '柜门.mov', duration: 10, label: { best_moments: [{ start: 1, end: 6 }] } },
  { id: 'A3', kind: 'image', name: '成品.jpg', label: { hero_score: 9 } },
  { id: 'A4', kind: 'video', name: '没人用.mov', duration: 8, label: { best_moments: [{ start: 0, end: 5 }] } },
];

const ok = {
  pieces: [
    { id: 'P1', type: '主片', one_idea: '玄关柜为什么做 60 深不做 35', open_with: 'A1 2.0-4.0', duration_s: 35, uses: [{ assetId: 'A1', from: 2, to: 8 }] },
    { id: 'P2', type: '切片', one_idea: '木纹对纹差 2mm 就看得出来', open_with: 'A2 1.0-2.5', duration_s: 18, uses: [{ assetId: 'A2', from: 1, to: 6 }] },
    { id: 'P3', type: '前后对比', one_idea: '同样 8 尺墙，两种做法差 3 万', open_with: 'A1 12.5-14.0', duration_s: 20, uses: [{ assetId: 'A1', from: 12, to: 18 }] },
    { id: 'P4', type: '图文帖', one_idea: '实木柜验收要看的 5 个地方', open_with: 'A3', duration_s: 0, uses: [{ assetId: 'A3' }] },
    { id: 'P5', type: '动态图文', one_idea: '定制柜报价单上最容易被坑的一行', open_with: '', duration_s: 12, uses: [] },
    { id: 'P6', type: '口播', one_idea: '为什么我们不接工期少于 6 周的单', open_with: 'A4 0.5-2.0', duration_s: 25, uses: [{ assetId: 'A4', from: 0.5, to: 4 }] },
  ],
  calendar: [
    { week: 1, shape: '立锚点', slots: [{ day: '周二', pieceId: 'P1' }, { day: '周五', pieceId: 'P5' }] },
    { week: 2, shape: '铺实证', slots: [{ day: '周三', pieceId: 'P2' }] },
  ],
};

let issues = auditMatrix(ok, assets);
assert.strictEqual(issues.filter((i) => i.level === 'error').length, 0, `合格的矩阵不该报 error：${JSON.stringify(issues.filter(i=>i.level==='error'))}`);

// ---- 开场撞车必须被抓到 ----
const clash = JSON.parse(JSON.stringify(ok));
clash.pieces[1].open_with = 'A1 2.5-4.5'; // 和 P1 的 A1 2.0-4.0 重叠
issues = auditMatrix(clash, assets);
assert.ok(issues.some((i) => i.kind === 'open' && i.level === 'error'), '重叠的开场镜头要报 error');

// 同一素材但和**所有**其它开场都隔得够远 → 不该报
// （P1 开在 A1 2.0-4.0，P3 开在 A1 12.5-14.0，所以要挑一个离两边都 >2s 的位置）
const far = JSON.parse(JSON.stringify(ok));
far.pieces[1].open_with = 'A1 8.0-10.0';
assert.ok(!auditMatrix(far, assets).some((i) => i.kind === 'open'), '相隔够远的同素材开场不该报');

// 只差 1 秒仍然算撞 —— 观众分不出「同一个镜头稍微晚一点」
const near = JSON.parse(JSON.stringify(ok));
near.pieces[1].open_with = 'A1 15.0-17.0'; // 距 P3 结束的 14.0s 只有 1s
assert.ok(auditMatrix(near, assets).some((i) => i.kind === 'open'), '相隔不足 2 秒要报');

// 同素材、都没写时间段 → 无法判断，按撞车处理
const noRange = JSON.parse(JSON.stringify(ok));
noRange.pieces[0].open_with = 'A2';
noRange.pieces[1].open_with = 'A2';
assert.ok(auditMatrix(noRange, assets).some((i) => i.kind === 'open'), '同素材且没写时间段应保守报错');

// ---- 时间段越界 ----
const oob = JSON.parse(JSON.stringify(ok));
oob.pieces[1].uses[0].to = 30; // A2 只有 10s
issues = auditMatrix(oob, assets);
assert.ok(issues.some((i) => i.kind === 'range' && i.level === 'error' && /只有 10.0s/.test(i.msg)), '超出素材时长要报 error');

// 在时长内但不在可用片段里 → warn 不是 error
const outside = JSON.parse(JSON.stringify(ok));
outside.pieces[1].uses[0] = { assetId: 'A2', from: 7.5, to: 9.5 }; // A2 可用片段只有 1-6
issues = auditMatrix(outside, assets);
assert.ok(issues.some((i) => i.kind === 'range' && i.level === 'warn'), '落在可用片段外应 warn');
assert.ok(!issues.some((i) => i.kind === 'range' && i.level === 'error'), '没越界就不该 error');

// 静图不做时间段检查
const still = JSON.parse(JSON.stringify(ok));
still.pieces[3].uses[0] = { assetId: 'A3', from: 0, to: 999 };
assert.ok(!auditMatrix(still, assets).some((i) => i.kind === 'range'), '静图不该被时间段检查拦');

// ---- 引用不存在的素材 ----
const ghost = JSON.parse(JSON.stringify(ok));
ghost.pieces[0].uses.push({ assetId: 'A99', from: 1, to: 2 });
assert.ok(auditMatrix(ghost, assets).some((i) => i.kind === 'asset' && i.level === 'error'), '不存在的素材要报 error');

// ---- 格式单一 ----
const mono = { pieces: ok.pieces.map((p, i) => ({ ...p, type: i < 5 ? '切片' : '主片', open_with: `A${(i % 4) + 1} ${i * 3}-${i * 3 + 1}` })), calendar: [] };
assert.ok(auditMatrix(mono, assets).some((i) => i.kind === 'variety' && i.level === 'error'), '只有 2 种形式要报 error');

// ---- 观点笼统 ----
const vague = JSON.parse(JSON.stringify(ok));
vague.pieces[0].one_idea = '案例展示';
assert.ok(auditMatrix(vague, assets).some((i) => i.kind === 'idea'), '笼统的观点要被标出来');
vague.pieces[0].one_idea = '';
assert.ok(auditMatrix(vague, assets).some((i) => i.kind === 'idea' && i.level === 'error'), '空观点要报 error');

// ---- 素材过度使用 ----
const over = JSON.parse(JSON.stringify(ok));
[1, 3, 4].forEach((i) => over.pieces[i].uses.push({ assetId: 'A1', from: 3, to: 5 }));
assert.ok(auditMatrix(over, assets).some((i) => i.kind === 'overuse'), '一条素材被 4 条内容用要提醒');

// ---- 素材没用上 ----
const idle = JSON.parse(JSON.stringify(ok));
idle.pieces[5].uses = [];
assert.ok(auditMatrix(idle, assets).some((i) => i.kind === 'coverage' && /没人用\.mov/.test(i.msg)), '闲置素材要点名');

// ---- 统计 ----
const st = matrixStats(ok, assets);
assert.strictEqual(st.count, 6);
assert.strictEqual(st.usedCount, 4);
assert.strictEqual(st.assetCount, 4);
assert.strictEqual(st.coverage, 1);
assert.strictEqual(st.totalSeconds, 110);
assert.strictEqual(Object.keys(st.types).length, 6);

// ---- 排期落到真实日期 ----
const sched = scheduleMatrix(ok, new Date('2026-08-17T00:00:00')); // 周一
assert.strictEqual(sched.length, 2);
assert.strictEqual(sched[0].slots[0].piece.id, 'P1', '排期要关联回 piece');
assert.strictEqual(fmtDate(sched[0].slots[0].date), '8/18', '周二 = 8/18');
assert.strictEqual(fmtDate(sched[0].slots[1].date), '8/21', '周五 = 8/21');
assert.strictEqual(fmtDate(sched[1].slots[0].date), '8/26', '第 2 周周三 = 8/26');

// ---- prompt ----
const pr = matrixPrompt({ assets, notes: '950 尺三房', platformId: 'xhs', count: 6, weeks: 4 });
assert.ok(pr.includes('A1 · 视频 20.0s · 客厅.mov'), '素材池要带 id 和时长');
assert.ok(pr.includes('2.0–8.0s'), '可用片段要带进去');
assert.ok(pr.includes('封面分：9/10'), '静图的封面分要带进去');
assert.ok(pr.includes('950 尺三房'), '案例背景');
assert.ok(pr.includes('小红书'), '平台');
assert.ok(pr.includes('至少要有 4 种不同的'), '格式多样性规矩');
assert.ok(!pr.includes('undefined'), 'prompt 不能有 undefined');
assert.ok(!matrixPrompt({ assets: [], platformId: 'xhs' }).includes('undefined'), '空素材也不能有 undefined');

console.log('✅ matrix 全部断言通过');
console.log(`   体检项：开场撞车 / 时间段越界 / 越出可用片段 / 幽灵素材 / 格式单一 / 观点笼统 / 过度使用 / 闲置素材`);
