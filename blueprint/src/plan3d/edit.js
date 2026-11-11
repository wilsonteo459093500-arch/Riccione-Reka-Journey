// 户型图编辑器的纯逻辑（设计师在图纸上拖框）：房间轮廓、点选、拖拽、吸附、校验、修改操作、撤销重做。
// 纯函数，无依赖，ES5 写法 —— 以后要原样搬到没有构建步骤的 VISI。不改传进来的数据（没变的部分直接共用）。
import { SIDES, kindOf, edgeFor, openingRect } from './geometry.js';

var EPS = 1e-6;

/** 八个缩放手柄各自拖动哪几条边：[x0, y0, x1, y1] */
var HANDLE_EDGES = {
  nw: [1, 1, 0, 0],
  n: [0, 1, 0, 0],
  ne: [0, 1, 1, 0],
  e: [0, 0, 1, 0],
  se: [0, 0, 1, 1],
  s: [0, 0, 0, 1],
  sw: [1, 0, 0, 1],
  w: [1, 0, 0, 0],
};

var OPENING_ZH = { window: '窗', door: '门', 'hidden-door': '暗门', gap: '门洞' };

function isNum(v) {
  return typeof v === 'number' && isFinite(v);
}

function has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function copy(obj) {
  var out = {};
  for (var k in obj) if (has(obj, k)) out[k] = obj[k];
  return out;
}

function withKey(obj, key, value) {
  var out = copy(obj);
  out[key] = value;
  return out;
}

/** 不是数组（缺了 / 数据坏了）就当空的 */
function arr(v) {
  return Array.isArray(v) ? v : [];
}

function validIndex(list, i) {
  return isNum(i) && i === Math.floor(i) && i >= 0 && i < list.length;
}

function replaceAt(list, i, v) {
  var out = list.slice();
  out[i] = v;
  return out;
}

function removeAt(list, i) {
  return list.slice(0, i).concat(list.slice(i + 1));
}

