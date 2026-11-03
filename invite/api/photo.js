/* ============================================================
   /api/photo?h=<16 hex> —— 上传一张照片（浏览器已压成 1600px JPEG）
   body = JPEG 原始内容（Content-Type: image/jpeg），≤ 3.5 MB
   → {k, url, sig}：k 是 Blob 的 pathname（c/<h>-随机后缀.jpg），之后 addPhotos 登记用；
     sig 是伺服器的签章，addPhotos 要带回来（没有上传过的 k 登记不进去）
   照片和清单分开写：先传图，传完一批再一次登记，断线也不会登记到不存在的图
   ============================================================ */
import { send, sendError, readRaw, checkWrite, methodNotAllowed, query, header, HttpError } from './_lib/http.js';
import { requireUser, photoSig } from './_lib/auth.js';
import { getAdapter, useOidc } from './_lib/blob.js';

export const MAX_PHOTO = 3.5 * 1024 * 1024; // Vercel function 的请求上限是 4.5 MB，留余裕

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
    var r = await getAdapter().putFile('c/' + h + '.jpg', body, 'image/jpeg');
    return send(res, 200, { k: r.pathname, url: r.url, sig: photoSig(h, r.pathname) });
  } catch (e) {
    return sendError(res, e);
  }
}
