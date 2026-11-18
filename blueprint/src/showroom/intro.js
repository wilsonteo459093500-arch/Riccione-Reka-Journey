// 展厅播放 · 开场（像新 iPhone 开机的「Hello」）：Hello → Selamat datang → 你好（下面浮出客户名字）→
// 几句话一句一句浮现 → 品牌句「行至溪岸 / 回归生活的美好」→ 整层慢慢淡出，下面就是方案封面（不出 UKIR、不用再点）。
//
// 和后面的方案页不一样，开场是「按时间」播的（方案页只看滑动位置，见 motion.js 的铁律）—— 所以整段放在单独一层
// （components/showroom/ShowroomIntro.jsx），这里只放文案和时间轴的纯函数（可测）。
//
// 语气参考 Aman：一屏只说一件事；字少、留白、慢；不用标点（逗号处换行）；称呼用「你」。

import { clamp01, ease } from './motion.js';
import { langOf, resolveEn, hasCJKText } from '../engine/lang.js';
import { joinLines } from '../engine/b/company.js';

/** 手写问候：英文 / 马来文用手写体，中文用书法体，从左到右「写」出来；最后一个（你好）下面浮出客户名字 */
export const HELLOS = [
  { text: 'Hello', font: 'script' },
  { text: 'Selamat datang', font: 'script' },
  { text: '你好', font: 'brush' },
];

/**
 * 开场文案（定稿：老板审过再改）。不用标点：原来的逗号处换行。空 zh = 空屏（只剩溪水声）。
 * hold = 这一屏停多久（ms，含淡入淡出）
 */
export const INTRO_COPY = [
  { id: 'honour', zh: '很荣幸\n能成为你家的一部分', en: 'It is an honour\nto become part of your home', hold: 3800 },
  { id: 'ahead', zh: '接下来的日子', en: 'In the days ahead', hold: 2800 },
  { id: 'nature', zh: '我们一起\n在自然里\n寻一份平和', en: 'together\nlet us find calm in nature', hold: 4000 },
  { id: 'quiet', zh: '在日常里\n找一种让人安静下来的设计', en: 'and in everyday life\na design that quiets the mind', hold: 4200 },
  { id: 'rest', zh: '', en: '', hold: 2000 },
  { id: 'brand', zh: '行至溪岸\n回归生活的美好', en: 'Walk to the stream\nreturn to the beauty of everyday life', hold: 4600, last: true },
];

export const HELLO_MS = 1800; // 每个手写问候停多久
export const HELLO_NAME_MS = 3600; // 「你好」+ 名字那一屏停多久
export const NAME_AT = 1300; // 「你好」写完后，名字开始浮出
export const WRITE_MS = 1100; // 写出来要多久
export const FADE_IN = 1200;
export const FADE_OUT = 800;
export const HELLO_FADE_OUT = 450;
export const LEAVE_MS = 1400; // 播完（或点一下）后整层淡出，露出方案封面

const clean = (s) => String(s ?? '').trim();

/**
 * 开场叫客户什么：先看「开场称呼」（info.greetAs，如 Jason & Mei），再看「客户」栏（两行并成一行）；都没有 = 朋友 / friend。
 * 英文版：本来就是英文的原样；中文名取翻译记忆，没有就 friend。
 * @returns {{ zh:string, en:string, zhKnown:boolean, enKnown:boolean }}  known = 叫得出名字（不是「朋友 / friend」）
 */
export function introName(project) {
  const info = project?.info || {};
  const lines = (s) => clean(s).split(/\s*\n+\s*/).filter(Boolean);
  const who = joinLines(lines(info.greetAs).length ? lines(info.greetAs) : lines(info.client));
  if (!who) return { zh: '朋友', en: 'friend', zhKnown: false, enKnown: false };
  const en = hasCJKText(who) ? resolveEn(project, who).text : who;
  return { zh: who, en: en || 'friend', zhKnown: true, enKnown: !!en };
}

/**
 * 要播的每一屏（按提案语言）：
 *   { type:'hello', text, font, name? } | { type:'line', id, main, sub, lang:'zh'|'en', last? } | { type:'rest' }
 *   name：最后一个手写问候（你好）下面的客户名字（叫不出名字 = ''，只写「你好」）
 *   最后一屏是品牌句（last：不自己淡掉，和整层一起淡出，接到方案封面）
 * zh = 只有中文；en = 英文为主字；bi = 中文为主，英文小字跟在下面
 */
export function introScreens(project) {
  const lang = langOf(project);
  const name = introName(project);
  const who = lang === 'en' ? (name.enKnown ? name.en : '') : name.zhKnown ? name.zh : '';
  const out = HELLOS.map((h, i) => (i === HELLOS.length - 1 ? { type: 'hello', ...h, name: who, hold: HELLO_NAME_MS } : { type: 'hello', ...h, name: '', hold: HELLO_MS }));
  for (const c of INTRO_COPY) {
    if (!c.zh) {
      out.push({ type: 'rest', id: c.id, hold: c.hold });
      continue;
    }
    const { zh, en } = c;
    const last = !!c.last;
    if (lang === 'en') out.push({ type: 'line', id: c.id, main: en, sub: '', lang: 'en', hold: c.hold, last });
    else out.push({ type: 'line', id: c.id, main: zh, sub: lang === 'bi' ? en : '', lang: 'zh', hold: c.hold, last });
  }
  return out;
}

/** 每一屏的开始 / 结束时间（ms）；total = 开场结束（之后整层淡出、进方案） */
export function introTimeline(screens) {
  let t = 0;
  const items = screens.map((s) => {
    const it = { ...s, start: t, end: t + s.hold };
    t = it.end;
    return it;
  });
  return { items, total: t };
}

/**
 * t（ms）时的画面：哪一屏、透明度、模糊、上下位移、手写进度；done = 播完了（该淡出进方案）
 * @returns {{ index:number, screen:object, local:number, opacity:number, blur:number, ty:number, write:number, nameIn:number, done:boolean }}
 */
export function introFrame(t, tl) {
  const { items } = tl;
  const done = t >= tl.total;
  let index = items.findIndex((it) => t < it.end);
  if (index < 0) index = items.length - 1;
  const screen = items[index];
  const local = Math.max(0, t - (screen?.start ?? 0));
  const base = { index, screen, local, opacity: 1, blur: 0, ty: 0, write: 1, nameIn: 0, done };
  if (!screen) return base;
  if (screen.type === 'hello') {
    const out = ease((local - (screen.hold - HELLO_FADE_OUT)) / HELLO_FADE_OUT);
    const nameIn = screen.name ? ease((local - NAME_AT) / FADE_IN) : 0;
    return { ...base, write: ease(local / WRITE_MS), nameIn, opacity: 1 - out, blur: out * 4, ty: 0 };
  }
  if (screen.type === 'rest') return { ...base, opacity: 0 };
  const inQ = ease(local / FADE_IN);
  // 最后一句（品牌句）不自己淡掉：整层淡出时和纸面一起退场，接到方案封面
  const outQ = screen.last ? 0 : ease((local - (screen.hold - FADE_OUT)) / FADE_OUT);
  return { ...base, opacity: clamp01(inQ * (1 - outQ)), blur: (1 - inQ) * 6 + outQ * 3, ty: (1 - inQ) * 8 - outQ * 4 };
}

/** 品牌句那一屏开始的时间：已上传的展厅音乐从这里淡入 */
export const introMusicAt = (tl) => tl.items.find((it) => it.id === 'brand')?.start ?? tl.total;
