// KIRA —— 离线 Service Worker（KIRA 自己的网址，和旧报价工具的 SW 互不相干）
// 策略（沿用旧报价工具 sw.js 的做法）：
//  · 页面导航：network-first，离线时回退到缓存的 index.html（离线也能打开、继续报价）
//  · 静态资源（Vite 带 hash 的 js/css/图片/字体）：缓存优先 + 后台更新
// 换版改 CACHE 版本号即可清掉旧缓存。
const CACHE = 'kira-v1';
const SHELL = '/index.html';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['/', SHELL, '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png']).catch(() => {})),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('kira-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 跨域（Supabase / Google 字体 / 产品图）直接放行

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(SHELL, copy)); return res; })
        .catch(() => caches.match(SHELL)),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => { if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
