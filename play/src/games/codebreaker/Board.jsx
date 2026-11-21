// 密码机的板：上面是猜过的，下面是正在填的这一排 + 颜色按钮。
// mode='guess' 猜；mode='set' 出题（没有历史、按钮写「出好了」）
import { useContext, useState } from 'react';
import { Peg, Feedback, PALETTE } from './Peg.jsx';
import { LangContext, useT } from '../../lib/i18n.js';

export function History({ cfg, guesses, size = 30 }) {
  const { lang } = useContext(LangContext);
  if (!guesses?.length) return null;
  return (
    <ol className="cb-history">
      {guesses.map((g, i) => (
        <li key={i} className="cb-row">
          <span className="cb-num">{i + 1}</span>
          <span className="cb-pegs">
            {g.code.map((c, j) => (
              <Peg key={j} c={c} size={size} lang={lang} />
            ))}
          </span>
          <Feedback exact={g.exact} near={g.near} slots={cfg.slots} />
        </li>
      ))}
    </ol>
  );
}

export function CodeInput({ cfg, onSubmit, submitLabel, disabled }) {
  const t = useT();
  const { lang } = useContext(LangContext);
  const empty = () => Array(cfg.slots).fill(-1);
  const [draft, setDraft] = useState(empty);
  const full = draft.every((c) => c >= 0);

  const pick = (c) => {
    const i = draft.indexOf(-1);
    if (i < 0) return;
    if (!cfg.repeat && draft.includes(c)) return;
    const d = [...draft];
    d[i] = c;
    setDraft(d);
  };
  const clearAt = (i) => {
    const d = [...draft];
    d[i] = -1;
    setDraft(d);
  };
  const submit = () => {
    if (!full || disabled) return;
    onSubmit(draft);
    setDraft(empty());
  };

  return (
    <div className="cb-input">
      <div className="cb-draft" role="group">
        {draft.map((c, i) => (
          <button key={i} type="button" className="cb-slot" onClick={() => c >= 0 && clearAt(i)} aria-label={`${i + 1}`}>
            <Peg c={c} size={40} lang={lang} />
          </button>
        ))}
      </div>
      <div className="cb-palette">
        {PALETTE.slice(0, cfg.colors).map((p, c) => {
          const used = !cfg.repeat && draft.includes(c);
          return (
            <button key={c} type="button" className="cb-color" disabled={used || full || disabled} onClick={() => pick(c)}>
              <Peg c={c} size={34} lang={lang} />
            </button>
          );
        })}
      </div>
      <div className="row gap">
        <button type="button" className="btn ghost" onClick={() => setDraft(empty())} disabled={draft.every((c) => c < 0)}>
          {t('cb.clear')}
        </button>
        <button type="button" className="btn primary grow" onClick={submit} disabled={!full || disabled}>
          {submitLabel || t('cb.guess')}
        </button>
      </div>
    </div>
  );
}

export function Secret({ code, size = 34 }) {
  const { lang } = useContext(LangContext);
  if (!code) return null;
  return (
    <span className="cb-pegs">
      {code.map((c, i) => (
        <Peg key={i} c={c} size={size} lang={lang} />
      ))}
    </span>
  );
}
