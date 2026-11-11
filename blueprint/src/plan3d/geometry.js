// 3D 户型图的几何数据（纯函数，无依赖，ES5 写法 —— 以后要原样搬到没有构建步骤的 VISI）。
//
// 数据模型（单位 = 图纸像素，x 向右、y 向下，不分轴归一）：
//   { mmPerPx, wallT,
//     rooms:    [{ name, rects: [[x0,y0,x1,y1], …] }],        房间 = 若干横平竖直的矩形拼起来（主矩形 + 凹位）
//     openings: [{ type:'window'|'door'|'hidden-door'|'gap', side:'top'|'right'|'bottom'|'left', a, b, at? }],
//                                                                门窗 = 贴在某一侧墙上的一段（a、b 沿墙方向；at = 墙面位置，可不写）
//     items:    [{ id, label, kind, box:[x0,y0,x1,y1], against?, round?:{tl,tr,br,bl}, facing?, unsure? }] }
// 位置由这份数据决定，画图的程序只照着画。

/** 家具 / 柜体的种类：中文名、默认高度（毫米，图纸上读不出来，设计师可改）、材质槽 */
var KINDS = {
  tall: { zh: '高柜', z0: 0, z1: 2200, mat: 'cabinet' },
  glass: { zh: '玻璃柜', z0: 0, z1: 2100, mat: 'glass' },
  low: { zh: '矮柜', z0: 0, z1: 850, mat: 'cabinet' },
  desk: { zh: '桌子 / 台面', z0: 0, z1: 750, mat: 'worktop' },
  shelf: { zh: '层架', z0: 0, z1: 420, mat: 'cabinet' },
  hung: { zh: '吊柜', z0: 1450, z1: 2100, mat: 'cabinet', ghost: true },
  chair: { zh: '椅子', z0: 0, z1: 450, back: 820, mat: 'fabric' },
  bed: { zh: '床', z0: 0, z1: 480, mat: 'fabric' },
  sofa: { zh: '沙发', z0: 0, z1: 430, mat: 'fabric' },
  fixture: { zh: '洁具', z0: 0, z1: 450, mat: 'neutral' },
  column: { zh: '柱子', z0: 0, z1: 0, mat: 'structure', wallHeight: true },
  block: { zh: '其他', z0: 0, z1: 600, mat: 'neutral' },
};

var SIDES = ['top', 'right', 'bottom', 'left'];

function kindOf(kind) {
  return KINDS[kind] || KINDS.block;
}

function uniqSorted(list) {
  var out = list.slice().sort(function (a, b) {
    return a - b;
  });
  return out.filter(function (v, i) {
    return i === 0 || v - out[i - 1] > 1e-6;
  });
}

function inRect(r, x, y) {
  return x > r[0] && x < r[2] && y > r[1] && y < r[3];
}

function inAny(rects, x, y) {
  for (var i = 0; i < rects.length; i++) if (inRect(rects[i], x, y)) return true;
  return false;
}

/** 房间的所有矩形 */
function roomRects(geo) {
  var out = [];
  (geo.rooms || []).forEach(function (room) {
    (room.rects || []).forEach(function (r) {
      out.push(r);
    });
  });
  return out;
}

/**
 * 门窗贴在哪条墙边上：side 一侧、在跨度中点处最靠外的那个矩形的边。
 * @returns {number|null} 墙内侧面的坐标（top / bottom = y，left / right = x）
 */
function edgeFor(rects, side, a, b) {
  var mid = (a + b) / 2;
  var best = null;
  rects.forEach(function (r) {
    var covers = side === 'top' || side === 'bottom' ? mid >= r[0] && mid <= r[2] : mid >= r[1] && mid <= r[3];
    if (!covers) return;
    var v = side === 'top' ? r[1] : side === 'bottom' ? r[3] : side === 'left' ? r[0] : r[2];
    if (best === null) best = v;
    else if (side === 'top' || side === 'left') best = Math.min(best, v);
    else best = Math.max(best, v);
  });
  return best;
}

