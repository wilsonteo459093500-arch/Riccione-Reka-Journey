// 代码画的风景（SVG）：像旅行杂志的插画 —— 大气透视（越远越淡越冷）、4–6 层山 / 林、低低的雾带。
// 内容色（风景本身的颜色），不随 VI 换色。viewBox 1440×1000，铺满时按 xMidYMid slice 裁切：
// 竖屏 iPad / 手机只看得到中间 x≈480–960 —— 每张画的主角（山尖、太阳、溪、船）都放在中间。
// 全部是静态形状（动的只有外面 CSS 的雾带和萤火），画一次、缓存成一层，iPad 上很省。

import { memo, useId } from 'react';

const W = 1440;
const H = 1000;

/** 固定种子的随机数：每次画出来都一样 */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const f1 = (n) => Math.round(n * 10) / 10;

/** 穿过一串点的平滑曲线（Catmull-Rom → 三次贝塞尔） */
function curve(pts, move = true) {
  let d = move ? `M${f1(pts[0][0])} ${f1(pts[0][1])}` : `L${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    d += ` C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d;
}

/** 山脊线：base 是平均高度，amp 起伏，n 个控制点 */
function ridgePts(seed, base, amp, n = 10, x0 = -60, x1 = W + 60) {
  const r = rng(seed);
  const a = r() * 6.28;
  const b = r() * 6.28;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = base - amp * (0.6 * Math.sin(x / 270 + a) + 0.32 * Math.sin(x / 117 + b) + 0.3 * (r() - 0.5));
    pts.push([x, y]);
  }
  return pts;
}

/** 山脊线往下封口成一块面 */
const fillDown = (pts, bottom = H) => `${curve(pts)} L${f1(pts[pts.length - 1][0])} ${bottom} L${f1(pts[0][0])} ${bottom} Z`;

/** 沿着一条线的 y 值（线性插值） */
function yAt(pts, x) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    if (x >= ax && x <= bx) return ay + ((by - ay) * (x - ax)) / (bx - ax || 1);
  }
  return pts[pts.length - 1][1];
}

/** 一排树冠（圆团）沿着一条线：雨林、红树林、云海都用它 */
function lumps(seed, pts, { step = 34, r0 = 26, r1 = 46, lift = 18, x0 = -60, x1 = W + 60 } = {}) {
  const r = rng(seed);
  const out = [];
  for (let x = x0; x <= x1; x += step * (0.7 + r() * 0.6)) {
    const rad = r0 + r() * (r1 - r0);
    out.push([x, yAt(pts, x) - r() * lift, rad]);
  }
  return out;
}

/** 冷杉（四姑娘山）：一层层锯齿的三角 */
function fir(x, base, h, w) {
  const t = base - h;
  const tiers = 5;
  const L = [];
  const R = [];
  for (let i = 1; i <= tiers; i++) {
    const y = t + (h * i) / tiers;
    const half = (w / 2) * (i / tiers);
    L.push(`${f1(x - half)} ${f1(y)}`, `${f1(x - half * 0.55)} ${f1(y - h * 0.06)}`);
    R.unshift(`${f1(x + half * 0.55)} ${f1(y - h * 0.06)}`, `${f1(x + half)} ${f1(y)}`);
  }
  return `M${f1(x)} ${f1(t)} L${L.join(' L')} L${R.join(' L')} Z`;
}

/** 金色落叶松 / 云杉（稻城亚丁）：圆一点的锥形 */
const cone = (x, base, h, w) => `M${f1(x)} ${f1(base - h)} C${f1(x + w * 0.18)} ${f1(base - h * 0.55)} ${f1(x + w * 0.5)} ${f1(base - h * 0.12)} ${f1(x + w * 0.5)} ${f1(base)} L${f1(x - w * 0.5)} ${f1(base)} C${f1(x - w * 0.5)} ${f1(base - h * 0.12)} ${f1(x - w * 0.18)} ${f1(base - h * 0.55)} ${f1(x)} ${f1(base - h)} Z`;

function Sky({ id, stops }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      {stops.map(([o, c], i) => (
        <stop key={i} offset={o} stopColor={c} />
      ))}
    </linearGradient>
  );
}

function Glow({ id, color, o = 0.9 }) {
  return (
    <radialGradient id={id}>
      <stop offset="0" stopColor={color} stopOpacity={o} />
      <stop offset=".45" stopColor={color} stopOpacity={o * 0.35} />
      <stop offset="1" stopColor={color} stopOpacity="0" />
    </radialGradient>
  );
}

function V({ id, a, b, oa = 1, ob = 1 }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={a} stopOpacity={oa} />
      <stop offset="1" stopColor={b} stopOpacity={ob} />
    </linearGradient>
  );
}

/** 一条横向的雾（画里自带的静态雾，外面 CSS 还有会飘的） */
function MistBand({ y, h, o = 0.7, color = '#FFFFFF', id }) {
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0" />
          <stop offset=".5" stopColor={color} stopOpacity={o} />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="-60" y={y} width={W + 120} height={h} fill={`url(#${id})`} />
    </>
  );
}

