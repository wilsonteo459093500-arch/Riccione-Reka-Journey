import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// 公共目录里需要离线可用的文件
const PUBLIC_SHELL = ['/', '/index.html', '/sail-logo.png', '/icon.svg', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/apple-touch-icon.png', '/manifest.webmanifest'];

/** 构建时生成 sw.js：注入本次构建的全部文件（预缓存）+ 版本号（文件变了 → 新 SW → 自动更新缓存） */
function serviceWorker() {
  return {
    name: 'site-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => !f.endsWith('.map') && !f.endsWith('.html') && f !== 'sw.js')
        .map((f) => `/${f}`);
      const list = [...PUBLIC_SHELL, ...files];
      const version = createHash('sha256').update(list.join('|')).digest('hex').slice(0, 12);
      const tpl = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: tpl.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(list)),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
