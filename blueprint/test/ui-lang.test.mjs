// 编辑器「提案语言」界面的纯函数（src/lib/langUi.js）：语言选项、AI 翻译对话框的行、导出体检的缺英文汇总
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import { newProject } from '../src/engine/model.js';
import { renderDeck, exportableSlides } from '../src/engine/deck.js';
import { missingInPages, addTranslations, missWarning, langOf, hasCJKText, setTranslation, memoryEn } from '../src/engine/lang.js';
import { pptxFileName } from '../src/lib/format.js';
import { setLang, fixForWarning } from '../src/components/editor/ops.js';
import {
  LANG_OPTIONS, LANG_HINTS, LANG_VERSION, needsEnglish, normLang, KIND_LABELS, kindLabel, translateRows, rowStatus, pendingItems,
  fillRows, editRow, applicablePairs, isLongRow, translateContext, translateResultText, roomEnState, exportHealth, missingEnText,
  missingEnHint, langNameInline, tidyEn, unfinishedKeys, sliceItems, enterAction, isKeyError, enDraftValue, viewTitlePreview,
  isLatinSource, toolbarCompactWidth, exportInfo, pptxTitle, materialsMissText,
} from '../src/lib/langUi.js';

// ---------------------------------------------------------------------------
// 夹具：一个小项目（诗意材料名、整句备注 —— 词典翻不了，会缺英文）
// ---------------------------------------------------------------------------

function smallProject(lang = 'en') {
  const p = newProject({ name: 'Muar · Mr Lau', info: { client: 'Mr Lau', location: 'Muar', date: '2026 · 08', lang } });
  p.floors = [{ id: 'f1', zh: '一楼', en: 'GROUND FLOOR', image: null }];
  p.materials = [
    { id: 'm1', name: '浅川橡', code: 'AG273', image: null },
    { id: 'm2', name: '云峰洞石', code: 'AG318', image: null },
  ];
  const view = (id, room, roomEn, subtitle, materials, notes, extra = {}) => ({
    id, kind: 'view', enabled: true, floorId: 'f1', layout: 'framed', image: null, room, roomEn, subtitle, materials, notes, ...extra,
  });
  p.slides = [
    { id: 's-mats', kind: 'materials', enabled: true },
    { id: 's-f1', kind: 'floor', floorId: 'f1', enabled: true },
    view('v1', '客厅', 'Living Area', '全景', [{ role: '柜体', materialId: 'm1' }], [{ label: '说明', text: '液压闭门器，配反弹器' }]),
    view('v2', '餐厅', 'Dining', '面向花园', [{ role: '台面', materialId: 'm2' }], []),
    // 隐藏页上的缺英文不算（不导出）
    view('v3', '茶室', 'Tea Room', '月下听雨', [], [], { enabled: false }),
    { id: 's-team', kind: 'team', enabled: true },
  ];
  p.info.team = [{ en: 'DESIGN', name: 'Sheerly', role: '方案设计师' }];
  return p;
}

// ---------------------------------------------------------------------------
// 语言选项
// ---------------------------------------------------------------------------

test('LANG_OPTIONS：华文 / English / 中英，悬停说明来自 LANG_HINTS；中英版说的是「中英并重」而不是「中文为主」', () => {
  assert.deepEqual(LANG_OPTIONS.map((o) => [o.value, o.label]), [['zh', '华文'], ['en', 'English'], ['bi', '中英']]);
  for (const o of LANG_OPTIONS) assert.ok(o.title.includes(LANG_HINTS[o.value]), o.value);
  assert.match(LANG_HINTS.bi, /中英并重/);
  assert.match(LANG_HINTS.bi, /同样大小/);
  assert.doesNotMatch(LANG_HINTS.bi, /为主/);
  assert.equal(LANG_VERSION.en, 'English 版');
  assert.equal(LANG_VERSION.bi, '中英版');
});

test('langNameInline：夹在中文句子里的语言名，English 前后留空格', () => {
  assert.equal(`提案本身仍是${langNameInline('en').trimEnd()}`, '提案本身仍是 English');
  assert.equal(`提案本身仍是${langNameInline('bi').trimEnd()}`, '提案本身仍是中英');
  assert.equal(langNameInline(undefined), '华文');
});

