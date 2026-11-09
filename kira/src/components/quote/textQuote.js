// ============================================================
// WhatsApp / 复制文字报价（纯函数，Node 测试可直接 import）。lang：'en' | 'zh' | 'both'。
// 从 QuotationView.jsx 原样搬出；KIRA 积木柜的名称 / 简介按语言生成。
// ============================================================
import { tr, pickLang, fmtMYR, CATEGORIES, RLBL, QUOTE_TERMS, LOOSE_TERMS } from '../../constants/pricing.js';
import { cabinetTitle, cabinetSummary } from '../../planner/templates.js';

// ---- WhatsApp / 纯文本报价（按语言）----
export function buildTextQuote(meta, computed, loose, notes = {}, lang = 'both') {
  const t = (obj) => tr(obj, lang);
  const pl = (text) => pickLang(text, lang);
  const L = [];
  L.push(`📋 *${t(RLBL.estQuote)} · SAIL by Riccione Reka*`);
  L.push('━━━━━━━━━━━━━━━');
  if (meta.name) L.push(`👤 ${t(RLBL.name)}：${meta.name}`);
  if (meta.location) L.push(`📍 ${t(RLBL.site)}：${meta.location}`);
  L.push(`📄 ${t(RLBL.rev)}：${meta.version || '1'}`);
  L.push('');
  computed.zoneResults.forEach((zr) => {
    if (!zr.zone.items.length) return;
    L.push(`▪️ *${pl(zr.zone.name) || t(RLBL.untitled)}* — ${fmtMYR(zr.subtotal)}`);
    // KIRA：列出这个房间的积木柜（约数，房间小计以上面为准）
    (zr.zone.cabinets || []).forEach((c) => {
      const amt = zr.items.filter((ir) => ir.item.kira?.cabinetId === c.id).reduce((a, ir) => a + ir.total, 0);
      // 名称 / 简介按语言从结构化数据生成（EN 不夹中文、中文不夹英文）
      L.push(`   • ${c.code} ${cabinetTitle(c, lang)} · ${cabinetSummary(c, lang)} — ≈${fmtMYR(amt)}`);
    });
  });
  L.push('');
  L.push(`*${t({ en: 'Breakdown', zh: '分类明细' })}*`);
  CATEGORIES.forEach((c) => {
    const v = Math.round(computed.byCategory[c.key] || 0);
    if (v > 0) L.push(`  ${pl(c.label)}：${fmtMYR(v)}`);
  });
  L.push('');
  if (computed.discount > 0) {
    L.push(`${t(RLBL.gross)}：${fmtMYR(computed.gross)}`);
    L.push(`${t(RLBL.discount)}${computed.discountMode === 'amt' ? '' : ` (${computed.adjustPct}%)`}${computed.excluded > 0 ? ` · ${t(RLBL.noDiscExcl)}` : ''}${notes.discountNote ? ` — ${notes.discountNote}` : ''}：− ${fmtMYR(computed.discount)}`);
  }
  L.push(`*${t(RLBL.total)}：${fmtMYR(computed.net)}*`);
  if (notes.cabinetNote) L.push(`${t(RLBL.notes)}：${notes.cabinetNote}`);
  // Loose furniture 家具（Riccione Furniture）
  if (loose && loose.rows.length > 0) {
    L.push('');
    L.push(`🛋️ *${t(RLBL.looseSection)} · Riccione Furniture*`);
    loose.rows.forEach((r) => {
      const nm = [r.type, r.model, r.color].filter(Boolean).join(' ');
      L.push(`  ${nm || '-'} ×${Number(r.qty) || 0} — ${fmtMYR(r.total)}`);
    });
    if (loose.discount > 0) {
      L.push(`${t(RLBL.gross)}：${fmtMYR(loose.gross)}`);
      L.push(`${t(RLBL.discount)}${loose.discountMode === 'amt' ? '' : ` (${loose.adjustPct}%)`}${notes.looseDiscountNote ? ` — ${notes.looseDiscountNote}` : ''}：− ${fmtMYR(loose.discount)}`);
    }
    L.push(`*${t(RLBL.total)}：${fmtMYR(loose.net)}*`);
    if (notes.looseNote) L.push(`${t(RLBL.notes)}：${notes.looseNote}`);
  }
  L.push('━━━━━━━━━━━━━━━');
  const pushTerms = (terms) => terms.forEach((sec) => {
    L.push(t(sec.title));
    sec.lines.forEach((ln) => {
      L.push((sec.bullet ? '• ' : '') + (lang === 'both' ? `${ln.en}　${ln.zh}` : t(ln)));
    });
    if (sec.note) L.push(lang === 'both' ? `${sec.note.en}　${sec.note.zh}` : t(sec.note));
  });
  const hasCabTerms = computed.zoneResults.some((zr) => zr.zone.items.length);
  if (hasCabTerms) pushTerms(QUOTE_TERMS);
  if ((loose?.rows || []).length) {
    L.push(`[${t(RLBL.looseSection)}]`);
    pushTerms(hasCabTerms ? LOOSE_TERMS.slice(1) : LOOSE_TERMS); // 有效期已在上方就不重复
  }
  return L.join('\n');
}
