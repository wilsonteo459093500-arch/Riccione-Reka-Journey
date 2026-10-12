// 潘吉 Pangie —— 熊猫 × 神灯精灵（业主选定的方向 C「高级毛绒」）。原创形象：真熊猫的黑白花纹、丝绒缠头巾 + 椭圆琥珀宝石，
// 捧着一颗晨露，坐在一团晨雾上（溪水青的螺旋尾巴）；柔光立体、玻璃珠眼睛，像一只做工很好的毛绒玩具。
// 画法在 pangieArt.js（纯 SVG 字符串）；这里只是 React 外壳：同一个 <svg class="pangie">，海报（poster.js）照样能截。
// 神灯在 lampArt.js：擦灯时只改根上的 --glow（覆盖层的不透明度），不重建 SVG。
//
// <Pangie mood="idle|happy|wow|think|wink|mystic|sleepy" prop="ball|cards|magnifier|none" size={160} />
//   ball = 晨露（旧名沿用，接口不变）；aura = 强制显示暖光圈（不在 .dusk 里也亮）
// <Lamp size={156} glow={0.5} smoke />   smoke：false | true | 'glow'（跟着 glow 淡入）；detail：'auto' 按 size 选

import { useId, useMemo } from 'react';
import { pangieInner } from './pangieArt.js';
import { lampInner, detailFor, LAMP_VIEWBOX } from './lampArt.js';
import { guideName } from './i18n.js';

export default function Pangie({ mood = 'idle', prop = 'ball', size = 160, float = true, className = '', title, aura = false }) {
  const id = `pg${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  // 只在表情 / 道具 / 尺寸变的时候重新生成（一次约 3 ms）；字符串没变，React 不会重写 DOM
  const inner = useMemo(() => pangieInner({ mood, prop, idPrefix: id, aura, size }), [mood, prop, id, aura, size]);
  return (
    <svg
      viewBox="0 0 200 250"
      width={size}
      height={(size * 250) / 200}
      className={`pangie ${float ? 'pg-float' : ''} ${className}`}
      role="img"
      aria-label={title || guideName()}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

/** 神灯（召唤仪式用；三个愿望的小灯、入口页、许愿模式开场也用它）。glow 0–1 只改根上的 --glow */
export function Lamp({ size = 200, glow = 0, smoke = false, detail = 'auto', className = '' }) {
  const id = `lp${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const d = detail === 'auto' ? detailFor(size) : detail;
  // 静态标记：只随 (id, detail, smoke) 变，擦灯时不会重建
  const html = useMemo(() => lampInner({ smoke, detail: d, idPrefix: id }), [smoke, d, id]);
  const g = Math.max(0, Math.min(1, Number(glow) || 0));
  return (
    <svg
      viewBox={LAMP_VIEWBOX}
      width={size}
      height={(size * 140) / 240}
      className={className}
      style={{ '--glow': g }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
