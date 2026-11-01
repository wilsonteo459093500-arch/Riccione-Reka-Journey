// C 安然 · 基础：kit 的设计系统工具（字级表、标题组、正文块、签名、logo、照片、托字渐变、半版栅格）、
// 色板、PPT 主题字体与各角色的 latin / ea 字体名、网页字体（HarmonyOS 分片、Google Fonts、Ogg 只认本机）
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import JSZip from 'jszip';
import { test } from './harness.mjs';
import * as K from '../src/engine/b/kit.js';
import { FONTS, FONT_PACK, B } from '../src/theme.js';
import { buildPptx } from '../src/engine/pptx/writer.js';
import { THEME } from '../src/engine/pptx/baseParts.js';
import { fixForWarning } from '../src/components/editor/ops.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PX = 96 / 72;
const textOf = (el) => el.paras.map((p) => p.runs.map((r) => r.text).join('')).join('\n');
const runOf = (el) => el.paras[0].runs[0];
const CJK = /[⺀-鿿豈-﫿︰-﹏＀-￯　-〿]/;

const PHIL = { zh: '朴素的美感\n自然的治愈力', en: 'Simple beauty,\nthe healing power of nature', field: 'overrides.title', fieldEn: 'overridesEn.title' };
const BODY = {
  zh: '溪岸，是创始人心中理想居所的样子。\n我们希望用能让人安静下来的设计，\n带大家回到内心深处向往的栖居地。',
  en: 'SAIL is the home our founder always imagined.\nThrough design that quiets the mind, we hope\nto lead you back to the home you long for.',
  field: 'overrides.body',
  fieldEn: 'overridesEn.body',
};

test('色板：C 安然（B 的旧键名保留，补上新键）', () => {
  assert.equal(B.paper, 'F3EEE7');
  assert.equal(B.title, '7B593D');
  assert.equal(B.body, '464646');
  assert.equal(B.table, '333333');
  assert.equal(B.cream, 'F5EFDD');
  assert.equal(B.foot, '8C7B6A');
  assert.equal(B.hair, 'C9B9A6');
  assert.equal(B.shade, '1C1915');
  for (const k of ['paper', 'ink', 'grey', 'hair', 'sample']) assert.match(B[k], /^[0-9A-F]{6}$/, k);
  assert.equal(K.B, B, 'kit 导出的 B 就是 theme 的 B');
  assert.deepEqual(K.page([]).bg, B.paper);
  assert.equal(K.page([], [], { bg: B.band }).bg, B.band, '满版照片页可以换底色');
});

test('字级表：照 notes 的规格（字体角色、pt、字距、行高）', () => {
  const S = K.SCALE;
  assert.deepEqual([S.display.font, S.display.size, S.display.spacing, S.display.caps], ['ogg', 42, 9, true]);
  assert.deepEqual([S.title.font, S.title.size, S.title.spacing], ['songSB', 36, 2]);
  assert.deepEqual([S.label.size, S.labelZh.size, S.label.lh, S.labelZh.lh], [30, 28, 48, 44]);
  assert.deepEqual([S.hero.size, S.hero.spacing, S.hero.lh], [60, 10, 116]);
  assert.deepEqual([S.body.font, S.body.size, S.bodyEn.font, S.bodyEn.size], ['hosM', 18, 'outfit', 18], '中英正文一样大');
  assert.deepEqual([S.sigZh.font, S.sigZh.size, S.sigZh.spacing, S.sigEn.font, S.sigEn.size, S.sigEn.spacing], ['hosM', 15, 7.5, 'outfitM', 12, 4.5]);
  for (const [k, st] of Object.entries(S)) {
    assert.ok(FONTS[st.font], `${k}：没有字体角色 ${st.font}`);
    assert.ok(st.size > 0 && st.lh >= st.size * PX, `${k}：行高比字小`);
    assert.match(st.color, /^[0-9A-F]{6}$/, k);
  }
  // 正文最小 24px（签名小字是 Aman 原规格，不算正文）
  for (const k of ['body', 'bodyEn', 'event', 'eventEn', 'lead', 'leadEn', 'tocNote']) assert.ok(S[k].size * PX >= 24 - 1e-9, k);
  for (const [zh, en] of Object.entries(K.EN_ROLE)) assert.ok(S[zh] && S[en], `${zh} → ${en}`);
  assert.equal(K.style('body').lang, 'zh');
  assert.equal(K.style('bodyEn').lang, 'en');
  assert.equal(K.style('body', { color: B.white, size: 22 }).color, B.white);
});

