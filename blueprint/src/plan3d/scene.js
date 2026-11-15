// 几何 → 「要画的东西」清单（纯函数，无外部依赖，ES5 写法）。不碰 canvas：画法在 paint.js，
// 以后换成别的渲染器（three.js 等）也读同一份清单。
//
// 三种视角：
//   top   正俯视：垂直往下看，和图纸一一对应，只有顶面和投影
//   persp 立体俯视：镜头在房间正上方，越高的东西顶面越往外「倒」，看得到朝向房间中心的柜子正面和墙的内侧面
//   iso   斜角立体：从房间的一个角 45° 斜着往下看（平行投影，没有近大远小），墙可以画得很矮
// 「平面坐标」= 图纸坐标乘上缩放（还没投影）。每个实体的 base 都是平面坐标；
// 同一高度的平面 → 画布是一个仿射变换（tm），画顶面的花纹时直接套这个变换，花纹就跟着视角走。

import { KINDS, kindOf, roomRects, floorOf, deriveWalls, openingRect, snapToWall, rectPoly, chairPolys, contentBox, boxOk, bedParts, sofaParts, fixtureParts } from './geometry.js';

var SCENE_DEFAULTS = {
  view: 'top', // 'top' | 'persp' | 'iso'
  hung: 'ghost', // 吊柜：'ghost' 半透明轮廓 | 'hide' 不画 | 'solid' 实体（只有柜子不切开时才看得到）
  longEdge: 2400, // 输出图最长边（像素）
  margin: 0.09, // 四周留白（相对模型最长边）
  ratio: 0, // 输出宽 / 高；0 = 跟着模型走
  wallMm: 0, // 墙体切面高度；0 = 按视角取默认（正俯视 / 立体俯视 1100，斜角立体 650）
  cutMm: 0, // 柜子在这个高度切平；0 = 默认（正俯视 / 立体俯视 = 墙高，斜角立体 1200）；Infinity = 不切，画全高
  camMm: 14000, // 立体俯视的镜头高度（越低，立体感越强）
  corner: 'se', // 斜角立体：镜头在图纸的哪个角（'se' 右下 | 'sw' 左下 | 'ne' 右上 | 'nw' 左上）
  elevDeg: 50, // 斜角立体：镜头的俯角（越大越接近俯视，前排挡后排越少）
  light: [0.1, 0.16], // 投影方向：每升高 1 个单位，影子往右 / 往下偏多少
  snapTol: 16, // 贴墙的东西离墙面这么近（图纸像素）就拉到墙面
};

var WALL_MM = { top: 1100, persp: 1100, iso: 650 };
var ISO_CUT_MM = 1100;
var FULL_MM = 2300; // 估算画框时，「全高」按这么高算

/** 镜头在哪个角：朝镜头的方向（平面坐标里）和旋转角度 */
var CORNERS = {
  se: { zh: '右下角', sx: 1, sy: 1, deg: 45 },
  sw: { zh: '左下角', sx: -1, sy: 1, deg: -45 },
  ne: { zh: '右上角', sx: 1, sy: -1, deg: 135 },
  nw: { zh: '左上角', sx: -1, sy: -1, deg: -135 },
};

function mergeOpts(options) {
  var o = {};
  var k;
  for (k in SCENE_DEFAULTS) if (Object.prototype.hasOwnProperty.call(SCENE_DEFAULTS, k)) o[k] = SCENE_DEFAULTS[k];
  for (k in options || {}) if (Object.prototype.hasOwnProperty.call(options, k) && options[k] !== undefined) o[k] = options[k];
  if (o.view !== 'persp' && o.view !== 'iso') o.view = 'top';
  if (!CORNERS[o.corner]) o.corner = 'se';
  if (!(o.wallMm > 0)) o.wallMm = WALL_MM[o.view];
  if (!(o.cutMm > 0)) o.cutMm = o.view === 'iso' ? ISO_CUT_MM : o.wallMm;
  return o;
}

function polyArea(pts) {
  var a = 0;
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i];
    var q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** 屏幕坐标（y 向下）里的顺时针：面积为正 */
function clockwise(pts) {
  return polyArea(pts) >= 0 ? pts : pts.slice().reverse();
}

function segDist(p, a, b) {
  var dx = b[0] - a[0];
  var dy = b[1] - a[1];
  var len = dx * dx + dy * dy;
  var t = len ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  var x = a[0] + dx * t - p[0];
  var y = a[1] + dy * t - p[1];
  return Math.sqrt(x * x + y * y);
}

