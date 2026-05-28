import React, { useMemo, useState } from 'react';
import { Search, X, Edit2 } from 'lucide-react';
import {
  PIC_OPTIONS, SALES_STAGES, PRIORITIES, LEAD_SOURCES, canViewLead,
} from '../../constants.js';
import {
  fmtMoneyShort, getPriorityMeta, getStageMeta, leadToRow,
} from '../../utils.js';
import { ExportMenu, FilterDropdown } from '../Shared.jsx';

export default function LeadsTableView({ leads, role, setViewingLead, setEditingLead }) {
  const [search, setSearch] = useState('');
  const [picFilter, setPicFilter] = useState('All');
  const [stageFilter, setStageFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [sortBy, setSortBy] = useState('updated');

  const viewable = useMemo(() => leads.filter(l => canViewLead(role, l)), [leads, role]);

  const filtered = useMemo(() => {
    let arr = viewable;
    if (picFilter !== 'All') arr = arr.filter(l => l.pic === picFilter);
    if (stageFilter !== 'All') arr = arr.filter(l => l.salesStage === stageFilter);
    if (priorityFilter !== 'All') arr = arr.filter(l => l.priority === priorityFilter);
    if (sourceFilter !== 'All') arr = arr.filter(l => l.leadSource === sourceFilter);
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter(l =>
        (l.clientName || '').toLowerCase().includes(q) ||
        (l.region || '').toLowerCase().includes(q) ||
        (l.contactNo || '').toLowerCase().includes(q) ||
        (l.clientNeeds || '').toLowerCase().includes(q) ||
        (l.statusRemarks || '').toLowerCase().includes(q)
      );
    }
    arr = [...arr].sort((a, b) => {
      if (sortBy === 'updated')  return new Date(b.updatedAt) - new Date(a.updatedAt);
      if (sortBy === 'priority') return (parseInt(a.priority) || 99) - (parseInt(b.priority) || 99);
      if (sortBy === 'value')    return (Number(b.quotationAmount) || 0) - (Number(a.quotationAmount) || 0);
      if (sortBy === 'name')     return (a.clientName || '').localeCompare(b.clientName || '');
      return 0;
    });
    return arr;
  }, [viewable, search, picFilter, stageFilter, priorityFilter, sourceFilter, sortBy]);

  const exportRows = filtered.map(leadToRow);
  const restricted = role !== 'manager' && role !== 'sales' && role !== 'designer';

  return (
    <div className="space-y-4 pt-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-sail-ink font-semibold">Leads</h1>
          <p className="text-xs text-sail-muted mt-0.5">
            {filtered.length} of {viewable.length} leads{restricted ? ' (confirmed sales visible to your role)' : ''}
          </p>
        </div>
        <ExportMenu rows={exportRows} title="Leads" filename="Sail_Leads" label={`Export (${filtered.length})`} />
      </div>

      <div className="bg-white border border-sail-line rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-sail-faint" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, region, phone, needs, or remarks…"
            className="flex-1 bg-transparent text-sm text-sail-ink placeholder:text-sail-faint focus:outline-none"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="text-sail-faint hover:text-sail-ink">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <FilterDropdown label="PIC" value={picFilter} onChange={setPicFilter} options={['All', ...PIC_OPTIONS]} />
          <FilterDropdown label="Stage" value={stageFilter} onChange={setStageFilter}
            options={['All', ...SALES_STAGES.map(s => s.value)]}
            optionLabels={['All', ...SALES_STAGES.map(s => s.short)]} />
          <FilterDropdown label="Priority" value={priorityFilter} onChange={setPriorityFilter}
            options={['All', ...PRIORITIES.map(p => p.value)]}
            optionLabels={['All', ...PRIORITIES.map(p => p.label)]} />
          <FilterDropdown label="Source" value={sourceFilter} onChange={setSourceFilter}
            options={['All', ...LEAD_SOURCES]} />
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-sail-muted">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-sail-tint border border-sail-line rounded px-2 py-1 text-sail-ink focus:outline-none"
            >
              <option value="updated">Last updated</option>
              <option value="priority">Priority</option>
              <option value="value">Value</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white border border-sail-line rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-sail-tint border-b border-sail-line">
              <tr>
                {['Client', 'PIC', 'Stage', 'Priority', 'Source', 'Region', 'Value', ''].map((h, i) => (
                  <th key={h + i}
                    className={`px-3 py-2.5 font-medium text-[10px] uppercase tracking-wider text-sail-muted ${i === 6 ? 'text-right' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => {
                const pm = getPriorityMeta(l.priority);
                const sm = getStageMeta(l.salesStage);
                return (
                  <tr
                    key={l.id}
                    onClick={() => setViewingLead(l)}
                    className="border-b border-sail-line last:border-0 hover:bg-sail-tint cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-sail-ink">{l.clientName}</div>
                      <div className="text-[11px] text-sail-muted truncate max-w-[220px]">{l.clientNeeds || '—'}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-sail-green text-white flex items-center justify-center text-[9px] font-bold">
                          {l.pic?.[0]}
                        </div>
                        <span className="text-xs">{l.pic}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[11px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap"
                        style={{ background: `${sm.color}1F`, color: sm.color }}>
                        {sm.short}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-xs text-sail-muted">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: pm.dot }} />
                        {pm.label}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-sail-muted">{l.leadSource}</td>
                    <td className="px-3 py-2.5 text-xs text-sail-muted max-w-[160px] truncate">{l.region || '—'}</td>
                    <td className="px-3 py-2.5 text-right text-sm font-semibold text-sail-ink">
                      {l.quotationAmount > 0 ? fmtMoneyShort(l.quotationAmount) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEditingLead(l); }}
                        className="text-sail-faint hover:text-sail-green p-1"
                        aria-label="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-sm text-sail-muted">No leads match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.map(l => {
          const pm = getPriorityMeta(l.priority);
          const sm = getStageMeta(l.salesStage);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => setViewingLead(l)}
              className="w-full text-left bg-white border border-sail-line rounded-md p-3 hover:border-sail-green transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="font-semibold text-sail-ink truncate flex-1">{l.clientName}</div>
                <div className="w-1.5 h-1.5 rounded-full mt-1.5" style={{ background: pm.dot }} />
              </div>
              <div className="text-xs text-sail-muted truncate mb-1.5">{l.region || '—'} · {l.leadSource}</div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={{ background: `${sm.color}1F`, color: sm.color }}>
                  {sm.short}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-sail-muted">{l.pic}</span>
                  {l.quotationAmount > 0 && <span className="text-xs font-semibold">{fmtMoneyShort(l.quotationAmount)}</span>}
                </div>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm text-sail-muted">No leads match these filters.</div>
        )}
      </div>
    </div>
  );
}
