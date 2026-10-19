// 家具的「体块」配方（SPEC §4.4）：每件家具几块到几十块方块 / 棱柱，真实外尺寸、认得出的轮廓、每个面一个材质。
// 3D 工作室里的程序化家具一张床就上万个三角形，SketchUp 吃不消，设计师也会换成自己的模型 —— 导出只要体块。
//
// 坐标 = furniture.js 的本地坐标：x 向右、y 向上、z 向前（家具的正面），原点在占地中心的地面上；单位米。
// 一块 = { s: 'box' | 'cyl' | 'ell', 尺寸, x, y, z（底面中心）, ry（绕 y 转，度，和 three 的 rotation.y 同向）, m（材质） }
//   box: w × h × d；cyl: 半径 r、高 h、seg 边；ell: 椭圆柱 rx × rz、高 h
//   plan: false = 不画进 DXF 的平面图块（脚、踢脚）；hi: true = 在平面图里画虚线（吊柜、电视、镜子、画、吊灯、窗帘杆）
//   extra: true = 不算进名义的 W × D × H（椅子、吧凳、贵妃位、台灯、镜子、玩具箱、显示器…）
// m = 表面 id（SLOTS：cabinetry、woodwork…）或固定材质 'fixed__black' 这种（palette.js）。

const fx = (n) => `fixed__${n}`;
const B = (w, h, d, x, y, z, m, o) => ({ s: 'box', w, h, d, x, y, z, m, ry: 0, ...o });
const C = (r, h, x, y, z, m, seg = 12, o) => ({ s: 'cyl', r, h, x, y, z, m, seg, ry: 0, ...o });
const E = (rx, rz, h, x, y, z, m, o) => ({ s: 'ell', rx, rz, h, x, y, z, m, seg: 16, ry: 0, ...o });
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

/** 四条方脚（不画进平面图） */
function legs(W, D, h, m, { inset = 0.05, t = 0.04 } = {}) {
  const out = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(B(t, h, t, sx * (W / 2 - inset), 0, sz * (D / 2 - inset), m, { plan: false }));
  return out;
}

/** 一组块整体挪到 (x, z)、绕 y 转 ry 度 */
function place(parts, x, z, ry = 0, o = {}) {
  const a = (ry * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return parts.map((p) => ({ ...p, x: x + p.x * c + p.z * s, z: z - p.x * s + p.z * c, ry: (p.ry || 0) + ry, ...o }));
}

/** 餐椅（也是单独的「餐椅」） */
function chair() {
  return [
    B(0.43, 0.05, 0.42, 0, 0.42, 0.015, 'upholstery'),
    B(0.42, 0.045, 0.4, 0, 0.38, 0.01, 'woodwork'),
    B(0.03, 0.42, 0.03, -0.19, 0, 0.18, 'woodwork', { plan: false }),
    B(0.03, 0.42, 0.03, 0.19, 0, 0.18, 'woodwork', { plan: false }),
    B(0.03, 0.8, 0.03, -0.19, 0, -0.17, 'woodwork'),
    B(0.03, 0.8, 0.03, 0.19, 0, -0.17, 'woodwork'),
    B(0.42, 0.13, 0.03, 0, 0.64, -0.2, 'woodwork'),
  ];
}

function sofaClassic(W, D, lshape) {
  const n = W > 2.3 ? 3 : 2;
  const inner = W - 0.32;
  const cw = lshape ? Math.min(0.85, 0.4 * W) : 0;
  const parts = [
    B(W, 0.17, D, 0, 0.13, 0, 'upholstery'),
    B(W, 0.53, 0.2, 0, 0.13, -D / 2 + 0.1, 'upholstery'),
    B(0.16, 0.5, D, -(W / 2 - 0.08), 0.13, 0, 'upholstery'),
    lshape ? B(0.16, 0.5, D + 0.8, W / 2 - 0.08, 0.13, 0.4, 'upholstery', { extra: true }) : B(0.16, 0.5, D, W / 2 - 0.08, 0.13, 0, 'upholstery'),
  ];
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 0.16 + (i + 0.5) * (inner / n);
    parts.push(B(inner / n - 0.01, 0.15, D - 0.2, x, 0.3, 0.1, 'upholstery'));
    parts.push(B(inner / n - 0.01, 0.4, 0.18, x, 0.45, -D / 2 + 0.29, 'upholstery'));
  }
  if (lshape) parts.push(B(cw - 0.16, 0.32, 0.8, W / 2 - cw / 2 - 0.08, 0.13, D / 2 + 0.4, 'upholstery', { extra: true }));
  parts.push(...legs(W, D, 0.13, 'metal', { inset: 0.07, t: 0.03 }));
  return parts;
}

