import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/base.css';
import './quiz.css';
import QuizApp from './QuizApp.jsx';
import { installSfx } from '../shared/sfx.js';
import fx from '../shared/fx.js';

installSfx({ fx }); // 整页的按钮一按就有声音（WISH 音效，src/shared/sfx.js）；动效报的声音也走这里（同一下不响两次）
fx.install(); // 整页能按的东西：按下去缩一点 + 指尖的一圈暖光（src/shared/fx.js；声音由上一行负责）

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QuizApp />
  </StrictMode>
);
