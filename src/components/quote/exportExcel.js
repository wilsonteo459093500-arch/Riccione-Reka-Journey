import { tr, pickLang, capColor, cabTypeById, RLBL, QUOTE_TERMS, discountChainRate, discountChainLabel } from '../../constants/pricing.js';
import { fmt } from '../../utils/helpers.js';

const round0 = (n) => Math.round(Number(n) || 0);

// 导出为 Excel（.xlsx）。lang：'en' | 'zh' | 'both'。
// Sheet1：定制橱柜（SAIL by Riccione Reka）；Sheet2：Loose Furniture（Riccione Furniture）。
export async function exportExcel(meta, computed, loose, notes = {}, lang = 'both') {
  const XLSX = await import('xlsx');
  const t = (obj) => tr(obj, lang);
  // 三种版本：retail / designer 双价 / designer_net 净价（每个单价都是供货价）
  const isDesigner = notes.audience === 'designer';
  const isDesignerNet = notes.audience === 'designer_net';
  const anyDesigner = isDesigner || isDesignerNet;
  const supplyRate = discountChainRate(notes.designerDisc);
  const supply = (retail) => Math.round((Number(retail) || 0) * supplyRate);
  const priceScale = isDesignerNet ? supplyRate : 1;
  const px = (v) => Math.round((Number(v) || 0) * priceScale);
  const discTag = discountChainLabel(notes.designerDisc);
  const supplyLbl = () => `${t({ en: 'Designer Supply', zh: '设计师供货价' })} (${discTag})`;
  const dTotalLbl = () => `${t({ en: 'Designer Total', zh: '设计师总额' })} (${discTag})`;
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
            row([`    ${cabLineLabel(ln)}`, qty, lineUom(ln), px(ln.unitMyr), px(ln.total)]);
          });
        } else {
          ir.lines.forEach((ln, i) => {
            const nm = i === 0 ? pickLang(ir.item.name || '', lang) : '';
            const label = nm ? `${nm} · ${lineDesc(ln)}` : lineDesc(ln);
            const qty = ln.piece ? round0(ln.qty) : Number(ln.qty.toFixed(2));
            row([label, qty, lineUom(ln), px(ln.unitMyr), px(ln.total)]);
          });
        }
      });
      row(['', '', '', t(RLBL.subtotal), px(zr.subtotal)]);
      row([]);
    });
    if (!anyDesigner) {
      row(['', '', '', t(RLBL.gross), round0(computed.gross)]);
      if (computed.discount > 0) row(['', '', '', `${t(RLBL.discount)}${computed.discountMode === 'amt' ? '' : ` (${computed.adjustPct}%)`}${notes.discountNote ? ` — ${notes.discountNote}` : ''}`, -round0(computed.discount)]);
    }
    const cabRetail = anyDesigner ? computed.gross : computed.net; // 设计师版按原价
    if (isDesignerNet) {
      row(['', '', '', dTotalLbl(), supply(cabRetail)]);
    } else {
      row(['', '', '', isDesigner ? t({ en: 'Retail Total', zh: '零售总额' }) : t(RLBL.total), round0(cabRetail)]);
      if (isDesigner) row(['', '', '', supplyLbl(), supply(cabRetail)]);
    }
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
      row([r.type || '', r.model || '', capColor(r.color) || '', round0(r.qty), px(r.unitMyr), px(r.total)]);
    });
    if (!anyDesigner) {
      row(['', '', '', '', t(RLBL.gross), round0(loose.gross)]);
      if (loose.discount > 0) row(['', '', '', '', `${t(RLBL.discount)}${loose.discountMode === 'amt' ? '' : ` (${loose.adjustPct}%)`}${notes.looseDiscountNote ? ` — ${notes.looseDiscountNote}` : ''}`, -round0(loose.discount)]);
    }
    const looseRetail = anyDesigner ? loose.gross : loose.net; // 设计师版按原价
    if (isDesignerNet) {
      row(['', '', '', '', dTotalLbl(), supply(looseRetail)]);
    } else {
      row(['', '', '', '', isDesigner ? t({ en: 'Retail Total', zh: '零售总额' }) : t(RLBL.total), round0(looseRetail)]);
      if (isDesigner) row(['', '', '', '', supplyLbl(), supply(looseRetail)]);
    }
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
  const name = `EST QUOTE_RICCIONE_${safe(meta.name) || 'Customer'}_${safe(meta.location) || 'Site'}_${d || 'draft'}${isDesignerNet ? '_DESIGNER_NET' : isDesigner ? '_DESIGNER' : ''}.xlsx`;
  XLSX.writeFile(wb, name);
}
