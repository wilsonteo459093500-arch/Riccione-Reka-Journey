// 把 scene.js 的清单画到 canvas 上（Canvas 2D，无外部依赖，ES5 写法）。位置全部来自清单，这里只管好不好看。
// env.createCanvas(w, h) 由调用方给（网页里 = document.createElement('canvas')），方便以后搬到别处。
// 不用 ctx.filter（部分平板没有）：模糊一律用 shadowBlur；所有随机数来自固定种子，同一张图每次画出来一样。

import { hull } from './scene.js';

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

function clipFloors(ctx, scene) {
  ctx.beginPath();
  scene.floors.forEach(function (r) {
    ctx.rect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
  });
  ctx.clip();
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
// 地板：人字拼橡木
// ---------------------------------------------------------------------------

function paintFloor(ctx, scene, pal) {
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

  var plank = function (x, y, w, h) {
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
  ctx.fillStyle = pal.floor.base;
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
    blurFill(c, sh.pts, pal.shadow, Math.max(5, sh.z1 * 0.13), scene.w);
  });
  ctx.save();
  clipFloors(ctx, scene);
  ctx.globalAlpha = pal.shadowAlpha;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();

  var ao = env.createCanvas(scene.w, scene.h);
  var a = ao.getContext('2d');
  scene.solids.forEach(function (sd) {
    if (sd.ghost || !(sd.z1 > 0)) return;
    blurFill(a, sd.base, pal.shadow, px * 9, scene.w);
  });
  ctx.save();
  clipFloors(ctx, scene);
  ctx.globalAlpha = 0.26;
  ctx.drawImage(ao, 0, 0);
  ctx.restore();
}

/** 高的东西投到矮的东西顶面上的影子（高柜的影子落在旁边的书桌上） */
function paintTopShadows(ctx, scene, pal, sd, top) {
  var b = boundsOf(sd.base);
  var persp = scene.view === 'persp';
  var k = persp ? scene.camH / (scene.camH - sd.z1) : 1;
  ctx.save();
  tracePoly(ctx, top.pts);
  ctx.clip();
  ctx.globalAlpha = 0.2;
  scene.solids.forEach(function (o) {
    if (o === sd || o.ghost || !(o.z1 > sd.z1 + 1)) return;
    if (o.id.indexOf(sd.id) === 0 || sd.id.indexOf(o.id) === 0) return; // 椅背 / 椅面是同一把椅子
    var dz = o.z1 - sd.z1;
    var dx = scene.light[0] * dz;
    var dy = scene.light[1] * dz;
    var ob = boundsOf(o.base);
    if (ob[2] + dx < b[0] || ob[0] > b[2] || ob[3] + dy < b[1] || ob[1] > b[3]) return;
    var pts = hull(
      o.base.concat(
        o.base.map(function (p) {
          return [p[0] + dx, p[1] + dy];
        })
      )
    );
    if (persp) {
      pts = pts.map(function (p) {
        return [scene.vp[0] + (p[0] - scene.vp[0]) * k, scene.vp[1] + (p[1] - scene.vp[1]) * k];
      });
    }
    blurFill(ctx, pts, pal.shadow, Math.max(4, dz * 0.1), scene.w);
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
function bookInterior(ctx, pts, pal, seed, px) {
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
      ctx.fillStyle = pal.cabinet.top;
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

function paintTop(ctx, scene, pal, sd, top) {
  var px = scene.s;
  var m = pal[sd.mat] || pal.neutral;
  var seed = seedOf(sd.id);
  var b = boundsOf(top.pts);

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
    ctx.fillStyle = m.top;
    ctx.fill();
    bookInterior(ctx, top.pts, pal, seed, px);
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
    gf.addColorStop(0, shade(col, 1.16));
    gf.addColorStop(1, shade(col, 0.86));
    ctx.fillStyle = gf;
    ctx.fill();
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

function paintSide(ctx, scene, pal, sd, face) {
  var px = scene.s;
  var m = pal[sd.mat] || pal.neutral;
  var p = face.pts; // [下-起点, 下-终点, 上-终点, 上-起点]
  var lit = 0.97 - face.nx * 0.08 - face.ny * 0.11; // 光从左上来
  var baseMid = lerpPt(p[0], p[1], 0.5);
  var topMid = lerpPt(p[3], p[2], 0.5);
  var color = m.side;
  // 沿法线方向：同一面墙被切成几格时，各格的渐变方向和长度都一样，不会出现色块
  var rise = (topMid[0] - baseMid[0]) * face.nx + (topMid[1] - baseMid[1]) * face.ny;
  var g = ctx.createLinearGradient(baseMid[0], baseMid[1], baseMid[0] + face.nx * rise, baseMid[1] + face.ny * rise);
  g.addColorStop(0, shade(color, lit * 0.78));
  g.addColorStop(1, shade(color, lit * 1.04));
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
    ctx.fillStyle = shade(m.side, lit);
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
    tracePoly(ctx, quad(0.06, 0.94));
    ctx.fillStyle = rgba(pal.glass.glow, 0.42);
    ctx.fill();
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
 * @param {{ createCanvas:(w:number,h:number)=>HTMLCanvasElement }} env
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
    tracePoly(ctx, sd.base);
    ctx.fill();
  });
  scene.floors.forEach(function (r) {
    ctx.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
  });
  ctx.restore();

  paintFloor(ctx, scene, pal);

  // 门槛
  scene.patches.forEach(function (p) {
    tracePoly(ctx, p.pts);
    ctx.fillStyle = (pal[p.mat] || pal.threshold).top;
    ctx.fill();
  });

  paintFloorShadows(ctx, scene, pal, env);

  // 实体：侧面 → 顶面 → 落在顶面上的影子
  scene.solids.forEach(function (sd) {
    var top = sd.faces[sd.faces.length - 1];
    if (sd.ghost) {
      ctx.save();
      tracePoly(ctx, top.pts);
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
      if (face.type === 'side') paintSide(ctx, scene, pal, sd, face);
    });
    paintTop(ctx, scene, pal, sd, top);
    if (sd.kind === 'wall' || sd.kind === 'sill' || sd.kind === 'hidden-door') wallOutline(ctx, sd, top.pts, px);
    else if (sd.kind !== 'window') paintTopShadows(ctx, scene, pal, sd, top);
  });

}

export { paintScene, shade, mix, rgba, rng, tracePoly };
