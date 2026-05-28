// =====================================================================
// Sail CRM — Utilities
// Pure functions only (no React, no IO). Easy to unit-test.
// =====================================================================

import {
  PRIORITIES, SALES_STAGES, FIELD_LABELS, DESIGN_STEPS, DESIGN_STEP_MAP,
  WON_STAGES, isActiveStage,
} from './constants.js';

// ---------------- Money / numbers ----------------
export const fmtMoney = (n) => {
  if (!n || isNaN(n)) return 'RM 0';
  return 'RM ' + Math.round(Number(n)).toLocaleString('en-MY');
};

export const fmtMoneyShort = (n) => {
  if (!n || isNaN(n)) return 'RM 0';
  const v = Number(n);
  if (v >= 1_000_000) return 'RM ' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000)     return 'RM ' + (v / 1_000).toFixed(0) + 'k';
  return 'RM ' + Math.round(v);
};

// ---------------- Dates ----------------
export const daysSince = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
};

// Excel serial date (1900-based) → ISO yyyy-mm-dd
export const excelDate = (serial) => {
  if (!serial || isNaN(serial)) return '';
  const ms = (Number(serial) - 25569) * 86400 * 1000;
  return new Date(ms).toISOString().split('T')[0];
};

export const toISODate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const isWeekend = (d) => { const x = d.getDay(); return x === 0 || x === 6; };

export const addWorkingDays = (start, n) => {
  const d = new Date(start); d.setHours(0, 0, 0, 0);
  let added = 0;
  while (added < n) { d.setDate(d.getDate() + 1); if (!isWeekend(d)) added++; }
  return d;
};

export const subWorkingDays = (start, n) => {
  const d = new Date(start); d.setHours(0, 0, 0, 0);
  let removed = 0;
  while (removed < n) { d.setDate(d.getDate() - 1); if (!isWeekend(d)) removed++; }
  return d;
};

export const workingDaysUntil = (dueISO) => {
  if (!dueISO) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueISO); due.setHours(0, 0, 0, 0);
  if (due.getTime() === today.getTime()) return 0;
  let count = 0;
  const dir = due > today ? 1 : -1;
  const d = new Date(today);
  while (d.getTime() !== due.getTime()) { d.setDate(d.getDate() + dir); if (!isWeekend(d)) count += dir; }
  return count;
};

// ---------------- Stage / priority lookups ----------------
export const getPriorityMeta = (p) => PRIORITIES.find(x => x.value === p) || PRIORITIES[3];
export const getStageMeta    = (s) => SALES_STAGES.find(x => x.value === s) || SALES_STAGES[0];

export const getStageAgeMeta = (days) => {
  if (days === null || days === undefined) return { color: '#7E7466', label: '—', warn: false };
  if (days <= 3)  return { color: '#3D5A4A', label: `${days}d`, warn: false };
  if (days <= 7)  return { color: '#A87C4F', label: `${days}d`, warn: false };
  if (days <= 14) return { color: '#C0843A', label: `${days}d`, warn: true };
  return { color: '#9C3D2E', label: `${days}d`, warn: true };
};

// ---------------- Design workflow rules ----------------
export const renderSLA = (amount) => {
  const a = Number(amount) || 0;
  if (a < 100_000) return { max: 2, label: '2 working days (< RM100k)' };
  if (a < 200_000) return { max: 5, label: '3–5 working days (RM100k–200k)' };
  if (a <= 500_000) return { max: 7, label: '5–7 working days (RM200k–500k)' };
  return { max: 7, label: '5–7+ working days (> RM500k)' };
};

export const presentationLimit = (amount) => {
  const a = Number(amount) || 0;
  if (a < 100_000) return 2;
  if (a < 200_000) return 3;
  return 4;
};

export const nextPresentationDate = (df) => {
  const list = df?.presentations || [];
  if (!list.length) return null;
  const today = toISODate(new Date());
  const upcoming = list.map(p => p.date).filter(Boolean).filter(d => d >= today).sort();
  if (upcoming.length) return upcoming[0];
  const all = list.map(p => p.date).filter(Boolean).sort();
  return all.length ? all[all.length - 1] : null;
};

export const initDesignFlow = () => {
  const now = new Date();
  return {
    presentations: [],
    startedAt: now.toISOString(),
    steps: DESIGN_STEPS.map((s, i) => ({
      id: s.id,
      status: i === 0 ? 'active' : 'pending',
      startedAt: i === 0 ? now.toISOString() : null,
      dueDate:   i === 0 ? toISODate(addWorkingDays(now, s.sla)) : null,
      completedAt: null,
      completedBy: null,
    })),
  };
};

