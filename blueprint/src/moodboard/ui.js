// Material Board 界面小部件的 Tailwind class（bp-* 品牌色）

export const card = 'bg-bp-card border border-bp-line rounded-2xl p-4';
export const sectionLabel = 'text-xs font-semibold text-bp-faint mb-1.5';
export const input =
  'w-full rounded-lg border border-bp-line bg-white px-2.5 py-1.5 text-sm text-bp-ink placeholder:text-bp-faint focus:outline-none focus:border-bp-gold';
export const textarea =
  'w-full rounded-xl border border-bp-line bg-white px-3 py-2 text-xs leading-relaxed text-bp-ink placeholder:text-bp-faint focus:outline-none focus:border-bp-gold resize-none';

/** 选项小按钮（选中 = 深色） */
export const chip = (active) =>
  `px-2 py-1 rounded-md text-[11px] border transition-colors ${
    active ? 'bg-bp-dark text-bp-light border-bp-dark' : 'bg-white text-bp-muted border-bp-line hover:border-bp-rule'
  }`;

export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-bp-dark text-bp-light text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';
export const btnGhost =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-bp-line bg-white text-sm text-bp-muted hover:bg-bp-tint hover:text-bp-ink disabled:opacity-50 disabled:cursor-not-allowed';
export const btnGold =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-bp-gold/15 border border-bp-gold text-sm font-medium text-bp-ink hover:bg-bp-gold/25 disabled:opacity-50 disabled:cursor-not-allowed';
export const iconBtn =
  'inline-flex items-center justify-center px-2 py-1.5 rounded-lg border border-bp-line bg-white text-bp-muted hover:bg-bp-tint hover:text-bp-ink disabled:opacity-50';
