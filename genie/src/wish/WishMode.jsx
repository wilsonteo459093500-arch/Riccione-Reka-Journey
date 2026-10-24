// 客户许愿模式 = 开场（选语言就是开始）→ 外壳（iframe 里走许愿之旅 → 蓝图 → 3D）。
// /wish 和入口页的大按钮都用这一个组件：
//   · primed = 入口页那一下点击已经把音乐、全屏、屏幕常亮开好了（欢迎画面出现时就有声音）；
//   · 没有 primed（/wish 主屏幕图标）：开场上的第一下轻触才开（iOS 只认手指点下去的那一刻）。
// 外壳先在开场下面载入，第一页载好再让开场的卡片化成金雾离开 —— 两页是同一片风景，看不出接缝。
// 潘吉的声音（src/shared/voice.js）在这一页说话（外壳活得比每一次 iframe 重新载入都久）：
//   「中文开始 / Begin in English」那一下 = 解锁 iPad 的语音 + 新的一位客人 + 从神灯里应一声「来啦来啦！」，
//   许愿之旅的封面出来后她再打招呼（WishShell 的 greet）。

import { useCallback, useEffect, useRef, useState } from 'react';
import WishShell from './WishShell.jsx';
import WishSplash from './WishSplash.jsx';
import { zen, startWish, savedHost } from './start.js';
import { t, setLang, useLang } from '../shared/i18n.js';
import { sfx } from '../shared/sfx.js';
import { voice } from '../shared/voice.js';
import './wish.css';

const REVEAL_MS = 2600; // 开场离开（卡片化成金雾 760 ms + 整页淡掉 320 + 700 ms，WishSplash 走完就会 onGone）的保险：最多等这么久

export default function WishMode({ host = savedHost(), primed = false, onExit }) {
  const lang = useLang();
  const [phase, setPhase] = useState('splash'); // splash → starting（外壳在下面载入）→ reveal（开场离开）→ shell
  const [chosen, setChosen] = useState(null);
  const started = useRef(primed);

  useEffect(() => {
    document.title = t('客户许愿模式 · WISH by Riccione Reka');
  }, [lang]);

  // 许愿模式里每一位客人都从「有声音」开始：别的页面（单独的许愿之旅）记过的静音不算数；离开时还给入口页
  useEffect(() => {
    voice.init();
    const was = sfx.isMuted();
    sfx.setMuted(false, { persist: false, confirm: false });
    return () => sfx.setMuted(was, { persist: false, confirm: false });
  }, []);

  // 第一下轻触：开音乐 + 全屏 + 屏幕常亮；之后再碰只是把被系统暂停的声音接回来
  const ensureMusic = useCallback(() => {
    if (!started.current) {
      started.current = true;
      startWish();
    } else if (!zen.isLive?.()) zen.resume?.();
  }, []);

  const begin = (l) => {
    ensureMusic();
    // 这一下就在手指里：解锁 iPad 的语音；新的一位客人；她从神灯里应一声（不等外壳载好）
    voice.unlock();
    voice.newGuest();
    voice.setMuted(false);
    voice.say('shell.begin', { lang: l });
    setLang(l, { reload: false });
    setChosen(l);
    setPhase('starting');
  };

  const ready = useCallback(() => setPhase((p) => (p === 'starting' ? 'reveal' : p)), []);
  const gone = useCallback(() => setPhase((p) => (p === 'reveal' ? 'shell' : p)), []);

  useEffect(() => {
    if (phase === 'starting') {
      const id = setTimeout(ready, 8000); // 网络很慢也不要一直挡着
      return () => clearTimeout(id);
    }
    if (phase === 'reveal') {
      const id = setTimeout(gone, REVEAL_MS);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [phase, ready, gone]);

  return (
    <>
      {phase !== 'splash' && <WishShell zen={zen} host={host} startLang={chosen} greet onReady={ready} onExit={onExit} />}
      {phase !== 'shell' && <WishSplash leaving={phase === 'reveal'} busy={phase === 'starting' ? chosen : null} onTap={ensureMusic} onBegin={begin} onGone={gone} />}
    </>
  );
}
