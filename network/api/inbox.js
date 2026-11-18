/* ============================================================
   POST /api/inbox   ← 公开名片页（/c）的「留下你的联络方式」
   body: { name, phone, company, title, email, met_where, note,
           consent: true, event?, src?, card_image?: { media_type, data }, turnstile?, fax(陷阱), ms(填表花了几毫秒) }
   回：  { ok: true, name }   （不管是新的人还是已经存过的，都回一样的 —— 不让外人试出谁在你的名单里）
   ------------------------------------------------------------
   流程：陷阱 / 太快 → 假装成功 · 同意条款 · 检查栏位 · Turnstile（有设才验）· 同 IP 每小时限次
        → 名片照片存私有 bucket + Haiku 读（有预算才读）→ 找是不是已经存过（电话末 9 码 / 邮箱）
        → 新建（圈层「认识」、标签「扫码」、待确认）或只补空的栏位 → 记一笔互动「扫码留资料」
        → 有活动就记出席 → inbox 记一笔（审计、PDPA 查询用）
   不跑「深度分析」（花钱），主人想深入再按。
   ============================================================ */
import { randomUUID } from 'node:crypto';
import { send, sendError, readJson, HttpError, cleanText } from './_lib/http.js';
import { getAdmin, ownerDb, onVercel, clientIp, ipHash } from './_lib/admin.js';
import { cleanImages } from './_lib/ai.js';
import { monthlyBudgetUsd, monthStartIso } from './_lib/cost.js';
import { scanCard } from './scan-card.js';
import { findCompany } from '../src/lib/logic.js';
import {
  cleanLead, LeadError, fillLeadFromCard, findExisting, leadToPerson, mergeLeadInto, leadForLog,
  cleanSource, UUID_RE, CONSENT_VERSION, howMet,
} from '../src/lib/card.js';

export const LIMITS = { perIpHour: 20, allHour: 300, minFillMs: 1500 };

async function verifyTurnstile(token, ip, fetchImpl = fetch) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const form = new URLSearchParams({ secret, response: String(token).slice(0, 2048), remoteip: ip || '' });
    const r = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const data = await r.json();
    return !!(data && data.success);
  } catch {
    return false;
  }
}

/**
 * 主流程（测试直接叫这个，db / scan 都可以换成假的）
 * @param body  前端送来的
 * @param ctx   { db: ownerDb, ip, now, scan(images) → {card, usage}, fetchImpl }
 */
