import { memo } from 'react';
import { User, Trash2, MapPin } from 'lucide-react';
import { T } from '../../theme.js';
import { getApptTypeMeta } from '../../constants/calendar.js';
import { useConfirm } from '../ui/UIProvider.jsx';

function ApptCard({ appt, project, onDelete, onOpenProject, showDate }) {
  const tm = getApptTypeMeta(appt.type);
  const confirm = useConfirm();

  const handleDelete = async () => {
    if (await confirm({ title: '删除日程', message: `确定删除「${tm.label}」${appt.projectName ? ' · ' + appt.projectName : ''}?`, danger: true, confirmText: '删除' })) {
      onDelete();
    }
  };

  return (
    <div
      className="p-2.5"
      style={{
        background: T.paper,
        border: `1px solid ${T.lineSoft}`,
        borderLeft: `3px solid ${tm.color}`,
        borderRadius: '2px',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: T.ink }}>{tm.label}</span>
            {appt.time && <span className="text-[10px]" style={{ color: T.inkSoft }}>· {appt.time}</span>}
          </div>
          {showDate && (
            <div className="text-[10px] mt-0.5" style={{ color: T.inkSoft }}>
              {new Date(appt.date).toLocaleDateString('zh-CN', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          )}
          {appt.projectName && (
            <button
              onClick={() => project && onOpenProject?.(project)}
              disabled={!project}
              className="text-[11px] mt-0.5 block truncate text-left"
              style={{ color: project ? T.wood : T.inkSoft, textDecoration: project ? 'underline' : 'none' }}
            >
              {appt.projectName}
            </button>
          )}
          {appt.address && (
            <div className="flex items-start gap-1 text-[10px] mt-0.5" style={{ color: T.inkSoft }}>
              <MapPin size={10} strokeWidth={1.5} className="mt-0.5 flex-shrink-0" />
              <span className="line-clamp-1">{appt.address}</span>
            </div>
          )}
          {appt.notes && (
            <div className="text-[10px] italic mt-0.5 line-clamp-2" style={{ color: T.inkSoft }}>{appt.notes}</div>
          )}
          {appt.pic && (
            <div className="flex items-center gap-1 mt-1 text-[10px]" style={{ color: T.inkSoft }}>
              <User size={10} strokeWidth={1.5} />
              {appt.pic}
            </div>
          )}
        </div>
        <button onClick={handleDelete} className="opacity-40 hover:opacity-100 flex-shrink-0" style={{ color: T.terra }}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

export default memo(ApptCard);