test('needsEnglish / normLang：只有 English、中英版要英文栏；旧项目（没有 lang）= 华文', () => {
  assert.equal(needsEnglish('zh'), false);
  assert.equal(needsEnglish(undefined), false);
  assert.equal(needsEnglish('fr'), false);
  assert.equal(needsEnglish('en'), true);
  assert.equal(needsEnglish('bi'), true);
  assert.equal(normLang(''), 'zh');
  assert.equal(normLang('bi'), 'bi');
});

test('切换语言（顶栏 / 项目信息共用 setLang）：只改 info.lang，其它不动；不认识的值落回华文', () => {
  const p = smallProject('zh');
  const en = setLang(p, 'en');
  assert.equal(langOf(en), 'en');
  assert.equal(en.slides, p.slides);
  assert.equal(en.materials, p.materials);
  assert.equal(langOf(setLang(en, 'xx')), 'zh');
});

// ---------------------------------------------------------------------------
// AI 翻译对话框的行
// ---------------------------------------------------------------------------

test('kindLabel：八类小标签；不认识的类别算「文字」', () => {
  assert.deepEqual(
    ['room', 'view', 'role', 'label', 'note', 'material', 'team', 'text'].map(kindLabel),
    ['空间', '视角', '部位', '标签', '备注', '材料', '职位', '文字']
  );
  assert.equal(kindLabel('whatever'), '文字');
  assert.equal(Object.keys(KIND_LABELS).length, 8);
});

test('translateRows：去重（中点 / 空格写法不同也算同一句）、同类排在一起、同类内保持出现顺序、英文先空着', () => {
  const rows = translateRows([
    { zh: '落地窗把花园的光带进来', kind: 'note' },
    { zh: '浅川橡', kind: 'material' },
    { zh: '客厅·全景', kind: 'view' },
    { zh: '归雁胡桃', kind: 'material' },
    { zh: '客厅 · 全景', kind: 'view' },
    { zh: '', kind: 'note' },
    { zh: '  ', kind: 'note' },
    { zh: '一段文字', kind: 'mystery' },
    { zh: 'KTV 娱乐室', kind: 'room' },
  ]);
  assert.deepEqual(
    rows.map((r) => [r.kind, r.zh]),
    [
      ['room', 'KTV 娱乐室'],
      ['view', '客厅 · 全景'],
      ['material', '浅川橡'],
      ['material', '归雁胡桃'],
      ['note', '落地窗把花园的光带进来'],
      ['text', '一段文字'],
    ]
  );
  assert.ok(rows.every((r) => r.en === '' && r.source === ''));
  assert.deepEqual(translateRows(null), []);
});

test('rowStatus：空 / 可套用 / 英文里还夹着中文', () => {
  assert.equal(rowStatus(''), 'empty');
  assert.equal(rowStatus('   '), 'empty');
  assert.equal(rowStatus(undefined), 'empty');
  assert.equal(rowStatus('Light Oak'), 'ok');
  assert.equal(rowStatus("Bird's-Eye View · 20 mm"), 'ok');
  assert.equal(rowStatus('浅川橡 Light Oak'), 'cjk');
  assert.equal(rowStatus('Oak，light'), 'cjk'); // 全角标点也算中文
});

test('fillRows：AI 结果只填空着的行（设计师写的不覆盖），标成 AI；按规范后的中文对上；没填任何行时原样返回', () => {
  let rows = translateRows([
    { zh: '浅川橡', kind: 'material' },
    { zh: '云峰洞石', kind: 'material' },
    { zh: '客厅 · 全景', kind: 'view' },
  ]);
  rows = editRow(rows, '云峰洞石', 'Travertine (mine)');
  const { rows: next, filled } = fillRows(rows, [
    { zh: '浅川橡', en: ' Light Oak ' },
    { zh: '云峰洞石', en: 'Cloud Peak Travertine' }, // 已经手写了：不覆盖
    { zh: '客厅·全景', en: 'Overview' }, // 写法不同也对得上
    { zh: '没有这一条', en: 'Nope' },
    { zh: '浅川橡', en: '' },
  ]);
  assert.equal(filled, 2);
  const by = Object.fromEntries(next.map((r) => [r.zh, r]));
  assert.equal(by['浅川橡'].en, 'Light Oak');
  assert.equal(by['浅川橡'].source, 'ai');
  assert.equal(by['云峰洞石'].en, 'Travertine (mine)');
  assert.equal(by['云峰洞石'].source, 'user');
  assert.equal(by['客厅 · 全景'].en, 'Overview');
  const same = fillRows(next, [{ zh: '浅川橡', en: 'Other' }]);
  assert.equal(same.filled, 0);
  assert.equal(same.rows, next);
});

