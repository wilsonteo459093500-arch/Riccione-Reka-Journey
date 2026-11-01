// B 格物 · 公司固定页（品牌画册）：19 页 × 华文 / English / 中英 都排得出；字在画布里、文字框互不重叠、不压在照片上；
// English 版没有中文、中英版两种文字都有且同样大小；编辑字段齐全；缺图 / 像素低 / 字太长 / 质保年数没填会提醒
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from './harness.mjs';
import {
  COMPANY_PAGES_B, COMPANY_KEYS_B, renderCompanyB, companyFieldsB, companyImagesB, companyTokensB, dateZh, dateEn,
  PHOTOS, LOGO, QR, baseOf, yearsEn, deckChapters, chapterZh, chapterEn, companyFieldByLabel, legacyOverrides,
} from '../src/engine/b/company.js';
import { INSET, B, lineWidth } from '../src/engine/b/kit.js';
import { makeTranslator } from '../src/engine/lang.js';
import { projectTokens } from '../src/engine/deck.js';
import { COMPANY_BEFORE_DESIGN, COMPANY_AFTER_DESIGN_HEAD, COMPANY_AFTER_DESIGN_TAIL } from '../src/engine/model.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['zh', 'en', 'bi'];
const CJK = /[⺀-鿿豈-﫿︰-﹏＀-￯　-〿]/;

const project = (lang, extra = {}) => ({
  id: 'p1',
  name: 'Muar · Mr Lau',
  info: { client: 'Mr Lau', location: 'Muar', date: '2026 · 08', proposalTitle: '全屋定制设计方案', lang, team: [], ...(extra.info || {}) },
  floors: [
    { id: 'f1', zh: '一楼', en: 'GROUND FLOOR' },
    { id: 'f2', zh: '二楼', en: 'FIRST FLOOR' },
  ],
  materials: [],
  slides: [],
  translations: extra.translations ?? {},
});

/**
 * 和整合后的 deck.js 一样调用：每页一个翻译器；token 由 projectTokens 给（不传 tr —— 客户名、方案名缺英文
 * 由 renderCompanyB 只在用到它们的页上记下，免得每一页都提醒）
 */
function render(key, lang, slide = {}, opts = {}) {
  const p = opts.project || project(lang);
  const tr = makeTranslator(p);
  const tokens = projectTokens(p);
  const pg = renderCompanyB(key, { id: 's1', kind: 'company', key, ...slide }, { project: p, lang, tr, meta: opts.meta || (() => null), tokens });
  return { ...pg, tr };
}

const textOf = (el) => (el.paras || []).map((p) => p.runs.map((r) => r.text).join('')).join('\n');
const langOfEl = (el) => el.paras?.[0]?.runs?.[0]?.lang;
const sizeOfEl = (el) => el.paras?.[0]?.runs?.[0]?.size;
const texts = (pg) => pg.els.filter((e) => e.t === 'text');
/** 文字框去掉内边距 = 字真正占的地方 */
const inner = (el) => (el.t === 'text' ? { x: el.x + INSET, y: el.y + INSET, w: el.w - 2 * INSET, h: el.h - 2 * INSET } : el);
const area = (a, b) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};
const isPhoto = (el) => (el.t === 'img' || el.t === 'rect') && el.h > 2 && /^photo:|^logo$|^qr$/.test(el.name || '');
const isHair = (el) => el.t === 'rect' && el.h === 1;

function assertLayout(pg, label) {
  for (const el of pg.els) {
    for (const k of ['x', 'y', 'w', 'h']) assert.ok(Number.isFinite(el[k]), `${label}: ${k} 不是数字`);
    assert.ok(el.x >= -0.01 && el.y >= -0.01 && el.x + el.w <= 1920.01 && el.y + el.h <= 1080.01, `${label}: 元素出了画布 ${JSON.stringify({ t: el.t, x: el.x, y: el.y, w: el.w, h: el.h, text: el.t === 'text' ? textOf(el).slice(0, 30) : el.src })}`);
  }
  const ts = texts(pg).map((el) => ({ el, box: inner(el) }));
  for (let i = 0; i < ts.length; i++) {
    for (let j = i + 1; j < ts.length; j++) {
      const a = area(ts[i].box, ts[j].box);
      assert.ok(a < 0.5, `${label}: 文字重叠「${textOf(ts[i].el).slice(0, 20)}」×「${textOf(ts[j].el).slice(0, 20)}」(${a.toFixed(1)}px²)`);
    }
  }
  const blockers = pg.els.filter((e) => isPhoto(e) || isHair(e));
  for (const { el, box } of ts) {
    for (const o of blockers) {
      const a = area(box, o);
      assert.ok(a < 0.5, `${label}: 文字「${textOf(el).slice(0, 20)}」压在${isHair(o) ? '细线' : '照片'}上`);
    }
  }
}

test('19 页都在：页名、章节（opening / brand / company / design / service）', () => {
  const expected = [...COMPANY_BEFORE_DESIGN, 'design-divider', ...COMPANY_AFTER_DESIGN_HEAD, ...COMPANY_AFTER_DESIGN_TAIL];
  assert.deepEqual([...COMPANY_KEYS_B].sort(), [...expected].sort());
  for (const key of COMPANY_KEYS_B) {
    const d = COMPANY_PAGES_B[key];
    assert.ok(d.title, key);
    assert.ok(['opening', 'brand', 'company', 'design', 'service'].includes(d.section), key);
    for (const [f, def] of Object.entries(d.fields)) assert.ok(!/^\d+$/.test(f) && def.label && typeof def.zh === 'string', `${key}.${f}`);
  }
  assert.equal(COMPANY_PAGES_B.cover.section, 'opening');
  assert.equal(COMPANY_PAGES_B.contents.section, 'opening');
  assert.equal(COMPANY_PAGES_B['design-divider'].section, 'design');
  assert.equal(COMPANY_PAGES_B['brand-awards'].section, 'brand');
  assert.equal(COMPANY_PAGES_B['company-history'].section, 'company');
  assert.equal(COMPANY_PAGES_B.closing.section, 'service');
});

