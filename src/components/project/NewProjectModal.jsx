import { useState } from 'react';
import { X } from 'lucide-react';
import { T } from '../../theme.js';
import { LabeledInput, LabeledSelect } from '../ui/Inputs.jsx';

export default function NewProjectModal({ onClose, onCreate }) {
  const [data, setData] = useState({ name: '', client: '', address: '', propertyType: '公寓 Condo', area: '', moveIn: '' });
  const canCreate = data.name.trim() && data.client.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(45, 62, 54, 0.35)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div className="w-full max-w-lg p-8 fade-up" style={{ background: T.paper, borderRadius: '2px', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="font-display text-3xl" style={{ color: T.ink }}>新建项目</h2>
          <button onClick={onClose} style={{ color: T.inkSoft }}>
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>
        <div className="space-y-4">
          <LabeledInput label="项目名称 Project Name *" value={data.name} onChange={(v) => setData({ ...data, name: v })} placeholder="例: Bukit Jelutong · 林宅" />
          <LabeledInput label="客户 Client *" value={data.client} onChange={(v) => setData({ ...data, client: v })} placeholder="例: Mr. Lim" />
          <LabeledInput label="地址 Address" value={data.address} onChange={(v) => setData({ ...data, address: v })} placeholder="例: Bukit Jelutong, Shah Alam" />
          <div className="grid grid-cols-2 gap-3">
            <LabeledSelect
              label="房屋类型 Type"
              value={data.propertyType}
              onChange={(v) => setData({ ...data, propertyType: v })}
              options={['毛胚房 Bare', '精装房 Renovated', '公寓 Condo', '半独立 Semi-D', '别墅 Villa', '旧屋改造 Reno']}
            />
            <LabeledInput label="面积 Area" value={data.area} onChange={(v) => setData({ ...data, area: v })} placeholder="例: 150㎡" />
          </div>
          <LabeledInput label="预计入住 Move-in Date" type="date" value={data.moveIn} onChange={(v) => setData({ ...data, moveIn: v })} />
        </div>
        <div className="flex gap-3 mt-8">
          <button
            onClick={() => canCreate && onCreate(data)}
            disabled={!canCreate}
            className="flex-1 py-3 text-sm"
            style={{ background: canCreate ? T.ink : T.line, color: T.paper, borderRadius: '2px', cursor: canCreate ? 'pointer' : 'not-allowed' }}
          >
            创建项目
          </button>
          <button onClick={onClose} className="px-6 py-3 text-sm" style={{ color: T.inkSoft, border: `1px solid ${T.line}`, borderRadius: '2px' }}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
