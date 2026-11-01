// B 格物 · 方案页（src/engine/b/design.js）：三种语言都排得出来、文字在画布里、互不重叠、不压在图上、
// 英文版没有中文、中英版两种文字都有、可编辑字段、提醒（缺图 / 像素低 / 放不下），满版 / 图文的分配，
// 以及样张 p4 / p6 的几何（文字的「字」落在网格线上：框向左右各让出内边距）
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import {
  bDesignCover, bFloor, bViewFull, bViewPlate, bMaterials, bTeam, planViews, bViewPage, baseOff, balanceLine, floorPageImage, materialSlices,
} from '../src/engine/b/design.js';
import { B, INSET, GRID, colX, spanW } from '../src/engine/b/kit.js';
import { makeTranslator } from '../src/engine/lang.js';

// ---------------------------------------------------------------------------
// 测试项目（与预览用的样例项目同构；图片尺寸是预览素材的真实尺寸）
// ---------------------------------------------------------------------------

const SIZES = {
  '/living.jpg': [2400, 1350], '/living2.jpg': [2400, 1663], '/entry.jpg': [2400, 1801], '/dining.jpg': [2400, 1458],
  '/kitchen.jpg': [2400, 1526], '/bedroom.jpg': [2400, 1350], '/vanity.jpg': [2400, 1365], '/wine.jpg': [2400, 1907],
  '/tea.jpg': [2400, 1350], '/portrait.jpg': [849, 1279], '/square.jpg': [1753, 1800], '/tiny.jpg': [343, 400],
  '/board.jpg': [1800, 2400], '/board-wide.jpg': [2400, 1350], '/sw-small.jpg': [200, 200], '/sw-400.jpg': [400, 400], '/tiny-wide.jpg': [800, 450],
  '/r1700.jpg': [1700, 956], '/r1800.jpg': [1800, 1013], '/r1920.jpg': [1920, 1080],
  '/mat-oak.jpg': [600, 600], '/mat-travertine.jpg': [600, 600], '/mat-walnut.jpg': [600, 600],
  '/mat-white.jpg': [600, 600], '/mat-stone.jpg': [600, 600], '/mat-rattan.jpg': [600, 600],
};
const meta = (src) => (SIZES[src] ? { w: SIZES[src][0], h: SIZES[src][1] } : null);

const TRANSLATIONS = {
  浅川橡: 'Light Oak', 云峰洞石: 'Travertine', 归雁胡桃: 'Walnut', 墨白橡: 'White Oak', 鱼肚白岩板: 'Ivory Sintered Stone', 藤编: 'Rattan',
  鞋柜: 'Shoe Cabinet', 电视柜: 'TV Cabinet', 全景: 'Overview', 面向花园: 'Open to the Garden', 岛台与餐区: 'Island & Dining',
  床头: 'Bedhead', 衣柜与化妆台: 'Wardrobe & Vanity', 酒柜: 'Wine Cabinet', 方案设计师: 'Interior Designer',
  '液压闭门器，配反弹器': 'Hydraulic closer with push-to-open', 落地窗把花园的光带进来: 'Full-height glass brings in the garden light',
  '吊柜底部嵌 LED 灯带': 'LED strip under the wall cabinets', '转角拉篮，调味品抽屉': 'Corner carousel and spice drawers',
  '20 隐框，超白玻，灯带藏在层板下': '20 mm concealed frame, ultra-clear glass, lights hidden under the shelves',
  玻璃柜: 'Glass Cabinet', 吊柜: 'Wall Cabinets', 床头板: 'Headboard', 衣柜: 'Wardrobe', 'KTV 娱乐室': 'Entertainment Room',
};

function sample(lang = 'bi') {
  const view = (id, floorId, image, room, roomEn, subtitle, materials = [], notes = [], extra = {}) => ({
    id, kind: 'view', enabled: true, floorId, layout: 'auto', image, room, roomEn, subtitle, materials, notes, ...extra,
  });
  return {
    id: 'p-test',
    name: 'Muar · Mr Lau',
    version: 1,
    info: {
      client: 'Mr Lau', location: 'Muar', date: '2026 · 08', proposalTitle: '全屋定制设计方案', coverTitle: '', coverSubtitle: '', lang,
      team: [
        { en: 'DESIGN', name: 'Sheerly', role: '方案设计师' },
        { en: 'TECHNICAL', name: 'Wei Jie', role: '深化设计师' },
        { en: 'PROJECT', name: 'Ah Seng', role: '项目经理' },
        { en: 'SALES', name: 'Mandy', role: '销售' },
      ],
    },
    floors: [
      { id: 'f1', zh: '一楼', en: 'GROUND FLOOR', image: null },
      { id: 'f2', zh: '二楼', en: 'FIRST FLOOR', image: null },
    ],
    materials: [
      { id: 'm-oak', name: '浅川橡', code: 'AG273', image: '/mat-oak.jpg' },
      { id: 'm-trav', name: '云峰洞石', code: 'AG318', image: '/mat-travertine.jpg' },
      { id: 'm-walnut', name: '归雁胡桃', code: 'AG275', image: '/mat-walnut.jpg' },
      { id: 'm-white', name: '墨白橡', code: 'AG201', image: '/mat-white.jpg' },
      { id: 'm-stone', name: '鱼肚白岩板', code: 'SL06', image: '/mat-stone.jpg' },
      { id: 'm-rattan', name: '藤编', code: 'RT02', image: null },
    ],
    cover: { image: '/board.jpg', layout: 'split-light' },
    pages: [],
    slides: [
      { id: 's-design', kind: 'designCover', enabled: true },
      { id: 's-mats', kind: 'materials', enabled: true },
      { id: 's-f1', kind: 'floor', floorId: 'f1', enabled: true },
      view('v-entry', 'f1', '/entry.jpg', '玄关', 'Entrance', '鞋柜', [{ role: '柜体', materialId: 'm-walnut' }, { role: '柜门', materialId: 'm-oak' }]),
      view('v-tv', 'f1', '/living.jpg', '客厅', 'Living Area', '电视柜'),
      view('v-living', 'f1', '/living2.jpg', '客厅', 'Living Area', '全景', [{ role: '柜体 & 柜门', materialId: 'm-oak' }, { role: '背景墙', materialId: 'm-trav' }], [{ label: '隐形门 · Hidden door', text: '液压闭门器，配反弹器' }]),
      view('v-dining', 'f1', '/dining.jpg', '餐厅', 'Dining', '面向花园', [{ role: '柜体', materialId: 'm-oak' }, { role: '台面', materialId: 'm-trav' }, { role: '柜门', materialId: 'm-white' }], [{ label: '说明', text: '落地窗把花园的光带进来' }]),
      view('v-kitchen', 'f1', '/kitchen.jpg', '厨房', 'Kitchen', '岛台与餐区', [{ role: '柜体', materialId: 'm-white' }, { role: '台面', materialId: 'm-stone' }, { role: '吊柜', materialId: 'm-oak' }, { role: '柜门', materialId: 'm-oak' }], [{ label: '灯光', text: '吊柜底部嵌 LED 灯带' }, { label: '收纳', text: '转角拉篮，调味品抽屉' }]),
      { id: 's-f2', kind: 'floor', floorId: 'f2', enabled: true },
      view('v-bed', 'f2', '/bedroom.jpg', '主人房', 'Master Bedroom', '床头', [{ role: '床头板', materialId: 'm-walnut' }, { role: '衣柜', materialId: 'm-white' }]),
      view('v-vanity', 'f2', '/vanity.jpg', '主人房', 'Master Bedroom', '衣柜与化妆台', [{ role: '柜体', materialId: 'm-walnut' }, { role: '柜门', materialId: 'm-rattan' }], [{ label: '玻璃柜', text: '20 隐框，超白玻，灯带藏在层板下' }]),
      view('v-wine', 'f2', '/wine.jpg', 'KTV 娱乐室', 'Entertainment Room', '酒柜', [{ role: '酒柜', materialId: 'm-walnut' }]),
      view('v-tea', 'f2', '/tea.jpg', '茶室', 'Tea Room', '', [{ role: '柜体', materialId: 'm-oak' }]),
      { id: 's-team', kind: 'team', enabled: true },
    ],
    translations: { ...TRANSLATIONS },
  };
}

const LANGS = ['zh', 'en', 'bi'];
const ctxOf = (project, lang) => {
  const p = { ...project, info: { ...project.info, lang } };
  return { project: p, lang, tr: makeTranslator(p), meta };
};

/** 一个项目在某语言下的全部方案页：[{ name, page }] */
function renderAll(project, lang) {
  const out = [];
  const plan = planViews({ ...project, info: { ...project.info, lang } }, meta);
  for (const s of project.slides) {
    const ctx = ctxOf(project, lang);
    let pg = null;
    if (s.kind === 'designCover') pg = bDesignCover(ctx);
    else if (s.kind === 'materials') pg = bMaterials(ctx, project.materials, 0, 1);
    else if (s.kind === 'floor') pg = bFloor(ctx, s);
    else if (s.kind === 'view') pg = bViewPage(ctx, s, plan);
    else if (s.kind === 'team') pg = bTeam(ctx);
    if (pg) out.push({ name: `${lang} ${s.kind} ${s.id}`, page: pg, slide: s });
  }
  return out;
}

const textOf = (el) => (el.paras || []).map((p) => p.runs.map((r) => r.text).join('')).join('\n');
const CJK = /[㐀-鿿豈-﫿]/;
const texts = (pg) => pg.els.filter((e) => e.t === 'text');
const imgs = (pg) => pg.els.filter((e) => e.t === 'img');
const allText = (pg) => texts(pg).map(textOf).join('\n');
const at = (pg, str) => texts(pg).find((e) => textOf(e) === str);
const fieldsOf = (pg) => new Set(pg.els.map((e) => e.edit?.field).filter(Boolean));
/** 文字框去掉内边距 = 字的范围（x0 = 字的左边，与网格线对齐） */
const contentBox = (el) => ({ x0: el.x + INSET, y0: el.y + INSET, x1: el.x + el.w - INSET, y1: el.y + el.h - INSET });
const imgBox = (el) => ({ x0: el.x, y0: el.y, x1: el.x + el.w, y1: el.y + el.h });
const overlap = (a, b, tol = 0.5) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > tol && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > tol;
const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;
const plates = (pg) => pg.els.filter((e) => e.t === 'img' || (e.t === 'rect' && e.fill === B.sample));

