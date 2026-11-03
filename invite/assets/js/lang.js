/* ============================================================
   华文 / English / 中英文 —— 四个页面共用的语言切换
   ------------------------------------------------------------
   <html data-lang="zh|en|bi">：
     zh  只显示 .zh        en  只显示 .en        bi  两种都显示（华文在前）
   规则在 invite.css；这里只管「现在是哪一种」与切换。

   语言从哪里来（先到先用）：网址 ?lang= → 上次选的 → <html data-lang>
   客户页（邀请函、需求卡）记客户自己的选择（sail-lang）；
   销售工具（销售端、VISI）记销售自己的（sail-staff-lang）——
   销售预览一下英文邀请函，自己的工作台不会跟着变英文。
   在 <html> 加 data-lang-scope="staff" 就是销售工具。

   属性与不能放 <span> 的地方（placeholder、title、aria-label、alt、<option>、<title>）：
     <input data-placeholder-zh="例：陈志明" data-placeholder-en="e.g. Mr Tan">
     <option data-text-zh="公寓" data-text-en="Condo">
   载入时与每次切换都会套用（中英文 =「华文 / English」）；
   JS 后来才画出来的，画完叫 SAIL_LANG.localize(容器)。

   JS 里要出字：
     SAIL_LANG.L(zh, en)   纯文字；中英文 =「华文 / English」（按钮、提示、标题属性）
     SAIL_LANG.LL(zh, en)  纯文字；中英文 = 两行（confirm、较长的提示）
     SAIL_LANG.H(zh, en)   HTML；两种都输出，交给 CSS 显示 —— 切换语言不用重画
     SAIL_LANG.on(fn)      切换后要重画的东西
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  var LANGS = ['zh', 'en', 'bi'];
  var KEY = root.getAttribute('data-lang-scope') === 'staff' ? 'sail-staff-lang' : 'sail-lang';
  var subs = [];

  function valid(l) { return LANGS.indexOf(l) > -1 ? l : null; }
  function get() { return valid(root.getAttribute('data-lang')) || 'zh'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'content'];
  /** 把 data-<属性>-zh / -en（与 data-text-zh / -en）套到元素上 */
  function localize(scope) {
    scope = scope || document;
    var sel = ATTRS.map(function (a) { return '[data-' + a + '-zh]'; }).concat('[data-text-zh]').join(',');
    var list = Array.prototype.slice.call(scope.querySelectorAll(sel));
    if (scope.nodeType === 1 && scope.matches(sel)) list.unshift(scope);
    list.forEach(function (el) {
      ATTRS.forEach(function (a) {
        var zh = el.getAttribute('data-' + a + '-zh');
        if (zh == null) return;
        var en = el.getAttribute('data-' + a + '-en');
        el.setAttribute(a, L(zh, en == null ? zh : en));
      });
      var tz = el.getAttribute('data-text-zh');
      if (tz != null) {
        var te = el.getAttribute('data-text-en');
        el.textContent = L(tz, te == null ? tz : te);
      }
    });
  }

  function paintButtons() {
    var l = get();
    Array.prototype.forEach.call(document.querySelectorAll('[data-set-lang]'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === l));
    });
  }

  function set(l, opts) {
    l = valid(l) || 'zh';
    opts = opts || {};
    var changed = l !== root.getAttribute('data-lang');
    root.setAttribute('data-lang', l);
    root.setAttribute('lang', l === 'en' ? 'en' : 'zh-Hans');   // 中英文以华文为主
    paintButtons();
    localize(document);
    if (opts.save !== false) { try { localStorage.setItem(KEY, l); } catch (e) {} }
    // 用 ?lang= 打开的页面：网址跟着改，重新整理不会又跳回原来的语言
    if (opts.save !== false && window.history && history.replaceState) {
      try {
        var u = new URL(location.href);
        if (u.searchParams.has('lang') && u.searchParams.get('lang') !== l) {
          u.searchParams.set('lang', l);
          history.replaceState(history.state, '', u.toString());
        }
      } catch (e) {}
    }
    if (changed || opts.force) subs.forEach(function (fn) { try { fn(l); } catch (e) { console.error(e); } });
    return l;
  }

  function L(zh, en) {
    var l = get();
    if (l === 'en') return en;
    if (l === 'zh' || zh === en || !en) return zh;
    return zh + ' / ' + en;
  }
  function LL(zh, en) {
    var l = get();
    if (l === 'en') return en;
    if (l === 'zh' || zh === en || !en) return zh;
    return zh + '\n' + en;
  }
  function H(zh, en) {
    return '<span class="zh">' + esc(zh) + '</span><span class="en">' + esc(en) + '</span>';
  }

  /* 启动：网址 > 上次选的 > 页面预设 */
  var fromUrl = null, stored = null;
  try { fromUrl = valid(new URLSearchParams(location.search).get('lang')); } catch (e) {}
  try { stored = valid(localStorage.getItem(KEY)); } catch (e) {}
  var first = fromUrl || stored || valid(root.getAttribute('data-lang')) || 'zh';
  root.setAttribute('data-lang', first);
  root.setAttribute('lang', first === 'en' ? 'en' : 'zh-Hans');
  if (fromUrl) { try { localStorage.setItem(KEY, fromUrl); } catch (e) {} }

  // 按钮可能是之后才画出来的：事件挂在 document 上
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-set-lang]');
    if (!b) return;
    e.preventDefault();
    set(b.getAttribute('data-set-lang'));
  });
  function ready() { paintButtons(); localize(document); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();

  window.SAIL_LANG = {
    LANGS: LANGS,
    NAMES: { zh: '华文', en: 'English', bi: '中英文' },
    get: get,
    set: set,
    on: function (fn) { subs.push(fn); },
    L: L, LL: LL, H: H,
    localize: localize,
    paintButtons: paintButtons
  };
})();
