/* ============================================================
   案例库 · 照片处理（同一个档两种用法）
   ------------------------------------------------------------
   1. 当 Web Worker 跑（new Worker('…/worker.js')）：收 {id, op, file, opts}，回 {id, ok, res|error}
   2. 在页面里载入（<script>）：提供 MB.clWork —— 2 个 worker 的工作池；
      浏览器没有 OffscreenCanvas（旧 Safari）就改在主执行绪用一般 canvas 做，结果一样。

   每张照片做的事：
   - h：原档 bytes 的 SHA-256 前 16 码（同一张照片不管放哪个文件夹都一样 → 不重复上传）
   - 依 EXIF 转正（imageOrientation:'from-image'）→ 长边 1200px JPEG q0.78（约 150 KB：免费方案只有 1 GB）；
     超过 3.5 MB 再压 q0.7（伺服器上限），还是太大就再小一点
     重新编码会顺便去掉 EXIF / GPS（照片里不会留下客户家的位置）
   - thumb：长边 320px、q0.72 的 dataURL（审核页、VISI 图库用）
   - dh：9×8 灰阶 dHash（16 hex），伺服器拿来把「同一个镜头」的连拍分成一组

   另外两种（上传页的「精选」用，都不上传、不压 JPEG）：
   - analyze：只算 h、w / ht（转正、缩到 1200px 后的尺寸）、dh —— 跟 process 同一套画法，dh 一样
   - preview：长边约 200px 的小 JPEG（Blob），给预览格子看
   ============================================================ */