function overlapLen(a0, a1, b0, b1) {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

function isHorizontal(side) {
  return side === 'top' || side === 'bottom';
}

/** 框整理成 [x0,y0,x1,y1]（x0<=x1、y0<=y1）；有不是数的值 = null */
function normBox(box) {
  if (!box || !(box.length >= 4)) return null;
  for (var i = 0; i < 4; i++) if (!isNum(box[i])) return null;
  return [Math.min(box[0], box[2]), Math.min(box[1], box[3]), Math.max(box[0], box[2]), Math.max(box[1], box[3])];
}

/** 两个框的交并比（不相交 / 面积为 0 = 0） */
function iou(a, b) {
  var p = normBox(a);
  var q = normBox(b);
  if (!p || !q) return 0;
  var w = overlapLen(p[0], p[2], q[0], q[2]);
  var h = overlapLen(p[1], p[3], q[1], q[3]);
  if (!(w > 0) || !(h > 0)) return 0;
  var inter = w * h;
  var union = (p[2] - p[0]) * (p[3] - p[1]) + (q[2] - q[0]) * (q[3] - q[1]) - inter;
  return union > 0 ? inter / union : 0;
}

/** 一个房间里有面积的矩形（整理过） */
function rectsOfRoom(room) {
  var out = [];
  var list = (room && room.rects) || [];
  for (var i = 0; i < list.length; i++) {
    var r = normBox(list[i]);
    if (r && r[2] - r[0] > 0 && r[3] - r[1] > 0) out.push(r);
  }
  return out;
}

/** 所有房间的矩形（整理过；缺数组也不报错） */
function allRects(geo) {
  var out = [];
  var rooms = (geo && geo.rooms) || [];
  for (var i = 0; i < rooms.length; i++) out = out.concat(rectsOfRoom(rooms[i]));
  return out;
}

/** 从若干段里挖掉 [c0, c1] */
function subtractSpan(spans, c0, c1) {
  var out = [];
  for (var i = 0; i < spans.length; i++) {
    var s = spans[i];
    if (c1 <= s[0] || c0 >= s[1]) {
      out.push(s);
      continue;
    }
    if (c0 > s[0]) out.push([s[0], c0]);
    if (c1 < s[1]) out.push([c1, s[1]]);
  }
  return out;
}

/** 房间的外轮廓：每条矩形边去掉被同一房间别的矩形盖住的部分，同一直线上连着的段合并 */
function boundaryEdges(geo) {
  var out = [];
  var rooms = (geo && geo.rooms) || [];
  for (var ri = 0; ri < rooms.length; ri++) {
    var rects = rectsOfRoom(rooms[ri]);
    for (var si = 0; si < SIDES.length; si++) {
      var side = SIDES[si];
      var horiz = isHorizontal(side);
      var segs = [];
      for (var k = 0; k < rects.length; k++) {
        var r = rects[k];
        var at = side === 'top' ? r[1] : side === 'bottom' ? r[3] : side === 'left' ? r[0] : r[2];
        var spans = [[horiz ? r[0] : r[1], horiz ? r[2] : r[3]]];
        for (var j = 0; j < rects.length && spans.length; j++) {
          if (j === k) continue;
          var q = rects[j];
          // 这条边外侧紧挨着的地方是不是在 q 里面（贴着也算）
          var covers =
            side === 'top' ? q[1] < at && q[3] >= at
            : side === 'bottom' ? q[1] <= at && q[3] > at
            : side === 'left' ? q[0] < at && q[2] >= at
            : q[0] <= at && q[2] > at;
          if (covers) spans = subtractSpan(spans, horiz ? q[0] : q[1], horiz ? q[2] : q[3]);
        }
        for (var m = 0; m < spans.length; m++) segs.push({ at: at, a: spans[m][0], b: spans[m][1] });
      }
      segs.sort(function (p, q2) {
        return p.at - q2.at || p.a - q2.a;
      });
      var cur = null;
      for (var n = 0; n < segs.length; n++) {
        var s = segs[n];
        if (!(s.b - s.a > EPS)) continue;
        // 只合并严格在同一条直线上的（at 差一点点的算两条：排序是按 at 分组的，放宽了会把夹在中间的段吞掉）
        if (cur && cur.at === s.at && s.a <= cur.b + EPS) {
          if (s.b > cur.b) cur.b = s.b;
        } else {
          cur = { side: side, at: s.at, a: s.a, b: s.b, room: ri };
          out.push(cur);
        }
      }
    }
  }
  return out;
}

/** 门窗贴的墙内侧面坐标：自己带 at 就用 at，否则按房间矩形推 */
function openingAt(rects, o) {
  if (isNum(o.at)) return o.at;
  return edgeFor(rects, o.side, Math.min(o.a, o.b), Math.max(o.a, o.b));
}

/** 门窗在墙体里占的矩形（带 at 的按 at 算，其余交给 openingRect） */
function openingBox(rects, o, t) {
  if (!o || SIDES.indexOf(o.side) < 0 || !isNum(o.a) || !isNum(o.b)) return null;
  if (!isNum(o.at)) return openingRect(rects, o, t);
  var a = Math.min(o.a, o.b);
  var b = Math.max(o.a, o.b);
  if (!(b - a > 0)) return null;
  if (o.side === 'top') return [a, o.at - t, b, o.at];
  if (o.side === 'bottom') return [a, o.at, b, o.at + t];
  if (o.side === 'left') return [o.at - t, a, o.at, b];
  return [o.at, a, o.at + t, b];
}

/** 门窗贴不到墙（出图时画不出来）：openingRect 找不到墙；带 at 的还要求那个位置真有一条同侧的轮廓边 */
function openingOff(rects, edges, o, t) {
  if (!o || SIDES.indexOf(o.side) < 0 || !isNum(o.a) || !isNum(o.b)) return true;
  if (openingRect(rects, o, t) === null) return true;
  if (!isNum(o.at)) return false;
  var a = Math.min(o.a, o.b);
  var b = Math.max(o.a, o.b);
  for (var i = 0; i < edges.length; i++) {
    var e = edges[i];
    if (e.side === o.side && Math.abs(e.at - o.at) <= 0.5 && overlapLen(e.a, e.b, a, b) > 0) return false;
  }
  return true;
}

/** 选中的框上的缩放手柄：角优先，其次是两角之间的边；框很小时手柄只占到框内三分之一，中间留给移动 */
function boxHandle(b, x, y, tol) {
  var tx = Math.min(tol, (b[2] - b[0]) / 3);
  var ty = Math.min(tol, (b[3] - b[1]) / 3);
  var nearL = x >= b[0] - tol && x <= b[0] + tx;
  var nearR = x >= b[2] - tx && x <= b[2] + tol;
  var nearT = y >= b[1] - tol && y <= b[1] + ty;
  var nearB = y >= b[3] - ty && y <= b[3] + tol;
  if (nearT && nearL) return 'nw';
  if (nearT && nearR) return 'ne';
  if (nearB && nearR) return 'se';
  if (nearB && nearL) return 'sw';
  var inX = x >= b[0] && x <= b[2];
  var inY = y >= b[1] && y <= b[3];
  if (nearT && inX) return 'n';
  if (nearR && inY) return 'e';
  if (nearB && inX) return 's';
  if (nearL && inY) return 'w';
  return null;
}

/** 选中的门窗两端的手柄：'a' / 'b'（沿墙方向离端点不超过 tol，垂直方向在墙厚范围内） */
function openingHandle(rects, o, x, y, tol, t) {
  if (!o || SIDES.indexOf(o.side) < 0 || !isNum(o.a) || !isNum(o.b)) return null;
  var at = openingAt(rects, o);
  if (at === null) return null;
  var horiz = isHorizontal(o.side);
  var p = horiz ? x : y;
  var c = horiz ? y : x;
  var outward = o.side === 'top' || o.side === 'left' ? -1 : 1;
  var c0 = outward < 0 ? at - t - tol : at - tol;
  var c1 = outward < 0 ? at + tol : at + t + tol;
  if (c < c0 || c > c1) return null;
  var lo = Math.min(o.a, o.b);
  var hi = Math.max(o.a, o.b);
  var ti = Math.min(tol, (hi - lo) / 3);
  var nearLo = p >= lo - tol && p <= lo + ti;
  var nearHi = p >= hi - ti && p <= hi + tol;
  if (!nearLo && !nearHi) return null;
  var useLo = nearLo && (!nearHi || Math.abs(p - lo) < Math.abs(p - hi));
  return useLo === o.a <= o.b ? 'a' : 'b';
}

/** 点到矩形轮廓线的距离（里外都算，取横竖两个方向里大的 / 到最近一条边） */
function outlineDist(r, x, y) {
  var ox = Math.max(r[0] - x, 0, x - r[2]);
  var oy = Math.max(r[1] - y, 0, y - r[3]);
  if (ox > 0 || oy > 0) return Math.max(ox, oy);
  return Math.min(x - r[0], r[2] - x, y - r[1], r[3] - y);
}

/** 点选：先看选中对象的手柄，再依次找家具（面积最小的）、门窗、房间矩形的边；都没点中 = null */
function hitTest(geo, pt, opts) {
  if (!geo || !pt || !isNum(pt[0]) || !isNum(pt[1])) return null;
  var o = opts || {};
  var tol = typeof o.tol === 'number' && o.tol >= 0 ? o.tol : 6;
  var doItems = o.layer !== 'structure';
  var doStruct = o.layer !== 'items';
  var x = pt[0];
  var y = pt[1];
  var items = geo.items || [];
  var openings = geo.openings || [];
  var rooms = geo.rooms || [];
  var rects = allRects(geo);
  var t = isNum(geo.wallT) && geo.wallT > 0 ? geo.wallT : 0;
  var sel = o.selected;
  var box;
  var h;
  var i;

  if (sel && typeof sel === 'object') {
    if (sel.type === 'item' && doItems && items[sel.index]) {
      box = normBox(items[sel.index].box);
      h = box ? boxHandle(box, x, y, tol) : null;
      if (h) return { type: 'item', index: sel.index, handle: h };
    } else if (sel.type === 'room' && doStruct && rooms[sel.index]) {
      var ri = sel.rect == null ? 0 : sel.rect;
      box = normBox((rooms[sel.index].rects || [])[ri]);
      h = box ? boxHandle(box, x, y, tol) : null;
      if (h) return { type: 'room', index: sel.index, rect: ri, handle: h };
    } else if (sel.type === 'opening' && doStruct && openings[sel.index]) {
      h = openingHandle(rects, openings[sel.index], x, y, tol, t);
      if (h) return { type: 'opening', index: sel.index, handle: h };
    }
  }

  var best = -1;
  var bestV = Infinity;
  if (doItems) {
    for (i = 0; i < items.length; i++) {
      box = normBox(items[i] && items[i].box);
      if (!box) continue;
      if (x < box[0] - tol || x > box[2] + tol || y < box[1] - tol || y > box[3] + tol) continue;
      var area = (box[2] - box[0]) * (box[3] - box[1]);
      if (area <= bestV) {
        bestV = area;
        best = i;
      }
    }
    if (best >= 0) return { type: 'item', index: best, handle: 'move' };
  }
  if (!doStruct) return null;

  for (i = 0; i < openings.length; i++) {
    box = openingBox(rects, openings[i], t);
    if (!box) continue;
    if (x < box[0] - tol || x > box[2] + tol || y < box[1] - tol || y > box[3] + tol) continue;
    var span = Math.abs(openings[i].b - openings[i].a);
    if (span < bestV) {
      bestV = span;
      best = i;
    }
  }
  if (best >= 0) return { type: 'opening', index: best, handle: 'move' };

  var hit = null;
  for (i = 0; i < rooms.length; i++) {
    var list = (rooms[i] && rooms[i].rects) || [];
    for (var k = 0; k < list.length; k++) {
      box = normBox(list[k]);
      if (!box) continue;
      var d = outlineDist(box, x, y);
      if (d > tol) continue;
      var a2 = (box[2] - box[0]) * (box[3] - box[1]);
      if (!hit || d < hit.d - EPS || (Math.abs(d - hit.d) <= EPS && a2 < hit.area)) hit = { d: d, area: a2, room: i, rect: k };
    }
  }
  return hit ? { type: 'room', index: hit.room, rect: hit.rect, handle: 'move' } : null;
}

/** 拖小的一侧的边：不出界、不越过对边（留出最小尺寸）；本来就比最小尺寸小时只是不许再往里 */
function dragLo(v, d, other, lim, min) {
  var n = v + d;
  if (lim !== null && n < lim) n = lim;
  var stop = Math.max(v, other - min);
  return n > stop ? stop : n;
}

/** 拖大的一侧的边（同上，方向相反） */
function dragHi(v, d, other, lim, min) {
  var n = v + d;
  if (lim !== null && n > lim) n = lim;
  var stop = Math.min(v, other + min);
  return n < stop ? stop : n;
}

/** 拖一个框：'move' 整体平移（不出界、大小不变）；八个手柄只动对应的边，到最小尺寸就停、不会翻面 */
function dragRect(box, handle, dx, dy, bounds, min) {
  var b = normBox(box);
  if (!b) return box;
  var bd = normBox(bounds);
  var m = isNum(min) && min >= 0 ? min : 4;
  var mx = isNum(dx) ? dx : 0;
  var my = isNum(dy) ? dy : 0;
  if (handle === 'move' || handle == null) {
    var w = b[2] - b[0];
    var h = b[3] - b[1];
    var x = b[0] + mx;
    var y = b[1] + my;
    if (bd) {
      x = Math.max(bd[0], Math.min(x, bd[2] - w));
      y = Math.max(bd[1], Math.min(y, bd[3] - h));
    }
    return [x, y, x + w, y + h];
  }
  var ed = has(HANDLE_EDGES, handle) ? HANDLE_EDGES[handle] : null;
  if (!ed) return b;
  if (ed[0]) b[0] = dragLo(b[0], mx, b[2], bd ? bd[0] : null, m);
  if (ed[1]) b[1] = dragLo(b[1], my, b[3], bd ? bd[1] : null, m);
  if (ed[2]) b[2] = dragHi(b[2], mx, b[0], bd ? bd[2] : null, m);
  if (ed[3]) b[3] = dragHi(b[3], my, b[1], bd ? bd[3] : null, m);
  return b;
}

/** 一个方向上最近的可吸附轮廓边：horiz = 找横向的轮廓边（动 y），否则找竖向的（动 x） */
function bestSnap(edges, horiz, b, useLo, useHi, tol, move) {
  var lo = horiz ? b[1] : b[0];
  var hi = horiz ? b[3] : b[2];
  var s0 = horiz ? b[0] : b[1];
  var s1 = horiz ? b[2] : b[3];
  var loSide = horiz ? 'top' : 'left';
  var hiSide = horiz ? 'bottom' : 'right';
  var best = null;
  var take = function (d, pref, isLo, at) {
    if (!(d <= tol)) return;
    if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) <= 1e-9 && pref > best.pref)) best = { d: d, pref: pref, lo: isLo, at: at };
  };
  for (var i = 0; i < edges.length; i++) {
    var e = edges[i];
    if (isHorizontal(e.side) !== horiz) continue;
    if (!(overlapLen(e.a, e.b, s0, s1) > EPS)) continue;
    if (useLo && (move || e.at < hi - EPS)) take(Math.abs(e.at - lo), e.side === loSide ? 1 : 0, true, e.at);
    if (useHi && (move || e.at > lo + EPS)) take(Math.abs(e.at - hi), e.side === hiSide ? 1 : 0, false, e.at);
  }
  return best;
}

