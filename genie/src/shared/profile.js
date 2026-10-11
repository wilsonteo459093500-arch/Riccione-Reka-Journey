// 梦想家档案（Dreamer Profile）—— 占卜的结果，也是 3D 工作室的输入。
// 纯函数：计分、收纳尺寸换算、设计师谈话提示、雷区 / 生活方式替换材质、编码成链接。Node 里可测。
// 给人看的句子都过 t()：中文模式原样返回，英文模式查 i18n/en-*.js（有插值的写成 {0} 占位）。

import { AXES, HIDDEN_AXES, DREAMERS, codeOf, dreamerOf } from './dreamers.js';
import { MATERIALS, MAT_BY_ID, SLOTS, SLOT_BY_ID, fits } from './materials.js';
import { tagsOf } from './moods.js';
import { COLOR_FAMILIES, CHROMATIC, SHADES } from './colorTags.js';
import { t, L, isEn } from './i18n.js';

export const PROFILE_VERSION = 1;

/** 秒选阈值：快于这个 = 系统 1 很确定；慢于 SLOW = 在犹豫（只在一个人玩时用来给答案加权） */
export const QUICK_MS = 1600;
export const SLOW_MS = 3500;

/** 和客人自己比：快于中位数 × QUICK_REL = 明显比平常快；慢于中位数 × SLOW_REL = 明显比平常想得久 */
export const QUICK_REL = 0.7;
export const SLOW_REL = 1.5;

const tanhPct = (sum, k = 4.5) => {
  const p = Math.round(50 + 50 * Math.tanh(sum / k));
  return p === 50 ? 51 : p;
};

const isSolo = (players) => (players || 'solo') === 'solo';

/**
 * 把答案算成轴分数。
 * answers.pairs:   { [pairId]: { pick:'a'|'b', ms:number, left? } }
 * answers.life:    { [id]: v | v[] }
 * answers.ratio:   0–100（看得见的比例）；answers.ratioTouched === false = 滑杆没碰过，不计分
 * answers.players: 'solo' | 'couple' | 'family' —— 反应时间只在一个人玩时加权
 */
export function scoreAxes(answers, { PAIRS = [], LIFE = [] } = {}) {
  const sum = { temp: 0, density: 0, texture: 0, storage: 0, light: 0, curve: 0, social: 0 };
  const add = (fx, w = 1) => {
    for (const [k, v] of Object.entries(fx || {})) if (k in sum) sum[k] += v * w;
  };
  // 两个人 / 一家人边商量边选：慢是在讨论，不是犹豫 —— 不加权
  const solo = isSolo(answers?.players);
  for (const p of PAIRS) {
    const a = answers?.pairs?.[p.id];
    if (!a) continue;
    const w = !solo ? 1 : a.ms < QUICK_MS ? 1.25 : a.ms > SLOW_MS ? 0.8 : 1;
    add(p.fx[a.pick], w);
  }
  for (const l of LIFE) {
    const v = answers?.life?.[l.id];
    if (v == null || !l.fx) continue;
    for (const one of [].concat(v)) add(l.fx[one]);
  }
  // 藏 / 展滑杆：客人真的拖过才计分（没碰过的默认值不该替客人投「藏」一票）
  if (typeof answers?.ratio === 'number' && answers.ratioTouched !== false) sum.storage += (50 - answers.ratio) / 22;
  const avoid = new Set(answers?.avoid || []);
  if (avoid.has('openshelf')) sum.storage += 1;
  if (avoid.has('glassdoor')) sum.storage += 0.4;

  const axes = {};
  for (const ax of AXES) axes[ax.id] = tanhPct(sum[ax.id]);
  const hidden = {};
  for (const ax of HIDDEN_AXES) hidden[ax.id] = tanhPct(sum[ax.id], 2.5);
  return { axes, hidden };
}

/**
 * 反应时间和客人自己的中位数比（第 1 题还在熟悉玩法，不算）。
 * → { median, n, quick: [{ id, pick, ms }]（最快的在前）, slow: [{ id, pick, ms }]（最慢的在前） }
 */
