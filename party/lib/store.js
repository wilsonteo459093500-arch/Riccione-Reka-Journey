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

/**
 * 存储是 private 还是 public，由建 store 时决定（README 叫你选 Private）。
 * 没用 PARTY_BLOB_ACCESS 指定的话，先试 private、不行再试 public，
 * 一旦有一次读或写成功就记住，之后只用那一种。
 */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function createBlobStore(sdk, opts = {}) {
  let access = opts.access === 'public' || opts.access === 'private' ? opts.access : null;
  const pinned = Boolean(access);
  const modes = () => (access ? [access] : ['private', 'public']);

  async function putJson(pathname, data) {
    const body = JSON.stringify(data);
    let firstErr;
    for (const a of modes()) {
      try {
        await sdk.put(pathname, body, {
          access: a,
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: 'application/json',
          cacheControlMaxAge: 60
        });
        if (!pinned) access = a;
        return;
      } catch (err) {
        firstErr = firstErr || err;
      }
    }
    throw firstErr;
  }

  /**
   * 读一份 JSON。真的不存在 → null；读不到（网络、5xx）→ 丢错误，不要假装没有这一户。
   * access 还不知道时两种都试：public store 用 private 去读只会是 404/错误，不会报「模式不对」。
   */
  async function getJson(urlOrPathname) {
    let missing = false;
    let firstErr;
    for (const a of modes()) {
      try {
        const res = await sdk.get(urlOrPathname, { access: a, useCache: false });
        if (!res || res.statusCode === 404) {
          missing = true;
          continue;
        }
        if (res.statusCode !== 200) throw new Error(`blob get ${res.statusCode}`);
        if (!pinned) access = a;
        const text = await streamToText(res.stream);
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      } catch (err) {
        firstErr = firstErr || err;
      }
    }
    if (missing) return null;
    throw firstErr;
  }

  // 偶尔一次网络抖动不要让整户消失：重试两次
  async function getJsonRetry(p) {
    for (let i = 0; ; i++) {
      try {
        return await getJson(p);
      } catch (err) {
        if (i >= 2) throw err;
        await wait(200 * 3 ** i);
      }
    }
  }

  // 同时最多读 8 份，免得几十户一起打过去被限流
  async function mapPool(items, n, fn) {
    const out = new Array(items.length);
    let next = 0;
    async function worker() {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
    return out;
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
    // 有任何一户读不到就整个丢错误：宁可主人看到「等一下再刷新」，也不要给一个偏少的人数
    async list() {
      const blobs = await listAll(RSVP_PREFIX);
      const rows = await mapPool(blobs, 8, (b) => getJsonRetry(b.url || b.pathname));
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