/** 框贴着哪一面墙：接触最长的那一侧（按房间的哪一侧说）；哪面都不贴 = null */
function againstOf(edges, b) {
  var len = { top: 0, right: 0, bottom: 0, left: 0 };
  var pref = { top: 0, right: 0, bottom: 0, left: 0 };
  var i;
  for (i = 0; i < edges.length; i++) {
    var e = edges[i];
    var horiz = isHorizontal(e.side);
    var onLo = Math.abs(e.at - (horiz ? b[1] : b[0])) <= EPS;
    var onHi = Math.abs(e.at - (horiz ? b[3] : b[2])) <= EPS;
    if (!onLo && !onHi) continue;
    var l = overlapLen(e.a, e.b, horiz ? b[0] : b[1], horiz ? b[2] : b[3]);
    if (!(l > EPS)) continue;
    len[e.side] += l;
    if ((onLo && (e.side === 'top' || e.side === 'left')) || (onHi && (e.side === 'bottom' || e.side === 'right'))) pref[e.side] = 1;
  }
  var best = null;
  for (i = 0; i < SIDES.length; i++) {
    var s = SIDES[i];
    if (!(len[s] > EPS)) continue;
    if (best === null || len[s] > len[best] + EPS || (Math.abs(len[s] - len[best]) <= EPS && pref[s] > pref[best])) best = s;
  }
  return best;
}

