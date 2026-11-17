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
  // 复制贴上常常多一个空格 / 换行 → 先修掉
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/^["']|["']$/g, '');
  return url && key ? { url, key } : null;
}

/**
 * key 哪里不对（不会把 key 本身说出来）：
 * 旧格式是 JWT，里面写着 role（anon / service_role）和是哪个 project（ref）；新格式 sb_secret_ / sb_publishable_
 */
export function keyHint(key, url = '') {
  const k = String(key || '');
  if (k.startsWith('sb_publishable_')) return '贴到的是 publishable key（公开的那把），要的是 secret key（sb_secret_…）或旧版的 service_role';
  if (k.startsWith('sb_secret_')) return '';
  const parts = k.split('.');
  if (parts.length !== 3) return 'key 格式不对：应该是 eyJ… 开头的一长串（service_role），或 sb_secret_ 开头';
  let payload = null;
  try { payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch { /* 不是 JWT */ }
  if (!payload) return 'key 格式不对：解不开';
  if (payload.role && payload.role !== 'service_role') return `贴到的是 ${payload.role} key，要的是 service_role（Supabase → Project Settings → API → service_role → Reveal）`;
  const ref = (/^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(String(url)) || [])[1];
  if (ref && payload.ref && payload.ref !== ref) return `这把 key 是别的 Supabase project（${payload.ref}）的，网址是 ${ref}`;
  return '';
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
    if (error) {
      const env2 = adminEnv() || {};
      const hint = keyHint(env2.key, env2.url);
      throw new HttpError(503, {
        error: 'admin_error',
        message: `SUPABASE_SERVICE_ROLE_KEY 好像不对${hint ? `：${hint}` : ''}`,
        detail: String((error && (error.message || error.code)) || '').slice(0, 200),
        status: error && error.status,
      });
    }
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
