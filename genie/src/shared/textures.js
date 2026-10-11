// 程序化材质贴图 —— 木纹、大理石、水磨石、亚麻、羊羔绒、针织、藤编……全部用代码画，不用任何图片文件。
// 生成的贴图都是「无缝」的（可以无限平铺），并带有它覆盖的真实尺寸 size（米），
// 3D 里每个面的 UV 用米做单位，所以同一块木纹放在柜门或地板上，纹理比例都是真的。

import { MAT_BY_ID, hexToRgb } from './materials.js';
import { fbm, vnoise, hash2, rng, smooth, clamp01 } from './noise.js';

const TAU = Math.PI * 2;

/** 表面 → 这个材质用哪种排法 */
export function variantFor(mat, slotId) {
  if (!mat) return 'base';
  if (mat.cat === 'wood') {
    if (slotId === 'floor') return mat.tex.pattern === 'herringbone' ? 'herringbone' : 'plank';
    if (slotId === 'swatch') return mat.tex.pattern === 'herringbone' ? 'herringbone' : 'veneer';
    return 'veneer';
  }
  if (mat.cat === 'stone') return slotId === 'floor' || slotId === 'tile' ? 'tiled' : 'slab';
  return 'base';
}

/** 每种贴图覆盖多大（米）—— 3D 用；色卡用 swatchSize */
function sizeFor(type, variant, swatch) {
  if (swatch) {
    return (
      {
        wood: variant === 'herringbone' ? 1.6 : 0.6,
        marble: 0.9,
        travertine: 0.8,
        terrazzo: 0.5,
        concrete: 1.2,
        limewash: 1.2,
        paint: 1,
        tile: 0.6,
        linen: 0.16,
        boucle: 0.2,
        knit: 0.24,
        velvet: 0.5,
        felt: 0.4,
        leather: 0.3,
        rattan: 0.2,
        metal: 0.6,
      }[type] || 1
    );
  }
  if (type === 'wood') return variant === 'herringbone' ? 1.6 : variant === 'veneer' ? 1.2 : 2.4;
  return (
    {
      marble: variant === 'tiled' ? 1.2 : 1.8,
      travertine: 1.2,
      terrazzo: 0.8,
      concrete: 2,
      limewash: 2,
      paint: 2,
      tile: 1.2,
      linen: 0.5,
      boucle: 0.35,
      knit: 0.4,
      velvet: 1,
      felt: 0.8,
      leather: 0.6,
      rattan: 0.25,
      metal: 1,
    }[type] || 1
  );
}

const lerp = (a, b, t) => a + (b - a) * t;

function canvasOf(R) {
  const c = document.createElement('canvas');
  c.width = R;
  c.height = R;
  return c;
}

