// 内容色（材质 / 测验刺激 / 光照），不随 VI 换色
// 许愿之旅的流程：五张牌（五关）＋ 召唤 ＋ 揭晓。
//
// 快思慢想的分工：
//   第一张牌「直觉」 —— 系统 1：二选一、看图、3 秒内选。问「哪个让你想躺下」，不问「你喜欢什么风格」
//                      （替代效应：难题换成易题，我们替客人做这一步）。反应时间也记下来 —— 秒选 = 很确定。
//   第二张牌「生活」 —— 用生活场景提问（框架效应），而不是设计术语。
//   第三张牌「宝藏」 —— 系统 2：慢下来数东西。每个数字马上变成柜子尺寸（即时反馈，降低思考成本）。
//   第四张牌「三个愿望」—— 只能选 3 个（对抗聚焦错觉：不取舍时，每样都"很重要"）。
//   第五张牌「禁忌」 —— 只问不要什么（损失厌恶：人对讨厌的东西比喜欢的更确定）。
//
// effects：正数偏向 a 侧（W 暖 / M 简 / N 朴 / H 藏；暗轴 light 明亮 / curve 圆润 / social 相聚）。

// hint = 章节牌上的那一句，也是潘吉翻牌时说的话的字幕（voice-lines.js 的 ch.*）：她用第一人称说
export const CHAPTERS = [
  { id: 'intuition', num: 'I', zh: '直觉之牌', en: 'THE INTUITION', hint: '别想，3 秒内跟着第一感觉选。', mode: 'fast' },
  { id: 'life', num: 'II', zh: '生活之牌', en: 'THE LIFE', hint: '想象一个普通的星期六。', mode: 'fast' },
  { id: 'treasure', num: 'III', zh: '宝藏之牌', en: 'THE TREASURE', hint: '现在请慢下来 —— 数字越准，柜子越合身。', mode: 'slow' },
  { id: 'wishes', num: 'IV', zh: '愿望之牌', en: 'THE THREE WISHES', hint: '我只能实现三个愿望哦。', mode: 'slow' },
  { id: 'nogo', num: 'V', zh: '雷区之牌', en: 'THE DEAL-BREAKERS', hint: '最后，帮我扫个雷吧。', mode: 'fast' },
];

// ───────────────────────── I · 直觉（二选一） ─────────────────────────
// visual：{ kind:'room', ...Vignette 参数 } | { kind:'swatches', ids:[…] } | { kind:'palette', colors:[…] }

const WARM_ROOM = { wall: '#E6D3B5', floor: '#C29A6B', sofa: '#D9CBB4', accent: '#B3552E', light: 'evening', plant: true };
const COOL_ROOM = { wall: '#EEF0EF', floor: '#D8D3CB', sofa: '#A9ADB0', accent: '#5F7A8C', light: 'day', plant: true };

