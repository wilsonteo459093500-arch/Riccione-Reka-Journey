// 潘吉 Pangie — final character art. Direction C「Premium plush 高级毛绒」, approved by the owner (「熊猫的部分C可以了」).
// A soft, volumetric plush panda genie: no hard outlines, lit top-left, glass-bead eyes, a wrapped moss-velvet turban
// pinned by an oval amber cabochon, cocoa toe-bean pads, and a mist seat whose stream-teal tail curls into a spiral
// (the lamp's smoke ends in the same spiral — see MIST_SPIRAL). Pure functions returning SVG strings: no React,
// no filters, no fonts, no external assets. Every VI colour comes from palette.js; the few colours that belong to
// the character itself live in CHAR below; every other tint is mixed from those two at load time.
//
//   pangieInner({ mood, prop, idPrefix, aura, contour, size, shadow, sparkles })
//       INNER markup (defs + groups, no outer <svg>) for <svg viewBox="0 0 200 250">. The React component keeps its
//       own <svg class="pangie pg-float …"> root and sets this as innerHTML, so poster.js svgToImage(svgEl) still works.
//     mood     idle | happy | wow | think | wink | mystic | sleepy
//     prop     ball | cards | magnifier | none
//     idPrefix every id is prefixed with it (unique per instance, e.g. from useId)
//     aura     true → the warm .pg-aura glow is on (it is opacity 0 otherwise; `.dusk .pg-aura{opacity:1}` lights it)
//     contour  'auto' (default) | true | false — the soft warm paper contour around the white head and body
//              (ink at ~32 %, 1.5 CSS px at any render size via vector-effect). 'auto' = on, and when `size` is
//              given it eases to ~24 % at hero sizes (≥ 200 px) so it stays subtle there; true = on at full
//              strength; false = off (only a faint hairline).
//     size     optional render width in CSS px (only used by contour 'auto')
//     shadow   soft ground shadow (.pg-shadow, outside .pg-figure) — default true
//     sparkles ambient twinkles — default true (mood sparkles always show)
//   pangieSVG({ …same, title, width })  full standalone <svg> (previews, tests, static exports); width also feeds `size`
//   faceInner({ idPrefix, tile })       INNER markup for <svg viewBox="0 0 64 64">: the head-only mark (favicon / avatar)
//     tile  false (default, transparent) | true (rounded square, dusk greens) | { from, to } (custom tile gradient)
//   faceSVG({ …same, title, size })     full standalone <svg> (public/icon.svg is generated from it)
//   broochSVG({ cx, cy, s, idPrefix })  the turban's amber oval cabochon in its gold bezel, self-contained — for the lamp
//   MOODS, PROPS, VIEWBOX, FACE_VIEWBOX
//   MIST_SPIRAL, spiralCentreline(), spiralTailPath() — the signature smoke-curl geometry, shared with the lamp
//
// Every pose stays inside the 200 × 250 viewBox (an inline <svg> clips at its viewBox). One call ≈ 2–3 ms and
// ≈ 32–43 KB of markup (≈ 7–9 KB gzipped): memoise per (mood, prop, aura, size bucket).
//
// Animation hooks kept from base.css: .pg-blink (each open eye group, inline transform-origin), .pg-halo (orb / prop
// glow, inline transform-origin), .pg-smoke (mist sway, inline origin), .pg-puff, .pg-twinkle + .pg-d2 / .pg-d3,
// .pg-gem-glow (the brooch in mystic), .pg-aura. New, optional: .pg-figure (everything except aura + ground
// shadow) and .pg-shadow — so a float animation can move the figure while the shadow stays on the ground.

import { PALETTE } from './palette.js';

const PG = PALETTE.pangie;

// ───────────────────────────── colours ─────────────────────────────
// Character-only colours: they belong to the panda itself, not to the VI (all VI colours come from PALETTE).
const CHAR = {
  glint: '#FFFFFF', // specular glints: eyes, nose, orb glass, sparkles
  furShade: '#D9CCB8', // warm shadow side of the white plush fur
  irisGlow: '#B98252', // amber light pooling at the bottom of the glass-bead eyes
  mouth: '#5A2A22', // inside the open mouth
  tongue: '#EE8F8F',
  blush: '#F2A49B',
  pad: '#8E5D45', // cocoa paw pads + toe beans
  wood: '#6B4B2F', // magnifier handle
};

const rgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (a) => `#${a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
/** a + (b − a)·t, per channel */
const mix = (a, b, t) => {
  const A = rgb(a);
  const B = rgb(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * t));
};
/** darken toward black by f */
const dark = (a, f) => toHex(rgb(a).map((v) => v * (1 - f)));

const V = PALETTE;
const K = {
  white: CHAR.glint,
  // white plush fur, lit → shadow
  fur: [CHAR.glint, mix(V.card, CHAR.furShade, 0.07), mix(V.card, CHAR.furShade, 0.4), mix(V.card, CHAR.furShade, 0.74), CHAR.furShade],
  furWarm: mix(CHAR.furShade, V.goldInk, 0.35),
  // black plush fur, lit → core → bounce
  blk: [mix(V.ink, V.inkSoft, 0.56), mix(V.ink, V.inkSoft, 0.22), V.ink, dark(V.ink, 0.22), mix(V.ink, V.inkSoft, 0.36)],
  blkSheen: mix(V.inkSoft, V.card, 0.35),
  blkRim: mix(V.goldL, V.inkSoft, 0.45),
  innerEar: [mix(V.ink, V.inkSoft, 0.42), mix(V.ink, V.inkSoft, 0.14), dark(V.ink, 0.06)],
  earRim: mix(V.card, V.inkSoft, 0.48),
  iris: [CHAR.irisGlow, mix(CHAR.irisGlow, PG.iris, 0.6), PG.iris, dark(PG.iris, 0.62)],
  pupil: dark(PG.iris, 0.72),
  irisRim: mix(V.goldL, V.card, 0.5),
  nose: [mix(V.ink, V.inkSoft, 0.5), mix(V.ink, V.inkSoft, 0.08), dark(V.ink, 0.36)],
  mouth: [dark(CHAR.mouth, 0.48), CHAR.mouth, mix(CHAR.mouth, CHAR.tongue, 0.14)],
  tongue: [mix(CHAR.tongue, V.card, 0.26), dark(mix(CHAR.tongue, CHAR.mouth, 0.16), 0.04)],
  pad: [mix(CHAR.pad, V.card, 0.3), CHAR.pad, dark(CHAR.pad, 0.26)],
  closedEye: mix(V.card, V.paper, 0.4),
  // moss-velvet turban
  turban: [mix(PG.turban[0], V.card, 0.34), mix(PG.turban[0], V.card, 0.1), PG.turban[0], mix(PG.turban[0], PG.turban[1], 0.62), PG.turban[1]],
  velvet: mix(PG.turban[0], V.card, 0.62),
  fold: dark(PG.turban[1], 0.42),
  foldHi: mix(PG.turban[0], V.card, 0.56),
  // gold + amber (VI)
  gold: [V.goldL, V.gold, V.goldInk],
  goldHi: mix(V.goldL, V.card, 0.6),
  goldMid: mix(V.goldL, V.gold, 0.5),
  gem: [mix(V.amber, V.card, 0.66), mix(V.amber, V.goldL, 0.28), V.amber, mix(V.amber, V.ink, 0.42)],
  // wish orb (VI dew-drop glass)
  orb: PG.ball,
  orbCore: [mix(PG.halo, V.card, 0.7), mix(PG.halo, V.goldL, 0.45), PG.halo],
  halo: [mix(PG.halo, V.card, 0.55), PG.halo],
  // mist (VI morning smoke → stream teal)
  mist: [PG.smoke[0], mix(PG.smoke[0], PG.smoke[1], 0.6), mix(PG.smoke[1], PG.ball[2], 0.58), mix(PG.ball[2], V.stream, 0.5)],
  mistHi: PG.smoke[0],
  mistPuff: PG.smoke[1],
  firefly: V.firefly,
  shadow: mix(V.ink, V.goldInk, 0.28),
  ao: mix(V.inkSoft, V.goldInk, 0.34),
  spark: mix(V.firefly, V.card, 0.72),
  sparkFill: [mix(V.goldL, V.card, 0.62), mix(V.goldL, V.gold, 0.36), V.gold],
  // props
  cardMoss: [mix(PG.turban[0], V.card, 0.1), PG.turban[1]],
  cardTeal: [mix(V.stream, V.card, 0.24), PG.ball[3]],
  cardCream: [V.card, V.paperDeep],
  lens: [CHAR.glint, mix(PG.ball[1], V.card, 0.2), PG.ball[2]],
  wood: [mix(CHAR.wood, V.gold, 0.28), CHAR.wood, dark(CHAR.wood, 0.3)],
};

// ───────────────────────────── geometry utils ─────────────────────────────
const R = (n) => Math.round(n * 100) / 100;
const R1 = (n) => Math.round(n * 10) / 10; // path coordinates: 0.1 unit ≈ 0.13 px even at 260 px
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const RAD = Math.PI / 180;
const P2 = (p) => `${R1(p[0])} ${R1(p[1])}`;

function xf(x, y, t) {
  const sx = t.sx ?? t.s ?? 1;
  const sy = t.sy ?? t.s ?? 1;
  const a = (t.rot || 0) * RAD;
  const X = x * sx;
  const Y = y * sy;
  return [R1((t.x || 0) + X * Math.cos(a) - Y * Math.sin(a)), R1((t.y || 0) + X * Math.sin(a) + Y * Math.cos(a))];
}

/** transform an absolute M/L/C/Q/Z path (number pairs only) — keeps gradients axis-aligned */
function tp(d, t) {
  return d
    .replace(/([MLCQ])([^MLCQZ]*)/g, (m, cmd, nums) => {
      const v = nums.trim().split(/[\s,]+/).filter(Boolean).map(Number);
      const out = [];
      for (let i = 0; i < v.length; i += 2) out.push(xf(v[i], v[i + 1], t).join(' '));
      return `${cmd}${out.join(' ')} `;
    })
    .trim();
}

/** ellipse as a path, wound counter-clockwise on screen (so it unions cleanly with limb tubes) */
function ell(cx, cy, rx, ry, rot = 0) {
  const k = 0.5523;
  const d = `M${rx} 0 C${rx} ${-ry * k} ${rx * k} ${-ry} 0 ${-ry} C${-rx * k} ${-ry} ${-rx} ${-ry * k} ${-rx} 0 C${-rx} ${ry * k} ${-rx * k} ${ry} 0 ${ry} C${rx * k} ${ry} ${rx} ${ry * k} ${rx} 0 Z`;
  return tp(d, { x: cx, y: cy, rot });
}

/** quadratic-midpoint smoothing through pts (current point = pts[0]); returns path segments only */
function qseg(pts) {
  let d = '';
  for (let i = 1; i < pts.length - 1; i++) {
    const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
    d += `Q${P2(pts[i])} ${P2(m)} `;
  }
  return `${d}L${P2(pts[pts.length - 1])} `;
}
/** smooth closed/open path through points */
function smooth(pts, close = true) {
  const d = `M${P2(pts[0])} ${qseg(pts)}`;
  return close ? `${d}Z` : d;
}

function bez(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}
function qbez(p0, p1, p2, t) {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
}

/** tangent-normal helpers along a sampled centreline */
function frames(cl) {
  const n = cl.length;
  const acc = [0];
  for (let i = 1; i < n; i++) acc.push(acc[i - 1] + Math.hypot(cl[i][0] - cl[i - 1][0], cl[i][1] - cl[i - 1][1]));
  const tot = acc[n - 1] || 1;
  return cl.map((p, i) => {
    const a = cl[Math.max(0, i - 1)];
    const b = cl[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    return { p, u: acc[i] / tot, tx, ty, nx: -ty, ny: tx };
  });
}

/** a soft round-ended tube along a sampled centreline; radius rf(u), u = 0…1 by arc length (wound CCW) */
function tube(cl, rf) {
  const F = frames(cl);
  const L = F.map((f) => [f.p[0] + f.nx * rf(f.u), f.p[1] + f.ny * rf(f.u)]);
  const Rt = F.map((f) => [f.p[0] - f.nx * rf(f.u), f.p[1] - f.ny * rf(f.u)]);
  const r0 = R(rf(0));
  const r1 = R(rf(1));
  return `M${P2(L[0])} ${qseg(L)}A${r1} ${r1} 0 0 0 ${P2(Rt[Rt.length - 1])} ${qseg(Rt.slice().reverse())}A${r0} ${r0} 0 0 0 ${P2(L[0])} Z`;
}

/** sample a gently bowed segment a→b (bow = sideways offset of the middle, + = left of travel) */
function bowed(a, b, bow, n = 7) {
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const c = [m[0] - (dy / l) * bow * 2, m[1] + (dx / l) * bow * 2];
  return Array.from({ length: n }, (_, i) => qbez(a, c, b, i / (n - 1)));
}

/** tapered ribbon along a centre-line (the genie smoke tail) */
function ribbon(pts, w0, w1) {
  const n = pts.length;
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const t = i / (n - 1);
    const w = (w0 + (w1 - w0) * Math.pow(t, 0.8)) / 2;
    left.push([x - ty * w, y + tx * w]);
    right.push([x + ty * w, y - tx * w]);
  }
  const e = pts[n - 1];
  const tip = [e[0] + (e[0] - pts[n - 2][0]) * 0.8, e[1] + (e[1] - pts[n - 2][1]) * 0.8];
  return smooth([...left, tip, ...right.reverse()], true);
}

/** an arc stroke hugging a circle (rim light) */
function rimArc(cx, cy, r, angDeg, spanDeg, color, w, op) {
  const a0 = (angDeg - spanDeg / 2) * RAD;
  const a1 = (angDeg + spanDeg / 2) * RAD;
  const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
  const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
  return `<path d="M${P2(p0)} A${R(r)} ${R(r)} 0 0 1 ${P2(p1)}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" fill="none" opacity="${op}"/>`;
}

/** drop gradient definitions this drawing never references (keeps every instance lean) */
function prune(svg) {
  return svg.replace(/<(linearGradient|radialGradient) id="([^"]+)"[\s\S]*?<\/\1>\n?/g, (block, tag, id) => (svg.includes(`url(#${id})`) ? block : ''));
}

