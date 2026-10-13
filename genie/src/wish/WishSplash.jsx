// 客户许愿模式的开场（/wish）：晨光里的金马伦茶园 —— 和许愿之旅第一页是同一片风景，换页时看不出接缝。
// 选语言就是开始：「中文开始」/「Begin in English」一样大、一样重。第一下轻触（任何地方）同时开音乐（iOS 只认手指）、
// 全屏、屏幕常亮（交给 WishMode 的 onTap）。右上角的「中 / EN」只换这一页的字，不开始。
// 动效（动效 SPEC §6.2）：第一下轻触 = 一圈很大、很慢的光从指尖铺开，神灯亮起来（.5 → .8）；
// 按「开始」= 那一颗被一道光扫过、另一颗淡下去；外壳载好以后，卡片从底下开始化成金色的雾往上飘（不是淡出），
// 露出底下同一片风景里的许愿之旅。潘吉的第一句「来啦来啦！」是从神灯里应声的：神灯跟着她的声音一亮一亮。

import { useEffect, useRef } from 'react';
import { Volume2 } from 'lucide-react';
import Scenery from '../quiz/Scenery.jsx';
import '../quiz/quiz.css';
import { Lamp } from '../shared/Pangie.jsx';
import LangToggle from '../shared/LangToggle.jsx';
import { BRAND } from '../shared/config.js';
import { t, isEn, guideName, setLang } from '../shared/i18n.js';
import fx from '../shared/fx.js';
import { voice, talkState } from '../shared/voice.js';
import { soundSentence } from './sounds.js';

// 大标题：当前语言在上，另一种语言做一行小小的副标（客人还没选语言，两种都要看得懂）
const TITLE = { zh: '许一个家的愿', en: 'Make a wish for your home' };
const GLOW = { rest: 0.5, awake: 0.8 }; // 神灯：等人 → 有人碰过

export default function WishSplash({ leaving = false, busy = null, onTap, onBegin, onGone }) {
  const en = isEn();
  const sub = t('{0}会陪你走过五张牌，再把你心里的家变成 3D。', [guideName()]);
  const root = useRef(null);
  const card = useRef(null);
  const lamp = useRef(null);
  const touched = useRef(false);
  const glow = useRef(GLOW.rest);
  const gone = useRef(onGone);
  gone.current = onGone;

  const lampSvg = () => lamp.current?.querySelector('svg') || null;
  const setGlow = (g) => lampSvg()?.style.setProperty('--glow', g.toFixed(3));

  // 第一下轻触（任何地方）：大大的一圈光 + 神灯醒过来
  const onFirstTouch = (e) => {
    if (touched.current || !root.current) return;
    touched.current = true;
    fx.press(root.current, e, { depth: 1, duration: 900, sound: null, buzz: null });
    const from = glow.current;
    fx.clock.tween({
      duration: 800,
      update: (k) => {
        glow.current = from + (GLOW.awake - from) * k;
        if (talkState.get() !== 'lamp') setGlow(glow.current);
      },
    });
  };

  // 潘吉从神灯里说话（shell.begin「来啦来啦！」）：神灯的光跟着她的声音（不重画 React，直接写 --glow）
  useEffect(() => {
    const offMouth = voice.on('mouth', (v) => {
      if (talkState.get() === 'lamp') setGlow(Math.min(1, glow.current + 0.22 * v));
    });
    const offSpeak = voice.on('speaking', (who) => {
      if (who !== 'lamp') setGlow(glow.current);
    });
    return () => {
      offMouth();
      offSpeak();
    };
  }, []);

  // 外壳载好了：卡片从底下化成金色的雾往上飘；开场整页随后淡掉（CSS：320 ms 后、700 ms），露出同一片风景里的许愿之旅。
  // 两样都走完（动效的时钟）才告诉 WishMode 可以拿掉开场
  useEffect(() => {
    if (!leaving) return undefined;
    let alive = true;
    const el = card.current;
    Promise.all([el ? fx.dissolve(el, { origin: 'bottom', drift: 'up', duration: 760, dust: 1.3, tone: 'photo' }) : null, fx.clock.wait(1040)]).then(() => {
      if (alive) gone.current?.();
    });
    return () => {
      alive = false;
    };
  }, [leaving]);

  // 按下「开始」：那一颗被一道光扫过（声音交给按钮自己的「确认」—— 同一下不响两声）
  const begin = (l, e) => {
    fx.scan(e.currentTarget, { sound: null, delay: 30 });
    onBegin(l);
  };

  return (
    <div ref={root} className={`ws-splash ${leaving ? 'is-leaving' : ''}`} onPointerDown={onFirstTouch} onClick={onTap}>
      <Scenery scene="welcome" next="welcome" />

      <div className="ws-splash-top">
        <LangToggle compact onPick={(l) => setLang(l, { reload: false })} />
      </div>

      <main ref={card} className="ws-card" aria-labelledby="ws-title">
        <div ref={lamp} className="ws-lamp" aria-hidden="true">
          <Lamp size={156} glow={GLOW.rest} smoke />
        </div>
        <div className="ws-lockup">
          <b>{BRAND.app}</b>
          <span>{BRAND.by}</span>
        </div>
        <h1 id="ws-title" className="ws-title">
          {t(TITLE.zh)}
        </h1>
        <p className="ws-title-alt" lang={en ? 'zh-Hans' : 'en'}>
          {en ? TITLE.zh : TITLE.en}
        </p>
        <p className="ws-sub">{sub}</p>
        <p className="ws-sound">
          <Volume2 size={16} strokeWidth={1.8} aria-hidden="true" />
          <span>{soundSentence()}</span>
        </p>
        <div className={`ws-start ${busy ? 'is-busy' : ''}`}>
          <button type="button" className={`ws-go ${busy === 'zh' ? 'is-on' : ''}`} lang="zh-Hans" disabled={!!busy} onClick={(e) => begin('zh', e)}>
            <span>中文开始</span>
          </button>
          <button type="button" className={`ws-go ${busy === 'en' ? 'is-on' : ''}`} lang="en" disabled={!!busy} onClick={(e) => begin('en', e)}>
            <span>Begin in English</span>
          </button>
        </div>
      </main>

      <footer className="ws-splash-foot">
        {BRAND.house} · {BRAND.venue}
      </footer>
    </div>
  );
}