export function reactionStats(pairs) {
  const list = Object.entries(pairs || {})
    .slice(1)
    .filter(([, a]) => a && Number.isFinite(a.ms));
  const n = list.length;
  const none = { median: 0, n, quick: [], slow: [] };
  if (n < 3) return none;
  const sorted = list.map(([, a]) => a.ms).sort((x, y) => x - y);
  const median = n % 2 ? sorted[n >> 1] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  if (!(median > 0)) return none;
  const row = ([id, a]) => ({ id, pick: a.pick, ms: a.ms });
  return {
    median,
    n,
    quick: list.filter(([, a]) => a.ms < QUICK_REL * median).map(row).sort((x, y) => x.ms - y.ms),
    slow: list.filter(([, a]) => a.ms > SLOW_REL * median).map(row).sort((x, y) => y.ms - x.ms),
  };
}

/** 蓝图「选得最快的几题（参考）」：只在一个人玩时有，最多 5 题，最快的在前 → [{ id, pick }] */
export function quickPicksOf(p) {
  if (Array.isArray(p?.quickPicks)) return p.quickPicks;
  if (!isSolo(p?.players)) return [];
  return reactionStats(p?.answers?.pairs)
    .quick.slice(0, 5)
    .map(({ id, pick }) => ({ id, pick }));
}

const roundTo = (x, step) => Math.round(x / step) * step;

const WARDROBE_FIT = { roomy: 0.9, ok: 1, full: 1.4, double: 2 };
const LONG_SHARE = { few: 0.15, some: 0.3, many: 0.45 };

/** 数量 → 柜子尺寸（mm）。设计师拿去直接用，客人看了觉得「被认真对待」 */
export function storagePlan(s = {}, APPLIANCES = []) {
  const shoes = Math.max(0, Number(s.shoes) || 0);
  // 鞋柜：每 300mm 宽一列（2100 高、350 深）约放 10 双（含高筒靴余量）
  const shoeCabinetMM = shoes ? Math.max(600, Math.ceil(shoes / 10) * 300) : 0;
  // 中段留空当置物台的话，每列只剩约 7 双
  const shoeNicheMM = shoes ? Math.max(600, Math.ceil(shoes / 7) * 300) : 0;

  const doors = Math.max(0, Number(s.wardrobeDoors) || 0);
  const mult = WARDROBE_FIT[s.wardrobeFit] ?? 1;
  const wardrobeMM = doors ? roundTo(doors * 450 * mult, 50) : 0;
  const longShare = LONG_SHARE[s.longHang] ?? 0.25;
  const hangMM = Math.round(wardrobeMM * 0.6);
  const longHangMM = roundTo(hangMM * longShare, 50);
  const shortHangMM = roundTo(hangMM - longHangMM, 50);
  const foldMM = roundTo(wardrobeMM - hangMM, 50);

  const books = Math.max(0, Number(s.books) || 0);
  const bookshelfMM = books * 800;

  const apps = (s.appliances || []).map((v) => APPLIANCES.find((a) => a.v === v)).filter(Boolean);
  const counterMM = apps.filter((a) => !a.tall && !a.under).reduce((sum, a) => sum + a.w, 0);
  const tallUnits = apps.filter((a) => a.tall).length;
  const bulky = (s.bulky || []).length;

  return {
    shoes,
    shoeCabinetMM,
    shoeNicheMM,
    wardrobeMM,
    longHangMM,
    shortHangMM,
    foldMM,
    bookshelfMM,
    applianceCount: apps.length,
    counterMM,
    tallUnits,
    applianceTallCabinet: tallUnits >= 2,
    bulky,
    needsStoreroom: bulky >= 4,
    displayPct: typeof s.ratio === 'number' ? s.ratio : 25,
  };
}

// ───────────────────────── 换材质（雷区 / 生活方式） ─────────────────────────

const COLOR_SET = new Set(COLOR_FAMILIES);
const CHROMA_SET = new Set(CHROMATIC);
const SHADE_SET = new Set(SHADES);
const colorsOf = (tags) => new Set([...tags].filter((x) => COLOR_SET.has(x)));
const hasFamily = (colors) => [...colors].some((x) => !SHADE_SET.has(x));

