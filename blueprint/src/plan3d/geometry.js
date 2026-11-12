// 3D 户型图的几何数据（纯函数，无依赖，ES5 写法 —— 以后要原样搬到没有构建步骤的 VISI）。
//
// 数据模型（单位 = 图纸像素，x 向右、y 向下，不分轴归一）：
//   { mmPerPx, wallT,
//     rooms:    [{ name, rects: [[x0,y0,x1,y1], …] }],        房间 = 若干横平竖直的矩形拼起来（主矩形 + 凹位）
//                                                                floor?:'wood'|'tile' = 地面铺什么（不写 / 不认识 = 木地板）
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
  bed: { zh: '床', z0: 0, z1: 480, head: 950, pillow: 120, mat: 'fabric' },
  sofa: { zh: '沙发', z0: 0, z1: 430, back: 800, arm: 620, mat: 'fabric' },
  fixture: { zh: '洁具', z0: 0, z1: 450, tank: 780, basin: 820, tray: 80, mat: 'ceramic' },
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

/** 房间的地面铺什么：'tile' 地砖；不写 / 不认识 = 'wood' 木地板 */
function floorOf(room) {
  return room && room.floor === 'tile' ? 'tile' : 'wood';
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

// ---------------------------------------------------------------------------
// 床 / 沙发 / 洁具：一个框拆成几块（床垫 + 床头 + 枕头……），尺寸按毫米定，再换成图纸像素
// ---------------------------------------------------------------------------

var OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

function mmOf(geo) {
  return geo && geo.mmPerPx > 0 ? geo.mmPerPx : 7;
}

/** 贴着 side 那条边的一块：d0–d1 = 离那条边多远（往里量），a0–a1 = 沿那条边的比例（左 → 右 / 上 → 下） */
function sideRect(box, side, d0, d1, a0, a1) {
  var w = box[2] - box[0];
  var h = box[3] - box[1];
  if (side === 'top') return [box[0] + a0 * w, box[1] + d0, box[0] + a1 * w, box[1] + d1];
  if (side === 'bottom') return [box[0] + a0 * w, box[3] - d1, box[0] + a1 * w, box[3] - d0];
  if (side === 'left') return [box[0] + d0, box[1] + a0 * h, box[0] + d1, box[1] + a1 * h];
  return [box[2] - d1, box[1] + a0 * h, box[2] - d0, box[1] + a1 * h];
}

/** 四个角的圆角：b0 / b1 = side 那条边的两端，f0 / f1 = 对面那条边的两端 */
function sideRound(side, b0, b1, f0, f1) {
  if (side === 'top') return { tl: b0, tr: b1, bl: f0, br: f1 };
  if (side === 'bottom') return { bl: b0, br: b1, tl: f0, tr: f1 };
  if (side === 'left') return { tl: b0, bl: b1, tr: f0, br: f1 };
  return { tr: b0, br: b1, tl: f0, bl: f1 };
}

/** 从框的 side 那条边往外走，离房间边界（墙面）还有多远；框不在任何房间里 = Infinity */
function boundaryGap(rects, box, side) {
  var cx = (box[0] + box[2]) / 2;
  var cy = (box[1] + box[3]) / 2;
  var alongX = side === 'left' || side === 'right';
  var sign = side === 'left' || side === 'top' ? -1 : 1;
  var pos = alongX ? cx : cy;
  var probe = pos;
  var found = false;
  for (var n = 0; n <= rects.length; n++) {
    var best = null;
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      var lo = alongX ? r[0] : r[1];
      var hi = alongX ? r[2] : r[3];
      var across = alongX ? cy >= r[1] && cy <= r[3] : cx >= r[0] && cx <= r[2];
      if (!across || probe < lo - 1e-9 || probe > hi + 1e-9) continue;
      var edge = sign < 0 ? lo : hi;
      if (best === null || (edge - best) * sign > 0) best = edge;
    }
    if (best === null || (found && (best - pos) * sign <= 1e-9)) break;
    pos = best;
    found = true;
    probe = pos + sign * 0.5; // 同一个房间的相邻矩形是连着的，接着往外走
  }
  if (!found) return Infinity;
  var face = side === 'left' ? box[0] : side === 'top' ? box[1] : side === 'right' ? box[2] : box[3];
  return Math.max(0, (pos - face) * sign);
}

