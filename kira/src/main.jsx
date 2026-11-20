import React from 'react';
import ReactDOM from 'react-dom/client';
import QuoteApp from './components/quote/QuoteApp.jsx';
import ErrorBoundary from './components/ui/ErrorBoundary.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* 出错兜底：不白屏，提示重新载入（资料在本机 / 云端都还在） */}
    <ErrorBoundary>
      <QuoteApp />
    </ErrorBoundary>
  </React.StrictMode>
);

// 离线 Service Worker：只在正式构建里注册（dev 不注册，避免缓存开发中的文件）。
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
