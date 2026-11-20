/* ============================================================
   人脉 App · API 登入检查 + 每月 AI 预算闸门
   ------------------------------------------------------------
   前端用 Supabase 登入，呼叫 /api/* 时带 Authorization: Bearer <access_token>。
   这里拿 token 去 Supabase 问「你是谁」，再看：
     • OWNER_EMAIL 有设的话，只放这个邮箱（别人就算注册了也烧不到你的 AI 额度）
     • 这个月 ai_usage 加起来超过预算 → 402，不再呼叫 AI
   本机开发（没有 VERCEL_ENV）又没设 Supabase → 直接放行（本机模式试用）。
   在 Vercel 上没设 Supabase → 503，绝不让 AI key 变成公开的。
   ============================================================ */
import { createClient } from '@supabase/supabase-js';
import { HttpError, header } from './http.js';
import { monthlyBudgetUsd, monthStartIso } from './cost.js';

export function supabaseEnv() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  return url && anon ? { url, anon } : null;
}

function onVercel() { return !!process.env.VERCEL_ENV; }

/**
 * @returns {Promise<{mode:'cloud', user, db} | {mode:'local', user:null, db:null}>}
 * db = 用这个人的 token 建的 Supabase client（RLS 照样生效）
 */
export async function requireOwner(req, deps = {}) {
  const env = deps.supabaseEnv !== undefined ? deps.supabaseEnv : supabaseEnv();
  if (!env) {
    if (onVercel()) throw new HttpError(503, { error: 'not_configured', message: 'Supabase 还没设定（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）' });
    return { mode: 'local', user: null, db: null };
  }
  const auth = header(req, 'authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) throw new HttpError(401, { error: 'login_required' });
  const token = m[1].trim();

  const make = deps.createClient || createClient;
  const db = make(env.url, env.anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data || !data.user) throw new HttpError(401, { error: 'login_required' });
  const user = data.user;

  const owner = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  if (owner && String(user.email || '').toLowerCase() !== owner) {
    throw new HttpError(403, { error: 'not_owner', message: '这个 app 只给主人用' });
  }
  return { mode: 'cloud', user, db };
}

/** 这个月已经花了多少（美元）；超过预算就丢 402 */
export async function requireBudget(ctx, now = new Date()) {
  if (!ctx.db) return 0;
  const { data, error } = await ctx.db
    .from('ai_usage')
    .select('cost_usd')
    .gte('at', monthStartIso(now));
  if (error) return 0; // 表还没建好时不挡（第一次设定常见），用量照样由前端记
  const spent = (data || []).reduce((s, r) => s + Number(r.cost_usd || 0), 0);
  const budget = monthlyBudgetUsd();
  if (spent >= budget) {
    throw new HttpError(402, { error: 'over_budget', spent_usd: spent, budget_usd: budget, message: '这个月的 AI 预算用完了（可以在 Vercel 调高 AI_MONTHLY_BUDGET_MYR）' });
  }
  return spent;
}
