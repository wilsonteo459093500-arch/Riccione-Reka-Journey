import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 5173 is the root Delivery OS app, 5174 the CRM — PUMM takes 5175 so all
  // three can run side by side during development.
  server: { host: true, port: 5175 },
});
