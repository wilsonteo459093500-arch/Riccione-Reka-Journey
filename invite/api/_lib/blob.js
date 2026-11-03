/* ============================================================
   案例库 API · 储存（Vercel Blob）
   ------------------------------------------------------------
   handler 只透过 adapter 存取，不直接碰 @vercel/blob：
     getJson(path, {fresh}) → {data, etag, url} | null
     putJson(path, text, {ifMatch} | {create:true}) → {etag, url, pathname}
       冲突（别人先写了）一律丢 code:'conflict' 的错误，mutate 会重读重试
     putFile(pathname, body, contentType, {fixed}) → {url, pathname, existed?}（加随机后缀、快取一年；
       fixed = 路径照给的、不覆盖：已经有了就当成功，回 existed:true —— 缩图包重送不会多一个档）
     copy(from, to) → 每日备份用（固定 7 个档，按星期几轮流覆盖）
     del(pathnames[]) → 真的删掉（审核页「删除隐藏的照片」才用；一次最多 DEL_BATCH 个）
     base → 公开网址前缀（学到之后才有）
   正式环境：realAdapter()，用到才 import('@vercel/blob')（没装、没 token 也不会一载入就坏）。
   测试 / 本机：memoryAdapter()，可以人为制造写入失败和冲突。
   ============================================================ */
import { createHash, randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

export class ConflictError extends Error {
  constructor() { super('index changed by someone else'); this.code = 'conflict'; this.name = 'ConflictError'; }
}
// status / error：给 handler 回什么（500 storage = 一般的储存错误，可以重试）
//   503 storage_blocked = store 被暂停 / 没权限 / 不存在（额度用完、设定错）—— 重试也没用，上传页会停下来
//   503 storage_timeout = 太久没回（Blob 出状况）· 429 storage_busy = Blob 限流（带 retryAfter 秒）
export class StorageError extends Error {
  constructor(msg, o) {
    super(msg);
    this.code = 'storage'; this.name = 'StorageError';
    o = o || {};
    this.status = o.status || 500;
    this.error = o.error || 'storage';
    if (o.retryAfter) this.retryAfter = o.retryAfter;
  }
}

/* ---------- 清单路径：key 由 token 推出，Preview 和 Production 自动分开 ---------- */
// 新的 Vercel Blob 连到项目时只给 BLOB_STORE_ID（用 Vercel 的 OIDC 登入），旧的给 BLOB_READ_WRITE_TOKEN：两种都认
export function hasCredentials() { return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID); }
// OIDC token 跟着每个请求来（x-vercel-oidc-token）；SDK 找不到请求的 context 时会读这个环境变数，这里先放进去
export function useOidc(req) {
  var t = req && req.headers && req.headers['x-vercel-oidc-token'];
  if (typeof t === 'string' && t) process.env.VERCEL_OIDC_TOKEN = t;
}
// 在 Vercel 上（有 VERCEL_ENV）不准用推不出来的 key：清单是公开的 Blob，路径一猜就中的话客户名字就外流了
function onVercel() { return !!process.env.VERCEL_ENV; }

export function catalogKey() {
  var k = process.env.CATALOG_KEY;
  if (k && /^[A-Za-z0-9_-]{8,64}$/.test(k)) return k;
  if (k) return createHash('sha256').update('visi-catalog-key:' + k).digest('hex').slice(0, 24);
  if (!process.env.BLOB_READ_WRITE_TOKEN && onVercel()) {
    throw new StorageError('CATALOG_KEY is not set (this Blob store uses OIDC, so the key cannot be derived from a token)', { status: 503, error: 'not_configured' });
  }
  var src = 'visi-catalog:' + (process.env.VERCEL_ENV || 'development') + ':' + (process.env.BLOB_READ_WRITE_TOKEN || '');
  return createHash('sha256').update(src).digest('hex').slice(0, 24);
}
export function indexPath() { return 'catalog/' + catalogKey() + '/index.json'; }
// 备份按星期几轮流覆盖（bak/mon.json …）：最多 7 份，不会一年累积几百 MB
export const BAK_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export function bakPath(ts) { return 'catalog/' + catalogKey() + '/bak/' + BAK_DAYS[new Date(ts).getUTCDay()] + '.json'; }

// 公开网址前缀 = 网址去掉 pathname
export function baseOf(url, pathname) {
  if (!url || !pathname) return '';
  var u = String(url).split('?')[0];
  return u.slice(-pathname.length) === pathname ? u.slice(0, u.length - pathname.length) : '';
}

/* ---------- 目前用哪个 adapter ----------
   withAdapter(a, fn)：只在这次请求里用 a（mock server 用；同一个 process 开两个 mock 也不会互相干扰）
   setAdapter(a)：整个 process 都用 a（单元测试用）；都没有就是正式的 @vercel/blob */
