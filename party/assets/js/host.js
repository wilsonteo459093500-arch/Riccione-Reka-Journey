/* ============================================================
   股东名册（主人专用）
   ============================================================ */
(function () {
  'use strict';

  var P = window.PARTY;
  var C = window.PartyCore;
  var KEY = 'dudu.hostKey';
  var $ = function (id) { return document.getElementById(id); };

  var state = { guests: [], summary: null, filter: 'all', q: '' };
  // 密码同时放在变量里：手机禁用 localStorage 时也能登入（只是下次要再输）
  var hostKey = C.mem.get(KEY, '');

  /* ---------- 小工具 ---------- */
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('zh-CN', { timeZone: 'Asia/Kuala_Lumpur', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  /* ---------- 读名册 ---------- */
  function api(method, path) {
    return C.fetchJson(path, {
      method: method,
      // 编码后再送：标头只收英文字元，中文密码不编码会直接送不出去
      headers: { Accept: 'application/json', 'x-host-key': encodeURIComponent(hostKey) }
    }, 20000);
  }

  function load(silent) {
    if (!silent) $('refreshBtn').disabled = true;
    return api('GET', '/api/guests').then(function (r) {
      $('refreshBtn').disabled = false;
      if (r.status === 200 && r.data.ok) {
        state.guests = r.data.guests || [];
        state.summary = r.data.summary;
        showBoard(r.data.storage);
        render();
        return true;
      }
      return handleError(r);
    }, function () {
      $('refreshBtn').disabled = false;
      $('loginMsg').textContent = '连不上伺服器。网络不稳？等一下再试。';
      showLogin();
      return false;
    });
  }

  // 返回 true = 已进入名册页（例如密码对了、只是还没接存储）
  function handleError(r) {
    if (r.data && r.data.error === 'not_configured') {
      // 服务器先验密码再找存储，走到这里代表密码是对的：让主人进来，显示接存储的步骤
      state.guests = [];
      state.summary = null;
      showBoard('none');
      return true;
    }
    if (r.status >= 500 && !$('board').hidden) {
      // 已经在名册页：读不到就留在原地，提示等一下再刷新（不要踢回登录页）
      toast('名册暂时读不到，等一下再按「刷新」');
      return true;
    }
    var msg = r.status >= 500 ? '名册暂时读不到（' + r.status + '），等一下再试。' : '出了点问题（' + r.status + '）。';
    if (r.status === 401) {
      msg = '密码不对。';
      hostKey = '';
      C.mem.del(KEY);
    } else if (r.data && r.data.error === 'host_key_not_set') {
      msg = '还没设主人密码：到 Vercel → Settings → Environment Variables 加一个 PARTY_HOST_KEY，再 Redeploy。';
    }
    $('loginMsg').textContent = msg;
    showLogin();
    return false;
  }

  function showLogin() {
    $('loginCard').hidden = false;
    $('board').hidden = true;
    $('refreshBtn').hidden = true;
    $('logoutBtn').hidden = true;
  }

  function showBoard(storage) {
    state.noStore = storage === 'none';
    $('loginCard').hidden = true;
    $('board').hidden = false;
    $('board').classList.toggle('no-store', state.noStore);
    $('setupCard').hidden = !state.noStore;
    $('refreshBtn').hidden = false;
    $('logoutBtn').hidden = false;
    $('storageNote').textContent = state.noStore ? '' : storage === 'file' ? '（本机测试模式：资料存在 party/.data/）' : '资料存在 Vercel Blob，只有知道主人密码的人看得到完整名单。';
  }

  /* ---------- 画面 ---------- */
  function render() {
    var s = state.summary || { people: 0, adults: 0, kids: 0, groups: 0, declined: 0, portions: 0, diet: {}, responses: 0 };
    C.countUp($('sPeople'), s.people, 700);
    C.countUp($('sAdults'), s.adults, 700);
    C.countUp($('sKids'), s.kids, 700);
    C.countUp($('sGroups'), s.groups, 700);
    C.countUp($('sDeclined'), s.declined, 700);
    C.countUp($('sPortions'), s.portions, 700);

    // 饮食：只算「几户」，不算人数 —— 一家 4 口里可能只有 1 位吃素，看客人自己写的备注
    var L = C.DIET_LABEL.zh;
    var going = state.guests.filter(function (g) { return g.attending === 'yes'; });
    var dietRows = Object.keys(L).map(function (k) {
      var hh = going.filter(function (g) { return (g.diet || []).indexOf(k) !== -1; });
      if (!hh.length) return '';
      return '<li><b>' + esc(L[k]) + '</b> <span class="pill">' + hh.length + ' 户</span><span class="names">' +
        hh.map(function (g) { return esc(g.name) + (g.dietNote ? '（' + esc(g.dietNote) + '）' : ''); }).join('、') + '</span></li>';
    }).join('');
    var loose = going.filter(function (g) { return g.dietNote && !(g.diet || []).length; }).map(function (g) {
      return '<li><b>' + esc(g.name) + '</b><span class="names">' + esc(g.dietNote) + '</span></li>';
    }).join('');
    $('dietList').innerHTML = dietRows + loose || '<li class="muted">目前没有人提特别饮食需求。</li>';

    // 同一家人用两支手机各回一次：名字一样就标「可能重复」
    var keyOf = function (g) { return String(g.name || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, ''); };
    var seen = {};
    state.guests.forEach(function (g) { var k = keyOf(g); if (k) seen[k] = (seen[k] || 0) + 1; });
    var dupCount = state.guests.filter(function (g) { return seen[keyOf(g)] > 1; }).length;

    // 名单
    var q = state.q.trim().toLowerCase();
    var rows = state.guests.filter(function (g) {
      if (state.filter !== 'all' && g.attending !== state.filter) return false;
      if (q && (g.name + ' ' + (g.invitedAs || '')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    $('listCount').textContent = '共 ' + state.guests.length + ' 条回复' + (dupCount ? ' · ' + dupCount + ' 条可能重复（确认后删掉多的那条）' : '');
    $('emptyMsg').hidden = state.guests.length > 0;
    $('guestList').innerHTML = rows.map(function (g) {
      var yes = g.attending === 'yes';
      var diet = yes ? C.dietText(g, 'zh') : '';
      return '<li class="g ' + (yes ? 'yes' : 'no') + '">' +
        '<div class="g-head">' +
          '<span class="g-name">' + esc(g.name) + '</span>' +
          (g.invitedAs && g.invitedAs !== g.name ? '<span class="g-as">邀请名：' + esc(g.invitedAs) + '</span>' : '') +
          (seen[keyOf(g)] > 1 ? '<span class="g-dup">可能重复</span>' : '') +
          '<span class="g-badge">' + (yes ? '会来' : '来不了') + '</span>' +
        '</div>' +
        (yes ? '<div class="g-count">大人 <b>' + g.adults + '</b> · 小孩 <b>' + g.kids + '</b></div>' : '') +
        (diet ? '<div class="g-diet">🍽 ' + esc(diet) + '</div>' : '') +
        (g.wish ? '<div class="g-wish">“' + esc(g.wish) + '”</div>' : '') +
        '<div class="g-foot"><span>' + when(g.updatedAt) + (g.edits ? ' · 改过 ' + g.edits + ' 次' : '') + (g.lang === 'en' ? ' · EN' : '') + '</span>' +
          '<button type="button" class="g-del" data-del="' + esc(g.id) + '" data-name="' + esc(g.name) + '">删除</button></div>' +
      '</li>';
    }).join('');
  }

  /* ---------- 名单文字 / CSV ---------- */
  function summaryText() {
    var s = state.summary;
    var yes = state.guests.filter(function (g) { return g.attending === 'yes'; });
    var no = state.guests.filter(function (g) { return g.attending === 'no'; });
    var lines = [
      '【DUDU 一岁生日 · 出席名单】',
      P.event.dateShort + ' ' + P.event.timeZh + ' · ' + P.event.venueZh,
      '',
      '总人数：' + s.people + '（大人 ' + s.adults + '，小孩 ' + s.kids + '）',
      '出席：' + s.groups + ' 户　来不了：' + s.declined + ' 户',
      '建议餐量：约 ' + s.portions + ' 份（小孩算半份）',
      ''
    ];
    yes.forEach(function (g, i) {
      var d = C.dietText(g, 'zh');
      lines.push((i + 1) + '. ' + g.name + ' — 大人 ' + g.adults + '，小孩 ' + g.kids + (d ? '（' + d + '）' : ''));
    });
    if (no.length) {
      lines.push('');
      lines.push('来不了：' + no.map(function (g) { return g.name; }).join('、'));
    }
    return lines.join('\n');
  }

  function csv() {
    var head = ['名字', '邀请名', '出席', '大人', '小孩', '饮食', '饮食备注', '给DUDU的话', '语言', '最后更新'];
    var cell = function (v) {
      var s = String(v == null ? '' : v);
      // 防止 Excel 把 = + - @ 开头当公式
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    var lines = [head.map(cell).join(',')];
    state.guests.forEach(function (g) {
      lines.push([
        g.name, g.invitedAs || '', g.attending === 'yes' ? '会来' : '来不了', g.adults, g.kids,
        (g.diet || []).map(function (k) { return C.DIET_LABEL.zh[k] || k; }).join('、'), g.dietNote || '', g.wish || '',
        g.lang || 'zh', when(g.updatedAt)
      ].map(cell).join(','));
    });
    return '﻿' + lines.join('\r\n'); // BOM：Excel 打开中文不乱码
  }

  /* ---------- 专属邀请 ---------- */
  function inviteUrl(name, en) {
    var u = new URL(location.origin + '/');
    if (name) u.searchParams.set('to', name);
    if (en) u.searchParams.set('lang', 'en');
    return u.toString();
  }

  function inviteText(name, en) {
    return C.inviteText(name, en ? 'en' : 'zh', inviteUrl(name, en));
  }

  function refreshGen() {
    $('genText').value = inviteText($('toInput').value.trim(), $('enInput').checked);
  }

  /* ---------- 事件 ---------- */
  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var k = $('keyInput').value.trim();
    if (!k) return;
    hostKey = k;
    C.mem.set(KEY, k);
    $('loginMsg').textContent = '';
    load().then(function (ok) { if (ok) $('keyInput').value = ''; });
  });

  $('refreshBtn').addEventListener('click', function () {
    load().then(function (ok) { if (ok) toast(state.noStore ? '还没接上存储' : '已更新'); });
  });

  $('logoutBtn').addEventListener('click', function () {
    hostKey = '';
    C.mem.del(KEY);
    state.guests = [];
    showLogin();
  });

  document.querySelectorAll('[data-filter]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.filter = b.getAttribute('data-filter');
      document.querySelectorAll('[data-filter]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      render();
    });
  });

  $('searchInput').addEventListener('input', function (e) {
    state.q = e.target.value;
    render();
  });

  $('guestList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-del]');
    if (!b) return;
    if (!confirm('删除「' + b.getAttribute('data-name') + '」这条回复？删了就找不回来。')) return;
    b.disabled = true;
    api('DELETE', '/api/guests?id=' + encodeURIComponent(b.getAttribute('data-del'))).then(function (r) {
      if (r.status === 200 && r.data.ok) {
        toast('已删除');
        if (!r.data.guests) { load(true); return; }
        state.guests = r.data.guests;
        state.summary = r.data.summary;
        render();
      } else {
        b.disabled = false;
        toast('删除失败（' + r.status + '）');
      }
    }, function () {
      b.disabled = false;
      toast('网络不稳，删除失败');
    });
  });

  $('copyBtn').addEventListener('click', function () {
    copy(summaryText()).then(function (ok) { toast(ok ? '已复制，去 WhatsApp 贴上吧' : '复制失败，请手动选取'); });
  });

  $('csvBtn').addEventListener('click', function () {
    var blob = new Blob([csv()], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'DUDU-股东名册.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  });

  $('toInput').addEventListener('input', refreshGen);
  $('enInput').addEventListener('change', refreshGen);
  $('genWa').addEventListener('click', function () {
    window.open('https://wa.me/?text=' + encodeURIComponent($('genText').value), '_blank', 'noopener');
  });
  $('genCopy').addEventListener('click', function () {
    copy($('genText').value).then(function (ok) { toast(ok ? '已复制' : '复制失败，请手动选取'); });
  });

  /* ---------- 开始 ---------- */
  refreshGen();
  if (hostKey) load(true);
  else showLogin();
  // 开着页面时每分钟自动更新一次
  setInterval(function () {
    if (!$('board').hidden && document.visibilityState === 'visible') load(true);
  }, 60000);
})();
