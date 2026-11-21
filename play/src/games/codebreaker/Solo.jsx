// 一个人玩（不用网络）
import { useState } from 'react';
import { config, randomCode, score, isSolved, DIFFICULTY_IDS } from './rules.js';
import { CodeInput, History, Secret } from './Board.jsx';
import { makeRng } from '../../lib/rng.js';
import { load, save } from '../../lib/storage.js';
import { useT } from '../../lib/i18n.js';
import { TopBar } from '../../ui/TopBar.jsx';

export function DifficultyPicker({ value, onChange, disabled }) {
  const t = useT();
  return (
    <div className="choices">
      {DIFFICULTY_IDS.map((d) => (
        <button
          key={d}
          type="button"
          className={`choice ${value === d ? 'on' : ''}`}
          onClick={() => onChange(d)}
          disabled={disabled}
          aria-pressed={value === d}
        >
          <b>{t(`cb.diff.${d}`)}</b>
          <small>{t(`cb.diff.${d}.desc`)}</small>
        </button>
      ))}
    </div>
  );
}

function newGame(difficulty) {
  return { difficulty, secret: randomCode(config(difficulty), makeRng()), guesses: [], done: null };
}

export default function Solo() {
  const t = useT();
  const [difficulty, setDifficulty] = useState(() => load('cb.difficulty', 'easy'));
  const [g, setG] = useState(() => newGame(difficulty));
  const cfg = config(g.difficulty);
  const best = load(`cb.best.${g.difficulty}`, null);

  const change = (d) => {
    save('cb.difficulty', d);
    setDifficulty(d);
    setG(newGame(d));
  };

  const guess = (code) => {
    const r = score(g.secret, code);
    const guesses = [...g.guesses, { code, ...r }];
    let done = null;
    if (isSolved(cfg, r)) {
      done = 'win';
      if (!best || guesses.length < best) save(`cb.best.${g.difficulty}`, guesses.length);
    } else if (guesses.length >= cfg.tries) done = 'lose';
    setG({ ...g, guesses, done });
  };

  return (
    <div className="page">
      <TopBar title={t('game.codebreaker')} back="/" />
      <section className="card">
        <DifficultyPicker value={difficulty} onChange={change} />
        <p className="muted small">{t('cb.howto')}</p>
      </section>
      <section className="card cb-board">
        <div className="row between">
          <span className="muted small">{t('cb.legend')}</span>
          {best ? <span className="chip">{t('cb.best', { n: best })}</span> : null}
        </div>
        <History cfg={cfg} guesses={g.guesses} />
        {g.done === null ? (
          <>
            <p className="center muted">{t('cb.tries', { n: cfg.tries - g.guesses.length })}</p>
            <CodeInput key={g.secret.join('')} cfg={cfg} onSubmit={guess} />
          </>
        ) : (
          <div className="cb-done">
            {g.done === 'win' ? (
              <p className="big">🎉 {t('cb.win', { n: g.guesses.length })}</p>
            ) : (
              <p className="big">{t('cb.lose')}</p>
            )}
            <Secret code={g.secret} size={40} />
            <button type="button" className="btn primary" onClick={() => setG(newGame(difficulty))}>
              {t('cb.again')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