/** 把框吸到房间轮廓上：移动时整体平移（每个方向最多吸一次、最近的优先），缩放时只动被拖的边；against = 贴着哪面墙 */
function snapBox(geo, box, tol, handle) {
  var b = normBox(box);
  if (!b) return { box: box, against: null };
  var t = typeof tol === 'number' && tol >= 0 ? tol : 0;
  var edges = boundaryEdges(geo);
  var move = handle === 'move' || handle == null;
  var ed = move ? [1, 1, 1, 1] : has(HANDLE_EDGES, handle) ? HANDLE_EDGES[handle] : [0, 0, 0, 0];
  var out = b.slice();
  var w = b[2] - b[0];
  var h = b[3] - b[1];
  // 吸完一个方向，另一个方向面对的墙可能变了 → 再看一遍，直到不动为止（这样对结果再吸一次不会又跳一下）
  for (var pass = 0; pass < 8; pass++) {
    var cur = out.slice();
    var sx = bestSnap(edges, false, cur, ed[0], ed[2], t, move);
    var sy = bestSnap(edges, true, cur, ed[1], ed[3], t, move);
    if (sx) {
      if (sx.lo) {
        out[0] = sx.at;
        if (move) out[2] = sx.at + w;
      } else {
        out[2] = sx.at;
        if (move) out[0] = sx.at - w;
      }
    }
    if (sy) {
      if (sy.lo) {
        out[1] = sy.at;
        if (move) out[3] = sy.at + h;
      } else {
        out[3] = sy.at;
        if (move) out[1] = sy.at - h;
      }
    }
    if (sameValue(out, cur)) break;
  }
  return { box: out, against: againstOf(edges, out) };
}