/** 几条边里离墙最近的一条；一样近 / 判断不了 = 第一条 */
function nearestSide(rects, box, cands) {
  var best = cands[0];
  var bestGap = Infinity;
  cands.forEach(function (s) {
    var g = boundaryGap(rects, box, s);
    if (g < bestGap - 1e-6) {
      bestGap = g;
      best = s;
    }
  });
  return best;
}

/** 候选的边：长边（wantLong）或短边；正方形 = null（四条边都行） */
function sidePair(box, wantLong) {
  var w = box[2] - box[0];
  var h = box[3] - box[1];
  if (Math.abs(w - h) < 0.5) return null;
  return w > h === !!wantLong ? ['top', 'bottom'] : ['left', 'right'];
}

/**
 * 床头在哪一侧：against 写的是短边就用它；否则取离墙近的那条短边（判断不了 = 上 / 左）。
 * 正方形：against，没有就取离墙最近的一边（判断不了 = 上）。马桶的水箱、浴缸的龙头也这么定。
 */
function bedHeadSide(geo, item, box) {
  var given = SIDES.indexOf(item.against) >= 0 ? item.against : null;
  var cands = sidePair(box, false);
  if (given && (!cands || cands.indexOf(given) >= 0)) return given;
  return nearestSide(roomRects(geo), box, cands || SIDES);
}

/** side 那一侧正对着一张桌子（茶几）吗：沿边方向有重叠，离得不超过 reach */
function tableInFront(geo, item, box, side, reach) {
  var alongX = side === 'top' || side === 'bottom';
  var items = geo.items || [];
  for (var i = 0; i < items.length; i++) {
    var t = items[i];
    if (t === item || !t || t.kind !== 'desk' || !boxOk(t)) continue;
    var tb = t.box;
    var lo = Math.max(alongX ? box[0] : box[1], alongX ? tb[0] : tb[1]);
    var hi = Math.min(alongX ? box[2] : box[3], alongX ? tb[2] : tb[3]);
    var len = Math.min(alongX ? box[2] - box[0] : box[3] - box[1], alongX ? tb[2] - tb[0] : tb[3] - tb[1]);
    if (!(hi - lo >= len * 0.3) || !(len > 0)) continue;
    var gap = side === 'top' ? box[1] - tb[3] : side === 'bottom' ? tb[1] - box[3] : side === 'left' ? box[0] - tb[2] : tb[0] - box[2];
    if (gap >= -reach * 0.1 && gap <= reach) return true;
  }
  return false;
}

/**
 * 沙发靠背在哪一侧：against 写的是长边就用它；否则 贴着墙的长边 → 背对茶几的长边 → 离墙近的长边（判断不了 = 上 / 左）。
 * 正方形（单人沙发）：against，没有就同样的顺序在四条边里挑。
 */
function sofaBackSide(geo, item, box) {
  var mm = mmOf(geo);
  var given = SIDES.indexOf(item.against) >= 0 ? item.against : null;
  var pair = sidePair(box, true);
  if (given && (!pair || pair.indexOf(given) >= 0)) return given;
  var cands = pair || SIDES;
  var rects = roomRects(geo);
  var touching = cands.filter(function (s) {
    return boundaryGap(rects, box, s) <= 100 / mm;
  });
  if (touching.length === 1) return touching[0];
  var facing = cands.filter(function (s) {
    return tableInFront(geo, item, box, s, 900 / mm);
  });
  if (facing.length === 1) return OPPOSITE[facing[0]];
  return nearestSide(rects, box, cands);
}

/**
 * 床：整个框是床垫（被子），上面立着床头板、放着枕头；被子在枕头下面翻折一道。太小的框（不像床）= null，按普通方块画。
 * @returns {{ head:string, single:boolean, headboard:number[], pillows:number[][], pillowR:number, sheet:number[], fold:number[] }|null}
 */
