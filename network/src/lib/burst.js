/* ============================================================
   活动连拍（体检第 2 阶段）
   ------------------------------------------------------------
   活动现场：一张接一张拍名片，不用等 AI、不用等网络。
     1. 拍下来 → 先存进手机（IndexedDB，关掉 app、没网络都不会丢）
     2. 有网络 → 照片上传、建一个「新朋友」（名字先写「名片待确认」）、记出席
     3. 自动读名片（Haiku，一张约 RM0.01）→ 补上名字、电话、公司；还是进「新朋友」等你核对
   手机上的那份**只在资料库确定存好之后才删**；中间任何一步失败，下次有网络从头再来。
   每一列的 id 在拍照当下就决定好了，重来只会盖掉同一列，不会多出第二个人。

   这个档案前半是纯函数（有单元测试），后半是 IndexedDB 和同步流程（依赖都从外面传进来，测试换成假的）。
   ============================================================ */
import { uid, pickWhatsApp, digits } from './logic.js';
import { klDate } from './card.js';

export const PLACEHOLDER = '（名片待确认）';
export const UNREAD_NOTE = '名片还没读：在「新朋友」按「AI 读名片」';
export const NOTE_PREFIX = '现场备注：';
export const STAR_TAG = '重要';
export const BURST_TAG = '连拍';
/** 正在拍的时候，刚拍的先留在手机 45 秒，让你有时间加 ⭐、备注、拍背面；按「拍完了」就马上送 */
export const GRACE_MS = 45 * 1000;
/** 拍好、读好的，缩图留 2 天给你看拍过哪些，之后清掉 */
export const KEEP_DONE_MS = 2 * 24 * 3600 * 1000;

const isPlaceholder = (s) => !s || /名片待确认/.test(s);

/* =================== 纯函数 =================== */

/**
 * 一场连拍的设定
 * @param {{event?: {id, name, held_on}|null, newEvent?: {name, held_on}|null, howMet?: string, now?: Date}} o
 */
export function makeSession({ event = null, newEvent = null, howMet = '', now = new Date() } = {}) {
  const today = klDate(now);
  if (event && event.id) {
    return { event_id: event.id, event_name: event.name || '', event_new: false, held_on: event.held_on || today, how_met: event.name || howMet || '' };
  }
  if (newEvent && String(newEvent.name || '').trim()) {
    const name = String(newEvent.name).trim().slice(0, 120);
    return { event_id: uid(), event_name: name, event_new: true, held_on: newEvent.held_on || today, how_met: name };
  }
  return { event_id: null, event_name: '', event_new: false, held_on: today, how_met: String(howMet || '').trim().slice(0, 200) };
}

/** 拍下一张：所有要写进资料库的 id 现在就定好（重来不会多建） */
export function newShot({ session, front, thumb = '', owner = '', now = new Date() }) {
  return {
    id: uid(), // = 这个人的 id
    ids: { front: uid(), back: uid(), ppFront: uid(), ppBack: uid(), interaction: uid(), attendance: uid() },
    owner,
    session: { ...session },
    captured_at: now.toISOString(),
    front, // { data: ArrayBuffer, type, width, height }
    back: null,
    thumb, // 小缩图 data URL（读好、删掉大图之后还看得到拍过哪张）
    star: false,
    note: '',
    saved: false, // 人、照片、出席都进资料库了
    read: false, // AI 读过了（或决定不读）
    done: false, // 手机上的大图可以删了
    read_name: '',
    unread_reason: '', // 没读的原因（预算用完、没开 AI…）
    tries: 0,
    next_at: 0,
    error: '',
  };
}

export function shotTags(item) {
  return [BURST_TAG, ...(item.star ? [STAR_TAG] : [])];
}

export function shotNotes(item, { unread = true } = {}) {
  return [item.note && `${NOTE_PREFIX}${String(item.note).trim()}`, unread && UNREAD_NOTE].filter(Boolean).join('\n');
}

/** 拍下的那张 → 资料库里的一个人（新朋友，等你核对） */
export function personFromShot(item) {
  const s = item.session || {};
  return {
    id: item.id,
    name: PLACEHOLDER,
    name_alt: '',
    title: '',
    phones: [],
    emails: [],
    whatsapp: '',
    tier: 'known',
    affinity: 50,
    interests: [],
    tags: shotTags(item),
    how_met: s.how_met || '',
    met_on: s.held_on || klDate(new Date(item.captured_at)),
    notes: shotNotes(item),
    card_photo_id: item.ids.front,
    pending_review: true,
  };
}

