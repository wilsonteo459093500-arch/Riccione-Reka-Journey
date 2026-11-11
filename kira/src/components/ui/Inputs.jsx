import { T } from '../../theme.js';

export function LabeledInput({ label, value, onChange, type = 'text', placeholder = '', compact = false }) {
  return (
    <div>
      <label
        className={`block text-[10px] uppercase tracking-widest ${compact ? 'mb-1' : 'mb-1.5'}`}
        style={{ color: T.inkSoft }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm outline-none"
        style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}
        onFocus={(e) => (e.target.style.borderColor = T.wood)}
        onBlur={(e) => (e.target.style.borderColor = T.line)}
      />
    </div>
  );
}

export function LabeledSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: T.inkSoft }}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm outline-none"
        style={{ background: T.paper, color: T.ink, border: `1px solid ${T.line}`, borderRadius: '2px' }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
