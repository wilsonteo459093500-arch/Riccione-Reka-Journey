// 房间设计特点（src/showroom/craft.js + timeline / motion / b/design.js bCraftPage）
// 规矩：只从图纸文字建议（带原文）、不编；设计师打勾才出现；定义老板审过才播（词库与 cabinet-craft.md 一字不差）；
// 原页的停点照旧是原图；设计特点页上的效果图是整张（不裁），过渡两头和两页的原样一模一样。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { test } from './harness.mjs';
import { renderDeck, exportableSlides } from '../src/engine/deck.js';
import {
  CRAFT_VOCAB, CRAFT_COPY, CRAFT_MAX, craftById, detectCrafts, matchEntry, playableCrafts, toggleCraft, craftText, isPlayable,
} from '../src/showroom/craft.js';
import { buildStops, transitionKind, indexOf, transitionWeight } from '../src/showroom/timeline.js';
import { layerMotion, morphRects, imageRects } from '../src/showroom/motion.js';
import { CRAFT_COL } from '../src/engine/b/design.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MD = path.join(here, '../../.claude/skills/interior-design-expert/references/cabinet-craft.md');

// ---------------------------------------------------------------------------
// 词库 = 老板审稿的那份 md
// ---------------------------------------------------------------------------

function mdRows() {
  const text = readFileSync(MD, 'utf8');
  const rows = [];
  const copy = [];
  let group = null;
  for (const line of text.split('\n')) {
    if (/^## 一、/.test(line)) group = 'craft';
    else if (/^## 二、/.test(line)) group = 'method';
    else if (/^## 四、/.test(line)) group = 'copy';
    else if (/^## /.test(line)) group = null;
    if (!group || !/^\|\s*\*\*/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    const name = cells[0].replace(/\*\*/g, '').trim();
    const dash = (v) => (v === '—' ? '' : v);
    if (group === 'copy') copy.push({ name, title: dash(cells[1]), feature: dash(cells[2]), advantage: dash(cells[3]), en: cells[4], enTitle: dash(cells[5]), enFeature: dash(cells[6]), enAdvantage: dash(cells[7]), status: cells[8] });
    else rows.push({ group, name, oneLine: cells[1], benefit: cells[2] });
  }
  return { rows, copy };
}

test('词库和 cabinet-craft.md 一字不差（第一、二节：名称、一句话、好处）', () => {
  const { rows } = mdRows();
  const vocab = CRAFT_VOCAB.filter((e) => e.group !== 'series'); // 溪岸系列没有研究底稿
  assert.equal(rows.length, vocab.length, `md 有 ${rows.length} 条，词库有 ${vocab.length} 条`);
  rows.forEach((r, i) => {
    const e = vocab[i];
    assert.equal(e.mdName || e.zh, r.name, `第 ${i + 1} 条名称`);
    assert.equal(e.group, r.group, `${r.name} 的分组`);
    assert.equal(e.oneLine, r.oneLine, `${r.name} 的一句话`);
    assert.equal(e.benefit, r.benefit, `${r.name} 的好处`);
  });
});

test('溪岸文案和 md 第四节一字不差（中英文 + 状态）：老板审这一张，✅ 才播', () => {
  const { copy } = mdRows();
  assert.equal(copy.length, CRAFT_VOCAB.length, '每一条都有溪岸文案');
  copy.forEach((r, i) => {
    const e = CRAFT_VOCAB[i];
    const c = CRAFT_COPY[e.id];
    assert.equal(r.name, e.zh, `第 ${i + 1} 条名称`);
    assert.ok(c, `${e.zh} 缺溪岸文案`);
    for (const k of ['title', 'feature', 'advantage']) assert.equal(c.zh[k], r[k], `${e.zh} 的 ${k}`);
    assert.equal(c.en.name, r.en, `${e.zh} 的英文名`);
    assert.equal(c.en.title, r.enTitle, `${e.zh} 的英文题眼`);
    assert.equal(c.en.feature, r.enFeature, `${e.zh} 的英文特点`);
    assert.equal(c.en.advantage, r.enAdvantage, `${e.zh} 的英文优势`);
    const want = r.status.startsWith('✅') ? 'approved' : r.status.startsWith('官方') ? 'official' : 'pending';
    assert.equal(c.status, want, `${e.zh} 的状态：md「${r.status}」`);
    assert.equal(e.status, c.status);
  });
});

test('溪岸五大系列：文字和品牌官方说法（invite/.../visi/data.js MB.SERIES_CONCEPT）一字不差，状态是官方、可以播', () => {
  const win = {};
  vm.runInNewContext(readFileSync(path.join(here, '../../invite/assets/js/visi/data.js'), 'utf8'), { window: win });
  const MB = win.MB;
  const series = CRAFT_VOCAB.filter((e) => e.group === 'series');
  assert.deepEqual(series.map((e) => e.series), Array.from(MB.SERIES, (s) => s.key), '五个系列，顺序和品牌一样');
  for (const e of series) {
    const c = CRAFT_COPY[e.id];
    const off = MB.SERIES_CONCEPT[e.series];
    const meta = MB.SERIES_OF[e.series];
    assert.equal(e.zh, `${meta.zh}系列`);
    assert.equal(c.en.name, `${meta.en} Series`);
    assert.equal(c.zh.title, off.title.zh, `${e.zh} 题眼 = 官方题眼`);
    assert.equal(c.zh.feature, off.note.zh, `${e.zh} 特点 = 官方理念`);
    assert.equal(c.zh.advantage, '', `${e.zh} 官方没有优势，不编`);
    assert.equal(c.en.title, off.title.en);
    assert.equal(c.en.feature, off.note.en);
    assert.equal(c.status, 'official');
    assert.ok(isPlayable(e));
  }
  // 图纸上写系列名就建议；「骨骼线系列」只建议系列、不建议骨骼线工艺；「织」单字不认
  assert.deepEqual(detectCrafts(view({ notes: [{ label: '', text: '空山系列展示柜' }] })).map((x) => x.id), ['s_mountain']);
  assert.deepEqual(detectCrafts(view({ notes: [{ label: '', text: '骨骼线系列衣柜' }] })).map((x) => x.id), ['s_skeleton']);
  assert.deepEqual(detectCrafts(view({ notes: [{ label: '', text: '骨骼线门板' }] })).map((x) => x.id), ['gugexian', 's_skeleton']);
  assert.deepEqual(detectCrafts(view({ notes: [{ label: '', text: '编织纹理背板' }] })), []);
  assert.deepEqual(detectCrafts(view({ subtitle: '雾山 · 白天' })).map((x) => x.id), ['s_misty']);
});

test('溪岸文案：题眼 ≤ 24 字、特点 / 优势 ≤ 40 字（系列的官方理念另算 ≤ 56）；每条都有特点和英文；不用 md 的 ** 强调', () => {
  for (const e of CRAFT_VOCAB) {
    const t = craftText(e, 'bi');
    const series = e.group === 'series';
    assert.ok(t.zh.title.length <= 24, `${e.zh} 题眼 ${t.zh.title.length} 字`);
    assert.ok(t.zh.feature && t.zh.feature.length <= (series ? 56 : 40), `${e.zh} 特点 ${t.zh.feature.length} 字`);
    assert.ok(t.zh.advantage.length <= 40, `${e.zh} 优势 ${t.zh.advantage.length} 字`);
    if (!series) assert.ok(t.zh.advantage, `${e.zh} 要有优势`);
    assert.ok(t.en && t.en.name && t.en.feature, `${e.zh} 英文`);
    assert.ok(!/\*/.test(t.zh.title + t.zh.feature + t.zh.advantage));
  }
  // 骨骼线（工艺）：全部官方原文，没有题眼
  const g = craftText(craftById('gugexian'));
  assert.equal(g.zh.title, '');
  assert.match(g.zh.feature, /骨骼结构既是装饰，也是把手/);
  assert.match(g.zh.advantage, /细线框让每扇柜门都有一道影子/);
});

test('词库：id 不重复；每条至少一个别名，名称本身在别名里；骨骼线用溪岸官方说法', () => {
  const ids = CRAFT_VOCAB.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const e of CRAFT_VOCAB) {
    assert.ok(e.aliases.length, e.id);
    assert.ok(['pending', 'approved', 'official'].includes(e.status), e.id);
  }
  const g = craftById('gugexian');
  assert.equal(g.status, 'official');
  assert.ok(isPlayable(g));
  assert.match(craftText(g, 'zh').zh.feature, /骨骼结构既是装饰，也是把手/);
  assert.ok(craftText(g, 'en').en.advantage);
  // 去掉 md 的 ** 强调
  assert.ok(!craftText(craftById('zhuifeng')).zh.feature.includes('*'));
});

// ---------------------------------------------------------------------------
// 认出来：只认图纸上写着的，带原文
// ---------------------------------------------------------------------------

const view = (extra = {}) => ({ id: 'v', kind: 'view', notes: [], materials: [], subtitle: '', ...extra });

test('建议：标注里写着的词条 → 建议，带上哪一条、原文', () => {
  const s = view({ notes: [{ label: '收口', text: '柜体外转角做海棠角' }, { label: '层板', text: 'ABA 夹心层板，中间胡桃色' }] });
  const got = detectCrafts(s);
  assert.deepEqual(got.map((x) => x.id), ['haitang', 'jiaxin']);
  assert.equal(got[0].evidence.where, '标注 1');
  assert.equal(got[0].evidence.text, '收口：柜体外转角做海棠角');
  assert.equal(got[1].evidence.where, '标注 2');
});

test('建议：英文术语、视角名、材料部位也认；空格、大小写不影响', () => {
  assert.deepEqual(detectCrafts(view({ notes: [{ label: '隐形门 · Hidden door', text: '液压闭门器，配反弹器' }] })).map((x) => x.id), ['yinxingmen']);
  // 只写「骨骼线」：工艺和系列都建议，设计师挑
  assert.deepEqual(detectCrafts(view({ subtitle: '骨骼线 衣柜' })).map((x) => x.id), ['gugexian', 's_skeleton']);
  assert.deepEqual(detectCrafts(view({ materials: [{ role: '拉 槽门板', materialId: 'm' }] })).map((x) => x.id), ['lacao']);
  assert.equal(matchEntry(craftById('yinxingmen'), 'HIDDEN DOOR'), 'hidden door');
});

test('建议：没写的不猜；否定（不做 / 取消 / 无）不算；夹心板（板材）不算；拉丁字要整词', () => {
  assert.deepEqual(detectCrafts(view({ notes: [{ label: '柜门', text: '免拉手，浅川橡' }] })), []);
  assert.deepEqual(detectCrafts(view({ notes: [{ label: '', text: '转角不做海棠角' }] })), []);
  assert.deepEqual(detectCrafts(view({ notes: [{ label: '', text: '取消隐形门' }] })), []);
  assert.deepEqual(detectCrafts(view({ notes: [{ label: '', text: '鞋柜无透气孔' }] })), []);
  assert.deepEqual(detectCrafts(view({ notes: [{ label: '', text: '18mm 夹心板柜体' }] })), []);
  assert.equal(matchEntry(craftById('jiaxin'), 'abacus'), null);
  // 一句里既有否定也有肯定：后面那个算
  assert.equal(matchEntry(craftById('haitang'), '台面不做海棠角，高柜立板做海棠角'), '海棠角');
});

test('勾选：toggleCraft 按勾的先后，不重复；词库里没有的 id 丢掉', () => {
  let l = toggleCraft(undefined, 'haitang', true);
  l = toggleCraft(l, 'jiaxin', true);
  l = toggleCraft(l, 'haitang', true);
  assert.deepEqual(l, ['haitang', 'jiaxin']);
  assert.deepEqual(toggleCraft(['nope', 'haitang'], 'jiaxin', false), ['haitang']);
});

test('播放：只放勾过 + 审过的；待审的要内部预览才放；English 版要有英文；最多 3 个', () => {
  const s = view({ crafts: ['haitang', 'gugexian'] });
  assert.deepEqual(playableCrafts(s).entries.map((e) => e.id), ['gugexian']);
  assert.equal(playableCrafts(s).held[0].why, '定义待老板审，审过才播');
  assert.deepEqual(playableCrafts(s, { preview: true }).entries.map((e) => e.id), ['haitang', 'gugexian']);
  // 每条都有英文文案了：English 版也能放；没有英文文案的条目 craftText 给不出英文（English 版就不放）
  assert.deepEqual(playableCrafts(s, { preview: true, lang: 'en' }).entries.map((e) => e.id), ['haitang', 'gugexian']);
  assert.equal(craftText({ id: 'nope', zh: '某工艺', oneLine: '一句话', benefit: '好处' }, 'en').en, null);
  const many = view({ crafts: ['haitang', 'jiaxin', 'xicao', 'lacao'] });
  assert.equal(playableCrafts(many, { preview: true }).entries.length, CRAFT_MAX);
  // 认出来但没勾：不放
  assert.deepEqual(playableCrafts(view({ notes: [{ label: '', text: '骨骼线' }] })).entries, []);
});

// ---------------------------------------------------------------------------
// 展厅播放：停点
// ---------------------------------------------------------------------------

const SIZES = { '/living.jpg': [2400, 1350], '/night.jpg': [2400, 1350], '/kitchen.jpg': [1600, 2000], '/m.jpg': [600, 600] };
const meta = (src) => (SIZES[src] ? { w: SIZES[src][0], h: SIZES[src][1] } : null);

function sample(lang = 'zh', crafts = {}) {
  const v = (id, image, room, subtitle, extra = {}) => ({
    id, kind: 'view', enabled: true, floorId: 'f1', layout: 'auto', image, room, subtitle, materials: [{ role: '柜体', materialId: 'm1' }], notes: [], crafts: crafts[id], ...extra,
  });
  return {
    id: 'p-craft', name: 'Craft', version: 1,
    info: { client: 'Mr Lau', location: 'Muar', date: '2026 · 08', lang, team: [] },
    floors: [{ id: 'f1', zh: '一楼', en: 'GROUND FLOOR', image: null }],
    materials: [{ id: 'm1', name: '浅川橡', code: 'AG273', image: '/m.jpg' }],
    slides: [
      { id: 's-f1', kind: 'floor', floorId: 'f1', enabled: true },
      v('v-day', '/living.jpg', '客厅', '电视墙 · 白天', { layout: 'full' }),
      v('v-night', '/night.jpg', '客厅', '电视墙 · 夜晚', { layout: 'full' }),
      v('v-living2', '/living.jpg', '客厅', '沙发背景', { layout: 'framed' }),
      v('v-kitchen', '/kitchen.jpg', '厨房', '岛台'),
    ],
    translations: {},
  };
}
const stopsOf = (project, opts) => buildStops(exportableSlides(renderDeck(project, { meta })), project, opts);

test('停点：没勾 / 只勾了待审的 → 不多停点；勾了审过的 → 这一段后面多一个设计特点停点', () => {
  const plain = stopsOf(sample()).length;
  assert.equal(stopsOf(sample('zh', { 'v-kitchen': ['haitang'] })).length, plain);
  const s = stopsOf(sample('zh', { 'v-kitchen': ['gugexian'] }));
  assert.equal(s.length, plain + 1);
  const k = s.findIndex((x) => x.craft);
  assert.equal(s[k - 1].slide.id, 'v-kitchen');
  assert.equal(s[k].segment, s[k - 1].segment, '和那张效果图同一段（目录不多一项）');
  assert.equal(transitionKind(s, k - 1, k), 'craft');
  assert.ok(transitionWeight('craft') > 1);
  assert.match(s[k].label, /岛台 · 设计特点$/);
  const groups = indexOf(s).flatMap((g) => g.items);
  assert.ok(!groups.some((it) => s[it.stop].craft));
  // 内部预览：待审的也放
  assert.equal(stopsOf(sample('zh', { 'v-kitchen': ['haitang'] }), { craftPreview: true }).length, plain + 1);
});

test('停点：白天 / 夜晚一对 → 设计特点在夜晚后面（两张勾的合起来、不重复）；同一空间讲过的不再讲', () => {
  const s = stopsOf(sample('zh', { 'v-day': ['gugexian', 'haitang'], 'v-night': ['haitang', 'jiaxin'], 'v-living2': ['gugexian', 'xicao'] }), { craftPreview: true });
  const crafts = s.map((x, i) => ({ x, i })).filter(({ x }) => x.craft);
  assert.equal(crafts.length, 2);
  const [a, b] = crafts;
  assert.equal(s[a.i - 1].slide.id, 'v-night');
  assert.equal(transitionKind(s, a.i - 2, a.i - 1), 'same', '白天 → 夜晚照旧');
  assert.deepEqual(a.x.craft.entries.map((e) => e.id), ['gugexian', 'haitang', 'jiaxin']);
  assert.equal(s[b.i - 1].slide.id, 'v-living2');
  assert.deepEqual(b.x.craft.entries.map((e) => e.id), ['xicao'], '骨骼线在客厅讲过了');
  // 离开设计特点：照下一页的样子（下一页是效果图 → 线稿 → 上色）
  assert.equal(transitionKind(s, a.i, a.i + 1), 'sketch');
});

test('设计特点页：同一张效果图整张显示（不裁、比例对），文字在右栏、在纸面范围内，没有编辑栏位', () => {
  for (const lang of ['zh', 'bi', 'en']) {
    const s = stopsOf(sample(lang, { 'v-kitchen': ['gugexian'], 'v-day': ['gugexian'] }));
    for (const st of s.filter((x) => x.craft)) {
      const prev = s[st.craft.from];
      const photo = st.page.els.find((el) => el.name === 'photo:craft');
      const prevPhoto = prev.craft ? prev.page.els.find((el) => el.name === 'photo:craft') : prev.page.els[prev.hero];
      assert.equal(photo.src, prevPhoto.src);
      assert.ok(st.page.fits, `${lang} 放得下`);
      assert.deepEqual(photo.crop, { l: 0, t: 0, r: 0, b: 0 });
      const [nw, nh] = SIZES[photo.src];
      assert.ok(Math.abs(photo.w / photo.h - nw / nh) < 0.01, `${lang} ${photo.src} 比例`);
      assert.ok(photo.x >= 112 && photo.x + photo.w <= 1212 + 0.5 && photo.y >= 92 && photo.y + photo.h <= 988 + 0.5);
      const texts = st.page.els.filter((el) => el.t === 'text');
      assert.ok(texts.length >= 3);
      for (const el of texts) {
        assert.ok(el.x >= CRAFT_COL.x - 3 && el.x + el.w <= CRAFT_COL.x + CRAFT_COL.w + 8, `${lang} 文字在右栏`);
        assert.ok(el.y >= 92 && el.y + el.h <= 1000, `${lang} 文字在纸面范围`);
        assert.equal(el.edit, undefined);
      }
      const all = texts.flatMap((el) => el.paras.flatMap((p) => p.runs.map((r) => r.text))).join('');
      if (lang !== 'en') assert.match(all, /细线框让每扇柜门都有一道影子/);
      if (lang !== 'zh') assert.match(all, /detail without ornament/i);
    }
  }
});

test('设计特点页：内部预览时待审的条目名称后面标「待审」', () => {
  const s = stopsOf(sample('zh', { 'v-kitchen': ['haitang'] }), { craftPreview: true });
  const st = s.find((x) => x.craft);
  const all = st.page.els.filter((el) => el.t === 'text').flatMap((el) => el.paras.flatMap((p) => p.runs.map((r) => r.text))).join('');
  assert.match(all, /海棠角　待审/);
});

test('过渡（craft）：两头原样 —— 效果图 t = 0 和原页一模一样、t = 1 和设计特点页一模一样；停在设计特点页时一切原样', () => {
  const s = stopsOf(sample('zh', { 'v-day': ['gugexian'], 'v-kitchen': ['gugexian'] }));
  for (const st of s.filter((x) => x.craft)) {
    const prev = s[st.craft.from];
    if (prev.craft) continue; // 接着的第二页：效果图同一个框，不用移
    const from = prev.page.els[prev.hero];
    const to = st.page.els.find((el) => el.name === 'photo:craft');
    assert.deepEqual(morphRects(from, to, 0), imageRects(from));
    assert.deepEqual(morphRects(from, to, 1), imageRects(to));
    const end = layerMotion('b', 'craft', 1, st.page.els);
    st.page.els.forEach((el, i) => assert.deepEqual(end.el(el, i), { opacity: 1, ty: 0, scale: 1 }));
    const start = layerMotion('a', 'craft', 0, prev.page.els);
    prev.page.els.forEach((el, i) => assert.deepEqual(start.el(el, i), { opacity: 1, ty: 0, scale: 1 }));
    // 路上：原页的效果图藏起来（下面那层接手），字淡掉
    const mid = layerMotion('a', 'craft', 0.4, prev.page.els);
    assert.equal(mid.el(from, prev.hero).opacity, 0);
  }
});

test('设计特点：一页放不下（中英版）→ 后面几个挪到下一个停点；效果图同一个框；每页都放得下、不截字', () => {
  const s = stopsOf(sample('bi', { 'v-kitchen': ['haitang', 'jiaxin', 'gugexian'] }), { craftPreview: true });
  const pages = s.filter((x) => x.craft);
  assert.ok(pages.length >= 2, `分成 ${pages.length} 页`);
  assert.deepEqual(pages.flatMap((p) => p.craft.entries.map((e) => e.id)), ['haitang', 'jiaxin', 'gugexian']);
  const box = (p) => {
    const el = p.page.els.find((x) => x.name === 'photo:craft');
    return [el.x, el.y, el.w, el.h];
  };
  for (const p of pages) {
    assert.ok(p.page.fits);
    assert.deepEqual(box(p), box(pages[0]));
    assert.ok(!p.page.els.some((el) => el._cut));
  }
  const k = s.indexOf(pages[1]);
  assert.equal(transitionKind(s, k - 1, k), 'craft');
  assert.equal(new Set(s.map((x) => x.key)).size, s.length, 'key 不重复');
  // 华文版：三个放得下一页
  assert.equal(stopsOf(sample('zh', { 'v-kitchen': ['haitang', 'jiaxin', 'gugexian'] }), { craftPreview: true }).filter((x) => x.craft).length, 1);
});
