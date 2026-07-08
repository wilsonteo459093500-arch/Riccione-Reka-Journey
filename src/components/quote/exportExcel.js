import { tr, pickLang, RLBL, QUOTE_TERMS } from '../../constants/pricing.js';
import { fmt } from '../../utils/helpers.js';

const round0 = (n) => Math.round(Number(n) || 0);

// 导出为 Excel（.xlsx）—— 按 lang（'en' | 'zh' | 'both'）渲染，版式对应报价单。
// 用动态 import 加载 xlsx，避免拖大首屏体积。
export async function exportExcel(meta, computed, lang = 'both') {
  const XLSX = await import('xlsx');
  const t = (obj) => tr(obj, lang);
  const lineDesc = (ln) => (lang === 'en' ? ln.descEn : lang === 'zh' ? ln.descZh : `${ln.descEn} ${ln.descZh}`);
  const lineUom = (ln) => (lang === 'en' ? ln.uomEn : lang === 'zh' ? ln.uomZh : ln.uomZh);

  const aoa = [];
  const merges = [];
  const row = (arr = []) => { aoa.push(arr); return aoa.length - 1; };

  // ---- 抬头 ----
  row(['SAIL BY RICCIONE REKA']);
  row([t(RLBL.estQuote)]);
  row([]);
  row([t(RLBL.name), meta.name || '', '', t(RLBL.date), fmt(meta.date)]);
  row([t(RLBL.site), meta.location || '', '', t(RLBL.ref), meta.ref || '']);
  row([t(RLBL.pic), meta.pic || '', '', t(RLBL.rev), meta.version || '1']);
  row([]);

  const HEAD = [t(RLBL.desc), t(RLBL.qty), t(RLBL.uom), t(RLBL.unitPrice), t(RLBL.amount)];

  computed.zoneResults.forEach((zr) => {
    if (!zr.zone.items.length) return;
    const zr0 = row([pickLang(zr.zone.name, lang) || t(RLBL.untitled)]);
    merges.push({ s: { r: zr0, c: 0 }, e: { r: zr0, c: 4 } });
    row(HEAD);
    zr.items.forEach((ir) => {
      ir.lines.forEach((ln, i) => {
        const nm = (i === 0 && (ir.item.name || ir.item.desc)) ? pickLang(ir.item.name || ir.item.desc, lang) : '';
        const label = nm ? `${nm} · ${lineDesc(ln)}` : lineDesc(ln);
        const qty = ln.piece ? round0(ln.qty) : Number(ln.qty.toFixed(2));
        row([label, qty, lineUom(ln), round0(ln.unitMyr), round0(ln.total)]);
      });
    });
    row(['', '', '', t(RLBL.subtotal), round0(zr.subtotal)]);
    row([]);
  });

  // ---- 汇总 ----
  row(['', '', '', t(RLBL.gross), round0(computed.gross)]);
  if (computed.discount > 0) row(['', '', '', t(RLBL.discount), -round0(computed.discount)]);
  row(['', '', '', t(RLBL.total), round0(computed.net)]);
  row([]);

  // ---- 条款 ----
  QUOTE_TERMS.forEach((sec) => {
    row([t(sec.title)]);
    sec.lines.forEach((ln) => {
      const text = lang === 'both' ? `${ln.en}　${ln.zh}` : t(ln);
      row([(sec.bullet ? '• ' : '') + text]);
    });
    if (sec.note) row([lang === 'both' ? `${sec.note.en}　${sec.note.zh}` : t(sec.note)]);
    row([]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  ws['!cols'] = [{ wch: 44 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Quotation');

  const safe = (s) => (s || '').replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, '_');
  const rev = `Rev${meta.version || '1'}`;
  const name = `Quotation_${safe(meta.name) || 'Customer'}_${rev}_${(meta.date || '').replace(/-/g, '') || 'draft'}.xlsx`;
  XLSX.writeFile(wb, name);
}
