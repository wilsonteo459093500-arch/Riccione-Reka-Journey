// TORA service worker（构建时由 vite.config.js 生成 dist/sw.js，注入版本号与预缓存清单）
//
// - 安装时预缓存整个 App（含 PDF / Word / Excel 引擎）：第一次联网打开后，工地没信号也能打开、填写、导出
// - 安装是整批的：任何一个文件没下载成功就算安装失败，旧版本和它完整的缓存继续用（下次打开再试）
// - 页面：网络优先，但 3 秒拿不到就用缓存（信号差时不白屏）；新发布的版本主程序还没缓存好时先用旧版，
//   新版在后台下载完会自动接管，下次打开就是新版（避免新 HTML 配上没下载完的新 JS 而白屏）
// - 打包资源（文件名带 hash）：缓存优先
const VERSION = 'site-__VERSION__';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
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
        if (!cached) return fetch(req);
        const net = fetch(req).then(async (res) => {
          if (!isHtml(res)) return cached;
          // /index.html 只来自各版本自己的预缓存（和同版本的 JS 配套），这里不写缓存
          const entry = (await res.clone().text()).match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)?.[1];
          if (entry && !(await caches.match(entry))) return cached;
          return res;
        });
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
