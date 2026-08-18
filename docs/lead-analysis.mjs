#!/usr/bin/env node
// =====================================================================
// Lead funnel analysis — 把 CRM 的 Leads 导出跑成一份转化诊断
//
//   node docs/lead-analysis.mjs Sail_Leads.csv
//
// 字段容错：同时认得 CRM 导出的列名（Source / Stage / Quotation (RM)）
// 和 CRM 内部的原始字段名（leadSource / salesStage / quotationAmount）。
// 认不出来的列会在开头列出来，方便对齐。
// =====================================================================

import { readFileSync } from 'node:fs';

// ---------- CSV ----------
// 手写解析而不是引依赖：这个脚本要能在任何人的机器上直接跑。
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map(h => h.trim());
  return rows
    .filter(r => r.some(v => v.trim()))
    .map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// ---------- 字段映射 ----------
const ALIASES = {
  source:   ['Source', 'leadSource', 'Lead Source'],
  stage:    ['Stage', 'salesStage', 'Sales Stage'],
  amount:   ['Quotation (RM)', 'quotationAmount', 'Quotation', 'Amount'],
  client:   ['Client', 'clientName', 'Client Name', 'Name'],
  type:     ['Type', 'clientType', 'Client Type'],
  pic:      ['PIC', 'pic'],
  payment:  ['Payment', 'paymentInfo', 'Payment Info'],
  decision: ['Decision Maker', 'isDecisionMaker'],
  first:    ['First Contact', 'firstContactedDate', 'First Contacted'],
  updated:  ['Last Updated', 'updatedAt', 'date'],
  entered:  ['Stage Entered', 'stageEnteredAt'],
  reason:   ['Drop Reason', 'dropReason', 'Loss Reason'],
};

const pick = (row, key) => {
  for (const a of ALIASES[key]) if (row[a] !== undefined && row[a] !== '') return row[a];
  return '';
};

// ---------- 业务规则（对齐 crm/src/constants.js）----------
const WON_STAGES = [
  'Stage 4: Order & Start Production',
  'Stage 5: Shipping', 'Stage 5: Shipping & Installation',
  'Stage 6: Installation', 'Stage 6: Complete',
  'Stage 7: Complete',
];
const DESIGN_STAGE = 'Stage 3: Design';
const DROPPED = 'Dropped';

const money = v => Number(String(v).replace(/[^0-9.-]/g, '')) || 0;
const rm = n => 'RM ' + n.toLocaleString('en-MY');
const pct = (a, b) => b ? (a / b * 100).toFixed(0) + '%' : '—';
const days = (a, b) => {
  const x = new Date(a), y = new Date(b);
  return isNaN(x) || isNaN(y) ? null : Math.round((y - x) / 86400000);
};

// ---------- main ----------
const file = process.argv[2];
if (!file) {
  console.error('用法: node docs/lead-analysis.mjs <leads.csv>');
  process.exit(1);
}

const leads = parseCSV(readFileSync(file, 'utf8'));
if (!leads.length) { console.error('没读到任何 lead。'); process.exit(1); }

const isWon = l => WON_STAGES.includes(pick(l, 'stage'));
const isDropped = l => pick(l, 'stage') === DROPPED;

const H = s => `\n${'='.repeat(64)}\n${s}\n${'='.repeat(64)}`;

console.log(H(`LEAD 转化诊断 — ${leads.length} 条`));

// 未识别的列，先讲清楚，免得默默算错
const known = new Set(Object.values(ALIASES).flat());
const unknown = Object.keys(leads[0]).filter(k => !known.has(k));
if (unknown.length) console.log(`\n未纳入分析的列: ${unknown.join(', ')}`);
for (const [k, v] of Object.entries(ALIASES)) {
  if (!leads.some(l => pick(l, k))) console.log(`⚠ 缺字段「${k}」— 找不到 ${v.join(' / ')} 任何一列，相关分析会跳过`);
}

// ---- 1. 渠道表现 ----
console.log(H('1. 渠道表现'));
const bySource = {};
for (const l of leads) {
  const k = pick(l, 'source') || '(未填)';
  const s = bySource[k] ??= { n: 0, won: 0, dropped: 0, wonV: 0, openV: 0 };
  s.n++;
  if (isWon(l)) { s.won++; s.wonV += money(pick(l, 'amount')); }
  else if (isDropped(l)) s.dropped++;
  else s.openV += money(pick(l, 'amount'));
}
const totalWonV = Object.values(bySource).reduce((a, s) => a + s.wonV, 0);
console.log('\n来源'.padEnd(22) + 'Leads'.padStart(6) + '成交'.padStart(6) + '输单'.padStart(6) +
            '转化'.padStart(8) + '成交额'.padStart(14) + '占比'.padStart(7) + '在跑报价'.padStart(14));
for (const [k, s] of Object.entries(bySource).sort((a, b) => b[1].n - a[1].n)) {
  console.log(k.padEnd(22) + String(s.n).padStart(6) + String(s.won).padStart(6) +
    String(s.dropped).padStart(6) + pct(s.won, s.n).padStart(8) +
    rm(s.wonV).padStart(14) + pct(s.wonV, totalWonV).padStart(7) + rm(s.openV).padStart(14));
}
const top = Object.entries(bySource).sort((a, b) => b[1].wonV - a[1].wonV)[0];
if (top && totalWonV && top[1].wonV / totalWonV > 0.5)
  console.log(`\n⚠ 集中风险：「${top[0]}」一个来源占了 ${pct(top[1].wonV, totalWonV)} 的成交额。`);

