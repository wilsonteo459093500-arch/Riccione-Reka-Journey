import { useMemo, useState } from 'react';
import { LifeBuoy, Plus, CheckCircle2 } from 'lucide-react';
import { T } from '../../theme.js';
import { useConfirm } from '../ui/UIProvider.jsx';
import AfterSalesCard from './AfterSalesCard.jsx';
import AfterSalesModal from './AfterSalesModal.jsx';

// Shown after the project reaches Stage H (handover). Tracks
// post-delivery warranty / repair / adjustment / maintenance tickets.
// Records stay permanently for warranty audit + client history.
export default function AfterSalesBlock({ project, onSave, onDelete, onResolve }) {
  const [editing, setEditing] = useState(null);
  const confirm = useConfirm();

  const tickets = project.afterSales || [];

  const { open, resolved } = useMemo(() => {
    const open = tickets.filter((t) => t.status !== 'resolved');
    const resolved = tickets.filter((t) => t.status === 'resolved');
    return { open, resolved };
  }, [tickets]);

  // Sort: open by createdAt desc, resolved by resolvedAt desc
  const sortedOpen = [...open].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const sortedResolved = [...resolved].sort((a, b) => (b.resolvedAt || '').localeCompare(a.resolvedAt || ''));

  return (
    <div className="mb-12">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="font-display text-3xl flex items-center gap-2" style={{ color: T.ink }}>
            <LifeBuoy size={22} strokeWidth={1.5} style={{ color: T.wood }} />
            售后服务
            <span className="ml-3 font-body text-sm" style={{ color: T.inkSoft }}>After-Sales · Post-handover tickets</span>
          </h2>
          {tickets.length > 0 && (
            <div className="text-xs mt-1" style={{ color: T.inkSoft }}>
              共 <span className="font-mono">{tickets.length}</span> 单 ·
              <span className="font-mono ml-1" style={{ color: open.length > 0 ? T.terra : T.sage }}>{open.length}</span> 个待处理 ·
              <span className="font-mono ml-1" style={{ color: T.sage }}>{resolved.length}</span> 已完成
            </div>
          )}
        </div>
        <button
          onClick={() => setEditing({ isNew: true })}
          className="text-sm flex items-center gap-1.5 px-3 py-1.5"
          style={{ background: 'transparent', color: T.wood, border: `1px solid ${T.wood}`, borderRadius: '2px' }}
        >
          <Plus size={13} />登记售后 / Log After-Sales
        </button>
      </div>

      {tickets.length === 0 ? (
        <div className="text-center py-10 px-4" style={{ background: T.cream, borderRadius: '2px' }}>
          <CheckCircle2 size={32} strokeWidth={1} className="mx-auto mb-2" style={{ color: T.sage }} />
          <div className="text-sm" style={{ color: T.inkSoft }}>
            暂无售后工单 / No after-sales tickets · 客户报修或保养时在此登记, 记录永久保留。
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedOpen.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: T.inkSoft }}>
                待处理 · Open ({sortedOpen.length})
              </div>
              <div className="space-y-2">
                {sortedOpen.map((t) => (
                  <AfterSalesCard key={t.id} ticket={t} onClick={() => setEditing(t)} />
                ))}
              </div>
            </div>
          )}
          {sortedResolved.length > 0 && (
            <div className="pt-2">
              <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: T.inkSoft }}>
                已处理 · Resolved ({sortedResolved.length})
              </div>
              <div className="space-y-2">
                {sortedResolved.map((t) => (
                  <AfterSalesCard key={t.id} ticket={t} onClick={() => setEditing(t)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {editing && (
        <AfterSalesModal
          ticket={editing.isNew ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(ticket) => { onSave(ticket); setEditing(null); }}
          onResolve={(payload) => {
            onResolve(editing.id, payload);
            setEditing(null);
          }}
          onDelete={async () => {
            if (!editing.isNew && (await confirm({ title: '删除售后工单', message: '确定删除此条? 历史记录将一并删除。', danger: true, confirmText: '删除' }))) {
              onDelete(editing.id);
              setEditing(null);
            }
          }}
        />
      )}
    </div>
  );
}
