import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// 三个入口，各自独立打包：测试页（轻，没有 three.js）与 3D 工作室互不拖累。
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        quiz: resolve(import.meta.dirname, 'quiz.html'),
        studio: resolve(import.meta.dirname, 'studio.html'),
      },
    },
    chunkSizeWarningLimit: 1200,
  },
});
