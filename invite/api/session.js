/* ============================================================
   /api/session —— 案例库的登入
   GET    → {name} | 401
   POST   {name, password} → 设 cookie，{name}
   DELETE → 登出
   ============================================================ */
import { send, sendError, readJson, checkWrite, methodNotAllowed, HttpError } from './_lib/http.js';
import { requireConfigured, requireUser, cleanName, checkPassword, signSession, sessionCookie, clearCookie, MAX_AGE } from './_lib/auth.js';

// 密码错要慢一点回：一个一个猜太慢，不值得
const WRONG_DELAY = 700;

export default async function handler(req, res) {
  try {
    requireConfigured();
    if (req.method === 'GET') {
      return send(res, 200, { name: requireUser(req) });
    }
    if (req.method === 'POST') {
      checkWrite(req);
      var body = await readJson(req, 16 * 1024);
      var name = cleanName(body.name);
      if (!name) throw new HttpError(400, { error: 'name' });
      if (!checkPassword(body.password)) {
        await new Promise(function (r) { setTimeout(r, WRONG_DELAY); });
        throw new HttpError(401, { error: 'password' });
      }
      var token = signSession({ n: name, exp: Date.now() + MAX_AGE * 1000 });
      return send(res, 200, { name: name }, { 'Set-Cookie': sessionCookie(req, token) });
    }
    if (req.method === 'DELETE') {
      checkWrite(req);
      return send(res, 200, {}, { 'Set-Cookie': clearCookie(req) });
    }
    return methodNotAllowed(res, 'GET, POST, DELETE');
  } catch (e) {
    return sendError(res, e);
  }
}
