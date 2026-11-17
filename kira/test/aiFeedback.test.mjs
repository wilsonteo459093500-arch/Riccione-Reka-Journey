// 业务按 👎 的 AI 识图反馈（scripts/feedback-pull.mjs 拉下来的 test/fixtures/ai-feedback/*.json）：
// 规则改一次，旧反馈全部重跑 buildSuggestions。设了 "expect": "unpicked" 的那几笔，被 👎 的建议现在一定要「不勾 + 写原因」。
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from './harness.mjs';
import { buildSuggestions } from '../src/planner/planAi.js';

const dir = new URL('./fixtures/ai-feedback/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const cases = files.map((f) => ({ f, ...JSON.parse(readFileSync(new URL(f, dir), 'utf8')) }));

test('AI feedback fixtures: every one still builds without throwing', () => {
  assert.ok(cases.length >= 1);
  cases.forEach((c) => {
    const p = c.ai?.plan;
    if (!p?.scale) return; // 没定比例时的反馈：没得重跑
    const plan = { id: 'fb', name: 'fb', image: { path: 'local:fb', w: p.w, h: p.h, kind: 'img', page: 1 }, scale: p.scale };
    assert.doesNotThrow(() => buildSuggestions(c.ai.result, plan, { sentW: c.ai.sentW, crop: c.ai.crop }), c.f);
  });
});

test('AI feedback fixtures marked "unpicked": the 👎 suggestion is now not ticked, with a reason', () => {
  cases.filter((c) => c.expect === 'unpicked').forEach((c) => {
    const p = c.ai.plan;
    const plan = { id: 'fb', name: 'fb', image: { path: 'local:fb', w: p.w, h: p.h, kind: 'img', page: 1 }, scale: p.scale };
    const s = buildSuggestions(c.ai.result, plan, { sentW: c.ai.sentW, crop: c.ai.crop });
    const id = c.suggestion?.id;
    const mine = s.filter((x) => x.id === id || x.group === id);
    assert.ok(mine.length, `${c.f}: suggestion ${id} not found`);
    mine.forEach((x) => {
      assert.ok(!x.ok || x.pick === false, `${c.f}: ${id} is still ticked`);
      assert.ok(x.reason || x.why?.length, `${c.f}: ${id} has no reason`);
    });
  });
});
