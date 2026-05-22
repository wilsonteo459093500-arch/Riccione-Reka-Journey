import { STAGES } from '../constants/stages.js';
import { FORMS } from '../constants/forms.js';

// ---- Progress ----
export const stageProgress = (project, stage) => {
  const total = stage.gates.length;
  const done = stage.gates.filter((g) => project.gates?.[g.id]).length;
  return { done, total, pct: total === 0 ? 0 : (done / total) * 100 };
};

export const currentStage = (project) => {
  for (let i = 0; i < STAGES.length; i++) {
    const { pct } = stageProgress(project, STAGES[i]);
    if (pct < 100) return STAGES[i];
  }
  return STAGES[STAGES.length - 1];
};

export const isComplete = (p) => STAGES.every((s) => stageProgress(p, s).pct === 100);

export const overallProgress = (p) => {
  const t = STAGES.map((s) => stageProgress(p, s));
  const done = t.reduce((a, b) => a + b.done, 0);
  const total = t.reduce((a, b) => a + b.total, 0);
  return { done, total, pct: total === 0 ? 0 : (done / total) * 100 };
};

// ---- Dates ----
export const daysUntil = (d) => {
  if (!d) return null;
  const x = new Date(d);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  x.setHours(0, 0, 0, 0);
  return Math.round((x - t) / 86400000);
};

export const fmt = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  return `${x.getFullYear()}/${String(x.getMonth() + 1).padStart(2, '0')}/${String(x.getDate()).padStart(2, '0')}`;
};

// Normalize any date-ish value to a YYYY-MM-DD string for <input type="date">.
export const dateInputValue = (d) => {
  if (!d) return '';
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const x = new Date(s);
  if (isNaN(x.getTime())) return '';
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

// ---- Misc ----
export const newId = (p = 'p') => p + '_' + Math.random().toString(36).slice(2, 9);
export const fmtBytes = (n) =>
  n < 1024 ? n + 'B' : n < 1048576 ? (n / 1024).toFixed(0) + 'KB' : (n / 1048576).toFixed(1) + 'MB';
export const isImage = (m) => m?.startsWith('image/');
export const isPDF = (m) => m === 'application/pdf';

export const fileToBase64 = (f) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(f);
  });

// Generate avatar color/initial from name
export const avatarFor = (name) => {
  if (!name) return null;
  const palette = ['#8B6F4E', '#5C7A4A', '#A8896B', '#6B5D4F', '#B8945E', '#9C7A5A'];
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    initial: name.trim().charAt(0).toUpperCase(),
    color: palette[hash % palette.length],
  };
};

export const formCompletion = (project, formCode) => {
  const form = FORMS[formCode];
  if (!form) return { filled: 0, total: 0, pct: 0 };
  const ans = project.forms?.[formCode]?.answers || {};
  const total = form.sections.reduce((a, s) => a + s.questions.length, 0);
  let filled = 0;
  form.sections.forEach((s) => {
    s.questions.forEach((q) => {
      const v = ans[q.id];
      if (v !== undefined && v !== null && v !== '') filled++;
    });
  });
  return { filled, total, pct: total === 0 ? 0 : (filled / total) * 100 };
};
