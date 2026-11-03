/* ============================================================
   /api/session —— 案例库的登入
   GET    → {name} | 401
   POST   {name, password} → 设 cookie，{name}
          密码错太多次（同一个 IP 10 分钟 5 次、全部 10 分钟 30 次）→ 429 {error:'slow_down', retryAfter}
   DELETE → 登出
   ============================================================ */
import { send, sendError, readJson, checkWrite, methodNotAllowed, header, HttpError } from './_lib/http.js';
import { requireConfigured, requireUser, cleanName, checkPassword, signSession, sessionCookie, clearCookie, MAX_AGE } from './_lib/auth.js';

// 密码错要慢一点回：同一个连线一个一个猜太慢
const WRONG_DELAY = 700;

/* ---------- 猜密码的上限 ----------
   700 ms 只挡得住一个连线；同时开 100 个连线一样一秒猜上百次。
   所以另外数「最近 10 分钟错了几次」：每个 IP 一份、全部加起来一份，到了就先回 429，连密码都不比。
   放在记忆体（不花 Blob 写入）；Vercel 多开几个 instance 各数各的，照样把速度压到每天几千次以下。
   全部的上限会顺便挡住所有人新登入 10 分钟 —— 已登入的 cookie（30 天）不受影响 */
export const LIMIT_WINDOW = 10 * 60 * 1000;
export const LIMIT_PER_IP = 5;
export const LIMIT_ALL = 30;
var fails = { ip: new Map(), all: [] };

function clientIp(req) {
  // Vercel 会覆写这两个 header（客户端自己塞的不算数）；本机测试就看连线的位址
  var real = header(req, 'x-real-ip');
  if (real) return String(real).trim().slice(0, 64);
  var fwd = header(req, 'x-forwarded-for');
  if (fwd) return String(fwd).split(',')[0].trim().slice(0, 64);
  return String((req.socket && req.socket.remoteAddress) || '?');
}
function prune(list, now) {
  while (list.length && list[0] <= now - LIMIT_WINDOW) list.shift();
  return list;
}
// 还要等几秒（0 = 可以试）
function waitFor(ip, now) {
  var all = prune(fails.all, now);
  var mine = fails.ip.get(ip);
  if (mine) { prune(mine, now); if (!mine.length) fails.ip.delete(ip); }
  var until = 0;
  if (mine && mine.length >= LIMIT_PER_IP) until = Math.max(until, mine[mine.length - LIMIT_PER_IP] + LIMIT_WINDOW);
  if (all.length >= LIMIT_ALL) until = Math.max(until, all[all.length - LIMIT_ALL] + LIMIT_WINDOW);
  return until > now ? Math.ceil((until - now) / 1000) : 0;
}
function recordFail(ip, now) {
  fails.all.push(now);
  if (fails.all.length > LIMIT_ALL * 4) fails.all = fails.all.slice(-LIMIT_ALL * 2);
  var mine = fails.ip.get(ip);
  if (!mine) {
    // 一直换 IP 来猜：Map 不能无限长（全部的上限本来就会先挡下）
    if (fails.ip.size > 5000) fails.ip.clear();
    fails.ip.set(ip, mine = []);
  }
  mine.push(now);
  if (mine.length > LIMIT_PER_IP * 2) mine.splice(0, mine.length - LIMIT_PER_IP * 2);
}
/** 测试用：清掉计数 */
export function resetLoginLimiter() { fails = { ip: new Map(), all: [] }; }

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
      var ip = clientIp(req);
      var wait = waitFor(ip, Date.now());
      if (wait) return send(res, 429, { error: 'slow_down', retryAfter: wait }, { 'Retry-After': String(wait) });
      if (!checkPassword(body.password)) {
        recordFail(ip, Date.now());
        await new Promise(function (r) { setTimeout(r, WRONG_DELAY); });
        throw new HttpError(401, { error: 'password' });
      }
      fails.ip.delete(ip);
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