var current = null;
var scoped = new AsyncLocalStorage();
export function setAdapter(a) { current = a || null; }
export function withAdapter(a, fn) { return scoped.run(a, fn); }
export function getAdapter() {
  var s = scoped.getStore();
  if (s) return s;
  if (!current) current = realAdapter();
  return current;
}

/* ---------- 正式：@vercel/blob ---------- */
// 每个 SDK 呼叫最多等多久（毫秒）：Blob 出状况时不要一直卡到 function 的上限才回一个不是 JSON 的 504
export const TIMEOUT = { photo: 20000, index: 15000, read: 15000, backup: 5000, del: 20000 };
// 文件写明一次 del() 最多 1,000 个
export const DEL_BATCH = 1000;
// store 被停权（额度用完）时 SDK 的讯息；get() 遇到 403 丢的是普通的 BlobError（「Failed to fetch blob: 403 Forbidden」）
function looksBlocked(e) {
  var m = String((e && e.message) || '');
  return /suspended/i.test(m) || /Failed to fetch blob: 403\b/.test(m);
}
// SDK 预设失败重试 10 次（指数退避，加起来十几分钟）：改成 2 次，其它交给上传页自己重试
const SDK_RETRIES = '2';

function timer(ms) {
  // 不用 AbortSignal.timeout()：它丢的是 TimeoutError，SDK 认不得、会当网路错误一直重试
  var c = new AbortController();
  var t = setTimeout(function () { c.abort(); }, ms);   // 不 unref：等的那一刻也要让 process 活着（用完就清掉）
  return { signal: c.signal, done: function () { clearTimeout(t); } };
}

