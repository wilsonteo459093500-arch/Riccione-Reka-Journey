import { useState } from 'react';
import { T } from '../../theme.js';
import { STAGES } from '../../constants/stages.js';

export default function RiskForm({ onSave, onCancel }) {
  const [text, setText] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [stage, setStage] = useState('B');

  return (
    <div className="mb-4 p-4" style={{ background: T.cream, borderRadius: '2px', border: `1px solid ${T.line}` }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="风险描述"
        className="w-full px-3 py-2 text-sm outline-none mb-3 resize-none"
        style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}
        rows={2}
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span style={{ color: T.inkSoft }}>等级:</span>
          {['low', 'medium', 'high'].map((s) => (
            <button
              key={s}
              onClick={() => setSeverity(s)}
              className="px-2 py-1"
              style={{
                background: severity === s ? (s === 'high' ? T.terra : s === 'medium' ? T.gold : T.inkSoft) : 'transparent',
                color: severity === s ? T.paper : T.inkSoft,
                border: `1px solid ${severity === s ? 'transparent' : T.line}`,
                borderRadius: '2px',
              }}
            >
              {s === 'low' ? '低' : s === 'medium' ? '中' : '高'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span style={{ color: T.inkSoft }}>章节:</span>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="px-2 py-1 outline-none"
            style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}
          >
            {STAGES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} · {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => text.trim() && onSave({ text: text.trim(), severity, stage })}
            disabled={!text.trim()}
            className="px-3 py-1 text-xs"
            style={{ background: text.trim() ? T.ink : T.line, color: T.paper, borderRadius: '2px' }}
          >
            登记
          </button>
          <button onClick={onCancel} className="px-3 py-1 text-xs" style={{ color: T.inkSoft }}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
