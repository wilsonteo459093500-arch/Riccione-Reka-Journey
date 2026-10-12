// 右上角的界面语言切换：中 / EN / 中/EN（一点就换，整个 App 跟着换）
import { useStore } from '../../lib/store.jsx';
import { getUiLang, UI_LANGS } from '../../lib/i18n.js';

export default function LangSwitch({ dark = false }) {
  const store = useStore();
  const value = getUiLang();
  return (
    <div
      className={`flex shrink-0 rounded-full p-0.5 ${dark ? 'bg-white/15' : 'bg-cream-deep'}`}
      role="radiogroup"
      aria-label="界面语言 Language"
      data-lang-switch
    >
      {UI_LANGS.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.label}
            title={o.label}
            className={`min-w-[2rem] rounded-full px-2 py-1 text-[12px] font-bold leading-none transition ${
              on ? (dark ? 'bg-white text-pine' : 'bg-white text-ink shadow-sm') : dark ? 'text-white/75' : 'text-ink-mute'
            }`}
            onClick={() => !on && store.updateSettings({ uiLang: o.v })}
          >
            {o.short}
          </button>
        );
      })}
    </div>
  );
}
