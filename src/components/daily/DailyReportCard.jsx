import { memo } from 'react';
import { Droplets, Zap, DoorClosed, Sparkle, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { T } from '../../theme.js';
import { SafetyDot } from './Safety.jsx';

function DailyReportCard({ report, dayNumber, onClick }) {
  const c = report.eodChecks || {};
  const allClosed = c.water && c.electric && c.closure && c.cleanup;
  const photoCount = (report.photos || []).length;
  const preview = (report.progress || '').slice(0, 80);

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 hover-lift transition-all"
      style={{ background: T.paper, border: `1px solid ${T.line}`, borderLeft: `3px solid ${allClosed ? T.sage : T.gold}`, borderRadius: '2px' }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-lg" style={{ color: T.ink }}>Day {dayNumber}</span>
          <span className="font-mono text-xs" style={{ color: T.inkSoft }}>{report.date}</span>
          {report.author && <span className="text-xs" style={{ color: T.inkSoft }}>· {report.author}</span>}
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <SafetyDot active={c.water} label="水" Icon={Droplets} />
          <SafetyDot active={c.electric} label="电" Icon={Zap} />
          <SafetyDot active={c.closure} label="门窗" Icon={DoorClosed} />
          <SafetyDot active={c.cleanup} label="清理" Icon={Sparkle} />
        </div>
      </div>
      {preview && (
        <div className="text-sm mt-1" style={{ color: T.ink }}>
          {preview}{(report.progress || '').length > 80 ? '…' : ''}
        </div>
      )}
      <div className="flex items-center gap-3 mt-2 text-[10px]" style={{ color: T.inkSoft }}>
        {photoCount > 0 && (
          <span className="flex items-center gap-0.5"><ImageIcon size={10} strokeWidth={1.5} />{photoCount} 张照片</span>
        )}
        {report.issues && (
          <span className="flex items-center gap-0.5" style={{ color: T.terra }}>
            <AlertTriangle size={10} strokeWidth={1.5} />有障碍记录
          </span>
        )}
        {report.eodNote && <span>· 含明日计划</span>}
      </div>
    </button>
  );
}

export default memo(DailyReportCard);
