import { useEffect, useMemo, useState } from 'react';
import { Bell, X, AlertTriangle, CalendarDays, Ruler, PackageCheck, FileText } from 'lucide-react';
import { T } from '../theme.js';
import { currentStage, isComplete, workingDaysUntil } from '../utils/helpers.js';

const SESSION_KEY = 'sail-reminder-dismissed';
const TODAY = () => new Date().toISOString().slice(0, 10);
const TOMORROW = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

// Compact, dismissible bar that surfaces actionable counts: today's
// appointments, overdue design steps, defects waiting for re-install,
// and projects in install without a daily report yet today.
export default function ReminderBar({ projects, appointments, onJump }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY) === '1') setDismissed(true);
    } catch (e) { /* sessionStorage blocked */ }
  }, []);

  const reminders = useMemo(() => {
    const today = TODAY();
    const tomorrow = TOMORROW();

    const todayAppts = appointments.filter((a) => a.date === today);
    const tomorrowAppts = appointments.filter((a) => a.date === tomorrow);

    const overdueDesign = projects.filter((p) => {
      if (!p.designFlow) return false;
      const active = p.designFlow.steps.find((s) => s.status === 'active');
      if (!active) return false;
      const left = workingDaysUntil(active.dueDate);
      return left !== null && left < 0;
    });

    const arrivedDefects = projects.filter((p) =>
      (p.defects || []).some((d) => d.status === 'arrived')
    );

    const installNoReportToday = projects.filter((p) => {
      const cur = currentStage(p);
      if (cur.code !== 'T' || isComplete(p)) return false;
      const list = p.dailyReports || [];
      if (list.length === 0) return true;
      const lastDate = list.map((r) => r.date).sort().pop();
      // missing report if last log is older than yesterday
      return lastDate < tomorrow ? lastDate !== today && lastDate !== TOMORROW().slice(0, 10) && lastDate < today : false;
    });

    return { todayAppts, tomorrowAppts, overdueDesign, arrivedDefects, installNoReportToday };
  }, [projects, appointments]);

  const total =
    reminders.todayAppts.length +
    reminders.tomorrowAppts.length +
    reminders.overdueDesign.length +
    reminders.arrivedDefects.length +
    reminders.installNoReportToday.length;

  if (dismissed || total === 0) return null;

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) { /* ignore */ }
  };

  const Chip = ({ icon: Icon, label, count, onClick, color }) => (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs px-2.5 py-1 transition-colors hover:opacity-90"
      style={{
        background: 'rgba(250, 248, 243, 0.18)',
        color: T.paper,
        borderRadius: '2px',
        borderLeft: `2px solid ${color || T.paper}`,
      }}
    >
      <Icon size={12} strokeWidth={1.5} />
      <span>{label}</span>
      <span className="font-mono font-semibold">{count}</span>
    </button>
  );

  return (
    <div className="no-print" style={{ background: T.ink, color: T.paper, borderBottom: `1px solid ${T.lineSoft}` }}>
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center justify-center flex-shrink-0" style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(250,248,243,0.15)' }}>
            <Bell size={12} strokeWidth={1.5} />
          </div>
          <div className="text-xs font-medium opacity-90 mr-1">今日提醒 / Today:</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {reminders.todayAppts.length > 0 && (
              <Chip icon={CalendarDays} label="今日日程" count={reminders.todayAppts.length} onClick={() => onJump('calendar')} color="#B8945E" />
            )}
            {reminders.tomorrowAppts.length > 0 && (
              <Chip icon={CalendarDays} label="明日" count={reminders.tomorrowAppts.length} onClick={() => onJump('calendar')} color="#8B6F4E" />
            )}
            {reminders.overdueDesign.length > 0 && (
              <Chip icon={Ruler} label="设计逾期" count={reminders.overdueDesign.length} onClick={() => onJump('design')} color="#C4543A" />
            )}
            {reminders.arrivedDefects.length > 0 && (
              <Chip icon={PackageCheck} label="补货已到" count={reminders.arrivedDefects.length} onClick={() => onJump('kanban')} color="#5C7A4A" />
            )}
            {reminders.installNoReportToday.length > 0 && (
              <Chip icon={FileText} label="缺日报" count={reminders.installNoReportToday.length} onClick={() => onJump('briefing')} color="#C4543A" />
            )}
          </div>
        </div>
        <button onClick={dismiss} className="opacity-60 hover:opacity-100 flex-shrink-0" style={{ color: T.paper }} title="本次会话不再显示">
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
