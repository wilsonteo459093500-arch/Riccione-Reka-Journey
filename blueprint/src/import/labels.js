// PDF 文字解析 —— 纯函数（无 DOM、无 pdf.js），Node 可测。
// 词典（空间 / 楼层 / 材料部位 / 备注关键词）+ 各类标签解析：空间标题、楼层、材料标签、备注、文件名。

// ---------------------------------------------------------------------------
// 字符工具
// ---------------------------------------------------------------------------

const HAN = '\\u3400-\\u9fff\\uf900-\\ufaff';
const HAN_RE = new RegExp(`[${HAN}]`);
// 全角标点（不含弯引号 ’，那是英文撇号）
const CJK_PUNCT = '\\u3000-\\u303f\\uff01-\\uff0f\\uff1a-\\uff20\\uff3b-\\uff40\\uff5b-\\uff65';
const CJK_ANY_RE = new RegExp(`[${HAN}${CJK_PUNCT}]`);

export const isHan = (ch) => HAN_RE.test(ch || '');
export const isCJKChar = (ch) => CJK_ANY_RE.test(ch || '');
export const hasHan = (s) => HAN_RE.test(s || '');
export const hasLatin = (s) => /[A-Za-z]/.test(s || '');

// ---------------------------------------------------------------------------
// 字距拉开的字符串还原：'M u a r - M r L a u' → 'Muar - Mr Lau'
// ---------------------------------------------------------------------------

// 常见英文词（用于把 'GROUNDFLOOR'、'3Ddesign' 拆回单词）
const KNOWN_WORDS = [
  '3d', 'design', 'designs', 'ground', 'floor', 'first', 'second', 'third', 'fourth', 'fifth', 'lower', 'upper',
  'roof', 'top', 'attic', 'basement', 'level', 'mezzanine', 'plan', 'layout', 'proposal', 'concept', 'render',
  'living', 'area', 'room', 'dining', 'kitchen', 'dry', 'wet', 'bedroom', 'master', 'guest', 'kids', 'study',
  'family', 'hall', 'bath', 'bathroom', 'shoe', 'cabinet', 'staircase', 'wardrobe', 'walk', 'in', 'store',
  'official', 'phone', 'number', 'website', 'whatsapp', 'instagram', 'facebook', 'showroom', 'location',
  'malaysia', 'interior', 'the', 'of', 'and', 'by', 'mr', 'mrs', 'ms', 'mdm', 'dr', 'house', 'home', 'dream',
  'journey', 'view', 'day', 'night', 'sail', 'riccione', 'reka', 'whole', 'custom', 'customization', 'address',
];
const KNOWN_SET = new Set(KNOWN_WORDS);
const MAX_WORD = Math.max(...KNOWN_WORDS.map((w) => w.length));

/** 把一串字母按已知单词切开（必须整串切完，且至少 2 个词），失败返回 null */
function segmentKnown(run) {
  const low = run.toLowerCase();
  const n = low.length;
  const best = new Array(n + 1).fill(null);
  best[0] = [];
  for (let i = 0; i < n; i++) {
    if (!best[i]) continue;
    for (let L = 1; L <= MAX_WORD && i + L <= n; L++) {
      if (KNOWN_SET.has(low.slice(i, i + L))) {
        const cand = [...best[i], [i, i + L]];
        if (!best[i + L] || cand.length < best[i + L].length) best[i + L] = cand;
      }
    }
  }
  const seg = best[n];
  if (!seg || seg.length < 2) return null;
  return seg.map(([a, b]) => run.slice(a, b)).join(' ');
}

/** 去掉字距后，用大小写 / 连字符 / 已知单词恢复词界 */
export function recoverWords(s) {
  let out = s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])-([A-Za-z])/g, '$1 - $2')
    .replace(/,(?=\S)/g, ', ')
    .replace(/:(?=[A-Za-z])/g, ': ');
  out = out.replace(/[A-Za-z0-9]{5,}/g, (run) => segmentKnown(run) || run);
  // '40170Shah' → '40170 Shah'（在单词切分之后做，免得拆坏 '3Ddesign'）
  out = out.replace(/(\d)([A-Z][a-z]{2,})/g, '$1 $2');
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * 字距拉开的字符串还原。判定：按单空格拆开后 ≥70% 的片段是单个字符。
 * 有双空格时以双空格为词界；否则按大小写 / 已知单词恢复。
 */
export function collapseLetterSpacing(str) {
  const s = String(str ?? '').replace(/ /g, ' ').trim();
  const tokens = s.split(/ +/);
  if (tokens.length < 2) return s;
  const singles = tokens.filter((t) => [...t].length === 1).length;
  // 'ffi' 这类连字算单字
  const ligs = tokens.filter((t) => /^(ff|fi|fl|ffi|ffl)$/.test(t)).length;
  if ((singles + ligs) / tokens.length < 0.7) return s;
  // 全是汉字 / 全角标点：直接去空格即可
  if (tokens.every((t) => [...t].every((ch) => isCJKChar(ch)))) return tokens.join('');
  if (/\S {2,}\S/.test(s)) {
    return s.split(/ {2,}/).map((w) => recoverWords(w.replace(/ /g, ''))).join(' ');
  }
  return recoverWords(tokens.join(''));
}

// ---------------------------------------------------------------------------
// 标点 / 空格规范化
// ---------------------------------------------------------------------------

/**
 * 统一标点与空格：汉字之间不留空格；含汉字时括号 / 冒号 / 逗号用全角；'&' 两侧各一个空格。
 */
