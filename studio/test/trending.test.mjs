import assert from 'node:assert';
import { humanCount, humanDuration, sinceNow, hasOfficialChart, hotNowPrompt } from '../src/services/trending.js';

// 数字要看着不费劲
assert.strictEqual(humanCount(842), '842');
assert.strictEqual(humanCount(1234), '1.2K');
assert.strictEqual(humanCount(12345), '1.2万');
assert.strictEqual(humanCount(123456), '12万');
assert.strictEqual(humanCount(123456789), '1.2亿');
assert.strictEqual(humanCount(undefined), '0');

assert.strictEqual(humanDuration('PT45S'), '0:45');
assert.strictEqual(humanDuration('PT2M8S'), '2:08');
assert.strictEqual(humanDuration('PT1H3M9S'), '1:03:09');
assert.strictEqual(humanDuration(''), '');

assert.strictEqual(sinceNow(new Date(Date.now() - 5 * 36e5).toISOString()), '5 小时前');
assert.strictEqual(sinceNow(new Date(Date.now() - 3 * 864e5).toISOString()), '3 天前');
assert.strictEqual(sinceNow('乱写'), '');

// 只有 YouTube 有官方榜可拉 —— 别的平台如果返回 true，UI 会打上「真实榜单」的标，那是撒谎
assert.strictEqual(hasOfficialChart('shorts'), true);
for (const id of ['xhs', 'douyin', 'reels', 'tiktok', 'wechat']) {
  assert.strictEqual(hasOfficialChart(id), false, `${id} 不该被标成有官方榜`);
}

// prompt 必须带上今天的日期，否则模型会按训练截止日期答
const prompt = hotNowPrompt({ platformId: 'reels', niche: '全屋定制' });
const today = new Date().toISOString().slice(0, 10);
assert.ok(prompt.includes(today), 'prompt 要带今天日期');
assert.ok(prompt.includes('Instagram Reels'), '平台名');
assert.ok(prompt.includes('全屋定制'), '赛道');
assert.ok(prompt.includes('```json'), '要求围栏 JSON（接地不能用 responseMimeType）');
assert.ok(prompt.includes('不要靠印象补'), '禁止编造');
assert.ok(prompt.includes('不是工厂'), '带上品牌边界');
assert.ok(!prompt.includes('undefined'), 'prompt 里不能有 undefined');

// 没填赛道时要有兜底，不能出现空洞的占位
const bare = hotNowPrompt({ platformId: 'xhs' });
assert.ok(bare.includes('室内设计'), '赛道兜底');
assert.ok(!bare.includes('undefined'));

console.log('✅ trending 断言通过');
