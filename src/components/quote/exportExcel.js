import { tr, pickLang, capColor, cabTypeById, RLBL, QUOTE_TERMS } from '../../constants/pricing.js';
import { fmt } from '../../utils/helpers.js';

const round0 = (n) => Math.round(Number(n) || 0);

// 导出为 Excel（.xlsx）。lang：'en' | 'zh' | 'both'。
// Sheet1：定制橱柜（SAIL by Riccione Reka）；Sheet2：Loose Furniture（Riccione Furniture）。
export async function exportExcel(meta, computed, loose, notes = {}, lang = 'both') {
  const XLSX = await import('xlsx');
  const t = (obj) => tr(obj, lang);
  const lineDesc = (ln) => (lang === 'en' ? ln.descEn : lang === 'zh' ? ln.descZh : `${ln.descEn} ${ln.descZh}`);
  const lineUom = (ln) => (lang === 'en' ? ln.uomEn : lang === 'zh' ? ln.uomZh : ln.uomZh);
  // 定制柜体子项描述：门板/柜体 → "Door: A Series"；抽屉 → "Drawers"
  const cabLineLabel = (ln) => {
    const sid = (ln.descEn.split(' ')[1] || '').trim();
    const map = {
      door:    { en: `Door: ${sid} Series`,         zh: `门板：${sid} 系列` },
      carcass: { en: `Carcass: ${sid} Series`,      zh: `柜体：${sid} 系列` },
      open:    { en: `Open Cabinet: ${sid} Series`, zh: `开放柜：${sid} 系列` },
      drawer:  { en: 'Blum Full Extension Drawer',  zh: 'Blum 全展抽屉' },
    };
    return map[ln.bucket] ? t(map[ln.bucket]) : lineDesc(ln);
  };

  const termLines = (terms, aoa) => {
    terms.forEach((sec) => {
      aoa.push([t(sec.title)]);
      sec.lines.forEach((ln) => {
        const text = lang === 'both' ? `${ln.en}　${ln.zh}` : t(ln);
        aoa.push([(sec.bullet ? '• ' : '') + text]);
      });
      if (sec.note) aoa.push([lang === 'both' ? `${sec.note.en}　${sec.note.zh}` : t(sec.note)]);
      aoa.push([]);
    });
  };

  const wb = XLSX.utils.book_new();

  // ---------- Sheet 1：定制橱柜 ----------
  const zones = computed.zoneResults.filter((zr) => zr.zone.items.length > 0);
  if (zones.length) {
    const aoa = [];
    const merges = [];
    const row = (arr = []) => { aoa.push(arr); return aoa.length - 1; };
    row(['SAIL BY RICCIONE REKA']);
    row([t(RLBL.estQuote)]);
    row([]);
    row([t(RLBL.name), meta.name || '', '', t(RLBL.date), fmt(meta.date)]);
    row([t(RLBL.site), meta.location || '', '', t(RLBL.ref), meta.ref || '']);
    row([t(RLBL.pic), meta.pic || '', '', t(RLBL.rev), meta.version || '1']);
    row([]);
    const HEAD = [t(RLBL.desc), t(RLBL.qty), t(RLBL.uom), t(RLBL.unitPrice), t(RLBL.amount)];
    zones.forEach((zr) => {
      const zr0 = row([pickLang(zr.zone.name, lang) || t(RLBL.untitled)]);
      merges.push({ s: { r: zr0, c: 0 }, e: { r: zr0, c: 4 } });
      row(HEAD);
      zr.items.forEach((ir) => {
        if (ir.item.type === 'cabinet') {
          // 柜体类型（+名称）作为分组抬头，子项缩进列在下面
          const typeLabel = pickLang(cabTypeById(ir.item.cabType).label, lang);
          const nm = pickLang(ir.item.name || ir.item.desc || '', lang);
          row([[typeLabel, nm].filter(Boolean).join(' · ')]);
          ir.lines.forEach((ln) => {
            const qty = ln.piece ? round0(ln.qty) : Number(ln.qty.toFixed(2));
            row([`    ${cabLineLabel(ln)}`, qty, lineUom(ln), round0(ln.unitMyr), round0(ln.total)]);
          });
        } else {
          ir.lines.forEach((ln, i) => {
            const nm = i === 0 ? pickLang(ir.item.name || ir.item.desc || '', lang) : '';
            const label = nm ? `${nm} · ${lineDesc(ln)}` : lineDesc(ln);
            const qty = ln.piece ? round0(ln.qty) : Number(ln.qty.toFixed(2));
            row([label, qty, lineUom(ln), round0(ln.unitMyr), round0(ln.total)]);
          });
        }
      });
      row(['', '', '', t(RLBL.subtotal), round0(zr.subtotal)]);
      row([]);
    });
    row(['', '', '', t(RLBL.gross), round0(computed.gross)]);
    if (computed.discount > 0) row(['', '', '', `${t(RLBL.discount)} (${computed.adjustPct}%)${notes.discountNote ? ` — ${notes.discountNote}` : ''}`, -round0(computed.discount)]);
    row(['', '', '', t(RLBL.total), round0(computed.net)]);
    row([]);
    if (notes.cabinetNote) { row([t(RLBL.notes), notes.cabinetNote]); row([]); }
    termLines(QUOTE_TERMS, aoa);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = merges;
    ws['!cols'] = [{ wch: 44 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Quotation');
  }

  // ---------- Sheet 2：Loose Furniture ----------
  const looseRows = loose?.rows || [];
  if (looseRows.length) {
    const aoa = [];
    const row = (arr = []) => aoa.push(arr);
    row(['RICCIONE FURNITURE']);
    row([t(RLBL.estQuote)]);
    row([]);
    row([t(RLBL.name), meta.name || '', '', t(RLBL.date), fmt(meta.date)]);
    row([t(RLBL.site), meta.location || '', '', t(RLBL.rev), meta.version || '1']);
    row([]);
    row([t(RLBL.productType), t(RLBL.model), t(RLBL.color), t(RLBL.qty), t(RLBL.unitPrice), t(RLBL.amount)]);
    looseRows.forEach((r) => {
      row([r.type || '', r.model || '', capColor(r.color) || '', round0(r.qty), round0(r.unitMyr), round0(r.total)]);
    });
    row(['', '', '', '', t(RLBL.gross), round0(loose.gross)]);
    if (loose.discount > 0) row(['', '', '', '', `${t(RLBL.discount)} (${loose.adjustPct}%)${notes.looseDiscountNote ? ` — ${notes.looseDiscountNote}` : ''}`, -round0(loose.discount)]);
    row(['', '', '', '', t(RLBL.total), round0(loose.net)]);
    row([]);
    if (notes.looseNote) { row([t(RLBL.notes), notes.looseNote]); row([]); }
    termLines(QUOTE_TERMS.slice(0, 1), aoa); // 只放 Validity
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Loose Furniture');
  }

  if (!wb.SheetNames.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No items 暂无明细']]), 'Quotation');

  // 文件名：EST QUOTE_RICCIONE_[客户]_[Site]_YYYYMMDD.xlsx
  const safe = (s) => (s || '').replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, ' ');
  const d = (meta.date || '').replace(/-/g, '');
  const name = `EST QUOTE_RICCIONE_${safe(meta.name) || 'Customer'}_${safe(meta.location) || 'Site'}_${d || 'draft'}.xlsx`;
  XLSX.writeFile(wb, name);
}
