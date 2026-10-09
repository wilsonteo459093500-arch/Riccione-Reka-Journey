// 溪岸 SITE service worker（构建时由 vite.config.js 生成 dist/sw.js，注入版本号与预缓存清单）
//
// - 安装时预缓存整个 App（含 PDF / Word / Excel 引擎）：第一次联网打开后，工地没信号也能打开、填写、导出
// - 页面：网络优先，但 3 秒拿不到就用缓存（信号差时不白屏）；只缓存正常的 HTML（不缓存 404 / 门户登录页）
// - 打包资源（文件名带 hash）：缓存优先
const VERSION = 'site-__VERSION__';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('site-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isHtml = (res) => res && res.ok && !res.redirected && (res.headers.get('content-type') || '').includes('text/html');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cached = await caches.match('/index.html');
        const net = fetch(req).then(async (res) => {
          if (isHtml(res)) {
            // 直接写缓存（3 秒兜底已返回时 respondWith 已结束，不能再 waitUntil）
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put('/index.html', copy)).catch(() => {});
            return res;
          }
          return cached || res;
        });
        if (!cached) return net;
        const slow = new Promise((resolve) => setTimeout(() => resolve(cached), 3000));
        try {
          return await Promise.race([net, slow]);
        } catch {
          return cached;
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              event.waitUntil(caches.open(VERSION).then((c) => c.put(req, copy)));
            }
            return res;
          }),
      ),
    );
  }
});
