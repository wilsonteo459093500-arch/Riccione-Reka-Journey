// /r/名字：固定网址（FoloToy、贴纸用）→ 找到房主现在开的房间就跳进去
import { useEffect, useState } from 'react';
import { createTransport } from '../net/transport.js';
import { findHome, cleanSlug } from '../net/home.js';
import { isRoomCode } from '../lib/rng.js';
import { navigate } from '../lib/router.js';
import { useT } from '../lib/i18n.js';
import { TopBar } from '../ui/TopBar.jsx';

export default function MyRoom({ slug: raw }) {
  const t = useT();
  const slug = cleanSlug(raw);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    const tr = createTransport(`home:${slug}`);
    const stop = findHome(tr, (code) => isRoomCode(code) && navigate(`/j/${code}`, { replace: true }));
    const timer = setTimeout(() => setWaiting(true), 6000);
    return () => {
      clearTimeout(timer);
      stop();
      tr.close();
    };
  }, [slug]);

  return (
    <div className="page">
      <TopBar title={t('home.findTitle', { slug })} back="/" />
      <section className="card center stack">
        <div className="spinner" aria-hidden />
        <p className="big">{waiting ? t('home.notOpen') : t('home.finding')}</p>
      </section>
    </div>
  );
}
