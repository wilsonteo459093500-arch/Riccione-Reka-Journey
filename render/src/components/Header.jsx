import React from 'react';
import { History, Settings, KeyRound } from 'lucide-react';

export default function Header({ view, setView, onOpenSettings, onOpenHistory, hasKey, historyCount }) {
  const tab = (id, label) => (
    <button
      onClick={() => setView(id)}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        view === id ? 'bg-sail-green-deep text-white' : 'text-sail-muted hover:bg-sail-tint'
      }`}
    >
      {label}
    </button>
  );

  return (
    <header className="sticky top-0 z-40 bg-sail-paper/90 backdrop-blur border-b border-sail-line">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-display text-xl font-semibold text-sail-green-deep whitespace-nowrap">溪岸 Render</span>
          <nav className="flex gap-1 bg-white border border-sail-line rounded-xl p-1">
            {tab('render', 'AI 效果图')}
            {tab('board', 'Mood Board')}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-sail-muted hover:bg-sail-tint border border-sail-line"
          >
            <History size={16} />
            <span className="hidden sm:inline">历史</span>
            {historyCount > 0 && <span className="text-xs text-sail-faint">{historyCount}</span>}
          </button>
          <button
            onClick={onOpenSettings}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border ${
              hasKey
                ? 'text-sail-muted hover:bg-sail-tint border-sail-line'
                : 'text-white bg-sail-warn border-sail-warn'
            }`}
          >
            {hasKey ? <Settings size={16} /> : <KeyRound size={16} />}
            <span>{hasKey ? '设置' : '配置 API key'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
