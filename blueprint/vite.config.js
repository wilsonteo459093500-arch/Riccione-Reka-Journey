import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 每次构建一个版本号：写进程序（__BUILD_ID__）和 dist/version.json。
// 一直开着的旧页面靠它发现「上线了新版」，提示设计师刷新（src/lib/appVersion.js）。
export function versionFile(id) {
  return {
    name: 'ukir-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id, builtAt: new Date().toISOString() }) });
    },
  };
}

export default defineConfig(({ command }) => {
  const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    plugins: [react(), versionFile(buildId)],
    define: { __BUILD_ID__: JSON.stringify(command === 'build' ? buildId : 'dev') },
  };
});
