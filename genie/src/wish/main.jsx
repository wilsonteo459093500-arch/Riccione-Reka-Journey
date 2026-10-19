// /wish —— 直接打开就是客户许愿模式（展厅 iPad 主屏幕上的 WISH 图标，设置见 DEPLOY.md）。
// 开场选「中文开始 / Begin in English」：那一下轻触同时开音乐、全屏、屏幕常亮。结束许愿模式 → 回到入口页。

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/base.css';
import WishMode from './WishMode.jsx';
import { installSfx } from '../shared/sfx.js';
import fx from '../shared/fx.js';
import { sweepKept } from '../shared/keep.js';

installSfx({ fx }); // 整页的按钮一按就有声音（WISH 音效，src/shared/sfx.js）；动效的声音也走这里（同一下不响两次）
fx.install(); // 每个按钮按下去都有光：缩一点 + 指尖一圈暖光（src/shared/fx.js；声音交给上面那一行）
sweepKept(); // 过了保留期（CONFIG.keepDays）的客人名单 / 员工记的预算，打开就删（src/shared/keep.js）

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WishMode onExit={() => location.assign('./')} />
  </StrictMode>
);
