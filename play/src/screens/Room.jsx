// /j/房号：房主和加入的人都用这一页。
// 这支手机存着这个房间的状态 → 它是房主；不然就是加入的人。
import { useEffect, useMemo, useRef, useState } from 'react';
import { RoomHost } from '../net/host.js';
import { RoomClient } from '../net/client.js';
import { createTransport } from '../net/transport.js';
import { announceHome } from '../net/home.js';
import { myPid, getName, setName, getSlug, loadHostRoom, saveHostRoom, removeMyRoom } from '../lib/profile.js';
import { absoluteUrl, navigate } from '../lib/router.js';
import { useWakeLock } from '../lib/wakelock.js';
import { useT } from '../lib/i18n.js';
import { TopBar } from '../ui/TopBar.jsx';
import { QR } from '../ui/QR.jsx';
import { toast } from '../ui/Toast.jsx';
import { CodebreakerOptions, CodebreakerRoom } from '../games/codebreaker/RoomGame.jsx';
import { cleanName } from '../net/room.js';
import { save } from '../lib/storage.js';

const GAME_UI = {
  codebreaker: { Options: CodebreakerOptions, Play: CodebreakerRoom },
};

function NamePrompt({ onDone }) {
  const t = useT();
  const [name, setN] = useState(getName());
  const go = (e) => {
    e.preventDefault();
    const n = cleanName(name);
    if (n === '?') return;
    setName(n);
    onDone(n);
  };
  return (
    <form className="card stack" onSubmit={go}>
      <h2>{t('name.title')}</h2>
      <input className="input" autoFocus value={name} maxLength={16} onChange={(e) => setN(e.target.value)} placeholder={t('settings.namePh')} />
      <p className="muted small">{t('name.help')}</p>
      <button type="submit" className="btn primary" disabled={!name.trim()}>
        {t('name.go')}
      </button>
    </form>
  );
}

function Waiting() {
  const t = useT();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <section className="card center stack">
      <div className="spinner" aria-hidden />
      <p className="muted">{t('room.status.connecting')}</p>
      {slow ? <p className="muted small">{t('room.notFound')}</p> : null}
    </section>
  );
}

function useRoomConnection(code, name) {
  const [view, setView] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [ended, setEnded] = useState(null); // 'kicked' | 'closed'
  const ref = useRef(null);
  const t = useT();
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!name) return undefined;
    const saved = loadHostRoom(code);
    const transport = createTransport(`room:${code}`);
    let stopHome = null;
    let homeT = null;
    if (saved) {
      // 我是房主
      const host = new RoomHost({
        room: saved,
        transport,
        persist: (room) => {
          saveHostRoom(code, room);
          save(`opts.${room.gameId}`, room.options);
        },
        onView: setView,
        onError: (c) => toast(tRef.current(`err.${c}`)),
      }).start();
      ref.current = { role: 'host', host, act: (a) => host.act(a) };
      setStatus('joined');
      const slug = getSlug();
      if (slug) {
        homeT = createTransport(`home:${slug}`);
        stopHome = announceHome(homeT, () => code);
      }
    } else {
      const client = new RoomClient({
        pid: myPid(),
        name,
        transport,
        onView: setView,
        onEvent: (e) => {
          if (e.type === 'status') setStatus(e.status);
          else if (e.type === 'error') toast(tRef.current(`err.${e.code}`) || e.code);
          else if (e.type === 'kicked' || e.type === 'closed') setEnded(e.type);
        },
      }).start();
      ref.current = { role: 'client', client, act: (a) => client.act(a) };
    }
    const offS = transport.onStatus((s) => saved && setStatus(s === 'online' ? 'joined' : 'offline'));
    return () => {
      offS();
      stopHome?.();
      homeT?.close();
      ref.current?.host?.stop();
      ref.current?.client?.stop();
      transport.close();
      ref.current = null;
    };
  }, [code, name]);

  return { view, status, ended, conn: ref };
}