function bedParts(geo, item, box) {
  var mm = mmOf(geo);
  var head = bedHeadSide(geo, item, box);
  var alongY = head === 'top' || head === 'bottom';
  var len = alongY ? box[3] - box[1] : box[2] - box[0]; // 床头 → 床尾
  var wid = alongY ? box[2] - box[0] : box[3] - box[1];
  if (!(len * mm >= 900) || !(wid * mm >= 500)) return null;
  var hb = Math.min(70 / mm, len * 0.08);
  var gap = Math.min(45 / mm, len * 0.03);
  var pl = Math.min(380 / mm, len * 0.24);
  var single = wid * mm < 1200;
  var spans = single ? [[0.17, 0.83]] : [[0.065, 0.465], [0.535, 0.935]];
  var p0 = hb + gap;
  var f0 = p0 + pl + gap * 0.9;
  var f1 = f0 + Math.min(240 / mm, len * 0.13);
  return {
    head: head,
    single: single,
    headboard: sideRect(box, head, 0, hb, 0, 1),
    pillows: spans.map(function (a) {
      return sideRect(box, head, p0, p0 + pl, a[0], a[1]);
    }),
    pillowR: pl * 0.28,
    sheet: sideRect(box, head, hb, f0, 0, 1),
    fold: sideRect(box, head, f0, f1, 0, 1),
  };
}

/**
 * 沙发：整个框是底座，上面是靠背一条 + 两头的扶手，中间露出坐垫（按长度分成 1–4 块）。太小的框 = null。
 * @returns {{ back:string, round:object, backRect:number[], backRound:object, arms:Array<{box:number[], round:object}>, seat:number[], cushions:number[][] }|null}
 */
function sofaParts(geo, item, box) {
  var mm = mmOf(geo);
  var back = sofaBackSide(geo, item, box);
  var alongX = back === 'top' || back === 'bottom';
  var len = alongX ? box[2] - box[0] : box[3] - box[1]; // 沿靠背方向
  var dep = alongX ? box[3] - box[1] : box[2] - box[0];
  if (!(len * mm >= 600) || !(dep * mm >= 450)) return null;
  var bd = dep * 0.22;
  var aw = Math.min(150 / mm, len * 0.18);
  var a = aw / len;
  var r = Math.min(70 / mm, aw * 0.45, bd * 0.45);
  var inner = (len - aw * 2) * mm;
  var n = Math.max(1, Math.min(4, Math.round(inner / 750)));
  var cushions = [];
  for (var i = 0; i < n; i++) cushions.push(sideRect(box, back, bd, dep, a + ((1 - a * 2) * i) / n, a + ((1 - a * 2) * (i + 1)) / n));
  return {
    back: back,
    round: { tl: r, tr: r, br: r, bl: r },
    backRect: sideRect(box, back, 0, bd, 0, 1),
    backRound: sideRound(back, r, r, 0, 0),
    arms: [
      { box: sideRect(box, back, bd, dep, 0, a), round: sideRound(back, 0, 0, r, 0) },
      { box: sideRect(box, back, bd, dep, 1 - a, 1), round: sideRound(back, 0, 0, 0, r) },
    ],
    seat: sideRect(box, back, bd, dep, a, 1 - a),
    cushions: cushions,
  };
}

/** 洁具是哪一种（看图上印的名字）：toilet 马桶 | tub 浴缸 | tray 淋浴盘 | hob 灶 | sink 水槽 | basin 洗手盆；认不出 = ''（按洗手盆画） */
function fixtureVariant(label) {
  var s = String(label === undefined || label === null ? '' : label);
  if (/W\.?C\b|TOILET|WATER\s*CLOSET|马桶|坐便|座便/i.test(s)) return 'toilet';
  if (/SHOWER|淋浴/i.test(s)) return 'tray';
  if (/HOB|STOVE|COOKER|COOKTOP|灶|炉/i.test(s)) return 'hob';
  if (/SINK|水槽|洗菜/i.test(s)) return 'sink';
  if (/BASIN|VANITY|洗手|洗脸|面盆|台盆/i.test(s)) return 'basin';
  if (/BATH|TUB|浴缸/i.test(s)) return 'tub';
  return '';
}