/** 门窗在墙体里占的矩形（贴不到墙 = null） */
function openingRect(rects, opening, wallT) {
  var a = Math.min(opening.a, opening.b);
  var b = Math.max(opening.a, opening.b);
  // at = 明确指定的墙面位置（内墙上的门窗；不写就找这一侧最外面的墙边）
  var edge = typeof opening.at === 'number' && isFinite(opening.at) ? opening.at : edgeFor(rects, opening.side, a, b);
  if (edge === null || !(b - a > 0)) return null;
  if (opening.side === 'top') return [a, edge - wallT, b, edge];
  if (opening.side === 'bottom') return [a, edge, b, edge + wallT];
  if (opening.side === 'left') return [edge - wallT, a, edge, b];
  return [edge, a, edge + wallT, b];
}

/**
 * 由房间矩形推出墙体：房间并集向外扩一个墙厚、再减去房间本身；门窗把墙切开。
 * 返回一格一格的小矩形（坐标压缩网格），每格标明种类和四条边是否露在外面（相邻同种类的格子之间不画侧面）。
 * @returns {Array<{ box:number[], type:string, opening:object|null, open:{top,right,bottom,left} }>}
 */
function deriveWalls(geo) {
  var rects = roomRects(geo);
  var t = geo.wallT || 0;
  if (!rects.length || !(t > 0)) return [];
  var grown = rects.map(function (r) {
    return [r[0] - t, r[1] - t, r[2] + t, r[3] + t];
  });
  var holes = [];
  (geo.openings || []).forEach(function (o) {
    var box = openingRect(rects, o, t);
    if (box) holes.push({ box: box, opening: o });
  });

  var xs = [];
  var ys = [];
  rects
    .concat(grown)
    .concat(
      holes.map(function (h) {
        return h.box;
      })
    )
    .forEach(function (r) {
      xs.push(r[0], r[2]);
      ys.push(r[1], r[3]);
    });
  xs = uniqSorted(xs);
  ys = uniqSorted(ys);

  var grid = [];
  var i;
  var j;
  for (j = 0; j < ys.length - 1; j++) {
    grid.push([]);
    for (i = 0; i < xs.length - 1; i++) {
      var cx = (xs[i] + xs[i + 1]) / 2;
      var cy = (ys[j] + ys[j + 1]) / 2;
      var cell = null;
      if (inAny(grown, cx, cy) && !inAny(rects, cx, cy)) {
        cell = { box: [xs[i], ys[j], xs[i + 1], ys[j + 1]], type: 'wall', opening: null };
        for (var h = 0; h < holes.length; h++) {
          if (inRect(holes[h].box, cx, cy)) {
            cell.type = holes[h].opening.type;
            cell.opening = holes[h].opening;
            break;
          }
        }
      }
      grid[j].push(cell);
    }
  }

  var same = function (a, b) {
    return !!b && a.type === b.type && a.opening === b.opening;
  };
  var out = [];
  for (j = 0; j < grid.length; j++) {
    for (i = 0; i < grid[j].length; i++) {
      var c = grid[j][i];
      if (!c) continue;
      c.open = {
        top: !same(c, j > 0 ? grid[j - 1][i] : null),
        bottom: !same(c, j < grid.length - 1 ? grid[j + 1][i] : null),
        left: !same(c, i > 0 ? grid[j][i - 1] : null),
        right: !same(c, i < grid[j].length - 1 ? grid[j][i + 1] : null),
      };
      out.push(c);
    }
  }
  return out;
}

/** 贴墙的东西和墙面之间有一条小缝（图纸上的背板线）→ 把框拉到墙面，免得画出一条缝 */
function snapToWall(geo, item, tol) {
  var box = item.box.slice();
  if (!item.against || SIDES.indexOf(item.against) < 0) return box;
  var rects = roomRects(geo);
  var horizontal = item.against === 'top' || item.against === 'bottom';
  var edge = edgeFor(rects, item.against, horizontal ? box[0] : box[1], horizontal ? box[2] : box[3]);
  if (edge === null) return box;
  var idx = item.against === 'left' ? 0 : item.against === 'top' ? 1 : item.against === 'right' ? 2 : 3;
  if (Math.abs(box[idx] - edge) <= tol) box[idx] = edge;
  return box;
}