export const PAIRS = [
  {
    id: 'room',
    q: '哪一个房间，让你想马上躺下？',
    a: { label: '暖暖的傍晚', visual: { kind: 'room', ...WARM_ROOM } },
    b: { label: '清爽的早晨', visual: { kind: 'room', ...COOL_ROOM } },
    fx: { a: { temp: 2, light: -0.5 }, b: { temp: -2, light: 1 } },
  },
  {
    id: 'wall',
    q: '哪一面墙，更像你？',
    a: { label: '一幅画就够了', visual: { kind: 'room', ...WARM_ROOM, light: 'day', wall: '#EFE8DC', density: 'minimal', plant: false } },
    b: { label: '挂满了才有味道', visual: { kind: 'room', ...WARM_ROOM, light: 'day', wall: '#EFE8DC', density: 'layered' } },
    fx: { a: { density: 2 }, b: { density: -2 } },
  },
  {
    id: 'touch',
    q: '闭上眼睛摸一摸 —— 你更想摸到？',
    a: { label: '粗粗的、有温度', visual: { kind: 'swatches', ids: ['linen', 'light-oak', 'rattan'] } },
    b: { label: '滑滑的、凉凉的', visual: { kind: 'swatches', ids: ['carrara', 'brass', 'cream-lacquer'] } },
    fx: { a: { texture: 2, temp: 0.5 }, b: { texture: -2, temp: -0.5 } },
  },
  {
    id: 'guest',
    q: '朋友来家里，你希望他们看到？',
    a: { label: '干干净净，什么都看不见', visual: { kind: 'room', ...COOL_ROOM, wall: '#EAE4DA', light: 'day', storage: 'hidden', plant: false } },
    b: { label: '我的收藏会说话', visual: { kind: 'room', ...COOL_ROOM, wall: '#EAE4DA', light: 'day', storage: 'open', plant: false } },
    fx: { a: { storage: 2.2 }, b: { storage: -2.2 } },
  },
  {
    id: 'palette',
    q: '选一个色盘',
    a: { label: '大地与阳光', visual: { kind: 'palette', colors: ['#EFE4D2', '#D6C0A0', '#B77250', '#6D6A4A', '#694330'] } },
    b: { label: '海风与石头', visual: { kind: 'palette', colors: ['#F0EEE9', '#B9BCBC', '#9DAFBC', '#2B3A5E', '#262626'] } },
    fx: { a: { temp: 1.6 }, b: { temp: -1.6 } },
  },
  {
    id: 'sofa',
    q: '哪一张沙发，你想陷进去？',
    a: { label: '圆圆的羊羔绒', visual: { kind: 'room', ...WARM_ROOM, light: 'day', sofa: '#EEE8DD', sofaShape: 'curvy', plant: false } },
    b: { label: '利落的皮沙发', visual: { kind: 'room', ...WARM_ROOM, light: 'day', sofa: '#8C4D2A', sofaShape: 'linear', plant: false } },
    fx: { a: { curve: 2, texture: 0.6 }, b: { curve: -2, texture: -0.6 } },
  },
  {
    id: 'night',
    q: '晚上 10 点，客厅的灯 ——',
    a: { label: '亮亮的，什么都看得清', visual: { kind: 'room', ...COOL_ROOM, light: 'bright-night' } },
    b: { label: '几盏小灯，暗暗的', visual: { kind: 'room', ...WARM_ROOM, light: 'lamp-night' } },
    fx: { a: { light: 2, temp: -0.5 }, b: { light: -2, temp: 0.5 } },
  },
  {
    id: 'floor',
    q: '光着脚，你想踩在 ——',
    a: { label: '温润的木地板', visual: { kind: 'swatches', ids: ['light-oak', 'smoked-oak', 'herringbone-oak'] } },
    b: { label: '冰凉的石材', visual: { kind: 'swatches', ids: ['travertine', 'carrara', 'microcement'] } },
    fx: { a: { texture: 1.4, temp: 1 }, b: { texture: -1.4, temp: -1 } },
  },
  {
    id: 'kitchen',
    q: '你的厨房台面 ——',
    a: { label: '一眼望去，什么都没有', visual: { kind: 'kitchen', open: false } },
    b: { label: '瓶瓶罐罐都摆出来', visual: { kind: 'kitchen', open: true } },
    fx: { a: { storage: 1.6, density: 1 }, b: { storage: -1.6, density: -1 } },
  },
  {
    id: 'table',
    q: '选一张餐桌',
    a: { label: '原木大板，有疤也好看', visual: { kind: 'swatches', ids: ['teak', 'walnut', 'linen'] } },
    b: { label: '大理石圆桌，干净利落', visual: { kind: 'swatches', ids: ['calacatta', 'nero', 'steel'] } },
    fx: { a: { texture: 2 }, b: { texture: -2, curve: 0.4 } },
  },
  {
    id: 'shelf',
    q: '书架上的东西 ——',
    a: { label: '整整齐齐，三件就好', visual: { kind: 'shelf', full: false } },
    b: { label: '满满当当，每格都有故事', visual: { kind: 'shelf', full: true } },
    fx: { a: { density: 2, storage: 0.5 }, b: { density: -2, storage: -0.5 } },
  },
  {
    id: 'weekend',
    q: '理想的星期六晚上 ——',
    a: { label: '一屋子朋友打边炉', visual: { kind: 'scene', emoji: '🍲', bg: '#F2C9A0' } },
    b: { label: '一个人，一本书，一杯茶', visual: { kind: 'scene', emoji: '📖', bg: '#C9D3C4' } },
    fx: { a: { social: 2, density: -0.4 }, b: { social: -2 } },
  },
];

// ───────────────────────── II · 生活（场景单选 / 多选） ─────────────────────────

