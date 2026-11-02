// C 安然 · 方案页（src/engine/b/design.js）：三种语言都排得出来；C 的版面规则（字在画布与版心里、互不重叠、不压在效果图上，
// 白字压图必须有托字渐变、照片不加色层、放大不超过 1.15 倍、纸面栏不留大空洞、方案页只用溪岸的 logo 与签名）；
// English 版没有中文、中英版两种文字都有；可编辑字段；提醒（缺图 / 像素低 / 放不下）；满版 / 图文的分配、水印取景、材料分页
import assert from 'node:assert/strict';
import { test } from './harness.mjs';
import {
  bDesignCover, bFloor, bViewFull, bViewPlate, bMaterials, bTeam, planViews, bViewPage, balanceLine, floorPageImage, materialSlices, WM_WARN, TEAM_MAX,
} from '../src/engine/b/design.js';
import { B, INSET, PAGE, LOGOS, ALPHA, luminance, shade, inkBox, maxGap } from '../src/engine/b/kit.js';
import { PHOTOS } from '../src/engine/b/company.js';
import { makeTranslator } from '../src/engine/lang.js';
import { fixForWarning } from '../src/components/editor/ops.js';

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
for (const p of Object.values(PHOTOS)) SIZES[p.src] = [p.nat.w, p.nat.h];
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
const runOf = (el) => el.paras[0].runs[0];
/** 文字框去掉内边距 = 字的范围（x0 = 字的左边） */
const contentBox = (el) => ({ x0: el.x + INSET, y0: el.y + INSET, x1: el.x + el.w - INSET, y1: el.y + el.h - INSET });
const boxOf = (el) => ({ x0: el.x, y0: el.y, x1: el.x + el.w, y1: el.y + el.h });
const overlap = (a, b, tol = 0.5) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > tol && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > tol;
const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;
/** 字的左边 / 顶（坐标在元素里四舍五入到 0.1） */
const nearX = (a, b) => near(a, b, 0.1);
/** 裁切后的画面里还看得见右下角的水印吗（原稿量到：离右边 0.206 × 高或对角线的 10%、离底边 0.094 × 高） */
const wmVisible = (im, nat = meta(im.src)) => {
  const l = 1 - Math.max(0.206 * nat.h, 0.101 * Math.hypot(nat.w, nat.h)) / nat.w;
  return 1 - im.crop.r > l && 1 - im.crop.b > 1 - 0.094;
};
const LOGO_SRC = new Map(Object.entries(LOGOS).map(([k, v]) => [v.src, k]));
const isLogo = (e) => e.t === 'img' && LOGO_SRC.has(e.src);
const isSig = (e) => e.name === 'signature';
/** 照片 / 效果图 / Board / 材料小样（不含 logo）；缺图的米色占位也算照片位 */
const photos = (pg) => pg.els.filter((e) => (e.t === 'img' && !isLogo(e)) || (e.t === 'rect' && e.fill === B.sample));
const plates = (pg) => pg.els.filter((e) => (e.t === 'img' && /^material:/.test(e.edit?.field || '')) || (e.t === 'rect' && e.fill === B.sample));
const lightText = (el) => el.paras.some((p) => p.runs.some((r) => luminance(r.color) > 0.5));
/** 原图放大到页面的倍数（不知道原图尺寸 = 1） */
function scaleOf(im) {
  const nat = im.nat || meta(im.src);
  if (!nat?.w) return 1;
  if (!im.crop) return Math.max(im.w / nat.w, im.h / nat.h);
  return im.w / ((1 - im.crop.l - im.crop.r) * nat.w);
}
const C_FONTS = new Set(['ogg', 'oggM', 'songXL', 'songL', 'song', 'songM', 'songSB', 'hosL', 'hos', 'hosM', 'outfitL', 'outfit', 'outfitM']);
const PAPER_HOLE = 260; // SPEC「文字栏不要有超过约 250px 的空洞」

/**
 * 纸面栏里最大的竖向空洞：照片贴左（x = 0）→ 栏 = 照片右边到页边；照片贴右 → 栏 = 页边到照片左边；没有半版照片 = null
 * 栏里的东西：文字、细线、logo；从页标题的行顶（92）量到签名（944）
 */
function paperHole(pg) {
  const ph = photos(pg).filter((e) => e.w > 400);
  const left = ph.filter((e) => e.x <= 0.5);
  const right = ph.filter((e) => e.x + e.w >= PAGE.W - 0.5 && e.x > 0.5);
  let x0;
  let x1;
  if (left.length) [x0, x1] = [Math.max(...left.map((e) => e.x + e.w)), PAGE.W];
  else if (right.length) [x0, x1] = [0, Math.min(...right.map((e) => e.x))];
  else return null;
  if (x1 - x0 < 200) return null; // 满版 / 通栏：没有纸面栏
  const parts = pg.els
    .filter((e) => (e.t === 'text' || e.t === 'rect' || isLogo(e)) && !photos(pg).includes(e))
    .map((e) => (e.t === 'text' ? contentBox(e) : boxOf(e)))
    .filter((b) => b.x1 > x0 && b.x0 < x1)
    .map((b) => ({ top: b.y0, bottom: b.y1 }));
  return maxGap(parts, PAGE.top, PAGE.sigTop);
}

/**
 * C 安然的版面规则（每一页都要过）
 * @param {{ hole?:boolean }} opts  hole = 量纸面栏的空洞（主样本、常见情况；极端压力测试关掉）
 */
function checkPage(name, pg, opts = {}) {
  assert.equal(pg.bg, B.paper, `${name}: 纸面底色 F3EEE7`);
  assert.ok(Array.isArray(pg.els) && Array.isArray(pg.warnings), `${name}: { bg, els, warnings }`);
  const ts = texts(pg);
  const ph = photos(pg);
  const blurry = pg.warnings.some((w) => /像素偏低/.test(w));
  // 字：画布里、版心里（112–1810；内容排到 900，签名在 944 / 982）、C 的字体
  for (const el of ts) {
    const c = contentBox(el);
    assert.ok(el.x >= -0.5 && el.y >= -0.5 && el.x + el.w <= PAGE.W + 0.5 && el.y + el.h <= PAGE.H + 0.5, `${name}: 文字超出画布 「${textOf(el)}」`);
    for (const p of el.paras) for (const r of p.runs) assert.ok(C_FONTS.has(r.font), `${name}: 不是 C 安然的字体角色 ${r.font}「${textOf(el)}」`);
    if (isSig(el)) {
      assert.ok(c.y0 >= PAGE.sigTop - 0.5, `${name}: 签名在 944 以下`);
      continue;
    }
    // 满版页左下角的说明（楼层　空间 / 材料）：和签名同一条底（1004），在左半边，不伸到签名那边
    if (el.name === 'caption') {
      assert.ok(c.y1 <= 1004 + 1 && c.y0 >= 840 && c.x0 >= PAGE.leftWide - 0.5 && c.x1 <= 1300 + 3, `${name}: 左下角的说明出界 「${textOf(el)}」`);
      continue;
    }
    assert.ok(c.x0 >= PAGE.left - 0.5 && c.x1 <= PAGE.right + 3, `${name}: 文字不在左右版心里 「${textOf(el)}」 ${c.x0}–${c.x1}`);
    assert.ok(c.y0 >= PAGE.top - 0.5 && c.y1 <= PAGE.contentBottom + 0.5, `${name}: 文字不在 92–900 里 「${textOf(el)}」 ${c.y0}–${c.y1}`);
  }
  for (let i = 0; i < ts.length; i++) {
    for (let j = i + 1; j < ts.length; j++) {
      assert.ok(!overlap(contentBox(ts[i]), contentBox(ts[j])), `${name}: 文字重叠 「${textOf(ts[i])}」 × 「${textOf(ts[j])}」`);
    }
  }
  // 托字渐变：只有 1C1915、最深 45%、不留硬边（两头要么到照片边、要么渐变到 0）
  const shades = pg.els.filter((e) => e.t === 'rect' && e.grad);
  for (const g of shades) {
    assert.ok(g.grad.stops.every((st) => st.color === B.shade && st.alpha <= ALPHA.shadeMax + 1e-9), `${name}: 托字渐变只能是 1C1915、最深 45%`);
  }
  // 字压在照片上：必须是浅色字（白 / 米白），下面有最深的托字渐变（看不到设计师换的照片：按最深的 45% 托）
  for (const el of ts) {
    const c = contentBox(el);
    for (const im of ph) {
      if (!overlap(c, boxOf(im))) continue;
      assert.ok(lightText(el), `${name}: 深色字压在照片上 「${textOf(el)}」`);
      const under = shades.filter((g) => overlap(boxOf(g), c) && g.x <= c.x0 + 0.5 && g.x + g.w >= c.x1 - 0.5 && g.y <= c.y0 + 0.5 && g.y + g.h >= c.y1 - 0.5);
      assert.ok(under.some((g) => Math.max(...g.grad.stops.map((st) => st.alpha)) >= ALPHA.shadeMax - 1e-9), `${name}: 白字压在照片上却没有托字渐变 「${textOf(el)}」`);
    }
    for (const lg of imgs(pg).filter(isLogo)) assert.ok(!overlap(c, boxOf(lg)), `${name}: 文字压在 logo 上 「${textOf(el)}」`);
  }
  // 照片不加色层：盖在照片上的只能是托字渐变（而且下面真有白字）
  for (const r of pg.els.filter((e) => e.t === 'rect' && e.w > 4 && e.h > 4 && e.fill !== B.sample)) {
    for (const im of ph) {
      if (!overlap(boxOf(r), boxOf(im))) continue;
      const isShade = !!r.grad && ts.some((el) => lightText(el) && overlap(contentBox(el), boxOf(r)));
      assert.ok(isShade, `${name}: 照片上不加色层（${r.fill || 'grad'} ${r.alpha ?? 1}）`);
    }
  }
  // 照片：裁切不变形、放大不超过 1.15 倍（超过就要有「像素偏低」的提醒）
  for (const im of imgs(pg)) {
    if (im.crop) {
      const { l, t, r, b } = im.crop;
      for (const v of [l, t, r, b]) assert.ok(v >= 0 && v < 1, `${name}: 裁切比例 ${JSON.stringify(im.crop)}`);
      const nat = meta(im.src);
      if (nat) assert.ok(Math.abs(((1 - l - r) * nat.w) / ((1 - t - b) * nat.h) - im.w / im.h) < 0.01, `${name}: 裁切后不变形`);
    }
    if (!isLogo(im) && !blurry) assert.ok(scaleOf(im) <= 1.15 + 1e-3, `${name}: ${im.src} 放大 ${scaleOf(im).toFixed(2)} 倍（超过 1.15）却没有提醒`);
  }
  // 品牌：方案页属于溪岸 —— 只用溪岸 logo（纸面上深色）、溪岸签名；不出现瑞吉欧的商标和字
  const logos = imgs(pg).filter(isLogo);
  for (const lg of logos) assert.ok(/^sail/.test(LOGO_SRC.get(lg.src)), `${name}: 方案页出现了瑞吉欧的商标 ${lg.src}`);
  for (const lg of logos) if (!ph.some((im) => overlap(boxOf(lg), boxOf(im)))) assert.equal(LOGO_SRC.get(lg.src), 'sailInk', `${name}: 纸面上用深色 logo`);
  assert.ok(!/瑞吉欧|RICCIONE/i.test(allText(pg)), `${name}: 方案页出现了瑞吉欧`);
  const fullBleed = ph.some((im) => im.w >= PAGE.W - 0.5 && im.h >= PAGE.H - 0.5);
  if (ts.length) {
    assert.equal(logos.length, 1, `${name}: 一个溪岸 logo`);
    // 溪岸签名：华文 / 中英版中英两行；English 版只留英文一行（English 版整页没有中文，见下面「English 版」那条）
    // 满版效果图上不放签名（右下角常是亮的沙发、地面，托不住）—— 品牌由右上角的白 logo 表达
    const sig = ts.filter(isSig).map(textOf);
    assert.ok(
      JSON.stringify(sig) === JSON.stringify(['自然栖居 · 生活回归', 'LIVING NATURALLY']) || JSON.stringify(sig) === JSON.stringify(['LIVING NATURALLY']) || (fullBleed && !sig.length),
      `${name}: 溪岸签名 ${JSON.stringify(sig)}`,
    );
  } else {
    assert.equal(logos.length, 0, `${name}: 满版效果图只有图`);
  }
  // 页面撑满：纸面栏里没有超过约 250px 的空洞
  if (opts.hole !== false) {
    const hole = paperHole(pg);
    if (hole) assert.ok(hole.gap <= PAPER_HOLE, `${name}: 纸面栏空洞 ${Math.round(hole.gap)}px（${Math.round(hole.from)}–${Math.round(hole.to)}）`);
  }
}