/** 一页的版面检查：画布内、边距内、文字不互相重叠、文字不压图、图不压暗、裁切不变形 */
function checkPage(name, pg) {
  assert.equal(pg.bg, B.paper, `${name}: 奶白纸底`);
  assert.ok(Array.isArray(pg.els) && Array.isArray(pg.warnings), `${name}: { bg, els, warnings }`);
  const ts = texts(pg);
  for (const el of ts) {
    assert.ok(el.x >= 0 && el.y >= 0 && el.x + el.w <= GRID.W + 0.01 && el.y + el.h <= GRID.H + 0.01, `${name}: 文字超出画布 「${textOf(el)}」 ${JSON.stringify([el.x, el.y, el.w, el.h])}`);
    const c = contentBox(el);
    assert.ok(c.x0 >= GRID.left - 0.01 && c.x1 <= GRID.right + 0.01, `${name}: 文字不在左右边距里 「${textOf(el)}」`);
    assert.ok(c.y0 >= GRID.top - 0.01 && c.y1 <= GRID.bottom + 0.01, `${name}: 文字不在 96–984 里 「${textOf(el)}」 ${c.y0}–${c.y1}`);
    for (const p of el.paras) for (const r of p.runs) assert.ok(['light', 'regular', 'title'].includes(r.font), `${name}: 字体角色 ${r.font}`);
  }
  for (let i = 0; i < ts.length; i++) {
    for (let j = i + 1; j < ts.length; j++) {
      assert.ok(!overlap(contentBox(ts[i]), contentBox(ts[j])), `${name}: 文字重叠 「${textOf(ts[i])}」 × 「${textOf(ts[j])}」`);
    }
  }
  for (const im of imgs(pg)) {
    for (const el of ts) assert.ok(!overlap(contentBox(el), imgBox(im)), `${name}: 文字压在图上 「${textOf(el)}」`);
    if (im.crop) {
      const { l, t, r, b } = im.crop;
      for (const v of [l, t, r, b]) assert.ok(v >= 0 && v < 1, `${name}: 裁切比例 ${JSON.stringify(im.crop)}`);
      const nat = meta(im.src);
      if (nat) assert.ok(Math.abs(((1 - l - r) * nat.w) / ((1 - t - b) * nat.h) - im.w / im.h) < 0.01, `${name}: 裁切后不变形`);
    }
  }
  // 不压暗：没有渐变、没有半透明的色块
  for (const el of pg.els.filter((e) => e.t === 'rect')) {
    assert.ok(!el.grad && (el.alpha ?? 1) === 1, `${name}: 不该有压暗 / 渐变层`);
  }
}

// ---------------------------------------------------------------------------
// 每种页 × 三种语言
// ---------------------------------------------------------------------------

test('三种语言：每种方案页都排得出来，文字在画布与边距里、互不重叠、不压在图上、图不压暗', () => {
  for (const lang of LANGS) {
    const pages = renderAll(sample(lang), lang);
    assert.equal(pages.length, 14, `${lang}: 14 页（封面、材料、2 个楼层、9 张效果图、团队）`);
    for (const { name, page } of pages) checkPage(name, page);
  }
});

test('边界情况也不重叠：长标题、长说明、8 行材料、竖图 / 方图、没有图、没有翻译、1–12 种材料、分页、10 个空间、团队', () => {
  const longTitle = '面向花园的开放式餐厅与厨房，岛台连着餐桌';
  const longNote = '餐边柜嵌进墙里，与墙面齐平；开放格里放日常用的器物，下面是两个大抽屉，抽屉里分格放餐具与桌布。';
  for (const lang of LANGS) {
    const p = sample(lang);
    p.translations[longTitle] = 'An open dining room and kitchen facing the garden, the island joined to the table';
    p.translations[longNote] = 'The sideboard is set into the wall and sits flush with it; open shelves hold everyday pieces, with two deep drawers below for cutlery and table linen.';
    const kitchen = p.slides.find((s) => s.id === 'v-kitchen');
    const dining = p.slides.find((s) => s.id === 'v-dining');
    const many = ['m-white', 'm-stone', 'm-oak', 'm-oak', 'm-walnut', 'm-trav', 'm-rattan', 'm-white'].map((m, i) => ({ role: ['柜体', '台面', '吊柜', '柜门', '柜体 & 柜门', '背景墙', '床头板', '衣柜'][i], materialId: m }));
    const longNotes = [
      { label: '灯光', text: '吊柜底部嵌 LED 灯带' },
      { label: '收纳', text: '转角拉篮，调味品抽屉' },
      { label: '隐形门 · Hidden door', text: '液压闭门器，配反弹器' },
      { label: '说明', text: '岛台一侧做开放格，放常用的碗碟，另一侧是两个大抽屉，抽屉里分格放锅具与保鲜盒。' },
    ];
    const ctx = ctxOf(p, lang);
    const twelve = [...p.materials, ...p.materials.map((m) => ({ ...m, id: `${m.id}-2` }))];
    const cases = {
      'many materials': bViewPlate(ctx, { ...kitchen, materials: many, notes: [] }),
      'many materials + notes': bViewPlate(ctx, { ...kitchen, materials: many, notes: longNotes }),
      'long notes': bViewPlate(ctx, { ...kitchen, notes: longNotes }),
      'long title': bViewPlate(ctx, { ...dining, subtitle: longTitle }),
      'long note': bViewPlate(ctx, { ...dining, notes: [{ label: '', text: longNote }] }),
      '6 rows + title': bViewPlate(ctx, { ...dining, notes: [], materials: many.slice(0, 6) }),
      portrait: bViewPlate(ctx, { ...kitchen, image: '/portrait.jpg', notes: longNotes }),
      square: bViewPlate(ctx, { ...kitchen, image: '/square.jpg' }),
      '4:3': bViewPlate(ctx, { ...kitchen, image: '/entry.jpg', notes: longNotes.slice(0, 3) }),
      'no image': bViewPlate(ctx, { ...kitchen, image: null }),
      'full no image': bViewFull(ctx, { ...kitchen, image: null }),
      'materials 0': bMaterials(ctx, [], 0, 1),
      'materials page 2/2': bMaterials(ctx, twelve.slice(0, 5), 1, 2, 7),
    };
    for (let n = 1; n <= 12; n++) cases[`materials ${n}`] = bMaterials(ctx, twelve.slice(0, n), 0, 1);
    for (const [k, pg] of Object.entries(cases)) checkPage(`${lang} ${k}`, pg);

    const q = sample(lang);
    q.translations = {};
    for (const s of q.slides) if (s.kind === 'view') s.roomEn = '';
    for (const { name, page } of renderAll(q, lang)) checkPage(`${name} (no translations)`, page);

    const r = sample(lang);
    const rooms = ['玄关', '客厅', '餐厅', '厨房', '主人房衣帽间与卫浴', '书房', '客房', '茶室', '洗衣房', '阳台', '储物间', '工人房', '露台', '车库'];
    r.slides = [{ id: 'fx', kind: 'floor', floorId: 'f1', enabled: true }, ...rooms.map((room, i) => ({ id: `vv${i}`, kind: 'view', enabled: true, floorId: 'f1', image: '/living.jpg', room, roomEn: '', subtitle: '', materials: [], notes: [] }))];
    checkPage(`${lang} floor 14 rooms`, bFloor(ctxOf(r, lang), r.slides[0]));

    const t = sample(lang);
    t.info.team = [
      { name: 'Sheerly', role: '方案设计师' }, { name: '王伟杰', role: '深化设计师' }, { name: 'Ah Seng', role: '项目经理' },
      { name: 'Mandy Tan Mei Ling', role: '销售' }, { name: 'Kelvin', role: '店长' }, { name: 'Ahmad', role: '安装主管' }, { name: 'Extra', role: '客服' },
    ];
    checkPage(`${lang} team 7`, bTeam(ctxOf(t, lang)));
    t.info.team = t.info.team.slice(0, 5);
    checkPage(`${lang} team 5`, bTeam(ctxOf(t, lang)));

    const c = sample(lang);
    c.cover.image = '/board-wide.jpg';
    c.info.coverTitle = '刘府 · 麻坡';
    c.info.coverSubtitle = '一家三代的家';
    c.translations['刘府 · 麻坡'] = 'Lau Residence, Muar';
    checkPage(`${lang} cover wide board`, bDesignCover(ctxOf(c, lang)));
  }
});

// ---------------------------------------------------------------------------
// 中英：English 版没有中文，中英版两种文字都有
// ---------------------------------------------------------------------------

test('English 版：翻译齐全时整页没有中文', () => {
  for (const { name, page } of renderAll(sample('en'), 'en')) {
    const s = allText(page);
    assert.ok(!CJK.test(s), `${name}: 还有中文 ${s.split('\n').filter((l) => CJK.test(l)).join(' / ')}`);
  }
});

test('中英版：每页（满版图除外）都有中文也有英文；华文版没有英文正文', () => {
  for (const { name, page, slide } of renderAll(sample('bi'), 'bi')) {
    if (!texts(page).length) {
      assert.equal(slide.kind, 'view', `${name}: 只有满版图可以没有字`);
      continue;
    }
    const s = allText(page);
    assert.ok(CJK.test(s), `${name}: 没有中文`);
    assert.ok(/[A-Za-z]{3}/.test(s.replace(/[A-Z]{2}\d+/g, '')), `${name}: 没有英文`);
  }
  for (const { name, page } of renderAll(sample('zh'), 'zh')) {
    const words = allText(page)
      .replace(/[A-Z]{2}\d{2,}/g, '') // 材料编号
      .replace(/Mr Lau|Muar|Sheerly|Wei Jie|Ah Seng|Mandy|KTV|LED/g, '');
    assert.ok(!/[a-z]{3}/.test(words), `${name}: 华文版出现英文 ${words}`);
  }
});

