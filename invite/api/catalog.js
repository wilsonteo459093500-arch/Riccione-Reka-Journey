/* ============================================================
   /api/catalog —— 案例库清单
   GET  ?view=visi|full → 清单（visi 版没有项目名、档案路径、操作纪录）
        ETag = "rev-<rev>"，If-None-Match 一样就 304
   POST {op:'addPhotos'|'patch'|'hide'|'unhide', …} → 改清单（条件写入，冲突自动重试）
   ============================================================ */
import { send, sendError, readJson, checkWrite, methodNotAllowed, query, header, HttpError } from './_lib/http.js';
import { requireUser } from './_lib/auth.js';
import { getAdapter, indexPath } from './_lib/blob.js';
import { emptyIndex, visiView, mutate, addPhotos, patch, setHidden, validateAddPhotos, pidOf } from './_lib/catalog.js';

const MAX_BODY = 4 * 1024 * 1024;        // 40 张缩图约 1.5 MB，Vercel 上限 4.5 MB
const MAX_THUMB = 200 * 1024;            // 一张 320px 缩图的 dataURL 通常 20–50 KB
const THUMB_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;

function etagMatches(req, etag) {
  var inm = String(header(req, 'if-none-match') || '');
  if (!inm) return false;
  return inm.split(',').some(function (t) { t = t.trim().replace(/^W\//, ''); return t === etag || t === '*'; });
}

async function getCatalog(req, res) {
  requireUser(req);
  var view = query(req).get('view') || 'visi';
  if (view !== 'visi' && view !== 'full') throw new HttpError(400, { error: 'view' });
  var adapter = getAdapter();
  var cur = await adapter.getJson(indexPath());
  var index = cur && cur.data ? cur.data : emptyIndex();
  if (!index.base && adapter.base) index.base = adapter.base;
  var etag = '"rev-' + (index.rev | 0) + '"';
  if (etagMatches(req, etag)) return send(res, 304, null, { ETag: etag });
  return send(res, 200, view === 'full' ? index : visiView(index), { ETag: etag });
}

// 缩图包：只收这次照片的，格式不对整批退回
function pickThumbs(thumbs, photos) {
  if (thumbs == null) return {};
  if (typeof thumbs !== 'object' || Array.isArray(thumbs)) throw new HttpError(400, { error: 'thumb' });
  var want = {};
  photos.forEach(function (p) { want[p.h] = 1; });
  var out = {}, n = 0;
  Object.keys(thumbs).forEach(function (h) {
    if (!want[h]) return;
    var v = thumbs[h];
    if (typeof v !== 'string' || v.length > MAX_THUMB || !THUMB_RE.test(v)) throw new HttpError(400, { error: 'thumb', h: h });
    out[h] = v;
    n++;
  });
  return n ? out : {};
}

async function postCatalog(req, res) {
  checkWrite(req);
  var by = requireUser(req);
  var body = await readJson(req, MAX_BODY);
  var adapter = getAdapter();
  var path = indexPath();
  var op = body.op;

  if (op === 'addPhotos') {
    // 先验证（不合格就不浪费一次写入）
    var v = validateAddPhotos(body);
    var thumbs = pickThumbs(body.thumbs, v.photos);
    var pack = '';
    var out = await mutate(adapter, path, async function (index, ts) {
      // 缩图包先写、清单后写；只放这次真的新增的照片（重送 = 0 次写入）。
      // 冲突重试时沿用第一次写好的包，不重写
      var fresh = {};
      v.photos.forEach(function (p) { if (!index.photos[p.h] && thumbs[p.h]) fresh[p.h] = thumbs[p.h]; });
      if (!pack && Object.keys(fresh).length) {
        var r = await adapter.putFile('t/' + pidOf(v.name) + '-' + Date.now().toString(36) + '.json', JSON.stringify(fresh), 'application/json');
        pack = r.pathname;
      }
      return addPhotos(index, { project: { name: v.name }, photos: body.photos, pack: pack }, by, ts);
    }, { by: by, op: 'addPhotos' });
    return send(res, 200, { pid: out.pid, added: out.added, dup: out.dup, rev: out.rev });
  }
  if (op === 'patch') {
    var p = await mutate(adapter, path, function (index, ts) { return patch(index, body, by, ts); }, { by: by, op: 'patch' });
    return send(res, 200, { rev: p.rev, changed: p.changed });
  }
  if (op === 'hide' || op === 'unhide') {
    var hd = await mutate(adapter, path, function (index, ts) { return setHidden(index, body, op === 'hide', by, ts); }, { by: by, op: op });
    return send(res, 200, { rev: hd.rev, changed: hd.changed });
  }
  throw new HttpError(400, { error: 'op' });
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return await getCatalog(req, res);
    if (req.method === 'POST') return await postCatalog(req, res);
    return methodNotAllowed(res, 'GET, POST');
  } catch (e) {
    return sendError(res, e);
  }
}