export function normalizeText(str, { keepHanSpaces = false } = {}) {
  let s = String(str ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  s = s.replace(/＆/g, '&').replace(/＋/g, '+').replace(/[‘’`]/g, '\'');
  // 中文输入法打出来的全角字母数字 / 斜杠 / 比例冒号：ＡＧ２７３ → AG273，柜体／柜门 → 柜体/柜门，∶ ﹕ → ：
  s = s.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => c.normalize('NFKC')).replace(/／/g, '/').replace(/[∶﹕]/g, '：');
  if (hasHan(s)) {
    s = s.replace(/\(/g, '（').replace(/\)/g, '）');
    s = s.replace(new RegExp(`([${HAN}）])\\s*:`, 'g'), '$1：');
    s = s.replace(new RegExp(`([${HAN}])\\s*,\\s*`, 'g'), '$1，');
    s = s.replace(new RegExp(`,\\s*(?=[${HAN}])`, 'g'), '，');
  }
  // 全角标点两侧不留空格
  s = s.replace(/\s*([（）：，。、；！？「」【】])\s*/g, '$1');
  // 汉字之间不留空格（含 + 号两侧）；材料标签里的空格是「片段分隔」，保留
  if (!keepHanSpaces) s = s.replace(new RegExp(`([${HAN}])\\s+(?=[${HAN}])`, 'g'), '$1');
  s = s.replace(new RegExp(`([${HAN}])\\s*\\+\\s*(?=[${HAN}A-Za-z])`, 'g'), '$1+');
  s = s.replace(/\s*&\s*/g, ' & ');
  return s.replace(/\s+/g, ' ').trim();
}

/** 中英文 / 数字之间加空格（与定稿一致：'35 杯内嵌拉手腰线'、'U 形衣橱'、'客房 1'），'5x抽屉' → '5 × 抽屉' */
export function pangu(str) {
  let s = String(str ?? '');
  s = s.replace(new RegExp(`(\\d)\\s*[xX×]\\s*(?=[${HAN}])`, 'g'), '$1 × ');
  s = s.replace(new RegExp(`([${HAN}])([A-Za-z0-9])`, 'g'), '$1 $2');
  s = s.replace(new RegExp(`([A-Za-z0-9%])([${HAN}])`, 'g'), '$1 $2');
  s = s.replace(/(\d)\s*k\b/g, '$1K');
  return s.replace(/\s+/g, ' ').trim();
}

/** 一行文字的完整清洗：字距还原 → 标点规范 */
export function cleanLine(str) {
  return normalizeText(collapseLetterSpacing(str));
}

/**
 * 拼接同一行相邻的两段文字：两侧都是中文（含全角标点）→ 不加空格；否则间距 > 0.15·字号 才加一个空格
 */
export function joinPieces(a, b, gap, fs) {
  if (!a) return b;
  if (!b) return a;
  const last = a[a.length - 1];
  const first = b[0];
  if (isCJKChar(last) && isCJKChar(first)) return a + b;
  if (/\s$/.test(a) || /^\s/.test(b)) return a + b;
  if (gap > 0.15 * fs) return `${a} ${b}`;
  return a + b;
}

const TYPOS = { CABIENT: 'CABINET', CABINENT: 'CABINET', CABNET: 'CABINET', KICTHEN: 'KITCHEN', BEDROM: 'BEDROOM', TERAZZO: 'TERRAZZO', TERRAZO: 'TERRAZZO', MARBEL: 'MARBLE', LIVNG: 'LIVING', DINNING: 'DINING' };
export const EN_TYPOS = TYPOS;

export function fixTypos(str) {
  return String(str ?? '').replace(/[A-Za-z]+/g, (w) => {
    const fix = TYPOS[w.toUpperCase()];
    if (!fix) return w;
    if (w === w.toUpperCase()) return fix;
    if (w === w.toLowerCase()) return fix.toLowerCase();
    return fix[0] + fix.slice(1).toLowerCase();
  });
}

const ACRONYMS = new Set(['LED', 'PVC', 'MDF', 'HPL', 'PET', 'UV', 'ABS', 'SPC', 'WPC', 'TV', 'KTV', 'OSB', 'HMR', 'E0', 'E1', 'ENF', 'CNC', 'RGB']);

/** 'TAJ MAHAL' → 'Taj Mahal'（常见缩写保留大写） */
export function titleCase(str) {
  return String(str ?? '').replace(/[A-Za-z][A-Za-z']*/g, (w) => {
    if (ACRONYMS.has(w.toUpperCase())) return w.toUpperCase();
    return w[0].toUpperCase() + w.slice(1).toLowerCase();
  });
}

// ---------------------------------------------------------------------------
// 空间词典
// ---------------------------------------------------------------------------

/** 中文空间名 → 英文（大写）。键同时作为识别词（最长匹配） */
export const ROOM_DICT = {
  '鞋柜': 'SHOE CABINET',
  '玄关': 'FOYER',
  '门厅': 'FOYER',
  '入户': 'ENTRANCE',
  '客厅': 'LIVING AREA',
  '起居室': 'LIVING ROOM',
  '大厅': 'HALL',
  '会客厅': 'RECEPTION',
  '饭厅': 'DINING',
  '餐厅': 'DINING',
  '厨房': 'KITCHEN',
  '干厨': 'DRY KITCHEN',
  '湿厨': 'WET KITCHEN',
  '中厨': 'WET KITCHEN',
  '西厨': 'DRY KITCHEN',
  '开放式厨房': 'OPEN KITCHEN',
  '岛台': 'KITCHEN ISLAND',
  '楼梯储物柜': 'STAIRCASE CABINET',
  '楼梯柜': 'STAIRCASE CABINET',
  '楼梯': 'STAIRCASE',
  '卧室': 'BEDROOM',
  '睡房': 'BEDROOM',
  '主人房': 'MASTER BEDROOM',
  '主卧': 'MASTER BEDROOM',
  '主卧室': 'MASTER BEDROOM',
  '次卧': 'SECOND BEDROOM',
  '客房': 'GUEST ROOM',
  '客卧': 'GUEST ROOM',
  '儿童房': 'KIDS ROOM',
  '小孩房': 'KIDS ROOM',
  '女儿房': 'DAUGHTER\'S ROOM',
  '儿子房': 'SON\'S ROOM',
  '老人房': 'ELDERLY ROOM',
  '长辈房': 'ELDERLY ROOM',
  '保姆房': 'MAID\'S ROOM',
  '佣人房': 'MAID\'S ROOM',
  '书房': 'STUDY',
  '衣帽间': 'WALK-IN WARDROBE',
  '中厅': 'FAMILY HALL',
  '家庭厅': 'FAMILY HALL',
  'KTV 娱乐室': 'KTV ROOM',
  'KTV 房': 'KTV ROOM',
  '娱乐室': 'KTV ROOM',
  '影音室': 'HOME THEATER',
  '麻将房': 'MAHJONG ROOM',
  '茶室': 'TEA ROOM',
  '琴房': 'MUSIC ROOM',
  '游戏室': 'PLAYROOM',
  '佛堂': 'ALTAR',
  '神台': 'ALTAR',
  '祈祷室': 'PRAYER ROOM',
  '榻榻米': 'TATAMI',
  '卫生间': 'BATHROOM',
  '浴室': 'BATHROOM',
  '厕所': 'BATHROOM',
  '洗手间': 'BATHROOM',
  '主卫': 'MASTER BATHROOM',
  '阳台': 'BALCONY',
  '洗衣房': 'LAUNDRY',
  '工作阳台': 'LAUNDRY',
  '储物间': 'STORE ROOM',
  '杂物间': 'STORE ROOM',
  '健身房': 'GYM',
  '办公室': 'OFFICE',
  '接待室': 'RECEPTION',
  '走廊': 'CORRIDOR',
  '过道': 'CORRIDOR',
  '车库': 'GARAGE',
  '花园': 'GARDEN',
  '天台': 'ROOFTOP',
  '阁楼': 'ATTIC',
  '化妆台': 'VANITY',
  '衣柜': 'WARDROBE',
  '衣橱': 'WARDROBE',
  '收纳柜': 'STORAGE',
  '储物柜': 'STORAGE',
  '电视柜': 'TV CABINET',
  '吧台': 'BAR',
  '酒柜': 'WINE CABINET',
  '书柜': 'BOOKCASE',
  '餐边柜': 'SIDEBOARD',
  '展示柜': 'DISPLAY CABINET',
  '客餐厅': 'LIVING & DINING',
  '化妆间': 'POWDER ROOM',
  '茶水间': 'PANTRY',
  '储藏室': 'STORE ROOM',
  '工人房': 'MAID\'S ROOM',
};

// 英文空间名（大写、撇号统一为 '）→ 规范英文；用于修正设计师的写法
const EN_ALIASES = {
  'MAH JONG\'S ROOM': 'MAHJONG ROOM',
  'MAH JONG ROOM': 'MAHJONG ROOM',
  'MAHJONG\'S ROOM': 'MAHJONG ROOM',
  'MAHJONG': 'MAHJONG ROOM',
  'MAH JONG': 'MAHJONG ROOM',
  'DINING ROOM': 'DINING',
  'DINING AREA': 'DINING',
  'LIVING': 'LIVING AREA',
  'LIVING HALL': 'LIVING AREA',
  'STUDY ROOM': 'STUDY',
  'MASTER ROOM': 'MASTER BEDROOM',
  'KTV': 'KTV ROOM',
  'TOILET': 'BATHROOM',
  'WASHROOM': 'BATHROOM',
  'WALK IN WARDROBE': 'WALK-IN WARDROBE',
  'WALK IN CLOSET': 'WALK-IN WARDROBE',
  'WALK-IN CLOSET': 'WALK-IN WARDROBE',
  'STAIRCASE STORAGE': 'STAIRCASE CABINET',
  'STAIR CABINET': 'STAIRCASE CABINET',
  'SHOE RACK': 'SHOE CABINET',
  'GUEST BEDROOM': 'GUEST ROOM',
  'KIDS BEDROOM': 'KIDS ROOM',
  'KID\'S ROOM': 'KIDS ROOM',
  'KID\'S BEDROOM': 'KIDS ROOM',
  'CHILDREN\'S ROOM': 'KIDS ROOM',
  'FAMILY ROOM': 'FAMILY HALL',
  'FAMILY AREA': 'FAMILY HALL',
  'FAMILY LOUNGE': 'FAMILY HALL',
  'LAUNDRY AREA': 'LAUNDRY',
  'LAUNDRY ROOM': 'LAUNDRY',
  'POWDER': 'POWDER ROOM',
  'LIVING AND DINING': 'LIVING & DINING',
  'LIVING DINING': 'LIVING & DINING',
  'BED ROOM': 'BEDROOM',
};

/** 英文 → 中文空间名（'Living Area' → '客厅'） */
export const ROOM_EN_TO_ZH = (() => {
  const out = {};
  for (const [zh, en] of Object.entries(ROOM_DICT)) if (!out[en]) out[en] = zh;
  Object.assign(out, { 'LIVING ROOM': '客厅', 'LIVING AREA': '客厅', 'DINING': '饭厅', 'KTV ROOM': 'KTV 娱乐室', 'STORAGE': '收纳柜', 'WARDROBE': '衣柜', 'ROOFTOP': '天台' });
  return out;
})();

/** 规范英文空间名：大写、修正拼写、别名 */
export function canonicalRoomEn(str) {
  let s = fixTypos(String(str ?? '')).replace(/[’‘`]/g, '\'').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!s) return '';
  s = s.replace(/\s*'\s*/g, '\'');
  return EN_ALIASES[s] || s;
}