test('中英版：英文与中文同样大小（并重），英文跟在中文下面或并排', () => {
  const pg = bViewPlate(ctxOf(sample('bi'), 'bi'), sample('bi').slides.find((s) => s.id === 'v-dining'));
  // 标题：中文 44px / 英文 46px；正文 22 / 23；不是「大中文 + 小灰英文」
  const zhTitle = at(pg, '面向花园');
  const enTitle = texts(pg).find((e) => /^Open to/.test(textOf(e)));
  assert.ok(zhTitle && enTitle);
  assert.ok(Math.abs(zhTitle.paras[0].runs[0].size - enTitle.paras[0].runs[0].size) <= 1.5, '标题中英同大');
  assert.equal(zhTitle.x, enTitle.x, '英文标题与中文同一左边线');
  assert.ok(near(enTitle.y, zhTitle.y + zhTitle.h - 2 * INSET), '英文标题紧跟中文标题');
  const zhNote = at(pg, '落地窗把花园的光带进来');
  const enNote = at(pg, 'Full-height glass brings in the garden light');
  assert.ok(zhNote && enNote);
  assert.ok(Math.abs(zhNote.paras[0].runs[0].size - enNote.paras[0].runs[0].size) <= 1.5, '说明中英同大');
});

// ---------------------------------------------------------------------------
// 可编辑字段
// ---------------------------------------------------------------------------

test('可编辑字段：图、标题、标签、材料、说明、楼层、团队、封面都能点回输入框', () => {
  const p = sample('bi');
  const ctx = ctxOf(p, 'bi');

  const plate = bViewPlate(ctx, p.slides.find((s) => s.id === 'v-living'));
  for (const f of ['image', 'room', 'roomEn', 'title', 'subtitleEn', 'materials.0', 'materials.0.role', 'materials.0.roleEn', 'materials.0.nameEn', 'materials.1', 'notes.0.label', 'notes.0.labelEn', 'notes.0.text', 'notes.0.textEn']) {
    assert.ok(fieldsOf(plate).has(f), `图文页缺 ${f}`);
  }
  for (const el of plate.els) if (el.t === 'text' || el.t === 'img') assert.ok(el.edit?.field, `图文页的「${textOf(el) || el.src}」没有 edit 字段`);
  const tea = bViewPlate(ctx, p.slides.find((s) => s.id === 'v-tea'));
  assert.ok(fieldsOf(tea).has('floor') && fieldsOf(tea).has('room') && fieldsOf(tea).has('roomEn'), '没有视角名：标题 = 空间（room / roomEn），标签 = 楼层');

  const en = bViewPlate(ctxOf(p, 'en'), p.slides.find((s) => s.id === 'v-living'));
  assert.ok(fieldsOf(en).has('subtitleEn') && fieldsOf(en).has('notes.0.textEn') && fieldsOf(en).has('materials.0.nameEn') && fieldsOf(en).has('materials.0.roleEn'));
  assert.ok(!fieldsOf(en).has('title'), 'English 版的标题指向英文字段');

  const full = bViewFull(ctx, p.slides.find((s) => s.id === 'v-tv'));
  assert.deepEqual([...fieldsOf(full)], ['image']);
  assert.equal(texts(full).length, 0, '满版图上什么字都没有');

  const floor = bFloor(ctx, p.slides.find((s) => s.id === 's-f1'));
  for (const f of ['floor.zh', 'floor.en', 'image']) assert.ok(fieldsOf(floor).has(f), `楼层页缺 ${f}`);

  const mats = bMaterials(ctx, p.materials, 0, 1);
  for (const m of p.materials) assert.ok(fieldsOf(mats).has(`material:${m.id}`), `材料页缺 material:${m.id}`);
  const team = bTeam(ctx);
  for (const f of ['team.0.name', 'team.0.role', 'team.0.roleEn', 'team.3.name']) assert.ok(fieldsOf(team).has(f), `团队页缺 ${f}`);

  const cover = bDesignCover(ctx);
  for (const f of ['cover.image', 'coverTitle', 'coverSubtitle']) assert.ok(fieldsOf(cover).has(f), `封面缺 ${f}`);
  p.info.coverTitle = '刘府 · 麻坡';
  p.translations['刘府 · 麻坡'] = 'Lau Residence, Muar';
  assert.ok(fieldsOf(bDesignCover(ctxOf(p, 'bi'))).has('coverTitleEn'), '中文封面标题的英文 → coverTitleEn');
});

// ---------------------------------------------------------------------------
// 效果图取景：水印留在画外、不放大发虚
// ---------------------------------------------------------------------------

test('效果图取景：从顶部起、左右居中，底部至少裁掉 9.5%（右下角水印不进画面）；放大不超过 1.15 倍', () => {
  const p = sample('bi');
  const ctx = ctxOf(p, 'bi');
  const full = imgs(bViewFull(ctx, p.slides.find((s) => s.id === 'v-tv')))[0];
  assert.deepEqual([full.x, full.y, full.w, full.h], [0, 0, 1920, 1080]);
  assert.ok(full.crop.t === 0 && full.crop.b >= 0.095 - 1e-6, `16:9 满版：底部裁掉 ${full.crop.b}`);
  assert.ok(near(full.crop.l, full.crop.r, 1e-6), '左右居中');
  assert.ok(near((1080 / 1350) / (1 - full.crop.b), 0.884, 0.01), '约放大到 88%（样张 p5 是 88.5%）');
  for (const id of ['v-entry', 'v-dining', 'v-kitchen', 'v-bed']) {
    const im = imgs(bViewPlate(ctx, p.slides.find((s) => s.id === id)))[0];
    assert.ok(im.crop.b >= 0.095 - 1e-6 && im.crop.t <= im.crop.b + 1e-6, `${id}: 底部至少裁 9.5%`);
  }
  const fl = imgs(bFloor(ctx, p.slides.find((s) => s.id === 's-f1')))[0];
  assert.ok(fl.crop.b >= 0.095 - 1e-6, '楼层页的图也一样');
  // 原图不够大：不为了躲水印再放大（16:9 的小图原样铺满，不裁）
  const tiny = imgs(bViewFull(ctx, { ...p.slides.find((s) => s.id === 'v-tv'), image: '/tiny-wide.jpg' }))[0];
  assert.deepEqual(tiny.crop, { l: 0, t: 0, r: 0, b: 0 }, '已经放大发虚的图不再放大');
  // 竖图铺满宽框：上下要裁得多时上下平分（不全裁在底部）
  const tall = imgs(bViewFull(ctx, { ...p.slides.find((s) => s.id === 'v-tv'), image: '/portrait.jpg' }))[0];
  assert.ok(near(tall.crop.t, tall.crop.b, 1e-6) && tall.crop.b > 0.095);
  // Material Board 不裁
  const board = imgs(bDesignCover(ctx))[0];
  assert.equal(board.fit, 'contain');
  assert.ok(!board.crop);
});

// ---------------------------------------------------------------------------
// 团队
// ---------------------------------------------------------------------------

test('团队页：一排落在 984，职位同一顶线；中文名、英文名同一基线；细线在职位上方 16，只跨这几位', () => {
  const p = sample('bi');
  p.info.team = [{ name: 'Sheerly', role: '方案设计师' }, { name: '王伟杰', role: '深化设计师' }, { name: 'Ah Seng', role: '项目经理' }];
  const pg = bTeam(ctxOf(p, 'bi'));
  const names = texts(pg).filter((e) => /\.name$/.test(e.edit?.field || ''));
  assert.equal(names.length, 3);
  const role = names[0].paras[0].runs[0].font === 'title' ? 'display' : 'head';
  assert.equal(role, 'display', '名字都放得进两行：用 display（与封面客户名同级）');
  const base = (el) => el.y + INSET + baseOff(CJK.test(textOf(el)) ? 'zh' : 'en', role);
  assert.ok(names.every((n) => near(base(n), base(names[0]))), '名字同一基线');
  assert.ok(near(Math.max(...names.map((n) => n.y + n.h - INSET)), 984), '落在 984');
  const roles = texts(pg).filter((e) => /\.role$/.test(e.edit?.field || ''));
  assert.equal(new Set(roles.map((r) => r.y)).size, 1, '职位同一顶线');
  assert.deepEqual(roles.map((r) => r.x + INSET), [120, 546, 972], '≤ 4 位：每位 3 栏宽');
  const rule = pg.els.find((e) => e.t === 'rect' && e.h === 1);
  assert.ok(near(roles[0].y + INSET - rule.y, 16));
  assert.deepEqual([rule.x, rule.x + rule.w], [120, 120 + 3 * 426 - 24], '细线只跨这三位');

  // 6 位、有长名字：每位 2 栏宽，名字用 head
  p.info.team = [
    { name: 'Sheerly', role: '方案设计师' }, { name: '王伟杰', role: '深化设计师' }, { name: 'Ah Seng', role: '项目经理' },
    { name: 'Mandy Tan Mei Ling', role: '销售' }, { name: 'Kelvin', role: '店长' }, { name: 'Ahmad bin Abdullah', role: '安装主管' },
  ];
  const six = bTeam(ctxOf(p, 'bi'));
  const sixNames = texts(six).filter((e) => /\.name$/.test(e.edit?.field || ''));
  assert.ok(sixNames.every((e) => e.paras[0].runs[0].font !== 'title'), '放不进两行的 display → 全部用 head');
  assert.deepEqual(sixNames.map((e) => e.x + INSET), [0, 1, 2, 3, 4, 5].map((i) => 120 + i * 284));
  assert.deepEqual(six.warnings, []);
});

