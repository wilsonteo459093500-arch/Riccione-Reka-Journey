/* ============================================================
   POST /api/inbox   ← 公开名片页（/c）的「留下你的联络方式」
   body: { name, phone, company, title, email, met_where, note,
           consent: true, event?, src?, card_image?: { media_type, data }, turnstile?, fax(陷阱), ms(填表花了几毫秒) }
   回：  { ok: true, name, where }   （不管是新的人还是已经存过的，都回一样的 —— 不让外人试出谁在你的名单里）
   ------------------------------------------------------------
   流程：陷阱 / 太快 → 假装成功 · 同意条款 · 检查栏位 · Turnstile（有设才验）
        → 先占一个名额（inbox 先写一笔再数，同时送 60 次也只进得了上限那么多）
        → 名片照片存私有 bucket → **先把人存好**（一律是新的一个「新朋友」，待确认）→ 互动「扫码留资料」→ 活动出席
        → 最后才让 Haiku 读名片（公开页自己的小额度、最多等 20 秒；读不到人也已经存好了）
   已经存过的人**不会被改**：电话 / 邮箱对得上也一样进「新朋友」，主人在那里看了按「合并」才算。
   不跑「深度分析」（花钱），主人想深入再按。
   ============================================================ */
import { randomUUID } from 'node:crypto';
import { send, sendError, readJson, HttpError, cleanText } from './_lib/http.js';
import { getAdmin, ownerDb, onVercel, clientIp, ipHash } from './_lib/admin.js';
import { cleanImages } from './_lib/ai.js';
import { monthlyBudgetUsd, publicBudgetUsd, monthStartIso } from './_lib/cost.js';
import { scanCard } from './scan-card.js';
import { findCompany } from '../src/lib/logic.js';
import {
  cleanLead, LeadError, fillLeadFromCard, leadToPerson, leadForLog,
  cleanSource, UUID_RE, CONSENT_VERSION, howMet,
} from '../src/lib/card.js';

/**
 * 每小时的上限。活动现场大家可能连同一个 Wi-Fi，所以同 IP 给 20 次；
 * 带名片照片的要存图、要花 AI 钱，另外设低一点。
 */
export const LIMITS = { perIpHour: 20, perIpPhotoHour: 8, allHour: 300, allPhotoHour: 60, minFillMs: 1500, scanMs: 20_000 };

const BUSY = { error: 'too_many', message: '送出太多次了，请稍后再试，或直接 WhatsApp 我' };

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
 * 占名额：先在 inbox 写一笔「pending」，再数这一小时有几笔（包括自己）。
 * 为什么先写再数：同时送进来的每一笔，数的时候至少看得到排在它前面、已经写进去的那些，
 * 所以排第 21 个以后的一定数到 > 20 —— 不会像「先数再写」那样 60 次同时都数到 0。
 * 超过的那笔改成「limited」留着（同 IP 再刷还是算它的），回 429。
 * 「全部加起来」那个上限不算 limited 的 —— 一个人狂刷不会把别人的名额吃掉。
 */
export async function claimSlot(db, { ip, hasPhoto, now, consentAt }) {
  const sinceIso = new Date(now.getTime() - 3600 * 1000).toISOString();
  const row = await db.insert('inbox', {
    at: now.toISOString(), ip_hash: ip, outcome: 'pending', has_photo: hasPhoto, source: 'qr',
    consent_at: consentAt, consent_version: CONSENT_VERSION,
  });
  const [mine, all, minePhoto, allPhoto] = await Promise.all([
    db.countInbox({ sinceIso, ip }),
    db.countInbox({ sinceIso, admitted: true }),
    hasPhoto ? db.countInbox({ sinceIso, ip, photo: true }) : 0,
    hasPhoto ? db.countInbox({ sinceIso, photo: true, admitted: true }) : 0,
  ]);
  const over = mine > LIMITS.perIpHour || all > LIMITS.allHour
    || (hasPhoto && (minePhoto > LIMITS.perIpPhotoHour || allPhoto > LIMITS.allPhotoHour));
  if (over) {
    await db.update('inbox', row.id, { outcome: 'limited' }).catch(() => null);
    throw new HttpError(429, BUSY);
  }
  return row;
}

/** 有没有钱让 AI 读这张名片：公开页自己的小额度 + 整个月的总预算，两个都还有才读 */
async function canScan(db, now) {
  const since = monthStartIso(now);
  const [publicSpent, allSpent] = await Promise.all([db.spentUsd(since, 'inbox_card'), db.spentUsd(since)]);
  return publicSpent < publicBudgetUsd() && allSpent < monthlyBudgetUsd();
}

/** 读名片最多等 ms 毫秒（AI 卡住就放弃，人已经存好了） */
function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('scan_timeout')), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/** 找公司（没有就建一个） */
async function companyFor(db, lead) {
  const name = lead.company;
  if (!name) return null;
  const hit = findCompany(await db.companies(), name);
  if (hit) return hit;
  const x = lead.extra || {};
  return db.insert('companies', { name, name_alt: '', website: x.website || '', address: x.address || '', industry: x.industry_guess || '' });
}