test('折行：每行都比栏窄，标点不放行首，英文按词不拆；大写标题去掉行尾逗号', () => {
  const st = K.style('body');
  const long = '溪岸，是创始人心中理想居所的样子。我们希望用能让人安静下来的设计，带大家回到内心深处向往的栖居地。Riccione Reka 全屋定制成立，成为溪岸东南亚总代理（马来西亚）。';
  for (const w of [300, 420, 760]) {
    const lines = K.wrapText(long, st, w).flat();
    assert.ok(lines.length > 1);
    for (const l of lines) {
      assert.ok(K.measure(l, st) - st.spacing * PX <= w * K.FILL + 0.01, `「${l}」超出 ${w}`);
      assert.doesNotMatch(l, /^[，。、；：！？）」]/, `行首是标点：「${l}」`);
    }
    assert.equal(lines.join('').replace(/\s/g, ''), long.replace(/\s/g, ''), '字一个不少');
  }
  const en = K.wrapText(BODY.en.replace(/\n/g, ' '), K.style('bodyEn'), 400).flat();
  for (const l of en) assert.ok(BODY.en.replace(/\n/g, ' ').includes(l), `英文词被拆开：「${l}」`);
  const caps = K.wrapText('Living naturally,\nreturning to life', K.style('heroEn'), 700);
  assert.deepEqual(caps, [['LIVING NATURALLY'], ['RETURNING TO LIFE']], '字距 6 的金句在 700 宽的纸面栏里各一行（样张结束在 1793）');
  // 中文角色里的「·」按全角宽算（PowerPoint / LibreOffice 画成全角）：浏览器刚好放得下的宽度也会折行
  const tst = K.style('title');
  const dotted = '朴素的美感 · 发展历程 · 售后维保';
  const exact = (K.measure(dotted, tst) - tst.spacing * PX) / K.FILL + 1;
  assert.equal(K.wrapText(dotted, tst, exact).flat().length, 2);
  assert.equal(K.wrapText(dotted, tst, exact + 50).flat().length, 1);
  assert.equal(K.wrapText('Living · Naturally', K.style('bodyEn'), (K.measure('Living · Naturally', K.style('bodyEn')) - 0.4 * PX) / K.FILL + 1).flat().length, 1, '英文角色不加');
  // 21,000 这种数字不拆
  assert.ok(K.wrapText('佛山 21,000 平方尺旗舰展厅', st, 140).flat().some((l) => l.includes('21,000')));
});

test('标题组：华文 = 英文大写页眉 + 中文；English = 只放英文；中英 = 英文大写 + 中文（位置照样张）', () => {
  const zh = K.titleGroup(990, 92, 820, PHIL, 'zh');
  assert.equal(zh.els.length, 2);
  assert.equal(textOf(zh.en.el), 'SIMPLE BEAUTY\nTHE HEALING POWER\nOF NATURE', '大写、去掉逗号、虚词前断行');
  assert.deepEqual([zh.en.top, zh.en.bottom, zh.zh.top, zh.zh.bottom], [92, 266, 280, 412], '样张 p5：英文 92–266，中文 280–412');
  assert.equal(runOf(zh.en.el).font, 'ogg');
  assert.equal(runOf(zh.zh.el).font, 'songSB');
  assert.equal(runOf(zh.en.el).color, B.title);
  assert.deepEqual(zh.en.el.edit, { field: 'overridesEn.title' });
  assert.deepEqual(zh.zh.el.edit, { field: 'overrides.title' });
  const en = K.titleGroup(990, 92, 820, PHIL, 'en');
  assert.equal(en.els.length, 1);
  assert.ok(!en.els.some((e) => CJK.test(textOf(e))), 'English 版没有中文');
  assert.equal(en.bottom, 266);
  const bi = K.titleGroup(990, 92, 820, PHIL, 'bi');
  assert.equal(bi.els.length, 2);
  assert.equal(bi.bottom, zh.bottom);
  // 华文版可以关掉英文页眉；English 版缺英文先放中文
  assert.equal(K.titleGroup(990, 92, 820, PHIL, 'zh', { enHeader: false }).els.length, 1);
  const noEn = K.titleGroup(990, 92, 820, { zh: '售后维保' }, 'en');
  assert.equal(textOf(noEn.els[0]), '售后维保');
  // 单行：英文行高 70，中文行顶 = 英文行顶 + 72（样张 p6 / p7：92 / 164）
  const one = K.titleGroup(112, 92, 780, { zh: '售后维保', en: 'Aftercare' }, 'zh');
  assert.deepEqual([one.en.top, one.en.bottom, one.zh.top, one.zh.bottom], [92, 162, 164, 228]);
  // 章节页：「BRAND」100 / 「第一章　品牌」152
  const ch = K.titleGroup(120, 100, 800, { zh: '第一章　品牌', en: 'Brand' }, 'zh', { size: 'chapter', color: B.white });
  assert.deepEqual([ch.en.top, ch.zh.top, runOf(ch.en.el).size, runOf(ch.zh.el).size, runOf(ch.zh.el).color], [100, 152, 30, 28, B.white]);
  // 排一行：「CONTENTS　目录」
  const inl = K.titleGroup(112, 96, 1300, { zh: '目录', en: 'Contents' }, 'zh', { inline: true });
  assert.equal(inl.els.length, 2);
  assert.ok(inl.zh.x0 >= inl.en.x1 + 39 && Math.abs(inl.zh.top - inl.en.top) <= 2);
  // 超长的英文标题：截到 3 行 + 「…」+ 提醒
  const long = K.titleGroup(990, 92, 820, { zh: '主卧', en: 'Walk-in wardrobe and dressing area of the master bedroom with a reading corner by the window' }, 'en', { label: '标题' });
  assert.equal(long.en.lines, 3);
  assert.ok(long.cut && long.en.el._cut && /…$/.test(textOf(long.en.el)));
  assert.match(long.warnings[0], /^文字太长放不下：「标题（英文）」已截短/);
});