test('pendingItems / applicablePairs：AI 只翻空行；「套用 N 条」只要非空、不含中文的行（去掉首尾空格）', () => {
  let rows = translateRows([
    { zh: '浅川橡', kind: 'material' },
    { zh: '云峰洞石', kind: 'material' },
    { zh: '面向花园', kind: 'view' },
    { zh: '液压闭门器，配反弹器', kind: 'note' },
  ]);
  rows = editRow(rows, '浅川橡', '  Light Oak  ');
  rows = editRow(rows, '面向花园', '面向 garden');
  rows = editRow(rows, '液压闭门器，配反弹器', '   ');
  assert.deepEqual(pendingItems(rows), [
    { zh: '云峰洞石', kind: 'material' },
    { zh: '液压闭门器，配反弹器', kind: 'note' },
  ]);
  assert.deepEqual(applicablePairs(rows), [{ zh: '浅川橡', en: 'Light Oak' }]);
  assert.deepEqual(applicablePairs([]), []);
});

test('isLongRow：整句备注、长中文用多行框；短词（包括短的「文字」）用单行框', () => {
  assert.equal(isLongRow({ zh: '液压闭门器', kind: 'note' }), true);
  assert.equal(isLongRow({ zh: '全屋定制设计方案', kind: 'text' }), false);
  assert.equal(isLongRow({ zh: '刘府', kind: 'text' }), false);
  assert.equal(isLongRow({ zh: '浅川橡', kind: 'material' }), false);
  assert.equal(isLongRow({ zh: '一二三四五六七八九十一二三四五六七', kind: 'view' }), true);
  assert.equal(isLongRow({ zh: '溪岸为这个家准备的一份全屋定制设计方案说明', kind: 'text' }), true);
});

test('translateContext：给 AI 的项目背景（地点 · 客户 · 方案标题）；没有客户信息时用项目名', () => {
  assert.equal(translateContext(smallProject()), 'Muar · Mr Lau · 全屋定制设计方案');
  const bare = newProject({ name: '溪岸样板间', info: { proposalTitle: '' } });
  assert.equal(translateContext(bare), '溪岸样板间 · 全屋定制设计方案');
});

test('translateResultText：填好几条 / 还空几条 / 停止 / 一条都没翻出来', () => {
  assert.match(translateResultText({ filled: 5, left: 0 }), /^翻译完成：填好了 5 条/);
  assert.match(translateResultText({ filled: 5, left: 2 }), /还有 2 条空着（没翻出来）/);
  assert.match(translateResultText({ filled: 3, left: 4, stopped: true }), /^已停止：填好了 3 条.*还有 4 条空着，/);
  assert.match(translateResultText({ filled: 0, left: 6 }), /这 6 条没拿到可用的英文/);
  assert.equal(translateResultText({ filled: 0, left: 6, stopped: true }), '已停止，还没有翻好的条目');
});

test('整套流程：English 版缺英文 → 对话框的行 → AI 填 + 手改 → 套用 → 重新渲染后这些都不缺了（隐藏页不算）', () => {
  const p = smallProject('en');
  const pages = renderDeck(p);
  const missing = missingInPages(pages);
  const zhs = missing.map((m) => m.zh);
  assert.ok(zhs.includes('浅川橡') && zhs.includes('云峰洞石') && zhs.includes('液压闭门器，配反弹器') && zhs.includes('面向花园'), zhs.join('|'));
  assert.ok(!zhs.includes('月下听雨'), '隐藏页上的不算');

  // 缺英文的提醒 → 一键「AI 翻译」
  const warn = pages.find((pg) => pg.missing?.length).warnings.at(-1);
  assert.equal(warn, missWarning('en', pages.find((pg) => pg.missing?.length).missing));
  assert.equal(fixForWarning(warn)?.id, 'translate');

  let rows = translateRows(missing);
  const ai = rows.map((r) => ({ zh: r.zh, en: `EN ${rows.indexOf(r) + 1}` }));
  rows = editRow(rows, '浅川橡', 'Light Oak');
  rows = fillRows(rows, ai).rows;
  const pairs = applicablePairs(rows);
  assert.equal(pairs.length, missing.length);
  assert.equal(pairs.find((x) => x.zh === '浅川橡').en, 'Light Oak');

  const next = addTranslations(p, pairs);
  assert.notEqual(next, p);
  assert.equal(next.translations['浅川橡'], 'Light Oak');
  const after = renderDeck(next);
  assert.deepEqual(missingInPages(after), []);
  assert.ok(exportableSlides(after).every((pg) => !(pg.warnings || []).some((w) => /还没有英文/.test(w))));
  // 隐藏页（不导出）自己的提醒还在：打开它时照样看得到
  assert.ok(after.find((pg) => pg.slideId === 'v3').warnings.some((w) => /月下听雨/.test(w)));
});