/** 英文空间名 → 中文（找不到返回 ''） */
export function roomZhFromEn(str) {
  const en = canonicalRoomEn(str);
  return ROOM_EN_TO_ZH[en] || ROOM_EN_TO_ZH[en.replace(/ ROOM$/, '')] || '';
}

// 词典键按长度降序（最长匹配）；带英文的键（'KTV 娱乐室'）单独处理
const ROOM_KEYS = Object.keys(ROOM_DICT).sort((a, b) => b.length - a.length);
const ROOM_KEYS_ZH = ROOM_KEYS.filter((k) => !/[A-Za-z]/.test(k));
const ROOM_KEYS_LATIN = ROOM_KEYS.filter((k) => /[A-Za-z]/.test(k));

// ---------------------------------------------------------------------------
// 楼层
// ---------------------------------------------------------------------------

// 本公司（马来西亚）习惯：GROUND FLOOR = 一楼，FIRST FLOOR = 二楼，SECOND FLOOR = 三楼
const FLOOR_LEVELS = [
  { zh: '一楼', en: 'GROUND FLOOR' },
  { zh: '二楼', en: 'FIRST FLOOR' },
  { zh: '三楼', en: 'SECOND FLOOR' },
  { zh: '四楼', en: 'THIRD FLOOR' },
  { zh: '五楼', en: 'FOURTH FLOOR' },
  { zh: '六楼', en: 'FIFTH FLOOR' },
];
const SPECIAL_FLOORS = {
  basement: { zh: '地下室', en: 'BASEMENT' },
  lower: { zh: '地下层', en: 'LOWER GROUND FLOOR' },
  mezz: { zh: '夹层', en: 'MEZZANINE' },
  attic: { zh: '阁楼', en: 'ATTIC' },
  roof: { zh: '天台', en: 'ROOF TOP' },
  upper: { zh: 'UG 层', en: 'UPPER GROUND FLOOR' },
};
const ZH_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };
const EN_ORD = { GROUND: 0, FIRST: 1, SECOND: 2, THIRD: 3, FOURTH: 4, FIFTH: 5 };