// ---- 2. Stage 分布 ----
console.log(H('2. Stage 分布'));
const byStage = {};
for (const l of leads) {
  const k = pick(l, 'stage') || '(未填)';
  (byStage[k] ??= { n: 0, v: 0 }).n++;
  byStage[k].v += money(pick(l, 'amount'));
}
for (const [k, s] of Object.entries(byStage).sort())
  console.log(k.padEnd(42) + String(s.n).padStart(4) + rm(s.v).padStart(14));

// ---- 3. 设计阶段：谁付过钱 ----
console.log(H('3. Stage 3 设计阶段 — 谁付过钱？'));
const design = leads.filter(l => pick(l, 'stage') === DESIGN_STAGE);
if (!design.length) console.log('没有 lead 在设计阶段。');
else {
  let unpaid = 0, unpaidV = 0;
  for (const l of design) {
    const paid = pick(l, 'payment');
    if (!paid) { unpaid++; unpaidV += money(pick(l, 'amount')); }
    console.log(`${(pick(l, 'client') || '?').padEnd(22)}${rm(money(pick(l, 'amount'))).padStart(13)}  ` +
                `${paid ? '已付: ' + paid : '★ 未付任何款项'}`);
  }
  console.log(`\n→ ${design.length} 套设计中，${unpaid} 套是免费出的（对应报价 ${rm(unpaidV)}）。`);
}

// ---- 4. 输单记录 ----
console.log(H('4. 输单记录'));
const dropped = leads.filter(isDropped);
if (!dropped.length) {
  console.log('★ 一条 Dropped 记录都没有。');
  console.log('  → 转化率无法被真实测量：流失的客人没有进入分母，只是卡在中间 stage。');
} else {
  const byReason = {};
  for (const l of dropped) byReason[pick(l, 'reason') || '(未填原因)'] = (byReason[pick(l, 'reason') || '(未填原因)'] || 0) + 1;
  console.log(`共 ${dropped.length} 条输单（占全部 ${pct(dropped.length, leads.length)}）：`);
  for (const [r, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1]))
    console.log(`  ${r.padEnd(28)}${String(n).padStart(4)}  ${pct(n, dropped.length)}`);
}

// ---- 5. 决策人 ----
console.log(H('5. 决策人字段填写率'));
const dm = leads.filter(l => pick(l, 'decision')).length;
console.log(`已填 ${dm} / ${leads.length}（${pct(dm, leads.length)}）`);
if (dm / leads.length < 0.5)
  console.log('★ 超过一半的 lead 不知道对面是不是签字的人 — 大额定制生意里，这是「太贵了」的常见来源。');

// ---- 6. 报价分布 ----
console.log(H('6. 报价金额分布'));
const q = leads.map(l => money(pick(l, 'amount'))).filter(x => x > 0).sort((a, b) => a - b);
if (!q.length) console.log('没有报价金额。');
else {
  const sum = q.reduce((a, b) => a + b, 0);
  console.log(`有报价 ${q.length} 条 | 最低 ${rm(q[0])} | 中位 ${rm(q[Math.floor(q.length / 2)])} | ` +
              `均值 ${rm(Math.round(sum / q.length))} | 最高 ${rm(q[q.length - 1])}`);
}

// ---- 7. 停留时长 ----
console.log(H('7. 停留时长（需要 首次接触 / 最后更新 两个字段）'));
const aged = leads
  .map(l => ({ name: pick(l, 'client'), stage: pick(l, 'stage'), d: days(pick(l, 'first'), pick(l, 'updated')) }))
  .filter(x => x.d !== null);
if (!aged.length) {
  console.log('★ 导出里没有日期字段，算不出停留时长。');
  console.log('  → 需要在 crm/src/utils.js 的 leadToRow() 补上 firstContactedDate 和 stageEnteredAt。');
} else {
  const stale = aged.filter(x => x.d > 90 && !WON_STAGES.includes(x.stage) && x.stage !== DROPPED);
  const wonAges = aged.filter(x => WON_STAGES.includes(x.stage)).map(x => x.d);
  if (wonAges.length)
    console.log(`成交单平均周期：${Math.round(wonAges.reduce((a, b) => a + b, 0) / wonAges.length)} 天`);
  console.log(`\n卡超过 90 天还没结论的 lead：${stale.length} 条`);
  for (const x of stale.sort((a, b) => b.d - a.d).slice(0, 15))
    console.log(`  ${String(x.d).padStart(4)}天  ${(x.name || '?').padEnd(22)}${x.stage}`);
  if (stale.length) console.log('\n  → 这些要么推进，要么标 Dropped + 填原因。挂着不算 pipeline。');
}

console.log('\n' + '='.repeat(64));
console.log('诊断与破局方向见 docs/GROWTH-DIAGNOSIS.md');
console.log('='.repeat(64) + '\n');
