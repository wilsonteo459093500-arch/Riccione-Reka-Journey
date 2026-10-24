// 中 / EN 切换（iOS 分段控件的样子）。点了会存到本机并重新载入当前页（进度都会接着来）。
// 许愿模式外壳里用 onPick 自己处理（外壳不能重新载入，音乐会断）。

import { LANGS, getLang, setLang } from './i18n.js';

export default function LangToggle({ className = '', onPick, compact = false }) {
  const cur = getLang();
  return (
    <div className={`lang-toggle ${compact ? 'is-compact' : ''} ${className}`} role="group" aria-label="Language / 语言">
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          className={cur === l.id ? 'on' : ''}
          aria-pressed={cur === l.id}
          lang={l.id === 'en' ? 'en' : 'zh-Hans'}
          onClick={() => {
            if (l.id === cur) return;
            if (onPick) onPick(l.id);
            else setLang(l.id);
          }}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
