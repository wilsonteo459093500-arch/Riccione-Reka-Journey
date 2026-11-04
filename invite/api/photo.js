/* ============================================================
   /api/photo?h=<16 hex> —— 上传一张照片（浏览器已压成 1200px JPEG）
   body = JPEG 原始内容（Content-Type: image/jpeg），≤ 3.5 MB
   → {k, url, sig}：k 是 Blob 的 pathname（c/<h>-随机后缀.jpg），之后 addPhotos 登记用；
     sig 是伺服器的签章，addPhotos 要带回来（没有上传过的 k 登记不进去）
   照片和清单分开写：先传图，传完一批再一次登记，断线也不会登记到不存在的图
   额度（免费方案）：这个月写入到 UPLOAD_CAP、或总储存量超过 BYTES_CAP → 507 {error:'quota'}，不写
     usage 从清单读（走 CDN 快取，便宜），在这台 function 的记忆体里留 QUOTA_TTL；
     这段时间自己传了几张也加进去。几台同时传会有一点误差，靠 WRITE_CAP − UPLOAD_CAP 的余量吸收
   ============================================================ */
import { send, sendError, readRaw, checkWrite, methodNotAllowed, query, header, HttpError } from './_lib/http.js';
import { requireUser, photoSig } from './_lib/auth.js';
import { getAdapter, useOidc, indexPath } from './_lib/blob.js';
import { blobPlan, monthWrites, storedBytes, emptyIndex, quotaError, UPLOAD_CAP, BYTES_CAP } from './_lib/catalog.js';

export const MAX_PHOTO = 3.5 * 1024 * 1024; // Vercel function 的请求上限是 4.5 MB，留余裕
export const QUOTA_TTL = 30 * 1000;

// {path, at, month, writes, bytes, plusW, plusB}：上次读清单时的 usage + 之后这台自己传的
var seen = null;
export function resetQuotaCache() { seen = null; }

async function checkQuota(adapter, size, now) {
  if (blobPlan() === 'pro') return null;
  var path = indexPath();
  var month = new Date(now).toISOString().slice(0, 7);
  if (!seen || seen.path !== path || seen.month !== month || now - seen.at > QUOTA_TTL) {
    var cur = await adapter.getJson(path);
    var index = cur && cur.data && typeof cur.data === 'object' ? cur.data : emptyIndex();
    if (!index.photos || typeof index.photos !== 'object') index.photos = {};
    if (!index.projects || typeof index.projects !== 'object') index.projects = {};
    seen = { path: path, at: now, month: month, writes: monthWrites(index, now), bytes: storedBytes(index), plusW: 0, plusB: 0 };
  }
  var w = seen.writes + seen.plusW, b = seen.bytes + seen.plusB;
  if (w + 1 > UPLOAD_CAP) throw quotaError('writes', UPLOAD_CAP - w, BYTES_CAP - b);
  if (b + size > BYTES_CAP) throw quotaError('bytes', UPLOAD_CAP - w, BYTES_CAP - b);
  return seen;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
    useOidc(req);
    checkWrite(req);
    requireUser(req);
    var h = query(req).get('h') || '';
    if (!/^[0-9a-f]{16}$/.test(h)) throw new HttpError(400, { error: 'h' });
    var type = String(header(req, 'content-type') || '').split(';')[0].trim().toLowerCase();
    if (type !== 'image/jpeg') throw new HttpError(415, { error: 'type' });
    var body = await readRaw(req, MAX_PHOTO);
    // 只收 JPEG：开头一定是 FF D8 FF
    if (body.length < 4 || body[0] !== 0xff || body[1] !== 0xd8 || body[2] !== 0xff) throw new HttpError(415, { error: 'not_jpeg' });
    var adapter = getAdapter();
    var q = await checkQuota(adapter, body.length, Date.now());
    var r = await adapter.putFile('c/' + h + '.jpg', body, 'image/jpeg');
    if (q) { q.plusW++; q.plusB += body.length; }
    return send(res, 200, { k: r.pathname, url: r.url, sig: photoSig(h, r.pathname) });
  } catch (e) {
    return sendError(res, e);
  }
}
