import React from 'react';

export function Btn({ children, variant = 'ghost', size = 'md', className = '', ...rest }) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const sizes = { sm: 'px-2.5 py-1 text-xs', md: 'px-3 py-1.5 text-sm', lg: 'px-4 py-2.5 text-sm' };
  const variants = {
    primary: 'bg-sail-green-deep text-white hover:bg-sail-green',
    ghost: 'text-sail-muted hover:bg-sail-tint border border-sail-line bg-white',
    plain: 'text-sail-muted hover:bg-sail-tint',
    danger: 'text-sail-danger hover:bg-sail-danger/10 border border-sail-line bg-white',
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Toggle({ on, onChange, children, title }) {
  return (
    <button
      type="button"
      title={title}
      onClick={() => onChange(!on)}
      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
        on ? 'bg-sail-green-deep text-white border-sail-green-deep' : 'bg-white text-sail-muted border-sail-line hover:bg-sail-tint'
      }`}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-xs text-sail-muted mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-sail-faint mt-1">{hint}</span>}
    </label>
  );
}

export const Input = React.forwardRef(function Input({ className = '', ...rest }, ref) {
  return (
    <input
      ref={ref}
      {...rest}
      className={`w-full px-2.5 py-1.5 rounded-lg border border-sail-line bg-white text-sm text-sail-ink outline-none focus:border-sail-green ${className}`}
    />
  );
});

export function Card({ title, right, children, className = '' }) {
  return (
    <section className={`bg-white border border-sail-line rounded-xl ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-sail-line">
          <h2 className="text-sm font-semibold text-sail-ink">{title}</h2>
          {right}
        </header>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}
