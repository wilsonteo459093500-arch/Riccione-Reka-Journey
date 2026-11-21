// 展厅播放敢给客户看（体检第 1 阶段，2026-11-21）：
// 说明栏不冲出屏幕 · 播放前检查的规则 · 滚轮一格翻一页 / 滑过一小段就翻 · 新版上线的比对
// （方向键被「调整版面」抢走、Esc 两次、点击翻页、出错退回静态原图、防熄屏 —— 要真的浏览器，见 test/browser/showroom.mjs）
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { renderDeck, exportableSlides } from '../src/engine/deck.js';
import { buildStops } from '../src/showroom/timeline.js';
import { FULL_NOTES_TOP, FULL_NOTES_BOTTOM } from '../src/engine/b/design.js';
import { showroomHealth, showWarning, sortIssues } from '../src/showroom/health.js';
import { snapTarget, snapToward, isWheelStep, WHEEL_COMMIT } from '../src/showroom/motion.js';
import { isNewer, checkUpdate } from '../src/lib/appVersion.js';

const SIZES = { '/living.jpg': [2400, 1350], '/kitchen.jpg': [2400, 1526], '/m.jpg': [600, 600] };
const meta = (src) => (SIZES[src] ? { w: SIZES[src][0], h: SIZES[src][1] } : null);

const LONG = [
  { label: '隐形门', text: '整面护墙板里藏了一扇通往储物间的门，液压闭门器配反弹器，关上以后和墙面的分缝完全对齐，看不出门在哪里。' },
  { label: '灯光', text: '吊柜底部和开放格里都嵌了 3000K 的 LED 灯带，晚上不开主灯也够亮，柜体的木纹在暖光下会更明显一些。' },
  { label: '收纳', text: '电视柜下方整排抽屉做了阻尼滑轨，最右边一格留给路由器和机顶盒，背板开了散热孔，线都从墙里走。' },
  { label: '台面', text: '岛台用整块岩板，四边做了海棠角，转角摸上去是圆的；台面往客厅一侧挑出 30 公分，可以坐两个人。' },
];

function sample(lang = 'zh', notes = LONG) {
  return {
    id: 'p-safe',
    name: 'Safe',
    version: 1,
    info: { client: 'Mr Lau', location: 'Muar', date: '2026 · 08', lang, team: [] },
    floors: [{ id: 'f1', zh: '一楼', en: 'GROUND FLOOR', image: null }],
    materials: [{ id: 'm1', name: '浅川橡', code: 'AG273', image: '/m.jpg' }],
    slides: [
      { id: 's-f1', kind: 'floor', floorId: 'f1', enabled: true },
      { id: 'v-full', kind: 'view', enabled: true, floorId: 'f1', layout: 'full', image: '/living.jpg', room: '客厅', subtitle: '电视墙', materials: [{ role: '柜体', materialId: 'm1' }], notes },
      { id: 'v-plate', kind: 'view', enabled: true, floorId: 'f1', layout: 'plate', image: '/kitchen.jpg', room: '厨房', subtitle: '岛台', materials: [{ role: '柜体', materialId: 'm1' }], notes: [] },
    ],
    translations: {},
  };
}
const stopsOf = (project) => buildStops(exportableSlides(renderDeck(project, { meta })), project);
const noteEls = (st) => st.page.els.filter((el) => /^showroom/.test(el.name || ''));