test('团队页：只有职位、没填名字的成员先不放，逐个提醒；一个名字都没有时职位先排着并提醒', () => {
  const p = sample('bi');
  p.info.team = [
    { en: 'DESIGN', name: 'Sheerly', role: '方案设计师' }, { en: 'TECHNICAL', name: '', role: '深化设计师' },
    { en: 'PROJECT', name: 'Ah Seng', role: '项目经理' }, { en: 'SALES', name: '', role: '销售' }, { en: 'STORE', name: '', role: '店长' },
  ];
  const pg = bTeam(ctxOf(p, 'bi'));
  const roles = texts(pg).filter((e) => /\.role$/.test(e.edit?.field || '')).map((e) => e.edit.field);
  assert.deepEqual([...new Set(roles)], ['team.0.role', 'team.2.role'], '页面上只有填了名字的两位');
  assert.equal(pg.warnings.length, 3);
  assert.match(pg.warnings[0], /服务团队第 2 位「深化设计师」还没填名字/);
  assert.match(pg.warnings.join(' '), /第 4 位「销售」.*第 5 位「店长」/);
  const rule = pg.els.find((e) => e.t === 'rect' && e.h === 1);
  assert.equal(rule.w, 2 * 426 - 24);

  p.info.team = p.info.team.map((m) => ({ ...m, name: '' }));
  const none = bTeam(ctxOf(p, 'en'));
  assert.match(none.warnings.join(' '), /服务团队还没填名字/);
  assert.equal(texts(none).filter((e) => /\.roleEn$/.test(e.edit?.field || '')).length, 5, '一个名字都没有：职位先排着');
});

test('团队页：idx 是 info.team 里的原始序号（空成员跳过时也对得上）', () => {
  const p = sample('zh');
  p.info.team = [{ name: '', role: '' }, { name: 'Sheerly', role: '方案设计师' }];
  const pg = bTeam(ctxOf(p, 'zh'));
  const f = pg.els.map((e) => e.edit?.field).filter(Boolean);
  assert.ok(f.includes('team.1.name') && f.includes('team.1.role') && !f.some((x) => x.startsWith('team.0')));
});

// ---------------------------------------------------------------------------
// 提醒
// ---------------------------------------------------------------------------

test('提醒：缺图、像素偏低、材料 / 说明放不下、材料被删、空间太多、团队太多、材料为空', () => {
  const p = sample('bi');
  const ctx = ctxOf(p, 'bi');
  const kitchen = p.slides.find((s) => s.id === 'v-kitchen');
  const w = (pg) => pg.warnings.join(' | ');

  assert.match(w(bViewPlate(ctx, { ...kitchen, image: null })), /缺少效果图/);
  assert.match(w(bViewFull(ctx, { ...kitchen, image: null })), /缺少效果图/);
  assert.match(w(bViewPlate(ctx, { ...kitchen, image: '/tiny.jpg' })), /图片像素偏低：放大 \d\.\d 倍会发虚，建议换高清图/);
  assert.match(w(bViewFull(ctx, { ...kitchen, image: '/tiny.jpg' })), /图片像素偏低/);
  assert.doesNotMatch(w(bViewPlate(ctx, kitchen)), /像素偏低/, '2400 宽的效果图不该提醒（含躲水印的放大）');

  const eight = Array.from({ length: 8 }, (_, i) => ({ role: '柜体', materialId: p.materials[i % 5].id }));
  assert.match(w(bViewPlate(ctx, { ...kitchen, materials: eight, notes: [] })), /材料太多：建议拆成两页/);
  const notes = Array.from({ length: 6 }, (_, i) => ({ label: `收纳${i}`, text: '转角拉篮，调味品抽屉，另一侧是两个大抽屉，抽屉里分格放锅具与保鲜盒。' }));
  assert.match(w(bViewPlate(ctx, { ...kitchen, notes })), /说明太多放不下：建议拆成两页/);
  const huge = '餐边柜嵌进墙里，与墙面齐平；开放格里放日常用的器物，下面是两个大抽屉，抽屉里分格放餐具与桌布。'.repeat(4);
  assert.match(w(bViewPlate(ctx, { ...kitchen, notes: [{ label: '', text: huge }] })), /说明太长（第 1 条）：建议精简或拆页/);
  assert.match(w(bViewPlate(ctx, { ...kitchen, materials: [{ role: '柜体', materialId: 'gone' }, { role: '台面', materialId: null }] })), /第 1 项材料已被删除.*第 2 项还没选材料/);

  const floorP = sample('bi');
  floorP.slides = [{ id: 'fx', kind: 'floor', floorId: 'f1', enabled: true }, ...Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, kind: 'view', enabled: true, floorId: 'f1', image: null, room: `房间${i}`, subtitle: '', materials: [], notes: [] }))];
  assert.match(w(bFloor(ctxOf(floorP, 'bi'), floorP.slides[0])), /本层空间太多，楼层页只显示了 \d+ \/ 30 个/);
  floorP.slides = [floorP.slides[0]];
  assert.match(w(bFloor(ctxOf(floorP, 'bi'), floorP.slides[0])), /这一层还没有效果图页：楼层章节页后面没有内容/);
  // 有效果图页、但都没有图：楼层页没有背景图
  floorP.slides = [floorP.slides[0], { id: 'r0', kind: 'view', enabled: true, floorId: 'f1', image: null, room: '客厅', subtitle: '', materials: [], notes: [] }];
  assert.match(w(bFloor(ctxOf(floorP, 'bi'), floorP.slides[0])), /楼层章节页没有背景图/);
  // 这一层的效果图都隐藏了：提醒把楼层页也隐藏（不再只说没有背景图）
  floorP.slides[1] = { ...floorP.slides[1], enabled: false };
  const hiddenFloor = w(bFloor(ctxOf(floorP, 'bi'), floorP.slides[0]));
  assert.match(hiddenFloor, /这一层的效果图都隐藏了/);
  assert.doesNotMatch(hiddenFloor, /没有背景图/);

  const teamP = sample('bi');
  teamP.info.team = Array.from({ length: 13 }, (_, i) => ({ name: `Name ${i}`, role: '设计师' }));
  assert.match(w(bTeam(ctxOf(teamP, 'bi'))), /只显示了前 12 位/);

  assert.match(w(bMaterials(ctx, [], 0, 1)), /本案材料为空/);
  const lowMat = bMaterials(ctx, [{ id: 'mx', name: '小样', code: 'X1', image: '/sw-small.jpg' }], 0, 1);
  assert.match(w(lowMat), /材料「小样」的图片像素偏低/);
  const wide = sample('bi');
  wide.cover.image = '/tiny.jpg';
  assert.match(w(bDesignCover(ctxOf(wide, 'bi'))), /Material Board 图片像素偏低/);
});

test('满版：设定成满版但这页有说明 / 材料没在别处列出 → 提醒；自动满版不丢东西、不提醒', () => {
  const p = sample('bi');
  const plan = planViews(p, meta);
  const tv = p.slides.find((s) => s.id === 'v-tv');
  assert.equal(plan.get(tv.id), 'full');
  assert.deepEqual(bViewFull(ctxOf(p, 'bi'), tv, plan).warnings, []);
  const kitchen = { ...p.slides.find((s) => s.id === 'v-kitchen'), layout: 'full' };
  p.slides = p.slides.map((s) => (s.id === kitchen.id ? kitchen : s));
  const w = bViewFull(ctxOf(p, 'bi'), kitchen, planViews(p, meta)).warnings.join(' ');
  assert.match(w, /满版大图不显示说明与材料/);
});

// ---------------------------------------------------------------------------
// 方案封面
// ---------------------------------------------------------------------------

test('方案封面：没有 Material Board 返回 null；有就整张放进右侧（不裁），标题 = 自填或客户与地点', () => {
  const p = sample('bi');
  assert.equal(bDesignCover(ctxOf({ ...p, cover: { image: null } }, 'bi')), null);
  const pg = bDesignCover(ctxOf(p, 'bi'));
  const board = imgs(pg)[0];
  assert.equal(board.fit, 'contain');
  assert.ok(Math.abs(board.w / board.h - 1800 / 2400) < 0.01, '框与 Board 同比例：一点不裁');
  assert.ok(board.x >= 830 && board.x + board.w <= 1800 && board.y >= 96 && board.y + board.h <= 984, 'Board 在第 6–12 栏、上下留 96');
  const s = allText(pg);
  assert.match(s, /第三章　方案/);
  assert.match(s, /Chapter Three — Design/);
  assert.match(s, /Mr Lau\nMuar/);
  assert.match(s, /一楼与二楼/);
  assert.match(s, /Ground & First Floor/);
  // 中英版的标签、楼层：中文第 1 栏、英文第 3 栏并排（字落在 120 / 404）
  const zh = at(pg, '一楼与二楼');
  const en = at(pg, 'Ground & First Floor');
  assert.ok(near(zh.x + INSET, 120) && near(en.x + INSET, 404));
  const base = (el, lang) => el.y + INSET + baseOff(lang, 'body');
  assert.ok(near(base(zh, 'zh'), base(en, 'en')), '并排的中英同一基线');
  assert.ok(near(Math.max(zh.y + zh.h, en.y + en.h) - INSET, 984), '楼层这一行落在 984');

  // 横版 Board（16:9）：面板放宽到第 4–12 栏、落在 984（与楼层那一行同一条底线），不再缩在右上角
  const wide = sample('en');
  wide.cover.image = '/board-wide.jpg';
  const wpg = bDesignCover(ctxOf(wide, 'en'));
  const b2 = imgs(wpg)[0];
  assert.equal(b2.w, 1254);
  assert.equal(b2.x, colX(4));
  assert.equal(b2.y + b2.h, 984);
  assert.ok(Math.abs(b2.w / b2.h - 2400 / 1350) < 0.01, '横版也一点不裁');
  for (const el of texts(wpg)) assert.ok(el.x + el.w - INSET <= b2.x - 54 + 0.5, `文字在 Board 左边：${el.paras[0].runs[0].text}`);
});

test('方案封面：自己改过的方案名没有英文时不拿通用英文顶替（记下缺英文）；默认方案名才配默认英文', () => {
  const p = sample('en');
  p.info.client = '';
  p.info.location = '';
  p.info.proposalTitle = '刘府全屋定制与软装方案';
  const ctx = ctxOf(p, 'en');
  const pg = bDesignCover(ctx);
  assert.doesNotMatch(allText(pg), /Whole-House Design Proposal/);
  assert.ok(ctx.tr.misses.some((m) => m.zh === '刘府全屋定制与软装方案'), '记下缺英文（页面会提醒）');
  p.info.proposalTitle = '全屋定制设计方案';
  assert.match(allText(bDesignCover(ctxOf(p, 'en'))), /Whole-House Design Proposal/);
});

