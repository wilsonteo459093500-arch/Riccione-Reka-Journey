/* ============================================================
   VISI · 导出 PPTX（方案 2.0：16:9 = 13.333 × 7.5 in，PowerPoint 宽屏）
   ------------------------------------------------------------
   为什么这样做：PPTX 要跟网页预览 / PDF 是同一个版面，业务在 PowerPoint 里还能改字。
   所以这里不另外排一次版 —— 把方案照预览一样排一份（1280 × 720、scale 1、放在画面外），
   逐页量出每一块的位置：照片、色块、细线、每一段字，照原座标放进 PPTX（px ÷ 96 = in）。
   deck.css 以后改了版面，PPTX 自动跟着变，这里不用改。
   - 字：每段字一个可以编辑的文字框（不是截图），基线对齐网页。
   - 照片：嵌进档案（base64），照网页的 object-fit / object-position 裁切，不变形。
   - 字太多：先照 app.js 的 fitText 缩字（tight / tighter）；还放不下时，网页 overflow:hidden 裁掉的行和细线
     PPT 也不放（不然会整段压到页脚上，跟预览 / PDF 不一样）。
   - 每页附讲稿：copy.js 的 MB.pageNotes，照方案语言：华文给华文、英文给英文；双语给两段（华文在前、英文跟在后，
     跟页面一样）—— 双语方案的客户家里两种语言都有人看，销售讲哪一种都有稿可念。
   - 字体用老板电脑上装的名字（照 HIPPO 那份 PPT 用的）：
       英文大写 / 数字 / 英文正文 Outfit（细 = Outfit Light、中 = Outfit Medium）
       英文衬线标题 Ogg（网页用 Cormorant 暂代；Ogg 比较宽，字号乘 0.9，免得多换一行）
       华文标题 思源宋体 CN SemiBold（大字）/ 思源宋体 CN Medium，华文正文 HarmonyOS Sans SC Medium
     一段字里英文用英文字体、华文用华文字体（PPT 的 latin / ea 两种字体），跟网页的字体退路一样。
   - 客户也可能用 WPS / LibreOffice 打开，所以不用这三样（它们会画错）：竖排文字（eaVert）、
     半透明的字、tab 停驻点；换成一字一行、混好的不透明颜色、拆开的两个文字框。多行的字照网页的换行点断。
   - pptxgenjs（assets/vendor/pptxgenjs/，MIT）第一次导出才载入，平常不拖慢 VISI。
   对外：MB.exportPptx(p, ctx) → 下载「MB.fileTitle(p).pptx」；MB.buildPptx(p, ctx) → { blob, name, slides }。
   ctx 跟 MB.renderDeck 同一份（app.js 的 deckCtx）。
   ============================================================ */
