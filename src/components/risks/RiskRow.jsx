import { memo } from 'react';
import { X } from 'lucide-react';
import { T } from '../../theme.js';
import { fmt } from '../../utils/helpers.js';

function RiskRow({ risk, onRemove }) {
  const sc = risk.severity === 'high' ? T.terra : risk.severity === 'medium' ? T.gold : T.inkSoft;
  const sl = risk.severity === 'high' ? '高' : risk.severity === 'medium' ? '中' : '低';
  return (
    <div className="flex items-start gap-3 p-3" style={{ background: T.paper, border: `1px solid ${T.lineSoft}`, borderRadius: '2px' }}>
      <div className="flex-shrink-0 mt-1 px-2 py-0.5 text-[10px] uppercase tracking-wider" style={{ background: sc, color: T.paper, borderRadius: '2px' }}>{sl}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm" style={{ color: T.ink }}>{risk.text}</div>
        <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: T.inkSoft }}>
          <span>章节 {risk.stage}</span>
          <span>·</span>
          <span>{fmt(risk.createdAt)}</span>
        </div>
      </div>
      <button onClick={onRemove} className="flex-shrink-0 opacity-40 hover:opacity-100" style={{ color: T.inkSoft }}>
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}

export default memo(RiskRow);
