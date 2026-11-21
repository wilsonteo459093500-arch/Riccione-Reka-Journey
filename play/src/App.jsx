import { useEffect, useMemo, useState } from 'react';
import { LangContext } from './lib/i18n.js';
import { usePath, match, navigate } from './lib/router.js';
import { load, save } from './lib/storage.js';
import { makeRng, roomCode, normalizeRoomCode } from './lib/rng.js';
import { myPid, getName, addMyRoom, saveHostRoom, loadHostRoom } from './lib/profile.js';
import { createRoom } from './net/room.js';
import { ROOM_GAMES } from './games/registry.js';
import Home from './screens/Home.jsx';
import Room from './screens/Room.jsx';
import MyRoom from './screens/MyRoom.jsx';
import Solo from './games/codebreaker/Solo.jsx';
import { Toaster } from './ui/Toast.jsx';

const SOLO = { codebreaker: Solo };

function NewRoom({ gameId }) {
  useEffect(() => {
    if (!ROOM_GAMES[gameId]) return navigate('/', { replace: true });
    const rng = makeRng();
    let code;
    do code = roomCode(rng);
    while (loadHostRoom(code));
    const room = createRoom({
      code,
      gameId,
      hostPid: myPid(),
      hostName: getName() || '房主',
      now: Date.now(),
      options: load(`opts.${gameId}`, {}),
    });
    saveHostRoom(code, room);
    addMyRoom(code, gameId);
    navigate(`/j/${code}`, { replace: true });
  }, [gameId]);
  return null;
}

function Router() {
  const path = usePath();
  let m;
  if ((m = match(path, '/j/:code'))) {
    const code = normalizeRoomCode(m.code);
    return <Room key={code} code={code} />;
  }
  if ((m = match(path, '/r/:slug'))) return <MyRoom key={m.slug} slug={m.slug} />;
  if ((m = match(path, '/new/:game'))) return <NewRoom gameId={m.game} />;
  if ((m = match(path, '/solo/:game'))) {
    const S = SOLO[m.game];
    if (S) return <S />;
  }
  return <Home />;
}

export default function App() {
  const [lang, setLangState] = useState(() => load('lang', 'zh'));
  const ctx = useMemo(
    () => ({
      lang,
      setLang: (l) => {
        save('lang', l);
        setLangState(l);
      },
    }),
    [lang],
  );
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en';
  }, [lang]);
  return (
    <LangContext.Provider value={ctx}>
      <Router />
      <Toaster />
    </LangContext.Provider>
  );
}
