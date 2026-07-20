import { memo, useEffect, useState } from 'react';
import { CheckCircle2, Circle, MessageSquare, Paperclip, ShieldCheck } from 'lucide-react';
import { T } from '../../theme.js';
import { GATE_CONFIRMATIONS } from '../../constants/stages.js';
import { newId } from '../../utils/helpers.js';
import AttachmentItem from '../attachments/AttachmentItem.jsx';
import AttachmentModal from '../attachments/AttachmentModal.jsx';
import GateConfirmModal from './GateConfirmModal.jsx';

function GateRow({ gate, checked, note, attachments, onToggle, onUpdateNote, onAddAttachment, onRemoveAttachment }) {
  const [showNote, setShowNote] = useState(!!note);
  const [draft, setDraft] = useState(note);
  const [showAttach, setShowAttach] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    setDraft(note);
    setShowNote(!!note);
  }, [note]);

  const confirmation = GATE_CONFIRMATIONS[gate.id];

  // Checking ON a confirmation gate triggers the signed-doc modal;
  // unchecking is unrestricted (so mistakes can always be undone).
  const handleToggle = () => {
    if (!checked && confirmation) {
      setShowConfirm(true);
    } else {
      onToggle();
    }
  };

  const handleConfirm = ({ url, name }) => {
    onAddAttachment({
      id: newId('att'),
      name,
      url,
      source: 'link',
      uploadedAt: new Date().toISOString(),
    });
    onToggle();
    setShowConfirm(false);
  };

  return (
    <div className="flex gap-3 p-3" style={{ background: checked ? 'rgba(92, 122, 74, 0.05)' : 'transparent', borderRadius: '2px' }}>
      <button onClick={handleToggle} className="flex-shrink-0 mt-0.5 transition-transform hover:scale-110">
        {checked ? (
          <CheckCircle2 size={20} strokeWidth={1.5} style={{ color: T.sage }} />
        ) : (
          <Circle size={20} strokeWidth={1.5} style={{ color: T.line }} />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono text-xs px-1.5 py-0.5" style={{ color: T.paper, background: T.wood, borderRadius: '2px' }}>{gate.short}</span>
          <span className="text-sm" style={{ color: checked ? T.inkSoft : T.ink, textDecoration: checked ? 'line-through' : 'none' }}>{gate.label}</span>
          {confirmation && (
            <span title="需要签字文档确认 / Requires signed-doc confirmation" className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5" style={{ background: T.gold, color: T.paper, borderRadius: '2px' }}>
              <ShieldCheck size={10} strokeWidth={2} />
              GATE
            </span>
          )}
        </div>
        <div className="text-xs mt-0.5" style={{ color: T.inkSoft, opacity: 0.7 }}>{gate.en}</div>

        {attachments.length > 0 && (
          <div className="mt-2 space-y-1">
            {attachments.map((a) => (
              <AttachmentItem key={a.id} attachment={a} onRemove={() => onRemoveAttachment(a.id)} />
            ))}
          </div>
        )}

        {showNote && (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => onUpdateNote(draft)}
            placeholder="备注、问题、决议… (自动保存)"
            className="mt-2 w-full px-3 py-2 text-xs outline-none resize-none"
            style={{ background: T.cream, color: T.ink, border: `1px solid ${T.lineSoft}`, borderRadius: '2px', minHeight: '60px' }}
            rows={2}
          />
        )}

        <div className="mt-1.5 flex items-center gap-3 text-xs">
          {!showNote && (
            <button onClick={() => setShowNote(true)} className="flex items-center gap-1 opacity-40 hover:opacity-100" style={{ color: T.inkSoft }}>
              <MessageSquare size={11} strokeWidth={1.5} />
              备注
            </button>
          )}
          <button onClick={() => setShowAttach(true)} className="flex items-center gap-1 opacity-40 hover:opacity-100" style={{ color: T.inkSoft }}>
            <Paperclip size={11} strokeWidth={1.5} />
            链接
          </button>
        </div>
      </div>

      {showAttach && (
        <AttachmentModal
          gateName={`${gate.short} · ${gate.label}`}
          onClose={() => setShowAttach(false)}
          onSave={(a) => {
            onAddAttachment(a);
            setShowAttach(false);
          }}
        />
      )}

      {showConfirm && confirmation && (
        <GateConfirmModal
          gate={gate}
          confirmation={confirmation}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}

export default memo(GateRow);
