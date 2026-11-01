// C 安然 · 公司固定页 = 品牌画册（19 页）：封面、目录、四个章节页、品牌 / 公司 / 服务各页、封底。
//
// 版式照 Aman 品牌手册（老板选定的 dirA2 样张，规格见 /tmp/claude-0/c/dirA/notes.md「通用规格」），全部用 kit.js 的 C 工具拼：
//   封面、目录、公司章节页 = 满版 / 大照片，白字直接压在照片上；内容页 = 半版照片（上下贴边）配文字栏；
//   标题系统 = 英文大写 Ogg 在上、中文思源宋体在下；右下角页脚签名，一个角上放 logo；
//   照片保持原色（不加色层），白字下面只放局部的 1C1915 托字渐变（kit.shade）；
//   品牌分开：「公司 · 瑞吉欧」章节只用瑞吉欧的照片、RICCIONE 商标和「瑞吉欧 / RICCIONE」签名，不出现溪岸 logo / 口号；
//   中英并重：中文、英文同样大小，上下对照，都完整显示（放不下才截短并提醒）
//   每张照片是一个「照片位」（PHOTO_SLOTS，一行一个），默认图在 PHOTOS 里一行一张 ——
//   老板以后发来高清图，改那一行即可（取景重心 / 放大写在照片位的 frame 里）
//
// 数据：
//   文字字段 slide.overrides[字段] = 中文、slide.overridesEn[字段] = 英文（字符串才算改过）
//   只改了中文、没写英文：中文本来就是英文（Mr & Mrs Lau）= 英文也用它；质保年数「5 年」、日期能自动换成英文（5 years / August 2026）；
//     其余照旧用英文默认稿，并提醒「改过的中文还没有对应的英文」
//   英文栏清空（overridesEn[字段] = ''）= 英文里不要这一行：English 版不显示（不退回中文），中英版只显示中文
//   旧模板按元素序号的改写（数字键）新版式不读：打开旧项目时意思一样的几处已搬到新栏位（lib/project.js upgradeProject），
//     剩下的在页面上提醒设计师对照（legacyOverrides），点「知道了」清掉
//   照片 slide.images[照片位] = 'asset:…'（换图）；null / '' = 这一页不要这张照片（会提醒）
//   {{token}} 由 ctx.tokens（deck.js projectTokens）填，另外补上本页要用的：coverName / coverNameEn（客户 + 地点两行）、
//   dateZh / dateEn（二〇二六年八月 / August 2026）、designTitle / designTitleEn、chapterZh / chapterEn（这一页所在章节的编号：
//   第二章 / Chapter Two —— 老客户隐藏了前面的章节，后面的编号跟着往前排，见 deckChapters）
//
// 输出：renderCompanyB(key, slide, ctx) → { bg, els, warnings }；编辑字段 overrides.<字段> / overridesEn.<字段> / image.<照片位>

import * as K from './kit.js';
import { B, INSET, styleOf, wrapCount, page, hasCJK } from './kit.js';
import { PX_PER_PT } from '../../theme.js';
import { fillTokens } from '../spec.js';
import { clientLine, floorsLine } from '../model.js';
import { makeTranslator, langOf, resolveEn, floorsLineEn, hasCJKText } from '../lang.js';

// ---------------------------------------------------------------------------
// 照片：默认图（一行一张；换图改这里）。nat = 原图像素（判断裁切、放大倍数用）
// ---------------------------------------------------------------------------

// brand = 照片属于哪个品牌：'riccione' = 瑞吉欧（只用瑞吉欧图册 RICCIONE Catalogue 2024 Autumn 里的图），
//   'sail' = 溪岸（溪岸宣传手册、溪岸展厅 / 案例照）。规则：「公司 · 瑞吉欧」章节只放瑞吉欧的照片，其余页只放溪岸的
//   —— 溪岸的照片不能出现在瑞吉欧的资料里（test/b-company.test.mjs 会检查）
const sail = (src, w, h) => ({ src, nat: { w, h }, brand: 'sail' });
const riccione = (src, w, h) => ({ src, nat: { w, h }, brand: 'riccione' });

export const PHOTOS = {
  // —— 溪岸 ——
  sailCover: sail('/template/b/sail-cover.jpg', 1501, 2000), // 老板发来：胡桃木格柜、白色台面、芦苇
  sailDining: sail('/template/b/sail-dining.jpg', 1501, 2000), // 老板发来：深色书格墙、长餐桌、两扇磨砂窗
  sailHills: sail('/template/b/sail-hills.jpg', 889, 1039), // 溪岸手册 p4：草原上行走的五个人与远山
  sailSkeleton: sail('/template/b/sail-skeleton.jpg', 889, 1037), // 溪岸手册 p23：骨骼线厨房，浅木柜、黑色台面
  sailBedroom: sail('/template/b/sail-bedroom.jpg', 1016, 1038), // 溪岸手册 p37：卧室，皮革挂画、矮床、长凳
  sailClosing: sail('/template/b/sail-closing.jpg', 1080, 1440), // 溪岸手册 p38：橡木柜墙、台灯、天光
  storyLift: sail('/template/b/story-lift.jpg', 1800, 1036), // 溪岸门头、长墙与石凳
  sailLiving: sail('/template/b/sail-living.jpg', 1754, 1039), // 溪岸手册 p30：书格墙、圆镜、绿植的客厅
  sailCraft: sail('/template/b/sail-craft.jpg', 1755, 1038), // 溪岸手册 p27：木格柜的近景（木纹、层板）
  coll1: sail('/template/b/coll-1.jpg', 580, 982), // 骨骼线
  coll2: sail('/template/b/coll-2.jpg', 473, 800), // 空山
  coll3: sail('/template/b/coll-3.jpg', 693, 1173), // 织
  coll4: sail('/template/b/coll-4.jpg', 1480, 1110), // 雾山：溪岸手册 p27–28 雾山系列的厨房（白橡木吊柜 + 绿色高柜）
  coll5: sail('/template/b/coll-5.jpg', 610, 1033), // 寂东方
  awards: sail('/template/brand-awards-1.jpg', 1800, 1010), // 奖杯
  // 老板发来的展厅照（2000 px，原样不调色；右上角有白色 sAil 溪岸 logo —— 取景避开它）
  showroomStill: sail('/template/b/showroom-still.jpg', 1333, 2000), // 木盘里的青苹果与干枝，后面是书格和沙发
  // —— 瑞吉欧（RICCIONE Catalogue 2024 Autumn）——
  aboutDetail: riccione('/template/b/about-detail.jpg', 1079, 1348), // 瑞吉欧竖纹抽屉柜、干花与书（已提亮）
  riccioneGarden: riccione('/template/b/riccione-garden.jpg', 1212, 1500), // 图册 p41：树下的藤编扶手椅
  riccioneShowroom: riccione('/template/b/riccione-showroom.jpg', 2049, 961), // 图册 p6：瑞吉欧展厅（床、皮沙发、花砖墙）
  riccioneForest: riccione('/template/b/riccione-forest.jpg', 2000, 1002), // 图册 p60：阳光穿过的红杉林
  riccioneWardrobe: riccione('/template/b/riccione-wardrobe.jpg', 1400, 1767), // 图册 p49：深灰墙前的胡桃木衣柜
};

export const LOGO = { src: '/template/b/logo-ink.png', nat: { w: 1417, h: 539 } };
export const QR = { src: '/template/b/qr-instagram.png', nat: { w: 740, h: 740 } };

/** 照片位：默认图 + 取景（ax / ay = 重心 0–1，zoom = 在「刚好铺满」之上再放大多少） */
const slot = (photo, label, frame = {}) => ({ src: photo.src, nat: photo.nat, brand: photo.brand, label, frame });

/**
 * 照片位 → 默认图：每个照片位一行。老板发来新照片 → 放进 public/template/b/，在 PHOTOS 里加一行（标上品牌），
 * 再把这里对应的一行指过去。
 * frame：ax / ay = 取景重心（0–1），zoom = 在「刚好铺满」之上再放大多少（引擎会提醒超过 1.15 倍原图像素的情况）
 * 设计师在编辑器里换的图存在 slide.images[照片位]，不改这里
 *
 * 品牌分开：「公司 · 瑞吉欧」章节（章节页、关于我们、展厅、认证）只用瑞吉欧图册的照片；
 *   封面、目录、品牌 · 溪岸、方案、服务、封底只用溪岸的照片（溪岸手册 + 老板发来的溪岸照）
 * 瑞吉欧图册大多是去底的单品图，能整页用的场景照只有五张（章节页、关于、历程、展厅、认证各一张，不重复）；
 *   中英版的「发展历程」字多，排成纸面两栏年表（不放照片）
 * 取景（frame）按 C 安然的照片框定（dirA2 样张）：照片放大一律 ≤ 1.15 倍
 *   公司章节页用满版的红杉林（老板选定的 dirA2 第 4 页），所以认证页换成树下的藤编椅（两页不用同一张）
 */
export const PHOTO_SLOTS = {
  // 1680×1080 贴左（右边 240 是实色竖带）：1.15 倍，裁掉原图最右边的白色杂物
  cover: { photo: slot(PHOTOS.sailCover, '封面照片', { ax: 0, ay: 0.47, zoom: 1726 / 1680 }) },
  // 满版：溪岸门头的清水墙（墙上的 sAil 溪岸 招牌留在两栏中间）
  contents: { photo: slot(PHOTOS.storyLift, '目录照片', { ay: 0.5 }) },
  'brand-divider': { photo: slot(PHOTOS.sailHills, '章节照片', { ay: 0.55 }) },
  // 裁掉原图右上角的白色 sAil logo（原图 y 0.055–0.125）
  'brand-philosophy': { photo: slot(PHOTOS.showroomStill, '理念照片', { ax: 0.35, ay: 1, zoom: 1.12 }) },
  // 半版贴右：书格墙、圆镜与绿植（目录页已经是门头那张，这一页不再用它）
  'brand-story': { photo: slot(PHOTOS.sailLiving, '品牌照片', { ax: 0.3 }) },
  'brand-collections': {
    c1: slot(PHOTOS.coll1, '系列一照片'),
    c2: slot(PHOTOS.coll2, '系列二照片'),
    c3: slot(PHOTOS.coll3, '系列三照片'),
    c4: slot(PHOTOS.coll4, '系列四照片', { ax: 0.55 }), // 竖的小格也同时露出白橡木吊柜和绿色高柜
    c5: slot(PHOTOS.coll5, '系列五照片'),
  },
  // 半版贴左：两块奖牌在照片中间
  'brand-awards': { photo: slot(PHOTOS.awards, '奖项照片', { ax: 0.91, ay: 0.5 }) },
  'brand-supply': {},
  'company-divider': { photo: slot(PHOTOS.riccioneForest, '章节照片', { ax: 0.5 }) },
  'company-about': { photo: slot(PHOTOS.aboutDetail, '公司照片', { ay: 0.4 }) },
  // 半版贴左 820（dirA2 第 6 页）：深灰墙前的胡桃木衣柜 —— 「以实木家具起步」
  'company-history': { photo: slot(PHOTOS.riccioneWardrobe, '历程照片', { ay: 0.45 }) },
  // 半版贴右：床与吊灯在中间
  'company-showrooms': { photo: slot(PHOTOS.riccioneShowroom, '展厅照片', { ax: 0.5 }) },
  'company-certified': { photo: slot(PHOTOS.riccioneGarden, '认证照片', { ay: 0.8 }) },
  'design-divider': { photo: slot(PHOTOS.sailSkeleton, '章节照片', { ay: 0.5 }) },
  'service-divider': { photo: slot(PHOTOS.sailDining, '章节照片', { ay: 0.92 }) },
  'service-process': {},
  // 上半通栏 1920×520（Aman 第 14 页）：木格柜的近景，白字标题压在深色木纹上
  'service-cycle': { photo: slot(PHOTOS.sailCraft, '周期照片', { ay: 0.5 }) },
  // 半版贴右：挂画落在照片右上角（白 logo 整块压在皮面上）
  'service-aftersales': { photo: slot(PHOTOS.sailBedroom, '维保照片', { ax: 0 }) },
  closing: { photo: slot(PHOTOS.sailClosing, '封底照片', { ax: 0.3, ay: 0.6 }) },
};

// ---------------------------------------------------------------------------
// 19 页：编辑器页名、章节、文字字段（中文 / 英文默认稿）、照片位
//   字段没有 en = 中英同一段（品牌名、年份、地址），英文版也用它
//   oneLine = 版面上只排一行（目录、章节名、年份、标签…）：编辑器里按回车不换行
//   enFrom = 只改了中文时英文怎么自动跟着变（'years'：「5 年」→ 5 years；'date'：「2026 年 9 月」→ September 2026）
// ---------------------------------------------------------------------------

const F = (zh, en, label, extra = {}) => ({ zh, en, label, ...extra });
const ONE = { oneLine: true };

