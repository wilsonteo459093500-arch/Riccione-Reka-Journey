// /wish —— 直接打开就是客户许愿模式（展厅 iPad 主屏幕上的 WISH 图标，设置见 DEPLOY.md）。
// 开场选「中文开始 / Begin in English」：那一下轻触同时开音乐、全屏、屏幕常亮。结束许愿模式 → 回到入口页。

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/base.css';
import WishMode from './WishMode.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WishMode onExit={() => location.assign('./')} />
  </StrictMode>
);
