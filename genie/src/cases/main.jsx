// 员工 · 案例库（cases.html）的入口。整页的按钮一按就有声音（installSfx）、按下去都有光（fx.install）。
import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/base.css';
import '../quiz/quiz.css';
import './cases.css';
import CaseManager from './CaseManager.jsx';
import { installSfx } from '../shared/sfx.js';
import fx from '../shared/fx.js';

installSfx({ fx });
fx.install();

// 员工 · 案例整理（?staff=1&sorter=1，从案例库的「整理照片文件夹」进来）：单独的 chunk，案例库本身不变重
const q = new URLSearchParams(location.search);
const Sorter = q.get('staff') === '1' && q.get('sorter') === '1' ? lazy(() => import('./sorter/Sorter.jsx')) : null;
// 员工 · 板材（?staff=1&boards=1，从案例库的「板材 · Boards」进来）：板材库 + 板材导入，也是单独的 chunk
const Boards = !Sorter && q.get('staff') === '1' && q.get('boards') === '1' ? lazy(() => import('./boards/BoardsApp.jsx')) : null;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {Sorter ? (
      <Suspense fallback={null}>
        <Sorter />
      </Suspense>
    ) : Boards ? (
      <Suspense fallback={null}>
        <Boards />
      </Suspense>
    ) : (
      <CaseManager />
    )}
  </StrictMode>
);
