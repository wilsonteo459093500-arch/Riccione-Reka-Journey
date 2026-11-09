// 积木编辑器用的小控件：大按钮、好按，手机上也顺手。
import { useEffect, useState } from 'react';
import { Minus, Plus, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { T } from '../../theme.js';
import { parseMetersToMm, mmToM } from '../../planner/model.js';

export function Section({ title, hint, children, right }) {
  return (
    <section className="py-3" style={{ borderTop: `1px solid ${T.lineSoft}` }}>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="text-[11px] uppercase tracking-widest" style={{ color: T.inkSoft }}>{title}</div>
        {right}
      </div>
      {hint && <div className="text-[11px] -mt-1 mb-2" style={{ color: T.inkSoft }}>{hint}</div>}
      {children}
    </section>
  );
}

export function Segmented({ value, options, onChange, size = 'md' }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button key={o.id} type="button" onClick={() => onChange(o.id)} title={o.title}
            className={`${size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'} transition-colors`}
            style={{ borderRadius: 2, background: on ? T.ink : T.paper, color: on ? T.paper : T.ink, border: `1px solid ${on ? T.ink : T.line}` }}>
            {o.label}
            {o.sub && <span className="block text-[10px] opacity-75">{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ on, onChange, label }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center gap-2 text-sm py-1">
      <span className="relative inline-block w-9 h-5 rounded-full transition-colors" style={{ background: on ? T.sage : T.line }}>
        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: on ? 18 : 2 }} />
      </span>
      <span style={{ color: T.ink }}>{label}</span>
    </button>
  );
}

export function Stepper({ value, onChange, min = 1, max = 30, suffix }) {
  return (
    <div className="inline-flex items-center" style={{ border: `1px solid ${T.line}`, borderRadius: 2 }}>
      <button type="button" className="w-10 h-10 flex items-center justify-center disabled:opacity-30" disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))} style={{ color: T.ink }}><Minus size={16} /></button>
      <div className="px-3 text-sm min-w-[64px] text-center" style={{ color: T.ink }}>{value}{suffix ? ` ${suffix}` : ''}</div>
      <button type="button" className="w-10 h-10 flex items-center justify-center disabled:opacity-30" disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))} style={{ color: T.ink }}><Plus size={16} /></button>
    </div>
  );
}

// 米为单位的输入框（支持 2.86+2.6）。内部保留打字中的文字，失焦/回车才提交。
export function MeterInput({ label, mm, onChange, hint, min = 0 }) {
  const [txt, setTxt] = useState(mmToM(mm));
  useEffect(() => { setTxt(mmToM(mm)); }, [mm]);
  const commit = () => {
    const v = parseMetersToMm(txt);
    if (v > min) onChange(v); else setTxt(mmToM(mm));
  };
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-widest mb-1" style={{ color: T.inkSoft }}>{label}</span>
      <span className="flex items-center" style={{ background: T.paper, border: `1px solid ${T.line}`, borderRadius: 2 }}>
        <input value={txt} inputMode="decimal" onChange={(e) => setTxt(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
          className="flex-1 min-w-0 px-3 py-2.5 text-base outline-none bg-transparent" style={{ color: T.ink }} />
        <span className="pr-3 text-sm" style={{ color: T.inkSoft }}>m</span>
      </span>
      {hint && <span className="block text-[10px] mt-1" style={{ color: T.inkSoft }}>{hint}</span>}
    </label>
  );
}

export function Collapse({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: `1px solid ${T.lineSoft}` }}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-1.5 py-3 text-[11px] uppercase tracking-widest" style={{ color: T.inkSoft }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {title}
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}

export function Tip({ children }) {
  return (
    <span className="inline-flex items-start gap-1 text-[11px]" style={{ color: T.inkSoft }}>
      <Info size={12} className="mt-0.5 shrink-0" /> <span>{children}</span>
    </span>
  );
}
