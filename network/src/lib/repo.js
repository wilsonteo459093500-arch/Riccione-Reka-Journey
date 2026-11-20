/* ============================================================
   人脉 App · 资料层
   ------------------------------------------------------------
   画面只碰 repo.*，不直接碰 Supabase / IndexedDB：
     loadAll()                 → { people: [...], companies: [...], ... }
     upsert(table, row)        → row（云端会补上 owner、时间）
     remove(table, id)
     uploadImage(path, blob)   / imageUrl(path) / removeImage(path)
     uploadPublic(path, blob)  / publicUrl(path)   ← 第 4 阶段：公开名片的照片 / 视频（谁都看得到）
   两套实作：
     cloud — Supabase（RLS：只有本人读写；照片在私有 bucket，看图用 1 小时的签名网址）
     local — IndexedDB（没设 Supabase 时；资料只在这个浏览器）
   ============================================================ */
import { supabase, cloudConfigured, BUCKET } from './supabase.js';
import { CARD_BUCKET } from './card.js';

export const TABLES = [
  'profile', 'companies', 'people', 'circles', 'person_circles', 'resources',
  'interactions', 'photos', 'photo_people', 'events', 'attendance', 'ai_usage',
];
// 只写不读（第 3 阶段才画）
export const WRITE_ONLY = ['relationship_snapshots'];

/* =================== 云端 =================== */
function makeCloudRepo() {
  const urlCache = new Map(); // path → { url, exp }

  async function fetchAll(table) {
    const rows = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      let q = supabase.from(table).select('*').range(from, from + page - 1);
      if (table === 'ai_usage') {
        const since = new Date();
        since.setUTCMonth(since.getUTCMonth() - 2, 1);
        q = q.gte('at', since.toISOString());
      }
      const { data, error } = await q;
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...data);
      if (data.length < page) break;
    }
    return rows;
  }

  return {
    mode: 'cloud',
    async loadAll() {
      const out = {};
      await Promise.all(TABLES.map(async (t) => { out[t] = await fetchAll(t); }));
      return out;
    },
    async upsert(table, row) {
      const { owner, ...clean } = row; // owner 由数据库默认 auth.uid() 填，前端不送
      const { data, error } = await supabase.from(table).upsert(clean).select().single();
      if (error) throw new Error(error.message);
      return data;
    },
    async remove(table, id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    /** 没载进画面的表（inbox）：把指向 from 的列改指向 to（合并新朋友用） */
    async reassign(table, col, from, to) {
      const { error } = await supabase.from(table).update({ [col]: to }).eq(col, from);
      if (error) throw new Error(error.message);
    },
    async userId() {
      const { data } = await supabase.auth.getUser();
      return data && data.user ? data.user.id : null;
    },
    async uploadImage(path, blob) {
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
      if (error) throw new Error(error.message);
    },
    async imageUrl(path) {
      const hit = urlCache.get(path);
      if (hit && hit.exp > Date.now()) return hit.url;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (error) throw new Error(error.message);
      urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
      return data.signedUrl;
    },
    async removeImage(path) {
      urlCache.delete(path);
      await supabase.storage.from(BUCKET).remove([path]);
    },
    async uploadPublic(path, blob) {
      const { error } = await supabase.storage.from(CARD_BUCKET).upload(path, blob, { contentType: blob.type || 'application/octet-stream', upsert: true, cacheControl: '31536000' });
      if (error) throw new Error(/bucket not found/i.test(error.message) ? '资料库还没升级：Supabase 重跑一次 schema.sql（见 DEPLOY.md「第 4 阶段升级」）' : error.message);
    },
    publicUrl(path) {
      if (path && path.startsWith('/')) return path; // 网站自带的图（预设名片 /card/…）
      return path ? supabase.storage.from(CARD_BUCKET).getPublicUrl(path).data.publicUrl : '';
    },
    async removePublic(path) {
      if (path) await supabase.storage.from(CARD_BUCKET).remove([path]);
    },
    async accessToken() {
      const { data } = await supabase.auth.getSession();
      return data && data.session ? data.session.access_token : null;
    },
  };
}