test('正文块：按宽度折行、固定行高、返回行数和高度；太长截短 + 提醒（编辑器一键修复认得出栏位）', () => {
  const b = K.textBlock(990, 480, 820, BODY.zh, 'bodyL', { field: 'overrides.body' });
  assert.equal(b.lines, 3);
  assert.equal(b.h, 3 * 44);
  assert.equal(b.bottom, 480 + 132);
  assert.ok(b.el.nowrap, '折行在引擎里算好');
  assert.equal(b.el.paras.length, 3);
  assert.equal(b.el.paras[0].lineHeight, 44);
  assert.ok(Math.abs(b.el.x + K.INSET - 990) < 0.1 && Math.abs(b.el.y + K.INSET - 480) < 0.01, '字的左边 = x，第一行行框顶 = y');
  assert.equal(runOf(b.el).lang, 'zh');
  assert.deepEqual(b.warnings, []);
  const long = K.textBlock(990, 480, 400, BODY.zh.repeat(4), 'body', { maxLines: 4, field: 'overrides.body', label: '正文' });
  assert.equal(long.lines, 4);
  assert.ok(long.cut && long.el._cut && /…$/.test(textOf(long.el)));
  assert.deepEqual(long.warnings, [K.cutWarning('正文')]);
  assert.equal(fixForWarning(K.cutWarning('正文（英文）'), { key: 'brand-philosophy' })?.field, 'overridesEn.body');
  // 右对齐 / 居中：x 是字的右边缘 / 中心（扣掉最后一个字后面的字距）
  const r = K.textBlock(1810, 944, 600, '自然栖居 · 生活回归', 'sigZh', { align: 'r' });
  assert.ok(Math.abs(r.x1 - 1810) < 0.1 && r.x0 < 1810);
  const c = K.textBlock(960, 300, 1200, 'Mr Lau', 'coverName', { align: 'ctr' });
  assert.ok(Math.abs((c.x0 + c.x1) / 2 - 960) < 0.1);
  assert.equal(textOf(c.el), 'MR LAU');
  assert.deepEqual(K.textBlock(0, 0, 100, '  ', 'body').els, []);
});

