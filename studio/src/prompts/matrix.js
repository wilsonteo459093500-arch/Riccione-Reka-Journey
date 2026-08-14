// 内容矩阵 —— 一次拍摄，一个月的内容。
//
// 这一步的前提是个行业事实：**拍摄很贵，发布很便宜。**
// 专业账号不是每天在拍，是每天在切。一个完整案例在专业手里应该出十几条内容，
// 而「切成哪十几条」本身就是设计判断 —— 不是把长片切段。

import { DIRECTOR_PERSONA, JSON_TAIL, brandContext } from './shared.js';
import { platformById } from '../constants.js';

const MATRIX_SCHEMA = `{
  "read": "看完这批素材，一句话说清它最值钱的地方在哪、最大的缺口是什么",
  "anchor": "这一个月的主线：这批内容合起来想让观众记住的一件事（一句话，不要口号）",
  "pieces": [
    {
      "id": "P1",
      "type": "主片 | 切片 | 前后对比 | 图文帖 | 动态图文 | 口播",
      "title": "这条叫什么（内部用，不是发布标题）",
      "one_idea": "这一条只讲的那一件事。必须能用一句话说完，不能是「案例展示」这种筐",
      "hook_line": "开场第一句话／第一屏大字，写成能直接用的原话",
      "open_with": "开场镜头：素材 id + 起止秒，如 A3 6.2-7.0。图文帖填素材 id 即可",
      "platform": "平台 id",
      "duration_s": 18,
      "format_note": "形式说明：口播+字幕 / 无人声快剪卡点 / 5 张图轮播 / 纯文字动画 …",
      "uses": [
        { "assetId": "A3", "from": 6.2, "to": 9.4, "role": "开场钩子" }
      ],
      "needs_shooting": ["这条还缺什么镜头，没有就空数组"],
      "why_this_exists": "它在这一个月里承担什么职责：拉新 / 建立信任 / 促收藏 / 引评论 / 复述主线",
      "effort": "轻 | 中 | 重",
      "week": 1
    }
  ],
  "calendar": [
    { "week": 1, "shape": "这一周的作用", "slots": [ { "day": "周二", "pieceId": "P1", "why": "为什么排这天" } ] }
  ],
  "gaps": [
    { "need": "整批内容共同缺的镜头", "affects": ["P2", "P5"], "how_to_shoot": "补拍简报，具体到机位和时长" }
  ],
  "not_enough_for": ["凭现有素材做不了、别硬做的 2-3 个选题，并说明缺什么"]
}`;

/**
 * @param {object} o
 * @param {Array}  o.assets    已标注的素材（带 label.best_moments）
 * @param {string} o.notes     这个案例的背景（户型、预算、客户诉求…）
 * @param {string} o.platformId 主战场
 * @param {number} o.count     要几条
 * @param {number} o.weeks     排几周
 * @param {object} o.settings
 */
export function matrixPrompt({ assets = [], notes, platformId, count = 6, weeks = 4, settings }) {
  const p = platformById(platformId);

  const pool = assets
    .map((a) => {
      const L = a.label || {};
      const head = `${a.id} · ${a.kind === 'image' ? '静图' : `视频 ${Number(a.duration || 0).toFixed(1)}s`} · ${a.name}`;
      const body = [
        L.summary ? `  内容：${L.summary}` : null,
        L.shot_size ? `  景别：${L.shot_size}${L.lighting ? ` ｜ 光线：${L.lighting}` : ''}` : null,
        L.tags?.length ? `  标签：${L.tags.join(' / ')}` : null,
        a.kind === 'image' && L.hero_score ? `  封面分：${L.hero_score}/10 ｜ 运镜建议：${L.motion_suggestion || '缓推'}` : null,
        // 标注偶尔是残缺的（模型漏字段、旧存档格式不同）。缺什么就不写什么 ——
        // 往 prompt 里塞 "[undefined] undefined" 只会让模型去猜那是什么意思。
        L.best_moments?.length
          ? `  可用片段：\n${L.best_moments
              .map(
                (m) =>
                  `    - ${Number(m.start || 0).toFixed(1)}–${Number(m.end || 0).toFixed(1)}s` +
                  `${m.use_for ? ` [${m.use_for}]` : ''}${m.what ? ` ${m.what}` : ''}`
              )
              .join('\n')}`
          : null,
        L.issues?.length ? `  问题：${L.issues.join('；')}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      return `${head}\n${body}`;
    })
    .join('\n\n');

  return `${DIRECTOR_PERSONA}

TASK — CONTENT MATRIX. 从这一批素材里，规划出 ${count} 条**互不重复**的内容，并排进 ${weeks} 周。

你不是在把一条长片切段。你是在决定：这批素材里有几个**不同的观点**值得各自成为一条内容。

═══ 素材池 ═══

${pool || '（用户还没有标注任何素材）'}

═══ 案例背景 ═══

${notes?.trim() || '（用户没写背景，从素材本身推断）'}

主战场：${p.label}｜画幅 ${p.aspect}｜理想时长 ${p.sweetSpot}
${p.notes}
${brandContext(settings)}

═══ 硬规矩（违反任何一条这份方案就是废的）═══

1. **任何两条内容不能用同一个开场镜头。** 前 1.5 秒决定一切；两条开头一样，第二条就是隐形的。
   \`open_with\` 必须两两不同 —— 不同素材，或同一素材相隔至少 2 秒的不同片段。

2. **一条只讲一件事。** \`one_idea\` 如果写成「展示这个案例」「介绍全屋定制」，重写。
   合格的例子：「玄关柜为什么做 60 深不做 35」「木纹对纹差 2mm 就会看出来」。

3. **好镜头要摊开用。** 不要把评分最高的素材全烧在第 1 条上。
   同一段素材被超过 2 条内容使用时，必须在不同的位置承担不同的作用。

4. **换格式，不是换剪法。** ${count} 条里至少要有 4 种不同的 \`type\`。
   观众连续刷到同一种节奏，第三条就划走了。
   其中**至少 1 条「动态图文」** —— 它不消耗任何素材，是缺素材时的稳定产能。

5. **一个月有形状。** 不是 ${count} 条随机排列。
   典型节奏：锚点（主片）→ 实证 → 实证 → 互动/清单 → 锚点复述。
   \`calendar\` 里每周的 \`shape\` 要说清这一周在整条线里的作用。

6. **不够就说不够。** 素材撑不起来的选题写进 \`not_enough_for\`，不要硬凑。
   一条能落地的，胜过五条听起来很好但拍不出来的。

7. \`uses\` 里的每一个 \`from\`/\`to\` **必须落在该素材的可用片段里**，
   不能超出素材总时长，也不要用标注里写着有问题的那几秒。

Return JSON with exactly this shape:
${MATRIX_SCHEMA}
${JSON_TAIL}`;
}
