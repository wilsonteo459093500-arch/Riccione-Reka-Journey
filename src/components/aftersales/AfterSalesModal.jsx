import { useState } from 'react';
import { X, Plus, Trash2, CheckCircle2, ExternalLink, ShieldCheck } from 'lucide-react';
import { T } from '../../theme.js';
import { newId, fmt } from '../../utils/helpers.js';
import { LabeledInput } from '../ui/Inputs.jsx';
import { useToast } from '../ui/UIProvider.jsx';
import AttachmentItem from '../attachments/AttachmentItem.jsx';
import AttachmentModal from '../attachments/AttachmentModal.jsx';
import { AFTER_SALES_CATEGORIES } from './constants.js';

export default function AfterSalesModal({ ticket, onClose, onSave, onDelete, onResolve }) {
  const isNew = !ticket;
  const [category, setCategory] = useState(ticket?.category || 'repair');
  const [issue, setIssue] = useState(ticket?.issue || '');
  const [driveLink, setDriveLink] = useState(ticket?.driveLink || '');
  const [resolutionNote, setResolutionNote] = useState(ticket?.resolutionNote || '');
  const [photos, setPhotos] = useState(ticket?.photos || []);
  const [showAttach, setShowAttach] = useState(false);
  const [resolving, setResolving] = useState(false);
  const toast = useToast();

  const isResolved = ticket?.status === 'resolved';

  const handleSave = () => {
    if (!issue.trim()) {
      toast('请填写问题描述', 'error');
      return;
    }
    onSave({
      id: ticket?.id || newId('as'),
      category,
      issue: issue.trim(),
      status: ticket?.status || 'open',
      driveLink: driveLink.trim(),
      resolutionNote: resolutionNote.trim(),
      photos,
      createdBy: ticket?.createdBy || 'Wilson',
      resolvedAt: ticket?.resolvedAt || null,
      resolvedBy: ticket?.resolvedBy || null,
    });
  };

  const handleResolve = () => {
    if (!driveLink.trim() || driveLink.trim().length < 5) {
      toast('请提供售后单 / 照片的 Drive 链接才能标记完成', 'error');
      return;
    }
    onResolve({ driveLink: driveLink.trim(), resolutionNote: resolutionNote.trim() });
  };

  const addPhoto = (att) => {
    setPhotos((prev) => [...prev, att]);
    setShowAttach(false);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-auto" style={{ background: 'rgba(45, 62, 54, 0.92)' }} onClick={onClose}>
      <div className="min-h-screen flex items-start justify-center p-4 lg:p-6">
        <div className="w-full max-w-2xl my-4" style={{ background: T.paper, borderRadius: '2px', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="p-6 flex items-start justify-between gap-4" style={{ borderBottom: `1px solid ${T.lineSoft}` }}>
            <div>
              <div className="text-xs tracking-[0.3em] uppercase mb-1" style={{ color: T.wood }}>After-Sales Ticket · 售后工单</div>
              <h2 className="font-display text-3xl leading-none" style={{ color: T.ink }}>
                {isNew ? '登记售后工单 / Log After-Sales' : isResolved ? '已处理工单 / Resolved' : '编辑工单 / Edit Ticket'}
              </h2>
              {ticket?.createdAt && (
                <div className="text-xs mt-1.5" style={{ color: T.inkSoft }}>
                  登记于 {fmt(ticket.createdAt)} by {ticket.createdBy || '—'}
                  {isResolved && ticket.resolvedAt && ` · 已处理 ${fmt(ticket.resolvedAt)}`}
                </div>
              )}
            </div>
            <button onClick={onClose} style={{ color: T.inkSoft }}>
              <X size={22} strokeWidth={1.5} />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Category */}
            <div>
              <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>类别 / Category</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {AFTER_SALES_CATEGORIES.map((c) => {
                  const Icon = c.Icon;
                  const active = category === c.code;
                  return (
                    <button
                      key={c.code}
                      onClick={() => setCategory(c.code)}
                      disabled={isResolved}
                      className="p-2.5 flex items-center gap-2 text-xs transition-all"
                      style={{
                        background: active ? c.color : 'transparent',
                        color: active ? T.paper : T.inkSoft,
                        border: `1px solid ${active ? 'transparent' : T.line}`,
                        borderRadius: '2px',
                        opacity: isResolved && !active ? 0.5 : 1,
                      }}
                    >
                      <Icon size={14} strokeWidth={1.5} />
                      <span>{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Issue */}
            <div>
              <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>问题描述 / Issue *</label>
              <textarea
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
                placeholder="例: 主卧衣柜柜门下垂, 客户希望调试"
                rows={3}
                disabled={isResolved}
                className="w-full px-3 py-2 text-sm outline-none resize-none"
                style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px', opacity: isResolved ? 0.7 : 1 }}
              />
            </div>

            {/* Photos */}
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <label className="text-[10px] uppercase tracking-widest" style={{ color: T.inkSoft }}>
                  现场照片链接 · {photos.length} 张
                </label>
                {!isResolved && (
                  <button onClick={() => setShowAttach(true)} className="text-xs flex items-center gap-1" style={{ color: T.wood }}>
                    <Plus size={12} />添加链接
                  </button>
                )}
              </div>
              {photos.length > 0 && (
                <div className="space-y-1">
                  {photos.map((p) => (
                    <AttachmentItem key={p.id} attachment={p} onRemove={() => setPhotos((prev) => prev.filter((x) => x.id !== p.id))} />
                  ))}
                </div>
              )}
            </div>

            {/* Drive link for handover form + photos */}
            <div>
              <LabeledInput
                label="售后单 / 照片 Drive 链接"
                value={driveLink}
                onChange={setDriveLink}
                placeholder="https://drive.google.com/drive/folders/..."
              />
              <div className="mt-1.5 text-[10px]" style={{ color: T.inkSoft }}>
                客户签字售后单 + 处理前后照片放在这个 Drive 链接里。标记「已处理」时必须填。
              </div>
            </div>

            {/* Resolution panel */}
            {(isResolved || resolving) && (
              <div className="p-4" style={{ background: 'rgba(92,122,74,0.06)', border: `1px solid ${T.sage}`, borderRadius: '2px' }}>
                <div className="flex items-center gap-2 mb-2 text-sm" style={{ color: T.sage }}>
                  <ShieldCheck size={14} strokeWidth={1.5} />
                  <span className="font-medium">处理结果 / Resolution</span>
                </div>
                <textarea
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="例: 上门更换柜门, 客户已签字确认, 工单完成"
                  rows={2}
                  disabled={isResolved}
                  className="w-full px-3 py-2 text-sm outline-none resize-none"
                  style={{ background: T.paper, color: T.ink, border: `1px solid ${T.lineSoft}`, borderRadius: '2px', opacity: isResolved ? 0.85 : 1 }}
                />
                {ticket?.driveLink && (
                  <a
                    href={ticket.driveLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs hover:underline"
                    style={{ color: T.wood }}
                  >
                    <ExternalLink size={11} strokeWidth={1.5} />打开签字售后单 / 照片
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 flex items-center justify-between gap-3 flex-wrap" style={{ background: T.cream, borderTop: `1px solid ${T.lineSoft}` }}>
            {!isNew && !isResolved ? (
              <button onClick={onDelete} className="text-xs flex items-center gap-1 opacity-60 hover:opacity-100" style={{ color: T.terra }}>
                <Trash2 size={12} />删除
              </button>
            ) : <div />}
            <div className="flex gap-2 flex-wrap">
              {!isNew && !isResolved && !resolving && (
                <button
                  onClick={() => setResolving(true)}
                  className="px-4 py-2 text-sm flex items-center gap-1.5"
                  style={{ background: T.sage, color: T.paper, borderRadius: '2px' }}
                >
                  <CheckCircle2 size={14} strokeWidth={1.5} />
                  标记已处理
                </button>
              )}
              {resolving && (
                <button
                  onClick={handleResolve}
                  className="px-4 py-2 text-sm flex items-center gap-1.5"
                  style={{ background: T.sage, color: T.paper, borderRadius: '2px' }}
                >
                  <CheckCircle2 size={14} strokeWidth={1.5} />
                  确认完成
                </button>
              )}
              <button onClick={onClose} className="px-4 py-2 text-sm" style={{ background: 'transparent', color: T.inkSoft, border: `1px solid ${T.line}`, borderRadius: '2px' }}>
                {isResolved ? '关闭' : '取消'}
              </button>
              {!isResolved && !resolving && (
                <button
                  onClick={handleSave}
                  className="px-5 py-2 text-sm"
                  style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}
                >
                  保存
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showAttach && <AttachmentModal gateName="售后照片" onClose={() => setShowAttach(false)} onSave={addPhoto} />}
    </div>
  );
}
