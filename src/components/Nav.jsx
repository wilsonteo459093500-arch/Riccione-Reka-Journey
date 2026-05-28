import { Columns3, CalendarDays, Calendar, BookOpen, Users, AlertTriangle, Save, Plus, LogOut, Ruler, Settings } from 'lucide-react';
import { T } from '../theme.js';
import { avatarFor } from '../utils/helpers.js';
import { useT } from '../i18n/LangProvider.jsx';

const ITEMS = [
  { id: 'kanban',   key: 'nav_kanban',   icon: Columns3 },
  { id: 'briefing', key: 'nav_briefing', icon: CalendarDays },
  { id: 'design',   key: 'nav_design',   icon: Ruler },
  { id: 'calendar', key: 'nav_calendar', icon: Calendar },
  { id: 'method',   key: 'nav_method',   icon: BookOpen },
  { id: 'team',     key: 'nav_team',     icon: Users },
  { id: 'risks',    key: 'nav_risks',    icon: AlertTriangle },
  { id: 'settings', key: 'nav_settings', icon: Settings },
];

export default function Nav({ view, setView, onNew, saveStatus, user, onSignOut }) {
  const { t, lang, setLang } = useT();
  const av = user?.email ? avatarFor(user.email) : null;

  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-md no-print"
      style={{ background: 'rgba(250, 248, 243, 0.85)', borderBottom: `1px solid ${T.lineSoft}` }}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-5 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <div className="font-display text-3xl tracking-tight" style={{ color: T.ink }}>溪岸</div>
          <div className="font-display italic text-xl" style={{ color: T.wood }}>SAIL</div>
          <div className="hidden md:block text-xs uppercase tracking-[0.2em] ml-2" style={{ color: T.inkSoft }}>
            {t('nav_subtitle')}
          </div>
        </div>
        <nav className="flex items-center gap-1">
          {ITEMS.map((it) => {
            const active = view === it.id || (it.id === 'kanban' && view === 'project');
            const Icon = it.icon;
            return (
              <button
                key={it.id}
                onClick={() => setView(it.id)}
                className="relative px-3 lg:px-4 py-2 flex items-center gap-2 text-sm transition-colors"
                style={{ color: active ? T.ink : T.inkSoft }}
              >
                <Icon size={15} strokeWidth={1.5} />
                <span className="hidden sm:inline">{t(it.key)}</span>
                {active && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-px" style={{ background: T.wood }} />
                )}
              </button>
            );
          })}
          <div className="w-px h-5 mx-2" style={{ background: T.line }} />

          <div className="flex items-center text-xs mr-1" style={{ border: `1px solid ${T.line}`, borderRadius: '2px' }}>
            <button onClick={() => setLang('cn')} className="px-2 py-1 transition-all" style={{ background: lang === 'cn' ? T.ink : 'transparent', color: lang === 'cn' ? T.paper : T.inkSoft }}>中</button>
            <button onClick={() => setLang('en')} className="px-2 py-1 transition-all" style={{ background: lang === 'en' ? T.ink : 'transparent', color: lang === 'en' ? T.paper : T.inkSoft }}>EN</button>
          </div>

          {saveStatus !== 'idle' && (
            <div className="flex items-center gap-1.5 text-xs px-2" style={{ color: T.sage }}>
              <Save size={12} />
              {saveStatus === 'saving' ? t('save_syncing') : t('save_saved')}
            </div>
          )}
          <button
            onClick={onNew}
            className="ml-2 flex items-center gap-1.5 px-3 lg:px-4 py-2 text-sm transition-all"
            style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = T.wood)}
            onMouseLeave={(e) => (e.currentTarget.style.background = T.ink)}
          >
            <Plus size={14} strokeWidth={2} />
            <span className="hidden sm:inline">{t('nav_new')}</span>
          </button>
          {user && (
            <div className="flex items-center gap-2 ml-2 pl-2" style={{ borderLeft: `1px solid ${T.line}` }}>
              {av && (
                <span
                  title={user.email}
                  className="hidden sm:flex items-center justify-center font-mono text-[10px] uppercase"
                  style={{ width: 24, height: 24, borderRadius: '50%', background: av.color, color: T.paper, fontWeight: 600 }}
                >
                  {av.initial}
                </span>
              )}
              <button onClick={onSignOut} title="退出登录 / Sign out" className="p-1.5 opacity-60 hover:opacity-100" style={{ color: T.inkSoft }}>
                <LogOut size={15} strokeWidth={1.5} />
              </button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
