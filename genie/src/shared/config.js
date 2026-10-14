// WISH by RICCIONE REKA · 全局配置 —— 改这一份就能换软件名、精灵名字、收件 WhatsApp、团队成员。
// 与 invite/assets/js/config.js 同一套号码与团队；新同事两边各加一行。
// （代码文件夹仍叫 genie/、本机存储键仍是 genie.*：改了会丢掉已存的客人档案，所以内部名不动。）

export const BRAND = {
  app: 'WISH',
  by: 'by RICCIONE REKA',
  full: 'WISH by RICCIONE REKA',
  house: '溪岸 SAIL',
  reading: '许愿之旅',
  readingEn: 'The Wish Journey',
  studio: '3D 梦想工作室',
  studioEn: '3D Dream Studio',
  plinth: 'WISH · RICCIONE REKA · 溪岸 SAIL',
  venue: 'RICCIONE Malaysia · Setia Alam',
};

// 软件叫 WISH（许愿）；向导是住在神灯里的熊猫精灵：Pan(da) + (Ge)nie。英文念「潘-吉」，尾音和 Genie 一样；
// 中文「潘吉」：「潘」取熊猫 Panda 的音（也是常见姓氏，亲切好记），「吉」= 吉祥。想换名字，只改这里。
// 备选：Jinbao 金宝（Jinn + 宝宝）· Pandini 潘迪尼（Panda + Houdini）· Genda 精达
export const GUIDE = {
  name: '潘吉',
  nameEn: 'Pangie',
};

export const CONFIG = {
  // 蓝图送到哪个 WhatsApp（纯数字，国际码开头）
  inbox: '60189661919',
  // 选填：任何接受 JSON POST 的地址（Formspree / Supabase Edge Function / Apps Script）。
  // 留空 = 只存本机 + WhatsApp。失败不会打断客人。
  endpoint: '',
  team: [{ code: 'wilson', name: 'Wilson Teo', role: '溪岸 Sail by Riccione Reka', wa: '60189661919' }],
  // 客户许愿模式的音乐：默认是现场合成的六首禅意曲子（古筝、手碟、箫、铺底……）垫在高原花园的自然声上（溪水、微风、鸟、蟋蟀），
  // 跟着许愿之旅的每一刻换曲（src/shared/music/）。想用公司自己有版权的曲子：一首就填这里 '/music/xxx.mp3'（旧写法，照样能用），
  // 好几首轮流放就用下面的 music.playlist。mp3 放进 public/music/；自然声仍会垫在底下。
  wishMusic: '',
  // 音乐音量（0–1；0.7 ≈ −23 LUFS：比潘吉说话、仪式时刻的音效低，比按钮的声音高一点）
  wishVolume: 0.7,
  // 许愿模式的声音层：颂钵、风铃默认关（有些客人会觉得风铃「招阴」，农历七月尤其）；关着时用手碟、卡林巴代替，溪水、微风、鸟鸣一直在
  wishLayers: { bowl: false, chimes: false },
  // 揭晓之后音乐渐弱：蓝图页约 50%，进 3D 约 25%（只留溪水和一点风），闲置很久再淡到很小（zen.duck('blueprint') 认这几个名字）
  wishDuck: { blueprint: 0.5, studio: 0.25, idle: 0.12 },
  // 背景音乐 · 音效（src/shared/zen.js、src/shared/sfx.js）
  music: {
    // 公司自己有版权的曲子，轮流播放（两首之间 6 秒交叉淡化，整张循环；打不开的跳过，全部打不开就回到写好的曲子）。
    // 例：['/music/morning.mp3', { src: '/music/garden.mp3', gain: 0.8 }]。空 = 现场合成的禅意曲子（不需要任何授权）。
    // 注意：在展厅放商业唱片要有公开播放授权（马来西亚 MACP / PPM / RPM）；买「含公开播放权」的免版税曲子就没有这个问题。
    playlist: [],
    // 曲子底下的自然声（溪水、微风、鸟、蟋蟀）
    nature: true,
    // 潘吉说话时：音乐压到 0.42（−7.5 dB），自然声只压到 0.8（−2 dB）—— 她像站在花园里说话
    talk: { music: 0.42, nature: 0.8 },
    // 语音模块用 zen.duck('voice') 时的默认倍数（没有用 talk() 的时候）
    voiceDuck: 0.35,
    // 3D 梦想工作室单独打开时：背景音乐默认关（员工在「更多」里打开，记在本机 genie.studioMusic）；开了的音量倍数
    studio: false,
    studioLevel: 0.35,
    // 按钮音效的默认音量（0–1；客人 / 员工调过的记在本机 genie.sfxLevel）。和音乐分开
    sfxLevel: 0.8,
  },
  // 潘吉说话（src/shared/voice.js，台词在 src/shared/i18n/voice-lines.js）。员工在 3D 工作室「设置 → 潘吉的声音」里改的会记在这台设备上，优先于这里。
  voice: {
    // 新设备默认让她说话（false = 只显示对话泡泡）
    on: true,
    // 说多少：'full' = 每一句（一路上的鼓励也说）· 'key' = 只在仪式时刻（开场、神灯、翻牌、揭晓、蓝图、告别）
    level: 'full',
    // 旧版音乐引擎（没有 talk() / duck('voice')）时，她说话期间音乐乘上这个倍数（0.42 ≈ −7.5 dB）
    duck: 0.42,
    // 高级语音包（Gemini TTS）默认用哪个声音：Leda 青春 · Achernar 轻柔 · Zephyr 明亮
    packVoice: 'Leda',
  },
  // 闲置：许愿进行中 3 分钟没人碰 → 潘吉问「还在吗？」；再 30 秒没回应 → 下一位客人。
  // 蓝图 / 3D 永不自动清空（设计师可能对着讲很久），10 分钟没人碰只把音乐淡到很小。
  idle: { quizMs: 180000, promptMs: 30000, fadeMs: 600000 },
  // 这台设备上的客人蓝图放多久（PDPA：不需要了就删）：建好超过这么多天的，下次打开入口页 / 存新蓝图时自动删掉；0 = 不自动删。
  // 客人手上的蓝图链接、海报不受影响（资料就在链接里）。
  keepDays: 90,
};

export function hostFromCode(code) {
  const c = String(code || '').toLowerCase();
  return CONFIG.team.find((t) => t.code === c) || null;
}
