/* ============================================================
   名片页开场：像新 iPhone 开机 —— 全黑，一次一句话，然后亮起来，再请人往下看
   ------------------------------------------------------------
   • 第一次打开：一句一句播（约 9 秒）→ 光从中间亮开 → 背景（视频 > 图册照片）亮出来 → 名字 + 口号 → 「往下看」
   • 这台手机看过了：只播约 1 秒的「亮起来」
   • 点一下任何地方 / 「跳过」= 直接亮起来；往下滑随时可以
   • ?intro=1 每次都播完整版（示范用）；系统设了「减少动态效果」= 直接显示最后画面
   • 只用 CSS 动画、系统字体，不载网页字型；背景图到第三句才开始下载（不抢名字的速度）
   ============================================================ */

const SEEN_KEY = 'space-card:opened';
// 没有视频时的背景：手机 = 溪岸图册「草原上走向远山的五个人」，电脑（横的）= 瑞吉欧图册「阳光穿过的红杉林」
const FALLBACK_BG = '/card/opening.jpg';
const FALLBACK_BG_WIDE = '/card/opening-wide.jpg';

/** 预设的开场白（名片没自订时用） */
export function defaultLines(card, lang) {
  const name = String(card.name || '').trim();
  const first = name.split(/\s+/)[0] || name;
  const alt = String(card.name_alt || '').trim();
  if (lang === 'en') {
    return ['Hello', `I’m ${name}`, 'Nice to meet you', 'I hope knowing each other creates real value for you.'];
  }
  return ['你好', alt ? `我是${alt}，你可以叫我 ${first}` : `我是 ${name}`, '很高兴认识你', '希望我们之间的认识，能为你创造价值'];
}

export function openingLines(card, lang) {
  const own = lang === 'en' ? card.opening_en : card.opening;
  return own && own.length ? own : defaultLines(card, lang);
}

/**
 * mountOpening({ h, card, lang, labels, force }) → { update(card, lang, labels), el, height() }
 * labels = { skip, cue }
 */
