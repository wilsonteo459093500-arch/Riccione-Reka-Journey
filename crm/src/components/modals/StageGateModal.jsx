import React, { useState } from 'react';
import { AlertTriangle, ClipboardCheck, Link2 } from 'lucide-react';
import { getStageMeta } from '../../utils.js';

export default function StageGateModal({ gateRequest, onConfirm, onCancel }) {
  const { lead, targetStage, gate } = gateRequest;
  const [checked, setChecked] = useState(!!lead[gate.field]);
  const [link, setLink] = useState(lead[gate.linkField] || '');
  const targetMeta = getStageMeta(targetStage);

  const linkValid = !gate.requireLink || (link.trim().length > 5);
  const canConfirm = checked && linkValid;

  const doConfirm = () => {
    if (!canConfirm) return;
    const extra = gate.requireLink ? { [gate.linkField]: link.trim() } : {};
    onConfirm(extra);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 bg-gradient-to-br from-sail-warn to-[#9A6A2E] text-white">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-5 h-5" />
            <h2 className="font-display text-lg font-semibold">{gate.title}</h2>
          </div>
          <p className="text-xs text-white/90">
            {lead.clientName} → moving to <span className="font-semibold">{targetMeta.short}</span>
          </p>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-sail-muted">{gate.note}</p>

          <label className="flex items-start gap-3 bg-sail-tint border border-sail-line rounded-md p-3 cursor-pointer hover:border-sail-green transition-colors">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-[#3D5A4A]"
            />
            <span className="text-sm text-sail-ink font-medium">{gate.checkLabel}</span>
          </label>

          {gate.requireLink && (
            <div>
              <label className="text-xs font-medium text-sail-ink flex items-center gap-1.5 mb-1">
                <Link2 className="w-3.5 h-3.5 text-sail-green" /> {gate.linkLabel}
              </label>
              <input
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder={gate.linkPlaceholder}
                className="w-full bg-sail-tint border border-sail-line rounded-md px-3 py-2 text-sm text-sail-ink placeholder:text-sail-faint focus:outline-none focus:border-sail-green focus:bg-white"
              />
              <p className="text-[10px] text-sail-faint mt-1">
                Site supervisor must paste the Google Drive folder link containing all handover photos.
              </p>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-sail-line bg-sail-tint flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="px-3 py-1.5 text-sm text-sail-muted hover:text-sail-ink">Cancel</button>
          <button
            type="button"
            onClick={doConfirm}
            disabled={!canConfirm}
            className="px-4 py-1.5 bg-sail-green hover:bg-sail-green-deep text-white text-sm font-medium rounded-md disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <ClipboardCheck className="w-4 h-4" /> Confirm & Move
          </button>
        </div>
      </div>
    </div>
  );
}
