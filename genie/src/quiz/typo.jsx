// 断行：标题、说明、小字、选项、潘吉的话泡泡 —— 不在词的中间换行（「衣 / 柜」「心 / 脏」「Deal- / Breaker」）。
// 做法都一样：把不能拆开的一段包成 inline-block（.ph）或 nowrap（.nobr），浏览器只会在段与段之间换行。
// 不用 (?<=…) 反向断言：旧一点的 iPad Safari（16.4 以前）不认识，整个页面会载不起来。

import { Fragment } from 'react';
import { isEn, guideName } from '../shared/i18n.js';

/** 英文里带连字号的词（Deal-Breaker、know-how）不从连字号断开 */
export function keepHyphens(str, key = 'h') {
  const parts = String(str ?? '').split(/(\S+-\S+)/);
  if (parts.length === 1) return parts[0];
  return parts.map((p, i) =>
    i % 2 ? (
      <span key={`${key}${i}`} className="nobr">
        {p}
      </span>
    ) : (
      p
    )
  );
}

/**
 * 按「词组」断行：中文在逗号 / 顿号 / 冒号 / 句号 / 叹号 / 问号后面才换行（不会断成「衣 / 柜」「你最 / 想」）；
 * 英文按句子（「The doorbell rings! / The first thing…」），带连字号的词（Deal-Breaker）不从连字号断开。
 * sentences = false：英文不按句子分（正文用：句子各占一块会多出行数），只保留连字号。
 */
export function phrased(s, { sentences = true } = {}) {
  const str = String(s ?? '');
  if (isEn()) {
    const parts = (sentences && str.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g)) || [];
    // 拆不干净（小数点、缩写…）就不拆：一个字都不能丢
    if (parts.length < 2 || parts.join('') !== str) return keepHyphens(str);
    return parts.map((p, i) => (
      <Fragment key={i}>
        {i > 0 && ' '}
        <span className="ph">{keepHyphens(p.trim(), `${i}-`)}</span>
      </Fragment>
    ));
  }
  const parts = str.match(/[^，、：；。！？]+[，、：；。！？」』）]*/g) || [];
  if (parts.length < 2 || parts.join('') !== str) return str;
  return parts.map((p, i) => (
    <span key={i} className="ph">
      {p}
    </span>
  ));
}

/**
 * 「甲 · 乙 · 丙」「需要神台 / 佛台 / 祖先牌位」这样的一串：只在分隔号后面换行（「梦想家蓝图」「祖先牌位」不会被拆开，
 * 下一行也不会以分隔号开头）。zhOnly：英文照常断（英文单词本来就不会从中间断）。
 */
export function segmented(s, sep = '·', { zhOnly = true } = {}) {
  const str = String(s ?? '');
  if (zhOnly && isEn()) return str;
  const parts = str.split(new RegExp(`\\s*\\${sep}\\s*`));
  if (parts.length < 2) return str;
  const last = parts.length - 1;
  return parts.map((p, i) => (
    <Fragment key={i}>
      <span className="ph">
        {p}
        {i < last ? ` ${sep}` : ''}
      </span>
      {i < last ? ' ' : ''}
    </Fragment>
  ));
}

const zhWords = (() => {
  try {
    return typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;
  } catch {
    return null;
  }
})();

/**
 * 一句短短的中文（潘吉的话泡泡）：词不拆开（「心脏」「星期六」「大概」），标点跟着前面的字。
 * 用浏览器自带的分词（Intl.Segmenter）；没有的话（很旧的浏览器）就按词组分。英文原样。
 */
export function keepWords(s) {
  const str = String(s ?? '');
  if (isEn() || !str) return str;
  if (!zhWords) return phrased(str);
  const out = [];
  // 词典里没有的名字（潘吉）先整个拿出来，其余交给分词
  const name = guideName();
  for (const chunk of str.split(name)
    .flatMap((c, i) => (i ? [name, c] : [c]))
    .filter(Boolean)) {
    const segs = chunk === name ? [{ segment: name, isWordLike: true }] : zhWords.segment(chunk);
    for (const { segment, isWordLike } of segs) {
      // 标点 / 空格接在前一个词后面（不会有一行以「，」开头）
      if (!isWordLike && out.length) out[out.length - 1] += segment;
      else out.push(segment);
    }
  }
  if (out.join('') !== str) return str;
  return out.map((w, i) =>
    w.length > 1 ? (
      <span key={i} className="nobr">
        {w}
      </span>
    ) : (
      w
    )
  );
}
