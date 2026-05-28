import { useMemo, useState } from 'react';
import { X, Plus, Trash2, CheckCircle2, Copy } from 'lucide-react';
import { T } from '../../theme.js';
import { newId, fmt, copyToClipboard, formatDefectReorderRequest } from '../../utils/helpers.js';
import { STAGES } from '../../constants/stages.js';
import { useToast } from '../ui/UIProvider.jsx';
import AttachmentItem from '../attachments/AttachmentItem.jsx';
import AttachmentModal from '../attachments/AttachmentModal.jsx';
import { DEFECT_STATUSES, defectStatusInfo } from './statuses.js';

const SEVERITIES = [
  { code: 'low',    label: '低 Low',  color: '#6B5D4F' },
  { code: 'medium', label: '中 Med',  color: '#B8945E' },
  { code: 'high',   label: '高 High', color: '#C4543A' },
];

export default function DefectModal({ project, defect, onClose, onSave, onDelete }) {
  const isNew = !defect;
  const [item, setItem] = useState(defect?.item || '');
  const [itemEn, setItemEn] = useState(defect?.itemEn || '');
  const [description, setDescription] = useState(defect?.description || '');
  const [severity, setSeverity] = useState(defect?.severity || 'medium');
  const [status, setStatus] = useState(defect?.status || 'open');
  const [discoveredBy, setDiscoveredBy] = useState(defect?.discoveredBy || project?.assigned?.SS || '');
  const [discoveredAtStage, setDiscoveredAtStage] = useState(defect?.discoveredAtStage || 'T');
  const [reorderRef, setReorderRef] = useState(defect?.reorderRef || '');
  const [eta, setEta] = useState(defect?.eta || '');
  const [resolutionNote, setResolutionNote] = useState(defect?.resolutionNote || '');
  const [statusChangeNote, setStatusChangeNote] = useState('');
  const [photos, setPhotos] = useState(defect?.photos || []);
  const [showAttach, setShowAttach] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const originalStatus = defect?.status;
  const statusChanged = !isNew && status !== originalStatus;

  const handleSave = () => {
    if (!item.trim() || !description.trim()) {
      toast('请填写物品 + 问题描述 / Please fill item + description', 'error');
      return;
    }
    const now = new Date().toISOString();
    const newHistory = [...(defect?.history || [])];
    if (isNew) {
      newHistory.push({ at: now, by: discoveredBy || '—', from: null, to: status, note: statusChangeNote || '新登记 / Newly logged' });
    } else if (statusChanged) {
      newHistory.push({ at: now, by: discoveredBy || '—', from: originalStatus, to: status, note: statusChangeNote || '' });
    }
    const d = {
      id: defect?.id || newId('def'),
      item: item.trim(), itemEn: itemEn.trim(),
      description: description.trim(),
      severity, status,
      discoveredBy: discoveredBy.trim(),
      discoveredAtStage,
      reorderRef: reorderRef.trim(),
      eta, resolutionNote: resolutionNote.trim(),
      photos, history: newHistory,
    };
    onSave(d);
  };

  const addPhoto = (att) => {
    setPhotos((prev) => [...prev, att]);
    setShowAttach(false);
  };

  const removePhoto = (id) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const reorderText = useMemo(
    () => formatDefectReorderRequest(project, { item, itemEn, description, severity, discoveredBy, discoveredAtStage, photos, reorderRef, eta }),
    [project, item, itemEn, description, severity, discoveredBy, discoveredAtStage, photos, reorderRef, eta]
  );

  const handleCopyReorder = async () => {
    const ok = await copyToClipboard(reorderText);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } else {
      toast('复制失败 — 请手动选择文字', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-auto" style={{ background: 'rgba(45, 62, 54, 0.92)' }} onClick={onClose}>
      <div className="min-h-screen flex items-start justify-center p-4 lg:p-6">
        <div className="w-full max-w-3xl my-4" style={{ background: T.paper, borderRadius: '2px', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="p-6 flex items-start justify-between gap-4" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
            <div>
              <div className="text-xs tracking-[0.3em] uppercase mb-1" style={{ color: T.wood }}>Aftercare · Defect Ticket</div>
              <h2 className="font-display text-3xl leading-none" style={{ color: T.ink }}>
                {isNew ? '登记缺陷 / Log New Defect' : '编辑缺陷工单 / Edit Defect Ticket'}
              </h2>
            </div>
            <button onClick={onClose} style={{ color: T.inkSoft }}><X size={22} strokeWidth={1.5} /></button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">
            {/* Item description */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>物品 / Item *</label>
                <input type="text" value={item} onChange={(e) => setItem(e.target.value)} placeholder="例: 主卧衣柜门板 #3 (左侧)"
                  className="w-full px-3 py-2 text-sm outline-none"
                  style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>Item (English, 可选)</label>
                <input type="text" value={itemEn} onChange={(e) => setItemEn(e.target.value)} placeholder="e.g. Master wardrobe door #3 (left)"
                  className="w-full px-3 py-2 text-sm outline-none"
                  style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>问题描述 / Description *</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="例: 表面划痕约 15mm, 客户拒收, 需补货" rows={2}
                className="w-full px-3 py-2 text-sm outline-none resize-none"
                style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
            </div>

            {/* Severity + Discovery */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>严重程度 / Severity</label>
                <div className="flex gap-1">
                  {SEVERITIES.map((s) => (
                    <button key={s.code} onClick={() => setSeverity(s.code)} className="flex-1 px-2 py-1.5 text-xs" style={{
                      background: severity === s.code ? s.color : 'transparent',
                      color: severity === s.code ? T.paper : T.inkSoft,
                      border: `1px solid ${severity === s.code ? 'transparent' : T.line}`,
                      borderRadius: '2px',
                    }}>{s.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>发现人 / Found by</label>
                <input type="text" value={discoveredBy} onChange={(e) => setDiscoveredBy(e.target.value)} placeholder="Ah Keong"
                  className="w-full px-3 py-2 text-sm outline-none"
                  style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>发现章节 / At Stage</label>
                <select value={discoveredAtStage} onChange={(e) => setDiscoveredAtStage(e.target.value)} className="w-full px-3 py-2 text-sm outline-none"
                  style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}>
                  {STAGES.map((s) => <option key={s.code} value={s.code}>{s.code} · {s.name} · {s.nameCN}</option>)}
                </select>
              </div>
            </div>

            {/* Photos */}
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <label className="text-[10px] uppercase tracking-widest" style={{ color: T.inkSoft }}>现场照片链接 / Photo Links · {photos.length} 张</label>
                <button onClick={() => setShowAttach(true)} className="text-xs flex items-center gap-1" style={{ color: T.wood }}>
                  <Plus size={12} />添加链接 / Add Link
                </button>
              </div>
              {photos.length > 0 && (
                <div className="space-y-1">
                  {photos.map((p) => (
                    <AttachmentItem key={p.id} attachment={p} onRemove={() => removePhoto(p.id)} />
                  ))}
                </div>
              )}
            </div>

            {/* Status workflow */}
            <div className="p-4" style={{ background: T.cream, borderRadius: '2px' }}>
              <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: T.inkSoft }}>状态工作流 / Status Workflow</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
                {DEFECT_STATUSES.map((s) => {
                  const Icon = s.Icon;
                  const active = status === s.code;
                  return (
                    <button key={s.code} onClick={() => setStatus(s.code)} className="p-3 flex flex-col items-center gap-1.5 transition-all" style={{
                      background: active ? s.color : T.paper,
                      color: active ? T.paper : T.inkSoft,
                      border: `1px solid ${active ? s.color : T.line}`,
                      borderRadius: '2px',
                    }}>
                      <Icon size={18} strokeWidth={1.5} />
                      <div className="text-xs font-bold">{s.label}</div>
                      <div className="text-[10px] opacity-80">{s.en}</div>
                    </button>
                  );
                })}
              </div>
              {statusChanged && (
                <input type="text" value={statusChangeNote} onChange={(e) => setStatusChangeNote(e.target.value)}
                  placeholder="本次状态变更说明 / Notes for this status change..."
                  className="w-full px-3 py-2 text-sm outline-none"
                  style={{ background: T.paper, color: T.ink, border: `1px solid ${T.wood}`, borderRadius: '2px' }} />
              )}
            </div>

            {/* Reorder details — show once order placed */}
            {status !== 'open' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>补货单编号 / Reorder Ref #</label>
                  <input type="text" value={reorderRef} onChange={(e) => setReorderRef(e.target.value)} placeholder="例: RO-2024-0623"
                    className="w-full px-3 py-2 text-sm outline-none font-mono"
                    style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>预计到货 / ETA</label>
                  <input type="date" value={eta} onChange={(e) => setEta(e.target.value)}
                    className="w-full px-3 py-2 text-sm outline-none"
                    style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
                </div>
              </div>
            )}

            {/* Resolution note */}
            {status === 'closed' && (
              <div>
                <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>解决说明 / Resolution Note</label>
                <textarea value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} placeholder="例: 现场更换完毕, 客户已确认验收" rows={2}
                  className="w-full px-3 py-2 text-sm outline-none resize-none"
                  style={{ background: T.paper, color: T.ink, border: `1px solid ${T.sage}`, borderRadius: '2px' }} />
              </div>
            )}

            {/* History timeline */}
            {!isNew && (defect.history || []).length > 0 && (
              <div className="p-4" style={{ background: T.cream, borderRadius: '2px' }}>
                <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: T.inkSoft }}>历史时间轴 / History</div>
                <div className="space-y-2">
                  {(defect.history || []).map((h, i) => {
                    const toInfo = defectStatusInfo(h.to);
                    return (
                      <div key={i} className="flex gap-2 text-xs">
                        <span className="font-mono flex-shrink-0" style={{ color: T.inkSoft }}>{fmt(h.at)}</span>
                        <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px]" style={{ background: toInfo.color, color: T.paper, borderRadius: '2px' }}>{toInfo.label}</span>
                        <span style={{ color: T.ink }}>{h.note || '—'}</span>
                        {h.by && <span style={{ color: T.inkSoft }}>· {h.by}</span>}
                      </div>
                    );
                  })}
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
            <div className="flex gap-2 flex-wrap">
              <button onClick={handleCopyReorder} className="px-4 py-2 text-sm flex items-center gap-1.5" style={{
                background: copied ? T.sage : T.cream,
                color: copied ? T.paper : T.ink,
                border: `1px solid ${copied ? T.sage : T.line}`,
                borderRadius: '2px',
              }}>
                {copied ? <><CheckCircle2 size={13} /> 已复制</> : <><Copy size={13} />复制补货单到 WhatsApp</>}
              </button>
              <button onClick={onClose} className="px-4 py-2 text-sm" style={{ background: 'transparent', color: T.inkSoft, border: `1px solid ${T.line}`, borderRadius: '2px' }}>取消</button>
              <button onClick={handleSave} className="px-5 py-2 text-sm" style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}>保存</button>
            </div>
          </div>
        </div>
      </div>

      {showAttach && <AttachmentModal gateName="缺陷照片 Defect Photos" onClose={() => setShowAttach(false)} onSave={addPhoto} />}
    </div>
  );
}
