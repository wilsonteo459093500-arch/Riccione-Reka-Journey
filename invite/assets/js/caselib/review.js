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
   - 隐藏 / 复原：画面马上变，连按几张 4 秒内一起送（一次写入）
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB;
  var CL = MB.cl;
  var $ = CL.$, $$ = CL.$$, esc = CL.esc;

  var PAGE = 48;
  var IDLE_MS = 45000;          // 停手多久才自动保存
  var MAX_WAIT_MS = 120000;     // 一直在改：最多隔多久存一次
  var HIDE_MS = 4000;           // 隐藏 / 复原：连按的几下一起送
  var MAX_ENTRIES = 400;        // 伺服器一次最多 400 笔
  var ORDER = { unsure: 0, 'new': 1, auto: 2, confirmed: 3 };

  var R = {
    f: { style: '', cab: '', room: '', status: '', pid: '', hidden: false },
    page: 0,
    list: [],                   // 筛选结果（快照：边改边看时不会突然重排）
    sel: '', mode: '', selPid: '', from: '',
    queue: { photos: {}, projects: {} },
    inflight: null,
    timer: 0, saving: false, again: false, now: false, lastSaved: 0, err: '', tries: 0, firstAt: 0,
    hideQ: { photos: {}, projects: {} }, hideInflight: null, hideTimer: 0, hiding: false, hideAgain: false,
    packs: {}                   // pack 路径 → 'loading' | 'ok' | 'fail'
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
        R.lastSaved = now; R.err = ''; R.tries = 0;
        drawLog();
        return;
      }
      if (r.status === 401) {
        requeue(batch);
        R.err = '登入过期：请再登入一次，修改都还在。';
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
      var ms = CL.backoff(R.tries - 1, 3000, 60000);
      R.err = (r.status === 0 ? '网路断了' : r.status === 409 ? '太多人同时在改' : '保存失败（' + r.status + (r.json && r.json.error ? ' ' + r.json.error : '') + '）') +
        '：' + Math.round(ms / 1000) + ' 秒后自动重试';
      R.timer = setTimeout(function () { R.timer = 0; flush(); }, ms);
    }).then(function () {
      R.saving = false;
      drawSave();
      drawDrawerTag();
      var now = R.now;
      R.now = false; R.again = false;
      if (R.timer || !takeable()) return;
      if (now) flush(); else scheduleFlush();
    });
  }
  function takeable() { return Object.keys(R.queue.photos).length + Object.keys(R.queue.projects).length > 0; }

  /* ---------- 隐藏 / 复原：画面马上变；连按的几张 4 秒内一起送（hide 一次、unhide 一次） ----------
     hideQ[kind][id] = {hide, before}：before = 伺服器上原本的样子（按回原样就不用送） */
  function setHidden(kind, id, hide) {
    var rec = cat()[kind][id];
    if (!rec) return;
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
  function sendHide(body, keepalive) {
    var attempt = 0;
    function loop() {
      return CL.call('POST', '/api/catalog', body, { keepalive: keepalive === true }).then(function (r) {
        if (r.status === 200) { CL.bumpRev(r.json && r.json.rev); if (r.json && r.json.changed) CL.addWrites(1); return true; }
        if ((r.status === 0 || r.status >= 500 || r.status === 409 || r.status === 429) && attempt < 3) {
          attempt++;
          return CL.sleep(CL.backoff(attempt - 1, 1500, 15000)).then(loop);
        }
        return false;
      });
    }
    return loop();
  }
  function flushHides(keepalive) {
    if (R.hideTimer) { clearTimeout(R.hideTimer); R.hideTimer = 0; }
    if (R.hiding) { R.hideAgain = true; return Promise.resolve(); }
    var batch = R.hideQ;
    if (!Object.keys(batch.photos).length && !Object.keys(batch.projects).length) return Promise.resolve();
    R.hideQ = { photos: {}, projects: {} };
    R.hiding = true;
    R.hideInflight = batch;
    var bodies = [true, false].map(function (want) {
      var b = { op: want ? 'hide' : 'unhide', photos: [], projects: [] };
      ['photos', 'projects'].forEach(function (k) { Object.keys(batch[k]).forEach(function (id) { if (batch[k][id].hide === want) b[k].push(id); }); });
      return b;
    }).filter(function (b) { return b.photos.length + b.projects.length; });
    var failed = [], chain = Promise.resolve();
    bodies.forEach(function (b) {
      chain = chain.then(function () { return sendHide(b, keepalive).then(function (ok) { if (!ok) failed.push(b); }); });
    });
    return chain.then(function () {
      R.hiding = false;
      R.hideInflight = null;
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
        refreshAll();
        CL.toast(failed.map(function (b) { return b.op === 'hide' ? '隐藏' : '复原'; }).join('、') + '失败，请再试一次', 4000);
      } else {
        var ops = bodies.map(function (b) { return b.op; });
        CL.toast(ops.length > 1 ? '已隐藏 / 复原' : ops[0] === 'hide' ? '已隐藏（可以复原）' : '已复原');
      }
      drawSave();
      if (R.hideAgain || Object.keys(R.hideQ.photos).length || Object.keys(R.hideQ.projects).length) { R.hideAgain = false; scheduleHides(); }
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
    el.innerHTML = '<div><p class="sub-h">项目 · 只给业务看</p><h3>' + esc(pr.name) + (pr.hidden ? ' <span class="tag warn">已隐藏</span>' : '') + '</h3>' +
      '<p class="muted">' + (pr.n | 0) + ' 张' + (bits.length ? ' · ' + esc(bits.join(' · ')) : ' · 还没填区域 / 房型 / 风格') +
      (pr.by ? ' · 上次修改 ' + esc(pr.by) + ' ' + esc(CL.time(pr.ts)) : '') + '</p></div>' +
      '<div class="btn-row"><button class="mini dark" type="button" data-act="proj-edit">编辑项目资料</button></div>';
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
      '<p class="dr-meta">' + (ph.by ? '上次修改：<b>' + esc(ph.by) + '</b> · ' + esc(CL.time(ph.ts)) : '') +
      ' · ' + ph.w + '×' + ph.h + (ph.sz ? ' · ' + CL.mb(ph.sz) : '') + (ph.hidden ? ' · 由 ' + esc(ph.hidden.by) + ' 隐藏' : '') + '</p>' +
      '<div class="dr-actions"><button class="btn gold" type="button" data-act="ok-next">确认 ✓ 下一张</button>' +
      '<button class="btn ghost" type="button" data-act="hide-photo">' + (ph.hidden ? '复原这张' : '隐藏这张') + '</button>' +
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
      '<p class="muted">' + n + ' 张照片' + (pr.by ? ' · 上次修改 ' + esc(pr.by) + ' ' + esc(CL.time(pr.ts)) : '') + '</p>' +
      '<p class="hint">这些资料会用在方案的「像你们这样的家」：只写区域和特点，<b>不会</b>印出项目名或客户名字。</p>' +
      '<div class="dr-sec"><p class="sub-h">区域 <i>例：Setia Alam</i></p><input type="text" data-pfield="area" maxlength="60" value="' + esc(pr.area || '') + '" placeholder="区域" /></div>' +
      '<div class="dr-sec"><p class="sub-h">房型</p>' + chips('ptype', ptypes, pr.ptype || '', false) + '</div>' +
      '<div class="dr-sec"><p class="sub-h">家庭特点 <i>可多选</i></p>' + chips('traits', traits, pr.traits || [], true) + '</div>' +
      '<div class="dr-sec"><p class="sub-h">风格 <i>整个项目</i></p>' + chips('pstyle', styles, pr.style || '', false) + '</div>' +
      '<div class="dr-actions"><button class="btn ghost" type="button" data-act="hide-project">' + (pr.hidden ? '复原这个项目' : '隐藏这个项目') + '</button>' +
      (R.f.pid !== pid ? '<button class="btn ghost" type="button" data-act="only-project">只看这个项目</button>' : '') + '</div>' +
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
    if (R.err) msg = '<span class="err">' + esc(R.err) + '</span>';
    else if (R.saving || R.hiding) msg = '<span>保存中…</span>';
    else if (n) msg = '<span>未保存 <b>' + n + '</b> 项 · 停手 ' + Math.round(MB.clReview.idleMs / 1000) + ' 秒后自动保存（或按「保存」）</span>';
    else if (R.lastSaved) msg = '<span class="ok">已保存 ✓ ' + esc(CL.time(R.lastSaved)) + '</span>';
    else msg = '<span class="muted">点照片改标签；改了会自动保存</span>';
    el.querySelector('.msg').innerHTML = msg;
    el.querySelector('#rv-savebtn').disabled = !n || (R.saving && !hidesPending());
    el.classList.toggle('dirty', n > 0);
    $('#tab-review-dot').hidden = !n;
    drawBudget();
  }
  // 这个月用掉几次 Blob 写入（伺服器在清单里记的；改标签每次保存 1 次）
  function drawBudget() {
    var b = $('#rv-budget');
    if (!b || !CL.cat) return;
    var used = CL.monthWrites(CL.cat), lim = CL.LIMIT_WRITES;
    b.textContent = '本月 Blob 写入约 ' + CL.n(used) + ' / ' + CL.n(lim);
    b.classList.toggle('warn', used > lim * 0.8);
  }

  var OPS = { addPhotos: '上传', patch: '改标签', hide: '隐藏', unhide: '复原' };
  function drawLog() {
    var log = (cat().log || []).slice(-20).reverse();
    $('#rv-log').innerHTML = log.length ? log.map(function (e) {
      return '<li><span class="t">' + esc(CL.time(e.ts)) + '</span><b>' + esc(e.by || '?') + '</b> ' + esc(OPS[e.op] || e.op) + ' ' + (e.n | 0) + (e.op === 'patch' ? ' 项' : ' 张') + '</li>';
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
      if (!R.mode || CL.tab !== 'review') return;
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
      bind();
      drawSave();
    },
    idleMs: IDLE_MS,
    maxWaitMs: MAX_WAIT_MS,
    hideMs: HIDE_MS,
    unsaved: unsaved,
    flush: flushNow,
    state: function () { return R; },
    render: render
  };
})();