const sparkPath = (x, y, s) =>
  `M${R(x)} ${R(y - s)} Q${R(x + s * 0.16)} ${R(y - s * 0.16)} ${R(x + s)} ${R(y)} Q${R(x + s * 0.16)} ${R(y + s * 0.16)} ${R(x)} ${R(y + s)} Q${R(x - s * 0.16)} ${R(y + s * 0.16)} ${R(x - s)} ${R(y)} Q${R(x - s * 0.16)} ${R(y - s * 0.16)} ${R(x)} ${R(y - s)} Z`;

// ───────────────────────────── gradients ─────────────────────────────
const stops = (list) => list.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a == null ? '' : ` stop-opacity="${a}"`}/>`).join('');
const radial = (id, attrs, list) => `<radialGradient id="${id}" ${attrs}>${stops(list)}</radialGradient>\n`;
const linear = (id, attrs, list) => `<linearGradient id="${id}" ${attrs}>${stops(list)}</linearGradient>\n`;

function defs(P) {
  const k = K;
  return `<defs>
${radial(`${P}-fur`, 'cx=".42" cy=".32" r=".74" fx=".36" fy=".22"', [[0, k.fur[0]], [0.46, k.fur[1]], [0.78, k.fur[2]], [0.93, k.fur[3]], [1, k.fur[4]]])}${linear(`${P}-rim`, 'x1=".1" y1="0" x2=".9" y2="1"', [[0, k.white, 0.95], [0.3, k.white, 0.5], [0.5, k.white, 0], [0.7, k.furWarm, 0], [1, k.furWarm, 0.5]])}${linear(`${P}-furLow`, 'x1="0" y1="0" x2="0" y2="1"', [[0.52, k.furWarm, 0], [1, k.furWarm, 0.26]])}${radial(`${P}-bloom`, 'cx=".5" cy=".5" r=".5"', [[0, k.white, 0.72], [0.55, k.white, 0.28], [1, k.white, 0]])}${radial(`${P}-blk`, 'cx=".42" cy=".34" r=".76" fx=".33" fy=".22"', [[0, k.blk[0]], [0.36, k.blk[1]], [0.76, k.blk[2]], [0.92, k.blk[3]], [1, k.blk[4]]])}${radial(`${P}-sheen`, 'cx=".5" cy=".5" r=".5"', [[0, k.white, 0.5], [1, k.white, 0]])}${radial(`${P}-innerEar`, 'cx=".45" cy=".4" r=".6"', [[0, k.innerEar[0]], [0.7, k.innerEar[1]], [1, k.innerEar[2]]])}${radial(`${P}-iris`, 'cx=".5" cy=".8" r=".78" fx=".5" fy=".9"', [[0, k.iris[0]], [0.34, k.iris[1]], [0.7, k.iris[2]], [1, k.iris[3]]])}${radial(`${P}-nose`, 'cx=".4" cy=".3" r=".75"', [[0, k.nose[0]], [0.5, k.nose[1]], [1, k.nose[2]]])}${radial(`${P}-mouth`, 'cx=".5" cy=".2" r=".9"', [[0, k.mouth[0]], [0.7, k.mouth[1]], [1, k.mouth[2]]])}${radial(`${P}-tongue`, 'cx=".45" cy=".3" r=".7"', [[0, k.tongue[0]], [1, k.tongue[1]]])}${radial(`${P}-blush`, 'cx=".5" cy=".5" r=".5"', [[0, CHAR.blush, 0.78], [0.6, CHAR.blush, 0.36], [1, CHAR.blush, 0]])}${radial(`${P}-pad`, 'cx=".38" cy=".3" r=".8"', [[0, k.pad[0]], [0.55, k.pad[1]], [1, k.pad[2]]])}${radial(`${P}-turban`, 'cx=".34" cy=".24" r=".9" fx=".3" fy=".16"', [[0, k.turban[0]], [0.3, k.turban[1]], [0.62, k.turban[2]], [0.86, k.turban[3]], [1, k.turban[4]]])}${radial(`${P}-velvet`, 'cx=".5" cy=".62" r=".58"', [[0.66, k.velvet, 0], [0.9, k.velvet, 0.2], [1, k.velvet, 0.4]])}${linear(`${P}-gold`, 'x1="0" y1="0" x2="0" y2="1"', [[0, k.goldHi], [0.45, k.gold[1]], [1, k.gold[2]]])}${linear(`${P}-goldH`, 'x1="0" y1="0" x2="1" y2="1"', [[0, k.goldHi], [0.38, k.goldMid], [0.72, k.gold[1]], [1, k.gold[2]]])}${radial(`${P}-gem`, 'cx=".38" cy=".3" r=".78"', [[0, k.gem[0]], [0.34, k.gem[1]], [0.8, k.gem[2]], [1, k.gem[3]]])}${radial(`${P}-orb`, 'cx=".4" cy=".36" r=".7" fx=".34" fy=".28"', [[0, k.orb[0]], [0.3, k.orb[1]], [0.72, k.orb[2]], [1, k.orb[3]]])}${radial(`${P}-orbCore`, 'cx=".5" cy=".5" r=".5"', [[0, k.orbCore[0], 1], [0.45, k.orbCore[1], 0.75], [1, k.orbCore[2], 0]])}${radial(`${P}-halo`, 'cx=".5" cy=".5" r=".5"', [[0, k.halo[0], 0.95], [0.45, k.halo[1], 0.55], [1, k.halo[1], 0]])}${radial(`${P}-mist`, 'gradientUnits="userSpaceOnUse" cx="96" cy="214" r="72"', [[0, k.mist[0]], [0.38, k.mist[1]], [0.7, k.mist[2]], [1, k.mist[3]]])}${radial(`${P}-aura`, 'cx=".5" cy=".5" r=".5"', [[0, k.firefly, 0.42], [0.55, k.firefly, 0.14], [1, k.firefly, 0]])}${radial(`${P}-shadow`, 'cx=".5" cy=".5" r=".5"', [[0, k.shadow, 0.26], [0.6, k.shadow, 0.1], [1, k.shadow, 0]])}${radial(`${P}-ao`, 'cx=".5" cy=".5" r=".5"', [[0, k.ao, 0.3], [1, k.ao, 0]])}${radial(`${P}-spark`, 'cx=".5" cy=".5" r=".5"', [[0, k.spark, 0.95], [0.4, k.firefly, 0.5], [1, k.firefly, 0]])}${linear(`${P}-sparkFill`, 'x1="0" y1="0" x2="1" y2="1"', [[0, k.sparkFill[0]], [0.55, k.sparkFill[1]], [1, k.sparkFill[2]]])}${linear(`${P}-cardMoss`, 'x1="0" y1="0" x2="1" y2="1"', [[0, k.cardMoss[0]], [1, k.cardMoss[1]]])}${linear(`${P}-cardTeal`, 'x1="0" y1="0" x2="1" y2="1"', [[0, k.cardTeal[0]], [1, k.cardTeal[1]]])}${linear(`${P}-cardCream`, 'x1="0" y1="0" x2="1" y2="1"', [[0, k.cardCream[0]], [1, k.cardCream[1]]])}${radial(`${P}-lens`, 'cx=".4" cy=".35" r=".75"', [[0, k.lens[0], 0.85], [0.6, k.lens[1], 0.55], [1, k.lens[2], 0.55]])}${linear(`${P}-wood`, 'x1="0" y1="0" x2="1" y2="0"', [[0, k.wood[0]], [0.45, k.wood[1]], [1, k.wood[2]]])}</defs>`;
}

// ───────────────────────────── base shapes ─────────────────────────────
const HEAD = 'M100 38 C139 38 167 62 168 97 C169 131 140 152 100 152 C60 152 31 131 32 97 C33 62 61 38 100 38 Z';
const BODY = 'M73 146 C63 157 59 173 61 189 C63 206 79 216 100 216 C121 216 137 206 139 189 C141 173 137 157 127 146 Z';
const BAND = 'M60 176 C55.6 160 61 148 74 144 C82 141.6 91 140.8 100 140.8 C109 140.8 118 141.6 126 144 C139 148 144.4 160 140 176 C131.6 167.6 117.6 161.2 100 161.2 C82.4 161.2 68.4 167.6 60 176 Z';
// soft tear-drop eye patch, narrow rounded top, full round bottom (local coords; slanted down-outward when placed)
const PATCH = 'M0 -22 C6.5 -22 11.5 -15 13.8 -6 C16.4 4 16.4 12.5 12.6 17.6 C8.6 22.6 -8.6 22.6 -12.6 17.6 C-16.4 12.5 -16.4 4 -13.8 -6 C-11.5 -15 -6.5 -22 0 -22 Z';

/** the soft paper contour + plush edge treatment for a white fur shape */
function contourStroke(d, C) {
  if (!C.on) return `<path d="${d}" fill="none" stroke="${V.ink}" stroke-opacity=".16" stroke-width=".9"/>`;
  return `<path d="${d}" fill="none" stroke="${V.ink}" stroke-opacity="${C.op}" stroke-width="${C.w}" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
}