// ───────────────────────── 金马伦高原：晨雾里的茶园梯田 ─────────────────────────
function Cameron({ u }) {
  const far1 = ridgePts(11, 420, 46, 9);
  const far2 = ridgePts(12, 470, 54, 9);
  const hillA = [
    [-60, 600],
    [120, 560],
    [330, 540],
    [560, 566],
    [760, 620],
    [980, 700],
    [1200, 760],
    [1500, 790],
  ];
  const hillB = [
    [300, 860],
    [560, 740],
    [820, 662],
    [1060, 620],
    [1280, 628],
    [1500, 660],
  ];
  const hillC = [
    [-60, 860],
    [200, 820],
    [460, 838],
    [700, 900],
    [960, 960],
    [1500, 1000],
  ];
  const rows = (pts, n, gap0, seed) => {
    const r = rng(seed);
    return [...Array(n)].map((_, k) => {
      const dy = gap0 * (k + 1) * (1 + k * 0.07);
      const wob = (r() - 0.5) * 6;
      return pts.map(([x, y], i) => [x, y + dy + Math.sin(i * 1.7 + k) * 3 + wob]);
    });
  };
  const trees = [
    [250, 548, 44],
    [282, 545, 36],
    [1130, 624, 40],
    [1162, 622, 52],
    [1196, 626, 34],
    [612, 578, 30],
  ];
  return (
    <>
      <defs>
        <Sky id={`${u}s`} stops={[[0, '#D9E6E0'], [0.42, '#EEF1E6'], [0.62, '#F8F1DF'], [1, '#F3EAD6']]} />
        <Glow id={`${u}sun`} color="#FFF3D6" o={1} />
        <V id={`${u}a`} a="#A6C092" b="#7E9F6C" />
        <V id={`${u}b`} a="#93B381" b="#6B8F5C" />
        <V id={`${u}c`} a="#6F915F" b="#4F6F45" />
        <clipPath id={`${u}ca`}>
          <path d={fillDown(hillA)} />
        </clipPath>
        <clipPath id={`${u}cb`}>
          <path d={fillDown(hillB)} />
        </clipPath>
        <clipPath id={`${u}cc`}>
          <path d={fillDown(hillC)} />
        </clipPath>
      </defs>
      <rect width={W} height={H} fill={`url(#${u}s)`} />
      <circle cx="900" cy="300" r="460" fill={`url(#${u}sun)`} />
      <circle cx="900" cy="300" r="46" fill="#FFF9EA" opacity=".9" />
      <path d={fillDown(far1)} fill="#CBD8CF" />
      <path d={fillDown(far2)} fill="#B4C7B8" />
      <MistBand id={`${u}m1`} y={400} h={180} o={0.85} />
      <path d={fillDown(hillA)} fill={`url(#${u}a)`} />
      <g clipPath={`url(#${u}ca)`}>
        {rows(hillA, 22, 15, 3).map((p, k) => (
          <g key={k}>
            <path d={curve(p)} stroke="#5E8550" strokeWidth={4 + k * 0.45} strokeLinecap="round" fill="none" opacity=".5" />
            <path d={curve(p.map(([x, y]) => [x, y - 3 - k * 0.2]))} stroke="#C4D8A8" strokeWidth="1.2" fill="none" opacity=".55" />
          </g>
        ))}
      </g>
      {trees.map(([x, y, h], i) => (
        <g key={i}>
          <rect x={x - 1.5} y={y - h * 0.3} width="3" height={h * 0.32} fill="#4E5A44" />
          <ellipse cx={x} cy={y - h * 0.62} rx={h * 0.16} ry={h * 0.42} fill={i % 2 ? '#4C6B48' : '#557552'} />
        </g>
      ))}
      <MistBand id={`${u}m2`} y={560} h={150} o={0.6} />
      <path d={fillDown(hillB)} fill={`url(#${u}b)`} />
      <g clipPath={`url(#${u}cb)`}>
        {rows(hillB, 20, 17, 5).map((p, k) => (
          <g key={k}>
            <path d={curve(p)} stroke="#4F7645" strokeWidth={5 + k * 0.6} strokeLinecap="round" fill="none" opacity=".5" />
            <path d={curve(p.map(([x, y]) => [x, y - 4 - k * 0.25]))} stroke="#BCD39E" strokeWidth="1.4" fill="none" opacity=".5" />
          </g>
        ))}
      </g>
      <path d={fillDown(hillC)} fill={`url(#${u}c)`} />
      <g clipPath={`url(#${u}cc)`}>
        {rows(hillC, 12, 22, 9).map((p, k) => (
          <path key={k} d={curve(p)} stroke="#3F5F38" strokeWidth={7 + k * 0.9} strokeLinecap="round" fill="none" opacity=".45" />
        ))}
      </g>
      <MistBand id={`${u}m3`} y={880} h={160} o={0.5} color="#F3EEE4" />
    </>
  );
}

