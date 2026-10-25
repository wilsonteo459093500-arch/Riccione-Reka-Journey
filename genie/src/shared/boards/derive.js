// 溪岸板材 · 从量出来的颜色 / 图像统计算出 3D 工作室要的数字（纯函数，Node + 浏览器 + worker；SPEC §3.4 + §8 R2 / R5）。
//
//   · light / warm / mood：在现有的程序化材质上拟合出来的公式（design/exp/fitwarm.mjs、fitmood.mjs：light rmse 0.034、mood rmse 0.058），
//     所以板材和程序化材质在情绪仪表、梦想家配色、雷区替换里是同一把尺。
//   · tags：雷区标签（深木色、灰、黑、白、米黄、粉、绿、蓝、黄、红、亮面、大理石纹、水泥、藤编）—— 规则和 moods.js / colorTags.js 一样。
//   · kind：文件名 / 目录先说了算，像素只决定没名字的（R2）；size：一张图盖住多大（R5，不问设计师）。

import { COLOR_TAGS, CHROMATIC } from '../colorTags.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;

// ───────────────────────── 颜色 ─────────────────────────

export const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const linToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.max(0, c) ** (1 / 2.4) - 0.055);

export function hexRgb(hex) {
  const h = String(hex || '').replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [128, 128, 128];
}
export const rgbHex = (r, g, b) => `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** 线性光的 RGB（0–1）→ Lab（D65） */
export function linLab(r, g, b) {
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
export function hexLab(hex) {
  const [r, g, b] = hexRgb(hex).map((v) => srgbToLin(v / 255));
  return linLab(r, g, b);
}

/** CIEDE2000 */
export function dE00([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = (Math.atan2(b1, a1p) * deg + 360) % 360;
  const h2p = (Math.atan2(b2, a2p) * deg + 360) % 360;
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = h2p - h1p;
  if (C1p * C2p === 0) dhp = 0;
  else if (dhp > 180) dhp -= 360;
  else if (dhp < -180) dhp += 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) hbp = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + 360) / 2 : (h1p + h2p) / 2;
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const SL = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const SC = 1 + 0.045 * Cbp;
  const SH = 1 + 0.015 * Cbp * T;
  const RT = -2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hbp - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH));
}

// ───────────────────────── 情绪数字（拟合在程序化材质上） ─────────────────────────

export const FIT = {
  light: { wood: [-0.13, 1.136], solid: [-0.157, 1.138] },
  warm: { wood: [0.014, 1.222, 0.476], solid: [-0.074, 0.601, 1.485] },
  mood: { cozy: [0.084, 1.804, 0.181, -1.778, 0.556], bright: [-0.093, 0.831, 0.01, 0.353, -0.193], moody: [1.17, -2.062, -0.157, 0.898, -0.004] },
};
export const FINISH_ROUGH = { matte: 0.62, softtouch: 0.72, satin: 0.45, gloss: 0.2 };

/** 量出来的平均色 → { lab, light, warm, mood, rough }。木纹用木头的公式；纯色 / 石纹 / 编织用漆的 */
export function deriveNumbers({ hex, kind, finish = 'matte' }) {
  const lab = hexLab(hex);
  const [L, a, b] = lab;
  const k = kind === 'wood' ? 'wood' : 'solid';
  const light = clamp(FIT.light[k][0] + (FIT.light[k][1] * L) / 100);
  const warm = clamp(FIT.warm[k][0] + (FIT.warm[k][1] * a) / 50 + (FIT.warm[k][2] * b) / 50, -1, 1);
  const F = [1, light, warm, light * light, light * warm];
  const mood = ['cozy', 'bright', 'moody'].map((m) => r2(clamp(FIT.mood[m].reduce((s, c, i) => s + c * F[i], 0))));
  return { lab: lab.map(r1), light: r2(light), warm: r2(warm), mood, rough: FINISH_ROUGH[finish] ?? 0.62 };
}

// ───────────────────────── 雷区标签 ─────────────────────────

function hsl(hex) {
  const [r, g, b] = hexRgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

/** 一个颜色的色系（雷区的颜色词；木头只有「深木色」）。Lab 判，比 HSL 准（雾粉不会变成「红」，浅橡木不会变成「黄」） */
export function colourFamily(lab, kind) {
  const [L, a, b] = lab;
  const C = Math.hypot(a, b);
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  if (kind === 'wood') return null;
  if (C < 5) return L >= 88 ? 'white' : null;
  if (h >= 95 && h < 215) return 'green';
  if (h >= 215 && h < 300) return 'blue';
  if (h >= 300 || h < 20) return L > 62 ? 'pink' : 'red';
  // 暖色（20°–95°）：陶土 / 铁锈 → 红；雾粉（a ≈ b）→ 粉；浅的 → 米黄；很艳的 → 黄
  if (C >= 30 && h < 62 && L < 72) return 'red';
  if (h < 58 && C >= 9 && L > 62) return 'pink';
  if (L >= 60 && C < 30) return 'beige';
  if (C >= 40) return 'yellow';
  return null;
}

/**
 * 名字只有中文（诗意名字：深松、晓山白…）时，英文界面在后面补一个看得懂的说明：
 * 目录的 look（「纯色; pure white, flat」→ Pure white）优先，没有就按量出来的颜色（Light wood / Grey stone / Sage-green …）。
 */
export function lookWords(look) {
  const s = String(look || '');
  if (!s || /number only|no swatch/i.test(s)) return '';
  const part = (s.includes(';') ? s.split(';').pop() : s).split(/[,，(]/)[0].trim();
  if (!/^[A-Za-z][A-Za-z\s\-']*$/.test(part)) return '';
  const words = part.split(/\s+/).slice(0, 4).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
export function colourWord(hex, kind) {
  const lab = hexLab(hex);
  const [L, a, b] = lab;
  const C = Math.hypot(a, b);
  if (kind === 'wood' || kind === 'weave') {
    const tone = L >= 68 ? 'Light' : L <= 38 ? 'Dark' : 'Mid-tone';
    const what = kind === 'weave' ? 'weave' : 'wood';
    return C < 9 ? `${tone} grey ${what}` : `${tone} ${what}`;
  }
  const fam = colourFamily(lab, kind);
  const shade = L < 22 ? 'Black' : C < 5 ? (L >= 88 ? 'White' : L >= 65 ? 'Light grey' : L <= 38 ? 'Dark grey' : 'Grey') : null;
  const hue = { green: 'green', blue: 'blue', pink: 'pink', red: 'terracotta red', yellow: 'yellow' }[fam];
  const word = hue ? (L < 40 ? `Deep ${hue}` : L > 68 ? `Pale ${hue}` : hue.charAt(0).toUpperCase() + hue.slice(1)) : fam ? { white: 'White', beige: 'Beige' }[fam] : shade || (L >= 65 ? 'Light warm grey' : 'Warm grey');
  return kind === 'stone' ? `${word} stone` : word;
}

/**
 * 雷区标签（moods.js tagsOf 对板材直接用这一组）：
 *   灰 / 黑按明度（和程序化一样：HSL l < 0.2 = 黑；饱和度 < 0.12 且 0.2–0.88 = 灰）；木头只有深木色（light < 0.4）；
 *   别的按 Lab 色系；亮光 = 亮面；石纹 = 水泥感（目录写大理石的 = 大理石纹）；藤编 = 藤编。
 */
export function tagsFor({ hex, lab, kind, finish = 'matte', light, series = '', look = '' }) {
  const tags = new Set();
  const { s, l } = hsl(hex);
  const L = lab || hexLab(hex);
  if (l < 0.2) tags.add('black');
  if (s < 0.12 && l >= 0.2 && l <= 0.88) tags.add('grey');
  if (kind === 'wood') {
    if ((light ?? deriveNumbers({ hex, kind }).light) < 0.4) tags.add('darkwood');
  } else {
    const fam = colourFamily(L, kind);
    if (fam) tags.add(fam);
  }
  if (finish === 'gloss') tags.add('glossy');
  if (kind === 'stone') {
    if (/marble|大理/i.test(look)) tags.add('marble');
    else if (!/travertine|洞石/i.test(look)) tags.add('concrete');
  }
  if (kind === 'weave' && /藤/.test(series + look)) tags.add('rattan');
  return [...tags];
}

// ───────────────────────── 是什么板（R2） ─────────────────────────

/** 像素的门槛（5 张真样板 + 6 张合成：11/11） */
export const KIND_RULE = { weavePeriodic: 0.6, weaveLstd: 5, woodCoh: 0.55, solidLstd: 4, solidCoh: 0.35 };

/**
 * 只看像素：weave（行和列都有 ≤ 40 px 的周期、对比够）→ wood（有方向的纹）→ solid（平、没方向）→ ask（员工选）
 * stats：{ Lstd, LstdFine, cohOverview, cohFine, perRows, perCols }
 */
export function kindFromPixels(st) {
  const coh = Math.max(st.cohOverview ?? 0, st.cohFine ?? 0);
  const Ls = Math.max(st.Lstd ?? 0, st.LstdFine ?? 0);
  if ((st.perRows ?? 0) >= KIND_RULE.weavePeriodic && (st.perCols ?? 0) >= KIND_RULE.weavePeriodic && Ls >= KIND_RULE.weaveLstd) return 'weave';
  if (coh >= KIND_RULE.woodCoh) return 'wood';
  if (Ls < KIND_RULE.solidLstd && coh < KIND_RULE.solidCoh) return 'solid';
  return 'ask';
}

/**
 * 决定类别：目录（按编号对上的）> 文件名的 strong 词（树种、纹理、色号、织系列…）> 像素（够肯定的）> 文件名的 weak 词 > 员工选（ask）。
 * @returns {{ kind: 'wood'|'solid'|'stone'|'weave'|'ask', by: 'catalog'|'name'|'pixels'|'hint'|'ask', pixels }}
 */
export function decideKind({ catalogKind = null, hint = null, hintStrength = null, stats = null } = {}) {
  const px = stats ? kindFromPixels(stats) : 'ask';
  if (catalogKind) return { kind: catalogKind, by: 'catalog', pixels: px };
  if (hint && hintStrength === 'strong') return { kind: hint, by: 'name', pixels: px };
  if (px !== 'ask') {
    // 名字说石纹、像素说平的：石纹（石纹颗粒板常常很平）
    if (hint === 'stone' && px === 'solid') return { kind: 'stone', by: 'hint', pixels: px };
    return { kind: px, by: 'pixels', pixels: px };
  }
  if (hint) return { kind: hint, by: 'hint', pixels: px };
  return { kind: 'ask', by: 'ask', pixels: px };
}

/** 纹的方向（结构张量给的角度：0° = 横，90° = 竖）→ 存的时候要不要转 90°（R3：一律顺纹竖放） */
export function grainDir(deg) {
  const d = ((deg % 180) + 180) % 180;
  if (d < 35 || d > 145) return 'h';
  if (d > 55 && d < 125) return 'v';
  return 'diag';
}

// ───────────────────────── 一张图盖住多大（R5） ─────────────────────────

export const SIZE_RULE = { board: 2440, small: 1220, min: 1000, max: 2800, aspect: 1.2, solid: [600, 600], weaveMmPerRepeat: 2, batchMin: 3, batchTol: 0.1 };

/**
 * 同一批里「整张板」的像素密度（px/mm）：≥ 3 张整板（长宽比 ≥ 1.2 的木纹 / 石纹）的长边像素差不多（±10 %）才算；否则 null。
 * rows：[{ kind, w, h }]（裁过、转过以后的像素）
 */
export function batchDensity(rows) {
  const longs = rows
    .filter((r) => (r.kind === 'wood' || r.kind === 'stone') && Math.max(r.w, r.h) / Math.max(1, Math.min(r.w, r.h)) >= SIZE_RULE.aspect)
    .map((r) => Math.max(r.w, r.h))
    .sort((a, b) => a - b);
  if (longs.length < SIZE_RULE.batchMin) return null;
  let best = [];
  for (const c of longs) {
    const grp = longs.filter((x) => Math.abs(x - c) <= c * SIZE_RULE.batchTol);
    if (grp.length > best.length) best = grp;
  }
  if (best.length < SIZE_RULE.batchMin) return null;
  const med = best[Math.floor(best.length / 2)];
  return med / SIZE_RULE.board;
}

/**
 * 这张图（顺纹竖放：w = 横纹，h = 顺纹）盖住的真实尺寸 → { mm: [across, along], rule, flag }
 *   木纹 / 石纹：长宽比 ≥ 1.2 → 长边 2440 mm，短边 = 2440 / 长宽比（一个 px/mm，纹不会被拉长）；
 *               长宽比 < 1.2 → 同一批整板的密度（够 3 张）否则长边 1220；长边夹在 1000–2800（超出只记一个不出声的 flag）
 *   纯色：600 × 600；编织：每个斜纹周期 2 mm
 */
export function sizeOf({ kind, w, h, density = null, period = null }) {
  w = Math.max(1, w | 0);
  h = Math.max(1, h | 0);
  if (kind === 'solid' || kind === 'ask') return { mm: [...SIZE_RULE.solid], rule: 'solid', flag: false };
  if (kind === 'weave') {
    // period = 自相关量出来的一个完整循环（两次「压 / 挑」= 两个半周期；s26 是 12 / 16 px）；
    // R5 的 2 mm 是按半个周期（一次压挑，s26 ≈ 7–8 px）定的 → s26 盖住 ≈ 290 × 400 mm（A4 左右的小样）
    const mmPerPx = period > 2 ? SIZE_RULE.weaveMmPerRepeat / (period / 2) : 0.25;
    return { mm: [Math.round(w * mmPerPx), Math.round(h * mmPerPx)], rule: 'weave', flag: false };
  }
  const long = Math.max(w, h);
  const asp = long / Math.min(w, h);
  let mmPerPx;
  let rule;
  if (asp >= SIZE_RULE.aspect) {
    mmPerPx = SIZE_RULE.board / long;
    rule = 'aspect';
  } else if (density) {
    mmPerPx = 1 / density;
    rule = 'batch';
  } else {
    mmPerPx = SIZE_RULE.small / long;
    rule = 'long-1220';
  }
  let longMm = long * mmPerPx;
  const flag = longMm < SIZE_RULE.min - 0.5 || longMm > SIZE_RULE.max + 0.5;
  const k = clamp(longMm, SIZE_RULE.min, SIZE_RULE.max) / longMm;
  mmPerPx *= k;
  longMm *= k;
  return { mm: [Math.round(w * mmPerPx), Math.round(h * mmPerPx)], rule, flag };
}

// ───────────────────────── 最接近的程序化材质 ─────────────────────────

/** 不能凭空多出来的色系：有色相的（和 toBoards / nearestSafe 一样；near 进 case.materials，案例的雷区标签跟着它算） */
const NEAR_GUARD = CHROMATIC;

/**
 * 最接近的程序化材质（near：旧版本 / 手机 / 测验的案例配对用它代替这块板，R11 a）→ { id, dE } | null
 *   · 同一个类别：木 ↔ 木（编织也找木）；纯色 ↔ 漆；石纹 ↔ 石（cats 可以改：柜体也用的石纹板 → 漆，柜体放不了石材）
 *   · 不要拼花（人字拼只是地板的铺法，柜门不是）
 *   · 不多出这块板没有的色相（和 toBoards / nearestSafe 一样）；这块板有色相（墨绿 2810）→ 先在同一个色相里找（鼠尾草 / 橄榄，不是炭灰）
 *   · 木纹认得树种（proc：橡 / 胡桃 / 樱桃 …）→ 先在同一种树里找（灰橡 → 灰调橡木，不是胡桃），差太远（> 8 ΔE）才放开
 * opts.tags = 这块板的雷区标签（tagsFor）；不给就从颜色算
 */
export function nearestProcedural(lab, kind, materials, { proc = null, tags = null, cats = null } = {}) {
  const want = cats || (kind === 'stone' ? ['stone'] : kind === 'solid' ? ['paint'] : ['wood']);
  const pool = (materials || []).filter((m) => want.includes(m.cat) && !m.tex?.pattern && !m.board);
  if (!pool.length) return null;
  const fam = new Set((tags || (kind === 'wood' || kind === 'weave' ? [] : [colourFamily(lab, kind)])).filter((x) => NEAR_GUARD.includes(x)));
  const famOf = (m) => (COLOR_TAGS[m.id] || []).filter((x) => NEAR_GUARD.includes(x));
  let cand = pool.filter((m) => famOf(m).every((x) => fam.has(x)));
  if (!cand.length) cand = pool;
  const hue = [...fam].filter((x) => CHROMATIC.includes(x));
  if (hue.length) {
    const same = cand.filter((m) => famOf(m).some((x) => hue.includes(x)));
    if (same.length) cand = same;
  }
  const bestOf = (list) => {
    let best = null;
    for (const m of list) {
      const d = dE00(lab, hexLab(m.color));
      if (!best || d < best.d) best = { id: m.id, d };
    }
    return best;
  };
  let best = bestOf(cand);
  if (proc && best) {
    const sp = bestOf(cand.filter((m) => m.tex?.species === proc));
    if (sp && sp.d <= best.d + 8) best = sp;
  }
  return best ? { id: best.id, dE: r1(best.d) } : null;
}
