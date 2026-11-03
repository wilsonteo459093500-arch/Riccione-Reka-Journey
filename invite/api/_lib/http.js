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

// 平台先读过的内容：Buffer / 字串照用；已解析的 JSON 物件转回字串；其它（例：image/jpeg 的 req.body 是 undefined）→ null
function preRead(req) {
  try {
    var raw = req.rawBody;
    if (Buffer.isBuffer(raw) || typeof raw === 'string') return Buffer.from(raw);
    var b = req.body;
    if (Buffer.isBuffer(b) || typeof b === 'string') return Buffer.from(b);
    if (b && typeof b === 'object' && !(b instanceof Uint8Array)) return Buffer.from(JSON.stringify(b));
  } catch (e) { /* 平台的 JSON 解析失败 → 改读 stream，readJson 会回 400 */ }
  return null;
}

export function readRaw(req, limit) {
  return new Promise(function (resolve, reject) {
    // Vercel 的 Node runtime（helpers 预设开着）会先把 body 读完：原本的 stream 已经结束，
    // 内容放在 req.body（只解析 json / text / octet-stream；image/jpeg 是 undefined），
    // 'data' / 'end' 再从它的 PassThrough 重播一次。先用读好的，没有就照常读（会拿到重播）
    var ended = !!req.readableEnded;
    if (ended) {
      var pre = preRead(req);
      if (pre) {
        if (pre.length > limit) reject(new HttpError(413, { error: 'too_large' }));
        else resolve(pre);
        return;
      }
    }
    var declared = Number(req.headers && req.headers['content-length']);
    var over = Number.isFinite(declared) && declared > limit;
    var size = 0;
    var chunks = [];
    var done = false, idle = 0;
    function finish(err, val) {
      if (done) return;
      done = true;
      if (idle) clearTimeout(idle);
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
    if (ended) {
      // 原本的 stream 早就关了（不会再有 'close'）：重播通常下一轮就到；一直没来 = 真的没有内容
      idle = setTimeout(function () { finish(null, Buffer.alloc(0)); }, 1500);
      return;
    }
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
    // 429 限流带 Retry-After；503 storage_blocked（store 停了、没权限）上传页会整个停下来，不再一张一张重试
    var st = e.code === 'storage' && (e.status === 429 || e.status === 503) ? e.status : 500;
    var body = { error: e.code === 'storage' && e.error ? e.error : 'storage', message: String((e && e.message) || 'storage error').slice(0, 300) };
    var extra = null;
    if (st === 429 && e.retryAfter) { body.retryAfter = e.retryAfter; extra = { 'Retry-After': String(e.retryAfter) }; }
    return send(res, st, body, extra);
  }
  console.error('[caselib] server:', e && (e.stack || e.message || e));
  return send(res, 500, { error: 'server' });
}