(function (G) {
  'use strict';

  var IS_WORKER = typeof window === 'undefined' && typeof G.importScripts === 'function';

  var DEF = {
    long: 1200, q: 0.78, q2: 0.7,
    maxBytes: 3.5 * 1024 * 1024,
    thumb: 320, tq: 0.72,
    thumbMax: 190 * 1024            // 伺服器收的缩图 dataURL ≤ 200 KB，留一点余裕
  };

  function opt(o, k) { return o && o[k] != null ? o[k] : DEF[k]; }

  /* ---------- hash ---------- */
  function readBuf(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error || new Error('read')); };
      r.readAsArrayBuffer(file);
    });
  }
  function hex(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return s;
  }
  function hash16(file) {
    var subtle = G.crypto && G.crypto.subtle;
    if (!subtle) return Promise.reject(err('no_crypto'));
    return readBuf(file).then(function (buf) { return subtle.digest('SHA-256', buf); })
      .then(function (d) { return hex(d).slice(0, 16); });
  }

  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }

  /* ---------- canvas（OffscreenCanvas 或一般 canvas） ---------- */
  function canUseOffscreen() {
    try {
      if (typeof G.OffscreenCanvas !== 'function' || typeof G.createImageBitmap !== 'function') return false;
      var c = new G.OffscreenCanvas(2, 2);
      return !!(c.getContext('2d') && c.convertToBlob);
    } catch (e) { return false; }
  }
  function makeCanvas(w, h, offscreen) {
    if (offscreen) return new G.OffscreenCanvas(w, h);
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function toJpeg(c, q) {
    if (c.convertToBlob) return c.convertToBlob({ type: 'image/jpeg', quality: q });
    return new Promise(function (resolve, reject) {
      c.toBlob(function (b) { if (b) resolve(b); else reject(err('encode')); }, 'image/jpeg', q);
    });
  }
  function dataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error || err('read')); };
      r.readAsDataURL(blob);
    });
  }
  function release(c) { try { c.width = 0; c.height = 0; } catch (e) { /* 只是提早放记忆体 */ } }

  // 解码 + 依 EXIF 转正。旧浏览器不认得 imageOrientation 选项就不带（新版 Chrome 预设也是转正）
  function decode(file, offscreen) {
    function viaImg() {
      if (IS_WORKER || typeof Image === 'undefined') return Promise.reject(err('decode'));
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var im = new Image();
        im.onload = function () { URL.revokeObjectURL(url); resolve(im); };
        im.onerror = function () { URL.revokeObjectURL(url); reject(err('decode')); };
        im.src = url;
      });
    }
    if (typeof G.createImageBitmap !== 'function') return viaImg();
    return G.createImageBitmap(file, { imageOrientation: 'from-image' })
      .catch(function (e) {
        if (e && e.name === 'TypeError') return G.createImageBitmap(file);
        throw e;
      })
      .catch(function () { return offscreen ? Promise.reject(err('decode')) : viaImg(); });
  }

  function draw(src, w, h, offscreen) {
    var c = makeCanvas(w, h, offscreen);
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.fillStyle = '#fff';               // 透明 PNG 转 JPEG 不要变黑底
    g.fillRect(0, 0, w, h);
    g.drawImage(src, 0, 0, w, h);
    return c;
  }

  function fit(w, h, long) {
    var k = Math.min(1, long / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }

  /* dHash：缩图的像素自己平均成 9×8 格（比直接 drawImage 到 9×8 稳定），
     每一列左边比右边亮记 1 → 64 bit → 16 hex */
  function dhash(c) {
    var w = c.width, h = c.height;
    var d = c.getContext('2d').getImageData(0, 0, w, h).data;
    var cells = [];
    for (var gy = 0; gy < 8; gy++) {
      var y0 = Math.floor(gy * h / 8), y1 = Math.max(y0 + 1, Math.floor((gy + 1) * h / 8));
      for (var gx = 0; gx < 9; gx++) {
        var x0 = Math.floor(gx * w / 9), x1 = Math.max(x0 + 1, Math.floor((gx + 1) * w / 9));
        var sum = 0, n = 0;
        for (var y = y0; y < y1 && y < h; y++) {
          for (var x = x0; x < x1 && x < w; x++) {
            var i = (y * w + x) * 4;
            sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            n++;
          }
        }
        cells.push(n ? sum / n : 0);
      }
    }
    var out = '';
    for (var row = 0; row < 8; row++) {
      for (var nib = 0; nib < 2; nib++) {
        var v = 0;
        for (var b = 0; b < 4; b++) {
          var x2 = nib * 4 + b;
          v = (v << 1) | (cells[row * 9 + x2] > cells[row * 9 + x2 + 1] ? 1 : 0);
        }
        out += v.toString(16);
      }
    }
    return out;
  }

  /* ---------- 一张照片的全部处理 ---------- */
  function processFile(file, o, offscreen) {
    o = o || {};
    var res = { name: file.name };
    var hp = o.h ? Promise.resolve(o.h) : hash16(file);
    return hp.then(function (h) {
      res.h = h;
      return decode(file, offscreen);
    }).then(function (bmp) {
      var sw = bmp.width || bmp.naturalWidth, sh = bmp.height || bmp.naturalHeight;
      if (!sw || !sh) throw err('decode');
      res.ow = sw; res.oh = sh;
      var size = fit(sw, sh, opt(o, 'long'));
      var main = draw(bmp, size.w, size.h, offscreen);
      if (bmp.close) bmp.close();
      res.w = size.w; res.ht = size.h;
      var max = opt(o, 'maxBytes');
      // 先 q0.78；太大改 q0.7；再太大就缩到 960px（极少数：满是细纹的照片）
      return toJpeg(main, opt(o, 'q')).then(function (b) {
        res.q = opt(o, 'q');
        if (b.size <= max) return b;
        res.q = opt(o, 'q2');
        return toJpeg(main, res.q);
      }).then(function (b) {
        if (b.size <= max) return b;
        var s2 = fit(main.width, main.height, Math.round(opt(o, 'long') * 0.8));
        var small = draw(main, s2.w, s2.h, offscreen);
        res.w = s2.w; res.ht = s2.h; res.q = 0.6;
        return toJpeg(small, 0.6).then(function (b2) { release(small); return b2; });
      }).then(function (jpeg) {
        if (jpeg.size > max) throw err('too_large');
        res.jpeg = jpeg;
        res.sz = jpeg.size;
        var t = fit(main.width, main.height, opt(o, 'thumb'));
        var th = draw(main, t.w, t.h, offscreen);
        release(main);
        res.dh = dhash(th);
        return toJpeg(th, opt(o, 'tq')).then(function (tb) {
          if (tb.size * 1.37 + 30 <= opt(o, 'thumbMax')) return tb;
          return toJpeg(th, 0.5);
        }).then(function (tb) {
          release(th);
          return dataUrl(tb);
        });
      }).then(function (thumb) {
        res.thumb = thumb.length <= opt(o, 'thumbMax') ? thumb : '';
        return res;
      });
    });
  }

  /* ---------- 只分析（精选用）：跟 processFile 一样转正、缩图、算 dHash，但不压 JPEG ---------- */
  function analyzeFile(file, o, offscreen) {
    o = o || {};
    var res = {};
    var hp = o.h ? Promise.resolve(o.h) : hash16(file);
    return hp.then(function (h) {
      res.h = h;
      return decode(file, offscreen);
    }).then(function (bmp) {
      var sw = bmp.width || bmp.naturalWidth, sh = bmp.height || bmp.naturalHeight;
      if (!sw || !sh) throw err('decode');
      res.ow = sw; res.oh = sh;
      var size = fit(sw, sh, opt(o, 'long'));
      var main = draw(bmp, size.w, size.h, offscreen);
      if (bmp.close) bmp.close();
      res.w = size.w; res.ht = size.h;
      var t = fit(main.width, main.height, opt(o, 'thumb'));
      var th = draw(main, t.w, t.h, offscreen);
      release(main);
      res.dh = dhash(th);
      release(th);
      return res;
    });
  }

  /* ---------- 预览格子的小图：长边 o.long（预设 200px） ---------- */
  function previewFile(file, o, offscreen) {
    o = o || {};
    return decode(file, offscreen).then(function (bmp) {
      var sw = bmp.width || bmp.naturalWidth, sh = bmp.height || bmp.naturalHeight;
      if (!sw || !sh) throw err('decode');
      var size = fit(sw, sh, o.long || 200);
      var c = draw(bmp, size.w, size.h, offscreen);
      if (bmp.close) bmp.close();
      return toJpeg(c, o.q || 0.7).then(function (b) {
        release(c);
        return { blob: b, w: size.w, ht: size.h, ow: sw, oh: sh };
      });
    });
  }

  /* ============================================================
     Worker 模式
     ============================================================ */
  if (IS_WORKER) {
    var supported = canUseOffscreen();
    var CANVAS_OPS = { process: processFile, analyze: analyzeFile, preview: previewFile };
    G.onmessage = function (ev) {
      var m = ev.data || {};
      function reply(ok, val) {
        G.postMessage(ok ? { id: m.id, ok: true, res: val } : { id: m.id, ok: false, error: (val && val.code) || 'error', message: String((val && val.message) || val) });
      }
      if (m.op === 'ping') return reply(true, { offscreen: supported });
      if (m.op === 'hash') return hash16(m.file).then(function (h) { reply(true, { h: h }); }, function (e) { reply(false, e); });
      if (CANVAS_OPS[m.op]) {
        if (!supported) return reply(false, err('unsupported'));
        return CANVAS_OPS[m.op](m.file, m.opts, true).then(function (r) { reply(true, r); }, function (e) { reply(false, e); });
      }
      reply(false, err('op'));
    };
    return;
  }

  /* ============================================================
     页面模式：工作池（2 个 worker；不支援就在主执行绪做）
     ============================================================ */
  var MB = G.MB = G.MB || {};
  var SRC = (document.currentScript && document.currentScript.src) || 'assets/js/caselib/worker.js';

  var pool = [], queue = [], seq = 0, size = 2;
  var mainMode = false, mainBusy = 0, crashes = 0;
  var counts = { hash: 0, process: 0, analyze: 0, preview: 0, main: 0 };

  function spawn() {
    var w;
    try { w = new Worker(SRC); } catch (e) { return null; }
    var slot = { w: w, job: null };
    w.onmessage = function (ev) {
      var m = ev.data || {}, job = slot.job;
      if (!job || m.id !== job.id) return;
      slot.job = null;
      if (m.ok) job.resolve(m.res);
      else if (m.error === 'unsupported') {
        // 这个浏览器的 worker 没有 OffscreenCanvas：之后全部改主执行绪
        mainMode = true;
        runMain(job);
      } else job.reject(err(m.error, m.message));
      next();
    };
    w.onerror = function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      var job = slot.job;
      slot.job = null;
      crashes++;
      try { w.terminate(); } catch (e) { /* 已经坏了 */ }
      var i = pool.indexOf(slot);
      if (i >= 0) pool.splice(i, 1);
      // 一直当掉（例：记忆体不够）就改在主执行绪一张一张做
      if (crashes >= 3) mainMode = true;
      if (job) {
        if (job.retried) job.reject(err('worker', 'worker crashed'));
        else { job.retried = true; queue.unshift(job); }
      }
      next();
    };
    pool.push(slot);
    return slot;
  }

  function runMain(job) {
    mainBusy++;
    counts.main++;
    var p = job.op === 'hash' ? hash16(job.file).then(function (h) { return { h: h }; })
      : job.op === 'analyze' ? analyzeFile(job.file, job.opts, false)
      : job.op === 'preview' ? previewFile(job.file, job.opts, false)
      : processFile(job.file, job.opts, false);
    p.then(function (r) { mainBusy--; job.resolve(r); next(); }, function (e) { mainBusy--; job.reject(e); next(); });
  }

  function next() {
    while (queue.length) {
      if (mainMode || MB.clWork.forceMain || typeof Worker === 'undefined') {
        if (mainBusy >= 1) return;     // 主执行绪一次一张，免得画面卡住
        runMain(queue.shift());
        continue;
      }
      var free = null;
      for (var i = 0; i < pool.length; i++) if (!pool[i].job) { free = pool[i]; break; }
      if (!free && pool.length < size) free = spawn();
      if (!free) {
        if (!pool.length) { mainMode = true; continue; }
        return;
      }
      var job = queue.shift();
      free.job = job;
      free.w.postMessage({ id: job.id, op: job.op, file: job.file, opts: job.opts });
    }
  }

  function run(op, file, opts) {
    counts[op] = (counts[op] || 0) + 1;
    return new Promise(function (resolve, reject) {
      queue.push({ id: ++seq, op: op, file: file, opts: opts || null, resolve: resolve, reject: reject });
      next();
    });
  }

  MB.clWork = {
    DEF: DEF,
    forceMain: false,                       // 测试用：强制走主执行绪的后备做法
    hash: function (file) { return run('hash', file); },
    process: function (file, opts) { return run('process', file, opts); },
    // 精选用：只算 w / ht / dh（不压、不传）；预览格子的小图
    analyze: function (file, opts) { return run('analyze', file, opts); },
    preview: function (file, opts) { return run('preview', file, opts); },
    pending: function () { return queue.length; },
    stats: function () { return { hash: counts.hash, process: counts.process, analyze: counts.analyze, preview: counts.preview, main: counts.main, workers: pool.length, mainMode: mainMode }; },
    // 测试用：在主执行绪直接算（不经工作池）
    _processHere: function (file, opts) { return processFile(file, opts, false); },
    _dhash: dhash
  };
})(typeof self !== 'undefined' ? self : this);