test('中英一对：华文 / English / 中英；中英一样大、都完整；放不下从行多的那种减行并提醒', () => {
  const zh = K.pairBlock(990, 460, 760, BODY, 'zh', 'body');
  assert.deepEqual(zh.blocks.map((b) => b.lang), ['zh']);
  const en = K.pairBlock(990, 460, 760, BODY, 'en', 'body');
  assert.deepEqual(en.blocks.map((b) => b.lang), ['en']);
  assert.equal(runOf(en.els[0]).font, 'outfit');
  const bi = K.pairBlock(990, 460, 760, BODY, 'bi', 'body');
  assert.deepEqual(bi.blocks.map((b) => [b.lang, b.top, b.bottom, b.lines]), [['zh', 460, 574, 3], ['en', 596, 704, 3]], '样张 p9：中文 460、英文 596');
  assert.equal(runOf(bi.els[0]).size, runOf(bi.els[1]).size, '中英正文一样大');
  assert.deepEqual(bi.els.map((e) => e.edit.field), ['overrides.body', 'overridesEn.body']);
  assert.deepEqual(bi.warnings, []);
  // English 版缺英文：先显示中文
  const noEn = K.pairBlock(990, 460, 760, { zh: '只有中文', en: '' }, 'en', 'body');
  assert.equal(textOf(noEn.els[0]), '只有中文');
  // 放不下：英文 6 行比中文多，先减英文
  const tight = K.pairBlock(990, 460, 500, { ...BODY, en: BODY.en.repeat(2) }, 'bi', 'body', { maxBottom: 800, label: '正文' });
  assert.ok(tight.bottom <= 800);
  assert.ok(tight.cut && tight.blocks[1].cut && !tight.blocks[0].cut);
  assert.match(tight.warnings[0], /「正文（英文）」已截短/);
  // 英文在上（金句）
  const hero = K.pairBlock(1110, 360, 700, { zh: '自然栖居　生活回归', en: 'Living naturally,\nreturning to life' }, 'bi', 'heroBi', { enFirst: true, gap: 14 });
  assert.deepEqual(hero.blocks.map((b) => b.lang), ['en', 'zh']);
  assert.equal(textOf(hero.els[0]), 'LIVING NATURALLY\nRETURNING TO LIFE');
});

test('页脚签名：右下角右对齐 1810，中文 944 / 英文 982；照片上 F5EFDD，纸面上 8C7B6A；瑞吉欧用自己的签名', () => {
  const s = K.signature('sail');
  assert.deepEqual(s.els.map(textOf), ['自然栖居 · 生活回归', 'LIVING NATURALLY']);
  assert.deepEqual(s.els.map((e) => runOf(e).color), [B.foot, B.foot]);
  assert.ok(Math.abs(s.x1 - 1810) < 0.1 && s.top === 944 && s.bottom === 982 + 22);
  const r = K.signature('riccione', { onPhoto: true });
  assert.ok(!r.els.some((e) => /自然栖居|LIVING/.test(textOf(e) ?? '')), '瑞吉欧的页不出现溪岸口号');
  assert.equal(K.RICCIONE_SIGNATURE, 'text');
  assert.deepEqual(r.els.map(textOf), ['瑞吉欧', 'RICCIONE']);
  assert.deepEqual(r.els.map((e) => runOf(e).color), [B.cream, B.cream]);
  assert.equal(K.signature('sail', { enOnly: true }).els.length, 1);
  const v = K.signatureVertical(1800, 'sail');
  assert.equal(v.els[0].paras[0].runs[0].text.split('\n').length, 9, '竖排一字一行');
});

test('logo：溪岸白色 / 深色，瑞吉欧原色 / 白色 / 深色；文件在 public、尺寸和 nat 一致', () => {
  const pngSize = (src) => {
    const buf = readFileSync(path.join(ROOT, 'public', src));
    assert.equal(buf.toString('ascii', 1, 4), 'PNG', src);
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  };
  for (const [k, L] of Object.entries(K.LOGOS)) {
    assert.ok(existsSync(path.join(ROOT, 'public', L.src)), `缺 ${L.src}`);
    assert.deepEqual(pngSize(L.src), L.nat, k);
  }
  assert.equal(K.LOGOS.riccioneColor.nat.w, 2000);
  assert.equal(K.LOGOS.riccioneColor.nat.h, 359);
  const tl = K.cornerLogo('sail', { onPhoto: true, corner: 'tl' });
  assert.deepEqual([tl.el.src, tl.el.x, tl.el.y, tl.el.w], ['/template/b/logo-white.png', 112, 84, 300]);
  const tr = K.cornerLogo('sail');
  assert.deepEqual([tr.el.src, tr.el.x, tr.el.y], ['/template/b/logo-ink.png', 1510, 78]);
  assert.equal(K.cornerLogo('riccione').el.src, '/template/b/riccione-logo-color.png', '纸面上用原色');
  const rw = K.cornerLogo('riccione', { onPhoto: true });
  assert.equal(rw.el.src, '/template/b/riccione-logo-white.png', '照片上用白色');
  assert.ok(Math.abs(rw.x1 - 1810) < 0.1, '右对齐 1810');
  assert.ok(Math.abs(rw.el.h - (rw.el.w * 359) / 2000) < 0.1);
  assert.equal(K.logo('riccioneInk', 1810, 100, 200, { align: 'r' }).x, 1610);
  assert.throws(() => K.logo('nope', 0, 0, 10));
});

