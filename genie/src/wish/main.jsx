// /wish —— 直接打开就是许愿模式（适合加到展厅 iPad 主屏幕）。先轻触一下：浏览器规定声音必须由手指开启。

import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/base.css';
import './wish.css';
import WishShell from './WishShell.jsx';
import Pangie, { Lamp } from '../shared/Pangie.jsx';
import { BRAND, GUIDE } from '../shared/config.js';
import { zen, startWish, wishStartUrl, exitFullscreen } from './start.js';

function WishPage() {
  const [started, setStarted] = useState(false);
  if (!started)
    return (
      <button
        type="button"
        className="ws-splash"
        onClick={() => {
          startWish();
          setStarted(true);
        }}
      >
        <div className="ws-splash-art">
          <Pangie mood="happy" prop="ball" size={170} />
          <Lamp size={220} glow={0.6} />
        </div>
        <p className="ws-splash-eyebrow">{BRAND.app} · 客户许愿模式</p>
        <h1>轻触，开始你的许愿之旅</h1>
        <p className="ws-splash-sub">
          {GUIDE.name}会陪你走过五张牌，再把你心里的家变成 3D。
          <br />
          戴上耳机或调大一点声音 —— 溪水、微风和颂钵会一路陪着你。
        </p>
        <span className="ws-splash-tap">轻触任何地方</span>
      </button>
    );
  return (
    <WishShell
      zen={zen}
      startUrl={wishStartUrl()}
      onExit={async () => {
        await zen.stop(1.5);
        exitFullscreen();
        location.href = './';
      }}
    />
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WishPage />
  </StrictMode>
);
