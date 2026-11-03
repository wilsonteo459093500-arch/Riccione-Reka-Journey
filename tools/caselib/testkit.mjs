/* ============================================================
   案例库测试的小工具（不是测试档本身，放在 test/ 外面）
   - fakeReq / fakeRes / call：不开 port 直接呼叫 handler
   - tinyJpeg()：程式产生的 8×8 灰色 JPEG（不是照片）
   - dh 工具：造相近 / 不相近的 dHash
   - 名字一律用「测试客户」这类假名，绝不放真的客户名字
   ============================================================ */
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const INVITE = join(ROOT, 'invite');
export const API = pathToFileURL(join(INVITE, 'api')).href + '/';
// 测试产生的暂存档（seed 档等）放这里；跑的时候可用 CASELIB_SCRATCH 指到 scratchpad
export const SP = process.env.CASELIB_SCRATCH || join(tmpdir(), 'caselib-test');

export const lib = {
  http: await import(API + '_lib/http.js'),
  auth: await import(API + '_lib/auth.js'),
  blob: await import(API + '_lib/blob.js'),
  vocab: await import(API + '_lib/vocab.js'),
  catalog: await import(API + '_lib/catalog.js')
};
export const handlers = {
  session: (await import(API + 'session.js')).default,
  photo: (await import(API + 'photo.js')).default,
  catalog: (await import(API + 'catalog.js')).default
};

// 8×8 灰色方块，PIL 产生后转 base64；只拿来测「开头是 FF D8 FF」和上传流程
const TINY = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDWooorEs//2Q==';
export function tinyJpeg() { return Buffer.from(TINY, 'base64'); }
export function tinyThumb() { return 'data:image/jpeg;base64,' + TINY; }

/* ---------- 假 req / res ---------- */
export function fakeReq(o) {
  o = o || {};
  var body = o.body == null ? [] : [Buffer.isBuffer(o.body) ? o.body : Buffer.from(typeof o.body === 'string' ? o.body : JSON.stringify(o.body))];
  var r = Readable.from(body);
  r.method = o.method || 'GET';
  r.url = o.url || '/';
  var headers = { host: 'visi.example.test' };
  Object.keys(o.headers || {}).forEach(function (k) { headers[k.toLowerCase()] = o.headers[k]; });
  if (o.body != null && headers['content-length'] == null && !o.chunked) headers['content-length'] = String(body[0].length);
  r.headers = headers;
  return r;
}

export function fakeRes() {
  var headers = {};
  var res = {
    statusCode: 200,
    headersSent: false,
    setHeader: function (k, v) { headers[k.toLowerCase()] = v; },
    getHeader: function (k) { return headers[k.toLowerCase()]; },
    headers: headers
  };
  res.done = new Promise(function (ok) {
    res.end = function (b) { res.body = b == null ? '' : String(b); res.headersSent = true; ok(res); };
  });
  return res;
}

// 呼叫 handler，回 {status, headers, json, body}
export async function call(handler, o) {
  var req = fakeReq(o);
  var res = fakeRes();
  await handler(req, res);
  await res.done;
  var j = null;
  try { j = res.body ? JSON.parse(res.body) : null; } catch (e) { j = null; }
  return { status: res.statusCode, headers: res.headers, json: j, body: res.body };
}

// 写入请求一定要带的 header
export function writeHeaders(extra) { return Object.assign({ 'x-visi': '1', 'content-type': 'application/json' }, extra || {}); }

export function cookieFor(name, opts) {
  opts = opts || {};
  var exp = opts.exp != null ? opts.exp : Date.now() + 3600 * 1000;
  return lib.auth.COOKIE + '=' + lib.auth.signSession({ n: name, exp: exp });
}

/* ---------- dHash ---------- */
// 把 16 hex 的 dHash 翻转指定的 bit 位置
export function flipBits(dh, bits) {
  var b = BigInt('0x' + dh);
  bits.forEach(function (i) { b ^= (1n << BigInt(i)); });
  return b.toString(16).padStart(16, '0');
}
export function hexOf(n) { return n.toString(16).padStart(16, '0'); }

/* ---------- 造照片 ---------- */
var seq = 0;
export function fakeH() { seq++; return (0x1000000000000000n + BigInt(seq) * 7919n).toString(16).slice(-16).padStart(16, '0'); }
// sig：/api/photo 会给的签章（用当下环境变数的 SECRET 算；handler 测试要先 setup 再造照片）
export function photo(h, dh, f) {
  var k = 'c/' + h + '-AbCdEfGhIjKlMnOpQrStU.jpg';
  return { h: h, k: k, w: 1600, ht: 1200, sz: 345678, dh: dh || 'f0f0f0f0f0f0f0f0', f: f || '厨房/IMG_' + h.slice(0, 4) + '.jpg', sig: lib.auth.photoSig(h, k) };
}

export function withEnv(vars, fn) {
  var old = {};
  Object.keys(vars).forEach(function (k) { old[k] = process.env[k]; if (vars[k] == null) delete process.env[k]; else process.env[k] = vars[k]; });
  var restore = function () { Object.keys(old).forEach(function (k) { if (old[k] == null) delete process.env[k]; else process.env[k] = old[k]; }); };
  var out;
  try { out = fn(); } catch (e) { restore(); throw e; }
  if (out && typeof out.then === 'function') return out.finally(restore);
  restore();
  return out;
}
