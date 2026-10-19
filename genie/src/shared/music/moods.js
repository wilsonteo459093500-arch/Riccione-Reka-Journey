// moods.js —— 许愿之旅的每一刻 → 音乐该做什么。外壳（WishShell，许愿模式）和单独打开的许愿之旅（quiz.html 自己放音乐）
// 用同一套对应关系，听起来一样（音乐 SPEC §7）：
//   欢迎 / 生活 / 雷区 = calm《晨光》· 直觉 = intuition《溪岸》（三秒的选择中间不会突然「叮」）· 宝藏 / 愿望 = focus《竹影》·
//   神灯 / 读懂你（揭晓前）= dusk《暮色》· 揭晓 = reveal《星灯》（刮奏落在主音上）· 蓝图 = blueprint《归家》× 0.5 ·
//   带它回家（你的家 · 案例 · 户型图，page 'home'）= 和蓝图一样《归家》× 0.5（「生成」那一刻的暮色由 mood: dusk 负责）·
//   3D = studio《归家》× 0.25（晚上 = night《归家·夜》）。章节牌翻面 = chapter 点缀；每个愿望 = 音效 wishAdd 负责（音乐不再响铃）。
//
// 用法：
//   import { musicFor, applyMusic } from '../shared/music/moods.js';
//   applyMusic(zen, musicFor(msg.type, msg));   // msg = tellShell 发来的 { type, ...data }

import { MOODS, ALIAS } from './zs-scores.js';

/** 章节 → 情绪（tellShell('chapter', { chapter })） */
export const CHAPTER_MOOD = { intuition: 'intuition', life: 'calm', treasure: 'focus', wishes: 'focus', nogo: 'calm' };

/** 3D 工作室里的时间（tellShell('time', { hour })）：天黑了换《归家·夜》 */
export const isNightHour = (hour) => Number.isFinite(+hour) && (+hour >= 19.6 || +hour < 6.4);

/**
 * 一条子页面消息 → 一步音乐动作 { mood?, cue?, duck?, duckSec? }；不用动音乐 = null。
 * type：page（data.page = quiz | blueprint | home | studio；studio 可以带 night: true）· mood（data.mood）· chapter · reveal · wish · time（data.hour）
 */
export function musicFor(type, data = {}) {
  switch (type) {
    case 'page':
      if (data.page === 'quiz') return { mood: 'calm', duck: 1, duckSec: 2 };
      if (data.page === 'blueprint' || data.page === 'home') return { mood: 'blueprint', duck: 'blueprint', duckSec: 3 };
      if (data.page === 'studio') return { mood: data.night ? 'night' : 'studio', duck: 'studio', duckSec: 3 };
      return null;
    case 'mood': {
      const m = ALIAS[data.mood] || data.mood;
      return MOODS[m] ? { mood: m } : null;
    }
    case 'chapter':
      return { mood: CHAPTER_MOOD[data.chapter] || 'calm', cue: 'chapter' };
    case 'reveal':
      return { cue: 'reveal' };
    case 'time':
      return { mood: isNightHour(data.hour) ? 'night' : 'studio' }; // 只在 3D 页里用（外壳自己判断现在在不在 3D）
    case 'wish': // 每个愿望的声音是音效 wishAdd（客人按下去的那一下）；音乐不再响自己的铃，同一下不会有两个铃
    default:
      return null;
  }
}

/** 把 musicFor() 的结果交给 Zen（null = 什么都不做） */
export function applyMusic(zen, step) {
  if (!zen || !step) return;
  if (step.mood) zen.setMood(step.mood);
  if (step.cue) zen.accent(step.cue);
  if (step.duck != null) zen.duck(step.duck, step.duckSec ?? 3);
}
