// 潘吉 Pangie —— 熊猫 × 神灯精灵（业主选定的方向 C「高级毛绒」）。原创形象：真熊猫的黑白花纹、丝绒缠头巾 + 椭圆琥珀宝石，
// 捧着一颗晨露，坐在一团晨雾上（溪水青的螺旋尾巴）；柔光立体、玻璃珠眼睛，像一只做工很好的毛绒玩具。
// 她是个小女生（业主 2026-10）：眼角两根细睫毛、头巾上一朵小金花、腮红暖一点 —— 而且会说话（voice.js）。
// 画法在 pangieArt.js（纯 SVG 字符串）；这里只是 React 外壳：同一个 <svg class="pangie">，海报（poster.js）照样能截。
// 神灯在 lampArt.js：擦灯时只改根上的 --glow（覆盖层的不透明度），不重建 SVG。
//
// <Pangie mood="idle|happy|wow|think|wink|mystic|sleepy" prop="ball|cards|magnifier|none" size={160} />
//   ball = 晨露（旧名沿用，接口不变）；aura = 强制显示暖光圈（不在 .dusk 里也亮）
//   speaker  = 这一只就是「会说话」的那一只：voice.js 说台词时自动换成会说话的嘴，口型（--mouth）由 voice.js 每帧直接写，
//              React 不会每帧重画；轻点她会跳过这一句（data-voice-skip）。同一个画面只给一只 speaker（海报那只永远不是）。
//   talking  = 手动让她「说话」（true：没有口型数据时跑一圈柔和的 pg-talk 循环；false：强制闭嘴，盖过 speaker）
//   mouth    = 手动给口型 0–1（演示 / 截图用；给了就不跑循环）
// <Lamp size={156} glow={0.5} smoke />   smoke：false | true | 'glow'（跟着 glow 淡入）；detail：'auto' 按 size 选
//
// 钩子（声音接线用）：
//   useVoiceLine('ch.life', { delay: 1150 })               画面出现时说一句，离开画面时自动停（stopIf）
//   useVoiceLine('lamp.done', { when: done, delay: 650 })  条件成立时说
//   useTalking()           潘吉此刻在不在说话（true / false；只在说话开始 / 结束时重画）
//   useVoiceOn()           [on, setOn]：「潘吉说话」开关（记在这台设备上）

import { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';
import { pangieInner } from './pangieArt.js';
import { lampInner, detailFor, LAMP_VIEWBOX } from './lampArt.js';
import { guideName } from './i18n.js';
import { voice, talkState } from './voice.js';

const NO_SUB = () => () => {};
const QUIET = () => '';

/** true while Pangie herself is speaking a line (her voice from inside the lamp does not count) */
export function useTalking(enabled = true) {
  const v = useSyncExternalStore(enabled ? talkState.subscribe : NO_SUB, enabled ? talkState.get : QUIET, QUIET);
  return enabled && v === 'pangie';
}

/**
 * Say a line while this screen (or a condition) is up; leaving the screen stops it (a delayed line that has not
 * started is dropped), so a line never spills onto the next screen.
 *   mode: 'interrupt' (default) | 'queue' | 'ifIdle'
 */
export function useVoiceLine(id, { when = true, delay = 0, mode } = {}) {
  useEffect(() => {
    if (!id || !when) return undefined;
    voice.say(id, { delay, mode });
    return () => voice.stopIf(id);
  }, [id, when]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** [on, setOn] for a 「潘吉说话」 switch (remembered on this device; the Wish-Mode shell follows it too) */
export function useVoiceOn() {
  const [on, set] = useState(() => voice.enabled);
  useEffect(() => voice.on('state', () => set(voice.enabled)), []);
  return [
    on,
    (v) => {
      voice.setEnabled(v);
      set(!!v);
    },
  ];
}

export default function Pangie({ mood = 'idle', prop = 'ball', size = 160, float = true, className = '', title, aura = false, speaker = false, talking, mouth }) {
  const id = `pg${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const voiceTalking = useTalking(!!speaker && talking == null); // 只有 speaker 才订阅：其它潘吉不会因为说话重画
  // 只在表情 / 道具 / 尺寸变的时候重新生成（一次约 3 ms）；字符串没变，React 不会重写 DOM
  const inner = useMemo(() => pangieInner({ mood, prop, idPrefix: id, aura, size }), [mood, prop, id, aura, size]);
  const manual = mouth != null && Number.isFinite(Number(mouth));
  const isTalking = talking != null ? !!talking : voiceTalking || manual;
  // 口型：voice.js 每帧写 .pg-talk 的 --mouth（speaker），或者这里给的 mouth；都没有 → CSS 循环
  const lipsync = isTalking && (manual || (talking == null && voiceTalking));
  const cls = ['pangie', float ? 'pg-float' : '', isTalking ? 'is-talking' : '', lipsync ? 'is-lipsync' : '', className].filter(Boolean).join(' ');
  return (
    <svg
      viewBox="0 0 200 250"
      width={size}
      height={(size * 250) / 200}
      className={cls}
      style={manual ? { '--mouth': Math.max(0, Math.min(1, Number(mouth))).toFixed(3) } : undefined}
      data-speaker={speaker ? '' : undefined}
      data-voice-skip={speaker ? '' : undefined}
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
