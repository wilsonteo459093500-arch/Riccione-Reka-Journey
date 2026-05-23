import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { storage } from '../services/storage.js';
import { KEY_LANG } from '../constants/storage.js';
import { I18N } from './translations.js';

const LangContext = createContext({ lang: 'cn', setLang: () => {}, t: (k) => k });

export function LangProvider({ children }) {
  const [lang, setLangState] = useState('cn');

  useEffect(() => {
    storage.get(KEY_LANG).then((v) => {
      if (v === 'en' || v === 'cn') setLangState(v);
    }).catch(() => {});
  }, []);

  const setLang = useCallback((l) => {
    setLangState(l);
    storage.set(KEY_LANG, l).catch(() => {});
  }, []);

  const t = useCallback(
    (key) => (I18N[lang] && I18N[lang][key]) || I18N.cn[key] || key,
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT() {
  return useContext(LangContext);
}
