/* ============================================================
   案例库 · 上传分页（upload）
   ------------------------------------------------------------
   选 / 拖文件夹 → 预览（项目、略过清单、已在库里几张、会用掉几次写入）→ 开始上传。

   流程（每张）：算 hash → 库里有了就跳过 → 压图（worker）→ POST /api/photo
              → 记进「已上传、未登记」日志（IndexedDB）→ 每 20 张 addPhotos 登记一次 → 删日志
   - 同时压 2 张、传 3 张；压好的最多先放 4 张（记忆体不会爆）。
   - 失败重试 3 次（等越来越久）；401 → 叫出登入框，登入后接着传。
   - 当掉 / 关掉 / 断线：日志里的照片下次打开自动补登记，再选同一个文件夹也不会重传。
   - IndexedDB 'caselib-v1'：
       files     路径|大小|修改时间 → h16（重扫不必重算 hash）
       pending   h16 → {k,sig,w,ht,sz,dh,f,name,pid,thumb}（已上传、未登记）
       committed h16 → {pid,rev,ts}（最近 15 分钟登记好的：公开 Blob 的 CDN 一分钟内可能还给旧清单，
                 重新整理后再拖一次，这些照片也不会被当成新的再传一次）
       packs     缩图包快取（审核页用，review.js）
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB;
  var CL = MB.cl;
  var $ = CL.$, $$ = CL.$$, esc = CL.esc;

  var PER_COMMIT = 20;          // 每 20 张登记一次（伺服器一次最多 40）
  var PROC_CONC = 2;            // 同时压几张（= worker 数）
  var UP_CONC = 3;              // 同时传几张
  var BUFFER = 4;               // 压好、等着传的最多几张
  var TRIES = 3;                // 失败重试几次
  var COMMIT_TRIES = 6;
  // Vercel Hobby 的 Blob 免费额度（约）：每月 2,000 次写入（put / copy）、1 GB 储存
  var LIMIT_WRITES = 2000;
  var LIMIT_BYTES = 1024 * 1024 * 1024;
  var EST_PHOTO = 500 * 1024;   // 1600px JPEG 平均约 0.3–0.7 MB
  var EST_THUMB = 30 * 1024;
  var BACKUPS = 7;              // 清单每天的备份按星期几轮流覆盖：最多 7 份
  var KEEP_DONE = 15 * 60 * 1000;

  /* ============================================================
     IndexedDB（打不开就只用记忆体，功能照样能用，只是不能续传）
     ============================================================ */
  var DB_NAME = 'caselib-v1';
  var dbp = null;
  var memDb = { files: {}, pending: {}, packs: {}, committed: {} };
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve) {
      var req;
      try { req = indexedDB.open(DB_NAME, 2); } catch (e) { return resolve(null); }
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains('files')) d.createObjectStore('files');
        if (!d.objectStoreNames.contains('pending')) d.createObjectStore('pending', { keyPath: 'h' });
        if (!d.objectStoreNames.contains('packs')) d.createObjectStore('packs');
        if (!d.objectStoreNames.contains('committed')) d.createObjectStore('committed', { keyPath: 'h' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return db().then(function (d) {
      if (!d) return fn(null);
      return new Promise(function (resolve, reject) {
        var t;
        try { t = d.transaction(store, mode); } catch (e) { return resolve(fn(null)); }
        var out = fn(t.objectStore(store));
        t.oncomplete = function () { resolve(out && typeof out === 'object' && 'result' in out ? out.result : out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('IndexedDB aborted')); };
      });
    });
  }
  var store = {
    get: function (s, key) {
      return tx(s, 'readonly', function (os) { return os ? os.get(key) : { result: memDb[s][key] }; });
    },
    // 一次读很多个 key（一个交易）→ {key: value}
    getMany: function (s, keys) {
      var reqs = {};
      return tx(s, 'readonly', function (os) {
        keys.forEach(function (k) { reqs[k] = os ? os.get(k) : { result: memDb[s][k] }; });
        return null;
      }).then(function () {
        var out = {};
        keys.forEach(function (k) { var v = reqs[k] && reqs[k].result; if (v !== undefined) out[k] = v; });
        return out;
      });
    },
    put: function (s, val, key) {
      return tx(s, 'readwrite', function (os) {
        if (!os) { memDb[s][key != null ? key : val.h] = val; return null; }
        if (key != null) os.put(val, key); else os.put(val);
        return null;
      });
    },
    del: function (s, key) {
      return tx(s, 'readwrite', function (os) { if (os) os.delete(key); else delete memDb[s][key]; return null; });
    },
    all: function (s) {
      return tx(s, 'readonly', function (os) {
        if (!os) return { result: Object.keys(memDb[s]).map(function (k) { return memDb[s][k]; }) };
        return os.getAll();
      }).then(function (r) { return r || []; });
    }
  };
  MB.clStore = store;

  /* ============================================================
     状态
     ============================================================ */
  var J = {};                   // 日志的记忆体副本：h → 记录
  var DONE = {};                // 最近登记好的：h → {pid, rev, ts}（清单还是 CDN 旧版时用）
  // 登记的排队：跟「这次选的文件夹」分开放 —— 开机补登记时再选文件夹，也不会把排队丢掉
  var CQ = { q: {}, queued: {}, busy: false, recovering: false, commits: 0 };
  var S = freshState();
  // 背景比对的世代：放在 S 外面，重选文件夹后旧的比对一定会停（不会刚好撞到新的号码）
  var hashGen = 0;
  function freshState() {
    return {
      scan: null, projects: [], items: [], byPid: {},
      firstByH: {}, hashing: false, hashedN: 0,
      running: false, paused: false, done: false, fatal: '', note: '',
      proc: 0, up: 0, buffer: [], cursor: 0,
      overBudgetOk: false, startedAt: 0, recent: [],
      counts: { uploaded: 0, committed: 0, known: 0, dup: 0, failed: 0, bad: 0 },
      errors: []
    };
  }

  function included() { return S.projects.filter(function (p) { return p.include && !p.recover; }); }
  function includedItems() {
    var out = [];
    included().forEach(function (p) { out = out.concat(p.items); });
    return out;
  }

  /* 这张照片算哪一类（要先有 h）：
     known 同项目已有 · dup 已在别的项目 / 这次重复 · journal 上次传了还没登记 · new 要传 */
  function category(it) {
    if (!it.h) return '';
    var ph = CL.cat && CL.cat.photos[it.h];
    if (ph) return ph.p === it.p.pid ? 'known' : 'dup';
    var d = recentDone(it.h);
    if (d) return d.pid === it.p.pid ? 'known' : 'dup';
    var j = J[it.h];
    if (j) return j.pid === it.p.pid ? 'journal' : 'dup';
    var first = S.firstByH[it.h];
    if (first && first !== it) return 'dup';
    return 'new';
  }
  function dupWhere(it) {
    var ph = CL.cat && CL.cat.photos[it.h];
    var d = recentDone(it.h);
    var pid = ph ? ph.p : d ? d.pid : J[it.h] ? J[it.h].pid : S.firstByH[it.h] ? S.firstByH[it.h].p.pid : '';
    var pr = pid && CL.cat && CL.cat.projects[pid];
    if (pr) return pr.name;
    var p = S.byPid[pid];
    return p ? p.name : '';
  }
  function recentDone(h) {
    var d = DONE[h];
    return d && Date.now() - d.ts < KEEP_DONE ? d : null;
  }
  // 「第一次出现」只看有勾选的项目、照顺序
  function rebuildFirst() {
    S.firstByH = {};
    includedItems().forEach(function (it) { if (it.h && !S.firstByH[it.h]) S.firstByH[it.h] = it; });
  }

  /* ---------- hash（先查 IndexedDB 快取） ---------- */
  function ensureHash(it) {
    if (it.h) return Promise.resolve(it.h);
    return MB.clWork.hash(it.file).then(function (r) {
      it.h = r.h;
      S.hashedN++;
      if (!S.firstByH[it.h] && it.p.include) S.firstByH[it.h] = it;
      store.put('files', { h: r.h, ts: Date.now() }, it.key).catch(function () { /* 快取失败不影响上传 */ });
      return it.h;
    });
  }

  function loadCached(items) {
    var keys = items.map(function (it) { return it.key; });
    return store.getMany('files', keys).then(function (m) {
      items.forEach(function (it) { if (m[it.key] && m[it.key].h) it.h = m[it.key].h; });
    }, function () { /* 没快取就全部重算 */ });
  }

  // 预览阶段在背景比对（2 个一起），开始上传时就停下来交给上传流程
  function hashAll() {
    var gen = ++hashGen;
    var list = includedItems().filter(function (it) { return !it.h; });
    if (!list.length) { S.hashing = false; return; }
    S.hashing = true;
    var i = 0, active = 0;
    function go() {
      if (gen !== hashGen) return;
      while (active < PROC_CONC && i < list.length) {
        var it = list[i++];
        active++;
        ensureHash(it).catch(function (e) { it.hashErr = e && e.message; }).then(function () {
          active--;
          render();
          go();
        });
      }
      if (!active && i >= list.length) { S.hashing = false; rebuildFirst(); render(); }
    }
    go();
  }

  /* ============================================================
     选好文件夹
     ============================================================ */
  function takeScan(result) {
    if (S.running) { CL.toast('上传中：请等这一批完成，或先暂停'); return; }
    hashGen++;
    S = freshState();
    S.scan = result;
    var seq = 0;
    var jobs = result.projects.map(function (sp) {
      var p = { name: sp.name, loose: !!sp.loose, pid: '', include: true, items: [], skipped: sp.skipped, existing: 0, hiddenProj: false };
      p.items = sp.files.map(function (f) {
        return { id: ++seq, p: p, file: f.file, f: f.f, rel: f.rel, key: f.key, h: '', st: 'wait', err: '', tries: 0 };
      });
      S.projects.push(p);
      S.items = S.items.concat(p.items);
      return setPid(p);
    });
    $('#plan').hidden = false;
    $('#run').hidden = true;
    $('#sum').hidden = true;
    render();
    Promise.all(jobs).then(function () {
      return loadCached(S.items);
    }).then(function () {
      rebuildFirst();
      render();
      // 先确定清单是最新的再比对（别人可能刚传过）
      return CL.loadCatalog().catch(function (e) { CL.toast(e.message, 4000); });
    }).then(function () {
      render();
      hashAll();
    });
  }

  function setPid(p) {
    var clean = CL.cleanName(p.name);
    if (!clean) { p.pid = ''; p.include = !p.loose ? false : p.include; return Promise.resolve(); }
    return CL.pidOf(clean).then(function (pid) {
      p.pid = pid;
      S.byPid[pid] = p;
    });
  }

  function onInput(ev) {
    var files = ev.target.files;
    if (!files || !files.length) return;
    var r = MB.clScan.fromFileList(files);
    ev.target.value = '';
    takeScan(r);
  }

  function onDrop(ev) {
    ev.preventDefault();
    $('#drop').classList.remove('over');
    if (S.running) { CL.toast('上传中：请等这一批完成'); return; }
    var got = MB.clScan.entriesOf(ev.dataTransfer);
    MB.clUpload.dropEntries(got);
  }

  /* ============================================================
     开始 / 暂停 / 继续
     ============================================================ */
  function startRun() {
    if (S.running) return;
    var ps = included();
    var bad = ps.filter(function (p) { return !p.pid; });
    if (bad.length) { CL.toast('请先填项目名'); var inp = $('#plan input.loose-name'); if (inp) inp.focus(); return; }
    var est = estimate();
    if (est.over && !S.overBudgetOk) { CL.toast('超过免费额度：请先勾掉几个项目，或勾选「我知道」'); return; }
    hashGen++;                 // 停掉背景比对，交给上传流程
    S.hashing = false;
    rebuildFirst();
    S.running = true;
    S.paused = false;
    S.done = false;
    S.startedAt = Date.now();
    S.cursor = 0;
    S.queue = includedItems();
    $('#plan').hidden = true;
    $('#run').hidden = false;
    $('#sum').hidden = true;
    wake(true);
    // 拿最新的清单再开始，免得重传别人刚传的
    CL.loadCatalog().catch(function () { /* 拿不到就用手上的 */ }).then(function () {
      render();
      pump();
    });
  }

  function pause() {
    if (!S.running) return;
    S.paused = !S.paused;
    if (S.paused) {
      wake(false);
      S.note = '已暂停：正在传的几张传完、登记好就停。';
      scheduleCommits();
    } else {
      S.note = '';
      wake(true);
      pump();
    }
    render();
  }

  /* ---------- 排程 ---------- */
  function nextWaiting() {
    var q = S.queue || [];
    while (S.cursor < q.length && q[S.cursor].st !== 'wait') S.cursor++;
    return S.cursor < q.length ? q[S.cursor] : null;
  }

  function pump() {
    if (!S.running) return;
    if (!S.paused && !S.fatal) {
      while (S.proc < PROC_CONC && S.buffer.length + S.proc < BUFFER + PROC_CONC) {
        var it = nextWaiting();
        if (!it) break;
        startItem(it);
      }
      while (S.up < UP_CONC && S.buffer.length) upload(S.buffer.shift());
    }
    scheduleCommits();
    maybeFinish();
  }

  function startItem(it) {
    it.st = 'proc';
    S.proc++;
    ensureHash(it).then(function () {
      var c = category(it);
      if (c !== 'new') { settle(it, c); return; }
      S.firstByH[it.h] = it;
      return MB.clWork.process(it.file, { h: it.h, maxBytes: MB.clUpload.maxBytes }).then(function (res) {
        if (res.h !== it.h) throw new Error('hash 不一致');
        it.res = res;
        it.w = res.w; it.ht = res.ht;
        CL.keepThumb(it.h, res.thumb);
        it.st = 'ready';
        S.buffer.push(it);
      });
    }).catch(function (e) {
      if (e && (e.code === 'decode' || e.code === 'too_large')) {
        it.st = 'bad';
        it.err = e.code === 'decode' ? '图片读不出来（档案坏了，或其实不是照片）' : '压缩后还是太大';
        S.counts.bad++;
      } else {
        it.st = 'fail';
        it.err = '处理失败：' + ((e && e.message) || e);
        S.counts.failed++;
      }
    }).then(function () {
      S.proc--;
      render();
      pump();
    });
  }

  function settle(it, c) {
    if (c === 'known') { it.st = 'known'; S.counts.known++; }
    else if (c === 'dup') { it.st = 'dup'; it.dupOf = dupWhere(it); S.counts.dup++; }
    else if (c === 'journal') {
      // 上次传好了还没登记：不用再传，直接登记
      it.st = 'journal';
      queueCommit(it.p, J[it.h]);
    }
  }

  /* ---------- 上传一张 ---------- */
  function waitOnline() {
    if (navigator.onLine !== false) return Promise.resolve();
    S.note = '网路断了：连上之后会自动继续。';
    render();
    return new Promise(function (resolve) {
      window.addEventListener('online', function on() {
        window.removeEventListener('online', on);
        S.note = '';
        resolve();
      });
    });
  }

  function describe(r) {
    if (!r) return '未知错误';
    if (r.status === 0) return '网路连不上';
    var e = r.json && r.json.error;
    if (r.status === 413) return '档案太大（' + (e || 413) + '）';
    if (r.status === 415) return '不是 JPEG（' + (e || 415) + '）';
    if (r.status === 500 && e === 'storage') return '储存出错：' + ((r.json && r.json.message) || '');
    if (e === 'storage_busy') return 'Blob 太忙（限流）';
    if (e === 'storage_timeout') return 'Blob 太久没回应';
    if (e === 'storage_blocked') return 'Blob 不让写入：' + ((r.json && r.json.message) || '');
    return '伺服器回 ' + r.status + (e ? ' ' + e : '');
  }
  function retryable(r) {
    return r.status === 0 || r.status === 408 || r.status === 409 || r.status === 429 || r.status >= 500;
  }
  // store 被暂停 / 没权限 / 不存在（多半是这个月的免费额度用完了）：重试也没用，整批停下来、讲清楚
  function blocked(r) { return !!(r && r.json && r.json.error === 'storage_blocked'); }
  function blockedError(r) {
    var e = new Error('Vercel Blob 暂停了写入 —— 多半是这个月的免费额度用完了，或 Blob store 被停用 / 没接好。' +
      '已传好的照片都记在这台电脑，之后（下个月、或老板处理好）再拖一次同一个文件夹就会接着传，不会重传。' +
      '（' + ((r.json && r.json.message) || 'storage_blocked') + '）');
    e.fatal = true;
    return e;
  }
  // 限流（429）：照伺服器说的秒数等（最多 2 分钟）；没说就照一般的退避
  function waitMs(r, n, base, max) {
    var s = r && r.status === 429 && r.json && +r.json.retryAfter;
    return s > 0 ? Math.min(120, s) * 1000 + Math.round(Math.random() * 1000) : CL.backoff(n, base, max);
  }

  function sendPhoto(it) {
    var attempt = 0;
    function loop() {
      return waitOnline().then(function () {
        return CL.api('POST', '/api/photo?h=' + it.h, it.res.jpeg, { type: 'image/jpeg' });
      }).then(function (r) {
        if (r.status === 200 && r.json && r.json.k) return r.json;
        if (r.status === 401) { S.note = '登入过期：请再登入一次，登入后会接着传。'; render(); return CL.needLogin().then(function () { S.note = ''; return loop(); }); }
        if (r.status === 0 && navigator.onLine === false) return loop();
        if (blocked(r)) throw blockedError(r);
        if (retryable(r) && attempt < TRIES) {
          var ms = waitMs(r, attempt, 1500, 20000);
          attempt++;
          it.tries = attempt;
          S.note = describe(r) + '：' + Math.round(ms / 1000) + ' 秒后重试（第 ' + attempt + ' / ' + TRIES + ' 次）';
          render();
          return CL.sleep(ms).then(function () { S.note = ''; return loop(); });
        }
        throw new Error(describe(r));
      });
    }
    return loop();
  }

  function upload(it) {
    it.st = 'up';
    S.up++;
    render();
    sendPhoto(it).then(function (j) {
      var res = it.res, k = j.k;
      // sig：伺服器的签章，登记时要带回去（证明这张真的传过）
      var rec = { h: it.h, k: k, sig: j.sig || '', w: res.w, ht: res.ht, sz: res.sz, dh: res.dh, f: it.f, name: CL.cleanName(it.p.name), pid: it.p.pid, thumb: res.thumb || '', ts: Date.now() };
      // 先记日志再算「已上传」：这时就算当掉，下次也不会重传
      return store.put('pending', rec).catch(function () { /* 记不进去也照样登记，只是不能续传 */ }).then(function () {
        J[it.h] = rec;
        it.k = k;
        it.res = null;           // 放掉 JPEG 的记忆体
        it.st = 'journal';
        S.counts.uploaded++;
        S.recent.unshift(it.h);
        if (S.recent.length > 12) S.recent.length = 12;
        queueCommit(it.p, rec);
      });
    }).catch(function (e) {
      if (e && e.fatal) {
        // 整批停：这张放回「等待」，下次再传
        it.st = 'wait';
        it.res = null;
        if (!S.fatal) { S.fatal = e.message; wake(false); }
        return;
      }
      it.st = 'fail';
      it.err = (e && e.message) || String(e);
      it.res = null;
      S.counts.failed++;
    }).then(function () {
      S.up--;
      render();
      pump();
    });
  }

  /* ---------- 登记（addPhotos） ---------- */
  // later：先全部排进去再一次登记（开机补登记时，免得第一张就自己登记一次、多用 2 次写入）
  function queueCommit(p, rec, later) {
    if (!rec || CQ.queued[rec.h]) return;
    CQ.queued[rec.h] = 1;
    var q = CQ.q[rec.pid] || (CQ.q[rec.pid] = { p: p, name: rec.name, recs: [] });
    if (p && p.items) q.p = p;
    q.recs.push(rec);
    if (!later) scheduleCommits();
  }

  // 这个项目还有没有照片在路上（没有了就把剩下不到 20 张的也登记）
  function settled(p) {
    if (!p || !p.items) return true;
    for (var i = 0; i < p.items.length; i++) {
      var st = p.items[i].st;
      if (p.include && (st === 'wait' || st === 'proc' || st === 'ready' || st === 'up')) return false;
    }
    return true;
  }

  function scheduleCommits() {
    if (CQ.busy || S.fatal) return;
    var pick = null;
    Object.keys(CQ.q).forEach(function (pid) {
      var q = CQ.q[pid];
      if (pick || !q.recs.length || q.wait > Date.now()) return;
      if (q.recs.length >= PER_COMMIT || settled(q.p) || S.paused || !S.running) pick = q;
    });
    if (!pick) return;
    CQ.busy = true;
    var batch = pick.recs.slice(0, PER_COMMIT);
    commit(pick.name, batch).then(function (out) {
      pick.recs = pick.recs.filter(function (r) { return batch.indexOf(r) < 0; });
      applyCommit(pick, batch, out);
    }, function (e) {
      if (e && e.fatal) {
        S.fatal = e.message;
        wake(false);
      } else if (e && e.dropH) {
        // 这一张的资料不合格：拿掉它，其它的下一轮再登记
        pick.recs = pick.recs.filter(function (r) { return r.h !== e.dropH; });
        delete J[e.dropH];
        delete CQ.queued[e.dropH];
        store.del('pending', e.dropH).catch(function () { /* 下次开机会再试，伺服器会再挡 */ });
        S.errors.push('登记被拒绝（' + e.dropH + '）：' + e.message);
      } else {
        // 一直失败：资料留在日志里（这台电脑），下次打开自动补登记；这一轮先跳过它
        pick.wait = Date.now() + 60000;
        pick.failedOnce = true;
        S.errors.push('登记「' + pick.name + '」暂时失败：' + ((e && e.message) || e) + '。资料留在这台电脑，之后会自动补登记。');
        setTimeout(function () { scheduleCommits(); maybeFinish(); }, 60500);
      }
    }).then(function () {
      CQ.busy = false;
      render();
      scheduleCommits();
      maybeFinish();
    });
  }

  function commit(name, recs) {
    var body = { op: 'addPhotos', project: { name: name }, photos: [], thumbs: {} };
    recs.forEach(function (r) {
      body.photos.push({ h: r.h, k: r.k, sig: r.sig || '', w: r.w, ht: r.ht, sz: r.sz, dh: r.dh, f: r.f });
      if (r.thumb) body.thumbs[r.h] = r.thumb;
    });
    var attempt = 0;
    function loop() {
      S.note = S.paused ? S.note : '登记中（' + recs.length + ' 张）…';
      return waitOnline().then(function () { return CL.api('POST', '/api/catalog', body); }).then(function (r) {
        if (r.status === 200 && r.json) { if (!S.paused) S.note = ''; return r.json; }
        if (r.status === 401) { S.note = '登入过期：请再登入一次，登入后会接着登记。'; render(); return CL.needLogin().then(loop); }
        if (r.status === 413 && r.json && r.json.error === 'index_too_large') {
          var fe = new Error('清单已经到上限（3.5 MB），不能再登记。照片都还在，请联络负责的同事处理。');
          fe.fatal = true;
          throw fe;
        }
        if (blocked(r)) throw blockedError(r);
        if (r.status === 400 && r.json && r.json.h) {
          var de = new Error(describe(r) + (r.json.field ? '（' + r.json.field + '）' : ''));
          de.dropH = r.json.h;
          throw de;
        }
        if (retryable(r) && attempt < COMMIT_TRIES) {
          var ms = waitMs(r, attempt, 1500, 30000);
          attempt++;
          S.note = '登记' + (r.status === 409 ? '撞到别人也在写' : '失败（' + describe(r) + '）') + '：' + Math.round(ms / 1000) + ' 秒后重试';
          render();
          return CL.sleep(ms).then(loop);
        }
        throw new Error(describe(r));
      });
    }
    return loop();
  }

  function applyCommit(q, batch, out) {
    CQ.commits++;
    CL.bumpRev(out.rev);
    // 本地的写入计数先加上（伺服器那边已经记了；CDN 可能一分钟内还给旧清单）：照片 + 缩图包 + 清单
    if ((out.added || []).length) CL.addWrites(out.added.length + 2);
    var added = {}, dup = {};
    (out.added || []).forEach(function (h) { added[h] = 1; });
    (out.dup || []).forEach(function (h) { dup[h] = 1; });
    var cat = CL.cat;
    if (cat && out.pid && !cat.projects[out.pid]) {
      cat.projects[out.pid] = { name: q.name, area: '', ptype: '', traits: [], style: '', packs: [], n: 0, by: CL.me, ts: Date.now() };
    }
    var now = Date.now();
    batch.forEach(function (r) {
      delete J[r.h];
      delete CQ.queued[r.h];
      store.del('pending', r.h).catch(function () { /* 留着也没关系：下次登记伺服器会当成已有 */ });
      if (!dup[r.h]) {
        // 记下「刚登记好」：重新整理后 CDN 可能还给旧清单，这些照片不能又被当成新的
        var d = { h: r.h, pid: out.pid || r.pid, rev: out.rev | 0, ts: now };
        DONE[r.h] = d;
        store.put('committed', d).catch(function () { /* 记不进去：最多重传几张 */ });
      }
      CL.keepThumb(r.h, r.thumb);
      // 本地清单先补上（公开 Blob 的 CDN 可能一分钟内还给旧版清单）
      if (cat && !cat.photos[r.h] && (added[r.h] || !dup[r.h])) {
        cat.photos[r.h] = { p: out.pid || r.pid, k: r.k, w: r.w, h: r.ht, sz: r.sz, dh: r.dh, shot: r.h, f: r.f, room: '', cabinets: [], style: '', hero: false, desc: { zh: '', en: '' }, status: 'new', by: CL.me, ts: Date.now() };
      }
      var it = findItem(r.h, r.pid);
      if (dup[r.h]) {
        if (it) { it.st = 'dup'; it.dupOf = dupWhere(it); }
        S.counts.dup++;
      } else {
        if (it) it.st = 'done';
        S.counts.committed++;
      }
    });
    if (cat && out.pid && cat.projects[out.pid]) {
      cat.projects[out.pid].n = Object.keys(cat.photos).filter(function (h) { return cat.photos[h].p === out.pid; }).length;
    }
    CL.emit('catalog-local', cat);
  }

  function findItem(h, pid) {
    var p = S.byPid[pid];
    if (!p || !p.items) return null;
    for (var i = 0; i < p.items.length; i++) if (p.items[i].h === h) return p.items[i];
    return null;
  }

  function pendingCommits() {
    return Object.keys(CQ.q).reduce(function (n, pid) { return n + CQ.q[pid].recs.length; }, 0);
  }

  function maybeFinish() {
    if (!S.running) {
      // 没在上传（例：开机补登记）：登记完就更新提示
      if (!CQ.busy && !pendingCommits() && CQ.recovering) { CQ.recovering = false; recoverDone(); }
      return;
    }
    if (S.proc || S.up || CQ.busy) return;
    if (S.fatal) {
      // 停下来了：压好、还没传的放回「等待」（放掉记忆体），不然会一直等它们传完
      S.buffer.forEach(function (it) { it.st = 'wait'; it.res = null; });
      S.buffer = [];
      finish();
      return;
    }
    if (S.buffer.length) return;
    if (S.paused) return;
    if (nextWaiting()) return;
    var waiting = Object.keys(CQ.q).some(function (pid) { var q = CQ.q[pid]; return q.recs.length && !(q.wait > Date.now()); });
    if (waiting) return;
    finish();
  }

  function finish() {
    S.running = false;
    S.done = true;
    S.paused = false;
    wake(false);
    $('#run').hidden = false;
    $('#sum').hidden = false;
    draw();
    // 拿伺服器的版本（shot 分组、缩图包路径）；CDN 还是旧版的话 loadCatalog 会保留本地的
    CL.loadCatalog().catch(function () { /* 下次再拿 */ }).then(render);
  }

  /* ---------- 开机：补登记上次没登记的 ---------- */
  function recover() {
    // 最近登记好的：放回 DONE，也把 minRev 设回去（拿到比它旧的清单 = CDN 还没更新）；过期的删掉
    store.all('committed').then(function (list) {
      var now = Date.now(), top = 0;
      list.forEach(function (d) {
        if (!d || !d.h) return;
        if (now - d.ts >= KEEP_DONE) { store.del('committed', d.h).catch(function () { /* 下次再删 */ }); return; }
        DONE[d.h] = d;
        if ((d.rev | 0) > top) top = d.rev | 0;
      });
      if (top) CL.bumpRev(top);
      if (list.length && S.scan) render();
    }, function () { /* 读不到就算了 */ });
    return store.all('pending').then(function (list) {
      list.forEach(function (r) { if (r && r.h) J[r.h] = r; });
      var n = list.length;
      if (!n) return;
      CQ.recovering = true;
      var box = $('#up-recover');
      box.hidden = false;
      box.innerHTML = '<span>上次有 <b>' + n + '</b> 张已上传、还没登记，正在补登记…（不会重传）</span>';
      list.forEach(function (r) {
        queueCommit(S.byPid[r.pid] || { name: r.name, pid: r.pid, recover: true, include: true }, r, true);
      });
      scheduleCommits();
    });
  }
  function recoverDone() {
    var box = $('#up-recover');
    var left = Object.keys(J).length;
    box.hidden = false;
    box.innerHTML = left ? '<span>还有 ' + left + ' 张没登记成功，等一下会再试。</span>' : '<span>上次没登记的照片都补登记好了 ✓</span>';
    CL.loadCatalog().catch(function () { /* 下次再拿 */ });
  }

  /* ---------- 萤幕不睡 ---------- */
  var lock = null;
  function wake(on) {
    if (!navigator.wakeLock) return;
    if (on) {
      if (lock || document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(function (l) {
        lock = l;
        l.addEventListener('release', function () { lock = null; });
      }).catch(function () { /* 省电模式等：不影响上传 */ });
    } else if (lock) {
      lock.release().catch(function () { /* 已经放掉了 */ });
      lock = null;
    }
  }

  /* ============================================================
     估算：写入次数、容量，跟免费额度比
     ============================================================ */
  // 清单本身多大（备份是整份复制）：同一版只算一次
  var sizeOf = { rev: -1, n: -1, bytes: 0 };
  function indexBytes(cat) {
    var n = Object.keys(cat.photos || {}).length;
    if (sizeOf.rev !== (cat.rev | 0) || sizeOf.n !== n) {
      var b = 0;
      try { b = JSON.stringify(cat).length; } catch (e) { b = n * 500; }
      sizeOf = { rev: cat.rev | 0, n: n, bytes: b };
    }
    return sizeOf.bytes;
  }
  function usage() {
    var cat = CL.cat || { photos: {}, log: [] };
    var days = {};
    // 这个月的写入次数：伺服器在清单里记的（每次写入都算）；旧清单没有才从操作纪录估（只剩最近 300 笔，会少算）
    var writes = CL.monthWrites(cat);
    (cat.log || []).forEach(function (e) { if (e && e.ts) days[new Date(e.ts).toISOString().slice(0, 10)] = 1; });
    var bytes = 0, n = 0;
    Object.keys(cat.photos || {}).forEach(function (h) { bytes += cat.photos[h].sz || 0; n++; });
    var avg = n ? bytes / n : EST_PHOTO;
    bytes += n * EST_THUMB;
    bytes += BACKUPS * indexBytes(cat);         // 每天的备份（最多 7 份整份清单）
    var today = new Date().toISOString().slice(0, 10);
    return { writes: writes, bytes: bytes, photos: n, avg: avg, wroteToday: !!days[today] };
  }

  function projStats(p) {
    var s = { total: p.items.length, fresh: 0, known: 0, dup: 0, unknown: 0, done: 0, fail: 0, bad: 0, active: 0 };
    p.items.forEach(function (it) {
      var st = it.st;
      if (st === 'done' || st === 'journal') s.done++;
      else if (st === 'known') s.known++;
      else if (st === 'dup') s.dup++;
      else if (st === 'fail') s.fail++;
      else if (st === 'bad') s.bad++;
      else if (st === 'proc' || st === 'up' || st === 'ready') s.active++;
      if (st !== 'wait') return;
      if (!it.h) { s.unknown++; return; }
      var c = p.include ? category(it) : '';
      if (c === 'known') s.known++;
      else if (c === 'dup') s.dup++;
      else s.fresh++;
    });
    return s;
  }

  function estimate() {
    var u = usage();
    var photos = 0, packs = 0;
    included().forEach(function (p) {
      var st = projStats(p);
      var n = st.fresh + st.unknown;
      photos += n;
      packs += Math.ceil(n / PER_COMMIT);
    });
    var writes = photos + packs * 2 + (photos && !u.wroteToday ? 1 : 0);
    var bytes = photos * (u.avg + EST_THUMB);
    var over = u.writes + writes > LIMIT_WRITES || u.bytes + bytes > LIMIT_BYTES;
    // 这个月还能传几张（每 20 张多 2 次写入）
    var room = Math.max(0, Math.floor((LIMIT_WRITES - u.writes - 1) * PER_COMMIT / (PER_COMMIT + 2)));
    return { u: u, photos: photos, writes: writes, bytes: bytes, over: over, room: room };
  }

  /* ============================================================
     画面
     ============================================================ */
  var rq = 0, lastDraw = 0;
  function render() {
    if (rq) return;
    var wait = Math.max(0, 200 - (Date.now() - lastDraw));
    rq = setTimeout(function () {
      rq = 0;
      lastDraw = Date.now();
      draw();
    }, wait);
  }
  // 测试 / 截图用：马上画
  function draw() {
    if (S.scan && !$('#plan').hidden) drawPlan();
    if (!$('#run').hidden) drawRun();
    if (!$('#sum').hidden) drawSum();
    $('#drop').classList.toggle('busy', !!S.running);
  }

  function bar(frac, cls) {
    var pct = Math.max(0, Math.min(100, Math.round(frac * 1000) / 10));
    return '<span class="cl-bar ' + (cls || '') + '"><i style="width:' + pct + '%"></i></span>';
  }

  function drawPlan() {
    var sc = S.scan;
    var ps = S.projects;
    var est = estimate();
    var u = est.u;
    var allStats = ps.map(projStats);
    var nPhotos = 0, nFresh = 0, nKnown = 0, nDup = 0, nUnknown = 0;
    ps.forEach(function (p, i) {
      if (!p.include) return;
      var st = allStats[i];
      nPhotos += st.total; nFresh += st.fresh; nKnown += st.known; nDup += st.dup; nUnknown += st.unknown;
    });
    var totalItems = includedItems().length;
    var hashedAll = totalItems - nUnknown;
    var html = '';

    html += '<div class="plan-head">' +
      '<div><h3>准备上传</h3><p class="hint">' + ps.length + ' 个项目 · ' + CL.n(sc.total) + ' 张照片' +
      (sc.skipped.length ? ' · 略过 ' + sc.skipped.length + ' 个档' : '') + '</p></div>' +
      '<div class="plan-go">' + startButton(est, nFresh + nUnknown) + '</div></div>';

    // 一个文件夹：是一个项目，还是很多项目？
    if (sc.info && sc.info.canSplit) {
      var single = sc.mode !== 'split';
      html += '<div class="seg-row"><span class="muted">「' + esc(sc.info.root) + '」是：</span>' +
        '<div class="seg"><button type="button" data-mode="split" aria-pressed="' + (!single) + '">装着很多项目的总文件夹（' + sc.info.subs + ' 个子文件夹 = ' + sc.info.subs + ' 个项目）</button>' +
        '<button type="button" data-mode="single" aria-pressed="' + single + '">一个项目（子文件夹是空间）</button></div></div>';
    }

    // 比对进度
    if (totalItems) {
      html += '<div class="hash-line">' + (nUnknown ?
        bar(hashedAll / totalItems) + '<span>比对中 ' + CL.n(hashedAll) + ' / ' + CL.n(totalItems) + ' —— 看哪些已经在库里（同一个文件夹第二次会快很多）</span>' :
        '<span class="ok">✓ 比对完成：<b>' + CL.n(nFresh) + '</b> 张新照片 · 已在库里 ' + CL.n(nKnown) + ' 张' + (nDup ? ' · 重复 ' + nDup + ' 张（同一张已在别的项目，只存一次）' : '') + '</span>') +
        '</div>';
    }

    // 项目表
    html += '<div class="cl-table-wrap"><table class="cl-table"><thead><tr><th class="c-chk"></th><th>项目（文件夹名）</th><th class="num">照片</th><th class="num">新</th><th class="num">已在库里</th><th class="num">重复</th><th>备注</th></tr></thead><tbody>';
    ps.forEach(function (p, i) {
      var st = allStats[i];
      var ex = p.pid && CL.cat && CL.cat.projects[p.pid];
      var note = [];
      if (ex) note.push('<span class="tag merge">已有同名项目 ' + (ex.n | 0) + ' 张，将合并</span>');
      if (ex && ex.hidden) note.push('<span class="tag warn">这个项目已隐藏</span>');
      if (p.skipped.length) note.push('<span class="tag">略过 ' + p.skipped.length + '</span>');
      if (!st.total) note.push('<span class="tag warn">没有可上传的照片</span>');
      var nameCell = p.loose ?
        '<input class="loose-name" type="text" data-i="' + i + '" placeholder="这些照片属于哪个项目？例：区域 风格 客户名" value="' + esc(p.name) + '" />' :
        '<b>' + esc(p.name) + '</b>';
      html += '<tr class="' + (p.include ? '' : 'off') + '"><td class="c-chk"><input type="checkbox" data-inc="' + i + '"' + (p.include ? ' checked' : '') + (st.total ? '' : ' disabled') + ' aria-label="上传这个项目" /></td>' +
        '<td class="c-name">' + nameCell + '</td>' +
        '<td class="num">' + st.total + '</td>' +
        '<td class="num">' + (st.unknown ? '<span class="muted">' + (st.fresh + st.unknown) + '?</span>' : st.fresh) + '</td>' +
        '<td class="num">' + (st.known || '') + '</td>' +
        '<td class="num">' + (st.dup || '') + '</td>' +
        '<td class="c-note">' + note.join(' ') + '</td></tr>';
    });
    html += '</tbody></table></div>';

    // 额度
    html += budgetBox(est);
    html += skippedBox(sc.skipped);
    $('#plan-body').innerHTML = html;
  }

  function startButton(est, n) {
    var hashing = S.hashing;
    if (!n && !hashing) return '<button class="btn" type="button" id="start" disabled>没有新照片要传</button>';
    return '<button class="btn gold" type="button" id="start"' + (est.over && !S.overBudgetOk ? ' disabled' : '') + '>开始上传 ' +
      (hashing ? '约 ' : '') + CL.n(n) + ' 张</button>';
  }

  function budgetBox(est) {
    var u = est.u;
    var wTotal = u.writes + est.writes;
    var bTotal = u.bytes + est.bytes;
    var html = '<div class="budget' + (est.over ? ' over' : '') + '">' +
      '<p class="sub-h">Vercel 免费额度（Hobby）· 估算</p>' +
      '<div class="b-row"><span>写入次数 / 月</span>' + bar(wTotal / LIMIT_WRITES, wTotal > LIMIT_WRITES ? 'bad' : '') +
      '<span class="b-num">本月已用约 ' + CL.n(u.writes) + ' + 这次约 <b>' + CL.n(est.writes) + '</b> = ' + CL.n(wTotal) + ' / ' + CL.n(LIMIT_WRITES) + '</span></div>' +
      '<div class="b-row"><span>储存空间</span>' + bar(bTotal / LIMIT_BYTES, bTotal > LIMIT_BYTES ? 'bad' : '') +
      '<span class="b-num">已用约 ' + CL.mb(u.bytes) + ' + 这次约 <b>' + CL.mb(est.bytes) + '</b> = ' + CL.mb(bTotal) + ' / 1 GB</span></div>' +
      '<p class="b-note">每张照片 1 次写入，每 20 张多 2 次（缩图包 + 清单）。</p>';
    if (est.over) {
      html += '<div class="b-warn"><b>⚠ 超过免费额度</b>超过的话 Vercel 可能暂停写入到下个月。建议这次先勾掉几个项目' +
        (est.room ? '（这个月大约还能传 ' + CL.n(est.room) + ' 张）' : '') + '，下个月再传；或请老板升级 Pro。' +
        '<label class="chk"><input type="checkbox" id="over-ok"' + (S.overBudgetOk ? ' checked' : '') + ' /> 我知道，照样上传</label></div>';
    }
    return html + '</div>';
  }

  function skippedBox(list) {
    if (!list.length) return '';
    var by = {}, order = [];
    list.forEach(function (s) {
      if (!by[s.reason]) { by[s.reason] = []; order.push(s.reason); }
      by[s.reason].push(s);
    });
    // 要处理的（HEIC、RAW）放前面，系统档放最后
    var rank = { heic: 0, raw: 1, big: 2, video: 3, other: 4, loose: 5, unreadable: 6, empty: 7, bad: 8, junk: 9 };
    order.sort(function (a, b) { return (rank[a] == null ? 5 : rank[a]) - (rank[b] == null ? 5 : rank[b]); });
    var html = '<div class="skipped"><p class="sub-h">略过的档案（' + list.length + '）</p>';
    if (by.heic) html += '<p class="note-line">有 ' + by.heic.length + ' 张 iPhone 的 HEIC 照片：请在电脑上打开后另存为 JPG，放回同一个文件夹，再拖一次（已传的不会重传）。</p>';
    order.forEach(function (r) {
      var info = MB.clScan.REASONS[r] || { zh: r, tip: '' };
      var items = by[r];
      html += '<details' + (r === 'heic' || r === 'raw' ? ' open' : '') + ' data-reason="' + esc(r) + '"><summary><b>' + esc(info.zh) + '</b> · ' + items.length + ' 个' +
        (info.tip ? '<span class="muted"> —— ' + esc(info.tip) + '</span>' : '') + '</summary><ul>';
      items.slice(0, 300).forEach(function (s) {
        html += '<li>' + esc(s.rel) + (s.size > 1048576 ? ' <span class="muted">' + CL.mb(s.size) + '</span>' : '') + '</li>';
      });
      if (items.length > 300) html += '<li class="muted">…还有 ' + (items.length - 300) + ' 个</li>';
      html += '</ul></details>';
    });
    return html + '</div>';
  }

  function drawRun() {
    var c = S.counts;
    var items = S.queue || includedItems();
    var total = items.length;
    var fin = 0;
    items.forEach(function (it) { if (it.st === 'done' || it.st === 'known' || it.st === 'dup' || it.st === 'fail' || it.st === 'bad' || it.st === 'journal') fin++; });
    var skippedN = (S.scan ? S.scan.skipped.length : 0) + c.bad;
    var state = S.fatal ? '已停止' : S.done ? '完成' : S.paused ? '已暂停' : '上传中';
    var html = '<div class="run-head"><div><h3>' + state + (S.done && !S.fatal ? ' ✓' : '') + '</h3>' +
      '<p class="hint" id="run-note" aria-live="polite">' + esc(S.fatal || S.note || (S.done ? '全部处理完了。' : CQ.busy ? '登记中…' : '照片在这台电脑先压成 1600px 再传，原档不动。')) + '</p></div>' +
      (S.done ? '' : '<button class="btn ghost" type="button" id="pause">' + (S.paused ? '▶ 继续' : 'Ⅱ 暂停') + '</button>') + '</div>';
    html += '<div class="run-total">' + bar(total ? fin / total : 1, S.fatal ? 'bad' : '') + '<span>' + CL.n(fin) + ' / ' + CL.n(total) + ' 张</span></div>';
    html += '<div class="counts">' +
      cnt('uploaded', '已上传', c.uploaded, c.uploaded > c.committed ? '已登记 ' + c.committed : '') +
      cnt('known', '已在库里', c.known) + cnt('dup', '重复', c.dup) +
      cnt('skipped', '略过', skippedN) + cnt('failed', '失败', c.failed, '', c.failed ? 'bad' : '') + '</div>';
    if (S.recent.length) {
      html += '<div class="recent">' + S.recent.map(function (h) {
        return CL.thumbs[h] ? '<img src="' + CL.thumbs[h] + '" alt="" />' : '';
      }).join('') + '</div>';
    }
    html += '<div class="run-projects">';
    included().forEach(function (p) {
      var st = projStats(p);
      var doneN = st.done + st.known + st.dup + st.fail + st.bad;
      var label = doneN >= st.total ? (st.fail ? '<span class="tag warn">有失败</span>' : '<span class="tag ok">完成 ✓</span>') :
        st.active ? '<span class="tag on">进行中</span>' : '<span class="tag">等待</span>';
      html += '<div class="rp"><div class="rp-top"><b>' + esc(p.name) + '</b>' + label + '</div>' +
        bar(st.total ? doneN / st.total : 1) +
        '<span class="rp-n">' + doneN + ' / ' + st.total +
        (st.known ? ' · 已有 ' + st.known : '') + (st.dup ? ' · 重复 ' + st.dup : '') +
        (st.fail ? ' · <em>失败 ' + st.fail + '</em>' : '') + (st.bad ? ' · 读不出 ' + st.bad : '') + '</span></div>';
    });
    html += '</div>';
    $('#run-body').innerHTML = html;
  }

  function cnt(key, label, n, sub, cls) {
    return '<div class="cnt ' + (cls || '') + '" data-count="' + key + '"><b>' + CL.n(n) + '</b><span>' + label + '</span>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
  }

  function drawSum() {
    var c = S.counts;
    var items = S.queue || [];
    var fails = items.filter(function (it) { return it.st === 'fail'; });
    var bads = items.filter(function (it) { return it.st === 'bad'; });
    var dups = items.filter(function (it) { return it.st === 'dup'; });
    var projN = included().filter(function (p) { return p.items.some(function (it) { return it.st === 'done'; }); }).length;
    var mins = Math.max(1, Math.round((Date.now() - S.startedAt) / 60000));
    var html = '<div class="sum-card">' +
      '<h3>' + (S.fatal ? '上传停止了' : '这次新增 <span class="num">' + CL.n(c.committed) + '</span> 张') + '</h3>' +
      '<p>' + (S.fatal ? esc(S.fatal) : projN + ' 个项目 · 约 ' + mins + ' 分钟') + '</p><ul class="sum-list">' +
      '<li>已在库里（之前传过）<b>' + CL.n(c.known) + '</b></li>' +
      '<li>重复（同一张已在别的项目，只存一次）<b>' + CL.n(c.dup) + '</b></li>' +
      '<li>略过（HEIC、影片、系统档…）<b>' + CL.n((S.scan ? S.scan.skipped.length : 0) + c.bad) + '</b></li>' +
      '<li>失败<b>' + CL.n(c.failed) + '</b></li></ul>';
    if (dups.length) {
      html += '<details><summary>重复的照片（' + dups.length + '）</summary><ul class="fail-list">' + dups.map(function (it) {
        return '<li>' + esc(it.p.name + '/' + it.f) + (it.dupOf ? ' <span class="muted">→ 已在「' + esc(it.dupOf) + '」</span>' : '') + '</li>';
      }).join('') + '</ul></details>';
    }
    if (fails.length || bads.length) {
      html += '<details open><summary>没传成功的（' + (fails.length + bads.length) + '）</summary><ul class="fail-list">' +
        fails.concat(bads).map(function (it) { return '<li>' + esc(it.p.name + '/' + it.f) + ' <span class="muted">' + esc(it.err) + '</span></li>'; }).join('') + '</ul></details>';
    }
    if (S.errors.length) html += '<ul class="fail-list">' + S.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>';
    html += '<div class="btn-row">' + (fails.length ? '<button class="btn gold" type="button" id="retry-failed">重试失败的 ' + fails.length + ' 张</button>' : '') +
      '<button class="btn" type="button" id="go-review">去审核 →</button>' +
      '<button class="btn ghost" type="button" id="again">再选一个文件夹</button></div></div>';
    $('#sum-body').innerHTML = html;
  }

  function retryFailed() {
    var fails = (S.queue || []).filter(function (it) { return it.st === 'fail'; });
    if (!fails.length) return;
    fails.forEach(function (it) { it.st = 'wait'; it.err = ''; it.tries = 0; });
    S.counts.failed -= fails.length;
    S.cursor = 0;
    S.running = true; S.done = false; S.paused = false; S.fatal = '';
    $('#sum').hidden = true;
    wake(true);
    render();
    pump();
  }

  /* ---------- 事件 ---------- */
  function bind() {
    $('#pick').addEventListener('change', onInput);
    $('#pick-files').addEventListener('change', onInput);
    var drop = $('#drop');
    ['dragenter', 'dragover'].forEach(function (t) {
      drop.addEventListener(t, function (e) { e.preventDefault(); if (!S.running) drop.classList.add('over'); });
    });
    drop.addEventListener('dragleave', function (e) { if (e.target === drop) drop.classList.remove('over'); });
    drop.addEventListener('drop', onDrop);
    // 拖到页面别处：别让浏览器直接打开那张照片
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) { e.preventDefault(); });
    drop.addEventListener('click', function (e) {
      if (S.running) { e.preventDefault(); CL.toast('上传中：请等这一批完成'); }
    });

    $('#plan').addEventListener('click', function (e) {
      var t = e.target;
      if (t.id === 'start') return startRun();
      if (t.id === 'replan') { $('#plan').hidden = true; hashGen++; S.scan = null; return; }
      var m = t.closest && t.closest('[data-mode]');
      if (m && S.scan) {
        var r = MB.clScan.regroup(S.scan, m.getAttribute('data-mode'));
        takeScan(r);
      }
    });
    $('#plan').addEventListener('change', function (e) {
      var t = e.target;
      if (t.hasAttribute('data-inc')) {
        S.projects[+t.getAttribute('data-inc')].include = t.checked;
        rebuildFirst();
        hashAll();
        draw();
      } else if (t.id === 'over-ok') {
        S.overBudgetOk = t.checked;
        draw();
      }
    });
    $('#plan').addEventListener('input', function (e) {
      var t = e.target;
      if (!t.classList.contains('loose-name')) return;
      var p = S.projects[+t.getAttribute('data-i')];
      p.name = t.value;
      setPid(p).then(function () { rebuildFirst(); updatePlanQuiet(); });
    });
    $('#run').addEventListener('click', function (e) { if (e.target.id === 'pause') pause(); });
    $('#sum').addEventListener('click', function (e) {
      var id = e.target.id;
      if (id === 'retry-failed') retryFailed();
      else if (id === 'go-review') CL.showTab('review');
      else if (id === 'again') { $('#sum').hidden = true; $('#run').hidden = true; $('#pick').click(); }
    });
    document.addEventListener('visibilitychange', function () {
      if (S.running && !S.paused && document.visibilityState === 'visible') wake(true);
    });
    CL.on('catalog', function () { if (S.scan) render(); });
  }

  // 打字时只更新会变的部分，不重画输入框（免得游标跳掉）
  function updatePlanQuiet() {
    var go = $('#plan .plan-go');
    var est = estimate();
    var n = 0;
    included().forEach(function (p) { var st = projStats(p); n += st.fresh + st.unknown; });
    if (go) go.innerHTML = startButton(est, n);
  }

  var inited = false;
  MB.clUpload = {
    maxBytes: undefined,              // 测试用：改小可以测「太大就再压」
    init: function () {
      if (inited) return;
      inited = true;
      bind();
      recover();
    },
    busy: function () { return !!S.running; },
    // 测试用：登记排队的状况
    commits: function () { return { busy: CQ.busy, pending: pendingCommits(), done: CQ.commits, recovering: CQ.recovering }; },
    // 拖放（也给测试用：假的 entries）
    dropEntries: function (got) {
      if (got.entries) {
        if (!got.entries.length) return;
        $('#drop').classList.add('reading');
        MB.clScan.fromEntries(got.entries).then(function (r) {
          $('#drop').classList.remove('reading');
          takeScan(r);
        }, function (e) {
          $('#drop').classList.remove('reading');
          CL.toast('读不到文件夹：' + ((e && e.message) || e), 4000);
        });
      } else if (got.files && got.files.length) {
        takeScan(MB.clScan.fromFileList(got.files));
      }
    },
    drawNow: draw,
    state: function () { return S; },
    journal: function () { return J; },
    estimate: estimate
  };
})();
