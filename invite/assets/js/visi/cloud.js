/* ============================================================
   VISI · 公司案例库（云端）
   ------------------------------------------------------------
   业务用「名字 + 团队密码」登入一次（/api/session，cookie 只给 /api），
   之后 VISI 会去拿案例清单（/api/catalog?view=visi：伺服器已经拿掉项目名、档名）。
   - 清单 + 缩图包存在这台电脑的 IndexedDB「sail-visi-cases」：离线、API 出错时，
     旧方案里的 c: 照片照样解析得到（只是图要有网路才载得出来）
   - 最多 10 分钟问一次有没有更新（If-None-Match "rev-N"，没变就 304）；业务按「更新」随时问
   - 这台电脑没登入过：一个请求都不发 —— 静态网站（没有 /api）、还没登入的同事打开 VISI 跟以前一模一样
   - 登出（重新整理后也一样）/ 登入过期：存着的清单只拿来解析方案里已经放的照片（entries 带 stale），
     不再自动挑、帮我挑也不用 —— 之后被隐藏的照片（拍到客户…）这台电脑看不出来；登出后也不再问伺服器
   - entries() 只给白名单栏位 + 自动产生的说明（「原木 · 橱柜 · 厨房」）。
     项目名（文件夹名，含客户名字）、档案路径 f 从来不进来：就算伺服器给了，这里也不收
   - 案例库被 Vercel 暂停（免费额度用完：API 回 503 storage_blocked / 507 quota）→ status 'blocked'：
     照片网址这时都回 403，所以 entries 的 src 清空、带 blocked —— 方案里已经放的照样解析得到（方案打得开），
     但印成占位框、不进图库、不自动挑（model.js 的 usable / caseGone）。之后问到伺服器正常了就恢复。
     API 问不到（离线、登入过期、登出）时，最多一天一次用一张案例照片试一下（HEAD）：回 403 才算暂停中
     （网路一时不通、没有 CORS 看不出来的，一律不算）；暂停中改成最多一小时试一次，恢复了马上知道。
     暂停中会记在 IndexedDB：重新整理后第一次排版就不会出现破图
   - 一张案例照片载不出来（app.js 抓到 <img> 的 error → photoFailed）：这台电脑的清单可能是旧的（刚被删掉）、
     或案例库刚被暂停（10 分钟一次的更新还没问到）—— 马上问一次伺服器（最多一分钟一次）；伺服器问不到、
     或还是说清单里有，就 HEAD 那一张：404 = 档案已经不在了（当成已删除）、403 = 暂停中（伺服器问不到时才算）
   对外：MB.cloud.{ loadCached, refresh, me, login, logout, thumbs, thumb, entries, projects, status, onChange, proxySrc, photoFailed }
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};
  var DB_NAME = 'sail-visi-cases';
  var FLAG = 'sail-visi-cases';            // localStorage：这台电脑登入过（开机才去问伺服器）
  var USER = 'sail-visi-cases-user';       // 上次登入的名字（只用来预填、显示）
  var PROBE = 'sail-visi-cases-probe';     // localStorage：上次用一张案例照片试案例库开不开 { at, r }
  var EVERY = 10 * 60 * 1000;
  var HOUR = 3600 * 1000, DAY = 24 * HOUR;
  var API = 'api/';
  var HEX16 = /^[0-9a-f]{16}$/;
  var PID = /^p[0-9a-f]{10}$/;
  var PHOTO_K = /^c\/[A-Za-z0-9._-]+\.jpg$/;
  var PACK_K = /^t\/[A-Za-z0-9._-]+\.json$/;
  var THUMB_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;

  // stale：存着的清单可能过时了（登入过期、登出）· loggedOut：自己按了登出（重新整理也记得）
  // blocked：案例库暂停中 —— 'api'（伺服器说的）· 'probe'（试了一张照片回 403）· ''（没有）
  var state = { status: 'idle', user: lsGet(USER) || '', rev: 0, checked: 0, count: 0, error: '', stale: false, loggedOut: false,
    blocked: '', blockedAt: 0 };
  var IDX = null;          // 白名单过的清单
  var ENTRIES = [];
  var THUMBS = {};         // h16 → dataURL（缩图包，320px）
  var PACKS = {};          // 缩图包 pathname → 'ok' | 'fail' | Promise
  var subs = [];
  var inflight = null, retry = null, probing = null;
  var fresh = false;       // IDX 刚换过：下一次 sync() 要重建 entries
  var MISSING = {};        // h16 → 1：照片档已经不在了（HEAD 回 404）—— 这次开着当成已删除（不存，重新整理再确认一次）
  var FAILQ = {}, HEADED = {}, failJob = null, failAt = 0;   // photoFailed：排队、每张只试一次、问伺服器的时间
  var pub = null;          // 上次交给 model.js 的状态 { stale, trust, blocked }：变了才重发（重排一次方案）

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

  /* ---------- IndexedDB（打不开就当没有快取：无痕模式照样能用） ---------- */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, fail) {
      if (!window.indexedDB) { fail(new Error('no indexedDB')); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
        if (!d.objectStoreNames.contains('packs')) d.createObjectStore('packs', { keyPath: 'k' });
      };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { fail(req.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (ok, fail) {
        var t = d.transaction(store, mode);
        var r = fn(t.objectStore(store));
        t.oncomplete = function () { ok(r && 'result' in r ? r.result : undefined); };
        t.onerror = function () { fail(t.error); };
        t.onabort = function () { fail(t.error || new Error('aborted')); };
      });
    });
  }
  function idbGet(store, k) { return tx(store, 'readonly', function (os) { return os.get(k); }); }
  function idbPut(store, v) { return tx(store, 'readwrite', function (os) { os.put(v); }).catch(function () {}); }

  /* ---------- 白名单：伺服器给什么都只留这些（文件夹名、档名、操作纪录一律丢掉） ---------- */
  function str(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : ''; }
  function inList(list, k) { for (var i = 0; i < (list || []).length; i++) if ((list[i].key || list[i]) === k) return true; return false; }
  function oneOf(list, v) { return typeof v === 'string' && inList(list, v) ? v : ''; }
  function manyOf(list, arr) {
    var out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (v) { if (typeof v === 'string' && inList(list, v) && out.indexOf(v) < 0) out.push(v); });
    return out;
  }
  function num(v) { v = Math.round(+v); return isFinite(v) && v > 0 && v < 100000 ? v : 0; }
  function cleanBase(b) { return typeof b === 'string' && /^https?:\/\/[^\s"'<>\\]+\/$/.test(b) ? b : ''; }

  function sanitize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var out = { v: 1, rev: Math.max(0, Math.floor(+raw.rev) || 0), base: cleanBase(raw.base), projects: {}, photos: {} };
    var P = raw.projects && typeof raw.projects === 'object' ? raw.projects : {};
    var F = raw.photos && typeof raw.photos === 'object' ? raw.photos : {};
    Object.keys(P).forEach(function (pid) {
      if (!PID.test(pid) || !P[pid] || typeof P[pid] !== 'object') return;
      var x = P[pid];
      out.projects[pid] = {
        area: str(x.area, 60), ptype: oneOf(MB.CASE_PTYPES, x.ptype), traits: manyOf(MB.CASE_TRAITS, x.traits),
        style: oneOf(MB.CASE_STYLES, x.style), hidden: !!x.hidden,
        packs: (Array.isArray(x.packs) ? x.packs : []).filter(function (k) { return typeof k === 'string' && PACK_K.test(k) && k.length < 160; }).slice(0, 300)
      };
    });
    Object.keys(F).forEach(function (h) {
      var x = F[h];
      if (!HEX16.test(h) || !x || typeof x !== 'object' || !out.projects[x.p]) return;
      if (typeof x.k !== 'string' || !PHOTO_K.test(x.k) || x.k.indexOf('c/' + h) !== 0 || x.k.length > 120) return;
      var d = x.desc && typeof x.desc === 'object' ? x.desc : {};
      out.photos[h] = {
        p: x.p, k: x.k, w: num(x.w), h: num(x.h), shot: HEX16.test(x.shot || '') ? x.shot : h,
        room: oneOf(MB.CASE_ROOMS, x.room), cabinets: manyOf(MB.CASE_CABINETS, x.cabinets), style: oneOf(MB.CASE_STYLES, x.style),
        hero: x.hero === true, desc: { zh: str(d.zh, 200), en: str(d.en, 200) },
        status: oneOf(MB.CASE_STATUS, x.status) || 'new', hidden: !!x.hidden
      };
    });
    // 已经删掉的照片（只有 h16）：伺服器的 visi 版现在不给；有给就收，model.js 才能肯定地说「已经被删除」
    out.purged = (Array.isArray(raw.purged) ? raw.purged : []).filter(function (h) {
      return typeof h === 'string' && HEX16.test(h) && !out.photos[h];
    }).slice(0, 50000);
    return out;
  }

  /* ---------- 自动产生的说明：风格 · 柜类 · 空间（只用标签） ---------- */
  function vocab(list, k) { for (var i = 0; i < (list || []).length; i++) if (list[i].key === k) return list[i]; return null; }
  function labelOf(e, L) {
    var st = vocab(MB.CASE_STYLES, e.style), cab = vocab(MB.CASE_CABINETS, e.cabinets[0]), rm = MB.ROOM && MB.ROOM[e.rooms[0]];
    var parts = [st && st[L], cab && cab[L]];
    // 英文柜名已经带空间（Kitchen cabinets）：空间不再说一次
    if (rm && !(L === 'en' && cab && cab.en.toLowerCase().indexOf(rm.en.toLowerCase().split(' ')[0]) > -1)) parts.push(rm[L]);
    return parts.filter(Boolean).join(' · ') || (L === 'zh' ? '公司案例' : 'SAIL project');
  }

  /** 每个项目的显示名：「区域 · 风格 · #n」—— 绝不是文件夹名（里面有客户的名字） */
  var PLABEL = {};
  function projectLabels() {
    PLABEL = {};
    if (!IDX) return;
    Object.keys(IDX.projects).sort().forEach(function (pid, i) {
      var x = IDX.projects[pid], st = vocab(MB.CASE_STYLES, x.style);
      PLABEL[pid] = [x.area, st ? st.zh : ''].filter(Boolean).concat('#' + (i + 1)).join(' · ');
    });
  }

  function build() {
    ENTRIES = [];
    projectLabels();
    if (!IDX || !IDX.base) return;
    Object.keys(IDX.photos).forEach(function (h) {
      var x = IDX.photos[h], pr = IDX.projects[x.p];
      var style = x.style || pr.style || '';
      var st = vocab(MB.CASE_STYLES, style);
      var e = {
        // 暂停中：照片网址都回 403 —— 不给网址，方案页、PPTX、图库就不会出现破图（印成占位框）
        id: 'c:' + h, src: state.blocked ? '' : IDX.base + x.k, thumb: THUMBS[h] || '', w: x.w, h: x.h,
        style: style, series: st ? st.series : '', cabinets: x.cabinets.slice(), rooms: x.room ? [x.room] : [],
        pid: x.p, area: pr.area, ptype: pr.ptype, traits: pr.traits.slice(), shot: 'c:' + x.shot,
        hero: x.hero, status: x.status, hidden: !!(x.hidden || pr.hidden), desc: { zh: x.desc.zh, en: x.desc.en }
      };
      var zh = labelOf(e, 'zh'), en = labelOf(e, 'en');
      e.label = zh;
      // 华文 / 英文说明：分类时写的那一行（desc）优先，没有就用标签拼的
      e.zh = x.desc.zh || zh;
      e.en = x.desc.en || en;
      e.plabel = PLABEL[x.p] || '';
      if (state.blocked) e.blocked = true;
      // 档案已经不在了（清单是旧的）：跟清单里没有的一样当成已删除 —— 不给网址、不给缩图（印占位框，体检叫他换一张）
      if (MISSING[h]) { e.src = ''; e.thumb = ''; e.gone = 'deleted'; }
      ENTRIES.push(e);
    });
  }

  /** 这份清单是刚跟伺服器对过的（登入着、没过期、没暂停）：清单里没有的 c: 照片才能说是「被删掉了」 */
  function trusted() { return state.status === 'ok' && !state.stale && !state.blocked; }
  function publish() {
    ENTRIES.forEach(function (e) { e.stale = !!state.stale; });
    pub = { stale: !!state.stale, trust: trusted(), blocked: !!state.blocked };
    if (typeof MB.setCases === 'function') MB.setCases(ENTRIES, { current: pub.trust, purged: IDX ? IDX.purged || [] : [] });
    state.count = ENTRIES.filter(function (e) { return !e.hidden && e.status !== 'unsure' && !e.gone; }).length;
    notify('cases');
  }
  /** 状态变了（换清单、过期、暂停 / 恢复、刚对过伺服器）：要重建的重建，只发一次给 model.js */
  function sync() {
    if (!IDX) return;
    var rebuild = fresh || !pub || pub.blocked !== !!state.blocked;
    fresh = false;
    if (rebuild) {
      // 恢复了：暂停中载不到的缩图包再试一次
      if (!state.blocked) Object.keys(PACKS).forEach(function (k) { if (PACKS[k] === 'fail') delete PACKS[k]; });
      build();
    }
    if (rebuild || pub.stale !== !!state.stale || pub.trust !== trusted()) publish();
  }
  function notify(what) {
    subs.slice().forEach(function (fn) { try { fn(what, status()); } catch (e) { console.error(e); } });
  }
  function setStatus(s, err) {
    var changed = state.status !== s || state.error !== (err || '');
    var was = state.stale;
    state.status = s; state.error = err || '';
    // 伺服器说要登入（cookie 过期）：存着的清单改成只解析、不自动挑
    if (s === 'login') state.stale = true;
    sync();
    if (IDX && state.stale !== was) save();
    if (changed) notify('status');
  }
  /** 暂停 / 恢复（by = 'api' | 'probe' | ''）：只改状态，之后的 setStatus / sync 一次重建 */
  function setBlocked(by) {
    if (!!state.blocked === !!by) { if (by && state.blocked !== 'api') state.blocked = by; return false; }
    state.blocked = by || '';
    state.blockedAt = by ? Date.now() : 0;
    return true;
  }
  function status() {
    return { status: state.status, user: state.user, rev: IDX ? IDX.rev : 0, checked: state.checked, count: state.count, error: state.error,
      cached: !!IDX, stale: !!state.stale, loggedOut: !!state.loggedOut, blocked: !!state.blocked };
  }
  /** 这台电脑登入着（登入过、没按登出）：才去问伺服器。只存着清单不算（登出后不再问） */
  function wanted() { return lsGet(FLAG) === '1' && !state.loggedOut; }

  function save() {
    if (!IDX) return Promise.resolve();
    return idbPut('meta', { k: 'index', index: IDX, checked: state.checked, user: state.loggedOut ? '' : state.user,
      stale: !!state.stale, loggedOut: !!state.loggedOut, blocked: state.blocked ? { by: state.blocked, at: state.blockedAt } : null });
  }

  /* ---------- 网路 ---------- */
  function call(method, path, body, extra) {
    var opts = { method: method, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } };
    if (method !== 'GET') opts.headers['X-VISI'] = '1';   // 伺服器挡跨站写入（CSRF）要这个
    if (body != null) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    Object.keys(extra || {}).forEach(function (k) { opts.headers[k] = extra[k]; });
    return fetch(API + path, opts).then(function (r) {
      var json = /json/i.test(r.headers.get('Content-Type') || '');
      return (json && r.status !== 304 ? r.json().catch(function () { return null; }) : Promise.resolve(null)).then(function (data) {
        return { status: r.status, ok: r.ok, json: json, data: data };
      });
    });
  }
  /** 回应 → 案例库被 Vercel 暂停了（免费额度用完：store 被停权、额度到顶）。跟 503 not_configured（没设定）不一样 */
  function blockedResp(r) {
    var e = r.data && r.data.error;
    return (r.status === 503 && e === 'storage_blocked') || (r.status === 507 && e === 'quota');
  }
  /** 回应 → 这个网址没有案例库：静态网站（404、不收 POST、回的不是 JSON）、团队密码还没设（503 not_configured） */
  function unavailable(r) {
    if (r.status === 404 || r.status === 405 || r.status === 501) return true;
    if (r.status === 503 && r.data && r.data.error === 'not_configured') return true;
    return r.status >= 200 && r.status < 300 && !r.json;
  }

  MB.cloud = {
    /** 开机：读这台电脑存着的清单（不发请求）。永远 resolve（回几张案例） */
    loadCached: function () {
      return idbGet('meta', 'index').then(function (rec) {
        if (rec && rec.index) {
          IDX = sanitize(rec.index);
          state.checked = +rec.checked || 0;
          // 登出过（或案例库管理页登出、清掉了 FLAG）：不要又显示「已登入：某某」
          if (rec.loggedOut || lsGet(FLAG) !== '1') { state.loggedOut = true; state.user = ''; }
          else if (rec.user && !state.user) state.user = String(rec.user).slice(0, 30);
          state.stale = !!(rec.stale || state.loggedOut);
          // 上次知道的是「暂停中」：照片网址会回 403 —— 先当暂停中（第一次排版就不会破图），问到伺服器 / 试到照片正常再恢复
          var bl = rec.blocked && typeof rec.blocked === 'object' ? rec.blocked : null;
          if (bl && (bl.by === 'api' || bl.by === 'probe')) { state.blocked = bl.by; state.blockedAt = +bl.at || 0; }
        }
      }).catch(function () {}).then(function () {
        build(); publish();
        if (IDX && state.status === 'idle') state.status = state.loggedOut ? 'login' : 'cached';
        return ENTRIES.length;
      });
    },

    /** 问伺服器有没有新清单。force = 业务按「更新」/ 刚登入；否则 10 分钟内问过就不问。永远 resolve（回 status()） */
    refresh: function (force) {
      // 登出了：不问伺服器（存着的清单只解析方案里已经放的）；照片还会载，所以最多一天试一次案例库开不开
      if (!wanted() && !force) { probe(); return Promise.resolve(status()); }
      // 暂停中不走这条：每次都问（恢复了才知道）
      if (!force && !state.stale && !state.blocked && state.checked && Date.now() - state.checked < EVERY) {
        // 10 分钟内才问过：存着的就是最新的（不要一直显示「正在问」）
        if (state.status === 'cached') setStatus('ok');
        return Promise.resolve(status());
      }
      if (inflight) return inflight;
      var extra = IDX && IDX.rev ? { 'If-None-Match': '"rev-' + IDX.rev + '"' } : {};
      inflight = call('GET', 'catalog?view=visi', null, extra).then(function (r) {
        if (r.status === 304) {
          state.checked = Date.now(); state.loggedOut = false; state.stale = false;
          setBlocked('');
          setStatus('ok'); save();
          return;
        }
        if (r.status === 401) { setStatus('login'); return; }
        // 案例库被暂停：存着的清单照样解析（方案打得开），照片不再给网址
        if (blockedResp(r)) { setBlocked('api'); setStatus('blocked', r.data.error); save(); return; }
        if (unavailable(r)) { setStatus('unavailable', 'http ' + r.status); return; }
        if (!r.ok) { setStatus('offline', 'http ' + r.status); return; }   // 500 storage 之类：照样用存着的
        var idx = sanitize(r.data);
        if (!idx) { setStatus('offline', 'bad catalog'); return; }
        IDX = idx;
        state.checked = Date.now();
        state.stale = false; state.loggedOut = false;
        lsSet(FLAG, '1');
        setBlocked('');
        fresh = true;
        setStatus('ok'); save();
      }).catch(function (e) {
        setStatus('offline', String(e && e.message || e));
      }).then(function () {
        inflight = null;
        // 问不到伺服器（离线、500、登入过期）：照片还是会载 —— 试一张看案例库是不是被暂停了
        if (state.status === 'offline' || state.status === 'login') probe();
        // 连不上（离线、伺服器 500）：1 分钟后自己再试一次，不用等 10 分钟
        if (state.status === 'offline' && !retry) retry = setTimeout(function () { retry = null; MB.cloud.refresh(true); }, 60000);
        return status();
      });
      return inflight;
    },

    /** 我是谁（伺服器的 cookie 还有效吗）：回名字或 ''；没有案例库回 null */
    me: function () {
      return call('GET', 'session').then(function (r) {
        if (r.status === 200 && r.data && r.data.name) { state.user = String(r.data.name).slice(0, 30); lsSet(USER, state.user); return state.user; }
        if (unavailable(r)) { setStatus('unavailable', 'http ' + r.status); return null; }
        if (r.status === 401) setStatus('login');
        return '';
      }, function () { setStatus('offline', 'network'); return null; });
    },

    /** 登入：回 { ok, name } 或 { ok:false, error, msg }（msg 是给业务看的华文） */
    login: function (name, password) {
      name = String(name || '').trim();
      if (!name || !password) return Promise.resolve({ ok: false, error: 'empty', msg: '名字和团队密码都要填' });
      return call('POST', 'session', { name: name, password: String(password) }).then(function (r) {
        if (r.status === 200 && r.data && r.data.name) {
          state.user = String(r.data.name).slice(0, 30);
          state.loggedOut = false;
          lsSet(USER, state.user); lsSet(FLAG, '1');
          // 先不改 stale：要拿到伺服器的清单（200 / 304）才算是新的
          state.status = 'cached';
          return MB.cloud.refresh(true).then(function () { return { ok: true, name: state.user }; });
        }
        var err = (r.data && r.data.error) || ('http_' + r.status);
        if (unavailable(r)) { setStatus('unavailable', err); return { ok: false, error: 'unavailable', msg: r.status === 503 ? '团队密码还没设定 —— 请老板在 Vercel 加 VISI_TEAM_PASSWORD' : '这个网址没有公司案例库（只有正式网站有）' }; }
        if (err === 'password') return { ok: false, error: err, msg: '团队密码不对' };
        if (err === 'slow_down') return { ok: false, error: err, msg: '密码错太多次了，为了安全先锁住：请约 ' + Math.max(1, Math.ceil(((r.data && r.data.retryAfter) || 600) / 60)) + ' 分钟后再试' };
        if (err === 'name') return { ok: false, error: err, msg: '名字要 1–30 个字' };
        return { ok: false, error: err, msg: '登入失败（' + err + '），稍后再试' };
      }, function () { return { ok: false, error: 'network', msg: '连不上，检查网络后再试' }; });
    },

    /** 登出：存着的清单留着（旧方案的案例照片还要解析得到），但不再自动挑、不再自动去问伺服器；重新整理也记得 */
    logout: function () {
      return call('DELETE', 'session').catch(function () {}).then(function () {
        state.user = ''; state.loggedOut = true;
        lsSet(FLAG, null); lsSet(USER, null);
        if (retry) { clearTimeout(retry); retry = null; }
        setStatus('login');     // → stale（会存起来）
        save();
        return status();
      });
    },

    /** 载入几个项目的缩图包（图库每页要显示的那几个项目）。永远 resolve；载不到的（没有 CORS、离线）就用原图。
        暂停中只读这台电脑存着的（网址一定 403，不连网）*/
    thumbs: function (pids) {
      if (!IDX) return Promise.resolve(0);
      var jobs = [];
      [].concat(pids || []).forEach(function (pid) {
        var pr = IDX.projects[pid];
        if (!pr) return;
        pr.packs.forEach(function (k) { if (!PACKS[k]) jobs.push(loadPack(k)); else if (PACKS[k].then) jobs.push(PACKS[k]); });
      });
      if (!jobs.length) return Promise.resolve(0);
      return Promise.all(jobs).then(function () {
        var n = 0;
        ENTRIES.forEach(function (e) { var t = THUMBS[e.id.slice(2)]; if (t && !e.gone && e.thumb !== t) { e.thumb = t; n++; } });
        if (n) notify('thumbs');
        return n;
      });
    },
    /** 这张案例的缩图（还没载就回 ''） */
    thumb: function (ref) { return THUMBS[String(ref || '').slice(2)] || ''; },
    /** 这个项目的缩图包载过了但载不到（没有 CORS / 离线）：图库改用原图 */
    thumbsFailed: function (pid) {
      var pr = IDX && IDX.projects[pid];
      return !!pr && pr.packs.length > 0 && pr.packs.every(function (k) { return PACKS[k] === 'fail'; });
    },

    entries: function () { return ENTRIES; },
    /** [{ pid, label, n }]：项目的显示名「区域 · 风格 · #n」，n = 能用的照片数 */
    projects: function () {
      var n = {};
      ENTRIES.forEach(function (e) { if (!e.hidden && e.status !== 'unsure' && !e.gone) n[e.pid] = (n[e.pid] || 0) + 1; });
      return Object.keys(PLABEL).filter(function (pid) { return n[pid]; }).map(function (pid) {
        return { pid: pid, label: PLABEL[pid], n: n[pid] };
      });
    },
    projectLabel: function (pid) { return PLABEL[pid] || ''; },
    status: status,
    onChange: function (fn) { if (typeof fn === 'function') subs.push(fn); },
    /** PPTX 的后备：图库网址没开 CORS 时，改走同网域的 cb/c/…（vercel.json 要加那条 rewrite，只开 c/） */
    proxySrc: function (src) {
      var base = IDX && IDX.base;
      if (!base || typeof src !== 'string' || src.indexOf(base) !== 0) return '';
      var k = src.slice(base.length);
      return PHOTO_K.test(k) ? 'cb/' + k : '';
    },
    /** 这个网址是不是案例照片（PPTX 统计放不进去的张数） */
    isCaseSrc: function (src) {
      var base = IDX && IDX.base;
      return !!base && typeof src === 'string' && src.indexOf(base) === 0;
    },
    /** 测试 / 管理用：现在就试一次（不管一天一次的限制）。回 Promise<status()> */
    probe: function () { return probe(true) || Promise.resolve(status()); },
    /** 方案页 / 编辑区一张案例照片载不出来（app.js 抓 <img> 的 error）：去确认是删掉了还是暂停中。
        确认了就重建（notify 'cases'），方案页改印占位框、体检会说。回 Promise<status()> */
    photoFailed: function (src) { return photoFailed(src); },
    EVERY: EVERY
  };

  /* ---------- 试一张照片：案例库是不是被暂停了 ----------
     只在问不到伺服器时（离线、500、登入过期、登出）。HEAD 一张照片（不下载），回 403 = 暂停中；2xx = 正常。
     其他（404、500、连不上、没有 CORS 读不到状态）一律看不出来，什么都不改 —— 网路一时不通不会把案例挡掉。
     平常一天最多试一次；已经是暂停中就一小时最多一次（恢复了才不会要等一天） */
  function probeKey() {
    if (!IDX || !IDX.base) return '';
    var hs = Object.keys(IDX.photos).sort();
    for (var i = 0; i < hs.length; i++) if (!IDX.photos[hs[i]].hidden) return IDX.photos[hs[i]].k;
    return hs.length ? IDX.photos[hs[0]].k : '';
  }
  function probe(now) {
    if (probing) return probing;
    if (!IDX || typeof fetch !== 'function' || (navigator && navigator.onLine === false)) return null;
    if (!now && state.status !== 'offline' && state.status !== 'login') return null;
    var k = probeKey();
    if (!k) return null;
    var last = null;
    try { last = JSON.parse(lsGet(PROBE) || 'null'); } catch (e) { last = null; }
    var since = last && +last.at ? Date.now() - last.at : Infinity;
    if (!now && since >= 0 && since < (state.blocked ? HOUR : DAY)) return null;
    lsSet(PROBE, JSON.stringify({ at: Date.now() }));
    probing = fetch(IDX.base + k, { method: 'HEAD', mode: 'cors', credentials: 'omit', cache: 'no-store' }).then(function (r) {
      lsSet(PROBE, JSON.stringify({ at: Date.now(), r: r.status }));
      var by = r.status === 403 ? 'probe' : r.ok ? '' : null;
      if (by === null || !setBlocked(by)) return;
      sync(); save(); notify('status');
    }, function () {}).then(function () { probing = null; return status(); });
    return probing;
  }

  /* ---------- 一张案例照片载不出来 ----------
     先问伺服器（登入着才问，最多一分钟一次）：清单换了（照片被删掉）、暂停中，伺服器一次就说清楚。
     问不到（登入过期、离线、500）、或伺服器还是说清单里有：HEAD 那一张（每张这次开着只试一次，一次最多 6 张）——
     404 = 档案不在了 → 当成已删除；403 = 暂停中（只在伺服器问不到时算，伺服器说没暂停就信伺服器）；
     其他（连不上、没有 CORS、200 = 刚才只是网路不稳）一律不改 */
  function photoFailed(src) {
    var base = IDX && IDX.base;
    if (!base || typeof src !== 'string' || src.indexOf(base) !== 0 || state.blocked) return Promise.resolve(status());
    var k = src.slice(base.length), h = k.slice(2, 18);
    if (!PHOTO_K.test(k) || !HEX16.test(h) || MISSING[h] || HEADED[k]) return failJob || Promise.resolve(status());
    if (typeof fetch !== 'function' || (navigator && navigator.onLine === false)) return Promise.resolve(status());
    FAILQ[k] = 1;
    if (failJob) return failJob;
    // 同一次排版好几张一起载不出来：等一下收齐，只问一次
    failJob = new Promise(function (done) { setTimeout(done, 250); }).then(function () {
      if (!wanted() || Date.now() - failAt < 60000) return;
      failAt = Date.now();
      return MB.cloud.refresh(true);
    }).then(function () {
      var list = Object.keys(FAILQ);
      FAILQ = {};
      // 伺服器说清楚了（暂停中、清单里已经没有这张）：不用再试
      list = list.filter(function (k) {
        var x = IDX && IDX.photos[k.slice(2, 18)];
        return !state.blocked && x && x.k === k && !HEADED[k];
      }).slice(0, 6);
      return Promise.all(list.map(function (k) {
        HEADED[k] = 1;
        return fetch(IDX.base + k, { method: 'HEAD', mode: 'cors', credentials: 'omit', cache: 'no-store' }).then(function (r) {
          return r.status === 404 ? 'gone' : r.status === 403 && !trusted() ? 'blocked' : '';
        }, function () { return ''; }).then(function (v) { return { k: k, v: v }; });
      }));
    }).then(function (res) {
      var gone = 0, blocked = false;
      (res || []).forEach(function (x) { if (x.v === 'gone') { MISSING[x.k.slice(2, 18)] = 1; gone++; } else if (x.v === 'blocked') blocked = true; });
      if (blocked && setBlocked('probe')) { sync(); save(); notify('status'); }
      if (gone) { fresh = true; sync(); }
    }).catch(function (e) { console.error(e); }).then(function () {
      failJob = null;
      // 这一轮在跑的时候又有别张载不出来：再跑一轮（每张只试一次，不会一直转）
      var more = Object.keys(FAILQ)[0];
      if (more && IDX && IDX.base) { delete FAILQ[more]; photoFailed(IDX.base + more); }
      return status();
    });
    return failJob;
  }

  function loadPack(k) {
    var job = idbGet('packs', k).then(function (rec) {
      if (rec && rec.thumbs) return rec.thumbs;
      if (!IDX || !IDX.base) throw new Error('no base');
      if (state.blocked) throw new Error('blocked');   // 恢复时 sync() 会把这些「载不到」清掉、再试
      return fetch(IDX.base + k, { mode: 'cors', credentials: 'omit' }).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      }).then(function (data) {
        var clean = {};
        Object.keys(data || {}).forEach(function (h) {
          var v = data[h];
          if (HEX16.test(h) && typeof v === 'string' && v.length < 400000 && THUMB_RE.test(v)) clean[h] = v;
        });
        idbPut('packs', { k: k, thumbs: clean });
        return clean;
      });
    }).then(function (thumbs) {
      Object.keys(thumbs).forEach(function (h) { THUMBS[h] = thumbs[h]; });
      PACKS[k] = 'ok';
    }, function () { PACKS[k] = 'fail'; });
    PACKS[k] = job;
    return job;
  }
})();