test('照片：沿用照片位的取景（frame），放大超过 1.15 倍提醒；没有图 = 占位 + 提醒；不加色层', () => {
  const hills = { src: '/template/b/sail-hills.jpg', nat: { w: 889, h: 1039 }, frame: { ay: 0.55 }, label: '章节照片' };
  const p = K.placePhoto(hills, 0, 0, 1022, 1080, { field: 'image.photo', name: 'photo:photo' });
  assert.equal(p.scale, 1.15);
  assert.deepEqual(p.warnings, []);
  assert.deepEqual(p.el.edit, { field: 'image.photo' });
  assert.ok(Math.abs(p.el.crop.t - 0.0527) < 1e-3 && Math.abs(p.el.crop.t + p.el.crop.b - (1 - (1080 / 1.15) / 1039)) < 1e-3);
  const low = K.placePhoto({ ...hills, frame: { zoom: 1.2 } }, 0, 0, 1022, 1080);
  assert.ok(low.scale > 1.15);
  assert.match(low.warnings[0], /^图片像素偏低：章节照片放大 1\.\d 倍会发虚/);
  const none = K.placePhoto({ src: null, label: '封面照片' }, 0, 0, 900, 1080, { field: 'image.photo' });
  assert.equal(none.el.t, 'rect');
  assert.equal(none.el.fill, B.sample);
  assert.match(none.warnings[0], /^缺照片：封面照片/);
  const unknown = K.placePhoto({ src: 'asset:x' }, 0, 0, 900, 1080);
  assert.equal(unknown.el.fit, 'cover');
});

test('托字暗渐变：1C1915、最深 45%、离字边 200px 内归零或贯穿到照片边，只在照片里，没有硬边', () => {
  const area = { x: 0, y: 0, w: 1920, h: 1080 };
  const check = (sh, ink, a) => {
    assert.ok(sh, '要有渐变');
    const { el, box } = sh;
    assert.ok(box.x >= a.x - 0.1 && box.y >= a.y - 0.1 && box.x + box.w <= a.x + a.w + 0.1 && box.y + box.h <= a.y + a.h + 0.1, '只在照片里');
    const stops = el.grad.stops;
    assert.ok(stops.every((s) => s.color === '1C1915' && s.alpha <= 0.45 + 1e-9));
    for (let i = 1; i < stops.length; i++) assert.ok(stops[i].pos >= stops[i - 1].pos, '位置递增');
    const v = el.grad.angle === 90;
    const [s0, s1] = v ? [box.y, box.y + box.h] : [box.x, box.x + box.w];
    const [e0, e1] = v ? [a.y, a.y + a.h] : [a.x, a.x + a.w];
    const [i0, i1] = v ? [ink.y0, ink.y1] : [ink.x0, ink.x1];
    // 两头：要么在照片边上（贯穿），要么透明度 0、离字边不超过 200
    if (Math.abs(s0 - e0) > 0.1) assert.ok(stops[0].alpha === 0 && i0 - s0 <= 200.1, '起点：归零且离字 ≤ 200');
    if (Math.abs(s1 - e1) > 0.1) assert.ok(stops.at(-1).alpha === 0 && s1 - i1 <= 200.1, '终点：归零且离字 ≤ 200');
    // 另一个方向贯穿照片
    if (v) assert.ok(box.x === a.x && box.w === a.w);
    else assert.ok(box.y === a.y && box.h === a.h);
    // 字下面是最深的
    assert.ok(Math.max(...stops.map((s) => s.alpha)) === sh.alpha);
  };
  // 左栏的标题组（公司章节页）：横向，左边贯穿、x 816 归零
  const ink1 = { x0: 120, y0: 100, x1: 616, y1: 772 };
  const h = K.shade(ink1, area);
  assert.equal(h.dir, 'h');
  check(h, ink1, area);
  assert.equal(h.box.x + h.box.w, 816);
  // 左上的 logo：竖向，顶部贯穿
  const ink2 = { x0: 112, y0: 84, x1: 412, y1: 198 };
  const half = { x: 0, y: 0, w: 880, h: 1080 };
  const v = K.shade(ink2, half, { alpha: 0.32 });
  assert.equal(v.dir, 'v');
  assert.equal(v.alpha, 0.32);
  check(v, ink2, half);
  // 照片中间的一行字：两头都归零
  const ink3 = { x0: 700, y0: 500, x1: 1200, y1: 560 };
  const mid = K.shade(ink3, area, { dir: 'v' });
  check(mid, ink3, area);
  assert.equal(mid.el.grad.stops[0].alpha, 0);
  assert.equal(mid.el.grad.stops.at(-1).alpha, 0);
  // 要求超过 45% 也只给 45%；字不在照片上 = 不用托
  assert.equal(K.shade(ink3, area, { alpha: 0.8 }).alpha, 0.45);
  assert.equal(K.shade(ink3, { x: 1300, y: 0, w: 620, h: 1080 }), null);
  // inkBox 合并几块
  const sig = K.signature('sail', { onPhoto: true });
  const lg = K.cornerLogo('sail', { onPhoto: true });
  const box = K.inkBox(sig, lg);
  assert.ok(box.y0 === lg.top && box.y1 === sig.bottom && box.x1 >= 1809);
});

