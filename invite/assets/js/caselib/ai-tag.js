/* ============================================================
   案例库 · AI 看图标「风格」「柜类」（MB.clAi）
   ------------------------------------------------------------
   文件夹名看不出风格、柜子的照片，让 Claude 一张一张看：
   - 每张回：空间、柜类（只算定制的柜体）、风格、有没有把握。词表直接用 case-vocab.js 的 MB.CASE_*，
     结构化输出的 enum 就是词表的 key —— AI 回的值一定在词表里。
   - 风格按项目定：一个项目的照片看完 → 多数决 → 项目的 style（项目还空着才写）；
     个别照片明显是别的风格（AI 有把握），那张照片才另外写 style。
   - patch 跟「按文件夹名字自动标」同一条路：source:'auto'，只填空的栏位；人确认过的照片伺服器一个字都不动。
     有把握 → status 'auto'；没把握 → 'unsure'（VISI 的自动挑选不会用 unsure 的照片）。
   - 只送照片本身（缩成 1024px 的 JPEG，没有 EXIF / GPS）。文件夹名、档案路径、客户名字一律不送。
   - API key 只存在这台电脑的浏览器（localStorage），不进 repo。
   - 进度存在这台电脑（localStorage）：看过的照片结果先记下来，中途关掉再按不会重花钱。
   纯逻辑（schema、提示词、多数决、patch、排队、执行器）不碰 DOM，Node 的 vm 可以载入测试
   （tools/caselib/test/ai-tag.test.mjs）；浏览器专用的（缩图、fetch）在最下面，执行器用注入的函数。
   ============================================================ */
