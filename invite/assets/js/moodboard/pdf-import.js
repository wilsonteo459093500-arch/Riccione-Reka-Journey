/* ============================================================
   Moodboard 生成器 · 从旧 proposal PDF 收图
   ------------------------------------------------------------
   你们手上已经有很多份做好的 proposal。把 PDF 拖进来，这里会：
   1. 用 pdf.js 把每一页嵌着的照片原图取出来（不是截图，是原图）
   2. 读这一页的标题文字，猜它是哪个空间（FOYER / KITHCEN / …）
   3. 交给销售确认后存进本机图库
   全程在浏览器里做，PDF 不会上传到任何地方。
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};
  var VENDOR = 'assets/vendor/pdfjs/';
  var loading = null;

  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = VENDOR + 'pdf.min.js';
      s.onload = function () {
        var lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
        if (!lib) return reject(new Error('pdf.js 载入失败'));
        lib.GlobalWorkerOptions.workerSrc = VENDOR + 'pdf.worker.min.js';
        window.pdfjsLib = lib;
        resolve(lib);
      };
      s.onerror = function () { loading = null; reject(new Error('pdf.js 载入失败，检查网络后重试')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  /** 页面文字（去空格转大写）→ 空间代号。先看页首标题，再看全文 */
  function guessTag(squashed) {
    // 只剩别本手册留下的页码（P45P46）也算没有字
    var bare = squashed.replace(/P\d+/g, '');
    if (!bare) return 'showroom';                                  // 整页大图，多半是品牌 / 展厅照
    if (/LAYOUTPLAN|FLOORPLAN|平面图/.test(squashed)) return 'plan';
    if (/OFFICIALPHONE|WHATSAPPNUMBER|INSTAGRAM|SHOWROOMLOCATION/.test(squashed)) return 'other';
    // 品牌 / 系列介绍页：正文里常有 "living" 之类的字，要先挡掉。
    // 只认完整的系列名 —— 客厅页的 "personal collections" 不能被当成品牌页
    if (/ABOUTTHEBRAND|LINESERIES|MOUNTAINSERIES|WEAVINGSERIES|WOODCOLLECTION|WABI-?SABIEASTERN|品牌故事|系列/.test(squashed)) return 'showroom';
    var head = bare.slice(0, 40), i;
    for (i = 0; i < MB.PAGE_KEYWORDS.length; i++) {
      if (MB.PAGE_KEYWORDS[i].re.test(head)) return MB.PAGE_KEYWORDS[i].room;
    }
    for (i = 0; i < MB.PAGE_KEYWORDS.length; i++) {
      if (MB.PAGE_KEYWORDS[i].re.test(squashed)) return MB.PAGE_KEYWORDS[i].room;
    }
    return 'other';
  }

  function getObj(page, name) {
    return new Promise(function (resolve) {
      var objs = name.indexOf('g_') === 0 ? page.commonObjs : page.objs;
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; resolve(null); } }, 6000);
      try {
        objs.get(name, function (data) { if (!done) { done = true; clearTimeout(t); resolve(data); } });
      } catch (e) { done = true; clearTimeout(t); resolve(null); }
    });
  }

  /** pdf.js 的图片对象 → canvas（新版给 ImageBitmap，旧路径给像素数组） */
  function toCanvas(img) {
    var w = img.width || (img.bitmap && img.bitmap.width);
    var h = img.height || (img.bitmap && img.bitmap.height);
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    if (img.bitmap) {
      g.drawImage(img.bitmap, 0, 0);
      return c;
    }
    if (!img.data) return null;
    var id = g.createImageData(w, h), out = id.data, src = img.data, i, j;
    if (img.kind === 3) {            // RGBA_32BPP
      out.set(src.subarray(0, out.length));
    } else if (img.kind === 2) {     // RGB_24BPP
      for (i = 0, j = 0; j < out.length; i += 3, j += 4) {
        out[j] = src[i]; out[j + 1] = src[i + 1]; out[j + 2] = src[i + 2]; out[j + 3] = 255;
      }
    } else if (img.kind === 1) {     // GRAYSCALE_1BPP：每行按字节对齐，1 = 白
      var rowBytes = (w + 7) >> 3;
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var bit = src[y * rowBytes + (x >> 3)] & (128 >> (x & 7));
          var v = bit ? 255 : 0, k = (y * w + x) * 4;
          out[k] = out[k + 1] = out[k + 2] = v; out[k + 3] = 255;
        }
      }
    } else {
      return null;
    }
    g.putImageData(id, 0, 0);
    return c;
  }

  /**
   * @param {File} file
   * @param {(done:number,total:number)=>void} onProgress
   * @returns {Promise<Array<{page,tag,src,w,h,label}>>}
   */
  MB.importPdf = function (file, onProgress) {
    var lib, pdf, results = [];
    return loadPdfJs().then(function (l) {
      lib = l;
      return file.arrayBuffer();
    }).then(function (buf) {
      return lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    }).then(function (doc) {
      pdf = doc;
      var chain = Promise.resolve();
      for (var p = 1; p <= pdf.numPages; p++) chain = chain.then(page.bind(null, p));
      return chain;
    }).then(function () {
      if (pdf) pdf.destroy();
      return results;
    });

    function page(n) {
      return pdf.getPage(n).then(function (pg) {
        var squashed = '', label = '';
        return pg.getTextContent().then(function (tc) {
          var text = tc.items.map(function (it) { return it.str; }).join(' ');
          squashed = text.replace(/\s+/g, '').toUpperCase();
          label = text.replace(/\s+/g, ' ').trim().slice(0, 60);
          return pg.getOperatorList();
        }).then(function (ops) {
          var OPS = lib.OPS, names = [];
          for (var i = 0; i < ops.fnArray.length; i++) {
            var fn = ops.fnArray[i];
            if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject || fn === OPS.paintImageXObjectRepeat) {
              var name = ops.argsArray[i][0];
              if (typeof name === 'string' && names.indexOf(name) < 0) names.push(name);
            }
          }
          var tag = guessTag(squashed);
          var chain = Promise.resolve();
          names.forEach(function (name) {
            chain = chain.then(function () { return getObj(pg, name); }).then(function (img) {
              if (!img) return;
              var w = img.width || (img.bitmap && img.bitmap.width) || 0;
              var h = img.height || (img.bitmap && img.bitmap.height) || 0;
              if (Math.min(w, h) < 280) return;          // 标志、图标、二维码 —— 不要
              var c = toCanvas(img);
              if (!c) return;
              return MB.compress(c, 1600, 0.84).then(function (out) {
                results.push({ page: n, tag: tag, src: out.src, w: out.w, h: out.h, label: label });
              });
            });
          });
          return chain;
        }).then(function () {
          pg.cleanup();
          if (onProgress) onProgress(n, pdf.numPages);
        });
      });
    }
  };
})();
