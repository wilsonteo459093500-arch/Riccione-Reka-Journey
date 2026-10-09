/* ============================================================
   VISI · 本机存储（IndexedDB）
   ------------------------------------------------------------
   projects  每份方案一条（客户资料 · 空间 · 平面图）
   images    销售自己的图库（上传 / 从旧 PDF 导入），存压缩后的 JPEG
   只存在这台电脑的这个浏览器里 —— 不上传、不进 git。
   换电脑 / 给同事：用「导出备份」存成 .json 文件再导入。
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};
  var DB_NAME = 'sail-visi-v1';
  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode);
        var os = t.objectStore(store);
        var out = fn(os);
        t.oncomplete = function () { resolve(out && 'result' in out ? out.result : out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('IndexedDB aborted')); };
      });
    });
  }

  function all(store) {
    return tx(store, 'readonly', function (os) { return os.getAll(); })
      .then(function (r) { return r || []; });
  }

  MB.store = {
    listProjects: function () {
      return all('projects').then(function (list) {
        return list.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
      });
    },
    getProject: function (id) { return tx('projects', 'readonly', function (os) { return os.get(id); }); },
    putProject: function (p) { return tx('projects', 'readwrite', function (os) { os.put(p); }); },
    removeProject: function (id) { return tx('projects', 'readwrite', function (os) { os.delete(id); }); },

    listImages: function () {
      return all('images').then(function (list) {
        return list.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
      });
    },
    putImages: function (imgs) {
      return tx('images', 'readwrite', function (os) { imgs.forEach(function (im) { os.put(im); }); });
    },
    removeImage: function (id) { return tx('images', 'readwrite', function (os) { os.delete(id); }); }
  };

  /* ---------- 图片工具 -------------------------------------- */
  MB.uid = function (p) {
    return (p || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  };

  /** 任何来源（File / Blob / dataURL / canvas）→ 压缩 JPEG dataURL，长边 ≤ max */
  MB.compress = function (source, max, quality) {
    max = max || 1600; quality = quality || 0.84;
    return toCanvasSource(source).then(function (img) {
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      var k = Math.min(1, max / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
      var c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      var g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, cw, ch); // 透明 PNG 转 JPEG 时不要变黑底
      g.drawImage(img, 0, 0, cw, ch);
      if (img.close) img.close();
      return { src: c.toDataURL('image/jpeg', quality), w: cw, h: ch };
    });
  };

  function toCanvasSource(source) {
    if (source instanceof HTMLCanvasElement) return Promise.resolve(source);
    if (typeof source === 'string') return loadImg(source);
    if (window.createImageBitmap) {
      return createImageBitmap(source).catch(function () { return loadBlob(source); });
    }
    return loadBlob(source);
  }
  function loadBlob(blob) {
    var url = URL.createObjectURL(blob);
    return loadImg(url).then(function (im) { URL.revokeObjectURL(url); return im; });
  }
  function loadImg(src) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { reject(new Error('图片读不出来')); };
      im.src = src;
    });
  }
  MB.loadImg = loadImg;
})();
