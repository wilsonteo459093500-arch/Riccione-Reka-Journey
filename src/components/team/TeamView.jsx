import { useMemo, useState } from 'react';
import { T } from '../../theme.js';
import { STAGES, OWNERS } from '../../constants/stages.js';
import { isComplete, stageProgress, avatarFor } from '../../utils/helpers.js';
import SimpleCard from './SimpleCard.jsx';

export default function TeamView({ projects, onOpen }) {
  const [selectedRole, setSelectedRole] = useState('SD');

  const personLoad = useMemo(() => {
    const map = {};
    projects.forEach((p) => {
      if (isComplete(p)) return;
      const person = p.assigned?.[selectedRole] || '— 未分配 —';
      if (!map[person]) map[person] = { active: [], gates: 0, gatesDone: 0 };
      map[person].active.push(p);
      const stage = STAGES.find((s) => s.owner === selectedRole);
      if (stage) {
        const sp = stageProgress(p, stage);
        map[person].gates += sp.total;
        map[person].gatesDone += sp.done;
      }
    });
    return map;
  }, [projects, selectedRole]);

  return (
    <div className="fade-up">
      <div className="mb-8">
        <h1 className="font-display text-5xl mb-2" style={{ color: T.ink }}>团队</h1>
        <p className="text-sm" style={{ color: T.inkSoft }}>Team · 按岗位查看工作负载</p>
      </div>

      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {Object.keys(OWNERS).map((k) => (
          <button
            key={k}
            onClick={() => setSelectedRole(k)}
            className="px-5 py-3 text-sm flex items-center gap-2 transition-all"
            style={{ background: selectedRole === k ? T.ink : 'transparent', color: selectedRole === k ? T.paper : T.inkSoft, border: `1px solid ${selectedRole === k ? T.ink : T.line}`, borderRadius: '2px' }}
          >
            <span className="font-mono" style={{ color: selectedRole === k ? T.paper : OWNERS[k].color }}>{OWNERS[k].label}</span>
            <span className="text-xs opacity-80">{OWNERS[k].full.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      <div className="mb-6 p-4" style={{ background: T.cream, borderRadius: '2px' }}>
        <div className="text-xs" style={{ color: T.inkSoft }}>
          {OWNERS[selectedRole].label} 主理章节:{' '}
          {STAGES.filter((s) => s.owner === selectedRole).map((s) => (
            <span key={s.code} className="ml-1 px-2 py-0.5 inline-block" style={{ background: T.paper, color: T.ink, borderRadius: '2px' }}>
              {s.code} · {s.name}
            </span>
          ))}
        </div>
      </div>

      {Object.keys(personLoad).length === 0 ? (
        <div className="text-center py-16" style={{ color: T.inkSoft }}>暂无进行中项目</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(personLoad).map(([person, data]) => {
            const a = avatarFor(person);
            return (
              <div key={person}>
                <div className="flex items-baseline justify-between mb-3">
                  <div className="flex items-baseline gap-3">
                    {a && (
                      <span className="inline-flex items-center justify-center font-mono text-sm" style={{ width: 32, height: 32, borderRadius: '50%', background: a.color, color: T.paper }}>
                        {a.initial}
                      </span>
                    )}
                    <h2 className="font-display text-2xl" style={{ color: T.ink }}>{person}</h2>
                    <span className="text-xs" style={{ color: T.inkSoft }}>
                      {data.active.length} 个项目
                      {data.gates > 0 && <> · 主理章节 {data.gatesDone}/{data.gates} gates</>}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {data.active.map((p) => (
                    <SimpleCard key={p.id} project={p} onClick={() => onOpen(p.id)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
