import { useState } from 'react';
import { X, Plus, Trash2, CheckCircle2, Copy, Droplets, Zap, DoorClosed, Sparkle } from 'lucide-react';
import { T } from '../../theme.js';
import { newId, copyToClipboard, formatReportForWhatsApp } from '../../utils/helpers.js';
import { LabeledInput } from '../ui/Inputs.jsx';
import { useToast } from '../ui/UIProvider.jsx';
import AttachmentItem from '../attachments/AttachmentItem.jsx';
import AttachmentModal from '../attachments/AttachmentModal.jsx';
import { SafetyToggle } from './Safety.jsx';

export default function DailyReportModal({ project, report, dayNumber, onClose, onSave, onDelete, fetchAttachment }) {
  const isNew = !report;
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(report?.date || today);
  const [progress, setProgress] = useState(report?.progress || '');
  const [issues, setIssues] = useState(report?.issues || '');
  const [eodChecks, setEodChecks] = useState(report?.eodChecks || { water: false, electric: false, closure: false, cleanup: false });
  const [eodNote, setEodNote] = useState(report?.eodNote || '');
  const [author, setAuthor] = useState(report?.author || '');
  const [photos, setPhotos] = useState(report?.photos || []);
  const [pendingUploads, setPendingUploads] = useState([]); // [{ att, content }]
  const [copied, setCopied] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const toast = useToast();

  const allClosed = eodChecks.water && eodChecks.electric && eodChecks.closure && eodChecks.cleanup;

  const handleSave = () => {
    if (!progress.trim()) {
      toast('请填写今日进度', 'error');
      return;
    }
    const r = {
      id: report?.id || newId('dr'),
      date, progress: progress.trim(), issues: issues.trim(),
      eodChecks, eodNote: eodNote.trim(), author: author.trim(),
      photos,
    };
    onSave(r, pendingUploads);
  };

  const addPhoto = (att, content) => {
    setPhotos((prev) => [...prev, att]);
    if (att.source === 'upload' && content) {
      setPendingUploads((prev) => [...prev, { att, content }]);
    }
    setShowAttach(false);
  };

  const removePhoto = (id) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    setPendingUploads((prev) => prev.filter((u) => u.att.id !== id));
  };

  const handleCopy = async () => {
    const text = formatReportForWhatsApp(project, { id: report?.id, date, progress, issues, photos, eodChecks, eodNote, author }, dayNumber);
    const ok = await copyToClipboard(text);
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
              <div className="text-xs tracking-[0.3em] uppercase mb-1" style={{ color: T.wood }}>Daily Install Report</div>
              <h2 className="font-display text-3xl leading-none" style={{ color: T.ink }}>
                {isNew ? '新增今日日报' : `Day · ${date}`}
              </h2>
            </div>
            <button onClick={onClose} style={{ color: T.inkSoft }}><X size={22} strokeWidth={1.5} /></button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <LabeledInput label="日期 Date" type="date" value={date} onChange={setDate} />
              <LabeledInput label="填写人 Author" value={author} onChange={setAuthor} placeholder="例: Ah Keong" />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>今日进度 Progress *</label>
              <textarea value={progress} onChange={(e) => setProgress(e.target.value)} placeholder="例: 主卧衣柜柜体定位完成, 客厅电视柜安装至 60%, 厨房上柜全部上墙" rows={3}
                className="w-full px-3 py-2 text-sm outline-none resize-none"
                style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>问题 / 障碍 Issues (可选)</label>
              <textarea value={issues} onChange={(e) => setIssues(e.target.value)} placeholder="例: 客厅 L 型柜与墙面差 8mm, 需现场切割收边" rows={2}
                className="w-full px-3 py-2 text-sm outline-none resize-none"
                style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
            </div>

            {/* Photos */}
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <label className="text-[10px] uppercase tracking-widest" style={{ color: T.inkSoft }}>今日照片 Photos · {photos.length} 张</label>
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

            {/* EOD Safety Check */}
            <div className="p-4" style={{ background: T.cream, borderRadius: '2px' }}>
              <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-widest" style={{ color: T.inkSoft }}>EOD Safety Check</div>
                  <div className="font-display text-lg" style={{ color: T.ink }}>退场前 4 项安全检查</div>
                </div>
                <div className="text-xs px-2 py-1" style={{ background: allClosed ? T.sage : T.terra, color: T.paper, borderRadius: '2px' }}>
                  {allClosed ? '✓ 全部确认' : '⚠ 未全部确认'}
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <SafetyToggle label="水阀关闭" value={eodChecks.water} onChange={(v) => setEodChecks({ ...eodChecks, water: v })} Icon={Droplets} />
                <SafetyToggle label="总电源关闭" value={eodChecks.electric} onChange={(v) => setEodChecks({ ...eodChecks, electric: v })} Icon={Zap} />
                <SafetyToggle label="门窗关闭" value={eodChecks.closure} onChange={(v) => setEodChecks({ ...eodChecks, closure: v })} Icon={DoorClosed} />
                <SafetyToggle label="现场清理" value={eodChecks.cleanup} onChange={(v) => setEodChecks({ ...eodChecks, cleanup: v })} Icon={Sparkle} />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>明日计划 / 备注 (可选)</label>
              <textarea value={eodNote} onChange={(e) => setEodNote(e.target.value)} placeholder="例: 明日继续主卧抽屉, 9am 到场" rows={2}
                className="w-full px-3 py-2 text-sm outline-none resize-none"
                style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }} />
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 flex items-center justify-between gap-3 flex-wrap" style={{ background: T.cream, borderTop: `1px solid ${T.lineSoft}` }}>
            {!isNew ? (
              <button onClick={onDelete} className="text-xs flex items-center gap-1 opacity-60 hover:opacity-100" style={{ color: T.terra }}>
                <Trash2 size={12} />删除此条
              </button>
            ) : <div />}
            <div className="flex gap-2 flex-wrap">
              {!isNew && project && (
                <button
                  onClick={handleCopy}
                  className="px-4 py-2 text-sm flex items-center gap-1.5 transition-all"
                  style={{ background: copied ? T.sage : T.cream, color: copied ? T.paper : T.ink, border: `1px solid ${copied ? T.sage : T.line}`, borderRadius: '2px' }}
                >
                  {copied ? <><CheckCircle2 size={13} /> 已复制</> : <><Copy size={13} />复制到 WhatsApp</>}
                </button>
              )}
              <button onClick={onClose} className="px-4 py-2 text-sm" style={{ background: 'transparent', color: T.inkSoft, border: `1px solid ${T.line}`, borderRadius: '2px' }}>取消</button>
              <button onClick={handleSave} className="px-5 py-2 text-sm" style={{ background: T.ink, color: T.paper, borderRadius: '2px' }}>保存</button>
            </div>
          </div>
        </div>
      </div>

      {showAttach && <AttachmentModal gateName="今日照片" onClose={() => setShowAttach(false)} onSave={addPhoto} />}
    </div>
  );
}
