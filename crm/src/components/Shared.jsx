import React, { useState } from 'react';
import { Download, ChevronDown, Table2, Printer } from 'lucide-react';
import {
  fmtMoneyShort, getPriorityMeta, getStageMeta,
  exportRowsToExcel, exportRowsToPDF,
} from '../utils.js';

// ---------------- Card ----------------
export function Card({ children, className = '' }) {
  return (
    <div className={`bg-white border border-sail-line rounded-lg p-5 ${className}`}>
      {children}
    </div>
  );
}

// ---------------- KPI Card ----------------
export function KPICard({ label, value, sublabel, icon: Icon, accent }) {
  return (
    <div className="bg-white border border-sail-line rounded-lg p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-sail-muted uppercase tracking-wider font-medium">{label}</span>
        {Icon && <Icon className="w-4 h-4" style={{ color: accent }} aria-hidden="true" />}
      </div>
      <div className="font-display text-3xl font-semibold text-sail-ink leading-none mb-1">{value}</div>
      <div className="text-xs text-sail-muted">{sublabel}</div>
    </div>
  );
}

// ---------------- Mini lead card (used on dashboards) ----------------
export function MiniLeadCard({ lead, onClick }) {
  const pm = getPriorityMeta(lead.priority);
  const sm = getStageMeta(lead.salesStage);
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-white border border-sail-line rounded-md p-3 hover:border-sail-green hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="font-semibold text-sm text-sail-ink truncate flex-1">{lead.clientName}</div>
        <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: pm.dot }} />
      </div>
      <div className="text-xs text-sail-muted truncate">{lead.region || '—'} · {lead.leadSource}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className="text-[10px] px-1.5 py-0.5 rounded font-medium"
          style={{ background: `${sm.color}1F`, color: sm.color }}
        >
          {sm.short}
        </span>
        {lead.quotationAmount > 0 && (
          <span className="text-xs font-semibold text-sail-ink">{fmtMoneyShort(lead.quotationAmount)}</span>
        )}
      </div>
    </button>
  );
}

// ---------------- Form field / section ----------------
export const inputCls =
  'w-full bg-sail-tint border border-sail-line rounded-md px-3 py-2 text-sm text-sail-ink ' +
  'placeholder:text-sail-faint focus:outline-none focus:border-sail-green focus:bg-white transition-colors';

export function FormField({ label, children }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-sail-muted font-medium mb-1 block">
        {label}
      </label>
      {children}
    </div>
  );
}

export function Section({ title, children }) {
  return (
    <div>
      <h3 className="font-display text-sm text-sail-green font-semibold mb-2 uppercase tracking-wider">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function DetailItem({ label, value, accent }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-sail-muted font-medium">{label}</div>
      <div className={`text-sm mt-0.5 ${accent ? 'font-semibold text-sail-green' : 'text-sail-ink'}`}>
        {value}
      </div>
    </div>
  );
}

// ---------------- Filter dropdown ----------------
export function FilterDropdown({ label, value, onChange, options, optionLabels }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sail-muted">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-sail-tint border border-sail-line rounded px-2 py-1 text-sail-ink focus:outline-none max-w-[140px]"
      >
        {options.map((opt, i) => (
          <option key={opt} value={opt}>{optionLabels?.[i] || opt}</option>
        ))}
      </select>
    </div>
  );
}

// ---------------- Export Menu (Excel + PDF) ----------------
export function ExportMenu({ rows, columns, title, filename, label = 'Export' }) {
  const [open, setOpen] = useState(false);
  const cols = columns || (rows[0] ? Object.keys(rows[0]) : []);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-sail-tint border border-sail-line text-sail-ink text-xs font-medium rounded-md transition-colors"
      >
        <Download className="w-3.5 h-3.5 text-sail-green" /> {label}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-sail-line rounded-md shadow-lg z-40 py-1">
            <button
              type="button"
              onClick={() => { exportRowsToExcel(rows, title, filename); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sail-ink hover:bg-sail-tint text-left"
            >
              <Table2 className="w-3.5 h-3.5 text-sail-green" /> Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => { exportRowsToPDF(title, cols, rows); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sail-ink hover:bg-sail-tint text-left"
            >
              <Printer className="w-3.5 h-3.5 text-sail-brown" /> PDF / Print
            </button>
          </div>
        </>
      )}
    </div>
  );
}
