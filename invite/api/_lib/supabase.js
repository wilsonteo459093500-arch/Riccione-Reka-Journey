/* ============================================================
   案例库 API · 储存（Supabase）
   ------------------------------------------------------------
   跟 blob.js 的 realAdapter() 同一个接口（handler 不用改）：
     getJson / putJson({ifMatch}|{create}) / putFile({fixed}) / copy / del / base
   放在哪里：
     - 照片、缩图包 → Storage 的公开 bucket（预设 visi-cases）：路径带随机字串，跟 Blob 一样猜不到；
       VISI 的 <img>、PPTX 直接用公开网址
     - 清单（有项目名 = 客户名字）和每日备份 → 资料表 visi_catalog（RLS 打开、没有任何 policy：
       只有伺服器的 service role key 读写得到，网址拿到也读不到）
       「别人先改了」：每一笔有 rev，更新时带 rev=eq.<旧的>，改到 0 笔 = 冲突（mutate 会重读重试）
   设定（Vercel 环境变数）：SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY（或新的 sb_secret_ 金钥），
     选填 SUPABASE_CASES_BUCKET（预设 visi-cases）。建表脚本：invite/supabase/visi_cases.sql
   只用 fetch，不加套件。
   ============================================================ */
import { randomBytes } from 'node:crypto';
import { ConflictError, StorageError, TIMEOUT, DEL_BATCH } from './blob.js';

export const TABLE = 'visi_catalog';
export const DEFAULT_BUCKET = 'visi-cases';

export function supabaseConfigured(env) {
  env = env || process.env;
  return !!(env.SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY));
}

function suffix() {
  return randomBytes(24).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 21);
}
function withSuffix(pathname) {
  var dot = pathname.lastIndexOf('.');
  return dot > pathname.lastIndexOf('/') ? pathname.slice(0, dot) + '-' + suffix() + pathname.slice(dot) : pathname + '-' + suffix();
}
// 路径每一段都编码（斜线保留）
function encPath(p) { return String(p).split('/').map(encodeURIComponent).join('/'); }