// ───────────────────────── 稻城亚丁：雪山破云而出，金色落叶松 ─────────────────────────
function Yading({ u }) {
  const r = rng(77);
  const trees = [];
  for (let row = 0; row < 7; row++) {
    const base = 760 + row * 38;
    const h = 34 + row * 13;
    for (let x = -40; x < W + 40; x += h * (0.42 + r() * 0.35)) {
      const gold = r() < 0.62;
      trees.push({ x: x + r() * 10, base: base + r() * 14, h: h * (0.8 + r() * 0.45), w: h * 0.42, c: gold ? (r() < 0.5 ? '#D4A85A' : '#C39143') : r() < 0.5 ? '#3E5C49' : '#4C6A52' });
    }
  }
  const cloud = lumps(31, ridgePts(32, 560, 16, 8), { step: 46, r0: 34, r1: 70, lift: 24 });
  const cloud2 = lumps(33, ridgePts(34, 640, 14, 8), { step: 52, r0: 40, r1: 80, lift: 20 });
  return (
    <>
      <defs>
        <Sky id={`${u}s`} stops={[[0, '#CFDFE0'], [0.45, '#E7EEEA'], [0.7, '#F5F2E8'], [1, '#F1EBDD']]} />
        <linearGradient id={`${u}lf`} x1="0" y1="0" x2="1" y2="0.2">
          <stop offset="0" stopColor="#FBFCFA" />
          <stop offset="1" stopColor="#E3EBEA" />
        </linearGradient>
        <linearGradient id={`${u}rf`} x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stopColor="#AFC0C4" />
          <stop offset="1" stopColor="#8EA2A9" />
        </linearGradient>
        <V id={`${u}cl`} a="#FFFFFF" b="#E4EBE8" />
        <V id={`${u}slope`} a="#C9A160" b="#9E7740" />
        <V id={`${u}meadow`} a="#B49A62" b="#7F6A3E" />
      </defs>
      <rect width={W} height={H} fill={`url(#${u}s)`} />
      {/* 两侧较远的雪山 */}
      <path d="M-60 640 L180 360 L250 300 L330 380 L560 640 Z" fill="#D8E2E2" />
      <path d="M250 300 L330 380 L300 420 L268 360 Z" fill="#C5D2D4" />
      <path d="M900 640 L1110 330 L1180 270 L1250 340 L1500 640 Z" fill="#D5E0E0" />
      <path d="M1180 270 L1250 340 L1500 640 L1340 640 Z" fill="#BCCBCE" />
      {/* 主峰：仙乃日，金字塔形 */}
      <path d="M430 660 L640 270 L720 160 L800 270 L1010 660 Z" fill={`url(#${u}lf)`} />
      <path d="M720 160 L800 270 L1010 660 L760 660 L742 420 Z" fill={`url(#${u}rf)`} />
      <path d="M720 160 L742 420 L760 660" stroke="#9AACB2" strokeWidth="2" fill="none" opacity=".7" />
      <path d="M600 420 L640 460 L620 520 M820 380 L860 470 L850 540 M680 470 L700 520 M560 560 L600 600" stroke="#7D8F96" strokeWidth="5" strokeLinecap="round" fill="none" opacity=".35" />
      <path d="M690 230 L705 250 L700 290 M745 215 L760 250" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".9" />
      {/* 云带 */}
      <g fill={`url(#${u}cl)`}>
        {cloud.map(([x, y, rr], i) => (
          <circle key={i} cx={f1(x)} cy={f1(y)} r={f1(rr)} />
        ))}
        <rect x="-60" y="560" width={W + 120} height="140" />
      </g>
      <MistBand id={`${u}m1`} y={520} h={200} o={0.75} />
      <g fill="#F4F6F2" opacity=".95">
        {cloud2.map(([x, y, rr], i) => (
          <circle key={i} cx={f1(x)} cy={f1(y)} r={f1(rr)} />
        ))}
        <rect x="-60" y="640" width={W + 120} height="120" />
      </g>
      {/* 落叶松坡 */}
      <path d={fillDown(ridgePts(41, 760, 20, 8))} fill={`url(#${u}slope)`} />
      {trees.map((t, i) => (
        <path key={i} d={cone(t.x, t.base, t.h, t.w)} fill={t.c} />
      ))}
      <path d={fillDown(ridgePts(43, 940, 12, 8))} fill={`url(#${u}meadow)`} />
      <path d="M560 1000 C 640 960, 700 950, 720 930 C 760 905, 820 900, 900 880" stroke="#D9E9E4" strokeWidth="10" fill="none" strokeLinecap="round" opacity=".8" />
      <MistBand id={`${u}m3`} y={900} h={140} o={0.45} color="#F3EEE4" />
    </>
  );
}