/** 弧形沙发：5 段沿半径 1.6W 的弧排开（前面凹，两头往前） */
function sofaCurvy(W, D) {
  const R = 1.6 * W;
  const segW = W / 5;
  const phiEnd = (2.5 * segW) / R;
  const D2 = Math.max(0.6, D - R * (1 - Math.cos(phiEnd)));
  const z0 = -D / 2 + D2 / 2;
  const parts = [];
  for (let i = -2; i <= 2; i++) {
    const phi = (i * segW) / R;
    const seg = [B(segW + 0.01, 0.32, D2, 0, 0.045, 0, 'upholstery'), B(segW + 0.01, 0.12, D2 - 0.27, 0, 0.335, 0.125, 'upholstery'), B(segW + 0.01, 0.42, 0.3, 0, 0.33, -D2 / 2 + 0.15, 'upholstery')];
    parts.push(...place(seg, R * Math.sin(phi), z0 + R * (1 - Math.cos(phi)), (-phi * 180) / Math.PI));
  }
  parts.push(B(W - 0.42, 0.045, D2 - 0.3, 0, 0, z0 - 0.02, fx('black'), { plan: false }));
  return parts;
}

/** 木框休闲椅（单椅 lounge / 阳台躺椅） */
function frameChair(seatY) {
  return [
    B(0.58, 0.13, 0.6, 0, seatY, 0.03, 'upholstery'),
    B(0.56, 0.5, 0.13, 0, 0.3, -0.24, 'upholstery'),
    B(0.05, 0.55, 0.72, -0.31, 0, 0, 'woodwork'),
    B(0.05, 0.55, 0.72, 0.31, 0, 0, 'woodwork'),
  ];
}

function diningChairs(W, D, seats, round) {
  const out = [];
  if (round) {
    const n = Math.max(2, seats);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push(...place(chair(), Math.sin(a) * (W / 2 + 0.12), Math.cos(a) * (W / 2 + 0.12), (a * 180) / Math.PI + 180, { extra: true }));
    }
    return out;
  }
  // 和 furniture.js 的 diningTable 一样：长边放得下几把放几把，放不下的放两端
  const cap = Math.max(1, Math.floor((W - 0.04) / 0.56));
  const S = Math.max(1, seats);
  const sideN = Math.min(cap * 2, S - (S > cap * 2 ? Math.min(2, S - cap * 2) : 0));
  const per = [Math.ceil(sideN / 2), Math.floor(sideN / 2)];
  [1, -1].forEach((s, k) => {
    const m = per[k];
    const step = Math.min(0.62, (W - 0.5) / Math.max(1, m - 1));
    for (let i = 0; i < m; i++) {
      const x = m === 1 ? 0 : -((m - 1) * step) / 2 + i * step;
      out.push(...place(chair(), x, s * (D / 2 + 0.1), s > 0 ? 180 : 0, { extra: true }));
    }
  });
  const ends = S - sideN;
  for (let k = 0; k < Math.min(2, ends); k++) {
    const s = k === 0 ? 1 : -1;
    out.push(...place(chair(), s * (W / 2 + 0.1), 0, s > 0 ? -90 : 90, { extra: true }));
  }
  return out;
}

