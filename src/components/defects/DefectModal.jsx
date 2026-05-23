import { useState } from 'react';
import { X, Plus, Trash2, Wrench, PackageCheck, CheckCircle2, Clock } from 'lucide-react';
import { T } from '../../theme.js';
import { newId, fmt } from '../../utils/helpers.js';
import { STAGES } from '../../constants/stages.js';
import { LabeledInput, LabeledSelect } from '../ui/Inputs.jsx';
import { useToast } from '../ui/UIProvider.jsx';
import AttachmentItem from '../attachments/AttachmentItem.jsx';
import AttachmentModal from '../attachments/AttachmentModal.jsx';

const STATUSES = [
  { code: 'open',    label: '待处理 Open',    color: '#C4543A', Icon: Wrench },
  { code: 'ordered', label: '已补货 Ordered', color: '#B8945E', Icon: Clock },
  { code: 'closed',  label: '已解决 Closed',  color: '#5C7A4A', Icon: CheckCircle2 },
];

const SEVERITIES = [
  { code: 'low',    label: '低', color: '#6B5D4F' },
  { code: 'medium', label: '中', color: '#B8945E' },
  { code: 'high',   label: '高', color: '#C4543A' },
];

const STAGE_OPTIONS = STAGES.flatMap((s) => s.gates.map((g) => g.id));