function pointInPoly(p, pts) {
  var inside = false;
  for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    var a = pts[i];
    var b = pts[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** 点到多边形的最近距离（点在里面 = 0） */
function polyDist(p, pts) {
  if (pointInPoly(p, pts)) return 0;
  var best = Infinity;
  for (var i = 0; i < pts.length; i++) best = Math.min(best, segDist(p, pts[i], pts[(i + 1) % pts.length]));
  return best;
}

/** 凸包（单调链），用来算影子：脚印 + 顶面沿光线方向落到地上的位置 */
function hull(points) {
  var pts = points.slice().sort(function (a, b) {
    return a[0] - b[0] || a[1] - b[1];
  });
  if (pts.length < 3) return pts;
  var cross = function (o, a, b) {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  };
  var lower = [];
  var i;
  for (i = 0; i < pts.length; i++) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) lower.pop();
    lower.push(pts[i]);
  }
  var upper = [];
  for (i = pts.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) upper.pop();
    upper.push(pts[i]);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function boxOf(pts) {
  var b = [Infinity, Infinity, -Infinity, -Infinity];
  for (var i = 0; i < pts.length; i++) {
    b[0] = Math.min(b[0], pts[i][0]);
    b[1] = Math.min(b[1], pts[i][1]);
    b[2] = Math.max(b[2], pts[i][0]);
    b[3] = Math.max(b[3], pts[i][1]);
  }
  return b;
}

/** 画框：模型外包 + 留白 → 输出尺寸和「图纸像素 → 画布像素」的换算（正俯视 / 立体俯视用） */
function frameFor(geo, o) {
  var c = contentBox(geo);
  var cw = c[2] - c[0];
  var ch = c[3] - c[1];
  var pad = o.margin * Math.max(cw, ch);
  var fw = cw + pad * 2;
  var fh = ch + pad * 2;
  if (o.ratio > 0) {
    if (fw / fh < o.ratio) fw = fh * o.ratio;
    else fh = fw / o.ratio;
  }
  var s = o.longEdge / Math.max(fw, fh);
  return {
    w: Math.round(fw * s),
    h: Math.round(fh * s),
    s: s,
    ox: (fw - cw) / 2 - c[0],
    oy: (fh - ch) / 2 - c[1],
    content: c,
  };
}

/**
 * 投影的全部参数（纯数据）：
 *   { type, w, h, s, zs, ox, oy, fm:[a,b,c,d,e,f], kz, vp, camH, sx, sy }
 * 平面坐标 = ((x + ox) * s, (y + oy) * s)；地面（z = 0）上 画布 = fm · 平面坐标。
 */
function makeProjection(geo, o) {
  var mmPerPx = geo.mmPerPx || 7;
  if (o.view !== 'iso') {
    var f = frameFor(geo, o);
    var c = f.content;
    var persp = o.view === 'persp';
    var zs0 = f.s / mmPerPx;
    return {
      type: persp ? 'persp' : 'top',
      w: f.w,
      h: f.h,
      s: f.s,
      zs: zs0,
      ox: f.ox,
      oy: f.oy,
      fm: [1, 0, 0, 1, 0, 0],
      kz: 0,
      vp: o.vp ? [(o.vp[0] + f.ox) * f.s, (o.vp[1] + f.oy) * f.s] : [((c[0] + c[2]) / 2 + f.ox) * f.s, ((c[1] + c[3]) / 2 + f.oy) * f.s],
      camH: persp ? o.camMm * zs0 : Infinity,
      sx: 0,
      sy: 0,
    };
  }

  var corner = CORNERS[o.corner];
  var ang = (corner.deg * Math.PI) / 180;
  var cos = Math.cos(ang);
  var sin = Math.sin(ang);
  var elev = (o.elevDeg * Math.PI) / 180;
  var se = Math.sin(elev);
  var ce = Math.cos(elev);
  var cb = contentBox(geo);
  var cx = (cb[0] + cb[2]) / 2;
  var cy = (cb[1] + cb[3]) / 2;
  var topMm = Math.max(o.wallMm, isFinite(o.cutMm) ? o.cutMm : FULL_MM);
  var zTop = topMm / mmPerPx; // 图纸像素
  var raw = function (x, y, z) {
    return [(x - cx) * cos - (y - cy) * sin, ((x - cx) * sin + (y - cy) * cos) * se - z * ce];
  };
  var pts = [];
  [0, zTop].forEach(function (z) {
    pts.push(raw(cb[0], cb[1], z), raw(cb[2], cb[1], z), raw(cb[2], cb[3], z), raw(cb[0], cb[3], z));
  });
  var b = boxOf(pts);
  var bw = b[2] - b[0];
  var bh = b[3] - b[1];
  var pad = o.margin * Math.max(bw, bh);
  var fw = bw + pad * 2;
  var fh = bh + pad * 2;
  if (o.ratio > 0) {
    if (fw / fh < o.ratio) fw = fh * o.ratio;
    else fh = fw / o.ratio;
  }
  var s = o.longEdge / Math.max(fw, fh);
  var ex = (-cx * cos + cy * sin - b[0] + (fw - bw) / 2) * s;
  var ey = ((-cx * sin - cy * cos) * se - b[1] + (fh - bh) / 2) * s;
  return {
    type: 'iso',
    w: Math.round(fw * s),
    h: Math.round(fh * s),
    s: s,
    zs: s / mmPerPx,
    ox: 0,
    oy: 0,
    fm: [cos, se * sin, -sin, se * cos, ex, ey],
    kz: ce,
    vp: [0, 0],
    camH: Infinity,
    sx: corner.sx,
    sy: corner.sy,
  };
}

/** 平面坐标里高度为 z 的点 → 画布上的点 */
function projectPoint(pj, p, z) {
  if (pj.type === 'iso') {
    var m = pj.fm;
    return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5] - (z || 0) * pj.kz];
  }
  if (pj.type !== 'persp' || !z) return [p[0], p[1]];
  var k = pj.camH / (pj.camH - z);
  return [pj.vp[0] + (p[0] - pj.vp[0]) * k, pj.vp[1] + (p[1] - pj.vp[1]) * k];
}

