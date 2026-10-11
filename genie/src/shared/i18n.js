// 中英双语。中文原文就是 key（像 gettext）：t('开始许愿') 在中文模式原样返回，英文模式查 i18n/en.js。
//
// 换语言 = 存到本机 + 重新载入页面：许愿进度在 sessionStorage、3D 方案在 localStorage，载入后接着来。
// 这样资料文件（flow.js、dreamers.js…）里的中文也能在载入时一次翻好，不用到处改。
// 许愿模式外壳不重新载入（音乐不能断），只重载里面的 iframe（见 WishShell）。

import { createElement, Fragment, useEffect, useState } from 'react';
import EN from './i18n/en.js';
import { GUIDE } from './config.js';

const KEY = 'genie.lang';
export const LANGS = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'EN' },
];

// 句子前后的表情、箭头、点号不算在 key 里：翻译时原样留着
const EDGE_CH = '[\\s\\p{So}\\p{Extended_Pictographic}\\uFE0F\\u200D→←↑↓·•…≈+]';
const SPLIT = new RegExp(`^(${EDGE_CH}*)([\\s\\S]*?)(${EDGE_CH}*)$`, 'u');
const HAN = /[一-鿿]/;

function detect() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'zh' || q === 'en') {
      try {
        localStorage.setItem(KEY, q);
      } catch {}
      return q;
    }
    const s = localStorage.getItem(KEY);
    if (s === 'zh' || s === 'en') return s;
  } catch {}
  return 'zh';
}

let lang = detect();
const subs = new Set();
if (typeof document !== 'undefined') document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hans';

export const getLang = () => lang;
export const isEn = () => lang === 'en';

function fill(s, vars) {
  return s.replace(/\{(\w+)\}/g, (all, k) => {
    const v = Array.isArray(vars) ? vars[+k] : vars[k];
    return v == null ? all : String(v);
  });
}

/** 中文 → 当前语言。vars：数组（{0} {1}…）或对象（{name}）。 */
export function t(zh, vars) {
  if (zh == null) return '';
  let s = String(zh);
  if (lang === 'en' && HAN.test(s)) {
    const m = SPLIT.exec(s);
    const tr = EN[m[2].replace(/\s+/g, ' ')];
    if (tr != null) s = m[1] + tr + m[3];
    else if (import.meta.env?.DEV) console.warn('[i18n] 还没翻译：', m[2]);
  }
  return vars == null ? s : fill(s, vars);
}

/** 句子里要夹 JSX（粗体数字、链接…）时用：tj('约 {0} 双', [<b>12</b>]) */
export function tj(zh, nodes = []) {
  const s = t(zh);
  const out = [];
  let last = 0;
  s.replace(/\{(\d+)\}/g, (all, k, i) => {
    if (i > last) out.push(s.slice(last, i));
    out.push(nodes[+k]);
    last = i + all.length;
    return all;
  });
  if (last < s.length) out.push(s.slice(last));
  return createElement(Fragment, null, ...out);
}

/** 资料里成对的 { zh, en }：英文模式先用词典里的写法，没有再用 o.en */
export function L(o) {
  if (o == null) return '';
  if (typeof o === 'string') return t(o);
  if (lang !== 'en') return o.zh ?? o.en ?? '';
  if (o.zh != null) {
    const m = SPLIT.exec(String(o.zh));
    const tr = EN[m[2].replace(/\s+/g, ' ')];
    if (tr != null) return m[1] + tr + m[3];
  }
  return o.en ?? o.zh ?? '';
}

/** 熊猫精灵的名字：潘吉 / Pangie */
export const guideName = () => (lang === 'en' ? GUIDE.nameEn : GUIDE.name);

/** 换语言：存起来，网址带上 ?lang=，重新载入（#hash 里的蓝图 / 方案原样保留） */
export function setLang(l, { reload = true } = {}) {
  if (l !== 'zh' && l !== 'en') return;
  try {
    localStorage.setItem(KEY, l);
  } catch {}
  if (!reload) {
    lang = l;
    if (typeof document !== 'undefined') document.documentElement.lang = l === 'en' ? 'en' : 'zh-Hans';
    subs.forEach((fn) => fn(l));
    return;
  }
  const u = new URL(location.href);
  u.searchParams.set('lang', l);
  location.replace(u.href);
}

/** 不重新载入的页面（许愿模式外壳）用：语言变了就重画 */
export function useLang() {
  const [l, set] = useState(lang);
  useEffect(() => {
    subs.add(set);
    return () => subs.delete(set);
  }, []);
  return l;
}

/** 给分享出去的链接带上语言（英文客人打开就是英文） */
export function withLang(url) {
  try {
    const u = new URL(url, location.href);
    if (lang === 'en') u.searchParams.set('lang', 'en');
    else u.searchParams.delete('lang');
    return u.href;
  } catch {
    return url;
  }
}

/** 测试用：列出某段文字里还没翻译的中文 */
export function missing(zh) {
  const m = SPLIT.exec(String(zh));
  const k = m[2].replace(/\s+/g, ' ');
  return HAN.test(k) && EN[k] == null ? k : null;
}