/**
 * white plush fur: lit fill, warm low shade, a velvet rim inside the edge, fur tips catching light along the lower
 * (shadow-side) edge — irregular short bristles that fade in toward the bottom — and the paper contour.
 * `lower` is the open lower arc of the silhouette; [y0, y1] is where the fuzz fades in.
 */
function plush(d, id, P, C, bloom, lower, y0, y1) {
  return `<path d="${d}" fill="url(#${P}-fur)"/>
<path d="${d}" fill="url(#${P}-furLow)"/>
<clipPath id="${P}-${id}"><path d="${d}"/></clipPath>
<linearGradient id="${P}-${id}F" gradientUnits="userSpaceOnUse" x1="0" y1="${y0}" x2="0" y2="${y1}">${stops([[0, K.white, 0], [1, K.white, 0.42]])}</linearGradient>
<linearGradient id="${P}-${id}W" gradientUnits="userSpaceOnUse" x1="0" y1="${y0}" x2="0" y2="${y1}">${stops([[0, K.furWarm, 0], [1, K.furWarm, 0.24]])}</linearGradient>
<g clip-path="url(#${P}-${id})">
<path d="${d}" fill="none" stroke="url(#${P}-rim)" stroke-width="7"/>
<path d="${lower}" fill="none" stroke="url(#${P}-${id}W)" stroke-width="3.4" stroke-dasharray=".5 2.3 .3 1.6 .45 2.9 .35 1.9"/>
<path d="${lower}" fill="none" stroke="url(#${P}-${id}F)" stroke-width="2.6" stroke-dasharray=".4 1.3 .55 .9 .35 1.7 .5 1.1" stroke-dashoffset="1.2"/>
</g>
${bloom}
${contourStroke(d, C)}`;
}
const HEAD_LOW = 'M32 97 C31 131 60 152 100 152 C140 152 169 131 168 97';
const BODY_LOW = 'M61 189 C63 206 79 216 100 216 C121 216 137 206 139 189';

// ───────────────────────────── face ─────────────────────────────
function ear(cx, cy, r, P, side) {
  const ix = cx + (side === 'L' ? 2.5 : -2.5);
  const out = side === 'L' ? -140 : -40;
  return `<path d="${ell(cx, cy, r, r)}" fill="url(#${P}-blk)"/>
<path d="${ell(ix, cy + 2.6, r * 0.52, r * 0.5)}" fill="url(#${P}-innerEar)"/>
<path d="${ell(cx - r * 0.34, cy - r * 0.42, r * 0.36, r * 0.22, -35)}" fill="url(#${P}-sheen)" opacity=".7"/>
${rimArc(cx, cy, r - 0.9, out, 80, K.earRim, 1.3, 0.42)}`;
}

function patches(P) {
  const L = tp(PATCH, { x: 73, y: 101, rot: 31 });
  const Rr = tp(PATCH, { x: 127, y: 101, rot: -31 });
  return `<path d="${L}" fill="url(#${P}-blk)"/><path d="${Rr}" fill="url(#${P}-blk)"/>`;
}

function beadEye(cx, cy, r, P, o = {}) {
  const [lx, ly] = o.look || [0, 0];
  const W = K.white;
  const hl = o.sparkle
    ? `<ellipse cx="${R(cx - r * 0.34)}" cy="${R(cy - r * 0.38)}" rx="${R(r * 0.42)}" ry="${R(r * 0.34)}" transform="rotate(-30 ${R(cx - r * 0.34)} ${R(cy - r * 0.38)})" fill="${W}"/>
<circle cx="${R(cx + r * 0.36)}" cy="${R(cy + r * 0.3)}" r="${R(r * 0.17)}" fill="${W}"/>
<path d="${sparkPath(cx + r * 0.32, cy - r * 0.42, r * 0.26)}" fill="${W}" opacity=".95"/>`
    : `<ellipse cx="${R(cx - r * 0.34)}" cy="${R(cy - r * 0.38)}" rx="${R(r * 0.38)}" ry="${R(r * 0.29)}" transform="rotate(-30 ${R(cx - r * 0.34)} ${R(cy - r * 0.38)})" fill="${W}"/>
<circle cx="${R(cx + r * 0.36)}" cy="${R(cy + r * 0.34)}" r="${R(r * 0.14)}" fill="${W}" opacity=".9"/>`;
  return `<g class="pg-blink" style="transform-origin:${R(cx)}px ${R(cy)}px">
<circle cx="${R(cx)}" cy="${R(cy)}" r="${R(r)}" fill="url(#${P}-iris)"/>
<circle cx="${R(cx + lx)}" cy="${R(cy - r * 0.06 + ly)}" r="${R(r * 0.5)}" fill="${K.pupil}" opacity=".92"/>
<circle cx="${R(cx)}" cy="${R(cy)}" r="${R(r - 0.45)}" fill="none" stroke="${K.irisRim}" stroke-opacity=".28" stroke-width=".9"/>
${hl}
</g>`;
}

function closedEye(cx, cy, kind) {
  const col = K.closedEye;
  if (kind === 'happy') return `<path d="M${cx - 8} ${cy + 3} Q${cx} ${cy - 7.5} ${cx + 8} ${cy + 3}" stroke="${col}" stroke-width="3.3" fill="none" stroke-linecap="round"/>`;
  if (kind === 'serene') return `<path d="M${cx - 8} ${cy - 1} Q${cx} ${cy + 6.5} ${cx + 8} ${cy - 1}" stroke="${col}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  return `<path d="M${cx - 7.5} ${cy + 2.5} Q${cx} ${cy + 6.5} ${cx + 7.5} ${cy + 2.5}" stroke="${col}" stroke-width="2.8" fill="none" stroke-linecap="round" opacity=".92"/>`;
}

function eyes(L, P) {
  const lx = 76;
  const rx = 124;
  const y = 97;
  const k = L.eyes;
  if (k === 'serene') return closedEye(lx, y + 1, 'serene') + closedEye(rx, y + 1, 'serene');
  if (k === 'sleepy') return closedEye(lx, y + 2, 'sleepy') + closedEye(rx, y + 2, 'sleepy');
  if (k === 'wink') return beadEye(lx, y, 11.6, P, { look: [0.4, 0.3] }) + closedEye(rx, y + 1, 'happy');
  if (k === 'wide') return beadEye(lx, y - 1, 13.2, P, { sparkle: true }) + beadEye(rx, y - 1, 13.2, P, { sparkle: true });
  if (k === 'look') return beadEye(lx, y, 11.6, P, { look: [2.2, -2.4] }) + beadEye(rx, y, 11.6, P, { look: [2.2, -2.4] });
  return beadEye(lx, y, 11.6, P, { look: [0.5, 0.4] }) + beadEye(rx, y, 11.6, P, { look: [-0.5, 0.4] });
}

function nose(P) {
  return `<path d="M92 116.6 C92 112.8 108 112.8 108 116.6 C108 120.8 103.3 124.2 100 124.2 C96.7 124.2 92 120.8 92 116.6 Z" fill="url(#${P}-nose)"/>
<ellipse cx="97.4" cy="115.8" rx="3.3" ry="1.5" fill="${K.white}" opacity=".55"/>`;
}

function mouth(kind, P) {
  const ink = V.ink;
  // the open mouths share a soft "w" upper lip that tucks right under the nose
  const open = (d, tongue) => `<clipPath id="${P}-mclip"><path d="${d}"/></clipPath>
<path d="${d}" fill="url(#${P}-mouth)"/>${tongue ? `<g clip-path="url(#${P}-mclip)">${tongue}</g>` : ''}`;
  if (kind === 'laugh')
    return open(
      'M81.4 124.2 C87.4 129.6 95.4 130.4 100 125.6 C104.6 130.4 112.6 129.6 118.6 124.2 C119 141.4 110.6 150.2 100 150.2 C89.4 150.2 81 141.4 81.4 124.2 Z',
      `<ellipse cx="100" cy="149" rx="13.4" ry="8.6" fill="url(#${P}-tongue)"/>`,
    );
  if (kind === 'smile')
    return open(
      'M89 126.4 C92.6 129.2 97 129.6 100 125.8 C103 129.6 107.4 129.2 111 126.4 C110.4 136.6 105.6 140.8 100 140.8 C94.4 140.8 89.6 136.6 89 126.4 Z',
      `<ellipse cx="100" cy="140" rx="7.6" ry="4.6" fill="url(#${P}-tongue)"/>`,
    );
  if (kind === 'o') return `<ellipse cx="100" cy="133.6" rx="5.6" ry="6.8" fill="url(#${P}-mouth)"/><ellipse cx="100" cy="137.4" rx="3.6" ry="2.3" fill="url(#${P}-tongue)"/>`;
  if (kind === 'hmm')
    return `<path d="M94.6 131 C97.6 133.2 101.8 133.4 105 131.2 C106 130.5 106.8 129.6 107.4 128.6" stroke="${ink}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (kind === 'smirk')
    return open(
      'M89.6 127.4 C93.4 130.2 97.4 130.2 100.2 126.6 C103.6 129.4 108.6 127.6 112 124 C112 133.6 106.8 139.6 100.6 139.6 C95 139.6 90.6 135 89.6 127.4 Z',
      `<ellipse cx="103" cy="138.6" rx="7" ry="4.4" fill="url(#${P}-tongue)"/>`,
    );
  if (kind === 'serene')
    return `<path d="M92.5 127.6 C95 130.4 98 130.4 100 127.6 C102 130.4 105 130.4 107.5 127.6" stroke="${ink}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<ellipse cx="100" cy="131.6" rx="3.2" ry="2.8" fill="url(#${P}-mouth)"/>`;
}

