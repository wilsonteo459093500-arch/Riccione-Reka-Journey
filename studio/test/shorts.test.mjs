import assert from 'node:assert';
import { auditShorts, shortsCoverage, toShortsGuide } from '../src/services/shorts.js';
import { shortsPrompt } from '../src/prompts/shorts.js';
import { withOutputTimes, planDuration } from '../src/services/exporters.js';

const TOTAL = 30;
const ok = {
  read: '这条主片里有 3 个点能独立成立',
  shorts: [
    { id: 'S1', title: '玄关柜深度', one_idea: '玄关柜为什么做 60 深不做 35', from_s: 0, to_s: 11, duration_s: 11, new_hook: '35 公分的玄关柜，装不下一个 20 寸行李箱', keep_slots: [1, 2, 3] },
    { id: 'S2', title: '阻尼', one_idea: '静音阻尼贵在哪，值不值', from_s: 12.5, to_s: 21, duration_s: 8.5, new_hook: '这一下关门的声音，差价是 800 块', keep_slots: [5, 6] },
    { id: 'S3', title: '一门到顶', one_idea: '一门到顶为什么必须现场量', from_s: 23, to_s: 30, duration_s: 7, new_hook: '天花板不是平的，这件事没人告诉你', keep_slots: [8, 9] },
  ],
  not_worth_cutting: ['第 4 拍只有 1.2 秒，撑不起一支'],
};

// ---- 合格的方案不该报硬伤 ----
let issues = auditShorts(ok, TOTAL);
assert.strictEqual(issues.filter((i) => i.level === 'error').length, 0, JSON.stringify(issues.filter((i) => i.level === 'error')));

// ---- 时间码硬伤 ----
const bad = (patch) => auditShorts({ shorts: [{ ...ok.shorts[0], ...patch }] }, TOTAL);
assert.ok(bad({ to_s: 45 }).some((i) => i.kind === 'time' && i.level === 'error'), '超出主片时长要报 error');
assert.ok(bad({ from_s: 11, to_s: 5 }).some((i) => i.kind === 'time' && i.level === 'error'), '倒序要报 error');
assert.ok(bad({ from_s: -2 }).some((i) => i.kind === 'time' && i.level === 'error'), '负数要报 error');
assert.ok(bad({ from_s: 'abc' }).some((i) => i.kind === 'time' && i.level === 'error'), '非数字要报 error');
// 一条时间码坏了就不该再对同一支重复报别的错
assert.strictEqual(bad({ to_s: 45 }).length, 1, '时间码坏了应提前返回，不重复报');

// ---- 声明时长和实际对不上 ----
assert.ok(
  bad({ duration_s: 20 }).some((i) => i.kind === 'time' && i.level === 'warn' && /以起止为准/.test(i.msg)),
  '声明时长对不上要提醒'
);

// ---- 独立成立 ----
assert.ok(bad({ new_hook: '' }).some((i) => i.kind === 'hook' && i.level === 'error'), '没写新开场要报 error');
assert.ok(
  bad({ new_hook: '刚才说的那个尺寸' }).some((i) => i.kind === 'standalone'),
  '开场里的上文指代要被抓出来'
);
assert.ok(bad({ one_idea: '好' }).some((i) => i.kind === 'idea'), '观点太短要提醒');

// ---- 单支占比 ----
assert.ok(
  auditShorts({ shorts: [{ ...ok.shorts[0], to_s: 25 }] }, TOTAL).some((i) => i.kind === 'share'),
  '占主片 83% 要提醒是重发'
);
assert.ok(bad({ to_s: 3 }).some((i) => i.kind === 'short'), '3 秒太短要提醒');

// ---- 开场撞车 ----
const clash = { shorts: [ok.shorts[0], { ...ok.shorts[1], from_s: 1.2 }] };
assert.ok(auditShorts(clash, TOTAL).some((i) => i.kind === 'open' && i.level === 'error'), '开场差 1.2s 要报 error');
const far = { shorts: [ok.shorts[0], { ...ok.shorts[1], from_s: 4 }] };
assert.ok(!auditShorts(far, TOTAL).some((i) => i.kind === 'open'), '差 4s 不该报');