(function (G) {
  'use strict';

  var MB = G.MB = G.MB || {};

  var MODEL = 'claude-opus-5-5';
  var API_URL = 'https://api.anthropic.com/v1/messages';
  var API_VERSION = '2026-10-21';
  var BETA = 'server-side-fallback-2026-07-01';
  // 美元 / 百万 token（Opus 5.5）：输入 4、输出 20、快取写入 1.25 倍、快取读取 0.2
  var PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 };
  var EST_PER_PHOTO = 0.012;      // 估价用：一张 1024px 的照片 + 提示词 + 回答，约 US$0.01
  var MAX_SIDE = 1024;
  var CONCURRENCY = 4;
  var TRIAL = 50;                 // 「先试 50 张」
  var TRIAL_PER_PROJECT = 10;     // 试跑时每个项目最多几张（多看几个项目，才看得出风格准不准）
  var MAX_TRIES = 4;
  var KEY_KEY = 'caselib-ai-key';
  var STORE_KEY = 'caselib-ai-v1';
  var NONE = 'none';              // 看不出风格


  function styles() { return MB.CASE_STYLES || []; }
  function cabinets() { return MB.CASE_CABINETS || []; }
  function rooms() { return MB.CASE_ROOMS || []; }
  function keys(list) { return list.map(function (x) { return x.key; }); }

  /* ---------- 结构化输出的 schema（enum = 词表） ---------- */
  function schema() {
    return {
      type: 'object',
      properties: {
        room: { type: 'string', enum: rooms().slice() },
        cabinets: { type: 'array', items: { type: 'string', enum: keys(cabinets()) } },
        style: { type: 'string', enum: keys(styles()).concat([NONE]) },
        styleSure: { type: 'boolean' },
        sure: { type: 'boolean' }
      },
      required: ['room', 'cabinets', 'style', 'styleSure', 'sure'],
      additionalProperties: false
    };
  }

  /* ---------- 提示词：每种风格、每种柜子长什么样 ---------- */
  var STYLE_LOOK = {
    wood: '原木 Natural wood：浅到中色的天然木纹占主角，平板门、线条简单，暖、干净，几乎没有装饰线。',
    wabi: '微侘寂 Subtle wabi-sabi：灰米、土色、低彩度；艺术涂料 / 微水泥墙、粗糙或做旧的质感，圆润柔和的造型，安静、留白多。',
    cream: '奶油风 Cream style：奶油白、米色为主的单色系，圆角、拱形、弧线多，哑光，柔软、温和。',
    french: '轻法式 Light French：浅色墙面加石膏线 / 门板装饰框线，拱门，细的金色或铜色把手、人字拼地板，优雅的曲线。',
    midcentury: '中古 Mid-century：深色胡桃木 / 柚木，复古造型、锥形细脚，藤编、长虹玻璃，橄榄绿、芥末黄、酒红这类浓一点的颜色。',
    modern: '现代简约 Modern minimal：白、灰、黑为主，直线、平整的无把手大面板，几乎没有装饰，木纹不是主角。',
    japandi: '日式 Japandi：浅橡木 / 白蜡木，木格栅、低矮的家具，纸、麻、竹这类天然材质，非常平静。',
    nordic: '北欧 Nordic：白墙配浅色木头，明亮、功能性强，偶尔一点颜色点缀，造型简单。',
    luxe: '轻奢 Modern luxe：大理石 / 岩板、金色 / 香槟色 / 黑色金属收边，带灯的玻璃展示柜、亮面、皮革，颜色偏深、有质感。'
  };
  var CABINET_LOOK = {
    kitchen: '橱柜：厨房的地柜 + 吊柜（台面、水槽、炉头、抽油烟机那一整组）。',
    island: '中岛：厨房中间独立的一块台面柜，四周可以走。',
    wardrobe: '衣柜：卧室或衣帽间里到顶的高柜，门后挂衣服（开放式衣帽间的挂衣柜也算）。',
    display: '展示柜：玻璃门、或开放的格子摆放饰品 / 酒 / 收藏，常有灯带（摆的主要是书就是书柜）。',
    bookcase: '书柜：放书为主的层板柜、书墙。',
    bedend: '床尾柜：床尾那一个矮柜。',
    dresser: '化妆台：卧室里带镜子的梳妆桌 / 柜。',
    tvcab: '电视柜：电视下面的矮柜 / 地台柜。',
    tvwall: '电视墙：电视后面整面做的造型墙、柜体或饰面板。',
    door: '房门：定制的房门、隐形门、门板（一般的大门、玻璃推拉门不算）。',
    shoe: '鞋柜：玄关放鞋子的柜子。',
    bathvanity: '浴室柜：浴室洗手盆下面的柜子（含镜柜）。',
    wallpanel: '护墙板：墙面的装饰木饰面 / 墙板（不是电视后面那一面）。',
    sideboard: '餐边柜：餐厅靠墙的储物柜 / 吧台柜。',
    bed: '定制床：做在柜体里的床、地台床、榻榻米。'
  };
  var ROOM_ZH = {
    foyer: '玄关', living: '客厅', dining: '餐厅', kitchen: '厨房', laundry: '洗衣房 / 后阳台', master: '主卧', walkin: '衣帽间',
    vanity: '梳妆区', bathroom: '浴室', bedroom: '卧室', study: '书房', altar: '神台', guest: '客房', other: '看不出是哪里'
  };

  function systemPrompt() {
    var lines = [];
    lines.push('你在帮一家马来西亚的全屋定制公司（定制柜体：橱柜、衣柜、电视墙……）整理自家完工案例的照片。');
    lines.push('每次给你一张照片，请判断三件事，只回 JSON（照 schema）：');
    lines.push('');
    lines.push('1. room：这张照片拍的是哪个空间。');
    rooms().forEach(function (k) { lines.push('   - ' + k + '：' + (ROOM_ZH[k] || k)); });
    lines.push('');
    lines.push('2. cabinets：照片里看得清楚的「定制柜体」是哪几种（可以多选，也可以是空的）。');
    lines.push('   只算木作 / 定制的柜体；沙发、餐桌椅、床垫、活动家具、电器本身都不算。只露出一小角、看不清楚的不要选。');
    cabinets().forEach(function (c) { lines.push('   - ' + c.key + '：' + (CABINET_LOOK[c.key] || c.zh + ' ' + c.en)); });
    lines.push('');
    lines.push('3. style：整体的设计风格（选最接近的一种）。看柜体的颜色、材质、线条，也看墙面、地板、灯和软装。');
    styles().forEach(function (s) { lines.push('   - ' + s.key + '：' + (STYLE_LOOK[s.key] || s.zh + ' ' + s.en)); });
    lines.push('   - ' + NONE + '：看不出风格（例：五金特写、只拍到一小块材质）。');
    lines.push('   styleSure：一眼就看得出是这种风格才是 true；在两种之间犹豫、或只是勉强接近，就是 false。');
    lines.push('');
    lines.push('sure：空间和柜类你都有把握才是 true。照片太暗、太近、看不出是什么，就是 false。');
    lines.push('不要猜照片以外的事；没有就留空，宁可 false 也不要硬选。');
    return lines.join('\n');
  }
  var USER_TEXT = '这张照片：空间、定制柜体、风格是什么？';

  /** 一张照片的 Messages API 请求内容 */
  function requestBody(imageB64) {
    return {
      model: MODEL,
      max_tokens: 4000,
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schema() } },
      system: [{ type: 'text', text: systemPrompt(), cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageB64 } },
          { type: 'text', text: USER_TEXT }
        ]
      }]
    };
  }
  function requestHeaders(key) {
    return {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': API_VERSION,
      'anthropic-beta': BETA,
      'anthropic-dangerous-direct-browser-access': 'true'
    };
  }

  /** API 回传 → {room, cabinets, style, styleSure, sure}；读不懂回 null。值不在词表里的一律丢掉 */
  function parseReply(msg) {
    if (!msg || msg.stop_reason === 'refusal' || msg.stop_reason === 'max_tokens') return null;
    var text = '';
    (msg.content || []).forEach(function (b) { if (b && b.type === 'text') text += b.text; });
    var j;
    try { j = JSON.parse(text); } catch (e) { return null; }
    if (!j || typeof j !== 'object') return null;
    var roomOk = rooms().indexOf(j.room) >= 0;
    var cabKeys = keys(cabinets());
    var cabs = [];
    (Array.isArray(j.cabinets) ? j.cabinets : []).forEach(function (k) { if (cabKeys.indexOf(k) >= 0 && cabs.indexOf(k) < 0) cabs.push(k); });
    // 按词表顺序排（跟其它地方一样）
    cabs.sort(function (a, b) { return cabKeys.indexOf(a) - cabKeys.indexOf(b); });
    var st = keys(styles()).indexOf(j.style) >= 0 ? j.style : '';
    return {
      room: roomOk && j.room !== 'other' ? j.room : '',
      cabinets: cabs,
      style: st,
      styleSure: !!(st && j.styleSure === true),
      sure: j.sure === true && roomOk
    };
  }

  /** usage → 美元（约；被拒后换模型重跑的，照 Opus 的价钱算） */
  function costOf(usage) {
    if (!usage) return 0;
    return ((usage.input_tokens | 0) * PRICE.input + (usage.output_tokens | 0) * PRICE.output +
      (usage.cache_creation_input_tokens | 0) * PRICE.cacheWrite + (usage.cache_read_input_tokens | 0) * PRICE.cacheRead) / 1e6;
  }

  /* ---------- 多数决与 patch ---------- */
  /** 一个项目的结果（{h: r}）→ 项目风格：有把握的票优先；都没把握就用全部的票；平手照词表顺序 */
  function majority(results) {
    var hs = Object.keys(results || {});
    function count(onlySure) {
      var n = {};
      hs.forEach(function (h) {
        var r = results[h];
        if (r && r.style && (!onlySure || r.styleSure)) n[r.style] = (n[r.style] || 0) + 1;
      });
      return n;
    }
    var n = count(true);
    if (!Object.keys(n).length) n = count(false);
    var best = '', bestN = 0;
    keys(styles()).forEach(function (k) { if ((n[k] || 0) > bestN) { best = k; bestN = n[k]; } });
    return best;
  }

  /** 一个项目的结果 → source:'auto' 的 patch：只填空的栏位；已确认 / 不确定 / 隐藏的照片不动 */
  function buildPatch(index, pid, results) {
    var out = { source: 'auto', photos: {}, projects: {} };
    var pr = index.projects && index.projects[pid];
    if (!pr) return out;
    var top = majority(results);
    if (top && !pr.style) out.projects[pid] = { style: top };
    var projStyle = pr.style || top;
    Object.keys(results || {}).forEach(function (h) {
      var ph = index.photos[h], r = results[h];
      if (!ph || !r || ph.p !== pid || ph.hidden) return;
      if (ph.status === 'confirmed' || ph.status === 'unsure') return;
      var x = {};
      if (r.room && !ph.room) x.room = r.room;
      if (r.cabinets.length && !(ph.cabinets && ph.cabinets.length)) x.cabinets = r.cabinets.slice();
      // 照片自己的风格：只有 AI 有把握、又跟项目不一样时才写；没把握的跟项目走
      if (r.style && r.styleSure && projStyle && r.style !== projStyle && !ph.style) x.style = r.style;
      x.status = r.sure ? 'auto' : 'unsure';
      out.photos[h] = x;
    });
    return out;
  }

  /* ---------- 进度（这台电脑） ---------- */
  function emptyStore() { return { v: 1, r: {}, sent: {}, spent: 0 }; }
  function readStore(raw) {
    var s;
    try { s = JSON.parse(raw || 'null'); } catch (e) { s = null; }
    if (!s || s.v !== 1 || typeof s.r !== 'object' || typeof s.sent !== 'object') return emptyStore();
    s.spent = +s.spent || 0;
    return s;
  }

  /** 还要 AI 看的照片，按项目分组：[{pid, hs:[…]}]（项目名、档案路径排序；隐藏的、人看过的、送过的不算） */
  function plan(index, store, opts) {
    opts = opts || {};
    var sent = (store && store.sent) || {};
    var by = {};
    Object.keys(index.photos || {}).forEach(function (h) {
      var ph = index.photos[h], pr = index.projects[ph.p];
      if (!pr || pr.hidden || ph.hidden) return;
      if (ph.status === 'confirmed' || ph.status === 'unsure') return;
      if (sent[h]) return;
      (by[ph.p] || (by[ph.p] = [])).push(h);
    });
    var cmp = function (a, b) { a = String(a || ''); b = String(b || ''); return a < b ? -1 : a > b ? 1 : 0; };
    var groups = Object.keys(by).sort(function (a, b) { return cmp(index.projects[a].name, index.projects[b].name) || cmp(a, b); })
      .map(function (pid) {
        return { pid: pid, hs: by[pid].sort(function (a, b) { return cmp(index.photos[a].f, index.photos[b].f) || cmp(a, b); }) };
      });
    if (opts.limit) {
      // 试跑：每个项目最多 perProject 张，凑到 limit 张为止（多看几个项目）
      var left = opts.limit, per = opts.perProject || opts.limit, cut = [];
      groups.forEach(function (g) {
        if (left <= 0) return;
        var hs = g.hs.slice(0, Math.min(per, left));
        left -= hs.length;
        cut.push({ pid: g.pid, hs: hs });
      });
      groups = cut;
    }
    return groups;
  }
  function countPlan(groups) { return groups.reduce(function (n, g) { return n + g.hs.length; }, 0); }

  /* ---------- 执行器（注入：look(h) → Promise<{r, cost}>、send(patch) → Promise、save()、progress()） ----------
     一个项目一个项目跑；同一个项目里同时 CONCURRENCY 张。看过的先记进 store.r（中途停掉不会重花钱），
     整个项目看完 → buildPatch → send → 记进 store.sent。stop() 之后跑完手上那几张就停，那个项目先送出去。 */
  function makeRunner(deps) {
    var st = { stopped: false, done: 0, failed: 0, total: 0, spent: 0, pid: '', error: '' };
    var store = deps.store;
    function stop() { st.stopped = true; }

    function lookAll(hs) {
      var i = 0, fatal = null;
      function worker() {
        if (st.stopped || fatal || i >= hs.length) return Promise.resolve();
        var h = hs[i++];
        if (store.r[h]) { st.done++; deps.progress(st); return worker(); }
        return deps.look(h).then(function (res) {
          st.spent += res.cost || 0;
          store.spent = (store.spent || 0) + (res.cost || 0);
          if (res.r) { store.r[h] = res.r; st.done++; } else st.failed++;
          deps.save();
          deps.progress(st);
        }, function (e) {
          if (e && e.fatal) { fatal = e; st.stopped = true; return; }
          st.failed++;
          deps.progress(st);
        }).then(worker);
      }
      var ws = [];
      for (var k = 0; k < (deps.concurrency || CONCURRENCY); k++) ws.push(worker());
      return Promise.all(ws).then(function () { if (fatal) throw fatal; });
    }

    function run(groups) {
      st.total = countPlan(groups);
      deps.progress(st);
      var gi = 0;
      function nextGroup() {
        if (gi >= groups.length || st.stopped) return Promise.resolve(st);
        var g = groups[gi++];
        st.pid = g.pid;
        deps.progress(st);
        var fatal = null;
        return lookAll(g.hs).catch(function (e) { fatal = e; }).then(function () {
          // 送出这个项目：这次看完的 + 以前看过还没送的（同一个项目）
          var res = {};
          var index = deps.index();
          Object.keys(store.r).forEach(function (h) {
            var ph = index.photos[h];
            if (ph && ph.p === g.pid && !store.sent[h]) res[h] = store.r[h];
          });
          var p = buildPatch(index, g.pid, res);
          var sendIt = Object.keys(p.photos).length || Object.keys(p.projects).length ? deps.send(p) : Promise.resolve();
          return sendIt.then(function () {
            Object.keys(res).forEach(function (h) { store.sent[h] = 1; delete store.r[h]; });
            deps.save();
            if (fatal) throw fatal;
            return nextGroup();
          });
        });
      }
      return nextGroup().then(function () { return st; }, function (e) { st.error = (e && e.message) || String(e); throw e; });
    }
    return { run: run, stop: stop, state: st };
  }

  /* ============================================================
     浏览器专用：缩图、打 API
     ============================================================ */
  function blobToB64(blob) {
    return new Promise(function (ok, fail) {
      var fr = new FileReader();
      fr.onload = function () { ok(String(fr.result).replace(/^data:[^,]*,/, '')); };
      fr.onerror = function () { fail(fr.error || new Error('read')); };
      fr.readAsDataURL(blob);
    });
  }
  /** 照片网址 → 长边 1024px 的 JPEG base64（重新画过一次：没有 EXIF / GPS） */
  function shrink(src) {
    return fetch(src).then(function (r) {
      if (!r.ok) throw new Error('photo_' + r.status);
      return r.blob();
    }).then(function (blob) {
      return createImageBitmap(blob);
    }).then(function (bmp) {
      var s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      var w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      return new Promise(function (ok, fail) {
        c.toBlob(function (b) { if (b) ok(b); else fail(new Error('jpeg')); }, 'image/jpeg', 0.85);
      });
    }).then(blobToB64);
  }

  function fatalErr(msg) { var e = new Error(msg); e.fatal = true; return e; }
  function wait(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  /** 打一次 API（会重试 429 / 5xx / 断网）→ {r, cost}；key 不对、额度不够 → fatal（整批停） */
  function callApi(key, imageB64, tries) {
    tries = tries || 0;
    return fetch(API_URL, { method: 'POST', headers: requestHeaders(key), body: JSON.stringify(requestBody(imageB64)) })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null;
          try { j = JSON.parse(t); } catch (e) { j = null; }
          return { status: r.status, json: j, retryAfter: +r.headers.get('retry-after') || 0 };
        });
      }, function () { return { status: 0, json: null, retryAfter: 0 }; })
      .then(function (res) {
        var s = res.status, msg = (res.json && res.json.error && res.json.error.message) || '';
        if (s === 200 && res.json) return { r: parseReply(res.json), cost: costOf(res.json.usage) };
        if (s === 401) throw fatalErr('API key 不对：请清除 key、重新填一次。');
        if (s === 403) throw fatalErr('这个 API key 没有权限用这个型号（' + (msg || 403) + '）。');
        if (s === 400 && /credit|balance|billing/i.test(msg)) throw fatalErr('API 帐户的额度不够了：到 console.anthropic.com 加值后再按「继续」。');
        if (s === 400) throw fatalErr('请求被退回（' + (msg || 400) + '）。');
        if ((s === 0 || s === 429 || s >= 500) && tries < MAX_TRIES) {
          var ms = res.retryAfter ? res.retryAfter * 1000 : 2000 * Math.pow(2, tries);
          return wait(Math.min(ms, 60000)).then(function () { return callApi(key, imageB64, tries + 1); });
        }
        if (s === 0) throw fatalErr('网路断了：连上之后再按「继续」。');
        if (s === 429) throw fatalErr('API 太忙（429）：等几分钟再按「继续」。');
        var e = new Error('api_' + s);
        throw e;
      });
  }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch (e) { return false; } }

  MB.clAi = {
    MODEL: MODEL, API_URL: API_URL, API_VERSION: API_VERSION, NONE: NONE, PRICE: PRICE,
    EST_PER_PHOTO: EST_PER_PHOTO, TRIAL: TRIAL, TRIAL_PER_PROJECT: TRIAL_PER_PROJECT, MAX_SIDE: MAX_SIDE,
    schema: schema, systemPrompt: systemPrompt, requestBody: requestBody, requestHeaders: requestHeaders,
    parseReply: parseReply, costOf: costOf, majority: majority, buildPatch: buildPatch,
    emptyStore: emptyStore, readStore: readStore, plan: plan, countPlan: countPlan, makeRunner: makeRunner,
    // 浏览器
    shrink: shrink, callApi: callApi,
    getKey: function () { return lsGet(KEY_KEY) || ''; },
    setKey: function (k) { return lsSet(KEY_KEY, k ? String(k).trim() : null); },
    loadStore: function () { return readStore(lsGet(STORE_KEY)); },
    saveStore: function (s) { return lsSet(STORE_KEY, JSON.stringify(s)); },
    clearStore: function () { return lsSet(STORE_KEY, null); }
  };
})(typeof window !== 'undefined' ? window : this);
