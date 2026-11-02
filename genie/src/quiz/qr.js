// 二维码（QR Code，ISO/IEC 18004），只做「字节模式」：把一条网址编成黑白方块，再画成 SVG 路径。
// 用在许愿模式的「分享海报」：展厅的 iPad 是大家共用的，不走系统分享面板、不存相簿，
// 而是让客人用自己的手机扫一下 —— 蓝图在他手机上打开，在那里存图、分享。
// 链接很长（约 1.3k 字），默认纠错级别 L（大约 26 版，121 × 121 格）。
//
// qrMatrix(text, ecl?) → boolean[][]（true = 深色）；qrPath(matrix, border?) → SVG 的 d。

// 每个纠错块的纠错码字数、纠错块数（按版本 1–40；下标 0 不用）
const ECC_PER_BLOCK = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
const NUM_BLOCKS = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};
const ECL_BITS = { L: 1, M: 0, Q: 3, H: 2 };

/** 一个版本里能放资料的格子数（扣掉定位、校正、时序、格式 / 版本资讯） */
function rawModules(ver) {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const a = Math.floor(ver / 7) + 2;
    n -= (25 * a - 10) * a - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}
const dataCodewords = (ver, ecl) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver];

/** GF(2^8) 乘法（本原多项式 0x11D） */
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/** Reed–Solomon 生成多项式（degree 个系数，最高次项省略） */
function rsDivisor(degree) {
  const r = new Array(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = gfMul(r[j], root);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return r;
}

function rsRemainder(data, div) {
  const r = div.map(() => 0);
  for (const b of data) {
    const f = b ^ r.shift();
    r.push(0);
    div.forEach((c, i) => (r[i] ^= gfMul(c, f)));
  }
  return r;
}

function alignPositions(ver, size) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let p = size - 7; out.length < n; p -= step) out.splice(1, 0, p);
  return out;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** 规范里的四项扣分：连续同色、2×2 同色块、像定位图形的 1:1:3:1:1、深浅比例 —— 选扣分最少的遮罩 */
function penalty(mod) {
  const n = mod.length;
  let p = 0;
  const FINDER_A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const FINDER_B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const scan = (get) => {
    for (let a = 0; a < n; a++) {
      let run = 1;
      for (let b = 1; b < n; b++) {
        if (get(a, b) === get(a, b - 1)) {
          run++;
          if (run === 5) p += 3;
          else if (run > 5) p += 1;
        } else run = 1;
      }
      for (let b = 0; b + 11 <= n; b++) {
        let fa = true;
        let fb = true;
        for (let k = 0; k < 11 && (fa || fb); k++) {
          const v = get(a, b + k) ? 1 : 0;
          if (v !== FINDER_A[k]) fa = false;
          if (v !== FINDER_B[k]) fb = false;
        }
        if (fa) p += 40;
        if (fb) p += 40;
      }
    }
  };
  scan((y, x) => mod[y][x]);
  scan((x, y) => mod[y][x]);
  let dark = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (mod[y][x]) dark++;
      if (x + 1 < n && y + 1 < n) {
        const c = mod[y][x];
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
      }
    }
  }
  p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return p;
}

/** 一段文字 → 二维码方阵（true = 深色）。太长（超过 40 版）回 null。 */
export function qrMatrix(text, ecl = 'L') {
  const bytes = [...new TextEncoder().encode(String(text))];
  let ver = 1;
  while (ver <= 40 && 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8 > dataCodewords(ver, ecl) * 8) ver++;
  if (ver > 40) return null;

  // 资料位：模式 0100（字节）+ 长度 + 内容 + 结束符 + 补齐
  const cap = dataCodewords(ver, ecl) * 8;
  const bits = [];
  const put = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(4, 4);
  put(bytes.length, ver <= 9 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((v, b) => (v << 1) | b, 0));

  // 分块、算纠错码、交错
  const nb = NUM_BLOCKS[ecl][ver];
  const el = ECC_PER_BLOCK[ecl][ver];
  const raw = Math.floor(rawModules(ver) / 8);
  const nShort = nb - (raw % nb);
  const shortLen = Math.floor(raw / nb);
  const div = rsDivisor(el);
  const blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - el + (i < nShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < nShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const words = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((b, j) => {
      if (i !== shortLen - el || j >= nShort) words.push(b[i]);
    });
  }

  // 画格子：功能图形先占位，再按「之」字形填资料
  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFn = (x, y, dark) => {
    mod[y][x] = dark;
    fn[y][x] = true;
  };
  for (let i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(x, y, d !== 2 && d !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  const ap = alignPositions(ver, size);
  for (let i = 0; i < ap.length; i++) {
    for (let j = 0; j < ap.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  const drawFormat = (mask) => {
    const d = (ECL_BITS[ecl] << 3) | mask;
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const fb = ((d << 10) | rem) ^ 0x5412;
    const b = (i) => ((fb >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) setFn(8, i, b(i));
    setFn(8, 7, b(6));
    setFn(8, 8, b(7));
    setFn(7, 8, b(8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, b(i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, b(i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, b(i));
    setFn(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const vb = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((vb >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFn(a, b, dark);
      setFn(b, a, dark);
    }
  }
  let bit = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!fn[y][x] && bit < words.length * 8) {
          mod[y][x] = ((words[bit >>> 3] >>> (7 - (bit & 7))) & 1) !== 0;
          bit++;
        }
      }
    }
  }

  const flip = (m) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x];
  };
  let best = 0;
  let bestP = Infinity;
  for (let m = 0; m < 8; m++) {
    flip(m);
    drawFormat(m);
    const p = penalty(mod);
    if (p < bestP) {
      bestP = p;
      best = m;
    }
    flip(m);
  }
  flip(best);
  drawFormat(best);
  return mod;
}

/** 方阵 → SVG 路径（一行里连着的深色格合成一条；border = 四周留白的格数，规范要 4 格） */
export function qrPath(matrix, border = 4) {
  let d = '';
  matrix.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      if (!row[x]) {
        x++;
        continue;
      }
      let e = x;
      while (e < row.length && row[e]) e++;
      d += `M${x + border} ${y + border}h${e - x}v1h${x - e}z`;
      x = e;
    }
  });
  return d;
}