/** 洁具压在哪个台面 / 矮柜上（中心落在它的框里）；没有 = null */
function fixtureHost(geo, item, box) {
  var cx = (box[0] + box[2]) / 2;
  var cy = (box[1] + box[3]) / 2;
  var items = geo.items || [];
  for (var i = 0; i < items.length; i++) {
    var t = items[i];
    if (!t || t === item || !boxOk(t) || (t.kind !== 'low' && t.kind !== 'desk' && t.kind !== 'shelf')) continue;
    if (cx >= t.box[0] && cx <= t.box[2] && cy >= t.box[1] && cy <= t.box[3]) return t;
  }
  return null;
}

/**
 * 洁具：圆角的本体 + 顶面上的盆 / 缸的内沿、下水口、龙头；马桶另有一个水箱。框是空的 = null。
 * 嵌在台面上的水槽、灶（host）由画的程序抬到台面高度。
 * @returns {{ variant:string, named:boolean, back:string, host:object|null, body:{box,round}, tank:{box,round}|null,
 *   bowl:{box,round}|null, drain:number[]|null, tap:number[]|null, rings:number[][] }|null}  drain / tap / rings = [x, y, 半径]
 */
function fixtureParts(geo, item, box) {
  var mm = mmOf(geo);
  var w = box[2] - box[0];
  var h = box[3] - box[1];
  if (!(w > 0) || !(h > 0)) return null;
  var named = fixtureVariant(item.label);
  var variant = named || 'basin';
  var host = variant === 'basin' || variant === 'sink' || variant === 'hob' ? fixtureHost(geo, item, box) : null;
  if (variant === 'sink' && !host) variant = 'basin'; // 落地的 SINK 就是洗手盆
  var given = SIDES.indexOf(item.against) >= 0 ? item.against : null;
  var hostAgainst = host && SIDES.indexOf(host.against) >= 0 ? host.against : null;
  // 靠墙的一侧：马桶水箱 / 浴缸龙头在短边上；盆和水槽跟着 against（或台面的 against），没有就取离墙最近的一边
  var back = variant === 'toilet' || variant === 'tub' ? bedHeadSide(geo, item, box) : given || hostAgainst || nearestSide(roomRects(geo), box, SIDES);
  var alongY = back === 'top' || back === 'bottom';
  var dep = alongY ? h : w; // 从靠墙一侧往外
  var wid = alongY ? w : h;
  var short = Math.min(w, h);
  var all = function (r) {
    return { tl: r, tr: r, br: r, bl: r };
  };
  var at = function (d, a, r) {
    var p = sideRect(box, back, d, d, a, a);
    return [p[0], p[1], r];
  };
  var out = { variant: variant, named: !!named, back: back, host: host, body: { box: box, round: all(short * 0.28) }, tank: null, bowl: null, drain: null, tap: null, rings: [] };
  var bw;
  if (variant === 'toilet') {
    var td = Math.min(dep * 0.27, 200 / mm);
    var bl = dep - td;
    out.tank = { box: sideRect(box, back, 0, td, 0.05, 0.95), round: all(td * 0.16) };
    bw = wid * 0.76;
    out.body = { box: sideRect(box, back, td, dep, 0.12, 0.88), round: sideRound(back, bw * 0.22, bw * 0.22, bw / 2, bw / 2) };
    out.bowl = { box: sideRect(box, back, td + bl * 0.2, dep - bl * 0.11, 0.27, 0.73), round: all(wid) };
    out.tap = at(td * 0.5, 0.5, Math.min(22 / mm, td * 0.2)); // 冲水按钮
  } else if (variant === 'tub') {
    var rim = Math.max(Math.min(70 / mm, short * 0.16), short * 0.08);
    var iw = wid - rim * 2;
    out.body.round = all(short * 0.14);
    out.bowl = { box: sideRect(box, back, rim + dep * 0.05, dep - rim, rim / wid, 1 - rim / wid), round: sideRound(back, iw * 0.3, iw * 0.3, iw * 0.46, iw * 0.46) };
    out.tap = at(rim * 0.5 + dep * 0.025, 0.5, Math.min(28 / mm, rim * 0.32));
    out.drain = at(rim + dep * 0.05 + iw * 0.36, 0.5, Math.min(24 / mm, iw * 0.08));
  } else if (variant === 'tray') {
    out.body.round = all(short * 0.06);
    out.bowl = { box: [box[0] + short * 0.07, box[1] + short * 0.07, box[2] - short * 0.07, box[3] - short * 0.07], round: all(short * 0.04) };
    out.drain = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2, Math.min(40 / mm, short * 0.08)];
  } else if (variant === 'hob') {
    out.body.round = all(short * 0.06);
    // 长的方向两个灶眼；短的方向够宽（42 厘米）才放两个
    var rows = dep >= wid || dep * mm >= 420 ? [0.28, 0.72] : [0.5];
    var cols = wid > dep || wid * mm >= 420 ? [0.27, 0.73] : [0.5];
    var rr = Math.min(dep / (rows.length * 2), wid / (cols.length * 2)) * 0.56;
    rows.forEach(function (d) {
      cols.forEach(function (a) {
        out.rings.push(at(dep * d, a, rr));
      });
    });
  } else {
    // 洗手盆 / 水槽：靠墙一侧留出装龙头的台边，盆口朝外的一头更圆
    var sink = variant === 'sink';
    bw = wid * (sink ? 0.84 : 0.76);
    var bd = dep * (sink ? 0.62 : 0.64);
    out.body.round = sink ? all(short * 0.1) : named ? sideRound(back, short * 0.1, short * 0.1, short * 0.3, short * 0.3) : all(short * 0.28);
    out.bowl = {
      box: sideRect(box, back, dep * 0.26, dep * 0.26 + bd, (1 - bw / wid) / 2, (1 + bw / wid) / 2),
      round: sink ? all(Math.min(bw, bd) * 0.18) : sideRound(back, Math.min(bw, bd) * 0.26, Math.min(bw, bd) * 0.26, Math.min(bw, bd) * 0.48, Math.min(bw, bd) * 0.48),
    };
    out.tap = at(dep * 0.13, 0.5, Math.min(24 / mm, dep * 0.07));
    out.drain = at(dep * 0.26 + bd * 0.5, 0.5, Math.min(22 / mm, bd * 0.1));
  }
  return out;
}

