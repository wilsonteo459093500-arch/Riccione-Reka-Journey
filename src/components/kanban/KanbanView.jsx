import { useMemo, useState } from 'react';
import { T } from '../../theme.js';
import { STAGES } from '../../constants/stages.js';
import { isComplete, currentStage } from '../../utils/helpers.js';
import KanbanColumn from './KanbanColumn.jsx';
import KanbanCard from './KanbanCard.jsx';

export default function KanbanView({ projects, onOpen }) {
  const [ownerFilter, setOwnerFilter] = useState('all');

  const filtered = useMemo(() => {
    if (ownerFilter === 'all') return projects;
    return projects.filter((p) =>
      Object.values(p.assigned || {}).some((n) => n && n.toLowerCase().includes(ownerFilter.toLowerCase()))
    );
  }, [projects, ownerFilter]);

  const columns = useMemo(() => {
    const cols = {};
    STAGES.forEach((s) => {
      cols[s.code] = [];
    });
    cols.DONE = [];
    filtered.forEach((p) => {
      if (isComplete(p)) cols.DONE.push(p);
      else cols[currentStage(p).code].push(p);
    });
    Object.keys(cols).forEach((k) => {
      cols[k].sort((a, b) => {
        const da = a.moveIn ? new Date(a.moveIn).getTime() : Infinity;
        const db = b.moveIn ? new Date(b.moveIn).getTime() : Infinity;
        return da - db;
      });
    });
    return cols;
  }, [filtered]);

  const people = useMemo(() => {
    const set = new Set();
    projects.forEach((p) => Object.values(p.assigned || {}).forEach((n) => n && set.add(n)));
    return Array.from(set).sort();
  }, [projects]);

  return (
    <div className="fade-up">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 pt-10 pb-6">
        <div className="flex items-baseline justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-5xl mb-1" style={{ color: T.ink }}>看板</h1>
            <p className="text-sm" style={{ color: T.inkSoft }}>
              Projects flow through Five Chapters · 项目按当前章节自动归位
            </p>
          </div>
          {people.length > 0 && (
            <div className="flex items-center gap-2 text-xs overflow-x-auto scrollbar-thin pb-1">
              <span style={{ color: T.inkSoft }}>筛选:</span>
              <button
                onClick={() => setOwnerFilter('all')}
                className="px-3 py-1 whitespace-nowrap"
                style={{
                  background: ownerFilter === 'all' ? T.ink : 'transparent',
                  color: ownerFilter === 'all' ? T.paper : T.inkSoft,
                  border: `1px solid ${ownerFilter === 'all' ? T.ink : T.line}`,
                  borderRadius: '2px',
                }}
              >
                全部
              </button>
              {people.map((p) => (
                <button
                  key={p}
                  onClick={() => setOwnerFilter(p)}
                  className="px-3 py-1 whitespace-nowrap"
                  style={{
                    background: ownerFilter === p ? T.ink : 'transparent',
                    color: ownerFilter === p ? T.paper : T.inkSoft,
                    border: `1px solid ${ownerFilter === p ? T.ink : T.line}`,
                    borderRadius: '2px',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="kanban-scroll overflow-x-auto px-6 lg:px-10 pb-12 scrollbar-thin">
        <div className="flex gap-4" style={{ minHeight: 'calc(100vh - 280px)' }}>
          {STAGES.map((stage) => (
            <KanbanColumn
              key={stage.code}
              code={stage.code}
              brand={stage.name}
              brandCN={stage.nameCN}
              framework={stage.framework}
              owner={stage.owner}
              count={columns[stage.code].length}
              accent={T.wood}
            >
              {columns[stage.code].map((p) => (
                <KanbanCard key={p.id} project={p} onClick={() => onOpen(p.id)} />
              ))}
            </KanbanColumn>
          ))}
          <KanbanColumn code="✓" brand="DELIVERED" brandCN="已交付" framework="" owner={null} count={columns.DONE.length} accent={T.sage} done>
            {columns.DONE.map((p) => (
              <KanbanCard key={p.id} project={p} onClick={() => onOpen(p.id)} done />
            ))}
          </KanbanColumn>
        </div>
      </div>
    </div>
  );
}