/** 一排橱柜（furniture.js kitchenRun 的位置：x = −W/2 + W·sinkAt / hobAt，0 = 站在柜前看的左端） */
function kitchenRun(it, W, D, H) {
  const sinkF = it.sinkAt !== undefined ? it.sinkAt : it.sink ?? 0.3;
  const hobF = it.hobAt !== undefined ? it.hobAt : it.hob ?? 0.72;
  const hx = hobF != null ? -W / 2 + W * hobF : null;
  const upper = it.upper !== false;
  const parts = [
    B(W - 0.004, 0.1, D - 0.12, 0, 0, -0.06, fx('black'), { plan: false }),
    B(W, 0.77, D - 0.02, 0, 0.1, -0.01, 'cabinetry'),
    B(W, 0.03, D + 0.02, 0, 0.87, 0.01, 'countertop'),
  ];
  const blocks = (it.gaps || []).map((g) => ({ a: +g.a - W / 2, b: +g.b - W / 2 })).sort((p, q) => p.a - q.a);
  let a0 = -W / 2;
  for (const b of blocks) {
    if (b.a > a0 + 0.02) parts.push(splash(a0, Math.min(b.a, W / 2)));
    a0 = Math.max(a0, b.b);
  }
  if (W / 2 > a0 + 0.02) parts.push(splash(a0, W / 2));
  function splash(a, b) {
    return B(b - a, 0.6, 0.012, (a + b) / 2, 0.9, -D / 2 + 0.006, 'countertop', { plan: false, extra: !upper });
  }
  if (hx != null) parts.push(B(0.74, 0.008, 0.48, hx, 0.9, 0, fx('black'), { plan: false }));
  if (upper) {
    const ub = [...blocks, ...(hx != null ? [{ a: hx - 0.46, b: hx + 0.46 }] : [])].sort((p, q) => p.a - q.a);
    const spans = [];
    let u = -W / 2;
    for (const b of ub) {
      if (b.a > u + 0.3) spans.push([u, b.a]);
      u = Math.max(u, b.b);
    }
    if (W / 2 > u + 0.3) spans.push([u, W / 2]);
    for (const [a, b] of spans) {
      parts.push(B(b - a, 0.72, 0.33, (a + b) / 2, 1.52, -D / 2 + 0.165, 'cabinetry', { hi: true }));
      if (H - 2.25 > 0.05) parts.push(B(b - a, H - 2.25, 0.33, (a + b) / 2, 2.25, -D / 2 + 0.165, 'cabinetry', { hi: true }));
    }
    if (hx != null) {
      parts.push(B(0.88, 0.055, 0.5, hx, 1.6, -0.05, 'metal', { hi: true }));
      parts.push(B(0.28, Math.max(0.1, H - 1.655), 0.24, hx, 1.655, -D / 2 + 0.13, 'metal', { hi: true }));
    }
  }
  return parts;
}

function bed(W, D, kids) {
  const parts = [
    B(W - 0.24, 0.08, D - 0.3, 0, 0, 0.05, fx('black'), { plan: false }),
    B(W + 0.04, 0.2, D - 0.03, 0, 0.08, 0.025, 'woodwork'),
    B(W, 0.22, D - 0.045, 0, 0.28, 0.0225, fx('mattress')),
    B(W + 0.1, 0.07, D - 0.55, 0, 0.5, 0.25, 'bedding'),
    B(W + 0.16, kids ? 0.82 : 1.0, 0.08, 0, 0.16, -D / 2, 'upholstery'),
  ];
  const pw = Math.min(0.66, (W - 0.12) / 2);
  if (W > 1.3 && !kids) for (const s of [-1, 1]) parts.push(B(pw, 0.15, 0.4, s * (pw / 2 + 0.02), 0.52, -D / 2 + 0.3, 'bedding'));
  else parts.push(B(Math.min(0.62, W - 0.2), 0.15, 0.4, 0, 0.52, -D / 2 + 0.3, 'bedding'));
  if (kids) parts.push(B(0.6, 0.34, 0.4, W / 2 + 0.45, 0, D / 2 - 0.3, 'cabinetry', { extra: true }));
  return parts;
}

function shoeCabinet(W, D, H) {
  if (H <= 1.2) {
    return [B(W, H - 0.18 - 0.025, D - 0.018, 0, 0.18, -0.009, 'cabinetry'), B(W, 0.025, D, 0, H - 0.025, 0, 'countertop')];
  }
  const nt = Math.min(1.4, H - 0.5);
  return [
    B(W, 0.82, D - 0.018, 0, 0.18, -0.009, 'cabinetry'),
    B(W, 0.025, D, 0, 1.0, 0, 'countertop'),
    B(0.018, nt - 1.0, D, -(W / 2 - 0.009), 1.0, 0, 'cabinetry', { plan: false }),
    B(0.018, nt - 1.0, D, W / 2 - 0.009, 1.0, 0, 'cabinetry', { plan: false }),
    B(W - 0.036, nt - 1.025, 0.012, 0, 1.025, -D / 2 + 0.006, 'feature', { plan: false }),
    B(W, H - nt, D - 0.018, 0, nt, -0.009, 'cabinetry', { plan: false }),
  ];
}

