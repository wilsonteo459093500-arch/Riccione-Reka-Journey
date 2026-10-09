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
  const raw = String(req.headers['x-host-key'] || '').trim();
  if (!raw) return 'wrong';
  // 主人页会先 encodeURIComponent（标头不收中文）；直接用 curl 送原文也照样认得
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const e = sha(expected);
  return timingSafeEqual(sha(decoded), e) || timingSafeEqual(sha(raw), e) ? 'ok' : 'wrong';
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
