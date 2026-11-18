// 展厅播放 · 开场（像新 iPhone 开机的「Hello」）：手写问候轮播 → 「你好，{名字}」→ 几句话一句一句浮现 →
// 品牌句「行至溪岸，回归生活的美好」→ 木纹 U 画出来 +「轻触开始」。
//
// 和后面的方案页不一样，开场是「按时间」播的（方案页只看滑动位置，见 motion.js 的铁律）—— 所以整段放在单独一层
// （components/showroom/ShowroomIntro.jsx），这里只放文案和时间轴的纯函数（可测）。
//
// 语气参考 Aman：一屏只说一件事；字少、留白、慢；不用感叹号；称呼用「你」。

import { clamp01, ease } from './motion.js';
import { langOf, resolveEn, hasCJKText } from '../engine/lang.js';
import { joinLines, dateZh, dateEn } from '../engine/b/company.js';

/** 手写问候：英文 / 马来文用手写体，中文用书法体，从左到右「写」出来 */
export const HELLOS = [
  { text: 'Hello', font: 'script' },
  { text: 'Selamat datang', font: 'script' },
  { text: '你好', font: 'brush' },
];

/**
 * 开场文案（定稿：老板审过再改）。{{name}} = 开场称呼；空 zh = 空屏（只剩溪水声）。
 * hold = 这一屏停多久（ms，含淡入淡出）
 */
export const INTRO_COPY = [
  { id: 'greet', zh: '你好，{{name}}', en: 'Hello, {{name}}', hold: 3200 },
  { id: 'honour', zh: '很荣幸，\n能成为你家的一部分。', en: 'It is an honour\nto become part of your home.', hold: 3800 },
  { id: 'ahead', zh: '接下来的日子，', en: 'In the days ahead,', hold: 2800 },
  { id: 'nature', zh: '我们一起，\n在自然里，寻一份平和；', en: 'together, let us find calm in nature,', hold: 3800 },
  { id: 'quiet', zh: '在日常里，找一种\n让人安静下来的设计。', en: 'and in everyday life,\na design that quiets the mind.', hold: 4200 },
  { id: 'rest', zh: '', en: '', hold: 2000 },
  { id: 'brand', zh: '行至溪岸，\n回归生活的美好。', en: 'Walk to the stream,\nreturn to the beauty of everyday life.', hold: 4400 },
];

/** 最后一屏：木纹 U + 落款 +「轻触开始」 */
export const INTRO_END = {
  zh: { home: '为{{name}}的家', homeAnon: '为你的家', cta: '轻触开始' },
  en: { home: "For {{name}}'s home", homeAnon: 'For your home', cta: 'Tap to begin' },
};

export const HELLO_MS = 1800; // 每个手写问候停多久
export const WRITE_MS = 1100; // 写出来要多久
export const FADE_IN = 1200;
export const FADE_OUT = 800;
export const HELLO_FADE_OUT = 450;
export const END_DRAW_MS = 2400; // 木纹 U 画完
export const END_FOOT_AT = 1600; // 落款开始浮现
export const END_CTA_AT = 3000; // 「轻触开始」出现
export const LEAVE_MS = 1400; // 轻触后整层淡出

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

/** 中文句子里夹英文名：前后空一格（「为 Mr Lau 的家」/「为刘先生的家」）；紧跟全角标点的不空 */
function fillZh(tpl, name) {
  const latin = /^[A-Za-z0-9]/.test(name);
  return tpl.replace(/(.?)\{\{name\}\}(.?)/g, (_, a, b) => {
    const pre = latin && a && !/[，。、；：\s]/.test(a) ? `${a} ` : a;
    const post = latin && b && !/[，。、；：\s]/.test(b) ? ` ${b}` : b;
    return `${pre}${name}${post}`;
  });
}
const fillEn = (tpl, name) => tpl.replace(/\{\{name\}\}/g, name);

