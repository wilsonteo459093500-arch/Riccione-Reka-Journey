import assert from 'node:assert';
import { parseMetrics, analyzeMetrics, metricsBrief } from '../src/services/metrics.js';

// ---- 解析：两条真实参考片就是最好的用例 ----
const a = parseMetrics('83.1K 赞 830 评论 41.1K 分享 37K 收藏');
assert.deepStrictEqual(a, { likes: 83100, comments: 830, shares: 41100, saves: 37000 }, JSON.stringify(a));

const b = parseMetrics('363 赞 ｜ 1,197 评论 ｜ 360 分享 ｜ 397 收藏');
assert.deepStrictEqual(b, { likes: 363, comments: 1197, shares: 360, saves: 397 }, JSON.stringify(b));

// 数字在后、英文、冒号
const c = parseMetrics('likes: 12.5K, comments 340, saves 2.1K, shares 890, views 1.2M');
assert.strictEqual(c.likes, 12500);
assert.strictEqual(c.comments, 340);
assert.strictEqual(c.saves, 2100);
assert.strictEqual(c.shares, 890);
assert.strictEqual(c.views, 1200000);

// 中文单位
assert.strictEqual(parseMetrics('12.3万赞').likes, 123000);
assert.strictEqual(parseMetrics('1.5亿播放').views, 150000000);
assert.strictEqual(parseMetrics('点赞 8888').likes, 8888);

// 「点赞」不能被「赞」抢走导致漏字段；「转发」要归到 shares
const d = parseMetrics('点赞 100 评论 20 转发 30 收藏 40');
assert.deepStrictEqual(d, { likes: 100, comments: 20, shares: 30, saves: 40 }, JSON.stringify(d));

// 空输入不能崩
assert.deepStrictEqual(parseMetrics(''), {});
assert.deepStrictEqual(parseMetrics(null), {});
assert.deepStrictEqual(parseMetrics('完全没有数字'), {});

// ---- 判定 ----
const A = analyzeMetrics(a); // palmier：分享 49%、收藏 45%
assert.ok(A.ok);
assert.ok(A.drivers.some((x) => x.key === 'shares'), '应判定为转发驱动');
assert.ok(A.drivers.some((x) => x.key === 'saves'), '也应判定为收藏驱动');
assert.ok(!A.drivers.some((x) => x.key === 'comments'), '评论只有 1%，不该算驱动');
assert.strictEqual(A.drivers[0].key, 'shares', '分享比例最高，应排第一');

const B = analyzeMetrics(b); // growithfyn：评论 330%
assert.ok(B.drivers.some((x) => x.key === 'comments'), '应判定为评论驱动');
assert.strictEqual(B.drivers[0].key, 'comments', '评论应排第一');
assert.ok(Math.abs(B.ratios.comments - 1197 / 363) < 1e-9, '比值要精确');

// 三项都平庸 → 不该硬判一个驱动
const flat = analyzeMetrics({ likes: 1000, comments: 60, shares: 90, saves: 100 });
assert.strictEqual(flat.drivers.length, 0, '常见区间内不该判定驱动');
assert.ok(flat.notes.some((n) => /画面本身和完播/.test(n)), '应说明它靠的是画面和完播');

// 没有赞数 → 明确说算不了，不要瞎猜
const noLikes = analyzeMetrics({ comments: 500 });
assert.strictEqual(noLikes.ok, false);
assert.strictEqual(noLikes.drivers.length, 0);
assert.ok(noLikes.notes[0].includes('相对它自己的赞数'));
assert.strictEqual(analyzeMetrics({}).ok, false);

// ---- 送进 prompt 的文本 ----
const briefA = metricsBrief(a);
assert.ok(briefA.includes('83,100'), '要带千分位原始数字');
assert.ok(briefA.includes('转发驱动'), '要点明引擎');
assert.ok(briefA.includes('不要重算'), '要明确告诉模型别自己做算术');
assert.ok(!briefA.includes('undefined') && !briefA.includes('NaN'), '不能有 undefined/NaN');

