// 把 scene.js 的清单画到 canvas 上（Canvas 2D，无外部依赖，ES5 写法）。位置全部来自清单，这里只管好不好看。
// env.createCanvas(w, h) 由调用方给（网页里 = document.createElement('canvas')），方便以后搬到别处。
// 不用 ctx.filter（部分平板没有）：模糊一律用 shadowBlur；所有随机数来自固定种子，同一张图每次画出来一样。

import { hull, projectPoint } from './scene.js';
import { TEXTURE_SLOTS } from './palette.js';

function hexToRgb(hex) {
  var h = String(hex).replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 颜色乘一个亮度系数 */
function shade(hex, f) {
  var c = hexToRgb(hex);
  var v = function (x) {
    return Math.max(0, Math.min(255, Math.round(x * f)));
  };
  return 'rgb(' + v(c[0]) + ',' + v(c[1]) + ',' + v(c[2]) + ')';
}

function mix(a, b, t) {
  var x = hexToRgb(a);
  var y = hexToRgb(b);
  var v = function (i) {
    return Math.round(x[i] + (y[i] - x[i]) * t);
  };
  return 'rgb(' + v(0) + ',' + v(1) + ',' + v(2) + ')';
}

function rgba(hex, a) {
  var c = hexToRgb(hex);
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
}

/** 固定种子的随机数 */
function rng(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 名字 → 种子（每个柜子的木纹 / 石纹各不相同，但每次都一样） */
function seedOf(text) {
  var h = 2166136261;
  var s = String(text || '');
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tracePoly(ctx, pts) {
  ctx.beginPath();
  for (var i = 0; i < pts.length; i++) {
    if (i) ctx.lineTo(pts[i][0], pts[i][1]);
    else ctx.moveTo(pts[i][0], pts[i][1]);
  }
  ctx.closePath();
}

function boundsOf(pts) {
  var x0 = Infinity;
  var y0 = Infinity;
  var x1 = -Infinity;
  var y1 = -Infinity;
  for (var i = 0; i < pts.length; i++) {
    x0 = Math.min(x0, pts[i][0]);
    y0 = Math.min(y0, pts[i][1]);
    x1 = Math.max(x1, pts[i][0]);
    y1 = Math.max(y1, pts[i][1]);
  }
  return [x0, y0, x1, y1];
}

function lerpPt(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** 多边形往里缩一点（只对近似矩形的顶面用：按外包矩形缩） */
function insetBox(b, d) {
  return [b[0] + d, b[1] + d, b[2] - d, b[3] - d];
}

/** 平面坐标的点 → 画布（m = [a, b, c, d, e, f]） */
function mapPts(m, pts) {
  return pts.map(function (p) {
    return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
  });
}

function rectPts(r) {
  return [
    [r[0], r[1]],
    [r[2], r[1]],
    [r[2], r[3]],
    [r[0], r[3]],
  ];
}

/** 把之后的绘制限制在地板范围内（画布坐标） */
function clipFloors(ctx, scene) {
  ctx.beginPath();
  scene.floors.forEach(function (r) {
    var q = mapPts(scene.fm, rectPts(r));
    ctx.moveTo(q[0][0], q[0][1]);
    for (var i = 1; i < q.length; i++) ctx.lineTo(q[i][0], q[i][1]);
    ctx.closePath();
  });
  ctx.clip();
}

function applyMatrix(ctx, m) {
  ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
}

/** 用 shadowBlur 画一块模糊的纯色形状（本体画在画布外面，只留下影子） */
function blurFill(ctx, pts, color, blur, w) {
  var FAR = w * 2;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = FAR;
  ctx.fillStyle = color;
  ctx.translate(-FAR, 0);
  tracePoly(ctx, pts);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 材质贴图（可选）：env.textures = { floor, cabinet, worktop, fabric }，每个是一张图片或画布。
// 贴图只管表面长什么样；位置、形状、明暗和影子仍然由程序画。没有贴图时画法和原来完全一样。
// ---------------------------------------------------------------------------

var TEX_Q = 512; // 贴图统一缩到这么大（正方形）

/**
 * 镜像平铺：把一张贴图左右、上下各翻一次拼成 2 x 2，四条边都和自己的镜像相接，
 * 这样原图不是无缝的也看不出接缝。返回四个象限的变换 [sx, sy, tx, ty]（先翻再平移）。
 */
function mirrorTileRects(q) {
  return [
    [1, 1, 0, 0],
    [-1, 1, 2 * q, 0],
    [1, -1, 0, 2 * q],
    [-1, -1, 2 * q, 2 * q],
  ];
}

/** 颜色乘一个亮度系数，结果仍是 #rrggbb（可以再交给 shade / mix） */
function scaleHex(hex, f) {
  var c = hexToRgb(hex);
  return '#' + hex2(c[0] * f) + hex2(c[1] * f) + hex2(c[2] * f);
}

function hex2(n) {
  var h = Math.max(0, Math.min(255, Math.round(n))).toString(16);
  return h.length < 2 ? '0' + h : h;
}

/** 一张贴图 → { src（裁成正方形的小图）, tile（镜像平铺）, avg（平均色）, mm（现实里一张多大）} */
function prepTexture(env, image, mm) {
  var iw = image.naturalWidth || image.videoWidth || image.width;
  var ih = image.naturalHeight || image.videoHeight || image.height;
  if (!(iw > 0) || !(ih > 0)) return null;
  var side = Math.min(iw, ih);
  var q = TEX_Q;
  var src = env.createCanvas(q, q);
  src.getContext('2d').drawImage(image, (iw - side) / 2, (ih - side) / 2, side, side, 0, 0, q, q);
  var tile = env.createCanvas(q * 2, q * 2);
  var t = tile.getContext('2d');
  mirrorTileRects(q).forEach(function (r) {
    t.setTransform(r[0], 0, 0, r[1], r[2], r[3]);
    t.drawImage(src, 0, 0);
  });
  var avg = '#808080';
  try {
    var tiny = env.createCanvas(8, 8);
    var c = tiny.getContext('2d');
    c.drawImage(src, 0, 0, 8, 8);
    var d = c.getImageData(0, 0, 8, 8).data;
    var sum = [0, 0, 0];
    for (var i = 0; i < d.length; i += 4) {
      sum[0] += d[i];
      sum[1] += d[i + 1];
      sum[2] += d[i + 2];
    }
    avg = '#' + hex2(sum[0] / 64) + hex2(sum[1] / 64) + hex2(sum[2] / 64);
  } catch (e) {
    /* 读不到像素（极少见）就用中性灰 */
  }
  return { image: image, src: src, tile: tile, avg: avg, mm: mm, q: q };
}

/** 把 env.textures 准备好（同一张图只处理一次，结果记在 env 上） */
function texturesOf(env) {
  var given = env.textures || {};
  var cache = env.__tex || (env.__tex = {});
  var out = {};
  TEXTURE_SLOTS.forEach(function (slot) {
    var image = given[slot.id];
    if (!image) return;
    if (!cache[slot.id] || cache[slot.id].image !== image) cache[slot.id] = prepTexture(env, image, slot.mm);
    if (cache[slot.id]) out[slot.id] = cache[slot.id];
  });
  return out;
}

/** 哪种材质用哪个贴图槽 */
function texFor(tex, sd) {
  if (!tex) return null;
  if (sd.mat === 'cabinet' || sd.mat === 'panel') return tex.cabinet || null;
  if (sd.mat === 'worktop') return tex.worktop || null;
  if (sd.mat === 'fabric') return tex.fabric || null;
  return null;
}

/**
 * 用贴图填满当前路径围住的区域（在平面坐标里；b = 这块面的外包矩形）。
 * 纹理默认是横向的；竖长的面转 90°，让木纹沿着长边走。每个面取贴图上不同的位置。
 */
function texFill(ctx, scene, tex, b, seed, grainAlongLong) {
  var w = b[2] - b[0];
  var h = b[3] - b[1];
  var k = (tex.mm * scene.zs) / tex.q; // 贴图像素 → 平面坐标
  var rnd = rng(seed);
  ctx.save();
  ctx.clip();
  ctx.translate(b[0], b[1]);
  var span = Math.max(w, h) / k + tex.q * 2;
  if (grainAlongLong && h > w) {
    ctx.translate(w, 0);
    ctx.rotate(Math.PI / 2);
  }
  ctx.scale(k, k);
  ctx.translate(-Math.floor(rnd() * tex.q * 2), -Math.floor(rnd() * tex.q * 2));
  ctx.fillStyle = ctx.createPattern(tex.tile, 'repeat');
  ctx.fillRect(0, 0, span + tex.q * 2, span + tex.q * 2);
  ctx.restore();
}

/** 贴图上面再盖一层很淡的明暗（左上亮、右下暗），让一块面不至于死平 */
function texShade(ctx, b, strength) {
  var g = ctx.createLinearGradient(b[0], b[1], b[2], b[3]);
  g.addColorStop(0, 'rgba(255,255,255,' + 0.1 * strength + ')');
  g.addColorStop(1, 'rgba(0,0,0,' + 0.14 * strength + ')');
  ctx.fillStyle = g;
  ctx.fill();
}

// ---------------------------------------------------------------------------
// 地板：人字拼橡木
// ---------------------------------------------------------------------------

function paintFloor(ctx, scene, pal, tex) {
  var ft = tex && tex.floor;
  var L = Math.max(40, pal.floor.plankMm[0] * scene.zs);
  var W = Math.max(8, pal.floor.plankMm[1] * scene.zs);
  var rnd = rng(20261110);
  var all = [Infinity, Infinity, -Infinity, -Infinity];
  scene.floors.forEach(function (r) {
    all = [Math.min(all[0], r[0]), Math.min(all[1], r[1]), Math.max(all[2], r[2]), Math.max(all[3], r[3])];
  });
  var cx = (all[0] + all[2]) / 2;
  var cy = (all[1] + all[3]) / 2;
  var reach = Math.sqrt(Math.pow(all[2] - all[0], 2) + Math.pow(all[3] - all[1], 2)) / 2 + L;

  /** 有贴图时：每块木板从贴图上取一条不同位置的木纹（竖着的板把木纹转过来），再加一点深浅变化 */
  var texPlank = function (x, y, w, h) {
    var k = (ft.mm * scene.zs) / ft.q;
    var along = w >= h;
    var cw = Math.min(ft.q, (along ? w : h) / k);
    var ch = Math.min(ft.q, (along ? h : w) / k);
    var sx = rnd() * (ft.q - cw);
    var sy = rnd() * (ft.q - ch);
    if (along) ctx.drawImage(ft.src, sx, sy, cw, ch, x, y, w, h);
    else {
      ctx.save();
      ctx.translate(x + w, y);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(ft.src, sx, sy, cw, ch, 0, 0, h, w);
      ctx.restore();
    }
    var t = rnd();
    ctx.fillStyle = t < 0.5 ? 'rgba(255,255,255,' + (0.5 - t) * 0.16 + ')' : 'rgba(40,24,10,' + (t - 0.5) * 0.18 + ')';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(40,24,10,0.3)';
    ctx.lineWidth = Math.max(0.7, W * 0.028);
    ctx.strokeRect(x, y, w, h);
  };

  var plank = function (x, y, w, h) {
    if (ft) {
      texPlank(x, y, w, h);
      return;
    }
    var t = rnd();
    var base = t < 0.5 ? mix(pal.floor.base, pal.floor.light, t * 1.5) : mix(pal.floor.base, pal.floor.dark, (t - 0.5) * 1.5);
    ctx.fillStyle = base;
    ctx.fillRect(x, y, w, h);
    // 木纹：沿长边的几条淡线
    var along = w >= h;
    ctx.strokeStyle = rgba(pal.floor.gap, 0.11);
    ctx.lineWidth = Math.max(0.6, W * 0.022);
    for (var g = 0; g < 3; g++) {
      var o = 0.18 + 0.64 * rnd();
      var wob = (rnd() - 0.5) * W * 0.16;
      ctx.beginPath();
      if (along) {
        ctx.moveTo(x, y + h * o);
        ctx.quadraticCurveTo(x + w / 2, y + h * o + wob, x + w, y + h * o);
      } else {
        ctx.moveTo(x + w * o, y);
        ctx.quadraticCurveTo(x + w * o + wob, y + h / 2, x + w * o, y + h);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(pal.floor.gap, 0.42);
    ctx.lineWidth = Math.max(0.7, W * 0.03);
    ctx.strokeRect(x, y, w, h);
  };

  ctx.save();
  clipFloors(ctx, scene);
  applyMatrix(ctx, scene.fm); // 之后都在平面坐标里画，斜角下木板跟着斜过去
  ctx.fillStyle = ft ? ft.avg : pal.floor.base;
  ctx.fillRect(all[0], all[1], all[2] - all[0], all[3] - all[1]);
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  // 人字拼的两个平移方向：(W, W) 和 (L, -L)；每个单元 = 一横一竖两块板
  var nk = Math.ceil(reach / W) + 2;
  var nm = Math.ceil(reach / L) + 2;
  for (var m = -nm; m <= nm; m++) {
    for (var k = -nk; k <= nk; k++) {
      var ox = k * W + m * L;
      var oy = k * W - m * L;
      if (Math.abs(ox) > reach + L || Math.abs(oy) > reach + L) continue;
      plank(ox, oy, L, W);
      plank(ox + L, oy + W - L, W, L);
    }
  }
  ctx.restore();

  // 整块地板上一层很淡的明暗：左上亮、右下略暗
  ctx.save();
  clipFloors(ctx, scene);
  applyMatrix(ctx, scene.fm);
  var g = ctx.createLinearGradient(all[0], all[1], all[2], all[3]);
  g.addColorStop(0, 'rgba(255,246,230,0.10)');
  g.addColorStop(1, 'rgba(60,40,20,0.08)');
  ctx.fillStyle = g;
  ctx.fillRect(all[0], all[1], all[2] - all[0], all[3] - all[1]);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 影子
// ---------------------------------------------------------------------------

/** 地上的影子：方向性的投影 + 贴地的一圈暗（接触阴影）。先画成纯黑再整体半透明，重叠处不会越叠越黑 */
function paintFloorShadows(ctx, scene, pal, env) {
  var px = scene.s;
  var layer = env.createCanvas(scene.w, scene.h);
  var c = layer.getContext('2d');
  scene.shadows.forEach(function (sh) {
    // shadowBlur 不跟着变换走，所以先把点换算到画布坐标再画
    blurFill(c, mapPts(scene.fm, sh.pts), pal.shadow, Math.max(5, sh.z1 * 0.13), scene.w);
  });
  ctx.save();
  clipFloors(ctx, scene);
  ctx.globalAlpha = pal.shadowAlpha;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();

  var ao = env.createCanvas(scene.w, scene.h);
  var a = ao.getContext('2d');
  scene.solids.forEach(function (sd) {
    if (sd.ghost || !(sd.z1 > 0) || sd.z0 > 0) return; // 悬空的吊柜不贴地
    blurFill(a, sd.foot, pal.shadow, px * 9, scene.w);
  });
  ctx.save();
  clipFloors(ctx, scene);
  ctx.globalAlpha = 0.26;
  ctx.drawImage(ao, 0, 0);
  ctx.restore();
}

/** 高的东西投到矮的东西顶面上的影子（高柜的影子落在旁边的书桌上）。在画布坐标里画 */
function paintTopShadows(ctx, scene, pal, sd, top) {
  var b = boundsOf(sd.base);
  ctx.save();
  tracePoly(ctx, top.pts);
  ctx.clip();
  ctx.globalAlpha = 0.2;
  scene.solids.forEach(function (o) {
    if (o === sd || o.ghost || !(o.z1 > sd.z1 + 1)) return;
    if (o.id.indexOf(sd.id) === 0 || sd.id.indexOf(o.id) === 0) return; // 椅背 / 椅面是同一把椅子
    var lo = Math.max(0, o.z0 - sd.z1);
    var hi = o.z1 - sd.z1;
    var ob = boundsOf(o.base);
    if (ob[2] + scene.light[0] * hi < b[0] || ob[0] > b[2] || ob[3] + scene.light[1] * hi < b[1] || ob[1] > b[3]) return;
    var shifted = function (dz) {
      return o.base.map(function (p) {
        return [p[0] + scene.light[0] * dz, p[1] + scene.light[1] * dz];
      });
    };
    var pts = hull(shifted(lo).concat(shifted(hi))).map(function (p) {
      return projectPoint(scene.pj, p, sd.z1);
    });
    blurFill(ctx, pts, pal.shadow, Math.max(4, hi * 0.1), scene.w);
  });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 顶面的材质
// ---------------------------------------------------------------------------

/** 木纹：沿长边的细线 */
function woodGrain(ctx, pts, color, seed, px) {
  var b = boundsOf(pts);
  var w = b[2] - b[0];
  var h = b[3] - b[1];
  var along = w >= h;
  var rnd = rng(seed);
  var step = px * 3.2;
  var n = Math.max(3, Math.round((along ? h : w) / step));
  ctx.save();
  tracePoly(ctx, pts);
  ctx.clip();
  for (var i = 0; i < n; i++) {
    var o = (i + 0.2 + rnd() * 0.6) / n;
    var wob = (rnd() - 0.5) * step * 1.4;
    ctx.strokeStyle = rgba(color, 0.1 + rnd() * 0.16);
    ctx.lineWidth = Math.max(0.6, px * (0.4 + rnd() * 0.7));
    ctx.beginPath();
    if (along) {
      ctx.moveTo(b[0], b[1] + h * o);
      ctx.bezierCurveTo(b[0] + w * 0.33, b[1] + h * o + wob, b[0] + w * 0.66, b[1] + h * o - wob, b[2], b[1] + h * o);
    } else {
      ctx.moveTo(b[0] + w * o, b[1]);
      ctx.bezierCurveTo(b[0] + w * o + wob, b[1] + h * 0.33, b[0] + w * o - wob, b[1] + h * 0.66, b[0] + w * o, b[3]);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** 大理石：几条斜着的灰色纹理 */
function marbleVeins(ctx, pts, color, seed, px) {
  var b = boundsOf(pts);
  var w = b[2] - b[0];
  var h = b[3] - b[1];
  var rnd = rng(seed);
  var n = Math.max(3, Math.round((w + h) / (px * 70)));
  ctx.save();
  tracePoly(ctx, pts);
  ctx.clip();
  ctx.lineCap = 'round';
  for (var i = 0; i < n; i++) {
    var x = b[0] + w * rnd();
    var y = b[1] + h * rnd();
    var ang = Math.PI * (0.18 + rnd() * 0.22) * (rnd() < 0.5 ? 1 : -1);
    var len = Math.max(w, h) * (0.35 + rnd() * 0.5);
    var ex = x + Math.cos(ang) * len;
    var ey = y + Math.sin(ang) * len;
    var bend = (rnd() - 0.5) * len * 0.35;
    ctx.strokeStyle = rgba(color, 0.16 + rnd() * 0.2);
    ctx.lineWidth = Math.max(0.7, px * (0.5 + rnd() * 1.3));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo((x + ex) / 2 - Math.sin(ang) * bend, (y + ey) / 2 + Math.cos(ang) * bend, ex, ey);
    ctx.stroke();
    // 一条更细的分叉
    ctx.strokeStyle = rgba(color, 0.12);
    ctx.lineWidth = Math.max(0.5, px * 0.45);
    ctx.beginPath();
    ctx.moveTo((x + ex) / 2, (y + ey) / 2);
    ctx.lineTo((x + ex) / 2 + Math.cos(ang + 0.7) * len * 0.22, (y + ey) / 2 + Math.sin(ang + 0.7) * len * 0.22);
    ctx.stroke();
  }
  ctx.restore();
}

/** 书柜：从上面切开看进去 —— 柜体边框、深色内部、一排排书脊 */
function bookInterior(ctx, pts, pal, seed, px, frameColor) {
  var b = boundsOf(pts);
  var frame = px * 4.5;
  var inner = insetBox(b, frame);
  var w = inner[2] - inner[0];
  var h = inner[3] - inner[1];
  if (w <= 0 || h <= 0) return;
  var along = h >= w; // 书沿长边排开
  var rnd = rng(seed);
  ctx.save();
  tracePoly(ctx, pts);
  ctx.clip();
  ctx.fillStyle = pal.cabinet.inner;
  ctx.fillRect(inner[0], inner[1], w, h);
  var total = along ? h : w;
  var depth = along ? w : h;
  var pos = px * 2;
  var bay = 0;
  while (pos < total - px * 4) {
    var t = px * (2.6 + rnd() * 3.4);
    var d = depth * (0.62 + rnd() * 0.3);
    if (rnd() < 0.08) {
      pos += t * 1.6; // 空一格
      continue;
    }
    ctx.fillStyle = pal.books[Math.floor(rnd() * pal.books.length)];
    if (along) ctx.fillRect(inner[0] + px * 1.2, inner[1] + pos, d, t - px * 0.5);
    else ctx.fillRect(inner[0] + pos, inner[1] + px * 1.2, t - px * 0.5, d);
    pos += t;
    bay += t;
    if (bay > px * 62) {
      // 立板
      ctx.fillStyle = frameColor || pal.cabinet.top;
      if (along) ctx.fillRect(inner[0], inner[1] + pos, w, px * 3);
      else ctx.fillRect(inner[0] + pos, inner[1], px * 3, h);
      pos += px * 5;
      bay = 0;
    }
  }
  // 柜口朝房间那一侧的一道暗影，表示有深度
  var g = along ? ctx.createLinearGradient(inner[0], 0, inner[2], 0) : ctx.createLinearGradient(0, inner[1], 0, inner[3]);
  g.addColorStop(0, 'rgba(0,0,0,0.38)');
  g.addColorStop(0.35, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(inner[0], inner[1], w, h);
  ctx.restore();
}

/** 玻璃柜：木框 + 玻璃 + 里面的层板线和暖光 */
function glassInterior(ctx, pts, pal, px) {
  var b = boundsOf(pts);
  var inner = insetBox(b, px * 4);
  var w = inner[2] - inner[0];
  var h = inner[3] - inner[1];
  if (w <= 0 || h <= 0) return;
  ctx.save();
  tracePoly(ctx, pts);
  ctx.clip();
  ctx.fillStyle = pal.glass.frame;
  ctx.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
  var g = ctx.createLinearGradient(inner[0], inner[1], inner[2], inner[3]);
  g.addColorStop(0, mix(pal.glass.top, pal.glass.glow, 0.55));
  g.addColorStop(1, pal.glass.top);
  ctx.fillStyle = g;
  ctx.fillRect(inner[0], inner[1], w, h);
  // 层板 / 立框
  var along = w >= h;
  var n = Math.max(2, Math.round((along ? w : h) / (px * 62)));
  ctx.fillStyle = rgba(pal.glass.frame, 0.85);
  for (var i = 1; i < n; i++) {
    if (along) ctx.fillRect(inner[0] + (w * i) / n - px, inner[1], px * 2, h);
    else ctx.fillRect(inner[0], inner[1] + (h * i) / n - px, w, px * 2);
  }
  // 反光：两道斜的亮带
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#FFFFFF';
  var s = Math.min(w, h);
  for (var r = 0; r < 2; r++) {
    var x = inner[0] + w * (0.22 + r * 0.4);
    ctx.beginPath();
    ctx.moveTo(x, inner[1]);
    ctx.lineTo(x + s * 0.28, inner[1]);
    ctx.lineTo(x + s * 0.28 - h * 0.6, inner[3]);
    ctx.lineTo(x - h * 0.6, inner[3]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** 顶面边缘：左上亮、右下暗的细边，让一块板看起来有厚度 */
function bevel(ctx, pts, px, strength) {
  var b = boundsOf(pts);
  var g = ctx.createLinearGradient(b[0], b[1], b[2], b[3]);
  g.addColorStop(0, 'rgba(255,255,255,' + 0.5 * strength + ')');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,' + 0.34 * strength + ')');
  ctx.save();
  tracePoly(ctx, pts);
  ctx.clip();
  tracePoly(ctx, pts);
  ctx.lineWidth = px * 2.6;
  ctx.strokeStyle = g;
  ctx.stroke();
  ctx.restore();
}

/** 画一个顶面。调用前已经套好这个顶面所在平面的变换，这里一律在平面坐标里画（pts = 实体的脚印） */
function paintTop(ctx, scene, pal, sd, pts, tex) {
  var tx = texFor(tex, sd);
  var px = scene.s;
  var m = pal[sd.mat] || pal.neutral;
  var seed = seedOf(sd.id);
  var b = boundsOf(pts);
  var top = { pts: pts };

  tracePoly(ctx, top.pts);
  if (sd.kind === 'wall' || sd.kind === 'sill') {
    ctx.fillStyle = m.top;
    ctx.fill();
    ctx.lineWidth = Math.max(1, px * 0.6);
    ctx.strokeStyle = m.top; // 同色描边，盖住相邻墙格之间的细缝
    ctx.stroke();
    return;
  }
  if (sd.kind === 'column') {
    // 结构柱和墙顶同色，连成一体
    ctx.fillStyle = pal.wall.top;
    ctx.fill();
    ctx.lineWidth = Math.max(1, px * 0.6);
    ctx.strokeStyle = pal.wall.top;
    ctx.stroke();
    return;
  }

  if (sd.mat === 'structure') {
    var gs = ctx.createLinearGradient(b[0], b[1], b[2], b[3]);
    gs.addColorStop(0, shade(m.top, 1.12));
    gs.addColorStop(1, shade(m.top, 0.9));
    ctx.fillStyle = gs;
    ctx.fill();
  } else if (sd.kind === 'window') {
    ctx.fillStyle = rgba(m.top, 0.82);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#FFFFFF';
    var horizontal = b[2] - b[0] >= b[3] - b[1];
    if (horizontal) ctx.fillRect(b[0], b[1], b[2] - b[0], (b[3] - b[1]) * 0.38);
    else ctx.fillRect(b[0], b[1], (b[2] - b[0]) * 0.38, b[3] - b[1]);
    ctx.restore();
    tracePoly(ctx, top.pts);
    ctx.lineWidth = Math.max(1, px * 0.9);
    ctx.strokeStyle = shade(m.side, 0.8);
    ctx.stroke();
  } else if (sd.mat === 'worktop' && tx) {
    texFill(ctx, scene, tx, b, seed, false);
    tracePoly(ctx, top.pts);
    texShade(ctx, b, 0.6);
    bevel(ctx, top.pts, px, 0.7);
  } else if (sd.mat === 'worktop') {
    var gw = ctx.createLinearGradient(b[0], b[1], b[2], b[3]);
    gw.addColorStop(0, shade(m.top, 1.02));
    gw.addColorStop(1, shade(m.top, 0.95));
    ctx.fillStyle = gw;
    ctx.fill();
    marbleVeins(ctx, top.pts, m.vein, seed, px);
    bevel(ctx, top.pts, px, 0.7);
  } else if (sd.mat === 'glass') {
    glassInterior(ctx, top.pts, pal, px);
  } else if (sd.mat === 'cabinet' && /BOOK/i.test(sd.label)) {
    if (tx) texFill(ctx, scene, tx, b, seed, true);
    else {
      ctx.fillStyle = m.top;
      ctx.fill();
    }
    bookInterior(ctx, top.pts, pal, seed, px, tx ? tx.avg : null);
  } else if ((sd.mat === 'cabinet' || sd.mat === 'panel') && tx) {
    texFill(ctx, scene, tx, b, seed, true);
    tracePoly(ctx, top.pts);
    texShade(ctx, b, 1);
    if (sd.tall) {
      var innerT = insetBox(b, px * 4.5);
      if (innerT[2] > innerT[0] && innerT[3] > innerT[1]) {
        ctx.lineWidth = Math.max(1, px * 0.9);
        ctx.strokeStyle = 'rgba(20,12,6,0.45)';
        ctx.strokeRect(innerT[0], innerT[1], innerT[2] - innerT[0], innerT[3] - innerT[1]);
      }
    }
    bevel(ctx, top.pts, px, 0.55);
  } else if (sd.mat === 'cabinet' || sd.mat === 'panel') {
    var gc = ctx.createLinearGradient(b[0], b[1], b[2], b[3]);
    gc.addColorStop(0, shade(m.top, 1.1));
    gc.addColorStop(1, shade(m.top, 0.9));
    ctx.fillStyle = gc;
    ctx.fill();
    woodGrain(ctx, top.pts, m.grain || m.side, seed, px);
    if (sd.tall) {
      // 切开的高柜：一圈柜体边线
      var inner = insetBox(b, px * 4.5);
      if (inner[2] > inner[0] && inner[3] > inner[1]) {
        ctx.lineWidth = Math.max(1, px * 0.9);
        ctx.strokeStyle = rgba(m.grain || m.side, 0.55);
        ctx.strokeRect(inner[0], inner[1], inner[2] - inner[0], inner[3] - inner[1]);
      }
    }
    bevel(ctx, top.pts, px, 0.55);
  } else if (sd.mat === 'fabric') {
    var back = sd.kind === 'chair-back';
    var cxm = (b[0] + b[2]) / 2;
    var cym = (b[1] + b[3]) / 2;
    var rad = Math.max(b[2] - b[0], b[3] - b[1]) * 0.7;
    var gf = ctx.createRadialGradient(cxm - rad * 0.2, cym - rad * 0.25, rad * 0.05, cxm, cym, rad);
    var col = back ? m.back || m.side : m.top;
    if (tx) {
      texFill(ctx, scene, tx, b, seed, false);
      tracePoly(ctx, top.pts);
      var gt = ctx.createRadialGradient(cxm - rad * 0.2, cym - rad * 0.25, rad * 0.05, cxm, cym, rad);
      gt.addColorStop(0, 'rgba(255,255,255,0.12)');
      gt.addColorStop(1, 'rgba(0,0,0,' + (back ? 0.34 : 0.16) + ')');
      ctx.fillStyle = gt;
      ctx.fill();
    } else {
      gf.addColorStop(0, shade(col, 1.16));
      gf.addColorStop(1, shade(col, 0.86));
      ctx.fillStyle = gf;
      ctx.fill();
    }
    if (!back) {
      // 坐垫的缝线：往里缩一圈的细线
      ctx.save();
      ctx.clip();
      ctx.translate(cxm, cym);
      ctx.scale(0.78, 0.78);
      ctx.translate(-cxm, -cym);
      tracePoly(ctx, top.pts);
      ctx.lineWidth = Math.max(1, px * 1.1);
      ctx.strokeStyle = 'rgba(40,28,20,0.22)';
      ctx.stroke();
      ctx.restore();
    }
  } else {
    ctx.fillStyle = m.top;
    ctx.fill();
    bevel(ctx, top.pts, px, 0.4);
  }

  if (sd.kind !== 'window') {
    tracePoly(ctx, top.pts);
    ctx.lineWidth = Math.max(1, px * 0.7);
    ctx.strokeStyle = 'rgba(40,26,16,0.42)';
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// 侧面（只有立体俯视有）
// ---------------------------------------------------------------------------

function paintSide(ctx, scene, pal, sd, face, tex) {
  var tx = texFor(tex, sd);
  var px = scene.s;
  var m = pal[sd.mat] || pal.neutral;
  var p = face.pts; // [下-起点, 下-终点, 上-终点, 上-起点]
  // 光从左上来；斜角立体只看得到两组面，让它们一明一暗，体块才立得起来
  var lit = scene.view === 'iso' ? (Math.abs(face.nx) > Math.abs(face.ny) ? 1.02 : 0.82) : 0.97 - face.nx * 0.08 - face.ny * 0.11;
  var baseMid = lerpPt(p[0], p[1], 0.5);
  var topMid = lerpPt(p[3], p[2], 0.5);
  var color = tx ? scaleHex(tx.avg, 0.84) : m.side; // 有贴图：侧面用贴图的平均色，和顶面是同一种材质
  // 沿法线方向：同一面墙被切成几格时，各格的渐变方向和长度都一样，不会出现色块
  var rise = (topMid[0] - baseMid[0]) * face.nx + (topMid[1] - baseMid[1]) * face.ny;
  var g = ctx.createLinearGradient(baseMid[0], baseMid[1], baseMid[0] + face.nx * rise, baseMid[1] + face.ny * rise);
  var wallish = sd.kind === 'wall' || sd.kind === 'sill';
  g.addColorStop(0, shade(color, lit * (wallish ? 0.9 : 0.78)));
  g.addColorStop(1, shade(color, lit * (wallish ? 1.02 : 1.04)));
  tracePoly(ctx, p);
  if (sd.kind === 'window') {
    ctx.fillStyle = rgba(m.side, 0.6);
    ctx.fill();
    return;
  }
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, px * 0.5);
  ctx.strokeStyle = g; // 用同一个渐变描边：盖住相邻格子之间的细缝，又不留下一条色线
  ctx.stroke();

  var quad = function (t0, t1) {
    return [lerpPt(p[0], p[3], t0), lerpPt(p[1], p[2], t0), lerpPt(p[1], p[2], t1), lerpPt(p[0], p[3], t1)];
  };
  var lenMm = Math.sqrt(Math.pow(p[1][0] - p[0][0], 2) + Math.pow(p[1][1] - p[0][1], 2)) / scene.zs;

  if (sd.mat === 'worktop') {
    // 书桌：上面一条石材边，下面是桌下的暗处
    tracePoly(ctx, quad(0, 0.84));
    ctx.fillStyle = 'rgba(46,32,22,0.62)';
    ctx.fill();
    tracePoly(ctx, quad(0.84, 1));
    ctx.fillStyle = shade(tx ? scaleHex(tx.avg, 0.92) : m.side, lit);
    ctx.fill();
  } else if ((sd.mat === 'cabinet' || sd.mat === 'panel') && sd.kind !== 'hidden-door') {
    // 柜门缝 + 踢脚
    tracePoly(ctx, quad(0, 0.08));
    ctx.fillStyle = 'rgba(20,12,8,0.5)';
    ctx.fill();
    var doors = Math.max(1, Math.round(lenMm / 480));
    ctx.strokeStyle = rgba(m.grain || '#2A1A10', 0.55);
    ctx.lineWidth = Math.max(1, px * 0.8);
    for (var i = 1; i < doors; i++) {
      var a = lerpPt(lerpPt(p[0], p[1], i / doors), lerpPt(p[3], p[2], i / doors), 0.08);
      var b2 = lerpPt(p[3], p[2], i / doors);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b2[0], b2[1]);
      ctx.stroke();
    }
  } else if (sd.mat === 'glass') {
    // 玻璃柜正面：木框 + 暖光的玻璃 + 立框和层板
    tracePoly(ctx, p);
    ctx.fillStyle = shade(pal.glass.frame, lit);
    ctx.fill();
    var along = function (u, v) {
      return lerpPt(lerpPt(p[0], p[1], u), lerpPt(p[3], p[2], u), v);
    };
    tracePoly(ctx, [along(0.03, 0.07), along(0.97, 0.07), along(0.97, 0.96), along(0.03, 0.96)]);
    var gg = ctx.createLinearGradient(baseMid[0], baseMid[1], baseMid[0] + face.nx * rise, baseMid[1] + face.ny * rise);
    gg.addColorStop(0, mix(pal.glass.top, pal.glass.glow, 0.35));
    gg.addColorStop(1, mix(pal.glass.top, pal.glass.glow, 0.75));
    ctx.fillStyle = gg;
    ctx.fill();
    ctx.strokeStyle = rgba(pal.glass.frame, 0.9);
    ctx.lineWidth = Math.max(1.2, px * 1.6);
    var bays = Math.max(1, Math.round(lenMm / 450));
    var k;
    for (k = 1; k < bays; k++) {
      ctx.beginPath();
      ctx.moveTo(along(k / bays, 0.07)[0], along(k / bays, 0.07)[1]);
      ctx.lineTo(along(k / bays, 0.96)[0], along(k / bays, 0.96)[1]);
      ctx.stroke();
    }
    ctx.lineWidth = Math.max(1, px * 0.9);
    ctx.strokeStyle = rgba(pal.glass.frame, 0.55);
    var shelves = Math.max(1, Math.round((sd.z1 - sd.z0) / scene.zs / 380));
    for (k = 1; k < shelves; k++) {
      ctx.beginPath();
      ctx.moveTo(along(0.03, k / shelves)[0], along(0.03, k / shelves)[1]);
      ctx.lineTo(along(0.97, k / shelves)[0], along(0.97, k / shelves)[1]);
      ctx.stroke();
    }
  }
}

/** 墙顶的轮廓线：只描露在外面的边（相邻墙格之间不描） */
function wallOutline(ctx, sd, top, px) {
  ctx.save();
  ctx.lineWidth = Math.max(1, px * 0.8);
  ctx.strokeStyle = 'rgba(28,22,18,0.7)';
  ctx.lineCap = 'round';
  for (var i = 0; i < top.length; i++) {
    if (sd.hidden && sd.hidden[i]) continue;
    var a = top[i];
    var b = top[(i + 1) % top.length];
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/**
 * @param {HTMLCanvasElement} canvas  会被设成 scene.w x scene.h
 * @param {object} scene  buildScene 的结果
 * @param {object} pal    palette.js 的一套配色
 * @param {{ createCanvas:(w:number,h:number)=>HTMLCanvasElement, textures?:object }} env
 *   env.textures 可选：{ floor, cabinet, worktop, fabric }，每个是一张图片或画布（材质贴图）
 */
function paintScene(canvas, scene, pal, env) {
  canvas.width = scene.w;
  canvas.height = scene.h;
  var ctx = canvas.getContext('2d');
  var px = scene.s; // 1 个图纸像素 = 多少画布像素
  ctx.lineJoin = 'round';

  // 背景
  var bg = ctx.createRadialGradient(scene.w / 2, scene.h / 2, Math.min(scene.w, scene.h) * 0.2, scene.w / 2, scene.h / 2, Math.max(scene.w, scene.h) * 0.75);
  bg.addColorStop(0, pal.bg);
  bg.addColorStop(1, pal.bgEdge);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, scene.w, scene.h);

  // 整个模型落在背景上的软影
  ctx.save();
  ctx.shadowColor = 'rgba(70,48,28,0.34)';
  ctx.shadowBlur = scene.wallZ * 0.42;
  ctx.shadowOffsetX = scene.light[0] * scene.wallZ * 1.5;
  ctx.shadowOffsetY = scene.light[1] * scene.wallZ * 1.5;
  ctx.fillStyle = pal.bg;
  scene.solids.forEach(function (sd) {
    if (sd.kind !== 'wall' && sd.kind !== 'sill' && sd.kind !== 'hidden-door' && sd.kind !== 'column') return;
    tracePoly(ctx, sd.foot);
    ctx.fill();
  });
  scene.floors.forEach(function (r) {
    tracePoly(ctx, mapPts(scene.fm, rectPts(r)));
    ctx.fill();
  });
  ctx.restore();

  var tex = texturesOf(env);
  paintFloor(ctx, scene, pal, tex);

  // 门槛
  scene.patches.forEach(function (p) {
    tracePoly(ctx, mapPts(scene.fm, p.pts));
    ctx.fillStyle = (pal[p.mat] || pal.threshold).top;
    ctx.fill();
  });

  paintFloorShadows(ctx, scene, pal, env);

  // 实体：侧面 → 顶面 → 落在顶面上的影子
  scene.solids.forEach(function (sd) {
    var top = sd.faces[sd.faces.length - 1];
    if (sd.ghost) {
      ctx.save();
      applyMatrix(ctx, sd.tm);
      tracePoly(ctx, sd.base);
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = pal.ghost.fill;
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.setLineDash([px * 8, px * 5]);
      ctx.lineWidth = Math.max(1.5, px * 1.3);
      ctx.strokeStyle = pal.ghost.stroke;
      ctx.stroke();
      ctx.restore();
      return;
    }
    sd.faces.forEach(function (face) {
      if (face.type === 'side') paintSide(ctx, scene, pal, sd, face, tex);
    });
    ctx.save();
    applyMatrix(ctx, sd.tm);
    paintTop(ctx, scene, pal, sd, sd.base, tex);
    ctx.restore();
    if (sd.kind === 'wall' || sd.kind === 'sill' || sd.kind === 'hidden-door') wallOutline(ctx, sd, top.pts, px);
    else if (sd.kind !== 'window') paintTopShadows(ctx, scene, pal, sd, top);
  });

}

export { paintScene, mirrorTileRects, shade, mix, rgba, rng, tracePoly };
