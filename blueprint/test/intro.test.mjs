// 展厅播放 · 开场（showroom/intro.js）：称呼、三种语言的每一屏、时间轴（淡入淡出、播完进方案、音乐淡入点）
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import {
  introName, introScreens, introTimeline, introFrame, introMusicAt,
  HELLOS, INTRO_COPY, FADE_IN, HELLO_MS,
} from '../src/showroom/intro.js';

const proj = (info = {}, translations = {}) => ({ info: { client: 'Mr Lau', location: 'Muar', date: '2026 · 08', ...info }, translations });

test('开场称呼：先「开场称呼」，再「客户」（两行并成一行）；都没有 = 朋友 / friend；中文名的英文取翻译记忆', () => {
  assert.deepEqual(introName(proj()), { zh: 'Mr Lau', en: 'Mr Lau', zhKnown: true, enKnown: true });
  assert.equal(introName(proj({ greetAs: ' Jason & Mei ' })).zh, 'Jason & Mei');
  assert.equal(introName(proj({ client: '刘先生\n刘太太' })).zh, '刘先生刘太太');
  const anon = introName(proj({ client: '  ' }));
  assert.deepEqual([anon.zh, anon.en, anon.zhKnown], ['朋友', 'friend', false]);
  const zhOnly = introName(proj({ client: '刘先生' }));
  assert.deepEqual([zhOnly.en, zhOnly.enKnown], ['friend', false]);
  assert.equal(introName(proj({ client: '刘先生' }, { 刘先生: 'Mr Lau' })).en, 'Mr Lau');
});

test('开场每一屏：三个手写问候 → 文案 → 空屏 → 品牌句收尾（不出 UKIR、没有「轻触开始」）；中文 / English / 中英', () => {
  const zh = introScreens(proj({ lang: 'zh' }));
  assert.deepEqual(zh.slice(0, 3).map((s) => s.text), HELLOS.map((h) => h.text));
  assert.equal(zh.length, HELLOS.length + INTRO_COPY.length);
  const greet = zh.find((s) => s.id === 'greet');
  assert.equal(greet.main, '你好，Mr Lau');
  assert.equal(greet.sub, '');
  assert.equal(zh.find((s) => s.id === 'rest').type, 'rest');
  const last = zh.at(-1);
  assert.equal(last.id, 'brand');
  assert.equal(last.main, '行至溪岸，\n回归生活的美好。');
  assert.equal(last.last, true);
  assert.ok(!JSON.stringify(zh).includes('UKIR'), '开场里不出 UKIR');
  assert.ok(!JSON.stringify(zh).includes('轻触'), '播完自动进方案，不用点');
  for (const s of zh.filter((x) => x.type === 'line')) assert.ok(!/[!！]/.test(s.main), '不用感叹号');

  const en = introScreens(proj({ lang: 'en' }));
  assert.equal(en.find((s) => s.id === 'greet').main, 'Hello, Mr Lau');
  assert.equal(en.find((s) => s.id === 'greet').lang, 'en');
  assert.equal(en.at(-1).main, 'Walk to the stream,\nreturn to the beauty of everyday life.');

  const bi = introScreens(proj({ lang: 'bi' }));
  const b = bi.find((s) => s.id === 'honour');
  assert.equal(b.main, '很荣幸，\n能成为你家的一部分。');
  assert.equal(b.sub, 'It is an honour\nto become part of your home.');
  assert.equal(introScreens(proj({ client: '', lang: 'zh' })).find((s) => s.id === 'greet').main, '你好，朋友');
});

test('时间轴：每屏开始时字还没出来、中间完全清楚；手写从左到右写出来；超过总长停在最后一屏', () => {
  const tl = introTimeline(introScreens(proj()));
  const first = introFrame(0, tl);
  assert.equal(first.screen.type, 'hello');
  assert.equal(first.write, 0);
  assert.equal(introFrame(HELLO_MS * 0.7, tl).write, 1);
  const greet = tl.items.find((it) => it.id === 'greet');
  assert.equal(introFrame(greet.start, tl).opacity, 0);
  const mid = introFrame(greet.start + FADE_IN + 100, tl);
  assert.equal(mid.screen.id, 'greet');
  assert.equal(mid.opacity, 1);
  assert.equal(mid.blur, 0);
  assert.equal(mid.ty, 0);
  assert.ok(introFrame(greet.end - 1, tl).opacity < 0.05, '离开前淡掉');
  // 空屏：什么都不显示
  const rest = tl.items.find((it) => it.type === 'rest');
  assert.equal(introFrame(rest.start + 500, tl).opacity, 0);
  // 品牌句：淡入后一直清楚，不自己淡掉（和整层一起淡出，接到方案封面）；播完 = done
  const brand = tl.items.find((it) => it.id === 'brand');
  assert.equal(introFrame(brand.end - 1, tl).opacity, 1);
  assert.equal(introFrame(brand.end - 1, tl).done, false);
  assert.equal(introFrame(tl.total, tl).done, true);
  assert.equal(tl.total, brand.end);
  // 全长约 30 秒；音乐从品牌句淡入
  assert.ok(tl.total > 25000 && tl.total < 35000, `全长 ${tl.total}`);
  assert.equal(introMusicAt(tl), tl.items.find((it) => it.id === 'brand').start);
});
