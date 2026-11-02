// 直觉牌上的小照片 —— 用 3D 工作室同一套程序化家具和 PBR 材质，离线拍好的小场景（vignettes/）。
// 系统 1 认图比认字快得多：客人不需要知道「侘寂」「Japandi」，只要知道哪一张让他想躺下。
// 每题 4–6 张用同一个房间、同一个机位、同一种光，只改那一题要对比的东西（暖 / 清、藏 / 展、圆 / 方…）。
// 怎么重拍：src/quiz/vignettes/stage.js 顶上的说明（只在开发时用，three.js 不会进许愿之旅的 bundle）。
// 还没拍好的那几张：用这个选项的材质拼一张 2 × 2 的色卡（材质库的底色，马上就有、不花时间）—— 绝不留一张空白的卡。
// 不用 textures.js 的实物色卡：一张要几百毫秒，一题十几张会卡住画面（许愿之旅的每一屏都不能有 > 200 ms 的长任务）。

import { useState } from 'react';
import { optionsOf } from './flow.js';
import { MAT_BY_ID } from '../shared/materials.js';

// { 'room-a': { 480: url, 960: url }, … }
// v1 拿掉的两题（色盘、书架：flow.js LEGACY_PAIRS，只剩文字给旧档案用）的图不打包 —— 在 sets.js 里重拍出来也不会进 dist
const FILES = import.meta.glob(['./vignettes/img/*.webp', '!./vignettes/img/{palette,shelf}-*.webp'], { eager: true, query: '?url', import: 'default' });
const IMG = {};
for (const [path, url] of Object.entries(FILES)) {
  const m = /\/([a-z]+-[a-f])-(\d+)\.webp$/.exec(path);
  if (m) (IMG[m[1]] ||= {})[m[2]] = url;
}
const hasFiles = (k) => !!(k && IMG[k]?.[480] && IMG[k]?.[960]);

// v1 的「星期六晚上」用 emoji 当记号（旧的 visual 写法）：🍲 一屋子朋友打边炉 / 📖 一个人，一本书，一杯茶
const BY_EMOJI = { '🍲': 'weekend-a', '📖': 'weekend-b' };

/** 这一张图的 key：visual.img（v2）→ 旧写法的 emoji → 调用的人给的 id（题目-v）；没有图 → null */
export function vignetteKey(visual, id) {
  const k = visual?.img || (visual?.kind === 'scene' && BY_EMOJI[visual.emoji]) || id;
  return hasFiles(k) ? k : null;
}

// 卡片在画面上多宽（srcset 按这个挑）：手机两栏 ≈ 160 px（3 倍屏刚好拿 480）；iPad 竖放两栏；横放 3–4 栏
const SIZES = '(max-width: 560px) 160px, (max-width: 900px) 44vw, 320px';
const small = () => typeof matchMedia === 'function' && matchMedia('(max-width: 560px)').matches;

/** 提前把下一题的 n 张图拿下来（换题时不闪）：手机拿 480，其他拿 960（和 srcset 挑的一样，不会下载两次） */
export function preloadVignettes(pair) {
  if (!pair || typeof Image === 'undefined') return;
  const size = small() ? 480 : 960;
  for (const o of optionsOf(pair)) {
    const k = vignetteKey(o.visual, `${pair.id}-${o.v}`);
    if (!k) continue;
    const im = new Image();
    im.decoding = 'async';
    im.src = IMG[k][size];
  }
}

/** 色卡用哪四个材质：选项自己的在前，不够用这一题房间的补；重复的去掉 */
export function collageMats(mats = [], fallback = []) {
  return [...new Set([...mats, ...fallback])].filter(Boolean).slice(0, 4);
}

/**
 * 一张小照片。visual = 选项的 visual（{ kind:'room', img }）；id = 题目-v（旧写法）；
 * mats = 没有照片时拼色卡的材质（选项的 + 这一题的，见 collageMats）。
 */
export default function Vignette({ visual, id, mats = [] }) {
  const [ready, setReady] = useState(false);
  const k = vignetteKey(visual, id);
  if (!k) {
    // 四格色卡：像设计师摊在桌上的材料小样（材质库的底色 + 一层很淡的光）
    const ids = collageMats(mats).filter((m) => MAT_BY_ID[m]);
    return (
      <span className={`vg vg-collage n${ids.length}`} aria-hidden="true">
        {ids.map((m) => (
          <i key={m} className={`cat-${MAT_BY_ID[m].cat}`} style={{ backgroundColor: MAT_BY_ID[m].color }} />
        ))}
      </span>
    );
  }
  const set = IMG[k];
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