export function mountOpening({ h, card, lang, labels, force = false }) {
  const store = {
    get() { try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; } },
    set() { try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* 无痕模式 */ } },
  };
  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const quick = !force && store.get() > 0;

  const el = document.getElementById('opening') || h('section');
  el.id = 'opening';
  el.className = 'op';
  el.removeAttribute('aria-hidden');
  el.setAttribute('aria-label', card.name);
  if (!el.parentNode) document.body.prepend(el);

  const bg = h('div.op-bg');
  const stage = h('div.op-stage', { 'aria-live': 'polite' });
  const final = h('div.op-final');
  const cue = h('button.op-cue', { type: 'button', onclick: () => { const a = document.getElementById('app'); if (a) a.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); } });
  const skip = h('button.op-skip', { type: 'button', onclick: (e) => { e.stopPropagation(); light(true); } });
  el.replaceChildren(bg, h('div.op-shade'), h('div.op-glow'), h('div.op-flash'), h('div.op-sweep'), stage, final, cue, skip);

  let cur = { card, lang, labels };
  let timers = [];
  let lit = false;
  let bgLoaded = false;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  function paintText() {
    const { card: c, labels: l } = cur;
    final.replaceChildren(
      c.company ? h('p.op-co', null, c.company) : null,
      h('h2.op-name', null, c.name, c.name_alt ? h('span.op-alt', null, c.name_alt) : null),
      c.tagline ? h('p.op-tag', null, c.tagline) : null,
    );
    cue.replaceChildren(h('span', null, l.cue), h('i.op-rail', { 'aria-hidden': 'true' }));
    skip.textContent = l.skip;
  }

  function loadBg() {
    if (bgLoaded) return;
    bgLoaded = true;
    const c = cur.card;
    if (c.video) {
      const v = h('video', { src: c.video, poster: c.poster || null, muted: true, loop: true, playsinline: true, 'webkit-playsinline': true, autoplay: !reduce, preload: 'auto', 'aria-hidden': 'true' });
      v.muted = true;
      bg.append(v);
    } else {
      bg.append(h('picture', null,
        h('source', { media: '(min-aspect-ratio: 5/4)', srcset: FALLBACK_BG_WIDE }),
        h('img', { src: FALLBACK_BG, alt: '', decoding: 'async' })));
    }
  }

  /** 逗号后面换行（中文排得整齐）；字号看最长那一段 */
  function partsOf(text) {
    const out = [];
    for (const part of String(text).split(/(?<=[，；])\s*/).filter(Boolean)) {
      // 英文长句：按字词平均拆成几行（每行大约 16 个字母以内）
      const words = part.split(' ');
      const len = part.length;
      if (len <= 22 || words.length < 3) { out.push(part); continue; }
      const rows = Math.ceil(len / 20);
      const target = len / rows;
      let cur = '';
      for (const wd of words) {
        if (cur && (cur.length + 1 + wd.length) > target + 4) { out.push(cur); cur = wd; } else cur = cur ? `${cur} ${wd}` : wd;
      }
      if (cur) out.push(cur);
    }
    // 行尾的标点拿掉（已经换行了，逗号挂在行尾不好看）
    return out.map((x) => x.replace(/[，,；;。.！!、\s]+$/u, '')).filter(Boolean);
  }
  /** 字号：撑满画面宽度（中文一个字算 1、英文字母算 0.56），短的一句（你好）特别大 */
  function sizeOf(parts) {
    const w = (x) => [...x].reduce((a, ch) => a + (/[\u2e80-\uffff]/.test(ch) ? 1 : 0.56), 0);
    const n = Math.max(...parts.map(w));
    if (parts.length === 1 && n <= 3) return 'min(160px, 32vw)';
    return `min(${parts.length > 1 ? 68 : 60}px, calc((100vw - 40px) / ${Math.max(n, 5).toFixed(2)}))`;
  }

  function play() {
    const lines = openingLines(cur.card, cur.lang);
    let t = 300;
    lines.forEach((text, i) => {
      const n = [...text].length;
      const hold = Math.min(2600, Math.max(1300, 900 + n * 70));
      later(() => {
        if (lit) return;
        if (i >= 2 || lines.length < 3) loadBg();
        const parts = partsOf(text);
        const p = h('p.op-line', { style: `font-size:${sizeOf(parts)}` }, parts.map((x) => h('span', null, x)));
        stage.replaceChildren(p);
        later(() => p.classList.add('out'), hold);
      }, t);
      t += hold + 300;
    });
    later(() => light(false), t);
  }

  /** 亮起来（skipped = 用户点了跳过 → 快一点） */
  function light(fast) {
    if (lit) return;
    lit = true;
    timers.forEach(clearTimeout);
    timers = [];
    loadBg();
    stage.replaceChildren();
    el.classList.add('lit');
    if (fast) el.classList.add('quick');
    store.set();
  }

  paintText();
  if (reduce) { loadBg(); el.classList.add('lit', 'still'); store.set(); }
  else if (quick) light(true);
  else {
    el.addEventListener('click', () => { if (!lit) light(true); });
    play();
  }

  // 往下滑：开场慢慢淡出、往上收（从黑走向光）
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const p = Math.min(1, Math.max(0, window.scrollY / Math.max(1, el.offsetHeight)));
      el.style.setProperty('--p', p.toFixed(3));
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // 手机最上面那条（状态栏）的颜色：开场在画面上 = 黑，滑过 = 浅灰
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => meta.setAttribute('content', e.isIntersecting ? '#000000' : '#F5F5F7'), { threshold: 0.08 }).observe(el);
  }

  return {
    el,
    height: () => el.offsetHeight,
    update(card2, lang2, labels2) { cur = { card: card2, lang: lang2, labels: labels2 }; paintText(); },
  };
}
