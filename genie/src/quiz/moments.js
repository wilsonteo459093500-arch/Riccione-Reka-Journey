// 许愿之旅的「时刻」小工具（动效 / 音乐 / 潘吉说话共用）：
//   · stoneOf(chapter)        顶栏上这一章的踏脚石（被选中的东西飞过去、一粒光落进去的地方）
//   · settle(f, p, fn, max)   等动效做完再前进 —— p 结束就调 fn，最多等 max 毫秒（fx 的时钟：录帧时一起走，组件走了就不调）
//   · byDistance(els, from)   离「起因」（按下去的那个）近的先走：错开的离场按这个顺序
//   · cue(type, data)         告诉外壳（许愿模式）+ 单独打开时自己的背景音乐跟着换（同一张对应表：music/moods.js）
//   · startMusic(mood)        单独打开的许愿之旅：在「开始许愿」那一下里开音乐（iPad 只认点击里开的声音）
//   · markMoment / sinceMoment  一个「时刻」的声音刚响过多久（同一刻不叠两段琶音）
// 音乐 SPEC §11：单独打开（客人自己的手机）用 sessionType 'ambient' —— 手机的静音键说了算；许愿模式里外壳放音乐，这里只发消息。

import fx from '../shared/fx.js';
import { sfx, isMuted } from '../shared/sfx.js';
import { Zen, applyMusic, musicFor, isWishMode, tellShell } from '../shared/zen.js';
import { CHAPTERS } from './flow.js';

const WISH = isWishMode();
const HAS_DOM = typeof window !== 'undefined' && typeof document !== 'undefined';

export const chapterIndex = (ch) => CHAPTERS.findIndex((c) => c.id === ch);

/** 顶栏上这一章的踏脚石（svg）；没有顶栏 = null */
export const stoneOf = (ch) => (HAS_DOM && ch ? document.querySelector(`.stones .stone[data-ch="${ch}"] svg`) : null);

/**
 * 动效做完再前进：p 结束（成功或失败）就调 fn，一次；保险：max 毫秒后也调（fx 的时钟，所以录帧 / 切走分页时一起停）。
 * f = useFx() 的结果：组件已经卸载就什么都不调。
 */
export function settle(f, p, fn, max = 2600) {
  let done = false;
  let tid = 0;
  const go = () => {
    if (done) return;
    done = true;
    clearTimeout(tid);
    if (f?.alive && !f.alive()) return;
    fn();
  };
  Promise.resolve(p).then(go, go);
  (f?.after || fx.clock.after.bind(fx.clock))(max, go);
  // 第二道保险用真实时间：很卡的设备上 fx 的时钟会走慢（一帧超过 250 ms 只算 16.7 ms，切走分页回来不会跳过整段动画），
  // 客人不能因此卡在一题上。录帧（手动时钟）时不算。
  const guard = () => {
    if (done) return;
    if (fx.clock.manual) tid = setTimeout(guard, 500);
    else go();
  };
  if (typeof setTimeout === 'function') tid = setTimeout(guard, max * 1.6);
}

// ───────────────────────── 一次只有一个「时刻」 ─────────────────────────
// 达成（achievement）的琶音刚响过，紧接着的溪光就不再自己刮一段竖琴（音效 SPEC §9：同一刻只有一个主角）

const marks = {};
// 动效的时钟（不是墙上的时间）：和溪光、翻牌同一把尺子 —— 录帧（手动时钟）、很卡的设备上也对得上
const nowMs = () => fx.clock.now();

/** 记下「这个时刻刚响了」 */
export function markMoment(name) {
  marks[name] = nowMs();
}

/** 这个时刻是多少毫秒以前响的（没响过 = Infinity） */
export function sinceMoment(name) {
  return marks[name] == null ? Infinity : nowMs() - marks[name];
}

const centre = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/** 按离 from（元素或 {x, y}）的距离排好（近的在前）。一次读完位置，不在动画里读版面 */
export function byDistance(els, from) {
  const o = from && typeof from.x === 'number' ? from : from ? centre(from) : { x: 0, y: 0 };
  return els
    .filter(Boolean)
    .map((el) => {
      const c = centre(el);
      return { el, d: Math.hypot(c.x - o.x, c.y - o.y) };
    })
    .sort((a, b) => a.d - b.d)
    .map((x) => x.el);
}

// ───────────────────────── 背景音乐（只在单独打开的许愿之旅；许愿模式里是外壳的） ─────────────────────────

export const zen = !WISH && HAS_DOM ? new Zen({ sessionType: 'ambient' }) : null;

/**
 * 一个时刻：告诉外壳（许愿模式），单独打开时自己的音乐也照同一张表换（mood / 点缀 / 压低）。
 * type：page · mood · chapter · reveal · wish（和 tellShell 一样）
 */
export function cue(type, data = {}) {
  tellShell(type, data);
  if (!zen) return;
  // 揭晓：音乐在放的时候，揭晓那一段金铃交给音乐（《星灯》的刮奏），按钮音效只响全息光 —— 同一下不会两段叠在一起
  if (type === 'reveal') sfx.musicReveal = !!zen.running && !zen.muted && !isMuted();
  try {
    applyMusic(zen, musicFor(type, data));
  } catch {
    /* 音乐只是陪衬：出错也不能挡住客人 */
  }
}

/** 单独打开的许愿之旅：在点击里开音乐（静音的话不开；之后打开声音时再开） */
export function startMusic(mood) {
  if (!zen || isMuted()) return;
  try {
    if (mood) zen.setMood(mood);
    zen.start();
  } catch {
    /* 没有 Web Audio：安静地继续 */
  }
}
