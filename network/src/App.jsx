import React, { useEffect, useState } from 'react';
import { Users, ScanLine, UserRound, MessagesSquare, Sun, Orbit, HandHelping, QrCode } from 'lucide-react';
import { supabase, cloudConfigured } from './lib/supabase.js';
import { StoreProvider, useStore } from './lib/store.jsx';
import Login, { Logo } from './components/Login.jsx';
import PeopleList from './components/PeopleList.jsx';
import PersonDetail from './components/PersonDetail.jsx';
import ScanCard from './components/ScanCard.jsx';
import Settings from './components/Settings.jsx';
import TalkImport from './components/TalkImport.jsx';
import Today from './components/Today.jsx';
import Galaxy from './components/Galaxy.jsx';
import FindHelp from './components/FindHelp.jsx';
import BriefCard from './components/BriefCard.jsx';
import CardStudio from './components/CardStudio.jsx';
import NewFriends from './components/NewFriends.jsx';
import { ToastProvider, Spinner, cx } from './components/ui.jsx';

/* ---------- 路由：#/today  #/  #/p/<id>  #/p/<id>/brief  #/p/<id>/talk  #/talk  #/scan  #/galaxy  #/find  #/me  #/card  #/inbox ---------- */
function parseHash() {
  const h = window.location.hash.replace(/^#/, '') || '/today'; // 打开 app 先看「今天该找谁」
  const br = /^\/p\/([\w-]+)\/brief$/.exec(h);
  if (br) return { name: 'brief', id: br[1] };
  if (h === '/today') return { name: 'today' };
  if (h === '/galaxy') return { name: 'galaxy' };
  if (h === '/find') return { name: 'find' };
  if (h === '/card') return { name: 'card' };
  if (h === '/inbox') return { name: 'inbox' };
  const t = /^\/p\/([\w-]+)\/talk$/.exec(h);
  if (t) return { name: 'talk', personId: t[1] };
  if (h === '/talk') return { name: 'talk', personId: null };
  const m = /^\/p\/([\w-]+)(\?analyze)?$/.exec(h);
  if (m) return { name: 'person', id: m[1], analyze: !!m[2] };
  if (h === '/scan') return { name: 'scan' };
  if (h === '/me') return { name: 'me' };
  return { name: 'list' };
}
function useRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
const go = (path) => { window.location.hash = path; };

export default function App() {
  const [session, setSession] = useState(cloudConfigured ? undefined : 'local');

  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className="flex h-full items-center justify-center"><Spinner /></div>;

  return (
    <ToastProvider>
      {session ? (
        // 换帐号时整个 store 重建，不会留着上一个人的资料
        <StoreProvider key={session === 'local' ? 'local' : session.user.id}>
          <Shell />
        </StoreProvider>
      ) : (
        <Login />
      )}
    </ToastProvider>
  );
}

function Shell() {
  const route = useRoute();
  const { mode } = useStore();
  const [analyzeId, setAnalyzeId] = useState(null);

  const openPerson = (id) => go(`/p/${id}`);
  const listActive = route.name === 'list' || route.name === 'person';
  // 从哪一页点进人物页的，「返回」就回那一页
  const back = React.useRef('/');
  useEffect(() => {
    if (['today', 'galaxy', 'find', 'list', 'inbox'].includes(route.name)) back.current = route.name === 'list' ? '/' : `/${route.name}`;
  }, [route.name]);
  const fullScreen = ['scan', 'talk', 'brief'].includes(route.name);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* 电脑：左边窄栏导航 */}
      <nav className="hidden w-16 shrink-0 flex-col items-center gap-2 border-r border-line bg-white py-4 lg:flex">
        <Logo className="mb-4 h-9 w-9" />
        <SideBtn icon={Sun} label="今日" active={route.name === 'today'} onClick={() => go('/today')} />
        <SideBtn icon={Users} label="人脉" active={listActive} onClick={() => go('/')} />
        <SideBtn icon={Orbit} label="星系" active={route.name === 'galaxy'} onClick={() => go('/galaxy')} />
        <SideBtn icon={HandHelping} label="找资源" active={route.name === 'find'} onClick={() => go('/find')} />
        <SideBtn icon={ScanLine} label="扫名片" active={route.name === 'scan'} onClick={() => go('/scan')} />
        <SideBtn icon={MessagesSquare} label="记对话" active={route.name === 'talk'} onClick={() => go('/talk')} />
        <SideBtn icon={QrCode} label="名片" active={route.name === 'card'} onClick={() => go('/card')} />
        <SideBtn icon={UserRound} label="我" active={route.name === 'me'} onClick={() => go('/me')} />
      </nav>

      <main className="flex min-h-0 flex-1 flex-col">
        {mode === 'local' && (
          <div className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900">本机模式：资料只存在这个浏览器（还没接 Supabase）</div>
        )}
        {listActive ? (
          <div className="flex min-h-0 flex-1">
            {/* 列表：手机只在 list 显示；电脑一直在左边 */}
            <div className={cx('h-full w-full lg:w-[380px] lg:shrink-0 lg:border-r lg:border-line', route.name === 'person' && 'hidden lg:block')}>
              <PeopleList selectedId={route.id} onOpen={openPerson} onScan={() => go('/scan')} onTalk={() => go('/talk')} onGalaxy={() => go('/galaxy')} onInbox={() => go('/inbox')} />
            </div>
            <div className={cx('h-full min-w-0 flex-1 overflow-y-auto', route.name === 'list' && 'hidden lg:block')}>
              {route.name === 'person' ? (
                <PersonDetail
                  key={route.id}
                  id={route.id}
                  onBack={() => go(back.current)}
                  autoAnalyze={route.analyze || analyzeId === route.id}
                  onAnalyzed={() => { setAnalyzeId(null); if (route.analyze) window.history.replaceState(null, '', `#/p/${route.id}`); }}
                />
              ) : (
                <div className="hidden h-full items-center justify-center text-faint lg:flex">选一个人看详情</div>
              )}
            </div>
          </div>
        ) : route.name === 'galaxy' ? (
          <div className="min-h-0 flex-1 pb-20 lg:pb-0"><Galaxy onOpen={openPerson} /></div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {route.name === 'today' && <Today onOpen={openPerson} onBrief={(id) => go(`/p/${id}/brief`)} onScan={() => go('/scan')} />}
            {route.name === 'find' && <FindHelp onOpen={openPerson} />}
            {route.name === 'brief' && <BriefCard key={route.id} id={route.id} onBack={() => window.history.length > 1 ? window.history.back() : openPerson(route.id)} onTalk={() => go(`/p/${route.id}/talk`)} />}
            {route.name === 'scan' && (
              <ScanCard
                onCancel={() => go('/')}
                onDone={(id, { analyze }) => { if (analyze) setAnalyzeId(id); openPerson(id); }}
              />
            )}
            {route.name === 'talk' && (
              <TalkImport
                key={route.personId || 'any'}
                personId={route.personId}
                onCancel={() => (route.personId ? openPerson(route.personId) : go('/'))}
                onDone={(id) => openPerson(id)}
              />
            )}
            {route.name === 'me' && <Settings onCard={() => go('/card')} />}
            {route.name === 'card' && <CardStudio />}
            {route.name === 'inbox' && <NewFriends onBack={() => go('/')} onOpen={openPerson} onCard={() => go('/card')} />}
          </div>
        )}
      </main>

      {/* 手机：底部导航，中间大按钮扫名片 */}
      {!fullScreen && (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-md items-end justify-around px-2">
            <TabBtn icon={Sun} label="今日" active={route.name === 'today'} onClick={() => go('/today')} />
            <TabBtn icon={Users} label="人脉" active={listActive || route.name === 'galaxy'} onClick={() => go('/')} />
            <button onClick={() => go('/scan')} className="-mt-5 flex flex-col items-center gap-0.5 pb-2" aria-label="扫名片">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-plum text-white shadow-lg shadow-plum/30"><ScanLine className="h-6 w-6" /></span>
              <span className="text-[11px] font-medium text-ink">扫名片</span>
            </button>
            <TabBtn icon={HandHelping} label="找资源" active={route.name === 'find'} onClick={() => go('/find')} />
            <TabBtn icon={UserRound} label="我" active={route.name === 'me' || route.name === 'card'} onClick={() => go('/me')} />
          </div>
        </nav>
      )}
    </div>
  );
}

function TabBtn({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className={cx('flex w-14 flex-col items-center gap-0.5 py-2', active ? 'text-ink' : 'text-faint')}>
      <Icon className="h-6 w-6" />
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  );
}

function SideBtn({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} title={label} className={cx('flex w-12 flex-col items-center gap-0.5 rounded-xl py-2', active ? 'bg-ink text-white' : 'text-muted hover:bg-ink/5')}>
      <Icon className="h-5 w-5" />
      <span className="text-[10px]">{label}</span>
    </button>
  );
}