test('每页三种语言都排得出：奶白纸底、元素都在画布里、文字互不重叠也不压在照片 / 细线上', () => {
  for (const key of COMPANY_KEYS_B) {
    for (const lang of LANGS) {
      const pg = render(key, lang);
      assert.equal(pg.bg, B.paper, `${key} ${lang}`);
      assert.ok(texts(pg).length >= 2, `${key} ${lang}: 没有字`);
      assertLayout(pg, `${key} ${lang}`);
    }
  }
});

test('默认稿：没有提醒、照片不放大超过 1.15 倍、没有压暗（无半透明 / 渐变遮罩）', () => {
  for (const key of COMPANY_KEYS_B) {
    for (const lang of LANGS) {
      const pg = render(key, lang);
      const extra = key === 'service-aftersales' ? pg.warnings.filter((w) => !/质保年数还没填/.test(w)) : pg.warnings;
      assert.deepEqual(extra, [], `${key} ${lang}: ${extra.join(' / ')}`);
      assert.ok(!pg.els.some((e) => e.t === 'rect' && (e.grad || (e.alpha ?? 1) < 1)), `${key} ${lang}: 有遮罩`);
      for (const img of pg.els.filter((e) => e.t === 'img' && e.crop && e.nat)) {
        const visW = img.nat.w * (1 - img.crop.l - img.crop.r);
        assert.ok(img.w / visW <= 1.15 + 1e-6, `${key} ${lang}: ${img.src} 放大 ${(img.w / visW).toFixed(2)} 倍`);
        assert.ok(img.crop.l >= 0 && img.crop.r >= 0 && img.crop.t >= 0 && img.crop.b >= 0, `${key}: 裁切比例为负`);
      }
    }
  }
});

test('English 版没有中文；中英版两种文字都有，而且英文和中文同样大小（不是小字英文）', () => {
  for (const key of COMPANY_KEYS_B) {
    const en = render(key, 'en');
    for (const el of texts(en)) assert.ok(!CJK.test(textOf(el)), `${key} en: 「${textOf(el)}」`);
    const bi = render(key, 'bi');
    const all = texts(bi).map(textOf).join('\n');
    assert.ok(CJK.test(all), `${key} bi: 没有中文`);
    assert.ok(texts(bi).some((el) => langOfEl(el) === 'en' && /[A-Za-z]{3}/.test(textOf(el))), `${key} bi: 没有英文`);
    // 同一字段的中文、英文元素：英文字号不小于中文的 0.8（封底英文结语按样张用 52 / 64）
    const byField = new Map();
    for (const el of texts(bi)) {
      const f = el.edit?.field?.replace(/^overrides(En)?\./, '');
      if (!f) continue;
      if (!byField.has(f)) byField.set(f, {});
      byField.get(f)[langOfEl(el)] = sizeOfEl(el);
    }
    for (const [f, s] of byField) if (s.zh && s.en) assert.ok(s.en / s.zh >= 0.8, `${key}.${f}: 英文 ${s.en}pt / 中文 ${s.zh}pt`);
  }
});

test('编辑字段：中文元素 overrides.<字段>、英文元素 overridesEn.<字段>、照片 image.<照片位>；每个字段都点得到', () => {
  for (const key of COMPANY_KEYS_B) {
    const def = COMPANY_PAGES_B[key];
    const seen = new Set();
    for (const lang of LANGS) {
      const pg = render(key, lang);
      for (const el of texts(pg)) {
        const f = el.edit?.field;
        if (!f) {
          assert.match(textOf(el), /^0\d$/, `${key} ${lang}: 「${textOf(el)}」没有编辑字段`);
          continue;
        }
        const m = f.match(/^(overrides|overridesEn)\.([A-Za-z0-9]+)$/);
        assert.ok(m, `${key}: ${f}`);
        const fd = def.fields[m[2]];
        assert.ok(fd, `${key}: 没有字段 ${m[2]}`);
        seen.add(m[2]);
        // 中英一样的字（Mr Lau、品牌名）只排一块，归中文字段
        const cur = companyFieldsB(key, {}, project(lang)).find((x) => x.field === m[2]);
        const shared = fd.en === undefined || cur.zh === cur.en;
        if (!shared && langOfEl(el) === 'zh' && CJK.test(textOf(el))) assert.equal(m[1], 'overrides', `${key}.${m[2]} 中文元素`);
        if (!shared && langOfEl(el) === 'en' && lang !== 'zh') assert.equal(m[1], 'overridesEn', `${key}.${m[2]} 英文元素`);
      }
      for (const el of pg.els.filter((e) => /^photo:/.test(e.name || ''))) {
        const slot = el.name.slice(6);
        assert.ok(def.images[slot], `${key}: 照片位 ${slot}`);
        assert.equal(el.edit?.field, `image.${slot}`);
      }
      for (const el of pg.els.filter((e) => e.t === 'img' && !/^photo:/.test(e.name || ''))) assert.ok(['logo', 'qr'].includes(el.name), `${key}: ${el.src}`);
    }
    for (const f of Object.keys(def.fields)) assert.ok(seen.has(f), `${key}.${f} 在页面上点不到`);
    assert.equal(render(key, 'bi').els.filter((e) => /^photo:/.test(e.name || '')).length, Object.keys(def.images).length, `${key}: 照片位数量`);
  }
});

