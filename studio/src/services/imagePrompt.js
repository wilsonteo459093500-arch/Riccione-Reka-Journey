// 出图 Creative Director —— 把 banana skill 的方法论固化进代码。
//
// 核心原则：**永远不要把用户或模型写的原话直接送给出图模型**。
// 先按 Google 官方验证过的 5 段式公式重组，再过一遍禁用词，最后按 domain 路由分辨率。
//
// 依据：.claude/skills/banana/references/prompt-engineering.md（对齐 2026-03 官方指南）
//      .claude/skills/banana/references/gemini-models.md

// ---------------------------------------------------------------------------
// 禁用词 —— Nano Banana 的系统提示会主动惩罚这些 Stable Diffusion 时代的词
// ---------------------------------------------------------------------------

/** 命中就删。分辨率用 imageSize 参数控制，不是靠在 prompt 里喊「8K」。 */
const BANNED = [
  /\b\d\s?k\b/gi,                      // 4k / 8K / 4 K
  /\bultra[\s-]?hd\b/gi,
  /\bhigh[\s-]?resolution\b/gi,
  /\bmasterpiece\b/gi,
  /\b(highly|ultra)[\s-]?detailed\b/gi,
  /\btrending on artstation\b/gi,
  /\b(hyper|ultra)[\s-]?realistic\b/gi,
  /\bphotorealistic\b/gi,
  /\bbest quality\b/gi,
  /\baward[\s-]?winning\b/gi,
];

/**
 * 洗掉禁用词，并把留下的空白收干净。
 * @returns {{clean: string, removed: string[]}}
 */