test('对比度：托到 4.5:1 要多深（亮墙托不住就要换版式）', () => {
  assert.ok(K.contrastRatio('FFFFFF', '000000') > 20.9);
  assert.equal(K.shadeAlphaFor('333333'), 0, '本来就够暗');
  const a = K.shadeAlphaFor('8A8070');
  assert.ok(a > 0 && a < 0.45);
  assert.ok(K.contrastRatio('FFFFFF', K.mixHex('8A8070', B.shade, a)) >= 4.5);
  assert.ok(K.shadeAlphaFor('D8D4CC') > 0.45, '清水墙这么亮：45% 也托不住');
  assert.equal(K.mixHex('FFFFFF', '000000', 0.5), '808080');
});

test('半版栅格 / 满版 / 栏里的空洞', () => {
  const l = K.halfPage('left', { photoW: 880, gap: 110 });
  assert.deepEqual(l, { side: 'left', photo: { x: 0, y: 0, w: 880, h: 1080 }, col: { x: 990, w: 820, right: 1810 } });
  const r = K.halfPage('right', { photoW: 920, gap: 108 });
  assert.deepEqual(r.photo, { x: 1000, y: 0, w: 920, h: 1080 });
  assert.deepEqual(r.col, { x: 112, w: 780, right: 892 });
  assert.deepEqual(K.fullBleed(), { x: 0, y: 0, w: 1920, h: 1080 });
  assert.ok(K.HALF.min === 820 && K.HALF.max === 1050);
  assert.deepEqual(K.maxGap([{ top: 92, bottom: 412 }, { top: 480, bottom: 612 }, { y: 714, h: 52 }], 92, 944), { gap: 178, from: 766, to: 944 });
  const rl = K.rule(1112, 646, 180);
  assert.deepEqual([rl.fill, rl.alpha, rl.h], [B.title, 0.6, 1.5]);
});

