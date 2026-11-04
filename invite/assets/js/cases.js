/* ============================================================
   作品集 · case gallery
   ------------------------------------------------------------
   要换成真实的交付案例，只需要改下面这个数组：
   把照片丢进 assets/img/cases/，然后改 src 与说明文字即可。
   一个系列可以放任意张照片，第一张就是封面。
   - 封面 = VISI 方案那个系列页的官方照片（visi/data.js 的 MB.SERIES_PHOTO，HIPPO 第 6 页那五张），两边才对得上。
   - 只放确认过是那个系列的溪岸作品（老板 2026-11-04）：拿掉了瑞吉欧的斗柜（skeleton-5）、
     老板退回的雾山卧室（misty-2）、没有柜体的灰泥角落（wabi-4）、看不出系列的衣帽间（mountain-1）。
     档案留着不删（VISI 旧方案还认得）。
   - pos（选填）= object-position：横幅照片放进直的封面（4:5）时留哪一边，例 '55% 50%'。
   - 新照片要用新档名：vercel.json 把 assets/img 设成 immutable 一年，同名换图，看过的人一年都看到旧的。
   ============================================================ */
window.SAIL_CASES = [
  {
    slug: 'skeleton',
    zh: '骨骼线', en: 'Skeleton Line',
    tagZh: '古典与现代的对话', tagEn: 'Classical meets modern',
    descZh: '线条勾勒层次，让柜体在自然光下呈现光影的韵律。适合喜欢有细节、但不喜欢繁复的家。',
    descEn: 'Lines create depth, giving the cabinetry a rhythm of light and shadow — for homes that want detail without ornament.',
    photos: [
      { src: 'skeleton-3.jpg', zh: '厨房 · 高柜与嵌入式电器', en: 'Kitchen · tall units and built-in appliances' },
      { src: 'skeleton-1.jpg', zh: '客厅 · 木饰墙', en: 'Living room · panelled wall' },
      { src: 'skeleton-2.jpg', zh: '开放厨房 · 吧台与储物墙', en: 'Open kitchen · bar counter and storage wall' },
      { src: 'skeleton-4.jpg', zh: '厨房 · 中岛与餐边柜', en: 'Kitchen · island and sideboard' }
    ]
  },
  {
    slug: 'mountain',
    zh: '空山', en: 'Empty Mountain',
    tagZh: '留白与壁龛', tagEn: 'Negative space and niches',
    descZh: '以留白与壁龛设计，让空间有呼吸的节奏 —— 收纳很多，但看起来不满。',
    descEn: 'Blank space and recessed niches let a room breathe — plenty of storage that never looks crowded.',
    photos: [
      { src: 'mountain-2.jpg', zh: '格架 · 留白与陈列', en: 'Grid shelving · display and pause' },
      { src: 'mountain-3.jpg', zh: '书墙 · 通顶格架', en: 'Book wall · floor-to-ceiling grid' }
    ]
  },
  {
    slug: 'weaving',
    zh: '织', en: 'Weaving',
    tagZh: '柔韧织物的触感', tagEn: 'The touch of woven texture',
    descZh: '在自然与纤维之间，把温度做进柜门。摸上去会想多停一秒的那一种。',
    descEn: 'Between nature and fibre — warmth built into the cabinet door, the kind you pause to touch.',
    photos: [
      { src: 'weaving-1.jpg', zh: '客厅 · 收纳墙与展示格', en: 'Living room · storage wall and display' },
      { src: 'weaving-2.jpg', zh: '细节 · 织纹柜门', en: 'Detail · woven cabinet front' }
    ]
  },
  {
    slug: 'misty',
    zh: '雾山', en: 'Misty Mountain',
    tagZh: '雾山春居', tagEn: 'A spring house on the misty mountain',
    descZh: '以「雾山春居」为设计灵感：山腰一间木屋，轻于色、安于形。晨雾的灰、春山的木、早春的绿，让家安静温和下来。',
    descEn: 'Inspired by a spring house on a misty mountain: a timber cabin on the slope, light in colour and at ease in form. The grey of morning mist, the wood of the hills and the first green of spring keep the home calm.',
    photos: [
      { src: 'misty-wushan.jpg', pos: '55% 50%', zh: '厨房 · 白橡木吊柜与绿色高柜', en: 'Kitchen · white-oak wall units and sage tall cabinets' },
      { src: 'misty-1.jpg', zh: '开放空间 · 客餐厨一体', en: 'Open plan · living, dining and kitchen' },
      { src: 'misty-3.jpg', zh: '起居 · 书架与休憩角', en: 'Living · shelving and reading corner' }
    ]
  },
  {
    slug: 'wabi',
    zh: '侘寂东方', en: 'Wabi-Sabi Eastern',
    tagZh: '山，有它的时间', tagEn: 'Mountains have their own time',
    descZh: '2025 年溪岸实木系列新品。把东方哲思中「关于时间的探索」融入设计，打磨经得起时间洗礼的实木家具。',
    descEn: 'SAIL’s 2025 solid-wood series. The Eastern way of thinking about time, built into solid-wood pieces made to stand the test of time.',
    photos: [
      { src: 'wabi-1.jpg', zh: '厨房 · 水泥质感与木柜', en: 'Kitchen · concrete and timber' },
      { src: 'wabi-2.jpg', zh: '厨房 · 中岛与吊柜', en: 'Kitchen · island and wall units' },
      { src: 'wabi-3.jpg', zh: '厨房 · 操作台与开放层板', en: 'Kitchen · worktop and open shelving' }
    ]
  }
];

