// 直觉牌上的小照片 —— 用 3D 工作室同一套程序化家具和 PBR 材质，离线拍好的小场景（vignettes/）。
// 系统 1 认图比认字快得多：客人不需要知道「侘寂」「Japandi」，只要知道哪一张让他想躺下。
// 每题两张用同一个房间、同一个机位、同一种光，只改那一题要对比的东西（暖 / 清、藏 / 展、圆 / 方…）。
// 怎么重拍：src/quiz/vignettes/stage.js 顶上的说明（只在开发时用，three.js 不会进许愿之旅的 bundle）。
// 内容色（测验刺激）：墙、地板、沙发的颜色对应 flow.js 里每题的 visual 参数，不随 VI 换色。

import { useState } from 'react';

// { 'room-a': { 480: url, 960: url }, … }
const FILES = import.meta.glob('./vignettes/img/*.webp', { eager: true, query: '?url', import: 'default' });
const IMG = {};
for (const [path, url] of Object.entries(FILES)) {
  const m = /\/([a-z]+-[ab])-(\d+)\.webp$/.exec(path);
  if (m) (IMG[m[1]] ||= {})[m[2]] = url;
}

// 「星期六晚上」那题在 flow.js 里用 emoji 当记号：🍲 一屋子朋友打边炉 / 📖 一个人，一本书，一杯茶
const BY_EMOJI = { '🍲': 'weekend-a', '📖': 'weekend-b' };

/** 这一张图的 key：题目 id + 哪一边（a / b）；场景题按 emoji 认 */
export function vignetteKey(visual, id) {
  if (visual?.kind === 'scene' && BY_EMOJI[visual.emoji]) return BY_EMOJI[visual.emoji];
  return id && IMG[id] ? id : null;
}

const SIZES = '(max-width: 560px) 46vw, (max-width: 1060px) 44vw, 360px';

/** 提前把下一题的两张图拿下来（换题时不闪） */
export function preloadVignettes(pair) {
  if (!pair || typeof Image === 'undefined') return;
  const small = typeof matchMedia === 'function' && matchMedia('(max-width: 560px)').matches;
  for (const side of ['a', 'b']) {
    const k = vignetteKey(pair[side]?.visual, `${pair.id}-${side}`);
    const src = k && IMG[k] && (small ? IMG[k][480] : IMG[k][960]);
    if (src) {
      const im = new Image();
      im.decoding = 'async';
      im.src = src;
    }
  }
}

export default function Vignette({ visual, id }) {
  const [ready, setReady] = useState(false);
  const k = vignetteKey(visual, id);
  const set = k && IMG[k];
  if (!set) return <span className="vg vg-empty" />;
  return (
    <img
      className={`vg vg-photo ${ready ? 'is-ready' : ''}`}
      src={set[960]}
      srcSet={`${set[480]} 480w, ${set[960]} 960w`}
      sizes={SIZES}
      width="960"
      height="720"
      alt=""
      decoding="async"
      draggable="false"
      onLoad={() => setReady(true)}
      ref={(el) => el && el.complete && el.naturalWidth && !ready && setReady(true)}
    />
  );
}