export const COMPANY_PAGES_B = {
  cover: {
    title: '封面',
    section: 'opening',
    fields: {
      name: F('{{coverName}}', '{{coverNameEn}}', '客户与地点（大标题）', { multiline: true }),
      subtitle: F('{{proposalTitle}}', '{{proposalTitleEn}}', '方案名称'),
      date: F('{{dateZh}}', '{{dateEn}}', '日期', { ...ONE, enFrom: 'date' }),
    },
    images: PHOTO_SLOTS['cover'],
  },
  contents: {
    title: '目录',
    section: 'opening',
    fields: {
      // 每一行跟着章节走（ch1 = 品牌 … ch4 = 服务）：隐藏的章节不列，编号按看得到的章节重排（01、02…）
      title: F('目录', 'Contents', '标题', ONE),
      ch1: F('品牌', 'Brand', '章名 · 品牌', ONE),
      ch1Line: F('自然栖居，生活回归', 'Living naturally, returning to life', '说明 · 品牌', ONE),
      ch2: F('公司', 'Company', '章名 · 公司', ONE),
      ch2Line: F('十年匠心，中马双市场', 'A decade of craft, in Malaysia and China', '说明 · 公司', ONE),
      ch3: F('方案', 'Design', '章名 · 方案', ONE),
      ch3Line: F('{{floorsLine}}，逐个空间的设计', '{{floorsLineEn}}, room by room', '说明 · 方案', ONE),
      ch4: F('服务', 'Service', '章名 · 服务', ONE),
      ch4Line: F('团队、流程、周期与维保', 'Team, process, lead times and aftercare', '说明 · 服务', ONE),
    },
    images: PHOTO_SLOTS['contents'],
  },
  'brand-divider': {
    title: '品牌 · 章节页',
    section: 'brand',
    fields: {
      label: F('{{chapterZh}}　品牌', '{{chapterEn}} — Brand', '章节', ONE),
      title: F('自然栖居\n生活回归', 'Living naturally,\nreturning to life', '大标题', { multiline: true }),
      lead: F('溪岸，是一处美而朴素的水边。', 'SAIL is the bank of a quiet stream.', '一句话'),
    },
    images: PHOTO_SLOTS['brand-divider'],
  },
  'brand-philosophy': {
    title: '品牌理念',
    section: 'brand',
    fields: {
      title: F('朴素的美感\n自然的治愈力', 'Simple beauty,\nthe healing power of nature', '标题', { multiline: true }),
      body: F(
        '溪岸，是创始人心中理想居所的样子。\n我们希望用能让人安静下来的设计，\n带大家回到内心深处向往的栖居地。',
        'SAIL is the home our founder always imagined.\nThrough design that quiets the mind, we hope\nto lead you back to the home you long for.',
        '正文',
        { multiline: true },
      ),
      closing: F('回归生活，回归日常的美好。', 'Return to life, and to the simple beauty of every day.', '结语'),
    },
    images: PHOTO_SLOTS['brand-philosophy'],
  },
  'brand-story': {
    title: '品牌故事',
    section: 'brand',
    fields: {
      title: F('从成都，到马来西亚', 'From Chengdu to Malaysia', '标题'),
      body: F(
        '2011 年，溪岸创立于成都，以自然为源，\n让设计回到宁静与美好。\n2025 年，Riccione Reka 成为溪岸东南亚总代理，\n把门、墙、柜一体的生活带到马来西亚。',
        "Founded in Chengdu in 2011, SAIL looks to nature\nto bring design back to calm and beauty.\nIn 2025 Riccione Reka became SAIL's distributor\nfor Southeast Asia, bringing doors, walls\nand cabinetry, made as one, to Malaysia.",
        '正文',
        { multiline: true },
      ),
      year1: F('2011', undefined, '年份一', ONE),
      place1: F('成都', 'Chengdu', '地点一', ONE),
      year2: F('2025', undefined, '年份二', ONE),
      place2: F('马来西亚', 'Malaysia', '地点二', ONE),
    },
    images: PHOTO_SLOTS['brand-story'],
  },
  'brand-collections': {
    title: '原创系列',
    section: 'brand',
    fields: {
      title: F('原创系列', 'Original Collections', '标题', ONE),
      note: F('每一个系列，都从自然与真实的生活里来。', 'Every collection begins with nature\nand everyday life.', '一句话', { multiline: true }),
      c1: F('骨骼线', 'Skeleton Line', '系列一'),
      c1Line: F('古典与现代的对话', 'Classic meets modern', '系列一说明'),
      c2: F('空山', 'Empty Mountain', '系列二'),
      c2Line: F('留白与壁龛，让空间呼吸', 'Space and niches\nthat let a room breathe', '系列二说明'),
      c3: F('织', 'Weaving', '系列三'),
      c3Line: F('织物的质感，生活的温度', 'The warmth of woven texture', '系列三说明'),
      c4: F('雾山', 'Misty Mountain', '系列四'),
      c4Line: F('轻盈纯净，如雾中春居', 'Light and pure,\na spring home in the mist', '系列四说明'),
      c5: F('寂东方', 'Wabi-Sabi Eastern', '系列五'),
      c5Line: F('实木的纯粹，东方的沉静', 'Pure solid wood,\na calm Eastern spirit', '系列五说明'),
    },
    images: PHOTO_SLOTS['brand-collections'],
  },
  'brand-awards': {
    title: '设计奖项',
    section: 'brand',
    fields: {
      title: F('设计奖项', 'Design Awards', '标题'),
      y1: F('2021', undefined, '年份一', ONE),
      a1: F('美国 MUSE 缪斯设计奖 · 金奖', 'MUSE Design Awards, USA · Gold', '奖项一'),
      a1Note: F('溪岸 4.0 系列 · 从 100 多个国家和地区的 3.8 万件作品中选出', 'SAIL 4.0 Series · chosen from 38,000 entries in 100+ countries', '奖项一说明'),
      y2: F('2022', undefined, '年份二', ONE),
      a2: F('HCA 高定家居设计奖 · 年度产品设计奖', 'HCA Home Design Awards · Product of the Year', '奖项二'),
      a2Note: F('自然线系列 · 广州设计周', 'Natural Line Series · Guangzhou Design Week', '奖项二说明'),
      y3: F('2023', undefined, '年份三', ONE),
      a3: F('HCA 高定家居设计奖 · 年度产品设计至尊奖', 'HCA Home Design Awards · Supreme Award', '奖项三'),
      a3Note: F('骨骼线 · 闲庭 · 终评前三', 'Skeleton Line · Leisure Courtyard · top three finalist', '奖项三说明'),
      y4: F('2024', undefined, '年份四', ONE),
      a4: F('HCA 高定家居设计奖 · 年度产品设计奖', 'HCA Home Design Awards · Product of the Year', '奖项四'),
      a4Note: F('骨骼线 · 山居', 'Skeleton Line · Mountain Dwelling', '奖项四说明'),
    },
    images: PHOTO_SLOTS['brand-awards'],
  },
  'brand-supply': {
    title: '全球供应链',
    section: 'brand',
    fields: {
      title: F('全球供应链', 'Global Supply Chain', '标题', ONE),
      lead: F('与国际品牌直接合作，从源头保证正品品质。', 'We work directly with international brands,\nensuring genuine quality from the source.', '一句话', { multiline: true }),
      s1: F('板材', 'Boards', '类别一'),
      s1Brands: F('Kastamonu · Egger · Skin', undefined, '类别一品牌'),
      s2: F('五金', 'Hardware', '类别二'),
      s2Brands: F('Blum · Italiana Ferramenta', undefined, '类别二品牌'),
      s3: F('岩板与设备', 'Stone & Equipment', '类别三'),
      s3Brands: F('Laminam · HOMAG · REHAU', undefined, '类别三品牌'),
    },
    images: PHOTO_SLOTS['brand-supply'],
  },
  'company-divider': {
    title: '公司 · 章节页',
    section: 'company',
    fields: {
      label: F('{{chapterZh}}　公司', '{{chapterEn}} — Company', '章节', ONE),
      title: F('瑞吉欧', 'Riccione', '大标题', { multiline: true }),
      lead: F('名字取自意大利的一座海滨小镇。', 'Named after a seaside town in Italy.', '一句话'),
    },
    images: PHOTO_SLOTS['company-divider'],
  },
  'company-about': {
    title: '关于瑞吉欧',
    section: 'company',
    fields: {
      title: F('更慢、更柔和，\n也更自然的生活', 'A slower, softer,\nmore natural life', '标题', { multiline: true }),
      body: F(
        '十余年的匠心积累，瑞吉欧专注于回归生活本质的家具：\n自然的材质、真实的设计、历久弥新的美。',
        'With more than a decade of craft, Riccione makes furniture\nthat returns to the essence of living: natural materials,\nhonest design and timeless aesthetics.',
        '正文',
        { multiline: true },
      ),
      line1: F('全屋定制', 'Bespoke Interiors', '业务一'),
      line1Text: F('Riccione Reka：门、墙、柜一体化设计', 'Riccione Reka: doors, walls and cabinetry as one', '业务一说明'),
      line2: F('实木家具', 'Solid-Wood Furniture', '业务二'),
      line2Text: F('100% 实木，模块化系统', '100% solid wood, in a modular system', '业务二说明'),
    },
    images: PHOTO_SLOTS['company-about'],
  },
  'company-history': {
    title: '发展历程',
    section: 'company',
    fields: {
      title: F('发展历程', 'Our Journey', '标题', ONE),
      lead: F('从马来西亚到中国，十年匠心。', 'From Malaysia to China, a decade of craft.', '一句话'),
      y1: F('2015', undefined, '年份一', ONE),
      e1: F('Riccione Furniture 在马来西亚成立，以实木家具起步', 'Riccione Furniture is founded in Malaysia as a solid-wood brand', '大事一'),
      y2: F('2017', undefined, '年份二', ONE),
      e2: F('进军中国：佛山 21,000 平方尺旗舰展厅\n获 Archidex 最佳展位设计奖', 'Enters China with a 21,000 sq ft flagship showroom in Foshan\nWins Best Booth Design at Archidex', '大事二', { multiline: true }),
      y3: F('2018', undefined, '年份三', ONE),
      e3: F('出口中国超过 600 个集装箱\n经销商近 1,000 家', 'Ships more than 600 containers to China\nBuilds a network of nearly 1,000 dealers', '大事三', { multiline: true }),
      y4: F('2019', undefined, '年份四', ONE),
      e4: F('首次亮相 CIFF 广州，产品销往日本与欧洲\n获佛山最佳家具设计奖', 'Debuts at CIFF Guangzhou, with sales to Japan and Europe\nWins Best Furniture Design in Foshan', '大事四', { multiline: true }),
      y5: F('2020', undefined, '年份五', ONE),
      e5: F('吉隆坡 11,000 平方尺国际工程展厅落成\n受邀参展 CIFF 上海设计馆', 'Opens an 11,000 sq ft project showroom in Kuala Lumpur\nExhibits at the CIFF Shanghai Design Pavilion by invitation', '大事五', { multiline: true }),
      y6: F('2022', undefined, '年份六', ONE),
      e6: F('拓展工程项目：住宅、酒店与商业空间', 'Expands into projects for homes, hotels and commercial spaces', '大事六'),
      y7: F('2024', undefined, '年份七', ONE),
      e7: F('中国转为品牌专卖，开到 18 家门店\n马来西亚线上线下一体化零售', 'Grows to 18 brand stores in China\nBrings online and offline retail together in Malaysia', '大事七', { multiline: true }),
      y8: F('2025', undefined, '年份八', ONE),
      e8: F('Riccione Reka 全屋定制成立，成为溪岸东南亚总代理', "Riccione Reka is founded as SAIL's Southeast Asia distributor", '大事八'),
    },
    images: PHOTO_SLOTS['company-history'],
  },
  'company-showrooms': {
    title: '展厅与仓储',
    section: 'company',
    fields: {
      title: F('展厅与仓储', 'Showrooms & Warehouse', '标题'),
      lead: F(
        '出口、工程与零售并行，\n服务马来西亚、中国、香港、美国、加拿大、\n日本、印度、泰国与越南。',
        'Export, projects and retail side by side,\nserving Malaysia, China, Hong Kong, the US,\nCanada, Japan, India, Thailand and Vietnam.',
        '一句话',
        { multiline: true },
      ),
      p1: F('吉隆坡', 'Kuala Lumpur', '地点一'),
      p1Text: F('四层展厅与办公室，15 人团队', 'A four-storey showroom and office, with a team of 15', '地点一说明'),
      p2: F('佛山', 'Foshan', '地点二'),
      p2Text: F('办公室与展厅，30 人专业团队', 'Office and showroom, with a team of 30', '地点二说明'),
      p3: F('Setia Alam', undefined, '地点三'),
      p3Text: F('马来西亚仓储中心', 'Our warehouse centre in Malaysia', '地点三说明'),
    },
    images: PHOTO_SLOTS['company-showrooms'],
  },
  'company-certified': {
    title: '品质认证',
    section: 'company',
    fields: {
      title: F('品质，有据可查', 'Quality you can trace', '标题'),
      body: F(
        '材料的选择、比例与结构的讲究、对细节与质感的坚持，\n都经过权威认证，有据可查。',
        'Our choice of materials, our care for proportion and structure,\nand our attention to detail and texture are independently\ncertified and on record.',
        '正文',
        { multiline: true },
      ),
    },
    images: PHOTO_SLOTS['company-certified'],
  },
  'design-divider': {
    title: '方案 · 章节页（无 Material Board 时的封面）',
    section: 'design',
    fields: {
      label: F('{{chapterZh}}　方案', '{{chapterEn}} — Design', '章节', ONE),
      title: F('{{designTitle}}', '{{designTitleEn}}', '大标题（客户与地点）', { multiline: true }),
      lead: F('{{floorsLine}}，逐个空间的设计。', '{{floorsLineEn}}, room by room.', '一句话'),
    },
    images: PHOTO_SLOTS['design-divider'],
  },
  'service-divider': {
    title: '服务 · 章节页',
    section: 'service',
    fields: {
      label: F('{{chapterZh}}　服务', '{{chapterEn}} — Service', '章节', ONE),
      title: F('服务与交付', 'Service & Delivery', '大标题', { multiline: true }),
      lead: F('团队、流程、周期与维保。', 'Team, process, lead times and aftercare.', '一句话'),
    },
    images: PHOTO_SLOTS['service-divider'],
  },
  'service-process': {
    title: '服务流程',
    section: 'service',
    fields: {
      title: F('服务流程', 'Service Process', '标题', ONE),
      lead: F('五个步骤，从设计交底到交付使用。', 'Five steps, from the design briefing to handover.', '一句话'),
      s1: F('设计与基装交底验收', 'Design and site handover', '步骤一'),
      s1Text: F('与基装方交底，复核现场条件', 'Brief the main contractor and re-check site conditions', '步骤一说明'),
      s2: F('安装进场交底', 'Installation briefing', '步骤二'),
      s2Text: F('分件，清理安装位置，复核尺寸', 'Sort the parts, clear the install areas and re-check dimensions', '步骤二说明'),
      s3: F('安装作业', 'Installation', '步骤三'),
      s3Text: F('进群介绍，每日汇报，完工汇报', 'A group chat introduction, daily reports and a completion report', '步骤三说明'),
      s4: F('专人验收', 'Dedicated inspection', '步骤四'),
      s4Text: F('逐项验收，签验收回执', 'Item-by-item checks with a signed inspection receipt', '步骤四说明'),
      s5: F('交付', 'Handover', '步骤五'),
      s5Text: F('交付使用，进入维保周期', 'Ready to use, and into the maintenance period', '步骤五说明'),
    },
    images: PHOTO_SLOTS['service-process'],
  },
  'service-cycle': {
    title: '订单周期',
    section: 'service',
    fields: {
      title: F('订单周期', 'Lead Times', '标题'),
      // 天数是中英共用的一个数字（只印一次）；单位「天 / days」另一个字段
      s1: F('免漆系列', 'Paint-Free Series', '系列一'),
      s1N: F('60–75', undefined, '系列一天数', ONE),
      s1Unit: F('天', 'days', '系列一单位', ONE),
      s2: F('实木系列', 'Solid Wood Series', '系列二'),
      s2N: F('75–90', undefined, '系列二天数', ONE),
      s2Unit: F('天', 'days', '系列二单位', ONE),
    },
    images: PHOTO_SLOTS['service-cycle'],
  },
  'service-aftersales': {
    title: '售后维保',
    section: 'service',
    fields: {
      title: F('售后维保', 'Aftercare', '标题'),
      lead: F('交付之后，照顾还在继续。', 'Care that continues after delivery.', '一句话'),
      r1: F('入住前', 'Before move-in', '第一项'),
      r1Text: F('上门调试一次', 'One on-site adjustment visit', '第一项内容'),
      r2: F('每年', 'Every year', '第二项'),
      r2Text: F('一次集中维保调试', 'One scheduled maintenance visit', '第二项内容'),
      r3: F('五金质保', 'Hardware warranty', '第三项'),
      r3Text: F('＿＿ 年', '____ years', '五金质保年数（设计师填）', { enFrom: 'years' }),
      r4: F('板材质保', 'Panel warranty', '第四项'),
      r4Text: F('＿＿ 年', '____ years', '板材质保年数（设计师填）', { enFrom: 'years' }),
    },
    images: PHOTO_SLOTS['service-aftersales'],
  },
  closing: {
    title: '封底 · 联系方式',
    section: 'service',
    fields: {
      title: F('在溪岸\n回归生活的美好', 'By the stream,\nback to the beauty of everyday life.', '结语', { multiline: true }),
      l1: F('马来西亚展厅', 'Malaysia Showroom', '联系一', ONE),
      v1: F('Seksyen U13, 23-3, Jln Setia Prima SU13/S,\nSetia Alam, 40170 Shah Alam, Selangor', undefined, '展厅地址', { multiline: true }),
      l2: F('电话', 'Phone', '联系二', ONE),
      v2: F('+6011-2233 1919 (WhatsApp)', undefined, '电话号码'),
      l3: F('线上', 'Online', '联系三', ONE),
      v3: F('www.saildz.com\nInstagram @sail_malaysia', undefined, '网站与社交', { multiline: true }),
    },
    images: PHOTO_SLOTS['closing'],
  },
};

export const COMPANY_KEYS_B = Object.keys(COMPANY_PAGES_B);

/** 某些语言里版面上不放的照片位（中英版的「发展历程」字多，排成纸面两栏年表）：编辑器在这些语言里注明「这一版不放照片」 */
export const PHOTO_HIDDEN = { 'company-history': { photo: ['bi'] } };

// ---------------------------------------------------------------------------
// 章节：老客户可以隐藏品牌 / 公司 / 服务（项目信息 → 方案章节显示）——
// 目录只列看得到的章节、编号重排；章节页的「第二章」与方案封面的章节标签跟着变
// ---------------------------------------------------------------------------

/** 四个章节，按目录的顺序（目录里第 n 章的栏位 = ch{n}、ch{n}Line，跟着章节走） */
export const CHAPTERS = ['brand', 'company', 'design', 'service'];
const CN_NUM = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const EN_NUM = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
/** 2 → 「第二章」 */
export const chapterZh = (n) => `第${CN_NUM[n] ?? n}章`;
/** 2 → 「Chapter Two」 */
export const chapterEn = (n) => `Chapter ${EN_NUM[n] ?? n}`;

const ALL_CHAPTERS = { list: [...CHAPTERS], num: { brand: 1, company: 2, design: 3, service: 4 } };

/**
 * 整套里看得到哪几章（只算会导出的页）：
 *   品牌 / 公司 / 服务 = 这一章有启用的公司页（封底一直保留，不算服务章的内容）；
 *   方案 = 方案封面、本案材料、楼层页、效果图页有一页启用
 * 没有任何页的项目（单独排一页时）= 四章都在
 * @returns {{ list:string[], num:Record<string,number> }}  num = 每章的编号（隐藏的那章 = 它若显示时排第几）
 */
export function deckChapters(project) {
  const slides = project?.slides || [];
  if (!slides.length) return ALL_CHAPTERS;
  const shown = new Set();
  for (const s of slides) {
    if (!s || s.enabled === false) continue;
    if (s.kind === 'company') {
      const sec = COMPANY_PAGES_B[s.key]?.section;
      if (CHAPTERS.includes(sec) && s.key !== 'closing') shown.add(sec);
    } else if (s.kind === 'designCover' || s.kind === 'materials' || s.kind === 'floor' || s.kind === 'view') {
      shown.add('design');
    }
  }
  const list = CHAPTERS.filter((c) => shown.has(c));
  const num = Object.fromEntries(CHAPTERS.map((c, i) => [c, 1 + CHAPTERS.slice(0, i).filter((x) => shown.has(x)).length]));
  return { list, num };
}

