// 主人专用：完整名单 + 统计。要带 x-host-key（= Vercel 环境变量 PARTY_HOST_KEY）。
//   GET    /api/guests          名单 + 人数 + 饮食统计
//   DELETE /api/guests?id=xxx   删掉一条（测试数据、重复报名）

import { getStore } from '../lib/store.js';
import { isValidId, publicSummary, sortForHost, summarize } from '../lib/rsvp.js';
import { checkHostKey, send, sleep } from '../lib/http.js';

export default async function handler(req, res) {
  const auth = checkHostKey(req);
  if (auth === 'unset') {
    send(res, 503, { error: 'host_key_not_set' });
    return;
  }
  if (auth !== 'ok') {
    await sleep(700); // 只是让单次乱猜慢一点；真正挡住乱猜的是密码本身够不够难猜
    send(res, 401, { error: 'wrong_key' });
    return;
  }

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

  try {
    if (req.method === 'GET') {
      const list = await store.list();
      // 主人每次打开都顺便校正一次公开人数。
      await store.putSummary(publicSummary(list)).catch(() => {});
      send(res, 200, { ok: true, storage: store.kind, guests: sortForHost(list), summary: summarize(list) });
      return;
    }

    if (req.method === 'DELETE') {
      const id = String((req.query && req.query.id) || '');
      if (!isValidId(id)) {
        send(res, 400, { error: 'invalid_id' });
        return;
      }
      await store.remove(id);
      let list;
      try {
        list = await store.list();
      } catch {
        // 已经删掉了，只是重新读名单失败：告诉主人页自己再读一次
        send(res, 200, { ok: true, guests: null });
        return;
      }
      await store.putSummary(publicSummary(list)).catch(() => {});
      send(res, 200, { ok: true, guests: sortForHost(list), summary: summarize(list) });
      return;
    }

    res.setHeader('Allow', 'GET, DELETE');
    send(res, 405, { error: 'method_not_allowed' });
  } catch (e) {
    send(res, 500, { error: 'read_failed' });
  }
}