const briefB = metricsBrief(b);
assert.ok(briefB.includes('评论驱动'));
assert.ok(briefB.includes('330%'), `评论比值应为 330%，实际：${briefB.match(/评论 \/ 点赞 = \S+/)?.[0]}`);

// 没数据时必须返回空串，不能塞占位符进 prompt
assert.strictEqual(metricsBrief({}), '');
assert.strictEqual(metricsBrief({ comments: 10 }), '');

console.log('✅ metrics 全部断言通过');
console.log(`   palmier  → ${A.drivers.map((d) => d.name).join(' + ')}`);
console.log(`   growithfyn → ${B.drivers.map((d) => d.name).join(' + ')}`);

// ---- 接线：拆解 prompt 要真的带上数据 ----
const { deconstructPrompt } = await import('../src/prompts/deconstruct.js');
const withM = deconstructPrompt({ platformId: 'reels', mode: 'video', metrics: b, settings: {} });
assert.ok(withM.includes('评论驱动'), '拆解 prompt 要带上引擎判定');
assert.ok(withM.includes('1,197'), '要带原始数字');
assert.ok(withM.includes('"engine"'), '配方 schema 要有 engine 字段');
assert.ok(!withM.includes('undefined'), 'prompt 不能有 undefined');

const noM = deconstructPrompt({ platformId: 'reels', mode: 'video', settings: {} });
assert.ok(!noM.includes('真实互动数据'), '没数据时不该塞占位段落');
assert.ok(noM.includes('"engine"'), '没数据也要留 engine 字段（写「推测：」）');

// ---- 双语字幕 ----
const { toSRT, captionsFromTimeline } = await import('../src/services/exporters.js');
const srt = toSRT([
  { start: 0, end: 2, text: '就是带着我 4 岁的儿子', secondary: 'Taking my 4-year-old son' },
  { start: 2, end: 4, text: '只有中文这一句' },
]);
assert.ok(srt.includes('就是带着我 4 岁的儿子\nTaking my 4-year-old son'), '双语要写成两行');
assert.ok(/2\n00:00:02,000 --> 00:00:04,000\n只有中文这一句\n/.test(srt), '没有第二语言时保持单行');
assert.ok(!srt.includes('undefined'));

const caps = captionsFromTimeline([
  { slot: 1, assetId: 'A1', in: 0, out: 2, onscreen_text: '柜子做太浅', onscreen_text_en: 'Cabinets built too shallow' },
  { slot: 2, assetId: 'A1', in: 2, out: 4, onscreen_text: '没有英文' },
]);
assert.strictEqual(caps[0].secondary, 'Cabinets built too shallow');
assert.strictEqual(caps[1].secondary, '');
assert.ok(toSRT(caps).includes('柜子做太浅\nCabinets built too shallow'));

// ---- 留言换资料 ----
const { postPrompt } = await import('../src/prompts/post.js');
const pp = postPrompt({ platformId: 'xhs', topic: '玄关柜', settings: {} });
assert.ok(pp.includes('lead_magnet'), '发布包要有 lead_magnet');
assert.ok(pp.includes('ready_check'), '要有兑现检查');
assert.ok(pp.includes('1,197'), '要带上那个真实案例的数字');
assert.ok(pp.includes('不要硬装一个'), '不适合时要允许关掉');
assert.ok(!pp.includes('undefined'));

// ---- 字幕风格 ----
const { CAPTION_STYLES, captionStyleById } = await import('../src/constants.js');
const bi = captionStyleById('bilingual');
assert.strictEqual(bi.bilingual, true);
assert.ok(bi.ass.includes('MarginV=100'), '两行要抬高位置');
assert.strictEqual(captionStyleById('不存在的').id, CAPTION_STYLES[0].id, '未知 id 要回退');

console.log('✅ 接线全部通过（拆解带数据 / 双语 SRT / 留言换资料 / 字幕风格）');
