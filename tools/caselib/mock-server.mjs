#!/usr/bin/env node
/* ============================================================
   案例库 · 本机 mock server（测试用，不会部署）
   ------------------------------------------------------------
   node tools/caselib/mock-server.mjs --port 0 [--blob-port 0] [--no-cors]
        [--password test-pass] [--seed file.json]
   就绪后在 stdout 印一行 JSON：{"url":"http://127.0.0.1:<port>","blob":"http://127.0.0.1:<blobport>/"}

   - 主 port：静态服务 invite/（cleanUrls：/caselib → caselib.html），
     /api/session|photo|catalog 接「真的」handler，储存换成记忆体 adapter。
     vercel.json 藏起来的路径（package.json、node_modules、api/_lib…）一律 404。
   - blob port：假装是 Blob 的公开网址，照 pathname 给档案；
     默认带 Access-Control-Allow-Origin: *，--no-cors 就不带（测 PPTX 的后备路径）。
     测试钩子也在这个 port（正式的 API 里不存在）：
       GET  /__mock/stats                  → {puts, gets, copies, conflicts, …}
       POST /__mock/failNextPut?n=2        → 接下来 2 次写入失败（500 storage）
       POST /__mock/failNextGet?n=1        → 接下来 1 次读清单失败
       POST /__mock/conflictNext?n=3       → 接下来 3 次写清单冲突（mutate 会重试）
       POST /__mock/down?on=1|0            → 所有 /api/* 回 500（测 VISI 离线快取）
       POST /__mock/blocked?on=1|0         → 假装 store 被停权：API 回 503 storage_blocked，blob port 的档回 403
       POST /__mock/usage?writes=1790      → 把这个月的写入次数改成 N（测额度快用完）
       POST /__mock/ballast?bytes=N        → 加一个隐藏的假项目，一张 sz=N 的照片（测空间快满）
       POST /__mock/resetStats
       GET  /__mock/index                  → 目前完整清单（含项目名，只给测试看）
   - --seed：{index, blobs:{pathname: base64}} 先放进记忆体（VISI 用假案例库测）。
     index.base 一律改成这个 mock 的 blob 网址。
   注意：密码是写进 process.env 的；同一个 process 开两个 mock 请用同一个密码。
   程式里用：import { startMock } from './mock-server.mjs'
     const m = await startMock({ port: 0, cors: true, password: 'test-pass', seed });
     m.url / m.blob / m.adapter.stats() / m.adapter.conflictNext(3) / m.setDown(true) / await m.close()
   ============================================================ */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve, sep, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../invite');
const API = pathToFileURL(join(ROOT, 'api')).href + '/';

// 跟 vercel.json 的 rewrites 一样：这些不能被当成静态档拿到
const HIDDEN = [/^\/package\.json$/i, /^\/package-lock\.json$/i, /^\/node_modules(\/|$)/i, /^\/api\/_lib(\/|$)/i, /^\/tools(\/|$)/i];

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.pdf': 'application/pdf'
};

function listen(server, port, host) {
  return new Promise(function (ok, fail) {
    server.once('error', fail);
    server.listen(port, host, function () { server.off('error', fail); ok(server.address().port); });
  });
}
function json(res, status, body, extra) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra || {}));
  res.end(JSON.stringify(body));
}
function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end('Not found');
}
async function isFile(p) {
  try { return (await stat(p)).isFile(); } catch (e) { return false; }
}

