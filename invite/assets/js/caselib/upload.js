/* ============================================================
   案例库 · 上传分页（upload）
   ------------------------------------------------------------
   选 / 拖文件夹 → 预览（项目、略过清单、已在库里几张、这个月的额度）→ 开始上传。

   免费（Hobby）方案：每月约 2,000 次写入、1 GB 空间，超过整个案例库会被 Vercel 停权（连传好的照片都打不开）。
   所以这一页：
   - 额度以伺服器为准（GET ?view=full 的 quota：这个月写入、空间、还剩多少）；没有任何办法「照样上传」。
   - 「精选：每个项目最多 N 张」（MB.clPick.best）：同一个镜头只传一张、每个空间（子文件夹）先挑一张、再挑最不一样的；
     库里已经有的也算在 N 里面（再拖同一个已经有 6 张的项目 = 0 张）。照片比额度多就自动打开。
     挑之前要先知道每张的尺寸和 dHash：先「分析」（worker 只解码、不压、不传），结果记在 IndexedDB，重扫不必再算。
   - 删过的（清单的 purged）预设不重传，标「删过，不重传」；自己勾回来还是可以传。
   - 选的还是超过额度：照每个项目的重要顺序轮流留（每个项目都先留最好的），其余的这个月先不传。
   - 每个项目可以展开看小图、自己勾；自己动过的项目之后不再自动挑。
   - 上传中伺服器回 507（额度到了）：跟 503 storage_blocked 一样整批停下来（不重试），传好的照片照样登记完。
   - 被什么挡住要讲对：空间满了（bytes）不会下个月就好 → 叫他先到「审核」删除隐藏的照片；写入次数（writes）才是下个月再传。
   - 读不到的档（选好之后被改过、搬走、云端档还没下载）：算比对完，这次不传、列出来（「再读一次」）—— 不会卡住开始按钮。
   - 开始时重拿额度，定下来的放不下了（别人刚好也在传）：开始前就照重要顺序砍掉（没分析过就照档名），不等伺服器回 507。

   流程（每张）：算 hash → 库里有了就跳过 → 压图（worker）→ POST /api/photo
              → 记进「已上传、未登记」日志（IndexedDB）→ 每 20 张 addPhotos 登记一次 → 删日志
   - 同时压 2 张、传 3 张；压好的最多先放 4 张（记忆体不会爆）。
   - 失败重试 3 次（等越来越久）；401 → 叫出登入框，登入后接着传。
   - 当掉 / 关掉 / 断线：日志里的照片下次打开自动补登记，再选同一个文件夹也不会重传。
   - IndexedDB 'caselib-v1'：
       files     路径|大小|修改时间 → {h16, w, ht, dh}（重扫不必重算 hash、不必重新分析）
       pending   h16 → {k,sig,w,ht,sz,dh,f,name,pid,thumb}（已上传、未登记）
       committed h16 → {pid,rev,ts}（最近 15 分钟登记好的：公开 Blob 的 CDN 一分钟内可能还给旧清单，
                 重新整理后再拖一次，这些照片也不会被当成新的再传一次）
       packs     缩图包快取（审核页用，review.js）
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB;
  var CL = MB.cl;
  var $ = CL.$, esc = CL.esc;

  var PER_COMMIT = 20;          // 每 20 张登记一次（伺服器一次最多 40）
  var PROC_CONC = 2;            // 同时压几张（= worker 数）
  var UP_CONC = 3;              // 同时传几张
  var BUFFER = 4;               // 压好、等着传的最多几张
  var TRIES = 3;                // 失败重试几次
  var COMMIT_TRIES = 6;
  var EST_PHOTO = 200 * 1024;   // 1200px JPEG q0.78 平均约 150–250 KB
  var EST_THUMB = 30 * 1024;    // 缩图包里的一张 320px 缩图 + 清单多出来的一笔
  var PER_PHOTO = EST_PHOTO + EST_THUMB;
  var BACKUPS = 7;              // 清单每天的备份按星期几轮流覆盖：最多 7 份
  var KEEP_DONE = 15 * 60 * 1000;
  var CUR_MAX = 50;             // 精选：每个项目最多几张（1–50）
  var RANK_DEPTH = 60;          // 一个项目最多排前 60 张（再多的照分数排）
  var N_KEY = 'caselib-cur-n';
  var PREVIEW_CONC = 3;

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
  function noop() { /* 快取失败不影响上传 */ }

  /* ============================================================
     状态
     ============================================================ */
  var J = {};                   // 日志的记忆体副本：h → 记录
  var DONE = {};                // 最近登记好的：h → {pid, rev, ts}（清单还是 CDN 旧版时用）
  // 登记的排队：跟「这次选的文件夹」分开放 —— 开机补登记时再选文件夹，也不会把排队丢掉
  // halt：登记被额度挡住（507）—— 资料留在日志，下次打开再登记，不一直重试
  var CQ = { q: {}, queued: {}, busy: false, recovering: false, commits: 0, halt: false };
  var S = freshState();
  // 背景比对 / 分析的世代：放在 S 外面，重选文件夹后旧的一定会停（不会刚好撞到新的号码）
  var hashGen = 0, anGen = 0;
  var catVer = 0;               // 清单变了（伺服器的新版、或自己登记后补上的）
  function freshState() {
    return {
      scan: null, projects: [], items: [], byPid: {},
      firstByH: {}, hashing: false, hashedN: 0,
      running: false, paused: false, done: false, fatal: '', stopKind: '', stopReason: '', note: '',
      proc: 0, up: 0, buffer: [], cursor: 0, queue: null,
      startedAt: 0, recent: [],
      counts: { uploaded: 0, committed: 0, known: 0, dup: 0, failed: 0, bad: 0, skip: 0 },
      errors: [],
      // 精选：curUser = 自己切过（null = 照额度自动）；curN 每个项目最多几张
      curUser: null, curN: savedN(),
      // 分析（精选要的 w / ht / dh）
      anQ: [], anBusy: [], anTotal: 0, anDone: 0,
      ver: 0
    };
  }
  function savedN() {
    var n = 0;
    try { n = parseInt(localStorage.getItem(N_KEY), 10); } catch (e) { /* 无痕模式 */ }
    return n >= 1 && n <= CUR_MAX ? n : (MB.clPick ? MB.clPick.DEFAULT_N : 6);
  }

  function included() { return S.projects.filter(function (p) { return p.include && !p.recover; }); }
  function includedItems() {
    var out = [];
    included().forEach(function (p) { out = out.concat(p.items); });
    return out;
  }

  /* 这张照片算哪一类（要先有 h）：
     known 同项目已有 · dup 已在别的项目 / 这次重复 · journal 上次传了还没登记 · new 要传（含「删过」的） */
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
  // 最近自己登记好的：只在手上的清单比那次登记旧（CDN 还给旧版）时才算数；
  // 清单已经比它新、里面却没有这张 = 之后被删了（审核页「删除隐藏的照片」）
  function recentDone(h) {
    var d = DONE[h];
    if (!d || Date.now() - d.ts >= KEEP_DONE) return null;
    if (CL.cat && (CL.cat.rev | 0) >= (d.rev | 0) && !CL.cat.photos[h]) return null;
    return d;
  }
  // 删过的（审核页「删除隐藏的照片」）：清单的 purged 记着 hash
  var purgedMemo = { list: null, set: {} };
  function isPurged(h) {
    var list = CL.cat && Array.isArray(CL.cat.purged) ? CL.cat.purged : null;
    if (purgedMemo.list !== list) {
      var set = {};
      (list || []).forEach(function (x) { set[x] = 1; });
      purgedMemo = { list: list, set: set };
    }
    return !!purgedMemo.set[h];
  }
  // 「第一次出现」只看有勾选的项目、照顺序
  function rebuildFirst() {
    S.firstByH = {};
    includedItems().forEach(function (it) { if (it.h && !S.firstByH[it.h]) S.firstByH[it.h] = it; });
    S.ver++;
  }

  /* ---------- hash（先查 IndexedDB 快取） ---------- */
  function ensureHash(it) {
    if (it.h) return Promise.resolve(it.h);
    return MB.clWork.hash(it.file).then(function (r) {
      it.h = r.h;
      S.hashedN++;
      S.ver++;
      if (!S.firstByH[it.h] && it.p.include) S.firstByH[it.h] = it;
      store.put('files', { h: r.h, ts: Date.now() }, it.key).catch(noop);
      return it.h;
    });
  }

  function loadCached(items) {
    var keys = items.map(function (it) { return it.key; });
    return store.getMany('files', keys).then(function (m) {
      items.forEach(function (it) {
        var r = m[it.key];
        if (!r || !r.h) return;
        it.h = r.h;
        // 旧版记过的 bad（解不开）不算数：可能只是那次暂时读不到，这次再分析一次
        if (r.dh) { it.w = r.w; it.ht = r.ht; it.dh = r.dh; it.an = 'ok'; }
      });
    }, function () { /* 没快取就全部重算 */ });
  }

  /* 读不到的档（选好之后被改过、搬走、云端档还没下载、没权限）：算「比对完」，这次不传、列出来。
     不然「比对中」永远停在最后一张，开始上传的按钮一直不能按 */
  var UNREAD = '读不到这个档（选好之后被改过、搬走、还在云端没下载，或没有权限）';
  function unread(it) { return !it.h && !!it.hashErr; }

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
        it.hashErr = '';
        hashOne(it);
      }
      if (!active && i >= list.length) { S.hashing = false; rebuildFirst(); render(); }
    }
    function hashOne(it) {
      ensureHash(it).catch(function (e) {
        if (gen !== hashGen) return;
        it.hashErr = (e && e.message) || 'read';
        S.ver++;
      }).then(function () {
        active--;
        render();
        go();
      });
    }
    go();
  }

  /* ---------- 分析（精选要的尺寸、dHash）：不压、不传；结果记进 IndexedDB 'files' ---------- */
  function wantAnalysis(list) {
    if (S.running || !list || !list.length) return;
    list.forEach(function (it) {
      if (it.dh || it.an || !it.h) return;
      it.an = 'q';
      S.anQ.push(it);
      S.anTotal++;
    });
    pumpAnalysis();
  }
  function pumpAnalysis() {
    var gen = anGen;
    if (S.running) return;
    while (S.anBusy.length < PROC_CONC && S.anQ.length) analyzeOne(S.anQ.shift(), gen);
  }
  function analyzeOne(it, gen) {
    it.an = 'busy';
    S.anBusy.push(it);
    MB.clWork.analyze(it.file, { h: it.h }).then(function (r) {
      if (gen !== anGen) return;
      it.w = r.w; it.ht = r.ht; it.dh = r.dh; it.an = 'ok';
      store.put('files', { h: it.h, ts: Date.now(), w: r.w, ht: r.ht, dh: r.dh }, it.key).catch(noop);
    }, function (e) {
      if (gen !== anGen) return;
      // 解不开（bad）/ 其它错误（err：worker 当掉…）：这次精选先不挑它。不记进 IndexedDB ——
      // 可能只是暂时读不到（记忆体不够…），下次重扫再试；精选没开时照样排进上传，压图时再决定
      it.an = e && e.code === 'decode' ? 'bad' : 'err';
    }).then(function () {
      if (gen !== anGen) return;
      var i = S.anBusy.indexOf(it);
      if (i >= 0) S.anBusy.splice(i, 1);
      S.anDone++;
      S.ver++;
      if (!S.anBusy.length && !S.anQ.length) { S.anTotal = 0; S.anDone = 0; }
      render();
      pumpAnalysis();
    });
  }
  // 开始上传 / 重选文件夹：分析停下来（排队的、做到一半的都放回去，之后再分析）
  function stopAnalysis() {
    anGen++;
    S.anQ.concat(S.anBusy).forEach(function (it) { if (it.an === 'q' || it.an === 'busy') it.an = ''; });
    S.anQ = []; S.anBusy = []; S.anTotal = 0; S.anDone = 0;
  }
  function analyzing() { return S.anBusy.length + S.anQ.length > 0; }

  /* ============================================================
     额度 + 精选：这次传哪几张
     ============================================================ */
  // 这个月写入次数 / 空间：伺服器给的（CL.quota）；登记排队里的（已上传、还没登记）也先扣掉
  function usage(q) {
    var cat = CL.cat || { log: [] };
    var days = {};
    (cat.log || []).forEach(function (e) { if (e && e.ts) days[new Date(e.ts).toISOString().slice(0, 10)] = 1; });
    var today = new Date().toISOString().slice(0, 10);
    var n = Object.keys(cat.photos || {}).length;
    return { plan: q.plan, writes: q.writes | 0, bytes: +q.bytes || 0, photos: n, wroteToday: !!days[today], est: !!q.est, month: q.month || '' };
  }
  // 登记排队里的照片还要花的写入：照片本身（伺服器登记时才算进去）+ 每 20 张 2 次
  function pendingCost() {
    var w = 0;
    Object.keys(CQ.q).forEach(function (pid) {
      var n = CQ.q[pid].recs.length;
      if (n) w += n + 2 * Math.ceil(n / PER_COMMIT);
    });
    return w;
  }
  function budget() {
    var q = CL.quota(CL.cat || {});
    var u = usage(q);
    if (q.plan === 'pro') return { pro: true, q: q, u: u, w: Infinity, b: Infinity, N: Infinity, M: Infinity, allowed: Infinity, zero: '' };
    // 今天第一次写入前伺服器会先备份一次清单（也算 1 次写入）
    var w = Math.max(0, (q.writesLeft | 0) - pendingCost() - (u.wroteToday ? 0 : 1));
    var b = Math.max(0, +q.bytesLeft || 0);
    // 一张都传不了：一张照片 + 缩图包 + 清单 = 3 次
    var N = w < 3 ? 0 : Math.floor(w * PER_COMMIT / (PER_COMMIT + 2));
    var M = Math.floor(b / PER_PHOTO);
    var zero = N <= 0 ? 'writes' : M <= 0 ? 'bytes' : '';
    return { pro: false, q: q, u: u, w: w, b: b, N: N, M: M, allowed: Math.min(N, M), zero: zero };
  }
  // 每个项目传 k 张要几次写入、多少空间（每 20 张一次登记 = 缩图包 + 清单）
  function costOf(counts) {
    var w = 0, b = 0;
    counts.forEach(function (k) { if (k > 0) { w += k + 2 * Math.ceil(k / PER_COMMIT); b += k * PER_PHOTO; } });
    return { w: w, b: b };
  }
  function fits(c, bud) { return bud.pro || (c.w <= bud.w && c.b <= bud.b); }

  /* 库里这个项目已经有的（算在精选的 N 里面）+ 它们的 dHash（同一个镜头的新照片不再挑） */
  var libMemo = { key: -1, cat: null, by: {} };
  function libOf(pid) {
    if (libMemo.key !== catVer || libMemo.cat !== CL.cat) {
      var by = {};
      var ph = (CL.cat && CL.cat.photos) || {};
      Object.keys(ph).forEach(function (h) {
        var x = ph[h];
        var b = by[x.p] || (by[x.p] = { n: 0, hs: {}, dh: [] });
        b.n++;
        b.hs[h] = 1;
        if (x.dh) b.dh.push(x.dh);
      });
      libMemo = { key: catVer, cat: CL.cat, by: by };
    }
    return libMemo.by[pid] || { n: 0, hs: {}, dh: [] };
  }
  function existingOf(p) {
    if (!p.pid) return 0;
    var lib = libOf(p.pid), n = lib.n;
    Object.keys(J).forEach(function (h) { if (J[h].pid === p.pid && !lib.hs[h]) n++; });
    Object.keys(DONE).forEach(function (h) { var d = recentDone(h); if (d && d.pid === p.pid && !lib.hs[h] && !J[h]) n++; });
    return n;
  }

  function pickInfo(it) { return { id: it.id, w: it.w, h: it.ht, dh: it.dh, f: it.f }; }
  /* 一个项目的重要顺序（MB.clPick.best，再包一层）：
     top = 挑出来的（同一个镜头只一张，照挑的顺序）；order = top + 其它（照分数）+ 跟库里同一个镜头的（最后） */
  function rankOf(p, pool, depth) {
    var idsum = 0;
    pool.forEach(function (it) { idsum += it.id; });
    var key = pool.length + ':' + idsum + ':' + depth + ':' + catVer + ':' + p.pid;
    if (p._rk === key) return p._rank;
    var lib = libOf(p.pid).dh;
    var same = [], fresh = [];
    pool.forEach(function (it) {
      var hit = false;
      for (var i = 0; i < lib.length && !hit; i++) if (MB.clPick.dist(it.dh, lib[i]) <= MB.clPick.SAME_SHOT) hit = true;
      it.sameLib = hit;
      (hit ? same : fresh).push(it);
    });
    var byId = {};
    pool.forEach(function (it) { byId[it.id] = it; });
    var ids = fresh.length ? MB.clPick.best(fresh.map(pickInfo), Math.min(fresh.length, depth)) : [];
    var top = ids.map(function (id) { return byId[id]; });
    var taken = {};
    ids.forEach(function (id) { taken[id] = 1; });
    var tail = fresh.filter(function (it) { return !taken[it.id]; }).map(function (it, i) {
      return { it: it, i: i, s: MB.clPick.score(pickInfo(it)) };
    }).sort(function (a, b) { return b.s - a.s || a.i - b.i; }).map(function (x) { return x.it; });
    var r = { top: top, order: top.concat(tail, same) };
    p._rk = key;
    p._rank = r;
    return r;
  }

  /* 一个项目：新照片（可以传的）、删过的、读不出来的、读不到的、还没比对的。
     cands 含分析时读不出来的（bad / err）：精选不挑它们（rankable），精选没开就照样排进上传，压图时再决定 */
  function projBase(p) {
    var r = { p: p, news: [], cands: [], purged: [], bad: 0, unread: [], unknown: 0, existing: existingOf(p), list: [], man: 0, ready: true, rank: null, take: 0 };
    p.items.forEach(function (it) {
      if (!it.h) { if (it.hashErr) r.unread.push(it); else r.unknown++; return; }
      if (category(it) !== 'new') return;
      r.news.push(it);                                   // 手动都可以勾（含删过的、读不出来的）
      if (isPurged(it.h)) { r.purged.push(it); return; }
      if (!rankable(it)) r.bad++;
      r.cands.push(it);
    });
    return r;
  }
  function manOf(r) { return r.news.filter(function (it) { return it.man === true; }); }
  function noDh(it) { return !it.dh; }
  function rankable(it) { return it.an !== 'bad' && it.an !== 'err'; }
  function notRankable(it) { return !rankable(it); }

  // 精选开不开：自己切过就照自己的；不然 Hobby 方案、新照片比额度多 → 开
  function curatedOn(rows, bud, hashedAll) {
    if (S.curUser != null) return S.curUser;
    if (bud.pro || !hashedAll || bud.zero) return false;     // 一张都不能传：不必精选
    return !fits(costOf(rows.map(function (r) { return r.p.touched ? manOf(r).length : r.cands.length; })), bud);
  }

  /* 放不下：先给自己勾的（每个项目轮流），再给自动挑的（每个项目轮流、照重要顺序）。
     第 k 张：开新的一批（每 20 张）要 3 次写入（照片 + 缩图包 + 清单），之后每张 1 次。
     回传被什么挡住：'bytes' 空间（下个月也不会变多：要先释放空间）、'writes' 这个月的写入次数、'' 都放得下 */
  function fit(rows, bud) {
    var W = bud.w, B = bud.b;
    var taken = rows.map(function () { return 0; });
    var stop = rows.map(function () { return false; });
    var hitW = false, hitB = false;
    function take(i) {
      var cw = taken[i] % PER_COMMIT === 0 ? 3 : 1;
      if (PER_PHOTO > B) { hitB = true; stop[i] = true; return false; }
      if (cw > W) { hitW = true; stop[i] = true; return false; }
      W -= cw; B -= PER_PHOTO; taken[i]++;
      return true;
    }
    [true, false].forEach(function (manualPass) {
      var more = true;
      while (more) {
        more = false;
        for (var i = 0; i < rows.length; i++) {
          var lim = manualPass ? rows[i].man : rows[i].list.length;
          if (!stop[i] && taken[i] < lim && take(i)) more = true;
        }
      }
    });
    rows.forEach(function (r, i) { r.take = taken[i]; });
    return hitB ? 'bytes' : hitW ? 'writes' : '';
  }

  var selV = 0;
  var selMemo = { key: '', s: null, v: null };
  function isSelNow(it) { return it._sv === selV && it._s === 1; }
  function isCutNow(it) { return it._sv === selV && it._s === 2; }

  /* 这次要传的：每个项目一个清单（重要的在前）→ 放不下就 fit() 砍。结果记在每张的 _s（1 传、2 额度不够） */
  function computeSel() {
    var key = S.ver + '|' + catVer + '|' + Object.keys(J).length + '|' + pendingCost() + '|' + (CL.cat ? 1 : 0);
    if (selMemo.key === key && selMemo.s === S) return selMemo.v;
    var bud = budget();
    // 读不到的档也算比对完（这次不传）
    var hashedAll = !S.hashing && includedItems().every(function (it) { return !!it.h || !!it.hashErr; });
    var rows = included().map(projBase);
    var cur = curatedOn(rows, bud, hashedAll);
    var depth = Math.max(RANK_DEPTH, S.curN);
    var needDh = [];
    // 额度已经用完：一张都不能传，不必再分析
    var none = !bud.pro && !!bud.zero;
    rows.forEach(function (r) {
      var p = r.p;
      if (none) { r.list = []; r.ready = !r.unknown; return; }
      if (p.touched) { r.list = manOf(r); r.man = r.list.length; return; }
      if (cur) {
        if (r.unknown) { r.ready = false; return; }
        var pool = r.cands.filter(rankable);             // 读不出来的不挑
        var pend = pool.filter(noDh);
        if (pend.length) { r.ready = false; needDh = needDh.concat(pend); return; }
        r.rank = rankOf(p, pool, depth);
        r.list = r.rank.top.slice(0, Math.max(0, S.curN - r.existing));
        return;
      }
      r.list = r.cands.slice();
    });
    var counts = rows.map(function (r) { return r.list.length + (cur || r.p.touched || none ? 0 : r.unknown); });
    var over = !fits(costOf(counts), bud) || (none && rows.some(function (r) { return r.unknown || r.cands.length || r.purged.length; }));
    if (over && hashedAll && !none) {
      // 放不下：照重要顺序排好（要先分析）
      rows.forEach(function (r) {
        if (r.rank || !r.ready) return;
        var pool = r.cands.filter(rankable);
        var pend = pool.filter(noDh);
        if (r.p.touched) {
          if (pend.length) return;                       // 自己勾的：还没分析就照档名顺序
          var at = {}, last = 1e9;
          rankOf(r.p, pool, depth).order.forEach(function (it, i) { at[it.id] = i + 1; });
          // 没排到的（读不出来、删过又勾回来的）放最后；同样没排到的照档名顺序
          r.list = r.list.map(function (it, i) { return { it: it, a: at[it.id] || last + i }; })
            .sort(function (a, b) { return a.a - b.a; }).map(function (x) { return x.it; });
          return;
        }
        if (pend.length) { r.ready = false; needDh = needDh.concat(pend); return; }
        r.rank = rankOf(r.p, pool, depth);
        r.list = r.rank.order.concat(r.cands.filter(notRankable));   // 读不出来的放最后（压图时再试）
      });
    }
    var allReady = hashedAll && rows.every(function (r) { return r.ready; });
    var cutBy = '';
    if (over && allReady) cutBy = fit(rows, bud);
    else rows.forEach(function (r) { r.take = r.list.length; });
    selV++;
    var total = 0, cutN = 0, unknownSel = 0;
    rows.forEach(function (r) {
      r.list.forEach(function (it, i) { it._sv = selV; it._s = i < r.take ? 1 : 2; });
      r.go = Math.min(r.take, r.list.length);
      total += r.go;
      cutN += r.list.length - r.go;
      if (!cur && !r.p.touched) unknownSel += r.unknown;
    });
    // 还在比对、但就算全部都是新照片也放得下（精选没开）→ 可以先开始
    var early = !hashedAll && !cur && !over;
    var final = early ? costOf(counts) : costOf(rows.map(function (r) { return r.go; }));
    var sel = {
      bud: bud, cur: cur, hashedAll: hashedAll, rows: rows, total: total, cut: cutN, cutBy: cutN ? cutBy : '', over: over && allReady,
      overRaw: over, needDh: needDh, unknown: unknownSel, early: early,
      ready: hashedAll ? allReady : early, cost: final
    };
    selMemo = { key: key, s: S, v: sel };
    return sel;
  }
  function invalidate() { S.ver++; }

  /* 自己勾一张：这个项目之后照自己勾的（第一次勾时，先把现在看到的勾选记下来）。
     自己勾的加起来不能超过额度（自动挑的会让位） */
  function onPick(it, on) {
    var p = it.p;
    var sel = computeSel();
    var wasTouched = !!p.touched;
    if (!wasTouched) p.items.forEach(function (x) { x.man = isSelNow(x); });
    if (on && !sel.bud.pro) {
      var counts = included().filter(function (q) { return q.touched || q === p; }).map(function (q) {
        var n = q.items.filter(function (x) { return x.man === true; }).length;
        return n + (q === p && it.man !== true ? 1 : 0);
      });
      var c = costOf(counts);
      if (!fits(c, sel.bud)) {
        if (!wasTouched) p.items.forEach(function (x) { delete x.man; });
        var room = sel.bud.zero ? 0 : sel.total;
        CL.toast(sel.bud.zero ? zeroWhy(sel.bud) :
          (c.b > sel.bud.b ? '空间只够这次传约 ' : '这个月的额度只够这次传约 ') + CL.n(room) + ' 张：要加这张，请先取消别的', 4200);
        return false;
      }
    }
    p.touched = true;
    it.man = !!on;
    invalidate();
    return true;
  }
  function reAuto(p) {
    p.touched = false;
    p.items.forEach(function (x) { delete x.man; });
    invalidate();
  }

  /* ============================================================
     选好文件夹
     ============================================================ */
  function takeScan(result) {
    if (S.running) { CL.toast('上传中：请等这一批完成，或先暂停'); return; }
    hashGen++;
    stopAnalysis();
    closeAllGrids();
    S = freshState();
    S.scan = result;
    var seq = 0;
    var jobs = result.projects.map(function (sp, pi) {
      var p = { name: sp.name, loose: !!sp.loose, pid: '', include: true, items: [], skipped: sp.skipped, existing: 0, hiddenProj: false, gi: pi };
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
      return CL.loadCatalog().catch(function (e) { CL.toast(e.message, 5000); });
    }).then(function () {
      render();
      hashAll();
    });
  }

  function setPid(p) {
    var clean = CL.cleanName(p.name);
    if (!clean) { p.pid = ''; p.include = !p.loose ? false : p.include; S.ver++; return Promise.resolve(); }
    return CL.pidOf(clean).then(function (pid) {
      p.pid = pid;
      S.byPid[pid] = p;
      S.ver++;
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
  function zeroWhy(bud) {
    return bud.zero === 'bytes' ? '空间满了：先到「审核」删除隐藏的照片，释放空间，再回来传。' :
      '这个月的写入次数用完了：下个月 1 号再传（到时再拖同一个文件夹就会接着传，传过的不会重传）。';
  }
  // 按钮上的字 + 为什么不能按
  function startState(sel) {
    if (CL.catErr && CL.catErr.code === 'storage_blocked') return { ok: false, label: '现在不能上传', why: CL.catErr.message };
    if (!CL.cat) {
      var ce = CL.catErr;
      if (!ce) return { ok: false, label: '还在读案例库…', why: '' };
      // 网路断：叫他检查网路；伺服器回的错（没设定好…）：讯息本身就说了要怎么办
      return { ok: false, label: '现在不能上传', why: ce.status === 0 ?
        '读不到案例库的清单（网路连不上）：不知道这个月还剩多少额度，请检查网路后重新整理。' :
        ce.message + (ce.code === 'not_configured' ? '' : '不知道这个月还剩多少额度，请稍后重新整理这一页。') };
    }
    var nFresh = 0, nPurged = 0, nUnread = 0;
    sel.rows.forEach(function (r) { nFresh += r.cands.length; nPurged += r.purged.length; nUnread += r.unread.length; });
    var n = sel.total + (sel.early ? sel.unknown : 0);
    if (!sel.hashedAll && !sel.early) return { ok: false, label: '比对中…', why: '比对完才知道哪些是新照片、这个月的额度够不够。' };
    if (!sel.ready) return { ok: false, label: '分析照片中…', why: '正在挑每个项目最好的几张（还没上传）。' };
    if (!n) {
      if (!nFresh && !nPurged && !sel.unknown) return { ok: false, label: '没有新照片要传', why: nUnread ? '有 ' + CL.n(nUnread) + ' 张读不到（见上面）。' : '' };
      if (sel.bud.zero && (nFresh || nPurged)) return { ok: false, label: '这个月不能再传了', why: zeroWhy(sel.bud) };
      if (!nFresh && nPurged) return { ok: false, label: '没有新照片要传', why: '删过的照片不会重传；真的要传，展开项目自己勾。' };
      return { ok: false, label: '没有选照片', why: '展开项目（「看照片」）勾要传的。' };
    }
    return { ok: true, label: '开始上传 ' + (sel.early && sel.unknown ? '约 ' : '') + CL.n(n) + ' 张', why: '' };
  }

  // 开始时把这次要传的定下来（it.go）：之后不再跟着额度、精选变
  function freeze(sel) {
    S.curUser = sel.cur;
    includedItems().forEach(function (it) {
      if (!it.h) it.go = sel.early && !it.hashErr ? 'maybe' : false;
      else it.go = category(it) === 'new' ? isSelNow(it) : false;
    });
  }
  function buildQueue() {
    var q = [];
    includedItems().forEach(function (it) {
      if (it.st !== 'wait') { q.push(it); return; }
      // 读不到的档：这次不传，结束时列在「没传成功的」
      if (unread(it) && it.go === false) { it.st = 'bad'; it.err = UNREAD; S.counts.bad++; q.push(it); return; }
      var c = it.h ? category(it) : '';
      if (c === 'new' && it.go === false) {
        if (it.an === 'bad') { it.st = 'bad'; it.err = '图片读不出来（档案坏了，或其实不是照片）'; S.counts.bad++; q.push(it); }
        else { it.st = 'skip'; S.counts.skip++; }
        return;
      }
      q.push(it);
    });
    return q;
  }
  function willUpload(it) {
    return it.go === true || (it.go === 'maybe' && !isPurged(it.h));
  }

  /* 开始时重拿了额度：定下来要传的（it.go）放不下了（别人刚好也在传、还在比对就先开始的…）→
     照重要顺序、每个项目轮流留（自己勾的先留），其余这次不传。精选没开、没分析过也一样砍（没分析的照档名顺序）。
     回传 {lost: 少传几张, by: 'writes' | 'bytes'} */
  function frozenGo(it) {
    if (it.st !== 'wait') return false;
    if (it.go === true) return !!it.h && category(it) === 'new';
    if (it.go === 'maybe') return !it.h || (category(it) === 'new' && !isPurged(it.h));
    return false;
  }
  function trimFrozen(sel) {
    var bud = sel.bud;
    if (bud.pro) return { lost: 0, by: '' };
    var rowOf = {};
    sel.rows.forEach(function (r) { rowOf[r.p.gi] = r; });
    var rows = included().map(function (p) {
      var at = {}, r = rowOf[p.gi];
      ((r && r.list) || []).forEach(function (it, i) { at[it.id] = i + 1; });
      var list = p.items.filter(frozenGo).map(function (it, i) {
        return { it: it, m: p.touched && it.man === true ? 0 : 1, a: at[it.id] || 1e9 + i };
      }).sort(function (x, y) { return x.m - y.m || x.a - y.a; }).map(function (x) { return x.it; });
      var man = p.touched ? list.filter(function (it) { return it.man === true; }).length : 0;
      return { list: list, man: man, take: 0 };
    });
    if (fits(costOf(rows.map(function (r) { return r.list.length; })), bud)) return { lost: 0, by: '' };
    var by = fit(rows, bud) || (bud.zero === 'bytes' ? 'bytes' : 'writes');
    var lost = 0;
    rows.forEach(function (r) {
      r.list.forEach(function (it, i) { if (i >= r.take) { it.go = false; lost++; } });
    });
    return { lost: lost, by: by };
  }

  function startRun() {
    if (S.running) return;
    var ps = included();
    var bad = ps.filter(function (p) { return !p.pid; });
    if (bad.length) { CL.toast('请先填项目名'); var inp = $('#plan input.loose-name'); if (inp) inp.focus(); return; }
    var sel = computeSel();
    var st = startState(sel);
    if (!st.ok) { CL.toast(st.why || st.label, 4200); return; }
    hashGen++;                 // 停掉背景比对、分析，交给上传流程（分析时一定不上传）
    S.hashing = false;
    stopAnalysis();
    closeAllGrids();
    rebuildFirst();
    freeze(computeSel());
    CQ.halt = false;
    S.fatal = ''; S.stopKind = ''; S.stopReason = '';
    S.running = true;
    S.paused = false;
    S.done = false;
    S.startedAt = Date.now();
    S.cursor = 0;
    S.queue = includedItems().filter(function (it) { return it.go !== false || !it.h || category(it) !== 'new'; });
    $('#plan').hidden = true;
    $('#run').hidden = false;
    $('#sum').hidden = true;
    wake(true);
    // 拿最新的清单（额度）再开始，免得重传别人刚传的；额度刚好被用掉一些 → 照重要顺序少传几张，一定不超过
    CL.loadCatalog().catch(function () { /* 拿不到就用手上的 */ }).then(function () {
      invalidate();
      var cut = trimFrozen(computeSel());
      if (cut.lost) {
        S.note = cut.by === 'bytes' ?
          '空间刚好被用掉一些（可能别人也在传）：这次少传 ' + CL.n(cut.lost) + ' 张。要传的话，先到「审核」删除隐藏的照片，释放空间，再拖同一个文件夹接着传。' :
          '这个月的额度刚好被用掉一些（可能别人也在传）：这次少传 ' + CL.n(cut.lost) + ' 张，下个月再传。';
      }
      S.cursor = 0;
      S.queue = buildQueue();
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
    if (!S.running || !S.queue) return;
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
      if (c === 'new' && !willUpload(it)) { it.st = 'skip'; S.counts.skip++; return; }
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
    if (e === 'quota') return '这个月的免费额度到了';
    return '伺服器回 ' + r.status + (e ? ' ' + e : '');
  }
  function retryable(r) {
    return r.status === 0 || r.status === 408 || r.status === 409 || r.status === 429 || r.status >= 500;
  }
  // store 被暂停 / 没权限 / 不存在：重试也没用，整批停下来、讲清楚
  function blocked(r) { return !!(r && r.json && r.json.error === 'storage_blocked'); }
  function blockedError(r) {
    var e = new Error('Vercel Blob 暂停了写入 —— 案例库的储存被停权了（多半是免费额度用完了），或 Blob store 被停用 / 没接好。' +
      '已传好的照片都记在这台电脑，之后（老板处理好、或下个月）再拖一次同一个文件夹就会接着传，不会重传。' +
      '（' + ((r.json && r.json.message) || 'storage_blocked') + '）');
    e.fatal = true;
    e.kind = 'blocked';
    return e;
  }
  // 伺服器的额度到了（507）：自己停下来，免得 Vercel 停权；已经传好的照样登记（伺服器到 1,950 次才挡登记）
  function overQuota(r) { return !!(r && r.status === 507 && r.json && r.json.error === 'quota'); }
  function quotaError(r) {
    var reason = (r && r.json && r.json.reason) || 'writes';
    var e = new Error(quotaText(true, reason));
    e.fatal = true;
    e.kind = 'quota';
    e.reason = reason;
    return e;
  }
  // 伺服器没设定好（缺 Blob 的环境变数）：跟停权不一样，要老板去 Vercel 设
  function notConfigured(r) { return !!(r && r.status === 503 && r.json && r.json.error === 'not_configured'); }
  function configError() {
    var e = new Error('伺服器还没接好照片储存（Vercel 的 Blob 设定）：请老板到 Vercel 设定好、重新部署后再传。已传好的照片都记在这台电脑，不会重传。');
    e.fatal = true;
    e.kind = 'config';
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
        if (overQuota(r)) throw quotaError(r);
        if (notConfigured(r)) throw configError();
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

  function setStop(e) {
    // 停权最严重：先记到的是停权就不改；额度的说明结束时再重写一次（登记完没有）
    if (S.fatal && S.stopKind === 'blocked') return;
    // 空间满了比写入次数用完更要讲：下个月空间也不会变多
    if (e.kind === 'quota' && (e.reason === 'bytes' || !S.stopReason)) S.stopReason = e.reason || 'writes';
    S.fatal = e.kind === 'quota' ? quotaText(true) : e.message;
    S.stopKind = e.kind || 'error';
    wake(false);
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
        setStop(e);
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

  // 停下来了（额度）：传好的照样登记；停权 / 清单太大 / 没设定好：登记也不会成功，留在日志
  function commitsStopped() { return !!(S.fatal && S.stopKind !== 'quota'); }

  function scheduleCommits() {
    if (CQ.busy || CQ.halt || commitsStopped()) return;
    var pick = null;
    Object.keys(CQ.q).forEach(function (pid) {
      var q = CQ.q[pid];
      if (pick || !q.recs.length || q.wait > Date.now()) return;
      if (q.recs.length >= PER_COMMIT || settled(q.p) || S.paused || !S.running || S.fatal) pick = q;
    });
    if (!pick) return;
    CQ.busy = true;
    var batch = pick.recs.slice(0, PER_COMMIT);
    commit(pick.name, batch).then(function (out) {
      pick.recs = pick.recs.filter(function (r) { return batch.indexOf(r) < 0; });
      applyCommit(pick, batch, out);
    }, function (e) {
      if (e && e.fatal) {
        // 额度连登记都不够了：资料留在日志（这台电脑），下次打开再补登记 —— 不一直重试
        if (e.kind === 'quota') CQ.halt = true;
        setStop(e);
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
      if (S.running && !S.paused && !S.fatal) S.note = '登记中（' + recs.length + ' 张）…';
      return waitOnline().then(function () { return CL.api('POST', '/api/catalog', body); }).then(function (r) {
        if (r.status === 200 && r.json) { if (!S.paused && !S.fatal) S.note = ''; return r.json; }
        if (r.status === 401) { S.note = '登入过期：请再登入一次，登入后会接着登记。'; render(); return CL.needLogin().then(loop); }
        if (r.status === 413 && r.json && r.json.error === 'index_too_large') {
          var fe = new Error('清单已经到上限（3.5 MB），不能再登记。照片都还在，请联络负责的同事处理。');
          fe.fatal = true;
          fe.kind = 'index';
          throw fe;
        }
        if (blocked(r)) throw blockedError(r);
        if (overQuota(r)) throw quotaError(r);
        if (notConfigured(r)) throw configError();
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
    var added = {}, dup = {};
    (out.added || []).forEach(function (h) { added[h] = 1; });
    (out.dup || []).forEach(function (h) { dup[h] = 1; });
    // 本地的额度先扣掉（伺服器那边已经记了；CDN 可能一分钟内还给旧清单）：照片 + 缩图包 + 清单
    if ((out.added || []).length) {
      var bytes = 0;
      batch.forEach(function (r) { if (added[r.h]) bytes += (r.sz | 0) + (r.thumb ? r.thumb.length : 0); });
      CL.addWrites(out.added.length + 2, bytes);
    }
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
      // 删过又自己勾回来传的：伺服器已经从「删过」拿掉了
      if (cat && added[r.h] && Array.isArray(cat.purged) && cat.purged.indexOf(r.h) >= 0) cat.purged = cat.purged.filter(function (x) { return x !== r.h; });
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
  // 还有可以马上登记的（没在等 60 秒后重试）
  function commitsWaiting() {
    return Object.keys(CQ.q).some(function (pid) { var q = CQ.q[pid]; return q.recs.length && !(q.wait > Date.now()); });
  }

  function maybeFinish() {
    if (!S.running) {
      // 没在上传（例：开机补登记）：登记完（或登记不了）就更新提示
      if (!CQ.busy && CQ.recovering && (!pendingCommits() || CQ.halt || commitsStopped())) { CQ.recovering = false; recoverDone(); }
      return;
    }
    if (S.proc || S.up || CQ.busy) return;
    if (S.fatal) {
      // 停下来了：压好、还没传的放回「等待」（放掉记忆体），不然会一直等它们传完
      S.buffer.forEach(function (it) { it.st = 'wait'; it.res = null; });
      S.buffer = [];
      // 额度停的：传好的先登记完（伺服器到 1,950 次才挡登记）
      if (S.stopKind === 'quota' && !CQ.halt && commitsWaiting()) return;
      finish();
      return;
    }
    if (S.buffer.length) return;
    if (S.paused) return;
    if (nextWaiting()) return;
    if (commitsWaiting()) return;
    finish();
  }

  /* 额度停下来的说明：被什么挡住（空间 / 这个月的写入次数）、登记完没有、还剩几张。
     空间满了不会下个月就好：要先到「审核」删除隐藏的照片 */
  function quotaText(running, reason) {
    var space = (reason || S.stopReason) === 'bytes';
    var t = space ? '案例库的空间快满了，已经自动停下来，免得 Vercel 把案例库停权。' :
      '这个月的免费额度快用完了，已经自动停下来，免得 Vercel 把案例库停权。';
    if (running) return t + '正在把传好的照片登记好…';
    var left = pendingCommits();
    var rest = (S.queue || []).filter(function (it) { return it.st === 'wait'; }).length;
    t += left ? '还有 ' + CL.n(left) + ' 张已经传上去、还没登记：资料留在这台电脑，下次打开这一页会自动补登记（不会重传）。' : '传好的照片都已经登记。';
    if (rest) {
      t += space ? '剩下的 ' + CL.n(rest) + ' 张：先到「审核」删除隐藏的照片，释放空间，再拖同一个文件夹接着传（传过的不会重传）。' :
        '剩下的 ' + CL.n(rest) + ' 张下个月再传（到时再拖同一个文件夹就会接着传）。';
    }
    return t;
  }

  function finish() {
    if (S.stopKind === 'quota') S.fatal = quotaText(false);
    S.running = false;
    S.done = true;
    S.paused = false;
    wake(false);
    $('#run').hidden = false;
    $('#sum').hidden = false;
    draw();
    // 拿伺服器的版本（shot 分组、缩图包路径、额度）；CDN 还是旧版的话 loadCatalog 会保留本地的
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
    box.innerHTML = !left ? '<span>上次没登记的照片都补登记好了 ✓</span>' :
      CQ.halt ? '<span>还有 ' + CL.n(left) + ' 张已上传、还没登记：这个月的免费额度不够登记了。资料留在这台电脑，下个月打开这一页会自动补登记（不会重传）。</span>' :
      commitsStopped() ? '<span>还有 ' + CL.n(left) + ' 张已上传、还没登记：' + esc(S.fatal) + '</span>' :
      '<span>还有 ' + CL.n(left) + ' 张没登记成功，等一下会再试。</span>';
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
     估算（给画面、也给测试）
     ============================================================ */
  function projStats(p) {
    var s = { total: p.items.length, fresh: 0, known: 0, dup: 0, unknown: 0, unread: 0, done: 0, fail: 0, bad: 0, active: 0, purged: 0, skip: 0, go: 0, cut: 0 };
    p.items.forEach(function (it) {
      var st = it.st;
      if (st === 'done' || st === 'journal') s.done++;
      else if (st === 'known') s.known++;
      else if (st === 'dup') s.dup++;
      else if (st === 'fail') s.fail++;
      else if (st === 'bad') s.bad++;
      else if (st === 'skip') s.skip++;
      else if (st === 'proc' || st === 'up' || st === 'ready') s.active++;
      if (st !== 'wait') return;
      if (!it.h) { if (it.hashErr) s.unread++; else s.unknown++; return; }
      var c = p.include ? category(it) : '';
      if (c === 'known' || c === 'journal') s.known++;
      else if (c === 'dup') s.dup++;
      else if (c === 'new' && isPurged(it.h)) s.purged++;
      else s.fresh++;
      if (isSelNow(it)) s.go++;
      else if (isCutNow(it)) s.cut++;
    });
    return s;
  }

  function estimate(sel) {
    sel = sel || computeSel();
    var bud = sel.bud, u = bud.u;
    var photos = sel.total + (sel.early ? sel.unknown : 0);
    var c = sel.cost;
    var writes = c.w + (photos && !u.wroteToday ? 1 : 0);
    function fin(x) { return x === Infinity ? null : x; }
    return {
      u: u, plan: bud.q.plan, photos: photos, writes: writes, bytes: c.b,
      over: sel.overRaw, cut: sel.cut, cur: sel.cur, curN: S.curN,
      allowed: fin(bud.allowed), N: fin(bud.N), M: fin(bud.M), room: fin(bud.N), zero: bud.zero,
      writesLeft: fin(bud.w), bytesLeft: fin(bud.b)
    };
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

  // 重画时保住正在打字的框（游标、还没按 Enter 的数字）
  function keepFocus(root, fn) {
    var a = document.activeElement, sel = null, val = null, ss = null, se = null;
    if (a && a !== root && root.contains(a)) {
      if (a.id) sel = '#' + a.id;
      else if (a.getAttribute('data-i') != null) sel = 'input.loose-name[data-i="' + a.getAttribute('data-i') + '"]';
      else if (a.getAttribute('data-pick') != null) sel = '[data-pick="' + a.getAttribute('data-pick') + '"]';
      else if (a.getAttribute('data-open') != null) sel = '[data-open="' + a.getAttribute('data-open') + '"]';
      val = a.value;
      try { ss = a.selectionStart; se = a.selectionEnd; } catch (e) { /* number 没有游标位置 */ }
    }
    fn();
    if (!sel) return;
    var b = root.querySelector(sel);
    if (!b) return;
    if ((b.type === 'text' || b.type === 'number') && b.value !== val) b.value = val;
    try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); }
    try { if (ss != null) b.setSelectionRange(ss, se); } catch (e) { /* 不支援 */ }
  }

  function drawPlan() {
    var sc = S.scan;
    var ps = S.projects;
    var sel = computeSel();
    if (!S.running) wantAnalysis(sel.needDh);
    var est = estimate(sel);
    var allStats = ps.map(projStats);
    var nFresh = 0, nKnown = 0, nDup = 0, nUnknown = 0, nPurged = 0, unreadList = [];
    ps.forEach(function (p, i) {
      if (!p.include) return;
      var st = allStats[i];
      nFresh += st.fresh; nKnown += st.known; nDup += st.dup; nUnknown += st.unknown; nPurged += st.purged;
      p.items.forEach(function (it) { if (unread(it) && it.st === 'wait') unreadList.push(it); });
    });
    var totalItems = includedItems().length;
    var hashedAll = totalItems - nUnknown;
    var rowOf = {};
    sel.rows.forEach(function (r) { rowOf[r.p.gi] = r; });
    var head = '', html = '';

    head += '<div class="plan-head">' +
      '<div><h3>准备上传</h3><p class="hint">' + ps.length + ' 个项目 · ' + CL.n(sc.total) + ' 张照片' +
      (sc.skipped.length ? ' · 略过 ' + sc.skipped.length + ' 个档' : '') + '</p></div>' +
      '<div class="plan-go">' + startButton(sel) + '</div></div>';

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
        '<span class="ok">✓ 比对完成：<b>' + CL.n(nFresh) + '</b> 张新照片 · 已在库里 ' + CL.n(nKnown) + ' 张' +
        (nPurged ? ' · 删过 ' + CL.n(nPurged) + ' 张（不重传）' : '') +
        (nDup ? ' · 重复 ' + nDup + ' 张（同一张已在别的项目，只存一次）' : '') + '</span>') +
        '</div>';
    }
    // 读不到的档：这次不传，列出来（可以再读一次）
    if (unreadList.length && !nUnknown) {
      html += '<div class="unread-line"><b>' + CL.n(unreadList.length) + ' 张读不到，这次不传：</b>' +
        unreadList.slice(0, 20).map(function (it) { return '<span class="ur-f">' + esc(it.p.name + '/' + it.f) + '</span>'; }).join('、') +
        (unreadList.length > 20 ? ' …还有 ' + CL.n(unreadList.length - 20) + ' 张' : '') +
        '<span class="muted">（选好之后被改过、搬走、还在云端没下载，或没有权限）</span> ' +
        '<button class="mini" type="button" id="rehash">再读一次</button>' +
        '<span class="muted"> 还是不行：把档案存好后重新选一次文件夹。</span></div>';
    }
    // 分析进度（精选要的）
    if (analyzing()) {
      var anAll = Math.max(S.anTotal, 1);
      html += '<div class="hash-line an-line">' + bar(S.anDone / anAll) + '<span>分析照片中 ' + CL.n(S.anDone) + ' / ' + CL.n(S.anTotal) +
        ' —— 挑每个项目最好的几张（只在这台电脑看，还没上传；同一个文件夹第二次会快很多）</span></div>';
    }

    // 项目表（精选那一行是一直留着的元素，见 syncCurRow）
    var prog = html, table = '';
    html = '';
    table += '<div class="cl-table-wrap"><table class="cl-table"><thead><tr><th class="c-chk"></th><th>项目（文件夹名）</th><th class="num">照片</th><th class="num">新</th><th class="num">这次传</th><th class="num">已在库里</th><th class="num">重复</th><th>备注</th></tr></thead><tbody>';
    ps.forEach(function (p, i) {
      var st = allStats[i];
      var r = rowOf[p.gi];
      var ex = p.pid && CL.cat && CL.cat.projects[p.pid];
      var note = [];
      if (ex) note.push('<span class="tag merge">已有同名项目 ' + (ex.n | 0) + ' 张，将合并</span>');
      if (ex && ex.hidden) note.push('<span class="tag warn">这个项目已隐藏</span>');
      if (st.purged) note.push('<span class="tag">删过 ' + st.purged + ' 张，不重传</span>');
      if (st.cut) note.push('<span class="tag warn">' + st.cut + (sel.cutBy === 'bytes' ? ' 张空间不够' : ' 张额度不够，下个月') + '</span>');
      if (r && r.bad) note.push('<span class="tag warn">' + r.bad + ' 张读不出来' + (sel.cur ? '，不挑' : '') + '</span>');
      if (st.unread) note.push('<span class="tag warn">' + st.unread + ' 张读不到，这次不传</span>');
      if (p.touched) note.push('<span class="tag on">自己挑的</span>');
      if (p.skipped.length) note.push('<span class="tag">略过 ' + p.skipped.length + '</span>');
      if (!st.total) note.push('<span class="tag warn">没有可上传的照片</span>');
      var open = !!GRIDS[p.gi];
      var nameCell = (p.loose ?
        '<input class="loose-name" type="text" data-i="' + i + '" placeholder="这些照片属于哪个项目？例：区域 风格 客户名" value="' + esc(p.name) + '" />' :
        '<b>' + esc(p.name) + '</b>') +
        (st.total && p.include ? ' <button class="mini pg-open" type="button" data-open="' + p.gi + '" aria-expanded="' + open + '">' + (open ? '收起' : '看照片') + '</button>' : '');
      var goCell = !p.include ? '' : !r || !r.ready ? '<span class="muted">…</span>' : '<b>' + CL.n(st.go + (sel.early && !sel.cur ? st.unknown : 0)) + '</b>';
      table += '<tr class="' + (p.include ? '' : 'off') + '"><td class="c-chk"><input type="checkbox" data-inc="' + i + '"' + (p.include ? ' checked' : '') + (st.total ? '' : ' disabled') + ' aria-label="上传这个项目" /></td>' +
        '<td class="c-name">' + nameCell + '</td>' +
        '<td class="num">' + st.total + '</td>' +
        '<td class="num">' + (st.unknown ? '<span class="muted">' + (st.fresh + st.unknown) + '?</span>' : st.fresh) + '</td>' +
        '<td class="num c-go">' + goCell + '</td>' +
        '<td class="num">' + (st.known || '') + '</td>' +
        '<td class="num">' + (st.dup || '') + '</td>' +
        '<td class="c-note">' + note.join(' ') + '</td></tr>';
      if (open) table += '<tr class="pg-row"><td colspan="8"><div class="pg-slot" data-slot="' + p.gi + '"></div></td></tr>';
    });
    table += '</tbody></table></div>';

    // 额度
    var bottom = budgetBox(sel, est) + skippedBox(sc.skipped);
    var body = $('#plan-body');
    var P = planParts();
    var scrolls = saveGridScroll();
    // 只换有变的那一块：按钮、勾选框、打到一半的数字不会在按下去的那一刻被换掉
    keepFocus(body, function () {
      setPart(P.head, head);
      setPart(P.prog, prog);
      syncCurRow(sel);
      if (setPart(P.table, table)) mountGrids(scrolls);
      else Object.keys(GRIDS).forEach(function (gi) { syncGrid(GRIDS[gi]); });
      setPart(P.bottom, bottom);
    });
  }

  // 预览分成几块，各自只在内容变了才重画
  function planParts() {
    var body = $('#plan-body');
    var P = body.__pp;
    if (!P || P.head.parentNode !== body) {
      body.innerHTML = '<div class="pp-head"></div><div class="pp-prog"></div><div class="pp-cur"></div><div class="pp-table"></div><div class="pp-bottom"></div>';
      P = body.__pp = { head: body.children[0], prog: body.children[1], cur: body.children[2], table: body.children[3], bottom: body.children[4] };
      P.cur.appendChild(curRowEl());
    }
    return P;
  }
  function setPart(el, html) {
    if (el.__html === html) return false;
    el.innerHTML = html;
    el.__html = html;
    return true;
  }

  /* 精选：每个项目最多 N 张 —— 一直是同一个元素（只改勾选、数字、说明），打字打到一半不会被重画打断 */
  var CUR = null;
  function curRowEl() {
    if (CUR) return CUR.el;
    var el = document.createElement('div');
    el.className = 'cur-row';
    el.innerHTML = '<label class="cur-on"><input type="checkbox" id="cur-on" /> <b>精选</b></label>' +
      '<span class="cur-n">：每个项目最多 <input type="number" id="cur-n" min="1" max="' + CUR_MAX + '" step="1" value="' + S.curN + '" aria-label="每个项目最多几张" /> 张</span>' +
      '<span class="muted cur-why"></span>';
    CUR = { el: el, box: el.querySelector('#cur-on'), num: el.querySelector('#cur-n'), why: el.querySelector('.cur-why') };
    return el;
  }
  function syncCurRow(sel) {
    curRowEl();
    var cur = !!sel.cur;
    var cls = 'cur-row' + (cur ? ' on' : '');
    if (CUR.el.className !== cls) CUR.el.className = cls;
    if (CUR.box.checked !== cur) CUR.box.checked = cur;
    if (document.activeElement !== CUR.num && +CUR.num.value !== S.curN) CUR.num.value = S.curN;
    var why = (S.curUser == null && cur ? '照片比这个月的额度多，先自动打开。' : '') +
      '同一个镜头只传一张、每个空间（子文件夹）先挑一张、再挑最不一样的；库里已经有的也算在内。点「看照片」可以自己勾。';
    if (CUR.why.textContent !== why) CUR.why.textContent = why;
  }

  function startButton(sel) {
    var b = startState(sel);
    return '<button class="btn' + (b.ok ? ' gold' : '') + '" type="button" id="start"' + (b.ok ? '' : ' disabled') + '>' + esc(b.label) + '</button>' +
      (b.why ? '<p class="go-why">' + esc(b.why) + '</p>' : '');
  }

  function budgetBox(sel, est) {
    var bud = sel.bud, q = bud.q;
    if (bud.pro) {
      return '<div class="budget pro"><p class="b-big"><b>Pro 方案：不限额度</b></p>' +
        '<p class="b-note">这次约 ' + CL.n(est.writes) + ' 次写入、' + CL.mb(est.bytes) + '。</p></div>';
    }
    var wCap = q.uploadCap || CL.LIMIT_WRITES, bCap = q.bytesCap || CL.LIMIT_BYTES;
    var wTotal = (q.writes | 0) + est.writes, bTotal = (+q.bytes || 0) + est.bytes;
    var cls = bud.zero ? ' over zero' : sel.cut ? ' cut' : '';
    var html = '<div class="budget' + cls + '">' +
      '<p class="sub-h">免费方案的额度' + (q.est ? '（估算）' : '') + (q.month ? ' · ' + esc(q.month) : '') + '</p>' +
      '<p class="b-big">这个月还能传约 <b>' + CL.n(bud.N) + '</b> 张 · 空间还够约 <b>' + CL.n(bud.M) + '</b> 张</p>' +
      '<div class="b-row"><span>写入次数 / 月</span>' + bar(wTotal / wCap, wTotal > wCap ? 'bad' : '') +
      '<span class="b-num">已用 ' + CL.n(q.writes) + ' / ' + CL.n(wCap) + ' · 这次约 <b>' + CL.n(est.writes) + '</b> 次</span></div>' +
      '<div class="b-row"><span>空间</span>' + bar(bTotal / bCap, bTotal > bCap ? 'bad' : '') +
      '<span class="b-num">已用 ' + CL.mb(q.bytes) + ' / ' + CL.mb(bCap) + ' · 这次约 <b>' + CL.mb(est.bytes) + '</b></span></div>' +
      '<p class="b-note">每张照片 1 次写入，每 20 张多 2 次（缩图包 + 清单）。到上限伺服器会自己停下来，案例库不会被 Vercel 停权。</p>';
    if (bud.zero === 'writes') {
      html += '<div class="b-warn"><b>这个月的写入次数用完了</b>下个月 1 号再传（到时再拖同一个文件夹就会接着传，传过的不会重传）。</div>';
    } else if (bud.zero === 'bytes') {
      html += '<div class="b-warn"><b>空间满了</b>先到「审核」删除隐藏的照片，释放空间，再回来传。</div>';
    } else if (sel.cut && sel.cutBy === 'bytes') {
      // 空间不够：下个月也不会变多，要先释放空间
      html += '<div class="b-warn b-cut"><b>空间只够再传约 ' + CL.n(sel.total) + ' 张</b>已先选好每个项目最重要的照片。其余的 ' + CL.n(sel.cut) +
        ' 张：先到「审核」删除隐藏的照片，释放空间，再拖同一个文件夹接着传（传过的不会重传）。</div>';
    } else if (sel.cut) {
      html += '<div class="b-warn b-cut"><b>这个月的额度只够再传约 ' + CL.n(sel.total) + ' 张</b>已先选好每个项目最重要的照片，其余的 ' + CL.n(sel.cut) +
        ' 张下个月再传（到时再拖同一个文件夹就会接着传）。</div>';
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

  /* ============================================================
     展开一个项目：小图格子（自己勾）
     格子是一直留着的元素：整个预览重画时搬回新的位置，小图不必重做；收起就放掉小图（revokeObjectURL）
     ============================================================ */
  var GRIDS = {};            // p.gi → {el, p, cells:{id:{el,box,img,badge}}, urls:{}, q:[], active:0}
  var LIVE_URLS = 0;
  function openGrid(p) {
    if (GRIDS[p.gi]) return;
    var g = { p: p, cells: {}, urls: {}, q: [], active: 0, closed: false, asked: {} };
    var el = document.createElement('div');
    el.className = 'pg';
    el.setAttribute('data-pg', p.gi);
    var cells = p.items.map(function (it) {
      return '<label class="pg-cell" data-id="' + it.id + '" title="' + esc(it.f) + '">' +
        '<span class="pg-img"><img alt="" decoding="async" /></span>' +
        '<span class="pg-meta"><input type="checkbox" data-pick="' + it.id + '" /><span class="pg-name">' + esc(it.f) + '</span></span>' +
        '<em class="pg-badge"></em></label>';
    }).join('');
    el.innerHTML = '<div class="pg-head"><span class="pg-count"></span>' +
      '<span class="muted pg-tip">自己勾过的项目就照你勾的传（N 改了也不变）。</span>' +
      '<button class="mini" type="button" data-reauto="' + p.gi + '" hidden>改回自动挑选</button></div>' +
      '<div class="pg-grid">' + cells + '</div>';
    g.el = el;
    g.scroll = el.querySelector('.pg-grid');
    g.count = el.querySelector('.pg-count');
    g.reauto = el.querySelector('[data-reauto]');
    var byId = {};
    p.items.forEach(function (it) { byId[it.id] = it; });
    g.byId = byId;
    Array.prototype.forEach.call(el.querySelectorAll('.pg-cell'), function (c) {
      var id = +c.getAttribute('data-id');
      g.cells[id] = { el: c, box: c.querySelector('input'), img: c.querySelector('img'), badge: c.querySelector('.pg-badge') };
    });
    // 看得到的才做小图
    if (typeof IntersectionObserver === 'function') {
      g.obs = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          if (!en.isIntersecting) return;
          g.obs.unobserve(en.target);
          askPreview(g, byId[+en.target.getAttribute('data-id')]);
        });
      }, { root: g.scroll, rootMargin: '240px' });
      Object.keys(g.cells).forEach(function (id) { g.obs.observe(g.cells[id].el); });
    } else {
      p.items.forEach(function (it) { askPreview(g, it); });
    }
    GRIDS[p.gi] = g;
  }
  function askPreview(g, it) {
    if (!it || g.asked[it.id] || g.closed) return;
    g.asked[it.id] = 1;
    g.q.push(it);
    pumpPreview(g);
  }
  function pumpPreview(g) {
    while (!g.closed && g.active < PREVIEW_CONC && g.q.length) previewOne(g, g.q.shift());
  }
  function previewOne(g, it) {
    g.active++;
    MB.clWork.preview(it.file, { long: 240 }).then(function (r) {
      if (g.closed) return;
      var u = URL.createObjectURL(r.blob);
      g.urls[it.id] = u;
      LIVE_URLS++;
      var c = g.cells[it.id];
      if (c) c.img.src = u;
    }, function () {
      var c = g.cells[it.id];
      if (c) c.el.classList.add('noimg');
    }).then(function () {
      g.active--;
      pumpPreview(g);
    });
  }
  function closeGrid(gi) {
    var g = GRIDS[gi];
    if (!g) return;
    g.closed = true;
    if (g.obs) g.obs.disconnect();
    Object.keys(g.urls).forEach(function (id) { URL.revokeObjectURL(g.urls[id]); LIVE_URLS--; });
    g.urls = {};
    g.q = [];
    if (g.el.parentNode) g.el.parentNode.removeChild(g.el);
    delete GRIDS[gi];
  }
  function closeAllGrids() { Object.keys(GRIDS).forEach(closeGrid); }
  function saveGridScroll() {
    var out = {};
    Object.keys(GRIDS).forEach(function (gi) { out[gi] = GRIDS[gi].scroll.scrollTop; });
    return out;
  }
  function mountGrids(scrolls) {
    Object.keys(GRIDS).forEach(function (gi) {
      var g = GRIDS[gi];
      var slot = document.querySelector('#plan-body [data-slot="' + gi + '"]');
      if (!slot || !g.p.include || S.projects[g.p.gi] !== g.p) { closeGrid(gi); return; }
      slot.appendChild(g.el);
      if (scrolls && scrolls[gi]) g.scroll.scrollTop = scrolls[gi];
      syncGrid(g);
    });
  }
  function syncGrid(g) {
    var p = g.p;
    var x = 0, y = 0, known = 0;
    var sNow = computeSel();
    var zero = !S.running && !!sNow.bud.zero;
    var space = sNow.cutBy === 'bytes' || sNow.bud.zero === 'bytes';
    // 没挑的连拍：跟挑了的是同一个镜头
    var picked = p.items.filter(function (it) { return isSelNow(it) && it.dh; }).map(function (it) { return it.dh; });
    function sameShot(it) {
      if (!it.dh) return false;
      for (var i = 0; i < picked.length; i++) if (MB.clPick.dist(it.dh, picked[i]) <= MB.clPick.SAME_SHOT) return true;
      return false;
    }
    p.items.forEach(function (it) {
      var c = g.cells[it.id];
      if (!c) return;
      var cat = it.h ? category(it) : '';
      var purged = cat === 'new' && isPurged(it.h);
      var sel = isSelNow(it), cut = isCutNow(it);
      var cls = 'pg-cell', badge = '', can = false, on = false;
      if (!it.h) { if (it.hashErr) { cls += ' bad unr'; badge = '读不到'; } else badge = '比对中'; }
      else if (cat === 'known' || cat === 'journal') { cls += ' known'; badge = '已在库里'; on = true; known++; }
      else if (cat === 'dup') { cls += ' dup'; badge = '已在别的项目'; }
      else {
        y++;
        can = true;                                       // 读不出来的也可以自己勾：压图时再试
        on = sel;
        if (sel) { cls += ' sel'; x++; }
        if (it.an === 'bad') { cls += ' bad'; badge = sel ? '读不出来 · 压图时再试' : '读不出来'; }
        else if (purged) { cls += ' purged'; badge = sel ? '删过 · 这次会再传' : '删过，不重传'; }
        else if (cut || zero) { cls += ' cut'; badge = space ? '空间不够' : '额度不够，下个月'; }
        else if (!sel && it.sameLib) badge = '库里有同一个镜头';
        else if (!sel && sameShot(it)) badge = '同一个镜头，已挑一张';
      }
      if (c.el.className !== cls) c.el.className = cls;
      if (c.badge.textContent !== badge) c.badge.textContent = badge;
      c.box.checked = on;
      c.box.disabled = !can || S.running;
    });
    g.count.innerHTML = '选了 <b>' + CL.n(x) + '</b> / ' + CL.n(y) + ' 张' + (known ? ' · 已在库里 ' + CL.n(known) + ' 张' : '');
    g.reauto.hidden = !p.touched;
  }

  function drawRun() {
    var c = S.counts;
    var items = S.queue || includedItems();
    var total = items.length;
    var fin = 0;
    items.forEach(function (it) { if (it.st === 'done' || it.st === 'known' || it.st === 'dup' || it.st === 'fail' || it.st === 'bad' || it.st === 'journal' || it.st === 'skip') fin++; });
    var skippedN = (S.scan ? S.scan.skipped.length : 0) + c.bad;
    var state = S.fatal ? '已停止' : S.done ? '完成' : S.paused ? '已暂停' : '上传中';
    var html = '<div class="run-head"><div><h3>' + state + (S.done && !S.fatal ? ' ✓' : '') + '</h3>' +
      '<p class="hint" id="run-note" aria-live="polite">' + esc(S.fatal || S.note || (S.done ? '全部处理完了。' : CQ.busy ? '登记中…' : '照片在这台电脑先压成 1200px 再传，原档不动。')) + '</p></div>' +
      (S.done ? '' : '<button class="btn ghost" type="button" id="pause">' + (S.paused ? '▶ 继续' : 'Ⅱ 暂停') + '</button>') + '</div>';
    html += '<div class="run-total">' + bar(total ? fin / total : 1, S.fatal ? 'bad' : '') + '<span>' + CL.n(fin) + ' / ' + CL.n(total) + ' 张</span></div>';
    html += '<div class="counts">' +
      cnt('uploaded', '已上传', c.uploaded, c.uploaded > c.committed ? '已登记 ' + c.committed : '') +
      cnt('known', '已在库里', c.known) + cnt('dup', '重复', c.dup) +
      (c.skip ? cnt('skip', '这次不传', c.skip) : '') +
      cnt('skipped', '略过', skippedN) + cnt('failed', '失败', c.failed, '', c.failed ? 'bad' : '') + '</div>';
    if (S.recent.length) {
      html += '<div class="recent">' + S.recent.map(function (h) {
        return CL.thumbs[h] ? '<img src="' + CL.thumbs[h] + '" alt="" />' : '';
      }).join('') + '</div>';
    }
    html += '<div class="run-projects">';
    included().forEach(function (p) {
      var st = projStats(p);
      var doneN = st.done + st.known + st.dup + st.fail + st.bad + st.skip;
      var label = doneN >= st.total ? (st.fail ? '<span class="tag warn">有失败</span>' : '<span class="tag ok">完成 ✓</span>') :
        st.active ? '<span class="tag on">进行中</span>' : '<span class="tag">等待</span>';
      html += '<div class="rp"><div class="rp-top"><b>' + esc(p.name) + '</b>' + label + '</div>' +
        bar(st.total ? doneN / st.total : 1) +
        '<span class="rp-n">' + doneN + ' / ' + st.total +
        (st.known ? ' · 已有 ' + st.known : '') + (st.dup ? ' · 重复 ' + st.dup : '') + (st.skip ? ' · 这次不传 ' + st.skip : '') +
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
      (S.fatal ? '<li>这次新增<b>' + CL.n(c.committed) + '</b></li>' : '') +
      '<li>已在库里（之前传过）<b>' + CL.n(c.known) + '</b></li>' +
      '<li>重复（同一张已在别的项目，只存一次）<b>' + CL.n(c.dup) + '</b></li>' +
      (c.skip ? '<li>这次不传（精选没挑、删过的、额度不够）<b>' + CL.n(c.skip) + '</b></li>' : '') +
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
    html += '<div class="btn-row">' + (fails.length && !S.fatal ? '<button class="btn gold" type="button" id="retry-failed">重试失败的 ' + fails.length + ' 张</button>' : '') +
      '<button class="btn" type="button" id="go-review">去审核 →</button>' +
      '<button class="btn ghost" type="button" id="again">再选一个文件夹</button></div></div>';
    $('#sum-body').innerHTML = html;
  }

  function retryFailed() {
    var fails = (S.queue || []).filter(function (it) { return it.st === 'fail'; });
    if (!fails.length || S.fatal) return;
    fails.forEach(function (it) { it.st = 'wait'; it.err = ''; it.tries = 0; });
    S.counts.failed -= fails.length;
    S.cursor = 0;
    S.running = true; S.done = false; S.paused = false; S.fatal = ''; S.stopKind = ''; S.stopReason = '';
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
      if (t.id === 'replan') { $('#plan').hidden = true; hashGen++; stopAnalysis(); closeAllGrids(); S.scan = null; return; }
      if (t.id === 'rehash') {
        // 读不到的再读一次（档案下载好、存好了）
        includedItems().forEach(function (it) { if (unread(it)) it.hashErr = ''; });
        invalidate();
        hashAll();
        draw();
        return;
      }
      var op = t.closest && t.closest('[data-open]');
      if (op) {
        var gi = +op.getAttribute('data-open');
        var p = S.projects[gi];
        if (GRIDS[gi]) closeGrid(gi); else if (p) openGrid(p);
        draw();
        return;
      }
      var ra = t.closest && t.closest('[data-reauto]');
      if (ra) { var rp = S.projects[+ra.getAttribute('data-reauto')]; if (rp) { reAuto(rp); draw(); } return; }
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
      } else if (t.hasAttribute('data-pick')) {
        if (S.running) return;
        var id = +t.getAttribute('data-pick');
        var it = null;
        for (var i = 0; i < S.items.length; i++) if (S.items[i].id === id) { it = S.items[i]; break; }
        if (it && !onPick(it, t.checked)) t.checked = !t.checked;
        draw();
      } else if (t.id === 'cur-on') {
        S.curUser = t.checked;
        invalidate();
        draw();
      } else if (t.id === 'cur-n') {
        var n = parseInt(t.value, 10);
        if (!(n >= 1)) n = S.curN;
        n = Math.max(1, Math.min(CUR_MAX, n));
        t.value = n;
        if (n !== S.curN) {
          S.curN = n;
          try { localStorage.setItem(N_KEY, String(n)); } catch (er) { /* 无痕模式 */ }
          // 改了 N = 要精选：打开（自己没动过的项目照新的 N 重新挑）
          S.curUser = true;
          invalidate();
        }
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
    CL.on('catalog', function () { catVer++; if (S.scan) render(); });
    CL.on('catalog-local', function () { catVer++; });
  }

  // 打字时只更新会变的部分，不重画输入框（免得游标跳掉）
  function updatePlanQuiet() {
    var go = $('#plan .plan-go');
    if (go) go.innerHTML = startButton(computeSel());
    var P = $('#plan-body').__pp;
    if (P) P.head.__html = null;        // 按钮换过了：下次一定重画
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
    commits: function () { return { busy: CQ.busy, pending: pendingCommits(), done: CQ.commits, recovering: CQ.recovering, halt: CQ.halt }; },
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
    estimate: function () { return estimate(); },
    // 测试用：这次会传哪几张（每个项目：f 路径）
    selection: function () {
      var sel = computeSel();
      function fin(x) { return x === Infinity ? null : x; }
      return {
        cur: sel.cur, curN: S.curN, ready: sel.ready, hashedAll: sel.hashedAll, analyzing: analyzing(),
        total: sel.total, cut: sel.cut, cutBy: sel.cutBy, over: sel.overRaw, plan: sel.bud.q.plan, zero: sel.bud.zero,
        N: fin(sel.bud.N), M: fin(sel.bud.M), allowed: fin(sel.bud.allowed),
        projects: sel.rows.map(function (r) {
          return {
            name: r.p.name, touched: !!r.p.touched, existing: r.existing, ready: r.ready,
            news: r.news.length, cands: r.cands.length, purged: r.purged.map(function (it) { return it.f; }),
            unread: r.unread.map(function (it) { return it.f; }), bad: r.bad,
            sel: r.p.items.filter(isSelNow).map(function (it) { return it.f; }),
            cut: r.p.items.filter(isCutNow).map(function (it) { return it.f; })
          };
        })
      };
    },
    previewUrls: function () { return LIVE_URLS; }
  };
})();