/** 高度为 z 的水平面 → 画布的仿射变换 [a, b, c, d, e, f]（canvas 的 transform 顺序） */
function planeMatrix(pj, z) {
  if (pj.type === 'iso') return [pj.fm[0], pj.fm[1], pj.fm[2], pj.fm[3], pj.fm[4], pj.fm[5] - (z || 0) * pj.kz];
  if (pj.type !== 'persp' || !z) return [1, 0, 0, 1, 0, 0];
  var k = pj.camH / (pj.camH - z);
  return [k, 0, 0, k, pj.vp[0] * (1 - k), pj.vp[1] * (1 - k)];
}

/**
 * 斜角立体的绘制顺序：离镜头远的先画。镜头统一换算成在（+x, +y）方向：
 * A 整个在 B 的右边或下边 → A 更靠近镜头、后画；脚印重叠（椅背在椅面上、吊柜在书桌上方）→ 矮的先画。
 */
function isoOrder(solids, pj) {
  var n = solids.length;
  var boxes = solids.map(function (sd) {
    var b = boxOf(sd.base);
    var xs = [b[0] * pj.sx, b[2] * pj.sx];
    var ys = [b[1] * pj.sy, b[3] * pj.sy];
    return [Math.min(xs[0], xs[1]), Math.min(ys[0], ys[1]), Math.max(xs[0], xs[1]), Math.max(ys[0], ys[1])];
  });
  var eps = 0.01;
  /** 1 = i 必须在 j 之后画；-1 = 之前；0 = 无所谓 */
  var rel = function (i, j) {
    var a = boxes[i];
    var b = boxes[j];
    var aFront = a[0] >= b[2] - eps || a[1] >= b[3] - eps;
    var bFront = b[0] >= a[2] - eps || b[1] >= a[3] - eps;
    if (aFront && bFront) return 0; // 斜对着，屏幕上不重叠
    if (aFront) return 1;
    if (bFront) return -1;
    var A = solids[i];
    var B = solids[j];
    if (A.ghost !== B.ghost) return A.ghost ? 1 : -1;
    if (Math.abs(A.z1 - B.z1) > 1e-6) return A.z1 > B.z1 ? 1 : -1;
    if (A.rank !== B.rank) return A.rank > B.rank ? 1 : -1;
    return i > j ? 1 : -1;
  };
  var before = []; // before[i] = 还有几个必须先画的
  var after = [];
  var i;
  var j;
  for (i = 0; i < n; i++) {
    before.push(0);
    after.push([]);
  }
  for (i = 0; i < n; i++) {
    for (j = i + 1; j < n; j++) {
      var r = rel(i, j);
      if (r > 0) {
        after[j].push(i);
        before[i] += 1;
      } else if (r < 0) {
        after[i].push(j);
        before[j] += 1;
      }
    }
  }
  var done = [];
  var out = [];
  var left = n;
  for (i = 0; i < n; i++) done.push(false);
  // 压在别的实体上的小件（枕头、床头板、扶手、台面上的水槽）：记下它的主体是第几个
  var where = {};
  var host = [];
  for (i = 0; i < n; i++) where[solids[i].id] = i;
  for (i = 0; i < n; i++) host.push(solids[i].on && Object.prototype.hasOwnProperty.call(where, solids[i].on) && where[solids[i].on] !== i ? where[solids[i].on] : -1);
  var depth = function (k) {
    return boxes[k][2] + boxes[k][3];
  };
  var release = function (k) {
    before[k] -= 1;
  };
  while (left > 0) {
    var pick = -1;
    for (i = 0; i < n; i++) {
      if (done[i] || before[i] > 0) continue;
      if (pick < 0 || depth(i) < depth(pick)) pick = i;
    }
    if (pick < 0) {
      // 出现了循环（极少见，框互相压着时才有）：剩下的里面挑最远的；但小件不能抢在它的主体前面（否则枕头被床垫盖住）
      for (i = 0; i < n; i++) if (!done[i] && (host[i] < 0 || done[host[i]]) && (pick < 0 || depth(i) < depth(pick))) pick = i;
      for (i = 0; i < n && pick < 0; i++) if (!done[i]) pick = i;
    }
    done[pick] = true;
    left -= 1;
    out.push(solids[pick]);
    after[pick].forEach(release);
  }
  return out;
}

