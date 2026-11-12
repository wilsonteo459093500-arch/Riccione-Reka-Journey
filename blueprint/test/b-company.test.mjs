// C 安然 · 公司固定页（品牌画册 20 页）：20 页 × 华文 / English / 中英 都排得出；字在画布里、文字互不重叠；
// 白字压在照片上必须有托字渐变（1C1915、最深 45%），照片不加色层；纸面文字栏不留大空洞；半版照片上下贴边；
// 品牌分开（瑞吉欧的页只用 RICCIONE 商标、瑞吉欧的照片和签名）；English 版没有中文、中英版两种文字都有且同样大小；
// 编辑字段齐全；缺图 / 像素低 / 字太长 / 质保年数没填会提醒
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { test } from './harness.mjs';
import {
  COMPANY_PAGES_B, COMPANY_KEYS_B, renderCompanyB, companyFieldsB, companyImagesB, companyTokensB, dateZh, dateEn,
  PHOTOS, LOGO, QR, yearsEn, deckChapters, chapterZh, chapterEn, companyFieldByLabel, legacyOverrides, PHOTO_HIDDEN, ZH_EN_HEADER, LETTER_BI_PHOTO_W,
} from '../src/engine/b/company.js';
import { INSET, B, LOGOS, ALPHA, measure, SIGNATURE } from '../src/engine/b/kit.js';
import { makeTranslator } from '../src/engine/lang.js';
import { fixForWarning } from '../src/components/editor/ops.js';
import { projectTokens } from '../src/engine/deck.js';
import { COMPANY_BEFORE_DESIGN, COMPANY_AFTER_DESIGN_HEAD, COMPANY_AFTER_DESIGN_TAIL } from '../src/engine/model.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['zh', 'en', 'bi'];
const CJK = /[⺀-鿿豈-﫿︰-﹏＀-￯　-〿]/;
const PX = 96 / 72;

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
const flat = (s) => s.replace(/\s*\n\s*/g, ' ');
const langOfEl = (el) => el.paras?.[0]?.runs?.[0]?.lang;
const sizeOfEl = (el) => el.paras?.[0]?.runs?.[0]?.size;
const colorOfEl = (el) => el.paras?.[0]?.runs?.[0]?.color;
const texts = (pg) => pg.els.filter((e) => e.t === 'text');
const allText = (pg) => texts(pg).map(textOf).join('\n');
const area = (a, b) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};
const inside = (a, b, tol = 1) => a.x >= b.x - tol && a.y >= b.y - tol && a.x + a.w <= b.x + b.w + tol && a.y + a.h <= b.y + b.h + tol;
const isPhoto = (el) => /^photo:/.test(el.name || '');
const isLogo = (el) => el.t === 'img' && ['logo', 'qr'].includes(el.name);
const isShade = (el) => el.t === 'rect' && !!el.grad;
const isRule = (el) => el.t === 'rect' && !el.grad && !isPhoto(el) && (el.h <= 2 || el.w <= 2);
const LIGHT = new Set([B.white, B.cream]);

/**
 * 文字真正占的地方（字形的可见范围，不是文本框）：每行按实测字宽算，左 / 右 / 居中对齐（和 kit.textLines 的算法一样）；
 * 上下 = 文本框去掉内边距
 */
function inkOf(el) {
  const top = el.y + INSET;
  const bottom = el.y + el.h - INSET;
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const p of el.paras) {
    const runs = p.runs;
    const lines = runs.length === 1 ? runs[0].text.split('\n') : [runs.map((r) => r.text).join('')];
    for (const line of lines) {
      const w = runs.length === 1
        ? measure(line, runs[0])
        : runs.reduce((s, r) => s + measure(r.text, r), 0);
      const sp = (runs[runs.length - 1].spacing || 0) * PX;
      const ink = Math.max(0, w - sp);
      const align = p.align || 'l';
      let a;
      if (align === 'l') a = el.x + INSET;
      else if (align === 'r') a = el.x + el.w - INSET - sp - ink;
      else a = el.x + el.w / 2 - sp / 2 - ink / 2;
      x0 = Math.min(x0, a);
      x1 = Math.max(x1, a + ink);
    }
  }
  return { x: x0, y: top, w: Math.max(0, x1 - x0), h: Math.max(0, bottom - top) };
}

/** 托字渐变盖住的地方最深多少 */
const shadeMax = (s) => Math.max(...s.grad.stops.map((t) => t.alpha));

function assertLayout(pg, label) {
  for (const el of pg.els) {
    for (const k of ['x', 'y', 'w', 'h']) assert.ok(Number.isFinite(el[k]), `${label}: ${k} 不是数字`);
    assert.ok(el.x >= -0.01 && el.y >= -0.01 && el.x + el.w <= 1920.01 && el.y + el.h <= 1080.01, `${label}: 元素出了画布 ${JSON.stringify({ t: el.t, x: el.x, y: el.y, w: el.w, h: el.h, text: el.t === 'text' ? textOf(el).slice(0, 30) : el.src })}`);
  }
  const ts = texts(pg).map((el) => ({ el, ink: inkOf(el) }));
  for (let i = 0; i < ts.length; i++) {
    for (let j = i + 1; j < ts.length; j++) {
      const a = area(ts[i].ink, ts[j].ink);
      assert.ok(a < 0.5, `${label}: 文字重叠「${textOf(ts[i].el).slice(0, 20)}」×「${textOf(ts[j].el).slice(0, 20)}」(${a.toFixed(1)}px²)`);
    }
  }
  const photos = pg.els.filter(isPhoto);
  const shades = pg.els.filter(isShade);
  for (const { el, ink } of ts) {
    for (const o of pg.els.filter((e) => isRule(e) || isLogo(e))) {
      assert.ok(area(ink, o) < 0.5, `${label}: 文字「${textOf(el).slice(0, 20)}」压在${isLogo(o) ? ' logo / 二维码' : '细线'}上`);
    }
    // 压在照片上的字：只能是白字（FFFFFF / F5EFDD），而且下面有托字渐变
    for (const ph of photos) {
      const a = area(ink, ph);
      if (a < 0.5) continue;
      assert.ok(LIGHT.has(colorOfEl(el)), `${label}: 深色字「${textOf(el).slice(0, 20)}」压在照片上`);
      const x = Math.max(ink.x, ph.x);
      const y = Math.max(ink.y, ph.y);
      const part = { x, y, w: Math.min(ink.x + ink.w, ph.x + ph.w) - x, h: Math.min(ink.y + ink.h, ph.y + ph.h) - y };
      if (ph.t === 'rect') continue; // 缺图的深色占位：不用托
      const s = shades.find((sh) => inside(part, sh));
      assert.ok(s, `${label}: 白字「${textOf(el).slice(0, 20)}」压在照片上，下面没有托字渐变`);
      assert.ok(shadeMax(s) >= 0.15, `${label}: 白字「${textOf(el).slice(0, 20)}」下面的托字渐变太浅（${shadeMax(s)}）`);
    }
  }
}

/**
 * 纸面文字栏里最大的竖向空洞：照片以外、所有字 / 细线 / logo 的上下范围合起来，从第一块到最后一块（含页脚签名）之间的最大空隙
 * 满版照片页（没有纸面文字栏）不算
 */