// ── the wrapped velvet turban ──
// A rounded crown with two broad velvet wraps spiralling up to the right across the front. Each wrap is a soft roll
// (lit ridge → rolls under → thin lit rim → cast shadow on the wrap below), and the wrap ends step the silhouette a
// little so it reads as layered cloth even at 48 px. Gold piping on the brim; an OVAL amber cabochon in a gold bezel
// pins the lowest wrap at the front. No ribs, no points, no plume — nothing radiates from the jewel.
const TURBAN =
  'M60 61.6 C54.6 55.2 51.4 48.6 51.6 45.4 C51.8 43.6 52.6 42.4 53.2 41 C52.4 37 53 33 54.8 29.4 C60.6 15.4 78.2 6.2 99.6 5.8 C111.8 5.6 122.4 8.8 129.8 14 C132 13.6 134.6 14.4 136.8 16.6 C141 20.6 143.9 25.2 145.6 30.6 C149.4 41.8 147 53.6 140 61.6 C127.4 56.8 114 54.4 100 54.4 C86 54.4 72.6 56.8 60 61.6 Z';
const BRIM = 'M60.2 60.4 C72.8 55.6 86 53.2 100 53.2 C114 53.2 127.2 55.6 139.8 60.4';
// fold = the lower edge of a wrap lying over the wrap below; ridge = the lit crest of each wrap's roll
const FOLDS = ['M51.4 45.2 C66 45.4 86 43.4 104 38.2 C120 33.4 134 27 147.6 19.6', 'M53.4 30.4 C68 28.8 86 25.4 102 20.4 C113 17 122 13.4 131 8.8'];
const RIDGES = ['M54 55.6 C70 53.4 88 50.6 104 45.6 C120 40.6 134 34 147 27', 'M53 38.2 C68 36.8 86 33.2 103 28 C116 24 128 19.4 139 13.4', 'M59 19.6 C70 15.6 84 11.6 99 9'];
const GEM = [100, 45.6];
const shiftY = (d, dy) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (m, x, y) => `${x} ${R(Number(y) + dy)}`);

function turban(P, mood) {
  const glow = mood === 'mystic';
  const stroke = (d, c, o, w) => `<path d="${d}" stroke="${c}" stroke-opacity="${o}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  const ridges = RIDGES.map((d) => stroke(d, K.velvet, 0.1, 9) + stroke(d, K.velvet, 0.12, 5) + stroke(d, K.foldHi, 0.16, 2)).join('');
  const folds = FOLDS.map(
    (d) =>
      stroke(shiftY(d, -3.4), K.fold, 0.12, 4) + // the wrap rolling under, away from the light
      stroke(shiftY(d, 2.4), K.fold, 0.2, 8) + // its shadow on the wrap below
      stroke(shiftY(d, 1.6), K.fold, 0.26, 4) +
      stroke(shiftY(d, 0.7), K.fold, 0.5, 1.5) + // the crease
      stroke(shiftY(d, -1.1), K.foldHi, 0.55, 1.3), // the lit rim of the roll
  ).join('');
  const [gx, gy] = GEM;
  return `<g>
<path d="${BRIM}" stroke="${K.ao}" stroke-opacity=".32" stroke-width="5" fill="none" transform="translate(0 2.6)" stroke-linecap="round"/>
<clipPath id="${P}-tsil"><path d="${TURBAN}"/></clipPath>
<path d="${TURBAN}" fill="url(#${P}-turban)"/>
<g clip-path="url(#${P}-tsil)">
${ridges}
${folds}
<path d="${BRIM}" stroke="${K.fold}" stroke-opacity=".34" stroke-width="5.6" fill="none" transform="translate(0 -2.4)"/>
<ellipse cx="80" cy="17" rx="16" ry="6.4" transform="rotate(-20 80 17)" fill="url(#${P}-bloom)" opacity=".5"/>
</g>
<path d="${TURBAN}" fill="url(#${P}-velvet)"/>
<path d="${BRIM}" stroke="url(#${P}-gold)" stroke-width="2.4" fill="none" stroke-linecap="round"/>
<path d="${BRIM}" stroke="${K.goldHi}" stroke-opacity=".7" stroke-width=".7" fill="none" stroke-linecap="round" transform="translate(0 -.6)"/>
${glow ? `<circle cx="${gx}" cy="${gy}" r="16" fill="url(#${P}-spark)" opacity=".95"/>` : ''}
<g${glow ? ' class="pg-gem-glow"' : ''}>${cabochon(P, gx, gy)}</g>
</g>`;
}

/** the amber OVAL cabochon in its gold bezel (bezel 14.8 × 18.4, stone 10.2 × 13.6, centred on gx, gy) */
function cabochon(P, gx, gy) {
  return `<path d="${ell(gx, gy, 7.4, 9.2)}" fill="url(#${P}-goldH)"/>
<path d="${ell(gx, gy, 5.9, 7.7)}" fill="none" stroke="${K.gold[2]}" stroke-opacity=".55" stroke-width=".7"/>
<path d="${ell(gx, gy + 0.2, 5.1, 6.8)}" fill="url(#${P}-gem)"/>
<ellipse cx="${R(gx - 1.8)}" cy="${R(gy - 3)}" rx="1.9" ry="2.7" transform="rotate(-16 ${R(gx - 1.8)} ${R(gy - 3)})" fill="${K.white}" opacity=".85"/>
<ellipse cx="${R(gx + 1.8)}" cy="${R(gy + 3.8)}" rx="1.4" ry=".8" fill="${K.gem[0]}" opacity=".7"/>`;
}

/**
 * The turban jewel on its own — self-contained (its own two gradients), so the lamp's finial can wear the very same
 * amber oval cabochon in the same gold bezel: `broochSVG({ cx, cy, s, idPrefix })` → markup for any <svg>.
 * At s = 1 it is 14.8 × 18.4 user units (bezel), centred on (cx, cy).
 */
export function broochSVG({ cx = 0, cy = 0, s = 1, idPrefix = 'pgb' } = {}) {
  const P = idPrefix;
  return `<defs>${linear(`${P}-goldH`, 'x1="0" y1="0" x2="1" y2="1"', [[0, K.goldHi], [0.38, K.goldMid], [0.72, K.gold[1]], [1, K.gold[2]]])}${radial(`${P}-gem`, 'cx=".38" cy=".3" r=".78"', [[0, K.gem[0]], [0.34, K.gem[1]], [0.8, K.gem[2]], [1, K.gem[3]]])}</defs><g transform="translate(${R(cx)} ${R(cy)}) scale(${s})">${cabochon(P, 0, 0)}</g>`;
}

function earRing(P) {
  return `<path d="M148.5 72 C148.2 77.4 156.6 78 157 72.2" stroke="url(#${P}-gold)" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
}

function head(L, P, C) {
  const blushOp = L.blush ?? 1;
  const bloom = `<ellipse cx="74" cy="66" rx="30" ry="17" transform="rotate(-24 74 66)" fill="url(#${P}-bloom)" opacity=".5"/>`;
  return `<g transform="translate(0 ${L.headDy || 0}) rotate(${L.headTilt || 0} 100 150)">
${ear(45, 58, 19.5, P, 'L')}${ear(155, 58, 19.5, P, 'R')}
${earRing(P)}
${plush(HEAD, 'hclip', P, C, bloom, HEAD_LOW, 112, 146)}
${patches(P)}
${eyes(L, P)}
<ellipse cx="57" cy="${L.blushY || 126}" rx="10.5" ry="6.4" fill="url(#${P}-blush)" opacity="${blushOp}"/>
<ellipse cx="143" cy="${L.blushY || 126}" rx="10.5" ry="6.4" fill="url(#${P}-blush)" opacity="${blushOp}"/>
<ellipse cx="100" cy="127" rx="21" ry="14" fill="url(#${P}-bloom)" opacity=".42"/>
${nose(P)}
${mouth(L.mouth, P)}
<g transform="translate(${L.turban?.dx || 0} ${L.turban?.dy || 0}) rotate(${L.turban?.rot || 0} 100 52)"><g transform="translate(5 2.9) scale(.95)">${turban(P, L.mood)}</g></g>
</g>`;
}

// ───────────────────────────── body & limbs ─────────────────────────────
function body(L, P, C) {
  const bloom = `<ellipse cx="86" cy="184" rx="18" ry="20" transform="rotate(-16 86 184)" fill="url(#${P}-bloom)" opacity=".3"/>`;
  return `<g>
${plush(BODY, 'bclip', P, C, bloom, BODY_LOW, 192, 212)}
<path d="${BAND}" fill="url(#${P}-blk)"/>
<ellipse cx="100" cy="158" rx="36" ry="8" fill="url(#${P}-ao)"/>
</g>`;
}