/**
 * 主流程（测试直接叫这个，db / scan 都可以换成假的）
 * @param body  前端送来的
 * @param ctx   { db: ownerDb, ip, now, scan(images) → {card, usage}, fetchImpl, scanMs }
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
  const ip = ipHash(ctx.ip || '');

  // 4) 占名额（并发也绕不过；带照片的另有低上限）
  const slot = await claimSlot(db, { ip, hasPhoto: !!images, now, consentAt: now.toISOString() });

  // 5) 活动（只认主人自己的活动）
  const eventId = UUID_RE.test(String(b.event || '')) ? String(b.event) : '';
  const event = eventId ? await db.event(eventId) : null;
  const source = cleanSource(b.src);

  // 6) 名片照片先存起来（私有 bucket）。存不了：有名字、电话就照样收；只有照片的才算失败
  let photo = null;
  if (images) {
    const id = randomUUID();
    const path = `${db.ownerId}/${id}.jpg`;
    const img = images[0].source;
    try {
      await db.uploadPrivate(path, Buffer.from(img.data, 'base64'), img.media_type);
      photo = await db.insert('photos', { id, kind: 'card', path, caption: '名片（扫码留资料）', taken_at: now.toISOString() });
    } catch (e) {
      if (!lead.name || !lead.phone) throw e;
    }
  }

  // 7) 先把人存好 —— 一律是新的一个、待确认；就算电话 / 邮箱跟已经存过的人一样，也不去改那个人
  const row = leadToPerson(lead, { event, source, now });
  if (photo) {
    row.card_photo_id = photo.id;
    if (!lead.name) row.notes = [row.notes, '名片还没读：在「新朋友」按「AI 读名片」'].filter(Boolean).join('\n');
  }
  const company = await companyFor(db, lead);
  if (company) row.company_id = company.id;
  let person = await db.insert('people', row);
  if (photo) await db.insert('photo_people', { photo_id: photo.id, person_id: person.id });

  // 8) 互动 + 活动出席
  const where = howMet(lead, event);
  await db.insert('interactions', {
    person_id: person.id,
    kind: 'card_scan',
    source: 'qr',
    occurred_at: now.toISOString(),
    title: event ? `扫码留资料 · ${event.name}` : source === 'nfc' ? '碰 NFC 留资料' : source === 'folotoy' ? '扫 FoloToy 留资料' : '扫码留资料',
    summary: [lead.met_where && `在 ${lead.met_where} 认识`, lead.note && `留言：${lead.note}`].filter(Boolean).join('；'),
  });
  if (event) await db.attend(event.id, person.id);

  // 9) 名额那一笔补完整（谁、什么时候、同意了哪一版条款、他填了什么）
  await db.update('inbox', slot.id, {
    event_id: event ? event.id : null, person_id: person.id, outcome: 'created', source, payload: leadForLog(lead),
  });

  // 10) 最后才让 AI 读名片：有额度才读、最多等 20 秒；读不到没关系，主人在「新朋友」再按「AI 读名片」
  if (photo && ctx.scan) {
    try {
      if (await canScan(db, now)) {
        const { card, usage } = await withTimeout(ctx.scan(images), ctx.scanMs || LIMITS.scanMs);
        if (usage) await db.insert('ai_usage', { ...usage, feature: 'inbox_card', at: now.toISOString() }).catch(() => null);
        if (card && card.is_business_card !== false) {
          const read = fillLeadFromCard(lead, card);
          const patch = leadToPerson(read, { event, source, now });
          const fill = { notes: lead.name ? row.notes : String(row.notes || '').replace(/\n?名片还没读：在「新朋友」按「AI 读名片」/, '').trim() };
          for (const k of ['name', 'name_alt', 'title', 'phones', 'emails', 'whatsapp', 'website', 'address', 'socials', 'card_notes']) fill[k] = patch[k];
          if (!company) {
            const c = await companyFor(db, read);
            if (c) fill.company_id = c.id;
          }
          person = await db.update('people', person.id, fill);
          await db.update('inbox', slot.id, { payload: leadForLog(read) }).catch(() => null);
          lead = read;
        }
      }
    } catch { /* AI 读不到 / 太慢就算了 */ }
  }

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
    const scan = process.env.ANTHROPIC_API_KEY ? (images) => scanCard(
      { images: images.map((i) => ({ media_type: i.source.media_type, data: i.source.data })) },
      { requestOptions: { timeout: LIMITS.scanMs, maxRetries: 0 } },
    ) : null;
    const out = await receiveLead(body, { db: ownerDb(admin), ip: clientIp(req), scan });
    return send(res, 200, out);
  } catch (e) {
    return sendError(res, e);
  }
}
