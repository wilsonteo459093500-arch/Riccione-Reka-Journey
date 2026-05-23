import { useMemo, useState } from 'react';
import { Plus, Wrench, Clock, CheckCircle2 } from 'lucide-react';
import { T } from '../../theme.js';
import { useConfirm } from '../ui/UIProvider.jsx';
import DefectCard from './DefectCard.jsx';
import DefectModal from './DefectModal.jsx';

export default function DefectsBlock({ project, onSaveDefect, onDeleteDefect, fetchAttachment }) {
  const [editing, setEditing] = useState(null); // existing defect or { isNew: true }
  const confirm = useConfirm();

  const defects = useMemo(
    () => [...(project.defects || [])].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [project.defects]
  );

  const counts = useMemo(() => {
    const c = { open: 0, ordered: 0, closed: 0 };
    defects.forEach((d) => { c[d.status] = (c[d.status] || 0) + 1; });
    return c;
  }, [defects]);

  return (
    <div className="mb-12">
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="font-display text-3xl" style={{ color: T.ink }}>
            缺陷 & 补货  <span className="ml-3 font-body text-sm" style={{ color: T.inkSoft }}>Defects & Reorders</span>
          </h2>
          {defects.length > 0 && (
            <div className="text-xs mt-1 flex items-center gap-3 flex-wrap" style={{ color: T.inkSoft }}>
              <span className="flex items-center gap-1"><Wrench size={11} style={{ color: T.terra }} />待处理 <span className="font-mono" style={{ color: T.ink }}>{counts.open}</span></span>
              <span className="flex items-center gap-1"><Clock size={11} style={{ color: T.gold }} />已补货 <span className="font-mono" style={{ color: T.ink }}>{counts.ordered}</span></span>
              <span className="flex items-center gap-1"><CheckCircle2 size={11} style={{ color: T.sage }} />已解决 <span className="font-mono" style={{ color: T.ink }}>{counts.closed}</span></span>
            </div>
          )}
        </div>
        <button onClick={() => setEditing({ isNew: true })} className="text-sm flex items-center gap-1.5 px-3 py-1.5" style={{ background: 'transparent', color: T.wood, border: `1px solid ${T.wood}`, borderRadius: '2px' }}>
          <Plus size={13} />登记缺陷
        </button>
      </div>

      {defects.length === 0 ? (
        <div className="text-center py-10 text-sm" style={{ color: T.inkSoft, background: T.cream, borderRadius: '2px' }}>
          ✓ 当前无缺陷记录 / No defects on file
        </div>
      ) : (
        <div className="space-y-2">
          {defects.map((d) => (
            <DefectCard key={d.id} defect={d} onClick={() => setEditing(d)} />
          ))}
        </div>
      )}

      {editing && (
        <DefectModal
          defect={editing.isNew ? null : editing}
          defaultAuthor={project.assigned?.SS}
          onClose={() => setEditing(null)}
          onSave={(d, uploads) => { onSaveDefect(d, uploads); setEditing(null); }}
          onDelete={async () => {
            if (!editing.isNew && (await confirm({ title: '删除缺陷记录', message: '确定删除此条? 历史记录也会一并删除。', danger: true, confirmText: '删除' }))) {
              onDeleteDefect(editing.id);
              setEditing(null);
            }
          }}
          fetchAttachment={fetchAttachment}
        />
      )}
    </div>
  );
}