export function supabaseAdapter(opts) {
  opts = opts || {};
  var env = opts.env || process.env;
  var fetchImpl = opts.fetch || fetch;
  var url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  var key = String(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || '');
  var bucket = String(env.SUPABASE_CASES_BUCKET || DEFAULT_BUCKET);
  var ms = Object.assign({}, TIMEOUT, opts.timeout || {});
  var self = { kind: 'supabase', base: url ? url + '/storage/v1/object/public/' + encodeURIComponent(bucket) + '/' : '' };

  function headers(extra) {
    var h = { apikey: key };
    // 旧的 service_role 是 JWT，要再放 Authorization；新的 sb_secret_ 金钥只放 apikey
    if (!/^sb_/.test(key)) h.Authorization = 'Bearer ' + key;
    return Object.assign(h, extra || {});
  }
  function need() {
    if (!url || !key) throw new StorageError('Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)', { status: 503, error: 'not_configured' });
  }
  // 打一次 REST，最多等 t 毫秒；回 {status, json, text}
  async function call(t, method, path, o) {
    need();
    o = o || {};
    var c = new AbortController();
    var tm = setTimeout(function () { c.abort(); }, t);
    var r;
    try {
      r = await fetchImpl(url + path, { method: method, headers: headers(o.headers), body: o.body, signal: c.signal });
    } catch (e) {
      var aborted = e && (e.name === 'AbortError' || e.name === 'TimeoutError');
      var s = new StorageError('supabase ' + method + ' ' + path.split('?')[0] + ': ' + ((e && e.message) || e), aborted ? { status: 503, error: 'storage_timeout' } : {});
      s.cause = e;
      throw s;
    } finally { clearTimeout(tm); }
    var text = await r.text();
    var json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
    return { status: r.status, json: json, text: text, retryAfter: +(r.headers && r.headers.get && r.headers.get('retry-after')) || 0 };
  }
  // 错误 → StorageError（跟 Blob 的分法一样：可以重试的 500 / 429，重试也没用的 503 blocked）
  function fail(what, r) {
    var msg = (r.json && (r.json.message || r.json.error || r.json.msg)) || String(r.text || '').slice(0, 200);
    var o = {};
    if (r.status === 429) o = { status: 429, error: 'storage_busy', retryAfter: Math.max(1, Math.min(300, r.retryAfter || 10)) };
    // 金钥不对、没权限、bucket / 资料表不存在、空间满了（免费方案超过额度）：重试也没用
    else if (r.status === 401 || r.status === 403 || r.status === 404 || r.status === 413 || /quota|exceed|not found|does not exist/i.test(msg)) o = { status: 503, error: 'storage_blocked' };
    return new StorageError('supabase ' + what + ' ' + r.status + ': ' + msg, o);
  }

  /* ---------- 清单（资料表）---------- */
  function rowPath(path, extra) {
    return '/rest/v1/' + TABLE + '?path=eq.' + encodeURIComponent(path) + (extra || '');
  }
  self.getJson = async function (path) {
    var r = await call(ms.read, 'GET', rowPath(path, '&select=body,rev'), { headers: { Accept: 'application/json' } });
    if (r.status !== 200 || !Array.isArray(r.json)) throw fail('get ' + path, r);
    if (!r.json.length) return null;
    var row = r.json[0];
    var data;
    try { data = JSON.parse(row.body); } catch (e) { throw new StorageError('index is not valid JSON'); }
    return { data: data, etag: String(row.rev), url: '' };
  };

  self.putJson = async function (path, text, o) {
    o = o || {};
    var now = new Date().toISOString();
    var r;
    if (o.ifMatch) {
      var rev = Number(o.ifMatch);
      if (!Number.isFinite(rev)) throw new ConflictError();
      r = await call(ms.index, 'PATCH', rowPath(path, '&rev=eq.' + rev), {
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation', Accept: 'application/json' },
        body: JSON.stringify({ body: text, rev: rev + 1, updated_at: now })
      });
      if (r.status !== 200 || !Array.isArray(r.json)) throw fail('put ' + path, r);
      if (!r.json.length) throw new ConflictError();       // 别人先改了（rev 已经不是这个）
      return { etag: String(rev + 1), url: '', pathname: path };
    }
    // 第一次建立：已经有了（另一个人刚好先建好）→ 冲突，下一轮改成更新
    r = await call(ms.index, 'POST', '/rest/v1/' + TABLE, {
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ path: path, body: text, rev: 1, updated_at: now })
    });
    if (r.status === 409) throw new ConflictError();
    if (r.status !== 201 && r.status !== 200 && r.status !== 204) throw fail('create ' + path, r);
    return { etag: '1', url: '', pathname: path };
  };

  // 每日备份：同一张表，另一个 path（按星期几轮流覆盖）
  self.copy = async function (from, to) {
    var cur = await self.getJson(from);
    if (!cur) throw new StorageError('copy: source not found');
    var r = await call(ms.backup, 'POST', '/rest/v1/' + TABLE + '?on_conflict=path', {
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ path: to, body: JSON.stringify(cur.data), rev: 1, updated_at: new Date().toISOString() })
    });
    if (r.status !== 201 && r.status !== 200 && r.status !== 204) throw fail('copy ' + to, r);
    return { url: '', pathname: to };
  };

  /* ---------- 照片、缩图包（Storage）---------- */
  self.putFile = async function (pathname, body, contentType, o) {
    var fixed = !!(o && o.fixed);
    var p = fixed ? pathname : withSuffix(pathname);
    var r = await call(ms.photo, 'POST', '/storage/v1/object/' + encodeURIComponent(bucket) + '/' + encPath(p), {
      headers: { 'Content-Type': contentType || 'application/octet-stream', 'cache-control': 'max-age=31536000', 'x-upsert': 'false' },
      body: body
    });
    if (r.status === 200 || r.status === 201) return { url: self.base + encPath(p), pathname: p };
    // 固定路径已经有了（上一次请求写好、清单没登记成）：内容一样，直接用
    var dup = r.status === 409 || (r.json && (String(r.json.statusCode) === '409' || /duplicate|already exists/i.test(String(r.json.error || r.json.message || ''))));
    if (fixed && dup) return { url: self.base + encPath(p), pathname: p, existed: true };
    throw fail('upload ' + p, r);
  };

  self.del = async function (pathnames) {
    var list = (Array.isArray(pathnames) ? pathnames : [pathnames]).filter(Boolean);
    if (!list.length) return;
    if (list.length > DEL_BATCH) throw new StorageError('del: at most ' + DEL_BATCH + ' per call');
    var r = await call(ms.del, 'DELETE', '/storage/v1/object/' + encodeURIComponent(bucket), {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: list })
    });
    if (r.status !== 200) throw fail('delete', r);
  };

  return self;
}
