/* ============================================================
   案例库 · 导出给 VISI 内置图库（VISI 体检计划第 3 阶段）
   ------------------------------------------------------------
   老板在审核页「多选」勾好每个空间要放进 VISI 的照片 →「导出给 VISI」→ 下载一个 zip，
   上传到跟 Claude 的对话，Claude 用 tools/visi/import-builtin.mjs 放进 invite/assets/img/sail/ 和 photos-sail.js。

   zip 里只有：
     photos/<空间>/<照片 id>.jpg   照片 id = 原档的 sha256 前 16 码（看不出客户、项目、档名）
     visi-photos.json             每张的空间、风格、柜类、产品、可当主图、宽高 —— 没有项目名、档案路径、AI 写的说明
   照片在浏览器里重新画一次再存（canvas → JPEG）：拍摄资料（GPS、日期、相机）一律不会跟着出去。

   对外：MB.clVisiExport
     .plan(cat, hs)          → { items, skipped, rooms }（纯函数，Node 测试也用）
     .build(cat, hs, opts)   → Promise<{ blob, name, n, skipped }>（浏览器：要 JSZip，第一次用才载入）
     .summary(plan)          → 给确认框的一段字：每个空间几张、哪些空间还是 0 张
   ============================================================ */
(function (G) {
  'use strict';

  var MB = G.MB = G.MB || {};
  var LIB = 'assets/vendor/pptxgenjs/pptxgen.bundle.js';   // 里面带 JSZip（window.JSZip）
  var KIND = 'visi-builtin-export';
  var MAX_EDGE = 1600;
  var Q = 0.85;
  var HEX16 = /^[0-9a-f]{16}$/;
  // 第 3 阶段要补的空间（内置一张都没有 / 很少）：确认框特别列出来
  var WANT = ['foyer', 'laundry', 'walkin', 'vanity', 'bathroom', 'altar', 'bedroom'];

  function roomZh(k) { return (MB.ROOM && MB.ROOM[k] && MB.ROOM[k].zh) || (k === 'other' ? '其他' : k); }
  function vocabKeys(list) { var o = {}; (list || []).forEach(function (x) { o[typeof x === "string" ? x : x.key] = 1; }); return o; }

  /** 选的照片 → 要导出的那几张（隐藏的、没分空间的、看不到档案的不导出，另外列出来） */
  function plan(cat, hs) {
    cat = cat || { photos: {}, projects: {} };
    var rooms = vocabKeys(MB.CASE_ROOMS), styles = vocabKeys(MB.CASE_STYLES), cabs = vocabKeys(MB.CASE_CABINETS);
    var items = [], skipped = [], seen = {};
    (hs || []).forEach(function (h) {
      if (seen[h]) return;
      seen[h] = 1;
      var ph = cat.photos[h];
      var pr = ph ? cat.projects[ph.p] || {} : {};
      if (!ph || !HEX16.test(h)) { skipped.push({ h: h, why: '找不到这张' }); return; }
      if (ph.hidden || pr.hidden) { skipped.push({ h: h, why: '已经隐藏' }); return; }
      if (!ph.room || !rooms[ph.room] || ph.room === 'other') { skipped.push({ h: h, why: '还没分空间' }); return; }
      if (!ph.k) { skipped.push({ h: h, why: '这台电脑没有这张的档案' }); return; }
      // 风格：照片自己的，没有就跟项目（跟审核页一样）；只留词表里有的
      var st = ph.style ? [ph.style, ph.style2 || ''] : [pr.style || '', pr.style2 || ''];
      st = st.filter(function (x, i) { return x && styles[x] && st.indexOf(x) === i; });
      items.push({
        id: h,
        file: 'photos/' + ph.room + '/' + h + '.jpg',
        room: ph.room,
        style: st[0] || '',
        style2: st[1] || '',
        cabinets: (ph.cabinets || []).filter(function (c) { return cabs[c]; }),
        product: MB.clProductOk && ph.product && MB.clProductOk(ph.product) ? String(ph.product) : '',
        hero: !!ph.hero,
        unsure: ph.status === 'unsure',
        w: +ph.w || 0,
        h: +ph.h || 0,
        k: ph.k        // 只给 build() 读档用，不写进 json
      });
    });
    var count = {};
    items.forEach(function (it) { count[it.room] = (count[it.room] || 0) + 1; });
    return { items: items, skipped: skipped, rooms: count };
  }

  function summary(pl) {
    var keys = Object.keys(pl.rooms).sort(function (a, b) { return pl.rooms[b] - pl.rooms[a]; });
    var lines = keys.map(function (k) { return roomZh(k) + ' ' + pl.rooms[k] + ' 张'; });
    var zero = WANT.filter(function (k) { return !pl.rooms[k]; }).map(roomZh);
    var unsure = pl.items.filter(function (it) { return it.unsure; }).length;
    var why = {};
    pl.skipped.forEach(function (s) { why[s.why] = (why[s.why] || 0) + 1; });
    return '导出 ' + pl.items.length + ' 张给 VISI 内置图库：\n' + (lines.join('、') || '（没有）') +
      (zero.length ? '\n\n还是 0 张的空间：' + zero.join('、') : '') +
      (unsure ? '\n\n其中 ' + unsure + ' 张分类标了「不确定」：放进 VISI 之前请再看一次' : '') +
      (pl.skipped.length ? '\n\n不导出 ' + pl.skipped.length + ' 张：' + Object.keys(why).map(function (k) { return k + ' ' + why[k]; }).join('、') : '') +
      '\n\n不会带出去：客户名字、项目名、档名、拍摄资料（GPS、日期）。';
  }

  /** json 那一份（不带 k） */
  function manifest(pl, now) {
    return {
      kind: KIND, v: 1, at: now || Date.now(),
      photos: pl.items.map(function (it) {
        return { id: it.id, file: it.file, room: it.room, style: it.style, style2: it.style2, cabinets: it.cabinets,
          product: it.product, hero: it.hero, unsure: it.unsure, w: it.w, h: it.h };
      })
    };
  }

  /* ---------- 浏览器 ---------- */
  var zipLoad = null;
  function loadZip() {
    if (G.JSZip) return Promise.resolve(G.JSZip);
    if (!zipLoad) {
      zipLoad = new Promise(function (ok, no) {
        var s = document.createElement('script');
        s.src = LIB;
        s.onload = function () { G.JSZip ? ok(G.JSZip) : no(new Error('JSZip 没载入')); };
        s.onerror = function () { zipLoad = null; no(new Error('JSZip 载入失败')); };
        document.head.appendChild(s);
      });
    }
    return zipLoad;
  }
  /** 重新画一次 → 干净的 JPEG（没有任何拍摄资料）：{ blob, w, h } */
  function redraw(src) {
    return fetch(src).then(function (r) {
      if (!r.ok) throw new Error('读不到照片（' + r.status + '）');
      return r.blob();
    }).then(function (b) { return createImageBitmap(b); }).then(function (bmp) {
      var s = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
      var w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      return new Promise(function (ok, no) {
        c.toBlob(function (blob) { blob ? ok({ blob: blob, w: w, h: h }) : no(new Error('转不出 JPEG')); }, 'image/jpeg', Q);
      });
    });
  }
  /** opts.onProgress(done, total) */
  function build(cat, hs, opts) {
    opts = opts || {};
    var pl = plan(cat, hs);
    if (!pl.items.length) return Promise.reject(new Error('没有能导出的照片'));
    var base = cat.base || '';
    return loadZip().then(function (JSZip) {
      var zip = new JSZip(), done = 0, failed = [];
      var chain = Promise.resolve();
      pl.items.forEach(function (it) {
        chain = chain.then(function () {
          return redraw(base + it.k).then(function (out) {
            it.w = out.w; it.h = out.h;
            zip.file(it.file, out.blob);
          }, function () { failed.push(it); }).then(function () {
            done++;
            if (opts.onProgress) opts.onProgress(done, pl.items.length);
          });
        });
      });
      return chain.then(function () {
        pl.items = pl.items.filter(function (it) { return failed.indexOf(it) < 0; });
        failed.forEach(function (it) { pl.skipped.push({ h: it.id, why: '读不到照片' }); });
        if (!pl.items.length) throw new Error('一张都读不到');
        zip.file('visi-photos.json', JSON.stringify(manifest(pl), null, 1));
        return zip.generateAsync({ type: 'blob', compression: 'STORE' });
      }).then(function (blob) {
        var d = new Date();
        var name = 'visi-内置图库-' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '-' + pl.items.length + '张.zip';
        return { blob: blob, name: name, n: pl.items.length, skipped: pl.skipped };
      });
    });
  }

  MB.clVisiExport = { plan: plan, summary: summary, manifest: manifest, build: build, KIND: KIND };
})(typeof window !== 'undefined' ? window : globalThis);