/** pads on a palm / sole. (x,y)=centre, r=radius, ang=direction the toes point (deg) */
function pads(x, y, r, ang, P, s = 1) {
  const t = { x, y, rot: ang + 90 };
  const main = tp(
    `M${-r * 0.44} ${r * 0.08} C${-r * 0.46} ${-r * 0.16} ${r * 0.46} ${-r * 0.16} ${r * 0.44} ${r * 0.08} C${r * 0.44} ${r * 0.34} ${r * 0.24} ${r * 0.5} 0 ${r * 0.5} C${-r * 0.24} ${r * 0.5} ${-r * 0.44} ${r * 0.34} ${-r * 0.44} ${r * 0.08} Z`,
    t,
  );
  const toes = [
    [-r * 0.5, -r * 0.32],
    [0, -r * 0.52],
    [r * 0.5, -r * 0.32],
  ]
    .map(([a, b]) => {
      const [cx, cy] = xf(a, b, t);
      return `<path d="${ell(cx, cy, r * 0.19 * s, r * 0.2 * s, ang + 90)}" fill="url(#${P}-pad)"/>`;
    })
    .join('');
  return `<path d="${main}" fill="url(#${P}-pad)"/>${toes}`;
}

const LIGHT = [-0.62, -0.78]; // key light from the top-left
// per-drawing registry for generated gradients (pangieInner resets it; every call is synchronous)
const SEQ = { n: 0, defs: [] };

/**
 * A plush limb: two gently bowed, tapered segments (shoulder → elbow → wrist) unioned with a round joint, ending in a
 * paw / foot. Every limb bends — no straight tubes. j = { a, b (elbow), c (paw centre), r: [r0, rJoint, rWrist],
 * paw, pawR, bow, pads, rim, padAng, padScale }
 */
function limb(j, P, o = {}) {
  const [r0, r1, r2] = j.r;
  const a = j.a;
  const c = j.c;
  let b = j.b;
  if (!b) {
    // auto elbow: bend the limb outward (away from the body's centre line x = 100)
    const m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
    const dx = c[0] - a[0];
    const dy = c[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    let nx = -dy / l;
    let ny = dx / l;
    if ((m[0] - 100) * nx < 0) {
      nx = -nx;
      ny = -ny;
    }
    const k = j.bend ?? 5;
    b = [m[0] + nx * k, m[1] + ny * k];
  }
  const dir = [c[0] - b[0], c[1] - b[1]];
  const dl = Math.hypot(dir[0], dir[1]) || 1;
  const pawR = j.pawR || 11.4;
  const w = [c[0] - (dir[0] / dl) * pawR * 0.5, c[1] - (dir[1] / dl) * pawR * 0.5]; // wrist
  const seg1 = bowed(a, b, j.bow?.[0] ?? 1.2);
  const seg2 = bowed(b, w, j.bow?.[1] ?? 1);
  const angD = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;
  const paw = j.pawPath || ell(c[0], c[1], pawR, pawR * (j.pawSy || 0.94), angD);
  if (o.pawOnly) return { d: paw, svg: `<path d="${paw}" fill="url(#${P}-blk)"/>${pawDetails(j, c, pawR, angD, P)}` };
  const t1 = tube(seg1, (u) => r0 + (r1 - r0) * u + 0.6 * Math.sin(Math.PI * u));
  const t2 = tube(seg2, (u) => r1 + (r2 - r1) * u + 0.5 * Math.sin(Math.PI * u));
  const d = `${t1} ${ell(b[0], b[1], r1, r1)} ${t2} ${paw}`;
  let s = `<path d="${d}" fill="url(#${P}-blk)"/>`;
  // velvet sheen: each segment gets a cross-gradient (lit rim → clear core → faint bounce on the shadow rim),
  // a true cylindrical falloff with no banding
  for (const [seg, ra, rb, tubeD] of [
    [seg1, r0, r1, t1],
    [seg2, r1, r2, t2],
  ]) {
    const p0 = seg[0];
    const p1 = seg[seg.length - 1];
    const m = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
    let nx = -(p1[1] - p0[1]) / l;
    let ny = (p1[0] - p0[0]) / l;
    if (nx * LIGHT[0] + ny * LIGHT[1] < 0) {
      nx = -nx;
      ny = -ny;
    }
    const r = (ra + rb) / 2 + 0.6;
    const gid = `${P}-ls${SEQ.n++}`;
    SEQ.defs.push(
      `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${R(m[0] + nx * r)}" y1="${R(m[1] + ny * r)}" x2="${R(m[0] - nx * r)}" y2="${R(m[1] - ny * r)}">${stops([
        [0, K.blkSheen, 0.22],
        [0.18, K.blkSheen, 0.13],
        [0.44, K.blkSheen, 0],
        [0.82, K.blkRim, 0],
        [1, K.blkRim, j.bounce === false ? 0 : 0.2],
      ])}</linearGradient>`,
    );
    s += `<path d="${tubeD}" fill="url(#${gid})"/>`;
  }
  s += pawDetails(j, c, pawR, angD, P);
  return { d, svg: s, wrist: w, elbow: b };
}

function pawDetails(j, c, pawR, angD, P) {
  let s = `<path d="${ell(c[0] - pawR * 0.24, c[1] - pawR * 0.32, pawR * 0.44, pawR * 0.26, -35)}" fill="url(#${P}-sheen)" opacity=".5"/>`;
  if (j.pads) s += pads(c[0], c[1], pawR, j.padAng ?? angD, P, j.padScale || 1);
  if (j.rim != null) {
    // warm light spilling from the orb onto the paw's near edge (two soft passes ≈ feathered)
    s += rimArc(c[0], c[1], pawR - 1.6, j.rim, j.rimSpan || 100, K.orbCore[1], 3.2, 0.22);
    s += rimArc(c[0], c[1], pawR - 1.1, j.rim, (j.rimSpan || 100) * 0.7, K.orbCore[1], 1.2, 0.3);
  }
  return s;
}

/** soft contact shadow a limb casts on the fur beneath it */
function limbAO(j, P) {
  const segs = j.b ? [[j.a, j.b], [j.b, j.c]] : [[j.a, j.c]];
  return segs
    .map(([[sx, sy], [px, py]]) => {
      const mx = (sx + px) / 2 + 3;
      const my = (sy + py) / 2 + 4;
      const len = Math.hypot(px - sx, py - sy);
      const ang = (Math.atan2(py - sy, px - sx) * 180) / Math.PI;
      return `<path d="${ell(mx, my, len / 2 + 9, 13, ang)}" fill="url(#${P}-ao)" opacity="${j.b ? 0.6 : 0.85}"/>`;
    })
    .join('');
}

const ARM = { r: [12.2, 10.5, 8.9], pawR: 10.9 };
function arm(a, P, o = {}) {
  return limb({ ...ARM, ...a, a: a.sh, b: a.el, c: a.paw }, P, o).svg;
}

function leg(l, P) {
  const sz = l.size || 1;
  const rot = l.rot || 0;
  const [fx, fy] = l.foot;
  // the sole is an upright oval facing the viewer (heel to toes along `rot`)
  const j = { a: l.hip, b: l.knee, c: l.foot, r: [12.4, 11.8, 10.8 * sz], pawR: 12.6 * sz, bend: l.bend ?? 2.5, bow: l.bow || [0.6, 0.6], pawPath: ell(fx, fy, 12.4 * sz, 14.2 * sz, rot) };
  let s = limb(j, P).svg;
  if (l.sole !== false) s += pads(fx, fy + 1.2 * sz, 11.8 * sz, l.padAng ?? rot - 90, P, 1.05);
  return s;
}

// ───────────────────────────── props ─────────────────────────────
function orb(x, y, r, P, o = {}) {
  const g = o.glow ?? 1;
  const W = K.white;
  return `<g class="pg-ball">
<circle cx="${x}" cy="${y}" r="${R(r * 2.1 * (o.haloScale || 1))}" fill="url(#${P}-halo)" class="pg-halo" style="transform-origin:${x}px ${y}px" opacity="${R(Math.min(1, g))}"/>
<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${P}-orb)"/>
<circle cx="${x}" cy="${R(y + r * 0.12)}" r="${R(r * 0.62)}" fill="url(#${P}-orbCore)" opacity="${R(Math.min(1, 0.55 + 0.45 * g))}"/>
<path d="M${R(x - r * 0.58)} ${R(y + r * 0.28)} C${R(x - r * 0.2)} ${R(y - r * 0.12)} ${R(x + r * 0.3)} ${R(y + r * 0.5)} ${R(x + r * 0.56)} ${R(y + r * 0.06)}" stroke="${W}" stroke-opacity=".55" stroke-width="${R(r * 0.08)}" fill="none" stroke-linecap="round"/>
<path d="${sparkPath(x + r * 0.05, y + r * 0.08, r * 0.3)}" fill="${K.orbCore[0]}"/>
<path d="M${R(x - r * 0.72)} ${R(y - r * 0.18)} C${R(x - r * 0.66)} ${R(y - r * 0.56)} ${R(x - r * 0.36)} ${R(y - r * 0.78)} ${R(x - r * 0.02)} ${R(y - r * 0.8)}" stroke="${W}" stroke-width="${R(r * 0.14)}" stroke-linecap="round" fill="none" opacity=".9"/>
<circle cx="${R(x + r * 0.5)}" cy="${R(y + r * 0.52)}" r="${R(r * 0.09)}" fill="${W}" opacity=".8"/>
<circle cx="${x}" cy="${y}" r="${R(r - 0.5)}" fill="none" stroke="${W}" stroke-opacity=".45" stroke-width=".9"/>
</g>`;
}

function card(kind, P) {
  const fill = kind === 'moon' ? `url(#${P}-cardMoss)` : kind === 'star' ? `url(#${P}-cardTeal)` : `url(#${P}-cardCream)`;
  const line = kind === 'sun' ? V.gold : V.goldL;
  const sym =
    kind === 'moon'
      ? `<path d="M2.6 -22.8 C-2.8 -22.4 -4.6 -15.6 -1.2 -12.6 C1.2 -10.4 5 -10.8 6.4 -13 C3.2 -12.6 0.4 -14.8 0.6 -18.2 C0.7 -20.4 1.4 -21.8 2.6 -22.8 Z" fill="${V.goldL}"/>`
      : kind === 'star'
        ? `<path d="${sparkPath(0, -16.5, 6.4)}" fill="${V.goldL}"/>`
        : `<circle cx="0" cy="-16.5" r="3.6" fill="url(#${P}-gold)"/>${[0, 45, 90, 135, 180, 225, 270, 315]
            .map((a) => {
              const c = Math.cos(a * RAD);
              const s = Math.sin(a * RAD);
              return `<path d="M${R(c * 5.2)} ${R(-16.5 + s * 5.2)} L${R(c * 7.4)} ${R(-16.5 + s * 7.4)}" stroke="${V.gold}" stroke-width="1.2" stroke-linecap="round"/>`;
            })
            .join('')}`;
  return `<rect x="-11" y="-33" width="22" height="33" rx="3.2" fill="${fill}"/>
<rect x="-11" y="-33" width="22" height="33" rx="3.2" fill="none" stroke="${line}" stroke-opacity=".9" stroke-width="1"/>
<rect x="-8.2" y="-30.2" width="16.4" height="27.4" rx="1.8" fill="none" stroke="${line}" stroke-opacity=".7" stroke-width=".6"/>
${sym}
<path d="M-4.5 -6.6 L4.5 -6.6" stroke="${line}" stroke-opacity=".7" stroke-width=".8" stroke-linecap="round"/>`;
}

function cards(x, y, rot, s, P) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
<g transform="rotate(-24) translate(0 2)">${card('moon', P)}</g>
<g transform="rotate(24) translate(0 2)">${card('star', P)}</g>
<g transform="translate(0 -1)">${card('sun', P)}</g>
</g>`;
}

function magnifier(x, y, rot, s, P) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
<path d="M-2.6 -8 L2.6 -8 L2.2 8 C2.2 10 -2.2 10 -2.2 8 Z" fill="url(#${P}-wood)"/>
<rect x="-3.4" y="-12" width="6.8" height="5" rx="1.6" fill="url(#${P}-goldH)"/>
<circle cx="0" cy="-25" r="12.4" fill="url(#${P}-lens)"/>
<circle cx="0" cy="-25" r="12.4" fill="none" stroke="url(#${P}-goldH)" stroke-width="3.6"/>
<circle cx="0" cy="-25" r="10.3" fill="none" stroke="${V.goldInk}" stroke-opacity=".35" stroke-width=".7"/>
<path d="M-7.2 -28.5 C-6 -32 -3 -34 0.6 -34.4" stroke="${K.white}" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".9"/>
<circle cx="5.2" cy="-19.6" r="1.3" fill="${K.white}" opacity=".8"/>
</g>`;
}

