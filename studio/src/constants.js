// ---------------------------------------------------------------------------
// CIPTA STUDIO · by RICCIONE REKA — 领域常量
// UI 全中文；送给模型的 prompt 片段用英文（模型对英文指令更稳定）。
// ---------------------------------------------------------------------------

export const SETTINGS_KEY = 'riccione.studio.settings.v1';

export const DEFAULT_SETTINGS = {
  apiKey: '',
  baseUrl: 'https://generativelanguage.googleapis.com',
  textModel: 'gemini-2.5-flash',
  imageModel: 'gemini-3.1-flash-image-preview',
  brand: '',
  audience: '',
  tone: '',
};

/** 分析类调用的模型候选：逐个尝试，只有 404（模型不存在）才换下一个 */
export const TEXT_MODEL_CANDIDATES = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3-flash', 'gemini-2.5-pro'];

/**
 * 出图模型候选（封面 / 案例图 / 动态帖单帧）。
 * gemini-3-pro-image-preview 已被 Google 于 2026-03-09 关停，调用会硬报错 —— 不要再放回来。
 * 2.0-flash-preview-image-generation 也已废弃。
 */
export const IMAGE_MODEL_CANDIDATES = [
  'gemini-3.1-flash-image-preview', // Nano Banana 2：14 种画幅、最高 4K
  'gemini-2.5-flash-image',         // 兜底：GA、1K、更便宜
];

// ---------------------------------------------------------------------------
// 平台
// ---------------------------------------------------------------------------

export const PLATFORMS = [
  {
    id: 'xhs',
    label: '小红书',
    aspect: '3:4',
    sweetSpot: '21–45 秒',
    hookWindow: 1.5,
    notes:
      'Cover image and title carry ~70% of the click. Search-driven: the caption must contain the words a buyer would type. ' +
      'Long caption (300–800 字) with 关键词 + 5–10 hashtags performs best. Save/收藏 is the strongest ranking signal.',
  },
  {
    id: 'douyin',
    label: '抖音',
    aspect: '9:16',
    sweetSpot: '15–35 秒',
    hookWindow: 1.0,
    notes:
      'Completion rate is king. Front-load the payoff in the first 1s, then re-hook every 3s. ' +
      'Trending audio inside a 24–48h window gets a distribution boost. Comment-bait in the caption drives the second wave.',
  },
  {
    id: 'reels',
    label: 'Instagram Reels',
    aspect: '9:16',
    sweetSpot: '20–40 秒',
    hookWindow: 1.5,
    notes:
      'Seamless loop (last frame flows back into the first) buys a free second view. ' +
      'Trending audio powers audio-page discovery. Sends/shares weigh more than likes.',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    aspect: '9:16',
    sweetSpot: '15–34 秒',
    hookWindow: 0.7,
    notes:
      'Micro-retention: the viewer re-decides at ~1s, ~3s, then every few seconds. Give each window a new visual event. ' +
      'On-screen text in the first frame doubles as a searchable caption.',
  },
  {
    id: 'shorts',
    label: 'YouTube Shorts',
    aspect: '9:16',
    sweetSpot: '25–55 秒',
    hookWindow: 2.0,
    notes:
      'More search / browse driven, so you get ~1–2s of grace instead of TikTok\'s 0.5–1s. ' +
      'Title text is indexed. Slightly longer, more substantive edits outperform pure trend-chasing.',
  },
  {
    id: 'wechat',
    label: '视频号 / 朋友圈',
    aspect: '9:16',
    sweetSpot: '30–60 秒',
    hookWindow: 2.0,
    notes:
      'Social-graph distribution: 点赞/推荐 pushes into friends\' feeds, so credibility and "worth forwarding" beat shock value. ' +
      'Older, higher-intent audience — real project footage and clear numbers outperform fast meme edits.',
  },
];

export const platformById = (id) => PLATFORMS.find((p) => p.id === id) || PLATFORMS[0];

// ---------------------------------------------------------------------------
// 节拍（beat）——参考视频拆解后的结构骨架
// ---------------------------------------------------------------------------