function bookshelf(W, D, H, key) {
  const m = key || 'woodwork';
  const t = 0.025;
  const k = Math.max(3, Math.round((H - 0.07) / 0.36));
  const parts = [
    B(t, H, D, -(W / 2 - t / 2), 0, 0, m),
    B(t, H, D, W / 2 - t / 2, 0, 0, m),
    B(W, t, D, 0, H - t, 0, m),
    B(W - 0.05, 0.07, D - 0.04, 0, 0, -0.02, fx('black'), { plan: false }),
    B(W - 0.05, H - 0.07, 0.012, 0, 0.07, -D / 2 + 0.006, m, { plan: false }),
  ];
  for (let s = 0; s < k; s++) parts.push(B(W - 0.05, t, D - 0.012, 0, 0.07 + (s * (H - 0.07 - t)) / k, 0.006, m, { plan: false }));
  return parts;
}

/**
 * 一件家具的体块。item = 方案里的家具；n = catalog.nominal() 的名义尺寸（米）；ceil = 这一层的天花高。
 * @returns {Array} parts（本地坐标，米）
 */
export function massing(item, n, ceil = 2.8) {
  const { W, D, H } = n;
  const v = item.variant;
  switch (item.kind) {
    case 'sofa':
      return v === 'curvy' ? sofaCurvy(W, D) : sofaClassic(W, D, v === 'lshape');
    case 'armchair':
      if (v === 'lounge') return frameChair(0.16);
      return [
        B(0.8, 0.16, 0.8, 0, 0.14, 0, 'upholstery'),
        B(0.8, 0.5, 0.17, 0, 0.14, -0.315, 'upholstery'),
        B(0.13, 0.47, 0.8, -0.335, 0.14, 0, 'upholstery'),
        B(0.13, 0.47, 0.8, 0.335, 0.14, 0, 'upholstery'),
        B(0.54, 0.15, 0.6, 0, 0.3, 0.08, 'upholstery'),
        B(0.53, 0.42, 0.19, 0, 0.425, -0.135, 'upholstery'),
        ...legs(0.8, 0.8, 0.14, 'metal', { inset: 0.07, t: 0.03 }),
      ];
    case 'lounger':
      return frameChair(0.14);
    case 'coffeeTable':
      if (v === 'round' || !v) return [C(0.46, 0.04, 0, 0.36, 0, 'woodwork', 24), C(0.27, 0.36, 0, 0, 0, 'woodwork', 16)];
      if (v === 'stone') return [B(W, 0.05, D, 0, 0.3, 0, 'countertop'), B(W - 0.2, 0.3, D - 0.2, 0, 0, 0, 'countertop', { plan: false })];
      return [B(W, 0.035, D, 0, 0.365, 0, 'woodwork'), B(W - 0.14, 0.018, D - 0.14, 0, 0.12, 0, 'woodwork', { plan: false }), ...legs(W, D, 0.365, 'woodwork', { inset: 0.07, t: 0.035 })];
    case 'rug':
      return v === 'round' ? [C(W / 2, 0.012, 0, 0.002, 0, 'rugs', 24)] : [B(W, 0.012, D, 0, 0.002, 0, 'rugs')];
    case 'tvWall': {
      const tvw = Math.min(1.46, 0.6 * W);
      return [
        B(W, H, 0.04, 0, 0, -D / 2 + 0.02, 'feature'),
        B(Math.min(2.2, W - 0.2), 0.34, 0.39, 0, 0.26, -D / 2 + 0.235, 'cabinetry'),
        B(tvw, tvw * 0.5625, 0.03, 0, 0.86, -D / 2 + 0.075, fx('tv'), { hi: true }),
      ];
    }
    case 'featureWall':
      return [B(W, H, Math.min(0.05, D), 0, 0, -D / 2 + Math.min(0.05, D) / 2, 'feature')];
    case 'bookshelf':
      return bookshelf(W, D, H, item.key);
    case 'displayCabinet':
      return [B(W, H, D - 0.02, 0, 0, -0.01, 'cabinetry'), B(W - 0.01, H - 0.02, 0.006, 0, 0.01, D / 2 - 0.015, fx('glass'), { plan: false })];
    case 'plant':
      if (v === 'small') return [C(0.12, 0.2, 0, 0, 0, fx('pot'), 8), C(0.16, 0.35, 0, 0.22, 0, fx('leaf'), 8)];
      return [C(0.19, 0.4, 0, 0, 0, fx('pot'), 8), C(0.32, 1.15, 0, 0.45, 0, fx('leaf'), 8)];
    case 'floorLamp':
      return [C(0.16, 0.03, 0, 0, 0, 'metal'), B(0.02, 1.21, 0.02, 0, 0.03, 0, 'metal', { plan: false }), C(0.2, 0.3, 0, 1.24, 0, fx('lampshade'))];
    case 'sideTable':
      return [C(0.22, 0.026, 0, 0.5, 0, 'woodwork', 16), C(0.016, 0.5, 0, 0, 0, 'metal', 8, { plan: false }), C(0.155, 0.016, 0, 0, 0, 'metal', 16, { plan: false })];
    case 'art':
      // 挂画的高度在 item.y（离地 1.35m），由放置的位置抬上去；这里从 0 起
      return [B(W, H, 0.035, 0, 0, -D / 2 + 0.0175, 'woodwork', { hi: true })];
    case 'altar':
      return [
        B(W - 0.04, 0.06, D - 0.08, 0, 0, -0.04, fx('black'), { plan: false }),
        B(W, 0.73, D - 0.02, 0, 0.06, -0.01, 'cabinetry'),
        B(W + 0.02, 0.04, D + 0.02, 0, 0.79, 0.005, 'countertop'),
        B(W, 1.12, 0.03, 0, 0.83, -D / 2 + 0.015, 'cabinetry', { plan: false }),
      ];
    case 'diningTable': {
      const seats = +item.seats || 6;
      if (v === 'round') return [C(W / 2, 0.038, 0, 0.712, 0, 'woodwork', 24), C(0.08, 0.712, 0, 0, 0, 'woodwork', 12, { plan: false }), C(0.27, 0.03, 0, 0, 0, 'woodwork', 16, { plan: false }), ...diningChairs(W, W, seats, true)];
      return [B(W, 0.034, D, 0, 0.716, 0, 'woodwork'), B(W - 0.16, 0.07, D - 0.16, 0, 0.646, 0, 'woodwork', { plan: false }), ...legs(W, D, 0.716, 'woodwork', { inset: 0.07, t: 0.05 }), ...diningChairs(W, D, seats, false)];
    }
    case 'chair':
      return chair();
    case 'pendant': {
      const drop = clamp(+item.drop || 0.9, 0.3, ceil - 0.3);
      return [
        C(0.06, 0.024, 0, ceil - 0.024, 0, 'metal', 12, { hi: true }),
        B(0.005, Math.max(0.02, drop - 0.22), 0.005, 0, ceil - drop + 0.2, 0, fx('black'), { plan: false, hi: true }),
        C(0.23, 0.2, 0, ceil - drop, 0, 'metal', 16, { hi: true }),
      ];
    }
    case 'sideboard':
      return [B(W, 0.62, 0.43, 0, 0.16, -0.009, 'cabinetry'), ...legs(W, D, 0.16, 'metal', { inset: 0.06, t: 0.026 })];
    case 'kitchenRun':
      return kitchenRun(item, W, D, H);
    case 'fridge':
      return [B(0.86, 1.83, 0.67, 0, 0.03, -0.015, fx('steel')), B(0.82, 0.03, 0.6, 0, 0, -0.03, fx('black'), { plan: false })];
    case 'tallUnit':
      return [B(W - 0.004, 0.1, D - 0.12, 0, 0, -0.06, fx('black'), { plan: false }), B(W, H - 0.1, D - 0.02, 0, 0.1, -0.01, 'cabinetry')];
    case 'island': {
      const bodyD = D - 0.3;
      const bz = -D / 2 + bodyD / 2;
      const parts = [
        B(W - 0.12, 0.1, bodyD - 0.08, 0, 0, bz, fx('black'), { plan: false }),
        B(W - 0.08, 0.76, bodyD, 0, 0.1, bz, 'cabinetry', { plan: false }),
        B(W, 0.04, D, 0, 0.86, 0, 'countertop'),
        B(0.04, 0.86, D, -(W / 2 - 0.02), 0, 0, 'countertop', { plan: false }),
        B(0.04, 0.86, D, W / 2 - 0.02, 0, 0, 'countertop', { plan: false }),
      ];
      for (const k of [-1, 0, 1]) {
        const x = k * Math.min(0.55, (W - 0.5) / 2);
        parts.push(C(0.18, 0.06, x, 0.62, D / 2 + 0.05, 'upholstery', 12, { extra: true }), C(0.02, 0.62, x, 0, D / 2 + 0.05, 'metal', 8, { extra: true, plan: false }));
      }
      return parts;
    }
    case 'bed':
      return bed(W, D, false);
    case 'kidsBed':
      return bed(W, D, true);
    case 'nightstand':
      return [
        B(W, 0.36, D, 0, 0.16, 0, 'woodwork'),
        ...legs(W, D, 0.16, 'woodwork', { inset: 0.04, t: 0.03 }),
        C(0.05, 0.2, 0.08, 0.52, -0.06, fx('porcelain'), 8, { extra: true, plan: false }),
        C(0.13, 0.22, 0.08, 0.72, -0.06, fx('lampshade'), 12, { extra: true }),
      ];
    case 'wardrobe':
      return [B(W - 0.004, 0.08, D - 0.12, 0, 0, -0.06, fx('black'), { plan: false }), B(W, H - 0.08, D - 0.02, 0, 0.08, -0.01, 'cabinetry')];
    case 'dresser':
      return [B(W, 0.68, D - 0.02, 0, 0.14, -0.009, 'cabinetry'), ...legs(W, D, 0.14, 'woodwork', { inset: 0.05, t: 0.036 }), B(0.62, 0.92, 0.02, 0, 1.02, -D / 2 + 0.012, fx('mirror'), { extra: true, hi: true })];
    case 'desk':
      return [
        B(W, 0.028, D, 0, 0.712, 0, 'woodwork'),
        ...legs(W, D, 0.712, 'woodwork', { inset: 0.05, t: 0.034 }),
        B(W - 0.14, 0.08, 0.02, 0, 0.632, -D / 2 + 0.05, 'woodwork', { plan: false }),
        B(0.6, 0.35, 0.012, 0.05, 0.88, -D / 2 + 0.13, fx('tv'), { extra: true }),
        B(0.5, 0.075, 0.48, 0.05, 0.42, 0.42, 'upholstery', { extra: true }),
        B(0.46, 0.5, 0.06, 0.05, 0.56, 0.66, 'upholstery', { extra: true }),
        C(0.02, 0.35, 0.05, 0.07, 0.42, fx('chrome'), 8, { extra: true, plan: false }),
        C(0.3, 0.07, 0.05, 0, 0.42, fx('black'), 12, { extra: true, plan: false }),
      ];
    case 'toyStorage':
      return [B(W, 0.62, D, 0, 0, 0, 'cabinetry')];
    case 'petBed':
      return [C(Math.min(W, D) / 2 - 0.01, 0.2, 0, 0, 0, 'accents', 16)];
    case 'shoeCabinet':
      return shoeCabinet(W, D, H);
    case 'bench':
      return [
        B(W, 0.034, D, 0, 0.4, 0, 'woodwork'),
        B(W - 0.06, 0.05, D - 0.04, 0, 0.434, 0, 'upholstery', { plan: false }),
        ...legs(W, D, 0.4, 'woodwork', { inset: 0.05, t: 0.04 }),
        B(W - 0.13, 0.016, D - 0.14, 0, 0.13, 0, 'woodwork', { plan: false }),
      ];
    case 'vanity':
      return [
        B(W, 0.46, D - 0.036, 0, 0.36, -0.008, 'cabinetry'),
        B(W + 0.01, 0.03, D, 0, 0.82, 0.01, 'countertop'),
        C(0.2, 0.12, 0, 0.85, 0.04, fx('porcelain'), 16, { extra: true }),
        B(Math.max(0.3, W - 0.24), 0.82, 0.012, 0, 1.18, -D / 2 + 0.03, fx('mirror'), { extra: true, hi: true }),
      ];
    case 'toilet':
      return [E(0.19, 0.25, 0.39, 0, 0, 0.08, fx('porcelain')), B(0.28, 0.4, 0.22, 0, 0, -0.15, fx('porcelain'), { plan: false }), B(0.37, 0.4, 0.17, 0, 0.38, -0.25, fx('porcelain'))];
    case 'shower':
      return [
        B(W, 0.045, D, 0, 0, 0, 'tile'),
        B(W - 0.02, 1.97, 0.008, -0.01, 0.06, D / 2 - 0.004, fx('glass'), { plan: false }),
        B(0.008, 1.97, D - 0.02, W / 2 - 0.004, 0.06, -0.01, fx('glass'), { plan: false }),
        B(W, 0.018, 0.022, 0, 2.03, D / 2 - 0.011, fx('frame'), { plan: false }),
      ];
    case 'washer':
      return [B(0.6, 0.85, 0.6, 0, 0, 0, fx('porcelain'))];
    case 'curtains': {
      const pw = clamp(0.22 * W, 0.35, 0.6);
      const ph = Math.max(0.5, H - 0.07);
      return [
        B(pw, ph, 0.07, -(W / 2 + pw / 2 - 0.18), 0.005, 0, 'curtains'),
        B(pw, ph, 0.07, W / 2 + pw / 2 - 0.18, 0.005, 0, 'curtains'),
        B(W + 0.6, 0.022, 0.022, 0, H - 0.022, 0, 'metal', { hi: true }),
      ];
    }
    default:
      return null;
  }
}