/* ------------------------------------------------------------
   渲染作品格 + 灯箱
   ------------------------------------------------------------ */
(function () {
  'use strict';

  var BASE = 'assets/img/cases/';
  var grid = document.getElementById('work-grid');
  if (!grid || !window.SAIL_CASES) return;

  function zh() { return document.documentElement.getAttribute('data-lang') !== 'en'; }
  /* 照片的焦点（选填 pos，例 '55% 50%'）：只收数字 + % / px 的位置，别的字不进 style */
  function posOf(p) {
    var v = p && typeof p.pos === 'string' ? p.pos.trim() : '';
    return /^-?\d+(\.\d+)?(%|px)?( -?\d+(\.\d+)?(%|px)?)?$/.test(v) ? v : '';
  }

  /* ---------- 作品格 ---------- */
  window.SAIL_CASES.forEach(function (c, i) {
    var pos = posOf(c.photos[0]);
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'work-card r s' + Math.min(4, i + 1);
    card.setAttribute('data-index', i);
    card.innerHTML =
      '<span class="shot"><img src="' + BASE + c.photos[0].src + '" alt="' + c.zh + ' ' + c.en + '" loading="lazy"' +
        (pos ? ' style="object-position:' + pos + '"' : '') + ' /></span>' +
      '<span class="meta">' +
        '<span class="nm"><span class="zh">' + c.zh + '</span><span class="en">' + c.en + '</span></span>' +
        '<span class="tg"><span class="zh">' + c.tagZh + '</span><span class="en">' + c.tagEn + '</span></span>' +
      '</span>' +
      '<span class="count">' + c.photos.length + '</span>';
    card.addEventListener('click', function () { open(i, 0); });
    grid.appendChild(card);
  });

  /* ---------- 灯箱 ---------- */
  var lb = document.createElement('div');
  lb.className = 'lb';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.hidden = true;
  lb.innerHTML =
    '<button class="lb-x" type="button" aria-label="关闭 Close">&times;</button>' +
    '<button class="lb-nav prev" type="button" aria-label="上一张 Previous">&#8249;</button>' +
    '<button class="lb-nav next" type="button" aria-label="下一张 Next">&#8250;</button>' +
    '<figure class="lb-stage"><img alt="" /><figcaption>' +
      '<span class="s"></span><span class="c"></span><span class="n"></span>' +
    '</figcaption></figure>';
  document.body.appendChild(lb);

  var img = lb.querySelector('img');
  var capS = lb.querySelector('figcaption .s');
  var capC = lb.querySelector('figcaption .c');
  var capN = lb.querySelector('figcaption .n');
  var ci = 0, pi = 0, scrollY = 0;

  function render() {
    var c = window.SAIL_CASES[ci], p = c.photos[pi];
    img.src = BASE + p.src;
    img.style.objectPosition = posOf(p);
    img.alt = (zh() ? p.zh : p.en) + ' — ' + (zh() ? c.zh : c.en);
    capS.textContent = zh() ? c.zh : c.en;
    capC.textContent = zh() ? p.zh : p.en;
    capN.textContent = (pi + 1) + ' / ' + c.photos.length;
    // 预载下一张
    var nxt = c.photos[(pi + 1) % c.photos.length];
    if (nxt) { var pre = new Image(); pre.src = BASE + nxt.src; }
  }

  function open(caseIdx, photoIdx) {
    ci = caseIdx; pi = photoIdx;
    scrollY = window.scrollY;
    render();
    lb.hidden = false;
    document.body.classList.add('lb-open');
    lb.querySelector('.lb-x').focus();
  }
  function close() {
    lb.hidden = true;
    document.body.classList.remove('lb-open');
    window.scrollTo({ top: scrollY, behavior: 'auto' });
  }
  function step(d) {
    var n = window.SAIL_CASES[ci].photos.length;
    pi = (pi + d + n) % n;
    render();
  }

  lb.querySelector('.lb-x').addEventListener('click', close);
  lb.querySelector('.prev').addEventListener('click', function (e) { e.stopPropagation(); step(-1); });
  lb.querySelector('.next').addEventListener('click', function (e) { e.stopPropagation(); step(1); });
  lb.addEventListener('click', function (e) { if (e.target === lb || e.target.tagName === 'FIGURE') close(); });

  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  // 手机滑动
  var x0 = null;
  lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
    x0 = null;
  }, { passive: true });

  // 切换语言时更新说明文字
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-set-lang]') && !lb.hidden) setTimeout(render, 0);
  });
})();
