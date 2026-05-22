import { useMemo } from 'react';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { T } from '../../theme.js';
import { fmt } from '../../utils/helpers.js';

export default function RisksView({ projects, onOpen }) {
  const allRisks = useMemo(() => {
    const out = [];
    projects.forEach((p) => (p.risks || []).forEach((r) => out.push({ ...r, project: p })));
    const so = { high: 0, medium: 1, low: 2 };
    out.sort((a, b) =>
      so[a.severity] !== so[b.severity] ? so[a.severity] - so[b.severity] : new Date(a.createdAt) - new Date(b.createdAt)
    );
    return out;
  }, [projects]);

  return (
    <div className="fade-up">
      <div className="mb-8">
        <h1 className="font-display text-5xl mb-2" style={{ color: T.ink }}>风险</h1>
        <p className="text-sm" style={{ color: T.inkSoft }}>Risks · 跨项目汇总, 按严重程度排序</p>
      </div>

      {allRisks.length === 0 ? (
        <div className="text-center py-20" style={{ background: T.cream, borderRadius: '2px' }}>
          <CheckCircle2 size={48} strokeWidth={1} className="mx-auto mb-4" style={{ color: T.sage }} />
          <div className="font-display text-2xl mb-1" style={{ color: T.ink }}>全部清空</div>
          <div className="text-sm" style={{ color: T.inkSoft }}>当前无登记风险</div>
        </div>
      ) : (
        <div className="space-y-3">
          {allRisks.map((r, idx) => (
            <button
              key={r.id}
              onClick={() => onOpen(r.project.id)}
              className="w-full text-left p-5 flex items-start gap-4 hover-lift fade-up"
              style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: '2px', animationDelay: `${0.04 * idx}s` }}
            >
              <div
                className="flex-shrink-0 mt-1 px-2 py-1 text-[10px] uppercase tracking-wider"
                style={{ background: r.severity === 'high' ? T.terra : r.severity === 'medium' ? T.gold : T.inkSoft, color: T.paper, borderRadius: '2px' }}
              >
                {r.severity === 'high' ? '高' : r.severity === 'medium' ? '中' : '低'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base mb-1" style={{ color: T.ink }}>{r.text}</div>
                <div className="flex items-center gap-2 text-xs" style={{ color: T.inkSoft }}>
                  <span className="font-display text-base" style={{ color: T.wood }}>{r.project.name}</span>
                  <span>·</span>
                  <span>{r.project.client}</span>
                  <span>·</span>
                  <span>章节 {r.stage}</span>
                  <span>·</span>
                  <span>{fmt(r.createdAt)}</span>
                </div>
              </div>
              <ChevronRight size={18} strokeWidth={1.5} style={{ color: T.inkSoft }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
