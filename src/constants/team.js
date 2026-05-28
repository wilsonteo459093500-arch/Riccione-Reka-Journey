// ============================================================
// TEAM CONFIG — editable team roster + role label overrides
// Stored separately from project data so admin changes don't
// touch the project records, and so a single source of truth
// drives default assignments + select options across the app.
// ============================================================

// Built-in role codes. The labels here are the FALLBACK — users can
// override them in Settings if they call these roles something else.
export const ROLE_CODES = ['SD', 'SS', 'WH', 'PU'];

export const DEFAULT_ROLE_LABELS = {
  SD: { label: '销售设计 Sales Designer', short: '销售设计', color: '#8B6F4E' },
  SS: { label: '现场主管 Site Supervisor', short: '现场主管', color: '#5C7A4A' },
  WH: { label: '仓储 Warehouse', short: '仓储', color: '#A8896B' },
  PU: { label: '采购 Purchasing', short: '采购', color: '#6B5D4F' },
};

// Initial members shipped with the app — replaceable in Settings.
export const DEFAULT_TEAM = {
  roleLabels: { ...DEFAULT_ROLE_LABELS },
  members: [
    { id: 'm_wilson',  name: 'Wilson',   role: 'SD', whatsapp: '', email: '' },
    { id: 'm_keong',   name: 'Ah Keong', role: 'SS', whatsapp: '', email: '' },
    { id: 'm_weihan',  name: 'Wei Han',  role: 'WH', whatsapp: '', email: '' },
    { id: 'm_limjie',  name: 'Lim Jie',  role: 'PU', whatsapp: '', email: '' },
  ],
};

// Build the assigned-roles object for a new project from current team.
// Picks the first member registered for each role; leaves blank if none.
export const defaultAssignmentFromTeam = (team) => {
  const t = team || DEFAULT_TEAM;
  const out = {};
  ROLE_CODES.forEach((code) => {
    const member = (t.members || []).find((m) => m.role === code);
    out[code] = member?.name || '';
  });
  return out;
};

// Lookup helper used wherever the legacy OWNERS map was consumed.
// Falls back to the default label if the user hasn't customized it.
export const getRoleMeta = (team, code) => {
  const labels = team?.roleLabels || DEFAULT_ROLE_LABELS;
  const meta = labels[code] || DEFAULT_ROLE_LABELS[code];
  return {
    label: code,
    full: meta?.label || code,
    short: meta?.short || code,
    color: meta?.color || '#9A8F7E',
  };
};
