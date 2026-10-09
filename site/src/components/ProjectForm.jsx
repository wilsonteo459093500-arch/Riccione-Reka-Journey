// 项目资料：填一次，所有报告自动带入（地址、SO、客户、导航、进场须知…）
import { useState } from 'react';
import Icon from './ui/Icon.jsx';

export const PROJECT_FIELDS = [
  { key: 'name', label: '项目 / 楼盘名称', placeholder: '例：Tuai Timur Residence', required: true },
  { key: 'unit', label: '单位号', placeholder: '例：17-3' },
  { key: 'client', label: '客户称呼', placeholder: '例：Hailey' },
  { key: 'so', label: 'SO 编号', placeholder: '例：SO-2026-0917' },
  { key: 'address', label: '完整地址', placeholder: '门牌 / 路名 / 邮编 / 城市', type: 'textarea' },
  { key: 'mapLink', label: '导航链接（Google Maps / Waze）', placeholder: 'https://maps.app.goo.gl/…', type: 'url' },
  { key: 'designer', label: '设计师', placeholder: '例：Mei Ling' },
  { key: 'startDate', label: '安装开工日期', type: 'date' },
  { key: 'plannedDays', label: '预计安装天数', placeholder: '例：5', type: 'number', hint: '每日汇报会自动倒数剩余天数' },
  { key: 'entryNote', label: '进场登记须知', placeholder: '例：Guard house 登记，带护照' },
  { key: 'parking', label: '停车', placeholder: '例：访客停车场' },
  { key: 'notes', label: '备注', type: 'textarea', placeholder: '物业规定、施工时段、钥匙…' },
];

export default function ProjectForm({ initial = {}, onSave, onCancel, onDelete, compact = false }) {
  const [p, setP] = useState({ entryNote: 'Guard house 登记，带护照', parking: '访客停车场', ...initial });
  const fields = compact ? PROJECT_FIELDS.filter((f) => ['name', 'unit', 'client', 'so', 'address', 'mapLink'].includes(f.key)) : PROJECT_FIELDS;
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const valid = (p.name || '').trim().length > 0;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave({ ...p, name: p.name.trim() });
      }}
    >
      {fields.map((f) => (
        <div key={f.key}>
          <label className="label">
            {f.label}
            {f.required && <span className="ml-1 text-terra">*</span>}
          </label>
          {f.type === 'textarea' ? (
            <textarea className="input resize-none" rows={2} value={p[f.key] || ''} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
          ) : (
            <input
              className="input"
              type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'url' ? 'url' : 'text'}
              inputMode={f.type === 'number' ? 'numeric' : undefined}
              value={p[f.key] ?? ''}
              placeholder={f.placeholder}
              onChange={(e) => set(f.key, f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
            />
          )}
          {f.hint && <div className="mt-1 text-[12px] text-ink-mute">{f.hint}</div>}
        </div>
      ))}
      <div className="flex gap-2 pt-2">
        {onCancel && (
          <button type="button" className="btn-ghost flex-1" onClick={onCancel}>
            取消
          </button>
        )}
        <button type="submit" className="btn-primary flex-[2]" disabled={!valid}>
          <Icon name="Check" size={18} /> 保存项目
        </button>
      </div>
      {onDelete && (
        <button type="button" className="btn w-full bg-transparent text-[14px] text-fail" onClick={onDelete}>
          <Icon name="Trash2" size={16} /> 删除项目
        </button>
      )}
    </form>
  );
}
