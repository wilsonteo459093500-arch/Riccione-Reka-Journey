// 公司固定页的英文版 / 中英版。华文版 = 定稿原样（companyTemplate.js），这里只写和华文版不一样的地方。
//
// EN[页][元素序号]  —— English 版这一框的文字：
//   '文字'                          换成这段英文（\n 分段，沿用原来的字体字号）
//   ''                              English 版不显示这一框（位置空着，版面其余不动）
//   { text, size?, spacing?, font?, lineSpacing?, x?, y?, w?, h?, align?, fromZh? }
//                                   换字的同时改样式 / 位置；fromZh(中文现文字) → 英文：设计师改过中文时自动跟着换（如「5 年」→「5 years」）
// BI[页][元素序号]  —— 中英版在中文后面另起一段的英文：
//   '文字' 或 { en, as?:'body'|'caps'|'small', size?, color?, spacing?, x?, y?, w?, h?, align? }
//   as：body = 正文的英文（小一号的宋体、浅一点）；caps = 大写小字（无衬线、拉开字距）；small = 小一号的宋体
//   另外可写 { hide:true }（中英版不显示）或只改位置 { y, h }（无英文）
// FLOWS[页] —— 同一栏从上到下的元素（[a, b] = 同一行并排的几个）：上面的字变多，下面的跟着往下挪；
//   整栏超过 bottom 就把这一栏改过的字缩小（先缩正文，不够再缩全部）。minGap = 原来的行距最多压到多小。
//
// 文案风格：与定稿英文一致的克制、自然；英式拼写（colour / centre / storey）；不新增定稿里没有的事实。

const years = (zh) => {
  const m = /(\d+)\s*年/.exec(String(zh || ''));
  return m ? `${m[1]} years` : null;
};

