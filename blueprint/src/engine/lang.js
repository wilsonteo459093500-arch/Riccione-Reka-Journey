// 提案语言：华文（zh = 定稿原样）/ English（en = 全英文）/ 中英（bi = 中文为主，英文跟在下面）。
//
// 项目里只存中文（导入、编辑都是中文）；英文按下面的顺序取：
//   1. project.translations[中文]  —— AI 翻译或设计师手填的（整套共用：同一句中文只译一次，改一处全套跟着变）
//   2. 词典（glossary.js）          —— 空间、视角、部位、备注标签、团队职位等常用词，离线自动
//   3. 本来就没有中文（'Taj Mahal'、'AG273'）—— 原样
// 都取不到 = 缺英文：英文版先显示中文并在这一页提醒，中英版只显示中文。
// 中文改了，translations 里旧的那条就对不上了（按原文查）→ 自然变成「缺英文」，不会显示过时的翻译。

import { glossaryEn, hasCJKText, normSpace, floorTitleEn, floorsLineEn } from './glossary.js';
import { titleCase } from '../import/labels.js';

export { hasCJKText, floorTitleEn, floorsLineEn };

export const LANGS = [
  { id: 'zh', label: '华文', title: '中文提案（与定稿一致）' },
  { id: 'en', label: 'English', title: '全英文提案' },
  { id: 'bi', label: '中英', title: '中英双语：中文为主，英文写在下面' },
];

export const LANG_NAMES = { zh: '华文', en: 'English', bi: '中英文' };

/** 项目的提案语言（旧项目没有这个字段 = 华文） */
export const langOf = (project) => (project?.info?.lang === 'en' || project?.info?.lang === 'bi' ? project.info.lang : 'zh');

/** 翻译记忆的键：空白 / 中点规范后的中文原文 */
export const tmKey = (s) => normSpace(s);

/** 翻译记忆里查（没有返回 ''） */
export function memoryEn(project, zh) {
  const v = project?.translations?.[tmKey(zh)];
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * 一段中文的英文：{ text, source:'memory'|'glossary'|'latin'|'empty'|'missing' }
 * @param {'room'|'view'|'role'|'label'|'note'|'material'|'team'|'text'} kind 用哪类词典
 */
export function resolveEn(project, zh, kind = 'text') {
  const s = normSpace(zh);
  if (!s) return { text: '', source: 'empty' };
  const mem = memoryEn(project, s);
  if (mem) return { text: mem, source: 'memory' };
  if (!hasCJKText(s)) return { text: s, source: 'latin' };
  const g = glossaryEn(s, kind);
  if (g) return { text: g, source: 'glossary' };
  return { text: '', source: 'missing' };
}

/** 设 / 清一条翻译（en 为空 = 删掉，回到词典 / 缺英文） */
export function setTranslation(project, zh, en) {
  const key = tmKey(zh);
  if (!key) return project;
  const cur = project.translations || {};
  const val = String(en ?? '').trim();
  if ((cur[key] || '') === val) return project;
  const next = { ...cur };
  if (val) next[key] = val;
  else delete next[key];
  return { ...project, translations: next };
}

/** 批量写入翻译 [{ zh, en }]（AI 翻译结果） */
export function addTranslations(project, pairs) {
  let next = project.translations || {};
  let changed = false;
  for (const { zh, en } of pairs || []) {
    const key = tmKey(zh);
    const val = String(en ?? '').trim();
    if (!key || !val || next[key] === val) continue;
    if (!changed) next = { ...next };
    next[key] = val;
    changed = true;
  }
  return changed ? { ...project, translations: next } : project;
}

/** 效果图页空间名的英文（标题写法）：优先页面上的「英文小标题」roomEn，其次翻译 */
export function roomEnOf(project, slide) {
  const raw = String(slide?.roomEn || '').trim();
  if (raw) return { text: titleCase(raw), source: 'field' };
  return resolveEn(project, slide?.room, 'room');
}

/**
 * 渲染用的翻译器（每页一个）：记下这一页缺英文的中文，好在页面上提醒。
 *   en(zh, kind) → 英文（缺 = ''）
 *   show(zh, kind) → 单语显示：华文 / 中英 = 中文；英文 = 英文，缺英文时先用中文
 *   misses → [{ zh, kind }]
 */
export function makeTranslator(project) {
  const lang = langOf(project);
  const misses = [];
  const seen = new Set();
  const miss = (zh, kind) => {
    const k = tmKey(zh);
    if (k && !seen.has(k)) {
      seen.add(k);
      misses.push({ zh: k, kind });
    }
  };
  const en = (zh, kind = 'text') => {
    if (lang === 'zh') return '';
    const r = resolveEn(project, zh, kind);
    if (r.source === 'missing') miss(zh, kind);
    return r.text;
  };
  return {
    lang,
    misses,
    en,
    show: (zh, kind = 'text') => {
      if (lang !== 'en') return String(zh ?? '');
      return en(zh, kind) || String(zh ?? '');
    },
    room: (slide) => {
      if (lang === 'zh') return '';
      const r = roomEnOf(project, slide);
      if (r.source === 'missing') miss(slide?.room, 'room');
      return r.text;
    },
  };
}

/** 英文已经写在中文里了（「隐形门 · Hidden door」配 'Hidden door'）→ 中英版不用再重复一遍 */
export function enAlreadyIn(zh, en) {
  const a = String(zh ?? '').toLowerCase().replace(/\s+/g, ' ');
  const b = String(en ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  return !b || a.includes(b);
}

/** 缺英文的提醒文字（这一页） */
export function missWarning(lang, misses) {
  if (lang === 'zh' || !misses?.length) return null;
  const sample = misses
    .slice(0, 3)
    .map((m) => `「${m.zh.length > 14 ? `${m.zh.slice(0, 14)}…` : m.zh}」`)
    .join('');
  const more = misses.length > 3 ? ` 等 ${misses.length} 处` : '';
  return lang === 'en'
    ? `英文版：${sample}${more}还没有英文，现在先显示中文 —— 点「AI 翻译」或在右侧填英文`
    : `中英版：${sample}${more}还没有英文，现在只显示中文 —— 点「AI 翻译」或在右侧填英文`;
}
