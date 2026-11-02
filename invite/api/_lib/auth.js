/* ============================================================
   案例库 API · 登入
   ------------------------------------------------------------
   全公司一个团队密码（Vercel 环境变数 VISI_TEAM_PASSWORD，老板自己设）。
   登入后 cookie visi_s = base64url(JSON{n, exp}) . base64url(HMAC)。
   HMAC 的 key = SECRET + ':' + sha256(团队密码)：老板换密码，全员自动登出。
   SECRET 没另外设的话，从 BLOB_READ_WRITE_TOKEN 推出来（不必多一个环境变数）。
   ============================================================ */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError, getCookie, isLocalHost } from './http.js';

export const COOKIE = 'visi_s';
export const MAX_AGE = 30 * 24 * 3600; // 30 天（秒）

function sha256(s) { return createHash('sha256').update(String(s), 'utf8').digest(); }

export function teamPassword() { return process.env.VISI_TEAM_PASSWORD || ''; }
export function configured() { return !!teamPassword(); }

export function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  var token = process.env.BLOB_READ_WRITE_TOKEN || '';
  // 两个都没有只会是本机测试；key 里还有密码的杂凑，没有密码照样伪造不了
  return createHmac('sha256', token || 'visi-dev-only').update('visi-session').digest('hex');
}

function sessionKey() { return secret() + ':' + sha256(teamPassword()).toString('hex'); }

// 名字：去掉控制字元（含双向文字控制），空白合并，1–30 个字
export function cleanName(s) {
  if (typeof s !== 'string') return '';
  var t = s.normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  var len = Array.from(t).length;
  return len >= 1 && len <= 30 ? t : '';
}

// 两边都先 sha256 成一样长再比，不会从耗时猜出密码长度
export function checkPassword(pw) {
  var want = teamPassword();
  if (!want || typeof pw !== 'string') return false;
  return timingSafeEqual(sha256(pw), sha256(want));
}

export function signSession(payload) {
  var p = Buffer.from(JSON.stringify({ n: payload.n, exp: payload.exp }), 'utf8').toString('base64url');
  var s = createHmac('sha256', sessionKey()).update(p).digest('base64url');
  return p + '.' + s;
}

export function verifySession(token, now) {
  if (!configured() || typeof token !== 'string' || !token || token.length > 1000) return null;
  var i = token.indexOf('.');
  if (i < 1) return null;
  var p = token.slice(0, i);
  var got = Buffer.from(token.slice(i + 1), 'base64url');
  var want = createHmac('sha256', sessionKey()).update(p).digest();
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  var o;
  try { o = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); } catch (e) { return null; }
  if (!o || typeof o.exp !== 'number' || o.exp <= (now == null ? Date.now() : now)) return null;
  var n = cleanName(o.n);
  return n ? { n: n, exp: o.exp } : null;
}

export function sessionCookie(req, token) {
  return COOKIE + '=' + token + '; Path=/api; HttpOnly; SameSite=Lax; Max-Age=' + MAX_AGE + (isLocalHost(req) ? '' : '; Secure');
}

export function clearCookie(req) {
  return COOKIE + '=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0' + (isLocalHost(req) ? '' : '; Secure');
}

// 已登入 → 名字；没有 → null
export function currentUser(req) {
  var s = verifySession(getCookie(req, COOKIE));
  return s ? s.n : null;
}

// 没设团队密码 → 503（老板还没设定）；没登入 → 401
export function requireConfigured() {
  if (!configured()) throw new HttpError(503, { error: 'not_configured' });
}
export function requireUser(req) {
  requireConfigured();
  var n = currentUser(req);
  if (!n) throw new HttpError(401, { error: 'login' });
  return n;
}