/** 这几种家具的名义尺寸本来就和体块不一样（不做 W × D 的核对；见 test/export.test.mjs T9） */
export const LOOSE_FIT = {
  armchair: ['lounge'], // 木框单椅 0.66 × 0.74 放在 0.8 × 0.8 的占地里（和 3D 工作室一样）
  lounger: true,
  coffeeTable: ['round'], // 圆茶几固定直径 0.92（3D 工作室也是）
  plant: true, // 叶冠比占地大
  curtains: true, // 窗帘拉开在窗的两边，杆比窗宽 0.6m
  bed: true, // 床头板比床垫宽 16cm、被子垂下来
  kidsBed: true,
  toilet: true, // 马桶 0.38 × 0.67 在 0.45 × 0.7 的占地里
  sofa: ['curvy'],
  pendant: true, // 吊灯灯罩固定直径 0.46（占地 0.5，3D 工作室也是）
  fridge: true, // 冰箱固定 0.86 × 0.67，放在 0.7 深的位置里（后面留 3cm 散热，3D 工作室也是）
  chair: true, // 餐椅是固定大小的一把（0.43 × 0.42），放在 0.46 × 0.46 的占地里（furniture.js chair() 也不看 w / d）
};

/** 体块的外框（不算 extra）：{ x0, x1, z0, z1, y0, y1 }（本地米） */
export function partsBox(parts, { all = false } = {}) {
  const b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const p of parts) {
    if (p.extra && !all) continue;
    for (const [x, z] of footprint(p)) {
      b.x0 = Math.min(b.x0, x);
      b.x1 = Math.max(b.x1, x);
      b.z0 = Math.min(b.z0, z);
      b.z1 = Math.max(b.z1, z);
    }
    b.y0 = Math.min(b.y0, p.y);
    b.y1 = Math.max(b.y1, p.y + p.h);
  }
  return b;
}

/** 一块的俯视轮廓（本地 x, z）：box → 4 个角（转过），cyl / ell → n 边 */
export function footprint(p) {
  if (p.s === 'box') {
    const a = ((p.ry || 0) * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [[-p.w / 2, -p.d / 2], [p.w / 2, -p.d / 2], [p.w / 2, p.d / 2], [-p.w / 2, p.d / 2]].map(([x, z]) => [p.x + x * c + z * s, p.z - x * s + z * c]);
  }
  const n = p.seg || 12;
  const rx = p.s === 'cyl' ? p.r : p.rx;
  const rz = p.s === 'cyl' ? p.r : p.rz;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([p.x + Math.cos(a) * rx, p.z + Math.sin(a) * rz]);
  }
  return out;
}
