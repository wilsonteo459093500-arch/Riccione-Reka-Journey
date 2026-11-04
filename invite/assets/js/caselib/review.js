/* ============================================================
   案例库 · 审核分页（review）
   ------------------------------------------------------------
   看 Claude 分好的标签、改错的、补没标的。真实项目名（客户名字）只在这一页出现。
   - 筛选：风格 × 柜类 × 空间 × 状态 × 项目 × 显示已隐藏；待确认排最前，再来新上传、自动、已确认
   - 每页 48 张缩图（缩图包：base + pack，读过的存 IndexedDB；读不到就用原图）
   - 点照片 → 右边编辑：空间（单选）、柜类（多选）、风格（不选 = 跟项目）、可当主图、状态
   - 项目资料：区域、房型、家庭特点、风格；隐藏 / 复原（没有删除）
   - 修改先排队、画面马上变；停手 45 秒（一直在改的话最多 2 分钟）、按「保存」、切到别的分页、
     离开这一页时一次送出（patch，source:'human'）—— 每次保存都是一次 Blob 写入（Hobby 每月约 2,000 次）
     人工改过的照片自动变「已确认」。401 → 登入后接着送，排队不会丢；网路断 → 等一下再试
   - 隐藏 / 复原：画面马上变，连按几张 4 秒内一起送（一次写入）；一次最多 400 张，多的分几次送
   - 额度（#rv-budget）：伺服器在 full 清单附的 quota —— 本月写入 / 1,800、空间 / 950 MB；Pro 方案不限
   - 整理空间（#rv-tidy，免费方案只有 1 GB）分两步：
     1. 只留最好的 N 张（MB.clPick.best）：一个项目或全部项目，其它的先隐藏 —— 可以复原
        不超过 N 张的项目也一样挑（同一个镜头只留一张，跟上传页一样）
     2. 删除隐藏的照片（purge）：要亲手打「删除」两个字、再按红色按钮（没有按 Enter 就删）；
        打完之后隐藏的照片变了就要再打一次。先把没保存的送出去，再一次 1,000 张慢慢删；
        删除中不能隐藏 / 复原，每批送出前再确认一次都还是隐藏的。
        删掉就找不回来，旧方案用到的那张会变空白；log 记下是谁删的
   - 改的标签存不进去、重试也没用（507 额度用完、503 storage_blocked）：不自动重试、讲白话，
     修改留在这一页，按「保存」才再送；也不挡删除（删除就是这时候要做的）
   - 分类（#rv-tags）：
     「按文件夹名字自动标」= MB.clCore.autoTags：文件夹名 → 风格、区域；子文件夹名 → 空间、柜类（source:'auto'，只填空的，
       人改过 / 确认过的不动；客户名字不会进到任何标签）
     「汇出标签档」：只有标签（没有照片、没有档案路径）的 JSON，给同事汇入、也是分类的备份（本机模式没有别的备份）。
       里面有项目的文件夹名（客户名字）：只给同事
     「汇入标签档」：这台电脑有的照片照规则套用（人工）；还没有的（本机模式）先记着，汇入那个文件夹时自动套用
       （「不用等了」= 不等了，全部清掉）。本机模式很久没汇出过：提醒他备份
   - 存在这台电脑（quota.plan = 'local'）：没有每月的写入上限，额度那一行显示这台电脑的空间
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB;
  var CL = MB.cl;
  var $ = CL.$, $$ = CL.$$, esc = CL.esc;

  var PAGE = 48;
  // 谁改的：本机模式的自动标签（文件夹名）记成 AUTO_BY —— 画面上写「自动」
  function who(by) { return CL.mode === 'local' && MB.clCore && by === MB.clCore.AUTO_BY ? '自动' : (by || ''); }
  var IDLE_MS = 45000;          // 停手多久才自动保存
  var MAX_WAIT_MS = 120000;     // 一直在改：最多隔多久存一次
  var HIDE_MS = 4000;           // 隐藏 / 复原：连按的几下一起送
  var MAX_ENTRIES = 400;        // 伺服器一次最多 400 笔
  var ORDER = { unsure: 0, 'new': 1, auto: 2, confirmed: 3 };
  var KEEP_MAX = 60;            // 「只留最好的 N 张」N 最多几张
  var PURGE_BATCH = 1000;       // 删除：伺服器一次最多 1,000 张
  var PACK_EST = 35 * 1024;     // 跟伺服器一样：还没记大小的旧缩图包，每张缩图估 35 KB
  var MIB = 1048576;
  var COLL = window.Intl && Intl.Collator ? new Intl.Collator('zh', { numeric: true }) : null;
  function cmp(a, b) { a = String(a || ''); b = String(b || ''); return COLL ? COLL.compare(a, b) : (a < b ? -1 : a > b ? 1 : 0); }

  var R = {
    f: { style: '', cab: '', room: '', status: '', pid: '', hidden: false },
    page: 0,
    list: [],                   // 筛选结果（快照：边改边看时不会突然重排）
    sel: '', mode: '', selPid: '', from: '',
    queue: { photos: {}, projects: {} },
    inflight: null,
    timer: 0, saving: false, again: false, now: false, lastSaved: 0, err: '', errCode: '', tries: 0, firstAt: 0,
    stuck: '',                  // 标签存不进去、重试也没用（额度用完 / store 暂停 / 没设定好）：不自动重试，按「保存」才再送
    hideQ: { photos: {}, projects: {} }, hideInflight: null, hideTimer: 0, hiding: false, hideAgain: false,
    hideProg: null,             // 分几次送的隐藏 / 复原：{i, n, op}
    packs: {},                  // pack 路径 → 'loading' | 'ok' | 'fail'
    // 整理空间
    tidyOpen: null,             // null = 还没决定（快满了就自己打开）
    keepN: (MB.clPick && MB.clPick.DEFAULT_N) || 6,
    ask: null,                  // 「只留最好的」确认框：{pid（'' = 全部项目）, plan, from}
    bulk: '',                   // 'keep' | 'restore' | 'purge'：大批的工作进行中
    lastKeep: null,             // 刚才「只留最好的」隐藏了哪些：{ids, pid}（复原用）
    keepMsg: '', keepErr: false,
    purgeMsg: '', purgeErr: false,
    purgeSig: ''                // 打好「删除」那一刻隐藏的是哪些（hiddenSig）：之后变了就要再打一次
  };

  function cat() { return CL.cat || { photos: {}, projects: {}, log: [], base: '' }; }
  function effStyle(ph) {
    var pr = cat().projects[ph.p] || {};
    return ph.style || pr.style || '';
  }
  function isHidden(ph) {
    var pr = cat().projects[ph.p];
    return !!(ph.hidden || (pr && pr.hidden));
  }

  /* ============================================================
     筛选 + 排序
     ============================================================ */
  function computeList() {
    var c = cat(), f = R.f;
    var out = [];
    Object.keys(c.photos).forEach(function (h) {
      var ph = c.photos[h];
      if (!f.hidden && isHidden(ph)) return;
      if (f.pid && ph.p !== f.pid) return;
      if (f.status && ph.status !== f.status) return;
      if (f.room) { if (f.room === '_none' ? ph.room : ph.room !== f.room) return; }
      if (f.cab) {
        var cabs = ph.cabinets || [];
        if (f.cab === '_none' ? cabs.length : cabs.indexOf(f.cab) < 0) return;
      }
      if (f.style) { var st = effStyle(ph); if (f.style === '_none' ? st : st !== f.style) return; }
      out.push(h);
    });
    out.sort(function (a, b) {
      var A = c.photos[a], B = c.photos[b];
      var d = (ORDER[A.status] == null ? 9 : ORDER[A.status]) - (ORDER[B.status] == null ? 9 : ORDER[B.status]);
      if (d) return d;
      var pa = (c.projects[A.p] || {}).name || '', pb = (c.projects[B.p] || {}).name || '';
      if (pa !== pb) return pa.localeCompare(pb, 'zh', { numeric: true });
      return String(A.f || '').localeCompare(String(B.f || ''), 'zh', { numeric: true });
    });
    R.list = out;
    var pages = Math.max(1, Math.ceil(out.length / PAGE));
    if (R.page >= pages) R.page = pages - 1;
  }

  /* ============================================================
     修改：排队 → 画面马上变 → 送出
     ============================================================ */
  function applyFields(kind, id, fields) {
    var rec = cat()[kind][id];
    if (!rec) return;
    Object.keys(fields).forEach(function (k) {
      if (k === 'desc') rec.desc = Object.assign({ zh: '', en: '' }, rec.desc || {}, fields.desc);
      else rec[k] = fields[k];
    });
    // 人工改了标签（没指定状态）→ 伺服器会标成「已确认」，这里先显示
    if (kind === 'photos' && fields.status == null && Object.keys(fields).length) rec.status = 'confirmed';
  }

  function edit(kind, id, field, val) {
    var q = R.queue[kind][id] || (R.queue[kind][id] = {});
    q[field] = val;
    var one = {};
    one[field] = val;
    // 已经明确选过状态的，后面改别的栏位不要把状态盖回「已确认」
    if (kind === 'photos' && field !== 'status' && q.status != null) one.status = q.status;
    applyFields(kind, id, one);
    scheduleFlush();
    drawSave();
    if (kind === 'photos') drawCard(id);
    else { drawProjectBar(); drawPageCards(); }
    drawDrawer();
  }

  function unsaved() {
    var n = 0;
    [R.queue, R.inflight].forEach(function (q) {
      if (!q) return;
      ['photos', 'projects'].forEach(function (k) {
        Object.keys(q[k]).forEach(function (id) { n += Object.keys(q[k][id]).length; });
      });
    });
    return n + hidesPending();
  }
  function hidesPending() {
    var n = 0;
    [R.hideQ, R.hideInflight].forEach(function (q) { if (q) n += Object.keys(q.photos).length + Object.keys(q.projects).length; });
    return n;
  }
  function dirty(kind, id) {
    return !!((R.queue[kind][id]) || (R.inflight && R.inflight[kind][id]));
  }

  // 停手 idleMs 才存；从第一个没存的修改算起最多 maxWaitMs（一直点也会定时存）
  function scheduleFlush() {
    if (R.saving) { R.again = true; return; }
    // 这个月存不进去了（额度用完 / store 暂停）：不再自动送，等业务按「保存」
    if (R.stuck) return;
    var now = Date.now();
    if (!R.firstAt) R.firstAt = now;
    var due = Math.min(now + MB.clReview.idleMs, R.firstAt + MB.clReview.maxWaitMs);
    if (R.timer) clearTimeout(R.timer);
    R.timer = setTimeout(function () { R.timer = 0; flush(); }, Math.max(0, due - now));
  }
  // 马上存（按「保存」、切分页、离开这一页）：标签和隐藏都送
  function flushNow(keepalive) {
    flushHides(keepalive);
    return flush(keepalive);
  }

  // 拿出最多 400 笔送出；其它留在排队
  function takeBatch() {
    var batch = { photos: {}, projects: {} }, n = 0;
    ['projects', 'photos'].forEach(function (k) {
      Object.keys(R.queue[k]).forEach(function (id) {
        if (n >= MAX_ENTRIES) return;
        batch[k][id] = R.queue[k][id];
        delete R.queue[k][id];
        n++;
      });
    });
    return n ? batch : null;
  }
  // 送失败：放回排队（排队里更新的值优先）
  function requeue(batch) {
    ['photos', 'projects'].forEach(function (k) {
      Object.keys(batch[k]).forEach(function (id) {
        R.queue[k][id] = Object.assign({}, batch[k][id], R.queue[k][id] || {});
      });
    });
  }

  function flush(keepalive) {
    if (R.timer) { clearTimeout(R.timer); R.timer = 0; }
    if (R.saving) { R.now = true; return Promise.resolve(); }
    var batch = takeBatch();
    if (!batch) { drawSave(); return Promise.resolve(); }
    R.firstAt = 0;
    if (takeable()) R.now = true;          // 超过 400 笔：剩下的存完马上接着送
    R.saving = true;
    R.inflight = batch;
    drawSave();
    var body = { op: 'patch', source: 'human', photos: batch.photos, projects: batch.projects };
    return CL.api('POST', '/api/catalog', body, { keepalive: keepalive === true }).then(function (r) {
      R.inflight = null;
      if (r.status === 200 && r.json) {
        CL.bumpRev(r.json.rev);
        if (r.json.changed) CL.addWrites(1);
        var now = Date.now(), c = cat();
        Object.keys(batch.photos).forEach(function (h) {
          var ph = c.photos[h];
          if (!ph) return;
          ph.by = CL.me; ph.ts = now;
          if (batch.photos[h].status == null) ph.status = 'confirmed';
          drawCard(h);
        });
        Object.keys(batch.projects).forEach(function (pid) {
          var pr = c.projects[pid];
          if (pr) { pr.by = CL.me; pr.ts = now; }
        });
        c.log = c.log || [];
        c.log.push({ op: 'patch', by: CL.me, ts: now, n: r.json.changed | 0 });
        R.lastSaved = now; R.err = ''; R.errCode = ''; R.tries = 0; R.stuck = '';
        drawLog();
        return;
      }
      if (hopeless(r)) {
        // 额度用完 / store 暂停 / 没设定好：重试也没用（每次还要伺服器读一次清单）→ 留着、不自动重试
        requeue(batch);
        R.tries = 0;
        R.stuck = patchStuckText(r);
        R.err = R.stuck;
        R.errCode = errCode(r);
        return;
      }
      if (r.status === 401) {
        requeue(batch);
        R.err = '登入过期：请再登入一次，修改都还在。'; R.errCode = '';
        CL.needLogin().then(function () { R.err = ''; flush(); });
        return;
      }
      if (r.status === 400 && r.json && (r.json.error === 'vocab' || r.json.error === 'unknown') && r.json.id) {
        // 一项不合格（例：词表改过）：拿掉那一项，其它的再送
        var id = r.json.id;
        delete batch.photos[id];
        delete batch.projects[id];
        requeue(batch);
        R.err = '有一项没存进去（' + (r.json.field || '') + '），已略过';
        R.now = true;
        return;
      }
      requeue(batch);
      R.tries++;
      R.stuck = '';
      var ms = CL.backoff(R.tries - 1, 3000, 60000);
      R.err = (r.status === 0 ? '网路断了' : r.status === 409 ? '太多人同时在改' : r.status === 429 ? '案例库在忙' : '保存失败') +
        '：' + Math.round(ms / 1000) + ' 秒后自动重试';
      R.errCode = errCode(r);
      R.timer = setTimeout(function () { R.timer = 0; flush(); }, ms);
    }).then(function () {
      R.saving = false;
      drawSave();
      drawDrawerTag();
      var now = R.now;
      R.now = false; R.again = false;
      if (R.timer || !takeable() || R.stuck) return;
      if (now) flush(); else scheduleFlush();
    });
  }
  function takeable() { return Object.keys(R.queue.photos).length + Object.keys(R.queue.projects).length > 0; }
  // 只放在 title（除错用），画面上不出现英文代码
  function errCode(r) { return r ? String(r.status) + (r.json && r.json.error ? ' ' + r.json.error : '') : ''; }
  function patchStuckText(r) {
    var e = (r && r.json && r.json.error) || '';
    if (e === 'storage_blocked') return '案例库被 Vercel 暂停中，改的标签先存不进去（还留在这一页，关掉就没了）。等恢复之后按「保存」。';
    if (e === 'not_configured') return '伺服器的设定不完整，改的标签存不进去：请告诉老板检查 Vercel 的设定。';
    if ((r && r.json && r.json.local) || CL.mode === 'local') return '这台电脑的空间满了，改的标签先存不进去（还留在这一页，关掉就没了）。清出一些硬碟空间、或删除隐藏的照片，再按「保存」。';
    return '这个月的 Blob 写入次数用完了，改的标签先存不进去（还留在这一页，关掉就没了）。下个月 1 号重算之后按「保存」。';
  }

  /* ---------- 隐藏 / 复原：画面马上变；连按的几张 4 秒内一起送（hide 一次、unhide 一次） ----------
     hideQ[kind][id] = {hide, before}：before = 伺服器上原本的样子（按回原样就不用送） */
  function setHidden(kind, id, hide) {
    var rec = cat()[kind][id];
    if (!rec) return;
    // 删除中：要删哪些已经定了，这时复原的照样会被删掉 → 先不给按
    if (R.bulk === 'purge') { CL.toast('正在删除隐藏的照片：等删完再隐藏或复原。', 4000); return; }
    var q = R.hideQ[kind];
    var before = q[id] ? q[id].before : rec.hidden;
    if (hide) rec.hidden = { by: CL.me, ts: Date.now() }; else delete rec.hidden;
    if (!!before === !!hide) delete q[id]; else q[id] = { hide: !!hide, before: before };
    refreshAll();
    drawSave();
    scheduleHides();
  }
  function scheduleHides() {
    if (R.hideTimer) { clearTimeout(R.hideTimer); R.hideTimer = 0; }
    if (!Object.keys(R.hideQ.photos).length && !Object.keys(R.hideQ.projects).length) return;
    R.hideTimer = setTimeout(function () { R.hideTimer = 0; flushHides(); }, MB.clReview.hideMs);
  }
  // 重试也没用的：store 被暂停、这个月额度用完、伺服器没设定好
  function hopeless(r) {
    var e = r && r.json && r.json.error;
    return !!r && (r.status === 507 || e === 'quota' || e === 'storage_blocked' || e === 'not_configured');
  }
  function retryable(r) {
    if (hopeless(r)) return false;
    return r.status === 0 || r.status === 409 || r.status === 429 || r.status === 500 || r.status === 502 || r.status === 503 || r.status === 504;
  }
  function retryWait(r, attempt) {
    if (r.status === 429 && r.json && r.json.retryAfter) return Math.min(300, +r.json.retryAfter || 10) * 1000;
    return CL.backoff(attempt, 1500, 15000);
  }
  // 回最后一次的回应（200 = 成功）
  function sendHide(body, keepalive) {
    var attempt = 0;
    function loop() {
      return CL.call('POST', '/api/catalog', body, { keepalive: keepalive === true }).then(function (r) {
        if (r.status === 200) { CL.bumpRev(r.json && r.json.rev); if (r.json && r.json.changed) CL.addWrites(1); return r; }
        if (retryable(r) && attempt < 3) {
          attempt++;
          return CL.sleep(retryWait(r, attempt - 1)).then(loop);
        }
        return r;
      });
    }
    return loop();
  }
  // 一次最多 400 笔：多的分几次送（先隐藏、后复原；每次 = 1 次 Blob 写入）
  function hideBodies(batch) {
    var bodies = [];
    [true, false].forEach(function (want) {
      var ids = [];
      ['projects', 'photos'].forEach(function (k) {
        Object.keys(batch[k]).forEach(function (id) { if (batch[k][id].hide === want) ids.push([k, id]); });
      });
      for (var i = 0; i < ids.length; i += MAX_ENTRIES) {
        var b = { op: want ? 'hide' : 'unhide', photos: [], projects: [] };
        ids.slice(i, i + MAX_ENTRIES).forEach(function (x) { b[x[0]].push(x[1]); });
        bodies.push(b);
      }
    });
    return bodies;
  }
  function opsZh(bodies) {
    var out = [];
    bodies.forEach(function (b) { var z = b.op === 'hide' ? '隐藏' : '复原'; if (out.indexOf(z) < 0) out.push(z); });
    return out.join('、');
  }
  function hideFailText(failed, r) {
    var what = opsZh(failed), j = (r && r.json) || {};
    if (r && (r.status === 507 || j.error === 'quota')) {
      return '这个月的 Blob 写入次数快用完了' + (j.writesLeft != null ? '（只剩约 ' + CL.n(j.writesLeft) + ' 次）' : '') +
        '，' + what + '没送出去，画面已经改回去。下个月 1 号会重算。';
    }
    if (j.error === 'storage_blocked') return '案例库被 Vercel 暂停中，' + what + '没送出去（画面已经改回去）：等恢复之后再试。';
    if (r && r.status === 0) return '网路断了，' + what + '没送出去，请再试一次';
    return what + '失败，请再试一次';
  }
  // 回 {failed: 几笔没送成, msg}
  function flushHides(keepalive) {
    if (R.hideTimer) { clearTimeout(R.hideTimer); R.hideTimer = 0; }
    if (R.hiding) { R.hideAgain = true; return Promise.resolve({ failed: 0, msg: '' }); }
    var batch = R.hideQ;
    if (!Object.keys(batch.photos).length && !Object.keys(batch.projects).length) return Promise.resolve({ failed: 0, msg: '' });
    R.hideQ = { photos: {}, projects: {} };
    R.hiding = true;
    R.hideInflight = batch;
    var bodies = hideBodies(batch);
    var failed = [], last = null, stop = false, chain = Promise.resolve();
    bodies.forEach(function (b, i) {
      chain = chain.then(function () {
        // 额度用完 / store 停了：后面几批也不用送了
        if (stop) { failed.push(b); return; }
        R.hideProg = bodies.length > 1 ? { i: i + 1, n: bodies.length, op: b.op } : null;
        drawSave();
        drawTidyMsg();
        return sendHide(b, keepalive).then(function (r) {
          if (r && r.status === 200) return;
          failed.push(b);
          last = r;
          if (hopeless(r)) stop = true;
        });
      });
    });
    return chain.then(function () {
      R.hiding = false;
      R.hideInflight = null;
      R.hideProg = null;
      var res = { failed: 0, msg: '' };
      if (failed.length) {
        // 没成功：画面改回去（之后又按过的，以新的为准）
        failed.forEach(function (b) {
          ['photos', 'projects'].forEach(function (k) {
            b[k].forEach(function (id) {
              var rec = cat()[k][id], x = batch[k][id];
              if (!rec || R.hideQ[k][id]) return;
              if (x.before) rec.hidden = x.before; else delete rec.hidden;
            });
          });
        });
        failed.forEach(function (b) { res.failed += b.photos.length + b.projects.length; });
        res.msg = hideFailText(failed, last);
        refreshAll();
        CL.toast(res.msg, 5000);
      } else {
        var ops = bodies.map(function (b) { return b.op; });
        var mixed = ops.indexOf('hide') >= 0 && ops.indexOf('unhide') >= 0;
        CL.toast(mixed ? '已隐藏 / 复原' : ops[0] === 'hide' ? '已隐藏（可以复原）' : '已复原');
      }
      drawSave();
      drawTidyMsg();
      if (R.hideAgain || Object.keys(R.hideQ.photos).length || Object.keys(R.hideQ.projects).length) { R.hideAgain = false; scheduleHides(); }
      return res;
    });
  }
  // 大批的：不等 4 秒，一直送到排队清空（中途又有人按的也一起送）。回 {failed, msg}
  function settleHides() {
    var res = { failed: 0, msg: '' };
    function loop() {
      if (R.hiding) return CL.sleep(150).then(loop);
      if (!Object.keys(R.hideQ.photos).length && !Object.keys(R.hideQ.projects).length) return res;
      return flushHides().then(function (r) {
        if (r && r.failed) { res.failed += r.failed; res.msg = r.msg; }
        return loop();
      });
    }
    return loop();
  }

  /* ============================================================
     额度：伺服器在 full 清单附的 quota（这个月写入、总空间、上限）
     ============================================================ */
  function quotaNow() {
    var c = CL.cat;
    if (!c) return null;
    var local = CL.monthWrites ? CL.monthWrites(c) : 0;
    var q = c.quota && typeof c.quota === 'object' ? c.quota : null;
    // 旧的伺服器没有 quota：从清单的 usage 估，只有写入次数
    if (!q) return { plan: 'hobby', writes: local, cap: CL.LIMIT_WRITES || 2000, writeCap: null, bytes: null, bytesCap: null };
    return {
      plan: q.plan === 'pro' || q.plan === 'local' ? q.plan : 'hobby',
      writes: Math.max(q.writes | 0, local),     // 自己刚写的（CL.addWrites）也算进去
      cap: q.uploadCap, writeCap: q.writeCap,
      bytes: typeof q.bytes === 'number' ? q.bytes : null, bytesCap: q.bytesCap || null,
      bytesLeft: typeof q.bytesLeft === 'number' ? q.bytesLeft : null
    };
  }
  function mbNum(b) {
    var m = Math.max(0, b || 0) / MIB;
    return m < 10 ? m.toFixed(1) : CL.n(Math.round(m));
  }
  function quotaWarn(q) {
    if (!q || q.plan === 'pro' || q.plan === 'local') return false;
    return (q.cap && q.writes > q.cap * 0.8) || (q.bytes != null && q.bytesCap && q.bytes > q.bytesCap * 0.8);
  }
  function spaceText(q) {
    if (!q || q.bytes == null) return '';
    return '空间约 ' + mbNum(q.bytes) + (q.bytesCap ? ' / ' + mbNum(q.bytesCap) : '') + ' MB';
  }

  /* ============================================================
     第 1 步：只留最好的 N 张（其它的隐藏，可以复原）
     ============================================================ */
  function photoCount(pid, hiddenOnly) {
    var c = cat(), n = 0;
    Object.keys(c.photos).forEach(function (h) { var ph = c.photos[h]; if (ph.p === pid && (!hiddenOnly || ph.hidden)) n++; });
    return n;
  }
  function pickItem(h) {
    var ph = cat().photos[h];
    return { id: h, w: ph.w, h: ph.h, dh: ph.dh, shot: ph.shot, f: ph.f };
  }
  // pid = '' → 全部项目（隐藏的项目不算）。回 {hide:[h], keep, total, projects, over（要隐藏一些的项目）, writes}
  // 不超过 N 张的项目也照样挑：同一个镜头只留一张（跟上传页的精选一样）
  function keepPlan(pid, n) {
    var c = cat(), by = {};
    var out = { hide: [], keep: 0, total: 0, projects: 0, over: 0, writes: 0 };
    if (!MB.clPick) return out;
    Object.keys(c.photos).forEach(function (h) {
      var ph = c.photos[h];
      if ((pid && ph.p !== pid) || isHidden(ph)) return;
      (by[ph.p] = by[ph.p] || []).push(h);
    });
    Object.keys(by).forEach(function (p) {
      var hs = by[p];
      out.projects++;
      out.total += hs.length;
      // 照路径排：同分的留文件夹里排前面的（每次挑的结果都一样）
      hs.sort(function (a, b) { return cmp(c.photos[a].f, c.photos[b].f) || (a < b ? -1 : 1); });
      var picked = MB.clPick.best(hs.map(pickItem), Math.min(n, hs.length)), keep = {};
      picked.forEach(function (h) { keep[h] = 1; });
      hs.forEach(function (h) { if (!keep[h]) out.hide.push(h); });
      if (picked.length < hs.length) out.over++;
      out.keep += picked.length;
    });
    out.writes = Math.ceil(out.hide.length / MAX_ENTRIES);
    return out;
  }
  // 一次改很多张（只改画面 + 排队，不重画）：回真的改了几张
  function queueHidden(kind, ids, hide) {
    var c = cat(), q = R.hideQ[kind], now = Date.now(), n = 0;
    ids.forEach(function (id) {
      var rec = c[kind][id];
      if (!rec || !!rec.hidden === !!hide) return;
      var before = q[id] ? q[id].before : rec.hidden;
      if (hide) rec.hidden = { by: CL.me, ts: now }; else delete rec.hidden;
      if (!!before === !!hide) delete q[id]; else q[id] = { hide: !!hide, before: before };
      n++;
    });
    return n;
  }
  function setKeepN(v) {
    var n = Math.round(+v);
    if (!(n >= 1)) return false;
    R.keepN = Math.min(KEEP_MAX, n);
    return true;
  }

  function runKeep(pid) {
    if (R.bulk) return Promise.resolve();
    var n = R.keepN, plan = keepPlan(pid, n);
    if (!plan.hide.length) return Promise.resolve();
    var changed = queueHidden('photos', plan.hide, true);
    R.lastKeep = { ids: plan.hide.slice(), pid: pid || '' };
    R.bulk = 'keep';
    R.keepMsg = '隐藏中…'; R.keepErr = false;
    render();
    drawSave();
    return settleHides().then(function (res) {
      R.bulk = '';
      var c = cat();
      // 没送成的已经改回去了：只留真的隐藏好的（复原用）
      R.lastKeep.ids = R.lastKeep.ids.filter(function (h) { return c.photos[h] && c.photos[h].hidden; });
      var ok = R.lastKeep.ids.length;
      if (!ok) R.lastKeep = null;
      if (res.failed) {
        R.keepErr = true;
        R.keepMsg = (ok ? '隐藏了 ' + CL.n(ok) + ' 张；' + CL.n(changed - ok) + ' 张没送出去。' : '') + res.msg;
      } else {
        R.keepErr = false;
        R.keepMsg = '已隐藏 ' + CL.n(ok) + ' 张（可以复原），留下 ' + CL.n(plan.keep) + ' 张。';
        CL.toast('已隐藏 ' + CL.n(ok) + ' 张（可以复原）', 4000);
      }
      render();
    });
  }
  // 复原：刚才「只留最好的」隐藏的、或一个项目里隐藏的照片
  function runRestore(ids, label) {
    if (R.bulk) return Promise.resolve();
    var n = queueHidden('photos', ids, false);
    if (!n) return Promise.resolve();
    R.bulk = 'restore';
    R.keepMsg = '复原中…'; R.keepErr = false;
    render();
    drawSave();
    return settleHides().then(function (res) {
      R.bulk = '';
      var c = cat();
      if (R.lastKeep) {
        R.lastKeep.ids = R.lastKeep.ids.filter(function (h) { return c.photos[h] && c.photos[h].hidden; });
        if (!R.lastKeep.ids.length) R.lastKeep = null;
      }
      if (res.failed) { R.keepErr = true; R.keepMsg = res.msg; }
      else {
        R.keepErr = false;
        R.keepMsg = '已复原' + (label || '') + ' ' + CL.n(n) + ' 张';
        CL.toast(R.keepMsg);
      }
      render();
    });
  }
  function restoreProject(pid) {
    var c = cat();
    var ids = Object.keys(c.photos).filter(function (h) { return c.photos[h].p === pid && c.photos[h].hidden; });
    return runRestore(ids, '这个项目隐藏的');
  }

  /* ---------- 确认框：会隐藏几张、留下几张；N 在这里也可以改 ---------- */
  function openAsk(pid) {
    if (!MB.clPick || R.bulk) return;
    R.ask = { pid: pid || '', from: document.activeElement };
    var box = $('#rv-ask');
    var pr = pid ? cat().projects[pid] : null;
    $('#rv-ask-t').textContent = pr ? '「' + pr.name + '」只留最好的' : '每个项目都只留最好的';
    $('#rv-ask-lbl').textContent = pr ? '这个项目只留最好的' : '每个项目只留最好的';
    $('#rv-ask-n').value = R.keepN;
    box.hidden = false;
    document.body.classList.add('rv-asking');
    drawAsk();
    var ok = $('#rv-ask [data-ask="ok"]');
    (ok.disabled ? $('#rv-ask-n') : ok).focus();
  }
  function closeAsk() {
    if (!R.ask) return;
    var from = R.ask.from;
    R.ask = null;
    $('#rv-ask').hidden = true;
    document.body.classList.remove('rv-asking');
    if (from && from.focus && document.body.contains(from)) from.focus();
  }
  function drawAsk() {
    if (!R.ask) return;
    var n = R.keepN, plan = keepPlan(R.ask.pid, n);
    var q = quotaNow();
    R.ask.plan = plan;
    var html;
    if (!plan.total) {
      html = '<p class="big">没有可以挑的照片（都已经隐藏了）。</p>';
    } else if (!plan.hide.length) {
      html = '<p class="big">' + (R.ask.pid ? '这个项目 ' + CL.n(plan.total) + ' 张都留下' : '每个项目的照片都留下') +
        '：不超过 ' + n + ' 张，也没有同一个角度重复拍的，不用隐藏。</p>';
    } else {
      html = '<p class="big">会隐藏 <b>' + CL.n(plan.hide.length) + '</b> 张（可以复原），留下 <b>' + CL.n(plan.keep) + '</b> 张</p>';
      if (!R.ask.pid) html += '<p>' + CL.n(plan.projects) + ' 个项目里有 ' + CL.n(plan.over) + ' 个要隐藏一些（超过 ' + n + ' 张，或同一个角度拍了几张）；其它的不动。</p>';
      else if (plan.total <= n) html += '<p>这个项目不超过 ' + n + ' 张，隐藏的是同一个角度重复拍的（每个角度留最好的一张）。</p>';
      html += '<p>要送 ' + CL.n(plan.writes) + ' 次（每次最多 ' + MAX_ENTRIES + ' 张，每次算 1 次 Blob 写入）。</p>';
      if (q && q.plan !== 'pro' && q.writeCap) {
        var left = Math.max(0, q.writeCap - q.writes);
        if (left < plan.writes + 1) html += '<p class="warn">这个月的写入次数不够（只剩约 ' + CL.n(left) + ' 次），可能有一部分送不出去。</p>';
      }
      html += '<p class="muted">隐藏只是不给 VISI 用，空间不会马上空出来；要空出空间，之后到「整理空间」第 2 步删除。</p>';
    }
    $('#rv-ask-num').innerHTML = html;
    var ok = $('#rv-ask [data-ask="ok"]');
    ok.disabled = !plan.hide.length || !!R.bulk;
    ok.textContent = plan.hide.length ? '隐藏 ' + CL.n(plan.hide.length) + ' 张' : '确定隐藏';
  }

  /* ============================================================
     第 2 步：删除隐藏的照片（释放空间）—— 删掉就找不回来
     ============================================================ */
  function packBytes(pr) {
    return typeof pr.pb === 'number' && isFinite(pr.pb) && pr.pb >= 0 ? pr.pb : Math.max(0, pr.n | 0) * PACK_EST;
  }
  // 隐藏的照片（照片自己隐藏，或它的项目隐藏）有几张、占多少空间；整个项目删光的话缩图包也一起删
  function hiddenStats() {
    var c = cat(), ids = [], sz = 0, per = {}, all = {};
    Object.keys(c.photos).forEach(function (h) {
      var ph = c.photos[h];
      all[ph.p] = (all[ph.p] || 0) + 1;
      if (!isHidden(ph)) return;
      ids.push(h);
      sz += Math.max(0, +ph.sz || 0);
      per[ph.p] = (per[ph.p] || 0) + 1;
    });
    var packs = 0;
    Object.keys(per).forEach(function (pid) { if (per[pid] === all[pid] && c.projects[pid]) packs += packBytes(c.projects[pid]); });
    return { ids: ids, sz: sz, freed: sz + packs, projects: Object.keys(per).length };
  }
  function lastPurge() {
    var log = cat().log || [];
    for (var i = log.length - 1; i >= 0; i--) if (log[i] && log[i].op === 'purge') return log[i];
    return null;
  }
  function purgeWordOk() {
    var w = $('#rv-purge-word');
    return !!w && w.value.trim() === '删除';
  }
  function clearPurgeWord() { var w = $('#rv-purge-word'); if (w) w.value = ''; R.purgeSig = ''; }
  // 隐藏的是哪些（张数 + 大小 + hash 加总）：打「删除」那一刻记下来，之后变了就要再打一次
  function hiddenSig() {
    var c = cat(), n = 0, sz = 0, x = 0;
    Object.keys(c.photos).forEach(function (h) {
      var ph = c.photos[h];
      if (!isHidden(ph)) return;
      n++;
      sz += Math.max(0, +ph.sz || 0);
      x = (x + (parseInt(String(h).slice(0, 8), 16) || 0)) % 4294967296;
    });
    return { n: n, key: n + ':' + sz + ':' + x };
  }
  // 打了「删除」，而且打的时候确认的就是现在这些
  function purgeArmed(sig) {
    return purgeWordOk() && !!R.purgeSig && R.purgeSig === (sig || hiddenSig()).key;
  }

  // 删除前：没保存的修改、还没送的隐藏先送出去。回传还剩几项挡着不能删（0 = 可以删）
  // 改的标签这个月存不进去（R.stuck：额度用完 / store 暂停）：不挡删除 —— 删除正是现在要做的事；
  // 那些修改留在这一页（删掉的照片的修改跟着拿掉）。隐藏 / 复原一定要先送好（决定删哪些）
  function blocking() { return R.stuck ? hidesPending() : unsaved(); }
  function settleAll() {
    var end = Date.now() + 30000, rounds = 0;
    function loop() {
      if (!blocking()) return Promise.resolve(0);
      if (Date.now() > end || rounds > 8) return Promise.resolve(blocking());
      if (R.saving || R.hiding) return CL.sleep(200).then(loop);
      if (rounds && R.err) return Promise.resolve(blocking());   // 网路断、要登入……：别在这里一直重试
      rounds++;
      return flush().then(settleHides).then(loop);
    }
    return loop();
  }

  function sendPurge(batch) {
    var attempt = 0;
    var body = { op: 'purge', photos: batch, confirm: '删除' };
    function loop() {
      return CL.api('POST', '/api/catalog', body).then(function (r) {
        if (r.status === 401) {
          // 跟其它地方一样：登入框浮上来，登入后接着删
          setPurgeMsg('登入过期：请再登入一次，登入后会接着删。', true);
          return CL.needLogin().then(function () { setPurgeMsg('删除中…', false); return loop(); });
        }
        if (retryable(r) && attempt < 3) {
          attempt++;
          return CL.sleep(retryWait(r, attempt - 1)).then(loop);
        }
        return r;
      });
    }
    return loop();
  }
  function purgeFailText(r, removed) {
    var j = r.json || {};
    var done = removed ? '（已经删好的 ' + CL.n(removed) + ' 张不受影响）' : '';
    if (r.status === 507 || j.error === 'quota') {
      return '这个月的 Blob 写入次数快用完了' + (j.writesLeft != null ? '（只剩约 ' + CL.n(j.writesLeft) + ' 次）' : '') +
        '：删除也要用写入次数，为了不让 Vercel 停掉案例库，先停下来' + done + '。下个月 1 号重算之后再删。';
    }
    if (j.error === 'storage_blocked') return '案例库被 Vercel 暂停中，等恢复之后再删' + done + '。';
    if (j.error === 'not_configured') return '伺服器的设定不完整，没办法删除' + done + '：请告诉老板检查 Vercel 的设定。';
    if (j.error === 'not_hidden') return '有照片刚被别人复原了，所以这一批没删' + done + '。已经重新载入：请再看一下数字，要删的话再打一次「删除」。';
    if (j.error === 'unknown') return '有照片已经不在案例库里了（可能别人刚删过）' + done + '。已经重新载入：请再看一下数字，要删的话再打一次「删除」。';
    if (r.status === 0) return '网路断了，删除没做完' + done + '：网路好了再打一次「删除」。';
    return '删除失败（' + r.status + (j.error ? ' ' + j.error : '') + '）' + done + '：请再试一次。';
  }
  // 删好的：画面上先拿掉（CDN 可能还给旧清单），额度用伺服器回的
  function dropPurged(hs, json) {
    var c = cat(), touched = {}, gone = {};
    hs.forEach(function (h) {
      var ph = c.photos[h];
      if (!ph) return;
      touched[ph.p] = 1;
      gone[h] = 1;
      delete c.photos[h];
      delete CL.thumbs[h];
      delete R.queue.photos[h];
      delete R.hideQ.photos[h];
    });
    var left = {};
    Object.keys(c.photos).forEach(function (h) { left[c.photos[h].p] = (left[c.photos[h].p] || 0) + 1; });
    Object.keys(touched).forEach(function (pid) {
      if (!c.projects[pid]) return;
      if (left[pid]) { c.projects[pid].n = left[pid]; return; }
      delete c.projects[pid];
      delete R.queue.projects[pid];
      delete R.hideQ.projects[pid];
    });
    c.purged = (Array.isArray(c.purged) ? c.purged : []).concat(Object.keys(gone));
    if (json && json.quota) c.quota = json.quota;
    c.log = c.log || [];
    c.log.push({ op: 'purge', by: CL.me, ts: Date.now(), n: (json && json.removed) | 0 });
    if (R.f.pid && !c.projects[R.f.pid]) R.f.pid = '';
    if (R.mode === 'photo' && !c.photos[R.sel]) { R.mode = ''; R.sel = ''; }
    if (R.mode === 'project' && !c.projects[R.selPid]) { R.mode = ''; R.selPid = ''; }
    if (R.lastKeep) {
      R.lastKeep.ids = R.lastKeep.ids.filter(function (h) { return !gone[h]; });
      if (!R.lastKeep.ids.length) R.lastKeep = null;
    }
  }
  function setPurgeMsg(msg, err) {
    R.purgeMsg = msg; R.purgeErr = !!err;
    drawTidyMsg();
  }
  function reloadAfter() {
    return CL.loadCatalog(true).then(function () { reapplyQueue(); render(); }, function () { render(); });
  }

  // 这一张现在还可以删：画面上还是隐藏的，也没有排队中 / 送出中的「复原」（照片或它的项目）
  function stillHidden(h) {
    var c = cat(), ph = c.photos[h];
    if (!ph || !isHidden(ph)) return false;
    return ![R.hideQ, R.hideInflight].some(function (q) {
      return q && ((q.photos[h] && !q.photos[h].hide) || (q.projects[ph.p] && !q.projects[ph.p].hide));
    });
  }

  function runPurge() {
    if (R.bulk || !purgeArmed()) return Promise.resolve();
    var want = hiddenStats().ids;
    if (!want.length) return Promise.resolve();
    R.bulk = 'purge';
    setPurgeMsg('先把还没保存的修改送出去…', false);
    drawTidy();
    // 抽屉开着的话：「复原这张 / 这个项目」先按不了（删除中复原的会被删掉）
    if (R.mode) drawDrawer();
    var done = { removed: 0, quota: null };
    function end(msg, err, reload) {
      R.bulk = '';
      clearPurgeWord();
      setPurgeMsg(msg, err);
      drawTidy();
      if (err) CL.toast(msg, 6000);
      return reload ? reloadAfter() : render();
    }
    return settleAll().then(function (left) {
      if (left) return end('还有 ' + CL.n(left) + ' 项修改没保存好' + (R.err ? '（' + R.err + '）' : '') + '：先等它保存完再删。', true, false);
      // 送的时候有隐藏没成功（已经改回去）：跟刚才确认的数字不一样 → 停下来让业务再看一次
      var c = cat();
      var list = want.filter(stillHidden);
      if (list.length !== want.length) return end('有 ' + CL.n(want.length - list.length) + ' 张没有隐藏好，所以先不删。请再看一下数字，要删的话再打一次「删除」。', true, false);
      // 照项目排：同一个项目的尽量在同一批删完（缩图包跟着删）
      list.sort(function (a, b) {
        var A = c.photos[a], B = c.photos[b];
        return cmp((c.projects[A.p] || {}).name, (c.projects[B.p] || {}).name) || cmp(A.p, B.p) || cmp(A.f, B.f) || (a < b ? -1 : 1);
      });
      var batches = [];
      for (var i = 0; i < list.length; i += PURGE_BATCH) batches.push(list.slice(i, i + PURGE_BATCH));
      function next(k) {
        if (k >= batches.length) {
          var msg = '已删除 ' + CL.n(done.removed) + ' 张';
          var sp = spaceText(done.quota ? { bytes: done.quota.bytes, bytesCap: done.quota.bytesCap } : quotaNow());
          if (sp) msg += ' · ' + sp;
          CL.toast(msg, 5000);
          // 改的标签这个月存不进去：删除照做了，那些修改还在这一页
          if (R.stuck && takeable()) msg += '。改的标签还没存进去（看下面「保存」旁边的说明）。';
          return end(msg, false, true);
        }
        // 再确认一次：送出前这一批都还是隐藏的（中途有人复原、新清单显示别人复原了 → 停下来）
        var back = batches[k].filter(function (h) { return !stillHidden(h); }).length;
        if (back) {
          return end('有 ' + CL.n(back) + ' 张刚被复原了，所以' + (done.removed ? '后面的' : '') + '没删' +
            (done.removed ? '（已经删好的 ' + CL.n(done.removed) + ' 张不受影响）' : '') +
            '。请再看一下数字，要删的话再打一次「删除」。', true, done.removed > 0);
        }
        setPurgeMsg('删除中… ' + (batches.length > 1 ? '第 ' + (k + 1) + ' / ' + batches.length + ' 批 · ' : '') +
          '已删 ' + CL.n(done.removed) + ' / ' + CL.n(list.length) + ' 张（不要关这一页）', false);
        return sendPurge(batches[k]).then(function (r) {
          if (r.status === 200 && r.json) {
            CL.bumpRev(r.json.rev);
            done.removed += r.json.removed | 0;
            if (r.json.quota) done.quota = r.json.quota;
            dropPurged(batches[k], r.json);
            render();
            return next(k + 1);
          }
          var e = r.json && r.json.error;
          return end(purgeFailText(r, done.removed), true, done.removed > 0 || e === 'not_hidden' || e === 'unknown');
        });
      }
      return next(0);
    });
  }

  /* ---------- 整理空间的面板（建一次，之后只换数字：打字中的输入框不会被重画） ---------- */
  function buildTidy() {
    var host = $('#rv-filters');
    if (!host || $('#rv-tidy')) return;
    var el = document.createElement('section');
    el.className = 'rv-tidy';
    el.id = 'rv-tidy';
    el.innerHTML =
      '<button type="button" class="tidy-head" id="rv-tidy-head" aria-expanded="false" aria-controls="rv-tidy-body">' +
        '<span class="tidy-t"><b>整理空间</b><small>只留最好的 · 删除隐藏的照片</small></span>' +
        '<span class="tidy-sum" id="rv-tidy-sum"></span><i class="tidy-arrow" aria-hidden="true"></i></button>' +
      '<div class="tidy-body" id="rv-tidy-body" hidden>' +
        '<p class="hint tidy-why" id="rv-tidy-why"></p>' +
        '<div class="tidy-steps">' +
          '<div class="tidy-step" id="rv-keep">' +
            '<p class="sub-h">第 1 步 · 先隐藏（可以复原）</p>' +
            '<label class="tidy-n">每个项目只留最好的 <input type="number" id="rv-keep-n" min="1" max="' + KEEP_MAX + '" step="1" inputmode="numeric" /> 张</label>' +
            '<p class="tidy-note">电脑帮你挑：同一个角度只留一张，横的、清楚的优先，每个空间（子文件夹）都留到。其它的先隐藏，VISI 就不会再用。</p>' +
            '<p class="tidy-num" id="rv-keep-info"></p>' +
            '<div class="btn-row"><button class="btn gold" type="button" id="rv-keep-all">每个项目都只留最好的</button></div>' +
            '<div class="tidy-msg" id="rv-keep-msg" aria-live="polite"></div>' +
            '<p class="tidy-note">只整理一个项目：上面「项目」选那个项目，按「只留最好的」。</p>' +
          '</div>' +
          '<div class="tidy-step del" id="rv-purge">' +
            '<p class="sub-h">第 2 步 · 删除隐藏的照片（释放空间）</p>' +
            '<p class="tidy-num" id="rv-purge-info"></p>' +
            '<p class="tidy-warn">删掉就<b>找不回来</b>（不能复原）。用过这些照片的旧方案，那个位置会变成空白。要留的先复原（勾「显示已隐藏」就看得到）。</p>' +
            '<label class="tidy-word">确定要删，请打「删除」两个字<input type="text" id="rv-purge-word" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="12" /></label>' +
            '<div class="btn-row"><button class="btn danger" type="button" id="rv-purge-go" disabled>删除隐藏的照片</button></div>' +
            '<div class="tidy-msg" id="rv-purge-msg" aria-live="polite"></div>' +
            '<p class="tidy-note" id="rv-purge-last"></p>' +
          '</div>' +
        '</div>' +
      '</div>';
    host.parentNode.insertBefore(el, host);

    var ask = document.createElement('div');
    ask.className = 'rv-ask';
    ask.id = 'rv-ask';
    ask.hidden = true;
    ask.setAttribute('role', 'dialog');
    ask.setAttribute('aria-modal', 'true');
    ask.setAttribute('aria-labelledby', 'rv-ask-t');
    ask.innerHTML = '<div class="ask-card">' +
      '<p class="sub-h">先隐藏 · 可以复原</p>' +
      '<h3 id="rv-ask-t"></h3>' +
      '<label class="tidy-n"><span id="rv-ask-lbl"></span> <input type="number" id="rv-ask-n" min="1" max="' + KEEP_MAX + '" step="1" inputmode="numeric" /> 张</label>' +
      '<div class="ask-num" id="rv-ask-num"></div>' +
      '<div class="ask-btns"><button class="btn ghost" type="button" data-ask="no">取消</button><button class="btn gold" type="button" data-ask="ok">确定隐藏</button></div>' +
      '</div>';
    document.body.appendChild(ask);
  }

  function drawTidy() {
    var el = $('#rv-tidy');
    if (!el || !CL.cat) return;
    var q = quotaNow(), st = hiddenStats();
    if (R.tidyOpen == null) {
      var saved = '';
      try { saved = localStorage.getItem('caselib-tidy') || ''; } catch (e) { /* 无痕模式 */ }
      // 没按过：快满了才自己打开
      R.tidyOpen = saved ? saved === '1' : quotaWarn(q);
    }
    var open = !!R.tidyOpen;
    el.classList.toggle('open', open);
    el.classList.toggle('warn', !!quotaWarn(q));
    $('#rv-tidy-head').setAttribute('aria-expanded', String(open));
    $('#rv-tidy-body').hidden = !open;
    var sum = [];
    if (spaceText(q)) sum.push(spaceText(q));
    sum.push(st.ids.length ? '已隐藏 ' + CL.n(st.ids.length) + ' 张（约 ' + CL.mb(st.freed) + '）' : '没有隐藏的照片');
    $('#rv-tidy-sum').textContent = sum.join(' · ');
    $('#rv-tidy-why').innerHTML = q.plan === 'local' ?
      '照片存在这台电脑：没有每月的次数限制，空间看这台电脑的硬碟。照片太多 VISI 也比较难挑：一样可以每个项目只留最好的几张，<b>先隐藏</b>（可以复原），确定不要了再<b>删除</b>。' :
      q.plan === 'pro' ?
      'Pro 方案不限额度。照片太多 VISI 也比较难挑：一样可以每个项目只留最好的几张。' :
      'Vercel 免费方案：每月最多 ' + CL.n(q.cap) + ' 次写入' + (q.bytesCap ? '、空间 ' + mbNum(q.bytesCap) + ' MB' : '') +
      '，超过会把<b>整个案例库停掉</b>（连旧方案的照片都打不开）。所以每个项目只留最好的几张：<b>先隐藏</b>（可以复原），确定不要了再<b>删除</b>，空间才会空出来。';
    if (!open) { drawTidyMsg(); return; }

    // 第 1 步
    var nIn = $('#rv-keep-n');
    if (document.activeElement !== nIn) nIn.value = R.keepN;
    nIn.disabled = !!R.bulk;
    var plan = keepPlan('', R.keepN);
    $('#rv-keep-info').innerHTML = plan.total ?
      '现在 ' + CL.n(plan.total) + ' 张（' + CL.n(plan.projects) + ' 个项目）' +
        (plan.hide.length ? ' → 留下 <b>' + CL.n(plan.keep) + '</b> 张、隐藏 <b>' + CL.n(plan.hide.length) + '</b> 张' : ' · 不用隐藏（每个项目都不超过 ' + R.keepN + ' 张，也没有重复的）') :
      '没有可以挑的照片';
    var all = $('#rv-keep-all');
    all.textContent = '每个项目都只留最好的 ' + R.keepN + ' 张';
    all.disabled = !!R.bulk || !plan.hide.length || !MB.clPick;

    // 第 2 步
    var info = '已隐藏 <b>' + CL.n(st.ids.length) + '</b> 张';
    if (st.ids.length) {
      info += ' · 约 <b>' + esc(CL.mb(st.freed)) + '</b>（' + CL.n(st.projects) + ' 个项目）';
      if (q.bytes != null) info += '<br>删掉后空间约 ' + mbNum(q.bytes) + ' → <b>' + mbNum(Math.max(0, q.bytes - st.freed)) + '</b>' + (q.bytesCap ? ' / ' + mbNum(q.bytesCap) : '') + ' MB';
    } else {
      info += '：要删的照片先在第 1 步隐藏，或点照片按「隐藏这张」。';
    }
    $('#rv-purge-info').innerHTML = info;
    $('#rv-purge-word').disabled = R.bulk === 'purge';
    var lp = lastPurge();
    $('#rv-purge-last').innerHTML = lp ? '上次删除：<b>' + esc(lp.by || '?') + '</b> · ' + esc(CL.time(lp.ts)) + ' · ' + CL.n(lp.n | 0) + ' 张' : '';
    drawTidyMsg();
  }
  // 只换按钮、讯息（送出中也会叫，要轻）
  function drawTidyMsg() {
    if (!$('#rv-tidy')) return;
    var km = $('#rv-keep-msg'), pm = $('#rv-purge-msg'), go = $('#rv-purge-go');
    var html = '';
    if (R.bulk === 'keep' || R.bulk === 'restore') {
      html = '<p>' + (R.hideProg ? (R.hideProg.op === 'hide' ? '隐藏中' : '复原中') + '… 第 ' + R.hideProg.i + ' / ' + R.hideProg.n + ' 批（每批最多 ' + MAX_ENTRIES + ' 张）' : esc(R.keepMsg || '送出中…')) + '</p>';
    } else {
      if (R.keepMsg) html = '<p class="' + (R.keepErr ? 'err' : 'ok') + '">' + esc(R.keepMsg) + '</p>';
      if (R.lastKeep && R.lastKeep.ids.length) {
        html += '<button class="mini" type="button" data-act="keep-undo">复原刚才隐藏的 ' + CL.n(R.lastKeep.ids.length) + ' 张</button>';
      }
    }
    km.innerHTML = html;
    var sig = hiddenSig(), n = sig.n;
    // 打好「删除」之后隐藏的照片变了（又隐藏 / 复原了几张、新清单）：那两个字确认的不是现在这些 → 清掉
    if (R.bulk !== 'purge' && R.purgeSig && R.purgeSig !== sig.key) {
      clearPurgeWord();
      R.purgeMsg = '隐藏的照片变了（现在 ' + CL.n(n) + ' 张）：要删的话再打一次「删除」。';
      R.purgeErr = false;
    }
    pm.innerHTML = R.purgeMsg ? '<p class="' + (R.purgeErr ? 'err' : R.bulk === 'purge' ? '' : 'ok') + '">' + esc(R.purgeMsg) + '</p>' : '';
    go.textContent = R.bulk === 'purge' ? '删除中…' : n ? '删除 ' + CL.n(n) + ' 张隐藏的照片' : '没有隐藏的照片';
    go.disabled = !!R.bulk || !n || !purgeArmed(sig);
    var undo = $('#rv-tidy [data-act="keep-undo"]');
    if (undo) undo.disabled = !!R.bulk;
  }

  function bindTidy() {
    var el = $('#rv-tidy');
    if (!el) return;
    el.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('#rv-tidy-head')) {
        R.tidyOpen = !R.tidyOpen;
        try { localStorage.setItem('caselib-tidy', R.tidyOpen ? '1' : '0'); } catch (err) { /* 无痕模式 */ }
        drawTidy();
        return;
      }
      if (t.closest('#rv-keep-all')) return openAsk('');
      if (t.closest('[data-act="keep-undo"]')) { if (R.lastKeep) runRestore(R.lastKeep.ids.slice(), '刚才隐藏的'); return; }
      if (t.closest('#rv-purge-go')) runPurge();
    });
    el.addEventListener('input', function (e) {
      if (e.target.id === 'rv-keep-n') { if (setKeepN(e.target.value)) { drawTidy(); drawProjectBar(); } }
      else if (e.target.id === 'rv-purge-word') {
        // 打对的那一刻记下现在隐藏的是哪些
        R.purgeSig = purgeWordOk() ? hiddenSig().key : '';
        drawTidyMsg();
      }
    });
    el.addEventListener('change', function (e) {
      if (e.target.id === 'rv-keep-n') { e.target.value = R.keepN; drawDrawer(); }
    });
    // 没有「按 Enter 就删」：用注音 / 仓颉 / 拼音打字时，选字的那个 Enter 也会进来（Safari）→ 一定要亲手按红色按钮

    var ask = $('#rv-ask');
    ask.addEventListener('click', function (e) {
      if (e.target === ask || e.target.closest('[data-ask="no"]')) return closeAsk();
      var ok = e.target.closest('[data-ask="ok"]');
      if (ok && !ok.disabled && R.ask) { var pid = R.ask.pid; closeAsk(); runKeep(pid); }
    });
    ask.addEventListener('input', function (e) {
      if (e.target.id === 'rv-ask-n' && setKeepN(e.target.value)) { drawAsk(); drawTidy(); drawProjectBar(); }
    });
    ask.addEventListener('change', function (e) { if (e.target.id === 'rv-ask-n') e.target.value = R.keepN; });
    // 确认框开着：Esc 关它（不关后面的抽屉）、← → 不换照片、Tab 不跑出去
    document.addEventListener('keydown', function (e) {
      if (!R.ask) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeAsk(); return; }
      if (e.key === 'Enter' && e.target.id === 'rv-ask-n') { e.preventDefault(); var ok = $('#rv-ask [data-ask="ok"]'); if (!ok.disabled) ok.click(); return; }
      if (e.key === 'Tab') {
        var f = $$('#rv-ask input, #rv-ask button').filter(function (x) { return !x.disabled; });
        if (!f.length) return;
        var i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    }, true);
  }

  /* ============================================================
     分类：按文件夹名字自动标、汇出 / 汇入标签档
     ============================================================ */
  var TG = { msg: '', err: false };
  function buildTags() {
    var host = $('#rv-filters');
    if (!host || $('#rv-tags')) return;
    var el = document.createElement('section');
    el.className = 'rv-tags';
    el.id = 'rv-tags';
    el.innerHTML = '<div class="tags-row"><span class="tags-t"><b>分类</b><small>文件夹名自动标 · 标签档：备份分类、给同事共用</small></span>' +
      '<button class="mini" type="button" id="rv-auto" title="文件夹名的风格、区域，子文件夹名的空间（厨房、主卧…）和柜子（橱柜、衣柜…）：只填空的，人改过的不动">按文件夹名字自动标</button>' +
      '<button class="mini" type="button" id="rv-export" title="备份分类、给同事汇入：只有标签（没有照片）。里面有项目的文件夹名（客户名字）：只给同事，不要传给客户、也不要放进有外人的群组">汇出标签档（备份）</button>' +
      '<label class="mini" id="rv-import-lbl" title="同事汇出的标签档：这台电脑有的照片马上套用，还没有的等汇入那个文件夹后自动套用">汇入标签档' +
        '<input type="file" id="rv-import" accept=".json,application/json" hidden /></label></div>' +
      '<div class="tidy-msg" id="rv-tags-msg" aria-live="polite"></div>';
    host.parentNode.insertBefore(el, host);
  }
  function drawTags() {
    var el = $('#rv-tags-msg');
    if (!el) return;
    var pend = (CL.cat && CL.cat.pendingTags) | 0;
    var html = TG.msg ? '<p class="' + (TG.err ? 'err' : R.bulk === 'tags' ? '' : 'ok') + '">' + esc(TG.msg) + '</p>' : '';
    // 只数照片（项目不算）；之后不会汇入那个文件夹的：「不用等了」
    if (pend && R.bulk !== 'tags') html += '<p class="muted">还有 ' + CL.n(pend) + ' 张照片的标签在等：汇入那个项目的文件夹后会自动套用。' +
      (CL.mode === 'local' ? ' <button class="linkish" type="button" data-act="clear-pending">不用等了</button>' : '') + '</p>';
    var nb = backupDue();
    if (nb && R.bulk !== 'tags') html += '<p class="warn">' + esc(nb) + '</p>';
    el.innerHTML = html;
    ['#rv-auto', '#rv-export'].forEach(function (id) { var b = $(id); if (b) b.disabled = !!R.bulk; });
    var inp = $('#rv-import');
    if (inp) inp.disabled = !!R.bulk;
  }
  function setTagsMsg(msg, err) { TG.msg = msg; TG.err = !!err; drawTags(); }
  /* 存在这台电脑没有别的备份：人改过的分类只在这个浏览器。还没汇出过、或上次汇出之后又改了不少 → 提醒一下 */
  var BACKUP_KEY = 'caselib-tags-backup';
  function backupDue() {
    var c = CL.cat;
    if (CL.mode !== 'local' || !c || !c.photos) return '';
    var conf = 0;
    Object.keys(c.photos).forEach(function (h) { if (c.photos[h].status === 'confirmed' || c.photos[h].status === 'unsure') conf++; });
    if (conf < 10) return '';
    var last = null;
    try { last = JSON.parse(localStorage.getItem(BACKUP_KEY) || 'null'); } catch (e) { last = null; }
    if (last && (c.rev | 0) - (last.rev | 0) < 30) return '';
    return (last ? '上次汇出标签档之后又改了不少' : '人看过的 ' + CL.n(conf) + ' 张照片还没备份') +
      '：按「汇出标签档（备份）」存一份 —— 浏览器资料被清掉、换电脑时，汇入同一个文件夹再汇入这个档，分类才救得回来。';
  }
  function tagsFail(r) {
    var j = (r && r.json) || {};
    if (hopeless(r)) return patchStuckText(r);
    if (r && r.status === 0) return '网路断了（或这台电脑的案例库还没准备好），请再试一次';
    if (j.error === 'kind') return '这不是标签档（要选「汇出标签档」存下来的 .json）';
    return '没做完（' + (r ? r.status : '?') + (j.error ? ' ' + j.error : '') + '），请再试一次';
  }
  // 一批一批送（每批最多 400 笔）：回 {ok, changed, r}
  function sendAll(bodies) {
    var changed = 0, i = 0;
    function next() {
      if (i >= bodies.length) return Promise.resolve({ ok: true, changed: changed });
      var b = bodies[i++];
      return CL.call('POST', '/api/catalog', b).then(function (r) {
        if (r.status !== 200 || !r.json) return { ok: false, changed: changed, r: r };
        CL.bumpRev(r.json.rev);
        if (r.json.changed) { changed += r.json.changed | 0; CL.addWrites(1); }
        return next();
      });
    }
    return next();
  }
  function patchBodies(p) {
    return MB.clCore.chunkPatch(p).map(function (c) { return { op: 'patch', source: c.source, photos: c.photos, projects: c.projects }; });
  }
  function hideBodiesOf(h) {
    var ids = h.projects.map(function (id) { return ['projects', id]; }).concat(h.photos.map(function (id) { return ['photos', id]; }));
    var out = [];
    for (var i = 0; i < ids.length; i += MAX_ENTRIES) {
      var b = { op: 'hide', photos: [], projects: [] };
      ids.slice(i, i + MAX_ENTRIES).forEach(function (x) { b[x[0]].push(x[1]); });
      out.push(b);
    }
    return out;
  }
  function tagsDone(msg) {
    return CL.loadCatalog(true).then(function () { reapplyQueue(); }, function () { /* 下次再拿 */ }).then(function () {
      R.bulk = '';
      setTagsMsg(msg, false);
      CL.toast(msg, 4000);
      render();
    });
  }
  function tagsStop(msg) {
    R.bulk = '';
    setTagsMsg(msg, true);
    render();
  }
  // 先把手上的修改存好（自动标签、标签档都照「人改过的不动」的规则：要先让清单知道人改了什么）
  function beginTags(what) {
    if (R.bulk || !MB.clCore || !CL.cat) return null;
    R.bulk = 'tags';
    setTagsMsg(what, false);
    drawTidyMsg();
    return settleAll().then(function (left) {
      if (left) { tagsStop('还有 ' + CL.n(left) + ' 项修改没保存好' + (R.err ? '（' + R.err + '）' : '') + '：先等它保存完再试。'); return false; }
      return true;
    });
  }

  function runAuto() {
    var go = beginTags('自动标签中…');
    if (!go) return Promise.resolve();
    return go.then(function (ok) {
      if (!ok) return;
      var p = MB.clCore.autoTags(cat());
      var nP = Object.keys(p.photos).length, nJ = Object.keys(p.projects).length;
      if (!nP && !nJ) return tagsDone('没有可以自动标的：空着的照片，文件夹名看不出空间、柜子、风格（人改过、确认过的不会动）。');
      return sendAll(patchBodies(p)).then(function (res) {
        if (!res.ok) return tagsStop(tagsFail(res.r));
        return tagsDone('已按文件夹名字自动标好 ' + CL.n(nP) + ' 张照片' + (nJ ? '、' + CL.n(nJ) + ' 个项目' : '') + '（标成「自动标签」，看一眼对不对就好）。');
      });
    });
  }

  function runExport() {
    var go = beginTags('汇出中…');
    if (!go) return Promise.resolve();
    return go.then(function (ok) {
      if (!ok) return;
      var c = cat(), n = Object.keys(c.photos).length;
      if (!n) return tagsStop('案例库还是空的：没有标签可以汇出。');
      var data = MB.clCore.exportTags(c, Date.now(), CL.me);
      var blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      var a = document.createElement('a');
      var d = new Date();
      a.href = URL.createObjectURL(blob);
      a.download = 'visi-标签档-' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '-' + n + '张.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.parentNode.removeChild(a); }, 1500);
      R.bulk = '';
      try { localStorage.setItem(BACKUP_KEY, JSON.stringify({ rev: c.rev | 0, at: Date.now() })); } catch (e) { /* 无痕模式 */ }
      setTagsMsg('已汇出 ' + CL.n(n) + ' 张照片、' + CL.n(Object.keys(data.projects).length) + ' 个项目的标签（没有照片本身），也是分类的备份：存好这个档。' +
        '给同事就连同一个文件夹一起给他：他先汇入文件夹、再汇入这个档（顺序反过来也可以）。' +
        '档里有项目的文件夹名（客户名字）：只给同事，不要传给客户、也不要放进有外人的群组。', false);
      render();
    });
  }

  function runImport(file) {
    if (!file) return Promise.resolve();
    var go = beginTags('汇入中…');
    if (!go) return Promise.resolve();
    return go.then(function (ok) {
      if (!ok) return;
      return file.text().then(function (text) {
        var tags;
        try { tags = MB.clCore.readTags(JSON.parse(text)); } catch (e) { return tagsStop('这不是标签档（要选「汇出标签档」存下来的 .json）。'); }
        var nPh = Object.keys(tags.photos).length;
        if (!nPh && !Object.keys(tags.projects).length) return tagsStop('这个标签档是空的。');
        // same = 这台电脑有、标签已经一样（不用改）：什么都没改时不要只说「套用了 0 张」（看起来像失败）
        var summary = function (n, m, k, same) {
          var parts = [];
          if (n || m || !same) parts.push('套用了 ' + CL.n(n) + ' 张、' + CL.n(m) + ' 个项目');
          if (same) parts.push(CL.n(same) + ' 张已经一样，不用改');
          if (k) parts.push(CL.n(k) + ' 张这台电脑还没有照片，等汇入那个文件夹后会自动套用');
          return parts.join('，') + '。';
        };
        if (CL.mode === 'local') {
          // 本机：交给 service worker 一次做完（还没有的照片它会记着）
          return CL.call('POST', '/api/catalog?op=importTags', { op: 'importTags', tags: tags }).then(function (r) {
            if (r.status !== 200 || !r.json) return tagsStop(tagsFail(r));
            CL.bumpRev(r.json.rev);
            return tagsDone(summary(r.json.photos | 0, r.json.projects | 0, r.json.pending | 0, r.json.same | 0));
          });
        }
        // 云端：一样的规则，用一般的 patch / hide 送；还没有的照片这里记不住
        var m = MB.clCore.mergeTags(cat(), tags);
        return sendAll(patchBodies(m.patch).concat(hideBodiesOf(m.hide))).then(function (res) {
          if (!res.ok) return tagsStop(tagsFail(res.r));
          return tagsDone(summary(m.n.photos, m.n.projects, 0, m.n.same).replace(/。$/, '') +
            (m.n.pending ? '；' + CL.n(m.n.pending) + ' 张案例库里还没有（先上传那个文件夹，再汇入一次这个档）' : '') + '。');
        });
      }, function () { return tagsStop('读不到这个档，请再选一次。'); });
    });
  }

  // 「不用等了」：汇入的标签档里、这台电脑没有的照片（之后也不会汇入那个文件夹）—— 不等了
  function runClearPending() {
    if (R.bulk || CL.mode !== 'local') return Promise.resolve();
    var n = (CL.cat && CL.cat.pendingTags) | 0;
    if (!window.confirm('不等那 ' + CL.n(n) + ' 张照片的标签了？之后再汇入那个文件夹，就要再汇入一次标签档。')) return Promise.resolve();
    R.bulk = 'tags';
    setTagsMsg('清除中…', false);
    return CL.call('POST', '/api/catalog', { op: 'clearPending' }).then(function (r) {
      if (r.status !== 200 || !r.json) return tagsStop(tagsFail(r));
      return tagsDone('好了：不再等那 ' + CL.n(r.json.cleared | 0) + ' 张照片的标签。');
    });
  }

  function bindTags() {
    var el = $('#rv-tags');
    if (!el) return;
    el.addEventListener('click', function (e) {
      if (e.target.closest('#rv-auto')) runAuto();
      else if (e.target.closest('#rv-export')) runExport();
      else if (e.target.closest('[data-act="clear-pending"]')) runClearPending();
    });
    el.addEventListener('change', function (e) {
      if (e.target.id !== 'rv-import') return;
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      runImport(f);
    });
  }

  /* ============================================================
     缩图包
     ============================================================ */
  function packsFor(pids) {
    var c = cat();
    pids.forEach(function (pid) {
      var pr = c.projects[pid];
      (pr && pr.packs || []).forEach(function (path) { if (!R.packs[path]) loadPack(path); });
    });
  }
  function loadPack(path) {
    R.packs[path] = 'loading';
    var base = cat().base || '';
    MB.clStore.get('packs', path).catch(function () { return null; }).then(function (hit) {
      if (hit) return hit;
      if (!base) throw new Error('no base');
      return fetch(base + path, { mode: 'cors', credentials: 'omit' }).then(function (r) {
        if (!r.ok) throw new Error('pack ' + r.status);
        return r.json();
      }).then(function (j) {
        // 缩图包写好就不会再变：存起来，下次不用再下载
        MB.clStore.put('packs', j, path).catch(function () { /* 存不进去就算了 */ });
        return j;
      });
    }).then(function (j) {
      Object.keys(j || {}).forEach(function (h) { if (!CL.thumbs[h]) CL.thumbs[h] = j[h]; });
      R.packs[path] = 'ok';
      fillThumbs();
    }, function () {
      // 读不到（例：Blob 没开 CORS）→ 这些照片改用原图
      R.packs[path] = 'fail';
      fillThumbs();
    });
  }
  function packsDone(pid) {
    var pr = cat().projects[pid];
    return !(pr && pr.packs || []).some(function (p) { return R.packs[p] === 'loading' || !R.packs[p]; });
  }
  function imgSrc(h) {
    if (CL.thumbs[h]) return CL.thumbs[h];
    var ph = cat().photos[h];
    if (ph && packsDone(ph.p) && cat().base) return cat().base + ph.k;
    return '';
  }
  function fillThumbs() {
    $$('#rv-grid .rv-card').forEach(function (el) {
      var img = el.querySelector('img');
      if (img.getAttribute('src')) return;
      var s = imgSrc(el.getAttribute('data-h'));
      if (s) img.setAttribute('src', s);
    });
  }

  /* ============================================================
     画面
     ============================================================ */
  function opt(v, label, cur) {
    return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(label) + '</option>';
  }

  function drawFilters() {
    var c = cat(), f = R.f;
    var counts = { unsure: 0, 'new': 0, auto: 0, confirmed: 0 };
    var perProj = {};
    Object.keys(c.photos).forEach(function (h) {
      var ph = c.photos[h];
      if (!f.hidden && isHidden(ph)) return;
      if (counts[ph.status] != null) counts[ph.status]++;
      perProj[ph.p] = (perProj[ph.p] || 0) + 1;
    });
    var html = '<label><span>风格</span><select data-f="style">' + opt('', '全部风格', f.style) +
      (MB.CASE_STYLES || []).map(function (s) { return opt(s.key, s.zh + ' ' + s.en, f.style); }).join('') + opt('_none', '（未定风格）', f.style) + '</select></label>';
    html += '<label><span>柜类</span><select data-f="cab">' + opt('', '全部柜类', f.cab) +
      (MB.CASE_CABINETS || []).map(function (s) { return opt(s.key, s.zh + ' ' + s.en, f.cab); }).join('') + opt('_none', '（没标柜类）', f.cab) + '</select></label>';
    html += '<label><span>空间</span><select data-f="room">' + opt('', '全部空间', f.room) +
      (MB.CASE_ROOMS || []).map(function (k) { return opt(k, CL.roomZh(k) + ' ' + CL.roomEn(k), f.room); }).join('') + opt('_none', '（没标空间）', f.room) + '</select></label>';
    html += '<label><span>状态</span><select data-f="status">' + opt('', '全部状态', f.status) +
      ['unsure', 'new', 'auto', 'confirmed'].map(function (k) { return opt(k, CL.STATUS[k].zh + '（' + counts[k] + '）', f.status); }).join('') + '</select></label>';
    var projs = Object.keys(c.projects).sort(function (a, b) { return String(c.projects[a].name).localeCompare(String(c.projects[b].name), 'zh', { numeric: true }); });
    html += '<label class="wide"><span>项目</span><select data-f="pid">' + opt('', '全部项目（' + projs.length + '）', f.pid) +
      projs.map(function (pid) {
        var pr = c.projects[pid];
        if (pr.hidden && !f.hidden && pid !== f.pid) return '';
        return opt(pid, (pr.name || pid) + '（' + (perProj[pid] || 0) + '）' + (pr.hidden ? ' · 已隐藏' : ''), f.pid);
      }).join('') + '</select></label>';
    html += '<label class="chk"><input type="checkbox" data-f="hidden"' + (f.hidden ? ' checked' : '') + ' /> 显示已隐藏</label>';
    $('#rv-filters').innerHTML = html;
  }

  function cardHtml(h) {
    var c = cat(), ph = c.photos[h];
    if (!ph) return '';
    var cap = [];
    if (ph.room) cap.push(CL.roomZh(ph.room));
    if (ph.cabinets && ph.cabinets.length) cap.push(CL.cabZh(ph.cabinets[0]) + (ph.cabinets.length > 1 ? ' +' + (ph.cabinets.length - 1) : ''));
    var st = effStyle(ph);
    var cls = 'rv-card st-' + esc(ph.status || 'new') + (isHidden(ph) ? ' hid' : '') + (dirty('photos', h) ? ' dirty' : '') + (R.sel === h && R.mode === 'photo' ? ' sel' : '');
    return '<button type="button" class="' + cls + '" data-h="' + esc(h) + '" title="' + esc(((c.projects[ph.p] || {}).name || '') + ' / ' + (ph.f || '')) + '">' +
      '<span class="ph"><img alt="" loading="lazy"' + (imgSrc(h) ? ' src="' + esc(imgSrc(h)) + '"' : '') + ' /></span>' +
      '<span class="st">' + esc((CL.STATUS[ph.status] || { zh: ph.status }).zh) + '</span>' +
      (ph.hero ? '<span class="hero" title="可当主图">★</span>' : '') +
      (isHidden(ph) ? '<span class="hidmark">已隐藏</span>' : '') +
      '<span class="cap">' + (cap.length ? esc(cap.join(' · ')) : '<i>未标</i>') + (st ? '<em>' + esc(CL.styleZh(st)) + '</em>' : '') + '</span></button>';
  }

  // 同一个按钮元素只换 class 和文字、图不动：
  // 整个换掉的话，刚好在按下与放开之间重画，那一下点击会不见（也会闪一下）
  function drawCard(h) {
    var el = $('#rv-grid .rv-card[data-h="' + h + '"]');
    if (!el) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = cardHtml(h);
    var nu = tmp.firstChild;
    el.className = nu.className;
    el.title = nu.title;
    var oldImg = el.querySelector('img');
    if (oldImg && !oldImg.getAttribute('src') && nu.querySelector('img').getAttribute('src')) oldImg.setAttribute('src', nu.querySelector('img').getAttribute('src'));
    Array.prototype.slice.call(el.children).forEach(function (c) { if (!c.classList.contains('ph')) el.removeChild(c); });
    Array.prototype.slice.call(nu.children).forEach(function (c) { if (!c.classList.contains('ph')) el.appendChild(c); });
  }

  function drawGrid() {
    var start = R.page * PAGE;
    var slice = R.list.slice(start, start + PAGE);
    var c = cat();
    var pids = {};
    slice.forEach(function (h) { pids[c.photos[h].p] = 1; });
    packsFor(Object.keys(pids));
    var total = Object.keys(c.photos).length;
    if (!total) {
      $('#rv-grid').innerHTML = '<div class="rv-empty"><b>案例库还是空的</b><span>先到「上传」把案例文件夹传上来。</span></div>';
    } else if (!slice.length) {
      $('#rv-grid').innerHTML = '<div class="rv-empty"><b>没有符合的照片</b><span>换个筛选看看。</span></div>';
    } else {
      $('#rv-grid').innerHTML = slice.map(cardHtml).join('');
    }
    var pages = Math.max(1, Math.ceil(R.list.length / PAGE));
    $('#rv-count').textContent = CL.n(R.list.length) + ' 张' + (R.list.length !== total ? '（共 ' + CL.n(total) + '）' : '');
    $('#rv-pager').innerHTML = pages > 1 ?
      '<button class="mini" type="button" data-page="-1"' + (R.page ? '' : ' disabled') + '>‹ 上一页</button><span>' + (R.page + 1) + ' / ' + pages + '</span>' +
      '<button class="mini" type="button" data-page="1"' + (R.page < pages - 1 ? '' : ' disabled') + '>下一页 ›</button>' : '';
  }

  function projSummary(pr) {
    var bits = [];
    if (pr.area) bits.push(pr.area);
    var pt = (MB.CASE_PTYPES || []).filter(function (x) { return x.key === pr.ptype; })[0];
    if (pt) bits.push(pt.zh);
    if (pr.style) bits.push(CL.styleZh(pr.style));
    (pr.traits || []).forEach(function (t) {
      var tr = (MB.CASE_TRAITS || []).filter(function (x) { return x.key === t; })[0];
      if (tr) bits.push(tr.zh);
    });
    return bits;
  }

  function drawProjectBar() {
    var el = $('#rv-proj');
    var pid = R.f.pid, pr = pid && cat().projects[pid];
    if (!pr) { el.hidden = true; return; }
    el.hidden = false;
    var bits = projSummary(pr);
    var nHid = photoCount(pid, true);
    el.innerHTML = '<div><p class="sub-h">项目 · 只给业务看</p><h3>' + esc(pr.name) + (pr.hidden ? ' <span class="tag warn">已隐藏</span>' : '') + '</h3>' +
      '<p class="muted">' + (pr.n | 0) + ' 张' + (nHid ? '（隐藏了 ' + CL.n(nHid) + ' 张）' : '') + (bits.length ? ' · ' + esc(bits.join(' · ')) : ' · 还没填区域 / 房型 / 风格') +
      (pr.by ? ' · 上次修改 ' + esc(who(pr.by)) + ' ' + esc(CL.time(pr.ts)) : '') + '</p></div>' +
      '<div class="btn-row"><button class="mini dark" type="button" data-act="proj-edit">编辑项目资料</button>' + keepButtons(pid) + '</div>';
  }
  // 项目列、项目资料共用：只留最好的 N 张、复原这个项目隐藏的照片
  function keepButtons(pid) {
    var pr = cat().projects[pid];
    if (!pr || !MB.clPick) return '';
    var nHid = photoCount(pid, true);
    return (pr.hidden ? '' : '<button class="mini" type="button" data-act="keep-proj"' + (R.bulk ? ' disabled' : '') + '>只留最好的 ' + R.keepN + ' 张…</button>') +
      (nHid ? '<button class="mini" type="button" data-act="unhide-proj-photos"' + (R.bulk ? ' disabled' : '') + '>复原隐藏的 ' + CL.n(nHid) + ' 张</button>' : '');
  }

  function chips(kind, items, cur, multi) {
    return '<div class="chips" data-kind="' + kind + '">' + items.map(function (x) {
      var on = multi ? cur.indexOf(x.key) >= 0 : cur === x.key;
      return '<button type="button" class="chip' + (on ? ' on' : '') + (x.fit ? ' fit' : '') + '" data-v="' + esc(x.key) + '" aria-pressed="' + on + '">' + esc(x.zh) + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</button>';
    }).join('') + '</div>';
  }

  function drawDrawer() {
    var d = $('#drawer');
    if (!R.mode) { d.classList.remove('on'); d.setAttribute('aria-hidden', 'true'); document.body.classList.remove('dr-open'); return; }
    d.classList.add('on');
    d.setAttribute('aria-hidden', 'false');
    document.body.classList.add('dr-open');
    var html = R.mode === 'project' ? projectPanel() : photoPanel();
    var body = $('#drawer .dr-body');
    var keep = body.scrollTop;
    body.innerHTML = html;
    body.scrollTop = keep;
  }

  function photoPanel() {
    var c = cat(), h = R.sel, ph = c.photos[h];
    if (!ph) return '<p class="muted">找不到这张照片</p>';
    var pr = c.projects[ph.p] || {};
    var idx = R.list.indexOf(h);
    var full = c.base ? c.base + ph.k : '';
    var cabFit = {};
    (MB.CASE_CABINETS || []).forEach(function (cb) { if (ph.room && (!cb.rooms.length || cb.rooms.indexOf(ph.room) >= 0)) cabFit[cb.key] = 1; });
    var rooms = (MB.CASE_ROOMS || []).map(function (k) { return { key: k, zh: CL.roomZh(k) }; });
    var cabs = (MB.CASE_CABINETS || []).map(function (cb) { return { key: cb.key, zh: cb.zh, fit: cabFit[cb.key] }; });
    var styles = [{ key: '', zh: '跟项目' + (pr.style ? '（' + CL.styleZh(pr.style) + '）' : '（未定）') }].concat((MB.CASE_STYLES || []).map(function (s) { return { key: s.key, zh: s.zh }; }));
    var stats = ['unsure', 'new', 'auto', 'confirmed'].map(function (k) { return { key: k, zh: CL.STATUS[k].zh }; });
    var desc = ph.desc || {};
    var html = '<div class="dr-nav"><button class="icon" type="button" data-nav="-1" aria-label="上一张"' + (idx > 0 ? '' : ' disabled') + '>←</button>' +
      '<span>' + (idx >= 0 ? (idx + 1) + ' / ' + R.list.length : '') + '</span>' +
      '<button class="icon" type="button" data-nav="1" aria-label="下一张"' + (idx >= 0 && idx < R.list.length - 1 ? '' : ' disabled') + '>→</button>' +
      (dirty('photos', h) ? '<span class="tag on">未保存</span>' : '') + '</div>' +
      '<div class="dr-img' + (isHidden(ph) ? ' hid' : '') + '"><img alt="" src="' + esc(CL.thumbs[h] || full) + '"' + (full ? ' data-full="' + esc(full) + '"' : '') + ' />' +
      (isHidden(ph) ? '<span class="hidmark">已隐藏</span>' : '') + '</div>' +
      '<p class="dr-path"><b>' + esc(pr.name || '') + '</b> / ' + esc(ph.f || '') + '</p>' +
      '<div class="dr-sec"><p class="sub-h">状态</p>' + chips('status', stats, ph.status, false) + '</div>' +
      '<div class="dr-sec"><p class="sub-h">空间 <i>Room</i></p>' + chips('room', rooms, ph.room || '', false) + '</div>' +
      '<div class="dr-sec"><p class="sub-h">柜类 <i>可多选 · 金框 = 这个空间常见的</i></p>' + chips('cabinets', cabs, ph.cabinets || [], true) + '</div>' +
      '<div class="dr-sec"><p class="sub-h">风格 <i>不选 = 跟项目</i></p>' + chips('style', styles, ph.style || '', false) + '</div>' +
      '<label class="switch"><input type="checkbox" data-field="hero"' + (ph.hero ? ' checked' : '') + ' /><span></span>可当主图 <small>拍得完整、光线好，适合放在方案的大图</small></label>' +
      ((desc.zh || desc.en) ? '<div class="dr-sec desc"><p class="sub-h">说明（分类时写的）</p>' + (desc.zh ? '<p>' + esc(desc.zh) + '</p>' : '') + (desc.en ? '<p class="muted">' + esc(desc.en) + '</p>' : '') + '</div>' : '') +
      '<p class="dr-meta">' + (ph.by ? '上次修改：<b>' + esc(who(ph.by)) + '</b> · ' + esc(CL.time(ph.ts)) : '') +
      ' · ' + ph.w + '×' + ph.h + (ph.sz ? ' · ' + CL.mb(ph.sz) : '') + (ph.hidden ? ' · 由 ' + esc(ph.hidden.by) + ' 隐藏' : '') + '</p>' +
      '<div class="dr-actions"><button class="btn gold" type="button" data-act="ok-next">确认 ✓ 下一张</button>' +
      '<button class="btn ghost" type="button" data-act="hide-photo"' + (R.bulk === 'purge' ? ' disabled title="正在删除，等删完再按"' : '') + '>' + (ph.hidden ? '复原这张' : '隐藏这张') + '</button>' +
      '<button class="btn ghost" type="button" data-act="proj-edit">项目资料</button></div>';
    return html;
  }

  function projectPanel() {
    var c = cat(), pid = R.selPid, pr = c.projects[pid];
    if (!pr) return '<p class="muted">找不到这个项目</p>';
    var ptypes = [{ key: '', zh: '不知道' }].concat((MB.CASE_PTYPES || []).map(function (x) { return { key: x.key, zh: x.zh }; }));
    var traits = (MB.CASE_TRAITS || []).map(function (x) { return { key: x.key, zh: x.zh }; });
    var styles = [{ key: '', zh: '未定' }].concat((MB.CASE_STYLES || []).map(function (s) { return { key: s.key, zh: s.zh }; }));
    var n = Object.keys(c.photos).filter(function (h) { return c.photos[h].p === pid; }).length;
    return '<div class="dr-nav">' + (R.from ? '<button class="mini" type="button" data-act="back">← 回到照片</button>' : '') +
      (dirty('projects', pid) ? '<span class="tag on">未保存</span>' : '') + '</div>' +
      '<p class="sub-h">项目 · 只给业务看</p><h3 class="dr-title">' + esc(pr.name) + '</h3>' +
      '<p class="muted">' + n + ' 张照片' + (pr.by ? ' · 上次修改 ' + esc(who(pr.by)) + ' ' + esc(CL.time(pr.ts)) : '') + '</p>' +
      '<p class="hint">这些资料会用在方案的「像你们这样的家」：只写区域和特点，<b>不会</b>印出项目名或客户名字。</p>' +
      '<div class="dr-sec"><p class="sub-h">区域 <i>例：Setia Alam</i></p><input type="text" data-pfield="area" maxlength="60" value="' + esc(pr.area || '') + '" placeholder="区域" /></div>' +
      '<div class="dr-sec"><p class="sub-h">房型</p>' + chips('ptype', ptypes, pr.ptype || '', false) + '</div>' +
      '<div class="dr-sec"><p class="sub-h">家庭特点 <i>可多选</i></p>' + chips('traits', traits, pr.traits || [], true) + '</div>' +
      '<div class="dr-sec"><p class="sub-h">风格 <i>整个项目</i></p>' + chips('pstyle', styles, pr.style || '', false) + '</div>' +
      '<div class="dr-actions"><button class="btn ghost" type="button" data-act="hide-project"' + (R.bulk === 'purge' ? ' disabled title="正在删除，等删完再按"' : '') + '>' + (pr.hidden ? '复原这个项目' : '隐藏这个项目') + '</button>' +
      (R.f.pid !== pid ? '<button class="btn ghost" type="button" data-act="only-project">只看这个项目</button>' : '') + '</div>' +
      (MB.clPick && !pr.hidden ? '<div class="dr-sec dr-keep"><p class="sub-h">照片太多 <i>免费方案空间有限</i></p>' +
        '<p class="hint">只留最好的几张（同一个角度只留一张，每个空间都留到），其它的先隐藏，可以复原。</p>' +
        '<div class="dr-actions">' + keepButtons(pid).replace(/class="mini"/g, 'class="btn ghost"') + '</div></div>' : '') +
      (pr.hidden ? '<p class="dr-meta">由 ' + esc(pr.hidden.by) + ' 隐藏 · ' + esc(CL.time(pr.hidden.ts)) + '：VISI 不会再挑这个项目的照片，旧方案照样打得开。</p>' : '');
  }

  // 背景的更新（保存完、别的分页登记了照片）只动这个小标签：整个重画会吃掉正在按的那一下
  function drawDrawerTag() {
    var nav = $('#drawer .dr-nav');
    if (!nav || !R.mode) return;
    var id = R.mode === 'photo' ? R.sel : R.selPid;
    var on = dirty(R.mode === 'photo' ? 'photos' : 'projects', id);
    var tag = nav.querySelector('.tag.on');
    if (on && !tag) nav.insertAdjacentHTML('beforeend', '<span class="tag on">未保存</span>');
    if (!on && tag) tag.parentNode.removeChild(tag);
  }

  function drawSave() {
    var n = unsaved();
    var el = $('#rv-save');
    var msg;
    if (R.err) msg = '<span class="err"' + (R.errCode ? ' title="' + esc(R.errCode) + '"' : '') + '>' + esc(R.err) + '</span>';
    else if (R.hiding && R.hideProg) msg = '<span>' + (R.hideProg.op === 'hide' ? '隐藏中' : '复原中') + '… 第 ' + R.hideProg.i + ' / ' + R.hideProg.n + ' 批</span>';
    else if (R.saving || R.hiding) msg = '<span>保存中…</span>';
    else if (R.bulk === 'purge') msg = '<span>删除中…（看上面「整理空间」）</span>';
    else if (n) msg = '<span>未保存 <b>' + n + '</b> 项 · 停手 ' + Math.round(MB.clReview.idleMs / 1000) + ' 秒后自动保存（或按「保存」）</span>';
    else if (R.lastSaved) msg = '<span class="ok">已保存 ✓ ' + esc(CL.time(R.lastSaved)) + '</span>';
    else msg = '<span class="muted">点照片改标签；改了会自动保存</span>';
    el.querySelector('.msg').innerHTML = msg;
    el.querySelector('#rv-savebtn').disabled = !n || (R.saving && !hidesPending());
    el.classList.toggle('dirty', n > 0);
    $('#tab-review-dot').hidden = !n;
    drawBudget();
  }
  // 这个月用掉几次 Blob 写入、空间用了多少（伺服器在 full 清单附的 quota；改标签每次保存 1 次）
  function drawBudget() {
    var b = $('#rv-budget');
    if (!b || !CL.cat) return;
    var q = quotaNow(), over = false;
    if (q.plan === 'local') {
      b.textContent = '存在这台电脑 · 已用约 ' + CL.mb(q.bytes || 0) + (q.bytesLeft != null ? ' / 可用约 ' + CL.mb(q.bytesLeft) : '');
      b.title = '照片存在这台电脑的浏览器里（免费，没有每月的次数限制）。不要清除浏览器的资料，不然照片会不见。';
    } else if (q.plan === 'pro') {
      b.textContent = 'Pro 方案 · 不限额度 · 本月写入约 ' + CL.n(q.writes) + ' 次';
      b.title = 'Vercel Pro 方案：写入次数、空间超过只是多付钱，案例库不会被停掉';
    } else {
      b.textContent = '本月 Blob 写入约 ' + CL.n(q.writes) + ' / ' + CL.n(q.cap) + (spaceText(q) ? ' · ' + spaceText(q) : '');
      over = q.writes >= q.cap || (q.bytes != null && q.bytesCap && q.bytes >= q.bytesCap);
      b.title = 'Vercel 免费方案：每月最多 ' + CL.n(q.cap) + ' 次写入' + (q.bytesCap ? '、空间最多 ' + mbNum(q.bytesCap) + ' MB' : '') +
        '，超过 Vercel 会把整个案例库停掉。上传每张照片、每次保存、隐藏 / 复原、删除都算写入。' +
        (over ? '现在已经到上限：先到「整理空间」删掉隐藏的照片，或等下个月 1 号重算。' : '');
    }
    b.classList.toggle('warn', !!quotaWarn(q));
    b.classList.toggle('over', !!over);
  }

  var OPS = { addPhotos: '上传', patch: '改标签', hide: '隐藏', unhide: '复原', purge: '删除' };
  function drawLog() {
    var log = (cat().log || []).slice(-20).reverse();
    $('#rv-log').innerHTML = log.length ? log.map(function (e) {
      return '<li' + (e.op === 'purge' ? ' class="del"' : '') + '><span class="t">' + esc(CL.time(e.ts)) + '</span><b>' + esc(who(e.by) || '?') + '</b> ' +
        esc(OPS[e.op] || e.op) + ' ' + CL.n(e.n | 0) + (e.op === 'patch' ? ' 项' : ' 张') + (e.op === 'purge' ? '（找不回来）' : '') + '</li>';
    }).join('') : '<li class="muted">还没有纪录</li>';
  }

  // 只重画这一页上的卡片（清单可能有几千张）
  function drawPageCards() {
    $$('#rv-grid .rv-card').forEach(function (el) { drawCard(el.getAttribute('data-h')); });
  }
  function refreshAll() {
    drawFilters();
    drawProjectBar();
    drawPageCards();
    drawDrawer();
    drawTidy();
  }

  // quiet：背景更新（拿到新清单、上传那边登记了）—— 抽屉开着就不重画它
  function render(recompute, quiet) {
    if (!CL.cat) return;
    if (recompute !== false) computeList();
    drawFilters();
    drawProjectBar();
    drawGrid();
    drawSave();
    drawLog();
    drawTidy();
    drawTags();
    if (R.ask) drawAsk();
    if (quiet && R.mode) drawDrawerTag();
    else drawDrawer();
  }

  /* ---------- 编辑器开关、上下张 ---------- */
  function openPhoto(h) {
    R.sel = h; R.mode = 'photo'; R.from = '';
    $$('#rv-grid .rv-card.sel').forEach(function (el) { el.classList.remove('sel'); });
    var el = $('#rv-grid .rv-card[data-h="' + h + '"]');
    if (el) el.classList.add('sel');
    drawDrawer();
    var img = $('#drawer .dr-img img');
    // 先给缩图，原图载好再换（大图在手机上要一下子）
    if (img && img.getAttribute('data-full') && img.getAttribute('src') !== img.getAttribute('data-full')) {
      var full = new Image();
      full.onload = function () { if (R.sel === h) { var cur = $('#drawer .dr-img img'); if (cur) cur.src = full.src; } };
      full.src = img.getAttribute('data-full');
    }
  }
  function openProject(pid, from) {
    R.selPid = pid; R.mode = 'project'; R.from = from || '';
    drawDrawer();
  }
  function closeDrawer() {
    R.mode = ''; R.sel = '';
    $$('#rv-grid .rv-card.sel').forEach(function (el) { el.classList.remove('sel'); });
    drawDrawer();
  }
  function nav(d) {
    var i = R.list.indexOf(R.sel);
    var j = i + d;
    if (i < 0 || j < 0 || j >= R.list.length) return false;
    var page = Math.floor(j / PAGE);
    if (page !== R.page) { R.page = page; drawGrid(); }
    openPhoto(R.list[j]);
    var el = $('#rv-grid .rv-card[data-h="' + R.list[j] + '"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    return true;
  }

  /* ---------- 事件 ---------- */
  function bind() {
    $('#rv-filters').addEventListener('change', function (e) {
      var k = e.target.getAttribute('data-f');
      if (!k) return;
      R.f[k] = k === 'hidden' ? e.target.checked : e.target.value;
      R.page = 0;
      render();
    });
    $('#rv-pager').addEventListener('click', function (e) {
      var b = e.target.closest('[data-page]');
      if (!b) return;
      R.page += +b.getAttribute('data-page');
      drawGrid();
      var top = $('#rv-filters');
      if (top && top.scrollIntoView) top.scrollIntoView({ block: 'start' });
    });
    $('#rv-grid').addEventListener('click', function (e) {
      var b = e.target.closest('.rv-card');
      if (b) openPhoto(b.getAttribute('data-h'));
    });
    $('#rv-proj').addEventListener('click', function (e) {
      if (e.target.closest('[data-act="proj-edit"]')) openProject(R.f.pid);
      else if (e.target.closest('[data-act="keep-proj"]')) openAsk(R.f.pid);
      else if (e.target.closest('[data-act="unhide-proj-photos"]')) restoreProject(R.f.pid);
    });
    $('#rv-savebtn').addEventListener('click', function () { flushNow(); });
    // 离开这一页（关分页、切到别的 App）：马上存（keepalive：页面关了请求照样送完）
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && unsaved()) flushNow(true); });
    window.addEventListener('pagehide', function () { if (unsaved()) flushNow(true); });
    $('#rv-reload').addEventListener('click', function () {
      CL.loadCatalog(true).then(function () { reapplyQueue(); render(); CL.toast('已重新载入'); }, function (e) { CL.toast(e.message, 4000); });
    });
    $('#rv-logbtn').addEventListener('click', function () {
      var l = $('#rv-logbox');
      l.hidden = !l.hidden;
      this.setAttribute('aria-expanded', String(!l.hidden));
    });

    var dr = $('#drawer');
    dr.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('.dr-x')) return closeDrawer();
      var nb = t.closest('[data-nav]');
      if (nb) return nav(+nb.getAttribute('data-nav'));
      var chip = t.closest('.chip');
      if (chip) return onChip(chip);
      var act = t.closest('[data-act]');
      if (!act) return;
      var a = act.getAttribute('data-act');
      var c = cat();
      if (a === 'ok-next') {
        edit('photos', R.sel, 'status', 'confirmed');
        if (!nav(1)) { CL.toast('这是最后一张了'); }
      } else if (a === 'hide-photo') {
        setHidden('photos', R.sel, !c.photos[R.sel].hidden);
      } else if (a === 'proj-edit') {
        var pid = R.mode === 'photo' && c.photos[R.sel] ? c.photos[R.sel].p : R.f.pid;
        openProject(pid, R.mode === 'photo' ? R.sel : '');
      } else if (a === 'back') {
        if (R.from) openPhoto(R.from);
      } else if (a === 'hide-project') {
        setHidden('projects', R.selPid, !c.projects[R.selPid].hidden);
      } else if (a === 'only-project') {
        R.f.pid = R.selPid; R.page = 0; render();
      } else if (a === 'keep-proj') {
        openAsk(R.selPid);
      } else if (a === 'unhide-proj-photos') {
        restoreProject(R.selPid);
      }
    });
    dr.addEventListener('change', function (e) {
      var t = e.target;
      if (t.getAttribute('data-field') === 'hero') edit('photos', R.sel, 'hero', t.checked);
    });
    // 区域：打字时不重画（游标不跳），停 0.6 秒才排队
    var areaTimer = 0;
    dr.addEventListener('input', function (e) {
      var t = e.target;
      if (t.getAttribute('data-pfield') !== 'area') return;
      clearTimeout(areaTimer);
      var pid = R.selPid, v = t.value;
      areaTimer = setTimeout(function () { queueArea(pid, v); }, 600);
    });
    // 失焦发生在「按下」别的按钮那一刻：这时重画抽屉，那个按钮的 click 就不见了 → 只排队
    dr.addEventListener('focusout', function (e) {
      if (e.target.getAttribute && e.target.getAttribute('data-pfield') === 'area') {
        clearTimeout(areaTimer);
        var v = e.target.value, pid = R.selPid, pr = cat().projects[pid];
        if (pr && pr.area !== v) queueArea(pid, v);
      }
    });
    document.addEventListener('keydown', function (e) {
      if (!R.mode || CL.tab !== 'review' || R.ask) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'Escape') closeDrawer();
      else if (R.mode === 'photo' && e.key === 'ArrowRight') { e.preventDefault(); nav(1); }
      else if (R.mode === 'photo' && e.key === 'ArrowLeft') { e.preventDefault(); nav(-1); }
    });

    CL.on('tab', function (t) {
      if (t !== 'review') { if (unsaved()) flushNow(); return; }
      if (CL.cat) render();
      CL.loadCatalog().then(function () { reapplyQueue(); render(); }, function (e) { CL.toast(e.message, 4000); });
    });
    CL.on('catalog', function () {
      reapplyQueue();
      if (CL.tab === 'review') render(true, true);
    });
    CL.on('catalog-local', function () { if (CL.tab === 'review') render(true, true); });
  }

  function queueArea(pid, v) {
    if (!cat().projects[pid]) return;
    var q = R.queue.projects[pid] || (R.queue.projects[pid] = {});
    q.area = v;
    applyFields('projects', pid, { area: v });
    scheduleFlush();
    drawSave();
    drawProjectBar();
    drawDrawerTag();
  }

  // 新拿到的清单还没有我们没送出的修改：叠回去
  function reapplyQueue() {
    [R.inflight, R.queue].forEach(function (q) {
      if (!q) return;
      ['photos', 'projects'].forEach(function (k) {
        Object.keys(q[k]).forEach(function (id) { applyFields(k, id, q[k][id]); });
      });
    });
    // 还没送出的隐藏 / 复原也叠回去（不然新清单一到，画面又变回没隐藏）
    [R.hideInflight, R.hideQ].forEach(function (q) {
      if (!q) return;
      ['photos', 'projects'].forEach(function (k) {
        Object.keys(q[k]).forEach(function (id) {
          var rec = cat()[k][id];
          if (!rec) return;
          if (q[k][id].hide) { if (!rec.hidden) rec.hidden = { by: CL.me, ts: Date.now() }; } else delete rec.hidden;
        });
      });
    });
  }

  function onChip(chip) {
    var kind = chip.parentNode.getAttribute('data-kind');
    var v = chip.getAttribute('data-v');
    var c = cat();
    if (R.mode === 'photo') {
      var ph = c.photos[R.sel];
      if (!ph) return;
      if (kind === 'status') edit('photos', R.sel, 'status', v);
      else if (kind === 'room') edit('photos', R.sel, 'room', ph.room === v ? '' : v);
      else if (kind === 'style') edit('photos', R.sel, 'style', v);
      else if (kind === 'cabinets') {
        var cur = (ph.cabinets || []).slice();
        var i = cur.indexOf(v);
        if (i >= 0) cur.splice(i, 1); else cur.push(v);
        // 照词表顺序存，同一组柜类不会因为点的顺序不同而「变了」
        var order = (MB.CASE_CABINETS || []).map(function (x) { return x.key; });
        cur.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
        edit('photos', R.sel, 'cabinets', cur);
      }
    } else if (R.mode === 'project') {
      var pr = c.projects[R.selPid];
      if (!pr) return;
      if (kind === 'ptype') edit('projects', R.selPid, 'ptype', v);
      else if (kind === 'pstyle') edit('projects', R.selPid, 'style', v);
      else if (kind === 'traits') {
        var tr = (pr.traits || []).slice();
        var j = tr.indexOf(v);
        if (j >= 0) tr.splice(j, 1); else tr.push(v);
        edit('projects', R.selPid, 'traits', tr);
      }
    }
  }

  var inited = false;
  MB.clReview = {
    init: function () {
      if (inited) return;
      inited = true;
      buildTidy();
      buildTags();
      bind();
      bindTidy();
      bindTags();
      drawSave();
    },
    idleMs: IDLE_MS,
    maxWaitMs: MAX_WAIT_MS,
    hideMs: HIDE_MS,
    unsaved: unsaved,
    flush: flushNow,
    state: function () { return R; },
    render: render,
    // 测试、除错用：只算不改
    keepPlan: function (pid, n) { return keepPlan(pid || '', n || R.keepN); },
    hiddenStats: hiddenStats,
    quota: quotaNow,
    autoTags: function () { return runAuto(); },
    importTags: function (file) { return runImport(file); }
  };
})();