export function realAdapter(opts) {
  opts = opts || {};
  var load = opts.load || function () { return import('@vercel/blob'); };
  var mod = null;
  var lastUrl = {};
  var self = { kind: 'vercel', base: '' };
  var ms = Object.assign({}, TIMEOUT, opts.timeout || {});
  // SDK 每次呼叫都读这个环境变数
  if (!process.env.VERCEL_BLOB_RETRIES) process.env.VERCEL_BLOB_RETRIES = SDK_RETRIES;

  async function sdk() {
    if (!hasCredentials()) {
      throw new StorageError('No Blob credentials (BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN): connect the Blob store to this Vercel project (Storage → Connect), then redeploy');
    }
    if (!mod) {
      try { mod = await load(); } catch (e) { throw new StorageError('cannot load @vercel/blob: ' + (e && e.message)); }
    }
    return mod;
  }
  function learn(url, pathname) {
    var b = baseOf(url, pathname);
    if (b) self.base = b;
  }
  // SDK 的错误类别是匿名 class（name 都是 'Error'）：看 instanceof、class 名字、name 都行
  function isA(m, e, n) {
    if (!e) return false;
    if (m && typeof m[n] === 'function' && e instanceof m[n]) return true;
    return e.name === n || !!(e.constructor && e.constructor.name === n);
  }
  // 网路断、限流、store 不存在……一律当储存错误，讯息带原因；分成可以重试的（500 / 429）和重试也没用的（503 blocked）
  function wrap(e) {
    if (e && (e.code === 'conflict' || e.code === 'storage')) return e;
    var m = mod;
    var msg = ((e && e.constructor && e.constructor.name !== 'Error' ? e.constructor.name : e && e.name) || 'Error') + ': ' + ((e && e.message) || e);
    var o = {};
    if (isA(m, e, 'BlobServiceRateLimited')) o = { status: 429, error: 'storage_busy', retryAfter: Math.max(1, Math.min(300, +e.retryAfter || 10)) };
    else if (isA(m, e, 'BlobStoreSuspendedError') || isA(m, e, 'BlobAccessError') || isA(m, e, 'BlobStoreNotFoundError') || looksBlocked(e)) o = { status: 503, error: 'storage_blocked' };
    else if (isA(m, e, 'BlobRequestAbortedError') || (e && (e.name === 'AbortError' || e.name === 'TimeoutError'))) o = { status: 503, error: 'storage_timeout' };
    var s = new StorageError(msg, o);
    s.cause = e;
    return s;
  }
  function isConflict(m, e, creating) {
    if (!e) return false;
    if (isA(m, e, 'BlobPreconditionFailedError')) return true;
    // 第一次建立清单时不带 allowOverwrite：另一个人刚好先建好了 → 当成冲突，下一轮改成更新
    // （只认「already exists」：「This store does not exist.」是设定错，不是冲突）
    return !!creating && isExists(e);
  }
  function isExists(e) { return /already exists/i.test(String((e && e.message) || '')); }
  // 呼叫 SDK，最多等 t 毫秒
  async function within(t, fn) {
    var tm = timer(t);
    try { return await fn(tm.signal); } finally { tm.done(); }
  }

  self.getJson = async function (path, o) {
    var m = await sdk();
    var target = path;
    // 公开 store 的 useCache:false 不会绕过 CDN（SDK 只对 private 加 cache=0）；
    // 重试时改用带一次性参数的网址，避免一直读到旧版、白白冲突 5 次
    if (o && o.fresh && lastUrl[path]) target = lastUrl[path] + '?nc=' + Date.now().toString(36) + randomBytes(3).toString('hex');
    var r;
    var text;
    try {
      text = await within(ms.read, async function (signal) {
        r = await m.get(target, { access: 'public', useCache: false, abortSignal: signal });
        if (!r && target !== path) r = await m.get(path, { access: 'public', useCache: false, abortSignal: signal });
        if (!r) return null;
        if (r.statusCode === 403) throw new StorageError('blob status 403 (store suspended?)', { status: 503, error: 'storage_blocked' });
        if (r.statusCode !== 200 || !r.stream) throw new StorageError('unexpected blob status ' + r.statusCode);
        return await new Response(r.stream).text();
      });
    } catch (e) { throw wrap(e); }
    if (!r) return null;
    var url = String(r.blob.url || '').split('?')[0];
    lastUrl[path] = url;
    learn(url, path);
    var data;
    try { data = JSON.parse(text); } catch (e) { throw new StorageError('index is not valid JSON'); }
    return { data: data, etag: r.blob.etag, url: url };
  };

  self.putJson = async function (path, text, o) {
    var m = await sdk();
    o = o || {};
    var options = { access: 'public', addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60 };
    if (o.ifMatch) { options.allowOverwrite = true; options.ifMatch = o.ifMatch; }
    try {
      var r = await within(ms.index, function (signal) { return m.put(path, text, Object.assign({ abortSignal: signal }, options)); });
      learn(r.url, r.pathname);
      lastUrl[path] = r.url;
      return { etag: r.etag, url: r.url, pathname: r.pathname };
    } catch (e) {
      if (isConflict(m, e, !o.ifMatch)) throw new ConflictError();
      throw wrap(e);
    }
  };

  self.putFile = async function (pathname, body, contentType, o) {
    var m = await sdk();
    var fixed = !!(o && o.fixed);
    var r;
    try {
      r = await within(ms.photo, function (signal) {
        return m.put(pathname, body, {
          access: 'public', addRandomSuffix: !fixed, contentType: contentType, cacheControlMaxAge: 31536000, abortSignal: signal
        });
      });
    } catch (e) {
      // 固定路径已经有了（上一次请求写好、清单没登记成）：内容一样，直接用
      if (fixed && isExists(e)) return { url: self.base ? self.base + pathname : '', pathname: pathname, existed: true };
      throw wrap(e);
    }
    learn(r.url, r.pathname);
    return { url: r.url, pathname: r.pathname };
  };

  self.del = async function (pathnames) {
    var m = await sdk();
    var list = (Array.isArray(pathnames) ? pathnames : [pathnames]).filter(Boolean);
    if (!list.length) return;
    if (list.length > DEL_BATCH) throw new StorageError('del: at most ' + DEL_BATCH + ' per call');
    try {
      await within(ms.del, function (signal) { return m.del(list, { abortSignal: signal }); });
    } catch (e) { throw wrap(e); }
  };

  self.copy = async function (from, to) {
    var m = await sdk();
    try {
      return await within(ms.backup, function (signal) {
        return m.copy(from, to, { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60, abortSignal: signal });
      });
    } catch (e) { throw wrap(e); }
  };

  return self;
}

