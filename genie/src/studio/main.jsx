import { createRoot } from 'react-dom/client';
import '../shared/base.css';
import './studio.css';
import StudioApp from './StudioApp.jsx';

// 诊断面板：studio.html?diag=1（3D 在某台设备上画不出来时用；在 App 之前装好，才接得到最早的报错）
if (/[?&]diag=1/.test(location.search)) import('./diag.js').then((m) => m.installDiag());

// 不用 StrictMode：WebGL 引擎只该建一次
createRoot(document.getElementById('root')).render(<StudioApp />);
