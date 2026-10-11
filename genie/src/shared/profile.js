// 梦想家档案（Dreamer Profile）—— 占卜的结果，也是 3D 工作室的输入。
// 纯函数：计分、收纳尺寸换算、设计师谈话提示、雷区替换材质、编码成链接。Node 里可测。

import { AXES, HIDDEN_AXES, DREAMERS, codeOf, dreamerOf } from './dreamers.js';
import { MATERIALS, MAT_BY_ID, SLOTS, fits } from './materials.js';
import { tagsOf } from './moods.js';

export const PROFILE_VERSION = 1;

/** 秒选阈值：快于这个 = 系统 1 很确定；慢于 SLOW = 在犹豫 */
export const QUICK_MS = 1600;
export const SLOW_MS = 3500;

const tanhPct = (sum, k = 4.5) => {
  const p = Math.round(50 + 50 * Math.tanh(sum / k));
  return p === 50 ? 51 : p;
};

/**
 * 把答案算成轴分数。
 * answers.pairs: { [pairId]: { pick:'a'|'b', ms:number } }
 * answers.life:  { [id]: v | v[] }
 * answers.ratio: 0–100（看得见的比例）
 */
export function scoreAxes(answers, { PAIRS = [], LIFE = [] } = {}) {
  const sum = { temp: 0, density: 0, texture: 0, storage: 0, light: 0, curve: 0, social: 0 };
  const add = (fx, w = 1) => {
    for (const [k, v] of Object.entries(fx || {})) if (k in sum) sum[k] += v * w;
  };
  for (const p of PAIRS) {
    const a = answers?.pairs?.[p.id];
    if (!a) continue;
    const w = a.ms < QUICK_MS ? 1.25 : a.ms > SLOW_MS ? 0.8 : 1;
    add(p.fx[a.pick], w);
  }
  for (const l of LIFE) {
    const v = answers?.life?.[l.id];
    if (v == null || !l.fx) continue;
    for (const one of [].concat(v)) add(l.fx[one]);
  }
  if (typeof answers?.ratio === 'number') sum.storage += (50 - answers.ratio) / 22;
  const avoid = new Set(answers?.avoid || []);
  if (avoid.has('openshelf')) sum.storage += 1;
  if (avoid.has('glassdoor')) sum.storage += 0.4;

  const axes = {};
  for (const ax of AXES) axes[ax.id] = tanhPct(sum[ax.id]);
  const hidden = {};
  for (const ax of HIDDEN_AXES) hidden[ax.id] = tanhPct(sum[ax.id], 2.5);
  return { axes, hidden };
}

const roundTo = (x, step) => Math.round(x / step) * step;

const WARDROBE_FIT = { roomy: 0.9, ok: 1, full: 1.4, double: 2 };
const LONG_SHARE = { few: 0.15, some: 0.3, many: 0.45 };

