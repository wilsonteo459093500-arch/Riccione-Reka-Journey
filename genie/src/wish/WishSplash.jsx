// 客户许愿模式的开场（/wish）：晨光里的金马伦茶园 —— 和许愿之旅第一页是同一片风景，换页时看不出接缝。
// 选语言就是开始：「中文开始」/「Begin in English」一样大、一样重。第一下轻触（任何地方）同时开音乐（iOS 只认手指）、
// 全屏、屏幕常亮（交给 WishMode 的 onTap）。右上角的「中 / EN」只换这一页的字，不开始。

import { Volume2 } from 'lucide-react';
import Scenery from '../quiz/Scenery.jsx';
import '../quiz/quiz.css';
import { Lamp } from '../shared/Pangie.jsx';
import LangToggle from '../shared/LangToggle.jsx';
import { BRAND } from '../shared/config.js';
import { t, isEn, guideName, setLang } from '../shared/i18n.js';
import { soundSentence } from './sounds.js';

// 大标题：当前语言在上，另一种语言做一行小小的副标（客人还没选语言，两种都要看得懂）
const TITLE = { zh: '许一个家的愿', en: 'Make a wish for your home' };

export default function WishSplash({ leaving = false, busy = null, onTap, onBegin }) {
  const en = isEn();
  const sub = t('{0}会陪你走过五张牌，再把你心里的家变成 3D。', [guideName()]);
  return (
    <div className={`ws-splash ${leaving ? 'is-leaving' : ''}`} onClick={onTap}>
      <Scenery scene="welcome" next="welcome" />

      <div className="ws-splash-top">
        <LangToggle compact onPick={(l) => setLang(l, { reload: false })} />
      </div>

      <main className="ws-card" aria-labelledby="ws-title">
        <div className="ws-lamp" aria-hidden="true">
          <Lamp size={156} glow={0.5} />
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
          <button type="button" className={`ws-go ${busy === 'zh' ? 'is-on' : ''}`} lang="zh-Hans" disabled={!!busy} onClick={() => onBegin('zh')}>
            <span>中文开始</span>
          </button>
          <button type="button" className={`ws-go ${busy === 'en' ? 'is-on' : ''}`} lang="en" disabled={!!busy} onClick={() => onBegin('en')}>
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