export const EN = {
  cover: {
    5: { text: '{{proposalTitleEn}}', spacing: 3 },
    7: 'CUSTOM DOORS · WALLS · CABINETRY',
    9: { text: 'LIVING NATURALLY · RETURNING TO LIFE', w: 900 },
  },

  contents: {
    2: { text: 'Contents', spacing: 4, w: 560 },
    5: { text: 'Brand · SAIL', w: 760 },
    6: { text: 'LIVING NATURALLY, RETURNING TO LIFE', w: 960 },
    9: { text: 'Company · Riccione', w: 760 },
    10: { text: 'A DECADE OF CRAFT, IN MALAYSIA & CHINA', w: 960 },
    13: { text: 'Design Proposal', w: 760 },
    14: { text: '{{floorsLineEnUpper}}', w: 960 },
    17: { text: 'Service · Delivery', w: 760 },
    18: { text: 'TEAM · PROCESS · LEAD TIME · AFTERCARE', w: 960 },
  },

  'brand-divider': {
    3: { text: 'Brand · SAIL', spacing: 6, w: 1100 },
    4: 'Natural · Simple · Healing',
  },

  'brand-philosophy': {
    2: 'Living Naturally, Returning to Life',
    3: 'SIMPLE BEAUTY · THE HEALING POWER OF NATURE',
    4: 'Our name evokes the bank of a quiet stream — a setting that is beautiful yet unadorned, and the home our founder always imagined. Through design that quiets the mind, we hope to lead you back to the home you long for: one with simple beauty and the healing power of nature.',
    5: 'Return to life, and to the simple beauty of every day.',
  },

  'brand-story': {
    2: 'Return to the Beauty of Life',
    3: 'FROM CHENGDU TO MALAYSIA',
    6: 'Chengdu, China',
    10: 'Riccione Reka, Malaysia',
    13: 'Founded in Chengdu in 2011, SAIL looks to nature to bring design back to calm and beauty. In 2025, Riccione Reka brought SAIL to Malaysia as its exclusive distributor for Southeast Asia — within an integrated system of doors, walls and cabinetry, SAIL lets a beautiful life unfold in a quieter, more rhythmic way.',
  },

  'brand-collections': {
    0: 'SAIL COLLECTIONS',
    2: { text: 'Original Collections', w: 900 },
    3: 'Inspired by nature and real life — from wood grain and materials to the feel of a space, every collection is developed and designed in-house.',
    5: 'Skeleton Line',
    6: '',
    7: 'Classic meets modern, in lines of light and shadow',
    9: 'Empty Mountain',
    10: '',
    11: 'Open space and niches that let a room breathe',
    13: 'Weaving',
    14: '',
    15: 'The texture of fabric, bringing warmth to daily life',
    17: 'Misty Mountain',
    18: '',
    19: 'Light and pure, inspired by a spring home in the mist',
    21: 'Wabi-Sabi Eastern',
    22: '',
    23: 'Solid wood in its purest form, with a calm Eastern spirit',
  },

  'brand-awards': {
    1: 'AWARDS',
    3: 'International Design Awards',
    6: 'MUSE Design Awards (USA) · Gold',
    7: 'SAIL 4.0 Series · chosen from 38,000 entries in 100+ countries',
    10: { text: 'HCA Home Design Awards · Product of the Year', w: 760 },
    11: 'Natural Line Series · Guangzhou Design Week',
    14: { text: 'HCA Home Design Awards · Supreme Product Award', w: 760 },
    15: 'Skeleton Line · Leisure Courtyard · Top 3 finalist',
    19: { text: 'HCA Home Design Awards · Product of the Year', w: 760 },
    20: 'Skeleton Line · Mountain Dwelling',
  },

  'brand-supply': {
    2: 'Global Supply Chain',
    3: 'We work directly with leading international brands across a global supply chain, safeguarding genuine quality right from the source.',
    5: { text: 'Boards', w: 260 },
    6: { text: 'Kastamonu · Egger · Skin', x: 400, w: 327, align: 'r' },
    8: { text: 'Hardware', w: 260 },
    9: { text: 'Blum · Italiana Ferramenta', x: 400, w: 327, align: 'r' },
    12: { text: 'Stone & Equipment', w: 300 },
    13: { text: 'Laminam · HOMAG · REHAU', x: 400, w: 327, align: 'r' },
  },

  'company-divider': {
    3: { text: 'Company · Riccione', spacing: 6, w: 1200 },
    4: { text: 'Malaysia · China · Solid Wood & Custom-Made', w: 1100 },
  },

  'company-about': {
    0: 'ABOUT RICCIONE',
    2: 'Inspired by an Italian Seaside Town',
    4: 'Riccione takes its name from a seaside town in Italy — its unhurried pace, warm atmosphere and closeness to nature. Building on more than a decade of craftsmanship, Riccione makes furniture that returns to the essence of living, centred on natural materials, honest design and timeless aesthetics.',
    6: { text: 'Whole-House Customization · Riccione Reka', w: 820 },
    7: { text: 'Integrated design for doors, walls and cabinetry', x: 96, y: 797, w: 820 },
    10: { text: 'Solid-Wood Furniture', w: 820 },
    11: { text: '100% solid wood · modular system', x: 96, y: 889, w: 820 },
  },

  'company-history': {
    2: 'Our Journey',
    3: 'From Malaysia to both the Malaysian and Chinese markets — a decade of craftsmanship.',
    5: '18 brand stores in China · nearly 1,000 dealers',
    8: { text: 'Brand Founded', w: 440 },
    9: 'Riccione Furniture is founded in Malaysia, beginning its journey as a solid-wood furniture brand.',
    12: { text: 'Going Global', w: 440 },
    13: 'An 11,000 sq ft international project showroom opens in Kuala Lumpur; invited to the CIFF Shanghai Design Pavilion.',
    16: { text: 'Entering China', w: 440 },
    17: 'A 21,000 sq ft flagship showroom opens in Foshan; wins Best Booth Design at Archidex.',
    20: { text: 'Project Partnerships', w: 440 },
    21: 'Expands into projects for homes, hotels and commercial spaces.',
    24: { text: 'Expanding Reach', w: 440 },
    25: 'More than 600 containers exported to China, building a network of nearly 1,000 dealers.',
    28: { text: 'Strategic Upgrade', w: 440 },
    29: 'Moves to brand stores in China, growing to 18 stores; launches integrated online and offline retail in Malaysia.',
    33: { text: 'International Debut', w: 440 },
    34: 'Debuts at CIFF Guangzhou, with products sold to Japan and Europe; wins Best Furniture Design in Foshan.',
    38: { text: 'Bespoke Interiors', w: 440 },
    39: 'Riccione Reka whole-house customization is founded and becomes SAIL’s exclusive distributor for Southeast Asia.',
  },

  'company-showrooms': {
    2: 'Showrooms & Reach',
    3: 'Export, projects and retail side by side — serving Malaysia, China, Hong Kong, the US, Canada, Japan, India, Thailand and Vietnam.',
    7: 'Four-Storey Showroom',
    8: 'Office and showroom with a team of 15',
    11: 'Office & Showroom',
    12: 'A professional team of 30',
    15: 'Warehouse Centre',
    16: 'Our warehouse in Setia Alam, Malaysia',
  },

  'company-certified': {
    2: 'Quality You Can Trace',
    4: 'Independently certified, with quality you can trace. Our choice of materials, our care for proportion and structure, and our attention to detail and texture are all on record.',
  },

  'design-divider': {
    3: { text: 'Design Proposal', spacing: 6, w: 1200 },
    4: '{{clientLine}} · {{floorsLineEn}}',
  },

  'service-divider': {
    3: { text: 'Service · Delivery', spacing: 6, w: 1100 },
    4: 'Team · Process · Lead Time · Aftercare',
  },

  'service-process': {
    0: 'PROCESS',
    2: { text: 'Our Service Process', w: 900 },
    5: 'Design & Site Handover',
    6: 'Brief the main contractor and re-check site conditions',
    9: 'Installation Briefing',
    10: 'Sort parts · clean the install areas · re-check dimensions',
    13: 'Installation',
    14: 'Group chat intro · daily progress reports · completion report',
    17: 'Dedicated Inspection',
    18: 'Item-by-item checks with a signed inspection receipt',
    21: 'Handover',
    22: 'Ready to use, and into the maintenance period',
  },

  'service-cycle': {
    0: 'ORDER CYCLE',
    2: 'Lead Times',
    5: { text: 'days', w: 140 },
    6: 'Paint-Free Series',
    7: '',
    10: { text: 'days', w: 140 },
    11: 'Solid Wood Series',
    12: '',
  },

  'service-aftersales': {
    0: 'AFTER-SALES',
    2: 'After-Sales Care',
    6: { text: 'Pre-Move-In Adjustment', w: 700 },
    7: { text: 'An on-site tune-up before you move in', w: 700 },
    10: { text: 'Annual Maintenance Visit', w: 700 },
    11: { text: 'One scheduled service visit every year', w: 700 },
    14: { text: 'Hardware Warranty', w: 300 },
    15: { text: '__ years', x: 420, w: 300, fromZh: years },
    16: '',
    20: { text: 'Panel Warranty', w: 300 },
    21: { text: '__ years', x: 420, w: 300, fromZh: years },
    22: '',
  },

  closing: {
    3: 'Return to the Beauty of Life',
    4: '',
  },
};

