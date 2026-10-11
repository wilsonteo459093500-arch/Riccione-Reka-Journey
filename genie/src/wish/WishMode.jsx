// 客户许愿模式 = 开场（选语言就是开始）→ 外壳（iframe 里走许愿之旅 → 蓝图 → 3D）。
// /wish 和入口页的大按钮都用这一个组件：
//   · primed = 入口页那一下点击已经把音乐、全屏、屏幕常亮开好了（欢迎画面出现时就有声音）；
//   · 没有 primed（/wish 主屏幕图标）：开场上的第一下轻触才开（iOS 只认手指点下去的那一刻）。
// 外壳先在开场下面载入，第一页载好再把开场淡掉 —— 两页是同一片风景，看不出接缝。

import { useCallback, useEffect, useRef, useState } from 'react';
import WishShell from './WishShell.jsx';
import WishSplash from './WishSplash.jsx';
import { zen, startWish, savedHost } from './start.js';
import { t, setLang, useLang } from '../shared/i18n.js';
import './wish.css';

export default function WishMode({ host = savedHost(), primed = false, onExit }) {
  const lang = useLang();
  const [phase, setPhase] = useState('splash'); // splash → starting（外壳在下面载入）→ reveal（开场淡出）→ shell
  const [chosen, setChosen] = useState(null);
  const started = useRef(primed);

  useEffect(() => {
    document.title = t('客户许愿模式 · WISH by Riccione Reka');
  }, [lang]);

  // 第一下轻触：开音乐 + 全屏 + 屏幕常亮；之后再碰只是把被系统暂停的声音接回来
  const ensureMusic = useCallback(() => {
    if (!started.current) {
      started.current = true;
      startWish();
    } else if (!zen.isLive?.()) zen.resume?.();
  }, []);

  const begin = (l) => {
    ensureMusic();
    setLang(l, { reload: false });
    setChosen(l);
    setPhase('starting');
  };

  const ready = useCallback(() => setPhase((p) => (p === 'starting' ? 'reveal' : p)), []);

  useEffect(() => {
    if (phase === 'starting') {
      const id = setTimeout(ready, 8000); // 网络很慢也不要一直挡着
      return () => clearTimeout(id);
    }
    if (phase === 'reveal') {
      const id = setTimeout(() => setPhase('shell'), 950);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [phase, ready]);

  return (
    <>
      {phase !== 'splash' && <WishShell zen={zen} host={host} startLang={chosen} onReady={ready} onExit={onExit} />}
      {phase !== 'shell' && <WishSplash leaving={phase === 'reveal'} busy={phase === 'starting' ? chosen : null} onTap={ensureMusic} onBegin={begin} />}
    </>
  );
}
