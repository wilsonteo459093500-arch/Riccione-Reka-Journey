#!/usr/bin/env node
// 本机预览：模仿 Vercel 的行为（cleanUrls + /api 函数），RSVP 存进 party/.data/。
//   node scripts/dev.mjs            → http://localhost:8787
//   PORT=9000 node scripts/dev.mjs
//   PARTY_NO_STORE=1 node scripts/dev.mjs   → 模拟「还没接存储」，测 WhatsApp 后备

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8787);

if (process.env.PARTY_NO_STORE) {
  delete process.env.PARTY_STORE_DIR;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;
} else {
  process.env.PARTY_STORE_DIR ||= path.join(ROOT, '.data');
}
process.env.PARTY_HOST_KEY ??= 'dev';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ics': 'text/calendar; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function shim(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
    return res;
  };
  return res;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return undefined;
  if ((req.headers['content-type'] || '').includes('application/json')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

async function serveApi(req, res, url) {
  const name = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  if (!/^[a-z0-9-]+$/.test(name)) return false;
  const file = path.join(ROOT, 'api', `${name}.js`);
  try {
    await fs.access(file);
  } catch {
    return false;
  }
  const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  req.query = Object.fromEntries(url.searchParams);
  req.body = await readBody(req);
  await mod.default(req, shim(res));
  return true;
}

async function serveStatic(res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const candidates = path.extname(p) ? [p] : [p + '.html', p + '/index.html'];
  for (const c of candidates) {
    const file = path.join(ROOT, c);
    if (!file.startsWith(ROOT + path.sep)) break;
    if (/[\\/](\.data|node_modules|test|scripts|lib)[\\/]/.test(file.slice(ROOT.length))) break;
    try {
      const data = await fs.readFile(file);
      res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(data);
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/') && (await serveApi(req, res, url))) return;
    if (await serveStatic(res, url)) return;
    res.statusCode = 404;
    res.end('Not found');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.statusCode = 500;
    res.end('Server error');
  }
});

server.listen(PORT, () => {
  const mode = process.env.PARTY_STORE_DIR ? `存储: ${path.relative(ROOT, process.env.PARTY_STORE_DIR) || '.'}` : '无存储（WhatsApp 后备模式）';
  console.log(`DUDU party → http://localhost:${PORT}   (${mode}, 主人密码: ${process.env.PARTY_HOST_KEY})`);
});
