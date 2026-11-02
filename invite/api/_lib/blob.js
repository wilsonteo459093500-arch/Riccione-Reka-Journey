/* ============================================================
   案例库 API · 储存（Vercel Blob）
   ------------------------------------------------------------
   handler 只透过 adapter 存取，不直接碰 @vercel/blob：
     getJson(path, {fresh}) → {data, etag, url} | null
     putJson(path, text, {ifMatch} | {create:true}) → {etag, url, pathname}
       冲突（别人先写了）一律丢 code:'conflict' 的错误，mutate 会重读重试
     putFile(pathname, body, contentType) → {url, pathname}（加随机后缀、快取一年）
     copy(from, to) → 每日备份用
     base → 公开网址前缀（学到之后才有）
   正式环境：realAdapter()，用到才 import('@vercel/blob')（没装、没 token 也不会一载入就坏）。
   测试 / 本机：memoryAdapter()，可以人为制造写入失败和冲突。
   ============================================================ */
import { createHash, randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

export class ConflictError extends Error {
  constructor() { super('index changed by someone else'); this.code = 'conflict'; this.name = 'ConflictError'; }
}
export class StorageError extends Error {
  constructor(msg) { super(msg); this.code = 'storage'; this.name = 'StorageError'; }
}

/* ---------- 清单路径：key 由 token 推出，Preview 和 Production 自动分开 ---------- */
export function catalogKey() {
  var k = process.env.CATALOG_KEY;
  if (k && /^[A-Za-z0-9_-]{8,64}$/.test(k)) return k;
  if (k) return createHash('sha256').update('visi-catalog-key:' + k).digest('hex').slice(0, 24);
  var src = 'visi-catalog:' + (process.env.VERCEL_ENV || 'development') + ':' + (process.env.BLOB_READ_WRITE_TOKEN || '');
  return createHash('sha256').update(src).digest('hex').slice(0, 24);
}
export function indexPath() { return 'catalog/' + catalogKey() + '/index.json'; }
export function bakPath(day) { return 'catalog/' + catalogKey() + '/bak/' + day + '.json'; }

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
export function realAdapter(opts) {
  opts = opts || {};
  var load = opts.load || function () { return import('@vercel/blob'); };
  var mod = null;
  var lastUrl = {};
  var self = { kind: 'vercel', base: '' };

  async function sdk() {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new StorageError('BLOB_READ_WRITE_TOKEN is not set: connect the Blob store to this Vercel project (Storage → Connect), then redeploy');
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
  // 网路断、限流、store 不存在……一律当储存错误（handler 回 500 storage，讯息带原因）
  function wrap(e) {
    if (e && (e.code === 'conflict' || e.code === 'storage')) return e;
    var s = new StorageError(((e && e.name) || 'Error') + ': ' + ((e && e.message) || e));
    s.cause = e;
    return s;
  }
  function isConflict(m, e, creating) {
    if (!e) return false;
    if ((m.BlobPreconditionFailedError && e instanceof m.BlobPreconditionFailedError) || e.name === 'BlobPreconditionFailedError') return true;
    // 第一次建立清单时不带 allowOverwrite：另一个人刚好先建好了 → 当成冲突，下一轮改成更新
    return !!creating && /exist/i.test(String(e.message || ''));
  }

  self.getJson = async function (path, o) {
    var m = await sdk();
    var target = path;
    // 公开 store 的 useCache:false 不会绕过 CDN（SDK 只对 private 加 cache=0）；
    // 重试时改用带一次性参数的网址，避免一直读到旧版、白白冲突 5 次
    if (o && o.fresh && lastUrl[path]) target = lastUrl[path] + '?nc=' + Date.now().toString(36) + randomBytes(3).toString('hex');
    var r;
    try {
      r = await m.get(target, { access: 'public', useCache: false });
      if (!r && target !== path) r = await m.get(path, { access: 'public', useCache: false });
    } catch (e) { throw wrap(e); }
    if (!r) return null;
    if (r.statusCode !== 200 || !r.stream) throw new StorageError('unexpected blob status ' + r.statusCode);
    var text;
    try { text = await new Response(r.stream).text(); } catch (e) { throw wrap(e); }
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
      var r = await m.put(path, text, options);
      learn(r.url, r.pathname);
      lastUrl[path] = r.url;
      return { etag: r.etag, url: r.url, pathname: r.pathname };
    } catch (e) {
      if (isConflict(m, e, !o.ifMatch)) throw new ConflictError();
      throw wrap(e);
    }
  };

  self.putFile = async function (pathname, body, contentType) {
    var m = await sdk();
    var r;
    try {
      r = await m.put(pathname, body, {
        access: 'public', addRandomSuffix: true, contentType: contentType, cacheControlMaxAge: 31536000
      });
    } catch (e) { throw wrap(e); }
    learn(r.url, r.pathname);
    return { url: r.url, pathname: r.pathname };
  };

  self.copy = async function (from, to) {
    var m = await sdk();
    try {
      return await m.copy(from, to, { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60 });
    } catch (e) { throw wrap(e); }
  };

  return self;
}

/* ---------- 测试：全部放记忆体 ---------- */
export function memoryAdapter(opts) {
  opts = opts || {};
  var store = new Map(); // pathname → {body:Buffer, type, etag}
  var failPuts = 0, failGets = 0, conflicts = 0;
  var counts = { puts: 0, gets: 0, copies: 0, conflicts: 0, failedPuts: 0, failedGets: 0 };
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
    if (failPuts > 0) { failPuts--; counts.failedPuts++; throw new StorageError('injected put failure'); }
  }

  var self = {
    kind: 'memory',
    base: opts.base || 'http://127.0.0.1/',
    store: store,

    getJson: async function (path) {
      await tick();
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

    putFile: async function (pathname, body, contentType) {
      await tick();
      checkFail();
      var p = withSuffix(pathname);
      var buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
      store.set(p, { body: buf, type: contentType || 'application/octet-stream', etag: etagOf(buf) });
      counts.puts++;
      return { url: self.base + p, pathname: p };
    },

    copy: async function (from, to) {
      await tick();
      var b = store.get(from);
      if (!b) throw new StorageError('copy: source not found');
      store.set(to, { body: Buffer.from(b.body), type: b.type, etag: etagOf(b.body) });
      counts.copies++;
      return { url: self.base + to, pathname: to };
    },

    // 读一个 blob（mock server 的 blob port 用）
    read: function (pathname) { return store.get(pathname) || null; },

    // 测试钩子
    failNextPut: function (n) { failPuts = n == null ? 1 : n; },
    failNextGet: function (n) { failGets = n == null ? 1 : n; },
    conflictNext: function (n) { conflicts = n == null ? 1 : n; },
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