export function lintPrompt(text) {
  let clean = String(text || '');
  const removed = [];
  for (const re of BANNED) {
    const hits = clean.match(re);
    if (hits) removed.push(...hits.map((h) => h.trim()));
    clean = clean.replace(re, '');
  }
  clean = clean
    .replace(/\s+/g, ' ')
    // 删词会留下 ", , ," 这种连环逗号 —— 一次塌平，不能只塌一层
    .replace(/(?:\s*,\s*){2,}/g, ', ')
    .replace(/\s+([,.;])/g, '$1')
    .replace(/([,.;])(?=[^\s])/g, '$1 ')
    .replace(/^[\s,;.]+/, '')
    .replace(/[\s,;]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { clean, removed: [...new Set(removed)] };
}

// ---------------------------------------------------------------------------
// Domain 模式 —— 只保留跟家具 / 空间生意真正相关的几种
// ---------------------------------------------------------------------------

export const DOMAINS = [
  {
    id: 'interior',
    label: '空间全景',
    desc: '案例空间、全屋效果 —— 建筑摄影的打法',
    camera: 'Sony A7R V with a 16-35mm lens at f/8, tripod-levelled so verticals stay perfectly straight',
    lighting:
      'natural daylight raking in from a single large window camera-left, soft falloff into the depth of the room, ' +
      'no on-camera flash, shadows kept open and warm',
    anchor: 'Architectural Digest interior feature',
    size: '2K',
    ratioHint: '4:3',
  },
  {
    id: 'product',
    label: '单品',
    desc: '家具单件、柜体 —— 产品摄影的打法',
    camera: 'Canon EOS R5 with a 100mm lens at f/8, camera at product mid-height, no perspective distortion',
    lighting:
      'large softbox camera-left at 45 degrees with a white bounce card opposite, a subtle rim light separating ' +
      'the piece from the background, soft grounded contact shadow beneath',
    anchor: 'Wallpaper* design editorial',
    size: '2K',
    ratioHint: '4:3',
  },
  {
    id: 'detail',
    label: '材质微距',
    desc: '木纹、五金、收口 —— 证明工艺的特写',
    camera: 'Canon EOS R5 with a 100mm macro lens at f/4, focus stacked so the texture stays sharp across the frame',
    lighting:
      'low raking sidelight skimming across the surface to reveal grain and depth, single source, deep soft shadows ' +
      'in the recesses',
    anchor: 'Kinfolk still-life feature',
    size: '2K',
    ratioHint: '1:1',
  },
  {
    id: 'lifestyle',
    label: '生活场景',
    desc: '有人味的使用场景 —— 不摆拍的那种',
    camera: 'Fujifilm X-T5 with a 35mm lens at f/2, handheld at eye level, slight natural imperfection in the framing',
    lighting:
      'late afternoon sun through sheer curtains, warm and directional, dust visible in the light beam, ' +
      'ambient bounce filling the shadows',
    anchor: 'Kinfolk lifestyle editorial',
    size: '2K',
    ratioHint: '4:5',
  },
  {
    id: 'cover',
    label: '封面',
    desc: '给大字留白的封面图 —— 构图必须留出文字位',
    camera: 'Sony A7R V with a 35mm lens at f/4, composed off-centre so one third of the frame stays visually quiet',
    lighting: 'soft even daylight, gentle gradient across the empty area so overlaid text stays legible',
    anchor: 'Architectural Digest cover story',
    size: '2K',
    ratioHint: '3:4',
  },
];

export const domainById = (id) => DOMAINS.find((d) => d.id === id) || DOMAINS[0];

/** imageSize 必须大写 —— 小写会被 API 静默忽略 */
export const IMAGE_SIZES = [
  { id: '1K', label: '1K · 省额度', desc: '社媒够用，最便宜' },
  { id: '2K', label: '2K · 默认', desc: '大部分场景的正解' },
  { id: '4K', label: '4K · 印刷', desc: '要印出来或做主视觉时才用' },
];

// ---------------------------------------------------------------------------
// 5 段式组装
// ---------------------------------------------------------------------------

/**
 * 把结构化的创意描述拼成一段自然语言 prompt。
 * 关键：写成叙述性段落，**不是逗号分隔的关键词列表** —— Gemini 吃前者。
 *
 * @param {object} o
 * @param {string} o.domainId
 * @param {string} o.subject      主体：具体到材质、年份、状态
 * @param {string} o.action       动作 / 状态：现在时强动词
 * @param {string} o.context      环境 + 时间 + 氛围
 * @param {string} [o.composition] 构图（留空则用 domain 默认机位）
 * @param {string} [o.styleNote]  额外风格说明
 * @param {string[]} [o.constraints] 硬约束，会转成全大写强调
 * @param {boolean} [o.hasReference] 是否带了参考底图
 */
export function buildImagePrompt({
  domainId, subject, action, context, composition, styleNote, constraints = [], hasReference = false,
}) {
  const d = domainById(domainId);

  const parts = [
    subject?.trim(),
    action?.trim(),
    context?.trim(),
    (composition?.trim() || '').replace(/\.$/, ''),
    `Captured with ${d.camera}. ${d.lighting}.`,
    styleNote?.trim(),
    `${d.anchor}.`,
  ].filter(Boolean);

  let prompt = parts.join(' ').replace(/\s{2,}/g, ' ');

  // 没有负向 prompt 参数，硬约束只能靠全大写强调
  const rules = [...constraints];
  if (!rules.some((r) => /text|文字/i.test(r))) {
    rules.push('NEVER render any text, letters, numbers, logos or watermarks in the image');
  }
  if (hasReference) {
    rules.unshift(
      'Use the supplied photograph as the base: keep its subject, layout, materials and proportions unchanged — ' +
        'only re-light and re-compose it'
    );
  }
  if (rules.length) prompt += ` ${rules.join('. ')}.`;

  const { clean, removed } = lintPrompt(prompt);
  return { prompt: clean, removed, domain: d, imageSize: d.size };
}

// ---------------------------------------------------------------------------
// 安全拦截 → 改写建议
// ---------------------------------------------------------------------------

/** 输出侧过滤器分析的是生成出来的图，不只是文字 —— 所以要把视觉概念本身推离触发点 */
const REPHRASE_RULES = [
  {
    test: /\b(child|kid|baby|toddler|孩子|小孩|儿童)\b/i,
    hint: '画面里有儿童。补一句明确的家庭 / 教育语境，或干脆把人物换成成年人。',
  },
  {
    test: /\b(nude|bare|intimate|bedroom|bed|卧室|床)\b/i,
    hint: '卧室 / 床品类容易被误判。改成「fashion editorial, fully clothed, editorial pose」这类明确的编辑语境。',
  },
  {
    test: /\b(knife|blade|saw|blood|cut|刀|锯|血)\b/i,
    hint: '工具 / 切割类词会触发暴力过滤。用结果代替动作：「a chisel resting on the workbench」而不是「cutting」。',
  },
  {
    test: /\b(person|man|woman|face|portrait|人物|人像)\b/i,
    hint: '真人特写容易被拦。换成背影、手部特写，或者干脆去掉人只留空间。',
  },
];

/**
 * 被安全过滤器拦下时，给 2–3 条**具体**的改写方向，而不是让用户自己猜。
 * @returns {{reasons: string[], suggestions: string[]}}
 */
export function safetyAdvice(prompt) {
  const reasons = REPHRASE_RULES.filter((r) => r.test.test(prompt)).map((r) => r.hint);
  const suggestions = [
    '把画面改成「只有空间和物件，没有人」—— 家具类内容这样反而更干净。',
    '加一层编辑语境：在结尾写明「Architectural Digest interior feature, professional editorial photography」。',
    '换个说法而不是换个词：过滤器看的是生成出来的图，所以要把画面概念本身挪远一点，不是改几个形容词。',
  ];
  return { reasons: reasons.length ? reasons : ['没有命中已知的敏感模式 —— 多半是输出侧过滤器误判。'], suggestions };
}

/** 给模型写出图 prompt 时用的规则块（塞进文案 prompt 里，让它一次写对） */
export const IMAGE_PROMPT_RULES = `IMAGE PROMPT RULES (the model that renders this is Gemini / Nano Banana — these rules are not optional):

- Write ONE natural-language paragraph in English. NEVER a comma-separated keyword list.
- Follow the 5-component structure in order: SUBJECT → ACTION/STATE → LOCATION & TIME → COMPOSITION → STYLE (with lighting inside style).
- Name a real camera and lens with an f-stop (e.g. "Sony A7R V with a 16-35mm lens at f/8").
- Describe lighting concretely: direction, quality, colour temperature, where the shadows fall. This is the single biggest quality lever.
- End with a prestigious context anchor — "Architectural Digest interior feature", "Wallpaper* design editorial", "Kinfolk still-life feature".
- Include one or two micro-details that prove it is real (a faint ring left by a cup, dust in the light beam, the soft sheen along a rounded edge).
- Target 100–200 words. Longer stops helping.

BANNED — these actively degrade the output, never write them:
  8K / 4K / ultra HD / high resolution / masterpiece / highly detailed / ultra detailed /
  photorealistic / hyperrealistic / ultra realistic / best quality / award winning / trending on artstation
  (Resolution is set by an API parameter, not by the prompt.)

- There is no negative-prompt parameter. Say what IS in frame, not what isn't.
  Wrong: "no clutter, no people". Right: "an empty, still room with clear surfaces".
- For hard constraints use ALL CAPS: "NEVER render any text or logos", "MUST leave the upper-left third empty".
- Describe wood by its grain and surface quality. NEVER name a specific timber species.
- Do NOT ask the model to render Chinese text — it makes mistakes. Leave negative space and the type gets laid over it afterwards.`;