/** 存好之后才改 ⭐ / 备注：直接改那个人（别的栏位不动） */
export function withShotEdits(row, { star, note }) {
  const next = { ...row };
  if (star !== undefined) {
    const tags = (row.tags || []).filter((t) => t !== STAR_TAG);
    next.tags = star ? [...tags, STAR_TAG] : tags;
  }
  if (note !== undefined) {
    const lines = String(row.notes || '').split('\n').filter((l) => !l.startsWith(NOTE_PREFIX));
    const n = String(note || '').trim();
    next.notes = [...(n ? [`${NOTE_PREFIX}${n}`] : []), ...lines].filter((l) => l !== '').join('\n');
  }
  return next;
}

/**
 * AI 读到的名片 → 补进这个人（新朋友「AI 读名片」和连拍共用）
 * 只补空的栏位；名字是「名片待确认」才换；电话末 9 码一样不重复加
 */
export function applyCardRead(row, card, { companyId = null } = {}) {
  const c = card || {};
  const phones = [...(row.phones || [])];
  for (const p of c.phones || []) {
    if (!p || !p.number) continue;
    const k = digits(p.number).slice(-9);
    if (!phones.some((x) => digits(x.number).slice(-9) === k)) phones.push({ label: p.label || 'mobile', number: p.number });
  }
  const socials = [...(row.socials || [])];
  for (const s of c.socials || []) if (s && s.handle && !socials.some((x) => x.platform === s.platform && x.handle === s.handle)) socials.push(s);
  return {
    ...row,
    name: isPlaceholder(row.name) && c.name ? c.name : row.name,
    name_alt: row.name_alt || c.name_alt || '',
    title: row.title || c.title || '',
    company_id: row.company_id || companyId || null,
    phones,
    emails: [...new Set([...(row.emails || []), ...(c.emails || [])].filter(Boolean))],
    whatsapp: row.whatsapp || pickWhatsApp(c.phones || []),
    website: row.website || c.website || '',
    address: row.address || c.address || '',
    socials,
    card_notes: row.card_notes || c.card_notes || '',
    notes: String(row.notes || '').split('\n').filter((l) => l !== UNREAD_NOTE && !/^名片还没读：/.test(l)).join('\n').trim(),
  };
}

/** 画面上的数字 */
export function summarize(items) {
  const s = { total: items.length, phone: 0, saved: 0, read: 0, unread: 0, failing: 0 };
  for (const it of items) {
    if (!it.saved) s.phone += 1;
    else if (it.read && !it.unread_reason) s.read += 1;
    else if (it.read) s.unread += 1;
    else s.saved += 1;
    if (it.error && !it.done) s.failing += 1;
  }
  return s;
}

/** 还要做事的（还没存 / 还没读），而且现在可以做 */
export function dueItems(items, now = Date.now(), { holdUntil = 0 } = {}) {
  return items
    .filter((it) => !it.done && (it.next_at || 0) <= now)
    .filter((it) => !(holdUntil && Date.parse(it.captured_at) > now - GRACE_MS && now < holdUntil))
    .sort((a, b) => String(a.captured_at).localeCompare(String(b.captured_at)));
}

/** 等一下再试：5 秒、10 秒、20 秒 … 最多 5 分钟 */
export function backoffMs(tries) {
  return Math.min(5 * 60 * 1000, 5000 * 2 ** Math.max(0, tries - 1));
}

/** AI 读不了：再试有没有用？（预算用完、没设定 → 不用再试，留给你在「新朋友」按） */
export function readFailure(err) {
  const code = err && err.code;
  const status = err && err.status;
  if (['over_budget', 'ai_not_configured', 'not_owner', 'not_configured'].includes(code)) {
    return { retry: false, reason: code === 'over_budget' ? '这个月的 AI 预算用完了' : 'AI 还没设定好' };
  }
  if (status === 404) return { retry: false, reason: '找不到 AI 服务' };
  if (status === 400 || status === 413) return { retry: false, reason: 'AI 读不了这张照片' };
  return { retry: true, reason: (err && err.message) || '读不了' };
}

