/* ============================================================
   /api/link —— 签名链接（说明见 _lib/link.js）
   GET  ?by=&role=&wa=&note=&sig=   不用登入（客户打开邀请函 / 需求卡时问）
        → {ok:true, by, role, wa, note}（整理过的字，页面就印这份）| {ok:false}
   POST {by, role, wa, note}        要登入（cookie visi_s，跟案例库同一个）
        → {sig, by, role, wa, note, name}
        没登入 → 401 {error:'login'}
        body 另外带 {name, password} = 顺便登入（设 cookie）：本机案例库模式时 /api/session
        是这台电脑的 service worker 在回答，要签名得直接登入真的伺服器
   ============================================================ */
import { send, sendError, readJson, checkWrite, methodNotAllowed, query } from './_lib/http.js';
import { requireConfigured, requireUser } from './_lib/auth.js';
import { linkFields, linkSig, checkLink } from './_lib/link.js';
import { login } from './session.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      var q = query(req);
      var raw = { by: q.get('by') || '', role: q.get('role') || '', wa: q.get('wa') || '', note: q.get('note') || '' };
      var f = checkLink(raw, q.get('sig') || '');
      // 同一条链接答案永远一样（除非换了 SESSION_SECRET）：让浏览器 / CDN 记一小时，客户重开不用再问
      return send(res, 200, f ? { ok: true, by: f.by, role: f.role, wa: f.wa, note: f.note } : { ok: false },
        { 'Cache-Control': 'public, max-age=3600' });
    }
    if (req.method === 'POST') {
      checkWrite(req);
      requireConfigured();
      var body = await readJson(req, 32 * 1024);
      var name, extra = null;
      if (body.password != null) {
        var r = await login(req, body);
        name = r.name;
        extra = { 'Set-Cookie': r.cookie };
      } else {
        name = requireUser(req);
      }
      var fields = linkFields(body);
      var sig = linkSig(fields);
      // Vercel 的执行记录留一笔：谁签了哪个销售名字（不记客户的任何资料）
      console.log('[link] signed by ' + JSON.stringify(name) + ' for ' + JSON.stringify(fields.by || '(default)'));
      return send(res, 200, { sig: sig, by: fields.by, role: fields.role, wa: fields.wa, note: fields.note, name: name }, extra);
    }
    return methodNotAllowed(res, 'GET, POST');
  } catch (e) {
    return sendError(res, e);
  }
}
