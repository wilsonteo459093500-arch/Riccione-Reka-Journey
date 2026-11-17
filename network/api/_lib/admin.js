/* ============================================================
   第 4 阶段 · 公开端点（/api/card、/api/inbox）用的「主人资料库」
   ------------------------------------------------------------
   公开页没有登入，不能用 RLS 写资料库 → 在服务器用 SUPABASE_SERVICE_ROLE_KEY
   （Vercel Sensitive 变数，前端永远拿不到）写进 OWNER_EMAIL 那个帐号底下。
   service role 会跳过 RLS，所以这里每一个查询都自己加 owner = 主人，
   而且只开放 inbox 需要的几个动作（ownerDb），不把整个 client 交出去。
   ============================================================ */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { HttpError, header } from './http.js';
import { CARD_BUCKET } from '../../src/lib/card.js';

export function adminEnv() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return url && key ? { url, key } : null;
}

let cached = null; // { client, ownerId }

/** 主人的 user id：OWNER_USER_ID 有设就用；没有就用 OWNER_EMAIL 去 Auth 找（找到存起来） */
export async function resolveOwner(client, env = process.env) {
  const direct = String(env.OWNER_USER_ID || '').trim();
  if (direct) return direct;
  const email = String(env.OWNER_EMAIL || '').trim().toLowerCase();
  if (!email) throw new HttpError(503, { error: 'owner_not_configured', message: '服务器还没设 OWNER_EMAIL' });
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new HttpError(503, { error: 'admin_error', message: 'SUPABASE_SERVICE_ROLE_KEY 好像不对' });
    const users = (data && data.users) || [];
    const hit = users.find((u) => String(u.email || '').toLowerCase() === email);
    if (hit) return hit.id;
    if (users.length < 200) break;
  }
  throw new HttpError(503, { error: 'owner_not_found', message: 'Supabase 里找不到 OWNER_EMAIL 这个帐号' });
}

/** @returns {Promise<{client, ownerId, url}|null>} 没设 service role → null（本机 demo） */
export async function getAdmin(deps = {}) {
  if (deps.admin) return deps.admin;
  const env = adminEnv();
  if (!env) return null;
  if (cached && cached.url === env.url) return cached;
  const client = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const ownerId = await resolveOwner(client);
  cached = { client, ownerId, url: env.url };
  return cached;
}

export function onVercel() { return !!process.env.VERCEL_ENV; }

/** 访客 IP（Vercel 放在 x-forwarded-for 第一个）→ 加盐 hash，不存原本的 IP */
export function clientIp(req) {
  const xff = String(header(req, 'x-forwarded-for') || '').split(',')[0].trim();
  return xff || String(header(req, 'x-real-ip') || '') || (req.socket && req.socket.remoteAddress) || '';
}
export function ipHash(ip, salt = process.env.SUPABASE_SERVICE_ROLE_KEY || 'space') {
  return createHash('sha256').update(`${salt.slice(-16)}|${ip}`).digest('hex').slice(0, 32);
}

/**
 * 只开放 inbox 要用的动作，每个都锁在 owner 底下。
 * 测试用假的同样介面（test/inbox.test.mjs）。
 */
export function ownerDb({ client, ownerId }) {
  const db = client;
  const must = ({ data, error }, what) => {
    if (error) throw new HttpError(500, { error: 'db_error', message: `${what}: ${error.message}` });
    return data;
  };
  return {
    ownerId,
    async profileCard() {
      const data = must(await db.from('profile').select('card, display_name').eq('owner', ownerId).limit(1), 'profile');
      return data && data[0] ? data[0] : null;
    },
    async event(id) {
      const data = must(await db.from('events').select('id, name, held_on, location').eq('owner', ownerId).eq('id', id).limit(1), 'events');
      return data && data[0] ? data[0] : null;
    },
    async countInbox({ sinceIso, ip = null }) {
      let q = db.from('inbox').select('id', { count: 'exact', head: true }).eq('owner', ownerId).gte('at', sinceIso);
      if (ip) q = q.eq('ip_hash', ip);
      const { count, error } = await q;
      if (error) throw new HttpError(500, { error: 'db_error', message: `inbox: ${error.message}` });
      return count || 0;
    },
    async people() {
      return must(await db.from('people').select('id, name, name_alt, title, phones, emails, whatsapp, website, address, card_notes, tags, notes, company_id, pending_review').eq('owner', ownerId), 'people');
    },
    async companies() {
      return must(await db.from('companies').select('id, name, name_alt').eq('owner', ownerId), 'companies');
    },
    async insert(table, row) {
      return must(await db.from(table).insert({ ...row, owner: ownerId }).select().single(), table);
    },
    async update(table, id, patch) {
      const { owner, id: _id, ...clean } = patch;
      return must(await db.from(table).update(clean).eq('owner', ownerId).eq('id', id).select().single(), table);
    },
    async attend(eventId, personId) {
      must(await db.from('attendance').upsert({ owner: ownerId, event_id: eventId, person_id: personId, status: 'attended' }, { onConflict: 'event_id,person_id' }).select(), 'attendance');
    },
    async spentUsd(sinceIso) {
      const { data, error } = await db.from('ai_usage').select('cost_usd').eq('owner', ownerId).gte('at', sinceIso);
      if (error) return 0;
      return (data || []).reduce((s, r) => s + Number(r.cost_usd || 0), 0);
    },
    async uploadPrivate(path, buffer, contentType) {
      const { error } = await db.storage.from('network').upload(path, buffer, { contentType, upsert: false });
      if (error) throw new HttpError(500, { error: 'storage_error', message: error.message });
    },
  };
}

export { CARD_BUCKET };