export const BEATS = [
  { id: 'HOOK', label: '钩子', color: '#9C3D2E', desc: '0–2 秒，让人停下来' },
  { id: 'SETUP', label: '铺垫', color: '#C0843A', desc: '交代场景 / 问题' },
  { id: 'PROOF', label: '实证', color: '#B8995A', desc: '过程、细节、案例证据' },
  { id: 'TURN', label: '转折', color: '#A87C4F', desc: '反差 / 揭晓 / 前后对比' },
  { id: 'PAYOFF', label: '成果', color: '#3D5A4A', desc: '最终效果，最爽的一下' },
  { id: 'CTA', label: '行动', color: '#2D4A3E', desc: '关注 / 私信 / 收藏' },
];

export const beatById = (id) => BEATS.find((b) => b.id === id) || BEATS[0];

// ---------------------------------------------------------------------------
// 调色 / 字幕 / 转场 —— 与 video-use 的 grade.py、字幕规范对齐
// ---------------------------------------------------------------------------

export const GRADES = [
  { id: 'none', label: '原片直出', desc: '不调色', filter: null },
  {
    id: 'warm_cinematic',
    label: '暖调电影感',
    desc: '青橙分离、轻度去饱和 —— 家装/生活方式最稳的一档',
    filter: 'colorbalance=rs=.04:gs=.01:bs=-.05:rm=.03:bm=-.03:rh=.02:bh=-.04,eq=contrast=1.06:saturation=0.94',
  },
  {
    id: 'neutral_punch',
    label: '通透干净',
    desc: '提对比不偏色 —— 产品图、白墙空间',
    filter: 'eq=contrast=1.12:saturation=1.05:gamma=0.98',
  },
  {
    id: 'soft_muji',
    label: '奶油无印',
    desc: '低对比高亮部、米白氛围 —— 小红书家居爆款调性',
    filter: 'eq=contrast=0.94:saturation=0.88:brightness=0.03,colorbalance=rh=.03:gh=.02:bh=-.02',
  },
  {
    id: 'moody_dark',
    label: '深色高级',
    desc: '压暗中间调、留住高光 —— 岩板/木饰面质感',
    filter: 'eq=contrast=1.18:saturation=0.9:gamma=0.92,colorbalance=rs=-.03:bs=.04',
  },
];

export const gradeById = (id) => GRADES.find((g) => g.id === id) || GRADES[0];

export const CAPTION_STYLES = [
  {
    id: 'bold_overlay',
    label: '爆款粗体（2 字一跳）',
    desc: '科技 / 短视频通用，节奏最强',
    chunk: 2,
    upper: true,
    ass: 'FontName=Helvetica,FontSize=18,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=35',
  },
  {
    id: 'natural_sentence',
    label: '自然整句',
    desc: '叙事 / 科普，观感舒服',
    chunk: 6,
    upper: false,
    ass: 'FontName=Helvetica,FontSize=15,Bold=0,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=1,Outline=1,Shadow=1,Alignment=2,MarginV=70',
  },
  {
    id: 'brand_clean',
    label: '品牌极简',
    desc: '细字重、下沿留白 —— 高客单价调性',
    chunk: 5,
    upper: false,
    ass: 'FontName=Helvetica,FontSize=14,Bold=0,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=0,Shadow=0,Alignment=2,MarginV=90',
  },
  { id: 'none', label: '不加字幕', desc: '纯画面 + 音乐', chunk: 0, upper: false, ass: '' },
];

export const captionStyleById = (id) => CAPTION_STYLES.find((c) => c.id === id) || CAPTION_STYLES[0];

export const TRANSITIONS = [
  { id: 'cut', label: '硬切' },
  { id: 'crossfade', label: '叠化' },
  { id: 'whip', label: '甩镜' },
  { id: 'match_cut', label: '匹配剪辑' },
  { id: 'mask_wipe', label: '遮罩擦除' },
];

// ---------------------------------------------------------------------------
// 视频类型模板（没有参考视频时，可以直接选一个骨架）
// ---------------------------------------------------------------------------

