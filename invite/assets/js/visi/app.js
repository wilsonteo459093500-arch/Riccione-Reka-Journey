/* ============================================================
   VISI · 工作台
   ------------------------------------------------------------
   左边改，右边即时出 16:9 方案；「导出 PDF」= 浏览器打印存 PDF。
   所有资料存在本机 IndexedDB（见 store.js）。
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.SAIL || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = MB.esc;

  var PROFILE_KEY = 'sail-sales-profile';     // 与 create.html 共用
  var ACTIVE_KEY = 'sail-mb-active';
  var COPYLANG_KEY = 'sail-mb-copylang';

  var S = {
    project: null,
    projects: [],
    userImages: [],
    resolve: null,
    tab: 'brief',
    copyLang: 'zh',
    pinRoom: null,
    picker: null,
    importBatch: [],
    libFilter: 'all',
    // 图库的筛选：来源（全部 / 我的 / 内置 / 公司案例）× 空间；公司案例再按 风格 × 柜类 × 项目，每页 48 张
    lib: { src: 'all', room: 'all', style: '', cab: '', pid: '', page: 0 },
    copyEdits: {},      // 销售在 ⑤ 改过的讯息：'方案id:讯息id:语言' → 文字（切页不丢）
    briefDraft: {},     // 贴了还没按「带入」的需求卡（切页不丢）
    lastPin: null,      // 刚放下的编号（放完会跳到下一间，「拿掉」要能撤回它）
    overflow: null      // 排版放不下的页（renderPreview 量出来，体检用）
  };

  /* ============================================================
     基础工具
     ============================================================ */
  function getPath(o, path) {
    return path.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o);
  }
  function setPath(o, path, v) {
    var ks = path.split('.'), last = ks.pop();
    var t = ks.reduce(function (a, k) { return a[k]; }, o);
    t[last] = v;
  }

  var toastTimer;
  function ping(msg, ms) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, ms || 2000);
  }

  function copyText(text, msg) {
    var ok = function () { ping(msg || '已复制'); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, fb); else fb();
    function fb() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { ping('复制失败，请手动选取'); }
      document.body.removeChild(ta);
    }
  }

  function download(name, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function readFileText(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.readAsText(file);
    });
  }

  function loadProfile() {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveProfile() {
    var h = S.project.host;
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ host: h.name || '', role: h.role || '', wa: h.wa || '' })); } catch (e) {}
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* 本机图片用 blob URL 显示：方案每次重排都塞几 MB 的 dataURL 会卡 */
  var blobUrls = {};
  function blobUrl(key, dataUrl) {
    if (blobUrls[key]) return blobUrls[key];
    try {
      var parts = dataUrl.split(','), bin = atob(parts[1]);
      var mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      blobUrls[key] = URL.createObjectURL(new Blob([arr], { type: mime }));
    } catch (e) { blobUrls[key] = dataUrl; }
    return blobUrls[key];
  }

  function rebuildResolver() {
    var view = S.userImages.map(function (u) {
      return { id: u.id, src: blobUrl('u:' + u.id, u.src), w: u.w, h: u.h, tag: u.tag, series: u.series || '', label: u.label };
    });
    S.resolve = MB.makeResolver(view);
    S.viewImages = view;
  }

  /* ============================================================
     存档
     ============================================================ */
  var saveTimer, renderTimer, pendingSave = null;
  /** 立刻写入还在排队的存档（切换方案前一定要先写，不然会写到下一份） */
  function flushSave() {
    clearTimeout(saveTimer);
    var p = pendingSave;
    pendingSave = null;
    if (!p || S.noStore) return Promise.resolve();
    return MB.store.putProject(p).catch(function () { ping('存档失败：浏览器存储空间可能满了'); });
  }
  function storePut(p) { return S.noStore ? Promise.resolve() : MB.store.putProject(p).catch(function () {}); }
  function storeImgs(list) { return S.noStore ? Promise.resolve() : MB.store.putImages(list); }
  function changed(opts) {
    opts = opts || {};
    S.project.ts = Date.now();
    pendingSave = S.project;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { flushSave(); refreshProjectSelect(); }, 400);
    clearTimeout(renderTimer);
    // 文案页不在这里重写：销售正在改的讯息会被洗掉（切到 ⑤ 时才重新生成）
    renderTimer = setTimeout(function () { renderPreview(); if (S.tab === 'visit') renderInviteLink(); }, opts.now ? 0 : 140);
  }

  function refreshProjectSelect() {
    var sel = $('#proj-select');
    var list = S.projects.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    sel.innerHTML = list.map(function (p) {
      var label = (p.client.names || '未命名客户') + (p.property.name ? ' · ' + p.property.name : '') + (p.label ? '（' + p.label + '）' : '');
      return '<option value="' + esc(p.id) + '"' + (p.id === S.project.id ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
  }

  /* 方案 2.0 的新栏位：model.js 的 normalizeProject 会补；这里再保险一次 ——
     model 还没更新、或旧存档少了栏位时，编辑区不会因为 undefined 当掉 */
  function ensureV2(p) {
    if (typeof p.letter !== 'string') p.letter = null;
    if (!Array.isArray(p.cases)) p.cases = [];
    if (!Array.isArray(p.team)) p.team = [{ role: 'sales', name: (p.host && p.host.name) || '' }];
    // 客户喜欢的风格（只给帮我挑、自动配图排先后用，不印在方案上）、柜类
    if (typeof p.caseStyle !== 'string') p.caseStyle = '';
    if (!Array.isArray(p.cabinets)) p.cabinets = [];
    if (!p.pages || typeof p.pages !== 'object') p.pages = {};
    if (!p.images || typeof p.images !== 'object') p.images = {};
    // 旧版的字段（风格方向、配色、材质、三句承诺、参考图取色、一页看懂、系列页的版位图）：不再用，拿掉
    ['direction', 'palette', 'materials', 'promises', 'paletteFrom', 'refImages'].forEach(function (k) { delete p[k]; });
    delete p.pages.glance; delete p.images.glance; delete p.images.series;
    // moodboard：资讯多的页（工期·保障、团队、章节页）默认关；原创系列、五个系列默认开（旧存档没有这个开关 = 开）
    var def = { letter: true, collections: true, series: true, chapter: false, cases: true, team: false, practical: false };
    Object.keys(def).forEach(function (k) { if (typeof p.pages[k] !== 'boolean') p.pages[k] = def[k]; });
    // 每一页都能换图：缺的版位补 null（= 自动）
    (MB.IMAGE_SLOTS || ['cover', 'letter', 'invite', 'back']).forEach(function (k) { if (p.images[k] === undefined) p.images[k] = null; });
    return p;
  }

  /* 打开旧方案：自动配的空间里有系列预留的官方照片、或已经从图库拿掉的照片（不是溪岸的作品、手册没印的）——
     只拿掉那几张（不整组重挑：看不到的、暂停中的公司案例照片照样留着），拿完一张都不剩才重新自动配图。
     用 storePut、不用 changed()：方案没有被销售改过，ts 不变（列表顺序不跳）。手动挑过的空间不动（照印，体检提醒） */
  function migratePhotos(p) {
    var moved = MB.stripRetired ? MB.stripRetired(p) : [];
    moved.forEach(function (x) { if (x.emptied) x.room.images = MB.autoPick(p, x.room, S.viewImages); });
    if (!moved.length) return;
    storePut(p);
    ping('「' + moved.map(function (x) { return MB.t(MB.roomTitle(p, x.room), 'zh'); }).join('、') +
      '」换了一张图：原来那张不是溪岸的作品照片，或是系列页专用的', 3200);
  }

  function openProject(p) {
    if (pendingSave && pendingSave !== p) flushSave();
    ensureV2(p);
    migratePhotos(p);
    S.project = p;
    S.pinRoom = null;
    lsSet(ACTIVE_KEY, p.id);
    if (S.projects.indexOf(p) < 0) S.projects.push(p);
    refreshProjectSelect();
    renderAll();
  }

  /* ============================================================
     示范方案（第一次打开时给新同事看成品长什么样）
     ============================================================ */
  /** from 之后（不含当天）的下一个星期几 */
  function nextDow(dow, from) {
    var d = new Date(from || Date.now()); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
    return d.getFullYear() + '-' + MB.pad2(d.getMonth() + 1) + '-' + MB.pad2(d.getDate());
  }

  var SOON = 864e5;   // 自动建议的时段至少隔一天：方案隔天才发，不能约「明天」

  /* 示范方案只用内置图库有图的空间 —— 示范本身不能体检不过。
     三个空间各对到一条需求卡的需求（内置的原话与做法三种语言都有）：切到华文 / 双语也不会冒出半句英文；
     每个空间都有「为你们」那一句；厨房印出来的第一个卖点就是做法里答应的嵌入式电器高柜 */
  function demoProject() {
    var p = MB.newProject(loadProfile());
    p.demo = true;
    p.client.names = 'Mr & Mrs Lim';
    p.property = { name: 'Sample Residence', area: 'Setia Alam', type: 'Terrace', size: '' };
    p.rooms = ['living', 'kitchen', 'master'].map(MB.newRoom);
    p.needs = [{ key: 'appliances' }, { key: 'clothes' }, { key: 'books' }];
    applyNeedFeats(p, p.needs, p.rooms);
    p.rooms.forEach(function (r) { r.images = MB.autoPick(p, r, S.viewImages); });
    p.visit.date = nextDow(6, Date.now() + SOON); p.visit.time = '14:00';
    p.visit.date2 = nextDow(0, Date.now() + SOON); p.visit.time2 = '11:00';
    return p;
  }

  /** 互相矛盾的卖点：勾了一个就取消另一个（开放层架代替吊柜 ↔ 吊柜 + 地柜） */
  var EXCLUSIVE_FEATS = { openshelf: 'topbase', topbase: 'openshelf' };

  /* 需求对到的卖点自动勾上 —— 只处理传进来的需求 × 空间（新加的那些），
     不重扫整份方案，免得把销售取消勾选的又勾回去 */
  function applyNeedFeats(p, needs, rooms) {
    needs.forEach(function (n) {
      var def = MB.needDef(p, n.key);   // 公寓有自己的落点（没有楼梯底）
      if (!def) return;
      rooms.forEach(function (r) {
        if (r.key !== def.room) return;
        def.feats.forEach(function (f) {
          if (r.feats.indexOf(f) < 0) r.feats.push(f);
          // 很少开火 → 开放层架「代替吊柜」：把默认勾着的吊柜取消，编辑区跟页面一致（不会两个都勾）
          var off = EXCLUSIVE_FEATS[f];
          if (off && r.feats.indexOf(off) > -1) r.feats.splice(r.feats.indexOf(off), 1);
        });
      });
    });
  }

  /* ============================================================
     标签页
     ============================================================ */
  function showTab(tab) {
    S.tab = tab;
    $$('#tabs button').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === tab ? 'true' : 'false'); });
    $$('.mb-pane').forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-pane') === tab); });
    renderPane(tab);
    $('.mb-edit').scrollTop = 0;
    // 窄屏是整页往下排：编辑区在预览上面，要把它卷回视野，不然点了「去改」像没反应
    if (window.matchMedia && matchMedia('(max-width: 1060px)').matches) $('.mb-edit').scrollIntoView({ block: 'start' });
  }

  function renderPane(tab) {
    if (tab === 'brief') renderBrief();
    if (tab === 'rooms') { renderRooms(); renderCases(); }
    if (tab === 'plan') renderPlan();
    if (tab === 'visit') renderVisit();
    if (tab === 'copy') renderCopy();
    if (tab === 'library') renderLibrary();
  }

  function renderAll() {
    renderPane(S.tab);
    renderPreview();
  }

  /* data-bind 的输入框：值进方案，改了就重排 */
  function bindInputs(root) {
    $$('[data-bind]', root).forEach(function (el) {
      var path = el.getAttribute('data-bind');
      var v = getPath(S.project, path);
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v == null ? '' : v;
      el.oninput = el.onchange = function () {
        var val = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (+el.value || 0) : el.value;
        var before = getPath(S.project, path);
        setPath(S.project, path, val);
        if (path === 'host.name') syncTeamHost(before, val);
        if (/^visit\.(date|time)/.test(path)) {   // 销售动过时段 = 已确认，不再算「自动建议」
          S.project.visit.auto = false;
          $('#slot-auto').hidden = true;
          $('#slot-swap').disabled = !S.project.visit.date2;
        }
        if (el.hasAttribute('data-profile')) saveProfile();
        changed();
      };
    });
  }

  /** 预设文字的编辑框：显示「改过的 or 默认」，一改就存成覆写 */
  function textLang() { return S.project.lang === 'zh' ? 'zh' : 'en'; }

  /* ============================================================
     ① 客户
     ============================================================ */
  function renderBrief() {
    var pane = $('[data-pane="brief"]');
    bindInputs(pane);
    var draft = S.briefDraft[S.project.id];
    $('#brief-text').value = draft != null ? draft : S.project.brief || '';
    renderCaseStyle();
    renderLetter();
    renderNeeds();
    renderBriefMatch(false);
  }

  /* ---------- 开场短话（方案第 2 页） ----------------------------
     null = 自动草稿（copy.js 从需求卡起草）；销售一改就存成字串，方案照他写的印 */
  /** 双语方案：华文一段、英文一段（跟方案页一样）—— 改一个字也不会丢掉另一种语言 */
  function letterDraft(p) {
    if (typeof MB.draftLetter !== 'function') return '';
    try {
      if (p.lang === 'bi') return [MB.draftLetter(p, 'zh'), MB.draftLetter(p, 'en')].filter(Boolean).join('\n\n');
      return MB.draftLetter(p, textLang()) || '';
    } catch (e) { console.error(e); return ''; }
  }
  function renderLetter() {
    var p = S.project, ta = $('#letter-text');
    ta.value = p.letter == null ? letterDraft(p) : p.letter;
    // 草稿还没载入（或删光了）时给一个具体的开头，不要一个空框
    ta.placeholder = p.lang === 'zh' ? '例：你们说厨房永远收不干净 —— 所以这份方案从厨房开始……'
      : 'e.g. You told us the kitchen never stays tidy, so this proposal starts there…';
    letterState();
  }
  function letterState() {
    var p = S.project, auto = p.letter == null;
    $('#letter-text').classList.toggle('auto', auto);
    $('#letter-reset').hidden = auto;
    var who = [p.host.name, p.host.role].filter(Boolean).join(' · ');
    $('#letter-state').textContent = (auto ? '浅色字 = 自动草稿。改一句，就变成你的话。' : '已改过 —— 方案页照你写的印。') +
      ' 署名：' + (who || '（在下面「我是谁」填名字）');
  }
  /* 草稿跟着需求、名字、语言变；销售正在打字时不去动它 */
  function syncLetterDraft() {
    var ta = $('#letter-text');
    if (S.tab !== 'brief' || S.project.letter != null || document.activeElement === ta) return;
    ta.value = letterDraft(S.project);
    letterState();
  }
  $('#letter-text').addEventListener('input', function (e) {
    var v = e.target.value;
    S.project.letter = v.trim() ? v : null;   // 删光 = 回到自动草稿
    letterState(); changed();
  });
  $('#letter-text').addEventListener('blur', function () { if (S.project.letter == null) renderLetter(); });
  $('#letter-reset').addEventListener('click', function () {
    S.project.letter = null;
    renderLetter(); changed();
  });

  function renderNeeds() {
    var p = S.project, L = textLang();
    $('#needs-list').innerHTML = p.needs.length ? p.needs.map(function (n, i) {
      var def = n.key && MB.NEEDS[n.key];
      var rooms = '<option value="">（不对应空间）</option>' + p.rooms.map(function (r) {
        return '<option value="' + esc(r.uid) + '"' + (MB.needRoom(p, n) === r ? ' selected' : '') + '>' + esc(MB.t(MB.roomTitle(p, r), 'zh')) + '</option>';
      }).join('');
      return '<div class="need" data-i="' + i + '">' +
        '<div class="row"><span class="tag">' + (def ? '需求卡选项' : '客户原话') + '</span><span class="grow" style="flex:1"></span>' +
          (def ? '' : '<select data-need-room style="width:auto;padding:5px 30px 5px 8px;font-size:12.5px">' + rooms + '</select>') +
          '<button class="icon" type="button" data-need-del title="删除">×</button></div>' +
        '<div class="row2"><div><textarea data-need-q placeholder="客户原话，例：厨房永远收不干净">' + esc(MB.t(MB.needQuote(n), L)) + '</textarea></div>' +
        '<div><textarea data-need-a placeholder="' + esc(answerHint(p, n)) + '">' + esc(MB.t(MB.needAnswer(n, p), L)) + '</textarea></div></div>' +
      '</div>';
    }).join('') : '<p class="hint" style="margin:0">还没有。贴需求卡会自动带出，或点下面加。</p>';

    var have = {};
    p.needs.forEach(function (n) { if (n.key) have[n.key] = 1; });
    $('#needs-add').innerHTML = '<button class="mini" type="button" data-need-add="">＋ 客户原话</button>' +
      Object.keys(MB.NEEDS).filter(function (k) { return !have[k]; }).map(function (k) {
        return '<button class="mini" type="button" data-need-add="' + k + '">＋ ' + esc(MB.NEEDS[k].quote.zh.replace(/[。]$/, '')) + '</button>';
      }).join('');
  }

  /** 「我们的做法」的填写示范：对到空间就拿那个空间被勾的卖点来示范 */
  function answerHint(p, n) {
    var r = MB.needRoom(p, n);
    if (!r) return '我们的做法，例：每个锅具都有固定位置 —— 高柜拉篮 + 电器高柜';
    // 跟页面同一套（MB.roomFeats：需求点到的在前、层架代替吊柜时不提吊柜）
    var feats = MB.roomFeats(p, r).slice(0, 2);
    return '我们的做法，例：' + feats.map(function (f) { return f.zh; }).join(' + ') +
      (feats[0] ? ' —— ' + feats[0].why.zh : '');
  }

  $('#needs-list').addEventListener('input', function (e) {
    var row = e.target.closest('.need'); if (!row) return;
    var n = S.project.needs[+row.getAttribute('data-i')];
    if (e.target.hasAttribute('data-need-q')) n.quote = e.target.value;
    if (e.target.hasAttribute('data-need-a')) n.answer = e.target.value;
    changed();
  });
  $('#needs-list').addEventListener('change', function (e) {
    if (!e.target.hasAttribute('data-need-room')) return;
    var n = S.project.needs[+e.target.closest('.need').getAttribute('data-i')];
    var r = S.project.rooms.filter(function (x) { return x.uid === e.target.value; })[0];
    n.roomUid = r ? r.uid : null;
    n.room = r ? r.key : null;
    changed();
  });
  $('#needs-list').addEventListener('click', function (e) {
    if (!e.target.hasAttribute('data-need-del')) return;
    S.project.needs.splice(+e.target.closest('.need').getAttribute('data-i'), 1);
    renderNeeds(); changed();
  });
  $('#needs-add').addEventListener('click', function (e) {
    var b = e.target.closest('[data-need-add]'); if (!b) return;
    var k = b.getAttribute('data-need-add');
    if (k) {
      var n = { key: k };
      S.project.needs.push(n);
      var def = MB.needDef(S.project, k);
      if (!S.project.rooms.some(function (r) { return r.key === def.room; })) addRoom(def.room, true);
      applyNeedFeats(S.project, [n], S.project.rooms);
    } else {
      S.project.needs.unshift({ quote: '', answer: '' });
    }
    renderNeeds(); changed();
  });

  /* 贴需求卡 */
  $('#brief-text').addEventListener('input', function (e) { S.briefDraft[S.project.id] = e.target.value; });
  $('#brief-apply').addEventListener('click', function () {
    var text = $('#brief-text').value;
    var b = MB.parseBrief(text);
    if (!b) { ping('认不出来 —— 请贴需求卡的整段文字', 2600); return; }
    var p = S.project, setup = MB.briefToSetup(b);
    var who = (setup.client.names || '').trim(), had = (p.client.names || '').trim();
    var fresh = '';
    // 示范方案不能被客户资料盖掉；别的客户的方案也先问一声（多半是忘了按「新方案」）
    if (p.demo || (had && who && had.toLowerCase() !== who.toLowerCase() &&
        !confirm('这份方案是「' + had + '」的，要带入「' + who + '」的需求卡吗？\n取消 = 另外新建一份'))) {
      fresh = p.demo ? '示范方案保留' : '「' + had + '」的方案不动';
      delete S.briefDraft[p.id];
      p = MB.newProject(loadProfile());
      S.projects.push(p);
      openProject(p);
    }
    delete S.briefDraft[p.id];
    p.brief = text;
    if (setup.client.names) p.client.names = setup.client.names;
    if (setup.client.wa) p.client.wa = setup.client.wa;
    ['name', 'area', 'type', 'size'].forEach(function (k) { if (setup.property[k]) p.property[k] = setup.property[k]; });
    // 客户喜欢的风格（需求卡选的）：还没定才带 —— 销售在 ① 改过的不洗掉。只给帮我挑、自动配图排先后，不印在方案上。
    // 带了就把自动配的空间按这种风格重配（亲手挑过的不动）；新加的空间下面 addRoom 时就按它配
    var cst = setup.caseStyle && MB.caseStyle ? MB.caseStyle(setup.caseStyle) : null;
    if (cst && !p.caseStyle) { p.caseStyle = cst.key; repickAuto(p); }
    // 柜类累加
    (setup.cabinets || []).forEach(function (k) { if (p.cabinets.indexOf(k) < 0) p.cabinets.push(k); });
    var newRooms = [];
    setup.rooms.forEach(function (k) { if (!p.rooms.some(function (r) { return r.key === k; })) newRooms.push(addRoom(k, true)); });
    var newNeeds = [];
    setup.needs.forEach(function (n) {
      var dup = p.needs.some(function (m) { return (n.key && m.key === n.key) || (n.quote && m.quote === n.quote); });
      if (!dup) { p.needs.push(n); newNeeds.push(n); }
    });
    // 原话猜到的空间 → 指到那一间
    newNeeds.forEach(function (n) {
      if (n.room && !n.roomUid) { var r = MB.needRoom(p, n); if (r) n.roomUid = r.uid; }
    });
    applyNeedFeats(p, newNeeds, p.rooms);
    p.rooms.forEach(function (r) { if (!r.images.length) r.images = MB.autoPick(p, r, S.viewImages); });
    // 有公司案例库：参考空间还空着就先挑 3 个（三个不同的家；客户选了风格就挑那一种）；销售可以换
    var autoCases = 0;
    if (!p.cases.length && hasCases() && MB.suggestCases) {
      p.cases = MB.suggestCases(p, S.resolve, CASE_MAX).map(function (ref) { return { ref: ref, note: null }; });
      autoCases = p.cases.length;
      if (autoCases) yieldToHandPicked(p);
    }
    suggestSlots(setup.visitPref);
    renderBrief(); changed({ now: true });
    renderBriefMatch(true);
    var bare = p.rooms.filter(function (r) { return !r.images.length; }).map(function (r) { return MB.t(MB.roomTitle(p, r), 'zh'); });
    ping((fresh ? '已新建方案（' + fresh + '）· ' : '已带入：') +
      [setup.client.names, setup.rooms.length + ' 个空间', setup.needs.length + ' 条需求'].filter(Boolean).join(' · ') +
      (cst && p.caseStyle === cst.key ? ' · 客户喜欢「' + cst.zh + '」' : '') +
      (autoCases ? ' · 参考空间先放了 ' + autoCases + ' 个公司案例' : casesBlocked() ? ' · 公司案例库暂停中，先用内置照片' : '') +
      (bare.length ? '。' + bare.join('、') + ' 还没有图 —— 到「图库」导入旧 proposal PDF 或上传' : ''), bare.length ? 5200 : 2800);
  });

  /* 按客户「方便到馆」先替他们留时段（销售可改） */
  function suggestSlots(prefs) {
    var v = S.project.visit;
    if (v.date || !prefs || !prefs.length) return;
    var picks = [], from = Date.now() + SOON;
    prefs.forEach(function (pr) {
      var k = MB.visitPrefKind(pr);   // 华文「周六」、英文「Saturday」、中英文都认
      if (k === 'sat') picks.push([nextDow(6, from), '14:00']);
      else if (k === 'sun') picks.push([nextDow(0, from), '11:00']);
      else if (k === 'day') picks.push([nextWeekday(from), '11:00']);
      else if (k === 'eve') picks.push([nextWeekday(from), '17:00']);
    });
    picks.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });   // 时段 1 永远是比较近的那个
    if (picks[0]) { v.date = picks[0][0]; v.time = picks[0][1]; v.auto = true; }
    if (picks[1]) { v.date2 = picks[1][0]; v.time2 = picks[1][1]; }
  }
  function nextWeekday(from) {
    var d = new Date(from || Date.now()); d.setHours(0, 0, 0, 0);
    do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
    return d.getFullYear() + '-' + MB.pad2(d.getMonth() + 1) + '-' + MB.pad2(d.getDate());
  }

  /* ============================================================
     客户喜欢的风格（① 客户 · 选填 · 不印在方案上）
     ============================================================ */
  /** 改了客户喜欢的风格：自动配的空间按新的风格重配。回换了图的空间数。
      不动的：销售亲手挑过的（r.manual）、用了自己图（u:）的、
      有这台电脑看不到的公司案例照片（同事放的、还没登入 / 还没汇入）或暂停中打不开的 —— 那些回来了还要用，不能被换掉。
      内置图（b:）、公司案例（c:）都是自动配的：换风格就重配 */
  function repickAuto(p) {
    var n = 0;
    p.rooms.forEach(function (r) {
      var imgs = r.images || [];
      if (r.manual || unseenCases(imgs).length || pausedCases(imgs).length) return;
      if (imgs.some(function (ref) { return typeof ref === 'string' && ref.indexOf('u:') === 0; })) return;
      var before = JSON.stringify(imgs);
      r.images = MB.autoPick(p, r, S.viewImages);
      if (JSON.stringify(r.images) !== before) n++;
    });
    return n;
  }
  /** 方案里写着、这台电脑却解析不到的公司案例照片（没登入过、清单还没拿到）—— 不能当成「没有图」丢掉。
      本机案例库里没有的（absentHere）也算：那是这台电脑还没汇入那个文件夹，不是被删掉 */
  function unseenCases(refs) {
    return (refs || []).filter(function (ref) { return typeof ref === 'string' && ref.indexOf('c:') === 0 && (!S.resolve(ref) || absentHere(ref)); });
  }
  /** 本机案例库（存在这台电脑）：清单里没有 = 这台电脑没有（同事的方案、还没汇入那个项目的文件夹）——
      方案页照样印占位框，但跟「看不到」一样：留着，自动配图、改客户喜欢的风格、重新选图之前先问 */
  function absentHere(ref) { return casesLocal() && goneOf(ref) === 'deleted'; }
  /** 打不开的公司案例照片：'blocked'（案例库暂停中）· 'deleted'（被删掉了）· ''（model.js 的 MB.caseGone） */
  function goneOf(ref) { var im = ref && S.resolve(ref); return im && MB.caseGone ? MB.caseGone(im) : ''; }
  /** 案例库暂停中打不开的那几张：选不到，但恢复了还要用 —— 重新选图、按「确定」照样留着 */
  function pausedCases(refs) { return (refs || []).filter(function (ref) { return goneOf(ref) === 'blocked'; }); }
  /** 被删掉的那几张：回不来了 —— 重新选图时拿掉（本机案例库里没有的不算：汇入那个文件夹就回来） */
  function deadCases(refs) { return (refs || []).filter(function (ref) { return goneOf(ref) === 'deleted' && !absentHere(ref); }); }
  function keepUnseen(rooms) {
    var n = 0, b = 0;
    rooms.forEach(function (r) { n += unseenCases(r.images).length; b += pausedCases(r.images).length; });
    if (n && !confirm('有 ' + n + ' 张公司案例照片这台电脑看不到（' + (casesLocal() ? '要先汇入那个项目的文件夹' : '同事放的，要先登入公司案例库') + '）。重新配图会把它们换掉，继续？')) return false;
    return !b || confirm('有 ' + b + ' 张公司案例照片暂时打不开（案例库暂停中）。重新配图会把它们换成别的照片，继续？');
  }

  /* ---------- 客户喜欢的风格（① 客户 · 选填 · 不印在方案上） ----------
     只用来挑照片：「帮我挑」先挑这种风格的公司案例，自动配图先用同一个系列的照片（model.js 的 MB.likedSeries）。
     方案照样介绍溪岸全部五个原创系列 —— 不替客户选一个系列 */
  function renderCaseStyle() {
    var box = $('#case-style'), panel = $('#case-style-panel');
    if (!box || !panel) return;
    var p = S.project, list = MB.CASE_STYLES || [];
    panel.hidden = !list.length;
    box.innerHTML = [{ key: '', zh: '不限' }].concat(list).map(function (s) {
      var ser = s.series && MB.SERIES_OF ? MB.SERIES_OF[s.series] : null;
      return '<button class="mini" type="button" data-case-style="' + esc(s.key) + '" aria-pressed="' + (s.key === (p.caseStyle || '')) + '"' +
        (ser ? ' title="' + esc('自动配图先用「' + ser.zh + '」的照片') + '"' : '') + '>' + esc(s.zh) + '</button>';
    }).join('');
  }
  if ($('#case-style')) $('#case-style').addEventListener('click', function (e) {
    var b = e.target.closest('[data-case-style]'); if (!b) return;
    var p = S.project, key = b.getAttribute('data-case-style') || '';
    if (key === (p.caseStyle || '')) return;
    p.caseStyle = key;
    var n = repickAuto(p);
    renderCaseStyle(); renderBriefMatch(false); changed({ now: true });
    var st = key && MB.caseStyle ? MB.caseStyle(key) : null, name = st ? st.zh : '不限';
    ping(n > 0 ? '已按「' + name + '」重新配了 ' + n + ' 个空间的图（你亲手挑的没动）'
      : '已记下「' + name + '」：帮我挑、自动配图' + (st ? '先挑这种风格' : '不偏好哪一种风格'), 2800);
  });

  /* ============================================================
     ② 空间
     ============================================================ */
  function addRoom(key, quiet) {
    var p = S.project, r = MB.newRoom(key);
    // 照 MB.ROOMS 的顺序插入（玄关在前、浴室在后），新加的不会乱排到最后
    var order = MB.ROOMS.map(function (x) { return x.key; });
    var at = p.rooms.length;
    for (var i = 0; i < p.rooms.length; i++) {
      if (order.indexOf(p.rooms[i].key) > order.indexOf(key)) { at = i; break; }
    }
    p.rooms.splice(at, 0, r);
    applyNeedFeats(p, p.needs, [r]);
    r.images = MB.autoPick(p, r, S.viewImages);
    if (!quiet) { renderRooms(); changed({ now: true }); flashRoom(r.uid); }
    return r;
  }

  /** 销售在 ④ 选了版位图、在 ② 挑了案例、或打开了有手选图的页之后：自动配图的空间如果用到同一张
      （含同一张的不同裁切），那个空间重新自动配图 —— 整份方案同一张照片只出现一次。
      手选过的空间不动（那是销售自己的决定，体检会提醒重复）。回被换图的空间名 */
  function yieldToHandPicked(p) {
    if (typeof MB.handPicked !== 'function') return [];
    var hp = MB.handPicked(p, S.resolve), key = MB.shotKey || function (r) { return r; };
    var moved = [];
    p.rooms.forEach(function (r) {
      if (r.manual || !r.images.some(function (ref) { return hp[key(ref)]; })) return;
      r.images = MB.autoPick(p, r, S.viewImages);
      moved.push(MB.t(MB.roomTitle(p, r), 'zh'));
    });
    if (moved.length) ping('「' + moved.join('、') + '」换了一张图：原来那张已经放在别页', 2800);
    return moved;
  }

  function flashRoom(uid) { flash(document.getElementById('room-' + uid)); }
  /** 卷到那一块并闪一下：从预览点过来，眼睛才找得到要改的地方 */
  function flash(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // 指到面板里的一块（例：#slot-thumbs）：卷到那一块，闪整个面板
    var box = el.closest('.panel, .room-card') || el;
    box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
  }

  function renderRooms() {
    var p = S.project, L = textLang();
    var count = {};
    p.rooms.forEach(function (r) { count[r.key] = (count[r.key] || 0) + 1; });
    $('#room-add').innerHTML = MB.ROOMS.map(function (r) {
      return '<button class="mini' + (count[r.key] ? ' on' : '') + '" type="button" data-add-room="' + r.key + '">＋ ' + esc(r.zh) +
        (count[r.key] ? ' ×' + count[r.key] : '') + '</button>';
    }).join('');

    var who = (p.client.names || '').trim() || '客户';
    // 没有图的空间，方案页会先放一张氛围 / 细节照（MB.deckImages 的 moodRooms）：这里照实显示，销售才知道
    var plan = null;
    try { plan = MB.deckImages ? MB.deckImages(p, S.resolve) : null; } catch (e) { console.error(e); }
    function standIn(r) {
      if (!plan || (plan.moodRooms || []).indexOf(r.uid) < 0) return '';
      var im = S.resolve((plan.rooms[r.uid] || [])[0]);
      return im ? '<div class="thumb"><img src="' + esc(im.src) + '" alt="" loading="lazy" /><span class="hero">氛围照代替</span></div>' : '';
    }
    var placed = [];
    p.rooms.forEach(function (r) { placed = placed.concat(r.images || []); });
    localThumbs(placed);
    $('#room-list').innerHTML = p.rooms.length ? p.rooms.map(function (r, i) {
      var def = MB.ROOM[r.key];
      var thumbs = r.images.map(function (ref, k) {
        var im = S.resolve(ref);
        if (!im) return '';
        return '<div class="thumb">' + thumbImg(im) + caseFlag(im) +
          (k === 0 ? '<span class="hero">★ 主图</span>' : '') +
          '<div class="ops">' +
            (k ? '<button type="button" data-img-hero="' + k + '" title="设为主图">★</button>' : '') +
            (k ? '<button type="button" data-img-left="' + k + '" title="往前">←</button>' : '') +
            '<button type="button" data-img-del="' + k + '" title="拿掉">×</button>' +
          '</div></div>';
      }).join('');
      var feats = def.feats.map(function (f) {
        return '<label class="chk"><input type="checkbox" data-feat="' + f.id + '"' + (r.feats.indexOf(f.id) > -1 ? ' checked' : '') + ' />' +
          '<span>' + esc(f.zh) + '<small>' + esc(f.why.zh) + '</small></span></label>';
      }).join('');
      var note = MB.roomNote(p, r);
      return '<div class="room-card" id="room-' + esc(r.uid) + '" data-uid="' + esc(r.uid) + '">' +
        '<header><span class="no">' + (i + 1) + '</span>' +
          '<input type="text" data-room-title value="' + esc(r.title || '') + '" placeholder="' + esc(def.en + ' · ' + def.zh) + '" aria-label="标题" />' +
          '<div class="tools">' +
            '<button class="icon" type="button" data-room-up title="上移">↑</button>' +
            '<button class="icon" type="button" data-room-down title="下移">↓</button>' +
            '<button class="icon" type="button" data-room-del title="删除这个空间">×</button>' +
          '</div></header>' +
        '<div class="body">' +
          '<div class="thumbs">' + (thumbs || standIn(r) + '<div class="thumb empty">还没有实景图' + (standIn(r) ? '（方案页先放左边这张）' : '') + '</div>') + '</div>' +
          '<div class="btn-row" style="gap:6px">' +
            '<button class="mini" type="button" data-room-auto>自动配图</button>' +
            '<button class="mini" type="button" data-room-pick>从图库选</button>' +
            '<label class="mini">上传照片<input type="file" accept="image/*" multiple hidden data-room-upload /></label>' +
          '</div>' +
          '<p class="sub-h">卖点 <i class="muted small" style="text-transform:none;letter-spacing:0">页面只印 3 个名称，why 在讲稿</i></p>' +
          '<div class="chks">' + feats + '</div>' +
          '<p class="sub-h">为 ' + esc(who) + ' · 一句话' +
            (r.note != null ? '<button class="reset" type="button" data-note-reset>↺ 用默认</button>' : '') + '</p>' +
          '<textarea data-room-note placeholder="' + esc(def.hint) + '">' + esc(MB.t(note, L)) + '</textarea>' +
        '</div></div>';
    }).join('') : '<p class="hint">还没有空间。点上面的按钮加入，或回 ① 贴需求卡自动带出。</p>';
  }

  function roomOf(el) {
    var card = el.closest('.room-card');
    if (!card) return null;
    var uid = card.getAttribute('data-uid');
    return S.project.rooms.filter(function (r) { return r.uid === uid; })[0] || null;
  }

  $('#room-add').addEventListener('click', function (e) {
    var b = e.target.closest('[data-add-room]'); if (!b) return;
    addRoom(b.getAttribute('data-add-room'));
  });
  $('#auto-all').addEventListener('click', function () {
    var p = S.project;
    if (p.rooms.some(function (r) { return r.manual; }) && !confirm('会替换你手动选的图，继续？')) return;
    if (!keepUnseen(p.rooms)) return;
    p.rooms.forEach(function (r) { r.images = []; r.manual = false; });
    p.rooms.forEach(function (r) { r.images = MB.autoPick(p, r, S.viewImages); });
    renderRooms(); changed({ now: true });
    var cst = p.caseStyle && MB.caseStyle ? MB.caseStyle(p.caseStyle) : null;
    ping(cst ? '已重新配图（客户喜欢的「' + cst.zh + '」优先）' : '已重新配图');
  });

  $('#room-list').addEventListener('input', function (e) {
    var r = roomOf(e.target); if (!r) return;
    if (e.target.hasAttribute('data-room-title')) { r.title = e.target.value.trim() ? e.target.value : null; changed(); }
    if (e.target.hasAttribute('data-room-note')) { r.note = e.target.value; changed(); }
  });
  $('#room-list').addEventListener('change', function (e) {
    var r = roomOf(e.target); if (!r) return;
    if (e.target.hasAttribute('data-feat')) {
      var id = e.target.getAttribute('data-feat'), i = r.feats.indexOf(id);
      if (e.target.checked && i < 0) r.feats.push(id);
      if (!e.target.checked && i > -1) r.feats.splice(i, 1);
      // 勾「开放层架代替吊柜」就取消「吊柜 + 地柜」（反过来也一样）：页面只能说一种，勾选框也只留一个
      var off = e.target.checked && EXCLUSIVE_FEATS[id];
      if (off && r.feats.indexOf(off) > -1) {
        r.feats.splice(r.feats.indexOf(off), 1);
        var box = e.target.closest('.chks') && e.target.closest('.chks').querySelector('[data-feat="' + off + '"]');
        if (box) box.checked = false;
        var fo = MB.ROOM[r.key].feats.filter(function (f) { return f.id === off; })[0];
        if (fo) ping('已取消「' + fo.zh + '」—— 跟刚勾的那个说法相反', 2400);
      }
      // 保持资料库里的顺序，页面上才稳定
      var order = MB.ROOM[r.key].feats.map(function (f) { return f.id; });
      r.feats.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
      // moodboard：页面只印 3 个卖点的名称（why 在讲稿里）
      if (r.feats.length > 3) ping('超过 3 个卖点，页面只印 3 个名称（需求点到的排最前），其余的在讲稿里', 2800);
      changed();
    }
    if (e.target.hasAttribute('data-room-upload')) {
      var files = Array.prototype.slice.call(e.target.files || []);
      e.target.value = '';
      saveUploads(files, r.key).then(function (ids) {
        ids.forEach(function (id) { r.images.push('u:' + id); });
        if (ids.length) r.manual = true;
        renderRooms(); changed({ now: true });
      });
    }
  });
  $('#room-list').addEventListener('click', function (e) {
    var t = e.target, r = roomOf(t); if (!r) return;
    var p = S.project, i = p.rooms.indexOf(r);
    function idx(attr) { return +t.getAttribute(attr); }
    if (t.closest('[data-room-up]') && i > 0) { p.rooms.splice(i - 1, 0, p.rooms.splice(i, 1)[0]); }
    else if (t.closest('[data-room-down]') && i < p.rooms.length - 1) { p.rooms.splice(i + 1, 0, p.rooms.splice(i, 1)[0]); }
    else if (t.closest('[data-room-del]')) {
      if (!confirm('删除「' + MB.t(MB.roomTitle(p, r), 'zh') + '」这一页？')) return;
      p.rooms.splice(i, 1); delete p.plan.pins[r.uid];
    }
    else if (t.closest('[data-room-auto]')) { if (!keepUnseen([r])) return; r.images = []; r.manual = false; r.images = MB.autoPick(p, r, S.viewImages); }
    else if (t.closest('[data-room-pick]')) { openPicker({ mode: 'room', uid: r.uid, filter: r.key }); return; }
    // 动过图 = 销售亲手挑的，之后改客户喜欢的风格不会被自动配图洗掉
    else if (t.hasAttribute('data-img-hero')) { var k = idx('data-img-hero'); r.images.unshift(r.images.splice(k, 1)[0]); r.manual = true; }
    else if (t.hasAttribute('data-img-left')) { var j = idx('data-img-left'); r.images.splice(j - 1, 0, r.images.splice(j, 1)[0]); r.manual = true; }
    else if (t.hasAttribute('data-img-del')) { r.images.splice(idx('data-img-del'), 1); r.manual = true; }
    else if (t.closest('[data-note-reset]')) { r.note = null; }
    else return;
    renderRooms(); changed({ now: true });
  });

  /* ---------- 参考空间（最多 3 个） ----------------------------
     现在挑的是溪岸自己的实拍（品牌手册、内置图库），不是客户的家：页面叫「SAIL spaces · 参考空间」，
     那一行只写看得到的事实（系列、空间），不写「和你们很像」。
     等云端案例库有每个项目的区域 / 房型 / 家庭资料，才改回「像你们这样的家」。
     p.cases = [{ ref, note }]，note 是 null 就用 copy.js 的自动那句 */
  var CASE_MAX = 3;
  /** 有公司案例可以用（登入过、清单载入了） */
  function hasCases() { return !!(MB.cases && MB.cases().some(MB.caseUsable)); }
  /** 案例库暂停中（Vercel 的免费额度用完）：给业务看的那一句（图库、选图、参考空间、帮我挑都一样） */
  var BLOCKED_MSG = '公司案例库暂停中：Vercel 的免费额度用完了，案例照片暂时不能用。内置照片和你自己的照片照常可以用。';
  function casesBlocked() { return !!(MB.cloud && MB.cloud.status().blocked); }
  /** 本机案例库（存在这台电脑）：没有登入、没有 Vercel 暂停；看不到的照片 = 这台电脑还没汇入那个文件夹 */
  function casesLocal() { return !!(MB.cloud && MB.cloud.status().local); }
  /** 各处的「暂停中」横条（参考空间、选图弹窗）：暂停中才出现 */
  function renderBlocked() {
    var on = casesBlocked();
    $$('[data-cases-blocked]').forEach(function (el) { el.hidden = !on; if (on) el.textContent = BLOCKED_MSG; });
  }
  /** 小图：案例用缩图包（320px），载不到用原图 */
  function thumbSrc(im) { return (im && (im.thumb || (MB.cloud && im.id && MB.cloud.thumb(im.id)))) || (im && im.src) || ''; }
  /** 暂停中：方案里放的案例照片改用这台电脑存着的缩图（看得出是哪一张）—— cloud.js 这时只读本机、不连网 */
  function localThumbs(refs) {
    if (!MB.cloud || !casesBlocked()) return;
    var pids = [];
    (refs || []).forEach(function (ref) {
      var im = typeof ref === 'string' && ref.indexOf('c:') === 0 ? S.resolve(ref) : null;
      if (im && im.pid && !im.thumb && !MB.cloud.thumb(ref) && pids.indexOf(im.pid) < 0) pids.push(im.pid);
    });
    if (pids.length) MB.cloud.thumbs(pids);
  }
  /** 小图的 <img>；打不开的案例（暂停中、已删除）又没有存着的缩图：一个占位块（绝不放会 403 的网址） */
  function thumbImg(im) {
    var src = thumbSrc(im);
    return src ? '<img src="' + esc(src) + '" alt="" loading="lazy" />' : '<span class="img-gone" aria-hidden="true"></span>';
  }
  /* 公司案例照片载不出来（这台电脑的清单是旧的、照片刚被删掉；案例库刚被暂停、10 分钟一次的更新还没问到）：
     那一格马上换成占位框（方案页、PDF、PPTX、编辑区都不留破图），再请 cloud.js 确认 ——
     确认了（已删除 / 暂停中）会重排，方案页改印正式的占位框，体检也会说。
     <img> 的 error 不会冒泡：在 document 上用 capture 抓（方案页、PPTX 排版的那一份、图库、选图都在这份网页里） */
  function caseImgFailed(img) {
    var box = img.parentNode;
    if (!box) return;
    if (box.classList && box.classList.contains('ph') && box.closest && box.closest('.pg')) {
      // 方案页的 <figure class="ph …">：跟 deck.js 打不开的案例同一种占位框；那行字（.todo）只在预览出现，打印、PPTX 都不印
      var deck = box.closest('.deck'), en = !!(deck && / lang-en\b/.test(' ' + deck.className));
      box.classList.add('ph-gone');
      box.setAttribute('data-gone', 'broken');
      box.innerHTML = '<span class="todo">' + (en ? 'Case photo did not load — choose another, or refresh the case library'
        : '这张公司案例照片载不出来：换一张，或到「图库」按「更新」') + '</span>';
      return;
    }
    var sp = document.createElement('span');
    sp.className = 'img-gone';
    sp.setAttribute('aria-hidden', 'true');
    box.replaceChild(sp, img);
  }
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (!img || img.tagName !== 'IMG' || !MB.cloud || !MB.cloud.isCaseSrc) return;
    var src = img.getAttribute('src') || '';
    if (!MB.cloud.isCaseSrc(src)) return;
    try { caseImgFailed(img); } catch (err) { console.error(err); }
    if (MB.cloud.photoFailed) MB.cloud.photoFailed(src);
  }, true);
  /** 案例照片的小标记：公司案例 / 待确认 / 已隐藏 / 暂时打不开 / 已删除（照样印 —— 体检会提醒） */
  function caseFlag(im) {
    if (!im || !(im.isCase || /^c:/.test(im.id || im.ref || ''))) return '';
    var g = MB.caseGone ? MB.caseGone(im) : '';
    var t = g === 'blocked' ? '暂时打不开' : g === 'deleted' ? (casesLocal() ? '这台电脑没有' : '已删除') : im.hidden ? '已隐藏' : im.status === 'unsure' ? '待确认' : '案例';
    return '<span class="case-tag' + (t === '案例' ? '' : ' warn') + '">' + t + '</span>';
  }
  /** 图库那一份（有 rooms / series / label），给 MB.caseNote 起草那一句 */
  function libItem(ref) {
    if (ref && ref.indexOf('c:') === 0) {
      // 案例：隐藏 / 不确定的不在图库清单里，直接用 resolver 那一份（一样只有白名单栏位）
      var c = S.resolve(ref);
      return c ? { ref: ref, src: c.src, w: c.w, h: c.h, rooms: c.rooms || [], series: c.series || '', own: false, isCase: true,
        label: c.label || '', en: c.en || '', zh: c.zh || '', area: c.area, ptype: c.ptype, traits: c.traits } : null;
    }
    var all = MB.allImages(S.viewImages);
    for (var i = 0; i < all.length; i++) if (all[i].ref === ref) return all[i];
    return null;
  }
  function caseHint(p, im) {
    if (typeof MB.caseNote !== 'function' || !im) return '';
    try { return MB.caseNote(p, im, textLang()) || ''; } catch (e) { console.error(e); return ''; }
  }
  function renderCases() {
    var p = S.project;
    localThumbs(p.cases.map(function (c) { return c && c.ref; }));
    var rows = p.cases.map(function (c, i) {
      var im = S.resolve(c.ref), item = libItem(c.ref);
      if (!im) return '';
      var hint = caseHint(p, item) || '一句话，只写看得到的事实，例：骨骼线系列的厨房';
      return '<div class="case-row" data-i="' + i + '">' +
        '<div class="thumb">' + thumbImg(im) + '<span class="hero">' + (i + 1) + '</span>' +
          caseFlag(im) +
          '<div class="ops">' +
            (i ? '<button type="button" data-case-up title="往前">↑</button>' : '') +
            '<button type="button" data-case-del title="拿掉">×</button>' +
          '</div></div>' +
        '<div class="case-txt"><span class="case-cap">' + esc(item && item.label ? item.label : '') + '</span>' +
          '<textarea data-case-note rows="2" placeholder="' + esc(hint) + '" aria-label="这张图的一句话">' + esc(c.note || '') + '</textarea></div>' +
      '</div>';
    }).join('');
    $('#cases-list').innerHTML = rows || '<p class="hint" style="margin:0">还没有。挑 1–3 张溪岸的实拍（客户选了风格就挑那一种）；一张都没有就不出这一页。</p>';
    $('#cases-pick').textContent = rows ? '换 / 加案例' : '从图库选';
    // 公司案例库：帮我挑、自动挑 3 个（有案例才出现；暂停中也出现，按了说明为什么挑不了）
    var on = hasCases(), paused = casesBlocked();
    $('#cases-match').hidden = !(on || paused);
    $('#cases-auto').hidden = !(on || paused);
    var st = MB.cloud ? MB.cloud.status().status : 'unavailable';
    $('#cases-cloud').hidden = on || paused || st === 'unavailable';
    // 本机案例库：不用登入，是还没把案例文件夹汇入这台电脑
    if (casesLocal() && !$('#cases-cloud').hidden) {
      var cs = MB.cloud.status(), out = cs.cached && cs.count && cs.status === 'login' ? 'out' : 'empty';
      if ($('#cases-cloud').getAttribute('data-local') !== out) {
        $('#cases-cloud').setAttribute('data-local', out);
        $('#cases-cloud').innerHTML = out === 'out' ?
          '本机案例库登出了（' + cs.count + ' 张照片都还在这台电脑）：到<a href="caselib.html" target="_blank" rel="noopener">案例库</a>填你的名字、按「开始用」，「帮我挑」就回来。' :
          '先到<a href="caselib.html" target="_blank" rel="noopener">案例库</a>把案例文件夹汇入这台电脑，「帮我挑」就会按需求卡挑公司做过的家。';
      }
    }
    renderBlocked();
  }
  $('#cases-pick').addEventListener('click', function () { openPicker({ mode: 'cases', src: hasCases() ? 'cases' : 'all' }); });
  $('#cases-match').addEventListener('click', function () { openMatch(); });
  $('#cases-auto').addEventListener('click', function () {
    var p = S.project;
    if (casesBlocked()) { ping(BLOCKED_MSG, 4800); return; }
    if (p.cases.length && !confirm('换掉现在的 ' + p.cases.length + ' 个参考空间？')) return;
    var refs = MB.suggestCases ? MB.suggestCases(p, S.resolve, CASE_MAX) : [];
    if (!refs.length) {
      var cst = p.caseStyle && MB.caseStyle ? MB.caseStyle(p.caseStyle) : null;
      ping(cst ? '公司案例库里还没有「' + cst.zh + '」风格的空间照（可以在 ① 客户把风格改成「不限」）' : '公司案例库里还没有可以自动放的空间照', 3200);
      return;
    }
    p.cases = refs.map(function (ref) { return { ref: ref, note: null }; });
    if (yieldToHandPicked(p).length) renderRooms();
    renderCases(); changed({ now: true });
    ping('挑了 ' + refs.length + ' 个不同的家 —— 那一句是自动写的，可以改');
  });
  $('#cases-cloud').addEventListener('click', function (e) {
    if (e.target.closest('[data-goto-lib]')) { e.preventDefault(); showTab('library'); }
  });
  $('#cases-list').addEventListener('click', function (e) {
    var row = e.target.closest('.case-row'); if (!row) return;
    var list = S.project.cases, i = +row.getAttribute('data-i');
    if (e.target.closest('[data-case-up]') && i > 0) list.splice(i - 1, 0, list.splice(i, 1)[0]);
    else if (e.target.closest('[data-case-del]')) list.splice(i, 1);
    else return;
    renderCases(); changed({ now: true });
  });
  $('#cases-list').addEventListener('input', function (e) {
    if (!e.target.hasAttribute('data-case-note')) return;
    var c = S.project.cases[+e.target.closest('.case-row').getAttribute('data-i')];
    if (!c) return;
    c.note = e.target.value.trim() ? e.target.value : null;   // 删光 = 用自动的那句
    changed();
  });

  /* ============================================================
     ③ 平面图
     ============================================================ */
  function renderPlan() {
    var p = S.project;
    bindInputs($('[data-pane="plan"]'));
    var plans = S.viewImages.filter(function (u) { return u.tag === 'plan'; });
    $('#plan-lib').innerHTML = plans.length ? '<p class="sub-h" style="margin-top:0">或用图库里的平面图</p><div class="thumbs">' +
      plans.map(function (u) {
        return '<button type="button" class="thumb" data-plan-use="' + esc(u.id) + '" style="padding:0;border:0;cursor:pointer"><img src="' + esc(u.src) + '" alt="" /></button>';
      }).join('') + '</div>' : '';

    if (!p.plan.src) { $('#plan-area').innerHTML = ''; return; }
    if (!S.pinRoom || !p.rooms.some(function (r) { return r.uid === S.pinRoom; })) {
      var next = p.rooms.filter(function (r) { return !p.plan.pins[r.uid]; })[0] || p.rooms[0];
      S.pinRoom = next ? next.uid : null;
    }
    var picks = p.rooms.map(function (r, i) {
      return '<button class="mini' + (p.plan.pins[r.uid] ? ' done' : '') + '" type="button" data-pin-room="' + esc(r.uid) + '" aria-pressed="' + (r.uid === S.pinRoom) + '">' +
        (i + 1) + ' · ' + esc(MB.t(MB.roomTitle(p, r), 'zh')) + '</button>';
    }).join('');
    var pins = p.rooms.map(function (r, i) {
      var pin = p.plan.pins[r.uid];
      return pin ? '<span class="pin" style="left:' + (pin.x * 100) + '%;top:' + (pin.y * 100) + '%">' + (i + 1) + '</span>' : '';
    }).join('');
    $('#plan-area').innerHTML =
      (p.rooms.length ? '<p class="sub-h">1 · 选空间　2 · 点图上的位置</p><div class="pin-picks">' + picks + '</div>'
        : '<p class="hint">先到 ② 加入空间，才能标编号。</p>') +
      '<div class="plan-edit" id="plan-edit"><img src="' + esc(planSrc()) + '" alt="平面图" draggable="false" />' + pins + '</div>' +
      '<div class="btn-row" style="margin-top:12px">' +
        '<button class="mini" type="button" id="pin-undo">拿掉这个编号</button>' +
        '<button class="mini" type="button" id="pin-clear">清空全部编号</button>' +
        '<button class="mini danger" type="button" id="plan-remove">移除平面图</button>' +
      '</div>';
  }

  function planSrc() {
    var src = S.project.plan.src;
    if (!src) return '';
    return blobUrl('plan:' + src.length + ':' + src.slice(-48), src);
  }

  function setPlan(src, w, h) {
    var plan = S.project.plan;
    var hadPins = plan.src && plan.src !== src && Object.keys(plan.pins).length;
    if (plan.src !== src) { plan.pins = {}; S.pinRoom = null; }
    plan.src = src; plan.w = w; plan.h = h;
    renderPlan(); changed({ now: true });
    if (hadPins) ping('换了平面图，旧编号已清空 —— 请重新标', 3200);
  }

  function planFromFile(file) {
    if (!file || !/^image\//.test(file.type)) { ping('请选图片文件（JPG / PNG）'); return; }
    MB.compress(file, 2000, 0.88).then(function (out) { setPlan(out.src, out.w, out.h); ping('平面图已放上，接着标编号'); })
      .catch(function () { ping('这张图读不出来'); });
  }

  dropZone('#plan-drop', '#plan-file', function (files) { planFromFile(files[0]); });

  $('#plan-lib').addEventListener('click', function (e) {
    var b = e.target.closest('[data-plan-use]'); if (!b) return;
    var u = S.userImages.filter(function (x) { return x.id === b.getAttribute('data-plan-use'); })[0];
    if (u) setPlan(u.src, u.w, u.h);
  });

  $('#plan-area').addEventListener('click', function (e) {
    var p = S.project;
    var b = e.target.closest('[data-pin-room]');
    if (b) { S.pinRoom = b.getAttribute('data-pin-room'); renderPlan(); return; }
    if (e.target.id === 'pin-undo') {
      // 放完编号会自动跳到下一间：选中的那间还没编号，就撤回刚放的那个
      var uid = p.plan.pins[S.pinRoom] ? S.pinRoom : S.lastPin;
      if (uid && p.plan.pins[uid]) { delete p.plan.pins[uid]; S.pinRoom = uid; S.lastPin = null; }
      else ping('这个空间还没有编号');
      renderPlan(); changed(); return;
    }
    if (e.target.id === 'pin-clear') { if (confirm('清空全部编号？')) { p.plan.pins = {}; renderPlan(); changed(); } return; }
    if (e.target.id === 'plan-remove') {
      if (confirm('移除平面图？')) { p.plan = { src: null, w: 0, h: 0, pins: {} }; renderPlan(); changed({ now: true }); }
      return;
    }
    var box = e.target.closest('#plan-edit');
    if (box && S.pinRoom) {
      var rect = box.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width, y = (e.clientY - rect.top) / rect.height;
      p.plan.pins[S.pinRoom] = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
      S.lastPin = S.pinRoom;
      var next = p.rooms.filter(function (r) { return !p.plan.pins[r.uid]; })[0];
      if (next) S.pinRoom = next.uid;
      renderPlan(); changed();
    }
  });

  /* ============================================================
     ④ 到馆
     ============================================================ */
  /* 照方案的页序排（model.js MB.pageList）；这是 moodboard，提示只写一句 */
  var PAGE_NAMES = [
    ['letter', '开场短话', '先讲他们，再讲我们'],
    ['needs', '你们说的 · 我们做的', '最痛的 3 条，用他们的原话'],
    ['collections', '原创系列 · 五个一页', '溪岸五个系列各一张官方照片、一句话；不算进「偏长」'],
    ['plan', '平面图编号', '把注意力锚在「我家」'],
    ['chapter', '章节情绪页', '预设关 · 一张大图、一句话'],
    ['series', '五个系列 · 各一页', '放在空间页后面：官方照片 + 设计理念；不算进「偏长」'],
    ['cases', '参考空间', '在 ② 挑了才出现'],
    ['practical', '工期 · 保障', '预设关 · 三个大数字 + 一句'],
    ['language', '品牌一页', '品牌只占一页，放后面'],
    ['team', '本案团队', '预设关 · 填了名字才出现'],
    ['invite', '到馆邀约', '结尾 = 下一步'],
    ['back', '封底 · 欢迎回家', '']
  ];
  /* 每一页的图都能换（④）：没选 = 自动（整份不重复，按方案轮换）。
     原创系列、五个系列那几页的照片是固定的官方照片（MB.OVERVIEW_PHOTO / MB.SERIES_PHOTO），不在这里换 */
  var SLOTS = [['cover', '封面'], ['letter', '开场'], ['chapter', '章节'], ['practical', '工期'],
    ['language', '品牌'], ['team', '团队'], ['invite', '邀约'], ['back', '封底']];
  /* 情绪页选图时先看「氛围 · 风景」那一类 */
  var MOOD_SLOTS = { letter: 1, chapter: 1, practical: 1, language: 1, team: 1, back: 1 };
  var SLOT_BRAND = { cover: 'cover', letter: 'letter', back: 'welcome', chapter: 'craft', practical: 'craft', language: 'brand', team: 'team' };
  /* 缩图要跟方案页同一张：model.js 的 MB.pageImageSrc（同一份 MB.deckImages，自动规则挑不到图就用品牌照） */
  /** { src, gone }：gone = 销售选的公司案例打不开（'blocked' 暂停中 / 'deleted' 被删掉），src 是空的 */
  function slotSrc(p, slot, plan) {
    try {
      if (typeof MB.pageImageSrc === 'function') { var x = MB.pageImageSrc(p, slot, S.resolve, plan); return { src: x ? x.src : '', gone: x && x.gone || '' }; }
      var im = S.resolve(MB.pageImage(p, slot, S.resolve));
      if (im) return { src: im.src, gone: MB.caseGone ? MB.caseGone(im) : '' };
    } catch (e) { console.error(e); }
    var ph = MB.BRAND && MB.BRAND.photos && MB.BRAND.photos[SLOT_BRAND[slot]];
    return { src: ph ? ph.src : '', gone: '' };
  }
  /** 这一页现在出不出（关着的页缩图变淡） */
  function pageOn(p, type) {
    return MB.pageList(p, S.resolve).some(function (pg) { return pg.type === type; });
  }

  function renderVisit() {
    var p = S.project, L = textLang();
    bindInputs($('[data-pane="visit"]'));
    var prep = MB.prepared(p);
    $('#prep-edit').innerHTML = [0, 1, 2].map(function (i) {
      return '<div class="field" style="margin-bottom:10px"><label class="q">第 ' + (i + 1) + ' 样' +
        (p.visit.prepared[i] != null ? '<button class="reset" type="button" data-prep-reset="' + i + '">↺ 用默认</button>' : '') + '</label>' +
        '<input type="text" data-prep="' + i + '" value="' + esc(MB.t(prep[i], L)) + '" /></div>';
    }).join('');
    $('#page-toggles').innerHTML = PAGE_NAMES.map(function (x) {
      return '<label class="chk"><input type="checkbox" data-page="' + x[0] + '"' + (p.pages[x[0]] ? ' checked' : '') + ' />' +
        '<span>' + x[1] + (x[2] ? '<small>' + x[2] + '</small>' : '') + '</span></label>';
    }).join('');
    var plan = null;
    try { plan = MB.deckImages ? MB.deckImages(p, S.resolve) : null; } catch (e) { console.error(e); }
    $('#slot-thumbs').innerHTML = SLOTS.map(function (s) {
      var x = slotSrc(p, s[0], plan || undefined), src = x.src, on = pageOn(p, s[0]);
      var gone = x.gone === 'blocked' ? '暂时打不开' : x.gone === 'deleted' ? (casesLocal() ? '这台电脑没有' : '已删除') : '';
      return '<div class="slot' + (on ? '' : ' off') + '" title="' + (on ? '' : '这一页关着 —— 打开才会印') + '">' +
        '<button type="button" class="thumb" data-slot="' + s[0] + '">' +
          (src ? '<img src="' + esc(src) + '" alt="" />' : gone ? '<span class="img-gone" aria-hidden="true"></span><span class="case-tag warn">' + gone + '</span>' : '') + '</button>' +
        '<div>' + s[1] + (p.images[s[0]] ? ' · <a href="#" data-slot-auto="' + s[0] + '">自动</a>' : '') + '</div></div>';
    }).join('');
    $('#slot-auto').hidden = !(p.visit.auto && p.visit.date);
    $('#slot-swap').disabled = !p.visit.date2;
    // 英文方案就给英文示范，免得销售照着中文示范打进英文方案
    var en = p.lang !== 'zh';
    $('#x-time').placeholder = en ? 'e.g. About 8–10 weeks from design sign-off to installation' : '例：确认设计后约 8–10 周完成安装（近 10 个马来西亚项目的实际区间）';
    $('#x-budget').placeholder = en ? 'e.g. RM 85k – 110k for the spaces and boards in this proposal; final quote after measuring' : '例：RM 85k – 110k（按这份方案的空间与板材；量尺后出正式报价）';
    $('#x-built').placeholder = en ? 'Moisture-resistant boards and full edge-banding in wet areas\nCabinet warranty __ years, hardware __ years\nOur own team measures and installs'
      : '湿区柜体用防潮板 + 全封边\n柜体保修 __ 年，五金保修 __ 年\n自有团队量尺与安装';
    renderTeam();
    renderInviteLink();
  }

  /* ---------- 本案团队 ------------------------------------------
     p.team = [{ role, name }]：role 是 MB.BRAND.roles 的 key，或销售自订的职称；
     名字空着的那一行不印 —— 客户是跟「人」买，有名有姓才有用 */
  var TEAM_MAX = 6;
  function roles() { return (MB.BRAND && MB.BRAND.roles) || []; }
  function roleKnown(k) { return roles().some(function (r) { return r.key === k; }); }
  function renderTeam() {
    var p = S.project;
    $('#team-list').innerHTML = p.team.length ? p.team.map(function (m, i) {
      var known = roleKnown(m.role);
      var opts = roles().map(function (r) {
        return '<option value="' + esc(r.key) + '"' + (m.role === r.key ? ' selected' : '') + '>' + esc(r.zh) + '</option>';
      }).join('') + '<option value="__custom"' + (known ? '' : ' selected') + '>自订职称…</option>';
      return '<div class="team-row" data-i="' + i + '">' +
        '<div class="team-role"><select data-team-role aria-label="职称">' + opts + '</select>' +
          (known ? '' : '<input type="text" data-team-custom value="' + esc(m.role || '') + '" placeholder="职称，例：灯光顾问" aria-label="自订职称" />') +
        '</div>' +
        '<input type="text" data-team-name value="' + esc(m.name || '') + '" placeholder="名字" aria-label="名字" />' +
        '<button class="icon" type="button" data-team-del title="删除这一行">×</button></div>';
    }).join('') : '<p class="hint" style="margin:0 0 10px">还没有。一个名字都没有就不出团队页。</p>';
    $('#team-add').disabled = p.team.length >= TEAM_MAX;
  }
  /* 预设那一行是「我」：改了「我是谁」的名字，团队里还是旧名字（或空着）的销售那一行跟着改 */
  function syncTeamHost(before, now) {
    var team = S.project.team || [];
    for (var i = 0; i < team.length; i++) {
      if (team[i].role === 'sales' && (team[i].name || '') === (before || '')) { team[i].name = now; return; }
    }
  }
  $('#team-list').addEventListener('change', function (e) {
    if (!e.target.hasAttribute('data-team-role')) return;
    var i = +e.target.closest('.team-row').getAttribute('data-i'), m = S.project.team[i];
    m.role = e.target.value === '__custom' ? '' : e.target.value;
    renderTeam(); changed();
    if (!m.role) { var inp = $('.team-row[data-i="' + i + '"] [data-team-custom]'); if (inp) inp.focus(); }
  });
  $('#team-list').addEventListener('input', function (e) {
    var row = e.target.closest('.team-row'); if (!row) return;
    var m = S.project.team[+row.getAttribute('data-i')];
    if (e.target.hasAttribute('data-team-name')) m.name = e.target.value;
    else if (e.target.hasAttribute('data-team-custom')) m.role = e.target.value;
    else return;
    changed();
  });
  $('#team-list').addEventListener('click', function (e) {
    if (!e.target.closest('[data-team-del]')) return;
    S.project.team.splice(+e.target.closest('.team-row').getAttribute('data-i'), 1);
    renderTeam(); changed({ now: true });
  });
  $('#team-add').addEventListener('click', function () {
    var team = S.project.team;
    if (team.length >= TEAM_MAX) return;
    // 预设给还没出现过的职称（设计师 → 技术设计 → 项目经理…）
    var used = {};
    team.forEach(function (m) { used[m.role] = 1; });
    var next = roles().filter(function (r) { return !used[r.key]; })[0];
    team.push({ role: next ? next.key : '', name: '' });
    renderTeam(); changed();
    var inp = $('.team-row:last-child [data-team-name]');
    if (inp) inp.focus();
  });

  $('#slot-ok').addEventListener('click', function () {
    S.project.visit.auto = false;
    $('#slot-auto').hidden = true;
    changed({ now: true });
  });

  /* 客户回「2」：时段 2 升为正式时段（邀请函链接、二维码、④ 提醒都只看时段 1） */
  $('#slot-swap').addEventListener('click', function () {
    var v = S.project.visit;
    if (!v.date2) return;
    v.date = v.date2; v.time = v.time2 || v.time;
    v.date2 = ''; v.auto = false;
    renderVisit(); changed({ now: true });
    ping('已改用时段 2：' + MB.slotLabel(v.date, v.time, 'zh'));
  });

  function renderInviteLink() {
    var link = MB.inviteLink(S.project);
    $('#inv-link').textContent = link.url;
    $('#inv-open').href = link.url + (link.url.indexOf('?') > -1 ? '&' : '?') + 'open=1';
  }

  $('#prep-edit').addEventListener('input', function (e) {
    if (!e.target.hasAttribute('data-prep')) return;
    S.project.visit.prepared[+e.target.getAttribute('data-prep')] = e.target.value;
    changed();
  });
  $('#prep-edit').addEventListener('click', function (e) {
    var b = e.target.closest('[data-prep-reset]'); if (!b) return;
    S.project.visit.prepared[+b.getAttribute('data-prep-reset')] = null;
    renderVisit(); changed();
  });
  $('#page-toggles').addEventListener('change', function (e) {
    var k = e.target.getAttribute('data-page'); if (!k) return;
    S.project.pages[k] = e.target.checked;
    // 打开的那一页有手选的图（或是参考空间页）：空间页让开同一张
    if (e.target.checked) yieldToHandPicked(S.project);
    changed({ now: true });
  });
  $('#slot-thumbs').addEventListener('click', function (e) {
    var a = e.target.closest('[data-slot-auto]');
    if (a) { e.preventDefault(); S.project.images[a.getAttribute('data-slot-auto')] = null; renderVisit(); changed({ now: true }); return; }
    var b = e.target.closest('[data-slot]'); if (!b) return;
    var slot = b.getAttribute('data-slot');
    openPicker({ mode: 'slot', slot: slot, filter: MOOD_SLOTS[slot] ? 'mood' : 'all' });
  });
  $('#inv-copy').addEventListener('click', function () { copyText($('#inv-link').textContent, '邀请函链接已复制'); });

  /* ============================================================
     ⑤ 文案
     ============================================================ */
  function renderCopy() {
    var p = S.project;
    $$('#copy-lang button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === S.copyLang); });
    var cwa = MB.msisdn(p.client.wa);
    $('#copy-to').textContent = cwa ? '发送对象：+' + cwa : '（在 ① 填客户 WhatsApp，就能一键发送）';
    var list = MB.writeCopy(p, S.copyLang);
    $('#copy-list').innerHTML = list.map(function (c, i) {
      var edit = S.copyEdits[copyKey(c)];
      return '<div class="copy-card" data-i="' + i + '">' +
        '<h4>' + esc(c.title) + '<button class="reset" type="button" data-copy-reset' + (edit == null ? ' hidden' : '') + '>↺ 用自动生成</button></h4>' +
        '<p class="when">' + esc(c.when) + '</p>' +
        '<textarea rows="10">' + esc(edit != null ? edit : c.text) + '</textarea>' +
        '<div class="pr">' + c.principles.map(function (pr, k) {
          return '<span data-pr="' + k + '" title="' + esc(pr.d) + '">' + esc(pr.zh) + '</span>';
        }).join('') + '</div>' +
        '<p class="pr-why"></p>' +
        '<div class="btn-row">' +
          '<button class="btn gold" type="button" data-copy-i="' + i + '">复制</button>' +
          (c.noWa ? '' : '<button class="btn ghost" type="button" data-wa-i="' + i + '">用 WhatsApp 发送</button>') +
        '</div></div>';
    }).join('');
    S.copyList = list;
  }

  /** 改过的讯息按「方案 · 哪一则 · 语言」记住；切页、切方案语言都不会洗掉 */
  function copyKey(c) { return S.project.id + ':' + c.id + ':' + S.copyLang; }
  $('#copy-list').addEventListener('input', function (e) {
    var card = e.target.closest('.copy-card'); if (!card || e.target.tagName !== 'TEXTAREA') return;
    S.copyEdits[copyKey(S.copyList[+card.getAttribute('data-i')])] = e.target.value;
    $('[data-copy-reset]', card).hidden = false;
  });

  $('#copy-lang').addEventListener('click', function (e) {
    var b = e.target.closest('[data-v]'); if (!b) return;
    S.copyLang = b.getAttribute('data-v'); lsSet(COPYLANG_KEY, S.copyLang);
    renderCopy();
  });
  $('#copy-list').addEventListener('click', function (e) {
    var card = e.target.closest('.copy-card'); if (!card) return;
    if (e.target.closest('[data-copy-reset]')) {
      delete S.copyEdits[copyKey(S.copyList[+card.getAttribute('data-i')])];
      renderCopy(); return;
    }
    var text = $('textarea', card).value;
    var pr = e.target.closest('[data-pr]');
    if (pr) {
      var c = S.copyList[+card.getAttribute('data-i')].principles[+pr.getAttribute('data-pr')];
      var why = $('.pr-why', card);
      var same = why.classList.contains('on') && why.getAttribute('data-k') === pr.getAttribute('data-pr');
      why.innerHTML = '<b>' + esc(c.zh) + '</b> —— ' + esc(c.d);
      why.setAttribute('data-k', pr.getAttribute('data-pr'));
      why.classList.toggle('on', !same);
      return;
    }
    if (e.target.hasAttribute('data-copy-i')) {
      copyText(text, S.copyList[+card.getAttribute('data-i')].id === 'send' ? '已复制 —— 记得先发 PDF' : '已复制');
    }
    if (e.target.hasAttribute('data-wa-i')) {
      var cwa = MB.msisdn(S.project.client.wa);
      window.open('https://wa.me/' + cwa + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
    }
  });

  /* ============================================================
     图库
     ============================================================ */
  function tagName(k) {
    if (k === 'plan') return '平面图';
    for (var i = 0; i < MB.TAGS.length; i++) if (MB.TAGS[i].key === k) return MB.TAGS[i].zh;
    return k;
  }
  function tagOptions(sel, withPlan) {
    return MB.TAGS.concat(withPlan ? [{ key: 'plan', zh: '平面图' }] : []).map(function (t) {
      return '<option value="' + t.key + '"' + (t.key === sel ? ' selected' : '') + '>' + esc(t.zh) + '</option>';
    }).join('');
  }

  /* ---------- 图库 / 选图共用：来源 × 空间（× 公司案例的 风格 · 柜类 · 项目），案例每页 48 张 ----------
     f = { src: 'all'|'own'|'builtin'|'cases', room: 'all'|空间 key|'plan', style, cab, pid, page } */
  var PAGE = 48;
  var SRC_NAMES = [['all', '全部'], ['own', '我的'], ['builtin', '内置'], ['cases', '公司案例']];
  function srcOf(im) { return im.isCase ? 'cases' : im.own ? 'own' : 'builtin'; }
  function filterChips(active, counts) {
    var keys = ['all'].concat(MB.TAGS.map(function (t) { return t.key; }), ['plan']);
    return keys.filter(function (k) { return k === 'all' || counts[k]; }).map(function (k) {
      var name = k === 'all' ? '全部空间' : tagName(k);
      return '<button class="mini" type="button" data-filter="' + k + '" aria-pressed="' + (k === active) + '">' + esc(name) +
        (counts[k] ? ' ' + counts[k] : '') + '</button>';
    }).join('');
  }
  function srcChips(active, counts) {
    return SRC_NAMES.filter(function (x) { return x[0] === 'all' || x[0] === 'own' || counts[x[0]]; }).map(function (x) {
      return '<button class="mini src" type="button" data-src="' + x[0] + '" aria-pressed="' + (x[0] === active) + '">' + esc(x[1]) +
        (counts[x[0]] ? ' ' + counts[x[0]] : '') + '</button>';
    }).join('');
  }

  function libraryItems() {
    return MB.allImages(S.viewImages);
  }
  function countTags(items) {
    var c = { all: items.length, own: 0 };
    items.forEach(function (im) {
      if (im.own) c.own++;
      im.rooms.forEach(function (k) { c[k] = (c[k] || 0) + 1; });
    });
    return c;
  }
  function matches(im, f) {
    return f === 'all' || (f === 'own' && im.own) || im.rooms.indexOf(f) > -1;
  }
  /** 公司案例的筛选（只在来源 = 公司案例时用） */
  function caseMatch(im, f) {
    return (!f.style || im.style === f.style) && (!f.cab || (im.cabinets || []).indexOf(f.cab) > -1) && (!f.pid || im.pid === f.pid);
  }
  /** 筛好的一页：{ chips, cfilter, items（这一页要画的）, pager, total } */
  function gallery(f, all) {
    var srcCount = { all: all.length, own: 0, builtin: 0, cases: 0 };
    all.forEach(function (im) { srcCount[srcOf(im)]++; });
    if (f.src !== 'all' && !srcCount[f.src] && f.src !== 'own') f.src = 'all';   // 那个来源没有图了（例：登出）
    var cases = f.src === 'cases';
    var list = all.filter(function (im) { return (f.src === 'all' || srcOf(im) === f.src) && (!cases || caseMatch(im, f)); });
    var counts = countTags(list);
    if (f.room !== 'all' && !counts[f.room]) f.room = 'all';
    var items = list.filter(function (im) { return matches(im, f.room); });
    // 案例几千张：分页（自己的、内置的照旧全部列出）
    var mine = items.filter(function (im) { return !im.isCase; }), cs = items.filter(function (im) { return im.isCase; });
    var pages = Math.max(1, Math.ceil(cs.length / PAGE));
    f.page = Math.max(0, Math.min(pages - 1, f.page || 0));
    var shown = mine.concat(cs.slice(f.page * PAGE, (f.page + 1) * PAGE));
    var pager = cs.length > PAGE ? '<button class="mini" type="button" data-page="' + (f.page - 1) + '"' + (f.page ? '' : ' disabled') + '>‹ 上一页</button>' +
      '<span class="pg-of">公司案例 第 ' + (f.page + 1) + ' / ' + pages + ' 页 · 共 ' + cs.length + ' 张</span>' +
      '<button class="mini" type="button" data-page="' + (f.page + 1) + '"' + (f.page < pages - 1 ? '' : ' disabled') + '>下一页 ›</button>' : '';
    var cfilter = '';
    if (cases) {
      // 下拉选单的数字：别的条件不变、只换这一项时有几张
      var base = all.filter(function (im) { return im.isCase && matches(im, f.room); });
      var cnt = function (key, val) {
        var g = {}; g.style = f.style; g.cab = f.cab; g.pid = f.pid; g[key] = val;
        return base.filter(function (im) { return caseMatch(im, g); }).length;
      };
      var sel = function (key, label, opts) {
        return '<label class="cf"><span>' + label + '</span><select data-cf="' + key + '">' +
          '<option value="">全部</option>' + opts.map(function (o) {
            var n = cnt(key, o[0]);
            return n || o[0] === f[key] ? '<option value="' + esc(o[0]) + '"' + (o[0] === f[key] ? ' selected' : '') + '>' + esc(o[1]) + ' · ' + n + '</option>' : '';
          }).join('') + '</select></label>';
      };
      cfilter = sel('style', '风格', (MB.CASE_STYLES || []).map(function (x) { return [x.key, x.zh]; })) +
        sel('cab', '柜类', (MB.CASE_CABINETS || []).map(function (x) { return [x.key, x.zh]; })) +
        sel('pid', '项目', (MB.cloud ? MB.cloud.projects() : []).map(function (x) { return [x.pid, x.label]; })) +
        (f.style || f.cab || f.pid ? '<button class="mini" type="button" data-cf-clear>清除</button>' : '');
    }
    return { chips: '<div class="lib-row">' + srcChips(f.src, srcCount) + '</div><div class="lib-row">' + filterChips(f.room, counts) + '</div>',
      cfilter: cfilter, items: shown, pager: pager, total: items.length };
  }
  /** 案例格子的图：缩图到了用缩图；缩图包载不到（没有 CORS / 离线）用原图；还在载就先空着 */
  function caseImg(im) {
    var src = im.thumb || (MB.cloud && MB.cloud.thumb(im.ref)) || (MB.cloud && MB.cloud.thumbsFailed(im.pid) ? im.src : '');
    return src ? '<img src="' + esc(src) + '" alt="" loading="lazy" />' : '<span class="img-wait" aria-hidden="true"></span>';
  }
  /** 这一页的案例还没有缩图：载它们的缩图包（载到了 cloud.js 会通知重画） */
  function needThumbs(items) {
    if (!MB.cloud) return;
    var pids = [];
    items.forEach(function (im) {
      if (im.isCase && !im.thumb && !MB.cloud.thumb(im.ref) && pids.indexOf(im.pid) < 0 && !MB.cloud.thumbsFailed(im.pid)) pids.push(im.pid);
    });
    if (pids.length) MB.cloud.thumbs(pids).then(function (n) {
      // 载不到（没有 CORS）：改用原图重画一次
      if (!n && pids.some(function (pid) { return MB.cloud.thumbsFailed(pid); })) galleryRedraw();
    });
  }
  function galleryRedraw() {
    if (S.tab === 'library') renderLibrary();
    if (S.picker && $('#pick-modal').classList.contains('on')) renderPicker();
  }
  /** 筛选列的点击（图库与选图共用）：回 true = 处理了，要重画 */
  function galleryClick(f, e) {
    var b = e.target.closest('[data-filter],[data-src],[data-page],[data-cf-clear],[data-same-proj]');
    if (!b || b.disabled) return false;
    if (b.hasAttribute('data-filter')) { f.room = b.getAttribute('data-filter'); f.page = 0; }
    else if (b.hasAttribute('data-src')) { f.src = b.getAttribute('data-src'); f.page = 0; if (f.src !== 'cases') f.pid = ''; }
    else if (b.hasAttribute('data-page')) f.page = +b.getAttribute('data-page') || 0;
    else if (b.hasAttribute('data-cf-clear')) { f.style = f.cab = f.pid = ''; f.page = 0; }
    else if (b.hasAttribute('data-same-proj')) {
      // 同项目其他照片：切到公司案例、只看这个家
      f.src = 'cases'; f.pid = b.getAttribute('data-same-proj'); f.style = f.cab = ''; f.room = 'all'; f.page = 0;
    }
    return true;
  }
  function galleryChange(f, e) {
    var k = e.target.getAttribute && e.target.getAttribute('data-cf');
    if (!k) return false;
    f[k] = e.target.value; f.page = 0;
    return true;
  }
  function sameProjBtn(im) {
    return im.isCase && im.pid ? '<button class="same-proj" type="button" data-same-proj="' + esc(im.pid) + '" title="同项目其他照片">同项目</button>' : '';
  }

  function renderLibrary() {
    $('#up-tag').innerHTML = tagOptions($('#up-tag').value || 'kitchen', true);
    renderCloudBox();
    var g = gallery(S.lib, libraryItems());
    $('#lib-filter').innerHTML = g.chips;
    $('#lib-cfilter').innerHTML = g.cfilter;
    $('#lib-cfilter').hidden = !g.cfilter;
    $('#lib-match').hidden = !(hasCases() || casesBlocked());
    $('#lib-grid').innerHTML = g.items.map(function (im) {
      if (im.isCase) {
        return '<div class="lib-item case" data-ref="' + esc(im.ref) + '" title="' + esc((MB.cloud && MB.cloud.projectLabel(im.pid)) || '') + '">' +
          caseImg(im) + '<span class="own">案例</span>' + sameProjBtn(im) +
          '<span class="cap">' + esc(im.label || '') + '</span></div>';
      }
      // 系列预留的官方照片：照样列出来（看得到有哪几张），标「系列页专用 · X」—— 只印在原创系列和系列页
      var rcap = reservedCap(im);
      return '<div class="lib-item' + (rcap ? ' used reserved' : '') + '" data-ref="' + esc(im.ref) + '"><img src="' + esc(im.src) + '" alt="" loading="lazy" />' +
        (im.own
          ? '<span class="own">我的</span><select data-retag aria-label="空间">' + tagOptions(im.rooms[0], true) + '</select>' +
            '<button class="icon del" type="button" data-del-img title="删除">×</button>'
          : '<span class="cap">' + (rcap ? esc(rcap) : '内置 · ' + esc(im.label || '')) + '</span>') +
        '</div>';
    }).join('') || '<p class="hint">这一类还没有图。</p>';
    $('#lib-pager').innerHTML = g.pager;
    $('#lib-pager').hidden = !g.pager;
    needThumbs(g.items);
  }

  $('#lib-filter').addEventListener('click', function (e) { if (galleryClick(S.lib, e)) renderLibrary(); });
  $('#lib-pager').addEventListener('click', function (e) {
    if (galleryClick(S.lib, e)) { renderLibrary(); $('#lib-filter').scrollIntoView({ block: 'start' }); }
  });
  $('#lib-cfilter').addEventListener('change', function (e) { if (galleryChange(S.lib, e)) renderLibrary(); });
  $('#lib-cfilter').addEventListener('click', function (e) { if (galleryClick(S.lib, e)) renderLibrary(); });
  $('#lib-match').addEventListener('click', function () { openMatch(); });
  $('#lib-grid').addEventListener('change', function (e) {
    if (!e.target.hasAttribute('data-retag')) return;
    var id = e.target.closest('[data-ref]').getAttribute('data-ref').slice(2);
    var u = S.userImages.filter(function (x) { return x.id === id; })[0];
    if (!u) return;
    u.tag = e.target.value;
    storeImgs([u]).then(function () { rebuildResolver(); renderLibrary(); });
  });
  $('#lib-grid').addEventListener('click', function (e) {
    if (e.target.closest('[data-same-proj]')) { if (galleryClick(S.lib, e)) renderLibrary(); return; }
    if (!e.target.hasAttribute('data-del-img')) return;
    var ref = e.target.closest('[data-ref]').getAttribute('data-ref');
    if (!confirm('从图库删除这张图？（已经用在方案里的位置会空出来）')) return;
    MB.store.removeImage(ref.slice(2)).catch(function () {}).then(function () {
      S.userImages = S.userImages.filter(function (u) { return 'u:' + u.id !== ref; });
      S.projects.forEach(function (p) {
        var hit = false;
        p.rooms.forEach(function (r) {
          var n = r.images.length;
          r.images = r.images.filter(function (x) { return x !== ref; });
          if (r.images.length !== n) hit = true;
        });
        Object.keys(p.images).forEach(function (k) { if (p.images[k] === ref) { p.images[k] = null; hit = true; } });
        if (Array.isArray(p.cases)) {
          var nc = p.cases.length;
          p.cases = p.cases.filter(function (c) { return c.ref !== ref; });
          if (p.cases.length !== nc) hit = true;
        }
        if (hit && p !== S.project) storePut(p);
      });
      rebuildResolver(); renderLibrary(); changed({ now: true });
    });
  });

  function saveUploads(files, tag) {
    files = files.filter(function (f) { return /^image\//.test(f.type); });
    if (!files.length) return Promise.resolve([]);
    ping('处理 ' + files.length + ' 张照片…', 8000);
    var recs = [];
    return files.reduce(function (chain, f) {
      return chain.then(function () {
        return MB.compress(f, 1600, 0.84).then(function (out) {
          recs.push({ id: MB.uid(), tag: tag, src: out.src, w: out.w, h: out.h, label: f.name, source: 'upload', ts: Date.now() });
        }).catch(function () {});
      });
    }, Promise.resolve()).then(function () {
      return storeImgs(recs);
    }).then(function () {
      S.userImages = recs.concat(S.userImages);
      rebuildResolver();
      ping('已存入图库：' + recs.length + ' 张');
      if (S.tab === 'library') renderLibrary();
      return recs.map(function (r) { return r.id; });
    });
  }

  dropZone('#up-drop', '#up-file', function (files) { saveUploads(files, $('#up-tag').value || 'other'); });

  /* PDF 收图 */
  dropZone('#pdf-drop', '#pdf-file', function (files) {
    var f = files[0];
    if (!f || !/pdf$/i.test(f.type || f.name)) { ping('请选 PDF 文件'); return; }
    var bar = $('#pdf-prog');
    bar.classList.add('on'); $('i', bar).style.width = '3%';
    MB.importPdf(f, function (done, total) { $('i', bar).style.width = Math.round(done / total * 100) + '%'; })
      .then(function (list) {
        bar.classList.remove('on');
        if (!list.length) { ping('这份 PDF 里没有找到照片'); return; }
        S.importBatch = list.map(function (x) {
          x.sel = MB.ROOM[x.tag] ? true : x.tag === 'showroom';
          x.source = f.name;
          return x;
        });
        openImport();
      })
      .catch(function (err) { bar.classList.remove('on'); ping('读取失败：' + (err && err.message || err), 4000); });
  });

  function openImport() {
    var b = S.importBatch;
    var rooms = {};
    b.forEach(function (x) { if (MB.ROOM[x.tag]) rooms[x.tag] = 1; });
    $('#imp-hint').innerHTML = '共 ' + b.length + ' 张，已按页面标题分好 ' + Object.keys(rooms).length + ' 个空间。' +
      '分错的直接改下拉选单；不要的取消勾选。<b>平面图</b>默认不勾（每个客户不同），可以点「设为这份方案的平面图」。';
    renderImport();
    $('#import-modal').classList.add('on');
  }
  function renderImport() {
    $('#imp-grid').innerHTML = S.importBatch.map(function (x, i) {
      return '<div class="lib-item' + (x.sel ? ' sel' : '') + '" data-i="' + i + '">' +
        '<img src="' + esc(x.src) + '" alt="" data-imp-toggle />' +
        '<span class="cap">p.' + x.page + ' · ' + x.w + '×' + x.h + '</span>' +
        '<select data-imp-tag aria-label="空间">' + tagOptions(x.tag, true) + '</select>' +
        (x.tag === 'plan' ? '<button class="mini" type="button" data-imp-plan style="width:100%;border-radius:0">设为这份方案的平面图</button>' : '') +
        '</div>';
    }).join('');
    $('#imp-save').textContent = '存入图库（' + S.importBatch.filter(function (x) { return x.sel; }).length + '）';
  }
  $('#imp-grid').addEventListener('click', function (e) {
    var item = e.target.closest('[data-i]'); if (!item) return;
    var x = S.importBatch[+item.getAttribute('data-i')];
    if (e.target.hasAttribute('data-imp-toggle')) { x.sel = !x.sel; renderImport(); }
    if (e.target.hasAttribute('data-imp-plan')) { setPlan(x.src, x.w, x.h); ping('已设为平面图，到 ③ 标编号'); }
  });
  $('#imp-grid').addEventListener('change', function (e) {
    if (!e.target.hasAttribute('data-imp-tag')) return;
    var x = S.importBatch[+e.target.closest('[data-i]').getAttribute('data-i')];
    x.tag = e.target.value; x.sel = x.tag !== 'other' && x.tag !== 'plan' ? true : x.sel;
    renderImport();
  });
  $('#imp-all').addEventListener('click', function () { S.importBatch.forEach(function (x) { x.sel = true; }); renderImport(); });
  $('#imp-none').addEventListener('click', function () { S.importBatch.forEach(function (x) { x.sel = false; }); renderImport(); });
  $('#imp-save').addEventListener('click', function () {
    var recs = S.importBatch.filter(function (x) { return x.sel; }).map(function (x) {
      return { id: MB.uid(), tag: x.tag, src: x.src, w: x.w, h: x.h, label: 'PDF p.' + x.page + ' · ' + (x.label || '').slice(0, 30), source: x.source, ts: Date.now() };
    });
    if (!recs.length) { closeModals(); return; }
    storeImgs(recs).then(function () {
      S.userImages = recs.concat(S.userImages);
      rebuildResolver();
      // 空着的空间，顺手配上刚收进来的图
      var p = S.project, filled = 0;
      p.rooms.forEach(function (r) {
        if (!r.images.length) { r.images = MB.autoPick(p, r, S.viewImages); if (r.images.length) filled++; }
      });
      S.importBatch = [];
      closeModals();
      renderLibrary(); changed({ now: true });
      ping('已存入 ' + recs.length + ' 张' + (filled ? '，并配好 ' + filled + ' 个空着的空间' : '') + '。想全部换上新图：② → 全部重新自动配图', 4200);
    }).catch(function () { ping('存档失败：浏览器存储空间可能满了', 3200); });
  });

  /* ============================================================
     公司案例库：登入框 · 帮我挑
     ============================================================ */
  function fmtTime(ts) {
    if (!ts) return '';
    var d = new Date(ts), now = new Date();
    var hm = MB.pad2(d.getHours()) + ':' + MB.pad2(d.getMinutes());
    return d.toDateString() === now.toDateString() ? '今天 ' + hm : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
  }
  /** 登入框 / 状态（图库、帮我挑共用）。名字 + 团队密码；密码不存 */
  function cloudBoxHtml() {
    if (!MB.cloud) return '';
    var st = MB.cloud.status(), n = st.count;
    var name = st.user || (S.project && S.project.host && S.project.host.name) || '';
    var form = '<form class="cloud-login" data-cloud-login autocomplete="on">' +
      '<input type="text" name="name" maxlength="30" autocomplete="username" placeholder="你的名字" aria-label="名字" value="' + esc(name) + '" />' +
      '<input type="password" name="pw" autocomplete="current-password" placeholder="团队密码" aria-label="团队密码" />' +
      '<button class="mini dark" type="submit">登入</button></form><p class="cloud-msg" data-cloud-msg></p>';
    var tools = '<div class="btn-row"><button class="mini" type="button" data-cloud-refresh>更新</button>' +
      (st.user ? '<button class="mini" type="button" data-cloud-logout>登出</button>' : '') + '</div>';
    var when = st.checked ? ' · ' + fmtTime(st.checked) + ' 更新' : '';
    if (st.local) return localBoxBody(st, n, when);
    // 暂停中：最上面先说清楚（登入过期、连不上的时候也一样）
    var ban = st.blocked ? '<p class="cloud-st warn cloud-blocked">' + BLOCKED_MSG + '</p>' : '';
    return ban + cloudBoxBody(st, n, form, tools, when);
  }
  /** 本机案例库（案例库页选了「存在这台电脑」）：不用登入、不会被 Vercel 暂停 */
  function localBoxBody(st, n, when) {
    var lib = '<a href="caselib.html" target="_blank" rel="noopener">案例库</a>';
    var tools = '<div class="btn-row"><button class="mini" type="button" data-cloud-refresh>更新</button></div>';
    if (st.status === 'ok' || (st.status === 'cached' && st.cached)) return '<p class="cloud-st ok">本机案例库 · ' + n + ' 张（存在这台电脑）' + when + '</p>' +
      '<p class="cloud-st">同事看不到这台电脑的照片：要给同事用，到' + lib + '「审核」汇出标签档，连同那个文件夹一起给他汇入。</p>' + tools;
    // 登出了（照片都还在这台电脑）：填名字就好，不要叫他再拖一次文件夹
    if ((st.status === 'login' || st.status === 'idle') && st.cached && n) return '<p class="cloud-st warn">本机案例库登出了（' + n + ' 张照片都还在这台电脑）：到' + lib + '填你的名字、按「开始用」就回来。</p>' + tools;
    if (st.status === 'login' || st.status === 'idle') return '<p class="cloud-st">本机案例库还没开：先到' + lib + '选「存在这台电脑」、填你的名字，再把案例文件夹拖进去。</p>' + tools;
    return '<p class="cloud-st warn">这台电脑的案例库还没准备好' + (st.cached ? '，先用存着的 ' + n + ' 张' : '') + '：重新整理这一页再试（要用一般视窗的 Chrome 或 Edge）。</p>' + tools;
  }
  function cloudBoxBody(st, n, form, tools, when) {
    if (st.status === 'blocked') return '<p class="cloud-st">' + (st.user ? '已登入：<b>' + esc(st.user) + '</b> · ' : '') +
      '方案里已经放的案例照片先印成空白的占位框（体检会提醒）。老板处理好之后按「更新」就恢复。</p>' + tools;
    if (st.status === 'ok') return '<p class="cloud-st ok">' + (st.user ? '已登入：<b>' + esc(st.user) + '</b> · ' : '') + n + ' 张案例' + when + '</p>' + tools;
    if (st.status === 'cached') return '<p class="cloud-st">这台电脑存着 ' + n + ' 张案例' + when + ' —— 正在问有没有新的…</p>';
    if (st.status === 'offline') return '<p class="cloud-st warn">暂时连不上公司案例库' + (st.blocked ? '（上次知道的是暂停中），方案里的案例照片先印成空白的占位框' :
      st.cached ? '，先用这台电脑存着的 ' + n + ' 张' + when : '') + '。</p>' + tools;
    if (st.status === 'unavailable') return '<p class="cloud-st">这个网址没有公司案例库（只有正式网站有）' + (st.cached && !st.blocked ? '；这台电脑存着的 ' + n + ' 张照样能用' : '') + '。</p>';
    // 登入过期：存着的清单只拿来显示方案里已经放的（之后被隐藏的照片这里看不出来），不再自动挑；登出了就是一般的登入框
    // 暂停中：方案里的案例照片这时是占位框（不是「照样显示」）
    if (st.status === 'login' && st.cached && !st.loggedOut && st.blocked) return '<p class="cloud-st warn">登入过期了 —— 案例库暂停中，方案里已经放的案例照片先印成空白的占位框。重新登入（登入后才知道案例库恢复了没有）：</p>' + form;
    if (st.status === 'login' && st.cached && !st.loggedOut) return '<p class="cloud-st warn">登入过期了 —— 方案里已经放的案例照片照样显示，但不会再自动挑、也挑不到新的（之后被隐藏的照片这里看不出来）。重新登入：</p>' + form;
    return '<p class="cloud-st">公司做过的案例（风格、柜类、空间都标好了）。用<b>团队密码</b>登入一次，「帮我挑」就会按需求卡挑给你。</p>' + form;
  }
  function renderCloudBox() {
    $$('[data-cloud-box]').forEach(function (el) { el.innerHTML = cloudBoxHtml(); });
    renderBlocked();
  }
  document.addEventListener('submit', function (e) {
    var f = e.target.closest && e.target.closest('[data-cloud-login]'); if (!f) return;
    e.preventDefault();
    var msg = f.parentNode.querySelector('[data-cloud-msg]');
    var btn = f.querySelector('button');
    btn.disabled = true;
    if (msg) msg.textContent = '登入中…';
    MB.cloud.login(f.elements.name.value, f.elements.pw.value).then(function (r) {
      btn.disabled = false;
      if (!r.ok) { if (msg) msg.textContent = r.msg; return; }
      // 按 Enter 登入时游标还在密码框：背景更新那时没重画，这里补画
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      renderCloudBox();
      if (S.tab === 'library') renderLibrary();
      if (S.tab === 'rooms') renderCases();
      if (casesBlocked()) ping('已登入。' + BLOCKED_MSG, 5200);
      else ping('已登入公司案例库：' + MB.cloud.status().count + ' 张案例', 2600);
    });
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-cloud-refresh]')) {
      ping('正在更新公司案例库…', 3000);
      MB.cloud.refresh(true).then(function (st) {
        // 先看「问到了没有」：登入过期、连不上的时候，「还在暂停中」只是上次知道的（不一定还是）
        ping(st.local ? (st.status === 'ok' ? '本机案例库：' + st.count + ' 张（存在这台电脑）' : '这台电脑的案例库还没准备好') :
          st.status === 'ok' ? '公司案例库已是最新：' + st.count + ' 张' :
          st.status === 'login' ? (st.blocked ? '要重新登入 —— 登入后才知道案例库恢复了没有' : '要重新登入') :
          st.status === 'blocked' ? '公司案例库还在暂停中 —— 案例照片暂时不能用' :
          '暂时连不上，先用存着的' + (st.blocked ? '（上次知道的是案例库暂停中）' : ''), 2600);
        renderCloudBox();
      });
    }
    if (e.target.closest('[data-cloud-logout]')) {
      if (!confirm('登出公司案例库？（已经放进方案的案例照片照样看得到）')) return;
      MB.cloud.logout().then(renderCloudBox);
    }
  });

  /** 业务正在左边打字：背景更新不重画编辑区（不然输入框会被换掉、游标不见） */
  function typing() {
    var a = document.activeElement;
    return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest && a.closest('.mb-edit'));
  }
  /** 案例清单变了（开机、更新、登入）：重建 resolver，画面上用得到的地方重画 */
  function casesChanged() {
    rebuildResolver();
    if (!S.project) return;
    if (S.tab === 'library' && !typing()) renderLibrary();
    if (S.tab === 'rooms' && !typing()) { renderRooms(); renderCases(); }
    if (S.picker && $('#pick-modal').classList.contains('on')) renderPicker();
    if ($('#match-modal').classList.contains('on')) renderMatch();
    renderBriefMatch(false);
    renderPreview();
  }

  /* ---------- 帮我挑：按需求卡从公司案例库挑 6–9 张，每张一句「为什么」 ----------
     业务按「放进厨房」「放进参考空间」才会用 —— 不会自己塞进方案。
     「为什么」只拼真的对得上的事实（model.js 的 MB.matchCases），放进参考空间时变成那一张的说明草稿 */
  var matchDone = {};   // 这次打开已经放进去的 ref → 放在哪
  function openMatch() {
    matchDone = {};
    renderMatch();
    $('#match-modal').classList.add('on');
  }
  function renderMatch() {
    var p = S.project, list = [];
    try { list = hasCases() && MB.matchCases ? MB.matchCases(p, S.resolve) : []; } catch (e) { console.error(e); }
    // 已经放进去的那几张：matchCases 会跳过（已经在方案里），这次打开还是留在原位，显示「已放进」
    var keep = Object.keys(matchDone).filter(function (ref) { return !list.some(function (x) { return x.ref === ref; }); });
    list = list.concat(keep.map(function (ref) { return matchDone[ref].item; }));
    var hint = $('#match-hint');
    // 暂停中：说清楚为什么挑不了（不是「没有对得上的」）
    if (casesBlocked()) {
      hint.textContent = '帮我挑现在挑不了：';
      $('#match-list').innerHTML = '<div data-cloud-box>' + cloudBoxHtml() + '</div>';
      matchList = [];
      return;
    }
    if (!hasCases()) {
      var lst = MB.cloud ? MB.cloud.status() : {};
      hint.innerHTML = !casesLocal() ? '要先登入公司案例库：' : lst.cached && lst.count && lst.status === 'login' ? '本机案例库登出了：' : '本机案例库里还没有照片：';
      $('#match-list').innerHTML = '<div data-cloud-box>' + cloudBoxHtml() + '</div>';
      return;
    }
    // 客户喜欢的风格（没选 = 不限，全部系列都可以）· 区域 · 房型
    var facts = [];
    if (p.caseStyle && MB.caseStyle && MB.caseStyle(p.caseStyle)) facts.push(MB.caseStyle(p.caseStyle).zh);
    if ((p.property.area || '').trim()) facts.push(p.property.area.trim());
    if ((p.property.type || '').trim()) facts.push(p.property.type.trim());
    hint.textContent = list.length
      ? '按这份方案（' + (facts.length ? facts.join(' · ') + '、' : '') + '空间、要做的柜子、家庭）挑的。「为什么」只写真的对得上的 —— 放进去之前看一眼照片。'
      : '公司案例库里还没有跟这份方案对得上的照片（先贴需求卡、加空间，或到图库按风格找）。';
    $('#match-list').innerHTML = list.map(function (x) {
      var im = S.resolve(x.ref);
      if (!im) return '';
      var room = x.use !== 'cases' ? p.rooms.filter(function (r) { return r.uid === x.use; })[0] : null;
      var done = matchDone[x.ref];
      var rname = room ? MB.t(MB.roomTitle(p, room), 'zh') : '';
      return '<div class="match-row" data-ref="' + esc(x.ref) + '" data-why-zh="' + esc(x.why.zh) + '" data-why-en="' + esc(x.why.en) + '">' +
        '<div class="thumb">' + thumbImg(im) + '</div>' +
        '<div class="match-txt"><p class="match-why">' + esc(x.why.zh) + '</p><p class="match-en">' + esc(x.why.en) + '</p>' +
          '<span class="case-cap">' + esc(capOf(im)) + '</span>' +
          '<div class="btn-row">' +
            (done ? '<span class="match-done">✓ 已放进' + esc(done.where) + '</span>'
              : (room ? '<button class="mini" type="button" data-match-room="' + esc(room.uid) + '">放进' + esc(rname) + '</button>' : '') +
                '<button class="mini" type="button" data-match-case>放进参考空间</button>') +
          '</div></div></div>';
    }).join('');
    // 缩图：这几个项目的缩图包
    if (MB.cloud) {
      var pids = [];
      list.forEach(function (x) { var c = S.resolve(x.ref); if (c && c.pid && !c.thumb && pids.indexOf(c.pid) < 0) pids.push(c.pid); });
      if (pids.length) MB.cloud.thumbs(pids);
    }
    matchList = list;
  }
  var matchList = [];
  function draftNote(item, L) {
    var f = (item.facts || []).slice(0, 2);
    if (!f.length) return item.why[L] || '';
    var s = f.map(function (x) { return x[L]; }).filter(Boolean).join(' · ');
    return L === 'en' ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }
  /** 帮我挑那一行的小字：照片的标签 + 哪一个家（「原木 · 橱柜 · 厨房 · Setia Alam · #2」，重复的字只留一次） */
  function capOf(im) {
    var parts = [];
    String(im.label || '').split(' · ').concat(String((MB.cloud && MB.cloud.projectLabel(im.pid)) || '').split(' · ')).forEach(function (x) {
      if (x && parts.indexOf(x) < 0) parts.push(x);
    });
    return parts.join(' · ');
  }
  $('#match-list').addEventListener('click', function (e) {
    var row = e.target.closest('.match-row'); if (!row) return;
    var ref = row.getAttribute('data-ref'), p = S.project;
    var item = matchList.filter(function (x) { return x.ref === ref; })[0];
    if (!item) return;
    var key = MB.shotKey || function (r) { return r; };
    var b = e.target.closest('[data-match-room]');
    if (b) {
      var r = p.rooms.filter(function (x) { return x.uid === b.getAttribute('data-match-room'); })[0];
      if (!r) return;
      // 当这一页的主图；原来的图只留同一个系列的当辅图（不混风格）
      var im = S.resolve(ref) || {};
      var rest = r.images.filter(function (x) {
        var o = S.resolve(x);
        return o && key(x) !== key(ref) && (!im.series || o.series === im.series || (x.indexOf('u:') === 0 && !o.series));
      });
      r.images = [ref].concat(rest).slice(0, 3);
      r.manual = true;
      matchDone[ref] = { where: MB.t(MB.roomTitle(p, r), 'zh'), item: item };
      renderMatch(); changed({ now: true });
      ping('已放进「' + matchDone[ref].where + '」当主图');
      return;
    }
    if (e.target.closest('[data-match-case]')) {
      if (p.cases.some(function (c) { return c && key(c.ref) === key(ref); })) { ping('参考空间里已经有这一张'); return; }
      // 参考空间放 3 个不同的家：同一个家的两张，那一句会印两次
      var home = (S.resolve(ref) || {}).pid;
      if (home && p.cases.some(function (c) { var o = c && S.resolve(c.ref); return o && o.pid === home; })) { ping('参考空间已经有这个家的照片了 —— 换另一个家的', 3000); return; }
      if (p.cases.length >= CASE_MAX) { ping('参考空间最多 ' + CASE_MAX + ' 个 —— 先在「② 空间 → 参考空间」拿掉一个', 3000); return; }
      // 「为什么」变成这一张的说明草稿（销售在参考空间可以改）：只取前两项（一句 ≤ 20 字 / 12 words）；
      // 双语方案不存单一语言的句子（null = 印的时候华文、英文各自写）
      p.cases.push({ ref: ref, note: p.lang === 'bi' ? null : draftNote(item, p.lang === 'en' ? 'en' : 'zh') });
      matchDone[ref] = { where: '参考空间', item: item };
      if (yieldToHandPicked(p).length && S.tab === 'rooms') renderRooms();
      if (S.tab === 'rooms') renderCases();
      renderMatch(); changed({ now: true });
      ping('已放进参考空间 —— 那一句可以在「② 空间 → 参考空间」改');
    }
  });

  /** 贴完需求卡：有公司案例就在 ① 提示「帮我挑」 */
  function renderBriefMatch(justApplied) {
    var box = $('#brief-match'); if (!box) return;
    var n = 0;
    if (hasCases() && S.project && (S.project.brief || justApplied)) {
      try { n = MB.matchCases(S.project, S.resolve).length; } catch (e) { n = 0; }
    }
    box.hidden = !n;
    if (n) $('#brief-match-n').textContent = n;
  }
  $('#brief-match').addEventListener('click', function (e) { if (e.target.closest('[data-open-match]')) openMatch(); });

  /* 备份 */
  function stamp() { var d = new Date(); return d.getFullYear() + MB.pad2(d.getMonth() + 1) + MB.pad2(d.getDate()); }
  $('#lib-export').addEventListener('click', function () {
    download('visi-library-' + stamp() + '.json', JSON.stringify({ type: 'visi-library', v: 1, images: S.userImages }));
  });
  $('#proj-export').addEventListener('click', function () {
    var p = S.project, used = {};
    p.rooms.forEach(function (r) { r.images.forEach(function (ref) { used[ref] = 1; }); });
    Object.keys(p.images).forEach(function (k) { if (p.images[k]) used[p.images[k]] = 1; });
    (p.cases || []).forEach(function (c) { used[c.ref] = 1; });
    var imgs = S.userImages.filter(function (u) { return used['u:' + u.id]; });
    var name = (p.client.names || 'client').replace(/[^\w一-龥]+/g, '-');
    download('visi-' + name + '-' + stamp() + '.json', JSON.stringify({ type: 'visi-project', v: 1, project: p, images: imgs }));
  });
  function importJson(input, kind) {
    input.addEventListener('change', function () {
      var f = input.files && input.files[0]; input.value = '';
      if (!f) return;
      readFileText(f).then(function (txt) {
        var data = JSON.parse(txt);
        if (!data || data.type !== 'visi-' + kind) throw new Error('不是' + (kind === 'library' ? '图库' : '方案') + '备份文件');
        // 同 id 的图本机已经有了就不动（不悄悄覆盖同事那边改过的版本）
        var known = {};
        S.userImages.forEach(function (u) { known[u.id] = 1; });
        var imgs = (Array.isArray(data.images) ? data.images : []).map(MB.normalizeImage)
          .filter(function (u) { return u && !known[u.id]; });
        var p = null;
        if (kind === 'project') {
          if (!data.project || !Array.isArray(data.project.rooms)) throw new Error('方案内容不完整');
          p = MB.normalizeProject(data.project, { newId: true });
          p.ts = Date.now();
        }
        return storeImgs(imgs).then(function () {
          S.userImages = imgs.concat(S.userImages);
          rebuildResolver();
          if (p) {
            S.projects.push(p);
            return storePut(p).then(function () {
              openProject(p); ping('已导入方案');
              // 同事的方案用了这台电脑清单里还没有的案例照片（可能是刚上传的）：马上问一次，不要先当成「已经被删除」
              if (MB.cloud && MB.caseRefsIn && MB.cloud.status().status === 'ok' &&
                  MB.caseRefsIn(p).some(function (ref) { return !MB.caseOf(ref); })) MB.cloud.refresh(true);
            });
          }
          renderLibrary(); ping('已导入 ' + imgs.length + ' 张图');
        });
      }).catch(function (err) { ping('导入失败：' + (err && err.message || err), 3200); });
    });
  }
  importJson($('#lib-import'), 'library');
  importJson($('#proj-import'), 'project');

  /* ============================================================
     选图弹窗
     ============================================================ */
  function openPicker(opts) {
    // f：跟图库同一套筛选（来源 × 空间 × 公司案例的风格 · 柜类 · 项目 · 页）
    // keep：这台电脑看不到的公司案例照片（同事放的、还没登入）—— 选不到也看不到，按「确定」时照样留着
    S.picker = { mode: opts.mode, uid: opts.uid, slot: opts.slot, sel: [], keep: [], paused: [],
      f: { src: opts.src || 'all', room: opts.filter || 'all', style: '', cab: '', pid: '', page: 0 } };
    var p = S.project;
    // keep：这台电脑看不到的（同事放的）—— 选不到也看不到，按「确定」时照样留着（也算进张数上限）。
    // paused：案例库暂停中打不开的 —— 照样算「已选」、留在原来的位置（主图还是主图），
    //   放在选图弹窗最上面一排，销售点一下就能拿掉、换成内置 / 自己的照片（体检就是这样叫他做的）。
    // 被删掉的按「确定」就拿掉
    var keepNote = function (refs) {
      var n = unseenCases(refs).length, b = pausedCases(refs).length, d = deadCases(refs).length;
      return (n ? ' · 另有 ' + n + ' 张公司案例照片这台电脑看不到，会留着（' + (casesLocal() ? '汇入那个项目的文件夹就看得到' : '登入公司案例库就看得到') + '）' : '') +
        (b ? ' · 另有 ' + b + ' 张公司案例照片暂时打不开（案例库暂停中），会留着' : '') +
        (d ? ' · 另有 ' + d + ' 张案例照片' + (casesLocal() ? '这台电脑没有' : '已经被删除') + '，按「加入所选」就拿掉' : '');
    };
    var pickable = function (ref) { return !!S.resolve(ref) && (!goneOf(ref) || goneOf(ref) === 'blocked'); };
    if (opts.mode === 'room') {
      var r = p.rooms.filter(function (x) { return x.uid === opts.uid; })[0];
      S.picker.sel = r ? r.images.filter(pickable) : [];
      S.picker.keep = r ? unseenCases(r.images) : [];
      S.picker.paused = r ? pausedCases(r.images) : [];
      $('#pick-title').textContent = '选图 · ' + MB.t(MB.roomTitle(p, r), 'zh') + '（第一张 = 主图，最多 4 张）' + keepNote(r ? r.images : []);
      $('#pick-ok').hidden = false;
    } else if (opts.mode === 'cases') {
      var crefs = p.cases.map(function (c) { return c && c.ref; });
      S.picker.sel = crefs.filter(pickable);
      S.picker.keep = unseenCases(crefs);
      S.picker.paused = pausedCases(crefs);
      $('#pick-title').textContent = '选参考空间（最多 ' + CASE_MAX + ' 张，标「已用」的在别页出现过）' + keepNote(crefs);
      $('#pick-ok').hidden = false;
    } else {
      $('#pick-title').textContent = '选一张 · ' + (SLOTS.filter(function (s) { return s[0] === opts.slot; })[0] || ['', ''])[1] + '（标「已用」的在别页出现过）';
      $('#pick-ok').hidden = true;
    }
    // retired：已经从图库拿掉的照片（MB.RETIRED_BUILTIN：不是溪岸的作品、手册没印出来的）—— 图库格子里没有，
    //   放在最上面一排（跟暂停中的那几张一样），销售点一下拿掉、再挑一张换上（体检就是这样叫他做的）
    S.picker.retired = MB.photoRetired ? S.picker.sel.filter(function (ref) { return MB.photoRetired(ref); }) : [];
    // 这份方案别页已经用了哪些图：选图时标出来，免得同一张出现两次
    S.picker.usedBy = usedBy(p, opts);
    localThumbs(S.picker.paused);
    renderPicker();
    renderBlocked();
    $('#pick-modal').classList.add('on');
  }
  /** ref（同一张照片的不同裁切算同一张）→ 用在哪一页（排除正在选的这个位置自己） */
  function usedBy(p, opts) {
    var out = {};
    if (typeof MB.deckImages !== 'function') return out;
    var key = MB.shotKey || function (r) { return r; };
    try {
      var plan = MB.deckImages(p, S.resolve);
      p.rooms.forEach(function (r) {
        if (opts.mode === 'room' && r.uid === opts.uid) return;
        (plan.rooms[r.uid] || []).forEach(function (ref) { out[key(ref)] = MB.t(MB.roomTitle(p, r), 'zh'); });
      });
      SLOTS.forEach(function (s) {
        if (opts.mode === 'slot' && s[0] === opts.slot) return;
        if (!pageOn(p, s[0])) return;
        var ref = plan.slot[s[0]];
        if (ref) out[key(ref)] = s[1];
      });
      if (opts.mode !== 'cases') (p.cases || []).forEach(function (c) { if (c && c.ref) out[key(c.ref)] = '案例'; });
    } catch (e) { console.error(e); }
    return out;
  }
  /** 选图格子下面那一行的「第几张」：参考空间里看不到的那几张排在最前面（按「确定」时） */
  function pickCap(pk, n) {
    if (pk.mode === 'cases') return '第 ' + (n + (pk.keep || []).length + 1) + ' 个';
    return n === 0 ? '★ 主图' : '第 ' + (n + 1) + ' 张';
  }
  /** 最上面一排（位置跟方案里一样，点一下拿掉 / 放回）：
      案例库暂停中打不开、但方案里本来就有的那几张；已经从图库拿掉、但方案里本来就有的那几张 */
  function renderPickHeld(pk) {
    var el = $('#pick-held');
    if (!el) return;
    var paused = (pk.paused || []).filter(function (ref) { return goneOf(ref) === 'blocked'; });
    var retired = pk.retired || [];
    el.hidden = !paused.length && !retired.length;
    if (el.hidden) { el.innerHTML = ''; return; }
    function cell(ref, kind) {
      var im = S.resolve(ref), n = pk.sel.indexOf(ref);
      var tag = kind === 'paused' ? '<span class="own">暂时打不开</span>' : n > -1 ? '<span class="own">' + pickCap(pk, n) + '</span>' : '';
      var cap = kind === 'paused' ? (n > -1 ? pickCap(pk, n) : '已拿掉') : (n > -1 ? '已从图库拿掉' : '已拿掉');
      return '<button type="button" class="lib-item ' + (kind === 'paused' ? 'case held' : 'held retired') + (n > -1 ? ' sel' : '') + '" data-ref="' + esc(ref) + '" title="' + (n > -1 ? '点一下拿掉' : '点一下放回') + '">' +
        thumbImg(im) + tag + '<span class="cap">' + cap + '</span></button>';
    }
    el.innerHTML = (paused.length ? '<p class="hint">这几张公司案例照片暂时打不开（案例库暂停中），方案页上是空白的占位框。' +
      '点一下拿掉，再从下面挑内置照片或你自己的照片换上；不急就留着，案例库恢复后照片会回来。</p>' +
      '<div class="lib-grid">' + paused.map(function (ref) { return cell(ref, 'paused'); }).join('') + '</div>' : '') +
      (retired.length ? '<p class="hint">这几张已经从图库拿掉（不是溪岸的作品照片，或放错了系列）：点一下拿掉，再从下面挑一张换上。</p>' +
      '<div class="lib-grid">' + retired.map(function (ref) { return cell(ref, 'retired'); }).join('') + '</div>' : '');
  }
  /** 系列页 / 原创系列页预留的官方照片：图库、选图标「系列页专用 · 骨骼线」（不是就回 ''） */
  function reservedCap(im) {
    if (!im || !im.reserved) return '';
    var s = MB.SERIES_OF ? MB.SERIES_OF[im.reserved] : null;
    return '系列页专用' + (s ? ' · ' + s.zh : '');
  }
  function renderPicker() {
    var pk = S.picker, g = gallery(pk.f, libraryItems());
    var key = MB.shotKey || function (r) { return r; };
    $('#pick-filter').innerHTML = g.chips;
    $('#pick-cfilter').innerHTML = g.cfilter;
    $('#pick-cfilter').hidden = !g.cfilter;
    renderPickHeld(pk);
    $('#pick-grid').innerHTML = g.items.map(function (im) {
      var n = pk.sel.indexOf(im.ref), used = (pk.usedBy || {})[key(im.ref)];
      // 系列预留的官方照片：选不进来（pickTap 会说为什么）；手动空间里本来就有的（已选）照常可以拿掉
      var rcap = n < 0 ? reservedCap(im) : '';
      var btn = '<button type="button" class="lib-item' + (n > -1 ? ' sel' : '') + (rcap ? ' used reserved' : used && n < 0 ? ' used' : '') + (im.isCase ? ' case' : '') + '" data-ref="' + esc(im.ref) + '">' +
        (im.isCase ? caseImg(im) + '<span class="own">案例</span>' : '<img src="' + esc(im.src) + '" alt="" loading="lazy" />' + (im.own ? '<span class="own">我的</span>' : '')) +
        '<span class="cap">' + (n > -1 ? pickCap(pk, n) : rcap ? esc(rcap)
          : used ? '已用 · ' + esc(used) : esc(im.own ? tagName(im.rooms[0]) : im.label || '')) + '</span></button>';
      // 案例：格子旁边多一个「同项目」（不能放在按钮里面）
      return im.isCase ? '<div class="lib-cell">' + btn + sameProjBtn(im) + '</div>' : btn;
    }).join('') || '<p class="hint">这一类还没有图。到「图库」上传，或把旧 proposal PDF 拖进去。</p>';
    $('#pick-pager').innerHTML = g.pager;
    $('#pick-pager').hidden = !g.pager;
    needThumbs(g.items);
  }
  $('#pick-filter').addEventListener('click', function (e) { if (galleryClick(S.picker.f, e)) renderPicker(); });
  $('#pick-cfilter').addEventListener('change', function (e) { if (galleryChange(S.picker.f, e)) renderPicker(); });
  $('#pick-cfilter').addEventListener('click', function (e) { if (galleryClick(S.picker.f, e)) renderPicker(); });
  $('#pick-pager').addEventListener('click', function (e) { if (galleryClick(S.picker.f, e)) renderPicker(); });
  /** 满了：说为什么（暂停中的那几张也算在里面 —— 要换就先拿掉；看不到的那几张会留着，也算） */
  function pickFull(pk, max, base) {
    var paused = (pk.paused || []).filter(function (ref) { return pk.sel.indexOf(ref) > -1; }).length, unseen = (pk.keep || []).length;
    ping(paused ? '最多 ' + max + ' 张 —— 要换掉暂时打不开的案例照片：先在最上面点一下把它拿掉' :
      unseen ? '最多 ' + max + ' 张（另有 ' + unseen + ' 张这台电脑看不到的公司案例照片会留着，也算在里面）' : base, 3600);
  }
  function pickTap(ref) {
    var pk = S.picker;
    // 系列页 / 原创系列页预留的官方照片（含同一张的裁切）：每一份方案都固定印在那几页，别页不能再放 ——
    // 手动空间里本来就有的（已选）可以拿掉
    var rk = MB.photoReserved ? MB.photoReserved(ref) : '';
    if (rk && (pk.mode === 'slot' || pk.sel.indexOf(ref) < 0)) {
      ping('这张是「' + ((MB.SERIES_OF && MB.SERIES_OF[rk]) || { zh: rk }).zh + '」的官方照片，只放在原创系列和系列页', 2800);
      return;
    }
    if (pk.mode === 'slot') {
      S.project.images[pk.slot] = ref;
      yieldToHandPicked(S.project);
      closeModals(); renderVisit(); changed({ now: true });
      return;
    }
    var i = pk.sel.indexOf(ref), n = pk.sel.length + (pk.keep || []).length;
    var key = MB.shotKey || function (r) { return r; };
    if (i > -1) pk.sel.splice(i, 1);
    else if (pk.mode === 'cases' && n >= CASE_MAX) { pickFull(pk, CASE_MAX, '最多 ' + CASE_MAX + ' 个 —— 挑最能说明风格的'); return; }
    else if (pk.mode === 'cases' && pk.sel.some(function (x) { return key(x) === key(ref); })) { ping('这是已选那张的另一种裁切 —— 同一张照片只放一次'); return; }
    else if (n >= 4) { pickFull(pk, 4, '一页最多 4 张 —— 3 张最好'); return; }
    else pk.sel.push(ref);
    renderPicker();
  }
  $('#pick-grid').addEventListener('click', function (e) {
    if (e.target.closest('[data-same-proj]')) { if (galleryClick(S.picker.f, e)) renderPicker(); return; }
    var b = e.target.closest('[data-ref]'); if (!b) return;
    pickTap(b.getAttribute('data-ref'));
  });
  $('#pick-held').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ref]'); if (b) pickTap(b.getAttribute('data-ref'));
  });
  $('#pick-ok').addEventListener('click', function () {
    var pk = S.picker;
    if (pk.mode === 'cases') {
      // 已经写过那一句的案例，重新选过还留着那句
      var notes = {};
      S.project.cases.forEach(function (c) { notes[c.ref] = c.note; });
      // 看不到的那几张排前面、一定留着（同事挑的，登入后就看得到）；张数上限已经算了它们（pickTap），新挑的不会被挤掉。
      // 暂停中打不开的那几张就在 sel 里（原来的位置）：销售拿掉的才拿掉
      S.project.cases = (pk.keep || []).concat(pk.sel).slice(0, CASE_MAX).map(function (ref) { return { ref: ref, note: notes[ref] != null ? notes[ref] : null }; });
      if (yieldToHandPicked(S.project).length) renderRooms();
      closeModals(); renderCases(); changed({ now: true });
      return;
    }
    var r = S.project.rooms.filter(function (x) { return x.uid === pk.uid; })[0];
    if (r) { r.images = pk.sel.concat((pk.keep || []).filter(function (ref) { return pk.sel.indexOf(ref) < 0; })); r.manual = true; }
    closeModals(); renderRooms(); changed({ now: true });
  });

  function closeModals() { $$('.mb-modal').forEach(function (m) { m.classList.remove('on'); }); }
  /** 收图审核里有几十张图：点到背景、按 Esc 都不能整批丢掉 —— 只有「取消」（问过）才放弃 */
  function importOpen() { return $('#import-modal').classList.contains('on') && S.importBatch.length; }
  function dropImport() {
    var n = S.importBatch.length;
    if (n && !confirm('放弃这 ' + n + ' 张图？')) return;
    S.importBatch = [];
    closeModals();
  }
  $$('.mb-modal').forEach(function (m) {
    m.addEventListener('click', function (e) {
      var isClose = e.target.hasAttribute('data-close');
      if (e.target !== m && !isClose) return;
      if (m.id === 'import-modal' && importOpen()) { if (isClose) dropImport(); return; }
      closeModals();
    });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !importOpen()) closeModals(); });

  /* 拖放 + 点选 */
  function dropZone(zoneSel, inputSel, onFiles) {
    var z = $(zoneSel), input = $(inputSel);
    z.addEventListener('click', function (e) { if (e.target !== input) input.click(); });
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      input.value = '';
      if (files.length) onFiles(files);
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.remove('over'); });
    });
    z.addEventListener('drop', function (e) {
      var files = Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.files) || []);
      if (files.length) onFiles(files);
    });
  }

  /* ============================================================
     预览 + 体检
     ============================================================ */
  function qrSvg(text) {
    try {
      var qr = qrcode(0, 'M'); qr.addData(text); qr.make();
      return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) { return ''; }
  }

  /** 方案页（预览 / PDF）和 PPTX 用同一份资料 —— 两边才不会对不上 */
  function deckCtx() {
    var p = S.project, url = MB.inviteLink(p).url;
    return {
      resolve: S.resolve,
      qrSvg: p.pages.invite ? qrSvg(url) : '',
      cases: window.SAIL_CASES || [],
      venue: CFG.venue || {},
      planSrc: planSrc(),
      inviteUrl: url,
      maps: CFG.maps, waze: CFG.waze
    };
  }

  function renderPreview() {
    var p = S.project;
    var deck = $('#deck');
    deck.className = 'deck lang-' + p.lang;
    // 方案页画不出来（例：旧存档少了某个栏位）也不能拖垮左边的编辑区
    try { deck.innerHTML = MB.renderDeck(p, deckCtx()); }
    catch (e) { console.error(e); deck.innerHTML = '<p class="hint" style="padding:24px">预览暂时画不出来：' + esc(e && e.message || e) + '</p>'; }
    // 封面名字的字号由 deck.js 按长度定（sz1–sz4），这里不用再管
    var pages = MB.pageList(p, S.resolve).length;
    $('#pv-meta').textContent = pages + ' 页 · 16:9';
    $('#btn-pptx').hidden = typeof MB.exportPptx !== 'function';   // pptx.js 载入了才出现
    $$('#deck-lang button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === p.lang); });
    fitDeck();
    fitText();
    renderCheck();
    syncLetterDraft();
    // 字体晚到会改变行高：到了再量一次
    if (document.fonts && document.fonts.status !== 'loaded') {
      document.fonts.ready.then(function () { if (S.project === p) { fitText(); renderCheck(); } });
    }
  }

  /* 字太多放不下的页：先缩一号（tight）、再缩一号（tighter）；还放不下就记下来，体检提醒。
     打印时被裁掉的字不会有任何提示 —— 客户只会看到半句话 */
  function fitText() {
    var over = { needs: false, plan: false, letter: false, collections: false, series: false, seriesKeys: [], practical: false, cases: false, invite: false, rooms: [] };
    function tooTall(el) { return el.scrollHeight > el.clientHeight + 2; }
    $$('#deck .pg').forEach(function (pg) {
      // .iv-flow：邀约页右栏（三样 + 时段 + 联络）—— 销售把「准备的三样」写长了会放不下
      // .sr-col：每个系列那一页的右栏；.co-list：原创系列那一页的五栏（官方文案不删句子；字体没到时才可能放不下）
      var box = $('.nd-list', pg) || $('.pl-side', pg) || $('.rm-txt', pg) || $('.lt-body', pg) || $('.pr-body', pg) || $('.cs-list', pg) || $('.iv-flow', pg) || $('.sr-col', pg) || $('.co-list', pg);
      if (!box) return;
      // 参考空间页（.cs-list）：每张卡片那一行不自己裁切，太长会伸出清单底部 —— 这里（和 pptx.js）量得到
      pg.classList.remove('tight', 'tighter');
      if (!box.clientHeight || !tooTall(box)) return;   // 预览没显示（手机收起）时量不到，不误报
      pg.classList.add('tight');
      if (!tooTall(box)) return;
      pg.classList.add('tighter');
      if (!tooTall(box)) return;
      var g = pg.getAttribute('data-goto') || '';
      if (g.indexOf('room:') === 0) over.rooms.push(g.slice(5));
      else if (g.indexOf('series:') === 0) { over.series = true; if (over.seriesKeys.indexOf(g.slice(7)) < 0) over.seriesKeys.push(g.slice(7)); }
      else if (typeof over[g] === 'boolean') over[g] = true;   // needs / plan / letter / collections / practical / cases / invite
    });
    S.overflow = over;
  }

  function fitDeck() {
    var w = $('#preview').clientWidth - 36;
    var s = Math.max(0.25, Math.min(1, w / 1280));   // 16:9 页面 1280 × 720
    $('#deck').style.setProperty('--s', s.toFixed(4));
  }
  if (window.ResizeObserver) new ResizeObserver(fitDeck).observe($('#preview'));
  else window.addEventListener('resize', fitDeck);

  /* 预览页 / 体检项目 → 哪个编辑区（有些还要卷到那一块）。
     体检的 goto 可能是分页名，也可能是页面 type（check.js 新规则用） */
  var GOTO = {
    brief: ['brief'], rooms: ['rooms'], plan: ['plan'], visit: ['visit'], copy: ['copy'], library: ['library'],
    style: ['brief', '#case-style-panel'], caseStyle: ['brief', '#case-style-panel'],
    cover: ['brief'], letter: ['brief', '#letter-panel'], needs: ['brief', '#needs-panel'],
    collections: ['visit', '#pages-panel'], glance: ['visit', '#pages-panel'], series: ['visit', '#pages-panel'],
    chapter: ['visit', '#pages-panel'], cases: ['rooms', '#cases-panel'], practical: ['visit', '#practical-panel'],
    language: ['visit', '#pages-panel'], team: ['visit', '#team-panel'], invite: ['visit'], back: ['visit'],
    // 体检：到馆准备的那几样；每一页用哪张图（④ 页面开关下面的缩图）
    prep: ['visit', '#prep-edit'], slots: ['visit', '#slot-thumbs']
  };
  /** 每个系列那一页是 series:<k>（MB.pageKey）：跟「系列」同一个地方（④ 页面开关） */
  function gotoOf(g) {
    if (g && g.indexOf('series:') === 0) g = 'series';
    return GOTO.hasOwnProperty(g) ? GOTO[g] : null;
  }
  function tabOf(g) { return !g ? null : g.indexOf('room:') === 0 ? 'rooms' : (gotoOf(g) || [])[0] || null; }
  function goTo(g) {
    g = g || '';
    if (g.indexOf('room:') === 0) { showTab('rooms'); flashRoom(g.slice(5)); return; }
    var t = gotoOf(g) || ['brief'];
    showTab(t[0]);
    if (t[1]) flash($(t[1]));
  }

  function renderCheck() {
    var r = MB.checkProject(S.project, S.resolve, S.overflow);
    var btn = $('#score');
    btn.className = 'score' + (r.bad ? ' bad' : r.items.some(function (x) { return x.level === 'warn'; }) ? ' warn' : '');
    $('span', btn).textContent = '体检 ' + r.score + '/' + r.total + (r.bad ? ' · ' + r.bad + ' 项要改' : '');
    $('#pv-check').innerHTML = '<h4>发出去之前 · 体检</h4><ul>' + r.items.map(function (it) {
      return '<li class="' + it.level + '"><i></i><div>' + esc(it.text) +
        (it.goto ? '<a data-goto-tab="' + esc(it.goto) + '">去改</a>' : '') +
        (it.why ? '<small>' + esc(it.why) + '</small>' : '') + '</div></li>';
    }).join('') + '</ul>';
    var badTabs = {};
    r.items.forEach(function (it) { if (it.level === 'bad' && tabOf(it.goto)) badTabs[tabOf(it.goto)] = 1; });
    $$('#tabs button').forEach(function (b) {
      var dot = $('.dot', b);
      if (badTabs[b.getAttribute('data-tab')] && !dot) b.insertAdjacentHTML('beforeend', '<span class="dot"></span>');
      if (!badTabs[b.getAttribute('data-tab')] && dot) dot.remove();
    });
  }

  $('#score').addEventListener('click', function () { $('#pv-check').classList.toggle('on'); });
  $('#pv-check').addEventListener('click', function (e) {
    var a = e.target.closest('[data-goto-tab]'); if (!a) return;
    goTo(a.getAttribute('data-goto-tab'));
  });

  /* 点预览页 → 跳到对应的编辑区 */
  $('#deck').addEventListener('click', function (e) {
    var pg = e.target.closest('[data-goto]'); if (!pg) return;
    goTo(pg.getAttribute('data-goto'));
  });

  $('#deck-lang').addEventListener('click', function (e) {
    var b = e.target.closest('[data-v]'); if (!b) return;
    S.project.lang = b.getAttribute('data-v');
    // 文案不看方案语言（⑤ 自己有中 / 英切换）—— 不重画，免得洗掉正在改的讯息
    if (S.tab !== 'copy') renderPane(S.tab);
    changed({ now: true });
  });

  /** 体检还有「一定要改」的：导出前问一声 */
  function okToExport() {
    var r = MB.checkProject(S.project, S.resolve, S.overflow);
    if (r.bad && !confirm('体检还有 ' + r.bad + ' 项「一定要改」。仍然导出？')) {
      $('#pv-check').classList.add('on'); return false;
    }
    return true;
  }

  /* 导出 PDF：等图片与字体都到位再叫打印；档名用客户名 */
  $('#btn-print').addEventListener('click', function () {
    if (!okToExport()) return;
    clearTimeout(renderTimer); renderPreview();
    var imgs = $$('#deck img');
    var waits = imgs.map(function (im) {
      return im.complete ? Promise.resolve() : new Promise(function (res) { im.onload = im.onerror = res; });
    });
    if (document.fonts && document.fonts.ready) waits.push(document.fonts.ready);
    ping('准备打印… 目的地选「另存为 PDF」', 3000);
    Promise.all(waits).then(function () {
      var old = document.title;
      document.title = MB.fileTitle(S.project);
      setTimeout(function () {
        window.print();
        setTimeout(function () { document.title = old; }, 400);
      }, 120);
    });
  });

  /* 导出 PPTX（pptx.js 提供 MB.exportPptx）：跟预览同一份 ctx，页面座标一样，每页附讲稿 */
  $('#btn-pptx').addEventListener('click', function () {
    if (typeof MB.exportPptx !== 'function' || !okToExport()) return;
    var btn = $('#btn-pptx');
    clearTimeout(renderTimer); renderPreview();
    btn.disabled = true;
    ping('正在做 PPTX…', 8000);
    Promise.resolve().then(function () { return MB.exportPptx(S.project, deckCtx()); })
      .then(function (out) {
        // 公司案例的照片放在另一个网址（Blob）：那边不让浏览器读（没有 CORS）就放不进 PPTX —— 照实说几张
        var miss = out && out.missing || 0;
        if (miss) ping('PPTX 已导出，但有 ' + miss + ' 张公司案例照片放不进去（图库网址不让浏览器读取）。' +
          'PPT 里那几格是空的 —— 改用「导出 PDF」，或请管理员开放图库的跨站读取。', 8000);
        else ping('PPTX 已导出');
      }, function (err) { console.error(err); ping('PPTX 导出失败：' + (err && err.message || err), 3600); })
      .then(function () { btn.disabled = false; });
  });

  /* ============================================================
     方案切换
     ============================================================ */
  $('#proj-select').addEventListener('change', function (e) {
    var p = S.projects.filter(function (x) { return x.id === e.target.value; })[0];
    if (p) openProject(p);
  });
  $('#proj-new').addEventListener('click', function () {
    var p = MB.newProject(loadProfile());
    S.projects.push(p);
    storePut(p);
    openProject(p);
    showTab('brief');
    ping('新方案 —— 先贴需求卡');
  });
  $('#proj-dup').addEventListener('click', function () {
    var p = MB.clone(S.project);
    p.id = MB.uid('p-'); p.ts = Date.now();
    p.label = '副本';
    delete p.demo;   // 复制出来的是要改的那份；贴别人的需求卡时会先问一声
    p.date = MB.newProject({}).date;
    S.projects.push(p);
    storePut(p);
    openProject(p);
    ping('已复制一份');
  });
  $('#proj-del').addEventListener('click', function () {
    var p = S.project;
    if (!confirm('删除「' + (p.client.names || '未命名客户') + '」这份方案？删除后不能恢复。')) return;
    if (pendingSave === p) { pendingSave = null; clearTimeout(saveTimer); }
    (S.noStore ? Promise.resolve() : MB.store.removeProject(p.id).catch(function () {})).then(function () {
      S.projects = S.projects.filter(function (x) { return x.id !== p.id; });
      var next = S.projects.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); })[0];
      if (!next) { next = MB.newProject(loadProfile()); S.projects.push(next); storePut(next); }
      openProject(next);
    });
  });

  $('#tabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]'); if (b) showTab(b.getAttribute('data-tab'));
  });

  // 关掉分页前把排队中的存档写掉
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushSave(); });

  /* ============================================================
     启动
     ============================================================ */
  S.copyLang = lsGet(COPYLANG_KEY) === 'en' ? 'en' : 'zh';
  /* 公司案例库：先读这台电脑存着的清单（不发请求）—— 方案里的 c: 照片在第一次排版前就解析得到；
     之后背景问伺服器有没有新的（这台电脑没登入过就不问），到了再重画 */
  var cloudCached = MB.cloud ? MB.cloud.loadCached().catch(function () { return 0; }) : Promise.resolve(0);
  function startCloud() {
    if (!MB.cloud) return;
    MB.cloud.onChange(function (what) {
      if (what === 'cases') casesChanged();
      else if (what === 'thumbs') {
        if (!typing()) galleryRedraw();
        if ($('#match-modal').classList.contains('on')) renderMatch();
        if (S.tab === 'rooms' && !typing()) { renderRooms(); renderCases(); }
      }
      else if (what === 'status') { if (!typing()) renderCloudBox(); if (S.tab === 'rooms' && !typing()) renderCases(); }
    });
    MB.cloud.refresh();
    setInterval(function () { MB.cloud.refresh(); }, MB.cloud.EVERY);
  }
  Promise.all([MB.store.listImages(), MB.store.listProjects(), cloudCached]).then(function (res) {
    S.userImages = res[0].map(MB.normalizeImage).filter(Boolean);
    rebuildResolver();
    // 旧存档还带着旧版的字段（风格方向、配色、参考图取色、一页看懂…）：normalizeProject 已经丢掉了，
    // 把干净的那一份写回去一次（storePut：ts 不变，列表顺序不跳）
    S.projects = res[1].map(function (raw) {
      var n = MB.normalizeProject(raw);
      if (MB.hasLegacy && MB.hasLegacy(raw)) storePut(n);
      return n;
    });
    var active = lsGet(ACTIVE_KEY);
    var first = S.projects.filter(function (x) { return x.id === active; })[0] || S.projects[0];
    if (!first) {
      first = demoProject();
      storePut(first);
      S.projects.push(first);
      setTimeout(function () { ping('这是一份示范方案。按「＋ 新方案」开始做你的客户', 4200); }, 600);
    }
    // 万一某一份方案打不开，换下一份 —— 不要整个页面陪葬
    var order = [first].concat(S.projects.filter(function (x) { return x !== first; }));
    var opened = false;
    for (var i = 0; i < order.length && !opened; i++) {
      try { openProject(order[i]); showTab('brief'); opened = true; } catch (e) { console.error(e); }
    }
    if (!opened) {
      var fresh = MB.newProject(loadProfile());
      S.projects.push(fresh); openProject(fresh); showTab('brief');
    }
    startCloud();
  }, function (err) {
    // 无痕模式 / 存储被关：照样能用，只是不存档
    console.error(err);
    S.noStore = true;
    S.userImages = []; rebuildResolver();
    var p = demoProject();
    S.projects = [p];
    openProject(p);
    showTab('brief');
    ping('这个浏览器不能存档（无痕模式？）—— 可以做，但关掉就没了', 5000);
    startCloud();
  });
})();
