// zs-scores.js —— 六首写好的曲子（+ 归家·夜）和两个小「点缀」。旋律是作曲写死的（听得出是一首歌）；
// 生成层只改装饰音、八度、配器、和声配置、段落顺序（见 zs-run.js）。
// 调：D 宫五声音阶（D E F# A B）为家；B 段慢慢偏向 G（加 G，少 F#）再回家；暮色用 B 羽，竹影用 E 商。
// 记谱：见 zs-dsp.js parseNotes。每个声部的拍数必须等于段落长度（小节数 × 拍号），render 会检查。
//   lane.inst：zheng 古筝 · pan 手碟 · kal 卡林巴 · harm 古筝泛音 · flute 箫 · deep 低音手碟（开了颂钵层 = 颂钵）
//   lane.kind：pad 铺底和弦 · drone 持续低音 · gliss 刮奏
//   role：lead 主旋律 · answer 应答（第二遍起可能换八度、换乐器、留白）· spark 点缀（开了风铃层 = 风铃）
//   steady：不加任何装饰、不留白、力度不变（直觉题：三秒的选择中间不要有惊喜）

const chenguang = {
  id: 'chenguang',
  // 晨光
  en: 'Morning Light',
  inst: { en: 'Guzheng · handpan · kalimba · warm pad' /* 古筝 · 手碟 · 卡林巴 · 暖铺底 */ },
  feel: { en: 'First light on the stream, through tea-garden mist' /* 茶园的晨雾里，第一缕光落在溪面 */ },
  bpm: 66,
  meter: 4,
  pre: 2,
  gliss: 0.3,
  padTone: 1300,
  mix: { zheng: 1, pan: 0.9, kal: 0.85 },
  form: ['A', 'B', 'A', 'B'],
  alt: ['A', 'A', 'B', 'A'],
  sections: {
    A: {
      lead: { inst: 'zheng', role: 'lead', notes: 'a4 b4:.5 d5:.5 e5:2~ | d5 b4 a4:2 | r:4 | r:4 | a4 b4:.5 d5:.5 f#5:1.5 e5:.5 | d5 e5:.5 d5:.5 b4:2v | a4:1.5 b4:.5 a4 f#4 | e4 d4:3*' },
      answer: { inst: 'pan', role: 'answer', swap: 'kal', notes: 'r:8 | f#4 a4 e4:2 | d4:2 r:2 | r:12 | r a3_ d4_:2' },
      pad: { kind: 'pad', chords: '[d3 a3 e4 f#4]:8 [b2 f#3 a3 d4]:8 [e3 a3 b3 d4]:4 [a2 e3 a3 b3]:4 [d3 a3 e4 f#4]:8' },
      drone: { kind: 'drone', notes: 'd2:32' },
      spark: { inst: 'kal', role: 'spark', notes: 'r:14 a5_:2 r:14 d6_:2' },
    },
    B: {
      lead: { inst: 'zheng', role: 'lead', notes: 'b4 d5 e5:1.5 d5:.5 | b4 a4 g4:2v | a4 b4:.5 a4:.5 e4 g4 | a4:4* | b4 d5 e5 g5 | f#5:1.5 e5:.5 d5:2 | b4 a4 f#4 e4 | d4:2 r:2' },
      answer: { inst: 'pan', role: 'answer', swap: 'kal', notes: 'r:4 | r:2 d4_ e4_ | r:4 | r:2 e4 d4 | r:4 | r:4 | b3_ d4_:3 | r:4' },
      pad: { kind: 'pad', chords: '[g2 d3 a3 b3 e4]:8 [e2 b2 g3 d4 f#4]:8 [a2 e3 a3 d4]:4 [a2 e3 b3 e4]:4 [d3 a3 e4 f#4]:8' },
      drone: { kind: 'drone', notes: 'd2:32' },
      spark: { inst: 'kal', role: 'spark', notes: 'r:30 f#6_:2' },
    },
  },
};