// ---------------------------------------------------------------------------
// 每种页 × 三种语言
// ---------------------------------------------------------------------------

test('三种语言：每种方案页都排得出来，过 C 的版面规则（版心、不重叠、不压图、不加色层、≤ 1.15 倍、只用溪岸品牌、纸面栏不空）', () => {
  for (const lang of LANGS) {
    const pages = renderAll(sample(lang), lang);
    assert.equal(pages.length, 14, `${lang}: 14 页（封面、材料、2 个楼层、9 张效果图、团队）`);
    for (const { name, page } of pages) checkPage(name, page);
    for (const { name, page } of pages) assert.deepEqual(page.warnings, [], `${name}: 默认样本没有提醒`);
  }
});

test('checkPage 抓得到退化：色层、白字无托字、深色字压图、放大超过 1.15 倍、瑞吉欧商标、纸面栏空洞、文字重叠、出版心', () => {
  const p = sample('bi');
  const good = bViewPlate(ctxOf(p, 'bi'), p.slides.find((s) => s.id === 'v-dining'));
  checkPage('原样', good);
  const im = imgs(good).find((e) => e.edit?.field === 'image');
  const mutate = (fn) => ({ ...good, els: fn(good.els.map((e) => ({ ...e }))) });
  // 1. 照片上盖 7B593D 色层
  assert.throws(() => checkPage('色层', mutate((els) => [...els, { t: 'rect', x: im.x, y: im.y, w: im.w, h: im.h, fill: B.title, alpha: 0.3 }])), /色层/);
  // 2. 白字直接压在效果图上
  const white = { t: 'text', x: 200, y: im.y + 100, w: 400, h: 70, nowrap: true, paras: [{ align: 'l', lineHeight: 64, runs: [{ text: '白字', font: 'songSB', size: 36, color: B.white, spacing: 2 }] }] };
  assert.throws(() => checkPage('白字无托字', mutate((els) => [...els, white])), /托字渐变/);
  // …加上 kit.shade() 的托字渐变就过（渐变放在字下面）
  const sh = shade(inkBox({ x0: white.x + INSET, x1: white.x + white.w - INSET, top: white.y + INSET, bottom: white.y + white.h - INSET }), { x: im.x, y: im.y, w: im.w, h: im.h });
  checkPage('白字有托字', mutate((els) => [...els, sh.el, white]));
  // …托字太浅（30%）不算
  const thin = { ...sh.el, grad: { ...sh.el.grad, stops: sh.el.grad.stops.map((st) => ({ ...st, alpha: Math.min(st.alpha, 0.3) })) } };
  assert.throws(() => checkPage('托字太浅', mutate((els) => [...els, thin, white])), /托字渐变/);
  // 3. 深色字压图
  assert.throws(() => checkPage('深色字压图', mutate((els) => [...els, { ...white, paras: [{ ...white.paras[0], runs: [{ ...white.paras[0].runs[0], color: B.title }] }] }])), /深色字压在照片上/);
  // 4. 放大超过 1.15 倍、没有提醒
  assert.throws(() => checkPage('放大', mutate((els) => els.map((e) => (e === undefined || e.edit?.field !== 'image' ? e : { ...e, crop: { l: 0.3, r: 0.3, t: 0.3 * (e.crop.t + e.crop.b) / 0.6, b: 0.3 * (e.crop.t + e.crop.b) / 0.6 } })))), /1\.15|不变形/);
  // 5. 方案页换成瑞吉欧商标
  assert.throws(() => checkPage('瑞吉欧商标', mutate((els) => els.map((e) => (isLogo(e) ? { ...e, src: LOGOS.riccioneColor.src } : e)))), /瑞吉欧/);
  // 6. 纸面栏只剩「楼层　空间」一行：下面一大片空纸
  assert.throws(() => checkPage('空洞', mutate((els) => els.filter((e) => !(e.x > im.x + im.w && e.y > 400 && e.y < 900)))), /空洞/);
  // 7. 两段字叠在一起
  const t0 = texts(good).find((e) => !isSig(e));
  assert.throws(() => checkPage('重叠', mutate((els) => [...els, { ...t0, edit: undefined }])), /重叠/);
  // 8. 字排出版心（贴到页边）
  assert.throws(() => checkPage('出版心', mutate((els) => els.map((e) => (e === undefined || textOf(e) !== textOf(t0) ? e : { ...e, x: 20 })))), /版心|压在/);
});