function sparkle(x, y, s, P, cls = '') {
  return `<g class="pg-twinkle${cls ? ` ${cls}` : ''}"><circle cx="${x}" cy="${y}" r="${R(s * 1.6)}" fill="url(#${P}-spark)"/><path d="${sparkPath(x, y, s)}" fill="url(#${P}-sparkFill)"/></g>`;
}

function drawProp(p, P) {
  if (!p) return '';
  let s = '';
  if (p.float && p.kind === 'ball') s += `<ellipse cx="${p.x}" cy="${R(p.y + (p.r || 15) + 6)}" rx="${R((p.r || 15) * 0.9)}" ry="2.6" fill="url(#${P}-spark)" opacity=".75"/>`;
  if (p.kind === 'ball') s += orb(p.x, p.y, p.r || 15, P, { glow: p.glow ?? 1, haloScale: p.haloScale });
  else if (p.kind === 'cards') {
    if (p.glow) s += `<circle cx="${p.x}" cy="${p.y - 18}" r="34" fill="url(#${P}-halo)" class="pg-halo" style="transform-origin:${p.x}px ${p.y - 18}px"/>`;
    s += cards(p.x, p.y, p.rot || 0, p.s || 1, P);
  } else if (p.kind === 'magnifier') {
    if (p.glow) s += `<circle cx="${p.x}" cy="${p.y - 24}" r="30" fill="url(#${P}-halo)" class="pg-halo" style="transform-origin:${p.x}px ${p.y - 24}px"/>`;
    s += magnifier(p.x, p.y, p.rot || 0, p.s || 1, P);
  }
  return s;
}

// ───────────────────────────── genie mist (seat + spiral smoke tail) ─────────────────────────────
// The signature curl. Keep these numbers stable: the lamp's smoke ends in the same spiral.
//   centre c, start radius r0, start angle a0 (deg, SVG y-down, measured clockwise from +x), sweep `turn` degrees
//   counter-clockwise on screen, radius shrinking linearly to r0·(1 − decay); a cubic lead-in from `from` joins it.
//   The ribbon is w0 wide where it leaves the seat and tapers (t^0.8) to w1 at the rounded tip.
export const MIST_SPIRAL = Object.freeze({ c: [156, 211], r0: 15, a0: 82, turn: 330, decay: 0.74, from: [112, 230], w0: 15, w1: 2.4, leadN: 18, curlN: 46 });

