import React, { useRef, useState } from 'react';
import {
  LayoutDashboard, Columns3, Table2, BarChart3, Plus, ChevronDown,
  Database, Download, Upload, CalendarDays, LogOut, Users, LifeBuoy,
  ClipboardCheck, Ruler, Cloud, HardDrive,
} from 'lucide-react';
import { ROLES, canAddLead } from '../constants.js';

const ALL_TABS = [
  { id: 'dashboard',  label: 'Dashboard',       icon: LayoutDashboard },
  { id: 'leads',      label: 'Leads',           icon: Table2 },
  { id: 'pipeline',   label: 'Pipeline',        icon: Columns3 },
  { id: 'confirmed',  label: 'Confirmed Sales', icon: ClipboardCheck },
  { id: 'design',     label: 'Design',          icon: Ruler },
  { id: 'aftersales', label: 'After-Sales',     icon: LifeBuoy },
  { id: 'calendar',   label: 'Calendar',        icon: CalendarDays },
  { id: 'analytics',  label: 'Analytics',       icon: BarChart3 },
  { id: 'users',      label: 'Users',           icon: Users },
];

export default function Header({
  view, setView, session, allowedTabs, leadsCount,
  onAddLead, onExport, onImport, onLogout, repoMode,
}) {
  const fileInputRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const role = session?.role || 'sales';
  const rm = ROLES[role] || {};
  const tabs = ALL_TABS.filter(t => allowedTabs.includes(t.id));
  const canImportExport = role === 'manager' || role === 'sales';
  const showAddLead = canAddLead(role);

  const onPickFile = () => fileInputRef.current?.click();
  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) { onImport(f); e.target.value = ''; }
    setMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-sail-paper/95 backdrop-blur-md border-b border-sail-line safe-top">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={onFileChange}
        className="hidden"
        aria-label="Import Excel"
      />

      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sail-green to-sail-green-deep flex items-center justify-center shadow-sm flex-shrink-0">
              <span className="font-display text-white text-lg font-semibold">溪</span>
            </div>
            <div className="min-w-0">
              <div className="font-display text-sail-ink text-xl font-semibold leading-tight truncate">Sail CRM</div>
              <div className="text-[10px] text-sail-muted uppercase tracking-wider leading-tight">
                {leadsCount} leads · {repoMode === 'cloud' ? <span className="inline-flex items-center gap-0.5"><Cloud className="w-3 h-3 inline" /> cloud sync</span> : <span className="inline-flex items-center gap-0.5"><HardDrive className="w-3 h-3 inline" /> local</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-white border border-sail-line rounded-md">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                style={{ background: rm.color || '#9A8F7E' }}
              >
                {session?.username?.[0] || '?'}
              </div>
              <div className="leading-tight">
                <div className="text-xs text-sail-ink font-medium">{session?.username}</div>
                <div className="text-[9px] text-sail-muted uppercase tracking-wider">{rm.label || role}</div>
              </div>
            </div>

            {canImportExport && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-sail-tint border border-sail-line text-sail-ink text-sm font-medium rounded-md transition-colors"
                  title="Data tools"
                >
                  <Database className="w-3.5 h-3.5" />
                  <ChevronDown className="w-3 h-3" />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-sail-line rounded-md shadow-lg z-40 py-1">
                      <button onClick={() => { onExport(); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sail-ink hover:bg-sail-tint text-left">
                        <Download className="w-3.5 h-3.5 text-sail-green" /> Export all to Excel
                      </button>
                      <button onClick={onPickFile} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sail-ink hover:bg-sail-tint text-left">
                        <Upload className="w-3.5 h-3.5 text-sail-brown" /> Import from Excel
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {showAddLead && (
              <button
                type="button"
                onClick={onAddLead}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-sail-green hover:bg-sail-green-deep text-white text-sm font-medium rounded-md transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Lead</span>
              </button>
            )}

            <button
              type="button"
              onClick={onLogout}
              className="p-1.5 text-sail-muted hover:text-sail-ink hover:bg-sail-line/50 rounded-md"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto scrollbar-thin -mx-2 px-2 pb-2" role="tablist">
          {tabs.map(t => {
            const Icon = t.icon;
            const active = view === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                  active
                    ? 'bg-sail-ink text-sail-paper shadow-sm'
                    : 'text-sail-muted hover:text-sail-ink hover:bg-sail-line/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
