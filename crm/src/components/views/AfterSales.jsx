import React, { useMemo, useState } from 'react';
import { LifeBuoy, CheckCircle2 } from 'lucide-react';
import { COMPLETE_STAGE } from '../../constants.js';
import { Card, ExportMenu } from '../Shared.jsx';

export default function AfterSalesView({ leads, setViewingLead }) {
  const [filter, setFilter] = useState('all'); // all | open | resolved | none

  const completed = useMemo(() =>
    leads
      .filter(l => l.salesStage === COMPLETE_STAGE)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  , [leads]);

  const withFilter = completed.filter(l => {
    const cases = l.afterSales || [];
    const open = cases.filter(c => c.status === 'open').length;
    if (filter === 'open') return open > 0;
    if (filter === 'resolved') return cases.length > 0 && open === 0;
    if (filter === 'none') return cases.length === 0;
    return true;
  });

  const totalOpen  = completed.reduce((s, l) => s + (l.afterSales || []).filter(c => c.status === 'open').length, 0);
  const totalCases = completed.reduce((s, l) => s + (l.afterSales || []).length, 0);

  const exportRows = [];
  completed.forEach(l => {
    const cases = l.afterSales || [];
    if (cases.length === 0) {
      exportRows.push({ Client: l.clientName, Region: l.region, PIC: l.pic, SO: l.soNumber || '',
        Case: 'No after-sales', Category: '', Status: 'None', 'Drive Link': '', Opened: '', Resolved: '' });
    } else {
      cases.forEach(c => exportRows.push({
        Client: l.clientName, Region: l.region, PIC: l.pic, SO: l.soNumber || '',
        Case: c.issue, Category: c.category, Status: c.status,
        'Drive Link': c.driveLink || '',
        Opened: c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-MY') : '',
        Resolved: c.resolvedAt ? new Date(c.resolvedAt).toLocaleDateString('en-MY') : '',
      }));
    }
  });

  return (
    <div className="space-y-4 pt-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-sail-ink font-semibold">After-Sales</h1>
          <p className="text-xs text-sail-muted mt-0.5">
            {completed.length} completed projects · {totalOpen} open cases · {totalCases} total cases (records kept permanently)
          </p>
        </div>
        <ExportMenu rows={exportRows} title="After-Sales" filename="Sail_AfterSales" />
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {[
          { id: 'all',      label: `All completed (${completed.length})` },
          { id: 'open',     label: `Open cases (${completed.filter(l => (l.afterSales || []).some(c => c.status === 'open')).length})` },
          { id: 'resolved', label: 'Fully resolved' },
          { id: 'none',     label: 'No issues' },
        ].map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1 text-xs font-medium rounded-full border ${
              filter === f.id ? 'bg-sail-ink text-white border-sail-ink' : 'bg-white text-sail-muted border-sail-line'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {withFilter.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <LifeBuoy className="w-10 h-10 text-sail-line mx-auto mb-3" />
            <h3 className="font-display text-lg text-sail-ink mb-1">Nothing here</h3>
            <p className="text-sm text-sail-muted">No completed projects match this filter.</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {withFilter.map(l => {
            const cases = l.afterSales || [];
            const open = cases.filter(c => c.status === 'open');
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setViewingLead(l)}
                className="text-left bg-white border border-sail-line hover:border-sail-green rounded-lg p-3 transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-sail-ink truncate">{l.clientName}</div>
                    <div className="text-[10px] text-sail-muted">{l.region} · {l.pic} · {l.soNumber || 'no SO'}</div>
                  </div>
                  {open.length > 0 ? (
                    <span className="text-[9px] uppercase tracking-wider font-semibold bg-sail-warn text-white px-1.5 py-0.5 rounded flex-shrink-0">
                      {open.length} open
                    </span>
                  ) : cases.length > 0 ? (
                    <span className="text-[9px] uppercase tracking-wider font-semibold bg-sail-green text-white px-1.5 py-0.5 rounded flex-shrink-0">
                      Resolved
                    </span>
                  ) : (
                    <span className="text-[9px] uppercase tracking-wider font-semibold bg-sail-line text-sail-muted px-1.5 py-0.5 rounded flex-shrink-0">
                      No issues
                    </span>
                  )}
                </div>
                {cases.length === 0 ? (
                  <div className="text-xs text-sail-faint flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-sail-green" /> Complete, no after-sales logged
                  </div>
                ) : (
                  <div className="space-y-1">
                    {cases.slice(0, 2).map(c => (
                      <div key={c.id} className="flex items-center gap-1.5 text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: c.status === 'open' ? '#D4A574' : '#3D5A4A' }} />
                        <span className="text-sail-muted line-clamp-1">{c.category}: {c.issue}</span>
                      </div>
                    ))}
                    {cases.length > 2 && <div className="text-[10px] text-sail-faint">+{cases.length - 2} more</div>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
