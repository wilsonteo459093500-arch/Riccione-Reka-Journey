import { useMemo, useState } from 'react';
import { Wrench } from 'lucide-react';
import { T } from '../../theme.js';
import { useConfirm } from '../ui/UIProvider.jsx';
import DefectCard from './DefectCard.jsx';
import DefectModal from './DefectModal.jsx';

const STATUS_ORDER = { open: 0, ordered: 1, arrived: 2, closed: 3 };

export default function DefectsBlock({ project, onSaveDefect, onDeleteDefect, fetchAttachment }) {
  const [editing, setEditing] = useState(null);
  const confirm = useConfirm();
  const defects = project.defects || [];

  const openCount = defects.filter((d) => d.status !== 'closed').length;
  const orderedCount = defects.filter((d) => d.status === 'ordered').length;
  const arrivedCount = defects.filter((d) => d.status === 'arrived').length;

  // Open first, then by recent activity
  const sorted = useMemo(() => {
    return [...defects].sort((a, b) => {
      if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) {
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      }
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
  }, [defects]);

  return (
    <div className="mb-12">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="font-display text-3xl" style={{ color: T.ink }}>
            售后 & 补货
            <span className="ml-3 font-body text-sm" style={{ color: T.inkSoft }}>Aftercare · Reorder Tracking</span>
          </h2>
          {defects.length > 0 && (
            <div className="text-xs mt-1" style={{ color: T.inkSoft }}>
              共 <span className="font-mono">{defects.length}</span> 项  ·{' '}
              <span className="font-mono ml-1" style={{ color: openCount > 0 ? T.terra : T.sage }}>{openCount}</span> 项待处理
              {orderedCount > 0 && (<> · <span className="font-mono" style={{ color: T.gold }}>{orderedCount}</span> 已下单</>)}
              {arrivedCount > 0 && (<> · <span className="font-mono" style={{ color: T.wood }}>{arrivedCount}</span> 已到货待装</>)}
            </div>
          )}
        </div>
        <button onClick={() => setEditing({ isNew: true })} className="text-sm flex items-center gap-1.5 px-3 py-1.5" style={{ background: 'transparent', color: T.terra, border: `1px solid ${T.terra}`, borderRadius: '2px' }}>
          <Wrench size={13} />登记缺陷 / Log Defect
        </button>
      </div>

      {defects.length === 0 ? (
        <div className="text-center py-10 text-sm" style={{ color: T.inkSoft, background: T.cream, borderRadius: '2px' }}>
          ✓ 当前无缺陷登记 / No defects registered
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((d) => (
            <DefectCard key={d.id} defect={d} onClick={() => setEditing(d)} />
          ))}
        </div>
      )}

      {editing && (
        <DefectModal
          project={project}
          defect={editing.isNew ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(d, uploads) => { onSaveDefect(d, uploads); setEditing(null); }}
          onDelete={async () => {
            if (!editing.isNew && (await confirm({ title: '删除缺陷工单', message: '确定删除此条? 历史记录也会一并删除。', danger: true, confirmText: '删除' }))) {
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