export async function receiveLead(body, ctx) {
  const now = ctx.now || new Date();
  const b = body && typeof body === 'object' ? body : {};

  // 1) 机器人：隐藏栏位有字 / 不到 1.5 秒就送出 → 假装成功，什么都不存
  if (cleanText(b.fax, 200).trim() || (Number.isFinite(Number(b.ms)) && Number(b.ms) < LIMITS.minFillMs)) {
    return { ok: true, name: '' };
  }

  // 2) 检查栏位（有名片照片的话名字、电话可以空）
  let images = null;
  if (b.card_image) images = cleanImages([b.card_image], 1);
  let lead;
  try {
    lead = cleanLead(b, { hasCard: !!images });
  } catch (e) {
    if (e instanceof LeadError) throw new HttpError(400, { error: e.code, message: e.message });
    throw e;
  }

  // 3) Turnstile（有设 TURNSTILE_SECRET_KEY 才验）
  if (!(await verifyTurnstile(b.turnstile, ctx.ip, ctx.fetchImpl))) {
    throw new HttpError(403, { error: 'captcha_failed', message: '验证没过，请重新整理页面再试' });
  }

  const db = ctx.db;
  // 4) 限次：同一个 IP 每小时 20 次（活动现场大家可能连同一个 Wi-Fi）；全部加起来每小时 300 次
  const hourAgo = new Date(now.getTime() - 3600 * 1000).toISOString();
  const ip = ipHash(ctx.ip || '');
  if ((await db.countInbox({ sinceIso: hourAgo, ip })) >= LIMITS.perIpHour || (await db.countInbox({ sinceIso: hourAgo })) >= LIMITS.allHour) {
    throw new HttpError(429, { error: 'too_many', message: '送出太多次了，请稍后再试，或直接 WhatsApp 我' });
  }

  // 5) 活动（只认主人自己的活动）
  const eventId = UUID_RE.test(String(b.event || '')) ? String(b.event) : '';
  const event = eventId ? await db.event(eventId) : null;
  const source = cleanSource(b.src);

  // 6) 名片照片：先存起来（私有 bucket），有预算再让 Haiku 读
  let photo = null;
  let scanned = false;
  if (images) {
    const id = randomUUID();
    const path = `${db.ownerId}/${id}.jpg`;
    const img = images[0].source;
    await db.uploadPrivate(path, Buffer.from(img.data, 'base64'), img.media_type);
    photo = await db.insert('photos', { id, kind: 'card', path, caption: '名片（扫码留资料）', taken_at: now.toISOString() });
    if (ctx.scan) {
      try {
        const spent = await db.spentUsd(monthStartIso(now));
        if (spent < monthlyBudgetUsd()) {
          const { card, usage } = await ctx.scan(images);
          if (card && card.is_business_card !== false) {
            lead = fillLeadFromCard(lead, card);
            scanned = true;
          }
          if (usage) await db.insert('ai_usage', { ...usage, feature: 'inbox_card', at: now.toISOString() }).catch(() => null);
        }
      } catch { /* AI 读不到就算了，主人在「新朋友」再按「AI 读名片」 */ }
    }
  }

  // 7) 已经存过？（电话末 9 码 / 邮箱）
  const people = await db.people();
  const existing = findExisting(lead, people);
  let person;
  let outcome;
  if (existing) {
    const patch = mergeLeadInto(existing, lead, { source });
    if (photo && !existing.card_photo_id) patch.card_photo_id = photo.id;
    person = Object.keys(patch).length ? await db.update('people', existing.id, patch) : existing;
    outcome = 'updated';
  } else {
    const row = leadToPerson(lead, { event, source, now });
    if (photo) {
      row.card_photo_id = photo.id;
      if (!scanned && !lead.name) row.notes = [row.notes, '名片还没读：在「新朋友」按「AI 读名片」'].filter(Boolean).join('\n');
    }
    const companyName = lead.company;
    if (companyName) {
      const companies = await db.companies();
      const hit = findCompany(companies, companyName);
      const company = hit || await db.insert('companies', {
        name: companyName, name_alt: '', website: (lead.extra && lead.extra.website) || '', address: (lead.extra && lead.extra.address) || '', industry: (lead.extra && lead.extra.industry_guess) || '',
      });
      row.company_id = company.id;
    }
    person = await db.insert('people', row);
    outcome = 'created';
  }

  if (photo) await db.insert('photo_people', { photo_id: photo.id, person_id: person.id });

  // 8) 互动 + 活动出席
  const where = howMet(lead, event);
  await db.insert('interactions', {
    person_id: person.id,
    kind: 'card_scan',
    source: 'qr',
    occurred_at: now.toISOString(),
    title: event ? `扫码留资料 · ${event.name}` : source === 'nfc' ? '碰 NFC 留资料' : source === 'folotoy' ? '扫 FoloToy 留资料' : '扫码留资料',
    summary: [lead.met_where && `在 ${lead.met_where} 认识`, lead.note && `留言：${lead.note}`, outcome === 'updated' && '（已经存过，补上新资料）'].filter(Boolean).join('；'),
  });
  if (event) await db.attend(event.id, person.id);

  // 9) 记录（谁、什么时候、同意了哪一版条款）
  await db.insert('inbox', {
    at: now.toISOString(), ip_hash: ip, event_id: event ? event.id : null, person_id: person.id, outcome, source,
    payload: leadForLog(lead), consent_at: now.toISOString(), consent_version: CONSENT_VERSION,
  });

  return { ok: true, name: lead.name || '', where };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  try {
    const body = await readJson(req, 4.5 * 1024 * 1024);
    const admin = await getAdmin();
    if (!admin) {
      if (onVercel()) throw new HttpError(503, { error: 'not_configured', message: '还没开放留资料，请直接 WhatsApp 我' });
      // 本机 demo：检查栏位但不存
      try { cleanLead(body, { hasCard: !!body.card_image }); } catch (e) { if (e instanceof LeadError) throw new HttpError(400, { error: e.code, message: e.message }); throw e; }
      return send(res, 200, { ok: true, name: cleanText(body.name, 80), demo: true });
    }
    const scan = process.env.ANTHROPIC_API_KEY ? (images) => scanCard({ images: images.map((i) => ({ media_type: i.source.media_type, data: i.source.data })) }) : null;
    const out = await receiveLead(body, { db: ownerDb(admin), ip: clientIp(req), scan });
    return send(res, 200, out);
  } catch (e) {
    return sendError(res, e);
  }
}
