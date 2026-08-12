import React from 'react';
import { History, Settings, KeyRound } from 'lucide-react';

export default function Header({ onOpenSettings, onOpenHistory, hasKey, historyCount }) {
  return (
    <header className="sticky top-0 z-40 bg-sail-paper/90 backdrop-blur border-b border-sail-line">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-xl font-semibold text-sail-green-deep">溪岸 Render</span>
          <span className="text-xs text-sail-faint hidden sm:inline">AI 效果图工作室</span>
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