/** 画的一段门窗（p1 → p2）落到离中点最近的轮廓边上：沿边投影、夹到边的范围里；太短（< 2 像素）或没有边 = null */
function snapOpening(geo, p1, p2, tol) {
  if (!p1 || !p2 || !isNum(p1[0]) || !isNum(p1[1]) || !isNum(p2[0]) || !isNum(p2[1])) return null;
  var t = typeof tol === 'number' && tol >= 0 ? tol : Infinity;
  var edges = boundaryEdges(geo);
  var mx = (p1[0] + p2[0]) / 2;
  var my = (p1[1] + p2[1]) / 2;
  var best = null;
  for (var i = 0; i < edges.length; i++) {
    var e = edges[i];
    var horiz = isHorizontal(e.side);
    var p = horiz ? mx : my;
    var q = horiz ? my : mx;
    var along = p < e.a ? e.a - p : p > e.b ? p - e.b : 0;
    var d = Math.sqrt(along * along + (q - e.at) * (q - e.at));
    if (!(d <= t)) continue;
    var u = horiz ? p1[0] : p1[1];
    var v = horiz ? p2[0] : p2[1];
    var a = Math.max(e.a, Math.min(e.b, Math.min(u, v)));
    var b = Math.max(e.a, Math.min(e.b, Math.max(u, v)));
    // 距离一样（比如中点正好在墙角）：取和画的方向一致的那条边
    if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) <= 1e-9 && b - a > best.b - best.a)) best = { d: d, e: e, a: a, b: b };
  }
  if (!best || best.b - best.a < 2) return null;
  return { side: best.e.side, at: best.e.at, a: best.a, b: best.b, room: best.e.room };
}

/** 椅子朝哪边：最近的书桌在哪一侧（'top' = 桌子在上面）；没有书桌 = null */
function guessFacing(geo, box) {
  var b = normBox(box);
  if (!b) return null;
  var items = (geo && geo.items) || [];
  var best = null;
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || it.kind !== 'desk') continue;
    var d = normBox(it.box);
    if (!d) continue;
    var gx = Math.max(d[0] - b[2], b[0] - d[2], 0);
    var gy = Math.max(d[1] - b[3], b[1] - d[3], 0);
    var gap = Math.sqrt(gx * gx + gy * gy);
    var cx = (d[0] + d[2]) / 2 - (b[0] + b[2]) / 2;
    var cy = (d[1] + d[3]) / 2 - (b[1] + b[3]) / 2;
    var cd = Math.sqrt(cx * cx + cy * cy);
    if (!best || gap < best.gap - EPS || (Math.abs(gap - best.gap) <= EPS && cd < best.cd)) best = { gap: gap, cd: cd, cx: cx, cy: cy, box: d };
  }
  if (!best) return null;
  var overX = overlapLen(b[0], b[2], best.box[0], best.box[2]) > 0;
  var overY = overlapLen(b[1], b[3], best.box[1], best.box[3]) > 0;
  // 桌子和椅子在 x 方向上有重叠 → 桌子在上 / 下；两个方向都重叠或都不重叠 → 看中心差得多的方向
  var vertical = overX !== overY ? overX : Math.abs(best.cy) > Math.abs(best.cx);
  if (vertical) return best.cy < 0 ? 'top' : 'bottom';
  return best.cx < 0 ? 'left' : 'right';
}

/** 东西在不在房间里：中心落在某个房间矩形里；柱子只要碰到房间外扩一个墙厚的范围就算（柱子常在墙里） */
function itemInRooms(rects, it, t) {
  var b = normBox(it && it.box);
  if (!b) return false;
  var cx = (b[0] + b[2]) / 2;
  var cy = (b[1] + b[3]) / 2;
  var i;
  var r;
  for (i = 0; i < rects.length; i++) {
    r = rects[i];
    if (cx >= r[0] && cx <= r[2] && cy >= r[1] && cy <= r[3]) return true;
  }
  if (it.kind !== 'column') return false;
  for (i = 0; i < rects.length; i++) {
    r = rects[i];
    if (b[0] <= r[2] + t && b[2] >= r[0] - t && b[1] <= r[3] + t && b[3] >= r[1] - t) return true;
  }
  return false;
}

