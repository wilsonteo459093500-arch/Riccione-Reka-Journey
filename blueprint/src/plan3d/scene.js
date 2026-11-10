// 几何 → 「要画的东西」清单（纯函数，无依赖，ES5 写法）。不碰 canvas：画法在 paint.js，
// 以后换成别的渲染器（three.js 等）也读同一份清单。
//
// 两种视角：
//   top   正俯视：垂直往下看，和图纸一一对应，只有顶面和投影
//   persp 立体俯视：镜头在房间正上方，越高的东西顶面越往外「倒」，看得到朝向房间中心的柜子正面和墙的内侧面。
//         地面上的位置不变（z = 0 的点不动），所以脚印仍然和图纸重合。
// 投影：P = vp + (p - vp) * H / (H - z)   （vp = 镜头正下方的点，H = 镜头高度）

import { KINDS, kindOf, roomRects, deriveWalls, openingRect, snapToWall, rectPoly, chairPolys, contentBox } from './geometry.js';

var SCENE_DEFAULTS = {
  view: 'top', // 'top' | 'persp'
  hung: 'ghost', // 吊柜：'ghost' 半透明 | 'hide' 不画
  longEdge: 2400, // 输出图最长边（像素）
  margin: 0.09, // 四周留白（相对模型最长边）
  ratio: 0, // 输出宽 / 高；0 = 跟着模型走
  wallMm: 1100, // 墙体切面高度
  camMm: 14000, // 立体俯视的镜头高度（越低，立体感越强）
  light: [0.1, 0.16], // 投影方向：每升高 1 个单位，影子往右 / 往下偏多少
  snapTol: 16, // 贴墙的东西离墙面这么近（图纸像素）就拉到墙面
};

