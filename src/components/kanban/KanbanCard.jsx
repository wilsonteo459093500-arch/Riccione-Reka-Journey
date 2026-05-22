import { memo, useMemo } from 'react';
import { Calendar, Paperclip, AlertTriangle } from 'lucide-react';
import { T } from '../../theme.js';
import { daysUntil, currentStage, stageProgress, avatarFor } from '../../utils/helpers.js';

function KanbanCard({ project, onClick, done }) {
  const daysToMove = daysUntil(project.moveIn);
  const stage = currentStage(project);
  const sp = stageProgress(project, stage);
  const attachmentCount = useMemo(
    () => Object.values(project.attachments || {}).reduce((a, b) => a + b.length, 0),
    [project.attachments]
  );
  const assignees = useMemo(
    () => Object.values(project.assigned || {}).filter(Boolean),
    [project.assigned]
  );

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 hover-lift transition-all"
      style={{
        background: T.paper,
        border: `1px solid ${T.line}`,
        borderLeft: done ? `3px solid ${T.sage}` : `3px solid ${T.wood}`,
        borderRadius: '2px',
      }}
    >
      <div className="font-display text-base leading-tight mb-1" style={{ color: T.ink }}>{project.name}</div>
      <div className="text-xs mb-2" style={{ color: T.inkSoft }}>{project.client} · {project.propertyType}</div>

      {!done && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-[10px] mb-1" style={{ color: T.inkSoft }}>
            <span>{stage.framework}</span>
            <span className="font-mono">{sp.done}/{sp.total}</span>
          </div>
          <div className="h-1" style={{ background: T.lineSoft }}>
            <div className="h-full transition-all duration-500" style={{ background: T.wood, width: `${sp.pct}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
        <div className="flex items-center gap-1 -space-x-1">
          {assignees.slice(0, 4).map((name, i) => {
            const a = avatarFor(name);
            return (
              a && (
                <div
                  key={i}
                  title={name}
                  className="flex items-center justify-center font-mono text-[9px] uppercase"
                  style={{ width: 18, height: 18, borderRadius: '50%', background: a.color, color: T.paper, border: `2px solid ${T.paper}`, fontWeight: 600 }}
                >
                  {a.initial}
                </div>
              )
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-[10px]">
          <div
            className="flex items-center gap-0.5"
            style={{ color: daysToMove !== null && daysToMove < 0 ? T.terra : daysToMove !== null && daysToMove <= 30 ? T.gold : T.inkSoft }}
          >
            <Calendar size={10} strokeWidth={1.5} />
            {daysToMove !== null
              ? daysToMove < 0
                ? `逾${Math.abs(daysToMove)}d`
                : daysToMove === 0
                ? '今天'
                : `+${daysToMove}d`
              : '未定'}
          </div>
          {attachmentCount > 0 && (
            <div className="flex items-center gap-0.5" style={{ color: T.inkSoft }}>
              <Paperclip size={10} strokeWidth={1.5} />
              {attachmentCount}
            </div>
          )}
          {(project.risks?.length || 0) > 0 && (
            <div className="flex items-center gap-0.5" style={{ color: T.terra }}>
              <AlertTriangle size={10} strokeWidth={1.5} />
              {project.risks.length}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

export default memo(KanbanCard);
