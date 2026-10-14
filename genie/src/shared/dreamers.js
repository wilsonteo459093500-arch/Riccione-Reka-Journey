// 内容色（材质 / 测验刺激 / 光照），不随 VI 换色
// 16 张「梦想家牌」—— 像 MBTI 一样由四条轴组成，像塔罗一样编号 I–XVI。
// 每张牌：客人看的（名字、一句话、描述、配色）＋ 设计师看的（风格、色温、柜门、英文关键词）
// ＋ 3D 工作室直接套用的整套材质（slot → 材质 id）。
//
// 设计原则：每一张牌都是「被看见」的感觉，没有坏牌（巴纳姆效应用在好的地方：让客人愿意继续说）。

export const AXES = [
  { id: 'temp', a: { k: 'W', zh: '暖', en: 'Warm' }, b: { k: 'C', zh: '清', en: 'Cool' }, zh: '温度', en: 'Temperature' },
  { id: 'density', a: { k: 'M', zh: '简', en: 'Minimal' }, b: { k: 'L', zh: '丰', en: 'Layered' }, zh: '密度', en: 'Density' },
  { id: 'texture', a: { k: 'N', zh: '朴', en: 'Natural' }, b: { k: 'R', zh: '雅', en: 'Refined' }, zh: '质感', en: 'Texture' },
  { id: 'storage', a: { k: 'H', zh: '藏', en: 'Hidden' }, b: { k: 'D', zh: '展', en: 'Display' }, zh: '收纳', en: 'Storage' },
];

/** 不进类型代码、但设计师很需要的三条「暗轴」 */
export const HIDDEN_AXES = [
  { id: 'light', a: { zh: '明亮', en: 'Bright' }, b: { zh: '沉稳', en: 'Moody' }, zh: '明度' },
  { id: 'curve', a: { zh: '圆润', en: 'Curved' }, b: { zh: '利落', en: 'Linear' }, zh: '线条' },
  { id: 'social', a: { zh: '相聚', en: 'Social' }, b: { zh: '独处', en: 'Retreat' }, zh: '社交' },
];

const T = (code, num, zh, en, tagline, desc, emblem, palette, mats, mood, design) => ({
  code,
  num,
  zh,
  en,
  tagline,
  desc,
  emblem,
  palette,
  materials: mats,
  mood,
  design,
});

// mats 顺序：floor walls feature cabinetry countertop tile upholstery bedding rugs woodwork accents curtains metal
const M = (floor, walls, feature, cabinetry, countertop, tile, upholstery, bedding, rugs, woodwork, accents, curtains, metal) => ({
  floor,
  walls,
  feature,
  cabinetry,
  countertop,
  tile,
  upholstery,
  bedding,
  rugs,
  woodwork,
  accents,
  curtains,
  metal,
});