const xian = {
  id: 'xian',
  // 溪岸
  en: 'Stream Bank',
  inst: { en: 'Handpan pulse · zheng harmonics · pad' /* 手碟脉动 · 古筝泛音 · 铺底 */ },
  feel: { en: 'Sit on a stone by the stream; nothing to think about' /* 坐在溪边的石头上，什么都不用想 */ },
  bpm: 60,
  meter: 4,
  pre: 0,
  steady: true,
  padTone: 1000,
  mix: { pan: 0.85, harm: 0.9, pad: 0.9 },
  form: ['A', 'A', 'B', 'A'],
  sections: {
    A: {
      pulse: { inst: 'pan', notes: 'd3_:2 a3_:2 b3_:2 a3_:2 d3_:2 a3_:2 e4_:2 a3_:2 d3_:2 a3_:2 b3_:2 a3_:2 d3_:2 a3_:2 f#4_:2 e4_:2' },
      air: { inst: 'harm', notes: 'r:4 f#5_:4 r:4 e5_:4 r:4 a5_:4 r:4 d5_:4' },
      pad: { kind: 'pad', v: 0.55, chords: '[d3 a3 e4]:16 [b2 a3 e4]:16' },
      drone: { kind: 'drone', notes: 'd2:32' },
    },
    B: {
      pulse: { inst: 'pan', notes: 'b2_:2 f#3_:2 a3_:2 f#3_:2 b2_:2 f#3_:2 d4_:2 f#3_:2 a2_:2 e3_:2 a3_:2 e3_:2 d3_:2 a3_:2 e4_:2 a3_:2' },
      air: { inst: 'harm', notes: 'r:4 d5_:4 r:4 b4_:4 r:4 e5_:4 r:8' },
      pad: { kind: 'pad', v: 0.55, chords: '[b2 f#3 d4]:16 [a2 e3 b3]:8 [d3 a3 e4]:8' },
      drone: { kind: 'drone', notes: 'b1:16 d2:16' },
    },
  },
};

const zhuying = {
  id: 'zhuying',
  gain: 0.9, // 响度校准（离线实测 → 目标见 SPEC §8）
  // 竹影
  en: 'Bamboo Shadow',
  inst: { en: 'Xiao flute · zheng arpeggios · pad' /* 箫 · 古筝分解和弦 · 铺底 */ },
  feel: { en: 'Bamboo shadows drift across paper; slow down and count' /* 竹影在纸上慢慢移动，心静下来数一数 */ },
  bpm: 69,
  meter: 4,
  pre: 2,
  padTone: 1100,
  mix: { zheng: 0.9, flute: 1 },
  form: ['A', 'B', 'A', 'B'],
  sections: {
    A: {
      arp: { inst: 'zheng', role: 'bed', notes: 'e3_:1.5 b3_:.5 e4_ f#4_ | e3_:1.5 b3_:.5 f#4_ e4_ | d3_:1.5 a3_:.5 d4_ e4_ | d3_:1.5 a3_:.5 e4_ d4_ | b2_:1.5 f#3_:.5 b3_ d4_ | b2_:1.5 f#3_:.5 d4_ b3_ | a2_:1.5 e3_:.5 a3_ b3_ | a2_:1.5 e3_:.5 b3_ d4_' },
      flute: { inst: 'flute', role: 'lead', notes: 'r:4 | b4:2 a4 f#4 | e4:3v r | f#4 a4 b4:1.5 d5:.5 | e5:4v | d5:1.5 b4:.5 a4 b4 | a4 f#4 e4:2v | r:4' },
      pad: { kind: 'pad', v: 0.6, chords: '[e3 b3 d4 f#4]:8 [d3 a3 e4 f#4]:8 [b2 f#3 a3 d4]:8 [a2 e3 b3 d4]:8' },
      drone: { kind: 'drone', notes: 'e2:32' },
    },
    B: {
      lead: { inst: 'zheng', role: 'lead', notes: 'a4 b4 d5:2 | e5:1.5 d5:.5 b4:2 | a4 b4:.5 a4:.5 f#4 e4 | f#4:4* | d5 e5 f#5:1.5 e5:.5 | d5 b4 a4:2 | b4 a4:.5 f#4:.5 e4:1.5 d4:.5 | e4:4' },
      flute: { inst: 'flute', role: 'answer', notes: 'r:12 b4:4v r:12 a4:2 b4:2v' },
      arp: { inst: 'zheng', role: 'bed', notes: 'a2_:2 e3_:2 a2_:2 e3_:2 e3_:2 b3_:2 e3_:2 b3_:2 d3_:2 a3_:2 d3_:2 a3_:2 a2_:2 e3_:2 e3_:2 b3_:2' },
      pad: { kind: 'pad', v: 0.6, chords: '[a2 e3 a3 d4]:8 [e3 b3 d4 f#4]:8 [d3 a3 e4 f#4]:8 [a2 e3 b3 e4]:4 [e3 b3 e4 f#4]:4' },
      drone: { kind: 'drone', notes: 'a1:16 e2:16' },
    },
  },
};

