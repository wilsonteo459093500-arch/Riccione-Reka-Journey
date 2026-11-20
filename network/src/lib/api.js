/* ============================================================
   前端呼叫 /api/*（AI 都在服务器跑，key 不在前端）
   ============================================================ */
import { repo } from './repo.js';

const MESSAGES = {
  login_required: '登入过期了，请重新登入',
  not_owner: '这个帐号不是主人，不能用 AI',
  over_budget: '这个月的 AI 预算用完了',
  not_configured: '服务器还没设定好（见 DEPLOY.md）',
  ai_not_configured: '服务器还没设 ANTHROPIC_API_KEY',
  ai_busy: 'AI 太忙，等一下再试',
  ticktick_not_configured: '还没接 TickTick（Vercel 设 TICKTICK_TOKEN）',
};

export class ApiError extends Error {
  constructor(status, body) {
    super((body && (body.message || MESSAGES[body.error])) || `出错了（${status}）`);
    this.status = status;
    this.code = body && body.error;
  }
}

async function post(path, body) {
  const token = await repo.accessToken();
  let res;
  try {
    res = await fetch(`/api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, { message: '连不上服务器，检查一下网络' });
  }
  let data = null;
  try { data = await res.json(); } catch { /* 不是 JSON */ }
  if (!res.ok) {
    if (res.status === 413) throw new ApiError(413, { message: '内容太大了（截图请少选几张，逐字稿请分段）' });
    if (res.status === 404) throw new ApiError(404, { message: '找不到 AI 服务（本机开发请在 .env.local 放 ANTHROPIC_API_KEY 后 npm run dev）' });
    throw new ApiError(res.status, data || {});
  }
  return data;
}

export const api = {
  scanCard: (images) => post('scan-card', { images }),
  company: (info) => post('company', info),
  assess: (payload) => post('assess', payload),
  analyzeTalk: (payload) => post('analyze-talk', payload),
  ticktickStatus: () => post('ticktick', { action: 'status' }),
  ticktickTasks: (tasks) => post('ticktick', { action: 'tasks', tasks }),
};
