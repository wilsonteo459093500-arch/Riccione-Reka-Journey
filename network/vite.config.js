import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/* 本机开发也能跑 /api/*（正式环境由 Vercel 跑同一批档案）
   .env.local 放 ANTHROPIC_API_KEY 就能在本机试名片识别 */
function localApi() {
  return {
    name: 'network-local-api',
    configureServer(server) {
      // 公开名片页：/c、/c?e=… → card.html（正式环境由 vercel.json 的 rewrite 做）
      server.middlewares.use((req, _res, next) => {
        const u = req.url || '';
        if (/^\/c(?:\/)?(?:\?.*)?$/.test(u)) req.url = `/card.html${u.includes('?') ? u.slice(u.indexOf('?')) : ''}`;
        next();
      });
      server.middlewares.use(async (req, res, next) => {
        const m = /^\/api\/([a-z][a-z-]*)(?:\?.*)?$/.exec(req.url || '');
        if (!m) return next();
        const file = resolve(server.config.root, 'api', `${m[1]}.js`);
        if (!existsSync(file)) return next();
        try {
          const mod = await server.ssrLoadModule(file);
          await mod.default(req, res);
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'dev_api_error', message: String(e && e.message) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // 服务器用的变数（没有 VITE_ 前缀）也放进 process.env，给本机 /api 用
  const env = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(env)) if (!(k in process.env)) process.env[k] = v;

  return {
    plugins: [
      react(),
      localApi(),
      VitePWA({
        registerType: 'autoUpdate',
        // 不自动塞进每个 html：公开名片页 /c 不要帮访客下载整个 SPACE（src/main.jsx 自己注册）
        injectRegister: false,
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'SPACE — Seek · Profile · Assist · Connect · Evolve',
          short_name: 'SPACE',
          description: 'Give Every Tie Its Space — 只有你看得到的人脉资料库：扫名片、AI 评分、关系记录',
          theme_color: '#F7F5F0',
          background_color: '#F7F5F0',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallback: '/index.html',
          // /c 是给别人看的公开名片页，不要被 SPACE 的 app 接走
          navigateFallbackDenylist: [/^\/api\//, /^\/c(?:[/?#]|$)/, /^\/card\.html/],
        },
      }),
    ],
    define: {
      // 前端显示预算用；跟服务器同一组变数
      'import.meta.env.VITE_AI_MONTHLY_BUDGET_MYR': JSON.stringify(env.AI_MONTHLY_BUDGET_MYR || env.VITE_AI_MONTHLY_BUDGET_MYR || '50'),
      'import.meta.env.VITE_USD_TO_MYR': JSON.stringify(env.USD_TO_MYR || env.VITE_USD_TO_MYR || '4.4'),
    },
    build: {
      rollupOptions: {
        // 两个入口：SPACE app（index.html）+ 公开名片页（card.html，不载 React，打开很快）
        input: { main: resolve(process.cwd(), 'index.html'), card: resolve(process.cwd(), 'card.html') },
      },
    },
    server: { host: true, port: 5176 },
  };
});