const matDist = (a, b) =>
  a.mood.reduce((sum, v, i) => sum + (v - b.mood[i]) ** 2, 0) +
  (a.warm - b.warm) ** 2 * 0.6 +
  (a.light - b.light) ** 2 * 1.2 +
  (a.cat === b.cat ? 0 : 0.5);

/**
 * 同一表面里最接近 cur、又不带任何 bad 标签的材质（accept 可以再加条件）。
 * 颜色规矩（先严后松，严的找不到才放宽）：
 *   ① 完全没有颜色的材质（浅色木头、水磨石、皮革、藤编、古铜…）不换成有色系的（colorTags.js 里登记的白、米黄、粉…深木色）；
 *      灰 / 黑只是深浅，可以；
 *   ② 换上去的材质不能多出原来没有的色相（避开米黄 → 换成白，不会换成雾粉）。
 */
function nearestSafe(cur, slotId, bad, accept = () => true) {
  const curColors = colorsOf(tagsOf(cur));
  const plain = curColors.size === 0;
  const rules = [
    (cc) => !(plain && hasFamily(cc)) && [...cc].every((x) => !CHROMA_SET.has(x) || curColors.has(x)),
    (cc) => !(plain && hasFamily(cc)),
    () => true,
  ];
  for (const rule of rules) {
    let best = null;
    let bestD = Infinity;
    for (const cand of MATERIALS) {
      if (cand.id === cur.id || !fits(cand.id, slotId) || !accept(cand)) continue;
      const tags = tagsOf(cand);
      if ([...tags].some((x) => bad.has(x)) || !rule(colorsOf(tags))) continue;
      const d = matDist(cur, cand);
      if (d < bestD) {
        bestD = d;
        best = cand;
      }
    }
    if (best) return best;
  }
  return null;
}

/** 雷区：把含有被排除标签的材质，换成同一表面里最接近、又不踩雷的那个（颜色规矩见 nearestSafe） */
export function avoidMaterials(materials, avoid = []) {
  const bad = new Set(avoid);
  if (!bad.size) return { materials: { ...materials }, swaps: [] };
  const out = { ...materials };
  const swaps = [];
  for (const slot of SLOTS) {
    const cur = MAT_BY_ID[out[slot.id]];
    if (!cur || ![...tagsOf(cur)].some((x) => bad.has(x))) continue;
    const best = nearestSafe(cur, slot.id, bad);
    if (best) {
      swaps.push({ slot: slot.id, from: cur.id, to: best.id });
      out[slot.id] = best.id;
    }
  }
  return { materials: out, swaps };
}

const SNAGS = new Set(['velvet', 'boucle']);
const PET_SAFE = new Set(['linen', 'leather', 'felt']);
/** 生活方式替换的原因（中文原文存进档案，显示时过 t()） */
export const PET_REASON = '有毛孩子：丝绒 / 羊羔绒易勾丝粘毛';

/**
 * 生活方式替换：材质和客人自己的生活答案打架时换掉。在雷区之后做，仍然避开雷区；
 * 不算雷区 —— 客人版不要写进「已按你的雷区避开」，设计师版列出来。
 * 有猫狗 → 沙发软包、点缀的丝绒 / 羊羔绒换成最接近的亚麻、皮革或毛毡。
 * （台面：天天爆炒 / 有小孩时把洞石、大理石换成石英石 —— 要等材质库有石英石，暂不做。）
 * → { materials, swaps: [{ slot, from, to, reason, why }] }
 */
export function lifestyleSwaps(materials, answers = {}) {
  const out = { ...materials };
  const swaps = [];
  const who = new Set(answers.life?.who || []);
  const bad = new Set(answers.avoid || []);
  if (who.has('dog') || who.has('cat')) {
    for (const slot of ['upholstery', 'accents']) {
      const cur = MAT_BY_ID[out[slot]];
      if (!cur || !SNAGS.has(cur.tex.type)) continue;
      const best = nearestSafe(cur, slot, bad, (c) => PET_SAFE.has(c.tex.type));
      if (best) {
        swaps.push({ slot, from: cur.id, to: best.id, reason: PET_REASON, why: 'pets' });
        out[slot] = best.id;
      }
    }
  }
  return { materials: out, swaps };
}

