import { createHash, timingSafeEqual } from 'node:crypto';

export function send(res, status, data) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(data);
}

/** Vercel 会按 Content-Type 解析 JSON；以防万一字符串也接住。 */
export function readBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string' && b.trim()) {
    try {
      return JSON.parse(b);
    } catch {
      return null;
    }
  }
  return {};
}

const sha = (s) => createHash('sha256').update(String(s)).digest();

/**
 * 主人密码放在 Vercel 环境变量 PARTY_HOST_KEY。
 * 返回 'ok' | 'unset' | 'wrong'。
 */
export function checkHostKey(req, env = process.env) {
  const expected = (env.PARTY_HOST_KEY || '').trim();
  if (!expected) return 'unset';
  const given = String(req.headers['x-host-key'] || '').trim();
  if (!given) return 'wrong';
  return timingSafeEqual(sha(given), sha(expected)) ? 'ok' : 'wrong';
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