/** 在字符串中找楼层记号（第一个），返回 { floor:{zh,en}, index, length } | null */
function findFloorToken(s) {
  const cands = [];
  const push = (re, fn) => {
    const m = re.exec(s);
    if (m) {
      const f = fn(m);
      if (f) cands.push({ floor: f, index: m.index, length: m[0].length, zh: /[㐀-鿿]/.test(m[0]) });
    }
  };
  push(/(?:^|[^A-Za-z])(GROUND|FIRST|SECOND|THIRD|FOURTH|FIFTH)\s*(?:FLOOR|FLR)\b/i, (m) => FLOOR_LEVELS[EN_ORD[m[1].toUpperCase()]]);
  push(/LOWER\s*GROUND(?:\s*FLOOR)?/i, () => SPECIAL_FLOORS.lower);
  push(/UPPER\s*GROUND(?:\s*FLOOR)?|(?:^|[^A-Za-z0-9])UG(?:\s*FLOOR)?(?![A-Za-z0-9])/i, () => SPECIAL_FLOORS.upper);
  // '1st Floor' / '2nd Floor'（马来西亚：1st = 二楼）、'1/F'（港式：G/F 之上的第一层 = 二楼）
  push(/(?:^|[^A-Za-z0-9])([1-5])\s*(?:ST|ND|RD|TH)\s*(?:FLOOR|FLR)\b/i, (m) => FLOOR_LEVELS[Number(m[1])]);
  push(/(?:^|[^A-Za-z0-9])([1-5])\s*\/\s*F(?![A-Za-z0-9])/i, (m) => FLOOR_LEVELS[Number(m[1])]);
  push(/\bBASEMENT\b/i, () => SPECIAL_FLOORS.basement);
  push(/\bMEZZANINE\b/i, () => SPECIAL_FLOORS.mezz);
  push(/\bATTIC\b/i, () => SPECIAL_FLOORS.attic);
  push(/\bROOF\s*(?:TOP)?\b/i, () => SPECIAL_FLOORS.roof);
  push(/(?:^|[^A-Za-z0-9])(G\/?F)(?![A-Za-z0-9])/i, () => FLOOR_LEVELS[0]);
  push(/(?:^|[^A-Za-z0-9])([1-6])\s*F(?![A-Za-z0-9])/i, (m) => FLOOR_LEVELS[Number(m[1]) - 1]);
  push(/(?:^|[^A-Za-z0-9])L\s*([0-5])(?![0-9])/i, (m) => FLOOR_LEVELS[Number(m[1])]);
  push(/(?:^|[^A-Za-z0-9])LEVEL\s*([0-5])(?![0-9])/i, (m) => FLOOR_LEVELS[Number(m[1])]);
  push(/([一二三四五六1-6])\s*(?:楼|层)/, (m) => FLOOR_LEVELS[ZH_NUM[m[1]] - 1]);
  push(/负一楼|地下室|地下一层/, () => SPECIAL_FLOORS.basement);
  push(/阁楼/, () => SPECIAL_FLOORS.attic);
  push(/天台|屋顶/, () => SPECIAL_FLOORS.roof);
  push(/夹层/, () => SPECIAL_FLOORS.mezz);
  if (!cands.length) return null;
  cands.sort((a, b) => a.index - b.index);
  return cands;
}

// 楼层标签里允许出现的其它字样
const FLOOR_FILLER = /设计图|效果图|平面图|布置图|设计|方案|楼层|3\s*D|DESIGN|PLAN|LAYOUT|FLOOR|UPPER|GROUND|[-–—·•|:：/\\(),（）\s]/gi;

/**
 * 楼层标签 → { zh, en } | null
 * 'GROUND FLOOR 一楼设计图' → { zh:'一楼', en:'GROUND FLOOR' }；'2F' → 二楼 / FIRST FLOOR；'L1' → 二楼 / FIRST FLOOR
 * 只认「纯楼层标签」：去掉楼层记号与「设计图」等字样后不能剩下别的内容（避免把「一楼客厅」当楼层页）
 */
export function parseFloorLabel(str) {
  const s = cleanLine(str);
  if (!s || s.length > 48) return null;
  const cands = findFloorToken(s);
  if (!cands) return null;
  let rest = s;
  for (const c of [...cands].sort((a, b) => b.index - a.index)) {
    rest = rest.slice(0, c.index) + ' ' + rest.slice(c.index + c.length);
  }
  rest = rest.replace(FLOOR_FILLER, '');
  if (rest.length > 1) return null;
  // 中文楼层名优先取中文写法，英文优先取英文写法（两者都写时以各自为准）
  const zhC = cands.find((c) => c.zh);
  const enC = cands.find((c) => !c.zh);
  return { zh: (zhC || enC).floor.zh, en: (enC || zhC).floor.en };
}

/** 标题开头的楼层前缀（'一楼客厅' → { floor, rest:'客厅' }），没有返回 null */
export function splitFloorPrefix(str) {
  const s = String(str ?? '').trim();
  const m = /^(?:([一二三四五六1-6])\s*(?:楼|层)|(GF|G\/F|[1-6]F|L[0-5]))\s*[-–·:：]?\s*/i.exec(s);
  if (!m || m[0].length >= s.length) return null;
  const f = parseFloorLabel(m[0]);
  return f ? { floor: f, rest: s.slice(m[0].length) } : null;
}

// ---------------------------------------------------------------------------
// 空间标题
// ---------------------------------------------------------------------------

