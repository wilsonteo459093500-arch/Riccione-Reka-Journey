/* ============================================================
   案例库 API · HTTP 小工具
   ------------------------------------------------------------
   只用 req 的 stream / headers / url / method 和 res 的
   statusCode / setHeader / end：Vercel 的 Node runtime 和本地的 node:http
   （tools/caselib/mock-server.mjs）都能跑，不靠 req.body / res.json。
   ============================================================ */

// 抛出去由 handler 统一回应的错误：status + JSON 内容
export class HttpError extends Error {
  constructor(status, body) {
    super((body && body.error) || 'http_' + status);
    this.status = status;
    this.body = body || { error: 'http_' + status };
  }
}

// 超过上限后不再存，但继续读到底：直接断线的话，客户端常常收不到 413 而是连线错误
const HARD_LIMIT = 64 * 1024 * 1024;

export function readRaw(req, limit) {
  return new Promise(function (resolve, reject) {
    // 平台已经读完（极少数情况）：用它留下的内容（Buffer、字串，或已解析的 JSON 物件）
    if (req.readableEnded) {
      var pre = null;
      try {
        pre = req.rawBody || req.body || null;
        if (pre && !Buffer.isBuffer(pre) && typeof pre === 'object') pre = JSON.stringify(pre);
      } catch (e) { pre = null; }
      var buf = pre ? Buffer.from(pre) : Buffer.alloc(0);
      if (buf.length > limit) reject(new HttpError(413, { error: 'too_large' }));
      else resolve(buf);
      return;
    }
    var declared = Number(req.headers && req.headers['content-length']);
    var over = Number.isFinite(declared) && declared > limit;
    var size = 0;
    var chunks = [];
    var done = false;
    function finish(err, val) {
      if (done) return;
      done = true;
      if (err) reject(err); else resolve(val);
    }
    req.on('data', function (c) {
      size += c.length;
      if (size > limit) over = true;
      if (!over) chunks.push(c);
      else chunks = [];
      if (size > HARD_LIMIT) req.destroy();
    });
    req.on('end', function () {
      if (over) finish(new HttpError(413, { error: 'too_large' }));
      else finish(null, Buffer.concat(chunks));
    });
    req.on('error', function (e) { finish(over ? new HttpError(413, { error: 'too_large' }) : e); });
    // 客户端中途断线：不要让 handler 一直等下去
    req.on('close', function () {
      finish(over ? new HttpError(413, { error: 'too_large' }) : new HttpError(400, { error: 'aborted' }));
    });
  });
}

export async function readJson(req, limit) {
  var buf = await readRaw(req, limit);
  if (!buf.length) throw new HttpError(400, { error: 'json' });
  try {
    var v = JSON.parse(buf.toString('utf8'));
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
    return v;
  } catch (e) {
    throw new HttpError(400, { error: 'json' });
  }
}

// 一律 no-store：清单和登入状态都不能被任何快取留住
export function send(res, status, body, headers) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (headers) Object.keys(headers).forEach(function (k) { res.setHeader(k, headers[k]); });
  if (status === 304) { res.end(); return; }
  res.end(JSON.stringify(body == null ? {} : body));
}

export function header(req, name) {
  var v = req.headers ? req.headers[name.toLowerCase()] : undefined;
  return Array.isArray(v) ? v[0] : v;
}

export function query(req) {
  return new URL(req.url || '/', 'http://x').searchParams;
}

// 写入一定要有 X-VISI: 1（跨站的表单送不出自订 header）；有 Origin 的话必须是同一个网站（挡 CSRF）
export function checkWrite(req) {
  if (header(req, 'x-visi') !== '1') throw new HttpError(403, { error: 'cross_site' });
  var origin = header(req, 'origin');
  if (origin != null && origin !== '') {
    var host = String(header(req, 'host') || '').toLowerCase();
    var oh = '';
    try { oh = new URL(origin).host.toLowerCase(); } catch (e) { oh = ''; }
    if (!oh || oh !== host) throw new HttpError(403, { error: 'cross_site' });
  }
}

// 本机测试（http://localhost、127.0.0.1）的 cookie 不能带 Secure
export function isLocalHost(req) {
  var host = String(header(req, 'host') || '').toLowerCase();
  var name = host.replace(/:\d+$/, '');
  return name === 'localhost' || name === '127.0.0.1' || name === '[::1]';
}

export function getCookie(req, name) {
  var raw = String(header(req, 'cookie') || '');
  var parts = raw.split(';');
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    var eq = p.indexOf('=');
    if (eq > 0 && p.slice(0, eq) === name) return p.slice(eq + 1);
  }
  return '';
}

export function methodNotAllowed(res, allow) {
  send(res, 405, { error: 'method' }, { Allow: allow });
}

// handler 最外层的 catch：已知错误照原样回，储存出错给清楚的讯息，其它只回 server
export function sendError(res, e) {
  if (e instanceof HttpError) return send(res, e.status, e.body);
  if (e && e.code === 'conflict') return send(res, 409, { error: 'conflict' });
  if (e && (e.code === 'storage' || /^Blob/.test(String(e.name || '')) || /^Blob/.test(String(e.constructor && e.constructor.name)))) {
    console.error('[caselib] storage:', e && e.message);
    return send(res, 500, { error: 'storage', message: String((e && e.message) || 'storage error').slice(0, 300) });
  }
  console.error('[caselib] server:', e && (e.stack || e.message || e));
  return send(res, 500, { error: 'server' });
}
