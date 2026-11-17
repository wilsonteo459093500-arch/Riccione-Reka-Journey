/* ============================================================
   假的 Supabase（测试用；只有案例库用到的那几个 REST 端点）
   真的 HTTP server（127.0.0.1），所以伺服器端的 supabaseAdapter 和浏览器的 <img> 都打得到：
     PostgREST  GET / POST / PATCH /rest/v1/visi_catalog?path=eq.…&rev=eq.…（Prefer: return=representation、
                resolution=merge-duplicates + on_conflict=path）
     Storage    POST   /storage/v1/object/<bucket>/<path>   已经有了 → 400 {statusCode:"409", error:"Duplicate"}（照正式的）
                DELETE /storage/v1/object/<bucket>          body {prefixes:[…]}
                GET    /storage/v1/object/public/<bucket>/<path>（公开，CORS *）
   金钥不对 → 401。测试钩子：failNext(status, n)、setDown(on)、rows、objects、hits
   ============================================================ */
import http from 'node:http';

export const KEY = 'test-service-role-key';

export async function startFakeSupabase(opts) {
  opts = Object.assign({ key: KEY, bucket: 'visi-cases', host: '127.0.0.1' }, opts || {});
  const rows = new Map();     // path → {path, body, rev, updated_at}
  const objects = new Map();  // pathname（bucket 里）→ {body: Buffer, type}
  const hits = { rest: 0, upload: 0, del: 0, publicGet: 0 };
  let fail = { status: 0, n: 0 };
  let down = false;

  const cors = { 'Access-Control-Allow-Origin': '*' };
  function send(res, status, body, headers) {
    const text = body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json' }, cors, headers || {}));
    res.end(text);
  }
  function readBody(req) {
    return new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); });
  }
  // PostgREST 的 eq 过滤
  function filters(u) {
    const f = {};
    for (const [k, v] of u.searchParams) if (k !== 'select' && k !== 'on_conflict' && v.startsWith('eq.')) f[k] = decodeURIComponent(v.slice(3));
    return f;
  }
  const match = (row, f) => Object.keys(f).every((k) => String(row[k]) === f[k]);
  const pick = (row, u) => {
    const sel = u.searchParams.get('select');
    if (!sel) return Object.assign({}, row);
    const out = {};
    sel.split(',').forEach((k) => { out[k] = row[k]; });
    return out;
  };

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;
    if (req.method === 'OPTIONS') return send(res, 204, null, { 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' });
    // 公开的照片：不用金钥
    const pub = '/storage/v1/object/public/' + opts.bucket + '/';
    if (req.method === 'GET' && p.startsWith(pub)) {
      hits.publicGet++;
      const o = objects.get(decodeURIComponent(p.slice(pub.length)));
      if (!o) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      res.writeHead(200, Object.assign({ 'Content-Type': o.type, 'Cache-Control': 'max-age=31536000' }, cors));
      return res.end(o.body);
    }
    if (down) { req.resume(); return send(res, 503, { message: 'down' }); }
    if (req.headers.apikey !== opts.key) { req.resume(); return send(res, 401, { message: 'Invalid API key' }); }
    if (fail.n > 0) { fail.n--; req.resume(); return send(res, fail.status, { message: 'injected ' + fail.status }, fail.status === 429 ? { 'Retry-After': '2' } : null); }
    const body = await readBody(req);

    // ---- PostgREST ----
    if (p === '/rest/v1/visi_catalog') {
      hits.rest++;
      const f = filters(u);
      const prefer = String(req.headers.prefer || '');
      if (req.method === 'GET') return send(res, 200, [...rows.values()].filter((r) => match(r, f)).map((r) => pick(r, u)));
      if (req.method === 'POST') {
        const x = JSON.parse(body.toString('utf8'));
        const exists = rows.has(x.path);
        if (exists && !/merge-duplicates/.test(prefer)) return send(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint "visi_catalog_pkey"' });
        rows.set(x.path, { path: x.path, body: x.body, rev: x.rev == null ? 1 : x.rev, updated_at: x.updated_at || new Date().toISOString() });
        return /return=representation/.test(prefer) ? send(res, 201, [rows.get(x.path)]) : send(res, 201, null);
      }
      if (req.method === 'PATCH') {
        const x = JSON.parse(body.toString('utf8'));
        const hit = [...rows.values()].filter((r) => match(r, f));
        hit.forEach((r) => Object.assign(r, x));
        return /return=representation/.test(prefer) ? send(res, 200, hit) : send(res, 204, null);
      }
      return send(res, 405, { message: 'method' });
    }
    // ---- Storage ----
    const obj = '/storage/v1/object/' + opts.bucket;
    if (p === obj && req.method === 'DELETE') {
      hits.del++;
      const x = JSON.parse(body.toString('utf8') || '{}');
      const gone = [];
      (x.prefixes || []).forEach((k) => { if (objects.delete(k)) gone.push({ name: k }); });
      return send(res, 200, gone);
    }
    if (p.startsWith(obj + '/') && req.method === 'POST') {
      hits.upload++;
      const name = decodeURIComponent(p.slice(obj.length + 1));
      if (objects.has(name) && req.headers['x-upsert'] !== 'true') return send(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      objects.set(name, { body, type: String(req.headers['content-type'] || 'application/octet-stream') });
      return send(res, 200, { Key: opts.bucket + '/' + name });
    }
    return send(res, 404, { message: 'no route ' + req.method + ' ' + p });
  });
  await new Promise((ok) => server.listen(0, opts.host, ok));
  const url = 'http://' + opts.host + ':' + server.address().port;
  return {
    url, key: opts.key, bucket: opts.bucket, rows, objects, hits,
    env: { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: opts.key, SUPABASE_CASES_BUCKET: opts.bucket },
    failNext(status, n) { fail = { status, n: n == null ? 1 : n }; },
    setDown(on) { down = !!on; },
    bytes() { let n = 0; objects.forEach((o) => { n += o.body.length; }); return n; },
    close() { return new Promise((ok) => server.close(() => ok())); }
  };
}
