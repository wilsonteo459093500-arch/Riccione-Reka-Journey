// 导出文件里的名字：文件里永远中英两种都写（和界面语言无关），文件名永远是 ASCII。
// bi('客厅') → { zh: '客厅', en: 'Living' }：英文先查导出自己的词典 en-export.js，再查总表（key 规则和 t() 一样），查不到就用中文原样。

import EN from '../../shared/i18n/en.js';
import EXP from '../../shared/i18n/en-export.js';
import { TEMPLATES, emptyPlan } from '../plan/model.js';

/** 品牌那一行（图名下面、README 第一行）：RICCIONE REKA 是溪岸 sAil 的东南亚总代理（业主 2026-10-19） */
export const SAIL_LINE = 'SAIL BY RICCIONE REKA';

// 和 src/shared/i18n.js 的 t() 一样：句子前后的表情、箭头、点号不算在 key 里
const EDGE_CH = '[\\s\\p{So}\\p{Extended_Pictographic}\\uFE0F\\u200D→←↑↓·•…≈+]';
const SPLIT = new RegExp(`^(${EDGE_CH}*)([\\s\\S]*?)(${EDGE_CH}*)$`, 'u');
const HAN = /[一-鿿]/;

/** 词典里的英文（没有 → null） */
export function enOf(zh) {
  if (zh == null) return null;
  const s = String(zh);
  if (!HAN.test(s)) return s;
  const m = SPLIT.exec(s);
  const k = m[2].replace(/\s+/g, ' ');
  const tr = EXP[k] ?? EN[k];
  return tr == null ? null : m[1] + tr + m[3];
}

/** 中文 → { zh, en }（en 查不到 = zh） */
export function bi(zh) {
  const s = zh == null ? '' : String(zh);
  return { zh: s, en: enOf(s) ?? s };
}

function fill(s, vars) {
  return s.replace(/\{(\w+)\}/g, (all, k) => {
    const v = Array.isArray(vars) ? vars[+k] : vars?.[k];
    return v == null ? all : String(v);
  });
}

/** 带 {0} 的句子：两种语言都填好。vars 里可以是字符串，也可以是 { zh, en } */
export function biFill(zh, vars = []) {
  const b = bi(zh);
  const pick = (k) => (Array.isArray(vars) ? vars : Object.values(vars)).map((v) => (v && typeof v === 'object' ? v[k] : v));
  return { zh: fill(b.zh, pick('zh')), en: fill(b.en, pick('en')) };
}

/** 「中文 English」一行；两种一样时只写一次 */
export const both = (b, sep = ' ') => (b.en && b.en !== b.zh ? `${b.zh}${sep}${b.en}` : b.zh);

// 方案名里常见的填空句（store.js / StudioApp 生成的）：「Peggy 的梦想家」「…（分享）」
const NAME_PATTERNS = ['{0} 的梦想家', '{0}（分享）'];

/** 方案名 → { zh, en }：词典里有就直接用；是填空句就把英文那一半也填好 */
export function projectName(name) {
  const s = String(name || '').trim();
  const direct = enOf(s);
  if (direct != null) return { zh: s, en: direct };
  for (const p of NAME_PATTERNS) {
    const re = new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\{0\\}', '(.+?)')}$`);
    const m = re.exec(s);
    if (m) return { zh: s, en: biFill(p, [projectName(m[1]).en]).en };
  }
  return { zh: s, en: s };
}

/** 楼层代号：F1 = level 0（一楼 = Ground floor），F2 = level 1 … */
export const floorCode = (level) => `F${(level || 0) + 1}`;

/** 文件名里的一段：只留 ASCII 字母数字，用 - 连起来 */
export function slug(s, max = 40) {
  const t = String(s || '')
    .normalize('NFKD')
    .replace(/×/g, 'x')
    .replace(/[̀-ͯ]/g, '');
  const runs = t.match(/[A-Za-z0-9]+/g) || [];
  let out = runs.join('-');
  if (out.length > max) out = out.slice(0, max);
  return out.replace(/^-+|-+$/g, '');
}

const pad = (n, k = 2) => String(n).padStart(k, '0');

/** 日期（UTC，导出时间可注入，测试可重复）：YYYYMMDD */
export function ymd(now) {
  const d = new Date(now);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

// 默认的名字（模板名、「新方案」、分享来的模板）不是客人的：导出时不拿来当文件包的名字。
// 平面图编辑器读进别的户型时只改 plan.name，方案名（project.name）还是模板的 —— 所以两个都要看。
const SHARED = /\s*(（分享）|\(shared\))$/;
let DEFAULTS = null;
function defaults() {
  if (DEFAULTS) return DEFAULTS;
  const zh = [...TEMPLATES.flatMap((tp) => [tp.zh, tp.en, tp.plan?.name]), emptyPlan().name, '新方案', '分享的方案'].filter(Boolean);
  DEFAULTS = new Set(zh.flatMap((s) => [s, enOf(s)]).filter(Boolean).map((s) => String(s).trim().toLowerCase()));
  return DEFAULTS;
}
/** 是不是没取过名字（模板名 / 新方案 / 空的） */
export function isDefaultName(name) {
  const s = String(name || '').trim().replace(SHARED, '').trim();
  return !s || defaults().has(s.toLowerCase());
}

/**
 * 「文件包名称」一栏的预填：方案名（不是模板名、新方案）→ 平面图的名字（读进来的户型标签）→ 空的（让设计师填客人名或地址）
 * @returns {string}
 */
export function defaultPackName(project) {
  const pn = String(project?.name || '').trim();
  if (!isDefaultName(pn)) return pn;
  const pl = String(project?.plan?.name || '').trim();
  if (!isDefaultName(pl)) return pl;
  return '';
}

/** 导出用的名字：传了 name（文件包名称那一栏，可以是空的）就用它，没传就是 defaultPackName() */
export const packName = (project, name) => (name === undefined || name === null ? defaultPackName(project) : String(name).trim());

/** 文件包的基本名：WISH_<slug>_<YYYYMMDD>；名字里没有英文字母数字（或没有名字）→ project-<id 后 6 位> */
export function exportBase(project, now = new Date(), name) {
  let s = slug(projectName(name === undefined ? project?.name : name).en);
  if (!s) s = `project-${String(project?.id || 'x').replace(/[^A-Za-z0-9]/g, '').slice(-6) || 'x'}`;
  return `WISH_${s}_${ymd(now)}`;
}

/** XML / COLLADA 的 id（NCName）：ASCII 字母数字 _ - .，字母开头 */
export function ncName(s) {
  const t = String(s || '').replace(/[^A-Za-z0-9_.-]/g, '_');
  return /^[A-Za-z_]/.test(t) ? t : `n${t}`;
}