export async function startMock(opts) {
  opts = Object.assign({ port: 0, blobPort: 0, cors: true, password: 'test-pass', seed: null, host: '127.0.0.1' }, opts || {});
  // handler 每次请求都读环境变数：设在这里就好
  process.env.VISI_TEAM_PASSWORD = opts.password;
  if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = 'mock-' + randomBytes(16).toString('hex');

  const blobLib = await import(API + '_lib/blob.js');
  const handlers = {
    session: (await import(API + 'session.js')).default,
    photo: (await import(API + 'photo.js')).default,
    catalog: (await import(API + 'catalog.js')).default
  };
  const state = { down: false, cors: !!opts.cors };
  let adapter = null;

  /* ---------- blob port ---------- */
  const blobServer = http.createServer(async function (req, res) {
    const u = new URL(req.url, 'http://x');
    const cors = state.cors ? { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'ETag, Content-Length' } : {};
    try {
      if (u.pathname.indexOf('/__mock/') === 0) {
        const n = Number(u.searchParams.get('n') || 1);
        const hook = u.pathname.slice(8);
        if (hook === 'stats') return json(res, 200, adapter.stats());
        if (hook === 'failNextPut') { adapter.failNextPut(n); return json(res, 200, { ok: true }); }
        if (hook === 'failNextGet') { adapter.failNextGet(n); return json(res, 200, { ok: true }); }
        if (hook === 'conflictNext') { adapter.conflictNext(n); return json(res, 200, { ok: true }); }
        if (hook === 'resetStats') { adapter.resetStats(); return json(res, 200, { ok: true }); }
        if (hook === 'down') { state.down = u.searchParams.get('on') !== '0'; return json(res, 200, { down: state.down }); }
        if (hook === 'blocked') { adapter.setBlocked(u.searchParams.get('on') !== '0'); return json(res, 200, { blocked: adapter.isBlocked() }); }
        if (hook === 'usage' || hook === 'ballast') {
          const cur = await adapter.getJson(blobLib.indexPath());
          const idx = cur && cur.data ? cur.data : { v: 1, rev: 0, base: blobUrl, projects: {}, photos: {}, log: [] };
          const month = new Date().toISOString().slice(0, 7);
          if (hook === 'usage') {
            idx.usage = idx.usage && typeof idx.usage === 'object' ? idx.usage : {};
            idx.usage[month] = { writes: Math.max(0, Number(u.searchParams.get('writes')) | 0) };
          } else {
            const pid = 'p' + randomBytes(5).toString('hex');
            const h = randomBytes(8).toString('hex');
            idx.projects[pid] = { name: 'mock ballast', area: '', ptype: '', traits: [], style: '', packs: [], n: 1, pb: 0, by: 'mock', ts: Date.now(), hidden: { by: 'mock', ts: Date.now() } };
            idx.photos[h] = { p: pid, k: 'c/' + h + '-ballast.jpg', w: 1200, h: 900, sz: Math.max(0, Number(u.searchParams.get('bytes')) || 0), dh: '0000000000000000', shot: h, f: 'ballast.jpg', room: '', cabinets: [], style: '', hero: false, desc: { zh: '', en: '' }, status: 'new', by: 'mock', ts: Date.now() };
          }
          idx.rev = (idx.rev | 0) + 1;
          await adapter.putJson(blobLib.indexPath(), JSON.stringify(idx), cur ? { ifMatch: cur.etag } : { create: true });
          return json(res, 200, { ok: true, rev: idx.rev });
        }
        if (hook === 'index') {
          const cur = await adapter.getJson(blobLib.indexPath());
          return json(res, 200, cur ? cur.data : null);
        }
        return json(res, 404, { error: 'hook' });
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, state.cors ? Object.assign({ 'Access-Control-Allow-Methods': 'GET, HEAD', 'Access-Control-Allow-Headers': '*', 'Access-Control-Max-Age': '600' }, cors) : {});
        return res.end();
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, cors); return res.end(); }
      let pathname = '';
      try { pathname = decodeURIComponent(u.pathname.slice(1)); } catch (e) { pathname = ''; }
      if (adapter.isBlocked()) { res.writeHead(403, Object.assign({ 'Content-Type': 'text/plain' }, cors)); return res.end('Forbidden'); }
      const b = pathname && adapter.read(pathname);
      if (!b) { res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain' }, cors)); return res.end('Not found'); }
      res.writeHead(200, Object.assign({
        'Content-Type': b.type, 'Content-Length': b.body.length, ETag: b.etag,
        'Cache-Control': 'public, max-age=31536000'
      }, cors));
      res.end(req.method === 'HEAD' ? undefined : b.body);
    } catch (e) {
      json(res, 500, { error: String(e && e.message) });
    }
  });
  const blobPort = await listen(blobServer, opts.blobPort, opts.host);
  const blobUrl = 'http://' + opts.host + ':' + blobPort + '/';
  // 只在这个 mock 的请求里用这个记忆体 adapter（不动全域的 setAdapter）
  adapter = blobLib.memoryAdapter({ base: blobUrl });
  if (opts.seed) {
    const seed = typeof opts.seed === 'string' ? JSON.parse(await readFile(opts.seed, 'utf8')) : opts.seed;
    adapter.seed(seed);
  }

  /* ---------- 主 port：invite/ + /api ---------- */
  const appServer = http.createServer(async function (req, res) {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
    try {
      if (HIDDEN.some(function (re) { return re.test(pathname); })) return notFound(res);
      if (pathname.indexOf('/api/') === 0) {
        if (state.down) return json(res, 500, { error: 'storage', message: 'mock server is down (/__mock/down)' });
        const name = pathname.slice(5);
        if (!Object.prototype.hasOwnProperty.call(handlers, name)) return json(res, 404, { error: 'not_found' });
        return await blobLib.withAdapter(adapter, function () { return handlers[name](req, res); });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
      // trailingSlash:false → /foo/ 转到 /foo
      if (pathname.length > 1 && pathname.slice(-1) === '/') {
        res.writeHead(308, { Location: pathname.replace(/\/+$/, '') || '/' });
        return res.end();
      }
      let file = resolve(ROOT, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (file !== ROOT && file.indexOf(ROOT + sep) !== 0) return notFound(res);
      if (!(await isFile(file))) {
        // cleanUrls：/caselib → caselib.html
        if (await isFile(file + '.html')) file = file + '.html';
        else return notFound(res);
      }
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (e) {
      console.error('[mock]', e && (e.stack || e));
      if (!res.headersSent) json(res, 500, { error: 'mock' });
      else res.end();
    }
  });
  const port = await listen(appServer, opts.port, opts.host);
  const url = 'http://' + opts.host + ':' + port;

  function closeServer(s) {
    return new Promise(function (ok) {
      s.close(function () { ok(); });
      if (s.closeAllConnections) s.closeAllConnections();
    });
  }
  return {
    url: url,
    blob: blobUrl,
    adapter: adapter,
    state: state,
    indexPath: blobLib.indexPath(),
    setDown: function (on) { state.down = !!on; },
    setCors: function (on) { state.cors = !!on; },
    setBlocked: function (on) { adapter.setBlocked(on); },
    close: async function () { await Promise.all([closeServer(appServer), closeServer(blobServer)]); }
  };
}

/* ---------- 命令列 ---------- */
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') o.port = Number(argv[++i]);
    else if (a === '--blob-port') o.blobPort = Number(argv[++i]);
    else if (a === '--no-cors') o.cors = false;
    else if (a === '--password') o.password = argv[++i];
    else if (a === '--seed') o.seed = resolve(argv[++i]);
    else if (a === '--host') o.host = argv[++i];
    else { console.error('unknown option: ' + a); process.exit(2); }
  }
  return o;
}

function isMain() {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch (e) { return false; }
}

if (isMain()) {
  const m = await startMock(parseArgs(process.argv.slice(2)));
  process.stdout.write(JSON.stringify({ url: m.url, blob: m.blob }) + '\n');
  const stop = async function () { await m.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