export const computeStepDue = (stepId, fromDate, lead) => {
  const from = new Date(fromDate);
  if (stepId === 'render') return toISODate(addWorkingDays(from, renderSLA(lead.quotationAmount).max));
  if (stepId === 'internal') {
    const arrange = addWorkingDays(from, 1);
    const present = nextPresentationDate(lead.designFlow);
    if (present) {
      const mustBy = subWorkingDays(new Date(present), 2);
      return toISODate(mustBy < arrange ? mustBy : arrange);
    }
    return toISODate(arrange);
  }
  const step = DESIGN_STEP_MAP[stepId];
  return toISODate(addWorkingDays(from, step.sla || 1));
};

// ---------------- Lead diffs (for audit log) ----------------
export const computeLeadDiff = (oldL, newL) => {
  const changes = [];
  for (const [k, label] of Object.entries(FIELD_LABELS)) {
    const ov = oldL[k], nv = newL[k];
    if (ov === undefined && nv === undefined) continue;
    if (String(ov ?? '') !== String(nv ?? '')) changes.push({ field: k, label, from: ov, to: nv });
  }
  return changes;
};

// ---------------- Contact helpers ----------------
export const whatsappLink = (phone) => {
  if (!phone) return null;
  let p = String(phone).replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('0'))  p = '60' + p.slice(1); // assume MY when leading 0
  if (p.length < 8) return null;
  return `https://wa.me/${p}`;
};