function wallTOf(geo) {
  return geo && isNum(geo.wallT) && geo.wallT > 0 ? geo.wallT : 0;
}

/** 真正交给画图程序的数据：去掉不在任何房间里的东西和贴不到墙的门窗，其余原样共用 */
function renderGeo(geo) {
  if (!geo) return geo;
  var rects = allRects(geo);
  var edges = boundaryEdges(geo);
  var t = wallTOf(geo);
  var items = geo.items || [];
  var openings = geo.openings || [];
  var keptItems = [];
  var keptOpenings = [];
  var i;
  for (i = 0; i < items.length; i++) if (itemInRooms(rects, items[i], t)) keptItems.push(items[i]);
  for (i = 0; i < openings.length; i++) if (!openingOff(rects, edges, openings[i], t)) keptOpenings.push(openings[i]);
  if (geo.rooms && geo.items && geo.openings && keptItems.length === items.length && keptOpenings.length === openings.length) return geo;
  var out = copy(geo);
  out.rooms = geo.rooms || [];
  out.items = keptItems.length === items.length && geo.items ? geo.items : keptItems;
  out.openings = keptOpenings.length === openings.length && geo.openings ? geo.openings : keptOpenings;
  return out;
}

function itemName(it, i) {
  return '第 ' + (i + 1) + ' 项「' + ((it && it.label) || kindOf(it && it.kind).zh) + '」';
}

/** 检查数据，列出要提醒设计师的问题（error = 画不了，warn = 可能不对） */
function validateGeo(geo) {
  var out = [];
  var rects = allRects(geo);
  var edges = boundaryEdges(geo);
  var t = wallTOf(geo);
  var items = (geo && geo.items) || [];
  var openings = (geo && geo.openings) || [];
  var i;
  var j;
  if (!rects.length) out.push({ level: 'error', code: 'no-room', zh: '还没有房间：先在图纸上框出房间的范围' });
  for (i = 0; i < items.length; i++) {
    var it = items[i] || {};
    var name = itemName(it, i);
    var b = normBox(it.box);
    if (!b) {
      out.push({ level: 'warn', code: 'item-outside', type: 'item', index: i, zh: name + '的坐标不对，出图时不会画出来' });
      continue;
    }
    if (rects.length && !itemInRooms(rects, it, t)) {
      out.push({ level: 'warn', code: 'item-outside', type: 'item', index: i, zh: name + '不在任何房间里，出图时不会画出来' });
    }
    for (j = 0; j < i; j++) {
      if (items[j] && items[j].kind === it.kind && iou(items[j].box, b) > 0.85) {
        out.push({ level: 'warn', code: 'item-duplicate', type: 'item', index: i, zh: name + '和' + itemName(items[j], j) + '几乎重叠，可能框了两次' });
        break;
      }
    }
    if (Math.min(b[2] - b[0], b[3] - b[1]) < 3) {
      out.push({ level: 'warn', code: 'tiny', type: 'item', index: i, zh: name + '太窄了（不到 3 像素），可能是误框' });
    }
    if (it.unsure) {
      out.push({ level: 'warn', code: 'unsure', type: 'item', index: i, zh: name + '是自动识别时拿不准的，请确认位置和种类' });
    }
  }
  if (rects.length) {
    for (i = 0; i < openings.length; i++) {
      if (!openingOff(rects, edges, openings[i], t)) continue;
      var zh = OPENING_ZH[openings[i] && openings[i].type] || '门窗';
      out.push({ level: 'warn', code: 'opening-off-wall', type: 'opening', index: i, zh: '第 ' + (i + 1) + ' 个' + zh + '没有贴在墙上，出图时不会画出来' });
    }
  }
  return out;
}

