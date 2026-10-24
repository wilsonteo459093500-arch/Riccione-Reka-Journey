// 照片的主色：Lab 色彩空间里做 k-means（k = 3），再归到配对用的「色系」。
// 色系和雷区（flow.js NOGO_COLORS）同一套词：white beige grey black darkwood pink green blue yellow red，
// 外加 wood（浅 / 中等木色 —— 雷区不排它，但挑材质、标题要用）。材质的颜色用同一个函数分类，所以照片和材质对得上。
// 这个文件没有写死任何颜色，也不 import 别的文件（它在 worker 里跑）；材质色的比较在 build.js（主线程）。

const lin = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const LIN = new Float32Array(256).map((_, i) => lin(i));
const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** sRGB（0–255）→ CIELAB（D65） */
export function rgbToLab(r, g, b) {
  const R = LIN[r | 0];
  const G = LIN[g | 0];
  const B = LIN[b | 0];
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const fx = f(X);
  const fy = f(Y);
  const fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIELAB → sRGB（0–255，夹在范围里）：界面上画色点用 */
export function labToRgb(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const X = inv(fx) * 0.95047;
  const Y = inv(fy);
  const Z = inv(fz) * 1.08883;
  const R = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  const G = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  const B = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  const gam = (c) => Math.round(255 * Math.max(0, Math.min(1, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));
  return [gam(R), gam(G), gam(B)];
}

export const deltaE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/** 可重复的小随机数（k-means 初始化用：同一张图永远得到同样的结果） */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * k-means（Lab）。px：Float32Array [L,a,b, L,a,b, …]。→ [{ lab:[L,a,b], share }]（按占比从大到小）
 * k-means++ 初始化（固定种子），最多 10 轮。
 */
export function kmeansLab(px, k = 3, { iters = 10, seed = 7 } = {}) {
  const n = Math.floor(px.length / 3);
  if (!n) return [];
  const rand = rng(seed);
  const cent = [];
  const first = Math.floor(rand() * n);
  cent.push([px[first * 3], px[first * 3 + 1], px[first * 3 + 2]]);
  const d2 = new Float32Array(n);
  while (cent.length < Math.min(k, n)) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      let best = Infinity;
      for (const c of cent) {
        const dl = px[i * 3] - c[0];
        const da = px[i * 3 + 1] - c[1];
        const db = px[i * 3 + 2] - c[2];
        const d = dl * dl + da * da + db * db;
        if (d < best) best = d;
      }
      d2[i] = best;
      sum += best;
    }
    if (sum <= 0) break;
    let r = rand() * sum;
    let pick = n - 1;
    for (let i = 0; i < n; i++) {
      r -= d2[i];
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    cent.push([px[pick * 3], px[pick * 3 + 1], px[pick * 3 + 2]]);
  }
  const K = cent.length;
  const lab = new Int32Array(n);
  for (let it = 0; it < iters; it++) {
    const acc = Array.from({ length: K }, () => [0, 0, 0, 0]);
    let moved = 0;
    for (let i = 0; i < n; i++) {
      let bi = 0;
      let bd = Infinity;
      for (let j = 0; j < K; j++) {
        const c = cent[j];
        const dl = px[i * 3] - c[0];
        const da = px[i * 3 + 1] - c[1];
        const db = px[i * 3 + 2] - c[2];
        const d = dl * dl + da * da + db * db;
        if (d < bd) {
          bd = d;
          bi = j;
        }
      }
      if (lab[i] !== bi) moved++;
      lab[i] = bi;
      const a = acc[bi];
      a[0] += px[i * 3];
      a[1] += px[i * 3 + 1];
      a[2] += px[i * 3 + 2];
      a[3]++;
    }
    for (let j = 0; j < K; j++) if (acc[j][3]) cent[j] = [acc[j][0] / acc[j][3], acc[j][1] / acc[j][3], acc[j][2] / acc[j][3]];
    if (it > 0 && moved === 0) break;
  }
  const count = new Array(K).fill(0);
  for (let i = 0; i < n; i++) count[lab[i]]++;
  return cent
    .map((c, j) => ({ lab: c.map((v) => Math.round(v * 10) / 10), share: Math.round((count[j] / n) * 1000) / 1000 }))
    .filter((c) => c.share > 0)
    .sort((a, b) => b.share - a.share);
}

/** 一个 Lab 颜色属于哪个色系（雷区的词 + wood） */
export function familyOfLab([L, a, b]) {
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  if (C < 8) return L >= 86 ? 'white' : L <= 25 ? 'black' : 'grey';
  if (L <= 18) return 'black';
  if (h >= 20 && h < 95) {
    if (h < 56 && C >= 35 && L >= 45 && L < 70) return 'red'; // 陶土、铁锈（樱桃木、干邑皮更暗 → 深木色）
    if (L < 48) return C < 12 ? 'grey' : 'darkwood'; // 胡桃、烟熏橡、樱桃
    if (L >= 76 && C < 24) return L >= 90 && C < 11 ? 'white' : 'beige'; // 奶油、燕麦、洞石
    if (h >= 72 && C >= 40) return 'yellow'; // 赭黄、金
    if (C < 13) return 'grey';
    return 'wood';
  }
  if (h >= 95 && h < 200) return 'green';
  if (h >= 200 && h < 290) return 'blue';
  return L > 65 ? 'pink' : 'red';
}

/**
 * 一组照片的主色（每张 3 个，带占比；照片可以加权）→ { families:{ id: weight }（加起来 = 1）, swatches:[{ lab, share, family }] }
 * swatches = 合并相近颜色（ΔE < 10）后最大的几个，界面上画色点。
 */
export function paletteOf(photos, { max = 5 } = {}) {
  const fam = {};
  const sw = [];
  let total = 0;
  for (const p of photos) {
    const w = p.weight ?? 1;
    for (const c of p.colours || []) {
      const s = c.share * w;
      if (!(s > 0)) continue;
      total += s;
      const id = familyOfLab(c.lab);
      fam[id] = (fam[id] || 0) + s;
      const near = sw.find((x) => deltaE(x.lab, c.lab) < 10);
      if (near) {
        const t = near.share + s;
        near.lab = near.lab.map((v, i) => (v * near.share + c.lab[i] * s) / t);
        near.share = t;
      } else sw.push({ lab: [...c.lab], share: s });
    }
  }
  if (!total) return { families: {}, swatches: [] };
  for (const k of Object.keys(fam)) fam[k] = Math.round((fam[k] / total) * 1000) / 1000;
  const swatches = sw
    .sort((a, b) => b.share - a.share)
    .slice(0, max)
    .map((x) => ({ lab: x.lab.map((v) => Math.round(v * 10) / 10), share: Math.round((x.share / total) * 1000) / 1000, family: familyOfLab(x.lab) }));
  return { families: fam, swatches };
}

/** 照片主色和某个颜色（Lab）有多像（0–1）：按占比加权的 exp(−ΔE / 18) */
export function matchScore(swatches, lab) {
  if (!lab) return 0;
  let s = 0;
  for (const c of swatches) s += c.share * Math.exp(-deltaE(c.lab, lab) / 18);
  return s;
}

/** CSS 颜色（界面上的色点；颜色来自照片本身，不是写死的） */
export const cssOfLab = (lab) => {
  const [r, g, b] = labToRgb(...lab);
  return `rgb(${r} ${g} ${b})`;
};
