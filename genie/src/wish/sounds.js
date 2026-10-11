// 许愿模式的声音层（开场文案、音乐胶囊都从这里取）：只列出真的开着的层。
// 溪水、微风、鸟鸣一直在；颂钵、风铃是可选层（CONFIG.wishLayers，默认关），关着就不要写出来。

import { CONFIG } from '../shared/config.js';
import { t, isEn } from '../shared/i18n.js';

// zh：中文名（也是标签）· en：英文标签 · inEn：放进英文句子里的写法
const LAYERS = [
  { id: 'stream', zh: '溪水', en: 'Stream', inEn: 'the stream' },
  { id: 'breeze', zh: '微风', en: 'Breeze', inEn: 'the breeze' },
  { id: 'birds', zh: '鸟鸣', en: 'Birdsong', inEn: 'birdsong' },
  { id: 'bowl', zh: '颂钵', en: 'Singing bowl', inEn: 'a singing bowl', opt: 'bowl' },
  { id: 'chimes', zh: '风铃', en: 'Wind chimes', inEn: 'wind chimes', opt: 'chimes' },
];

export function soundLayers() {
  const on = CONFIG.wishLayers || {};
  return LAYERS.filter((x) => !x.opt || on[x.opt]);
}

/** 音乐胶囊里的小字：溪水 · 微风 · 鸟鸣 */
export function layersLabel() {
  const en = isEn();
  return soundLayers()
    .map((x) => (en ? x.en : x.zh))
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