/** 数量 → 柜子尺寸（mm）。设计师拿去直接用，客人看了觉得「被认真对待」 */
export function storagePlan(s = {}, APPLIANCES = []) {
  const shoes = Math.max(0, Number(s.shoes) || 0);
  // 鞋柜：每 300mm 宽一列（2100 高、350 深）约放 10 双（含高筒靴余量）
  const shoeCabinetMM = shoes ? Math.max(600, Math.ceil(shoes / 10) * 300) : 0;

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
  const counterMM = apps.filter((a) => !a.tall && !a.under).reduce((t, a) => t + a.w, 0);
  const tallUnits = apps.filter((a) => a.tall).length;
  const bulky = (s.bulky || []).length;

  return {
    shoes,
    shoeCabinetMM,
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

/** 雷区：把含有被排除标签的材质，换成同一表面里最接近、又不踩雷的那个 */
export function avoidMaterials(materials, avoid = []) {
  const bad = new Set(avoid);
  if (!bad.size) return { materials: { ...materials }, swaps: [] };
  const out = { ...materials };
  const swaps = [];
  for (const slot of SLOTS) {
    const cur = MAT_BY_ID[out[slot.id]];
    if (!cur) continue;
    const curTags = tagsOf(cur);
    if (![...curTags].some((t) => bad.has(t))) continue;
    let best = null;
    let bestD = Infinity;
    for (const cand of MATERIALS) {
      if (!fits(cand.id, slot.id) || cand.id === cur.id) continue;
      if ([...tagsOf(cand)].some((t) => bad.has(t))) continue;
      const d =
        cur.mood.reduce((t, v, i) => t + (v - cand.mood[i]) ** 2, 0) +
        (cur.warm - cand.warm) ** 2 * 0.6 +
        (cur.light - cand.light) ** 2 * 1.2 +
        (cur.cat === cand.cat ? 0 : 0.5);
      if (d < bestD) {
        bestD = d;
        best = cand;
      }
    }
    if (best) {
      swaps.push({ slot: slot.id, from: cur.id, to: best.id });
      out[slot.id] = best.id;
    }
  }
  return { materials: out, swaps };
}

/** 设计师谈话提示：把答案里的矛盾、风险、机会，翻译成见面时该问 / 该提的话 */
export function insights(p, plan) {
  const out = [];
  const who = new Set(p.life?.who || []);
  const wishes = p.wishes || [];
  const avoid = new Set(p.avoid || []);
  const display = (p.axes?.storage ?? 50) < 50;
  const mats = p.materials || {};
  const say = (level, text) => out.push({ level, text });

  if (display && wishes.includes('clean'))
    say('conflict', '想展示，又怕积灰：建议玻璃门展示柜 + 柜内灯带，开放层板只留视线高度的一组。');
  if (p.life?.cook === 'heavy')
    say(
      (p.hidden?.social ?? 50) > 55 || (p.answers?.pairs?.kitchen?.pick === 'b') ? 'conflict' : 'note',
      (p.hidden?.social ?? 50) > 55
        ? '天天爆炒，又喜欢开放热闹：建议干湿分区 —— 湿厨房闭合（玻璃趟门），干厨房 / 岛台开放给客人。烟机风量 ≥ 1000 m³/h。'
        : '天天爆炒：湿厨房建议闭合，台面选耐油污的岩板 / 石英石，吊柜做到顶防积油。'
    );
  if (who.has('dog') || who.has('cat')) {
    const soft = ['upholstery'].map((s) => MAT_BY_ID[mats[s]]).filter((m) => m && /velvet|boucle/.test(m.tex.type));
    say(soft.length ? 'conflict' : 'note', `有毛孩子：地板选耐刮表面，${soft.length ? '沙发避开丝绒 / 羊羔绒（勾丝、粘毛），改科技布或皮革；' : ''}柜体底部做踢脚封板，${who.has('cat') ? '猫咪的猫爬架可以并进书墙。' : '狗狗的窝和牵绳挂钩放玄关。'}`);
  }
  if (who.has('baby') || who.has('kids')) {
    const hasMarble = ['countertop', 'floor'].some((s) => MAT_BY_ID[mats[s]]?.tex.type === 'marble');
    say('note', `有小孩：柜体圆角、低位做闭合柜收玩具${hasMarble ? '，浅色大理石台面易渗污要提前说明保养' : ''}；孩子身高的开放格可以做成「玩具图书馆」。`);
  }
  if (who.has('elder')) say('note', '长辈同住：主通道 ≥ 900mm，浴室防滑与扶手，夜间感应地脚灯。');
  if (who.has('wfh')) say('note', '在家办公：书桌 ≥ 1200 宽、桌面照度 500 lx、预留网络与插座；视频背景可以做成展示墙。');
  if (who.has('altar')) say('note', '需要神台：先确认方位与尺寸（通常面向大门 / 不背厕所），预留红灯与插座，台面选耐熏的材质。');
  if (plan?.shoes >= 60) say('note', `鞋量大（约 ${plan.shoes} 双）：玄关做顶天立地鞋柜约 ${plan.shoeCabinetMM}mm 宽，中段留空当置物台，底部悬空放常穿的鞋。`);
  if (p.storage?.wardrobeFit === 'full' || p.storage?.wardrobeFit === 'double')
    say('note', `衣柜目标宽度约 ${plan?.wardrobeMM}mm。主卧墙面不够的话，考虑走入式衣帽间或次卧改衣帽间。`);
  if ((plan?.bookshelfMM || 0) >= 8000) say('note', '书很多：书墙层板跨度 ≤ 800mm、板厚 ≥ 25mm 防下垂，最上层放不常看的。');
  if (plan?.needsStoreroom) say('note', '大件多：建议预留储物间，或一组 600 深的通高柜放行李箱、吸尘器、换季棉被。');
  if (plan?.applianceTallCabinet) say('note', `嵌入式电器 ${plan.tallUnits} 台：建议一组电器高柜，台面家电区约 ${plan.counterMM}mm。`);

  const wl = [mats.walls, mats.floor].map((id) => MAT_BY_ID[id]?.light ?? 0.5);
  const avgLight = (wl[0] + wl[1]) / 2;
  if ((p.hidden?.light ?? 50) > 65 && avgLight < 0.4)
    say('conflict', '选了深色系，但又很想要明亮：深色只用在主题墙 / 柜体，大面积墙面保持浅色，再用 3000K 洗墙灯补层次。');
  if ((p.hidden?.light ?? 50) < 35 && wishes.includes('light'))
    say('conflict', '喜欢暗暗的氛围，却许愿「阳光满屋」：白天要光、晚上要暗 —— 方案用可调光 + 双层窗帘解决。');
  if (wishes.includes('health')) say('note', '重视健康：板材建议 E0 / ENF 级，现场说明封边工艺与检测报告。');
  if (wishes.includes('value')) say('tip', '预算敏感：用「好 / 更好 / 最好」三档报价，让客人自己选，而不是一次给一个大数字。');
  if (p.splurge) {
    const label = { kitchen: '厨房', wardrobe: '主卧衣柜', tvwall: '客厅电视墙', bath: '浴室', floor: '全屋地板', lighting: '灯光' }[p.splurge];
    if (label) say('tip', `最舍得花钱的地方：${label} —— 方案的亮点和升级选项放在这里。`);
  }
  if (avoid.has('openshelf') && display) say('conflict', '想展示，但讨厌开放层板：展示全部用玻璃门，或做「藏中有展」的局部壁龛。');

  const quick = Object.values(p.answers?.pairs || {}).filter((a) => a.ms < QUICK_MS).length;
  const slow = Object.values(p.answers?.pairs || {}).filter((a) => a.ms > SLOW_MS).length;
  const n = Object.keys(p.answers?.pairs || {}).length || 1;
  if (quick / n >= 0.6) say('tip', `TA 是直觉型（${quick}/${n} 题秒选）：提案给 2 个方向就好，选项太多反而会犹豫。`);
  else if (slow / n >= 0.4) say('tip', `TA 会仔细比较（${slow}/${n} 题想了很久）：准备材质实样、尺寸和价格对比表，让 TA 慢慢看。`);
  if (p.players === 'couple' || p.players === 'family')
    say('tip', '不只一个人做决定：在 3D 工作室里切换两种情绪给大家比较，问「哪一个更像你们的家」。');
  return out;
}

/** 由答案组装完整档案 */
export function buildProfile(answers, meta = {}, flow = {}) {
  const { axes, hidden } = scoreAxes(answers, flow);
  const code = codeOf(axes);
  const dreamer = dreamerOf(axes);
  const avoid = answers.avoid || [];
  const { materials, swaps } = avoidMaterials(dreamer.materials, avoid);
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
  const profile = {
    v: PROFILE_VERSION,
    id: meta.id || `G${Date.now().toString(36).toUpperCase()}`,
    createdAt: meta.createdAt || new Date().toISOString(),
    name: (answers.name || '').trim(),
    players: answers.players || 'solo',
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
    materials,
    swaps,
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

/** 链接里只放需要的（不放每题的反应时间细节，链接短一点） */
export function slimProfile(p) {
  const { answers, ...rest } = p;
  const pairs = {};
  for (const [k, v] of Object.entries(answers?.pairs || {})) pairs[k] = { pick: v.pick, ms: Math.round(v.ms / 100) * 100 };
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