export const LIFE = [
  {
    id: 'saturday',
    q: '星期六早上 10 点，你最可能在 ——',
    options: [
      { v: 'sofa', icon: '🛋️', label: '沙发上追剧' },
      { v: 'kitchen', icon: '🍳', label: '厨房做早午餐' },
      { v: 'window', icon: '📖', label: '窗边看书' },
      { v: 'workout', icon: '🧘', label: '铺开垫子做运动' },
      { v: 'bed', icon: '🛏️', label: '还赖在床上' },
    ],
    fx: { sofa: { social: 0.5 }, kitchen: { social: 0.8 }, window: { social: -0.8, light: 0.6 }, workout: { density: 0.8 }, bed: { light: -0.4 } },
  },
  {
    id: 'home',
    q: '推开家门，你做的第一件事 ——',
    options: [
      { v: 'drop', icon: '👟', label: '踢掉鞋子，包随手一放' },
      { v: 'tidy', icon: '🧺', label: '马上把东西归位' },
      { v: 'flop', icon: '😮‍💨', label: '直接瘫进沙发' },
      { v: 'fridge', icon: '🧃', label: '先去冰箱找吃的' },
    ],
    fx: { drop: { storage: 0.6 }, tidy: { density: 0.6 } },
  },
  {
    id: 'cook',
    q: '家里的厨房，更像 ——',
    options: [
      { v: 'heavy', icon: '🔥', label: '爆炒战场', sub: '天天大火开炒' },
      { v: 'light', icon: '🥗', label: '轻食实验室', sub: '蒸煮、沙拉为主' },
      { v: 'coffee', icon: '☕', label: '咖啡吧台', sub: '做杯咖啡就好' },
      { v: 'rare', icon: '🛵', label: '外卖中转站', sub: '几乎不开火' },
    ],
  },
  {
    id: 'bell',
    q: '门铃突然响了！你最想先藏起来的是 ——',
    whisper: '放心，只有你和你的设计师会看到 🤫',
    options: [
      { v: 'shoes', icon: '👞', label: '玄关的一堆鞋' },
      { v: 'table', icon: '🗞️', label: '餐桌上的杂物' },
      { v: 'clothes', icon: '👕', label: '沙发上的衣服' },
      { v: 'counter', icon: '🫙', label: '厨房台面的瓶瓶罐罐' },
      { v: 'toys', icon: '🧸', label: '孩子的玩具' },
      { v: 'nothing', icon: '😎', label: '没什么好藏的' },
    ],
    fx: { nothing: { density: 0.4 } },
  },
  {
    id: 'who',
    q: '这个家里，还会有谁？',
    sub: '可以多选',
    multi: true,
    options: [
      { v: 'baby', icon: '👶', label: '小宝宝' },
      { v: 'kids', icon: '🧒', label: '小孩' },
      { v: 'teen', icon: '🧑‍🎓', label: '青少年' },
      { v: 'elder', icon: '👵', label: '长辈' },
      { v: 'dog', icon: '🐶', label: '狗狗' },
      { v: 'cat', icon: '🐱', label: '猫咪' },
      { v: 'helper', icon: '🤝', label: '帮佣' },
      { v: 'guests', icon: '🧳', label: '常有客人留宿' },
      { v: 'wfh', icon: '💼', label: '在家办公' },
      { v: 'altar', icon: '🙏', label: '需要神台 / 佛台 / 祖先牌位' },
      { v: 'fengshui', icon: '🧭', label: '有风水师 / 有要遵守的方位' },
    ],
  },
];

// ───────────────────────── III · 宝藏（慢想：数量 → 柜子尺寸） ─────────────────────────

export const APPLIANCES = [
  { v: 'ricecooker', icon: '🍚', label: '电饭锅', w: 300 },
  { v: 'airfryer', icon: '🍟', label: '气炸锅', w: 350 },
  { v: 'coffee', icon: '☕', label: '咖啡机', w: 350 },
  { v: 'kettle', icon: '🫖', label: '热水壶 / 饮水机', w: 250 },
  { v: 'blender', icon: '🥤', label: '破壁机 / 搅拌机', w: 250 },
  { v: 'microwave', icon: '📦', label: '微波炉', w: 500, tall: true },
  { v: 'oven', icon: '🔥', label: '烤箱', w: 600, tall: true },
  { v: 'steamoven', icon: '♨️', label: '蒸烤箱', w: 600, tall: true },
  { v: 'dishwasher', icon: '🍽️', label: '洗碗机', w: 600, under: true },
  { v: 'bread', icon: '🍞', label: '面包机', w: 300 },
  { v: 'slowcooker', icon: '🍲', label: '慢炖锅 / 电火锅', w: 300 },
  { v: 'purifier', icon: '💧', label: '净水器', w: 0, under: true },
];

export const BULKY = [
  { v: 'luggage', icon: '🧳', label: '行李箱' },
  { v: 'vacuum', icon: '🧹', label: '吸尘器 / 拖把' },
  { v: 'stroller', icon: '🚼', label: '婴儿车' },
  { v: 'golf', icon: '⛳', label: '高尔夫球袋' },
  { v: 'bike', icon: '🛴', label: '脚踏车 / 滑板车' },
  { v: 'festive', icon: '🧧', label: '年货 / 节庆装饰' },
  { v: 'sports', icon: '🏸', label: '运动器材' },
  { v: 'quilts', icon: '🛌', label: '换季棉被' },
  { v: 'tools', icon: '🧰', label: '工具箱' },
];