/* =================== 本机（IndexedDB） =================== */
const DB_NAME = 'network-app';
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function kv(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', mode);
    const req = fn(tx.objectStore('kv'));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  });
}
const kvGet = (k) => kv('readonly', (s) => s.get(k));
const kvSet = (k, v) => kv('readwrite', (s) => s.put(v, k));
const kvDel = (k) => kv('readwrite', (s) => s.delete(k));

function makeLocalRepo() {
  const LOCAL_OWNER = 'local';
  const tables = {};
  const urls = new Map();
  let loaded = false;

  async function ensure() {
    if (loaded) return;
    for (const t of [...TABLES, ...WRITE_ONLY]) tables[t] = (await kvGet(`t:${t}`)) || [];
    loaded = true;
  }
  const save = (t) => kvSet(`t:${t}`, tables[t]);

  return {
    mode: 'local',
    async loadAll() {
      await ensure();
      return Object.fromEntries(TABLES.map((t) => [t, tables[t].slice()]));
    },
    async upsert(table, row) {
      await ensure();
      const now = new Date().toISOString();
      const list = tables[table];
      const i = list.findIndex((r) => r.id === row.id);
      const next = i >= 0
        ? { ...list[i], ...row, updated_at: now }
        : { created_at: now, ...row, owner: LOCAL_OWNER, updated_at: now };
      if (i >= 0) list[i] = next; else list.push(next);
      await save(table);
      return { ...next };
    },
    async remove(table, id) {
      await ensure();
      tables[table] = tables[table].filter((r) => r.id !== id);
      // 跟 Postgres 的 on delete cascade 一样：删人 / 删照片时连带删关联
      const cascade = {
        people: [['person_circles', 'person_id'], ['resources', 'person_id'], ['interactions', 'person_id'], ['photo_people', 'person_id'], ['attendance', 'person_id'], ['relationship_snapshots', 'person_id']],
        photos: [['photo_people', 'photo_id']],
        circles: [['person_circles', 'circle_id']],
        events: [['attendance', 'event_id']],
      }[table] || [];
      for (const [t, col] of cascade) {
        tables[t] = tables[t].filter((r) => r[col] !== id);
        await save(t);
      }
      if (table === 'companies') {
        for (const p of tables.people) if (p.company_id === id) p.company_id = null;
        await save('people');
      }
      await save(table);
    },
    async reassign(table, col, from, to) {
      await ensure();
      if (!tables[table]) return; // 本机没有 inbox（公开页只在云端收资料）
      for (const r of tables[table]) if (r[col] === from) r[col] = to;
      await save(table);
    },
    async userId() { return LOCAL_OWNER; },
    async uploadImage(path, blob) { await kvSet(`f:${path}`, blob); },
    async imageUrl(path) {
      if (urls.has(path)) return urls.get(path);
      const blob = await kvGet(`f:${path}`);
      if (!blob) return '';
      const u = URL.createObjectURL(blob);
      urls.set(path, u);
      return u;
    },
    async removeImage(path) {
      const u = urls.get(path);
      if (u) URL.revokeObjectURL(u);
      urls.delete(path);
      await kvDel(`f:${path}`);
    },
    // 本机模式没有公开网址：只在这个浏览器预览（公开名片页要接 Supabase 才看得到）
    async uploadPublic(path, blob) { await kvSet(`f:${path}`, blob); urls.delete(path); urls.set(path, URL.createObjectURL(blob)); },
    publicUrl(path) { return path && path.startsWith('/') ? path : urls.get(path) || ''; },
    async removePublic(path) { await kvDel(`f:${path}`); urls.delete(path); },
    async warmPublic(paths) { for (const p of paths) if (p && !urls.has(p)) { const b = await kvGet(`f:${p}`); if (b) urls.set(p, URL.createObjectURL(b)); } },
    async accessToken() { return null; },
  };
}

export const repo = cloudConfigured ? makeCloudRepo() : makeLocalRepo();
