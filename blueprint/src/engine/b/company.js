// B 格物 · 公司固定页 = 品牌画册（19 页）：封面、目录、四个章节页、品牌 / 公司 / 服务各页、封底。
//
// 版式全部用 kit.js 的网格、字级、文字块拼出来，照着定稿的 B 样张（p1 封面、p2 章节页、p3 品牌故事、p4 原创系列、p7 封底）：
//   大照片、短文字、大量留白；没有页码、页脚、装饰短线、大写小标签；细线只用在列表里
//   照片永远不压暗、不压字；每张照片是一个「照片位」（PHOTO_SLOTS，一行一个），默认图在 PHOTOS 里一行一张 ——
//   老板以后发来高清图，改那一行即可（取景重心 / 放大写在照片位的 frame 里）
//   中英并重：中文、英文同样大小，左右并排或上下对照
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

import {
  B, INSET, STACK_GAP, styleOf, runsOf, lineWidth, wrapCount, block, pick, hair, page, hasCJK,
} from './kit.js';
import { balanceText } from './text.js';
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
  coll1: sail('/template/b/coll-1.jpg', 580, 982), // 骨骼线
  coll2: sail('/template/b/coll-2.jpg', 473, 800), // 空山
  coll3: sail('/template/b/coll-3.jpg', 693, 1173), // 织
  coll4: sail('/template/b/coll-4.jpg', 528, 894), // 雾山
  coll5: sail('/template/b/coll-5.jpg', 610, 1033), // 寂东方
  awards: sail('/template/brand-awards-1.jpg', 1800, 1010), // 奖杯
  // 老板发来的展厅照（2000 px，原样不调色；右上角有白色 sAil 溪岸 logo —— 取景避开它）
  showroomStill: sail('/template/b/showroom-still.jpg', 1333, 2000), // 木盘里的青苹果与干枝，后面是书格和沙发
  // —— 瑞吉欧（RICCIONE Catalogue 2024 Autumn）——
  aboutDetail: riccione('/template/b/about-detail.jpg', 1079, 1348), // 瑞吉欧竖纹抽屉柜、干花与书（已提亮）
  riccioneGarden: riccione('/template/b/riccione-garden.jpg', 1212, 1500), // 图册 p41：树下的藤编扶手椅
  riccioneShowroom: riccione('/template/b/riccione-showroom.jpg', 2049, 961), // 图册 p6：瑞吉欧展厅（床、皮沙发、花砖墙）
  riccioneForest: riccione('/template/b/riccione-forest.jpg', 2000, 1002), // 图册 p60：阳光穿过的红杉林
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
 *   封面、品牌 · 溪岸、方案、服务、封底只用溪岸的照片（溪岸手册 + 老板发来的溪岸照）
 * 瑞吉欧图册大多是去底的单品图，能整页用的场景照不多：图册里有更好的场景照（或瑞吉欧自己的展厅照）可以再换
 * 照片位大多是竖的（宽:高 ≈ 0.55–0.9）：竖拍的照片最好用；横拍的会只取中间一段
 */
