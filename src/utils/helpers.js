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

// ---- Working-day (Mon-Fri) math for the design workflow SLAs ----
export const toISODate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const isWeekend = (d) => {
  const day = d.getDay();
  return day === 0 || day === 6;
};

export const addWorkingDays = (start, n) => {
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    if (!isWeekend(d)) added++;
  }
  return d;
};

export const subWorkingDays = (start, n) => {
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  let removed = 0;
  while (removed < n) {
    d.setDate(d.getDate() - 1);
    if (!isWeekend(d)) removed++;
  }
  return d;
};

// Working days from today to a due date (negative = overdue, 0 = due today).
export const workingDaysUntil = (dueISO) => {
  if (!dueISO) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueISO);
  due.setHours(0, 0, 0, 0);
  if (due.getTime() === today.getTime()) return 0;
  let count = 0;
  const dir = due > today ? 1 : -1;
  const d = new Date(today);
  while (d.getTime() !== due.getTime()) {
    d.setDate(d.getDate() + dir);
    if (!isWeekend(d)) count += dir;
  }
  return count;
};

// ---- Misc ----
export const newId = (p = 'p') => p + '_' + Math.random().toString(36).slice(2, 9);

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

// ----- Daily Report helpers -----
export const allSafe = (report) => {
  const c = report?.eodChecks || {};
  return !!(c.water && c.electric && c.closure && c.cleanup);
};