/** 整体缩放 + 平移所有坐标（x' = x*sx+dx，y' = y*sy+dy）；墙厚、圆角、比例尺按平均缩放换算；source 不动 */
function transformGeo(geo, sx, sy, dx, dy) {
  if (!geo || !isNum(sx) || !isNum(sy) || !(sx > 0) || !(sy > 0)) return geo;
  var ox = isNum(dx) ? dx : 0;
  var oy = isNum(dy) ? dy : 0;
  var m = (sx + sy) / 2;
  var mapBox = function (box) {
    var b = normBox(box);
    return b ? [b[0] * sx + ox, b[1] * sy + oy, b[2] * sx + ox, b[3] * sy + oy] : box;
  };
  var out = copy(geo);
  if (isNum(geo.wallT)) out.wallT = geo.wallT * m;
  if (isNum(geo.mmPerPx)) out.mmPerPx = geo.mmPerPx / m;
  if (Array.isArray(geo.rooms)) {
    out.rooms = geo.rooms.map(function (room) {
      if (!room || !Array.isArray(room.rects)) return room;
      return withKey(room, 'rects', room.rects.map(mapBox));
    });
  }
  if (Array.isArray(geo.items)) {
    out.items = geo.items.map(function (it) {
      if (!it || typeof it !== 'object') return it;
      var next = copy(it);
      if (it.box) next.box = mapBox(it.box);
      if (it.round && typeof it.round === 'object') {
        var round = {};
        for (var k in it.round) if (has(it.round, k)) round[k] = isNum(it.round[k]) ? it.round[k] * m : it.round[k];
        next.round = round;
      }
      return next;
    });
  }
  if (Array.isArray(geo.openings)) {
    out.openings = geo.openings.map(function (o) {
      if (!o || typeof o !== 'object') return o;
      var horiz = isHorizontal(o.side);
      var next = copy(o);
      if (isNum(o.a)) next.a = horiz ? o.a * sx + ox : o.a * sy + oy;
      if (isNum(o.b)) next.b = horiz ? o.b * sx + ox : o.b * sy + oy;
      if (isNum(o.at)) next.at = horiz ? o.at * sy + oy : o.at * sx + ox;
      return next;
    });
  }
  return out;
}

/** 新东西的编号：'种类-N'，不和已有的重复 */
function newItemId(geo, kind) {
  var k = typeof kind === 'string' && kind ? kind : 'block';
  var items = (geo && geo.items) || [];
  var used = {};
  for (var i = 0; i < items.length; i++) if (items[i] && items[i].id != null) used['#' + items[i].id] = true;
  var n = 1;
  while (used['#' + k + '-' + n]) n++;
  return k + '-' + n;
}

/** 值一样：同一个东西，或者内容逐项相同的数组 / 对象（只比一层，比如框、圆角） */
function sameValue(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  var k;
  for (k in a) if (has(a, k) && (!has(b, k) || a[k] !== b[k])) return false;
  for (k in b) if (has(b, k) && !has(a, k)) return false;
  return true;
}

/** 浅合并：值为 undefined 的键删掉；什么都没变 = null */
function mergePatch(obj, patch) {
  var out = copy(obj);
  var changed = false;
  for (var k in patch) {
    if (!has(patch, k)) continue;
    if (patch[k] === undefined) {
      if (has(out, k)) {
        delete out[k];
        changed = true;
      }
    } else if (!has(out, k) || !sameValue(out[k], patch[k])) {
      out[k] = patch[k];
      changed = true;
    }
  }
  return changed ? out : null;
}

function validOpening(o) {
  return !!o && SIDES.indexOf(o.side) >= 0 && isNum(o.a) && isNum(o.b);
}

/** 去掉列表里每一项的 unsure；一项都没有 = 原列表 */
function confirmList(list) {
  if (!Array.isArray(list)) return list;
  var changed = false;
  var out = list.map(function (it) {
    if (!it || typeof it !== 'object' || !has(it, 'unsure')) return it;
    changed = true;
    var next = copy(it);
    delete next.unsure;
    return next;
  });
  return changed ? out : list;
}

