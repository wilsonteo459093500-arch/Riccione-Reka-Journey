import { useState } from 'react';
import { CATALOG } from '../games/registry.js';
import { useT } from '../lib/i18n.js';
import { navigate, absoluteUrl } from '../lib/router.js';
import { normalizeRoomCode, isRoomCode } from '../lib/rng.js';
import { myRooms, loadHostRoom, getName, setName, getSlug, setSlug } from '../lib/profile.js';
import { cleanSlug } from '../net/home.js';
import { cleanName } from '../net/room.js';
import { Logo } from '../ui/Logo.jsx';
import { LangButton } from '../ui/TopBar.jsx';
import { QR } from '../ui/QR.jsx';

const ICONS = {
  codebreaker: '🔐',
  ox: '❌',
  camping: '⛺',
  xiangqi: '♟️',
  junqi: '🎖️',
  forest: '🦊',
  story: '🖼️',
  mahjong: '🀄',
  artillery: '💣',
  maze: '🍒',
  brawl: '🥊',
  kart: '🏎️',
};

function Settings({ onClose }) {
  const t = useT();
  const [name, setN] = useState(getName());
  const [slug, setS] = useState(getSlug());
  const url = slug ? absoluteUrl(`/r/${slug}`) : '';
  const done = () => {
    if (name.trim()) setName(cleanName(name));
    setSlug(slug);
    onClose();
  };
  return (
    <section className="card stack" data-testid="settings">
      <h2>{t('settings.title')}</h2>
      <label className="stack-s">
        <span>{t('settings.name')}</span>
        <input className="input" value={name} maxLength={16} onChange={(e) => setN(e.target.value)} placeholder={t('settings.namePh')} />
      </label>
      <label className="stack-s">
        <span>{t('settings.slug')}</span>
        <input className="input" value={slug} maxLength={24} onChange={(e) => setS(cleanSlug(e.target.value))} placeholder={t('settings.slugPh')} />
      </label>
      {slug ? (
        <>
          <p className="muted small pre">{t('settings.slugHelp', { url })}</p>
          <div className="center">
            <QR text={url} size={160} label={t('settings.slugQr')} />
          </div>
        </>
      ) : null}
      <button type="button" className="btn primary" onClick={done}>
        {t('settings.done')}
      </button>
    </section>
  );
}

export default function Home() {
  const t = useT();
  const [code, setCode] = useState('');
  const [bad, setBad] = useState(false);
  const [settings, setSettings] = useState(false);
  const [openGame, setOpenGame] = useState(null);
  const rooms = myRooms().filter((r) => loadHostRoom(r.code));

  const join = (e) => {
    e.preventDefault();
    const c = normalizeRoomCode(code);
    if (!isRoomCode(c)) return setBad(true);
    navigate(`/j/${c}`);
  };

  return (
    <div className="page">
      <header className="home-head">
        <div className="row between">
          <button type="button" className="btn tiny ghost" onClick={() => setSettings((s) => !s)} aria-label={t('home.settings')}>
            ⚙︎ {t('home.settings')}
          </button>
          <LangButton />
        </div>
        <div className="center stack-s">
          <Logo />
          <p className="tagline">{t('app.tagline')}</p>
        </div>
      </header>

      {settings ? <Settings onClose={() => setSettings(false)} /> : null}

      {rooms.length ? (
        <section className="card">
          <h2>{t('home.myRooms')}</h2>
          <ul className="players">
            {rooms.map((r) => (
              <li key={r.code} className="row between">
                <span>
                  {ICONS[r.gameId]} {t(`game.${r.gameId}`)} · <b>{r.code}</b>
                </span>
                <button type="button" className="btn tiny primary" onClick={() => navigate(`/j/${r.code}`)}>
                  {t('home.back')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <form className="card join" onSubmit={join}>
        <h2>{t('home.join')}</h2>
        <div className="row gap">
          <input
            className="input code-input"
            value={code}
            onChange={(e) => {
              setBad(false);
              setCode(normalizeRoomCode(e.target.value));
            }}
            placeholder={t('home.joinPlaceholder')}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            data-testid="join-code"
          />
          <button type="submit" className="btn primary">
            {t('home.joinGo')}
          </button>
        </div>
        {bad ? <p className="error small">{t('home.badCode')}</p> : null}
      </form>

      <h2 className="section-title">{t('home.games')}</h2>
      <div className="games">
        {CATALOG.map((g) => (
          <article key={g.id} className={`game-card ${g.ready ? '' : 'soon'}`} data-game={g.id}>
            <button
              type="button"
              className="game-main"
              disabled={!g.ready}
              onClick={() => setOpenGame(openGame === g.id ? null : g.id)}
              aria-expanded={openGame === g.id}
            >
              <span className="game-icon">{ICONS[g.id]}</span>
              <span className="game-text">
                <b>{t(`game.${g.id}`)}</b>
                <small>{t(`game.${g.id}.desc`)}</small>
              </span>
              <span className="chip tiny">{g.ready ? t('home.players', { n: g.players }) : t('home.soon')}</span>
            </button>
            {openGame === g.id ? (
              <div className="row gap game-actions">
                {g.solo ? (
                  <button type="button" className="btn ghost grow" onClick={() => navigate(`/solo/${g.id}`)}>
                    {t('home.solo')}
                  </button>
                ) : null}
                {g.room ? (
                  <button type="button" className="btn primary grow" onClick={() => navigate(`/new/${g.id}`)} data-testid={`new-${g.id}`}>
                    {t('home.room')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>
      <p className="center muted small">{t('install.hint')}</p>
    </div>
  );
}
