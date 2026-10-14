import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// 四个入口，各自独立打包：许愿之旅（轻，没有 three.js）、3D 工作室、许愿模式外壳、入口页互不拖累。
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        quiz: resolve(import.meta.dirname, 'quiz.html'),
        studio: resolve(import.meta.dirname, 'studio.html'),
        wish: resolve(import.meta.dirname, 'wish.html'),
      },
    },
    chunkSizeWarningLimit: 1400,
  },
});
