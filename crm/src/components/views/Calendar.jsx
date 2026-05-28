import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus, PlusCircle, ChevronLeft, ChevronRight, Trash2, User, X, Download,
} from 'lucide-react';
import {
  APPOINTMENT_TYPES, PIC_OPTIONS, DROPPED_STAGE, getApptTypeMeta,
} from '../../constants.js';
import { exportAppointmentsToICS } from '../../utils.js';
import { ExportMenu, inputCls } from '../Shared.jsx';

export default function CalendarView({
  appointments, leads, currentUser, role,
  onAdd, onUpdate, onDelete, setViewingLead, seed, clearSeed,
}) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [typeFilter, setTypeFilter] = useState('All');
  const todayKey = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (seed) {
      setShowForm(true);
      setSelectedDate(todayKey);
    }
  }, [seed]); // eslint-disable-line

  const { daysGrid, monthLabel } = useMemo(() => {
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const monthLabel = base.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
    const firstDay = base.getDay();
    const leadingBlanks = firstDay === 0 ? 6 : firstDay - 1;
    const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const grid = [];
    for (let i = 0; i < leadingBlanks; i++) grid.push(null);
    for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(base.getFullYear(), base.getMonth(), d));
    return { daysGrid: grid, monthLabel };
  }, [monthOffset]);

  const filteredAppts = typeFilter === 'All' ? appointments : appointments.filter(a => a.type === typeFilter);

  const apptsByDate = useMemo(() => {
    const m = {};
    filteredAppts.forEach(a => {
      if (!m[a.date]) m[a.date] = [];
      m[a.date].push(a);
    });
    return m;
  }, [filteredAppts]);

  const upcoming = [...filteredAppts]
    .filter(a => a.date >= todayKey)
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
    .slice(0, 8);

  const dateKey = (d) =>
    d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';

  const leadsById = useMemo(() => Object.fromEntries(leads.map(l => [l.id, l])), [leads]);

  return (
    <div className="space-y-4 pt-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-sail-ink font-semibold">Calendar</h1>
          <p className="text-xs text-sail-muted mt-0.5">
            Showroom visits, site visits & installations — the whole team's schedule in one place
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportAppointmentsToICS(appointments, leadsById)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-sail-tint border border-sail-line text-sail-ink text-xs font-medium rounded-md"
            title="Download .ics to subscribe in Google / Apple Calendar"
          >
            <Download className="w-3.5 h-3.5 text-sail-brown" /> .ics
          </button>
          <ExportMenu
            rows={[...appointments].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).map(a => ({
              Date: a.date, Time: a.time || '', Type: getApptTypeMeta(a.type).label,
              Client: a.leadName || '', PIC: a.pic || '', Address: a.address || '', Notes: a.notes || '',
            }))}
            title="Appointments" filename="Sail_Calendar"
          />
          <button
            type="button"
            onClick={() => { setSelectedDate(todayKey); setShowForm(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sail-green hover:bg-sail-green-deep text-white text-sm font-medium rounded-md shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Appointment
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => setTypeFilter('All')}
          className={`px-2.5 py-1 text-xs font-medium rounded-full border ${
            typeFilter === 'All' ? 'bg-sail-ink text-white border-sail-ink' : 'bg-white text-sail-muted border-sail-line'
          }`}
        >All</button>
        {APPOINTMENT_TYPES.map(t => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTypeFilter(t.value)}
            className={`px-2.5 py-1 text-xs font-medium rounded-full border flex items-center gap-1.5 ${
              typeFilter === t.value ? 'text-white border-transparent' : 'bg-white text-sail-muted border-sail-line'
            }`}
            style={typeFilter === t.value ? { background: t.color } : {}}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: typeFilter === t.value ? 'white' : t.color }} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-sail-line rounded-lg p-3">
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => setMonthOffset(monthOffset - 1)}
              className="p-1.5 text-sail-muted hover:text-sail-ink hover:bg-sail-tint rounded" aria-label="Previous month">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-lg text-sail-ink font-semibold">{monthLabel}</h3>
              {monthOffset !== 0 && (
                <button type="button" onClick={() => setMonthOffset(0)}
                  className="text-[10px] text-sail-green font-medium uppercase tracking-wider">Today</button>
              )}
            </div>
            <button type="button" onClick={() => setMonthOffset(monthOffset + 1)}
              className="p-1.5 text-sail-muted hover:text-sail-ink hover:bg-sail-tint rounded" aria-label="Next month">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
              <div key={d} className="text-center text-[10px] uppercase tracking-wider text-sail-faint font-medium py-1">{d}</div>
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
                  type="button"
                  onClick={() => setSelectedDate(key)}
                  className={`aspect-square rounded-md p-1 flex flex-col items-center text-xs transition-colors relative ${
                    isSelected ? 'bg-sail-green text-white' : isToday ? 'bg-sail-green/10' : 'hover:bg-sail-tint'
                  }`}
                >
                  <span className={`${isToday && !isSelected ? 'font-bold text-sail-green' : ''}`}>{d.getDate()}</span>
                  {dayAppts.length > 0 && (
                    <div className="flex items-center gap-0.5 mt-0.5 flex-wrap justify-center">
                      {dayAppts.slice(0, 3).map((a, j) => (
                        <span key={j} className="w-1.5 h-1.5 rounded-full"
                          style={{ background: isSelected ? 'white' : getApptTypeMeta(a.type).color }} />
                      ))}
                      {dayAppts.length > 3 && <span className="text-[8px]">+{dayAppts.length - 3}</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-white border border-sail-line rounded-lg p-3">
          {selectedDate ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-base text-sail-ink font-semibold">
                  {new Date(selectedDate).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'short' })}
                </h3>
                <button type="button" onClick={() => setShowForm(true)} className="text-sail-green hover:text-sail-green-deep" aria-label="Add appointment">
                  <PlusCircle className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2">
                {(apptsByDate[selectedDate] || []).length === 0 ? (
                  <p className="text-xs text-sail-faint">No appointments. Tap + to add one.</p>
                ) : (
                  (apptsByDate[selectedDate] || [])
                    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
                    .map(a => <ApptCard key={a.id} appt={a} leads={leads} onDelete={onDelete} setViewingLead={setViewingLead} />)
                )}
              </div>
            </>
          ) : (
            <>
              <h3 className="font-display text-base text-sail-ink font-semibold mb-3">Upcoming</h3>
              <div className="space-y-2">
                {upcoming.length === 0 ? (
                  <p className="text-xs text-sail-faint">No upcoming appointments.</p>
                ) : (
                  upcoming.map(a => <ApptCard key={a.id} appt={a} leads={leads} onDelete={onDelete} setViewingLead={setViewingLead} showDate />)
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showForm && (
        <AppointmentFormModal
          defaultDate={selectedDate || todayKey}
          seed={seed}
          leads={leads}
          currentUser={currentUser}
          onClose={() => { setShowForm(false); if (clearSeed) clearSeed(); }}
          onSave={(data) => { onAdd(data); setShowForm(false); if (clearSeed) clearSeed(); }}
        />
      )}
    </div>
  );
}

function ApptCard({ appt: a, leads, onDelete, setViewingLead, showDate }) {
  const tm = getApptTypeMeta(a.type);
  const lead = a.leadId ? leads.find(l => l.id === a.leadId) : null;
  return (
    <div className="border border-sail-line rounded-md p-2.5" style={{ borderLeftWidth: '3px', borderLeftColor: tm.color }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-sail-ink">{tm.label}</span>
            {a.time && <span className="text-[10px] text-sail-muted">· {a.time}</span>}
          </div>
          {showDate && (
            <div className="text-[10px] text-sail-muted">
              {new Date(a.date).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
          )}
          {a.leadName && (
            <button
              type="button"
              onClick={() => lead && setViewingLead(lead)}
              className="text-[11px] text-sail-green hover:underline mt-0.5 block truncate text-left"
            >
              {a.leadName}
            </button>
          )}
          {a.address && <div className="text-[10px] text-sail-faint mt-0.5 line-clamp-1">{a.address}</div>}
          {a.notes && <div className="text-[10px] text-sail-muted mt-0.5 italic line-clamp-2">{a.notes}</div>}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] text-sail-muted">
              <User className="w-2.5 h-2.5" /> {a.pic}
            </span>
            {a.createdBy && <span className="text-[10px] text-sail-faint">· set by {a.createdBy}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            const label = `${getApptTypeMeta(a.type).label}${a.leadName ? ' · ' + a.leadName : ''} on ${a.date}`;
            if (confirm(`Delete this appointment?\n\n${label}`)) onDelete(a.id);
          }}
          className="text-sail-faint hover:text-sail-danger p-0.5" aria-label="Delete"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function AppointmentFormModal({ defaultDate, seed, leads, currentUser, onClose, onSave }) {
  const [form, setForm] = useState({
    type: seed?.type || 'showroom',
    date: defaultDate,
    time: seed?.time || '10:00',
    leadId: seed?.leadId || '',
    leadName: seed?.leadName || '',
    pic: seed?.pic || currentUser,
    address: seed?.address || '',
    notes: seed?.notes || '',
  });
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectLead = (id) => {
    const lead = leads.find(l => l.id === id);
    if (lead) {
      setForm(f => ({
        ...f, leadId: id, leadName: lead.clientName,
        address: lead.homeAddress || lead.region || f.address,
        pic: lead.pic,
      }));
    } else {
      setForm(f => ({ ...f, leadId: '', leadName: '' }));
    }
  };

  const save = () => {
    if (!form.date) { alert('Please pick a date'); return; }
    onSave(form);
  };

  const activeLeads = leads.filter(l => l.salesStage !== DROPPED_STAGE);

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md max-h-[90vh] rounded-t-2xl sm:rounded-lg overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-sail-line flex items-center justify-between">
          <h2 className="font-display text-lg text-sail-ink font-semibold">New Appointment</h2>
          <button type="button" onClick={onClose} className="text-sail-faint hover:text-sail-ink" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-sail-muted font-medium">Type</label>
            <div className="grid grid-cols-3 gap-1.5 mt-1">
              {APPOINTMENT_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => update('type', t.value)}
                  className={`text-[11px] font-medium rounded-md py-1.5 px-1 border ${
                    form.type === t.value ? 'text-white border-transparent' : 'bg-white text-sail-muted border-sail-line'
                  }`}
                  style={form.type === t.value ? { background: t.color } : {}}
                >
                  {t.short}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-sail-muted font-medium">Date</label>
              <input type="date" value={form.date} onChange={(e) => update('date', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-sail-muted font-medium">Time</label>
              <input type="time" value={form.time} onChange={(e) => update('time', e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-sail-muted font-medium">Link to Client (optional)</label>
            <select value={form.leadId} onChange={(e) => selectLead(e.target.value)} className={inputCls}>
              <option value="">— No client / general —</option>
              {activeLeads.map(l => <option key={l.id} value={l.id}>{l.clientName} ({l.pic})</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-sail-muted font-medium">PIC (who attends)</label>
            <select value={form.pic} onChange={(e) => update('pic', e.target.value)} className={inputCls}>
              {PIC_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-sail-muted font-medium">Address / Location</label>
            <input type="text" value={form.address} onChange={(e) => update('address', e.target.value)}
              className={inputCls} placeholder="Showroom, or client site address" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-sail-muted font-medium">Notes</label>
            <textarea rows={2} value={form.notes} onChange={(e) => update('notes', e.target.value)}
              className={inputCls + ' resize-none'} placeholder="e.g. bring fabric samples, measure kitchen" />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-sail-line bg-sail-tint flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-sail-muted">Cancel</button>
          <button type="button" onClick={save}
            className="px-4 py-1.5 bg-sail-green hover:bg-sail-green-deep text-white text-sm font-medium rounded-md">
            Save Appointment
          </button>
        </div>
      </div>
    </div>
  );
}