export const DREAMERS = [
  T('WMNH', 'I', '暖木禅居', 'The Zen Nester', '留白，是你给生活的呼吸。',
    '你喜欢家里安安静静、暖暖的。原木、亚麻、一盏低低的灯就够了 —— 东西都收进柜子里，眼睛看到的只有光和木头。',
    'cup', ['#EEE4D3', '#C8A272', '#D8CBB4', '#8C9884', '#5E4632'],
    M('light-oak', 'warm-white', 'sand-limewash', 'white-oak', 'travertine', 'zellige-white', 'linen', 'linen', 'oat-knit', 'smoked-oak', 'sage-linen', 'linen', 'matte-black'),
    'cozy',
    { style: 'Japandi · 暖调日式', kelvin: '2700–3000K', doors: '原木饰面平板门，隐藏拉手 / 反弹器', ratio: [85, 15], en: 'Japandi, warm natural oak, limewash walls, linen, low furniture, handleless flat-panel oak cabinetry, 3000K warm light' }),
  T('WMND', 'II', '静物策展人', 'The Quiet Curator', '少，但每一件都有故事。',
    '家里不需要很多东西，但你挑的每一件都值得被看见：一只手作陶罐、一本旧书、一幅小画。开放层板，是你的小展台。',
    'vase', ['#EEE4D3', '#A66E3D', '#D6C1A0', '#B77250', '#3F2618'],
    M('light-oak', 'oat', 'sand-limewash', 'smoked-oak', 'travertine', 'terracotta-tile', 'linen', 'cotton-white', 'oat-knit', 'teak', 'rust-wool', 'linen', 'brass'),
    'cozy',
    { style: 'Wabi-sabi · 侘寂策展', kelvin: '2700K + 层板灯带', doors: '闭合柜为主，局部开放层板（展示 30–40%）', ratio: [65, 35], en: 'warm minimalism, wabi-sabi, curated open shelving with integrated LED, travertine, teak, terracotta accents' }),
  T('WMRH', 'III', '柔光雅士', 'The Soft Luxe', '安静的高级感。',
    '你喜欢「看不出来很贵，但就是很舒服」：奶油色、洞石、细细的黄铜线条。一切收得干干净净，只留下质感。',
    'pearl', ['#EAE0CE', '#D6C1A0', '#B8914A', '#E2C4B8', '#6C4B2F'],
    M('travertine', 'warm-white', 'sand-limewash', 'cream-lacquer', 'calacatta', 'cream-tile', 'boucle', 'linen', 'oat-knit', 'walnut', 'blush-boucle', 'linen', 'brass'),
    'cozy',
    { style: 'Quiet luxury · 奶油轻奢', kelvin: '2700–3000K，灯带 + 洗墙', doors: '奶油烤漆平板门，隐藏拉手 / 细黄铜拉手', ratio: [85, 15], en: 'quiet luxury, cream lacquer cabinetry, travertine, calacatta marble, boucle, brushed brass details, 2700K cove lighting' }),
  T('WMRD', 'IV', '画廊主人', 'The Gallery Host', '家，是你的私人画廊。',
    '你有眼光，也愿意被看见。一盏打在艺术品上的光、一个玻璃展示柜、几件有雕塑感的家具 —— 客人一进门就知道，这是你的家。',
    'star', ['#EFE9DE', '#694330', '#C6912E', '#B8914A', '#1F1E20'],
    M('herringbone-oak', 'warm-white', 'walnut', 'walnut', 'calacatta', 'zellige-white', 'ochre-velvet', 'linen', 'oat-knit', 'walnut', 'cognac-leather', 'linen', 'brass'),
    'bright',
    { style: 'Mid-century gallery · 中古画廊', kelvin: '3000K + 重点射灯 15–24°', doors: '胡桃木饰面 + 玻璃展示柜（内置灯带）', ratio: [60, 40], en: 'mid-century modern, walnut, herringbone oak, ochre velvet, glass display cabinets with lighting, art spotlights' }),
  T('WLNH', 'V', '暖巢守护者', 'The Cosy Keeper', '热闹在心里，整洁在眼前。',
    '你的家要软、要暖、要有很多抱枕和毯子 —— 但杂物一定要藏好。一家人窝在一起的时候，眼前是舒服，不是凌乱。',
    'sun', ['#D6C0A0', '#866043', '#D8CBB4', '#B3552E', '#2B3A5E'],
    M('smoked-oak', 'sand-limewash', 'walnut', 'light-oak', 'travertine', 'zellige-white', 'navy-velvet', 'linen', 'oat-knit', 'walnut', 'rust-wool', 'linen', 'brass'),
    'cozy',
    { style: 'Warm layered · 温暖叠搭', kelvin: '2700K，落地灯 + 台灯 + 灯带三层', doors: '木饰面闭合柜，柜内细分区', ratio: [80, 20], en: 'cozy layered interior, sand limewash, smoked oak, navy velvet, rust wool, plenty of textiles, concealed storage' }),
  T('WLND', 'VI', '自在旅人', 'The Wanderer', '每个角落，都是旅行的纪念。',
    '藤编、绿植、陶土、旅行带回来的小东西 —— 你的家像一本旅行日记。开放层板和挂钩，让生活自然地摊开。',
    'leaf', ['#EEE4D3', '#C69C60', '#B77250', '#6D6A4A', '#8EA289'],
    M('light-oak', 'warm-white', 'terracotta', 'light-oak', 'terrazzo', 'terracotta-tile', 'linen', 'linen', 'rust-wool', 'teak', 'rattan', 'linen', 'brass'),
    'cozy',
    { style: 'Boho natural · 波西米亚自然', kelvin: '2700K，藤编吊灯', doors: '藤编柜门 + 开放层板 + 挂杆', ratio: [55, 45], en: 'bohemian natural, rattan cane cabinet doors, terracotta, teak, lots of plants, open shelving, woven textures' }),
  T('WLRH', 'VII', '丝绒古典家', 'The Velvet Classic', '浓郁，而从容。',
    '你喜欢有分量的美：深色木头、丝绒、大理石，层层叠叠却井然有序。像一间老派、但很舒服的酒店套房。',
    'crown', ['#B59A7E', '#694330', '#1E5345', '#C6912E', '#1F1E20'],
    M('herringbone-oak', 'latte', 'walnut', 'walnut', 'calacatta', 'zellige-sage', 'emerald-velvet', 'linen', 'rust-wool', 'cherry', 'ochre-velvet', 'linen', 'brass'),
    'moody',
    { style: 'Modern classic · 现代古典', kelvin: '2700K + 壁灯', doors: '胡桃木线条门 + 黄铜拉手', ratio: [80, 20], en: 'modern classic, walnut, herringbone floor, emerald velvet, brass hardware, layered warm lighting, wall sconces' }),
  T('WLRD', 'VIII', '故事收藏家', 'The Storyteller', '你的家，是一本翻不完的书。',
    '书、唱片、收藏、照片墙 —— 每一件都有来历。你需要一整面会说故事的墙，和一盏好好照着它们的灯。',
    'book', ['#D8CAB3', '#985436', '#29334A', '#C6912E', '#3F2618'],
    M('smoked-oak', 'oat', 'navy-paint', 'cherry', 'travertine', 'terracotta-tile', 'cognac-leather', 'linen', 'rust-wool', 'walnut', 'ochre-velvet', 'linen', 'bronze'),
    'cozy',
    { style: 'Library eclectic · 书房式叠搭', kelvin: '2700–3000K + 层板灯 + 阅读灯', doors: '大面积开放书墙，底部闭合柜', ratio: [45, 55], en: 'eclectic library, floor-to-ceiling bookshelves, cherry wood, cognac leather, navy feature wall, picture lights' }),
  T('CMNH', 'IX', '北欧清风', 'The Nordic Breeze', '清爽，是最好的治愈。',
    '白墙、白橡、大窗户，阳光洒满屋子。你喜欢简单、透气、好打理 —— 东西都收起来，只留下光。',
    'feather', ['#F0EEE9', '#D8C2A0', '#A8A6A1', '#9DAFBC', '#55585C'],
    M('white-oak', 'gallery-white', 'oat', 'white-lacquer', 'carrara', 'zellige-white', 'grey-wool', 'cotton-white', 'grey-wool', 'white-oak', 'sage-linen', 'cotton-white', 'matte-black'),
    'bright',
    { style: 'Scandinavian · 北欧', kelvin: '白天 4000K / 夜间 3000K（双色温）', doors: '白色 / 浅木平板门，隐藏拉手', ratio: [85, 15], en: 'scandinavian, white oak, white walls, light grey wool, airy and bright, handleless storage' }),
  T('CMND', 'X', '海岸梦想家', 'The Coastal Dreamer', '像海风一样轻。',
    '浅浅的蓝、亚麻、贝壳、陶瓷 —— 你喜欢家里有海边的松弛感。几件喜欢的小物放在开放层板上，像捡回来的贝壳。',
    'wave', ['#F0EEE9', '#D8C2A0', '#9DAFBC', '#E4D9C7', '#2B3A5E'],
    M('white-oak', 'gallery-white', 'dusty-blue', 'white-oak', 'terrazzo', 'zellige-white', 'linen', 'cotton-white', 'linen', 'white-oak', 'navy-velvet', 'linen', 'matte-black'),
    'bright',
    { style: 'Coastal minimal · 海岸风', kelvin: '3000–3500K', doors: '浅木柜 + 开放层板（展示约 30%）', ratio: [65, 35], en: 'coastal minimal, dusty blue, white oak, linen, terrazzo, light and airy, ceramic display shelves' }),
  T('CMRH', 'XI', '都会极简家', 'The Urban Minimalist', '一切刚刚好，什么都不多。',
    '干净的线条、灰白的色调、隐形的收纳。你的家像一台运转顺畅的机器 —— 回到家，就能把脑袋清空。',
    'key', ['#F0EEE9', '#B2A491', '#9D9992', '#3A3938', '#232323'],
    M('greige-oak', 'gallery-white', 'microcement', 'white-lacquer', 'sintered', 'grey-tile', 'grey-wool', 'cotton-white', 'charcoal-felt', 'greige-oak', 'charcoal-felt', 'cotton-white', 'matte-black'),
    'bright',
    { style: 'Urban minimal · 都会极简', kelvin: '3500–4000K，无主灯 + 嵌入筒灯', doors: '白色烤漆顶天立地柜，隐藏拉手', ratio: [92, 8], en: 'urban minimalism, handleless floor-to-ceiling white lacquer cabinetry, microcement, sintered stone, greige oak, trimless downlights' }),
  T('CMRD', 'XII', '现代建筑师', 'The Modern Architect', '线条，就是你的语言。',
    '你欣赏结构与比例：黑色金属框、玻璃柜、大理石的切面。少量但有雕塑感的物件，被好好地展示出来。',
    'prism', ['#F0EEE9', '#2F2723', '#E9E7E2', '#55585C', '#9DAFBC'],
    M('microcement', 'gallery-white', 'ebony-oak', 'black-matte', 'carrara', 'grey-tile', 'grey-wool', 'cotton-white', 'grey-wool', 'ebony-oak', 'black-leather', 'cotton-white', 'gunmetal'),
    'bright',
    { style: 'Modern architectural · 现代建筑感', kelvin: '4000K + 线性灯', doors: '黑框玻璃门展示柜 + 黑色哑光柜体', ratio: [65, 35], en: 'modern architectural, black metal frame glass display cabinets, microcement floor, carrara marble, ebonized oak, linear lighting' }),
  T('CLNH', 'XIII', '森林隐居者', 'The Forest Retreat', '把森林，搬回家。',
    '鼠尾草绿、苔藓、原木和石头 —— 你想要一个能深呼吸的家。层次很多却不乱，因为杂物都有地方去。',
    'tree', ['#A7B298', '#866043', '#D6C1A0', '#1E5345', '#6D6A4A'],
    M('smoked-oak', 'sage', 'smoked-oak', 'sage-lacquer', 'travertine', 'zellige-sage', 'linen', 'sage-linen', 'oat-knit', 'smoked-oak', 'ochre-velvet', 'linen', 'bronze'),
    'cozy',
    { style: 'Biophilic · 自然疗愈', kelvin: '2700–3000K', doors: '灰绿烤漆 + 木饰面，闭合式', ratio: [80, 20], en: 'biophilic, sage green lacquer cabinetry, smoked oak, travertine, linen, many plants, calm forest palette' }),
  T('CLND', 'XIV', '灵感工作室', 'The Creative Studio', '乱中有序，灵感满屋。',
    '你的家同时是工作室、画室和书房：洞洞板、开放书架、各种有趣的小物。你需要的是「看得见、拿得到」的收纳。',
    'spark', ['#ECEBE7', '#B2A491', '#9DAFBC', '#C6912E', '#3A3938'],
    M('terrazzo', 'gallery-white', 'dusty-blue', 'maple', 'terrazzo', 'zellige-white', 'grey-wool', 'cotton-white', 'charcoal-felt', 'maple', 'ochre-velvet', 'linen', 'matte-black'),
    'bright',
    { style: 'Creative eclectic · 创意工作室', kelvin: '工作 4000K + 休闲 3000K', doors: '开放层板 + 洞洞板 + 少量闭合柜', ratio: [45, 55], en: 'creative studio, maple open shelving, pegboard, terrazzo, colourful accents, good task lighting' }),
  T('CLRH', 'XV', '午夜爵士', 'The Midnight Jazz', '低调的浓烈。',
    '深蓝、胡桃木、黑金花大理石，一盏暖黄的灯。你的家安静、深邃、很有态度 —— 所有东西都藏在漂亮的柜门后面。',
    'moon', ['#29334A', '#694330', '#1F1E20', '#B8914A', '#3D3D40'],
    M('walnut', 'navy-paint', 'walnut', 'black-matte', 'nero', 'nero', 'cognac-leather', 'charcoal-felt', 'rust-wool', 'walnut', 'ochre-velvet', 'charcoal-felt', 'brass'),
    'moody',
    { style: 'Moody luxe · 深色奢华', kelvin: '2700K 低照度 + 重点照明', doors: '黑色哑光 / 胡桃木，隐藏拉手', ratio: [85, 15], en: 'moody luxe, midnight blue walls, walnut, nero marquina marble, cognac leather, brass, low warm accent lighting' }),
  T('CLRD', 'XVI', '都会收藏家', "The Collector's Loft", '每一件收藏，都值得一盏灯。',
    '黑框玻璃柜、皮革、金属与石材 —— 你的收藏（手表、包包、模型、酒）需要被好好陈列，也需要被好好保护。',
    'gem', ['#3A3938', '#2F2723', '#8C4D2A', '#55585C', '#E9E7E2'],
    M('microcement', 'charcoal', 'ebony-oak', 'black-matte', 'sintered', 'grey-tile', 'cognac-leather', 'grey-wool', 'grey-wool', 'smoked-oak', 'rust-wool', 'charcoal-felt', 'gunmetal'),
    'moody',
    { style: 'Industrial luxe · 工业收藏', kelvin: '3000K + 柜内灯带 + 射灯', doors: '黑框玻璃展示柜（带锁、防尘）', ratio: [50, 50], en: 'industrial luxe loft, black framed glass display cabinets with LED, microcement, cognac leather, gunmetal, collector display wall' }),
];

export const DREAMER_BY_CODE = Object.fromEntries(DREAMERS.map((d) => [d.code, d]));

/** axes: { temp, density, texture, storage }，各 0–100 = 偏向 a 侧的百分比 */
export function codeOf(axes) {
  return AXES.map((ax) => ((axes?.[ax.id] ?? 50) >= 50 ? ax.a.k : ax.b.k)).join('');
}

export function dreamerOf(axes) {
  return DREAMER_BY_CODE[codeOf(axes)] || DREAMERS[0];
}
