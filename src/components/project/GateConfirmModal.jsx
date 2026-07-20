import { useState } from 'react';
import { X, AlertTriangle, Link as LinkIcon, CheckCircle2 } from 'lucide-react';
import { T } from '../../theme.js';
import { LabeledInput } from '../ui/Inputs.jsx';
import { useToast } from '../ui/UIProvider.jsx';

// Signed-document confirmation gate. Used for critical milestones (e.g.
// S3 drawing sign-off, H1 final handover). On confirm the gate gets
// checked AND a Drive link attachment is added to the gate.
export default function GateConfirmModal({ gate, confirmation, onConfirm, onCancel }) {
  const [checked, setChecked] = useState(false);
  const [link, setLink] = useState('');
  const toast = useToast();

  const submit = () => {
    if (!checked) {
      toast('请先勾选确认 / Please tick to confirm', 'error');
      return;
    }
    if (!link.trim() || link.trim().length < 8) {
      toast('请粘贴 Drive 链接 / Please paste the Drive link', 'error');
      return;
    }
    let url = link.trim();
    if (!url.match(/^https?:\/\//)) url = 'https://' + url;
    onConfirm({ url, name: confirmation.attachmentName });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(45, 62, 54, 0.55)', backdropFilter: 'blur(8px)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md fade-up"
        style={{ background: T.paper, borderRadius: '2px', boxShadow: '0 24px 80px rgba(0,0,0,0.3)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5" style={{ background: T.gold, color: T.paper }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={20} strokeWidth={1.5} />
              <h2 className="font-display text-xl">{confirmation.title}</h2>
            </div>
            <button onClick={onCancel} style={{ color: T.paper, opacity: 0.85 }}>
              <X size={20} strokeWidth={1.5} />
            </button>
          </div>
          <div className="text-xs mt-2 opacity-90">
            <span className="font-mono">{gate.short}</span> — {gate.label}
          </div>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: T.inkSoft }}>{confirmation.note}</p>

          <label className="flex items-start gap-3 p-3 cursor-pointer hover:bg-opacity-80 transition-colors" style={{ background: T.cream, borderRadius: '2px', border: `1px solid ${T.line}` }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-1"
              style={{ accentColor: T.ink, width: 16, height: 16 }}
            />
            <span className="text-sm" style={{ color: T.ink }}>{confirmation.checkLabel}</span>
          </label>

          <div>
            <LabeledInput
              label={confirmation.linkLabel}
              value={link}
              onChange={setLink}
              placeholder={confirmation.linkPlaceholder}
            />
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px]" style={{ color: T.inkSoft }}>
              <LinkIcon size={11} strokeWidth={1.5} style={{ color: T.wood }} />
              链接会作为附件保存在这个 Gate 下, 团队随时可点开查看 / The link saves as an attachment on this gate for the whole team.
            </div>
          </div>
        </div>

        <div className="p-5 flex items-center justify-end gap-2" style={{ background: T.cream, borderTop: `1px solid ${T.lineSoft}` }}>
          <button onClick={onCancel} className="px-4 py-2 text-sm" style={{ background: 'transparent', color: T.inkSoft, border: `1px solid ${T.line}`, borderRadius: '2px' }}>
            取消 / Cancel
          </button>
          <button
            onClick={submit}
            disabled={!checked || !link.trim()}
            className="px-5 py-2 text-sm flex items-center gap-1.5"
            style={{
              background: !checked || !link.trim() ? T.line : T.ink,
              color: T.paper,
              borderRadius: '2px',
              cursor: !checked || !link.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            <CheckCircle2 size={14} strokeWidth={1.5} />
            确认并标记完成 / Confirm & Mark Done
          </button>
        </div>
      </div>
    </div>
  );
}
