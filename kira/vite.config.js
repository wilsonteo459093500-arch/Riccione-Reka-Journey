import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// KIRA 独立 app（自己的 Vercel 项目 / 网址）。
// dev 端口 5181：避开旧报价工具常用的 5173（它的 Service Worker 会缓存 5173 上的资源）。
export default defineConfig({
  plugins: [react()],
  server: { port: 5181, strictPort: true },
  preview: { port: 5182, strictPort: true },
});
