// 潘吉提问背后的风景：固定铺满整个画面，换段落时淡入淡出（约 1 秒），很慢的推镜（Ken Burns）+ 会飘的雾带。
// 有真照片（scenes.js 的 photo）就用照片 + 上下渐变遮罩；没有就用 paint.jsx 画的风景。
// 暮色那一张（擦神灯、翻牌、揭晓）才有萤火虫。prefers-reduced-motion = 全部静止。

import { memo, useEffect, useState } from 'react';
import { SCENES } from './scenes.js';
import { Painting } from './paint.jsx';
import { L } from '../shared/i18n.js';

const FIREFLIES = [
  [18, 62, 0, 9],
  [27, 48, 2.1, 11],
  [36, 70, 4.3, 8],
  [58, 58, 1.2, 12],
  [66, 44, 3.4, 10],
  [74, 66, 5.1, 9],
  [83, 52, 0.7, 13],
  [46, 38, 2.8, 11],
  [12, 40, 4.8, 10],
  [90, 70, 1.9, 8],
];

const Layer = memo(function Layer({ id }) {
  const s = SCENES[id] || SCENES.welcome;
  return (
    <div className={`sc-layer sc-${s.id} tone-${s.tone}`}>
      {s.photo ? (
        <img className="sc-photo" src={s.photo} alt="" style={{ objectPosition: s.focus || '50% 50%' }} decoding="async" />
      ) : (
        <div className="sc-kb">
          <Painting id={s.id} className="sc-paint" />
        </div>
      )}
      {!s.photo && (
        <>
          <i className="sc-mist sc-mist-a" />
          <i className="sc-mist sc-mist-b" />
        </>
      )}
      {s.id === 'dusk' && (
        <div className="sc-fireflies">
          {FIREFLIES.map(([x, y, d, t], i) => (
            <i key={i} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${-d}s, ${-d * 1.7}s`, animationDuration: `${t}s, ${t * 0.55}s` }} />
          ))}
        </div>
      )}
      <i className="sc-scrim" />
    </div>
  );
});

export function SceneCaption({ id }) {
  const s = SCENES[id];
  if (!s) return null;
  return (
    <figcaption className={`sc-caption tone-${s.tone}`} key={id}>
      <b>{L(s.place)}</b>
      <span>{L(s.area)}</span>
      {s.credit && <em>{s.credit}</em>}
    </figcaption>
  );
}

export default function Scenery({ scene, next, caption = true }) {
  const [layers, setLayers] = useState(() => [{ id: scene, key: 0 }]);

  useEffect(() => {
    setLayers((ls) => (ls[ls.length - 1].id === scene ? ls : [...ls.slice(-1), { id: scene, key: (ls[ls.length - 1].key || 0) + 1 }]));
  }, [scene]);

  // 淡入完成后，把下面那一层拿掉
  useEffect(() => {
    if (layers.length < 2) return undefined;
    const t = setTimeout(() => setLayers((ls) => ls.slice(-1)), 1200);
    return () => clearTimeout(t);
  }, [layers]);

  // 下一段有照片就先载好
  useEffect(() => {
    const s = SCENES[next];
    if (s?.photo) {
      const im = new Image();
      im.decoding = 'async';
      im.src = s.photo;
    }
  }, [next]);

  return (
    <div className="scenery" aria-hidden="true">
      {layers.map((l, i) => (
        <div key={l.key} className={`sc-slot ${i === layers.length - 1 && l.key ? 'is-entering' : ''}`}>
          <Layer id={l.id} />
        </div>
      ))}
      {caption && <SceneCaption id={scene} />}
    </div>
  );
}
