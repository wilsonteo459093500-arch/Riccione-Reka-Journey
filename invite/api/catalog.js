/* ============================================================
   /api/catalog —— 案例库清单
   GET  ?view=visi|full → 清单（visi 版没有项目名、档案路径、操作纪录）
        ETag = "rev-<rev>"，If-None-Match 一样就 304
        full 版多一个 quota（这个月写入、总储存量、上限），上传页和审核页用
   POST {op:'addPhotos'|'patch'|'hide'|'unhide', …} → 改清单（条件写入，冲突自动重试）
        这个月写入到 WRITE_CAP 就回 507 {error:'quota'}（免费方案；BLOB_PLAN=pro 不限）
   POST {op:'purge', photos:[h…], confirm:'删除'} → 真的删掉已经隐藏的照片（释放空间），一次最多 MAX_PURGE 张
        先删 Blob 的档、再改清单：中途失败的话，清单里留着的那几张本来就是隐藏的，重送一次就好
   ============================================================ */
import { send, sendError, readJson, checkWrite, methodNotAllowed, query, header, HttpError } from './_lib/http.js';
import { requireUser, checkPhotoSig, packName } from './_lib/auth.js';
import { getAdapter, indexPath, useOidc, DEL_BATCH } from './_lib/blob.js';
import {
  emptyIndex, visiView, mutate, addPhotos, patch, setHidden, validateAddPhotos, pidOf,
  blobPlan, quota, monthWrites, storedBytes, checkWrites, validatePurge, planPurge, applyPurge,
  WRITE_CAP, PURGE_CAP, BYTES_CAP
} from './_lib/catalog.js';

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
  var etag = '"rev-' + (index.rev | 0) + (view === 'full' ? '-' + new Date().toISOString().slice(0, 7) : '') + '"';
  if (etagMatches(req, etag)) return send(res, 304, null, { ETag: etag });
  if (view !== 'full') return send(res, 200, visiView(index), { ETag: etag });
  // 额度跟着月份变：ETag 带上月份，换月之后不会一直拿到 304 的旧数字
  var full = Object.assign({}, index, { quota: quota(index, Date.now()) });
  return send(res, 200, full, { ETag: etag });
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
  var plan = blobPlan();
  var cap = plan === 'pro' ? null : WRITE_CAP;

  if (op === 'addPhotos') {
    // 先验证（不合格就不浪费一次写入）
    var v = validateAddPhotos(body);
    // 每张都要是 /api/photo 真的发出去的 k（签章）：不能登记没上传过的「照片」把清单塞满
    v.photos.forEach(function (p, i) {
      if (!checkPhotoSig(p.h, p.k, body.photos[i] && body.photos[i].sig)) throw new HttpError(400, { error: 'photo', field: 'sig', h: p.h });
    });
    var thumbs = pickThumbs(body.thumbs, v.photos);
    var pack = '', packText = '';
    var out = await mutate(adapter, path, async function (index, ts) {
      // 缩图包先写、清单后写；只放这次真的新增的照片（重送 = 0 次写入）。
      // 冲突重试时沿用第一次写好的包，不重写；包名由这批照片决定（固定、不加随机后缀）：
      // 上一次请求写了包、清单却没写成（409、逾时），重送时直接用那一包，不会多一个没人用的档
      var fresh = {};
      v.photos.forEach(function (p) { if (!Object.prototype.hasOwnProperty.call(index.photos, p.h) && thumbs[p.h]) fresh[p.h] = thumbs[p.h]; });
      var hs = Object.keys(fresh).sort();
      // 额度：缩图包 + 清单 = 2 次；不够就连包都不写（不然白白多用一次）
      if (hs.length && cap != null) checkWrites(monthWrites(index, ts), 2, cap, BYTES_CAP - storedBytes(index));
      if (hs.length && (!pack || pack !== packName(pidOf(v.name), hs))) {
        packText = JSON.stringify(fresh);
        var r = await adapter.putFile(packName(pidOf(v.name), hs), packText, 'application/json', { fixed: true });
        pack = r.pathname;
      }
      if (!hs.length) { pack = ''; packText = ''; }
      return addPhotos(index, { project: { name: v.name }, photos: body.photos, pack: pack, packSz: packText ? Buffer.byteLength(packText, 'utf8') : 0 }, by, ts);
    }, { by: by, op: 'addPhotos', cap: cap });
    return send(res, 200, { pid: out.pid, added: out.added, dup: out.dup, rev: out.rev });
  }
  if (op === 'patch') {
    var p = await mutate(adapter, path, function (index, ts) { return patch(index, body, by, ts); }, { by: by, op: 'patch', cap: cap });
    return send(res, 200, { rev: p.rev, changed: p.changed });
  }
  if (op === 'hide' || op === 'unhide') {
    var hd = await mutate(adapter, path, function (index, ts) { return setHidden(index, body, op === 'hide', by, ts); }, { by: by, op: op, cap: cap });
    return send(res, 200, { rev: hd.rev, changed: hd.changed });
  }
  if (op === 'purge') return await purge(adapter, path, body, by, plan, res);
  throw new HttpError(400, { error: 'op' });
}

/* 真的删除：只删已经隐藏的照片。要带 confirm:'删除'（审核页要业务亲手打这两个字），清单的 log 记下是谁删的 */
async function purge(adapter, path, body, by, plan, res) {
  if (body.confirm !== '删除') throw new HttpError(400, { error: 'confirm' });
  // 先读一次（不走快取）验证、算出要删哪些档；再删档；最后改清单
  var cur = await adapter.getJson(path, { fresh: true });
  var index = cur && cur.data && typeof cur.data === 'object' ? cur.data : emptyIndex();
  if (!index.photos || typeof index.photos !== 'object') index.photos = {};
  if (!index.projects || typeof index.projects !== 'object') index.projects = {};
  var hs = validatePurge(index, body);
  var plan0 = planPurge(index, hs);
  var files = plan0.keys.concat(plan0.packs);
  var batches = Math.ceil(files.length / DEL_BATCH);
  var now = Date.now();
  // 文件没写明 del() 算不算写入：保守一点，每批算 1 次
  if (plan !== 'pro') checkWrites(monthWrites(index, now), batches + 1, PURGE_CAP, BYTES_CAP - storedBytes(index));
  for (var i = 0; i < files.length; i += DEL_BATCH) await adapter.del(files.slice(i, i + DEL_BATCH));
  var out = await mutate(adapter, path, function (idx, ts) {
    var r = applyPurge(idx, plan0);
    r.writes = batches;
    // 删完之后的额度（这次的清单写入 + 删档也算进去）：审核页直接显示，不用再读一次
    r.quota = quota(idx, ts, plan);
    r.quota.writes += batches + 1;
    if (r.quota.writesLeft != null) r.quota.writesLeft = Math.max(0, r.quota.writesLeft - batches - 1);
    return r;
  }, { by: by, op: 'purge', cap: plan === 'pro' ? null : PURGE_CAP });
  return send(res, 200, { rev: out.rev, removed: out.removed | 0, projectsRemoved: out.projectsRemoved | 0, freed: plan0.freed, quota: out.quota || null });
}

export default async function handler(req, res) {
  try {
    useOidc(req);
    if (req.method === 'GET') return await getCatalog(req, res);
    if (req.method === 'POST') return await postCatalog(req, res);
    return methodNotAllowed(res, 'GET, POST');
  } catch (e) {
    return sendError(res, e);
  }
}