export default function DefectModal({ defect, defaultAuthor, onClose, onSave, onDelete, fetchAttachment }) {
  const isNew = !defect;
  const [item, setItem] = useState(defect?.item || '');
  const [description, setDescription] = useState(defect?.description || '');
  const [severity, setSeverity] = useState(defect?.severity || 'medium');
  const [status, setStatus] = useState(defect?.status || 'open');
  const [discoveredBy, setDiscoveredBy] = useState(defect?.discoveredBy || defaultAuthor || '');
  const [discoveredAtStage, setDiscoveredAtStage] = useState(defect?.discoveredAtStage || 'T3');
  const [reorderRef, setReorderRef] = useState(defect?.reorderRef || '');
  const [eta, setEta] = useState(defect?.eta || '');
  const [resolutionNote, setResolutionNote] = useState(defect?.resolutionNote || '');
  const [historyNote, setHistoryNote] = useState('');
  const [photos, setPhotos] = useState(defect?.photos || []);
  const [pendingUploads, setPendingUploads] = useState([]);
  const [showAttach, setShowAttach] = useState(false);
  const toast = useToast();

  const handleSave = () => {
    if (!item.trim()) { toast('请填写「问题部件」', 'error'); return; }
    if (!description.trim()) { toast('请填写「问题描述」', 'error'); return; }

    const prevStatus = defect?.status;
    const history = [...(defect?.history || [])];
    if (status !== prevStatus || historyNote.trim()) {
      history.push({
        at: new Date().toISOString(),
        by: discoveredBy.trim() || '—',
        from: prevStatus || null,
        to: status,
        note: historyNote.trim() || (isNew ? '现场发现, 已登记' : '更新'),
      });
    }

    const d = {
      id: defect?.id || newId('def'),
      item: item.trim(), description: description.trim(),
      severity, status,
      discoveredBy: discoveredBy.trim(), discoveredAtStage,
      reorderRef: reorderRef.trim(), eta,
      resolutionNote: resolutionNote.trim(),
      photos, history,
    };
    onSave(d, pendingUploads);
  };

  const addPhoto = (att, content) => {
    setPhotos((prev) => [...prev, att]);
    if (att.source === 'upload' && content) setPendingUploads((prev) => [...prev, { att, content }]);
    setShowAttach(false);
  };

  const removePhoto = (id) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    setPendingUploads((prev) => prev.filter((u) => u.att.id !== id));
  };

  return (
    <div className="fixed inset-0 z-50 overflow-auto" style={{ background: 'rgba(45, 62, 54, 0.92)' }} onClick={onClose}>
      <div className="min-h-screen flex items-start justify-center p-4 lg:p-6">
        <div className="w-full max-w-3xl my-4" style={{ background: T.paper, borderRadius: '2px', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="p-6 flex items-start justify-between gap-4" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
            <div>
              <div className="text-xs tracking-[0.3em] uppercase mb-1" style={{ color: T.wood }}>Defect / Reorder</div>
              <h2 className="font-display text-3xl leading-none" style={{ color: T.ink }}>
                {isNew ? '登记缺陷 / 补货' : item || '编辑缺陷'}
              </h2>
            </div>
            <button onClick={onClose} style={{ color: T.inkSoft }}><X size={22} strokeWidth={1.5} /></button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">
            <LabeledInput label="问题部件 Item *" value={item} onChange={setItem} placeholder="例: 主卧衣柜门板 #3 (左侧)" />

            <div>
              <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>问题描述 Description *</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="例: 表面划痕约 15mm, 客户拒收, 需补货" rows={2}
                className="w-full px-3 py-2 text-sm outline-none resize-none"
                style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
            </div>

            {/* Severity */}
            <div>
              <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>严重程度 Severity</label>
              <div className="flex gap-2">
                {SEVERITIES.map((s) => (
                  <button key={s.code} onClick={() => setSeverity(s.code)} className="px-4 py-2 text-sm transition-all"
                    style={{ background: severity === s.code ? s.color : 'transparent', color: severity === s.code ? T.paper : T.inkSoft, border: `1px solid ${severity === s.code ? 'transparent' : T.line}`, borderRadius: '2px' }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>状态 Status</label>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => {
                  const Icon = s.Icon;
                  return (
                    <button key={s.code} onClick={() => setStatus(s.code)} className="px-4 py-2 text-sm flex items-center gap-1.5 transition-all"
                      style={{ background: status === s.code ? s.color : 'transparent', color: status === s.code ? T.paper : T.inkSoft, border: `1px solid ${status === s.code ? 'transparent' : T.line}`, borderRadius: '2px' }}>
                      <Icon size={12} strokeWidth={2} />{s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <LabeledInput label="发现人 Discovered by" value={discoveredBy} onChange={setDiscoveredBy} placeholder="例: Ah Keong" />
              <LabeledSelect label="发现节点 At gate" value={discoveredAtStage} onChange={setDiscoveredAtStage} options={STAGE_OPTIONS} />
            </div>

            {status !== 'open' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <LabeledInput label="补货单号 Reorder Ref" value={reorderRef} onChange={setReorderRef} placeholder="例: RO-2024-0623" />
                <LabeledInput label="预计到货 ETA" type="date" value={eta} onChange={setEta} />
              </div>
            )}

            {status === 'closed' && (
              <div>
                <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>解决说明 Resolution</label>
                <textarea value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} placeholder="例: 从备件箱取 1 个替换, 现场 5 分钟搞定" rows={2}
                  className="w-full px-3 py-2 text-sm outline-none resize-none"
                  style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
              </div>
            )}

            {/* Photos */}
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <label className="text-[10px] uppercase tracking-widest" style={{ color: T.inkSoft }}>缺陷照片 Photos · {photos.length} 张</label>
                <button onClick={() => setShowAttach(true)} className="text-xs flex items-center gap-1" style={{ color: T.wood }}>
                  <Plus size={12} />添加照片
                </button>
              </div>
              {photos.length > 0 && (
                <div className="space-y-1">
                  {photos.map((p) => (
                    <AttachmentItem key={p.id} attachment={p} onRemove={() => removePhoto(p.id)} fetchAttachment={fetchAttachment} />
                  ))}
                </div>
              )}
            </div>

            {/* Status change note */}
            <div>
              <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>本次更新备注 (会写入历史)</label>
              <textarea value={historyNote} onChange={(e) => setHistoryNote(e.target.value)} placeholder="例: 补货单 RO-2024-0623 已提交工厂, 预计 7 天到货" rows={2}
                className="w-full px-3 py-2 text-sm outline-none resize-none"
                style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
            </div>

            {/* History timeline */}
            {!isNew && (defect.history || []).length > 0 && (
              <div className="pt-4" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
                <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: T.inkSoft }}>历史记录 History</div>
                <div className="space-y-2">
                  {[...defect.history].reverse().map((h, i) => (
                    <div key={i} className="text-xs flex gap-3" style={{ color: T.ink }}>
                      <span className="font-mono flex-shrink-0" style={{ color: T.inkSoft }}>{fmt(h.at)}</span>
                      <div>
                        <span className="font-display" style={{ color: T.wood }}>{h.by}</span>
                        <span style={{ color: T.inkSoft }}> · {h.from ? `${h.from} → ${h.to}` : `创建为 ${h.to}`}</span>
                        {h.note && <div className="mt-0.5" style={{ color: T.ink }}>{h.note}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 flex items-center justify-between gap-3 flex-wrap" style={{ background: T.cream, borderTop: `1px solid ${T.lineSoft}` }}>
            {!isNew ? (
              <button onClick={onDelete} className="text-xs flex items-center gap-1 opacity-60 hover:opacity-100" style={{ color: T.terra }}>
                <Trash2 size={12} />删除此条
              </button>
            ) : <div />}
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm" style={{ background: 'transparent', color: T.inkSoft, border: `1px solid ${T.line}`, borderRadius: '2px' }}>取消</button>
              <button onClick={handleSave} className="px-5 py-2 text-sm" style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}>保存</button>
            </div>
          </div>
        </div>
      </div>

      {showAttach && <AttachmentModal gateName="缺陷照片" onClose={() => setShowAttach(false)} onSave={addPhoto} />}
    </div>
  );
}