/** 逐像素着色：fn(u, v) → [r,g,b]（u/v 单位：米） */
function paintPixels(canvas, S, fn) {
  const R = canvas.width;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(R, R);
  const d = img.data;
  const out = [0, 0, 0];
  let i = 0;
  for (let y = 0; y < R; y++) {
    const v = ((y + 0.5) / R) * S;
    for (let x = 0; x < R; x++) {
      const u = ((x + 0.5) / R) * S;
      fn(u, v, out, x, y);
      d[i] = out[0];
      d[i + 1] = out[1];
      d[i + 2] = out[2];
      d[i + 3] = 255;
      i += 4;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function mixInto(out, a, b, t, k = 1) {
  out[0] = clamp255(lerp(a.r, b.r, t) * k);
  out[1] = clamp255(lerp(a.g, b.g, t) * k);
  out[2] = clamp255(lerp(a.b, b.b, t) * k);
}
const clamp255 = (x) => (x < 0 ? 0 : x > 255 ? 255 : x);

const shade = (c, k) => ({ r: clamp255(c.r * k), g: clamp255(c.g * k), b: clamp255(c.b * k) });
const css = (c, a = 1) => `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a})`;

// ───────────────────────────── 各类材质 ─────────────────────────────

function woodPlank(canvas, S, t, seed) {
  const base = hexToRgb(t.base);
  const grain = hexToRgb(t.grain);
  const rows = Math.max(4, Math.round(S / 0.19));
  const W = S / rows;
  const cols = Math.max(1, Math.round(S / 1.2));
  const L = S / cols;
  const R = canvas.width;
  const seamM = Math.max(0.0026, (S / R) * 0.9);
  paintPixels(canvas, S, (u, v, out) => {
    const row = Math.min(rows - 1, Math.floor(v / W));
    const off = hash2(row, 7, seed) * S;
    const uu = (u + off) % S;
    const col = Math.min(cols - 1, Math.floor(uu / L));
    const lu = uu - col * L;
    const lv = v - row * W;
    const pid = row * 31 + col;
    const tone = hash2(pid, 11, seed) - 0.5;
    const n = fbm((uu / S) * 6, (lv / W) * 2, 6, 1e6, 3, seed + pid);
    const ring = 0.5 + 0.5 * Math.sin(TAU * (lv * 34 + n * 2.2 + hash2(pid, 3, seed) * 4));
    const fiber = vnoise((uu / S) * 90, (lv / W) * 40, 90 * 1, 1e6, seed + 5) - 0.5;
    let g = 0.16 + 0.34 * smooth(0.45, 1, ring);
    g += fiber * 0.12;
    const d = Math.min(lv, W - lv, lu, L - lu);
    const seam = d < seamM ? 0.6 : d < seamM * 2.2 ? 0.88 : 1;
    mixInto(out, base, grain, clamp01(g), (1 + tone * 0.2) * seam);
  });
}

function woodHerringbone(canvas, S, t, seed) {
  const base = hexToRgb(t.base);
  const grain = hexToRgb(t.grain);
  const n = 4; // 长宽比 4:1
  const k = 16; // S / W，必须是 2n 的倍数才无缝
  const W = S / k;
  const R = canvas.width;
  const seam = Math.max(0.03, (S / R / W) * 0.9);
  paintPixels(canvas, S, (u, v, out) => {
    const x = u / W;
    const y = v / W;
    const a = Math.floor(x);
    const b = Math.floor(y);
    const m = (((a - b) % (2 * n)) + 2 * n) % (2 * n);
    let lu;
    let lv;
    let id;
    if (m < n) {
      const a0 = a - m;
      lu = x - a0;
      lv = y - b;
      id = hash2(((a0 % k) + k) % k, ((b % k) + k) % k, seed);
    } else {
      const b0 = b - (2 * n - 1 - m);
      lu = y - b0;
      lv = x - a;
      id = hash2(((a % k) + k) % k, ((b0 % k) + k) % k, seed + 1);
    }
    const nn = vnoise(lu * 2.5, lv * 1.5 + id * 50, 1e6, 1e6, seed + 9);
    const ring = 0.5 + 0.5 * Math.sin(TAU * (lv * 3.4 + nn * 1.8 + id * 5));
    const g = 0.16 + 0.32 * smooth(0.45, 1, ring);
    const d = Math.min(lv, 1 - lv, lu, n - lu);
    const s = d < seam ? 0.62 : d < seam * 2.2 ? 0.9 : 1;
    mixInto(out, base, grain, g, (1 + (id - 0.5) * 0.22) * s);
  });
}

function woodVeneer(canvas, S, t, seed) {
  const base = hexToRgb(t.base);
  const grain = hexToRgb(t.grain);
  const dens = Math.round(S * 38);
  paintPixels(canvas, S, (u, v, out) => {
    const n = fbm((u / S) * 3, (v / S) * 2, 3, 2, 4, seed);
    const ring = 0.5 + 0.5 * Math.sin(TAU * ((u / S) * dens + n * 3.2));
    const streak = fbm((u / S) * 40, (v / S) * 2, 40, 2, 2, seed + 3);
    const g = 0.12 + 0.3 * smooth(0.5, 1, ring) + (streak - 0.5) * 0.18;
    mixInto(out, base, grain, clamp01(g), 1 + (fbm((u / S) * 2, (v / S) * 2, 2, 2, 2, seed + 8) - 0.5) * 0.12);
  });
}

function marble(canvas, S, t, seed, tiled) {
  const base = hexToRgb(t.base);
  const vein = hexToRgb(t.vein);
  const sharp = lerp(28, 7, t.veins ?? 0.5);
  const tile = 0.6;
  paintPixels(canvas, S, (u, v, out) => {
    let tid = 0;
    if (tiled) tid = hash2(Math.floor(u / tile), Math.floor(v / tile), seed) * 6;
    const n = fbm((u / S) * 3, (v / S) * 3, 3, 3, 5, seed);
    const ph = TAU * ((u / S) * 1 + (v / S) * 2) + (n - 0.5) * 9 + tid;
    const v1 = Math.pow(1 - Math.abs(Math.sin(ph)), sharp);
    const n2 = fbm((u / S) * 5, (v / S) * 5, 5, 5, 4, seed + 4);
    const ph2 = TAU * ((u / S) * 3 - (v / S) * 1) + (n2 - 0.5) * 12 + tid * 0.7;
    const v2 = Math.pow(1 - Math.abs(Math.sin(ph2)), sharp * 1.6);
    const cloud = (fbm((u / S) * 2, (v / S) * 2, 2, 2, 4, seed + 7) - 0.5) * 0.08;
    let k = 1 + cloud;
    if (tiled) {
      const lu = u % tile;
      const lv = v % tile;
      const d = Math.min(lu, tile - lu, lv, tile - lv);
      if (d < 0.0025) k *= 0.82;
    }
    mixInto(out, base, vein, clamp01(v1 * 0.85 + v2 * 0.45), k);
  });
}

function travertine(canvas, S, t, seed, tiled) {
  const base = hexToRgb(t.base);
  const vein = hexToRgb(t.vein);
  const tile = 0.6;
  paintPixels(canvas, S, (u, v, out) => {
    const b = fbm((u / S) * 2, (v / S) * 14, 2, 14, 4, seed);
    const pit = vnoise((u / S) * 70, (v / S) * 150, 70, 150, seed + 3);
    let k = 1 + (fbm((u / S) * 6, (v / S) * 6, 6, 6, 3, seed + 5) - 0.5) * 0.08;
    if (pit > 0.88) k *= 0.82 - (pit - 0.88) * 2;
    if (tiled) {
      const lu = u % tile;
      const lv = v % (tile * 2);
      const d = Math.min(lu, tile - lu, lv, tile * 2 - lv);
      if (d < 0.0025) k *= 0.85;
    }
    mixInto(out, base, vein, smooth(0.42, 0.75, b) * 0.7, k);
  });
}

function concrete(canvas, S, t, seed) {
  const base = hexToRgb(t.base);
  const R = canvas.width;
  paintPixels(canvas, S, (u, v, out, x, y) => {
    const m = fbm((u / S) * 4, (v / S) * 4, 4, 4, 5, seed);
    const speck = hash2(x, y, seed) - 0.5;
    const k = 1 + (m - 0.5) * (t.fine ? 0.12 : 0.22) + speck * 0.05 * (R > 200 ? 1 : 0.5);
    out[0] = clamp255(base.r * k);
    out[1] = clamp255(base.g * k);
    out[2] = clamp255(base.b * k);
  });
}

function limewash(canvas, S, t, seed) {
  const base = hexToRgb(t.base);
  paintPixels(canvas, S, (u, v, out) => {
    const a = fbm((u / S) * 3, (v / S) * 3, 3, 3, 5, seed);
    const brush = fbm((u / S) * 2, (v / S) * 9, 2, 9, 3, seed + 2);
    const k = 1 + (a - 0.5) * 0.2 + (brush - 0.5) * 0.08;
    out[0] = clamp255(base.r * k);
    out[1] = clamp255(base.g * k);
    out[2] = clamp255(base.b * k);
  });
}

function paint(canvas, S, t, seed) {
  const base = hexToRgb(t.base);
  const amt = t.smooth ? 0.012 : 0.03;
  paintPixels(canvas, S, (u, v, out) => {
    const k = 1 + (fbm((u / S) * 4, (v / S) * 4, 4, 4, 3, seed) - 0.5) * amt;
    out[0] = clamp255(base.r * k);
    out[1] = clamp255(base.g * k);
    out[2] = clamp255(base.b * k);
  });
}

function tile(canvas, S, t, seed) {
  const base = hexToRgb(t.base);
  const grout = hexToRgb(t.grout);
  const tw = t.rect ? (t.size || 0.6) * 2 : t.size || 0.1;
  const th = t.size || 0.1;
  const nx = Math.max(1, Math.round(S / tw));
  const ny = Math.max(1, Math.round(S / th));
  const TW = S / nx;
  const TH = S / ny;
  const R = canvas.width;
  const gw = Math.max(0.0028, (S / R) * 1.1);
  const zellige = (t.vary || 0) > 0.05;
  paintPixels(canvas, S, (u, v, out) => {
    const j = Math.floor(v / TH);
    const shift = t.rect && j % 2 ? TW / 2 : 0;
    const uu = (u + shift) % S;
    const i = Math.floor(uu / TW);
    const lu = uu - i * TW;
    const lv = v - j * TH;
    const d = Math.min(lu, TW - lu, lv, TH - lv);
    if (d < gw) {
      out[0] = grout.r;
      out[1] = grout.g;
      out[2] = grout.b;
      return;
    }
    const tone = (hash2(i, j, seed) - 0.5) * 2 * (t.vary || 0.03);
    let k = 1 + tone;
    if (zellige) {
      const pool = fbm((lu / TW) * 3 + i * 7, (lv / TH) * 3 + j * 3, 1e6, 1e6, 3, seed + 3) - 0.5;
      const edge = smooth(0, TW * 0.18, d);
      k *= 1 + pool * 0.14 + (1 - edge) * 0.08;
    }
    out[0] = clamp255(base.r * k);
    out[1] = clamp255(base.g * k);
    out[2] = clamp255(base.b * k);
  });
}

function linen(canvas, S, t, seed) {
  const base = hexToRgb(t.base);
  const f = Math.round(S * (t.fine ? 230 : 150)) / S;
  paintPixels(canvas, S, (u, v, out) => {
    const tx = u * f;
    const ty = v * f;
    const i = Math.floor(tx);
    const j = Math.floor(ty);
    const over = (i + j) & 1;
    const fx = tx - i;
    const fy = ty - j;
    const per = Math.round(S * f);
    let prof;
    let slub;
    if (over) {
      prof = Math.sin(Math.PI * fy);
      slub = vnoise((u / S) * 12, j * 0.37, 12, 1e6, seed + 1);
    } else {
      prof = Math.sin(Math.PI * fx);
      slub = vnoise(i * 0.37, (v / S) * 12, 1e6, 12, seed + 2);
    }
    void per;
    const k = 0.8 + 0.2 * prof + (slub - 0.5) * 0.16 + (fbm((u / S) * 3, (v / S) * 3, 3, 3, 2, seed) - 0.5) * 0.05;
    out[0] = clamp255(base.r * k);
    out[1] = clamp255(base.g * k);
    out[2] = clamp255(base.b * k);
  });
}

function velvet(canvas, S, t, seed) {
  const base = hexToRgb(t.base);
  paintPixels(canvas, S, (u, v, out, x, y) => {
    const k = 1 + (fbm((u / S) * 3, (v / S) * 3, 3, 3, 4, seed) - 0.5) * 0.12 + (hash2(x, y, seed) - 0.5) * 0.03;
    out[0] = clamp255(base.r * k);
    out[1] = clamp255(base.g * k);
    out[2] = clamp255(base.b * k);
  });
}

function felt(canvas, S, t, seed) {
  const base = hexToRgb(t.base);
  paintPixels(canvas, S, (u, v, out, x, y) => {
    const k =
      1 +
      (fbm((u / S) * 5, (v / S) * 5, 5, 5, 4, seed) - 0.5) * 0.1 +
      (vnoise((u / S) * 120, (v / S) * 120, 120, 120, seed + 1) - 0.5) * 0.12 +
      (hash2(x, y, seed) - 0.5) * 0.06;
    out[0] = clamp255(base.r * k);
    out[1] = clamp255(base.g * k);
    out[2] = clamp255(base.b * k);
  });
}

function leather(canvas, S, t, seed) {
  const base = hexToRgb(t.base);
  paintPixels(canvas, S, (u, v, out) => {
    const p = fbm((u / S) * 36, (v / S) * 36, 36, 36, 2, seed);
    const crease = smooth(0.42, 0.5, p) * (1 - smooth(0.5, 0.58, p));
    const k = 1 + (p - 0.5) * 0.14 - crease * 0.12 + (fbm((u / S) * 2, (v / S) * 2, 2, 2, 3, seed + 3) - 0.5) * 0.14;
    out[0] = clamp255(base.r * k);
    out[1] = clamp255(base.g * k);
    out[2] = clamp255(base.b * k);
  });
}

function metal(canvas, S, t, seed) {
  const base = hexToRgb(t.base);
  paintPixels(canvas, S, (u, v, out) => {
    const k = 1 + (fbm((u / S) * 2, (v / S) * 160, 2, 160, 2, seed) - 0.5) * 0.14;
    out[0] = clamp255(base.r * k);
    out[1] = clamp255(base.g * k);
    out[2] = clamp255(base.b * k);
  });
}

/** 画在四周也画一份，保证无缝 */
function wrapped(R, x, y, r, draw) {
  for (const dx of [-R, 0, R]) {
    for (const dy of [-R, 0, R]) {
      if (x + dx + r < 0 || x + dx - r > R || y + dy + r < 0 || y + dy - r > R) continue;
      draw(x + dx, y + dy);
    }
  }
}

function terrazzo(canvas, S, t, seed) {
  concrete(canvas, S, { base: t.base, fine: true }, seed);
  const R = canvas.width;
  const ctx = canvas.getContext('2d');
  const rand = rng(seed + 11);
  const chips = (t.chips || ['#999']).map(hexToRgb);
  const count = Math.round((S * S) * 900);
  for (let i = 0; i < count; i++) {
    const x = rand() * R;
    const y = rand() * R;
    const sz = ((0.004 + Math.pow(rand(), 2.4) * 0.03) / S) * R;
    const col = chips[Math.floor(rand() * chips.length)];
    const sides = 5 + Math.floor(rand() * 3);
    const rot = rand() * TAU;
    const pts = [];
    for (let k = 0; k < sides; k++) {
      const a = rot + (k / sides) * TAU;
      const rr = sz * (0.6 + rand() * 0.5);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    ctx.fillStyle = css(shade(col, 0.92 + rand() * 0.16));
    wrapped(R, x, y, sz * 1.2, (cx, cy) => {
      ctx.beginPath();
      pts.forEach(([px, py], k) => (k ? ctx.lineTo(cx + px, cy + py) : ctx.moveTo(cx + px, cy + py)));
      ctx.closePath();
      ctx.fill();
    });
  }
}

function boucle(canvas, S, t, seed) {
  felt(canvas, S, { base: t.base }, seed);
  const R = canvas.width;
  const ctx = canvas.getContext('2d');
  const base = hexToRgb(t.base);
  const rand = rng(seed + 5);
  const loopR = (0.0032 / S) * R;
  const count = Math.round(((S * S) / (0.0045 * 0.0045)) * 0.9);
  ctx.lineWidth = Math.max(0.8, loopR * 0.45);
  for (let i = 0; i < count; i++) {
    const x = rand() * R;
    const y = rand() * R;
    const r = loopR * (0.7 + rand() * 0.6);
    const light = rand() > 0.45;
    ctx.strokeStyle = css(shade(base, light ? 1.08 + rand() * 0.06 : 0.82 + rand() * 0.06), 0.9);
    wrapped(R, x, y, r + 2, (cx, cy) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, rand() * TAU, rand() * TAU + 4.4);
      ctx.stroke();
    });
  }
}

function knit(canvas, S, t, seed) {
  const R = canvas.width;
  const ctx = canvas.getContext('2d');
  const base = hexToRgb(t.base);
  ctx.fillStyle = css(shade(base, 0.62));
  ctx.fillRect(0, 0, R, R);
  const cols = Math.max(4, Math.round(S / 0.022));
  const rows = Math.max(4, Math.round(S / 0.017));
  const w = R / cols;
  const h = R / rows;
  const rand = rng(seed);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * w;
      const y = j * h;
      const k = 0.94 + rand() * 0.12;
      for (const side of [-1, 1]) {
        const cx = x + w * (0.5 + side * 0.22);
        const cy = y + h * 0.5;
        const g = ctx.createRadialGradient(cx - side * w * 0.05, cy - h * 0.2, 1, cx, cy, Math.max(w, h) * 0.7);
        g.addColorStop(0, css(shade(base, 1.12 * k)));
        g.addColorStop(0.7, css(shade(base, 0.95 * k)));
        g.addColorStop(1, css(shade(base, 0.7 * k)));
        ctx.fillStyle = g;
        wrapped(R, cx, cy, h, (px, py) => {
          ctx.beginPath();
          ctx.ellipse(px, py, w * 0.27, h * 0.66, side * 0.5, 0, TAU);
          ctx.fill();
        });
      }
    }
  }
}