// ───────────────────────── IV · 三个愿望 ─────────────────────────

export const WISHES = [
  { v: 'storage', icon: '📦', label: '收纳多到用不完' },
  { v: 'clean', icon: '✨', label: '一尘不染好打理' },
  { v: 'light', icon: '☀️', label: '阳光满屋' },
  { v: 'kitchen', icon: '🍳', label: '厨房超好用' },
  { v: 'kids', icon: '🧸', label: '孩子玩得安心' },
  { v: 'pets', icon: '🐾', label: '毛孩子友好' },
  { v: 'sleep', icon: '😴', label: '安静好睡' },
  { v: 'work', icon: '💻', label: '在家办公有效率' },
  { v: 'host', icon: '🥂', label: '招待朋友有面子' },
  { v: 'photo', icon: '📸', label: '拍照很出片' },
  { v: 'health', icon: '🌿', label: '零甲醛、健康环保' },
  { v: 'value', icon: '💰', label: '每一分钱花在刀刃上' },
];

export const SPLURGE = [
  { v: 'kitchen', icon: '🍳', label: '厨房' },
  { v: 'wardrobe', icon: '👗', label: '主卧衣柜' },
  { v: 'tvwall', icon: '📺', label: '客厅电视墙' },
  { v: 'bath', icon: '🛁', label: '浴室' },
  { v: 'floor', icon: '🪵', label: '全屋地板' },
  { v: 'lighting', icon: '💡', label: '灯光' },
];

// ───────────────────────── V · 禁忌 ─────────────────────────

export const NOGO_COLORS = [
  { v: 'white', label: '纯白', sw: '#F4F3F0' },
  { v: 'beige', label: '米黄', sw: '#E2CFA8' },
  { v: 'grey', label: '灰色', sw: '#A3A3A3' },
  { v: 'black', label: '黑色', sw: '#222' },
  { v: 'darkwood', label: '深木色', sw: '#5A3A26' },
  { v: 'pink', label: '粉色', sw: '#E5B9B5' },
  { v: 'green', label: '绿色', sw: '#8EA289' },
  { v: 'blue', label: '蓝色', sw: '#6F8AA6' },
  { v: 'yellow', label: '黄色 / 金色', sw: '#D9A93B' },
  { v: 'red', label: '红 / 橙', sw: '#B5562E' },
];

export const NOGO_FINISHES = [
  { v: 'glossy', label: '亮面高光' },
  { v: 'marble', label: '大理石纹' },
  { v: 'gold', label: '金色金属' },
  { v: 'concrete', label: '水泥工业风' },
  { v: 'velvet', label: '丝绒' },
  { v: 'leather', label: '皮革' },
  { v: 'rattan', label: '藤编' },
  { v: 'herringbone', label: '人字拼地板' },
  { v: 'glassdoor', label: '玻璃柜门' },
  { v: 'openshelf', label: '开放层板' },
  { v: 'wallpaper', label: '花纹墙纸' },
];

export const ONE_WISH_CHIPS = ['玄关不再乱', '厨房好收拾', '孩子有自己的天地', '一回家就想放松', '朋友来了坐得下', '衣服终于挂得下'];

/** 整个许愿之旅的步骤顺序（UI 按这个走） */
export const STEPS = [
  { id: 'welcome', chapter: null },
  { id: 'lamp', chapter: null },
  { id: 'ch-intuition', chapter: 'intuition', interlude: true },
  ...PAIRS.map((p) => ({ id: `pair:${p.id}`, chapter: 'intuition' })),
  { id: 'ch-life', chapter: 'life', interlude: true },
  ...LIFE.map((l) => ({ id: `life:${l.id}`, chapter: 'life' })),
  { id: 'ch-treasure', chapter: 'treasure', interlude: true },
  { id: 'shoes', chapter: 'treasure' },
  { id: 'wardrobe', chapter: 'treasure' },
  { id: 'books', chapter: 'treasure' },
  { id: 'appliances', chapter: 'treasure' },
  { id: 'bulky', chapter: 'treasure' },
  { id: 'ratio', chapter: 'treasure' },
  { id: 'ch-wishes', chapter: 'wishes', interlude: true },
  { id: 'wishes', chapter: 'wishes' },
  { id: 'splurge', chapter: 'wishes' },
  { id: 'ch-nogo', chapter: 'nogo', interlude: true },
  { id: 'nogo', chapter: 'nogo' },
  { id: 'onewish', chapter: 'nogo' },
  { id: 'reveal', chapter: null },
];
