/* ============================================================
   案例库 · 读文件夹（scan）
   ------------------------------------------------------------
   两种来源，最后都变成同一份「项目 + 照片 + 略过清单」：
   - <input webkitdirectory>：file.webkitRelativePath = 「总文件夹/项目/厨房/IMG.jpg」
   - 拖放：DataTransferItem.webkitGetAsEntry() 递回读。
     readEntries 一次最多给 100 个，要一直读到回传空阵列为止（不然大文件夹会少图）。

   哪一层是项目：
   - 拖进好几个文件夹 → 每个文件夹各是一个项目。
   - 只有一个文件夹：
       里面直接有照片，或子文件夹都像空间名（厨房、主卧…） → 它自己就是一个项目；
       不然（只有子文件夹）→ 每个子文件夹是一个项目（= 拖进「案例」总文件夹）。
     预览可以手动切换（opts.mode = 'single' | 'split'）。
   - 子文件夹（例：厨房/）留在项目里，f = 项目内的相对路径。

   略过并列出来：HEIC、RAW、影片、系统档（Thumbs.db…）、不是照片、超过 60 MB。
   这里不读档案内容，只看名字和大小：很快，1000 张也是一瞬间。
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};

  var MAX_SIZE = 60 * 1024 * 1024;
  var COLL = window.Intl && Intl.Collator ? new Intl.Collator('en', { numeric: true }) : { compare: function (a, b) { return a < b ? -1 : a > b ? 1 : 0; } };
  // 浏览器（Chrome / Edge / Safari）都解得开、能转成 JPEG 的
  var IMG = /\.(jpe?g|jfif|jpe|png|webp|bmp|avif)$/i;
  var HEIC = /\.(heic|heif|hif)$/i;
  var RAW = /\.(cr2|cr3|crw|nef|nrw|arw|srf|sr2|dng|raf|orf|rw2|pef|srw|x3f|3fr|erf|kdc|mrw|raw|rwl|iiq|mos|mef)$/i;
  var VIDEO = /\.(mp4|mov|m4v|avi|mkv|3gp|3g2|wmv|webm|mts|m2ts|flv|mpe?g|vob|insv|lrv|hevc)$/i;
  // Windows / Mac 自己产生的档，不必让老板看到一长串
  var JUNK = /^(thumbs\.db|ehthumbs(_vista)?\.db|desktop\.ini|\.ds_store|icon\r?|\.localized|picasa\.ini|\.picasa\.ini)$|^\._|^~\$/i;
  // 子文件夹名像空间（或柜类）→ 那是项目里面的分类，不是另一个项目。
  // 可以几个字连在一起：Living Room、Master Bedroom 2、01 厨房
  var ROOM_WORD = '(厨房|客厅|餐厅|餐厨|主卧室?|主人房|次卧室?|卧室|卧房|房间|睡房|儿童房|小孩房|老人房|佣人房|工人房|客房|书房|浴室|厕所|洗手间|卫生间|' +
    '玄关|入户|门厅|大厅|衣帽间|洗衣房?|神台|佛台|阳台|露台|走廊|楼梯|储物间|储藏室|梳妆台?|化妆间|吧台|其他|其它|细节|' +
    '橱柜|衣柜|鞋柜|书柜|展示柜|电视柜|电视墙|浴室柜|护墙板?|餐边柜|' +
    'kitchen|wet|dry|living|dining|bed|bedroom|master|room|study|bath|bathroom|toilet|foyer|entrance|walk-?in|wardrobe|' +
    'laundry|altar|balcony|guest|vanity|kids?|others?|detail|hall|tv|cabinet)s?';
  var ROOMISH = new RegExp('^(\\d+[\\s._-]*)?' + ROOM_WORD + '([\\s._-]*' + ROOM_WORD + ')*([\\s._-]*\\d+)?$', 'i');

  var REASONS = {
    heic: { zh: 'HEIC / HEIF（iPhone 格式）', tip: '在电脑上打开后「另存为 JPG」，或 iPhone 设定 → 相机 → 格式 → 「最兼容」' },
    raw: { zh: 'RAW 原档', tip: '先用修图软件导出成 JPG' },
    video: { zh: '影片', tip: '案例库只收照片' },
    big: { zh: '超过 60 MB', tip: '先另存一个小一点的 JPG' },
    junk: { zh: '系统档（Thumbs.db 等）', tip: '电脑自动产生的，不用理' },
    other: { zh: '不是照片', tip: 'PDF、PSD、TIFF、GIF 等不收；照片请存成 JPG / PNG' },
    empty: { zh: '空档案', tip: '' },
    loose: { zh: '不在项目文件夹里', tip: '请拖整个文件夹（文件夹名 = 项目名）' },
    unreadable: { zh: '读不到', tip: '档案可能被别的程式占用或没有权限' },
    bad: { zh: '图片读不出来', tip: '档案可能坏了，或其实不是照片' }
  };

  function classify(name, size, type) {
    name = String(name || '');
    if (JUNK.test(name)) return 'junk';
    if (HEIC.test(name) || /image\/hei[cf]/i.test(type || '')) return 'heic';
    if (RAW.test(name)) return 'raw';
    if (VIDEO.test(name) || /^video\//i.test(type || '')) return 'video';
    if (!IMG.test(name)) return 'other';
    if (size > MAX_SIZE) return 'big';
    if (!size) return 'empty';
    return '';
  }

  /* ---------- 把 [{file, parts}] 分成项目 ----------
     parts = 从拖进来的那一层算起的路径（最后一个是档名） */
  function group(items, opts) {
    opts = opts || {};
    var skipped = [];
    var roots = [], rootSeen = {};
    var loose = [];
    items.forEach(function (it) {
      if (it.parts.length < 2) loose.push(it);
      else if (!rootSeen[it.parts[0]]) { rootSeen[it.parts[0]] = 1; roots.push(it.parts[0]); }
    });

    // 只拖了散的照片（手机没有选文件夹）：变成一个要业务填名字的项目
    var looseProject = null;
    if (!roots.length && loose.length) {
      looseProject = { name: '', loose: true, files: [], skipped: [] };
    } else {
      loose.forEach(function (it) {
        var why = classify(it.file.name, it.file.size, it.file.type) || 'loose';
        skipped.push(skipRec(it, why, ''));
      });
    }

    // 只有一个文件夹：判断它是「一个项目」还是「装着很多项目的总文件夹」
    var mode = 'multi';
    var info = null;
    if (roots.length === 1) {
      var subs = [], subSeen = {}, directImgs = 0;
      items.forEach(function (it) {
        if (it.parts.length === 2 && !classify(it.file.name, it.file.size, it.file.type)) directImgs++;
        if (it.parts.length >= 3 && !subSeen[it.parts[1]]) { subSeen[it.parts[1]] = 1; subs.push(it.parts[1]); }
      });
      var roomy = subs.length > 0 && subs.every(function (s) { return ROOMISH.test(s.trim()); });
      var auto = (!subs.length || directImgs > 0 || roomy) ? 'single' : 'split';
      mode = opts.mode === 'single' || opts.mode === 'split' ? opts.mode : auto;
      if (!subs.length) mode = 'single';
      info = { root: roots[0], subs: subs.length, directImgs: directImgs, auto: auto, canSplit: subs.length > 0 };
    }

    var byName = {}, projects = [];
    function proj(name) {
      if (!byName[name]) { byName[name] = { name: name, files: [], skipped: [] }; projects.push(byName[name]); }
      return byName[name];
    }
    items.forEach(function (it) {
      if (it.parts.length < 2) {
        if (looseProject) addTo(looseProject, it, it.parts.slice(-1).join('/'));
        return;
      }
      var name, rest;
      if (mode === 'split') {
        // 总文件夹 / 项目 / …：总文件夹里直接放的档案不属于任何项目
        if (it.parts.length < 3) {
          var why = classify(it.file.name, it.file.size, it.file.type) || 'loose';
          skipped.push(skipRec(it, why, ''));
          return;
        }
        name = it.parts[1]; rest = it.parts.slice(2);
      } else {
        name = it.parts[0]; rest = it.parts.slice(1);
      }
      addTo(proj(name), it, rest.join('/'));
    });

    function addTo(p, it, f) {
      var why = classify(it.file.name, it.file.size, it.file.type);
      if (why) { var s = skipRec(it, why, p.name); p.skipped.push(s); skipped.push(s); return; }
      p.files.push({ file: it.file, f: f, rel: it.parts.join('/'), key: fileKey(it) });
    }
    if (looseProject) projects.unshift(looseProject);

    // 照档名排（数字照大小：IMG_2 在 IMG_10 前面）。固定用 en 排序：
    // 不随电脑语言变 → 同一张照片在两个项目时，每台电脑都放进同一个项目
    projects.forEach(function (p) {
      p.files.sort(function (a, b) { return COLL.compare(a.f, b.f); });
    });
    projects.sort(function (a, b) { return a.loose ? -1 : b.loose ? 1 : COLL.compare(a.name, b.name); });
    var total = projects.reduce(function (n, p) { return n + p.files.length; }, 0);
    return { projects: projects, skipped: skipped, mode: mode, info: info, total: total, items: items };
  }

  function skipRec(it, why, project) {
    return { rel: it.parts.join('/'), name: it.file.name, size: it.file.size, reason: why, project: project };
  }
  // IndexedDB 快取的 key：同一个档（路径 + 大小 + 修改时间）重扫不必重算 hash
  function fileKey(it) {
    return it.parts.join('/') + '|' + it.file.size + '|' + (it.file.lastModified || 0);
  }

  /* ---------- 来源一：<input webkitdirectory> ---------- */
  function fromFileList(list, opts) {
    var items = [];
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      var rel = String(f.webkitRelativePath || f.name).replace(/^\/+/, '');
      items.push({ file: f, parts: rel.split('/').filter(Boolean) });
    }
    return group(items, opts);
  }

  /* ---------- 来源二：拖放（FileSystemEntry） ---------- */
  // 一直读到空：Chrome 每次最多回 100 个
  function readAllEntries(dir) {
    return new Promise(function (resolve, reject) {
      var reader = dir.createReader();
      var out = [];
      (function next() {
        reader.readEntries(function (batch) {
          if (!batch || !batch.length) return resolve(out);
          for (var i = 0; i < batch.length; i++) out.push(batch[i]);
          next();
        }, reject);
      })();
    });
  }

  function entryFile(entry) {
    return new Promise(function (resolve, reject) { entry.file(resolve, reject); });
  }

  // 递回走完，收集 {file, parts}；读不到的档案放进 bad（之后列在略过清单）
  function walk(entry, prefix, acc, bad) {
    var parts = prefix.concat(entry.name);
    if (entry.isFile) {
      return entryFile(entry).then(function (file) { acc.push({ file: file, parts: parts }); },
        function () { bad.push({ rel: parts.join('/'), name: entry.name, size: 0, reason: 'unreadable', project: '' }); });
    }
    if (entry.isDirectory) {
      return readAllEntries(entry).then(function (kids) {
        // 一层一层依序读，免得几千个档同时开
        return kids.reduce(function (p, k) { return p.then(function () { return walk(k, parts, acc, bad); }); }, Promise.resolve());
      }, function () { bad.push({ rel: parts.join('/'), name: entry.name, size: 0, reason: 'unreadable', project: '' }); });
    }
    return Promise.resolve();
  }

  function fromEntries(entries, opts) {
    var acc = [], bad = [];
    return entries.reduce(function (p, e) {
      return p.then(function () { return e ? walk(e, [], acc, bad) : null; });
    }, Promise.resolve()).then(function () {
      var r = group(acc, opts);
      r.skipped = r.skipped.concat(bad);
      return r;
    });
  }

  // 拖放事件的 items → entries（一定要在 drop 事件里同步拿，之后就失效了）
  function entriesOf(dataTransfer) {
    var out = [], files = [];
    var items = dataTransfer && dataTransfer.items;
    if (items && items.length && typeof items[0].webkitGetAsEntry === 'function') {
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind !== 'file') continue;
        var e = items[i].webkitGetAsEntry();
        if (e) out.push(e);
      }
      return { entries: out, files: null };
    }
    // 不支援 entries 的浏览器：只拿得到散的档案
    var fl = dataTransfer && dataTransfer.files;
    for (var j = 0; fl && j < fl.length; j++) files.push(fl[j]);
    return { entries: null, files: files };
  }

  // 重新用另一种分法（预览里切换「一个项目 / 每个子文件夹」）
  function regroup(result, mode) {
    var r = group(result.items, { mode: mode });
    var bad = result.skipped.filter(function (s) { return s.reason === 'unreadable'; });
    r.skipped = r.skipped.concat(bad);
    return r;
  }

  MB.clScan = {
    MAX_SIZE: MAX_SIZE,
    REASONS: REASONS,
    classify: classify,
    group: group,
    regroup: regroup,
    fromFileList: fromFileList,
    fromEntries: fromEntries,
    readAllEntries: readAllEntries,
    entriesOf: entriesOf,
    isRoomish: function (s) { return ROOMISH.test(String(s || '').trim()); }
  };
})();