export const PHOTO_SLOTS = {
  cover: { photo: slot(PHOTOS.sailCover, '封面照片', { ax: 0.3 }) },
  contents: {},
  'brand-divider': { photo: slot(PHOTOS.sailHills, '章节照片', { ax: 0.3 }) },
  'brand-philosophy': { photo: slot(PHOTOS.showroomStill, '理念照片', { ax: 0.35, ay: 1, zoom: 1.2 }) },
  'brand-story': { photo: slot(PHOTOS.storyLift, '品牌照片', { ax: 0.134 }) },
  'brand-collections': {
    c1: slot(PHOTOS.coll1, '系列一照片'),
    c2: slot(PHOTOS.coll2, '系列二照片'),
    c3: slot(PHOTOS.coll3, '系列三照片'),
    c4: slot(PHOTOS.coll4, '系列四照片'),
    c5: slot(PHOTOS.coll5, '系列五照片'),
  },
  'brand-awards': { photo: slot(PHOTOS.awards, '奖项照片', { ax: 1, ay: 0.5, zoom: 1.12 }) },
  'brand-supply': {},
  'company-divider': { photo: slot(PHOTOS.riccioneGarden, '章节照片', { ay: 0.6 }) },
  'company-about': { photo: slot(PHOTOS.aboutDetail, '公司照片', { ay: 0.4 }) },
  'company-history': {},
  'company-showrooms': { photo: slot(PHOTOS.riccioneShowroom, '展厅照片', { ax: 0.45 }) },
  'company-certified': { photo: slot(PHOTOS.riccioneForest, '认证照片', { ax: 0.55 }) },
  'design-divider': { photo: slot(PHOTOS.sailSkeleton, '章节照片') },
  'service-divider': { photo: slot(PHOTOS.sailDining, '章节照片', { ax: 0.55 }) },
  'service-process': {},
  'service-cycle': {},
  'service-aftersales': { photo: slot(PHOTOS.sailBedroom, '维保照片', { ax: 0.45 }) },
  closing: { photo: slot(PHOTOS.sailClosing, '封底照片', { ax: 0.2 }) },
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
// 排版小工具（在 kit 之上）：文字左边缘正好落在网格线上，基线对齐，放不下时截短并提醒
// ---------------------------------------------------------------------------

/** 网页预览里一行的基线位置（离行框顶）：段落按英文字体（Hanken / Ysabeau）的升部、降部算行框，中文字形落在同一条基线上 */
const FONT_V = { light: [1.0, 0.303], regular: [1.0, 0.303], title: [1.054, 0.289] };
export function baseOf(lang, role, over) {
  const st = styleOf(lang, role, over);
  const [a, d] = FONT_V[st.font] || FONT_V.light;
  return (st.lh - (a + d) * st.px) / 2 + a * st.px;
}

/** 中文栏里的纯拉丁文字（品牌名、年份、Mr Lau）用英文字级 */
const L = (text, lang) => (lang === 'zh' && !hasCJK(text) ? 'en' : lang);
const overFor = (opts, lg) => opts?.over?.[lg] ?? opts?.over?.all;
const lhOf = (lg, role, over) => styleOf(lg, role, over).lh;

/** 一段文字在宽 w 的栏里排几行（\n 分段） */
function nLines(text, lg, role, w, over, nowrap) {
  const st = styleOf(lg, role, over);
  return String(text ?? '')
    .split('\n')
    .reduce((n, line) => n + (nowrap ? 1 : wrapCount(line, st, lg, role, w + 2 * INSET)), 0);
}

/** 截到最多 maxLines 行，末尾加「…」 */
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

/**
 * 一块文字：x = 文字左边缘（框向左让出内边距，与样张一致），y = 第一行行框的顶
 *   valign:'b' = 落在底线上的字（章节页大标题、一句话、封面客户名…）：框内靠底排，万一引擎多估了一行，最后一行仍落在原来的基线上
 *   大字（display / head）折成两三行时均衡断行（b/text.js）：行数不变，不留落单的一个词（「… and / Family」）
 *   截短了的文字框记一笔（_cut，finish() 里收走）：提醒里说得出是哪一栏
 * @returns {{ el, h, lines, bottom, top, lang, cut }}
 */
function tb(x, y, w, text, lang, role, opts = {}) {
  const lg = L(text, lang);
  const over = overFor(opts, lg);
  let t = String(text ?? '');
  let cut = false;
  if (opts.maxLines) ({ text: t, cut } = clampLines(t, lg, role, w, opts.maxLines, over));
  // 截短过的也均衡（每一段的行数不变，「…」仍在最后）
  if (!opts.nowrap && (role === 'display' || role === 'head')) t = balanceText(t, lg, role, w, over);
  const b = block(x - INSET, y, w + 2 * INSET, t, lg, role, {
    over,
    nowrap: opts.nowrap,
    align: opts.align,
    ...(opts.edit ? { edit: opts.edit } : {}),
  });
  if (opts.valign === 'b') b.el.valign = 'b';
  if (cut) b.el._cut = true;
  return { ...b, top: y, lang: lg, cut };
}

const editOf = (it) => (it.field ? { field: it.field } : undefined);
const itemsOf = (lang, pair) => pick(lang, pair).map((it) => ({ ...it, lg: L(it.text, it.lang) }));

/**
 * 上下对照：中文在上、英文在下。maxLines 每种语言最多几行；maxBottom 放不下时从行数多的那种语言减行（截短 + 提醒）
 */
function pstack(x, y, w, role, pair, lang, opts = {}) {
  const items = itemsOf(lang, pair);
  const gap = opts.gap ?? STACK_GAP[role] ?? 0;
  const lh = (it) => lhOf(it.lg, role, overFor(opts, it.lg));
  const natural = items.map((it) => nLines(it.text, it.lg, role, w, overFor(opts, it.lg), opts.nowrap));
  const budget = natural.map((n) => Math.min(n, opts.maxLines ?? Infinity));
  const height = () => budget.reduce((h, n, i) => h + n * lh(items[i]), 0) + gap * Math.max(0, items.length - 1);
  if (opts.maxBottom != null) {
    while (y + height() > opts.maxBottom + 0.5 && budget.some((n) => n > 1)) {
      let k = -1;
      budget.forEach((n, i) => {
        if (n > 1 && (k < 0 || n * lh(items[i]) > budget[k] * lh(items[k]))) k = i;
      });
      budget[k] -= 1;
    }
  }
  const els = [];
  const blocks = [];
  let cur = y;
  let cut = false;
  items.forEach((it, i) => {
    if (i > 0) cur += gap;
    const b = tb(x, cur, w, it.text, it.lg, role, {
      over: opts.over,
      nowrap: opts.nowrap,
      valign: opts.valign,
      edit: editOf(it),
      maxLines: budget[i] < natural[i] ? budget[i] : undefined,
    });
    cut = cut || b.cut;
    els.push(b.el);
    blocks.push(b);
    cur = b.bottom;
  });
  return { els, blocks, top: y, bottom: cur, cut, overflow: opts.maxBottom != null && cur > opts.maxBottom + 0.5 };
}

/**
 * 左右并排：中英版中文一栏、英文一栏；单语言只用第一栏（宽 singleW）。
 *   默认顶对齐（两栏第一行共用基线）；bottom:true = y 是底线，两栏最后一行共用基线（中文正好落在 y）
 */
function pside(xs, y, ws, role, pair, lang, opts = {}) {
  const items = itemsOf(lang, pair);
  if (!items.length) return { els: [], blocks: [], top: y, bottom: y, lastBase: y, cut: false };
  const one = items.length === 1;
  const geo = (i) => (one ? [xs[0], opts.singleW ?? ws[0]] : [xs[i], ws[i]]);
  const over = (it) => overFor(opts, it.lg);
  const lines = (it, i) => Math.min(nLines(it.text, it.lg, role, geo(i)[1], over(it), opts.nowrap), opts.maxLines ?? Infinity);
  const blocks = [];
  const make = (it, i, top) => {
    const [x, w] = geo(i);
    const b = tb(x, top, w, it.text, it.lg, role, {
      over: opts.over,
      nowrap: opts.nowrap,
      maxLines: opts.maxLines,
      valign: opts.valign ?? (opts.bottom ? 'b' : undefined),
      edit: editOf(it),
    });
    blocks.push(b);
    return b;
  };
  const a = items[0];
  if (!opts.bottom) {
    make(a, 0, y);
    if (!one) {
      const c = items[1];
      make(c, 1, y + baseOf(a.lg, role, over(a)) - baseOf(c.lg, role, over(c)));
    }
  } else {
    const ha = lines(a, 0) * lhOf(a.lg, role, over(a));
    make(a, 0, y - ha);
    if (!one) {
      const c = items[1];
      const lastBaseA = y - lhOf(a.lg, role, over(a)) + baseOf(a.lg, role, over(a));
      const bottomC = lastBaseA - baseOf(c.lg, role, over(c)) + lhOf(c.lg, role, over(c));
      make(c, 1, bottomC - lines(c, 1) * lhOf(c.lg, role, over(c)));
    }
  }
  const b0 = blocks[0];
  return {
    els: blocks.map((b) => b.el),
    blocks,
    top: Math.min(...blocks.map((b) => b.top)),
    bottom: Math.max(...blocks.map((b) => b.bottom)),
    lastBase: b0.bottom - lhOf(b0.lang, role, overFor(opts, b0.lang)) + baseOf(b0.lang, role, overFor(opts, b0.lang)),
    cut: blocks.some((b) => b.cut),
  };
}

/** 中英并排放得下吗：每种语言的每一段都不用折行（放不下就改成上下对照，免得中文名被折成「全屋定 / 制设计」） */
function fitsSide(pair, lang, role, ws, opts = {}) {
  const items = itemsOf(lang, pair);
  if (items.length < 2) return true;
  return items.every((it, i) => it.text.split('\n').every((line) => nLines(line, it.lg, role, ws[i], overFor(opts, it.lg)) === 1));
}

/** 上下对照时中英之间空多少：每种语言都只有一行 = 紧贴（样张 p6 的说明），多行的正文 = STACK_GAP */
function stackGap(pair, lang, role, w) {
  const items = itemsOf(lang, pair);
  return items.every((it) => nLines(it.text, it.lg, role, w) <= 1) ? 0 : STACK_GAP[role] ?? 0;
}

/** 标题旁的一句话：每种语言的第一行与标题对应语言的第一行共用基线（样张 p4） */
function besideHead(x, w, head, role, pair, lang, opts = {}) {
  const items = itemsOf(lang, pair);
  const els = [];
  const blocks = [];
  let cur = -Infinity;
  items.forEach((it, i) => {
    const h = head.blocks.find((b) => b.lang === it.lg) || head.blocks[i] || head.blocks[0];
    let top = h ? h.top + baseOf(h.lang, 'head') - baseOf(it.lg, role) : head.top;
    if (top < cur) top = cur + (i > 0 ? opts.gap ?? 0 : 0);
    const b = tb(x, top, w, it.text, it.lg, role, { edit: editOf(it), maxLines: opts.maxLines });
    els.push(b.el);
    blocks.push(b);
    cur = b.bottom;
  });
  return { els, blocks, top: blocks[0]?.top ?? head.top, bottom: blocks.length ? cur : head.top, cut: blocks.some((b) => b.cut) };
}

/** 一行里「中文名　English name」（样张 p4 的系列名）：两块文字共用一条基线；放不下就上下排 */
function inlinePair(x, y, w, pair, lang, opts = {}) {
  const items = itemsOf(lang, pair);
  const over = { all: { lh: opts.lh ?? 40 } };
  const maxLines = opts.maxLines ?? 2;
  if (items.length < 2) return pstack(x, y, w, 'body', pair, lang, { over, maxLines });
  const [a, c] = items;
  const wa = lineWidth(runsOf(a.text, styleOf(a.lg, 'body'), a.lg, 'body'));
  const wc = lineWidth(runsOf(c.text, styleOf(c.lg, 'body'), c.lg, 'body'));
  const space = lineWidth(runsOf('　', styleOf('zh', 'body'), 'zh', 'body'));
  if (a.text.includes('\n') || c.text.includes('\n') || wa + space + wc > w * 0.98) {
    return pstack(x, y, w, 'body', pair, lang, { over, gap: 0, maxLines });
  }
  const ba = tb(x, y, wa + 4, a.text, a.lg, 'body', { over, nowrap: true, edit: editOf(a) });
  const bc = tb(x + wa + space, y, w - wa - space, c.text, c.lg, 'body', { over, nowrap: true, edit: editOf(c) });
  return { els: [ba.el, bc.el], blocks: [ba, bc], top: y, bottom: Math.max(ba.bottom, bc.bottom), cut: false };
}

/** 一组「先在 y=0 排好、量出高度，再落到底线上」 */
function restOnLine(bottomY, builder) {
  const trial = builder(0);
  return builder(bottomY - trial.bottom);
}

const MIN_GAP = 48; // 上下两组文字之间至少空这么多

/** 每格最多几行：先不限（地方够就整段排出来），再 3、2、1 行（截短 + 提醒） */
const CELL_LINES = [Infinity, 3, 2, 1];

/**
 * 落在 984 的表格：每格先按自然行数排；表格顶碰到上面的文字（limit）才一档一档减行。
 * 只有真的少排了行，格子里才会截短（cut 由各格自己报）；减到每格一行还碰到 = cut（上面的标题 / 段落再让地方）
 * @param {(lines:number)=>(y:number)=>{els, bottom, top, cut}} build
 * @returns 放得下的那一版；opts.strict 时放不下返回 null
 */
function restTable(limit, build, opts = {}) {
  for (const k of CELL_LINES) {
    const t = restOnLine(984, build(k));
    if (t.top >= limit - 0.5) return t;
  }
  if (opts.strict) return null;
  return { ...restOnLine(984, build(1)), cut: true };
}

/** 一段中英文至少要多高（每种语言一行） */
const minPairH = (lang, role, gap = STACK_GAP[role] ?? 0) =>
  lang === 'bi' ? lhOf('zh', role) + gap + lhOf('en', role) : lhOf(lang === 'en' ? 'en' : 'zh', role);

/** 页标题挂在 96；下面的东西放不下时标题少排几行（每种语言至少一行） */
const headAt = (R, x, w, maxLines, maxBottom) =>
  pstack(x, 96, w, 'head', R.pair('title'), R.lang, { maxLines, ...(maxBottom != null ? { maxBottom } : {}) });

/**
 * 页头（标题 + 中间一段）+ 落在 984 的表格：表格先排，标题与中间那段再按剩下的地方排。
 *   先试「中间那段完整 + 表格」；放不下才让中间那段少排几行（每种语言至少一行）
 */
function headBodyTable(R, { x, w, maxLines, bodyField, bodyW, build }) {
  const { lang } = R;
  const mid = minPairH(lang, 'body');
  const natural = pstack(x, 0, bodyW, 'body', R.pair(bodyField), lang, { gap: STACK_GAP.body }).bottom;
  let head = headAt(R, x, w, maxLines);
  const list = restTable(head.bottom + 56 + Math.max(mid, natural) + MIN_GAP, build, { strict: true })
    || restTable(head.bottom + 56 + mid + MIN_GAP, build);
  const room = list.top - MIN_GAP - 56 - mid;
  if (head.bottom > room) head = headAt(R, x, w, maxLines, room);
  const body = pstack(x, head.bottom + 56, bodyW, 'body', R.pair(bodyField), lang, { gap: STACK_GAP.body, maxBottom: list.top - MIN_GAP });
  return { head, body, list, cut: head.cut || body.cut || body.overflow || list.cut };
}

// ---------------------------------------------------------------------------
// 列表行（细线分隔）：标签一栏 + 值一栏，标签与值每种语言共用基线（样张 p6 / p7）
// ---------------------------------------------------------------------------

/**
 * @param {Array<{ label:object, value:object, note?:object }>} rows   label / value / note 都是 pair（{ zh, en, field, fieldEn }）
 * @param {{ x, w, labelW, valueX, valueW, valueRole?, pad?, noteGap?, valueMax? }} g
 * @returns {(y:number)=>{ els, bottom, cut }}
 */
function listRows(rows, lang, g) {
  const valueRole = g.valueRole || 'body';
  const pad = g.pad ?? 10;
  return (y0) => {
    const els = [hair(g.x, y0, g.w)];
    let y = y0;
    let cut = false;
    for (const r of rows) {
      const top = y + pad;
      const v = pstack(g.valueX, top, g.valueW, valueRole, r.value, lang, { gap: 0, maxLines: g.valueMax ?? 2 });
      let bottom = v.bottom;
      cut = cut || v.cut;
      els.push(...v.els);
      if (r.note) {
        const n = pstack(g.valueX, v.bottom + (g.noteGap ?? 4), g.valueW, 'cap', r.note, lang, { gap: 0, maxLines: g.noteMax ?? 2 });
        els.push(...n.els);
        bottom = n.bottom;
        cut = cut || n.cut;
      }
      // 标签：第 i 种语言对准值的第 i 种语言的第一行（同一行高 → 同一条基线）；
      // 只有一块的标签（年份、中英一样的名字）对准值的第一行，不按「拉丁字母 = 英文」去对英文那一行
      let lb = top;
      const labels = itemsOf(lang, r.label);
      labels.forEach((it, i) => {
        const vb = labels.length === 1 ? v.blocks[0] || null : v.blocks.find((b) => b.lang === it.lg) || v.blocks[i] || null;
        const lh = vb ? lhOf(vb.lang, valueRole) : it.lg === 'zh' ? 40 : 36;
        const capOver = { [it.lg]: { lh } };
        let t = vb ? vb.top + baseOf(vb.lang, valueRole) - baseOf(it.lg, 'cap', { lh }) : lb;
        if (t < lb) t = lb;
        const b = tb(g.x, t, (g.labelW ?? 260) - 16, it.text, it.lg, 'cap', { over: capOver, edit: editOf(it), maxLines: g.valueMax ?? 2 });
        els.push(b.el);
        lb = b.bottom;
        cut = cut || b.cut;
      });
      // 标签为了对齐基线会比值低 1–2px，行高仍按值的行算（样张 p7：每行 96）
      y = Math.max(bottom, lb - 2) + pad;
      els.push(hair(g.x, y, g.w));
    }
    return { els, top: y0, bottom: y, cut };
  };
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
    /** 一个字段的中英文（含设计师的改写） */
    pair(field) {
      const f = def.fields[field];
      if (!f) return { zh: '', en: '' };
      const oz = slide?.overrides?.[field];
      const oe = slide?.overridesEn?.[field];
      const zh = fill(typeof oz === 'string' ? oz : f.zh);
      const shared = f.en === undefined;
      // 只改了中文：能自动换成英文的（Mr & Mrs Lau、5 年 → 5 years）英文跟着变，不再提醒
      const auto = !shared && typeof oz === 'string' && typeof oe !== 'string' ? autoEnOf(f, zh) : '';
      const en = typeof oe === 'string' ? fill(oe) : shared ? zh : auto || fill(f.en);
      const fields = { field: `overrides.${field}`, fieldEn: shared && typeof oe !== 'string' ? `overrides.${field}` : `overridesEn.${field}` };
      // 英文栏清空 = 这一行在英文里不要：English 版不显示（不退回中文），中英版只显示中文
      if (typeof oe === 'string' && !en) return { zh: lang === 'en' ? '' : zh, en: '', ...fields };
      // 这一段的英文用到了还没有翻译的客户 / 地点 / 方案名：现在才记「缺英文」（页面会提醒）
      if (!auto) touch(typeof oe === 'string' ? oe : f.en);
      if (lang !== 'zh' && !shared && !auto && typeof oz === 'string' && typeof oe !== 'string' && clean(oz) !== clean(fillTokens(f.zh, tokens))) {
        staleEn.push(f.label);
      }
      return { zh, en, ...fields };
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
    /** 照片位 → 图片元素（cover 裁满 + 取景；不压暗） */
    photo(name, x, y, w, h) {
      const edit = { field: `image.${name}` };
      const { src, nat, frame, label } = R.resolve(name);
      if (!src) {
        warn(`缺照片：${label} —— 点这个位置换一张照片`);
        return { t: 'rect', x, y, w, h, fill: B.sample, edit, name: `photo:${name}` };
      }
      if (!nat?.w || !nat?.h) return { t: 'img', x, y, w, h, src, fit: 'cover', ax: 0.5, ay: 0.5, edit, name: `photo:${name}` };
      const cover = Math.max(w / nat.w, h / nat.h);
      const s = cover * Math.max(1, frame.zoom || 1);
      if (s > 1.15) warn(`图片像素偏低：${label}放大 ${s.toFixed(1)} 倍会发虚，建议换高清图`);
      const dw = nat.w * s;
      const dh = nat.h * s;
      const ax = frame.ax ?? 0.5;
      const ay = frame.ay ?? 0.5;
      const ox = (dw - w) * ax;
      const oy = (dh - h) * ay;
      const r4 = (v) => Math.max(0, Math.round(v * 1e5) / 1e5);
      return {
        t: 'img',
        x,
        y,
        w,
        h,
        src,
        nat,
        fit: 'cover',
        ax,
        ay,
        crop: { l: r4(ox / dw), t: r4(oy / dh), r: r4((dw - w - ox) / dw), b: r4((dh - h - oy) / dh) },
        edit,
        name: `photo:${name}`,
      };
    },
    logo: (x, y, w = 224) => ({ t: 'img', x, y, w, h: Math.round((w * LOGO.nat.h) / LOGO.nat.w * 10) / 10, src: LOGO.src, nat: LOGO.nat, fit: 'contain', name: 'logo' }),
    /** 这一组有截短（说不出是哪一栏时，提醒里用 what 说位置） */
    cutWarn(cut, what) {
      if (cut && !areaCuts.includes(what)) areaCuts.push(what);
    },
    /** 这一栏少排了（不是靠「…」截短的，例如封底的地址只排前三行） */
    cutAt(field) {
      if (field && !cutFields.includes(field)) cutFields.push(field);
    },
    finish(els) {
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
      return page(els, warnings);
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
// 各页版式
// ---------------------------------------------------------------------------

/** 封面（样张 p1）：logo 左上；客户名（大字，中 | 英并排）+ 方案名 + 日期落在 984；右侧照片 */
function layCover(R) {
  const { lang } = R;
  const els = [R.photo('photo', 972, 0, 948, 1080), R.logo(120, 96)];
  const name = R.pair('name');
  const sub = R.pair('subtitle');
  const date = R.pair('date');
  const hasName = pick(lang, name).length > 0;
  const head = hasName ? name : sub;
  const xs = [120, 404];
  const ws = [260, 544];
  let cut = false;
  const sideBySide = fitsSide(head, lang, 'display', ws);
  const subSide = fitsSide(sub, lang, 'body', ws);
  // 整组（客户名 + 方案名 + 日期）落在 984：上下对照的块靠底排（valign 'b'），多估一行也不会在中间空出一行
  const g = restOnLine(984, (y0) => {
    const out = [];
    const t = sideBySide
      ? pside(xs, y0, ws, 'display', head, lang, { singleW: 828, maxLines: 5, valign: 'b' })
      : pstack(120, y0, 828, 'display', head, lang, { gap: 0, maxLines: 3, valign: 'b' });
    out.push(...t.els);
    cut = t.cut;
    let y = t.bottom;
    if (hasName && pick(lang, sub).length) {
      // 方案名：中英并排放得下才并排；自定义的长方案名改成中文一行、英文一行，免得中文在半截折行
      const s = subSide
        ? pside(xs, y + 16, ws, 'body', sub, lang, { singleW: 828, maxLines: 2 })
        : pstack(120, y + 16, 828, 'body', sub, lang, { gap: 0, maxLines: 2, valign: 'b' });
      out.push(...s.els);
      y = s.bottom;
      cut = cut || s.cut;
    }
    if (pick(lang, date).length) {
      const d = pside(xs, y + 44, ws, 'cap', date, lang, { singleW: 828, maxLines: 1 });
      out.push(...d.els);
      y = d.bottom;
    }
    return { els: out, bottom: y };
  });
  R.cutWarn(cut, '客户与地点');
  return [...els, ...g.els];
}

/**
 * 目录：标题挂在 96；看得到的几章一行一行，细线分隔，落在 984。
 * 老客户隐藏了品牌 / 公司 / 服务章节：那一章不列，编号按看得到的章节重排（01、02…）；每行的文字仍是那一章的栏位
 */
function layContents(R) {
  const { lang } = R;
  const head = pstack(120, 96, 828, 'head', R.pair('title'), lang, { maxLines: 1 });
  let cut = false;
  const pad = lang === 'bi' ? 26 : 34;
  const shown = (R.chapters?.list || CHAPTERS).map((c) => CHAPTERS.indexOf(c) + 1).filter((i) => i > 0);
  if (!shown.length) return head.els;
  const rows = (y0) => {
    const out = [hair(120, y0, 1680)];
    let y = y0;
    for (const [n, i] of shown.map((idx, k) => [k + 1, idx])) {
      const top = y + pad;
      const t = pstack(404, top, 402, 'head', R.pair(`ch${i}`), lang, { maxLines: 1 });
      const t0 = t.blocks[0];
      const firstBase = t0 ? t0.top + baseOf(t0.lang, 'head') : top + 47;
      const line = R.pair(`ch${i}Line`);
      const li = itemsOf(lang, line);
      const dTop = firstBase - baseOf(li[0]?.lg || 'zh', 'body');
      // 两行说明的第二行对准标题英文那一行的基线
      let gap = STACK_GAP.body;
      if (t.blocks.length === 2 && li.length === 2 && t.blocks[0].lines === 1) {
        const enBase = t.blocks[1].top + baseOf(t.blocks[1].lang, 'head');
        const zhLines = nLines(li[0].text, li[0].lg, 'body', 828);
        if (zhLines === 1) gap = Math.max(0, enBase - baseOf(li[1].lg, 'body') - (dTop + 40));
      }
      const d = pstack(972, dTop, 828, 'body', line, lang, { gap, maxLines: 1 });
      const num = tb(120, firstBase - baseOf('en', 'cap'), 142, String(n).padStart(2, '0'), 'en', 'cap', { nowrap: true });
      out.push(num.el, ...t.els, ...d.els);
      cut = cut || t.cut || d.cut;
      y = Math.max(t.bottom, d.bottom) + pad;
      out.push(hair(120, y, 1680));
    }
    return { els: out, bottom: y };
  };
  const list = restOnLine(984, rows);
  R.cutWarn(cut, '目录');
  return [...head.els, ...list.els];
}

/** 章节页（样张 p2）：左侧竖图从顶边垂下，脚落在大标题最后一行的基线；章节名挂在 96；大标题 + 一句话落在 984 */
function layDivider(R) {
  const { lang } = R;
  const xs = [830, 1256];
  const ws = [402, 544];
  const label = pside(xs, 96, ws, 'cap', R.pair('label'), lang, { singleW: 970, maxLines: 1 });
  // 一句话和大标题一样：中英每种语言都能一行排下才并排（最后一行共用基线 984）；
  // 放不下（例如三层楼的「一楼、二楼与三楼，逐个空间的设计。」）就中文一行、英文一行上下排，整组落在 984
  const lp = R.pair('lead');
  const lead = fitsSide(lp, lang, 'body', ws)
    ? pside(xs, 984, ws, 'body', lp, lang, { singleW: 970, bottom: true, maxLines: 2 })
    : restOnLine(984, (y) => pstack(830, y, 970, 'body', lp, lang, { gap: stackGap(lp, lang, 'body', 970), maxLines: 2, valign: 'b' }));
  const titleBottom = lead.blocks.length ? lead.top - 18 : 984;
  const tp = R.pair('title');
  let title;
  let foot = titleBottom;
  if (fitsSide(tp, lang, 'display', ws)) {
    title = pside(xs, titleBottom, ws, 'display', tp, lang, { singleW: 970, bottom: true, maxLines: 4 });
    if (title.blocks.length) foot = title.lastBase;
  } else {
    // 中英放不下并排：中文在上、英文在下，整组落在一句话上面
    title = restOnLine(titleBottom, (y) => pstack(830, y, 970, 'display', tp, lang, { gap: 0, maxLines: 3, valign: 'b' }));
    const lb = title.blocks[title.blocks.length - 1];
    if (lb) foot = lb.bottom - lhOf(lb.lang, 'display') + baseOf(lb.lang, 'display');
  }
  R.cutWarn(lead.cut || title.cut || label.cut, '章节页文字');
  foot = Math.round(foot);
  return [R.photo('photo', 120, 0, 544, foot), ...label.els, ...title.els, ...lead.els];
}

/**
 * 品牌理念：右侧照片从顶边垂下，脚落在正文最后一行的基线；标题挂在 96；正文 + 结语落在 984。
 *   横图 = 第 7–12 栏、出血到右边；竖图 = 第 9–12 栏的竖版（像章节页的竖图，左右对调）
 */
function layPhilosophy(R) {
  const { lang } = R;
  const wide = (R.ratio('photo') ?? 1.5) >= 1.2;
  const head = pstack(120, 96, wide ? 828 : 1012, 'head', R.pair('title'), lang, { maxLines: 3 });
  const closing = restOnLine(984, (y) => pstack(120, y, 1012, 'body', R.pair('closing'), lang, { gap: 0, maxLines: 2, valign: 'b' }));
  const bodyBottom = closing.els.length ? closing.top - 32 : 984;
  // 正文按自然行数落在结语上面；碰到标题才从标题下面排、截到底
  const body = restOnLine(bodyBottom, (y) => pstack(120, y, 760, 'body', R.pair('body'), lang, { gap: STACK_GAP.body, valign: 'b' }));
  let bodyEls = body.els;
  let last = body.blocks[body.blocks.length - 1];
  if (body.top < head.bottom + MIN_GAP) {
    // 太长：从标题下面开始排，截到底
    const b2 = pstack(120, head.bottom + MIN_GAP, 760, 'body', R.pair('body'), lang, { gap: STACK_GAP.body, maxBottom: bodyBottom });
    bodyEls = b2.els;
    last = b2.blocks[b2.blocks.length - 1];
    R.cutWarn(b2.cut || b2.overflow, '理念正文');
  }
  R.cutWarn(head.cut || closing.cut || body.cut, '理念');
  const foot = Math.min(904, last ? Math.round(last.bottom - lhOf(last.lang, 'body') + baseOf(last.lang, 'body')) : 904);
  const pic = wide ? R.photo('photo', 972, 0, 948, foot) : R.photo('photo', 1256, 0, 544, foot);
  return [pic, ...head.els, ...bodyEls, ...closing.els];
}

/** 品牌故事（样张 p3）：右侧大照片出血；左栏标题 + 正文挂在 96，两个地名落在 984 */
function layStory(R) {
  const { lang } = R;
  const els = [R.photo('photo', 760, 0, 1160, 1080)];
  const head = pstack(120, 96, 600, 'head', R.pair('title'), lang, { maxLines: 2 });
  const figs = restOnLine(984, (y0) => {
    const out = [hair(120, y0, 544)];
    let bottom = y0;
    [1, 2].forEach((n, i) => {
      const x = i ? 404 : 120;
      const yr = R.pair(`year${n}`);
      const yi = itemsOf(lang, yr)[0];
      if (yi) out.push(tb(x, y0 + 16, 260, yi.text, yi.lg, 'cap', { maxLines: 1, edit: editOf(yi) }).el);
      const pl = pstack(x, y0 + 44, 260, 'body', R.pair(`place${n}`), lang, { gap: 0, maxLines: 1 });
      out.push(...pl.els);
      bottom = Math.max(bottom, pl.bottom);
    });
    return { els: out, bottom };
  });
  const body = pstack(120, head.bottom + 56, 600, 'body', R.pair('body'), lang, { gap: STACK_GAP.body, maxBottom: figs.els[0].y - MIN_GAP });
  R.cutWarn(body.cut || body.overflow || head.cut, '品牌故事正文');
  return [...els, ...head.els, ...body.els, ...figs.els];
}

/** 原创系列（样张 p4）：标题 + 一句话；五张竖图；图下系列名（中　英一行）与说明，最长的一组落在 984 */
function layCollections(R) {
  const { lang } = R;
  const head = pstack(120, 96, 828, 'head', R.pair('title'), lang, { maxLines: 1 });
  const note = besideHead(1256, 544, head, 'body', R.pair('note'), lang, { maxLines: 3 });
  const X = [0, 1, 2, 3, 4].map((i) => 120 + 342 * i);
  let cut = note.cut;
  const caption = (i) => (y) => {
    const nm = inlinePair(X[i], y, 312, R.pair(`c${i + 1}`), lang);
    const d = pstack(X[i], nm.bottom + 20, 312, 'cap', R.pair(`c${i + 1}Line`), lang, { gap: 0, maxLines: 3 });
    cut = cut || nm.cut || d.cut;
    return { els: [...nm.els, ...d.els], bottom: d.bottom };
  };
  const capH = Math.max(...X.map((_, i) => caption(i)(0).bottom));
  const plateTop = Math.max(280, Math.ceil(head.bottom + 64), Math.ceil(note.bottom + 30));
  const plateBottom = 984 - capH - 32;
  const els = [...head.els, ...note.els];
  X.forEach((x, i) => els.push(R.photo(`c${i + 1}`, x, plateTop, 312, Math.max(120, plateBottom - plateTop))));
  X.forEach((_, i) => els.push(...caption(i)(plateBottom + 32).els));
  R.cutWarn(cut, '系列说明');
  return els;
}

/** 设计奖项：左侧照片从顶边垂到 984（与列表最后一条细线齐）；右栏标题挂在 96，四个奖项落在 984 */
function layAwards(R) {
  const { lang } = R;
  let head = headAt(R, 1114, 686, 2);
  const rows = [1, 2, 3, 4].map((n) => ({ label: R.pair(`y${n}`), value: R.pair(`a${n}`), note: R.pair(`a${n}Note`) }));
  const list = restTable(head.bottom + MIN_GAP, (k) =>
    listRows(rows, lang, { x: 1114, w: 686, labelW: 142, valueX: 1256, valueW: 544, pad: 14, noteGap: 6, valueMax: k, noteMax: k }));
  if (head.bottom > list.top - MIN_GAP) head = headAt(R, 1114, 686, 2, list.top - MIN_GAP);
  R.cutWarn(list.cut || head.cut, '奖项');
  return [R.photo('photo', 0, 0, 948, 984), ...head.els, ...list.els];
}

/** 全球供应链：没有 logo 墙 —— 三类、品牌名用标题字级；一句话与标题共用基线 */
function laySupply(R) {
  const { lang } = R;
  const head = pstack(120, 96, 828, 'head', R.pair('title'), lang, { maxLines: 1 });
  let lead = besideHead(1256, 544, head, 'body', R.pair('lead'), lang, { maxLines: 3 });
  let cut = false;
  const rows = (k) => (y0) => {
    const out = [hair(120, y0, 1680)];
    let y = y0;
    for (let n = 1; n <= 3; n++) {
      const top = y + 30;
      const v = pstack(404, top, 1396, 'head', R.pair(`s${n}Brands`), lang, { gap: 0, maxLines: k });
      const v0 = v.blocks[0];
      const base0 = v0 ? v0.top + baseOf(v0.lang, 'head') : top + 44;
      let lb = top;
      itemsOf(lang, R.pair(`s${n}`)).forEach((it, i) => {
        const t = i === 0 ? base0 - baseOf(it.lg, 'cap') : lb;
        const b = tb(120, t, 244, it.text, it.lg, 'cap', { edit: editOf(it), maxLines: k });
        out.push(b.el);
        lb = b.bottom;
        cut = cut || b.cut;
      });
      out.push(...v.els);
      cut = cut || v.cut;
      y = Math.max(v.bottom, lb) + 30;
      out.push(hair(120, y, 1680));
    }
    return { els: out, top: y0, bottom: y, cut };
  };
  const list = restTable(Math.max(head.bottom, lead.bottom) + MIN_GAP, rows);
  if (lead.bottom > list.top - MIN_GAP) lead = besideHead(1256, 544, head, 'body', R.pair('lead'), lang, { maxLines: 1 });
  R.cutWarn(cut || list.cut || head.cut || lead.cut, '供应链');
  return [...head.els, ...lead.els, ...list.els];
}

/** 关于瑞吉欧：右侧照片（实木细节）；左栏标题 + 正文挂在 96，两条业务落在 984 */
function layAbout(R) {
  const { lang } = R;
  const rows = [1, 2].map((n) => ({ label: R.pair(`line${n}`), value: R.pair(`line${n}Text`) }));
  const { head, body, list, cut } = headBodyTable(R, {
    x: 120, w: 828, maxLines: 3, bodyField: 'body', bodyW: 686,
    build: (k) => listRows(rows, lang, { x: 120, w: 970, labelW: 284, valueX: 404, valueW: 686, valueMax: k }),
  });
  R.cutWarn(cut, '公司介绍');
  return [R.photo('photo', 1256, 0, 664, 1080), ...head.els, ...body.els, ...list.els];
}

/** 发展历程：标题 + 一句话；八件事分左右两栏（各四行，行高对齐），落在 984 */
function layHistory(R) {
  const { lang } = R;
  const head = pstack(120, 96, 828, 'head', R.pair('title'), lang, { maxLines: 1 });
  let lead = besideHead(972, 828, head, 'body', R.pair('lead'), lang, { maxLines: 2 });
  const col = (n) => (n <= 4 ? { x: 120, tx: 262 } : { x: 972, tx: 1114 });
  const cell = (n, top, k) => {
    const { x, tx } = col(n);
    const ev = pstack(tx, top, 686, 'body', R.pair(`e${n}`), lang, { gap: 0, maxLines: k });
    const e0 = ev.blocks[0];
    const yi = itemsOf(lang, R.pair(`y${n}`))[0];
    const yr = yi ? tb(x, (e0 ? e0.top + baseOf(e0.lang, 'body') : top + 27) - baseOf(yi.lg, 'cap'), 120, yi.text, yi.lg, 'cap', { maxLines: 1, edit: editOf(yi) }) : null;
    return { els: [...(yr ? [yr.el] : []), ...ev.els], h: ev.bottom - top, cut: ev.cut };
  };
  const pad = lang === 'bi' ? 12 : 22;
  // 左右两栏的第 i 行一样高（细线对齐）
  const table = (k) => (y0) => {
    const heights = [1, 2, 3, 4].map((i) => Math.max(cell(i, 0, k).h, cell(i + 4, 0, k).h) + 2 * pad);
    let y = y0;
    let c = false;
    const out = [hair(120, y, 828), hair(972, y, 828)];
    heights.forEach((h, i) => {
      const a = cell(i + 1, y + pad, k);
      const b = cell(i + 5, y + pad, k);
      out.push(...a.els, ...b.els);
      c = c || a.cut || b.cut;
      y += h;
      out.push(hair(120, y, 828), hair(972, y, 828));
    });
    return { els: out, top: y0, bottom: y, cut: c };
  };
  const list = restTable(Math.max(head.bottom, lead.bottom) + MIN_GAP, table);
  if (lead.bottom > list.top - MIN_GAP) lead = besideHead(972, 828, head, 'body', R.pair('lead'), lang, { maxLines: 1 });
  const els = [...head.els, ...lead.els, ...list.els];
  R.cutWarn(head.cut || lead.cut || list.cut, '发展历程');
  return els;
}

/** 展厅与仓储：左侧照片出血；右栏标题 + 一句话挂在 96，三个地方落在 984 */
function layShowrooms(R) {
  const { lang } = R;
  const rows = (k) => (y0) => {
    const out = [hair(1114, y0, 686)];
    let y = y0;
    let c = false;
    for (let n = 1; n <= 3; n++) {
      const nm = inlinePair(1114, y + 14, 686, R.pair(`p${n}`), lang, { maxLines: k });
      const d = pstack(1114, nm.bottom + 8, 686, 'cap', R.pair(`p${n}Text`), lang, { gap: 0, maxLines: k });
      out.push(...nm.els, ...d.els);
      c = c || nm.cut || d.cut;
      y = d.bottom + 14;
      out.push(hair(1114, y, 686));
    }
    return { els: out, top: y0, bottom: y, cut: c };
  };
  const { head, body: lead, list, cut } = headBodyTable(R, { x: 1114, w: 686, maxLines: 2, bodyField: 'lead', bodyW: 686, build: rows });
  R.cutWarn(cut, '展厅');
  return [R.photo('photo', 0, 0, 948, 1080), ...head.els, ...lead.els, ...list.els];
}

/** 品质认证：右侧照片出血；标题挂在 96，正文落在 984 */
function layCertified(R) {
  const { lang } = R;
  const head = pstack(120, 96, 760, 'head', R.pair('title'), lang, { maxLines: 2 });
  let body = restOnLine(984, (y) => pstack(120, y, 686, 'body', R.pair('body'), lang, { gap: STACK_GAP.body, valign: 'b' }));
  if (body.top < head.bottom + MIN_GAP) {
    const b2 = pstack(120, head.bottom + MIN_GAP, 686, 'body', R.pair('body'), lang, { gap: STACK_GAP.body, maxBottom: 984 });
    R.cutWarn(true, '认证正文');
    body = b2;
  }
  R.cutWarn(body.cut || head.cut, '认证正文');
  return [R.photo('photo', 972, 0, 948, 1080), ...head.els, ...body.els];
}

/** 服务流程：标题挂在 96、一句话与标题共用基线（样张 p4 的页头）；五个步骤一行一个（编号 | 步骤 | 说明），落在 984 */
function layProcess(R) {
  const { lang } = R;
  const head = pstack(120, 96, 828, 'head', R.pair('title'), lang, { maxLines: 1 });
  let lead = besideHead(972, 828, head, 'body', R.pair('lead'), lang, { maxLines: 2 });
  const pad = lang === 'bi' ? 20 : 28;
  const rows = (k) => (y0) => {
    const out = [hair(120, y0, 1680)];
    let y = y0;
    let c = false;
    for (let n = 1; n <= 5; n++) {
      const top = y + pad;
      const t = pstack(404, top, 520, 'body', R.pair(`s${n}`), lang, { gap: 0, maxLines: k });
      const t0 = t.blocks[0];
      const base0 = t0 ? t0.top + baseOf(t0.lang, 'body') : top + 27;
      // 说明（小字）：每种语言对准步骤名对应语言那一行
      let db = -Infinity;
      const dEls = [];
      itemsOf(lang, R.pair(`s${n}Text`)).forEach((it, i) => {
        const tbk = t.blocks.find((b) => b.lang === it.lg) || t.blocks[i];
        let top2 = tbk ? tbk.top + baseOf(tbk.lang, 'body') - baseOf(it.lg, 'cap') : base0 - baseOf(it.lg, 'cap');
        if (top2 < db) top2 = db;
        const b = tb(972, top2, 828, it.text, it.lg, 'cap', { edit: editOf(it), maxLines: k });
        dEls.push(b.el);
        db = b.bottom;
        c = c || b.cut;
      });
      const num = tb(120, base0 - baseOf('en', 'cap'), 120, `0${n}`, 'en', 'cap', { nowrap: true });
      out.push(num.el, ...t.els, ...dEls);
      c = c || t.cut;
      y = Math.max(t.bottom, db) + pad;
      out.push(hair(120, y, 1680));
    }
    return { els: out, top: y0, bottom: y, cut: c };
  };
  const list = restTable(Math.max(head.bottom, lead.bottom) + MIN_GAP, rows);
  if (lead.bottom > list.top - MIN_GAP) lead = besideHead(972, 828, head, 'body', R.pair('lead'), lang, { maxLines: 1 });
  R.cutWarn(head.cut || lead.cut || list.cut, '服务流程');
  return [...head.els, ...lead.els, ...list.els];
}

/** 订单周期一行的留白：细线到天数大字顶 / 最后一行基线到下一条细线 */
const CYCLE_PAD = { top: 48, bottom: 52 };
/** 天数与单位之间空多少（天数字号的倍数，约一个空格） */
const CYCLE_GAP_EM = 0.26;
/** Hanken Grotesk 数字 / 大写字母的高度（em） */
const CAP_EM = 0.7;

/**
 * 订单周期：两行通栏（第 1 栏系列名 | 第 7 栏天数），落在 984；不做成仪表盘。
 *   天数中英共用、只印一次（标题字级），落在系列名第一行（中文）的基线上；单位用正文字级跟在天数后面：
 *   中英版「天」在中文基线上，「days」在英文系列名那一行的基线上，正好排在「天」下面（同一个 x）
 */
function layCycle(R) {
  const { lang } = R;
  const head = pstack(120, 96, 828, 'head', R.pair('title'), lang, { maxLines: 2 });
  let cut = head.cut;
  const FIG_X = 972;
  const rows = (y0) => {
    const out = [hair(120, y0, 1680)];
    let y = y0;
    for (let n = 1; n <= 2; n++) {
      const labelPair = R.pair(`s${n}`);
      const li = itemsOf(lang, labelPair);
      const fi = itemsOf(lang, R.pair(`s${n}N`))[0] || null;
      const units = itemsOf(lang, R.pair(`s${n}Unit`));
      const lg0 = li[0]?.lg || units[0]?.lg || (lang === 'en' ? 'en' : 'zh');
      // 第一条基线：细线 + 留白 + 天数大字的高度（没有天数就按正文）
      const capH = fi ? CAP_EM * styleOf(fi.lg, 'head').px : CAP_EM * styleOf(lg0, 'body').px;
      const base1 = y + CYCLE_PAD.top + capH;
      // 系列名：中文在上、英文紧贴在下
      const lab = pstack(120, base1 - baseOf(lg0, 'body'), 686, 'body', labelPair, lang, { gap: 0, maxLines: 2 });
      cut = cut || lab.cut;
      out.push(...lab.els);
      let lastBase = lab.blocks.length ? lab.bottom - lhOf(lab.blocks.at(-1).lang, 'body') + baseOf(lab.blocks.at(-1).lang, 'body') : base1;
      let bottom = lab.bottom;
      // 天数（一次）。紧跟着的单位（华文 / 中英版「天」、English 版「days」）和天数排在同一段里：
      // 大小两种字号共用一条基线，网页、PowerPoint、WPS 都一样（分成两个框的话，各家排行的方式不同，会差几个像素）
      let ux = FIG_X;
      let rest = units;
      let prev = null;
      if (fi) {
        const figSt = styleOf(fi.lg, 'head');
        const u0 = units[0] || null;
        let figRuns = runsOf(fi.text.replace(/\n/g, ' '), figSt, fi.lg, 'head');
        if (u0) {
          // 天数与单位之间的空：加在天数最后一个字的字距上（空格在各家软件里宽窄不一，字距是一样的）
          const last = figRuns[figRuns.length - 1];
          const chars = [...last.text];
          const gapPt = Math.round(((CYCLE_GAP_EM * figSt.px) / PX_PER_PT + (last.spacing || 0)) * 100) / 100;
          figRuns = [
            ...figRuns.slice(0, -1),
            ...(chars.length > 1 ? [{ ...last, text: chars.slice(0, -1).join('') }] : []),
            { ...last, text: chars[chars.length - 1], spacing: gapPt },
          ];
        }
        const uRuns = u0 ? runsOf(u0.text.replace(/\n/g, ' '), styleOf(u0.lg, 'body'), u0.lg, 'body') : [];
        const figW = lineWidth(figRuns);
        const allW = figW + lineWidth(uRuns);
        if (!fi.text.includes('\n') && allW <= 828 * 0.9) {
          const top = base1 - baseOf(fi.lg, 'head');
          // 不设 nowrap：网页预览里 nowrap 的段落按弹性盒排，两种字号就不在一条基线上了；框一直宽到 1800，不会折行
          out.push({
            t: 'text',
            x: FIG_X - INSET,
            y: top - INSET,
            w: 828 + 2 * INSET,
            h: figSt.lh + 2 * INSET,
            paras: [{ align: 'l', lineHeight: figSt.lh, runs: [...figRuns, ...uRuns] }],
            edit: editOf(fi),
          });
          bottom = Math.max(bottom, top + figSt.lh);
          ux = FIG_X + figW;
          rest = units.slice(1);
          prev = { bottom: top + figSt.lh };
        } else {
          // 太长：天数自己一行（截短 + 提醒），单位另起
          const f = tb(FIG_X, base1 - baseOf(fi.lg, 'head'), 544, fi.text, fi.lg, 'head', { maxLines: 1, edit: editOf(fi) });
          out.push(f.el);
          cut = cut || f.cut;
          bottom = Math.max(bottom, f.bottom);
          ux = FIG_X + 544 + Math.round(CYCLE_GAP_EM * figSt.px);
        }
      }
      // 其余的单位（中英版的「days」）：第 i 种语言落在系列名同一种语言第一行的基线，正好排在「天」下面（没有就接着上一行往下）
      rest.forEach((u) => {
        const i = units.indexOf(u);
        const lb = lab.blocks.find((b) => b.lang === u.lg) || lab.blocks[i];
        let base = lb ? lb.top + baseOf(lb.lang, 'body') : base1;
        if (prev && base < prev.bottom + baseOf(u.lg, 'body')) base = prev.bottom + baseOf(u.lg, 'body');
        const t = tb(ux, base - baseOf(u.lg, 'body'), 1800 - ux, u.text, u.lg, 'body', { maxLines: 1, edit: editOf(u) });
        out.push(t.el);
        cut = cut || t.cut;
        bottom = Math.max(bottom, t.bottom);
        lastBase = Math.max(lastBase, base);
        prev = t;
      });
      y = Math.max(lastBase + CYCLE_PAD.bottom, bottom + 8);
      out.push(hair(120, y, 1680));
    }
    return { els: out, top: y0, bottom: y };
  };
  const list = restOnLine(984, rows);
  R.cutWarn(cut, '订单周期');
  return [...head.els, ...list.els];
}

/**
 * 售后维保：右侧竖图（第 9–12 栏）从顶边垂到 984，与列表最后一条细线齐；左栏标题 + 一句话挂在 96，四项落在 984。
 * 质保年数是空格（＿＿），设计师填；没填会提醒
 */
function layAftersales(R) {
  const { lang } = R;
  const rows = [1, 2, 3, 4].map((n) => ({ label: R.pair(`r${n}`), value: R.pair(`r${n}Text`) }));
  const { head, body: lead, list, cut } = headBodyTable(R, {
    x: 120, w: 828, maxLines: 2, bodyField: 'lead', bodyW: 686,
    build: (k) => listRows(rows, lang, { x: 120, w: 970, labelW: 284, valueX: 404, valueW: 686, valueMax: k }),
  });
  R.cutWarn(cut, '售后维保');
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
  return [R.photo('photo', 1256, 0, 544, 984), ...head.els, ...lead.els, ...list.els];
}

/** 封底（样张 p7）：logo 与结语挂在上方；联系方式三行落在 984（标签中英两行，值的每一行对准标签的行）；二维码；右侧照片 */
function layClosing(R) {
  const { lang } = R;
  const els = [R.photo('photo', 1256, 0, 664, 1080), R.logo(120, 96)];
  const enDisplay = lang === 'bi' ? { en: { px: 52, lh: 72 } } : undefined;
  let cut = false;
  const rows = (y0) => {
    const out = [hair(120, y0, 828)];
    let y = y0;
    for (let n = 1; n <= 3; n++) {
      const top = y + 10;
      const labels = itemsOf(lang, R.pair(`l${n}`));
      const val = itemsOf(lang, R.pair(`v${n}`))[0];
      // 行距：第一行 40（与中文标签同行），之后 36（与英文标签同行）；行高按行数算（样张：两行 = 96）
      const pitches = [40, 36, 36, 36];
      const lines = val ? val.text.split('\n').slice(0, 3) : [];
      if (val && val.text.split('\n').length > 3) R.cutAt(val.field);
      let cur = top;
      lines.forEach((line, i) => {
        const lh = pitches[i];
        const b = tb(404, cur, 544, line, val.lg, 'body', { over: { all: { lh } }, edit: editOf(val), maxLines: 1 });
        out.push(b.el);
        cut = cut || b.cut;
        cur = b.bottom;
      });
      let lb = top;
      labels.forEach((it, i) => {
        const lh = pitches[i];
        const valBase = top + pitches.slice(0, i).reduce((a, b) => a + b, 0) + baseOf(val?.lg || 'en', 'body', { lh });
        let t = valBase - baseOf(it.lg, 'cap', { lh });
        if (t < lb) t = lb;
        const b = tb(120, t, 268, it.text, it.lg, 'cap', { over: { [it.lg]: { lh } }, edit: editOf(it), maxLines: 1 });
        out.push(b.el);
        lb = b.bottom;
      });
      const slots = Math.max(lines.length, labels.length, 1);
      y = top + pitches.slice(0, slots).reduce((a, b) => a + b, 0) + 10;
      out.push(hair(120, y, 828));
    }
    return { els: out, bottom: y };
  };
  const list = restOnLine(984, rows);
  const sign = pstack(120, 248, 1088, 'display', R.pair('title'), lang, { gap: 16, over: enDisplay, maxLines: 3, maxBottom: list.els[0].y - MIN_GAP });
  R.cutWarn(sign.cut || sign.overflow, '结语');
  R.cutWarn(cut, '封底');
  return [...els, ...sign.els, ...list.els, { t: 'img', x: 952, y: 819, w: 185, h: 185, src: QR.src, nat: QR.nat, fit: 'contain', name: 'qr' }];
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
 * 公司固定页（B 格物品牌画册）
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