/** 从镜头正下方（vp）看过去，一个外包矩形占的方位角：{ mid, lo, hi }；vp 就在矩形里 = null（四面八方） */
function arcOf(b, vp) {
  if (vp[0] >= b[0] && vp[0] <= b[2] && vp[1] >= b[1] && vp[1] <= b[3]) return null;
  var mid = Math.atan2((b[1] + b[3]) / 2 - vp[1], (b[0] + b[2]) / 2 - vp[0]);
  var lo = 0;
  var hi = 0;
  [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].forEach(function (c) {
    var d = Math.atan2(c[1] - vp[1], c[0] - vp[0]) - mid;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  });
  return { mid: mid, lo: lo, hi: hi };
}

/**
 * 立体俯视里 a 是不是挡在 b 前面（a 要后画）：两个外包矩形分得开、从 vp 出发有同一条视线先碰到 a 再碰到 b。
 * 东西都是往外倒的，所以只有同一条视线上靠里的才会挡住靠外的。
 */
function perspFront(a, b, vp) {
  var eps = 0.01;
  var side = function (lo0, hi0, lo1, hi1, v) {
    // 沿一个轴：null = 这个轴上分不开；1 = vp 在 a 这边；-1 = vp 在 b 这边；0 = vp 在两者之间（没有共同的视线）
    if (hi0 <= lo1 + eps) return v <= hi0 ? 1 : v >= lo1 ? -1 : 0;
    if (hi1 <= lo0 + eps) return v >= lo0 ? 1 : v <= hi1 ? -1 : 0;
    return null;
  };
  var rx = side(a[0], a[2], b[0], b[2], vp[0]);
  var ry = side(a[1], a[3], b[1], b[3], vp[1]);
  if (rx === null && ry === null) return false;
  var r = rx === null ? ry : ry === null ? rx : rx === ry ? rx : 0;
  if (r !== 1) return false;
  var p = arcOf(a, vp);
  var q = arcOf(b, vp);
  if (!p || !q) return true;
  var d = q.mid - p.mid;
  for (var k = -1; k <= 1; k++) {
    var t = d + k * Math.PI * 2;
    if (t + q.lo <= p.hi + 1e-9 && t + q.hi >= p.lo - 1e-9) return true;
  }
  return false;
}

/**
 * 立体俯视的顺序补一步，只管床 / 沙发 / 洁具（piece）：按「离 vp 最近的点」排序时，一段很长的墙可能排在
 * 它前面那件矮东西的后面，墙的内侧面就把东西盖住了。这里把每一件挪到它背后最后一段墙之后；
 * 夹在中间、本来就该盖在它上面的东西（压在它上面的枕头、挡在它前面的家具）跟着一起挪。其他东西的顺序不动。
 */
function perspPieces(solids, vp) {
  var wallish = { wall: 1, sill: 1, window: 1, 'hidden-door': 1, column: 1 };
  var boxes = {};
  var bb = function (sd) {
    return boxes[sd.seq] || (boxes[sd.seq] = boxOf(sd.base));
  };
  var apart = function (a, b) {
    return a[2] <= b[0] + 0.01 || b[2] <= a[0] + 0.01 || a[3] <= b[1] + 0.01 || b[3] <= a[1] + 0.01;
  };
  var out = solids.slice();
  solids.forEach(function (sd) {
    if (!sd.piece || sd.ghost) return;
    var i = out.indexOf(sd);
    var last = -1;
    var j;
    for (j = i + 1; j < out.length; j++) {
      if (out[j].ghost) break;
      if (wallish[out[j].kind] === 1 && perspFront(bb(sd), bb(out[j]), vp)) last = j;
    }
    if (last < 0) return;
    var block = [sd];
    var rest = [];
    var joins = function (y) {
      for (var m = 0; m < block.length; m++) {
        if (!apart(bb(block[m]), bb(y)) || perspFront(bb(y), bb(block[m]), vp)) return true;
      }
      return false;
    };
    for (j = i + 1; j <= last; j++) {
      if (joins(out[j])) block.push(out[j]);
      else rest.push(out[j]);
    }
    out = out.slice(0, i).concat(rest, block, out.slice(last + 1));
  });
  return out;
}

