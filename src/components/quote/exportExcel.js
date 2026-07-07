import { CATEGORIES, fmtMYR } from '../../constants/pricing.js';
import { fmt } from '../../utils/helpers.js';

const isPieceUom = (uom) => /套|樘|项|set|pc|item/i.test(uom || '');
const round0 = (n) => Math.round(Number(n) || 0);

// 导出为 Excel（.xlsx）—— 版式对应报价单：客户信息 + 各区域明细 + 汇总 + 条款。
// 用动态 import 加载 xlsx，避免拖大首屏体积。
export async function exportExcel(meta, computed) {
  const XLSX = await import('xlsx');
  const aoa = [];
  const merges = [];
  const row = (arr = []) => { aoa.push(arr); return aoa.length - 1; };

  // ---- 抬头 ----
  row(['SAIL BY RICCIONE REKA']);
  row(['Estimated Quotation 预估报价']);
  row([]);
  row(['Name 客户', meta.name || '', '', 'Date 日期', fmt(meta.date)]);
  row(['Location 地点', meta.location || '', '', 'Ref 编号', meta.ref || '']);
  row(['PIC 负责人', meta.pic || '']);
  row([]);

  const HEAD = ['Description 项目', 'Qty 数量', 'UOM 单位', 'Unit Price RM 单价', 'Amount RM 金额'];

  computed.zoneResults.forEach((zr) => {
    if (!zr.zone.items.length) return;
    const zr0 = row([zr.zone.name || 'Untitled 未命名']);
    merges.push({ s: { r: zr0, c: 0 }, e: { r: zr0, c: 4 } });
    row(HEAD);
    zr.items.forEach((ir) => {
      ir.lines.forEach((ln, i) => {
        const label = (i === 0 && (ir.item.name || ir.item.desc))
          ? `${ir.item.name || ir.item.desc} · ${ln.desc}` : ln.desc;
        const qty = isPieceUom(ln.uom) ? round0(ln.qty) : Number(ln.qty.toFixed(2));
        row([label, qty, ln.uom, round0(ln.unitMyr), round0(ln.total)]);
      });
    });
    row(['', '', '', 'Sub-Total 小计', round0(zr.subtotal)]);
    row([]);
  });

  // ---- 汇总 ----
  row(['', '', '', 'Gross 合计', round0(computed.gross)]);
  if (computed.discount > 0) row(['', '', '', 'Discount 折扣', -round0(computed.discount)]);
  row(['', '', '', 'Total 预估总额', round0(computed.net)]);
  row([]);

  // ---- 条款 ----
  row(['Validity 报价有效期']);
  row(['Quotation is valid for 14 days from the date of quotation. 报价自出具日期起 14 天内有效。']);
  row(['Disclaimer 声明']);
  row(['Prices are subject to change based on final design confirmation, material selection, and site conditions.']);
  row(['最终价格将根据设计确认、材质选择及现场状况进行调整。']);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  ws['!cols'] = [{ wch: 40 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Quotation');

  const safe = (s) => (s || '').replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, '_');
  const name = `Quotation_${safe(meta.name) || 'Customer'}_${(meta.date || '').replace(/-/g, '') || 'draft'}.xlsx`;
  XLSX.writeFile(wb, name);
}