function mapQualifier(q) {
  const s = normalizeText(q).replace(/\s+/g, '');
  if (!s) return '';
  if (/^(白天|日景|日间|白昼|day(time)?)$/i.test(s)) return '白天';
  if (/^(晚上|夜晚|夜景|夜间|黄昏|night)$/i.test(s)) return '夜晚';
  if (/^待(确认|定)$/.test(s)) return '';
  const m = /^(?:之前的?|原来的?|原)(.+)$/.exec(s);
  if (m) return `原${m[1]}`;
  return pangu(s);
}

const CN_ORDINAL = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/**
 * 空间标题 → { room, roomEn, subtitle, qualifier, feature, floor }
 *   '主人房U形衣橱+化妆台（白天）' → { room:'主人房', roomEn:'MASTER BEDROOM', subtitle:'U 形衣橱 · 化妆台 · 白天' }
 *   '客房1（之前的女儿房）'        → { room:'客房 1', roomEn:'GUEST ROOM 1', subtitle:'原女儿房' }
 *   '麻将房 Mah Jong’s Room'      → { room:'麻将房', roomEn:'MAHJONG ROOM' }
 */
export function parseRoomTitle(str) {
  const out = { room: '', roomEn: '', subtitle: '', qualifier: '', feature: '', floor: null, known: false };
  let s = cleanLine(str);
  if (!s) return out;

  // 0) 分隔符后面的是视角 / 细节：'客厅 - 电视柜'、'客厅｜电视柜'、'客厅：电视柜'、'Master Bedroom - Walk-in Wardrobe'
  s = s.replace(new RegExp(`([${HAN}）])\\s*[-–—]\\s*(?=[${HAN}A-Za-z])`, 'g'), '$1｜');
  const sepParts = s.split(/\s+[-–—]\s+|\s*[｜|：]\s*/).map((x) => x.trim()).filter((x) => x && !/^[-–—|｜/:：·•\s]+$/.test(x));
  s = sepParts[0] || '';
  // 英文楼层前缀（'GF Living Room'、'1F 客厅'）
  const fp0 = splitFloorPrefix(s);
  if (fp0) {
    out.floor = fp0.floor;
    s = fp0.rest;
  }
  const tailFeatures = sepParts.slice(1).map((x) => (/[A-Za-z]/.test(x) && !hasHan(x) ? titleCase(fixTypos(x)) : x));

  // 1) 括号里的限定词
  const quals = [];
  s = s.replace(/（([^）]*)(?:）|$)/g, (_, q) => {
    quals.push(q);
    return ' ';
  });
  out.qualifier = quals.map(mapQualifier).filter(Boolean).join(' · ');
  s = s.replace(/\s+/g, ' ').trim();

  // 2) 带英文的词典键（'KTV 娱乐室'）
  let roomKey = '';
  let roomDisplay = '';
  for (const k of ROOM_KEYS_LATIN) {
    const re = new RegExp(k.split('').filter((c) => c !== ' ').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), 'i');
    const m = re.exec(s);
    if (m) {
      roomKey = k;
      roomDisplay = k;
      s = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).trim();
      break;
    }
  }

  // 3) 拆出英文部分（独立的英文单词串；'U形' 这种贴着汉字的字母不算）
  const enWords = [];
  const zhTokens = [];
  let prevEn = false;
  for (const tok of s.split(/\s+/).filter(Boolean)) {
    if (/^[-–—|｜/:：·•]+$/.test(tok)) continue; // 孤立的分隔符
    const en = (/^[A-Za-z][A-Za-z'.\-]*$/.test(tok) && tok.length > 1) || (tok === '&' && prevEn);
    if (en) enWords.push(tok);
    else zhTokens.push(tok);
    prevEn = en;
  }
  let enPart = enWords.join(' ').replace(/\s*&\s*/g, ' & ').trim();
  let zh = zhTokens.join('');

  // 4) 楼层前缀
  const fp = splitFloorPrefix(zh);
  if (fp) {
    out.floor = fp.floor;
    zh = fp.rest;
  }

  // 5) 按 + 拆段；去掉段首孤立小写字母（'+t榻榻米' 这类笔误）；去掉「设计」后缀
  const segs = zh
    .split(/[+、&]/)
    .map((x) => x.trim().replace(new RegExp(`^[a-z](?=[${HAN}])`), ''))
    .map((x) => (x.length > 3 && /设计$/.test(x) ? x.replace(/的?设计$/, '') : x))
    .filter(Boolean);

  let number = '';
  const features = [];
  if (!roomKey && segs.length) {
    const seg0 = segs[0];
    const k = ROOM_KEYS_ZH.find((key) => seg0.startsWith(key));
    if (k) {
      let rem = seg0.slice(k.length);
      // 编号：阿拉伯数字（'客房1'），或整段只剩一个中文数字（'客房二'）
      const num = /^\s*(\d{1,2})(?![\d楼层])/.exec(rem) || /^([一二三四五六七八九])$/.exec(rem);
      if (num) {
        number = String(CN_ORDINAL[num[1]] || num[1]);
        rem = rem.slice(num[0].length);
      }
      if (rem.length === 1 && !number) {
        // '收纳柜体'：词典词 + 单字 → 整段即空间名
        roomKey = k;
        roomDisplay = seg0;
      } else {
        roomKey = k;
        roomDisplay = k;
        if (rem) features.push(rem);
      }
      features.push(...segs.slice(1));
    } else {
      const fromEn = enPart ? roomZhFromEn(enPart) : '';
      if (fromEn) {
        roomKey = fromEn;
        roomDisplay = fromEn;
        features.push(...segs);
      } else {
        roomDisplay = seg0;
        features.push(...segs.slice(1));
      }
    }
  } else if (roomKey) {
    features.push(...segs);
  } else if (enPart) {
    roomDisplay = roomZhFromEn(enPart);
    roomKey = roomDisplay;
  }
  // 是否认得这个空间（词典里有）：封面 / 标题判断用
  out.known = !!roomKey && (!!ROOM_DICT[roomKey] || ROOM_KEYS_ZH.some((k) => roomKey.startsWith(k)));
  // 词典里没有的纯英文空间名（'Powder Room' 以外的生僻写法）：直接用英文
  if (!roomDisplay && enPart) roomDisplay = titleCase(fixTypos(enPart));
  features.push(...tailFeatures);

  out.room = pangu(number ? `${roomDisplay} ${number}` : roomDisplay);
  let en = enPart ? canonicalRoomEn(enPart) : '';
  if (!en && roomKey && ROOM_DICT[roomKey]) en = ROOM_DICT[roomKey];
  if (!en && roomKey) {
    const k2 = ROOM_KEYS_ZH.find((key) => roomKey.startsWith(key));
    if (k2) en = ROOM_DICT[k2];
  }
  if (en && number && !/\d$/.test(en)) en = `${en} ${number}`;
  out.roomEn = en;
  // '客厅/电视柜'：去掉段首残留的分隔符
  out.feature = pangu(features.map((f) => f.replace(/^[/:：·•|｜\-–—\s]+/, '')).filter(Boolean).join(' · '));
  out.subtitle = [out.feature, out.qualifier].filter(Boolean).join(' · ');
  return out;
}

// ---------------------------------------------------------------------------
// 材料标签
// ---------------------------------------------------------------------------

/** 材料「部位」词汇（标签开头的 '柜体 & 柜门：'） */
export const ROLE_WORDS = [
  '柜体', '柜门', '柜身', '柜框', '见光板', '墙板', '护墙板', '岩板', '台面', '开放柜', '开放格', '床头板', '床头', '玻璃门',
  '背板', '地板', '拉手', '五金', '抽屉', '层板', '饰面', '门板', '吊柜', '地柜', '推拉门', '衣柜', '衣橱', '踢脚线',
  '顶线', '收口', '灯带', '墙面', '背景墙', '门套', '窗套', '桌面', '书桌', '柜脚', '线条', '装饰条', '封板', '侧板',
  '格栅', '隔断', '床架', '镜面', '玻璃', '石材', '台面板', '柜内', '内胆', '外框', '铝框', '把手', '门', '柜',
].sort((a, b) => b.length - a.length);

// 材料性质的部位：名称是纯英文时，名称前加上它（'岩板 · Taj Mahal'）
const MATERIAL_ROLES = /^(岩板|石材|大理石|石|玻璃|瓷砖|台面|岩板台面|台面板|地砖|墙砖)$/;

// 「看起来像材料」的字
const MATERIAL_HINT = /玻璃|岩板|石|橡|胡桃|木|饰面|板|漆|砖|布|皮|铝|钢|铜|镜|纹|拉手|五金|铰链|灯|陶|釉|织|麻|藤|竹|色|白|灰|黑|金|银/;

// 材料编号：AG275 / AG353A / SS083M / GZY004（不认 '3000k'、'20'）。不用后行断言，兼容旧版 Safari
export const CODE_RE = /(^|[^A-Za-z0-9])([A-Z]{1,4}\d{2,4}[A-Z]?)(?![A-Za-z0-9])/;

/** 找材料编号 → { code, index, length }（index / length 只含编号本身） */
export function findCode(s) {
  const m = CODE_RE.exec(String(s ?? ''));
  if (!m) return null;
  return { code: m[2].toUpperCase(), index: m.index + m[1].length, length: m[2].length };
}
const PENDING_RE = /[（(【\[]?\s*待\s*(?:确\s*认|定)\s*[）)】\]]?/g;

/** 名称片段整理：中文片段用 ' · ' 连，英文单词保持空格 */
function tidyName(raw, role) {
  let s = normalizeText(raw, { keepHanSpaces: true })
    .replace(/[：:，,。;；]+/g, ' ')
    .replace(/^[\s*·•\-–—&]+|[\s*·•\-–—&]+$/g, '');
  // 括号里的说明（'（3000k）'）接在后面
  const extra = [];
  s = s.replace(/（([^）]*)(?:）|$)/g, (_, q) => {
    if (q.trim()) extra.push(q.trim());
    return ' ';
  });
  const tokens = s.split(/\s+|·/).map((t) => t.trim()).filter(Boolean);
  // 相邻的纯英文词合成一段
  const parts = [];
  for (const t of tokens) {
    const latin = /^[A-Za-z][A-Za-z'.\-]*$/.test(t);
    const prev = parts[parts.length - 1];
    if (latin && prev && prev.latin) prev.text += ` ${t}`;
    else parts.push({ text: t, latin });
  }
  // '20隐框款' '超白玻璃' → '超白玻璃 · 20隐框款'（数字开头的规格放到材料名后面）
  const isMat = (p) => /(玻璃|石|岩板|板|砖|漆|木|橡)$/.test(p.text);
  if (parts.length > 1 && parts.some(isMat) && parts.some((p) => /^\d/.test(p.text))) {
    parts.sort((a, b) => (/^\d/.test(a.text) ? 1 : 0) - (/^\d/.test(b.text) ? 1 : 0));
  }
  const allLatin = parts.length > 0 && parts.every((p) => p.latin);
  let name = parts.map((p) => (p.latin ? titleCase(fixTypos(p.text)) : p.text)).join(' · ');
  if (extra.length) name = `${name} ${extra.join(' ')}`.trim();
  name = pangu(name);
  if (allLatin && role && MATERIAL_ROLES.test(role)) name = `${role} · ${name}`;
  return name;
}

/** 从文字开头读出部位（'柜体 & 柜门 归雁胡桃' → '柜体 & 柜门'），读不出返回 null */
function leadingRole(s, hasCode = false) {
  let i = 0;
  const words = [];
  for (;;) {
    const w = ROLE_WORDS.find((r) => r.length > 1 && s.startsWith(r, i));
    if (!w) break;
    words.push(w);
    i += w.length;
    const sep = /^\s*(?:&|、|和|与|\/)\s*/.exec(s.slice(i));
    if (sep) {
      i += sep[0].length;
      continue;
    }
    break;
  }
  if (!words.length) return null;
  const rest = s.slice(i);
  // 部位后面必须有分隔（空格 / 冒号），或者已经是「A & B」这种明确的部位组合
  if (!/^[\s：:]/.test(rest) && words.length < 2 && !hasCode) return null;
  if (!rest.trim()) return null;
  return { role: words.join(' & '), rest: rest.replace(/^[\s：:]+/, '') };
}

/**
 * 材料标签 → { role, name, code, pending }
 *   '柜体 & 柜门 归雁胡桃AG275'             → { role:'柜体 & 柜门', name:'归雁胡桃', code:'AG275' }
 *   '玻璃门 ： 20隐框款 GZY004 超白玻璃'     → { role:'玻璃门', name:'超白玻璃 · 20 隐框款', code:'GZY004' }
 *   '岩板：（待确认） SS083M TAJ MAHAL'       → { role:'岩板', name:'岩板 · Taj Mahal', code:'SS083M', pending:true }
 */
export function parseMaterialLabel(text) {
  const norm = (x) => normalizeText(x, { keepHanSpaces: true });
  let s = norm(String(text ?? '').replace(/\n/g, ' '));
  const pending = /待\s*(确\s*认|定)/.test(s);
  s = s.replace(PENDING_RE, ' ').replace(/^[\s*※•·]+/, '');
  s = norm(s);
  let code = '';
  const cm = findCode(s);
  if (cm) {
    code = cm.code;
    s = (s.slice(0, cm.index) + ' ' + s.slice(cm.index + cm.length)).trim();
  }
  let role = '';
  const colon = /^([^：:]{1,14})[：:]\s*(.*)$/.exec(s);
  if (colon && !CODE_RE.test(colon[1])) {
    role = colon[1];
    s = colon[2];
  } else {
    const lr = leadingRole(s, !!code);
    if (lr) {
      role = lr.role;
      s = lr.rest;
    }
  }
  role = normalizeText(role).replace(/\s*&\s*/g, ' & ').replace(/[：:]$/, '').trim();
  let name = tidyName(s, role);
  if (!name && !code && role) {
    // 只有一个词（'拉手'）：那就是名称
    name = role;
    role = '';
  }
  return { role, name, code, pending };
}

/** 材料去重键：有编号用编号，否则用规范化名称 */
export function materialKey(m) {
  const code = String(m?.code || '').trim().toUpperCase();
  if (code) return code;
  return String(m?.name || '').toLowerCase().replace(/[\s·・.\-_/]+/g, '');
}

/** 文字块像不像材料标签（用来区分「色板说明」与「设计备注」） */
export function looksLikeMaterial(text) {
  const s = normalizeText(String(text ?? '').replace(/\n/g, ' '));
  if (!s || /^[*※•]/.test(s)) return false;
  if (CODE_RE.test(s)) return true;
  if (/待\s*(确\s*认|定)/.test(s)) return true;
  if (/[。！？]/.test(s)) return false;
  const colon = /^([^：:]{1,10})[：:](.{1,24})$/.exec(s);
  if (colon && !/[，,]/.test(colon[2])) return true;
  if (/[，,]/.test(s)) return false;
  const body = s.replace(/\s+/g, '');
  return body.length <= 16 && (MATERIAL_HINT.test(body) || /^[A-Za-z][A-Za-z ]{3,}$/.test(s));
}

/** 部位为空时按名称推断一个（'银波纹玻璃' → '玻璃'） */
export function inferRole(name) {
  const s = String(name || '');
  if (/玻璃/.test(s)) return '玻璃';
  if (/岩板/.test(s)) return '岩板';
  if (/大理石|石材|洞石|石/.test(s) && !/[A-Z]{2}\d/.test(s)) return '';
  if (/背板/.test(s)) return '背板';
  if (/拉手|把手/.test(s)) return '拉手';
  return '';
}

// ---------------------------------------------------------------------------
// 设计备注（效果图上的标注、页面上的 * 说明）
// ---------------------------------------------------------------------------

/** 备注标签关键词（取文字前几个字里最长的那个） */
export const NOTE_KEYWORDS = [
  '隐形门', '闭门器', '反弹器', '抽屉柜', '抽屉', '封板', '柜门', '柜体', '见光板', '层板', '展示柜', '玻璃柜', '衣橱', '衣柜',
  '化妆台', '床头', '床边', '榻榻米', '灯带', '灯光', '拉手', '五金', '台面', '岩板', '背板', '墙板', '吊柜', '地柜', '鞋柜',
  '酒柜', '电视柜', '书柜', '橱柜', '餐边柜', '岛台', '吧台', '高度', '深度', '宽度', '尺寸', '板材', '开门方式', '门板',
  '推拉门', '玻璃门', '镜子', '全身镜', '收纳格', '开放格', '开放柜', '踢脚线', '插座', '开关', '空调', '窗帘',
].sort((a, b) => b.length - a.length);

// 适合直接做副标题的备注标签（「客厅 · 隐形门」）
export const SUBTITLE_KEYWORDS = new Set(['隐形门', '展示柜', '抽屉柜', '玻璃柜', '化妆台', '衣柜', '衣橱', '床头', '电视柜', '酒柜', '吧台', '榻榻米', '鞋柜', '岛台', '餐边柜', '书柜', '橱柜', '推拉门', '玻璃门']);

/** 标注里常见的英文术语 → 中文（'hidden door' → '隐形门'） */
export const NOTE_TERMS_EN = {
  'hidden door': '隐形门',
  'invisible door': '隐形门',
  'door closer': '闭门器',
  'hydraulic door closer': '液压闭门器',
  'door closer hydraulic': '液压闭门器',
  'push to open': '反弹器',
  'soft close': '缓冲阻尼',
  'led strip': '灯带',
  'handleless': '免拉手',
  'glass door': '玻璃门',
  'sliding door': '推拉门',
  'drawer': '抽屉',
  'drawers': '抽屉',
  'display cabinet': '展示柜',
  'tatami': '榻榻米',
  'wardrobe': '衣柜',
  'shoe cabinet': '鞋柜',
  'full length mirror': '全身镜',
};

function findKeyword(s) {
  let best = null;
  for (const k of NOTE_KEYWORDS) {
    const i = s.indexOf(k);
    if (i < 0) continue;
    if (!best || i < best.i || (i === best.i && k.length > best.k.length)) best = { k, i };
  }
  return best ? best.k : '';
}

const sentenceCase = (s) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

/** 多行文字按阅读顺序拼接：中文与中文之间不加空格 */
export function joinLines(lines) {
  let out = '';
  for (const raw of lines) {
    const l = String(raw ?? '').trim();
    if (!l) continue;
    if (!out) out = l;
    // 两边都是中文 → 直接接（中文折行）；中文接英文 / 英文接英文 → 空一格（'客厅' + 'LIVING AREA'）
    else if (isCJKChar(out[out.length - 1]) && isCJKChar(l[0])) out += l;
    else out += ` ${l}`;
  }
  return normalizeText(out);
}

/**
 * 一条备注（若干行）→ { label, text } | null
 *   ['door closer hydraulic','hidden door','液压闭门器,配反弹器'] → { label:'隐形门 · Hidden door', text:'液压闭门器，配反弹器' }
 *   ['* 开门方式：免拉手']   → { label:'开门方式', text:'免拉手' }
 *   ['2个抽屉']             → { label:'抽屉', text:'2 个抽屉' }
 */
export function parseNoteText(lines) {
  const arr = (Array.isArray(lines) ? lines : String(lines ?? '').split('\n')).map((l) => cleanLine(l)).filter(Boolean);
  if (!arr.length) return null;
  const latin = arr.filter((l) => !hasHan(l) && /[A-Za-z]{2,}/.test(l));
  const zhLines = arr.filter((l) => hasHan(l));
  const strip = (t) => t.replace(/^[\s*※•·\-–—]+/, '').replace(/[\s，,。.；;、:：]+$/, '').trim();
  let text = strip(joinLines(zhLines));
  if (!text) {
    const lat = strip(latin.join(' '));
    if (lat.replace(/[^A-Za-z]/g, '').length < 3) return null;
    return { label: '设计说明', text: lat, via: 'generic' };
  }
  if (text.replace(/[^㐀-鿿A-Za-z0-9]/g, '').length < 2) return null;

  // 英文术语 → 「中文 · English」作标签
  for (const l of latin) {
    const zh = NOTE_TERMS_EN[l.toLowerCase().replace(/\s+/g, ' ').trim()];
    if (zh && zh.length <= 4 && !/闭门器|反弹器/.test(zh)) {
      return { label: `${zh} · ${sentenceCase(l.trim())}`, text: pangu(text), via: 'term' };
    }
  }
  let label = '';
  let via = 'keyword';
  const colon = /^([^：:，,]{1,8})[：:](.+)$/.exec(text);
  const advise = /^(建议|注意|备注|提示|说明)(?:[：:，,]|用)?(.+)$/.exec(text);
  const lead = /^([^，,：:]{2,5})[，,](.+)$/.exec(text);
  if (colon) {
    label = colon[1].trim();
    text = colon[2].trim();
    via = 'colon';
  } else if (advise) {
    label = advise[1];
    text = advise[2].trim();
    via = 'colon';
  } else if (lead && NOTE_KEYWORDS.includes(lead[1])) {
    label = lead[1];
    text = lead[2].trim();
    via = 'lead';
  } else {
    const kw = findKeyword(text.slice(0, 7)) || findKeyword(text);
    label = kw && kw !== text ? kw : '设计说明';
    if (label === '设计说明') via = 'generic';
  }
  text = pangu(strip(text));
  if (!text) return null;
  // via：标签怎么来的（term 英文术语 / colon「标签：内容」/ lead「隐形门，…」/ keyword 关键词 / generic）
  return { label: pangu(label), text, via };
}

// ---------------------------------------------------------------------------
// 文件名：'2026.8.6 Muar - Mr Lau - GF  L1.pdf' → { date:'2026 · 08', location:'Muar', client:'Mr Lau' }
// ---------------------------------------------------------------------------

const HONORIFIC = /^(mr|mrs|ms|miss|mdm|madam|dr|dato'?|datin|datuk|tan sri|puan|encik|en\.?|tuan)\b\.?|(先生|女士|小姐|太太|夫人)$/i;

const isFloorish = (p) =>
  /^(?:(?:G\/?F|[1-6]F|L[0-5]|LG|B[1-3]|RF|ROOF|一楼|二楼|三楼|四楼|全屋|3D|设计图|方案|效果图|final|v\d+|rev\s*\d*|r\d+|copy|副本)[\s&+,、]*)+$/i.test(p.replace(/\s+/g, ' ').trim());

/** 'D:20260807171604+08'00'' / Date → '2026 · 08' */
export function formatPdfDate(v) {
  if (!v) return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getFullYear()} · ${String(v.getMonth() + 1).padStart(2, '0')}`;
  const m = /(?:D:)?(\d{4})(\d{2})/.exec(String(v));
  if (!m) return '';
  const mm = Number(m[2]);
  if (mm < 1 || mm > 12) return '';
  return `${m[1]} · ${m[2]}`;
}

/** 'Muar - Mr Lau' → { location:'Muar', client:'Mr Lau' }（找不到客户返回空） */
export function parseClientLine(str) {
  const parts = cleanLine(str)
    .split(/\s+[-–—|｜·]\s+|\s*[|｜]\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !isFloorish(p));
  const clientIdx = parts.findIndex((p) => HONORIFIC.test(p));
  if (clientIdx >= 0) {
    const rest = parts.filter((_, i) => i !== clientIdx);
    return { client: parts[clientIdx], location: rest[0] || '' };
  }
  if (parts.length >= 2) return { location: parts[0], client: parts[1] };
  return { location: '', client: '' };
}

export function parseFileName(name) {
  const out = { date: '', location: '', client: '' };
  let s = String(name ?? '').trim();
  if (!s) return out;
  s = s.replace(/^.*[\\/]/, '').replace(/\.pdf$/i, '');
  // 上传时加的哈希前缀：'5e430e16-' / 'a1b2c3d4_'
  s = s.replace(/^(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{6,32}[-_]/i, '');
  s = s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const dm = /^(\d{4})[.\-/年](\d{1,2})(?:[.\-/月](\d{1,2})日?)?\s*/.exec(s) || /^(\d{4})(\d{2})(\d{2})(?!\d)\s*/.exec(s);
  if (dm) {
    const mm = Number(dm[2]);
    if (mm >= 1 && mm <= 12) out.date = `${dm[1]} · ${String(mm).padStart(2, '0')}`;
    s = s.slice(dm[0].length).replace(/^[-–—\s]+/, '');
  }
  const { location, client } = parseClientLine(s);
  out.location = location;
  out.client = client;
  return out;
}