export const BI = {
  contents: {
    6: { en: 'LIVING NATURALLY, RETURNING TO LIFE', as: 'caps', w: 960 },
    10: { en: 'A DECADE OF CRAFT, IN MALAYSIA & CHINA', as: 'caps', w: 960 },
    14: { en: '{{floorsLineEnUpper}}', as: 'caps', w: 960 },
    18: { en: 'TEAM · PROCESS · LEAD TIME · AFTERCARE', as: 'caps', w: 960 },
  },

  'brand-divider': { 4: { en: 'NATURAL · SIMPLE · HEALING', as: 'caps' } },

  'brand-philosophy': {
    4: { en: EN['brand-philosophy'][4], as: 'body' },
    5: { en: EN['brand-philosophy'][5], as: 'body' },
  },

  'brand-story': {
    13: { en: EN['brand-story'][13], as: 'body', y: 560 },
  },

  'brand-collections': {
    3: { en: EN['brand-collections'][3], as: 'body', y: 96 },
    // 文字区整体上移一点（色板图矮 30），给每个系列的英文说明腾地方
    4: { h: 370 },
    8: { h: 370 },
    12: { h: 370 },
    16: { h: 370 },
    20: { h: 370 },
    5: { y: 756 },
    9: { y: 756 },
    13: { y: 756 },
    17: { y: 756 },
    21: { y: 756 },
    6: { y: 808 },
    10: { y: 808 },
    14: { y: 808 },
    18: { y: 808 },
    22: { y: 808 },
    7: { en: EN['brand-collections'][7], as: 'small', y: 850 },
    11: { en: EN['brand-collections'][11], as: 'small', y: 850 },
    15: { en: EN['brand-collections'][15], as: 'small', y: 850 },
    19: { en: EN['brand-collections'][19], as: 'small', y: 850 },
    23: { en: EN['brand-collections'][23], as: 'small', y: 850 },
  },

  'brand-awards': {
    6: { en: 'MUSE Design Awards (USA) · Gold', as: 'small' },
    10: { en: 'HCA Home Design Awards · Product of the Year', as: 'small', w: 760 },
    14: { en: 'HCA Home Design Awards · Supreme Product Award', as: 'small', w: 760 },
    19: { en: 'HCA Home Design Awards · Product of the Year', as: 'small', w: 760 },
    16: { hide: true },
  },

  'brand-supply': {
    3: { en: EN['brand-supply'][3], as: 'body' },
    5: { en: 'BOARDS', as: 'caps', w: 260 },
    8: { en: 'HARDWARE', as: 'caps', w: 260 },
    12: { en: 'STONE & EQUIPMENT', as: 'caps', w: 300 },
  },

  'company-divider': { 4: { en: 'MALAYSIA · CHINA · SOLID WOOD & CUSTOM-MADE', as: 'caps', w: 1100 } },

  'company-about': {
    4: { en: EN['company-about'][4], as: 'body' },
    7: { en: 'Integrated doors, walls & cabinetry', as: 'small', x: 96, y: 800, w: 820 },
    11: { en: '100% solid wood · modular system', as: 'small', x: 96, y: 892, w: 820 },
    6: { w: 820 },
    10: { w: 820 },
  },

  'company-history': {
    3: { en: EN['company-history'][3], as: 'body' },
    5: { en: EN['company-history'][5], as: 'small' },
    8: { en: 'BRAND FOUNDED', as: 'caps', w: 440 },
    9: { en: EN['company-history'][9], as: 'small' },
    12: { en: 'GOING GLOBAL', as: 'caps', w: 440 },
    13: { en: EN['company-history'][13], as: 'small' },
    16: { en: 'ENTERING CHINA', as: 'caps', w: 440 },
    17: { en: EN['company-history'][17], as: 'small' },
    20: { en: 'PROJECT PARTNERSHIPS', as: 'caps', w: 440 },
    21: { en: EN['company-history'][21], as: 'small' },
    24: { en: 'EXPANDING REACH', as: 'caps', w: 440 },
    25: { en: EN['company-history'][25], as: 'small' },
    28: { en: 'STRATEGIC UPGRADE', as: 'caps', w: 440 },
    29: { en: EN['company-history'][29], as: 'small' },
    33: { en: 'INTERNATIONAL DEBUT', as: 'caps', w: 440 },
    34: { en: EN['company-history'][34], as: 'small' },
    38: { en: 'BESPOKE INTERIORS', as: 'caps', w: 440 },
    39: { en: EN['company-history'][39], as: 'small' },
  },

  'company-showrooms': {
    3: { en: EN['company-showrooms'][3], as: 'body' },
    7: { en: 'Four-Storey Showroom', as: 'small' },
    8: { en: EN['company-showrooms'][8], as: 'small' },
    11: { en: 'Office & Showroom', as: 'small' },
    12: { en: EN['company-showrooms'][12], as: 'small' },
    15: { en: 'Warehouse Centre', as: 'small' },
    16: { en: EN['company-showrooms'][16], as: 'small' },
  },

  'company-certified': {
    4: { en: EN['company-certified'][4], as: 'body' },
  },

  'design-divider': { 4: { en: 'DESIGN PROPOSAL · {{floorsLineEnUpper}}', as: 'caps', w: 1100 } },

  'service-divider': { 4: { en: 'TEAM · PROCESS · LEAD TIME · AFTERCARE', as: 'caps', w: 1100 } },

  'service-process': {
    5: { en: 'DESIGN & SITE HANDOVER', as: 'caps', w: 340 },
    6: { en: EN['service-process'][6], as: 'small' },
    9: { en: 'INSTALLATION BRIEFING', as: 'caps', w: 340 },
    10: { en: EN['service-process'][10], as: 'small' },
    13: { en: 'INSTALLATION', as: 'caps', w: 340 },
    14: { en: EN['service-process'][14], as: 'small' },
    17: { en: 'DEDICATED INSPECTION', as: 'caps', w: 340 },
    18: { en: EN['service-process'][18], as: 'small' },
    21: { en: 'HANDOVER', as: 'caps', w: 340 },
    22: { en: EN['service-process'][22], as: 'small' },
  },

  'service-cycle': {
    5: { en: 'DAYS', as: 'caps', w: 160 },
    10: { en: 'DAYS', as: 'caps', w: 160 },
  },
};