const mose = {
  id: 'mose',
  gain: 0.8, // 响度校准（离线实测 → 目标见 SPEC §8）
  // 暮色
  en: 'Dusk',
  inst: { en: 'Xiao · deep handpan · zheng · crickets' /* 箫 · 低音手碟 · 古筝 · 蟋蟀树蛙 */ },
  feel: { en: 'A river mouth at dusk; fireflies light up one by one' /* 瓜拉雪兰莪的河口，萤火虫一盏一盏亮起来 */ },
  bpm: 56,
  meter: 4,
  pre: 2,
  padTone: 900,
  mix: { flute: 1.05, pan: 0.95, zheng: 0.85, deep: 0.5 }, // 低音手碟只是「脚步」，不盖过箫
  form: ['A', 'B', 'A', 'B'],
  sections: {
    A: {
      flute: { inst: 'flute', role: 'lead', notes: 'f#4:2 e4 d4 | b3:4v | d4 e4 f#4 a4 | b4:3v a4 | f#4:2 e4:2 | d4:1.5 e4:.5 b3:2v | r:4 | r:4' },
      deep: { inst: 'deep', notes: 'b2:4 r:4 f#2_:4 r:4 b2:4 r:4 e2_:4 r:4' },
      zheng: { inst: 'zheng', role: 'answer', notes: 'r:24 b3:2~ a3 f#3 b3:4*' },
      pad: { kind: 'pad', v: 0.7, chords: '[b2 f#3 a3 d4]:8 [e3 b3 d4 f#4]:8 [b2 f#3 a3 e4]:8 [a2 e3 b3 d4]:8' },
      drone: { kind: 'drone', notes: 'b1:32' },
    },
    B: {
      flute: { inst: 'flute', role: 'lead', notes: 'a4:2 b4 d5 | e5:3v d5 | b4:2 a4 f#4 | e4:4v | d4 e4 f#4:2 | a4:2 f#4 e4 | b3:4v | r:4' },
      deep: { inst: 'deep', notes: 'e2:4 r:4 b2_:4 r:4 d3_:4 r:4 b2:4 r:4' },
      zheng: { inst: 'zheng', role: 'answer', notes: 'r:28 f#4_ e4_ b3_:2' },
      pad: { kind: 'pad', v: 0.7, chords: '[e3 b3 d4 f#4]:8 [d3 a3 e4 f#4]:8 [b2 f#3 d4 e4]:8 [b2 f#3 a3 d4]:8' },
      drone: { kind: 'drone', notes: 'e2:16 b1:16' },
    },
  },
};

