// Vercel serverless 代理：浏览器 → fal.ai（解决 CORS）。
// 只转发到 fal 官方域名，key 由前端随请求带来、不落盘。

const ALLOWED_HOSTS = ['queue.fal.run', 'fal.run', 'fal.media', 'v2.fal.media', 'v3.fal.media'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  const { key, url, method = 'GET', body } = req.body || {};
  if (!key || !url) {
    res.status(400).json({ error: 'missing key or url' });
    return;
  }

  let target;
  try {
    target = new URL(url);
  } catch {
    res.status(400).json({ error: 'bad url' });
    return;
  }
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.some((h) => target.hostname === h || target.hostname.endsWith(`.${h}`))) {
    res.status(400).json({ error: 'host not allowed' });
    return;
  }

  try {
    const upstream = await fetch(target.toString(), {
      method,
      headers: {
        Authorization: `Key ${key}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const contentType = upstream.headers.get('content-type') || '';
    if (contentType.startsWith('image/')) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.status(200).json({ base64: buf.toString('base64'), contentType });
      return;
    }

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    res.status(upstream.ok ? 200 : upstream.status).json(data);
  } catch (e) {
    res.status(502).json({ error: `代理请求失败：${e.message}` });
  }
}
