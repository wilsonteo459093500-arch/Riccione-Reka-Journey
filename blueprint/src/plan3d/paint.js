// 把 scene.js 的清单画到 canvas 上（Canvas 2D，无依赖，ES5 写法）。位置全部来自清单，这里只管好不好看。
// env.createCanvas(w, h) 由调用方给（网页里 = document.createElement('canvas')），方便以后搬到别处。

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

/** 固定种子的随机数（同一张图每次画出来一样） */
function rng(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tracePoly(ctx, pts) {
  ctx.beginPath();
  for (var i = 0; i < pts.length; i++) {
    if (i) ctx.lineTo(pts[i][0], pts[i][1]);
    else ctx.moveTo(pts[i][0], pts[i][1]);
  }
  ctx.closePath();
}

/** 木地板：一块块错缝的木板，深浅略有不同 */
function plankPattern(env, scene, pal) {
  var pw = Math.max(40, pal.floor.plankMm[0] * scene.zs);
  var ph = Math.max(8, pal.floor.plankMm[1] * scene.zs);
  var cols = 4;
  var rows = 12;
  var cv = env.createCanvas(Math.round(pw * cols), Math.round(ph * rows));
  var c = cv.getContext('2d');
  var rnd = rng(20261110);
  c.fillStyle = pal.floor.base;
  c.fillRect(0, 0, cv.width, cv.height);
  for (var r = 0; r < rows; r++) {
    var off = ((r * 0.37) % 1) * pw;
    for (var k = -1; k < cols; k++) {
      var x = k * pw + off;
      var t = rnd();
      c.fillStyle = t < 0.5 ? mix(pal.floor.base, pal.floor.light, t * 1.6) : mix(pal.floor.base, pal.floor.dark, (t - 0.5) * 1.4);
      c.fillRect(x, r * ph, pw, ph);
      // 木纹：几条很淡的细线
      c.globalAlpha = 0.07;
      c.strokeStyle = pal.floor.dark;
      c.lineWidth = Math.max(1, ph * 0.03);
      for (var g = 0; g < 4; g++) {
        var gy = r * ph + ph * (0.15 + 0.7 * rnd());
        c.beginPath();
        c.moveTo(x, gy);
        c.bezierCurveTo(x + pw * 0.3, gy + ph * 0.1 * (rnd() - 0.5), x + pw * 0.7, gy + ph * 0.1 * (rnd() - 0.5), x + pw, gy);
        c.stroke();
      }
      c.globalAlpha = 1;
      c.fillStyle = pal.floor.gap;
      c.globalAlpha = 0.55;
      c.fillRect(x, r * ph, Math.max(1, ph * 0.035), ph);
      c.globalAlpha = 1;
    }
    c.fillStyle = pal.floor.gap;
    c.globalAlpha = 0.5;
    c.fillRect(0, r * ph, cv.width, Math.max(1, ph * 0.035));
    c.globalAlpha = 1;
  }
  return cv;
}

/** 影子：先在另一张画布上画成纯黑（重叠不会越叠越黑），再整体半透明盖到地板上 */
function shadowLayer(env, scene, pal, pick) {
  var cv = env.createCanvas(scene.w, scene.h);
  var c = cv.getContext('2d');
  var FAR = scene.w * 2;
  scene.shadows.forEach(function (sh) {
    if (pick && !pick(sh)) return;
    c.save();
    c.shadowColor = pal.shadow;
    c.shadowBlur = Math.max(4, sh.z1 * 0.16);
    c.shadowOffsetX = FAR;
    c.fillStyle = pal.shadow;
    c.translate(-FAR, 0);
    tracePoly(c, sh.pts);
    c.fill();
    c.restore();
  });
  return cv;
}

function clipFloors(ctx, scene) {
  ctx.beginPath();
  scene.floors.forEach(function (r) {
    ctx.rect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
  });
  ctx.clip();
}

function faceLight(face) {
  if (face.type === 'top') return 1;
  // 光从左上来：朝左、朝上的面亮一些
  return 0.96 - face.nx * 0.07 - face.ny * 0.1;
}

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

  // 背景
  var bg = ctx.createRadialGradient(scene.w / 2, scene.h / 2, Math.min(scene.w, scene.h) * 0.2, scene.w / 2, scene.h / 2, Math.max(scene.w, scene.h) * 0.75);
  bg.addColorStop(0, pal.bg);
  bg.addColorStop(1, pal.bgEdge);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, scene.w, scene.h);

  // 整个模型落在背景上的软影
  ctx.save();
  ctx.shadowColor = 'rgba(60,42,26,0.35)';
  ctx.shadowBlur = scene.wallZ * 0.5;
  ctx.shadowOffsetX = scene.light[0] * scene.wallZ * 1.2;
  ctx.shadowOffsetY = scene.light[1] * scene.wallZ * 1.2;
  ctx.fillStyle = pal.bg;
  scene.solids.forEach(function (sd) {
    if (sd.kind !== 'wall' && sd.kind !== 'sill' && sd.kind !== 'hidden-door') return;
    tracePoly(ctx, sd.base);
    ctx.fill();
  });
  ctx.restore();

  // 地板
  ctx.save();
  clipFloors(ctx, scene);
  ctx.fillStyle = ctx.createPattern(plankPattern(env, scene, pal), 'repeat');
  ctx.fillRect(0, 0, scene.w, scene.h);
  ctx.restore();

  // 门槛
  scene.patches.forEach(function (p) {
    tracePoly(ctx, p.pts);
    ctx.fillStyle = (pal[p.mat] || pal.threshold).top;
    ctx.fill();
  });

  // 地上的影子
  ctx.save();
  clipFloors(ctx, scene);
  ctx.globalAlpha = pal.shadowAlpha;
  ctx.drawImage(shadowLayer(env, scene, pal), 0, 0);
  ctx.restore();

  // 实体：侧面 + 顶面
  scene.solids.forEach(function (sd) {
    var m = pal[sd.mat] || pal.neutral;
    if (sd.ghost) {
      var top = sd.faces[sd.faces.length - 1];
      ctx.save();
      tracePoly(ctx, top.pts);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = pal.ghost.fill;
      ctx.fill();
      ctx.globalAlpha = 0.75;
      ctx.setLineDash([px * 7, px * 5]);
      ctx.lineWidth = Math.max(1.5, px * 1.4);
      ctx.strokeStyle = pal.ghost.stroke;
      ctx.stroke();
      ctx.restore();
      return;
    }
    sd.faces.forEach(function (face) {
      var color = face.type === 'top' ? m.top : shade(m.side, faceLight(face));
      tracePoly(ctx, face.pts);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = Math.max(1, px * 0.5);
      ctx.strokeStyle = color; // 同色描边，盖住相邻格子之间的细缝
      ctx.stroke();
    });
    var isWallish = sd.kind === 'wall' || sd.kind === 'sill';
    if (!isWallish) {
      var t = sd.faces[sd.faces.length - 1];
      tracePoly(ctx, t.pts);
      ctx.lineWidth = Math.max(1, px * 0.7);
      ctx.strokeStyle = shade(m.side, 0.82);
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  });
}

export { paintScene, shade, mix, rng, tracePoly, plankPattern, shadowLayer };
