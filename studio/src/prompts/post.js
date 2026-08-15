// 发布打包 —— 标题 / 正文 / 标签 / 封面 / 评论区策略，按平台分别出。

import { DIRECTOR_PERSONA, JSON_TAIL, brandContext } from './shared.js';
import { platformById } from '../constants.js';
import { IMAGE_PROMPT_RULES } from '../services/imagePrompt.js';

const POST_SCHEMA = `{
  "platform": "xhs",
  "titles": [
    { "text": "标题原文", "angle": "这个标题走的角度", "why": "为什么这个角度在这个平台能拿点击" }
  ],
  "caption": "正文全文，按平台习惯的长度和分段写好，可直接复制粘贴",
  "hashtags": ["#标签"],
  "keywords": ["站内搜索关键词，用户会怎么搜这类内容"],
  "cover": {
    "concept": "封面创意一句话",
    "title_text": "封面大字（≤12 字）",
    "subtitle": "封面副标题（≤16 字，可空）",
    "layout": "文字排版位置与配色",
    "prompt": "英文出图 prompt，完整自足，可直接送给图像模型"
  },
  "first_comment": "自己抢占的第一条评论内容",
  "reply_bait": "埋在正文或结尾、能引出评论的钩子问题",
  "lead_magnet": {
    "use": true,
    "why": "这条内容适不适合装这个钩子，一句话说清；不适合就 use=false 并说明原因",
    "keyword": "让人留言的那个词，2-4 个字，好打、不容易打错、和内容强相关",
    "deliverable": "留言之后你要发给他的到底是什么。必须是一个具体的东西（一份对照表 / 一张清单 / 一段视频），不能是「更多资讯」",
    "onscreen": "挂在画面上的那行字原文，如「留言『尺寸』」",
    "placement": "挂在画面哪个位置、从第几秒开始、是否全程常驻",
    "ready_check": "发之前必须先准备好什么。给出一句提醒：这个东西现在不存在就别发这条"
  },
  "post_time": "建议发布时间与理由",
  "hook_variants": ["3 条备用开场白，供 A/B 测试"],
  "repurpose": [
    { "platform": "douyin", "tweak": "搬到这个平台要改什么，具体到标题和时长" }
  ],
  "risk_check": ["2-4 条：这条内容可能踩的平台规则或观感雷区"]
}`;

/**
 * @param {object} o
 * @param {string} o.platformId
 * @param {object} [o.recipe]
 * @param {object} [o.plan]
 * @param {string} o.topic  没有配方时，用户直接写的主题
 * @param {object} o.settings
 */