// ---------------------------------------------------------------------------
// 楼层章节页
// ---------------------------------------------------------------------------

test('楼层章节页：图出血（0–1232 满高），右栏楼层名挂在 96，空间清单落在 984；空间取启用、非立体图的效果图页', () => {
  const p = sample('bi');
  p.slides.push({ id: 'v3d', kind: 'view', enabled: true, floorId: 'f1', image: '/living.jpg', room: '全屋', subtitle: '立体图', tag: '3d', materials: [], notes: [] });
  p.slides.push({ id: 'voff', kind: 'view', enabled: false, floorId: 'f1', image: '/living.jpg', room: '储物间', subtitle: '', materials: [], notes: [] });
  const pg = bFloor(ctxOf(p, 'bi'), p.slides.find((s) => s.id === 's-f1'));
  const im = imgs(pg)[0];
  assert.deepEqual([im.x, im.y, im.w, im.h], [0, 0, 1232, 1080]);
  const s = allText(pg);
  assert.match(s, /^一楼\nGround Floor/);
  assert.ok(near(texts(pg)[0].x + INSET, 1398) && near(texts(pg)[0].y + INSET, 96), '楼层名的字在 1398、挂在 96');
  assert.match(s, /玄关\nEntrance\n客厅\nLiving Area\n餐厅\nDining\n厨房\nKitchen$/);
  assert.doesNotMatch(s, /全屋|储物间/);
  const last = texts(pg).at(-1);
  assert.ok(near(last.y + last.h - INSET, 984), '空间清单落在 984');
  const en = allText(bFloor(ctxOf(p, 'en'), p.slides.find((s) => s.id === 's-f2')));
  assert.match(en, /^First Floor\nMaster Bedroom\nEntertainment Room\nTea Room$/);
});

test('楼层章节页的图：不用紧接着下一页的那张图 —— 先取这一层的满版大图，没有就取下一张；只有一张时才用它', () => {
  const p = sample('bi');
  const f1 = p.slides.find((s) => s.id === 's-f1');
  const f2 = p.slides.find((s) => s.id === 's-f2');
  const src = (proj, sl) => imgs(bFloor(ctxOf(proj, 'bi'), sl))[0]?.src;
  assert.equal(src(p, f1), '/living.jpg', '一楼：下一页是玄关（entry.jpg）→ 取这一层的满版大图（电视柜 living.jpg）');
  assert.equal(src(p, f2), '/vanity.jpg', '二楼：下一页是床头（bedroom.jpg），没有满版 → 取下一张不同的图');
  assert.deepEqual(floorPageImage(p, f2, meta), { src: '/vanity.jpg', auto: true });
  // 楼层图（导入时取的第一张横图）正好是下一页的图 → 也换
  p.floors[0].image = '/entry.jpg';
  assert.equal(src(p, f1), '/living.jpg');
  // 楼层图不是下一页的图 → 照用（设计师选的）
  p.floors[0].image = '/dining.jpg';
  assert.equal(src(p, f1), '/dining.jpg');
  assert.deepEqual(floorPageImage(p, f1, meta), { src: '/dining.jpg', auto: false });
  // 这一页自己选的图：照用
  assert.equal(src(p, { ...f1, image: '/entry.jpg' }), '/entry.jpg');
  // 这一层只有一张效果图：只能用它
  const q = sample('bi');
  q.slides = [{ id: 'fa', kind: 'floor', floorId: 'f1', enabled: true }, { id: 'va', kind: 'view', enabled: true, floorId: 'f1', image: '/kitchen.jpg', room: '厨房', subtitle: '', materials: [], notes: [] }];
  assert.equal(src(q, q.slides[0]), '/kitchen.jpg');
});

test('楼层章节页：楼层被删了也排得出来，并提醒；英文楼层名里的虚词小写', () => {
  const p = sample('en');
  const pg = bFloor(ctxOf(p, 'en'), { id: 'fz', kind: 'floor', floorId: 'gone', enabled: true });
  assert.match(pg.warnings.join(' '), /楼层已被删除/);
  assert.ok(!CJK.test(allText(pg)));
  checkPage('floor gone', pg);
  const q = sample('bi');
  q.floors[0] = { id: 'f1', zh: '屋顶花园与露台', en: 'ROOF GARDEN AND TERRACE', image: null };
  const s = allText(bFloor(ctxOf(q, 'bi'), q.slides.find((x) => x.id === 's-f1')));
  assert.match(s, /^屋顶花园\n与露台\nRoof Garden\nand Terrace/, '中文断在「与」前；英文 and 小写');
});

// ---------------------------------------------------------------------------
// 图文页的版式（对照样张 p6）
// ---------------------------------------------------------------------------

test('图文页（样张 p6）：横图上、左出血 1344 宽；标签挂在 96、标题挂在 200；材料表落在 984，编号靠右、只印一次；说明在图下 48', () => {
  const p = sample('bi');
  const dining = p.slides.find((s) => s.id === 'v-dining');
  const pg = bViewPlate(ctxOf(p, 'bi'), dining);
  const im = imgs(pg)[0];
  assert.deepEqual([im.x, im.y, im.w, im.h], [0, 0, 1344, 792], '1344 宽，高 = 1344 / 比例，最多 792');
  const left = (el) => el.x + INSET;
  const top = (el) => el.y + INSET;
  assert.ok(near(left(at(pg, '一楼　餐厅')), 1398) && near(top(at(pg, '一楼　餐厅')), 96), '标签的字在 1398、挂在 96（与样张同一像素）');
  assert.ok(near(top(at(pg, 'Ground Floor — Dining')), 124));
  assert.ok(near(top(at(pg, '面向花园')), 200));
  assert.ok(near(top(at(pg, '落地窗把花园的光带进来')), 792 + 48));
  assert.ok(near(left(at(pg, '落地窗把花园的光带进来')), 120), '说明的字在 120');
  assert.ok(!allText(pg).includes('说明'), '笼统的标签（说明）不印');
  const rules = pg.els.filter((e) => e.t === 'rect' && e.h === 1);
  assert.ok(rules.every((r) => r.x === 1398 && r.x + r.w === 1800));
  assert.deepEqual(rules.map((r) => r.y).sort((a, b) => a - b), [696, 792, 888, 984], '三行中英材料，每行 96（与样张一致）');
  const codes = texts(pg).filter((e) => /^AG\d+$/.test(textOf(e)));
  assert.equal(codes.length, 3);
  for (const c of codes) assert.ok(near(c.x + c.w - INSET, 1800) && c.paras[0].align === 'r', '编号的字靠右对齐到 1800（与细线同一终点）');
  // 同一行的标签、材料名、编号同一基线
  const baseline = (el, lang, role) => el.y + INSET + baseOff(lang, role, el.paras[0].lineHeight);
  const b0 = baseline(at(pg, '浅川橡'), 'zh', 'body');
  assert.ok(near(baseline(at(pg, '柜体'), 'zh', 'cap'), b0) && near(baseline(codes.find((c) => textOf(c) === 'AG273'), 'en', 'cap'), b0), '标签 / 名称 / 编号同一基线');
});

test('图文页：方图 / 竖图占满高，右栏起在网格上（图右 54），文字栏最多 5 栏、靠右边线；4:3 图用第 10 栏', () => {
  const p = sample('bi');
  const kitchen = p.slides.find((s) => s.id === 'v-kitchen');
  const dining = p.slides.find((s) => s.id === 'v-dining');
  const sq = bViewPlate(ctxOf(p, 'bi'), { ...kitchen, image: '/square.jpg' });
  const im = imgs(sq)[0];
  assert.deepEqual([im.w, im.h], [colX(8) - 54, 1080], '方图：图宽 1060，右栏从第 8 栏（1114）起');
  const label = at(sq, '一楼　厨房');
  assert.ok(near(label.x + INSET, colX(8)));
  // 材料表也只到 5 栏宽（不拉成半页宽）
  const rules = sq.els.filter((e) => e.t === 'rect' && e.h === 1);
  assert.ok(rules.every((r) => r.x === colX(8) && r.x + r.w === 1800), '材料表 1114–1800');
  // 两条说明并排、同一顶线；各 331 宽
  const notes = texts(sq).filter((e) => /notes\.\d\.text$/.test(e.edit?.field || ''));
  assert.equal(notes.length, 2);
  assert.equal(notes[0].y, notes[1].y, '右栏够宽：两条说明并排，同一顶线');
  assert.ok(notes.every((n) => near(n.w - 2 * INSET, (spanW(5) - 24) / 2)));
  assert.deepEqual(sq.warnings, []);
  // 只有一条说明：占满整栏宽
  const one = bViewPlate(ctxOf(p, 'bi'), { ...dining, image: '/square.jpg' });
  const single = texts(one).filter((e) => /notes\.0\.text$/.test(e.edit?.field || ''));
  assert.ok(single.length && single.every((n) => near(n.w - 2 * INSET, spanW(5))), '一条说明用整栏宽，不折无谓的行');
  // 竖图：图 776 宽（第 6 栏前 54），文字栏仍从 1114 起、靠右
  const pt = bViewPlate(ctxOf(p, 'bi'), { ...kitchen, image: '/portrait.jpg' });
  assert.equal(imgs(pt)[0].w, colX(6) - 54);
  assert.ok(near(at(pt, '一楼　厨房').x + INSET, colX(8)));
  // 4:3：图 1344 × 1080，右栏第 10 栏
  const e43 = imgs(bViewPlate(ctxOf(p, 'bi'), { ...kitchen, image: '/entry.jpg' }))[0];
  assert.deepEqual([e43.w, e43.h], [1344, 1080]);
});