function rattan(canvas, S, t, seed) {
  const R = canvas.width;
  const ctx = canvas.getContext('2d');
  const base = hexToRgb(t.base);
  ctx.fillStyle = 'rgb(42,30,18)';
  ctx.fillRect(0, 0, R, R);
  const cells = Math.max(3, Math.round(S / 0.016));
  const p = R / cells;
  const lw = p * 0.16;
  ctx.lineCap = 'round';
  const strand = (x1, y1, x2, y2, k) => {
    ctx.strokeStyle = css(shade(base, 0.78 * k));
    ctx.lineWidth = lw * 1.25;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = css(shade(base, 1.08 * k));
    ctx.lineWidth = lw * 0.6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  const rand = rng(seed);
  for (let i = -1; i <= cells; i++) {
    const o = i * p;
    const k = 0.92 + rand() * 0.14;
    strand(o + p * 0.42, 0, o + p * 0.42, R, k);
    strand(o + p * 0.58, 0, o + p * 0.58, R, k);
    strand(0, o + p * 0.42, R, o + p * 0.42, k);
    strand(0, o + p * 0.58, R, o + p * 0.58, k);
  }
  for (let i = -cells; i <= cells * 2; i++) {
    const o = i * p;
    strand(o, 0, o + R, R, 0.95);
    strand(o + R, 0, o, R, 1);
  }
}

// ───────────────────────────── 入口 ─────────────────────────────

const GEN = {
  marble: (c, S, t, s, variant) => marble(c, S, t, s, variant === 'tiled'),
  travertine: (c, S, t, s, variant) => travertine(c, S, t, s, variant === 'tiled'),
  terrazzo,
  concrete,
  limewash,
  paint,
  tile,
  linen,
  boucle,
  knit,
  velvet,
  felt,
  leather,
  rattan,
  metal,
};

function seedOf(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * 生成一张贴图。
 * @returns {{ canvas: HTMLCanvasElement, size: number, rotation: number }}
 */
export function generateTexture(matId, variant = 'base', R = 512, swatch = false) {
  const mat = MAT_BY_ID[matId];
  if (!mat) throw new Error(`unknown material ${matId}`);
  const t = mat.tex;
  const S = sizeFor(t.type, variant, swatch);
  const canvas = canvasOf(R);
  const seed = seedOf(matId) % 100000;
  if (t.type === 'wood') {
    if (variant === 'herringbone') woodHerringbone(canvas, S, t, seed);
    else if (variant === 'veneer') woodVeneer(canvas, S, t, seed);
    else woodPlank(canvas, S, t, seed);
  } else {
    (GEN[t.type] || paint)(canvas, S, t, seed, variant);
  }
  return { canvas, size: S, rotation: variant === 'herringbone' && !swatch ? Math.PI / 4 : 0 };
}

const swatchCache = new Map();

/** 色卡（小方块）dataURL，带缓存；没有 DOM 时返回 null */
export function swatchURL(matId, px = 128) {
  if (typeof document === 'undefined') return null;
  const key = `${matId}@${px}`;
  if (swatchCache.has(key)) return swatchCache.get(key);
  const mat = MAT_BY_ID[matId];
  if (!mat) return null;
  const { canvas } = generateTexture(matId, variantFor(mat, 'swatch'), px, true);
  const url = canvas.toDataURL('image/jpeg', 0.86);
  swatchCache.set(key, url);
  return url;
}
