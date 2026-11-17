/* ============================================================
   POST /api/ticktick
   body: { action: 'status' }                 → { configured, project }
         { action: 'tasks', tasks: [task…] }  → { created: [{ id, projectId, title }], failed: [{ title, message }] }
   task = { title, content?, startDate, dueDate, isAllDay?, timeZone? }（前端 relation.js 的 buildTask 做好的）

   用 TickTick 官方 Open API（https://api.ticktick.com/open/v1/task）。
   只给自己用，所以用「个人 API Token」就好，不用走 OAuth：
     TickTick 网页版 → 设定 → 帐户 → API Token → 复制，放进 Vercel 的 TICKTICK_TOKEN（Sensitive）
   TICKTICK_PROJECT_ID（选填）：放进哪个清单；没设就进收集箱。
   Token 只在服务器，前端拿不到；没用到 AI，不扣 AI 预算，但一样只有主人能叫。
   ============================================================ */
import { postHandler, HttpError, cleanText } from './_lib/http.js';
import { requireOwner } from './_lib/auth.js';

export const TICK_API = 'https://api.ticktick.com/open/v1';
export const MAX_TASKS = 10;
const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}$/;
const ZONE = /^[A-Za-z_]+(?:\/[A-Za-z_+\-0-9]+){0,2}$/;

export function ticktickEnv() {
  const token = (process.env.TICKTICK_TOKEN || '').trim();
  return token ? { token, project: (process.env.TICKTICK_PROJECT_ID || '').trim() } : null;
}

/** 前端送来的任务 → TickTick 要的格式（只留认得的栏位、检查日期） */
export function cleanTask(t, project = '') {
  if (!t || typeof t !== 'object') throw new HttpError(400, { error: 'bad_task' });
  const title = cleanText(t.title, 200).trim();
  if (!title) throw new HttpError(400, { error: 'bad_task', message: '任务要有标题' });
  const out = { title, content: cleanText(t.content, 4000), isAllDay: !!t.isAllDay };
  for (const k of ['startDate', 'dueDate']) {
    if (t[k] == null || t[k] === '') continue;
    if (!DATE.test(String(t[k]))) throw new HttpError(400, { error: 'bad_task', message: `${k} 格式要是 yyyy-MM-ddTHH:mm:ss+0000` });
    out[k] = String(t[k]);
  }
  out.timeZone = ZONE.test(String(t.timeZone || '')) ? String(t.timeZone) : 'Asia/Kuala_Lumpur';
  if (out.startDate) out.reminders = ['TRIGGER:PT0S']; // 时间到了提醒
  if (project) out.projectId = project;
  return out;
}

export async function createTasks(tasks, { env = ticktickEnv(), fetchImpl = fetch } = {}) {
  if (!env) throw new HttpError(503, { error: 'ticktick_not_configured', message: '服务器还没设 TICKTICK_TOKEN（见 DEPLOY.md）' });
  if (!Array.isArray(tasks) || !tasks.length) throw new HttpError(400, { error: 'bad_task', message: '没有任务' });
  if (tasks.length > MAX_TASKS) throw new HttpError(400, { error: 'bad_task', message: `一次最多 ${MAX_TASKS} 个` });
  const clean = tasks.map((t) => cleanTask(t, env.project));
  const created = [];
  const failed = [];
  for (const task of clean) {
    let res;
    try {
      res = await fetchImpl(`${TICK_API}/task`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
    } catch {
      failed.push({ title: task.title, message: '连不上 TickTick' });
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new HttpError(502, { error: 'ticktick_token_invalid', message: 'TickTick 不接受这个 token（过期了或贴错了），请重新复制 API Token 放进 TICKTICK_TOKEN' });
    }
    let data = null;
    try { data = await res.json(); } catch { /* 不是 JSON */ }
    if (!res.ok || !data || !data.id) {
      failed.push({ title: task.title, message: (data && (data.errorMessage || data.message)) || `TickTick 回 ${res.status}` });
      continue;
    }
    created.push({ id: data.id, projectId: data.projectId || task.projectId || '', title: task.title });
  }
  return { created, failed };
}

export default postHandler(async (req, body) => {
  await requireOwner(req);
  const env = ticktickEnv();
  if (body.action === 'status') return { configured: !!env, project: env ? env.project || 'inbox' : null };
  if (body.action === 'tasks') return createTasks(body.tasks, { env });
  throw new HttpError(400, { error: 'bad_action' });
});