function mergeOpts(options) {
  var o = {};
  var k;
  for (k in SCENE_DEFAULTS) if (Object.prototype.hasOwnProperty.call(SCENE_DEFAULTS, k)) o[k] = SCENE_DEFAULTS[k];
  for (k in options || {}) if (Object.prototype.hasOwnProperty.call(options, k) && options[k] !== undefined) o[k] = options[k];
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

/** 画框：模型外包 + 留白 → 输出尺寸和「图纸像素 → 画布像素」的换算 */
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
 * @param {object} geo      geometry.js 里说的数据模型
 * @param {object} options  见 SCENE_DEFAULTS
 * @returns {object} { w, h, view, s, zs, vp, camH, floors, patches, shadows, solids, plan, light }
 *   solids 已经按绘制顺序排好；每个 solid = { id, kind, mat, label, ghost, unsure, z1, base, faces:[{ type:'side'|'top', pts, nx, ny }] }
 */
function buildScene(geo, options) {
  var o = mergeOpts(options);
  var f = frameFor(geo, o);
  var s = f.s;
  var zs = s / (geo.mmPerPx || 7); // 画布像素 / 毫米
  var persp = o.view === 'persp';
  var camH = persp ? o.camMm * zs : Infinity;
  var X = function (x) {
    return (x + f.ox) * s;
  };
  var Y = function (y) {
    return (y + f.oy) * s;
  };
  var C = function (pts) {
    return pts.map(function (p) {
      return [X(p[0]), Y(p[1])];
    });
  };
  var vp = o.vp ? [X(o.vp[0]), Y(o.vp[1])] : [X((f.content[0] + f.content[2]) / 2), Y((f.content[1] + f.content[3]) / 2)];
  var project = function (p, z) {
    if (!persp || !z) return [p[0], p[1]];
    var k = camH / (camH - z);
    return [vp[0] + (p[0] - vp[0]) * k, vp[1] + (p[1] - vp[1]) * k];
  };

  var solids = [];
  var patches = [];
  var addSolid = function (spec) {
    var base = clockwise(spec.poly);
    var z1 = spec.zMm * zs;
    var faces = [];
    if (persp && z1 > 0 && !spec.topOnly) {
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
        var mx = (p[0] + q[0]) / 2;
        var my = (p[1] + q[1]) / 2;
        if ((vp[0] - mx) * nx + (vp[1] - my) * ny <= 0) continue; // 背对镜头的面看不到
        faces.push({ type: 'side', pts: [project(p, 0), project(q, 0), project(q, z1), project(p, z1)], nx: nx, ny: ny });
      }
    }
    faces.push({
      type: 'top',
      pts: base.map(function (pt) {
        return project(pt, z1);
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
      tall: !!spec.tall, // 实际比切面高（高柜、玻璃柜）：画的时候可以做成「切开」的样子
      zMm: spec.zMm,
      z1: z1,
      base: base,
      hidden: spec.skip || null, // 第 i 条边顶着相邻的墙格（不画侧面，也不描轮廓线）
      faces: faces,
      near: polyDist(vp, base),
      rank: spec.rank || 0,
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
      addSolid({ id: id + '-sill', kind: 'sill', mat: 'sill', poly: C(rectPoly(b)), zMm: 100, skip: ends });
      var inset = (horizontal ? b[3] - b[1] : b[2] - b[0]) * 0.38;
      var glass = horizontal ? [b[0], b[1] + inset, b[2], b[3] - inset] : [b[0] + inset, b[1], b[2] - inset, b[3]];
      addSolid({ id: id + '-glass', kind: 'window', mat: 'windowGlass', poly: C(rectPoly(glass)), zMm: o.wallMm * 0.96, skip: ends, rank: 1 });
    } else {
      // 门洞 / 普通门：墙上留空，地上一条门槛
      patches.push({ id: id, kind: 'threshold', mat: 'threshold', pts: C(rectPoly(b)) });
    }
  });

  // —— 柜子、桌椅、柱子 ——
  (geo.items || []).forEach(function (it) {
    var k = kindOf(it.kind);
    var box = snapToWall(geo, it, o.snapTol);
    if (it.kind === 'hung') {
      if (o.hung === 'hide') return;
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
    addSolid({
      id: it.id,
      kind: it.kind,
      mat: k.mat,
      label: it.label,
      poly: C(rectPoly(box, it.round)),
      // 墙在切面高度切开，比切面高的柜子也在那里切平（不会压到墙顶外面去）
      zMm: k.wallHeight ? o.wallMm : Math.min(it.zMm || k.z1, o.wallMm),
      tall: !k.wallHeight && (it.zMm || k.z1) > o.wallMm,
      unsure: it.unsure,
      rank: k.wallHeight ? 1 : 0,
    });
  });

  // —— 绘制顺序 ——
  // 正俯视：矮的先画。立体俯视：离镜头正下方远的先画（高的东西往外倒，会盖住它外侧的东西）；半透明的吊柜最后画。
  solids.forEach(function (sd, i) {
    sd.seq = i;
  });
  solids.sort(function (a, b) {
    if (a.ghost !== b.ghost) return a.ghost ? 1 : -1;
    if (persp) {
      if (Math.abs(a.near - b.near) > 0.5) return b.near - a.near;
      if (a.z1 !== b.z1) return a.z1 - b.z1;
    } else if (a.z1 !== b.z1) return a.z1 - b.z1;
    return a.rank - b.rank || a.seq - b.seq;
  });

  // —— 落在地上的影子 ——
  var shadows = [];
  solids.forEach(function (sd) {
    if (sd.ghost || !(sd.z1 > 0)) return;
    var dx = o.light[0] * sd.z1;
    var dy = o.light[1] * sd.z1;
    var pts = sd.base.concat(
      sd.base.map(function (p) {
        return [p[0] + dx, p[1] + dy];
      })
    );
    shadows.push({ id: sd.id, pts: hull(pts), z1: sd.z1 });
  });

  var src = geo.source || null;
  return {
    w: f.w,
    h: f.h,
    view: persp ? 'persp' : 'top',
    s: s,
    zs: zs,
    ox: f.ox,
    oy: f.oy,
    vp: vp,
    camH: camH,
    light: o.light,
    wallZ: o.wallMm * zs,
    floors: roomRects(geo).map(function (r) {
      return [X(r[0]), Y(r[1]), X(r[2]), Y(r[3])];
    }),
    patches: patches,
    shadows: shadows,
    solids: solids,
    // 原图在画布上的位置（叠图核对用）
    plan: src ? [X(0), Y(0), X(src.w), Y(src.h)] : null,
  };
}

export { SCENE_DEFAULTS, buildScene, polyArea, polyDist, hull, frameFor };