// ───────────────────────── 大汉山：晨光里的雨林小溪 ─────────────────────────
function TamanNegara({ u }) {
  const farLine = ridgePts(51, 400, 22, 10);
  const midLine = ridgePts(52, 480, 26, 10);
  const nearL = ridgePts(53, 560, 20, 10);
  const far = lumps(54, farLine, { step: 30, r0: 24, r1: 44, lift: 22 });
  const mid = lumps(55, midLine, { step: 36, r0: 30, r1: 56, lift: 26 });
  const near = lumps(56, nearL, { step: 44, r0: 36, r1: 66, lift: 30 });
  const r = rng(57);
  const trunks = [...Array(14)].map(() => [80 + r() * 1280, 300 + r() * 120, 4 + r() * 6]);
  const rocks = [
    [560, 860, 46, 20],
    [640, 900, 30, 13],
    [880, 840, 54, 22],
    [960, 905, 34, 14],
    [760, 760, 22, 9],
    [470, 950, 60, 24],
    [1050, 980, 70, 26],
    [700, 980, 26, 10],
  ];
  const fern = (x, y, s, flip, c) => {
    const k = flip ? -1 : 1;
    const leaves = [...Array(9)].map((_, i) => {
      const t = i / 8;
      const px = x + k * (40 * s * t + 70 * s * t * t);
      const py = y - 120 * s * t + 60 * s * t * t;
      const l = 26 * s * (1 - t * 0.7);
      return `M${f1(px)} ${f1(py)} q${f1(k * l * 0.3)} ${f1(-l * 0.9)} ${f1(k * l * 0.9)} ${f1(-l * 0.7)} M${f1(px)} ${f1(py)} q${f1(k * l * 0.9)} ${f1(l * 0.1)} ${f1(k * l * 1.1)} ${f1(l * 0.5)}`;
    });
    return (
      <g stroke={c} fill="none" strokeLinecap="round">
        <path d={`M${x} ${y} q${f1(k * 40 * s)} ${f1(-120 * s)} ${f1(k * 110 * s)} ${f1(-60 * s)}`} strokeWidth={3 * s} />
        <path d={leaves.join(' ')} strokeWidth={2.4 * s} />
      </g>
    );
  };
  return (
    <>
      <defs>
        <Sky id={`${u}s`} stops={[[0, '#E6EDDF'], [0.5, '#D5E2CF'], [1, '#C3D4BF']]} />
        <linearGradient id={`${u}ray`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFBEA" stopOpacity=".55" />
          <stop offset="1" stopColor="#FFFBEA" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${u}w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#D2E4DC" />
          <stop offset=".5" stopColor="#9CC2B7" />
          <stop offset="1" stopColor="#6E9F94" />
        </linearGradient>
        <V id={`${u}bank`} a="#54744F" b="#2F4730" />
        <V id={`${u}rock`} a="#6C736A" b="#3D433C" />
      </defs>
      <rect width={W} height={H} fill={`url(#${u}s)`} />
      {trunks.map(([x, y, w], i) => (
        <rect key={i} x={f1(x)} y={f1(y)} width={f1(w)} height="300" fill="#B5C4AF" opacity=".7" />
      ))}
      <g fill="#B8CBB2">
        {far.map(([x, y, rr], i) => (
          <circle key={i} cx={f1(x)} cy={f1(y)} r={f1(rr)} />
        ))}
        <path d={fillDown(farLine)} />
      </g>
      <MistBand id={`${u}m1`} y={420} h={160} o={0.7} />
      <g fill="#93AF8F">
        {mid.map(([x, y, rr], i) => (
          <circle key={i} cx={f1(x)} cy={f1(y)} r={f1(rr)} />
        ))}
        <path d={fillDown(midLine)} />
      </g>
      <g fill="#6F906C">
        {near.map(([x, y, rr], i) => (
          <circle key={i} cx={f1(x)} cy={f1(y)} r={f1(rr)} />
        ))}
        <path d={fillDown(nearL)} />
      </g>
      {/* 光柱 */}
      <g fill={`url(#${u}ray)`}>
        <path d="M300 -40 L420 -40 L980 1000 L760 1000 Z" opacity=".55" />
        <path d="M470 -40 L530 -40 L1100 1000 L1010 1000 Z" opacity=".4" />
        <path d="M150 -40 L220 -40 L620 1000 L480 1000 Z" opacity=".35" />
      </g>
      {/* 小溪：从中间远处流向画面下方 */}
      <path d="M690 640 C 650 700, 560 760, 520 830 C 480 900, 380 950, 300 1000 L1180 1000 C 1080 950, 960 900, 900 820 C 850 760, 770 700, 750 640 Z" fill={`url(#${u}w)`} />
      <path d="M690 640 C 650 700, 560 760, 520 830 C 480 900, 380 950, 300 1000 L-60 1000 L-60 620 C 200 600, 500 610, 690 640 Z" fill={`url(#${u}bank)`} />
      <path d="M750 640 C 770 700, 850 760, 900 820 C 960 900, 1080 950, 1180 1000 L1500 1000 L1500 610 C 1200 600, 950 615, 750 640 Z" fill={`url(#${u}bank)`} />
      <g stroke="#F2F8F4" strokeLinecap="round" fill="none" opacity=".75">
        <path d="M690 690 h48 M650 740 h70 M600 800 h120 M560 870 h170 M520 940 h230" strokeWidth="2" />
        <path d="M760 720 h40 M800 780 h60 M850 860 h90" strokeWidth="1.5" opacity=".7" />
      </g>
      {rocks.map(([x, y, rx, ry], i) => (
        <g key={i}>
          <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={`url(#${u}rock)`} />
          <ellipse cx={x - rx * 0.2} cy={y - ry * 0.45} rx={rx * 0.5} ry={ry * 0.25} fill="#EEF2E8" opacity=".35" />
        </g>
      ))}
      {/* 两侧的大树和板根 */}
      <path d="M40 -20 L96 -20 C 98 300, 104 560, 150 700 C 120 690, 80 700, 40 720 C 60 560, 50 300, 40 -20 Z" fill="#3F5340" />
      <path d="M1340 -20 L1390 -20 C 1384 300, 1380 540, 1420 700 C 1390 690, 1350 696, 1310 712 C 1336 560, 1340 300, 1340 -20 Z" fill="#40553F" />
      <path d="M96 40 C 160 200, 120 360, 190 520 M1340 80 C 1290 240, 1330 380, 1270 520" stroke="#556E4F" strokeWidth="3" fill="none" opacity=".7" />
      {fern(120, 1000, 1.4, false, '#2F4A31')}
      {fern(260, 1010, 1.1, false, '#3E5C3D')}
      {fern(1330, 1000, 1.4, true, '#2F4A31')}
      {fern(1180, 1012, 1.0, true, '#466A44')}
      <MistBand id={`${u}m2`} y={600} h={120} o={0.55} />
    </>
  );
}

// ───────────────────────── 九寨沟：安静的碧绿湖面与倒影 ─────────────────────────
function Jiuzhaigou({ u }) {
  const shore = 580;
  const far = ridgePts(61, 300, 40, 9);
  const mountL = [
    [-60, 260],
    [140, 230],
    [330, 300],
    [520, 420],
    [700, 520],
    [800, 580],
  ];
  const mountR = [
    [600, 580],
    [760, 470],
    [960, 330],
    [1140, 250],
    [1300, 280],
    [1500, 240],
  ];
  const r = rng(63);
  const dots = [];
  const addDots = (pts, n, seed) => {
    const rr = rng(seed);
    for (let i = 0; i < n; i++) {
      const x = pts[0][0] + rr() * (pts[pts.length - 1][0] - pts[0][0]);
      const top = yAt(pts, x);
      const y = top + 12 + rr() * (shore - top - 8);
      const c = ['#C98950', '#D8B565', '#B5653F', '#4F7259', '#5E8264', '#E0C27A'][Math.floor(rr() * 6)];
      dots.push([x, y, 7 + rr() * 9 * (y / shore), c]);
    }
  };
  addDots(mountL, 170, 64);
  addDots(mountR, 190, 65);
  const logs = [...Array(9)].map(() => [300 + r() * 840, 720 + r() * 250, 120 + r() * 160, -20 + r() * 40]);
  const scene = (
    <>
      <path d={fillDown(mountL, shore)} fill={`url(#${u}mt)`} />
      <path d={fillDown(mountR, shore)} fill={`url(#${u}mt2)`} />
      {dots.map(([x, y, rr, c], i) => (
        <ellipse key={i} cx={f1(x)} cy={f1(y)} rx={f1(rr * 0.7)} ry={f1(rr)} fill={c} opacity=".9" />
      ))}
    </>
  );
  return (
    <>
      <defs>
        <Sky id={`${u}s`} stops={[[0, '#DCE8E4'], [0.5, '#EEF1EA'], [1, '#F5F1E6']]} />
        <V id={`${u}mt`} a="#7E9C86" b="#4F7060" />
        <V id={`${u}mt2`} a="#86A28C" b="#557664" />
        <linearGradient id={`${u}lake`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7FC6BA" />
          <stop offset=".35" stopColor="#47A79C" />
          <stop offset=".75" stopColor="#2F8E89" />
          <stop offset="1" stopColor="#287F7C" />
        </linearGradient>
        <V id={`${u}tint`} a="#3FA49A" b="#2E8C88" oa={0.55} ob={0.75} />
      </defs>
      <rect width={W} height={H} fill={`url(#${u}s)`} />
      <path d={fillDown(far, shore)} fill="#BCCDC6" />
      <MistBand id={`${u}m0`} y={380} h={160} o={0.6} />
      {scene}
      <rect x="-60" y={shore} width={W + 120} height={H - shore} fill={`url(#${u}lake)`} />
      {/* 倒影 */}
      <g transform={`translate(0 ${shore * 2}) scale(1 -1)`} opacity=".42">
        <path d={fillDown(far, shore)} fill="#9CC7BE" />
        {scene}
      </g>
      <rect x="-60" y={shore} width={W + 120} height={H - shore} fill={`url(#${u}tint)`} />
      {/* 水底的倒木（五花海） */}
      <g stroke="#E8DDBF" strokeLinecap="round" opacity=".38">
        {logs.map(([x, y, l, a], i) => (
          <path key={i} d={`M${f1(x)} ${f1(y)} l${f1(l * Math.cos((a * Math.PI) / 180))} ${f1(l * Math.sin((a * Math.PI) / 180))}`} strokeWidth={3 + (y - 700) / 60} />
        ))}
      </g>
      <g stroke="#F4FBF8" strokeLinecap="round" opacity=".5">
        <path d="M560 640 h160 M820 660 h120 M380 700 h140 M900 720 h180 M520 780 h220 M300 860 h160 M860 880 h260" strokeWidth="1.4" />
      </g>
      <MistBand id={`${u}m1`} y={520} h={120} o={0.75} />
    </>
  );
}

// ───────────────────────── 京那巴鲁山：云海上的金色日出 ─────────────────────────
function Kinabalu({ u }) {
  const banks = [
    { line: ridgePts(81, 600, 10, 8), seed: 82, top: '#FCE7BC', bot: '#F2E3CC', step: 54, r0: 36, r1: 70 },
    { line: ridgePts(83, 680, 14, 8), seed: 84, top: '#FBEBD0', bot: '#E9DDCB', step: 60, r0: 44, r1: 84 },
    { line: ridgePts(85, 780, 18, 8), seed: 86, top: '#F8EFE0', bot: '#DCD1C2', step: 70, r0: 52, r1: 98 },
    { line: ridgePts(87, 900, 20, 8), seed: 88, top: '#F6F0E6', bot: '#D3C8B8', step: 80, r0: 60, r1: 110 },
  ];
  return (
    <>
      <defs>
        <Sky id={`${u}s`} stops={[[0, '#D8E0DC'], [0.35, '#EDE6D4'], [0.55, '#F7DCA6'], [0.62, '#F4CB86'], [1, '#EFD9B4']]} />
        <Glow id={`${u}sun`} color="#FFE7AE" o={1} />
        {banks.map((b, i) => (
          <linearGradient key={i} id={`${u}b${i}`} x1="0" y1={b.line[0][1] - b.r1} x2="0" y2={b.line[0][1] + 120} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={b.top} />
            <stop offset="1" stopColor={b.bot} />
          </linearGradient>
        ))}
        <V id={`${u}gr`} a="#5C564C" b="#36322C" />
      </defs>
      <rect width={W} height={H} fill={`url(#${u}s)`} />
      <circle cx="720" cy="575" r="520" fill={`url(#${u}sun)`} />
      <g stroke="#FFF2CE" strokeWidth="2" opacity=".35">
        {[...Array(9)].map((_, i) => {
          const a = Math.PI + (i + 1) * (Math.PI / 10);
          return <path key={i} d={`M${720 + Math.cos(a) * 110} ${575 + Math.sin(a) * 110} L${720 + Math.cos(a) * 520} ${575 + Math.sin(a) * 520}`} />;
        })}
      </g>
      <circle cx="720" cy="575" r="64" fill="#FFF6DC" />
      <circle cx="720" cy="575" r="92" fill="#FFF1C8" opacity=".35" />
      {banks.map((b, i) => (
        <g key={i} fill={`url(#${u}b${i})`}>
          {lumps(b.seed, b.line, { step: b.step, r0: b.r0, r1: b.r1, lift: 16 }).map(([x, y, rr], k) => (
            <circle key={k} cx={f1(x)} cy={f1(y)} r={f1(rr)} />
          ))}
          <path d={fillDown(b.line)} />
        </g>
      ))}
      {/* 花岗岩山峰（左：南峰、驴耳；右：低峰），朝太阳的一侧镶金边 */}
      <path d="M-60 1000 L-60 470 L40 430 L80 380 L110 420 L170 330 L200 300 L230 352 L290 400 L330 470 L400 520 L460 640 L520 760 L560 1000 Z" fill={`url(#${u}gr)`} />
      <path d="M170 330 L200 300 L230 352 L290 400 L330 470 L400 520 L460 640 L520 760" stroke="#E9BC6E" strokeWidth="3" fill="none" opacity=".8" strokeLinejoin="round" />
      <path d="M1500 1000 L1500 420 L1400 400 L1350 330 L1310 370 L1270 300 L1240 340 L1180 420 L1120 470 L1050 560 L990 700 L940 1000 Z" fill={`url(#${u}gr)`} />
      <path d="M1270 300 L1240 340 L1180 420 L1120 470 L1050 560 L990 700 L960 820" stroke="#E9BC6E" strokeWidth="3" fill="none" opacity=".8" strokeLinejoin="round" />
      <g stroke="#837A6C" strokeWidth="3" opacity=".35" strokeLinecap="round">
        <path d="M120 520 L220 600 M80 640 L200 720 M300 560 L360 640 M1300 480 L1220 560 M1380 600 L1260 690 M1150 560 L1100 640" />
      </g>
      <MistBand id={`${u}m1`} y={560} h={110} o={0.5} color="#FFF6E2" />
    </>
  );
}

// ───────────────────────── 四姑娘山：雨后松林，雾在树间 ─────────────────────────
function Siguniang({ u }) {
  const layers = [
    { seed: 91, base: 430, amp: 30, h: 64, w: 30, c: '#C1CDC5', gap: 22 },
    { seed: 92, base: 530, amp: 34, h: 92, w: 42, c: '#9DB1A4', gap: 30 },
    { seed: 93, base: 650, amp: 36, h: 128, w: 58, c: '#6E877A', gap: 40 },
    { seed: 94, base: 800, amp: 34, h: 180, w: 78, c: '#4A6556', gap: 54 },
    { seed: 95, base: 960, amp: 26, h: 260, w: 110, c: '#2E4337', gap: 80 },
  ];
  return (
    <>
      <defs>
        <Sky id={`${u}s`} stops={[[0, '#D6DFDA'], [0.55, '#E8ECE6'], [1, '#EFEFE8']]} />
        <V id={`${u}pk`} a="#F2F5F3" b="#D5DEDC" />
      </defs>
      <rect width={W} height={H} fill={`url(#${u}s)`} />
      {/* 远处的幺妹峰，淡淡的 */}
      <path d="M560 420 L700 190 L740 130 L790 200 L940 420 Z" fill={`url(#${u}pk)`} opacity=".9" />
      <path d="M740 130 L790 200 L940 420 L780 420 L760 260 Z" fill="#C3CFCD" opacity=".8" />
      <path d="M440 430 L600 300 L640 270 L690 330 L760 430 Z M860 430 L960 320 L1000 290 L1060 350 L1140 430 Z" fill="#DCE4E1" opacity=".85" />
      {layers.map((L, i) => {
        const line = ridgePts(L.seed, L.base, L.amp, 9);
        const r = rng(L.seed + 100);
        const trees = [];
        for (let x = -60; x < W + 60; x += L.gap * (0.6 + r() * 0.7)) trees.push([x, yAt(line, x) + r() * 10, L.h * (0.7 + r() * 0.5), L.w * (0.8 + r() * 0.4)]);
        return (
          <g key={i}>
            <g fill={L.c}>
              {trees.map(([x, y, h, w], k) => (
                <path key={k} d={fir(x, y, h, w)} />
              ))}
              <path d={fillDown(line.map(([x, y]) => [x, y + 6]))} />
            </g>
            {i < layers.length - 1 && <MistBand id={`${u}m${i}`} y={L.base - 30} h={150 + i * 20} o={0.8 - i * 0.08} />}
          </g>
        );
      })}
      <MistBand id={`${u}mz`} y={880} h={160} o={0.35} color="#F3EEE4" />
    </>
  );
}

// ───────────────────────── 瓜拉雪兰莪：暮色里的红树林与萤火 ─────────────────────────
function KualaSelangor({ u }) {
  const water = 618;
  // 两岸的红树林：后面一排淡一点，前面一排深一点；树冠是很多小团，顶比较平
  const bank = (seed, x0, x1, top, slope, rows) => {
    const r = rng(seed);
    const out = [];
    rows.forEach(([lift, rMin, rMax, step], ri) => {
      for (let x = x0; x <= x1; x += step * (0.6 + r() * 0.7)) {
        const t = (x - x0) / (x1 - x0);
        const y = top + slope * t + lift + (r() - 0.5) * 26;
        out.push([x, y, rMin + r() * (rMax - rMin), ri]);
      }
    });
    return out;
  };
  const L1 = bank(101, -80, 560, 330, 230, [
    [-20, 26, 46, 30],
    [40, 22, 40, 26],
    [110, 18, 34, 22],
  ]);
  const R1 = bank(102, 900, 1520, 560, -250, [
    [-20, 26, 48, 30],
    [40, 22, 40, 26],
    [110, 18, 34, 22],
  ]);
  const r = rng(103);
  const ff = [];
  const sprinkle = (arr, n) => {
    if (!arr.length) return;
    for (let i = 0; i < n; i++) {
      const [x, y, rr] = arr[Math.floor(r() * arr.length)];
      ff.push([x + (r() - 0.5) * rr * 1.6, y + (r() - 0.4) * rr * 1.2, 1.1 + r() * 2, r()]);
    }
  };
  sprinkle(L1, 80);
  sprinkle(R1, 80);
  const stars = [...Array(30)].map(() => [r() * W, r() * 320, 0.6 + r() * 1.1, 0.2 + r() * 0.5]);
  const roots = (x0, x1, seed) => {
    const rr = rng(seed);
    return [...Array(34)].map(() => {
      const x = x0 + rr() * (x1 - x0);
      const y0 = water - 30 - rr() * 70;
      return `M${f1(x)} ${f1(y0)} q${f1((rr() - 0.5) * 34)} ${f1(26 + rr() * 22)} ${f1((rr() - 0.5) * 26)} ${f1(water - y0 + 6)}`;
    });
  };
  // 余晖在水面上：一串长短不一的碎光，不是一整块
  const shimmer = [...Array(26)].map((_, i) => {
    const y = water + 10 + i * i * 0.62 + i * 6;
    const w = (40 + r() * 120) * (1 - i / 34);
    const x = 720 + (r() - 0.5) * 60 * (1 + i / 10) - w / 2;
    return [x, y, w, 0.25 + 0.5 * (1 - i / 26) * r()];
  });
  const canopy = (arr, row, fill) => (
    <g fill={fill}>
      {arr
        .filter((c) => c[3] === row)
        .map(([x, y, rr], i) => (
          <ellipse key={i} cx={f1(x)} cy={f1(y)} rx={f1(rr * 1.25)} ry={f1(rr * 0.85)} />
        ))}
    </g>
  );
  return (
    <>
      <defs>
        <Sky id={`${u}s`} stops={[[0, '#151D19'], [0.36, '#1F2B25'], [0.5, '#2F3830'], [0.58, '#5A5039'], [0.618, '#7E6443']]} />
        <linearGradient id={`${u}w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3A3729" />
          <stop offset=".18" stopColor="#25302A" />
          <stop offset="1" stopColor="#131B17" />
        </linearGradient>
        <radialGradient id={`${u}glow`} cx="50%" cy="0%" r="60%">
          <stop offset="0" stopColor="#C89A5C" stopOpacity=".45" />
          <stop offset="1" stopColor="#C89A5C" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${u}ff`}>
          <stop offset="0" stopColor="#FFF6D8" />
          <stop offset=".4" stopColor="#E9D29A" stopOpacity=".9" />
          <stop offset="1" stopColor="#E9D29A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${u}s)`} />
      {stars.map(([x, y, rr, o], i) => (
        <circle key={i} cx={f1(x)} cy={f1(y)} r={f1(rr)} fill="#F1ECE2" opacity={f1(o)} />
      ))}
      {/* 远处低低的林线 */}
      <path d={fillDown(ridgePts(104, water - 12, 7, 16), water + 2)} fill="#18201B" />
      <rect x="-60" y={water} width={W + 120} height={H - water} fill={`url(#${u}w)`} />
      <ellipse cx="720" cy={water} rx="420" ry="160" fill={`url(#${u}glow)`} />
      <g fill="#D9AE6E">
        {shimmer.map(([x, y, w, o], i) => (
          <rect key={i} x={f1(x)} y={f1(y)} width={f1(w)} height={f1(1.4 + i * 0.12)} rx="1" opacity={f1(o)} />
        ))}
      </g>
      {/* 倒影 */}
      <g transform={`translate(0 ${water * 2}) scale(1 -1)`} opacity=".32">
        {canopy(L1, 0, '#0F1612')}
        {canopy(R1, 0, '#0F1612')}
      </g>
      {/* 红树林：后排 → 前排 */}
      {canopy(L1, 0, '#1A241E')}
      {canopy(R1, 0, '#1A241E')}
      {canopy(L1, 1, '#141C17')}
      {canopy(R1, 1, '#141C17')}
      {canopy(L1, 2, '#0F1511')}
      {canopy(R1, 2, '#0F1511')}
      <path d={`M-80 ${water - 60} L560 ${water - 30} L560 ${water} L-80 ${water} Z`} fill="#0F1511" />
      <path d={`M900 ${water - 30} L1520 ${water - 60} L1520 ${water} L900 ${water} Z`} fill="#0F1511" />
      <g stroke="#0F1511" strokeWidth="2.6" fill="none" strokeLinecap="round">
        {roots(-40, 560, 105).map((d, i) => (
          <path key={i} d={d} />
        ))}
        {roots(900, 1480, 106).map((d, i) => (
          <path key={`b${i}`} d={d} />
        ))}
      </g>
      {/* 小舢舨和撑篙的人 */}
      <g fill="#0C110E">
        <path d={`M600 ${water + 136} q70 16 160 0 q-8 14 -24 18 q-56 9 -112 0 q-16 -4 -24 -18 Z`} />
        <path d={`M676 ${water + 136} q-2 -16 4 -22 q6 -6 12 0 q4 6 2 22 Z`} />
        <circle cx="685" cy={water + 106} r="6" />
      </g>
      <path d={`M700 ${water + 92} L752 ${water + 196}`} stroke="#0C110E" strokeWidth="2.4" strokeLinecap="round" />
      <path d={`M612 ${water + 158} q68 10 136 0`} stroke="#C89A5C" strokeWidth="1.2" fill="none" opacity=".35" />
      {/* 停在树上的萤火（两组交替呼吸） */}
      <g className="ff-tree ff-a">
        {ff.filter((_, i) => i % 2 === 0).map(([x, y, rr], i) => (
          <circle key={i} cx={f1(x)} cy={f1(y)} r={f1(rr * 2.4)} fill={`url(#${u}ff)`} />
        ))}
      </g>
      <g className="ff-tree ff-b">
        {ff.filter((_, i) => i % 2 === 1).map(([x, y, rr], i) => (
          <circle key={i} cx={f1(x)} cy={f1(y)} r={f1(rr * 2.4)} fill={`url(#${u}ff)`} />
        ))}
      </g>
    </>
  );
}

const PAINTERS = {
  welcome: Cameron,
  intuition: Yading,
  life: TamanNegara,
  treasure: Jiuzhaigou,
  wishes: Kinabalu,
  nogo: Siguniang,
  dusk: KualaSelangor,
};

/** 一整张风景（铺满容器；海报也拿它序列化成图片） */
export const Painting = memo(function Painting({ id, className = '' }) {
  const u = `sc${useId().replace(/:/g, '')}`;
  const P = PAINTERS[id] || Cameron;
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" width={W} height={H} aria-hidden="true">
      <P u={u} />
    </svg>
  );
});