export const TEMPLATES = [
  {
    id: 'before_after',
    label: '前后对比',
    hint: '毛坯 → 成品，家装最稳的爆款结构',
    beats: ['HOOK', 'SETUP', 'PROOF', 'TURN', 'PAYOFF', 'CTA'],
    brief:
      'A before/after transformation reel. Open ON the ugly "before" with a provocative line, tease the finished look for ' +
      '0.3s within the first 2 seconds, walk through 2–3 pieces of process proof, then land the full reveal with a match cut.',
  },
  {
    id: 'process',
    label: '施工过程 / 工艺',
    hint: '展示手艺和细节，建立专业信任',
    beats: ['HOOK', 'SETUP', 'PROOF', 'PROOF', 'PAYOFF', 'CTA'],
    brief:
      'A craft/process reel. Hook on the most satisfying single action (a perfect seam, a drawer closing softly), ' +
      'then show the sequence of steps with tight macro shots, ending on the finished detail.',
  },
  {
    id: 'case_tour',
    label: '案例漫游',
    hint: '一个完整案例的空间巡礼',
    beats: ['HOOK', 'SETUP', 'PROOF', 'PROOF', 'PAYOFF', 'CTA'],
    brief:
      'A finished-project walkthrough. Hook on the single most striking frame of the home, state the constraint ' +
      '(面积/预算/户型痛点), then move room to room with motivated camera moves, ending on the hero shot.',
  },
  {
    id: 'tips',
    label: '干货清单',
    hint: '「3 个错误 / 5 个技巧」高收藏率',
    beats: ['HOOK', 'PROOF', 'PROOF', 'PROOF', 'PAYOFF', 'CTA'],
    brief:
      'A numbered tips reel optimised for saves. Hook with the cost of getting it wrong, deliver each tip as a ' +
      'self-contained 4–6s unit with a number badge on screen, end with a "存下来别踩坑" CTA.',
  },
  {
    id: 'story',
    label: '客户故事',
    hint: '有情绪、有人物，最容易被转发',
    beats: ['HOOK', 'SETUP', 'TURN', 'PROOF', 'PAYOFF', 'CTA'],
    brief:
      'A client story. Hook on the emotional line or the constraint, build the human stakes, show the turn, ' +
      'prove it with real footage, land on the client reaction or the finished home.',
  },
  {
    id: 'trend_remix',
    label: '热点套用',
    hint: '把当下热门格式套到你的内容上',
    beats: ['HOOK', 'TURN', 'PROOF', 'PAYOFF', 'CTA'],
    brief:
      'A trend remix. Adopt the trending format\'s rhythm and audio beat map exactly, but substitute the creator\'s own ' +
      'footage and a category-specific payoff so it reads as native rather than derivative.',
  },
];

// ---------------------------------------------------------------------------
// 渲染出口 —— 拆解 + 排好的方案，可以交给这几条流水线真正出片
// ---------------------------------------------------------------------------

export const PIPELINES = [
  {
    id: 'video-use',
    label: 'video-use',
    repo: 'https://github.com/browser-use/video-use',
    desc: '原片剪辑首选：转写 → EDL → ffmpeg 出片，本地跑，最接近「丢素材出成片」',
    good: '你有大量原始录像，要去口癖、卡节奏、烧字幕',
  },
  {
    id: 'hyperframes',
    label: 'HyperFrames',
    repo: 'https://github.com/heygen-com/hyperframes',
    desc: '写 HTML/CSS → 逐帧渲染 MP4，确定性输出，Apache-2.0',
    good: '动态图文帖、标题卡、数据动画、纯图文 reel',
  },
  {
    id: 'cc-toolkit',
    label: 'CC Video Toolkit',
    repo: 'https://github.com/digitalsamba/claude-code-video-toolkit',
    desc: 'Remotion + ElevenLabs 配音 + 品牌系统，适合讲解型视频',
    good: '产品讲解、教程、需要 AI 配音的口播视频',
  },
  {
    id: 'seedance',
    label: 'Seedance（静图→视频）',
    repo: 'https://fal.ai/models/bytedance/seedance-2.5/image-to-video',
    desc: '字节的视频模型，把一张图当第一帧生成真运镜；fal.ai 上约 $0.47/秒（720p）、$0.22/秒（480p）',
    good: '静图多、视频少的时候，让你自己的真实案例图动起来 —— 比假的 Ken Burns 强一个档次',
  },
  {
    id: 'vyra',
    label: 'Vyra（MCP 实时剪辑）',
    repo: 'https://vyra.ai',
    desc: '浏览器里的 AI 剪辑器，Claude 通过 MCP 直接操作时间线，改完即所见',
    good: '想边看边改、手动微调，不想碰命令行',
  },
];
