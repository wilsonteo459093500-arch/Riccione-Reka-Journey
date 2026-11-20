/* ============================================================
   签名链接 · 前端（VISI 体检第 2c 阶段；伺服器那边见 api/_lib/link.js）
   ------------------------------------------------------------
   邀请函、需求卡链接里的「销售名字、职称、WhatsApp、留言」要有签名才算数；
   客户名字、日期、时间不签。没签名 / 签名不对 → 页面退回公司预设（config.js 的 host），不提示客户。
   团队名单里的代号（from=wilson）本来就是 config.js 里的资料，不用签。

   window.SAIL_LINK
     .needs(f)            f = {by, role, wa, note}：这几样有没有要签名才能印的
     .verify(f, sig, ms)  → Promise<{by, role, wa, note} | null>（null = 不算数；ms 没回 → null）
     .sign(f, login)      → Promise<{sig, by, role, wa, note, name}>
                            login = {name, password} 时顺便登入；失败 reject {status, error, retryAfter}
     .member(v)           团队代号 → 名单那一行 | null
     .MAX_GUEST           客户名字最多几个字（没签，所以限长度：塞不进一整段话）
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.SAIL || {};
  var API = 'api/link';

  function member(v) {
    if (!v) return null;
    var t = CFG.team || [];
    for (var i = 0; i < t.length; i++) {
      if (t[i].code && t[i].code.toLowerCase() === String(v).trim().toLowerCase()) return t[i];
    }
    return null;
  }

  function s(v) { return v == null ? '' : String(v).trim(); }

  function needs(f) {
    f = f || {};
    return !!(s(f.role) || s(f.wa) || s(f.note) || (s(f.by) && !member(f.by)));
  }

  function verify(f, sig, ms) {
    if (!sig || typeof fetch !== 'function') return Promise.resolve(null);
    var q = new URLSearchParams();
    ['by', 'role', 'wa', 'note'].forEach(function (k) { if (s(f[k])) q.set(k, String(f[k])); });
    q.set('sig', sig);
    var timer;
    var late = new Promise(function (ok) { timer = setTimeout(function () { ok(null); }, ms || 5000); });
    var ask = fetch(API + '?' + q.toString(), { credentials: 'omit' }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (j) {
      return j && j.ok ? { by: s(j.by), role: s(j.role), wa: s(j.wa), note: String(j.note || '') } : null;
    }).catch(function () { return null; });
    return Promise.race([ask, late]).then(function (v) { clearTimeout(timer); return v; });
  }

  function sign(f, login) {
    var body = { by: s(f.by), role: s(f.role), wa: s(f.wa), note: String(f.note || '') };
    if (login) { body.name = login.name; body.password = login.password; }
    return fetch(API, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-VISI': '1' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok && j && typeof j.sig === 'string') return j;
        throw { status: r.status, error: (j && j.error) || 'http_' + r.status, retryAfter: j && j.retryAfter };
      });
    }, function () { throw { status: 0, error: 'offline' }; });
  }

  window.SAIL_LINK = { needs: needs, verify: verify, sign: sign, member: member, MAX_GUEST: 40 };
})();
