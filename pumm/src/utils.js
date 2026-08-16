// =====================================================================
// PUMM ROUNDTABLE — 纯函数层
// 桌规校验、看板算法、提醒计算、导出。全部无副作用，方便日后写测试。
// =====================================================================

import {
  TABLE, ATTENDANCE_STATUS, COMMITMENT_STATUS, METRIC_TARGETS,
  SESSION_PHASES, ROLES,
} from './constants.js';

// ---------------------------------------------------------------------
// 基础
// ---------------------------------------------------------------------
export function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 正数 = 还有几天；0 = 今天；负数 = 已过期几天 */
export function daysUntil(dateStr, from = todayISO()) {
  if (!dateStr) return null;
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${dateStr}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

export function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} 周${week}`;
}

export function fmtDateShort(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function pct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

export function mmss(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------
// 会员筛选 —— 「在桌」的定义
//
// 桌规：年费未到账不得入桌；全员签 NDA 后才算入桌。
// 所以「在桌」＝ active ＋ 已缴费 ＋ 已签 NDA。差一样都只是「待入桌」。
// 理事会（director）不占桌上席位，不参与出席率与行业查重。
// ---------------------------------------------------------------------
export const isDirector = (m) => m.role === 'director';

export const isSeated = (m) =>
  !!m && m.status === 'active' && !isDirector(m) && m.feeStatus === 'paid' && m.ndaSigned;

export const isPending = (m) =>
  !!m && m.status === 'active' && !isDirector(m) && (m.feeStatus !== 'paid' || !m.ndaSigned);

export const seatedMembers  = (members) => members.filter(isSeated);
export const pendingMembers = (members) => members.filter(isPending);
export const rosterMembers  = (members) => members.filter(m => !isDirector(m) && m.status === 'active');

export function memberName(members, id) {
  const m = members.find(x => x.id === id);
  return m ? m.name : '（已移除会员）';
}

export function memberById(members, id) {
  return members.find(x => x.id === id) || null;
}

/** 为什么还没入桌 —— 给 UI 直接显示 */
export function pendingReasons(m) {
  const out = [];
  if (m.feeStatus !== 'paid') out.push('年费未到账');
  if (!m.ndaSigned) out.push('NDA 未签');
  return out;
}

// ---------------------------------------------------------------------
// 桌规校验 —— 加人／改人时调用，返回错误数组（空 = 通过）
// ---------------------------------------------------------------------
const normIndustry = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, '');

export function validateMember(draft, members) {
  const errors = [];
  if (!draft.name?.trim()) errors.push('姓名必填。');

  if (!isDirector(draft)) {
    if (!draft.company?.trim()) errors.push('公司必填。');
    if (!draft.industry?.trim()) errors.push('行业必填 —— 同桌行业不得重复，这一栏是查重依据。');

    // 行业查重：只跟同桌、在册（未出局）、非理事会的会员比
    const clash = members.find(m =>
      m.id !== draft.id &&
      m.tableId === (draft.tableId || TABLE.id) &&
      m.status === 'active' &&
      !isDirector(m) &&
      normIndustry(m.industry) === normIndustry(draft.industry)
    );
    if (clash) {
      errors.push(`行业重复：「${clash.industry}」已经由 ${clash.name}（${clash.company}）占了。桌规是同桌非同业。`);
    }

    // 10 人满席（只对新人拦，改旧人不拦）
    const isNew = !members.some(m => m.id === draft.id);
    if (isNew) {
      const onTable = members.filter(m =>
        m.tableId === (draft.tableId || TABLE.id) && m.status === 'active' && !isDirector(m)
      ).length;
      if (onTable >= TABLE.seatLimit) {
        errors.push(`这桌已经 ${TABLE.seatLimit} 人满席。要加人，先让某位出局，或开第二桌。`);
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------
// 出席
//
// 第一版不建 attendance 表：出席记录挂在 session.attendance 上
// （{ [memberId]: 'present' | 'excused' | 'absent' }）。
// 语义与规格里的 attendance 表一致，第二版拆表时直接平移。
// ---------------------------------------------------------------------
export function attendanceOf(session, memberId) {
  return session?.attendance?.[memberId] || null;
}

/** 无故缺席次数（请假不算）—— 只数已结束的场次 */
export function absenceCount(sessions, memberId) {
  return sessions.filter(s => s.status === 'closed' && s.attendance?.[memberId] === 'absent').length;
}

/** 累计 2 次无故缺席 → 桌长要处理 */
export function membersAtRisk(members, sessions) {
  return rosterMembers(members)
    .map(m => ({ member: m, count: absenceCount(sessions, m.id) }))
    .filter(x => x.count >= 2);
}

// ---------------------------------------------------------------------
// 建议贡献榜 —— 「老板帮老板」从口号变成排行榜
//
// 给出 = 这个人在所有案例里留下的建议条数。
// 被采纳 = 案主锁诺时标了「这个行动主要来自谁的建议」（commitment.
// sourceAdviceIds），其中属于这个人的建议数。
// 只统计数字，不带任何建议正文 —— 所以理事会也能看这张榜。
// ---------------------------------------------------------------------
export function advisorLeaderboard(members, cases, commitments) {
  const adviceOwner = {};                    // adviceId → advisorId
  const given = {};                          // advisorId → 条数
  cases.forEach(c => (c.advices || []).forEach(a => {
    adviceOwner[a.id] = a.advisorId;
    given[a.advisorId] = (given[a.advisorId] || 0) + 1;
  }));

  const adopted = {};                        // advisorId → 被采纳数
  commitments.forEach(cm => (cm.sourceAdviceIds || []).forEach(aid => {
    const owner = adviceOwner[aid];
    if (owner) adopted[owner] = (adopted[owner] || 0) + 1;
  }));

  return rosterMembers(members)
    .map(m => ({ member: m, given: given[m.id] || 0, adopted: adopted[m.id] || 0 }))
    .filter(r => r.given > 0 || r.adopted > 0)
    .sort((a, b) => (b.adopted - a.adopted) || (b.given - a.given));
}

// ---------------------------------------------------------------------
// 招募 pipeline
// 行业冲突只是提前预警（软提示），不硬拦 —— 现在占位的人明年未必续会。
// ---------------------------------------------------------------------
export function prospectIndustryClash(prospect, members) {
  const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!norm(prospect.industry)) return null;
  const clash = members.find(m =>
    m.status === 'active' && !isDirector(m) && norm(m.industry) === norm(prospect.industry)
  );
  return clash ? `行业与在册会员 ${clash.name}（${clash.company}）重复 —— 除非那位出局或不续会，否则进不了这一桌。` : null;
}

// ---------------------------------------------------------------------
// 承诺
// ---------------------------------------------------------------------
export function dueDateFor(sessionDate) {
  return addDays(sessionDate || todayISO(), TABLE.commitmentDays);
}

/** 下一场开场第一件事：拉出所有未结承诺 */
export function openCommitments(commitments, beforeSessionId = null) {
  return commitments
    .filter(c => c.status === 'open' && (!beforeSessionId || c.sessionId !== beforeSessionId))
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
}

export function commitmentsOf(commitments, memberId) {
  return commitments
    .filter(c => c.memberId === memberId)
    .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''));
}

// ---------------------------------------------------------------------
// 看板 —— 规格第 7 节，全部自动算，不手工统计
// ---------------------------------------------------------------------
export function computeMetrics({ members, sessions, cases, commitments }) {
  const closed = sessions.filter(s => s.status === 'closed');

  // 出席率 = present / (在桌人数 × 场次)
  // 分母按「每场当时记录了状态的在桌会员」算，避免中途加入的人拖低历史数字。
  let presentTotal = 0;
  let slotTotal = 0;
  closed.forEach(s => {
    const marks = s.attendance || {};
    const ids = Object.keys(marks).filter(id => {
      const m = memberById(members, id);
      return m && !isDirector(m);
    });
    slotTotal += ids.length;
    presentTotal += ids.filter(id => marks[id] === 'present').length;
  });
  const attendanceRate = slotTotal > 0 ? presentTotal / slotTotal : null;

  // 续会率 = 续费会员 / 上年度会员
  const thisYear = new Date().getFullYear();
  const lastYearCohort = members.filter(m =>
    !isDirector(m) && m.joinedAt && new Date(m.joinedAt).getFullYear() < thisYear
  );
  const renewed = lastYearCohort.filter(m => m.renewalStatus === 'renewed');
  const renewalRate = lastYearCohort.length > 0 ? renewed.length / lastYearCohort.length : null;

  // 承诺达成率 = done / 总承诺
  const done = commitments.filter(c => c.status === 'done').length;
  const commitmentRate = commitments.length > 0 ? done / commitments.length : null;

  return {
    attendanceRate,
    attendanceDetail: { present: presentTotal, slots: slotTotal, sessions: closed.length },
    renewalRate,
    renewalDetail: { renewed: renewed.length, cohort: lastYearCohort.length },
    caseCount: cases.length,
    commitmentRate,
    commitmentDetail: {
      done,
      missed: commitments.filter(c => c.status === 'missed').length,
      open: commitments.filter(c => c.status === 'open').length,
      total: commitments.length,
    },
    seatedCount: seatedMembers(members).length,
    pendingCount: pendingMembers(members).length,
    closedSessions: closed.length,
  };
}

/** 三个成败判定数是否全达标 —— 不全达标就修流程再跑一轮，不开第二桌 */
export function pilotVerdict(metrics) {
  const checks = [
    { key: 'attendanceRate', ok: metrics.attendanceRate !== null && metrics.attendanceRate >= METRIC_TARGETS.attendanceRate.target },
    { key: 'renewalRate',    ok: metrics.renewalRate !== null && metrics.renewalRate >= METRIC_TARGETS.renewalRate.target },
    { key: 'caseCount',      ok: metrics.caseCount >= METRIC_TARGETS.caseCount.target },
  ];
  const measurable = metrics.attendanceRate !== null || metrics.renewalRate !== null || metrics.caseCount > 0;
  return {
    checks,
    allPass: checks.every(c => c.ok),
    measurable,
  };
}

// ---------------------------------------------------------------------
// 提醒 —— 规格第 6 节
//
// 没有服务器，所以这里算出「今天该发什么」，桌长一键复制去 WhatsApp。
// 每条提醒带 copyText，就是发出去的原文，不用再打字。
// ---------------------------------------------------------------------
export function buildReminders({ members, sessions, cases, commitments }, today = todayISO()) {
  const out = [];
  const push = (r) => out.push({ id: `${r.kind}_${r.refId}`, ...r });

  // 1) 会前 7 天 / 1 天 → 向全体会员发出席确认
  sessions.filter(s => s.status === 'scheduled').forEach(s => {
    const d = daysUntil(s.date, today);
    if (d === 7 || d === 1) {
      const names = seatedMembers(members).map(m => m.name).join('、');
      push({
        kind: 'attendance-confirm', refId: s.id, level: d === 1 ? 'urgent' : 'normal',
        title: `会前 ${d} 天 · 出席确认`,
        detail: `${fmtDate(s.date)} 的场次，向全体会员发出席确认。`,
        audience: names,
        copyText: `【PUMM ROUNDTABLE】提醒：${fmtDate(s.date)} 我们这个月的桌聚。请回复「到」或「请假」。\n开场第一件事是承诺复盘，请先想好上个月那件事做到了没有。`,
      });
    }
  });

  // 2) 会后当天 Case Record 未填 → 提醒记录员
  sessions.filter(s => s.status !== 'scheduled').forEach(s => {
    const d = daysUntil(s.date, today);
    if (d > 0) return;                       // 还没开
    const filed = cases.filter(c => c.sessionId === s.id);
    const missing = (s.presenterIds || []).filter(pid =>
      !filed.some(c => c.presenterId === pid && c.problemStatement?.trim())
    );
    if (missing.length > 0) {
      push({
        kind: 'case-missing', refId: s.id, level: d === 0 ? 'normal' : 'urgent',
        title: 'Case Record 未填',
        detail: `${fmtDate(s.date)} 场次还有 ${missing.length} 位案主的 1 页记录没归档：${missing.map(id => memberName(members, id)).join('、')}。`,
        audience: '记录员',
        copyText: `【PUMM】${fmtDate(s.date)} 那场的 Case Record 还没填完（${missing.map(id => memberName(members, id)).join('、')}）。麻烦今天补上，留证是 TABLE 的最后一步。`,
      });
    }
  });

  // 3) 承诺到期前 3 天 → 提醒案主
  commitments.filter(c => c.status === 'open').forEach(c => {
    const d = daysUntil(c.dueDate, today);
    if (d === null) return;
    if (d <= 3) {
      const who = memberName(members, c.memberId);
      push({
        kind: 'commitment-due', refId: c.id, level: d < 0 ? 'urgent' : 'normal',
        title: d < 0 ? `承诺已过期 ${-d} 天` : d === 0 ? '承诺今天到期' : `承诺还有 ${d} 天到期`,
        detail: `${who}：${c.content}`,
        audience: who,
        copyText: `【PUMM】${who}，你在上一场锁的这件事 ${fmtDate(c.dueDate)} 到期：\n「${c.content}」\n下一场开场第一件事就是查这个。做完了吗？`,
      });
    }
  });

  // 4) 同一会员缺席第 2 次 → 通知桌长
  membersAtRisk(members, sessions).forEach(({ member, count }) => {
    push({
      kind: 'absence-risk', refId: member.id, level: 'urgent',
      title: `无故缺席 ${count} 次`,
      detail: `${member.name}（${member.company}）已累计 ${count} 次无故缺席。桌规是 2 次自动出局 —— 请桌长确认。`,
      audience: '桌长',
      copyText: `【PUMM 内部】${member.name} 已累计 ${count} 次无故缺席，按桌规该出局。桌长请决定：谈一次，还是执行出局。`,
    });
  });

  // 5) 年费到期前 30 天 → 提醒续会
  members.filter(m => m.status === 'active' && !isDirector(m) && m.feeDueDate).forEach(m => {
    const d = daysUntil(m.feeDueDate, today);
    if (d !== null && d <= 30 && m.renewalStatus !== 'renewed') {
      push({
        kind: 'fee-renewal', refId: m.id, level: d < 0 ? 'urgent' : 'normal',
        title: d < 0 ? `年费已过期 ${-d} 天` : `年费 ${d} 天后到期`,
        detail: `${m.name}（${m.company}）年费 ${fmtDate(m.feeDueDate)} 到期。`,
        audience: m.name,
        copyText: `【PUMM】${m.name}，你这一年的桌位 ${fmtDate(m.feeDueDate)} 到期。续会名额我先给你留着，这周给我个准话就行。`,
      });
    }
  });

  const order = { urgent: 0, normal: 1 };
  return out.sort((a, b) => (order[a.level] - order[b.level]) || a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------------
// 案例导出 —— 「1 页 Case Record」
// 权限由调用方把关（can(role,'exportCase')），这里只管排版。
// ---------------------------------------------------------------------
export function caseToText(kase, { members, session }) {
  const presenter = memberById(members, kase.presenterId);
  const lines = [];
  lines.push('PUMM ROUNDTABLE · CASE RECORD');
  lines.push('—'.repeat(32));
  lines.push(`场次：${fmtDate(session?.date)}`);
  lines.push(`案主：${presenter ? `${presenter.name}（${presenter.company}）` : '—'}`);
  lines.push(`行业：${presenter?.industry || '—'}`);
  lines.push('');
  lines.push('【问题 · 一句话】');
  lines.push(kase.problemStatement || '—');
  lines.push('');
  lines.push(`【只提问 ${(kase.questions || []).length} 问】`);
  (kase.questions || []).forEach((q, i) => {
    lines.push(`${i + 1}. ${q.text}　—— ${memberName(members, q.askerId)}`);
  });
  lines.push('');
  lines.push(`【同桌老板给的建议 ${(kase.advices || []).length} 条】`);
  (kase.advices || []).forEach((a, i) => {
    lines.push(`${i + 1}. ${a.text}　—— ${memberName(members, a.advisorId)}`);
  });
  lines.push('');
  lines.push('【锁诺 · 30 天 1 件事】');
  lines.push(kase.commitmentText || '—');
  if (kase.commitmentDue) lines.push(`到期：${fmtDate(kase.commitmentDue)}`);
  lines.push('');
  lines.push('— 老板帮老板。给建议的全是同桌的老板，不是顾问。');
  return lines.join('\n');
}

/** 招募素材：抽掉公司名与人名的匿名版 */
export function caseToStoryText(kase, { members, session }) {
  const presenter = memberById(members, kase.presenterId);
  const lines = [];
  lines.push(`【一张桌，一个问题】${presenter?.industry || '某行业'}老板的 30 天`);
  lines.push('');
  lines.push(`他带上桌的问题只有一句话：${kase.problemStatement || '—'}`);
  lines.push('');
  lines.push(`同桌 ${(kase.advices || []).length} 位非同业的老板，一人给了一条建议：`);
  (kase.advices || []).slice(0, 5).forEach(a => {
    const advisor = memberById(members, a.advisorId);
    lines.push(`· ${advisor?.industry || '同桌'}的老板说：${a.text}`);
  });
  lines.push('');
  lines.push(`他当场锁了一件事，30 天：${kase.commitmentText || '—'}`);
  lines.push(`下一场开场第一件事，就是查这个。（${fmtDate(session?.date)}）`);
  lines.push('');
  lines.push('PUMM ROUNDTABLE — 老板帮老板。10 位非同业老板，一张桌，每月一次。');
  return lines.join('\n');
}

export function toCSV(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}

export function download(filename, text, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([`﻿${text}`], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Safari / 非 HTTPS 场景的兜底
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
}

// ---------------------------------------------------------------------
// 全年排期 —— 年初一次排好
// ---------------------------------------------------------------------
/**
 * 从起始日期起，每月同一「第 N 个星期 X」生成 count 场。
 * 用「第 3 个星期五」这种规则而不是「每月 15 号」，是因为桌聚要固定在
 * 老板们好排开的工作日，日期漂移一两天没关系，星期不能漂。
 */
export function generateYearDates(startDate, count = 12) {
  const start = new Date(`${startDate}T00:00:00`);
  const weekday = start.getDay();
  const nth = Math.ceil(start.getDate() / 7);
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const firstWeekday = d.getDay();
    let day = 1 + ((weekday - firstWeekday + 7) % 7) + (nth - 1) * 7;
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    while (day > daysInMonth) day -= 7;      // 该月没有第 5 个星期 X 就退到第 4 个
    const dd = new Date(d.getFullYear(), d.getMonth(), day);
    out.push(dd.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * 案主排序：谁最久没上桌，谁先上。
 * 让桌长点「自动排」就有合理默认值，不用自己记谁讲过。
 */
export function suggestPresenters(members, sessions, cases, count = 2) {
  const lastPresented = {};
  sessions.forEach(s => {
    (s.presenterIds || []).forEach(pid => {
      if (!lastPresented[pid] || s.date > lastPresented[pid]) lastPresented[pid] = s.date;
    });
  });
  return seatedMembers(members)
    .slice()
    .sort((a, b) => {
      const da = lastPresented[a.id] || '';
      const db = lastPresented[b.id] || '';
      if (da !== db) return da.localeCompare(db);   // 空字串排最前 = 从没上过桌
      return (a.joinedAt || '').localeCompare(b.joinedAt || '');
    })
    .slice(0, count)
    .map(m => m.id);
}

// ---------------------------------------------------------------------
// Case Record → 分享长图（WhatsApp 直接发）。
// 不用第三方库：Canvas 手绘排版，中文按字符折行。
// ---------------------------------------------------------------------
export function caseToImageBlob(kase, { members, session }) {
  const presenter = memberById(members, kase.presenterId);
  const W = 900, PAD = 56, LINE = 40, SMALL = 32;
  const wrap = (ctx, text, maxW) => {
    const out = [];
    let line = '';
    for (const ch of String(text || '—')) {
      if (ch === '\n') { out.push(line); line = ''; continue; }
      if (ctx.measureText(line + ch).width > maxW) { out.push(line); line = ch; }
      else line += ch;
    }
    if (line) out.push(line);
    return out;
  };

  // 先量高再画
  const measure = document.createElement('canvas').getContext('2d');
  const blocks = [];
  const addBlock = (label, text, opts = {}) => blocks.push({ label, text, ...opts });

  addBlock(null, 'PUMM ROUNDTABLE · CASE RECORD', { title: true });
  addBlock(null, `${fmtDate(session?.date)}　${presenter ? `${presenter.name} · ${presenter.industry}` : ''}`, { sub: true });
  addBlock('问题 · 一句话', kase.problemStatement);
  addBlock(`只提问（${(kase.questions || []).length}）`,
    (kase.questions || []).map((q, i) => `${i + 1}. ${q.text} —— ${memberName(members, q.askerId)}`).join('\n'));
  addBlock(`同桌老板给的建议（${(kase.advices || []).length}）`,
    (kase.advices || []).map((a, i) => `${i + 1}. ${a.text} —— ${memberName(members, a.advisorId)}`).join('\n'));
  addBlock('锁诺 · 30 天 1 件事',
    `${kase.commitmentText || '—'}${kase.commitmentDue ? `\n到期：${fmtDate(kase.commitmentDue)}` : ''}`);
  addBlock(null, '老板帮老板 —— 给建议的全是同桌的老板，不是顾问。', { footer: true });

  let h = PAD;
  const layout = [];
  for (const b of blocks) {
    const fontBody = b.title ? 'bold 40px sans-serif' : b.sub ? '28px sans-serif' : b.footer ? '26px sans-serif' : '30px sans-serif';
    measure.font = fontBody;
    const lines = wrap(measure, b.text, W - PAD * 2);
    layout.push({ ...b, lines, fontBody });
    if (b.label) h += SMALL + 8;
    h += lines.length * LINE + (b.title || b.sub ? 12 : 28);
  }
  h += PAD;

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#F6F4EF';
  ctx.fillRect(0, 0, W, h);
  ctx.fillStyle = '#23303D';
  ctx.fillRect(0, 0, W, 10);

  let y = PAD + 8;
  for (const b of layout) {
    if (b.label) {
      ctx.font = 'bold 24px sans-serif';
      ctx.fillStyle = '#B08D4F';
      ctx.fillText(b.label, PAD, y);
      y += SMALL + 8;
    }
    ctx.font = b.fontBody;
    ctx.fillStyle = b.sub || b.footer ? '#585B60' : '#17181A';
    for (const line of b.lines) {
      ctx.fillText(line, PAD, y);
      y += LINE;
    }
    y += b.title || b.sub ? 12 : 28;
  }

  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

/** 分享长图：手机上直接进 WhatsApp 分享面板，电脑上退化为下载 PNG */
export async function shareCaseImage(kase, ctxData, filename) {
  const blob = await caseToImageBlob(kase, ctxData);
  if (!blob) return false;
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return true; } catch { /* 用户取消 */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  return true;
}

export const roleMeta = (role) => ROLES[role] || ROLES.member;
export const attendanceMeta = (s) => ATTENDANCE_STATUS[s] || { label: '未记录', color: '#7C8087', short: '—' };
export const commitmentMeta = (s) => COMMITMENT_STATUS[s] || COMMITMENT_STATUS.open;
export const phaseMinutes = (key) => SESSION_PHASES.find(p => p.key === key)?.minutes || 0;