test('说明栏有高度上限：中英版 4 条长说明不再冲出屏幕、不压右上角的 logo —— 放不下的后几条不显示，显示的每条完整', () => {
  for (const lang of ['zh', 'en', 'bi']) {
    const st = stopsOf(sample(lang)).find((s) => s.slide?.id === 'v-full');
    const els = noteEls(st);
    const texts = els.filter((el) => el.t === 'text');
    assert.ok(texts.length >= 2, `${lang} 有说明`);
    const top = Math.min(...texts.map((el) => el.y));
    const bottom = Math.max(...texts.map((el) => el.y + el.h));
    // 文字框比字的行顶 / 行底各宽出几 px（行距的留白），所以放 8 px 的余量
    assert.ok(top >= FULL_NOTES_TOP - 8, `${lang} 说明栏最高到屏幕一半（${top}）`);
    assert.ok(bottom <= FULL_NOTES_BOTTOM + 8, `${lang} 底不变（${bottom}）`);
    // 右上角的 logo：说明栏的字和它不相交
    const logo = st.page.els.find((el) => el.t === 'img' && el.x >= 1400 && el.y < 200 && !/^showroom/.test(el.name || '') && el.name !== 'photo:image');
    assert.ok(logo, `${lang} 找得到右上角的 logo`);
    assert.ok(top > logo.y + logo.h, `${lang} 说明在 logo 下面`);
    assert.ok(st.notes.total === 4 && st.notes.shown >= 1 && st.notes.shown <= 4, `${lang} 记下显示了几条`);
  }
  // 中英版放不下 4 条：只放前几条；显示的是前面的（按设计师写的顺序）
  const bi = stopsOf(sample('bi')).find((s) => s.slide?.id === 'v-full');
  assert.ok(bi.notes.shown < bi.notes.total, `中英版 4 条长说明放不下（放了 ${bi.notes.shown} 条）`);
  const text = noteEls(bi).filter((el) => el.t === 'text').map((el) => JSON.stringify(el.paras)).join('');
  assert.ok(text.includes('隐形门') && !text.includes('台面'), '留下的是前面几条，后面的不显示');
  // 短说明：4 条照旧全放
  const short = [1, 2, 3, 4].map((k) => ({ label: `要点 ${k}`, text: '一句短说明' }));
  const st = stopsOf(sample('zh', short)).find((s) => s.slide?.id === 'v-full');
  assert.deepEqual(st.notes, { shown: 4, total: 4, cut: 0 });
  // 写了 6 条：最多 4 条，并且记下「写了 6 条」
  const six = stopsOf(sample('zh', [...short, { label: '五', text: '五' }, { label: '六', text: '六' }])).find((s) => s.slide?.id === 'v-full');
  assert.equal(six.notes.total, 6);
  assert.equal(six.notes.shown, 4);
  // 图文页、没有说明的页：不带 notes
  assert.equal(stopsOf(sample('zh')).find((s) => s.slide?.id === 'v-plate').notes, undefined);
});

test('播放前检查：缺图、3D 画不出来是「会出问题」；说明放不下、页面提醒是「留意」；全部正常 = ok', () => {
  const clean = sample('zh', [{ label: '灯光', text: '吊柜底部嵌 LED 灯带' }]);
  const ok = showroomHealth(stopsOf(clean));
  assert.deepEqual(ok.issues, []);
  assert.equal(ok.ok, true);
  assert.equal(ok.missing, null);

  // 说明放不下
  const bi = showroomHealth(stopsOf(sample('bi')));
  const it = bi.issues.find((x) => x.slideId === 'v-full');
  assert.ok(it && it.level === 'warn');
  assert.ok(it.msgs.some((m) => /设计说明写了 4 条，播放时右下角只放得下前 \d 条/.test(m)), it.msgs.join(' | '));
  assert.ok(!it.msgs.some((m) => /满版大图不显示说明/.test(m)), '导出时那句「满版大图不显示说明」播放时不适用');
  assert.equal(bi.ok, false);
  // 中英版缺英文：汇总成一条（不逐页重复）
  assert.ok(bi.missing && bi.missing.count > 0);
  assert.ok(!bi.issues.some((x) => x.msgs.some((m) => /还没有英文/.test(m))));

  // 缺图：调用方说这一页有图找不到
  const stops = stopsOf(clean);
  const lost = showroomHealth(stops, { missingImages: (page) => (page.slideId === 'v-plate' ? 1 : 0) });
  const li = lost.issues.find((x) => x.slideId === 'v-plate');
  assert.equal(li.level, 'error');
  assert.match(li.msgs.join(''), /图片在本机找不到/);
  assert.equal(li.page, stops.findIndex((s) => s.slide?.id === 'v-plate') + 1, '页码 = 第几个停点');

  // 3D 开场：画不出来 = 会出问题；还在画 = 不算问题，只数一下
  const with3d = [...stops.slice(0, 1), { key: '3d:f1', plan3d: { id: 'f1' }, page: { kind: 'plan3d', els: [] }, slide: null, label: '一楼 · 3D 户型' }, ...stops.slice(1)];
  const failed = showroomHealth(with3d, { plan3d: () => 'failed' });
  assert.equal(failed.issues[0].key, '3d:f1');
  assert.equal(failed.issues[0].level, 'error');
  assert.match(failed.issues[0].msgs[0], /3D 户型开场画不出来.*跳过/);
  const pending = showroomHealth(with3d, { plan3d: () => 'pending' });
  assert.equal(pending.pending3d, 1);
  assert.equal(pending.ok, true);

  // 排序：会出问题的排前面
  const sorted = sortIssues([{ level: 'warn', page: 1 }, { level: 'error', page: 5 }, { level: 'error', page: 3 }]);
  assert.deepEqual(sorted.map((x) => x.page), [3, 5, 1]);
});

