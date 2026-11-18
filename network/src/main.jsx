import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';

// 离线快取只给 SPACE 本身（公开名片页 card.html 不注册）
registerSW({ immediate: true });

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
