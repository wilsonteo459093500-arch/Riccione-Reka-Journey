import React, { useState } from 'react';
import {
  BarChart3, Users, UserPlus, CalendarDays, Play, Target, FileText,
  Bell, BookOpen, User, MoreHorizontal, X,
} from 'lucide-react';
import { TAB_LABELS } from '../constants.js';

// 手机底部导航 —— 顶部 9 个页签在手机上要横滑 300px 才够得着，
// 底栏固定放前几个常用入口，其余收进「更多」。开会（主持模式）时
// 整条隐藏，防止中途误触切页。桌面端（sm 以上）不显示，用顶部页签。
const TAB_ICONS = {
  dashboard: BarChart3,
  members: Users,
  prospects: UserPlus,
  schedule: CalendarDays,
  run: Play,
  commitments: Target,
  cases: FileText,
  reminders: Bell,
  rules: BookOpen,
  me: User,
  roster: Users,
};

// 底栏直达位按「开会那天最常按」排优先级，不是按桌面页签顺序 ——
// 桌长手机上最要紧的是 排期(开场入口)>看板>承诺，其余进「更多」。
const BOTTOM_PRIORITY = ['schedule', 'dashboard', 'commitments', 'me', 'roster', 'cases', 'members', 'prospects', 'reminders', 'rules'];

export default function BottomNav({ tabs, view, setView, reminderCount }) {
  const [moreOpen, setMoreOpen] = useState(false);

  const MAX_DIRECT = 4;
  const prioritized = [...tabs].sort(
    (a, b) => BOTTOM_PRIORITY.indexOf(a) - BOTTOM_PRIORITY.indexOf(b)
  );
  const direct = tabs.length > MAX_DIRECT ? prioritized.slice(0, MAX_DIRECT - 1) : prioritized;
  const overflow = tabs.length > MAX_DIRECT ? tabs.filter(t => !direct.includes(t)) : [];
  const overflowActive = overflow.includes(view);
  const overflowBadge = overflow.includes('reminders') && reminderCount > 0;

  const Item = ({ tab, onClick, active, badge }) => {
    const Icon = TAB_ICONS[tab] || FileText;
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative ${
          active ? 'text-pumm-brand' : 'text-pumm-faint'
        }`}
      >
        <Icon className="w-5 h-5" />
        <span className={`text-[10px] leading-none ${active ? 'font-semibold' : ''}`}>
          {TAB_LABELS[tab]}
        </span>
        {badge && (
          <span className="absolute top-1 right-1/2 translate-x-4 w-2 h-2 rounded-full bg-pumm-danger" />
        )}
      </button>
    );
  };

  return (
    <>
      {moreOpen && (
        <div className="sm:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute bottom-0 inset-x-0 bg-white rounded-t-2xl p-4 safe-bottom"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-display text-sm font-semibold text-pumm-ink">全部页面</span>
              <button type="button" onClick={() => setMoreOpen(false)} className="p-1 text-pumm-faint" aria-label="关闭">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2 pb-2">
              {tabs.map(t => {
                const Icon = TAB_ICONS[t] || FileText;
                const active = view === t;
                return (
                  <button
                    key={t} type="button"
                    onClick={() => { setView(t); setMoreOpen(false); }}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs relative ${
                      active ? 'border-pumm-brand bg-pumm-brand/5 text-pumm-brand font-semibold' : 'border-pumm-line text-pumm-muted'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {TAB_LABELS[t]}
                    {t === 'reminders' && reminderCount > 0 && (
                      <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-pumm-danger text-white text-[10px] font-semibold flex items-center justify-center">
                        {reminderCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-pumm-line flex safe-bottom no-print">
        {direct.map(t => (
          <Item
            key={t} tab={t} active={view === t}
            badge={t === 'reminders' && reminderCount > 0}
            onClick={() => setView(t)}
          />
        ))}
        {overflow.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative ${
              overflowActive ? 'text-pumm-brand' : 'text-pumm-faint'
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className={`text-[10px] leading-none ${overflowActive ? 'font-semibold' : ''}`}>更多</span>
            {overflowBadge && (
              <span className="absolute top-1 right-1/2 translate-x-4 w-2 h-2 rounded-full bg-pumm-danger" />
            )}
          </button>
        )}
      </nav>
    </>
  );
}
