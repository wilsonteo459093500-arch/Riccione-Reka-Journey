/* ============================================================
   RSVP 存哪里
   · 线上：Vercel Blob（在 Vercel 项目里接一个 Blob store 就自动有凭证）
   · 本机开发 / 测试：设 PARTY_STORE_DIR，存成一个个 JSON 档
   · 两个都没有：返回 null，API 回 503，邀请函自动改走 WhatsApp
   每一户是一份独立的档（rsvp/<id>.json），两个人同时提交也不会互相覆盖。
   ============================================================ */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const RSVP_PREFIX = 'rsvp/';
const SUMMARY_PATH = 'meta/summary.json';

export function blobConfigured(env = process.env) {
  return Boolean(env.BLOB_READ_WRITE_TOKEN || env.BLOB_STORE_ID);
}

export async function getStore(env = process.env) {
  if (env.PARTY_STORE_DIR) return createFileStore(env.PARTY_STORE_DIR);
  if (blobConfigured(env)) {
    const sdk = await import('@vercel/blob');
    return createBlobStore(sdk, { access: env.PARTY_BLOB_ACCESS });
  }
  return null;
}

/* ---------------- 本机：一个资料夹 ---------------- */

export function createFileStore(dir) {
  const rsvpDir = path.join(dir, 'rsvp');
  const file = (id) => path.join(rsvpDir, `${id}.json`);

  async function readJson(p) {
    try {
      return JSON.parse(await fs.readFile(p, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }

  return {
    kind: 'file',
    async get(id) {
      return readJson(file(id));
    },
    async put(rsvp) {
      await fs.mkdir(rsvpDir, { recursive: true });
      const tmp = `${file(rsvp.id)}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(rsvp, null, 2));
      await fs.rename(tmp, file(rsvp.id));
    },
    async remove(id) {
      await fs.rm(file(id), { force: true });
    },
    async list() {
      let names = [];
      try {
        names = await fs.readdir(rsvpDir);
      } catch (e) {
        if (e.code === 'ENOENT') return [];
        throw e;
      }
      const rows = await Promise.all(
        names.filter((n) => n.endsWith('.json')).map((n) => readJson(path.join(rsvpDir, n)))
      );
      return rows.filter(Boolean);
    },
    async getSummary() {
      return readJson(path.join(dir, SUMMARY_PATH));
    },
    async putSummary(summary) {
      await fs.mkdir(path.join(dir, 'meta'), { recursive: true });
      await fs.writeFile(path.join(dir, SUMMARY_PATH), JSON.stringify(summary));
    }
  };
}

/* ---------------- 线上：Vercel Blob ---------------- */

async function streamToText(stream) {
  if (!stream) return '';
  return new Response(stream).text();
}

/** 存储是 private 还是 public 由建 store 时决定；没指定就先试 private，被拒再换 public。 */
function looksLikeAccessMismatch(err) {
  const msg = String((err && err.message) || err || '').toLowerCase();
  return msg.includes('access') && (msg.includes('private') || msg.includes('public'));
}

export function createBlobStore(sdk, opts = {}) {
  let access = opts.access === 'public' || opts.access === 'private' ? opts.access : null;
  const pinned = Boolean(access);

  // 只有「写入成功」才记住 access：读一个不存在的档在两种模式下都只是 null，证明不了什么。
  async function withAccess(fn, { learn = false } = {}) {
    const first = access || 'private';
    try {
      const out = await fn(first);
      if (learn) access = first;
      return out;
    } catch (err) {
      if (pinned || !looksLikeAccessMismatch(err)) throw err;
      const second = first === 'private' ? 'public' : 'private';
      const out = await fn(second);
      if (learn) access = second;
      return out;
    }
  }

  async function putJson(pathname, data) {
    const body = JSON.stringify(data);
    await withAccess((a) =>
      sdk.put(pathname, body, {
        access: a,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 60
      }),
      { learn: true }
    );
  }

  async function getJson(urlOrPathname) {
    const res = await withAccess((a) => sdk.get(urlOrPathname, { access: a, useCache: false }));
    if (!res || res.statusCode !== 200) return null;
    const text = await streamToText(res.stream);
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  async function listAll(prefix) {
    const blobs = [];
    let cursor;
    do {
      const page = await sdk.list({ prefix, cursor, limit: 1000 });
      blobs.push(...(page.blobs || []));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return blobs;
  }

  return {
    kind: 'blob',
    get access() {
      return access;
    },
    async get(id) {
      return getJson(`${RSVP_PREFIX}${id}.json`);
    },
    async put(rsvp) {
      await putJson(`${RSVP_PREFIX}${rsvp.id}.json`, rsvp);
    },
    async remove(id) {
      await sdk.del(`${RSVP_PREFIX}${id}.json`);
    },
    async list() {
      const blobs = await listAll(RSVP_PREFIX);
      const rows = await Promise.all(blobs.map((b) => getJson(b.url || b.pathname).catch(() => null)));
      return rows.filter(Boolean);
    },
    async getSummary() {
      return getJson(SUMMARY_PATH).catch(() => null);
    },
    async putSummary(summary) {
      await putJson(SUMMARY_PATH, summary);
    }
  };
}
