import React from 'react';
import { LogOut, Cloud, HardDrive } from 'lucide-react';
import { APP_NAME, TAB_LABELS, ROLES, TABLE } from '../constants.js';
import { repo } from '../services/repo.js';

export default function Header({ tabs, view, setView, session, onLogout, reminderCount }) {
  const rm = ROLES[session.role] || ROLES.member;

  return (
    <header className="bg-white border-b border-pumm-line sticky top-0 z-30 safe-top no-print">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center gap-3 h-14">
          <div className="w-8 h-8 rounded-lg bg-pumm-brand flex items-center justify-center flex-shrink-0">
            <span className="font-display text-pumm-gold text-sm font-semibold">P</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-semibold text-pumm-ink leading-tight truncate">{APP_NAME}</div>
            <div className="text-[11px] text-pumm-muted truncate">{TABLE.name}</div>
          </div>

          <div
            className="hidden sm:flex items-center gap-1.5 text-[10px] text-pumm-faint"
            title={repo.mode === 'cloud' ? '云端同步：全桌共享同一份数据' : '本地模式：数据只在这台设备'}
          >
            {repo.mode === 'cloud' ? <Cloud className="w-3.5 h-3.5" /> : <HardDrive className="w-3.5 h-3.5" />}
            {repo.mode === 'cloud' ? '云端' : '本地'}
          </div>

          <div className="flex items-center gap-2 pl-2 border-l border-pumm-line">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-medium text-pumm-ink leading-tight">{session.name}</div>
              <div className="text-[10px]" style={{ color: rm.color }}>{rm.label}</div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="p-1.5 text-pumm-faint hover:text-pumm-ink"
              aria-label="退出"
              title="退出"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 顶部页签只给桌面端；手机用底部导航（BottomNav） */}
        <nav className="hidden sm:flex gap-0.5 overflow-x-auto scrollbar-thin -mx-1 px-1">
          {tabs.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setView(t)}
              className={`relative px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
                view === t
                  ? 'border-pumm-brass text-pumm-ink font-semibold'
                  : 'border-transparent text-pumm-muted hover:text-pumm-ink'
              }`}
            >
              {TAB_LABELS[t]}
              {t === 'reminders' && reminderCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-pumm-danger text-white text-[10px] font-semibold align-middle">
                  {reminderCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
