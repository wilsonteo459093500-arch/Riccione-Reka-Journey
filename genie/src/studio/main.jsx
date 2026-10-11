import { createRoot } from 'react-dom/client';
import '../shared/base.css';
import './studio.css';
import StudioApp from './StudioApp.jsx';

// 不用 StrictMode：WebGL 引擎只该建一次
createRoot(document.getElementById('root')).render(<StudioApp />);