test('播放前检查：「满版大图不显示…」那句照播放时的实际情况改写', () => {
  assert.equal(showWarning('满版大图不显示说明 —— 要列出来请换成「图文」版式'), null);
  assert.match(showWarning('满版大图不显示说明与材料 —— 要列出来请换成「图文」版式'), /材料/);
  assert.doesNotMatch(showWarning('满版大图不显示说明与材料 —— 要列出来请换成「图文」版式'), /说明/);
  assert.match(showWarning('满版大图不显示材料 —— 要列出来请换成「图文」版式'), /材料/);
  assert.equal(showWarning('图片像素偏低'), '图片像素偏低');
});

test('滚轮：有刻度的鼠标一格 = 翻一页；触控板的小步 = 跟手滑，滑过一小段就翻过去、没到就回原页', () => {
  // 一格：Windows 鼠标 100 px；Firefox 按行报；macOS 鼠标只有几 px 但 wheelDeltaY 是 120 的倍数
  assert.equal(isWheelStep({ deltaMode: 0, wheelDeltaY: -120 }, 100), true);
  assert.equal(isWheelStep({ deltaMode: 1 }, 120), true);
  assert.equal(isWheelStep({ deltaMode: 0, wheelDeltaY: -120 }, 4.000244140625), true);
  // 高分屏（缩放 200%）：一格只报 50 px —— 乘回缩放倍数才认得出（浏览器测试里实测到的）
  assert.equal(isWheelStep({ deltaMode: 0, wheelDeltaY: -60 }, 50, 2), true);
  assert.equal(isWheelStep({ deltaMode: 0, wheelDeltaY: -60 }, 50, 1), false);
  assert.equal(isWheelStep({ deltaMode: 0, wheelDeltaY: -80 }, 66.7, 1.5), true);
  // 触控板：小步、wheelDeltaY 不是 120 的倍数
  assert.equal(isWheelStep({ deltaMode: 0, wheelDeltaY: -9 }, 3), false);
  assert.equal(isWheelStep({ deltaMode: 0, wheelDeltaY: -66 }, 22), false);
  assert.equal(isWheelStep({ deltaMode: 0, wheelDeltaY: 0 }, 0), false);
  // 停手后：过了一小段就翻（以前要过半页 = 鼠标 10 格），没到就回去；一次最多一页；不出头尾
  assert.equal(snapToward(3 + WHEEL_COMMIT + 0.01, 3, 10), 4);
  assert.equal(snapToward(3.05, 3, 10), 3);
  assert.equal(snapToward(3 - WHEEL_COMMIT - 0.01, 3, 10), 2);
  assert.equal(snapToward(3.9, 3, 10), 4);
  assert.equal(snapToward(0, 0, 10), 0);
  assert.equal(snapToward(-0.5, 0, 10), 0);
  assert.equal(snapToward(9.4, 9, 10), 9);
  assert.equal(snapTarget(3.2, 10), 3, '拖动 / 按键照旧吸到最近一页');
  for (let p = 0; p <= 9; p += 0.07) assert.ok(Number.isInteger(snapToward(p, Math.round(p), 10)), '吸附的结果一定是整页（停下来就是原图）');
});

test('新版上线：版本号不一样才提示；本机开发、读不到、断网都不提示', async () => {
  assert.equal(isNewer('a1', 'b2'), true);
  assert.equal(isNewer('a1', 'a1'), false);
  assert.equal(isNewer('dev', 'b2'), false);
  assert.equal(isNewer('a1', ''), false);
  assert.equal(isNewer('a1', undefined), false);
  const fake = (body, ok = true) => async (url, opts) => {
    assert.match(url, /^\/version\.json\?t=\d+$/);
    assert.equal(opts.cache, 'no-store');
    return { ok, json: async () => body };
  };
  assert.equal(await checkUpdate({ current: 'dev', fetchFn: fake({ id: 'b2' }) }), false, '本机开发不检查');
  assert.equal(await checkUpdate({ current: 'a1', fetchFn: fake({ id: 'a1' }) }), false, '同一版');
  assert.equal(await checkUpdate({ current: 'a1', fetchFn: fake({ id: 'b2' }, false) }), false, '服务器没给');
  assert.equal(await checkUpdate({ current: 'a1', fetchFn: async () => { throw new Error('offline'); } }), false, '断网');
  assert.equal(await checkUpdate({ current: 'a1', fetchFn: fake({ id: 'b2' }) }), true, '有新版');
});
