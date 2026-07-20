import { memo } from 'react';
import { ChevronRight, ExternalLink, CheckCircle2 } from 'lucide-react';
import { T } from '../../theme.js';
import { fmt } from '../../utils/helpers.js';
import { getAfterSalesCategory } from './constants.js';

function AfterSalesCard({ ticket, onClick }) {
  const cat = getAfterSalesCategory(ticket.category);
  const Icon = cat.Icon;
  const resolved = ticket.status === 'resolved';

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 hover-lift transition-all"
      style={{
        background: resolved ? T.cream : T.paper,
        border: `1px solid ${T.line}`,
        borderLeft: `4px solid ${resolved ? T.sage : cat.color}`,
        borderRadius: '2px',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 mt-1 px-2 py-1 flex items-center gap-1 text-[10px] uppercase tracking-wider"
          style={{ background: resolved ? T.sage : cat.color, color: T.paper, borderRadius: '2px' }}
        >
          <Icon size={11} strokeWidth={1.5} />
          {cat.label}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm" style={{ color: T.ink, fontWeight: 500 }}>{ticket.issue}</div>
          <div className="flex items-center gap-3 mt-1 text-[11px] flex-wrap" style={{ color: T.inkSoft }}>
            <span>登记 {fmt(ticket.createdAt)}{ticket.createdBy ? ` · ${ticket.createdBy}` : ''}</span>
            {resolved && (
              <>
                <span>·</span>
                <span style={{ color: T.sage }}>
                  ✓ 已处理 {ticket.resolvedAt ? fmt(ticket.resolvedAt) : ''}
                </span>
              </>
            )}
            {ticket.driveLink && (
              <a
                href={ticket.driveLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 hover:underline"
                style={{ color: T.wood }}
              >
                <ExternalLink size={10} strokeWidth={1.5} />Drive
              </a>
            )}
          </div>
          {resolved && ticket.resolutionNote && (
            <div className="mt-1.5 text-xs italic flex items-start gap-1" style={{ color: T.sage }}>
              <CheckCircle2 size={11} strokeWidth={1.5} className="flex-shrink-0 mt-0.5" />
              <span>{ticket.resolutionNote}</span>
            </div>
          )}
        </div>
        <ChevronRight size={16} strokeWidth={1.5} style={{ color: T.inkSoft, opacity: 0.5 }} />
      </div>
    </button>
  );
}

export default memo(AfterSalesCard);