const xingdeng = {
  id: 'xingdeng',
  // 星灯
  en: 'Star Lantern',
  inst: { en: 'Glissando · zheng · handpan · kalimba' /* 刮奏 · 古筝 · 手碟 · 卡林巴 */ },
  feel: { en: 'The card turns, a lantern glows, everything settles' /* 牌翻开的那一刻，一盏灯亮了，一切落定 */ },
  bpm: 72,
  meter: 4,
  pre: 0,
  gliss: 0.25,
  padTone: 1500,
  mix: { zheng: 1, pan: 0.95, kal: 0.9 },
  form: ['A', 'B', 'A', 'B'],
  sections: {
    // 揭晓：铺底从 A 挂留慢慢涨起来 → 一把刮奏 → 落在 D（加六加九）上，手碟和卡林巴一起亮
    I: {
      pad: { kind: 'pad', v: 0.95, attacks: [3, 0.7], chords: '[a2 e3 a3 b3 e4]:4 [d3 a3 e4 f#4 a4]:4' },
      gliss: { kind: 'gliss', at: 2.4, v: 0.62, spacing: 0.05, notes: 'd4 e4 f#4 a4 b4 d5 e5 f#5 a5' },
      land: { inst: 'pan', notes: 'r:4 d3:4' }, // 落定的低音：不加重音（和刮奏、铺底叠在一起已经够亮）
      land2: { inst: 'pan', notes: 'r:4 a3:4' },
      land3: { inst: 'zheng', notes: 'r:4 d5:4v' },
      spark: { inst: 'kal', role: 'spark', notes: 'r:4 d6:.25 f#6:.25 a6:3.5' },
      drone: { kind: 'drone', notes: 'd2:8' },
    },
    A: {
      lead: { inst: 'zheng', role: 'lead', notes: 'd5:.5 e5:.5 f#5 a5 f#5 | e5 d5 b4:2 | a4:.5 b4:.5 d5 e5 f#5 | e5:4v | f#5:.5 a5:.5 b5 a5 f#5 | e5 f#5 d5:2 | b4 d5 e5 a4 | d5:4*' },
      answer: { inst: 'pan', role: 'answer', swap: 'kal', notes: 'r:4 d4 a3 b3:2 r:4 r:2 a3 d4 r:4 f#4 e4 d4:2 r:4 r:2 a3_ d4_' },
      pad: { kind: 'pad', chords: '[d3 a3 e4 f#4]:8 [b2 f#3 a3 d4]:8 [e3 a3 b3 d4]:8 [a2 e3 a3 b3]:4 [d3 a3 e4 f#4]:4' },
      spark: { inst: 'kal', role: 'spark', notes: 'r:6 a5_:2 r:6 d6_:2 r:6 f#6_:2 r:6 a5_:2' },
      drone: { kind: 'drone', notes: 'd2:32' },
    },
    B: {
      lead: { inst: 'zheng', role: 'lead', notes: 'b4 d5 e5 g5 | f#5:2 e5 d5 | e5 d5:.5 b4:.5 a4 b4 | a4:4* | d5:.5 e5:.5 f#5 a5 b5 | a5 f#5 e5:2 | d5 e5 f#5 e5:.5 d5:.5 | d5:4' },
      answer: { inst: 'pan', role: 'answer', swap: 'kal', notes: 'r:4 r:2 g3 b3 r:4 r:2 e4 d4 r:4 r:2 f#4 a4 r:4 b3_ a3_ d4_:2' },
      pad: { kind: 'pad', chords: '[g2 d3 a3 b3 e4]:8 [e3 b3 d4 f#4]:8 [a2 e3 a3 d4]:4 [a2 e3 b3 e4]:4 [d3 a3 e4 f#4 a4]:8' },
      spark: { inst: 'kal', role: 'spark', notes: 'r:14 b5_:2 r:14 d6_:2' },
      drone: { kind: 'drone', notes: 'd2:32' },
    },
  },
};