export const latestReport = (project) => {
  const list = project.dailyReports || [];
  if (list.length === 0) return null;
  return [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
};

export const dayNumberOf = (project, reportId) => {
  const sorted = [...(project.dailyReports || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return sorted.findIndex((r) => r.id === reportId) + 1;
};

// ----- WhatsApp text formatters -----
export const formatReportForWhatsApp = (project, report, dayNumber) => {
  const c = report.eodChecks || {};
  const mark = (b) => (b ? '✅' : '❌');
  const lines = [];
  lines.push(`📋 *安装日报 · Day ${dayNumber}*`);
  lines.push(`━━━━━━━━━━━━━━━`);
  lines.push(`🏠 ${project.name}`);
  lines.push(`👤 客户: ${project.client}`);
  lines.push(`📅 ${report.date}`);
  if (report.author) lines.push(`👷 SS: ${report.author}`);
  lines.push('');
  lines.push(`📈 *今日进度*`);
  lines.push(report.progress || '—');
  if (report.issues) {
    lines.push('');
    lines.push(`⚠️ *问题 / 障碍*`);
    lines.push(report.issues);
  }
  const photoCount = (report.photos || []).length;
  if (photoCount > 0) {
    lines.push('');
    lines.push(`📷 今日照片: ${photoCount} 张 (已上传平台)`);
  }
  lines.push('');
  lines.push(`🛡️ *退场前 4 项安全检查*`);
  lines.push(`${mark(c.water)} 水阀关闭`);
  lines.push(`${mark(c.electric)} 总电源关闭`);
  lines.push(`${mark(c.closure)} 门窗关闭`);
  lines.push(`${mark(c.cleanup)} 现场清理`);
  if (report.eodNote) {
    lines.push('');
    lines.push(`🔮 *明日计划*`);
    lines.push(report.eodNote);
  }
  lines.push('');
  lines.push(`━━━━━━━━━━━━━━━`);
  lines.push(`溪岸 SAIL · The Method`);
  return lines.join('\n');
};

export const formatBriefingForWhatsApp = (projectsWithReports, briefingDate) => {
  const lines = [];
  lines.push(`📊 *SAIL 工地日报总览*`);
  lines.push(`📅 ${briefingDate}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━`);
  lines.push('');

  if (projectsWithReports.length === 0) {
    lines.push('暂无工地日报');
  } else {
    projectsWithReports.forEach(({ project, report, dayNumber }, idx) => {
      const safe = allSafe(report);
      lines.push(`${safe ? '✅' : '⚠️'} *${project.name}*`);
      lines.push(`   Day ${dayNumber} · ${report.date} · ${report.author || '—'}`);
      const preview = (report.progress || '').slice(0, 90);
      if (preview) lines.push(`   📈 ${preview}${(report.progress || '').length > 90 ? '…' : ''}`);
      if (report.issues) lines.push(`   ⚠️ ${report.issues.slice(0, 90)}${report.issues.length > 90 ? '…' : ''}`);
      if (!safe) {
        const c = report.eodChecks || {};
        const failed = [];
        if (!c.water) failed.push('水');
        if (!c.electric) failed.push('电');
        if (!c.closure) failed.push('门窗');
        if (!c.cleanup) failed.push('清理');
        lines.push(`   🚨 未确认: ${failed.join(' / ')}`);
      }
      if (idx < projectsWithReports.length - 1) lines.push('');
    });
  }
  lines.push('');
  lines.push(`━━━━━━━━━━━━━━━━━━━`);
  lines.push(`溪岸 SAIL · Where Design Meets Nature`);
  return lines.join('\n');
};

export const formatDefectsBriefingForWhatsApp = (defectItems, briefingDate) => {
  const lines = [];
  lines.push(`🔧 *SAIL 售后 / 补货 日报*`);
  lines.push(`📅 ${briefingDate}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━`);
  lines.push('');
  if (defectItems.length === 0) {
    lines.push('✓ 所有缺陷已关闭, 无待处理项');
  } else {
    const sevEmoji = { high: '🔴', medium: '🟡', low: '🟢' };
    const statusEmoji = { open: '⚠️', ordered: '📦', arrived: '✅' };
    defectItems.forEach(({ project, defect }, idx) => {
      lines.push(`${sevEmoji[defect.severity] || '🟡'} *${project.name}*`);
      lines.push(`   ${statusEmoji[defect.status] || '·'} ${defect.item}`);
      lines.push(`   ${defect.description.slice(0, 80)}${defect.description.length > 80 ? '…' : ''}`);
      const meta = [];
      if (defect.reorderRef) meta.push(`RO# ${defect.reorderRef}`);
      if (defect.eta) {
        const d = daysUntil(defect.eta);
        meta.push(`ETA ${d < 0 ? `逾 ${Math.abs(d)} 天` : d === 0 ? '今天' : `${d} 天后`}`);
      }
      if (defect.status === 'arrived') meta.push('→ 待复装');
      if (meta.length > 0) lines.push(`   ${meta.join('  ·  ')}`);
      if (idx < defectItems.length - 1) lines.push('');
    });
  }
  lines.push('');
  lines.push(`━━━━━━━━━━━━━━━━━━━`);
  lines.push(`溪岸 SAIL · Aftercare`);
  return lines.join('\n');
};

// Build a Reorder-Request-to-factory text for a single defect.
export const formatDefectReorderRequest = (project, defect) => {
  const lines = [];
  lines.push(`🔧 *补货单 / Reorder Request*`);
  lines.push(`━━━━━━━━━━━━━━━`);
  lines.push(`🏠 项目: ${project.name}`);
  lines.push(`👤 客户: ${project.client}`);
  if (project.address) lines.push(`📍 ${project.address}`);
  lines.push('');
  lines.push(`📦 *物品 / Item*`);
  lines.push(defect.item || '—');
  if (defect.itemEn) lines.push(`(${defect.itemEn})`);
  lines.push('');
  lines.push(`📝 *问题描述 / Description*`);
  lines.push(defect.description || '—');
  lines.push('');
  const sevLabel = { high: '🔴 高 High', medium: '🟡 中 Med', low: '🟢 低 Low' }[defect.severity] || defect.severity;
  lines.push(`严重程度 / Severity: ${sevLabel}`);
  if (defect.discoveredBy) lines.push(`发现人 / Found by: ${defect.discoveredBy}`);
  if (defect.discoveredAtStage) lines.push(`阶段 / Stage: ${defect.discoveredAtStage}`);
  const photoCount = (defect.photos || []).length;
  if (photoCount > 0) lines.push(`📷 现场照片: ${photoCount} 张 (已上传平台 / on platform)`);
  if (defect.reorderRef) lines.push(`补货单编号 / RO#: ${defect.reorderRef}`);
  if (defect.eta) lines.push(`预计到货 / ETA: ${defect.eta}`);
  lines.push('');
  lines.push(`请工厂尽快安排补货, 并告知确认 ETA。`);
  lines.push(`Please confirm reorder + ETA at earliest.`);
  lines.push('');
  lines.push(`━━━━━━━━━━━━━━━`);
  lines.push(`溪岸 SAIL · Aftercare`);
  return lines.join('\n');
};

export const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (e2) {
      document.body.removeChild(ta);
      return false;
    }
  }
};
