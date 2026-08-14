/* ============================================================
   客户需求卡 · client brief wizard
   销售可在链接上预填：brief.html?by=Wilson%20Teo&wa=60189661919&n=陈志明
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.SAIL || {};
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var Q = new URLSearchParams(location.search);

  /* from=wilson 这样的团队代号，链接里就不用带电话号码 */
  function member(v) {
    if (!v) return null;
    var t = CFG.team || [];
    for (var i = 0; i < t.length; i++) {
      if (t[i].code && t[i].code.toLowerCase() === String(v).toLowerCase()) return t[i];
    }
    return null;
  }
  var M = member(Q.get('from'));
  var hostName = (M ? M.name : Q.get('by') || (CFG.host && CFG.host.name) || 'Wilson Teo').trim();
  var inbox = String((M && M.wa) || Q.get('wa') || CFG.briefInbox ||
                     (CFG.host && CFG.host.wa) || '').replace(/\D/g, '');
  var preName = Q.get('for') || Q.get('n') || '';

  var steps = $$('.step');
  var LAST_INPUT = steps.length - 2;   // 最后一个填写步骤（不含完成页）
  var DONE = steps.length - 1;
  var cur = 0;

  var bar   = $('#f-bar');
  var count = $('#f-count');
  var nav   = $('#f-nav');
  var back  = $('#btn-back');
  var next  = $('#btn-next');

  /* ---------- 预填 ---------------------------------------- */
  if (preName) $('#f-name').value = preName;
  var fl = $('#from-line');
  if (fl && (M || Q.get('by'))) { $('#from-name').textContent = hostName; fl.hidden = false; }
  $('#done-host').textContent = hostName;
  if (CFG.venue) $('#done-hours').textContent = CFG.venue.hoursZh;

  /* ---------- 草稿自动保存 -------------------------------- */
  var KEY = 'sail-brief-draft';
  function collect() {
    var d = {};
    $$('input, select, textarea').forEach(function (el) {
      if (!el.name) return;
      if (el.type === 'checkbox') {
        if (el.checked) (d[el.name] = d[el.name] || []).push(el.value);
      } else if (el.type === 'radio') {
        if (el.checked) d[el.name] = el.value;
      } else if (el.value.trim()) {
        d[el.name] = el.value.trim();
      }
    });
    return d;
  }
  function saveDraft() { try { localStorage.setItem(KEY, JSON.stringify(collect())); } catch (e) {} }
  function loadDraft() {
    var raw; try { raw = localStorage.getItem(KEY); } catch (e) { return; }
    if (!raw) return;
    var d; try { d = JSON.parse(raw); } catch (e) { return; }
    $$('input, select, textarea').forEach(function (el) {
      if (!el.name || !(el.name in d)) return;
      var v = d[el.name];
      if (el.type === 'checkbox') el.checked = Array.isArray(v) && v.indexOf(el.value) > -1;
      else if (el.type === 'radio') el.checked = (v === el.value);
      else if (!el.value) el.value = v;
    });
    syncOthers();
  }
  document.addEventListener('input', saveDraft);
  document.addEventListener('change', saveDraft);

  /* ---------- 「其他」输入框 ------------------------------- */
  function syncOthers() {
    $$('[data-other]').forEach(function (input) {
      var box = document.getElementById(input.getAttribute('data-other'));
      if (!box) return;
      var group = input.type === 'radio'
        ? $$('input[name="' + input.name + '"][data-other="' + input.getAttribute('data-other') + '"]')
        : [input];
      var on = group.some(function (i) { return i.checked; });
      box.classList.toggle('on', on);
    });
  }
  document.addEventListener('change', function (e) { if (e.target.name) syncOthers(); });

  /* ---------- 步骤切换 ------------------------------------ */
  function show(i) {
    cur = i;
    steps.forEach(function (s, k) { s.classList.toggle('on', k === i); });
    var pct = i === 0 ? 4 : Math.round((i / LAST_INPUT) * 100);
    bar.style.width = Math.min(100, pct) + '%';

    if (i === 0)            count.textContent = '客户需求卡 · CLIENT BRIEF';
    else if (i <= LAST_INPUT) count.textContent = i + ' / ' + LAST_INPUT;
    else                    count.textContent = '已送出 · SENT';

    back.style.visibility = (i === 0 || i === DONE) ? 'hidden' : 'visible';
    nav.style.display = i === DONE ? 'none' : '';
    next.textContent = i === 0 ? '开始填写 · 3 分钟'
                    : i === LAST_INPUT ? '送出给我们 →'
                    : '下一步 →';
    window.scrollTo({ top: 0, behavior: i === 0 ? 'auto' : 'smooth' });
  }

  function validate(i) {
    var box = $('#err-' + i);
    var ok = true;
    if (i === 1) {
      var n = $('#f-name'), w = $('#f-wa');
      var src = $('input[name="source"]:checked');
      [n, w].forEach(function (el) {
        var bad = !el.value.trim();
        el.classList.toggle('err', bad);
        if (bad) ok = false;
      });
      if (!src) ok = false;
    }
    if (box) box.classList.toggle('on', !ok);
    return ok;
  }

  next.addEventListener('click', function () {
    if (cur >= 1 && !validate(cur)) return;
    if (cur === LAST_INPUT) return submit();
    show(Math.min(cur + 1, LAST_INPUT));
  });
  back.addEventListener('click', function () { show(Math.max(0, cur - 1)); });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || cur === DONE) return;
    if (e.target && e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    next.click();
  });

  /* ---------- 汇总文字 ------------------------------------ */
  function line(label, val) {
    if (val === undefined || val === null || val === '' || (Array.isArray(val) && !val.length)) return '';
    return label + '：' + (Array.isArray(val) ? val.join('、') : val) + '\n';
  }

  function buildSummary(d) {
    var t = '';
    t += '【溪岸 · 客户需求卡】\n';
    t += '——————————————\n';
    t += line('姓名', d.name);
    t += line('WhatsApp', d.wa);
    t += line('认识渠道', d.source + (d.sourceDetail ? '（' + d.sourceDetail + '）' : ''));
    t += '\n〔房产〕\n';
    t += line('楼盘 / 单位', d.project);
    t += line('面积', d.size ? d.size + ' sq ft' : '');
    t += line('房型', d.ptype);
    t += line('状态', d.status);
    t += line('拿钥匙 / 入伙', d.keys);
    t += line('硬装进度', d.reno);
    t += '\n〔需求〕\n';
    t += line('定制范围', (d.scope || []).concat(d.scopeDetail ? ['其他：' + d.scopeDetail] : []));
    t += line('风格倾向', d.style);
    t += line('参考图', d.ref);
    t += '\n〔生活习惯〕\n';
    t += line('家庭构成', [
      d.adults ? d.adults + ' 大人' : '',
      d.children ? d.children + ' 小孩' : '',
      d.kidage ? '（' + d.kidage + '）' : ''
    ].filter(Boolean).join(' '));
    t += line('还有谁', d.household);
    t += line('做饭频率', d.cook);
    t += line('收纳压力', d.storage);
    t += line('最想解决', d.pain);
    t += '\n〔预算与决策〕\n';
    t += line('预算带', d.budget);
    t += line('决策人', d.decider);
    t += line('平面图', d.plan);
    t += line('期望时间', d.timeline);
    t += '\n〔下一步〕\n';
    t += line('方便到馆', d.visitPref);
    t += line('补充', d.note);
    t += '——————————————\n';
    t += '接待：' + hostName + '\n';
    t += '（由溪岸线上需求卡自动生成）';
    return t;
  }

  /* ---------- 送出 ---------------------------------------- */
  var lastText = '';

  function submit() {
    if (!validate(1)) { show(1); return; }
    var d = collect();
    lastText = buildSummary(d);
    $('#summary').textContent = lastText;

    var wa = 'https://wa.me/' + inbox + '?text=' + encodeURIComponent(lastText);
    $('#btn-send-again').href = wa;

    // 选填：同时 POST 到表单服务
    if (CFG.briefEndpoint) {
      try {
        fetch(CFG.briefEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ host: hostName, submittedAt: new Date().toISOString(), text: lastText, data: d })
        }).catch(function () {});
      } catch (e) {}
    }

    try { localStorage.removeItem(KEY); } catch (e) {}
    show(DONE);
    window.open(wa, '_blank', 'noopener');
  }

  /* ---------- 完成页动作 ---------------------------------- */
  var toast = $('#toast');
  function ping(msg) {
    toast.textContent = msg; toast.classList.add('on');
    setTimeout(function () { toast.classList.remove('on'); }, 1900);
  }
  $('#btn-copy').addEventListener('click', function () {
    var done = function () { ping('已复制，可直接贴到 WhatsApp'); };
    if (navigator.clipboard) navigator.clipboard.writeText(lastText).then(done, fallback);
    else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = lastText; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      document.body.removeChild(ta);
    }
  });
  $('#btn-restart').addEventListener('click', function () {
    $$('input, textarea').forEach(function (el) {
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = false; else el.value = '';
    });
    $$('select').forEach(function (el) { el.selectedIndex = 0; });
    syncOthers();
    show(0);
  });

  /* ---------- 启动 ---------------------------------------- */
  loadDraft();
  show(0);
})();