/**
 * 斜角立体从哪个角看遮挡最少：镜头一侧的两面墙上靠着的柜子越少、越矮越好。
 * @returns {'se'|'sw'|'ne'|'nw'}
 */
function recommendCorner(geo) {
  var load = { top: 0, right: 0, bottom: 0, left: 0 };
  (geo.items || []).forEach(function (it) {
    if (!boxOk(it) || !it.against || load[it.against] === undefined || it.kind === 'hung' || it.kind === 'column') return;
    var k = kindOf(it.kind);
    var w = it.box[2] - it.box[0];
    var h = it.box[3] - it.box[1];
    load[it.against] += Math.max(w, h) * k.z1;
  });
  var near = { se: ['bottom', 'right'], sw: ['bottom', 'left'], ne: ['top', 'right'], nw: ['top', 'left'] };
  var best = 'se';
  var bestScore = Infinity;
  ['se', 'sw', 'ne', 'nw'].forEach(function (c) {
    var score = load[near[c][0]] + load[near[c][1]];
    if (score < bestScore - 1e-6) {
      bestScore = score;
      best = c;
    }
  });
  return best;
}

/**
 * @param {object} geo      geometry.js 里说的数据模型
 * @param {object} options  见 SCENE_DEFAULTS
 * @returns {object} { w, h, view, s, zs, pj, fm, floors, floorAreas, patches, shadows, solids, plan, light, wallZ }
 *   floors = 所有房间的矩形（平面坐标）；floorAreas = 每个房间一块 { name, floor:'wood'|'tile', rects, box }：
 *     rects 按顺序连起来就是 floors（同一个房间的矩形可以互相重叠），box = 这个房间的外包矩形（地砖从它的左上角铺起）
 *   solids 已经按绘制顺序排好；每个 solid = { id, kind, mat, label, ghost, unsure, tall, zMm, z0, z1,
 *     base（平面坐标的脚印）, foot（脚印落在画布上的位置）, tm（顶面所在平面 → 画布的变换）,
 *     faces:[{ type:'side'|'top', pts（画布坐标）, nx, ny }] }
 *   床 / 沙发 / 洁具拆成几个 solid（和椅子的座面 + 靠背一样）：
 *     床 = bed（整个框，床垫）+ 压在上面的 bed-pillow、bed-head（床头板）；
 *     沙发 = sofa（整个框，底座）+ 压在上面的 sofa-arm x 2、sofa-back；洁具 = fixture（马桶另有 fixture-tank 水箱）。
 *     detail = 顶面上要画的细节（平面坐标），on = 压在哪个 solid 上，piece = 是这三种东西的一块
 */