// ───────────────────────── 设计师谈话提示 ─────────────────────────

const SPLURGE_LABEL = { kitchen: '厨房', wardrobe: '主卧衣柜', tvwall: '客厅电视墙', bath: '浴室', floor: '全屋地板', lighting: '灯光' };

/**
 * 设计师谈话提示：把答案里的矛盾、风险、机会，翻译成见面时该问 / 该提的话。
 * level：conflict 要聊清楚 · note 设计要点 · tip 沟通建议（只给设计师看，不进客人看得到的地方）
 */
export function insights(p, plan) {
  const out = [];
  const who = new Set(p.life?.who || []);
  const wishes = p.wishes || [];
  const avoid = new Set(p.avoid || []);
  const bulky = new Set(p.storage?.bulky || []);
  const display = (p.axes?.storage ?? 50) < 50;
  const mats = p.materials || {};
  const say = (level, text) => out.push({ level, text });
  const list = (arr) => arr.join(isEn() ? ', ' : '、');

  if (display && wishes.includes('clean'))
    say('conflict', t('想展示，又怕积灰：建议玻璃门展示柜 + 柜内灯带，开放层板只留视线高度的一组。'));
  if (p.life?.cook === 'heavy') {
    const social = (p.hidden?.social ?? 50) > 55;
    say(
      social || p.answers?.pairs?.kitchen?.pick === 'b' ? 'conflict' : 'note',
      social
        ? t('天天爆炒，又喜欢开放热闹：建议干湿分区 —— 湿厨房闭合（玻璃趟门），干厨房 / 岛台开放给客人。烟机风量 ≥ 1000 m³/h。')
        : t('天天爆炒：湿厨房建议闭合，台面选耐油污的岩板 / 石英石，吊柜做到顶防积油。')
    );
  }
  if (who.has('dog') || who.has('cat')) {
    const soft = ['upholstery'].map((s) => MAT_BY_ID[mats[s]]).filter((m) => m && SNAGS.has(m.tex.type));
    const swapped = (p.lifeSwaps || []).filter((s) => s.why === 'pets');
    const sofa = soft.length
      ? t('沙发避开丝绒 / 羊羔绒（勾丝、粘毛），改科技布或皮革；')
      : swapped.length
        ? t('丝绒 / 羊羔绒已经换掉（{0}），防勾丝、粘毛；', [list(swapped.map((s) => `${L(SLOT_BY_ID[s.slot])} → ${L(MAT_BY_ID[s.to])}`))])
        : '';
    const corner = who.has('cat') ? t('猫咪的猫爬架可以并进书墙。') : t('狗狗的窝和牵绳挂钩放玄关。');
    say(soft.length ? 'conflict' : 'note', t('有毛孩子：地板选耐刮表面，{0}柜体底部做踢脚封板，{1}', [sofa, corner]));
  }
  if (who.has('baby') || who.has('kids')) {
    const porous = ['countertop', 'floor'].some((s) => ['marble', 'travertine'].includes(MAT_BY_ID[mats[s]]?.tex.type));
    const care = porous ? t('，大理石 / 洞石台面怕酸易渗色（青柠、亚参、酱油），要提前说明保养') : '';
    say('note', t('有小孩：柜体圆角、低位做闭合柜收玩具{0}；孩子身高的开放格可以做成「玩具图书馆」。', [care]));
  }
  if (who.has('teen')) say('note', t('有青少年：衣柜按成人 1.8 m 起、书桌 ≥1.2 m'));
  if (who.has('elder')) say('note', t('长辈同住：主通道 ≥ 900mm，浴室防滑与扶手，夜间感应地脚灯。'));
  if (who.has('helper')) say('note', t('有帮佣：保姆房（单人床＋600 衣柜＋通风）、靠近湿厨房 / 晒衣处、独立厕所；问清楚平时谁下厨'));
  if (who.has('guests')) say('note', t('常有客人留宿：客房或书房做榻榻米 / 沙发床，预留被褥收纳'));
  if (who.has('wfh')) say('note', t('在家办公：书桌 ≥ 1200 宽、桌面照度 500 lx、预留网络与插座；视频背景可以做成展示墙。'));
  if (who.has('altar')) say('note', t('需要神台：先确认方位与尺寸（通常面向大门 / 不背厕所），预留红灯与插座，台面选耐熏的材质。'));
  if (plan?.shoes >= 60)
    say('note', t('鞋量大（约 {0} 双）：玄关做顶天立地鞋柜约 {1}mm 宽（留中段置物台的话约 {2}mm），底部悬空放常穿的鞋。', [plan.shoes, plan.shoeCabinetMM, plan.shoeNicheMM]));
  if (p.storage?.wardrobeFit === 'full' || p.storage?.wardrobeFit === 'double')
    say('note', t('衣柜目标宽度约 {0}mm。主卧墙面不够的话，考虑走入式衣帽间或次卧改衣帽间。', [plan?.wardrobeMM]));
  if ((plan?.bookshelfMM || 0) >= 8000) say('note', t('书很多：书墙层板跨度 ≤ 800mm、板厚 ≥ 25mm 防下垂，最上层放不常看的。'));
  if (plan?.needsStoreroom) say('note', t('大件多：建议预留储物间，或一组 600 深的通高柜放行李箱、吸尘器、换季棉被。'));
  if (bulky.has('festive')) say('note', t('年货 / 柑 / 节庆装饰预留一组 600 深通高柜；团圆饭 8–10 人建议可伸缩圆桌＋折叠椅收纳'));
  if (plan?.applianceTallCabinet) say('note', t('嵌入式电器 {0} 台：建议一组电器高柜，台面家电区约 {1}mm。', [plan.tallUnits, plan.counterMM]));

  const wl = [mats.walls, mats.floor].map((id) => MAT_BY_ID[id]?.light ?? 0.5);
  const avgLight = (wl[0] + wl[1]) / 2;
  if ((p.hidden?.light ?? 50) > 65 && avgLight < 0.4)
    say('conflict', t('选了深色系，但又很想要明亮：深色只用在主题墙 / 柜体，大面积墙面保持浅色，再用 3000K 洗墙灯补层次。'));
  if ((p.hidden?.light ?? 50) < 35 && wishes.includes('light'))
    say('conflict', t('喜欢暗暗的氛围，却许愿「阳光满屋」：白天要光、晚上要暗 —— 方案用可调光 + 双层窗帘解决。'));
  if (wishes.includes('health')) say('note', t('重视健康：板材建议 E0 / ENF 级，现场说明封边工艺与检测报告。'));
  if (wishes.includes('value')) say('tip', t('重视性价比：用「好 / 更好 / 最好」三档报价，让客人自己选，而不是一次给一个大数字。'));
  const splurge = SPLURGE_LABEL[p.splurge];
  if (splurge) say('tip', t('最舍得花钱的地方：{0} —— 方案的亮点和升级选项放在这里。', [t(splurge)]));
  if (avoid.has('openshelf') && display) say('conflict', t('想展示，但讨厌开放层板：展示全部用玻璃门，或做「藏中有展」的局部壁龛。'));

  // 反应时间只是参考：只在一个人玩时说，而且只和客人自己平常的速度比（读得慢、长辈不吃亏）
  if (isSolo(p.players)) {
    const rt = reactionStats(p.answers?.pairs);
    const quick = rt.quick.length;
    const slow = rt.slow.length;
    if (rt.n >= 6 && quick / rt.n >= 1 / 3 && quick > slow)
      say('tip', t('参考：偏好快速决定（{0}/{1} 题比自己平常快很多）：提案给 2 个方向就好，选项太多反而会犹豫。', [quick, rt.n]));
    else if (rt.n >= 6 && slow / rt.n >= 0.25 && slow > quick)
      say('tip', t('参考：喜欢对比再决定（{0}/{1} 题比自己平常想得久）：准备材质实样、尺寸和价格对比表，让 TA 慢慢看。', [slow, rt.n]));
  }
  if (p.players === 'couple' || p.players === 'family')
    say('tip', t('不只一个人做决定：在 3D 工作室里切换两种情绪给大家比较，问「哪一个更像你们的家」。'));
  return out;
}

