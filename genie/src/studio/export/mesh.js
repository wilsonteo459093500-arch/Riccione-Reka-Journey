// 三角网格（导出用，纯 JS）：按材质分组的三角形，坐标在导出坐标系（米，X 向右、Y 向上 = −平面 y、Z 向上）。
// 从外面看逆时针（法线朝外）。写 DAE / OBJ 时才去重顶点、算平面法线。

export class Mesh {
  constructor() {
    this.groups = new Map(); // 材质符号 → number[]（每 9 个数一个三角形）
  }
  tri(m, a, b, c) {
    let g = this.groups.get(m);
    if (!g) this.groups.set(m, (g = []));
    g.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  }
  quad(m, a, b, c, d) {
    this.tri(m, a, b, c);
    this.tri(m, a, c, d);
  }
  /** 轴对齐的方块 */
  box(m, x0, y0, z0, x1, y1, z1) {
    if (x1 - x0 < 1e-6 || y1 - y0 < 1e-6 || z1 - z0 < 1e-6) return;
    this.prism(m, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1);
  }
  /**
   * 竖直棱柱：底面多边形 pts（XY，凸的，任意方向，会自己改成逆时针）从 z0 拉到 z1。
   * 转过的方块、圆柱（n 边）、椭圆柱都走这里。
   */
  prism(m, pts0, z0, z1) {
    if (z1 - z0 < 1e-6 || pts0.length < 3) return;
    let a = 0;
    for (let i = 0; i < pts0.length; i++) {
      const p = pts0[i];
      const q = pts0[(i + 1) % pts0.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    if (Math.abs(a) < 1e-12) return;
    const pts = a > 0 ? pts0 : [...pts0].reverse();
    const n = pts.length;
    const top = pts.map(([x, y]) => [x, y, z1]);
    const bot = pts.map(([x, y]) => [x, y, z0]);
    for (let i = 1; i < n - 1; i++) {
      this.tri(m, top[0], top[i], top[i + 1]);
      this.tri(m, bot[0], bot[i + 1], bot[i]);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.quad(m, bot[i], bot[j], top[j], top[i]);
    }
  }
  /**
   * 两点之间的一根方料（截面：水平宽 w、竖直高 h；斜的扶手也是上边朝上）。p, q = [x, y, z]
   */
  bar(m, p, q, w, h) {
    const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    const L = Math.hypot(d[0], d[1], d[2]);
    if (L < 1e-4) return;
    const X = d.map((v) => v / L);
    // 水平方向的侧向量（垂直于走向）
    let S = [-X[1], X[0], 0];
    const sl = Math.hypot(S[0], S[1]);
    S = sl < 1e-6 ? [0, 1, 0] : [S[0] / sl, S[1] / sl, 0];
    // 「上」：U = X × S（X, S, U 是右手系；水平的料 U 就是 +Z）
    const U = [X[1] * S[2] - X[2] * S[1], X[2] * S[0] - X[0] * S[2], X[0] * S[1] - X[1] * S[0]];
    const c = (t, s, u) => [p[0] + X[0] * t + S[0] * s + U[0] * u, p[1] + X[1] * t + S[1] * s + U[1] * u, p[2] + X[2] * t + S[2] * s + U[2] * u];
    const hw = w / 2;
    const hh = h / 2;
    // 8 个角：bit0 = t（0 / L），bit1 = s（−/+），bit2 = u（−/+）
    const k = [];
    for (let i = 0; i < 8; i++) k.push(c(i & 1 ? L : 0, i & 2 ? hw : -hw, i & 4 ? hh : -hh));
    this.hexa(m, k);
  }
  /** 六面体（8 个角按 bit 顺序：bit0 = 第一轴，bit1 = 第二轴，bit2 = 第三轴；三轴是右手系）*/
  hexa(m, k) {
    this.quad(m, k[4], k[5], k[7], k[6]); // +3
    this.quad(m, k[0], k[2], k[3], k[1]); // −3
    this.quad(m, k[0], k[1], k[5], k[4]); // −2
    this.quad(m, k[2], k[6], k[7], k[3]); // +2
    this.quad(m, k[1], k[3], k[7], k[5]); // +1
    this.quad(m, k[0], k[4], k[6], k[2]); // −1
  }
  get tris() {
    let n = 0;
    for (const g of this.groups.values()) n += g.length / 9;
    return n;
  }
  get empty() {
    return this.tris === 0;
  }
  /** 外框 [minX, minY, minZ, maxX, maxY, maxZ] */
  bbox() {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const g of this.groups.values())
      for (let i = 0; i < g.length; i += 3)
        for (let k = 0; k < 3; k++) {
          b[k] = Math.min(b[k], g[i + k]);
          b[k + 3] = Math.max(b[k + 3], g[i + k]);
        }
    return b;
  }
  /** 有向体积（封闭、法线朝外 → 正的体积） */
  volume() {
    let v = 0;
    for (const g of this.groups.values())
      for (let i = 0; i < g.length; i += 9) {
        const [ax, ay, az, bx, by, bz, cx, cy, cz] = g.slice(i, i + 9);
        v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
      }
    return v / 6;
  }
}

/** 体块的一块（家具本地坐标：x 右、y 上、z 前）→ 组件坐标（x, −z, y）的网格 */
export function addPart(mesh, p) {
  const z0 = p.y;
  const z1 = p.y + p.h;
  if (p.s === 'box') {
    const a = ((p.ry || 0) * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const pts = [[-p.w / 2, -p.d / 2], [p.w / 2, -p.d / 2], [p.w / 2, p.d / 2], [-p.w / 2, p.d / 2]].map(([x, z]) => [p.x + x * c + z * s, -(p.z - x * s + z * c)]);
    mesh.prism(p.m, pts, z0, z1);
    return;
  }
  const n = p.seg || 12;
  const rx = p.s === 'cyl' ? p.r : p.rx;
  const rz = p.s === 'cyl' ? p.r : p.rz;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push([p.x + Math.cos(t) * rx, -(p.z + Math.sin(t) * rz)]);
  }
  mesh.prism(p.m, pts, z0, z1);
}
