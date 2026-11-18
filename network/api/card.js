/* ============================================================
   GET /api/card            → { card, event, inbox, turnstile_site_key }   公开名片页（/c）读这个
   GET /api/card?e=<活动>    → 多回活动名（扫码的人自动记到这个活动）
   GET /api/card?format=vcf → 「存我的联络方式」（text/vcard）
   ------------------------------------------------------------
   不用登入。内容是主人在 SPACE「我的名片」存的 profile.card，只回 cleanCard 认得的栏位。
   CDN 快取 60 秒（改了名片最多 1 分钟就看到），过期的先给、背景再更新 → 打开很快。
   ============================================================ */
import { send, sendError, HttpError } from './_lib/http.js';
import { getAdmin, ownerDb, onVercel } from './_lib/admin.js';
import { DEFAULT_CARD, publicCard, toVCard, vcardFileName, UUID_RE, cleanCard } from '../src/lib/card.js';

function query(req) {
  try { return new URL(req.url || '/', 'http://x').searchParams; } catch { return new URLSearchParams(); }
}

export async function loadCard({ eventId = '', deps = {} } = {}) {
  const admin = await getAdmin(deps);
  if (!admin) {
    if (onVercel()) throw new HttpError(503, { error: 'not_configured', message: '名片还没设定好' });
    // 本机开发：示范名片，表格送出不会真的存
    return { raw: DEFAULT_CARD, card: publicCard(DEFAULT_CARD, ''), event: eventId ? { id: eventId, name: '示范活动', held_on: null, location: '' } : null, inbox: 'demo' };
  }
  const db = deps.db || ownerDb(admin);
  const row = await db.profileCard();
  const raw = row && row.card ? { ...row.card, name: row.card.name || row.display_name } : { ...DEFAULT_CARD, name: (row && row.display_name) || DEFAULT_CARD.name };
  let event = null;
  if (eventId && UUID_RE.test(eventId)) {
    const e = await db.event(eventId);
    if (e) event = { id: e.id, name: e.name, held_on: e.held_on, location: e.location || '' };
  }
  const card = publicCard(raw, admin.url);
  return { raw, card, event, inbox: card.form_on ? 'on' : 'off' };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'GET only' });
  try {
    const q = query(req);
    const { raw, card, event, inbox } = await loadCard({ eventId: q.get('e') || '' });
    if (q.get('format') === 'vcf') {
      const host = req.headers && (req.headers['x-forwarded-host'] || req.headers.host);
      const body = toVCard(cleanCard(raw), { pageUrl: host ? `https://${host}/c` : '' });
      const name = vcardFileName(card);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="contact.vcf"; filename*=UTF-8''${encodeURIComponent(name)}`);
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=600');
      return res.end(body);
    }
    const out = { card, event, inbox, turnstile_site_key: process.env.TURNSTILE_SITE_KEY || '' };
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=600');
    return res.end(JSON.stringify(out));
  } catch (e) {
    return sendError(res, e);
  }
}