/** 修改操作（不改原数据，返回新的）；不认识的操作 / 序号不对 / 没有变化 → 返回原来那个对象 */
function applyOp(geo, op) {
  if (!op || typeof op.type !== 'string') return geo;
  var g = geo || {};
  var items = arr(g.items);
  var rooms = arr(g.rooms);
  var openings = arr(g.openings);
  var type = op.type;
  var box;
  var next;
  var room;
  var rects;
  var patch;

  if (type === 'addItem') {
    if (!op.item || typeof op.item !== 'object') return geo;
    box = normBox(op.item.box);
    if (!box) return geo;
    next = copy(op.item);
    next.box = box;
    if (typeof next.kind !== 'string' || !next.kind) next.kind = 'block';
    if (next.label == null) next.label = '';
    if (next.id == null || next.id === '' || idUsed(items, next.id)) next.id = newItemId(g, next.kind);
    return withKey(g, 'items', items.concat([next]));
  }
  if (type === 'updateItem') {
    if (!validIndex(items, op.index) || !items[op.index] || !op.patch || typeof op.patch !== 'object') return geo;
    patch = op.patch;
    if (has(patch, 'box')) {
      box = normBox(patch.box);
      if (!box) return geo;
      patch = withKey(patch, 'box', box);
    }
    // 设计师动过框或种类 = 已经确认过了（除非这次修改自己带着 unsure）
    if ((has(patch, 'box') || has(patch, 'kind')) && !has(patch, 'unsure')) patch = withKey(patch, 'unsure', undefined);
    next = mergePatch(items[op.index], patch);
    return next ? withKey(g, 'items', replaceAt(items, op.index, next)) : geo;
  }
  if (type === 'removeItem') {
    return validIndex(items, op.index) ? withKey(g, 'items', removeAt(items, op.index)) : geo;
  }

  if (type === 'addRoom') {
    box = normBox(op.box);
    if (!box || !(box[2] - box[0] > 0) || !(box[3] - box[1] > 0)) return geo;
    next = { name: typeof op.name === 'string' && op.name ? op.name : '房间 ' + (rooms.length + 1), rects: [box] };
    return withKey(g, 'rooms', rooms.concat([next]));
  }
  if (type === 'addRoomRect' || type === 'setRoomRect' || type === 'removeRoomRect' || type === 'setRoomName') {
    if (!validIndex(rooms, op.room) || !rooms[op.room]) return geo;
    room = rooms[op.room];
    rects = arr(room.rects);
    if (type === 'setRoomName') {
      if (typeof op.name !== 'string' || op.name === room.name) return geo;
      return withKey(g, 'rooms', replaceAt(rooms, op.room, withKey(room, 'name', op.name)));
    }
    if (type === 'removeRoomRect') {
      if (!validIndex(rects, op.rect)) return geo;
      if (rects.length <= 1) return withKey(g, 'rooms', removeAt(rooms, op.room));
      return withKey(g, 'rooms', replaceAt(rooms, op.room, withKey(room, 'rects', removeAt(rects, op.rect))));
    }
    box = normBox(op.box);
    if (!box || !(box[2] - box[0] > 0) || !(box[3] - box[1] > 0)) return geo;
    if (type === 'addRoomRect') {
      return withKey(g, 'rooms', replaceAt(rooms, op.room, withKey(room, 'rects', rects.concat([box]))));
    }
    if (!validIndex(rects, op.rect) || sameValue(rects[op.rect], box)) return geo;
    return withKey(g, 'rooms', replaceAt(rooms, op.room, withKey(room, 'rects', replaceAt(rects, op.rect, box))));
  }

  if (type === 'addOpening') {
    if (!validOpening(op.opening)) return geo;
    next = copy(op.opening);
    if (typeof next.type !== 'string' || !next.type) next.type = 'door';
    return withKey(g, 'openings', openings.concat([next]));
  }
  if (type === 'updateOpening') {
    if (!validIndex(openings, op.index) || !openings[op.index] || !op.patch || typeof op.patch !== 'object') return geo;
    next = mergePatch(openings[op.index], op.patch);
    if (!next || !validOpening(next)) return geo;
    return withKey(g, 'openings', replaceAt(openings, op.index, next));
  }
  if (type === 'removeOpening') {
    return validIndex(openings, op.index) ? withKey(g, 'openings', removeAt(openings, op.index)) : geo;
  }

  if (type === 'setScale') {
    if (!isNum(op.mmPerPx) || !(op.mmPerPx > 0) || op.mmPerPx === g.mmPerPx) return geo;
    return withKey(g, 'mmPerPx', op.mmPerPx);
  }
  if (type === 'setWallT') {
    if (!isNum(op.wallT) || !(op.wallT > 0) || op.wallT === g.wallT) return geo;
    return withKey(g, 'wallT', op.wallT);
  }
  if (type === 'confirmAll') {
    var ci = confirmList(g.items);
    var co = confirmList(g.openings);
    var cr = confirmList(g.rooms);
    if (ci === g.items && co === g.openings && cr === g.rooms) return geo;
    next = copy(g);
    if (ci !== g.items) next.items = ci;
    if (co !== g.openings) next.openings = co;
    if (cr !== g.rooms) next.rooms = cr;
    return next;
  }
  return geo;
}

function idUsed(items, id) {
  for (var i = 0; i < items.length; i++) if (items[i] && items[i].id === id) return true;
  return false;
}

/** 撤销重做的历史：从一份数据开始 */
function histInit(geo) {
  return { past: [], present: geo, future: [] };
}

/** 记一步（和当前是同一个对象就不记）；清掉重做；最多留 limit 步（默认 100） */
function histPush(h, geo, limit) {
  if (!h || geo === h.present) return h;
  var n = typeof limit === 'number' && limit >= 0 ? Math.floor(limit) : 100;
  var past = (h.past || []).concat([h.present]);
  if (past.length > n) past = past.slice(past.length - n);
  return { past: past, present: geo, future: [] };
}

/** 撤销一步（没有可撤销的 = 原对象） */
function histUndo(h) {
  if (!h || !h.past || !h.past.length) return h;
  return {
    past: h.past.slice(0, h.past.length - 1),
    present: h.past[h.past.length - 1],
    future: [h.present].concat(h.future || []),
  };
}

/** 重做一步（没有可重做的 = 原对象） */
function histRedo(h) {
  if (!h || !h.future || !h.future.length) return h;
  return {
    past: (h.past || []).concat([h.present]),
    present: h.future[0],
    future: h.future.slice(1),
  };
}

export { boundaryEdges, hitTest, dragRect, snapBox, snapOpening, guessFacing, renderGeo, validateGeo, transformGeo, applyOp, newItemId, histInit, histPush, histUndo, histRedo, iou, normBox };