test('边界情况也过 C 的规则：长标题、长说明、8 行材料、竖图 / 方图、没有图、没有翻译、1–12 种材料、分页、14 个空间、团队 5 / 7 位', () => {
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
      'empty column': bViewPlate(ctx, { ...kitchen, materials: [], notes: [] }),
      'empty column portrait': bViewPlate(ctx, { ...kitchen, image: '/portrait.jpg', materials: [], notes: [] }),
      'full no image': bViewFull(ctx, { ...kitchen, image: null }),
      'materials 0': bMaterials(ctx, [], 0, 1),
      'materials page 2/2': bMaterials(ctx, twelve.slice(0, 5), 1, 2, 7),
    };
    for (let n = 1; n <= 12; n++) cases[`materials ${n}`] = bMaterials(ctx, twelve.slice(0, n), 0, 1);
    const stress = new Set(['many materials', 'many materials + notes', 'long notes', 'portrait', 'no image', 'materials page 2/2']);
    for (const [k, pg] of Object.entries(cases)) checkPage(`${lang} ${k}`, pg, { hole: !stress.has(k) });

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

test('English 版：翻译齐全时整页没有中文（签名也只留英文一行，和公司页、封面的竖排签名一致）', () => {
  for (const { name, page } of renderAll(sample('en'), 'en')) {
    const s = texts(page).map(textOf).join('\n');
    assert.ok(!CJK.test(s), `${name}: 还有中文 ${s.split('\n').filter((l) => CJK.test(l)).join(' / ')}`);
  }
});

test('中英版：每页（满版图除外）都有中文也有英文；华文版除了大写的英文页眉（Aman 的做法）没有英文正文', () => {
  for (const { name, page, slide } of renderAll(sample('bi'), 'bi')) {
    if (!texts(page).length) {
      assert.equal(slide.kind, 'view', `${name}: 只有满版图可以没有字`);
      continue;
    }
    const s = texts(page).filter((e) => !isSig(e)).map(textOf).join('\n');
    const full = photos(page).some((im) => im.w >= PAGE.W - 0.5 && im.h >= PAGE.H - 0.5);
    if (!full) assert.deepEqual(texts(page).filter(isSig).map(textOf), ['自然栖居 · 生活回归', 'LIVING NATURALLY'], `${name}: 中英版签名中英两行`);
    assert.ok(CJK.test(s), `${name}: 没有中文`);
    assert.ok(/[A-Za-z]{3}/.test(s.replace(/[A-Z]{2}\d+/g, '')), `${name}: 没有英文`);
  }
  for (const { name, page } of renderAll(sample('zh'), 'zh')) {
    // 英文页眉：Ogg 全大写（装饰性）；其余的字里不该有英文句子
    const body = texts(page).filter((e) => !isSig(e) && !(/^ogg/.test(runOf(e).font) && textOf(e) === textOf(e).toUpperCase()));
    const words = body
      .map(textOf)
      .join('\n')
      .replace(/[A-Z]{2}\d{2,}/g, '') // 材料编号
      .replace(/Mr Lau|Muar|MR LAU|MUAR|Sheerly|Wei Jie|Ah Seng|Mandy|KTV|LED/g, '');
    assert.ok(!/[a-z]{3}/i.test(words), `${name}: 华文版出现英文 ${words}`);
  }
});

test('中英版：英文正文与中文一样大（说明、空间清单、团队的一句话），英文紧跟在中文下面、同一左边线', () => {
  const p = sample('bi');
  const pg = bViewPlate(ctxOf(p, 'bi'), p.slides.find((s) => s.id === 'v-dining'));
  const zhNote = texts(pg).find((e) => e.edit?.field === 'notes.0.text');
  const enNote = texts(pg).find((e) => e.edit?.field === 'notes.0.textEn');
  assert.ok(zhNote && enNote);
  assert.equal(textOf(enNote).replace(/\n/g, ' '), 'Full-height glass brings in the garden light', '英文完整、不截短');
  assert.equal(runOf(zhNote).size, runOf(enNote).size, '说明中英同大（18pt）');
  assert.equal(zhNote.x, enNote.x, '同一左边线');
  assert.ok(enNote.y > zhNote.y && enNote.y - (zhNote.y + zhNote.h) < 12, '英文紧跟中文');
  // 标题：英文大写 Ogg 42pt 在上、中文思源宋体 36pt 在下（Aman 的页眉）
  const enTitle = at(pg, 'OPEN TO THE GARDEN');
  const zhTitle = at(pg, '面向花园');
  assert.ok(enTitle && zhTitle && enTitle.y < zhTitle.y);
  assert.deepEqual([runOf(enTitle).font, runOf(enTitle).size, runOf(zhTitle).font, runOf(zhTitle).size], ['ogg', 42, 'songSB', 36]);
  assert.ok(nearX(enTitle.x + INSET, PAGE.left) && nearX(enTitle.y + INSET, PAGE.top), '页眉在 (112, 92)');
  // 楼层页的空间清单：中文一栏、英文一栏，一样大
  const fl = bFloor(ctxOf(p, 'bi'), p.slides.find((s) => s.id === 's-f1'));
  assert.equal(runOf(at(fl, '玄关')).size, runOf(at(fl, 'Entrance')).size);
  assert.equal(at(fl, '玄关').y, at(fl, 'Entrance').y, '同一行');
  // 团队页的一句话
  const tm = bTeam(ctxOf(p, 'bi'));
  assert.equal(runOf(at(tm, '从方案到交付，一个团队全程陪伴。')).size, runOf(at(tm, 'One team beside you, from design to delivery.')).size);
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
  for (const el of plate.els) if ((el.t === 'text' && !isSig(el)) || (el.t === 'img' && !isLogo(el))) assert.ok(el.edit?.field, `图文页的「${textOf(el) || el.src}」没有 edit 字段`);
  const tea = bViewPlate(ctx, p.slides.find((s) => s.id === 'v-tea'));
  assert.ok(fieldsOf(tea).has('floor') && fieldsOf(tea).has('room') && fieldsOf(tea).has('roomEn'), '没有视角名：标题 = 空间（room / roomEn），标签 = 楼层');

  const en = bViewPlate(ctxOf(p, 'en'), p.slides.find((s) => s.id === 'v-living'));
  assert.ok(fieldsOf(en).has('subtitleEn') && fieldsOf(en).has('notes.0.textEn') && fieldsOf(en).has('materials.0.nameEn') && fieldsOf(en).has('materials.0.roleEn'));
  assert.ok(!fieldsOf(en).has('title'), 'English 版的标题指向英文字段');

  // 满版（Aman 第 9 页的满版带标题）：视角名、左下「楼层　空间」、材料、图都点得回输入框
  const full = bViewFull(ctx, p.slides.find((s) => s.id === 'v-tv'));
  for (const f of ['image', 'title', 'subtitleEn', 'room', 'roomEn']) assert.ok(fieldsOf(full).has(f), `满版缺 ${f}`);
  const fullEntry = bViewFull(ctx, p.slides.find((s) => s.id === 'v-entry'));
  for (const f of ['materials.0', 'materials.0.role', 'materials.0.roleEn', 'materials.0.nameEn', 'materials.1']) assert.ok(fieldsOf(fullEntry).has(f), `满版缺 ${f}`);
  for (const pg of [full, fullEntry]) for (const el of texts(pg)) if (!isSig(el)) assert.ok(el.edit?.field, `满版的「${textOf(el)}」没有 edit 字段`);

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
// 效果图取景：水印留在画外、不放大发虚、不加色层
// ---------------------------------------------------------------------------

test('效果图取景：从顶部起、左右居中，底部至少裁掉 9.5%（右下角水印不进画面）；放大不超过 1.15 倍；Board 整张不裁', () => {
  const p = sample('bi');
  const ctx = ctxOf(p, 'bi');
  const full = imgs(bViewFull(ctx, p.slides.find((s) => s.id === 'v-tv')))[0];
  assert.deepEqual([full.x, full.y, full.w, full.h], [0, 0, 1920, 1080]);
  assert.ok(full.crop.t === 0 && full.crop.b >= 0.095 - 1e-6, `16:9 满版：底部裁掉 ${full.crop.b}`);
  assert.ok(near(full.crop.l, full.crop.r, 1e-6), '左右居中');
  assert.ok(near((1080 / 1350) / (1 - full.crop.b), 0.884, 0.01), '约放大到 88%');
  for (const id of ['v-entry', 'v-dining', 'v-kitchen', 'v-bed']) {
    const im = imgs(bViewPlate(ctx, p.slides.find((s) => s.id === id))).find((e) => e.edit?.field === 'image');
    assert.ok(im.crop.b >= 0.095 - 1e-6 && im.crop.t <= im.crop.b + 1e-6, `${id}: 底部至少裁 9.5%`);
    assert.ok(scaleOf(im) <= 1.15, `${id}: 放大 ${scaleOf(im)}`);
  }
  // 楼层页：一张效果图的局部（原图右边不到 60%），贴左、上下贴边（1050 × 1080）；右边带着水印 → 底部裁掉 9.5%，不放大超过 1.0 倍
  const fl = imgs(bFloor(ctx, p.slides.find((s) => s.id === 's-f1'))).find((e) => e.edit?.field === 'image');
  assert.equal(fl.src, '/kitchen.jpg');
  assert.deepEqual([fl.x, fl.y, fl.w, fl.h], [0, 0, 1050, 1080]);
  assert.ok(fl.crop.r === 0 && 1 - fl.crop.l <= 0.6 + 1e-6, `楼层页：只取右边一段 ${JSON.stringify(fl.crop)}`);
  assert.ok(fl.crop.t === 0 && fl.crop.b >= 0.095 - 1e-6 && !wmVisible(fl), '水印裁在画外');
  assert.ok(scaleOf(fl) <= 1 + 1e-6, `楼层页的局部不放大：${scaleOf(fl)}`);
  // 原图不够大：不为了躲水印再放大（16:9 的小图原样铺满，不裁）
  const tiny = imgs(bViewFull(ctx, { ...p.slides.find((s) => s.id === 'v-tv'), image: '/tiny-wide.jpg' }))[0];
  assert.deepEqual(tiny.crop, { l: 0, t: 0, r: 0, b: 0 }, '已经放大发虚的图不再放大');
  // 竖图铺满宽框：上下要裁得多时上下平分（不全裁在底部）
  const tall = imgs(bViewFull(ctx, { ...p.slides.find((s) => s.id === 'v-tv'), image: '/portrait.jpg' }))[0];
  assert.ok(near(tall.crop.t, tall.crop.b, 1e-6) && tall.crop.b > 0.095);
  // Material Board 不裁
  const board = imgs(bDesignCover(ctx)).find((e) => e.edit?.field === 'cover.image');
  assert.equal(board.fit, 'contain');
  assert.ok(!board.crop);
});

// ---------------------------------------------------------------------------
// 团队
// ---------------------------------------------------------------------------

test('团队页：溪岸照片半版贴左；纸面栏 页眉 · 一句话 · 名单（售后表的样子：职位在左、名字在右，行间 7B593D 50% 细线）', () => {
  const p = sample('bi');
  p.info.team = [{ name: 'Sheerly', role: '方案设计师' }, { name: '王伟杰', role: '深化设计师' }, { name: 'Ah Seng', role: '项目经理' }];
  const pg = bTeam(ctxOf(p, 'bi'));
  checkPage('团队 3', pg);
  // 照片：溪岸的照片（品牌分开），半版贴左、上下贴边，不放大超过 1.15 倍
  const ph = photos(pg)[0];
  assert.deepEqual([ph.x, ph.y, ph.h], [0, 0, 1080]);
  assert.ok(ph.w >= 820 && ph.w <= 1050, `半版照片宽 ${ph.w}`);
  assert.equal(Object.values(PHOTOS).find((x) => x.src === ph.src)?.brand, 'sail', '团队页只用溪岸的照片');
  // 页眉
  assert.match(allText(pg), /^PROJECT\nTEAM\n本案团队/);
  const names = texts(pg).filter((e) => /\.name$/.test(e.edit?.field || ''));
  const roles = texts(pg).filter((e) => /\.role$/.test(e.edit?.field || ''));
  assert.equal(names.length, 3);
  assert.deepEqual(names.map((n) => runOf(n).font), ['ogg', 'songSB', 'ogg'], '拉丁字母的名字用 Ogg，中文名用思源宋体');
  assert.ok(new Set(roles.map((r) => r.x)).size === 1 && new Set(names.map((n) => n.x)).size === 1, '职位一栏、名字一栏');
  assert.ok(names[0].x > roles[0].x + 200, '名字在职位右边');
  roles.forEach((r, i) => assert.ok(Math.abs(r.y - names[i].y) < 12, '职位和名字同一行'));
  const rules = pg.els.filter((e) => e.t === 'rect' && e.h <= 2 && e.alpha === ALPHA.tableRule);
  assert.equal(rules.length, 4, '三位 = 四条细线');
  assert.ok(rules.every((r) => r.fill === B.rule && nearX(r.x, roles[0].x + INSET) && nearX(r.x + r.w, PAGE.right)), '细线跨整栏，到 1810');
  const bottom = Math.max(...rules.map((r) => r.y));
  assert.ok(bottom <= PAGE.contentBottom, '名单排到 900 为止');

  // 6 位、有长名字：仍是一栏；字不重叠（checkPage）
  p.info.team = [
    { name: 'Sheerly', role: '方案设计师' }, { name: '王伟杰', role: '深化设计师' }, { name: 'Ah Seng', role: '项目经理' },
    { name: 'Mandy Tan Mei Ling', role: '销售' }, { name: 'Kelvin', role: '店长' }, { name: 'Ahmad bin Abdullah', role: '安装主管' },
  ];
  const six = bTeam(ctxOf(p, 'bi'));
  checkPage('团队 6', six);
  assert.equal(new Set(texts(six).filter((e) => /\.name$/.test(e.edit?.field || '')).map((e) => e.x)).size, 1, '6 位一栏');
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
  assert.equal(pg.els.filter((e) => e.t === 'rect' && e.alpha === ALPHA.tableRule).length, 3, '两位 = 三条细线');

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
  checkPage('团队 1 位', pg);
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
  const longRoom = (i) => `第${i}号主人房衣帽间与化妆区`;
  floorP.slides = [{ id: 'fx', kind: 'floor', floorId: 'f1', enabled: true }, ...Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, kind: 'view', enabled: true, floorId: 'f1', image: null, room: longRoom(i), subtitle: '', materials: [], notes: [] }))];
  const many = bFloor(ctxOf(floorP, 'bi'), floorP.slides[0]);
  assert.match(w(many), /本层空间太多，楼层页只显示了 \d+ \/ 30 个/);
  checkPage('楼层 30 个空间', many, { hole: false });
  floorP.slides = [floorP.slides[0]];
  assert.match(w(bFloor(ctxOf(floorP, 'bi'), floorP.slides[0])), /这一层还没有效果图页：楼层章节页后面没有内容/);
  // 有效果图页、但都没有图：纯纸面的排版章节页（大字 + 空间清单），不画占位色块、不提醒
  floorP.slides = [floorP.slides[0], { id: 'r0', kind: 'view', enabled: true, floorId: 'f1', image: null, room: '客厅', subtitle: '', materials: [], notes: [] }];
  const typo = bFloor(ctxOf(floorP, 'bi'), floorP.slides[0]);
  assert.doesNotMatch(w(typo), /没有背景图/);
  assert.equal(photos(typo).length, 0, '不画占位色块');
  checkPage('楼层 排版章节页', typo);
  assert.ok(at(typo, 'GROUND FLOOR') && at(typo, '一楼') && at(typo, '客厅'));
  // 这一层的效果图都隐藏了：提醒把楼层页也隐藏（不再只说没有背景图）
  floorP.slides[1] = { ...floorP.slides[1], enabled: false };
  const hiddenFloor = w(bFloor(ctxOf(floorP, 'bi'), floorP.slides[0]));
  assert.match(hiddenFloor, /这一层的效果图都隐藏了/);
  assert.doesNotMatch(hiddenFloor, /没有背景图/);

  const teamP = sample('bi');
  teamP.info.team = Array.from({ length: 13 }, (_, i) => ({ name: `Name ${i}`, role: '设计师' }));
  assert.match(w(bTeam(ctxOf(teamP, 'bi'))), /只显示了前 12 位/);
  assert.equal(TEAM_MAX, 12);

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

test('方案封面：没有 Material Board 返回 null；竖版 Board 整张贴右、上下贴边（不裁）；左栏 logo · DESIGN / 第三章　方案 · 客户 · 楼层 · 签名', () => {
  const p = sample('bi');
  assert.equal(bDesignCover(ctxOf({ ...p, cover: { image: null } }, 'bi')), null);
  const pg = bDesignCover(ctxOf(p, 'bi'));
  checkPage('封面', pg);
  const board = imgs(pg).find((e) => e.edit?.field === 'cover.image');
  assert.equal(board.fit, 'contain');
  assert.ok(Math.abs(board.w / board.h - 1800 / 2400) < 0.01, '框与 Board 同比例：一点不裁');
  assert.deepEqual([board.x + board.w, board.y, board.h], [1920, 0, 1080], '贴右、上下贴边');
  const s = allText(pg);
  assert.match(s, /DESIGN\n第三章　方案/);
  assert.match(s, /MR LAU\nMUAR/, '客户名 Ogg 全大写，客户、地点各一行');
  assert.match(s, /一楼与二楼\nGROUND & FIRST FLOOR/);
  const name = texts(pg).find((e) => e.edit?.field === 'coverTitle');
  assert.deepEqual([runOf(name).font, runOf(name).size], ['ogg', 66], '短客户名用公司封面的字级（Ogg 66pt）');
  for (const el of texts(pg)) assert.ok(el.x + el.w - INSET <= board.x - 100 + 3, `文字在 Board 左边 100 以外：${textOf(el)}`);
  // logo 左上（纸面上深色），签名在左栏底下（Board 占了右下角）
  const lg = imgs(pg).find(isLogo);
  assert.deepEqual([lg.x, lg.y, LOGO_SRC.get(lg.src)], [PAGE.left, 84, 'sailInk']);
  assert.ok(texts(pg).filter(isSig).every((e) => nearX(e.x + INSET, PAGE.left)), '签名左对齐 112');

  // 横版 Board（16:9）：放在右边一整条深一级的色块（卡纸，上下贴边）里，四周留 60、上下居中，宽 1180；签名照样在左栏底下
  const wide = sample('en');
  wide.cover.image = '/board-wide.jpg';
  const wpg = bDesignCover(ctxOf(wide, 'en'));
  checkPage('封面 横版', wpg);
  const b2 = imgs(wpg).find((e) => e.edit?.field === 'cover.image');
  const band = wpg.els.find((e) => e.t === 'rect' && e.name === 'band');
  assert.deepEqual([b2.x + b2.w, b2.w], [1860, 1180]);
  assert.deepEqual([band.x, band.y, band.x + band.w, band.h, band.fill], [b2.x - 60, 0, 1920, 1080, B.sample], '色块上下贴边、到右边，Board 左右各留 60');
  assert.ok(near(b2.y + b2.h / 2, 540, 1), '上下居中');
  assert.ok(Math.abs(b2.w / b2.h - 2400 / 1350) < 0.01, '横版也一点不裁');
  assert.ok(texts(wpg).filter(isSig).every((e) => nearX(e.x + INSET, PAGE.left)), '签名在左栏底下');
});

test('方案封面 · 长客户名：客户名降一档（页标题的字级）、横版 Board 收窄，不截短、不提醒、每种语言不超过 4 行', () => {
  for (const lang of LANGS) {
    for (const [client, location] of [['Mr & Mrs Tan Wei Ming', 'Bukit Jalil, Kuala Lumpur'], ['刘先生与陈女士', '柔佛新山依斯干达公主城'], ['Dato’ Sri Haji Mohd Khairul Anuar', 'Seri Kembangan']]) {
      for (const img of ['/board-wide.jpg', '/board.jpg']) {
        const p = sample(lang);
        p.cover.image = img;
        Object.assign(p.info, { client, location });
        p.translations = { ...p.translations, 刘先生与陈女士: 'Mr Lau & Mrs Chen', 柔佛新山依斯干达公主城: 'Puteri Harbour, Iskandar, Johor Bahru' };
        const pg = bDesignCover(ctxOf(p, lang));
        checkPage(`${lang} 长客户名 ${img}`, pg);
        assert.ok(!pg.warnings.some((w) => /封面标题太长/.test(w)), `${lang} ${client}：${pg.warnings.join(' / ')}`);
        for (const el of texts(pg).filter((e) => /^coverTitle/.test(e.edit?.field || ''))) {
          const n = Math.round((el.h - 2 * INSET) / el.paras[0].lineHeight);
          assert.ok(n <= 4, `${lang} ${client}：标题一种语言折成 ${n} 行`);
          assert.ok(!el._cut, '不截短');
        }
      }
    }
  }
});

test('方案封面：自己改过的方案名没有英文时不拿通用英文顶替（记下缺英文）；默认方案名才配默认英文', () => {
  const p = sample('en');
  p.info.client = '';
  p.info.location = '';
  p.info.proposalTitle = '刘府全屋定制与软装方案';
  const ctx = ctxOf(p, 'en');
  const pg = bDesignCover(ctx);
  assert.doesNotMatch(allText(pg), /Whole-House Design Proposal/i);
  assert.ok(ctx.tr.misses.some((m) => m.zh === '刘府全屋定制与软装方案'), '记下缺英文（页面会提醒）');
  p.info.proposalTitle = '全屋定制设计方案';
  assert.match(allText(bDesignCover(ctxOf(p, 'en'))), /WHOLE-HOUSE\s+DESIGN PROPOSAL/);
});

test('方案封面的章节标签跟着整套的章节编号（隐藏了品牌 / 公司 → 第一章）', () => {
  const p = sample('bi');
  const chapters = { list: ['design', 'service'], num: { brand: 1, company: 1, design: 1, service: 2 } };
  assert.match(allText(bDesignCover({ ...ctxOf(p, 'bi'), chapters })), /DESIGN\n第一章　方案/);
  assert.match(allText(bDesignCover({ ...ctxOf(p, 'zh'), chapters })), /第一章　方案/);
  assert.doesNotMatch(allText(bDesignCover({ ...ctxOf(p, 'en'), chapters })), /第/);
});

// ---------------------------------------------------------------------------
// 楼层章节页（dirA2 p3 的版式：照片贴左、纸面栏大字 + 短线 + 一句话）
// ---------------------------------------------------------------------------

test('楼层章节页：效果图贴左（0–1050 满高），纸面栏 楼层名（英文大写 + 中文大字）· 短线 180 · 本层空间（启用、非立体图）', () => {
  const p = sample('bi');
  p.slides.push({ id: 'v3d', kind: 'view', enabled: true, floorId: 'f1', image: '/living.jpg', room: '全屋', subtitle: '立体图', tag: '3d', materials: [], notes: [] });
  p.slides.push({ id: 'voff', kind: 'view', enabled: false, floorId: 'f1', image: '/living.jpg', room: '储物间', subtitle: '', materials: [], notes: [] });
  const pg = bFloor(ctxOf(p, 'bi'), p.slides.find((s) => s.id === 's-f1'));
  checkPage('楼层', pg);
  const im = photos(pg)[0];
  assert.deepEqual([im.x, im.y, im.w, im.h], [0, 0, 1050, 1080]);
  const body = texts(pg).filter((e) => !isSig(e));
  assert.equal(body.map(textOf).join('\n'), 'GROUND FLOOR\n一楼\n玄关\nEntrance\n客厅\nLiving Area\n餐厅\nDining\n厨房\nKitchen');
  assert.ok(body.every((e) => e.x + INSET >= 1150 - 0.5), '纸面栏从 1150 起');
  assert.ok(nearX(body[0].x + INSET, 1150));
  assert.deepEqual([runOf(body[0]).font, runOf(body[0]).size, runOf(body[1]).font, runOf(body[1]).size], ['ogg', 42, 'songSB', 48], '中英版：英文 42pt + 中文 48pt（dirA2 p8 的金句）');
  const rule = pg.els.find((e) => e.t === 'rect' && e.w === 180);
  assert.ok(rule && rule.fill === B.rule && rule.alpha === ALPHA.rule && rule.y > body[1].y + body[1].h - INSET && rule.y < body[2].y, '短线在楼层名与空间清单之间');
  assert.doesNotMatch(allText(pg), /全屋|储物间/);
  // English：只有英文（Ogg 60pt 大写），空间是英文
  const en = bFloor(ctxOf(p, 'en'), p.slides.find((s) => s.id === 's-f2'));
  assert.equal(texts(en).filter((e) => !isSig(e)).map(textOf).join('\n'), 'FIRST\nFLOOR\nMaster Bedroom\nEntertainment Room\nTea Room');
  assert.equal(runOf(texts(en)[0]).size, 60);
  // 华文：英文大写页眉 + 中文 60pt
  const zh = bFloor(ctxOf(p, 'zh'), p.slides.find((s) => s.id === 's-f1'));
  assert.equal(runOf(at(zh, '一楼')).size, 60);
  assert.ok(at(zh, 'GROUND FLOOR'), '华文版也放英文大写页眉（楼层有英文名）');
});

test('楼层章节页的图：不和后面的页撞图 —— 不用紧接着的下一页、不用这一层的满版；取离楼层页最远的一张横图的局部；没有可用的图 = 排版章节页', () => {
  const p = sample('bi');
  const plan = planViews(p, meta);
  const f1 = p.slides.find((s) => s.id === 's-f1');
  const f2 = p.slides.find((s) => s.id === 's-f2');
  const src = (proj, sl) => photos(bFloor(ctxOf(proj, 'bi'), sl))[0]?.src;
  assert.equal(src(p, f1), '/kitchen.jpg', '一楼：下一页是玄关、电视柜是满版 → 图文里离楼层页最远的厨房');
  assert.equal(src(p, f2), '/vanity.jpg', '二楼：床头、茶室是满版，酒柜不够横（1.26）→ 衣柜与化妆台');
  assert.deepEqual(floorPageImage(p, f2, meta), { src: '/vanity.jpg', auto: true, part: true });
  // 楼层页的图不和这一层任何一页满版相同，也不和下一页相同
  for (const [fl, next] of [[f1, 'v-entry'], [f2, 'v-bed']]) {
    const used = src(p, fl);
    const fulls = p.slides.filter((s) => s.kind === 'view' && plan.get(s.id) === 'full').map((s) => s.image);
    assert.ok(!fulls.includes(used) && used !== p.slides.find((s) => s.id === next).image, `${fl.id}: ${used}`);
  }
  // 楼层自己选的图照用（除非就是下一页那张），这一页选的一定照用
  p.floors[0].image = '/entry.jpg';
  assert.equal(src(p, f1), '/kitchen.jpg');
  p.floors[0].image = '/dining.jpg';
  assert.equal(src(p, f1), '/dining.jpg');
  assert.deepEqual(floorPageImage(p, f1, meta), { src: '/dining.jpg', auto: false });
  assert.equal(src(p, { ...f1, image: '/entry.jpg' }), '/entry.jpg');
  // 这一层只有紧接着的那一张：不重复用它 —— 排版章节页（没有照片、没有占位色块）
  const q = sample('bi');
  q.slides = [{ id: 'fa', kind: 'floor', floorId: 'f1', enabled: true }, { id: 'va', kind: 'view', enabled: true, floorId: 'f1', image: '/kitchen.jpg', room: '厨房', subtitle: '', materials: [], notes: [] }];
  const typo = bFloor(ctxOf(q, 'bi'), q.slides[0]);
  assert.equal(photos(typo).length, 0);
  assert.deepEqual(floorPageImage(q, q.slides[0], meta), { src: null, auto: true });
  for (const lang of LANGS) checkPage(`${lang} 排版章节页`, bFloor(ctxOf(q, lang), q.slides[0]));
});

test('楼层章节页：楼层被删了也排得出来，并提醒；长楼层名降字号、断在虚词前，不截短；空间很多排成一段，不拆开一个空间名', () => {
  const p = sample('en');
  const pg = bFloor(ctxOf(p, 'en'), { id: 'fz', kind: 'floor', floorId: 'gone', enabled: true });
  assert.match(pg.warnings.join(' '), /楼层已被删除/);
  assert.ok(!CJK.test(texts(pg).filter((e) => !isSig(e)).map(textOf).join('')));
  checkPage('floor gone', pg, { hole: false });
  for (const lang of LANGS) {
    const q = sample(lang);
    q.floors[0] = { id: 'f1', zh: '屋顶花园与露台', en: 'ROOF GARDEN AND TERRACE', image: null };
    const fp = bFloor(ctxOf(q, lang), q.slides.find((x) => x.id === 's-f1'));
    checkPage(`${lang} 屋顶花园与露台`, fp);
    if (lang !== 'zh') assert.ok(at(fp, 'ROOF GARDEN\nAND TERRACE'), `${lang}: 英文断在 AND 前`);
    if (lang !== 'en') assert.ok(at(fp, '屋顶花园与露台'), `${lang}: 中文一行`);
    assert.ok(!fp.els.some((e) => e._cut));
  }
  // 14 个空间（有一个很长）：华文排两栏；中英版排成一段（「 · 」隔开）—— 都不把一个空间名拆到两行
  const r = sample('bi');
  const rooms = ['玄关', '客厅', '餐厅', '厨房', '主人房衣帽间与卫浴', '书房', '客房', '茶室', '洗衣房', '阳台', '储物间', '工人房', '露台', '车库'];
  r.slides = [{ id: 'fx', kind: 'floor', floorId: 'f1', enabled: true }, ...rooms.map((room, i) => ({ id: `vv${i}`, kind: 'view', enabled: true, floorId: 'f1', image: '/living.jpg', room, roomEn: '', subtitle: '', materials: [], notes: [] }))];
  for (const lang of ['zh', 'bi']) {
    const fp = bFloor(ctxOf(r, lang), r.slides[0]);
    checkPage(`${lang} 14 个空间`, fp);
    const flow = texts(fp).find((e) => !isSig(e) && textOf(e).includes(' · '));
    const listed = flow
      ? textOf(flow).split('\n').join(' · ').split(' · ')
      : texts(fp).filter((e) => !isSig(e) && runOf(e).font === 'hosM').map(textOf);
    assert.equal(!!flow, lang === 'bi', `${lang}: ${lang === 'bi' ? '排成一段' : '两栏'}`);
    assert.deepEqual(listed, rooms, `${lang}: 每个空间名都完整、按顺序`);
    assert.deepEqual(fp.warnings.filter((w) => /本层空间太多/.test(w)), []);
  }
});

// ---------------------------------------------------------------------------
// 图文页
// ---------------------------------------------------------------------------

test('图文页（横图）：页眉在 (112, 92)；效果图贴左、落到底（上边 = 页眉下 48）；右栏 楼层 · 空间 / 说明 / 材料表（售后表的样子），在栏里上下居中', () => {
  const p = sample('bi');
  const dining = p.slides.find((s) => s.id === 'v-dining');
  const pg = bViewPlate(ctxOf(p, 'bi'), dining);
  checkPage('图文', pg);
  const im = photos(pg)[0];
  const zhTitle = at(pg, '面向花园');
  assert.ok(near(im.y, Math.ceil(zhTitle.y + zhTitle.h - INSET + 48), 1), '图的上边 = 页眉下 48');
  assert.deepEqual([im.x, im.y + im.h], [0, 1080], '贴左、落到底');
  assert.equal(im.w, 1180, '横图的图文页照片统一 1180 宽（cover 裁切，翻页时栏位不跳）');
  const colX = PAGE.right - 537;
  assert.equal(colX, 1273);
  const left = (el) => el.x + INSET;
  assert.ok(nearX(left(at(pg, '一楼　餐厅')), colX) && nearX(left(at(pg, 'GROUND FLOOR — DINING')), colX), '右栏从图边再空 96');
  assert.ok(at(pg, '落地窗把花园的光带进来') && !allText(pg).includes('说明'), '笼统的标签（说明）不印');
  // 材料表：细线 7B593D × 50%，跨整栏；三行 = 四条
  const rules = pg.els.filter((e) => e.t === 'rect' && e.alpha === ALPHA.tableRule);
  assert.equal(rules.length, 4);
  assert.ok(rules.every((r) => nearX(r.x, colX) && nearX(r.x + r.w, PAGE.right)), '细线跨整栏、到 1810');
  // 项名在上（7B593D）、材料名在下（思源宋体 26pt，表格内容色），编号靠右、只印一次
  const key = at(pg, '柜体');
  const val = at(pg, '浅川橡');
  assert.ok(key.y < val.y && runOf(key).color === B.title && runOf(val).color === B.table, '项名在上（7B593D）、材料名在下（333333）');
  assert.ok(['songSB', 'hosM'].includes(runOf(val).font), '材料名：地方够用思源宋体 26pt（售后表），否则正文字号');
  const codes = texts(pg).filter((e) => /^AG\d+$/.test(textOf(e)));
  assert.equal(codes.length, 3);
  for (const c of codes) assert.ok(near(c.x + c.w - INSET, rules[0].x + rules[0].w, 3) && c.paras[0].align === 'r', '编号的字靠右对齐到细线的终点');
  // 规格栏从照片顶 + 24 起往下排（和照片顶对齐；剩下的地方大时略往下挪，上下的空纸都不超过 250）
  const colEls = texts(pg).filter((e) => !isSig(e) && left(e) >= colX - 0.5);
  const top = Math.min(...colEls.map((e) => contentBox(e).y0));
  const bottom = Math.max(...rules.map((r) => r.y + r.h));
  assert.ok(top >= im.y + 24 - 0.5 && (near(top, im.y + 24, 1) || PAGE.sigTop - bottom <= 240.5), `规格栏起点 ${top}（照片顶 ${im.y}）`);
  // 每张横图的图文页同一套栅格：照片 1180 宽、规格栏 x 1273（镜像页照片贴右、规格栏 x 112），起点都是照片顶 + 24
  const plan = planViews(p, meta);
  const plates = p.slides.filter((s) => s.kind === 'view' && plan.get(s.id) === 'plate');
  for (const s of plates) {
    const pp = bViewPage(ctxOf(p, 'bi'), s, plan);
    const ph = photos(pp).find((e) => e.edit?.field === 'image');
    const right = plan.side.get(s.id) === 'right';
    assert.equal(ph.w, 1180, s.id);
    assert.equal(ph.x, right ? 740 : 0, `${s.id}: ${right ? '镜像：照片贴右' : '照片贴左'}`);
    const cx = right ? PAGE.left : 1273;
    const eb = texts(pp).find((e) => /^(floor|room)$/.test(e.edit?.field || '') && contentBox(e).y0 > ph.y);
    assert.ok(nearX(left(eb), cx), `${s.id}: 规格栏 x ${left(eb)}`);
    // 镜像页的签名在纸面栏右下（不压在照片上）
    for (const sg of texts(pp).filter(isSig)) assert.ok(contentBox(sg).x1 <= ph.x - 40 || !right, `${s.id}: 签名压在照片上`);
  }
});

test('图文页：竖图 / 方图 = 半版照片贴左（宽 820–1050、上下贴边），页眉在纸面栏；4:3 照样在上面的页眉下面贴左落到底', () => {
  const p = sample('bi');
  const kitchen = p.slides.find((s) => s.id === 'v-kitchen');
  const pt = bViewPlate(ctxOf(p, 'bi'), { ...kitchen, image: '/portrait.jpg' });
  checkPage('竖图', pt);
  assert.deepEqual(['x', 'y', 'w', 'h'].map((k) => photos(pt)[0][k]), [0, 0, 820, 1080]);
  const ptHead = texts(pt).find((e) => e.edit?.field === 'subtitleEn');
  assert.ok(nearX(ptHead.x + INSET, 920) && nearX(ptHead.y + INSET, PAGE.top), '页眉在纸面栏 (920, 92)');
  assert.ok(nearX(at(pt, '一楼　厨房').x + INSET, 920));
  const dining = p.slides.find((s) => s.id === 'v-dining');
  const sq = bViewPlate(ctxOf(p, 'bi'), { ...dining, image: '/square.jpg' });
  checkPage('方图', sq);
  const s = photos(sq)[0];
  assert.ok(s.x === 0 && s.y === 0 && s.h === 1080 && s.w >= 820 && s.w <= 1050, `方图：半版（${s.w} 宽）、上下贴边`);
  assert.ok(nearX(texts(sq).find((e) => e.edit?.field === 'subtitleEn').x + INSET, s.w + 100), '页眉在纸面栏（照片边 + 100）');
  const sqEn = texts(sq).find((e) => e.edit?.field === 'subtitleEn');
  assert.equal(runOf(sqEn).size, 42, '页眉不降字号（照片收窄让给页眉）');
  assert.deepEqual(sq.warnings, []);
  // 右栏内容多（2 条说明 + 4 行材料，中英）：照片收窄（820–1050），说明、材料一样不少
  const sqk = bViewPlate(ctxOf(p, 'bi'), { ...kitchen, image: '/square.jpg' });
  checkPage('方图 内容多', sqk);
  const k = photos(sqk)[0];
  assert.ok(k.x === 0 && k.y === 0 && k.h === 1080 && k.w >= 820 && k.w < 1050, `收窄到 ${k.w}`);
  assert.deepEqual(sqk.warnings, []);
  const e43 = photos(bViewPlate(ctxOf(p, 'bi'), { ...kitchen, image: '/entry.jpg' }))[0];
  assert.ok(e43.w === 1180 && e43.y + e43.h === 1080 && e43.y > 0, '4:3：页眉下面、落到底（统一 1180 宽，cover 裁切）');
});

test('图文页：没有说明、没有材料（立体图页常这样）—— 照片上下贴边，纸面栏放章节页式的大标题 + 短线 + 楼层，不留一栏空纸', () => {
  for (const lang of LANGS) {
    const p = sample(lang);
    const tv = { ...p.slides.find((s) => s.id === 'v-tv'), layout: 'framed' };
    const pg = bViewPlate(ctxOf(p, lang), tv);
    checkPage(`${lang} 空栏`, pg);
    const im = photos(pg)[0];
    assert.deepEqual([im.x, im.y, im.h], [0, 0, 1080]);
    assert.ok(im.w >= 1200 && im.w <= 1340);
    assert.ok(pg.els.some((e) => e.t === 'rect' && e.w === 180), '短线');
    const title = texts(pg).find((e) => e.edit?.field === (lang === 'en' ? 'subtitleEn' : 'title'));
    assert.ok(runOf(title).size >= 42, '大标题');
    assert.deepEqual(pg.warnings, []);
  }
});

test('图文页：全景图按「放大不超过 1.15 倍」缩矮一点（仍落到底），不发虚、不提醒', () => {
  const sizes = { '/pano2000.jpg': [2000, 667] };
  const m2 = (src) => (sizes[src] ? { w: sizes[src][0], h: sizes[src][1] } : meta(src));
  const p = sample('zh');
  const tv = { ...p.slides.find((s) => s.id === 'v-tv'), image: '/pano2000.jpg', materials: [{ role: '柜体', materialId: 'm-oak' }] };
  const pg = bViewPlate({ ...ctxOf(p, 'zh'), meta: m2 }, tv);
  const im = photos(pg)[0];
  assert.ok(im.y + im.h === 1080 && im.h <= 667 * 1.15 + 1, `高 ${im.h}`);
  assert.deepEqual(pg.warnings, []);
});

test('图文页：说明、材料都印出来；内容多就收紧（正文字号、项名一栏），材料是事实 —— 先少印说明，不少印材料', () => {
  for (const lang of LANGS) {
    const p = sample(lang);
    const kitchen = p.slides.find((s) => s.id === 'v-kitchen');
    // 华文 / English：3 条说明 + 4 行材料；中英版（每样都是两行）：2 条说明 + 4 行材料
    const all3 = [{ label: '灯光', text: '吊柜底部嵌 LED 灯带' }, { label: '收纳', text: '转角拉篮，调味品抽屉' }, { label: '隐形门 · Hidden door', text: '液压闭门器，配反弹器' }];
    const notes = lang === 'bi' ? all3.slice(0, 2) : all3;
    const pg = bViewPlate(ctxOf(p, lang), { ...kitchen, notes });
    checkPage(`${lang} ${notes.length} 条说明 + 4 行材料`, pg);
    assert.deepEqual(pg.warnings, []);
    const f = fieldsOf(pg);
    for (let i = 0; i < 4; i++) assert.ok(f.has(`materials.${i}`), `${lang}: 第 ${i + 1} 行材料`);
    for (let i = 0; i < notes.length; i++) assert.ok(f.has(lang === 'en' ? `notes.${i}.textEn` : `notes.${i}.text`), `${lang}: 第 ${i + 1} 条说明`);
    // 说明太多：材料一行不少
    const six = Array.from({ length: 6 }, (_, i) => ({ label: `收纳${i}`, text: '转角拉篮，调味品抽屉，另一侧是两个大抽屉，抽屉里分格放锅具与保鲜盒。' }));
    const crowded = bViewPlate(ctxOf(p, lang), { ...kitchen, notes: six });
    for (let i = 0; i < 4; i++) assert.ok(fieldsOf(crowded).has(`materials.${i}`), `${lang}: 说明多时材料照样印`);
    assert.match(crowded.warnings.join(' '), /说明太多放不下/);
    checkPage(`${lang} 6 条说明`, crowded, { hole: false });
  }
});

test('图文页：视角名太长 —— 先降一级（章节页的字号），再截短；提醒说清是中文还是英文；材料一行不少', () => {
  const p = sample('bi');
  const dining = p.slides.find((s) => s.id === 'v-dining');
  const longTitle = '面向花园的开放式餐厅与厨房，岛台连着餐桌';
  p.translations[longTitle] = 'An open dining room and kitchen facing the garden, the island joined to the table';
  const pg = bViewPlate(ctxOf(p, 'bi'), { ...dining, subtitle: longTitle });
  checkPage('长视角名', pg);
  assert.equal(texts(pg).filter((e) => /^materials\.\d$/.test(e.edit?.field || '') && CJK.test(textOf(e))).length, 3, '三行材料都在');
  assert.match(pg.warnings.join(' '), /视角名的英文太长：已缩小一级/);
  const en = texts(pg).find((e) => e.edit?.field === 'subtitleEn');
  assert.equal(runOf(en).size, 30, '降到章节页的字号（Ogg 30pt）');
  // 6 行材料：一行不少，单语言没有提醒
  const many = ['m-white', 'm-stone', 'm-oak', 'm-oak', 'm-walnut', 'm-trav'].map((m, i) => ({ role: ['柜体', '台面', '吊柜', '柜门', '柜体 & 柜门', '背景墙'][i], materialId: m }));
  for (const lang of LANGS) {
    const six = bViewPlate(ctxOf(p, lang), { ...dining, notes: [], materials: many });
    assert.equal(new Set(texts(six).map((e) => e.edit?.field).filter((f) => /^materials\.\d$/.test(f || ''))).size, 6, `${lang}: 6 行`);
    assert.deepEqual(six.warnings, [], lang);
    checkPage(`${lang} 6 行材料`, six);
  }
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
// 均衡断行（b/text.js，公司页也用）
// ---------------------------------------------------------------------------

test('均衡断行：两行长短接近；中文断在词与词之间（与 / 的），标点不放行首；「·」不留在行尾', () => {
  assert.equal(balanceLine('屋顶花园与露台', 'zh', 'display', 402), '屋顶花园\n与露台');
  assert.equal(balanceLine('开放式厨房与早餐台', 'zh', 'head', 402), '开放式厨房\n与早餐台');
  assert.equal(balanceLine('主人房衣帽间与梳妆台', 'zh', 'head', 402), '主人房衣帽间\n与梳妆台');
  assert.equal(balanceLine('客厅电视墙与展示柜', 'zh', 'head', 402), '客厅电视墙\n与展示柜');
  for (const t of ['面向花园的开放式餐厅与厨房，岛台连着餐桌', '餐边柜嵌进墙里，与墙面齐平；开放格里放日常用的器物']) {
    for (const w of [260, 402, 686]) for (const line of balanceLine(t, 'zh', 'body', w).split('\n')) assert.ok(!/^[，。、；：！？）]/.test(line), `标点不在行首：${line}`);
  }
  assert.equal(balanceLine('Sintered Stone · Taj Mahal', 'en', 'body', 200), 'Sintered Stone\nTaj Mahal');
  assert.equal(balanceLine('A dining room open to the garden', 'en', 'head', 402), 'A dining room\nopen to the garden');
  const shelves = balanceLine('Open shelves on one side of the island for everyday bowls and plates; two deep drawers on the other.', 'en', 'body', 402);
  for (const line of shelves.split('\n')) assert.ok(!/\b(the|a|an)$/i.test(line), `行尾是冠词：${line}`);
  // 页眉：英文大写一行放得下就一行，不带行尾逗号
  const p = sample('en');
  assert.ok(at(bViewPlate(ctxOf(p, 'en'), p.slides.find((s) => s.id === 'v-dining')), 'OPEN TO THE GARDEN'));
});

// ---------------------------------------------------------------------------
// 本案材料
// ---------------------------------------------------------------------------

test('本案材料：一排时撑满版心（112–1810，间距 32；1–2 种按原图清楚的最大宽、3 种 544、4 种 400、5 种 314、6 种 256），挂在页眉下 64，说明落在 900', () => {
  const p = sample('bi');
  const ctx = ctxOf(p, 'bi');
  const ms = p.materials.map((m) => ({ ...m, image: m.image || '/mat-oak.jpg' }));
  const expect = {
    1: [[112], 690], 2: [[112, 834], 690], 3: [[112, 688, 1264], 544], 4: [[112, 544, 976, 1408], 400],
    5: [[112, 458, 804, 1150, 1496], 314], 6: [[112, 400, 688, 976, 1264, 1552], 256],
  };
  for (const [n, [xs, w]] of Object.entries(expect)) {
    const pg = bMaterials(ctx, ms.slice(0, Number(n)), 0, 1);
    checkPage(`材料 ${n}`, pg);
    const ps = plates(pg);
    assert.deepEqual(ps.map((e) => e.x), xs, `${n} 种：x`);
    assert.ok(ps.every((e) => e.w === w), `${n} 种：宽 ${w}（600 px 的小样放大 1.15 倍 = 690）`);
    const head = at(pg, '本案材料');
    assert.ok(ps.every((e) => near(e.y, Math.ceil(head.y + head.h - INSET + 64), 1)), `${n} 种：小样挂在页眉下 64`);
    const last = Math.max(...texts(pg).filter((e) => !isSig(e) && e.y > 300).map((e) => e.y + e.h - INSET));
    assert.ok(near(last, PAGE.contentBottom, 1), `${n} 种：最长的说明落在 900（${last}）`);
    assert.deepEqual(pg.warnings, []);
  }
  const pg = bMaterials(ctx, ms.slice(0, 5), 0, 1);
  assert.ok(nearX(at(pg, '浅川橡').x + INSET, 112));
  assert.match(allText(pg), /^MATERIALS\n本案材料/);
  assert.doesNotMatch(allText(pg), /五金|hardware/);
  const last = plates(pg).at(-1);
  assert.equal(last.x + last.w, 1810, '最后一块贴到右边界');
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
    checkPage(`材料 ${n}`, pg);
    assert.deepEqual(rowsOf(pg), rows, `${n} 种`);
    assert.equal(new Set(plates(pg).map((e) => e.h)).size, 1, `${n} 种：两排一样高`);
    assert.ok(near(Math.max(...texts(pg).filter((e) => !isSig(e)).map((e) => e.y + e.h - INSET)), PAGE.contentBottom, 1), `${n} 种：落在 900`);
  }
  const p1 = bMaterials(ctx, mats.slice(0, 7), 0, 2, 7);
  const p2 = bMaterials(ctx, mats.slice(7, 13), 1, 2, 7);
  const geo = (pg) => [...new Set(plates(pg).map((e) => `${e.y}/${e.w}/${e.h}`))];
  assert.deepEqual(geo(p2), geo(p1));
  assert.match(allText(p2), /MATERIALS, CONTINUED\n本案材料（续）/);
  const p3 = bMaterials(ctx, mats.slice(0, 3), 1, 2, 7);
  assert.equal(plates(p3)[0].y, plates(p1)[0].y);
  assert.equal(plates(p3)[0].h, plates(p1)[0].h);
});

test('本案材料：原图不够大时收窄到清楚的宽（不窄过 400）；本来就太小的图单独提醒，不拖累整页；没有图 = 小样底色 + 细线框', () => {
  const p = sample('bi');
  const ctx = ctxOf(p, 'bi');
  const four = bMaterials(ctx, [{ id: 'm4', name: '小样', code: 'X4', image: '/sw-400.jpg' }, p.materials[0]], 0, 1);
  assert.ok(plates(four).every((e) => e.w === 460), '400 px 的图：放大 1.15 倍 = 460');
  assert.deepEqual(four.warnings, []);
  const tiny = bMaterials(ctx, [{ id: 'mx', name: '小样', code: 'X1', image: '/sw-small.jpg' }, ...p.materials.slice(0, 2)], 0, 1);
  assert.ok(plates(tiny).every((e) => e.w === 544), '200 px 的图收窄到 400 也发虚 → 保持 544，单独提醒');
  assert.match(tiny.warnings.join(' '), /材料「小样」的图片像素偏低/);
  assert.ok(plates(tiny).every((e) => e.h > 400), '其它小样照常高');
  const noImg = bMaterials(ctx, [p.materials[5]], 0, 1);
  assert.ok(noImg.els.some((e) => e.t === 'rect' && e.fill === B.sample) && noImg.els.filter((e) => e.t === 'rect' && e.fill === B.hair).length === 4);
  const s = allText(bMaterials(ctx, p.materials.slice(0, 2), 0, 1));
  assert.match(s, /浅川橡/);
  assert.match(s, /Light Oak/);
  assert.equal(s.match(/AG273/g).length, 1);
});

// ---------------------------------------------------------------------------
// 满版 / 图文的分配
// ---------------------------------------------------------------------------

test('planViews：设定的照设定；自动 = 横图（≥ 1.3）、没有说明、材料 ≤ 2 行 → 满版带标题；材料多时同空间下一页覆盖才满版；立体图图文；不连续 3 页满版；图文页左右交替', () => {
  const p = sample('bi');
  const plan = planViews(p, meta);
  assert.equal(plan.size, 9);
  // 鞋柜（4:3、2 行材料）、电视柜、床头（2 行）、茶室（1 行）→ 满版；有说明的、材料 3 行以上的、酒柜（1.26，不够横）→ 图文
  const want = { 'v-entry': 'full', 'v-tv': 'full', 'v-living': 'plate', 'v-dining': 'plate', 'v-kitchen': 'plate', 'v-bed': 'full', 'v-vanity': 'plate', 'v-wine': 'plate', 'v-tea': 'full' };
  for (const [id, v] of Object.entries(want)) assert.equal(plan.get(id), v, id);
  // 节奏：连着的图文页一左一右（不连着 3 页一模一样）
  assert.deepEqual(['v-living', 'v-dining', 'v-kitchen', 'v-vanity', 'v-wine'].map((id) => plan.side.get(id)), ['left', 'right', 'left', 'left', 'right']);
  const shown = p.slides.filter((s) => s.kind === 'view' || s.kind === 'floor');
  for (let i = 2; i < shown.length; i++) {
    const kinds = shown.slice(i - 2, i + 1).map((s) => (s.kind === 'floor' ? 'floor' : `${plan.get(s.id)}-${plan.side.get(s.id) || ''}`));
    assert.ok(!(kinds[0] === kinds[1] && kinds[1] === kinds[2]), `连着 3 页同一个版式：${shown[i].id}`);
  }

  const q = sample('bi');
  const bed = q.slides.find((s) => s.id === 'v-bed');
  bed.notes = [{ label: '', text: '床头灯藏在板后' }];
  assert.equal(planViews(q, meta).get('v-bed'), 'plate', '有说明 → 图文');
  bed.notes = [];
  bed.materials = [{ role: '床头板', materialId: 'm-walnut' }, { role: '衣柜', materialId: 'm-white' }, { role: '柜门', materialId: 'm-oak' }];
  assert.equal(planViews(q, meta).get('v-bed'), 'plate', '3 行材料、下一页没有覆盖 → 图文');
  const vanity = q.slides.find((s) => s.id === 'v-vanity');
  vanity.materials = [...bed.materials, { role: '台面', materialId: 'm-stone' }];
  assert.equal(planViews(q, meta).get('v-bed'), 'full', '同空间的下一页（图文）覆盖了这一页的材料 → 第一张满版');
  vanity.layout = 'full';
  assert.equal(planViews(q, meta).get('v-bed'), 'plate', '下一页是满版就不算覆盖');

  const r = sample('bi');
  r.slides.find((s) => s.id === 'v-tv').layout = 'framed';
  r.slides.find((s) => s.id === 'v-kitchen').layout = 'full';
  assert.equal(planViews(r, meta).get('v-tv'), 'plate');
  assert.equal(planViews(r, meta).get('v-kitchen'), 'full');
  const t = sample('bi');
  Object.assign(t.slides.find((s) => s.id === 'v-tv'), { tag: '3d' });
  assert.equal(planViews(t, meta).get('v-tv'), 'plate');
  Object.assign(t.slides.find((s) => s.id === 'v-tv'), { tag: undefined, image: '/square.jpg' });
  assert.equal(planViews(t, meta).get('v-tv'), 'plate', '方图不够横 → 图文');
  Object.assign(t.slides.find((s) => s.id === 'v-tv'), { image: '/wine.jpg' });
  assert.equal(planViews(t, meta).get('v-tv'), 'plate', '1.26 铺满 16:9 要裁掉上下三成 → 图文');
  Object.assign(t.slides.find((s) => s.id === 'v-tv'), { image: '/entry.jpg' });
  assert.equal(planViews(t, meta).get('v-tv'), 'full', '4:3 → 满版');
  assert.equal(planViews(t, () => null).get('v-tv'), 'plate', '不知道尺寸 → 图文');
  Object.assign(t.slides.find((s) => s.id === 'v-tv'), { image: null });
  assert.equal(planViews(t, meta).get('v-tv'), 'plate', '没有图 → 图文（纯文字，不画占位）');

  const u = sample('bi');
  const bare = (id, room) => ({ id, kind: 'view', enabled: true, floorId: 'f1', layout: 'auto', image: '/living.jpg', room, subtitle: '', materials: [], notes: [] });
  u.slides = [bare('a', '客厅'), bare('b', '餐厅'), bare('c', '厨房'), bare('d', '书房'), { id: 'fl', kind: 'floor', floorId: 'f2', enabled: true }, bare('e', '主人房'), bare('f', '茶室')];
  const up = planViews(u, meta);
  assert.deepEqual(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => up.get(id)), ['full', 'full', 'plate', 'full', 'full', 'full']);
  u.slides[2].layout = 'full';
  const up2 = planViews(u, meta);
  assert.deepEqual(['a', 'b', 'c', 'd'].map((id) => up2.get(id)), ['full', 'plate', 'full', 'full']);
  const v = sample('bi');
  v.slides = [bare('a', '客厅'), { ...bare('x', '玄关'), enabled: false, materials: [{ role: '柜体', materialId: 'm-oak' }] }, bare('b', '餐厅'), bare('c', '厨房')];
  const vp = planViews(v, meta);
  assert.deepEqual(['a', 'b', 'c'].map((id) => vp.get(id)), ['full', 'full', 'plate']);
});

test('bViewPage：按 plan 分派；没给 plan 时自己算；满版页 = Aman 第 9 页的满版带标题（白字下面有托字）', () => {
  const p = sample('bi');
  const ctx = ctxOf(p, 'bi');
  const tv = p.slides.find((s) => s.id === 'v-tv');
  const full = bViewPage(ctx, tv);
  assert.equal(photos(full)[0].w, 1920, '没给 plan：自己算（满版）');
  assert.ok(at(full, 'TV CABINET') && at(full, '电视柜'), '左上视角名');
  const eb = texts(full).find((e) => e.edit?.field === 'room' && /一楼/.test(textOf(e)));
  assert.ok(eb && contentBox(eb).y0 > contentBox(at(full, '电视柜')).y1 - 0.5 && contentBox(eb).y1 < 300, '「楼层　空间」在视角名下面（上面那条托字里）');
  assert.equal(texts(full).filter(isSig).length, 0, '满版效果图上不放签名');
  assert.equal(full.els.filter((e) => e.t === 'rect' && e.grad).length, 1, '没有材料：只有上面一条托字，下半保持原样');
  assert.equal(LOGO_SRC.get(imgs(full).find(isLogo).src), 'sailWhite', '照片上用白 logo');
  checkPage('满版带标题', full);
  const plate = bViewPage(ctx, tv, new Map([[tv.id, 'plate']]));
  assert.ok(photos(plate)[0].w < 1920);
  // 满版页的左下角印着这一页的材料（≤ 2 行），不提醒「不显示材料」
  const entry = bViewPage(ctx, p.slides.find((s) => s.id === 'v-entry'));
  assert.ok(texts(entry).some((e) => e.name === 'caption' && textOf(e) === '归雁胡桃') && texts(entry).some((e) => textOf(e) === 'AG275'));
  assert.deepEqual(entry.warnings, []);
  for (const lang of LANGS) checkPage(`${lang} 满版带标题`, bViewPage(ctxOf(p, lang), p.slides.find((s) => s.id === 'v-entry')));
});

// ---------------------------------------------------------------------------
// 长编号、材料分页、水印、立体图标签、两栏团队、提醒说清是哪一栏
// ---------------------------------------------------------------------------

const LONG = { id: 'm-long', name: '意大利进口超白岩板（哑光）', code: 'LAMINAM-CALCE-BIANCO-12MM', image: '/mat-stone.jpg' };

test('长编号（带品牌前缀）不挤掉名称：另起一行、靠右，所有材料行都印出来；在小样下折成几行才提醒', () => {
  for (const lang of LANGS) {
    const p = sample(lang);
    p.materials = [...p.materials, LONG, { id: 'm-egger', name: '暖白橡', code: 'EGGER H1145 ST10', image: '/mat-oak.jpg' }];
    p.translations = { ...TRANSLATIONS, [LONG.name]: 'Italian Ultra-White Sintered Stone (Matt)', 暖白橡: 'Warm White Oak' };
    const kitchen = p.slides.find((s) => s.id === 'v-kitchen');
    const v = { ...kitchen, notes: [], materials: [{ role: '台面', materialId: 'm-long' }, { role: '柜体', materialId: 'm-egger' }, ...kitchen.materials.slice(0, 2)] };
    const pg = bViewPlate(ctxOf(p, lang), v);
    checkPage(`${lang} 长编号图文页`, pg);
    const rows = new Set(texts(pg).map((e) => e.edit?.field).filter((f) => /^materials\.\d+$/.test(f || '')));
    assert.equal(rows.size, 4, `${lang}: 4 行材料都印出来`);
    assert.ok(!pg.warnings.some((w) => /材料太多|材料表放不下/.test(w)), pg.warnings.join(' / '));
    // 编号另起一行、靠右（在材料名下面），名称一栏不被挤窄
    const code = texts(pg).find((e) => textOf(e).replace(/\n/g, '') === LONG.code);
    const name = texts(pg).find((e) => /^materials\.0(\.nameEn)?$/.test(e.edit?.field || '') && e !== code && e.paras[0].align !== 'r');
    assert.equal(code.paras[0].align, 'r');
    assert.ok(code.y > name.y, '长编号排在材料名下面');
    assert.ok(name.w - 2 * INSET >= 0.6 * 400, '名称一栏至少 60% 宽');
    // 中英版 5 行（两行带长编号）也都印出来（收紧版式）
    if (lang === 'bi') {
      const five = bViewPlate(ctxOf(p, lang), { ...v, materials: [...v.materials, kitchen.materials[2]] });
      assert.equal(new Set(texts(five).map((e) => e.edit?.field).filter((f) => /^materials\.\d+$/.test(f || ''))).size, 5);
      checkPage('5 行长编号', five, { hole: false });
    }
    // 材料页：小样不被挤扁；编号折行才提醒（提醒里说折成几行，和页面一致）
    const mp = bMaterials(ctxOf(p, lang), p.materials, 0, 1);
    checkPage(`${lang} 长编号材料页`, mp);
    for (const pl of plates(mp)) assert.ok(pl.h >= 150, `${lang}: 小样只有 ${pl.h} 高`);
    const codeEl = texts(mp).find((e) => textOf(e).replace(/\n/g, '') === LONG.code);
    const lines = textOf(codeEl).split('\n').length;
    assert.equal(mp.warnings.some((w) => w.startsWith(`材料编号太长：「${LONG.code}」折成了 ${lines} 行`)), lines > 1, `${lang}: 折成 ${lines} 行`);
    assert.ok(!mp.warnings.some((w) => /EGGER/.test(w)), '16 字的编号放得下：不提醒');
  }
});

test('材料分页：名称 / 编号正常时 12 种一页、两排均分；说明把两排的小样挤扁时改成一页一排', () => {
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
  for (const v of [mk('w18', '/r1800.jpg'), { ...mk('w18', '/r1800.jpg'), materials: [{ role: '柜体', materialId: 'm-oak' }] }]) {
    const plate = bViewPlate(ctx, v);
    assert.ok(!plate.warnings.some((w) => /水印/.test(w)));
    assert.ok(!wmVisible(photos(plate)[0]), '图文页的取景里没有水印');
  }
});

test('水印按实际取景（左右、上下）判断：真的进了画面才提醒；楼层页的半版框左右已裁掉它就不放大、不提醒', () => {
  const sizes = { '/w1600.jpg': [1600, 900], '/w900.jpg': [900, 506], '/w1100.jpg': [1100, 1000], '/w2400.jpg': [2400, 1350] };
  const m2 = (src) => (sizes[src] ? { w: sizes[src][0], h: sizes[src][1] } : meta(src));
  const p = sample('zh');
  const ctx = { ...ctxOf(p, 'zh'), meta: m2 };
  const floor = (image) => bFloor(ctx, { ...p.slides.find((s) => s.id === 's-f1'), image });
  const wm = (pg) => pg.warnings.filter((w) => /水印/.test(w));
  const realShown = (im) => {
    const nat = m2(im.src);
    const l = 1 - Math.max(0.206 * nat.h, 0.101 * Math.hypot(nat.w, nat.h)) / nat.w;
    return 1 - im.crop.r > l && 1 - im.crop.b > 1 - 0.094;
  };
  for (const src of ['/w1600.jpg', '/w900.jpg', '/w2400.jpg']) {
    const pg = floor(src);
    const im = photos(pg)[0];
    assert.deepEqual(wm(pg), [], `${src}：楼层页的 16:9 图左右裁掉约 23%，水印在画外 —— 不提醒`);
    assert.ok(!realShown(im) && im.crop.b === 0, `${src}：不为水印放大、裁底 ${JSON.stringify(im.crop)}`);
  }
  // 1100 × 1000（1.1）：楼层页左右只裁掉 6%，水印还在画面里；放大到 1.15 倍也裁不掉 → 提醒（一键换图）
  const mid = floor('/w1100.jpg');
  assert.ok(realShown(photos(mid)[0]));
  assert.deepEqual(wm(mid), [WM_WARN.plate]);
  const v = { ...p.slides.find((s) => s.id === 'v-tv'), image: '/w900.jpg', materials: [{ role: '柜体', materialId: 'm-oak' }] };
  assert.deepEqual(wm(bViewPlate(ctx, v)), [WM_WARN.plate]);
  assert.deepEqual(wm(bViewFull(ctx, { ...v, layout: 'full' })), [WM_WARN.full]);
  const all = { ...sizes, '/w1200sq.jpg': [1200, 1200], '/w1300.jpg': [1300, 812], '/w2000p.jpg': [2000, 1250], '/w1000t.jpg': [1000, 1333], '/w1400.jpg': [1400, 1000] };
  const m3 = (src) => (all[src] ? { w: all[src][0], h: all[src][1] } : meta(src));
  const ctx3 = { ...ctx, meta: m3 };
  const shown3 = (im) => {
    const nat = m3(im.src);
    const l = 1 - Math.max(0.206 * nat.h, 0.101 * Math.hypot(nat.w, nat.h)) / nat.w;
    return 1 - im.crop.r > l && 1 - im.crop.b > 1 - 0.094;
  };
  for (const src of Object.keys(all)) {
    const vv = { ...v, image: src };
    for (const pg of [bFloor(ctx3, { ...p.slides.find((s) => s.id === 's-f1'), image: src }), bViewPlate(ctx3, vv), bViewFull(ctx3, { ...vv, layout: 'full' })]) {
      if (shown3(photos(pg)[0])) assert.ok(wm(pg).length, `${src}：画面里有水印却没提醒 ${JSON.stringify(photos(pg)[0].crop)}`);
    }
  }
});

test('自动版式：像素和水印分开看 —— 很宽的全景图左右就裁掉了水印，像素不够（2000×667）照样排图文；像素够的（3000×1000）满版', () => {
  const sizes = { '/pano2000.jpg': [2000, 667], '/pano1200.jpg': [1200, 400], '/pano3000.jpg': [3000, 1000], '/r1200x800.jpg': [1200, 800] };
  const m2 = (src) => (sizes[src] ? { w: sizes[src][0], h: sizes[src][1] } : meta(src));
  const p = sample('zh');
  const tv = p.slides.find((s) => s.id === 'v-tv');
  const ctx = { ...ctxOf(p, 'zh'), meta: m2 };
  const wm = (pg) => pg.warnings.filter((w) => /水印/.test(w));
  const blurry = (pg) => pg.warnings.filter((w) => /像素偏低/.test(w));
  tv.image = '/pano2000.jpg';
  const forced = bViewFull(ctx, { ...tv, layout: 'full' });
  assert.deepEqual(wm(forced), []);
  assert.deepEqual(blurry(forced), ['图片像素偏低：放大 1.6 倍会发虚，建议换高清图']);
  assert.equal(planViews(p, m2).get('v-tv'), 'plate');
  const pg = bViewPage(ctx, tv);
  assert.deepEqual(pg.warnings, []);
  assert.ok(scaleOf(photos(pg)[0]) <= 1.15);
  for (const src of ['/pano1200.jpg', '/r1200x800.jpg']) {
    tv.image = src;
    assert.equal(planViews(p, m2).get('v-tv'), 'plate', src);
    assert.ok(blurry(bViewFull(ctx, { ...tv, layout: 'full' })).length, src);
  }
  assert.deepEqual(bViewPage(ctx, tv).warnings, [], '1200×800 的图文页：水印裁掉、不发虚，没有提醒');
  tv.image = '/pano3000.jpg';
  assert.equal(planViews(p, m2).get('v-tv'), 'full');
  assert.deepEqual(bViewPage(ctx, tv).warnings, []);
  const grid = {};
  for (const w of [700, 1200, 1600, 1800, 1845, 1920, 2400, 3000, 3840]) {
    for (const a of [1.5, 1.55, 1.6, 1.7, 16 / 9, 2, 2.4, 3, 4]) grid[`/g${w}x${Math.round(w / a)}.jpg`] = [w, Math.round(w / a)];
  }
  const m3 = (src) => (grid[src] ? { w: grid[src][0], h: grid[src][1] } : meta(src));
  const ctx3 = { ...ctx, meta: m3 };
  for (const src of Object.keys(grid)) {
    tv.image = src;
    const clean = bViewFull(ctx3, { ...tv, layout: 'full' }).warnings.length === 0;
    assert.equal(planViews(p, m3).get('v-tv'), clean ? 'full' : 'plate', src);
  }
  for (const [src, want] of [['/g1845x1038.jpg', 'full'], ['/g1800x1013.jpg', 'plate'], ['/g3840x960.jpg', 'full'], ['/g2400x600.jpg', 'plate']]) {
    tv.image = src;
    assert.equal(planViews(p, m3).get('v-tv'), want, src);
  }
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
    checkPage(`${lang} 立体图 全屋`, b);
    assert.doesNotMatch(allText(a), /一楼　一楼|全屋　全屋/);
    assert.doesNotMatch(allText(b), /全屋　全屋/);
    if (lang !== 'zh') {
      assert.match(allText(a), /GROUND FLOOR/);
      assert.match(allText(a), /3D\s+OVERVIEW/);
      assert.match(allText(b), /3D\s+VIEW/);
      assert.equal(ctxOf(p, lang).tr.misses.length, 0);
    }
  }
});

test('团队 7–12 位排两栏（左栏多一位），两栏同一套行、名单排到 900 为止、都不重叠；12 位以上才提醒', () => {
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
      assert.equal(xs.length, 2, '两栏');
      assert.equal(names.filter((e) => e.x === xs[0]).length, Math.ceil(n / 2), '左栏多一位');
      const ys = (x) => names.filter((e) => e.x === x).map((e) => e.y);
      assert.deepEqual(ys(xs[1]), ys(xs[0]).slice(0, Math.floor(n / 2)), '两栏同一套行');
      assert.ok(Math.max(...names.map((e) => e.y + e.h - INSET)) <= PAGE.contentBottom + 0.5);
    }
  }
});

