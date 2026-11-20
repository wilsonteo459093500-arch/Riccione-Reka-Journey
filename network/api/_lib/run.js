/* ============================================================
   人脉 App · AI 端点的外壳（体检第 3 阶段）
   ------------------------------------------------------------
   登入检查 → 预算闸门 → 在期限内跑 → **服务器自己记账**（ai_usage）
   以前是手机收到结果才记：关掉画面、出错、超时，这笔钱就没算进预算。
   现在：
     • 成功：服务器写一笔，回给前端的 usage 带 logged: true，前端就不再写
     • AI 回了但格式坏 / 被截断 / 拒答：钱已经花了 → 照样记一笔（错误上带着 usage）
     • 超时：拿不到 usage，记不了（API 不会告诉我们半路花了多少）—— 这种情况 DEPLOY.md 写明
   本机模式（没 Supabase）没有资料库，logged: false，由前端照旧记在 IndexedDB。
   ============================================================ */
import { postHandler } from './http.js';
import { requireOwner, requireBudget } from './auth.js';
import { DEADLINES, makeDeadline } from './ai.js';

/** 写一笔 ai_usage；写失败不影响结果（回 false，前端会补记） */
export async function recordUsage(ctx, row, now = new Date()) {
  if (!ctx || !ctx.db || !row) return false;
  const { logged, ...clean } = row;
  try {
    const { error } = await ctx.db.from('ai_usage').insert({ ...clean, at: now.toISOString() });
    return !error;
  } catch {
    return false;
  }
}

/**
 * @param feature  DEADLINES 的 key
 * @param fn       (body, { deadline }) → { ..., usage }
 */
export function aiEndpoint(feature, fn, deps = {}) {
  const auth = deps.requireOwner || requireOwner;
  const budget = deps.requireBudget || requireBudget;
  return postHandler(async (req, body) => {
    // 期限从收到请求就开始算（登入检查也要时间）
    const deadline = makeDeadline(DEADLINES[feature] || 50_000, feature);
    const ctx = await auth(req);
    await budget(ctx);
    try {
      const out = await fn(body, { deadline, ...(deps.fnDeps || {}) });
      if (out && out.usage) out.usage = { ...out.usage, logged: await recordUsage(ctx, out.usage) };
      return out;
    } catch (e) {
      if (e && e.usage) {
        const logged = await recordUsage(ctx, e.usage);
        if (e.body && typeof e.body === 'object') e.body = { ...e.body, usage: { ...e.usage, logged } };
      }
      throw e;
    }
  });
}
