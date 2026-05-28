import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  TrendingUp, Award, Target, AlertCircle, ArrowRight, CalendarDays, Bell, Timer, Sparkles,
} from 'lucide-react';
import {
  SALES_STAGES, WON_STAGES, DROPPED_STAGE, PIC_OPTIONS, isActiveStage,
} from '../../constants.js';
import {
  fmtMoneyShort, getStageMeta, getPriorityMeta, getStaleAlerts,
  daysSince, leadToRow,
} from '../../utils.js';
import { Card, KPICard, MiniLeadCard, ExportMenu } from '../Shared.jsx';
import { getApptTypeMeta } from '../../constants.js';

export default function DashboardView({ leads, appointments = [], currentUser, setView, setViewingLead }) {
  const stats = useMemo(() => {
    const active = leads.filter(l => isActiveStage(l.salesStage));
    const won = leads.filter(l => WON_STAGES.includes(l.salesStage));
    const dropped = leads.filter(l => l.salesStage === DROPPED_STAGE);
    const totalPipeline = active.reduce((s, l) => s + (Number(l.quotationAmount) || 0), 0);
    const totalWon = won.reduce((s, l) => s + (Number(l.quotationAmount) || 0), 0);
    const closedTotal = won.length + dropped.length;
    const winRate = closedTotal > 0 ? (won.length / closedTotal) * 100 : 0;
    const highPriority = leads.filter(l =>
      (l.priority === '1. High (Confirmed)' || l.priority === '2. High (Potential)') &&
      isActiveStage(l.salesStage)
    );
    return {
      active: active.length, won: won.length, totalPipeline, totalWon,
      winRate, highPriority: highPriority.length,
    };
  }, [leads]);

  const stageData = useMemo(() => {
    const counts = {};
    SALES_STAGES.forEach(s => { counts[s.short] = { name: s.short, count: 0, value: 0, color: s.color }; });
    leads.forEach(l => {
      const s = getStageMeta(l.salesStage);
      if (counts[s.short]) {
        counts[s.short].count += 1;
        counts[s.short].value += Number(l.quotationAmount) || 0;
      }
    });
    return Object.values(counts).filter(c => c.count > 0);
  }, [leads]);

  const sourceData = useMemo(() => {
    const counts = {};
    leads.forEach(l => {
      const src = l.leadSource || 'Unknown';
      if (!counts[src]) counts[src] = { name: src, count: 0, value: 0 };
      counts[src].count += 1;
      counts[src].value += Number(l.quotationAmount) || 0;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [leads]);

  const picData = useMemo(() => {
    const counts = {};
    PIC_OPTIONS.forEach(p => { counts[p] = { name: p, total: 0, won: 0, pipeline: 0, value: 0 }; });
    leads.forEach(l => {
      if (!counts[l.pic]) return;
      counts[l.pic].total += 1;
      counts[l.pic].value += Number(l.quotationAmount) || 0;
      if (WON_STAGES.includes(l.salesStage)) counts[l.pic].won += 1;
      if (isActiveStage(l.salesStage)) counts[l.pic].pipeline += 1;
    });
    return Object.values(counts).filter(c => c.total > 0);
  }, [leads]);

  const myLeads = useMemo(() =>
    leads.filter(l => l.pic === currentUser && isActiveStage(l.salesStage))
      .sort((a, b) => (parseInt(a.priority) || 99) - (parseInt(b.priority) || 99))
      .slice(0, 6)
  , [leads, currentUser]);

  const staleAlerts = useMemo(() => getStaleAlerts(leads), [leads]);
  const myStale = useMemo(() => staleAlerts.filter(l => l.pic === currentUser), [staleAlerts, currentUser]);

  const upcomingAppts = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return [...appointments]
      .filter(a => a.date >= today)
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
      .slice(0, 5);
  }, [appointments]);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  })();

  return (
    <div className="space-y-6 pt-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-sail-ink font-semibold tracking-tight">
            Good {greeting}, {currentUser}.
          </h1>
          <p className="text-sail-muted text-sm mt-1">Here's where Sail Malaysia stands today.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-sail-muted uppercase tracking-wider hidden sm:block">
            {new Date().toLocaleDateString('en-MY', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </div>
          <ExportMenu
            rows={picData.map(p => ({
              PIC: p.name, 'Total Leads': p.total, Pipeline: p.pipeline,
              'Won/In-progress': p.won, 'Total Value (RM)': p.value,
            }))}
            title="Team Performance"
            filename="Sail_Dashboard"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Active Pipeline" value={fmtMoneyShort(stats.totalPipeline)}
          sublabel={`${stats.active} active leads`} icon={TrendingUp} accent="#3D5A4A" />
        <KPICard label="Won Value" value={fmtMoneyShort(stats.totalWon)}
          sublabel={`${stats.won} completed/in-progress`} icon={Award} accent="#2D4A3E" />
        <KPICard label="Win Rate" value={`${stats.winRate.toFixed(0)}%`}
          sublabel="vs dropped leads" icon={Target} accent="#A87C4F" />
        <KPICard label="High-Priority" value={stats.highPriority}
          sublabel="needs attention" icon={AlertCircle} accent="#B8995A" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-lg text-sail-ink font-semibold">Sales Funnel</h3>
              <p className="text-xs text-sail-muted">Leads by stage</p>
            </div>
            <button
              type="button"
              onClick={() => setView('pipeline')}
              className="text-xs text-sail-green hover:text-sail-green-deep font-medium flex items-center gap-1"
            >
              View Pipeline <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stageData} layout="vertical" margin={{ left: 0, right: 30, top: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke="#E0D8C8" />
              <XAxis type="number" stroke="#7E7466" fontSize={11} />
              <YAxis dataKey="name" type="category" stroke="#5C5247" fontSize={11} width={130} />
              <Tooltip
                cursor={{ fill: 'rgba(61, 90, 74, 0.05)' }}
                contentStyle={{ background: '#fff', border: '1px solid #E0D8C8', borderRadius: 6, fontSize: 12 }}
                formatter={(v, _name, props) => [`${v} leads · ${fmtMoneyShort(props.payload.value)}`, '']}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {stageData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h3 className="font-display text-lg text-sail-ink font-semibold mb-1">Lead Sources</h3>
          <p className="text-xs text-sail-muted mb-3">Where leads come from</p>
          <div className="space-y-2">
            {sourceData.slice(0, 8).map((s, i) => {
              const maxCount = Math.max(...sourceData.map(x => x.count));
              const pct = (s.count / maxCount) * 100;
              const colors = ['#3D5A4A', '#A87C4F', '#B8995A', '#7E7466', '#6B8E7F', '#9C6B5C', '#C89B5A', '#5C5247'];
              return (
                <div key={s.name}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="text-sail-ink font-medium">{s.name}</span>
                    <span className="text-sail-muted">{s.count}</span>
                  </div>
                  <div className="h-1.5 bg-sail-tint rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: colors[i % colors.length] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-lg text-sail-ink font-semibold">Team Performance</h3>
            <p className="text-xs text-sail-muted">By person in charge</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {picData.map(p => (
            <div key={p.name} className="border border-sail-line rounded-lg p-4 bg-gradient-to-br from-white to-sail-tint">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-sail-green text-white flex items-center justify-center text-sm font-semibold">
                    {p.name[0]}
                  </div>
                  <div>
                    <div className="font-semibold text-sail-ink">{p.name}</div>
                    <div className="text-[10px] text-sail-muted uppercase tracking-wider">{p.total} leads</div>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-sail-muted">Pipeline</span><span className="font-medium text-sail-ink">{p.pipeline}</span></div>
                <div className="flex justify-between"><span className="text-sail-muted">Won/In-progress</span><span className="font-medium text-sail-green">{p.won}</span></div>
                <div className="flex justify-between pt-1.5 border-t border-sail-line"><span className="text-sail-muted">Total value</span><span className="font-semibold text-sail-ink">{fmtMoneyShort(p.value)}</span></div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {upcomingAppts.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-sail-green flex items-center justify-center">
                <CalendarDays className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-display text-lg text-sail-ink font-semibold">Upcoming Appointments</h3>
                <p className="text-xs text-sail-muted">Next showroom visits, site visits & installations</p>
              </div>
            </div>
            <button type="button" onClick={() => setView('calendar')}
              className="text-xs text-sail-green hover:text-sail-green-deep font-medium flex items-center gap-1">
              Open Calendar <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {upcomingAppts.map(a => {
              const tm = getApptTypeMeta(a.type);
              const lead = a.leadId ? leads.find(l => l.id === a.leadId) : null;
              const d = new Date(a.date);
              const isToday = a.date === new Date().toISOString().slice(0, 10);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => lead && setViewingLead(lead)}
                  className="text-left border border-sail-line rounded-md p-2.5 hover:border-sail-green transition-colors"
                  style={{ borderLeftWidth: '3px', borderLeftColor: tm.color }}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-sail-ink">{tm.label}</span>
                    <span className={`text-[10px] font-medium ${isToday ? 'text-sail-green' : 'text-sail-muted'}`}>
                      {isToday ? 'Today' : d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })}
                      {a.time ? ` · ${a.time}` : ''}
                    </span>
                  </div>
                  {a.leadName && <div className="text-[11px] text-sail-ink truncate">{a.leadName}</div>}
                  <div className="text-[10px] text-sail-faint mt-0.5">{a.pic}{a.address ? ` · ${a.address}` : ''}</div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {staleAlerts.length > 0 && (
        <Card className="border-sail-gold bg-gradient-to-br from-[#FFF9F0] to-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-sail-warn flex items-center justify-center">
                <Bell className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-display text-lg text-sail-ink font-semibold">Follow-up needed</h3>
                <p className="text-xs text-sail-muted">
                  {myStale.length > 0 ? `${myStale.length} of yours · ` : ''}
                  {staleAlerts.length} leads have been idle past their priority window
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {(myStale.length > 0 ? myStale : staleAlerts).slice(0, 6).map(l => {
              const days = daysSince(l.updatedAt);
              const pm = getPriorityMeta(l.priority);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setViewingLead(l)}
                  className="text-left bg-white border border-sail-line hover:border-sail-gold rounded-md p-2.5 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-medium text-sm text-sail-ink line-clamp-1 group-hover:text-sail-green">
                      {l.clientName}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-medium text-sail-danger whitespace-nowrap">
                      <Timer className="w-3 h-3" />
                      {days}d
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-sail-muted">
                    <span style={{ color: pm.color }}>● {pm.label.split(' ')[0]}</span>
                    <span>·</span>
                    <span>{l.pic}</span>
                    <span>·</span>
                    <span className="line-clamp-1">{getStageMeta(l.salesStage).short}</span>
                  </div>
                  {l.nextAction && (
                    <div className="text-[11px] text-sail-muted mt-1 line-clamp-1 italic">→ {l.nextAction}</div>
                  )}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-lg text-sail-ink font-semibold">My Top Priority Leads</h3>
            <p className="text-xs text-sail-muted">Sorted by priority · {currentUser}</p>
          </div>
          <button type="button" onClick={() => setView('leads')}
            className="text-xs text-sail-green hover:text-sail-green-deep font-medium flex items-center gap-1">
            See all <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        {myLeads.length === 0 ? (
          <div className="text-center py-8 text-sm text-sail-muted">No active leads for {currentUser}.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {myLeads.map(l => <MiniLeadCard key={l.id} lead={l} onClick={() => setViewingLead(l)} />)}
          </div>
        )}
      </Card>
    </div>
  );
}