test('提醒说清是哪一栏：第几条说明（只有标签时是标签）、标题是空间名还是视角名、中文还是英文', () => {
  const p = sample('bi');
  const ctx = ctxOf(p, 'bi');
  const tea = p.slides.find((s) => s.id === 'v-tea');
  const plate = { ...tea, image: '/entry.jpg', materials: [] };
  const long = '这是一段非常非常长的说明，'.repeat(30);
  assert.ok(bViewPlate(ctx, { ...plate, notes: [{ label: '', text: '' }, { label: '', text: long }] }).warnings.includes('说明太长（第 2 条）：建议精简或拆页'));
  assert.ok(bViewPlate(ctx, { ...plate, notes: [{ label: '说明', text: '' }, { label: long, text: '' }] }).warnings.includes('说明太长（第 2 条的标签）：建议精简或拆页'));
  const w = (s) => bViewPlate(ctx, { ...plate, notes: [{ label: '', text: '短说明' }], ...s }).warnings.join(' | ');
  const longZh = '主人房衣帽间与化妆区及步入式储物空间连通阳台'.repeat(3);
  assert.match(w({ subtitle: '', room: longZh, roomEn: 'Dressing' }), /^空间名太长/);
  assert.match(w({ subtitle: '', room: '主人房', roomEn: 'Master Bedroom Walk-In Wardrobe, Dressing Area and Reading Corner by the Window, with a Long Gallery of Built-In Shelving' }), /空间英文名太长/);
  assert.match(w({ subtitle: '这是一个非常非常长的视角名称用来测试标题过长的情况'.repeat(3) }), /^视角名太长/);
});

