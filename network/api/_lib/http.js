/* ============================================================
   人脉 App · API 小工具
   Vercel Node 函数和本机 vite 中间件共用（req/res 是 Node 的 http 物件，
   Vercel 会多给 res.status().json()；本机的 shim 也给）。
   ============================================================ */

export class HttpError extends Error {
  constructor(status, body) {
    super(typeof body === 'string' ? body : (body && body.error) || 'error');
    this.status = status;
    this.body = typeof body === 'string' ? { error: body } : body;
  }
}

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export function sendError(res, e) {
  if (e instanceof HttpError) return send(res, e.status, e.body);
  console.error('[network api]', e);
  return send(res, 500, { error: 'server_error', message: String((e && e.message) || e).slice(0, 300) });
}

// Vercel 已经把 JSON body 解析好放在 req.body；本机中间件也会先解析好
export async function readJson(req, limitBytes = 6 * 1024 * 1024) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limitBytes) throw new HttpError(413, { error: 'too_large' });
    chunks.push(c);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try { return text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, { error: 'bad_json' }); }
}

export function header(req, name) {
  const v = req.headers && req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

// 一个 POST 端点的外壳：方法检查 → 登入检查 → handler → 统一错误格式
export function postHandler(fn) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    try {
      const body = await readJson(req);
      const out = await fn(req, body);
      return send(res, 200, out);
    } catch (e) {
      return sendError(res, e);
    }
  };
}

// 给使用者看的字串：去掉控制字元、截长度
export function cleanText(s, max = 2000) {
  if (s == null) return '';
  return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max);
}
