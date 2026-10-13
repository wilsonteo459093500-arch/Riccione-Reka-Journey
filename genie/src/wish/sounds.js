// 许愿模式的声音层（开场文案、音乐面板都从这里取）：只列出真的开着的层。
// 音乐：现场合成的禅意曲子（古筝领奏）；公司自己有授权的歌单（CONFIG.music.playlist / 旧的 CONFIG.wishMusic）就写「音乐」。
// 自然声（溪水、微风、鸟鸣）垫在曲子底下（CONFIG.music.nature，默认开）；颂钵、风铃是可选层（CONFIG.wishLayers，默认关），
// 关着就不要写出来。

import { CONFIG } from '../shared/config.js';
import { t, isEn } from '../shared/i18n.js';

// zh：中文名（也是标签）· en：英文标签 · inEn：放进英文句子里的写法
const ZHENG = { id: 'zheng', zh: '古筝', en: 'Guzheng', inEn: 'the guzheng' };
const SONGS = { id: 'songs', zh: '音乐', en: 'Music', inEn: 'gentle music' };
const NATURE = [
  { id: 'stream', zh: '溪水', en: 'Stream', inEn: 'the stream' },
  { id: 'breeze', zh: '微风', en: 'Breeze', inEn: 'the breeze' },
  { id: 'birds', zh: '鸟鸣', en: 'Birdsong', inEn: 'birdsong' },
];
const OPTIONAL = [
  { id: 'bowl', zh: '颂钵', en: 'Singing bowl', inEn: 'a singing bowl', opt: 'bowl' },
  { id: 'chimes', zh: '风铃', en: 'Wind chimes', inEn: 'wind chimes', opt: 'chimes' },
];

const ownSongs = () => {
  const list = CONFIG.music?.playlist;
  return (Array.isArray(list) && list.length > 0) || !!CONFIG.wishMusic;
};

export function soundLayers() {
  const on = CONFIG.wishLayers || {};
  const own = ownSongs();
  return [
    own ? SONGS : ZHENG,
    ...(CONFIG.music?.nature !== false ? NATURE : []),
    ...(own ? [] : OPTIONAL.filter((x) => on[x.opt])), // 公司的歌单代替了写好的曲子：颂钵、风铃跟着曲子一起不在
  ];
}

/** 音乐面板里的小字：古筝 · 溪水 · 微风 · 鸟鸣 */
export function layersLabel() {
  const en = isEn();
  return soundLayers()
    .map((x) => (en ? x.en : t(x.zh)))
    .join(' · ');
}

/** 开场那一句：先说「调大一点声音」，不叫客人戴耳机（夫妻、销售要听得到彼此） */
export function soundSentence() {
  const en = isEn();
  const names = soundLayers().map((x) => (en ? x.inEn : x.zh));
  const last = names.pop();
  const list = names.length ? t('{0}和{1}', [names.join(en ? ', ' : '、'), last]) : last;
  return t('调大一点声音 —— {0}会一路陪着你。', [list]);
}
