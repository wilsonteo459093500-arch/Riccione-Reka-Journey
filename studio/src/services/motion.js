// 动效引擎 —— 把「分镜脚本」编译成一份纯数据的时间轴规格。
//
// 一份 spec，两个消费者：
//   1. 网站里的实时预览  → anime.js timeline，可拖进度条逐帧看
//   2. 导出的 HTML 文件  → 原生 Web Animations API，零依赖、可离线、可精确 seek
//
// 两边都读同一份 spec，所以「预览看到的」和「渲出来的」不可能对不上。
// 这是整件事唯一重要的约束 —— 旧版预览是手写 CSS 动画、导出是另一份手写 CSS 动画，
// 改一边忘另一边就会飘。
//
// 关键帧刻意只用这几个属性：opacity / transform / filter / clip-path。
// 它们全部走 GPU 合成，不触发布局重算 —— 逐帧渲染时才不会抖。

// ---------------------------------------------------------------------------
// 缓动
// ---------------------------------------------------------------------------

/** 统一存四个控制点，两边各自转成自己的写法 */
export const EASE = {
  outCubic: [0.33, 1, 0.68, 1],
  outExpo: [0.16, 1, 0.3, 1],
  outBack: [0.34, 1.4, 0.64, 1],
  inCubic: [0.32, 0, 0.67, 0],
  inOutCubic: [0.65, 0, 0.35, 1],
  linear: [0, 0, 1, 1],
};

export const cssEase = (k) => `cubic-bezier(${(EASE[k] || EASE.outCubic).join(',')})`;

/**
 * 四个控制点，给 anime.js 用。
 *
 * 注意不要退回去写成 `ease: 'cubicBezier(...)'` 字符串 —— anime.js v4 把这个语法
 * 从核心里移掉了，遇到它只会在控制台 warn 一句然后**按无缓动处理**，
 * 动画照跑、画面照出，只是全部变成匀速。预览和导出会因此悄悄对不上。
 * 正确写法是 `import { cubicBezier } from 'animejs'` 然后 `ease: cubicBezier(...easeParams(k))`。
 */
export const easeParams = (k) => EASE[k] || EASE.outCubic;

// ---------------------------------------------------------------------------
// 关键帧的属性写法
// ---------------------------------------------------------------------------
//
// 拆开写（translateY / scale / opacity …）而不是写死一整条 transform 字符串，
// 是因为 anime.js 要的是单个属性、WAAPI 要的是合成后的 transform。
// 拆开存，两边各自组装，谁也不迁就谁。

const TRANSFORM_KEYS = ['translateX', 'translateY', 'scale', 'scaleX', 'scaleY', 'rotate'];
const PLAIN_KEYS = ['opacity', 'filter', 'clipPath'];

/** 一帧属性 → WAAPI 关键帧对象 */
export function waapiFrame(p = {}) {
  const out = {};
  const t = TRANSFORM_KEYS.filter((k) => p[k] != null)
    .map((k) => `${k}(${p[k]})`)
    .join(' ');
  if (t) out.transform = t;
  PLAIN_KEYS.forEach((k) => {
    if (p[k] != null) out[k] = String(p[k]);
  });
  return out;
}

/** 一条 track → anime.js 的属性对象（数组是 v4 的 from→to 简写） */
export function animeProps(track) {
  const props = {};
  [...TRANSFORM_KEYS, ...PLAIN_KEYS].forEach((k) => {
    if (track.from[k] != null || track.to[k] != null) {
      props[k] = [track.from[k], track.to[k]];
    }
  });
  return props;
}

// ---------------------------------------------------------------------------
// 入场动作库
// ---------------------------------------------------------------------------
//
// from / to 必须写同一组 key —— 少写一边，WAAPI 会拿元素当前计算值补，
// 结果就是「预览对、渲出来不对」。这个坑不值得踩第二次。

export const ENTRANCES = {
  fadeUp: {
    label: '上浮淡入',
    d: 0.62,
    e: 'outCubic',
    from: { opacity: 0, translateY: '28px' },
    to: { opacity: 1, translateY: '0px' },
  },
  fadeDown: {
    label: '下沉淡入',
    d: 0.62,
    e: 'outCubic',
    from: { opacity: 0, translateY: '-24px' },
    to: { opacity: 1, translateY: '0px' },
  },
  slideLeft: {
    label: '从右滑入',
    d: 0.7,
    e: 'outExpo',
    from: { opacity: 0, translateX: '56px' },
    to: { opacity: 1, translateX: '0px' },
  },
  slideRight: {
    label: '从左滑入',
    d: 0.7,
    e: 'outExpo',
    from: { opacity: 0, translateX: '-56px' },
    to: { opacity: 1, translateX: '0px' },
  },
  scaleIn: {
    label: '轻微放大',
    d: 0.72,
    e: 'outExpo',
    from: { opacity: 0, scale: 0.93 },
    to: { opacity: 1, scale: 1 },
  },
  blurIn: {
    label: '虚焦对上',
    d: 0.8,
    e: 'outCubic',
    from: { opacity: 0, filter: 'blur(14px)' },
    to: { opacity: 1, filter: 'blur(0px)' },
  },
  maskUp: {
    label: '遮罩上推',
    d: 0.78,
    e: 'outExpo',
    from: { opacity: 1, clipPath: 'inset(105% 0% 0% 0%)', translateY: '12px' },
    to: { opacity: 1, clipPath: 'inset(0% 0% 0% 0%)', translateY: '0px' },
  },
  wipe: {
    label: '横向擦出',
    d: 0.66,
    e: 'outExpo',
    from: { opacity: 1, scaleX: 0 },
    to: { opacity: 1, scaleX: 1 },
  },
  none: {
    label: '直接出现',
    d: 0.01,
    e: 'linear',
    from: { opacity: 1 },
    to: { opacity: 1 },
  },
};