test('隐藏页上的「AI 翻译」：整套统计（只算导出的页）+ 这一页自己缺的，合在一起去重', () => {
  const pages = renderDeck(smallProject('en'));
  const deck = missingInPages(pages);
  const hidden = pages.find((pg) => pg.slideId === 'v3');
  assert.equal(hidden.enabled, false);
  assert.ok(hidden.missing.some((m) => m.zh === '月下听雨'));
  assert.ok(!deck.some((m) => m.zh === '月下听雨'));
  const rows = translateRows([...deck, ...hidden.missing]);
  assert.ok(rows.some((r) => r.zh === '月下听雨' && r.kind === 'view'));
  assert.equal(new Set(rows.map((r) => r.zh)).size, rows.length);
  assert.equal(rows.length, deck.length + hidden.missing.filter((m) => !deck.some((d) => d.zh === m.zh)).length);
});

test('华文版：没有缺英文，也没有「AI 翻译」提醒', () => {
  const pages = renderDeck(smallProject('zh'));
  assert.deepEqual(missingInPages(pages), []);
  assert.ok(pages.every((pg) => !(pg.warnings || []).some((w) => fixForWarning(w)?.id === 'translate')));
});

// ---------------------------------------------------------------------------
// 检查器：空间英文名
// ---------------------------------------------------------------------------

test('roomEnState：这一页填了 = field；没填 → 翻译记忆 / 词典（自动）/ 缺英文；auto = 不填时用的英文', () => {
  const p = smallProject('en');
  const v = (room, roomEn = '') => ({ kind: 'view', room, roomEn });
  const auto = roomEnState(p, v('客厅'));
  assert.equal(auto.source, 'glossary');
  assert.ok(auto.auto && !hasCJKText(auto.auto), auto.auto);
  // 填了这一页的空间英文名：来源是 field，占位字仍是词典的英文（清空后会用它）
  assert.deepEqual(roomEnState(p, v('客厅', 'Lounge')), { source: 'field', auto: auto.auto });
  assert.deepEqual(roomEnState(p, v('观星阁')), { source: 'missing', auto: '' });
  const withMemory = addTranslations(p, [{ zh: '观星阁', en: 'Stargazing Loft' }]);
  assert.deepEqual(roomEnState(withMemory, v('观星阁')), { source: 'memory', auto: 'Stargazing Loft' });
  assert.equal(roomEnState(p, v('')).source, 'empty');
  assert.equal(roomEnState(p, v('KTV')).source, 'latin');
});

// ---------------------------------------------------------------------------
// 导出体检
// ---------------------------------------------------------------------------

test('exportHealth：缺英文汇总成一条（几处、几页、第一页），不在逐页提醒里重复；其它提醒和找不到的图照常逐页列出', () => {
  const p = smallProject('en');
  const slides = exportableSlides(renderDeck(p));
  const { issues, missing } = exportHealth(slides, { missingImages: (s) => (s.slideId === 'v2' ? 2 : 0) });
  assert.ok(missing);
  assert.equal(missing.count, missingInPages(slides).length);
  assert.equal(missing.pages, slides.filter((s) => s.missing?.length).length);
  assert.equal(missing.firstSlideId, slides.find((s) => s.missing?.length).slideId);
  for (const it of issues) for (const m of it.msgs) assert.doesNotMatch(m, /还没有英文/);
  const v2 = issues.find((it) => it.slideId === 'v2');
  assert.ok(v2.msgs.includes('2 张图片在本机找不到'));
  // 页码 = 导出后的页码（隐藏页已经被 exportableSlides 去掉）
  assert.equal(v2.page, slides.findIndex((s) => s.slideId === 'v2') + 1);

  const zh = exportHealth(exportableSlides(renderDeck(smallProject('zh'))));
  assert.equal(zh.missing, null);
});

