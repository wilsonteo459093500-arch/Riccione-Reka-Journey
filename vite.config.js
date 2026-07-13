import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// 多页应用：主 app（index.html）+ 独立的预估报价工具（quote.html）。
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        quote: resolve(__dirname, 'quote.html'),
      },
    },
  },
});