function paperGap(pg) {
  const photos = pg.els.filter(isPhoto);
  const onPaper = (b) => !photos.some((ph) => ph.h >= 1080 && area(b, ph) > 0.5 * b.w * b.h);
  // 版心里的照片（原创系列那一排）也是内容；上下贴边的半版 / 满版照片不算文字栏
  const inset = photos.filter((ph) => ph.h < 1080);
  const boxes = pg.els
    .filter((e) => e.t === 'text' || isRule(e) || isLogo(e))
    .map((e) => (e.t === 'text' ? inkOf(e) : e))
    .filter((b) => b.h > 0 && onPaper(b))
    .concat(inset)
    .map((b) => [b.y, b.y + b.h])
    .sort((a, b) => a[0] - b[0]);
  if (!boxes.length) return { gap: 0 };
  let best = { gap: boxes[0][0], from: 0, to: boxes[0][0] };
  let cur = boxes[0][1];
  for (const [a, b] of boxes.slice(1)) {
    if (a - cur > best.gap) best = { gap: a - cur, from: cur, to: a };
    cur = Math.max(cur, b);
  }
  return best;
}

test('20 页都在：页名、章节（opening / brand / company / design / service）', () => {
  const expected = [...COMPANY_BEFORE_DESIGN, 'design-divider', ...COMPANY_AFTER_DESIGN_HEAD, ...COMPANY_AFTER_DESIGN_TAIL];
  assert.deepEqual([...COMPANY_KEYS_B].sort(), [...expected].sort());
  for (const key of COMPANY_KEYS_B) {
    const d = COMPANY_PAGES_B[key];
    assert.ok(d.title, key);
    assert.ok(['opening', 'brand', 'company', 'design', 'service'].includes(d.section), key);
    for (const [f, def] of Object.entries(d.fields)) assert.ok(!/^\d+$/.test(f) && def.label && typeof def.zh === 'string', `${key}.${f}`);
  }
  assert.equal(COMPANY_PAGES_B.cover.section, 'opening');
  assert.equal(COMPANY_PAGES_B.letter.section, 'opening');
  assert.equal(COMPANY_PAGES_B.contents.section, 'opening');
  assert.deepEqual(COMPANY_BEFORE_DESIGN.slice(0, 3), ['cover', 'letter', 'contents'], '感谢信是第二页');
  assert.equal(COMPANY_PAGES_B['design-divider'].section, 'design');
  assert.equal(COMPANY_PAGES_B['brand-awards'].section, 'brand');
  assert.equal(COMPANY_PAGES_B['company-history'].section, 'company');
  assert.equal(COMPANY_PAGES_B.closing.section, 'service');
});

test('每页三种语言都排得出：纸面底（满版页深色底）、元素都在画布里、文字互不重叠、不压细线 / logo；压在照片上的只有白字，下面有托字渐变', () => {
  for (const key of COMPANY_KEYS_B) {
    for (const lang of LANGS) {
      const pg = render(key, lang);
      assert.ok([B.paper, B.band].includes(pg.bg), `${key} ${lang}: 底色 ${pg.bg}`);
      assert.ok(texts(pg).length >= 3, `${key} ${lang}: 没有字`);
      assertLayout(pg, `${key} ${lang}`);
    }
  }
  // 满版照片页（封面、目录、公司章节页）：照片没出来时底色是深色带，白字照样读得清
  for (const key of ['cover', 'contents', 'company-divider']) assert.equal(render(key, 'zh').bg, B.band, key);
});

test('默认稿：没有提醒、照片放大不超过 1.15 倍、照片不加色层；托字渐变 = 1C1915、最深 45%、只在照片里、没有硬边', () => {
  for (const key of COMPANY_KEYS_B) {
    for (const lang of LANGS) {
      const pg = render(key, lang);
      const label = `${key} ${lang}`;
      const extra = key === 'service-aftersales' ? pg.warnings.filter((w) => !/质保年数还没填/.test(w)) : pg.warnings;
      assert.deepEqual(extra, [], `${label}: ${extra.join(' / ')}`);
      for (const img of pg.els.filter((e) => e.t === 'img' && e.crop && e.nat)) {
        const visW = img.nat.w * (1 - img.crop.l - img.crop.r);
        assert.ok(img.w / visW <= 1.15 + 1e-6, `${label}: ${img.src} 放大 ${(img.w / visW).toFixed(2)} 倍`);
        assert.ok(img.crop.l >= 0 && img.crop.r >= 0 && img.crop.t >= 0 && img.crop.b >= 0, `${label}: 裁切比例为负`);
      }
      const photos = pg.els.filter(isPhoto);
      // 不加色层：照片上面没有半透明的实色块（细线除外）
      for (const r of pg.els.filter((e) => e.t === 'rect' && !e.grad && !isPhoto(e) && !isRule(e))) {
        const onPhoto = photos.some((ph) => area(r, ph) > 1);
        assert.ok(!onPhoto || (r.alpha ?? 1) >= 1, `${label}: 照片上有半透明色层 ${JSON.stringify(r)}`);
        assert.ok((r.alpha ?? 1) >= 1, `${label}: 半透明色块 ${JSON.stringify(r)}`);
      }
      for (const s of pg.els.filter(isShade)) {
        assert.equal(s.name, 'shade', `${label}: 渐变不是托字渐变`);
        assert.ok(s.grad.stops.every((t) => t.color === B.shade), `${label}: 托字渐变不是 1C1915`);
        assert.ok(shadeMax(s) <= ALPHA.shadeMax + 1e-9, `${label}: 托字渐变 ${shadeMax(s)} > 0.45`);
        const ph = photos.find((p) => inside(s, p));
        assert.ok(ph, `${label}: 托字渐变出了照片 ${JSON.stringify({ x: s.x, y: s.y, w: s.w, h: s.h })}`);
        // 没有硬边：两头要么归零，要么贯穿到照片边
        const [first, last] = [s.grad.stops[0], s.grad.stops[s.grad.stops.length - 1]];
        const v = s.grad.angle === 90;
        const [lo, hi, plo, phi] = v ? [s.y, s.y + s.h, ph.y, ph.y + ph.h] : [s.x, s.x + s.w, ph.x, ph.x + ph.w];
        assert.ok(first.alpha === 0 || Math.abs(lo - plo) < 1, `${label}: 托字渐变的起点有硬边`);
        assert.ok(last.alpha === 0 || Math.abs(hi - phi) < 1, `${label}: 托字渐变的终点有硬边`);
      }
    }
  }
});

test('照片：半版照片上下贴边（0–1080）、宽 820–1050；满版照片铺满；原创系列五张图同高并排；订单周期上半一条通栏（Aman 第 14 页）', () => {
  for (const [key, lang] of [...COMPANY_KEYS_B.map((k) => [k, 'bi']), ['company-history', 'zh'], ['company-history', 'en']]) {
    const pg = render(key, lang);
    const photos = pg.els.filter(isPhoto);
    if (key === 'brand-collections') {
      assert.equal(photos.length, 5);
      assert.ok(photos.every((p) => p.h === photos[0].h && p.y === photos[0].y && p.h >= 240), `${key}: 五张图不同高`);
      continue;
    }
    if (key === 'service-cycle') {
      assert.equal(photos.length, 1, key);
      assert.deepEqual([photos[0].x, photos[0].y, photos[0].w, photos[0].h], [0, 0, 1920, 520], `${key}: 上半通栏 1920 × 520、贴顶`);
      continue;
    }
    // 中英版的发展历程字多：纸面两栏年表（不放照片）；华文 / English 版半版照片 820（dirA2 第 6 页）
    const none = /^(brand-supply|service-process)$/.test(key) || (key === 'company-history' && lang === 'bi');
    assert.equal(photos.length, none ? 0 : 1, `${key} ${lang}`);
    if (key === 'company-history' && lang !== 'bi') assert.deepEqual([photos[0].x, photos[0].w], [0, 820], `${key} ${lang}: 半版照片贴左 820`);
    for (const p of photos) {
      assert.equal(p.y, 0, `${key}: 照片不贴上边`);
      assert.equal(p.y + p.h, 1080, `${key}: 照片不贴下边`);
      const full = p.w >= 1680;
      // 感谢信的中英版是左右两栏对照：照片收窄到 LETTER_BI_PHOTO_W（680）
      if (key === 'letter' && lang === 'bi') assert.equal(p.w, LETTER_BI_PHOTO_W, `${key} ${lang}: 照片宽`);
      else assert.ok(full || (p.w >= 820 && p.w <= 1050), `${key}: 半版照片宽 ${p.w}`);
      assert.ok(p.x === 0 || p.x + p.w === 1920, `${key}: 照片没有贴左或贴右`);
    }
  }
});