const guijia = {
  id: 'guijia',
  gain: 0.85, // 响度校准（离线实测 → 目标见 SPEC §8）
  // 归家
  en: 'Homecoming',
  inst: { en: 'Handpan lullaby · zheng · in 3/4' /* 手碟摇篮曲 · 古筝伴奏 · 三拍子 */ },
  feel: { en: 'Open the door; the lights are warm, like a lullaby' /* 推开家门，灯是暖的，像一首摇篮曲 */ },
  bpm: 63,
  meter: 3,
  pre: 3,
  padTone: 1150,
  mix: { pan: 1, zheng: 0.8, kal: 0.8 },
  form: ['A', 'B', 'A', 'B'],
  sections: {
    A: {
      lead: { inst: 'pan', role: 'lead', swap: 'zheng', notes: 'a4:2 b4 | d5:2 e5 | f#5:2 e5 | d5:3 | b4:2 d5 | a4:2 f#4 | e4:2 f#4 | d4:3' },
      accomp: { inst: 'zheng', role: 'bed', notes: 'd3_ a3_ f#4_ | d3_ a3_ e4_ | b2_ f#3_ d4_ | b2_ f#3_ a3_ | e3_ b3_ d4_ | d3_ a3_ f#4_ | a2_ e3_ b3_ | d3_ a3_ d4_' },
      pad: { kind: 'pad', v: 0.65, chords: '[d3 a3 f#4]:6 [b2 f#3 d4]:6 [e3 b3 d4]:3 [d3 a3 f#4]:3 [a2 e3 b3]:3 [d3 a3 d4]:3' },
      spark: { inst: 'kal', role: 'spark', notes: 'r:9 f#5_:3 r:9 a5_:3' },
      drone: { kind: 'drone', notes: 'd2:24' },
    },
    B: {
      lead: { inst: 'pan', role: 'lead', swap: 'zheng', notes: 'f#4 a4 b4 | d5:3 | e5 d5 b4 | a4:3 | b4:2 a4 | f#4 e4:2 | d4 e4 f#4 | a4:3' },
      accomp: { inst: 'zheng', role: 'bed', notes: 'b2_ f#3_ d4_ | b2_ f#3_ a3_ | g2_ d3_ b3_ | d3_ a3_ f#4_ | e3_ b3_ d4_ | a2_ e3_ b3_ | b2_ f#3_ d4_ | a2_ e3_ a3_' },
      pad: { kind: 'pad', v: 0.65, chords: '[b2 f#3 d4]:6 [g2 d3 b3]:3 [d3 a3 f#4]:3 [e3 b3 d4]:3 [a2 e3 b3]:3 [b2 f#3 a3 d4]:3 [a2 e3 a3]:3' }, // Bm7 → A：A3 留着不动（共同音）
      spark: { inst: 'kal', role: 'spark', notes: 'r:21 d6_:3' },
      drone: { kind: 'drone', notes: 'b1:12 d2:12' },
    },
  },
};

