import { useContext } from 'react';
import { LangContext, useT } from '../lib/i18n.js';
import { navigate } from '../lib/router.js';

export function LangButton() {
  const { lang, setLang } = useContext(LangContext);
  const t = useT();
  return (
    <button type="button" className="btn tiny ghost" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
      {t('lang.switch')}
    </button>
  );
}

export function TopBar({ title, back, right }) {
  return (
    <header className="topbar">
      {back ? (
        <button type="button" className="btn tiny ghost" onClick={() => navigate(back)} aria-label="back">
          ←
        </button>
      ) : (
        <span />
      )}
      <h1>{title}</h1>
      <div className="row gap-s">
        {right}
        <LangButton />
      </div>
    </header>
  );
}