function Lobby({ view, act, names }) {
  const t = useT();
  const url = absoluteUrl(`/j/${view.code}`);
  const UI = GAME_UI[view.gameId];
  const enough = view.players.length >= view.minPlayers;

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'P.L.A.Y', text: `${t(`game.${view.gameId}`)} · ${view.code}`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast(t('room.copied'));
      }
    } catch {
      /* 取消分享 */
    }
  };

  return (
    <div className="stack">
      <section className="card center stack">
        <span className="muted">{t('room.code')}</span>
        <span className="room-code" data-testid="room-code">
          {view.code}
        </span>
        <QR text={url} size={196} />
        <span className="muted small">{t('room.scan')}</span>
        <button type="button" className="btn ghost" onClick={share}>
          {t('room.share')}
        </button>
      </section>

      <section className="card">
        <h2>{t('room.players', { n: view.players.length, max: view.maxPlayers })}</h2>
        <ul className="players">
          {view.players.map((p) => (
            <li key={p.pid} className="row between">
              <span>
                <span className={`dot ${p.online ? 'on' : 'off'}`} /> {p.name}
                {p.isHost ? <span className="chip tiny">👑 {t('room.host')}</span> : null}
                {p.pid === view.me ? <span className="muted small"> ({t('room.you')})</span> : null}
                {!p.online ? <span className="muted small"> · {t('room.offline')}</span> : null}
              </span>
              {view.isHost && !p.isHost ? (
                <button
                  type="button"
                  className="btn tiny ghost"
                  onClick={() => confirm(t('room.kickConfirm', { name: p.name })) && act({ type: 'kick', pid: p.pid })}
                >
                  {t('room.kick')}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>{t('room.options')}</h2>
        <UI.Options options={view.options} editable={view.isHost} onChange={(o) => act({ type: 'options', options: o })} />
      </section>

      {view.isHost ? (
        <div className="stack sticky-bottom">
          <button type="button" className="btn primary big-btn" disabled={!enough} onClick={() => act({ type: 'start' })} data-testid="start">
            {t('room.start')}
          </button>
          {!enough ? <p className="center muted small">{t('room.needPlayers', { n: view.minPlayers })}</p> : null}
        </div>
      ) : (
        <p className="center muted">{t('room.waitHost')}</p>
      )}
    </div>
  );
}

export default function Room({ code }) {
  const t = useT();
  const isHost = useMemo(() => !!loadHostRoom(code), [code]);
  const [name, setNm] = useState(() => (isHost ? getName() || '?' : getName()));
  const [askName, setAskName] = useState(!isHost && !getName());
  const { view, status, ended, conn } = useRoomConnection(code, askName ? null : name);
  useWakeLock(!!view && !ended);

  const names = useMemo(() => Object.fromEntries((view?.players || []).map((p) => [p.pid, p.name])), [view]);
  const act = (a) => conn.current?.act(a);
  const UI = view ? GAME_UI[view.gameId] : null;

  const leave = () => {
    if (isHost) {
      if (!confirm(t('room.closeConfirm'))) return;
      conn.current?.host?.close();
      removeMyRoom(code);
    } else {
      if (!confirm(t('room.leaveConfirm'))) return;
      conn.current?.client?.leave();
    }
    navigate('/');
  };

  if (ended) {
    return (
      <div className="page">
        <TopBar title="P.L.A.Y" back="/" />
        <section className="card center stack">
          <p className="big">{t(ended === 'kicked' ? 'room.kicked' : 'room.closed')}</p>
          <button type="button" className="btn primary" onClick={() => navigate('/')}>
            {t('room.goHome')}
          </button>
        </section>
      </div>
    );
  }

  const title = view ? `${t(`game.${view.gameId}`)} · ${code}` : code;
  return (
    <div className="page">
      <TopBar
        title={title}
        back="/"
        right={
          <button type="button" className="btn tiny ghost" onClick={leave}>
            {isHost ? t('room.close') : t('room.leave')}
          </button>
        }
      />
      {status !== 'joined' && !askName ? <div className={`banner ${status}`}>{t(`room.status.${status}`)}</div> : null}
      {askName ? (
        <NamePrompt
          onDone={(n) => {
            setNm(n);
            setAskName(false);
          }}
        />
      ) : !view ? (
        <Waiting />
      ) : view.phase === 'lobby' || !view.game ? (
        <Lobby view={view} act={act} names={names} />
      ) : (
        <>
          {view.spectator ? <div className="banner">{t('room.spectator')}</div> : null}
          <UI.Play view={view} act={act} names={names} />
          {view.isHost ? (
            view.game.stage !== 'over' ? (
              <button type="button" className="btn tiny ghost" onClick={() => confirm(t('room.toLobbyConfirm')) && act({ type: 'lobby' })}>
                {t('room.toLobby')}
              </button>
            ) : null
          ) : (
            <button type="button" className="btn tiny ghost" onClick={() => setAskName(true)}>
              {t('room.rename')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