/** 宝藏那几题客人有没有真的动过（没动过 = 默认值；蓝图 / 摘要标「默认值，未确认」） */
function touchedOf(answers) {
  const raw = answers.touched;
  if (!raw || typeof raw !== 'object') return null;
  return {
    ...raw,
    shoes: !!raw.shoes,
    wardrobe: !!(raw.wardrobe || raw.wardrobeDoors || raw.wardrobeFit || raw.longHang),
    books: !!raw.books,
    // 藏 / 展滑杆：answers.ratioTouched（没有这个字段的旧答案当作动过，不乱标默认值）
    ratio: !!(raw.ratio || answers.ratioTouched === true || (raw.ratio == null && answers.ratioTouched == null)),
  };
}

/** 由答案组装完整档案 */
export function buildProfile(answers, meta = {}, flow = {}) {
  const { axes, hidden } = scoreAxes(answers, flow);
  const code = codeOf(axes);
  const dreamer = dreamerOf(axes);
  const avoid = answers.avoid || [];
  const avoided = avoidMaterials(dreamer.materials, avoid);
  const lived = lifestyleSwaps(avoided.materials, answers);
  const players = answers.players || 'solo';
  const storage = {
    shoes: answers.shoes,
    wardrobeDoors: answers.wardrobeDoors,
    wardrobeFit: answers.wardrobeFit,
    longHang: answers.longHang,
    books: answers.books,
    appliances: answers.appliances || [],
    bulky: answers.bulky || [],
    ratio: answers.ratio,
  };
  const touched = touchedOf(answers);
  if (touched) storage.touched = touched;
  const profile = {
    v: PROFILE_VERSION,
    id: meta.id || `G${Date.now().toString(36).toUpperCase()}`,
    createdAt: meta.createdAt || new Date().toISOString(),
    name: (answers.name || '').trim(),
    players,
    host: meta.host || '',
    code,
    axes,
    hidden,
    life: { ...(answers.life || {}) },
    storage,
    wishes: answers.wishes || [],
    splurge: answers.splurge || '',
    avoid,
    wish: (answers.oneWish || '').trim(),
    materials: lived.materials,
    swaps: avoided.swaps,
    lifeSwaps: lived.swaps,
    quickPicks: quickPicksOf({ players, answers: { pairs: answers.pairs } }),
    palette: dreamer.palette,
    answers: { pairs: answers.pairs || {} },
  };
  return profile;
}