(function () {
  'use strict';

  var MB = window.MB = window.MB || {};
  var LIB = 'assets/vendor/pptxgenjs/pptxgen.bundle.js';
  var MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  var W = 1280, H = 720;      // 页面逻辑尺寸（deck.css）
  var IN = 1 / 96;            // px → in
  var PT = 0.75;              // px → pt
  var OGG = 0.9;              // Cormorant（网页）→ Ogg（PPT）：Ogg 字面宽，缩一点才不会多换行
  var CJK = /[⺀-〿㐀-鿿豈-﫿＀-￯]/;
  var FONT = {
    en: 'Outfit', enLight: 'Outfit Light', enMed: 'Outfit Medium', serif: 'Ogg',
    zhTitle: '思源宋体 CN SemiBold', zhSerif: '思源宋体 CN Medium', zhSans: 'HarmonyOS Sans SC Medium'
  };
  // 跟 app.js 的 fitText 同一组、同一个先后（一页只量第一个找得到的）：
  // .iv-flow = 邀约页右栏（三样 + 时段 + 联络），三样写长了预览会缩字，PPTX 也要跟着缩
  var FIT = ['.nd-list', '.pl-side', '.rm-txt', '.lt-body', '.pr-body', '.cs-list', '.iv-flow'];
  var loading = null;

  /* ---------- 载入 pptxgenjs（第一次导出才载） ------------------ */
  function loadLib() {
    if (window.PptxGenJS) return Promise.resolve(window.PptxGenJS);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = LIB;
      s.onload = function () {
        if (window.PptxGenJS) resolve(window.PptxGenJS);
        else { loading = null; reject(new Error('PPTX 工具载入失败')); }
      };
      s.onerror = function () { loading = null; reject(new Error('PPTX 工具载入失败，检查网络后重试')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  /* ---------- 对外 ------------------------------------------ */
  /** 做好就下载；回 Promise（app.js 的按钮会等它，失败会提示） */
  MB.exportPptx = function (p, ctx) {
    return MB.buildPptx(p, ctx).then(function (out) { save(out.blob, out.name); return out; });
  };

  /** 只做不下载（测试也用）：Promise<{ blob, name, slides }> */
  MB.buildPptx = function (p, ctx) {
    ctx = ctx || {};
    var host = null;
    function done() { if (host && host.parentNode) host.parentNode.removeChild(host); host = null; }
    return loadLib().then(function () {
      host = stage(p, ctx);
      return settle(host);
    }).then(function () {
      fit(host);
      var list = MB.pageList(p, ctx.resolve);
      var pages = Array.prototype.map.call(host.querySelectorAll('.pg'), function (el, i) {
        return { pg: list[i] || { type: (/\bpg-(\w+)/.exec(el.className) || [])[1] }, plan: collect(el) };
      });
      done();
      return embed(pages).then(function () { return pages; });
    }).then(function (pages) {
      var pres = build(p, pages);
      return pres.write({ outputType: 'arraybuffer', compression: true }).then(polish).then(function (blob) {
        return { blob: blob, name: fileName(p), slides: pages.length };
      });
    }).then(function (out) { done(); return out; }, function (err) { done(); throw err; });
  };

  function fileName(p) {
    // Windows 档名不能有 \ / : * ? " < > |
    return String(MB.fileTitle(p)).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.pptx';
  }

  function save(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 8000);
  }

  /* ---------- 1 · 在画面外照预览排一份（scale 1） ----------------- */
  function stage(p, ctx) {
    var host = document.createElement('div');
    host.className = 'deck lang-' + p.lang;
    host.setAttribute('aria-hidden', 'true');
    // 不能用 visibility:hidden：下面量字的时候会把整份当成看不见
    host.style.cssText = 'position:fixed;left:-40000px;top:0;width:' + W + 'px;padding:0;margin:0;pointer-events:none;';
    host.style.setProperty('--s', '1');
    host.innerHTML = MB.renderDeck(p, ctx);
    document.body.appendChild(host);
    return host;
  }

  /** 等图与字体都到位（量得才准）；最多等 20 秒，网络慢也不会一直卡住 */
  function settle(host) {
    void host.offsetHeight;   // 先排版，字体才会开始载
    var waits = Array.prototype.map.call(host.querySelectorAll('img'), function (im) {
      if (im.complete) return Promise.resolve();
      return new Promise(function (res) { im.addEventListener('load', res); im.addEventListener('error', res); });
    });
    if (document.fonts && document.fonts.ready) waits.push(document.fonts.ready);
    return Promise.race([Promise.all(waits), new Promise(function (res) { setTimeout(res, 20000); })]);
  }

  /** 字太多先缩一号、再缩一号（跟 app.js 的 fitText 一样），PPTX 才跟预览同样大小 */
  function fit(host) {
    Array.prototype.forEach.call(host.querySelectorAll('.pg'), function (pg) {
      var box = null;
      for (var i = 0; i < FIT.length && !box; i++) box = pg.querySelector(FIT[i]);
      if (!box) return;
      function tooTall() { return box.scrollHeight > box.clientHeight + 2; }
      pg.classList.remove('tight', 'tighter');
      if (!box.clientHeight || !tooTall()) return;
      pg.classList.add('tight');
      if (tooTall()) pg.classList.add('tighter');
    });
  }

  /* ---------- 2 · 量一页：照片、色块、细线、每段字 ------------------ */
  function px(v) { return parseFloat(v) || 0; }
  /** 'rgb(…)' / 'rgba(…)' → { hex:'RRGGBB', a }；透明回 null */
  function color(s) {
    var m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(s || '');
    if (!m) return null;
    var a = m[4] == null ? 1 : /%$/.test(m[4]) ? parseFloat(m[4]) / 100 : +m[4];
    if (!(a > 0.004)) return null;
    var hex = [m[1], m[2], m[3]].map(function (v) {
      var h = Math.max(0, Math.min(255, Math.round(+v))).toString(16);
      return h.length < 2 ? '0' + h : h;
    }).join('').toUpperCase();
    return { hex: hex, a: a };
  }
  function pct(v, dflt) {
    if (/%$/.test(v || '')) return parseFloat(v) / 100;
    return { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 }[v] != null ? { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 }[v] : dflt;
  }
  function hit(b, c) { return b.x < c.x + c.w && b.x + b.w > c.x && b.y < c.y + c.h && b.y + b.h > c.y; }
  function clipTo(a, b) {
    var x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
    return { x: x, y: y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) };
  }
  function grow(b, d) { return { x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d }; }
  /** box-shadow 第一层：'rgba(…) 0px 6px 16px 0px [inset]' */
  function shadowOf(s) {
    if (!s || s === 'none') return null;
    var first = splitTop(s)[0] || '';
    var c = /rgba?\([^)]*\)/.exec(first);
    var nums = first.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/g) || [];
    return { color: c ? color(c[0]) : null, x: px(nums[0]), y: px(nums[1]), blur: px(nums[2]), spread: px(nums[3]), inset: /inset/.test(first) };
  }
  /** 依最外层的逗号切开（括号里的逗号不切） */
  function splitTop(s) {
    var out = [], d = 0, cur = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '(') d++;
      if (ch === ')') d--;
      if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  /** 一页 → { bg, items }；items 照画的先后（DOM 顺序），座标单位 px */
  function collect(pgEl) {
    var pr = pgEl.getBoundingClientRect();
    var P = { left: pr.left, top: pr.top, k: pr.width / W || 1 };
    var items = [];
    var page = { x: 0, y: 0, w: W, h: H };
    function rel(r) { return { x: (r.left - P.left) / P.k, y: (r.top - P.top) / P.k, w: r.width / P.k, h: r.height / P.k }; }

    function visit(el, st) {
      if (el.nodeType !== 1) return;
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.classList.contains('todo')) return;   // .todo 打印时也藏
      var op = st.op * (cs.opacity === '' ? 1 : +cs.opacity);
      if (op < 0.02) return;
      var tag = el.tagName.toLowerCase();
      var b = rel(el.getBoundingClientRect());
      // 被 overflow:hidden 整个藏掉的（网页上看不到，PPT 也不放）。
      // 0 高 / 0 宽的外框（.rm-imgs）不算：里面的照片是绝对定位的，跑在外框外面
      if (b.w > 0 && b.h > 0 && !hit(b, st.clip)) return;
      var link = st.link;
      var href = tag === 'a' ? el.getAttribute('href') || '' : '';
      if (/^(https?:|mailto:|tel:)/i.test(href)) link = el.href;
      decor(el, cs, b, op, st.clip);
      if (tag === 'img') { photo(el, cs, b, op, link); return; }
      if (tag === 'svg') { items.push({ k: 'svg', el: el, x: b.x, y: b.y, w: b.w, h: b.h, op: op, link: link, name: 'QR code' }); return; }
      before(el, b, op, st.clip);
      var abs = [];
      // 自己 overflow:hidden 的框，里面的字也只留框里看得到的
      var clip = cs.overflow === 'visible' ? st.clip : clipTo(st.clip, b);
      if (isLeaf(el, abs)) {
        text(Array.prototype.slice.call(el.childNodes), el, cs, op, link, clip);
        abs.forEach(function (c) { visit(c, { op: op, clip: st.clip, link: link }); });
        return;
      }
      var sub = { op: op, clip: clip, link: link };
      // 块里夹着的零散字（匿名行）：几个连在一起的当一段
      var group = [];
      function flush() { if (group.length) { text(group, el, cs, op, link, clip); group = []; } }
      Array.prototype.forEach.call(el.childNodes, function (c) {
        if (c.nodeType === 3) { if (/\S/.test(c.nodeValue)) group.push(c); return; }
        if (c.nodeType !== 1) return;
        var ccs = getComputedStyle(c);
        if (/^inline/.test(ccs.display) && ccs.position === 'static' && !/^(IMG|svg)$/.test(c.tagName) && isLeaf(c, [])) { group.push(c); return; }
        flush();
        visit(c, sub);
      });
      flush();
    }

    /** 只含行内字的块（span / b / i / a / br…）= 一个文字框；绝对定位的子元素另外量 */
    function isLeaf(el, abs) {
      var has = false, ok = true;
      (function scan(n) {
        Array.prototype.forEach.call(n.childNodes, function (c) {
          if (!ok) return;
          if (c.nodeType === 3) { if (/\S/.test(c.nodeValue)) has = true; return; }
          if (c.nodeType !== 1) return;
          var cs = getComputedStyle(c);
          if (cs.display === 'none' || c.classList.contains('todo')) return;
          if (cs.position === 'absolute' || cs.position === 'fixed') { abs.push(c); return; }
          var t = c.tagName.toLowerCase();
          if (t === 'br') return;
          if (t === 'img' || t === 'svg' || t === 'figure' || t === 'canvas' || !/^inline/.test(cs.display)) { ok = false; return; }
          scan(c);
        });
      })(el);
      return ok && has;
    }

    /** 底色、渐层、边线、阴影。clip = 外层 overflow:hidden 的框：伸出去的那一截网页上看不到，PPT 也裁掉
        （字太多缩到 tighter 还放不下时，最后一条卖点的底线不会压到页脚） */
    function decor(el, cs, b, op, clip) {
      if (el.tagName === 'IMG' || el.tagName.toLowerCase() === 'svg') return;
      var sh = shadowOf(cs.boxShadow);
      var oval = /%/.test(cs.borderTopLeftRadius) ? parseFloat(cs.borderTopLeftRadius) >= 50
        : px(cs.borderTopLeftRadius) >= Math.min(b.w, b.h) / 2 - 1 && px(cs.borderTopLeftRadius) > 0;
      var sides = ['Top', 'Right', 'Bottom', 'Left'].map(function (s) {
        var w = px(cs['border' + s + 'Width']), st = cs['border' + s + 'Style'], c = color(cs['border' + s + 'Color']);
        return w > 0 && st !== 'none' && st !== 'hidden' && c ? { w: w, c: c } : null;
      });
      var uni = sides.every(function (s) { return s && s.w === sides[0].w && s.c.hex === sides[0].c.hex; }) && sides[0].w >= 2;
      function add(it) { it = trim(it, clip); if (it) items.push(it); }
      // 地图编号外的白圈（box-shadow 0 0 0 3px）
      if (sh && !sh.inset && !sh.blur && sh.spread > 0 && sh.color) add(fill(grow(b, sh.spread), sh.color, op, oval));
      var drop = sh && !sh.inset && sh.blur > 0 && sh.color ? sh : null;
      // 粗边框（参考图的米色相框）：先画边框色的底，再画里面
      if (uni) { add(fill(b, sides[0].c, op, oval, drop)); drop = null; }
      var box = uni ? grow(b, -sides[0].w) : b;
      if (/gradient\(/.test(cs.backgroundImage || '')) items.push({ k: 'grad', css: cs.backgroundImage, x: box.x, y: box.y, w: box.w, h: box.h, op: op, name: cls(el) });
      var bg = color(cs.backgroundColor);
      // 照片框的底色（#E4DCCF）被照片盖住就不画，PPT 里少一个没用的方块
      var im = el.classList.contains('ph') ? el.querySelector('img') : null;
      if (bg && el.parentNode && !(im && im.naturalWidth)) {
        var f = fill(box, bg, op, oval, drop);
        if (sh && sh.inset && !sh.blur && sh.spread > 0 && sh.color) f.line = { c: sh.color, w: sh.spread };   // 色块的细外框
        add(f);
      }
      if (!uni) sides.forEach(function (s, i) { if (s) add(edge(i, b, s, op)); });
    }
    function fill(b, c, op, oval, drop) {
      return { k: 'fill', x: b.x, y: b.y, w: b.w, h: b.h, c: c, op: op, oval: !!oval, shadow: drop || null };
    }
    function edge(i, b, s, op) {
      var h = s.w / 2;
      if (i === 0) return { k: 'line', x: b.x, y: b.y + h, w: b.w, h: 0, c: s.c, op: op, lw: s.w };
      if (i === 2) return { k: 'line', x: b.x, y: b.y + b.h - h, w: b.w, h: 0, c: s.c, op: op, lw: s.w };
      if (i === 1) return { k: 'line', x: b.x + b.w - h, y: b.y, w: 0, h: b.h, c: s.c, op: op, lw: s.w };
      return { k: 'line', x: b.x + h, y: b.y, w: 0, h: b.h, c: s.c, op: op, lw: s.w };
    }
    /** 色块 / 细线裁到 clip 里；整个在外面回 null。圆的（地图编号）不裁：裁了会变形，整个在外面才不放 */
    function trim(it, clip) {
      if (!clip) return it;
      var e = 0.5;   // 贴着框边的线（框的上缘线）不算出界
      if (it.k === 'line') {
        if (!it.h && (it.y < clip.y - e || it.y > clip.y + clip.h + e)) return null;
        if (!it.w && (it.x < clip.x - e || it.x > clip.x + clip.w + e)) return null;
        var x0 = Math.max(it.x, clip.x), x1 = Math.min(it.x + it.w, clip.x + clip.w);
        var y0 = Math.max(it.y, clip.y), y1 = Math.min(it.y + it.h, clip.y + clip.h);
        if (it.w) { if (x1 - x0 <= e) return null; it.x = x0; it.w = x1 - x0; }
        if (it.h) { if (y1 - y0 <= e) return null; it.y = y0; it.h = y1 - y0; }
        return it;
      }
      if (!hit(it, grow(clip, e))) return null;
      if (it.oval) return it;
      var c = clipTo(it, clip);
      if (c.w <= e || c.h <= e) return null;
      it.x = c.x; it.y = c.y; it.w = c.w; it.h = c.h;
      return it;
    }

    function photo(im, cs, b, op, link) {
      if (!im.naturalWidth) return;   // 没载入：留着 .ph 的底色
      var pos = (cs.objectPosition || '50% 50%').split(/\s+/);
      items.push({ k: 'img', src: im.currentSrc || im.src, nw: im.naturalWidth, nh: im.naturalHeight,
        x: b.x, y: b.y, w: b.w, h: b.h, fit: cs.objectFit || 'fill', px: pct(pos[0], 0.5), py: pct(pos[1], 0.5), op: op, link: link,
        name: im.classList.contains('logo') ? 'Logo' : 'Photo ' + cls(im.parentNode) });
    }

    /** ::before 的编号（空间页卖点的 01 02 03）；编号在外框裁掉的地方就不放 */
    function before(el, b, op, clip) {
      var ps = getComputedStyle(el, '::before');
      var c = ps.content;
      if (!c || c === 'none' || c === 'normal' || ps.display === 'none') return;
      var t = '';
      var q = /^["'](.*)["']$/.exec(c);
      if (q) t = q[1];
      else if (/counter\(/.test(c)) {
        var n = 1, s = el;
        while ((s = s.previousElementSibling)) if (s.tagName === el.tagName) n++;
        t = /leading-zero/.test(c) ? (n < 10 ? '0' : '') + n : String(n);
      }
      if (!t.trim()) return;
      var fs = px(ps.fontSize), lh = ps.lineHeight === 'normal' ? fs * 1.2 : px(ps.lineHeight);
      var x = b.x + (ps.position === 'absolute' ? px(ps.left) : px(getComputedStyle(el).paddingLeft));
      var y = b.y + (ps.position === 'absolute' ? px(ps.top) : px(getComputedStyle(el).paddingTop));
      if (ps.textTransform === 'uppercase') t = t.toUpperCase();
      var run = runOf(t, ps, op, null);
      // 伪元素量不到字框：照 CSS 行高推（字的内容高约 1.26 em）
      var cH = fs * 1.26;
      if (clip && (y + lh / 2 > clip.y + clip.h || y + lh / 2 < clip.y)) return;
      items.push({ k: 'text', x: x, y: y + (lh - cH) / 2 + cH - lh, w: Math.max(24, t.length * fs), h: lh,
        paras: [{ runs: [run], align: 'left', ls: lh }], wrap: false, name: cls(el) + ' no' });
    }

    /** 一段字 → 文字框（位置用字真正画出来的地方：基线跟网页对齐）。
        clip = 外层 overflow:hidden 的框：缩到 tighter 还放不下时，网页把多的行裁掉，PPT 也只放看得到的行
        （不然那几行会整段压到页脚上） */
    function text(nodes, box, cs, op, link, clip) {
      // inline-block 撑出来的栏（「YOUR PROJECT」那一栏 min-width 132px）：拆成两个文字框，
      // 各放在网页上的位置（PPT 的 tab 停驻点 LibreOffice / WPS 不认）
      for (var ci = 0; ci < nodes.length - 1; ci++) {
        if (isColumn(nodes[ci])) {
          text(nodes.slice(0, ci + 1), box, cs, op, link, clip);
          text(nodes.slice(ci + 1), box, cs, op, link, clip);
          return;
        }
      }
      var bb = rel(box.getBoundingClientRect());
      var cb = { x: bb.x + px(cs.paddingLeft) + px(cs.borderLeftWidth), y: bb.y + px(cs.paddingTop) + px(cs.borderTopWidth) };
      cb.w = Math.max(1, bb.w - px(cs.paddingLeft) - px(cs.paddingRight) - px(cs.borderLeftWidth) - px(cs.borderRightWidth));
      cb.h = Math.max(1, bb.h - px(cs.paddingTop) - px(cs.paddingBottom) - px(cs.borderTopWidth) - px(cs.borderBottomWidth));
      // 字真正画在哪里（每一行一个框）
      var rects = [];
      var cut = ellipsis(box, cs, nodes);
      textNodes(nodes).forEach(function (tn) {
        var r = document.createRange();
        r.selectNodeContents(tn);
        if (cut && cut.node === tn) r.setEnd(tn, cut.at);
        Array.prototype.forEach.call(r.getClientRects(), function (q) { if (q.width > 0.5 && q.height > 0.5) rects.push(rel(q)); });
      });
      if (!rects.length) return;
      var name = cls(box);
      // 竖排（封面右边的华文签名）：一个字一行、照网页量到的位置排。
      // 不用 PPT 的竖排（eaVert）：LibreOffice / WPS 排过一次竖的，之后同样的字横排也会乱掉
      if (/^vertical/.test(cs.writingMode)) { stack(nodes, cb, cs, op, name); return; }
      rects.sort(function (a, b) { return a.y - b.y; });
      var lines = [];
      rects.forEach(function (q) {
        var L = lines[lines.length - 1];
        // 同一行 = 上下重叠超过小的那个字一半。不能只比顶端：工期页「1年」的小字「年」贴着大字的基线，
        // 顶端比大字低一截，比顶端会当成第二行，整个框往下掉
        var ov = L ? Math.min(L.y + L.h, q.y + q.h) - Math.max(L.y, q.y) : 0;
        if (L && ov > Math.min(L.h, q.h) * 0.5) { L.x2 = Math.max(L.x2, q.x + q.w); L.x = Math.min(L.x, q.x); L.h = Math.max(L.h, q.y + q.h - L.y); }
        else lines.push({ x: q.x, y: q.y, h: q.h, x2: q.x + q.w });
      });
      // 多行：网页在哪里换行，PPT 就在哪里换（软换行）。华文可以在任何两个字之间断，
      // 不照网页断的话，「PANEL WARRANTY 板材质保」会变成「… 板 / 材质保」
      var breaks = lines.length > 1 ? breaksOf(nodes, lines) : null;
      // 字的中线落在 clip 外面的行，网页上看不到（顶多露出一点点）：从那一行的第一个字起不放（不加「…」）
      if (clip) {
        var keep = 0;
        while (keep < lines.length && lines[keep].y + lines[keep].h / 2 <= clip.y + clip.h) keep++;
        if (!keep) return;
        if (keep < lines.length) {
          var from = (breaks || []).filter(function (b) { return b.line >= keep; })[0];
          if (from) { cut = { node: from.node, at: from.at, hard: true }; lines = lines.slice(0, keep); }
        }
      }
      var paras = runsOf(nodes, op, link, cut, breaks);
      if (!paras.length) return;
      var lh = cs.lineHeight === 'normal' ? px(cs.fontSize) * 1.25 : px(cs.lineHeight);
      var first = lines[0], last = lines[lines.length - 1];
      var ls = Math.max(lh, 1);
      // 多行：行距用网页量到的（第一行到最后一行平均），PowerPoint 才排得一样高
      if (lines.length > 1) ls = (last.y + last.h - first.y - first.h) / (lines.length - 1);
      // PowerPoint / LibreOffice 的「固定行距」：多出来的空间放在字的上面 → 基线 = 框顶 + 行距 − 字的下伸
      var y = first.y + first.h - ls;
      var align = { center: 'center', right: 'right', end: 'right', justify: 'left' }[cs.textAlign] || 'left';
      var tL = Infinity, tR = -Infinity;
      lines.forEach(function (L) { tL = Math.min(tL, L.x); tR = Math.max(tR, L.x2); });
      var out = { k: 'text', paras: paras, name: name, valign: 'top' };
      // 一行的英文衬线整句（「你们说的」页的引言）：几乎占满一栏。没装 Ogg 的电脑换成别的衬线字，
      // 字面宽一点、又不换行，就会冲进隔壁一栏 —— 这种句子让它在自己这一栏里换行，框多留 8%
      var txt = paras.map(function (pa) { return pa.runs.map(function (r) { return r.text; }).join(''); }).join(' ');
      var serif = paras.some(function (pa) { return pa.runs.some(function (r) { return /^Ogg\|/.test(r.options.fontFace) && !CJK.test(r.text); }); });
      var col = Math.max(cb.x + cb.w, tR) - Math.min(cb.x, tL);
      var sentence = lines.length === 1 && serif && !cut && !/nowrap|pre$/.test(cs.whiteSpace) && px(cs.fontSize) < 30 &&
        (txt.match(/[A-Za-z][A-Za-z’'\-]*/g) || []).length >= 4 && tR - tL >= col * 0.6;
      if (lines.length === 1 && !sentence) {
        // 一行字：不换行，免得字体宽一点就掉到第二行；对齐看字实际在框里的位置（地图编号是 grid 置中的）
        if (align === 'left' && tL - cb.x > 1.5 && Math.abs((tL + tR) / 2 - (cb.x + cb.w / 2)) < 1.5) align = 'center';
        out.wrap = false;
        if (align === 'center') { out.x = Math.min(cb.x, tL); out.w = Math.max(cb.x + cb.w, tR) - out.x; }
        else if (align === 'right') { out.x = Math.min(cb.x, tL); out.w = tR - out.x; }
        else { out.x = tL; out.w = Math.max(cb.x + cb.w, tR) - tL; }
        out.h = ls;
      } else {
        // 多行：行已经照网页断好了；框留 6% 余量（字体宽一点也不会在行中间再多断一次）
        out.wrap = true;
        var x0 = Math.min(cb.x, tL), x1 = Math.max(cb.x + cb.w, tR), extra = (x1 - x0) * (sentence ? 0.08 : 0.06) + 2;
        // 余量加在对齐的反方向：靠左往右加、靠右往左加、置中两边各一半（中线不能跑掉）
        if (align === 'right') x0 = Math.max(0, x0 - extra);
        else if (align === 'center') { x0 = Math.max(0, x0 - extra / 2); x1 = Math.min(W, x1 + extra / 2); }
        else x1 = Math.min(W, x1 + extra);
        out.x = x0; out.w = x1 - x0;
        out.h = ls * lines.length;
      }
      out.y = y;
      paras.forEach(function (pa) {
        pa.align = align; pa.ls = ls;
      });
      items.push(out);
    }

    /** 每一行从哪个字开始（第二行起）：[{ node, at, line }]，照网页量到的行 */
    function breaksOf(nodes, lines) {
      var out = [], prev = 0, r = document.createRange();
      function lineOf(q) {
        var cy = (q.top - P.top) / P.k + q.height / P.k / 2;
        for (var i = lines.length - 1; i >= 0; i--) if (cy >= lines[i].y - 1) return i;
        return 0;
      }
      textNodes(nodes).forEach(function (tn) {
        var s = tn.nodeValue;
        for (var i = 0; i < s.length; i++) {
          if (/\s/.test(s.charAt(i))) continue;
          r.setStart(tn, i); r.setEnd(tn, i + 1);
          var q = r.getBoundingClientRect();
          if (!q.width && !q.height) continue;
          var L = lineOf(q);
          if (L > prev) { out.push({ node: tn, at: i, line: L }); prev = L; }
        }
      });
      return out;
    }

    /** 竖排的字 → 一个字一行（横排、置中），每一行的间距照网页量到的字距 */
    function stack(nodes, cb, cs, op, name) {
      var r = document.createRange(), chars = [];
      textNodes(nodes).forEach(function (tn) {
        var s = tn.nodeValue;
        for (var i = 0; i < s.length; i++) {
          if (/\s/.test(s.charAt(i))) continue;
          r.setStart(tn, i); r.setEnd(tn, i + 1);
          var q = r.getBoundingClientRect();
          chars.push({ ch: s.charAt(i), y: (q.top - P.top) / P.k, cs: getComputedStyle(tn.parentNode) });
        }
      });
      if (!chars.length) return;
      var fs = px(cs.fontSize), adv = fs + px(cs.letterSpacing);
      var paras = chars.map(function (c, i) {
        var run = runOf(c.ch, c.cs, op, null);
        delete run.options.charSpacing;
        return { runs: [run], align: 'center', ls: i ? c.y - chars[i - 1].y : adv };
      });
      // 第一个字的方块顶 = 网页上的顶：基线 = 框顶 + 行距 − 下伸（约 0.29 em），华文字面顶在基线上 0.88 em
      var top = chars[0].y + 0.88 * fs - paras[0].ls + 0.29 * fs;
      items.push({ k: 'text', x: cb.x, y: top, w: cb.w, h: chars[chars.length - 1].y + adv - top, paras: paras, wrap: true, name: name + ' vertical' });
    }

    /** nowrap + text-overflow:ellipsis 的字被截掉了：找出网页上看得到的最后一个字 */
    function ellipsis(box, cs, nodes) {
      if (cs.textOverflow !== 'ellipsis' || box.scrollWidth <= box.clientWidth + 1) return null;
      var limit = box.getBoundingClientRect().right - px(cs.paddingRight) - px(cs.fontSize) * 0.9;
      var tns = textNodes(nodes), r = document.createRange();
      for (var i = 0; i < tns.length; i++) {
        var s = tns[i].nodeValue;
        for (var j = 0; j < s.length; j++) {
          r.setStart(tns[i], j); r.setEnd(tns[i], j + 1);
          var q = r.getBoundingClientRect();
          if (q.width && q.right > limit) return { node: tns[i], at: j };
        }
      }
      return null;
    }

    /** 行内的字 → 段落与 run（字体、字号、颜色、字距、链接） */
    function runsOf(nodes, op, link, cut, breaks) {
      var paras = [{ runs: [] }];
      var stop = false, soft = false;
      function cur() { return paras[paras.length - 1]; }
      function add(t, cs, lnk) {
        if (!t) return;
        var pa = cur(), prev = pa.runs[pa.runs.length - 1];
        // 网页在这里换行：前一行行尾的空白拿掉，这一个 run 前面加软换行
        if (soft && prev) {
          while (pa.runs.length > 1 && !/\S/.test(prev.text)) { pa.runs.pop(); prev = pa.runs[pa.runs.length - 1]; }   // 只剩空白的 run（margin 变的空格）
          prev.text = prev.text.replace(/ +$/, '');
          t = t.replace(/^ +/, '');
        }
        // 空白照 CSS 合并：段首不要空白，两段之间只留一个
        if (!prev || /[ \t]$/.test(prev.text)) t = t.replace(/^ +/, '');
        if (!t) return;
        var run = runOf(t, cs, op, lnk);
        if (soft && prev) run.options.softBreakBefore = true;
        soft = false;
        pa.runs.push(run);
      }
      function gap(w, cs) {
        var fs = px(cs.fontSize) || 12;
        var n = Math.max(1, Math.min(4, Math.round(w / (fs * 0.3 + px(cs.letterSpacing)))));
        var pa = cur();
        if (pa.runs.length) pa.runs.push(runOf(new Array(n + 1).join(' '), cs, op, null));
      }
      function walk(n, lnk) {
        if (stop) return;
        if (n.nodeType === 3) {
          var s = n.nodeValue;
          // 网页用「…」截掉的（nowrap）补「…」；被外框裁掉的行（hard）直接停
          if (cut && cut.node === n) { s = s.slice(0, cut.at).replace(/\s+$/, '') + (cut.hard ? '' : '…'); stop = true; }
          var pcs = getComputedStyle(n.parentNode);
          // 照网页的换行点切开（切点是原字串的位置，先切再合并空白）
          var at = (breaks || []).filter(function (b) { return b.node === n; }).map(function (b) { return b.at; });
          var pieces = [], from = 0;
          at.forEach(function (k) { pieces.push(s.slice(from, k)); from = k; });
          pieces.push(s.slice(from));
          pieces.forEach(function (piece, i) {
            if (i) soft = true;
            piece = piece.replace(/\s+/g, ' ');
            if (pcs.textTransform === 'uppercase') piece = piece.toUpperCase();
            add(piece, pcs, lnk);
          });
          return;
        }
        if (n.nodeType !== 1) return;
        var cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed' || n.classList.contains('todo')) return;
        if (n.tagName === 'BR') { paras.push({ runs: [] }); return; }
        if (n.tagName === 'A' && /^(https?:|mailto:|tel:)/i.test(n.getAttribute('href') || '')) lnk = n.href;
        var ml = px(cs.marginLeft) + px(cs.paddingLeft), mr = px(cs.marginRight) + px(cs.paddingRight);
        if (ml >= 4) gap(ml, cs);
        // 空的细竖线（邀约页联络那一行的分隔）→ 一个竖线字
        if (!/\S/.test(n.textContent) && color(cs.backgroundColor) && n.getBoundingClientRect().width <= 3) {
          var bar = runOf('|', cs, op, null);
          bar.options.color = color(cs.backgroundColor).hex;
          delete bar.options.italic;   // 分隔线是 <i>：斜了会变成「/」
          add('  ', cs, null); cur().runs.push(bar); add('  ', cs, null);
          return;
        }
        Array.prototype.forEach.call(n.childNodes, function (c) { walk(c, lnk); });
        if (mr >= 4) gap(mr, cs);
      }
      nodes.forEach(function (n) { walk(n, link); });
      return paras.map(function (pa) {
        var r = pa.runs;
        while (r.length && !/\S/.test(r[r.length - 1].text)) r.pop();
        if (r.length) r[r.length - 1].text = r[r.length - 1].text.replace(/ +$/, '');
        return pa;
      }).filter(function (pa) { return pa.runs.length; });
    }

    (function () {
      Array.prototype.forEach.call(pgEl.childNodes, function (n) {
        if (n.nodeType === 1) visit(n, { op: 1, clip: page, link: null });
      });
    })();
    var bg = color(getComputedStyle(pgEl).backgroundColor);
    bg = bg ? bg.hex : 'F3EEE7';
    flatten(items, bg);
    return { bg: bg, items: items };
  }

  /** 半透明的字（照片上的白字 .82–.92、封面签名条）→ 不透明：
      LibreOffice / WPS 画「半透明 + 字距」的字会把每段最后几个字切掉。
      底下是纯色（色块 / 页底）就跟底色混出一样的颜色；底下是照片就直接用不透明（白字只亮一点点） */
  function flatten(items, pageBg) {
    items.forEach(function (it, i) {
      if (it.k !== 'text') return;
      var cx = it.x + Math.min(it.w, 40) / 2, cy = it.y + it.h / 2;
      var under = null;
      for (var j = i - 1; j >= 0 && !under; j--) {
        var u = items[j];
        if (u.k === 'text' || u.k === 'line') continue;
        if (cx >= u.x && cx <= u.x + u.w && cy >= u.y && cy <= u.y + u.h) under = u;
      }
      var solid = !under ? pageBg : under.k === 'fill' && under.c.a * under.op > 0.99 ? under.c.hex : null;
      it.paras.forEach(function (pa) {
        pa.runs.forEach(function (r) {
          var t = r.options.transparency;
          if (!t) return;
          var a = 1 - t / 100;
          if (solid) { r.options.color = mix(r.options.color, solid, a); delete r.options.transparency; }
          else if (a >= 0.6) delete r.options.transparency;
        });
      });
    });
  }
  function mix(fg, bg, a) {
    var out = '';
    for (var i = 0; i < 6; i += 2) {
      var v = Math.round(parseInt(fg.substr(i, 2), 16) * a + parseInt(bg.substr(i, 2), 16) * (1 - a)).toString(16);
      out += v.length < 2 ? '0' + v : v;
    }
    return out.toUpperCase();
  }

  /** 一个 inline-block、比里面的字宽一截（min-width 撑出来的栏） */
  function isColumn(n) {
    if (!n || n.nodeType !== 1 || !/\S/.test(n.textContent)) return false;
    if (getComputedStyle(n).display !== 'inline-block') return false;
    var rg = document.createRange();
    rg.selectNodeContents(n);
    return n.getBoundingClientRect().width - rg.getBoundingClientRect().width > 8;
  }

  function textNodes(nodes) {
    var out = [];
    (function walk(list) {
      list.forEach(function (n) {
        if (n.nodeType === 3) { if (/\S/.test(n.nodeValue)) out.push(n); return; }
        if (n.nodeType !== 1) return;
        var cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed' || n.classList.contains('todo')) return;
        walk(Array.prototype.slice.call(n.childNodes));
      });
    })(nodes);
    return out;
  }

  function cls(el) {
    var c = el && typeof el.className === 'string' ? el.className.split(/\s+/).filter(function (x) { return x && !/^(l-zh|l-en|ph)$/.test(x); })[0] : '';
    return c || (el && el.tagName ? el.tagName.toLowerCase() : 'text');
  }

  /** 网页的字体 → PPT 的字体（英文 | 华文）。照 HIPPO：衬线标题 Ogg + 思源宋体，正文 Outfit + HarmonyOS */
  function fontOf(cs, t) {
    var first = String(cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    var w = parseInt(cs.fontWeight, 10) || 400;
    var size = px(cs.fontSize);
    var zhSerif = size >= 22 || w >= 500 ? FONT.zhTitle : FONT.zhSerif;   // 大字（标题）用 SemiBold
    if (/cormorant|ogg|garamond|georgia/.test(first)) return { latin: FONT.serif, ea: FONT.zhSerif, scale: CJK.test(t) ? 1 : OGG };
    if (/serif sc|songti|simsun|思源宋体/.test(first)) return { latin: zhSerif, ea: zhSerif, scale: 1 };
    if (/sans sc|pingfang|yahei|harmony/.test(first)) return { latin: FONT.zhSans, ea: FONT.zhSans, scale: 1 };
    return { latin: w <= 300 ? FONT.enLight : w >= 500 ? FONT.enMed : FONT.en, ea: FONT.zhSans, scale: 1 };
  }

  /** 一个 run：pptxgenjs 的 { text, options } */
  function runOf(t, cs, op, link) {
    var f = fontOf(cs, t);
    var c = color(cs.color) || { hex: '1C1915', a: 1 };
    var o = {
      fontFace: f.latin + '|' + f.ea,   // 存档前拆成 latin / ea（polish）
      fontSize: Math.max(1, Math.round(px(cs.fontSize) * PT * f.scale * 100) / 100),
      color: c.hex,
      lang: CJK.test(t) ? 'zh-CN' : 'en-US'
    };
    var a = c.a * op;
    if (a < 0.995) o.transparency = Math.round((1 - a) * 100);
    if ((parseInt(cs.fontWeight, 10) || 400) >= 600) o.bold = true;
    if (cs.fontStyle === 'italic' || cs.fontStyle === 'oblique') o.italic = true;
    var sp = px(cs.letterSpacing);
    // 不到半个 px 的字距（衬线标题的 .01em）看不出来，不写：LibreOffice / WPS 遇到有字距的「Th」连字
    // 会画成「Th e」，客户用 WPS 打开就看得到
    if (Math.abs(sp) >= 0.5) o.charSpacing = Math.round(sp * PT * f.scale * 100) / 100;
    var deco = /underline/.test(cs.textDecorationLine || cs.textDecoration || '');
    if (link) {
      o.hyperlink = { url: link };
      if (!deco) o.underline = { style: 'none' };   // 网页上没底线的链接（QR 说明）PPT 也不要加
    } else if (deco) o.underline = { style: 'sng' };
    return { text: t, options: o };
  }

  /* ---------- 3 · 照片、渐层、QR 转成 PPT 收得下的图 -------------- */
  var cache = {};
  function dataOf(src) {
    if (!src) return Promise.resolve(null);
    if (cache[src]) return cache[src];
    var get = /^data:/.test(src) ? Promise.resolve(src) : fetch(src).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob();
    }).then(function (b) {
      return new Promise(function (res, rej) {
        var fr = new FileReader();
        fr.onload = function () { res(fr.result); };
        fr.onerror = rej;
        fr.readAsDataURL(b);
      });
    });
    cache[src] = get.then(function (d) {
      // PowerPoint 认得 png / jpeg / gif；webp、svg 之类先转成 jpeg / png
      if (/^data:image\/(png|jpe?g|gif);base64,/i.test(d)) return d;
      return reencode(d, /^data:image\/svg/i.test(d) ? 'image/png' : 'image/jpeg');
    }).catch(function () { return null; });
    return cache[src];
  }
  function reencode(d, type) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () {
        var c = document.createElement('canvas');
        c.width = im.naturalWidth || 800; c.height = im.naturalHeight || 800;
        var g = c.getContext('2d');
        if (type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
        g.drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL(type, 0.92));
      };
      im.onerror = function () { res(null); };
      im.src = d;
    });
  }
  /** CSS 线性渐层（照片上的暗角）→ 透明 PNG */
  function gradPng(css, w, h) {
    var k = 360 / Math.max(w, h, 1);
    var cw = Math.max(2, Math.round(w * k)), ch = Math.max(2, Math.round(h * k));
    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var g = c.getContext('2d');
    // CSS 第一层在最上面：从最后一层画起
    splitTop(css).reverse().forEach(function (layer) {
      var m = /^linear-gradient\(([\s\S]*)\)$/.exec(layer.trim());
      if (!m) return;
      var args = splitTop(m[1]), ang = 180;
      var a0 = args[0] || '';
      if (/^-?[\d.]+deg$/.test(a0)) { ang = parseFloat(a0); args.shift(); }
      else if (/^to /.test(a0)) {
        ang = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270 }[a0] != null ? { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270 }[a0] : 180;
        args.shift();
      }
      var stops = args.map(function (s) {
        var col = /rgba?\([^)]*\)|#[0-9a-f]{3,8}|\btransparent\b/i.exec(s);
        var pos = /(-?[\d.]+)%\s*$/.exec(s);
        return { c: col ? col[0] : 'transparent', p: pos ? +pos[1] / 100 : null };
      });
      if (!stops.length) return;
      if (stops[0].p == null) stops[0].p = 0;
      if (stops[stops.length - 1].p == null) stops[stops.length - 1].p = 1;
      for (var i = 1; i < stops.length - 1; i++) {
        if (stops[i].p != null) continue;
        var j = i;
        while (stops[j].p == null) j++;
        for (var q = i; q < j; q++) stops[q].p = stops[i - 1].p + (stops[j].p - stops[i - 1].p) * (q - i + 1) / (j - i + 1);
      }
      var r = ang * Math.PI / 180, dx = Math.sin(r), dy = -Math.cos(r);
      var L = Math.abs(cw * dx) + Math.abs(ch * dy);
      var gr = g.createLinearGradient(cw / 2 - dx * L / 2, ch / 2 - dy * L / 2, cw / 2 + dx * L / 2, ch / 2 + dy * L / 2);
      stops.forEach(function (s) { try { gr.addColorStop(Math.max(0, Math.min(1, s.p)), s.c); } catch (e) { /* 认不得的颜色跳过 */ } });
      g.fillStyle = gr;
      g.fillRect(0, 0, cw, ch);
    });
    return c.toDataURL('image/png');
  }
  /** QR（SVG）→ PNG：4 倍解析度，打印也清楚 */
  function svgPng(el, w, h) {
    return new Promise(function (res) {
      var clone = el.cloneNode(true);
      var cw = Math.max(64, Math.round(w * 4)), ch = Math.max(64, Math.round(h * 4));
      clone.setAttribute('width', cw); clone.setAttribute('height', ch);
      var xml = new XMLSerializer().serializeToString(clone);
      if (xml.indexOf('xmlns=') < 0) xml = xml.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      var im = new Image();
      im.onload = function () {
        var c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        c.getContext('2d').drawImage(im, 0, 0, cw, ch);
        res(c.toDataURL('image/png'));
      };
      im.onerror = function () { res(null); };
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    });
  }
  function embed(pages) {
    cache = {};   // 每次导出重来：同一份里重复的图只读一次，导出完不一直占着记忆体
    var jobs = [];
    pages.forEach(function (pg) {
      pg.plan.items.forEach(function (it) {
        if (it.k === 'img') jobs.push(dataOf(it.src).then(function (d) { it.data = d; }));
        else if (it.k === 'grad') it.data = gradPng(it.css, it.w, it.h);
        else if (it.k === 'svg') jobs.push(svgPng(it.el, it.w, it.h).then(function (d) { it.data = d; it.el = null; }));
      });
    });
    return Promise.all(jobs);
  }

  /* ---------- 4 · 排进 pptxgenjs --------------------------------- */
  function inch(v) { return Math.round(v * IN * 10000) / 10000; }
  function xmlAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function build(p, pages) {
    var pres = new window.PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';   // 13.333 × 7.5 in（先设版面再加页）
    pres.title = MB.fileTitle(p);
    pres.subject = 'Moodboard';
    pres.author = String(p.host && p.host.name || 'SAIL');
    pres.company = 'Riccione Reka';
    pres.theme = { headFontFace: FONT.serif, bodyFontFace: FONT.en };
    // 讲稿照方案语言：zh / en 一种，bi 两段（copy.js 的 MB.pageNotes 认得 'bi'）
    var L = p.lang === 'en' || p.lang === 'bi' ? p.lang : 'zh';
    pages.forEach(function (pg) {
      var s = pres.addSlide();
      s.background = { color: pg.plan.bg };
      pg.plan.items.forEach(function (it) { put(pres, s, it); });
      var notes = '';
      try { notes = typeof MB.pageNotes === 'function' ? MB.pageNotes(p, pg.pg, L) || '' : ''; } catch (e) { notes = ''; }
      if (notes) s.addNotes(String(notes));
    });
    return pres;
  }

  function put(pres, s, it) {
    var o;
    if (it.w <= 0 && it.h <= 0) return;
    if (it.k === 'fill') {
      o = { x: inch(it.x), y: inch(it.y), w: inch(it.w), h: inch(it.h), objectName: 'Shape',
        fill: { color: it.c.hex, transparency: Math.round((1 - it.c.a * it.op) * 100) } };
      o.line = it.line ? { color: it.line.c.hex, transparency: Math.round((1 - it.line.c.a * it.op) * 100), width: Math.max(0.25, it.line.w * PT) } : { type: 'none' };
      if (it.shadow) o.shadow = { type: 'outer', blur: Math.round(it.shadow.blur * PT), offset: Math.round(Math.max(0, it.shadow.y) * PT), angle: 90, color: it.shadow.color.hex, opacity: Math.round(it.shadow.color.a * 100) / 100 };
      s.addShape(it.oval ? 'ellipse' : 'rect', o);
    } else if (it.k === 'line') {
      s.addShape('line', { x: inch(it.x), y: inch(it.y), w: inch(it.w), h: inch(it.h), objectName: 'Line',
        line: { color: it.c.hex, width: Math.max(0.25, Math.round(it.lw * PT * 100) / 100), transparency: Math.round((1 - it.c.a * it.op) * 100) } });
    } else if (it.k === 'grad' && it.data) {
      s.addImage({ data: it.data, x: inch(it.x), y: inch(it.y), w: inch(it.w), h: inch(it.h), objectName: 'Shade ' + it.name, altText: 'shade' });
    } else if (it.k === 'svg' && it.data) {
      o = { data: it.data, x: inch(it.x), y: inch(it.y), w: inch(it.w), h: inch(it.h), objectName: it.name, altText: 'QR code' };
      if (it.link) o.hyperlink = { url: xmlAttr(it.link) };   // pptxgenjs 不替图的链接转义（& 会弄坏档案）
      s.addImage(o);
    } else if (it.k === 'img' && it.data) {
      putImage(s, it);
    } else if (it.k === 'text') {
      putText(s, it);
    }
  }

  /** 照片：cover 照 object-position 裁切；contain（logo）算出实际大小，不裁 */
  function putImage(s, it) {
    var o = { data: it.data, objectName: it.name, altText: it.name === 'Logo' ? 'SAIL by Riccione Reka' : 'Photo' };
    if (it.op < 0.98) o.transparency = Math.round((1 - it.op) * 100);
    if (it.link) o.hyperlink = { url: xmlAttr(it.link) };
    var nw = it.nw, nh = it.nh;
    if (it.fit === 'cover') {
      var k = Math.max(it.w / nw, it.h / nh), sw = nw * k, sh = nh * k;
      var cx = (sw - it.w) * it.px, cy = (sh - it.h) * it.py;
      o.x = inch(it.x); o.y = inch(it.y); o.w = inch(sw); o.h = inch(sh);
      o.sizing = { type: 'crop', x: inch(cx), y: inch(cy), w: inch(it.w), h: inch(it.h) };
    } else if (it.fit === 'contain' || it.fit === 'scale-down') {
      var c = Math.min(it.w / nw, it.h / nh);
      if (it.fit === 'scale-down') c = Math.min(1, c);
      var dw = nw * c, dh = nh * c;
      o.x = inch(it.x + (it.w - dw) * it.px); o.y = inch(it.y + (it.h - dh) * it.py); o.w = inch(dw); o.h = inch(dh);
    } else {
      o.x = inch(it.x); o.y = inch(it.y); o.w = inch(it.w); o.h = inch(it.h);
    }
    s.addImage(o);
  }

  function putText(s, it) {
    var runs = [];
    it.paras.forEach(function (pa, i) {
      pa.runs.forEach(function (r, j) {
        var o = {};
        for (var k in r.options) if (r.options.hasOwnProperty(k)) o[k] = r.options[k];
        if (j === 0) {
          o.align = pa.align;
          if (pa.ls > 0) o.lineSpacing = Math.round(pa.ls * PT * 100) / 100;
        }
        if (j === pa.runs.length - 1 && i < it.paras.length - 1) o.breakLine = true;
        runs.push({ text: r.text, options: o });
      });
    });
    if (!runs.length) return;
    var o2 = { x: inch(it.x), y: inch(it.y), w: inch(Math.max(it.w, 4)), h: inch(Math.max(it.h, 4)), margin: 0, isTextBox: true,
      fit: 'none', wrap: it.wrap !== false, valign: it.valign || 'top', objectName: it.name };
    s.addText(runs, o2);
  }

  /* ---------- 5 · 存档前修一下 XML ------------------------------
     1. 字体「英文|华文」拆成 <a:latin> / <a:ea>：PowerPoint 每个字自己挑（跟网页的字体退路一样）
     2. pptxgenjs 在同一段的每个 run 前都写一次 <a:pPr>：一段只能有一个，多的拿掉（不然 PowerPoint 说档案坏了）
     3. 佈景主题的字体也换成品牌字体（业务自己加新文字框时就是对的字）
     4. 讲稿分段（notesParas） */
  function polish(buf) {
    var Z = window.JSZip;
    if (!Z) return Promise.resolve(new Blob([buf], { type: MIME }));
    return Z.loadAsync(buf).then(function (zip) {
      var jobs = [];
      zip.forEach(function (path, f) {
        if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) {
          jobs.push(f.async('string').then(function (x) {
            x = x.replace(/<a:(latin|ea|cs) typeface="([^"|]*)\|([^"]*)"/g, function (m, k, a, b) {
              return '<a:' + k + ' typeface="' + (k === 'ea' ? b : a) + '"';
            });
            x = x.replace(/(<\/a:r>|<a:br\/>)<a:pPr\b[\s\S]*?<\/a:pPr>/g, '$1');
            zip.file(path, x);
          }));
        } else if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(path)) {
          jobs.push(f.async('string').then(function (x) { zip.file(path, notesParas(x)); }));
        } else if (/^ppt\/theme\/theme\d+\.xml$/.test(path)) {
          jobs.push(f.async('string').then(function (x) {
            x = x.replace(/(<a:majorFont>[\s\S]*?<a:ea typeface=")[^"]*(")/, '$1' + FONT.zhTitle + '$2')
              .replace(/(<a:minorFont>[\s\S]*?<a:ea typeface=")[^"]*(")/, '$1' + FONT.zhSans + '$2')
              .replace(/(<a:majorFont>[\s\S]*?<a:font script="Hans" typeface=")[^"]*(")/, '$1' + FONT.zhTitle + '$2')
              .replace(/(<a:minorFont>[\s\S]*?<a:font script="Hans" typeface=")[^"]*(")/, '$1' + FONT.zhSans + '$2');
            zip.file(path, x);
          }));
        }
      });
      return Promise.all(jobs).then(function () {
        return zip.generateAsync({ type: 'blob', mimeType: MIME, compression: 'DEFLATE' });
      });
    });
  }

  /** 讲稿：pptxgenjs 把整篇（连换行）塞进同一个 <a:t>，PowerPoint 不一定照换行显示 ——
      双语讲稿就会变成华文、英文黏成一大段。拆成一行一段（空行留一个空段落当间隔）；
      华文那段标 zh-CN，备注栏的拼字检查才不会把整段画红线 */
  function notesParas(x) {
    return x.replace(/<a:p><a:r><a:rPr([^>]*)\/><a:t>([^<]*)<\/a:t><\/a:r>(?:<a:endParaRPr[^>]*\/>)?<\/a:p>/g, function (m, attrs, t) {
      return t.split(/\r?\n/).map(function (line) {
        var a = attrs.replace(/\blang="[^"]*"/, 'lang="' + (CJK.test(line) ? 'zh-CN' : 'en-US') + '"');
        return line ? '<a:p><a:r><a:rPr' + a + '/><a:t>' + line + '</a:t></a:r></a:p>' : '<a:p><a:endParaRPr' + a + '/></a:p>';
      }).join('');
    });
  }
})();
