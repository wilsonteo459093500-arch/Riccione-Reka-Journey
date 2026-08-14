// 趋势雷达 —— 不是「今天热搜是什么」（那需要实时数据），
// 而是「这些格式为什么在火 + 你该怎么做出不一样的」，输出可直接开工的选题。

import { DIRECTOR_PERSONA, RETENTION_RULES, JSON_TAIL, brandContext } from './shared.js';
import { platformById } from '../constants.js';

const TREND_SCHEMA = `{
  "read": "3-4 句话：当下这个赛道的内容供给长什么样、观众已经看腻了什么",
  "radar": [
    {
      "trend": "格式 / 玩法名字",
      "what": "具体长什么样，描述到能照着拍",
      "why_now": "为什么现在有效（机制层面，不是玄学）",
      "lifespan": "还能吃多久：<1 个月 / 1-3 个月 / 长青",
      "fit": "high",
      "how_to_use": "套到用户这个行业该怎么改",
      "crowding": "这个格式现在有多挤"
    }
  ],
  "differentiation": {
    "crowded": ["同行都在做、已经没有差异的内容类型"],
    "blind_spots": ["没人做但观众真的想看的角度"],
    "your_edge": "基于品牌上下文，用户最该占的位",
    "positioning_line": "一句话定位，可以直接写进简介"
  },
  "angles": [
    {
      "title": "选题标题",
      "format": "用哪个格式",
      "hook": "开场原话",
      "beats": ["4-6 拍的结构，每拍一句"],
      "asset_need": "需要什么素材，用户手上大概率有没有",
      "platform": "xhs",
      "effort": "low",
      "save_bait": "让人收藏的理由",
      "expected": "这条大概能拿到什么结果，说实话"
    }
  ],
  "calendar": [
    {
      "week": 1,
      "theme": "这一周的主题",
      "posts": [ { "day": "周一", "topic": "选题", "format": "格式", "platform": "xhs" } ]
    }
  ]
}`;

/**
 * @param {object} o
 * @param {string} o.industry 用户行业 / 赛道
 * @param {string} o.platformId
 * @param {string} o.observed 用户自己观察到的热门内容（可空，但填了质量高很多）
 * @param {number} o.weeks 排几周的日历
 * @param {object} o.settings
 */
export function trendPrompt({ industry, platformId, observed, weeks = 4, settings }) {
  const p = platformById(platformId);

  return `${DIRECTOR_PERSONA}

TASK — TREND READ & DIFFERENTIATED CONTENT PLAN.

赛道 / 行业：${industry?.trim() || '(用户没写，按品牌上下文推断)'}
主战场平台：${p.label}
平台机制：${p.notes}
${brandContext(settings)}

${
  observed?.trim()
    ? `═══ 用户自己观察到的热门内容（这是最新鲜的一手信息，权重最高）═══
${observed.trim()}

把这些当作现在正在发生的事实来分析。你的模型知识可能落后于这些观察 —— 观察冲突时以观察为准。`
    : `═══ 注意 ═══
用户没有提供他们最近刷到的内容。你只能基于训练知识里的格式规律来推断，所以：
- 只讲那些有结构性原因、不会一个月就死的玩法，不要假装知道本周的热梗。
- 在 "read" 里明确提醒用户：把最近刷到的 5-10 条爆款粘进来，这份分析会准得多。`
}

${RETENTION_RULES}

═══ 分析要求 ═══
- "radar" 给 5-7 个格式。每个都要说清 **机制**：为什么这个结构能提高完播/收藏/转发，而不是"因为大家喜欢"。
- "fit" 只能是 high / mid / low —— 指的是跟用户这个行业和素材条件的匹配度，不是流行度。
- "effort" 只能是 low / mid / high —— 指用户实际拍摄和剪辑的成本。
- "angles" 给 8-10 个可以明天就开工的选题。每个 hook 都要写成原话，不要写"用一个吸引人的开场"。
- "angles" 里至少 3 个必须是 effort = low（用现有案例图 / 手机随手拍就能做）。
- "calendar" 排 ${weeks} 周，每周 3 条（一致性胜过数量：3 条打磨好的 > 10 条赶工的）。
- "blind_spots" 是这份报告最值钱的部分。想深一点：观众在决策这类消费时真正焦虑的是什么？
  哪些问题所有人都在回避回答？

Return JSON with exactly this shape:
${TREND_SCHEMA}
${JSON_TAIL}`;
}