test('图文页：说明放得下几条放几条 —— 图下放前面几条，其余进右栏；单独一条长说明放宽到整个图宽', () => {
  const p = sample('en');
  const kitchen = p.slides.find((s) => s.id === 'v-kitchen');
  const longN = '岛台一侧做开放格，放常用的碗碟，另一侧是两个大抽屉，抽屉里分格放锅具与保鲜盒。';
  p.translations[longN] = 'Open shelves on one side of the island hold everyday bowls and plates; on the other, two deep drawers are divided for pans and food boxes.';
  const pg = bViewPlate(ctxOf(p, 'en'), { ...kitchen, notes: [{ label: '灯光', text: '吊柜底部嵌 LED 灯带' }, { label: '收纳', text: '转角拉篮，调味品抽屉' }, { label: '', text: longN }] });
  const n = (i) => texts(pg).find((e) => e.edit?.field === `notes.${i}.textEn`);
  assert.ok(n(0) && n(1) && n(2), '三条都印出来');
  assert.ok(n(0).x < 1344 && n(1).x < 1344 && n(0).y === n(1).y, '前两条在图下并排');
  assert.ok(near(n(2).x + INSET, 1398), '长的那条进右栏');
  assert.deepEqual(pg.warnings, []);
  // 一条长说明：图下 5 栏放不下就放宽，不丢
  const q = sample('bi');
  const longNote = '餐边柜嵌进墙里，与墙面齐平；开放格里放日常用的器物，下面是两个大抽屉，抽屉里分格放餐具与桌布。';
  q.translations[longNote] = 'The sideboard is set into the wall and sits flush with it; open shelves hold everyday pieces, with two deep drawers below for cutlery and table linen.';
  const one = bViewPlate(ctxOf(q, 'bi'), { ...q.slides.find((s) => s.id === 'v-dining'), notes: [{ label: '', text: longNote }] });
  const els = texts(one).filter((e) => /^notes\.0/.test(e.edit?.field || ''));
  assert.equal(els.length, 2, '中、英都印出来');
  assert.ok(els.every((e) => e.x < 1344 && e.w - 2 * INSET > spanW(5)), '放宽到 6 栏 / 图宽');
  assert.deepEqual(one.warnings, []);
});

test('图文页：标题长也不少印材料 —— 标题每种语言最多 2 行，再长就降成正文字号并提醒；材料多时先把标题往上挪', () => {
  const p = sample('bi');
  const dining = p.slides.find((s) => s.id === 'v-dining');
  const longTitle = '面向花园的开放式餐厅与厨房，岛台连着餐桌';
  p.translations[longTitle] = 'An open dining room and kitchen facing the garden, the island joined to the table';
  const pg = bViewPlate(ctxOf(p, 'bi'), { ...dining, subtitle: longTitle });
  const rows = texts(pg).filter((e) => /^materials\.\d$/.test(e.edit?.field || '') && CJK.test(textOf(e)));
  assert.equal(rows.length, 3, '三行材料都在');
  assert.match(pg.warnings.join(' '), /视角名太长：已缩小一级/);
  assert.doesNotMatch(pg.warnings.join(' '), /材料太多/);
  const t = texts(pg).find((e) => e.edit?.field === 'title');
  assert.equal(t.paras[0].runs[0].size, texts(pg).find((e) => textOf(e) === '浅川橡').paras[0].runs[0].size, '降成正文字号');
  assert.equal(textOf(t), '面向花园的开放式餐厅\n与厨房，岛台连着餐桌', '中文断在「与」前');
  // 标题不长、是 6 行材料占了地方：材料一行不少，提醒说清原因
  const many = ['m-white', 'm-stone', 'm-oak', 'm-oak', 'm-walnut', 'm-trav'].map((m, i) => ({ role: ['柜体', '台面', '吊柜', '柜门', '柜体 & 柜门', '背景墙'][i], materialId: m }));
  const six = bViewPlate(ctxOf(p, 'bi'), { ...dining, notes: [], materials: many });
  assert.equal(texts(six).filter((e) => /^materials\.\d$/.test(e.edit?.field || '') && CJK.test(textOf(e))).length, 6);
  assert.match(six.warnings.join(' '), /材料较多，视角名已缩小一级/);
  // 单语言放得下就仍是 head，挂在 200 或往上挪
  const en6 = bViewPlate(ctxOf(p, 'en'), { ...dining, notes: [], materials: many });
  assert.deepEqual(en6.warnings, []);
});

test('图文页：整套共用一个标签栏宽（材料名左边线不跳），最宽 142；更长的标签在栏里折行', () => {
  const p = sample('en');
  const xOfValue = (id) => {
    const pg = bViewPlate(ctxOf(p, 'en'), p.slides.find((s) => s.id === id));
    return texts(pg).find((e) => e.edit?.field === 'materials.0.nameEn' || e.edit?.field === 'materials.0').x + INSET;
  };
  const xs = ['v-entry', 'v-living', 'v-dining', 'v-tea'].map(xOfValue);
  assert.equal(new Set(xs).size, 1, `材料名左边线：${xs.join(', ')}`);
  assert.ok(near(xs[0], 1398 + 142), '标签栏到第 11 栏（142），不再更宽');
  const living = bViewPlate(ctxOf(p, 'en'), p.slides.find((s) => s.id === 'v-living'));
  const parts = texts(living).filter((e) => e.edit?.field === 'materials.0.roleEn').map(textOf);
  assert.deepEqual(parts, ['Carcass', '& Doors'], 'Carcass & Doors 在 130 宽的标签栏里折成两行（断在 & 前）');
  // 华文版：只有短标签时用样张的 96
  const z = sample('zh');
  z.slides = z.slides.filter((s) => s.id !== 'v-living');
  const zp = bViewPlate(ctxOf(z, 'zh'), z.slides.find((s) => s.id === 'v-dining'));
  assert.ok(near(at(zp, '浅川橡').x + INSET, 1398 + 96));
});

test('图文页：「隐形门 · Hidden door」这类标签 —— 设计师在英文里另填过（翻译记忆）就用填的', () => {
  const p = sample('en');
  const v = p.slides.find((s) => s.id === 'v-living');
  assert.ok(at(bViewPlate(ctxOf(p, 'en'), v), 'Hidden door'));
  p.translations['隐形门 · Hidden door'] = 'Concealed door';
  const pg = bViewPlate(ctxOf(p, 'en'), v);
  assert.ok(at(pg, 'Concealed door') && !at(pg, 'Hidden door'));
  const bi = bViewPlate(ctxOf(p, 'bi'), v);
  assert.ok(at(bi, '隐形门') && at(bi, 'Concealed door'));
  assert.ok(!allText(bViewPlate(ctxOf(p, 'zh'), v)).includes('Hidden'), '华文版只印中文');
});

// ---------------------------------------------------------------------------
// 均衡断行
// ---------------------------------------------------------------------------

test('均衡断行：两行长短接近；中文断在词与词之间（与 / 的），标点不放行首；「·」不留在行尾', () => {
  const p = sample('en');
  const pg = bViewPlate(ctxOf(p, 'en'), p.slides.find((s) => s.id === 'v-dining'));
  assert.equal(textOf(texts(pg).find((e) => e.edit?.field === 'subtitleEn')), 'Open to\nthe Garden');
  // 中文：一样均衡时断在「与」前、「的」后
  assert.equal(balanceLine('屋顶花园与露台', 'zh', 'display', 402), '屋顶花园\n与露台');
  assert.equal(balanceLine('开放式厨房与早餐台', 'zh', 'head', 402), '开放式厨房\n与早餐台');
  assert.equal(balanceLine('主人房衣帽间与梳妆台', 'zh', 'head', 402), '主人房衣帽间\n与梳妆台');
  assert.equal(balanceLine('客厅电视墙与展示柜', 'zh', 'head', 402), '客厅电视墙\n与展示柜');
  for (const t of ['面向花园的开放式餐厅与厨房，岛台连着餐桌', '餐边柜嵌进墙里，与墙面齐平；开放格里放日常用的器物']) {
    for (const w of [260, 402, 686]) for (const line of balanceLine(t, 'zh', 'body', w).split('\n')) assert.ok(!/^[，。、；：！？）]/.test(line), `标点不在行首：${line}`);
  }
  // 「·」：断在它后面时去掉，不留在行尾
  const s = balanceLine('Sintered Stone · Taj Mahal', 'en', 'body', 200);
  assert.equal(s, 'Sintered Stone\nTaj Mahal');
  // 英文：均衡优先（样张 p6 的断法），虚词前断只在一样均衡时才优先
  assert.equal(balanceLine('A dining room open to the garden', 'en', 'head', 402), 'A dining room\nopen to the garden');
  // 行尾不留冠词
  const shelves = balanceLine('Open shelves on one side of the island for everyday bowls and plates; two deep drawers on the other.', 'en', 'body', 402);
  for (const line of shelves.split('\n')) assert.ok(!/\b(the|a|an)$/i.test(line), `行尾是冠词：${line}`);
});

// ---------------------------------------------------------------------------
// 本案材料（样张 p4）
// ---------------------------------------------------------------------------

test('本案材料：一排时撑满版心（1–2 种 686、3 种 544、4 种 402、5 种 = 样张 p4 的 312、6 种 260），挂在页眉下 64，说明落在 984', () => {
  const p = sample('bi');
  const ctx = ctxOf(p, 'bi');
  const ms = p.materials.map((m) => ({ ...m, image: m.image || '/mat-oak.jpg' }));
  const expect = {
    1: [[120], 686], 2: [[120, 830], 686], 3: [[120, 688, 1256], 544], 4: [[120, 546, 972, 1398], 402],
    5: [[120, 462, 804, 1146, 1488], 312], 6: [[120, 404, 688, 972, 1256, 1540], 260],
  };
  for (const [n, [xs, w]] of Object.entries(expect)) {
    const pg = bMaterials(ctx, ms.slice(0, Number(n)), 0, 1);
    const ps = plates(pg);
    assert.deepEqual(ps.map((e) => e.x), xs, `${n} 种：x`);
    assert.ok(ps.every((e) => e.w === w), `${n} 种：宽 ${w}`);
    assert.ok(ps.every((e) => e.y === 280), `${n} 种：小样挂在 280（页眉 216 + 64，与样张 p4 一致）`);
    const last = Math.max(...texts(pg).filter((e) => e.y > 300).map((e) => e.y + e.h - INSET));
    assert.ok(near(last, 984), `${n} 种：最长的说明落在 984（${last}）`);
    assert.ok(ps.every((e) => e.h / e.w <= 2.7 + 1e-9 && e.h <= 690), `${n} 种：不放大超过 1.15 倍`);
    assert.deepEqual(pg.warnings, []);
  }
  // 说明的字与小样左边对齐
  const pg = bMaterials(ctx, ms.slice(0, 5), 0, 1);
  assert.ok(near(at(pg, '浅川橡').x + INSET, 120));
  // 说明文字中性（不写死「板材、石材与五金」）
  assert.doesNotMatch(allText(pg), /五金|hardware/);
});

