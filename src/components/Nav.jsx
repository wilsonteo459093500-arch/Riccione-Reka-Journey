import { Columns3, BookOpen, Users, AlertTriangle, Save, Plus } from 'lucide-react';
import { T } from '../theme.js';

const ITEMS = [
  { id: 'kanban', label: '看板', icon: Columns3 },
  { id: 'method', label: 'Method', icon: BookOpen },
  { id: 'team', label: '团队', icon: Users },
  { id: 'risks', label: '风险', icon: AlertTriangle },
];

export default function Nav({ view, setView, onNew, saveStatus }) {
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
            The Method
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
                <span className="hidden sm:inline">{it.label}</span>
                {active && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-px" style={{ background: T.wood }} />
                )}
              </button>
            );
          })}
          <div className="w-px h-5 mx-2" style={{ background: T.line }} />
          {saveStatus !== 'idle' && (
            <div className="flex items-center gap-1.5 text-xs px-2" style={{ color: T.sage }}>
              <Save size={12} />
              {saveStatus === 'saving' ? '同步中…' : '已同步'}
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
            <span className="hidden sm:inline">新建</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
