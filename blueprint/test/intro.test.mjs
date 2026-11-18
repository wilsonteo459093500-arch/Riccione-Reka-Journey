// 展厅播放 · 开场（showroom/intro.js）：称呼、三种语言的每一屏、时间轴（淡入淡出、播完进方案、音乐淡入点）
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import {
  introName, introScreens, introTimeline, introFrame, introMusicAt,
  HELLOS, INTRO_COPY, FADE_IN, HELLO_MS, NAME_AT,
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

test('开场每一屏：Hello → Selamat datang → 你好（下面写名字，「你好」只出现一次）→ 文案（不用标点）→ 空屏 → 品牌句收尾；中文 / English / 中英', () => {
  const zh = introScreens(proj({ lang: 'zh' }));
  assert.deepEqual(zh.slice(0, 3).map((s) => s.text), ['Hello', 'Selamat datang', '你好']);
  assert.deepEqual(zh.slice(0, 3).map((s) => s.name), ['', '', 'Mr Lau']);
  assert.equal(zh.length, HELLOS.length + INTRO_COPY.length);
  assert.equal(JSON.stringify(zh).split('你好').length - 1, 1, '「你好」只出现一次');
  assert.equal(zh.find((s) => s.id === 'rest').type, 'rest');
  assert.equal(zh.find((s) => s.id === 'nature').main, '我们一起\n在自然里\n寻一份平和');
  const last = zh.at(-1);
  assert.equal(last.id, 'brand');
  assert.equal(last.main, '行至溪岸\n回归生活的美好');
  assert.equal(last.last, true);
  assert.ok(!JSON.stringify(zh).includes('UKIR'), '开场里不出 UKIR');
  assert.ok(!JSON.stringify(zh).includes('轻触'), '播完自动进方案，不用点');

  const en = introScreens(proj({ lang: 'en' }));
  assert.equal(en[2].name, 'Mr Lau');
  assert.equal(en.find((s) => s.id === 'honour').main, 'It is an honour\nto become part of your home');
  assert.equal(en.find((s) => s.id === 'honour').lang, 'en');

  const bi = introScreens(proj({ lang: 'bi' }));
  const b = bi.find((s) => s.id === 'honour');
  assert.equal(b.main, '很荣幸\n能成为你家的一部分');
  assert.equal(b.sub, 'It is an honour\nto become part of your home');

  // 所有句子都不带标点（逗号处换行）
  for (const list of [zh, en, bi]) {
    for (const s of list.filter((x) => x.type === 'line')) {
      assert.ok(!/[，。；！、,.;!]/.test(s.main + s.sub), `有标点：${s.main} / ${s.sub}`);
    }
  }
  // 叫不出名字：只写「你好」，不写「朋友」
  assert.equal(introScreens(proj({ client: '', lang: 'zh' }))[2].name, '');
  assert.equal(introScreens(proj({ client: '刘先生', lang: 'zh' }))[2].name, '刘先生');
  assert.equal(introScreens(proj({ client: '刘先生', lang: 'en' }))[2].name, '');
  assert.equal(introScreens(proj({ greetAs: 'Jason & Mei', lang: 'zh' }))[2].name, 'Jason & Mei');
});

test('时间轴：每屏开始时字还没出来、中间完全清楚；手写从左到右写出来；超过总长停在最后一屏', () => {
  const tl = introTimeline(introScreens(proj()));
  const first = introFrame(0, tl);
  assert.equal(first.screen.type, 'hello');
  assert.equal(first.write, 0);
  assert.equal(introFrame(HELLO_MS * 0.7, tl).write, 1);
  // 「你好」那一屏：字写完后名字才浮出来
  const hi = tl.items[2];
  assert.equal(introFrame(hi.start + 200, tl).nameIn, 0);
  assert.equal(introFrame(hi.start + NAME_AT + FADE_IN + 50, tl).nameIn, 1);
  assert.equal(introFrame(tl.items[0].start + 500, tl).nameIn, 0);
  const honour = tl.items.find((it) => it.id === 'honour');
  assert.equal(introFrame(honour.start, tl).opacity, 0);
  const mid = introFrame(honour.start + FADE_IN + 100, tl);
  assert.equal(mid.screen.id, 'honour');
  assert.equal(mid.opacity, 1);
  assert.equal(mid.blur, 0);
  assert.equal(mid.ty, 0);
  assert.ok(introFrame(honour.end - 1, tl).opacity < 0.05, '离开前淡掉');
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