test('本案材料：7–12 种两排、上下均分（7 = 4 + 3，9 = 5 + 4，11 = 6 + 5），两排小样一样高；分页时每页同一格子、同一高度', () => {
  const p = sample('bi');
  const ctx = ctxOf(p, 'bi');
  const mats = Array.from({ length: 14 }, (_, i) => ({ id: `m${i}`, name: `材料${i}`, code: `AG${200 + i}`, image: '/mat-oak.jpg' }));
  const rowsOf = (pg) => {
    const ys = new Map();
    for (const e of plates(pg)) ys.set(e.y, (ys.get(e.y) || 0) + 1);
    return [...ys.values()];
  };
  for (const [n, rows] of [[7, [4, 3]], [8, [4, 4]], [9, [5, 4]], [10, [5, 5]], [11, [6, 5]], [12, [6, 6]]]) {
    const pg = bMaterials(ctx, mats.slice(0, n), 0, 1);
    assert.deepEqual(rowsOf(pg), rows, `${n} 种`);
    assert.equal(new Set(plates(pg).map((e) => e.h)).size, 1, `${n} 种：两排一样高`);
    assert.ok(near(Math.max(...texts(pg).map((e) => e.y + e.h - INSET)), 984), `${n} 种：落在 984`);
  }
  // 13 种分两页（7 + 6）：两页的小样一样大、行的位置一样
  const p1 = bMaterials(ctx, mats.slice(0, 7), 0, 2, 7);
  const p2 = bMaterials(ctx, mats.slice(7, 13), 1, 2, 7);
  const geo = (pg) => [...new Set(plates(pg).map((e) => `${e.y}/${e.w}/${e.h}`))];
  assert.deepEqual(geo(p2), geo(p1));
  assert.match(allText(p2), /本案材料（续）\nMaterials, continued/);
  // 续页只有一排：仍按两排的格子（不在页面中间放一排孤零零的大小样）
  const p3 = bMaterials(ctx, mats.slice(0, 3), 1, 2, 7);
  assert.equal(plates(p3)[0].y, plates(p1)[0].y);
  assert.equal(plates(p3)[0].h, plates(p1)[0].h);
});

test('本案材料：原图不够大时退一档（只在退了就清楚时）；本来就太小的图单独提醒，不拖累整页；没有图 = 小样底色 + 细线框', () => {
  const p = sample('bi');
  const ctx = ctxOf(p, 'bi');
  const four = bMaterials(ctx, [{ id: 'm4', name: '小样', code: 'X4', image: '/sw-400.jpg' }, p.materials[0]], 0, 1);
  assert.ok(plates(four).every((e) => e.w === 402), '400 px 的图：686 会发虚 → 退到 402（清楚）');
  assert.deepEqual(four.warnings, []);
  const tiny = bMaterials(ctx, [{ id: 'mx', name: '小样', code: 'X1', image: '/sw-small.jpg' }, ...p.materials.slice(0, 2)], 0, 1);
  assert.ok(plates(tiny).every((e) => e.w === 544), '200 px 的图退到哪档都发虚 → 保持 544，单独提醒');
  assert.match(tiny.warnings.join(' '), /材料「小样」的图片像素偏低/);
  assert.ok(plates(tiny).every((e) => e.h > 400), '其它小样照常高');
  const noImg = bMaterials(ctx, [p.materials[5]], 0, 1);
  assert.ok(noImg.els.some((e) => e.t === 'rect' && e.fill === B.sample) && noImg.els.filter((e) => e.t === 'rect' && e.fill === B.hair).length === 4);
  // 名称：中文、英文、编号（编号只一次）
  const s = allText(bMaterials(ctx, p.materials.slice(0, 2), 0, 1));
  assert.match(s, /浅川橡/);
  assert.match(s, /Light Oak/);
  assert.equal(s.match(/AG273/g).length, 1);
});

// ---------------------------------------------------------------------------
// 满版 / 图文的分配
// ---------------------------------------------------------------------------

test('planViews：设定的照设定；自动 = 横图且不丢东西才满版；同空间下一页覆盖材料时第一张可满版；立体图图文；不连续 3 页满版', () => {
  const p = sample('bi');
  const plan = planViews(p, meta);
  assert.equal(plan.size, 9);
  assert.equal(plan.get('v-tv'), 'full', '没有材料、没有说明的横图 → 满版');
  for (const id of ['v-entry', 'v-living', 'v-dining', 'v-kitchen', 'v-bed', 'v-vanity', 'v-wine', 'v-tea']) assert.equal(plan.get(id), 'plate', id);

  // 同空间：第一张的材料被下一张覆盖、没有说明 → 满版
  const q = sample('bi');
  const bed = q.slides.find((s) => s.id === 'v-bed');
  bed.materials = [{ role: '床头板', materialId: 'm-walnut' }];
  assert.equal(planViews(q, meta).get('v-bed'), 'full');
  bed.notes = [{ label: '', text: '床头灯藏在板后' }];
  assert.equal(planViews(q, meta).get('v-bed'), 'plate', '有说明 → 图文');
  bed.notes = [];
  q.slides.find((s) => s.id === 'v-vanity').layout = 'full';
  assert.equal(planViews(q, meta).get('v-bed'), 'plate', '下一页是满版就不算覆盖');

  // 设定、立体图、竖图
  const r = sample('bi');
  r.slides.find((s) => s.id === 'v-tv').layout = 'framed';
  r.slides.find((s) => s.id === 'v-kitchen').layout = 'full';
  assert.equal(planViews(r, meta).get('v-tv'), 'plate');
  assert.equal(planViews(r, meta).get('v-kitchen'), 'full');
  const t = sample('bi');
  Object.assign(t.slides.find((s) => s.id === 'v-tv'), { tag: '3d' });
  assert.equal(planViews(t, meta).get('v-tv'), 'plate');
  Object.assign(t.slides.find((s) => s.id === 'v-tv'), { tag: undefined, image: '/entry.jpg' });
  assert.equal(planViews(t, meta).get('v-tv'), 'plate', '4:3 不够横 → 图文');
  assert.equal(planViews(t, () => null).get('v-tv'), 'plate', '不知道尺寸 → 图文');

  // 连续：4 张都能满版 → 第 3 张改图文
  const u = sample('bi');
  const bare = (id, room) => ({ id, kind: 'view', enabled: true, floorId: 'f1', layout: 'auto', image: '/living.jpg', room, subtitle: '', materials: [], notes: [] });
  u.slides = [bare('a', '客厅'), bare('b', '餐厅'), bare('c', '厨房'), bare('d', '书房'), { id: 'fl', kind: 'floor', floorId: 'f2', enabled: true }, bare('e', '主人房'), bare('f', '茶室')];
  const up = planViews(u, meta);
  assert.deepEqual(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => up.get(id)), ['full', 'full', 'plate', 'full', 'full', 'full']);
  // 第 3 张是设定的满版 → 改前面自动的那张
  u.slides[2].layout = 'full';
  const up2 = planViews(u, meta);
  assert.deepEqual(['a', 'b', 'c', 'd'].map((id) => up2.get(id)), ['full', 'plate', 'full', 'full']);
  // 关掉的页不算连续
  const v = sample('bi');
  v.slides = [bare('a', '客厅'), { ...bare('x', '玄关'), enabled: false, materials: [{ role: '柜体', materialId: 'm-oak' }] }, bare('b', '餐厅'), bare('c', '厨房')];
  const vp = planViews(v, meta);
  assert.deepEqual(['a', 'b', 'c'].map((id) => vp.get(id)), ['full', 'full', 'plate']);
});

test('bViewPage：按 plan 分派；没给 plan 时自己算', () => {
  const p = sample('bi');
  const ctx = ctxOf(p, 'bi');
  const tv = p.slides.find((s) => s.id === 'v-tv');
  assert.equal(texts(bViewPage(ctx, tv)).length, 0);
  assert.ok(texts(bViewPage(ctx, tv, new Map([[tv.id, 'plate']]))).length > 0);
});

// ---------------------------------------------------------------------------
// 复核修正：长编号、材料分页、水印、立体图标签、两排团队、章节编号、提醒说清是哪一栏
// ---------------------------------------------------------------------------

const LONG = { id: 'm-long', name: '意大利进口超白岩板（哑光）', code: 'LAMINAM-CALCE-BIANCO-12MM', image: '/mat-stone.jpg' };

