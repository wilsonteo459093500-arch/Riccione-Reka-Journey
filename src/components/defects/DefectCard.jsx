import { memo } from 'react';
import { Wrench, PackageCheck, Clock, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { T } from '../../theme.js';
import { fmt } from '../../utils/helpers.js';

const STATUS_META = {
  open:    { label: '待处理',   en: 'Open',    color: '#C4543A', Icon: Wrench },
  ordered: { label: '已补货',   en: 'Ordered', color: '#B8945E', Icon: Clock },
  closed:  { label: '已解决',   en: 'Closed',  color: '#5C7A4A', Icon: CheckCircle2 },
};

function DefectCard({ defect, onClick }) {
  const sm = STATUS_META[defect.status] || STATUS_META.open;
  const sevColor = defect.severity === 'high' ? T.terra : defect.severity === 'medium' ? T.gold : T.inkSoft;
  const sevLabel = defect.severity === 'high' ? '高' : defect.severity === 'medium' ? '中' : '低';
  const photoCount = (defect.photos || []).length;
  const StatusIcon = sm.Icon;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 hover-lift transition-all"
      style={{ background: T.paper, border: `1px solid ${T.line}`, borderLeft: `3px solid ${sm.color}`, borderRadius: '2px' }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
        <div className="flex items-baseline gap-2 flex-wrap min-w-0">
          <span className="font-display text-lg leading-tight" style={{ color: T.ink }}>{defect.item}</span>
          {defect.discoveredAtStage && (
            <span className="font-mono text-[10px] px-1.5 py-0.5" style={{ background: T.wood, color: T.paper, borderRadius: '2px' }}>
              {defect.discoveredAtStage}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider" style={{ background: sevColor, color: T.paper, borderRadius: '2px' }}>{sevLabel}</span>
          <span className="px-2 py-0.5 text-[10px] flex items-center gap-1" style={{ background: sm.color, color: T.paper, borderRadius: '2px' }}>
            <StatusIcon size={10} strokeWidth={2} />{sm.label}
          </span>
        </div>
      </div>
      <div className="text-sm mt-1" style={{ color: T.ink }}>{defect.description}</div>
      <div className="flex items-center gap-3 mt-2 text-[10px]" style={{ color: T.inkSoft }}>
        {defect.discoveredBy && <span>发现: {defect.discoveredBy}</span>}
        {defect.reorderRef && (
          <span className="flex items-center gap-0.5"><PackageCheck size={10} strokeWidth={1.5} />{defect.reorderRef}</span>
        )}
        {defect.eta && defect.status !== 'closed' && (
          <span style={{ color: T.gold }}>ETA: {fmt(defect.eta)}</span>
        )}
        {photoCount > 0 && (
          <span className="flex items-center gap-0.5"><ImageIcon size={10} strokeWidth={1.5} />{photoCount}</span>
        )}
        {defect.history?.length > 0 && (
          <span>· {defect.history.length} 条记录</span>
        )}
      </div>
    </button>
  );
}

export default memo(DefectCard);
