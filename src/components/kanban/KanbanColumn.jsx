import { T } from '../../theme.js';
import { OWNERS } from '../../constants/stages.js';

export default function KanbanColumn({ code, brand, brandCN, framework, owner, count, accent, done, children }) {
  return (
    <div
      className="kanban-column flex-shrink-0 flex flex-col"
      style={{ width: '300px', background: done ? 'rgba(92, 122, 74, 0.04)' : T.cream, borderRadius: '4px' }}
    >
      <div className="p-4 sticky top-0" style={{ background: 'inherit', borderBottom: `1px solid ${T.lineSoft}`, zIndex: 1 }}>
        <div className="flex items-baseline justify-between mb-1">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl leading-none" style={{ color: T.wood }}>{code}</span>
            <h3 className="font-display text-xl tracking-tight" style={{ color: T.ink }}>{brand}</h3>
          </div>
          <div className="font-mono text-xs px-2 py-0.5" style={{ background: accent, color: T.paper, borderRadius: '2px' }}>
            {count}
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px]" style={{ color: T.inkSoft }}>
          <span>{brandCN}</span>
          {(framework || owner) && (
            <span>
              {framework && <span className="font-mono">{framework}</span>}
              {framework && owner && <span> · </span>}
              {owner && <span style={{ color: OWNERS[owner].color, fontWeight: 600 }}>{OWNERS[owner].label}</span>}
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 p-3 space-y-2.5 overflow-y-auto scrollbar-thin">
        {children}
        {count === 0 && <div className="text-center py-8 text-xs" style={{ color: T.inkSoft, opacity: 0.5 }}>—</div>}
      </div>
    </div>
  );
}
