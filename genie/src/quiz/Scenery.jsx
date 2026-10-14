// 潘吉提问背后的风景：铺满整个画面，换段落时淡入淡出（约 1 秒），很慢的推镜（Ken Burns）+ 会飘的雾带。
// 有照片（scenes.js 的 photo）就用照片：srcset 小图 / 大图、每张自己的焦点和遮罩浓度、一层很淡的暖纸色；
// 照片载不到就自动退回 paint.jsx 画的风景。暮色那一张（擦神灯、翻牌、揭晓）才有萤火虫。
// prefers-reduced-motion = 全部静止。样式在 scenery.css（跟着这个组件走：许愿模式的开场也能直接用）。
//
// <Scenery scene="welcome" next="intuition" />                    铺满窗口（position: fixed）
// <Scenery scene="dusk" contained caption={false} />              铺满父元素（position: absolute）
// <SceneImage id="wishes" />                                       只要一张静止的风景（蓝图页头）

import { Component, memo, useEffect, useState } from 'react';
import { SCENES, srcSetOf } from './scenes.js';
import { Painting } from './paint.jsx';
import { L } from '../shared/i18n.js';
import './scenery.css';

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

/** 载不到的照片记下来，这一次打开就不再试（直接用画的） */
const broken = new Set();
const subs = new Set();
const markBroken = (id) => {
  broken.add(id);
  subs.forEach((fn) => fn(id));
};
/** 这一段现在用不用照片（有照片、而且没坏） */
export const usesPhoto = (id) => !!SCENES[id]?.photo && !broken.has(id);
function useBroken() {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    subs.add(fn);
    return () => subs.delete(fn);
  }, []);
}

/** 风景只是背景：画坏了也不能把许愿之旅拖垮 —— 出错就安静地留一块纸色 */
class Safe extends Component {
  constructor(props) {
    super(props);
    this.state = { bad: false };
  }
  static getDerivedStateFromError() {
    return { bad: true };
  }
  componentDidCatch(err) {
    if (import.meta.env?.DEV) console.error('[scenery]', err);
  }
  render() {
    return this.state.bad ? null : this.props.children;
  }
}

function photoVars(s) {
  return {
    '--focus': s.focus || '50% 50%',
    '--focus-p': s.focusPortrait || s.focus || '50% 50%',
    '--sat': s.scrim?.sat ?? 0.9,
    '--wash': s.scrim?.wash ?? 0.1,
    '--scrim-top': s.scrim?.top ?? 0.55,
    '--scrim-bottom': s.scrim?.bottom ?? 0.4,
  };
}

/** 一张风景（照片或画的），铺满父元素。still = 不推镜（蓝图页头、海报素材） */
export function SceneImage({ id, still = false, className = '' }) {
  useBroken();
  const s = SCENES[id] || SCENES.welcome;
  const photo = usesPhoto(s.id);
  return (
    <div className={`sc-layer sc-${s.id} tone-${s.tone} ${photo ? 'has-photo' : ''} ${still ? 'is-still' : ''} ${className}`} style={photo ? photoVars(s) : undefined}>
      {photo ? (
        <div className="sc-grade">
          <img
            className="sc-photo"
            src={s.photo}
            srcSet={srcSetOf(s)}
            sizes="100vw"
            alt=""
            decoding="async"
            style={still ? { animation: 'none' } : undefined}
            onError={() => markBroken(s.id)}
          />
          <i className="sc-wash" />
        </div>
      ) : (
        <div className="sc-kb" style={still ? { animation: 'none', inset: 0 } : undefined}>
          <Safe>
            <Painting id={s.id} className="sc-paint" />
          </Safe>
        </div>
      )}
      {!still && (
        <>
          <i className="sc-mist sc-mist-a" />
          <i className="sc-mist sc-mist-b" />
        </>
      )}
      <i className="sc-scrim" />
      {/* 萤火在遮罩上面、界面下面：照片上也一样亮 */}
      {!still && s.id === 'dusk' && (
        <div className="sc-fireflies">
          {FIREFLIES.map(([x, y, d, t], i) => (
            <i key={i} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${-d}s, ${-d * 1.7}s`, animationDuration: `${t}s, ${t * 0.55}s` }} />
          ))}
        </div>
      )}
    </div>
  );
}

const Layer = memo(function Layer({ id }) {
  return <SceneImage id={id} />;
});

export function SceneCaption({ id }) {
  useBroken();
  const s = SCENES[id];
  if (!s) return null;
  return (
    <figcaption className={`sc-caption tone-${s.tone} ${usesPhoto(id) ? 'on-photo' : ''}`} key={id}>
      <b>{L(s.place)}</b>
      <span>{L(s.area)}</span>
      {s.credit && <em>{s.credit}</em>}
    </figcaption>
  );
}

/** 下一段的照片先载好（同一套 srcset，浏览器会挑同一张） */
function preload(id) {
  const s = SCENES[id];
  if (!s?.photo || broken.has(id) || typeof Image === 'undefined') return;
  const im = new Image();
  im.decoding = 'async';
  im.sizes = '100vw';
  im.srcset = srcSetOf(s);
  im.src = s.photo;
}

export default function Scenery({ scene, next, caption = true, contained = false, className = '' }) {
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

  useEffect(() => {
    if (next && next !== scene) preload(next);
  }, [next, scene]);

  return (
    <div className={`scenery ${contained ? 'is-contained' : ''} ${className}`} aria-hidden="true">
      {layers.map((l, i) => (
        <div key={l.key} className={`sc-slot ${i === layers.length - 1 && l.key ? 'is-entering' : ''}`}>
          <Layer id={l.id} />
        </div>
      ))}
      {caption && <SceneCaption id={scene} />}
    </div>
  );
}
