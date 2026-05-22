import { memo } from 'react';
import { T } from '../../theme.js';
import { currentStage, stageProgress } from '../../utils/helpers.js';

function SimpleCard({ project, onClick }) {
  const cur = currentStage(project);
  const sp = stageProgress(project, cur);
  return (
    <button
      onClick={onClick}
      className="text-left p-4 hover-lift"
      style={{ background: T.paper, border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.wood}`, borderRadius: '2px' }}
    >
      <div className="font-display text-lg leading-tight mb-1" style={{ color: T.ink }}>{project.name}</div>
      <div className="text-xs mb-3" style={{ color: T.inkSoft }}>{project.client} · {project.propertyType}</div>
      <div className="flex items-center justify-between text-xs" style={{ color: T.inkSoft }}>
        <span>
          <span className="font-display text-base mr-1" style={{ color: T.wood }}>{cur.code}</span>
          {cur.name}
        </span>
        <span className="font-mono">{sp.done}/{sp.total}</span>
      </div>
    </button>
  );
}

export default memo(SimpleCard);