function buildScene(geo, options) {
  var o = mergeOpts(options);
  // 贴墙容差跟着图纸大小走（坐标带着图纸尺寸时）；没指定图纸尺寸就用默认的 16 像素
  if (!(options && options.snapTol > 0) && geo.source && geo.source.w > 0 && geo.source.h > 0) {
    o.snapTol = Math.max(4, 0.0086 * Math.max(geo.source.w, geo.source.h));
  }
  var pj = makeProjection(geo, o);
  var s = pj.s;
  var zs = pj.zs; // 画布像素 / 毫米
  var X = function (x) {
    return (x + pj.ox) * s;
  };
  var Y = function (y) {
    return (y + pj.oy) * s;
  };
  var C = function (pts) {
    return pts.map(function (p) {
      return [X(p[0]), Y(p[1])];
    });
  };

  var R = function (r) {
    return [X(r[0]), Y(r[1]), X(r[2]), Y(r[3])];
  };

  var solids = [];
  var patches = [];
  var addSolid = function (spec) {
    var base = clockwise(spec.poly);
    var z0 = (spec.z0Mm || 0) * zs;
    var z1 = spec.zMm * zs;
    var faces = [];
    if (pj.type !== 'top' && z1 > z0 && !spec.topOnly) {
      for (var i = 0; i < base.length; i++) {
        if (spec.skip && spec.skip[i]) continue;
        var p = base[i];
        var q = base[(i + 1) % base.length];
        var dx = q[0] - p[0];
        var dy = q[1] - p[1];
        var len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-6) continue;
        var nx = dy / len; // 顺时针多边形的外法线
        var ny = -dx / len;
        var facing =
          pj.type === 'iso' ? nx * pj.sx + ny * pj.sy : (pj.vp[0] - (p[0] + q[0]) / 2) * nx + (pj.vp[1] - (p[1] + q[1]) / 2) * ny;
        if (facing <= 1e-9) continue; // 背对镜头的面看不到
        faces.push({
          type: 'side',
          pts: [projectPoint(pj, p, z0), projectPoint(pj, q, z0), projectPoint(pj, q, z1), projectPoint(pj, p, z1)],
          nx: nx,
          ny: ny,
        });
      }
    }
    faces.push({
      type: 'top',
      pts: base.map(function (pt) {
        return projectPoint(pj, pt, z1);
      }),
      nx: 0,
      ny: 0,
    });
    solids.push({
      id: spec.id,
      kind: spec.kind,
      mat: spec.mat,
      label: spec.label || '',
      ghost: !!spec.ghost,
      unsure: !!spec.unsure,
      tall: !!spec.tall, // 实际比切面高、被切平了（高柜、玻璃柜）：画的时候做成「切开」的样子
      zMm: spec.zMm,
      z0: z0,
      z1: z1,
      base: base,
      foot: base.map(function (pt) {
        return projectPoint(pj, pt, 0);
      }),
      tm: planeMatrix(pj, z1),
      hidden: spec.skip || null, // 第 i 条边顶着相邻的墙格（不画侧面，也不描轮廓线）
      faces: faces,
      near: pj.type === 'persp' ? polyDist(pj.vp, base) : 0,
      rank: spec.rank || 0,
      detail: spec.detail || null, // 顶面上的细节：枕头的位置、坐垫的分缝、盆的内沿……（平面坐标）
      on: spec.on || '', // 压在哪个实体上（枕头在床垫上、水槽在台面上）：立体俯视里跟着它排顺序
      piece: !!spec.piece, // 床 / 沙发 / 洁具的一块：立体俯视里要保证画在它背后的墙之后（见 perspPieces）
    });
  };
  var rectSkip = function (open) {
    return [!open.top, !open.right, !open.bottom, !open.left];
  };

  // —— 墙体 ——
  var rects = roomRects(geo);
  deriveWalls(geo).forEach(function (cell, i) {
    if (cell.type !== 'wall') return; // 门窗的位置下面整段画
    addSolid({ id: 'wall-' + i, kind: 'wall', mat: 'wall', poly: C(rectPoly(cell.box)), zMm: o.wallMm, skip: rectSkip(cell.open) });
  });

  // —— 门窗：每个一整段 ——
  (geo.openings || []).forEach(function (op, i) {
    var b = openingRect(rects, op, geo.wallT || 0);
    if (!b) return;
    var id = 'opening-' + i;
    var horizontal = op.side === 'top' || op.side === 'bottom';
    var ends = horizontal ? [false, true, false, true] : [true, false, true, false]; // 两端顶着墙，不画端面
    if (op.type === 'hidden-door') {
      addSolid({ id: id, kind: 'hidden-door', mat: 'panel', poly: C(rectPoly(b)), zMm: o.wallMm, skip: ends });
    } else if (op.type === 'window') {
      // 窗：矮窗台 + 中间一片玻璃
      addSolid({ id: id + '-sill', kind: 'sill', mat: 'sill', poly: C(rectPoly(b)), zMm: Math.min(100, o.wallMm * 0.3), skip: ends });
      var inset = (horizontal ? b[3] - b[1] : b[2] - b[0]) * 0.38;
      var glass = horizontal ? [b[0], b[1] + inset, b[2], b[3] - inset] : [b[0] + inset, b[1], b[2] - inset, b[3]];
      addSolid({ id: id + '-glass', kind: 'window', mat: 'windowGlass', poly: C(rectPoly(glass)), zMm: o.wallMm * 0.96, skip: ends, rank: 1 });
    } else {
      // 门洞 / 普通门：墙上留空，地上一条门槛
      patches.push({ id: id, kind: 'threshold', mat: 'threshold', pts: C(rectPoly(b)) });
    }
  });

  // —— 柜子、桌椅、柱子 ——
  var cut = function (mm) {
    return Math.min(mm, o.cutMm);
  };
  (geo.items || []).forEach(function (it) {
    if (!boxOk(it)) return; // 坏数据（没有框、框里不是数）：这一件不画
    var k = kindOf(it.kind);
    var box = snapToWall(geo, it, o.snapTol);
    if (it.kind === 'hung') {
      if (o.hung === 'hide') return;
      if (o.hung === 'solid' && o.cutMm > k.z0) {
        // 柜子不切开时：吊柜画成悬在墙上的实体
        addSolid({ id: it.id, kind: 'hung', mat: k.mat, label: it.label, poly: C(rectPoly(box, it.round)), z0Mm: k.z0, zMm: cut(k.z1), rank: 5 });
        return;
      }
      // 吊柜在切面以上：画成落在台面高度的一片半透明轮廓，看得到下面的书桌
      addSolid({ id: it.id, kind: 'hung', mat: k.mat, label: it.label, poly: C(rectPoly(box, it.round)), zMm: KINDS.desk.z1, ghost: true, topOnly: true, rank: 9 });
      return;
    }
    if (it.kind === 'chair') {
      var parts = chairPolys(box, it.facing || 'bottom');
      addSolid({ id: it.id, kind: 'chair', mat: k.mat, label: it.label, poly: C(parts.seat), zMm: k.z1, unsure: it.unsure });
      addSolid({ id: it.id + '-back', kind: 'chair-back', mat: k.mat, poly: C(parts.back), zMm: k.back, rank: 1 });
      return;
    }
    var full = it.zMm || k.z1;
    if (it.kind === 'bed') {
      var bed = bedParts(geo, it, box);
      if (bed) {
        // 整个框是床垫（被子）；床头板和枕头压在它上面（从床垫的高度往上）
        addSolid({
          id: it.id,
          kind: 'bed',
          mat: k.mat,
          label: it.label,
          poly: C(rectPoly(box)),
          zMm: cut(full),
          unsure: it.unsure,
          piece: true,
          detail: { head: bed.head, single: bed.single, sheet: R(bed.sheet), fold: R(bed.fold), pillows: bed.pillows.map(R), pillowR: bed.pillowR * s },
        });
        var pr = bed.pillowR;
        bed.pillows.forEach(function (pb, pi) {
          addSolid({
            id: it.id + '-pillow-' + (pi + 1),
            kind: 'bed-pillow',
            mat: 'linen',
            poly: C(rectPoly(pb, { tl: pr, tr: pr, br: pr, bl: pr }, 4)),
            z0Mm: cut(full),
            zMm: cut(full + k.pillow),
            rank: 1,
            on: it.id,
            piece: true,
            detail: { head: bed.head },
          });
        });
        addSolid({ id: it.id + '-head', kind: 'bed-head', mat: 'cabinet', poly: C(rectPoly(bed.headboard)), z0Mm: cut(full), zMm: cut(full + k.head - k.z1), rank: 2, on: it.id, piece: true });
        return;
      }
    }
    if (it.kind === 'sofa') {
      var sofa = sofaParts(geo, it, box);
      if (sofa) {
        // 整个框是底座（坐垫那么高）；扶手和靠背压在它上面
        addSolid({
          id: it.id,
          kind: 'sofa',
          mat: k.mat,
          label: it.label,
          poly: C(rectPoly(box, sofa.round, 4)),
          zMm: cut(full),
          unsure: it.unsure,
          piece: true,
          detail: { back: sofa.back, seat: R(sofa.seat), cushions: sofa.cushions.map(R) },
        });
        sofa.arms.forEach(function (arm, ai) {
          addSolid({ id: it.id + '-arm-' + (ai + 1), kind: 'sofa-arm', mat: k.mat, poly: C(rectPoly(arm.box, arm.round, 4)), z0Mm: cut(full), zMm: cut(full + k.arm - k.z1), rank: 1, on: it.id, piece: true, detail: { back: sofa.back } });
        });
        addSolid({ id: it.id + '-back', kind: 'sofa-back', mat: k.mat, poly: C(rectPoly(sofa.backRect, sofa.backRound, 4)), z0Mm: cut(full), zMm: cut(full + k.back - k.z1), rank: 2, on: it.id, piece: true, detail: { back: sofa.back } });
        return;
      }
    }
    if (it.kind === 'fixture') {
      var fx = fixtureParts(geo, it, box);
      if (fx) {
        var disc = function (c) {
          return c ? [X(c[0]), Y(c[1]), c[2] * s] : null;
        };
        var z0Mm = 0;
        var topMm = full;
        if (fx.host) {
          // 嵌在台面 / 矮柜上的水槽、灶：抬到台面高度，只露一点边
          z0Mm = fx.host.zMm || kindOf(fx.host.kind).z1;
          topMm = z0Mm + 4;
        } else if (!it.zMm) {
          if (fx.variant === 'tray') topMm = k.tray;
          else if (fx.variant === 'basin' && fx.named) topMm = k.basin; // 落地的洗手盆有台面那么高
        }
        addSolid({
          id: it.id,
          kind: 'fixture',
          mat: k.mat,
          label: it.label,
          poly: C(rectPoly(fx.body.box, fx.body.round, 6)),
          z0Mm: cut(z0Mm),
          zMm: cut(topMm),
          unsure: it.unsure,
          rank: fx.host ? 3 : 0,
          on: fx.host ? fx.host.id : '',
          piece: true,
          detail: {
            variant: fx.variant,
            back: fx.back,
            bowl: fx.bowl ? C(rectPoly(fx.bowl.box, fx.bowl.round, 8)) : null,
            drain: disc(fx.drain),
            tap: disc(fx.tap),
            rings: fx.rings.map(disc),
          },
        });
        if (fx.tank) {
          addSolid({ id: it.id + '-tank', kind: 'fixture-tank', mat: k.mat, poly: C(rectPoly(fx.tank.box, fx.tank.round, 3)), zMm: cut(full + k.tank - k.z1), rank: 1, piece: true, detail: { variant: 'tank', back: fx.back, tap: disc(fx.tap) } });
        }
        return;
      }
    }
    addSolid({
      id: it.id,
      kind: it.kind,
      mat: k.mat,
      label: it.label,
      poly: C(rectPoly(box, it.round)),
      // 比切面高的柜子在切面处切平（正俯视 / 立体俯视里切面 = 墙高，不会压到墙顶外面去）
      zMm: k.wallHeight ? o.wallMm : cut(full),
      tall: !k.wallHeight && full > o.cutMm,
      unsure: it.unsure,
      rank: k.wallHeight ? 1 : 0,
    });
  });

  // —— 绘制顺序 ——
  var byId = {};
  solids.forEach(function (sd, i) {
    sd.seq = i;
    byId[sd.id] = sd;
  });
  // 压在别的实体上的小件（枕头、台面上的水槽）：立体俯视里和它算一样远，再按高度排在它后面
  solids.forEach(function (sd) {
    if (sd.on && Object.prototype.hasOwnProperty.call(byId, sd.on) && byId[sd.on] !== sd) sd.near = byId[sd.on].near;
  });
  if (pj.type === 'iso') {
    solids = isoOrder(solids, pj);
  } else {
    // 正俯视：矮的先画。立体俯视：离镜头正下方远的先画（高的东西往外倒，会盖住它外侧的东西）；半透明的吊柜最后画
    solids.sort(function (a, b) {
      if (a.ghost !== b.ghost) return a.ghost ? 1 : -1;
      if (pj.type === 'persp') {
        if (Math.abs(a.near - b.near) > 0.5) return b.near - a.near;
        if (a.z1 !== b.z1) return a.z1 - b.z1;
      } else if (a.z1 !== b.z1) return a.z1 - b.z1;
      return a.rank - b.rank || a.seq - b.seq;
    });
  }

  if (pj.type === 'persp') solids = perspPieces(solids, pj.vp);

  // —— 落在地上的影子（平面坐标；画的时候再套地面的变换）——
  var shadows = [];
  solids.forEach(function (sd) {
    if (sd.ghost || !(sd.z1 > 0)) return;
    var shifted = function (z) {
      return sd.base.map(function (p) {
        return [p[0] + o.light[0] * z, p[1] + o.light[1] * z];
      });
    };
    shadows.push({ id: sd.id, pts: hull(shifted(sd.z0).concat(shifted(sd.z1))), z1: sd.z1 });
  });

  // —— 地板：每个房间一块，带着铺的是什么（木地板 / 地砖）——
  var floorAreas = [];
  (geo.rooms || []).forEach(function (room) {
    var list = (room.rects || []).map(R);
    if (!list.length) return;
    var corners = [];
    list.forEach(function (r) {
      corners.push([r[0], r[1]], [r[2], r[3]]);
    });
    floorAreas.push({ name: room.name || '', floor: floorOf(room), rects: list, box: boxOf(corners) });
  });

  var src = geo.source || null;
  return {
    w: pj.w,
    h: pj.h,
    view: pj.type,
    corner: pj.type === 'iso' ? o.corner : null,
    s: s,
    zs: zs,
    ox: pj.ox,
    oy: pj.oy,
    vp: pj.vp,
    camH: pj.camH,
    pj: pj,
    fm: pj.fm, // 地面（z = 0）：平面坐标 → 画布
    light: o.light,
    wallZ: o.wallMm * zs,
    floors: rects.map(function (r) {
      return [X(r[0]), Y(r[1]), X(r[2]), Y(r[3])];
    }),
    floorAreas: floorAreas,
    patches: patches,
    shadows: shadows,
    solids: solids,
    // 原图在画布上的位置（叠图核对用；斜角立体不是正对着图纸，没有这一项）
    plan: src && pj.type !== 'iso' ? [X(0), Y(0), X(src.w), Y(src.h)] : null,
  };
}

export { SCENE_DEFAULTS, CORNERS, buildScene, recommendCorner, projectPoint, planeMatrix, polyArea, polyDist, hull, frameFor };