test('页面撑满：纸面文字栏里没有超过 260px 的空洞（三种语言）', () => {
  for (const key of COMPANY_KEYS_B.filter((k) => !['cover', 'contents', 'company-divider'].includes(k))) {
    for (const lang of LANGS) {
      const g = paperGap(render(key, lang));
      assert.ok(g.gap <= 260, `${key} ${lang}: 空洞 ${Math.round(g.gap)}px（y ${Math.round(g.from)}–${Math.round(g.to)}）`);
    }
  }
});

test('English 版没有中文；中英版两种文字都有，而且英文和中文同样大小（不是小字英文）', () => {
  for (const key of COMPANY_KEYS_B) {
    const en = render(key, 'en');
    for (const el of texts(en)) assert.ok(!CJK.test(textOf(el)), `${key} en: 「${textOf(el)}」`);
    const bi = render(key, 'bi');
    const all = allText(bi);
    assert.ok(CJK.test(all), `${key} bi: 没有中文`);
    assert.ok(texts(bi).some((el) => langOfEl(el) === 'en' && /[A-Za-z]{3}/.test(textOf(el))), `${key} bi: 没有英文`);
    // 同一字段的中文、英文元素：英文字号不小于中文的 0.8
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
          // 没有编辑字段的只有编号（01…）和页脚签名（品牌的固定元素）
          assert.ok(/^0\d$/.test(textOf(el)) || el.name === 'signature', `${key} ${lang}: 「${textOf(el)}」没有编辑字段`);
          continue;
        }
        const m = f.match(/^(overrides|overridesEn)\.([A-Za-z0-9]+)$/);
        assert.ok(m, `${key}: ${f}`);
        const fd = def.fields[m[2]];
        assert.ok(fd, `${key}: 没有字段 ${m[2]}`);
        seen.add(m[2]);
        // 同一段里另一栏的字（订单周期的单位）：edit.zones 指到它自己的栏位，范围在这个元素里
        for (const z of el.edit.zones || []) {
          const zm = z.field.match(/^(overrides|overridesEn)\.([A-Za-z0-9]+)$/);
          assert.ok(zm && def.fields[zm[2]], `${key}: zone ${z.field}`);
          assert.ok(z.x >= el.x - 0.5 && z.x + z.w <= el.x + el.w + 0.5 && z.y >= el.y - 0.5 && z.y + z.h <= el.y + el.h + 0.5, `${key}: zone ${z.field} 出了元素`);
          seen.add(zm[2]);
        }
        const cur = companyFieldsB(key, {}, project(lang)).find((x) => x.field === m[2]);
        const shared = fd.en === undefined || cur.zh === cur.en;
        if (!shared && langOfEl(el) === 'zh' && CJK.test(textOf(el))) assert.equal(m[1], 'overrides', `${key}.${m[2]} 中文元素`);
        if (!shared && langOfEl(el) === 'en' && lang !== 'zh') assert.equal(m[1], 'overridesEn', `${key}.${m[2]} 英文元素`);
      }
      for (const el of pg.els.filter(isPhoto)) {
        const slot = el.name.slice(6);
        assert.ok(def.images[slot], `${key}: 照片位 ${slot}`);
        assert.equal(el.edit?.field, `image.${slot}`);
      }
      for (const el of pg.els.filter((e) => e.t === 'img' && !isPhoto(e))) assert.ok(['logo', 'qr'].includes(el.name), `${key}: ${el.src}`);
    }
    for (const f of Object.keys(def.fields)) assert.ok(seen.has(f), `${key}.${f} 在页面上点不到`);
    // 每个照片位都在页面上（只有 PHOTO_HIDDEN 里注明的语言不放：中英版的发展历程）
    for (const lang of LANGS) {
      const want = Object.keys(def.images).filter((slot) => !(PHOTO_HIDDEN[key]?.[slot] || []).includes(lang)).length;
      assert.equal(render(key, lang).els.filter(isPhoto).length, want, `${key} ${lang}: 照片位数量`);
    }
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
  // 照片位的名字唯一（编辑器按名字找照片位）：除了各章节页都叫「章节照片」
  const labels = COMPANY_KEYS_B.flatMap((k) => Object.values(COMPANY_PAGES_B[k].images).map((d) => d.label)).filter((l) => l !== '章节照片');
  assert.equal(new Set(labels).size, labels.length);
});

test('品牌分开：「公司 · 瑞吉欧」章节只用瑞吉欧的照片、RICCIONE 商标和「瑞吉欧 / RICCIONE」签名；其余页只用溪岸的', () => {
  for (const p of Object.values(PHOTOS)) assert.ok(['sail', 'riccione'].includes(p.brand), `${p.src} 没标品牌`);
  for (const key of COMPANY_KEYS_B) {
    const want = COMPANY_PAGES_B[key].section === 'company' ? 'riccione' : 'sail';
    for (const [slot, d] of Object.entries(COMPANY_PAGES_B[key].images)) {
      const photo = Object.values(PHOTOS).find((p) => p.src === d.src);
      assert.equal(photo?.brand, want, `${key}.${slot}（${d.src}）应该用${want === 'riccione' ? '瑞吉欧' : '溪岸'}的照片`);
    }
    for (const lang of LANGS) {
      const pg = render(key, lang);
      const label = `${key} ${lang}`;
      const logos = pg.els.filter((e) => e.t === 'img' && e.name === 'logo').map((e) => e.src);
      const sig = flat(texts(pg).filter((e) => e.name === 'signature').map(textOf).join(' '));
      assert.equal(logos.length, 1, `${label}: 角上要有一个 logo`);
      if (want === 'riccione') {
        assert.ok(logos.every((s) => /riccione-logo-(color|white|ink)\.png$/.test(s)), `${label}: 瑞吉欧的页用了 ${logos}`);
        assert.ok(!/自然栖居|LIVING NATURALLY/.test(allText(pg)), `${label}: 瑞吉欧的页出现了溪岸口号`);
        assert.ok(sig.includes(SIGNATURE.riccione.en) && (lang === 'en' || sig.includes(SIGNATURE.riccione.zh)), `${label}: 签名 ${sig}`);
      } else {
        assert.ok(logos.every((s) => /\/logo-(ink|white)\.png$/.test(s)), `${label}: 溪岸的页用了 ${logos}`);
        assert.ok(!/RICCIONE/.test(sig), `${label}: 溪岸的页签名 ${sig}`);
        assert.ok(sig.includes(SIGNATURE.sail.en), `${label}: 签名 ${sig}`);
      }
    }
  }
  // 换下来的图不留在仓库里：public/template 里每张图都有人用（C 安然的 logo 在 kit.LOGOS 里）
  const used = new Set([...Object.values(PHOTOS), LOGO, QR, ...Object.values(LOGOS)].map((p) => p.src));
  const dir = (sub) => readdirSync(path.join(ROOT, 'public/template', sub)).filter((f) => /\.(jpe?g|png)$/i.test(f)).map((f) => `/template/${sub ? `${sub}/` : ''}${f}`);
  for (const src of [...dir(''), ...dir('b')]) assert.ok(used.has(src), `没用到的图 ${src}`);
});

