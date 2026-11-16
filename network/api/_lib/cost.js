/* ============================================================
   AI 费用计算（前端、后端共用这一份价目表）
   价格：美元 / 百万 token（Anthropic 官方价，2026-11）
   网页搜索：每 1000 次 $10
   ============================================================ */

export const MODELS = {
  fast: 'claude-haiku-5-5',   // 名片识别、日常摘要
  deep: 'claude-sonnet-5-5',  // 公司背景、深度分析（只在按按钮时跑）
};

export const PRICES = {
  'claude-haiku-5-5': { in: 0.10, out: 0.50 },
  'claude-sonnet-5-5': { in: 2.00, out: 10.00, cacheRead: 0.10 },
  'claude-sonnet-5': { in: 2.00, out: 10.00 },
  'claude-opus-4-8': { in: 5.00, out: 25.00 },
};
export const WEB_SEARCH_USD = 10 / 1000;

export function usdToMyr() {
  const v = Number((typeof process !== 'undefined' && process.env && process.env.USD_TO_MYR) || 4.4);
  return v > 0 ? v : 4.4;
}

export function monthlyBudgetMyr() {
  const v = Number((typeof process !== 'undefined' && process.env && process.env.AI_MONTHLY_BUDGET_MYR) || 50);
  return v > 0 ? v : 50;
}

export function monthlyBudgetUsd() {
  return monthlyBudgetMyr() / usdToMyr();
}

export function monthStartIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * 从 API 回的 usage 算钱。
 * cache 写入按 1.25 倍输入价、cache 读取按 0.1 倍（没另外列的话）。
 */
export function costOf(model, usage = {}) {
  const p = PRICES[model] || PRICES['claude-sonnet-5-5'];
  const input = Number(usage.input_tokens || 0);
  const output = Number(usage.output_tokens || 0);
  const cw = Number(usage.cache_creation_input_tokens || 0);
  const cr = Number(usage.cache_read_input_tokens || 0);
  const searches = Number((usage.server_tool_use && usage.server_tool_use.web_search_requests) || usage.searches || 0);
  const usd =
    (input * p.in + output * p.out + cw * p.in * 1.25 + cr * (p.cacheRead != null ? p.cacheRead : p.in * 0.1)) / 1e6 +
    searches * WEB_SEARCH_USD;
  return Math.round(usd * 1e6) / 1e6;
}

/** 给前端记进 ai_usage 的一列（feature = 哪个功能） */
export function usageRow(feature, model, usage = {}) {
  const searches = Number((usage.server_tool_use && usage.server_tool_use.web_search_requests) || usage.searches || 0);
  return {
    feature,
    model,
    input_tokens: Number(usage.input_tokens || 0) + Number(usage.cache_creation_input_tokens || 0) + Number(usage.cache_read_input_tokens || 0),
    output_tokens: Number(usage.output_tokens || 0),
    searches,
    cost_usd: costOf(model, usage),
  };
}

/** 把几次呼叫的 usage 加起来（公司查询可能 pause_turn 续跑好几次） */
export function addUsage(a = {}, b = {}) {
  const n = (x) => Number(x || 0);
  return {
    input_tokens: n(a.input_tokens) + n(b.input_tokens),
    output_tokens: n(a.output_tokens) + n(b.output_tokens),
    cache_creation_input_tokens: n(a.cache_creation_input_tokens) + n(b.cache_creation_input_tokens),
    cache_read_input_tokens: n(a.cache_read_input_tokens) + n(b.cache_read_input_tokens),
    server_tool_use: {
      web_search_requests:
        n(a.server_tool_use && a.server_tool_use.web_search_requests) + n(b.server_tool_use && b.server_tool_use.web_search_requests),
    },
  };
}