export const getInitials = (name) => {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

// ---------------- Follow-up urgency (Dashboard alerts) ----------------
export const getStaleAlerts = (leads) => {
  const now = Date.now();
  const active = leads.filter(l => isActiveStage(l.salesStage));
  const stale = active.filter(l => {
    if (!l.updatedAt) return false;
    const days = Math.floor((now - new Date(l.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
    const p = parseInt(l.priority) || 4;
    if (p === 1) return days >= 5;
    if (p === 2) return days >= 7;
    if (p === 3) return days >= 14;
    return days >= 21;
  });
  return stale.sort((a, b) => {
    const pa = parseInt(a.priority) || 4;
    const pb = parseInt(b.priority) || 4;
    if (pa !== pb) return pa - pb;
    return new Date(a.updatedAt) - new Date(b.updatedAt);
  });
};

// ---------------- Lead → flat row (export) ----------------
export const leadToRow = (l) => ({
  'PIC': l.pic || '',
  'Client': l.clientName || '',
  'Type': l.clientType || '',
  'Source': l.leadSource || '',
  'Stage': l.salesStage || '',
  'Priority': l.priority || '',
  'Quotation (RM)': l.quotationAmount || 0,
  'Contact': l.contactNo || '',
  'Region': l.region || '',
  'Home/Site Address': l.homeAddress || '',
  'SO Number': l.soNumber || '',
  'Client Needs': l.clientNeeds || '',
  'Next Action': l.nextAction || '',
  'Follow-up': l.followUp && !l.followUp.done
    ? `${l.followUp.task} (→${l.followUp.assignedTo}, due ${l.followUp.dueDate || '—'})`
    : '',
  'Status/Remarks': l.statusRemarks || '',
  'Last Updated': l.updatedAt ? new Date(l.updatedAt).toLocaleDateString('en-MY') : '',
});

// ---------------- Excel export (lazy-loads xlsx) ----------------
async function getXLSX() {
  // Lazy-load so the ~600KB SheetJS bundle isn't shipped on first paint.
  const mod = await import('xlsx');
  return mod;
}

export async function exportRowsToExcel(rows, sheetName, filename) {
  if (!rows || rows.length === 0) { alert('Nothing to export.'); return; }
  const XLSX = await getXLSX();
  const ws = XLSX.utils.json_to_sheet(rows);
  const keys = Object.keys(rows[0]);
  ws['!cols'] = keys.map(k => {
    const maxLen = Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length));
    return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, String(sheetName).slice(0, 30));
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filename}_${date}.xlsx`);
}

export function exportRowsToPDF(title, columns, rows) {
  if (!rows || rows.length === 0) { alert('Nothing to export.'); return; }
  const win = window.open('', '_blank');
  if (!win) { alert('Please allow pop-ups to export PDF.'); return; }
  const today = new Date().toLocaleString('en-MY');
  const esc = (s) => String(s ?? '').replace(/</g, '&lt;');
  const thead = columns.map(c => `<th>${esc(c)}</th>`).join('');
  const tbody = rows.map(r => `<tr>${columns.map(c => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('');
  win.document.write(`<!DOCTYPE html><html><head><title>${esc(title)}</title>
    <style>
      * { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; }
      body { padding: 28px; color: #1A1614; }
      .head { display:flex; align-items:center; gap:10px; border-bottom: 2px solid #3D5A4A; padding-bottom: 12px; margin-bottom: 16px; }
      .logo { width: 34px; height: 34px; border-radius: 8px; background: #3D5A4A; color:#fff; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:600; }
      h1 { font-size: 18px; margin: 0; }
      .meta { font-size: 11px; color: #5C5247; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th { background: #FAF7F2; text-align: left; padding: 7px 8px; border-bottom: 2px solid #E0D8C8; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; color:#5C5247; }
      td { padding: 6px 8px; border-bottom: 1px solid #EFE9DF; vertical-align: top; }
      tr:nth-child(even) td { background: #FCFAF6; }
      @media print { body { padding: 0; } }
    </style></head><body>
    <div class="head"><div class="logo">溪</div><div><h1>${esc(title)}</h1><div class="meta">Sail CRM by Riccione Reka · ${rows.length} records · ${today}</div></div></div>
    <table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
    <script>window.onload = () => { window.print(); }</script>
    </body></html>`);
  win.document.close();
}

// ---------------- Excel import ----------------
export async function parseExcelImport(file) {
  const XLSX = await getXLSX();
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
  let bestSheet = wb.SheetNames[0], bestRows = 0;
  wb.SheetNames.forEach(name => {
    if (name.toLowerCase().includes('source')) return;
    const arr = XLSX.utils.sheet_to_json(wb.Sheets[name]);
    if (arr.length > bestRows) { bestRows = arr.length; bestSheet = name; }
  });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[bestSheet], { defval: '' });
  const get = (r, ...keys) => {
    for (const k of keys) {
      for (const rk of Object.keys(r)) {
        if (rk.toLowerCase().trim() === k.toLowerCase()) return r[rk];
      }
    }
    return '';
  };
  const toIso = (v) => {
    if (!v) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'number') return excelDate(v);
    return String(v);
  };
  return rows.map((r, idx) => ({
    id: `import_${Date.now()}_${idx}`,
    pic: get(r, 'PIC') || 'Wilson',
    clientType: get(r, 'Client Type', 'Type') || 'Retail Customer',
    leadSource: get(r, 'Lead Source', 'Source') || 'Walk-in',
    firstContactedDate: toIso(get(r, '1st Contacted Date', 'First Contacted', '1st Contact')),
    clientName: get(r, 'Client Name', 'Name', '客户名') || `Imported Lead ${idx + 1}`,
    contactMethod: get(r, 'Contact Method', 'Method') || 'Whatsapp',
    contactNo: String(get(r, 'Contact No.', 'Contact No', 'Phone', '电话') || ''),
    region: get(r, 'Region', '地区') || '',
    homeAddress: get(r, 'Home/Site Address', 'Home Address', 'Address', '地址') || '',
    soNumber: get(r, 'SO Number', 'SO') || '',
    priority: get(r, 'Priority', '优先级') || '3. Medium',
    salesStage: get(r, 'Sales Stage', 'Stage', '阶段') || 'Stage 1: New Contact',
    quotationAmount: Number(get(r, 'Quotation Amount', 'Quotation Amount (RM)', 'Value', 'Amount') || 0),
    paymentInfo: get(r, 'Payment Info', 'Payment') || '',
    clientNeeds: get(r, 'Client Needs', 'Needs', '需求') || '',
    expectedDeliveryDate: get(r, 'Expected Delivery', 'Delivery') || '',
    isDecisionMaker: get(r, 'Decision Maker?', 'Decision Maker') || '',
    nextAction: get(r, 'Next Action', 'Action') || '',
    statusRemarks: get(r, 'Status / Remarks', 'Status', 'Remarks', '备注') || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stageEnteredAt: new Date().toISOString(),
    afterSales: [],
    signedDetailDrawing: false,
    signedHandoverList: false,
    handoverDriveLink: '',
    followUp: null,
    designFlow: null,
    history: [{ timestamp: new Date().toISOString(), user: 'Import', type: 'imported', message: 'Imported from Excel' }],
  }));
}

// ---------------- ICS (calendar) export ----------------
// Lets the team subscribe to an .ics feed in Google Calendar / Apple Calendar.
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function toICSDate(dateStr, timeStr) {
  // dateStr: YYYY-MM-DD; timeStr: HH:mm (optional)
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T' + (timeStr || '09:00') + ':00');
  if (isNaN(d)) return null;
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
}

export function exportAppointmentsToICS(appointments, leadsById = {}, filename = 'Sail_Calendar') {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sail CRM//Riccione Reka//EN',
    'CALSCALE:GREGORIAN',
  ];
  appointments.forEach(a => {
    const start = toICSDate(a.date, a.time);
    if (!start) return;
    const endDate = new Date(a.date + 'T' + (a.time || '09:00') + ':00');
    endDate.setHours(endDate.getHours() + 1);
    const end = `${endDate.getUTCFullYear()}${pad(endDate.getUTCMonth() + 1)}${pad(endDate.getUTCDate())}T${pad(endDate.getUTCHours())}${pad(endDate.getUTCMinutes())}00Z`;
    const lead = a.leadId && leadsById[a.leadId];
    const summary = `${a.leadName || 'General'} — ${a.type}`;
    const desc = [a.notes, lead ? `PIC: ${a.pic}` : '', a.address ? `Address: ${a.address}` : ''].filter(Boolean).join('\\n');
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${a.id}@sail-crm`);
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${end}`);
    lines.push(`SUMMARY:${summary.replace(/[,;]/g, ' ')}`);
    if (desc) lines.push(`DESCRIPTION:${desc.replace(/[,;]/g, ' ')}`);
    if (a.address) lines.push(`LOCATION:${a.address.replace(/[,;]/g, ' ')}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.ics`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------- Weekly report (text version, used for email/Whatsapp) ----------------
export const buildWeeklyReportText = (weekLeads, statusGroups, weekStart, weekEnd, aiSummary = '') => {
  const fmt = (d) => d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
  const totalValue = weekLeads.reduce((s, l) => s + (Number(l.quotationAmount) || 0), 0);
  const wonValue = statusGroups.won.reduce((s, l) => s + (Number(l.quotationAmount) || 0), 0);
  const byPic = {};
  weekLeads.forEach(l => {
    if (!byPic[l.pic]) byPic[l.pic] = { count: 0, value: 0 };
    byPic[l.pic].count++;
    byPic[l.pic].value += Number(l.quotationAmount) || 0;
  });

  let txt = `Sail CRM Weekly Report\n${fmt(weekStart)} – ${fmt(weekEnd)}\n${'═'.repeat(40)}\n\n`;
  txt += `WEEK AT A GLANCE\n`;
  txt += `• New Contacts: ${statusGroups.newContacts.length}\n`;
  txt += `• Leads Updated: ${statusGroups.moved.length}\n`;
  txt += `• High Priority: ${statusGroups.highPriority.length}\n`;
  txt += `• Won / Closed: ${statusGroups.won.length} (RM ${wonValue.toLocaleString('en-MY')})\n`;
  txt += `• Dropped: ${statusGroups.dropped.length}\n`;
  txt += `• Total Pipeline Touched: RM ${totalValue.toLocaleString('en-MY')}\n\n`;
  txt += `TEAM PERFORMANCE\n`;
  txt += Object.entries(byPic).map(([pic, d]) => `• ${pic}: ${d.count} leads · RM ${d.value.toLocaleString('en-MY')}`).join('\n');
  txt += '\n';
  if (statusGroups.won.length) {
    txt += `\nWINS THIS WEEK\n` + statusGroups.won.map(l =>
      `• ${l.clientName} (${l.pic}) – RM ${(l.quotationAmount || 0).toLocaleString('en-MY')}`).join('\n') + '\n';
  }
  if (statusGroups.highPriority.length) {
    txt += `\nHIGH PRIORITY FOCUS\n` + statusGroups.highPriority.slice(0, 8).map(l =>
      `• ${l.clientName} (${l.pic}) – ${getStageMeta(l.salesStage).short}\n  Next: ${l.nextAction || '—'}`).join('\n') + '\n';
  }
  if (statusGroups.dropped.length) {
    txt += `\nDROPPED\n` + statusGroups.dropped.map(l =>
      `• ${l.clientName} – ${l.statusRemarks || 'No reason given'}`).join('\n') + '\n';
  }
  if (aiSummary) txt += `\nSTRATEGIC INSIGHTS\n${aiSummary}\n`;
  txt += `\n${'─'.repeat(28)}\nGenerated by Sail CRM · ${new Date().toLocaleString('en-MY')}`;
  return txt;
};
