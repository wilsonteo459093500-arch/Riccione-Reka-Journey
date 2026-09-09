// RICCIONE 报价 —— 离线 Service Worker
// 策略：
//  · 页面导航（quote.html / index.html）：network-first，离线时回退到缓存（保证换版后有网能拿新版）
//  · 静态资源（Vite 带 hash 的 js/css/图片/字体）：stale-while-revalidate，秒开且后台更新
// 换版只需改 CACHE 版本号即可清掉旧缓存。
const CACHE = 'riccione-v1';
const OFFLINE_FALLBACK = '/quote.html';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['/quote.html', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']).catch(() => {})),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 跨域（如 Google 字体）直接放行

  // 页面导航：先网络后缓存
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req).then((r) => r || caches.match(OFFLINE_FALLBACK))),
    );
    return;
  }

  // 静态资源：缓存优先 + 后台更新
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => { if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