test('照片位：默认图都在 public/template 里，一个照片位一个常量', () => {
  const files = [...Object.values(PHOTOS), LOGO, QR].map((p) => p.src);
  for (const src of files) {
    assert.match(src, /^\/template\//);
    assert.ok(existsSync(path.join(ROOT, 'public', src)), `缺文件 ${src}`);
  }
  for (const key of COMPANY_KEYS_B) {
    for (const [slot, d] of Object.entries(COMPANY_PAGES_B[key].images)) {
      assert.ok(Object.values(PHOTOS).some((p) => p.src === d.src && p.nat === d.nat), `${key}.${slot} 不是 PHOTOS 里的图`);
      assert.ok(d.label, `${key}.${slot} 没有名字`);
    }
  }
  // 不用 logo 墙、不用 3D 地图、不用拼起来的两张图
  const all = COMPANY_KEYS_B.flatMap((k) => Object.values(COMPANY_PAGES_B[k].images).map((d) => d.src));
  for (const banned of ['brand-supply-1.jpg', 'company-showrooms-1.jpg', 'company-about-1.jpg']) assert.ok(!all.some((s) => s.endsWith(banned)), banned);
});

test('改写：overrides / overridesEn 生效；旧模板的数字键被忽略；{{token}} 也能写在改写里', () => {
  const pg = render('brand-story', 'bi', {
    overrides: { title: '从成都出发', 0: '旧模板第 0 框', 13: '旧模板正文' },
    overridesEn: { title: 'Setting out from Chengdu', 2: 'old' },
  });
  const all = texts(pg).map(textOf);
  assert.ok(all.includes('从成都出发'));
  assert.ok(all.includes('Setting out from Chengdu'));
  assert.ok(!all.some((t) => /旧模板|^old$/.test(t)));
  const cover = render('cover', 'zh', { overrides: { subtitle: '{{clientLine}} 的家' } });
  assert.ok(texts(cover).map(textOf).includes('Muar · Mr Lau 的家'));
  // 只改了中文：English / 中英版提醒补英文
  const stale = render('brand-divider', 'bi', { overrides: { lead: '溪岸，是一条安静的溪。' } });
  assert.ok(stale.warnings.some((w) => /改过的中文还没有对应的英文/.test(w)));
  assert.equal(render('brand-divider', 'zh', { overrides: { lead: '溪岸，是一条安静的溪。' } }).warnings.length, 0);
});

test('{{token}}：封面客户 / 地点 / 日期，目录与方案章节页的楼层', () => {
  const zh = texts(render('cover', 'zh')).map(textOf).join('\n');
  assert.ok(zh.includes('Mr Lau\nMuar'));
  assert.ok(zh.includes('全屋定制设计方案'));
  assert.ok(zh.includes('二〇二六年八月'));
  const en = texts(render('cover', 'en')).map(textOf).join('\n');
  assert.ok(en.includes('Whole-House Design Proposal') && en.includes('August 2026'));
  // 客户名中英一样：中英版只排一栏
  assert.equal(texts(render('cover', 'bi')).filter((el) => textOf(el) === 'Mr Lau\nMuar').length, 1);
  const dd = texts(render('design-divider', 'bi')).map(textOf).join('\n');
  assert.ok(dd.includes('一楼与二楼') && dd.includes('Ground & First Floor'));
  const ct = texts(render('contents', 'en')).map(textOf).join('\n');
  assert.ok(ct.includes('Ground & First Floor, room by room'));
  // 没有客户：封面大标题退回方案名
  const none = render('cover', 'bi', {}, { project: project('bi', { info: { client: '', location: '', date: '' } }) });
  assert.ok(texts(none).map(textOf).includes('全屋定制设计方案'));
  assertLayout(none, 'cover 无客户');
});

test('日期：二〇二六年八月 / August 2026；认不出就原样', () => {
  assert.equal(dateZh('2026 · 08'), '二〇二六年八月');
  assert.equal(dateZh('2026年12月'), '二〇二六年十二月');
  assert.equal(dateZh('2025.10'), '二〇二五年十月');
  assert.equal(dateEn('2026 · 08'), 'August 2026');
  assert.equal(dateEn('2026-1'), 'January 2026');
  assert.equal(dateZh('下个月'), '下个月');
  assert.equal(dateEn('Spring 2026'), 'Spring 2026');
  assert.equal(dateEn('下个月'), '');
  const t = companyTokensB(project('en'), () => '');
  assert.equal(t.coverName, 'Mr Lau\nMuar');
  assert.equal(t.coverNameEn, 'Mr Lau\nMuar');
  assert.equal(t.floorsLine, '一楼与二楼');
  assert.equal(t.floorsLineEn, 'Ground & First Floor');
});

test('只有中文、没有英文：English 版先显示中文并记下缺英文；中英版只显示中文', () => {
  const cn = project('en', { info: { client: '刘先生', location: '麻坡' } });
  const en = render('cover', 'en', {}, { project: cn });
  assert.ok(texts(en).map(textOf).includes('刘先生\n麻坡'));
  assert.ok(en.tr.misses.some((m) => m.zh === '刘先生'));
  assertLayout(en, 'cover 中文客户 en');
  const bi = render('cover', 'bi', {}, { project: { ...cn, info: { ...cn.info, lang: 'bi' } } });
  assert.equal(texts(bi).filter((el) => textOf(el).includes('刘先生')).length, 1);
  // 有翻译：中英并排
  const tl = render('cover', 'bi', {}, { project: { ...cn, info: { ...cn.info, lang: 'bi' }, translations: { 刘先生: 'Mr Lau', 麻坡: 'Muar' } } });
  assert.ok(texts(tl).map(textOf).includes('刘先生\n麻坡') && texts(tl).map(textOf).includes('Mr Lau\nMuar'));
  assertLayout(tl, 'cover 中英并排');
});

test('提醒：缺照片、照片像素偏低、字太长（截短加「…」）', () => {
  const none = render('cover', 'zh', { images: { photo: null } });
  assert.ok(none.warnings.some((w) => /^缺照片/.test(w)));
  const ph = none.els.find((e) => e.name === 'photo:photo');
  assert.equal(ph.t, 'rect');
  assert.equal(ph.edit.field, 'image.photo');
  const low = render('company-divider', 'bi', { images: { photo: 'asset:small' } }, { meta: (src) => (src === 'asset:small' ? { w: 400, h: 500 } : null) });
  assert.ok(low.warnings.some((w) => /^图片像素偏低：.*放大 1\.\d 倍/.test(w)), low.warnings.join());
  assert.equal(low.els.find((e) => e.name === 'photo:photo').src, 'asset:small');
  // 换了一张不知道尺寸的图：照常铺满，不报错
  const unknown = render('closing', 'bi', { images: { photo: 'asset:new' } });
  assert.equal(unknown.els.find((e) => e.name === 'photo:photo').fit, 'cover');
  const long = render('brand-philosophy', 'bi', { overrides: { body: '很长的一段话，'.repeat(60) }, overridesEn: { body: 'a very long sentence, '.repeat(60) } });
  assert.ok(long.warnings.some((w) => /^文字太长放不下/.test(w)));
  assert.ok(texts(long).some((el) => textOf(el).endsWith('…')));
  assertLayout(long, 'philosophy 长文');
});

test('压力测试：每个字段都填超长文字，19 页 × 三种语言仍然不重叠、不出画布，并提醒截短', () => {
  const LZ = '这是一段特别长的文字，设计师想把所有的故事、材料、工艺、服务和承诺都写进来，于是远远超过了版面能放下的长度。';
  const LE = 'This is a very long piece of text that a designer typed in, trying to fit every story, material, craft and promise at once.';
  for (const key of COMPANY_KEYS_B) {
    const fields = Object.keys(COMPANY_PAGES_B[key].fields);
    const slide = {
      overrides: Object.fromEntries(fields.map((f) => [f, `${LZ}\n${LZ}`])),
      overridesEn: Object.fromEntries(fields.map((f) => [f, `${LE} ${LE}`])),
    };
    for (const lang of LANGS) {
      const pg = render(key, lang, slide);
      assertLayout(pg, `${key} ${lang} 超长`);
      assert.ok(pg.warnings.some((w) => /文字太长放不下/.test(w)), `${key} ${lang}: 没有提醒截短`);
    }
  }
});

test('售后维保：质保年数没填（＿＿）会提醒，填了就不提醒', () => {
  assert.ok(render('service-aftersales', 'zh').warnings.some((w) => /质保年数还没填/.test(w)));
  const filled = render('service-aftersales', 'bi', { overrides: { r3Text: '5 年', r4Text: '10 年' }, overridesEn: { r3Text: '5 years', r4Text: '10 years' } });
  assert.deepEqual(filled.warnings, []);
  assert.ok(texts(filled).map(textOf).includes('10 years'));
});

test('companyFieldsB / companyImagesB：给编辑器的栏位（默认稿、改过没有、多行、token）', () => {
  const p = project('bi');
  const f = companyFieldsB('cover', { overrides: { subtitle: '刘府方案' } }, p);
  const name = f.find((x) => x.field === 'name');
  assert.equal(name.zh, 'Mr Lau\nMuar');
  assert.equal(name.tokens, true);
  assert.equal(name.multiline, true);
  const sub = f.find((x) => x.field === 'subtitle');
  assert.deepEqual(sub.overridden, { zh: true, en: false });
  assert.equal(sub.zh, '刘府方案');
  assert.equal(sub.zhDefault, '全屋定制设计方案');
  assert.equal(sub.enDefault, 'Whole-House Design Proposal');
  const story = companyFieldsB('brand-story', {}, p);
  assert.equal(story.find((x) => x.field === 'body').multiline, true);
  const year = story.find((x) => x.field === 'year1');
  assert.equal(year.shared, true);
  assert.equal(year.en, '2011');
  assert.deepEqual(companyFieldsB('nope', {}, p), []);
  for (const key of COMPANY_KEYS_B) assert.equal(companyFieldsB(key, {}, p).length, Object.keys(COMPANY_PAGES_B[key].fields).length);
  const imgs = companyImagesB('brand-collections', { images: { c2: 'asset:x' } });
  assert.equal(imgs.length, 5);
  assert.deepEqual(imgs.find((i) => i.slot === 'c2'), { slot: 'c2', field: 'image.c2', label: '系列二照片', src: 'asset:x', default: PHOTOS.coll2.src, custom: true });
  assert.equal(companyImagesB('cover', { images: { photo: null } })[0].src, null);
});

test('文案：没有禁用词，英文用直引号，品牌书式短句', () => {
  const banned = /奢华|尊享|顶级|极致|打造|保驾护航|luxury|premium|world-class|elevate/i;
  for (const key of COMPANY_KEYS_B) {
    for (const [f, d] of Object.entries(COMPANY_PAGES_B[key].fields)) {
      assert.ok(!banned.test(d.zh) && !banned.test(d.en || ''), `${key}.${f}`);
      assert.ok(!/[‘’“”]/.test(d.en || ''), `${key}.${f}: 英文弯引号`);
      if (d.en) assert.ok(!CJK.test(d.en), `${key}.${f}: 英文稿里有中文`);
      assert.ok(d.zh.length <= 120 && (d.en || '').length <= 240, `${key}.${f}: 太长`);
    }
  }
});

// ---------------------------------------------------------------------------
// 基线：一个文字元素第一行 / 最后一行的基线（框内边距 INSET，行高取段落的固定行高）
// ---------------------------------------------------------------------------

const lhOfEl = (el) => el.paras[0].lineHeight;
const firstBase = (el, role) => el.y + INSET + baseOf(langOfEl(el), role, { lh: lhOfEl(el), px: sizeOfEl(el) * (96 / 72) });
const lastBase = (el, role) => el.y + el.h - INSET - lhOfEl(el) + baseOf(langOfEl(el), role, { lh: lhOfEl(el), px: sizeOfEl(el) * (96 / 72) });
const byField = (pg, f) => texts(pg).filter((el) => el.edit?.field === f);
const near = (a, b, label, tol = 0.6) => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a.toFixed(2)} ≠ ${b.toFixed(2)}`);
const floorsOf = (n) => [['一楼', 'GROUND FLOOR'], ['二楼', 'FIRST FLOOR'], ['三楼', 'SECOND FLOOR'], ['四楼', 'THIRD FLOOR']]
  .slice(0, n).map(([zh, en], i) => ({ id: `f${i}`, zh, en }));

test('章节页：一句话中英并排时两种语言的最后一行共用基线（落在 984）；放不下（三、四层楼）就中文一行英文一行，照片的脚 = 大标题最后一行的基线', () => {
  for (const n of [1, 2, 3, 4]) {
    const p = { ...project('bi'), floors: floorsOf(n) };
    const pg = render('design-divider', 'bi', {}, { project: p });
    assertLayout(pg, `design-divider ${n} 层`);
    const [zh] = byField(pg, 'overrides.lead');
    const [en] = byField(pg, 'overridesEn.lead');
    assert.ok(zh && en, `${n} 层：一句话中英都要有`);
    assert.equal(zh.valign, 'b');
    assert.equal(en.valign, 'b');
    if (zh.x !== en.x) {
      // 并排：每种语言都不折行（引擎估成两行、浏览器排成一行 = 中文浮在英文上面）；
      // 中文最后一行的行框落在 984，英文最后一行和它共用基线
      for (const el of [zh, en]) assert.equal(el.h - 2 * INSET, lhOfEl(el) * el.paras.length, `${n} 层 并排的一句话不该折行`);
      near(zh.y + zh.h - INSET, 984, `${n} 层 中文一句话的底`);
      near(lastBase(en, 'body'), lastBase(zh, 'body'), `${n} 层 中英最后一行基线`);
      near(lastBase(zh, 'body'), 984 - lhOfEl(zh) + baseOf('zh', 'body'), `${n} 层 中文最后一行基线`);
    } else {
      // 上下：英文在下、落在 984，中文紧贴在上面，各一行
      assert.ok(n >= 3, `${n} 层不该上下排`);
      near(en.y + en.h - INSET, 984, `${n} 层 英文一句话的底`);
      near(zh.y + zh.h - INSET, en.y + INSET, `${n} 层 中文紧贴英文`);
      assert.equal(zh.paras.length, 1);
      assert.equal(zh.h - 2 * INSET, lhOfEl(zh), `${n} 层 中文一句话应该一行`);
      assert.equal(en.h - 2 * INSET, lhOfEl(en), `${n} 层 英文一句话应该一行`);
    }
    // 大标题（Mr Lau / Muar，中英一样只排一块）：靠底排；照片的脚 = 最后一行基线
    const titles = texts(pg).filter((el) => /^overrides(En)?\.title$/.test(el.edit?.field || ''));
    assert.ok(titles.length >= 1);
    for (const t of titles) assert.equal(t.valign, 'b');
    const plate = pg.els.find((e) => e.name === 'photo:photo');
    const foot = Math.max(...titles.map((t) => lastBase(t, 'display')));
    near(plate.y + plate.h, Math.round(foot), `${n} 层 照片的脚`);
  }
  // 品牌章节页（样张 p2）：照片的脚落在 904
  const brand = render('brand-divider', 'bi');
  const plate = brand.els.find((e) => e.name === 'photo:photo');
  assert.equal(plate.y + plate.h, 904);
});

test('表格：地方够就按自然行数排，一格三行不截短、不提醒（发展历程 / 奖项 / 关于 / 展厅，English 版）', () => {
  const cases = [
    ['company-history', { e5: 'Opens an 11,000 sq ft project showroom in Kuala Lumpur\nExhibits at the CIFF Shanghai Design Pavilion by invitation, as one of twelve brands' }],
    ['brand-awards', { a1Note: 'SAIL 4.0 Series, chosen from 38,000 entries in more than 100 countries and regions, judged by a jury of international designers, critics and editors' }],
    ['company-about', { line2Text: '100% solid wood in a modular system: every piece can be taken apart, moved to a new home and put together again, so the furniture grows with the family' }],
    ['company-showrooms', { p1Text: 'A four-storey showroom and office in Kuala Lumpur with a team of 15, where clients can see every door, wall panel and cabinet finish at full size before they choose' }],
  ];
  for (const [key, overridesEn] of cases) {
    const pg = render(key, 'en', { overridesEn });
    assertLayout(pg, `${key} 三行`);
    const [field] = Object.keys(overridesEn);
    const [el] = byField(pg, `overridesEn.${field}`);
    assert.ok(el, `${key}.${field}`);
    assert.ok(!texts(pg).some((t) => textOf(t).includes('…')), `${key}: 有「…」`);
    assert.ok(!pg.warnings.some((w) => /文字太长放不下/.test(w)), `${key}: ${pg.warnings.join(' / ')}`);
    assert.ok(el.h - 2 * INSET >= 2 * lhOfEl(el), `${key}.${field} 应该排成多行`);
  }
  // 理念 / 认证正文 7–8 行：地方够，不再固定截在 6 行
  const body = 'SAIL is the home our founder always imagined.\nThrough design that quiets the mind,\nwe hope to lead you back\nto the home you long for:\na home with a simple beauty\nand the healing power of nature,\nquiet, warm and honest.\nA place to come back to.';
  for (const key of ['brand-philosophy', 'company-certified']) {
    const pg = render(key, 'en', { overridesEn: { body } });
    assertLayout(pg, `${key} 8 行`);
    assert.deepEqual(pg.warnings, [], key);
    assert.equal(textOf(byField(pg, 'overridesEn.body')[0]), body);
  }
});

test('奖项（中英版）：年份对准奖项第一行（中文）的基线，不去对英文那一行', () => {
  const pg = render('brand-awards', 'bi');
  for (const n of [1, 2, 3, 4]) {
    const [year] = byField(pg, `overrides.y${n}`);
    const [zh] = byField(pg, `overrides.a${n}`);
    assert.ok(year && zh, `第 ${n} 行`);
    near(firstBase(year, 'cap'), firstBase(zh, 'body'), `第 ${n} 行年份基线`);
  }
});

test('订单周期：天数只印一次（标题字级）；单位和天数同一段（共用基线）；中英版「days」在英文系列名的基线、正好在「天」下面', () => {
  for (const lang of LANGS) {
    const pg = render('service-cycle', lang);
    assertLayout(pg, `cycle ${lang}`);
    assert.equal(texts(pg).filter((el) => /\d+–\d+/.test(textOf(el))).length, 2, `${lang}: 天数只该出现两次（每个系列一次）`);
    for (const n of [1, 2]) {
      const figure = n === 1 ? '60–75' : '75–90';
      const [fig] = byField(pg, `overrides.s${n}N`);
      const runs = fig.paras[0].runs;
      // 一段两种字号：天数（标题字级）+ 单位（正文字级），共用一条基线；不设 nowrap（网页里 nowrap 的段落是弹性盒，字号不同就不对基线）
      assert.equal(fig.paras.length, 1);
      assert.ok(!fig.nowrap);
      assert.equal(runs.slice(0, -1).map((r) => r.text).join(''), figure);
      assert.equal(runs.at(-1).text, lang === 'en' ? 'days' : '天');
      assert.ok(runs[0].size > runs.at(-1).size * 1.8, '天数用标题字级，单位用正文字级');
      // 天数和单位之间的空 = 天数最后一个字的字距（约 0.26em），不用空格
      assert.ok(!runs.some((r) => /\s/.test(r.text)));
      near(runs.at(-2).spacing * (96 / 72), 0.26 * runs[0].size * (96 / 72), '天数与单位之间的空', 1.5);
      const label = byField(pg, lang === 'en' ? `overridesEn.s${n}` : `overrides.s${n}`)[0];
      near(firstBase(fig, 'head'), firstBase(label, 'body'), `${lang} 第 ${n} 行 天数 / 系列名基线`);
      if (lang === 'bi') {
        const [u] = byField(pg, `overridesEn.s${n}Unit`);
        assert.equal(textOf(u), 'days');
        const enLabel = byField(pg, `overridesEn.s${n}`)[0];
        near(firstBase(u, 'body'), firstBase(enLabel, 'body'), `第 ${n} 行「days」与英文系列名基线`);
        // 「days」的左边 = 「天」的左边（天数那一段里单位之前的宽度）
        near(u.x + INSET, fig.x + INSET + lineWidth(runs.slice(0, -1)), `第 ${n} 行「days」在「天」正下方`, 1);
      }
    }
  }
});

test('英文栏清空 = 这一行英文不要：English 版不退回中文（不出现中文），中英版只留中文', () => {
  for (const key of COMPANY_KEYS_B) {
    for (const [f, d] of Object.entries(COMPANY_PAGES_B[key].fields)) {
      if (d.en === undefined) continue;
      const en = render(key, 'en', { overridesEn: { [f]: '' } });
      for (const el of texts(en)) assert.ok(!CJK.test(textOf(el)), `${key}.${f} en: 「${textOf(el)}」`);
      assert.equal(byField(en, `overrides.${f}`).length + byField(en, `overridesEn.${f}`).length, 0, `${key}.${f}: English 版还有这一行`);
    }
  }
  const bi = render('brand-divider', 'bi', { overridesEn: { lead: '' } });
  assert.equal(byField(bi, 'overridesEn.lead').length, 0);
  assert.equal(textOf(byField(bi, 'overrides.lead')[0]), '溪岸，是一处美而朴素的水边。');
  assert.deepEqual(bi.warnings, []);
});

test('自定义的中文方案名没有英文：English 版先显示中文并提醒，中英版只显示中文，编辑器栏位与画布一致；有翻译就用翻译', () => {
  const custom = (lang, translations = {}) => project(lang, { info: { proposalTitle: '刘府全屋定制方案（第二稿）' }, translations });
  const en = render('cover', 'en', {}, { project: custom('en') });
  const all = texts(en).map(textOf);
  assert.ok(all.includes('刘府全屋定制方案（第二稿）'));
  assert.ok(!all.includes('Whole-House Design Proposal'), '不该配上通用的英文方案名');
  assert.ok(en.tr.misses.some((m) => m.zh === '刘府全屋定制方案（第二稿）'));
  const bi = render('cover', 'bi', {}, { project: custom('bi') });
  assert.ok(!texts(bi).map(textOf).includes('Whole-House Design Proposal'));
  assertLayout(bi, 'cover 自定义方案名');
  const sub = companyFieldsB('cover', {}, custom('bi')).find((x) => x.field === 'subtitle');
  assert.equal(sub.en, '');
  const tl = render('cover', 'bi', {}, { project: custom('bi', { '刘府全屋定制方案（第二稿）': 'The Lau Residence, Second Draft' }) });
  assert.ok(texts(tl).map(textOf).includes('The Lau Residence, Second Draft'));
  assert.equal(companyFieldsB('cover', {}, custom('bi', { '刘府全屋定制方案（第二稿）': 'The Lau Residence, Second Draft' })).find((x) => x.field === 'subtitle').en, 'The Lau Residence, Second Draft');
});

test('客户名 / 地点 / 方案名只有中文：只在显示它们的页上记「缺英文」（封面、方案章节页），别的页不提醒', () => {
  const cn = (lang) => project(lang, { info: { client: '刘先生', location: '麻坡', proposalTitle: '刘府全屋定制方案' } });
  for (const lang of ['en', 'bi']) {
    const cover = render('cover', lang, {}, { project: cn(lang) });
    assert.deepEqual(cover.tr.misses.map((m) => m.zh).sort(), ['刘先生', '刘府全屋定制方案', '麻坡'].sort(), `cover ${lang}`);
    const dd = render('design-divider', lang, {}, { project: cn(lang) });
    assert.deepEqual(dd.tr.misses.map((m) => m.zh).sort(), ['刘先生', '麻坡'].sort(), `design-divider ${lang}`);
    for (const key of COMPANY_KEYS_B.filter((k) => !['cover', 'design-divider'].includes(k))) {
      const pg = render(key, lang, {}, { project: cn(lang) });
      assert.deepEqual(pg.tr.misses, [], `${key} ${lang}: 不该提醒缺英文`);
    }
  }
  // 有翻译就不记
  const tl = render('cover', 'en', {}, { project: { ...cn('en'), translations: { 刘先生: 'Mr Lau', 麻坡: 'Muar', 刘府全屋定制方案: 'The Lau Residence' } } });
  assert.deepEqual(tl.tr.misses, []);
  assert.ok(texts(tl).map(textOf).includes('Mr Lau\nMuar'));
});

test('落在底线上的字靠底排（valign b）：封面客户名、章节页、理念正文与结语、认证正文', () => {
  const check = (key, lang, fields, slide = {}, opts = {}) => {
    const pg = render(key, lang, slide, opts);
    for (const f of fields) {
      const els = texts(pg).filter((el) => (el.edit?.field || '').replace(/^overrides(En)?\./, '') === f);
      assert.ok(els.length, `${key}.${f}`);
      for (const el of els) assert.equal(el.valign, 'b', `${key}.${f} ${lang}`);
    }
  };
  for (const lang of LANGS) {
    check('brand-divider', lang, ['title', 'lead']);
    check('brand-philosophy', lang, ['body', 'closing']);
    check('company-certified', lang, ['body']);
  }
  // 封面：客户名（并排或放不下时上下排）都靠底
  for (const lang of LANGS) check('cover', lang, ['name']);
  check('cover', 'bi', ['name'], { overrides: { name: '麻坡 · 刘先生与刘太太的家\n全屋定制' }, overridesEn: { name: 'The Lau Family Residence\nMuar, Johor, Malaysia' } });
  check('cover', 'bi', ['name'], { overrides: { name: '刘府\n麻坡' }, overridesEn: { name: 'Lau Residence,\nMuar' } });
});

test('未知的页：不报错，返回提醒', () => {
  const pg = renderCompanyB('nope', {}, { project: project('zh'), lang: 'zh' });
  assert.deepEqual(pg.els, []);
  assert.ok(pg.warnings[0].includes('nope'));
  // 不传 tr / tokens / meta 也能排（编辑器缩略图等场合）
  const bare = renderCompanyB('closing', {}, { project: project('bi') });
  assert.ok(texts(bare).length > 5);
  assertLayout(bare, 'closing 最少参数');
});

// ---------------------------------------------------------------------------
// 复核修正：英文跟着中文、栏位名的截短提醒、旧版改写、章节编号、均衡断行
// ---------------------------------------------------------------------------

test('只改了中文：「5 年」→ 5 years、日期、纯英文（Mr & Mrs Lau）英文自动跟着变，不提醒补英文', () => {
  assert.equal(yearsEn('5 年'), '5 years');
  assert.equal(yearsEn('10年'), '10 years');
  assert.equal(yearsEn('五年'), '5 years');
  assert.equal(yearsEn('十五年'), '15 years');
  assert.equal(yearsEn('3–5 年'), '3–5 years');
  assert.equal(yearsEn('1 年'), '1 year');
  assert.equal(yearsEn('终身'), '');
  assert.equal(dateEn('二〇二六年九月'), 'September 2026', '封面默认的中文日期写法也认得');
  const bi = render('service-aftersales', 'bi', { overrides: { r3Text: '5 年', r4Text: '10 年' } });
  const all = texts(bi).map(textOf);
  assert.ok(all.includes('5 years') && all.includes('10 years'));
  assert.deepEqual(bi.warnings, [], bi.warnings.join(' / '));
  // 换不过来的（终身）：英文还是空格 → 说清是英文没填，一键修复去英文栏
  const life = render('service-aftersales', 'bi', { overrides: { r3Text: '终身', r4Text: '10 年' } });
  assert.ok(life.warnings.some((w) => /^售后维保：五金质保年数的英文还没填/.test(w)), life.warnings.join(' / '));
  assert.ok(!life.warnings.some((w) => /板材/.test(w)));
  // English 版直接填了英文、中文空着：算填好
  assert.ok(!render('service-aftersales', 'en', { overridesEn: { r3Text: '5 years', r4Text: '10 years' } }).warnings.some((w) => /质保年数/.test(w)));
  // 封面日期：改了中文日期，英文跟着
  const date = render('cover', 'en', { overrides: { date: '二〇二六年九月' } });
  assert.ok(texts(date).map(textOf).includes('September 2026'));
  assert.ok(!date.warnings.some((w) => /改过的中文/.test(w)));
  // 客户名改成纯英文：中英版只印一次、English 版用新名字，不提醒
  const name = render('cover', 'bi', { overrides: { name: 'Mr & Mrs Lau\nMuar' } });
  assert.equal(texts(name).filter((el) => /Lau/.test(textOf(el))).length, 1);
  assert.ok(!name.warnings.some((w) => /改过的中文/.test(w)));
  assert.ok(texts(render('cover', 'en', { overrides: { name: 'Mr & Mrs Lau\nMuar' } })).map(textOf).includes('Mr & Mrs Lau\nMuar'));
  // 栏位给编辑器：英文是自动跟着的
  const f = companyFieldsB('service-aftersales', { overrides: { r3Text: '5 年' } }, project('bi')).find((x) => x.field === 'r3Text');
  assert.equal(f.en, '5 years');
  assert.equal(f.autoEn, true);
});

test('截短提醒说的是栏位名（中文 / 英文），一键修复用 companyFieldByLabel 找到那一栏；截短的字不再悄悄截掉', () => {
  const pg = render('contents', 'bi', { overrides: { ch1Line: '自然栖居，生活回归，再加上很长很长很长很长很长很长很长很长很长很长的说明' } });
  const w = pg.warnings.find((x) => /^文字太长放不下/.test(x));
  assert.match(w, /^文字太长放不下：「说明 · 品牌」已截短/);
  assert.equal(companyFieldByLabel('contents', '说明 · 品牌'), 'overrides.ch1Line');
  assert.equal(companyFieldByLabel('brand-story', '正文（英文）'), 'overridesEn.body');
  assert.equal(companyFieldByLabel('brand-story', '没有这一栏'), null);
  assert.ok(!pg.els.some((e) => '_cut' in e), '内部记号不留在元素上');
  const en = render('brand-story', 'en', { overridesEn: { body: 'a very long sentence, '.repeat(60) } });
  assert.ok(en.warnings.some((x) => /「正文（英文）」已截短/.test(x)), en.warnings.join(' / '));
  // 以前不提醒的：年份太长被截成一行
  const year = render('company-history', 'zh', { overrides: { y1: '2015 年至 2016 年之间的某一个时间点' } });
  assert.ok(year.warnings.some((x) => /「年份一」已截短/.test(x)), year.warnings.join(' / '));
});

test('旧模板的数字键：页面不用，但会提醒（华文只看中文的）；legacyOverrides 列出来', () => {
  const slide = { overrides: { 3: '刘府 · 麻坡（旧版）', subtitle: '新方案名' }, overridesEn: { 2: 'Old English' } };
  assert.deepEqual(legacyOverrides(slide, 'zh'), [{ bucket: 'overrides', key: '3', text: '刘府 · 麻坡（旧版）' }]);
  assert.equal(legacyOverrides(slide, 'bi').length, 2);
  const zh = render('cover', 'zh', slide);
  assert.ok(zh.warnings.some((w) => /^旧版里改过的字新版式没有沿用（1 处）/.test(w)));
  assert.ok(!texts(zh).some((el) => textOf(el).includes('旧版')));
  assert.ok(render('cover', 'en', slide).warnings.some((w) => /（2 处）/.test(w)));
  assert.ok(!render('cover', 'zh').warnings.some((w) => /旧版/.test(w)));
});

test('章节：隐藏的章节不进目录、编号重排；章节页的「第几章」跟着往前排（改过的标签不动）', () => {
  assert.equal(chapterZh(2), '第二章');
  assert.equal(chapterEn(4), 'Chapter Four');
  const p = project('bi');
  const slide = (key, enabled = true) => ({ id: `c-${key}`, kind: 'company', key, enabled });
  p.slides = [
    slide('cover'), slide('contents'), slide('brand-divider', false), slide('brand-story', false), slide('company-divider'),
    { id: 'v', kind: 'view', enabled: true }, slide('service-divider'), slide('closing'),
  ];
  const ch = deckChapters(p);
  assert.deepEqual(ch.list, ['company', 'design', 'service']);
  assert.deepEqual(ch.num, { brand: 1, company: 1, design: 2, service: 3 });
  // 只剩封底的服务章节不算
  assert.deepEqual(deckChapters({ ...p, slides: p.slides.filter((s) => s.key !== 'service-divider') }).list, ['company', 'design']);
  const tr = makeTranslator(p);
  const ctx = { project: p, lang: 'bi', tr, tokens: projectTokens(p), chapters: ch };
  const contents = renderCompanyB('contents', p.slides[1], ctx);
  const t = texts(contents).map(textOf);
  assert.deepEqual(t.filter((x) => /^0\d$/.test(x)), ['01', '02', '03']);
  assert.ok(t.includes('公司') && t.includes('Service') && !t.includes('品牌'));
  assertLayout(contents, 'contents 3 章');
  const div = texts(renderCompanyB('service-divider', p.slides[6], ctx)).map(textOf);
  assert.ok(div.includes('第三章　服务') && div.includes('Chapter Three — Service'));
  const custom = texts(renderCompanyB('service-divider', { ...p.slides[6], overrides: { label: '第四章　服务' } }, ctx)).map(textOf);
  assert.ok(custom.includes('第四章　服务'), '设计师改过的标签照用');
  // 单独排一页（没有整套）= 四章都在
  assert.ok(texts(render('brand-divider', 'zh')).map(textOf).includes('第一章　品牌'));
});

test('封面客户名很长：大字均衡断行，不留落单的一个词（与方案封面一致）', () => {
  const long = project('en', { info: { client: 'Mr & Mrs Lau Chee Keong and Family', location: 'Bandar Baru Seri Petaling, Kuala Lumpur' } });
  const pg = render('cover', 'en', {}, { project: long });
  const name = texts(pg).find((el) => /Lau/.test(textOf(el)));
  const lines = textOf(name).split('\n');
  assert.ok(lines.length >= 3, textOf(name));
  for (const line of lines) assert.ok(line.trim().split(/\s+/).length >= 2, `落单的一个词：${JSON.stringify(lines)}`);
  assert.ok(lines.some((l) => /Petaling,$/.test(l)), '地址在逗号处断开');
  assertLayout(pg, 'cover 长英文名');
});
