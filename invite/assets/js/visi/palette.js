/* ============================================================
   VISI · 从客户参考图取色
   ------------------------------------------------------------
   客户发来的照片 → 5 个颜色 + 最接近的室内色名（华 / 英）。
   方案里出现的是「他们自己挑的颜色」，一看就是为他们做的。
   全部在浏览器里算，照片不上传。

   MB.extractPalette(source, k) → Promise<[{hex, zh, en}]>（浅 → 深）
     source：一张或一组（最多几张）图片 —— <img> / <canvas> / ImageBitmap /
             dataURL 或网址 / File、Blob / {src} 记录（p.refImages 的一项）。
   MB.nameColour(hex) → {zh, en}：最接近的色名
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};

  var SIZE = 96;        // 缩到 96px 再算：颜色够准，几张图也不卡
  var MIN_DE = 8;       // 两色差小于这个（CIE76）就算同一个颜色，合并
  var PICK_DE = 14;     // 放进色板的颜色彼此至少差这么多：不要三个只差一点点深浅的灰
  var TINY = 0.015;     // 不到 1.5% 的色块多半是杂讯（反光、小物件）
  var DARK = 40;        // Lab 亮度低于这个算「深色」（胡桃、炭黑、阴影）

  /* ---------- 室内常用色名（代表色值） --------------------------
     名字给客户看，要是他们家里会说的话：板材、墙面、木头、石头 */
  var NAMES = [
    { zh: '雪白', en: 'Snow White', hex: '#F6F4EF' },
    { zh: '暖白', en: 'Warm White', hex: '#F2EDE4' },
    { zh: '象牙', en: 'Ivory', hex: '#EEE6D3' },
    { zh: '奶油', en: 'Cream', hex: '#EADBBE' },
    { zh: '亚麻', en: 'Linen', hex: '#E3D9C8' },
    { zh: '石灰', en: 'Lime Plaster', hex: '#D8D0C3' },
    { zh: '燕麦', en: 'Oatmeal', hex: '#D6C8B0' },
    { zh: '浅橡木', en: 'Light Oak', hex: '#D9C3A5' },
    { zh: '沙色', en: 'Sand', hex: '#CBB596' },
    { zh: '蘑菇', en: 'Mushroom', hex: '#B3A595' },
    { zh: '藤编', en: 'Rattan', hex: '#C2A06E' },
    { zh: '橡木', en: 'Oak', hex: '#B8946B' },
    { zh: '黄铜', en: 'Brass', hex: '#B4914F' },
    { zh: '赭石', en: 'Ochre', hex: '#C08A3E' },
    { zh: '柚木', en: 'Teak', hex: '#9A6A40' },
    { zh: '赤陶', en: 'Terracotta', hex: '#B5653F' },
    { zh: '锈红', en: 'Rust', hex: '#8B4630' },
    { zh: '胡桃', en: 'Walnut', hex: '#6E4D35' },
    { zh: '乌木', en: 'Ebony', hex: '#3A2C24' },
    { zh: '灰褐', en: 'Taupe', hex: '#8C7B6A' },
    { zh: '石色', en: 'Stone', hex: '#9C9488' },
    { zh: '雾灰', en: 'Mist Grey', hex: '#C7C2B8' },
    { zh: '水泥灰', en: 'Concrete', hex: '#A4A29C' },
    { zh: '烟灰', en: 'Smoke', hex: '#77726C' },
    { zh: '石墨', en: 'Graphite', hex: '#4B4946' },
    { zh: '板岩', en: 'Slate', hex: '#5F6366' },
    { zh: '炭黑', en: 'Charcoal', hex: '#36332F' },
    { zh: '墨黑', en: 'Ink', hex: '#1C1915' },
    { zh: '鼠尾草', en: 'Sage', hex: '#A3AB90' },
    { zh: '苔绿', en: 'Moss', hex: '#75784C' },
    { zh: '墨绿', en: 'Forest', hex: '#2F4335' },
    { zh: '雾蓝', en: 'Dusty Blue', hex: '#8E9EAA' },
    { zh: '海军蓝', en: 'Navy', hex: '#2C3A4F' },
    { zh: '藕粉', en: 'Dusty Rose', hex: '#C8A29A' }
  ];

  /* ---------- 色彩空间：sRGB ↔ Lab（D65） ------------------------
     在 Lab 里分群：两个颜色「看起来」差多少，跟 Lab 距离比较一致 */
  var LIN = [];
  for (var i = 0; i < 256; i++) {
    var c = i / 255;
    LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function fwd(t) { return t > 0.008856 ? Math.pow(t, 1 / 3) : 7.787 * t + 16 / 116; }
  function inv(t) { var t3 = t * t * t; return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787; }
  function lin(v) { return v <= 0 ? 0 : v >= 255 ? 1 : LIN[Math.round(v)]; }
  function rgbToLab(r, g, b) {
    var R = lin(r), G = lin(g), B = lin(b);
    var x = fwd((R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047);
    var y = fwd(R * 0.2126729 + G * 0.7151522 + B * 0.0721750);
    var z = fwd((R * 0.0193339 + G * 0.1191920 + B * 0.9503041) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  function toByte(v) {
    v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(1, v)) * 255);
  }
  function labToRgb(L, a, b) {
    var y = (L + 16) / 116, x = a / 500 + y, z = y - b / 200;
    x = inv(x) * 0.95047; y = inv(y); z = inv(z) * 1.08883;
    return [
      toByte(x * 3.2404542 - y * 1.5371385 - z * 0.4985314),
      toByte(-x * 0.9692660 + y * 1.8760108 + z * 0.0415560),
      toByte(x * 0.0556434 - y * 0.2040259 + z * 1.0572252)
    ];
  }
  function hex2(n) { return (n < 16 ? '0' : '') + n.toString(16).toUpperCase(); }
  function labHex(c) { var rgb = labToRgb(c.L, c.a, c.b); return '#' + hex2(rgb[0]) + hex2(rgb[1]) + hex2(rgb[2]); }
  function hexLab(h) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim());
    if (!m) return null;
    var n = parseInt(m[1], 16), lab = rgbToLab(n >> 16 & 255, n >> 8 & 255, n & 255);
    return { L: lab[0], a: lab[1], b: lab[2] };
  }
  function d2(p, q) { var x = p.L - q.L, y = p.a - q.a, z = p.b - q.b; return x * x + y * y + z * z; }

  NAMES.forEach(function (n) { n.lab = hexLab(n.hex); });

  /* ---------- 读图 ------------------------------------------- */
  function loadUrl(src) {
    if (MB.loadImg) return MB.loadImg(src);
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { reject(new Error('图片读不出来')); };
      im.src = src;
    });
  }
  function drawable(src) {
    if (!src) return Promise.reject(new Error('没有图片'));
    if (typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement) return Promise.resolve(src);
    if (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap) return Promise.resolve(src);
    if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) {
      if (src.complete && src.naturalWidth) return Promise.resolve(src);
      return new Promise(function (resolve, reject) {
        src.addEventListener('load', function () { resolve(src); });
        src.addEventListener('error', function () { reject(new Error('图片读不出来')); });
      });
    }
    if (typeof src === 'string') return loadUrl(src);
    if (typeof Blob !== 'undefined' && src instanceof Blob) {
      var url = URL.createObjectURL(src);
      return loadUrl(url).then(function (im) { URL.revokeObjectURL(url); return im; },
        function (e) { URL.revokeObjectURL(url); throw e; });
    }
    if (typeof src.src === 'string') return loadUrl(src.src);   // p.refImages 的 {src, w, h}
    return Promise.reject(new Error('认不出这种图片来源'));
  }

  /* 一张图 → 32×32×32 色格的统计。每张图总权重 = 1：三张图各占一份，
     不会因为哪张比较大就主导整组颜色 */
  function sample(img, bins) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) return;
    var k = Math.min(1, SIZE / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
    var cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    var g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, cw, ch);
    var px = g.getImageData(0, 0, cw, ch).data;   // 跨网域的图会在这里丢 SecurityError
    var n = 0, j;
    for (j = 0; j < px.length; j += 4) if (px[j + 3] >= 128) n++;
    if (!n) return;
    var unit = 1 / n;
    for (j = 0; j < px.length; j += 4) {
      if (px[j + 3] < 128) continue;   // 透明的地方不是颜色
      var r = px[j], gg = px[j + 1], b = px[j + 2];
      var key = (r >> 3) << 10 | (gg >> 3) << 5 | (b >> 3);
      var bin = bins[key] || (bins[key] = { w: 0, r: 0, g: 0, b: 0 });
      bin.w += unit; bin.r += r * unit; bin.g += gg * unit; bin.b += b * unit;
    }
  }

  /* ---------- 分群 -------------------------------------------- */
  function mean(pts, idx) {
    var c = { L: 0, a: 0, b: 0, w: 0, idx: idx };
    idx.forEach(function (i) { var p = pts[i]; c.L += p.L * p.w; c.a += p.a * p.w; c.b += p.b * p.w; c.w += p.w; });
    if (c.w) { c.L /= c.w; c.a /= c.w; c.b /= c.w; }
    return c;
  }

  /* k-means（加权）。起点不用乱数：先取最重的一格，再一个个取「权重 × 距离²」最大的
     （k-means++ 的确定版）—— 同一张图每次取出一样的颜色，销售才不会怀疑。
     起点用粗格（每色 16 级）来比份量：一张白沙发、一面墙的颜色散在很多细格里，
     并起来才看得出它是一大片 */
  function coarse(pts, idx) {
    var cells = {}, list = [];
    idx.forEach(function (i) {
      var p = pts[i], key = p.key;
      var ck = (key >> 11) << 8 | ((key >> 6) & 15) << 4 | ((key >> 1) & 15);
      var c = cells[ck];
      if (!c) { c = cells[ck] = { L: 0, a: 0, b: 0, w: 0 }; list.push(c); }
      c.L += p.L * p.w; c.a += p.a * p.w; c.b += p.b * p.w; c.w += p.w;
    });
    list.forEach(function (c) { if (c.w) { c.L /= c.w; c.a /= c.w; c.b /= c.w; } });
    return list;
  }

  function kmeans(pts, idx, K) {
    if (!idx.length) return [];
    var seeds = coarse(pts, idx);
    var centers = [], best = seeds[0];
    seeds.forEach(function (c) { if (c.w > best.w) best = c; });
    centers.push({ L: best.L, a: best.a, b: best.b });
    seeds.forEach(function (c) { c.d = d2(c, centers[0]); });
    while (centers.length < K) {
      var pick = null, score = 0;
      seeds.forEach(function (c) { var s = c.w * c.d; if (s > score) { score = s; pick = c; } });
      if (!pick) break;   // 不同的颜色比 K 还少
      var nc = { L: pick.L, a: pick.a, b: pick.b };
      centers.push(nc);
      seeds.forEach(function (c) { var d = d2(c, nc); if (d < c.d) c.d = d; });
    }
    var assign = {}, groups;
    for (var it = 0; it < 30; it++) {
      var moved = false;
      groups = centers.map(function () { return []; });
      idx.forEach(function (i) {
        var bi = 0, bd = Infinity;
        for (var c = 0; c < centers.length; c++) { var d = d2(pts[i], centers[c]); if (d < bd) { bd = d; bi = c; } }
        if (assign[i] !== bi) { assign[i] = bi; moved = true; }
        groups[bi].push(i);
      });
      centers = groups.map(function (g, c) { return g.length ? mean(pts, g) : centers[c]; });
      if (!moved) break;
    }
    return groups.filter(function (g) { return g.length; }).map(function (g) { return mean(pts, g); });
  }

  function merge(a, b) {
    var w = a.w + b.w || 1;
    return {
      L: (a.L * a.w + b.L * b.w) / w, a: (a.a * a.w + b.a * b.w) / w, b: (a.b * a.w + b.b * b.w) / w,
      w: a.w + b.w, idx: a.idx.concat(b.idx)
    };
  }
  /** 最近的两色差不到 MIN_DE 就合成一色；回传那一对的距离 */
  function mergeClosest(cl) {
    var bi = -1, bj = -1, bd = Infinity;
    for (var i = 0; i < cl.length; i++) {
      for (var j = i + 1; j < cl.length; j++) {
        var d = d2(cl[i], cl[j]);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    }
    if (bi < 0) return Infinity;
    bd = Math.sqrt(bd);
    if (bd < MIN_DE) { cl[bi] = merge(cl[bi], cl[bj]); cl.splice(bj, 1); }
    return bd;
  }

  /* 挑 k 个：面积大的优先，但要跟已经挑的够不同（√面积 × 差异），稍微偏好有彩度的颜色 ——
     绿植、黄铜、赤陶这种点缀，比第三种阴影更像「他们的颜色」。
     阴影深色只留一个当压底：室内照片里一大片暗处，多半是同一块材料在影子里 */
  function choose(cl, k) {
    var sum = cl.reduce(function (s, c) { return s + c.w; }, 0) || 1;
    var pick = [], strict = true;
    while (pick.length < k) {
      var best = null, bs = 0;
      cl.forEach(function (c) {
        if (pick.indexOf(c) > -1) return;
        var dmin = Infinity;
        pick.forEach(function (q) { dmin = Math.min(dmin, Math.sqrt(d2(c, q))); });
        if (dmin < (strict ? PICK_DE : MIN_DE)) return;
        if (strict && c.w < sum * TINY) return;
        if (strict && c.L < DARK && pick.some(function (q) { return q.L < DARK; })) return;
        var chroma = Math.sqrt(c.a * c.a + c.b * c.b);
        var s = Math.sqrt(c.w / sum) * (1 + chroma / 40) * Math.min(1, dmin / 25);
        if (s > bs) { bs = s; best = c; }
      });
      if (best) pick.push(best);
      else if (strict) strict = false;   // 挑不满：放宽一次，小色块、第二个深色、比较接近的颜色也可以
      else break;
    }
    return pick;
  }
  /** 颜色不够 k 个：把最「散」的一群切成两半（切出来的两色要够不同才算） */
  function splitWidest(pts, cl, tried) {
    var order = cl.map(function (c, i) {
      var v = 0;
      c.idx.forEach(function (k) { v += pts[k].w * d2(pts[k], c); });
      return { i: i, v: v };
    }).filter(function (x) { return !tried[x.i]; }).sort(function (a, b) { return b.v - a.v; });
    for (var n = 0; n < order.length; n++) {
      var c = cl[order[n].i];
      tried[order[n].i] = 1;
      if (c.idx.length < 2) continue;
      var two = kmeans(pts, c.idx, 2);
      if (two.length === 2 && Math.sqrt(d2(two[0], two[1])) >= MIN_DE) {
        cl.splice(order[n].i, 1, two[0], two[1]);
        return true;
      }
    }
    return false;
  }
  /** 单色的图（例：一面白墙）：用最重那色的深浅补满 k 个 */
  function pad(cl) {
    var base = cl.slice().sort(function (a, b) { return b.w - a.w; })[0] || { L: 60, a: 0, b: 0 };
    var steps = [-14, 14, -28, 28, -42, 42, -56, 56];
    for (var s = 0; s < steps.length; s++) {
      var c = { L: Math.max(4, Math.min(96, base.L + steps[s])), a: base.a, b: base.b, w: 0, idx: [] };
      if (cl.every(function (x) { return Math.sqrt(d2(x, c)) >= MIN_DE; })) { cl.push(c); return; }
    }
    cl.push({ L: base.L, a: base.a, b: base.b, w: 0, idx: [] });
  }

  /* ---------- 色名 -------------------------------------------- */
  /** 配色名时，色相 / 彩度差算重一点：一个灰不能因为灰的名字用完了，就被叫成「墨绿」 */
  function dn(c, n) { var x = c.L - n.L, y = c.a - n.a, z = c.b - n.b; return x * x + 2 * (y * y + z * z); }
  /** 一组颜色一起命名：先配最接近的一对，同一组里不重复（不会出现两个「亚麻」） */
  function nameAll(list) {
    var pairs = [];
    list.forEach(function (c, i) { NAMES.forEach(function (n, j) { pairs.push({ i: i, j: j, d: dn(c, n.lab) }); }); });
    pairs.sort(function (a, b) { return a.d - b.d; });
    var gotC = {}, gotN = {}, out = [];
    pairs.forEach(function (x) {
      if (gotC[x.i] || gotN[x.j]) return;
      gotC[x.i] = gotN[x.j] = 1;
      out[x.i] = NAMES[x.j];
    });
    return out;
  }

  MB.PALETTE_NAMES = NAMES.map(function (n) { return { hex: n.hex, zh: n.zh, en: n.en }; });

  MB.nameColour = function (hex) {
    var lab = hexLab(hex);
    if (!lab) return { zh: '', en: '' };
    var best = NAMES[0], bd = Infinity;
    NAMES.forEach(function (n) { var d = dn(lab, n.lab); if (d < bd) { bd = d; best = n; } });
    return { zh: best.zh, en: best.en };
  };

  /* ---------- 主函式 ------------------------------------------- */
  MB.extractPalette = function (source, k) {
    k = Math.max(1, Math.min(8, Math.round(+k) || 5));
    var list = Array.isArray(source) ? source.filter(Boolean) : [source];
    if (!list.length) return Promise.reject(new Error('没有图片'));
    return Promise.all(list.map(drawable)).then(function (imgs) {
      var bins = {};
      imgs.forEach(function (im) {
        try { sample(im, bins); }
        catch (e) { throw e && e.name === 'SecurityError' ? new Error('这张图不能取色（来自别的网站）') : e; }
      });

      var all = [], total = 0;
      Object.keys(bins).forEach(function (key) {
        var b = bins[key], lab = rgbToLab(b.r / b.w, b.g / b.w, b.b / b.w);
        all.push({ L: lab[0], a: lab[1], b: lab[2], w: b.w, key: +key });
        total += b.w;
      });
      if (!all.length) throw new Error('图片是空的');

      /* 反光（几乎纯白）和死黑不是「他们的颜色」：先拿掉。
         整张几乎都是白 / 黑的图就不拿，免得什么都不剩 */
      var keep = all.filter(function (p) {
        var chroma = Math.sqrt(p.a * p.a + p.b * p.b);
        return !(p.L > 96.5 && chroma < 8) && p.L >= 4;
      });
      var kw = keep.reduce(function (s, p) { return s + p.w; }, 0);
      var pts = kw >= total * 0.2 ? keep : all;
      var idx = pts.map(function (p, i) { return i; });

      // 先多分几群（k + 5），近似的两色合一，再挑 k 个
      var cl = kmeans(pts, idx, k + 5);
      while (cl.length > 1 && mergeClosest(cl) < MIN_DE) { /* 继续合并近似色 */ }
      cl = choose(cl, k);
      var tried = {};
      while (cl.length < k && splitWidest(pts, cl, tried)) tried = {};
      while (cl.length < k) pad(cl);

      cl.sort(function (a, b) { return b.L - a.L; });   // 浅 → 深，跟风格默认的色板一样读
      var names = nameAll(cl);
      return cl.map(function (c, i) { return { hex: labHex(c), zh: names[i].zh, en: names[i].en }; });
    });
  };
})();