/** 同一栏从上到下（[a, b] = 同一行并排）；bottom = 这一栏最低能到哪（页脚线 984 上方） */
export const FLOWS = {
  'brand-philosophy': [{ items: [2, 3, 4, 5], bottom: 960 }],
  'brand-story': [
    { items: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11], bottom: 962, minGap: 6 },
    { items: [13], bottom: 960 },
  ],
  'brand-collections': [
    { items: [3], bottom: 352 },
    { items: [5, 6, 7], bottom: 972, minGap: 4 },
    { items: [9, 10, 11], bottom: 972, minGap: 4 },
    { items: [13, 14, 15], bottom: 972, minGap: 4 },
    { items: [17, 18, 19], bottom: 972, minGap: 4 },
    { items: [21, 22, 23], bottom: 972, minGap: 4 },
  ],
  'brand-awards': [
    { items: [3, 4, [5, 6], 7, 8, [9, 10], 11, 12, [13, 14], 15, 17, [18, 19], 20, 16], bottom: 972, minGap: 6 },
  ],
  'brand-supply': [{ items: [2, 3, 4, [5, 6], 7, [8, 9], 11, [12, 13], 10], bottom: 960, minGap: 10 }],
  'company-about': [{ items: [2, 3, 4, 5, [6, 7], 9, [10, 11], 8], bottom: 966, minGap: 10 }],
  'company-history': [
    { items: [2, 3, 4, 5], bottom: 960, minGap: 12 },
    { items: [6, [7, 8], 9, 14, [15, 16], 17, 22, [23, 24], 25, 31, [32, 33], 34, 30], bottom: 966, minGap: 8 },
    { items: [10, [11, 12], 13, 18, [19, 20], 21, 26, [27, 28], 29, 36, [37, 38], 39, 35], bottom: 966, minGap: 8 },
  ],
  'company-showrooms': [
    { items: [2, 3], bottom: 610 },
    { items: [6, 7, 8], bottom: 960, minGap: 6 },
    { items: [10, 11, 12], bottom: 960, minGap: 6 },
    { items: [14, 15, 16], bottom: 960, minGap: 6 },
  ],
  'company-certified': [{ items: [2, 3, 4], bottom: 960 }],
  'service-process': [
    { items: [5, 6], bottom: 960, minGap: 8 },
    { items: [9, 10], bottom: 960, minGap: 8 },
    { items: [13, 14], bottom: 960, minGap: 8 },
    { items: [17, 18], bottom: 960, minGap: 8 },
    { items: [21, 22], bottom: 960, minGap: 8 },
  ],
  'service-aftersales': [
    { items: [2, 3, 4, [5, 6], 7, 8, [9, 10], 11, 12, [13, 14, 15], 16, 18, [19, 20, 21], 22, 17], bottom: 966, minGap: 8 },
  ],
  closing: [{ items: [3, 4], bottom: 740 }],
  'design-divider': [{ items: [3, 4], bottom: 960 }],
  'brand-divider': [{ items: [3, 4], bottom: 960 }],
  'company-divider': [{ items: [3, 4], bottom: 960 }],
  'service-divider': [{ items: [3, 4], bottom: 960 }],
  contents: [
    { items: [5, 6, 7], bottom: 960, minGap: 4 },
    { items: [9, 10, 11], bottom: 960, minGap: 4 },
    { items: [13, 14, 15], bottom: 960, minGap: 4 },
    { items: [17, 18], bottom: 960, minGap: 4 },
  ],
};
