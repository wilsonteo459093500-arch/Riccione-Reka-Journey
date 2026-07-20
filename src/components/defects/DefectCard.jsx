import { memo } from 'react';
import { ChevronRight, Image as ImageIcon, Clock } from 'lucide-react';
import { T } from '../../theme.js';
import { daysUntil } from '../../utils/helpers.js';
import { defectStatusInfo } from './statuses.js';

function DefectCard({ defect, onClick }) {
  const info = defectStatusInfo(defect.status);
  const Icon = info.icon || info.Icon;
  const photoCount = (defect.photos || []).length;
  const daysToETA = defect.eta ? daysUntil(defect.eta) : null;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 hover-lift transition-all"
      style={{
        background: T.paper,
        border: `1px solid ${T.line}`,
        borderLeft: `4px solid ${info.color}`,
        borderRadius: '2px',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 mt-1 px-2 py-1 flex items-center gap-1 text-[10px] uppercase tracking-wider"
          style={{ background: info.color, color: T.paper, borderRadius: '2px' }}
        >
          <Icon size={11} strokeWidth={1.5} />
          {info.label} · {info.en}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display text-lg leading-tight mb-1" style={{ color: T.ink }}>{defect.item}</div>
          {defect.itemEn && (
            <div className="text-xs italic mb-1" style={{ color: T.inkSoft }}>{defect.itemEn}</div>
          )}
          <div className="text-sm" style={{ color: T.ink }}>{defect.description}</div>
          <div className="flex items-center gap-3 mt-2 text-xs flex-wrap" style={{ color: T.inkSoft }}>
            {defect.discoveredBy && <span>发现人: {defect.discoveredBy}</span>}
            {defect.discoveredAtStage && <span>· 章节 {defect.discoveredAtStage}</span>}
            {defect.reorderRef && (
              <>
                <span>·</span>
                <span className="font-mono" style={{ color: T.wood }}>补货单 RO# {defect.reorderRef}</span>
              </>
            )}
            {daysToETA !== null && defect.status !== 'closed' && (
              <>
                <span>·</span>
                <span style={{ color: daysToETA < 0 ? T.terra : daysToETA <= 7 ? T.gold : T.inkSoft }}>
                  <Clock size={10} className="inline mr-1" />
                  ETA {daysToETA < 0 ? `逾 ${Math.abs(daysToETA)} 天` : daysToETA === 0 ? '今天' : `${daysToETA} 天后`}
                </span>
              </>
            )}
            {photoCount > 0 && (
              <>
                <span>·</span>
                <span className="flex items-center gap-0.5"><ImageIcon size={10} strokeWidth={1.5} />{photoCount}</span>
              </>
            )}
          </div>
          {defect.resolutionNote && defect.status === 'closed' && (
            <div className="mt-2 text-xs italic" style={{ color: T.sage }}>✓ {defect.resolutionNote}</div>
          )}
        </div>
        <ChevronRight size={16} strokeWidth={1.5} style={{ color: T.inkSoft, opacity: 0.5 }} />
      </div>
    </button>
  );
}

export default memo(DefectCard);
