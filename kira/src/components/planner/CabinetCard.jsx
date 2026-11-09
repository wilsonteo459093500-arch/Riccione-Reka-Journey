// 房间里的积木柜卡片：小图 + 名称尺寸 + 金额；点一下进编辑器
import { Pencil, Copy, Trash2 } from 'lucide-react';
import { T } from '../../theme.js';
import { fmtMYR } from '../../constants/pricing.js';
import { templateOf, cabinetSummary } from '../../planner/templates.js';
import CabinetPics from './CabinetPics.jsx';

export default function CabinetCard({ cab, total, lang, onEdit, onDuplicate, onRemove }) {
  const t = templateOf(cab.template);
  return (
    <div className="rounded p-2.5 flex gap-3 items-stretch" style={{ background: T.cream, border: `1px solid ${T.lineSoft}` }}>
      <button onClick={onEdit} className="shrink-0 p-1.5 flex items-center justify-center" style={{ background: '#fff', borderRadius: 2, maxWidth: '42%' }} title="Edit 编辑">
        <CabinetPics cab={cab} lang={lang} height="64px" dims={false} gap={4} />
      </button>
      <button onClick={onEdit} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 font-medium" style={{ background: T.ink, color: T.paper }}>{cab.code}</span>
          <span className="text-sm truncate" style={{ color: T.ink }}>{cab.name || `${t.zh} ${t.en}`}</span>
        </div>
        <div className="text-xs mt-1" style={{ color: T.inkSoft }}>
          {cabinetSummary(cab)}
        </div>
        <div className="flex items-center justify-between flex-wrap gap-x-2 mt-2">
          <span className="text-[11px] flex items-center gap-1 whitespace-nowrap" style={{ color: T.wood }}><Pencil size={11} /> Edit 编辑</span>
          <span className="font-display text-lg whitespace-nowrap" style={{ color: T.ink }}>{fmtMYR(total)}</span>
        </div>
      </button>
      <div className="flex flex-col justify-between shrink-0">
        <button onClick={onDuplicate} title="Duplicate 复制" className="p-1" style={{ color: T.inkSoft }}><Copy size={14} /></button>
        <button onClick={onRemove} title="Delete 删除" className="p-1" style={{ color: T.terra }}><Trash2 size={14} /></button>
      </div>
    </div>
  );
}