/** 逐字动作 —— 用在主文案上，每个字错开一点点 */
export const CHAR_MOTIONS = {
  charUp: {
    label: '逐字上浮',
    d: 0.52,
    e: 'outExpo',
    stagger: 0.035,
    from: { opacity: 0, translateY: '0.62em' },
    to: { opacity: 1, translateY: '0em' },
  },
  charBlur: {
    label: '逐字对焦',
    d: 0.58,
    e: 'outCubic',
    stagger: 0.028,
    from: { opacity: 0, filter: 'blur(10px)' },
    to: { opacity: 1, filter: 'blur(0px)' },
  },
  charScale: {
    label: '逐字弹入',
    d: 0.5,
    e: 'outBack',
    stagger: 0.03,
    from: { opacity: 0, scale: 0.6 },
    to: { opacity: 1, scale: 1 },
  },
  wholeUp: {
    label: '整句上浮',
    d: 0.66,
    e: 'outExpo',
    stagger: 0,
    from: { opacity: 0, translateY: '0.4em' },
    to: { opacity: 1, translateY: '0em' },
  },
};

// 分镜脚本里的 motion 是一句自然语言，挑关键词来定动作。
//
// 表是**从具体到笼统**排的，第一条命中就用。顺序错了就会出问题：
// 「逐字对焦」里的「逐字」只是说明按字拆，真正的动作是「对焦」——
// 如果 charUp 排在 charBlur 前面，所有逐字动效都会被压成同一个上浮。
const CHAR_KEYS = [
  [/对焦|虚焦|blur|模糊/i, 'charBlur'],
  [/弹|bounce|pop|back/i, 'charScale'],
  [/整句|整行|whole|一起|同时/i, 'wholeUp'],
  [/逐字|letter|char|stagger|一个字|上浮|淡入|fade/i, 'charUp'],
];
const ENTER_KEYS = [
  [/擦除|擦出|wipe|扫过/i, 'wipe'],
  [/遮罩|mask|clip|推上|上推/i, 'maskUp'],
  [/虚焦|对焦|blur|模糊/i, 'blurIn'],
  [/放大|缩放|scale|zoom/i, 'scaleIn'],
  [/从右|右侧|slide.?left|向左/i, 'slideLeft'],
  [/从左|左侧|slide.?right|向右/i, 'slideRight'],
  [/下沉|从上|drop|落下/i, 'fadeDown'],
  [/上浮|淡入|fade|浮起/i, 'fadeUp'],
];

// 一句 motion 通常同时描述主文案和副文案（「主文案逐字上浮，副标从右滑入」）。
// 两边各自只看自己那半句，否则副文案会去抢主文案的关键词。
const clauseFor = (text, re) => {
  const parts = String(text || '').split(/[，,；;。.]/);
  const hit = parts.find((p) => re.test(p));
  return hit || text || '';
};

const pick = (table, text, fallback) => {
  const s = String(text || '');
  for (const [re, key] of table) if (re.test(s)) return key;
  return fallback;
};

// ---------------------------------------------------------------------------
// 编译
// ---------------------------------------------------------------------------

const CROSSFADE = 0.32; // 屏与屏之间的叠化时长

/**
 * @param {object} storyboard  animatedPostPrompt 的输出
 * @param {object} [opts] { width, height, fps }
 * @returns {object} spec —— 纯数据，两个渲染端都读它
 */