// ───────────────────────── 编码成链接（#p=…） ─────────────────────────

const b64url = {
  enc(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  },
};

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

/** 任意 JSON → 链接安全的短字符串（能压缩就压缩） */
export async function packJSON(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream !== 'undefined') {
    try {
      return 'z' + b64url.enc(await pipe(bytes, new CompressionStream('deflate-raw')));
    } catch {
      /* 退回不压缩 */
    }
  }
  return 'j' + b64url.enc(bytes);
}

export async function unpackJSON(str) {
  if (!str) return null;
  const kind = str[0];
  const bytes = b64url.dec(str.slice(1));
  const raw = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}

/** 链接里只放需要的（反应时间取整到 0.1 秒，链接短一点；left = 当时哪一边在左，留着查左右偏好） */
export function slimProfile(p) {
  const { answers, ...rest } = p;
  const pairs = {};
  for (const [k, v] of Object.entries(answers?.pairs || {})) {
    const one = { pick: v.pick, ms: Math.round(v.ms / 100) * 100 };
    if (v.left != null) one.left = v.left;
    pairs[k] = one;
  }
  return { ...rest, answers: { pairs } };
}

// ───────────────────────── 本机档案（展厅 iPad / 设计师电脑） ─────────────────────────

const ARCHIVE_KEY = 'genie.profiles.v1';

export function loadArchive() {
  try {
    const list = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveToArchive(profile) {
  try {
    const list = loadArchive().filter((p) => p.id !== profile.id);
    list.unshift(profile);
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(list.slice(0, 200)));
  } catch {
    /* 存不进去（隐私模式）不影响流程 */
  }
}

export function removeFromArchive(id) {
  try {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(loadArchive().filter((p) => p.id !== id)));
  } catch {
    /* ignore */
  }
}

export function findInArchive(id) {
  return loadArchive().find((p) => p.id === id) || null;
}

export { DREAMERS };
