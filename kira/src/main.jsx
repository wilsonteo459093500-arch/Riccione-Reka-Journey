import React from 'react';
import ReactDOM from 'react-dom/client';
import QuoteApp from './components/quote/QuoteApp.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QuoteApp />
  </React.StrictMode>
);

// 离线 Service Worker：只在正式构建里注册（dev 不注册，避免缓存开发中的文件）。
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