/** 四角可以各自带圆角的矩形 → 顺时针的点（屏幕坐标：左上 → 右上 → 右下 → 左下） */
function rectPoly(box, round, steps) {
  var x0 = box[0];
  var y0 = box[1];
  var x1 = box[2];
  var y1 = box[3];
  var lim = Math.min(x1 - x0, y1 - y0) / 2;
  var r = round || {};
  var n = steps || 7;
  var pts = [];
  // 每个角：圆心、起始角度（度）；顺时针走 90°
  var corners = [
    { r: r.tl, cx: 1, cy: 1, x: x0, y: y0, from: 180 },
    { r: r.tr, cx: -1, cy: 1, x: x1, y: y0, from: 270 },
    { r: r.br, cx: -1, cy: -1, x: x1, y: y1, from: 0 },
    { r: r.bl, cx: 1, cy: -1, x: x0, y: y1, from: 90 },
  ];
  corners.forEach(function (c) {
    var rad = Math.max(0, Math.min(lim, c.r || 0));
    if (!rad) {
      pts.push([c.x, c.y]);
      return;
    }
    var ox = c.x + c.cx * rad;
    var oy = c.y + c.cy * rad;
    for (var k = 0; k <= n; k++) {
      var ang = ((c.from + (90 * k) / n) * Math.PI) / 180;
      pts.push([ox + rad * Math.cos(ang), oy + rad * Math.sin(ang)]);
    }
  });
  return pts;
}

/**
 * 椅子：图纸上是 D 形 —— 平的一边朝桌子（facing），圆的一边是椅背。
 * @returns {{ seat:number[][], back:number[][] }} 座面和靠背的轮廓
 */
function chairPolys(box, facing) {
  var w = box[2] - box[0];
  var h = box[3] - box[1];
  var along = facing === 'left' || facing === 'right' ? w : h;
  var across = facing === 'left' || facing === 'right' ? h : w;
  var rad = Math.min(along * 0.72, across / 2);
  var bt = Math.max(2, along * 0.2);
  var round;
  var back;
  if (facing === 'left') {
    round = { tr: rad, br: rad };
    back = [box[2] - bt, box[1], box[2], box[3]];
  } else if (facing === 'right') {
    round = { tl: rad, bl: rad };
    back = [box[0], box[1], box[0] + bt, box[3]];
  } else if (facing === 'top') {
    round = { bl: rad, br: rad };
    back = [box[0], box[3] - bt, box[2], box[3]];
  } else {
    round = { tl: rad, tr: rad };
    back = [box[0], box[1], box[2], box[1] + bt];
  }
  var seat = rectPoly(box, round, 9);
  // 靠背 = 座面轮廓里落在靠背那一条带子里的部分
  return { seat: seat, back: clipPolyToBox(seat, back) };
}

/** 凸多边形裁到一个矩形里（Sutherland–Hodgman） */
function clipPolyToBox(poly, box) {
  var planes = [
    { axis: 0, v: box[0], keepGreater: true },
    { axis: 0, v: box[2], keepGreater: false },
    { axis: 1, v: box[1], keepGreater: true },
    { axis: 1, v: box[3], keepGreater: false },
  ];
  var out = poly;
  planes.forEach(function (pl) {
    var src = out;
    out = [];
    var inside = function (p) {
      return pl.keepGreater ? p[pl.axis] >= pl.v : p[pl.axis] <= pl.v;
    };
    for (var i = 0; i < src.length; i++) {
      var a = src[i];
      var b = src[(i + 1) % src.length];
      var ia = inside(a);
      var ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) {
        var tt = (pl.v - a[pl.axis]) / (b[pl.axis] - a[pl.axis]);
        out.push([a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt]);
      }
    }
  });
  return out;
}

/** 整个模型（墙外沿 + 所有东西）的外包矩形 */
function contentBox(geo) {
  var t = geo.wallT || 0;
  var boxes = roomRects(geo).map(function (r) {
    return [r[0] - t, r[1] - t, r[2] + t, r[3] + t];
  });
  (geo.items || []).forEach(function (it) {
    if (it.box) boxes.push(it.box);
  });
  if (!boxes.length) return [0, 0, 1, 1];
  return [
    Math.min.apply(null, boxes.map(function (b) { return b[0]; })),
    Math.min.apply(null, boxes.map(function (b) { return b[1]; })),
    Math.max.apply(null, boxes.map(function (b) { return b[2]; })),
    Math.max.apply(null, boxes.map(function (b) { return b[3]; })),
  ];
}

export { KINDS, SIDES, kindOf, roomRects, edgeFor, openingRect, deriveWalls, snapToWall, rectPoly, chairPolys, clipPolyToBox, contentBox };