export function postPrompt({ platformId, recipe, plan, topic, settings }) {
  const p = platformById(platformId);

  const context = recipe
    ? `═══ 这条视频是什么 ═══
标题：${recipe.title}
格式：${recipe.format}
一句话：${recipe.one_liner}
钩子：[${recipe.hook?.type}] ${recipe.hook?.line}
结构：${(recipe.beats || []).map((b) => b.beat).join(' → ')}
成片时长：${plan?.target_duration_s || recipe.duration_s}s
CTA：${recipe.cta?.line || '?'}
${plan?.summary ? `剪辑思路：${plan.summary}` : ''}
${plan?.timeline?.length ? `实际画面：${plan.timeline.map((t) => t.onscreen_text).filter(Boolean).join(' / ')}` : ''}`
    : `═══ 这条内容是什么 ═══
${topic?.trim() || '(用户没写主题，按品牌上下文自己定一个最有代表性的选题)'}`;

  return `${DIRECTOR_PERSONA}

TASK — PUBLISH PACKAGING for ${p.label}.
The video is made. Now write everything that surrounds it, because on most platforms the packaging decides whether the
video ever gets seen. You are writing copy that will be posted as-is — not suggestions, not templates with blanks.

${context}

═══ 平台机制（照这个写，不要写成通用文案）═══
${p.label}：理想时长 ${p.sweetSpot}，画幅 ${p.aspect}
${p.notes}
${brandContext(settings)}

═══ 写作要求 ═══
- 给 5 条标题，5 个不同角度（如：痛点点名 / 数字承诺 / 反常识 / 身份认同 / 好奇缺口），不要 5 条同义改写。
- 正文按这个平台的真实习惯写：小红书写长、分段、带 emoji、埋关键词；抖音/TikTok 写短、一句话钩子 + 一句引导；
  视频号写得像跟熟人说话，克制、可信、值得转发。
- hashtags 按平台数量习惯：小红书 5–10 个（大中小词搭配），抖音 3–5 个，Reels/TikTok 3–5 个，视频号 2–3 个。
- "keywords" 是搜索词，不是标签 —— 写用户真的会在搜索框打出来的字。
- 封面 prompt 必须严格按下面这套规则写（它直接决定出图质量）：

${IMAGE_PROMPT_RULES}

  另外这张是封面，构图上**必须留出一块安静的区域给标题大字**，在 prompt 里明确写清楚留在哪
  （例如 "MUST leave the upper-left third visually quiet for overlaid type"）。
- "post_time" 要给具体时段和理由，结合这个平台目标人群的作息。
- 不要写空话。"提升品牌影响力" 这种句子一句都不要出现。

- **lead_magnet（留言换资料）** —— 这是把公域流量转成私域最有效的一个动作，同时评论数直接拉算法权重。
  真实案例：一条口播视频，363 赞却有 1,197 条评论（评论是赞的 3.3 倍），
  引擎就是画面底部**全程挂着**的一行「留言『開剪』」，正文补一句「留言『開剪』我把教学影片传给你」。

  写这一段的三条硬要求：
  1. **关键词要好打。** 中文 2–4 个字，不要用生僻字、不要中英混排、不要和常见评论撞（如「想要」）。
  2. **交付物必须是一个具体的东西。** 「一份 12 个尺寸的对照表 PDF」是具体的；「更多装修资讯」不是。
     用户看不到它是什么，就不会为它打字。
  3. **ready_check 必须写。** 一千条评论意味着要发一千次 —— 东西不存在就先别发这条视频。
     这句提醒比钩子本身更重要，漏掉它等于让用户对一千个人失信。

  如果这条内容本身不适合（例如纯品牌形象片、或者根本没有可交付的资料），
  就写 use=false 并说明原因，**不要硬装一个**。装了兑现不了，比不装伤害大得多。

Return JSON with exactly this shape:
${POST_SCHEMA}
${JSON_TAIL}`;
}

/** 动态图文帖：生成一份 HyperFrames 可渲染的分镜脚本 */
export function animatedPostPrompt({ topic, platformId, settings, slideCount = 5 }) {
  const p = platformById(platformId);
  return `${DIRECTOR_PERSONA}

TASK — ANIMATED POST STORYBOARD.
Design a ${slideCount}-slide animated post (the kind that renders to a short looping MP4 — kinetic typography over
imagery, no talking head). It will be rendered with HyperFrames (HTML + CSS + seekable animation), so every motion you
describe must be expressible as a CSS transform/opacity animation on a timeline.

主题：${topic?.trim() || '(用户没写，按品牌上下文自己定一个)'}
平台：${p.label}｜画幅 ${p.aspect}｜目标总时长 ${slideCount * 2.2}s 左右
${p.notes}
${brandContext(settings)}

RULES:
- Slide 1 must work as a static cover. Everything after it earns attention by movement.
- Each slide: ONE idea, ≤14 个字的主文案, optional ≤20 字 supporting line.
- Motion vocabulary only: fade, slide (x/y), scale, blur, clip-path wipe, letter-by-letter stagger, counter count-up.
- Easing is never linear. Entrances ease-out-cubic; exits ease-in-cubic.
- Hold each slide's final state ≥0.6s before transitioning.
- Last slide loops back into slide 1 visually.

Return JSON with exactly this shape:
{
  "title": "这组帖子的名字",
  "total_duration_s": 11.0,
  "palette": { "bg": "#RRGGBB", "ink": "#RRGGBB", "accent": "#RRGGBB" },
  "font_feel": "字体气质描述",
  "slides": [
    {
      "index": 1,
      "duration_s": 2.2,
      "headline": "主文案",
      "sub": "副文案（可空）",
      "bg_kind": "solid | image | gradient",
      "image_prompt": "如果 bg_kind 是 image，写英文出图 prompt；否则空字符串",
      "layout": "版式描述：文字在哪、留白在哪",
      "motion": "这一屏的动效，按时间顺序写，如「0-0.4s 主文案逐字上浮淡入；0.4-0.6s 下划线从左擦出」",
      "transition_out": "转到下一屏的方式"
    }
  ],
  "caption": "配这组图发的正文",
  "hashtags": ["#标签"]
}
${JSON_TAIL}`;
}