/** 这件东西的框能不能用：四个有限的数。坏数据（没有框、NaN、写成字符串、整项是 null）一律不画，不能让整张图出错 */
function boxOk(item) {
  var b = item && item.box;
  if (!b || !(b.length >= 4)) return false;
  for (var i = 0; i < 4; i++) if (typeof b[i] !== 'number' || !isFinite(b[i])) return false;
  return true;
}

/** 整个模型（墙外沿 + 所有东西）的外包矩形 */
function contentBox(geo) {
  var t = geo.wallT || 0;
  var boxes = roomRects(geo).map(function (r) {
    return [r[0] - t, r[1] - t, r[2] + t, r[3] + t];
  });
  (geo.items || []).forEach(function (it) {
    if (boxOk(it)) boxes.push(it.box);
  });
  if (!boxes.length) return [0, 0, 1, 1];
  var c = [
    Math.min.apply(null, boxes.map(function (b) { return b[0]; })),
    Math.min.apply(null, boxes.map(function (b) { return b[1]; })),
    Math.max.apply(null, boxes.map(function (b) { return b[2]; })),
    Math.max.apply(null, boxes.map(function (b) { return b[3]; })),
  ];
  // 整个模型只是一个点（没有房间，只有一个零大小的框）：给它一个像素的范围，缩放才算得出来
  if (!(c[2] - c[0] > 0) && !(c[3] - c[1] > 0)) return [c[0] - 0.5, c[1] - 0.5, c[0] + 0.5, c[1] + 0.5];
  return c;
}

export { KINDS, SIDES, kindOf, roomRects, floorOf, edgeFor, openingRect, deriveWalls, snapToWall, rectPoly, chairPolys, clipPolyToBox, contentBox, boxOk, sideRect, boundaryGap, bedHeadSide, sofaBackSide, bedParts, sofaParts, fixtureVariant, fixtureParts };