test('长编号（带品牌前缀）不挤掉名称：另起一行、靠右，所有材料行都印出来；太长才提醒', () => {
  for (const lang of LANGS) {
    const p = sample(lang);
    p.materials = [...p.materials, LONG, { id: 'm-egger', name: '暖白橡', code: 'EGGER H1145 ST10', image: '/mat-oak.jpg' }];
    p.translations = { ...TRANSLATIONS, [LONG.name]: 'Italian Ultra-White Sintered Stone (Matt)', 暖白橡: 'Warm White Oak' };
    const kitchen = p.slides.find((s) => s.id === 'v-kitchen');
    const v = { ...kitchen, notes: [], materials: [{ role: '台面', materialId: 'm-long' }, { role: '柜体', materialId: 'm-egger' }, ...kitchen.materials.slice(0, 2)] };
    const pg = bViewPlate(ctxOf(p, lang), v);
    checkPage(`${lang} 长编号图文页`, pg);
    // 名称一栏（左对齐的字）至少留 60%：不再被编号挤成一个字一行（靠右的是编号，本来就窄）
    for (const el of texts(pg).filter((e) => e.paras[0].align !== 'r' && /^materials\.\d+(\.nameEn)?$/.test(e.edit?.field || ''))) {
      assert.ok(el.w - 2 * INSET >= 0.6 * (402 - 142), `${lang}: 「${textOf(el)}」的框只有 ${(el.w - 2 * INSET).toFixed(0)} 宽`);
    }
    const rows = new Set(texts(pg).map((e) => e.edit?.field).filter((f) => /^materials\.\d+$/.test(f || '')));
    assert.equal(rows.size, 4, `${lang}: 4 行材料都印出来`);
    assert.ok(!pg.warnings.some((w) => /材料太多|材料表放不下/.test(w)), pg.warnings.join(' / '));
    assert.ok(pg.warnings.some((w) => /^材料编号太长：「LAMINAM-CALCE-BIANCO-12MM」/.test(w)), '26 字的编号要折行：提醒');
    assert.ok(!pg.warnings.some((w) => /EGGER/.test(w)), '16 字的编号另起一行就放得下：不提醒');
    // 编号另起一行、靠右（与短编号同一条右边线）
    const code = texts(pg).find((e) => /EGGER H1145 ST10/.test(textOf(e)));
    assert.equal(code.paras[0].align, 'r');
    assert.ok(near(code.x + code.w - INSET, 1800, 0.5));
    // 中英版 5 行（两行带长编号）确实放不下：说清楚是第几项起没印，而不是「材料太多」
    if (lang === 'bi') {
      const five = bViewPlate(ctxOf(p, lang), { ...v, materials: [...v.materials, kitchen.materials[2]] });
      assert.ok(five.warnings.includes('材料表放不下：第 5 项起没有印出来 —— 建议精简名称或拆成两页'), five.warnings.join(' / '));
    }
    // 材料页：小样不被挤扁
    const mp = bMaterials(ctxOf(p, lang), p.materials, 0, 1);
    checkPage(`${lang} 长编号材料页`, mp);
    for (const pl of plates(mp)) assert.ok(pl.h >= 150, `${lang}: 小样只有 ${pl.h} 高`);
  }
});

test('材料分页：名称 / 编号正常时和以前一样（12 种一页、两排均分）；说明把两排的小样挤扁时改成一页一排', () => {
  const mats = (n, long = false) => Array.from({ length: n }, (_, i) => (long && i % 2 ? { ...LONG, id: `L${i}` } : { id: `m${i}`, name: '浅川橡', code: `AG${200 + i}`, image: '/mat-oak.jpg' }));
  for (const lang of LANGS) {
    const ctx = ctxOf(sample(lang), lang);
    assert.deepEqual(materialSlices(ctx, mats(7)).map((s) => [s.mats.length, s.rows]), [[7, 2]]);
    assert.deepEqual(materialSlices(ctx, mats(14)).map((s) => [s.mats.length, s.rows]), [[7, 2], [7, 2]]);
    assert.deepEqual(materialSlices(ctx, mats(30)).map((s) => s.mats.length), [10, 10, 10]);
  }
  const p = sample('bi');
  p.translations = { ...TRANSLATIONS, [LONG.name]: 'Italian Ultra-White Sintered Stone (Matt)' };
  const ctx = ctxOf(p, 'bi');
  const slices = materialSlices(ctx, mats(12, true));
  assert.ok(slices.every((s) => s.rows === 1 && s.mats.length <= 6), JSON.stringify(slices.map((s) => [s.mats.length, s.rows])));
  slices.forEach((s, i) => {
    const pg = bMaterials(ctx, s.mats, i, slices.length, s.perPage, s.rows);
    checkPage(`bi 长名称材料页 ${i + 1}`, pg);
    for (const pl of plates(pg)) assert.ok(pl.h >= 0.6 * pl.w, `小样 ${pl.w}×${pl.h} 被挤扁`);
  });
});

test('满版大图要裁得掉右下角的水印：像素不够（16:9 约 1845 宽以下）自动排成图文；设定满版就提醒', () => {
  const p = sample('zh');
  const mk = (id, image) => ({ id, kind: 'view', enabled: true, floorId: 'f2', layout: 'auto', image, room: `测试${id}`, roomEn: '', subtitle: '', materials: [], notes: [] });
  p.slides = [...p.slides, mk('w17', '/r1700.jpg'), { ...mk('sep1', '/entry.jpg'), notes: [{ label: '', text: 'x' }] }, mk('w18', '/r1800.jpg'), { ...mk('sep2', '/entry.jpg'), notes: [{ label: '', text: 'x' }] }, mk('w19', '/r1920.jpg')];
  const plan = planViews(p, meta);
  assert.equal(plan.get('w17'), 'plate');
  assert.equal(plan.get('w18'), 'plate');
  assert.equal(plan.get('w19'), 'full');
  const ctx = ctxOf(p, 'zh');
  const forced = bViewFull(ctx, { ...mk('w18', '/r1800.jpg'), layout: 'full' });
  assert.ok(forced.warnings.some((w) => /水印会露出来.*改用「图文」/.test(w)), forced.warnings.join(' / '));
  assert.ok(!bViewFull(ctx, mk('w19', '/r1920.jpg')).warnings.some((w) => /水印/.test(w)));
  // 图文页的图小一些：1800 宽的图裁得够，不提醒
  const plate = bViewPlate(ctx, mk('w18', '/r1800.jpg'));
  assert.ok(!plate.warnings.some((w) => /水印/.test(w)));
  assert.ok(imgs(plate)[0].crop.b >= 0.095 - 1e-6);
});

test('AI 立体图页（图文）：标签只写一次楼层，不印「一楼　一楼」；默认标题有英文（3D Overview / 3D View）', () => {
  for (const lang of LANGS) {
    const p = sample(lang);
    p.floors = [...p.floors, { id: 'floor-all', zh: '全屋', en: 'WHOLE HOME' }];
    const d1 = { id: 'd1', kind: 'view', enabled: true, tag: '3d', floorId: 'f1', layout: 'framed', image: '/living.jpg', room: '一楼', roomEn: '3D OVERVIEW', subtitle: '全屋立体图', materials: [], notes: [] };
    const d2 = { ...d1, id: 'd2', floorId: 'floor-all', room: '全屋', subtitle: '立体图' };
    const a = bViewPlate(ctxOf(p, lang), d1);
    const b = bViewPlate(ctxOf(p, lang), d2);
    checkPage(`${lang} 立体图`, a);
    assert.doesNotMatch(allText(a), /一楼　一楼|全屋　全屋/);
    assert.doesNotMatch(allText(b), /全屋　全屋/);
    if (lang !== 'zh') {
      assert.match(allText(a), /Ground Floor\n|Ground Floor$/m);
      assert.match(allText(a), /3D Overview/);
      assert.match(allText(b), /3D View/);
      assert.equal(ctxOf(p, lang).tr.misses.length, 0);
    }
  }
});

test('团队 7–12 位排两排（上排多一位），两排同一套栏、下排落在 984、都不重叠；12 位以上才提醒', () => {
  for (const lang of LANGS) {
    for (const n of [7, 9, 12]) {
      const p = sample(lang);
      p.info.team = Array.from({ length: n }, (_, i) => ({ name: `Name ${i + 1}`, role: '方案设计师' }));
      const pg = bTeam(ctxOf(p, lang));
      checkPage(`${lang} 团队 ${n}`, pg);
      const names = texts(pg).filter((e) => /^team\.\d+\.name$/.test(e.edit?.field || ''));
      assert.equal(names.length, n);
      assert.deepEqual(pg.warnings, []);
      const xs = [...new Set(names.map((e) => e.x))];
      assert.equal(xs.length, Math.ceil(n / 2), '两排同一套栏');
      const lastBottom = Math.max(...names.map((e) => e.y + e.h - INSET));
      assert.ok(near(lastBottom, 984, 0.5), `下排落在 984：${lastBottom}`);
    }
  }
});

test('方案封面的章节标签跟着整套的章节编号（隐藏了品牌 / 公司 → 第一章）', () => {
  const p = sample('bi');
  const pg = bDesignCover({ ...ctxOf(p, 'bi'), chapters: { list: ['design', 'service'], num: { brand: 1, company: 1, design: 1, service: 2 } } });
  assert.match(allText(pg), /第一章　方案/);
  assert.match(allText(pg), /Chapter One — Design/);
});

test('提醒说清是哪一栏：第几条说明（只有标签时是标签）、标题是空间名还是视角名、中文还是英文', () => {
  const p = sample('bi');
  const ctx = ctxOf(p, 'bi');
  const tea = p.slides.find((s) => s.id === 'v-tea');
  const portrait = { ...tea, image: '/entry.jpg', materials: [] };
  const long = '这是一段非常非常长的说明，'.repeat(30);
  assert.ok(bViewPlate(ctx, { ...portrait, notes: [{ label: '', text: '' }, { label: '', text: long }] }).warnings.includes('说明太长（第 2 条）：建议精简或拆页'));
  assert.ok(bViewPlate(ctx, { ...portrait, notes: [{ label: '说明', text: '' }, { label: long, text: '' }] }).warnings.includes('说明太长（第 2 条的标签）：建议精简或拆页'));
  const w = (s) => bViewPlate(ctx, { ...portrait, notes: [], ...s }).warnings.join(' | ');
  assert.match(w({ subtitle: '', room: '主人房衣帽间与化妆区及步入式储物空间连通阳台', roomEn: 'Dressing' }), /^空间名太长/);
  assert.match(w({ subtitle: '', room: '主人房', roomEn: 'Master Bedroom Walk-In Wardrobe, Dressing Area and Reading Corner by the Window' }), /空间英文名太长/);
  assert.match(w({ subtitle: '这是一个非常非常长的视角名称用来测试标题过长的情况' }), /视角名太长/);
});