/** 归家·夜：同一首歌，慢一点、暗一点；B 段换箫来唱，伴奏只留每小节的头两个音，蟋蟀和树蛙在外面 */
function nightOf(def) {
  const thin = (s) => s.replace(/([a-g]#?\d_?) ([a-g]#?\d_?) ([a-g]#?\d_?)( \||$)/g, '$1 $2:2$4');
  const sec = (k, leadInst) => {
    const S = def.sections[k];
    return { ...S, lead: { ...S.lead, inst: leadInst, swap: undefined }, accomp: { ...S.accomp, notes: thin(S.accomp.notes) } };
  };
  return {
    ...def,
    id: 'guijiaNight',
    // 归家 · 夜
    en: 'Homecoming · Night',
    feel: { en: 'Late night, crickets outside, one small lamp left on' /* 夜深了，窗外有蟋蟀，家里留一盏小灯 */ },
    inst: { en: 'Handpan · xiao · crickets & tree frogs' /* 手碟 · 箫 · 蟋蟀与树蛙 */ },
    bpm: 56,
    gain: 0.78,
    padTone: 760,
    mix: { pan: 0.85, zheng: 0.7, kal: 0.6, flute: 0.9 },
    sections: { A: sec('A', 'pan'), B: sec('B', 'flute') },
  };
}

export const PIECES = { chenguang, xian, zhuying, mose, xingdeng, guijia, guijiaNight: /* @__PURE__ */ nightOf(guijia) }; // PURE：只用 tellShell 的页面（许愿之旅、3D）打包时整个音乐引擎可以摇掉

// 点缀：很短的「一次性曲子」，叠在当前的曲子上（翻章节牌 = 暮色里的一声；许愿 = 三个亮音）
export const CUES = {
  chapter: {
    id: 'cue-chapter',
    bpm: 60,
    meter: 4,
    once: true,
    mix: { pan: 0.9, harm: 0.9, deep: 0.55 },
    form: ['C'],
    sections: {
      C: {
        deep: { inst: 'deep', notes: 'b2:4' },
        harm: { inst: 'harm', notes: 'r f#5_:1.5 e5_:1.5' },
        pad: { kind: 'pad', v: 0.6, attacks: [1.2], chords: '[b2 f#3 d4]:3' },
      },
    },
  },
  wish: {
    id: 'cue-wish',
    bpm: 90,
    meter: 2,
    once: true,
    form: ['W'],
    sections: { W: { spark: { inst: 'kal', role: 'spark', notes: 'd6_:.33 f#6_:.33 a6_:1.34' } } },
  },
};

// 情绪 → 曲子 + 自然声（WishShell 发的名字；bright = 旧名字，等于 reveal）
export const MOODS = {
  calm: { piece: 'chenguang', nature: 'day', en: 'Welcome · Life · Deal-breakers' /* 欢迎 · 生活 · 雷区 */ },
  intuition: { piece: 'xian', nature: 'still', en: 'Intuition' /* 直觉之牌 */ },
  focus: { piece: 'zhuying', nature: 'quiet', en: 'Treasure · Three wishes' /* 宝藏 · 三个愿望 */ },
  dusk: { piece: 'mose', nature: 'dusk', en: 'Lamp · card flips · before the reveal' /* 神灯 · 翻牌 · 揭晓前 */ },
  reveal: { piece: 'xingdeng', nature: 'day', intro: true, gap: 0.05, fadeIn: 0.4, fadeOut: 2.5, en: 'The reveal' /* 揭晓 */ },
  blueprint: { piece: 'guijia', nature: 'day', en: 'Blueprint (50 % level)' /* 梦想家蓝图（音量 50%） */ },
  studio: { piece: 'guijia', nature: 'quiet', en: '3D studio · day' /* 3D 工作室 · 白天 */ },
  night: { piece: 'guijiaNight', nature: 'night', en: '3D studio · night' /* 3D 工作室 · 夜里 */ },
};
export const ALIAS = { bright: 'reveal', welcome: 'calm', ritual: 'dusk', lamp: 'dusk', home: 'blueprint' };

// 整段旅程（2 分钟）：演示页和 journey.mp3 用同一份脚本
export const JOURNEY = [
  { t: 0, mood: 'calm', en: 'Welcome' /* 欢迎 */ },
  { t: 14, mood: 'dusk', en: 'The lamp' /* 擦亮神灯 */ },
  { t: 27, cue: 'chapter' },
  { t: 27.4, mood: 'intuition', en: 'Intuition' /* 直觉 */ },
  { t: 42, cue: 'chapter' },
  { t: 42.4, mood: 'calm', en: 'Life' /* 生活 */ },
  { t: 54, cue: 'chapter' },
  { t: 54.4, mood: 'focus', en: 'Treasure · Wishes' /* 宝藏 · 愿望 */ },
  { t: 69, cue: 'wish' },
  { t: 72.5, cue: 'wish' },
  { t: 77, cue: 'chapter' },
  { t: 77.4, mood: 'calm', en: 'Deal-breakers' /* 雷区 */ },
  { t: 86, mood: 'dusk', en: 'Reading you' /* 读懂你 */ },
  { t: 93, cue: 'reveal', en: 'Reveal' /* 揭晓 */ },
  { t: 106, mood: 'blueprint', duck: 0.5, en: 'Blueprint' /* 蓝图 */ },
  { t: 114, mood: 'studio', duck: 0.25, en: '3D' /* 3D */ },
];
export const JOURNEY_SECONDS = 120;