test('托字渐变的深浅：默认照片 + 默认文案按实测（浅一点，照片保持明亮）；换了照片或改了字 → 一律最深 45%', () => {
  const max = (pg) => Math.max(...pg.els.filter(isShade).map(shadeMax));
  // 封面的灰墙本来就够深：默认只轻轻托一下
  assert.ok(max(render('cover', 'zh')) < ALPHA.shadeMax, '封面默认托字应该比最深浅');
  // 换了照片：看不到像素，宁可深一点
  assert.equal(max(render('cover', 'zh', { images: { photo: 'asset:new' } })), ALPHA.shadeMax);
  assert.equal(max(render('brand-divider', 'zh', { images: { photo: 'asset:new' } })), ALPHA.shadeMax);
  // 改了这一页的字（字可能排到更亮的地方）
  assert.equal(max(render('company-divider', 'zh', { overrides: { lead: '名字取自意大利亚得里亚海边的一座小镇，阳光与海风。' } })), ALPHA.shadeMax);
  // 缺图：深色占位，白字照样读得清
  const none = render('company-divider', 'zh', { images: { photo: null } });
  const ph = none.els.find(isPhoto);
  assert.equal(ph.t, 'rect');
  assert.equal(ph.fill, B.band);
  assertLayout(none, 'company-divider 缺图');
});

test('改写：overrides / overridesEn 生效；旧模板的数字键被忽略；{{token}} 也能写在改写里', () => {
  const pg = render('brand-story', 'bi', {
    overrides: { title: '从成都出发', 0: '旧模板第 0 框', 13: '旧模板正文' },
    overridesEn: { title: 'Setting out from Chengdu', 2: 'old' },
  });
  const all = texts(pg).map(textOf);
  assert.ok(all.includes('从成都出发'));
  assert.ok(flat(all.join('\n')).includes('SETTING OUT FROM CHENGDU'), '英文标题全大写');
  assert.ok(!all.some((t) => /旧模板|^old$/.test(t)));
  const cover = render('cover', 'zh', { overrides: { subtitle: '{{clientLine}} 的家' } });
  assert.ok(texts(cover).map(textOf).includes('Muar · Mr Lau 的家'));
  // 只改了中文：English / 中英版提醒补英文
  const stale = render('brand-divider', 'bi', { overrides: { lead: '溪岸，是一条安静的溪。' } });
  assert.ok(stale.warnings.some((w) => /改过的中文还没有对应的英文/.test(w)));
  assert.equal(render('brand-divider', 'zh', { overrides: { lead: '溪岸，是一条安静的溪。' } }).warnings.length, 0);
});

test('{{token}}：封面客户（大字）/ 地点 · 日期（一行小字）、目录与方案章节页的楼层', () => {
  const zh = allText(render('cover', 'zh'));
  assert.ok(zh.includes('MR LAU'), '客户名 Ogg 大写一行');
  assert.ok(zh.includes('MUAR · ') && zh.includes('二〇二六年八月'), '地点 · 日期');
  assert.ok(zh.includes('全屋定制设计方案'));
  const en = allText(render('cover', 'en'));
  assert.ok(en.includes('WHOLE-HOUSE DESIGN PROPOSAL') && en.includes('AUGUST 2026'));
  // 客户名中英一样：中英版只排一次
  assert.equal(texts(render('cover', 'bi')).filter((el) => textOf(el) === 'MR LAU').length, 1);
  const dd = allText(render('design-divider', 'bi'));
  assert.ok(dd.includes('一楼与二楼') && dd.includes('Ground & First Floor'));
  const ct = allText(render('contents', 'en'));
  assert.ok(flat(ct).includes('Ground & First Floor, room by room'));
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
  const t = texts(en).map(textOf);
  assert.ok(t.includes('刘先生') && t.some((s) => s.startsWith('麻坡')));
  assert.ok(en.tr.misses.some((m) => m.zh === '刘先生'));
  assertLayout(en, 'cover 中文客户 en');
  const bi = render('cover', 'bi', {}, { project: { ...cn, info: { ...cn.info, lang: 'bi' } } });
  assert.equal(texts(bi).filter((el) => textOf(el).includes('刘先生')).length, 1);
  // 有翻译：两种都排
  const tl = render('cover', 'bi', {}, { project: { ...cn, info: { ...cn.info, lang: 'bi' }, translations: { 刘先生: 'Mr Lau', 麻坡: 'Muar' } } });
  const tt = texts(tl).map(textOf);
  assert.ok(tt.includes('刘先生') && tt.includes('MR LAU'));
  assertLayout(tl, 'cover 中英两种客户名');
});

test('提醒：缺照片、照片像素偏低、字太长（截短加「…」）', () => {
  const none = render('cover', 'zh', { images: { photo: null } });
  assert.ok(none.warnings.some((w) => /^缺照片/.test(w)));
  const ph = none.els.find((e) => e.name === 'photo:photo');
  assert.equal(ph.t, 'rect');
  assert.equal(ph.edit.field, 'image.photo');
  const low = render('company-divider', 'bi', { images: { photo: 'asset:small' } }, { meta: (src) => (src === 'asset:small' ? { w: 400, h: 500 } : null) });
  assert.ok(low.warnings.some((w) => /^图片像素偏低：.*放大 \d\.\d 倍/.test(w)), low.warnings.join());
  assert.equal(low.els.find((e) => e.name === 'photo:photo').src, 'asset:small');
  // 换了一张不知道尺寸的图：照常铺满，不报错
  const unknown = render('closing', 'bi', { images: { photo: 'asset:new' } });
  assert.equal(unknown.els.find((e) => e.name === 'photo:photo').fit, 'cover');
  const long = render('brand-philosophy', 'bi', { overrides: { body: '很长的一段话，'.repeat(60) }, overridesEn: { body: 'a very long sentence, '.repeat(60) } });
  assert.ok(long.warnings.some((w) => /^文字太长放不下/.test(w)));
  assert.ok(texts(long).some((el) => textOf(el).endsWith('…')));
  assertLayout(long, 'philosophy 长文');
});

test('公司章节页：换了竖图（铺满会放大超过 1.15 倍）就改成半版，照片不发虚', () => {
  const meta = (src) => (src === 'asset:portrait' ? { w: 1200, h: 1600 } : null);
  const pg = render('company-divider', 'bi', { images: { photo: 'asset:portrait' } }, { meta });
  const ph = pg.els.find(isPhoto);
  assert.ok(ph.w <= 1050 && ph.x === 0 && ph.h === 1080, JSON.stringify(ph));
  assert.ok(!pg.warnings.some((w) => /像素偏低/.test(w)), pg.warnings.join());
  assert.ok(pg.els.some((e) => e.name === 'logo' && /riccione-logo-color/.test(e.src)), '纸面上用原色 RICCIONE 商标');
  assertLayout(pg, 'company-divider 竖图');
});

test('压力测试：每个字段都填超长文字，20 页 × 三种语言仍然不重叠、不出画布，并提醒截短', () => {
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
      // 文字栏的字不压到页脚签名那一带（签名的行顶 944）
      for (const el of texts(pg).filter((e) => e.name !== 'signature')) {
        const ink = inkOf(el);
        const sig = texts(pg).filter((e) => e.name === 'signature').map(inkOf);
        for (const s of sig) assert.ok(area(ink, s) < 0.5, `${key} ${lang}: 「${textOf(el).slice(0, 12)}」压到签名`);
      }
    }
  }
});