/** centre-line points of the smoke tail (lead-in + spiral) in Pangie's 200×250 space; { lead: false } → the curl only */
export function spiralCentreline(o = {}) {
  const S = { ...MIST_SPIRAL, ...o };
  const c = S.c;
  const start = [c[0] + S.r0 * Math.cos(S.a0 * RAD), c[1] + S.r0 * Math.sin(S.a0 * RAD)];
  const from = S.from;
  const pts = [];
  if (S.lead !== false) for (let i = 0; i < S.leadN; i++) pts.push(bez(from, [from[0] + 14, from[1] + 6], [start[0] - 16, start[1] + 4], start, i / S.leadN));
  for (let i = 0; i <= S.curlN; i++) {
    const t = i / S.curlN;
    const a = (S.a0 - S.turn * t) * RAD;
    const r = S.r0 * (1 - S.decay * t);
    pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return pts;
}

/**
 * The filled tail ribbon (fill it with a mist gradient). `place` = { x, y, s, rot } moves the curl so its centre c
 * lands on (x, y), scaled by s and rotated by rot degrees — how the lamp ends its smoke in this very curl.
 * With { lead: false } only the curl is drawn, starting at the thickness it has in the full tail.
 */
export function spiralTailPath(o = {}, place) {
  const S = { ...MIST_SPIRAL, ...o };
  let pts = spiralCentreline(S);
  const k = place ? place.s ?? 1 : 1;
  if (place) pts = pts.map(([x, y]) => xf(x - S.c[0], y - S.c[1], { x: place.x || 0, y: place.y || 0, s: k, rot: place.rot || 0 }));
  const w0 = S.lead === false ? S.w0 + (S.w1 - S.w0) * Math.pow(S.leadN / (S.leadN + S.curlN), 0.8) : S.w0;
  return ribbon(pts, w0 * k, S.w1 * k);
}

function mist(L, P) {
  const k = L.mist || 'seat';
  const puffs =
    k === 'wrap'
      ? [
          [74, 228, 12],
          [92, 233, 13],
          [110, 233, 13],
          [126, 228, 11],
          [100, 224, 15],
        ]
      : k === 'genie'
        ? [
            [72, 212, 13],
            [128, 212, 13],
            [86, 206, 14],
            [114, 206, 14],
            [100, 204, 15],
            [80, 224, 13],
            [120, 224, 13],
            [100, 228, 15],
          ]
        : [
            [68, 228, 11],
            [84, 233, 13],
            [103, 234, 14],
            [121, 231, 12.5],
            [135, 226, 10],
            [100, 224, 16],
            [78, 222, 11],
            [122, 221, 11],
          ];
  const tail = spiralCentreline(L.tail || {});
  const S = { ...MIST_SPIRAL, ...(L.tail || {}) };
  const tailD = ribbon(tail, S.w0, S.w1);
  // highlight along the outer edge of the curl
  const hl = smooth(
    tail.slice(16, 52).map(([x, y], i, a) => {
      const j = Math.min(a.length - 1, i + 1);
      const q = a[Math.max(0, i - 1)];
      let tx = a[j][0] - q[0];
      let ty = a[j][1] - q[1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const w = 4.2 * (1 - i / a.length) + 0.6;
      return [x + ty * w, y - tx * w];
    }),
    false,
  );
  return `<g class="pg-smoke" style="transform-origin:100px 226px">
<path d="${tailD}" fill="url(#${P}-mist)" opacity=".94"/>
<path d="${hl}" stroke="${K.mistHi}" stroke-opacity=".75" stroke-width="1.3" fill="none" stroke-linecap="round"/>
${puffs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${P}-mist)"/>`).join('')}
<circle cx="178" cy="190" r="3" fill="${K.mistPuff}" opacity=".85" class="pg-puff"/>
<circle cx="184" cy="178" r="2" fill="${K.mistPuff}" opacity=".65" class="pg-puff pg-d2"/>
</g>`;
}

// ───────────────────────────── poses ─────────────────────────────
const SH_L = [70, 168];
const SH_R = [130, 168];
const HIP_L = [85, 204];
const HIP_R = [115, 204];
const SEAT_LEGS = [
  { hip: HIP_L, foot: [77, 221], rot: -14 },
  { hip: HIP_R, foot: [123, 221], rot: 14 },
];

function layout(mood, prop) {
  const L = { mood, headTilt: 0, headDy: 0, fig: null, arms: [], legs: SEAT_LEGS, prop: null, eyes: 'open', mouth: 'smile', extras: [], mist: 'seat' };
  const floatInFront = (x = 100, y = 186) => {
    if (prop === 'ball') L.prop = { kind: 'ball', x, y, r: 14, float: true };
    else if (prop === 'cards') L.prop = { kind: 'cards', x, y: y + 15, rot: 0, s: 0.92, float: true };
    else if (prop === 'magnifier') L.prop = { kind: 'magnifier', x: x + 2, y: y + 15, rot: 18, s: 0.92, float: true };
  };

  switch (mood) {
    case 'happy': {
      // a heel-flick hop: off the cloud and leaning away from the raised paw, which holds the prop up high; the other
      // paw swings low for balance (pads showing), the near leg dangles and the far heel flicks up behind with its
      // sole pad showing; sparkle eyes and a big open laugh. (Not the reference's choreography: one paw up, no
      // forward kick, and the kick goes to the viewer's right.)
      L.fig = { dx: -2, dy: -9, rot: -6 };
      L.mistOutside = true;
      L.headTilt = -3;
      L.turban = { dx: 0, dy: 1.5, rot: 0 };
      L.eyes = 'sparkle';
      L.mouth = 'laugh';
      L.blushY = 123;
      const up = { sh: [128, 164], el: [150, 154], paw: [160, 127], layer: 'back' };
      const low = { sh: [72, 166], el: [54, 178], paw: [44, 193], layer: 'back', pads: true, padAng: 160 };
      L.arms = [up, low];
      L.legs = [
        { hip: [86, 203], knee: [79, 216], foot: [83, 229], rot: 14, sole: false, bow: [-0.6, 0.6] },
        { hip: [114, 203], knee: [127, 221], foot: [146, 205], rot: -48, padAng: -138, layer: 'back' },
      ];
      if (prop === 'ball') {
        up.rim = -90;
        L.prop = { kind: 'ball', x: 162, y: 107, r: 14.5, layer: 'raised', glow: 1.1 };
        up.grip = true;
      } else if (prop === 'cards') {
        L.prop = { kind: 'cards', x: 160, y: 123, rot: 14, s: 0.86, layer: 'raised' };
        up.grip = true;
      } else if (prop === 'magnifier') {
        L.prop = { kind: 'magnifier', x: 160, y: 127, rot: 16, s: 0.92, layer: 'raised' };
        up.grip = true;
      } else {
        up.paw = [167, 121];
        up.el = [152, 152];
        up.pads = true;
        up.padAng = -80;
      }
      L.extras = ['joy'];
      L.tail = { from: [112, 232] };
      break;
    }
    case 'wow': {
      L.fig = { dx: 0, dy: -3, rot: 2 };
      L.eyes = 'wide';
      L.mouth = 'o';
      L.arms = [
        { sh: SH_L, el: [53, 168], paw: [62, 141], layer: 'face', bow: [-0.4, -0.5], r: [11.6, 9.8, 8.4], pawR: 10 },
        { sh: SH_R, el: [147, 168], paw: [138, 141], layer: 'face', bow: [0.4, 0.5], r: [11.6, 9.8, 8.4], pawR: 10 },
      ];
      L.legs = [
        { hip: HIP_L, foot: [74, 218], rot: -26 },
        { hip: HIP_R, foot: [126, 218], rot: 26 },
      ];
      floatInFront(100, 188);
      L.extras = ['surprise'];
      break;
    }
    case 'think': {
      L.headTilt = 7;
      L.eyes = 'look';
      L.mouth = 'hmm';
      L.arms = [{ sh: SH_L, el: [62, 188], paw: [85, 154], layer: 'face', bow: [-1, 1] }];
      L.legs = [
        { hip: HIP_L, foot: [78, 221], rot: -12 },
        { hip: HIP_R, foot: [124, 217], rot: 30 },
      ];
      if (prop === 'ball') {
        L.prop = { kind: 'ball', x: 123, y: 180, r: 13.5, layer: 'overArm' };
        L.arms.push({ sh: SH_R, paw: [123, 196], layer: 'front', rim: -90, grip: true });
      } else if (prop === 'cards') {
        L.prop = { kind: 'cards', x: 120, y: 197, rot: 12, s: 0.9, layer: 'overArm' };
        L.arms.push({ sh: SH_R, paw: [121, 196], layer: 'front', grip: true });
      } else if (prop === 'magnifier') {
        L.prop = { kind: 'magnifier', x: 123, y: 195, rot: 34, s: 1, layer: 'overArm' };
        L.arms.push({ sh: SH_R, paw: [122, 196], layer: 'front', grip: true });
      } else {
        L.arms.push({ sh: SH_R, paw: [103, 193], layer: 'front' });
      }
      L.extras = ['thought'];
      break;
    }
    case 'wink': {
      L.fig = { dx: 0, dy: -2, rot: 3 };
      L.headTilt = 5;
      L.eyes = 'wink';
      L.mouth = 'smirk';
      L.legs = [
        { hip: HIP_L, foot: [72, 217], rot: -34 },
        { hip: HIP_R, foot: [123, 222], rot: 12 },
      ];
      L.arms = [{ sh: SH_R, el: [158, 166], paw: [168, 128], layer: 'back', pads: true, padAng: -80, bow: [1, -1] }];
      if (prop === 'ball') {
        L.prop = { kind: 'ball', x: 82, y: 181, r: 13.5, layer: 'overArm' };
        L.arms.push({ sh: SH_L, paw: [82, 197], layer: 'front', rim: -90, grip: true });
      } else if (prop === 'cards' || prop === 'magnifier') {
        L.arms[0] = { sh: SH_R, el: [158, 168], paw: [168, 131], layer: 'back', grip: true, bow: [1, -1] };
        L.prop = prop === 'cards' ? { kind: 'cards', x: 168, y: 128, rot: 16, s: 0.84, layer: 'raised' } : { kind: 'magnifier', x: 168, y: 130, rot: 14, s: 0.9, layer: 'raised' };
        L.arms.push({ sh: SH_L, paw: [80, 196], layer: 'front' });
      } else {
        L.arms.push({ sh: SH_L, paw: [80, 196], layer: 'front' });
      }
      break;
    }
    case 'mystic': {
      // eyes closed, risen out of his own genie smoke, paws open around the glowing orb
      L.fig = { dx: 0, dy: -6, rot: 0 };
      L.mistOutside = true;
      L.mist = 'genie';
      L.eyes = 'serene';
      L.mouth = 'serene';
      L.arms = [
        { sh: SH_L, paw: [72, 185], layer: 'front', rim: -10, bend: 4, r: [11.8, 10.2, 8.8], pawR: 10.4 },
        { sh: SH_R, paw: [128, 185], layer: 'front', rim: -170, bend: 4, r: [11.8, 10.2, 8.8], pawR: 10.4 },
      ];
      L.legs = [];
      if (prop === 'cards') L.prop = { kind: 'cards', x: 100, y: 198, rot: 0, s: 1, float: true, glow: true };
      else if (prop === 'magnifier') L.prop = { kind: 'magnifier', x: 101, y: 200, rot: 10, s: 0.95, float: true, glow: true };
      else L.prop = { kind: 'ball', x: 100, y: 182, r: prop === 'none' ? 8 : 15.5, float: true, glow: 1.3, haloScale: prop === 'none' ? 2 : 1.35 };
      L.extras = ['orbit'];
      L.tail = { from: [112, 232], c: [156, 210], r0: 17, turn: 360 };
      break;
    }
    case 'sleepy': {
      // curled up: head drooped onto the hugged prop, knees in, mist wrapped like a blanket
      L.fig = { dx: -4, dy: 0, rot: 5 };
      L.headTilt = 10.5;
      L.headDy = 8;
      L.turban = { dx: 2, dy: 1, rot: 8 };
      L.eyes = 'sleepy';
      L.mouth = 'sleep';
      L.mist = 'wrap';
      L.legs = [];
      if (prop === 'ball') {
        L.prop = { kind: 'ball', x: 100, y: 178, r: 14, glow: 0.5 };
        L.arms = [
          { sh: SH_L, paw: [89, 186], layer: 'front', rim: -50 },
          { sh: SH_R, paw: [111, 186], layer: 'front', rim: -130 },
        ];
      } else if (prop === 'cards') {
        L.prop = { kind: 'cards', x: 100, y: 196, rot: -6, s: 0.86 };
        L.arms = [
          { sh: SH_L, paw: [88, 191], layer: 'front' },
          { sh: SH_R, paw: [111, 192], layer: 'front' },
        ];
      } else if (prop === 'magnifier') {
        L.prop = { kind: 'magnifier', x: 106, y: 198, rot: -24, s: 0.9 };
        L.arms = [
          { sh: SH_L, paw: [88, 192], layer: 'front' },
          { sh: SH_R, paw: [108, 196], layer: 'front' },
        ];
      } else {
        L.arms = [
          { sh: SH_L, paw: [92, 184], layer: 'front' },
          { sh: SH_R, paw: [108, 184], layer: 'front' },
        ];
      }
      L.tail = { from: [104, 236], c: [150, 216], r0: 13, turn: 300 };
      L.extras = ['zzz'];
      break;
    }
    default: {
      // idle: seated on the mist, presenting the prop in front of the belly, paws cupped beneath it
      L.headTilt = -3;
      if (prop === 'ball') {
        L.prop = { kind: 'ball', x: 100, y: 177, r: 17.5, layer: 'overArm', haloScale: 0.95 };
        L.arms = [
          { sh: SH_L, el: [65, 185], paw: [87, 196], layer: 'front', grip: true, pawR: 11.4, pawSy: 0.84, rim: -70, rimSpan: 120 },
          { sh: SH_R, el: [135, 185], paw: [113, 196], layer: 'front', grip: true, pawR: 11.4, pawSy: 0.84, rim: -110, rimSpan: 120 },
        ];
      } else if (prop === 'cards') {
        L.prop = { kind: 'cards', x: 100, y: 199, rot: 0, s: 1.08, layer: 'overArm' };
        L.arms = [
          { sh: SH_L, el: [62, 188], paw: [86, 198], layer: 'front', grip: true },
          { sh: SH_R, el: [138, 188], paw: [114, 198], layer: 'front', grip: true },
        ];
      } else if (prop === 'magnifier') {
        L.prop = { kind: 'magnifier', x: 124, y: 195, rot: 38, s: 1.05, layer: 'overArm' };
        L.arms = [
          { sh: SH_L, el: [62, 188], paw: [86, 197], layer: 'front' },
          { sh: SH_R, el: [140, 186], paw: [123, 196], layer: 'front', grip: true },
        ];
      } else {
        L.arms = [
          { sh: SH_L, el: [62, 188], paw: [89, 196], layer: 'front' },
          { sh: SH_R, el: [138, 188], paw: [111, 196], layer: 'front' },
        ];
      }
    }
  }
  return L;
}

function extras(L, P) {
  let s = '';
  for (const e of L.extras) {
    if (e === 'zzz')
      // drawn (not typed) so it renders identically on every device
      s += [
        [22, 38, 9, 1],
        [13, 23, 7, 0.8],
        [6.5, 11, 5, 0.6],
      ]
        .map(([x, y, z, o]) => `<path d="M${x} ${y} L${x + z} ${y} L${R(x + z * 0.08)} ${y + z} L${R(x + z * 1.04)} ${y + z}" stroke="${V.gold}" stroke-width="${R(z * 0.24)}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${o}"/>`)
        .join('');
    if (e === 'thought') s += `<circle cx="167" cy="45" r="3" fill="url(#${P}-sparkFill)"/><circle cx="176" cy="33" r="4.3" fill="url(#${P}-sparkFill)"/><circle cx="186" cy="18" r="6" fill="url(#${P}-sparkFill)"/>`;
    if (e === 'surprise') s += `<g stroke="${V.gold}" stroke-width="2.6" stroke-linecap="round"><path d="M169 31 L176 22"/><path d="M176 44 L186 40"/><path d="M158 21 L160 11"/></g>`;
    if (e === 'joy') s += sparkle(24, 30, 5.2, P) + sparkle(188, 66, 4.6, P, 'pg-d2') + sparkle(184, 176, 3.6, P, 'pg-d3') + sparkle(14, 116, 3.2, P, 'pg-d2');
    if (e === 'orbit') s += sparkle(58, 206, 4.2, P) + sparkle(144, 214, 3.6, P, 'pg-d2') + sparkle(100, 150, 3, P, 'pg-d3') + sparkle(36, 150, 3.4, P, 'pg-d2');
  }
  return s;
}

// ───────────────────────────── public API ─────────────────────────────
export const MOODS = ['idle', 'happy', 'wow', 'think', 'wink', 'mystic', 'sleepy'];
export const PROPS = ['ball', 'cards', 'magnifier', 'none'];
export const VIEWBOX = '0 0 200 250';
export const FACE_VIEWBOX = '0 0 64 64';

/** resolve the paper-contour option into stroke opacity / width (CSS px) */
function contourOpts(contour, size) {
  if (contour === false || contour === 'off') return { on: false };
  if (contour === 'auto' || contour == null) {
    if (size && size >= 200) return { on: true, op: 0.24, w: 1.4 };
    if (size && size >= 150) return { on: true, op: 0.28, w: 1.5 };
    return { on: true, op: 0.32, w: 1.5 };
  }
  return { on: true, op: 0.33, w: 1.5 };
}

export function pangieInner({ mood = 'idle', prop = 'ball', idPrefix = 'pg', aura = false, contour = 'auto', size, shadow = true, sparkles = true } = {}) {
  const P = idPrefix;
  SEQ.n = 0;
  SEQ.defs = [];
  const m = MOODS.includes(mood) ? mood : 'idle';
  const pr = PROPS.includes(prop) ? prop : 'ball';
  const L = layout(m, pr);
  const C = contourOpts(contour, size);
  const by = (layer) => L.arms.filter((a) => a.layer === layer).map((a) => arm(a, P)).join('');
  const pl = L.prop ? L.prop.layer || 'body' : null;
  const grips = L.arms.filter((a) => a.grip).map((a) => arm(a, P, { pawOnly: true })).join('');
  const propFront = pl === 'body' ? drawProp(L.prop, P) : '';
  const propOverArm = pl === 'overArm' ? drawProp(L.prop, P) + grips : '';
  const propRaised = pl === 'raised' ? drawProp(L.prop, P) + grips : '';
  const mistInFront = L.mist === 'wrap' || L.mist === 'genie';
  const fig = L.fig ? `translate(${L.fig.dx} ${L.fig.dy}) rotate(${L.fig.rot} 100 180)` : '';
  const lift = L.fig ? Math.max(0, -L.fig.dy) : 0;
  const shadowSvg = shadow ? `<ellipse cx="100" cy="245" rx="${R(42 - lift * 0.7)}" ry="${R(5 - lift * 0.1)}" fill="url(#${P}-shadow)" class="pg-shadow"/>` : '';
  const ambient = sparkles && !L.extras.includes('orbit') && !L.extras.includes('joy') ? sparkle(24, 132, 4.4, P) + sparkle(178, 112, 3.6, P, 'pg-d2') + (L.extras.length ? '' : sparkle(174, 166, 2.8, P, 'pg-d3')) : '';
  const mistSvg = mist(L, P);
  const backLegs = L.legs.filter((l) => l.layer === 'back');
  const legs = L.legs.filter((l) => l.layer !== 'back');
  const art = `<circle cx="100" cy="128" r="100" fill="url(#${P}-aura)" class="pg-aura" opacity="${aura ? 1 : 0}"/>
${shadowSvg}
<g class="pg-figure">
${L.mistOutside && !mistInFront ? mistSvg : ''}
<g${fig ? ` transform="${fig}"` : ''}>
${L.mistOutside || mistInFront ? '' : mistSvg}
${backLegs.map((l) => leg(l, P)).join('')}
${by('back')}
${legs.map((l) => leg(l, P)).join('')}
${body(L, P, C)}
${L.arms.filter((a) => a.layer === 'front').map((a) => limbAO({ a: a.sh, b: a.el, c: a.paw }, P)).join('')}
${L.mist === 'genie' ? mistSvg : ''}
${propFront}
${by('front')}
${propOverArm}
${head(L, P, C)}
${L.arms.filter((a) => a.layer === 'face').map((a) => limbAO({ a: a.sh, b: a.el, c: a.paw }, P)).join('')}
${by('face')}
${propRaised}
${L.mist === 'wrap' ? mistSvg : ''}
</g>
${extras(L, P)}
${ambient}
</g>`;
  return prune(defs(P).replace('</defs>', `${SEQ.defs.join('')}</defs>`) + art);
}

export function pangieSVG({ title = '潘吉 Pangie', width, ...o } = {}) {
  const wh = width ? ` width="${width}" height="${R((width * 250) / 200)}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}"${wh} role="img" aria-label="${esc(title)}">${pangieInner({ size: width, ...o })}</svg>`;
}

// ───────────────────────────── favicon / avatar face ─────────────────────────────
// The head alone, re-drawn (not scaled) for 16–64 px: bigger bead eyes with oversized glints, the same wrapped turban
// with one fold, gold brim and amber cabochon, and a soft rim on the ears so they hold on the dark tile.
export function faceInner({ idPrefix = 'pgf', tile = false } = {}) {
  const P = idPrefix;
  const custom = tile && typeof tile === 'object';
  const tileFrom = custom ? tile.from : mix(V.dusk, V.accent, 0.25);
  const tileTo = custom ? tile.to : V.dusk;
  const headD = 'M32 17.4 C48.6 17.4 59.8 27.6 60.2 40.2 C60.6 53.2 48.6 61.8 32 61.8 C15.4 61.8 3.4 53.2 3.8 40.2 C4.2 27.6 15.4 17.4 32 17.4 Z';
  const tT = { x: 32 - 100 * 0.385, y: 22.6 - 54.4 * 0.385, s: 0.385 };
  const turb = tp(TURBAN, tT);
  const brim = tp(BRIM, tT);
  const fold = tp(FOLDS[0], tT);
  const [gx, gy] = xf(GEM[0], GEM[1], tT);
  const patchL = tp(PATCH, { x: 22, y: 39.4, rot: 31, s: 0.48 });
  const patchR = tp(PATCH, { x: 42, y: 39.4, rot: -31, s: 0.48 });
  const W = K.white;
  const eye = (x, y) =>
    `<circle cx="${x}" cy="${y}" r="5.4" fill="url(#${P}-iris)"/><circle cx="${R(x - 1.7)}" cy="${R(y - 1.9)}" r="2.25" fill="${W}"/><circle cx="${R(x + 2)}" cy="${R(y + 2)}" r=".85" fill="${W}" opacity=".85"/>`;
  const bg = tile
    ? `<linearGradient id="${P}-tile" x1="0" y1="0" x2="0" y2="1">${stops([[0, tileFrom], [1, tileTo]])}</linearGradient>`
    : '';
  const earRim = (cx, side) => (tile ? rimArc(cx, 20.6, 8.1, side === 'L' ? -140 : -40, 100, K.earRim, 1, 0.45) : '');
  return prune(`${defs(P).replace('</defs>', `${bg}</defs>`)}
${tile ? `<rect width="64" height="64" rx="14" fill="url(#${P}-tile)"/>\n<circle cx="32" cy="38" r="29" fill="url(#${P}-aura)"/>` : ''}
<path d="${ell(12.6, 20.6, 8.9, 8.9)}" fill="url(#${P}-blk)"/>${earRim(12.6, 'L')}
<path d="${ell(51.4, 20.6, 8.9, 8.9)}" fill="url(#${P}-blk)"/>${earRim(51.4, 'R')}
<path d="${headD}" fill="url(#${P}-fur)"${tile ? '' : ` stroke="${V.ink}" stroke-opacity=".34" stroke-width="1"`}/>
<clipPath id="${P}-ftc"><path d="${turb}"/></clipPath>
<path d="${turb}" fill="url(#${P}-turban)"/>
<g clip-path="url(#${P}-ftc)">
<path d="${fold}" stroke="${K.fold}" stroke-opacity=".5" stroke-width="1.2" fill="none" stroke-linecap="round" transform="translate(0 .5)"/>
<path d="${fold}" stroke="${K.foldHi}" stroke-opacity=".5" stroke-width=".7" fill="none" stroke-linecap="round" transform="translate(0 -.5)"/>
</g>
<path d="${turb}" fill="url(#${P}-velvet)"/>
<path d="${brim}" stroke="url(#${P}-gold)" stroke-width="1.7" fill="none" stroke-linecap="round"/>
<path d="${ell(gx, gy, 3.1, 3.9)}" fill="url(#${P}-goldH)"/><path d="${ell(gx, gy + 0.1, 2.2, 2.95)}" fill="url(#${P}-gem)"/><circle cx="${R(gx - 0.7)}" cy="${R(gy - 1)}" r=".7" fill="${W}" opacity=".85"/>
<path d="${patchL}" fill="url(#${P}-blk)"/><path d="${patchR}" fill="url(#${P}-blk)"/>
${eye(23.2, 38.2)}${eye(40.8, 38.2)}
<ellipse cx="13" cy="49" rx="4.6" ry="2.8" fill="url(#${P}-blush)"/><ellipse cx="51" cy="49" rx="4.6" ry="2.8" fill="url(#${P}-blush)"/>
<path d="M28.2 46.6 C28.2 44.8 35.8 44.8 35.8 46.6 C35.8 48.6 33.6 50.2 32 50.2 C30.4 50.2 28.2 48.6 28.2 46.6 Z" fill="url(#${P}-nose)"/>
<path d="M28.6 52 C30.4 54.2 33.6 54.2 35.4 52" stroke="${V.ink}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`);
}

export function faceSVG({ title = '潘吉 Pangie', size, ...o } = {}) {
  const wh = size ? ` width="${size}" height="${size}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${FACE_VIEWBOX}"${wh} role="img" aria-label="${esc(title)}">${faceInner(o)}</svg>`;
}