// ---- 覆盖率：重叠区间要合并，不能重复计 ----
const cov = shortsCoverage(ok, TOTAL);
assert.strictEqual(cov.covered, 26.5, `期望 11+8.5+7=26.5，实际 ${cov.covered}`);
assert.strictEqual(cov.count, 3);

const overlap = shortsCoverage({ shorts: [{ from_s: 0, to_s: 10 }, { from_s: 5, to_s: 15 }] }, TOTAL);
assert.strictEqual(overlap.covered, 15, `重叠要合并成 0-15，实际 ${overlap.covered}`);
assert.strictEqual(overlap.totalOutput, 20, '产出总长仍是 10+10=20');

const nested = shortsCoverage({ shorts: [{ from_s: 0, to_s: 20 }, { from_s: 5, to_s: 10 }] }, TOTAL);
assert.strictEqual(nested.covered, 20, '包含关系不能算成 25');

assert.strictEqual(shortsCoverage({ shorts: [] }, TOTAL).covered, 0);
assert.strictEqual(shortsCoverage({}, TOTAL).covered, 0);

// ---- 出片单 ----
const guide = toShortsGuide(ok, { total: TOTAL, platformId: 'douyin', masterName: 'final.mp4' });
assert.ok(guide.includes('-ss 00:00:00.000 -to 00:00:11.000'), 'ffmpeg 时间码格式');
assert.ok(guide.includes('-ss 00:00:12.500 -to 00:00:21.000'), '小数秒要转成毫秒');
assert.ok(guide.includes('Ctrl/Cmd+B'), '要给剪映做法');
assert.ok(guide.includes('每一支的开场字幕都必须换掉'), '要有那条最重要的警告');
assert.ok(guide.includes('S1.mp4'), '输出文件名');
assert.ok(guide.includes('88%'), `利用率 26.5/30 = 88%，实际：${guide.match(/（\d+%）/)?.[0]}`);
assert.ok(guide.includes('撑不起独立短片'), '不值得切的要列出来');
assert.ok(!guide.includes('undefined') && !guide.includes('NaN'));
assert.strictEqual(toShortsGuide({ shorts: [] }, { total: TOTAL }), '', '没有切片就不该出单');

// ---- prompt ----
const plan = {
  summary: '少女房收纳改造',
  timeline: [
    { slot: 1, beat: 'HOOK', assetId: 'A1', in: 0, out: 2, onscreen_text: '房间大改造', why: '最强画面' },
    { slot: 2, beat: 'PROOF', assetId: 'A2', in: 0, out: 3, vo: '亲自设计布局' },
    { slot: 3, beat: 'PAYOFF', assetId: 'A3', in: 0, out: 4, onscreen_text: '一门到顶极简' },
  ],
};
const timed = withOutputTimes(plan.timeline);
const pr = shortsPrompt({ plan, timed, total: planDuration(plan.timeline), count: 5, platformId: 'douyin', settings: {} });
assert.ok(pr.includes('0.00–2.00s'), '主片时间轴要带进去');
assert.ok(pr.includes('字幕「房间大改造」'), '字幕要带进去');
assert.ok(pr.includes('口播「亲自设计布局」'), '口播要带进去');
assert.ok(pr.includes('不许均分'), '硬规矩');
assert.ok(pr.includes('抖音'), '平台');
assert.ok(!pr.includes('undefined'), 'prompt 不能有 undefined');
assert.ok(!shortsPrompt({ plan: {}, timed: [], total: 0, platformId: 'xhs' }).includes('undefined'), '空输入也不能有 undefined');

console.log('✅ shorts 全部断言通过');
console.log(`   体检：时间码越界/倒序/非数字 · 声明时长不符 · 缺新开场 · 上文指代 · 占比过高 · 过短 · 开场撞车`);
console.log(`   覆盖率合并重叠区间：0-10 + 5-15 → ${overlap.covered}s（不是 20s）`);
