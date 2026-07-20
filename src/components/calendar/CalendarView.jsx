import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, PlusCircle, CalendarDays } from 'lucide-react';
import { T } from '../../theme.js';
import { APPOINTMENT_TYPES, getApptTypeMeta } from '../../constants/calendar.js';
import ApptCard from './ApptCard.jsx';
import AppointmentFormModal from './AppointmentFormModal.jsx';

const dateKey = (d) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : '';

export default function CalendarView({
  appointments,
  projects,
  onAdd,
  onDelete,
  onOpenProject,
  seed,
  clearSeed,
}) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [typeFilter, setTypeFilter] = useState('All');

  // Seeded launch from "Schedule appointment" on a project page
  useEffect(() => {
    if (seed) {
      setShowForm(true);
      setSelectedDate(seed.date || new Date().toISOString().slice(0, 10));
    }
  }, [seed]);

  const todayKey = new Date().toISOString().slice(0, 10);

  const { daysGrid, monthLabel } = useMemo(() => {
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const monthLabel = base.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
    const firstDay = base.getDay();
    const leadingBlanks = firstDay === 0 ? 6 : firstDay - 1; // Monday-first
    const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const grid = [];
    for (let i = 0; i < leadingBlanks; i++) grid.push(null);
    for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(base.getFullYear(), base.getMonth(), d));
    return { daysGrid: grid, monthLabel };
  }, [monthOffset]);

  const filteredAppts = typeFilter === 'All' ? appointments : appointments.filter((a) => a.type === typeFilter);

  const apptsByDate = useMemo(() => {
    const m = {};
    filteredAppts.forEach((a) => {
      if (!m[a.date]) m[a.date] = [];
      m[a.date].push(a);
    });
    return m;
  }, [filteredAppts]);

  const upcoming = useMemo(
    () =>
      [...filteredAppts]
        .filter((a) => a.date >= todayKey)
        .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
        .slice(0, 8),
    [filteredAppts, todayKey]
  );

  const findProject = (id) => (id ? projects.find((p) => p.id === id) : null);

  const handleClose = () => {
    setShowForm(false);
    if (clearSeed) clearSeed();
  };

  const handleSave = (data) => {
    onAdd(data);
    handleClose();
  };

  return (
    <div className="fade-up space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] mb-1" style={{ color: T.wood }}>Calendar · 团队日程</div>
          <h1 className="font-display text-5xl mb-1" style={{ color: T.ink }}>日历</h1>
          <p className="text-sm" style={{ color: T.inkSoft }}>展厅、量尺、安装、交付 — 全团队同一份日程</p>
        </div>
        <button
          onClick={() => { setSelectedDate(todayKey); setShowForm(true); }}
          className="flex items-center gap-1.5 px-4 py-2 text-sm"
          style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}
        >
          <Plus size={14} strokeWidth={1.5} />新增日程
        </button>
      </div>

      {/* Type filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setTypeFilter('All')}
          className="px-3 py-1 text-xs"
          style={{
            background: typeFilter === 'All' ? T.ink : 'transparent',
            color: typeFilter === 'All' ? T.paper : T.inkSoft,
            border: `1px solid ${typeFilter === 'All' ? T.ink : T.line}`,
            borderRadius: '2px',
          }}
        >
          全部 ({appointments.length})
        </button>
        {APPOINTMENT_TYPES.map((t) => {
          const count = appointments.filter((a) => a.type === t.value).length;
          if (count === 0) return null;
          const active = typeFilter === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setTypeFilter(t.value)}
              className="px-3 py-1 text-xs flex items-center gap-1.5"
              style={{
                background: active ? t.color : 'transparent',
                color: active ? T.paper : T.inkSoft,
                border: `1px solid ${active ? 'transparent' : T.line}`,
                borderRadius: '2px',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? T.paper : t.color }} />
              {t.short} ({count})
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Month grid */}
        <div className="lg:col-span-2 p-4" style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: '2px' }}>
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setMonthOffset(monthOffset - 1)} className="p-1.5 hover:bg-opacity-50" style={{ color: T.inkSoft }}>
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-3">
              <h3 className="font-display text-xl" style={{ color: T.ink }}>{monthLabel}</h3>
              {monthOffset !== 0 && (
                <button onClick={() => setMonthOffset(0)} className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: T.wood }}>
                  Today
                </button>
              )}
            </div>
            <button onClick={() => setMonthOffset(monthOffset + 1)} className="p-1.5" style={{ color: T.inkSoft }}>
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
              <div key={d} className="text-center text-[10px] uppercase tracking-wider py-1" style={{ color: T.inkSoft, opacity: 0.7 }}>
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {daysGrid.map((d, i) => {
              if (!d) return <div key={i} className="aspect-square" />;
              const key = dateKey(d);
              const dayAppts = apptsByDate[key] || [];
              const isToday = key === todayKey;
              const isSelected = key === selectedDate;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(key)}
                  className="aspect-square p-1 flex flex-col items-center text-xs transition-colors"
                  style={{
                    background: isSelected ? T.ink : isToday ? T.cream : 'transparent',
                    color: isSelected ? T.paper : isToday ? T.ink : T.inkSoft,
                    borderRadius: '2px',
                    border: `1px solid ${isSelected ? T.ink : isToday ? T.wood : 'transparent'}`,
                  }}
                >
                  <span className={isToday && !isSelected ? 'font-bold' : ''}>{d.getDate()}</span>
                  {dayAppts.length > 0 && (
                    <div className="flex items-center gap-0.5 mt-0.5 flex-wrap justify-center">
                      {dayAppts.slice(0, 3).map((a, j) => (
                        <span
                          key={j}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: isSelected ? T.paper : getApptTypeMeta(a.type).color }}
                        />
                      ))}
                      {dayAppts.length > 3 && <span className="text-[8px]">+{dayAppts.length - 3}</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Side panel */}
        <div className="p-4" style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: '2px' }}>
          {selectedDate ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg" style={{ color: T.ink }}>
                  {new Date(selectedDate).toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' })}
                </h3>
                <button onClick={() => setShowForm(true)} style={{ color: T.wood }} title="新增日程">
                  <PlusCircle size={16} />
                </button>
              </div>
              <div className="space-y-2">
                {(apptsByDate[selectedDate] || []).length === 0 ? (
                  <p className="text-xs" style={{ color: T.inkSoft, opacity: 0.7 }}>本日无日程。点 + 新增。</p>
                ) : (
                  (apptsByDate[selectedDate] || [])
                    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
                    .map((a) => (
                      <ApptCard
                        key={a.id}
                        appt={a}
                        project={findProject(a.projectId)}
                        onDelete={() => onDelete(a.id)}
                        onOpenProject={onOpenProject}
                      />
                    ))
                )}
              </div>
            </>
          ) : (
            <>
              <h3 className="font-display text-lg mb-3" style={{ color: T.ink }}>近期日程</h3>
              <div className="space-y-2">
                {upcoming.length === 0 ? (
                  <p className="text-xs" style={{ color: T.inkSoft, opacity: 0.7 }}>暂无近期日程。</p>
                ) : (
                  upcoming.map((a) => (
                    <ApptCard
                      key={a.id}
                      appt={a}
                      project={findProject(a.projectId)}
                      onDelete={() => onDelete(a.id)}
                      onOpenProject={onOpenProject}
                      showDate
                    />
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {appointments.length === 0 && (
        <div className="text-center py-12 px-4" style={{ background: T.cream, borderRadius: '2px' }}>
          <CalendarDays size={40} strokeWidth={1} className="mx-auto mb-3" style={{ color: T.wood }} />
          <div className="font-display text-xl mb-1" style={{ color: T.ink }}>还没有日程</div>
          <div className="text-sm" style={{ color: T.inkSoft }}>
            新增首个日程, 或在项目详情页点「安排日程」直接关联项目。
          </div>
        </div>
      )}

      {showForm && (
        <AppointmentFormModal
          defaultDate={selectedDate || todayKey}
          seed={seed}
          projects={projects}
          onClose={handleClose}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
