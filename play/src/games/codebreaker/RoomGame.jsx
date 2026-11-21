// 密码机的房间画面（比快 / 轮流出题）
import { config } from './rules.js';
import { CodeInput, History, Secret } from './Board.jsx';
import { DifficultyPicker } from './Solo.jsx';
import { MODES } from './game.js';
import { useT } from '../../lib/i18n.js';
import { Check, Cross, Medal, Dots } from '../../ui/pixel.jsx';

/** 大厅里的玩法设定（房主能改，其他人只看） */
export function CodebreakerOptions({ options, editable, onChange }) {
  const t = useT();
  return (
    <div className="stack">
      <div className="choices">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            className={`choice ${options.mode === m ? 'on' : ''}`}
            onClick={() => onChange({ mode: m })}
            disabled={!editable}
            aria-pressed={options.mode === m}
          >
            <b>{t(`cb.mode.${m}`)}</b>
            <small>{t(`cb.mode.${m}.desc`)}</small>
          </button>
        ))}
      </div>
      <DifficultyPicker value={options.difficulty} onChange={(d) => onChange({ difficulty: d })} disabled={!editable} />
    </div>
  );
}

function Progress({ players, names, me, showGuesses, cfg }) {
  const t = useT();
  return (
    <ul className="cb-progress">
      {players
        .filter((p) => p.role === 'guesser')
        .map((p) => (
          <li key={p.pid} className={p.pid === me ? 'me' : ''}>
            <div className="row between">
              <b>{names[p.pid] || '?'}</b>
              <span className="muted small">
                {p.left ? (
                  t('cb.left')
                ) : p.solved ? (
                  <>
                    <Check scale={2} /> {t('cb.solved')}
                  </>
                ) : p.out ? (
                  <>
                    <Cross scale={2} /> {t('cb.out')}
                  </>
                ) : (
                  t('cb.progress', { n: p.tries })
                )}
              </span>
            </div>
            {showGuesses && p.guesses?.length ? <History cfg={cfg} guesses={p.guesses} size={28} /> : null}
          </li>
        ))}
    </ul>
  );
}

function Scores({ players, names }) {
  const t = useT();
  const rows = [...players].sort((a, b) => b.score - a.score);
  return (
    <div className="scores">
      <h3>{t('cb.scores')}</h3>
      <ol>
        {rows.map((p) => (
          <li key={p.pid} className="row between">
            <span>{names[p.pid] || '?'}</span>
            <b>{t('cb.pts', { n: p.score })}</b>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function CodebreakerRoom({ view, act, names }) {
  const t = useT();
  const g = view.game;
  const cfg = config(g.difficulty);
  const me = view.me;
  const setterName = names[g.setterPid] || '?';
  const mine = g.mine;
  const myDone = mine && (mine.solvedAt !== null || mine.out);

  let main;
  if (g.stage === 'setting') {
    main = g.isSetter ? (
      <section className="card">
        <h2>{t('cb.setTitle')}</h2>
        <CodeInput cfg={cfg} submitLabel={t('cb.setGo')} onSubmit={(code) => act({ type: 'set', code })} />
      </section>
    ) : (
      <section className="card center">
        <Dots />
        <p className="big">{t('cb.waitSetter', { name: setterName })}</p>
      </section>
    );
  } else if (g.stage === 'guessing') {
    if (g.isSetter) {
      main = (
        <section className="card">
          <div className="row between">
            <h2>{t('cb.youSet')}</h2>
            <Secret code={g.secret} size={28} />
          </div>
          <h3>{t('cb.watching')}</h3>
          <Progress players={g.players} names={names} me={me} showGuesses cfg={cfg} />
        </section>
      );
    } else if (mine) {
      main = (
        <section className="card cb-board">
          <div className="row between">
            <span className="muted small">{t('cb.legend')}</span>
            <span className="chip">{t('cb.tries', { n: cfg.tries - mine.guesses.length })}</span>
          </div>
          <History cfg={cfg} guesses={mine.guesses} />
          {myDone ? (
            <p className="center big">{mine.solvedAt !== null ? `★ ${t('cb.win', { n: mine.guesses.length })} ★` : t('cb.out')}</p>
          ) : (
            <CodeInput key={mine.guesses.length} cfg={cfg} onSubmit={(code) => act({ type: 'guess', code })} />
          )}
          {myDone ? <p className="center muted">{t('cb.doneWait')}</p> : null}
        </section>
      );
    } else {
      main = <section className="card center muted">{t('room.spectator')}</section>;
    }
  } else {
    // over
    main = (
      <section className="card">
        <h2>{t('cb.results')}</h2>
        {g.secret ? (
          <div className="row between">
            <span>{t('cb.answer')}</span>
            <Secret code={g.secret} size={28} />
          </div>
        ) : (
          <p className="muted">{t('cb.setterLeft')}</p>
        )}
        <ol className="ranking">
          {(g.ranking || []).map((r, i) => (
            <li key={r.pid} className="row between">
              <span className="row gap-s">
                {r.solved ? <Medal place={i} /> : <Cross scale={3} />} {names[r.pid] || '?'}
              </span>
              <span className="muted small">{r.solved ? `${t('cb.progress', { n: r.tries })} · ${Math.round(r.ms / 1000)}s` : t('cb.out')}</span>
            </li>
          ))}
        </ol>
        <Progress players={g.players} names={names} me={me} showGuesses cfg={cfg} />
        {view.isHost ? (
          <div className="row gap">
            <button type="button" className="btn ghost" onClick={() => act({ type: 'lobby' })}>
              {t('room.toLobby')}
            </button>
            <button type="button" className="btn primary grow" onClick={() => act({ type: 'next' })}>
              {t('cb.next')}
            </button>
          </div>
        ) : (
          <p className="center muted">{t('cb.waitNext')}</p>
        )}
      </section>
    );
  }

  return (
    <div className="stack">
      <div className="row between">
        <span className="chip">
          {t('cb.round', { n: g.round })} · {t(`cb.mode.${g.mode}`)} · {t(`cb.diff.${g.difficulty}`)}
        </span>
      </div>
      {main}
      {g.stage === 'guessing' && !g.isSetter ? (
        <section className="card">
          <Progress players={g.players} names={names} me={me} cfg={cfg} />
        </section>
      ) : null}
      <section className="card">
        <Scores players={g.players} names={names} />
      </section>
    </div>
  );
}