test('团队 12 位、名字长（折两行）：名单不越过 900、不压签名、不出画布；放不下的截短 / 不印，并提醒（一键修复跳到那位的名字）', () => {
  const names = ['Muhammad Hafiz bin Abdullah Rahman', 'Nurul Aisyah binti Ismail'];
  for (const [label, team] of [
    ['长名字', Array.from({ length: 12 }, (_, i) => ({ name: names[i % 2], role: '方案设计师' }))],
    ['名字再长一点', Array.from({ length: 12 }, (_, i) => ({ name: `Designer Name Number ${i + 1} Abdullah Rahman bin Ismail`, role: '方案设计师' }))],
  ]) {
    for (const lang of LANGS) {
      const p = sample(lang);
      p.info.team = team;
      const pg = bTeam(ctxOf(p, lang));
      checkPage(`团队 12 位 ${label} ${lang}`, pg, { hole: false });
      const list = texts(pg).filter((e) => /^team\.\d+\./.test(e.edit?.field || ''));
      for (const el of list) assert.ok(contentBox(el).y1 <= PAGE.contentBottom + 0.5, `${label} ${lang}: 名单越过 900「${textOf(el)}」`);
      const rules = pg.els.filter((e) => e.t === 'rect' && e.alpha === ALPHA.tableRule);
      for (const r of rules) assert.ok(r.y <= PAGE.contentBottom + 0.5, `${label} ${lang}: 细线越过 900（${r.y}）`);
      const shown = new Set(list.map((e) => e.edit.field.split('.')[1])).size;
      const w = pg.warnings.find((x) => /^服务团队名单放不下|^服务团队第 \d+ 位的名字太长/.test(x));
      if (shown < 12 || list.some((e) => /…$/.test(textOf(e)))) {
        assert.ok(w, `${label} ${lang}: 少印 / 截短了却没提醒 ${JSON.stringify(pg.warnings)}`);
        assert.match(fixForWarning(w).field, /^team\.\d+\.name$/);
      }
    }
  }
});