test('边界：长客户名 + 四层楼、隐藏章节都排得下，不截短默认稿', () => {
  const floors = [['一楼', 'GROUND FLOOR'], ['二楼', 'FIRST FLOOR'], ['三楼', 'SECOND FLOOR'], ['四楼', 'THIRD FLOOR']].map(([zh, en], i) => ({ id: `f${i}`, zh, en }));
  for (const lang of LANGS) {
    const p = { ...project(lang, { info: { client: 'Mr & Mrs Lau Chee Keong and Family', location: 'Bandar Baru Seri Petaling, Kuala Lumpur' } }), floors };
    for (const key of ['cover', 'contents', 'design-divider']) {
      const pg = render(key, lang, {}, { project: p });
      assertLayout(pg, `${key} ${lang} 长客户名 4 层`);
      assert.ok(!pg.warnings.some((w) => /文字太长/.test(w)), `${key} ${lang}: ${pg.warnings.join(' / ')}`);
      assert.ok(!texts(pg).some((el) => /…$/.test(textOf(el))), `${key} ${lang}: 有「…」`);
    }
  }
});

test('售后维保：质保年数默认 五金 终身保家 / Lifetime、板材 1 年 / 1 year（不提醒）；改回空格（＿＿）会提醒，填了就不提醒', () => {
  for (const lang of ['zh', 'en', 'bi']) {
    const def = render('service-aftersales', lang);
    assert.ok(!def.warnings.some((w) => /质保年数/.test(w)), `${lang}: ${def.warnings.join(' / ')}`);
    const t = texts(def).map(textOf);
    if (lang !== 'en') assert.ok(t.includes('终身保家') && t.includes('1 年'), `${lang}: ${t.join(' | ')}`);
    if (lang !== 'zh') assert.ok(t.includes('Lifetime') && t.includes('1 year'), `${lang}: ${t.join(' | ')}`);
  }
  // 设计师把它改回空格：照旧提醒
  const blank = render('service-aftersales', 'zh', { overrides: { r3Text: '＿＿ 年', r4Text: '＿＿ 年' } });
  assert.ok(blank.warnings.some((w) => /质保年数还没填/.test(w)), blank.warnings.join(' / '));
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
  // 目录新加的照片位
  assert.deepEqual(companyImagesB('contents').map((i) => i.slot), ['photo']);
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
// C 安然的版式细节：标题系统、章节页、表格、订单周期
// ---------------------------------------------------------------------------

const byField = (pg, f) => texts(pg).filter((el) => el.edit?.field === f);

test('标题系统：英文大写 Ogg 在上、中文思源宋体在下（华文版也有英文页眉）；English 版只有英文', () => {
  for (const key of ['brand-philosophy', 'brand-awards', 'company-history', 'service-aftersales']) {
    for (const lang of LANGS) {
      const pg = render(key, lang);
      const [en] = byField(pg, 'overridesEn.title');
      const [zh] = byField(pg, 'overrides.title');
      assert.ok(en, `${key} ${lang}: 没有英文页眉`);
      assert.equal(en.paras[0].runs[0].font, 'ogg');
      assert.equal(textOf(en), textOf(en).toUpperCase(), `${key} ${lang}: 英文页眉要全大写`);
      assert.equal(colorOfEl(en), B.title);
      if (lang === 'en') assert.ok(!zh, `${key}: English 版不该有中文标题`);
      else {
        assert.equal(zh.paras[0].runs[0].font, 'songSB');
        assert.ok(zh.y >= en.y + en.h - 2 * INSET - 1, `${key} ${lang}: 中文在英文下面`);
      }
    }
  }
});

test('章节页：栏目名（BRAND / 第一章　品牌）压在照片左上（有托字）；纸面上大字 → 短线 → 一句话；方案章节页三、四层楼的一句话完整', () => {
  const pg = render('brand-divider', 'bi');
  const [head] = byField(pg, 'overridesEn.label');
  const [zh] = byField(pg, 'overrides.label');
  assert.equal(textOf(head), 'BRAND');
  assert.equal(textOf(zh), '第一章　品牌');
  assert.equal(colorOfEl(head), B.white);
  // English 版：栏目名下面一行小字「CHAPTER ONE」
  assert.ok(allText(render('brand-divider', 'en')).includes('CHAPTER ONE'));
  const floorsOf = (n) => [['一楼', 'GROUND FLOOR'], ['二楼', 'FIRST FLOOR'], ['三楼', 'SECOND FLOOR'], ['四楼', 'THIRD FLOOR']].slice(0, n).map(([z, e], i) => ({ id: `f${i}`, zh: z, en: e }));
  for (const n of [1, 2, 3, 4]) {
    const p = { ...project('bi'), floors: floorsOf(n) };
    const d = render('design-divider', 'bi', {}, { project: p });
    assertLayout(d, `design-divider ${n} 层`);
    const [lz] = byField(d, 'overrides.lead');
    const [le] = byField(d, 'overridesEn.lead');
    assert.ok(lz && le, `${n} 层：一句话中英都要有`);
    assert.ok(!/…$/.test(textOf(lz)) && !/…$/.test(textOf(le)), `${n} 层：一句话被截短`);
    assert.ok(le.y >= lz.y + lz.h - 2 * INSET - 1, `${n} 层：英文在中文下面`);
    // 大字（Mr Lau / Muar 纯拉丁字：Ogg 大写）在一句话上面、纸面栏里
    const titles = texts(d).filter((el) => /^overrides(En)?\.title$/.test(el.edit?.field || ''));
    assert.ok(titles.length >= 1 && titles.every((t) => t.paras[0].runs[0].font === 'ogg' && t.x >= 1100 && t.y < lz.y));
  }
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
    assert.ok(textOf(el).split('\n').length >= 2, `${key}.${field} 应该排成多行`);
  }
  // 理念 / 认证正文 7–8 行：地方够，整段排出来
  const body = 'SAIL is the home our founder always imagined.\nThrough design that quiets the mind,\nwe hope to lead you back\nto the home you long for:\na home with a simple beauty\nand the healing power of nature,\nquiet, warm and honest.\nA place to come back to.';
  for (const key of ['brand-philosophy', 'company-certified']) {
    const pg = render(key, 'en', { overridesEn: { body } });
    assertLayout(pg, `${key} 8 行`);
    assert.deepEqual(pg.warnings, [], key);
    assert.equal(textOf(byField(pg, 'overridesEn.body')[0]), body);
  }
});

test('表格的行：年份 / 项名和同一行的内容顶对齐（奖项、发展历程、售后维保，中英版）', () => {
  const pairs = [
    ['brand-awards', (n) => [`overrides.y${n}`, `overrides.a${n}`], 4],
    ['company-history', (n) => [`overrides.y${n}`, `overrides.e${n}`], 8],
    ['service-aftersales', (n) => [`overrides.r${n}`, `overrides.r${n}Text`], 4],
  ];
  for (const [key, f, count] of pairs) {
    const pg = render(key, 'bi');
    for (let n = 1; n <= count; n++) {
      const [a, b] = f(n).map((x) => byField(pg, x)[0]);
      assert.ok(a && b, `${key} 第 ${n} 行`);
      assert.ok(Math.abs(a.y - b.y) <= 6, `${key} 第 ${n} 行：${a.y} / ${b.y}`);
      assert.ok(a.x < b.x, `${key} 第 ${n} 行：项名在左`);
    }
  }
});

test('订单周期：上半照片、下半两栏；天数只印一次（Ogg 大字）；单位和天数同一段（共用基线），中英版「天 days」排在一起', () => {
  for (const lang of LANGS) {
    const pg = render('service-cycle', lang);
    assertLayout(pg, `cycle ${lang}`);
    assert.equal(texts(pg).filter((el) => /\d+–\d+/.test(textOf(el))).length, 2, `${lang}: 天数只该出现两次（每个系列一次）`);
    const figs = [];
    for (const n of [1, 2]) {
      const figure = n === 1 ? '60–75' : '75–90';
      const [fig] = byField(pg, `overrides.s${n}N`);
      figs.push(fig);
      const runs = fig.paras[0].runs;
      assert.equal(fig.paras.length, 1);
      assert.ok(!fig.nowrap, '不设 nowrap（网页里 nowrap 的段落是弹性盒，字号不同就不对基线）');
      const unit = lang === 'en' ? 'days' : lang === 'zh' ? '天' : '天 days';
      const figRuns = runs.filter((r) => r.font === 'ogg');
      const unitRuns = runs.filter((r) => r.font !== 'ogg');
      assert.equal(figRuns.map((r) => r.text).join(''), figure);
      assert.equal(unitRuns.map((r) => r.text).join(''), unit, `${lang}: 单位跟在天数后面、同一段（共用基线）`);
      assert.ok(figRuns[0].size > unitRuns[0].size * 3, '天数是大字，单位是正文');
      // 天数和单位之间的空 = 天数最后一个字的字距（约 0.26em），不用空格
      assert.ok(!/\s/.test(figRuns.map((r) => r.text).join('')) && !/^\s/.test(unitRuns[0].text));
      assert.ok(Math.abs(figRuns.at(-1).spacing * PX - 0.26 * figRuns[0].size * PX) <= 1.5, '天数与单位之间的空');
      // 中英版两个单位一样大（中英并重）
      if (lang === 'bi') assert.equal(new Set(unitRuns.filter((r) => r.text.trim()).map((r) => r.size)).size, 1);
      // 系列名在天数正上方（同一栏、左边对齐）
      const label = byField(pg, lang === 'en' ? `overridesEn.s${n}` : `overrides.s${n}`)[0];
      assert.ok(Math.abs(label.x - fig.x) <= 1 && label.y + label.h <= fig.y + INSET + 1, `${lang} 第 ${n} 栏系列名在天数上面`);
      assert.ok(fig.y >= 520, '天数在照片下面的纸面上');
    }
    assert.ok(figs[1].x > 1000 && Math.abs(figs[0].y - figs[1].y) < 1, `${lang}: 两栏并排`);
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
  assert.ok(!/whole-house design proposal/i.test(all.join('\n')), '不该配上通用的英文方案名');
  assert.ok(en.tr.misses.some((m) => m.zh === '刘府全屋定制方案（第二稿）'));
  const bi = render('cover', 'bi', {}, { project: custom('bi') });
  assert.ok(!/whole-house design proposal/i.test(allText(bi)));
  assertLayout(bi, 'cover 自定义方案名');
  const sub = companyFieldsB('cover', {}, custom('bi')).find((x) => x.field === 'subtitle');
  assert.equal(sub.en, '');
  const tl = render('cover', 'bi', {}, { project: custom('bi', { '刘府全屋定制方案（第二稿）': 'The Lau Residence, Second Draft' }) });
  assert.ok(flat(allText(tl)).includes('THE LAU RESIDENCE, SECOND DRAFT'));
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
  assert.ok(texts(tl).map(textOf).includes('MR LAU'));
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
  assert.equal(yearsEn('终身'), 'Lifetime');
  assert.equal(yearsEn('终身保家'), 'Lifetime');
  assert.equal(yearsEn('按合同'), '');
  assert.equal(dateEn('二〇二六年九月'), 'September 2026', '封面默认的中文日期写法也认得');
  const bi = render('service-aftersales', 'bi', { overrides: { r3Text: '5 年', r4Text: '10 年' } });
  const all = texts(bi).map(textOf);
  assert.ok(all.includes('5 years') && all.includes('10 years'));
  assert.deepEqual(bi.warnings, [], bi.warnings.join(' / '));
  // 终身 → Lifetime（自动），不提醒
  const life = render('service-aftersales', 'bi', { overrides: { r3Text: '终身', r4Text: '10 年' } });
  assert.ok(texts(life).map(textOf).includes('Lifetime'));
  assert.deepEqual(life.warnings, [], life.warnings.join(' / '));
  // 换不过来的（按合同）：英文照默认稿印，提醒「改过的中文还没有对应的英文」，一键修复去英文栏
  const odd = render('service-aftersales', 'bi', { overrides: { r3Text: '按合同', r4Text: '10 年' } });
  const ow = odd.warnings.find((w) => /^改过的中文还没有对应的英文/.test(w));
  assert.ok(ow && ow.includes('「五金质保年数」'), odd.warnings.join(' / '));
  assert.ok(!odd.warnings.some((w) => /板材/.test(w)));
  // 改回空格、英文也是空格（中英版）：说清是英文没填
  const blankEn = render('service-aftersales', 'bi', { overrides: { r3Text: '8 年' }, overridesEn: { r3Text: '____ years' } });
  assert.ok(blankEn.warnings.some((w) => /^售后维保：五金质保年数的英文还没填/.test(w)), blankEn.warnings.join(' / '));
  // English 版直接填了英文、中文空着：算填好
  assert.ok(!render('service-aftersales', 'en', { overridesEn: { r3Text: '5 years', r4Text: '10 years' } }).warnings.some((w) => /质保年数/.test(w)));
  // 封面日期：改了中文日期，英文跟着
  const date = render('cover', 'en', { overrides: { date: '二〇二六年九月' } });
  assert.ok(texts(date).map(textOf).includes('SEPTEMBER 2026'));
  assert.ok(!date.warnings.some((w) => /改过的中文/.test(w)));
  // 客户名改成纯英文：中英版只印一次、English 版用新名字，不提醒
  const name = render('cover', 'bi', { overrides: { name: 'Mr & Mrs Lau\nMuar' } });
  assert.equal(texts(name).filter((el) => /^MR & MRS LAU$/.test(textOf(el))).length, 1);
  assert.ok(!name.warnings.some((w) => /改过的中文/.test(w)));
  assert.ok(texts(render('cover', 'en', { overrides: { name: 'Mr & Mrs Lau\nMuar' } })).map(textOf).includes('MR & MRS LAU'));
  // 栏位给编辑器：英文是自动跟着的
  const f = companyFieldsB('service-aftersales', { overrides: { r3Text: '5 年' } }, project('bi')).find((x) => x.field === 'r3Text');
  assert.equal(f.en, '5 years');
  assert.equal(f.autoEn, true);
});

test('截短提醒说的是栏位名（中文 / 英文），一键修复用 companyFieldByLabel 找到那一栏；截短的字不再悄悄截掉', () => {
  const pg = render('contents', 'bi', { overrides: { ch1Line: `自然栖居，生活回归，${'再加上很长很长的说明'.repeat(8)}` } });
  const w = pg.warnings.find((x) => /^文字太长放不下/.test(x));
  assert.match(w, /^文字太长放不下：「说明 · 品牌」已截短/);
  assert.equal(companyFieldByLabel('contents', '说明 · 品牌'), 'overrides.ch1Line');
  assert.equal(companyFieldByLabel('brand-story', '正文（英文）'), 'overridesEn.body');
  assert.equal(companyFieldByLabel('brand-story', '没有这一栏'), null);
  assert.ok(!pg.els.some((e) => '_cut' in e), '内部记号不留在元素上');
  const en = render('brand-story', 'en', { overridesEn: { body: 'a very long sentence, '.repeat(60) } });
  assert.ok(en.warnings.some((x) => /「正文（英文）」已截短/.test(x)), en.warnings.join(' / '));
  // 年份太长被截成一行
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
  assert.ok(div.includes('第三章　服务') && div.includes('SERVICE'));
  const en = texts(renderCompanyB('service-divider', p.slides[6], { ...ctx, lang: 'en' })).map(textOf);
  assert.ok(en.includes('CHAPTER THREE') && en.includes('SERVICE'));
  const custom = texts(renderCompanyB('service-divider', { ...p.slides[6], overrides: { label: '第四章　服务' } }, ctx)).map(textOf);
  assert.ok(custom.includes('第四章　服务'), '设计师改过的标签照用');
  // 单独排一页（没有整套）= 四章都在
  assert.ok(texts(render('brand-divider', 'zh')).map(textOf).includes('第一章　品牌'));
});

test('封面客户名很长：大字缩一档、均衡断行，不留落单的一个词；地点并进「地点 · 日期」那一行', () => {
  const long = project('en', { info: { client: 'Mr & Mrs Lau Chee Keong and Family', location: 'Bandar Baru Seri Petaling, Kuala Lumpur' } });
  const pg = render('cover', 'en', {}, { project: long });
  const name = texts(pg).find((el) => /LAU/.test(textOf(el)));
  const lines = textOf(name).split('\n');
  assert.ok(lines.length >= 2 && lines.length <= 3, textOf(name));
  assert.ok(sizeOfEl(name) < 66, '长名字缩一档');
  for (const line of lines) assert.ok(line.trim().split(/\s+/).length >= 2, `落单的一个词：${JSON.stringify(lines)}`);
  assert.ok(flat(allText(pg)).includes('BANDAR BARU SERI PETALING, KUALA LUMPUR'), '地点完整');
  assertLayout(pg, 'cover 长英文名');
});

test('华文版：只改了中文标题、英文没跟上 → 英文大写页眉先不印（不印和中文对不上的英文），提醒补英文；补上了照常印', () => {
  for (const key of Object.keys(ZH_EN_HEADER)) {
    for (const field of ZH_EN_HEADER[key]) {
      const pg = render(key, 'zh', { overrides: { [field]: '我们的家' } });
      assert.equal(byField(pg, `overridesEn.${field}`).length, 0, `${key}.${field}: 过期的英文页眉还在`);
      assert.ok(texts(pg).some((el) => /我们的家/.test(textOf(el))), `${key}.${field}: 中文没印`);
      const label = COMPANY_PAGES_B[key].fields[field].label;
      const w = pg.warnings.find((x) => /^改过的中文还没有对应的英文/.test(x));
      assert.ok(w && w.includes(`「${label}」`), `${key}.${field}: 没提醒补英文 ${JSON.stringify(pg.warnings)}`);
      assert.equal(fixForWarning(w, { key }).field, `overridesEn.${field}`, '一键修复跳到英文框');
      assert.ok(companyFieldsB(key, { overrides: { [field]: '我们的家' } }, project('zh')).find((f) => f.field === field).enHeader, '华文版给这一栏英文框');
      // 补上英文：照常印，不提醒
      const ok = render(key, 'zh', { overrides: { [field]: '我们的家' }, overridesEn: { [field]: key.endsWith('divider') ? 'Chapter One — Home' : 'Our Home' } });
      assert.ok(byField(ok, `overridesEn.${field}`).length > 0, `${key}.${field}: 补了英文却没印`);
      assert.ok(!ok.warnings.some((x) => /对应的英文/.test(x)), key);
    }
  }
  // 默认稿 / 没改：英文页眉照印，不提醒
  const def = render('brand-philosophy', 'zh');
  assert.ok(byField(def, 'overridesEn.title').length > 0);
  assert.deepEqual(def.warnings, []);
});

test('设计师改过的正文照原样分段（空行、落款都留着）；只有默认稿按栏宽重排', () => {
  const body = '溪岸创立于成都。\n\n好的家具，经得起时间。\n\n——溪岸';
  const bodyEn = 'SAIL began in Chengdu.\n\nGood furniture lasts.\n\n— SAIL';
  for (const [key, field] of [['brand-philosophy', 'body'], ['brand-story', 'body'], ['company-certified', 'body'], ['company-about', 'body'], ['company-showrooms', 'lead']]) {
    // 中英版的栏放不下中英各 5 行（会截短并提醒）：中英版只看字少的认证页
    for (const lang of key === 'company-certified' ? LANGS : ['zh', 'en']) {
      const pg = render(key, lang, { overrides: { [field]: body }, overridesEn: { [field]: bodyEn } });
      const zh = byField(pg, `overrides.${field}`)[0];
      const en = byField(pg, `overridesEn.${field}`)[0];
      assert.ok(!pg.warnings.some((x) => /截短/.test(x)), `${key} ${lang}: ${pg.warnings}`);
      if (lang !== 'en') {
        assert.ok(zh.paras.length >= 4, `${key} ${lang}: 中文的分段被并掉了（${zh.paras.length} 段）`);
        assert.ok(zh.paras.some((p) => p.runs.every((r) => r.text === '')), `${key} ${lang}: 空行没了`);
        assert.equal(textOf(zh).split('\n').at(-1), '——溪岸', '落款单独一行');
      }
      if (lang !== 'zh') {
        assert.ok(en.paras.length >= 4, `${key} ${lang}: 英文的分段被并掉了`);
        assert.equal(textOf(en).split('\n').at(-1), '— SAIL');
      }
    }
  }
  // 默认稿：按旧版式栏宽断的手动换行照旧重排（不留落单的词）
  const about = render('company-about', 'en');
  assert.equal(byField(about, 'overridesEn.body')[0].paras.length, 1);
});

test('品牌分开：瑞吉欧的页换上了本案的图（效果图 / 楼层图 / Material Board）→ 提醒，一键修复跳到那张照片；上传的瑞吉欧照片不提醒', () => {
  const p = project('zh');
  p.slides = [{ id: 'v1', kind: 'view', image: 'asset:render-1', floorId: null, materials: [], notes: [] }];
  p.floors = [{ id: 'f1', zh: '一楼', image: 'asset:floor-1' }];
  p.cover = { image: 'asset:board' };
  for (const key of ['company-divider', 'company-about', 'company-history', 'company-showrooms', 'company-certified']) {
    for (const src of ['asset:render-1', 'asset:floor-1', 'asset:board']) {
      const pg = render(key, 'zh', { images: { photo: src } }, { project: p });
      const w = pg.warnings.find((x) => /^瑞吉欧页面只用瑞吉欧的照片/.test(x));
      assert.ok(w, `${key} ${src}: 没提醒`);
      const label = COMPANY_PAGES_B[key].images.photo.label;
      assert.ok(w.includes(`「${label}」`));
      assert.deepEqual(fixForWarning(w, { key }), { id: 'pickImage', label: '换回瑞吉欧的照片', field: 'image.photo' });
    }
    assert.ok(!render(key, 'zh', { images: { photo: 'asset:riccione-upload' } }, { project: p }).warnings.some((x) => /瑞吉欧页面只用/.test(x)), `${key}: 上传的瑞吉欧照片不提醒`);
  }
  // 溪岸的页用本案的图不算（只管瑞吉欧的页）
  assert.ok(!render('brand-story', 'zh', { images: { photo: 'asset:render-1' } }, { project: p }).warnings.some((x) => /瑞吉欧页面只用/.test(x)));
});

test('公司章节页：English / 中英的大标题是品牌名 → 用白色 RICCIONE 商标图（不用 Ogg 排文字字标），右上角不再放小商标；华文版照旧「瑞吉欧」大字 + 右上商标', () => {
  for (const lang of LANGS) {
    const pg = render('company-divider', lang);
    const marks = pg.els.filter((e) => e.t === 'img' && /riccione-logo/.test(e.src));
    assert.equal(marks.length, 1, `${lang}: 一页只出现一次商标`);
    assert.ok(!texts(pg).some((el) => textOf(el) === 'RICCIONE' && el.name !== 'signature'), `${lang}: 不该用 Ogg 排「RICCIONE」`);
    if (lang === 'zh') {
      assert.ok(marks[0].x > 1400 && marks[0].y < 200, '华文版：右上角商标');
      assert.ok(texts(pg).some((el) => textOf(el) === '瑞吉欧'));
    } else {
      const m = marks[0];
      assert.deepEqual([m.x, m.w, m.src], [120, 520, '/template/b/riccione-logo-white.png'], `${lang}: 大标题位置的白色商标`);
      assert.equal(m.edit?.field, 'overridesEn.title', '点商标落到大标题的英文栏');
      if (lang === 'bi') {
        const zh = texts(pg).find((el) => textOf(el) === '瑞吉欧');
        assert.ok(zh && zh.y < m.y, '中英：「瑞吉欧」在上、商标在下');
      }
    }
  }
  // 设计师把英文大标题改成别的字：照常用文字排
  const custom = render('company-divider', 'en', { overridesEn: { title: 'Riccione Reka' } });
  assert.ok(texts(custom).some((el) => /RICCIONE REKA/.test(flat(textOf(el)))));
});

// ---------------------------------------------------------------------------
// 感谢信（第二页）
// ---------------------------------------------------------------------------

const LETTER_PARAS = Object.keys(COMPANY_PAGES_B.letter.fields).filter((f) => /^p\d+$/.test(f));

test('感谢信：称呼叫得出客户的名字；没填客户 = 朋友 / friend；中文客户名还没有英文 → 英文称呼 friend（不提醒），有翻译就用翻译', () => {
  const greet = (pg) => [...byField(pg, 'overrides.greeting'), ...byField(pg, 'overridesEn.greeting')].map(textOf);
  assert.deepEqual(greet(render('letter', 'zh')), ['亲爱的 Mr Lau：']);
  assert.deepEqual(greet(render('letter', 'en')), ['Dear Mr Lau,']);
  assert.deepEqual(greet(render('letter', 'bi')), ['亲爱的 Mr Lau：', 'Dear Mr Lau,']);
  const none = render('letter', 'bi', {}, { project: project('bi', { info: { client: '' } }) });
  assert.deepEqual(greet(none), ['亲爱的 朋友：', 'Dear friend,']);
  const zhName = render('letter', 'bi', {}, { project: project('bi', { info: { client: '刘先生' } }) });
  assert.deepEqual(greet(zhName), ['亲爱的 刘先生：', 'Dear friend,']);
  assert.deepEqual(zhName.warnings, []);
  const tm = render('letter', 'en', {}, { project: project('en', { info: { client: '刘先生' }, translations: { 刘先生: 'Mr Lau' } }) });
  assert.deepEqual(greet(tm), ['Dear Mr Lau,']);
  // 两行的客户名（Mr & Mrs Lau\n与家人）并成一行称呼
  const two = render('letter', 'zh', {}, { project: project('zh', { info: { client: 'Mr & Mrs Lau\nand family' } }) });
  assert.deepEqual(greet(two), ['亲爱的 Mr & Mrs Lau and family：']);
});

test('感谢信：照片贴右（820，中英版 680），字都在纸面上；一段一个元素、段距半行；中英版中文左栏、英文右栏同一高度起排', () => {
  for (const lang of LANGS) {
    const pg = render('letter', lang);
    assert.deepEqual(pg.warnings, [], lang);
    const [ph] = pg.els.filter(isPhoto);
    assert.equal(ph.x + ph.w, 1920, `${lang}: 照片贴右`);
    assert.equal(ph.w, lang === 'bi' ? LETTER_BI_PHOTO_W : 820, lang);
    for (const el of texts(pg)) assert.ok(el.x + el.w <= ph.x - 72, `${lang}: 「${textOf(el).slice(0, 12)}」离照片太近`);
    for (const side of lang === 'bi' ? ['overrides', 'overridesEn'] : [lang === 'en' ? 'overridesEn' : 'overrides']) {
      const els = LETTER_PARAS.map((f) => byField(pg, `${side}.${f}`));
      assert.ok(els.every((e) => e.length === 1), `${lang} ${side}: 一段一个元素`);
      for (let i = 1; i < els.length; i++) {
        const [a] = els[i - 1];
        const [b] = els[i];
        const lh = a.paras[0].lineHeight;
        assert.equal(Math.round(b.y - (a.y + a.h) + 2 * INSET), Math.round(lh / 2), `${lang} ${side}: 第 ${i} / ${i + 1} 段之间空半行`);
      }
    }
    if (lang === 'bi') {
      const [zh] = byField(pg, 'overrides.p1');
      const [en] = byField(pg, 'overridesEn.p1');
      assert.ok(en.x >= zh.x + zh.w, '英文栏在中文栏右边');
      assert.equal(zh.y, en.y, '两栏同一高度起排');
      const [gz] = byField(pg, 'overrides.greeting');
      const [ge] = byField(pg, 'overridesEn.greeting');
      assert.equal(gz.y, ge.y);
    }
  }
});

test('感谢信：正文太长 → 截短的那一段和后面没排的段都点名提醒（按顺序），一键修复跳到那一栏；清空一段 = 不要这一段', () => {
  // 第二段长到排不满：第二段截短（末尾「…」），第三、四段没有显示 —— 两条提醒，各自点名
  const long = '我们相信，认真把一件小事做好，就是对人最大的尊重。'.repeat(14);
  const pg = render('letter', 'zh', { overrides: { p2: long } });
  assert.ok(pg.warnings.includes('文字太长放不下：「第二段」已截短（末尾「…」）—— 请删减'), pg.warnings.join(' / '));
  assert.ok(pg.warnings.includes('文字太长放不下：「第三段」「第四段」排不下、没有显示 —— 请删减正文'), pg.warnings.join(' / '));
  assert.equal(companyFieldByLabel('letter', '第二段'), 'overrides.p2');
  assert.ok(byField(pg, 'overrides.p2')[0].paras[0].runs[0].text.endsWith('…'));
  assert.equal(byField(pg, 'overrides.p3').length + byField(pg, 'overrides.p4').length, 0);
  for (const el of pg.els) assert.ok(el.y + el.h <= 1080, '不出画布');
  // 一键修复：截短的 → 那一段；没显示的 → 第一段没显示的
  assert.deepEqual(fixForWarning('文字太长放不下：「第二段」已截短（末尾「…」）—— 请删减', { key: 'letter' }), { id: 'focus', label: '去删减', field: 'overrides.p2' });
  assert.deepEqual(fixForWarning('文字太长放不下：「第三段」「第四段」排不下、没有显示 —— 请删减正文', { key: 'letter' }), { id: 'focus', label: '去删减', field: 'overrides.p3' });
  const en = render('letter', 'en', { overridesEn: { p1: 'We listened first. '.repeat(90) } });
  assert.ok(en.warnings.some((x) => /「第一段（英文）」/.test(x)), en.warnings.join(' / '));
  // 清空第四段：不排、不提醒
  const cleared = render('letter', 'bi', { overrides: { p4: '' }, overridesEn: { p4: '' } });
  assert.deepEqual(cleared.warnings, []);
  assert.equal(byField(cleared, 'overrides.p4').length + byField(cleared, 'overridesEn.p4').length, 0);
});

test('感谢信：设计师在一段里再空一行 → 也分成两段（同一个栏位），段内的手动换行照留', () => {
  const pg = render('letter', 'zh', { overrides: { p1: '谢谢你。\n\n谢谢你的家人。\n也谢谢每一次的耐心。' } });
  const els = byField(pg, 'overrides.p1');
  assert.deepEqual(els.map(textOf), ['谢谢你。', '谢谢你的家人。\n也谢谢每一次的耐心。']);
});
