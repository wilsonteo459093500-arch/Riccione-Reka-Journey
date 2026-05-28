import { useState } from 'react';
import { X } from 'lucide-react';
import { T } from '../../theme.js';
import { APPOINTMENT_TYPES } from '../../constants/calendar.js';
import { LabeledInput } from '../ui/Inputs.jsx';
import { useToast } from '../ui/UIProvider.jsx';

export default function AppointmentFormModal({ defaultDate, seed, projects, onClose, onSave }) {
  const [form, setForm] = useState({
    type: seed?.type || 'showroom',
    date: defaultDate || seed?.date || new Date().toISOString().slice(0, 10),
    time: seed?.time || '10:00',
    projectId: seed?.projectId || '',
    projectName: seed?.projectName || '',
    pic: seed?.pic || '',
    address: seed?.address || '',
    notes: seed?.notes || '',
  });
  const toast = useToast();

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const selectProject = (id) => {
    const p = projects.find((x) => x.id === id);
    if (p) {
      setForm((f) => ({
        ...f,
        projectId: id,
        projectName: p.name,
        address: p.address || f.address,
        pic: p.assigned?.SS || p.assigned?.SD || f.pic,
      }));
    } else {
      setForm((f) => ({ ...f, projectId: '', projectName: '' }));
    }
  };

  const submit = () => {
    if (!form.date) {
      toast('请选择日期', 'error');
      return;
    }
    onSave(form);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(45, 62, 54, 0.55)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md fade-up"
        style={{ background: T.paper, borderRadius: '2px', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 flex items-baseline justify-between" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
          <h2 className="font-display text-2xl" style={{ color: T.ink }}>新增日程 / New Appointment</h2>
          <button onClick={onClose} style={{ color: T.inkSoft }}>
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>
              类型 / Type
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {APPOINTMENT_TYPES.map((t) => {
                const active = form.type === t.value;
                return (
                  <button
                    key={t.value}
                    onClick={() => update('type', t.value)}
                    className="text-[11px] font-medium py-1.5 px-1 transition-colors"
                    style={{
                      background: active ? t.color : 'transparent',
                      color: active ? T.paper : T.inkSoft,
                      border: `1px solid ${active ? 'transparent' : T.line}`,
                      borderRadius: '2px',
                    }}
                  >
                    {t.short}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <LabeledInput label="日期 Date" type="date" value={form.date} onChange={(v) => update('date', v)} />
            <LabeledInput label="时间 Time" type="time" value={form.time} onChange={(v) => update('time', v)} />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>
              关联项目 / Linked Project (可选)
            </label>
            <select
              value={form.projectId}
              onChange={(e) => selectProject(e.target.value)}
              className="w-full px-3 py-2 text-sm outline-none"
              style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}
            >
              <option value="">— 不关联 / None —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {p.client}</option>
              ))}
            </select>
          </div>

          <LabeledInput
            label="负责人 PIC"
            value={form.pic}
            onChange={(v) => update('pic', v)}
            placeholder="例: Ah Keong"
          />

          <LabeledInput
            label="地址 / 位置 Address"
            value={form.address}
            onChange={(v) => update('address', v)}
            placeholder="客户现场地址 / 展厅"
          />

          <div>
            <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>
              备注 Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="例: 带样板, 复尺厨房 + 主卧"
              rows={2}
              className="w-full px-3 py-2 text-sm outline-none resize-none"
              style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}
            />
          </div>
        </div>

        <div className="p-5 flex items-center justify-end gap-2" style={{ background: T.cream, borderTop: `1px solid ${T.lineSoft}` }}>
          <button onClick={onClose} className="px-4 py-2 text-sm" style={{ color: T.inkSoft, border: `1px solid ${T.line}`, borderRadius: '2px' }}>
            取消
          </button>
          <button onClick={submit} className="px-5 py-2 text-sm" style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