/* ---------- 测试：全部放记忆体 ---------- */
export function memoryAdapter(opts) {
  opts = opts || {};
  var store = new Map(); // pathname → {body:Buffer, type, etag}
  var failPuts = 0, failGets = 0, conflicts = 0, blocked = false;
  var counts = { puts: 0, gets: 0, copies: 0, conflicts: 0, failedPuts: 0, failedGets: 0, dels: 0, deleted: 0 };
  var seq = 0;
  // 先让出一轮：两个同时进来的 mutate 会读到同一个版本，才测得到冲突
  var tick = function () { return new Promise(function (r) { setImmediate(r); }); };

  function etagOf(buf) { return '"' + createHash('sha256').update(buf).update(String(++seq)).digest('hex').slice(0, 16) + '"'; }
  function suffix() {
    var s = randomBytes(24).toString('base64').replace(/[^A-Za-z0-9]/g, '');
    return s.slice(0, 21);
  }
  function withSuffix(pathname) {
    var dot = pathname.lastIndexOf('.');
    return dot > pathname.lastIndexOf('/') ? pathname.slice(0, dot) + '-' + suffix() + pathname.slice(dot) : pathname + '-' + suffix();
  }
  function checkFail() {
    checkBlocked();
    if (failPuts > 0) { failPuts--; counts.failedPuts++; throw new StorageError('injected put failure'); }
  }
  // 假装 store 被停权：每个操作都跟正式的一样回 503 storage_blocked
  function checkBlocked() {
    if (blocked) throw new StorageError('BlobStoreSuspendedError: Vercel Blob: This store has been suspended.', { status: 503, error: 'storage_blocked' });
  }

  var self = {
    kind: 'memory',
    base: opts.base || 'http://127.0.0.1/',
    store: store,

    getJson: async function (path) {
      await tick();
      checkBlocked();
      if (failGets > 0) { failGets--; counts.failedGets++; throw new StorageError('injected get failure'); }
      counts.gets++;
      var b = store.get(path);
      if (!b) return null;
      return { data: JSON.parse(b.body.toString('utf8')), etag: b.etag, url: self.base + path };
    },

    putJson: async function (path, text, o) {
      await tick();
      o = o || {};
      checkFail();
      if (conflicts > 0) { conflicts--; counts.conflicts++; throw new ConflictError(); }
      var cur = store.get(path);
      if (o.ifMatch ? (!cur || cur.etag !== o.ifMatch) : !!cur) { counts.conflicts++; throw new ConflictError(); }
      var body = Buffer.from(text, 'utf8');
      var etag = etagOf(body);
      store.set(path, { body: body, type: 'application/json', etag: etag });
      counts.puts++;
      return { etag: etag, url: self.base + path, pathname: path };
    },

    putFile: async function (pathname, body, contentType, o) {
      await tick();
      checkFail();
      var fixed = !!(o && o.fixed);
      if (fixed && store.has(pathname)) return { url: self.base + pathname, pathname: pathname, existed: true };
      var p = fixed ? pathname : withSuffix(pathname);
      var buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
      store.set(p, { body: buf, type: contentType || 'application/octet-stream', etag: etagOf(buf) });
      counts.puts++;
      return { url: self.base + p, pathname: p };
    },

    copy: async function (from, to) {
      await tick();
      checkBlocked();
      var b = store.get(from);
      if (!b) throw new StorageError('copy: source not found');
      store.set(to, { body: Buffer.from(b.body), type: b.type, etag: etagOf(b.body) });
      counts.copies++;
      return { url: self.base + to, pathname: to };
    },

    del: async function (pathnames) {
      await tick();
      var list = (Array.isArray(pathnames) ? pathnames : [pathnames]).filter(Boolean);
      if (list.length > DEL_BATCH) throw new StorageError('del: at most ' + DEL_BATCH + ' per call');
      checkFail();
      counts.dels++;
      list.forEach(function (p) { if (store.delete(p)) counts.deleted++; });
    },

    // 读一个 blob（mock server 的 blob port 用）
    read: function (pathname) { return store.get(pathname) || null; },
    // 所有档的总大小（测试拿来跟清单算的总储存量比）
    bytes: function () { var n = 0; store.forEach(function (b) { n += b.body.length; }); return n; },

    // 测试钩子
    failNextPut: function (n) { failPuts = n == null ? 1 : n; },
    failNextGet: function (n) { failGets = n == null ? 1 : n; },
    conflictNext: function (n) { conflicts = n == null ? 1 : n; },
    setBlocked: function (on) { blocked = !!on; },
    isBlocked: function () { return blocked; },
    stats: function () { return Object.assign({}, counts); },
    resetStats: function () { Object.keys(counts).forEach(function (k) { counts[k] = 0; }); },

    // 放进现成的资料：{index, blobs:{pathname: base64}}（VISI 测试用的假案例库）
    seed: function (data) {
      data = data || {};
      Object.keys(data.blobs || {}).forEach(function (p) {
        var buf = Buffer.from(String(data.blobs[p]), 'base64');
        store.set(p, { body: buf, type: typeOf(p), etag: etagOf(buf) });
      });
      if (data.index) {
        var idx = JSON.parse(JSON.stringify(data.index));
        idx.base = self.base;
        var text = Buffer.from(JSON.stringify(idx), 'utf8');
        store.set(opts.indexPath || indexPath(), { body: text, type: 'application/json', etag: etagOf(text) });
      }
    }
  };
  return self;
}

export function typeOf(p) {
  var ext = String(p).toLowerCase().split('.').pop();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', json: 'application/json' }[ext] || 'application/octet-stream';
}
