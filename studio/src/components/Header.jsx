import React from 'react';
import { Settings, KeyRound, FolderOpen } from 'lucide-react';
import Wordmark from './Wordmark.jsx';

const TABS = [
  { id: 'ideate', label: '构思', hint: '拆参考视频 → 配方' },
  { id: 'edit', label: '剪辑', hint: '配方 × 素材 → 时间轴' },
  { id: 'post', label: '发布', hint: '标题 / 正文 / 封面' },
  { id: 'trend', label: '趋势', hint: '选题雷达' },
];

export default function Header({ view, setView, onOpenSettings, onOpenProjects, hasKey, projectCount, stage }) {
  return (
    <header className="sticky top-0 z-40 bg-sail-paper/90 backdrop-blur border-b border-sail-line">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <Wordmark className="hidden sm:block" />
          <Wordmark by="" className="sm:hidden" />
          <nav className="flex gap-1 bg-white border border-sail-line rounded-xl p-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                title={t.hint}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  view === t.id ? 'bg-sail-green-deep text-white' : 'text-sail-muted hover:bg-sail-tint'
                }`}
              >
                {t.label}
                {stage?.[t.id] && (
                  <span className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full align-middle ${view === t.id ? 'bg-white/70' : 'bg-sail-gold'}`} />
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenProjects}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-sail-muted hover:bg-sail-tint border border-sail-line"
          >
            <FolderOpen size={16} />
            <span className="hidden sm:inline">项目</span>
            {projectCount > 0 && <span className="text-xs text-sail-faint">{projectCount}</span>}
          </button>
          <button
            onClick={onOpenSettings}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border ${
              hasKey ? 'text-sail-muted hover:bg-sail-tint border-sail-line' : 'text-white bg-sail-warn border-sail-warn'
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