test('拉丁字的楼层名 / 空间名 / 视角名：三种语言里同一个词只印一次（GROUND FLOOR / Ground Floor 不重复）', () => {
  for (const lang of LANGS) {
    const p = sample(lang);
    p.floors[0] = { ...p.floors[0], zh: 'Ground Floor', en: 'GROUND FLOOR' };
    const fl = bFloor(ctxOf(p, lang), p.slides.find((s) => s.id === 's-f1'));
    assert.equal(texts(fl).filter((e) => /^ground floor$/i.test(textOf(e).replace(/\n/g, ' '))).length, 1, `${lang} 楼层页：${allText(fl)}`);
    const v = { ...p.slides.find((s) => s.id === 'v-dining'), subtitle: 'Overview', roomEn: '' };
    const pg = bViewPlate(ctxOf(p, lang), v);
    assert.equal(texts(pg).filter((e) => /^overview$/i.test(textOf(e))).length, 1, `${lang} 图文页：${allText(pg)}`);
    const taj = { ...p.slides.find((s) => s.id === 'v-tea'), room: 'Taj Room', roomEn: '', subtitle: '' };
    const tp = bViewPage(ctxOf(p, lang), taj, new Map([[taj.id, 'full']]));
    assert.equal(texts(tp).filter((e) => /^taj room$/i.test(textOf(e))).length, 1, `${lang} 满版：${allText(tp)}`);
  }
});
