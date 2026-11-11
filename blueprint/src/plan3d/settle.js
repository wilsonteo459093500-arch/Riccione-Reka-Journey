// 每次改完坐标之后「理一遍」（ES5、无依赖）：门窗跟着最近的墙走，柜子重新判断贴哪面墙，椅子重新判断朝哪张桌子。
// 编辑器每次松手、AI 框完、打开旧数据时都过一遍，保证交给画图程序的数据前后一致。

import { edgeFor, roomRects } from './geometry.js';
import { snapBox, snapOpening, guessFacing } from './edit.js';

/** 贴墙容差（图纸像素）：和 scene.js 画图时把柜子拉到墙面的容差一致 */
function wallTol(geo) {
  var s = geo.source;
  if (s && s.w > 0 && s.h > 0) return Math.max(4, 0.0086 * Math.max(s.w, s.h));
  return 16;
}

function settleOpening(geo, rects, o) {
  var horiz = o.side === 'top' || o.side === 'bottom';
  var a = Math.min(o.a, o.b);
  var b = Math.max(o.a, o.b);
  var at = typeof o.at === 'number' && isFinite(o.at) ? o.at : edgeFor(rects, o.side, a, b);
  if (at === null || !isFinite(a) || !isFinite(b)) return o;
  var p1 = horiz ? [a, at] : [at, a];
  var p2 = horiz ? [b, at] : [at, b];
  var so = snapOpening(geo, p1, p2, Infinity);
  if (!so) return o;
  if (so.side === o.side && so.at === o.at && so.a === o.a && so.b === o.b) return o;
  var out = {};
  for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k];
  out.side = so.side;
  out.at = so.at;
  out.a = so.a;
  out.b = so.b;
  return out;
}

function settleItem(geo, it, tol) {
  if (!it || !it.box || it.kind === 'column') return it; // 柱子本来就长在墙里，不判断贴墙
  var against = snapBox(geo, it.box, tol, 'move').against || null;
  var facing = it.kind === 'chair' ? guessFacing(geo, it.box) || it.facing || null : it.facing || null;
  if ((it.against || null) === against && (it.facing || null) === facing) return it;
  var out = {};
  for (var k in it) if (Object.prototype.hasOwnProperty.call(it, k)) out[k] = it[k];
  if (against) out.against = against;
  else delete out.against;
  if (facing) out.facing = facing;
  else delete out.facing;
  return out;
}

/**
 * 理一遍坐标：门窗吸到最近的墙边（房间改了，门窗跟着走）；柜子家具按位置重新判断贴哪面墙、椅子朝哪张桌子。
 * 不移动任何柜子；没有变化的条目原样返回（同一个对象）。
 */
function settleGeo(geo) {
  var g = geo || {};
  var out = {};
  for (var k in g) if (Object.prototype.hasOwnProperty.call(g, k)) out[k] = g[k];
  out.rooms = g.rooms || [];
  out.openings = g.openings || [];
  out.items = g.items || [];
  var rects = roomRects(out);
  if (rects.length) {
    out.openings = out.openings.map(function (o) {
      return settleOpening(out, rects, o);
    });
  }
  var tol = wallTol(out);
  out.items = out.items.map(function (it) {
    return settleItem(out, it, tol);
  });
  return out;
}

export { settleGeo, wallTol };
