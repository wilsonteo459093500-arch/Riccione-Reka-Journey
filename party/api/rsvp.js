// 客人回复 RSVP。
//   POST /api/rsvp   新增或修改自己那一户（同一个 id 再送一次 = 修改）
//   GET  /api/rsvp   公开人数（只有数字，没有名字），邀请函上显示「已有几位确认」用

import { getStore } from '../lib/store.js';
import { normalizeRsvp, publicSummary } from '../lib/rsvp.js';
import { readBody, send } from '../lib/http.js';

export default async function handler(req, res) {
  let store;
  try {
    store = await getStore();
  } catch (e) {
    send(res, 500, { error: 'store_error' });
    return;
  }
  if (!store) {
    send(res, 503, { error: 'not_configured' });
    return;
  }

  if (req.method === 'GET') {
    try {
      let summary = await store.getSummary();
      if (!summary) {
        summary = publicSummary(await store.list());
        await store.putSummary(summary).catch(() => {});
      }
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=60');
      res.status(200).json({ ok: true, ...pick(summary) });
    } catch (e) {
      send(res, 500, { error: 'read_failed' });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    send(res, 405, { error: 'method_not_allowed' });
    return;
  }

  const body = readBody(req);
  if (!body) {
    send(res, 400, { error: 'bad_json' });
    return;
  }

  // 机器人陷阱：真人看不到这个栏位。假装成功，什么都不存。
  if (body.website) {
    send(res, 200, { ok: true });
    return;
  }

  const { value, errors } = normalizeRsvp(body);
  if (errors) {
    send(res, 400, { error: 'invalid', fields: errors });
    return;
  }

  try {
    const existing = await store.get(value.id);
    const now = new Date().toISOString();
    const rsvp = {
      ...value,
      createdAt: (existing && existing.createdAt) || now,
      updatedAt: now,
      edits: existing ? (existing.edits || 0) + 1 : 0
    };
    await store.put(rsvp);

    // 顺手更新公开人数；失败不影响客人。
    let summary = null;
    try {
      summary = publicSummary(await store.list());
      await store.putSummary(summary);
    } catch {
      summary = null;
    }

    send(res, 200, { ok: true, updated: Boolean(existing), rsvp, summary: summary && pick(summary) });
  } catch (e) {
    send(res, 500, { error: 'save_failed' });
  }
}

function pick(s) {
  return { groups: s.groups || 0, adults: s.adults || 0, kids: s.kids || 0, people: s.people || 0 };
}