export function buildMotionSpec(storyboard = {}, opts = {}) {
  const width = opts.width || 1080;
  const height = opts.height || 1920;
  const fps = opts.fps || 30;

  const pal = storyboard.palette || {};
  const palette = {
    bg: pal.bg || '#F5F1EA',
    ink: pal.ink || '#1A1614',
    accent: pal.accent || '#2D4A3E',
  };

  const raw = Array.isArray(storyboard.slides) ? storyboard.slides : [];
  let cursor = 0;

  const slides = raw.map((s, i) => {
    const duration = Math.max(0.6, Number(s.duration_s) || 2.2);
    const start = cursor;
    cursor += duration;
    const end = cursor;
    const last = i === raw.length - 1;

    const charKey = pick(CHAR_KEYS, clauseFor(s.motion, /主文案|标题|大字|headline|逐字/i), 'charUp');
    const subKey = pick(ENTER_KEYS, clauseFor(s.motion, /副文案|副标|小字|sub|说明/i), 'fadeUp');
    const char = CHAR_MOTIONS[charKey];
    const sub = ENTRANCES[subKey];

    const headline = String(s.headline || '');
    const chars = [...headline];
    // 逐字入场不能超过这一屏的 42%，否则观众还没读完就切走了
    const staggerTotal = char.stagger * Math.max(0, chars.length - 1);
    const stagger =
      staggerTotal > duration * 0.42 ? (duration * 0.42) / Math.max(1, chars.length - 1) : char.stagger;

    const tracks = [];
    const T = (t) => Number(Math.max(0, t).toFixed(3));

    // 整屏显隐：开始前 CROSSFADE 秒淡入，结束后淡出（最后一屏不淡出）。
    // 后一屏在 DOM 里更靠后 = 叠在上面，所以「后一屏先淡入、前一屏再淡出」是干净的叠化。
    //
    // 第一屏不淡入 —— 它从第 0 帧就必须是实的。第 0 帧是封面，也是平台抓的缩略图，
    // 哪怕只黑 0.01 秒，导出的第一张 PNG 也会是空底。
    tracks.push({
      id: `slide-${i}-in`,
      target: 'slide',
      slide: i,
      start: T(start - (i === 0 ? 0 : CROSSFADE)),
      duration: i === 0 ? 0.01 : CROSSFADE,
      easing: 'inOutCubic',
      from: { opacity: i === 0 ? 1 : 0 },
      to: { opacity: 1 },
    });
    if (!last) {
      tracks.push({
        id: `slide-${i}-out`,
        target: 'slide',
        slide: i,
        start: T(end),
        duration: CROSSFADE,
        easing: 'inOutCubic',
        from: { opacity: 1 },
        to: { opacity: 0 },
      });
    }

    // 背景极慢缓推 —— 只为了让画面不是死的
    tracks.push({
      id: `bg-${i}`,
      target: 'bg',
      slide: i,
      start: T(start - CROSSFADE),
      duration: duration + CROSSFADE,
      easing: 'linear',
      from: { scale: 1 },
      to: { scale: 1.045 },
    });

    // 序号
    tracks.push({
      id: `kicker-${i}`,
      target: 'kicker',
      slide: i,
      start: T(start + 0.06),
      duration: ENTRANCES.fadeUp.d,
      easing: ENTRANCES.fadeUp.e,
      from: { opacity: 0, translateY: '28px' },
      to: { opacity: 0.75, translateY: '0px' },
    });

    // 主文案 —— 每个字一条 track
    chars.forEach((ch, ci) => {
      tracks.push({
        id: `char-${i}-${ci}`,
        target: 'char',
        slide: i,
        charIndex: ci,
        start: T(start + 0.16 + ci * stagger),
        duration: char.d,
        easing: char.e,
        from: char.from,
        to: char.to,
      });
    });

    // 副文案：等主文案基本走完再进
    if (s.sub) {
      tracks.push({
        id: `sub-${i}`,
        target: 'sub',
        slide: i,
        start: T(start + 0.16 + stagger * chars.length + 0.1),
        duration: sub.d,
        easing: sub.e,
        from: sub.from,
        to: sub.to,
      });
    }

    // 底部横线
    tracks.push({
      id: `rule-${i}`,
      target: 'rule',
      slide: i,
      start: T(start + duration * 0.42),
      duration: ENTRANCES.wipe.d,
      easing: ENTRANCES.wipe.e,
      from: ENTRANCES.wipe.from,
      to: ENTRANCES.wipe.to,
    });

    return {
      index: i,
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
      duration: Number(duration.toFixed(3)),
      headline,
      chars,
      sub: s.sub || '',
      layout: s.layout || '',
      bgKind: s.bg_kind || 'solid',
      imagePrompt: s.image_prompt || '',
      motion: s.motion || '',
      transitionOut: s.transition_out || '',
      charMotion: charKey,
      subMotion: subKey,
      tracks,
    };
  });

  return {
    title: storyboard.title || 'Animated Post',
    width,
    height,
    fps,
    palette,
    fontFeel: storyboard.font_feel || '',
    total: Number(Math.max(0.6, cursor).toFixed(3)),
    slides,
  };
}

/** 所有 track 拍平成一条，按开始时间排序 */
export function flatTracks(spec) {
  return spec.slides.flatMap((s) => s.tracks).sort((a, b) => a.start - b.start);
}

/** 某个时刻在看哪一屏 */
export function slideAt(spec, t) {
  return spec.slides.find((s) => t >= s.start && t < s.end) || spec.slides[spec.slides.length - 1] || null;
}

/** track → DOM 选择器（预览和导出用同一套 data 属性，选择器才能通用） */
export function selectorFor(track) {
  const base = `[data-slide="${track.slide}"]`;
  if (track.target === 'slide') return base;
  if (track.target === 'char') return `${base} [data-char="${track.charIndex}"]`;
  return `${base} [data-el="${track.target}"]`;
}