test('导出另选语言：只换渲染用的 info.lang，项目本身不动；文件名带上语言；体检跟着选的语言走', () => {
  const p = smallProject('zh');
  const before = JSON.stringify(p);
  const target = { ...p, info: { ...p.info, lang: 'en' } };
  const health = exportHealth(exportableSlides(renderDeck(target)));
  assert.ok(health.missing && health.missing.count > 0);
  assert.equal(JSON.stringify(p), before);
  assert.equal(langOf(p), 'zh');
  assert.match(pptxFileName(p, 'en'), /\(EN\)\.pptx$/);
  assert.match(pptxFileName(p, 'bi'), /\(中英\)\.pptx$/);
  assert.doesNotMatch(pptxFileName(p, 'zh'), /\(/);
});

test('missingEnText / missingEnHint：导出后 English 版「会显示中文」（不是「先」）、中英版「只显示中文」；语言和提案不同时先提示切换', () => {
  assert.match(missingEnText('en', 7), /^English 版还有 7 处.*导出后这些地方会显示中文$/);
  assert.doesNotMatch(missingEnText('en', 7), /先显示/);
  assert.match(missingEnText('bi', 3), /^中英版还有 3 处.*只显示中文/);
  assert.match(missingEnHint('en', 'en', 7), /AI 翻译 · 7/);
  assert.doesNotMatch(missingEnHint('en', 'en', 7), /右侧/); // 窄屏时检查器不在右边
  assert.match(missingEnHint('en', 'zh', 7), /切到「English」/);
  assert.match(missingEnHint('bi', 'en', 2), /切到「中英」/);
});

// ---------------------------------------------------------------------------
// EN 框：打字时空格不被吃掉（翻译记忆存的是去掉首尾空格的英文）
// ---------------------------------------------------------------------------

test('enDraftValue：一个键一个键地打「Light Oak」—— 每一步框里显示的都是打的原文（词尾空格留着），记忆里存的是整理过的', () => {
  let p = smallProject('en');
  const key = '浅川橡';
  let draft = null;
  let shown = enDraftValue(draft, key, memoryEn(p, key));
  assert.equal(shown, '');
  for (const ch of 'Light Oak') {
    const text = shown + ch; // 浏览器里：框里现在的值 + 新打的字
    draft = { key, text };
    p = setTranslation(p, key, text);
    shown = enDraftValue(draft, key, memoryEn(p, key));
    assert.equal(shown, text);
    // 旧做法（直接用记忆里的值）在空格那一步会把空格吃掉
    if (ch === ' ') assert.equal(memoryEn(p, key), 'Light');
  }
  assert.equal(p.translations[key], 'Light Oak');
  // 离开输入框（draft 清掉）：显示记忆里的
  assert.equal(enDraftValue(null, key, memoryEn(p, key)), 'Light Oak');
});

test('enDraftValue：撤销 / 别处改了英文 / 换了一句中文 → 不再用打的原文；弯引号、首尾空格不算不一致', () => {
  assert.equal(enDraftValue({ key: '浅川橡', text: 'Light Oak ' }, '浅川橡', ''), ''); // 撤销后记忆里没有了
  assert.equal(enDraftValue({ key: '浅川橡', text: 'Light Oak ' }, '浅川橡', 'Pale Oak'), 'Pale Oak'); // 别处改了
  assert.equal(enDraftValue({ key: '浅川橡', text: 'Light ' }, '云峰洞石', 'Travertine'), 'Travertine'); // 换了一句中文
  assert.equal(enDraftValue({ key: '刘府', text: '  Lau’s Home ' }, '刘府', "Lau's Home"), '  Lau’s Home ');
  assert.equal(enDraftValue({ key: '刘府', text: '   ' }, '刘府', ''), '   ');
});

// ---------------------------------------------------------------------------
// AI 翻译对话框：套用前整理、分批、回车、只看没填好的
// ---------------------------------------------------------------------------

test('tidyEn / applicablePairs：短词里的换行和连续空格并成一个空格；备注保留换行，只收拾多余空格和空行', () => {
  assert.equal(tidyEn('Italian Fish Belly\n White  Sintered Stone ', 'material'), 'Italian Fish Belly White Sintered Stone');
  assert.equal(tidyEn('  Open to\tthe Garden ', 'view'), 'Open to the Garden');
  assert.equal(tidyEn('First line  \n  second   line\n\n\n\nthird', 'note'), 'First line\nsecond line\n\nthird');
  const rows = editRow(editRow(translateRows([{ zh: '意大利进口鱼肚白岩板（哑光面，15 毫米）', kind: 'material' }, { zh: '液压闭门器，配反弹器', kind: 'note' }]), '意大利进口鱼肚白岩板（哑光面，15 毫米）', 'Italian Stone\nMatt'), '液压闭门器，配反弹器', 'Hydraulic closer\nwith rebound');
  assert.deepEqual(applicablePairs(rows), [
    { zh: '意大利进口鱼肚白岩板（哑光面，15 毫米）', en: 'Italian Stone Matt' },
    { zh: '液压闭门器，配反弹器', en: 'Hydraulic closer\nwith rebound' },
  ]);
});

test('unfinishedKeys：空着的、英文里夹着中文的都算没填好（「只看没填好的」）', () => {
  let rows = translateRows([{ zh: '浅川橡', kind: 'material' }, { zh: '云峰洞石', kind: 'material' }, { zh: '面向花园', kind: 'view' }]);
  rows = editRow(rows, '浅川橡', 'Light Oak');
  rows = editRow(rows, '面向花园', '面向 garden');
  // 行按类别排：视角在材料前面
  assert.deepEqual(unfinishedKeys(rows), ['面向花园', '云峰洞石']);
  assert.deepEqual(unfinishedKeys([]), []);
});

test('sliceItems：AI 翻译一批一批跑（每批回来就填上，停止时不用等整套）', () => {
  const items = Array.from({ length: 90 }, (_, i) => ({ zh: `第${i}条`, kind: 'text' }));
  const slices = sliceItems(items, 40);
  assert.deepEqual(slices.map((s) => s.length), [40, 40, 10]);
  assert.equal(slices.flat().length, 90);
  assert.equal(slices[1][0].zh, '第40条');
  assert.deepEqual(sliceItems([], 40), []);
  assert.deepEqual(sliceItems(items.slice(0, 3), 0).map((s) => s.length), [1, 1, 1]);
});

test('enterAction：回车 = 下一条；只有备注可以 Shift+回车 换行；短词里的 Shift+回车 不换行也不跳走', () => {
  assert.equal(enterAction('material', false), 'next');
  assert.equal(enterAction('note', false), 'next');
  assert.equal(enterAction('note', true), 'newline');
  assert.equal(enterAction('material', true), 'none');
  assert.equal(enterAction('view', true), 'none');
});

test('isKeyError：key 没配 / 无效时后面的批次不用再跑', () => {
  assert.equal(isKeyError('API key 无效，请到设置里检查。'), true);
  assert.equal(isKeyError('Request failed: 403'), true);
  assert.equal(isKeyError('模型没有返回内容，请重试。'), false);
  assert.equal(isKeyError(undefined), false);
});

// ---------------------------------------------------------------------------
// 检查器：页面标题预览、本来就是英文的字
// ---------------------------------------------------------------------------

test('viewTitlePreview：华文 = 中文标题；English = 英文（缺的那一半先用中文，和页面一样）；中英 = 中文 + 已有的英文', () => {
  const v = { kind: 'view', room: '餐厅', roomEn: 'Dining', subtitle: '面向花园' };
  assert.deepEqual(viewTitlePreview(smallProject('zh'), v), { lang: 'zh', zh: '餐厅 · 面向花园', en: '' });
  assert.equal(viewTitlePreview(smallProject('en'), v).en, 'Dining · 面向花园');
  const withEn = addTranslations(smallProject('en'), [{ zh: '面向花园', en: 'Open to the Garden' }]);
  assert.equal(viewTitlePreview(withEn, v).en, 'Dining · Open to the Garden');
  const bi = viewTitlePreview({ ...withEn, info: { ...withEn.info, lang: 'bi' } }, v);
  assert.deepEqual([bi.zh, bi.en], ['餐厅 · 面向花园', 'Dining · Open to the Garden']);
  assert.equal(viewTitlePreview(smallProject('bi'), v).en, 'Dining'); // 中英版只列已有的英文
  assert.equal(viewTitlePreview(smallProject('en'), { kind: 'view', room: '', subtitle: '' }).en, 'Untitled');
  assert.equal(viewTitlePreview(smallProject('en'), { kind: 'view', room: '客厅', subtitle: '' }).en.length > 0, true);
});

test('isLatinSource：本来就是英文的字没有 EN 框（画布上点它的英文要落到中文框）', () => {
  const p = smallProject('en');
  assert.equal(isLatinSource(p, 'Taj Mahal', 'material'), true);
  assert.equal(isLatinSource(p, 'Overview', 'view'), true);
  assert.equal(isLatinSource(p, '浅川橡', 'material'), false);
  assert.equal(isLatinSource(p, '客厅', 'room'), false); // 词典有英文，但有 EN 框
  assert.equal(isLatinSource(p, '', 'view'), false);
});

// ---------------------------------------------------------------------------
// 页面顶栏
// ---------------------------------------------------------------------------

test('toolbarCompactWidth：华文 / 英文齐了 = 780；English / 中英版缺英文时多一个「AI 翻译 · N」，门槛更宽（N 位数越多越宽）', () => {
  assert.equal(toolbarCompactWidth('zh', 0), 780);
  assert.equal(toolbarCompactWidth('zh', 12), 780); // 华文版不显示「AI 翻译」
  assert.equal(toolbarCompactWidth('en', 0), 780);
  assert.ok(toolbarCompactWidth('en', 7) > 832, '1440 宽的屏幕（画布区 832）也要收成短字，页名才放得下');
  assert.ok(toolbarCompactWidth('bi', 120) > toolbarCompactWidth('bi', 7));
});

// ---------------------------------------------------------------------------
// 导出：English 版的文件名 / 标题用英文的客户与地点
// ---------------------------------------------------------------------------

test('exportInfo / pptxTitle：English 版用翻译记忆里的英文客户 / 地点（没有就原样）；华文 / 中英版不变', () => {
  const p = smallProject('zh');
  p.info.client = '刘先生';
  p.info.location = '麻坡';
  assert.equal(pptxTitle(p, 'en'), '麻坡 · 刘先生 · Dreamhouse Blueprint'); // 还没有英文：原样
  const q = addTranslations(p, [{ zh: '刘先生', en: 'Mr Lau' }, { zh: '麻坡', en: 'Muar' }]);
  assert.equal(pptxTitle(q, 'en'), 'Muar · Mr Lau · Dreamhouse Blueprint');
  assert.equal(pptxTitle(q, 'zh'), '麻坡 · 刘先生 · Dreamhouse Blueprint');
  assert.equal(pptxTitle(q, 'bi'), '麻坡 · 刘先生 · Dreamhouse Blueprint');
  assert.equal(pptxFileName({ ...q, info: exportInfo(q, 'en') }, 'en'), '2026.08 Muar - Mr Lau - Dreamhouse Blueprint (EN).pptx');
  assert.equal(exportInfo(q, 'zh'), q.info);
  // 本来就是英文的客户不动；项目本身不变
  assert.equal(exportInfo(smallProject('zh'), 'en').client, 'Mr Lau');
  assert.equal(q.info.client, '刘先生');
});

test('materialsMissText：材料清单预览的缺英文提醒说的是这个标签页（清单里的 EN 框），不是「右侧」', () => {
  assert.equal(materialsMissText('zh', [{ zh: '浅川橡', kind: 'material' }]), '');
  assert.equal(materialsMissText('en', []), '');
  const t = materialsMissText('en', [{ zh: '浅川橡', kind: 'material' }, { zh: '云峰洞石', kind: 'material' }]);
  assert.match(t, /^English 版：2 种材料还没有英文名，页上先显示中文/);
  assert.match(t, /清单里每种材料的 EN 框/);
  assert.doesNotMatch(t, /右侧/);
  assert.match(materialsMissText('bi', [{ zh: '浅川橡', kind: 'material' }, { zh: '本案材料', kind: 'text' }]), /^中英版：2 处还没有英文，页上只显示中文/);
  // 和渲染结果连起来：预览页（只渲染材料页）的 missing
  const pages = renderDeck({ ...smallProject('en'), slides: [{ id: 's-mats', kind: 'materials', enabled: true }] });
  assert.match(materialsMissText('en', missingInPages(pages)), /种材料还没有英文名|处还没有英文/);
});