/** 最后一屏的落款：为 {名字} 的家 · 日期 · 地点（没填的就不写） */
export function introFooter(project, lang = langOf(project)) {
  const info = project?.info || {};
  const name = introName(project);
  const loc = clean(info.location);
  const locEn = loc && (hasCJKText(loc) ? resolveEn(project, loc).text : loc);
  const homeZh = name.zhKnown ? fillZh(INTRO_END.zh.home, name.zh) : INTRO_END.zh.homeAnon;
  const homeEn = name.enKnown ? fillEn(INTRO_END.en.home, name.en) : INTRO_END.en.homeAnon;
  const zh = [homeZh, dateZh(info.date), loc].filter(Boolean).join(' · ');
  const en = [homeEn, dateEn(info.date, (x) => (hasCJKText(x) ? '' : x)), locEn].filter(Boolean).join(' · ');
  if (lang === 'en') return { main: en, sub: '', cta: INTRO_END.en.cta };
  if (lang === 'bi') return { main: zh, sub: en, cta: `${INTRO_END.zh.cta} · ${INTRO_END.en.cta}` };
  return { main: zh, sub: '', cta: INTRO_END.zh.cta };
}

/**
 * 要播的每一屏（按提案语言）：
 *   { type:'hello', text, font } | { type:'line', id, main, sub, lang:'zh'|'en' } | { type:'rest' } | { type:'end', main, sub, cta }
 * zh = 只有中文；en = 英文为主字；bi = 中文为主，英文小字跟在下面
 */
export function introScreens(project) {
  const lang = langOf(project);
  const name = introName(project);
  const out = HELLOS.map((h) => ({ type: 'hello', ...h, hold: HELLO_MS }));
  for (const c of INTRO_COPY) {
    if (!c.zh) {
      out.push({ type: 'rest', id: c.id, hold: c.hold });
      continue;
    }
    const zh = fillZh(c.zh, name.zh);
    const en = fillEn(c.en, name.en);
    if (lang === 'en') out.push({ type: 'line', id: c.id, main: en, sub: '', lang: 'en', hold: c.hold });
    else out.push({ type: 'line', id: c.id, main: zh, sub: lang === 'bi' ? en : '', lang: 'zh', hold: c.hold });
  }
  out.push({ type: 'end', ...introFooter(project, lang), hold: Infinity });
  return out;
}

/** 每一屏的开始 / 结束时间（ms）；最后一屏一直停着，等轻触 */
export function introTimeline(screens) {
  let t = 0;
  const items = screens.map((s) => {
    const it = { ...s, start: t, end: t + s.hold };
    t = it.end;
    return it;
  });
  const endAt = items.length ? items[items.length - 1].start : 0;
  return { items, endAt };
}

/** 想跳过：直接到最后一屏（木纹 U +「轻触开始」） */
export const introSkipTarget = (tl) => tl.endAt;

/**
 * t（ms）时的画面：哪一屏、透明度、模糊、上下位移、手写进度、U 画到哪
 * @returns {{ index:number, screen:object, local:number, opacity:number, blur:number, ty:number, write:number, draw:number, foot:number, cta:number, atEnd:boolean }}
 */
export function introFrame(t, tl) {
  const { items } = tl;
  let index = items.findIndex((it) => t < it.end);
  if (index < 0) index = items.length - 1;
  const screen = items[index];
  const local = Math.max(0, t - screen.start);
  const base = { index, screen, local, opacity: 1, blur: 0, ty: 0, write: 1, draw: 1, foot: 1, cta: 1, atEnd: screen?.type === 'end' };
  if (!screen) return base;
  if (screen.type === 'hello') {
    const out = ease((local - (screen.hold - HELLO_FADE_OUT)) / HELLO_FADE_OUT);
    return { ...base, write: ease(local / WRITE_MS), opacity: 1 - out, blur: out * 4, ty: 0 };
  }
  if (screen.type === 'end') {
    const inQ = ease(local / FADE_IN);
    return {
      ...base,
      opacity: inQ,
      draw: ease(local / END_DRAW_MS),
      foot: ease((local - END_FOOT_AT) / FADE_IN),
      cta: ease((local - END_CTA_AT) / FADE_IN),
    };
  }
  if (screen.type === 'rest') return { ...base, opacity: 0 };
  const inQ = ease(local / FADE_IN);
  const outQ = ease((local - (screen.hold - FADE_OUT)) / FADE_OUT);
  return { ...base, opacity: clamp01(inQ * (1 - outQ)), blur: (1 - inQ) * 6 + outQ * 3, ty: (1 - inQ) * 8 - outQ * 4 };
}

/** 品牌句那一屏开始的时间：已上传的展厅音乐从这里淡入 */
export const introMusicAt = (tl) => tl.items.find((it) => it.id === 'brand')?.start ?? tl.endAt;