test('PPT：主题字体 = C 安然；各角色写出正确的 latin / ea 字体名', async () => {
  assert.match(THEME, /<a:majorFont><a:latin typeface="Ogg"\/><a:ea typeface="思源宋体 CN SemiBold"\/>/);
  assert.match(THEME, /<a:minorFont><a:latin typeface="Outfit"\/><a:ea typeface="HarmonyOS Sans SC Medium"\/>/);
  assert.match(THEME, /<a:dk1><a:srgbClr val="464646"\/><\/a:dk1>/);
  const roles = ['songM', 'songSB', 'ogg', 'oggM', 'hosM', 'hos', 'outfitL', 'outfit', 'outfitM'];
  const els = roles.map((font, i) => ({ t: 'text', x: 100, y: 40 + i * 100, w: 1200, h: 80, nowrap: true, paras: [{ lineHeight: 60, runs: [{ text: `${font} 品牌 Brand`, font, size: 24, color: '464646', spacing: 1 }] }] }));
  const t = K.titleGroup(990, 92, 820, PHIL, 'bi');
  const { file } = await buildPptx([{ bg: B.paper, els: [...els, ...t.els, ...K.signature('sail').els] }], { loadImage: async () => null, type: 'uint8array' });
  const zip = await JSZip.loadAsync(file);
  const xml = await zip.file('ppt/slides/slide1.xml').async('string');
  const want = {
    songM: ['思源宋体 CN Medium', '思源宋体 CN Medium'],
    songSB: ['思源宋体 CN SemiBold', '思源宋体 CN SemiBold'],
    ogg: ['Ogg', '思源宋体 CN Medium'],
    oggM: ['Ogg Medium', '思源宋体 CN Medium'],
    hosM: ['HarmonyOS Sans SC Medium', 'HarmonyOS Sans SC Medium'],
    hos: ['HarmonyOS Sans SC', 'HarmonyOS Sans SC'],
    outfitL: ['Outfit Light', 'HarmonyOS Sans SC Medium'],
    outfit: ['Outfit', 'HarmonyOS Sans SC Medium'],
    outfitM: ['Outfit Medium', 'HarmonyOS Sans SC Medium'],
  };
  for (const [font, [latin, ea]] of Object.entries(want)) {
    assert.equal(FONTS[font].latin, latin);
    assert.equal(FONTS[font].ea, ea);
    const re = new RegExp(`<a:latin typeface="${latin}" [^>]*/><a:ea typeface="${ea}" [^>]*/>[^]*?<a:t>${font} 品牌 Brand</a:t>`);
    assert.match(xml, re, font);
  }
  // 标题组：英文大写 Ogg、中文思源宋体 SemiBold；固定行高；不自动换行（行已经折好）
  assert.match(xml, /<a:latin typeface="Ogg" [^>]*\/>[^]*?<a:t>SIMPLE BEAUTY<\/a:t>/);
  assert.match(xml, /<a:ea typeface="思源宋体 CN SemiBold" [^>]*\/>[^]*?<a:t>朴素的美感<\/a:t>/);
  assert.match(xml, /<a:bodyPr wrap="none"/);
  assert.match(xml, /<a:spcPts val="4350"\/>/, '英文 3 行行高 58px = 43.5pt');
  assert.match(xml, /<a:br>/, '折好的行写成段内换行');
});

test('网页字体：HarmonyOS 不托管（授权不允许修改字体，切片 / woff2 都算）、只认本机；Google Fonts 有思源宋体 / Cormorant / Outfit / Noto Sans SC；Ogg 只认本机、不进网站', () => {
  // public 里没有任何字体文件：HarmonyOS 的切片 / woff2、原始 TTF / OTF、付费的 Ogg 都不进网站
  const walk = (d) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
  const files = walk(path.join(ROOT, 'public')).filter((f) => !f.includes(`${path.sep}pdfjs${path.sep}`)); // PDF.js 自带的标准字体（导入 PDF 用）不算
  assert.ok(!files.some((f) => /\.(ttf|otf|woff2?)$/i.test(f)), `public 里不放字体文件：${files.filter((f) => /\.(ttf|otf|woff2?)$/i.test(f)).join(', ')}`);
  assert.ok(!existsSync(path.join(ROOT, 'public/fonts/harmonyos')), '不托管 HarmonyOS（华为授权只允许再分发未修改的字体）');
  // CSS 栈：HarmonyOS 只认本机安装的，没装落到 Noto Sans SC（同字重）
  assert.match(FONTS.ogg.css, /^'Ogg','Ogg Local','Cormorant Garamond',/);
  assert.match(FONTS.oggM.css, /^'Ogg','Ogg Local','Cormorant Garamond',/);
  assert.match(FONTS.songSB.css, /^'Source Han Serif CN','Noto Serif SC',/);
  for (const r of ['hosL', 'hos', 'hosM']) assert.match(FONTS[r].css, /^'HarmonyOS Sans SC','Noto Sans SC',/, r);
  assert.doesNotMatch(Object.values(FONTS).map((f) => f.css).join(' '), /HarmonyOS Sans SC Web/);
  assert.match(FONTS.outfit.css, /^'Outfit',/);
  const indexCss = readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');
  assert.match(indexCss, /font-family: 'Ogg Local';[^}]*src: local\('Ogg Roman'\)/);
  assert.doesNotMatch(indexCss, /url\([^)]*ogg/i, 'Ogg 只用 local()');
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const g = /href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/.exec(html)[1];
  assert.match(g, /family=Noto\+Serif\+SC:wght@[\d;]*500;600/);
  assert.match(g, /family=Cormorant\+Garamond:wght@400;500/);
  assert.match(g, /family=Outfit:wght@300;400;500/);
  assert.match(g, /family=Noto\+Sans\+SC:wght@[\d;]*500/);
  assert.doesNotMatch(html, /fonts\/harmonyos/);
  // 导出对话框列出的字体：Ogg 标明是公司买的桌面授权；HarmonyOS 注明授权
  assert.deepEqual(FONT_PACK.map((f) => f.name.split(/[ （]/)[0]), ['思源宋体', 'HarmonyOS', 'Outfit', 'Ogg']);
  assert.match(FONT_PACK.find((f) => f.paid).note, /公司购买的桌面授权/);
  assert.match(FONT_PACK.find((f) => /HarmonyOS/.test(f.name)).note, /HarmonyOS Sans Fonts License/);
  // PPT 里每个 C 角色的中文字体（ea）都在 FONT_PACK 列出的字重里：设计师照清单装好，PPT 里没有被替换的字
  const listed = ['思源宋体 CN Medium', '思源宋体 CN SemiBold', 'HarmonyOS Sans SC Medium', 'Ogg', 'Ogg Medium', 'Outfit Light', 'Outfit', 'Outfit Medium'];
  for (const r of ['songM', 'songSB', 'ogg', 'oggM', 'hosM', 'outfitL', 'outfit', 'outfitM']) {
    assert.ok(listed.includes(FONTS[r].ea), `${r} 的 ea 字体 ${FONTS[r].ea} 不在字体清单里`);
    assert.ok(listed.includes(FONTS[r].latin), `${r} 的 latin 字体 ${FONTS[r].latin} 不在字体清单里`);
  }
});