/** ArrayBuffer → base64（送 AI 用；浏览器、Node 都能跑） */
export function abToBase64(ab) {
  const bytes = new Uint8Array(ab);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/* =================== 手机上的队列 =================== */

/**
 * @param backend { getAll(): Promise<item[]>, put(item), del(id) }（浏览器用 IndexedDB，测试用记忆体）
 * 写入一个接一个排队，画面改 ⭐ 和同步同时改同一张也不会互相盖掉
 */
export function makeQueue(backend) {
  let chain = Promise.resolve();
  const subs = new Set();
  const serial = (fn) => {
    const p = chain.then(fn);
    chain = p.catch(() => null);
    return p;
  };
  const emit = () => { for (const fn of subs) { try { fn(); } catch { /* 画面的事 */ } } };
  const find = async (id) => (await backend.getAll()).find((x) => x.id === id) || null;
  return {
    list: () => serial(() => backend.getAll()),
    get: (id) => serial(() => find(id)),
    add: (item) => serial(async () => { await backend.put(item); emit(); return item; }),
    /** patch 可以是物件或 (最新的) => 物件；找不到（被删了）回 null */
    update: (id, patch) => serial(async () => {
      const cur = await find(id);
      if (!cur) return null;
      const next = { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) };
      await backend.put(next);
      emit();
      return next;
    }),
    remove: (id) => serial(async () => { await backend.del(id); emit(); }),
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

export function memoryBackend() {
  const m = new Map();
  return {
    async getAll() { return [...m.values()].map((x) => ({ ...x })); },
    async put(item) { m.set(item.id, { ...item }); },
    async del(id) { m.delete(id); },
    _map: m,
  };
}

function idbBackend() {
  const open = () => new Promise((resolve, reject) => {
    const req = indexedDB.open('space-burst', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('shots', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  let dbp = null;
  const db = () => (dbp = dbp || open().catch((e) => { dbp = null; throw e; }));
  const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction('shots', mode);
      const req = fn(t.objectStore('shots'));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('手机空间不够，存不了照片'));
    });
  };
  return {
    getAll: () => tx('readonly', (s) => s.getAll()),
    put: (item) => tx('readwrite', (s) => s.put(item)),
    del: (id) => tx('readwrite', (s) => s.delete(id)),
  };
}

let shared = null;
/** 整个 app 共用一个队列（浏览器才有） */
export function burstQueue() {
  if (!shared) shared = makeQueue(typeof indexedDB !== 'undefined' ? idbBackend() : memoryBackend());
  return shared;
}

/* =================== 同步 =================== */

const blobOf = (img) => (img ? new Blob([img.data], { type: img.type || 'image/jpeg' }) : null);

/**
 * 跑一轮：把可以做的都做一次
 * @param deps {
 *   ownerId(): Promise<string>, put(table,row), uploadImage(path, blob), hasEvent(id),
 *   getPerson(id): row | null(资料库里确定没有＝被你删了) | undefined(资料还没载好，不知道),
 *   scanCard(images) → {card, usage}, logUsage(usage), ensureCompany(name, extra) → company|null,
 *   toBlob(img) → Blob（测试可以换掉）
 * }
 * @returns {{saved, read, failed}}
 */
export async function syncOnce(queue, deps, { now = Date.now(), autoRead = true, holdUntil = 0 } = {}) {
  const out = { saved: 0, read: 0, failed: 0 };
  const all = await queue.list();
  // 清掉放了 2 天的「做完了」
  for (const it of all) if (it.done && now - Date.parse(it.captured_at) > KEEP_DONE_MS) await queue.remove(it.id);
  const owner = await deps.ownerId();
  if (!owner) return out;
  const toBlob = deps.toBlob || blobOf;
  const createdEvents = new Set();

  for (const start of dueItems(all, now, { holdUntil })) {
    if (start.owner && start.owner !== owner) continue; // 别的帐号拍的，不要写进这个帐号
    let item = start;
    try {
      if (!item.saved) {
        await saveShot(item, { deps, owner, toBlob, createdEvents });
        // 存的时候你刚好改了 ⭐ / 备注 / 拍了背面 → 补上
        const latest = await queue.get(item.id);
        if (latest && latest.back && !item.back) await saveBack(latest, { deps, owner, toBlob });
        if (latest && (latest.star !== item.star || latest.note !== item.note)) await deps.put('people', personFromShot(latest));
        item = await queue.update(item.id, { saved: true, tries: 0, next_at: 0, error: '' }) || { ...item, saved: true };
        out.saved += 1;
      }
      if (!item.read) {
        if (!autoRead) {
          item = await queue.update(item.id, { read: true, unread_reason: '没开自动读', done: true, front: null, back: null }) || item;
          continue;
        }
        const row = deps.getPerson(item.id);
        if (row === undefined) continue; // 资料还没载好（例如断网时打开的），下次再读
        if (row === null) { await queue.update(item.id, { read: true, done: true, front: null, back: null, unread_reason: '已经删掉了' }); continue; }
        if (!isPlaceholder(row.name)) { // 你已经自己填好了，不用再花钱读
          await queue.update(item.id, { read: true, done: true, front: null, back: null, read_name: row.name });
          continue;
        }
        let res;
        try {
          const images = [item.front, item.back].filter(Boolean).map((img) => ({ media_type: img.type || 'image/jpeg', data: abToBase64(img.data) }));
          if (!images.length) throw Object.assign(new Error('手机上的照片不见了'), { status: 400 });
          res = await deps.scanCard(images);
        } catch (e) {
          if (e && e.usage) deps.logUsage(e.usage); // AI 回了但没用上：钱照样算
          const f = readFailure(e);
          if (f.retry) throw e;
          await queue.update(item.id, { read: true, done: true, front: null, back: null, unread_reason: f.reason, error: '' });
          continue;
        }
        deps.logUsage(res.usage);
        const card = res.card || {};
        const company = card.company ? await deps.ensureCompany(card.company, { name_alt: card.company_alt, website: card.website, address: card.address, industry: card.industry_guess }) : null;
        const fresh = deps.getPerson(item.id) || row;
        let next = applyCardRead(fresh, card, { companyId: company ? company.id : null });
        if (card.is_business_card === false) next = { ...next, notes: [next.notes, 'AI 说这张看起来不像名片'].filter(Boolean).join('\n') };
        await deps.put('people', next);
        await queue.update(item.id, { read: true, done: true, front: null, back: null, read_name: next.name, error: '' });
        out.read += 1;
      }
    } catch (e) {
      out.failed += 1;
      const tries = (item.tries || 0) + 1;
      await queue.update(item.id, { tries, next_at: now + backoffMs(tries), error: String((e && e.message) || e) });
    }
  }
  return out;
}

async function savePhoto(img, { id, ppId, personId, kind, caption, deps, owner, toBlob }) {
  const path = `${owner}/${id}.jpg`;
  await deps.uploadImage(path, toBlob(img));
  await deps.put('photos', { id, kind, path, width: img.width || null, height: img.height || null, caption, taken_at: new Date().toISOString() });
  await deps.put('photo_people', { id: ppId, photo_id: id, person_id: personId });
}

async function saveBack(item, ctx) {
  await savePhoto(item.back, { ...ctx, id: item.ids.back, ppId: item.ids.ppBack, personId: item.id, kind: 'card', caption: '名片背面' });
}

/** 一张名片写进资料库：活动 → 照片 → 人 → 照片标人 → 互动 → 出席（每一列 id 都是拍照时定好的） */
async function saveShot(item, { deps, owner, toBlob, createdEvents }) {
  const s = item.session || {};
  if (s.event_new && s.event_id && !createdEvents.has(s.event_id) && !deps.hasEvent(s.event_id)) {
    await deps.put('events', { id: s.event_id, name: s.event_name, held_on: s.held_on || null });
    createdEvents.add(s.event_id);
  }
  const ctx = { deps, owner, toBlob };
  // 照片先上传、再建人（people.card_photo_id 指向它）；照片表没有外键，顺序反过来也行
  const path = `${owner}/${item.ids.front}.jpg`;
  await deps.uploadImage(path, toBlob(item.front));
  await deps.put('photos', { id: item.ids.front, kind: 'card', path, width: item.front.width || null, height: item.front.height || null, caption: '名片', taken_at: item.captured_at });
  await deps.put('people', personFromShot(item));
  await deps.put('photo_people', { id: item.ids.ppFront, photo_id: item.ids.front, person_id: item.id });
  if (item.back) await saveBack(item, ctx);
  await deps.put('interactions', {
    id: item.ids.interaction, person_id: item.id, kind: 'card_scan', source: 'card', occurred_at: item.captured_at,
    title: '交换名片', summary: s.how_met || '',
  });
  if (s.event_id) await deps.put('attendance', { id: item.ids.attendance, event_id: s.event_id, person_id: item.id, status: 'attended' });
}

/* =================== 一次只跑一个 =================== */
let running = null;
/** 同一个分页只跑一轮；有 Web Locks 的话，开两个分页也只有一个在跑 */
export function runExclusive(fn) {
  if (running) return running;
  const go = () => fn();
  const p = (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request)
    ? navigator.locks.request('space-burst-sync', { ifAvailable: true }, (lock) => (lock ? go() : null))
    : go();
  running = Promise.resolve(p).finally(() => { running = null; });
  return running;
}