// ---------------------------------------------------------------------------
// 旧模板的改写（按元素序号的数字键）：新版式不读；还留在数据里的列出来提醒设计师
// ---------------------------------------------------------------------------

const isLegacyKey = (k) => /^\d+$/.test(k);

/**
 * 这一页还留着的旧版改写：[{ bucket:'overrides'|'overridesEn', key, text }]（华文只看中文的；English / 中英两种都看）
 * 意思和新栏位一样的几处（封面、售后维保的质保年数、封底联系方式…）打开旧项目时已经搬走了（lib/project.js upgradeProject）
 */
export function legacyOverrides(slide, lang = 'zh') {
  const out = [];
  const buckets = lang === 'zh' ? ['overrides'] : ['overrides', 'overridesEn'];
  for (const bucket of buckets) {
    for (const [key, v] of Object.entries(slide?.[bucket] || {})) {
      if (isLegacyKey(key) && typeof v === 'string' && v.trim()) out.push({ bucket, key, text: v.trim() });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 只改了中文时，英文自动跟着变（enFrom）
// ---------------------------------------------------------------------------

const CN_DIGIT_VAL = { 〇: 0, 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** 「五」「十」「十五」「二十」→ 数字（1–99；认不出 = null） */
function cnNumber(s) {
  const t = String(s ?? '').trim();
  if (/^\d+(?:\.\d+)?$/.test(t)) return Number(t);
  const m = /^([一二两三四五六七八九])?(十)?([一二三四五六七八九])?$/.exec(t);
  if (!m || !t) return null;
  if (!m[2]) return m[1] && !m[3] ? CN_DIGIT_VAL[m[1]] : null;
  return (m[1] ? CN_DIGIT_VAL[m[1]] : 1) * 10 + (m[3] ? CN_DIGIT_VAL[m[3]] : 0);
}

/** 质保年数：「5 年」「10年」「五年」「3–5 年」→ '5 years'（1 → '1 year'；认不出 = ''） */
export function yearsEn(zh) {
  const t = clean(zh).replace(/\s+/g, '');
  const m = /^([0-9.]+|[一二两三四五六七八九十]+)(?:[-–~至到]([0-9.]+|[一二两三四五六七八九十]+))?年?$/.exec(t);
  if (!m) return '';
  const a = cnNumber(m[1]);
  const b = m[2] ? cnNumber(m[2]) : null;
  if (a == null || (m[2] && b == null)) return '';
  if (b != null) return `${a}–${b} years`;
  return a === 1 ? '1 year' : `${a} years`;
}

const EN_FROM = {
  years: (zh) => yearsEn(zh),
  // 认得出年月的（2026 · 09、二〇二六年九月）→ September 2026；认不出 = ''（纯英文的 Spring 2026 由下面原样用）
  date: (zh) => dateEn(zh, () => ''),
};

/**
 * 只改了中文、英文没改时英文用什么（'' = 没法自动，用英文默认稿并提醒）：
 *   能按 enFrom 换算的（「5 年」→ 5 years）→ 换算的英文；中文里一个汉字都没有（Mr & Mrs Lau、电话号码）→ 就用它
 */
function autoEnOf(f, zh) {
  const v = clean(zh);
  if (!v) return '';
  const derived = f.enFrom && EN_FROM[f.enFrom] ? EN_FROM[f.enFrom](v) : '';
  if (derived) return derived;
  return hasCJKText(v) ? '' : v;
}

// ---------------------------------------------------------------------------
// token：客户 / 地点 / 日期
// ---------------------------------------------------------------------------

const CN_DIGIT = '〇一二三四五六七八九';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const clean = (s) => String(s ?? '').replace(/\r/g, '').replace(/[ \t]+$/gm, '').replace(/^\n+|\n+$/g, '').trim();

function parseDate(s) {
  // 「二〇二六年九月」（封面默认的写法）先换成数字
  const t = String(s ?? '')
    .replace(/([〇零一二三四五六七八九]{4})(?=\s*年)/, (y) => [...y].map((c) => CN_DIGIT_VAL[c]).join(''))
    .replace(/年\s*(十[一二]?|[一二三四五六七八九])\s*月/, (all, mo) => `年${cnNumber(mo)}月`);
  const m = t.match(/(\d{4})\D{0,4}?(\d{1,2})(?!\d)/);
  if (!m) return null;
  const mo = Number(m[2]);
  return mo >= 1 && mo <= 12 ? { y: Number(m[1]), mo } : null;
}

/** '2026 · 08' → '二〇二六年八月'（认不出就原样） */
export function dateZh(s) {
  const d = parseDate(s);
  if (!d) return clean(s);
  const yy = String(d.y).split('').map((c) => CN_DIGIT[Number(c)]).join('');
  const mm = d.mo < 10 ? CN_DIGIT[d.mo] : d.mo === 10 ? '十' : `十${CN_DIGIT[d.mo - 10]}`;
  return `${yy}年${mm}月`;
}

/** '2026 · 08' → 'August 2026'（认不出：本来是英文就原样，中文交给翻译） */
export function dateEn(s, latin = (x) => (hasCJKText(x) ? '' : x)) {
  const d = parseDate(s);
  if (d) return `${MONTHS[d.mo - 1]} ${d.y}`;
  return latin(clean(s));
}

/**
 * 这一页用的 token：deck.js 给的（base）+ 本页另外要的
 *   英文 token（方案名、客户 · 地点）每次按 enOf 重算，缺翻译 = ''（页面上和别的没翻译的字一样：English 版先显示中文、中英版只显示中文）
 * @param {(zh:string)=>string} enOf  一段中文的英文（缺 = ''）
 */
export function companyTokensB(project, enOf, base = null) {
  const info = project?.info || {};
  const latin = (s) => {
    const v = clean(s);
    if (!v) return '';
    return hasCJKText(v) ? enOf(v) || '' : v;
  };
  const t = {
    clientLine: clientLine(info),
    dateLine: info.date || '',
    proposalTitle: info.proposalTitle || '全屋定制设计方案',
    floorsLine: floorsLine(project?.floors),
    ...(base || {}),
  };
  // 方案名的英文每次重算（不用 deck.js 给的）：自己改的中文方案名没有翻译时 = ''，页面和别的没翻译的字一样先显示中文，
  // 缺英文的提醒说的是真的，编辑器栏位与画布一致（deck.js 会退回通用的 'Whole-House Design Proposal'，配不上自定义的中文名）
  t.proposalTitleEn = latin(t.proposalTitle) || (t.proposalTitle === '全屋定制设计方案' ? 'Whole-House Design Proposal' : '');
  if (t.floorsLineEn === undefined) t.floorsLineEn = floorsLineEn(project?.floors || []);
  // 「地点 · 客户」的英文也重算（deck.js 缺翻译时会把中文原样放进英文里）：缺任何一段 = ''
  const lineEn = [info.location, info.client].map(clean).filter(Boolean).map(latin);
  t.clientLineEn = lineEn.every(Boolean) ? lineEn.join(' · ') : '';
  const parts = [info.client, info.location].map(clean).filter(Boolean);
  const partsEn = parts.map(latin);
  t.coverName = parts.join('\n');
  t.coverNameEn = partsEn.every(Boolean) ? partsEn.join('\n') : '';
  t.designTitle = t.coverName || '方案';
  t.designTitleEn = parts.length ? t.coverNameEn : 'Design';
  t.dateZh = dateZh(info.date);
  t.dateEn = dateEn(info.date, latin);
  return t;
}

// ---------------------------------------------------------------------------
// 旧接口（B 格物的基线 / 截短）：页面不再用，外部可能还在引用，保留
// ---------------------------------------------------------------------------

/** 网页预览里一行的基线位置（离行框顶）：B 格物的英文字体（Hanken / Ysabeau）的升部、降部 */
const FONT_V = { light: [1.0, 0.303], regular: [1.0, 0.303], title: [1.054, 0.289] };
export function baseOf(lang, role, over) {
  const st = styleOf(lang, role, over);
  const [a, d] = FONT_V[st.font] || FONT_V.light;
  return (st.lh - (a + d) * st.px) / 2 + a * st.px;
}

/** 一段文字在宽 w 的栏里排几行（\n 分段；B 格物字级） */
function nLines(text, lg, role, w, over, nowrap) {
  const st = styleOf(lg, role, over);
  return String(text ?? '')
    .split('\n')
    .reduce((n, line) => n + (nowrap ? 1 : wrapCount(line, st, lg, role, w + 2 * INSET)), 0);
}

/** 截到最多 maxLines 行，末尾加「…」（B 格物字级；C 版式用 kit.clampText） */
export function clampLines(text, lg, role, w, maxLines, over) {
  const s = String(text ?? '');
  if (nLines(s, lg, role, w, over) <= maxLines) return { text: s, cut: false };
  if (maxLines <= 0) return { text: '', cut: true };
  const chars = [...s];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const t = `${chars.slice(0, mid).join('').trimEnd()}…`;
    if (nLines(t, lg, role, w, over) <= maxLines) lo = mid;
    else hi = mid - 1;
  }
  let cut = chars.slice(0, lo).join('');
  if (lg === 'en') {
    const sp = cut.lastIndexOf(' ');
    if (sp > 0 && sp > cut.length - 24) cut = cut.slice(0, sp);
  }
  return { text: `${cut.replace(/[\s,，、;；:：·]+$/u, '')}…`, cut: true };
}

// ---------------------------------------------------------------------------
// C 安然 · 版式小工具（在 kit 之上）
// ---------------------------------------------------------------------------

const { PAGE } = K;
const sum = (a) => a.reduce((s, v) => s + v, 0);
const heightOf = (part) => (part ? Math.max(0, part.bottom - part.top) : 0);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** 这一页属于哪个品牌：「公司 · 瑞吉欧」章节 = 瑞吉欧（RICCIONE 商标、「瑞吉欧 / RICCIONE」签名），其余 = 溪岸 */
const brandOf = (R) => (R.def.section === 'company' ? 'riccione' : 'sail');
/** 内容排到这里为止（下面是页脚签名，中文行顶 944） */
const BOTTOM = 900;

/**
 * 托字渐变的深浅（默认照片按真实像素量出来的）：键 = 「页:哪一块」，「页:哪一块@语言」优先；没列的 = 最深 0.45
 *   量法：把托字渐变拿掉渲染，qa-contrast 量每段白字字形下面 90 分位的亮度，换算托到 4.5:1 至少要多深，再加 0.04 余量；
 *   白 logo 按非文字的 3:1 量。字下面一律至少 0.15（照片原本就够深也托一下，字更稳）
 *   设计师换的照片看不到像素，一律 0.45（宁可深一点）。换了默认图要重量（/tmp/claude-0/c/company/cal/）
 */
const SHADE_A = {
  'cover:logo': 0.15, // 芦苇后面的灰墙：不托也够 3:1
  'cover:title': 0.15, // 灰墙：不托也够 4.5:1
  'contents:left': 0.45, // 门洞两边是清水墙：要托满（「CONTENTS」0.44）
  'contents:logo': 0.45, // 右上是亮墙和枯枝
  'brand-divider:label': 0.25, // 深色山体（「BRAND」0.20）
  'brand-philosophy:logo': 0.2, // 书格：不托也够 3:1
  'brand-story:logo': 0.45, // 清水墙顶（0.42）
  'brand-awards:logo': 0.45, // 窗边的亮处（0.41）
  'company-divider:left': 0.35, // 红杉林左侧（「COMPANY」0.20；细衬线压在高频的蕨叶上，多托一点才好认）
  'company-divider:left@en': 0.45, // English / 中英的白色 RICCIONE 商标压到亮的树缝（文字版时 0.40）
  'company-divider:left@bi': 0.45,
  'company-divider:right': 0.45, // 右上树缝的天光（白色 RICCIONE 商标 0.40）
  'company-about:logo': 0.3, // 墙上的旧画布（0.23）
  'company-showrooms:logo': 0.2, // 天花和轨道灯（0.13）
  'service-divider:label': 0.2, // 深色书格（「SERVICE」0.16）
  'service-aftersales:logo': 0.2, // 挂画的皮面：不托也够 3:1
};

/** 不含中文的字（年份、品牌名、Setia Alam、Mr Lau）：华文 / 中英版里也按英文字级排（Ogg / Outfit），编辑字段仍是中文栏 */
function latinOf(pair, lang) {
  const zh = clean(pair?.zh);
  const en = clean(pair?.en);
  if (lang === 'en' || !zh || hasCJK(zh)) return [pair, lang];
  if (lang === 'zh' || !en || en === zh) return [{ en: zh, fieldEn: pair.field }, 'en'];
  return [pair, lang];
}

/**
 * 默认稿里的手动换行是照旧版式的栏宽断的：有一行在这一栏里放不下（要折行）时，整段按栏宽重新排
 *   （英文行与行之间接一个空格，中文直接接上），免得排出「… makes / furniture / that returns …」这种落单的词
 */
function reflow(text, st, w) {
  const t = clean(text);
  if (!t.includes('\n') || K.wrapText(t, st, w).every((p) => p.length <= 1)) return t;
  return t
    .split('\n')
    .map(clean)
    .filter(Boolean)
    .reduce((acc, line) => (!acc ? line : /[A-Za-z0-9,.;:!?)%]$/.test(acc) && /^[A-Za-z0-9(“"]/.test(line) ? `${acc} ${line}` : `${acc}${line}`), '');
}

/**
 * 一对中英文（kit.pairBlock）：opts.latin = 纯拉丁字按英文字级排；opts.reflow = 放不下的手动换行按栏宽重排；
 *   默认均衡断行（2–3 行的段落各行长短接近，不留落单的一个字 / 词），opts.balance = false 关掉
 */
function duo(x, y, w, pair, lang, role, opts = {}) {
  let [p, l] = opts.latin ? latinOf(pair, lang) : [pair, lang];
  if (opts.reflow) {
    // 只重排默认稿（它的手动换行是照旧版式的栏宽断的）；设计师改过的字照原样分段（空行、落款都留着）
    const enRole = opts.enRole || (typeof role === 'string' ? K.EN_ROLE[role] || role : role);
    const ed = pair?.edited || {};
    p = { ...p, zh: ed.zh ? p.zh : reflow(p.zh, K.style(role), w), en: ed.en ? p.en : reflow(p.en, K.style(enRole), w) };
  }
  return K.pairBlock(x, y, w, p, l, role, { balance: true, ...opts });
}

/** 页脚签名：English 版只排英文那一行（整页不出现中文），华文 / 中英版中英两行 */
const sign = (R, brand, opts = {}) => K.signature(brand, { ...opts, enOnly: R.lang === 'en' });

/** 左对齐的页脚签名（右下角压在亮处、托不住时用；字级、行顶同 kit.signature） */
function signatureLeft(R, x, brand, color = B.foot) {
  const t = K.SIGNATURE[brand] || K.SIGNATURE.sail;
  const en = K.textLines(x, PAGE.sigTop + 38, [[t.en]], 'sigEn', { color, name: 'signature' });
  if (R.lang === 'en') return { els: [en.el], x0: en.x0, x1: en.x1, top: en.top, bottom: en.bottom };
  const zh = K.textLines(x, PAGE.sigTop, [[t.zh]], 'sigZh', { color, name: 'signature' });
  return { els: [zh.el, en.el], x0: x, x1: Math.max(zh.x1, en.x1), top: zh.top, bottom: en.bottom };
}

/** 只放一块元素的组（细线、logo…） */
const solo = (el, h = el.h) => ({ els: [el], top: el.y, bottom: el.y + h, x0: el.x, x1: el.x + el.w });

/**
 * 一栏自上而下排几组（标题组、正文、细线、结语、表格…）：
 *   gap = [理想, 最小]（和上一组之间）。先按理想间距排；放不下就按比例收到最小；还放不下 → flex 那一组按剩下的地方截短（maxBottom）
 *   opts.align 'center'：整组的中心落在 opts.center（不超出 top / bottom）
 *   build(y, maxBottom, measuring) → { els, top, bottom }（measuring = 只量高度：表格不往下撑）
 * @returns {{ parts, els, top, bottom }}
 */
function flow(top, bottom, groups, opts = {}) {
  let gs = groups.filter(Boolean);
  // 连最紧的排法（flex 组截到每种语言一行、间距最小）都放不下：有 alt 的组（标题组、金句…）换成紧凑版（截短 + 提醒）
  const gap1 = (g, i) => (i === 0 ? 0 : g.gap?.[1] ?? g.gap?.[0] ?? 40);
  const tight = gs.reduce((h, g, i) => h + heightOf(g.build(0, g.flex ? 0 : Infinity, 'min')) + gap1(g, i), 0);
  if (tight > bottom - top) gs = gs.map((g) => (g.alt ? { ...g, build: g.alt } : g));
  const hs = gs.map((g) => heightOf(g.build(0, Infinity, true)));
  const ideal = gs.map((g, i) => (i === 0 || !hs[i] ? 0 : g.gap?.[0] ?? 40));
  const min = gs.map((g, i) => (i === 0 || !hs[i] ? 0 : g.gap?.[1] ?? ideal[i]));
  const room = bottom - top;
  const H = sum(hs);
  let gaps = ideal;
  if (H + sum(ideal) > room) {
    const t = clamp((room - H - sum(min)) / Math.max(1, sum(ideal) - sum(min)), 0, 1);
    gaps = ideal.map((v, i) => Math.round(min[i] + (v - min[i]) * t));
  }
  // opts.fill：内容短时把组间距按比例拉开（每组最多到 gap[2]，默认理想的 1.8 倍），让栏底落在 fill 附近、不留大空洞
  if (opts.fill != null && H + sum(gaps) < opts.fill - top) {
    const max = gs.map((g, i) => (i === 0 || !hs[i] ? 0 : g.gap?.[2] ?? Math.round(ideal[i] * 1.8)));
    const want = opts.fill - top - H - sum(gaps);
    const can = sum(max) - sum(gaps);
    if (can > 0) gaps = gaps.map((v, i) => Math.round(v + (max[i] - v) * Math.min(1, want / can)));
  }
  const total = H + sum(gaps);
  let y = top;
  if (opts.align === 'center' && total < room) y = Math.round(clamp(Math.max(opts.center - total / 2, (opts.minBottom ?? -Infinity) - total), top, bottom - total));
  // 后面几组最少要多高（表格按最小的行距）：flex 那一组只能用剩下的地方；表格放不下先收行距，再减行
  const mins = gs.map((g) => heightOf(g.build(0, Infinity, 'min')));
  const parts = [];
  gs.forEach((g, i) => {
    y += gaps[i];
    const rest = sum(mins.slice(i + 1)) + sum(gaps.slice(i + 1));
    const p = g.build(y, bottom - rest, false);
    parts.push(p);
    y = p.bottom;
  });
  return { parts, els: parts.flatMap((p) => p.els), top: parts[0]?.top ?? top, bottom: y };
}

/** 每格最多几行：先不限，再 3、2、1 行（截短 + 提醒） */
const CELL_LINES = [Infinity, 3, 2, 1];

/**
 * 表格：细线分隔的几行；每行几格（cell(y, maxLines) → part），行高 = 最高的一格 + 上下各 pad
 *   pad 在 [min, max] 里取：opts.fill = 能把表撑到哪（不超过 maxBottom）；放不下先收 pad，再一档一档减每格的行数
 *   opts.rule = 细线样式（默认年表的 C9B9A6）；opts.segments = [[x, w], …] 细线分几段画（左右两栏的年表）；
 *   opts.rules = false 不画细线；opts.ruleTop / ruleBottom = false 不要最上 / 最下那条
 * @returns {(y, maxBottom, measuring) => { els, top, bottom, rows, x0, x1 }}
 */
function table(x, w, rows, opts = {}) {
  const ruleOpts = opts.rule || { color: B.hair, alpha: 1, h: 1 };
  const segs = opts.segments || [[x, w]];
  const rule = (y) => (opts.rules === false ? [] : segs.map(([sx, sw]) => K.rule(sx, y, sw, ruleOpts)));
  const [padMin, padIdeal, padMax] = opts.pad || [12, 20, 40];
  return (y0, maxBottom = Infinity, measuring = false) => {
    const n = rows.length;
    const measure = (k) => rows.map((r) => Math.max(0, ...r.map((cell) => heightOf(cell(0, k)))));
    let k = 0;
    let hs = measure(CELL_LINES[0]);
    let pad = measuring === 'min' ? padMin : padIdeal;
    const target = measuring ? null : Math.min(opts.fill ?? -Infinity, maxBottom);
    if (target != null && Number.isFinite(target) && target > y0) pad = clamp((target - y0 - sum(hs)) / (2 * n), padMin, padMax);
    while (y0 + sum(hs) + 2 * pad * n > maxBottom + 0.5) {
      if (pad > padMin) {
        pad = Math.max(padMin, (maxBottom - y0 - sum(hs)) / (2 * n));
        continue;
      }
      if (k + 1 >= CELL_LINES.length) break;
      k += 1;
      hs = measure(CELL_LINES[k]);
    }
    pad = Math.round(pad);
    const els = opts.ruleTop === false ? [] : rule(y0);
    const out = [];
    let y = y0;
    rows.forEach((r, i) => {
      const top = y + pad;
      for (const cell of r) els.push(...cell(top, CELL_LINES[k]).els);
      y = top + hs[i] + pad;
      out.push({ top: top - pad, bottom: y });
      if (i < n - 1 || opts.ruleBottom !== false) els.push(...rule(y));
    });
    return { els, top: y0, bottom: y, rows: out, x0: x, x1: x + w };
  };
}

/** 一组文字的返回值 → flow 的组 */
const part = (r) => ({ els: r.els || (r.el ? [r.el] : []), top: r.top, bottom: r.bottom, x0: r.x0, x1: r.x1 });

/** 标题组（flow 的组）：放不下时的紧凑版 = 英文、中文各一行（截短 + 提醒） */
const titleG = (R, x, w, opts = {}) => ({
  build: (y) => part(K.titleGroup(x, y, w, R.pair('title'), R.lang, opts)),
  alt: (y) => part(K.titleGroup(x, y, w, R.pair('title'), R.lang, { ...opts, maxLines: { en: 1, zh: 1 } })),
});

/** 一行文字里几段（各自的编辑字段），整行居中 / 左对齐：parts = [{ text, field, role }]，段与段之间「 · 」 */
function inlineRun(x, y, parts, opts = {}) {
  const ps = parts.filter((p) => clean(p.text));
  if (!ps.length) return { els: [], top: y, bottom: y, x0: x, x1: x };
  const sts = ps.map((p) => K.style(p.role, opts));
  const texts = ps.map((p, i) => {
    const t = sts[i].caps || (opts.upperLatin && !hasCJK(p.text)) ? clean(p.text).toUpperCase() : clean(p.text);
    return i < ps.length - 1 ? `${t} · ` : t;
  });
  const ws = texts.map((t, i) => K.measure(t, sts[i]));
  const lastSp = (sts[sts.length - 1].spacing || 0) * PX_PER_PT;
  const ink = sum(ws) - lastSp;
  let cx = opts.align === 'ctr' ? x - ink / 2 : x;
  const els = [];
  let bottom = y;
  ps.forEach((p, i) => {
    const r = K.textLines(cx, y, [[texts[i]]], sts[i], { field: p.field, lh: opts.lh });
    els.push(r.el);
    bottom = Math.max(bottom, r.bottom);
    cx += ws[i];
  });
  return { els, top: y, bottom, x0: opts.align === 'ctr' ? x - ink / 2 : x, x1: (opts.align === 'ctr' ? x - ink / 2 : x) + ink, w: ink };
}

/**
 * 章节页的栏目名（「BRAND / 第一章　品牌」）：英文页眉 = 英文章节标签「Chapter One — Brand」里破折号后面那一段（样张：去掉 CHAPTER ONE）；
 *   English 版：章名下面一行小字「CHAPTER ONE」（同一个英文栏位）
 */
function chapterLabel(R, x, y, w, color) {
  const p = R.pair('label');
  const en = clean(p.en);
  const m = /^(.*?\S)\s+[—–]\s+(.+)$/u.exec(en);
  const head = m ? m[2] : en;
  const chap = m ? m[1] : '';
  const g = K.titleGroup(x, y, w, { zh: p.zh, en: head, field: p.field, fieldEn: p.fieldEn }, R.lang, { size: 'chapter', color, maxLines: { en: 1, zh: 1 }, label: '章节' });
  if (R.lang !== 'en' || !chap || !g.en) return g;
  const c = K.textBlock(x, g.bottom + 8, w, chap, K.style('sigEn', { size: 15, spacing: 6, lh: 28, color }), { field: p.fieldEn, maxLines: 1, label: '章节' });
  return { ...g, els: [...g.els, ...c.els], bottom: c.bottom, x1: Math.max(g.x1, c.x1) };
}

/**
 * 华文版也印英文的栏位（Aman 的做法：英文大写是装饰性的页眉 / 栏目名）：编辑器的华文版给这些栏位英文框；
 * 中文改过、英文没跟上时页眉的英文先不印并提醒（R.pair）
 */
export const ZH_EN_HEADER = {
  contents: ['title'],
  'brand-divider': ['label'],
  'brand-philosophy': ['title'],
  'brand-story': ['title'],
  'brand-collections': ['title'],
  'brand-awards': ['title'],
  'brand-supply': ['title'],
  'company-divider': ['label'],
  'company-about': ['title'],
  'company-history': ['title'],
  'company-showrooms': ['title'],
  'company-certified': ['title'],
  'design-divider': ['label'],
  'service-divider': ['label'],
  'service-process': ['title'],
  'service-cycle': ['title'],
  'service-aftersales': ['title'],
};

/** 项目自己的图（效果图、楼层图、平面图、立体图、Material Board、材料小样）：瑞吉欧的页不能用它们 */
function projectImageSet(project) {
  const set = new Set();
  const add = (s) => {
    if (typeof s === 'string' && s.trim()) set.add(s.trim());
  };
  for (const s of project?.slides || []) add(s?.image);
  for (const f of project?.floors || []) {
    add(f?.image);
    add(f?.plan);
    (f?.renders3d || []).forEach(add);
  }
  add(project?.cover?.image);
  for (const m of project?.materials || []) add(m?.image);
  return set;
}

// ---------------------------------------------------------------------------
// 渲染上下文
// ---------------------------------------------------------------------------

function makeR(key, slide, ctx) {
  const def = COMPANY_PAGES_B[key];
  const project = ctx?.project || {};
  const lang = ctx?.lang === 'en' || ctx?.lang === 'bi' || ctx?.lang === 'zh' ? ctx.lang : langOf(project);
  const tr = ctx?.tr || makeTranslator(project);
  // 英文 token 先只「看」翻译、不记缺（每一页都会算 token，不能让没显示客户名的页也提醒缺英文）；
  // 真的用到、又没有翻译时，再通过 tr 记下来（touch）
  const peek = (s) => (lang === 'zh' ? '' : resolveEn(project, s, 'text').text);
  const tokens = companyTokensB(project, peek, ctx?.tokens || null);
  // 这一页所在章节的编号（隐藏了前面的章节就往前排）：章节页的「第二章」/「Chapter Two」
  const chapters = ctx?.chapters || deckChapters(project);
  if (CHAPTERS.includes(def.section)) {
    const n = chapters.num?.[def.section] ?? CHAPTERS.indexOf(def.section) + 1;
    tokens.chapterZh = chapterZh(n);
    tokens.chapterEn = chapterEn(n);
  }
  const info = project.info || {};
  const TOKEN_SRC = {
    coverNameEn: [info.client, info.location],
    designTitleEn: [info.client, info.location],
    clientLineEn: [info.location, info.client],
    proposalTitleEn: [tokens.proposalTitle],
    dateEn: [info.date],
  };
  const touch = (tpl) => {
    if (lang === 'zh') return;
    for (const m of String(tpl ?? '').matchAll(/\{\{(\w+)\}\}/g)) {
      if (tokens[m[1]]) continue;
      for (const s of TOKEN_SRC[m[1]] || []) {
        const v = clean(s);
        if (v && hasCJKText(v)) tr.en(v, 'text');
      }
    }
  };
  const warnings = [];
  const warn = (w) => {
    if (w && !warnings.includes(w)) warnings.push(w);
  };
  const fill = (s) => clean(fillTokens(s, tokens));
  const staleEn = [];
  const areaCuts = []; // 截短了、但说不出是哪一栏的（整组排不下）
  const cutFields = []; // 明确知道是哪一栏少排了（例如封底地址超过三行）

  const R = {
    key,
    def,
    lang,
    tokens,
    chapters,
    warnings,
    warn,
    /**
     * 一个字段的中英文（含设计师的改写）
     *   edited = { zh, en }：设计师改过（英文自动跟着中文换算的也算改过）—— 改过的字照设计师的分段排，不按默认稿的栏宽重排
     */
    pair(field) {
      const f = def.fields[field];
      if (!f) return { zh: '', en: '' };
      const oz = slide?.overrides?.[field];
      const oe = slide?.overridesEn?.[field];
      const zh = fill(typeof oz === 'string' ? oz : f.zh);
      const shared = f.en === undefined;
      // 只改了中文：能自动换成英文的（Mr & Mrs Lau、5 年 → 5 years）英文跟着变，不再提醒
      const auto = !shared && typeof oz === 'string' && typeof oe !== 'string' ? autoEnOf(f, zh) : '';
      let en = typeof oe === 'string' ? fill(oe) : shared ? zh : auto || fill(f.en);
      const fields = { field: `overrides.${field}`, fieldEn: shared && typeof oe !== 'string' ? `overrides.${field}` : `overridesEn.${field}` };
      const edited = { zh: typeof oz === 'string', en: typeof oe === 'string' || !!auto || (shared && typeof oz === 'string') };
      // 英文栏清空 = 这一行在英文里不要：English 版不显示（不退回中文），中英版只显示中文
      if (typeof oe === 'string' && !en) return { zh: lang === 'en' ? '' : zh, en: '', ...fields, edited };
      // 这一段的英文用到了还没有翻译的客户 / 地点 / 方案名：现在才记「缺英文」（页面会提醒）
      if (!auto) touch(typeof oe === 'string' ? oe : f.en);
      const stale = !shared && !auto && typeof oz === 'string' && typeof oe !== 'string' && clean(oz) !== clean(fillTokens(f.zh, tokens));
      if (stale && lang !== 'zh') staleEn.push(f.label);
      // 华文版：英文只当装饰性的大写页眉印（ZH_EN_HEADER）。中文改过、英文还是默认稿 → 不印这行过期的英文（和中文对不上），
      // 提醒设计师补英文（补上了就照常印）
      if (stale && lang === 'zh') {
        en = '';
        if ((ZH_EN_HEADER[key] || []).includes(field)) staleEn.push(f.label);
      }
      return { zh, en, ...fields, edited };
    },
    /** 照片位用哪张图：设计师换过的（slide.images）优先，否则默认图 */
    resolve(name) {
      const d = def.images[name];
      const over = slide?.images?.[name];
      let src = d?.src || null;
      let nat = d?.nat || null;
      let frame = d?.frame || {};
      if (over !== undefined) {
        if (typeof over === 'string' && over.trim()) {
          src = over.trim();
          nat = (typeof ctx?.meta === 'function' && ctx.meta(src)) || null;
          frame = {};
        } else if (over === null || over === '') {
          src = null;
        }
      }
      return { src, nat, frame, label: d?.label || name };
    },
    /** 照片的宽高比（不知道 = null）：版式按横图 / 竖图选框 */
    ratio(name) {
      const { src, nat } = R.resolve(name);
      return src && nat?.w && nat?.h ? nat.w / nat.h : null;
    },
    /** 设计师换过这个照片位的图（slide.images 里是一张图）：看不到像素，托字一律最深 */
    customPhoto(name) {
      const over = slide?.images?.[name];
      return typeof over === 'string' && !!over.trim();
    },
    /**
     * 照片位 → 图片元素（kit.placePhoto：cover 裁满 + 取景，不加色层；缺图 / 像素偏低记提醒）
     *   opts.dark = 白字压在这张照片上：缺图时的占位用深色色带（白字照样读得清）
     * @returns {{ el, scale, win, box:{x,y,w,h}, custom:boolean, has:boolean }}
     */
    photo(name, x, y, w, h, opts = {}) {
      const img = R.resolve(name);
      const r = K.placePhoto(img, x, y, w, h, { field: `image.${name}`, name: `photo:${name}` });
      r.warnings.forEach(warn);
      // 品牌分开：瑞吉欧的页（公司章节）换上了本案的效果图 / 楼层图 → 提醒（一键跳到这张照片）
      if (brandOf(R) === 'riccione' && R.customPhoto(name) && projectImageSet(project).has(img.src)) {
        warn(`瑞吉欧页面只用瑞吉欧的照片：「${img.label}」换成了本案的图 —— 恢复默认，或上传瑞吉欧的照片`);
      }
      if (!img.src && opts.dark) r.el = { ...r.el, fill: B.band };
      return { ...r, box: { x, y, w, h }, custom: R.customPhoto(name), has: !!img.src };
    },
    /**
     * 白字 / 白 logo 压在照片上：字下面的局部托字渐变（kit.shade，1C1915，最深 45%）
     *   默认照片按实测的深浅（SHADE_A「页:哪一块」），换过的照片一律最深；照片缺了（深色占位）就不用托
     */
    shade(ph, parts, what, opts = {}) {
      if (!ph?.has) return null;
      const ink = K.inkBox(...parts.filter(Boolean));
      if (!ink) return null;
      // 量过的深浅只对默认照片 + 默认文案有效：改过这一页的字（字可能排到照片更亮的地方）或换了照片 → 一律最深
      const edited = ['overrides', 'overridesEn'].some((b) => Object.entries(slide?.[b] || {}).some(([k, v]) => !isLegacyKey(k) && typeof v === 'string'));
      const alpha = ph.custom || edited ? K.ALPHA.shadeMax : SHADE_A[`${key}:${what}@${lang}`] ?? SHADE_A[`${key}:${what}`] ?? K.ALPHA.shadeMax;
      return K.shade(ink, ph.box, { ...opts, alpha })?.el || null;
    },
    /** 这一组有截短（说不出是哪一栏时，提醒里用 what 说位置） */
    cutWarn(cut, what) {
      if (cut && !areaCuts.includes(what)) areaCuts.push(what);
    },
    /** 这一栏少排了（不是靠「…」截短的，例如封底的地址只排前三行） */
    cutAt(field) {
      if (field && !cutFields.includes(field)) cutFields.push(field);
    },
    finish(out) {
      const els = (Array.isArray(out) ? out : out.els).filter(Boolean);
      const bg = Array.isArray(out) ? B.paper : out.bg || B.paper;
      // 截短提醒：说出是哪几栏（「第一章说明」「正文（英文）」）—— 编辑器的一键修复直接跳到那一栏
      for (const el of els) {
        if (!el?._cut) continue;
        if (el.edit?.field && !cutFields.includes(el.edit.field)) cutFields.push(el.edit.field);
        delete el._cut;
      }
      const named = cutFields.map((f) => fieldLabel(def, f)).filter(Boolean);
      if (named.length) {
        warn(`文字太长放不下：${[...new Set(named)].slice(0, 3).map((s) => `「${s}」`).join('')}已截短（末尾「…」）—— 请删减`);
      } else if (areaCuts.length) {
        warn(`文字太长放不下：「${areaCuts[0]}」已截短（末尾「…」）—— 请删减`);
      }
      if (lang !== 'zh' && staleEn.length) {
        warn(`改过的中文还没有对应的英文：${[...new Set(staleEn)].slice(0, 3).map((s) => `「${s}」`).join('')} —— 在右侧英文栏里补上`);
      } else if (lang === 'zh' && staleEn.length) {
        // 华文版只管页眉：英文大写页眉先不印（和改过的中文对不上）
        warn(`改过的中文还没有对应的英文：${[...new Set(staleEn)].slice(0, 3).map((s) => `「${s}」`).join('')} —— 英文页眉先不印；在右侧英文栏里补上就会印出来`);
      }
      // 旧版留下的改写（新版式没有对应的栏位）：列出来，设计师对照着重新填，再点「知道了」清掉
      const legacy = legacyOverrides(slide, lang);
      if (legacy.length) {
        const sample = legacy
          .slice(0, 2)
          .map((x) => `「${x.text.length > 14 ? `${x.text.slice(0, 14)}…` : x.text}」`)
          .join('');
        warn(`旧版里改过的字新版式没有沿用（${legacy.length} 处）：${sample} —— 需要的话在右侧重新填，再点「知道了」`);
      }
      return page(els, warnings, { bg });
    },
  };
  return R;
}

/** 编辑字段（overrides.<栏位> / overridesEn.<栏位>）→ 编辑器里的栏位名（英文的加「（英文）」） */
function fieldLabel(def, editField) {
  const m = /^(overrides|overridesEn)\.(\w+)$/.exec(String(editField || ''));
  const f = m && def.fields[m[2]];
  if (!f) return '';
  return m[1] === 'overridesEn' ? `${f.label}（英文）` : f.label;
}

/**
 * 提醒里的栏位名 → 编辑字段（编辑器的一键修复用）：「第一章说明」→ overrides.ch1Line；「正文（英文）」→ overridesEn.body
 * @returns {string|null}
 */
export function companyFieldByLabel(key, label) {
  const def = COMPANY_PAGES_B[key];
  if (!def || !label) return null;
  const en = /（英文）$/.test(label);
  const name = label.replace(/（英文）$/, '');
  const hit = Object.entries(def.fields).find(([, f]) => f.label === name);
  if (!hit) return null;
  return `${en ? 'overridesEn' : 'overrides'}.${hit[0]}`;
}

// ---------------------------------------------------------------------------
// 各页版式（C 安然）
//   每个 lay* 返回元素数组，或 { els, bg }（满版照片页的底色 = 实色色带 B.band，照片没出来时也不是一片米色）
// ---------------------------------------------------------------------------

// —— 字级（在 kit.SCALE 之上微调：表格、说明的行高收紧一点）——
const ST = {
  key: K.style('rowKey', { lh: 36 }), // 表格项名（HarmonyOS Medium 20pt 字距 4，7B593D）
  keyEn: K.style('rowKeyEn', { lh: 32 }),
  name: K.style('body', { size: 20, spacing: 1, lh: 34, color: B.table }), // 奖项名、地点名（20pt，333333）
  nameEn: K.style('bodyEn', { size: 20, spacing: 0.4, lh: 32, color: B.table }),
  note: K.style('body', { lh: 32 }), // 说明（18pt，464646）
  noteEn: K.style('bodyEn', { lh: 30 }),
  year: K.style('year'), // 年份 Ogg 26pt
  yearBig: K.style('year', { size: 44, spacing: 2, lh: 60 }), // 品牌故事的两个年份
  brand: K.style('display', { caps: false, spacing: 2, lh: 64, color: B.table }), // 供应链的品牌名（Ogg 42pt）
  num: K.style('tocNum', { color: B.title, lh: 72 }), // 纸面上的大编号（Ogg Medium 60pt）
};

/** 名字太长时一档一档缩小（字号 / 字距 / 行高），直到排得下 maxLines 行；最后一档再放不下就截短 */
function fitText(x, y, w, text, role, variants, opts = {}) {
  const maxLines = opts.maxLines ?? 2;
  const lines = (v) => K.wrapText(text, K.style(role, v), w, { balance: true }).flat().length;
  // 先找一行排得下的那一档（短名字缩一档排一行，比大字折成「MR / & MRS LAU」好），再找 maxLines 行的
  for (let t = 1; t <= maxLines; t++) {
    const v = variants.find((vv) => lines(vv) <= t);
    if (v) return K.textBlock(x, y, w, text, role, { ...opts, ...v, balance: true });
  }
  const last = variants[variants.length - 1];
  return K.textBlock(x, y, w, text, role, { ...opts, ...last, balance: true, maxLines: opts.lastMax ?? maxLines + 1 });
}

/** 大字的几档（第一档 = 字级表原样） */
const FIT = {
  coverName: [{}, { size: 54, spacing: 14, lh: 92 }, { size: 44, spacing: 9, lh: 74 }],
  coverNameZh: [{}, { size: 44, spacing: 10, lh: 78 }, { size: 36, spacing: 6, lh: 62 }],
  hero: [{}, { size: 48, spacing: 6, lh: 88 }, { size: 40, spacing: 4, lh: 70 }],
  heroBi: [{}, { size: 40, spacing: 4, lh: 70 }, { size: 34, spacing: 3, lh: 58 }],
  heroEn: [{}, { size: 34, spacing: 4, lh: 50 }, { size: 28, spacing: 3, lh: 42 }],
  name: [{}, { size: 56, spacing: 10, lh: 100 }, { size: 44, spacing: 6, lh: 78 }],
  nameEn: [{}, { size: 48, spacing: 10, lh: 76 }, { size: 38, spacing: 6, lh: 60 }],
};

/**
 * 章节页 / 封底的大字（标题栏位）：华文 = 宋体大字；English = Ogg 大写；中英 = 两种都排（enFirst = 英文在上）；
 *   纯拉丁字（方案章节页的 Mr Lau / Muar）三种语言都用 Ogg 大写；中英版的中文两行能并成一行就并（「自然栖居　生活回归」）
 *   太长：一档一档缩小（FIT），英文最多 4 行、中文最多 3 行，再放不下才截短
 */
function heroBuilder(R, x, w, color, roles, opts = {}) {
  const [p0, l] = latinOf(R.pair(opts.field || 'title'), R.lang);
  return (y, mb = Infinity) => {
    let p = p0;
    const zhRole = l === 'bi' ? roles.bi : roles.zh;
    if (l === 'bi' && p.zh && p.en) {
      const joined = clean(p.zh).replace(/\n+/g, '　');
      if (K.wrapText(joined, K.style(zhRole), w).flat().length === 1) p = { ...p, zh: joined };
    }
    const items = K.pick(l, p);
    // 只有英文一块（English 版、Mr Lau / Muar 这种纯拉丁字）：地方宽裕，先试大一号（Ogg 60 / 54pt，最多 4 行）
    const enOnly = items.length === 1 && items[0].lang === 'en' && roles.en === 'heroEn';
    const enFit = enOnly ? [{ size: 60, spacing: 8, lh: 80 }, { size: 54, spacing: 8, lh: 74 }, ...FIT.heroEn] : FIT[roles.en];
    const zhFit = FIT[zhRole];
    const n = Math.max(enFit.length, zhFit.length);
    const at = (arr, k) => arr[Math.min(k, arr.length - 1)];
    const lines = (st, txt) => K.wrapText(txt, st, w, { balance: true }).flat().length;
    const fits = (k) => {
      let h = 0;
      for (const it of items) {
        const en = it.lang === 'en';
        const st = K.style(en ? roles.en : zhRole, at(en ? enFit : zhFit, k));
        const nl = lines(st, it.text);
        if (nl > (en ? opts.enLines ?? (enOnly ? 4 : 3) : 3)) return false;
        h += nl * st.lh;
      }
      return h + 14 * (items.length - 1) <= (opts.maxH ?? Infinity);
    };
    let k = 0;
    while (k < n - 1 && !fits(k)) k += 1;
    const zhSt = K.style(zhRole, { ...at(zhFit, k), color });
    const enSt = K.style(roles.en, { ...at(enFit, k), color });
    return part(K.pairBlock(x, y, w, p, l, zhSt, { enRole: enSt, enFirst: opts.enFirst !== false, gap: 14, maxLines: 4, balance: true, maxBottom: mb }));
  };
}


// ===========================================================================
// 封面：照片贴左 1680（1.15 倍、上下贴边）+ 右侧 240 实色竖带（竖排签名）；客户 Ogg 大写一行、白短线、方案名、「地点 · 日期」一行小字
// ===========================================================================

function layCover(R) {
  const { lang } = R;
  const PW = 1680;
  const ph = R.photo('photo', 0, 0, PW, PAGE.H, { dark: true });
  const band = { t: 'rect', x: PW, y: 0, w: PAGE.W - PW, h: PAGE.H, fill: B.band, name: 'band' };
  const logo = K.cornerLogo('sail', { onPhoto: true, corner: 'tl' });
  const vsig = K.signatureVertical(PW + (PAGE.W - PW) / 2, 'sail');
  // English 版：竖带里只留英文两行和竖线（整页不出现中文）
  if (lang === 'en') vsig.els = vsig.els.slice(1);
  const CX = 960;
  // 字组宽 960（x 480–1440）：左边的芦苇穗很亮，长名字 / 长地址不要排过去
  const W = 960;
  const white = { color: B.white, align: 'ctr' };
  // 客户与地点：第一行 = 客户（大字），其余行 = 地点（并进最下面那一行小字「MUAR · 二〇二六年八月」）
  const items = K.pick(lang, R.pair('name')).map((it) => {
    const lines = clean(it.text).split('\n').map(clean).filter(Boolean);
    return { ...it, head: lines[0] || '', rest: lines.slice(1).join(' · ') };
  });
  const subs = K.pick(lang, R.pair('subtitle'));
  // 没有客户：方案名当大标题
  const heads = items.length ? items : subs.map((it) => ({ ...it, head: clean(it.text).replace(/\n+/g, ' '), rest: '' }));
  const groups = heads.map((it, i) => {
    const role = hasCJK(it.head) ? 'coverNameZh' : 'coverName';
    const vs = i > 0 ? FIT[role].slice(1) : FIT[role];
    return {
      gap: [10, 4],
      build: (y) => part(fitText(CX, y, W, it.head, role, vs, { ...white, field: it.field, maxLines: 2 })),
      alt: (y) => part(fitText(CX, y, W, it.head, role, vs, { ...white, field: it.field, maxLines: 1, lastMax: 1 })),
    };
  });
  groups.push({ gap: [28, 18], build: (y) => solo(K.rule(CX - 40, y, 80, { color: B.white, alpha: K.ALPHA.photoRule })) });
  if (items.length) {
    subs.forEach((it, i) => {
      const role = it.lang === 'en' ? 'coverTitleEn' : 'coverTitle';
      groups.push({
        gap: [i ? 2 : 30, i ? 0 : 18],
        build: (y) => part(K.textBlock(CX, y, W, it.text, role, { ...white, field: it.field, maxLines: 2, balance: true })),
        alt: (y) => part(K.textBlock(CX, y, W, it.text, role, { ...white, field: it.field, maxLines: 1 })),
      });
    });
  }
  // 地点 · 日期：华文一行；English 一行；中英 = 中文一行 + 英文一行（英文地点和中文一样就不重复）
  const date = R.pair('date');
  const zhName = items.find((it) => it.lang === 'zh');
  const enName = items.find((it) => it.lang === 'en');
  const dz = K.pick('zh', date)[0];
  const de = K.pick('en', date)[0];
  const seg = (it, text) => (it && clean(text) ? { text, field: it.field, role: it.lang === 'en' ? 'coverMetaEn' : 'coverMeta' } : null);
  const metaLines = [];
  if (lang === 'zh') metaLines.push([seg(zhName, zhName?.rest), seg(dz, dz?.text)]);
  else if (lang === 'en') metaLines.push([seg(items[0], items[0]?.rest), seg(de, de?.text)]);
  else {
    metaLines.push([seg(zhName || enName, (zhName || enName)?.rest), seg(dz, dz?.text)]);
    const enLoc = enName && enName.rest !== zhName?.rest ? enName.rest : '';
    metaLines.push([seg(enName, enLoc), de?.lang === 'en' && clean(de.text) !== clean(dz?.text) ? seg(de, de.text) : null]);
  }
  metaLines.forEach((segs, i) => {
    const ps = segs.filter(Boolean);
    if (!ps.length) return;
    const meta = (lines) => (y) => {
      const one = inlineRun(CX, y, ps, { align: 'ctr', upperLatin: true, color: B.cream });
      if (one.w <= W) return one;
      // 太长（地址很长）：每一段各占一行（紧凑版：每段一行，截短）
      let cur = y;
      const els = [];
      for (const p of ps) {
        const st = K.style(p.role, { color: B.cream, caps: p.role === 'coverMetaEn' || !hasCJK(p.text) });
        const b = K.textBlock(CX, cur, W, p.text, st, { align: 'ctr', field: p.field, maxLines: lines, balance: true });
        els.push(...b.els);
        cur = b.bottom;
      }
      return { els, top: y, bottom: cur, x0: CX - W / 2, x1: CX + W / 2 };
    };
    groups.push({ gap: [i ? 4 : 26, i ? 2 : 16], build: meta(2), alt: meta(1) });
  });
  // 字组在台面（y≈720 起，很亮）上方：最多排到 690
  const g = flow(232, 690, groups, { align: 'center', center: 444 });
  const shLogo = R.shade(ph, [logo], 'logo', { dir: 'v' });
  const shText = R.shade(ph, g.parts, 'title', { dir: 'v' });
  return { bg: B.band, els: [ph.el, shLogo, shText, band, logo.el, ...g.els, ...vsig.els] };
}

// ===========================================================================
// 目录：满版照片；「CONTENTS 目录」一行；栏左一条贯穿到底的白竖线；编号 Ogg Medium 60pt、条目、说明
//   一栏排在照片左边深色的门洞上（门洞外的清水墙很亮，白字托到 45% 也不够 4.5:1）；签名在左下
//   隐藏的章节不列，编号按看得到的章节重排（01、02…）
// ===========================================================================

function layContents(R) {
  const { lang } = R;
  const ph = R.photo('photo', 0, 0, PAGE.W, PAGE.H, { dark: true });
  const title = K.titleGroup(PAGE.left, 96, 1300, R.pair('title'), lang, { color: B.white, inline: true, maxLines: { en: 1, zh: 1 } });
  const logo = K.cornerLogo('sail', { onPhoto: true });
  const shown = (R.chapters?.list || CHAPTERS).map((c) => CHAPTERS.indexOf(c) + 1).filter((i) => i > 0);
  const LX = 200; // 竖线
  const X = LX + 167; // 条目、说明
  const W = 540;
  /** 一章：条目（中英版「品牌　Brand」排一行，放不下就上下排）+ 说明 */
  const entry = (ch, y, noteMax = 2) => {
    const it = K.pick(lang, R.pair(`ch${ch}`));
    const els = [];
    let bottom = y;
    const inline = it.length === 2 && K.measure(`${it[0].text}`, K.style('tocItem')) + 28 + K.measure(it[1].text, K.style('tocItemEn')) <= W * 0.98;
    if (inline) {
      const a = K.textLines(X, y, [[clean(it[0].text)]], 'tocItem', { field: it[0].field });
      const b = K.textLines(a.x1 + 28, y, [[clean(it[1].text)]], 'tocItemEn', { field: it[1].field });
      els.push(a.el, b.el);
      bottom = a.bottom;
    } else if (it.length === 2 && noteMax === 1) {
      // 放不下的紧凑版：中英还是排一行，各自截短
      const a = K.textBlock(X, y, W * 0.45, it[0].text, 'tocItem', { field: it[0].field, maxLines: 1 });
      const bx = a.x1 + 28;
      const b = K.textBlock(bx, y, X + W - bx, it[1].text, 'tocItemEn', { field: it[1].field, maxLines: 1 });
      els.push(...a.els, ...b.els);
      bottom = a.bottom;
    } else {
      const a = duo(X, y, W, R.pair(`ch${ch}`), lang, 'tocItem', { maxLines: 1 });
      els.push(...a.els);
      bottom = a.bottom;
    }
    // 说明用白色（不是 F5EFDD）：这张照片的门洞外是很亮的清水墙，奶白色托到 45% 只有 4.3:1
    const note = duo(X, bottom + 6, W, R.pair(`ch${ch}Line`), lang, K.style('tocNote', { color: B.white }), { enRole: K.style('tocNoteEn', { color: B.white }), maxLines: noteMax, gap: 0 });
    els.push(...note.els);
    return { els, top: y, bottom: Math.max(note.bottom, y + 80), x0: X, x1: Math.max(X, note.x1 ?? X) };
  };
  // 一栏（照片左边深色的门洞上）：编号 Ogg Medium 60pt、条目、说明；行距随内容（四章排到 y≈880）
  //   放不下（中英版、四层楼的长说明、改过的长文字）：说明每种语言减到一行，再把第一章往上提
  const n = shown.length;
  let noteMax = 2;
  let hs = shown.map((ch) => heightOf(entry(ch, 0, noteMax)));
  if (330 + sum(hs) + 20 * (n - 1) > 880) {
    noteMax = 1;
    hs = shown.map((ch) => heightOf(entry(ch, 0, noteMax)));
  }
  const gap = n > 1 ? clamp((870 - 330 - sum(hs)) / (n - 1), 20, 90) : 0;
  const TOP = Math.round(clamp(880 - sum(hs) - gap * (n - 1), Math.max(236, title.bottom + 64), 330));
  const els = [];
  const parts = [title];
  let y = TOP;
  shown.forEach((ch, k) => {
    if (k) y = Math.round(y + hs[k - 1] + gap);
    const num = K.textLines(LX + 27, y - 8, [[String(k + 1).padStart(2, '0')]], 'tocNum', { name: 'num' });
    const e = entry(ch, y, noteMax);
    els.push(num.el, ...e.els);
    parts.push(num, e);
  });
  const line = K.vrule(LX, 300, PAGE.H - 300, { color: B.white, alpha: K.ALPHA.photoVline });
  // 签名在左下（右下是很亮的清水墙和石板，托到 45% 也不够 4.5:1）
  const sig = signatureLeft(R, LX + 27, 'sail', B.white);
  parts.push(sig);
  const shL = R.shade(ph, parts, 'left', { dir: 'h' });
  const shR = R.shade(ph, [logo], 'logo', { dir: 'v' });
  return { bg: B.band, els: [ph.el, shL, shR, line, ...title.els, logo.el, ...els, ...sig.els] };
}


// ===========================================================================
// 章节页
//   半版（品牌 / 方案 / 服务，以及换了竖图的公司章节页）：照片贴左 1022、上下贴边；照片左上白字栏目名；
//     右侧纸面：大字（宋体 / Ogg）→ 180 短线 → 一句话，整组在页面中线附近；深色 logo 右上，签名右下
//   满版（公司 · 瑞吉欧，dirA2 第 4 页）：照片铺满；左上栏目名、左栏「瑞吉欧」+ 白短线 + 一句话；右上白色 RICCIONE 商标
// ===========================================================================

/** 默认照片左上角太亮、白字托不住的章节页：栏目名放到纸面上（棕色） */
const LABEL_ON_PAPER = { 'design-divider': true };

/** 照片铺满整页会不会放大超过 1.15 倍（不知道尺寸 = 照常铺满） */
function fullBleedOK(R, name) {
  const img = R.resolve(name);
  if (!img.src || !img.nat?.w || !img.nat?.h) return true;
  return Math.max(PAGE.W / img.nat.w, PAGE.H / img.nat.h) * Math.max(1, img.frame?.zoom || 1) <= 1.15 + 1e-6;
}

/** 照片贴右的章节页（镜像）：服务章节页 —— 和后面贴左的团队页一左一右，翻页不重复 */
const DIVIDER_RIGHT = { 'service-divider': true };

function layDivider(R) {
  if (R.key === 'company-divider' && fullBleedOK(R, 'photo')) return layDividerFull(R);
  const { lang } = R;
  const brand = brandOf(R);
  const PW = 1022;
  const right = !!DIVIDER_RIGHT[R.key];
  // 贴左：照片 0–1022，纸面栏 x 1110；贴右（镜像）：照片 898–1920，纸面栏 x 120 起、到照片边前 88
  const PX = right ? PAGE.W - PW : 0;
  const X = right ? PAGE.leftWide : 1110;
  const W = right ? PX - 88 - X : PAGE.right - X;
  const ph = R.photo('photo', PX, 0, PW, PAGE.H, { dark: true });
  const onPaper = !!LABEL_ON_PAPER[R.key] && !ph.custom;
  const label = onPaper ? chapterLabel(R, X, PAGE.labelTop, W - 360, B.title) : chapterLabel(R, PX + PAGE.leftWide, PAGE.labelTop, PW - 2 * PAGE.leftWide, B.white);
  // 瑞吉欧（换了竖图的公司章节页）：English / 中英的品牌名用原色商标图，角上不再放小商标
  const markHero = brand === 'riccione' ? riccioneMarkHero(R, X, W, false) : null;
  // 镜像页：深色 logo 在纸面左上，签名在纸面栏右下（照片右下压不住小字）
  const logo = markHero ? null : right ? K.cornerLogo(brand, { corner: 'tl' }) : K.cornerLogo(brand);
  const sig = sign(R, brand, right ? { right: X + W } : {});
  const roles = brand === 'riccione' ? { zh: 'name', bi: 'name', en: 'nameEn' } : { zh: 'hero', bi: 'heroBi', en: 'heroEn' };
  const hero = markHero || heroBuilder(R, X, W, B.title, roles, { enFirst: brand !== 'riccione' });
  const top = onPaper ? Math.max(label.bottom + 64, 260) : 250;
  // 一行的大标题（「服务与交付」）字组矮：组间距拉开一点（最多 1.8 倍），纸面栏上下的空纸不超过 250
  const g = flow(top, BOTTOM, [
    { build: (y, mb) => hero(y, mb) },
    { gap: [lang === 'bi' ? 44 : 34, 24], build: (y) => solo(K.rule(X + 2, y, 180)) },
    { gap: [38, 26], flex: true, build: (y, mb) => part(duo(X, y, W, R.pair('lead'), lang, 'lead', { maxLines: 3, maxBottom: mb })) },
  ], { align: 'center', center: Math.round(((logo ? logo.bottom : 192) + sig.top) / 2), fill: top + 262 });
  const sh = onPaper ? null : R.shade(ph, [label], 'label', { dir: 'v' });
  return [ph.el, sh, ...label.els, logo?.el, ...g.els, ...sig.els];
}

/**
 * 公司章节页的大标题：English / 中英版的英文就是品牌名（Riccione）→ RICCIONE 商标图（宽 520；照片上白色、纸面上原色），
 * 中英版「瑞吉欧」大字在上、商标在下；点商标落到大标题的英文栏。不是品牌名（设计师改过）/ 华文版 → null（照常排字）
 */
function riccioneMarkHero(R, X, W, onPhoto) {
  const tp = R.pair('title');
  if (R.lang === 'zh' || !/^riccione$/i.test(clean(tp.en))) return null;
  return (y) => {
    const els = [];
    let cur = y;
    if (R.lang === 'bi' && clean(tp.zh)) {
      const z = K.textBlock(X, cur, W, tp.zh, K.style('name', { color: onPhoto ? B.white : B.title }), { field: tp.field, maxLines: 2, balance: true });
      els.push(...z.els);
      cur = z.bottom + 28;
    }
    const mk = { ...K.logo(onPhoto ? 'riccioneWhite' : 'riccioneColor', X, cur, 520), edit: { field: tp.fieldEn } };
    els.push(mk);
    return { els, top: y, bottom: cur + mk.h, x0: X, x1: X + 520 };
  };
}

function layDividerFull(R) {
  const { lang } = R;
  const ph = R.photo('photo', 0, 0, PAGE.W, PAGE.H, { dark: true });
  const X = PAGE.leftWide;
  const W = 860;
  const label = chapterLabel(R, X, PAGE.labelTop, 1000, B.white);
  const sig = sign(R, 'riccione', { onPhoto: true });
  // English / 中英：大标题的英文就是品牌名（Riccione）→ 用白色 RICCIONE 商标图（宽 520），不用 Ogg 排一个文字字标；
  //   中英版「瑞吉欧」72pt 在上、商标在下。这时右上角不再放小商标（一页只出现一次商标，Aman 第 1 页）
  const markHero = riccioneMarkHero(R, X, W, true);
  const logo = markHero ? null : K.cornerLogo('riccione', { onPhoto: true });
  const hero = markHero || heroBuilder(R, X, W, B.white, { zh: 'name', bi: 'name', en: 'nameEn' }, { enFirst: false });
  const g = flow(300, BOTTOM, [
    { build: (y, mb) => hero(y, mb) },
    { gap: [42, 28], build: (y) => solo(K.rule(X + 4, y, 180, { color: B.white, alpha: K.ALPHA.photoRule })) },
    { gap: [38, 26], flex: true, build: (y, mb) => part(duo(X, y, W, R.pair('lead'), lang, 'lead', { color: B.white, maxLines: 3, maxBottom: mb })) },
  ], { align: 'center', center: 646 });
  // 左边一条横向托字（栏目名、大标题、一句话）：蕨叶上的细衬线栏目名也要托住
  const shL = R.shade(ph, [label, ...g.parts], 'left', { dir: 'h' });
  const shR = R.shade(ph, [logo, sig], 'right');
  return { bg: B.band, els: [ph.el, shL, shR, ...label.els, logo?.el, ...g.els, ...sig.els] };
}

// ===========================================================================
// 品牌理念（dirA2 第 5 / 9 页）：半版照片贴左 880（白 logo 左上）；右栏：标题组 → 正文 → 360 细线 → 结语（宋体）
// ===========================================================================

function layPhilosophy(R) {
  const { lang } = R;
  const g0 = K.halfPage('left', { photoW: 880, gap: 110 });
  const ph = R.photo('photo', 0, 0, g0.photo.w, PAGE.H, { dark: true });
  const logo = K.cornerLogo('sail', { onPhoto: true, corner: 'tl' });
  const sig = sign(R, 'sail');
  const { x, w } = g0.col;
  const bi = lang === 'bi';
  const g = flow(PAGE.top, BOTTOM, [
    titleG(R, x, w),
    { gap: [bi ? 48 : 68, 32], flex: true, build: (y, mb) => part(duo(x, y, w, R.pair('body'), lang, bi ? 'body' : 'bodyL', { reflow: true, maxBottom: mb })) },
    { gap: [bi ? 36 : 58, 24], build: (y) => solo(K.rule(x, y, 360)) },
    { gap: [bi ? 36 : 44, 24], build: (y) => part(duo(x, y, w, R.pair('closing'), lang, bi ? 'closeBi' : 'close', { enRole: lang === 'en' ? 'quoteEn' : 'closeEn', maxLines: 2 })), alt: (y) => part(duo(x, y, w, R.pair('closing'), lang, bi ? 'closeBi' : 'close', { enRole: lang === 'en' ? 'quoteEn' : 'closeEn', maxLines: 1 })) },
  ], { fill: sig.top - 200 }); // 不留大空洞：English 版字少，组间距拉开一点
  const sh = R.shade(ph, [logo], 'logo', { dir: 'v' });
  return [ph.el, sh, logo.el, ...g.els, ...sig.els];
}

// ===========================================================================
// 品牌故事：左栏文字（标题组 → 正文 → 两个年份 / 地名），半版照片贴右 920（白 logo 右上、签名压在照片上）
// ===========================================================================

function layStory(R) {
  const { lang } = R;
  const g0 = K.halfPage('right', { photoW: 920, gap: 100 });
  const ph = R.photo('photo', g0.photo.x, 0, g0.photo.w, PAGE.H, { dark: true });
  const logo = K.cornerLogo('sail', { onPhoto: true });
  // 签名在纸面上（文字栏右下，Aman 第 7 页）：照片右下是很亮的石板路
  const sig = sign(R, 'sail', { right: g0.col.right });
  const { x, w } = g0.col;
  const bi = lang === 'bi';
  const FW = (w - 64) / 2;
  const figs = (y) => {
    const els = [K.rule(x, y, w, { alpha: K.ALPHA.tableRule })];
    let bottom = y;
    [1, 2].forEach((n, i) => {
      const fx = x + i * (FW + 64);
      const yr = duo(fx, y + (bi ? 24 : 32), FW, R.pair(`year${n}`), lang, ST.yearBig, { latin: true, enRole: ST.yearBig, maxLines: 1 });
      const pl = duo(fx, yr.bottom + 6, FW, R.pair(`place${n}`), lang, 'lead', { latin: true, maxLines: 1, gap: 0 });
      els.push(...yr.els, ...pl.els);
      bottom = Math.max(bottom, pl.bottom);
    });
    return { els, top: y, bottom, x0: x, x1: x + w };
  };
  const g = flow(PAGE.top, BOTTOM, [
    titleG(R, x, w),
    { gap: [bi ? 48 : 68, 28, bi ? 64 : 120], flex: true, build: (y, mb) => part(duo(x, y, w, R.pair('body'), lang, bi ? 'body' : 'bodyL', { reflow: true, maxBottom: mb })) },
    { gap: [bi ? 48 : 76, 28, bi ? 72 : 150], build: figs },
  ], { fill: 860 });
  const shTop = R.shade(ph, [logo], 'logo', { dir: 'v' });
  return [ph.el, shTop, logo.el, ...g.els, ...sig.els];
}

// ===========================================================================
// 原创系列：标题组 + 一句话；五张竖图一排（高度随说明的多少）；图下系列名（20pt）+ 说明
// ===========================================================================

function layCollections(R) {
  const { lang } = R;
  const logo = K.cornerLogo('sail');
  const sig = sign(R, 'sail');
  const X = PAGE.left;
  const W = PAGE.right - X;
  const N = 5;
  const GUT = 24;
  const CW = (W - GUT * (N - 1)) / N;
  const head = flow(PAGE.top, 420, [
    titleG(R, X, 1300, { maxLines: { en: 1, zh: 1 } }),
    { gap: [22, 14], build: (y) => part(duo(X, y, 1300, R.pair('note'), lang, 'lead', { reflow: true, maxLines: 2 })), alt: (y) => part(duo(X, y, 1300, R.pair('note'), lang, 'lead', { reflow: true, maxLines: 1 })) },
  ]);
  // 说明的行数：先按自然行数；照片会被挤到 240 以下时一档一档减（系列名每种语言 1 行、说明 2 行 → 1 行，截短 + 提醒）
  const LEVELS = [[2, 3], [1, 2], [1, 1]];
  const caption = (i, y, [nmMax, lnMax]) => {
    const xi = X + i * (CW + GUT);
    const nm = duo(xi, y, CW, R.pair(`c${i + 1}`), lang, ST.key, { enRole: ST.keyEn, maxLines: nmMax, gap: 0 });
    const ln = duo(xi, nm.bottom + 8, CW, R.pair(`c${i + 1}Line`), lang, ST.note, { enRole: ST.noteEn, maxLines: lnMax, gap: 4 });
    return { els: [...nm.els, ...ln.els], top: y, bottom: ln.bottom };
  };
  const top = Math.ceil(head.bottom + 52);
  const capOf = (lv) => Math.max(...[0, 1, 2, 3, 4].map((i) => heightOf(caption(i, 0, lv))));
  const lv = LEVELS.find((l) => BOTTOM - capOf(l) - 28 - top >= 240) || LEVELS[LEVELS.length - 1];
  const capTop = BOTTOM - capOf(lv);
  const bottom = Math.max(top + 160, capTop - 28);
  const els = [...head.els, logo.el];
  for (let i = 0; i < N; i++) {
    els.push(R.photo(`c${i + 1}`, Math.round(X + i * (CW + GUT)), top, Math.round(CW), bottom - top).el);
    els.push(...caption(i, bottom + 28, lv).els);
  }
  return [...els, ...sig.els];
}

// ===========================================================================
// 设计奖项：半版照片贴左 820（白 logo 左上）；右栏标题组 + 四个奖项（年份 Ogg | 奖项名 + 说明），细线分隔、撑满到页脚上方
// ===========================================================================

function layAwards(R) {
  const { lang } = R;
  const g0 = K.halfPage('left', { photoW: 820, gap: 100 });
  const ph = R.photo('photo', 0, 0, g0.photo.w, PAGE.H, { dark: true });
  const logo = K.cornerLogo('sail', { onPhoto: true, corner: 'tl' });
  const sig = sign(R, 'sail');
  const { x, w } = g0.col;
  const YW = 136;
  const rows = [1, 2, 3, 4].map((n) => [
    (y) => part(duo(x, y - 1, YW - 16, R.pair(`y${n}`), lang, ST.year, { latin: true, enRole: ST.year, maxLines: 1 })),
    (y, k) => {
      const a = duo(x + YW, y, w - YW, R.pair(`a${n}`), lang, ST.name, { enRole: ST.nameEn, maxLines: k, gap: 0 });
      const b = duo(x + YW, a.bottom + 6, w - YW, R.pair(`a${n}Note`), lang, ST.note, { enRole: ST.noteEn, maxLines: k, gap: 0 });
      return { els: [...a.els, ...b.els], top: y, bottom: b.bottom };
    },
  ]);
  const g = flow(PAGE.top, BOTTOM, [
    titleG(R, x, w),
    { gap: [60, 32], flex: true, build: table(x, w, rows, { pad: [12, 24, 46], fill: BOTTOM - 16 }) },
  ]);
  const sh = R.shade(ph, [logo], 'logo', { dir: 'v' });
  return [ph.el, sh, logo.el, ...g.els, ...sig.els];
}

// ===========================================================================
// 全球供应链（没有照片位：大字加列表，Aman 第 10 页）：标题组 + 一句话；三行（类别 | 品牌名 Ogg 42pt），细线分隔、撑满
// ===========================================================================

function laySupply(R) {
  const { lang } = R;
  const logo = K.cornerLogo('sail');
  const sig = sign(R, 'sail');
  const X = PAGE.left;
  const W = PAGE.right - X;
  const KW = 420;
  const rows = [1, 2, 3].map((n) => [
    (y, k) => {
      const num = K.textLines(X, y - 4, [[`0${n}`]], ST.num, { name: 'num' });
      const c = duo(X + 120, y + 14, KW - 140, R.pair(`s${n}`), lang, ST.key, { enRole: ST.keyEn, maxLines: Math.min(2, k), gap: 0 });
      return { els: [num.el, ...c.els], top: y, bottom: Math.max(c.bottom, num.bottom, y + 64) };
    },
    (y, k) => part(duo(X + KW, y, W - KW, R.pair(`s${n}Brands`), lang, ST.brand, { latin: true, enRole: ST.brand, maxLines: k, gap: 0 })),
  ]);
  const g = flow(PAGE.top, BOTTOM, [
    titleG(R, X, 1300, { maxLines: { en: 1, zh: 1 } }),
    { gap: [22, 14], build: (y) => part(duo(X, y, 1300, R.pair('lead'), lang, 'lead', { reflow: true, maxLines: 2 })), alt: (y) => part(duo(X, y, 1300, R.pair('lead'), lang, 'lead', { reflow: true, maxLines: 1 })) },
    { gap: [72, 40], flex: true, build: table(X, W, rows, { pad: [12, 40, 64], fill: BOTTOM - 20, rule: { alpha: K.ALPHA.tableRule } }) },
  ]);
  return [logo.el, ...g.els, ...sig.els];
}

// ===========================================================================
// 关于瑞吉欧：半版照片贴左 880（白色 RICCIONE 商标左上）；右栏标题组 → 正文 → 两条业务并排（项名 + 说明）
// ===========================================================================

function layAbout(R) {
  const { lang } = R;
  const g0 = K.halfPage('left', { photoW: 880, gap: 110 });
  const ph = R.photo('photo', 0, 0, g0.photo.w, PAGE.H, { dark: true });
  const logo = K.cornerLogo('riccione', { onPhoto: true, corner: 'tl' });
  const sig = sign(R, 'riccione');
  const { x, w } = g0.col;
  const bi = lang === 'bi';
  const KW = lang === 'zh' ? 240 : 280;
  const rows = [1, 2].map((n) => [
    (y, k) => part(duo(x, y + 1, KW - 24, R.pair(`line${n}`), lang, ST.key, { enRole: ST.keyEn, maxLines: Math.min(2, k), gap: 0 })),
    (y, k) => part(duo(x + KW, y, w - KW, R.pair(`line${n}Text`), lang, ST.name, { enRole: ST.nameEn, maxLines: k, gap: 2 })),
  ]);
  const g = flow(PAGE.top, BOTTOM, [
    titleG(R, x, w),
    { gap: [bi ? 48 : 64, 28, bi ? 64 : 110], flex: true, build: (y, mb) => part(duo(x, y, w, R.pair('body'), lang, bi ? 'body' : 'bodyL', { reflow: true, maxBottom: mb })) },
    { gap: [bi ? 48 : 72, 28, bi ? 64 : 120], build: table(x, w, rows, { pad: [12, 26, 34], rule: { alpha: K.ALPHA.tableRule } }) },
  ], { fill: 840 });
  const sh = R.shade(ph, [logo], 'logo', { dir: 'v' });
  return [ph.el, sh, logo.el, ...g.els, ...sig.els];
}


// ===========================================================================
// 发展历程（没有照片位：瑞吉欧图册的四张场景照已经用在章节页、关于、展厅、认证）：
//   Aman 第 4 页的年表 —— 标题组 + 一句话；八件事分左右两栏（每栏四行，左右的行一样高、细线对齐），撑满到页脚上方
// ===========================================================================

function layHistory(R) {
  const { lang } = R;
  const logo = K.cornerLogo('riccione');
  const sig = sign(R, 'riccione');
  const bi = lang === 'bi';
  const ev = bi ? K.style('event', { lh: 28 }) : 'event';
  const evEn = bi ? K.style('eventEn', { lh: 28 }) : 'eventEn';
  // 华文 / English（dirA2 第 6 页，老板认可的样张）：半版照片贴左 820；文字栏 x 920–1808：标题组 → 一句话（y 248）→
  //   年表从 y 330 起 8 行（年份 Ogg 26pt @ 920，事件 18pt 行高 30 @ 1060，行间 C9B9A6 细线），撑到 896；右上原色 RICCIONE 商标
  if (!bi) {
    const ph = R.photo('photo', 0, 0, 820, PAGE.H);
    const X = 920;
    const XR = 1808;
    const YW = 140;
    const title = K.titleGroup(X, PAGE.top, logo.x0 - 40 - X, R.pair('title'), lang, { maxLines: { en: 1, zh: 1 } });
    const lead = duo(X, Math.max(248, Math.ceil(title.bottom + 20)), XR - X, R.pair('lead'), lang, K.style('lead', { size: 19, lh: 36 }), { reflow: true, maxLines: 2 });
    const rows = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => [
      (y) => part(duo(X, y - 3, YW - 16, R.pair(`y${n}`), lang, ST.year, { latin: true, enRole: ST.year, maxLines: 1 })),
      (y, k) => part(duo(X + YW, y, XR - X - YW, R.pair(`e${n}`), lang, ev, { enRole: evEn, maxLines: k, gap: 4, balance: false })),
    ]);
    const top = Math.max(330, Math.ceil(lead.bottom + 40));
    const t = table(X, XR - X, rows, { pad: [6, 11, 24], fill: 896 })(top, BOTTOM);
    return [ph.el, logo.el, ...title.els, ...lead.els, ...t.els, ...sig.els];
  }
  // 中英版字多：纸面两栏年表（Aman 第 4 页）—— 标题组在左上，一句话在标题下（y 248）；两栏各 4 件事，左右的行一样高、细线对齐
  const X = PAGE.left;
  const W = PAGE.right - X;
  const GAP = 64;
  const CW = (W - GAP) / 2;
  const X2 = X + CW + GAP;
  const YW = 110;
  const cell = (n, cx) => [
    (y) => part(duo(cx, y - 3, YW - 8, R.pair(`y${n}`), lang, ST.year, { latin: true, enRole: ST.year, maxLines: 1 })),
    (y, k) => part(duo(cx + YW, y, CW - YW, R.pair(`e${n}`), lang, ev, { enRole: evEn, maxLines: k, gap: 4, balance: false })),
  ];
  const rows = [1, 2, 3, 4].map((i) => [...cell(i, X), ...cell(i + 4, X2)]);
  const title = K.titleGroup(X, PAGE.top, logo.x0 - 40 - X, R.pair('title'), lang, { maxLines: { en: 1, zh: 1 } });
  const lead = duo(X, Math.max(248, Math.ceil(title.bottom + 20)), 1300, R.pair('lead'), lang, 'lead', { reflow: true, maxLines: 2 });
  const top = Math.ceil(lead.bottom + 40);
  // 两栏各一组细线（中间的栏距不画线）
  const two = table(X, W, rows, { pad: [6, 20, 40], fill: BOTTOM - 14, segments: [[X, CW], [X2, CW]] })(top, BOTTOM);
  return [logo.el, ...title.els, ...lead.els, ...two.els, ...sig.els];
}


// ===========================================================================
// 展厅与仓储（Aman 第 7 页）：左栏文字（标题组 → 一句话 → 三个地方：地名 | 说明，细线分隔）；半版照片贴右 920
//   （展厅照很亮：白字压在上面托到 45% 也不够 4.5:1，所以字都放纸面，照片上只放白色 RICCIONE 商标）
// ===========================================================================

function layShowrooms(R) {
  const { lang } = R;
  const bi = lang === 'bi';
  const g0 = K.halfPage('right', { photoW: 920, gap: 100 });
  const ph = R.photo('photo', g0.photo.x, 0, g0.photo.w, PAGE.H, { dark: true });
  const logo = K.cornerLogo('riccione', { onPhoto: true });
  const sig = sign(R, 'riccione', { right: g0.col.right });
  const { x, w } = g0.col;
  const NW = lang === 'zh' ? 200 : 250;
  const rows = [1, 2, 3].map((n) => [
    (y, k) => part(duo(x, y, NW - 24, R.pair(`p${n}`), lang, ST.name, { latin: true, enRole: ST.nameEn, maxLines: Math.min(2, k), gap: 0 })),
    (y, k) => part(duo(x + NW, y + 1, w - NW, R.pair(`p${n}Text`), lang, ST.note, { enRole: ST.noteEn, maxLines: k, gap: 0 })),
  ]);
  const g = flow(PAGE.top, BOTTOM, [
    titleG(R, x, w, { maxLines: { en: 2, zh: 2 } }),
    { gap: [bi ? 44 : 60, 24, bi ? 60 : 110], flex: true, build: (y, mb) => part(duo(x, y, w, R.pair('lead'), lang, bi ? 'body' : 'bodyL', { reflow: true, maxBottom: mb })) },
    { gap: [bi ? 44 : 64, 24, bi ? 60 : 110], build: table(x, w, rows, { pad: [8, 22, 30], rule: { color: B.hair, alpha: 1, h: 1 } }) },
  ], { fill: 880 });
  const sh = R.shade(ph, [logo], 'logo', { dir: 'v' });
  return [ph.el, sh, logo.el, ...g.els, ...sig.els];
}


// ===========================================================================
// 品质认证（短文字的页，Aman 第 13 页）：半版照片贴左 1022（白色 RICCIONE 商标左上）；
//   纸面：标题组 → 180 短线 → 正文，整组在页面中线附近
// ===========================================================================

function layCertified(R) {
  const { lang } = R;
  const PW = 1022;
  const X = 1110;
  const W = PAGE.right - X;
  const bi = lang === 'bi';
  const ph = R.photo('photo', 0, 0, PW, PAGE.H);
  const logo = K.cornerLogo('riccione');
  const sig = sign(R, 'riccione');
  // 字少（English 的正文三行）：组间距拉开一点，纸面栏上下的空纸都不超过 250
  const top = logo.bottom + 64;
  const g = flow(top, BOTTOM, [
    titleG(R, X, W),
    { gap: [48, 28], build: (y) => solo(K.rule(X + 2, y, 180)) },
    { gap: [40, 26], flex: true, build: (y, mb) => part(duo(X, y, W, R.pair('body'), lang, bi ? 'body' : 'bodyL', { reflow: true, maxBottom: mb })) },
  ], { align: 'center', center: 560, fill: top + 400 });
  return [ph.el, logo.el, ...g.els, ...sig.els];
}


// ===========================================================================
// 服务流程（没有照片位）：标题组 + 一句话；五个步骤五栏（栏左细竖线、Ogg 大编号、步骤名、说明），整组在剩下的地方居中
// ===========================================================================

function layProcess(R) {
  const { lang } = R;
  const bi = lang === 'bi';
  const logo = K.cornerLogo('sail');
  const sig = sign(R, 'sail');
  const X = PAGE.left;
  const W = PAGE.right - X;
  const NX = X + 150;
  const NW = 500;
  const TX = X + 700;
  const name = bi ? K.style('rowVal', { lh: 38 }) : 'rowVal';
  const nameEn = bi ? K.style('rowValEn', { size: 22, lh: 34 }) : 'rowValEn';
  const text = K.style('body', { size: 20, spacing: 1, lh: bi ? 30 : 34 });
  const textEn = K.style('bodyEn', { size: 20, spacing: 0.4, lh: bi ? 30 : 32 });
  // 同一行的三样字按步骤名第一行的基线对齐（量过网页渲染：基线离行顶 —— 步骤名 26pt 行高 48 是 38、说明 20pt 行高 34 是 27、
  //   编号 Ogg Medium 60pt 行高 60 是 50；行高每少 2px，基线上移 1px）
  const nameLh = K.style(name).lh;
  const base = 38 + (nameLh - 48) / 2;
  const textDy = Math.round(base - (27 + (text.lh - 34) / 2));
  // 中英版每行两行字、行距紧（上下只空十来 px）：大编号改成和步骤名顶对齐，不往上伸出细线
  const numDy = bi ? -4 : Math.round(base - 50);
  const NUM = K.style(ST.num, { lh: 60 });
  const rows = [1, 2, 3, 4, 5].map((n) => [
    (y) => {
      const num = K.textLines(X, y + numDy, [[`0${n}`]], NUM, { name: 'num' });
      return { els: [num.el], top: y, bottom: num.bottom };
    },
    (y, k) => part(duo(NX, y, NW, R.pair(`s${n}`), lang, name, { enRole: nameEn, maxLines: Math.min(2, k), gap: 0 })),
    (y, k) => part(duo(TX, y + textDy, PAGE.right - TX, R.pair(`s${n}Text`), lang, text, { enRole: textEn, maxLines: Math.min(2, k), gap: 2 })),
  ]);
  const g = flow(PAGE.top, BOTTOM, [
    titleG(R, X, 1300, { maxLines: { en: 1, zh: 1 } }),
    { gap: [22, 14], build: (y) => part(duo(X, y, 1300, R.pair('lead'), lang, 'lead', { reflow: true, maxLines: 2 })), alt: (y) => part(duo(X, y, 1300, R.pair('lead'), lang, 'lead', { reflow: true, maxLines: 1 })) },
    { gap: [64, 36], flex: true, build: table(X, W, rows, { pad: [Math.max(10, 4 - numDy), 26, 40], fill: BOTTOM - 16, rule: { alpha: K.ALPHA.tableRule } }) },
  ]);
  return [logo.el, ...g.els, ...sig.els];
}


// ===========================================================================
// 订单周期（没有照片位：大字页）：标题组；两个系列左右两栏 —— 细线、系列名、Ogg 大字天数 + 单位（同一段、共用基线）
//   天数中英共用、只印一次；中英版的「days」排在「天」正下方
// ===========================================================================

/** 天数与单位之间空多少（天数字号的倍数）：加在天数最后一个字的字距上（空格在各家软件里宽窄不一） */
const CYCLE_GAP_EM = 0.26;

function layCycle(R) {
  const { lang } = R;
  // Aman 第 14 页：上半一条通栏照片（1920 × 520，贴顶），白字标题压在照片左上、白 logo 在右上（顶部托字）；
  //   下半两栏（x 112–900 / 1010–1810）：细线、系列名、Ogg 大字天数 + 单位（同一段、共用基线：「60–75 天 days」）
  const PH = 520;
  // 照片被拿掉时是一条深色色带（白字照样读得清）
  const ph = R.photo('photo', 0, 0, PAGE.W, PH, { dark: true });
  const onPhoto = ph.has;
  const logo = K.cornerLogo('sail', { onPhoto: true });
  const sig = sign(R, 'sail');
  const title = K.titleGroup(PAGE.left, PAGE.top, 1200, R.pair('title'), lang, { maxLines: { en: 1, zh: 1 }, label: '标题', color: B.white });
  const FIG = K.style('display', { caps: false, size: 116, spacing: 0, lh: 124, color: B.title });
  const UNIT = { zh: K.style('lead', { size: 22, spacing: 2, color: B.title }), en: K.style('leadEn', { size: 22, spacing: 0.5, color: B.title }) };
  const run = (text, st, spacing = st.spacing || 0) => ({ text, font: st.font, size: st.size, color: st.color, spacing, lang: st.lang });
  const COLS = [{ x: PAGE.left, w: 900 - PAGE.left }, { x: 1010, w: PAGE.right - 1010 }];
  /** 天数（Ogg 大字）+ 单位：同一段、共用基线（空隙加在天数最后一个字的字距上）；中英版「天 days」两个单位排在一起 */
  const figure = (n, x, w, y) => {
    const els = [];
    const fi = K.pick(lang, R.pair(`s${n}N`))[0] || null;
    const units = K.pick(lang, R.pair(`s${n}Unit`));
    let bottom = y;
    const unitText = units.map((u) => clean(u.text).replace(/\s*\n\s*/g, ' ')).filter(Boolean);
    const unitRuns = units.flatMap((u, i) => {
      const t = clean(u.text).replace(/\s*\n\s*/g, ' ');
      if (!t) return [];
      return i ? [run(' ', UNIT[u.lang]), run(t, UNIT[u.lang])] : [run(t, UNIT[u.lang])];
    });
    const unitW = units.reduce((s, u, i) => s + K.measure(`${i ? ' ' : ''}${clean(u.text)}`, UNIT[u.lang]), 0);
    if (!fi) {
      units.forEach((u) => {
        const t = K.textBlock(x, bottom, w, u.text, UNIT[u.lang], { field: u.field, maxLines: 1 });
        els.push(...t.els);
        bottom = t.bottom;
      });
      return { els, top: y, bottom };
    }
    const figText = clean(fi.text).replace(/\s*\n\s*/g, ' ');
    const gapPx = unitText.length ? CYCLE_GAP_EM * FIG.size * PX_PER_PT : 0;
    const figW = K.measure(figText, FIG) + gapPx;
    if (figW + unitW <= w * 0.98) {
      const chars = [...figText];
      const gapPt = Math.round((gapPx / PX_PER_PT + (FIG.spacing || 0)) * 100) / 100;
      const figRuns = unitText.length ? [...(chars.length > 1 ? [run(chars.slice(0, -1).join(''), FIG)] : []), run(chars[chars.length - 1], FIG, gapPt)] : [run(figText, FIG)];
      // 单位在天数的同一段里（共用基线）：编辑器里点单位那一段落到单位栏（edit.zones）
      let ux = x + figW;
      const zones = units.map((u, i) => {
        const t = `${i ? ' ' : ''}${clean(u.text)}`;
        const uw = K.measure(t, UNIT[u.lang]);
        const z = { field: u.field, x: Math.round(ux), y: Math.round(y - INSET), w: Math.ceil(uw + 4), h: Math.round(FIG.lh + 2 * INSET) };
        ux += uw;
        return z;
      });
      els.push({
        t: 'text',
        x: x - INSET,
        y: y - INSET,
        w: w + 2 * INSET,
        h: FIG.lh + 2 * INSET,
        paras: [{ align: 'l', lineHeight: FIG.lh, runs: [...figRuns, ...unitRuns] }],
        ...(fi.field ? { edit: { field: fi.field, ...(zones.length ? { zones } : {}) } } : {}),
      });
      bottom = y + FIG.lh;
    } else {
      // 太长：天数自己截成一行，单位另起一行（「天 days」排一行，截短）
      const f = K.textBlock(x, y, w, figText, FIG, { field: fi.field, maxLines: 1 });
      els.push(...f.els);
      bottom = f.bottom;
      if (units.length) {
        const u0 = units[0];
        const t = K.textBlock(x, bottom, w, unitText.join(' '), UNIT[u0.lang], { field: u0.field, maxLines: 1 });
        els.push(...t.els);
        bottom = t.bottom;
      }
    }
    return { els, top: y, bottom };
  };
  const RULE_Y = PH + 56;
  const els = [];
  COLS.forEach((c, i) => {
    const n = i + 1;
    els.push(K.rule(c.x, RULE_Y, c.w, { alpha: K.ALPHA.tableRule }));
    // 系列名每种语言最多 2 行（中英版各 1 行）：天数大字 + 单位一定排得进 900 以上
    const nm = duo(c.x, RULE_Y + 28, c.w, R.pair(`s${n}`), lang, ST.key, { enRole: ST.keyEn, maxLines: lang === 'bi' ? 1 : 2, gap: 0 });
    els.push(...nm.els);
    const f = figure(n, c.x, c.w, Math.round(nm.bottom + 14));
    els.push(...f.els);
  });
  const shTop = onPhoto ? R.shade(ph, [title, logo], 'title', { dir: 'v' }) : null;
  return [ph.el, shTop, ...title.els, logo.el, ...els, ...sig.els];
}


// ===========================================================================
// 售后维保（dirA2 第 7 页）：左栏文字（标题组 → 金句 → 四行表：项名 20pt 棕 | 内容 宋体 26pt）；半版照片贴右 920
//   白 logo 宽 260 落在挂画的皮面上；签名压在照片上（底部托字）。质保年数是空格（＿＿），设计师填；没填会提醒
// ===========================================================================

function layAftersales(R) {
  const { lang } = R;
  const bi = lang === 'bi';
  const g0 = K.halfPage('right', { photoW: 920, gap: 108 });
  const ph = R.photo('photo', g0.photo.x, 0, g0.photo.w, PAGE.H, { dark: true });
  const logo = K.cornerLogo('sail', { onPhoto: true, w: 260, x: 1550, y: 64 });
  // 签名在纸面上（文字栏右下）：照片底部是浅色地毯，托到 45% 也不够 4.5:1
  const sig = sign(R, 'sail', { right: g0.col.right });
  const x = PAGE.left;
  const w = g0.col.w - 8;
  const KW = { zh: 288, en: 300, bi: 280 }[lang];
  const KEY = bi ? K.style('rowKey', { lh: 38 }) : 'rowKey';
  const VAL = bi ? K.style('rowVal', { lh: 42 }) : 'rowVal';
  const rows = [1, 2, 3, 4].map((n) => [
    (y, k) => part(duo(x, y + 2, KW - 24, R.pair(`r${n}`), lang, KEY, { enRole: bi ? K.style('rowKeyEn', { lh: 34 }) : 'rowKeyEn', maxLines: Math.min(2, k), gap: 0 })),
    (y, k) => part(duo(x + KW, y, w - KW, R.pair(`r${n}Text`), lang, VAL, { enRole: bi ? K.style('rowValEn', { lh: 38 }) : 'rowValEn', maxLines: Math.min(2, k), gap: 0 })),
  ]);
  const g = flow(PAGE.top, BOTTOM - 20, [
    titleG(R, x, w),
    { gap: [72, 36], build: (y) => part(duo(x, y, w, R.pair('lead'), lang, 'quote', { maxLines: 2 })), alt: (y) => part(duo(x, y, w, R.pair('lead'), lang, 'quote', { maxLines: 1 })) },
    { gap: [78, 36], flex: true, build: table(x, w, rows, { pad: [12, 30, 34], fill: 870, rule: { alpha: K.ALPHA.tableRule } }) },
  ]);
  const shTop = R.shade(ph, [logo], 'logo', { dir: 'v' });
  // 质保年数还是空格（＿＿）：中文没填 → 填中文（「5 年」，英文自动跟着变成 5 years）；
  // 中文填了、英文自动换不过来（写的不是「几年」）→ 提醒补英文（编辑器跳到英文栏）
  const BLANK = /[＿_]{2,}/;
  const name = (n) => (n === 3 ? '五金' : '板材');
  const todo = [3, 4].map((n) => {
    const p = R.pair(`r${n}Text`);
    const zhOk = !BLANK.test(p.zh);
    const enOk = lang === 'zh' || !BLANK.test(p.en);
    // English 版里直接填了英文、中文还空着也算填好（页面上只有英文）
    return { n, need: !zhOk && (lang !== 'en' || !enOk) ? 'zh' : !enOk ? 'en' : null };
  });
  const zhTodo = todo.filter((t) => t.need === 'zh').map((t) => name(t.n));
  const enTodo = todo.filter((t) => t.need === 'en').map((t) => name(t.n));
  if (zhTodo.length) R.warn(`售后维保：${zhTodo.join('、')}质保年数还没填 —— 在右侧把「＿＿」改成年数`);
  if (enTodo.length) R.warn(`售后维保：${enTodo.join('、')}质保年数的英文还没填 —— 在右侧英文栏里把「____」改成年数（如 5 years）`);
  return [ph.el, shTop, logo.el, ...g.els, ...sig.els];
}

// ===========================================================================
// 封底：半版照片贴左 1022；纸面：结语（大字）→ 180 短线 → 联系方式三行（项名 | 内容）+ 二维码；深色 logo 右上，签名右下
// ===========================================================================

function layClosing(R) {
  const { lang } = R;
  const PW = 1022;
  const X = 1110;
  const W = PAGE.right - X;
  const ph = R.photo('photo', 0, 0, PW, PAGE.H, { dark: true });
  const logo = K.cornerLogo('sail');
  const sig = sign(R, 'sail');
  const hero = heroBuilder(R, X, W, B.title, { zh: 'hero', bi: 'heroBi', en: 'heroEn' }, { maxH: lang === 'bi' ? 260 : 330 });
  const KW = 200;
  const rows = [1, 2, 3].map((n) => [
    (y, k) => part(duo(X, y + 1, KW - 20, R.pair(`l${n}`), lang, K.style('rowKey', { size: 17, spacing: 3, lh: 30 }), { enRole: K.style('rowKeyEn', { size: 16, spacing: 1, lh: 28 }), maxLines: Math.min(2, k), gap: 0 })),
    (y, k) => part(duo(X + KW, y, W - KW, R.pair(`v${n}`), lang, K.style('body', { lh: 32, color: B.table }), { latin: true, enRole: K.style('bodyEn', { lh: 32, color: B.table }), maxLines: Math.min(3, k), gap: 0 })),
  ]);
  const QR_W = 128;
  const qr = (y) => solo({ t: 'img', x: X, y, w: QR_W, h: QR_W, src: QR.src, nat: QR.nat, fit: 'contain', name: 'qr' });
  const g = flow(logo.bottom + 72, 1004, [
    { build: (y, mb) => hero(y, mb) },
    { gap: [40, 24], build: (y) => solo(K.rule(X + 2, y, 180)) },
    { gap: [44, 24], flex: true, build: table(X, W, rows, { pad: [8, 16, 20], rules: false }) },
    { gap: [36, 20], build: qr },
  ]);
  return [ph.el, logo.el, ...g.els, ...sig.els];
}

const LAYOUTS = {
  cover: layCover,
  contents: layContents,
  'brand-divider': layDivider,
  'brand-philosophy': layPhilosophy,
  'brand-story': layStory,
  'brand-collections': layCollections,
  'brand-awards': layAwards,
  'brand-supply': laySupply,
  'company-divider': layDivider,
  'company-about': layAbout,
  'company-history': layHistory,
  'company-showrooms': layShowrooms,
  'company-certified': layCertified,
  'design-divider': layDivider,
  'service-divider': layDivider,
  'service-process': layProcess,
  'service-cycle': layCycle,
  'service-aftersales': layAftersales,
  closing: layClosing,
};

// ---------------------------------------------------------------------------
// 对外
// ---------------------------------------------------------------------------

/**
 * 公司固定页（C 安然品牌画册；函数名沿用 B 时的 renderCompanyB）
 * @param {string} key   COMPANY_KEYS_B 之一
 * @param {object} slide { overrides?, overridesEn?, images? }
 * @param {{ project:object, lang?:'zh'|'en'|'bi', tr?:object, meta?:(src:string)=>({w,h}|null), tokens?:object }} ctx
 * @returns {{ bg:string, els:object[], warnings:string[] }}
 */
export function renderCompanyB(key, slide = {}, ctx = {}) {
  const lay = LAYOUTS[key];
  if (!lay || !COMPANY_PAGES_B[key]) return page([], [`未知的公司页：${key}`]);
  const R = makeR(key, slide || {}, ctx || {});
  return R.finish(lay(R));
}

/**
 * 编辑器右侧的栏位：每个字段的中文 / 英文（当前显示的字、默认稿、是否改过）
 * @returns {Array<{ field, label, zh, en, zhDefault, enDefault, overridden:{zh:boolean,en:boolean}, multiline:boolean, oneLine:boolean,
 *   autoEn:boolean, hidden:boolean, shared:boolean, tokens:boolean, chapter:boolean }>}
 */
export function companyFieldsB(key, slide = {}, project = {}) {
  const def = COMPANY_PAGES_B[key];
  if (!def) return [];
  const tokens = companyTokensB(project, (s) => resolveEn(project, s, 'text').text);
  const chapters = deckChapters(project);
  if (CHAPTERS.includes(def.section)) {
    tokens.chapterZh = chapterZh(chapters.num[def.section]);
    tokens.chapterEn = chapterEn(chapters.num[def.section]);
  }
  const fill = (s) => clean(fillTokens(s, tokens));
  return Object.entries(def.fields).map(([field, f]) => {
    const oz = slide?.overrides?.[field];
    const oe = slide?.overridesEn?.[field];
    const shared = f.en === undefined;
    const zhDefault = fill(f.zh);
    const zh = typeof oz === 'string' ? fill(oz) : zhDefault;
    const enDefault = shared ? zhDefault : fill(f.en);
    // 与页面一致：只改了中文时能自动换成英文的（5 年 → 5 years、Mr & Mrs Lau）英文跟着变
    const autoEn = !shared && typeof oz === 'string' && typeof oe !== 'string' ? autoEnOf(f, zh) : '';
    const en = typeof oe === 'string' ? fill(oe) : shared ? zh : autoEn || enDefault;
    // 目录里被隐藏的那一章：栏位还能改，只是页面上不列
    const ch = key === 'contents' ? /^ch(\d)/.exec(field) : null;
    return {
      field,
      label: f.label,
      zh,
      en,
      zhDefault,
      enDefault,
      overridden: { zh: typeof oz === 'string', en: typeof oe === 'string' },
      multiline: !!f.multiline || zhDefault.includes('\n') || enDefault.includes('\n'),
      oneLine: !!f.oneLine,
      autoEn: !!autoEn,
      // 华文版也印英文（装饰性的大写页眉）：编辑器的华文版给这一栏英文框
      enHeader: (ZH_EN_HEADER[key] || []).includes(field),
      hidden: !!ch && !chapters.list.includes(CHAPTERS[Number(ch[1]) - 1]),
      shared,
      // tokens = 跟着「项目信息」的客户 / 地点 / 日期 / 楼层；chapter = 章节编号（隐藏了前面的章节就往前排）
      tokens: /\{\{(?!chapter)\w+\}\}/.test(`${f.zh}${f.en ?? ''}`),
      chapter: /\{\{chapter(Zh|En)\}\}/.test(`${f.zh}${f.en ?? ''}`),
    };
  });
}

/** 照片位清单（编辑器「换照片」用）：[{ slot, label, src, default, custom }] */
export function companyImagesB(key, slide = {}) {
  const def = COMPANY_PAGES_B[key];
  if (!def) return [];
  return Object.entries(def.images).map(([name, d]) => {
    const over = slide?.images?.[name];
    const custom = typeof over === 'string' && !!over.trim();
    return { slot: name, field: `image.${name}`, label: d.label, src: custom ? over.trim() : over === null || over === '' ? null : d.src, default: d.src, custom };
  });
}