test('titleGroup：中文栏里写的就是英文（Overview / Taj Room）—— 三种语言里同一个词只印一次（英文大写那一块，字段用中文栏）', () => {
  for (const lang of ['zh', 'en', 'bi']) {
    for (const [zh, en] of [['Overview', 'Overview'], ['Taj Room', 'TAJ ROOM'], ['Ground Floor', 'Ground floor ']]) {
      const g = K.titleGroup(112, 92, 1300, { zh, en, field: 'title', fieldEn: 'subtitleEn' }, lang);
      const all = g.els.map(textOf);
      assert.equal(all.length, 1, `${lang} ${zh}: ${JSON.stringify(all)}`);
      assert.equal(all[0], zh.toUpperCase());
      // 华文 / 中英：这一块就是中文栏写的字 → 点它落到中文栏；English 版只排英文那一栏
      assert.equal(g.els[0].edit.field, lang === 'en' ? 'subtitleEn' : 'title');
    }
    // 真的不同的英文（中文是汉字）照常两块
    assert.equal(K.titleGroup(112, 92, 1300, { zh: '全景', en: 'Overview' }, lang).els.length, lang === 'en' ? 1 : 2);
  }
});

test('折行：英文段落的末行不只剩一个词（把上一行的最后一个词带下来）；中文、两个词的行不动', () => {
  const st = K.style('eventEn');
  const text = 'Riccione Furniture is founded in Malaysia as a solid-wood brand';
  for (const w of [520, 560, 600, 640, 680, 720]) {
    const lines = K.wrapText(text, st, w).flat();
    if (lines.length > 1) assert.ok(/\s/.test(lines.at(-1)), `${w}: 末行只剩一个词「${lines.at(-1)}」`);
    for (const l of lines) assert.ok(K.measure(l, st) - st.spacing * PX <= w * K.FILL + 0.5, `${w}: 「${l}」出栏`);
  }
  // 末行只有一个词、上一行不到 3 个词：不动（挪了上一行就只剩一个词）
  assert.deepEqual(K.wrapText('Expands into projects', st, K.measure('Expands into', st) + 4).flat(), ['Expands into', 'projects']);
});

test('折行：中文和英文 / 数字交界处（PowerPoint、LibreOffice 会自动加空）按 0.25em 预留，PPT 里不出栏', () => {
  assert.equal(K.scriptSwitches('吉隆坡 11,000 平方尺'), 2);
  assert.equal(K.scriptSwitches('吊柜底部嵌 LED 灯带'), 2);
  assert.equal(K.scriptSwitches('全中文的一句话'), 0);
  const st = K.style('body');
  const t = '吉隆坡 11,000 平方尺国际工程展厅落成';
  const plain = K.measure(t, st) - st.spacing * PX;
  // 栏宽刚好放得下「不留余量」的宽：要折行（留了两处交界的空）
  const w = (plain + 2) / K.FILL;
  assert.equal(K.wrapText(t, st, w).flat().length, 2);
  assert.equal(K.wrapText(t, st, (plain + 2 * 0.25 * 18 * PX + 2) / K.FILL).flat().length, 1);
});
