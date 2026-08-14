/* ============================================================
   作品集 · case gallery
   ------------------------------------------------------------
   要换成真实的交付案例，只需要改下面这个数组：
   把照片丢进 assets/img/cases/，然后改 src 与说明文字即可。
   一个系列可以放任意张照片，第一张就是封面。
   ============================================================ */
window.SAIL_CASES = [
  {
    slug: 'skeleton',
    zh: '骨骼线', en: 'Skeleton Line',
    tagZh: '古典与现代的对话', tagEn: 'Classical meets modern',
    descZh: '线条勾勒层次，让柜体在自然光下呈现光影的韵律。适合喜欢有细节、但不喜欢繁复的家。',
    descEn: 'Lines create depth, giving the cabinetry a rhythm of light and shadow — for homes that want detail without ornament.',
    photos: [
      { src: 'skeleton-1.jpg', zh: '主卧 · 通顶衣柜与过道', en: 'Master bedroom · full-height wardrobe' },
      { src: 'skeleton-2.jpg', zh: '开放厨房 · 吧台与储物墙', en: 'Open kitchen · bar counter and storage wall' },
      { src: 'skeleton-3.jpg', zh: '厨房 · 高柜与嵌入式电器', en: 'Kitchen · tall units and built-in appliances' },
      { src: 'skeleton-4.jpg', zh: '厨房 · 中岛与餐边柜', en: 'Kitchen · island and sideboard' },
      { src: 'skeleton-5.jpg', zh: '细节 · 抽屉线条与把手', en: 'Detail · drawer lines and handles' }
    ]
  },
  {
    slug: 'mountain',
    zh: '空山', en: 'Empty Mountain',
    tagZh: '留白与壁龛', tagEn: 'Negative space and niches',
    descZh: '以留白与壁龛设计，让空间有呼吸的节奏 —— 收纳很多，但看起来不满。',
    descEn: 'Blank space and recessed niches let a room breathe — plenty of storage that never looks crowded.',
    photos: [
      { src: 'mountain-1.jpg', zh: '衣帽间 · 开放挂衣与中岛', en: 'Walk-in wardrobe · open hanging and island' },
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
      { src: 'weaving-2.jpg', zh: '细节 · 藤织柜门', en: 'Detail · woven cabinet front' }
    ]
  },
  {
    slug: 'misty',
    zh: '雾山', en: 'Misty Mountain',
    tagZh: '轻盈纯净的空间意境', tagEn: 'Light, clear, quietly poetic',
    descZh: '灵感源自「雾山春居」。颜色轻，光线软，适合想让家安静下来的人。',
    descEn: 'Inspired by a spring house in the mist — light colours, soft daylight, for a home that wants to be quiet.',
    photos: [
      { src: 'misty-1.jpg', zh: '开放空间 · 客餐厨一体', en: 'Open plan · living, dining and kitchen' },
      { src: 'misty-2.jpg', zh: '卧室 · 木格屏风与衣柜', en: 'Bedroom · timber screen and wardrobe' },
      { src: 'misty-3.jpg', zh: '起居 · 书架与休憩角', en: 'Living · shelving and reading corner' }
    ]
  },
  {
    slug: 'wabi',
    zh: '宅仁 · 寂', en: 'Wabi-Sabi Eastern',
    tagZh: '实木的纯粹与真实', tagEn: 'The honesty of solid wood',
    descZh: '于自然肌理之间，感受深邃而宁静的空间之美。材料不加掩饰，越用越好看。',
    descEn: 'Depth and stillness in natural texture — materials left honest, ageing into something better.',
    photos: [
      { src: 'wabi-1.jpg', zh: '厨房 · 水泥质感与木柜', en: 'Kitchen · concrete and timber' },
      { src: 'wabi-2.jpg', zh: '厨房 · 中岛与吊柜', en: 'Kitchen · island and wall units' },
      { src: 'wabi-3.jpg', zh: '厨房 · 操作台与开放层板', en: 'Kitchen · worktop and open shelving' },
      { src: 'wabi-4.jpg', zh: '一角 · 材质与光', en: 'A corner · material and light' }
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

  /* ---------- 作品格 ---------- */
  window.SAIL_CASES.forEach(function (c, i) {
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'work-card r s' + Math.min(4, i + 1);
    card.setAttribute('data-index', i);
    card.innerHTML =
      '<span class="shot"><img src="' + BASE + c.photos[0].src + '" alt="' + c.zh + ' ' + c.en + '" loading="lazy" /></span>' +
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
